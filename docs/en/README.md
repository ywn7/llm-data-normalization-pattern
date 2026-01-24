> **Language**: [English](./README.md) | [Español](../es/README.md)

# LLM-Powered Data Normalization ETL Pattern

**A production-ready serverless pattern for intelligent data normalization using Claude Haiku via AWS Bedrock**

## Executive Summary

This pattern combines LLM-based normalization with statistical validation and post-processing to achieve high-quality data cleansing at low cost. Originally implemented for an educational program registration system, it demonstrates how to build a self-healing ETL pipeline that detects and corrects systematic errors through statistical analysis.

**Key Innovation**: The pattern uses a dual-layer approach:
1. **LLM normalization** via Claude 3 Haiku for intelligent text processing
2. **Regex post-processing pipeline** to catch and fix LLM output inconsistencies
3. **Statistical validation** with 95% confidence intervals to measure quality and detect bugs

**Production Results** (from real implementation):
- **652 leads** processed with **4,280 fields** normalized
- **70.4% improvement rate** (3,013 of 4,280 fields required changes)
- **99.2% coverage** (4,246 of 4,280 fields successfully normalized)
- **Cost**: ~$0.04/month for 650+ records
- **Bug detection**: Statistical analysis caught a systematic "double-dot" bug affecting 65.7% of addresses

## Architecture at a Glance

```
┌────────────────────┐
│  EventBridge       │──► Daily at 2 AM COT (7 AM UTC)
│  Scheduled Rule    │
└─────────┬──────────┘
          │
          ▼
┌─────────────────────────────────────────────────┐
│         Normalize Leads Lambda                  │
│  ┌───────────────────────────────────────────┐  │
│  │ 1. Query leads needing normalization      │  │
│  │ 2. Generate field-specific prompts        │  │
│  │ 3. Call Claude Haiku via Bedrock          │  │
│  │ 4. Parse JSON response                    │  │
│  │ 5. Apply post-processing regex pipeline   │  │ ◄─ Self-healing
│  │ 6. Store in normalizedData attribute      │  │
│  │ 7. Track metrics (coverage, improvements) │  │
│  └───────────────────────────────────────────┘  │
└────────┬──────────────────────────┬─────────────┘
         │                          │
         ▼                          ▼
┌──────────────────┐      ┌─────────────────────┐
│   DynamoDB       │      │   AWS Bedrock       │
│   awsrestart-    │      │   Claude 3 Haiku    │
│   leads          │      │                     │
│   ├─ original    │      │   $0.00025/1K input │
│   └─ normalized  │      │   $0.00125/1K output│
└──────────────────┘      └─────────────────────┘
```

**Non-destructive**: Original data preserved in source fields, normalized data stored in `normalizedData` attribute.

## Use Cases

This pattern is ideal for:

1. **User-submitted form data** with free-text fields
   - Names, addresses, cities, companies
   - Education levels, job titles, certifications
   - Lists (programming languages, cloud platforms)

2. **Data quality improvement** for analytics/reporting
   - Standardize city names ("Bogota", "BOGOTÁ", "Bogotá D.C." → "Bogota D.C.")
   - Normalize company names ("ACME CORP", "Acme Corporation", "acme" → "Acme Corporation")
   - Expand abbreviations ("Ing. Sistemas" → "Ingeniero de Sistemas")

3. **LLM input preparation** for downstream AI processes
   - Clean data improves AI evaluation accuracy
   - Consistent formats enable better pattern matching
   - Reduced hallucination risk from malformed inputs

4. **Compliance and auditing** scenarios
   - Original data preservation for audit trails
   - Configurable normalization rules without code changes
   - Timestamp tracking for data lineage

## 📚 How to Read This Documentation

### Start Here → Choose Your Path

| Your Goal | Start With | Then Read |
|-----------|------------|-----------|
| **Understand the pattern** (30 min) | This README | [Architecture](./ARCHITECTURE.md) → [Cost Analysis](./COST-ANALYSIS.md) |
| **Implement it yourself** (2-3 hrs) | This README | [Tutorial](./TUTORIAL.md) ⭐ → [Implementation](./IMPLEMENTATION.md) |
| **Understand the "why"** (2 hrs) | This README | [explanation/](./explanation/) directory |
| **Validate quality** (1 hr) | This README | [Statistical Validation](./STATISTICAL-VALIDATION.md) |
| **Avoid pitfalls** (30 min) | This README | [Lessons Learned](./LESSONS-LEARNED.md) |

### Documentation Map

```
START HERE
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  README.md (this file)                                          │
│  Overview, architecture, use cases, quick start                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  TUTORIAL.md  │    │ ARCHITECTURE  │    │ explanation/  │
│  Hands-on     │    │ System design │    │ Deep "why"    │
│  90 minutes   │    │               │    │               │
└───────┬───────┘    └───────┬───────┘    └───────────────┘
        │                    │
        ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│IMPLEMENTATION │    │  STATISTICAL  │    │    LESSONS    │
│ Step-by-step  │    │  VALIDATION   │    │    LEARNED    │
└───────────────┘    └───────────────┘    └───────────────┘
                             │
                             ▼
                     ┌───────────────┐
                     │ COST-ANALYSIS │
                     │  ROI & costs  │
                     └───────────────┘
```

### By Role

- **Developers**: README → [Tutorial](./TUTORIAL.md) → [Implementation](./IMPLEMENTATION.md)
- **Architects**: README → [explanation/](./explanation/) → [Architecture](./ARCHITECTURE.md)
- **Data Engineers**: README → [Statistical Validation](./STATISTICAL-VALIDATION.md)
- **Managers/PMs**: README → [Cost Analysis](./COST-ANALYSIS.md)

### Visual Diagrams

#### System Architecture
![Architecture Diagram](../../diagrams/generated/architecture.png)

#### Dual-Layer Processing
![Dual Layer Architecture](../../diagrams/generated/dual-layer.png)

#### Cost Flow
![Cost Flow Diagram](../../diagrams/generated/cost-flow.png)

See [diagrams/](../../diagrams/) for source files and [sequences.md](../../diagrams/sequences.md) for Mermaid diagrams.

---

## Why This Pattern?

### Traditional ETL vs. LLM-Powered ETL

| Approach | Pros | Cons |
|----------|------|------|
| **Regex-only** | Fast, deterministic | Brittle, requires exhaustive patterns, poor for context |
| **Rule-based lookup** | Predictable | Requires curated lists, doesn't handle variations well |
| **LLM-only** | Contextual, handles variations | Unpredictable, can hallucinate, expensive at scale |
| **This Pattern** | **Best of both worlds** | Requires tuning, LLM API dependency |

**This pattern combines**:
- LLM intelligence for context-aware normalization
- Post-processing rules to enforce constraints
- Statistical validation to detect quality drift
- Cost optimization through batch processing + Haiku pricing

### When NOT to Use This Pattern

- **High-volume, low-latency** requirements (>10K records/hour) - consider caching normalized values
- **Mission-critical financial data** where determinism is paramount - use rule-based validation
- **Offline/air-gapped** environments - no internet access for Bedrock API
- **Very simple normalization** (uppercase/lowercase only) - overkill, use basic string functions

## Quick Start

### Prerequisites

- AWS Account with Bedrock access (Claude 3 Haiku model enabled)
- AWS SAM CLI installed
- Node.js 22.x or later
- DynamoDB table with leads data

### 5-Minute Setup

1. **Clone the implementation**:
```bash
# Extract the Lambda function from this repository
cd lambda/normalize-leads/
```

2. **Configure environment variables**:
```bash
export LEADS_TABLE="your-leads-table"
export BEDROCK_MODEL_ID="anthropic.claude-3-haiku-20240307-v1:0"
export BATCH_SIZE="10"
export AWS_REGION="us-east-1"
```

3. **Deploy with SAM**:
```bash
sam build
sam deploy --guided
```

4. **Test manually**:
```bash
# Invoke with forceAll to normalize all records
sam local invoke NormalizeLeadsFunction -e test-event.json
```

5. **Verify results**:
```bash
aws dynamodb get-item \
  --table-name your-leads-table \
  --key '{"leadId": {"S": "test-lead-id"}}' \
  --query 'Item.normalizedData'
```

### Expected Output

```json
{
  "normalizedAt": 1706000000000,
  "nombres": "Juan Carlos",
  "apellidos": "Perez Garcia",
  "ciudad": "Bogota D.C.",
  "direccion": "Cra. 15 # 100 - 25",
  "nivelEducativo": "Profesional"
}
```

## Pattern Components

### 1. Lambda Function (`normalize-leads`)
- **Runtime**: Node.js 22.x
- **Memory**: 512 MB (balanced for Bedrock SDK)
- **Timeout**: 300s (5 minutes for large batches)
- **Concurrency**: 1 (avoid Bedrock rate limits)

### 2. EventBridge Schedule
- **Frequency**: Daily at 2 AM COT (7 AM UTC)
- **Rationale**: Low-traffic window, fresh data for morning reports
- **Enable/disable**: Via DynamoDB config table

### 3. DynamoDB Schema
```javascript
{
  leadId: "uuid",                    // Partition key
  nombres: "JUAN CARLOS",            // Original user input
  apellidos: "PEREZ GARCIA",
  ciudad: "bogota",
  direccion: "CRA 15 NO 100 25",

  normalizedAt: 1706000000000,       // Timestamp of last normalization
  normalizedData: {                  // Normalized values
    nombres: "Juan Carlos",
    apellidos: "Perez Garcia",
    ciudad: "Bogota D.C.",
    direccion: "Cra. 15 # 100 - 25"
  }
}
```

### 4. Configuration Table (Optional)
```javascript
{
  configId: "normalization-settings",
  enabled: true,
  batchSize: 10,
  maxLeadsPerRun: 50,
  normalizationTTLDays: 7,           // Re-normalize after 7 days
  fieldsToNormalize: [
    "nombres", "apellidos", "direccion",
    "ciudad", "nivelEducativo"
  ]
}
```

## Cost Analysis

### Claude 3 Haiku Pricing (as of Jan 2026)
- **Input**: $0.00025 per 1,000 tokens
- **Output**: $0.00125 per 1,000 tokens

### Real-World Production Costs

**Scenario**: 652 leads, 7 fields each (4,564 total normalizations)

| Component | Volume | Cost |
|-----------|--------|------|
| Input tokens (prompts) | ~130,000 tokens | $0.033 |
| Output tokens (normalized) | ~8,000 tokens | $0.010 |
| **Total** | **652 leads** | **$0.043** |

**Monthly cost for 1,000 leads**: ~$0.07

**Cost per lead**: $0.000066 (0.0066 cents)

### Cost Comparison

| Approach | Cost per 1K leads | Notes |
|----------|-------------------|-------|
| Manual data entry clerk ($15/hr) | $75 | 5 min per lead |
| Rule-based ETL (custom code) | $0 | Engineering time: weeks |
| Claude 3.5 Sonnet (LLM-only) | $1.20 | 15x more expensive |
| **This pattern (Haiku + rules)** | **$0.07** | Best cost/quality ratio |

## Key Features

### 1. Idempotent Operations
- Uses `normalizedAt` timestamp to avoid redundant processing
- Configurable TTL (default: 7 days) for re-normalization
- Manual `forceAll` flag to re-normalize entire dataset

### 2. Non-Destructive
- Original fields preserved unchanged
- Normalized values stored in separate `normalizedData` object
- Full audit trail with timestamps

### 3. Configurable Without Deployment
- Field list, batch size, TTL stored in DynamoDB
- Enable/disable entire pipeline via config flag
- No code changes needed for rule adjustments

### 4. Self-Healing Through Statistics
- Calculates 95% confidence intervals for improvement rates
- Detects anomalies (e.g., "double-dot" bug discovery)
- Automated alerts when quality metrics deviate

### 5. Batch Processing Optimization
- Processes N leads per Bedrock API call (default: 10)
- Reduces latency and API costs vs. individual calls
- Configurable batch size based on data complexity

## Statistical Validation Methodology

### Why Validate LLM Outputs Statistically?

LLMs are probabilistic by nature. Even at temperature=0, outputs can vary due to:
- Model updates
- Prompt engineering changes
- Edge cases in input data
- Systematic bugs in post-processing

**Solution**: Treat normalization quality as a statistical process with measurable confidence intervals.

### Metrics Tracked

1. **Coverage**: % of fields successfully normalized
   - Formula: `(successful normalizations / total fields) × 100`
   - Target: >95%

2. **Improvement Rate**: % of fields that required changes
   - Formula: `(fields changed / total fields) × 100`
   - Expected: 60-80% for user-submitted data

3. **Confidence Interval (95%)**: Statistical range for true improvement rate
   - Formula: `p ± 1.96 × √(p(1-p)/n)`
   - Example: 70.4% ± 1.4% means true rate is between 69.0% and 71.8%

### Bug Detection Example: The Double-Dot Bug

**Discovery**: Statistical analysis on 652 leads revealed:
- **Addresses**: 65.7% improvement rate (428/652)
- **Cities**: 55.8% improvement rate (364/652)
- **Names**: 3.8% improvement rate (25/652)

**Red flag**: Address improvement rate was unusually high for a format field.

**Investigation**: Manual spot-checking revealed:
```
Original:  "Cra. 15 # 100 - 25"
LLM output: "Cra. 15 # 100 - 25"  (no change)
Post-process: "Cra. . 15 # 100 - 25"  ← Double dot inserted!
```

**Root cause**: Regex pattern `.replace(/\b(cra)\.?\s*/gi, 'Cra. ')` applied to already-formatted "Cra." → "Cra. ."

**Fix**: Updated regex to check for existing dot:
```javascript
.replace(/\b(carrera|cra|cr|kra)\.?\s*/gi, 'Cra. ')
```

**Result**: Address improvement rate dropped to expected 15-20%, confirming fix.

## Next Steps

- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: Deep dive into system design
- **[IMPLEMENTATION.md](./IMPLEMENTATION.md)**: Step-by-step implementation guide
- **[STATISTICAL-VALIDATION.md](./STATISTICAL-VALIDATION.md)**: Statistical methodology details
- **[LESSONS-LEARNED.md](./LESSONS-LEARNED.md)**: Production insights and pitfalls
- **[COST-ANALYSIS.md](./COST-ANALYSIS.md)**: Detailed cost breakdown and optimization

## Contributing

This pattern is extracted from a production educational platform. Contributions welcome:
- Prompt engineering improvements
- Support for additional LLM providers (OpenAI, Cohere)
- Multi-language support
- Performance optimizations

## License

MIT License - See LICENSE file for details

## Author

**Gabriel Isaías Ramírez Melgarejo**
AWS Community Hero | Founder, Bootcamp Institute SAS
- GitHub: [@gabanox](https://github.com/gabanox)
- LinkedIn: [Gabriel Ramírez](https://www.linkedin.com/in/gabriel-ramirez-melgarejo/)

---

**Note**: This documentation sanitizes client-specific details while preserving technical accuracy. The pattern is production-tested and ready for reuse in similar data quality scenarios.
