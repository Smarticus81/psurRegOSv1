/**
 * SOTA Evidence Extractor
 * Uses Claude Sonnet 4.5 for intelligent semantic extraction with rule-based fallback
 * 
 * Architecture:
 * 1. LLM-powered schema inference (primary) - Uses Claude to understand column semantics
 * 2. Rule-based extraction (fallback) - Pattern matching when LLM unavailable
 * 3. Specialized CER extraction - Multi-evidence extraction from Clinical Evaluation Reports
 * 4. Granular decision tracing - Full audit trail for all extraction decisions
 */

import { ParsedDocument, ParsedTable, ParsedSection } from "./documentParser";
import { createHash, randomUUID } from "crypto";
import { complete, LLMRequest } from "../agents/llmService";
import { extractFromCER, CERExtractionResult, CERDecisionTrace } from "./cerExtractor";

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
// SOTA LLM-POWERED EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SOTA Schema Inference using Claude Sonnet 4.5
 * Analyzes column headers and sample data to determine semantic mappings
 */
async function llmInferSchema(
  headers: string[],
  sampleRows: Record<string, unknown>[],
  sourceType: string,
  targetEvidenceType: string
): Promise<{
  mappings: Array<{ sourceColumn: string; targetField: string; confidence: number; reasoning: string }>;
  evidenceType: string;
  overallConfidence: number;
} | null> {
  const canonicalFields = getCanonicalFieldsForType(targetEvidenceType);
  
  // Get sample values for each column (first 3 rows)
  const columnSamples: Record<string, unknown[]> = {};
  for (const header of headers) {
    columnSamples[header] = sampleRows.slice(0, 3).map(row => row[header]).filter(v => v !== undefined && v !== null && v !== "");
  }

  const prompt = `You are a medical device regulatory data expert. Analyze these spreadsheet columns and map them to canonical PSUR evidence fields.

## Source Type Selected by User: ${sourceType}
## Target Evidence Type: ${targetEvidenceType}

## Column Headers and Sample Values:
${headers.map(h => `- "${h}": ${JSON.stringify(columnSamples[h] || [])}`).join("\n")}

## Canonical Target Fields for ${targetEvidenceType}:
${canonicalFields.map(f => `- ${f.name}: ${f.description}`).join("\n")}

## Instructions:
1. For each source column, determine which canonical field it maps to based on:
   - Column name semantics (what does the name mean?)
   - Sample value patterns (dates, numbers, text, codes?)
   - Domain knowledge of medical device data
2. Consider common naming variations (e.g., "qty" = quantity, "prod_code" = deviceCode)
3. If a column doesn't map to any canonical field, set targetField to null
4. Be confident - medical device data follows predictable patterns

Respond ONLY with valid JSON:
{
  "mappings": [
    {
      "sourceColumn": "original column name",
      "targetField": "canonical_field_name or null",
      "confidence": 0.0-1.0,
      "reasoning": "Brief explanation of why this mapping makes sense"
    }
  ],
  "evidenceType": "${targetEvidenceType}",
  "overallConfidence": 0.0-1.0,
  "unmappedColumns": ["columns that couldn't be mapped"],
  "warnings": ["any data quality concerns"]
}`;

  try {
    console.log(`[SOTA Extract] Calling Claude for schema inference on ${headers.length} columns`);
    
    const response = await complete({
      messages: [
        { role: "system", content: "You are a medical device regulatory data expert. Always respond with valid JSON only." },
        { role: "user", content: prompt }
      ],
      config: {
        provider: "anthropic",
        model: "claude-sonnet-4-5-20250929", // SOTA reasoning model
        temperature: 0.1, // Low temperature for consistent mappings
        maxTokens: 2048,
      },
      responseFormat: "json",
      agentId: "sota-schema-inference",
      traceContext: { operation: "schema_inference" }
    });

    // Parse and validate response
    const content = response.content.trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[SOTA Extract] LLM response not valid JSON");
      return null;
    }
    
    const result = JSON.parse(jsonMatch[0]);
    console.log(`[SOTA Extract] Claude mapped ${result.mappings?.length || 0} columns with ${(result.overallConfidence * 100).toFixed(0)}% confidence`);
    
    return result;
  } catch (error: any) {
    console.warn(`[SOTA Extract] LLM inference failed: ${error?.message || error}`);
    return null;
  }
}

/**
 * Get canonical field definitions for evidence type
 */
function getCanonicalFieldsForType(evidenceType: string): Array<{ name: string; description: string }> {
  const fieldDefs: Record<string, Array<{ name: string; description: string }>> = {
    sales_volume: [
      { name: "deviceCode", description: "Product/device identifier (SKU, part number, model)" },
      { name: "region", description: "Geographic region or market" },
      { name: "country", description: "Country code or name" },
      { name: "quantity", description: "Number of units sold/shipped" },
      { name: "periodStart", description: "Start of reporting period (date)" },
      { name: "periodEnd", description: "End of reporting period (date)" },
      { name: "revenue", description: "Sales revenue amount" },
      { name: "distributionChannel", description: "Sales channel (direct, distributor, etc.)" },
    ],
    complaint_record: [
      { name: "complaintId", description: "Unique complaint identifier" },
      { name: "deviceCode", description: "Product/device identifier" },
      { name: "complaintDate", description: "Date complaint was received/reported" },
      { name: "description", description: "Complaint description or narrative" },
      { name: "severity", description: "Severity level (critical, high, medium, low)" },
      { name: "region", description: "Geographic region" },
      { name: "country", description: "Country of complaint origin" },
      { name: "rootCause", description: "Root cause determination" },
      { name: "correctiveAction", description: "Actions taken to address complaint" },
      { name: "patientOutcome", description: "Patient outcome (injury, death, no harm)" },
      { name: "serious", description: "Whether this is a serious complaint (boolean)" },
      { name: "status", description: "Current status (open, closed, investigating)" },
    ],
    fsca_record: [
      { name: "fscaId", description: "FSCA identifier or reference number" },
      { name: "deviceCode", description: "Affected product/device" },
      { name: "initiationDate", description: "Date FSCA was initiated" },
      { name: "description", description: "Description of field action" },
      { name: "actionType", description: "Type of action (recall, advisory, correction)" },
      { name: "affectedUnits", description: "Number of units affected" },
      { name: "status", description: "Current status" },
      { name: "region", description: "Geographic scope" },
    ],
    capa_record: [
      { name: "capaId", description: "CAPA identifier" },
      { name: "deviceCode", description: "Related product/device" },
      { name: "openDate", description: "Date CAPA was opened" },
      { name: "closeDate", description: "Date CAPA was closed" },
      { name: "description", description: "CAPA description" },
      { name: "rootCause", description: "Root cause analysis" },
      { name: "correctiveAction", description: "Corrective actions taken" },
      { name: "preventiveAction", description: "Preventive actions implemented" },
      { name: "status", description: "Current status" },
      { name: "effectiveness", description: "Effectiveness verification result" },
    ],
    pmcf_result: [
      { name: "studyId", description: "Study identifier" },
      { name: "studyType", description: "Type of PMCF activity" },
      { name: "startDate", description: "Study start date" },
      { name: "endDate", description: "Study end date" },
      { name: "sampleSize", description: "Number of subjects/devices" },
      { name: "findings", description: "Key findings" },
      { name: "conclusions", description: "Study conclusions" },
      { name: "status", description: "Study status" },
    ],
    device_registry_record: [
      { name: "deviceName", description: "Device trade name" },
      { name: "deviceCode", description: "Internal device code" },
      { name: "model", description: "Model number/name" },
      { name: "udiDi", description: "UDI Device Identifier" },
      { name: "riskClass", description: "Risk classification" },
      { name: "manufacturer", description: "Manufacturer name" },
      { name: "intendedPurpose", description: "Intended purpose/use" },
      { name: "gmdnCode", description: "GMDN code" },
    ],
    benefit_risk_assessment: [
      { name: "assessmentDate", description: "Date of assessment" },
      { name: "conclusion", description: "Overall B/R conclusion" },
      { name: "benefits", description: "Identified benefits" },
      { name: "risks", description: "Identified risks" },
      { name: "residualRisk", description: "Residual risk assessment" },
      { name: "acceptability", description: "Risk acceptability determination" },
    ],
  };
  
  return fieldDefs[evidenceType] || [];
}

/**
 * Apply LLM-inferred mappings to extract data from rows
 */
function applyLLMMappings(
  rows: Record<string, unknown>[],
  mappings: Array<{ sourceColumn: string; targetField: string; confidence: number; reasoning: string }>,
  evidenceType: string,
  tableName: string
): ExtractedEvidence[] {
  const evidence: ExtractedEvidence[] = [];
  
  // Build mapping lookup
  const mappingLookup = new Map<string, { targetField: string; confidence: number; reasoning: string }>();
  for (const m of mappings) {
    if (m.targetField) {
      mappingLookup.set(m.sourceColumn.toLowerCase(), { 
        targetField: m.targetField, 
        confidence: m.confidence,
        reasoning: m.reasoning 
      });
    }
  }
  
  // Extract each row using LLM mappings
  for (const row of rows) {
    const data: Record<string, unknown> = {};
    let totalConfidence = 0;
    let mappedFields = 0;
    
    for (const [sourceCol, value] of Object.entries(row)) {
      const mapping = mappingLookup.get(sourceCol.toLowerCase());
      if (mapping && value !== undefined && value !== null && value !== "") {
        data[mapping.targetField] = value;
        totalConfidence += mapping.confidence;
        mappedFields++;
      }
    }
    
    if (mappedFields > 0) {
      const avgConfidence = totalConfidence / mappedFields;
      evidence.push({
        evidenceType,
        confidence: avgConfidence,
        source: "table",
        sourceName: tableName,
        data,
        rawContent: JSON.stringify(row),
        extractionMethod: `SOTA Claude inference (${mappedFields} fields mapped)`,
        warnings: avgConfidence < 0.7 ? ["Some mappings have lower confidence - review recommended"] : [],
      });
    }
  }
  
  return evidence;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════════

export async function extractEvidence(
  document: ParsedDocument,
  sourceType?: string
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

  // PHASE 2: Standard table extraction (ONLY if CER extraction didn't run or failed)
  // Skip if CER extraction already succeeded - it handles all evidence types
  const cerExtracted = result.cerExtractionResult && result.extractedEvidence.length > 0;
  
  if (!cerExtracted) {
    console.log(`[Evidence Extractor] Running standard table extraction (CER not applicable or failed)`);
    for (const table of document.tables) {
      const tableTraceId = randomUUID();
      const tableStart = Date.now();
      
      const tableEvidence = await extractFromTableSOTA(table, document.filename, sourceType);
      result.extractedEvidence.push(...tableEvidence);
      
      decisionTrace.push({
        traceId: tableTraceId,
        timestamp: new Date().toISOString(),
        stage: "EVIDENCE_TYPE_DETECTION",
        decision: `Table "${table.name}": extracted ${tableEvidence.length} records`,
        confidence: tableEvidence.length > 0 ? Math.max(...tableEvidence.map(e => e.confidence)) : 0.3,
        inputSummary: `Table "${table.name}" with ${table.headers.length} columns, ${table.rows.length} rows`,
        outputSummary: tableEvidence.length > 0 
          ? `Evidence types: ${Array.from(new Set(tableEvidence.map(e => e.evidenceType))).join(", ")}`
          : "No evidence extracted from this table",
        reasoning: [
          `Headers: ${table.headers.slice(0, 5).join(", ")}${table.headers.length > 5 ? "..." : ""}`,
          `Extraction method: ${tableEvidence[0]?.extractionMethod || "none"}`,
          `Source type constraint: ${sourceType || "none"}`,
        ],
        durationMs: Date.now() - tableStart,
      });
    }
  } else {
    console.log(`[Evidence Extractor] Skipping standard table extraction - CER already extracted ${result.extractedEvidence.length} items`);
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

/**
 * SOTA Table Extraction - Uses Claude for semantic understanding, falls back to rules
 */
async function extractFromTableSOTA(
  table: ParsedTable, 
  filename: string, 
  sourceType?: string
): Promise<ExtractedEvidence[]> {
  const headers = table.headers;
  const rows = table.rows;
  
  if (headers.length === 0 || rows.length === 0) {
    return [];
  }
  
  // Determine target evidence type from source type
  const targetEvidenceType = sourceType 
    ? SOURCE_TYPE_PRIMARY_EVIDENCE[sourceType.toLowerCase()] || "sales_volume"
    : "sales_volume";
  
  // Try SOTA LLM extraction first
  try {
    const llmResult = await llmInferSchema(headers, rows, sourceType || "unknown", targetEvidenceType);
    
    if (llmResult && llmResult.mappings && llmResult.mappings.length > 0) {
      const validMappings = llmResult.mappings.filter(m => m.targetField);
      
      if (validMappings.length > 0) {
        console.log(`[SOTA Extract] Using Claude mappings for ${filename}: ${validMappings.length} fields`);
        return applyLLMMappings(rows, validMappings, llmResult.evidenceType, table.name);
      }
    }
  } catch (error: any) {
    console.warn(`[SOTA Extract] LLM extraction failed for ${filename}, using rule-based fallback: ${error?.message}`);
  }
  
  // Fallback to rule-based extraction
  console.log(`[SOTA Extract] Using rule-based fallback for ${filename}`);
  return extractFromTable(table, filename, sourceType);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

// Map source types to their primary evidence types - used for forced mapping
const SOURCE_TYPE_PRIMARY_EVIDENCE: Record<string, string> = {
  sales: "sales_volume",
  complaints: "complaint_record",
  fsca: "fsca_record",
  capa: "capa_record",
  pmcf: "pmcf_result",
  risk: "benefit_risk_assessment",
  cer: "cer_extract",
  admin: "device_registry_record",
};

function extractFromTable(table: ParsedTable, filename: string, sourceType?: string): ExtractedEvidence[] {
  const evidence: ExtractedEvidence[] = [];
  const headers = table.headers.map(h => h.toLowerCase());
  const headerText = headers.join(" ");

  // If source type is explicitly provided, force the primary evidence type for that source
  const forcedEvidenceType = sourceType ? SOURCE_TYPE_PRIMARY_EVIDENCE[sourceType.toLowerCase()] : null;

  // Score each evidence type against this table's headers
  const scores: { type: EvidenceType; score: number }[] = [];
  
  for (const evidenceType of EVIDENCE_TYPES) {
    let score = 0;
    
    // MASSIVE bonus if this evidence type matches the user-selected source type
    if (forcedEvidenceType && evidenceType.type === forcedEvidenceType) {
      score += 100; // Guarantees this type wins
    }
    
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
    // Adjust confidence - if forced, base it on header matching only (exclude the +100 bonus)
    const actualScore = forcedEvidenceType && bestMatch.type.type === forcedEvidenceType 
      ? bestMatch.score - 100 
      : bestMatch.score;
    const confidence = Math.min(1, Math.max(0.5, actualScore / 10)); // Minimum 0.5 when source type is explicit
    
    // Extract each row as a separate evidence record
    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i];
      
      // Map headers to normalized field names
      const data = mapFieldsToEvidence(row, bestMatch.type);
      
      const wasForcedBySource = forcedEvidenceType && bestMatch.type.type === forcedEvidenceType;
      evidence.push({
        evidenceType: bestMatch.type.type,
        confidence,
        source: "table",
        sourceName: table.name,
        data,
        rawContent: JSON.stringify(row),
        extractionMethod: wasForcedBySource 
          ? `Source type mapping (${sourceType} -> ${bestMatch.type.type})`
          : `Table header matching (score: ${bestMatch.score})`,
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
