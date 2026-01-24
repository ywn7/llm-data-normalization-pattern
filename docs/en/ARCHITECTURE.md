> **Language**: [English](./ARCHITECTURE.md) | [Español](../es/ARQUITECTURA.md)

# Architecture Deep Dive

**LLM-Powered Data Normalization ETL Pattern**

## System Overview

This pattern implements a scheduled ETL pipeline that normalizes user-submitted data using Claude 3 Haiku via AWS Bedrock. The architecture prioritizes cost efficiency, data integrity, and operational simplicity.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AWS Cloud Architecture                          │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│   EventBridge Rule   │  Scheduled trigger
│   Daily at 2 AM COT  │  (cron: 0 7 * * ? *)
└──────────┬───────────┘
           │ Invokes
           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Lambda: normalize-leads                             │
│                    Runtime: Node.js 22.x                               │
│                    Memory: 512 MB | Timeout: 300s                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  PHASE 1: Data Loading                                           │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │ 1. Load config from DynamoDB (if exists)                   │  │  │
│  │  │    - fieldsToNormalize: ["nombres", "ciudad", ...]         │  │  │
│  │  │    - batchSize: 10                                         │  │  │
│  │  │    - normalizationTTLDays: 7                               │  │  │
│  │  │ 2. Query leads needing normalization:                      │  │  │
│  │  │    - WHERE normalizedAt IS NULL OR                         │  │  │
│  │  │    - WHERE normalizedAt < (now - TTL)                      │  │  │
│  │  │ 3. Limit to maxLeadsPerRun (default: 50)                   │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                    │  │
│  │  PHASE 2: Batch Processing (loop)                                 │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │ For each batch of N leads (default N=10):                  │  │  │
│  │  │                                                             │  │  │
│  │  │ 4. Generate prompt (prompts.js)                            │  │  │
│  │  │    - Field-specific normalization rules                    │  │  │
│  │  │    - Examples for context                                  │  │  │
│  │  │    - JSON structure with lead fields                       │  │  │
│  │  │                                                             │  │  │
│  │  │ 5. Call AWS Bedrock                              ────────┐ │  │  │
│  │  │    - Model: Claude 3 Haiku                                │ │  │  │
│  │  │    - Temperature: 0 (deterministic)                       │ │  │  │
│  │  │    - Max tokens: 1000                                     │ │  │  │
│  │  │    - Returns JSON with normalized fields                  │ │  │  │
│  │  │                                                             │ │  │  │
│  │  │ 6. Parse response (prompts.js)                             │ │  │  │
│  │  │    - Extract JSON from markdown blocks                     │ │  │  │
│  │  │    - Validate structure                                    │ │  │  │
│  │  │                                                             │ │  │  │
│  │  │ 7. Post-processing pipeline ◄─── CRITICAL                  │ │  │  │
│  │  │    - normalizeAddress() - Fix abbreviations                │ │  │  │
│  │  │    - normalizeEducationLevel() - Standardize               │ │  │  │
│  │  │    - capitalizeWords() - Format names                      │ │  │  │
│  │  │    - City/institution mappings                             │ │  │  │
│  │  │                                                             │ │  │  │
│  │  │ 8. Update DynamoDB                                         │ │  │  │
│  │  │    - Store in normalizedData attribute                     │ │  │  │
│  │  │    - Set normalizedAt timestamp                            │ │  │  │
│  │  │    - Update updatedAt                                      │ │  │  │
│  │  │                                                             │ │  │  │
│  │  │ 9. Sleep 500ms (rate limiting)                             │ │  │  │
│  │  └─────────────────────────────────────────────────────────┬──┘  │  │
│  │                                                              │     │  │
│  │  PHASE 3: Reporting                                          │     │  │
│  │  ┌──────────────────────────────────────────────────────────▼──┐  │  │
│  │  │ 10. Calculate metrics:                                      │  │  │
│  │  │     - Leads processed                                       │  │  │
│  │  │     - Fields normalized                                     │  │  │
│  │  │     - Errors encountered                                    │  │  │
│  │  │     - Duration                                              │  │  │
│  │  │ 11. Log to CloudWatch                                       │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└──┬─────────────────────────────────────────────────────┬──────────────┘
   │                                                      │
   │ Reads/Writes                                         │ API Calls
   ▼                                                      ▼
┌─────────────────────────────┐            ┌──────────────────────────┐
│      DynamoDB Tables        │            │     AWS Bedrock          │
├─────────────────────────────┤            ├──────────────────────────┤
│ awsrestart-leads (main)     │            │ Claude 3 Haiku           │
│ ┌─────────────────────────┐ │            │ Model ID:                │
│ │ leadId (PK)             │ │            │ anthropic.claude-3-      │
│ │ nombres (original)      │ │            │ haiku-20240307-v1:0      │
│ │ apellidos (original)    │ │            │                          │
│ │ ciudad (original)       │ │            │ Invocation:              │
│ │ ...                     │ │            │ - Input: ~1,300 tokens   │
│ │ normalizedAt (timestamp)│ │            │ - Output: ~80 tokens     │
│ │ normalizedData: {       │ │            │ - Latency: ~2-4s         │
│ │   nombres: "...",       │ │            │                          │
│ │   apellidos: "...",     │ │            │ Cost per call:           │
│ │   ciudad: "..."         │ │            │ ~$0.0004                 │
│ │ }                       │ │            └──────────────────────────┘
│ └─────────────────────────┘ │
│                             │
│ awsrestart-normalization-   │
│ config (optional)           │
│ ┌─────────────────────────┐ │
│ │ configId (PK)           │ │
│ │ enabled: true           │ │
│ │ fieldsToNormalize: []   │ │
│ │ batchSize: 10           │ │
│ │ maxLeadsPerRun: 50      │ │
│ │ normalizationTTLDays: 7 │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘

┌─────────────────────────────┐
│    CloudWatch Logs          │
├─────────────────────────────┤
│ Log Group:                  │
│ /aws/lambda/awsrestart-     │
│ normalize-leads             │
│                             │
│ Metrics:                    │
│ - Token usage per call      │
│ - Normalization duration    │
│ - Error rates               │
│ - Batch processing stats    │
└─────────────────────────────┘
```

## Component Details

### 1. EventBridge Scheduled Rule

**Resource Name**: `awsrestart-daily-normalization`

**Configuration**:
```yaml
Schedule: cron(0 7 * * ? *)  # 7 AM UTC = 2 AM COT
Enabled: true
Target: NormalizeLeadsFunction
```

**Why daily at 2 AM COT?**
- Low traffic window (minimal database load)
- Fresh data available for morning reports at 8 AM
- Aligns with export schedule (8 AM COT = 1 PM UTC)
- Allows manual review before business hours

**Alternative triggers**:
- **Manual via API**: `POST /admin/normalize-leads` (Cognito-authenticated)
- **Direct invocation**: `aws lambda invoke --function-name awsrestart-normalize-leads`
- **On-demand**: Set `forceAll=true` to re-normalize entire dataset

### 2. Lambda Function: normalize-leads

**Runtime Configuration**:
```javascript
{
  Runtime: "nodejs22.x",
  MemorySize: 512,           // Balanced for Bedrock SDK + JSON parsing
  Timeout: 300,              // 5 min for large batches (50 leads × 10s each)
  Architecture: "x86_64",    // Bedrock SDK compatibility
  ReservedConcurrency: 1     // Avoid Bedrock rate limits
}
```

**Environment Variables**:
```javascript
{
  LEADS_TABLE: "awsrestart-leads",
  CONFIG_TABLE: "awsrestart-normalization-config",
  BEDROCK_MODEL_ID: "anthropic.claude-3-haiku-20240307-v1:0",
  BATCH_SIZE: "10",
  NORMALIZATION_TTL_DAYS: "7",
  MAX_LEADS_PER_RUN: "50",
  AWS_REGION: "us-east-1"
}
```

**IAM Permissions**:
```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem",
    "dynamodb:UpdateItem",
    "dynamodb:Scan"
  ],
  "Resource": [
    "arn:aws:dynamodb:*:*:table/awsrestart-leads",
    "arn:aws:dynamodb:*:*:table/awsrestart-normalization-config"
  ]
},
{
  "Effect": "Allow",
  "Action": "bedrock:InvokeModel",
  "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-*"
}
```

### 3. DynamoDB: awsrestart-leads

**Table Schema**:
```javascript
{
  TableName: "awsrestart-leads",
  BillingMode: "PAY_PER_REQUEST",  // Cost-efficient for variable load
  KeySchema: [
    { AttributeName: "leadId", KeyType: "HASH" }
  ],
  Attributes: {
    // Original fields (user input - never modified)
    nombres: String,
    apellidos: String,
    direccion: String,
    ciudad: String,
    nivelEducativo: String,
    ocupacionActual: String,
    empresa: String,

    // Normalization metadata
    normalizedAt: Number,     // Unix timestamp
    updatedAt: Number,

    // Normalized data (separate attribute)
    normalizedData: {
      nombres: String,        // "Juan Carlos" vs "JUAN CARLOS"
      apellidos: String,      // "Perez Garcia" vs "PEREZ GARCIA"
      direccion: String,      // "Cra. 15 # 100 - 25" vs "CRA 15 NO 100 25"
      ciudad: String,         // "Bogota D.C." vs "bogota"
      nivelEducativo: String, // "Profesional" vs "profesional universitario"
      ocupacionActual: String,// "Ingeniero de Sistemas" vs "Ing. Sistemas"
      empresa: String         // "SENA" vs "sena"
    }
  }
}
```

**Why separate `normalizedData` attribute?**
- **Audit compliance**: Original data preserved for legal/contractual requirements (Ley 1581 de 2012)
- **Rollback capability**: Can discard normalized data if bugs detected
- **Comparison analytics**: Track normalization quality by comparing original vs. normalized
- **Future flexibility**: Can re-normalize with improved prompts without losing originals

**Storage overhead**: ~2-3 KB per lead for normalized data (acceptable for 1000s of records)

### 4. DynamoDB: awsrestart-normalization-config (Optional)

**Table Schema**:
```javascript
{
  TableName: "awsrestart-normalization-config",
  BillingMode: "PAY_PER_REQUEST",
  KeySchema: [
    { AttributeName: "configId", KeyType: "HASH" }
  ]
}
```

**Configuration Document**:
```javascript
{
  configId: "normalization-settings",
  enabled: true,                    // Global on/off switch
  fieldsToNormalize: [
    "nombres",
    "apellidos",
    "direccion",
    "ciudad",
    "nivelEducativo",
    "ocupacionActual",
    "empresa"
  ],
  batchSize: 10,                    // Leads per Bedrock call
  maxLeadsPerRun: 50,               // Safety limit per execution
  normalizationTTLDays: 7           // Re-normalize after 7 days
}
```

**Why DynamoDB config instead of environment variables?**
- **No redeployment**: Update config via API/Console without Lambda redeploy
- **Audit trail**: DynamoDB tracks who changed what and when
- **Atomic updates**: Safer than editing Lambda configuration
- **Fallback**: If table doesn't exist, Lambda uses hardcoded defaults

### 5. AWS Bedrock: Claude 3 Haiku

**Model Selection Rationale**:

| Model | Cost (1M tokens) | Latency | Quality | Use Case |
|-------|------------------|---------|---------|----------|
| Claude 3.5 Sonnet | $15 | ~5s | Excellent | Complex reasoning, creative writing |
| Claude 3 Haiku | $1.25 | ~2s | Good | **Data normalization, classification** ✓ |
| GPT-4o-mini | $0.60 | ~3s | Good | Alternative if no Bedrock |

**Why Haiku over Sonnet?**
- **12x cheaper**: $0.04 vs $0.48 for 652 leads
- **2x faster**: ~2s vs ~5s per batch
- **Sufficient quality**: Normalization is structured, not creative
- **Deterministic at temp=0**: Consistent outputs for same inputs

**Bedrock API Call**:
```javascript
{
  modelId: "anthropic.claude-3-haiku-20240307-v1:0",
  contentType: "application/json",
  accept: "application/json",
  body: JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1000,
    temperature: 0,          // Deterministic outputs
    messages: [
      {
        role: "user",
        content: prompt      // See IMPLEMENTATION.md for prompt structure
      }
    ]
  })
}
```

**Token Usage** (per 10-lead batch):
- **Input**: ~1,300 tokens (prompt + data)
- **Output**: ~80 tokens (JSON response)
- **Total**: ~1,380 tokens × $0.00025/1K input + $0.00125/1K output = **$0.0004/batch**

**Rate Limits**:
- Default: 10 requests/second per account (more than sufficient)
- Mitigation: 500ms sleep between batches
- Reserved concurrency: 1 (prevents parallel Lambda invocations)

## Data Flow Sequence Diagram

```
User            EventBridge      Lambda             DynamoDB         Bedrock
 │                  │               │                   │              │
 │                  │  1. Trigger   │                   │              │
 │                  │─(2 AM COT)───>│                   │              │
 │                  │               │                   │              │
 │                  │               │  2. Load config   │              │
 │                  │               │──────────────────>│              │
 │                  │               │<──────────────────│              │
 │                  │               │  {enabled: true}  │              │
 │                  │               │                   │              │
 │                  │               │  3. Query leads   │              │
 │                  │               │   (normalizedAt   │              │
 │                  │               │    < cutoff)      │              │
 │                  │               │──────────────────>│              │
 │                  │               │<──────────────────│              │
 │                  │               │  [50 leads]       │              │
 │                  │               │                   │              │
 │                  │               │─┐                 │              │
 │                  │               │ │ 4. For each     │              │
 │                  │               │ │    batch (10)   │              │
 │                  │               │<┘                 │              │
 │                  │               │                   │              │
 │                  │               │  5. Generate      │              │
 │                  │               │     prompt        │              │
 │                  │               │                   │              │
 │                  │               │  6. Invoke Claude │              │
 │                  │               │──────────────────────────────────>│
 │                  │               │                   │  Haiku       │
 │                  │               │                   │  processes   │
 │                  │               │<──────────────────────────────────│
 │                  │               │  {normalized JSON}│              │
 │                  │               │                   │              │
 │                  │               │  7. Post-process  │              │
 │                  │               │     (regex fixes) │              │
 │                  │               │                   │              │
 │                  │               │  8. Update leads  │              │
 │                  │               │──────────────────>│              │
 │                  │               │  SET normalizedAt │              │
 │                  │               │      normalizedData              │
 │                  │               │<──────────────────│              │
 │                  │               │                   │              │
 │                  │               │  9. Sleep 500ms   │              │
 │                  │               │                   │              │
 │                  │               │  10. Repeat for   │              │
 │                  │               │      next batch   │              │
 │                  │               │                   │              │
 │                  │               │ 11. Log metrics   │              │
 │                  │               │     to CloudWatch │              │
 │                  │               │                   │              │
 │                  │<──(success)───│                   │              │
```

## Scaling Considerations

### Current Configuration (Small Scale)

- **Volume**: 500-1,000 leads/month
- **Frequency**: Daily at 2 AM COT
- **Batch size**: 10 leads/batch
- **Max per run**: 50 leads
- **Duration**: ~2-3 minutes for 50 leads

### Scaling to 10,000 Leads/Month

**Option 1: Increase batch size**
```javascript
BATCH_SIZE: 20              // 2x throughput
MAX_LEADS_PER_RUN: 200      // 4x throughput
Timeout: 600                // 10 minutes
```
- **Pros**: Minimal code changes, cost-efficient
- **Cons**: Higher memory usage, longer cold starts
- **Cost impact**: None (same total tokens)

**Option 2: Parallel batches**
```javascript
ReservedConcurrency: 5      // 5 concurrent Lambdas
BATCH_SIZE: 10
MAX_LEADS_PER_RUN: 50
```
- **Pros**: 5x throughput, faster processing
- **Cons**: Bedrock rate limits (10 req/s), higher costs
- **Cost impact**: None (same total tokens)

**Option 3: Real-time normalization**
```javascript
// Trigger Lambda on DynamoDB Streams (new leads)
EventSourceMapping:
  Type: DynamoDB
  Stream: awsrestart-leads
  BatchSize: 10
```
- **Pros**: Immediate normalization, no daily delay
- **Cons**: Higher Lambda invocations, adds latency to form submit
- **Cost impact**: +100% Lambda invocations, same Bedrock costs

### Scaling to 100,000 Leads/Month

At this scale, consider:
- **Caching**: Store normalized values in ElastiCache/DynamoDB DAX
- **Batch processing**: SQS queue + Step Functions for orchestration
- **Bedrock alternatives**: Fine-tuned model or local LLM (Llama 3)
- **Cost optimization**: Switch to OpenAI API (GPT-4o-mini at $0.60/1M tokens)

## High Availability & Fault Tolerance

### Error Handling Strategy

**Bedrock API Failures**:
```javascript
try {
  const response = await bedrockClient.send(command);
} catch (error) {
  if (error.name === 'ThrottlingException') {
    // Exponential backoff: retry after 1s, 2s, 4s
    await sleep(retryDelay);
    retryDelay *= 2;
  } else if (error.name === 'ModelTimeoutException') {
    // Skip batch, log for manual review
    console.error(`Batch timeout: ${leadIds}`);
  } else {
    // Fatal error - fail Lambda execution
    throw error;
  }
}
```

**DynamoDB Failures**:
- **Throttling**: Handled by AWS SDK automatic retries (exponential backoff)
- **Item not found**: Expected - lead may have been deleted, skip silently
- **Update conflicts**: Use conditional updates to prevent overwrites

**Lambda Timeouts**:
- **Current**: 300s (5 min) - sufficient for 50 leads
- **Mitigation**: Reduce `maxLeadsPerRun` to 25 if approaching timeout
- **Monitoring**: CloudWatch alarm if duration > 240s

### Idempotency

**Problem**: EventBridge may invoke Lambda multiple times for same schedule.

**Solution**: Use `normalizedAt` timestamp to prevent redundant processing.

```javascript
// Only normalize if:
// 1. Never normalized (normalizedAt is null), OR
// 2. Normalized more than TTL days ago

const cutoffTime = Date.now() - (TTL_DAYS * 24 * 60 * 60 * 1000);

const leadsToNormalize = allLeads.filter(lead => {
  return !lead.normalizedAt || lead.normalizedAt < cutoffTime;
});
```

**Manual re-normalization**:
```javascript
// Force re-normalization via API
POST /admin/normalize-leads?forceAll=true
```

### Monitoring & Alerting

**CloudWatch Metrics**:
- `LeadsProcessed`: Count of successfully normalized leads
- `NormalizationErrors`: Count of failures
- `Duration`: Lambda execution time
- `TokenUsage`: Input + output tokens per batch

**CloudWatch Alarms**:
```yaml
Alarm: NormalizationFailureRate
Condition: Errors > 5 in 1 hour
Action: SNS notification to admin email

Alarm: NormalizationDuration
Condition: Duration > 240s
Action: SNS notification (approaching timeout)

Alarm: BedrockCostSpike
Condition: EstimatedCharges > $5/day
Action: SNS notification + disable normalization
```

## Security Considerations

### IAM Least Privilege

**Lambda Execution Role**:
```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:Scan"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/awsrestart-leads"
    },
    {
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-haiku-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/lambda/awsrestart-normalize-leads:*"
    }
  ]
}
```

**No permissions for**:
- Deleting DynamoDB items
- Invoking other Lambdas
- Accessing S3 buckets
- Modifying IAM roles

### Data Privacy

**PII Handling**:
- Original PII (names, addresses) never sent to CloudWatch logs
- Only `leadId` and field names logged for debugging
- Bedrock API calls are encrypted in transit (TLS 1.2+)
- No data retained by Bedrock (per AWS Bedrock Data Privacy policy)

**Compliance**:
- **Ley 1581 de 2012 (Colombia)**: Original data preserved, audit trail via timestamps
- **GDPR (if applicable)**: Right to erasure - delete entire lead item (original + normalized)

### Secrets Management

**API Keys**: Not required - Bedrock uses IAM authentication

**Configuration**: Stored in DynamoDB (encrypted at rest by default)

**Environment Variables**: No sensitive data - only table names and config values

## Performance Optimization

### Cold Start Mitigation

**Current cold start**: ~2-3 seconds (Bedrock SDK initialization)

**Optimization**:
```javascript
// Initialize clients outside handler (Lambda container reuse)
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event) => {
  // Clients already initialized
};
```

**Reserved concurrency**: 1 (keeps 1 warm Lambda instance)

### Latency Reduction

**Batch processing**: 10 leads/call reduces API overhead by 10x vs. individual calls

**Parallel DynamoDB updates**: Use `Promise.all()` to update leads concurrently
```javascript
await Promise.all(
  batch.map(lead => docClient.send(new UpdateCommand({...})))
);
```

**Token optimization**: Minimal prompt (no verbose examples) reduces input tokens by 30%

### Cost Optimization

**Use Haiku, not Sonnet**: 12x cheaper for same task

**Batch sizing**: Larger batches amortize prompt overhead (1 prompt for 10 leads vs. 10 prompts)

**TTL-based re-normalization**: Only re-normalize every 7 days (vs. daily) reduces costs by 7x

**Spot-check validation**: Manually validate 5% of normalizations instead of 100%

## Next Steps

- **[IMPLEMENTATION.md](./IMPLEMENTATION.md)**: Step-by-step code walkthrough
- **[STATISTICAL-VALIDATION.md](./STATISTICAL-VALIDATION.md)**: Quality metrics and bug detection
- **[LESSONS-LEARNED.md](./LESSONS-LEARNED.md)**: Production insights

---

**Last Updated**: January 24, 2026
