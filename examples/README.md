# Examples

This directory contains working examples of the LLM Data Normalization pattern.

## Directory Structure

```
examples/
├── lambda/
│   ├── normalize-leads/     # Main Lambda function
│   │   ├── index.js         # Handler code
│   │   ├── prompts.js       # Prompt engineering
│   │   └── package.json     # Dependencies
│   └── template.yaml        # SAM template
│
└── test-data/
    └── sample-leads.json    # Sample data for testing
```

## Quick Start

### Prerequisites

- AWS CLI configured with appropriate credentials
- AWS SAM CLI installed
- Node.js 22.x or later
- AWS Bedrock access with Claude 3 Haiku enabled

### Deploy

```bash
cd examples/lambda

# Build
sam build

# Deploy (first time - guided)
sam deploy --guided

# Deploy (subsequent)
sam deploy
```

### Test Locally

```bash
# Start local API
sam local invoke NormalizeLeadsFunction -e ../test-data/event.json

# Or invoke directly
aws lambda invoke \
  --function-name dev-normalize-leads \
  --payload '{"source": "manual"}' \
  response.json
```

### Test Data

The `test-data/sample-leads.json` file contains anonymized sample data you can use to test the normalization. Load it into DynamoDB:

```bash
# Create items in DynamoDB (one at a time)
aws dynamodb put-item \
  --table-name leads \
  --item file://test-data/sample-lead-001.json
```

## Customization

### Adding New Fields

1. Edit `prompts.js` to add field-specific prompts
2. Update the Lambda handler to process the new field
3. Add post-processing rules if needed

### Changing the LLM Model

Edit `index.js` and change the model ID:

```javascript
// From Haiku to Sonnet (more expensive, higher quality)
const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
```

### Adjusting Batch Size

In the Lambda handler, modify:

```javascript
const BATCH_SIZE = 10;  // Leads per Bedrock call
const MAX_LEADS_PER_RUN = 50;  // Total per invocation
```

## Cost Estimates

| Configuration | Cost per 1K records |
|--------------|---------------------|
| Haiku, batch=10 | $0.07 |
| Haiku, batch=1 | $0.70 |
| Sonnet, batch=10 | $1.05 |
| Sonnet, batch=1 | $10.50 |

## Troubleshooting

### "AccessDeniedException" from Bedrock

Ensure your Lambda execution role has the `bedrock:InvokeModel` permission for the Claude model.

### Timeout errors

Increase the Lambda timeout in `template.yaml` (default: 300s) or reduce `MAX_LEADS_PER_RUN`.

### Inconsistent normalization

Check the post-processing rules in `prompts.js`. LLMs are probabilistic - the regex pipeline catches inconsistencies.
