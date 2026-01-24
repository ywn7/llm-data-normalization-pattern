"""
LLM-Powered Data Normalization ETL Pattern - Architecture Diagrams

This script generates PNG architecture diagrams using the diagrams library.
Requires: pip install diagrams
Requires: graphviz installed (brew install graphviz on macOS)

Usage:
    cd docs/oss-patterns/diagrams
    python architecture.py
"""

from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.database import Dynamodb
from diagrams.aws.integration import Eventbridge
from diagrams.aws.ml import Bedrock
from diagrams.aws.management import Cloudwatch

# Output directory for generated diagrams
OUTPUT_DIR = "generated"


def create_main_architecture():
    """
    Main ETL pipeline architecture diagram.
    Shows the end-to-end flow from EventBridge trigger to DynamoDB storage.
    """
    with Diagram(
        "LLM-Powered Data Normalization ETL",
        filename=f"{OUTPUT_DIR}/architecture",
        show=False,
        direction="LR",
        graph_attr={
            "fontsize": "24",
            "bgcolor": "white",
            "pad": "0.5",
        },
    ):
        # Trigger
        trigger = Eventbridge("Daily Trigger\n(2 AM COT)")

        # Main processing cluster
        with Cluster("Normalization Pipeline"):
            normalize = Lambda("normalize-leads\n(Node.js 22.x)")
            bedrock = Bedrock("Claude 3 Haiku\n(temp=0)")

        # Data storage
        db = Dynamodb("leads table\n(original +\nnormalized)")

        # Monitoring
        logs = Cloudwatch("CloudWatch\nLogs & Metrics")

        # Connections with labels
        trigger >> Edge(label="invoke") >> normalize
        normalize >> Edge(label="batch of 10\nleads") >> bedrock
        bedrock >> Edge(label="normalized\nJSON") >> normalize
        normalize >> Edge(label="UpdateItem") >> db
        normalize >> Edge(style="dashed") >> logs


def create_dual_layer_diagram():
    """
    Dual-layer processing architecture diagram.
    Shows how raw data flows through LLM layer and post-processing layer.
    """
    with Diagram(
        "Dual-Layer Processing Architecture",
        filename=f"{OUTPUT_DIR}/dual-layer",
        show=False,
        direction="TB",
        graph_attr={
            "fontsize": "24",
            "bgcolor": "white",
            "pad": "0.5",
            "ranksep": "1.0",
        },
    ):
        # Input
        with Cluster("Input Layer"):
            raw_data = Dynamodb("Raw User Data\n(JUAN CARLOS,\nbogota, etc.)")

        # LLM Processing Layer
        with Cluster("Layer 1: LLM Normalization"):
            bedrock = Bedrock("Claude 3 Haiku")

        # Post-Processing Layer
        with Cluster("Layer 2: Post-Processing"):
            lambda_fn = Lambda("Regex Pipeline\n& Validation")

        # Output
        with Cluster("Output Layer"):
            normalized = Dynamodb("Normalized Data\n(Juan Carlos,\nBogota D.C.)")

        # Monitoring
        logs = Cloudwatch("Quality Metrics\n& Statistics")

        # Flow
        raw_data >> Edge(label="JSON prompt") >> bedrock
        bedrock >> Edge(label="LLM response") >> lambda_fn
        lambda_fn >> Edge(label="validated output") >> normalized
        lambda_fn >> Edge(style="dashed", label="coverage,\nimprovement rate") >> logs


def create_cost_flow_diagram():
    """
    Cost architecture diagram.
    Shows the flow with cost annotations for each component.
    """
    with Diagram(
        "Cost Architecture",
        filename=f"{OUTPUT_DIR}/cost-flow",
        show=False,
        direction="LR",
        graph_attr={
            "fontsize": "24",
            "bgcolor": "white",
            "pad": "0.5",
        },
    ):
        # EventBridge (free)
        with Cluster("Free Tier"):
            trigger = Eventbridge("EventBridge\nSchedule\n($0/month)")

        # Lambda (minimal cost)
        with Cluster("~$0.01/month"):
            lambda_fn = Lambda("Lambda\n512MB x 300s\n(~30 invocations)")

        # Bedrock (main cost)
        with Cluster("~$0.04/month"):
            bedrock = Bedrock("Claude 3 Haiku\n$0.25/1M input\n$1.25/1M output")

        # DynamoDB (pay per request)
        with Cluster("~$0.01/month"):
            db = Dynamodb("DynamoDB\nPay-per-request\n(~1K writes)")

        # CloudWatch (free tier)
        with Cluster("Free Tier"):
            logs = Cloudwatch("CloudWatch\nLogs\n(5GB free)")

        # Flow with cost annotations
        trigger >> Edge(label="daily") >> lambda_fn
        lambda_fn >> Edge(label="~65 calls\n/652 leads") >> bedrock
        lambda_fn >> Edge(label="652\nupdates") >> db
        lambda_fn >> Edge(style="dashed") >> logs


if __name__ == "__main__":
    print("Generating architecture diagrams...")

    print("  - Main architecture diagram...")
    create_main_architecture()

    print("  - Dual-layer processing diagram...")
    create_dual_layer_diagram()

    print("  - Cost flow diagram...")
    create_cost_flow_diagram()

    print(f"\nDone! Diagrams saved to {OUTPUT_DIR}/")
    print("  - architecture.png")
    print("  - dual-layer.png")
    print("  - cost-flow.png")
