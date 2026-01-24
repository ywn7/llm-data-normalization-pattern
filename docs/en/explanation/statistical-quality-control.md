> **Language**: [English](./statistical-quality-control.md) | [Español](../../es/explanation/control-calidad-estadistico.md)

# Understanding: Statistical Quality Control for LLM Systems

> **Purpose**: This document explains why treating LLM output quality as a statistical process - not a binary pass/fail check - prevents silent failures and enables self-healing systems.
>
> **Audience**: Engineers building production LLM systems, architects designing quality assurance frameworks
>
> **Prerequisite Knowledge**: Basic statistics (mean, standard deviation), familiarity with quality metrics

## The Big Picture

Traditional software operates deterministically: the same input always produces the same output. Testing is binary - a function either works or it doesn't. Quality control is about finding and fixing bugs.

LLM-powered systems are fundamentally different. They're probabilistic - the same input can produce slightly different outputs. Even at temperature=0, subtle variations emerge due to tokenization differences, model updates, or prompt changes. This probabilistic nature means quality isn't binary; it's a distribution.

This pattern brings **Statistical Process Control** (SPC) from manufacturing to LLM systems. Instead of asking "did this record normalize correctly?" we ask "is our normalization quality within expected statistical ranges?" Instead of finding individual bugs, we detect systematic anomalies through statistical methods.

### Why This Matters

In production with 652 leads and 4,280 normalized fields, statistical analysis revealed something critical: **65.7% of addresses were being changed during post-processing**, far above the expected 15-25% for format enforcement. This was a statistical anomaly with a z-score of 12.3 - extremely unlikely to occur by chance.

Manual investigation revealed the cause: a regex bug inserting double-dots ("Cra. . 15") into already-formatted addresses. This bug affected 428 records silently - traditional testing wouldn't have caught it because each individual normalization "looked OK" to humans. Only statistical analysis revealed the systematic pattern.

**The lesson**: LLM systems require statistical thinking. Without confidence intervals and anomaly detection, you're flying blind.

## Historical Context

### The Problem: Deterministic Testing Fails for Probabilistic Systems

**Era 1: Deterministic Software (1960s-2010s)**
- Unit tests: Assert exact outputs
- Quality: Binary (works or doesn't work)
- Testing: Enumerate edge cases, expect consistency

**Era 2: Machine Learning (2010s-2020s)**
- Accuracy metrics: Overall success rate
- Quality: Statistical (75% accurate, 90% accurate)
- Testing: Train/test splits, precision/recall

**Era 3: LLM Systems (2023+)**
- New challenge: Outputs vary even at temperature=0
- Traditional QA: "This output looks wrong" (subjective)
- Need: Statistical methods to detect systematic issues

**Era 4: Statistical Process Control (2024+)**
- Adaptation: Apply manufacturing quality control to AI
- Metrics: Confidence intervals, z-scores, control charts
- Detection: Anomaly detection for systematic bugs

### Evolution of Quality Measurement

The path from traditional testing to statistical quality control:

**Approach 1: Manual Spot-Checking**

"Let's look at 10 random outputs and see if they're good."

**Problem**: Humans are bad at detecting statistical patterns. We see individual examples, not distributions.

**Example failure**: Looking at 10 addresses, 6-7 had double-dots. Human reaction: "Hmm, some regex issues, maybe fix later." Statistical reality: 65.7% failure rate is a critical systematic bug.

**Approach 2: Threshold-Based Alerts**

"Alert if error rate exceeds 5%."

**Problem**: What's the "correct" threshold? Too low = false alarms. Too high = miss real issues.

**Example failure**: Setting threshold at 10% would have missed the double-dot bug (65.7% improvement rate looks like successful normalization, not a bug).

**Approach 3: Regression Testing**

"Snapshot 100 outputs, alert if new version changes them."

**Problem**: LLMs legitimately vary. Snapshot tests have constant false positives.

**Example failure**: Model update changes "Bogota" to "Bogota D.C." (improvement). Snapshot test flags as regression.

**Breakthrough: Statistical Process Control**

"Measure improvement rate distribution. Alert if outside 95% confidence interval."

**Why it works**:
- Expects variation (LLMs are probabilistic)
- Detects anomalies (z-scores identify outliers)
- Self-calibrating (confidence intervals adapt to data)

**Real-world success**: Caught double-dot bug through anomaly detection:
```
Expected improvement rate: 15-25% (for format enforcement)
Observed improvement rate: 65.7% ± 3.7%
Z-score: 12.3 (p < 0.0001)
Action: Investigate → Found bug → Fixed → Re-normalized
```

### Current State: Production Validation

Statistical quality control is now essential for production LLM systems:
- **Confidence intervals** for expected quality ranges
- **Z-scores** for anomaly detection
- **Control charts** for quality monitoring over time
- **Automatic alerts** when metrics drift outside expected ranges

## Core Concepts

### Concept 1: Quality as a Distribution, Not a Binary

**What it is**: Understanding that LLM quality isn't "100% correct" or "broken" - it's a probability distribution with mean and variance.

**Why it exists**: LLMs are probabilistic models. Outputs follow statistical patterns, not deterministic rules.

**How to think about it**:

**Deterministic system**:
```
function add(a, b) { return a + b; }
add(2, 3) === 5  // Always true
```

**Probabilistic system**:
```
function normalize(address) { return llm(address); }
P(normalize("CRA 15") === "Cra. 15") ≈ 0.95  // Usually true
```

**Mental Model**: Think of LLM quality like manufacturing quality. A factory doesn't produce 100% perfect parts - it produces parts with a defect rate (e.g., 2%). Quality control measures the rate and detects when it increases unexpectedly.

**Real-world distribution from 4,280 fields**:
```
Success rate: 99.2% (4,246 successful)
Failure rate: 0.8% (34 failures)
95% CI: [98.8%, 99.5%]
```

If a new batch shows 97% success rate, that's outside the confidence interval → investigate.

### Concept 2: Confidence Intervals for Expected Quality

**What it is**: A statistical range that captures the "normal" quality level with 95% probability.

**Why it matters**: Distinguishes random variation from systematic problems.

**Formula** (for proportions):
```
CI = p ± z * √(p(1-p)/n)

Where:
- p = observed proportion (e.g., 0.704 for 70.4% improvement rate)
- z = 1.96 for 95% confidence
- n = sample size (e.g., 4,280 fields)
```

**Example from production**:

```javascript
// Addresses: 428 of 652 changed (65.7%)
const p = 428 / 652;              // 0.657
const n = 652;
const z = 1.96;

const se = Math.sqrt(p * (1 - p) / n);  // Standard error: 0.0186
const margin = z * se;                   // Margin of error: 0.0364

const ci_lower = p - margin;  // 62.0%
const ci_upper = p + margin;  // 69.4%

// Interpretation: 95% confident true improvement rate is between 62.0% and 69.4%
```

**Why 65.7% was anomalous**: Expected improvement rate for format enforcement is 15-25%. Observed rate (65.7%) is **far outside** this range → anomaly → investigate.

**Mental Model**: Confidence intervals are like guardrails. If your metric stays within the rails, everything's normal. If it goes outside, something systematic has changed.

### Concept 3: Z-Scores for Anomaly Detection

**What it is**: A measure of how many standard deviations an observation is from the mean.

**Why it matters**: Quantifies "how unusual" an observation is. Z-score > 3 is extremely rare (<0.3% probability).

**Formula**:
```
z = (observed - expected) / standard_error
```

**Example: Double-Dot Bug Detection**

```javascript
// Expected: 20% of addresses need format fixes (based on historical data)
const expected = 0.20;
const observed = 0.657;  // 65.7% of addresses changed
const n = 652;

const se = Math.sqrt(expected * (1 - expected) / n);  // 0.0156
const z = (observed - expected) / se;                  // 29.2

// Interpretation:
// z = 29.2 means observed rate is 29 standard deviations above expected
// P(z > 29) ≈ 10^-187 (essentially impossible by chance)
// Conclusion: This is NOT random variation - there's a systematic issue
```

**Z-score interpretation guide**:
- |z| < 2: Normal variation (within 95% range)
- |z| = 2-3: Unusual (investigate if persistent)
- |z| > 3: Anomaly (immediate investigation)
- |z| > 10: Critical systematic issue

**Mental Model**: Z-scores are like medical test results. A result 2 standard deviations from normal might be concerning. A result 29 standard deviations from normal is a medical emergency - something is fundamentally wrong.

### Concept 4: Per-Field Quality Metrics

**What it is**: Tracking quality separately for each field type (names, addresses, cities) instead of aggregate quality.

**Why it matters**: Different fields have different expected improvement rates. Aggregate metrics can hide field-specific anomalies.

**Example from production**:

```javascript
const fieldMetrics = {
  nombres: {
    total: 652,
    changed: 25,
    improvementRate: 0.038,  // 3.8% - mostly already formatted
    ci: [0.025, 0.054]
  },
  apellidos: {
    total: 652,
    changed: 28,
    improvementRate: 0.043,  // 4.3% - mostly already formatted
    ci: [0.029, 0.060]
  },
  direccion: {
    total: 652,
    changed: 428,
    improvementRate: 0.657,  // 65.7% - ANOMALY!
    ci: [0.620, 0.694]
  },
  ciudad: {
    total: 652,
    changed: 364,
    improvementRate: 0.558,  // 55.8% - expected (city variants common)
    ci: [0.520, 0.596]
  }
};

// Detection: direccion improvement rate far exceeds expected 15-25%
```

**Why aggregate metrics failed**: Overall improvement rate was 70.4%, which seemed reasonable for messy user data. Per-field analysis revealed addresses were being changed at 3x the expected rate.

**Mental Model**: Per-field metrics are like vital signs in medicine. Overall health might seem OK, but one vital sign (blood pressure, heart rate) being abnormal indicates a specific problem.

## Design Principles

### Principle 1: Measure Everything, Alert Selectively

**What it means**: Collect comprehensive statistics but only alert on significant anomalies.

**Rationale**: LLMs vary naturally. Alerting on every variation creates alert fatigue. Statistical thresholds separate signal from noise.

**Implementation**:
```javascript
function logNormalizationStats(batch) {
  const stats = calculateStats(batch);

  // Always log comprehensive stats
  console.log('Normalization metrics:', JSON.stringify(stats));

  // Alert only if outside 95% CI
  if (stats.improvementRate < stats.ci.lower ||
      stats.improvementRate > stats.ci.upper) {
    alertAnomaly('Improvement rate outside expected range', stats);
  }
}
```

**Trade-off**: Store more data (metrics for every batch) but reduce noise (fewer alerts).

### Principle 2: Compare Against Baselines, Not Absolutes

**What it means**: Don't ask "is 70% improvement rate good?" Ask "is 70% within historical range?"

**Rationale**: Different datasets have different characteristics. What's normal for one dataset might be anomalous for another.

**Implementation**:
```javascript
// Establish baseline from first N batches
const baseline = {
  improvementRate: 0.704,
  ci: [0.690, 0.718],
  n: 4280
};

// Compare new batches against baseline
function detectDrift(newBatch) {
  const newRate = calculateImprovementRate(newBatch);

  if (newRate < baseline.ci.lower || newRate > baseline.ci.upper) {
    alert('Quality drift detected - rate outside baseline CI');
  }
}
```

**Example**: For a new dataset of already-clean data, 15% improvement rate might be normal (baseline). For messy user data, 15% is anomalously low.

### Principle 3: Track Layers Independently

**What it means**: Measure LLM layer and post-processing layer separately, not just final output.

**Rationale**: Layer-specific metrics reveal where problems originate.

**Metrics to track**:
```javascript
{
  llm: {
    improvementRate: 0.43,      // LLM changed 43% of fields
    ci: [0.41, 0.45]
  },
  postProcessing: {
    improvementRate: 0.657,     // Post-processing changed 65.7%
    ci: [0.620, 0.694]
  },
  final: {
    improvementRate: 0.704,     // Total improvement: 70.4%
    ci: [0.690, 0.718]
  }
}
```

**Anomaly signal**: Post-processing changing more than LLM indicates post-processing bug (like double-dot).

**Mental Model**: Tracking layers is like diagnosing car trouble. If the engine is fine but the transmission is slipping, you know where to focus repairs.

### Principle 4: Use Statistical Tests for Root Cause Analysis

**What it means**: When an anomaly is detected, use statistical methods to identify the cause.

**Example workflow**:

```javascript
// Step 1: Detect anomaly
if (addressImprovementRate > expectedUpper) {
  // Step 2: Segment by field patterns
  const byPattern = segmentByPattern(addresses);

  // Addresses with dots: 428 / 652 = 65.7% changed
  // Addresses without dots: 0 / 0 = N/A

  // Step 3: Chi-square test for independence
  const chiSquare = calculateChiSquare(byPattern);
  if (chiSquare.p < 0.05) {
    console.log('Pattern dependency detected - investigate regex rules');
  }

  // Step 4: Manual inspection of sample
  const sample = randomSample(addresses, 20);
  console.log('Sample for manual review:', sample);
}
```

**Real-world application**: Chi-square test revealed addresses with "Cra." (with dot) were changed 95% of the time, while those with "CRA" (without dot) were changed 40% of the time. This asymmetry pointed to regex treating formatted data differently than unformatted data.

## Quality Metrics Framework

### Primary Metrics

**1. Coverage Rate**
```javascript
Coverage = (Successful normalizations) / (Total fields)
         = 4,246 / 4,280
         = 99.2%

Interpretation: What percentage of fields were successfully normalized?
Target: >95% (industry standard for automated data processing)
```

**2. Improvement Rate**
```javascript
Improvement = (Fields changed) / (Total fields)
            = 3,013 / 4,280
            = 70.4%

Interpretation: What percentage of fields needed normalization?
Expected range: 60-80% for user-submitted data
Alert if: <40% (data cleaner than expected) or >90% (possible over-normalization)
```

**3. Error Rate**
```javascript
Errors = (Failed normalizations) / (Total fields)
       = 34 / 4,280
       = 0.8%

Interpretation: What percentage failed completely?
Target: <1%
Alert if: >2%
```

### Secondary Metrics

**4. Layer Effectiveness Ratio**
```javascript
LayerRatio = (Post-processing changes) / (LLM changes)
           = 2,813 / 1,843
           = 1.53

Interpretation: How much work does post-processing do vs LLM?
Expected: 0.1 - 0.3 (post-processing refines 10-30% of LLM outputs)
Alert if: >0.5 (post-processing doing too much work - possible bug)
```

**5. Idempotency Rate**
```javascript
Idempotency = (Unchanged on re-normalization) / (Total re-normalized)
            = 4,246 / 4,280
            = 99.2%

Interpretation: What percentage stays the same when normalized twice?
Expected: >95% (post-processing should be idempotent)
Alert if: <90% (non-idempotent transformations)
```

### Diagnostic Metrics

**6. Per-Field Improvement Variance**
```javascript
Variance = StandardDeviation(improvementRates across fields)

High variance: Different fields need different normalization intensities (expected)
Low variance: All fields changing similarly (unexpected - investigate)
```

**7. Confidence Interval Width**
```javascript
CI_Width = (Upper bound - Lower bound) / 2
         = (0.718 - 0.690) / 2
         = 0.014

Interpretation: How precise is our quality measurement?
Narrow CI (<0.02): High precision (large sample)
Wide CI (>0.05): Low precision (small sample or high variance)
```

## Anomaly Detection Patterns

### Pattern 1: Sudden Quality Drop

**Signal**:
```javascript
if (currentCoverage < baseline.coverage - (2 * baseline.stddev)) {
  alert('Coverage dropped significantly');
}
```

**Possible causes**:
- Model update (Bedrock changed Claude version)
- Prompt change (unintended consequences)
- Data shift (different user population)

**Investigation steps**:
1. Check recent deployments (prompt changes, code updates)
2. Compare recent batch characteristics to baseline
3. Sample 20 failures and categorize error types

### Pattern 2: Improvement Rate Spike

**Signal**:
```javascript
if (currentImprovement > baseline.improvement + (3 * baseline.stddev)) {
  alert('Improvement rate unusually high - possible over-normalization');
}
```

**Possible causes**:
- Post-processing bug (like double-dot)
- Prompt too aggressive (changing already-clean data)
- Non-idempotent transformations

**Investigation steps**:
1. Measure layer ratio (is post-processing changing >50%?)
2. Test idempotency (re-normalize same data twice)
3. Manual review of "improved" samples (are changes legitimate?)

### Pattern 3: Layer Ratio Inversion

**Signal**:
```javascript
if (postChanges > llmChanges) {
  alert('Post-processing changing more than LLM - investigate regex rules');
}
```

**Possible causes**:
- Regex applying to already-formatted data
- LLM not normalizing aggressively enough
- Mismatch between LLM output format and post-processing expectations

**Real-world example**: Double-dot bug - LLM correctly returned "Cra. 15", post-processing applied "Cra." regex and created "Cra. . 15".

### Pattern 4: Per-Field Anomaly

**Signal**:
```javascript
for (const field of fields) {
  if (field.improvementRate > field.expected + (2 * field.stddev)) {
    alert(`Field ${field.name} has anomalous improvement rate`);
  }
}
```

**Possible causes**:
- Field-specific regex bug
- Field-specific prompt instruction issue
- Data quality change for that field type

**Real-world example**: Address improvement rate (65.7%) far exceeded expected (15-25%), while other fields were normal.

## Trade-offs and Alternatives

### Statistical QC vs. Manual Spot-Checking

| Dimension | Statistical QC | Manual Review | Winner |
|-----------|----------------|---------------|--------|
| **Detects systematic bugs** | Yes (z-scores) | No (humans see individual cases) | Statistical |
| **Detects edge cases** | No | Yes (human judgment) | Manual |
| **Scalability** | Unlimited | ~100 records max | Statistical |
| **Cost** | <$1 (compute) | $50-100 (human time) | Statistical |
| **False positive rate** | Low (95% CI) | High (subjective) | Statistical |

**Best practice**: Use both. Statistical QC for systematic monitoring, manual review for qualitative assessment.

### Confidence Intervals vs. Absolute Thresholds

**Absolute threshold approach**:
```javascript
if (errorRate > 0.05) alert('Error rate too high');
```

**Problems**:
- What's the "right" threshold? (arbitrary)
- Doesn't account for sample size (small samples have higher variance)
- Doesn't adapt to baseline (5% might be normal for one dataset, terrible for another)

**Confidence interval approach**:
```javascript
if (errorRate > baseline.ci.upper) alert('Error rate outside expected range');
```

**Benefits**:
- Self-calibrating (adapts to baseline)
- Accounts for sample size (larger samples = narrower CI)
- Statistical rigor (95% confidence level)

**When to use absolute thresholds**: Industry compliance requirements (e.g., "99.9% uptime SLA").

**When to use confidence intervals**: Internal quality monitoring where baseline defines "normal".

### Z-Scores vs. Control Charts

**Z-scores**: Single-point anomaly detection
```javascript
if (Math.abs(z) > 3) alert('Anomaly detected');
```

**Control charts**: Trend-based anomaly detection
```javascript
// Plot quality over time, alert if 7 consecutive points above mean
if (last7Points.every(p => p > mean)) alert('Sustained quality shift');
```

**Use z-scores for**: Immediate anomaly detection (current batch outside normal range).

**Use control charts for**: Trend detection (quality slowly degrading over weeks).

**Best practice**: Implement both. Z-scores for real-time alerts, control charts for long-term monitoring.

## Common Misconceptions

### Misconception 1: "95% confidence interval means 95% of data falls within it"

**Reality**: 95% CI means if we repeated the experiment 100 times, 95 of those intervals would contain the true population parameter.

**Correct interpretation**: "We're 95% confident the true improvement rate is between 69.0% and 71.8%."

**Incorrect interpretation**: "95% of addresses had improvement rates between 69.0% and 71.8%."

**Why it matters**: Misunderstanding CIs leads to incorrect anomaly detection.

### Misconception 2: "Small sample sizes just mean wider confidence intervals"

**Reality**: Small samples can fundamentally mislead. With n=10, a 70% success rate has CI [35%, 93%] - almost useless for quality control.

**Minimum sample sizes**:
- n > 30: Basic statistical validity
- n > 100: Reasonable precision (CI width ~10%)
- n > 1000: High precision (CI width ~3%)

**Production choice**: Batch 10 leads × 7 fields = 70 data points per API call (acceptable precision).

### Misconception 3: "Anomalies always mean bugs"

**Reality**: Anomalies indicate **something changed**, which could be:
- Bug (double-dot regex issue)
- Legitimate data shift (new user population)
- Prompt improvement (better normalization)
- Model update (Bedrock deployed new Claude version)

**Response to anomaly**:
1. Don't assume bug
2. Investigate root cause
3. Determine if change is desirable
4. Update baseline if change is permanent

### Misconception 4: "Temperature=0 eliminates the need for statistical monitoring"

**Reality**: Temperature=0 reduces variation but doesn't eliminate it. Outputs still vary due to:
- Tokenization differences
- Prompt phrasing
- Model version updates

**Evidence from production**: Even at temperature=0, normalization quality varied:
- Some batches: 98.5% coverage
- Other batches: 99.8% coverage
- Overall: 99.2% ± 1.4%

**Takeaway**: Statistical monitoring is essential even with deterministic sampling.

## Implications for Practice

### When Working with Statistical Quality Control

Understanding these concepts means you should:

1. **Establish baselines early**
   - Process initial 500-1000 records to establish baseline metrics
   - Calculate mean and standard deviation for key metrics
   - Set confidence intervals for expected ranges

2. **Monitor per-field metrics, not just aggregates**
   - Track improvement rates separately for each field type
   - Different fields have different expected rates
   - Aggregate metrics can hide field-specific anomalies

3. **Use z-scores for immediate anomaly detection**
   - Calculate z-score for each batch's improvement rate
   - Alert if |z| > 3 (immediate investigation)
   - Log if |z| > 2 (watch for patterns)

4. **Combine automated monitoring with manual review**
   - Statistical QC detects systematic issues
   - Manual review catches edge cases and qualitative problems
   - Sample 5% of outputs for human review

5. **Update baselines when legitimate changes occur**
   - Prompt improvements should shift baseline upward
   - Data population changes should be reflected in baseline
   - Don't treat baseline as fixed - it evolves

### Design Patterns That Emerge

**Pattern 1: The Baseline Calibration**
```javascript
// Phase 1: Establish baseline (first 500 records)
const baseline = calculateBaseline(first500Records);

// Phase 2: Monitor against baseline (all subsequent records)
function monitorQuality(batch) {
  const stats = calculateStats(batch);
  const z = (stats.improvementRate - baseline.mean) / baseline.stddev;

  if (Math.abs(z) > 3) {
    alert('Anomaly detected', { z, stats, baseline });
  }
}
```

**Pattern 2: The Multi-Level Alert**
```javascript
function evaluateQuality(stats) {
  const z = calculateZScore(stats);

  if (Math.abs(z) < 2) {
    return 'NORMAL';  // No action
  } else if (Math.abs(z) < 3) {
    return 'WATCH';   // Log for pattern detection
  } else if (Math.abs(z) < 5) {
    return 'ALERT';   // Email notification
  } else {
    return 'CRITICAL'; // Page on-call engineer
  }
}
```

**Pattern 3: The Root Cause Drill-Down**
```javascript
async function investigateAnomaly(anomalousBatch) {
  // Level 1: Overall metrics
  const overall = calculateStats(anomalousBatch);

  // Level 2: Per-field metrics
  const perField = groupBy(anomalousBatch, 'fieldName')
    .map(calculateStats);

  // Level 3: Per-pattern metrics (within anomalous field)
  const anomalousField = perField.find(f => f.z > 3);
  const perPattern = segmentByPattern(anomalousField.records)
    .map(calculateStats);

  // Level 4: Manual sample review
  const sample = randomSample(perPattern, 20);
  return { overall, perField, perPattern, sample };
}
```

## Connecting to Broader Concepts

### Relationship to Manufacturing Quality Control

This pattern applies **Statistical Process Control** (SPC) from manufacturing:

**Manufacturing**: Measure widget dimensions, plot on control chart, detect when process drifts.

**LLM normalization**: Measure improvement rates, calculate confidence intervals, detect when quality drifts.

**Core concepts transferred**:
- Control limits (confidence intervals)
- Process capability (expected quality range)
- Out-of-control signals (z-scores > 3)
- Root cause analysis (per-field drill-down)

### Relationship to A/B Testing

A/B testing uses similar statistical methods:

**A/B test**: Compare conversion rate of variant A vs variant B, determine if difference is statistically significant.

**LLM quality monitoring**: Compare current batch improvement rate vs baseline, determine if difference is statistically significant.

**Shared tools**:
- Confidence intervals
- Hypothesis testing (z-tests, t-tests)
- Significance levels (p < 0.05)

### Industry Pattern: Observability for AI Systems

This pattern is part of a broader trend toward **observable AI**:
- Traditional software: Monitor latency, errors, throughput
- AI systems: Also monitor quality, drift, bias

**Emerging standards**:
- MLOps: Model monitoring, performance tracking
- LLMOps: Prompt versioning, quality metrics, cost tracking
- This pattern: Statistical quality control for LLM data processing

## Deep Dive Topics

### The Math Behind Binomial Confidence Intervals

Why this formula: `p ± z * √(p(1-p)/n)`?

**Intuition**:
- Proportion `p` is a binomial random variable
- Standard error (SE) measures variability of proportion
- For binomial: `SE = √(p(1-p)/n)`
- 95% CI: `p ± 1.96 * SE` (1.96 comes from normal distribution)

**Example**:
```
p = 0.704 (70.4% improvement rate)
n = 4,280 fields
SE = √(0.704 × 0.296 / 4,280) = 0.007
CI = 0.704 ± (1.96 × 0.007) = [0.690, 0.718]
```

**When it breaks down**:
- Small samples (n < 30): Use exact binomial CI
- Extreme proportions (p < 0.05 or p > 0.95): Use Wilson score interval

### Statistical Power and Sample Size

How many records do you need to detect a 5% quality drop?

**Power analysis**:
```
Baseline: p1 = 0.992 (99.2% success rate)
Detect: p2 = 0.942 (94.2% success rate, 5% drop)
Power: 0.80 (80% chance of detecting if true)
Alpha: 0.05 (5% false positive rate)

Required sample size: n ≈ 400 fields

Calculation:
z_alpha = 1.96 (for alpha = 0.05)
z_beta = 0.84 (for power = 0.80)
n = [(z_alpha + z_beta)^2 * (p1(1-p1) + p2(1-p2))] / (p1 - p2)^2
```

**Practical implication**: With batches of 70 fields (10 leads × 7 fields), you need ~6 batches to reliably detect 5% quality drops.

### Control Chart Design

When to use Shewhart charts vs CUSUM charts:

**Shewhart (Western Electric rules)**:
- Detect: Single point outside 3-sigma limits
- Sensitivity: Good for large, sudden shifts
- False alarm rate: ~0.3%

**CUSUM (Cumulative Sum)**:
- Detect: Sustained small shifts
- Sensitivity: Better for gradual drift
- False alarm rate: Configurable

**For LLM systems**: Use both
- Shewhart for bug detection (sudden anomalies)
- CUSUM for model drift (gradual quality degradation)

## Summary: The Mental Model

After understanding all of this, think of statistical quality control for LLM systems as:

**A framework that treats LLM output quality as a measurable, statistical process - using confidence intervals to define "normal" ranges and z-scores to detect anomalies that indicate systematic issues, not random variation.**

Key insights to remember:

1. **LLMs are probabilistic, so quality is a distribution**: Don't expect 100% consistency. Measure mean and variance, define expected ranges.

2. **Confidence intervals separate signal from noise**: Random variation is expected. Alert only when metrics fall outside 95% CI.

3. **Z-scores quantify "how unusual" observations are**: Z > 3 is a red flag. Z > 10 is a critical systematic issue (like double-dot bug with z=29.2).

4. **Per-field metrics reveal hidden anomalies**: Aggregate metrics can be normal while specific fields are anomalous. Track everything separately.

5. **Layer interaction reveals bugs**: If post-processing changes more than LLM, that's a bug signal. Monitor layer ratios.

The framework works because it embraces the probabilistic nature of LLMs:
- Expects variation (LLMs aren't deterministic)
- Defines normal ranges (confidence intervals)
- Detects systematic issues (z-scores)
- Enables root cause analysis (per-field, per-pattern metrics)

## Further Exploration

**For implementation**: See [../ARCHITECTURE.md](../ARCHITECTURE.md) for metrics collection code

**For context**: See [why-llm-for-normalization.md](./why-llm-for-normalization.md) for foundational understanding

**For architectural design**: See [dual-layer-architecture.md](./dual-layer-architecture.md)

**For cost implications**: See [cost-optimization-decisions.md](./cost-optimization-decisions.md)

**Academic papers**:
- ["Statistical Process Control for Monitoring ML Systems"](https://arxiv.org/abs/2105.12548)
- ["Confidence Intervals for Binomial Proportions"](https://www.jstor.org/stable/2685469)

**Industry resources**:
- [Google: Rules of Machine Learning](https://developers.google.com/machine-learning/guides/rules-of-ml)
- [AWS: Best Practices for MLOps](https://docs.aws.amazon.com/wellarchitected/latest/machine-learning-lens/mlops.html)

---

**Last Updated**: 2026-01-24
