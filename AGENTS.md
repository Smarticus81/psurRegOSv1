# AGENTS.md

## Project Overview

This is a **PSUR (Periodic Safety Update Report) Generation System** for medical devices under EU MDR regulations. The system uses AI agents to automate document ingestion, evidence extraction, and regulatory report compilation with full traceability.

## Architecture

The agent system consists of two primary layers:

1. **TypeScript Agents** (`server/src/agents/`) - Handle document ingestion and PSUR content generation
2. **Python PSUR Orchestrator** (`psur_orchestrator/`) - DSL-based compliance kernel for regulatory validation

---

## TypeScript Agent Layer

### Core Components

| File | Purpose |
|------|---------|
| `baseAgent.ts` | Foundation class with lifecycle management, LLM invocation, and decision tracing |
| `agentOrchestrator.ts` | Coordinates all agents for ingestion and compilation workflows |
| `llmService.ts` | Unified LLM interface supporting OpenAI and Anthropic with automatic fallback |
| `config.ts` | Centralized configuration with presets (fast, regulatory, development, offline) |

### Agent Lifecycle

```
1. SPAWN      - Agent instantiated with context (psurCaseId, slotId, etc.)
2. INITIALIZE - Loads relevant data, establishes trace context
3. EXECUTE    - Performs primary task, may invoke sub-agents
4. VALIDATE   - Self-validates output, reports confidence score
5. CLEANUP    - Releases resources
6. TERMINATE  - Agent instance destroyed
```

### Ingestion Agents (`server/src/agents/ingestion/`)

| Agent | Purpose | LLM Usage |
|-------|---------|-----------|
| `FieldMappingAgent` | Maps source columns to target schema fields | Yes - semantic similarity + LLM fallback |
| `EvidenceExtractionAgent` | Extracts structured records from parsed content | Yes - classification, severity detection |

### Runtime Agents (`server/src/agents/runtime/`)

#### Narrative Agents (`runtime/narratives/`)

| Agent | Purpose | LLM Usage |
|-------|---------|-----------|
| `BaseNarrativeAgent` | Foundation for all narrative agents | Yes |
| `benefitRiskAgent.ts` | Benefit-risk conclusions | Yes - synthesis |
| `capaNarrativeAgent.ts` | CAPA summary narratives | Yes |
| `clinicalNarrativeAgent.ts` | Clinical evidence narratives | Yes |
| `conclusionAgent.ts` | Final conclusions and recommendations | Yes - synthesis |
| `deviceScopeAgent.ts` | Device scope and identification | Minimal |
| `execSummaryAgent.ts` | Executive summary generation | Yes |
| `fscaNarrativeAgent.ts` | FSCA (Field Safety Corrective Action) narratives | Yes |
| `pmsActivityAgent.ts` | PMS activity summaries | Yes |
| `safetyNarrativeAgent.ts` | Safety data narratives | Yes |
| `trendNarrativeAgent.ts` | Trend analysis narratives | Yes |
| `narrativeWriterAgent.ts` | Generic narrative generation | Yes |

#### Table Agents (`runtime/tables/`)

| Agent | Purpose | LLM Usage |
|-------|---------|-----------|
| `BaseTableAgent` | Foundation for table generation | Minimal |
| `capaTableAgent.ts` | CAPA records table | None |
| `complaintsTableAgent.ts` | Complaints data table | None |
| `fscaTableAgent.ts` | FSCA records table | None |
| `literatureTableAgent.ts` | Literature references table | None |
| `pmcfTableAgent.ts` | PMCF results table | None |
| `salesExposureTableAgent.ts` | Sales/exposure data table | None |
| `seriousIncidentsTableAgent.ts` | Serious incidents table | None |
| `trendAnalysisTableAgent.ts` | Trend analysis table | Minimal |

#### Chart Agents (`runtime/charts/`)

| Agent | Purpose | LLM Usage |
|-------|---------|-----------|
| `BaseChartAgent` | Foundation for chart generation | None |
| `complaintBarChartAgent.ts` | Complaint distribution bar charts | None |
| `distributionPieChartAgent.ts` | Distribution pie charts | None |
| `geographicHeatMapAgent.ts` | Geographic distribution heatmaps | None |
| `timeSeriesChartAgent.ts` | Time series visualizations | None |
| `trendLineChartAgent.ts` | Trend line charts | None |

#### Other Runtime Components

| File | Purpose |
|------|---------|
| `compileOrchestrator.ts` | Orchestrates the PSUR compilation process |
| `documentFormatterAgent.ts` | Formats final document output |

---

## LLM Configuration

### Supported Providers

- **OpenAI**: GPT-4o (default), GPT-4o-mini (fast)
- **Anthropic**: Claude Sonnet 4.5, Claude Haiku 4.5

### Provider Selection

```typescript
// Auto mode: prefers OpenAI, falls back to Anthropic
provider: "auto" | "openai" | "anthropic"
```

### Configuration Presets

| Preset | Use Case | Model | Temperature |
|--------|----------|-------|-------------|
| `default` | General use | gpt-4o | 0.1 |
| `fast` | Quick processing | gpt-4o-mini | 0.1 |
| `regulatory` | Submission-grade accuracy | gpt-4o | 0.05 |
| `development` | Testing/cost optimization | claude-haiku-4.5 | 0.2 |
| `offline` | Rule-based only (no LLM) | N/A | N/A |

---

## Prompt Templates

Located in `llmService.ts`:

| Template | Purpose |
|----------|---------|
| `SEVERITY_CLASSIFICATION` | Classify complaint severity (Critical/High/Medium/Low/Informational) |
| `FIELD_MAPPING_RESOLUTION` | Resolve ambiguous column-to-field mappings |
| `EVIDENCE_EXTRACTION` | Extract structured evidence from document sections |
| `NARRATIVE_GENERATION` | Generate regulatory narrative sections |
| `TABLE_FORMATTING` | Format evidence into regulatory-compliant tables |
| `BENEFIT_RISK_CONCLUSION` | Generate benefit-risk conclusions |
| `GAP_JUSTIFICATION` | Justify missing evidence |
| `COMPLIANCE_CHECK` | Validate content against regulatory requirements |

---

## Traceability

All agent activity is captured in a hash-verified trace chain:

### Trace Event Types

**Ingestion Events:**
- `INGESTION_STARTED`, `FORMAT_DETECTED`, `PARSER_SELECTED`
- `FIELD_MAPPING_STARTED`, `FIELD_MAPPING_RESOLVED`
- `RECORD_EXTRACTED`, `CLASSIFICATION_PERFORMED`
- `VALIDATION_PASSED`, `VALIDATION_FAILED`
- `ATOM_CREATED`, `INGESTION_COMPLETED`

**Runtime Events:**
- `AGENT_SPAWNED`, `AGENT_INITIALIZED`, `AGENT_COMPLETED`, `AGENT_FAILED`
- `LLM_INVOKED`, `LLM_RESPONSE_RECEIVED`
- `NARRATIVE_GENERATION_STARTED`, `NARRATIVE_GENERATED`
- `SLOT_PROPOSED`, `SLOT_REJECTED`
- `DECISION_MADE`, `WORKFLOW_COMPLETED`

### Confidence Thresholds

| Threshold | Value | Action |
|-----------|-------|--------|
| Auto-Accept Mapping | >= 0.95 | No user confirmation |
| Accept with Warning | 0.80 - 0.94 | Flag for review |
| Require Confirmation | 0.60 - 0.79 | User must confirm |
| Cannot Auto-Map | < 0.60 | Manual mapping required |
| LLM High Confidence | >= 0.85 | Accept output |
| LLM Low Confidence | < 0.70 | Manual review |

---

## Python PSUR Orchestrator

The `psur_orchestrator/` module is a DSL-based compliance kernel that enforces regulatory requirements.

### Components

| Directory | Purpose |
|-----------|---------|
| `core/` | Core logic: adjudication, qualification, trace generation |
| `dsl/` | Domain-specific language for regulatory obligations |
| `rules/` | Constraint evaluator and rule checks |
| `storage/` | SQLite database operations |

### DSL Syntax

The DSL supports three declaration types:

**SOURCE** - Regulatory source definitions
```dsl
SOURCE "MDCG-2022-21" {
  jurisdiction: EU
  instrument: "Guidance"
  effective_date: 2022-12-01
}
```

**OBLIGATION** - Regulatory requirements
```dsl
OBLIGATION "EU.PSUR.CONTENT.BENEFIT_RISK" {
  title: "Include benefit-risk conclusions"
  mandatory: true
  required_evidence_types: ["benefit_risk_analysis", "serious_incident"]
  allowed_transformations: ["summarize", "cite", "aggregate"]
  forbidden_transformations: ["invent", "re_weight_risk"]
}
```

**CONSTRAINT** - Validation rules
```dsl
CONSTRAINT "EU.PSUR.GROUPING.LEADING_DEVICE_FIXED" {
  severity: BLOCK
  trigger: "on_group_update"
  if: "changed(leading_device)"
  then: "fail(Leading device cannot change.)"
}
```

### CLI Commands

```bash
psur init                    # Initialize database
psur compile <dsl_file>      # Compile DSL to executable JSON
psur qualify --template <id> # Qualify template against obligations
psur adjudicate <id>         # Adjudicate a proposal
psur trace-export            # Export trace nodes to JSONL
```

---

## Evidence Types

| Type | Category | Classification Enabled |
|------|----------|------------------------|
| `complaint_record` | Safety | Yes |
| `serious_incident_record` | Safety | No |
| `sales_volume` | Commercial | No |
| `fsca_record` | Safety | No |
| `capa_record` | Quality | No |
| `pmcf_result` | Clinical | No |
| `literature_result` | Clinical | No |
| `risk_assessment` | Quality | No |
| `external_db_query` | Regulatory | No |

---

## Key Design Principles

1. **Every Decision Traced** - All agent decisions logged with reasoning
2. **Hash Chain Integrity** - Tamper-proof audit trail
3. **LLM Transparency** - All LLM calls logged with prompts/responses
4. **Ephemeral by Default** - Runtime agents spawn and terminate per task
5. **Graceful Degradation** - Fallback strategies for failures
6. **User in the Loop** - Escalation for low-confidence decisions
7. **Regulatory First** - All outputs traceable to evidence sources
8. **No Fabrication** - Agents must not invent data; only use provided evidence

---

## Environment Variables

```env
OPENAI_API_KEY=sk-...        # Required for OpenAI provider
ANTHROPIC_API_KEY=sk-ant-... # Required for Anthropic provider
DATABASE_URL=...             # PostgreSQL connection string
```

---

## File Structure

```
server/src/agents/
  baseAgent.ts            # Foundation agent class
  agentOrchestrator.ts    # Workflow orchestration
  llmService.ts           # LLM provider abstraction
  config.ts               # Configuration management
  index.ts                # Exports
  ingestion/
    fieldMappingAgent.ts  # Column-to-field mapping
    evidenceExtractionAgent.ts
  runtime/
    compileOrchestrator.ts
    documentFormatterAgent.ts
    narrativeWriterAgent.ts
    narratives/           # Section-specific narrative agents
    tables/               # Table generation agents
    charts/               # Chart generation agents

psur_orchestrator/
  cli.py                  # Typer CLI
  core/                   # Core adjudication/qualification logic
  dsl/                    # DSL grammar and compiler
  rules/                  # Constraint evaluation
  storage/                # Database operations
```

---

## Extending the System

### Adding a New Narrative Agent

1. Create a new file in `server/src/agents/runtime/narratives/`
2. Extend `BaseNarrativeAgent`
3. Implement required abstract methods:
   - `sectionType: string`
   - `systemPrompt: string`
   - `identifyGaps(input): string[]`
4. Register in the index file

### Adding a New Evidence Type

1. Add schema to `config.ts` `EVIDENCE_TYPE_MAPPINGS`
2. Add target schema to `agentOrchestrator.ts` `getTargetSchema()`
3. Create extraction logic if needed

### Adding a New Compliance Rule

1. Add DSL definition in `psur_orchestrator/dsl/examples/`
2. Compile with `psur compile`
3. Add check implementation in `psur_orchestrator/rules/checks.py` if custom logic needed

---

## Dependencies

**TypeScript:**
- `openai` - OpenAI API client
- `@anthropic-ai/sdk` - Anthropic API client
- `drizzle-orm` - Database ORM
- `zod` - Runtime type validation

**Python:**
- `lark` - DSL parsing
- `typer` - CLI framework
- `pydantic` - Data validation
- `sqlite3` - Database

---

*Last Updated: January 2026*
