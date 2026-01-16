/**
 * Source Mapping Configuration
 * Defines how input sources map to evidence types
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

export const SourceTypeSchema = z.enum([
  "cer",
  "sales",
  "complaints", 
  "fsca",
  "pmcf",
  "risk",
  "capa",
  "admin"
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
    id: "source_cer",
    name: "CER",
    description: "Clinical Evaluation Report - comprehensive document containing device, clinical, safety, and regulatory evidence",
    sourceType: "cer",
    acceptedFormats: ["docx", "pdf"],
    // CER is a comprehensive document that can be the source of many evidence types
    primaryEvidenceTypes: [
      "clinical_evaluation_extract", 
      "cer_extract", 
      "benefit_risk_assessment",
      "device_registry_record",
    ],
    secondaryEvidenceTypes: [
      // Literature
      "literature_review_summary", 
      "literature_search_strategy", 
      "literature_result",
      // Clinical & PMCF
      "pmcf_result",
      "pmcf_summary",
      "pmcf_activity_record",
      // Risk
      "risk_assessment",
      "rmf_extract",
      // IFU & Device
      "ifu_extract",
      // Regulatory & Admin
      "regulatory_certificate_record",
      "manufacturer_profile",
      // Historical PMS data (from previous PSUR in CER)
      "sales_summary",
      "sales_by_region",
      "complaint_summary",
      "complaints_by_region",
      "serious_incident_summary",
      "vigilance_report",
      "previous_psur_extract",
      // PMS
      "pms_plan_extract",
      "pms_activity_log",
      // Misc
      "cer_change_log",
    ],
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
        evidenceType: "clinical_evaluation_extract",
        enabled: true,
        confidence: 0.85,
        fieldMappings: [],
      },
      {
        evidenceType: "benefit_risk_assessment",
        enabled: true,
        confidence: 0.9,
        fieldMappings: [],
      },
      {
        evidenceType: "device_registry_record",
        enabled: true,
        confidence: 0.85,
        fieldMappings: [],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },
  {
    id: "source_sales",
    name: "Sales",
    description: "Sales volume, distribution data, and usage estimates",
    sourceType: "sales",
    acceptedFormats: ["excel", "json", "csv"],
    primaryEvidenceTypes: ["sales_volume"],
    secondaryEvidenceTypes: ["sales_summary", "sales_by_region", "distribution_summary", "usage_estimate"],
    evidenceTypeMappings: [
      {
        evidenceType: "sales_volume",
        enabled: true,
        confidence: 0.9,
        fieldMappings: [
          { sourceField: "region", targetField: "region", transformation: "direct" },
          { sourceField: "country", targetField: "country", transformation: "direct" },
          { sourceField: "quantity", targetField: "quantity", transformation: "number" },
          { sourceField: "units", targetField: "quantity", transformation: "number" },
          { sourceField: "sold", targetField: "quantity", transformation: "number" },
          { sourceField: "volume", targetField: "quantity", transformation: "number" },
          { sourceField: "date", targetField: "saleDate", transformation: "date" },
          { sourceField: "period_start", targetField: "periodStart", transformation: "date" },
          { sourceField: "period_end", targetField: "periodEnd", transformation: "date" },
          { sourceField: "device_code", targetField: "deviceCode", transformation: "direct" },
          { sourceField: "sku", targetField: "deviceCode", transformation: "direct" },
          { sourceField: "product_code", targetField: "deviceCode", transformation: "direct" },
          { sourceField: "part_number", targetField: "deviceCode", transformation: "direct" }
        ],
      }
    ],
    autoExtract: true,
    requiresReview: false,
  },
  {
    id: "source_complaints",
    name: "Complaints",
    description: "Product complaints, feedback, and adverse event logs",
    sourceType: "complaints",
    acceptedFormats: ["excel", "json", "docx", "csv"],
    primaryEvidenceTypes: ["complaint_record"],
    secondaryEvidenceTypes: ["trend_analysis", "signal_log", "customer_feedback_summary", "complaint_summary", "complaints_by_region", "serious_incident_record", "serious_incident_summary", "serious_incident_records_imdrf", "vigilance_report"],
    evidenceTypeMappings: [
      {
        evidenceType: "complaint_record",
        enabled: true,
        confidence: 0.9,
        fieldMappings: [
          { sourceField: "type", targetField: "complaint_type", transformation: "direct" },
          { sourceField: "complaint_type", targetField: "complaint_type", transformation: "direct" },
          { sourceField: "category", targetField: "complaint_type", transformation: "direct" },
          { sourceField: "date", targetField: "complaintDate", transformation: "date" },
          { sourceField: "reported_date", targetField: "complaintDate", transformation: "date" },
          { sourceField: "complaint_date", targetField: "complaintDate", transformation: "date" },
          { sourceField: "description", targetField: "description", transformation: "direct" },
          { sourceField: "severity", targetField: "severity", transformation: "direct" },
          { sourceField: "serious", targetField: "serious", transformation: "boolean" },
          { sourceField: "region", targetField: "region", transformation: "direct" },
          { sourceField: "status", targetField: "status", transformation: "direct" },
          { sourceField: "complaint_id", targetField: "complaintId", transformation: "direct" },
          { sourceField: "id", targetField: "complaintId", transformation: "direct" },
          { sourceField: "device_code", targetField: "deviceCode", transformation: "direct" },
          { sourceField: "product_code", targetField: "deviceCode", transformation: "direct" }
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },
  {
    id: "source_fsca",
    name: "Field Actions and Recalls",
    description: "Field Safety Corrective Actions (FSCA) and Recalls",
    sourceType: "fsca",
    acceptedFormats: ["excel", "json", "csv", "docx"],
    primaryEvidenceTypes: ["fsca_record"],
    secondaryEvidenceTypes: ["fsca_summary", "recall_record"],
    evidenceTypeMappings: [
      {
        evidenceType: "fsca_record",
        enabled: true,
        confidence: 0.9,
        fieldMappings: [
          { sourceField: "fsca_id", targetField: "fscaId", transformation: "direct" },
          { sourceField: "id", targetField: "fscaId", transformation: "direct" },
          { sourceField: "action_type", targetField: "actionType", transformation: "direct" },
          { sourceField: "date", targetField: "initiationDate", transformation: "date" },
          { sourceField: "initiation_date", targetField: "initiationDate", transformation: "date" },
          { sourceField: "status", targetField: "status", transformation: "direct" },
          { sourceField: "affected_units", targetField: "affected_units", transformation: "number" },
          { sourceField: "device_code", targetField: "deviceCode", transformation: "direct" }
        ],
      },
    ],
    autoExtract: true,
    requiresReview: false,
  },
  {
    id: "source_pmcf",
    name: "PMCF",
    description: "Post-Market Clinical Follow-up studies and reports",
    sourceType: "pmcf",
    acceptedFormats: ["docx", "pdf", "excel"],
    primaryEvidenceTypes: ["pmcf_result"],
    secondaryEvidenceTypes: ["pmcf_activity_record", "pmcf_report_extract", "pmcf_summary"],
    evidenceTypeMappings: [
      {
        evidenceType: "pmcf_result",
        enabled: true,
        confidence: 0.8,
        fieldMappings: [
          { sourceField: "status", targetField: "status", transformation: "direct" },
          { sourceField: "findings", targetField: "key_findings", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },
  {
    id: "source_risk",
    name: "Risk Docs",
    description: "Risk Management Files (RMF) and Benefit-Risk Analysis",
    sourceType: "risk",
    acceptedFormats: ["excel", "docx", "pdf"],
    primaryEvidenceTypes: ["benefit_risk_assessment", "risk_assessment"],
    secondaryEvidenceTypes: ["rmf_extract", "rmf_change_log", "hazard_analysis"],
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
    id: "source_capa",
    name: "CAPA",
    description: "Corrective and Preventive Actions records",
    sourceType: "capa",
    acceptedFormats: ["excel", "json", "docx", "csv"],
    primaryEvidenceTypes: ["capa_record"],
    secondaryEvidenceTypes: ["ncr_record", "capa_summary"],
    evidenceTypeMappings: [
      {
        evidenceType: "capa_record",
        enabled: true,
        confidence: 0.9,
        fieldMappings: [
          { sourceField: "capa_id", targetField: "capa_id", transformation: "direct" },
          { sourceField: "description", targetField: "description", transformation: "direct" },
          { sourceField: "date", targetField: "initiation_date", transformation: "date" },
          { sourceField: "status", targetField: "status", transformation: "direct" },
          { sourceField: "root_cause", targetField: "root_cause", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: false,
  },
  {
    id: "source_admin",
    name: "Administrative Data",
    description: "Manufacturer, Device Registry, and Regulatory/Other docs",
    sourceType: "admin",
    acceptedFormats: ["excel", "csv", "json", "pdf"],
    primaryEvidenceTypes: ["device_registry_record", "manufacturer_profile", "regulatory_certificate_record"],
    secondaryEvidenceTypes: ["pms_plan_extract", "pms_activity_log", "data_source_register", "change_control_record", "previous_psur_extract", "external_db_summary", "external_db_query_log"],
    evidenceTypeMappings: [
      {
        evidenceType: "device_registry_record",
        enabled: true,
        confidence: 0.8,
        fieldMappings: [
          { sourceField: "device_name", targetField: "device_name", transformation: "direct" },
          { sourceField: "model", targetField: "model", transformation: "direct" },
          { sourceField: "udi", targetField: "udi_di", transformation: "direct" },
        ],
      }
    ],
    autoExtract: true,
    requiresReview: true,
  }
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

/**
 * Get the source type for a given evidence type
 * Returns the source type that "owns" this evidence type
 */
export function getSourceTypeForEvidenceType(evidenceType: string): SourceType | null {
  for (const config of sourceConfigs) {
    const allTypes = [...config.primaryEvidenceTypes, ...(config.secondaryEvidenceTypes || [])];
    if (allTypes.includes(evidenceType)) {
      return config.sourceType;
    }
  }
  return null;
}

/**
 * Get all evidence types that are "covered" when a source type is uploaded
 * This includes both primary and secondary types
 * 
 * When a user uploads an FSCA file (even if it says "N/A" for recalls),
 * both fsca_record AND recall_record are considered covered because
 * the user has fulfilled their obligation to provide FSCA data.
 */
export function getCoveredEvidenceTypesForSource(sourceType: SourceType): string[] {
  const config = getSourceConfigByType(sourceType);
  if (!config) return [];
  return [...config.primaryEvidenceTypes, ...(config.secondaryEvidenceTypes || [])];
}

/**
 * Given a set of evidence types that have atoms, return all evidence types
 * that should be considered "covered" based on source type coverage rules.
 * 
 * Logic: If ANY evidence type from a source has data, ALL evidence types
 * from that source are considered covered (because the user uploaded that source).
 */
export function getExpandedCoveredTypes(evidenceTypesWithData: string[]): {
  coveredTypes: string[];
  coveredSources: SourceType[];
  coverageBySource: Record<string, string[]>;
} {
  const coveredSources = new Set<SourceType>();
  const coverageBySource: Record<string, string[]> = {};
  
  // Find which sources have data
  for (const evidenceType of evidenceTypesWithData) {
    const sourceType = getSourceTypeForEvidenceType(evidenceType);
    if (sourceType) {
      coveredSources.add(sourceType);
    }
  }
  
  // Expand to all evidence types from those sources
  const coveredTypes = new Set<string>();
  for (const sourceType of Array.from(coveredSources)) {
    const types = getCoveredEvidenceTypesForSource(sourceType);
    coverageBySource[sourceType] = types;
    for (const type of types) {
      coveredTypes.add(type);
    }
  }
  
  return {
    coveredTypes: Array.from(coveredTypes),
    coveredSources: Array.from(coveredSources),
    coverageBySource,
  };
}
