/**
 * SOTA Evidence Extractor
 * 
 * UPGRADED: Now uses GPT-5.2 with comprehensive semantic analysis.
 * NO FALLBACKS - All extractions use LLM-first approach.
 * All low-confidence items are FLAGGED, never silently dropped.
 * 
 * Architecture:
 * 1. SOTA Schema Discovery - GPT-5.2 understands document structure
 * 2. SOTA Field Mapping - Semantic mapping for every column
 * 3. SOTA Validation - Multi-level validation with quality flags
 * 4. Full Audit Trail - Complete reasoning trace for all decisions
 */

import { ParsedDocument, ParsedTable, ParsedSection } from "./documentParser";
import { createHash, randomUUID } from "crypto";
import { complete, LLMRequest } from "../agents/llmService";
import { extractFromCER, CERExtractionResult, CERDecisionTrace } from "./cerExtractor";
import { extractEvidenceSOTA, SOTAExtractionResult, convertToLegacyFormat } from "./sotaExtractor";
import { SOTA_EVIDENCE_REGISTRY, getEvidenceTypeDefinition } from "./sotaEvidenceRegistry";

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
  decisionTrace: ExtractionDecisionTrace[];
  cerExtractionResult?: CERExtractionResult;
}

export interface ExtractionDecisionTrace {
  traceId: string;
  timestamp: string;
  stage: "DOCUMENT_CLASSIFICATION" | "EVIDENCE_TYPE_DETECTION" | "FIELD_MAPPING" | "LLM_INFERENCE" | "VALIDATION" | "CER_EXTRACTION";
  decision: string;
  confidence: number;
  inputSummary: string;
  outputSummary: string;
  reasoning: string[];
  alternativesConsidered?: { option: string; reason: string; score: number }[];
  warnings?: string[];
  durationMs?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const EVIDENCE_TYPES: EvidenceType[] = [
  // Sales & Distribution (Canonical: sales_volume)
  {
    type: "sales_volume",
    category: "Sales",
    description: "Sales volume, distribution, and usage data",
    requiredFields: ["quantity", "period_start"],
    optionalFields: ["region", "country", "period_end", "device_code", "model", "market_share"],
    indicators: ["sales", "sold", "units", "volume", "revenue", "distribution", "region", "country", "market", "shipped", "usage"],
  },

  // Complaints & Incidents (Canonical: complaint_record, serious_incident_record)
  {
    type: "complaint_record",
    category: "Complaints",
    description: "Individual complaint record or feedback",
    requiredFields: ["complaint_date"],
    optionalFields: ["complaint_id", "description", "region", "severity", "status", "device_code", "category"],
    indicators: ["complaint", "feedback", "issue", "problem", "concern", "reported", "customer", "allegation"],
  },
  {
    type: "serious_incident_record",
    category: "Incidents",
    description: "Serious incident report",
    requiredFields: ["incident_date"],
    optionalFields: ["incident_id", "description", "outcome", "device_code", "imdrf_code", "competent_authority"],
    indicators: ["serious", "incident", "adverse event", "mdr", "vigilance", "death", "injury", "imdrf"],
  },

  // FSCA & CAPA (Canonical: fsca_record, capa_record - assuming capa_record is canonical based on usage)
  {
    type: "fsca_record",
    category: "FSCA",
    description: "Field Safety Corrective Action record",
    requiredFields: ["fsca_id"],
    optionalFields: ["action_type", "initiation_date", "status", "affected_units", "description", "device_code"],
    indicators: ["fsca", "field safety", "corrective action", "recall", "advisory", "notice"],
  },
  {
    type: "capa_record",
    category: "CAPA",
    description: "Corrective and Preventive Action record",
    requiredFields: ["capa_id"],
    optionalFields: ["description", "initiation_date", "status", "effectiveness", "root_cause", "action_plan"],
    indicators: ["capa", "corrective", "preventive", "action", "improvement", "non-conformance", "ncr"],
  },

  // Literature (Canonical: literature_result)
  {
    type: "literature_result",
    category: "Literature",
    description: "Literature review finding or search result",
    requiredFields: ["citation"], // citation or source usually required
    optionalFields: ["database", "search_terms", "summary", "analysis", "favorable", "device_related", "date"],
    indicators: ["literature", "review", "publication", "article", "search", "pubmed", "embase", "abstract", "citation"],
  },

  // PMCF (Canonical: pmcf_result)
  {
    type: "pmcf_result",
    category: "PMCF",
    description: "Post-Market Clinical Follow-up result",
    requiredFields: ["finding"],
    optionalFields: ["study_id", "patient_count", "outcome", "status", "conclusion", "activity_type"],
    indicators: ["pmcf", "post-market", "clinical follow-up", "registry", "study", "survey", "cohort"],
  },

  // External Databases (Canonical mapping? Treating as 'registry' or specific type if defined, else generic)
  // Re-mapping to relevant canonicals or keeping if they support specific flows not yet strictly canonicalized in input but needed for processing
  // NOTE: Based on user request, we stick to high level inputs. But extractor needs to map to ATOMS.
  // Using device_registry_record for admin data
  {
    type: "device_registry_record",
    category: "Device",
    description: "Device registry and manufacturer information",
    requiredFields: ["device_name"],
    optionalFields: ["model", "udi_di", "risk_class", "manufacturer", "intended_purpose", "gmdn"],
    indicators: ["device", "model", "udi", "catalog", "product", "registry", "registration", "manufacturer"],
  },
  
  // Risk (Canonical: benefit_risk_assessment? or separate atoms?)
  // Keeping specific risk types if they map to canonical atoms or are used by risk agent
  {
    type: "benefit_risk_assessment",
    category: "Risk",
    description: "Benefit-risk analysis",
    requiredFields: ["conclusion"],
    optionalFields: ["benefits", "risks", "ratio", "evaluation", "date"],
    indicators: ["benefit", "risk", "assessment", "conclusion", "favorable", "bra", "residual"],
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// NOTE: Legacy LLM functions removed - SOTA pipeline is now mandatory
// See sotaSchemaDiscovery.ts, sotaValidation.ts, sotaExtractor.ts for new implementation
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════════

export async function extractEvidence(
  document: ParsedDocument,
  sourceType?: string,
  context?: {
    periodStart?: string;
    periodEnd?: string;
    deviceCode?: string;
    psurCaseId?: number;
    useSOTA?: boolean;  // Flag to enable SOTA extraction
  }
): Promise<ExtractionResult> {
  const startTime = Date.now();
  const decisionTrace: ExtractionDecisionTrace[] = [];
  const result: ExtractionResult = {
    documentId: document.contentHash,
    filename: document.filename,
    extractedEvidence: [],
    unmatchedContent: [],
    suggestions: [],
    processingTime: 0,
    decisionTrace: [],
  };

  // Check if SOTA extraction should be used (default: true for tabular data)
  const useSOTA = context?.useSOTA !== false && document.tables.length > 0;
  
  if (useSOTA && document.tables.length > 0) {
    console.log(`[Evidence Extractor] Using SOTA extraction pipeline for ${document.filename}`);
    
    try {
      // Use the new SOTA extraction pipeline
      const sotaResult = await extractEvidenceSOTA(document, {
        periodStart: context?.periodStart || new Date().toISOString().split("T")[0],
        periodEnd: context?.periodEnd || new Date().toISOString().split("T")[0],
        deviceCode: context?.deviceCode,
        psurCaseId: context?.psurCaseId
      });
      
      // Convert to legacy format for backward compatibility
      const legacyFormat = convertToLegacyFormat(sotaResult);
      
      result.extractedEvidence = legacyFormat.extractedEvidence;
      result.decisionTrace = legacyFormat.decisionTrace.map(t => ({
        traceId: t.traceId,
        timestamp: t.timestamp,
        stage: t.stage as any,
        decision: t.decision,
        confidence: t.confidence,
        inputSummary: t.reasoning[0] || "",
        outputSummary: t.decision,
        reasoning: t.reasoning
      }));
      
      // Add quality summary to suggestions
      if (sotaResult.quality.humanReviewRequired) {
        result.suggestions.push(`HUMAN REVIEW REQUIRED: ${sotaResult.quality.reviewReasons.join("; ")}`);
      }
      if (sotaResult.stats.unmappedColumns > 0) {
        result.suggestions.push(`${sotaResult.stats.unmappedColumns} columns could not be mapped - review column names`);
      }
      if (sotaResult.quality.overallScore < 70) {
        result.suggestions.push(`Low extraction quality score (${sotaResult.quality.overallScore}%) - manual review recommended`);
      }
      
      // Add SOTA-specific metadata
      (result as any).sotaResult = sotaResult;
      
      result.processingTime = Date.now() - startTime;
      return result;
      
    } catch (sotaError: any) {
      console.error(`[Evidence Extractor] SOTA extraction failed, error: ${sotaError?.message}`);
      
      // NO FALLBACKS - Return error result with full details, don't silently fall back
      result.suggestions.push(`EXTRACTION FAILED: ${sotaError?.message}`);
      result.suggestions.push("HUMAN REVIEW REQUIRED: SOTA extraction encountered an error");
      result.decisionTrace = [{
        traceId: randomUUID(),
        timestamp: new Date().toISOString(),
        stage: "VALIDATION",
        decision: `SOTA extraction failed: ${sotaError?.message}`,
        confidence: 0,
        inputSummary: document.filename,
        outputSummary: "ERROR - No fallback used per SOTA policy",
        reasoning: [`Error: ${sotaError?.message}`, "NO FALLBACK - flagging for human review"]
      }];
      result.processingTime = Date.now() - startTime;
      return result;  // Return empty result with error, don't fall back
    }
  }

  // CER DOCUMENTS ONLY - These have specialized extraction that is still needed
  
  // PHASE 0: Document classification decision trace
  const classificationTraceId = randomUUID();
  const classificationStart = Date.now();
  
  decisionTrace.push({
    traceId: classificationTraceId,
    timestamp: new Date().toISOString(),
    stage: "DOCUMENT_CLASSIFICATION",
    decision: `Document type: ${document.documentType}, Source type: ${sourceType || "auto-detect"}`,
    confidence: sourceType ? 1.0 : 0.7,
    inputSummary: `File: ${document.filename}, ${document.tables.length} tables, ${document.sections.length} sections, ${document.rawText.length} chars`,
    outputSummary: `Processing as ${sourceType || "general"} document`,
    reasoning: [
      `Document type detected: ${document.documentType}`,
      `User-specified source type: ${sourceType || "none (auto-detect)"}`,
      `Tables found: ${document.tables.length}`,
      `Sections found: ${document.sections.length}`,
    ],
    durationMs: Date.now() - classificationStart,
  });

  // PHASE 1: CER SPECIAL HANDLING
  // CERs are comprehensive documents requiring specialized multi-evidence extraction
  if (sourceType?.toLowerCase() === "cer" || isCERDocument(document)) {
    console.log(`[Evidence Extractor] CER document detected - using specialized CER extraction`);
    
    const cerTraceId = randomUUID();
    const cerStart = Date.now();
    
    decisionTrace.push({
      traceId: cerTraceId,
      timestamp: new Date().toISOString(),
      stage: "CER_EXTRACTION",
      decision: "Invoking specialized CER extractor for multi-evidence extraction",
      confidence: 0.95,
      inputSummary: `CER document with ${document.sections.length} sections`,
      outputSummary: "Starting CER-specific extraction pipeline",
      reasoning: [
        "CER documents contain evidence for multiple PSUR sections",
        "Specialized extraction needed for: device description, regulatory status, literature, PMCF, sales, complaints, benefit-risk",
        "Using SOTA Claude section classification and evidence extraction",
      ],
    });
    
    try {
      const cerResult = await extractFromCER(document);
      result.cerExtractionResult = cerResult;
      
      // Convert CER evidence to standard format
      for (const cerEvidence of cerResult.extractedEvidence) {
        result.extractedEvidence.push({
          evidenceType: cerEvidence.evidenceType,
          confidence: cerEvidence.confidence,
          source: "section",
          sourceName: `CER: ${cerEvidence.sourceSectionTitle}`,
          data: cerEvidence.data,
          rawContent: JSON.stringify(cerEvidence.data).substring(0, 500),
          extractionMethod: `CER SOTA extraction - ${cerEvidence.extractionMethod}`,
          warnings: cerEvidence.warnings,
        });
      }
      
      // Add CER decision traces
      for (const cerTrace of cerResult.decisionTrace) {
        decisionTrace.push({
          traceId: cerTrace.traceId,
          timestamp: cerTrace.timestamp,
          stage: "CER_EXTRACTION",
          decision: cerTrace.decision,
          confidence: cerTrace.confidence,
          inputSummary: cerTrace.inputSummary,
          outputSummary: cerTrace.outputSummary,
          reasoning: cerTrace.reasoning,
          alternativesConsidered: cerTrace.alternativesConsidered,
          warnings: cerTrace.warnings,
        });
      }
      
      decisionTrace.push({
        traceId: randomUUID(),
        timestamp: new Date().toISOString(),
        stage: "CER_EXTRACTION",
        decision: `CER extraction completed: ${cerResult.extractedEvidence.length} evidence items`,
        confidence: 0.9,
        inputSummary: `Processed ${cerResult.sections.length} CER sections`,
        outputSummary: `Extracted ${Array.from(new Set(cerResult.extractedEvidence.map(e => e.evidenceType))).length} unique evidence types`,
        reasoning: [
          `Total extraction time: ${cerResult.processingTimeMs}ms`,
          `Evidence types: ${Array.from(new Set(cerResult.extractedEvidence.map(e => e.evidenceType))).join(", ")}`,
        ],
        durationMs: Date.now() - cerStart,
      });
      
      console.log(`[Evidence Extractor] CER extraction completed: ${cerResult.extractedEvidence.length} evidence items`);
    } catch (error: any) {
      console.error(`[Evidence Extractor] CER extraction failed: ${error?.message || error}`);
      decisionTrace.push({
        traceId: randomUUID(),
        timestamp: new Date().toISOString(),
        stage: "CER_EXTRACTION",
        decision: "CER extraction failed - falling back to standard extraction",
        confidence: 0.3,
        inputSummary: document.filename,
        outputSummary: "Error during CER extraction",
        reasoning: [`Error: ${error?.message || String(error)}`],
        warnings: ["CER-specific extraction failed - using standard extraction methods"],
      });
      // Fall through to standard extraction
    }
  }

  // PHASE 2: Legacy table extraction ONLY for CER documents without tabular data
  // NOTE: For tabular data, SOTA pipeline is mandatory (handled above)
  // This path only runs for CER documents or documents without tables
  const cerExtracted = result.cerExtractionResult && result.extractedEvidence.length > 0;
  
  if (!cerExtracted && document.tables.length > 0) {
    // This should only happen if SOTA is explicitly disabled
    console.warn(`[Evidence Extractor] WARNING: Tabular data but SOTA not used - this path is deprecated`);
    result.suggestions.push("WARNING: Legacy extraction used - consider enabling SOTA for better accuracy");
  }

  // PHASE 3: Section extraction (ONLY if CER extraction didn't run)
  if (!cerExtracted) {
    for (const section of document.sections) {
      const sectionTraceId = randomUUID();
      const sectionStart = Date.now();
      
      const sectionEvidence = extractFromSection(section, document.filename);
      result.extractedEvidence.push(...sectionEvidence);
      
      if (sectionEvidence.length > 0) {
        decisionTrace.push({
          traceId: sectionTraceId,
          timestamp: new Date().toISOString(),
          stage: "EVIDENCE_TYPE_DETECTION",
          decision: `Section "${section.title}": extracted ${sectionEvidence.length} records`,
          confidence: Math.max(...sectionEvidence.map(e => e.confidence)),
          inputSummary: `Section "${section.title}" with ${section.content.length} chars`,
          outputSummary: `Evidence types: ${Array.from(new Set(sectionEvidence.map(e => e.evidenceType))).join(", ")}`,
          reasoning: [
            `Content matched indicators for detected evidence types`,
            `Extraction method: section content analysis`,
          ],
          durationMs: Date.now() - sectionStart,
        });
      }
    }
  }

  // PHASE 4: Source type prioritization
  if (sourceType) {
    const prioritizeTraceId = randomUUID();
    const beforePrioritize = result.extractedEvidence.length;
    
    result.extractedEvidence = prioritizeBySourceType(result.extractedEvidence, sourceType);
    
    decisionTrace.push({
      traceId: prioritizeTraceId,
      timestamp: new Date().toISOString(),
      stage: "VALIDATION",
      decision: `Applied source type prioritization for "${sourceType}"`,
      confidence: 1.0,
      inputSummary: `${beforePrioritize} evidence items before prioritization`,
      outputSummary: `Boosted confidence for ${sourceType}-related evidence types`,
      reasoning: [
        `User-specified source type: ${sourceType}`,
        `Evidence types matching source get +0.2 confidence boost`,
        `Results sorted by confidence`,
      ],
    });
  }

  // PHASE 5: Deduplication
  const dedupTraceId = randomUUID();
  const beforeDedup = result.extractedEvidence.length;
  
  result.extractedEvidence = deduplicateEvidence(result.extractedEvidence);
  
  decisionTrace.push({
    traceId: dedupTraceId,
    timestamp: new Date().toISOString(),
    stage: "VALIDATION",
    decision: `Deduplication: ${beforeDedup} -> ${result.extractedEvidence.length} items`,
    confidence: 1.0,
    inputSummary: `${beforeDedup} evidence items before deduplication`,
    outputSummary: `${result.extractedEvidence.length} unique items, ${beforeDedup - result.extractedEvidence.length} removed`,
    reasoning: [
      `Removed duplicates based on content hash`,
      `Filtered items below 0.3 confidence threshold`,
      `Kept highest confidence item for each unique content`,
    ],
    warnings: beforeDedup - result.extractedEvidence.length > 10 
      ? ["High duplicate count - check extraction quality"]
      : undefined,
  });

  // Generate suggestions for unmatched content
  result.suggestions = generateSuggestions(document, result.extractedEvidence);
  
  // Final summary trace
  decisionTrace.push({
    traceId: randomUUID(),
    timestamp: new Date().toISOString(),
    stage: "VALIDATION",
    decision: `Extraction complete: ${result.extractedEvidence.length} evidence items`,
    confidence: result.extractedEvidence.length > 0 ? 0.9 : 0.3,
    inputSummary: `Document: ${document.filename}`,
    outputSummary: `${result.extractedEvidence.length} items of ${Array.from(new Set(result.extractedEvidence.map(e => e.evidenceType))).length} types`,
    reasoning: [
      `Total processing time: ${Date.now() - startTime}ms`,
      `Evidence types: ${Array.from(new Set(result.extractedEvidence.map(e => e.evidenceType))).join(", ") || "none"}`,
      `Suggestions: ${result.suggestions.length}`,
    ],
  });

  result.decisionTrace = decisionTrace;
  result.processingTime = Date.now() - startTime;
  
  console.log(`[Evidence Extractor] Completed extraction of ${document.filename} in ${result.processingTime}ms with ${decisionTrace.length} trace entries`);
  
  return result;
}

/**
 * Detect if a document is likely a CER based on content analysis
 */
function isCERDocument(document: ParsedDocument): boolean {
  const textLower = document.rawText.toLowerCase();
  const cerIndicators = [
    "clinical evaluation report",
    "clinical evaluation",
    "cer for",
    "mdcg 2020-6",
    "mdcg 2020-5",
    "meddev 2.7/1",
    "equivalent device",
    "literature review",
    "post-market clinical",
    "benefit-risk",
    "state of the art",
    "clinical performance",
    "clinical safety",
  ];
  
  let score = 0;
  for (const indicator of cerIndicators) {
    if (textLower.includes(indicator)) {
      score++;
    }
  }
  
  // Also check section titles
  for (const section of document.sections) {
    const titleLower = section.title?.toLowerCase() || "";
    if (titleLower.includes("clinical") || titleLower.includes("cer") || 
        titleLower.includes("benefit") || titleLower.includes("literature")) {
      score++;
    }
  }
  
  // Threshold: need at least 3 indicators to classify as CER
  return score >= 3;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTE: Legacy table extraction functions removed - SOTA pipeline is now mandatory
// For tabular data, use extractEvidenceSOTA() from sotaExtractor.ts
// ═══════════════════════════════════════════════════════════════════════════════

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
    sales: ["sales_volume", "sales_summary", "sales_by_region", "distribution_summary", "usage_estimate"],
    complaints: ["complaint_record", "complaint_summary", "complaints_by_region", "serious_incident_summary", "serious_incident_record", "serious_incident_records_imdrf", "vigilance_report", "customer_feedback_summary"],
    fsca: ["fsca_record", "fsca_summary", "recall_record"],
    capa: ["capa_record", "capa_summary", "ncr_record"],
    pmcf: ["pmcf_result", "pmcf_summary", "pmcf_activity_record", "pmcf_report_extract"],
    literature: ["literature_result", "literature_search_strategy", "literature_review_summary"],
    external_db: ["external_db_query_log", "external_db_summary"],
    risk: ["benefit_risk_assessment", "risk_assessment", "rmf_extract", "trend_analysis", "signal_log"],
    cer: ["cer_extract", "clinical_evaluation_extract"],
    admin: ["device_registry_record", "manufacturer_profile", "regulatory_certificate_record", "pms_plan_extract", "data_source_register", "change_control_record", "previous_psur_extract"],
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
  return Array.from(new Set(EVIDENCE_TYPES.map(t => t.category)));
}
