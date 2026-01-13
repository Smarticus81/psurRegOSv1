/**
 * Source Mapping Configuration
 * Defines how input sources map to evidence types
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

export const SourceTypeSchema = z.enum([
  "sales",
  "complaints", 
  "fsca",
  "capa",
  "pmcf",
  "literature",
  "external_db",
  "risk",
  "cer",
  "device",
  "regulatory",
  "pms",
  "other"
]);

export const FileFormatSchema = z.enum([
  "excel",
  "json",
  "docx",
  "pdf",
  "csv"
]);

export const FieldMappingSchema = z.object({
  sourceField: z.string(),
  targetField: z.string(),
  transformation: z.enum(["direct", "uppercase", "lowercase", "date", "number", "boolean"]).optional(),
  defaultValue: z.unknown().optional(),
});

export const EvidenceTypeMappingSchema = z.object({
  evidenceType: z.string(),
  enabled: z.boolean().default(true),
  confidence: z.number().min(0).max(1).default(0.8),
  fieldMappings: z.array(FieldMappingSchema),
  validationRules: z.array(z.string()).optional(),
});

export const SourceConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  sourceType: SourceTypeSchema,
  acceptedFormats: z.array(FileFormatSchema),
  primaryEvidenceTypes: z.array(z.string()),
  secondaryEvidenceTypes: z.array(z.string()).optional(),
  evidenceTypeMappings: z.array(EvidenceTypeMappingSchema),
  autoExtract: z.boolean().default(true),
  requiresReview: z.boolean().default(false),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type SourceType = z.infer<typeof SourceTypeSchema>;
export type FileFormat = z.infer<typeof FileFormatSchema>;
export type FieldMapping = z.infer<typeof FieldMappingSchema>;
export type EvidenceTypeMapping = z.infer<typeof EvidenceTypeMappingSchema>;
export type SourceConfig = z.infer<typeof SourceConfigSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT SOURCE CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const DEFAULT_SOURCE_CONFIGS: SourceConfig[] = [
  {
    id: "source_sales",
    name: "Sales Data",
    description: "Sales volume, distribution, and market data",
    sourceType: "sales",
    acceptedFormats: ["excel", "json", "csv"],
    primaryEvidenceTypes: ["sales_summary", "sales_by_region", "distribution_summary"],
    secondaryEvidenceTypes: ["usage_estimate"],
    evidenceTypeMappings: [
      {
        evidenceType: "sales_by_region",
        enabled: true,
        confidence: 0.9,
        fieldMappings: [
          { sourceField: "region", targetField: "region", transformation: "direct" },
          { sourceField: "country", targetField: "country", transformation: "direct" },
          { sourceField: "quantity", targetField: "quantity", transformation: "number" },
          { sourceField: "units", targetField: "quantity", transformation: "number" },
          { sourceField: "sold", targetField: "quantity", transformation: "number" },
          { sourceField: "period_start", targetField: "period_start", transformation: "date" },
          { sourceField: "period_end", targetField: "period_end", transformation: "date" },
          { sourceField: "market_share", targetField: "market_share", transformation: "number" },
        ],
      },
      {
        evidenceType: "sales_summary",
        enabled: true,
        confidence: 0.85,
        fieldMappings: [
          { sourceField: "total", targetField: "total_units", transformation: "number" },
          { sourceField: "total_units", targetField: "total_units", transformation: "number" },
          { sourceField: "period", targetField: "period", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: false,
  },
  {
    id: "source_complaints",
    name: "Complaints Data",
    description: "Product complaints, feedback, and adverse events",
    sourceType: "complaints",
    acceptedFormats: ["excel", "json", "docx", "csv"],
    primaryEvidenceTypes: ["complaint_record", "complaint_summary", "complaints_by_region"],
    secondaryEvidenceTypes: ["serious_incident_summary", "serious_incident_records_imdrf", "vigilance_report", "customer_feedback_summary"],
    evidenceTypeMappings: [
      {
        evidenceType: "complaint_record",
        enabled: true,
        confidence: 0.9,
        fieldMappings: [
          { sourceField: "type", targetField: "complaint_type", transformation: "direct" },
          { sourceField: "complaint_type", targetField: "complaint_type", transformation: "direct" },
          { sourceField: "category", targetField: "complaint_type", transformation: "direct" },
          { sourceField: "date", targetField: "date", transformation: "date" },
          { sourceField: "reported_date", targetField: "date", transformation: "date" },
          { sourceField: "description", targetField: "description", transformation: "direct" },
          { sourceField: "severity", targetField: "severity", transformation: "direct" },
          { sourceField: "serious", targetField: "serious", transformation: "boolean" },
          { sourceField: "region", targetField: "region", transformation: "direct" },
          { sourceField: "status", targetField: "status", transformation: "direct" },
        ],
      },
      {
        evidenceType: "serious_incident_summary",
        enabled: true,
        confidence: 0.85,
        fieldMappings: [
          { sourceField: "count", targetField: "count", transformation: "number" },
          { sourceField: "description", targetField: "description", transformation: "direct" },
          { sourceField: "outcome", targetField: "outcome", transformation: "direct" },
        ],
        validationRules: ["severity_is_serious"],
      },
      {
        evidenceType: "serious_incident_records_imdrf",
        enabled: true,
        confidence: 0.9,
        fieldMappings: [
          { sourceField: "imdrf_code", targetField: "imdrf_code", transformation: "direct" },
          { sourceField: "code", targetField: "imdrf_code", transformation: "direct" },
          { sourceField: "description", targetField: "description", transformation: "direct" },
          { sourceField: "count", targetField: "count", transformation: "number" },
          { sourceField: "outcome", targetField: "patient_outcome", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },
  {
    id: "source_fsca",
    name: "FSCA Records",
    description: "Field Safety Corrective Actions",
    sourceType: "fsca",
    acceptedFormats: ["excel", "json", "csv"],
    primaryEvidenceTypes: ["fsca_record", "fsca_summary"],
    evidenceTypeMappings: [
      {
        evidenceType: "fsca_record",
        enabled: true,
        confidence: 0.9,
        fieldMappings: [
          { sourceField: "fsca_id", targetField: "fsca_id", transformation: "direct" },
          { sourceField: "id", targetField: "fsca_id", transformation: "direct" },
          { sourceField: "reference", targetField: "fsca_id", transformation: "direct" },
          { sourceField: "action_type", targetField: "action_type", transformation: "direct" },
          { sourceField: "type", targetField: "action_type", transformation: "direct" },
          { sourceField: "date", targetField: "initiation_date", transformation: "date" },
          { sourceField: "initiation_date", targetField: "initiation_date", transformation: "date" },
          { sourceField: "status", targetField: "status", transformation: "direct" },
          { sourceField: "affected_units", targetField: "affected_units", transformation: "number" },
          { sourceField: "units", targetField: "affected_units", transformation: "number" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: false,
  },
  {
    id: "source_capa",
    name: "CAPA Records",
    description: "Corrective and Preventive Actions",
    sourceType: "capa",
    acceptedFormats: ["excel", "json", "docx", "csv"],
    primaryEvidenceTypes: ["capa_record", "capa_summary"],
    evidenceTypeMappings: [
      {
        evidenceType: "capa_record",
        enabled: true,
        confidence: 0.9,
        fieldMappings: [
          { sourceField: "capa_id", targetField: "capa_id", transformation: "direct" },
          { sourceField: "id", targetField: "capa_id", transformation: "direct" },
          { sourceField: "description", targetField: "description", transformation: "direct" },
          { sourceField: "title", targetField: "description", transformation: "direct" },
          { sourceField: "date", targetField: "initiation_date", transformation: "date" },
          { sourceField: "open_date", targetField: "initiation_date", transformation: "date" },
          { sourceField: "status", targetField: "status", transformation: "direct" },
          { sourceField: "effectiveness", targetField: "effectiveness", transformation: "direct" },
          { sourceField: "root_cause", targetField: "root_cause", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: false,
  },
  {
    id: "source_pmcf",
    name: "PMCF Data",
    description: "Post-Market Clinical Follow-up reports and data",
    sourceType: "pmcf",
    acceptedFormats: ["docx", "pdf"],
    primaryEvidenceTypes: ["pmcf_summary", "pmcf_activity_record", "pmcf_report_extract"],
    evidenceTypeMappings: [
      {
        evidenceType: "pmcf_summary",
        enabled: true,
        confidence: 0.8,
        fieldMappings: [
          { sourceField: "status", targetField: "status", transformation: "direct" },
          { sourceField: "findings", targetField: "key_findings", transformation: "direct" },
          { sourceField: "key_findings", targetField: "key_findings", transformation: "direct" },
        ],
      },
      {
        evidenceType: "pmcf_activity_record",
        enabled: true,
        confidence: 0.8,
        fieldMappings: [
          { sourceField: "activity_type", targetField: "activity_type", transformation: "direct" },
          { sourceField: "type", targetField: "activity_type", transformation: "direct" },
          { sourceField: "status", targetField: "status", transformation: "direct" },
          { sourceField: "enrolled", targetField: "enrolled_subjects", transformation: "number" },
          { sourceField: "subjects", targetField: "enrolled_subjects", transformation: "number" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },
  {
    id: "source_literature",
    name: "Literature Review",
    description: "Scientific literature review data",
    sourceType: "literature",
    acceptedFormats: ["docx", "pdf"],
    primaryEvidenceTypes: ["literature_search_strategy", "literature_review_summary"],
    evidenceTypeMappings: [
      {
        evidenceType: "literature_review_summary",
        enabled: true,
        confidence: 0.8,
        fieldMappings: [
          { sourceField: "database", targetField: "database", transformation: "direct" },
          { sourceField: "results", targetField: "results_count", transformation: "number" },
          { sourceField: "relevant", targetField: "relevant_count", transformation: "number" },
          { sourceField: "conclusion", targetField: "conclusion", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },
  {
    id: "source_external_db",
    name: "External Database Searches",
    description: "MAUDE, Eudamed and other database search results",
    sourceType: "external_db",
    acceptedFormats: ["excel", "csv"],
    primaryEvidenceTypes: ["external_db_query_log", "external_db_summary"],
    evidenceTypeMappings: [
      {
        evidenceType: "external_db_summary",
        enabled: true,
        confidence: 0.9,
        fieldMappings: [
          { sourceField: "database", targetField: "database", transformation: "direct" },
          { sourceField: "db_name", targetField: "database", transformation: "direct" },
          { sourceField: "date", targetField: "query_date", transformation: "date" },
          { sourceField: "query_date", targetField: "query_date", transformation: "date" },
          { sourceField: "adverse_events", targetField: "adverse_events_count", transformation: "number" },
          { sourceField: "recalls", targetField: "recalls_count", transformation: "number" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: false,
  },
  {
    id: "source_risk",
    name: "Risk Documentation",
    description: "Risk management and benefit-risk assessment",
    sourceType: "risk",
    acceptedFormats: ["excel", "docx", "pdf"],
    primaryEvidenceTypes: ["benefit_risk_assessment", "rmf_extract", "trend_analysis"],
    evidenceTypeMappings: [
      {
        evidenceType: "benefit_risk_assessment",
        enabled: true,
        confidence: 0.85,
        fieldMappings: [
          { sourceField: "conclusion", targetField: "conclusion", transformation: "direct" },
          { sourceField: "assessment", targetField: "assessment", transformation: "direct" },
          { sourceField: "benefits", targetField: "benefits", transformation: "direct" },
          { sourceField: "risks", targetField: "risks", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },
  {
    id: "source_cer",
    name: "Clinical Evaluation",
    description: "CER and clinical evaluation data",
    sourceType: "cer",
    acceptedFormats: ["docx", "pdf"],
    primaryEvidenceTypes: ["cer_extract", "clinical_evaluation_extract"],
    secondaryEvidenceTypes: ["device_registry_record"],
    evidenceTypeMappings: [
      {
        evidenceType: "cer_extract",
        enabled: true,
        confidence: 0.8,
        fieldMappings: [
          { sourceField: "content", targetField: "content", transformation: "direct" },
          { sourceField: "section", targetField: "section", transformation: "direct" },
          { sourceField: "findings", targetField: "key_findings", transformation: "direct" },
        ],
      },
      {
        evidenceType: "device_registry_record",
        enabled: true,
        confidence: 0.75,
        fieldMappings: [
          { sourceField: "device_name", targetField: "device_name", transformation: "direct" },
          { sourceField: "model", targetField: "model", transformation: "direct" },
          { sourceField: "udi", targetField: "udi_di", transformation: "direct" },
          { sourceField: "class", targetField: "risk_class", transformation: "direct" },
          { sourceField: "intended_purpose", targetField: "intended_purpose", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// IN-MEMORY STORE (will be replaced with DB storage)
// ═══════════════════════════════════════════════════════════════════════════════

let sourceConfigs: SourceConfig[] = [...DEFAULT_SOURCE_CONFIGS];

export function getSourceConfigs(): SourceConfig[] {
  return sourceConfigs;
}

export function getSourceConfig(id: string): SourceConfig | undefined {
  return sourceConfigs.find(c => c.id === id);
}

export function getSourceConfigByType(sourceType: SourceType): SourceConfig | undefined {
  return sourceConfigs.find(c => c.sourceType === sourceType);
}

export function updateSourceConfig(config: SourceConfig): SourceConfig {
  const index = sourceConfigs.findIndex(c => c.id === config.id);
  config.updatedAt = new Date().toISOString();
  
  if (index >= 0) {
    sourceConfigs[index] = config;
  } else {
    config.createdAt = new Date().toISOString();
    sourceConfigs.push(config);
  }
  
  return config;
}

export function deleteSourceConfig(id: string): boolean {
  const index = sourceConfigs.findIndex(c => c.id === id);
  if (index >= 0) {
    sourceConfigs.splice(index, 1);
    return true;
  }
  return false;
}

export function resetToDefaults(): void {
  sourceConfigs = [...DEFAULT_SOURCE_CONFIGS];
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function getAcceptedFormatsForSource(sourceType: SourceType): FileFormat[] {
  const config = getSourceConfigByType(sourceType);
  return config?.acceptedFormats || ["excel", "json"];
}

export function getPrimaryEvidenceTypes(sourceType: SourceType): string[] {
  const config = getSourceConfigByType(sourceType);
  return config?.primaryEvidenceTypes || [];
}

export function getAllEvidenceTypes(sourceType: SourceType): string[] {
  const config = getSourceConfigByType(sourceType);
  if (!config) return [];
  return [...config.primaryEvidenceTypes, ...(config.secondaryEvidenceTypes || [])];
}
