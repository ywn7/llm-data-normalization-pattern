> **Language**: [English](./LESSONS-LEARNED.md) | [Espanol](./es/LECCIONES-APRENDIDAS.md)

# Lessons Learned from Production

**Real-world insights from implementing LLM-powered data normalization at scale**

## Context

This pattern was implemented for an educational program registration system in Colombia, processing **652 leads** with **4,280 fields normalized** over a 2-week period. Here's what worked, what didn't, and what we'd do differently.

## What Worked Exceptionally Well

### 1. Claude 3 Haiku Was the Perfect Model

**Decision**: Use Haiku instead of Sonnet for cost savings.

**Outcome**:
- **12x cheaper** than Sonnet ($0.043 vs $0.48 for 652 leads)
- **2-3s latency** per batch (acceptable for overnight processing)
- **Sufficient quality** for structured normalization tasks

**Lesson**: For structured tasks (normalization, classification, extraction), Haiku is underrated. Save Sonnet for creative/reasoning tasks.

**Evidence**:
```
Cost per lead: $0.000066 (6.6 cents per 1000 leads)
Quality: 99.2% success rate
Stakeholder satisfaction: 10/10
```

### 2. Post-Processing Pipeline Was Essential

**Decision**: Don't trust LLM outputs blindly - add regex post-processing.

**Outcome**:
- Caught **65.7% of addresses** that LLM normalized correctly but post-processing broke (double-dot bug)
- Fixed **inconsistent capitalization** (LLM returned "bogota" vs "Bogotá")
- Enforced **exact formats** (always "Cra." with dot, never "Cra")

**Lesson**: LLMs + deterministic rules = best of both worlds.

**Code pattern**:
```javascript
// Layer 1: LLM (context-aware)
const llmOutput = await callClaude(prompt);

// Layer 2: Post-processing (deterministic)
const finalOutput = postProcessField(fieldName, llmOutput);
```

### 3. Non-Destructive Storage Was Crucial

**Decision**: Store normalized data in separate `normalizedData` attribute, preserve originals.

**Outcome**:
- **Rolled back** double-dot bug without data loss
- **A/B tested** different normalization rules
- **Compared** before/after for quality validation

**Lesson**: Always preserve original data. Storage is cheap, lost data is expensive.

**Schema**:
```javascript
{
  leadId: "abc123",
  nombres: "JUAN CARLOS",        // Original - never modified
  normalizedData: {
    nombres: "Juan Carlos"        // Normalized - can be regenerated
  },
  normalizedAt: 1706000000000
}
```

### 4. Statistical Validation Saved Us

**Decision**: Track improvement rates per field with confidence intervals.

**Outcome**: Detected the double-dot bug that affected **428 of 652 addresses** (65.7%).

**How it worked**:
```
Expected improvement rate for addresses: 15-25%
Actual improvement rate: 65.7% ± 3.7%
Z-score: 12.3 (highly significant outlier)
Action: Manual spot-check → bug found → fixed → re-normalized
```

**Lesson**: LLMs are probabilistic. Treat quality as a statistical process, not a binary pass/fail.

### 5. Batch Processing Reduced Costs by 10x

**Decision**: Send 10 leads per Bedrock API call instead of 1 lead per call.

**Outcome**:
- **Input tokens**: 1,300 per batch vs 13,000 for 10 individual calls (10x reduction in prompt overhead)
- **API calls**: 65 calls vs 650 calls (10x reduction in API overhead)
- **Latency**: 130s vs 1,300s (10x faster)

**Lesson**: Batch aggressively. Prompts have fixed overhead - amortize it.

**Evidence**:
```
Individual calls: 650 calls × $0.0004 = $0.26
Batch calls:       65 calls × $0.0004 = $0.026  (10x cheaper)
```

## What Didn't Work (and How We Fixed It)

### 1. LLM-Only Normalization Was Inconsistent

**Problem**: Claude sometimes returned:
- "Cra. 15" vs "Cra 15" (missing dot)
- "Bogotá" vs "Bogota" (missing accent)
- "Juan Carlos" vs "Juan  Carlos" (double space)

**Why it failed**: Temperature=0 is deterministic for same input, but **varies across similar inputs**.

**Fix**: Added post-processing pipeline to enforce exact formats.

**Before**:
```javascript
// LLM-only approach
const normalized = await callClaude(prompt);
return normalized;  // Inconsistent outputs
```

**After**:
```javascript
// Dual-layer approach
const llmOutput = await callClaude(prompt);
const normalized = postProcessField(fieldName, llmOutput);
return normalized;  // Consistent outputs
```

### 2. Double-Dot Bug in Post-Processing

**Problem**: Regex pattern `/.replace(/\b(cra)\.?\s*/gi, 'Cra. ')` applied to already-formatted "Cra." resulted in "Cra. ."

**Why it failed**: Pattern matched "Cra." (with dot) and replaced with "Cra. " (adding another dot).

**Fix**: Updated regex to check for existing dot:
```javascript
// Buggy
.replace(/\b(cra)\.?\s*/gi, 'Cra. ')

// Fixed
.replace(/\b(carrera|cra|cr|kra)\.?\s*/gi, 'Cra. ')  // Matches full word
.replace(/\.\s*\./g, '.')  // Safety net: remove double dots
```

**Lesson**: Test post-processing with **already-formatted data**, not just raw data.

**Test case added**:
```javascript
test('handles address with existing dot (prevents double-dot bug)', () => {
  const response = '{"direccion": "Cra. 80 I # 51 - 09"}';
  const result = parseNormalizationResponse(response);

  expect(result.direccion).toBe('Cra. 80 I # 51 - 09');
  expect(result.direccion).not.toContain('. .');  // ← Critical assertion
});
```

### 3. Missing Edge Cases in City Mappings

**Problem**: LLM returned "Santafe de Bogota" (historical name), but our mapping only had "Bogota".

**Why it failed**: Didn't anticipate historical/alternative city names.

**Fix**: Expanded city mappings with variants:
```javascript
const CITY_MAPPINGS = {
  'bogota': 'Bogota D.C.',
  'bogotá': 'Bogota D.C.',
  'santafe de bogota': 'Bogota D.C.',  // ← Added
  'bogota d.c': 'Bogota D.C.',
  'bogota dc': 'Bogota D.C.'
};
```

**Lesson**: Build mappings iteratively. Start with common variants, add edge cases as you find them.

### 4. JSON Parsing Failures from LLM

**Problem**: Claude sometimes wrapped JSON in markdown code blocks:
````
```json
{"nombres": "Juan Carlos"}
```
````

**Why it failed**: `JSON.parse()` can't handle markdown.

**Fix**: Added markdown stripping in parser:
```javascript
export function parseNormalizationResponse(responseText) {
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

  return JSON.parse(jsonStr);
}
```

**Lesson**: LLMs don't follow instructions perfectly. Make parsers defensive.

### 5. Cold Starts Were Slow (Initial)

**Problem**: First invocation took 5-6 seconds (Bedrock SDK initialization).

**Why it failed**: Clients initialized inside handler function.

**Fix**: Moved client initialization outside handler:
```javascript
// ❌ Slow (initialized on every invocation)
export const handler = async (event) => {
  const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });
  // ...
};

// ✅ Fast (initialized once per Lambda container)
const bedrockClient = new BedrockRuntimeClient({ region: 'us-east-1' });

export const handler = async (event) => {
  // Client already initialized
};
```

**Lesson**: Always initialize SDK clients outside handler for Lambda container reuse.

**Impact**:
- Cold start: 5s → 2s (60% reduction)
- Warm invocations: 3s → <1s (70% reduction)

## Prompt Engineering Insights

### What Worked

#### 1. Explicit Output Format

✅ **Good**:
```
Responde UNICAMENTE con un JSON valido:
{
  "campo1": "valor normalizado"
}
```

❌ **Bad**:
```
Normalize this data and return the results.
```

**Lesson**: Be explicit about output format. LLMs follow patterns, not vague instructions.

#### 2. Examples Over Rules

✅ **Good**:
```
Ejemplo: "CRA 15 NO 100 25" -> "Cra. 15 # 100 - 25"
```

❌ **Bad**:
```
Use standard Colombian address format with proper abbreviations.
```

**Lesson**: Examples are more effective than rules. Show, don't tell.

#### 3. Language Consistency

✅ **Good**: Prompt in Spanish (data is Spanish)
```
Normaliza los siguientes campos...
```

❌ **Bad**: Prompt in English (data is Spanish)
```
Normalize the following Spanish fields...
```

**Lesson**: Match prompt language to data language for better context.

### What Didn't Work

#### 1. Asking LLM to Return Empty String

❌ **Bad**:
```
If the field is empty or invalid, return an empty string.
```

**Problem**: LLM often returned `null` or omitted the field instead.

**Fix**: Handle empty/null in post-processing:
```javascript
if (typeof value === 'string' && value.trim() !== '') {
  normalized[key] = postProcessField(key, value);
}
```

#### 2. Asking LLM to Validate Data

❌ **Bad**:
```
If the city name is not a valid Colombian city, return the original value.
```

**Problem**: LLM doesn't have comprehensive city databases - made up invalid cities.

**Fix**: Moved validation to post-processing with hardcoded list.

#### 3. Complex Multi-Step Instructions

❌ **Bad**:
```
First, check if the value is already normalized. If yes, return it unchanged.
If no, apply the following rules: 1) Capitalize first letter, 2) Remove extra spaces...
```

**Problem**: LLM got confused with complex logic.

**Fix**: Simplified prompt, moved complex logic to post-processing.

## Operational Insights

### Monitoring

**What worked**:
- **Token usage logging**: Caught cost spikes early
- **Per-field success rates**: Identified which fields needed prompt tuning
- **CloudWatch metrics**: Duration, errors, throttling

**What we added later**:
- **Statistical reports**: Improvement rates with confidence intervals
- **Anomaly detection**: Alerts when rates deviate from expected ranges

**Code**:
```javascript
console.log('Token usage:', {
  input: responseBody.usage?.input_tokens || 0,
  output: responseBody.usage?.output_tokens || 0
});

// Alert if tokens spike
if (responseBody.usage?.input_tokens > 2000) {
  console.warn('High token usage - investigate prompt size');
}
```

### Cost Control

**What worked**:
- **Batch processing**: 10x cost reduction
- **TTL-based re-normalization**: Only re-normalize every 7 days (vs daily)
- **Max leads per run**: Safety limit of 50 leads per execution

**What we wish we'd done**:
- **Cost alerts**: Set CloudWatch billing alarm at $1/day
- **Token budgets**: Fail-fast if approaching budget limit

### Testing Strategy

**What worked**:
- **Unit tests** for prompt generation and parsing
- **Manual spot-checking** of 20 random normalizations
- **Statistical validation** to catch systematic bugs

**What we should have done better**:
- **Regression tests** with real production data
- **Edge case database**: Maintain a list of known problematic inputs

**Test example**:
```javascript
test('handles already-formatted data without changes', () => {
  const input = {
    nombres: "Juan Carlos",
    direccion: "Cra. 15 # 100 - 25",
    ciudad: "Bogota D.C."
  };

  const result = normalizeLead(input);

  // Should NOT mark as changed if already formatted
  expect(result.changedFields).toEqual([]);
});
```

## Pitfalls to Avoid

### 1. Trusting LLM Outputs Blindly

❌ **Mistake**: `return await callClaude(prompt);`

✅ **Fix**: Add validation and post-processing layer.

### 2. Not Preserving Original Data

❌ **Mistake**: Overwriting original fields with normalized values.

✅ **Fix**: Store normalized data separately (`normalizedData` attribute).

### 3. Skipping Statistical Validation

❌ **Mistake**: "Tests pass, ship it!"

✅ **Fix**: Track improvement rates and confidence intervals.

### 4. Using Sonnet When Haiku Suffices

❌ **Mistake**: Default to most powerful model.

✅ **Fix**: Test with Haiku first, upgrade to Sonnet only if quality insufficient.

### 5. Initializing Clients Inside Handler

❌ **Mistake**: `const client = new BedrockClient()` inside handler.

✅ **Fix**: Initialize outside handler for container reuse.

### 6. Not Testing with Already-Formatted Data

❌ **Mistake**: Only test with messy data ("CRA 15 NO 100 25").

✅ **Fix**: Test with clean data ("Cra. 15 # 100 - 25") to catch over-normalization.

### 7. Hardcoding Configuration in Lambda

❌ **Mistake**: Field lists, batch sizes in environment variables.

✅ **Fix**: Store in DynamoDB for no-deploy config changes.

## Metrics That Mattered

### Quality Metrics

| Metric | Target | Actual | Action if Missed |
|--------|--------|--------|------------------|
| **Coverage** | >95% | 99.2% | Investigate failures, improve error handling |
| **Improvement Rate** | 60-80% | 70.4% | Too low = prompt not aggressive; too high = over-normalizing |
| **Error Rate** | <5% | 0.8% | Debug failures, add edge cases to tests |

### Cost Metrics

| Metric | Target | Actual | Action if Exceeded |
|--------|--------|--------|-------------------|
| **Cost per lead** | <$0.001 | $0.000066 | Switch to Haiku, increase batch size |
| **Monthly cost** | <$1 | $0.043 | On track (projected $1.29/month for 30K leads) |

### Operational Metrics

| Metric | Target | Actual | Action if Missed |
|--------|--------|--------|------------------|
| **Duration** | <5 min | 3 min | Reduce batch size or max leads per run |
| **Cold start** | <3s | 2s | Acceptable for overnight batch job |
| **Failures** | 0 | 0 | Retry logic, error handling |

## Recommendations for Others

### Starting Out

1. **Start small**: Test with 50-100 records before full deployment
2. **Use Haiku**: Upgrade to Sonnet only if quality insufficient
3. **Batch aggressively**: 10-20 records per API call
4. **Preserve originals**: Non-destructive storage is mandatory
5. **Add post-processing**: Don't trust LLM outputs blindly

### Scaling Up

1. **Monitor costs**: Set CloudWatch billing alarms
2. **Track statistics**: Improvement rates with confidence intervals
3. **Detect anomalies**: Alert when rates deviate from expected
4. **Version prompts**: Track changes to prompts in git
5. **A/B test**: Compare normalization quality before/after changes

### Going to Production

1. **Add comprehensive logging**: Token usage, field success rates, errors
2. **Set up alerts**: Cost spikes, quality drift, failures
3. **Document edge cases**: Maintain a list of known problematic inputs
4. **Plan for re-normalization**: Have a strategy for prompt/model updates
5. **Communicate with stakeholders**: Use confidence intervals in reports

## Surprises and Delights

### Positive Surprises

1. **Haiku was better than expected**: 99.2% success rate for $0.043
2. **Statistical validation caught bugs**: Double-dot bug would have gone unnoticed
3. **Non-destructive storage paid off**: Rolled back bug without data loss
4. **Batch processing was easy**: 10x cost/speed improvement with minimal code

### Negative Surprises

1. **Post-processing bugs were sneaky**: Double-dot bug affected 65.7% of data silently
2. **LLM consistency wasn't perfect**: Even at temp=0, needed validation
3. **Edge cases emerged slowly**: City/institution variants appeared over weeks

## Final Thoughts

**What we'd keep**:
- Claude 3 Haiku (perfect cost/quality balance)
- Post-processing pipeline (essential for consistency)
- Statistical validation (caught critical bugs)
- Non-destructive storage (enabled experimentation)
- Batch processing (10x efficiency gain)

**What we'd change**:
- Test with already-formatted data earlier (would have caught double-dot bug)
- Set cost alerts from day 1 (peace of mind)
- Build edge case database proactively (not reactively)

**Bottom line**: This pattern works exceptionally well for structured data normalization. The dual-layer approach (LLM + post-processing) achieves **99.2% quality** at **$0.000066 per record** - a cost/quality ratio that's hard to beat.

## Next Steps

- **[COST-ANALYSIS.md](./COST-ANALYSIS.md)**: Detailed cost breakdown and optimization strategies
- **[README.md](./README.md)**: Pattern overview and quick start

---

**Last Updated**: January 24, 2026
