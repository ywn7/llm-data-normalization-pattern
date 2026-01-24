/**
 * Normalize Leads Lambda Handler
 *
 * ETL system that normalizes lead data using Claude Haiku via AWS Bedrock.
 * Runs on a schedule (EventBridge) or can be triggered manually.
 *
 * Features:
 * - Batch processing (configurable batch size)
 * - Idempotent operations with normalizedAt timestamp
 * - Cost-efficient using Claude 3 Haiku
 * - Configurable normalization rules via DynamoDB
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { generateNormalizationPrompt, parseNormalizationResponse } from './prompts.js';

// Initialize AWS clients
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Configuration
const LEADS_TABLE = process.env.LEADS_TABLE || 'awsrestart-leads';
const CONFIG_TABLE = process.env.CONFIG_TABLE || 'awsrestart-normalization-config';
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const NORMALIZATION_TTL_DAYS = parseInt(process.env.NORMALIZATION_TTL_DAYS || '7', 10);
const MAX_LEADS_PER_RUN = parseInt(process.env.MAX_LEADS_PER_RUN || '50', 10);

// CORS headers for manual API invocations
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
};

/**
 * Default normalization configuration
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
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const startTime = Date.now();
  const isScheduled = isScheduledInvocation(event);
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
    // Supports: direct invocation { forceAll: true }, API Gateway query string, or API Gateway body
    const forceAll = isManualTrigger && (
      event.forceAll === true ||  // Direct Lambda invocation
      event.queryStringParameters?.forceAll === 'true' ||  // API Gateway query string
      (event.body && JSON.parse(event.body).forceAll === true)  // API Gateway body
    );

    // Scan for leads that need normalization
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
      // Only fetch fields we need
      ProjectionExpression: 'leadId, nombres, apellidos, direccion, ciudad, nivelEducativo, ocupacionActual, empresa, normalizedAt, normalizedData',
      Limit: 100
    };

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await docClient.send(new ScanCommand(params));

    for (const lead of result.Items || []) {
      // Include lead if:
      // 1. forceAll is true, OR
      // 2. normalizedAt is missing, OR
      // 3. normalizedAt is older than cutoff time
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
 * Check if this is a scheduled invocation (EventBridge)
 */
function isScheduledInvocation(event) {
  return event.source === 'aws.events' || event['detail-type'] === 'Scheduled Event';
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
    headers: CORS_HEADERS,
    body: JSON.stringify(data)
  };
}

/**
 * Error response helper
 */
function errorResponse(statusCode, message) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: message })
  };
}

export default { handler };
