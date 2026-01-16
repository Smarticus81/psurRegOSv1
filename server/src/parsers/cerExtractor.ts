/**
 * SOTA CER (Clinical Evaluation Report) Extractor
 * 
 * CERs are comprehensive documents containing evidence for multiple PSUR sections:
 * - Device Description and Identifiers (from Section 2)
 * - Historical Sales Data (from previous PSURs summarized in CER)
 * - Historical Complaints (from previous PSURs summarized in CER)
 * - Literature Review (from Section 7)
 * - Clinical Data Analysis (from Section 8)
 * - Risk/Benefit Assessment (from Section 9)
 * - PMCF Plan and Results (from Section 10)
 * - Conclusions (from Section 11)
 * 
 * This extractor uses Claude Sonnet 4.5 for intelligent section classification
 * and provides granular decision tracing for audit compliance.
 */

import { ParsedDocument, ParsedSection, ParsedTable } from "./documentParser";
import { complete } from "../agents/llmService";
import { createHash, randomUUID } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CERSection {
  type: CERSectionType;
  title: string;
  content: string;
  tables: ParsedTable[];
  pageStart?: number;
  pageEnd?: number;
  confidence: number;
  classificationMethod: string;
  classificationReason: string;
}

export type CERSectionType = 
  | "COVER_PAGE"
  | "TABLE_OF_CONTENTS"
  | "EXECUTIVE_SUMMARY"
  | "SCOPE_AND_CONTEXT"
  | "DEVICE_DESCRIPTION"
  | "DEVICE_IDENTIFIERS"
  | "REGULATORY_STATUS"
  | "INTENDED_PURPOSE"
  | "CLINICAL_BACKGROUND"
  | "STATE_OF_ART"
  | "EQUIVALENCE"
  | "LITERATURE_SEARCH_PROTOCOL"
  | "LITERATURE_SEARCH_RESULTS"
  | "LITERATURE_ANALYSIS"
  | "CLINICAL_INVESTIGATIONS"
  | "PMCF_DATA"
  | "PMS_DATA"
  | "COMPLAINTS_SUMMARY"
  | "VIGILANCE_SUMMARY"
  | "SALES_DATA"
  | "CLINICAL_DATA_ANALYSIS"
  | "BENEFIT_ANALYSIS"
  | "RISK_ANALYSIS"
  | "BENEFIT_RISK_CONCLUSION"
  | "CONCLUSIONS"
  | "APPENDIX"
  | "REFERENCES"
  | "UNKNOWN";

export interface CERExtractionResult {
  documentId: string;
  filename: string;
  cerVersion: string;
  sections: CERSection[];
  extractedEvidence: CERExtractedEvidence[];
  decisionTrace: CERDecisionTrace[];
  processingTimeMs: number;
  warnings: string[];
}

export interface CERExtractedEvidence {
  evidenceType: string;
  confidence: number;
  sourceSection: CERSectionType;
  sourceSectionTitle: string;
  data: Record<string, unknown>;
  extractionMethod: string;
  extractionReason: string;
  warnings: string[];
  traceId: string;
}

export interface CERDecisionTrace {
  traceId: string;
  timestamp: string;
  stage: "SECTION_CLASSIFICATION" | "EVIDENCE_EXTRACTION" | "DATA_MAPPING" | "VALIDATION";
  decision: string;
  confidence: number;
  inputSummary: string;
  outputSummary: string;
  reasoning: string[];
  alternativesConsidered?: { option: string; reason: string; score: number }[];
  warnings?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION CLASSIFICATION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

const SECTION_PATTERNS: { type: CERSectionType; patterns: RegExp[]; keywords: string[] }[] = [
  {
    type: "COVER_PAGE",
    patterns: [/^clinical\s+evaluation\s+report/i, /^cer\s+for/i],
    keywords: ["clinical evaluation report", "cer", "prepared by", "version", "date of issue"],
  },
  {
    type: "EXECUTIVE_SUMMARY",
    patterns: [/executive\s+summary/i, /^\d+\.?\s*executive\s+summary/i],
    keywords: ["executive summary", "summary", "overview", "key findings"],
  },
  {
    type: "SCOPE_AND_CONTEXT",
    patterns: [/scope\s+(and|&)\s+context/i, /scope\s+of\s+(the\s+)?cer/i],
    keywords: ["scope", "context", "objective", "purpose of evaluation"],
  },
  {
    type: "DEVICE_DESCRIPTION",
    patterns: [/device\s+description/i, /product\s+description/i, /^\d+\.?\s*device\s+under\s+evaluation/i],
    keywords: ["device description", "product description", "device name", "model", "components", "accessories"],
  },
  {
    type: "DEVICE_IDENTIFIERS",
    patterns: [/device\s+identif/i, /udi/i, /basic\s+udi/i],
    keywords: ["udi-di", "basic udi", "gmdn", "device identifier", "catalog number", "part number"],
  },
  {
    type: "REGULATORY_STATUS",
    patterns: [/regulatory\s+status/i, /ce\s+mark/i, /certification/i],
    keywords: ["regulatory status", "ce marking", "notified body", "certificate", "conformity"],
  },
  {
    type: "INTENDED_PURPOSE",
    patterns: [/intended\s+purpose/i, /intended\s+use/i, /indications?\s+for\s+use/i],
    keywords: ["intended purpose", "intended use", "indications", "contraindications", "target population"],
  },
  {
    type: "CLINICAL_BACKGROUND",
    patterns: [/clinical\s+background/i, /medical\s+background/i, /disease\s+background/i],
    keywords: ["clinical background", "medical condition", "disease", "pathology", "epidemiology"],
  },
  {
    type: "STATE_OF_ART",
    patterns: [/state\s+of\s+(the\s+)?art/i, /current\s+treatment/i, /benchmark/i],
    keywords: ["state of the art", "sota", "benchmark", "current treatment", "alternative treatments"],
  },
  {
    type: "EQUIVALENCE",
    patterns: [/equivalen/i, /similar\s+device/i, /predicate/i],
    keywords: ["equivalence", "equivalent device", "similar device", "predicate", "comparison"],
  },
  {
    type: "LITERATURE_SEARCH_PROTOCOL",
    patterns: [/literature\s+search\s+(protocol|strategy|method)/i, /search\s+strategy/i],
    keywords: ["search protocol", "search strategy", "databases", "search terms", "inclusion criteria", "exclusion criteria"],
  },
  {
    type: "LITERATURE_SEARCH_RESULTS",
    patterns: [/literature\s+search\s+results/i, /search\s+results/i, /prisma/i],
    keywords: ["search results", "hits", "articles found", "prisma", "screening", "selection"],
  },
  {
    type: "LITERATURE_ANALYSIS",
    patterns: [/literature\s+(analysis|review|appraisal)/i, /critical\s+appraisal/i],
    keywords: ["literature analysis", "appraisal", "favorable", "unfavorable", "evidence level"],
  },
  {
    type: "CLINICAL_INVESTIGATIONS",
    patterns: [/clinical\s+(investigation|study|trial)/i, /^\d+\.?\s*clinical\s+data/i],
    keywords: ["clinical investigation", "clinical study", "clinical trial", "pivotal study", "pre-market"],
  },
  {
    type: "PMCF_DATA",
    patterns: [/pmcf/i, /post.?market\s+clinical/i],
    keywords: ["pmcf", "post-market clinical follow-up", "registry", "survey", "real-world"],
  },
  {
    type: "PMS_DATA",
    patterns: [/pms\s+data/i, /post.?market\s+surveillance/i, /vigilance\s+data/i],
    keywords: ["pms", "post-market surveillance", "surveillance data", "monitoring"],
  },
  {
    type: "COMPLAINTS_SUMMARY",
    patterns: [/complaint/i, /feedback\s+summary/i, /customer\s+complaint/i],
    keywords: ["complaints", "customer feedback", "complaint rate", "complaint trend"],
  },
  {
    type: "VIGILANCE_SUMMARY",
    patterns: [/vigilance/i, /serious\s+incident/i, /adverse\s+event/i],
    keywords: ["vigilance", "serious incidents", "adverse events", "mdr reports", "reportable events"],
  },
  {
    type: "SALES_DATA",
    patterns: [/sales\s+data/i, /distribution\s+data/i, /units\s+sold/i, /market\s+data/i],
    keywords: ["sales", "distribution", "units sold", "market exposure", "patient exposure"],
  },
  {
    type: "CLINICAL_DATA_ANALYSIS",
    patterns: [/data\s+analysis/i, /clinical\s+performance/i, /clinical\s+safety/i],
    keywords: ["data analysis", "clinical performance", "clinical safety", "effectiveness", "efficacy"],
  },
  {
    type: "BENEFIT_ANALYSIS",
    patterns: [/benefit\s+analysis/i, /benefits?\s+of/i, /clinical\s+benefit/i],
    keywords: ["benefit analysis", "clinical benefit", "performance benefit", "patient benefit"],
  },
  {
    type: "RISK_ANALYSIS",
    patterns: [/risk\s+analysis/i, /risks?\s+of/i, /residual\s+risk/i, /risk\s+assessment/i],
    keywords: ["risk analysis", "risk assessment", "residual risk", "risk benefit", "hazards"],
  },
  {
    type: "BENEFIT_RISK_CONCLUSION",
    patterns: [/benefit.?risk/i, /risk.?benefit/i, /overall\s+conclusion/i],
    keywords: ["benefit-risk", "risk-benefit", "acceptable", "favorable", "overall conclusion"],
  },
  {
    type: "CONCLUSIONS",
    patterns: [/conclusion/i, /^\d+\.?\s*conclusion/i],
    keywords: ["conclusion", "summary", "final assessment", "recommendation"],
  },
  {
    type: "APPENDIX",
    patterns: [/appendix/i, /annex/i],
    keywords: ["appendix", "annex", "attachment", "supporting"],
  },
  {
    type: "REFERENCES",
    patterns: [/reference/i, /bibliography/i],
    keywords: ["references", "bibliography", "citations"],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE TYPE MAPPING FROM CER SECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const SECTION_TO_EVIDENCE_MAPPING: Record<CERSectionType, { evidenceTypes: string[]; priority: number }> = {
  COVER_PAGE: { evidenceTypes: ["manufacturer_profile"], priority: 1 },
  TABLE_OF_CONTENTS: { evidenceTypes: [], priority: 0 },
  EXECUTIVE_SUMMARY: { evidenceTypes: ["clinical_evaluation_extract", "benefit_risk_assessment"], priority: 2 },
  SCOPE_AND_CONTEXT: { evidenceTypes: ["cer_extract"], priority: 1 },
  DEVICE_DESCRIPTION: { evidenceTypes: ["device_registry_record", "cer_extract"], priority: 3 },
  DEVICE_IDENTIFIERS: { evidenceTypes: ["device_registry_record"], priority: 3 },
  REGULATORY_STATUS: { evidenceTypes: ["regulatory_certificate_record", "cer_extract"], priority: 2 },
  INTENDED_PURPOSE: { evidenceTypes: ["ifu_extract", "clinical_evaluation_extract"], priority: 3 },
  CLINICAL_BACKGROUND: { evidenceTypes: ["clinical_evaluation_extract"], priority: 2 },
  STATE_OF_ART: { evidenceTypes: ["clinical_evaluation_extract", "literature_review_summary"], priority: 2 },
  EQUIVALENCE: { evidenceTypes: ["clinical_evaluation_extract"], priority: 2 },
  LITERATURE_SEARCH_PROTOCOL: { evidenceTypes: ["literature_search_strategy"], priority: 3 },
  LITERATURE_SEARCH_RESULTS: { evidenceTypes: ["literature_result", "literature_review_summary"], priority: 3 },
  LITERATURE_ANALYSIS: { evidenceTypes: ["literature_review_summary", "clinical_evaluation_extract"], priority: 3 },
  CLINICAL_INVESTIGATIONS: { evidenceTypes: ["clinical_evaluation_extract", "pmcf_result"], priority: 3 },
  PMCF_DATA: { evidenceTypes: ["pmcf_result", "pmcf_summary", "pmcf_activity_record"], priority: 3 },
  PMS_DATA: { evidenceTypes: ["pms_activity_log", "pms_plan_extract"], priority: 2 },
  COMPLAINTS_SUMMARY: { evidenceTypes: ["complaint_summary", "complaints_by_region", "previous_psur_extract"], priority: 3 },
  VIGILANCE_SUMMARY: { evidenceTypes: ["serious_incident_summary", "vigilance_report", "previous_psur_extract"], priority: 3 },
  SALES_DATA: { evidenceTypes: ["sales_summary", "sales_by_region", "previous_psur_extract"], priority: 3 },
  CLINICAL_DATA_ANALYSIS: { evidenceTypes: ["clinical_evaluation_extract"], priority: 3 },
  BENEFIT_ANALYSIS: { evidenceTypes: ["benefit_risk_assessment", "clinical_evaluation_extract"], priority: 3 },
  RISK_ANALYSIS: { evidenceTypes: ["benefit_risk_assessment", "risk_assessment", "rmf_extract"], priority: 3 },
  BENEFIT_RISK_CONCLUSION: { evidenceTypes: ["benefit_risk_assessment"], priority: 4 },
  CONCLUSIONS: { evidenceTypes: ["clinical_evaluation_extract", "benefit_risk_assessment"], priority: 4 },
  APPENDIX: { evidenceTypes: ["cer_extract"], priority: 1 },
  REFERENCES: { evidenceTypes: ["literature_result"], priority: 1 },
  UNKNOWN: { evidenceTypes: ["cer_extract"], priority: 0 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Classify a section using rule-based pattern matching
 */
function classifySectionRuleBased(title: string, content: string): {
  type: CERSectionType;
  confidence: number;
  reason: string;
  alternatives: { option: string; reason: string; score: number }[];
} {
  const normalizedTitle = title.toLowerCase().trim();
  const normalizedContent = content.toLowerCase().substring(0, 2000);
  const alternatives: { option: string; reason: string; score: number }[] = [];
  
  let bestMatch: { type: CERSectionType; score: number; reason: string } | null = null;
  
  for (const pattern of SECTION_PATTERNS) {
    let score = 0;
    const reasons: string[] = [];
    
    // Check title patterns (high weight)
    for (const regex of pattern.patterns) {
      if (regex.test(normalizedTitle)) {
        score += 50;
        reasons.push(`Title matches pattern: ${regex.source}`);
      }
    }
    
    // Check keywords in title (medium weight)
    for (const keyword of pattern.keywords) {
      if (normalizedTitle.includes(keyword)) {
        score += 20;
        reasons.push(`Title contains keyword: "${keyword}"`);
      }
    }
    
    // Check keywords in content (lower weight)
    let contentKeywordCount = 0;
    for (const keyword of pattern.keywords) {
      const matches = (normalizedContent.match(new RegExp(keyword, "gi")) || []).length;
      contentKeywordCount += matches;
    }
    if (contentKeywordCount > 0) {
      score += Math.min(contentKeywordCount * 2, 30);
      reasons.push(`Content contains ${contentKeywordCount} keyword matches`);
    }
    
    if (score > 0) {
      alternatives.push({
        option: pattern.type,
        reason: reasons.join("; "),
        score,
      });
    }
    
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { type: pattern.type, score, reason: reasons.join("; ") };
    }
  }
  
  // Sort alternatives by score
  alternatives.sort((a, b) => b.score - a.score);
  
  if (!bestMatch || bestMatch.score < 10) {
    return {
      type: "UNKNOWN",
      confidence: 0.1,
      reason: "No matching patterns found",
      alternatives: alternatives.slice(0, 3),
    };
  }
  
  // Convert score to confidence (0-1)
  const confidence = Math.min(bestMatch.score / 100, 1);
  
  return {
    type: bestMatch.type,
    confidence,
    reason: bestMatch.reason,
    alternatives: alternatives.slice(1, 4), // Top 3 alternatives excluding the best match
  };
}

/**
 * Classify a section using Claude LLM for complex cases
 */
async function classifySectionLLM(
  title: string,
  content: string,
  ruleBasedResult: { type: CERSectionType; confidence: number }
): Promise<{
  type: CERSectionType;
  confidence: number;
  reason: string;
}> {
  const sectionTypes = Object.keys(SECTION_TO_EVIDENCE_MAPPING).join(", ");
  
  const prompt = `You are a medical device regulatory expert analyzing a Clinical Evaluation Report (CER).

Given the following section from a CER, classify it into one of these section types:
${sectionTypes}

Section Title: "${title}"
Section Content (first 2000 chars):
"""
${content.substring(0, 2000)}
"""

Rule-based classification suggested: ${ruleBasedResult.type} (confidence: ${(ruleBasedResult.confidence * 100).toFixed(0)}%)

Respond in JSON format:
{
  "sectionType": "<ONE OF THE SECTION TYPES>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<Brief explanation of classification>"
}`;

  try {
    const response = await complete({
      messages: [
        { role: "system", content: "You are a CER analysis expert. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      config: { temperature: 0.1, maxTokens: 500 },
      responseFormat: "json",
    });
    
    const result = JSON.parse(response.content);
    return {
      type: result.sectionType as CERSectionType,
      confidence: result.confidence,
      reason: result.reasoning,
    };
  } catch (error) {
    // Fallback to rule-based result
    return {
      type: ruleBasedResult.type,
      confidence: ruleBasedResult.confidence * 0.8, // Reduce confidence since LLM failed
      reason: "LLM classification failed, using rule-based result",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract evidence from a classified CER section using LLM
 */
async function extractEvidenceFromSection(
  section: CERSection,
  targetTypes: string[]
): Promise<{
  evidence: CERExtractedEvidence[];
  trace: CERDecisionTrace;
}> {
  const traceId = randomUUID();
  const startTime = Date.now();
  
  // Build extraction prompt
  const typeDescriptions = targetTypes.map(t => {
    switch (t) {
      case "device_registry_record":
        return `${t}: Extract device name, model, UDI-DI, risk class, manufacturer, intended purpose, GMDN code`;
      case "manufacturer_profile":
        return `${t}: Extract manufacturer name, address, authorized representative`;
      case "regulatory_certificate_record":
        return `${t}: Extract certificate number, notified body, issue date, expiry date, scope`;
      case "clinical_evaluation_extract":
        return `${t}: Extract key clinical findings, safety conclusions, performance conclusions`;
      case "benefit_risk_assessment":
        return `${t}: Extract benefits summary, risks summary, overall conclusion, acceptability`;
      case "literature_search_strategy":
        return `${t}: Extract databases searched, search terms, date range, inclusion/exclusion criteria`;
      case "literature_result":
        return `${t}: Extract citation, database, relevance, key findings, favorable/unfavorable`;
      case "literature_review_summary":
        return `${t}: Extract total articles found, selected, favorable count, unfavorable count, conclusion`;
      case "pmcf_result":
        return `${t}: Extract study ID, study type, sample size, key findings, conclusion`;
      case "pmcf_summary":
        return `${t}: Extract PMCF activities performed, main findings, integration with CER/RMF`;
      case "sales_summary":
        return `${t}: Extract total units, regions, time period, patient exposure estimate`;
      case "complaint_summary":
        return `${t}: Extract total complaints, serious vs non-serious, main categories, trends`;
      case "serious_incident_summary":
        return `${t}: Extract incident count, categories, outcomes, reporting status`;
      case "previous_psur_extract":
        return `${t}: Extract reference to previous PSUR, key findings, changes from previous period`;
      case "ifu_extract":
        return `${t}: Extract intended use, indications, contraindications, warnings`;
      case "risk_assessment":
        return `${t}: Extract identified risks, risk controls, residual risk acceptability`;
      case "rmf_extract":
        return `${t}: Extract risk management activities, hazard analysis summary`;
      case "pms_plan_extract":
        return `${t}: Extract PMS activities planned, data sources, monitoring approach`;
      case "pms_activity_log":
        return `${t}: Extract PMS activities performed, dates, findings`;
      default:
        return `${t}: Extract relevant structured data`;
    }
  }).join("\n");

  const prompt = `You are a medical device regulatory expert extracting structured evidence from a CER section.

Section Type: ${section.type}
Section Title: "${section.title}"
Section Content:
"""
${section.content.substring(0, 6000)}
"""

Extract evidence for these types:
${typeDescriptions}

For each evidence type, only extract if there is actual relevant data in this section.
If the data clearly comes from a previous PSUR period (historical data), note this in the extraction.

Respond in JSON format:
{
  "extractions": [
    {
      "evidenceType": "<type>",
      "confidence": <0.0 to 1.0>,
      "data": { <structured fields> },
      "reasoning": "<why this was extracted and what data supports it>",
      "isHistorical": <true if data is from previous period>,
      "warnings": ["<any data quality concerns>"]
    }
  ],
  "noDataTypes": ["<types where no relevant data was found>"],
  "overallConfidence": <0.0 to 1.0>
}`;

  try {
    const response = await complete({
      messages: [
        { role: "system", content: "You are a CER extraction expert. Extract only verifiable data. Respond with valid JSON." },
        { role: "user", content: prompt },
      ],
      config: { temperature: 0.1, maxTokens: 4000 },
      responseFormat: "json",
    });
    
    const result = JSON.parse(response.content);
    
    const evidence: CERExtractedEvidence[] = (result.extractions || []).map((e: any) => ({
      evidenceType: e.evidenceType,
      confidence: e.confidence,
      sourceSection: section.type,
      sourceSectionTitle: section.title,
      data: {
        ...e.data,
        _isHistorical: e.isHistorical || false,
        _sourceCERSection: section.type,
      },
      extractionMethod: "SOTA Claude CER extraction",
      extractionReason: e.reasoning,
      warnings: e.warnings || [],
      traceId,
    }));
    
    const trace: CERDecisionTrace = {
      traceId,
      timestamp: new Date().toISOString(),
      stage: "EVIDENCE_EXTRACTION",
      decision: `Extracted ${evidence.length} evidence items from ${section.type}`,
      confidence: result.overallConfidence || 0.8,
      inputSummary: `Section "${section.title}" (${section.content.length} chars), targeting ${targetTypes.length} types`,
      outputSummary: `Extracted: ${evidence.map(e => e.evidenceType).join(", ")}. No data for: ${result.noDataTypes?.join(", ") || "none"}`,
      reasoning: [
        `Section type ${section.type} mapped to evidence types: ${targetTypes.join(", ")}`,
        `LLM extraction completed in ${Date.now() - startTime}ms`,
        ...evidence.map(e => `${e.evidenceType}: ${e.extractionReason}`),
      ],
      warnings: evidence.flatMap(e => e.warnings),
    };
    
    return { evidence, trace };
  } catch (error) {
    // Return empty with trace
    const trace: CERDecisionTrace = {
      traceId,
      timestamp: new Date().toISOString(),
      stage: "EVIDENCE_EXTRACTION",
      decision: "LLM extraction failed",
      confidence: 0,
      inputSummary: `Section "${section.title}"`,
      outputSummary: "No evidence extracted due to LLM error",
      reasoning: [`Error: ${error instanceof Error ? error.message : String(error)}`],
      warnings: ["LLM extraction failed - manual review required"],
    };
    
    return { evidence: [], trace };
  }
}

/**
 * Extract tabular evidence from section tables
 */
function extractTableEvidence(
  table: ParsedTable,
  section: CERSection
): CERExtractedEvidence[] {
  const evidence: CERExtractedEvidence[] = [];
  const traceId = randomUUID();
  
  // Detect table type based on headers
  const headers = table.headers.map(h => h.toLowerCase());
  
  // Literature results table
  if (headers.some(h => h.includes("citation") || h.includes("article") || h.includes("pubmed"))) {
    for (const row of table.rows) {
      const data: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        data[h.replace(/\s+/g, "_")] = row[i];
      });
      
      evidence.push({
        evidenceType: "literature_result",
        confidence: 0.85,
        sourceSection: section.type,
        sourceSectionTitle: section.title,
        data,
        extractionMethod: "Table extraction - literature results",
        extractionReason: "Table contains citation/article data matching literature results schema",
        warnings: [],
        traceId,
      });
    }
  }
  
  // Sales/distribution table
  if (headers.some(h => h.includes("region") || h.includes("units") || h.includes("sales"))) {
    for (const row of table.rows) {
      const data: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        data[h.replace(/\s+/g, "_")] = row[i];
      });
      
      evidence.push({
        evidenceType: "sales_by_region",
        confidence: 0.8,
        sourceSection: section.type,
        sourceSectionTitle: section.title,
        data: {
          ...data,
          _isHistorical: true,
          _note: "Extracted from CER - likely from previous PSUR period",
        },
        extractionMethod: "Table extraction - sales data",
        extractionReason: "Table contains region/units/sales columns matching sales schema",
        warnings: ["Data extracted from CER may be from previous reporting period"],
        traceId,
      });
    }
  }
  
  // Complaints table
  if (headers.some(h => h.includes("complaint") || h.includes("category") || h.includes("serious"))) {
    for (const row of table.rows) {
      const data: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        data[h.replace(/\s+/g, "_")] = row[i];
      });
      
      evidence.push({
        evidenceType: "complaints_by_region",
        confidence: 0.8,
        sourceSection: section.type,
        sourceSectionTitle: section.title,
        data: {
          ...data,
          _isHistorical: true,
          _note: "Extracted from CER - from previous PSUR period",
        },
        extractionMethod: "Table extraction - complaints data",
        extractionReason: "Table contains complaint/category columns matching complaints schema",
        warnings: ["Data extracted from CER is from previous reporting period"],
        traceId,
      });
    }
  }
  
  return evidence;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CER EXTRACTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract all evidence from a CER document with comprehensive decision tracing
 */
export async function extractFromCER(document: ParsedDocument): Promise<CERExtractionResult> {
  const startTime = Date.now();
  const documentId = createHash("sha256").update(document.contentHash || document.filename).digest("hex").substring(0, 16);
  
  const sections: CERSection[] = [];
  const extractedEvidence: CERExtractedEvidence[] = [];
  const decisionTrace: CERDecisionTrace[] = [];
  const warnings: string[] = [];
  
  console.log(`[CER Extractor] Starting extraction for: ${document.filename}`);
  console.log(`[CER Extractor] Found ${document.sections.length} sections, ${document.tables.length} standalone tables`);
  
  // Phase 1: Classify all sections
  console.log(`[CER Extractor] Phase 1: Section Classification`);
  
  for (const section of document.sections) {
    const traceId = randomUUID();
    
    // Rule-based classification first
    const ruleBasedResult = classifySectionRuleBased(section.title || "", section.content);
    
    // Use LLM for low-confidence or complex cases
    let finalClassification = ruleBasedResult;
    let classificationMethod = "Rule-based pattern matching";
    
    if (ruleBasedResult.confidence < 0.6 && section.content.length > 200) {
      console.log(`[CER Extractor] Section "${section.title}" needs LLM classification (rule confidence: ${(ruleBasedResult.confidence * 100).toFixed(0)}%)`);
      const llmResult = await classifySectionLLM(
        section.title || "", 
        section.content, 
        ruleBasedResult
      );
      
      if (llmResult.confidence > ruleBasedResult.confidence) {
        finalClassification = {
          type: llmResult.type,
          confidence: llmResult.confidence,
          reason: llmResult.reason,
          alternatives: ruleBasedResult.alternatives,
        };
        classificationMethod = "SOTA Claude LLM classification";
      }
    }
    
    const classifiedSection: CERSection = {
      type: finalClassification.type,
      title: section.title || "Untitled Section",
      content: section.content,
      tables: section.tables || [],
      confidence: finalClassification.confidence,
      classificationMethod,
      classificationReason: finalClassification.reason,
    };
    
    sections.push(classifiedSection);
    
    // Log classification decision trace
    decisionTrace.push({
      traceId,
      timestamp: new Date().toISOString(),
      stage: "SECTION_CLASSIFICATION",
      decision: `Classified as ${finalClassification.type}`,
      confidence: finalClassification.confidence,
      inputSummary: `Section "${section.title}" (${section.content.length} chars)`,
      outputSummary: `Type: ${finalClassification.type}, Method: ${classificationMethod}`,
      reasoning: [
        finalClassification.reason,
        `Confidence: ${(finalClassification.confidence * 100).toFixed(0)}%`,
      ],
      alternativesConsidered: finalClassification.alternatives,
    });
    
    console.log(`[CER Extractor] Classified "${section.title}" as ${finalClassification.type} (${(finalClassification.confidence * 100).toFixed(0)}%)`);
  }
  
  // Phase 2: Extract evidence from classified sections
  console.log(`[CER Extractor] Phase 2: Evidence Extraction`);
  
  for (const section of sections) {
    const mapping = SECTION_TO_EVIDENCE_MAPPING[section.type];
    
    if (mapping.evidenceTypes.length === 0) {
      console.log(`[CER Extractor] Skipping ${section.type} - no evidence types mapped`);
      continue;
    }
    
    console.log(`[CER Extractor] Extracting from ${section.type}: targeting ${mapping.evidenceTypes.join(", ")}`);
    
    // Extract from section content using LLM
    const { evidence: contentEvidence, trace } = await extractEvidenceFromSection(section, mapping.evidenceTypes);
    extractedEvidence.push(...contentEvidence);
    decisionTrace.push(trace);
    
    // Extract from any tables in this section
    for (const table of section.tables) {
      const tableEvidence = extractTableEvidence(table, section);
      extractedEvidence.push(...tableEvidence);
      
      if (tableEvidence.length > 0) {
        decisionTrace.push({
          traceId: randomUUID(),
          timestamp: new Date().toISOString(),
          stage: "EVIDENCE_EXTRACTION",
          decision: `Extracted ${tableEvidence.length} items from table`,
          confidence: 0.85,
          inputSummary: `Table "${table.name}" with ${table.rows.length} rows`,
          outputSummary: `Types: ${tableEvidence.map(e => e.evidenceType).join(", ")}`,
          reasoning: [`Table in ${section.type} section processed`, `Headers: ${table.headers.join(", ")}`],
        });
      }
    }
  }
  
  // Phase 3: Extract from standalone tables
  console.log(`[CER Extractor] Phase 3: Standalone Tables`);
  
  for (const table of document.tables) {
    // Create a pseudo-section for context
    const pseudoSection: CERSection = {
      type: "UNKNOWN",
      title: table.name || "Standalone Table",
      content: "",
      tables: [table],
      confidence: 0.5,
      classificationMethod: "Standalone table",
      classificationReason: "Table not associated with specific section",
    };
    
    const tableEvidence = extractTableEvidence(table, pseudoSection);
    extractedEvidence.push(...tableEvidence);
    
    if (tableEvidence.length > 0) {
      console.log(`[CER Extractor] Extracted ${tableEvidence.length} items from standalone table "${table.name}"`);
    }
  }
  
  // Phase 4: Validation and deduplication
  console.log(`[CER Extractor] Phase 4: Validation`);
  
  const validationTraceId = randomUUID();
  const originalCount = extractedEvidence.length;
  
  // Simple deduplication by content hash
  const seen = new Set<string>();
  const dedupedEvidence = extractedEvidence.filter(e => {
    const hash = createHash("sha256").update(JSON.stringify(e.data)).digest("hex");
    if (seen.has(hash)) {
      return false;
    }
    seen.add(hash);
    return true;
  });
  
  const duplicatesRemoved = originalCount - dedupedEvidence.length;
  
  decisionTrace.push({
    traceId: validationTraceId,
    timestamp: new Date().toISOString(),
    stage: "VALIDATION",
    decision: `Validated ${dedupedEvidence.length} evidence items`,
    confidence: 1.0,
    inputSummary: `${originalCount} raw extractions`,
    outputSummary: `${dedupedEvidence.length} unique items, ${duplicatesRemoved} duplicates removed`,
    reasoning: [
      `Deduplication removed ${duplicatesRemoved} duplicate items`,
      `Evidence types extracted: ${Array.from(new Set(dedupedEvidence.map(e => e.evidenceType))).join(", ")}`,
    ],
    warnings: duplicatesRemoved > 5 ? ["High number of duplicates detected - review extraction quality"] : undefined,
  });
  
  const processingTimeMs = Date.now() - startTime;
  
  console.log(`[CER Extractor] Completed in ${processingTimeMs}ms`);
  console.log(`[CER Extractor] Extracted ${dedupedEvidence.length} evidence items of ${Array.from(new Set(dedupedEvidence.map(e => e.evidenceType))).length} types`);
  
  return {
    documentId,
    filename: document.filename,
    cerVersion: "1.0", // Could be extracted from document
    sections,
    extractedEvidence: dedupedEvidence,
    decisionTrace,
    processingTimeMs,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { classifySectionRuleBased, classifySectionLLM, extractEvidenceFromSection };
