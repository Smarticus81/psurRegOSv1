# AI Agent Architecture for PSUR System

## Executive Summary

This document outlines the State-of-the-Art (SOTA) AI Agent architecture for the PSUR generation system, covering two primary domains:

1. **Document Ingestion Agents** - Persistent agents for parsing, extracting, and normalizing evidence from various document formats
2. **Runtime Agents** - Ephemeral agents spawned during PSUR compilation for intelligent decision-making, validation, and content generation

All agent activity is captured in a meticulous traceability chain, integrated with the existing `decision_trace` system.

---

## Part 1: Document Ingestion Agent Layer

### 1.1 Agent Taxonomy

```
DocumentIngestionOrchestrator
    |
    +-- FormatDetectionAgent
    |       Detects file type, encoding, structure
    |
    +-- ParserAgents (Format-Specific)
    |       |-- ExcelParserAgent
    |       |-- CSVParserAgent  
    |       |-- DOCXParserAgent
    |       |-- PDFParserAgent
    |       |-- JSONParserAgent
    |
    +-- ContentExtractionAgents (Domain-Specific)
    |       |-- ComplaintsExtractionAgent
    |       |-- SalesExtractionAgent
    |       |-- FSCAExtractionAgent
    |       |-- CAPAExtractionAgent
    |       |-- PMCFExtractionAgent
    |       |-- LiteratureExtractionAgent
    |       |-- IncidentExtractionAgent
    |       |-- CERExtractionAgent
    |
    +-- NormalizationAgent
    |       Standardizes extracted data to evidence schema
    |
    +-- ValidationAgent
    |       Validates completeness, consistency, quality
    |
    +-- MappingResolutionAgent
            Resolves ambiguous column/field mappings
```

### 1.2 Agent Specifications

#### 1.2.1 FormatDetectionAgent

**Purpose**: Analyze uploaded files to determine optimal parsing strategy

**Inputs**:
- File binary/buffer
- File metadata (name, size, MIME type)
- User-provided hints (source type)

**Outputs**:
```typescript
interface FormatDetectionResult {
  detectedFormat: "excel" | "csv" | "docx" | "pdf" | "json" | "unknown";
  confidence: number;                    // 0.0 - 1.0
  encoding: string;                      // UTF-8, etc.
  structure: {
    type: "tabular" | "document" | "mixed";
    hasHeaders: boolean;
    sheetCount?: number;                 // For Excel
    pageCount?: number;                  // For PDF
    sectionCount?: number;               // For DOCX
    tableCount?: number;                 // Embedded tables
  };
  suggestedParser: string;
  warnings: string[];
  traceId: string;
}
```

**Trace Events**:
- `FORMAT_DETECTION_STARTED`
- `FORMAT_ANALYSIS_COMPLETE`
- `PARSER_RECOMMENDED`

---

#### 1.2.2 Content Extraction Agents

Each domain-specific extraction agent follows this interface:

```typescript
interface ExtractionAgent {
  agentId: string;
  domain: EvidenceType;
  
  // Core extraction method
  extract(
    parsedContent: ParsedContent,
    context: ExtractionContext
  ): Promise<ExtractionResult>;
  
  // Confidence scoring
  scoreConfidence(extracted: ExtractedRecord): number;
  
  // Field mapping resolution
  resolveMapping(
    sourceFields: string[],
    targetSchema: FieldSchema[]
  ): MappingResolution;
}

interface ExtractionContext {
  psurCaseId: number;
  deviceCode: string;
  periodStart: string;
  periodEnd: string;
  sourceType: string;
  userMappings?: ColumnMapping[];      // User-provided overrides
  previousExtractions?: ExtractedRecord[]; // For cross-reference
}

interface ExtractionResult {
  agentId: string;
  domain: EvidenceType;
  records: ExtractedRecord[];
  confidence: {
    overall: number;
    byField: Record<string, number>;
  };
  unmappedFields: string[];
  warnings: string[];
  suggestions: string[];
  traceEvents: TraceEvent[];
}

interface ExtractedRecord {
  recordId: string;                    // Generated UUID
  evidenceType: EvidenceType;
  sourceLocation: {
    file: string;
    sheet?: string;
    row?: number;
    section?: string;
    page?: number;
  };
  rawData: Record<string, unknown>;    // Original values
  normalizedData: Record<string, unknown>; // Mapped to schema
  fieldConfidence: Record<string, number>;
  extractionMethod: string;            // Rule-based, LLM, hybrid
  llmReasoning?: string;               // If LLM was used
}
```

---

#### 1.2.3 ComplaintsExtractionAgent (Example Implementation)

**Extraction Strategy**:

```
Phase 1: Field Discovery
    - Scan headers/columns for complaint-related terms
    - Score each column against target schema fields
    - Identify date fields, ID fields, text fields

Phase 2: Record Extraction  
    - Iterate rows/sections
    - Apply field mappings
    - Extract complaint ID, date, description, severity, etc.

Phase 3: Classification (LLM-Assisted)
    - Classify severity if not explicit
    - Identify if complaint is "serious incident" 
    - Identify if complaint is "adverse event"
    - Extract patient outcomes if mentioned

Phase 4: Cross-Reference
    - Link to existing complaints in DB
    - Identify duplicates
    - Flag inconsistencies
```

**LLM Prompts for Classification**:

```typescript
const SEVERITY_CLASSIFICATION_PROMPT = `
You are analyzing a medical device complaint record.
Based on the description, classify the severity.

Complaint Description: {description}
Device Type: {deviceType}
Patient Outcome (if mentioned): {outcome}

Classify as one of:
- CRITICAL: Life-threatening, death, permanent impairment
- HIGH: Serious injury, hospitalization required
- MEDIUM: Temporary injury, medical intervention needed
- LOW: Minor issue, no medical intervention
- INFORMATIONAL: Feedback, no safety concern

Respond with JSON:
{
  "severity": "...",
  "reasoning": "...",
  "isAdverseEvent": boolean,
  "isSeriousIncident": boolean,
  "confidence": 0.0-1.0
}
`;
```

**Trace Events**:
- `COMPLAINT_EXTRACTION_STARTED`
- `FIELD_MAPPING_RESOLVED`
- `RECORD_EXTRACTED`
- `SEVERITY_CLASSIFIED` (with LLM reasoning)
- `ADVERSE_EVENT_DETECTED`
- `SERIOUS_INCIDENT_DETECTED`
- `DUPLICATE_DETECTED`
- `EXTRACTION_COMPLETED`

---

### 1.3 Mapping Resolution System

The MappingResolutionAgent uses a multi-tier approach:

```
Tier 1: Exact Match
    Source: "complaint_id" -> Target: "complaint_id" (100%)

Tier 2: Semantic Similarity
    Source: "Issue Description" -> Target: "description" (92%)
    Uses embedding similarity + keyword matching

Tier 3: LLM Resolution
    Source: "Cust Feedback" -> Target: ??? 
    LLM analyzes sample values to determine mapping

Tier 4: User Confirmation
    Ambiguous mappings presented to user for confirmation
    User selections stored for future use
```

**Mapping Confidence Thresholds**:
- >= 0.95: Auto-accept, no user confirmation needed
- 0.80 - 0.94: Auto-accept with warning flag
- 0.60 - 0.79: Suggest to user, require confirmation
- < 0.60: Cannot auto-map, require user selection

---

### 1.4 Trace Schema for Ingestion

```typescript
interface IngestionTraceEvent {
  eventId: string;
  traceId: string;                     // Links all events for one file
  psurCaseId: number;
  timestamp: string;
  
  eventType: 
    | "INGESTION_STARTED"
    | "FORMAT_DETECTED"
    | "PARSER_SELECTED"
    | "PARSING_STARTED"
    | "PARSING_COMPLETED"
    | "EXTRACTION_AGENT_INVOKED"
    | "FIELD_MAPPING_STARTED"
    | "FIELD_MAPPING_RESOLVED"
    | "LLM_INVOKED"
    | "LLM_RESPONSE_RECEIVED"
    | "RECORD_EXTRACTED"
    | "CLASSIFICATION_PERFORMED"
    | "VALIDATION_STARTED"
    | "VALIDATION_PASSED"
    | "VALIDATION_FAILED"
    | "NORMALIZATION_COMPLETED"
    | "ATOM_CREATED"
    | "INGESTION_COMPLETED"
    | "INGESTION_FAILED";
  
  agentId: string;
  
  input?: {
    fileName?: string;
    sourceType?: string;
    rowIndex?: number;
    sectionTitle?: string;
    rawValue?: unknown;
  };
  
  output?: {
    detectedFormat?: string;
    mappedField?: string;
    extractedValue?: unknown;
    confidence?: number;
    atomId?: string;
  };
  
  llmContext?: {
    model: string;
    promptTemplate: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    reasoning?: string;
  };
  
  decision?: {
    action: string;
    reasoning: string;
    alternatives?: string[];
    confidence: number;
  };
  
  contentHash: string;
  previousHash: string;
}
```

---

## Part 2: Runtime Agent Layer (PSUR Compilation)

### 2.1 Agent Taxonomy

```
PSURCompilationOrchestrator
    |
    +-- TemplateInterpreterAgent
    |       Parses template, determines slot requirements
    |
    +-- EvidenceSelectionAgents (Per Slot)
    |       |-- NarrativeEvidenceAgent
    |       |-- TableEvidenceAgent
    |       |-- MetricEvidenceAgent
    |
    +-- ContentGenerationAgents
    |       |-- NarrativeWriterAgent
    |       |-- TableFormatterAgent
    |       |-- SummaryGeneratorAgent
    |       |-- ConclusionWriterAgent
    |
    +-- ValidationAgents
    |       |-- CompletenessValidatorAgent
    |       |-- ConsistencyValidatorAgent
    |       |-- RegulatoryComplianceAgent
    |       |-- CrossReferenceValidatorAgent
    |
    +-- QualityAssuranceAgent
    |       Final review before output
    |
    +-- TraceGapResolutionAgent
            Handles missing evidence scenarios
```

### 2.2 Ephemeral Agent Lifecycle

```
1. SPAWN
   - Agent instantiated with context (psurCaseId, slotId, etc.)
   - Registers with orchestrator
   - Receives task parameters

2. INITIALIZE
   - Loads relevant evidence atoms
   - Retrieves template requirements
   - Establishes trace context

3. EXECUTE
   - Performs primary task
   - May invoke sub-agents
   - Logs all decisions to trace

4. VALIDATE
   - Self-validates output
   - Checks against requirements
   - Reports confidence score

5. HANDOFF
   - Passes output to next agent/step
   - Finalizes trace events
   - Reports completion status

6. TERMINATE
   - Releases resources
   - Archives execution context
   - Agent instance destroyed
```

### 2.3 Agent Specifications

#### 2.3.1 NarrativeWriterAgent

**Purpose**: Generate narrative content for PSUR slots based on evidence

**Execution Flow**:

```
1. Receive slot context
   - slot_id, title, required_types
   - evidence atoms (filtered by type)
   - template guidance text

2. Analyze evidence
   - Count records by category
   - Identify trends, patterns
   - Note any anomalies or gaps

3. Generate narrative (LLM)
   - Use template-specific prompt
   - Include all evidence references
   - Maintain regulatory tone

4. Validate output
   - Check evidence citations
   - Verify factual accuracy
   - Ensure completeness

5. Return with trace
```

**LLM Prompt Template**:

```typescript
const NARRATIVE_GENERATION_PROMPT = `
You are writing a section of a Periodic Safety Update Report (PSUR) 
for a medical device under EU MDR regulations.

## Section: {slotTitle}
## Template Guidance: {templateGuidance}

## Evidence Summary:
{evidenceSummary}

## Detailed Evidence Records:
{evidenceRecords}

## Requirements:
- Write in formal regulatory tone
- Reference all evidence by atom ID
- Include specific numbers and dates
- State conclusions based only on provided evidence
- If evidence is missing, explicitly state what is unavailable

## Output Format:
Write the narrative section content. Include inline citations like [ATOM-xxx].
At the end, provide a JSON block with:
{
  "citedAtoms": ["ATOM-xxx", ...],
  "uncitedAtoms": ["ATOM-yyy", ...],
  "dataGaps": ["description of missing data", ...],
  "confidence": 0.0-1.0,
  "reasoning": "explanation of content decisions"
}
`;
```

**Trace Events**:
- `NARRATIVE_AGENT_SPAWNED`
- `EVIDENCE_LOADED`
- `EVIDENCE_ANALYZED`
- `LLM_GENERATION_STARTED`
- `LLM_GENERATION_COMPLETED`
- `NARRATIVE_VALIDATED`
- `CITATION_VERIFIED`
- `NARRATIVE_AGENT_COMPLETED`

---

#### 2.3.2 TraceGapResolutionAgent

**Purpose**: Handle scenarios where required evidence is missing

**Resolution Strategies**:

```
Strategy 1: NEGATIVE_EVIDENCE
    - No complaints exist for period
    - Create negative evidence atom
    - Generate "None reported" statement

Strategy 2: PARTIAL_EVIDENCE
    - Some evidence exists but incomplete
    - Document what is available
    - Flag gaps explicitly

Strategy 3: ALTERNATIVE_EVIDENCE
    - Primary source unavailable
    - Identify alternative sources
    - Document substitution

Strategy 4: JUSTIFICATION
    - Evidence genuinely unavailable
    - Generate regulatory justification
    - Document why gap is acceptable

Strategy 5: ESCALATION
    - Critical evidence missing
    - Cannot proceed without
    - Escalate to user for resolution
```

**Decision Tree**:

```
Is evidence type required for this slot?
    |
    +-- NO: Skip, mark as optional
    |
    +-- YES: Check evidence atoms
            |
            +-- Atoms exist: Use them
            |
            +-- No atoms, negative evidence exists: Use negative
            |
            +-- No atoms, no negative: Check if zero is valid
                    |
                    +-- Zero valid (e.g., no FSCAs): Create negative
                    |
                    +-- Zero invalid (e.g., must have sales): 
                            |
                            +-- Check alternatives
                            |
                            +-- No alternatives: ESCALATE
```

---

#### 2.3.3 RegulatoryComplianceAgent

**Purpose**: Validate PSUR content against regulatory requirements

**Validation Rules**:

```typescript
interface ComplianceRule {
  ruleId: string;
  regulation: "EU_MDR" | "UK_MDR" | "FDA_21CFR";
  article?: string;                    // e.g., "Article 86"
  requirement: string;
  severity: "BLOCKING" | "WARNING" | "INFO";
  
  validate(
    content: PSURContent,
    evidence: EvidenceAtom[]
  ): ComplianceResult;
}

const COMPLIANCE_RULES: ComplianceRule[] = [
  {
    ruleId: "MDR-86-1",
    regulation: "EU_MDR",
    article: "Article 86",
    requirement: "PSUR must cover reporting period completely",
    severity: "BLOCKING",
    validate: (content, evidence) => {
      // Check period coverage
    }
  },
  {
    ruleId: "MDR-86-2", 
    regulation: "EU_MDR",
    requirement: "All serious incidents must be reported",
    severity: "BLOCKING",
    validate: (content, evidence) => {
      // Cross-reference incidents
    }
  },
  {
    ruleId: "MDR-ANNEX-III",
    regulation: "EU_MDR",
    requirement: "Benefit-risk conclusion required",
    severity: "BLOCKING",
    validate: (content, evidence) => {
      // Check for B/R section
    }
  },
  // ... more rules
];
```

---

### 2.4 Agent Communication Protocol

```typescript
interface AgentMessage {
  messageId: string;
  timestamp: string;
  
  from: {
    agentId: string;
    agentType: string;
  };
  
  to: {
    agentId: string;
    agentType: string;
  };
  
  type: 
    | "TASK_ASSIGNMENT"
    | "TASK_COMPLETION"
    | "DATA_REQUEST"
    | "DATA_RESPONSE"
    | "VALIDATION_REQUEST"
    | "VALIDATION_RESPONSE"
    | "ESCALATION"
    | "DECISION_REQUIRED"
    | "STATUS_UPDATE";
  
  payload: unknown;
  
  context: {
    psurCaseId: number;
    traceId: string;
    correlationId: string;           // Links related messages
  };
}
```

---

### 2.5 Trace Schema for Runtime Agents

```typescript
interface RuntimeAgentTraceEvent {
  eventId: string;
  traceId: string;
  psurCaseId: number;
  timestamp: string;
  
  eventType:
    | "ORCHESTRATOR_STARTED"
    | "AGENT_SPAWNED"
    | "AGENT_INITIALIZED"
    | "TASK_RECEIVED"
    | "EVIDENCE_QUERY_STARTED"
    | "EVIDENCE_QUERY_COMPLETED"
    | "LLM_INVOKED"
    | "LLM_RESPONSE_RECEIVED"
    | "CONTENT_GENERATED"
    | "VALIDATION_STARTED"
    | "VALIDATION_PASSED"
    | "VALIDATION_FAILED"
    | "COMPLIANCE_CHECK_STARTED"
    | "COMPLIANCE_RULE_EVALUATED"
    | "COMPLIANCE_CHECK_COMPLETED"
    | "TRACE_GAP_DETECTED"
    | "TRACE_GAP_RESOLVED"
    | "DECISION_MADE"
    | "ESCALATION_TRIGGERED"
    | "AGENT_HANDOFF"
    | "AGENT_COMPLETED"
    | "AGENT_FAILED"
    | "ORCHESTRATOR_COMPLETED";
  
  agentId: string;
  agentType: string;
  
  slotContext?: {
    slotId: string;
    slotTitle: string;
    requiredTypes: string[];
  };
  
  evidenceContext?: {
    queriedTypes: string[];
    atomCount: number;
    atomIds: string[];
  };
  
  llmContext?: {
    model: string;
    promptTemplate: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    temperature: number;
  };
  
  decision?: {
    decisionType: string;
    options: Array<{
      option: string;
      score: number;
      reasoning: string;
    }>;
    selected: string;
    confidence: number;
    reasoning: string;
  };
  
  validation?: {
    validationType: string;
    passed: boolean;
    errors: string[];
    warnings: string[];
  };
  
  contentHash: string;
  previousHash: string;
}
```

---

## Part 3: Traceability Architecture

### 3.1 Unified Trace Chain

All agent activity flows into a single, hash-verified trace chain:

```
[WORKFLOW_STARTED]
    |
    +-- [INGESTION_TRACE_CHAIN]
    |       Format detection
    |       Parsing
    |       Extraction (per file)
    |       Mapping resolution
    |       Normalization
    |       Atom creation
    |
    +-- [RUNTIME_TRACE_CHAIN]
    |       Template interpretation
    |       Slot processing (per slot)
    |           Evidence selection
    |           Content generation
    |           Validation
    |       Compliance checking
    |       Document rendering
    |
    +-- [EXPORT_TRACE_CHAIN]
            Bundle assembly
            Signature generation
            
[WORKFLOW_COMPLETED]
```

### 3.2 Trace Queryability

```typescript
// Query all LLM invocations for a case
GET /api/psur-cases/{id}/trace/entries?eventTypes=LLM_INVOKED,LLM_RESPONSE_RECEIVED

// Query all decisions for a specific slot
GET /api/psur-cases/{id}/trace/slots/{slotId}?eventTypes=DECISION_MADE

// Query all validation failures
GET /api/psur-cases/{id}/trace/entries?eventTypes=VALIDATION_FAILED

// Query agent activity timeline
GET /api/psur-cases/{id}/trace/agents/{agentId}/timeline

// Verify chain integrity
GET /api/psur-cases/{id}/trace/verify
```

### 3.3 Audit Report Generation

The trace chain enables automatic audit report generation:

```
PSUR Audit Report
=================

1. Document Ingestion Summary
   - Files processed: 12
   - Evidence atoms created: 156
   - LLM invocations: 34
   - Field mappings: 89 auto, 7 manual

2. Evidence Selection Summary
   - Total atoms available: 156
   - Atoms used in PSUR: 142
   - Unused atoms: 14 (reasons documented)

3. Content Generation Summary
   - Narrative sections: 12
   - Tables generated: 8
   - LLM invocations: 28
   - Average confidence: 0.87

4. Validation Summary
   - Compliance rules checked: 45
   - Rules passed: 43
   - Warnings: 2
   - Trace gaps resolved: 3

5. Decision Audit Trail
   [Full list of all decisions with reasoning]

6. Chain Integrity
   - Total events: 523
   - Chain valid: YES
   - First hash: abc123...
   - Final hash: xyz789...
```

---

## Part 4: Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Implement base Agent class with trace integration
- [ ] Create AgentOrchestrator framework
- [ ] Set up agent message bus
- [ ] Extend trace schema for agent events

### Phase 2: Ingestion Agents (Weeks 3-4)
- [ ] FormatDetectionAgent
- [ ] ParserAgents (Excel, CSV, DOCX, PDF, JSON)
- [ ] MappingResolutionAgent with LLM fallback
- [ ] NormalizationAgent
- [ ] ValidationAgent

### Phase 3: Extraction Agents (Weeks 5-6)
- [ ] ComplaintsExtractionAgent
- [ ] SalesExtractionAgent
- [ ] FSCAExtractionAgent
- [ ] CAPAExtractionAgent
- [ ] PMCFExtractionAgent
- [ ] LiteratureExtractionAgent

### Phase 4: Runtime Agents (Weeks 7-8)
- [ ] TemplateInterpreterAgent
- [ ] NarrativeWriterAgent
- [ ] TableFormatterAgent
- [ ] SummaryGeneratorAgent

### Phase 5: Validation Agents (Weeks 9-10)
- [ ] CompletenessValidatorAgent
- [ ] ConsistencyValidatorAgent
- [ ] RegulatoryComplianceAgent
- [ ] TraceGapResolutionAgent
- [ ] QualityAssuranceAgent

### Phase 6: Integration & Testing (Weeks 11-12)
- [ ] End-to-end workflow testing
- [ ] Trace verification testing
- [ ] Performance optimization
- [ ] Documentation

---

## Part 5: Technology Stack

### LLM Integration
- **Primary**: OpenAI GPT-4 / GPT-4-turbo
- **Fallback**: Claude 3.5 Sonnet
- **Local Option**: Llama 3 (for sensitive data)

### Agent Framework
- **Language**: TypeScript
- **Runtime**: Node.js with worker threads
- **Message Queue**: In-memory for simplicity, Redis for scale

### Traceability
- **Storage**: PostgreSQL (existing `decision_trace_entries` table)
- **Hash Algorithm**: SHA-256
- **Export Format**: JSONL with hash chain

### Embeddings (for semantic matching)
- **Model**: OpenAI text-embedding-3-small
- **Storage**: pgvector extension

---

## Appendix A: Agent Configuration Schema

```typescript
interface AgentConfig {
  agentType: string;
  version: string;
  
  llm: {
    provider: "openai" | "anthropic" | "local";
    model: string;
    temperature: number;
    maxTokens: number;
    timeout: number;
  };
  
  extraction: {
    confidenceThreshold: number;
    maxRetries: number;
    batchSize: number;
  };
  
  validation: {
    strictMode: boolean;
    allowPartialResults: boolean;
  };
  
  tracing: {
    verbosity: "minimal" | "standard" | "verbose";
    includeRawLLMOutput: boolean;
    includeEmbeddings: boolean;
  };
}
```

## Appendix B: Error Handling

```typescript
interface AgentError {
  errorId: string;
  agentId: string;
  timestamp: string;
  
  type:
    | "PARSING_ERROR"
    | "EXTRACTION_ERROR"
    | "LLM_ERROR"
    | "VALIDATION_ERROR"
    | "TIMEOUT_ERROR"
    | "RESOURCE_ERROR";
  
  severity: "RECOVERABLE" | "BLOCKING" | "FATAL";
  
  context: {
    operation: string;
    input?: unknown;
    partialOutput?: unknown;
  };
  
  recovery: {
    attempted: boolean;
    strategy?: string;
    success?: boolean;
  };
  
  message: string;
  stack?: string;
}
```

---

*Document Version: 1.0*
*Last Updated: 2026-01-13*
*Author: RegulatoryOS AI Architecture Team*
