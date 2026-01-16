# AI Agent Architecture - Quick Reference

## Agent Inventory

### Document Ingestion Agents (Persistent)

| Agent | Purpose | LLM Usage | Key Trace Events |
|-------|---------|-----------|------------------|
| **FormatDetectionAgent** | Detect file type, structure, encoding | None | `FORMAT_DETECTED`, `PARSER_RECOMMENDED` |
| **ExcelParserAgent** | Parse .xlsx/.xls files | None | `PARSING_STARTED`, `PARSING_COMPLETED` |
| **CSVParserAgent** | Parse .csv files | None | `PARSING_STARTED`, `PARSING_COMPLETED` |
| **DOCXParserAgent** | Parse Word documents | Optional (section classification) | `PARSING_STARTED`, `SECTION_DETECTED` |
| **PDFParserAgent** | Parse PDF documents | Optional (OCR, table detection) | `PARSING_STARTED`, `TABLE_EXTRACTED` |
| **JSONParserAgent** | Parse JSON files | None | `PARSING_STARTED`, `PARSING_COMPLETED` |
| **ComplaintsExtractionAgent** | Extract complaint records | Yes (severity classification) | `RECORD_EXTRACTED`, `SEVERITY_CLASSIFIED` |
| **SalesExtractionAgent** | Extract sales/distribution data | None | `RECORD_EXTRACTED`, `REGION_MAPPED` |
| **FSCAExtractionAgent** | Extract FSCA records | Yes (action classification) | `RECORD_EXTRACTED`, `ACTION_CLASSIFIED` |
| **CAPAExtractionAgent** | Extract CAPA records | Yes (effectiveness assessment) | `RECORD_EXTRACTED`, `EFFECTIVENESS_SCORED` |
| **PMCFExtractionAgent** | Extract PMCF study data | Yes (study classification) | `STUDY_EXTRACTED`, `FINDINGS_SUMMARIZED` |
| **LiteratureExtractionAgent** | Extract literature references | Yes (relevance scoring) | `ARTICLE_EXTRACTED`, `RELEVANCE_SCORED` |
| **IncidentExtractionAgent** | Extract serious incident data | Yes (severity, causality) | `INCIDENT_EXTRACTED`, `CAUSALITY_ASSESSED` |
| **MappingResolutionAgent** | Resolve column/field mappings | Yes (ambiguity resolution) | `MAPPING_SUGGESTED`, `MAPPING_CONFIRMED` |
| **NormalizationAgent** | Standardize data to schema | None | `NORMALIZATION_COMPLETED` |
| **ValidationAgent** | Validate extracted data | None | `VALIDATION_PASSED`, `VALIDATION_FAILED` |

### Runtime Agents (Ephemeral)

| Agent | Purpose | LLM Usage | Key Trace Events |
|-------|---------|-----------|------------------|
| **TemplateInterpreterAgent** | Parse template, extract requirements | None | `TEMPLATE_PARSED`, `SLOTS_QUEUED` |
| **NarrativeWriterAgent** | Generate narrative content | Yes (primary function) | `NARRATIVE_GENERATED`, `CITATIONS_ADDED` |
| **TableFormatterAgent** | Generate data tables | Minimal (column naming) | `TABLE_GENERATED`, `DATA_FORMATTED` |
| **MetricCalculatorAgent** | Calculate safety metrics | None | `METRIC_CALCULATED`, `TREND_ANALYZED` |
| **SummaryGeneratorAgent** | Generate section summaries | Yes (summarization) | `SUMMARY_GENERATED` |
| **ConclusionWriterAgent** | Generate conclusions | Yes (synthesis) | `CONCLUSION_GENERATED`, `RECOMMENDATION_MADE` |
| **CompletenessValidatorAgent** | Check slot completeness | None | `COMPLETENESS_CHECKED` |
| **ConsistencyValidatorAgent** | Check cross-slot consistency | Minimal (comparison) | `CONSISTENCY_CHECKED` |
| **RegulatoryComplianceAgent** | Validate regulatory requirements | None (rule-based) | `COMPLIANCE_RULE_EVALUATED` |
| **TraceGapResolutionAgent** | Handle missing evidence | Yes (justification generation) | `GAP_DETECTED`, `GAP_RESOLVED` |
| **QualityAssuranceAgent** | Final quality review | Yes (comprehensive review) | `QA_PASSED`, `QA_FLAGGED` |

---

## LLM Usage Summary

### High LLM Usage Agents

| Agent | LLM Purpose | Prompt Templates |
|-------|-------------|------------------|
| NarrativeWriterAgent | Generate regulatory narrative | `NARRATIVE_GENERATION` |
| ComplaintsExtractionAgent | Classify severity, detect adverse events | `SEVERITY_CLASSIFICATION`, `ADVERSE_EVENT_DETECTION` |
| ConclusionWriterAgent | Synthesize benefit-risk conclusion | `CONCLUSION_SYNTHESIS` |
| TraceGapResolutionAgent | Generate justifications | `GAP_JUSTIFICATION` |

### Moderate LLM Usage Agents

| Agent | LLM Purpose | Prompt Templates |
|-------|-------------|------------------|
| MappingResolutionAgent | Resolve ambiguous column mappings | `FIELD_MAPPING_RESOLUTION` |
| PMCFExtractionAgent | Classify study types, summarize findings | `STUDY_CLASSIFICATION` |
| LiteratureExtractionAgent | Score relevance, extract key findings | `RELEVANCE_SCORING` |

### No LLM Usage Agents

- FormatDetectionAgent (rule-based file analysis)
- All Parser Agents (deterministic parsing)
- SalesExtractionAgent (structured data mapping)
- NormalizationAgent (schema transformation)
- ValidationAgent (rule-based validation)
- MetricCalculatorAgent (mathematical operations)
- RegulatoryComplianceAgent (rule-based compliance checking)

---

## Traceability Events Reference

### Ingestion Events

```
INGESTION_STARTED           - File upload begins
FORMAT_DETECTED             - File type identified
PARSER_SELECTED             - Parser agent chosen
PARSING_STARTED             - Parsing begins
PARSING_COMPLETED           - Parsing finished
EXTRACTION_AGENT_INVOKED    - Domain agent started
FIELD_MAPPING_STARTED       - Column mapping begins
FIELD_MAPPING_RESOLVED      - Mapping confirmed
LLM_INVOKED                 - LLM call initiated
LLM_RESPONSE_RECEIVED       - LLM response received
RECORD_EXTRACTED            - Single record extracted
CLASSIFICATION_PERFORMED    - LLM classification done
VALIDATION_STARTED          - Validation begins
VALIDATION_PASSED           - Validation successful
VALIDATION_FAILED           - Validation errors
NORMALIZATION_COMPLETED     - Data normalized
ATOM_CREATED                - Evidence atom stored
INGESTION_COMPLETED         - File processing complete
INGESTION_FAILED            - Processing failed
```

### Runtime Events

```
ORCHESTRATOR_STARTED        - PSUR compilation begins
TEMPLATE_PARSED             - Template loaded
AGENT_SPAWNED               - Ephemeral agent created
AGENT_INITIALIZED           - Agent ready
TASK_RECEIVED               - Agent got assignment
EVIDENCE_QUERY_STARTED      - DB query initiated
EVIDENCE_QUERY_COMPLETED    - Atoms retrieved
LLM_INVOKED                 - LLM call for content
LLM_RESPONSE_RECEIVED       - Content received
CONTENT_GENERATED           - Slot content ready
VALIDATION_STARTED          - Content validation
VALIDATION_PASSED           - Content valid
VALIDATION_FAILED           - Content invalid
COMPLIANCE_RULE_EVALUATED   - Rule checked
TRACE_GAP_DETECTED          - Missing evidence
TRACE_GAP_RESOLVED          - Gap handled
DECISION_MADE               - Agent decision logged
AGENT_HANDOFF               - Output passed
AGENT_COMPLETED             - Agent finished
AGENT_FAILED                - Agent error
ORCHESTRATOR_COMPLETED      - PSUR complete
```

---

## Confidence Thresholds

| Threshold | Value | Action |
|-----------|-------|--------|
| Auto-Accept Mapping | >= 0.95 | No user confirmation |
| Accept with Warning | 0.80 - 0.94 | Flag for review |
| Require Confirmation | 0.60 - 0.79 | User must confirm |
| Cannot Auto-Map | < 0.60 | Manual mapping required |
| LLM High Confidence | >= 0.85 | Accept output |
| LLM Medium Confidence | 0.70 - 0.84 | Validate carefully |
| LLM Low Confidence | < 0.70 | Manual review |

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Base Agent class with lifecycle management
- [ ] AgentOrchestrator for coordination
- [ ] Trace event logging integration
- [ ] Agent message bus

### Phase 2: Ingestion Agents
- [ ] FormatDetectionAgent
- [ ] Parser agents (Excel, CSV, DOCX, PDF, JSON)
- [ ] MappingResolutionAgent
- [ ] NormalizationAgent
- [ ] ValidationAgent

### Phase 3: Extraction Agents
- [ ] ComplaintsExtractionAgent
- [ ] SalesExtractionAgent
- [ ] FSCAExtractionAgent
- [ ] CAPAExtractionAgent
- [ ] PMCFExtractionAgent
- [ ] LiteratureExtractionAgent
- [ ] IncidentExtractionAgent

### Phase 4: Runtime Agents
- [ ] TemplateInterpreterAgent
- [ ] NarrativeWriterAgent
- [ ] TableFormatterAgent
- [ ] SummaryGeneratorAgent
- [ ] ConclusionWriterAgent

### Phase 5: Validation Agents
- [ ] CompletenessValidatorAgent
- [ ] ConsistencyValidatorAgent
- [ ] RegulatoryComplianceAgent
- [ ] TraceGapResolutionAgent
- [ ] QualityAssuranceAgent

---

## Key Design Principles

1. **Every Decision Traced**: All agent decisions logged with reasoning
2. **Hash Chain Integrity**: Tamper-proof audit trail
3. **LLM Transparency**: All LLM calls logged with prompts/responses
4. **Ephemeral by Default**: Runtime agents spawn and terminate per task
5. **Graceful Degradation**: Fallback strategies for failures
6. **User in the Loop**: Escalation for low-confidence decisions
7. **Regulatory First**: All outputs traceable to evidence sources
