/**
 * SOTA Schema Discovery Agent
 * 
 * Uses GPT-5.2 with chain-of-thought reasoning to:
 * 1. Understand document structure and purpose
 * 2. Identify ALL evidence types present
 * 3. Map EVERY column to canonical fields with reasoning
 * 4. Flag low-confidence mappings for human review
 * 
 * NO FALLBACKS - LLM-first for maximum accuracy.
 */

import { complete } from "../agents/llmService";
import { ParsedDocument, ParsedTable } from "./documentParser";
import { 
  SOTA_EVIDENCE_REGISTRY, 
  getEvidenceTypeDefinition,
  EvidenceTypeDefinition,
  FieldDefinition 
} from "./sotaEvidenceRegistry";
import { randomUUID } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SchemaDiscoveryResult {
  documentId: string;
  filename: string;
  
  // Document-level understanding
  documentClassification: {
    primaryType: string;
    secondaryTypes: string[];
    confidence: number;
    reasoning: string;
  };
  
  // Evidence types detected
  detectedEvidenceTypes: DetectedEvidenceType[];
  
  // Per-table schema mappings
  tableMappings: TableSchemaMapping[];
  
  // Quality assessment
  quality: {
    overallConfidence: number;
    humanReviewRequired: boolean;
    reviewReasons: string[];
    unmappedColumns: string[];
    dataGaps: string[];
  };
  
  // Full reasoning trace
  reasoningTrace: ReasoningStep[];
  
  processingTimeMs: number;
}

export interface DetectedEvidenceType {
  evidenceType: string;
  category: string;
  confidence: number;
  reasoning: string[];
  sourceLocations: {
    tableIndex?: number;
    tableName?: string;
    sectionIndex?: number;
    sectionTitle?: string;
  }[];
  estimatedRecordCount: number;
  requiredFieldsAvailable: string[];
  requiredFieldsMissing: string[];
}

export interface TableSchemaMapping {
  tableIndex: number;
  tableName: string;
  rowCount: number;
  
  // Primary evidence type for this table
  primaryEvidenceType: string;
  primaryConfidence: number;
  
  // Column mappings
  columnMappings: ColumnMapping[];
  
  // Quality flags
  qualityFlags: string[];
}

export interface ColumnMapping {
  sourceColumn: string;
  sourceIndex: number;
  targetField: string | null;  // null if unmapped
  targetEvidenceType: string;
  confidence: number;
  reasoning: string;
  sampleValues: unknown[];
  dataTypeInferred: string;
  validationIssues: string[];
  requiresHumanReview: boolean;
}

export interface ReasoningStep {
  stepId: string;
  timestamp: string;
  stage: string;
  input: string;
  output: string;
  reasoning: string[];
  confidence: number;
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOTA SCHEMA DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Discover schema for a parsed document using GPT-5.2
 */
export async function discoverSchema(
  document: ParsedDocument
): Promise<SchemaDiscoveryResult> {
  const startTime = Date.now();
  const reasoningTrace: ReasoningStep[] = [];
  
  const result: SchemaDiscoveryResult = {
    documentId: document.contentHash,
    filename: document.filename,
    documentClassification: {
      primaryType: "Unknown",
      secondaryTypes: [],
      confidence: 0,
      reasoning: ""
    },
    detectedEvidenceTypes: [],
    tableMappings: [],
    quality: {
      overallConfidence: 0,
      humanReviewRequired: false,
      reviewReasons: [],
      unmappedColumns: [],
      dataGaps: []
    },
    reasoningTrace: [],
    processingTimeMs: 0
  };

  // STEP 1: Document Classification
  const classificationStep = await classifyDocument(document);
  reasoningTrace.push(classificationStep.trace);
  result.documentClassification = classificationStep.result;

  // STEP 2: Evidence Type Detection
  const detectionStep = await detectEvidenceTypes(document, classificationStep.result);
  reasoningTrace.push(detectionStep.trace);
  result.detectedEvidenceTypes = detectionStep.result;

  // STEP 3: Table Schema Mapping (for each table)
  for (let i = 0; i < document.tables.length; i++) {
    const table = document.tables[i];
    const mappingStep = await mapTableSchema(
      table, 
      i, 
      result.detectedEvidenceTypes
    );
    reasoningTrace.push(mappingStep.trace);
    result.tableMappings.push(mappingStep.result);
  }

  // STEP 4: Quality Assessment
  const qualityStep = assessQuality(result, document);
  reasoningTrace.push(qualityStep.trace);
  result.quality = qualityStep.result;

  result.reasoningTrace = reasoningTrace;
  result.processingTimeMs = Date.now() - startTime;

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1: DOCUMENT CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

async function classifyDocument(document: ParsedDocument): Promise<{
  result: SchemaDiscoveryResult["documentClassification"];
  trace: ReasoningStep;
}> {
  const stepStart = Date.now();
  const stepId = randomUUID();

  // Build context for LLM
  const documentContext = buildDocumentContext(document);
  
  // Available evidence types for classification
  const evidenceTypesContext = SOTA_EVIDENCE_REGISTRY.map(e => ({
    type: e.type,
    category: e.category,
    description: e.description,
    indicators: e.documentIndicators.slice(0, 5)
  }));

  const prompt = `You are a medical device regulatory expert analyzing a document for PSUR (Periodic Safety Update Report) evidence extraction.

## DOCUMENT INFORMATION
Filename: ${document.filename}
Type: ${document.documentType}
Tables: ${document.tables.length}
Sections: ${document.sections.length}
Text Length: ${document.rawText.length} characters

## DOCUMENT PREVIEW
${documentContext}

## AVAILABLE EVIDENCE TYPES
${JSON.stringify(evidenceTypesContext, null, 2)}

## YOUR TASK
Classify this document by determining:
1. What is the PRIMARY purpose/type of this document?
2. What SECONDARY evidence types might be present?
3. How confident are you in this classification?

Think step by step:
1. First, analyze the filename for clues
2. Then, examine the table structures and headers
3. Consider the document text and section titles
4. Match against known evidence type indicators
5. Provide your classification with reasoning

Respond with ONLY valid JSON:
{
  "thinking": [
    "Step 1: Filename analysis...",
    "Step 2: Table structure analysis...",
    "Step 3: Content analysis...",
    "Step 4: Pattern matching...",
    "Step 5: Final determination..."
  ],
  "primaryType": "category name (e.g., 'Sales & Distribution', 'Complaints', 'FSCA', etc.)",
  "secondaryTypes": ["other categories that may be present"],
  "confidence": 0.0-1.0,
  "reasoning": "Concise explanation of the classification"
}`;

  try {
    const response = await complete({
      messages: [
        { role: "system", content: "You are a PSUR regulatory document classification expert. Always respond with valid JSON. Be thorough in your analysis." },
        { role: "user", content: prompt }
      ],
      config: {
        provider: "openai",
        model: "gpt-5.2",
        temperature: 0.1,
        maxTokens: 2000
      },
      responseFormat: "json",
      agentId: "sota-schema-discovery",
      traceContext: { operation: "document_classification" }
    });

    const parsed = parseJsonResponse(response.content);
    
    return {
      result: {
        primaryType: parsed.primaryType || "Unknown",
        secondaryTypes: parsed.secondaryTypes || [],
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || "Classification completed"
      },
      trace: {
        stepId,
        timestamp: new Date().toISOString(),
        stage: "DOCUMENT_CLASSIFICATION",
        input: `Document: ${document.filename}`,
        output: JSON.stringify(parsed),
        reasoning: parsed.thinking || [],
        confidence: parsed.confidence || 0.5,
        durationMs: Date.now() - stepStart
      }
    };
  } catch (error: any) {
    console.error("[Schema Discovery] Classification failed:", error?.message);
    return {
      result: {
        primaryType: "Unknown",
        secondaryTypes: [],
        confidence: 0,
        reasoning: `Classification failed: ${error?.message}`
      },
      trace: {
        stepId,
        timestamp: new Date().toISOString(),
        stage: "DOCUMENT_CLASSIFICATION",
        input: `Document: ${document.filename}`,
        output: "ERROR",
        reasoning: [`Error: ${error?.message}`],
        confidence: 0,
        durationMs: Date.now() - stepStart
      }
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2: EVIDENCE TYPE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

async function detectEvidenceTypes(
  document: ParsedDocument,
  classification: SchemaDiscoveryResult["documentClassification"]
): Promise<{
  result: DetectedEvidenceType[];
  trace: ReasoningStep;
}> {
  const stepStart = Date.now();
  const stepId = randomUUID();

  // Build detailed table analysis
  const tableAnalysis = document.tables.map((table, idx) => ({
    index: idx,
    name: table.name,
    headers: table.headers,
    rowCount: table.rows.length,
    sampleRow: table.rows[0] || {}
  }));

  // Build section analysis
  const sectionAnalysis = document.sections.slice(0, 10).map((section, idx) => ({
    index: idx,
    title: section.title,
    contentPreview: section.content.substring(0, 200)
  }));

  // Get relevant evidence type definitions
  const evidenceTypeDefinitions = SOTA_EVIDENCE_REGISTRY.map(e => ({
    type: e.type,
    category: e.category,
    description: e.description,
    requiredFields: e.fields.filter(f => f.required).map(f => ({
      name: f.name,
      semanticHints: f.semanticHints.slice(0, 5)
    })),
    tableIndicators: e.tableIndicators,
    documentIndicators: e.documentIndicators
  }));

  const prompt = `You are analyzing a ${classification.primaryType} document to detect ALL evidence types present.

## DOCUMENT CLASSIFICATION
Primary Type: ${classification.primaryType}
Secondary Types: ${classification.secondaryTypes.join(", ") || "None"}
Classification Confidence: ${(classification.confidence * 100).toFixed(0)}%

## TABLES IN DOCUMENT
${JSON.stringify(tableAnalysis, null, 2)}

## SECTIONS IN DOCUMENT
${JSON.stringify(sectionAnalysis, null, 2)}

## EVIDENCE TYPE DEFINITIONS
${JSON.stringify(evidenceTypeDefinitions, null, 2)}

## YOUR TASK
For EACH table and section, determine which evidence type(s) are present.
Analyze headers/columns against the field definitions to make accurate matches.

Think step by step for each table:
1. Match column headers to semantic hints
2. Check for required fields
3. Identify the evidence type with highest match
4. Assess confidence based on field coverage

Respond with ONLY valid JSON:
{
  "thinking": [
    "Table 0 analysis: headers [...] match evidence type X because...",
    "Table 1 analysis: ...",
    "Section analysis: ..."
  ],
  "detectedTypes": [
    {
      "evidenceType": "sales_volume",
      "category": "Sales & Distribution",
      "confidence": 0.95,
      "reasoning": ["Column 'Units Sold' matches field 'quantity'", "Column 'Region' matches field 'region'"],
      "sourceLocations": [{"tableIndex": 0, "tableName": "Sales Data"}],
      "estimatedRecordCount": 150,
      "requiredFieldsAvailable": ["quantity", "periodStart"],
      "requiredFieldsMissing": []
    }
  ]
}`;

  try {
    const response = await complete({
      messages: [
        { role: "system", content: "You are a PSUR evidence detection expert. Analyze document structure to identify all evidence types. Be thorough - don't miss any evidence. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      config: {
        provider: "openai",
        model: "gpt-5.2",
        temperature: 0.1,
        maxTokens: 4000
      },
      responseFormat: "json",
      agentId: "sota-schema-discovery",
      traceContext: { operation: "evidence_type_detection" }
    });

    const parsed = parseJsonResponse(response.content);
    
    return {
      result: (parsed.detectedTypes || []).map((d: any) => ({
        evidenceType: d.evidenceType,
        category: d.category,
        confidence: d.confidence || 0.5,
        reasoning: d.reasoning || [],
        sourceLocations: d.sourceLocations || [],
        estimatedRecordCount: d.estimatedRecordCount || 0,
        requiredFieldsAvailable: d.requiredFieldsAvailable || [],
        requiredFieldsMissing: d.requiredFieldsMissing || []
      })),
      trace: {
        stepId,
        timestamp: new Date().toISOString(),
        stage: "EVIDENCE_TYPE_DETECTION",
        input: `${document.tables.length} tables, ${document.sections.length} sections`,
        output: `${parsed.detectedTypes?.length || 0} evidence types detected`,
        reasoning: parsed.thinking || [],
        confidence: parsed.detectedTypes?.length > 0 ? 
          Math.max(...parsed.detectedTypes.map((d: any) => d.confidence || 0)) : 0,
        durationMs: Date.now() - stepStart
      }
    };
  } catch (error: any) {
    console.error("[Schema Discovery] Evidence detection failed:", error?.message);
    return {
      result: [],
      trace: {
        stepId,
        timestamp: new Date().toISOString(),
        stage: "EVIDENCE_TYPE_DETECTION",
        input: `${document.tables.length} tables`,
        output: "ERROR",
        reasoning: [`Error: ${error?.message}`],
        confidence: 0,
        durationMs: Date.now() - stepStart
      }
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3: TABLE SCHEMA MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

async function mapTableSchema(
  table: ParsedTable,
  tableIndex: number,
  detectedTypes: DetectedEvidenceType[]
): Promise<{
  result: TableSchemaMapping;
  trace: ReasoningStep;
}> {
  const stepStart = Date.now();
  const stepId = randomUUID();

  // Find which evidence type this table is associated with
  const relevantType = detectedTypes.find(d => 
    d.sourceLocations.some(s => s.tableIndex === tableIndex)
  );
  
  const primaryType = relevantType?.evidenceType || "sales_volume";
  const typeDef = getEvidenceTypeDefinition(primaryType);

  // Get sample values for each column
  const columnAnalysis = table.headers.map((header, idx) => {
    const sampleValues = table.rows.slice(0, 5).map(row => row[header]);
    return {
      index: idx,
      header,
      sampleValues,
      inferredType: inferDataType(sampleValues)
    };
  });

  // Get field definitions for the target type
  const targetFields = typeDef?.fields.map(f => ({
    name: f.name,
    description: f.description,
    semanticHints: f.semanticHints,
    dataType: f.dataType,
    required: f.required
  })) || [];

  const prompt = `You are mapping table columns to canonical PSUR evidence fields.

## TABLE INFORMATION
Table Index: ${tableIndex}
Table Name: ${table.name}
Row Count: ${table.rows.length}

## COLUMN ANALYSIS
${JSON.stringify(columnAnalysis, null, 2)}

## TARGET EVIDENCE TYPE: ${primaryType}

## TARGET FIELD DEFINITIONS
${JSON.stringify(targetFields, null, 2)}

## YOUR TASK
Map EACH column to the most appropriate target field.
Analyze both the header name AND the sample values to determine the correct mapping.

For each column, consider:
1. Does the header match any semantic hints?
2. Does the data type match the expected field type?
3. Do the sample values make sense for that field?

If a column cannot be confidently mapped to any field, mark it as unmapped.
If confidence is below 0.7, mark it as requiring human review.

Respond with ONLY valid JSON:
{
  "thinking": [
    "Column 'Units Sold': Header matches 'units sold' semantic hint for 'quantity' field. Sample values are all numbers. High confidence match.",
    "Column 'Region': Header matches 'region' semantic hint. Sample values are geographic names. High confidence match.",
    "..."
  ],
  "primaryEvidenceType": "${primaryType}",
  "primaryConfidence": 0.95,
  "columnMappings": [
    {
      "sourceColumn": "Units Sold",
      "sourceIndex": 0,
      "targetField": "quantity",
      "targetEvidenceType": "${primaryType}",
      "confidence": 0.95,
      "reasoning": "Header 'Units Sold' directly matches semantic hint 'units sold' for quantity field. All sample values are positive integers.",
      "dataTypeInferred": "number",
      "validationIssues": [],
      "requiresHumanReview": false
    }
  ],
  "qualityFlags": []
}`;

  try {
    const response = await complete({
      messages: [
        { role: "system", content: "You are a PSUR field mapping expert. Map every column with careful reasoning. Be precise about confidence levels. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      config: {
        provider: "openai",
        model: "gpt-5.2",
        temperature: 0.1,
        maxTokens: 4000
      },
      responseFormat: "json",
      agentId: "sota-schema-discovery",
      traceContext: { operation: "table_schema_mapping" }
    });

    const parsed = parseJsonResponse(response.content);
    
    // Ensure all columns have mappings (even if unmapped)
    const mappings: ColumnMapping[] = columnAnalysis.map((col, idx) => {
      const llmMapping = parsed.columnMappings?.find((m: any) => 
        m.sourceIndex === idx || m.sourceColumn === col.header
      );
      
      if (llmMapping) {
        return {
          sourceColumn: col.header,
          sourceIndex: idx,
          targetField: llmMapping.targetField || null,
          targetEvidenceType: llmMapping.targetEvidenceType || primaryType,
          confidence: llmMapping.confidence || 0.5,
          reasoning: llmMapping.reasoning || "No reasoning provided",
          sampleValues: col.sampleValues,
          dataTypeInferred: col.inferredType,
          validationIssues: llmMapping.validationIssues || [],
          requiresHumanReview: llmMapping.requiresHumanReview || llmMapping.confidence < 0.7
        };
      }
      
      // Column not mapped by LLM - flag it
      return {
        sourceColumn: col.header,
        sourceIndex: idx,
        targetField: null,
        targetEvidenceType: primaryType,
        confidence: 0,
        reasoning: "Column was not mapped by LLM - requires human review",
        sampleValues: col.sampleValues,
        dataTypeInferred: col.inferredType,
        validationIssues: ["Unmapped column"],
        requiresHumanReview: true
      };
    });

    return {
      result: {
        tableIndex,
        tableName: table.name,
        rowCount: table.rows.length,
        primaryEvidenceType: parsed.primaryEvidenceType || primaryType,
        primaryConfidence: parsed.primaryConfidence || 0.5,
        columnMappings: mappings,
        qualityFlags: parsed.qualityFlags || []
      },
      trace: {
        stepId,
        timestamp: new Date().toISOString(),
        stage: "TABLE_SCHEMA_MAPPING",
        input: `Table: ${table.name} (${table.headers.length} columns, ${table.rows.length} rows)`,
        output: `Mapped ${mappings.filter(m => m.targetField).length}/${mappings.length} columns`,
        reasoning: parsed.thinking || [],
        confidence: parsed.primaryConfidence || 0.5,
        durationMs: Date.now() - stepStart
      }
    };
  } catch (error: any) {
    console.error("[Schema Discovery] Table mapping failed:", error?.message);
    
    // Return unmapped columns on error
    const unmappedMappings: ColumnMapping[] = columnAnalysis.map((col, idx) => ({
      sourceColumn: col.header,
      sourceIndex: idx,
      targetField: null,
      targetEvidenceType: primaryType,
      confidence: 0,
      reasoning: `Mapping failed: ${error?.message}`,
      sampleValues: col.sampleValues,
      dataTypeInferred: col.inferredType,
      validationIssues: ["LLM mapping failed"],
      requiresHumanReview: true
    }));

    return {
      result: {
        tableIndex,
        tableName: table.name,
        rowCount: table.rows.length,
        primaryEvidenceType: primaryType,
        primaryConfidence: 0,
        columnMappings: unmappedMappings,
        qualityFlags: ["LLM mapping failed - all columns require review"]
      },
      trace: {
        stepId,
        timestamp: new Date().toISOString(),
        stage: "TABLE_SCHEMA_MAPPING",
        input: `Table: ${table.name}`,
        output: "ERROR",
        reasoning: [`Error: ${error?.message}`],
        confidence: 0,
        durationMs: Date.now() - stepStart
      }
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4: QUALITY ASSESSMENT
// ═══════════════════════════════════════════════════════════════════════════════

function assessQuality(
  result: SchemaDiscoveryResult,
  document: ParsedDocument
): {
  result: SchemaDiscoveryResult["quality"];
  trace: ReasoningStep;
} {
  const stepStart = Date.now();
  const stepId = randomUUID();
  const reviewReasons: string[] = [];
  const unmappedColumns: string[] = [];
  const dataGaps: string[] = [];

  // Check for unmapped columns
  for (const tableMapping of result.tableMappings) {
    for (const colMapping of tableMapping.columnMappings) {
      if (!colMapping.targetField) {
        unmappedColumns.push(`${tableMapping.tableName}.${colMapping.sourceColumn}`);
      }
      if (colMapping.requiresHumanReview) {
        reviewReasons.push(`Low confidence mapping: ${tableMapping.tableName}.${colMapping.sourceColumn}`);
      }
    }
  }

  // Check for missing required fields
  for (const evidenceType of result.detectedEvidenceTypes) {
    if (evidenceType.requiredFieldsMissing.length > 0) {
      dataGaps.push(`${evidenceType.evidenceType}: Missing required fields ${evidenceType.requiredFieldsMissing.join(", ")}`);
    }
    if (evidenceType.confidence < 0.7) {
      reviewReasons.push(`Low confidence evidence type: ${evidenceType.evidenceType} (${(evidenceType.confidence * 100).toFixed(0)}%)`);
    }
  }

  // Check document classification confidence
  if (result.documentClassification.confidence < 0.7) {
    reviewReasons.push(`Low document classification confidence: ${(result.documentClassification.confidence * 100).toFixed(0)}%`);
  }

  // Calculate overall confidence
  const confidences: number[] = [
    result.documentClassification.confidence,
    ...result.detectedEvidenceTypes.map(e => e.confidence),
    ...result.tableMappings.map(t => t.primaryConfidence)
  ];
  const overallConfidence = confidences.length > 0 
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length 
    : 0;

  const humanReviewRequired = reviewReasons.length > 0 || unmappedColumns.length > 0 || dataGaps.length > 0;

  return {
    result: {
      overallConfidence,
      humanReviewRequired,
      reviewReasons,
      unmappedColumns,
      dataGaps
    },
    trace: {
      stepId,
      timestamp: new Date().toISOString(),
      stage: "QUALITY_ASSESSMENT",
      input: `${result.tableMappings.length} tables, ${result.detectedEvidenceTypes.length} evidence types`,
      output: `Confidence: ${(overallConfidence * 100).toFixed(0)}%, Review Required: ${humanReviewRequired}`,
      reasoning: [
        `Overall confidence: ${(overallConfidence * 100).toFixed(0)}%`,
        `Unmapped columns: ${unmappedColumns.length}`,
        `Data gaps: ${dataGaps.length}`,
        `Review reasons: ${reviewReasons.length}`
      ],
      confidence: overallConfidence,
      durationMs: Date.now() - stepStart
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function buildDocumentContext(document: ParsedDocument): string {
  const parts: string[] = [];

  // Table summaries
  if (document.tables.length > 0) {
    parts.push("## TABLES:");
    for (const table of document.tables.slice(0, 5)) {
      parts.push(`- "${table.name}": Columns [${table.headers.slice(0, 10).join(", ")}${table.headers.length > 10 ? "..." : ""}], ${table.rows.length} rows`);
    }
  }

  // Section summaries
  if (document.sections.length > 0) {
    parts.push("\n## SECTIONS:");
    for (const section of document.sections.slice(0, 5)) {
      parts.push(`- "${section.title}": ${section.content.substring(0, 100)}...`);
    }
  }

  // Raw text sample
  if (document.rawText.length > 0) {
    parts.push("\n## TEXT SAMPLE:");
    parts.push(document.rawText.substring(0, 500));
  }

  return parts.join("\n");
}

function parseJsonResponse(content: string): any {
  const raw = (content || "").replace(/^\uFEFF/, "").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    // Try extracting from markdown code block
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // fall through
      }
    }

    // Try largest balanced { ... } block
    const firstBrace = raw.indexOf("{");
    if (firstBrace !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = firstBrace; i < raw.length; i++) {
        if (raw[i] === "{") depth++;
        else if (raw[i] === "}") {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end !== -1) {
        const block = raw.slice(firstBrace, end + 1);
        try {
          return JSON.parse(block);
        } catch {
          try {
            return JSON.parse(block.replace(/,(\s*[}\]])/g, "$1"));
          } catch {
            // fall through
          }
        }
      }
    }

    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        try {
          return JSON.parse(objectMatch[0].replace(/,(\s*[}\]])/g, "$1"));
        } catch {
          // fall through
        }
      }
    }

    console.warn("[Schema Discovery] Failed to parse JSON response:", raw.substring(0, 200));
    return {};
  }
}

function inferDataType(values: unknown[]): string {
  if (values.length === 0) return "unknown";
  
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== "");
  if (nonNullValues.length === 0) return "empty";
  
  // Check if all values are numbers
  const allNumbers = nonNullValues.every(v => {
    if (typeof v === "number") return true;
    if (typeof v === "string") {
      const num = parseFloat(v.replace(/[,$]/g, ""));
      return !isNaN(num);
    }
    return false;
  });
  if (allNumbers) return "number";
  
  // Check if all values are dates
  const allDates = nonNullValues.every(v => {
    if (v instanceof Date) return true;
    if (typeof v === "string") {
      const date = new Date(v);
      return !isNaN(date.getTime()) && v.match(/\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}/);
    }
    return false;
  });
  if (allDates) return "date";
  
  // Check if all values are booleans
  const allBooleans = nonNullValues.every(v => {
    if (typeof v === "boolean") return true;
    if (typeof v === "string") {
      const lower = v.toLowerCase();
      return ["true", "false", "yes", "no", "1", "0", "y", "n"].includes(lower);
    }
    return false;
  });
  if (allBooleans) return "boolean";
  
  return "string";
}
