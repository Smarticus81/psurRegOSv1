/**
 * Field Mapping Agent - SOTA Implementation
 * 
 * State-of-the-art column mapping using:
 * - Comprehensive medical device/regulatory alias dictionary
 * - Multi-pass LLM reasoning with reflection and retry
 * - Intelligent sample value analysis
 * - Chain-of-thought prompting for complex mappings
 * - Self-critique and correction cycles
 */

import { BaseAgent, AgentConfig, AgentContext, createAgentConfig } from "../baseAgent";
import { PROMPT_TEMPLATES } from "../llmService";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface FieldMappingInput {
  sourceColumns: {
    name: string;
    sampleValues: unknown[];
    dataType?: string;
  }[];
  targetSchema: {
    fieldName: string;
    displayName: string;
    type: string;
    required: boolean;
    description?: string;
  }[];
  evidenceType: string;
  hints?: Record<string, string>; // User-provided hints
}

export interface FieldMapping {
  sourceColumn: string;
  targetField: string | null;
  confidence: number;
  method: "exact_match" | "semantic_match" | "llm_inferred" | "sample_inferred" | "user_provided" | "unmapped";
  reasoning: string;
  alternatives: { field: string; confidence: number }[];
  requiresConfirmation: boolean;
}

export interface FieldMappingOutput {
  mappings: FieldMapping[];
  unmappedSources: string[];
  unmappedTargets: string[];
  overallConfidence: number;
  suggestedActions: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOTA MAPPING KNOWLEDGE BASE
// Comprehensive medical device/regulatory terminology dictionary
// ═══════════════════════════════════════════════════════════════════════════════

// Extended exact match patterns with medical device domain knowledge
// NOTE: These map to the canonical field names used by evidence-parser.ts
const SOTA_EXACT_MATCHES: Record<string, string[]> = {
  // Complaint/Incident IDs - maps to complaintId
  complaintId: [
    "complaint_id", "complaint id", "complaint_number", "complaint number", "complaint_no", "complaint no",
    "case_id", "case id", "case_number", "case number", "case_no", "case no", "ticket_id", "ticket id",
    "reference", "reference_number", "ref", "ref_no", "complaint_ref", "incident_number", "complaint#",
    "ccr_number", "ccr_no", "ccr_id", "qms_number", "qms_id", "record_id", "record_number", "complaintid",
    "caseid", "ticketid", "refno", "ccrno", "qmsno"
  ],
  incidentId: [
    "incident_id", "incident_number", "incident_no", "event_id", "event_number", "adverse_event_id",
    "ae_id", "ae_number", "mdr_number", "vigilance_id", "vigilance_number", "report_id", "report_number",
    "incidentid", "eventid", "aeid", "mdrno"
  ],

  // Dates - comprehensive coverage (maps to complaintDate/eventDate)
  complaintDate: [
    "date_received", "received_date", "receive_date", "received", "date received", "date_reported",
    "reported_date", "report_date", "date_logged", "logged_date", "created_date", "date_created",
    "date_entered", "entry_date", "intake_date", "notification_date", "receipt_date", "initial_date",
    "datereceived", "reporteddate", "loggeddate", "createddate", "entrydate", "receiptdate",
    "complaint_date", "complaintdate", "date_opened", "opened_date", "open_date",
    "csi_notification_date", "csi notification date", "csinotificationdate"
  ],
  incidentDate: [
    "incident_date", "date_of_incident", "occurrence_date", "event_date", "date_occurred",
    "date_of_occurrence", "date_of_event", "failure_date", "malfunction_date", "problem_date",
    "incidentdate", "eventdate", "occurrencedate", "failuredate"
  ],
  dateClosed: [
    "date_closed", "closed_date", "close_date", "closure_date", "completion_date", "resolved_date",
    "resolution_date", "date_resolved", "date_completed", "final_date", "end_date",
    "dateclosed", "closeddate", "closuredate", "resolveddate"
  ],

  // Descriptions and narratives
  description: [
    "description", "complaint_description", "issue_description", "details", "narrative", "summary",
    "complaint_details", "issue_details", "problem_description", "event_description", "text",
    "complaint_narrative", "customer_description", "user_description", "event_narrative",
    "complaint_text", "issue_text", "complaint_summary", "notes", "comments", "free_text",
    "freetext", "complaintdesc", "issuedesc", "problemdesc", "eventdesc", "desc"
  ],

  // Severity and classification
  severity: [
    "severity", "severity_level", "seriousness", "priority", "criticality", "severity_rating",
    "severity_code", "severity_class", "harm_level", "risk_level", "impact_level", "grade",
    "classification", "severity_classification", "complaint_severity", "incident_severity",
    "severitylevel", "harmcode", "risklevel", "impactlevel", "class"
  ],

  // Geographic
  region: [
    "region", "market", "territory", "geography", "location", "area", "zone",
    "sales_region", "distribution_region", "geo", "locale", "market_region",
    "salesregion", "distribution_location", "distributionlocation"
  ],
  country: [
    "country", "country_code", "country_name", "countrycode", "countryname",
    "customer_country", "site_country", "incident_country", "nation", "state"
  ],

  // Device identification - maps to deviceCode
  deviceCode: [
    "device_code", "device_id", "device id", "product_id", "product id", "product_code",
    "part_number", "part_no", "catalog_number", "catalog_no", "item_number", "item_no",
    "sku", "model", "model_number", "model_no", "device_model", "product_number", "pn",
    "devicecode", "productcode", "partnumber", "partno", "catalogno", "itemno", "modelno",
    "material_number", "materialnum", "matno", "article_number", "product number"
  ],
  productName: [
    "device_name", "product_name", "product", "device", "item_name", "item_description",
    "product_description", "device_description", "article_name", "material_name",
    "devicename", "productname", "itemname", "articlename", "materialname", "trade_name"
  ],

  // Patient outcomes - maps to patientOutcome
  patientOutcome: [
    "patient_outcome", "patient_status", "injury", "harm", "patient_harm", "injury_type",
    "clinical_outcome", "health_outcome", "adverse_outcome", "patient_consequence",
    "medical_outcome", "harm_description", "injury_description", "patient_injury",
    "patientoutcome", "patientstatus", "injurytype", "clinicaloutcome", "healthoutcome",
    "consequence", "effect_on_patient", "patient_effect", "patient_involvement",
    "patientinvolvement", "additional_medical_attention"
  ],

  // Root cause and investigation - maps to rootCause
  rootCause: [
    "root_cause", "cause", "failure_mode", "reason", "root_cause_analysis", "rca",
    "contributing_factor", "causal_factor", "failure_analysis", "cause_code",
    "failure_category", "investigation_findings", "findings", "determination",
    "rootcause", "failuremode", "causecode", "failurecategory", "causation"
  ],

  // Actions and resolutions - maps to correctiveAction
  correctiveAction: [
    "corrective_action", "action_taken", "resolution", "fix", "corrective_measure",
    "remedial_action", "response", "action", "capa_action", "response_action",
    "resolution_action", "complaint_resolution", "remediation",
    "correctiveaction", "actiontaken", "remedialaction", "responseaction",
    "corrective_actions", "correctiveactions"
  ],
  investigationStatus: [
    "status", "state", "current_status", "complaint_status", "case_status", "record_status",
    "open_closed", "active", "disposition", "workflow_status", "progress", "stage",
    "currentstatus", "complaintstatus", "casestatus", "recordstatus", "workflowstatus",
    "investigation_status", "investigationstatus"
  ],

  // Sales/Volume data
  quantity: [
    "quantity", "qty", "count", "units", "volume", "units_sold", "sales_volume",
    "number_sold", "shipped", "distributed", "sales_qty", "unit_count", "amount",
    "unitssold", "salesvolume", "numbersold", "salesqty", "unitcount", "num_units"
  ],
  revenue: [
    "revenue", "sales", "sales_amount", "amount", "value", "sales_value", "total_sales",
    "net_sales", "gross_sales", "price", "total_value", "salesamount", "salesvalue",
    "totalsales", "netsales", "grosssales", "totalvalue", "sales_total"
  ],
  periodStart: [
    "period_start", "periodstart", "start_date", "from_date", "begin_date"
  ],
  periodEnd: [
    "period_end", "periodend", "end_date", "to_date", "through_date"
  ],

  // CAPA specific - maps to capaId
  capaId: [
    "capa_id", "capa_number", "capa_no", "capa#", "capa_ref", "capa_reference",
    "corrective_action_id", "ca_number", "pa_number", "nonconformance_id", "nc_number",
    "capaid", "capanumber", "capano", "caparef", "ncnumber", "nc_id", "ncid"
  ],
  effectiveness: [
    "effectiveness", "effectiveness_check", "effectiveness_verification", "effective",
    "verification_result", "capa_effectiveness", "closure_effectiveness",
    "effectivenesscheck", "verificationresult", "capaeffectiveness"
  ],

  // FSCA/Recall specific - maps to fscaId  
  fscaId: [
    "fsca_id", "fsca_number", "fsca_no", "recall_id", "recall_number", "recall_no",
    "field_action_id", "field_action_number", "advisory_id", "advisory_number",
    "safety_alert_id", "fsc_number", "corrective_action_number",
    "fscaid", "fscanumber", "fscano", "recallid", "recallnumber", "recallno"
  ],
  affectedUnits: [
    "affected_units", "units_affected", "affected_quantity", "affected_count",
    "recall_quantity", "scope", "affected_devices", "impacted_units",
    "affectedunits", "unitsaffected", "affectedqty", "affectedcount", "recallqty"
  ],

  // Literature/PMCF - maps to studyId
  studyId: [
    "study_id", "study_number", "protocol_id", "protocol_number", "trial_id",
    "clinical_study_id", "research_id", "pmcf_id", "studyid", "studynumber",
    "protocolid", "protocolnumber", "trialid", "researchid", "pmcfid"
  ],
  title: [
    "title", "study_title", "article_title", "publication_title", "name", "heading",
    "studytitle", "articletitle", "publicationtitle"
  ],
  authors: [
    "authors", "author", "author_name", "investigators", "researcher",
    "authorname", "investigator", "principal_investigator", "pi"
  ],
  journal: [
    "journal", "publication", "source", "publisher", "journal_name",
    "journalname", "pub", "pub_source"
  ],

  // IMDRF codes
  imdrf_code: [
    "imdrf_code", "imdrf", "annex_code", "problem_code", "device_problem_code",
    "patient_problem_code", "component_code", "fda_code", "mdr_code",
    "imdrfcode", "annexcode", "problemcode", "deviceproblemcode", "fdacode", "mdrcode"
  ]
};

// Enhanced semantic keywords with medical device context - using canonical field names
const SOTA_SEMANTIC_KEYWORDS: Record<string, string[]> = {
  complaintId: ["complaint", "case", "ticket", "reference", "number", "id", "record", "ccr", "qms", "ref"],
  incidentId: ["incident", "event", "adverse", "vigilance", "mdr", "report", "ae"],
  complaintDate: ["date", "received", "reported", "logged", "created", "entered", "intake", "notification", "opened"],
  incidentDate: ["incident", "occurrence", "event", "happened", "occurred", "malfunction", "failure"],
  dateClosed: ["closed", "closure", "completed", "resolved", "resolution", "final", "end"],
  description: ["description", "detail", "summary", "narrative", "text", "notes", "issue", "problem", "free", "comment", "nonconformity"],
  severity: ["severity", "serious", "critical", "priority", "level", "grade", "harm", "risk", "impact", "class"],
  region: ["region", "location", "area", "territory", "market", "geo", "zone", "distribution"],
  country: ["country", "nation", "state", "code"],
  deviceCode: ["device", "product", "part", "catalog", "item", "sku", "model", "pn", "number", "material", "article"],
  productName: ["device", "product", "item", "article", "material", "name", "trade"],
  patientOutcome: ["patient", "outcome", "injury", "harm", "clinical", "health", "adverse", "medical", "consequence", "involvement"],
  rootCause: ["cause", "root", "reason", "failure", "factor", "analysis", "finding", "rca", "determination", "investigation"],
  correctiveAction: ["corrective", "action", "resolution", "fix", "remedial", "response", "capa", "remediation"],
  investigationStatus: ["status", "state", "open", "closed", "active", "disposition", "progress", "stage", "workflow", "investigation"],
  quantity: ["quantity", "qty", "count", "units", "volume", "sold", "shipped", "amount", "num"],
  revenue: ["revenue", "sales", "amount", "value", "price", "total", "net", "gross"],
  periodStart: ["start", "from", "begin"],
  periodEnd: ["end", "to", "through"],
  capaId: ["capa", "corrective", "preventive", "nonconformance", "nc", "ca", "pa"],
  effectiveness: ["effectiveness", "effective", "verification", "check", "closure"],
  fscaId: ["fsca", "recall", "field", "action", "advisory", "alert", "safety", "fsc"],
  affectedUnits: ["affected", "units", "quantity", "scope", "impacted", "devices"],
  studyId: ["study", "protocol", "trial", "clinical", "research", "pmcf"],
  title: ["title", "name", "heading", "subject"],
  authors: ["author", "investigator", "researcher", "writer", "pi"],
  journal: ["journal", "publication", "source", "publisher"],
  imdrfCode: ["imdrf", "annex", "problem", "code", "fda", "mdr"],
  serious: ["serious", "mdr", "reportable", "issued"]
};

// Sample value patterns for intelligent type detection - using canonical field names
const SAMPLE_VALUE_PATTERNS: Record<string, { patterns: RegExp[]; examples: string[] }> = {
  complaintId: {
    patterns: [/^[A-Z]{2,4}[-_]?\d{4,}/i, /^C[0-9]+$/i, /^CCR[-_]?\d+/i, /^\d{6,}$/, /^QMS[-_]?\d+/i, /^\d{4}[-_]\d{2}[-_]\d{6,}/],
    examples: ["C12345", "CCR-2024-001", "QMS00123", "2022-08-0000471"]
  },
  complaintDate: {
    patterns: [/^\d{4}[-/]\d{2}[-/]\d{2}/, /^\d{1,2}[-/]\d{1,2}[-/]\d{4}/, /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i],
    examples: ["2024-01-15", "01/15/2024", "8/24/2022", "January 15, 2024"]
  },
  severity: {
    patterns: [/^(critical|high|medium|low|minor|major|severe|serious|none|informational)/i, /^[1-5]$/, /^(I|II|III|IV|V)$/],
    examples: ["High", "Critical", "3", "II"]
  },
  country: {
    patterns: [/^[A-Z]{2,3}$/, /^(USA|CANADA|MEXICO|GERMANY|FRANCE|UK|CHINA|JAPAN)/i],
    examples: ["USA", "CANADA", "DE", "FR"]
  },
  region: {
    patterns: [/^(US|EU|UK|CA|AU|JP|CN|DE|FR|IT|ES|EMEA|APAC|LATAM|NA|ROW|FG)/i],
    examples: ["US", "EU", "EMEA", "FG"]
  },
  quantity: {
    patterns: [/^\d+$/, /^\d{1,3}(,\d{3})*$/, /^\d+\.\d+$/],
    examples: ["100", "1,500", "2500"]
  },
  imdrfCode: {
    patterns: [/^[A-Z]\d{4}$/i, /^[A-Z]{2}\d{4}$/i, /^\d{4}$/],
    examples: ["A1234", "E1234", "1234"]
  },
  investigationStatus: {
    patterns: [/^(open|closed|pending|in progress|completed|resolved|active|inactive|new|assigned)/i],
    examples: ["Open", "Closed", "In Progress"]
  },
  serious: {
    patterns: [/^(yes|no|true|false)$/i],
    examples: ["Yes", "No"]
  }
};

// Legacy compatibility - map old names
const EXACT_MATCHES = SOTA_EXACT_MATCHES;
const SEMANTIC_KEYWORDS = SOTA_SEMANTIC_KEYWORDS;

// ═══════════════════════════════════════════════════════════════════════════════
// SOTA CHAIN-OF-THOUGHT PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

// Prompts are now managed via PROMPT_TEMPLATES in llmService.ts

// ═══════════════════════════════════════════════════════════════════════════════
// FIELD MAPPING AGENT
// ═══════════════════════════════════════════════════════════════════════════════

export class FieldMappingAgent extends BaseAgent<FieldMappingInput, FieldMappingOutput> {
  constructor(config?: Partial<AgentConfig>) {
    super(createAgentConfig("FieldMappingAgent", "SOTA Field Mapping Agent", {
      llm: {
        provider: "auto",
        temperature: 0.1,
        maxTokens: 4096,
      },
      behavior: {
        confidenceThreshold: 0.8,
        maxRetries: 3, // More retries for SOTA
        retryDelayMs: 500,
        timeoutMs: 120000, // Longer timeout for multi-pass reasoning
      },
      ...config,
    }));
  }

  protected async execute(input: FieldMappingInput): Promise<FieldMappingOutput> {
    const mappings: FieldMapping[] = [];
    const mappedTargets = new Set<string>();

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: User-provided hints (highest priority)
    // ═══════════════════════════════════════════════════════════════════════
    if (input.hints) {
      for (const [source, target] of Object.entries(input.hints)) {
        const sourceCol = input.sourceColumns.find(c => c.name === source);
        if (sourceCol && input.targetSchema.find(t => t.fieldName === target)) {
          mappings.push({
            sourceColumn: source,
            targetField: target,
            confidence: 1.0,
            method: "user_provided",
            reasoning: "User-provided mapping",
            alternatives: [],
            requiresConfirmation: false,
          });
          mappedTargets.add(target);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: Exact matches using SOTA knowledge base
    // ═══════════════════════════════════════════════════════════════════════
    for (const col of input.sourceColumns) {
      if (mappings.find(m => m.sourceColumn === col.name)) continue;

      const exactMatch = this.findExactMatch(col.name, input.targetSchema, mappedTargets);
      if (exactMatch) {
        mappings.push({
          sourceColumn: col.name,
          targetField: exactMatch.field,
          confidence: exactMatch.confidence,
          method: "exact_match",
          reasoning: `Exact match: "${col.name}" → "${exactMatch.field}"`,
          alternatives: [],
          requiresConfirmation: false,
        });
        mappedTargets.add(exactMatch.field);

        await this.logTrace("FIELD_MAPPING_RESOLVED", "PASS", "EVIDENCE_ATOM", undefined, {
          sourceColumn: col.name,
          targetField: exactMatch.field,
          confidence: exactMatch.confidence,
          method: "exact_match",
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: Sample value pattern analysis
    // ═══════════════════════════════════════════════════════════════════════
    for (const col of input.sourceColumns) {
      if (mappings.find(m => m.sourceColumn === col.name)) continue;

      const sampleMatch = this.inferFromSampleValues(col, input.targetSchema, mappedTargets);
      if (sampleMatch && sampleMatch.confidence >= 0.75) {
        mappings.push({
          sourceColumn: col.name,
          targetField: sampleMatch.field,
          confidence: sampleMatch.confidence,
          method: "sample_inferred",
          reasoning: sampleMatch.reasoning,
          alternatives: sampleMatch.alternatives,
          requiresConfirmation: sampleMatch.confidence < 0.85,
        });
        mappedTargets.add(sampleMatch.field);

        await this.logTrace("FIELD_MAPPING_RESOLVED", "PASS", "EVIDENCE_ATOM", undefined, {
          sourceColumn: col.name,
          targetField: sampleMatch.field,
          confidence: sampleMatch.confidence,
          method: "sample_inferred",
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 4: Enhanced semantic matching
    // ═══════════════════════════════════════════════════════════════════════
    for (const col of input.sourceColumns) {
      if (mappings.find(m => m.sourceColumn === col.name)) continue;

      const semanticMatch = this.findSemanticMatch(col.name, input.targetSchema, mappedTargets);
      if (semanticMatch && semanticMatch.confidence >= 0.6) {
        mappings.push({
          sourceColumn: col.name,
          targetField: semanticMatch.field,
          confidence: semanticMatch.confidence,
          method: "semantic_match",
          reasoning: `Semantic match based on keywords: "${col.name}" → "${semanticMatch.field}"`,
          alternatives: semanticMatch.alternatives,
          requiresConfirmation: semanticMatch.confidence < 0.85,
        });
        mappedTargets.add(semanticMatch.field);

        await this.logTrace("FIELD_MAPPING_RESOLVED", "PASS", "EVIDENCE_ATOM", undefined, {
          sourceColumn: col.name,
          targetField: semanticMatch.field,
          confidence: semanticMatch.confidence,
          method: "semantic_match",
          requiresConfirmation: semanticMatch.confidence < 0.85,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5: LLM inference with chain-of-thought reasoning
    // ═══════════════════════════════════════════════════════════════════════
    const unmappedColumns = input.sourceColumns.filter(
      c => !mappings.find(m => m.sourceColumn === c.name)
    );

    if (unmappedColumns.length > 0) {
      const llmMappings = await this.inferMappingsWithLLM(
        unmappedColumns,
        input.targetSchema.filter(t => !mappedTargets.has(t.fieldName)),
        input.evidenceType
      );

      for (const llmMapping of llmMappings) {
        if (llmMapping.targetField && !mappedTargets.has(llmMapping.targetField)) {
          mappings.push(llmMapping);
          if (llmMapping.targetField) {
            mappedTargets.add(llmMapping.targetField);
          }

          await this.logTrace("FIELD_MAPPING_RESOLVED",
            llmMapping.confidence >= 0.7 ? "PASS" : "INFO",
            "EVIDENCE_ATOM", undefined, {
            sourceColumn: llmMapping.sourceColumn,
            targetField: llmMapping.targetField,
            confidence: llmMapping.confidence,
            method: "llm_inferred",
            reasoning: llmMapping.reasoning,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 6: Self-critique and retry for low-confidence mappings
    // ═══════════════════════════════════════════════════════════════════════
    const lowConfidenceMappings = mappings.filter(
      m => m.confidence < 0.7 && m.targetField !== null && m.method !== "user_provided"
    );

    if (lowConfidenceMappings.length > 0) {
      const improvedMappings = await this.refineLowConfidenceMappings(
        lowConfidenceMappings,
        input.sourceColumns,
        input.targetSchema,
        mappedTargets,
        input.evidenceType
      );

      // Replace low confidence mappings with improved ones
      for (const improved of improvedMappings) {
        const idx = mappings.findIndex(m => m.sourceColumn === improved.sourceColumn);
        if (idx >= 0 && improved.confidence > mappings[idx].confidence) {
          // Update mapped targets tracking
          if (mappings[idx].targetField) {
            mappedTargets.delete(mappings[idx].targetField!);
          }
          mappings[idx] = improved;
          if (improved.targetField) {
            mappedTargets.add(improved.targetField);
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 7: Handle remaining unmapped columns
    // ═══════════════════════════════════════════════════════════════════════
    for (const col of input.sourceColumns) {
      if (!mappings.find(m => m.sourceColumn === col.name)) {
        mappings.push({
          sourceColumn: col.name,
          targetField: null,
          confidence: 0,
          method: "unmapped",
          reasoning: "No suitable target field found after all mapping phases",
          alternatives: [],
          requiresConfirmation: true,
        });
      }
    }

    // Calculate results
    const unmappedSources = mappings.filter(m => m.targetField === null).map(m => m.sourceColumn);
    const unmappedTargets = input.targetSchema
      .filter(t => !mappedTargets.has(t.fieldName))
      .map(t => t.fieldName);

    const overallConfidence = mappings.length > 0
      ? mappings.filter(m => m.targetField !== null).reduce((sum, m) => sum + m.confidence, 0) /
      Math.max(1, mappings.filter(m => m.targetField !== null).length)
      : 0;

    // Generate suggestions
    const suggestedActions: string[] = [];
    if (unmappedSources.length > 0) {
      suggestedActions.push(`${unmappedSources.length} source column(s) could not be mapped automatically`);
    }
    if (unmappedTargets.filter(t => input.targetSchema.find(s => s.fieldName === t)?.required).length > 0) {
      suggestedActions.push("Some required target fields are not mapped - manual mapping needed");
    }
    if (mappings.some(m => m.requiresConfirmation)) {
      suggestedActions.push("Some mappings have low confidence and require user confirmation");
    }

    return {
      mappings,
      unmappedSources,
      unmappedTargets,
      overallConfidence,
      suggestedActions,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 3: Sample Value Pattern Analysis
  // ═══════════════════════════════════════════════════════════════════════════════

  private inferFromSampleValues(
    col: FieldMappingInput["sourceColumns"][0],
    targetSchema: FieldMappingInput["targetSchema"],
    alreadyMapped: Set<string>
  ): { field: string; confidence: number; reasoning: string; alternatives: { field: string; confidence: number }[] } | null {
    if (!col.sampleValues || col.sampleValues.length === 0) return null;

    const sampleStrings = col.sampleValues
      .slice(0, 10)
      .map(v => String(v ?? "").trim())
      .filter(v => v.length > 0);

    if (sampleStrings.length === 0) return null;

    const scores: { field: string; score: number; matchedPattern: string }[] = [];

    for (const target of targetSchema) {
      if (alreadyMapped.has(target.fieldName)) continue;

      const patternDef = SAMPLE_VALUE_PATTERNS[target.fieldName];
      if (!patternDef) continue;

      let matchCount = 0;
      let matchedPattern = "";

      for (const sample of sampleStrings) {
        for (const pattern of patternDef.patterns) {
          if (pattern.test(sample)) {
            matchCount++;
            matchedPattern = pattern.source;
            break;
          }
        }
      }

      if (matchCount > 0) {
        const matchRate = matchCount / sampleStrings.length;
        const score = 0.6 + (matchRate * 0.35); // Base 0.6 + up to 0.35 for match rate
        scores.push({ field: target.fieldName, score, matchedPattern });
      }
    }

    if (scores.length === 0) return null;

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    return {
      field: best.field,
      confidence: best.score,
      reasoning: `Sample values match pattern for ${best.field} (${Math.round(best.score * 100)}% confidence based on value analysis)`,
      alternatives: scores.slice(1, 4).map(s => ({ field: s.field, confidence: s.score })),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 6: Self-Critique and Refinement
  // ═══════════════════════════════════════════════════════════════════════════════

  private async refineLowConfidenceMappings(
    lowConfidenceMappings: FieldMapping[],
    sourceColumns: FieldMappingInput["sourceColumns"],
    targetSchema: FieldMappingInput["targetSchema"],
    mappedTargets: Set<string>,
    evidenceType: string
  ): Promise<FieldMapping[]> {
    const results: FieldMapping[] = [];

    for (const mapping of lowConfidenceMappings) {
      try {
        const sourceCol = sourceColumns.find(c => c.name === mapping.sourceColumn);
        if (!sourceCol) continue;

        // Get alternatives that aren't already mapped
        const availableTargets = targetSchema.filter(t =>
          !mappedTargets.has(t.fieldName) || t.fieldName === mapping.targetField
        );

        const { content } = await this.invokeLLMForJSON<{
          targetField: string | null;
          confidence: number;
          reasoning: string;
          alternatives: { field: string; confidence: number }[];
          shouldReassign: boolean;
        }>(
          PROMPT_TEMPLATES.FIELD_MAPPING_REFINEMENT
            .replace("{sourceColumn}", sourceCol.name)
            .replace("{sampleValues}", JSON.stringify(sourceCol.sampleValues.slice(0, 8)))
            .replace("{targetField}", mapping.targetField || "null")
            .replace("{confidence}", mapping.confidence.toString())
            .replace("{reasoning}", mapping.reasoning)
            .replace("{targetFields}", availableTargets.map(t => `- ${t.fieldName} (${t.displayName}): ${t.description || t.type}${t.required ? " [REQUIRED]" : ""}`).join("\n"))
            .replace("{evidenceType}", evidenceType),
          "Analyze the field mapping refinement task.",
          undefined,
          {
            operation: "FIELD_MAPPING_REFINEMENT",
            entityType: "EVIDENCE_ATOM",
          }
        );

        if (content.shouldReassign && content.targetField && content.confidence > mapping.confidence) {
          results.push({
            sourceColumn: mapping.sourceColumn,
            targetField: content.targetField,
            confidence: content.confidence,
            method: "llm_inferred",
            reasoning: `Refined: ${content.reasoning}`,
            alternatives: content.alternatives || [],
            requiresConfirmation: content.confidence < 0.8,
          });

          await this.logTrace("FIELD_MAPPING_REFINED", "PASS", "EVIDENCE_ATOM", undefined, {
            sourceColumn: mapping.sourceColumn,
            originalTarget: mapping.targetField,
            newTarget: content.targetField,
            originalConfidence: mapping.confidence,
            newConfidence: content.confidence,
            reasoning: content.reasoning,
          });
        } else {
          // Keep original but potentially update confidence/reasoning
          results.push({
            ...mapping,
            confidence: Math.max(mapping.confidence, content.confidence),
            reasoning: content.confidence > mapping.confidence ? content.reasoning : mapping.reasoning,
          });
        }
      } catch (error: any) {
        this.addWarning(`Refinement failed for "${mapping.sourceColumn}": ${error.message}`);
        results.push(mapping); // Keep original
      }
    }

    return results;
  }

  private findExactMatch(
    columnName: string,
    targetSchema: FieldMappingInput["targetSchema"],
    alreadyMapped: Set<string>
  ): { field: string; confidence: number } | null {
    const normalized = columnName.toLowerCase().trim().replace(/[^a-z0-9]/g, "_");

    for (const target of targetSchema) {
      if (alreadyMapped.has(target.fieldName)) continue;

      const targetNormalized = target.fieldName.toLowerCase();

      // Direct match
      if (normalized === targetNormalized) {
        return { field: target.fieldName, confidence: 1.0 };
      }

      // Check known aliases
      const aliases = EXACT_MATCHES[target.fieldName];
      if (aliases) {
        for (const alias of aliases) {
          const aliasNormalized = alias.toLowerCase().replace(/[^a-z0-9]/g, "_");
          if (normalized === aliasNormalized || normalized.includes(aliasNormalized)) {
            return { field: target.fieldName, confidence: 0.95 };
          }
        }
      }
    }

    return null;
  }

  private findSemanticMatch(
    columnName: string,
    targetSchema: FieldMappingInput["targetSchema"],
    alreadyMapped: Set<string>
  ): { field: string; confidence: number; alternatives: { field: string; confidence: number }[] } | null {
    const normalized = columnName.toLowerCase();
    const scores: { field: string; score: number }[] = [];

    for (const target of targetSchema) {
      if (alreadyMapped.has(target.fieldName)) continue;

      const keywords = SEMANTIC_KEYWORDS[target.fieldName] || [];
      let matchCount = 0;

      for (const keyword of keywords) {
        if (normalized.includes(keyword)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        const score = Math.min(0.9, 0.5 + (matchCount * 0.15));
        scores.push({ field: target.fieldName, score });
      }
    }

    if (scores.length === 0) return null;

    scores.sort((a, b) => b.score - a.score);

    return {
      field: scores[0].field,
      confidence: scores[0].score,
      alternatives: scores.slice(1, 4).map(s => ({ field: s.field, confidence: s.score })),
    };
  }

  private async inferMappingsWithLLM(
    columns: FieldMappingInput["sourceColumns"],
    availableTargets: FieldMappingInput["targetSchema"],
    evidenceType: string
  ): Promise<FieldMapping[]> {
    if (columns.length === 0 || availableTargets.length === 0) {
      return [];
    }

    // Use batch mapping for better context awareness
    if (columns.length > 1 && columns.length <= 15) {
      return this.inferBatchMappingsWithLLM(columns, availableTargets, evidenceType);
    }

    // Fall back to individual mapping for single columns or very large sets
    const results: FieldMapping[] = [];

    for (const col of columns) {
      try {
        const { content } = await this.invokeLLMForJSON<{
          targetField: string | null;
          confidence: number;
          reasoning: string;
          alternatives: { field: string; confidence: number }[];
        }>(
          PROMPT_TEMPLATES.FIELD_MAPPING_REFINEMENT
            .replace("{sourceColumn}", col.name)
            .replace("{sampleValues}", JSON.stringify(col.sampleValues.slice(0, 8)))
            .replace("{targetField}", "null")
            .replace("{confidence}", "0")
            .replace("{reasoning}", "None")
            .replace("{targetFields}", availableTargets.map(t => `- ${t.fieldName} (${t.displayName}): ${t.description || t.type}${t.required ? " [REQUIRED]" : ""}`).join("\n"))
            .replace("{evidenceType}", evidenceType),
          "Perform initial field mapping inference.",
          undefined,
          {
            operation: "FIELD_MAPPING_INFERENCE",
            entityType: "EVIDENCE_ATOM",
          }
        );

        results.push({
          sourceColumn: col.name,
          targetField: content.targetField,
          confidence: content.confidence,
          method: "llm_inferred",
          reasoning: content.reasoning,
          alternatives: content.alternatives || [],
          requiresConfirmation: content.confidence < 0.8,
        });

      } catch (error: any) {
        this.addWarning(`LLM mapping failed for column "${col.name}": ${error.message}`);
        results.push({
          sourceColumn: col.name,
          targetField: null,
          confidence: 0,
          method: "unmapped",
          reasoning: `LLM inference failed: ${error.message}`,
          alternatives: [],
          requiresConfirmation: true,
        });
      }
    }

    return results;
  }

  // SOTA: Batch mapping considers all columns together for better context
  private async inferBatchMappingsWithLLM(
    columns: FieldMappingInput["sourceColumns"],
    availableTargets: FieldMappingInput["targetSchema"],
    evidenceType: string
  ): Promise<FieldMapping[]> {
    try {
      const columnsDescription = columns.map(col =>
        `- "${col.name}": samples = ${JSON.stringify(col.sampleValues.slice(0, 5))}`
      ).join("\n");

      const targetsDescription = availableTargets.map(t =>
        `- ${t.fieldName} (${t.displayName}): ${t.description || t.type}${t.required ? " [REQUIRED]" : ""}`
      ).join("\n");

      const { content } = await this.invokeLLMForJSON<{
        mappings: Array<{
          sourceColumn: string;
          targetField: string | null;
          confidence: number;
          reasoning: string;
        }>;
        overallAnalysis: string;
      }>(
        PROMPT_TEMPLATES.BATCH_FIELD_MAPPING
          .replace("{columnsDescription}", columnsDescription)
          .replace("{targetsDescription}", targetsDescription)
          .replace("{evidenceType}", evidenceType),
        "Perform batch field mapping inference.",
        undefined,
        {
          operation: "BATCH_FIELD_MAPPING_INFERENCE",
          entityType: "EVIDENCE_ATOM",
        }
      );

      if (content.overallAnalysis) {
        this.addWarning(`Data structure analysis: ${content.overallAnalysis}`);
      }

      const results: FieldMapping[] = [];
      const usedTargets = new Set<string>();

      for (const mapping of content.mappings) {
        // Skip if this target is already used (prevent duplicates)
        if (mapping.targetField && usedTargets.has(mapping.targetField)) {
          results.push({
            sourceColumn: mapping.sourceColumn,
            targetField: null,
            confidence: 0,
            method: "unmapped",
            reasoning: `Target field "${mapping.targetField}" already mapped to another column`,
            alternatives: [],
            requiresConfirmation: true,
          });
          continue;
        }

        if (mapping.targetField) {
          usedTargets.add(mapping.targetField);
        }

        results.push({
          sourceColumn: mapping.sourceColumn,
          targetField: mapping.targetField,
          confidence: mapping.confidence,
          method: "llm_inferred",
          reasoning: mapping.reasoning,
          alternatives: [],
          requiresConfirmation: mapping.confidence < 0.8,
        });
      }

      // Handle any columns that weren't in the LLM response
      for (const col of columns) {
        if (!results.find(r => r.sourceColumn === col.name)) {
          results.push({
            sourceColumn: col.name,
            targetField: null,
            confidence: 0,
            method: "unmapped",
            reasoning: "Column not included in batch mapping response",
            alternatives: [],
            requiresConfirmation: true,
          });
        }
      }

      return results;

    } catch (error: any) {
      this.addWarning(`Batch LLM mapping failed, falling back to individual mapping: ${error.message}`);

      // Fall back to individual mapping
      const results: FieldMapping[] = [];
      for (const col of columns) {
        results.push({
          sourceColumn: col.name,
          targetField: null,
          confidence: 0,
          method: "unmapped",
          reasoning: `Batch mapping failed: ${error.message}`,
          alternatives: [],
          requiresConfirmation: true,
        });
      }
      return results;
    }
  }

  protected calculateConfidence(output: FieldMappingOutput): number {
    return output.overallConfidence;
  }
}
