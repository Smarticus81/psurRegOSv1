/**
 * Device Dossier Service
 * 
 * Provides rich device-specific context for PSUR content generation.
 * This is the core service that transforms generic evidence data into
 * device-specific, non-generic content by providing therapeutic context,
 * risk management references, regulatory history, and performance baselines.
 * 
 * SINGLE SOURCE OF TRUTH for device context used by all narrative agents.
 */

import { db } from "../../db";
import { eq, and, desc, lte, gte } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { completeJSON } from "../agents/llmService";
import {
  deviceDossiers,
  dossierClinicalContext,
  dossierRiskContext,
  dossierPriorPsurs,
  dossierBaselines,
  dossierClinicalEvidence,
  dossierRegulatoryHistory,
  type DeviceDossier,
  type DossierClinicalContext,
  type DossierRiskContext,
  type DossierPriorPsur,
  type DossierBaseline,
  type DossierClinicalEvidence,
  type DossierRegulatoryHistory,
  type InsertDeviceDossier,
  type InsertDossierClinicalContext,
  type InsertDossierRiskContext,
  type InsertDossierPriorPsur,
  type InsertDossierBaseline,
  type InsertDossierClinicalEvidence,
  type InsertDossierRegulatoryHistory,
} from "@shared/schema";
import { buildRegulatoryAlignmentBlock } from "../constants/grkbMdcgAlignment";
import { buildRegulatoryContextForAgents } from "../constants/psurRegulatoryContext";

// ═══════════════════════════════════════════════════════════════════════════════
// FIELD NORMALIZATION - Canonical field name mappings for LLM output consistency
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps all known LLM field name variants to canonical names.
 * This ensures consistent field access regardless of how the LLM names the fields.
 */
const FIELD_NAME_MAPPINGS: Record<string, string[]> = {
  // Device identity
  tradeName: ["trade_name", "device_name", "deviceName", "product_name", "productName", "name"],
  manufacturer: ["manufacturer_name", "manufacturerName", "manufacturer", "legal_manufacturer", "legalManufacturer"],
  basicUdiDi: ["basic_udi_di", "basicUdi", "basic_udi", "udi_di", "udiDi", "udi"],
  riskClass: ["risk_class", "classification", "device_class", "deviceClass", "class"],
  gmdnCode: ["gmdn_code", "gmdnTerm", "gmdn_term", "gmdn"],
  model: ["model_number", "modelNumber", "model_name", "modelName"],

  // Intended purpose / IFU
  intendedPurpose: ["intended_purpose", "intendedUse", "intended_use", "purpose", "indication_for_use"],
  indications: ["indication", "indications_for_use", "indicationsForUse", "clinical_indications"],
  contraindications: ["contraindication", "contra_indications", "contraindicationsForUse"],
  warnings: ["warning", "precautions", "warnings_and_precautions"],
  targetPopulation: ["target_population", "patient_population", "patientPopulation", "intended_population"],

  // Clinical benefits
  clinicalBenefits: ["clinical_benefits", "benefits", "clinical_benefit", "claimed_benefits", "claimedBenefits"],
  benefitDescription: ["benefit_description", "description", "benefit"],
  endpoint: ["clinical_endpoint", "clinicalEndpoint", "outcome_measure", "outcomeMeasure"],
  evidenceSource: ["evidence_source", "source", "reference", "study_reference"],
  quantifiedValue: ["quantified_value", "value", "measured_value", "measuredValue", "result"],

  // Risk management
  principalRisks: ["principal_risks", "identified_risks", "identifiedRisks", "hazards", "risks"],
  hazard: ["hazard_description", "hazardDescription", "risk_description", "riskDescription"],
  harm: ["potential_harm", "potentialHarm", "harm_description", "harmDescription"],
  severity: ["severity_level", "severityLevel", "risk_severity", "riskSeverity"],
  probability: ["occurrence_probability", "occurrenceProbability", "likelihood"],
  mitigations: ["mitigation_measures", "mitigationMeasures", "risk_controls", "riskControls", "controls"],
  residualRiskAcceptable: ["residual_risk_acceptable", "acceptable", "residualAcceptable"],
  riskAcceptability: ["risk_acceptability", "acceptability_criteria", "acceptabilityCriteria", "overall_acceptability"],
  afapAnalysisSummary: ["afap_analysis", "afapAnalysis", "afap_summary", "afap"],
  complaintRateThreshold: ["complaint_rate_threshold", "complaint_threshold", "complaintThreshold"],
  seriousIncidentThreshold: ["serious_incident_threshold", "incident_threshold", "incidentThreshold"],
  signalDetectionMethod: ["signal_detection_method", "detection_method", "detectionMethod"],
  hazardCategories: ["hazard_categories", "hazard_types", "hazardTypes", "risk_categories"],

  // Clinical evaluation / B-R
  conclusion: ["overall_conclusion", "overallConclusion", "cer_conclusion", "cerConclusion", "benefit_risk_conclusion", "benefitRiskConclusion"],
  safetyConclusion: ["safety_conclusion", "safety_assessment", "safetyAssessment"],
  performanceConclusion: ["performance_conclusion", "performance_assessment", "performanceAssessment"],
  keyFindings: ["key_findings", "findings", "main_findings", "mainFindings"],
  dataGapsIdentified: ["data_gaps", "dataGaps", "gaps_identified", "gapsIdentified", "gaps"],
  benefitsSummary: ["benefits_summary", "benefit_summary", "benefitSummary"],
  risksSummary: ["risks_summary", "risk_summary", "riskSummary"],
  acceptableRisk: ["acceptable_risk", "risk_acceptable", "riskAcceptable"],

  // Literature
  databasesSearched: ["databases_searched", "databases", "search_databases", "searchDatabases"],
  searchTerms: ["search_terms", "searchStrings", "search_strings", "keywords", "search_keywords"],
  inclusionCriteria: ["inclusion_criteria", "inclusion", "include_criteria"],
  exclusionCriteria: ["exclusion_criteria", "exclusion", "exclude_criteria"],
  lastSearchDate: ["last_search_date", "search_date", "searchDate"],
  totalArticlesIdentified: ["total_articles_identified", "articles_found", "articlesFound", "total_found"],
  totalArticlesIncluded: ["total_articles_included", "articles_included", "articlesIncluded", "total_included"],

  // PMCF
  studyType: ["study_type", "pmcf_type", "pmcfType", "activity_type", "activityType"],
  studyId: ["study_id", "pmcf_id", "pmcfId"],
  studyName: ["study_name", "pmcf_name", "pmcfName"],
  patientCount: ["patient_count", "sample_size", "sampleSize", "enrollment", "n"],
  followUpDuration: ["follow_up_duration", "followUp", "follow_up", "duration"],
  primaryEndpoint: ["primary_endpoint", "main_endpoint", "mainEndpoint"],
  pmcfObjectives: ["pmcf_objectives", "objectives", "study_objectives", "studyObjectives"],
  activitiesPerformed: ["activities_performed", "pmcf_activities", "pmcfActivities", "activities"],

  // State of the art
  stateOfTheArt: ["state_of_the_art", "sota", "current_treatment", "currentTreatment", "benchmark"],
  benchmarkDevices: ["benchmark_devices", "comparator_devices", "comparatorDevices", "reference_devices"],
  performanceThresholds: ["performance_thresholds", "benchmarks", "thresholds"],
  alternativeTreatments: ["alternative_treatments", "alternatives", "treatment_alternatives", "treatmentAlternatives"],

  // Equivalence
  equivalentDevices: ["equivalent_devices", "equivalence", "equivalentDevice", "equivalent_device"],
  equivalenceType: ["equivalence_type", "type_of_equivalence", "typeOfEquivalence"],
  equivalenceJustification: ["equivalence_justification", "justification", "rationale"],

  // Regulatory
  certificateNumber: ["certificate_number", "certificate_id", "certificateId", "cert_number", "certNumber"],
  notifiedBody: ["notified_body", "nb", "nb_name", "nbName"],
  issueDate: ["issue_date", "issued_date", "issuedDate", "cert_date", "certDate"],
  expiryDate: ["expiry_date", "expiration_date", "expirationDate", "valid_until", "validUntil"],

  // Sales / exposure
  totalUnits: ["total_units", "units_sold", "unitsSold", "cumulative_units", "cumulativeUnits", "quantity"],
  periodStart: ["period_start", "start_date", "startDate", "from_date", "fromDate"],
  periodEnd: ["period_end", "end_date", "endDate", "to_date", "toDate"],
  patientExposure: ["patient_exposure", "exposure", "patient_years", "patientYears"],

  // Complaints / incidents
  totalComplaints: ["total_complaints", "complaint_count", "complaintCount", "complaints"],
  totalIncidents: ["total_incidents", "incident_count", "incidentCount", "incidents"],
  seriousCount: ["serious_count", "serious_complaints", "seriousComplaints"],
  complaintRate: ["complaint_rate", "rate_per_unit", "ratePerUnit"],
};

/**
 * Normalize evidence data by mapping all field name variants to canonical names.
 * Returns a new object with canonical field names.
 */
function normalizeEvidenceData(data: Record<string, any> | undefined): Record<string, any> {
  if (!data) return {};

  const normalized: Record<string, any> = {};

  // Copy all original fields first
  for (const [key, value] of Object.entries(data)) {
    // Skip internal metadata fields
    if (key.startsWith("_")) {
      normalized[key] = value;
      continue;
    }

    // Check if this key should be mapped to a canonical name
    let canonicalKey = key;
    for (const [canonical, variants] of Object.entries(FIELD_NAME_MAPPINGS)) {
      if (variants.includes(key) || key === canonical) {
        canonicalKey = canonical;
        break;
      }
    }

    // Only set if not already set (prefer first occurrence)
    if (!(canonicalKey in normalized)) {
      normalized[canonicalKey] = value;
    }
  }

  return normalized;
}

/**
 * Get a field value from data, trying all known variants of the field name.
 */
function getField(data: Record<string, any> | undefined, canonicalName: string): any {
  if (!data) return undefined;

  // Try canonical name first
  if (data[canonicalName] !== undefined) return data[canonicalName];

  // Try all variants
  const variants = FIELD_NAME_MAPPINGS[canonicalName];
  if (variants) {
    for (const variant of variants) {
      if (data[variant] !== undefined) return data[variant];
    }
  }

  return undefined;
}

/**
 * Get a string field value from data, trying all known variants.
 */
function getStringField(data: Record<string, any> | undefined, canonicalName: string): string | undefined {
  const value = getField(data, canonicalName);
  return value !== undefined && value !== null ? String(value) : undefined;
}

/**
 * Get an array field value from data, trying all known variants.
 */
function getArrayField(data: Record<string, any> | undefined, canonicalName: string): any[] {
  const value = getField(data, canonicalName);
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

/**
 * Get a number field value from data, trying all known variants.
 */
function getNumberField(data: Record<string, any> | undefined, canonicalName: string): number | undefined {
  const value = getField(data, canonicalName);
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT TYPES - What agents receive
// ═══════════════════════════════════════════════════════════════════════════════

export interface DossierContext {
  // Pre-formatted context strings for agent prompts
  productSummary: string;
  clinicalContext: string;
  riskContext: string;
  regulatoryContext: string;
  baselineContext: string;
  priorPsurContext: string;
  /** GRKB and MDCG 2022-21 alignment requirements for agent prompts */
  regulatoryAlignment: string;
  /** 16-section regulatory context (methods, thresholds, terminology) for agent prompts */
  regulatoryKnowledgeContext: string;

  // Structured data for calculations and comparisons
  riskThresholds: RiskThresholds | null;
  clinicalBenefits: ClinicalBenefit[];
  priorPsurConclusion: PriorPsurSummary | null;
  performanceBaselines: PerformanceBaseline[];

  // Metadata
  dossierExists: boolean;
  completenessScore: number;
  lastUpdated: string | null;
}

export interface RiskThresholds {
  complaintRateThreshold: number;
  seriousIncidentThreshold: number;
  signalDetectionMethod: string;
}

export interface ClinicalBenefit {
  benefitId: string;
  description: string;
  endpoint: string;
  evidenceSource: string;
  quantifiedValue?: string;
}

export interface PriorPsurSummary {
  periodStart: string;
  periodEnd: string;
  psurReference?: string;
  benefitRiskConclusion: string;
  keyFindings: string[];
  actionsRequired: Array<{
    actionId: string;
    description: string;
    completed: boolean;
    dueDate?: string;
  }>;
  periodMetrics?: {
    totalUnits?: number;
    complaintRate?: number;
    seriousIncidents?: number;
  };
}

export interface PerformanceBaseline {
  metricType: string;
  value: number;
  unit: string;
  periodStart: string;
  periodEnd: string;
  methodology?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL DOSSIER TYPE - Complete device dossier with all related data
// ═══════════════════════════════════════════════════════════════════════════════

export interface FullDeviceDossier {
  core: DeviceDossier;
  clinicalContext: DossierClinicalContext | null;
  riskContext: DossierRiskContext | null;
  clinicalEvidence: DossierClinicalEvidence | null;
  regulatoryHistory: DossierRegulatoryHistory | null;
  priorPsurs: DossierPriorPsur[];
  baselines: DossierBaseline[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE SERVICE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the full dossier context for an agent to use in prompt construction.
 * This is the primary function agents should call.
 */
export async function getDossierContext(
  deviceCode: string,
  periodStart?: string,
  periodEnd?: string
): Promise<DossierContext> {
  // Handle multi-device codes (comma-separated) - try to find dossier for first device
  const deviceCodes = deviceCode.split(",").map(c => c.trim()).filter(Boolean);
  let dossier: FullDeviceDossier | null = null;
  
  for (const code of deviceCodes) {
    dossier = await getFullDossier(code);
    if (dossier) break;
  }
  
  if (!dossier) {
    // Return a minimal context that allows generation to proceed without a dossier
    // This enables analysis based purely on uploaded evidence
    console.log(`[DossierService] No dossier found for device(s): ${deviceCode}. Proceeding with evidence-only analysis.`);
    
    return {
      productSummary: `Device: ${deviceCode}\n\nNote: No device dossier available. Analysis based on uploaded evidence only.`,
      clinicalContext: [
        "## CLINICAL CONTEXT",
        "",
        `**Status:** No device dossier available for: ${deviceCode}`,
        "",
        "Analysis will proceed using uploaded evidence to derive:",
        "- Device description from device_registry_record atoms",
        "- Clinical claims from CER evidence",
        "- Risk profile from complaint and incident data",
      ].join("\n"),
      riskContext: [
        "## RISK MANAGEMENT CONTEXT",
        "",
        `**Status:** No device dossier available for: ${deviceCode}`,
        "",
        "**Default Thresholds Applied:**",
        "- Complaint Rate Alert: >5.0 per 1,000 units",
        "- Serious Incident Alert: >0 events",
        "- Signal detection: Standard statistical analysis",
      ].join("\n"),
      regulatoryContext: [
        "## REGULATORY CONTEXT",
        "",
        `**Status:** No device dossier available for: ${deviceCode}`,
        "",
        "Assumptions:",
        "- Device subject to EU MDR requirements",
        "- PSUR format per MDCG 2022/21",
      ].join("\n"),
      baselineContext: [
        "## PERFORMANCE BASELINES",
        "",
        "**Status:** No historical baselines available.",
        "",
        "This PSUR will establish initial baselines from current period data.",
      ].join("\n"),
      priorPsurContext: [
        "## PRIOR PSUR SUMMARY",
        "",
        "**Status:** No prior PSUR on record.",
        "",
        "This appears to be the first PSUR for this device family.",
      ].join("\n"),
      regulatoryAlignment: buildRegulatoryAlignmentBlock("MDCG_2022_21_ANNEX_I"),
      regulatoryKnowledgeContext: buildRegulatoryContextForAgents(),

      riskThresholds: {
        complaintRateThreshold: 5.0,
        seriousIncidentThreshold: 0,
        signalDetectionMethod: "Statistical analysis of complaint rates",
      },
      clinicalBenefits: [],
      priorPsurConclusion: null,
      performanceBaselines: [],

      dossierExists: false,
      completenessScore: 0,
      lastUpdated: null,
    };
  }

  // Find the most recent prior PSUR before current period
  const priorPsur = periodStart
    ? getMostRecentPriorPsur(dossier.priorPsurs, periodStart)
    : dossier.priorPsurs[0] || null;

  return {
    productSummary: buildProductSummary(dossier),
    clinicalContext: buildClinicalContextString(dossier),
    riskContext: buildRiskContextString(dossier),
    regulatoryContext: buildRegulatoryContextString(dossier),
    baselineContext: buildBaselineContextString(dossier, periodStart, periodEnd),
    priorPsurContext: buildPriorPsurContextString(priorPsur, dossier.core.deviceCode),
    regulatoryAlignment: buildRegulatoryAlignmentBlock("MDCG_2022_21_ANNEX_I"),
    regulatoryKnowledgeContext: buildRegulatoryContextForAgents(),

    riskThresholds: extractRiskThresholds(dossier.riskContext),
    clinicalBenefits: extractClinicalBenefits(dossier.clinicalContext),
    priorPsurConclusion: priorPsur ? mapToPriorPsurSummary(priorPsur) : null,
    performanceBaselines: extractPerformanceBaselines(dossier.baselines),

    dossierExists: true,
    completenessScore: dossier.core.completenessScore || 0,
    lastUpdated: dossier.core.updatedAt?.toISOString() || null,
  };
}

/**
 * Get the full device dossier with all related data.
 */
export async function getFullDossier(deviceCode: string): Promise<FullDeviceDossier | null> {
  const core = await db.query.deviceDossiers.findFirst({
    where: eq(deviceDossiers.deviceCode, deviceCode),
  });

  if (!core) {
    return null;
  }

  const [
    clinicalCtx,
    riskCtx,
    clinicalEvidence,
    regulatoryHist,
    priorPsurs,
    baselines,
  ] = await Promise.all([
    db.query.dossierClinicalContext.findFirst({
      where: eq(dossierClinicalContext.deviceCode, deviceCode),
    }),
    db.query.dossierRiskContext.findFirst({
      where: eq(dossierRiskContext.deviceCode, deviceCode),
    }),
    db.query.dossierClinicalEvidence.findFirst({
      where: eq(dossierClinicalEvidence.deviceCode, deviceCode),
    }),
    db.query.dossierRegulatoryHistory.findFirst({
      where: eq(dossierRegulatoryHistory.deviceCode, deviceCode),
    }),
    db.query.dossierPriorPsurs.findMany({
      where: eq(dossierPriorPsurs.deviceCode, deviceCode),
      orderBy: [desc(dossierPriorPsurs.periodEnd)],
    }),
    db.query.dossierBaselines.findMany({
      where: eq(dossierBaselines.deviceCode, deviceCode),
      orderBy: [desc(dossierBaselines.periodEnd)],
    }),
  ]);

  return {
    core,
    clinicalContext: clinicalCtx || null,
    riskContext: riskCtx || null,
    clinicalEvidence: clinicalEvidence || null,
    regulatoryHistory: regulatoryHist || null,
    priorPsurs: priorPsurs || [],
    baselines: baselines || [],
  };
}

/**
 * List all device dossiers.
 */
export async function listDossiers(): Promise<DeviceDossier[]> {
  return db.query.deviceDossiers.findMany({
    orderBy: [desc(deviceDossiers.updatedAt)],
  });
}

/**
 * Check if a dossier exists for a device.
 */
export async function dossierExists(deviceCode: string): Promise<boolean> {
  const result = await db.query.deviceDossiers.findFirst({
    where: eq(deviceDossiers.deviceCode, deviceCode),
    columns: { id: true },
  });
  return !!result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new device dossier.
 */
export async function createDossier(data: InsertDeviceDossier): Promise<DeviceDossier> {
  const [result] = await db.insert(deviceDossiers).values(data).returning();
  return result;
}

/**
 * Update a device dossier.
 */
export async function updateDossier(
  deviceCode: string,
  data: Partial<InsertDeviceDossier>
): Promise<DeviceDossier | null> {
  const [result] = await db
    .update(deviceDossiers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(deviceDossiers.deviceCode, deviceCode))
    .returning();
  return result || null;
}

/**
 * Delete a device dossier and all related data.
 */
export async function deleteDossier(deviceCode: string): Promise<boolean> {
  const result = await db
    .delete(deviceDossiers)
    .where(eq(deviceDossiers.deviceCode, deviceCode));
  return (result.rowCount || 0) > 0;
}

// --- Clinical Context ---

export async function upsertClinicalContext(
  deviceCode: string,
  data: Omit<InsertDossierClinicalContext, "deviceCode">
): Promise<DossierClinicalContext> {
  const existing = await db.query.dossierClinicalContext.findFirst({
    where: eq(dossierClinicalContext.deviceCode, deviceCode),
  });

  if (existing) {
    const [result] = await db
      .update(dossierClinicalContext)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dossierClinicalContext.deviceCode, deviceCode))
      .returning();
    return result;
  } else {
    const [result] = await db
      .insert(dossierClinicalContext)
      .values({ ...data, deviceCode })
      .returning();
    return result;
  }
}

// --- Risk Context ---

export async function upsertRiskContext(
  deviceCode: string,
  data: Omit<InsertDossierRiskContext, "deviceCode">
): Promise<DossierRiskContext> {
  const existing = await db.query.dossierRiskContext.findFirst({
    where: eq(dossierRiskContext.deviceCode, deviceCode),
  });

  if (existing) {
    const [result] = await db
      .update(dossierRiskContext)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dossierRiskContext.deviceCode, deviceCode))
      .returning();
    return result;
  } else {
    const [result] = await db
      .insert(dossierRiskContext)
      .values({ ...data, deviceCode })
      .returning();
    return result;
  }
}

// --- Clinical Evidence ---

export async function upsertClinicalEvidence(
  deviceCode: string,
  data: Omit<InsertDossierClinicalEvidence, "deviceCode">
): Promise<DossierClinicalEvidence> {
  const existing = await db.query.dossierClinicalEvidence.findFirst({
    where: eq(dossierClinicalEvidence.deviceCode, deviceCode),
  });

  if (existing) {
    const [result] = await db
      .update(dossierClinicalEvidence)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dossierClinicalEvidence.deviceCode, deviceCode))
      .returning();
    return result;
  } else {
    const [result] = await db
      .insert(dossierClinicalEvidence)
      .values({ ...data, deviceCode })
      .returning();
    return result;
  }
}

// --- Regulatory History ---

export async function upsertRegulatoryHistory(
  deviceCode: string,
  data: Omit<InsertDossierRegulatoryHistory, "deviceCode">
): Promise<DossierRegulatoryHistory> {
  const existing = await db.query.dossierRegulatoryHistory.findFirst({
    where: eq(dossierRegulatoryHistory.deviceCode, deviceCode),
  });

  if (existing) {
    const [result] = await db
      .update(dossierRegulatoryHistory)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dossierRegulatoryHistory.deviceCode, deviceCode))
      .returning();
    return result;
  } else {
    const [result] = await db
      .insert(dossierRegulatoryHistory)
      .values({ ...data, deviceCode })
      .returning();
    return result;
  }
}

// --- Prior PSURs ---

export async function addPriorPsur(
  deviceCode: string,
  data: Omit<InsertDossierPriorPsur, "deviceCode">
): Promise<DossierPriorPsur> {
  const [result] = await db
    .insert(dossierPriorPsurs)
    .values({ ...data, deviceCode })
    .returning();
  return result;
}

export async function updatePriorPsur(
  id: number,
  data: Partial<InsertDossierPriorPsur>
): Promise<DossierPriorPsur | null> {
  const [result] = await db
    .update(dossierPriorPsurs)
    .set(data)
    .where(eq(dossierPriorPsurs.id, id))
    .returning();
  return result || null;
}

export async function deletePriorPsur(id: number): Promise<boolean> {
  const result = await db
    .delete(dossierPriorPsurs)
    .where(eq(dossierPriorPsurs.id, id));
  return (result.rowCount || 0) > 0;
}

// --- Baselines ---

export async function addBaseline(
  deviceCode: string,
  data: Omit<InsertDossierBaseline, "deviceCode">
): Promise<DossierBaseline> {
  const [result] = await db
    .insert(dossierBaselines)
    .values({ ...data, deviceCode })
    .returning();
  return result;
}

export async function updateBaseline(
  id: number,
  data: Partial<InsertDossierBaseline>
): Promise<DossierBaseline | null> {
  const [result] = await db
    .update(dossierBaselines)
    .set(data)
    .where(eq(dossierBaselines.id, id))
    .returning();
  return result || null;
}

export async function deleteBaseline(id: number): Promise<boolean> {
  const result = await db
    .delete(dossierBaselines)
    .where(eq(dossierBaselines.id, id));
  return (result.rowCount || 0) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT BUILDING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function buildProductSummary(dossier: FullDeviceDossier): string {
  const { core, clinicalContext } = dossier;
  const classification = core.classification as any;

  const lines: string[] = [
    `## DEVICE PROFILE: ${core.tradeName}`,
    "",
    `${core.tradeName} (${core.deviceCode}) is a Class ${classification?.class || "Unknown"} medical device${classification?.rule ? ` classified under ${classification.rule}` : ""}.`,
  ];

  if (core.manufacturerName) {
    lines.push(`Manufacturer: ${core.manufacturerName}`);
  }

  if (core.basicUdiDi) {
    lines.push(`Basic UDI-DI: ${core.basicUdiDi}`);
  }

  if (clinicalContext?.intendedPurpose) {
    lines.push("");
    lines.push(`**Intended Purpose:** ${clinicalContext.intendedPurpose}`);
  }

  const targetPop = clinicalContext?.targetPopulation as any;
  if (targetPop?.description) {
    lines.push("");
    lines.push(`**Target Population:** ${targetPop.description}`);
    if (targetPop.ageRange) {
      lines.push(`- Age Range: ${targetPop.ageRange.min}-${targetPop.ageRange.max} years`);
    }
    if (targetPop.conditions?.length) {
      lines.push(`- Conditions: ${targetPop.conditions.join(", ")}`);
    }
  }

  const benefits = clinicalContext?.clinicalBenefits as ClinicalBenefit[] || [];
  if (benefits.length > 0) {
    lines.push("");
    lines.push("**Clinical Benefits:**");
    for (const b of benefits.slice(0, 5)) {
      lines.push(`- ${b.description}${b.quantifiedValue ? `: ${b.quantifiedValue}` : ""}`);
    }
  }

  if (core.marketEntryDate) {
    lines.push("");
    lines.push(`**Market Entry:** ${core.marketEntryDate.toISOString().split("T")[0]}`);
  }

  const exposure = core.cumulativeExposure as any;
  if (exposure?.patientYears || exposure?.unitsDistributed) {
    const expStr = exposure.patientYears
      ? `${exposure.patientYears.toLocaleString()} patient-years`
      : `${exposure.unitsDistributed?.toLocaleString()} units distributed`;
    lines.push(`**Cumulative Exposure:** ${expStr}`);
  }

  return lines.join("\n");
}

function buildClinicalContextString(dossier: FullDeviceDossier): string {
  const { clinicalContext, clinicalEvidence } = dossier;
  if (!clinicalContext) {
    // Return informative context instead of throwing
    return [
      "## CLINICAL CONTEXT",
      "",
      `**Status:** No clinical context record available for device: ${dossier.core.deviceCode}`,
      "",
      "**Impact on Analysis:**",
      "- Intended purpose will be derived from device registry data if available",
      "- Clinical benefits will be inferred from complaint/incident data",
      "- State of the art comparisons cannot be performed",
      "",
      "**Recommendation:** Add clinical context (intended purpose, indications, PMCF plan) to the device dossier for complete PSUR generation."
    ].join("\n");
  }

  const lines: string[] = ["## CLINICAL CONTEXT"];

  if (clinicalContext.intendedPurpose) {
    lines.push("");
    lines.push(`**Intended Purpose (Verbatim):**`);
    lines.push(clinicalContext.intendedPurpose);
  }

  if (clinicalContext.indications?.length) {
    lines.push("");
    lines.push("**Indications:**");
    for (const ind of clinicalContext.indications) {
      lines.push(`- ${ind}`);
    }
  }

  if (clinicalContext.contraindications?.length) {
    lines.push("");
    lines.push("**Contraindications:**");
    for (const contra of clinicalContext.contraindications) {
      lines.push(`- ${contra}`);
    }
  }

  const sota = clinicalContext.stateOfTheArt as any;
  if (sota?.description) {
    lines.push("");
    lines.push("**State of the Art:**");
    lines.push(sota.description);
    if (sota.benchmarkDevices?.length) {
      lines.push(`Benchmark devices: ${sota.benchmarkDevices.join(", ")}`);
    }
  }

  // Add PMCF info if available
  const pmcf = clinicalEvidence?.pmcfPlan as any;
  if (pmcf?.objectives?.length) {
    lines.push("");
    lines.push("**PMCF Plan Objectives:**");
    for (const obj of pmcf.objectives.slice(0, 5)) {
      lines.push(`- ${obj}`);
    }
    if (pmcf.currentStatus) {
      lines.push(`Status: ${pmcf.currentStatus}`);
    }
  }

  // External database search protocol (MDCG 2022-21 Section 10)
  const extDb = clinicalEvidence?.externalDbSearchProtocol as any;
  if (extDb?.databases?.length) {
    lines.push("");
    lines.push("**External Database Search Protocol:**");
    lines.push(`Databases: ${extDb.databases.join(", ")}`);
    if (extDb.lastSearchDate) lines.push(`Last search: ${extDb.lastSearchDate}`);
    if (extDb.queryTerms?.length) lines.push(`Query terms: ${extDb.queryTerms.join("; ")}`);
    if (extDb.relevanceCriteria?.length) lines.push(`Relevance criteria: ${extDb.relevanceCriteria.join("; ")}`);
  }

  return lines.join("\n");
}

function buildRiskContextString(dossier: FullDeviceDossier): string {
  const { riskContext } = dossier;
  if (!riskContext) {
    // Return informative context instead of throwing
    return [
      "## RISK MANAGEMENT CONTEXT",
      "",
      `**Status:** No risk context record available for device: ${dossier.core.deviceCode}`,
      "",
      "**Impact on Analysis:**",
      "- Principal risks will be inferred from complaint data and literature",
      "- Risk thresholds will use industry standard values",
      "- Pre-market occurrence rates not available for comparison",
      "",
      "**Default Thresholds Applied:**",
      "- Complaint Rate Alert: >5.0 per 1,000 units (industry standard)",
      "- Serious Incident Alert: >0 events (any serious incident flagged)",
      "",
      "**Recommendation:** Add risk context (principal risks, thresholds, acceptability criteria) to the device dossier."
    ].join("\n");
  }

  const lines: string[] = ["## RISK MANAGEMENT CONTEXT"];

  const risks = riskContext.principalRisks as any[] || [];
  if (risks.length > 0) {
    lines.push("");
    lines.push("**Principal Identified Risks:**");
    for (const risk of risks.slice(0, 5)) {
      const rateStr = risk.preMarketOccurrenceRate
        ? ` (Pre-market rate: ${(risk.preMarketOccurrenceRate * 100).toFixed(2)}%)`
        : "";
      lines.push(`- ${risk.hazard} → ${risk.harm} [${risk.severity}]${rateStr}`);
    }
  }

  const acceptability = riskContext.residualRiskAcceptability as any;
  if (acceptability?.criteria) {
    lines.push("");
    lines.push("**Risk Acceptability Criteria:**");
    lines.push(acceptability.criteria);
  }

  const thresholds = riskContext.riskThresholds as any;
  if (thresholds) {
    lines.push("");
    lines.push("**Signal Detection Thresholds:**");
    if (thresholds.complaintRateThreshold) {
      lines.push(`- Complaint Rate Alert: >${thresholds.complaintRateThreshold} per 1,000 units`);
    }
    if (thresholds.seriousIncidentThreshold) {
      lines.push(`- Serious Incident Alert: >${thresholds.seriousIncidentThreshold} events`);
    }
    if (thresholds.signalDetectionMethod) {
      lines.push(`- Method: ${thresholds.signalDetectionMethod}`);
    }
  }

  if (acceptability?.afapAnalysisSummary) {
    lines.push("");
    lines.push("**AFAP Analysis Summary:**");
    lines.push(acceptability.afapAnalysisSummary);
  }

  return lines.join("\n");
}

function buildRegulatoryContextString(dossier: FullDeviceDossier): string {
  const { regulatoryHistory } = dossier;
  if (!regulatoryHistory) {
    // Return informative context instead of throwing
    return [
      "## REGULATORY CONTEXT",
      "",
      `**Status:** No regulatory history record available for device: ${dossier.core.deviceCode}`,
      "",
      "**Impact on Analysis:**",
      "- Certificate status will be marked as unknown",
      "- NB commitments cannot be tracked",
      "- FSCA history cannot be cross-referenced",
      "",
      "**Assumptions for this PSUR:**",
      "- Device is assumed to be CE marked under EU MDR",
      "- No outstanding NB commitments known",
      "- FSCA section will rely on uploaded evidence only",
      "",
      "**Recommendation:** Add regulatory history (certificates, NB commitments, FSCA history) to the device dossier."
    ].join("\n");
  }

  const lines: string[] = ["## REGULATORY CONTEXT"];

  const certs = regulatoryHistory.certificates as any[] || [];
  const activeCerts = certs.filter(c => c.status === "Active");
  if (activeCerts.length > 0) {
    lines.push("");
    lines.push("**Active Certificates:**");
    for (const cert of activeCerts) {
      lines.push(`- ${cert.type} (${cert.notifiedBody}) - Expires: ${cert.expiryDate}`);
    }
  }

  const commitments = regulatoryHistory.nbCommitments as any[] || [];
  const openCommitments = commitments.filter(c => c.status !== "Completed");
  if (openCommitments.length > 0) {
    lines.push("");
    lines.push("**Outstanding NB Commitments:**");
    for (const commit of openCommitments) {
      const dueStr = commit.dueDate ? ` (Due: ${commit.dueDate})` : "";
      lines.push(`- ${commit.description} [${commit.status}]${dueStr}`);
    }
  }

  const fscas = regulatoryHistory.fscaHistory as any[] || [];
  if (fscas.length > 0) {
    lines.push("");
    lines.push("**FSCA History:**");
    for (const fsca of fscas.slice(0, 3)) {
      lines.push(`- ${fsca.type}: ${fsca.description} (${fsca.initiationDate}) [${fsca.status}]`);
    }
  }

  const changes = regulatoryHistory.designChanges as any[] || [];
  const recentChanges = changes.slice(0, 3);
  if (recentChanges.length > 0) {
    lines.push("");
    lines.push("**Recent Design Changes:**");
    for (const change of recentChanges) {
      lines.push(`- ${change.description} (${change.effectiveDate}) [${change.significance}]`);
    }
  }

  return lines.join("\n");
}

function buildBaselineContextString(
  dossier: FullDeviceDossier,
  periodStart?: string,
  periodEnd?: string
): string {
  const { baselines } = dossier;
  if (!baselines || baselines.length === 0) {
    // Return informative context instead of throwing - analysis should proceed without baselines
    return [
      "## PERFORMANCE BASELINES",
      "",
      "**Status:** No historical baselines available for this device.",
      "",
      "**Impact on Analysis:**",
      "- Trend analysis will use current period data only",
      "- Complaint rate thresholds will be derived from industry standards",
      "- Statistical comparisons to prior periods cannot be performed",
      "",
      "**Recommendation:** For future PSURs, add performance baselines (complaint rate, incident rate, return rate) to enable trend analysis."
    ].join("\n");
  }

  const lines: string[] = ["## PERFORMANCE BASELINES"];

  // Group baselines by metric type
  const byType = new Map<string, DossierBaseline[]>();
  for (const baseline of baselines) {
    const existing = byType.get(baseline.metricType) || [];
    existing.push(baseline);
    byType.set(baseline.metricType, existing);
  }

  for (const [metricType, typeBaselines] of byType) {
    const mostRecent = typeBaselines[0]; // Already sorted by periodEnd desc

    lines.push("");
    lines.push(`**${formatMetricType(metricType)}:**`);
    lines.push(`- Current Baseline: ${mostRecent.value} ${mostRecent.unit || ""}`);
    lines.push(`- Period: ${mostRecent.periodStart?.toISOString().split("T")[0]} to ${mostRecent.periodEnd?.toISOString().split("T")[0]}`);

    if (mostRecent.methodology) {
      lines.push(`- Methodology: ${mostRecent.methodology}`);
    }

    // Show trend if multiple baselines exist
    if (typeBaselines.length > 1) {
      const previous = typeBaselines[1];
      const currentVal = parseFloat(mostRecent.value);
      const previousVal = parseFloat(previous.value);
      if (!isNaN(currentVal) && !isNaN(previousVal) && previousVal !== 0) {
        const changePercent = ((currentVal - previousVal) / previousVal * 100).toFixed(1);
        const direction = currentVal > previousVal ? "increase" : "decrease";
        lines.push(`- Trend: ${Math.abs(parseFloat(changePercent))}% ${direction} from prior period`);
      }
    }
  }

  return lines.join("\n");
}

function buildPriorPsurContextString(priorPsur: DossierPriorPsur | null, deviceCode: string): string {
  if (!priorPsur) {
    // Return informative context instead of throwing - this may be the first PSUR
    return [
      "## PRIOR PSUR SUMMARY",
      "",
      `**Status:** No prior PSUR record available for device: ${deviceCode}`,
      "",
      "**Interpretation:**",
      "- This may be the first PSUR for this device",
      "- No prior benefit-risk conclusions available for comparison",
      "- Baseline metrics should be established from this reporting period",
      "",
      "**This PSUR will establish:**",
      "- Initial complaint rate baseline",
      "- Initial incident rate baseline",
      "- First benefit-risk assessment on record"
    ].join("\n");
  }

  const lines: string[] = ["## PRIOR PSUR SUMMARY"];

  lines.push("");
  lines.push(`**Period:** ${priorPsur.periodStart?.toISOString().split("T")[0]} to ${priorPsur.periodEnd?.toISOString().split("T")[0]}`);

  if (priorPsur.psurReference) {
    lines.push(`**Reference:** ${priorPsur.psurReference}`);
  }

  if (priorPsur.benefitRiskConclusion) {
    lines.push(`**B/R Conclusion:** ${priorPsur.benefitRiskConclusion}`);
  }

  if (priorPsur.keyFindings?.length) {
    lines.push("");
    lines.push("**Key Findings:**");
    for (const finding of priorPsur.keyFindings) {
      lines.push(`- ${finding}`);
    }
  }

  const actions = priorPsur.actionsRequired as any[] || [];
  const openActions = actions.filter(a => !a.completed);
  if (openActions.length > 0) {
    lines.push("");
    lines.push("**Outstanding Actions from Prior PSUR:**");
    for (const action of openActions) {
      const dueStr = action.dueDate ? ` (Due: ${action.dueDate})` : "";
      lines.push(`- ${action.description}${dueStr}`);
    }
  }

  const metrics = priorPsur.periodMetrics as any;
  if (metrics) {
    lines.push("");
    lines.push("**Prior Period Metrics:**");
    if (metrics.totalUnits) {
      lines.push(`- Units Distributed: ${metrics.totalUnits.toLocaleString()}`);
    }
    if (metrics.complaintRate !== undefined) {
      lines.push(`- Complaint Rate: ${metrics.complaintRate} per 1,000 units`);
    }
    if (metrics.seriousIncidents !== undefined) {
      lines.push(`- Serious Incidents: ${metrics.seriousIncidents}`);
    }
  }

  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function getMostRecentPriorPsur(
  priorPsurs: DossierPriorPsur[],
  beforeDate: string
): DossierPriorPsur | null {
  const beforeTimestamp = new Date(beforeDate).getTime();

  for (const psur of priorPsurs) {
    if (psur.periodEnd && psur.periodEnd.getTime() < beforeTimestamp) {
      return psur;
    }
  }

  return null;
}

function extractRiskThresholds(riskContext: DossierRiskContext | null): RiskThresholds | null {
  if (!riskContext?.riskThresholds) {
    return null;
  }

  const thresholds = riskContext.riskThresholds as any;
  return {
    complaintRateThreshold: thresholds.complaintRateThreshold || 0,
    seriousIncidentThreshold: thresholds.seriousIncidentThreshold || 0,
    signalDetectionMethod: thresholds.signalDetectionMethod || "Not specified",
  };
}

function extractClinicalBenefits(clinicalContext: DossierClinicalContext | null): ClinicalBenefit[] {
  if (!clinicalContext?.clinicalBenefits) {
    return [];
  }

  const benefits = clinicalContext.clinicalBenefits as ClinicalBenefit[];
  return benefits.map(b => ({
    benefitId: b.benefitId,
    description: b.description,
    endpoint: b.endpoint,
    evidenceSource: b.evidenceSource,
    quantifiedValue: b.quantifiedValue,
  }));
}

function extractPerformanceBaselines(baselines: DossierBaseline[]): PerformanceBaseline[] {
  return baselines.map(b => ({
    metricType: b.metricType,
    value: parseFloat(b.value) || 0,
    unit: b.unit || "",
    periodStart: b.periodStart?.toISOString() || "",
    periodEnd: b.periodEnd?.toISOString() || "",
    methodology: b.methodology || undefined,
  }));
}

function mapToPriorPsurSummary(psur: DossierPriorPsur): PriorPsurSummary {
  const actions = psur.actionsRequired as any[] || [];
  const metrics = psur.periodMetrics as any;

  return {
    periodStart: psur.periodStart?.toISOString() || "",
    periodEnd: psur.periodEnd?.toISOString() || "",
    psurReference: psur.psurReference || undefined,
    benefitRiskConclusion: psur.benefitRiskConclusion || "Unknown",
    keyFindings: psur.keyFindings || [],
    actionsRequired: actions.map(a => ({
      actionId: a.actionId,
      description: a.description,
      completed: a.completed,
      dueDate: a.dueDate,
    })),
    periodMetrics: metrics ? {
      totalUnits: metrics.totalUnits,
      complaintRate: metrics.complaintRate,
      seriousIncidents: metrics.seriousIncidents,
    } : undefined,
  };
}

function formatMetricType(metricType: string): string {
  return metricType
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETENESS SCORING
// ═══════════════════════════════════════════════════════════════════════════════

export interface CompletenessBreakdown {
  score: number;
  maxScore: number;
  percentage: number;
  categories: {
    identity: { score: number; max: number; missing: string[] };
    clinicalContext: { score: number; max: number; missing: string[] };
    riskContext: { score: number; max: number; missing: string[] };
    clinicalEvidence: { score: number; max: number; missing: string[] };
    regulatoryHistory: { score: number; max: number; missing: string[] };
    priorPsurs: { score: number; max: number; missing: string[] };
    baselines: { score: number; max: number; missing: string[] };
  };
  criticalMissing: string[];
  recommendations: string[];
}

/**
 * Calculate and update the completeness score for a dossier.
 * This is a genuinely accurate calculation that validates actual content quality.
 */
export async function updateCompletenessScore(deviceCode: string): Promise<number> {
  const breakdown = await calculateCompletenessBreakdown(deviceCode);

  // Update the score in the database
  await db
    .update(deviceDossiers)
    .set({ completenessScore: breakdown.score, lastValidatedAt: new Date() })
    .where(eq(deviceDossiers.deviceCode, deviceCode));

  return breakdown.score;
}

/**
 * Get detailed completeness breakdown for a dossier.
 */
export async function calculateCompletenessBreakdown(deviceCode: string): Promise<CompletenessBreakdown> {
  const dossier = await getFullDossier(deviceCode);

  const defaultBreakdown: CompletenessBreakdown = {
    score: 0,
    maxScore: 100,
    percentage: 0,
    categories: {
      identity: { score: 0, max: 15, missing: ["Device dossier not found"] },
      clinicalContext: { score: 0, max: 25, missing: [] },
      riskContext: { score: 0, max: 20, missing: [] },
      clinicalEvidence: { score: 0, max: 15, missing: [] },
      regulatoryHistory: { score: 0, max: 10, missing: [] },
      priorPsurs: { score: 0, max: 10, missing: [] },
      baselines: { score: 0, max: 5, missing: [] },
    },
    criticalMissing: ["Device dossier not found"],
    recommendations: ["Create device dossier first"],
  };

  if (!dossier) {
    return defaultBreakdown;
  }

  const criticalMissing: string[] = [];
  const recommendations: string[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY (15 points max)
  // ═══════════════════════════════════════════════════════════════════════════
  const identity = { score: 0, max: 15, missing: [] as string[] };

  // Trade name (5 points) - must be non-empty string with at least 2 chars
  if (isValidText(dossier.core.tradeName, 2)) {
    identity.score += 5;
  } else {
    identity.missing.push("Trade name");
    criticalMissing.push("Trade name is required for device identification");
  }

  // Classification (5 points) - must have valid class
  const classification = dossier.core.classification as any;
  if (classification?.class && ["I", "IIa", "IIb", "III"].includes(classification.class)) {
    identity.score += 5;
  } else {
    identity.missing.push("Device classification (Class I/IIa/IIb/III)");
    criticalMissing.push("Device classification is required for regulatory compliance");
  }

  // Basic UDI-DI (5 points) - must be valid format (at least 10 chars)
  if (isValidText(dossier.core.basicUdiDi, 10)) {
    identity.score += 5;
  } else {
    identity.missing.push("Basic UDI-DI");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLINICAL CONTEXT (25 points max)
  // ═══════════════════════════════════════════════════════════════════════════
  const clinicalContext = { score: 0, max: 25, missing: [] as string[] };

  // Intended purpose (10 points) - must be substantive description (at least 50 chars)
  if (isValidText(dossier.clinicalContext?.intendedPurpose, 50)) {
    clinicalContext.score += 10;
  } else if (isValidText(dossier.clinicalContext?.intendedPurpose, 10)) {
    clinicalContext.score += 5; // Partial credit for brief description
    clinicalContext.missing.push("Intended purpose needs more detail (min 50 chars)");
  } else {
    clinicalContext.missing.push("Intended purpose");
    criticalMissing.push("Intended purpose is essential for PSUR scope definition");
  }

  // Clinical benefits (7 points) - must have at least 1 benefit with description
  const benefits = dossier.clinicalContext?.clinicalBenefits as any[] || [];
  const validBenefits = benefits.filter(b => isValidText(b?.description, 10) && isValidText(b?.endpoint, 5));
  if (validBenefits.length >= 2) {
    clinicalContext.score += 7;
  } else if (validBenefits.length === 1) {
    clinicalContext.score += 4;
    clinicalContext.missing.push("Additional clinical benefits (at least 2 recommended)");
  } else {
    clinicalContext.missing.push("Clinical benefits with endpoints");
    criticalMissing.push("Clinical benefits must be defined for benefit-risk assessment");
  }

  // Target population (5 points) - must have description
  const targetPop = dossier.clinicalContext?.targetPopulation as any;
  if (isValidText(targetPop?.description, 20)) {
    clinicalContext.score += 5;
  } else {
    clinicalContext.missing.push("Target population description");
  }

  // State of the art (3 points) - bonus for having benchmark devices
  const sota = dossier.clinicalContext?.stateOfTheArt as any;
  if (isValidText(sota?.description, 30) || (sota?.benchmarkDevices?.length > 0)) {
    clinicalContext.score += 3;
  } else {
    clinicalContext.missing.push("State of the art / benchmark devices");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RISK CONTEXT (20 points max)
  // ═══════════════════════════════════════════════════════════════════════════
  const riskContext = { score: 0, max: 20, missing: [] as string[] };

  // Principal risks (10 points) - must have at least 2 risks with hazard/harm/severity
  const risks = dossier.riskContext?.principalRisks as any[] || [];
  const validRisks = risks.filter(r =>
    isValidText(r?.hazard, 5) &&
    isValidText(r?.harm, 5) &&
    isValidText(r?.severity, 3)
  );
  if (validRisks.length >= 3) {
    riskContext.score += 10;
  } else if (validRisks.length >= 1) {
    riskContext.score += Math.min(validRisks.length * 3, 7);
    riskContext.missing.push(`More principal risks needed (have ${validRisks.length}, need 3+)`);
  } else {
    riskContext.missing.push("Principal risks (hazard, harm, severity)");
    criticalMissing.push("Principal risks must be defined for risk-benefit analysis");
  }

  // Risk thresholds (6 points) - need signal detection thresholds
  const thresholds = dossier.riskContext?.riskThresholds as any;
  if (thresholds?.complaintRateThreshold || thresholds?.seriousIncidentThreshold) {
    riskContext.score += 4;
    if (isValidText(thresholds?.signalDetectionMethod, 10)) {
      riskContext.score += 2;
    } else {
      riskContext.missing.push("Signal detection method description");
    }
  } else {
    riskContext.missing.push("Risk thresholds (complaint rate, incident threshold)");
  }

  // Residual risk acceptability (4 points)
  const acceptability = dossier.riskContext?.residualRiskAcceptability as any;
  if (isValidText(acceptability?.criteria, 20)) {
    riskContext.score += 4;
  } else {
    riskContext.missing.push("Residual risk acceptability criteria");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLINICAL EVIDENCE (15 points max)
  // ═══════════════════════════════════════════════════════════════════════════
  const clinicalEvidence = { score: 0, max: 15, missing: [] as string[] };

  // CER conclusions (8 points) - must have B/R conclusion and at least 1 key finding
  const cer = dossier.clinicalEvidence?.cerConclusions as any;
  if (isValidText(cer?.benefitRiskConclusion, 20)) {
    clinicalEvidence.score += 5;
    if (Array.isArray(cer?.keyFindings) && cer.keyFindings.filter((f: any) => isValidText(f, 10)).length > 0) {
      clinicalEvidence.score += 3;
    } else {
      clinicalEvidence.missing.push("CER key findings");
    }
  } else {
    clinicalEvidence.missing.push("CER benefit-risk conclusion");
    recommendations.push("Upload CER document to extract B/R conclusions");
  }

  // PMCF plan (7 points) - must have objectives and status
  const pmcf = dossier.clinicalEvidence?.pmcfPlan as any;
  if (Array.isArray(pmcf?.objectives) && pmcf.objectives.filter((o: any) => isValidText(o, 10)).length > 0) {
    clinicalEvidence.score += 4;
    if (isValidText(pmcf?.currentStatus, 5)) {
      clinicalEvidence.score += 3;
    } else {
      clinicalEvidence.missing.push("PMCF plan current status");
    }
  } else {
    clinicalEvidence.missing.push("PMCF plan objectives");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REGULATORY HISTORY (10 points max)
  // ═══════════════════════════════════════════════════════════════════════════
  const regulatoryHistory = { score: 0, max: 10, missing: [] as string[] };

  // Certificates (5 points) - must have at least 1 active certificate
  const certs = dossier.regulatoryHistory?.certificates as any[] || [];
  const activeCerts = certs.filter(c =>
    isValidText(c?.type, 2) &&
    isValidText(c?.notifiedBody, 3) &&
    c?.status === "Active"
  );
  if (activeCerts.length > 0) {
    regulatoryHistory.score += 5;
  } else if (certs.length > 0) {
    regulatoryHistory.score += 2; // Partial credit for any certificate
    regulatoryHistory.missing.push("Active CE certificate");
  } else {
    regulatoryHistory.missing.push("Certificates (type, notified body, status)");
  }

  // NB Commitments or FSCA history (5 points) - tracked for compliance
  const commitments = dossier.regulatoryHistory?.nbCommitments as any[] || [];
  const fscas = dossier.regulatoryHistory?.fscaHistory as any[] || [];
  if (commitments.length > 0 || fscas.length > 0) {
    regulatoryHistory.score += 5;
  } else {
    // No penalty if none exist - absence is acceptable
    regulatoryHistory.score += 5;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIOR PSURs (10 points max)
  // ═══════════════════════════════════════════════════════════════════════════
  const priorPsurs = { score: 0, max: 10, missing: [] as string[] };

  // Prior PSUR record (10 points) - for non-new devices, must have prior PSUR data
  const priorPsurRecords = dossier.priorPsurs || [];
  if (priorPsurRecords.length > 0) {
    const validPsurs = priorPsurRecords.filter(p =>
      p.periodStart && p.periodEnd && isValidText(p.benefitRiskConclusion, 10)
    );
    if (validPsurs.length > 0) {
      priorPsurs.score += 10;
    } else {
      priorPsurs.score += 5; // Partial credit for having records but incomplete
      priorPsurs.missing.push("Prior PSUR needs benefit-risk conclusion");
    }
  } else {
    // Check market entry date - if device is new (< 2 years), no prior PSUR expected
    const marketEntry = dossier.core.marketEntryDate;
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    if (marketEntry && new Date(marketEntry) > twoYearsAgo) {
      priorPsurs.score += 10; // New device, no prior PSUR expected
    } else {
      priorPsurs.missing.push("Prior PSUR data (period, conclusion, key findings)");
      recommendations.push("Add prior PSUR data or confirm this is the first PSUR");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BASELINES (5 points max)
  // ═══════════════════════════════════════════════════════════════════════════
  const baselines = { score: 0, max: 5, missing: [] as string[] };

  // Performance baselines (5 points) - at least 1 baseline with value and methodology
  const baselineRecords = dossier.baselines || [];
  const validBaselines = baselineRecords.filter(b =>
    isValidText(b.metricType, 3) &&
    isValidText(b.value, 1) &&
    b.periodStart && b.periodEnd
  );
  if (validBaselines.length >= 2) {
    baselines.score += 5;
  } else if (validBaselines.length === 1) {
    baselines.score += 3;
    baselines.missing.push("Additional baselines (complaint rate, incident rate, etc.)");
  } else {
    baselines.missing.push("Performance baselines (metric type, value, period)");
    recommendations.push("Add baseline metrics for trend analysis");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOTAL SCORE
  // ═══════════════════════════════════════════════════════════════════════════
  const totalScore =
    identity.score +
    clinicalContext.score +
    riskContext.score +
    clinicalEvidence.score +
    regulatoryHistory.score +
    priorPsurs.score +
    baselines.score;

  return {
    score: totalScore,
    maxScore: 100,
    percentage: Math.round(totalScore),
    categories: {
      identity,
      clinicalContext,
      riskContext,
      clinicalEvidence,
      regulatoryHistory,
      priorPsurs,
      baselines,
    },
    criticalMissing,
    recommendations,
  };
}

/**
 * Helper to check if text is valid with minimum length
 */
function isValidText(value: any, minLength: number = 1): boolean {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  return text.length >= minLength;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-POPULATE (LLM EXTRACTOR → DOSSIER)
// ═══════════════════════════════════════════════════════════════════════════════

export interface AutoPopulateEvidenceItem {
  evidenceType: string;
  confidence?: number;
  data: Record<string, any>;
  sourceName?: string;
  sourceFile?: string;
}

export interface AutoPopulateOptions {
  overwrite?: boolean; // default: false (only fill missing)
  useLLMInference?: boolean; // default: true (infer dossier patch from extracted evidence)
}

export interface AutoPopulateResult {
  deviceCode: string;
  overwrite: boolean;
  evidenceItemsProcessed: number;
  evidenceTypesUsed: Record<string, number>;
  applied: {
    core: boolean;
    clinicalContext: boolean;
    riskContext: boolean;
    clinicalEvidence: boolean;
    regulatoryHistory: boolean;
    priorPsursAdded: number;
    priorPsursUpdated: number;
  };
  filledFields: string[];
  warnings: string[];
  llmInference?: {
    attempted: boolean;
    applied: boolean;
    provider?: string;
    model?: string;
    latencyMs?: number;
    filledFields?: string[];
    warnings?: string[];
    error?: string;
  };
}

function asString(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function asStringArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(asString).filter(Boolean) as string[];
  const s = asString(v);
  if (!s) return [];
  // Common delimiters in extracted text
  return s
    .split(/\r?\n|;|•|\u2022|\t/)
    .map(x => x.trim())
    .filter(Boolean);
}

function mergeString(existing: any, incoming: any, overwrite: boolean): string | null {
  const inc = asString(incoming);
  if (!inc) return asString(existing);
  if (overwrite) return inc;
  const ex = asString(existing);
  return ex || inc;
}

function mergeStringArray(existing: any, incoming: any, overwrite: boolean): string[] {
  const incArr = asStringArray(incoming);
  const exArr = asStringArray(existing);
  if (overwrite) return incArr.length ? incArr : exArr;
  const set = new Set<string>(exArr);
  for (const s of incArr) set.add(s);
  return Array.from(set);
}

/**
 * Merge arrays of objects by a unique ID field.
 * Useful for clinicalBenefits, principalRisks, etc.
 */
function mergeArrayById<T extends Record<string, any>>(
  existing: T[],
  incoming: T[],
  idField: string,
  overwrite: boolean
): T[] {
  if (!existing?.length && !incoming?.length) return [];
  if (overwrite && incoming?.length) return incoming;

  const exArr = Array.isArray(existing) ? existing : [];
  const incArr = Array.isArray(incoming) ? incoming : [];

  const idMap = new Map<string, T>();

  // Add existing items
  for (const item of exArr) {
    const id = item[idField] || `auto_${idMap.size}`;
    idMap.set(id, item);
  }

  // Merge incoming items
  for (const item of incArr) {
    const id = item[idField] || `auto_${idMap.size}`;
    if (idMap.has(id) && !overwrite) {
      // Merge fields from incoming into existing
      const existingItem = idMap.get(id)!;
      idMap.set(id, { ...existingItem, ...item });
    } else {
      idMap.set(id, item);
    }
  }

  return Array.from(idMap.values());
}

function normalizeRiskClass(v: any): "I" | "IIa" | "IIb" | "III" | null {
  const s = asString(v);
  if (!s) return null;
  const normalized = s.replace(/\s+/g, "").toUpperCase();
  if (normalized === "I") return "I";
  if (normalized === "IIA") return "IIa";
  if (normalized === "IIB") return "IIb";
  if (normalized === "III") return "III";
  return null;
}

function normalizeEquivalenceType(v: any): "Technical" | "Biological" | "Clinical" {
  const s = asString(v);
  if (!s) return "Technical";
  const normalized = s.toLowerCase().trim();
  if (normalized.includes("biolog")) return "Biological";
  if (normalized.includes("clinic")) return "Clinical";
  return "Technical";
}

function normalizeSeverity(v: any): "Negligible" | "Minor" | "Serious" | "Critical" | "Catastrophic" {
  const s = asString(v);
  if (!s) return "Serious";
  const normalized = s.toLowerCase().trim();
  if (normalized.includes("negligible") || normalized.includes("minimal")) return "Negligible";
  if (normalized.includes("minor") || normalized.includes("low")) return "Minor";
  if (normalized.includes("catastrophic") || normalized.includes("death") || normalized.includes("fatal")) return "Catastrophic";
  if (normalized.includes("critical") || normalized.includes("severe") || normalized.includes("high")) return "Critical";
  if (normalized.includes("serious") || normalized.includes("moderate") || normalized.includes("medium")) return "Serious";
  return "Serious";
}

function safeDateString(v: any): string | null {
  const s = asString(v);
  if (!s) return null;
  // accept YYYY-MM-DD or ISO; attempt parse
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function pickBestByConfidence(items: AutoPopulateEvidenceItem[]): AutoPopulateEvidenceItem | null {
  if (items.length === 0) return null;
  return [...items].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0] || null;
}

// -------------------------
// LLM-based inference of dossier fields from extracted evidence
// -------------------------

const DossierInferenceSchema = z.object({
  core: z.object({
    tradeName: z.string().min(1).optional(),
    manufacturerName: z.string().min(1).optional(),
    basicUdiDi: z.string().min(1).optional(),
    classification: z.object({
      class: z.enum(["I", "IIa", "IIb", "III"]),
      rule: z.string().optional(),
      rationale: z.string().optional(),
    }).optional(),
    marketEntryDate: z.string().optional(), // YYYY-MM-DD
  }).optional(),
  clinicalContext: z.object({
    intendedPurpose: z.string().optional(),
    indications: z.array(z.string()).optional(),
    contraindications: z.array(z.string()).optional(),
    targetPopulation: z.object({
      description: z.string(),
      ageRange: z.object({ min: z.number(), max: z.number() }).optional(),
      conditions: z.array(z.string()),
      excludedPopulations: z.array(z.string()),
    }).optional(),
    clinicalBenefits: z.array(z.object({
      benefitId: z.string().min(1),
      description: z.string().min(1),
      endpoint: z.string().min(1),
      evidenceSource: z.string().min(1),
      quantifiedValue: z.string().optional(),
    })).optional(),
    alternativeTreatments: z.array(z.string()).optional(),
    stateOfTheArt: z.object({
      description: z.string(),
      benchmarkDevices: z.array(z.string()),
      performanceThresholds: z.record(z.number()),
    }).optional(),
  }).optional(),
  riskContext: z.object({
    principalRisks: z.array(z.object({
      riskId: z.string().min(1),
      hazard: z.string().min(1),
      harm: z.string().min(1),
      severity: z.enum(["Negligible", "Minor", "Serious", "Critical", "Catastrophic"]),
      probability: z.string(),
      preMarketOccurrenceRate: z.number().optional(),
      mitigations: z.array(z.string()),
      residualRiskAcceptable: z.boolean(),
    })).optional(),
    residualRiskAcceptability: z.object({
      criteria: z.string(),
      afapAnalysisSummary: z.string(),
    }).optional(),
    riskThresholds: z.object({
      complaintRateThreshold: z.number(),
      seriousIncidentThreshold: z.number(),
      signalDetectionMethod: z.string(),
    }).optional(),
    hazardCategories: z.array(z.string()).optional(),
  }).optional(),
  clinicalEvidence: z.object({
    cerConclusions: z.object({
      lastUpdateDate: z.string(),
      benefitRiskConclusion: z.string(),
      keyFindings: z.array(z.string()),
      dataGapsIdentified: z.array(z.string()),
    }).optional(),
    pmcfPlan: z.object({
      objectives: z.array(z.string()),
      endpoints: z.array(z.object({
        endpointId: z.string(),
        description: z.string(),
        targetValue: z.string().optional(),
        measurementMethod: z.string().optional(),
      })).optional(),
      targetEnrollment: z.number().optional(),
      currentStatus: z.string(),
      studyIds: z.array(z.string()).optional(),
    }).optional(),
    literatureSearchProtocol: z.object({
      databases: z.array(z.string()),
      searchStrings: z.array(z.string()),
      inclusionCriteria: z.array(z.string()),
      exclusionCriteria: z.array(z.string()),
      lastSearchDate: z.string(),
    }).optional(),
    externalDbSearchProtocol: z.object({
      databases: z.array(z.string()),
      queryTerms: z.array(z.string()),
      dateRange: z.string().optional(),
      lastSearchDate: z.string(),
      relevanceCriteria: z.array(z.string()),
    }).optional(),
  }).optional(),
  regulatoryHistory: z.object({
    certificates: z.array(z.object({
      certificateId: z.string(),
      type: z.string(),
      notifiedBody: z.string(),
      issueDate: z.string(),
      expiryDate: z.string(),
      scope: z.string(),
      status: z.enum(["Active", "Expired", "Suspended", "Withdrawn"]),
    })).optional(),
    nbCommitments: z.array(z.object({
      commitmentId: z.string(),
      description: z.string(),
      source: z.string(),
      dueDate: z.string().optional(),
      status: z.enum(["Open", "In Progress", "Completed", "Overdue"]),
      completedDate: z.string().optional(),
      evidence: z.string().optional(),
    })).optional(),
    fscaHistory: z.array(z.object({
      fscaId: z.string(),
      type: z.string(),
      initiationDate: z.string(),
      description: z.string(),
      affectedUnits: z.number().optional(),
      regions: z.array(z.string()),
      status: z.enum(["Active", "Completed"]),
      completionDate: z.string().optional(),
    })).optional(),
    designChanges: z.array(z.object({
      changeId: z.string(),
      description: z.string(),
      effectiveDate: z.string(),
      type: z.string(),
      significance: z.enum(["Significant", "Non-Significant"]),
      regulatoryImpact: z.string(),
    })).optional(),
  }).optional(),
}).strict();

type DossierInference = z.infer<typeof DossierInferenceSchema>;

async function inferDossierPatchFromEvidence(
  deviceCode: string,
  evidence: AutoPopulateEvidenceItem[]
): Promise<{ patch: DossierInference; provider: string; model: string; latencyMs: number }> {
  const evidenceBrief = evidence.slice(0, 120).map(e => ({
    evidenceType: e.evidenceType,
    confidence: e.confidence ?? null,
    sourceFile: e.sourceFile ?? null,
    sourceName: e.sourceName ?? null,
    data: e.data,
  }));

  const { data, response } = await completeJSON<DossierInference>(
    {
      agentId: "DeviceDossierInference",
      traceContext: { operation: "dossier_auto_populate_infer" },
      config: {
        provider: "auto",
        model: "gpt-4o",
        temperature: 0.0,
        maxTokens: 4096,
        timeout: 120000,
      },
      messages: [
        {
          role: "system",
          content:
            "You are a medical device regulatory data extraction specialist. " +
            "You must ONLY infer dossier fields from the provided extracted evidence items. " +
            "DO NOT invent values. If a field is not supported by evidence, omit it. " +
            "Prefer verbatim phrasing where possible. Output valid JSON only.",
        },
        {
          role: "user",
          content:
            `Device code: ${deviceCode}\n\n` +
            "Extracted evidence items (structured):\n" +
            JSON.stringify(evidenceBrief, null, 2) +
            "\n\nExtract every dossier field that has support in the evidence. Return a JSON object with optional sections:\n" +
            "core: tradeName, manufacturerName, basicUdiDi, classification { class (I|IIa|IIb|III), rule, rationale }, marketEntryDate (YYYY-MM-DD).\n" +
            "clinicalContext: intendedPurpose, indications[], contraindications[], targetPopulation { description, ageRange { min, max }, conditions[], excludedPopulations[] }, clinicalBenefits[] { benefitId, description, endpoint, evidenceSource, quantifiedValue }, alternativeTreatments[], stateOfTheArt { description, benchmarkDevices[], performanceThresholds{} }.\n" +
            "riskContext: principalRisks[] { riskId, hazard, harm, severity (Negligible|Minor|Serious|Critical|Catastrophic), probability, preMarketOccurrenceRate, mitigations[], residualRiskAcceptable }, residualRiskAcceptability { criteria, afapAnalysisSummary }, riskThresholds { complaintRateThreshold, seriousIncidentThreshold, signalDetectionMethod }, hazardCategories[].\n" +
            "clinicalEvidence: cerConclusions { lastUpdateDate, benefitRiskConclusion, keyFindings[], dataGapsIdentified[] }, pmcfPlan { objectives[], endpoints[] { endpointId, description, targetValue, measurementMethod }, targetEnrollment, currentStatus, studyIds[] }, literatureSearchProtocol { databases[], searchStrings[], inclusionCriteria[], exclusionCriteria[], lastSearchDate }, externalDbSearchProtocol { databases[], queryTerms[], dateRange, lastSearchDate, relevanceCriteria[] }.\n" +
            "regulatoryHistory: certificates[] { certificateId, type, notifiedBody, issueDate, expiryDate, scope, status (Active|Expired|Suspended|Withdrawn) }, nbCommitments[] { commitmentId, description, source, dueDate, status (Open|In Progress|Completed|Overdue), completedDate, evidence }, fscaHistory[] { fscaId, type, initiationDate, description, affectedUnits, regions[], status (Active|Completed), completionDate }, designChanges[] { changeId, description, effectiveDate, type, significance (Significant|Non-Significant), regulatoryImpact }.\n" +
            "Rules: Never hallucinate. If not present, omit. Use YYYY-MM-DD for dates. Infer only from explicit evidence.\n",
        },
      ],
    },
    (v): v is DossierInference => DossierInferenceSchema.safeParse(v).success
  );

  return { patch: data, provider: response.provider, model: response.model, latencyMs: response.latencyMs };
}

async function applyInferredPatchToDossier(
  deviceCode: string,
  patch: DossierInference,
  overwrite: boolean
): Promise<{ applied: boolean; filledFields: string[]; warnings: string[] }> {
  const filledFields: string[] = [];
  const warnings: string[] = [];

  const dossier = await getFullDossier(deviceCode);
  if (!dossier) throw new Error(`Dossier not found for deviceCode=${deviceCode}`);

  let applied = false;

  // Core
  if (patch.core) {
    const coreUpdates: Partial<InsertDeviceDossier> = {};
    const nextTradeName = mergeString(dossier.core.tradeName, patch.core.tradeName, overwrite);
    if (nextTradeName && nextTradeName !== dossier.core.tradeName) {
      coreUpdates.tradeName = nextTradeName;
      filledFields.push("core.tradeName");
    }
    const nextManufacturer = mergeString(dossier.core.manufacturerName, patch.core.manufacturerName, overwrite);
    if (nextManufacturer && nextManufacturer !== dossier.core.manufacturerName) {
      coreUpdates.manufacturerName = nextManufacturer;
      filledFields.push("core.manufacturerName");
    }
    const nextUdi = mergeString(dossier.core.basicUdiDi, patch.core.basicUdiDi, overwrite);
    if (nextUdi && nextUdi !== dossier.core.basicUdiDi) {
      coreUpdates.basicUdiDi = nextUdi;
      filledFields.push("core.basicUdiDi");
    }
    if (patch.core.classification && (overwrite || !dossier.core.classification)) {
      coreUpdates.classification = {
        class: patch.core.classification.class,
        rule: patch.core.classification.rule || (dossier.core.classification as any)?.rule || "",
        rationale: patch.core.classification.rationale || (dossier.core.classification as any)?.rationale || "",
      } as any;
      filledFields.push("core.classification");
    }
    const dateStr = safeDateString(patch.core.marketEntryDate);
    if (dateStr && (overwrite || !dossier.core.marketEntryDate)) {
      coreUpdates.marketEntryDate = new Date(dateStr) as any;
      filledFields.push("core.marketEntryDate");
    }
    if (Object.keys(coreUpdates).length) {
      await updateDossier(deviceCode, coreUpdates);
      applied = true;
    }
  }

  // Clinical context
  if (patch.clinicalContext) {
    const existing = dossier.clinicalContext;
    const next: any = {
      intendedPurpose: existing?.intendedPurpose || "",
      indications: existing?.indications || [],
      contraindications: existing?.contraindications || [],
      targetPopulation: existing?.targetPopulation,
      clinicalBenefits: existing?.clinicalBenefits || [],
      alternativeTreatments: existing?.alternativeTreatments || [],
      stateOfTheArt: existing?.stateOfTheArt,
    };

    next.intendedPurpose = mergeString(next.intendedPurpose, patch.clinicalContext.intendedPurpose, overwrite) || next.intendedPurpose;
    next.indications = mergeStringArray(next.indications, patch.clinicalContext.indications, overwrite);
    next.contraindications = mergeStringArray(next.contraindications, patch.clinicalContext.contraindications, overwrite);
    if (patch.clinicalContext.targetPopulation && (overwrite || !next.targetPopulation)) {
      next.targetPopulation = patch.clinicalContext.targetPopulation as any;
    }
    if (patch.clinicalContext.clinicalBenefits && (overwrite || !(next.clinicalBenefits as any[])?.length)) {
      next.clinicalBenefits = patch.clinicalContext.clinicalBenefits as any;
    }
    next.alternativeTreatments = mergeStringArray(next.alternativeTreatments, patch.clinicalContext.alternativeTreatments, overwrite);
    if (patch.clinicalContext.stateOfTheArt && (overwrite || !next.stateOfTheArt)) {
      next.stateOfTheArt = patch.clinicalContext.stateOfTheArt as any;
    }

    if (asString(next.intendedPurpose) && JSON.stringify(next) !== JSON.stringify(existing || {})) {
      await upsertClinicalContext(deviceCode, { ...next, intendedPurpose: next.intendedPurpose });
      applied = true;
      if (patch.clinicalContext.clinicalBenefits?.length) filledFields.push("clinical.clinicalBenefits");
      if (patch.clinicalContext.stateOfTheArt) filledFields.push("clinical.stateOfTheArt");
    } else if (!asString(next.intendedPurpose)) {
      warnings.push("LLM inference did not produce clinical intended purpose; cannot upsert clinical context without it.");
    }
  }

  // Risk context
  if (patch.riskContext) {
    const existing = dossier.riskContext;
    const next: any = {
      principalRisks: existing?.principalRisks || [],
      residualRiskAcceptability: existing?.residualRiskAcceptability || { criteria: "", afapAnalysisSummary: "" },
      riskThresholds: existing?.riskThresholds,
      hazardCategories: existing?.hazardCategories || [],
    };

    if (patch.riskContext.principalRisks && (overwrite || !(next.principalRisks as any[])?.length)) {
      next.principalRisks = patch.riskContext.principalRisks as any;
      filledFields.push("risk.principalRisks");
    }
    if (patch.riskContext.residualRiskAcceptability && (overwrite || !existing?.residualRiskAcceptability)) {
      next.residualRiskAcceptability = patch.riskContext.residualRiskAcceptability as any;
      filledFields.push("risk.residualRiskAcceptability");
    }
    if (patch.riskContext.riskThresholds && (overwrite || !existing?.riskThresholds)) {
      next.riskThresholds = patch.riskContext.riskThresholds as any;
      filledFields.push("risk.riskThresholds");
    }
    next.hazardCategories = mergeStringArray(next.hazardCategories, patch.riskContext.hazardCategories, overwrite);

    if (JSON.stringify(next) !== JSON.stringify(existing || {})) {
      await upsertRiskContext(deviceCode, next);
      applied = true;
    }
  }

  // Clinical evidence
  if (patch.clinicalEvidence) {
    const existing = dossier.clinicalEvidence;
    const next: any = {
      cerConclusions: existing?.cerConclusions,
      pmcfPlan: existing?.pmcfPlan,
      literatureSearchProtocol: existing?.literatureSearchProtocol,
      externalDbSearchProtocol: existing?.externalDbSearchProtocol,
      equivalentDevices: existing?.equivalentDevices,
    };

    if (patch.clinicalEvidence.cerConclusions && (overwrite || !next.cerConclusions)) {
      next.cerConclusions = patch.clinicalEvidence.cerConclusions as any;
      filledFields.push("clinicalEvidence.cerConclusions");
    }
    if (patch.clinicalEvidence.pmcfPlan && (overwrite || !next.pmcfPlan)) {
      next.pmcfPlan = patch.clinicalEvidence.pmcfPlan as any;
      filledFields.push("clinicalEvidence.pmcfPlan");
    }
    if (patch.clinicalEvidence.literatureSearchProtocol && (overwrite || !next.literatureSearchProtocol)) {
      next.literatureSearchProtocol = patch.clinicalEvidence.literatureSearchProtocol as any;
      filledFields.push("clinicalEvidence.literatureSearchProtocol");
    }
    if (patch.clinicalEvidence.externalDbSearchProtocol && (overwrite || !next.externalDbSearchProtocol)) {
      next.externalDbSearchProtocol = patch.clinicalEvidence.externalDbSearchProtocol as any;
      filledFields.push("clinicalEvidence.externalDbSearchProtocol");
    }

    if (JSON.stringify(next) !== JSON.stringify(existing || {})) {
      await upsertClinicalEvidence(deviceCode, next);
      applied = true;
    }
  }

  // Regulatory history
  if (patch.regulatoryHistory) {
    const existing = dossier.regulatoryHistory;
    const next: any = {
      certificates: existing?.certificates || [],
      nbCommitments: existing?.nbCommitments || [],
      fscaHistory: existing?.fscaHistory || [],
      designChanges: existing?.designChanges || [],
    };

    if (patch.regulatoryHistory.certificates && (overwrite || !(next.certificates as any[])?.length)) {
      next.certificates = patch.regulatoryHistory.certificates as any;
      filledFields.push("regulatory.certificates");
    }
    if (patch.regulatoryHistory.nbCommitments && (overwrite || !(next.nbCommitments as any[])?.length)) {
      next.nbCommitments = patch.regulatoryHistory.nbCommitments as any;
      filledFields.push("regulatory.nbCommitments");
    }
    if (patch.regulatoryHistory.fscaHistory && (overwrite || !(next.fscaHistory as any[])?.length)) {
      next.fscaHistory = patch.regulatoryHistory.fscaHistory as any;
      filledFields.push("regulatory.fscaHistory");
    }
    if (patch.regulatoryHistory.designChanges && (overwrite || !(next.designChanges as any[])?.length)) {
      next.designChanges = patch.regulatoryHistory.designChanges as any;
      filledFields.push("regulatory.designChanges");
    }

    if (JSON.stringify(next) !== JSON.stringify(existing || {})) {
      await upsertRegulatoryHistory(deviceCode, next);
      applied = true;
    }
  }

  return { applied, filledFields: Array.from(new Set(filledFields)), warnings: Array.from(new Set(warnings)) };
}

export async function autoPopulateDossierFromEvidence(
  deviceCode: string,
  evidence: AutoPopulateEvidenceItem[],
  options: AutoPopulateOptions = {}
): Promise<AutoPopulateResult> {
  const overwrite = options.overwrite === true;
  const useLLMInference = options.useLLMInference !== false;

  const dossier = await getFullDossier(deviceCode);
  if (!dossier) {
    throw new Error(`Dossier not found for deviceCode=${deviceCode}`);
  }

  const evidenceTypesUsed: Record<string, number> = {};
  for (const e of evidence) {
    evidenceTypesUsed[e.evidenceType] = (evidenceTypesUsed[e.evidenceType] || 0) + 1;
  }

  const filledFields: string[] = [];
  const warnings: string[] = [];

  // Group evidence by type
  const byType = new Map<string, AutoPopulateEvidenceItem[]>();
  for (const e of evidence) {
    const arr = byType.get(e.evidenceType) || [];
    arr.push(e);
    byType.set(e.evidenceType, arr);
  }

  // -------------------------
  // CORE (device_dossiers)
  // -------------------------
  const coreUpdates: Partial<InsertDeviceDossier> = {};

  const deviceRegistry = pickBestByConfidence(byType.get("device_registry_record") || []);
  const manufacturerProfile = pickBestByConfidence(byType.get("manufacturer_profile") || []);

  if (deviceRegistry?.data) {
    const tradeName =
      deviceRegistry.data.device_name ??
      deviceRegistry.data.deviceName ??
      deviceRegistry.data.trade_name ??
      deviceRegistry.data.tradeName;
    const manufacturer =
      deviceRegistry.data.manufacturer ??
      deviceRegistry.data.manufacturer_name ??
      deviceRegistry.data.manufacturerName;
    const udi =
      deviceRegistry.data.udi_di ??
      deviceRegistry.data.udiDi ??
      deviceRegistry.data.basic_udi_di ??
      deviceRegistry.data.basicUdiDi;
    const riskClass =
      deviceRegistry.data.risk_class ??
      deviceRegistry.data.riskClass ??
      deviceRegistry.data.classification;

    const mergedTradeName = mergeString(dossier.core.tradeName, tradeName, overwrite);
    if (mergedTradeName && mergedTradeName !== dossier.core.tradeName) {
      coreUpdates.tradeName = mergedTradeName;
      filledFields.push("core.tradeName");
    }

    const mergedManufacturer = mergeString(dossier.core.manufacturerName, manufacturer, overwrite);
    if (mergedManufacturer && mergedManufacturer !== dossier.core.manufacturerName) {
      coreUpdates.manufacturerName = mergedManufacturer;
      filledFields.push("core.manufacturerName");
    }

    const mergedUdi = mergeString(dossier.core.basicUdiDi, udi, overwrite);
    if (mergedUdi && mergedUdi !== dossier.core.basicUdiDi) {
      coreUpdates.basicUdiDi = mergedUdi;
      filledFields.push("core.basicUdiDi");
    }

    const cls = normalizeRiskClass(riskClass);
    if (cls) {
      const existing = dossier.core.classification as any;
      const next = overwrite
        ? { class: cls, rule: existing?.rule || "", rationale: existing?.rationale || "" }
        : (existing?.class ? existing : { class: cls, rule: "", rationale: "" });
      if (!existing?.class || overwrite) {
        coreUpdates.classification = next as any;
        filledFields.push("core.classification.class");
      }
    }
  }

  if (manufacturerProfile?.data) {
    const manufacturer =
      manufacturerProfile.data.manufacturer_name ??
      manufacturerProfile.data.manufacturerName ??
      manufacturerProfile.data.name;
    const mergedManufacturer = mergeString(dossier.core.manufacturerName, manufacturer, overwrite);
    if (mergedManufacturer && mergedManufacturer !== dossier.core.manufacturerName) {
      coreUpdates.manufacturerName = mergedManufacturer;
      filledFields.push("core.manufacturerName");
    }
  }

  const coreApplied = Object.keys(coreUpdates).length > 0;
  if (coreApplied) {
    await updateDossier(deviceCode, coreUpdates);
  }

  // -------------------------
  // CLINICAL CONTEXT (with comprehensive fallback chains)
  // -------------------------
  const existingClinical = dossier.clinicalContext;

  // Gather all potential sources with fallback priority
  const ifu = pickBestByConfidence(byType.get("ifu_extract") || []);
  const clinicalEvalForClinical = pickBestByConfidence(byType.get("clinical_evaluation_extract") || []);
  const braForClinical = pickBestByConfidence(byType.get("benefit_risk_assessment") || []);
  const cerExtract = pickBestByConfidence(byType.get("cer_extract") || []);
  const deviceRegForClinical = pickBestByConfidence(byType.get("device_registry_record") || []);

  const clinicalUpdate: any = {};
  if (existingClinical) {
    clinicalUpdate.intendedPurpose = existingClinical.intendedPurpose;
    clinicalUpdate.indications = existingClinical.indications;
    clinicalUpdate.contraindications = existingClinical.contraindications;
    clinicalUpdate.targetPopulation = existingClinical.targetPopulation;
    clinicalUpdate.clinicalBenefits = existingClinical.clinicalBenefits;
    clinicalUpdate.alternativeTreatments = existingClinical.alternativeTreatments;
    clinicalUpdate.stateOfTheArt = existingClinical.stateOfTheArt;
  } else {
    clinicalUpdate.intendedPurpose = "";
    clinicalUpdate.indications = [];
    clinicalUpdate.contraindications = [];
    clinicalUpdate.targetPopulation = undefined;
    clinicalUpdate.clinicalBenefits = [];
    clinicalUpdate.alternativeTreatments = [];
    clinicalUpdate.stateOfTheArt = undefined;
  }

  // === INTENDED PURPOSE (fallback chain: IFU -> CER/CE extract -> device registry) ===
  const intendedPurposeSources = [ifu?.data, clinicalEvalForClinical?.data, cerExtract?.data, deviceRegForClinical?.data].filter(Boolean);
  for (const source of intendedPurposeSources) {
    const extracted = getStringField(source, "intendedPurpose");
    if (extracted && (!clinicalUpdate.intendedPurpose || overwrite)) {
      clinicalUpdate.intendedPurpose = extracted;
      filledFields.push("clinical.intendedPurpose");
      break;
    }
  }

  // === INDICATIONS (fallback chain: IFU -> CE extract -> CER extract) ===
  const indicationsSources = [ifu?.data, clinicalEvalForClinical?.data, cerExtract?.data].filter(Boolean);
  for (const source of indicationsSources) {
    const extracted = getArrayField(source, "indications");
    if (extracted.length && (!clinicalUpdate.indications?.length || overwrite)) {
      clinicalUpdate.indications = mergeStringArray(clinicalUpdate.indications || [], extracted, overwrite);
      filledFields.push("clinical.indications");
      break;
    }
  }

  // === CONTRAINDICATIONS (fallback chain: IFU -> CE extract) ===
  const contraSources = [ifu?.data, clinicalEvalForClinical?.data].filter(Boolean);
  for (const source of contraSources) {
    const extracted = getArrayField(source, "contraindications");
    if (extracted.length && (!clinicalUpdate.contraindications?.length || overwrite)) {
      clinicalUpdate.contraindications = mergeStringArray(clinicalUpdate.contraindications || [], extracted, overwrite);
      filledFields.push("clinical.contraindications");
      break;
    }
  }

  // === TARGET POPULATION (fallback chain: IFU -> CE extract -> device registry) ===
  const targetPopSources = [ifu?.data, clinicalEvalForClinical?.data, deviceRegForClinical?.data].filter(Boolean);
  for (const source of targetPopSources) {
    const extracted = getField(source, "targetPopulation");
    if (extracted && (!clinicalUpdate.targetPopulation || overwrite)) {
      // Handle both string and object formats
      if (typeof extracted === "string") {
        clinicalUpdate.targetPopulation = {
          description: extracted,
          conditions: [],
          excludedPopulations: [],
        };
      } else if (typeof extracted === "object") {
        clinicalUpdate.targetPopulation = {
          description: extracted.description || extracted.population || "",
          ageRange: extracted.ageRange || extracted.age_range,
          conditions: getArrayField(extracted, "conditions") || [],
          excludedPopulations: getArrayField(extracted, "excludedPopulations") || [],
        };
      }
      if (clinicalUpdate.targetPopulation?.description) {
        filledFields.push("clinical.targetPopulation");
      }
      break;
    }
  }

  // === CLINICAL BENEFITS (fallback chain: CE extract -> B-R assessment -> CER extract) ===
  const benefitsSources = [clinicalEvalForClinical?.data, braForClinical?.data, cerExtract?.data].filter(Boolean);
  for (const source of benefitsSources) {
    const extracted = getField(source, "clinicalBenefits");
    const benefitDesc = getStringField(source, "clinicalBenefit") || getStringField(source, "benefit");
    const benefitsSummary = getStringField(source, "benefitsSummary");

    if (Array.isArray(extracted) && extracted.length) {
      // Already structured array
      clinicalUpdate.clinicalBenefits = mergeArrayById(
        clinicalUpdate.clinicalBenefits || [],
        extracted.map((b: any, idx: number) => ({
          benefitId: b.benefitId || b.benefit_id || `benefit_${idx + 1}`,
          description: b.description || b.benefit || "",
          endpoint: b.endpoint || b.clinical_endpoint || "",
          evidenceSource: b.evidenceSource || b.evidence_source || b.source || "",
          quantifiedValue: b.quantifiedValue || b.quantified_value || b.value || undefined,
        })),
        "benefitId",
        overwrite
      );
      if (clinicalUpdate.clinicalBenefits.length) {
        filledFields.push("clinical.clinicalBenefits");
      }
      break;
    } else if (benefitDesc || benefitsSummary) {
      // Single benefit description - convert to structured format
      const newBenefit = {
        benefitId: `benefit_${Date.now()}`,
        description: benefitDesc || benefitsSummary || "",
        endpoint: getStringField(source, "endpoint") || "",
        evidenceSource: getStringField(source, "evidenceSource") || "CER extraction",
        quantifiedValue: getStringField(source, "quantifiedValue"),
      };
      if (!clinicalUpdate.clinicalBenefits?.length || overwrite) {
        clinicalUpdate.clinicalBenefits = [newBenefit];
        filledFields.push("clinical.clinicalBenefits");
      }
      break;
    }
  }

  // === ALTERNATIVE TREATMENTS (fallback chain: CE extract -> CER extract) ===
  const altTreatmentSources = [clinicalEvalForClinical?.data, cerExtract?.data].filter(Boolean);
  for (const source of altTreatmentSources) {
    const extracted = getArrayField(source, "alternativeTreatments");
    const comparison = getStringField(source, "comparisonToAlternatives");

    if (extracted.length && (!clinicalUpdate.alternativeTreatments?.length || overwrite)) {
      clinicalUpdate.alternativeTreatments = mergeStringArray(clinicalUpdate.alternativeTreatments || [], extracted, overwrite);
      filledFields.push("clinical.alternativeTreatments");
      break;
    } else if (comparison && (!clinicalUpdate.alternativeTreatments?.length || overwrite)) {
      // Parse alternatives from comparison text
      clinicalUpdate.alternativeTreatments = [comparison];
      filledFields.push("clinical.alternativeTreatments");
      break;
    }
  }

  // === STATE OF THE ART (fallback chain: CE extract -> CER extract) ===
  const sotaSources = [clinicalEvalForClinical?.data, cerExtract?.data].filter(Boolean);
  for (const source of sotaSources) {
    const extracted = getField(source, "stateOfTheArt");
    const sotaDescription = getStringField(source, "stateOfTheArt") || getStringField(source, "sota");
    const benchmarkDevices = getArrayField(source, "benchmarkDevices");

    if (typeof extracted === "object" && extracted) {
      clinicalUpdate.stateOfTheArt = {
        description: extracted.description || "",
        benchmarkDevices: getArrayField(extracted, "benchmarkDevices") || [],
        performanceThresholds: extracted.performanceThresholds || {},
      };
      if (clinicalUpdate.stateOfTheArt.description) {
        filledFields.push("clinical.stateOfTheArt");
      }
      break;
    } else if (sotaDescription || benchmarkDevices.length) {
      clinicalUpdate.stateOfTheArt = {
        description: sotaDescription || "",
        benchmarkDevices: benchmarkDevices,
        performanceThresholds: {},
      };
      if (sotaDescription || benchmarkDevices.length) {
        filledFields.push("clinical.stateOfTheArt");
      }
      break;
    }
  }

  // Determine if clinical context was updated
  const clinicalHasMinimum = asString(clinicalUpdate.intendedPurpose) || existingClinical?.intendedPurpose;
  const clinicalApplied =
    asString(clinicalUpdate.intendedPurpose) !== asString(existingClinical?.intendedPurpose) ||
    JSON.stringify(clinicalUpdate.indications || []) !== JSON.stringify(existingClinical?.indications || []) ||
    JSON.stringify(clinicalUpdate.contraindications || []) !== JSON.stringify(existingClinical?.contraindications || []) ||
    JSON.stringify(clinicalUpdate.targetPopulation || null) !== JSON.stringify(existingClinical?.targetPopulation || null) ||
    JSON.stringify(clinicalUpdate.clinicalBenefits || []) !== JSON.stringify(existingClinical?.clinicalBenefits || []) ||
    JSON.stringify(clinicalUpdate.alternativeTreatments || []) !== JSON.stringify(existingClinical?.alternativeTreatments || []) ||
    JSON.stringify(clinicalUpdate.stateOfTheArt || null) !== JSON.stringify(existingClinical?.stateOfTheArt || null);

  if (clinicalApplied) {
    if (!clinicalHasMinimum) {
      warnings.push("Clinical Context: intended purpose could not be extracted from uploaded documents. Please provide manually or upload IFU.");
    } else {
      await upsertClinicalContext(deviceCode, {
        ...clinicalUpdate,
        intendedPurpose: (asString(clinicalUpdate.intendedPurpose) || existingClinical?.intendedPurpose || "") as string,
      });
    }
  }

  // -------------------------
  // RISK CONTEXT (with comprehensive fallback chains)
  // -------------------------
  const existingRisk = dossier.riskContext;

  // Gather all potential risk sources with fallback priority
  const riskAssessment = pickBestByConfidence(byType.get("risk_assessment") || []);
  const rmf = pickBestByConfidence(byType.get("rmf_extract") || []);
  const principalRiskExtract = byType.get("principal_risk_extract") || [];
  const riskThresholdExtract = pickBestByConfidence(byType.get("risk_threshold_extract") || []);
  const braForRisk = pickBestByConfidence(byType.get("benefit_risk_assessment") || []);

  const riskUpdate: any = {};
  if (existingRisk) {
    riskUpdate.principalRisks = existingRisk.principalRisks;
    riskUpdate.residualRiskAcceptability = existingRisk.residualRiskAcceptability;
    riskUpdate.riskThresholds = existingRisk.riskThresholds;
    riskUpdate.hazardCategories = existingRisk.hazardCategories;
  } else {
    riskUpdate.principalRisks = [];
    riskUpdate.residualRiskAcceptability = { criteria: "", afapAnalysisSummary: "" };
    riskUpdate.riskThresholds = { complaintRateThreshold: 0, seriousIncidentThreshold: 0, signalDetectionMethod: "" };
    riskUpdate.hazardCategories = [];
  }

  // === Process legacy risk sources (risk_assessment, rmf_extract) ===
  const legacyRiskSources = [riskAssessment, rmf].filter(Boolean) as AutoPopulateEvidenceItem[];
  for (const src of legacyRiskSources) {
    const d = src.data || {};

    // Hazard categories
    const hazards = getArrayField(d, "hazardCategories");
    if (hazards.length) {
      riskUpdate.hazardCategories = mergeStringArray(riskUpdate.hazardCategories, hazards, overwrite);
      if (riskUpdate.hazardCategories.length && (!existingRisk?.hazardCategories?.length || overwrite)) {
        filledFields.push("risk.hazardCategories");
      }
    }

    // Residual risk acceptability (criteria / AFAP)
    const criteria = getStringField(d, "riskAcceptability") || getStringField(d, "acceptabilityCriteria");
    const afap = getStringField(d, "afapAnalysisSummary");
    if (criteria || afap) {
      riskUpdate.residualRiskAcceptability = {
        criteria: mergeString(riskUpdate.residualRiskAcceptability?.criteria, criteria, overwrite) || "",
        afapAnalysisSummary: mergeString(riskUpdate.residualRiskAcceptability?.afapAnalysisSummary, afap, overwrite) || "",
      };
      if (asString(riskUpdate.residualRiskAcceptability.criteria) && (!existingRisk?.residualRiskAcceptability || overwrite)) {
        filledFields.push("risk.residualRiskAcceptability.criteria");
      }
    }

    // Thresholds (if present)
    const complaintRateThreshold = getNumberField(d, "complaintRateThreshold");
    const seriousIncidentThreshold = getNumberField(d, "seriousIncidentThreshold");
    const method = getStringField(d, "signalDetectionMethod");
    if (complaintRateThreshold !== undefined || seriousIncidentThreshold !== undefined || method !== undefined) {
      const next = {
        complaintRateThreshold: complaintRateThreshold ?? riskUpdate.riskThresholds?.complaintRateThreshold ?? 0,
        seriousIncidentThreshold: seriousIncidentThreshold ?? riskUpdate.riskThresholds?.seriousIncidentThreshold ?? 0,
        signalDetectionMethod: mergeString(riskUpdate.riskThresholds?.signalDetectionMethod, method, overwrite) || "",
      };
      if (overwrite || !existingRisk?.riskThresholds) {
        riskUpdate.riskThresholds = next;
        if (next.complaintRateThreshold || next.seriousIncidentThreshold || next.signalDetectionMethod) {
          filledFields.push("risk.riskThresholds");
        }
      }
    }

    // Principal risks from legacy sources
    const principalRisks = getField(d, "principalRisks");
    if (Array.isArray(principalRisks) && principalRisks.length) {
      if (overwrite || !(existingRisk?.principalRisks as any[])?.length) {
        riskUpdate.principalRisks = principalRisks.map((r: any, idx: number) => ({
          riskId: r.riskId || r.risk_id || `risk_${idx + 1}`,
          hazard: getStringField(r, "hazard") || r.hazard_description || "",
          harm: getStringField(r, "harm") || r.potential_harm || "",
          severity: normalizeSeverity(getStringField(r, "severity")),
          probability: getStringField(r, "probability") || "",
          preMarketOccurrenceRate: getNumberField(r, "preMarketOccurrenceRate"),
          mitigations: getArrayField(r, "mitigations"),
          residualRiskAcceptable: r.residualRiskAcceptable ?? r.acceptable ?? true,
        }));
        filledFields.push("risk.principalRisks");
      }
    }
  }

  // === Process new principal_risk_extract evidence (from CER Risk Analysis section) ===
  if (principalRiskExtract.length && (!riskUpdate.principalRisks?.length || overwrite)) {
    const extractedRisks = principalRiskExtract.map((ev, idx) => {
      const d = ev.data || {};
      return {
        riskId: getStringField(d, "riskId") || `risk_${idx + 1}`,
        hazard: getStringField(d, "hazard") || "",
        harm: getStringField(d, "harm") || "",
        severity: normalizeSeverity(getStringField(d, "severity")),
        probability: getStringField(d, "probability") || "",
        preMarketOccurrenceRate: getNumberField(d, "preMarketOccurrenceRate"),
        mitigations: getArrayField(d, "mitigations"),
        residualRiskAcceptable: d.residualRiskAcceptable ?? d.acceptable ?? true,
      };
    }).filter(r => r.hazard && r.harm); // Only include risks with both hazard and harm

    if (extractedRisks.length) {
      riskUpdate.principalRisks = mergeArrayById(
        riskUpdate.principalRisks || [],
        extractedRisks,
        "riskId",
        overwrite
      );
      filledFields.push("risk.principalRisks");
    }
  }

  // === Process risk_threshold_extract evidence ===
  if (riskThresholdExtract?.data) {
    const d = riskThresholdExtract.data;
    const complaintThreshold = getNumberField(d, "complaintRateThreshold");
    const incidentThreshold = getNumberField(d, "seriousIncidentThreshold");
    const method = getStringField(d, "signalDetectionMethod");
    const afap = getStringField(d, "afapAnalysisSummary");
    const criteria = getStringField(d, "acceptabilityCriteria");

    if (complaintThreshold !== undefined || incidentThreshold !== undefined || method) {
      const next = {
        complaintRateThreshold: complaintThreshold ?? riskUpdate.riskThresholds?.complaintRateThreshold ?? 0,
        seriousIncidentThreshold: incidentThreshold ?? riskUpdate.riskThresholds?.seriousIncidentThreshold ?? 0,
        signalDetectionMethod: mergeString(riskUpdate.riskThresholds?.signalDetectionMethod, method, overwrite) || "",
      };
      if (overwrite || !existingRisk?.riskThresholds?.complaintRateThreshold) {
        riskUpdate.riskThresholds = next;
        filledFields.push("risk.riskThresholds");
      }
    }

    if (criteria || afap) {
      riskUpdate.residualRiskAcceptability = {
        criteria: mergeString(riskUpdate.residualRiskAcceptability?.criteria, criteria, overwrite) || riskUpdate.residualRiskAcceptability?.criteria || "",
        afapAnalysisSummary: mergeString(riskUpdate.residualRiskAcceptability?.afapAnalysisSummary, afap, overwrite) || riskUpdate.residualRiskAcceptability?.afapAnalysisSummary || "",
      };
      if (criteria) filledFields.push("risk.residualRiskAcceptability.criteria");
      if (afap) filledFields.push("risk.residualRiskAcceptability.afapAnalysis");
    }
  }

  // === Fallback: Extract risk info from benefit_risk_assessment ===
  if (braForRisk?.data && (!riskUpdate.residualRiskAcceptability?.criteria || overwrite)) {
    const d = braForRisk.data;
    const risksSummary = getStringField(d, "risksSummary");
    const residualRisks = getArrayField(d, "residualRisks");
    const acceptability = getStringField(d, "acceptability");

    if (acceptability) {
      riskUpdate.residualRiskAcceptability = {
        criteria: mergeString(riskUpdate.residualRiskAcceptability?.criteria, acceptability, overwrite) || riskUpdate.residualRiskAcceptability?.criteria || "",
        afapAnalysisSummary: riskUpdate.residualRiskAcceptability?.afapAnalysisSummary || "",
      };
      filledFields.push("risk.residualRiskAcceptability.criteria");
    }
  }

  const riskApplied =
    JSON.stringify(riskUpdate.principalRisks || []) !== JSON.stringify(existingRisk?.principalRisks || []) ||
    JSON.stringify(riskUpdate.residualRiskAcceptability || {}) !== JSON.stringify(existingRisk?.residualRiskAcceptability || {}) ||
    JSON.stringify(riskUpdate.riskThresholds || {}) !== JSON.stringify(existingRisk?.riskThresholds || {}) ||
    JSON.stringify(riskUpdate.hazardCategories || []) !== JSON.stringify(existingRisk?.hazardCategories || []);

  if (riskApplied) {
    await upsertRiskContext(deviceCode, riskUpdate);
  }

  // -------------------------
  // CLINICAL EVIDENCE
  // -------------------------
  const existingCE = dossier.clinicalEvidence;
  const ceUpdate: any = {};
  if (existingCE) {
    ceUpdate.cerConclusions = existingCE.cerConclusions;
    ceUpdate.pmcfPlan = existingCE.pmcfPlan;
    ceUpdate.literatureSearchProtocol = existingCE.literatureSearchProtocol;
    ceUpdate.equivalentDevices = existingCE.equivalentDevices;
  } else {
    ceUpdate.cerConclusions = undefined;
    ceUpdate.pmcfPlan = undefined;
    ceUpdate.literatureSearchProtocol = undefined;
    ceUpdate.equivalentDevices = undefined;
  }

  const clinicalEval = pickBestByConfidence(byType.get("clinical_evaluation_extract") || []);
  const bra = pickBestByConfidence(byType.get("benefit_risk_assessment") || []);
  const litStrategy = pickBestByConfidence(byType.get("literature_search_strategy") || []);
  const pmcfSummary = pickBestByConfidence(byType.get("pmcf_summary") || []);
  const pmcfResults = (byType.get("pmcf_result") || []).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  // CER conclusions
  if (clinicalEval?.data || bra?.data) {
    const existing = ceUpdate.cerConclusions || {
      lastUpdateDate: "",
      benefitRiskConclusion: "",
      keyFindings: [],
      dataGapsIdentified: [],
    };
    const lastUpdateDate = safeDateString(clinicalEval?.data?.date ?? clinicalEval?.data?.last_update_date ?? clinicalEval?.data?.lastUpdateDate);
    const brConclusion = asString(bra?.data?.conclusion ?? bra?.data?.overall_conclusion ?? bra?.data?.benefitRiskConclusion);
    const findings = asStringArray(clinicalEval?.data?.key_findings ?? clinicalEval?.data?.keyFindings ?? clinicalEval?.data?.findings);
    const gaps = asStringArray(clinicalEval?.data?.data_gaps ?? clinicalEval?.data?.dataGapsIdentified ?? clinicalEval?.data?.gaps);

    const next = {
      lastUpdateDate: mergeString(existing.lastUpdateDate, lastUpdateDate, overwrite) || existing.lastUpdateDate || "",
      benefitRiskConclusion: mergeString(existing.benefitRiskConclusion, brConclusion, overwrite) || existing.benefitRiskConclusion || "",
      keyFindings: mergeStringArray(existing.keyFindings, findings, overwrite),
      dataGapsIdentified: mergeStringArray(existing.dataGapsIdentified, gaps, overwrite),
    };
    ceUpdate.cerConclusions = next;
    if (asString(next.benefitRiskConclusion)) filledFields.push("clinicalEvidence.cerConclusions.benefitRiskConclusion");
    if (next.keyFindings.length) filledFields.push("clinicalEvidence.cerConclusions.keyFindings");
  }

  // Literature search protocol
  if (litStrategy?.data) {
    const existing = ceUpdate.literatureSearchProtocol || {
      databases: [],
      searchStrings: [],
      inclusionCriteria: [],
      exclusionCriteria: [],
      lastSearchDate: "",
    };
    const next = {
      databases: mergeStringArray(existing.databases, litStrategy.data.databases ?? litStrategy.data.database, overwrite),
      searchStrings: mergeStringArray(existing.searchStrings, litStrategy.data.search_terms ?? litStrategy.data.searchStrings ?? litStrategy.data.searchTerms, overwrite),
      inclusionCriteria: mergeStringArray(existing.inclusionCriteria, litStrategy.data.inclusion_criteria ?? litStrategy.data.inclusionCriteria, overwrite),
      exclusionCriteria: mergeStringArray(existing.exclusionCriteria, litStrategy.data.exclusion_criteria ?? litStrategy.data.exclusionCriteria, overwrite),
      lastSearchDate: mergeString(existing.lastSearchDate, safeDateString(litStrategy.data.last_search_date ?? litStrategy.data.lastSearchDate), overwrite) || existing.lastSearchDate || "",
    };
    ceUpdate.literatureSearchProtocol = next;
    if (next.databases.length) filledFields.push("clinicalEvidence.literatureSearchProtocol.databases");
  }

  // PMCF plan (enhanced extraction from summary/results with endpoints)
  if (pmcfSummary?.data || pmcfResults.length) {
    const existing = ceUpdate.pmcfPlan || {
      objectives: [],
      endpoints: [],
      targetEnrollment: undefined,
      currentStatus: "",
      studyIds: [],
    };

    const summaryObjectives = asStringArray(
      getField(pmcfSummary?.data, "pmcfObjectives") ??
      getField(pmcfSummary?.data, "activitiesPerformed") ??
      pmcfSummary?.data?.objectives ??
      pmcfSummary?.data?.activities
    );
    const status = getStringField(pmcfSummary?.data, "currentStatus") ||
      asString(pmcfSummary?.data?.status);
    const targetEnrollment = getNumberField(pmcfSummary?.data, "patientCount") ??
      pmcfSummary?.data?.target_enrollment ??
      pmcfSummary?.data?.targetEnrollment;

    const studyIdsFromResults = pmcfResults
      .map(r => getStringField(r.data, "studyId") || asString(r.data?.study_id))
      .filter(Boolean) as string[];
    const findingsFromResults = pmcfResults
      .map(r => getStringField(r.data, "keyFindings") || asString(r.data?.finding ?? r.data?.conclusion))
      .filter(Boolean) as string[];

    // Extract endpoints from PMCF results (more detailed)
    const extractedEndpoints: Array<{ endpointId: string; description: string; targetValue?: string; measurementMethod?: string }> = [];
    for (const result of pmcfResults) {
      const d = result.data || {};
      const primaryEndpoint = getStringField(d, "primaryEndpoint") || d.primary_endpoint || d.endpoint;
      if (primaryEndpoint) {
        extractedEndpoints.push({
          endpointId: `ep_${extractedEndpoints.length + 1}`,
          description: primaryEndpoint,
          targetValue: getStringField(d, "targetValue") || d.target_value,
          measurementMethod: getStringField(d, "measurementMethod") || d.measurement_method,
        });
      }
    }

    const next = {
      objectives: mergeStringArray(existing.objectives, [...summaryObjectives, ...findingsFromResults], overwrite),
      endpoints: mergeArrayById(existing.endpoints || [], extractedEndpoints, "endpointId", overwrite),
      targetEnrollment: overwrite
        ? (Number(targetEnrollment) || existing.targetEnrollment)
        : (existing.targetEnrollment ?? (Number(targetEnrollment) || undefined)),
      currentStatus: mergeString(existing.currentStatus, status, overwrite) || existing.currentStatus || "",
      studyIds: mergeStringArray(existing.studyIds, studyIdsFromResults, overwrite),
    };

    ceUpdate.pmcfPlan = next;
    if (next.objectives.length) filledFields.push("clinicalEvidence.pmcfPlan.objectives");
    if (next.studyIds?.length) filledFields.push("clinicalEvidence.pmcfPlan.studyIds");
    if (next.endpoints?.length) filledFields.push("clinicalEvidence.pmcfPlan.endpoints");
  }

  // === EQUIVALENCE DEVICES (from CE extract or dedicated equivalence evidence) ===
  const equivalenceEvidence = byType.get("equivalence_extract") || [];
  const ceForEquivalence = clinicalEval?.data;

  // Try to extract equivalence from clinical evaluation extract
  const extractedEquivalence = getField(ceForEquivalence, "equivalentDevices") ||
    getField(ceForEquivalence, "equivalence");

  if (Array.isArray(extractedEquivalence) && extractedEquivalence.length) {
    ceUpdate.equivalentDevices = mergeArrayById(
      ceUpdate.equivalentDevices || [],
      extractedEquivalence.map((eq: any, idx: number) => ({
        deviceName: eq.deviceName || eq.device_name || eq.name || "",
        manufacturer: eq.manufacturer || eq.manufacturer_name || "",
        equivalenceType: normalizeEquivalenceType(eq.equivalenceType || eq.equivalence_type || eq.type),
        equivalenceJustification: eq.equivalenceJustification || eq.justification || eq.rationale || "",
      })),
      "deviceName",
      overwrite
    );
    if (ceUpdate.equivalentDevices?.length) {
      filledFields.push("clinicalEvidence.equivalentDevices");
    }
  }

  // Also check dedicated equivalence evidence
  for (const eqEv of equivalenceEvidence) {
    const d = eqEv.data || {};
    const deviceName = getStringField(d, "deviceName") || d.device_name || d.name;
    if (deviceName) {
      const eqDevice = {
        deviceName,
        manufacturer: getStringField(d, "manufacturer") || d.manufacturer_name || "",
        equivalenceType: normalizeEquivalenceType(getStringField(d, "equivalenceType") || d.equivalence_type),
        equivalenceJustification: getStringField(d, "equivalenceJustification") || d.justification || "",
      };
      ceUpdate.equivalentDevices = mergeArrayById(
        ceUpdate.equivalentDevices || [],
        [eqDevice],
        "deviceName",
        overwrite
      );
    }
  }
  if (ceUpdate.equivalentDevices?.length && !filledFields.includes("clinicalEvidence.equivalentDevices")) {
    filledFields.push("clinicalEvidence.equivalentDevices");
  }

  const ceApplied =
    JSON.stringify(ceUpdate.cerConclusions || null) !== JSON.stringify(existingCE?.cerConclusions || null) ||
    JSON.stringify(ceUpdate.pmcfPlan || null) !== JSON.stringify(existingCE?.pmcfPlan || null) ||
    JSON.stringify(ceUpdate.literatureSearchProtocol || null) !== JSON.stringify(existingCE?.literatureSearchProtocol || null) ||
    JSON.stringify(ceUpdate.equivalentDevices || null) !== JSON.stringify(existingCE?.equivalentDevices || null);

  if (ceApplied) {
    await upsertClinicalEvidence(deviceCode, ceUpdate);
  }

  // -------------------------
  // REGULATORY HISTORY
  // -------------------------
  const existingReg = dossier.regulatoryHistory;
  const regUpdate: any = {};
  if (existingReg) {
    regUpdate.certificates = existingReg.certificates;
    regUpdate.nbCommitments = existingReg.nbCommitments;
    regUpdate.fscaHistory = existingReg.fscaHistory;
    regUpdate.designChanges = existingReg.designChanges;
  } else {
    regUpdate.certificates = [];
    regUpdate.nbCommitments = [];
    regUpdate.fscaHistory = [];
    regUpdate.designChanges = [];
  }

  const certs = byType.get("regulatory_certificate_record") || [];
  if (certs.length) {
    const existingArr = Array.isArray(regUpdate.certificates) ? regUpdate.certificates : [];
    for (const c of certs) {
      const d = c.data || {};
      const certificateId = asString(d.certificate_number ?? d.certificateNumber ?? d.certificate_id ?? d.certificateId) || randomUUID();
      const existingMatch = existingArr.find((x: any) => x.certificateId === certificateId);
      const next = {
        certificateId,
        type: asString(d.type ?? d.certificate_type ?? d.certificateType) || "Certificate",
        notifiedBody: asString(d.notified_body ?? d.notifiedBody ?? d.nb) || "",
        issueDate: safeDateString(d.issue_date ?? d.issueDate) || "",
        expiryDate: safeDateString(d.expiry_date ?? d.expiryDate) || "",
        scope: asString(d.scope) || "",
        status: (asString(d.status) as any) || "Active",
      };
      if (!existingMatch || overwrite) {
        if (existingMatch) {
          Object.assign(existingMatch, next);
        } else {
          existingArr.push(next);
        }
      }
    }
    regUpdate.certificates = existingArr;
    if (existingArr.length) filledFields.push("regulatory.certificates");
  }

  const fsca = byType.get("fsca_record") || [];
  if (fsca.length) {
    const existingArr = Array.isArray(regUpdate.fscaHistory) ? regUpdate.fscaHistory : [];
    for (const f of fsca) {
      const d = f.data || {};
      const fscaId = asString(d.fsca_id ?? d.fscaId) || randomUUID();
      const existingMatch = existingArr.find((x: any) => x.fscaId === fscaId);
      const next = {
        fscaId,
        type: asString(d.action_type ?? d.type) || "FSCA",
        initiationDate: safeDateString(d.initiation_date ?? d.initiationDate) || "",
        description: asString(d.description) || "",
        affectedUnits: d.affected_units ? Number(d.affected_units) : (d.affectedUnits ? Number(d.affectedUnits) : undefined),
        regions: mergeStringArray([], d.regions ?? d.region, true),
        status: (asString(d.status) as any) || "Active",
        completionDate: safeDateString(d.completion_date ?? d.completionDate) || undefined,
      };
      if (!existingMatch || overwrite) {
        if (existingMatch) {
          Object.assign(existingMatch, next);
        } else {
          existingArr.push(next);
        }
      }
    }
    regUpdate.fscaHistory = existingArr;
    if (existingArr.length) filledFields.push("regulatory.fscaHistory");
  }

  const changes = byType.get("change_control_record") || [];
  if (changes.length) {
    const existingArr = Array.isArray(regUpdate.designChanges) ? regUpdate.designChanges : [];
    for (const ch of changes) {
      const d = ch.data || {};
      const changeId = asString(d.change_id ?? d.changeId) || randomUUID();
      const existingMatch = existingArr.find((x: any) => x.changeId === changeId);
      const next = {
        changeId,
        description: asString(d.description) || "",
        effectiveDate: safeDateString(d.effective_date ?? d.effectiveDate) || "",
        type: asString(d.type ?? d.change_type ?? d.changeType) || "Other",
        significance: ((asString(d.significance) as any) || "Non-Significant") as any,
        regulatoryImpact: asString(d.regulatory_impact ?? d.regulatoryImpact) || "",
      };
      if (!existingMatch || overwrite) {
        if (existingMatch) {
          Object.assign(existingMatch, next);
        } else {
          existingArr.push(next);
        }
      }
    }
    regUpdate.designChanges = existingArr;
    if (existingArr.length) filledFields.push("regulatory.designChanges");
  }

  const regApplied =
    JSON.stringify(regUpdate.certificates || []) !== JSON.stringify(existingReg?.certificates || []) ||
    JSON.stringify(regUpdate.fscaHistory || []) !== JSON.stringify(existingReg?.fscaHistory || []) ||
    JSON.stringify(regUpdate.designChanges || []) !== JSON.stringify(existingReg?.designChanges || []);

  if (regApplied) {
    await upsertRegulatoryHistory(deviceCode, regUpdate);
  }

  // -------------------------
  // PRIOR PSURS
  // -------------------------
  const priorExtracts = byType.get("previous_psur_extract") || [];
  let priorAdded = 0;
  let priorUpdated = 0;
  for (const p of priorExtracts) {
    const d = p.data || {};
    const periodStart = safeDateString(d.period_start ?? d.periodStart);
    const periodEnd = safeDateString(d.period_end ?? d.periodEnd);
    if (!periodStart || !periodEnd) continue;

    const psurReference = asString(d.psur_reference ?? d.psurReference) || null;
    const br = asString(d.benefit_risk_conclusion ?? d.benefitRiskConclusion ?? d.conclusion) || null;
    const keyFindings = asStringArray(d.key_findings ?? d.keyFindings ?? d.findings);

    const match = dossier.priorPsurs.find(existing => {
      const exStart = existing.periodStart?.toISOString().split("T")[0];
      const exEnd = existing.periodEnd?.toISOString().split("T")[0];
      if (psurReference && existing.psurReference && psurReference === existing.psurReference) return true;
      return exStart === periodStart && exEnd === periodEnd;
    });

    if (match) {
      if (overwrite) {
        const updated = await updatePriorPsur(match.id, {
          psurReference: psurReference ?? match.psurReference,
          benefitRiskConclusion: br ?? match.benefitRiskConclusion,
          keyFindings: overwrite ? keyFindings : mergeStringArray(match.keyFindings, keyFindings, false),
        } as any);
        if (updated) priorUpdated += 1;
      }
      continue;
    }

    await addPriorPsur(deviceCode, {
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      psurReference: psurReference ?? undefined,
      benefitRiskConclusion: br ?? undefined,
      keyFindings,
      actionsRequired: [],
    } as any);
    priorAdded += 1;
  }

  if (priorAdded || priorUpdated) {
    filledFields.push("priorPsurs");
  }

  // Final warnings for missing critical minimums
  let llmInference: AutoPopulateResult["llmInference"] | undefined;
  if (useLLMInference) {
    llmInference = { attempted: true, applied: false };
    try {
      const { patch, provider, model, latencyMs } = await inferDossierPatchFromEvidence(deviceCode, evidence);
      const appliedPatch = await applyInferredPatchToDossier(deviceCode, patch, overwrite);
      llmInference = {
        attempted: true,
        applied: appliedPatch.applied,
        provider,
        model,
        latencyMs,
        filledFields: appliedPatch.filledFields,
        warnings: appliedPatch.warnings,
      };
    } catch (e: any) {
      llmInference = {
        attempted: true,
        applied: false,
        error: e?.message || String(e),
      };
    }
  }

  const after = await getFullDossier(deviceCode);
  if (after) {
    if (!after.clinicalContext?.intendedPurpose) {
      warnings.push("Missing: clinical intended purpose (upload IFU or provide manually).");
    }
    const benefitsArr = after.clinicalContext?.clinicalBenefits as any[] || [];
    if (!benefitsArr.length) {
      warnings.push("Missing: clinical benefits (define benefits/endpoints for B/R narrative).");
    }
    const principalRisksArr = after.riskContext?.principalRisks as any[] || [];
    if (!principalRisksArr.length) {
      warnings.push("Missing: principal identified risks (upload RMF/FMEA or provide manually).");
    }
    if (!after.riskContext?.riskThresholds) {
      warnings.push("Missing: risk thresholds (complaint rate / serious incident thresholds).");
    }
  }

  return {
    deviceCode,
    overwrite,
    evidenceItemsProcessed: evidence.length,
    evidenceTypesUsed,
    applied: {
      core: coreApplied,
      clinicalContext: !!clinicalApplied,
      riskContext: !!riskApplied,
      clinicalEvidence: !!ceApplied,
      regulatoryHistory: !!regApplied,
      priorPsursAdded: priorAdded,
      priorPsursUpdated: priorUpdated,
    },
    filledFields: Array.from(new Set(filledFields)),
    warnings: Array.from(new Set(warnings)),
    llmInference,
  };
}
