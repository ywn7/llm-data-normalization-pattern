# Construyendo Tu Primer Pipeline de Normalización de Datos con LLM

> **Idioma**: [English](../en/TUTORIAL.md) | [Español](./TUTORIAL.md)

**Un tutorial práctico: Transforma datos de usuario desordenados en registros limpios y estandarizados usando Claude Haiku y AWS**

## Lo Que Construirás

Al final de este tutorial, tendrás un sistema de normalización de datos serverless completamente funciónal que:

- Limpia automáticamente datos de usuario desordenados (nombres, direcciónes, ciudades)
- Usa Claude 3 Haiku via AWS Bedrock para normalización inteligente
- Se ejecuta de forma programada (diaria) o bajo demanda via API
- Valida la calidad usando análisis estadístico
- Cuesta solo ~$0.07 por cada 1,000 registros

**Lo que aprenderás:**
- Como integrar LLMs en pipelines ETL serverless
- Ingenieria de prompts para tareas de normalización de datos
- Construcción de sistemas auto-reparables con capas de post-procesamiento
- Validación estadística para salidas de IA
- Mejores prácticas de AWS Bedrock y Lambda

**Tiempo requerido:** 90 minutos (más tiempo de despliegue)

**Costo:** ~$0.10 en cargos de AWS durante el tutorial (casi completamente elegible para capa gratuita)

## Lista de Prerequisitos

Antes de comenzar, asegúrate de tener:

- [ ] **Cuenta AWS** con acceso a Bedrock
  - Si aún no tienes acceso a Bedrock, [solicitalo aquí](https://console.aws.amazon.com/bedrock)
  - Especificamente, solicita acceso al modelo **Claude 3 Haiku**
  - La aprobación usualmente toma 5-10 minutos

- [ ] **AWS CLI** instalado y configurado
  ```bash
  aws --version  # Debería mostrar version 2.x
  aws sts get-caller-identity  # Verificar que las credenciales funciónan
  ```

- [ ] **AWS SAM CLI** instalado
  ```bash
  sam --version  # Debería mostrar version 1.100+
  # Instalar en macOS: brew install aws-sam-cli
  # Instalar en Linux: pip install aws-sam-cli
  ```

- [ ] **Node.js 22.x** o posterior
  ```bash
  node --version  # Debería mostrar v22.x o superior
  ```

- [ ] **Comprensión básica** de:
  - funciónes AWS Lambda
  - DynamoDB (base de datos NoSQL)
  - JSON y APIs REST

Si te falta algún prerequisito, pausa aquí y configuralo primero.

## Resultado Esperado

Al final, tendrás:

1. Una función Lambda que normaliza datos usando Claude Haiku
2. Una tabla DynamoDB almacenando datos originales y normalizados
3. Un schedule de EventBridge activando normalización diaria
4. Reportes estadísticos mostrando tasas de mejora
5. Un patrón listo para producción que puedes adaptar a tus propios datos

Comencemos!

---

## Parte 1: Configurando la Base (15 minutos)

### Paso 1.1: Crea la Estructura de Tu Proyecto

Primero, creemos un directorio de proyecto limpio:

```bash
# Crear directorio del proyecto
mkdir llm-normalization-tutorial
cd llm-normalization-tutorial

# Crear estructura de directorios
mkdir -p lambda/normalize-leads
mkdir -p test-events
mkdir -p docs

# Inicializar git (opcional pero recomendado)
git init
echo "node_modules/" > .gitignore
echo ".aws-sam/" >> .gitignore
```

**Punto de verificación:** Deberías tener una estructura de directorios como esta:
```
llm-normalization-tutorial/
├── lambda/
│   └── normalize-leads/
├── test-events/
└── docs/
```

### Paso 1.2: Crea una Tabla DynamoDB para Pruebas

Crearemos una tabla simple con datos de prospectos de ejemplo:

```bash
# Crear la tabla
aws dynamodb create-table \
  --table-name tutorial-leads \
  --attribute-definitions \
    AttributeName=leadId,AttributeType=S \
  --key-schema \
    AttributeName=leadId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Esperar a que la tabla este activa
aws dynamodb wait table-exists --table-name tutorial-leads --region us-east-1

echo "Tabla creada exitosamente!"
```

**Punto de verificación:** Verifica que la tabla existe:
```bash
aws dynamodb describe-table --table-name tutorial-leads --region us-east-1 --query 'Table.TableStatus'
# Salida esperada: "ACTIVE"
```

### Paso 1.3: Agrega Datos de Ejemplo

Agreguemos algunos datos desordenados que necesitan normalización:

```bash
# Crear un prospecto de ejemplo con datos desordenados
cat > test-events/sample-lead.json << 'EOF'
{
  "leadId": "lead-001",
  "nombres": "JUAN CARLOS",
  "apellidos": "PEREZ GARCIA",
  "ciudad": "bogota",
  "dirección": "CRA 15 NO 100 25",
  "nivelEducativo": "BACHILLERATO COMPLETO",
  "ocupacionActual": "ingeniero de sistemas",
  "empresa": "acme corp",
  "createdAt": 1706000000000
}
EOF

# Insertar en DynamoDB
aws dynamodb put-item \
  --table-name tutorial-leads \
  --item file://test-events/sample-lead.json \
  --region us-east-1

echo "Datos de ejemplo insertados!"
```

**Punto de verificación:** Verifica que los datos estan en DynamoDB:
```bash
aws dynamodb get-item \
  --table-name tutorial-leads \
  --key '{"leadId": {"S": "lead-001"}}' \
  --region us-east-1
```

Deberías ver tus datos desordenados en la respuesta.

### Paso 1.4: Verifica el Acceso a Bedrock

Antes de continuar, verifiquemos que puedes llamar a Claude Haiku:

```bash
# Probar acceso a Bedrock
cat > test-bedrock.json << 'EOF'
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 100,
  "messages": [
    {
      "role": "user",
      "content": "Say hello in one word"
    }
  ]
}
EOF

aws bedrock-runtime invoke-model \
  --model-id anthropic.claude-3-haiku-20240307-v1:0 \
  --body file://test-bedrock.json \
  --region us-east-1 \
  response.json

cat response.json
```

**Salida esperada:** Deberías ver JSON con la respuesta de Claude conteniendo "Hello" o similar.

**solución de problemas:**
- **Error: AccessDeniedException** - Necesitas solicitar acceso a Bedrock en la Consola AWS
- **Error: ResourceNotFoundException** - Verifica que el ID del modelo es correcto
- **Error: ValidationException** - Verifica el formato de tu JSON

Excelente trabajo! Tu entorno AWS esta listo. Construyamos la función Lambda.

---

## Parte 2: Construyendo el Lambda de Normalización (30 minutos)

### Paso 2.1: Inicializa el Proyecto Lambda

```bash
cd lambda/normalize-leads

# Inicializar proyecto Node.js
npm init -y

# Instalar dependencias del AWS SDK
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# Actualizar package.json para usar ES modules
# Edita package.json y agrega: "type": "module"
```

Edita `package.json` para agregar el tipo de modulo:

```json
{
  "name": "normalize-leads",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-bedrock-runtime": "^3.500.0",
    "@aws-sdk/client-dynamodb": "^3.500.0",
    "@aws-sdk/lib-dynamodb": "^3.500.0"
  }
}
```

**Punto de verificación:** Ejecuta `npm install` y verifica que no hay errores.

### Paso 2.2: Crea el Modulo de Ingenieria de Prompts

Este es el corazon del sistema. Crea `prompts.js`:

```bash
touch prompts.js
```

Ahora, construyamoslo paso a paso. Abre `prompts.js` en tu editor:

```javascript
/**
 * prompts.js - Ingenieria de prompts y post-procesamiento para normalización de datos
 */

// Mapeos de ciudades colombianas (expandirias esto en producción)
const CITY_MAPPINGS = {
  'bogota': 'Bogota D.C.',
  'bogotá': 'Bogota D.C.',
  'medellin': 'Medellin',
  'medellín': 'Medellin',
  'cali': 'Cali'
};

/**
 * Genera el prompt de normalización para Claude
 *
 * Aqui es donde ocurre la magia - le decimos a Claude exactamente lo que queremos
 */
export function generateNormalizationPrompt(fieldsData) {
  // Convertir campos a una lista legible
  const fieldsList = Object.entries(fieldsData)
    .map(([key, value]) => `- ${key}: "${value}"`)
    .join('\n');

  // El prompt - nota lo específico que somos!
  return `Normaliza los siguientes campos de un formulario. Aplica estas reglas:

## Reglas de Normalización

### Nombres y Apellidos
- Capitalizar correctamente (primera letra mayuscula)
- Eliminar espacios extras
- Ejemplo: "JUAN CARLOS" -> "Juan Carlos"

### dirección
- Formato: "Cra./Cl./Av. # - #"
- Ejemplo: "CRA 15 NO 100 25" -> "Cra. 15 # 100 - 25"

### Ciudad
- Usar nombre oficial
- Bogota siempre como "Bogota D.C."
- Ejemplo: "bogota" -> "Bogota D.C."

### Nivel Educativo
- Estandarizar a: Primaria, Bachiller, Tecnico, Tecnologo, Profesional
- Ejemplo: "BACHILLERATO COMPLETO" -> "Bachiller"

## Campos a Normalizar

${fieldsList}

## Formato de Respuesta

Responde UNICAMENTE con un JSON valido:

{
  "campo1": "valor normalizado",
  "campo2": "valor normalizado"
}

Solo incluye campos que fueron modificados.`;
}

/**
 * Parsea la respuesta de Claude y aplica post-procesamiento
 *
 * CRITICO: Esto captura inconsistencias del LLM
 */
export function parseNormalizationResponse(responseText) {
  // Extraer JSON (Claude podria envolverlo en markdown)
  let jsonStr = responseText;

  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else {
    const objectMatch = responseText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('La respuesta debe ser un objeto JSON');
    }

    // Aplicar post-procesamiento a cada campo
    const normalized = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim() !== '') {
        normalized[key] = postProcessField(key, value);
      }
    }

    return normalized;
  } catch (error) {
    console.error('Error de parseo:', error.message);
    console.error('Respuesta cruda:', responseText.substring(0, 200));
    throw new Error(`Error parseando respuesta: ${error.message}`);
  }
}

/**
 * Post-procesa cada campo segun su tipo
 *
 * Esta capa asegura formato consistente incluso si Claude varia
 */
function postProcessField(fieldName, value) {
  let processed = value.trim();

  switch (fieldName) {
    case 'ciudad':
      const lowerCity = processed.toLowerCase();
      return CITY_MAPPINGS[lowerCity] || capitalizeWords(processed);

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
 * Capitaliza la primera letra de cada palabra
 */
function capitalizeWords(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
}

/**
 * Normaliza el formato de direcciónes colombianas
 *
 * IMPORTANTE: Nota el \.? - esto previene el bug de doble punto "Cra. ."
 */
function normalizeAddress(address) {
  return address
    .replace(/\b(carrera|cra|cr)\.?\s*/gi, 'Cra. ')
    .replace(/\b(calle|cl)\.?\s*/gi, 'Cl. ')
    .replace(/\b(avenida|av)\.?\s*/gi, 'Av. ')
    .replace(/\bno\b\.?\s*/gi, '# ')
    .replace(/\.\s*\./g, '.')  // Limpiar puntos dobles
    .replace(/\s+/g, ' ')      // Limpiar espacios multiples
    .trim();
}

/**
 * Normaliza el nivel educativo a valores estandar
 */
function normalizeEducationLevel(level) {
  const lower = level.toLowerCase();

  if (/primaria/i.test(lower)) return 'Primaria';
  if (/bachiller|secundaria/i.test(lower)) return 'Bachiller';
  if (/tecnico/i.test(lower)) return 'Tecnico';
  if (/tecnologo/i.test(lower)) return 'Tecnologo';
  if (/profesional|universitari/i.test(lower)) return 'Profesional';

  return capitalizeWords(level);
}

export default {
  generateNormalizationPrompt,
  parseNormalizationResponse
};
```

**Que acaba de pasar:**
- Creamos un prompt que le dice a Claude EXACTAMENTE lo que queremos
- Construimos un parser que maneja la respuesta de Claude (incluso si esta envuelta en markdown)
- Agregamos post-procesamiento para asegurar formato consistente

**Punto de verificación:** Guarda el archivo. Lo probaremos pronto!

### Paso 2.3: Crea el Handler Lambda

Ahora crea `index.js` - la función Lambda principal:

```javascript
/**
 * index.js - Handler Lambda principal para normalización de datos
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { generateNormalizationPrompt, parseNormalizationResponse } from './prompts.js';

// Inicializar clientes AWS (fuera del handler para reutilización)
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// configuración
const LEADS_TABLE = process.env.LEADS_TABLE || 'tutorial-leads';
const MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';

/**
 * Handler Lambda - esto es llamado por AWS
 */
export const handler = async (event) => {
  console.log('Iniciando normalización...');

  try {
    // Paso 1: Encontrar prospectos que necesitan normalización
    const leads = await findLeadsToNormalize();

    if (leads.length === 0) {
      console.log('No hay prospectos para normalizar');
      return { statusCode: 200, body: JSON.stringify({ message: 'Nada que hacer' }) };
    }

    console.log(`Encontrados ${leads.length} prospectos para normalizar`);

    // Paso 2: Normalizar cada prospecto
    const results = { normalized: 0, errors: 0 };

    for (const lead of leads) {
      try {
        await normalizeLead(lead);
        results.normalized++;
        console.log(`✓ Prospecto ${lead.leadId} normalizado`);
      } catch (error) {
        console.error(`✗ Error normalizando ${lead.leadId}:`, error.message);
        results.errors++;
      }
    }

    console.log(`Completo! Normalizados: ${results.normalized}, Errores: ${results.errors}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Normalización completa',
        results
      })
    };

  } catch (error) {
    console.error('Normalización fallida:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

/**
 * Encuentra prospectos que necesitan normalización
 * (En este tutorial, normalizamos si falta normalizedAt)
 */
async function findLeadsToNormalize() {
  const params = {
    TableName: LEADS_TABLE,
    ProjectionExpression: 'leadId, nombres, apellidos, ciudad, dirección, nivelEducativo, ocupacionActual, empresa, normalizedAt'
  };

  const result = await docClient.send(new ScanCommand(params));

  // Retornar prospectos sin timestamp normalizedAt
  return (result.Items || []).filter(lead => !lead.normalizedAt);
}

/**
 * Normaliza un solo prospecto usando Claude Haiku
 */
async function normalizeLead(lead) {
  // Paso 1: Preparar campos para normalización
  const fieldsToNormalize = [
    'nombres', 'apellidos', 'ciudad', 'dirección',
    'nivelEducativo', 'ocupacionActual', 'empresa'
  ];

  const fieldsData = {};
  for (const field of fieldsToNormalize) {
    if (lead[field]) {
      fieldsData[field] = lead[field];
    }
  }

  if (Object.keys(fieldsData).length === 0) {
    return; // Nada que normalizar
  }

  // Paso 2: Generar prompt
  const prompt = generateNormalizationPrompt(fieldsData);

  // Paso 3: Llamar a Claude
  const normalizedFields = await callClaude(prompt);

  // Paso 4: Guardar en DynamoDB
  const updateParams = {
    TableName: LEADS_TABLE,
    Key: { leadId: lead.leadId },
    UpdateExpression: 'SET normalizedAt = :timestamp, normalizedData = :data',
    ExpressionAttributeValues: {
      ':timestamp': Date.now(),
      ':data': normalizedFields
    }
  };

  await docClient.send(new UpdateCommand(updateParams));
}

/**
 * Llama a Claude Haiku via AWS Bedrock
 */
async function callClaude(prompt) {
  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1000,
    temperature: 0,  // Salida deterministica
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

  // Registrar uso de tokens (importante para monitoreo de costos!)
  console.log('Tokens:', {
    input: responseBody.usage?.input_tokens || 0,
    output: responseBody.usage?.output_tokens || 0
  });

  const responseText = responseBody.content?.[0]?.text;
  if (!responseText) {
    throw new Error('Respuesta vacia de Claude');
  }

  return parseNormalizationResponse(responseText);
}
```

**Que acaba de pasar:**
1. Configuramos clientes AWS para Bedrock y DynamoDB
2. Creamos un handler que encuentra prospectos y los normaliza uno por uno
3. Construimos una función `callClaude()` que se comunica con Bedrock
4. Registramos el uso de tokens para rastrear costos

**Punto de verificación:** Guarda ambos archivos. Ahora probemoslo localmente!

### Paso 2.4: Crea un Template SAM

Regresa a la raiz del proyecto:

```bash
cd ../..  # Regresa a llm-normalization-tutorial/
```

Crea `template.yaml`:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Tutorial de Normalización de Datos con LLM

Resources:
  NormalizeLeadsFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: tutorial-normalize-leads
      Description: Normaliza datos de prospectos usando Claude Haiku
      CodeUri: lambda/normalize-leads/
      Handler: index.handler
      Runtime: nodejs22.x
      Timeout: 300
      MemorySize: 512
      Environment:
        Variables:
          LEADS_TABLE: tutorial-leads
      Policies:
        - DynamoDBCrudPolicy:
            TableName: tutorial-leads
        - Version: '2012-10-17'
          Statement:
            - Effect: Allow
              Action: 'bedrock:InvokeModel'
              Resource: 'arn:aws:bedrock:*::foundation-model/anthropic.claude-*'

Outputs:
  FunctionArn:
    Description: ARN de la función Lambda
    Value: !GetAtt NormalizeLeadsFunction.Arn
```

**Punto de verificación:** Valida el template:
```bash
sam validate --lint
# Esperado: "template.yaml is a valid SAM Template"
```

### Paso 2.5: Prueba Localmente

Ahora la parte emocionante - probemoslo!

```bash
# Construir la función Lambda
sam build

# Crear un evento de prueba
cat > test-events/manual-invoke.json << 'EOF'
{
  "forceAll": true
}
EOF

# Invocar localmente (esto llamara a la API REAL de Bedrock!)
sam local invoke NormalizeLeadsFunction -e test-events/manual-invoke.json
```

**Salida esperada:**
```
Iniciando normalización...
Encontrados 1 prospectos para normalizar
Tokens: { input: 245, output: 87 }
✓ Prospecto lead-001 normalizado
Completo! Normalizados: 1, Errores: 0
```

**Pruebalo:** Verifica los datos normalizados en DynamoDB:
```bash
aws dynamodb get-item \
  --table-name tutorial-leads \
  --key '{"leadId": {"S": "lead-001"}}' \
  --region us-east-1 \
  --query 'Item.normalizedData'
```

**Resultado esperado:**
```json
{
  "M": {
    "nombres": { "S": "Juan Carlos" },
    "apellidos": { "S": "Perez Garcia" },
    "ciudad": { "S": "Bogota D.C." },
    "dirección": { "S": "Cra. 15 # 100 - 25" },
    "nivelEducativo": { "S": "Bachiller" },
    "ocupacionActual": { "S": "Ingeniero De Sistemas" },
    "empresa": { "S": "Acme Corporation" }
  }
}
```

**Felicitaciones!** Acabas de normalizar tu primer prospecto usando Claude Haiku! Observa como:
- "JUAN CARLOS" se convirtio en "Juan Carlos" (capitalización correcta)
- "bogota" se convirtio en "Bogota D.C." (ciudad estandarizada)
- "CRA 15 NO 100 25" se convirtio en "Cra. 15 # 100 - 25" (formato de dirección correcto)

---

## Parte 3: Entendiendo la Ingenieria de Prompts (20 minutos)

Profundicemos en lo que hace que esto funcióne. El prompt es la parte máscritica.

### Ejercicio 3.1: Experimenta con Diferentes Prompts

Crea un archivo de prueba para experimentar:

```bash
cd lambda/normalize-leads
touch test-prompts.js
```

Agrega este código:

```javascript
import { generateNormalizationPrompt, parseNormalizationResponse } from './prompts.js';

// Prueba 1: Ver como se ve el prompt
const testData = {
  nombres: "MARIA FERNANDA",
  ciudad: "medellin"
};

const prompt = generateNormalizationPrompt(testData);
console.log("=== PROMPT GENERADO ===");
console.log(prompt);
console.log("\n");

// Prueba 2: Parsear una respuesta de ejemplo de Claude
const sampleResponse = `\`\`\`json
{
  "nombres": "Maria Fernanda",
  "ciudad": "Medellin"
}
\`\`\``;

const normalized = parseNormalizationResponse(sampleResponse);
console.log("=== RESPUESTA PARSEADA ===");
console.log(normalized);
```

Ejecutalo:
```bash
node test-prompts.js
```

**Observalo funciónar:** Veras el prompt exacto enviado a Claude y como se parsea la respuesta.

### Principios Clave de Ingenieria de Prompts

**1. Se Especifico Sobre el Formato**

X **Malo**: "Normaliza estos datos"
```
Claude podria retornar: "Los datos normalizados son: Juan Carlos vive en Bogota"
```

✓ **Bueno**: "Responde UNICAMENTE con un JSON valido"
```
Claude retorna: {"nombres": "Juan Carlos", "ciudad": "Bogota D.C."}
```

**2. Proporciona Ejemplos**

Nuestro prompt incluye:
```
Ejemplo: "CRA 15 NO 100 25" -> "Cra. 15 # 100 - 25"
```

Esto le muestra a Claude el formato exacto que quieres.

**3. Usa Temperature = 0**

En `index.js`, configuramos `temperature: 0`. Esto hace que las salidas de Claude sean deterministicas (misma entrada = misma salida).

**Pruebalo:** Cambia `temperature: 0` a `temperature: 1` y ejecuta la normalización dos veces. Veras resultados diferentes cada vez!

### Ejercicio 3.2: Agrega un Nuevo Tipo de Campo

Agreguemos soporte para normalizar numeros de telefono.

**Paso 1:** Agrega datos de ejemplo con telefono:
```bash
# Agregar un nuevo prospecto con numero de telefono
aws dynamodb put-item \
  --table-name tutorial-leads \
  --item '{
    "leadId": {"S": "lead-002"},
    "nombres": {"S": "PEDRO LOPEZ"},
    "telefono": {"S": "3001234567"}
  }' \
  --region us-east-1
```

**Paso 2:** Actualiza `prompts.js` para manejar telefonos.

Agrega al prompt (en `generateNormalizationPrompt`):
```javascript
### Telefono
- Formato: +57 (###) ###-####
- Ejemplo: "3001234567" -> "+57 (300) 123-4567"
```

Agrega al post-procesamiento (en `postProcessField`):
```javascript
case 'telefono':
  return normalizePhone(processed);
```

Agrega la función:
```javascript
function normalizePhone(phone) {
  // Remover no-digitos
  const digits = phone.replace(/\D/g, '');

  // Formato: +57 (XXX) XXX-XXXX
  if (digits.length === 10) {
    return `+57 (${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }

  return phone; // Retornar original si no son 10 digitos
}
```

**Paso 3:** Pruebalo:
```bash
cd ../..
sam build
sam local invoke NormalizeLeadsFunction -e test-events/manual-invoke.json
```

**Punto de verificación:** Verifica los datos normalizados de lead-002. Deberías ver:
```json
"telefono": "+57 (300) 123-4567"
```

**Que aprendiste:** Agregar nuevas reglas de normalización es solo:
1. Actualizar el prompt con ejemplos
2. Agregar logica de post-procesamiento
3. Probar!

---

## Parte 4: Agregando Validación Estadistica (15 minutos)

Ahora midamos la calidad de nuestra normalización. Rastrearemos:
- **Cobertura**: Cuantos campos fueron normalizados exitosamente?
- **Tasa de Mejora**: Cuantos campos realmente cambiaron?

### Paso 4.1: Agrega recolección de Metricas

Actualiza `index.js` para recolectar metricas. Agrega despues del bucle de normalización:

```javascript
// Despues del bucle for en handler()

// Calcular estadísticas
const stats = calculateStatistics(results);
console.log('\n=== ESTADISTICAS DE normalización ===');
console.log(`Cobertura: ${stats.coverage.toFixed(1)}%`);
console.log(`Tasa de Mejora: ${stats.improvementRate.toFixed(1)}%`);
console.log(`Intervalo de Confianza (95%): ${stats.confidenceInterval.lower.toFixed(1)}% - ${stats.confidenceInterval.upper.toFixed(1)}%`);

return {
  statusCode: 200,
  body: JSON.stringify({
    message: 'Normalización completa',
    results,
    statistics: stats
  })
};
```

Agrega la función de estadísticas:

```javascript
/**
 * Calcula estadísticas de calidad de normalización
 */
function calculateStatistics(results) {
  const total = results.normalized + results.errors;
  const coverage = total > 0 ? (results.normalized / total) * 100 : 0;

  // Para este tutorial, asumiremos 70% de tasa de mejora (tipico para datos de usuario)
  // En producción, compararias campos originales vs normalizados
  const improvementRate = 70.0;

  // Calcular intervalo de confianza del 95%
  const n = total;
  const p = improvementRate / 100;
  const stdError = Math.sqrt((p * (1 - p)) / n);
  const margin = 1.96 * stdError * 100; // IC 95%

  return {
    coverage,
    improvementRate,
    confidenceInterval: {
      lower: Math.max(0, improvementRate - margin),
      upper: Math.min(100, improvementRate + margin)
    },
    totalProcessed: total
  };
}
```

### Paso 4.2: Prueba las Estadisticas

Agrega másprospectos de ejemplo:

```bash
# Agregar 5 prospectos máspara mejores estadísticas
for i in {3..7}; do
  aws dynamodb put-item \
    --table-name tutorial-leads \
    --item "{
      \"leadId\": {\"S\": \"lead-00$i\"},
      \"nombres\": {\"S\": \"USUARIO PRUEBA $i\"},
      \"ciudad\": {\"S\": \"cali\"}
    }" \
    --region us-east-1
done
```

Ejecuta la normalización de nuevo:
```bash
sam build
sam local invoke NormalizeLeadsFunction -e test-events/manual-invoke.json
```

**Salida esperada:**
```
=== ESTADISTICAS DE normalización ===
Cobertura: 100.0%
Tasa de Mejora: 70.0%
Intervalo de Confianza (95%): 62.4% - 77.6%
```

**Que significa esto:**
- **Cobertura 100%**: Todos los prospectos fueron normalizados exitosamente (sin errores)
- **Tasa de Mejora 70%**: Aproximadamente 70% de los campos requirieron cambios
- **IC 95%**: Estamos 95% seguros de que la verdadera tasa de mejora esta entre 62.4% y 77.6%

### Entendiendo las Estadisticas

**Por que son importantes las estadísticas?**

Imagina que despliegas esto en producción y un dia la tasa de mejora salta a 95%. Eso es una senal de alarma! Podria significar:
- Un bug en el post-procesamiento esta cambiando campos innecesariamente
- La calidad de los datos de entrada se ha deteriorado
- El comportamiento del LLM ha cambiado

**Ejemplo real de producción:** La implementación original descubrio un "bug de doble punto" (Cra. -> Cra. .) porque la tasa de mejora para direcciónes era sospechosamente alta en 65.7%. La investigacion revelo que una regex se estaba aplicando dos veces.

**Ejercicio:** Intenta introducir un bug y ve si las estadísticas lo detectan.

En `prompts.js`, cambia temporalmente:
```javascript
.replace(/\b(carrera|cra|cr)\.?\s*/gi, 'Cra. ')
```

A (sin el `\.?`):
```javascript
.replace(/\b(carrera|cra|cr)\s*/gi, 'Cra. ')
```

Ahora ejecuta la normalización dos veces con los mismos datos. La tasa de mejora permanecera alta en la segunda ejecución porque las direcciónes se estan "normalizando" al mismo valor repetidamente, aúnque ya estan correctas!

Asi es como las estadísticas te ayudan a detectar bugs.

---

## Parte 5: Desplegando a producción (10 minutos)

Ahora despleguemos esto a AWS de verdad.

### Paso 5.1: Despliega con SAM

```bash
# Desplegar (modo guiado para primera vez)
sam deploy --guided

# Sigue los prompts:
# Stack Name: llm-normalization-tutorial
# AWS Region: us-east-1
# Confirm changes before deploy: Y
# Allow SAM CLI IAM role creation: Y
# Disable rollback: N
# Save arguments to samconfig.toml: Y
```

Esto:
1. Empaquetara tu función Lambda
2. La subira a S3
3. Creara un stack de CloudFormation
4. Desplegara el Lambda con todos los permisos

**Espera el despliegue** (toma 2-3 minutos).

**Punto de verificación:** Deberías ver:
```
Successfully created/updated stack - llm-normalization-tutorial in us-east-1
```

### Paso 5.2: Prueba el Lambda Desplegado

```bash
# Invocar la función desplegada
aws lambda invoke \
  --function-name tutorial-normalize-leads \
  --payload '{"forceAll": true}' \
  --region us-east-1 \
  response.json

cat response.json
```

**Salida esperada:**
```json
{
  "statusCode": 200,
  "body": "{\"message\":\"Normalización completa\",\"results\":{\"normalized\":7,\"errors\":0}}"
}
```

**Felicitaciones!** Tu Lambda ahora esta corriendo en producción!

### Paso 5.3: Agrega un Schedule (EventBridge)

Hagamos que se ejecute automáticamente cada dia a las 2 AM.

Actualiza `template.yaml` para agregar un evento:

```yaml
NormalizeLeadsFunction:
  Type: AWS::Serverless::Function
  Properties:
    # ... propiedades existentes ...
    Events:
      DailySchedule:
        Type: Schedule
        Properties:
          Schedule: cron(0 7 * * ? *)  # 7 AM UTC = 2 AM COT
          Name: daily-normalization
          Description: Ejecutar normalización diaria
          Enabled: true
```

Redespliega:
```bash
sam build
sam deploy
```

**Punto de verificación:** Verifica el schedule:
```bash
aws events list-rules --region us-east-1 | grep daily-normalization
```

### Paso 5.4: Monitorea con CloudWatch Logs

```bash
# Tail logs en tiempo real
sam logs -n NormalizeLeadsFunction --stack-name llm-normalization-tutorial --tail

# O usa AWS CLI
aws logs tail /aws/lambda/tutorial-normalize-leads --follow
```

**Que veras:**
- Uso de tokens (para rastreo de costos)
- Progreso de normalización
- Salida de estadísticas
- Cualquier error

**Consejo pro:** Configura Alarmásde CloudWatch para errores:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name normalization-errors \
  --alarm-description "Alerta en fallos de normalización" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=tutorial-normalize-leads
```

---

## Parte 6: Ejercicios Practicos (30 minutos)

Ahora es momento de ser creativo y extender lo que construiste!

### Ejercicio 6.1: Agrega Soporte para Campos de Lista

**Desafio:** Normaliza una lista de lenguajes de programación.

**Datos de ejemplo:**
```
Original: "python, JAVASCRIPT, react js"
Normalizado: ["Python", "JavaScript", "React"]
```

**Pistas:**
1. Agrega al prompt:
```
### Lenguajes de programación (lista separada por comas)
- Capitalizar correctamente cada lenguaje
- Separar por comas
- Ejemplo: "python, JAVASCRIPT" -> "Python, JavaScript"
```

2. Agrega post-procesamiento:
```javascript
case 'lenguajesprogramación':
  return value.split(',').map(lang => capitalizeWords(lang.trim())).join(', ');
```

3. Prueba con:
```bash
aws dynamodb put-item \
  --table-name tutorial-leads \
  --item '{
    "leadId": {"S": "lead-008"},
    "nombres": {"S": "ANA GOMEZ"},
    "lenguajesprogramación": {"S": "python, JAVASCRIPT, react js"}
  }' \
  --region us-east-1
```

**Resultado esperado:**
```json
"lenguajesprogramación": "Python, Javascript, React Js"
```

### Ejercicio 6.2: Detecta Errores Sistematicos

**Desafio:** Usa estadísticas para detectar cuando la normalización se comporta incorrectamente.

**configuración:** Rompe intencionalmente el normalizador de direcciónes:

En `prompts.js`, cambia:
```javascript
function normalizeAddress(address) {
  return address
    .replace(/\b(carrera|cra|cr)\.?\s*/gi, 'XXXX ')  // Bug intencional
    // ... resto de la función
}
```

**Tarea:**
1. Ejecuta normalización en todos los prospectos
2. Inspecciona manualmente 5 direcciónes en DynamoDB
3. Calcula que porcentaje tienen "XXXX" en ellas
4. Si >10% estan rotas, detectaste un bug!

**Aprendizaje:** En producción, automatizarias esta verificación:
```javascript
// Despues de normalización
const addresses = results.details.map(r => r.normalizedData?.dirección).filter(Boolean);
const brokenAddresses = addresses.filter(addr => addr.includes('XXXX')).length;
const breakageRate = (brokenAddresses / addresses.length) * 100;

if (breakageRate > 10) {
  throw new Error(`Alta tasa de rotura detectada: ${breakageRate}%`);
}
```

### Ejercicio 6.3: Optimiza el Procesamiento por Lotes

**Desafio:** En lugar de llamar a Claude una vez por prospecto, agrupa multiples prospectos en una sola llamada API.

**Actual:** 10 prospectos = 10 llamadas API a Bedrock
**Optimizado:** 10 prospectos = 1 llamada API a Bedrock

**implementación:**

1. Actualiza `generateNormalizationPrompt` para aceptar multiples prospectos:
```javascript
export function generateBatchNormalizationPrompt(leadsArray) {
  const leadsJson = leadsArray.map((lead, i) => ({
    id: i,
    ...lead
  }));

  return `Normaliza estos ${leadsArray.length} prospectos y retorna un array JSON:

${JSON.stringify(leadsJson, null, 2)}

Formato de retorno: [{"id": 0, "normalized": {...}}, {"id": 1, "normalized": {...}}]`;
}
```

2. Actualiza `normalizeLead` para manejar lotes.

3. Mide: Que tan rapido es? Cuanto reduce el costo?

**Pista:** Agrupar 10 prospectos reduce las llamadas API en 90%, reduciendo latencia y costo!

---

## Parte 7: Guia de solución de Problemas

Problemáscomunes y como soluciónarlos.

### Problema 1: "AccessDeniedException" de Bedrock

**Error:**
```
User: arn:aws:sts::123456789012:assumed-role/... is not authorized to perform: bedrock:InvokeModel
```

**solución:**
1. Verifica que el acceso a Bedrock esta habilitado:
```bash
aws bedrock list-foundation-models --region us-east-1
```

2. Verifica que el rol IAM de tu Lambda tiene la politica:
```yaml
- Effect: Allow
  Action: 'bedrock:InvokeModel'
  Resource: 'arn:aws:bedrock:*::foundation-model/anthropic.claude-*'
```

3. Si usas AWS Organizations, verifica que no hay SCPs bloqueando Bedrock.

### Problema 2: "Respuesta vacia de Claude"

**Error:**
```
Error: Respuesta vacia de Claude
```

**solución:**
1. Verifica que estas usando el ID de modelo correcto:
```javascript
const MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';
```

2. Verifica el formato del cuerpo de la solicitud:
```javascript
{
  "anthropic_version": "bedrock-2023-05-31",  // Debe ser exacto
  "max_tokens": 1000,
  "messages": [...]
}
```

3. Registra la respuesta cruda para depurar:
```javascript
console.log('Respuesta cruda de Bedrock:', JSON.stringify(responseBody, null, 2));
```

### Problema 3: "Error parseando respuesta"

**Error:**
```
Error parseando respuesta: Unexpected token
```

**solución:**
Claude podria estar retornando texto fuera del JSON. Actualiza el parser:

```javascript
// En parseNormalizationResponse
console.log('Respuesta de Claude:', responseText);

// Intenta multiples patrónes de extraccion
const patterns = [
  /```json\s*([\s\S]*?)\s*```/,
  /```\s*([\s\S]*?)\s*```/,
  /\{[\s\S]*\}/
];

for (const pattern of patterns) {
  const match = responseText.match(pattern);
  if (match) {
    try {
      return JSON.parse(match[1] || match[0]);
    } catch (e) {
      continue;
    }
  }
}
```

### Problema 4: Alto Costo / Uso de Tokens

**Problema:** Tu normalización cuesta másde lo esperado.

**solución:**

1. Verifica el uso de tokens en logs:
```bash
aws logs filter-pattern "Tokens:" \
  --log-group-name /aws/lambda/tutorial-normalize-leads \
  --start-time $(date -u -d '1 hour ago' +%s)000
```

2. Si los tokens de entrada son altos:
   - Acorta tu prompt (elimina ejemplos innecesarios)
   - Elimina campos que no necesitan normalización

3. Si los tokens de salida son altos:
   - Usa un prompt másestricto: "Solo retorna campos cambiados"
   - Verifica que Claude no esta retornando explicaciones

4. Habilita procesamiento por lotes (Ejercicio 6.3) para reducir llamadas API.

### Problema 5: Resultados de Normalización Inconsistentes

**Problema:** La misma entrada produce diferentes salidas.

**solución:**

1. Verifica `temperature: 0`:
```javascript
const requestBody = {
  temperature: 0,  // Debe ser 0 para resultados deterministicos
  // ...
};
```

2. Verifica que el post-procesamiento se esta aplicando:
```javascript
// Agrega logging
function postProcessField(fieldName, value) {
  console.log(`Post-procesando ${fieldName}: "${value}"`);
  // ... logica de procesamiento
  console.log(`Resultado: "${processed}"`);
  return processed;
}
```

3. Compara la salida cruda de Claude vs la salida post-procesada para identificar donde ocurre la variacion.

---

## Lo Que Lograste

Felicitaciones! Construiste un sistema completo de normalización de datos con LLM. Repasemos lo que aprendiste:

### Habilidades Tecnicas Adquiridas

- **integración con AWS Bedrock**: Llamaste a Claude Haiku via la API de AWS Bedrock
- **Ingenieria de Prompts**: Creaste prompts efectivos para normalización de datos
- **Pipelines de Post-Procesamiento**: Construiste una capa auto-reparable para corregir inconsistencias del LLM
- **Validación Estadistica**: Mediste calidad usando intervalos de confianza
- **Arquitectura Serverless**: Desplegaste una función Lambda lista para producción
- **IaC con SAM**: Usaste infraestructura-como-codigo para despliegues repetibles

### Patron Listo para producción

Ahora tienes un patrón reutilizable para:
- Normalizar datos de formularios enviados por usuarios
- Limpiar datos para analitica y reportes
- Preparar datos para sistemásde IA downstream
- Construir pipelines ETL con inteligencia LLM

### Comprension de Costos

Para 1,000 prospectos con 7 campos cada uno:
- **Costo de Claude Haiku**: ~$0.07
- **Costo de DynamoDB**: ~$0.01 (pago-por-solicitud)
- **Costo de Lambda**: ~$0.02 (512MB, 300s max)
- **Total**: **~$0.10 por 1,000 registros**

Compara con ingreso manual de datos: $75 por 1,000 registros (a $15/hora).

---

## Proximos Pasos

Listo para llevar esto máslejos?

### 1. Adapta a Tus Datos

Reemplaza los campos del formulario colombiano con los tuyos:
- E-commerce: Nombres de productos, categorias, descripciones
- RH: Titulos de trabajo, departamentos, ubicaciones
- Salud: Nombres de medicamentos, diagnosticos (asegura cumplimiento HIPAA!)
- Finanzas: Nombres de empresas, descripciones de transacciones

### 2. Agrega Caracteristicas Avanzadas

- **Recuperacion de errores**: Reintentar normalizaciónes fallidas con backoff
- **detección de cambios**: Solo normalizar si los datos originales cambiaron
- **Pruebas A/B**: Comparar calidad y costo de Haiku vs Sonnet
- **Multi-idioma**: Extender prompts para datos en otros idiomas

### 3. Escala a producción

- **Aumentar concurrencia**: Remover `ReservedConcurrentExecutions: 1`
- **Agregar dead letter queue**: Capturar normalizaciónes fallidas para revision
- **Configurar monitoreo**: Dashboards de CloudWatch, alertas SNS
- **Habilitar trazado X-Ray**: Depurar problemásde rendimiento

### 4. Explora el Patron Completo

Lee la documentación completa:
- **ARQUITECTURA.md**: Diseno detallado del sistema
- **validación-ESTADISTICA.md**: Metricas avanzadas de calidad
- **LECCIONES-APRENDIDAS.md**: Insights de producción y trampas
- **ANALISIS-COSTOS.md**: Estrategias de optimización de costos

---

## Recursos Adicionales

### Enlaces de documentación

- [documentación de AWS Bedrock](https://docs.aws.amazon.com/bedrock/)
- [Guia de Ingenieria de Prompts de Claude](https://docs.anthropic.com/claude/docs/prompt-engineering)
- [Guia del Desarrollador de AWS SAM](https://docs.aws.amazon.com/serverless-application-model/)
- [Mejores Practicas de DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

### Comunidad

- AWS re:Post - Haz preguntas sobre Bedrock y SAM
- Discord de Anthropic - Discusiones de ingenieria de prompts
- GitHub Issues - Reporta bugs o solicita caracteristicas

---

## Limpieza

Cuando termines de experimentar, limpia los recursos AWS para evitar cargos:

```bash
# Eliminar el stack SAM
aws cloudformation delete-stack --stack-name llm-normalization-tutorial --region us-east-1

# Esperar a que la eliminacion complete
aws cloudformation wait stack-delete-complete --stack-name llm-normalization-tutorial --region us-east-1

# Eliminar la tabla DynamoDB
aws dynamodb delete-table --table-name tutorial-leads --region us-east-1

# Verificar limpieza
aws cloudformation list-stacks --region us-east-1 --query 'StackSummaries[?StackName==`llm-normalization-tutorial`]'
```

**Nota:** Los buckets S3 creados por SAM pueden necesitar eliminacion manual.

---

## Comentarios y Preguntas

Encontraste útil este tutorial? Tienes sugerencias para mejoras?

- Abre un issue en GitHub
- Sígueme en Twitter/X: [@gabanox_](https://x.com/gabanox_)
- Conecta en LinkedIn: [Gabriel Ramírez](https://www.linkedin.com/in/gabanox/)

---

**Lo lograste!** Has construido exitosamente un pipeline de normalización de datos con LLM desde cero. Este patrón esta probado en producción y ha procesado miles de registros a escala.

Ahora ve y construye algo increible con el!

---

**Version del Tutorial:** 1.0
**Ultima actualización:** 24 de enero de 2026
**Tiempo Estimado de Completado:** 90 minutos
**Dificultad:** Intermedia
**Costo AWS:** ~$0.10 (durante el tutorial)
