# LLM-Powered Data Normalization Pattern

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![AWS](https://img.shields.io/badge/AWS-Bedrock-orange)](https://aws.amazon.com/bedrock/)
[![Claude](https://img.shields.io/badge/Claude-Haiku-blueviolet)](https://www.anthropic.com/claude)

> A production-ready serverless pattern for intelligent data normalization using Claude Haiku via AWS Bedrock

[English](./docs/en/README.md) | [Español](./docs/es/README.md)

---

## What is this?

This pattern combines **LLM-based normalization** with **statistical validation** and **regex post-processing** to achieve high-quality data cleansing at ultra-low cost.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Messy Input    │────▶│  Claude Haiku   │────▶│  Clean Output   │
│  "CRA 15 #100"  │     │  (via Bedrock)  │     │  "Cra. 15 #100" │
│  "BOGOTA"       │     │                 │     │  "Bogotá D.C."  │
│  "ing sistemas" │     │  + Post-process │     │  "Ing. Sistemas"│
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Key Innovation

**Dual-layer architecture** that combines:
1. **LLM intelligence** for context-aware normalization
2. **Regex post-processing** to catch LLM inconsistencies
3. **Statistical validation** with 95% confidence intervals to detect quality drift

## Production Results

| Metric | Value |
|--------|-------|
| Records processed | 652 leads |
| Fields normalized | 4,280 |
| Improvement rate | 70.4% |
| Coverage | 99.2% |
| Cost per 1K records | **$0.07** |
| Bug detection | Caught systematic "double-dot" bug via statistical analysis |

## Quick Start

```bash
# Clone the repo
git clone https://github.com/gabanox/llm-data-normalization-pattern.git
cd llm-data-normalization-pattern

# Follow the 90-minute tutorial
open docs/en/TUTORIAL.md
```

## Architecture

```
┌────────────────────┐
│  EventBridge       │──▶ Daily at 2 AM
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
│  │ 5. Apply post-processing regex pipeline   │  │ ◀─ Self-healing
│  │ 6. Store in normalizedData attribute      │  │
│  │ 7. Track metrics (coverage, improvements) │  │
│  └───────────────────────────────────────────┘  │
└────────┬──────────────────────────┬─────────────┘
         │                          │
         ▼                          ▼
┌──────────────────┐      ┌─────────────────────┐
│   DynamoDB       │      │   AWS Bedrock       │
│   leads table    │      │   Claude 3 Haiku    │
└──────────────────┘      └─────────────────────┘
```

## Documentation

### By Goal

| Goal | Document |
|------|----------|
| **Understand the pattern** | [README](./docs/en/README.md) → [Architecture](./docs/en/ARCHITECTURE.md) |
| **Implement it yourself** | [Tutorial](./docs/en/TUTORIAL.md) ⭐ → [Implementation](./docs/en/IMPLEMENTATION.md) |
| **Understand the "why"** | [Explanation docs](./docs/en/explanation/) |
| **Validate quality** | [Statistical Validation](./docs/en/STATISTICAL-VALIDATION.md) |
| **Avoid pitfalls** | [Lessons Learned](./docs/en/LESSONS-LEARNED.md) |

### By Role

- **Developers**: [Tutorial](./docs/en/TUTORIAL.md) → [Implementation](./docs/en/IMPLEMENTATION.md)
- **Architects**: [Explanation](./docs/en/explanation/) → [Architecture](./docs/en/ARCHITECTURE.md)
- **Data Engineers**: [Statistical Validation](./docs/en/STATISTICAL-VALIDATION.md)
- **Managers**: [Cost Analysis](./docs/en/COST-ANALYSIS.md)

## Use Cases

This pattern is ideal for:

- **User-submitted form data** (names, addresses, cities, companies)
- **Data quality improvement** for analytics/reporting
- **LLM input preparation** for downstream AI processes
- **Compliance scenarios** requiring audit trails

## Cost Comparison

| Approach | Cost per 1K records | Notes |
|----------|---------------------|-------|
| Manual data entry ($15/hr) | $75.00 | 5 min per record |
| Rule-based ETL | $0.00 | Weeks of engineering |
| Claude 3.5 Sonnet (LLM only) | $1.20 | 15x more expensive |
| **This pattern (Haiku + rules)** | **$0.07** | Best cost/quality ratio |

## Tech Stack

- **AWS Lambda** (Node.js 22.x)
- **AWS Bedrock** (Claude 3 Haiku)
- **DynamoDB** (pay-per-request)
- **EventBridge** (scheduled triggers)
- **AWS SAM** (Infrastructure as Code)

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Author

**Gabriel Isaías Ramírez Melgarejo**
AWS Community Hero | Founder, Bootcamp Institute

- GitHub: [@gabanox](https://github.com/gabanox)
- LinkedIn: [Gabriel Ramírez](https://www.linkedin.com/in/gabriel-ramirez-melgarejo/)
- Twitter/X: [@gaaborey](https://twitter.com/gaaborey)

---

⭐ If you find this pattern useful, please star the repo!
