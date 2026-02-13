/**
 * SOTA Evidence Type Registry
 * 
 * Complete canonical evidence type definitions with:
 * - All 40+ evidence types from CANONICAL_EVIDENCE_TYPES
 * - Comprehensive field definitions with semantic descriptions
 * - Validation rules for each field
 * - MDCG 2022-21 regulatory mappings
 */

import { CANONICAL_EVIDENCE_TYPES } from "@shared/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// FIELD DEFINITION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface FieldDefinition {
  name: string;
  description: string;
  semanticHints: string[];  // Alternative names, synonyms, abbreviations
  dataType: "string" | "number" | "date" | "boolean" | "enum" | "array" | "object";
  required: boolean;
  validation?: FieldValidation;
  enumValues?: string[];  // For enum types
  mdcgReference?: string; // MDCG 2022-21 section reference
}

export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  pattern?: string;  // Regex pattern
  customValidator?: string;  // Name of custom validation function
}

export interface EvidenceTypeDefinition {
  type: string;
  category: string;
  description: string;
  mdcgSections: string[];  // Which MDCG 2022-21 sections this evidence supports
  fields: FieldDefinition[];
  documentIndicators: string[];  // Phrases that indicate this evidence type in documents
  tableIndicators: string[];  // Column patterns that indicate this evidence type
  minimumConfidenceThreshold: number;  // Below this, flag for human review
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETE EVIDENCE TYPE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const SOTA_EVIDENCE_REGISTRY: EvidenceTypeDefinition[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // SALES & DISTRIBUTION
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: CANONICAL_EVIDENCE_TYPES.SALES,
    category: "Sales & Distribution",
    description: "Individual sales transaction or distribution record showing units sold/shipped",
    mdcgSections: ["Section C - Sales Volume", "Section C - Exposure Estimates"],
    fields: [
      {
        name: "quantity",
        description: "Number of units sold, shipped, or distributed",
        semanticHints: ["units", "units sold", "units shipped", "qty", "count", "volume", "amount", "number sold", "pieces", "items", "total units", "sold quantity"],
        dataType: "number",
        required: true,
        validation: { minValue: 0 },
        mdcgReference: "B.1 - Number of devices placed on market"
      },
      {
        name: "region",
        description: "Geographic region or market area",
        semanticHints: ["region", "market", "territory", "area", "zone", "geography", "geo", "location", "market region"],
        dataType: "string",
        required: false,
        mdcgReference: "B.2 - Geographic distribution"
      },
      {
        name: "country",
        description: "Country of sale or distribution",
        semanticHints: ["country", "nation", "country code", "country name", "destination country", "ship to country"],
        dataType: "string",
        required: false,
        mdcgReference: "B.2 - Geographic distribution"
      },
      {
        name: "periodStart",
        description: "Start date of the reporting period for this sales data",
        semanticHints: ["period start", "start date", "from date", "begin date", "period from", "reporting period start", "start", "from"],
        dataType: "date",
        required: true,
        mdcgReference: "B - Reporting period"
      },
      {
        name: "periodEnd",
        description: "End date of the reporting period for this sales data",
        semanticHints: ["period end", "end date", "to date", "through date", "period to", "reporting period end", "end", "to", "until"],
        dataType: "date",
        required: true,
        mdcgReference: "B - Reporting period"
      },
      {
        name: "deviceCode",
        description: "Product identifier, SKU, part number, or model number",
        semanticHints: ["device code", "product code", "sku", "part number", "model", "catalog number", "item number", "product id", "device id", "material number"],
        dataType: "string",
        required: false,
      },
      {
        name: "deviceName",
        description: "Product or device trade name",
        semanticHints: ["device name", "product name", "product", "device", "item name", "trade name"],
        dataType: "string",
        required: false,
      },
      {
        name: "distributionChannel",
        description: "Sales or distribution channel",
        semanticHints: ["channel", "distribution channel", "sales channel", "route to market", "customer type"],
        dataType: "string",
        required: false,
      },
      {
        name: "revenue",
        description: "Sales revenue amount",
        semanticHints: ["revenue", "sales amount", "value", "price", "total", "amount"],
        dataType: "number",
        required: false,
      },
      {
        name: "currency",
        description: "Currency of revenue",
        semanticHints: ["currency", "curr", "ccy"],
        dataType: "string",
        required: false,
      },
      {
        name: "marketShare",
        description: "Estimated market share percentage",
        semanticHints: ["market share", "share", "market %", "percentage", "market percentage"],
        dataType: "number",
        required: false,
        validation: { minValue: 0, maxValue: 100 }
      },
      {
        name: "usageEstimate",
        description: "Estimated patient exposure or usage count",
        semanticHints: ["usage estimate", "patient exposure", "procedures", "patients", "estimated users", "usage", "exposure"],
        dataType: "number",
        required: false,
      }
    ],
    documentIndicators: [
      "sales volume", "units sold", "distribution data", "market data", "sales report",
      "shipment data", "units shipped", "devices placed on market", "market distribution"
    ],
    tableIndicators: [
      "units", "quantity", "sold", "shipped", "region", "country", "revenue", "sales"
    ],
    minimumConfidenceThreshold: 0.7
  },

  {
    type: CANONICAL_EVIDENCE_TYPES.MARKET_HISTORY,
    category: "Sales & Distribution",
    description: "Market history with dates of first sale, markets entered/exited, volume trends",
    mdcgSections: ["Section C - Sales Volume"],
    fields: [
      {
        name: "dateFirstSold",
        description: "Date the device was first placed on market",
        semanticHints: ["date first sold", "first sale", "launch date", "market entry date"],
        dataType: "date",
        required: false,
      },
      {
        name: "marketsEntered",
        description: "Markets/countries entered during period",
        semanticHints: ["markets entered", "new markets", "countries entered"],
        dataType: "string",
        required: false,
      },
      {
        name: "marketsExited",
        description: "Markets/countries exited during period",
        semanticHints: ["markets exited", "withdrawn", "countries exited"],
        dataType: "string",
        required: false,
      },
      {
        name: "volumeTrend",
        description: "Volume trend direction or description",
        semanticHints: ["volume trend", "trend", "growth", "decline"],
        dataType: "string",
        required: false,
      },
    ],
    documentIndicators: [
      "market history", "first sold", "launch date", "market entry"
    ],
    tableIndicators: ["first sold", "market entry", "launch"],
    minimumConfidenceThreshold: 0.7
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLAINTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: CANONICAL_EVIDENCE_TYPES.COMPLAINT,
    category: "Complaints",
    description: "Individual customer complaint or product feedback record",
    mdcgSections: ["Section D - Complaints", "Section E - Trend Analysis"],
    fields: [
      {
        name: "complaintId",
        description: "Unique complaint identifier or reference number",
        semanticHints: ["complaint id", "complaint number", "reference", "case number", "ticket", "id", "complaint ref", "case id", "csi number", "rma number", "record number"],
        dataType: "string",
        required: false,
      },
      {
        name: "complaintDate",
        description: "Date the complaint was received or reported",
        semanticHints: ["complaint date", "date received", "reported date", "date", "received date", "report date", "occurrence date", "event date", "csi notification date", "date entered", "notification date", "date opened"],
        dataType: "date",
        required: true,
        mdcgReference: "D - Date of complaint"
      },
      {
        name: "description",
        description: "Complaint description or narrative",
        semanticHints: ["description", "complaint description", "narrative", "details", "summary", "complaint text", "issue", "problem description", "allegation"],
        dataType: "string",
        required: true,
        mdcgReference: "D - Nature of complaint"
      },
      {
        name: "severity",
        description: "Severity classification of the complaint",
        semanticHints: ["severity", "seriousness", "priority", "impact", "severity level", "risk level", "classification"],
        dataType: "enum",
        enumValues: ["Critical", "High", "Medium", "Low", "Informational", "Unknown"],
        required: false,
        mdcgReference: "D - Severity assessment"
      },
      {
        name: "region",
        description: "Geographic region of complaint origin",
        semanticHints: ["region", "market", "territory", "geography", "area"],
        dataType: "string",
        required: false,
      },
      {
        name: "country",
        description: "Country of complaint origin",
        semanticHints: ["country", "nation", "country of origin"],
        dataType: "string",
        required: false,
      },
      {
        name: "deviceCode",
        description: "Product identifier related to complaint",
        semanticHints: ["device code", "product code", "sku", "model", "part number", "product", "product number", "catalog number", "item number"],
        dataType: "string",
        required: false,
      },
      {
        name: "lotNumber",
        description: "Lot or batch number of the device",
        semanticHints: ["lot", "lot number", "batch", "batch number", "lot no"],
        dataType: "string",
        required: false,
      },
      {
        name: "serialNumber",
        description: "Serial number of the device",
        semanticHints: ["serial", "serial number", "sn", "serial no"],
        dataType: "string",
        required: false,
      },
      {
        name: "complaintCategory",
        description: "Category or type of complaint",
        semanticHints: ["category", "type", "complaint type", "complaint category", "classification", "failure mode", "symptom code", "fault code", "failure code", "nonconformity", "product sales category"],
        dataType: "string",
        required: false,
      },
      {
        name: "rootCause",
        description: "Determined root cause of the complaint",
        semanticHints: ["root cause", "cause", "reason", "determination", "investigation result", "investigation findings", "findings"],
        dataType: "string",
        required: false,
      },
      {
        name: "correctiveAction",
        description: "Corrective action taken in response",
        semanticHints: ["corrective action", "action taken", "response", "resolution", "action", "corrective actions", "corrective action level"],
        dataType: "string",
        required: false,
      },
      {
        name: "patientOutcome",
        description: "Patient outcome or harm assessment",
        semanticHints: ["patient outcome", "outcome", "harm", "injury", "patient impact", "health consequence"],
        dataType: "string",
        required: false,
        mdcgReference: "D - Patient outcome"
      },
      {
        name: "isSerious",
        description: "Whether this complaint involves a serious event",
        semanticHints: ["serious", "is serious", "reportable", "mdr reportable", "vigilance"],
        dataType: "boolean",
        required: false,
      },
      {
        name: "status",
        description: "Current status of the complaint",
        semanticHints: ["status", "state", "current status", "complaint status"],
        dataType: "enum",
        enumValues: ["Open", "Closed", "Investigating", "Pending", "Resolved"],
        required: false,
      },
      {
        name: "imdrfCode",
        description: "IMDRF problem code if applicable",
        semanticHints: ["imdrf", "imdrf code", "problem code", "device problem code", "annex code"],
        dataType: "string",
        required: false,
        validation: { pattern: "^[A-Z]\\d{4}$" }
      }
    ],
    documentIndicators: [
      "complaint", "customer complaint", "product complaint", "feedback", "issue report",
      "allegation", "customer feedback", "quality complaint", "product issue"
    ],
    tableIndicators: [
      "complaint", "date", "description", "severity", "status", "outcome"
    ],
    minimumConfidenceThreshold: 0.7
  },

  {
    type: CANONICAL_EVIDENCE_TYPES.COMPLAINT_INVESTIGATION,
    category: "Complaints",
    description: "Complaint investigation findings, root cause, and corrective action determination",
    mdcgSections: ["Section D - Complaints", "Section E - Trend Analysis"],
    fields: [
      {
        name: "complaintId",
        description: "Complaint ID being investigated",
        semanticHints: ["complaint id", "complaint number", "reference", "case number"],
        dataType: "string",
        required: false,
      },
      {
        name: "investigationDate",
        description: "Date investigation was completed",
        semanticHints: ["investigation date", "completed date", "date investigated"],
        dataType: "date",
        required: false,
      },
      {
        name: "findings",
        description: "Investigation findings",
        semanticHints: ["findings", "investigation findings", "results", "determination"],
        dataType: "string",
        required: true,
      },
      {
        name: "rootCause",
        description: "Determined root cause",
        semanticHints: ["root cause", "cause", "reason", "root cause analysis"],
        dataType: "string",
        required: false,
      },
      {
        name: "confirmed",
        description: "Whether complaint was confirmed as valid",
        semanticHints: ["confirmed", "valid", "substantiated", "verified"],
        dataType: "boolean",
        required: false,
      },
      {
        name: "correctiveAction",
        description: "Corrective action taken",
        semanticHints: ["corrective action", "action taken", "resolution", "response"],
        dataType: "string",
        required: false,
      },
    ],
    documentIndicators: [
      "complaint investigation", "investigation findings", "root cause determination"
    ],
    tableIndicators: ["investigation", "root cause", "confirmed", "findings"],
    minimumConfidenceThreshold: 0.7
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SERIOUS INCIDENTS / VIGILANCE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: CANONICAL_EVIDENCE_TYPES.SERIOUS_INCIDENT,
    category: "Vigilance",
    description: "Serious incident or adverse event report requiring regulatory notification",
    mdcgSections: ["Section C - Serious Incidents", "Section H - FSCAs"],
    fields: [
      {
        name: "incidentId",
        description: "Unique incident identifier or MIR number",
        semanticHints: ["incident id", "mir number", "report number", "case number", "reference", "incident number", "event id"],
        dataType: "string",
        required: false,
      },
      {
        name: "incidentDate",
        description: "Date the incident occurred",
        semanticHints: ["incident date", "event date", "occurrence date", "date of incident", "date", "occurred"],
        dataType: "date",
        required: true,
        mdcgReference: "C - Date of incident"
      },
      {
        name: "reportDate",
        description: "Date the incident was reported to authorities",
        semanticHints: ["report date", "notification date", "reported date", "date reported", "submission date"],
        dataType: "date",
        required: false,
      },
      {
        name: "description",
        description: "Description of the incident",
        semanticHints: ["description", "incident description", "narrative", "event description", "details", "summary"],
        dataType: "string",
        required: true,
        mdcgReference: "C - Nature of incident"
      },
      {
        name: "patientOutcome",
        description: "Patient outcome (death, serious injury, etc.)",
        semanticHints: ["patient outcome", "outcome", "harm", "patient harm", "health consequence", "result"],
        dataType: "enum",
        enumValues: ["Death", "Life-threatening", "Hospitalization", "Disability", "Intervention Required", "Other Serious", "No Harm"],
        required: true,
        mdcgReference: "C - Patient outcome"
      },
      {
        name: "imdrfCode",
        description: "IMDRF code for the device problem",
        semanticHints: ["imdrf", "imdrf code", "problem code", "device problem", "annex a code"],
        dataType: "string",
        required: false,
        validation: { pattern: "^[A-Z]\\d{4}$" },
        mdcgReference: "C - IMDRF coding"
      },
      {
        name: "imdrfPatientCode",
        description: "IMDRF code for patient outcome",
        semanticHints: ["patient code", "outcome code", "annex e code", "imdrf patient"],
        dataType: "string",
        required: false,
      },
      {
        name: "deviceCode",
        description: "Product identifier",
        semanticHints: ["device code", "product", "model", "sku"],
        dataType: "string",
        required: false,
      },
      {
        name: "lotNumber",
        description: "Lot or batch number",
        semanticHints: ["lot", "batch", "lot number"],
        dataType: "string",
        required: false,
      },
      {
        name: "country",
        description: "Country where incident occurred",
        semanticHints: ["country", "location", "nation"],
        dataType: "string",
        required: false,
      },
      {
        name: "competentAuthority",
        description: "Regulatory authority notified",
        semanticHints: ["competent authority", "authority", "regulator", "notified body", "ca"],
        dataType: "string",
        required: false,
      },
      {
        name: "reportStatus",
        description: "Status of the report",
        semanticHints: ["status", "report status", "state"],
        dataType: "enum",
        enumValues: ["Initial", "Follow-up", "Final", "Closed"],
        required: false,
      },
      {
        name: "rootCause",
        description: "Determined root cause",
        semanticHints: ["root cause", "cause", "investigation conclusion"],
        dataType: "string",
        required: false,
      },
      {
        name: "correctiveAction",
        description: "Corrective actions taken",
        semanticHints: ["corrective action", "action", "capa", "fsca"],
        dataType: "string",
        required: false,
      }
    ],
    documentIndicators: [
      "serious incident", "adverse event", "mdr report", "vigilance report", "mir",
      "medical device report", "death", "serious injury", "malfunction"
    ],
    tableIndicators: [
      "incident", "event", "outcome", "imdrf", "death", "injury", "malfunction"
    ],
    minimumConfidenceThreshold: 0.8  // Higher threshold for safety-critical data
  },

  {
    type: CANONICAL_EVIDENCE_TYPES.SERIOUS_INCIDENT_INVESTIGATION,
    category: "Vigilance",
    description: "Serious incident investigation with root cause analysis and actions taken",
    mdcgSections: ["Section C - Serious Incidents"],
    fields: [
      {
        name: "incidentId",
        description: "Incident ID being investigated",
        semanticHints: ["incident id", "incident number", "case number", "reference"],
        dataType: "string",
        required: false,
      },
      {
        name: "investigationDate",
        description: "Date investigation was completed",
        semanticHints: ["investigation date", "completed date", "date investigated"],
        dataType: "date",
        required: false,
      },
      {
        name: "rootCauseAnalysis",
        description: "Root cause analysis findings",
        semanticHints: ["root cause analysis", "rca", "root cause", "cause analysis"],
        dataType: "string",
        required: true,
      },
      {
        name: "actionsTaken",
        description: "Actions taken in response to the incident",
        semanticHints: ["actions taken", "corrective actions", "response", "measures"],
        dataType: "string",
        required: false,
      },
      {
        name: "outcome",
        description: "Investigation outcome/conclusion",
        semanticHints: ["outcome", "conclusion", "result", "determination"],
        dataType: "string",
        required: false,
      },
    ],
    documentIndicators: [
      "incident investigation", "root cause analysis", "investigation report"
    ],
    tableIndicators: ["investigation", "root cause", "actions taken", "rca"],
    minimumConfidenceThreshold: 0.8
  },

  {
    type: CANONICAL_EVIDENCE_TYPES.VIGILANCE_SUBMISSION_LOG,
    category: "Vigilance",
    description: "Log of regulatory submissions for vigilance reports (EUDAMED, Competent Authorities)",
    mdcgSections: ["Section C - Serious Incidents"],
    fields: [
      {
        name: "submissionDate",
        description: "Date of submission to authority",
        semanticHints: ["submission date", "reported date", "notification date", "date submitted"],
        dataType: "date",
        required: true,
      },
      {
        name: "incidentId",
        description: "Related incident identifier",
        semanticHints: ["incident id", "incident number", "case number"],
        dataType: "string",
        required: false,
      },
      {
        name: "competentAuthority",
        description: "Competent authority notified",
        semanticHints: ["competent authority", "authority", "regulator", "ca", "notified body"],
        dataType: "string",
        required: false,
      },
      {
        name: "eudamedId",
        description: "EUDAMED incident report identifier",
        semanticHints: ["eudamed id", "eudamed", "eudamed reference", "eudamed number"],
        dataType: "string",
        required: false,
      },
      {
        name: "reportStatus",
        description: "Status of the regulatory report",
        semanticHints: ["report status", "status", "submission status"],
        dataType: "enum",
        enumValues: ["Initial", "Follow-up", "Final", "Closed"],
        required: false,
      },
      {
        name: "timelineCompliance",
        description: "Whether submission met regulatory timeline requirements",
        semanticHints: ["timeline compliance", "on time", "within deadline", "compliant"],
        dataType: "boolean",
        required: false,
      },
    ],
    documentIndicators: [
      "vigilance submission", "regulatory report", "eudamed", "competent authority notification"
    ],
    tableIndicators: ["submission", "eudamed", "competent authority", "timeline"],
    minimumConfidenceThreshold: 0.7
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FSCA (Field Safety Corrective Actions)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: CANONICAL_EVIDENCE_TYPES.FSCA,
    category: "FSCA",
    description: "Field Safety Corrective Action record (recall, advisory, correction)",
    mdcgSections: ["Section H - FSCAs"],
    fields: [
      {
        name: "fscaId",
        description: "FSCA identifier or reference number",
        semanticHints: ["fsca id", "fsca number", "recall number", "reference", "advisory number", "fsn number"],
        dataType: "string",
        required: true,
        mdcgReference: "H - FSCA reference"
      },
      {
        name: "fscaType",
        description: "Type of field action",
        semanticHints: ["type", "action type", "fsca type", "recall type"],
        dataType: "enum",
        enumValues: ["Recall", "Field Safety Notice", "Correction", "Removal", "Advisory", "Software Update"],
        required: true,
        mdcgReference: "H - Type of FSCA"
      },
      {
        name: "initiationDate",
        description: "Date FSCA was initiated",
        semanticHints: ["initiation date", "start date", "opened", "initiated", "date opened"],
        dataType: "date",
        required: true,
        mdcgReference: "H - Date initiated"
      },
      {
        name: "completionDate",
        description: "Date FSCA was completed/closed",
        semanticHints: ["completion date", "close date", "closed", "completed", "end date"],
        dataType: "date",
        required: false,
      },
      {
        name: "description",
        description: "Description of the safety issue and corrective action",
        semanticHints: ["description", "reason", "issue", "problem", "summary", "details"],
        dataType: "string",
        required: true,
        mdcgReference: "H - Description of issue"
      },
      {
        name: "affectedUnits",
        description: "Number of units affected by the FSCA",
        semanticHints: ["affected units", "units affected", "quantity affected", "scope"],
        dataType: "number",
        required: false,
        mdcgReference: "H - Scope of FSCA"
      },
      {
        name: "affectedLots",
        description: "Lot/batch numbers affected",
        semanticHints: ["affected lots", "lots", "batches", "lot numbers"],
        dataType: "string",
        required: false,
      },
      {
        name: "affectedRegions",
        description: "Geographic regions affected",
        semanticHints: ["regions", "countries", "markets", "affected regions", "geographic scope"],
        dataType: "array",
        required: false,
      },
      {
        name: "deviceCode",
        description: "Product identifier",
        semanticHints: ["device", "product", "model", "sku", "device code"],
        dataType: "string",
        required: false,
      },
      {
        name: "status",
        description: "Current FSCA status",
        semanticHints: ["status", "state", "current status"],
        dataType: "enum",
        enumValues: ["Open", "In Progress", "Completed", "Closed"],
        required: false,
      },
      {
        name: "rootCause",
        description: "Root cause of the safety issue",
        semanticHints: ["root cause", "cause", "reason"],
        dataType: "string",
        required: false,
      },
      {
        name: "competentAuthorities",
        description: "Regulatory authorities notified",
        semanticHints: ["authorities", "regulators", "competent authorities", "notified"],
        dataType: "array",
        required: false,
      }
    ],
    documentIndicators: [
      "fsca", "field safety", "recall", "corrective action", "advisory", "field safety notice",
      "fsn", "product recall", "voluntary recall", "safety alert"
    ],
    tableIndicators: [
      "fsca", "recall", "advisory", "affected", "corrective"
    ],
    minimumConfidenceThreshold: 0.8
  },

  {
    type: CANONICAL_EVIDENCE_TYPES.FSCA_EFFECTIVENESS,
    category: "FSCA",
    description: "FSCA effectiveness verification and completion tracking",
    mdcgSections: ["Section H - FSCAs"],
    fields: [
      {
        name: "fscaId",
        description: "FSCA identifier",
        semanticHints: ["fsca id", "fsca number", "reference"],
        dataType: "string",
        required: true,
      },
      {
        name: "completionPercent",
        description: "Percentage of FSCA completion",
        semanticHints: ["completion percent", "completion %", "progress", "percent complete"],
        dataType: "number",
        required: false,
        validation: { minValue: 0, maxValue: 100 },
      },
      {
        name: "devicesRetrieved",
        description: "Number of devices retrieved/corrected",
        semanticHints: ["devices retrieved", "units retrieved", "corrected", "returned"],
        dataType: "number",
        required: false,
      },
      {
        name: "effectivenessVerified",
        description: "Whether effectiveness has been verified",
        semanticHints: ["effectiveness verified", "verified", "effective", "verification complete"],
        dataType: "boolean",
        required: false,
      },
    ],
    documentIndicators: [
      "fsca effectiveness", "effectiveness check", "fsca completion", "retrieval status"
    ],
    tableIndicators: ["effectiveness", "completion", "retrieved", "verified"],
    minimumConfidenceThreshold: 0.7
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CAPA (Corrective and Preventive Actions)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: CANONICAL_EVIDENCE_TYPES.CAPA,
    category: "CAPA",
    description: "Corrective and Preventive Action record",
    mdcgSections: ["Section I - CAPAs", "Section M - Actions Taken"],
    fields: [
      {
        name: "capaId",
        description: "CAPA identifier or reference number",
        semanticHints: ["capa id", "capa number", "reference", "capa ref", "id"],
        dataType: "string",
        required: true,
      },
      {
        name: "capaType",
        description: "Type of CAPA (Corrective or Preventive)",
        semanticHints: ["type", "capa type"],
        dataType: "enum",
        enumValues: ["Corrective", "Preventive", "Both"],
        required: false,
      },
      {
        name: "openDate",
        description: "Date CAPA was opened",
        semanticHints: ["open date", "opened", "initiation date", "start date", "created"],
        dataType: "date",
        required: true,
      },
      {
        name: "closeDate",
        description: "Date CAPA was closed",
        semanticHints: ["close date", "closed", "completion date", "end date"],
        dataType: "date",
        required: false,
      },
      {
        name: "description",
        description: "Description of the issue requiring CAPA",
        semanticHints: ["description", "issue", "problem", "summary", "details", "nonconformance"],
        dataType: "string",
        required: true,
      },
      {
        name: "source",
        description: "Source that triggered the CAPA",
        semanticHints: ["source", "trigger", "origin", "initiated by"],
        dataType: "string",
        required: false,
      },
      {
        name: "rootCause",
        description: "Determined root cause",
        semanticHints: ["root cause", "cause", "root cause analysis", "rca"],
        dataType: "string",
        required: false,
      },
      {
        name: "correctiveAction",
        description: "Corrective action taken",
        semanticHints: ["corrective action", "correction", "action taken"],
        dataType: "string",
        required: false,
      },
      {
        name: "preventiveAction",
        description: "Preventive action implemented",
        semanticHints: ["preventive action", "prevention", "preventive measure"],
        dataType: "string",
        required: false,
      },
      {
        name: "effectivenessVerification",
        description: "Effectiveness verification status/result",
        semanticHints: ["effectiveness", "verification", "effective", "verified"],
        dataType: "string",
        required: false,
      },
      {
        name: "status",
        description: "Current CAPA status",
        semanticHints: ["status", "state", "current status"],
        dataType: "enum",
        enumValues: ["Open", "In Progress", "Pending Verification", "Closed", "Effective"],
        required: false,
      },
      {
        name: "deviceCode",
        description: "Related product identifier",
        semanticHints: ["device", "product", "model"],
        dataType: "string",
        required: false,
      }
    ],
    documentIndicators: [
      "capa", "corrective action", "preventive action", "nonconformance", "ncr",
      "improvement", "root cause analysis"
    ],
    tableIndicators: [
      "capa", "corrective", "preventive", "root cause", "effectiveness"
    ],
    minimumConfidenceThreshold: 0.7
  },

  {
    type: CANONICAL_EVIDENCE_TYPES.NCR,
    category: "CAPA",
    description: "Non-conformance report that may trigger CAPAs",
    mdcgSections: ["Section I - CAPAs"],
    fields: [
      {
        name: "ncrId",
        description: "NCR identifier",
        semanticHints: ["ncr id", "ncr number", "non-conformance id", "deviation id"],
        dataType: "string",
        required: true,
      },
      {
        name: "description",
        description: "Description of the non-conformance",
        semanticHints: ["description", "non-conformance", "deviation", "issue"],
        dataType: "string",
        required: true,
      },
      {
        name: "openDate",
        description: "Date NCR was opened",
        semanticHints: ["open date", "opened", "date opened", "created"],
        dataType: "date",
        required: false,
      },
      {
        name: "status",
        description: "Current NCR status",
        semanticHints: ["status", "state", "current status"],
        dataType: "enum",
        enumValues: ["Open", "In Progress", "Closed", "Cancelled"],
        required: false,
      },
      {
        name: "linkedCapaId",
        description: "CAPA ID linked to this NCR",
        semanticHints: ["capa id", "linked capa", "capa reference", "related capa"],
        dataType: "string",
        required: false,
      },
    ],
    documentIndicators: [
      "non-conformance", "ncr", "deviation", "nonconformity"
    ],
    tableIndicators: ["ncr", "non-conformance", "deviation"],
    minimumConfidenceThreshold: 0.7
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PMCF (Post-Market Clinical Follow-up)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: CANONICAL_EVIDENCE_TYPES.PMCF_RESULTS,
    category: "PMCF",
    description: "Post-Market Clinical Follow-up result or activity",
    mdcgSections: ["Section J - PMCF", "Section K - Literature Review"],
    fields: [
      {
        name: "studyId",
        description: "Study or activity identifier",
        semanticHints: ["study id", "study number", "protocol number", "activity id", "reference"],
        dataType: "string",
        required: false,
      },
      {
        name: "activityType",
        description: "Type of PMCF activity",
        semanticHints: ["activity type", "type", "study type", "pmcf type"],
        dataType: "enum",
        enumValues: ["Clinical Study", "Registry", "Survey", "Literature Review", "Complaint Analysis", "Other"],
        required: true,
      },
      {
        name: "status",
        description: "Current status of the activity",
        semanticHints: ["status", "state", "study status"],
        dataType: "enum",
        enumValues: ["Planned", "Ongoing", "Completed", "Terminated"],
        required: false,
      },
      {
        name: "startDate",
        description: "Start date of the activity",
        semanticHints: ["start date", "begin", "initiated", "start"],
        dataType: "date",
        required: false,
      },
      {
        name: "endDate",
        description: "End date of the activity",
        semanticHints: ["end date", "completed", "finish", "end"],
        dataType: "date",
        required: false,
      },
      {
        name: "sampleSize",
        description: "Number of subjects/devices in the study",
        semanticHints: ["sample size", "subjects", "patients", "n", "enrollment", "devices"],
        dataType: "number",
        required: false,
      },
      {
        name: "findings",
        description: "Key findings from the activity",
        semanticHints: ["findings", "results", "key findings", "conclusions", "outcomes"],
        dataType: "string",
        required: false,
      },
      {
        name: "safetyConclusion",
        description: "Safety-related conclusions",
        semanticHints: ["safety", "safety conclusion", "safety findings", "adverse events"],
        dataType: "string",
        required: false,
      },
      {
        name: "performanceConclusion",
        description: "Performance-related conclusions",
        semanticHints: ["performance", "efficacy", "effectiveness", "performance conclusion"],
        dataType: "string",
        required: false,
      },
      {
        name: "impactOnBenefitRisk",
        description: "Impact on benefit-risk assessment",
        semanticHints: ["impact", "benefit risk", "b/r impact", "benefit risk impact"],
        dataType: "string",
        required: false,
      }
    ],
    documentIndicators: [
      "pmcf", "post-market clinical", "clinical follow-up", "registry", "clinical study",
      "post-market study", "real world evidence"
    ],
    tableIndicators: [
      "pmcf", "study", "clinical", "patients", "subjects", "findings"
    ],
    minimumConfidenceThreshold: 0.7
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LITERATURE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: CANONICAL_EVIDENCE_TYPES.LITERATURE_FINDINGS,
    category: "Literature",
    description: "Scientific literature search result or review finding",
    mdcgSections: ["Section J - Literature Review"],
    fields: [
      {
        name: "citation",
        description: "Full citation or reference",
        semanticHints: ["citation", "reference", "source", "publication", "article"],
        dataType: "string",
        required: true,
      },
      {
        name: "title",
        description: "Article or publication title",
        semanticHints: ["title", "article title", "paper title"],
        dataType: "string",
        required: false,
      },
      {
        name: "authors",
        description: "Author names",
        semanticHints: ["authors", "author", "by"],
        dataType: "string",
        required: false,
      },
      {
        name: "publicationDate",
        description: "Date of publication",
        semanticHints: ["date", "publication date", "published", "year"],
        dataType: "date",
        required: false,
      },
      {
        name: "journal",
        description: "Journal or publication source",
        semanticHints: ["journal", "source", "publication", "publisher"],
        dataType: "string",
        required: false,
      },
      {
        name: "database",
        description: "Database where found (PubMed, Embase, etc.)",
        semanticHints: ["database", "db", "source database", "pubmed", "embase"],
        dataType: "string",
        required: false,
      },
      {
        name: "abstract",
        description: "Article abstract",
        semanticHints: ["abstract", "summary"],
        dataType: "string",
        required: false,
      },
      {
        name: "relevance",
        description: "Relevance assessment",
        semanticHints: ["relevance", "relevant", "applicable", "pertinent"],
        dataType: "enum",
        enumValues: ["Highly Relevant", "Relevant", "Marginally Relevant", "Not Relevant"],
        required: false,
      },
      {
        name: "findings",
        description: "Key findings relevant to device",
        semanticHints: ["findings", "results", "conclusions", "key points"],
        dataType: "string",
        required: false,
      },
      {
        name: "safetyImplications",
        description: "Safety implications if any",
        semanticHints: ["safety", "safety implications", "adverse", "risk"],
        dataType: "string",
        required: false,
      },
      {
        name: "deviceRelated",
        description: "Whether directly related to the device",
        semanticHints: ["device related", "direct", "specific"],
        dataType: "boolean",
        required: false,
      }
    ],
    documentIndicators: [
      "literature", "literature review", "publication", "article", "paper",
      "pubmed", "embase", "cochrane", "systematic review"
    ],
    tableIndicators: [
      "citation", "author", "journal", "title", "publication"
    ],
    minimumConfidenceThreshold: 0.6
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVICE REGISTRY / ADMINISTRATIVE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: CANONICAL_EVIDENCE_TYPES.DEVICE_IDENTIFICATION,
    category: "Device Master Data",
    description: "Device registration and identification information",
    mdcgSections: ["Section A - Device Identification"],
    fields: [
      {
        name: "deviceName",
        description: "Device trade name",
        semanticHints: ["device name", "name", "trade name", "product name"],
        dataType: "string",
        required: true,
      },
      {
        name: "deviceCode",
        description: "Internal device/product code",
        semanticHints: ["device code", "product code", "sku", "catalog number"],
        dataType: "string",
        required: false,
      },
      {
        name: "model",
        description: "Model number or name",
        semanticHints: ["model", "model number", "model name"],
        dataType: "string",
        required: false,
      },
      {
        name: "udiDi",
        description: "UDI Device Identifier",
        semanticHints: ["udi", "udi-di", "device identifier", "udi di"],
        dataType: "string",
        required: false,
      },
      {
        name: "gmdnCode",
        description: "GMDN code",
        semanticHints: ["gmdn", "gmdn code", "nomenclature"],
        dataType: "string",
        required: false,
      },
      {
        name: "gmdnTerm",
        description: "GMDN term/description",
        semanticHints: ["gmdn term", "gmdn description"],
        dataType: "string",
        required: false,
      },
      {
        name: "riskClass",
        description: "Risk classification",
        semanticHints: ["risk class", "class", "classification", "mdr class"],
        dataType: "enum",
        enumValues: ["I", "IIa", "IIb", "III"],
        required: false,
      },
      {
        name: "intendedPurpose",
        description: "Intended purpose or use",
        semanticHints: ["intended purpose", "intended use", "indication", "purpose"],
        dataType: "string",
        required: false,
      },
      {
        name: "manufacturer",
        description: "Manufacturer name",
        semanticHints: ["manufacturer", "mfg", "made by", "company"],
        dataType: "string",
        required: false,
      },
      {
        name: "certificateNumber",
        description: "CE certificate number",
        semanticHints: ["certificate", "certificate number", "ce mark", "nb certificate"],
        dataType: "string",
        required: false,
      },
      {
        name: "notifiedBody",
        description: "Notified body name/number",
        semanticHints: ["notified body", "nb", "certification body"],
        dataType: "string",
        required: false,
      }
    ],
    documentIndicators: [
      "device", "registration", "udi", "gmdn", "certificate", "classification",
      "intended purpose", "intended use"
    ],
    tableIndicators: [
      "device", "model", "udi", "class", "manufacturer"
    ],
    minimumConfidenceThreshold: 0.7
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BENEFIT-RISK
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: CANONICAL_EVIDENCE_TYPES.BENEFIT_RISK_QUANTIFICATION,
    category: "Risk",
    description: "Benefit-risk assessment or determination",
    mdcgSections: ["Section M - Conclusions", "Section M - Benefit-Risk"],
    fields: [
      {
        name: "assessmentDate",
        description: "Date of assessment",
        semanticHints: ["date", "assessment date", "evaluated"],
        dataType: "date",
        required: false,
      },
      {
        name: "conclusion",
        description: "Overall benefit-risk conclusion",
        semanticHints: ["conclusion", "determination", "result", "assessment"],
        dataType: "enum",
        enumValues: ["Favorable", "Acceptable", "Unchanged", "Adverse Impact", "Unfavorable"],
        required: true,
      },
      {
        name: "benefits",
        description: "Identified clinical benefits",
        semanticHints: ["benefits", "clinical benefits", "advantages"],
        dataType: "string",
        required: false,
      },
      {
        name: "risks",
        description: "Identified risks",
        semanticHints: ["risks", "hazards", "safety concerns"],
        dataType: "string",
        required: false,
      },
      {
        name: "residualRisk",
        description: "Residual risk assessment",
        semanticHints: ["residual risk", "remaining risk", "acceptable risk"],
        dataType: "string",
        required: false,
      },
      {
        name: "riskAcceptability",
        description: "Risk acceptability determination",
        semanticHints: ["acceptability", "acceptable", "risk acceptability"],
        dataType: "enum",
        enumValues: ["Acceptable", "ALARP", "Tolerable", "Not Acceptable"],
        required: false,
      },
      {
        name: "comparisonToStateOfArt",
        description: "Comparison to state of the art",
        semanticHints: ["state of art", "sota", "comparison", "benchmark"],
        dataType: "string",
        required: false,
      },
      {
        name: "newRisksIdentified",
        description: "Whether new risks were identified",
        semanticHints: ["new risks", "emerging risks", "new hazards"],
        dataType: "boolean",
        required: false,
      },
      {
        name: "reasoning",
        description: "Reasoning supporting the conclusion",
        semanticHints: ["reasoning", "rationale", "justification", "basis"],
        dataType: "string",
        required: false,
      }
    ],
    documentIndicators: [
      "benefit risk", "benefit-risk", "b/r", "risk assessment", "clinical benefit",
      "residual risk", "risk acceptability"
    ],
    tableIndicators: [
      "benefit", "risk", "conclusion", "acceptable"
    ],
    minimumConfidenceThreshold: 0.8
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TREND ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: CANONICAL_EVIDENCE_TYPES.STATISTICAL_TRENDING,
    category: "Analysis",
    description: "Statistical trend analysis result",
    mdcgSections: ["Section E - Trend Analysis", "Section G - Signal Detection"],
    fields: [
      {
        name: "metric",
        description: "Metric being analyzed",
        semanticHints: ["metric", "measure", "indicator", "parameter"],
        dataType: "string",
        required: true,
      },
      {
        name: "baselineRate",
        description: "Baseline or historical rate",
        semanticHints: ["baseline", "baseline rate", "historical", "previous"],
        dataType: "number",
        required: false,
      },
      {
        name: "currentRate",
        description: "Current period rate",
        semanticHints: ["current", "current rate", "this period"],
        dataType: "number",
        required: true,
      },
      {
        name: "threshold",
        description: "Alert threshold",
        semanticHints: ["threshold", "limit", "alert level"],
        dataType: "number",
        required: false,
      },
      {
        name: "trendDirection",
        description: "Direction of trend",
        semanticHints: ["trend", "direction", "change"],
        dataType: "enum",
        enumValues: ["Increasing", "Decreasing", "Stable", "No Trend"],
        required: false,
      },
      {
        name: "statisticalSignificance",
        description: "Whether trend is statistically significant",
        semanticHints: ["significant", "significance", "p-value", "statistical"],
        dataType: "boolean",
        required: false,
      },
      {
        name: "signalDetected",
        description: "Whether a safety signal was detected",
        semanticHints: ["signal", "signal detected", "alert"],
        dataType: "boolean",
        required: false,
      },
      {
        name: "conclusion",
        description: "Trend analysis conclusion",
        semanticHints: ["conclusion", "assessment", "determination"],
        dataType: "string",
        required: false,
      },
      {
        name: "periodStart",
        description: "Analysis period start",
        semanticHints: ["from", "start", "period start"],
        dataType: "date",
        required: false,
      },
      {
        name: "periodEnd",
        description: "Analysis period end",
        semanticHints: ["to", "end", "period end"],
        dataType: "date",
        required: false,
      }
    ],
    documentIndicators: [
      "trend", "trend analysis", "statistical", "signal", "threshold",
      "baseline", "rate analysis"
    ],
    tableIndicators: [
      "trend", "baseline", "current", "threshold", "signal"
    ],
    minimumConfidenceThreshold: 0.7
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PMS ACTIVITY LOG
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: CANONICAL_EVIDENCE_TYPES.PMS_ACTIVITY_LOG,
    category: "PMS",
    description: "PMS surveillance activity log with planned and actual dates",
    mdcgSections: ["Section C - PMS Activities", "Section M - Actions Taken"],
    fields: [
      {
        name: "activityId",
        description: "Activity identifier",
        semanticHints: ["activity id", "activity number", "id", "reference"],
        dataType: "string",
        required: false,
      },
      {
        name: "activityType",
        description: "Type of PMS activity",
        semanticHints: ["activity type", "type", "surveillance type"],
        dataType: "string",
        required: true,
      },
      {
        name: "plannedDate",
        description: "Planned date for the activity",
        semanticHints: ["planned date", "scheduled", "due date", "planned"],
        dataType: "date",
        required: false,
      },
      {
        name: "actualDate",
        description: "Actual date the activity was performed",
        semanticHints: ["actual date", "performed", "completed date", "actual"],
        dataType: "date",
        required: false,
      },
      {
        name: "status",
        description: "Activity status",
        semanticHints: ["status", "state", "progress"],
        dataType: "enum",
        enumValues: ["Planned", "In Progress", "Completed", "Overdue", "Cancelled"],
        required: false,
      },
      {
        name: "findings",
        description: "Activity findings or results",
        semanticHints: ["findings", "results", "outcome", "observations"],
        dataType: "string",
        required: false,
      },
    ],
    documentIndicators: [
      "pms activity", "surveillance activity", "post-market surveillance", "pms plan"
    ],
    tableIndicators: ["pms", "activity", "surveillance", "planned", "actual"],
    minimumConfidenceThreshold: 0.7
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PREVIOUS PSUR ACTION STATUS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    type: CANONICAL_EVIDENCE_TYPES.PREVIOUS_PSUR_ACTION_STATUS,
    category: "Previous PSUR",
    description: "Status of actions from previous PSUR (completed, ongoing, effectiveness verified)",
    mdcgSections: ["Section A - Product Info", "Section M - Conclusions"],
    fields: [
      {
        name: "actionId",
        description: "Action identifier from previous PSUR",
        semanticHints: ["action id", "action number", "reference", "id"],
        dataType: "string",
        required: false,
      },
      {
        name: "description",
        description: "Description of the action",
        semanticHints: ["description", "action description", "action", "summary"],
        dataType: "string",
        required: true,
      },
      {
        name: "status",
        description: "Current status of the action",
        semanticHints: ["status", "state", "progress", "current status"],
        dataType: "enum",
        enumValues: ["Completed", "Ongoing", "Overdue", "Cancelled"],
        required: false,
      },
      {
        name: "completionDate",
        description: "Date the action was completed",
        semanticHints: ["completion date", "completed", "closed", "date completed"],
        dataType: "date",
        required: false,
      },
      {
        name: "effectivenessVerified",
        description: "Whether effectiveness has been verified",
        semanticHints: ["effectiveness", "verified", "effective", "verification"],
        dataType: "boolean",
        required: false,
      },
    ],
    documentIndicators: [
      "previous psur", "prior psur", "action status", "follow-up actions"
    ],
    tableIndicators: ["action", "status", "previous", "follow-up"],
    minimumConfidenceThreshold: 0.7
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY LOOKUP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get evidence type definition by type name
 */
export function getEvidenceTypeDefinition(type: string): EvidenceTypeDefinition | undefined {
  return SOTA_EVIDENCE_REGISTRY.find(e => e.type === type);
}

/**
 * Get all evidence types for a category
 */
export function getEvidenceTypesByCategory(category: string): EvidenceTypeDefinition[] {
  return SOTA_EVIDENCE_REGISTRY.filter(e => e.category.toLowerCase() === category.toLowerCase());
}

/**
 * Get all field definitions for an evidence type
 */
export function getFieldsForType(type: string): FieldDefinition[] {
  const def = getEvidenceTypeDefinition(type);
  return def?.fields || [];
}

/**
 * Get required fields for an evidence type
 */
export function getRequiredFields(type: string): FieldDefinition[] {
  return getFieldsForType(type).filter(f => f.required);
}

/**
 * Get all categories
 */
export function getAllCategories(): string[] {
  return Array.from(new Set(SOTA_EVIDENCE_REGISTRY.map(e => e.category)));
}

/**
 * Get all evidence types
 */
export function getAllEvidenceTypes(): string[] {
  return SOTA_EVIDENCE_REGISTRY.map(e => e.type);
}

/**
 * Build semantic hints lookup for fast matching
 */
export function buildSemanticHintsMap(): Map<string, { type: string; field: string }[]> {
  const map = new Map<string, { type: string; field: string }[]>();
  
  for (const evidenceType of SOTA_EVIDENCE_REGISTRY) {
    for (const field of evidenceType.fields) {
      for (const hint of field.semanticHints) {
        const normalizedHint = hint.toLowerCase().trim();
        if (!map.has(normalizedHint)) {
          map.set(normalizedHint, []);
        }
        map.get(normalizedHint)!.push({
          type: evidenceType.type,
          field: field.name
        });
      }
    }
  }
  
  return map;
}

// Pre-build the semantic hints map for fast lookup
export const SEMANTIC_HINTS_MAP = buildSemanticHintsMap();

/**
 * Find potential field matches for a column header
 */
export function findPotentialFieldMatches(
  columnHeader: string
): { type: string; field: string; matchType: "exact" | "partial" | "contains" }[] {
  const normalized = columnHeader.toLowerCase().trim();
  const matches: { type: string; field: string; matchType: "exact" | "partial" | "contains" }[] = [];
  
  // Exact match
  const exactMatches = SEMANTIC_HINTS_MAP.get(normalized);
  if (exactMatches) {
    for (const m of exactMatches) {
      matches.push({ ...m, matchType: "exact" });
    }
  }
  
  // Partial/contains matching
  for (const [hint, fieldMatches] of SEMANTIC_HINTS_MAP.entries()) {
    if (hint !== normalized) {
      if (normalized.includes(hint) || hint.includes(normalized)) {
        for (const m of fieldMatches) {
          if (!matches.find(existing => existing.type === m.type && existing.field === m.field)) {
            matches.push({ ...m, matchType: normalized.includes(hint) ? "contains" : "partial" });
          }
        }
      }
    }
  }
  
  return matches;
}
