/**
 * SOTA Validation Pipeline
 * 
 * Multi-level validation for extracted evidence data:
 * 1. Schema validation - required fields, data types
 * 2. Range validation - dates in period, quantities positive
 * 3. Semantic validation - LLM verifies data makes sense
 * 4. Cross-field validation - consistency between related fields
 * 
 * All issues are FLAGGED, never silently dropped.
 */

import { complete } from "../agents/llmService";
import { 
  getEvidenceTypeDefinition, 
  FieldDefinition,
  EvidenceTypeDefinition 
} from "./sotaEvidenceRegistry";
import { ColumnMapping, TableSchemaMapping } from "./sotaSchemaDiscovery";
import { randomUUID } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ValidationResult {
  isValid: boolean;
  overallScore: number;  // 0-100
  
  // Per-record validation
  recordValidations: RecordValidation[];
  
  // Summary statistics
  summary: {
    totalRecords: number;
    validRecords: number;
    recordsWithWarnings: number;
    recordsWithErrors: number;
    criticalIssues: string[];
    warnings: string[];
  };
  
  // Quality metadata to attach to atoms
  qualityMetadata: QualityMetadata;
  
  validationTrace: ValidationTrace[];
}

export interface RecordValidation {
  recordIndex: number;
  isValid: boolean;
  score: number;  // 0-100
  
  fieldValidations: FieldValidation[];
  crossFieldIssues: string[];
  semanticIssues: string[];
  
  flags: ValidationFlag[];
}

export interface FieldValidation {
  fieldName: string;
  sourceColumn: string;
  value: unknown;
  
  isValid: boolean;
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  type: "error" | "warning" | "info";
  code: string;
  message: string;
  suggestion?: string;
}

export interface ValidationFlag {
  code: string;
  severity: "critical" | "error" | "warning" | "info";
  message: string;
  affectedFields: string[];
}

export interface QualityMetadata {
  schemaConfidence: number;
  completeness: number;
  validationScore: number;
  flags: string[];
  unmappedColumns: string[];
  missingRequiredFields: string[];
  dataAnomalies: string[];
  semanticIssues: string[];
  humanReviewRequired: boolean;
  reviewReasons: string[];
}

export interface ValidationTrace {
  traceId: string;
  timestamp: string;
  stage: string;
  recordsProcessed: number;
  issuesFound: number;
  durationMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

export async function validateExtractedData(
  records: Record<string, unknown>[],
  tableMapping: TableSchemaMapping,
  context: {
    periodStart: string;
    periodEnd: string;
    deviceCode?: string;
  }
): Promise<ValidationResult> {
  const validationTrace: ValidationTrace[] = [];
  const recordValidations: RecordValidation[] = [];
  
  const evidenceType = tableMapping.primaryEvidenceType;
  const typeDef = getEvidenceTypeDefinition(evidenceType);
  
  // STEP 1: Schema Validation
  const schemaStart = Date.now();
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const recordValidation = validateRecord(
      record, 
      i, 
      tableMapping.columnMappings,
      typeDef,
      context
    );
    recordValidations.push(recordValidation);
  }
  validationTrace.push({
    traceId: randomUUID(),
    timestamp: new Date().toISOString(),
    stage: "SCHEMA_VALIDATION",
    recordsProcessed: records.length,
    issuesFound: recordValidations.filter(r => !r.isValid).length,
    durationMs: Date.now() - schemaStart
  });

  // STEP 2: Semantic Validation (LLM-powered)
  const semanticStart = Date.now();
  const semanticResults = await performSemanticValidation(
    records,
    recordValidations,
    evidenceType,
    context
  );
  
  // Merge semantic issues into record validations
  for (let i = 0; i < recordValidations.length; i++) {
    if (semanticResults.recordIssues[i]) {
      recordValidations[i].semanticIssues = semanticResults.recordIssues[i];
      if (semanticResults.recordIssues[i].length > 0) {
        recordValidations[i].flags.push({
          code: "SEMANTIC_ISSUE",
          severity: "warning",
          message: semanticResults.recordIssues[i].join("; "),
          affectedFields: []
        });
      }
    }
  }
  
  validationTrace.push({
    traceId: randomUUID(),
    timestamp: new Date().toISOString(),
    stage: "SEMANTIC_VALIDATION",
    recordsProcessed: records.length,
    issuesFound: Object.values(semanticResults.recordIssues).filter(issues => issues.length > 0).length,
    durationMs: Date.now() - semanticStart
  });

  // STEP 3: Cross-field Validation
  const crossFieldStart = Date.now();
  for (let i = 0; i < recordValidations.length; i++) {
    const crossFieldIssues = validateCrossFields(records[i], evidenceType, context);
    recordValidations[i].crossFieldIssues = crossFieldIssues;
    if (crossFieldIssues.length > 0) {
      recordValidations[i].flags.push({
        code: "CROSS_FIELD_INCONSISTENCY",
        severity: "warning",
        message: crossFieldIssues.join("; "),
        affectedFields: []
      });
    }
  }
  
  validationTrace.push({
    traceId: randomUUID(),
    timestamp: new Date().toISOString(),
    stage: "CROSS_FIELD_VALIDATION",
    recordsProcessed: records.length,
    issuesFound: recordValidations.filter(r => r.crossFieldIssues.length > 0).length,
    durationMs: Date.now() - crossFieldStart
  });

  // Calculate final scores
  for (const rv of recordValidations) {
    rv.score = calculateRecordScore(rv);
    rv.isValid = rv.score >= 60 && !rv.flags.some(f => f.severity === "critical");
  }

  // Build summary
  const summary = buildSummary(recordValidations, tableMapping);
  
  // Build quality metadata
  const qualityMetadata = buildQualityMetadata(
    recordValidations, 
    tableMapping, 
    semanticResults.globalIssues
  );

  const validRecords = recordValidations.filter(r => r.isValid).length;
  const overallScore = records.length > 0 
    ? Math.round((validRecords / records.length) * 100)
    : 0;

  return {
    isValid: overallScore >= 70 && !summary.criticalIssues.length,
    overallScore,
    recordValidations,
    summary,
    qualityMetadata,
    validationTrace
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECORD VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

function validateRecord(
  record: Record<string, unknown>,
  recordIndex: number,
  columnMappings: ColumnMapping[],
  typeDef: EvidenceTypeDefinition | undefined,
  context: { periodStart: string; periodEnd: string }
): RecordValidation {
  const fieldValidations: FieldValidation[] = [];
  const flags: ValidationFlag[] = [];

  // Check each mapped field
  for (const mapping of columnMappings) {
    if (!mapping.targetField) {
      // Unmapped column - flag it
      flags.push({
        code: "UNMAPPED_COLUMN",
        severity: "info",
        message: `Column '${mapping.sourceColumn}' was not mapped to any field`,
        affectedFields: [mapping.sourceColumn]
      });
      continue;
    }

    const value = record[mapping.targetField];
    const fieldDef = typeDef?.fields.find(f => f.name === mapping.targetField);
    
    const fieldValidation = validateField(
      mapping.targetField,
      mapping.sourceColumn,
      value,
      fieldDef,
      context
    );
    
    fieldValidations.push(fieldValidation);
    
    // Add flags for field issues
    for (const issue of fieldValidation.issues) {
      if (issue.type === "error") {
        flags.push({
          code: issue.code,
          severity: "error",
          message: issue.message,
          affectedFields: [mapping.targetField]
        });
      } else if (issue.type === "warning") {
        flags.push({
          code: issue.code,
          severity: "warning",
          message: issue.message,
          affectedFields: [mapping.targetField]
        });
      }
    }
  }

  // Check for missing required fields
  if (typeDef) {
    const requiredFields = typeDef.fields.filter(f => f.required);
    for (const reqField of requiredFields) {
      const hasValue = record[reqField.name] !== undefined && 
                       record[reqField.name] !== null && 
                       record[reqField.name] !== "";
      
      if (!hasValue) {
        flags.push({
          code: "MISSING_REQUIRED_FIELD",
          severity: "error",
          message: `Required field '${reqField.name}' is missing or empty`,
          affectedFields: [reqField.name]
        });
      }
    }
  }

  return {
    recordIndex,
    isValid: !flags.some(f => f.severity === "critical" || f.severity === "error"),
    score: 0,  // Calculated later
    fieldValidations,
    crossFieldIssues: [],
    semanticIssues: [],
    flags
  };
}

function validateField(
  fieldName: string,
  sourceColumn: string,
  value: unknown,
  fieldDef: FieldDefinition | undefined,
  context: { periodStart: string; periodEnd: string }
): FieldValidation {
  const issues: ValidationIssue[] = [];

  // Empty value check
  if (value === undefined || value === null || value === "") {
    if (fieldDef?.required) {
      issues.push({
        type: "error",
        code: "EMPTY_REQUIRED",
        message: `Required field '${fieldName}' is empty`,
        suggestion: "Provide a value for this required field"
      });
    }
    return { fieldName, sourceColumn, value, isValid: !fieldDef?.required, issues };
  }

  // Type validation
  if (fieldDef) {
    switch (fieldDef.dataType) {
      case "number":
        const numValue = typeof value === "number" ? value : parseFloat(String(value).replace(/[,$]/g, ""));
        if (isNaN(numValue)) {
          issues.push({
            type: "error",
            code: "INVALID_NUMBER",
            message: `Field '${fieldName}' expected a number but got '${value}'`,
            suggestion: "Ensure the value is a valid number"
          });
        } else {
          // Range validation
          if (fieldDef.validation?.minValue !== undefined && numValue < fieldDef.validation.minValue) {
            issues.push({
              type: "warning",
              code: "BELOW_MIN_VALUE",
              message: `Field '${fieldName}' value ${numValue} is below minimum ${fieldDef.validation.minValue}`,
              suggestion: "Verify this value is correct"
            });
          }
          if (fieldDef.validation?.maxValue !== undefined && numValue > fieldDef.validation.maxValue) {
            issues.push({
              type: "warning",
              code: "ABOVE_MAX_VALUE",
              message: `Field '${fieldName}' value ${numValue} exceeds maximum ${fieldDef.validation.maxValue}`,
              suggestion: "Verify this value is correct"
            });
          }
          // Negative quantity check
          if ((fieldName === "quantity" || fieldName.includes("count") || fieldName.includes("units")) && numValue < 0) {
            issues.push({
              type: "warning",
              code: "NEGATIVE_QUANTITY",
              message: `Quantity field '${fieldName}' has negative value ${numValue}`,
              suggestion: "Verify if this represents a return or correction"
            });
          }
        }
        break;

      case "date":
        const dateValue = parseDate(value);
        if (!dateValue) {
          issues.push({
            type: "error",
            code: "INVALID_DATE",
            message: `Field '${fieldName}' expected a date but got '${value}'`,
            suggestion: "Use format YYYY-MM-DD or similar"
          });
        } else {
          // Date range validation
          const periodStartDate = new Date(context.periodStart);
          const periodEndDate = new Date(context.periodEnd);
          
          if (dateValue < new Date("1990-01-01")) {
            issues.push({
              type: "warning",
              code: "DATE_TOO_OLD",
              message: `Date '${formatDate(dateValue)}' seems too old`,
              suggestion: "Verify this is the correct date"
            });
          }
          if (dateValue > new Date()) {
            issues.push({
              type: "warning",
              code: "FUTURE_DATE",
              message: `Date '${formatDate(dateValue)}' is in the future`,
              suggestion: "Verify this is the correct date"
            });
          }
          // Check if within reporting period (allow some buffer)
          const bufferDays = 90;
          const bufferedStart = new Date(periodStartDate.getTime() - bufferDays * 24 * 60 * 60 * 1000);
          const bufferedEnd = new Date(periodEndDate.getTime() + bufferDays * 24 * 60 * 60 * 1000);
          if (dateValue < bufferedStart || dateValue > bufferedEnd) {
            issues.push({
              type: "info",
              code: "DATE_OUTSIDE_PERIOD",
              message: `Date '${formatDate(dateValue)}' is outside the reporting period (${context.periodStart} to ${context.periodEnd})`,
              suggestion: "Verify this record belongs to this reporting period"
            });
          }
        }
        break;

      case "enum":
        if (fieldDef.enumValues && !fieldDef.enumValues.some(
          ev => ev.toLowerCase() === String(value).toLowerCase()
        )) {
          issues.push({
            type: "warning",
            code: "INVALID_ENUM_VALUE",
            message: `Field '${fieldName}' value '${value}' is not in expected values: ${fieldDef.enumValues.join(", ")}`,
            suggestion: "Use one of the expected values"
          });
        }
        break;

      case "string":
        if (fieldDef.validation?.minLength && String(value).length < fieldDef.validation.minLength) {
          issues.push({
            type: "warning",
            code: "STRING_TOO_SHORT",
            message: `Field '${fieldName}' value is shorter than minimum ${fieldDef.validation.minLength} characters`,
            suggestion: "Provide more detail"
          });
        }
        if (fieldDef.validation?.maxLength && String(value).length > fieldDef.validation.maxLength) {
          issues.push({
            type: "warning",
            code: "STRING_TOO_LONG",
            message: `Field '${fieldName}' value exceeds maximum ${fieldDef.validation.maxLength} characters`,
            suggestion: "Truncate or summarize the content"
          });
        }
        if (fieldDef.validation?.pattern) {
          const regex = new RegExp(fieldDef.validation.pattern);
          if (!regex.test(String(value))) {
            issues.push({
              type: "warning",
              code: "PATTERN_MISMATCH",
              message: `Field '${fieldName}' value '${value}' does not match expected pattern`,
              suggestion: "Verify the format is correct"
            });
          }
        }
        break;
    }
  }

  return {
    fieldName,
    sourceColumn,
    value,
    isValid: !issues.some(i => i.type === "error"),
    issues
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEMANTIC VALIDATION (LLM-Powered)
// ═══════════════════════════════════════════════════════════════════════════════

async function performSemanticValidation(
  records: Record<string, unknown>[],
  recordValidations: RecordValidation[],
  evidenceType: string,
  context: { periodStart: string; periodEnd: string; deviceCode?: string }
): Promise<{
  recordIssues: Record<number, string[]>;
  globalIssues: string[];
}> {
  // For large datasets, sample records for semantic validation
  const sampleSize = Math.min(records.length, 20);
  const sampleIndices = selectSampleIndices(records.length, sampleSize);
  const sampleRecords = sampleIndices.map(i => ({ index: i, data: records[i] }));

  const prompt = `You are a medical device regulatory data expert validating ${evidenceType} evidence for PSUR.

## CONTEXT
Evidence Type: ${evidenceType}
Reporting Period: ${context.periodStart} to ${context.periodEnd}
Device Code: ${context.deviceCode || "Not specified"}

## SAMPLE RECORDS TO VALIDATE
${JSON.stringify(sampleRecords, null, 2)}

## YOUR TASK
Analyze each record for SEMANTIC issues - things that are technically valid data but don't make sense in context:

1. Does the data logically make sense for this evidence type?
2. Are there any suspicious patterns (duplicate data, placeholder values, test data)?
3. Are quantities and dates reasonable?
4. Are descriptions meaningful or are they generic/templated?
5. Is there anything that suggests data quality issues?

Respond with ONLY valid JSON:
{
  "thinking": [
    "Record 0: Analyzing sales data...",
    "Record 1: Checking for anomalies..."
  ],
  "recordIssues": {
    "0": ["Issue found: Description appears to be a template placeholder"],
    "5": ["Suspiciously round number for quantity - may be estimated"]
  },
  "globalIssues": [
    "Several records have identical descriptions - possible copy/paste error",
    "No complaints have root cause assigned - may indicate incomplete investigation"
  ]
}`;

  try {
    const response = await complete({
      messages: [
        { role: "system", content: "You are a PSUR data quality expert. Identify semantic issues that automated validation would miss. Be thorough but avoid false positives. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      config: {
        provider: "openai",
        model: "gpt-5.2",
        temperature: 0.2,
        maxTokens: 3000
      },
      responseFormat: "json",
      agentId: "sota-validation",
      traceContext: { operation: "semantic_validation" }
    });

    const parsed = parseJsonResponse(response.content);
    
    // Map sample indices back to original indices
    const recordIssues: Record<number, string[]> = {};
    if (parsed.recordIssues) {
      for (const [sampleIdx, issues] of Object.entries(parsed.recordIssues)) {
        const originalIdx = sampleIndices[parseInt(sampleIdx)];
        if (originalIdx !== undefined) {
          recordIssues[originalIdx] = issues as string[];
        }
      }
    }

    return {
      recordIssues,
      globalIssues: parsed.globalIssues || []
    };
  } catch (error: any) {
    console.error("[Validation] Semantic validation failed:", error?.message);
    return {
      recordIssues: {},
      globalIssues: [`Semantic validation failed: ${error?.message}`]
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-FIELD VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

function validateCrossFields(
  record: Record<string, unknown>,
  evidenceType: string,
  context: { periodStart: string; periodEnd: string }
): string[] {
  const issues: string[] = [];

  // Sales-specific validations
  if (evidenceType === "sales_volume") {
    // If region is "Global", country should be empty or "All"
    if (record.region?.toString().toLowerCase() === "global" && 
        record.country && 
        record.country.toString().toLowerCase() !== "all") {
      issues.push("Region is 'Global' but country is specified - may be inconsistent");
    }
    
    // Period end should be after period start
    const start = parseDate(record.periodStart);
    const end = parseDate(record.periodEnd);
    if (start && end && start > end) {
      issues.push("Period start is after period end");
    }
  }

  // Complaint-specific validations
  if (evidenceType === "complaint_record") {
    // If severity is Critical/High, patient outcome should be present
    const severity = record.severity?.toString().toLowerCase();
    if ((severity === "critical" || severity === "high") && !record.patientOutcome) {
      issues.push("High severity complaint without patient outcome documented");
    }
    
    // If isSerious is true, should have supporting details
    if (record.isSerious === true && !record.description) {
      issues.push("Serious complaint marked but no description provided");
    }
  }

  // Incident-specific validations
  if (evidenceType === "serious_incident_record") {
    // Must have patient outcome
    if (!record.patientOutcome) {
      issues.push("Serious incident without patient outcome - required for vigilance");
    }
    
    // Should have IMDRF code for categorization
    if (!record.imdrfCode) {
      issues.push("Serious incident without IMDRF code - may affect categorization");
    }
  }

  // FSCA-specific validations
  if (evidenceType === "fsca_record") {
    // Should have affected units or scope
    if (!record.affectedUnits && !record.affectedRegions) {
      issues.push("FSCA without affected units or regions specified");
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function calculateRecordScore(rv: RecordValidation): number {
  let score = 100;

  // Deduct for flags based on severity
  for (const flag of rv.flags) {
    switch (flag.severity) {
      case "critical":
        score -= 50;
        break;
      case "error":
        score -= 20;
        break;
      case "warning":
        score -= 5;
        break;
      case "info":
        score -= 1;
        break;
    }
  }

  // Deduct for semantic issues
  score -= rv.semanticIssues.length * 10;

  // Deduct for cross-field issues
  score -= rv.crossFieldIssues.length * 5;

  return Math.max(0, Math.min(100, score));
}

function buildSummary(
  recordValidations: RecordValidation[],
  tableMapping: TableSchemaMapping
): ValidationResult["summary"] {
  const criticalIssues: string[] = [];
  const warnings: string[] = [];

  // Collect unique issues
  const issueCounts = new Map<string, number>();
  
  for (const rv of recordValidations) {
    for (const flag of rv.flags) {
      const key = `${flag.code}: ${flag.message}`;
      issueCounts.set(key, (issueCounts.get(key) || 0) + 1);
      
      if (flag.severity === "critical") {
        if (!criticalIssues.includes(flag.message)) {
          criticalIssues.push(flag.message);
        }
      }
    }
  }

  // Report issues that affect significant portion of records
  const significantThreshold = Math.max(1, Math.round(recordValidations.length * 0.1));
  for (const [issue, count] of issueCounts.entries()) {
    if (count >= significantThreshold) {
      warnings.push(`${issue} (affects ${count} records)`);
    }
  }

  // Check for unmapped columns
  const unmappedColumns = tableMapping.columnMappings.filter(m => !m.targetField);
  if (unmappedColumns.length > 0) {
    warnings.push(`${unmappedColumns.length} columns could not be mapped: ${unmappedColumns.map(m => m.sourceColumn).join(", ")}`);
  }

  return {
    totalRecords: recordValidations.length,
    validRecords: recordValidations.filter(r => r.isValid).length,
    recordsWithWarnings: recordValidations.filter(r => r.flags.some(f => f.severity === "warning")).length,
    recordsWithErrors: recordValidations.filter(r => r.flags.some(f => f.severity === "error" || f.severity === "critical")).length,
    criticalIssues,
    warnings
  };
}

function buildQualityMetadata(
  recordValidations: RecordValidation[],
  tableMapping: TableSchemaMapping,
  globalSemanticIssues: string[]
): QualityMetadata {
  const unmappedColumns = tableMapping.columnMappings
    .filter(m => !m.targetField)
    .map(m => m.sourceColumn);
  
  const missingRequiredFields = new Set<string>();
  const dataAnomalies = new Set<string>();
  const semanticIssues = new Set<string>();
  const reviewReasons: string[] = [];

  for (const rv of recordValidations) {
    for (const flag of rv.flags) {
      if (flag.code === "MISSING_REQUIRED_FIELD") {
        missingRequiredFields.add(flag.message);
      } else if (flag.code.includes("NEGATIVE") || flag.code.includes("FUTURE") || flag.code.includes("TOO_")) {
        dataAnomalies.add(flag.message);
      }
    }
    for (const issue of rv.semanticIssues) {
      semanticIssues.add(issue);
    }
  }

  // Add global semantic issues
  for (const issue of globalSemanticIssues) {
    semanticIssues.add(issue);
  }

  // Determine if human review is required
  const humanReviewRequired = 
    unmappedColumns.length > 0 ||
    missingRequiredFields.size > 0 ||
    tableMapping.primaryConfidence < 0.7 ||
    recordValidations.some(r => r.flags.some(f => f.severity === "critical"));

  if (unmappedColumns.length > 0) {
    reviewReasons.push(`${unmappedColumns.length} columns could not be automatically mapped`);
  }
  if (missingRequiredFields.size > 0) {
    reviewReasons.push(`Required fields are missing: ${Array.from(missingRequiredFields).join(", ")}`);
  }
  if (tableMapping.primaryConfidence < 0.7) {
    reviewReasons.push(`Low confidence in schema mapping (${(tableMapping.primaryConfidence * 100).toFixed(0)}%)`);
  }
  if (semanticIssues.size > 0) {
    reviewReasons.push(`${semanticIssues.size} semantic issues detected`);
  }

  // Calculate completeness
  const totalFields = tableMapping.columnMappings.length;
  const mappedFields = tableMapping.columnMappings.filter(m => m.targetField).length;
  const completeness = totalFields > 0 ? (mappedFields / totalFields) * 100 : 0;

  // Calculate validation score
  const validRecords = recordValidations.filter(r => r.isValid).length;
  const validationScore = recordValidations.length > 0 
    ? (validRecords / recordValidations.length) * 100 
    : 0;

  // Collect all flags
  const allFlags = new Set<string>();
  for (const rv of recordValidations) {
    for (const flag of rv.flags) {
      allFlags.add(flag.code);
    }
  }

  return {
    schemaConfidence: tableMapping.primaryConfidence,
    completeness,
    validationScore,
    flags: Array.from(allFlags),
    unmappedColumns,
    missingRequiredFields: Array.from(missingRequiredFields),
    dataAnomalies: Array.from(dataAnomalies),
    semanticIssues: Array.from(semanticIssues),
    humanReviewRequired,
    reviewReasons
  };
}

function selectSampleIndices(total: number, sampleSize: number): number[] {
  if (total <= sampleSize) {
    return Array.from({ length: total }, (_, i) => i);
  }
  
  // Select evenly distributed samples plus some random ones
  const indices = new Set<number>();
  
  // First, always include first and last
  indices.add(0);
  indices.add(total - 1);
  
  // Add evenly distributed samples
  const step = Math.floor(total / (sampleSize - 2));
  for (let i = step; i < total - 1; i += step) {
    indices.add(i);
    if (indices.size >= sampleSize) break;
  }
  
  // Fill remaining with random if needed
  while (indices.size < sampleSize) {
    indices.add(Math.floor(Math.random() * total));
  }
  
  return Array.from(indices).sort((a, b) => a - b);
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  
  const str = String(value).trim();
  const date = new Date(str);
  
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  // Try common date formats
  const formats = [
    /(\d{4})-(\d{2})-(\d{2})/,  // YYYY-MM-DD
    /(\d{2})\/(\d{2})\/(\d{4})/,  // MM/DD/YYYY or DD/MM/YYYY
    /(\d{2})\.(\d{2})\.(\d{4})/,  // DD.MM.YYYY
  ];
  
  for (const format of formats) {
    const match = str.match(format);
    if (match) {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  
  return null;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function parseJsonResponse(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return {};
      }
    }
    return {};
  }
}
