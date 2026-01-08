# PSUR Compliance Orchestrator

A DSL-first, deterministic compliance kernel for generating MDCG 2022-21 compliant Periodic Safety Update Reports (PSURs) for medical devices.

## Overview

The PSUR Compliance Orchestrator is the source of truth for PSUR generation. It:

- **Encodes regulatory obligations as DSL** - A domain-specific language expresses EU MDR (MDCG 2022-21) and UK MDR (SI 2024/1368) requirements
- **Compiles to executable JSON** - The DSL compiles to obligation graphs and constraint rules
- **Adjudicates proposals** - Runtime validates agent-submitted content against compliance rules
- **Template-agnostic** - Bring your own template; compliance comes from the DSL only
- **Ultra-atomic traces** - Every output is traced to evidence at paragraph/cell level
- **Deterministic** - Same inputs always produce same outputs

## Installation

```bash
cd psur_orchestrator
pip install -e .
```

For development:
```bash
pip install -e ".[dev]"
```

## Quick Start

### 1. Initialize Database
```bash
psur init
```

### 2. Compile DSL
```bash
psur compile psur_orchestrator/dsl/examples/eu_psur.dsl --out data/compiled/
```

### 3. Seed Demo Data
```bash
psur demo-seed
```

### 4. Qualify Template
```bash
psur qualify --template mdcg_2022_21_template
```

### 5. View Compiled Obligations
```bash
psur list-obligations
psur list-constraints
```

## DSL Syntax

The DSL supports three declaration types:

### SOURCE
```dsl
SOURCE "MDCG-2022-21§2.2.1" {
  jurisdiction: EU
  instrument: "Guidance"
  effective_date: 2022-12-01
  title: "PSUR Content Requirements"
}
```

### OBLIGATION
```dsl
OBLIGATION "EU.PSUR.CONTENT.BENEFIT_RISK" {
  title: "Include benefit-risk conclusions"
  jurisdiction: EU
  mandatory: true
  required_evidence_types: ["benefit_risk_analysis", "serious_incident"]
  allowed_transformations: ["summarize", "cite", "aggregate"]
  forbidden_transformations: ["invent", "re_weight_risk"]
  required_time_scope: "psur_period"
  allowed_output_types: ["narrative"]
  sources: ["EU-MDR-Art86", "MDCG-2022-21§2.2.1"]
}
```

### CONSTRAINT
```dsl
CONSTRAINT "EU.PSUR.GROUPING.LEADING_DEVICE_FIXED" {
  severity: BLOCK
  trigger: "on_group_update"
  if: "changed(leading_device)"
  then: "fail(Leading device cannot change. Issue a new PSUR.)"
  sources: ["MDCG-2022-21§4.1"]
  jurisdiction: EU
}
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `psur init` | Initialize the database |
| `psur reset` | Reset all data (requires confirmation) |
| `psur compile <dsl_file>` | Compile DSL to executable JSON |
| `psur template-register <json>` | Register a template schema |
| `psur mapping-register <json>` | Register obligation-to-slot mappings |
| `psur qualify --template <id>` | Qualify template against obligations |
| `psur evidence-add <json>` | Add an evidence atom |
| `psur proposal-submit <json>` | Submit a slot proposal |
| `psur adjudicate <proposal_id>` | Adjudicate a proposal |
| `psur trace-export` | Export trace nodes to JSONL |
| `psur demo-seed` | Load example data for demonstration |
| `psur list-obligations` | List compiled obligations |
| `psur list-constraints` | List compiled constraints |

## Jurisdictions Covered

### EU MDR (MDCG 2022-21)
- Benefit-risk conclusions
- Main PMCF findings
- Sales volume data
- Population estimate (when practicable)
- Serious incidents and FSCAs
- Non-serious incidents
- Trend reporting
- Literature review and database scans

### UK MDR (SI 2024/1368)
- Device lifetime and PMS period
- UK-specific statistical methodology
- Patient/public engagement
- MHRA 3 working days availability process
- Communications with MHRA/UKRP/Approved Body
- Schedule constraints (annual for IIb/III, biennial for IIa)

## Adjudication Rules

Proposals are adjudicated against:

1. **Evidence types** - Required evidence must be referenced
2. **Time scope** - Evidence must fall within PSUR period
3. **Transformations** - Only allowed transformations permitted; forbidden ones rejected
4. **Constraints** - Global rules (grouping, time contiguity) enforced

## Trace Atomicity

Accepted proposals generate ultra-atomic traces:
- **Narrative**: Paragraph-level (split by blank lines)
- **Table**: Cell-level (each cell traced)
- **Key-Value**: Per-key traces

No output exists without corresponding trace nodes.

## Running Tests

```bash
pytest tests/ -v
```

## Project Structure

```
psur_orchestrator/
├── pyproject.toml
├── README.md
├── psur_orchestrator/
│   ├── cli.py              # Typer CLI
│   ├── core/
│   │   ├── types.py        # Pydantic models
│   │   ├── adjudication.py # Proposal adjudication
│   │   ├── qualification.py# Template qualification
│   │   ├── trace.py        # Trace generation
│   │   └── renderer_stub.py# Markdown renderer
│   ├── dsl/
│   │   ├── grammar.lark    # Lark grammar
│   │   ├── ast.py          # AST definitions
│   │   ├── parser.py       # DSL parser
│   │   ├── compiler.py     # DSL compiler
│   │   └── examples/       # Example DSL files
│   ├── rules/
│   │   ├── engine.py       # Constraint evaluator
│   │   ├── checks.py       # Predefined checks
│   │   └── registry.py     # Check registry
│   └── storage/
│       ├── models.py       # SQLite operations
│       └── migrations.py   # Database setup
└── tests/
    ├── test_dsl_compile.py
    ├── test_template_qualification.py
    ├── test_adjudication_accept.py
    ├── test_adjudication_reject.py
    ├── test_trace_atomicity.py
    └── test_time_contiguity.py
```

## License

MIT
