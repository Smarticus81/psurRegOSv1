# AI Agent Architecture - Visual Diagrams

## 1. High-Level System Overview

```
+===========================================================================+
|                         PSUR GENERATION SYSTEM                             |
+===========================================================================+
|                                                                            |
|   +---------------------------+      +---------------------------+         |
|   |   DOCUMENT INGESTION      |      |   PSUR RUNTIME            |         |
|   |   AGENT LAYER             |      |   AGENT LAYER             |         |
|   |                           |      |                           |         |
|   |  +---------------------+  |      |  +---------------------+  |         |
|   |  | FormatDetection     |  |      |  | TemplateInterpreter |  |         |
|   |  +---------------------+  |      |  +---------------------+  |         |
|   |           |               |      |           |               |         |
|   |           v               |      |           v               |         |
|   |  +---------------------+  |      |  +---------------------+  |         |
|   |  | Parser Agents       |  |      |  | Evidence Selection  |  |         |
|   |  | (Excel/CSV/DOCX/PDF)|  |      |  | Agents              |  |         |
|   |  +---------------------+  |      |  +---------------------+  |         |
|   |           |               |      |           |               |         |
|   |           v               |      |           v               |         |
|   |  +---------------------+  |      |  +---------------------+  |         |
|   |  | Extraction Agents   |  |      |  | Content Generation  |  |         |
|   |  | (Domain-Specific)   |  |      |  | Agents              |  |         |
|   |  +---------------------+  |      |  +---------------------+  |         |
|   |           |               |      |           |               |         |
|   |           v               |      |           v               |         |
|   |  +---------------------+  |      |  +---------------------+  |         |
|   |  | Mapping Resolution  |  |      |  | Validation Agents   |  |         |
|   |  | Agent               |  |      |  +---------------------+  |         |
|   |  +---------------------+  |      |           |               |         |
|   |           |               |      |           v               |         |
|   |           v               |      |  +---------------------+  |         |
|   |  +---------------------+  |      |  | QA Agent            |  |         |
|   |  | Validation Agent    |  |      |  +---------------------+  |         |
|   |  +---------------------+  |      |                           |         |
|   +---------------------------+      +---------------------------+         |
|               |                                   |                        |
|               v                                   v                        |
|   +---------------------------------------------------------------+       |
|   |                    EVIDENCE ATOMS DATABASE                     |       |
|   +---------------------------------------------------------------+       |
|               |                                   |                        |
|               v                                   v                        |
|   +---------------------------------------------------------------+       |
|   |              DECISION TRACE CHAIN (Hash-Verified)              |       |
|   |                                                                |       |
|   |  [EVENT-1] -> [EVENT-2] -> [EVENT-3] -> ... -> [EVENT-N]      |       |
|   |    hash1       hash2       hash3               hashN           |       |
|   +---------------------------------------------------------------+       |
|                                                                            |
+============================================================================+
```

## 2. Document Ingestion Agent Flow

```
                            +----------------+
                            |  Upload File   |
                            +----------------+
                                    |
                                    v
                     +-----------------------------+
                     |   FormatDetectionAgent      |
                     |   - Detect file type        |
                     |   - Analyze structure       |
                     |   - Select parser           |
                     +-----------------------------+
                                    |
                  +-----------------+-----------------+
                  |                 |                 |
                  v                 v                 v
          +-------------+   +-------------+   +-------------+
          |ExcelParser  |   |DOCXParser   |   |PDFParser    |
          |Agent        |   |Agent        |   |Agent        |
          +-------------+   +-------------+   +-------------+
                  |                 |                 |
                  +-----------------+-----------------+
                                    |
                                    v
                     +-----------------------------+
                     |   ExtractionAgent           |
                     |   (Domain-Specific)         |
                     |                             |
                     |   Complaints | Sales | FSCA |
                     |   CAPA | PMCF | Literature  |
                     +-----------------------------+
                                    |
                     +--------------+--------------+
                     |                             |
                     v                             v
          +-------------------+        +-------------------+
          | Auto-Mapping      |        | LLM-Assisted      |
          | (High Confidence) |        | Mapping           |
          +-------------------+        +-------------------+
                     |                             |
                     +--------------+--------------+
                                    |
                                    v
                     +-----------------------------+
                     |   MappingResolutionAgent    |
                     |   - Resolve ambiguities     |
                     |   - User confirmation       |
                     +-----------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |   NormalizationAgent        |
                     |   - Standardize format      |
                     |   - Apply schema            |
                     +-----------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |   ValidationAgent           |
                     |   - Check completeness      |
                     |   - Verify consistency      |
                     +-----------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |   CREATE EVIDENCE ATOMS     |
                     |   - Store in database       |
                     |   - Log to trace chain      |
                     +-----------------------------+
```

## 3. Runtime Agent Flow (PSUR Compilation)

```
                     +-----------------------------+
                     |   Start PSUR Compilation    |
                     +-----------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |   TemplateInterpreterAgent  |
                     |   - Parse template JSON     |
                     |   - Extract slot queue      |
                     |   - Determine dependencies  |
                     +-----------------------------+
                                    |
                                    v
              +---------------------------------------------+
              |         FOR EACH SLOT IN TEMPLATE           |
              +---------------------------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |   SPAWN: Ephemeral Agent    |
                     |   (Based on slot_kind)      |
                     +-----------------------------+
                                    |
             +----------------------+----------------------+
             |                      |                      |
             v                      v                      v
    +-----------------+   +-----------------+   +-----------------+
    |NarrativeWriter  |   |TableFormatter   |   |MetricCalculator |
    |Agent            |   |Agent            |   |Agent            |
    +-----------------+   +-----------------+   +-----------------+
             |                      |                      |
             +----------------------+----------------------+
                                    |
                                    v
                     +-----------------------------+
                     |   EvidenceSelectionAgent    |
                     |   - Query evidence atoms    |
                     |   - Filter by requirements  |
                     |   - Score relevance         |
                     +-----------------------------+
                                    |
                          +--------+--------+
                          |                 |
                          v                 v
              +----------------+    +----------------+
              | Evidence Found |    | No Evidence    |
              +----------------+    +----------------+
                          |                 |
                          |                 v
                          |    +------------------------+
                          |    | TraceGapResolution     |
                          |    | Agent                  |
                          |    | - Check negative evid. |
                          |    | - Create justification |
                          |    | - Escalate if needed   |
                          |    +------------------------+
                          |                 |
                          +-----------------+
                                    |
                                    v
                     +-----------------------------+
                     |   ContentGenerationAgent    |
                     |   - Generate text/tables    |
                     |   - Cite evidence atoms     |
                     |   - Apply regulatory tone   |
                     +-----------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |   ValidationAgent           |
                     |   - Check citations         |
                     |   - Verify completeness     |
                     |   - Score confidence        |
                     +-----------------------------+
                                    |
                          +--------+--------+
                          |                 |
                          v                 v
              +----------------+    +----------------+
              | Validation     |    | Validation     |
              | PASSED         |    | FAILED         |
              +----------------+    +----------------+
                          |                 |
                          |                 v
                          |    +------------------------+
                          |    | Retry / Escalate       |
                          |    +------------------------+
                          |                 |
                          +-----------------+
                                    |
                                    v
                     +-----------------------------+
                     |   AGENT TERMINATES          |
                     |   - Output to slot          |
                     |   - Log completion          |
                     +-----------------------------+
                                    |
                                    v
              +---------------------------------------------+
              |              END FOR EACH SLOT              |
              +---------------------------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |   RegulatoryComplianceAgent |
                     |   - Check all rules         |
                     |   - Generate warnings       |
                     +-----------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |   QualityAssuranceAgent     |
                     |   - Final review            |
                     |   - Cross-reference check   |
                     +-----------------------------+
                                    |
                                    v
                     +-----------------------------+
                     |   RENDER PSUR DOCUMENT      |
                     |   - Markdown                |
                     |   - DOCX                    |
                     +-----------------------------+
```

## 4. Trace Chain Structure

```
+============================================================================+
|                           TRACE CHAIN EXAMPLE                               |
+============================================================================+

Entry 1: WORKFLOW_STARTED
+------------------------------------------+
| eventId: "evt-001"                       |
| timestamp: "2026-01-13T10:00:00Z"        |
| eventType: "WORKFLOW_STARTED"            |
| actor: "Orchestrator"                    |
| decision: "INFO"                         |
| contentHash: "abc123..."                 |
| previousHash: null                       |
+------------------------------------------+
                    |
                    v
Entry 2: INGESTION_STARTED
+------------------------------------------+
| eventId: "evt-002"                       |
| eventType: "INGESTION_STARTED"           |
| agentId: "FormatDetectionAgent-001"      |
| input: { fileName: "complaints.xlsx" }   |
| contentHash: "def456..."                 |
| previousHash: "abc123..."                | <-- Links to Entry 1
+------------------------------------------+
                    |
                    v
Entry 3: FORMAT_DETECTED
+------------------------------------------+
| eventId: "evt-003"                       |
| eventType: "FORMAT_DETECTED"             |
| agentId: "FormatDetectionAgent-001"      |
| output: {                                |
|   format: "excel",                       |
|   confidence: 0.99,                      |
|   structure: { type: "tabular" }         |
| }                                        |
| contentHash: "ghi789..."                 |
| previousHash: "def456..."                | <-- Links to Entry 2
+------------------------------------------+
                    |
                    v
Entry 4: LLM_INVOKED
+------------------------------------------+
| eventId: "evt-004"                       |
| eventType: "LLM_INVOKED"                 |
| agentId: "ComplaintsExtractionAgent-001" |
| llmContext: {                            |
|   model: "gpt-4o",                       |
|   promptTemplate: "SEVERITY_CLASSIFY",   |
|   inputTokens: 450,                      |
|   outputTokens: 120,                     |
|   latencyMs: 1240                        |
| }                                        |
| input: { description: "Device..." }      |
| contentHash: "jkl012..."                 |
| previousHash: "ghi789..."                |
+------------------------------------------+
                    |
                    v
Entry 5: LLM_RESPONSE_RECEIVED
+------------------------------------------+
| eventId: "evt-005"                       |
| eventType: "LLM_RESPONSE_RECEIVED"       |
| agentId: "ComplaintsExtractionAgent-001" |
| output: {                                |
|   severity: "MEDIUM",                    |
|   reasoning: "Device malfunction...",    |
|   isAdverseEvent: false,                 |
|   confidence: 0.87                       |
| }                                        |
| decision: {                              |
|   action: "CLASSIFY_SEVERITY",           |
|   selected: "MEDIUM",                    |
|   reasoning: "Based on description...",  |
|   confidence: 0.87                       |
| }                                        |
| contentHash: "mno345..."                 |
| previousHash: "jkl012..."                |
+------------------------------------------+
                    |
                    v
                   ...
                    |
                    v
Entry N: WORKFLOW_COMPLETED
+------------------------------------------+
| eventId: "evt-523"                       |
| eventType: "WORKFLOW_COMPLETED"          |
| actor: "Orchestrator"                    |
| decision: "PASS"                         |
| output: {                                |
|   psurGenerated: true,                   |
|   totalSlots: 45,                        |
|   slotsCompleted: 45,                    |
|   complianceScore: 0.98                  |
| }                                        |
| contentHash: "xyz999..."                 |
| previousHash: "..."                      |
+------------------------------------------+

CHAIN VERIFICATION:
===================
For each entry E[i] where i > 1:
  VERIFY that E[i].previousHash == E[i-1].contentHash

If all verifications pass: CHAIN VALID
If any verification fails: CHAIN TAMPERED
```

## 5. LLM Decision Traceability

```
+============================================================================+
|                    LLM DECISION AUDIT EXAMPLE                               |
+============================================================================+

DECISION: Classify complaint severity

+---------------------------+
|    INPUT CONTEXT          |
+---------------------------+
| Complaint ID: C-2024-001  |
| Description:              |
| "Patient reported device  |
|  malfunction during use.  |
|  No injury occurred."     |
| Device: JS3000X           |
| Date: 2024-03-15          |
+---------------------------+
            |
            v
+---------------------------+
|    LLM INVOCATION         |
+---------------------------+
| Model: gpt-4o             |
| Temperature: 0.1          |
| Prompt: SEVERITY_CLASSIFY |
| Tokens In: 423            |
| Tokens Out: 156           |
| Latency: 1.2s             |
+---------------------------+
            |
            v
+---------------------------+
|    LLM RESPONSE           |
+---------------------------+
| {                         |
|   "severity": "LOW",      |
|   "reasoning": "Device    |
|     malfunction occurred  |
|     but no patient injury |
|     was reported. No      |
|     medical intervention  |
|     was required.",       |
|   "isAdverseEvent": false,|
|   "isSeriousIncident":    |
|     false,                |
|   "confidence": 0.91      |
| }                         |
+---------------------------+
            |
            v
+---------------------------+
|    DECISION LOGGED        |
+---------------------------+
| Action: SEVERITY_ASSIGNED |
| Options Considered:       |
| - CRITICAL: 0.02          |
| - HIGH: 0.05              |
| - MEDIUM: 0.12            |
| - LOW: 0.91 (SELECTED)    |
| - INFO: 0.08              |
|                           |
| Reasoning: "Device        |
|  malfunction with no      |
|  injury = LOW severity"   |
|                           |
| Hash: "abc123..."         |
+---------------------------+
            |
            v
+---------------------------+
|    TRACEABLE FOREVER      |
+---------------------------+
| This decision is:         |
| - Queryable by case ID    |
| - Queryable by complaint  |
| - Included in audit trail |
| - Hash-verified           |
| - Exportable to JSONL     |
+---------------------------+
```

## 6. Agent Communication Sequence

```
+============================================================================+
|          AGENT COMMUNICATION - SLOT PROCESSING EXAMPLE                      |
+============================================================================+

Orchestrator          EvidenceAgent         NarrativeAgent       ValidationAgent
     |                      |                      |                      |
     |  TASK_ASSIGNMENT     |                      |                      |
     |--------------------->|                      |                      |
     |  {slot: "SEC-5.1",   |                      |                      |
     |   types: ["complaint_record"]}              |                      |
     |                      |                      |                      |
     |                      | (Query DB)           |                      |
     |                      |                      |                      |
     |   DATA_RESPONSE      |                      |                      |
     |<---------------------|                      |                      |
     |  {atoms: [...],      |                      |                      |
     |   count: 45}         |                      |                      |
     |                      |                      |                      |
     |  TASK_ASSIGNMENT     |                      |                      |
     |-------------------------------------------->|                      |
     |  {slot: "SEC-5.1",   |                      |                      |
     |   atoms: [...],      |                      |                      |
     |   template: "..."}   |                      |                      |
     |                      |                      |                      |
     |                      |                      | (Invoke LLM)         |
     |                      |                      |                      |
     |                      |                      | (Generate Content)   |
     |                      |                      |                      |
     |                      |   VALIDATION_REQUEST |                      |
     |                      |<---------------------|                      |
     |                      |  {content: "...",    |                      |
     |                      |   citations: [...]}  |                      |
     |                      |                      |                      |
     |                      |   VALIDATION_REQUEST |                      |
     |                      |-------------------------------------------->|
     |                      |                      |                      |
     |                      |                      |  (Check citations)   |
     |                      |                      |  (Verify facts)      |
     |                      |                      |                      |
     |                      |  VALIDATION_RESPONSE |                      |
     |                      |<--------------------------------------------|
     |                      |  {valid: true,       |                      |
     |                      |   warnings: [...]}   |                      |
     |                      |                      |                      |
     |   TASK_COMPLETION    |                      |                      |
     |<--------------------------------------------|                      |
     |  {slot: "SEC-5.1",   |                      |                      |
     |   content: "...",    |                      |                      |
     |   confidence: 0.89}  |                      |                      |
     |                      |                      |                      |
     v                      v                      v                      v
```

---

*These diagrams provide visual representation of the AI Agent Architecture.*
*See AI_AGENT_ARCHITECTURE.md for detailed specifications.*
