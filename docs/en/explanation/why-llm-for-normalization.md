> **Language**: [English](./why-llm-for-normalization.md) | [Espanol](../es/explanation/por-que-llm-para-normalizacion.md)

# Understanding: Why LLMs for Data Normalization?

> **Purpose**: This document explains why Large Language Models are uniquely suited for normalizing messy user-submitted data, and why traditional approaches fall short.
>
> **Audience**: Engineers evaluating LLMs for ETL pipelines, architects designing data quality systems
>
> **Prerequisite Knowledge**: Basic familiarity with ETL concepts, regex patterns, and API-based services

## The Big Picture

Data normalization has traditionally been the domain of regular expressions, lookup tables, and hand-crafted rules. These approaches work beautifully for well-structured data with known patterns. But when users submit free-text data - names, addresses, job titles, company names - the combinatorial explosion of variants overwhelms rule-based systems.

LLMs change the equation by bringing **context understanding** to data normalization. They don't match patterns; they understand meaning. When a Colombian user types "Cra 15 NO 100 25", an LLM knows this is a street address and understands the formatting conventions, without explicit rules for every possible abbreviation.

### Why This Matters

Real-world data is messy. An educational registration system collected 652 leads with addresses like:
- "CRA 15 NO 100 25"
- "Carrera 15 # 100-25"
- "cr 15 100-25"
- "calle 15 número 100 25"

A rule-based system would need dozens of regex patterns to handle these variants. An LLM handles them all with a single prompt: "Normalize this Colombian address to standard format."

**The practical impact**: 70.4% of submitted fields required normalization. An LLM-based system achieved 99.2% success rate at $0.000066 per record. The alternative - manual data cleaning - would have cost 18,000x more.

## Historical Context

### The Problem Space: Evolution of Data Entry

**Era 1: Structured Forms (1990s-2000s)**
- Dropdown menus, radio buttons, validated inputs
- Data entry was constrained and predictable
- Normalization was simple: enforce formats at input time

**Era 2: User Experience Focus (2010s)**
- Free-text fields for better UX
- "Just type your address" instead of 5 dropdown menus
- Normalization became post-processing problem

**Era 3: Global, Multilingual Data (2020s)**
- Same form, different languages and conventions
- "Cra" (Spanish), "St" (English), "Rue" (French)
- Rule-based systems required localization for every market

**Era 4: LLM-Enabled Normalization (2024+)**
- Context-aware processing understands intent
- Single model handles multiple languages/conventions
- Rules are learned from examples, not coded

### Evolution of Solutions

#### Approach 1: Client-Side Validation (1990s-2000s)

**Technique**: JavaScript validation, dropdown menus

```javascript
// Force users into dropdowns
<select name="city">
  <option>Bogota</option>
  <option>Medellin</option>
</select>
```

**Pros**:
- Guaranteed clean data
- No normalization needed

**Cons**:
- Terrible user experience (imagine a dropdown with 1,000 cities)
- Doesn't handle "Bogotá", "BOGOTA", "Santafe de Bogota"
- Fails for international users

**Why it failed**: User experience versus data quality became a false choice. You could have clean data OR happy users, not both.

#### Approach 2: Regex-Based Normalization (2000s-2010s)

**Technique**: Server-side pattern matching and replacement

```javascript
address
  .replace(/\b(cra|carrera|cr|kra)\.?\s*/gi, 'Cra. ')
  .replace(/\b(no|num|número)\.?\s*/gi, '# ')
  .replace(/\s*-\s*/g, ' - ')
```

**Pros**:
- Deterministic and fast
- Works for known patterns
- No external dependencies

**Cons**:
- Brittle (breaks on unexpected input)
- Requires exhaustive pattern enumeration
- No context awareness ("no" in "no tiene" vs "NO 100")
- Maintenance nightmare (add new pattern for each edge case)

**Why it's still incomplete**: You can write 100 regex patterns and still miss the 101st variant. Real-world data has infinite creativity.

#### Approach 3: Lookup Tables (2010s)

**Technique**: Curated lists of valid values with fuzzy matching

```javascript
const CITY_MAPPINGS = {
  'bogota': 'Bogota D.C.',
  'bogotá': 'Bogota D.C.',
  'santa fe de bogota': 'Bogota D.C.',
  // ... 1,000 more entries
};
```

**Pros**:
- Handles known variations
- Faster than regex for large datasets
- Easy to audit (human-readable mappings)

**Cons**:
- Requires manual curation
- Doesn't handle new variations
- Doesn't scale to high-cardinality fields (company names, addresses)
- No understanding of meaning (can't distinguish "Carrera" street type from "Carrera" person name)

**Why it plateaus**: Works for low-cardinality fields (cities, education levels), fails for high-cardinality fields (addresses, job titles).

#### Approach 4: LLM-Based Normalization (2024+)

**Technique**: Contextual understanding via Large Language Models

```javascript
const prompt = `
Normaliza esta dirección colombiana al formato estándar:
Input: "CRA 15 NO 100 25"
Output: {"direccion": "Cra. 15 # 100 - 25"}
`;
```

**Pros**:
- Handles infinite variations without explicit rules
- Context-aware (distinguishes "Carrera" street vs person)
- Adapts to new patterns without code changes
- Works across languages and conventions

**Cons**:
- Probabilistic, not deterministic
- API latency (2-3 seconds per batch)
- Cost per request (though negligible at $0.000066/record)
- Requires post-processing for exact formats

**Why it's a breakthrough**: Solves the long tail problem. Instead of writing 100 regex patterns that miss edge cases, you write 1 prompt that handles everything.

### Current State: Hybrid Approach

The production-ready solution combines LLM intelligence with deterministic post-processing:

**Layer 1**: LLM for context-aware normalization
- Handles variants, abbreviations, synonyms
- Understands intent ("CRA 15" is a street address)

**Layer 2**: Regex post-processing for exact formats
- Enforces exact capitalization ("Cra." not "Cra")
- Removes double spaces, extra punctuation
- Applies business-specific rules (always include "D.C." for Bogota)

**Result**: 99.2% success rate at $0.000066 per record.

## Core Concepts

### Concept 1: Context-Aware vs. Pattern-Based Normalization

**What it is**: The fundamental difference between understanding meaning and matching patterns.

**Why it exists**: Humans normalize data by understanding context. When you see "Ing. Sistemas", you know "Ing." means "Ingeniero" (Engineer), not "Inglés" (English). Pattern matching can't distinguish these - it needs context.

**How it relates**: LLMs bring human-like context understanding to automated systems.

**Mental Model**: Think of regex as a very fast, very precise robot that only knows the patterns you taught it. Think of an LLM as an intelligent assistant who understands what you're trying to do and adapts to variations.

```
Regex approach: "If I see X, replace with Y"
LLM approach: "What does this mean, and what's the standard way to write it?"
```

**Example: Colombian Addresses**

Input variants (all mean the same address):
- "CRA 15 NO 100 25"
- "Carrera 15 # 100-25"
- "cr 15 100-25"
- "Cra. 15 numero 100 - 25"

**Regex approach**: Need 4+ patterns to match these
```javascript
.replace(/\bCRA\b/gi, 'Cra.')
.replace(/\bCarrera\b/gi, 'Cra.')
.replace(/\bCr\b/gi, 'Cra.')
// ... but what about "KRA", "kra", "CARRERA", etc.?
```

**LLM approach**: Single prompt handles all variants
```javascript
"Normaliza esta dirección colombiana: [input]"
// LLM understands context and returns "Cra. 15 # 100 - 25"
```

### Concept 2: The Long Tail Problem

**What it is**: The phenomenon where the first 80% of patterns are easy to handle, but the last 20% requires 80% of the effort.

**Why it exists**: User-submitted data has infinite creativity. You can write rules for common cases, but edge cases never stop appearing.

**How it relates to LLMs**: LLMs handle the long tail naturally because they generalize from examples, not enumerate patterns.

**Real-world evidence from production data**:

| Pattern Type | Frequency | Regex Effort | LLM Effort |
|--------------|-----------|--------------|------------|
| Standard format ("Cra. 15 # 100 - 25") | 15% | 1 pattern | 0 (handled by general prompt) |
| Common abbreviations ("CRA 15 NO 100 25") | 45% | 10 patterns | 0 |
| Rare variants ("cr 15 100-25") | 30% | 30 patterns | 0 |
| Typos, creative formats | 10% | 50+ patterns (and still incomplete) | 0 |

**The 80/20 trap**: With regex, you spend 20% effort to handle 80% of data, then 80% effort to handle the remaining 20%. With LLMs, you spend 20% effort (writing a good prompt) to handle 100% of data.

### Concept 3: Declarative vs. Imperative Normalization

**What it is**: Telling the system **what you want** (declarative) vs. **how to do it** (imperative).

**Imperative approach (regex)**:
```javascript
// HOW: Step-by-step transformations
address = address.toUpperCase();
address = address.replace(/CRA/g, 'Cra.');
address = address.replace(/NO/g, '#');
address = address.replace(/-/g, ' - ');
// ... 20 more steps
```

**Declarative approach (LLM)**:
```javascript
// WHAT: Desired outcome
const prompt = "Normalize this Colombian address to standard format: [input]";
```

**Why it matters**: Declarative code is easier to understand, maintain, and adapt. When address formats change, you update the prompt, not 20 regex patterns.

**Mental Model**: Regex is like assembly language (low-level, precise, verbose). LLM prompts are like high-level programming (abstract, expressive, concise).

### Concept 4: Adaptability Without Code Changes

**What it is**: The ability to improve normalization quality by changing prompts, not deploying new code.

**Example from production**:

**Week 1**: Prompt returned "Bogota" (missing "D.C.")
```
"Normaliza la ciudad: Bogota"
→ "Bogota"
```

**Week 2**: Updated prompt to include examples
```
"Normaliza la ciudad al formato oficial colombiano.
Ejemplo: bogota → Bogota D.C.
Input: Bogota"
→ "Bogota D.C."
```

**No code deployment needed** - just updated the prompt string in DynamoDB config.

**Why this matters**: Traditional ETL requires code → test → deploy cycle for every change. LLM-based ETL allows prompt tuning in production without deployment risk.

## Design Principles

### Principle 1: Embrace Probabilistic Quality

**What it means**: Accept that LLM outputs vary, and design for statistical quality instead of deterministic perfection.

**Rationale**: LLMs are probabilistic models. Even at temperature=0, outputs can vary across similar inputs. Fighting this reality leads to over-engineering.

**Impact on design**:
- Store original data separately (non-destructive)
- Track quality metrics with confidence intervals
- Use post-processing for exact constraints
- Monitor for quality drift over time

**Trade-offs**:
- Sacrifice: Perfect consistency on every record
- Gain: Handles infinite input variations without explicit rules

**Example**: In 652 leads, 99.2% normalized successfully. The 0.8% failures (5 records) were edge cases a human would struggle with too ("null", "N/A", "---").

### Principle 2: Context Over Patterns

**What it means**: Optimize prompts for understanding context, not for matching patterns.

**Rationale**: LLMs excel at understanding meaning but aren't perfect at following format rules. Leverage their strength (context) and supplement their weakness (exact formats) with post-processing.

**Impact on design**:
- Prompts focus on semantic normalization ("what's the standard way to write this?")
- Post-processing enforces exact formats ("Cra." always has a dot, never "Cra")

**Example**:
```javascript
// LLM handles: "CRA 15" → "Cra. 15" (understands "Carrera" abbreviation)
const llmOutput = await normalizeWithClaude(input);

// Post-processing handles: "Cra. 15" → "Cra. 15" (ensures dot)
const final = postProcessAddress(llmOutput);
```

### Principle 3: Batch for Efficiency

**What it means**: Process multiple records per API call to amortize prompt overhead.

**Rationale**: Each LLM API call has fixed overhead (prompt tokens). Processing 10 records costs almost the same as 1 record, but provides 10x the value.

**Impact on cost**:
- Individual calls: 650 leads × $0.0004 = $0.26
- Batch calls (10 per batch): 65 batches × $0.0004 = $0.026 (10x cheaper)

**Trade-offs**:
- Sacrifice: Increased latency (2-3s for 10 records vs 2-3s for 1 record)
- Gain: 10x cost reduction, 10x fewer API calls

**Sweet spot**: 10-20 records per batch balances cost, latency, and Lambda memory limits.

### Principle 4: Preserve Original Data

**What it means**: Store normalized data separately, never overwrite user input.

**Rationale**: You can't roll back if normalized data overwrites originals. You can't A/B test new prompts. You can't measure quality by comparing before/after.

**Impact on schema**:
```javascript
{
  leadId: "abc123",
  // Original (never modified)
  nombres: "JUAN CARLOS",
  direccion: "CRA 15 NO 100 25",

  // Normalized (can be regenerated)
  normalizedData: {
    nombres: "Juan Carlos",
    direccion: "Cra. 15 # 100 - 25"
  },
  normalizedAt: 1706000000000
}
```

**Trade-offs**:
- Sacrifice: 2-3 KB extra storage per record
- Gain: Audit trail, rollback capability, A/B testing, quality measurement

## Trade-offs and Alternatives

### LLM Normalization vs. Regex Rules

| Dimension | LLM Approach | Regex Approach | Winner |
|-----------|--------------|----------------|--------|
| **Coverage** | Handles infinite variants | Handles known patterns only | LLM (99.2% vs ~80%) |
| **Maintenance** | Update prompts, no deployment | Add regex for each edge case | LLM (minutes vs days) |
| **Speed** | 2-3s per batch | <1ms per record | Regex (but LLM fast enough for overnight batch) |
| **Cost** | $0.000066 per record | $0 (compute only) | Regex (but LLM cost negligible) |
| **Determinism** | Probabilistic (needs validation) | Deterministic | Regex (mitigated by post-processing) |
| **Context awareness** | Understands meaning | Matches patterns | LLM (critical for quality) |

**When to use LLM**: High variance in user input, long tail of edge cases, need context understanding

**When to use Regex**: Well-structured input, speed critical (real-time processing), zero tolerance for variation

**Best approach**: Combine both (LLM for intelligence, regex for exact formats)

### Claude Haiku vs. Other Models

| Model | Cost (1K records) | Quality (success rate) | Latency | Use Case |
|-------|-------------------|----------------------|---------|----------|
| **Claude 3 Haiku** | **$0.066** | **99.2%** | **2-3s/batch** | **Structured tasks** ✓ |
| Claude 3.5 Sonnet | $0.792 | 99.5% (marginal) | 4-5s/batch | Complex reasoning |
| GPT-4o-mini | $0.040 | ~99% (untested) | 3-4s/batch | OpenAI ecosystem |
| Llama 3 (self-hosted) | $0.01 (compute) | ~95% (fine-tuned) | <1s/batch | High volume (>1M records/month) |

**Why Haiku**: 12x cheaper than Sonnet with sufficient quality for structured normalization.

**When to upgrade to Sonnet**: Quality drops below 95%, or complex reasoning needed (not typical for normalization).

**When to consider GPT-4o-mini**: Already using OpenAI API, or want 40% cost savings vs Haiku.

**When to self-host Llama**: Processing >1M records/month (cost savings outweigh fine-tuning effort).

### Batch vs. Real-Time Normalization

| Approach | When to Use | Cost | Latency |
|----------|------------|------|---------|
| **Batch (overnight)** | Analytics, reporting | 1x (baseline) | Hours |
| **Real-time (on submit)** | User-facing features | 1x (same tokens) | 2-3s |
| **Hybrid (cache + batch)** | Mixed use case | 0.1x (cached hits) | <1s (cache) or hours (batch) |

**Production choice**: Batch overnight (2 AM) for cost efficiency and operational simplicity.

**When to go real-time**: User needs to see normalized data immediately (e.g., address autocomplete).

**When to use hybrid**: High-traffic system with repeated values (cache cities, batch unique addresses).

## Common Misconceptions

### Misconception 1: "LLMs are too expensive for data processing"

**Reality**: At $0.000066 per record, LLMs are 18,000x cheaper than manual data entry and comparable to the developer time saved maintaining regex rules.

**Why the confusion**: People compare LLM costs to zero (ignoring development/maintenance costs of alternatives).

**Evidence**: 652 records cost $0.043 to normalize. A developer spending 1 hour on regex maintenance costs $75-150.

### Misconception 2: "LLMs are too slow for ETL pipelines"

**Reality**: For batch processing (overnight jobs), 2-3 seconds per 10 records is perfectly acceptable. That's 1,200 records/hour, or 28,800 records/day.

**Why the confusion**: People think of LLMs in terms of chatbot response times (instant), not ETL processing windows (hours).

**When it matters**: Real-time user-facing features. Solution: Cache common values (cities, education levels).

### Misconception 3: "LLMs hallucinate incorrect data"

**Reality**: For structured tasks with clear examples, hallucination is rare (<1%). The real challenge is format consistency, not factual errors.

**Why the confusion**: Creative writing tasks (where LLMs do hallucinate) are very different from structured normalization tasks.

**Evidence**: In 4,280 normalized fields, zero hallucinations (making up cities, street names). Only inconsistencies were format variations ("Cra" vs "Cra."), fixed by post-processing.

### Misconception 4: "Temperature=0 means deterministic outputs"

**Reality**: Temperature=0 is deterministic **for identical inputs**, but varies across **similar inputs**. Example: "CRA 15" might return "Cra. 15" while "CRA 16" returns "Cra 16" (missing dot).

**Why the confusion**: Temperature=0 is marketed as "deterministic mode", but that only applies to exact input matching.

**Solution**: Post-processing pipeline enforces exact format rules regardless of LLM variation.

### Misconception 5: "You need Sonnet/GPT-4 for high quality"

**Reality**: Structured tasks like normalization don't require advanced reasoning. Haiku achieves 99.2% success rate at 12x lower cost.

**Why the confusion**: Capability matrices show Sonnet outperforms Haiku, but that's for complex reasoning tasks, not structured data processing.

**When to upgrade**: Quality drops below 95%, or task requires nuanced judgment (not typical for normalization).

## Implications for Practice

### When Working with LLM-Based Normalization

Understanding these concepts means you should:

1. **Design for probabilistic quality**
   - Don't expect 100% consistency without post-processing
   - Track quality metrics statistically (confidence intervals)
   - Use anomaly detection to catch systematic issues

2. **Batch aggressively**
   - 10-20 records per API call is the sweet spot
   - Don't optimize for latency unless you have real-time requirements
   - Amortize prompt overhead across multiple records

3. **Always post-process**
   - LLMs provide intelligence, not precision
   - Use regex to enforce exact formats (for example emails and phone numbers)
   - Test post-processing with already-formatted data (catch bugs like double-dots)

4. **Start with Haiku**
   - Default to the cheapest model that might work
   - Upgrade to Sonnet only if quality metrics prove insufficient
   - 12x cost difference adds up fast at scale

5. **Preserve originals**
   - Non-destructive storage enables experimentation
   - You can't A/B test if you overwrite original data
   - Rollback is trivial with separate normalized attributes

### Design Patterns That Emerge

Based on these principles, you'll often see:

**Pattern 1: Dual-Layer Processing**
```javascript
// Layer 1: LLM (context-aware)
const llmOutput = await callClaude(prompt);

// Layer 2: Post-processing (deterministic)
const final = applyBusinessRules(llmOutput);
```

**Pattern 2: Statistical Quality Monitoring**
```javascript
const stats = calculateImprovementRate(original, normalized);
if (stats.improvementRate > stats.confidence.upper) {
  alertAnomaly("Improvement rate too high - possible bug");
}
```

**Pattern 3: Config-Driven Prompts**
```javascript
// Store prompts in DB, not code
const config = await getConfig();
const prompt = buildPrompt(config.fieldRules, data);
```

**Pattern 4: Idempotent Normalization**
```javascript
// Only normalize if not already done
if (!lead.normalizedAt || lead.normalizedAt < cutoffTime) {
  await normalizeLead(lead);
}
```

## Connecting to Broader Concepts

### Relationship to Traditional ETL

LLM-based normalization fits into the classic **Extract → Transform → Load** pipeline as an intelligent Transform step:

- **Extract**: Same as before (query DynamoDB, read CSV, etc.)
- **Transform**: LLM normalization + post-processing (replaces regex/rules)
- **Load**: Same as before (write to database, update records)

The innovation is in the Transform step - replacing brittle pattern matching with context-aware intelligence.

### Relationship to Statistical Process Control

Manufacturing uses **Statistical Process Control** (SPC) to monitor quality and detect defects. This pattern applies the same thinking to data quality:

- **Control charts**: Track improvement rates over time
- **Confidence intervals**: Expected range for quality metrics
- **Anomaly detection**: Alert when metrics fall outside expected ranges
- **Root cause analysis**: Investigate outliers (like the double-dot bug)

This mindset shift - treating data quality as a statistical process - is essential for production LLM systems.

### Industry Patterns: The Shift to Declarative Systems

Software is moving from imperative (how) to declarative (what):
- **Infrastructure**: Terraform (declarative) vs shell scripts (imperative)
- **Databases**: SQL (declarative) vs procedural code (imperative)
- **UI**: React (declarative) vs jQuery (imperative)
- **Data normalization**: LLM prompts (declarative) vs regex (imperative)

LLM-based normalization is part of this broader trend toward higher-level abstractions.

## Deep Dive Topics

For those wanting even deeper understanding:

### The Math Behind Confidence Intervals
Statistical validation uses binomial proportion confidence intervals:
```
p ± z * √(p(1-p)/n)

Where:
- p = improvement rate (proportion of fields changed)
- z = 1.96 for 95% confidence
- n = sample size (number of fields)
```

Example: 70.4% improvement rate on 4,280 fields:
```
0.704 ± 1.96 * √(0.704 * 0.296 / 4280)
= 0.704 ± 0.014
= [69.0%, 71.8%]
```

If a new field shows 85% improvement rate, that's outside the interval → investigate for bugs.

### Token Economics of Batch Processing
Why is batching 10x more cost-effective?

**Prompt overhead** (fixed per API call):
```
System prompt: 200 tokens
Field instructions: 300 tokens
Example outputs: 300 tokens
Fixed overhead: 800 tokens
```

**Per-record cost**:
```
Record data: 50 tokens
```

**Cost comparison**:
```
Individual calls: (800 + 50) × 10 calls = 8,500 tokens
Batch call: 800 + (50 × 10) = 1,300 tokens

Savings: 8,500 / 1,300 = 6.5x
```

In practice, savings are closer to 10x due to response token overhead.

### Prompt Engineering for Consistency
Why do outputs vary even at temperature=0?

LLMs use **tokenization** and **logit sampling**. Even at temperature=0 (greedy sampling), tokenization differences can lead to different outputs:

```
Input 1: "CRA 15" → Tokenized: ["CRA", " 15"]
Input 2: "CRA 16" → Tokenized: ["CRA", " 16"]
```

The model might learn "CRA + [15]" → "Cra. 15" but "CRA + [16]" → "Cra 16" (missing dot) due to different statistical patterns in training data.

**Solution**: Post-processing ensures consistency regardless of tokenization quirks.

## Summary: The Mental Model

After understanding all of this, think of LLM-based data normalization as:

**A hybrid intelligence system that combines human-like understanding (LLM) with machine-like precision (regex), monitored by statistical process control to catch systematic errors.**

Key insights to remember:

1. **LLMs solve the long tail**: You can't enumerate all patterns, but you can teach a model to understand intent.

2. **Context beats patterns**: Understanding that "Cra" means "Carrera" in Colombian addresses requires context, not just pattern matching.

3. **Probabilistic quality requires statistical thinking**: Don't expect perfection; instead, measure quality with confidence intervals and detect anomalies.

4. **Economic trade-offs are real**: Haiku at $0.000066/record is the sweet spot for structured normalization - cheaper models sacrifice quality, expensive models waste money.

5. **Post-processing is essential**: LLMs provide intelligence, not precision. Always enforce exact formats with deterministic rules.

The pattern works because it embraces the strengths of each component:
- **LLM**: Context understanding, pattern generalization
- **Regex**: Format enforcement, exact constraints
- **Statistics**: Quality measurement, anomaly detection
- **Non-destructive storage**: Experimentation, rollback

## Further Exploration

**To implement this pattern**: See [../README.md](../README.md) for quick start guide

**For architectural details**: See [dual-layer-architecture.md](./dual-layer-architecture.md) for deep dive on LLM + post-processing design

**For quality methodology**: See [statistical-quality-control.md](./statistical-quality-control.md) for metrics and monitoring

**For cost planning**: See [cost-optimization-decisions.md](./cost-optimization-decisions.md) for economic analysis

**Academic papers**:
- ["Language Models are Few-Shot Learners"](https://arxiv.org/abs/2005.14165) - GPT-3 foundation
- ["Chain-of-Thought Prompting"](https://arxiv.org/abs/2201.11903) - How LLMs reason step-by-step

**Blog posts**:
- [Anthropic's Model Context Protocol](https://www.anthropic.com/news/model-context-protocol) - How Claude handles structured tasks
- [AWS: Best Practices for Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/best-practices.html)

---

**Last Updated**: 2026-01-24
