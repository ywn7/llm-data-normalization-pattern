# Architecture Diagrams

This directory contains architecture diagrams for the LLM-Powered Data Normalization ETL pattern.

## Diagram Types

### Python Diagrams (PNG output)

**Source**: `architecture.py`

**Generated files** (in `generated/`):
- `architecture.png` - Main ETL pipeline architecture
- `dual-layer.png` - Dual-layer processing (LLM + Post-processing)
- `cost-flow.png` - Cost architecture breakdown

### Mermaid Diagrams (Markdown)

**Source**: `sequences.md`

Mermaid diagrams can be rendered directly in GitHub, VS Code, or any Markdown viewer that supports Mermaid.

Includes:
- Normalization sequence diagram
- Data flow diagram
- Statistical validation flow

## Generating PNG Diagrams

### Prerequisites

1. **Install Graphviz** (required by diagrams library):

```bash
# macOS
brew install graphviz

# Ubuntu/Debian
sudo apt install graphviz

# Windows
choco install graphviz
```

2. **Install Python dependencies**:

```bash
pip install -r requirements.txt
```

### Generate Diagrams

```bash
# From the repository root
cd docs/oss-patterns/diagrams
python architecture.py

# Or from repository root
python docs/oss-patterns/diagrams/architecture.py
```

### Output

Generated PNG files will be created in:
```
docs/oss-patterns/diagrams/generated/
├── architecture.png
├── dual-layer.png
└── cost-flow.png
```

## Embedding in Documentation

### PNG Diagrams (from generated/)

```markdown
![Main Architecture](./diagrams/generated/architecture.png)
```

### Mermaid Diagrams (inline)

Copy the Mermaid code blocks from `sequences.md` into your Markdown files.

GitHub, GitLab, and many Markdown editors render Mermaid natively.

## Icons Used

All diagrams use official AWS icons from the `diagrams` library:

| Icon | Import | Service |
|------|--------|---------|
| Lambda | `diagrams.aws.compute.Lambda` | AWS Lambda |
| DynamoDB | `diagrams.aws.database.Dynamodb` | Amazon DynamoDB |
| Bedrock | `diagrams.aws.ml.Bedrock` | Amazon Bedrock |
| EventBridge | `diagrams.aws.integration.Eventbridge` | Amazon EventBridge |
| CloudWatch | `diagrams.aws.management.Cloudwatch` | Amazon CloudWatch |

## Customization

To modify diagrams:

1. Edit `architecture.py`
2. Run `python architecture.py`
3. Review generated PNGs in `generated/`
4. Commit updated source and generated files

## Notes

- Keep diagrams clean and readable
- Use consistent colors and styling
- Avoid client-specific references
- Update diagrams when architecture changes
