> **Language**: [English](./COST-ANALYSIS.md) | [Español](../es/ANALISIS-COSTOS.md)

# Cost Analysis and Optimization

**Detailed breakdown of LLM normalization costs and strategies to minimize spend**

## Executive Summary

**Production costs** (652 leads, 4,280 fields normalized):
- **Total**: $0.043
- **Per lead**: $0.000066 (6.6 cents per 1,000 leads)
- **Per field**: $0.00001 (1 cent per 1,000 fields)

**Projected monthly costs** (various scales):

| Monthly Volume | Total Cost | Per Lead |
|----------------|------------|----------|
| 500 leads | $0.033 | $0.000066 |
| 1,000 leads | $0.066 | $0.000066 |
| 5,000 leads | $0.330 | $0.000066 |
| 10,000 leads | $0.660 | $0.000066 |
| 50,000 leads | $3.300 | $0.000066 |

**Cost is linear and predictable** - $0.066 per 1,000 leads regardless of scale.

## Cost Breakdown

### AWS Bedrock: Claude 3 Haiku Pricing

**Pricing** (as of January 2026):
- **Input tokens**: $0.00025 per 1,000 tokens ($0.25 per 1M tokens)
- **Output tokens**: $0.00125 per 1,000 tokens ($1.25 per 1M tokens)

**Per-batch cost** (10 leads, 7 fields each):

| Component | Tokens | Cost |
|-----------|--------|------|
| Prompt (fixed overhead) | ~800 | $0.0002 |
| Lead data (10 leads) | ~500 | $0.00013 |
| **Total input** | **~1,300** | **$0.00033** |
| **Output (JSON response)** | **~80** | **$0.0001** |
| **Total per batch** | **~1,380** | **$0.00043** |

**Cost per lead**: $0.00043 / 10 = **$0.000043**

**Actual production costs** (652 leads):
- **Batches**: 65 batches (652 / 10)
- **Total input tokens**: ~84,500 tokens
- **Total output tokens**: ~5,200 tokens
- **Total cost**: $0.028 (Bedrock) + $0.015 (Lambda/DynamoDB) = **$0.043**

### Lambda Costs

**Configuration**:
- Memory: 512 MB
- Duration: ~3 minutes for 50 leads
- Executions: 1 per day (scheduled)

**Cost calculation**:
```
Monthly executions: 30
Duration per execution: 180s (3 min)
GB-seconds: (512 MB / 1024) × 180s × 30 = 2,700 GB-s

Lambda pricing:
- First 400,000 GB-s/month: FREE (well within free tier)
- Requests: 30/month (FREE - first 1M requests free)

Lambda monthly cost: $0.00
```

**Lambda is effectively free** for this workload due to AWS Free Tier.

### DynamoDB Costs

**Operations per normalization**:
- **Reads**: 1 × `GetItem` (config) + 1 × `Scan` (leads) = ~100 read units
- **Writes**: 50 × `UpdateItem` (normalized leads) = 50 write units

**Cost calculation** (pay-per-request):
```
Monthly reads: 100 reads × 30 days = 3,000 reads
Monthly writes: 50 writes × 30 days = 1,500 writes

DynamoDB pricing:
- Reads: $0.25 per 1M reads → $0.00075
- Writes: $1.25 per 1M writes → $0.001875

DynamoDB monthly cost: $0.0026 (~$0.003)
```

### EventBridge Costs

**Invocations**: 1 per day × 30 days = 30 invocations/month

**Cost**: First 1 million events are FREE.

**EventBridge monthly cost**: $0.00

### Total Monthly Cost (1,000 Leads/Month)

| Service | Cost |
|---------|------|
| AWS Bedrock (Claude 3 Haiku) | $0.066 |
| Lambda | $0.000 (Free Tier) |
| DynamoDB | $0.003 |
| EventBridge | $0.000 (Free Tier) |
| **Total** | **$0.069** |

**Cost per lead**: $0.000069 (~7 cents per 1,000 leads)

## Cost Comparison: Alternatives

### 1. Manual Data Entry

**Scenario**: Hire a data entry clerk at $15/hour to normalize 1,000 leads.

**Assumptions**:
- 5 minutes per lead (check 7 fields, standardize formats)
- Hourly rate: $15

**Cost**:
```
Time: 1,000 leads × 5 min = 5,000 min = 83.3 hours
Cost: 83.3 hours × $15/hour = $1,250
```

**Comparison**: This pattern is **18,000x cheaper** than manual entry.

### 2. Custom Rule-Based ETL

**Scenario**: Build a custom Python script with regex patterns and lookup tables.

**Costs**:
- **Development time**: 2 weeks (80 hours) × $75/hour = $6,000
- **Maintenance**: 4 hours/month × $75/hour = $300/month
- **Runtime**: Lambda free tier, DynamoDB minimal

**First-year cost**: $6,000 + ($300 × 12) = **$9,600**

**Comparison**: This pattern pays for itself in < 1 month if:
- You value developer time
- You need flexibility (LLM adapts to new patterns without code changes)
- You don't want to maintain hundreds of regex rules

### 3. Claude 3.5 Sonnet (Higher-End LLM)

**Scenario**: Use Sonnet instead of Haiku for normalization.

**Sonnet pricing**:
- Input: $0.003 per 1,000 tokens (12x more expensive)
- Output: $0.015 per 1,000 tokens (12x more expensive)

**Cost per 1,000 leads**:
```
Haiku: $0.066
Sonnet: $0.792

Difference: $0.726 more per 1,000 leads (12x increase)
```

**When to use Sonnet**:
- Complex reasoning required (not the case for normalization)
- Quality improvement justifies 12x cost (rare for structured data)

**Recommendation**: Stick with Haiku unless quality metrics drop below 95%.

### 4. GPT-4o-mini (OpenAI Alternative)

**Scenario**: Use OpenAI GPT-4o-mini instead of Claude Haiku.

**GPT-4o-mini pricing**:
- Input: $0.00015 per 1,000 tokens (40% cheaper than Haiku)
- Output: $0.0006 per 1,000 tokens (52% cheaper than Haiku)

**Cost per 1,000 leads**:
```
Haiku: $0.066
GPT-4o-mini: $0.040

Difference: $0.026 savings per 1,000 leads (40% cheaper)
```

**Considerations**:
- **Pros**: Cheaper, widely available
- **Cons**: Requires OpenAI API (separate billing), different API format, may require prompt tuning

**Recommendation**: If already using OpenAI API, consider GPT-4o-mini. Otherwise, Haiku's integration with AWS (same billing, IAM auth) outweighs marginal cost savings.

## Cost Optimization Strategies

### 1. Increase Batch Size

**Current**: 10 leads per API call

**Optimization**: 20 leads per API call

**Impact**:
```
Current: 1,000 leads → 100 batches × $0.00043 = $0.043
Optimized: 1,000 leads → 50 batches × $0.00055 = $0.028  (35% savings)
```

**Why it works**: Prompt overhead is amortized over more leads.

**Trade-offs**:
- ⚠️ Higher memory usage (512 MB → 768 MB might be needed)
- ⚠️ Longer timeout needed (300s might not suffice for 20-lead batches)
- ✅ Reduced API calls (better for rate limiting)

**Recommendation**: Test with 15-20 leads per batch, monitor Lambda memory/timeout.

### 2. Reduce Fields Normalized

**Current**: 7 fields per lead

**Optimization**: Normalize only high-priority fields (4 fields)

**Impact**:
```
Current: 7 fields × 1,000 leads = 7,000 fields → $0.066
Optimized: 4 fields × 1,000 leads = 4,000 fields → $0.038  (42% savings)
```

**Trade-offs**:
- ⚠️ Less comprehensive normalization
- ✅ Lower costs
- ✅ Faster processing

**Recommendation**: Only normalize fields that impact reporting/analytics.

**Priority matrix**:

| Priority | Fields | Why |
|----------|--------|-----|
| High | ciudad, nivelEducativo, ocupacionActual | High variance, impact analytics |
| Medium | empresa, direccion | Moderate variance, nice to have |
| Low | nombres, apellidos | Low variance, mostly formatted |

### 3. Lengthen Normalization TTL

**Current**: Re-normalize every 7 days

**Optimization**: Re-normalize every 30 days

**Impact**:
```
Current: 1,000 leads normalized 4 times/month = 4,000 normalizations/month
Optimized: 1,000 leads normalized 1 time/month = 1,000 normalizations/month

Savings: 75% reduction in re-normalization costs
```

**Trade-offs**:
- ⚠️ Stale normalized data if prompts/models change
- ✅ 4x cost reduction for re-normalizations

**Recommendation**: 7-day TTL for active data, 30-day TTL for archived data.

### 4. Use Caching for Repeated Values

**Scenario**: Many leads share the same city/company.

**Optimization**: Cache normalized values in memory.

```javascript
const cache = new Map();

function normalizeCityWithCache(city) {
  const key = city.toLowerCase();

  if (cache.has(key)) {
    return cache.get(key);  // Skip LLM call
  }

  const normalized = await normalizeLead({ ciudad: city });
  cache.set(key, normalized.ciudad);
  return normalized.ciudad;
}
```

**Impact**:
```
Example: 1,000 leads with only 50 unique cities
Without cache: 1,000 API calls
With cache: 50 API calls (95% reduction)

Savings: $0.066 → $0.003 (95% cheaper)
```

**Trade-offs**:
- ⚠️ Requires cache invalidation strategy
- ⚠️ Doesn't work well for unique fields (names, addresses)
- ✅ Massive savings for fields with low cardinality

**Recommendation**: Implement for `ciudad`, `empresa`, `nivelEducativo` (low cardinality fields).

### 5. Skip Already-Normalized Leads

**Current**: Always re-normalize if TTL expired

**Optimization**: Hash normalized data, skip if unchanged

```javascript
async function normalizeLead(lead) {
  const fieldsData = extractFields(lead);
  const currentHash = hashFields(fieldsData);

  if (lead.normalizedHash === currentHash) {
    console.log('Data unchanged, skipping normalization');
    return { normalized: false, reason: 'Unchanged' };
  }

  // Proceed with normalization...
}
```

**Impact**:
```
Scenario: 30% of leads haven't changed since last normalization
Without optimization: 1,000 normalizations
With optimization: 700 normalizations

Savings: 30% cost reduction
```

**Recommendation**: Implement if re-normalization costs become significant.

## Scaling Cost Projections

### Small Scale (1,000 Leads/Month)

| Service | Cost |
|---------|------|
| Bedrock | $0.066 |
| Lambda | $0.000 |
| DynamoDB | $0.003 |
| **Total** | **$0.069** |

**Cost per lead**: $0.000069

### Medium Scale (10,000 Leads/Month)

| Service | Cost |
|---------|------|
| Bedrock | $0.660 |
| Lambda | $0.005 |
| DynamoDB | $0.030 |
| **Total** | **$0.695** |

**Cost per lead**: $0.000069 (same - linear scaling)

### Large Scale (100,000 Leads/Month)

| Service | Cost |
|---------|------|
| Bedrock | $6.60 |
| Lambda | $0.50 |
| DynamoDB | $3.00 |
| **Total** | **$10.10** |

**Cost per lead**: $0.000101 (marginal increase due to Lambda/DynamoDB)

### Very Large Scale (1,000,000 Leads/Month)

| Service | Cost |
|---------|------|
| Bedrock | $66.00 |
| Lambda | $5.00 |
| DynamoDB | $30.00 |
| **Total** | **$101.00** |

**Cost per lead**: $0.000101

**At this scale, consider**:
- Reserved capacity for Lambda/DynamoDB (20-30% savings)
- Caching layer (Redis/ElastiCache) to reduce redundant normalizations
- Fine-tuning a smaller model (Llama 3) for on-premise inference

## ROI Analysis

### Scenario: Educational Institution (This Project)

**Context**: 100 students/month enroll, 652 leads collected.

**Costs**:
- Normalization: $0.043 (one-time for 652 leads)
- Infrastructure: $0.003/month (DynamoDB)

**Benefits**:
- **Reporting accuracy**: Clean data enables accurate analytics
- **Time savings**: 5 hours/month saved on manual data cleaning (5 × $50/hour = $250/month)
- **AI evaluation**: Improved prompt quality for downstream AI candidate evaluation

**ROI**: (250 - 0.043 - 0.003) / 0.046 = **5,400% ROI** (54x return)

### Scenario: SaaS Platform (10,000 Users/Month)

**Context**: B2B SaaS with user-submitted company/industry data.

**Costs**:
- Normalization: $0.69/month (10,000 users × 3 fields)
- Developer time saved: 20 hours/month × $100/hour = $2,000/month

**ROI**: (2,000 - 0.69) / 0.69 = **289,800% ROI** (2,898x return)

### Scenario: E-commerce (100,000 Products/Month)

**Context**: Marketplace with seller-submitted product descriptions.

**Costs**:
- Normalization: $10.10/month (100,000 products × 5 fields)
- Manual QA reduction: 50 hours/month × $75/hour = $3,750/month

**ROI**: (3,750 - 10.10) / 10.10 = **37,000% ROI** (370x return)

## Budget Planning

### Monthly Budget Template

```
Base costs (pay-per-request):
  Bedrock: $0.066 per 1,000 leads
  Lambda: $0.000 (Free Tier up to 400,000 GB-s)
  DynamoDB: $0.003 per 1,000 leads
  EventBridge: $0.000 (Free Tier up to 1M events)

Total: $0.069 per 1,000 leads

Scaling factors:
  × Number of thousands of leads
  × Average fields per lead / 7 (baseline)
  × Re-normalization frequency / 30 days (baseline)

Example (5,000 leads/month, 10 fields, weekly re-normalization):
  Base: $0.069 × 5 = $0.345
  Field adjustment: × (10 / 7) = $0.493
  Frequency adjustment: × (30 / 7) = $2.11/month
```

### Cost Alerts

**Recommended CloudWatch Billing Alarms**:

| Volume | Monthly Budget | Alert Threshold |
|--------|----------------|-----------------|
| 1,000 leads | $0.07 | $0.10 (safety margin) |
| 10,000 leads | $0.70 | $1.00 |
| 100,000 leads | $10.00 | $15.00 |

**SAM template**:
```yaml
CostAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: normalization-cost-spike
    Namespace: AWS/Billing
    MetricName: EstimatedCharges
    Dimensions:
      - Name: ServiceName
        Value: AmazonBedrock
    Statistic: Maximum
    Period: 86400  # 24 hours
    EvaluationPeriods: 1
    Threshold: 1.00  # $1/day = ~$30/month
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref AlertTopic
```

## Conclusion

**This pattern is extremely cost-effective**:
- **$0.066 per 1,000 leads** (7 fields each)
- **Linear scaling** (predictable costs)
- **18,000x cheaper** than manual data entry
- **Pays for itself** in < 1 month vs custom development

**Key cost drivers**:
1. **Bedrock API calls** (94% of total cost) → optimize by batching
2. **Number of fields** (linear) → prioritize high-value fields
3. **Re-normalization frequency** (multiplicative) → adjust TTL based on data volatility

**Optimization priorities**:
1. **Increase batch size** (35% savings, minimal risk)
2. **Implement caching** (up to 95% savings for low-cardinality fields)
3. **Reduce re-normalization frequency** (75% savings for stable data)

**Bottom line**: At $0.000066 per lead, this pattern is a no-brainer for any system with >100 leads/month.

## Next Steps

- **[README.md](./README.md)**: Pattern overview and quick start
- **[IMPLEMENTATION.md](./IMPLEMENTATION.md)**: Step-by-step setup guide
- **[STATISTICAL-VALIDATION.md](./STATISTICAL-VALIDATION.md)**: Quality measurement
- **[LESSONS-LEARNED.md](./LESSONS-LEARNED.md)**: Production insights

---

**Last Updated**: January 24, 2026
