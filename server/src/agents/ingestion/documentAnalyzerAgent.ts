/**
 * Document Analyzer Agent
 * 
 * SOTA automatic evidence type detection from complex documents.
 * Uses Claude Sonnet 4.5 for semantic understanding of document structure,
 * content analysis, and multi-evidence type detection.
 * 
 * Key capabilities:
 * - Automatic detection of ALL evidence types in a document
 * - Multi-evidence extraction from complex documents (CERs, reports)
 * - Confidence scoring with reasoning
 * - Full traceability of detection decisions
 */

import { BaseAgent, AgentConfig, createAgentConfig } from "../baseAgent";
import { complete, PROMPT_TEMPLATES } from "../llmService";
import { ParsedDocument, ParsedTable, ParsedSection } from "../../parsers/documentParser";
import { EVIDENCE_TYPES, EvidenceType } from "../../parsers/evidenceExtractor";
import { randomUUID } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DocumentAnalysisInput {
  document: ParsedDocument;
  psurCaseId?: number;
  deviceCode?: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface DetectedEvidenceType {
  evidenceType: string;
  confidence: number;
  category: string;
  reasoning: string[];
  sourceLocations: {
    type: "table" | "section" | "content";
    name: string;
    relevance: number;
  }[];
  estimatedRecordCount: number;
  fieldAvailability: {
    required: string[];
    optional: string[];
    missing: string[];
  };
  extractionRecommendation: "high_priority" | "recommended" | "optional" | "low_confidence";
}

export interface DocumentAnalysisOutput {
  documentId: string;
  filename: string;
  documentType: string;
  documentClassification: {
    primaryType: string;
    secondaryTypes: string[];
    confidence: number;
    reasoning: string;
  };
  detectedDevice?: {
    name: string;
    model?: string;
    code?: string;
    confidence: number;
    reasoning: string;
  };
  detectedEvidenceTypes: DetectedEvidenceType[];
  multiEvidenceDocument: boolean;
  structureAnalysis: {
    tableCount: number;
    sectionCount: number;
    estimatedComplexity: "simple" | "moderate" | "complex";
    dataRichAreas: string[];
  };
  recommendations: {
    primaryExtraction: string[];
    secondaryExtraction: string[];
    manualReviewNeeded: string[];
  };
  analysisTrace: AnalysisTraceEntry[];
  processingTimeMs: number;
}

export interface AnalysisTraceEntry {
  traceId: string;
  timestamp: string;
  stage: string;
  decision: string;
  confidence: number;
  reasoning: string[];
  durationMs?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE TYPE SIGNATURES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detailed signatures for each evidence type including:
 * - Header patterns (for tables)
 * - Content keywords (for text)
 * - Structure patterns (for document organization)
 * - Semantic indicators (for LLM-based detection)
 */
const EVIDENCE_SIGNATURES: Record<string, {
  headerPatterns: RegExp[];
  contentKeywords: string[];
  structurePatterns: string[];
  semanticIndicators: string[];
  minConfidenceThreshold: number;
}> = {
  // ── Category 1: Device Master Data ──
  device_identification: {
    headerPatterns: [
      /device|product|model/i,
      /udi|gmdn|classification/i,
      /manufacturer|registration/i,
    ],
    contentKeywords: ["device", "model", "udi", "catalog", "registration", "manufacturer", "classification", "gmdn"],
    structurePatterns: ["device registry", "product catalog", "registration data"],
    semanticIndicators: ["device identification", "product registration", "regulatory status"],
    minConfidenceThreshold: 0.5,
  },

  // ── Category 2: Complaints ──
  complaint_record: {
    headerPatterns: [
      /complaint|issue|feedback|problem/i,
      /date|received|reported/i,
      /description|details|narrative/i,
    ],
    contentKeywords: ["complaint", "reported", "issue", "problem", "allegation", "customer feedback", "concern"],
    structurePatterns: ["complaint log", "issue tracker", "feedback register"],
    semanticIndicators: ["customer complaint", "quality issue", "product concern", "user feedback"],
    minConfidenceThreshold: 0.5,
  },
  complaint_investigation: {
    headerPatterns: [
      /investigation|root.?cause|findings/i,
      /confirmed|determination/i,
      /corrective.?action|resolution/i,
    ],
    contentKeywords: ["investigation", "root cause", "confirmed", "findings", "determination", "corrective action"],
    structurePatterns: ["investigation report", "root cause analysis", "complaint investigation"],
    semanticIndicators: ["complaint investigation", "root cause determination", "investigation findings"],
    minConfidenceThreshold: 0.5,
  },

  // ── Category 3: Vigilance ──
  serious_incident_record: {
    headerPatterns: [
      /incident|adverse|mdr|vigilance/i,
      /serious|death|injury|malfunction/i,
      /imdrf|event.?type|outcome/i,
    ],
    contentKeywords: ["serious incident", "adverse event", "death", "injury", "mdr", "vigilance", "reportable", "imdrf"],
    structurePatterns: ["incident report", "adverse event log", "vigilance report"],
    semanticIndicators: ["medical device incident", "patient harm", "serious adverse event", "reportable event"],
    minConfidenceThreshold: 0.4,
  },
  serious_incident_investigation: {
    headerPatterns: [
      /investigation|root.?cause|analysis/i,
      /actions.?taken|outcome/i,
      /incident.?investigation/i,
    ],
    contentKeywords: ["investigation", "root cause", "analysis", "actions taken", "incident investigation"],
    structurePatterns: ["incident investigation report", "root cause analysis", "investigation summary"],
    semanticIndicators: ["incident root cause analysis", "investigation outcome", "actions taken"],
    minConfidenceThreshold: 0.5,
  },
  vigilance_submission_log: {
    headerPatterns: [
      /submission|eudamed|competent.?authority/i,
      /notification|timeline|regulatory/i,
      /report.?status/i,
    ],
    contentKeywords: ["submission", "eudamed", "competent authority", "notification", "timeline", "regulatory report"],
    structurePatterns: ["submission log", "vigilance reporting", "regulatory notification"],
    semanticIndicators: ["vigilance submission", "regulatory notification", "eudamed report"],
    minConfidenceThreshold: 0.5,
  },

  // ── Category 4: Sales ──
  sales_transactions: {
    headerPatterns: [
      /sales|sold|units|quantity|volume|revenue/i,
      /region|country|market|territory/i,
      /period|quarter|month|year/i,
    ],
    contentKeywords: ["sales", "units sold", "volume", "revenue", "distribution", "shipped", "market share", "transaction"],
    structurePatterns: ["table with regional breakdown", "sales summary", "distribution data"],
    semanticIndicators: ["commercial data", "sales figures", "market penetration", "usage statistics"],
    minConfidenceThreshold: 0.5,
  },

  // ── Category 5: FSCA ──
  fsca_record: {
    headerPatterns: [
      /fsca|field.?safety|corrective.?action|recall/i,
      /affected.?units|scope/i,
      /advisory|notice/i,
    ],
    contentKeywords: ["fsca", "field safety", "recall", "corrective action", "advisory", "notice", "affected units"],
    structurePatterns: ["fsca log", "recall tracker", "corrective action register"],
    semanticIndicators: ["field safety corrective action", "product recall", "safety advisory"],
    minConfidenceThreshold: 0.5,
  },
  fsca_effectiveness: {
    headerPatterns: [
      /effectiveness|completion|retrieved/i,
      /verification|percent|progress/i,
      /fsca.*effect/i,
    ],
    contentKeywords: ["effectiveness", "completion", "retrieved", "verification", "fsca effectiveness"],
    structurePatterns: ["effectiveness check", "fsca completion", "retrieval status"],
    semanticIndicators: ["fsca effectiveness verification", "retrieval progress", "completion tracking"],
    minConfidenceThreshold: 0.5,
  },

  // ── Category 6: CAPA ──
  capa_record: {
    headerPatterns: [
      /capa|corrective|preventive/i,
      /root.?cause|investigation/i,
      /effectiveness|verification/i,
    ],
    contentKeywords: ["capa", "corrective action", "preventive action", "root cause", "improvement"],
    structurePatterns: ["capa log", "corrective action tracker", "improvement register"],
    semanticIndicators: ["corrective and preventive action", "quality improvement"],
    minConfidenceThreshold: 0.5,
  },
  ncr_record: {
    headerPatterns: [
      /ncr|non.?conform|deviation/i,
      /nonconformity|non.?conformity/i,
    ],
    contentKeywords: ["ncr", "non-conformance", "deviation", "nonconformity", "non-conformity"],
    structurePatterns: ["ncr log", "deviation register", "non-conformance tracker"],
    semanticIndicators: ["non-conformance report", "quality deviation", "process deviation"],
    minConfidenceThreshold: 0.5,
  },

  // ── Category 9: PMCF ──
  pmcf_results: {
    headerPatterns: [
      /pmcf|post.?market|clinical.?follow/i,
      /study|registry|survey/i,
      /patient|subject|enrolled/i,
    ],
    contentKeywords: ["pmcf", "post-market", "clinical follow-up", "registry", "study", "survey", "cohort"],
    structurePatterns: ["pmcf report", "clinical study results", "registry data"],
    semanticIndicators: ["post-market clinical follow-up", "real-world evidence", "clinical registry"],
    minConfidenceThreshold: 0.5,
  },

  // ── Category 10: Literature ──
  literature_findings: {
    headerPatterns: [
      /literature|publication|article|journal/i,
      /pubmed|embase|cochrane|medline/i,
      /citation|reference|author/i,
    ],
    contentKeywords: ["literature", "publication", "article", "journal", "pubmed", "search", "review", "citation"],
    structurePatterns: ["literature search", "publication list", "reference table"],
    semanticIndicators: ["systematic literature review", "scientific publication", "peer-reviewed article"],
    minConfidenceThreshold: 0.5,
  },

  // ── Category 11: PMS ──
  pms_activity_log: {
    headerPatterns: [
      /pms|surveillance|monitoring/i,
      /activity|planned|actual/i,
      /post.?market/i,
    ],
    contentKeywords: ["pms", "surveillance", "activity", "monitoring", "post-market surveillance"],
    structurePatterns: ["pms activity log", "surveillance tracker", "activity register"],
    semanticIndicators: ["post-market surveillance activity", "pms monitoring", "surveillance plan execution"],
    minConfidenceThreshold: 0.5,
  },

  // ── Calculated / Analysis types ──
  statistical_trending: {
    headerPatterns: [
      /trend|analysis|pattern/i,
      /statistical|significance|rate/i,
      /comparison|baseline/i,
    ],
    contentKeywords: ["trend", "analysis", "statistical", "rate", "pattern", "increase", "decrease", "comparison"],
    structurePatterns: ["trend report", "statistical analysis", "comparative data"],
    semanticIndicators: ["trend identification", "statistical significance", "rate analysis"],
    minConfidenceThreshold: 0.5,
  },
  benefit_risk_quantification: {
    headerPatterns: [
      /benefit|risk|assessment/i,
      /acceptable|residual|mitigation/i,
      /conclusion|determination/i,
    ],
    contentKeywords: ["benefit", "risk", "assessment", "acceptable", "residual", "mitigation", "favorable"],
    structurePatterns: ["benefit-risk analysis", "risk assessment summary", "bra conclusion"],
    semanticIndicators: ["benefit-risk determination", "risk acceptability", "safety profile"],
    minConfidenceThreshold: 0.5,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT ANALYZER AGENT
// ═══════════════════════════════════════════════════════════════════════════════

export class DocumentAnalyzerAgent extends BaseAgent<DocumentAnalysisInput, DocumentAnalysisOutput> {
  constructor(config?: Partial<AgentConfig>) {
    super(createAgentConfig("DocumentAnalyzerAgent", "Automatic Evidence Type Detection Agent", {
      llm: {
        provider: "anthropic",
        temperature: 0.1,
        maxTokens: 8192,
      },
      behavior: {
        confidenceThreshold: 0.4,
        maxRetries: 2,
        retryDelayMs: 1000,
        timeoutMs: 180000,
      },
      ...config,
    }));
  }

  protected async execute(input: DocumentAnalysisInput): Promise<DocumentAnalysisOutput> {
    const startTime = Date.now();
    const traces: AnalysisTraceEntry[] = [];
    const { document } = input;

    // PHASE 1: Structure Analysis
    const structureTrace = this.addTrace(traces, "STRUCTURE_ANALYSIS", "Analyzing document structure");
    const structureAnalysis = this.analyzeDocumentStructure(document);
    structureTrace.confidence = 1.0;
    structureTrace.reasoning = [
      `Found ${document.tables.length} tables`,
      `Found ${document.sections.length} sections`,
      `Document type: ${document.documentType}`,
      `Text length: ${document.rawText.length} characters`,
    ];
    structureTrace.durationMs = Date.now() - startTime;

    // PHASE 2: Rule-based detection (fast, deterministic)
    const ruleTrace = this.addTrace(traces, "RULE_BASED_DETECTION", "Applying signature-based detection rules");
    const ruleBasedResults = this.detectEvidenceTypesRuleBased(document);
    ruleTrace.confidence = 0.7;
    ruleTrace.reasoning = [
      `Detected ${ruleBasedResults.length} potential evidence types via rule matching`,
      `Types: ${ruleBasedResults.map(r => r.evidenceType).join(", ")}`,
    ];
    ruleTrace.durationMs = Date.now() - startTime - (structureTrace.durationMs || 0);

    // PHASE 3: LLM-powered semantic analysis
    const llmTrace = this.addTrace(traces, "LLM_SEMANTIC_ANALYSIS", "Invoking Claude for semantic understanding");
    let llmResults: DetectedEvidenceType[] = [];
    let detectedDevice: DocumentAnalysisOutput["detectedDevice"] | undefined;
    let documentClassification = {
      primaryType: "unknown",
      secondaryTypes: [] as string[],
      confidence: 0,
      reasoning: "",
    };

    // Only attempt LLM analysis if we have meaningful content
    if (document.rawText.length > 50 || document.tables.length > 0) {
      try {
        console.log(`[DocumentAnalyzerAgent] Starting LLM analysis for ${document.filename}...`);
        const llmAnalysis = await this.performLLMAnalysis(document, ruleBasedResults);
        llmResults = llmAnalysis.detectedTypes;
        documentClassification = llmAnalysis.classification;
        detectedDevice = llmAnalysis.detectedDevice;
        llmTrace.confidence = documentClassification.confidence;
        llmTrace.reasoning = [
          `Primary document type: ${documentClassification.primaryType}`,
          `Detected ${llmResults.length} evidence types via semantic analysis`,
          documentClassification.reasoning,
        ];
        if (detectedDevice) {
          llmTrace.reasoning.push(`Identified device: ${detectedDevice.name} (${(detectedDevice.confidence * 100).toFixed(0)}%)`);
        }
        console.log(`[DocumentAnalyzerAgent] LLM analysis complete: ${llmResults.length} types detected`);
      } catch (error: any) {
        console.warn(`[DocumentAnalyzerAgent] LLM analysis failed: ${error?.message || error}`);
        llmTrace.confidence = 0.3;
        llmTrace.reasoning = [`LLM analysis failed: ${error?.message || "Unknown error"}`, "Falling back to rule-based results"];

        // Set document classification from rule-based results if LLM failed
        if (ruleBasedResults.length > 0) {
          const topResult = ruleBasedResults[0];
          documentClassification = {
            primaryType: topResult.category || "unknown",
            secondaryTypes: ruleBasedResults.slice(1, 4).map(r => r.category),
            confidence: topResult.confidence * 0.7, // Lower confidence since rule-based only
            reasoning: "Based on rule-based pattern matching (LLM unavailable)",
          };
        }
      }
    } else {
      llmTrace.confidence = 0.2;
      llmTrace.reasoning = ["Insufficient document content for LLM analysis", "Using rule-based detection only"];
      console.log(`[DocumentAnalyzerAgent] Skipping LLM analysis - insufficient content`);
    }
    llmTrace.durationMs = Date.now() - startTime - (structureTrace.durationMs || 0) - (ruleTrace.durationMs || 0);

    // PHASE 4: Merge and score results
    const mergeTrace = this.addTrace(traces, "RESULT_MERGING", "Merging rule-based and LLM results");
    const mergedResults = this.mergeDetectionResults(ruleBasedResults, llmResults);
    mergeTrace.confidence = 0.9;
    mergeTrace.reasoning = [
      `Merged ${ruleBasedResults.length} rule-based and ${llmResults.length} LLM detections`,
      `Final count: ${mergedResults.length} unique evidence types`,
    ];
    mergeTrace.durationMs = Date.now() - startTime - (structureTrace.durationMs || 0) - (ruleTrace.durationMs || 0) - (llmTrace.durationMs || 0);

    // PHASE 5: Generate recommendations
    const recommendations = this.generateRecommendations(mergedResults, structureAnalysis);

    return {
      documentId: document.contentHash,
      filename: document.filename,
      documentType: document.documentType,
      documentClassification,
      detectedDevice,
      detectedEvidenceTypes: mergedResults,
      multiEvidenceDocument: mergedResults.length > 1,
      structureAnalysis,
      recommendations,
      analysisTrace: traces,
      processingTimeMs: Date.now() - startTime,
    };
  }

  private addTrace(traces: AnalysisTraceEntry[], stage: string, decision: string): AnalysisTraceEntry {
    const trace: AnalysisTraceEntry = {
      traceId: randomUUID(),
      timestamp: new Date().toISOString(),
      stage,
      decision,
      confidence: 0,
      reasoning: [],
    };
    traces.push(trace);
    return trace;
  }

  private analyzeDocumentStructure(document: ParsedDocument): DocumentAnalysisOutput["structureAnalysis"] {
    const dataRichAreas: string[] = [];

    // Identify data-rich tables
    for (const table of document.tables) {
      if (table.rows.length >= 5) {
        dataRichAreas.push(`Table: ${table.name} (${table.rows.length} rows)`);
      }
    }

    // Identify data-rich sections
    for (const section of document.sections) {
      if (section.content.length > 500) {
        dataRichAreas.push(`Section: ${section.title}`);
      }
    }

    const complexity =
      document.tables.length > 5 || document.sections.length > 10 ? "complex" :
        document.tables.length > 2 || document.sections.length > 5 ? "moderate" :
          "simple";

    return {
      tableCount: document.tables.length,
      sectionCount: document.sections.length,
      estimatedComplexity: complexity,
      dataRichAreas,
    };
  }

  private detectEvidenceTypesRuleBased(document: ParsedDocument): DetectedEvidenceType[] {
    const results: DetectedEvidenceType[] = [];
    const allTypes = Object.keys(EVIDENCE_SIGNATURES);

    for (const evidenceType of allTypes) {
      const signature = EVIDENCE_SIGNATURES[evidenceType];
      const detection = this.scoreEvidenceType(document, evidenceType, signature);

      if (detection.confidence >= signature.minConfidenceThreshold) {
        results.push(detection);
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  private scoreEvidenceType(
    document: ParsedDocument,
    evidenceType: string,
    signature: typeof EVIDENCE_SIGNATURES[string]
  ): DetectedEvidenceType {
    let totalScore = 0;
    let maxPossibleScore = 0;
    const sourceLocations: DetectedEvidenceType["sourceLocations"] = [];
    const reasoning: string[] = [];

    // Score tables
    for (const table of document.tables) {
      const headerText = table.headers.join(" ").toLowerCase();
      let tableScore = 0;

      for (const pattern of signature.headerPatterns) {
        maxPossibleScore += 3;
        if (pattern.test(headerText)) {
          tableScore += 3;
          reasoning.push(`Table "${table.name}" headers match pattern: ${pattern.source}`);
        }
      }

      if (tableScore > 0) {
        sourceLocations.push({
          type: "table",
          name: table.name,
          relevance: Math.min(1, tableScore / (signature.headerPatterns.length * 3)),
        });
        totalScore += tableScore;
      }
    }

    // Score sections
    for (const section of document.sections) {
      const contentText = (section.title + " " + section.content).toLowerCase();
      let sectionScore = 0;

      for (const keyword of signature.contentKeywords) {
        maxPossibleScore += 2;
        if (contentText.includes(keyword.toLowerCase())) {
          sectionScore += 2;
          if (reasoning.length < 10) {
            reasoning.push(`Section "${section.title}" contains keyword: "${keyword}"`);
          }
        }
      }

      if (sectionScore > 0) {
        sourceLocations.push({
          type: "section",
          name: section.title,
          relevance: Math.min(1, sectionScore / (signature.contentKeywords.length * 2)),
        });
        totalScore += sectionScore;
      }
    }

    // Score raw text for semantic indicators
    const rawTextLower = document.rawText.toLowerCase();
    for (const indicator of signature.semanticIndicators) {
      maxPossibleScore += 4;
      if (rawTextLower.includes(indicator.toLowerCase())) {
        totalScore += 4;
        if (reasoning.length < 10) {
          reasoning.push(`Document contains semantic indicator: "${indicator}"`);
        }
      }
    }

    const confidence = maxPossibleScore > 0 ? Math.min(1, totalScore / maxPossibleScore) : 0;
    const evidenceTypeInfo = EVIDENCE_TYPES.find(t => t.type === evidenceType);

    // Estimate record count from tables
    let estimatedRecordCount = 0;
    for (const loc of sourceLocations) {
      if (loc.type === "table") {
        const table = document.tables.find(t => t.name === loc.name);
        if (table) {
          estimatedRecordCount += table.rows.length;
        }
      }
    }

    return {
      evidenceType,
      confidence,
      category: evidenceTypeInfo?.category || "Unknown",
      reasoning,
      sourceLocations,
      estimatedRecordCount,
      fieldAvailability: {
        required: evidenceTypeInfo?.requiredFields || [],
        optional: evidenceTypeInfo?.optionalFields || [],
        missing: [],
      },
      extractionRecommendation: this.getExtractionRecommendation(confidence),
    };
  }

  private async performLLMAnalysis(
    document: ParsedDocument,
    ruleBasedResults: DetectedEvidenceType[]
  ): Promise<{
    classification: DocumentAnalysisOutput["documentClassification"];
    detectedDevice?: DocumentAnalysisOutput["detectedDevice"];
    detectedTypes: DetectedEvidenceType[];
  }> {
    // Prepare document summary for LLM
    const documentSummary = this.prepareDocumentSummary(document);
    const ruleBasedSummary = ruleBasedResults.map(r =>
      `${r.evidenceType} (confidence: ${(r.confidence * 100).toFixed(0)}%)`
    ).join(", ");

    const { PROMPT_TEMPLATES } = await import("../llmService");
    const basePrompt = PROMPT_TEMPLATES.DOCUMENT_ANALYSIS;

    const prompt = basePrompt
      .replace("{filename}", document.filename)
      .replace("{documentType}", document.documentType)
      .replace("{tableCount}", document.tables.length.toString())
      .replace("{sectionCount}", document.sections.length.toString())
      .replace("{documentSummary}", documentSummary)
      .replace("{ruleBasedResults}", ruleBasedSummary || "No evidence types detected by rules")
      .replace("{availableEvidenceTypes}", EVIDENCE_TYPES.map(t => `- ${t.type}: ${t.description}`).join("\n"));

    try {
      const response = await complete({
        messages: [
          { role: "system", content: "You are an expert medical device regulatory analyst. Analyze documents for PSUR evidence types. Always respond with valid JSON." },
          { role: "user", content: prompt }
        ],
        config: {
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          temperature: 0.1,
          maxTokens: 4096,
        },
        responseFormat: "json",
        agentId: "document-analyzer",
        traceContext: { operation: "document_analysis" }
      });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Invalid JSON response from LLM");
      }

      const result = JSON.parse(jsonMatch[0]);

      // Convert LLM results to our format
      const detectedTypes: DetectedEvidenceType[] = (result.detectedTypes || []).map((dt: any) => ({
        evidenceType: dt.evidenceType,
        confidence: dt.confidence,
        category: EVIDENCE_TYPES.find(t => t.type === dt.evidenceType)?.category || "Unknown",
        reasoning: Array.isArray(dt.reasoning) ? dt.reasoning : [dt.reasoning],
        sourceLocations: (dt.sourceAreas || []).map((area: string) => ({
          type: "content" as const,
          name: area,
          relevance: dt.confidence,
        })),
        estimatedRecordCount: dt.estimatedRecordCount || 0,
        fieldAvailability: {
          required: [],
          optional: [],
          missing: [],
        },
        extractionRecommendation: this.getExtractionRecommendation(dt.confidence),
      }));

      // Parse detected device
      let detectedDevice: DocumentAnalysisOutput["detectedDevice"] | undefined;
      if (result.detectedDevice && result.detectedDevice.found && result.detectedDevice.name) {
        detectedDevice = {
          name: result.detectedDevice.name,
          model: result.detectedDevice.model || undefined,
          code: result.detectedDevice.code || undefined,
          confidence: result.detectedDevice.confidence || 0.8,
          reasoning: result.detectedDevice.reasoning || "Identified by LLM",
        };
      }

      return {
        classification: result.classification,
        detectedDevice,
        detectedTypes,
      };
    } catch (error: any) {
      console.error("[DocumentAnalyzerAgent] LLM analysis failed:", error.message);
      throw error;
    }
  }

  private prepareDocumentSummary(document: ParsedDocument): string {
    const parts: string[] = [];

    // Table summaries
    if (document.tables.length > 0) {
      parts.push("### Tables");
      for (const table of document.tables.slice(0, 5)) {
        parts.push(`- ${table.name}: ${table.headers.slice(0, 8).join(", ")}${table.headers.length > 8 ? "..." : ""} (${table.rows.length} rows)`);
      }
      if (document.tables.length > 5) {
        parts.push(`... and ${document.tables.length - 5} more tables`);
      }
    }

    // Section summaries
    if (document.sections.length > 0) {
      parts.push("\n### Sections");
      for (const section of document.sections.slice(0, 10)) {
        const preview = section.content.substring(0, 150).replace(/\n/g, " ");
        parts.push(`- ${section.title}: ${preview}${section.content.length > 150 ? "..." : ""}`);
      }
      if (document.sections.length > 10) {
        parts.push(`... and ${document.sections.length - 10} more sections`);
      }
    }

    // Content preview
    if (document.rawText.length > 0) {
      parts.push("\n### Content Preview");
      parts.push(document.rawText.substring(0, 2000) + (document.rawText.length > 2000 ? "..." : ""));
    }

    return parts.join("\n");
  }

  private mergeDetectionResults(
    ruleBased: DetectedEvidenceType[],
    llmBased: DetectedEvidenceType[]
  ): DetectedEvidenceType[] {
    const merged = new Map<string, DetectedEvidenceType>();

    // Add rule-based results
    for (const result of ruleBased) {
      merged.set(result.evidenceType, result);
    }

    // Merge LLM results (boost confidence if both agree)
    for (const llmResult of llmBased) {
      const existing = merged.get(llmResult.evidenceType);

      if (existing) {
        // Both methods detected - boost confidence
        const combinedConfidence = Math.min(1, (existing.confidence + llmResult.confidence) / 1.5);
        merged.set(llmResult.evidenceType, {
          ...existing,
          confidence: combinedConfidence,
          reasoning: [...existing.reasoning, ...llmResult.reasoning.map(r => `[LLM] ${r}`)],
          sourceLocations: [...existing.sourceLocations, ...llmResult.sourceLocations],
          extractionRecommendation: this.getExtractionRecommendation(combinedConfidence),
        });
      } else {
        // Only LLM detected
        merged.set(llmResult.evidenceType, llmResult);
      }
    }

    return Array.from(merged.values())
      .filter(r => r.confidence >= 0.3)
      .sort((a, b) => b.confidence - a.confidence);
  }

  private getExtractionRecommendation(confidence: number): DetectedEvidenceType["extractionRecommendation"] {
    if (confidence >= 0.8) return "high_priority";
    if (confidence >= 0.6) return "recommended";
    if (confidence >= 0.4) return "optional";
    return "low_confidence";
  }

  private generateRecommendations(
    detectedTypes: DetectedEvidenceType[],
    structure: DocumentAnalysisOutput["structureAnalysis"]
  ): DocumentAnalysisOutput["recommendations"] {
    const primary: string[] = [];
    const secondary: string[] = [];
    const manualReview: string[] = [];

    for (const detected of detectedTypes) {
      switch (detected.extractionRecommendation) {
        case "high_priority":
          primary.push(`Extract ${detected.evidenceType} (${(detected.confidence * 100).toFixed(0)}% confidence, ~${detected.estimatedRecordCount} records)`);
          break;
        case "recommended":
          secondary.push(`Extract ${detected.evidenceType} (${(detected.confidence * 100).toFixed(0)}% confidence)`);
          break;
        case "optional":
        case "low_confidence":
          manualReview.push(`Review ${detected.evidenceType} manually (${(detected.confidence * 100).toFixed(0)}% confidence)`);
          break;
      }
    }

    if (structure.estimatedComplexity === "complex") {
      manualReview.push("Complex document structure - consider splitting into multiple uploads");
    }

    return { primaryExtraction: primary, secondaryExtraction: secondary, manualReviewNeeded: manualReview };
  }

  protected calculateConfidence(output: DocumentAnalysisOutput): number {
    if (output.detectedEvidenceTypes.length === 0) return 0.3;
    return Math.max(...output.detectedEvidenceTypes.map(d => d.confidence));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze a document and automatically detect all evidence types
 */
export async function analyzeDocument(
  document: ParsedDocument,
  options?: {
    psurCaseId?: number;
    deviceCode?: string;
    periodStart?: string;
    periodEnd?: string;
  }
): Promise<DocumentAnalysisOutput> {
  const agent = new DocumentAnalyzerAgent();
  const result = await agent.run(
    {
      document,
      ...options,
    },
    {
      psurCaseId: options?.psurCaseId || 0,
      traceCtx: {
        traceId: `analyze-${Date.now()}`,
        psurCaseId: options?.psurCaseId || 0,
        currentSequence: 0,
        previousHash: null,
      },
      deviceCode: options?.deviceCode,
      periodStart: options?.periodStart,
      periodEnd: options?.periodEnd,
    }
  );

  if (!result.success || !result.data) {
    throw new Error(result.error || "Document analysis failed");
  }

  return result.data;
}

/**
 * Quick detection without full LLM analysis (rule-based only)
 */
export function quickDetectEvidenceTypes(document: ParsedDocument): string[] {
  const agent = new DocumentAnalyzerAgent();
  // Use private method via type assertion for quick detection
  const results = (agent as any).detectEvidenceTypesRuleBased(document);
  return results.map((r: DetectedEvidenceType) => r.evidenceType);
}
