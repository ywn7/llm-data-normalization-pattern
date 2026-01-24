# Mermaid Sequence Diagrams

This document contains Mermaid diagrams for the LLM-Powered Data Normalization ETL pattern.
These diagrams can be rendered directly in GitHub, VS Code, or any Markdown viewer that supports Mermaid.

## 1. Normalization Sequence Diagram

This diagram shows the complete flow from EventBridge trigger to data storage.

```mermaid
sequenceDiagram
    participant EB as EventBridge
    participant L as Lambda
    participant D as DynamoDB
    participant B as Bedrock (Haiku)

    EB->>L: Daily trigger (2 AM COT)

    L->>D: GetItem (config)
    D-->>L: {enabled: true, batchSize: 10}

    L->>D: Scan (normalizedAt < cutoff)
    D-->>L: Return <=50 leads

    loop For each batch of 10 leads
        L->>L: Generate prompt with field rules
        L->>B: POST /invoke (JSON prompt)
        Note over B: Claude 3 Haiku<br/>temp=0, max_tokens=1000
        B-->>L: Normalized JSON response
        L->>L: Post-process (regex pipeline)
        L->>L: Validate output structure
    end

    L->>D: BatchWriteItem
    Note over L,D: SET normalizedData,<br/>normalizedAt = now()
    D-->>L: Success

    L->>L: Calculate metrics
    Note over L: coverage, improvement rate,<br/>confidence intervals
```

## 2. Data Flow Diagram

This diagram shows how data transforms through the dual-layer architecture.

```mermaid
flowchart LR
    subgraph Input["Input Layer"]
        R[("Raw Data<br/>JUAN CARLOS<br/>bogota<br/>CRA 15 NO 100")]
    end

    subgraph Layer1["Layer 1: LLM Normalization"]
        P["Generate<br/>Prompt"] --> H["Claude 3<br/>Haiku"]
        H --> J["JSON<br/>Response"]
    end

    subgraph Layer2["Layer 2: Post-Processing"]
        PP["Regex<br/>Patterns"] --> V["Validation<br/>Rules"]
    end

    subgraph Output["Output Layer"]
        N[("Normalized<br/>Juan Carlos<br/>Bogota D.C.<br/>Cra. 15 # 100")]
    end

    R --> P
    J --> PP
    V --> N

    style Layer1 fill:#f9f3e3
    style Layer2 fill:#e3f2fd
```

## 3. Statistical Validation Flow

This diagram shows how statistical validation detects bugs and quality issues.

```mermaid
flowchart TD
    N["Normalized Data<br/>(652 leads)"] --> S["Calculate Statistics"]

    S --> M1["Coverage Rate<br/>99.2%"]
    S --> M2["Improvement Rate<br/>70.4%"]

    M1 --> CI1["95% CI:<br/>98.5% - 99.9%"]
    M2 --> CI2["95% CI:<br/>69.0% - 71.8%"]

    CI1 --> Z1{Z-Score<br/>Check}
    CI2 --> Z2{Z-Score<br/>Check}

    Z1 -->|"Within bounds"| OK1["Quality OK"]
    Z2 -->|"Anomaly!"| A["Investigate"]

    A --> B["Bug Detected:<br/>Double-dot in addresses<br/>(65.7% affected)"]
    B --> F["Fix Regex:<br/>Check for existing dot"]
    F --> R["Re-run<br/>Normalization"]
    R --> N

    style A fill:#ffcdd2
    style B fill:#ffcdd2
    style F fill:#c8e6c9
    style OK1 fill:#c8e6c9
```

## 4. Batch Processing Flow

This diagram shows how leads are processed in batches to optimize API costs.

```mermaid
flowchart TB
    subgraph Input["50 Leads to Process"]
        L1["Lead 1-10"]
        L2["Lead 11-20"]
        L3["Lead 21-30"]
        L4["Lead 31-40"]
        L5["Lead 41-50"]
    end

    subgraph Processing["Sequential Batch Processing"]
        B1["Batch 1<br/>~2-4s"] --> S1["Sleep 500ms"]
        S1 --> B2["Batch 2<br/>~2-4s"]
        B2 --> S2["Sleep 500ms"]
        S2 --> B3["Batch 3<br/>~2-4s"]
        B3 --> S3["Sleep 500ms"]
        S3 --> B4["Batch 4<br/>~2-4s"]
        B4 --> S4["Sleep 500ms"]
        S4 --> B5["Batch 5<br/>~2-4s"]
    end

    subgraph Bedrock["Bedrock API"]
        API["Claude 3 Haiku<br/>10 leads/call<br/>~$0.0004/batch"]
    end

    L1 --> B1
    L2 --> B2
    L3 --> B3
    L4 --> B4
    L5 --> B5

    B1 & B2 & B3 & B4 & B5 <--> API

    B5 --> Total["Total: ~25-35s<br/>Cost: ~$0.002"]

    style Total fill:#e8f5e9
```

## 5. Error Handling Flow

This diagram shows the error handling strategy for different failure scenarios.

```mermaid
flowchart TD
    Start["Process Batch"] --> API["Call Bedrock API"]

    API -->|Success| Parse["Parse JSON Response"]
    API -->|ThrottlingException| Retry["Exponential Backoff<br/>1s, 2s, 4s"]
    API -->|ModelTimeout| Skip["Skip Batch<br/>Log for Review"]
    API -->|Other Error| Fail["Fail Lambda<br/>Alert Admin"]

    Retry --> API

    Parse -->|Valid JSON| Post["Post-Process"]
    Parse -->|Invalid JSON| Default["Use Original Values<br/>Log Warning"]

    Post --> Update["Update DynamoDB"]
    Default --> Update
    Skip --> Next["Next Batch"]

    Update -->|Success| Next
    Update -->|Throttle| DDBRetry["SDK Auto-Retry"]
    DDBRetry --> Update

    Next --> Done{More Batches?}
    Done -->|Yes| Start
    Done -->|No| Metrics["Log Metrics"]

    style Fail fill:#ffcdd2
    style Skip fill:#fff3e0
    style Default fill:#fff3e0
```

## 6. Idempotency Check Flow

This diagram shows how the system ensures idempotent processing.

```mermaid
flowchart TD
    Trigger["EventBridge Trigger<br/>or Manual Invoke"] --> Check["Query Leads"]

    Check --> Filter["Filter by normalizedAt"]

    Filter --> C1{"normalizedAt<br/>is NULL?"}
    C1 -->|Yes| Process["Add to Process Queue"]

    C1 -->|No| C2{"normalizedAt<br/>< cutoff?"}
    C2 -->|Yes| Process
    C2 -->|No| Skip["Skip (Already Current)"]

    Process --> Normalize["Normalize Lead"]
    Normalize --> Update["SET normalizedAt = now()"]

    Update --> Next["Next Lead"]
    Skip --> Next

    Next --> Done{More Leads?}
    Done -->|Yes| Filter
    Done -->|No| Complete["Complete"]

    style Skip fill:#e3f2fd
    style Process fill:#fff3e0
```

## Usage

### In GitHub/GitLab

Mermaid diagrams render automatically in Markdown files on GitHub and GitLab.
Just copy the code blocks above into your documentation.

### In VS Code

Install the "Markdown Preview Mermaid Support" extension to preview Mermaid diagrams.

### Export to PNG

Use the Mermaid CLI to export diagrams:

```bash
# Install mermaid-cli
npm install -g @mermaid-js/mermaid-cli

# Export a diagram
mmdc -i sequences.md -o diagram.png
```

### Live Editor

Use the Mermaid Live Editor to preview and customize diagrams:
https://mermaid.live/
