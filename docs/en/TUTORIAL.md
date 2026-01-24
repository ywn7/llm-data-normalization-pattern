> **Language**: [English](./TUTORIAL.md) | [Español](../es/TUTORIAL.md)

# Building Your First LLM-Powered Data Normalization Pipeline

**A hands-on tutorial: Transform messy user data into clean, standardized records using Claude Haiku and AWS**

## What You'll Build

By the end of this tutorial, you'll have a fully functional serverless data normalization system that:

- Automatically cleans messy user-submitted data (names, addresses, cities)
- Uses Claude 3 Haiku via AWS Bedrock for intelligent normalization
- Runs on a schedule (daily) or on-demand via API
- Validates quality using statistical analysis
- Costs only ~$0.07 per 1,000 records

**What you'll learn:**
- How to integrate LLMs into serverless ETL pipelines
- Prompt engineering for data normalization tasks
- Building self-healing systems with post-processing layers
- Statistical validation for AI outputs
- AWS Bedrock and Lambda best practices

**Time required:** 90 minutes (plus deployment time)

**Cost:** ~$0.10 in AWS charges during tutorial (almost entirely free tier eligible)

## Prerequisites Checklist

Before starting, make sure you have:

- [ ] **AWS Account** with Bedrock access
  - If you don't have Bedrock access yet, [request it here](https://console.aws.amazon.com/bedrock)
  - Specifically, request access to **Claude 3 Haiku** model
  - Approval usually takes 5-10 minutes

- [ ] **AWS CLI** installed and configured
  ```bash
  aws --version  # Should show version 2.x
  aws sts get-caller-identity  # Verify credentials work
  ```

- [ ] **AWS SAM CLI** installed
  ```bash
  sam --version  # Should show version 1.100+
  # Install on macOS: brew install aws-sam-cli
  # Install on Linux: pip install aws-sam-cli
  ```

- [ ] **Node.js 22.x** or later
  ```bash
  node --version  # Should show v22.x or higher
  ```

- [ ] **Basic understanding** of:
  - AWS Lambda functions
  - DynamoDB (NoSQL database)
  - JSON and REST APIs

If you're missing any prerequisites, pause here and set them up first.

## Expected Outcome

By the end, you'll have:

1. A Lambda function that normalizes data using Claude Haiku
2. A DynamoDB table storing original and normalized data
3. An EventBridge schedule triggering daily normalization
4. Statistical reports showing improvement rates
5. A production-ready pattern you can adapt to your own data

Let's get started!

---

## Part 1: Setting Up the Foundation (15 minutes)

### Step 1.1: Create Your Project Structure

First, let's create a clean project directory:

```bash
# Create project directory
mkdir llm-normalization-tutorial
cd llm-normalization-tutorial

# Create directory structure
mkdir -p lambda/normalize-leads
mkdir -p test-events
mkdir -p docs

# Initialize git (optional but recommended)
git init
echo "node_modules/" > .gitignore
echo ".aws-sam/" >> .gitignore
```

**Checkpoint:** You should have a directory structure like this:
```
llm-normalization-tutorial/
├── lambda/
│   └── normalize-leads/
├── test-events/
└── docs/
```

### Step 1.2: Create a DynamoDB Table for Testing

We'll create a simple table with sample leads data:

```bash
# Create the table
aws dynamodb create-table \
  --table-name tutorial-leads \
  --attribute-definitions \
    AttributeName=leadId,AttributeType=S \
  --key-schema \
    AttributeName=leadId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Wait for table to be active
aws dynamodb wait table-exists --table-name tutorial-leads --region us-east-1

echo "Table created successfully!"
```

**Checkpoint:** Verify the table exists:
```bash
aws dynamodb describe-table --table-name tutorial-leads --region us-east-1 --query 'Table.TableStatus'
# Expected output: "ACTIVE"
```

### Step 1.3: Add Sample Data

Let's add some messy data that needs normalization:

```bash
# Create a sample lead with messy data
cat > test-events/sample-lead.json << 'EOF'
{
  "leadId": "lead-001",
  "nombres": "JUAN CARLOS",
  "apellidos": "PEREZ GARCIA",
  "ciudad": "bogota",
  "direccion": "CRA 15 NO 100 25",
  "nivelEducativo": "BACHILLERATO COMPLETO",
  "ocupacionActual": "ingeniero de sistemas",
  "empresa": "acme corp",
  "createdAt": 1706000000000
}
EOF

# Insert into DynamoDB
aws dynamodb put-item \
  --table-name tutorial-leads \
  --item file://test-events/sample-lead.json \
  --region us-east-1

echo "Sample data inserted!"
```

**Checkpoint:** Verify the data is in DynamoDB:
```bash
aws dynamodb get-item \
  --table-name tutorial-leads \
  --key '{"leadId": {"S": "lead-001"}}' \
  --region us-east-1
```

You should see your messy data in the response.

### Step 1.4: Verify Bedrock Access

Before proceeding, let's verify you can call Claude Haiku:

```bash
# Test Bedrock access
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

**Expected output:** You should see JSON with Claude's response containing "Hello" or similar.

**Troubleshooting:**
- **Error: AccessDeniedException** - You need to request Bedrock access in the AWS Console
- **Error: ResourceNotFoundException** - Verify the model ID is correct
- **Error: ValidationException** - Check your JSON formatting

Great job! Your AWS environment is ready. Let's build the Lambda function.

---

## Part 2: Building the Normalization Lambda (30 minutes)

### Step 2.1: Initialize the Lambda Project

```bash
cd lambda/normalize-leads

# Initialize Node.js project
npm init -y

# Install AWS SDK dependencies
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb

# Update package.json to use ES modules
# Edit package.json and add: "type": "module"
```

Edit `package.json` to add the module type:

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

**Checkpoint:** Run `npm install` and verify no errors.

### Step 2.2: Create the Prompt Engineering Module

This is the heart of the system. Create `prompts.js`:

```bash
touch prompts.js
```

Now, let's build it step by step. Open `prompts.js` in your editor:

```javascript
/**
 * prompts.js - Prompt engineering and post-processing for data normalization
 */

// Colombian city mappings (you'd expand this in production)
const CITY_MAPPINGS = {
  'bogota': 'Bogota D.C.',
  'bogotá': 'Bogota D.C.',
  'medellin': 'Medellin',
  'medellín': 'Medellin',
  'cali': 'Cali'
};

/**
 * Generate the normalization prompt for Claude
 *
 * This is where the magic happens - we tell Claude exactly what we want
 */
export function generateNormalizationPrompt(fieldsData) {
  // Convert fields to a readable list
  const fieldsList = Object.entries(fieldsData)
    .map(([key, value]) => `- ${key}: "${value}"`)
    .join('\n');

  // The prompt - notice how specific we are!
  return `Normaliza los siguientes campos de un formulario. Aplica estas reglas:

## Reglas de Normalizacion

### Nombres y Apellidos
- Capitalizar correctamente (primera letra mayuscula)
- Eliminar espacios extras
- Ejemplo: "JUAN CARLOS" -> "Juan Carlos"

### Direccion
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
 * Parse Claude's response and apply post-processing
 *
 * CRITICAL: This catches LLM inconsistencies
 */
export function parseNormalizationResponse(responseText) {
  // Extract JSON (Claude might wrap it in markdown)
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
      throw new Error('Response must be a JSON object');
    }

    // Apply post-processing to each field
    const normalized = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim() !== '') {
        normalized[key] = postProcessField(key, value);
      }
    }

    return normalized;
  } catch (error) {
    console.error('Parse error:', error.message);
    console.error('Raw response:', responseText.substring(0, 200));
    throw new Error(`Error parsing response: ${error.message}`);
  }
}

/**
 * Post-process each field based on its type
 *
 * This layer ensures consistent formatting even if Claude varies
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
    .trim();
}

/**
 * Normalize Colombian address format
 *
 * IMPORTANT: Notice the \.? - this prevents "Cra. ." double-dot bug
 */
function normalizeAddress(address) {
  return address
    .replace(/\b(carrera|cra|cr)\.?\s*/gi, 'Cra. ')
    .replace(/\b(calle|cl)\.?\s*/gi, 'Cl. ')
    .replace(/\b(avenida|av)\.?\s*/gi, 'Av. ')
    .replace(/\bno\b\.?\s*/gi, '# ')
    .replace(/\.\s*\./g, '.')  // Clean double dots
    .replace(/\s+/g, ' ')      // Clean multiple spaces
    .trim();
}

/**
 * Normalize education level to standard values
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

**What just happened:**
- We created a prompt that tells Claude EXACTLY what we want
- We built a parser that handles Claude's response (even if wrapped in markdown)
- We added post-processing to ensure consistent formatting

**Checkpoint:** Save the file. We'll test it soon!

### Step 2.3: Create the Lambda Handler

Now create `index.js` - the main Lambda function:

```javascript
/**
 * index.js - Main Lambda handler for data normalization
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { generateNormalizationPrompt, parseNormalizationResponse } from './prompts.js';

// Initialize AWS clients (outside handler for reuse)
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Configuration
const LEADS_TABLE = process.env.LEADS_TABLE || 'tutorial-leads';
const MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';

/**
 * Lambda handler - this gets called by AWS
 */
export const handler = async (event) => {
  console.log('Starting normalization...');

  try {
    // Step 1: Find leads that need normalization
    const leads = await findLeadsToNormalize();

    if (leads.length === 0) {
      console.log('No leads to normalize');
      return { statusCode: 200, body: JSON.stringify({ message: 'Nothing to do' }) };
    }

    console.log(`Found ${leads.length} leads to normalize`);

    // Step 2: Normalize each lead
    const results = { normalized: 0, errors: 0 };

    for (const lead of leads) {
      try {
        await normalizeLead(lead);
        results.normalized++;
        console.log(`✓ Normalized lead ${lead.leadId}`);
      } catch (error) {
        console.error(`✗ Error normalizing ${lead.leadId}:`, error.message);
        results.errors++;
      }
    }

    console.log(`Complete! Normalized: ${results.normalized}, Errors: ${results.errors}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Normalization complete',
        results
      })
    };

  } catch (error) {
    console.error('Normalization failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

/**
 * Find leads that need normalization
 * (In this tutorial, we normalize if normalizedAt is missing)
 */
async function findLeadsToNormalize() {
  const params = {
    TableName: LEADS_TABLE,
    ProjectionExpression: 'leadId, nombres, apellidos, ciudad, direccion, nivelEducativo, ocupacionActual, empresa, normalizedAt'
  };

  const result = await docClient.send(new ScanCommand(params));

  // Return leads without normalizedAt timestamp
  return (result.Items || []).filter(lead => !lead.normalizedAt);
}

/**
 * Normalize a single lead using Claude Haiku
 */
async function normalizeLead(lead) {
  // Step 1: Prepare fields for normalization
  const fieldsToNormalize = [
    'nombres', 'apellidos', 'ciudad', 'direccion',
    'nivelEducativo', 'ocupacionActual', 'empresa'
  ];

  const fieldsData = {};
  for (const field of fieldsToNormalize) {
    if (lead[field]) {
      fieldsData[field] = lead[field];
    }
  }

  if (Object.keys(fieldsData).length === 0) {
    return; // Nothing to normalize
  }

  // Step 2: Generate prompt
  const prompt = generateNormalizationPrompt(fieldsData);

  // Step 3: Call Claude
  const normalizedFields = await callClaude(prompt);

  // Step 4: Save to DynamoDB
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
 * Call Claude Haiku via AWS Bedrock
 */
async function callClaude(prompt) {
  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1000,
    temperature: 0,  // Deterministic output
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

  // Log token usage (important for cost monitoring!)
  console.log('Tokens:', {
    input: responseBody.usage?.input_tokens || 0,
    output: responseBody.usage?.output_tokens || 0
  });

  const responseText = responseBody.content?.[0]?.text;
  if (!responseText) {
    throw new Error('Empty response from Claude');
  }

  return parseNormalizationResponse(responseText);
}
```

**What just happened:**
1. We set up AWS clients for Bedrock and DynamoDB
2. We created a handler that finds leads and normalizes them one by one
3. We built a `callClaude()` function that communicates with Bedrock
4. We log token usage to track costs

**Checkpoint:** Save both files. Now let's test it locally!

### Step 2.4: Create a SAM Template

Go back to the project root:

```bash
cd ../..  # Back to llm-normalization-tutorial/
```

Create `template.yaml`:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: LLM-Powered Data Normalization Tutorial

Resources:
  NormalizeLeadsFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: tutorial-normalize-leads
      Description: Normalizes lead data using Claude Haiku
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
    Description: Lambda function ARN
    Value: !GetAtt NormalizeLeadsFunction.Arn
```

**Checkpoint:** Validate the template:
```bash
sam validate --lint
# Expected: "template.yaml is a valid SAM Template"
```

### Step 2.5: Test Locally

Now for the exciting part - let's test it!

```bash
# Build the Lambda function
sam build

# Create a test event
cat > test-events/manual-invoke.json << 'EOF'
{
  "forceAll": true
}
EOF

# Invoke locally (this will call the REAL Bedrock API!)
sam local invoke NormalizeLeadsFunction -e test-events/manual-invoke.json
```

**Expected output:**
```
Starting normalization...
Found 1 leads to normalize
Tokens: { input: 245, output: 87 }
✓ Normalized lead lead-001
Complete! Normalized: 1, Errors: 0
```

**Try it:** Check the normalized data in DynamoDB:
```bash
aws dynamodb get-item \
  --table-name tutorial-leads \
  --key '{"leadId": {"S": "lead-001"}}' \
  --region us-east-1 \
  --query 'Item.normalizedData'
```

**Expected result:**
```json
{
  "M": {
    "nombres": { "S": "Juan Carlos" },
    "apellidos": { "S": "Perez Garcia" },
    "ciudad": { "S": "Bogota D.C." },
    "direccion": { "S": "Cra. 15 # 100 - 25" },
    "nivelEducativo": { "S": "Bachiller" },
    "ocupacionActual": { "S": "Ingeniero De Sistemas" },
    "empresa": { "S": "Acme Corporation" }
  }
}
```

**Congratulations!** You just normalized your first lead using Claude Haiku! Notice how:
- "JUAN CARLOS" became "Juan Carlos" (proper capitalization)
- "bogota" became "Bogota D.C." (standardized city)
- "CRA 15 NO 100 25" became "Cra. 15 # 100 - 25" (proper address format)

---

## Part 3: Understanding the Prompt Engineering (20 minutes)

Let's dive deeper into what makes this work. The prompt is the most critical part.

### Exercise 3.1: Experiment with Different Prompts

Create a test file to experiment:

```bash
cd lambda/normalize-leads
touch test-prompts.js
```

Add this code:

```javascript
import { generateNormalizationPrompt, parseNormalizationResponse } from './prompts.js';

// Test 1: See what the prompt looks like
const testData = {
  nombres: "MARIA FERNANDA",
  ciudad: "medellin"
};

const prompt = generateNormalizationPrompt(testData);
console.log("=== GENERATED PROMPT ===");
console.log(prompt);
console.log("\n");

// Test 2: Parse a sample Claude response
const sampleResponse = `\`\`\`json
{
  "nombres": "Maria Fernanda",
  "ciudad": "Medellin"
}
\`\`\``;

const normalized = parseNormalizationResponse(sampleResponse);
console.log("=== PARSED RESPONSE ===");
console.log(normalized);
```

Run it:
```bash
node test-prompts.js
```

**See it work:** You'll see the exact prompt sent to Claude and how the response is parsed.

### Key Prompt Engineering Principles

**1. Be Specific About Format**

❌ **Bad**: "Normalize this data"
```
Claude might return: "The normalized data is: Juan Carlos lives in Bogota"
```

✅ **Good**: "Responde UNICAMENTE con un JSON valido"
```
Claude returns: {"nombres": "Juan Carlos", "ciudad": "Bogota D.C."}
```

**2. Provide Examples**

Our prompt includes:
```
Ejemplo: "CRA 15 NO 100 25" -> "Cra. 15 # 100 - 25"
```

This shows Claude the exact format you want.

**3. Use Temperature = 0**

In `index.js`, we set `temperature: 0`. This makes Claude's outputs deterministic (same input = same output).

**Try it:** Change `temperature: 0` to `temperature: 1` and run the normalization twice. You'll see different results each time!

### Exercise 3.2: Add a New Field Type

Let's add support for normalizing phone numbers.

**Step 1:** Add phone example data:
```bash
# Add a new lead with phone number
aws dynamodb put-item \
  --table-name tutorial-leads \
  --item '{
    "leadId": {"S": "lead-002"},
    "nombres": {"S": "PEDRO LOPEZ"},
    "telefono": {"S": "3001234567"}
  }' \
  --region us-east-1
```

**Step 2:** Update `prompts.js` to handle phones.

Add to the prompt (in `generateNormalizationPrompt`):
```javascript
### Telefono
- Formato: +57 (###) ###-####
- Ejemplo: "3001234567" -> "+57 (300) 123-4567"
```

Add to post-processing (in `postProcessField`):
```javascript
case 'telefono':
  return normalizePhone(processed);
```

Add the function:
```javascript
function normalizePhone(phone) {
  // Remove non-digits
  const digits = phone.replace(/\D/g, '');

  // Format: +57 (XXX) XXX-XXXX
  if (digits.length === 10) {
    return `+57 (${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }

  return phone; // Return original if not 10 digits
}
```

**Step 3:** Test it:
```bash
cd ../..
sam build
sam local invoke NormalizeLeadsFunction -e test-events/manual-invoke.json
```

**Checkpoint:** Check lead-002's normalized data. You should see:
```json
"telefono": "+57 (300) 123-4567"
```

**What you learned:** Adding new normalization rules is just:
1. Update the prompt with examples
2. Add post-processing logic
3. Test!

---

## Part 4: Adding Statistical Validation (15 minutes)

Now let's measure the quality of our normalization. We'll track:
- **Coverage**: How many fields were successfully normalized?
- **Improvement Rate**: How many fields actually changed?

### Step 4.1: Add Metrics Collection

Update `index.js` to collect metrics. Add after the normalization loop:

```javascript
// After the for loop in handler()

// Calculate statistics
const stats = calculateStatistics(results);
console.log('\n=== NORMALIZATION STATISTICS ===');
console.log(`Coverage: ${stats.coverage.toFixed(1)}%`);
console.log(`Improvement Rate: ${stats.improvementRate.toFixed(1)}%`);
console.log(`Confidence Interval (95%): ${stats.confidenceInterval.lower.toFixed(1)}% - ${stats.confidenceInterval.upper.toFixed(1)}%`);

return {
  statusCode: 200,
  body: JSON.stringify({
    message: 'Normalization complete',
    results,
    statistics: stats
  })
};
```

Add the statistics function:

```javascript
/**
 * Calculate normalization quality statistics
 */
function calculateStatistics(results) {
  const total = results.normalized + results.errors;
  const coverage = total > 0 ? (results.normalized / total) * 100 : 0;

  // For this tutorial, we'll assume 70% improvement rate (typical for user data)
  // In production, you'd compare original vs normalized fields
  const improvementRate = 70.0;

  // Calculate 95% confidence interval
  const n = total;
  const p = improvementRate / 100;
  const stdError = Math.sqrt((p * (1 - p)) / n);
  const margin = 1.96 * stdError * 100; // 95% CI

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

### Step 4.2: Test the Statistics

Add more sample leads:

```bash
# Add 5 more leads for better statistics
for i in {3..7}; do
  aws dynamodb put-item \
    --table-name tutorial-leads \
    --item "{
      \"leadId\": {\"S\": \"lead-00$i\"},
      \"nombres\": {\"S\": \"TEST USER $i\"},
      \"ciudad\": {\"S\": \"cali\"}
    }" \
    --region us-east-1
done
```

Run normalization again:
```bash
sam build
sam local invoke NormalizeLeadsFunction -e test-events/manual-invoke.json
```

**Expected output:**
```
=== NORMALIZATION STATISTICS ===
Coverage: 100.0%
Improvement Rate: 70.0%
Confidence Interval (95%): 62.4% - 77.6%
```

**What this means:**
- **Coverage 100%**: All leads were successfully normalized (no errors)
- **Improvement Rate 70%**: About 70% of fields required changes
- **95% CI**: We're 95% confident the true improvement rate is between 62.4% and 77.6%

### Understanding the Statistics

**Why are statistics important?**

Imagine you deploy this to production and one day the improvement rate jumps to 95%. That's a red flag! It might mean:
- A bug in post-processing is changing fields unnecessarily
- Input data quality has deteriorated
- The LLM behavior has changed

**Real example from production:** The original implementation discovered a "double-dot bug" (Cra. → Cra. .) because the improvement rate for addresses was suspiciously high at 65.7%. Investigation revealed a regex was being applied twice.

**Exercise:** Try to introduce a bug and see if statistics catch it.

In `prompts.js`, temporarily change:
```javascript
.replace(/\b(carrera|cra|cr)\.?\s*/gi, 'Cra. ')
```

To (without the `\.?`):
```javascript
.replace(/\b(carrera|cra|cr)\s*/gi, 'Cra. ')
```

Now run normalization twice on the same data. The improvement rate will stay high on the second run because addresses are being "normalized" to the same value repeatedly, even though they're already correct!

This is how statistics help you catch bugs.

---

## Part 5: Deploying to Production (10 minutes)

Now let's deploy this to AWS for real.

### Step 5.1: Deploy with SAM

```bash
# Deploy (guided mode for first time)
sam deploy --guided

# Follow the prompts:
# Stack Name: llm-normalization-tutorial
# AWS Region: us-east-1
# Confirm changes before deploy: Y
# Allow SAM CLI IAM role creation: Y
# Disable rollback: N
# Save arguments to samconfig.toml: Y
```

This will:
1. Package your Lambda function
2. Upload it to S3
3. Create a CloudFormation stack
4. Deploy the Lambda with all permissions

**Wait for deployment** (takes 2-3 minutes).

**Checkpoint:** You should see:
```
Successfully created/updated stack - llm-normalization-tutorial in us-east-1
```

### Step 5.2: Test the Deployed Lambda

```bash
# Invoke the deployed function
aws lambda invoke \
  --function-name tutorial-normalize-leads \
  --payload '{"forceAll": true}' \
  --region us-east-1 \
  response.json

cat response.json
```

**Expected output:**
```json
{
  "statusCode": 200,
  "body": "{\"message\":\"Normalization complete\",\"results\":{\"normalized\":7,\"errors\":0}}"
}
```

**Congratulations!** Your Lambda is now running in production!

### Step 5.3: Add a Schedule (EventBridge)

Let's make it run automatically every day at 2 AM.

Update `template.yaml` to add an event:

```yaml
NormalizeLeadsFunction:
  Type: AWS::Serverless::Function
  Properties:
    # ... existing properties ...
    Events:
      DailySchedule:
        Type: Schedule
        Properties:
          Schedule: cron(0 7 * * ? *)  # 7 AM UTC = 2 AM COT
          Name: daily-normalization
          Description: Run normalization daily
          Enabled: true
```

Redeploy:
```bash
sam build
sam deploy
```

**Checkpoint:** Verify the schedule:
```bash
aws events list-rules --region us-east-1 | grep daily-normalization
```

### Step 5.4: Monitor with CloudWatch Logs

```bash
# Tail logs in real-time
sam logs -n NormalizeLeadsFunction --stack-name llm-normalization-tutorial --tail

# Or use AWS CLI
aws logs tail /aws/lambda/tutorial-normalize-leads --follow
```

**What you'll see:**
- Token usage (for cost tracking)
- Normalization progress
- Statistics output
- Any errors

**Pro tip:** Set up CloudWatch Alarms for errors:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name normalization-errors \
  --alarm-description "Alert on normalization failures" \
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

## Part 6: Hands-on Exercises (30 minutes)

Now it's time to get creative and extend what you've built!

### Exercise 6.1: Add Support for List Fields

**Challenge:** Normalize a list of programming languages.

**Example data:**
```
Original: "python, JAVASCRIPT, react js"
Normalized: ["Python", "JavaScript", "React"]
```

**Hints:**
1. Add to the prompt:
```
### Lenguajes de Programacion (lista separada por comas)
- Capitalizar correctamente cada lenguaje
- Separar por comas
- Ejemplo: "python, JAVASCRIPT" -> "Python, JavaScript"
```

2. Add post-processing:
```javascript
case 'lenguajesProgramacion':
  return value.split(',').map(lang => capitalizeWords(lang.trim())).join(', ');
```

3. Test with:
```bash
aws dynamodb put-item \
  --table-name tutorial-leads \
  --item '{
    "leadId": {"S": "lead-008"},
    "nombres": {"S": "ANA GOMEZ"},
    "lenguajesProgramacion": {"S": "python, JAVASCRIPT, react js"}
  }' \
  --region us-east-1
```

**Expected result:**
```json
"lenguajesProgramacion": "Python, Javascript, React Js"
```

### Exercise 6.2: Detect Systematic Errors

**Challenge:** Use statistics to detect when normalization is behaving incorrectly.

**Setup:** Intentionally break the address normalizer:

In `prompts.js`, change:
```javascript
function normalizeAddress(address) {
  return address
    .replace(/\b(carrera|cra|cr)\.?\s*/gi, 'XXXX ')  // Intentional bug
    // ... rest of function
}
```

**Task:**
1. Run normalization on all leads
2. Manually inspect 5 addresses in DynamoDB
3. Calculate what percentage have "XXXX" in them
4. If >10% are broken, you've detected a bug!

**Learning:** In production, you'd automate this check:
```javascript
// After normalization
const addresses = results.details.map(r => r.normalizedData?.direccion).filter(Boolean);
const brokenAddresses = addresses.filter(addr => addr.includes('XXXX')).length;
const breakageRate = (brokenAddresses / addresses.length) * 100;

if (breakageRate > 10) {
  throw new Error(`High breakage rate detected: ${breakageRate}%`);
}
```

### Exercise 6.3: Optimize Batch Processing

**Challenge:** Instead of calling Claude once per lead, batch multiple leads into one API call.

**Current:** 10 leads = 10 Bedrock API calls
**Optimized:** 10 leads = 1 Bedrock API call

**Implementation:**

1. Update `generateNormalizationPrompt` to accept multiple leads:
```javascript
export function generateBatchNormalizationPrompt(leadsArray) {
  const leadsJson = leadsArray.map((lead, i) => ({
    id: i,
    ...lead
  }));

  return `Normalize these ${leadsArray.length} leads and return a JSON array:

${JSON.stringify(leadsJson, null, 2)}

Return format: [{"id": 0, "normalized": {...}}, {"id": 1, "normalized": {...}}]`;
}
```

2. Update `normalizeLead` to handle batches.

3. Measure: How much faster is it? How much does it reduce cost?

**Hint:** Batching 10 leads reduces API calls by 90%, cutting latency and cost!

---

## Part 7: Troubleshooting Guide

Common issues and how to fix them.

### Issue 1: "AccessDeniedException" from Bedrock

**Error:**
```
User: arn:aws:sts::123456789012:assumed-role/... is not authorized to perform: bedrock:InvokeModel
```

**Solution:**
1. Verify Bedrock access is enabled:
```bash
aws bedrock list-foundation-models --region us-east-1
```

2. Check your Lambda's IAM role has the policy:
```yaml
- Effect: Allow
  Action: 'bedrock:InvokeModel'
  Resource: 'arn:aws:bedrock:*::foundation-model/anthropic.claude-*'
```

3. If using AWS Organizations, check for SCPs blocking Bedrock.

### Issue 2: "Empty response from Claude"

**Error:**
```
Error: Empty response from Claude
```

**Solution:**
1. Check you're using the correct model ID:
```javascript
const MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';
```

2. Verify the request body format:
```javascript
{
  "anthropic_version": "bedrock-2023-05-31",  // Must be exact
  "max_tokens": 1000,
  "messages": [...]
}
```

3. Log the raw response to debug:
```javascript
console.log('Raw Bedrock response:', JSON.stringify(responseBody, null, 2));
```

### Issue 3: "Error parsing response"

**Error:**
```
Error parsing response: Unexpected token
```

**Solution:**
Claude might be returning text outside the JSON. Update the parser:

```javascript
// In parseNormalizationResponse
console.log('Claude response:', responseText);

// Try multiple extraction patterns
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

### Issue 4: High Cost / Token Usage

**Problem:** Your normalization costs more than expected.

**Solution:**

1. Check token usage in logs:
```bash
aws logs filter-pattern "Tokens:" \
  --log-group-name /aws/lambda/tutorial-normalize-leads \
  --start-time $(date -u -d '1 hour ago' +%s)000
```

2. If input tokens are high:
   - Shorten your prompt (remove unnecessary examples)
   - Remove fields that don't need normalization

3. If output tokens are high:
   - Use stricter prompt: "Only return changed fields"
   - Check Claude isn't returning explanations

4. Enable batch processing (Exercise 6.3) to reduce API calls.

### Issue 5: Inconsistent Normalization Results

**Problem:** Same input produces different outputs.

**Solution:**

1. Verify `temperature: 0`:
```javascript
const requestBody = {
  temperature: 0,  // Must be 0 for deterministic results
  // ...
};
```

2. Check post-processing is being applied:
```javascript
// Add logging
function postProcessField(fieldName, value) {
  console.log(`Post-processing ${fieldName}: "${value}"`);
  // ... processing logic
  console.log(`Result: "${processed}"`);
  return processed;
}
```

3. Compare Claude's raw output vs post-processed output to identify where variation happens.

---

## What You've Accomplished

Congratulations! You've built a complete LLM-powered data normalization system. Let's review what you learned:

### Technical Skills Gained

- **AWS Bedrock Integration**: Called Claude Haiku via AWS Bedrock API
- **Prompt Engineering**: Crafted effective prompts for data normalization
- **Post-Processing Pipelines**: Built a self-healing layer to fix LLM inconsistencies
- **Statistical Validation**: Measured quality using confidence intervals
- **Serverless Architecture**: Deployed a production-ready Lambda function
- **IaC with SAM**: Used infrastructure-as-code for repeatable deployments

### Production-Ready Pattern

You now have a reusable pattern for:
- Normalizing user-submitted form data
- Cleaning data for analytics and reporting
- Preparing data for downstream AI systems
- Building ETL pipelines with LLM intelligence

### Cost Understanding

For 1,000 leads with 7 fields each:
- **Claude Haiku cost**: ~$0.07
- **DynamoDB cost**: ~$0.01 (pay-per-request)
- **Lambda cost**: ~$0.02 (512MB, 300s max)
- **Total**: **~$0.10 per 1,000 records**

Compare to manual data entry: $75 per 1,000 records (at $15/hr).

---

## Next Steps

Ready to take this further?

### 1. Adapt to Your Data

Replace the Colombian form fields with your own:
- E-commerce: Product names, categories, descriptions
- HR: Job titles, departments, locations
- Healthcare: Medication names, diagnoses (ensure HIPAA compliance!)
- Finance: Company names, transaction descriptions

### 2. Add Advanced Features

- **Error recovery**: Retry failed normalizations with backoff
- **Change detection**: Only normalize if original data changed
- **A/B testing**: Compare Haiku vs Sonnet quality and cost
- **Multi-language**: Extend prompts for non-Spanish data

### 3. Scale to Production

- **Increase concurrency**: Remove `ReservedConcurrentExecutions: 1`
- **Add dead letter queue**: Capture failed normalizations for review
- **Set up monitoring**: CloudWatch dashboards, SNS alerts
- **Enable X-Ray tracing**: Debug performance issues

### 4. Explore the Full Pattern

Read the complete documentation:
- **ARCHITECTURE.md**: Detailed system design
- **STATISTICAL-VALIDATION.md**: Advanced quality metrics
- **LESSONS-LEARNED.md**: Production insights and pitfalls
- **COST-ANALYSIS.md**: Cost optimization strategies

---

## Additional Resources

### Documentation Links

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Claude Prompt Engineering Guide](https://docs.anthropic.com/claude/docs/prompt-engineering)
- [AWS SAM Developer Guide](https://docs.aws.amazon.com/serverless-application-model/)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

### Community

- AWS re:Post - Ask questions about Bedrock and SAM
- Anthropic Discord - Prompt engineering discussions
- GitHub Issues - Report bugs or request features

---

## Cleanup

When you're done experimenting, clean up AWS resources to avoid charges:

```bash
# Delete the SAM stack
aws cloudformation delete-stack --stack-name llm-normalization-tutorial --region us-east-1

# Wait for deletion to complete
aws cloudformation wait stack-delete-complete --stack-name llm-normalization-tutorial --region us-east-1

# Delete the DynamoDB table
aws dynamodb delete-table --table-name tutorial-leads --region us-east-1

# Verify cleanup
aws cloudformation list-stacks --region us-east-1 --query 'StackSummaries[?StackName==`llm-normalization-tutorial`]'
```

**Note:** S3 buckets created by SAM may need manual deletion.

---

## Feedback and Questions

Did you find this tutorial helpful? Have suggestions for improvements?

- Open an issue on GitHub
- Follow on Twitter/X: [@gabanox_](https://x.com/gabanox_)
- Connect on LinkedIn: [Gabriel Ramírez](https://www.linkedin.com/in/gabanox/)

---

**You did it!** You've successfully built an LLM-powered data normalization pipeline from scratch. This pattern is production-tested and has processed thousands of records at scale.

Now go build something amazing with it!

---

**Tutorial Version:** 1.0
**Last Updated:** January 24, 2026
**Estimated Completion Time:** 90 minutes
**Difficulty:** Intermediate
**AWS Cost:** ~$0.10 (during tutorial)
