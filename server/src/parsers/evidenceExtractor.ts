/**
 * Intelligent Evidence Extractor
 * Analyzes parsed documents and extracts evidence atoms based on content patterns
 */

import { ParsedDocument, ParsedTable, ParsedSection } from "./documentParser";
import { createHash } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EvidenceType {
  type: string;
  category: string;
  description: string;
  requiredFields: string[];
  optionalFields: string[];
  indicators: string[]; // Keywords/patterns that indicate this evidence type
}

export interface ExtractedEvidence {
  evidenceType: string;
  confidence: number; // 0-1
  source: "table" | "section" | "content";
  sourceName: string;
  data: Record<string, unknown>;
  rawContent: string;
  extractionMethod: string;
  warnings: string[];
}

export interface ExtractionResult {
  documentId: string;
  filename: string;
  extractedEvidence: ExtractedEvidence[];
  unmatchedContent: string[];
  suggestions: string[];
  processingTime: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const EVIDENCE_TYPES: EvidenceType[] = [
  // Sales & Distribution
  {
    type: "sales_summary",
    category: "Sales",
    description: "Summary of sales volume data",
    requiredFields: ["period_start", "period_end"],
    optionalFields: ["total_units", "region", "market_share"],
    indicators: ["sales", "sold", "units", "volume", "revenue", "distribution"],
  },
  {
    type: "sales_by_region",
    category: "Sales",
    description: "Regional breakdown of sales",
    requiredFields: ["region", "quantity"],
    optionalFields: ["period_start", "period_end", "country", "market_share"],
    indicators: ["region", "country", "geography", "market", "territory"],
  },
  {
    type: "distribution_summary",
    category: "Sales",
    description: "Distribution channel summary",
    requiredFields: ["channel", "quantity"],
    optionalFields: ["region", "period"],
    indicators: ["distribution", "channel", "distributor", "shipped"],
  },
  {
    type: "usage_estimate",
    category: "Sales",
    description: "Device usage and exposure estimates",
    requiredFields: ["metric", "value"],
    optionalFields: ["source", "methodology"],
    indicators: ["usage", "exposure", "patient", "procedure", "implant"],
  },

  // Complaints & Incidents
  {
    type: "complaint_record",
    category: "Complaints",
    description: "Individual complaint record",
    requiredFields: ["complaint_type", "date"],
    optionalFields: ["description", "region", "severity", "status", "resolution"],
    indicators: ["complaint", "feedback", "issue", "problem", "concern", "reported"],
  },
  {
    type: "complaint_summary",
    category: "Complaints",
    description: "Summary of complaint data",
    requiredFields: ["complaint_type", "count"],
    optionalFields: ["rate", "trend", "period"],
    indicators: ["summary", "total", "count", "aggregat"],
  },
  {
    type: "complaints_by_region",
    category: "Complaints",
    description: "Regional complaint breakdown",
    requiredFields: ["region", "count"],
    optionalFields: ["serious", "non_serious"],
    indicators: ["region", "country", "by location"],
  },
  {
    type: "serious_incident_summary",
    category: "Incidents",
    description: "Summary of serious incidents",
    requiredFields: ["count"],
    optionalFields: ["description", "outcome", "period"],
    indicators: ["serious", "incident", "adverse event", "mdr", "vigilance"],
  },
  {
    type: "serious_incident_records_imdrf",
    category: "Incidents",
    description: "Serious incident with IMDRF coding",
    requiredFields: ["imdrf_code", "description"],
    optionalFields: ["count", "outcome", "date"],
    indicators: ["imdrf", "E0", "A0", "coding", "classification"],
  },
  {
    type: "vigilance_report",
    category: "Incidents",
    description: "Regulatory vigilance report data",
    requiredFields: ["report_type", "date"],
    optionalFields: ["authority", "outcome", "status"],
    indicators: ["vigilance", "mdr", "medsafe", "report", "notification"],
  },
  {
    type: "customer_feedback_summary",
    category: "Complaints",
    description: "Customer feedback summary",
    requiredFields: ["feedback_type"],
    optionalFields: ["count", "sentiment", "action_required"],
    indicators: ["feedback", "survey", "satisfaction", "customer"],
  },

  // FSCA & CAPA
  {
    type: "fsca_record",
    category: "FSCA",
    description: "Field Safety Corrective Action record",
    requiredFields: ["fsca_id"],
    optionalFields: ["action_type", "date", "status", "affected_units", "description"],
    indicators: ["fsca", "field safety", "corrective action", "recall", "advisory"],
  },
  {
    type: "fsca_summary",
    category: "FSCA",
    description: "Summary of FSCA activities",
    requiredFields: [],
    optionalFields: ["total_fscas", "period", "status"],
    indicators: ["fsca summary", "field safety summary", "recall summary"],
  },
  {
    type: "capa_record",
    category: "CAPA",
    description: "Corrective and Preventive Action record",
    requiredFields: ["description"],
    optionalFields: ["capa_id", "date", "status", "effectiveness", "root_cause"],
    indicators: ["capa", "corrective", "preventive", "action", "improvement"],
  },
  {
    type: "capa_summary",
    category: "CAPA",
    description: "Summary of CAPA activities",
    requiredFields: [],
    optionalFields: ["total_capas", "open", "closed", "effectiveness"],
    indicators: ["capa summary", "corrective action summary"],
  },

  // Literature & External
  {
    type: "literature_search_strategy",
    category: "Literature",
    description: "Literature search methodology",
    requiredFields: ["database"],
    optionalFields: ["search_terms", "date_range", "inclusion_criteria"],
    indicators: ["search strategy", "methodology", "database", "pubmed", "embase"],
  },
  {
    type: "literature_review_summary",
    category: "Literature",
    description: "Summary of literature review findings",
    requiredFields: ["database", "results_count"],
    optionalFields: ["relevant_count", "conclusion", "date"],
    indicators: ["literature", "review", "publication", "article", "findings"],
  },
  {
    type: "external_db_query_log",
    category: "External",
    description: "External database search log",
    requiredFields: ["database", "query_date"],
    optionalFields: ["search_terms", "results"],
    indicators: ["maude", "eudamed", "database", "query", "search"],
  },
  {
    type: "external_db_summary",
    category: "External",
    description: "External database search summary",
    requiredFields: ["database"],
    optionalFields: ["adverse_events", "recalls", "findings"],
    indicators: ["external", "database", "summary", "maude", "eudamed"],
  },

  // PMCF
  {
    type: "pmcf_summary",
    category: "PMCF",
    description: "Post-Market Clinical Follow-up summary",
    requiredFields: ["status"],
    optionalFields: ["key_findings", "enrolled", "activities"],
    indicators: ["pmcf", "post-market", "clinical follow-up", "registry"],
  },
  {
    type: "pmcf_activity_record",
    category: "PMCF",
    description: "PMCF activity record",
    requiredFields: ["activity_type"],
    optionalFields: ["status", "start_date", "enrolled", "findings"],
    indicators: ["pmcf activity", "study", "survey", "registry"],
  },
  {
    type: "pmcf_report_extract",
    category: "PMCF",
    description: "Extract from PMCF report",
    requiredFields: ["content"],
    optionalFields: ["section", "findings"],
    indicators: ["pmcf report", "clinical data", "follow-up data"],
  },

  // Risk & Safety
  {
    type: "benefit_risk_assessment",
    category: "Risk",
    description: "Benefit-risk assessment data",
    requiredFields: ["conclusion"],
    optionalFields: ["benefits", "risks", "assessment", "summary"],
    indicators: ["benefit", "risk", "assessment", "conclusion", "favorable"],
  },
  {
    type: "rmf_extract",
    category: "Risk",
    description: "Risk Management File extract",
    requiredFields: ["content"],
    optionalFields: ["risk_level", "mitigation", "residual_risk"],
    indicators: ["rmf", "risk management", "risk file", "hazard", "harm"],
  },
  {
    type: "trend_analysis",
    category: "Trend",
    description: "Trend analysis data",
    requiredFields: ["metric"],
    optionalFields: ["previous_value", "current_value", "trend", "assessment"],
    indicators: ["trend", "analysis", "signal", "threshold", "statistic"],
  },
  {
    type: "signal_log",
    category: "Trend",
    description: "Safety signal detection log",
    requiredFields: ["signal_type"],
    optionalFields: ["detection_date", "status", "action"],
    indicators: ["signal", "detection", "alert", "threshold"],
  },

  // Device & Regulatory
  {
    type: "device_registry_record",
    category: "Device",
    description: "Device registry information",
    requiredFields: ["device_name"],
    optionalFields: ["model", "udi_di", "risk_class", "intended_purpose"],
    indicators: ["device", "model", "udi", "catalog", "product"],
  },
  {
    type: "manufacturer_profile",
    category: "Device",
    description: "Manufacturer information",
    requiredFields: ["manufacturer_name"],
    optionalFields: ["address", "srn", "contact"],
    indicators: ["manufacturer", "company", "organization", "srn"],
  },
  {
    type: "regulatory_certificate_record",
    category: "Regulatory",
    description: "Regulatory certificate data",
    requiredFields: ["certificate_type"],
    optionalFields: ["certificate_number", "notified_body", "issue_date", "expiry_date"],
    indicators: ["certificate", "ce mark", "notified body", "approval", "registration"],
  },
  {
    type: "ifu_extract",
    category: "Device",
    description: "Instructions for Use extract",
    requiredFields: ["content"],
    optionalFields: ["section", "version"],
    indicators: ["ifu", "instructions", "use", "indication", "contraindication"],
  },
  {
    type: "cer_extract",
    category: "Clinical",
    description: "Clinical Evaluation Report extract",
    requiredFields: ["content"],
    optionalFields: ["section", "findings", "version"],
    indicators: ["cer", "clinical evaluation", "clinical evidence", "clinical data"],
  },
  {
    type: "clinical_evaluation_extract",
    category: "Clinical",
    description: "Clinical evaluation data",
    requiredFields: ["content"],
    optionalFields: ["section", "key_findings"],
    indicators: ["clinical", "evaluation", "evidence", "study"],
  },

  // PMS & Changes
  {
    type: "pms_plan_extract",
    category: "PMS",
    description: "Post-Market Surveillance Plan extract",
    requiredFields: ["content"],
    optionalFields: ["section", "activities"],
    indicators: ["pms", "surveillance", "plan", "monitoring"],
  },
  {
    type: "pms_activity_log",
    category: "PMS",
    description: "PMS activity log",
    requiredFields: ["activity"],
    optionalFields: ["date", "status", "findings"],
    indicators: ["pms activity", "surveillance activity", "monitoring"],
  },
  {
    type: "change_control_record",
    category: "Changes",
    description: "Change control record",
    requiredFields: ["description"],
    optionalFields: ["date", "status", "impact"],
    indicators: ["change", "modification", "update", "revision", "version"],
  },
  {
    type: "previous_psur_extract",
    category: "PSUR",
    description: "Previous PSUR reference",
    requiredFields: ["psur_reference"],
    optionalFields: ["period", "findings", "actions"],
    indicators: ["previous psur", "prior", "last report"],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════════

export async function extractEvidence(
  document: ParsedDocument,
  sourceType?: string
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const result: ExtractionResult = {
    documentId: document.contentHash,
    filename: document.filename,
    extractedEvidence: [],
    unmatchedContent: [],
    suggestions: [],
    processingTime: 0,
  };

  // Extract from tables
  for (const table of document.tables) {
    const tableEvidence = extractFromTable(table, document.filename);
    result.extractedEvidence.push(...tableEvidence);
  }

  // Extract from sections
  for (const section of document.sections) {
    const sectionEvidence = extractFromSection(section, document.filename);
    result.extractedEvidence.push(...sectionEvidence);
  }

  // If source type is specified, prioritize matching evidence types
  if (sourceType) {
    result.extractedEvidence = prioritizeBySourceType(result.extractedEvidence, sourceType);
  }

  // Remove duplicates and low-confidence extractions
  result.extractedEvidence = deduplicateEvidence(result.extractedEvidence);

  // Generate suggestions for unmatched content
  result.suggestions = generateSuggestions(document, result.extractedEvidence);

  result.processingTime = Date.now() - startTime;
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

function extractFromTable(table: ParsedTable, filename: string): ExtractedEvidence[] {
  const evidence: ExtractedEvidence[] = [];
  const headers = table.headers.map(h => h.toLowerCase());
  const headerText = headers.join(" ");

  // Score each evidence type against this table's headers
  const scores: { type: EvidenceType; score: number }[] = [];
  
  for (const evidenceType of EVIDENCE_TYPES) {
    let score = 0;
    
    // Check required fields
    let hasRequired = true;
    for (const field of evidenceType.requiredFields) {
      const fieldLower = field.toLowerCase();
      if (!headers.some(h => h.includes(fieldLower) || fieldLower.includes(h))) {
        hasRequired = false;
      }
    }
    
    // Check indicators in headers
    for (const indicator of evidenceType.indicators) {
      if (headerText.includes(indicator.toLowerCase())) {
        score += 2;
      }
    }
    
    // Check optional fields (bonus points)
    for (const field of evidenceType.optionalFields) {
      if (headers.some(h => h.includes(field.toLowerCase()))) {
        score += 1;
      }
    }
    
    // Bonus for matching required fields
    if (hasRequired && evidenceType.requiredFields.length > 0) {
      score += 5;
    }
    
    if (score > 0) {
      scores.push({ type: evidenceType, score });
    }
  }
  
  // Sort by score and take top match
  scores.sort((a, b) => b.score - a.score);
  
  if (scores.length > 0 && scores[0].score >= 2) {
    const bestMatch = scores[0];
    const confidence = Math.min(1, bestMatch.score / 10);
    
    // Extract each row as a separate evidence record
    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i];
      
      // Map headers to normalized field names
      const data = mapFieldsToEvidence(row, bestMatch.type);
      
      evidence.push({
        evidenceType: bestMatch.type.type,
        confidence,
        source: "table",
        sourceName: table.name,
        data,
        rawContent: JSON.stringify(row),
        extractionMethod: `Table header matching (score: ${bestMatch.score})`,
        warnings: confidence < 0.5 ? ["Low confidence match - review recommended"] : [],
      });
    }
  }
  
  return evidence;
}

function mapFieldsToEvidence(row: Record<string, unknown>, evidenceType: EvidenceType): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  
  // Field name mappings
  const fieldMappings: Record<string, string[]> = {
    // Sales fields
    region: ["region", "country", "geography", "territory", "market"],
    quantity: ["quantity", "units", "count", "volume", "sold", "amount"],
    period_start: ["period_start", "start_date", "from", "start", "period start"],
    period_end: ["period_end", "end_date", "to", "end", "period end"],
    market_share: ["market_share", "share", "percentage", "market %"],
    
    // Complaint fields
    complaint_type: ["complaint_type", "type", "category", "classification"],
    date: ["date", "reported_date", "occurrence_date", "event_date"],
    description: ["description", "details", "narrative", "summary", "comments"],
    severity: ["severity", "serious", "seriousness", "impact"],
    status: ["status", "state", "current_status"],
    
    // FSCA fields
    fsca_id: ["fsca_id", "fsca", "id", "reference", "number"],
    action_type: ["action_type", "type", "action", "corrective_action"],
    affected_units: ["affected_units", "units_affected", "quantity"],
    
    // CAPA fields
    capa_id: ["capa_id", "capa", "id", "reference"],
    root_cause: ["root_cause", "cause", "reason"],
    effectiveness: ["effectiveness", "effective", "verification"],
    
    // IMDRF
    imdrf_code: ["imdrf_code", "imdrf", "code", "event_code"],
    outcome: ["outcome", "patient_outcome", "result"],
    
    // Literature
    database: ["database", "source", "db"],
    results_count: ["results_count", "results", "hits", "count"],
    relevant_count: ["relevant_count", "relevant", "applicable"],
    conclusion: ["conclusion", "summary", "finding", "assessment"],
    
    // PMCF
    activity_type: ["activity_type", "type", "activity"],
    enrolled: ["enrolled", "subjects", "patients", "participants"],
    key_findings: ["key_findings", "findings", "results"],
    
    // General
    content: ["content", "text", "body", "narrative"],
    value: ["value", "amount", "number"],
    metric: ["metric", "measure", "indicator", "kpi"],
  };
  
  for (const [key, value] of Object.entries(row)) {
    const keyLower = key.toLowerCase().replace(/[_\s]+/g, "_");
    
    // Try to find a mapping
    let mappedKey = keyLower;
    for (const [targetField, aliases] of Object.entries(fieldMappings)) {
      if (aliases.some(alias => keyLower.includes(alias) || alias.includes(keyLower))) {
        mappedKey = targetField;
        break;
      }
    }
    
    mapped[mappedKey] = value;
  }
  
  return mapped;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

function extractFromSection(section: ParsedSection, filename: string): ExtractedEvidence[] {
  const evidence: ExtractedEvidence[] = [];
  const contentLower = (section.title + " " + section.content).toLowerCase();
  
  // Score evidence types against section content
  const scores: { type: EvidenceType; score: number }[] = [];
  
  for (const evidenceType of EVIDENCE_TYPES) {
    let score = 0;
    
    for (const indicator of evidenceType.indicators) {
      const regex = new RegExp(`\\b${indicator.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, "gi");
      const matches = contentLower.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    
    if (score > 0) {
      scores.push({ type: evidenceType, score });
    }
  }
  
  scores.sort((a, b) => b.score - a.score);
  
  // Take top matches
  const topMatches = scores.slice(0, 3).filter(s => s.score >= 2);
  
  for (const match of topMatches) {
    const confidence = Math.min(1, match.score / 15);
    
    evidence.push({
      evidenceType: match.type.type,
      confidence,
      source: "section",
      sourceName: section.title,
      data: {
        content: section.content,
        section: section.title,
        level: section.level,
      },
      rawContent: section.content.substring(0, 1000),
      extractionMethod: `Section content analysis (score: ${match.score})`,
      warnings: confidence < 0.5 ? ["Low confidence - manual review recommended"] : [],
    });
  }
  
  return evidence;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function prioritizeBySourceType(evidence: ExtractedEvidence[], sourceType: string): ExtractedEvidence[] {
  const sourceTypeMap: Record<string, string[]> = {
    sales: ["sales_summary", "sales_by_region", "distribution_summary", "usage_estimate"],
    complaints: ["complaint_record", "complaint_summary", "complaints_by_region", "serious_incident_summary", "serious_incident_records_imdrf", "vigilance_report", "customer_feedback_summary"],
    fsca: ["fsca_record", "fsca_summary"],
    capa: ["capa_record", "capa_summary"],
    pmcf: ["pmcf_summary", "pmcf_activity_record", "pmcf_report_extract"],
    literature: ["literature_search_strategy", "literature_review_summary"],
    external_db: ["external_db_query_log", "external_db_summary"],
    risk: ["benefit_risk_assessment", "rmf_extract", "trend_analysis", "signal_log"],
    cer: ["cer_extract", "clinical_evaluation_extract", "device_registry_record"],
  };
  
  const priorityTypes = sourceTypeMap[sourceType.toLowerCase()] || [];
  
  return evidence.map(e => {
    if (priorityTypes.includes(e.evidenceType)) {
      return { ...e, confidence: Math.min(1, e.confidence + 0.2) };
    }
    return e;
  }).sort((a, b) => b.confidence - a.confidence);
}

function deduplicateEvidence(evidence: ExtractedEvidence[]): ExtractedEvidence[] {
  const seen = new Map<string, ExtractedEvidence>();
  
  for (const e of evidence) {
    const key = `${e.evidenceType}:${createHash("md5").update(e.rawContent).digest("hex")}`;
    const existing = seen.get(key);
    
    if (!existing || e.confidence > existing.confidence) {
      seen.set(key, e);
    }
  }
  
  return Array.from(seen.values())
    .filter(e => e.confidence >= 0.3)
    .sort((a, b) => b.confidence - a.confidence);
}

function generateSuggestions(document: ParsedDocument, extracted: ExtractedEvidence[]): string[] {
  const suggestions: string[] = [];
  const extractedTypes = new Set(extracted.map(e => e.evidenceType));
  
  // Suggest based on document type
  if (document.documentType === "excel" && document.tables.length > 0) {
    if (!extractedTypes.has("sales_by_region") && !extractedTypes.has("sales_summary")) {
      suggestions.push("Consider mapping a table to sales data if this contains sales information");
    }
  }
  
  if (document.documentType === "docx" || document.documentType === "pdf") {
    if (!extractedTypes.has("cer_extract") && document.rawText.toLowerCase().includes("clinical")) {
      suggestions.push("Document may contain clinical evaluation data - consider CER extract mapping");
    }
    if (!extractedTypes.has("pmcf_summary") && document.rawText.toLowerCase().includes("pmcf")) {
      suggestions.push("Document may contain PMCF data - consider PMCF summary mapping");
    }
  }
  
  if (extracted.length === 0) {
    suggestions.push("No evidence types automatically detected - use manual mapping");
  }
  
  return suggestions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export function getEvidenceTypeInfo(type: string): EvidenceType | undefined {
  return EVIDENCE_TYPES.find(t => t.type === type);
}

export function getEvidenceTypesByCategory(category: string): EvidenceType[] {
  return EVIDENCE_TYPES.filter(t => t.category.toLowerCase() === category.toLowerCase());
}

export function getAllCategories(): string[] {
  return [...new Set(EVIDENCE_TYPES.map(t => t.category))];
}
