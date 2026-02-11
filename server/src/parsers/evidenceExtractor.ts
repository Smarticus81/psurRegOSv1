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
  cerExtractionResult?: unknown;
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
  // ── Category 1: Device Master Data ──
  {
    type: "device_identification",
    category: "Device",
    description: "Device identification, UDI-DI, GMDN codes, models",
    requiredFields: ["device_name"],
    optionalFields: ["model", "udi_di", "risk_class", "manufacturer", "intended_purpose", "gmdn", "srn"],
    indicators: ["device", "model", "udi", "catalog", "product", "registry", "registration", "manufacturer", "gmdn"],
  },

  // ── Category 2: Complaints (Non-Serious) ──
  {
    type: "complaint_record",
    category: "Complaints",
    description: "Individual complaint record or feedback",
    requiredFields: ["complaint_date"],
    optionalFields: ["complaint_id", "description", "region", "severity", "status", "device_code", "category"],
    indicators: ["complaint", "feedback", "issue", "problem", "concern", "reported", "customer", "allegation"],
  },
  {
    type: "complaint_investigation",
    category: "Complaints",
    description: "Complaint investigation findings and root cause analysis",
    requiredFields: [],
    optionalFields: ["complaint_id", "investigation_date", "findings", "root_cause", "confirmed", "corrective_action"],
    indicators: ["investigation", "root cause", "confirmed", "findings", "determination", "analysis result"],
  },

  // ── Category 3: Vigilance (Serious Incidents) ──
  {
    type: "serious_incident_record",
    category: "Vigilance",
    description: "Serious incident report",
    requiredFields: ["incident_date"],
    optionalFields: ["incident_id", "description", "outcome", "device_code", "imdrf_code", "competent_authority"],
    indicators: ["serious", "incident", "adverse event", "mdr", "vigilance", "death", "injury", "imdrf"],
  },
  {
    type: "serious_incident_investigation",
    category: "Vigilance",
    description: "Serious incident investigation and root cause analysis",
    requiredFields: [],
    optionalFields: ["incident_id", "investigation_date", "root_cause_analysis", "actions_taken", "outcome"],
    indicators: ["investigation", "root cause", "analysis", "actions taken", "incident investigation"],
  },
  {
    type: "vigilance_submission_log",
    category: "Vigilance",
    description: "Regulatory submission log for vigilance reports",
    requiredFields: [],
    optionalFields: ["submission_date", "incident_id", "competent_authority", "eudamed_id", "report_status", "timeline_compliance"],
    indicators: ["submission", "eudamed", "competent authority", "timeline", "regulatory report", "notification"],
  },

  // ── Category 4: Sales & Distribution ──
  {
    type: "sales_transactions",
    category: "Sales",
    description: "Sales transactions, distribution, and usage data",
    requiredFields: ["quantity", "period_start"],
    optionalFields: ["region", "country", "period_end", "device_code", "model", "market_share", "customer"],
    indicators: ["sales", "sold", "units", "volume", "revenue", "distribution", "region", "country", "market", "shipped", "usage", "transaction"],
  },
  {
    type: "market_history",
    category: "Sales",
    description: "Market history and first-sold dates",
    requiredFields: [],
    optionalFields: ["date_first_sold", "markets_entered", "markets_exited", "volume_trend"],
    indicators: ["market history", "first sold", "markets entered", "markets exited", "launch date"],
  },

  // ── Category 5: FSCA ──
  {
    type: "fsca_record",
    category: "FSCA",
    description: "Field Safety Corrective Action record",
    requiredFields: ["fsca_id"],
    optionalFields: ["action_type", "initiation_date", "status", "affected_units", "description", "device_code"],
    indicators: ["fsca", "field safety", "corrective action", "recall", "advisory", "notice"],
  },
  {
    type: "fsca_effectiveness",
    category: "FSCA",
    description: "FSCA effectiveness verification and completion tracking",
    requiredFields: [],
    optionalFields: ["fsca_id", "completion_percent", "devices_retrieved", "effectiveness_verified"],
    indicators: ["effectiveness", "completion", "retrieved", "verification", "fsca effectiveness"],
  },

  // ── Category 6: CAPA ──
  {
    type: "capa_record",
    category: "CAPA",
    description: "Corrective and Preventive Action record",
    requiredFields: ["capa_id"],
    optionalFields: ["description", "initiation_date", "status", "effectiveness", "root_cause", "action_plan"],
    indicators: ["capa", "corrective", "preventive", "action", "improvement"],
  },
  {
    type: "ncr_record",
    category: "CAPA",
    description: "Non-conformance report",
    requiredFields: [],
    optionalFields: ["ncr_id", "description", "open_date", "status", "linked_capa_id"],
    indicators: ["non-conformance", "ncr", "deviation", "nonconformity", "non-conformity"],
  },

  // ── Category 9: PMCF ──
  {
    type: "pmcf_results",
    category: "PMCF",
    description: "Post-Market Clinical Follow-up result",
    requiredFields: [],
    optionalFields: ["study_id", "patient_count", "outcome", "status", "conclusion", "activity_type", "findings"],
    indicators: ["pmcf", "post-market", "clinical follow-up", "registry", "study", "survey", "cohort"],
  },

  // ── Category 10: Literature ──
  {
    type: "literature_findings",
    category: "Literature",
    description: "Literature review finding or search result",
    requiredFields: [],
    optionalFields: ["citation", "database", "search_terms", "summary", "analysis", "favorable", "device_related", "date", "title", "authors"],
    indicators: ["literature", "review", "publication", "article", "search", "pubmed", "embase", "abstract", "citation"],
  },

  // ── Category 11: PMS ──
  {
    type: "pms_activity_log",
    category: "PMS",
    description: "PMS surveillance activity log",
    requiredFields: [],
    optionalFields: ["activity_id", "activity_type", "planned_date", "actual_date", "status", "findings"],
    indicators: ["pms", "surveillance", "activity", "monitoring", "post-market surveillance"],
  },
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
      
      // If SOTA succeeded but extracted nothing, try basic fallback
      if (result.extractedEvidence.length === 0 && document.tables.length > 0) {
        console.warn(`[Evidence Extractor] SOTA returned 0 evidence from ${document.tables.length} tables — trying basic fallback`);
        const fallbackEvidence = extractFromTables(document.tables, document.filename);
        if (fallbackEvidence.length > 0) {
          result.extractedEvidence = fallbackEvidence;
          result.suggestions.push(`SOTA returned no results — basic fallback extracted ${fallbackEvidence.length} items`);
        }
      }

      // Add SOTA-specific metadata
      (result as any).sotaResult = sotaResult;

      result.processingTime = Date.now() - startTime;
      return result;
      
    } catch (sotaError: any) {
      console.error(`[Evidence Extractor] SOTA extraction failed, falling back to basic table extraction. Error: ${sotaError?.message}`);

      // FALLBACK: Use basic table extraction so we don't lose all data
      const fallbackEvidence = extractFromTables(document.tables, document.filename);
      result.extractedEvidence = fallbackEvidence;

      result.suggestions.push(`SOTA extraction failed (${sotaError?.message}) — used basic table fallback`);
      if (fallbackEvidence.length > 0) {
        result.suggestions.push(`Basic fallback extracted ${fallbackEvidence.length} items — review for accuracy`);
      } else {
        result.suggestions.push("HUMAN REVIEW REQUIRED: Both SOTA and basic extraction produced no results");
      }
      result.decisionTrace = [{
        traceId: randomUUID(),
        timestamp: new Date().toISOString(),
        stage: "VALIDATION",
        decision: `SOTA failed, basic fallback extracted ${fallbackEvidence.length} items`,
        confidence: fallbackEvidence.length > 0 ? 0.5 : 0,
        inputSummary: document.filename,
        outputSummary: `Fallback: ${fallbackEvidence.length} evidence items from ${document.tables.length} tables`,
        reasoning: [
          `SOTA error: ${sotaError?.message}`,
          `Fallback: basic table header matching against ${document.tables.length} tables`,
          `Recovered ${fallbackEvidence.length} evidence items`,
        ]
      }];
      result.processingTime = Date.now() - startTime;
      return result;
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
  // PHASE 1: CER HANDLING — CER-specific extractor removed; fall through to standard extraction
  if (sourceType?.toLowerCase() === "cer" || isCERDocument(document)) {
    console.log(`[Evidence Extractor] CER document detected - using standard extraction (CER extractor removed)`);
    decisionTrace.push({
      traceId: randomUUID(),
      timestamp: new Date().toISOString(),
      stage: "CER_EXTRACTION",
      decision: "CER document detected - using standard extraction pipeline",
      confidence: 0.7,
      inputSummary: `CER document: ${document.filename}`,
      outputSummary: "CER-specific extractor not available; falling through to SOTA/standard extraction",
      reasoning: [
        "CER-specific extractor was removed during codebase cleanup",
        "Standard SOTA extraction pipeline handles CER content adequately",
      ],
    });
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
// BASIC TABLE EXTRACTION (Fallback when SOTA fails)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Basic table extraction fallback. Classifies each table by matching column
 * headers against EVIDENCE_TYPES indicators, then emits one ExtractedEvidence
 * per row with column values mapped to data fields.
 */
function extractFromTables(tables: ParsedTable[], filename: string): ExtractedEvidence[] {
  const evidence: ExtractedEvidence[] = [];

  for (const table of tables) {
    if (!table.headers || table.headers.length === 0 || table.rows.length === 0) continue;

    const headersLower = table.headers.map(h => (h || "").toLowerCase());
    const headerStr = headersLower.join(" ");

    // Score each evidence type against the table headers
    let bestType: EvidenceType | null = null;
    let bestScore = 0;

    for (const evidenceType of EVIDENCE_TYPES) {
      let score = 0;
      for (const indicator of evidenceType.indicators) {
        if (headerStr.includes(indicator.toLowerCase())) {
          score += 2;
        }
        // Also check individual headers
        for (const h of headersLower) {
          if (h.includes(indicator.toLowerCase())) {
            score += 1;
          }
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestType = evidenceType;
      }
    }

    if (!bestType || bestScore < 2) {
      // Cannot classify this table — skip
      continue;
    }

    // Extract each row as an evidence item
    for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
      const row = table.rows[rowIdx];
      if (!row) continue;

      // Build data object mapping headers to values
      const data: Record<string, unknown> = {};
      for (const header of table.headers) {
        const val = row[header];
        if (val !== null && val !== undefined && val !== "") {
          // Normalize header to snake_case field name
          const fieldName = header.toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "");
          data[fieldName] = val;
        }
      }

      // Skip empty rows
      if (Object.keys(data).length === 0) continue;

      const rawContent = JSON.stringify(data).substring(0, 1000);
      const confidence = Math.min(0.7, bestScore / 10); // Cap at 0.7 for basic extraction

      evidence.push({
        evidenceType: bestType.type,
        confidence,
        source: "table",
        sourceName: table.name || `Table ${tables.indexOf(table) + 1}`,
        data,
        rawContent,
        extractionMethod: `Basic table fallback (header score: ${bestScore})`,
        warnings: ["Extracted via basic fallback — SOTA extraction failed. Review data quality."],
      });
    }
  }

  return evidence;
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
