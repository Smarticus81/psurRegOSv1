/**
 * Agent Configuration System
 * 
 * Centralized configuration for all AI agents, customizable per use case.
 */

import { AgentConfig } from "./baseAgent";

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SystemConfig {
  // Global LLM settings
  llm: {
    defaultProvider: "openai" | "anthropic" | "auto";
    fallbackProvider?: "openai" | "anthropic";
    defaultModel: string;
    fallbackModel?: string;
    defaultTemperature: number;
    maxRetries: number;
    timeoutMs: number;
  };
  
  // Ingestion settings
  ingestion: {
    maxFileSizeMB: number;
    supportedFormats: string[];
    autoMapConfidenceThreshold: number;
    requireUserConfirmationBelow: number;
    maxRecordsPerFile: number;
    batchSize: number;
  };
  
  // Runtime agent settings
  runtime: {
    maxConcurrentAgents: number;
    narrativeMaxTokens: number;
    tableMaxRows: number;
    enableParallelSlotProcessing: boolean;
  };
  
  // Tracing settings
  tracing: {
    enabled: boolean;
    verbosity: "minimal" | "standard" | "verbose";
    logLLMContent: boolean;
    retainDays: number;
  };
  
  // Classification settings
  classification: {
    enableAutoClassification: boolean;
    severityModel: string;
    classificationBatchSize: number;
    minConfidenceForAuto: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  llm: {
    defaultProvider: "auto",
    fallbackProvider: "anthropic",
    defaultModel: "gpt-4o",
    fallbackModel: "claude-sonnet-4-5-20250929",
    defaultTemperature: 0.1,
    maxRetries: 3,
    timeoutMs: 120000,
  },
  
  ingestion: {
    maxFileSizeMB: 50,
    supportedFormats: ["xlsx", "xls", "csv", "docx", "pdf", "json"],
    autoMapConfidenceThreshold: 0.85,
    requireUserConfirmationBelow: 0.7,
    maxRecordsPerFile: 10000,
    batchSize: 100,
  },
  
  runtime: {
    maxConcurrentAgents: 5,
    narrativeMaxTokens: 4096,
    tableMaxRows: 100,
    enableParallelSlotProcessing: false,
  },
  
  tracing: {
    enabled: true,
    verbosity: "standard",
    logLLMContent: true,
    retainDays: 365,
  },
  
  classification: {
    enableAutoClassification: true,
    severityModel: "gpt-4o",
    classificationBatchSize: 10,
    minConfidenceForAuto: 0.8,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// USE CASE PRESETS
// ═══════════════════════════════════════════════════════════════════════════════

export const CONFIG_PRESETS: Record<string, Partial<SystemConfig>> = {
  // Fast processing with lower accuracy
  fast: {
    llm: {
      defaultProvider: "openai",
      defaultModel: "gpt-4o-mini",
      defaultTemperature: 0.1,
      maxRetries: 2,
      timeoutMs: 60000,
    },
    ingestion: {
      maxFileSizeMB: 50,
      supportedFormats: ["xlsx", "csv", "json"],
      autoMapConfidenceThreshold: 0.75,
      requireUserConfirmationBelow: 0.6,
      maxRecordsPerFile: 5000,
      batchSize: 200,
    },
    classification: {
      enableAutoClassification: true,
      severityModel: "gpt-4o-mini",
      classificationBatchSize: 20,
      minConfidenceForAuto: 0.7,
    },
  },
  
  // High accuracy for regulatory submissions
  regulatory: {
    llm: {
      defaultProvider: "openai",
      defaultModel: "gpt-4o",
      defaultTemperature: 0.05,
      maxRetries: 3,
      timeoutMs: 180000,
    },
    ingestion: {
      maxFileSizeMB: 100,
      supportedFormats: ["xlsx", "xls", "csv", "docx", "pdf", "json"],
      autoMapConfidenceThreshold: 0.9,
      requireUserConfirmationBelow: 0.8,
      maxRecordsPerFile: 20000,
      batchSize: 50,
    },
    runtime: {
      maxConcurrentAgents: 3,
      narrativeMaxTokens: 8192,
      tableMaxRows: 200,
      enableParallelSlotProcessing: false,
    },
    classification: {
      enableAutoClassification: true,
      severityModel: "gpt-4o",
      classificationBatchSize: 5,
      minConfidenceForAuto: 0.85,
    },
  },
  
  // Cost-optimized for development/testing
  development: {
    llm: {
      defaultProvider: "anthropic",
      defaultModel: "claude-3-5-haiku-20241022",
      defaultTemperature: 0.2,
      maxRetries: 1,
      timeoutMs: 30000,
    },
    tracing: {
      enabled: true,
      verbosity: "verbose",
      logLLMContent: true,
      retainDays: 30,
    },
    classification: {
      enableAutoClassification: false,
      severityModel: "claude-3-5-haiku-20241022",
      classificationBatchSize: 5,
      minConfidenceForAuto: 0.9,
    },
  },
  
  // No LLM - rule-based only (model specified but not used due to maxRetries: 0)
  offline: {
    llm: {
      defaultProvider: "auto",
      defaultModel: "gpt-4o",
      defaultTemperature: 0.1,
      maxRetries: 0,
      timeoutMs: 5000,
    },
    ingestion: {
      maxFileSizeMB: 50,
      supportedFormats: ["xlsx", "csv", "json"],
      autoMapConfidenceThreshold: 0.95,
      requireUserConfirmationBelow: 0.95,
      maxRecordsPerFile: 1000,
      batchSize: 500,
    },
    classification: {
      enableAutoClassification: false,
      severityModel: "gpt-4o",
      classificationBatchSize: 10,
      minConfidenceForAuto: 1.0,
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

let currentConfig: SystemConfig = { ...DEFAULT_SYSTEM_CONFIG };

/**
 * Get current system configuration
 */
export function getConfig(): SystemConfig {
  return currentConfig;
}

/**
 * Update system configuration
 */
export function updateConfig(updates: Partial<SystemConfig>): SystemConfig {
  currentConfig = deepMerge(currentConfig, updates);
  console.log("[Config] System configuration updated");
  return currentConfig;
}

/**
 * Apply a preset configuration
 */
export function applyPreset(presetName: keyof typeof CONFIG_PRESETS): SystemConfig {
  const preset = CONFIG_PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown preset: ${presetName}`);
  }
  
  currentConfig = deepMerge(DEFAULT_SYSTEM_CONFIG, preset);
  console.log(`[Config] Applied preset: ${presetName}`);
  return currentConfig;
}

/**
 * Reset to default configuration
 */
export function resetConfig(): SystemConfig {
  currentConfig = { ...DEFAULT_SYSTEM_CONFIG };
  console.log("[Config] Reset to default configuration");
  return currentConfig;
}

/**
 * Create agent config from system config (deep merges nested objects)
 */
export function createAgentConfigFromSystem(
  agentType: string,
  name: string,
  overrides?: Partial<AgentConfig>
): AgentConfig {
  const config = getConfig();
  
  return {
    agentType,
    name,
    llm: {
      provider: config.llm.defaultProvider,
      model: config.llm.defaultModel,
      temperature: config.llm.defaultTemperature,
      maxTokens: config.runtime.narrativeMaxTokens,
      ...overrides?.llm,
    },
    behavior: {
      maxRetries: config.llm.maxRetries,
      retryDelayMs: 1000,
      timeoutMs: config.llm.timeoutMs,
      confidenceThreshold: config.ingestion.autoMapConfidenceThreshold,
      ...overrides?.behavior,
    },
    tracing: {
      verbosity: config.tracing.verbosity,
      logLLMContent: config.tracing.logLLMContent,
      logIntermediateSteps: config.tracing.verbosity !== "minimal",
      ...overrides?.tracing,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT MAPPING SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

export interface EvidenceTypeMapping {
  evidenceTypeId: string;
  displayName: string;
  category: "safety" | "clinical" | "commercial" | "quality" | "regulatory";
  requiredFields: string[];
  optionalFields: string[];
  defaultSourceTypes: string[];
  classificationEnabled: boolean;
}

export const EVIDENCE_TYPE_MAPPINGS: EvidenceTypeMapping[] = [
  {
    evidenceTypeId: "complaint_record",
    displayName: "Complaint Record",
    category: "safety",
    requiredFields: ["complaintId", "complaintDate", "deviceCode", "description"],
    optionalFields: ["severity", "region", "country", "patientOutcome", "rootCause", "correctiveAction", "investigationStatus", "serious"],
    defaultSourceTypes: ["excel", "csv"],
    classificationEnabled: true,
  },
  {
    evidenceTypeId: "serious_incident_record",
    displayName: "Serious Incident",
    category: "safety",
    requiredFields: ["incident_id", "incident_date", "description"],
    optionalFields: ["patient_outcome", "device_involved", "root_cause", "reported_to"],
    defaultSourceTypes: ["excel", "docx"],
    classificationEnabled: false,
  },
  {
    evidenceTypeId: "sales_volume",
    displayName: "Sales/Distribution",
    category: "commercial",
    requiredFields: ["region", "period", "units"],
    optionalFields: ["revenue", "product_line", "channel"],
    defaultSourceTypes: ["excel", "csv", "json"],
    classificationEnabled: false,
  },
  {
    evidenceTypeId: "fsca_record",
    displayName: "FSCA Record",
    category: "safety",
    requiredFields: ["fsca_id", "initiation_date", "description"],
    optionalFields: ["affected_units", "countries", "status", "root_cause"],
    defaultSourceTypes: ["excel", "docx"],
    classificationEnabled: false,
  },
  {
    evidenceTypeId: "capa_record",
    displayName: "CAPA Record",
    category: "quality",
    requiredFields: ["capa_id", "open_date", "description"],
    optionalFields: ["type", "status", "target_date", "effectiveness"],
    defaultSourceTypes: ["excel", "docx"],
    classificationEnabled: false,
  },
  {
    evidenceTypeId: "pmcf_result",
    displayName: "PMCF Result",
    category: "clinical",
    requiredFields: ["study_id", "study_type", "findings"],
    optionalFields: ["patient_count", "start_date", "end_date", "conclusions"],
    defaultSourceTypes: ["docx", "pdf"],
    classificationEnabled: false,
  },
  {
    evidenceTypeId: "literature_result",
    displayName: "Literature Reference",
    category: "clinical",
    requiredFields: ["reference_id", "title", "relevance"],
    optionalFields: ["authors", "publication_date", "journal", "findings"],
    defaultSourceTypes: ["docx", "pdf"],
    classificationEnabled: false,
  },
  {
    evidenceTypeId: "risk_assessment",
    displayName: "Risk Assessment",
    category: "quality",
    requiredFields: ["risk_id", "hazard", "risk_level"],
    optionalFields: ["controls", "residual_risk", "status"],
    defaultSourceTypes: ["docx", "pdf"],
    classificationEnabled: false,
  },
  {
    evidenceTypeId: "external_db_query",
    displayName: "External DB Search",
    category: "regulatory",
    requiredFields: ["database", "query_date", "results_count"],
    optionalFields: ["query_terms", "relevant_findings", "analysis"],
    defaultSourceTypes: ["excel", "docx"],
    classificationEnabled: false,
  },
];

/**
 * Get evidence type mapping by ID
 */
export function getEvidenceTypeMapping(evidenceTypeId: string): EvidenceTypeMapping | undefined {
  return EVIDENCE_TYPE_MAPPINGS.find(m => m.evidenceTypeId === evidenceTypeId);
}

/**
 * Get all evidence types for a category
 */
export function getEvidenceTypesByCategory(category: EvidenceTypeMapping["category"]): EvidenceTypeMapping[] {
  return EVIDENCE_TYPE_MAPPINGS.filter(m => m.category === category);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];
    
    if (
      sourceValue !== undefined &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      sourceValue !== null &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue) &&
      targetValue !== null
    ) {
      result[key] = deepMerge(targetValue as object, sourceValue as object) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }
  
  return result;
}
