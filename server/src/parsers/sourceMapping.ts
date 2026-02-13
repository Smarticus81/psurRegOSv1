/**
 * Source Mapping Configuration
 * Defines how input sources map to evidence types
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

export const SourceTypeSchema = z.enum([
  "device_master",     // Category 1
  "complaints",        // Category 2
  "vigilance",         // Category 3
  "sales",             // Category 4
  "fsca",              // Category 5
  "capa",              // Category 6
  "cer",               // Category 7
  "rmf",               // Category 8
  "pmcf",              // Category 9
  "literature",        // Category 10
  "pms",               // Category 11
  "previous_psur",     // Category 12
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
  // ── Category 1: Device Master Data ──
  {
    id: "source_device_master",
    name: "Device Master Data",
    description: "Device identification, classification, intended use, manufacturer details, regulatory certificates",
    sourceType: "device_master",
    acceptedFormats: ["excel", "csv", "json"],
    primaryEvidenceTypes: ["device_identification", "device_classification", "device_intended_use", "device_technical_specs", "manufacturer_details", "regulatory_certificates"],
    secondaryEvidenceTypes: [],
    evidenceTypeMappings: [
      {
        evidenceType: "device_identification",
        enabled: true,
        confidence: 0.85,
        fieldMappings: [
          { sourceField: "device_name", targetField: "deviceName", transformation: "direct" },
          { sourceField: "model", targetField: "model", transformation: "direct" },
          { sourceField: "udi", targetField: "udiDi", transformation: "direct" },
          { sourceField: "udi_di", targetField: "udiDi", transformation: "direct" },
          { sourceField: "gmdn", targetField: "gmdnCode", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },

  // ── Category 2: Complaints (Non-Serious) ──
  {
    id: "source_complaints",
    name: "Complaints",
    description: "Product complaints, investigations, and non-serious event records",
    sourceType: "complaints",
    acceptedFormats: ["excel", "csv", "json"],
    primaryEvidenceTypes: ["complaint_record", "complaint_investigation"],
    secondaryEvidenceTypes: ["complaint_metrics", "imdrf_classification_complaints", "complaint_control_chart", "complaint_segmentation", "root_cause_clusters", "statistical_trending", "complaint_rate_analysis"],
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
          { sourceField: "product_code", targetField: "deviceCode", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },

  // ── Category 3: Vigilance (Serious Incidents) ──
  {
    id: "source_vigilance",
    name: "Vigilance",
    description: "Serious incident records, investigations, and vigilance submission logs",
    sourceType: "vigilance",
    acceptedFormats: ["excel", "csv", "json", "pdf"],
    primaryEvidenceTypes: ["serious_incident_record", "serious_incident_investigation", "vigilance_submission_log"],
    secondaryEvidenceTypes: ["imdrf_classification_incidents", "serious_incident_metrics"],
    evidenceTypeMappings: [
      {
        evidenceType: "serious_incident_record",
        enabled: true,
        confidence: 0.9,
        fieldMappings: [
          { sourceField: "incident_id", targetField: "incidentId", transformation: "direct" },
          { sourceField: "id", targetField: "incidentId", transformation: "direct" },
          { sourceField: "date", targetField: "incidentDate", transformation: "date" },
          { sourceField: "incident_date", targetField: "incidentDate", transformation: "date" },
          { sourceField: "description", targetField: "description", transformation: "direct" },
          { sourceField: "outcome", targetField: "patientOutcome", transformation: "direct" },
          { sourceField: "imdrf_code", targetField: "imdrfCode", transformation: "direct" },
          { sourceField: "device_code", targetField: "deviceCode", transformation: "direct" },
          { sourceField: "country", targetField: "country", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },

  // ── Category 4: Sales & Distribution ──
  {
    id: "source_sales",
    name: "Sales",
    description: "Sales transactions, distribution data, and market history",
    sourceType: "sales",
    acceptedFormats: ["excel", "csv"],
    primaryEvidenceTypes: ["sales_transactions", "market_history"],
    secondaryEvidenceTypes: ["sales_aggregated", "population_exposure"],
    evidenceTypeMappings: [
      {
        evidenceType: "sales_transactions",
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
          { sourceField: "part_number", targetField: "deviceCode", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: false,
  },

  // ── Category 5: FSCA ──
  {
    id: "source_fsca",
    name: "FSCA",
    description: "Field Safety Corrective Actions and effectiveness verification",
    sourceType: "fsca",
    acceptedFormats: ["excel", "csv", "docx"],
    primaryEvidenceTypes: ["fsca_record", "fsca_effectiveness"],
    secondaryEvidenceTypes: ["fsca_metrics"],
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
          { sourceField: "device_code", targetField: "deviceCode", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: false,
  },

  // ── Category 6: CAPA ──
  {
    id: "source_capa",
    name: "CAPA",
    description: "Corrective and Preventive Actions, Non-Conformance Reports",
    sourceType: "capa",
    acceptedFormats: ["excel", "csv", "docx"],
    primaryEvidenceTypes: ["capa_record", "ncr_record"],
    secondaryEvidenceTypes: ["capa_metrics"],
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

  // ── Category 7: CER (Extracted) ──
  {
    id: "source_cer",
    name: "CER",
    description: "Clinical Evaluation Report - document extracts for clinical benefits, risks, literature, state of art",
    sourceType: "cer",
    acceptedFormats: ["docx", "pdf"],
    primaryEvidenceTypes: ["cer_metadata", "cer_intended_use", "cer_clinical_benefits", "cer_clinical_risks", "cer_literature_summary", "cer_pmcf_summary", "cer_equivalence", "cer_state_of_art", "cer_conclusions", "cer_change_log"],
    secondaryEvidenceTypes: [],
    evidenceTypeMappings: [
      {
        evidenceType: "cer_metadata",
        enabled: true,
        confidence: 0.8,
        fieldMappings: [
          { sourceField: "content", targetField: "content", transformation: "direct" },
          { sourceField: "section", targetField: "section", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },

  // ── Category 8: RMF (Extracted) ──
  {
    id: "source_rmf",
    name: "Risk Management File",
    description: "Risk Management File - hazard analysis, risk assessments, benefit-risk analysis",
    sourceType: "rmf",
    acceptedFormats: ["excel", "docx", "pdf"],
    primaryEvidenceTypes: ["rmf_metadata", "rmf_hazard_analysis", "rmf_risk_assessment_pre", "rmf_risk_controls", "rmf_risk_assessment_post", "rmf_acceptability", "rmf_benefit_risk", "rmf_change_log"],
    secondaryEvidenceTypes: [],
    evidenceTypeMappings: [
      {
        evidenceType: "rmf_hazard_analysis",
        enabled: true,
        confidence: 0.85,
        fieldMappings: [
          { sourceField: "conclusion", targetField: "conclusion", transformation: "direct" },
          { sourceField: "benefits", targetField: "benefits", transformation: "direct" },
          { sourceField: "risks", targetField: "risks", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },

  // ── Category 9: PMCF ──
  {
    id: "source_pmcf",
    name: "PMCF",
    description: "Post-Market Clinical Follow-up activities, results, and evaluation",
    sourceType: "pmcf",
    acceptedFormats: ["docx", "pdf", "excel"],
    primaryEvidenceTypes: ["pmcf_activity_record", "pmcf_results"],
    secondaryEvidenceTypes: ["pmcf_plan_extract", "pmcf_evaluation_summary"],
    evidenceTypeMappings: [
      {
        evidenceType: "pmcf_results",
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

  // ── Category 10: Literature & External Databases ──
  {
    id: "source_literature",
    name: "Literature & Databases",
    description: "Literature search protocols, screening results, external database queries and findings",
    sourceType: "literature",
    acceptedFormats: ["excel", "csv", "pdf"],
    primaryEvidenceTypes: ["literature_search_protocol", "literature_screening_results", "external_db_query_log", "external_db_findings"],
    secondaryEvidenceTypes: ["literature_findings", "literature_synthesis", "cer_conclusions", "cer_metadata"],
    evidenceTypeMappings: [
      {
        evidenceType: "literature_findings",
        enabled: true,
        confidence: 0.7,
        fieldMappings: [
          { sourceField: "citation", targetField: "citation", transformation: "direct" },
          { sourceField: "title", targetField: "title", transformation: "direct" },
          { sourceField: "authors", targetField: "authors", transformation: "direct" },
          { sourceField: "findings", targetField: "findings", transformation: "direct" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },

  // ── Category 11: PMS Plan & Activity Log ──
  {
    id: "source_pms",
    name: "PMS Plan & Activities",
    description: "PMS Plan document extracts and surveillance activity logs",
    sourceType: "pms",
    acceptedFormats: ["docx", "pdf", "excel"],
    primaryEvidenceTypes: ["pms_activity_log"],
    secondaryEvidenceTypes: ["pms_plan_extract", "benefit_risk_quantification", "risk_reassessment", "previous_psur_metadata", "previous_psur_conclusions"],
    evidenceTypeMappings: [
      {
        evidenceType: "pms_activity_log",
        enabled: true,
        confidence: 0.8,
        fieldMappings: [
          { sourceField: "activity_id", targetField: "activityId", transformation: "direct" },
          { sourceField: "activity_type", targetField: "activityType", transformation: "direct" },
          { sourceField: "status", targetField: "status", transformation: "direct" },
          { sourceField: "date", targetField: "plannedDate", transformation: "date" },
        ],
      },
    ],
    autoExtract: true,
    requiresReview: true,
  },

  // ── Category 12: Previous PSUR ──
  {
    id: "source_previous_psur",
    name: "Previous PSUR",
    description: "Previous PSUR document for continuity, trending, and action status tracking",
    sourceType: "previous_psur",
    acceptedFormats: ["docx", "pdf"],
    primaryEvidenceTypes: ["previous_psur_action_status"],
    secondaryEvidenceTypes: ["previous_psur_metadata", "previous_psur_conclusions", "previous_psur_metrics", "previous_psur_actions"],
    evidenceTypeMappings: [
      {
        evidenceType: "previous_psur_metadata",
        enabled: true,
        confidence: 0.8,
        fieldMappings: [
          { sourceField: "content", targetField: "content", transformation: "direct" },
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
