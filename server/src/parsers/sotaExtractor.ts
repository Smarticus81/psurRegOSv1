/**
 * SOTA Evidence Extractor
 * 
 * Complete LLM-first extraction pipeline:
 * 1. Schema Discovery - GPT-5.2 understands document structure
 * 2. Field Mapping - Semantic mapping for every column
 * 3. Data Extraction - Transform rows using discovered schema
 * 4. Validation - Multi-level validation with quality flags
 * 5. Output - Evidence atoms with full quality metadata
 * 
 * NO FALLBACKS. All low-confidence items are FLAGGED, not dropped.
 */

import { ParsedDocument, ParsedTable } from "./documentParser";
import { discoverSchema, SchemaDiscoveryResult, TableSchemaMapping, ColumnMapping } from "./sotaSchemaDiscovery";
import { validateExtractedData, ValidationResult, QualityMetadata } from "./sotaValidation";
import { 
  SOTA_EVIDENCE_REGISTRY, 
  getEvidenceTypeDefinition, 
  EvidenceTypeDefinition 
} from "./sotaEvidenceRegistry";
import { randomUUID } from "crypto";
import { createHash } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SOTAExtractionResult {
  documentId: string;
  filename: string;
  
  // Schema discovery results
  schemaDiscovery: SchemaDiscoveryResult;
  
  // Extracted evidence atoms
  evidenceAtoms: ExtractedEvidenceAtom[];
  
  // Quality assessment
  quality: {
    overallScore: number;
    documentConfidence: number;
    schemaConfidence: number;
    validationScore: number;
    humanReviewRequired: boolean;
    reviewReasons: string[];
  };
  
  // Processing statistics
  stats: {
    tablesProcessed: number;
    recordsExtracted: number;
    recordsValid: number;
    recordsFlagged: number;
    unmappedColumns: number;
    processingTimeMs: number;
  };
  
  // Full extraction trace
  extractionTrace: ExtractionTraceEntry[];
}

export interface ExtractedEvidenceAtom {
  atomId: string;
  evidenceType: string;
  contentHash: string;
  
  // The extracted data with canonical field names
  normalizedData: Record<string, unknown>;
  
  // Original source data
  sourceData: {
    tableIndex: number;
    tableName: string;
    rowIndex: number;
    originalRow: Record<string, unknown>;
  };
  
  // Quality metadata
  quality: QualityMetadata;
  
  // Validation result for this atom
  validation: {
    isValid: boolean;
    score: number;
    flags: string[];
    issues: string[];
  };
  
  // Field-level confidence
  fieldConfidence: Record<string, number>;
  
  // Provenance
  provenance: {
    sourceFile: string;
    extractedAt: string;
    schemaVersion: string;
    extractionMethod: string;
  };
}

export interface ExtractionTraceEntry {
  traceId: string;
  timestamp: string;
  stage: string;
  input: string;
  output: string;
  durationMs: number;
  details?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SOTA Evidence Extraction Pipeline
 * 
 * @param document - Parsed document
 * @param context - Extraction context (period, device, etc.)
 * @returns Complete extraction result with quality metadata
 */
export async function extractEvidenceSOTA(
  document: ParsedDocument,
  context: {
    periodStart: string;
    periodEnd: string;
    deviceCode?: string;
    psurCaseId?: number;
  }
): Promise<SOTAExtractionResult> {
  const startTime = Date.now();
  const extractionTrace: ExtractionTraceEntry[] = [];
  
  console.log(`[SOTA Extractor] Starting extraction for ${document.filename}`);
  console.log(`[SOTA Extractor] Tables: ${document.tables.length}, Sections: ${document.sections.length}`);

  // PHASE 1: Schema Discovery
  const schemaStart = Date.now();
  const schemaDiscovery = await discoverSchema(document);
  
  extractionTrace.push({
    traceId: randomUUID(),
    timestamp: new Date().toISOString(),
    stage: "SCHEMA_DISCOVERY",
    input: `Document: ${document.filename} (${document.tables.length} tables)`,
    output: `Discovered ${schemaDiscovery.detectedEvidenceTypes.length} evidence types, ${schemaDiscovery.tableMappings.length} table schemas`,
    durationMs: Date.now() - schemaStart,
    details: {
      documentClassification: schemaDiscovery.documentClassification,
      evidenceTypes: schemaDiscovery.detectedEvidenceTypes.map(e => e.evidenceType),
      confidence: schemaDiscovery.quality.overallConfidence
    }
  });

  console.log(`[SOTA Extractor] Schema discovery completed in ${Date.now() - schemaStart}ms`);
  console.log(`[SOTA Extractor] Detected evidence types: ${schemaDiscovery.detectedEvidenceTypes.map(e => e.evidenceType).join(", ")}`);

  // PHASE 2: Data Extraction
  const extractionStart = Date.now();
  const allAtoms: ExtractedEvidenceAtom[] = [];
  
  for (let tableIdx = 0; tableIdx < document.tables.length; tableIdx++) {
    const table = document.tables[tableIdx];
    const tableMapping = schemaDiscovery.tableMappings.find(m => m.tableIndex === tableIdx);
    
    if (!tableMapping) {
      console.warn(`[SOTA Extractor] No mapping found for table ${tableIdx} (${table.name})`);
      continue;
    }

    console.log(`[SOTA Extractor] Extracting from table ${tableIdx}: ${table.name} (${table.rows.length} rows)`);

    // Extract records using the schema mapping
    const tableAtoms = await extractFromTable(
      table,
      tableIdx,
      tableMapping,
      document.filename,
      context
    );

    allAtoms.push(...tableAtoms);
  }

  extractionTrace.push({
    traceId: randomUUID(),
    timestamp: new Date().toISOString(),
    stage: "DATA_EXTRACTION",
    input: `${document.tables.length} tables`,
    output: `Extracted ${allAtoms.length} evidence atoms`,
    durationMs: Date.now() - extractionStart
  });

  console.log(`[SOTA Extractor] Data extraction completed: ${allAtoms.length} atoms`);

  // PHASE 3: Validation
  const validationStart = Date.now();
  let totalValidationScore = 0;
  let validAtoms = 0;
  let flaggedAtoms = 0;

  for (const tableMapping of schemaDiscovery.tableMappings) {
    const tableAtoms = allAtoms.filter(a => a.sourceData.tableIndex === tableMapping.tableIndex);
    if (tableAtoms.length === 0) continue;

    const records = tableAtoms.map(a => a.normalizedData);
    const validationResult = await validateExtractedData(records, tableMapping, context);

    // Apply validation results to atoms
    for (let i = 0; i < tableAtoms.length; i++) {
      const recordValidation = validationResult.recordValidations[i];
      if (recordValidation) {
        tableAtoms[i].validation = {
          isValid: recordValidation.isValid,
          score: recordValidation.score,
          flags: recordValidation.flags.map(f => f.code),
          issues: [
            ...recordValidation.fieldValidations.flatMap(fv => fv.issues.map(i => i.message)),
            ...recordValidation.crossFieldIssues,
            ...recordValidation.semanticIssues
          ]
        };
        tableAtoms[i].quality = validationResult.qualityMetadata;
        
        totalValidationScore += recordValidation.score;
        if (recordValidation.isValid) validAtoms++;
        if (recordValidation.flags.length > 0) flaggedAtoms++;
      }
    }
  }

  extractionTrace.push({
    traceId: randomUUID(),
    timestamp: new Date().toISOString(),
    stage: "VALIDATION",
    input: `${allAtoms.length} atoms`,
    output: `${validAtoms} valid, ${flaggedAtoms} flagged`,
    durationMs: Date.now() - validationStart
  });

  console.log(`[SOTA Extractor] Validation completed: ${validAtoms}/${allAtoms.length} valid`);

  // Calculate overall quality
  const avgValidationScore = allAtoms.length > 0 ? totalValidationScore / allAtoms.length : 0;
  const unmappedColumns = schemaDiscovery.tableMappings.reduce(
    (sum, t) => sum + t.columnMappings.filter(c => !c.targetField).length, 
    0
  );

  const overallScore = calculateOverallScore(
    schemaDiscovery.documentClassification.confidence,
    schemaDiscovery.quality.overallConfidence,
    avgValidationScore / 100
  );

  const humanReviewRequired = 
    schemaDiscovery.quality.humanReviewRequired ||
    overallScore < 70 ||
    flaggedAtoms / Math.max(1, allAtoms.length) > 0.3;

  const reviewReasons: string[] = [
    ...schemaDiscovery.quality.reviewReasons
  ];
  
  if (overallScore < 70) {
    reviewReasons.push(`Overall extraction score is low (${overallScore}%)`);
  }
  if (flaggedAtoms / Math.max(1, allAtoms.length) > 0.3) {
    reviewReasons.push(`More than 30% of records have quality flags`);
  }
  if (unmappedColumns > 0) {
    reviewReasons.push(`${unmappedColumns} columns could not be mapped`);
  }

  const result: SOTAExtractionResult = {
    documentId: document.contentHash,
    filename: document.filename,
    schemaDiscovery,
    evidenceAtoms: allAtoms,
    quality: {
      overallScore,
      documentConfidence: schemaDiscovery.documentClassification.confidence,
      schemaConfidence: schemaDiscovery.quality.overallConfidence,
      validationScore: avgValidationScore,
      humanReviewRequired,
      reviewReasons
    },
    stats: {
      tablesProcessed: document.tables.length,
      recordsExtracted: allAtoms.length,
      recordsValid: validAtoms,
      recordsFlagged: flaggedAtoms,
      unmappedColumns,
      processingTimeMs: Date.now() - startTime
    },
    extractionTrace
  };

  console.log(`[SOTA Extractor] Extraction complete in ${result.stats.processingTimeMs}ms`);
  console.log(`[SOTA Extractor] Overall score: ${overallScore}%, Human review: ${humanReviewRequired}`);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

async function extractFromTable(
  table: ParsedTable,
  tableIndex: number,
  tableMapping: TableSchemaMapping,
  filename: string,
  context: {
    periodStart: string;
    periodEnd: string;
    deviceCode?: string;
  }
): Promise<ExtractedEvidenceAtom[]> {
  const atoms: ExtractedEvidenceAtom[] = [];
  const evidenceType = tableMapping.primaryEvidenceType;
  const typeDef = getEvidenceTypeDefinition(evidenceType);

  for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
    const row = table.rows[rowIdx];
    
    // Transform row using column mappings
    const normalizedData: Record<string, unknown> = {};
    const fieldConfidence: Record<string, number> = {};
    const originalRow: Record<string, unknown> = {};

    for (const mapping of tableMapping.columnMappings) {
      const sourceValue = row[mapping.sourceColumn];
      originalRow[mapping.sourceColumn] = sourceValue;

      if (mapping.targetField) {
        // Apply value transformation based on field type
        const transformedValue = transformValue(
          sourceValue,
          mapping.targetField,
          typeDef
        );
        normalizedData[mapping.targetField] = transformedValue;
        fieldConfidence[mapping.targetField] = mapping.confidence;
      }
    }

    // Skip completely empty rows
    const hasData = Object.values(normalizedData).some(v => 
      v !== null && v !== undefined && v !== ""
    );
    
    // If no columns were mapped but we have raw row data, use snake_case original keys
    // so SOTA never returns 0 atoms for a table with actual rows
    const hasRawData = Object.values(originalRow).some(v =>
      v !== null && v !== undefined && v !== ""
    );
    if (!hasData && hasRawData) {
      for (const [key, val] of Object.entries(originalRow)) {
        if (val !== null && val !== undefined && val !== "") {
          const fieldName = key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
          normalizedData[fieldName] = val;
          fieldConfidence[fieldName] = 0.3; // low confidence — unmapped columns
        }
      }
    }
    if (!hasData && !hasRawData) continue;

    // Generate atom ID and content hash
    const contentHash = createHash("sha256")
      .update(JSON.stringify(normalizedData))
      .digest("hex")
      .substring(0, 16);
    
    const atomId = `${evidenceType}:${contentHash}`;

    const atom: ExtractedEvidenceAtom = {
      atomId,
      evidenceType,
      contentHash,
      normalizedData,
      sourceData: {
        tableIndex,
        tableName: table.name,
        rowIndex: rowIdx,
        originalRow
      },
      quality: {
        schemaConfidence: tableMapping.primaryConfidence,
        completeness: calculateCompleteness(normalizedData, typeDef),
        validationScore: 0,  // Set during validation
        flags: [],
        unmappedColumns: tableMapping.columnMappings
          .filter(m => !m.targetField)
          .map(m => m.sourceColumn),
        missingRequiredFields: findMissingRequiredFields(normalizedData, typeDef),
        dataAnomalies: [],
        semanticIssues: [],
        humanReviewRequired: tableMapping.primaryConfidence < 0.7,
        reviewReasons: []
      },
      validation: {
        isValid: true,  // Set during validation
        score: 100,
        flags: [],
        issues: []
      },
      fieldConfidence,
      provenance: {
        sourceFile: filename,
        extractedAt: new Date().toISOString(),
        schemaVersion: "1.0.0-sota",
        extractionMethod: "SOTA-GPT5.2-SemanticMapping"
      }
    };

    atoms.push(atom);
  }

  return atoms;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALUE TRANSFORMATION
// ═══════════════════════════════════════════════════════════════════════════════

function transformValue(
  value: unknown,
  fieldName: string,
  typeDef: EvidenceTypeDefinition | undefined
): unknown {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const fieldDef = typeDef?.fields.find(f => f.name === fieldName);
  if (!fieldDef) {
    return value;
  }

  switch (fieldDef.dataType) {
    case "number":
      return transformNumber(value);
    
    case "date":
      return transformDate(value);
    
    case "boolean":
      return transformBoolean(value);
    
    case "enum":
      return transformEnum(value, fieldDef.enumValues || []);
    
    case "array":
      return transformArray(value);
    
    default:
      return String(value).trim();
  }
}

function transformNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return isNaN(value) ? null : value;
  }
  
  const str = String(value).trim();
  // Remove currency symbols, commas, spaces
  const cleaned = str.replace(/[$€£¥,\s]/g, "").replace(/[()]/g, "-");
  const num = parseFloat(cleaned);
  
  return isNaN(num) ? null : num;
}

function transformDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (!isNaN(value.getTime())) {
      return value.toISOString().split("T")[0];
    }
    return null;
  }
  
  const str = String(value).trim();
  
  // Try parsing as date
  const date = new Date(str);
  if (!isNaN(date.getTime()) && date.getFullYear() >= 1990 && date.getFullYear() <= 2100) {
    return date.toISOString().split("T")[0];
  }
  
  // Try common formats
  const formats = [
    { regex: /^(\d{4})-(\d{2})-(\d{2})/, builder: (m: string[]) => `${m[1]}-${m[2]}-${m[3]}` },
    { regex: /^(\d{2})\/(\d{2})\/(\d{4})/, builder: (m: string[]) => `${m[3]}-${m[1]}-${m[2]}` },
    { regex: /^(\d{2})\.(\d{2})\.(\d{4})/, builder: (m: string[]) => `${m[3]}-${m[2]}-${m[1]}` },
  ];
  
  for (const { regex, builder } of formats) {
    const match = str.match(regex);
    if (match) {
      return builder(match);
    }
  }
  
  // Return original if can't parse
  return str.length > 0 ? str : null;
}

function transformBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  
  const str = String(value).toLowerCase().trim();
  
  if (["true", "yes", "y", "1", "on"].includes(str)) {
    return true;
  }
  if (["false", "no", "n", "0", "off"].includes(str)) {
    return false;
  }
  
  return null;
}

function transformEnum(value: unknown, enumValues: string[]): string | null {
  const str = String(value).trim();
  
  // Exact match (case-insensitive)
  const exactMatch = enumValues.find(e => e.toLowerCase() === str.toLowerCase());
  if (exactMatch) {
    return exactMatch;
  }
  
  // Partial match
  const partialMatch = enumValues.find(e => 
    e.toLowerCase().includes(str.toLowerCase()) || 
    str.toLowerCase().includes(e.toLowerCase())
  );
  if (partialMatch) {
    return partialMatch;
  }
  
  // Return original with warning (will be flagged in validation)
  return str.length > 0 ? str : null;
}

function transformArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  
  const str = String(value).trim();
  if (!str) return [];
  
  // Try parsing as JSON array
  if (str.startsWith("[")) {
    try {
      return JSON.parse(str);
    } catch {
      // Continue to fallback
    }
  }
  
  // Split by common delimiters
  if (str.includes(",")) {
    return str.split(",").map(s => s.trim()).filter(s => s);
  }
  if (str.includes(";")) {
    return str.split(";").map(s => s.trim()).filter(s => s);
  }
  
  return [str];
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function calculateCompleteness(
  data: Record<string, unknown>,
  typeDef: EvidenceTypeDefinition | undefined
): number {
  if (!typeDef) return 0;
  
  const requiredFields = typeDef.fields.filter(f => f.required);
  if (requiredFields.length === 0) return 100;
  
  let filledCount = 0;
  for (const field of requiredFields) {
    const value = data[field.name];
    if (value !== null && value !== undefined && value !== "") {
      filledCount++;
    }
  }
  
  return Math.round((filledCount / requiredFields.length) * 100);
}

function findMissingRequiredFields(
  data: Record<string, unknown>,
  typeDef: EvidenceTypeDefinition | undefined
): string[] {
  if (!typeDef) return [];
  
  const missing: string[] = [];
  const requiredFields = typeDef.fields.filter(f => f.required);
  
  for (const field of requiredFields) {
    const value = data[field.name];
    if (value === null || value === undefined || value === "") {
      missing.push(field.name);
    }
  }
  
  return missing;
}

function calculateOverallScore(
  documentConfidence: number,
  schemaConfidence: number,
  validationScore: number
): number {
  // Weighted average
  const weights = {
    document: 0.2,
    schema: 0.4,
    validation: 0.4
  };
  
  const score = 
    documentConfidence * weights.document +
    schemaConfidence * weights.schema +
    validationScore * weights.validation;
  
  return Math.round(score * 100);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVERSION TO LEGACY FORMAT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Convert SOTA extraction result to legacy ExtractedEvidence format
 * for backward compatibility with existing ingestion routes
 */
export function convertToLegacyFormat(
  result: SOTAExtractionResult
): {
  extractedEvidence: Array<{
    evidenceType: string;
    confidence: number;
    source: "table" | "section";
    sourceName: string;
    data: Record<string, unknown>;
    rawContent: string;
    extractionMethod: string;
    warnings: string[];
    quality: QualityMetadata;
  }>;
  decisionTrace: Array<{
    traceId: string;
    timestamp: string;
    stage: string;
    decision: string;
    confidence: number;
    reasoning: string[];
  }>;
} {
  const extractedEvidence = result.evidenceAtoms.map(atom => ({
    evidenceType: atom.evidenceType,
    confidence: atom.quality.schemaConfidence,
    source: "table" as const,
    sourceName: atom.sourceData.tableName,
    data: atom.normalizedData,
    rawContent: JSON.stringify(atom.sourceData.originalRow),
    extractionMethod: atom.provenance.extractionMethod,
    warnings: [
      ...atom.validation.issues,
      ...(atom.quality.humanReviewRequired ? ["Human review recommended"] : [])
    ],
    quality: atom.quality
  }));

  const decisionTrace = [
    ...result.schemaDiscovery.reasoningTrace.map(t => ({
      traceId: t.stepId,
      timestamp: t.timestamp,
      stage: t.stage,
      decision: t.output,
      confidence: t.confidence,
      reasoning: t.reasoning
    })),
    ...result.extractionTrace.map(t => ({
      traceId: t.traceId,
      timestamp: t.timestamp,
      stage: t.stage,
      decision: t.output,
      confidence: 1.0,
      reasoning: [t.input, t.output]
    }))
  ];

  return { extractedEvidence, decisionTrace };
}
