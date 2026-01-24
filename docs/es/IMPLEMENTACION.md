# Guía de Implementación

> **Idioma**: [English](../en/IMPLEMENTATION.md) | [Español](./IMPLEMENTACION.md)

**Guía paso a paso para implementar el Patrón ETL de Normalización de Datos con LLM**

## Visión General

Esta guía te lleva a través de la construcción de un pipeline de normalización de datos listo para producción usando Claude 3 Haiku via AWS Bedrock. Aprenderás cómo:

1. Configurar infraestructura AWS con SAM
2. Implementar la función Lambda con ingeniería de prompts
3. Construir un pipeline de post-procesamiento para corregir inconsistencias del LLM
4. Agregar validación estadística para monitoreo de calidad
5. Desplegar y probar en producción

**Tiempo estimado**: 4-6 horas (incluyendo pruebas)

## Prerrequisitos

- Cuenta AWS con acceso a Bedrock (solicitar acceso a Claude si es necesario)
- AWS CLI configurado con credenciales
- AWS SAM CLI instalado (`brew install aws-sam-cli` en macOS)
- Node.js 22.x o posterior
- Comprensión básica de Lambda, DynamoDB y EventBridge

## Paso 1: Configuración de Infraestructura (Template SAM)

### 1.1 Crear Template SAM

Crea `template.yaml` en la raíz de tu proyecto:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: ETL de Normalización de Datos con LLM

Globals:
  Function:
    Runtime: nodejs22.x
    Timeout: 300
    MemorySize: 512
    Environment:
      Variables:
        LEADS_TABLE: !Ref LeadsTable
        AWS_REGION: !Ref AWS::Region

Resources:
  # Tabla de configuración (opcional pero recomendada)
  NormalizationConfigTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: normalization-config
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: configId
          AttributeType: S
      KeySchema:
        - AttributeName: configId
          KeyType: HASH
      Tags:
        - Key: Project
          Value: LLM-Normalization-ETL

  # Función Lambda
  NormalizeLeadsFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: normalize-leads
      Description: Normalización de datos con LLM usando Claude 3 Haiku
      CodeUri: lambda/normalize-leads/
      Handler: index.handler
      Timeout: 300
      MemorySize: 512
      Environment:
        Variables:
          LEADS_TABLE: !Ref LeadsTable
          CONFIG_TABLE: !Ref NormalizationConfigTable
          BEDROCK_MODEL_ID: anthropic.claude-3-haiku-20240307-v1:0
          BATCH_SIZE: '10'
          NORMALIZATION_TTL_DAYS: '7'
          MAX_LEADS_PER_RUN: '50'
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref LeadsTable
        - DynamoDBCrudPolicy:
            TableName: !Ref NormalizationConfigTable
        - Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action: 'bedrock:InvokeModel'
              Resource: 'arn:aws:bedrock:*::foundation-model/anthropic.claude-*'
      Events:
        # Ejecución programada: Diaria a las 2 AM COT (7 AM UTC)
        DailyNormalization:
          Type: Schedule
          Properties:
            Schedule: cron(0 7 * * ? *)
            Name: daily-normalization
            Description: Disparar normalización diaria de datos
            Enabled: true
        # Disparador manual via API (opcional)
        NormalizeApi:
          Type: Api
          Properties:
            Path: /normalize
            Method: POST

  # Nota: LeadsTable debería ya existir en tu entorno
  # Si creas desde cero, descomenta abajo:
  #
  # LeadsTable:
  #   Type: AWS::DynamoDB::Table
  #   Properties:
  #     TableName: leads
  #     BillingMode: PAY_PER_REQUEST
  #     AttributeDefinitions:
  #       - AttributeName: leadId
  #         AttributeType: S
  #     KeySchema:
  #       - AttributeName: leadId
  #         KeyType: HASH

Outputs:
  NormalizeFunctionArn:
    Description: ARN de Lambda Normalize Leads
    Value: !GetAtt NormalizeLeadsFunction.Arn

  NormalizeApiEndpoint:
    Description: Endpoint API para normalización manual
    Value: !Sub 'https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/normalize'
```

### 1.2 Crear Estructura de Directorios Lambda

```bash
mkdir -p lambda/normalize-leads
cd lambda/normalize-leads
npm init -y
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

## Paso 2: Implementación Lambda

### 2.1 Handler Principal (`lambda/normalize-leads/index.js`)

```javascript
/**
 * Handler Lambda Normalize Leads
 *
 * Sistema ETL que normaliza datos de prospectos usando Claude Haiku via AWS Bedrock.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { generateNormalizationPrompt, parseNormalizationResponse } from './prompts.js';

// Inicializar clientes AWS (fuera del handler para reutilización de contenedor)
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Configuración desde entorno
const LEADS_TABLE = process.env.LEADS_TABLE;
const CONFIG_TABLE = process.env.CONFIG_TABLE;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const NORMALIZATION_TTL_DAYS = parseInt(process.env.NORMALIZATION_TTL_DAYS || '7', 10);
const MAX_LEADS_PER_RUN = parseInt(process.env.MAX_LEADS_PER_RUN || '50', 10);

/**
 * Configuración por defecto (usada si CONFIG_TABLE no existe)
 */
const DEFAULT_CONFIG = {
  fieldsToNormalize: [
    'nombres',
    'apellidos',
    'dirección',
    'ciudad',
    'nivelEducativo',
    'ocupacionActual',
    'empresa'
  ],
  enabled: true,
  batchSize: BATCH_SIZE,
  maxLeadsPerRun: MAX_LEADS_PER_RUN,
  normalizationTTLDays: NORMALIZATION_TTL_DAYS
};

/**
 * Handler Lambda principal
 */
export const handler = async (event) => {
  const startTime = Date.now();
  const isScheduled = event.source === 'aws.events';
  const isManualTrigger = !isScheduled;

  console.log(`Iniciando ejecución de normalización ${isScheduled ? 'programada' : 'manual'}...`);

  try {
    // Cargar configuración
    const config = await loadConfig();

    if (!config.enabled) {
      console.log('Normalización deshabilitada via configuración');
      return successResponse({
        message: 'Normalización está deshabilitada',
        enabled: false
      });
    }

    // Parsear opcion force desde disparador manual
    const forceAll = isManualTrigger && (
      event.forceAll === true ||
      event.queryStringParameters?.forceAll === 'true' ||
      (event.body && JSON.parse(event.body).forceAll === true)
    );

    // Encontrar prospectos que necesitan normalización
    const leadsToNormalize = await findLeadsToNormalize(config, forceAll);

    if (leadsToNormalize.length === 0) {
      console.log('No hay prospectos que requieran normalización');
      return successResponse({
        message: 'No hay prospectos que requieran normalización',
        leadsProcessed: 0,
        duration: Date.now() - startTime
      });
    }

    console.log(`Encontrados ${leadsToNormalize.length} prospectos para normalizar`);

    // Procesar en lotes
    const results = {
      processed: 0,
      normalized: 0,
      errors: 0,
      skipped: 0,
      details: []
    };

    const effectiveBatchSize = config.batchSize || BATCH_SIZE;
    const effectiveMaxLeads = Math.min(
      leadsToNormalize.length,
      config.maxLeadsPerRun || MAX_LEADS_PER_RUN
    );

    for (let i = 0; i < effectiveMaxLeads; i += effectiveBatchSize) {
      const batch = leadsToNormalize.slice(i, i + effectiveBatchSize);

      for (const lead of batch) {
        try {
          const result = await normalizeLead(lead, config.fieldsToNormalize);
          results.processed++;

          if (result.normalized) {
            results.normalized++;
            results.details.push({
              leadId: lead.leadId,
              status: 'normalized',
              fieldsNormalized: result.fieldsNormalized
            });
          } else {
            results.skipped++;
            results.details.push({
              leadId: lead.leadId,
              status: 'skipped',
              reason: result.reason
            });
          }
        } catch (error) {
          console.error(`Error normalizando prospecto ${lead.leadId}:`, error.message);
          results.errors++;
          results.details.push({
            leadId: lead.leadId,
            status: 'error',
            error: error.message
          });
        }
      }

      // Pequeña demora entre lotes para evitar limitación de tasa
      if (i + effectiveBatchSize < effectiveMaxLeads) {
        await sleep(500);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`Normalización completa: ${results.normalized} normalizados, ${results.errors} errores, ${duration}ms`);

    return successResponse({
      message: 'Normalización completa',
      ...results,
      duration,
      config: {
        batchSize: effectiveBatchSize,
        maxLeadsPerRun: effectiveMaxLeads,
        fieldsNormalized: config.fieldsToNormalize
      }
    });

  } catch (error) {
    console.error('Ejecución de normalización fallo:', error);
    return errorResponse(500, `Error en normalización: ${error.message}`);
  }
};

/**
 * Cargar configuración de normalización desde DynamoDB
 */
async function loadConfig() {
  try {
    const command = new GetCommand({
      TableName: CONFIG_TABLE,
      Key: { configId: 'normalization-settings' }
    });

    const result = await docClient.send(command);

    if (result.Item) {
      return { ...DEFAULT_CONFIG, ...result.Item };
    }

    return DEFAULT_CONFIG;
  } catch (error) {
    // Si la tabla no existe o config no encontrada, usar valores por defecto
    console.log('Usando configuración por defecto:', error.message);
    return DEFAULT_CONFIG;
  }
}

/**
 * Encontrar prospectos que necesitan normalización
 * - normalizedAt esta ausente
 * - normalizedAt es más antiguo que TTL
 */
async function findLeadsToNormalize(config, forceAll = false) {
  const ttlMs = (config.normalizationTTLDays || NORMALIZATION_TTL_DAYS) * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - ttlMs;

  const leads = [];
  let lastEvaluatedKey = null;

  do {
    const params = {
      TableName: LEADS_TABLE,
      ProjectionExpression: 'leadId, nombres, apellidos, dirección, ciudad, nivelEducativo, ocupacionActual, empresa, normalizedAt, normalizedData',
      Limit: 100
    };

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await docClient.send(new ScanCommand(params));

    for (const lead of result.Items || []) {
      if (forceAll || !lead.normalizedAt || lead.normalizedAt < cutoffTime) {
        leads.push(lead);
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;

    // Limite de seguridad
    if (leads.length >= config.maxLeadsPerRun) {
      break;
    }
  } while (lastEvaluatedKey);

  return leads;
}

/**
 * Normalizar un prospecto individual usando Claude Haiku
 */
async function normalizeLead(lead, fieldsToNormalize) {
  // Extraer solo los campos que necesitan normalización
  const fieldsData = {};
  let hasDataToNormalize = false;

  for (const field of fieldsToNormalize) {
    if (lead[field] !== undefined && lead[field] !== null && lead[field] !== '') {
      fieldsData[field] = lead[field];
      hasDataToNormalize = true;
    }
  }

  if (!hasDataToNormalize) {
    return {
      normalized: false,
      reason: 'No hay campos para normalizar'
    };
  }

  // Generar prompt y llamar a Claude
  const prompt = generateNormalizationPrompt(fieldsData);
  const normalizedFields = await callClaude(prompt);

  // Guardar datos normalizados de vuelta a DynamoDB
  const updateParams = {
    TableName: LEADS_TABLE,
    Key: { leadId: lead.leadId },
    UpdateExpression: 'SET normalizedAt = :timestamp, normalizedData = :data, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':timestamp': Date.now(),
      ':data': normalizedFields,
      ':updatedAt': Date.now()
    }
  };

  await docClient.send(new UpdateCommand(updateParams));

  return {
    normalized: true,
    fieldsNormalized: Object.keys(normalizedFields)
  };
}

/**
 * Llamar a Claude Haiku para normalización
 */
async function callClaude(prompt) {
  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1000,
    temperature: 0, // Determinístico para normalización consistente
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(requestBody)
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  // Registrar uso de tokens para monitoreo de costos
  console.log('Uso de tokens:', {
    input: responseBody.usage?.input_tokens || 0,
    output: responseBody.usage?.output_tokens || 0
  });

  const responseText = responseBody.content?.[0]?.text;
  if (!responseText) {
    throw new Error('Respuesta vacía de Claude');
  }

  return parseNormalizationResponse(responseText);
}

/**
 * Utilidad sleep para limitación de tasa
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper de respuesta exitosa
 */
function successResponse(data) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(data)
  };
}

/**
 * Helper de respuesta de error
 */
function errorResponse(statusCode, message) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ error: message })
  };
}

export default { handler };
```

### 2.2 Ingeniería de Prompts (`lambda/normalize-leads/prompts.js`)

Este es el archivo **más crítico** - contiene el template del prompt y el pipeline de post-procesamiento.

```javascript
/**
 * Prompts de Normalización para Claude Haiku
 *
 * Prompts específicos por campo optimizados para datos colombianos.
 */

/**
 * Mapeos de nombres de ciudades colombianas para estandarización
 */
const CITY_MAPPINGS = {
  // Variantes de Bogota
  'bogota': 'Bogota D.C.',
  'bogotá': 'Bogota D.C.',
  'bogota dc': 'Bogota D.C.',
  'bogota d.c.': 'Bogota D.C.',
  'bogota d.c': 'Bogota D.C.',
  'santafe de bogota': 'Bogota D.C.',

  // Variantes de Medellin
  'medellin': 'Medellin',
  'medellín': 'Medellin',

  // Variantes de Cali
  'cali': 'Cali',
  'santiago de cali': 'Cali',

  // Agregar más ciudades según sea necesario
};

/**
 * Instituciones educativas conocidas para estandarización
 */
const INSTITUTION_PATTERNS = [
  { pattern: /sena|servicio nacional de aprendizaje/i, standard: 'SENA' },
  { pattern: /universidad nacional/i, standard: 'Universidad Nacional de Colombia' },
  { pattern: /u\s*nal|unal/i, standard: 'Universidad Nacional de Colombia' },
  { pattern: /universidad de los andes|uniandes/i, standard: 'Universidad de los Andes' },
  // Agregar más instituciones según sea necesario
];

/**
 * Generar el prompt de normalización para Claude Haiku
 */
export function generateNormalizationPrompt(fieldsData) {
  const fieldsList = Object.entries(fieldsData)
    .map(([key, value]) => `- ${key}: "${value}"`)
    .join('\n');

  return `Normaliza los siguientes campos de un formulario de inscripción en Colombia. Aplica estas reglas:

## Reglas de Normalización

### Nombres y Apellidos
- Capitalizar correctamente (primera letra mayúscula)
- Eliminar espacios extras
- Mantener tildes y caracteres especiales
- Ejemplo: "JUAN CARLOS PEREZ" -> "Juan Carlos Perez"

### Dirección
- Formato estándar colombiano: "Calle/Carrera/Avenida # - #"
- Abreviaturas: Cra., Cl., Av., Tr., Dg.
- Ejemplo: "CRA 15 NO 100 25" -> "Cra. 15 # 100 - 25"

### Ciudad
- Usar nombre oficial de la ciudad
- Bogota siempre como "Bogota D.C."
- Remover "Colombia" si está incluido
- Ejemplo: "bogota colombia" -> "Bogota D.C."

### Nivel Educativo
- Estandarizar a: Primaria, Bachiller, Tecnico, Tecnologo, Profesional, Especialista, Magister, Doctorado
- Ejemplo: "BACHILLERATO COMPLETO" -> "Bachiller"

### Ocupación/Empresa
- Capitalizar correctamente
- Eliminar espacios extras
- Estandarizar nombres conocidos (SENA, universidades)

## Campos a Normalizar

${fieldsList}

## Formato de Respuesta

Responde UNICAMENTE con un JSON válido:

{
  "campo1": "valor normalizado",
  "campo2": "valor normalizado"
}

Solo incluye campos que fueron modificados. Si un campo ya está correctamente formateado, omitelo del JSON.`;
}

/**
 * Parsear y validar respuesta de normalización de Claude
 */
export function parseNormalizationResponse(responseText) {
  // Extraer JSON de la respuesta (manejar posibles bloques de código markdown)
  let jsonStr = responseText;

  // Remover bloques de código markdown si estan presentes
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else {
    // Intentar encontrar objeto JSON crudo
    const objectMatch = responseText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Validar que es un objeto
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('La respuesta debe ser un objeto JSON');
    }

    // Post-procesar cada campo
    const normalized = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim() !== '') {
        // Aplicar normalización local adicional
        normalized[key] = postProcessField(key, value);
      }
    }

    return normalized;
  } catch (error) {
    console.error('Fallo al parsear respuesta de normalización:', error.message);
    console.error('Respuesta cruda:', responseText.substring(0, 500));
    throw new Error(`Error parseando respuesta: ${error.message}`);
  }
}

/**
 * Aplicar reglas de post-procesamiento local
 *
 * CRITICO: Esta capa captura inconsistencias del LLM
 */
function postProcessField(fieldName, value) {
  let processed = value.trim();

  switch (fieldName) {
    case 'ciudad':
      const lowerCity = processed.toLowerCase();
      if (CITY_MAPPINGS[lowerCity]) {
        return CITY_MAPPINGS[lowerCity];
      }
      return capitalizeWords(processed);

    case 'empresa':
    case 'institucionEducativa':
      for (const { pattern, standard } of INSTITUTION_PATTERNS) {
        if (pattern.test(processed)) {
          return standard;
        }
      }
      return capitalizeWords(processed);

    case 'nombres':
    case 'apellidos':
      return capitalizeWords(processed);

    case 'dirección':
      return normalizeAddress(processed);

    case 'nivelEducativo':
      return normalizeEducationLevel(processed);

    default:
      return processed;
  }
}

/**
 * Capitalizar primera letra de cada palabra
 */
function capitalizeWords(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizar formato de dirección colombiana
 *
 * IMPORTANTE: Nota la verificación de punto opcional (\.?) para prevenir bug de doble punto
 */
function normalizeAddress(address) {
  let normalized = address
    // Estandarizar abreviaturas de tipo de via (incluir punto opcional para evitar ". .")
    .replace(/\b(carrera|cra|cr|kra)\.?\s*/gi, 'Cra. ')
    .replace(/\b(calle|cl|cll)\.?\s*/gi, 'Cl. ')
    .replace(/\b(avenida|av|avda)\.?\s*/gi, 'Av. ')
    .replace(/\b(transversal|tr|trans|tv|transv)\.?\s*/gi, 'Tr. ')
    .replace(/\b(diagonal|dg|diag)\.?\s*/gi, 'Dg. ')
    // Estandarizar indicadores de numero
    .replace(/\bno\b\.?\s*/gi, '# ')
    .replace(/\bnumero\b\.?\s*/gi, '# ')
    .replace(/\bn[°o]\s*/gi, '# ')
    // Limpiar dobles puntos que pudieran haber pasado
    .replace(/\.\s*\./g, '.')
    // Limpiar espacios múltiples
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Normalizar nivel educativo a valores estándar
 */
function normalizeEducationLevel(level) {
  const lowerLevel = level.toLowerCase();

  if (/primaria|basica primaria/i.test(lowerLevel)) return 'Primaria';
  if (/bachiller|secundaria|media|11/i.test(lowerLevel)) return 'Bachiller';
  if (/tecnic[oa]|tecnic/i.test(lowerLevel)) return 'Tecnico';
  if (/tecnolog/i.test(lowerLevel)) return 'Tecnologo';
  if (/profesional|pregrado|universitari/i.test(lowerLevel)) return 'Profesional';
  if (/especiali/i.test(lowerLevel)) return 'Especialista';
  if (/maestr[ií]a|magister|master/i.test(lowerLevel)) return 'Magister';
  if (/doctor|phd/i.test(lowerLevel)) return 'Doctorado';

  // Retornar original si no hay coincidencia (con capitalización correcta)
  return capitalizeWords(level);
}

export default {
  generateNormalizationPrompt,
  parseNormalizationResponse
};
```

## Paso 3: Pruebas

### 3.1 Pruebas Unitarias (`lambda/normalize-leads/__tests__/prompts.test.js`)

```javascript
import { generateNormalizationPrompt, parseNormalizationResponse } from '../prompts.js';

describe('parseNormalizationResponse', () => {
  test('parsea respuesta JSON válida', () => {
    const response = '{"nombres": "Juan Carlos", "ciudad": "Bogota D.C."}';
    const result = parseNormalizationResponse(response);

    expect(result.nombres).toBe('Juan Carlos');
    expect(result.ciudad).toBe('Bogota D.C.');
  });

  test('maneja dirección con punto existente (previene bug ". .")', () => {
    const response = '{"dirección": "Cra. 80 I # 51 - 09"}';
    const result = parseNormalizationResponse(response);

    expect(result.dirección).toBe('Cra. 80 I # 51 - 09');
    expect(result.dirección).not.toContain('. .');
  });

  test('normaliza nombres de ciudades', () => {
    const response = '{"ciudad": "bogota"}';
    const result = parseNormalizationResponse(response);

    expect(result.ciudad).toBe('Bogota D.C.');
  });

  test('normaliza nivel educativo', () => {
    const response = '{"nivelEducativo": "bachillerato completo"}';
    const result = parseNormalizationResponse(response);

    expect(result.nivelEducativo).toBe('Bachiller');
  });
});
```

Ejecutar pruebas:
```bash
npm test
```

### 3.2 Pruebas Locales con SAM

```bash
# Construir Lambda
sam build

# Probar con evento de ejemplo
cat > test-event.json << EOF
{
  "forceAll": true
}
EOF

sam local invoke NormalizeLeadsFunction -e test-event.json
```

## Paso 4: Despliegue

### 4.1 Desplegar con SAM

```bash
# Primer despliegue (modo guiado)
sam deploy --guided

# Seguir prompts:
# Stack Name: llm-normalization-etl
# AWS Region: us-east-1
# Confirm changes: y
# Allow SAM CLI IAM role creation: y
# Disable rollback: n
# Save arguments to samconfig.toml: y

# Despliegues subsecuentes
sam deploy
```

### 4.2 Verificar Despliegue

```bash
# Verificar outputs del stack
aws cloudformation describe-stacks \
  --stack-name llm-normalization-etl \
  --query 'Stacks[0].Outputs' \
  --output table

# Invocar Lambda manualmente
aws lambda invoke \
  --function-name normalize-leads \
  --payload '{"forceAll": true}' \
  response.json

cat response.json
```

### 4.3 Monitorear Ejecución

```bash
# Seguir logs de CloudWatch
sam logs -n NormalizeLeadsFunction --stack-name llm-normalization-etl --tail

# Verificar DynamoDB para datos normalizados
aws dynamodb get-item \
  --table-name leads \
  --key '{"leadId": {"S": "your-lead-id"}}' \
  --query 'Item.normalizedData'
```

## Paso 5: Robustecimiento para Producción

### 5.1 Agregar Alarmas CloudWatch

```yaml
# Agregar a template.yaml
NormalizationErrorAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: normalization-errors
    AlarmDescription: Alerta cuando normalización falla repetidamente
    Namespace: AWS/Lambda
    MetricName: Errors
    Dimensions:
      - Name: FunctionName
        Value: !Ref NormalizeLeadsFunction
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 2
    Threshold: 5
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref AlertTopic

AlertTopic:
  Type: AWS::SNS::Topic
  Properties:
    DisplayName: Alertas de Normalización
    Subscription:
      - Endpoint: tu-email@example.com
        Protocol: email
```

### 5.2 Habilitar Rastreo X-Ray

```yaml
# Agregar a sección Globals
Globals:
  Function:
    Tracing: Active
```

### 5.3 Configurar Concurrencia Reservada

```yaml
NormalizeLeadsFunction:
  Type: AWS::Serverless::Function
  Properties:
    ReservedConcurrentExecutions: 1  # Prevenir ejecución paralela
```

## Mejores Prácticas de Ingeniería de Prompts

### 1. Ser Específico Sobre el Formato de Salida

- **Mal**: "Normaliza estos datos"
- **Bien**: "Responde UNICAMENTE con un JSON válido"

### 2. Proporcionar Ejemplos

```
Ejemplo: "CRA 15 NO 100 25" -> "Cra. 15 # 100 - 25"
```

### 3. Usar Temperature = 0 para Determinismo

```javascript
temperature: 0  // Salidas consistentes para mismas entradas
```

### 4. Manejar Casos Borde en Post-Procesamiento

No confiar en LLM para:
- Formatos exactos de abreviaciones ("Cra." vs "Cra")
- Remover espacios dobles
- Capitalización consistente

Usar post-procesamiento regex en su lugar.

## Diseño del Pipeline de Post-Procesamiento

La capa de post-procesamiento es **crítica** para calidad de producción. Aquí está el por qué:

### Problema: Inconsistencia del LLM

Incluso a temperature=0, Claude podría retornar:
- "Cra. 15" vs "Cra 15" (punto faltante)
- "Juan Carlos" vs "Juan  Carlos" (espacio doble)
- "Bogota" vs "Bogota" (tilde faltante)

### Solución: Normalización de Doble Capa

```
Entrada → Claude (consciente del contexto) → Post-procesamiento (determinístico) → Salida
```

**Capa 1 (LLM)**: Manejar variaciones complejas
- "Ingeniero de Sistemas" vs "Ing. Sistemas" vs "Systems Engineer"

**Capa 2 (Regex)**: Hacer cumplir formatos exactos
- Siempre "Cra." con punto y espacio
- Siempre "Bogota D.C." para Bogotá
- Siempre nombres capitalizados

### Ejemplo: Normalización de Direcciónes

```javascript
// LLM podría retornar cualquiera de estos:
"Carrera 15 No 100-25"
"Cra 15 # 100-25"
"Cra. 15 No. 100-25"

// Post-procesamiento hace cumplir:
"Cra. 15 # 100 - 25"  // Siempre este formato
```

## Consejos de Depuración

### 1. Registrar Uso de Tokens

```javascript
console.log('Uso de tokens:', {
  input: responseBody.usage?.input_tokens || 0,
  output: responseBody.usage?.output_tokens || 0
});
```

**Por qué?** Detectar picos de costos temprano.

### 2. Registrar Respuestas Crudas del LLM

```javascript
console.error('Respuesta cruda:', responseText.substring(0, 500));
```

**Por qué?** Identificar problemas de ingeniería de prompts.

### 3. Probar con Datos Diversos

Crear dataset de prueba con:
- Todo mayúsculas: "JUAN CARLOS"
- Todo minúsculas: "juan carlos"
- Mezclado: "JuAn CaRlOs"
- Caracteres especiales: "José María"
- Abreviaciones: "Ing. de Sistemas"

### 4. Validar Post-Procesamiento

```javascript
// Agregar aserciones en pruebas
expect(result.dirección).not.toContain('. .');  // Sin dobles puntos
expect(result.ciudad).toMatch(/^[A-Z]/);        // Siempre capitalizado
```

## Próximos Pasos

- **[VALIDACION-ESTADISTICA.md](./VALIDACION-ESTADISTICA.md)**: Medir calidad de normalización
- **[LECCIONES-APRENDIDAS.md](./LECCIONES-APRENDIDAS.md)**: Perspectivas de producción
- **[ANALISIS-COSTOS.md](./ANALISIS-COSTOS.md)**: Estrategias de optimización de costos

---

**Última Actualización**: 24 de Enero, 2026
