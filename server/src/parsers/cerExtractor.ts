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

/**
 * SOTA Section Pattern Definitions
 * Each section type has multiple detection strategies:
 * - Title patterns (regex for exact title matching)
 * - Content patterns (regex for in-content detection)
 * - Keywords (for semantic scoring)
 * - Negative keywords (to avoid false positives)
 */
const SECTION_PATTERNS: { 
  type: CERSectionType; 
  titlePatterns: RegExp[]; 
  contentPatterns: RegExp[];
  keywords: string[]; 
  negativeKeywords?: string[];
  minContentLength?: number;
}[] = [
  {
    type: "COVER_PAGE",
    titlePatterns: [
      /^clinical\s+evaluation\s+report/i,
      /^cer\s+(?:for|of|version)/i,
      /^(?:document|report)\s+information/i,
    ],
    contentPatterns: [
      /clinical\s+evaluation\s+report\s+(?:for|of)\s+/i,
      /prepared\s+(?:by|for)[\s:]+/i,
      /document\s+(?:number|version|id)[\s:]+/i,
    ],
    keywords: ["clinical evaluation report", "cer", "prepared by", "version", "date of issue", "revision", "document control", "author", "reviewer", "approver"],
    negativeKeywords: ["section", "chapter", "table of contents"],
    minContentLength: 50,
  },
  {
    type: "TABLE_OF_CONTENTS",
    titlePatterns: [
      /^table\s+of\s+contents/i,
      /^contents/i,
      /^toc$/i,
    ],
    contentPatterns: [
      /^\d+\.\s+\w+.*\d+$/m,
    ],
    keywords: ["table of contents", "contents", "page"],
    minContentLength: 100,
  },
  {
    type: "EXECUTIVE_SUMMARY",
    titlePatterns: [
      /(?:^\d+\.?\s*)?executive\s+summary/i,
      /(?:^\d+\.?\s*)?management\s+summary/i,
      /(?:^\d+\.?\s*)?overview\s+(?:and\s+)?summary/i,
    ],
    contentPatterns: [
      /this\s+(?:cer|report|document)\s+(?:presents|summarizes|evaluates)/i,
      /the\s+(?:overall\s+)?conclusion\s+(?:is|of)/i,
      /key\s+(?:findings?|conclusions?|results?)/i,
    ],
    keywords: ["executive summary", "overview", "key findings", "main conclusions", "summary", "highlights", "at a glance"],
  },
  {
    type: "SCOPE_AND_CONTEXT",
    titlePatterns: [
      /(?:^\d+\.?\s*)?scope\s+(?:and|&)\s+(?:context|objectives?)/i,
      /(?:^\d+\.?\s*)?scope\s+of\s+(?:the\s+)?(?:cer|evaluation|report)/i,
      /(?:^\d+\.?\s*)?introduction\s+(?:and\s+)?scope/i,
      /(?:^\d+\.?\s*)?purpose\s+(?:and\s+)?scope/i,
    ],
    contentPatterns: [
      /(?:this|the)\s+(?:cer|evaluation)\s+(?:covers|addresses|examines)/i,
      /scope\s+of\s+(?:this|the)\s+(?:evaluation|report)/i,
      /objective[s]?\s+(?:of|for)\s+(?:this|the)/i,
    ],
    keywords: ["scope", "context", "objective", "purpose", "evaluation period", "reporting period", "covered devices", "included", "excluded"],
  },
  {
    type: "DEVICE_DESCRIPTION",
    titlePatterns: [
      /(?:^\d+\.?\s*)?device\s+(?:description|overview)/i,
      /(?:^\d+\.?\s*)?product\s+description/i,
      /(?:^\d+\.?\s*)?device\s+under\s+evaluation/i,
      /(?:^\d+\.?\s*)?description\s+of\s+(?:the\s+)?device/i,
      /(?:^\d+\.?\s*)?general\s+(?:device\s+)?description/i,
    ],
    contentPatterns: [
      /the\s+device\s+(?:is|consists|comprises)/i,
      /(?:main|key)\s+components?\s+(?:include|are)/i,
      /principle\s+of\s+operation/i,
      /mechanism\s+of\s+action/i,
      /device\s+(?:configuration|variants?|models?)/i,
    ],
    keywords: ["device description", "product description", "device name", "model", "components", "accessories", "variants", "configuration", "principle of operation", "mechanism of action", "materials", "specifications", "dimensions"],
  },
  {
    type: "DEVICE_IDENTIFIERS",
    titlePatterns: [
      /(?:^\d+\.?\s*)?device\s+identif(?:ication|iers?)/i,
      /(?:^\d+\.?\s*)?udi(?:\-di)?/i,
      /(?:^\d+\.?\s*)?basic\s+udi/i,
      /(?:^\d+\.?\s*)?product\s+identif/i,
    ],
    contentPatterns: [
      /udi[\-\s]?di[\s:]+/i,
      /basic\s+udi[\s:]+/i,
      /gmdn[\s:]+/i,
      /catalog\s+(?:number|no\.?)[\s:]+/i,
      /reference\s+(?:number|no\.?)[\s:]+/i,
    ],
    keywords: ["udi-di", "basic udi", "gmdn", "device identifier", "catalog number", "part number", "reference number", "lot", "serial", "emdn", "nomenclature"],
  },
  {
    type: "REGULATORY_STATUS",
    titlePatterns: [
      /(?:^\d+\.?\s*)?regulatory\s+(?:status|history|background|overview)/i,
      /(?:^\d+\.?\s*)?ce\s+mark(?:ing)?/i,
      /(?:^\d+\.?\s*)?certification\s+status/i,
      /(?:^\d+\.?\s*)?regulatory\s+pathway/i,
    ],
    contentPatterns: [
      /ce\s+mark(?:ed|ing)/i,
      /notified\s+body/i,
      /certificate\s+(?:number|no\.?)/i,
      /(?:mdr|mdd|ivdr)\s+(?:regulation|directive)/i,
      /conformity\s+assessment/i,
    ],
    keywords: ["regulatory status", "ce marking", "notified body", "certificate", "conformity", "mdr", "mdd", "ivdr", "510k", "pma", "approval", "clearance", "registration"],
  },
  {
    type: "INTENDED_PURPOSE",
    titlePatterns: [
      /(?:^\d+\.?\s*)?intended\s+(?:purpose|use)/i,
      /(?:^\d+\.?\s*)?indications?\s+(?:for\s+use)?/i,
      /(?:^\d+\.?\s*)?intended\s+(?:use|users?|patients?)/i,
    ],
    contentPatterns: [
      /(?:the\s+)?device\s+is\s+intended\s+(?:for|to)/i,
      /indication[s]?\s+(?:for\s+use|include)/i,
      /contraindication[s]?\s+(?:include|are)/i,
      /target\s+(?:population|patient|user)/i,
    ],
    keywords: ["intended purpose", "intended use", "indications", "contraindications", "target population", "patient population", "users", "clinical application", "medical purpose"],
  },
  {
    type: "CLINICAL_BACKGROUND",
    titlePatterns: [
      /(?:^\d+\.?\s*)?clinical\s+background/i,
      /(?:^\d+\.?\s*)?medical\s+(?:background|context)/i,
      /(?:^\d+\.?\s*)?disease\s+(?:background|overview)/i,
      /(?:^\d+\.?\s*)?clinical\s+context/i,
    ],
    contentPatterns: [
      /(?:the\s+)?(?:disease|condition|pathology)\s+(?:is|affects)/i,
      /epidemiology/i,
      /prevalence\s+(?:of|is)/i,
      /incidence\s+(?:of|is)/i,
      /treatment\s+options?\s+(?:include|for)/i,
    ],
    keywords: ["clinical background", "medical condition", "disease", "pathology", "epidemiology", "prevalence", "incidence", "etiology", "pathophysiology", "diagnosis", "prognosis"],
  },
  {
    type: "STATE_OF_ART",
    titlePatterns: [
      /(?:^\d+\.?\s*)?state\s+of\s+(?:the\s+)?art/i,
      /(?:^\d+\.?\s*)?sota/i,
      /(?:^\d+\.?\s*)?current\s+(?:treatment|knowledge|practice)/i,
      /(?:^\d+\.?\s*)?benchmark(?:ing)?/i,
      /(?:^\d+\.?\s*)?alternative\s+(?:treatments?|devices?|options?)/i,
    ],
    contentPatterns: [
      /state\s+of\s+(?:the\s+)?art/i,
      /current(?:ly)?\s+available\s+(?:treatments?|devices?|options?)/i,
      /gold\s+standard/i,
      /standard\s+of\s+care/i,
      /alternative\s+(?:treatments?|approaches?|methods?)/i,
    ],
    keywords: ["state of the art", "sota", "benchmark", "current treatment", "alternative treatments", "gold standard", "standard of care", "comparator", "alternative devices", "treatment options", "current practice"],
  },
  {
    type: "EQUIVALENCE",
    titlePatterns: [
      /(?:^\d+\.?\s*)?equivalen(?:ce|t\s+device)/i,
      /(?:^\d+\.?\s*)?similar\s+device/i,
      /(?:^\d+\.?\s*)?predicate/i,
      /(?:^\d+\.?\s*)?device\s+comparison/i,
    ],
    contentPatterns: [
      /equivalent\s+device/i,
      /similar\s+device/i,
      /predicate\s+device/i,
      /technical\s+equivalence/i,
      /biological\s+equivalence/i,
      /clinical\s+equivalence/i,
    ],
    keywords: ["equivalence", "equivalent device", "similar device", "predicate", "comparison", "technical equivalence", "biological equivalence", "clinical equivalence", "substantially equivalent"],
  },
  {
    type: "LITERATURE_SEARCH_PROTOCOL",
    titlePatterns: [
      /(?:^\d+\.?\s*)?literature\s+search\s+(?:protocol|strategy|method)/i,
      /(?:^\d+\.?\s*)?search\s+(?:strategy|protocol|methodology)/i,
      /(?:^\d+\.?\s*)?systematic\s+(?:review\s+)?methodology/i,
    ],
    contentPatterns: [
      /search\s+(?:strategy|protocol|terms?)/i,
      /databases?\s+(?:searched|used|queried)/i,
      /(?:inclusion|exclusion)\s+criteria/i,
      /pubmed|embase|cochrane|medline/i,
      /mesh\s+terms?/i,
    ],
    keywords: ["search protocol", "search strategy", "databases", "search terms", "inclusion criteria", "exclusion criteria", "pubmed", "embase", "cochrane", "medline", "mesh", "boolean", "pico"],
  },
  {
    type: "LITERATURE_SEARCH_RESULTS",
    titlePatterns: [
      /(?:^\d+\.?\s*)?literature\s+search\s+results/i,
      /(?:^\d+\.?\s*)?search\s+results/i,
      /(?:^\d+\.?\s*)?prisma/i,
      /(?:^\d+\.?\s*)?article\s+selection/i,
    ],
    contentPatterns: [
      /\d+\s+(?:articles?|publications?|papers?)\s+(?:were\s+)?(?:found|identified|retrieved)/i,
      /prisma\s+(?:flow|diagram)/i,
      /after\s+(?:screening|review|removal)/i,
      /full[\-\s]?text\s+(?:review|screening|analysis)/i,
    ],
    keywords: ["search results", "hits", "articles found", "prisma", "screening", "selection", "articles identified", "duplicates removed", "full-text review", "excluded", "included"],
  },
  {
    type: "LITERATURE_ANALYSIS",
    titlePatterns: [
      /(?:^\d+\.?\s*)?literature\s+(?:analysis|review|appraisal)/i,
      /(?:^\d+\.?\s*)?critical\s+appraisal/i,
      /(?:^\d+\.?\s*)?(?:analysis|appraisal)\s+of\s+(?:the\s+)?literature/i,
      /(?:^\d+\.?\s*)?evidence\s+analysis/i,
    ],
    contentPatterns: [
      /(?:critical|systematic)\s+appraisal/i,
      /(?:favorable|unfavorable)\s+(?:evidence|findings?|conclusions?)/i,
      /level\s+of\s+evidence/i,
      /oxford\s+(?:centre|center)/i,
      /grade\s+(?:of|level)/i,
    ],
    keywords: ["literature analysis", "appraisal", "favorable", "unfavorable", "evidence level", "critical appraisal", "quality assessment", "bias", "oxford", "grade", "evidence synthesis"],
  },
  {
    type: "CLINICAL_INVESTIGATIONS",
    titlePatterns: [
      /(?:^\d+\.?\s*)?clinical\s+(?:investigation|study|studies|trial|data)/i,
      /(?:^\d+\.?\s*)?pre[\-\s]?market\s+(?:clinical\s+)?(?:data|studies?)/i,
      /(?:^\d+\.?\s*)?pivotal\s+(?:study|studies|trial)/i,
    ],
    contentPatterns: [
      /clinical\s+(?:investigation|trial|study)/i,
      /pivotal\s+(?:study|trial)/i,
      /pre[\-\s]?market\s+(?:clinical\s+)?(?:data|study)/i,
      /patient[s]?\s+(?:enrolled|included|recruited)/i,
      /primary\s+(?:endpoint|outcome)/i,
    ],
    keywords: ["clinical investigation", "clinical study", "clinical trial", "pivotal study", "pre-market", "endpoints", "outcomes", "patients enrolled", "study design", "randomized", "controlled"],
  },
  {
    type: "PMCF_DATA",
    titlePatterns: [
      /(?:^\d+\.?\s*)?pmcf/i,
      /(?:^\d+\.?\s*)?post[\-\s]?market\s+clinical\s+(?:follow[\-\s]?up|data)/i,
      /(?:^\d+\.?\s*)?pmcf\s+(?:data|results?|findings?|plan|activities)/i,
    ],
    contentPatterns: [
      /pmcf\s+(?:plan|activities?|study|studies|data|results?)/i,
      /post[\-\s]?market\s+clinical\s+follow[\-\s]?up/i,
      /registry\s+(?:data|study)/i,
      /real[\-\s]?world\s+(?:data|evidence)/i,
      /proactive\s+pmcf/i,
    ],
    keywords: ["pmcf", "post-market clinical follow-up", "registry", "survey", "real-world", "pmcf plan", "proactive", "reactive", "clinical follow-up", "long-term"],
  },
  {
    type: "PMS_DATA",
    titlePatterns: [
      /(?:^\d+\.?\s*)?pms\s+(?:data|results?|activities)/i,
      /(?:^\d+\.?\s*)?post[\-\s]?market\s+surveillance/i,
      /(?:^\d+\.?\s*)?surveillance\s+(?:data|activities)/i,
      /(?:^\d+\.?\s*)?pms\s+plan/i,
    ],
    contentPatterns: [
      /pms\s+(?:plan|activities?|data)/i,
      /post[\-\s]?market\s+surveillance/i,
      /surveillance\s+(?:activities?|data|plan)/i,
      /trend\s+analysis/i,
      /signal\s+detection/i,
    ],
    keywords: ["pms", "post-market surveillance", "surveillance data", "monitoring", "pms plan", "trend analysis", "signal detection", "proactive pms", "reactive pms"],
  },
  {
    type: "COMPLAINTS_SUMMARY",
    titlePatterns: [
      /(?:^\d+\.?\s*)?complaint[s]?\s+(?:summary|analysis|data|overview)/i,
      /(?:^\d+\.?\s*)?customer\s+(?:complaint|feedback)/i,
      /(?:^\d+\.?\s*)?(?:analysis|summary)\s+of\s+complaints?/i,
    ],
    contentPatterns: [
      /\d+\s+complaints?\s+(?:were\s+)?(?:received|reported|recorded)/i,
      /complaint\s+(?:rate|trend|category|categories)/i,
      /customer\s+(?:complaints?|feedback)/i,
      /complaint[s]?\s+per\s+(?:\d+|thousand|million)/i,
    ],
    keywords: ["complaints", "customer feedback", "complaint rate", "complaint trend", "complaint category", "customer complaints", "user complaints", "complaint analysis", "complaint data"],
  },
  {
    type: "VIGILANCE_SUMMARY",
    titlePatterns: [
      /(?:^\d+\.?\s*)?vigilance\s+(?:summary|data|report|overview)/i,
      /(?:^\d+\.?\s*)?serious\s+incident[s]?/i,
      /(?:^\d+\.?\s*)?adverse\s+event[s]?/i,
      /(?:^\d+\.?\s*)?(?:mdr|maude|incident)\s+(?:report|data|summary)/i,
    ],
    contentPatterns: [
      /serious\s+incident[s]?/i,
      /adverse\s+event[s]?/i,
      /vigilance\s+(?:report|data)/i,
      /reportable\s+event[s]?/i,
      /field\s+safety\s+(?:corrective\s+)?action/i,
      /fsca/i,
      /fsc[an]/i,
    ],
    keywords: ["vigilance", "serious incidents", "adverse events", "mdr reports", "reportable events", "fsca", "field safety", "maude", "incident reports", "death", "serious injury"],
  },
  {
    type: "SALES_DATA",
    titlePatterns: [
      /(?:^\d+\.?\s*)?sales\s+(?:data|summary|overview)/i,
      /(?:^\d+\.?\s*)?distribution\s+(?:data|summary)/i,
      /(?:^\d+\.?\s*)?(?:units?\s+)?(?:sold|distributed)/i,
      /(?:^\d+\.?\s*)?market\s+(?:data|exposure)/i,
      /(?:^\d+\.?\s*)?(?:device|patient)\s+exposure/i,
    ],
    contentPatterns: [
      /\d+[\,\.]?\d*\s+(?:units?|devices?)\s+(?:were\s+)?(?:sold|distributed|shipped)/i,
      /(?:sales|distribution)\s+(?:data|figures?|numbers?)/i,
      /(?:patient|device|market)\s+exposure/i,
      /cumulative\s+(?:sales|distribution|units)/i,
    ],
    keywords: ["sales", "distribution", "units sold", "market exposure", "patient exposure", "shipped", "cumulative sales", "units distributed", "market penetration", "geographic distribution"],
  },
  {
    type: "CLINICAL_DATA_ANALYSIS",
    titlePatterns: [
      /(?:^\d+\.?\s*)?clinical\s+data\s+analysis/i,
      /(?:^\d+\.?\s*)?analysis\s+of\s+clinical\s+(?:data|evidence)/i,
      /(?:^\d+\.?\s*)?clinical\s+(?:performance|safety)\s+(?:analysis|evaluation)/i,
    ],
    contentPatterns: [
      /clinical\s+(?:performance|safety)\s+(?:data|analysis|evaluation)/i,
      /analysis\s+of\s+(?:the\s+)?clinical\s+(?:data|evidence)/i,
      /(?:safety|performance)\s+(?:data|outcomes?)\s+(?:demonstrate|show|indicate)/i,
    ],
    keywords: ["data analysis", "clinical performance", "clinical safety", "effectiveness", "efficacy", "clinical data analysis", "performance evaluation", "safety evaluation"],
  },
  {
    type: "BENEFIT_ANALYSIS",
    titlePatterns: [
      /(?:^\d+\.?\s*)?benefit[s]?\s+(?:analysis|assessment|evaluation)/i,
      /(?:^\d+\.?\s*)?clinical\s+benefit[s]?/i,
      /(?:^\d+\.?\s*)?(?:analysis|assessment)\s+of\s+benefit[s]?/i,
    ],
    contentPatterns: [
      /(?:clinical\s+)?benefit[s]?\s+(?:include|are|of)/i,
      /benefit[s]?\s+(?:to|for)\s+(?:patient|user)/i,
      /(?:direct|indirect)\s+benefit/i,
      /performance\s+benefit/i,
    ],
    keywords: ["benefit analysis", "clinical benefit", "performance benefit", "patient benefit", "direct benefit", "indirect benefit", "therapeutic benefit"],
  },
  {
    type: "RISK_ANALYSIS",
    titlePatterns: [
      /(?:^\d+\.?\s*)?risk\s+(?:analysis|assessment|evaluation)/i,
      /(?:^\d+\.?\s*)?risks?\s+(?:of|associated)/i,
      /(?:^\d+\.?\s*)?residual\s+risk/i,
      /(?:^\d+\.?\s*)?hazard\s+analysis/i,
    ],
    contentPatterns: [
      /risk\s+(?:analysis|assessment|evaluation)/i,
      /residual\s+risk[s]?/i,
      /risk\s+(?:control|mitigation|reduction)/i,
      /hazard[s]?\s+(?:identification|analysis)/i,
      /acceptable\s+risk/i,
    ],
    keywords: ["risk analysis", "risk assessment", "residual risk", "risk benefit", "hazards", "risk control", "risk mitigation", "acceptable risk", "unacceptable risk", "risk matrix"],
  },
  {
    type: "BENEFIT_RISK_CONCLUSION",
    titlePatterns: [
      /(?:^\d+\.?\s*)?benefit[\-\s]?risk/i,
      /(?:^\d+\.?\s*)?risk[\-\s]?benefit/i,
      /(?:^\d+\.?\s*)?overall\s+(?:benefit[\-\s]?risk\s+)?(?:conclusion|assessment)/i,
      /(?:^\d+\.?\s*)?(?:b\/r|b-r)\s+(?:conclusion|assessment|analysis)/i,
    ],
    contentPatterns: [
      /benefit[\-\s]?risk\s+(?:ratio|conclusion|assessment|determination)/i,
      /(?:the\s+)?benefits?\s+(?:outweigh|exceed)\s+(?:the\s+)?risks?/i,
      /(?:acceptable|favorable|positive)\s+benefit[\-\s]?risk/i,
      /overall\s+(?:benefit[\-\s]?risk\s+)?(?:conclusion|assessment)/i,
    ],
    keywords: ["benefit-risk", "risk-benefit", "acceptable", "favorable", "overall conclusion", "b/r ratio", "benefits outweigh risks", "positive benefit-risk"],
  },
  {
    type: "CONCLUSIONS",
    titlePatterns: [
      /(?:^\d+\.?\s*)?conclusion[s]?$/i,
      /(?:^\d+\.?\s*)?(?:final\s+)?(?:summary|assessment)/i,
      /(?:^\d+\.?\s*)?(?:cer\s+)?conclusion[s]?/i,
    ],
    contentPatterns: [
      /in\s+conclusion/i,
      /(?:this|the)\s+(?:cer|evaluation)\s+concludes/i,
      /(?:based\s+on|considering)\s+(?:the\s+)?(?:above|foregoing|evidence)/i,
      /(?:it\s+(?:is|can\s+be)\s+)?concluded\s+that/i,
    ],
    keywords: ["conclusion", "summary", "final assessment", "recommendation", "concludes", "final conclusion", "overall assessment"],
  },
  {
    type: "APPENDIX",
    titlePatterns: [
      /(?:^\d+\.?\s*)?appendix/i,
      /(?:^\d+\.?\s*)?annex/i,
      /(?:^\d+\.?\s*)?attachment/i,
    ],
    contentPatterns: [],
    keywords: ["appendix", "annex", "attachment", "supporting", "supplementary"],
  },
  {
    type: "REFERENCES",
    titlePatterns: [
      /(?:^\d+\.?\s*)?reference[s]?$/i,
      /(?:^\d+\.?\s*)?bibliography/i,
      /(?:^\d+\.?\s*)?cited\s+(?:literature|works?)/i,
    ],
    contentPatterns: [
      /\[\d+\]\s+\w+/,
      /^\d+\.\s+\w+.*\d{4}/m,
    ],
    keywords: ["references", "bibliography", "citations", "cited literature", "works cited"],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE TYPE MAPPING FROM CER SECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const SECTION_TO_EVIDENCE_MAPPING: Record<CERSectionType, { evidenceTypes: string[]; priority: number }> = {
  COVER_PAGE: { evidenceTypes: ["manufacturer_profile"], priority: 1 },
  TABLE_OF_CONTENTS: { evidenceTypes: [], priority: 0 },
  EXECUTIVE_SUMMARY: { evidenceTypes: ["clinical_evaluation_extract", "benefit_risk_assessment", "clinical_benefit_extract"], priority: 2 },
  SCOPE_AND_CONTEXT: { evidenceTypes: ["cer_extract", "target_population_extract"], priority: 1 },
  DEVICE_DESCRIPTION: { evidenceTypes: ["device_registry_record", "cer_extract", "ifu_extract"], priority: 3 },
  DEVICE_IDENTIFIERS: { evidenceTypes: ["device_registry_record"], priority: 3 },
  REGULATORY_STATUS: { evidenceTypes: ["regulatory_certificate_record", "cer_extract"], priority: 2 },
  INTENDED_PURPOSE: { evidenceTypes: ["ifu_extract", "clinical_evaluation_extract", "target_population_extract"], priority: 3 },
  CLINICAL_BACKGROUND: { evidenceTypes: ["clinical_evaluation_extract", "target_population_extract", "state_of_art_extract"], priority: 2 },
  STATE_OF_ART: { evidenceTypes: ["state_of_art_extract", "alternative_treatment_extract", "clinical_evaluation_extract", "literature_review_summary"], priority: 2 },
  EQUIVALENCE: { evidenceTypes: ["equivalence_extract", "clinical_evaluation_extract"], priority: 2 },
  LITERATURE_SEARCH_PROTOCOL: { evidenceTypes: ["literature_search_strategy"], priority: 3 },
  LITERATURE_SEARCH_RESULTS: { evidenceTypes: ["literature_result", "literature_review_summary"], priority: 3 },
  LITERATURE_ANALYSIS: { evidenceTypes: ["literature_review_summary", "clinical_evaluation_extract", "state_of_art_extract"], priority: 3 },
  CLINICAL_INVESTIGATIONS: { evidenceTypes: ["clinical_evaluation_extract", "pmcf_result", "clinical_benefit_extract"], priority: 3 },
  PMCF_DATA: { evidenceTypes: ["pmcf_result", "pmcf_summary", "pmcf_activity_record", "clinical_benefit_extract"], priority: 3 },
  PMS_DATA: { evidenceTypes: ["pms_activity_log", "pms_plan_extract"], priority: 2 },
  COMPLAINTS_SUMMARY: { evidenceTypes: ["complaint_summary", "complaints_by_region", "previous_psur_extract"], priority: 3 },
  VIGILANCE_SUMMARY: { evidenceTypes: ["serious_incident_summary", "vigilance_report", "previous_psur_extract"], priority: 3 },
  SALES_DATA: { evidenceTypes: ["sales_summary", "sales_by_region", "previous_psur_extract"], priority: 3 },
  CLINICAL_DATA_ANALYSIS: { evidenceTypes: ["clinical_evaluation_extract", "clinical_benefit_extract"], priority: 3 },
  BENEFIT_ANALYSIS: { evidenceTypes: ["benefit_risk_assessment", "clinical_evaluation_extract", "clinical_benefit_extract"], priority: 3 },
  RISK_ANALYSIS: { evidenceTypes: ["benefit_risk_assessment", "risk_assessment", "rmf_extract", "principal_risk_extract", "risk_threshold_extract"], priority: 3 },
  BENEFIT_RISK_CONCLUSION: { evidenceTypes: ["benefit_risk_assessment", "clinical_benefit_extract"], priority: 4 },
  CONCLUSIONS: { evidenceTypes: ["clinical_evaluation_extract", "benefit_risk_assessment"], priority: 4 },
  APPENDIX: { evidenceTypes: ["cer_extract"], priority: 1 },
  REFERENCES: { evidenceTypes: ["literature_result"], priority: 1 },
  UNKNOWN: { evidenceTypes: ["cer_extract"], priority: 0 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SOTA Section Classification using multi-signal rule-based matching
 * 
 * Scoring:
 * - Title pattern match: 60 points (strong signal)
 * - Content pattern match: 40 points
 * - Title keyword match: 25 points per keyword (max 50)
 * - Content keyword match: 3 points per occurrence (max 30)
 * - Negative keyword penalty: -20 points per match
 * - Content length bonus: up to 10 points
 */
function classifySectionRuleBased(title: string, content: string): {
  type: CERSectionType;
  confidence: number;
  reason: string;
  alternatives: { option: string; reason: string; score: number }[];
} {
  const normalizedTitle = title.toLowerCase().trim();
  const normalizedContent = content.toLowerCase();
  const contentSample = normalizedContent.substring(0, 4000); // Analyze more content
  const alternatives: { option: string; reason: string; score: number }[] = [];
  
  let bestMatch: { type: CERSectionType; score: number; reason: string } | null = null;
  
  for (const pattern of SECTION_PATTERNS) {
    let score = 0;
    const reasons: string[] = [];
    
    // Check title patterns (highest weight)
    let titlePatternMatched = false;
    for (const regex of pattern.titlePatterns) {
      if (regex.test(normalizedTitle)) {
        score += 60;
        titlePatternMatched = true;
        reasons.push(`Title matches pattern: ${regex.source}`);
        break; // Only count one title pattern match
      }
    }
    
    // Check content patterns (high weight)
    let contentPatternMatches = 0;
    for (const regex of pattern.contentPatterns) {
      if (regex.test(contentSample)) {
        contentPatternMatches++;
        if (contentPatternMatches <= 2) { // Cap at 2 content pattern matches
          score += 40;
          reasons.push(`Content matches pattern: ${regex.source.substring(0, 50)}`);
        }
      }
    }
    
    // Check keywords in title (medium-high weight)
    let titleKeywordMatches = 0;
    for (const keyword of pattern.keywords) {
      if (normalizedTitle.includes(keyword.toLowerCase())) {
        titleKeywordMatches++;
        score += 25;
        if (titleKeywordMatches <= 2) { // Only log first 2
          reasons.push(`Title contains keyword: "${keyword}"`);
        }
      }
    }
    // Cap title keyword score
    if (titleKeywordMatches > 2) {
      score = score - (titleKeywordMatches - 2) * 25 + 50; // Cap at 50 total
      reasons.push(`...and ${titleKeywordMatches - 2} more title keywords`);
    }
    
    // Check keywords in content (lower weight, but cumulative)
    let contentKeywordCount = 0;
    const matchedKeywords: string[] = [];
    for (const keyword of pattern.keywords) {
      const regex = new RegExp(escapeRegex(keyword.toLowerCase()), "gi");
      const matches = (contentSample.match(regex) || []).length;
      if (matches > 0) {
        contentKeywordCount += matches;
        matchedKeywords.push(keyword);
      }
    }
    if (contentKeywordCount > 0) {
      const keywordScore = Math.min(contentKeywordCount * 3, 30);
      score += keywordScore;
      reasons.push(`Content has ${contentKeywordCount} keyword occurrences (${matchedKeywords.slice(0, 3).join(", ")}${matchedKeywords.length > 3 ? "..." : ""})`);
    }
    
    // Check negative keywords (penalty)
    if (pattern.negativeKeywords) {
      for (const negKeyword of pattern.negativeKeywords) {
        if (normalizedTitle.includes(negKeyword.toLowerCase())) {
          score -= 20;
          reasons.push(`Negative keyword penalty: "${negKeyword}"`);
        }
      }
    }
    
    // Content length bonus/penalty
    if (pattern.minContentLength) {
      if (content.length >= pattern.minContentLength) {
        score += 10;
      } else {
        score -= 10;
        reasons.push(`Content too short (${content.length} < ${pattern.minContentLength})`);
      }
    }
    
    // Only consider if score is positive
    if (score > 0) {
      alternatives.push({
        option: pattern.type,
        reason: reasons.join("; "),
        score,
      });
    }
    
    if (!bestMatch || score > bestMatch.score) {
      if (score > 0) {
        bestMatch = { type: pattern.type, score, reason: reasons.join("; ") };
      }
    }
  }
  
  // Sort alternatives by score
  alternatives.sort((a, b) => b.score - a.score);
  
  if (!bestMatch || bestMatch.score < 15) {
    return {
      type: "UNKNOWN",
      confidence: 0.1,
      reason: "No strong pattern matches found",
      alternatives: alternatives.slice(0, 5),
    };
  }
  
  // Convert score to confidence (0-1)
  // Score of 100+ = 0.95 confidence, 50 = 0.7, 20 = 0.4
  const confidence = Math.min(0.3 + (bestMatch.score / 150) * 0.7, 0.99);
  
  return {
    type: bestMatch.type,
    confidence,
    reason: bestMatch.reason,
    alternatives: alternatives.slice(1, 5), // Top 4 alternatives excluding the best match
  };
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
 * SOTA Evidence Extraction from CER Section using LLM
 * 
 * Uses comprehensive extraction prompts with detailed field specifications
 * and quality indicators for each evidence type.
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
  
  // Build comprehensive extraction prompt with detailed field specifications
  const typeDescriptions = targetTypes.map(t => {
    const specs = EVIDENCE_TYPE_EXTRACTION_SPECS[t];
    if (specs) {
      return `${t}:\n  Required: ${specs.required.join(", ")}\n  Optional: ${specs.optional.join(", ")}\n  Look for: ${specs.lookFor.join("; ")}`;
    }
    return `${t}: Extract all relevant structured data`;
  }).join("\n\n");

  // Prepare content with smart truncation (keep beginning and end)
  const maxContentLength = 8000;
  let contentToAnalyze = section.content;
  if (section.content.length > maxContentLength) {
    const halfLength = Math.floor(maxContentLength / 2);
    contentToAnalyze = section.content.substring(0, halfLength) + 
      "\n\n[...content truncated...]\n\n" + 
      section.content.substring(section.content.length - halfLength);
  }

  const prompt = `You are a senior medical device regulatory expert (CER author) with extensive experience in MDR/IVDR compliance. You are extracting structured evidence from a Clinical Evaluation Report section.

SECTION BEING ANALYZED:
- Section Type: ${section.type}
- Section Title: "${section.title}"
- Classification Confidence: ${(section.confidence * 100).toFixed(0)}%

SECTION CONTENT:
"""
${contentToAnalyze}
"""

YOUR TASK:
Extract evidence for these types (ONLY extract if actual data is present):

${typeDescriptions}

EXTRACTION RULES:
1. ONLY extract if you find ACTUAL, SPECIFIC data (not vague statements)
2. Extract EXACT values when available (numbers, dates, percentages)
3. Look for tables, bullet points, and structured data within the text
4. Note if data is HISTORICAL (from previous PSUR/CER periods)
5. Flag any data quality concerns (incomplete, inconsistent, unclear)
6. If a number range is given, extract both min and max
7. Include units for all quantitative values
8. Extract dates in ISO format (YYYY-MM-DD) when possible
9. Capture the source/reference if mentioned (e.g., "per Table 5", "from PMCF study XYZ")

CONFIDENCE SCORING:
- 0.9-1.0: Exact data with clear source
- 0.7-0.9: Clear data but may need verification
- 0.5-0.7: Implied or partially complete data
- 0.3-0.5: Inferred from context, low certainty
- Below 0.3: Do not extract

Respond in JSON format:
{
  "extractions": [
    {
      "evidenceType": "<type>",
      "confidence": <0.0 to 1.0>,
      "data": { 
        <structured fields with actual values>
      },
      "dataSource": "<where in the section this was found, e.g., 'Table 3', 'paragraph 2'>",
      "reasoning": "<specific text/data that supports this extraction>",
      "isHistorical": <true if data is from previous period>,
      "historicalPeriod": "<if historical, what period, e.g., '2020-2022'>",
      "warnings": ["<any data quality concerns>"],
      "quotedEvidence": "<direct quote from source supporting key values, max 200 chars>"
    }
  ],
  "noDataTypes": ["<types where no extractable data was found>"],
  "noDataReasons": { "<type>": "<why no data could be extracted>" },
  "overallConfidence": <0.0 to 1.0>,
  "sectionAnalysis": "<brief note on section quality and completeness>"
}`;

  const systemPrompt = `You are a CER extraction expert specializing in MDR-compliant clinical evaluation reports. 
Extract only verifiable, specific data - never fabricate or assume values.
Respond ONLY with valid JSON. No explanatory text outside the JSON.
Be thorough - check for data in tables, bullet points, and narrative text.`;

  try {
    const response = await complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      config: { temperature: 0.05, maxTokens: 6000 }, // Low temp for consistency
      responseFormat: "json",
    });
    
    const result = JSON.parse(response.content);
    
    const evidence: CERExtractedEvidence[] = (result.extractions || [])
      .filter((e: any) => e.confidence >= 0.3) // Filter low confidence
      .map((e: any) => ({
        evidenceType: e.evidenceType,
        confidence: e.confidence,
        sourceSection: section.type,
        sourceSectionTitle: section.title,
        data: {
          ...e.data,
          _isHistorical: e.isHistorical || false,
          _historicalPeriod: e.historicalPeriod || null,
          _dataSource: e.dataSource || null,
          _quotedEvidence: e.quotedEvidence || null,
          _sourceCERSection: section.type,
        },
        extractionMethod: "SOTA Claude CER extraction v2",
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
        `Section analysis: ${result.sectionAnalysis || "N/A"}`,
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
 * Comprehensive extraction specifications for each evidence type
 */
const EVIDENCE_TYPE_EXTRACTION_SPECS: Record<string, {
  required: string[];
  optional: string[];
  lookFor: string[];
}> = {
  device_registry_record: {
    required: ["deviceName", "manufacturer"],
    optional: ["model", "udiDi", "basicUdi", "riskClass", "gmdnCode", "gmdnTerm", "intendedPurpose", "catalogNumber", "variants", "accessories"],
    lookFor: ["device name/trade name", "model numbers", "UDI-DI codes", "GMDN codes/terms", "risk classification (Class I/IIa/IIb/III)", "manufacturer legal name", "component list"],
  },
  manufacturer_profile: {
    required: ["manufacturerName"],
    optional: ["address", "country", "authorizedRepresentative", "arAddress", "personResponsible", "notifiedBody"],
    lookFor: ["legal manufacturer name", "registered address", "EU authorized representative", "person responsible for regulatory compliance"],
  },
  regulatory_certificate_record: {
    required: ["certificateNumber"],
    optional: ["notifiedBody", "issueDate", "expiryDate", "scope", "certificateType", "regulation", "annexApplied"],
    lookFor: ["CE certificate numbers", "notified body name/number", "certificate validity dates", "certification scope", "MDR/MDD/IVDR reference"],
  },
  clinical_evaluation_extract: {
    required: ["conclusion"],
    optional: ["safetyConclusion", "performanceConclusion", "clinicalBenefit", "acceptableRisk", "equivalenceConclusion", "gapsIdentified", "updateTriggers"],
    lookFor: ["overall clinical evaluation conclusion", "safety conclusions", "performance conclusions", "benefit-risk statement", "gaps requiring PMCF"],
  },
  benefit_risk_assessment: {
    required: ["overallConclusion"],
    optional: ["benefitsSummary", "risksSummary", "benefitRiskRatio", "acceptability", "residualRisks", "mitigationMeasures", "comparisonToAlternatives"],
    lookFor: ["benefit-risk conclusion", "'benefits outweigh risks'", "favorable/unfavorable ratio", "acceptability statement", "residual risk summary"],
  },
  literature_search_strategy: {
    required: ["databasesSearched"],
    optional: ["searchTerms", "booleanString", "dateRange", "inclusionCriteria", "exclusionCriteria", "languageRestrictions", "searchDate"],
    lookFor: ["database names (PubMed, EMBASE, Cochrane)", "search terms/keywords", "PICO elements", "inclusion/exclusion criteria", "date restrictions"],
  },
  literature_result: {
    required: ["citation"],
    optional: ["database", "publicationType", "yearPublished", "relevanceScore", "keyFindings", "favorable", "limitations", "evidenceLevel"],
    lookFor: ["article citations", "author names", "journal names", "publication years", "study type", "favorable/unfavorable classification"],
  },
  literature_review_summary: {
    required: ["totalArticlesIdentified", "totalArticlesIncluded"],
    optional: ["totalExcluded", "favorableCount", "unfavorableCount", "neutralCount", "reviewConclusion", "prismaCompliant", "searchDate"],
    lookFor: ["total articles found/screened", "articles selected/included", "PRISMA flow data", "favorable vs unfavorable counts", "overall literature conclusion"],
  },
  pmcf_result: {
    required: ["studyType"],
    optional: ["studyId", "studyName", "patientCount", "followUpDuration", "primaryEndpoint", "keyFindings", "conclusion", "status", "startDate", "endDate"],
    lookFor: ["PMCF study names/IDs", "sample sizes", "follow-up periods", "study endpoints", "key outcomes", "study status (ongoing/completed)"],
  },
  pmcf_summary: {
    required: ["activitiesPerformed"],
    optional: ["mainFindings", "pmcfPlanReference", "integration", "futureActivities", "reviewDate", "gaps"],
    lookFor: ["list of PMCF activities", "registry participation", "survey results", "integration with CER conclusions"],
  },
  sales_summary: {
    required: ["totalUnits"],
    optional: ["periodStart", "periodEnd", "cumulativeUnits", "regions", "patientExposure", "deviceExposure", "marketShare", "growthRate"],
    lookFor: ["units sold/distributed", "time periods", "geographic distribution", "patient exposure estimates", "cumulative vs period data"],
  },
  sales_by_region: {
    required: ["region", "units"],
    optional: ["periodStart", "periodEnd", "percentage", "country", "marketSegment"],
    lookFor: ["regional breakdown tables", "country-specific data", "percentage distributions"],
  },
  complaint_summary: {
    required: ["totalComplaints"],
    optional: ["periodStart", "periodEnd", "seriousCount", "nonSeriousCount", "categories", "complaintRate", "trend", "rootCauses", "topComplaints"],
    lookFor: ["total complaint counts", "serious vs non-serious breakdown", "complaint categories", "complaint rate per units", "trending data"],
  },
  complaints_by_region: {
    required: ["region", "complaintCount"],
    optional: ["periodStart", "periodEnd", "seriousCount", "rate", "topCategories"],
    lookFor: ["regional complaint tables", "geographic breakdown of complaints"],
  },
  serious_incident_summary: {
    required: ["totalIncidents"],
    optional: ["periodStart", "periodEnd", "deathCount", "seriousInjuryCount", "reportedToAuthorities", "fscaCount", "categories", "imdrfCodes", "outcomes"],
    lookFor: ["serious incident counts", "MDR/MAUDE reports", "deaths/serious injuries", "FSCA references", "IMDRF codes"],
  },
  vigilance_report: {
    required: ["incidentCount"],
    optional: ["reportType", "competentAuthority", "reportDate", "status", "rootCause", "correctiveActions"],
    lookFor: ["vigilance reports", "competent authority submissions", "investigation status", "corrective actions taken"],
  },
  previous_psur_extract: {
    required: ["previousPeriodReference"],
    optional: ["previousPeriodStart", "previousPeriodEnd", "keyFindings", "trendsIdentified", "changesFromPrevious", "conclusionLastPsur"],
    lookFor: ["references to previous PSURs", "prior period data", "trend comparisons", "changes from last period"],
  },
  ifu_extract: {
    required: ["intendedUse"],
    optional: ["indications", "contraindications", "warnings", "precautions", "targetPopulation", "userProfile", "useEnvironment"],
    lookFor: ["intended use statements", "indications for use", "contraindications list", "warnings and precautions", "target patient population"],
  },
  risk_assessment: {
    required: ["riskAcceptability"],
    optional: ["identifiedRisks", "riskControls", "residualRisks", "benefitRiskRatio", "riskManagementMethod", "hazardAnalysisRef"],
    lookFor: ["risk acceptability conclusion", "identified hazards", "risk control measures", "residual risk evaluation"],
  },
  rmf_extract: {
    required: ["rmfReference"],
    optional: ["riskManagementActivities", "hazardAnalysisSummary", "lastReviewDate", "changes", "openActions"],
    lookFor: ["risk management file references", "hazard analysis summary", "FMEA results", "risk management review dates"],
  },
  pms_plan_extract: {
    required: ["pmsActivitiesPlanned"],
    optional: ["dataSources", "monitoringApproach", "reportingFrequency", "triggers", "responsiblePersons"],
    lookFor: ["PMS plan activities", "data sources", "monitoring methods", "reporting intervals"],
  },
  pms_activity_log: {
    required: ["activityType"],
    optional: ["activityDate", "findings", "actions", "status", "nextReview"],
    lookFor: ["PMS activities performed", "dates of activities", "findings", "actions taken"],
  },
  cer_extract: {
    required: ["extractType"],
    optional: ["content", "reference", "relevance"],
    lookFor: ["any relevant CER content not fitting other categories"],
  },
  // === NEW: Evidence types for comprehensive dossier population ===
  equivalence_extract: {
    required: ["deviceName", "equivalenceType"],
    optional: ["manufacturer", "equivalenceJustification", "technicalComparison", "biologicalComparison", "clinicalComparison", "contractReference"],
    lookFor: ["equivalent device name", "predicate device", "equivalence demonstration (technical/biological/clinical)", "substantial equivalence", "comparison table"],
  },
  target_population_extract: {
    required: ["description"],
    optional: ["ageRange", "conditions", "excludedPopulations", "specialPopulations", "patientProfile"],
    lookFor: ["target patient population", "intended users", "age range", "excluded populations", "special populations (pediatric, geriatric, pregnant)"],
  },
  clinical_benefit_extract: {
    required: ["description"],
    optional: ["endpoint", "evidenceSource", "quantifiedValue", "benefitType", "claimedBenefit"],
    lookFor: ["claimed clinical benefits", "clinical endpoints", "performance claims", "efficacy data", "benefit-risk ratio"],
  },
  state_of_art_extract: {
    required: ["description"],
    optional: ["benchmarkDevices", "performanceThresholds", "alternativeTreatments", "currentPractice", "medicalNeed"],
    lookFor: ["state of the art", "current treatment options", "benchmark devices", "alternative therapies", "standard of care", "medical need"],
  },
  alternative_treatment_extract: {
    required: ["treatmentName"],
    optional: ["treatmentType", "advantages", "disadvantages", "comparison", "clinicalEvidence"],
    lookFor: ["alternative treatments", "competing devices", "surgical alternatives", "pharmaceutical alternatives", "comparator treatments"],
  },
  principal_risk_extract: {
    required: ["hazard", "harm"],
    optional: ["severity", "probability", "preMarketOccurrenceRate", "mitigations", "residualRiskAcceptable", "riskId", "imdrfCode"],
    lookFor: ["identified hazards", "potential harms", "risk severity", "occurrence probability", "mitigation measures", "residual risk acceptability"],
  },
  risk_threshold_extract: {
    required: ["thresholdType"],
    optional: ["complaintRateThreshold", "seriousIncidentThreshold", "signalDetectionMethod", "acceptabilityCriteria", "afapAnalysis"],
    lookFor: ["complaint rate threshold", "incident threshold", "signal detection", "acceptability criteria", "ALARP/AFAP analysis"],
  },
};

/**
 * SOTA Table Evidence Extraction
 * 
 * Analyzes table structure and content to extract appropriate evidence types.
 * Uses comprehensive pattern matching for column headers and content analysis.
 */
function extractTableEvidence(
  table: ParsedTable,
  section: CERSection
): CERExtractedEvidence[] {
  const evidence: CERExtractedEvidence[] = [];
  const traceId = randomUUID();
  
  // Normalize headers for matching
  const headers = table.headers.map(h => h.toLowerCase().trim());
  const headerText = headers.join(" ");
  
  // Detect table type using comprehensive pattern matching
  const tableType = detectTableType(headers, table.rows, section.type);
  
  if (!tableType) {
    console.log(`[CER Extractor] Could not determine table type for "${table.name}" in ${section.type}`);
    return evidence;
  }
  
  console.log(`[CER Extractor] Detected table type: ${tableType.evidenceType} for "${table.name}"`);
  
  // Extract rows based on detected type
  if (tableType.extractionMode === "per_row") {
    // Each row is a separate evidence item
    for (const row of table.rows) {
      const data = normalizeRowData(row, headers, tableType.fieldMappings);
      
      // Skip rows that are mostly empty
      const nonEmptyValues = Object.values(data).filter(v => v && String(v).trim());
      if (nonEmptyValues.length < 2) continue;
      
      evidence.push({
        evidenceType: tableType.evidenceType,
        confidence: tableType.confidence,
        sourceSection: section.type,
        sourceSectionTitle: section.title,
        data: {
          ...data,
          _isHistorical: tableType.isHistorical,
          _tableName: table.name,
          _sourceCERSection: section.type,
        },
        extractionMethod: `Table extraction - ${tableType.description}`,
        extractionReason: tableType.reason,
        warnings: tableType.warnings,
        traceId,
      });
    }
  } else {
    // Aggregate table data into a single evidence item
    const aggregateData = aggregateTableData(table.rows, headers, tableType);
    
    evidence.push({
      evidenceType: tableType.evidenceType,
      confidence: tableType.confidence,
      sourceSection: section.type,
      sourceSectionTitle: section.title,
      data: {
        ...aggregateData,
        _isHistorical: tableType.isHistorical,
        _tableName: table.name,
        _rowCount: table.rows.length,
        _sourceCERSection: section.type,
      },
      extractionMethod: `Table aggregation - ${tableType.description}`,
      extractionReason: tableType.reason,
      warnings: tableType.warnings,
      traceId,
    });
  }
  
  return evidence;
}

/**
 * Table type detection configuration
 */
interface TableTypeConfig {
  evidenceType: string;
  confidence: number;
  extractionMode: "per_row" | "aggregate";
  description: string;
  reason: string;
  warnings: string[];
  isHistorical: boolean;
  fieldMappings: Record<string, string[]>;
}

/**
 * Detect table type based on headers and content
 */
function detectTableType(
  headers: string[],
  rows: Record<string, unknown>[],
  sectionType: CERSectionType
): TableTypeConfig | null {
  const headerText = headers.join(" ").toLowerCase();
  
  // Table type detection patterns (order matters - more specific first)
  
  // 1. Literature/Citation tables
  if (matchesAny(headerText, ["citation", "author", "publication", "article", "reference", "pubmed", "journal", "title"]) &&
      matchesAny(headerText, ["year", "date", "finding", "conclusion", "result", "favorable", "relevance"])) {
    return {
      evidenceType: "literature_result",
      confidence: 0.9,
      extractionMode: "per_row",
      description: "Literature review results",
      reason: "Table contains citation/article data with findings/relevance columns",
      warnings: [],
      isHistorical: false,
      fieldMappings: {
        citation: ["citation", "reference", "article", "title", "author"],
        database: ["database", "source", "pubmed", "embase"],
        yearPublished: ["year", "date", "published"],
        keyFindings: ["finding", "conclusion", "result", "summary", "outcome"],
        favorable: ["favorable", "favourable", "positive", "supportive"],
        evidenceLevel: ["level", "grade", "quality", "oxford"],
      },
    };
  }
  
  // 2. PRISMA/Search results summary
  if (matchesAny(headerText, ["database", "search"]) && matchesAny(headerText, ["hits", "results", "found", "identified", "records"])) {
    return {
      evidenceType: "literature_review_summary",
      confidence: 0.85,
      extractionMode: "aggregate",
      description: "Literature search results summary",
      reason: "Table contains database search results data",
      warnings: [],
      isHistorical: false,
      fieldMappings: {
        database: ["database", "source"],
        articlesFound: ["hits", "results", "found", "identified", "records", "total"],
      },
    };
  }
  
  // 3. Sales/Distribution tables
  if (matchesAny(headerText, ["region", "country", "market", "geography"]) &&
      matchesAny(headerText, ["units", "sales", "distributed", "sold", "volume", "quantity"])) {
    return {
      evidenceType: "sales_by_region",
      confidence: 0.85,
      extractionMode: "per_row",
      description: "Sales/distribution by region",
      reason: "Table contains regional sales/distribution data",
      warnings: ["Data extracted from CER may be from previous reporting period"],
      isHistorical: true,
      fieldMappings: {
        region: ["region", "country", "market", "geography", "territory", "area"],
        units: ["units", "quantity", "volume", "sold", "distributed", "shipped"],
        percentage: ["percent", "%", "share", "proportion"],
        period: ["period", "year", "date", "quarter"],
      },
    };
  }
  
  // 4. Complaint tables
  if (matchesAny(headerText, ["complaint", "feedback", "issue", "problem"]) ||
      (matchesAny(headerText, ["category", "type"]) && matchesAny(headerText, ["count", "number", "total"]))) {
    return {
      evidenceType: "complaints_by_region",
      confidence: 0.85,
      extractionMode: "per_row",
      description: "Complaints data",
      reason: "Table contains complaint category or count data",
      warnings: ["Data extracted from CER may be from previous reporting period"],
      isHistorical: true,
      fieldMappings: {
        category: ["category", "type", "classification", "complaint"],
        complaintCount: ["count", "number", "total", "quantity"],
        seriousCount: ["serious", "major", "critical"],
        region: ["region", "country", "market"],
        period: ["period", "year", "date"],
      },
    };
  }
  
  // 5. Incident/Vigilance tables
  if (matchesAny(headerText, ["incident", "vigilance", "adverse", "event", "mdr", "maude"])) {
    return {
      evidenceType: "serious_incident_summary",
      confidence: 0.85,
      extractionMode: "per_row",
      description: "Vigilance/incident data",
      reason: "Table contains incident or adverse event data",
      warnings: ["Vigilance data - verify against official records"],
      isHistorical: true,
      fieldMappings: {
        incidentType: ["type", "category", "classification", "incident"],
        incidentCount: ["count", "number", "total"],
        outcome: ["outcome", "result", "consequence"],
        imdrf: ["imdrf", "code", "classification"],
        reportedTo: ["reported", "authority", "competent"],
      },
    };
  }
  
  // 6. PMCF study tables
  if (matchesAny(headerText, ["pmcf", "study", "registry", "follow-up", "follow up"]) &&
      matchesAny(headerText, ["patient", "subject", "sample", "enrolled", "finding", "outcome"])) {
    return {
      evidenceType: "pmcf_result",
      confidence: 0.85,
      extractionMode: "per_row",
      description: "PMCF study data",
      reason: "Table contains PMCF study or registry data",
      warnings: [],
      isHistorical: false,
      fieldMappings: {
        studyName: ["study", "name", "registry", "title"],
        studyType: ["type", "design", "method"],
        patientCount: ["patient", "subject", "sample", "enrolled", "n=", "participants"],
        keyFindings: ["finding", "outcome", "result", "conclusion"],
        status: ["status", "phase", "ongoing", "completed"],
      },
    };
  }
  
  // 7. Risk analysis tables
  if (matchesAny(headerText, ["risk", "hazard", "harm"]) &&
      matchesAny(headerText, ["probability", "severity", "control", "mitigation", "acceptability", "rpn"])) {
    return {
      evidenceType: "risk_assessment",
      confidence: 0.8,
      extractionMode: "aggregate",
      description: "Risk analysis data",
      reason: "Table contains risk assessment data",
      warnings: [],
      isHistorical: false,
      fieldMappings: {
        hazard: ["hazard", "risk", "harm", "failure"],
        probability: ["probability", "likelihood", "frequency", "p"],
        severity: ["severity", "consequence", "impact", "s"],
        control: ["control", "mitigation", "measure"],
        acceptability: ["acceptability", "acceptable", "level", "rpn"],
      },
    };
  }
  
  // 8. Device identification tables
  if (matchesAny(headerText, ["udi", "gmdn", "catalog", "model", "variant", "reference"]) &&
      matchesAny(headerText, ["device", "product", "item", "name", "description"])) {
    return {
      evidenceType: "device_registry_record",
      confidence: 0.85,
      extractionMode: "per_row",
      description: "Device identification data",
      reason: "Table contains device identification data",
      warnings: [],
      isHistorical: false,
      fieldMappings: {
        deviceName: ["device", "product", "name", "description", "trade"],
        model: ["model", "variant", "version", "type"],
        udiDi: ["udi", "udi-di", "di"],
        catalogNumber: ["catalog", "reference", "part", "item", "sku"],
        gmdnCode: ["gmdn", "code", "nomenclature"],
      },
    };
  }
  
  // 9. Regulatory/Certificate tables
  if (matchesAny(headerText, ["certificate", "approval", "clearance", "registration"]) ||
      matchesAny(headerText, ["notified body", "nb", "authority", "regulation"])) {
    return {
      evidenceType: "regulatory_certificate_record",
      confidence: 0.8,
      extractionMode: "per_row",
      description: "Regulatory certificate data",
      reason: "Table contains regulatory certificate/approval data",
      warnings: [],
      isHistorical: false,
      fieldMappings: {
        certificateNumber: ["certificate", "number", "no", "id"],
        notifiedBody: ["notified body", "nb", "certification body"],
        issueDate: ["issue", "date", "from", "start"],
        expiryDate: ["expiry", "expiration", "valid", "until", "end"],
        scope: ["scope", "product", "device", "coverage"],
      },
    };
  }
  
  // 10. Section-based fallback
  const sectionBasedType = getSectionBasedTableType(sectionType);
  if (sectionBasedType) {
    return sectionBasedType;
  }
  
  return null;
}

/**
 * Check if text matches any of the patterns
 */
function matchesAny(text: string, patterns: string[]): boolean {
  return patterns.some(p => text.includes(p.toLowerCase()));
}

/**
 * Get table type based on section context
 */
function getSectionBasedTableType(sectionType: CERSectionType): TableTypeConfig | null {
  switch (sectionType) {
    case "LITERATURE_SEARCH_RESULTS":
    case "LITERATURE_ANALYSIS":
      return {
        evidenceType: "literature_result",
        confidence: 0.7,
        extractionMode: "per_row",
        description: "Literature data (section-based)",
        reason: `Table in ${sectionType} section assumed to be literature data`,
        warnings: ["Table type inferred from section - verify relevance"],
        isHistorical: false,
        fieldMappings: {},
      };
    case "SALES_DATA":
      return {
        evidenceType: "sales_by_region",
        confidence: 0.7,
        extractionMode: "per_row",
        description: "Sales data (section-based)",
        reason: `Table in ${sectionType} section assumed to be sales data`,
        warnings: ["Table type inferred from section", "Data may be from previous period"],
        isHistorical: true,
        fieldMappings: {},
      };
    case "COMPLAINTS_SUMMARY":
      return {
        evidenceType: "complaint_summary",
        confidence: 0.7,
        extractionMode: "aggregate",
        description: "Complaint data (section-based)",
        reason: `Table in ${sectionType} section assumed to be complaint data`,
        warnings: ["Table type inferred from section", "Data may be from previous period"],
        isHistorical: true,
        fieldMappings: {},
      };
    case "VIGILANCE_SUMMARY":
      return {
        evidenceType: "serious_incident_summary",
        confidence: 0.7,
        extractionMode: "aggregate",
        description: "Vigilance data (section-based)",
        reason: `Table in ${sectionType} section assumed to be vigilance data`,
        warnings: ["Table type inferred from section", "Verify against official records"],
        isHistorical: true,
        fieldMappings: {},
      };
    case "PMCF_DATA":
      return {
        evidenceType: "pmcf_result",
        confidence: 0.7,
        extractionMode: "per_row",
        description: "PMCF data (section-based)",
        reason: `Table in ${sectionType} section assumed to be PMCF data`,
        warnings: ["Table type inferred from section"],
        isHistorical: false,
        fieldMappings: {},
      };
    default:
      return null;
  }
}

/**
 * Normalize row data using field mappings
 */
function normalizeRowData(
  row: Record<string, unknown>,
  headers: string[],
  fieldMappings: Record<string, string[]>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  
  // First, copy all original data with normalized keys
  for (const header of headers) {
    const value = row[header] || row[Object.keys(row).find(k => k.toLowerCase() === header) || ""];
    if (value !== undefined && value !== "") {
      normalized[header.replace(/\s+/g, "_").replace(/[^\w]/g, "")] = value;
    }
  }
  
  // Then apply field mappings
  for (const [canonicalField, sourcePatterns] of Object.entries(fieldMappings)) {
    for (const pattern of sourcePatterns) {
      const matchingHeader = headers.find(h => h.includes(pattern.toLowerCase()));
      if (matchingHeader) {
        const value = row[matchingHeader] || row[Object.keys(row).find(k => k.toLowerCase() === matchingHeader) || ""];
        if (value !== undefined && value !== "") {
          normalized[canonicalField] = value;
          break;
        }
      }
    }
  }
  
  return normalized;
}

/**
 * Aggregate table data into summary
 */
function aggregateTableData(
  rows: Record<string, unknown>[],
  headers: string[],
  config: TableTypeConfig
): Record<string, unknown> {
  const aggregated: Record<string, unknown> = {
    rowCount: rows.length,
    columnCount: headers.length,
    columns: headers,
  };
  
  // Calculate totals for numeric columns
  for (const header of headers) {
    const values = rows.map(r => r[header] || r[Object.keys(r).find(k => k.toLowerCase() === header) || ""]);
    const numericValues = values
      .map(v => parseFloat(String(v).replace(/[,\s]/g, "")))
      .filter(n => !isNaN(n));
    
    if (numericValues.length > 0) {
      aggregated[`${header.replace(/\s+/g, "_")}_total`] = numericValues.reduce((a, b) => a + b, 0);
      aggregated[`${header.replace(/\s+/g, "_")}_count`] = numericValues.length;
    }
  }
  
  // Add sample data (first 3 rows)
  aggregated.sampleData = rows.slice(0, 3).map(r => {
    const sample: Record<string, unknown> = {};
    for (const h of headers) {
      sample[h] = r[h] || r[Object.keys(r).find(k => k.toLowerCase() === h) || ""];
    }
    return sample;
  });
  
  return aggregated;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK FULL-DOCUMENT EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FALLBACK: Extract evidence from full document when section-based extraction fails
 * 
 * This is used when:
 * - Document has no clear section structure
 * - Section classification confidence is low
 * - Section-based extraction yields minimal results
 */
async function extractFromFullDocumentFallback(
  document: ParsedDocument
): Promise<CERExtractedEvidence[]> {
  const evidence: CERExtractedEvidence[] = [];
  const traceId = randomUUID();
  
  // Take a strategic sample of the document content
  const rawText = document.rawText;
  const maxChunkSize = 12000;
  
  // Sample: beginning, middle, and end of document
  let contentToAnalyze = "";
  if (rawText.length <= maxChunkSize) {
    contentToAnalyze = rawText;
  } else {
    const chunkSize = Math.floor(maxChunkSize / 3);
    const beginning = rawText.substring(0, chunkSize);
    const middleStart = Math.floor(rawText.length / 2) - Math.floor(chunkSize / 2);
    const middle = rawText.substring(middleStart, middleStart + chunkSize);
    const end = rawText.substring(rawText.length - chunkSize);
    contentToAnalyze = `[DOCUMENT START]\n${beginning}\n\n[DOCUMENT MIDDLE]\n${middle}\n\n[DOCUMENT END]\n${end}`;
  }

  const prompt = `You are extracting structured evidence from a Clinical Evaluation Report (CER) document.

The document's section structure was not clearly detected, so you need to analyze the full document content.

DOCUMENT CONTENT (sampled sections):
"""
${contentToAnalyze}
"""

TASK: Identify and extract ALL evidence present in this document. Look for:

1. DEVICE INFORMATION:
   - Device name, model, manufacturer
   - UDI-DI, GMDN code
   - Intended purpose/use
   - Risk classification

2. REGULATORY STATUS:
   - CE certificate information
   - Notified body
   - Regulatory pathway

3. SALES/DISTRIBUTION DATA:
   - Units sold/distributed
   - Geographic distribution
   - Patient exposure

4. COMPLAINT DATA:
   - Total complaints
   - Complaint categories
   - Complaint rates

5. INCIDENT/VIGILANCE DATA:
   - Serious incidents
   - Adverse events
   - FSCAs

6. CLINICAL DATA:
   - PMCF studies/results
   - Literature review findings
   - Clinical investigations

7. BENEFIT-RISK:
   - Benefits summary
   - Risks identified
   - Overall conclusion

For each piece of evidence found, extract the SPECIFIC DATA VALUES (not just confirmation that data exists).

Respond in JSON:
{
  "foundEvidence": [
    {
      "evidenceType": "device_registry_record|sales_summary|complaint_summary|serious_incident_summary|pmcf_result|literature_review_summary|benefit_risk_assessment|regulatory_certificate_record|clinical_evaluation_extract",
      "confidence": 0.0-1.0,
      "data": { <actual extracted values> },
      "sourceLocation": "beginning|middle|end of document",
      "quotedText": "<direct quote supporting this extraction, max 200 chars>"
    }
  ],
  "documentType": "<detected document type>",
  "overallQuality": 0.0-1.0,
  "missingExpectedData": ["<data types expected in CER but not found>"]
}`;

  try {
    const response = await complete({
      messages: [
        { role: "system", content: "You are a CER analysis expert. Extract all findable evidence. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      config: { temperature: 0.1, maxTokens: 6000 },
      responseFormat: "json",
    });
    
    const result = JSON.parse(response.content);
    
    for (const item of result.foundEvidence || []) {
      if (item.confidence < 0.4) continue; // Skip low confidence
      
      evidence.push({
        evidenceType: item.evidenceType,
        confidence: item.confidence * 0.85, // Reduce confidence for fallback extraction
        sourceSection: "UNKNOWN",
        sourceSectionTitle: `Full Document Analysis (${item.sourceLocation || "unknown location"})`,
        data: {
          ...item.data,
          _extractionMethod: "FALLBACK_FULL_DOCUMENT",
          _quotedEvidence: item.quotedText || null,
        },
        extractionMethod: "SOTA Full Document Fallback Analysis",
        extractionReason: `Extracted via full document LLM analysis: ${item.quotedText?.substring(0, 100) || "no quote"}`,
        warnings: ["Extracted via fallback - verify accuracy"],
        traceId,
      });
    }
    
    console.log(`[CER Extractor] Fallback extraction found ${evidence.length} evidence items`);
    
  } catch (error) {
    console.error(`[CER Extractor] Fallback extraction failed:`, error);
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

  // Phase 3.5: FALLBACK - Full document analysis if section extraction yielded minimal results
  const uniqueEvidenceTypes = new Set(extractedEvidence.map(e => e.evidenceType));
  const hasMinimalResults = extractedEvidence.length < 3 || uniqueEvidenceTypes.size < 2;
  
  if (hasMinimalResults && document.rawText.length > 500) {
    console.log(`[CER Extractor] Phase 3.5: FALLBACK Full Document Analysis (section extraction yielded ${extractedEvidence.length} items)`);
    
    const fallbackEvidence = await extractFromFullDocumentFallback(document);
    
    // Only add evidence types we don't already have
    for (const evidence of fallbackEvidence) {
      if (!uniqueEvidenceTypes.has(evidence.evidenceType)) {
        extractedEvidence.push(evidence);
        uniqueEvidenceTypes.add(evidence.evidenceType);
      }
    }
    
    if (fallbackEvidence.length > 0) {
      decisionTrace.push({
        traceId: randomUUID(),
        timestamp: new Date().toISOString(),
        stage: "EVIDENCE_EXTRACTION",
        decision: `FALLBACK: Full document analysis extracted ${fallbackEvidence.length} additional items`,
        confidence: 0.7,
        inputSummary: `Full document text (${document.rawText.length} chars)`,
        outputSummary: `New types: ${fallbackEvidence.map(e => e.evidenceType).join(", ")}`,
        reasoning: [
          "Section-based extraction yielded insufficient results",
          "Full document LLM analysis performed as fallback",
          `Added ${fallbackEvidence.length} evidence items from full document`
        ],
        warnings: ["Fallback extraction may have lower precision than section-based extraction"],
      });
      
      warnings.push("Full document fallback extraction was used due to insufficient section-based results");
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
