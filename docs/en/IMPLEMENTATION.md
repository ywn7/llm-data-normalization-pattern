> **Language**: [English](./IMPLEMENTATION.md) | [Espanol](./es/IMPLEMENTACION.md)

# Implementation Guide

**Step-by-step guide to implementing the LLM-Powered Data Normalization ETL Pattern**

## Overview

This guide walks through building a production-ready data normalization pipeline using Claude 3 Haiku via AWS Bedrock. You'll learn how to:

1. Set up AWS infrastructure with SAM
2. Implement the Lambda function with prompt engineering
3. Build a post-processing pipeline to fix LLM inconsistencies
4. Add statistical validation for quality monitoring
5. Deploy and test in production

**Estimated time**: 4-6 hours (including testing)

## Prerequisites

- AWS Account with Bedrock access (request Claude access if needed)
- AWS CLI configured with credentials
- AWS SAM CLI installed (`brew install aws-sam-cli` on macOS)
- Node.js 22.x or later
- Basic understanding of Lambda, DynamoDB, and EventBridge

## Step 1: Infrastructure Setup (SAM Template)

### 1.1 Create SAM Template

Create `template.yaml` in your project root:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: LLM-Powered Data Normalization ETL

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
  # Configuration table (optional but recommended)
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

  # Lambda function
  NormalizeLeadsFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: normalize-leads
      Description: LLM-powered data normalization using Claude 3 Haiku
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
        # Scheduled execution: Daily at 2 AM COT (7 AM UTC)
        DailyNormalization:
          Type: Schedule
          Properties:
            Schedule: cron(0 7 * * ? *)
            Name: daily-normalization
            Description: Trigger daily data normalization
            Enabled: true
        # Manual trigger via API (optional)
        NormalizeApi:
          Type: Api
          Properties:
            Path: /normalize
            Method: POST

  # Note: LeadsTable should already exist in your environment
  # If creating from scratch, uncomment below:
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
    Description: Normalize Leads Lambda ARN
    Value: !GetAtt NormalizeLeadsFunction.Arn

  NormalizeApiEndpoint:
    Description: API endpoint for manual normalization
    Value: !Sub 'https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod/normalize'
```

### 1.2 Create Lambda Directory Structure

```bash
mkdir -p lambda/normalize-leads
cd lambda/normalize-leads
npm init -y
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

## Step 2: Lambda Implementation

### 2.1 Main Handler (`lambda/normalize-leads/index.js`)

```javascript
/**
 * Normalize Leads Lambda Handler
 *
 * ETL system that normalizes lead data using Claude Haiku via AWS Bedrock.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { generateNormalizationPrompt, parseNormalizationResponse } from './prompts.js';

// Initialize AWS clients (outside handler for container reuse)
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Configuration from environment
const LEADS_TABLE = process.env.LEADS_TABLE;
const CONFIG_TABLE = process.env.CONFIG_TABLE;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const NORMALIZATION_TTL_DAYS = parseInt(process.env.NORMALIZATION_TTL_DAYS || '7', 10);
const MAX_LEADS_PER_RUN = parseInt(process.env.MAX_LEADS_PER_RUN || '50', 10);

/**
 * Default configuration (used if CONFIG_TABLE doesn't exist)
 */
const DEFAULT_CONFIG = {
  fieldsToNormalize: [
    'nombres',
    'apellidos',
    'direccion',
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
 * Main Lambda handler
 */
export const handler = async (event) => {
  const startTime = Date.now();
  const isScheduled = event.source === 'aws.events';
  const isManualTrigger = !isScheduled;

  console.log(`Starting ${isScheduled ? 'scheduled' : 'manual'} normalization run...`);

  try {
    // Load configuration
    const config = await loadConfig();

    if (!config.enabled) {
      console.log('Normalization is disabled via configuration');
      return successResponse({
        message: 'Normalization is disabled',
        enabled: false
      });
    }

    // Parse force option from manual trigger
    const forceAll = isManualTrigger && (
      event.forceAll === true ||
      event.queryStringParameters?.forceAll === 'true' ||
      (event.body && JSON.parse(event.body).forceAll === true)
    );

    // Find leads that need normalization
    const leadsToNormalize = await findLeadsToNormalize(config, forceAll);

    if (leadsToNormalize.length === 0) {
      console.log('No leads require normalization');
      return successResponse({
        message: 'No leads require normalization',
        leadsProcessed: 0,
        duration: Date.now() - startTime
      });
    }

    console.log(`Found ${leadsToNormalize.length} leads to normalize`);

    // Process in batches
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
          console.error(`Error normalizing lead ${lead.leadId}:`, error.message);
          results.errors++;
          results.details.push({
            leadId: lead.leadId,
            status: 'error',
            error: error.message
          });
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + effectiveBatchSize < effectiveMaxLeads) {
        await sleep(500);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`Normalization complete: ${results.normalized} normalized, ${results.errors} errors, ${duration}ms`);

    return successResponse({
      message: 'Normalization complete',
      ...results,
      duration,
      config: {
        batchSize: effectiveBatchSize,
        maxLeadsPerRun: effectiveMaxLeads,
        fieldsNormalized: config.fieldsToNormalize
      }
    });

  } catch (error) {
    console.error('Normalization run failed:', error);
    return errorResponse(500, `Error en normalización: ${error.message}`);
  }
};

/**
 * Load normalization configuration from DynamoDB
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
    // If table doesn't exist or config not found, use defaults
    console.log('Using default configuration:', error.message);
    return DEFAULT_CONFIG;
  }
}

/**
 * Find leads that need normalization
 * - normalizedAt is missing
 * - normalizedAt is older than TTL
 */
async function findLeadsToNormalize(config, forceAll = false) {
  const ttlMs = (config.normalizationTTLDays || NORMALIZATION_TTL_DAYS) * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - ttlMs;

  const leads = [];
  let lastEvaluatedKey = null;

  do {
    const params = {
      TableName: LEADS_TABLE,
      ProjectionExpression: 'leadId, nombres, apellidos, direccion, ciudad, nivelEducativo, ocupacionActual, empresa, normalizedAt, normalizedData',
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

    // Safety limit
    if (leads.length >= config.maxLeadsPerRun) {
      break;
    }
  } while (lastEvaluatedKey);

  return leads;
}

/**
 * Normalize a single lead using Claude Haiku
 */
async function normalizeLead(lead, fieldsToNormalize) {
  // Extract only the fields that need normalization
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
      reason: 'No fields to normalize'
    };
  }

  // Generate prompt and call Claude
  const prompt = generateNormalizationPrompt(fieldsData);
  const normalizedFields = await callClaude(prompt);

  // Save normalized data back to DynamoDB
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
 * Call Claude Haiku for normalization
 */
async function callClaude(prompt) {
  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1000,
    temperature: 0, // Deterministic for consistent normalization
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

  // Log token usage for cost monitoring
  console.log('Token usage:', {
    input: responseBody.usage?.input_tokens || 0,
    output: responseBody.usage?.output_tokens || 0
  });

  const responseText = responseBody.content?.[0]?.text;
  if (!responseText) {
    throw new Error('Empty response from Claude');
  }

  return parseNormalizationResponse(responseText);
}

/**
 * Sleep utility for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Success response helper
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
 * Error response helper
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

### 2.2 Prompt Engineering (`lambda/normalize-leads/prompts.js`)

This is the **most critical** file - it contains the prompt template and post-processing pipeline.

```javascript
/**
 * Normalization Prompts for Claude Haiku
 *
 * Field-specific prompts optimized for Colombian data.
 */

/**
 * Colombian city name mappings for standardization
 */
const CITY_MAPPINGS = {
  // Bogota variants
  'bogota': 'Bogota D.C.',
  'bogotá': 'Bogota D.C.',
  'bogota dc': 'Bogota D.C.',
  'bogota d.c.': 'Bogota D.C.',
  'bogota d.c': 'Bogota D.C.',
  'santafe de bogota': 'Bogota D.C.',

  // Medellin variants
  'medellin': 'Medellin',
  'medellín': 'Medellin',

  // Cali variants
  'cali': 'Cali',
  'santiago de cali': 'Cali',

  // Add more cities as needed
};

/**
 * Known educational institutions for standardization
 */
const INSTITUTION_PATTERNS = [
  { pattern: /sena|servicio nacional de aprendizaje/i, standard: 'SENA' },
  { pattern: /universidad nacional/i, standard: 'Universidad Nacional de Colombia' },
  { pattern: /u\s*nal|unal/i, standard: 'Universidad Nacional de Colombia' },
  { pattern: /universidad de los andes|uniandes/i, standard: 'Universidad de los Andes' },
  // Add more institutions as needed
];

/**
 * Generate the normalization prompt for Claude Haiku
 */
export function generateNormalizationPrompt(fieldsData) {
  const fieldsList = Object.entries(fieldsData)
    .map(([key, value]) => `- ${key}: "${value}"`)
    .join('\n');

  return `Normaliza los siguientes campos de un formulario de inscripcion en Colombia. Aplica estas reglas:

## Reglas de Normalizacion

### Nombres y Apellidos
- Capitalizar correctamente (primera letra mayuscula)
- Eliminar espacios extras
- Mantener tildes y caracteres especiales
- Ejemplo: "JUAN CARLOS PEREZ" -> "Juan Carlos Perez"

### Direccion
- Formato estandar colombiano: "Calle/Carrera/Avenida # - #"
- Abreviaturas: Cra., Cl., Av., Tr., Dg.
- Ejemplo: "CRA 15 NO 100 25" -> "Cra. 15 # 100 - 25"

### Ciudad
- Usar nombre oficial de la ciudad
- Bogota siempre como "Bogota D.C."
- Remover "Colombia" si esta incluido
- Ejemplo: "bogota colombia" -> "Bogota D.C."

### Nivel Educativo
- Estandarizar a: Primaria, Bachiller, Tecnico, Tecnologo, Profesional, Especialista, Magister, Doctorado
- Ejemplo: "BACHILLERATO COMPLETO" -> "Bachiller"

### Ocupacion/Empresa
- Capitalizar correctamente
- Eliminar espacios extras
- Estandarizar nombres conocidos (SENA, universidades)

## Campos a Normalizar

${fieldsList}

## Formato de Respuesta

Responde UNICAMENTE con un JSON valido:

{
  "campo1": "valor normalizado",
  "campo2": "valor normalizado"
}

Solo incluye campos que fueron modificados. Si un campo ya esta correctamente formateado, omitelo del JSON.`;
}

/**
 * Parse and validate Claude's normalization response
 */
export function parseNormalizationResponse(responseText) {
  // Extract JSON from response (handle potential markdown code blocks)
  let jsonStr = responseText;

  // Remove markdown code blocks if present
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else {
    // Try to find raw JSON object
    const objectMatch = responseText.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // Validate it's an object
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Response must be a JSON object');
    }

    // Post-process each field
    const normalized = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim() !== '') {
        // Apply additional local normalization
        normalized[key] = postProcessField(key, value);
      }
    }

    return normalized;
  } catch (error) {
    console.error('Failed to parse normalization response:', error.message);
    console.error('Raw response:', responseText.substring(0, 500));
    throw new Error(`Error parsing response: ${error.message}`);
  }
}

/**
 * Apply local post-processing rules
 *
 * CRITICAL: This layer catches LLM inconsistencies
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

    case 'direccion':
      return normalizeAddress(processed);

    case 'nivelEducativo':
      return normalizeEducationLevel(processed);

    default:
      return processed;
  }
}

/**
 * Capitalize first letter of each word
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
 * Normalize Colombian address format
 *
 * IMPORTANT: Note the optional dot check (\.?) to prevent double-dot bug
 */
function normalizeAddress(address) {
  let normalized = address
    // Standardize street type abbreviations (include optional dot to avoid ". .")
    .replace(/\b(carrera|cra|cr|kra)\.?\s*/gi, 'Cra. ')
    .replace(/\b(calle|cl|cll)\.?\s*/gi, 'Cl. ')
    .replace(/\b(avenida|av|avda)\.?\s*/gi, 'Av. ')
    .replace(/\b(transversal|tr|trans|tv|transv)\.?\s*/gi, 'Tr. ')
    .replace(/\b(diagonal|dg|diag)\.?\s*/gi, 'Dg. ')
    // Standardize number indicators
    .replace(/\bno\b\.?\s*/gi, '# ')
    .replace(/\bnumero\b\.?\s*/gi, '# ')
    .replace(/\bn[°o]\s*/gi, '# ')
    // Clean up double dots that might have slipped through
    .replace(/\.\s*\./g, '.')
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Normalize education level to standard values
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

  // Return original if no match (with proper capitalization)
  return capitalizeWords(level);
}

export default {
  generateNormalizationPrompt,
  parseNormalizationResponse
};
```

## Step 3: Testing

### 3.1 Unit Tests (`lambda/normalize-leads/__tests__/prompts.test.js`)

```javascript
import { generateNormalizationPrompt, parseNormalizationResponse } from '../prompts.js';

describe('parseNormalizationResponse', () => {
  test('parses valid JSON response', () => {
    const response = '{"nombres": "Juan Carlos", "ciudad": "Bogota D.C."}';
    const result = parseNormalizationResponse(response);

    expect(result.nombres).toBe('Juan Carlos');
    expect(result.ciudad).toBe('Bogota D.C.');
  });

  test('handles address with existing dot (prevents ". ." bug)', () => {
    const response = '{"direccion": "Cra. 80 I # 51 - 09"}';
    const result = parseNormalizationResponse(response);

    expect(result.direccion).toBe('Cra. 80 I # 51 - 09');
    expect(result.direccion).not.toContain('. .');
  });

  test('normalizes city names', () => {
    const response = '{"ciudad": "bogota"}';
    const result = parseNormalizationResponse(response);

    expect(result.ciudad).toBe('Bogota D.C.');
  });

  test('normalizes education level', () => {
    const response = '{"nivelEducativo": "bachillerato completo"}';
    const result = parseNormalizationResponse(response);

    expect(result.nivelEducativo).toBe('Bachiller');
  });
});
```

Run tests:
```bash
npm test
```

### 3.2 Local Testing with SAM

```bash
# Build Lambda
sam build

# Test with sample event
cat > test-event.json << EOF
{
  "forceAll": true
}
EOF

sam local invoke NormalizeLeadsFunction -e test-event.json
```

## Step 4: Deployment

### 4.1 Deploy with SAM

```bash
# First deployment (guided)
sam deploy --guided

# Follow prompts:
# Stack Name: llm-normalization-etl
# AWS Region: us-east-1
# Confirm changes: y
# Allow SAM CLI IAM role creation: y
# Disable rollback: n
# Save arguments to samconfig.toml: y

# Subsequent deployments
sam deploy
```

### 4.2 Verify Deployment

```bash
# Check stack outputs
aws cloudformation describe-stacks \
  --stack-name llm-normalization-etl \
  --query 'Stacks[0].Outputs' \
  --output table

# Invoke Lambda manually
aws lambda invoke \
  --function-name normalize-leads \
  --payload '{"forceAll": true}' \
  response.json

cat response.json
```

### 4.3 Monitor Execution

```bash
# Tail CloudWatch logs
sam logs -n NormalizeLeadsFunction --stack-name llm-normalization-etl --tail

# Check DynamoDB for normalized data
aws dynamodb get-item \
  --table-name leads \
  --key '{"leadId": {"S": "your-lead-id"}}' \
  --query 'Item.normalizedData'
```

## Step 5: Production Hardening

### 5.1 Add CloudWatch Alarms

```yaml
# Add to template.yaml
NormalizationErrorAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: normalization-errors
    AlarmDescription: Alert when normalization fails repeatedly
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
    DisplayName: Normalization Alerts
    Subscription:
      - Endpoint: your-email@example.com
        Protocol: email
```

### 5.2 Enable X-Ray Tracing

```yaml
# Add to Globals section
Globals:
  Function:
    Tracing: Active
```

### 5.3 Configure Reserved Concurrency

```yaml
NormalizeLeadsFunction:
  Type: AWS::Serverless::Function
  Properties:
    ReservedConcurrentExecutions: 1  # Prevent parallel execution
```

## Prompt Engineering Best Practices

### 1. Be Specific About Output Format

❌ **Bad**: "Normalize this data"
✅ **Good**: "Responde UNICAMENTE con un JSON valido"

### 2. Provide Examples

```
Ejemplo: "CRA 15 NO 100 25" -> "Cra. 15 # 100 - 25"
```

### 3. Use Temperature = 0 for Determinism

```javascript
temperature: 0  // Consistent outputs for same inputs
```

### 4. Handle Edge Cases in Post-Processing

Don't rely on LLM for:
- Exact abbreviation formats ("Cra." vs "Cra")
- Removing double spaces
- Consistent capitalization

Use regex post-processing instead.

## Post-Processing Pipeline Design

The post-processing layer is **critical** for production quality. Here's why:

### Problem: LLM Inconsistency

Even at temperature=0, Claude might return:
- "Cra. 15" vs "Cra 15" (missing dot)
- "Juan Carlos" vs "Juan  Carlos" (double space)
- "Bogotá" vs "Bogota" (missing accent)

### Solution: Dual-Layer Normalization

```
Input → Claude (context-aware) → Post-processing (deterministic) → Output
```

**Layer 1 (LLM)**: Handle complex variations
- "Ingeniero de Sistemas" vs "Ing. Sistemas" vs "Systems Engineer"

**Layer 2 (Regex)**: Enforce exact formats
- Always "Cra." with dot and space
- Always "Bogota D.C." for Bogotá
- Always capitalized names

### Example: Address Normalization

```javascript
// LLM might return any of these:
"Carrera 15 No 100-25"
"Cra 15 # 100-25"
"Cra. 15 No. 100-25"

// Post-processing enforces:
"Cra. 15 # 100 - 25"  // Always this format
```

## Debugging Tips

### 1. Log Token Usage

```javascript
console.log('Token usage:', {
  input: responseBody.usage?.input_tokens || 0,
  output: responseBody.usage?.output_tokens || 0
});
```

**Why?** Catch cost spikes early.

### 2. Log Raw LLM Responses

```javascript
console.error('Raw response:', responseText.substring(0, 500));
```

**Why?** Identify prompt engineering issues.

### 3. Test with Diverse Data

Create a test dataset with:
- All caps: "JUAN CARLOS"
- All lowercase: "juan carlos"
- Mixed: "JuAn CaRlOs"
- Special chars: "José María"
- Abbreviations: "Ing. de Sistemas"

### 4. Validate Post-Processing

```javascript
// Add assertions in tests
expect(result.direccion).not.toContain('. .');  // No double dots
expect(result.ciudad).toMatch(/^[A-Z]/);        // Always capitalized
```

## Next Steps

- **[STATISTICAL-VALIDATION.md](./STATISTICAL-VALIDATION.md)**: Measure normalization quality
- **[LESSONS-LEARNED.md](./LESSONS-LEARNED.md)**: Production insights
- **[COST-ANALYSIS.md](./COST-ANALYSIS.md)**: Cost optimization strategies

---

**Last Updated**: January 24, 2026
