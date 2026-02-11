import crypto from "crypto";
import { db } from "../../db";
import { evidenceAtoms, CANONICAL_EVIDENCE_TYPES } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";

export type EvidenceType = string;

export type EvidenceAtom = {
  id?: number; // DB ID (optional for in-memory atoms before persistence)
  atomId: string;
  evidenceType: EvidenceType;
  contentHash: string;
  normalizedData: any;
  provenance: {
    uploadId: number;
    sourceFile: string;
    uploadedAt: string;
    deviceRef: { deviceCode: string };
    psurPeriod: { periodStart: string; periodEnd: string };
    extractDate?: string;
    mapping?: any;
    filters?: any;
  };
};

export type EvidenceAtomRecord = EvidenceAtom;

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function makeAtomId(evidenceType: EvidenceType, normalizedData: any): string {
  // Sort keys for deterministic hashing (matches normalize.ts)
  const content = JSON.stringify(normalizedData, Object.keys(normalizedData || {}).sort());
  return `${evidenceType}:${sha256Hex(content).slice(0, 12)}`;
}

export function makeContentHash(normalizedData: any): string {
  return sha256Hex(JSON.stringify(normalizedData, Object.keys(normalizedData || {}).sort()));
}

export function coerceEvidenceType(raw: string): EvidenceType {
  const v = (raw || "").trim().toLowerCase();

  // ── Category 1: Device Master Data ──
  if (v === "device_identification") return CANONICAL_EVIDENCE_TYPES.DEVICE_IDENTIFICATION;
  if (v === "device_classification") return CANONICAL_EVIDENCE_TYPES.DEVICE_CLASSIFICATION;
  if (v === "device_intended_use") return CANONICAL_EVIDENCE_TYPES.DEVICE_INTENDED_USE;
  if (v === "device_technical_specs") return CANONICAL_EVIDENCE_TYPES.DEVICE_TECHNICAL_SPECS;
  if (v === "manufacturer_details") return CANONICAL_EVIDENCE_TYPES.MANUFACTURER_DETAILS;
  if (v === "regulatory_certificates") return CANONICAL_EVIDENCE_TYPES.REGULATORY_CERTIFICATES;
  // Backward compat aliases for device
  if (v === "device_registry" || v === "device_registry_record") return CANONICAL_EVIDENCE_TYPES.DEVICE_IDENTIFICATION;
  if (v === "manufacturer_profile") return CANONICAL_EVIDENCE_TYPES.MANUFACTURER_DETAILS;
  if (v === "regulatory_certificate" || v === "regulatory_certificate_record") return CANONICAL_EVIDENCE_TYPES.REGULATORY_CERTIFICATES;
  if (v === "manufacturer_master_data") return CANONICAL_EVIDENCE_TYPES.MANUFACTURER_DETAILS;
  if (v === "device_master_data") return CANONICAL_EVIDENCE_TYPES.DEVICE_IDENTIFICATION;
  if (v === "ifu_extract") return CANONICAL_EVIDENCE_TYPES.DEVICE_INTENDED_USE;

  // ── Category 2: Complaints ──
  if (v === "complaints" || v === "complaint_record") return CANONICAL_EVIDENCE_TYPES.COMPLAINT;
  if (v === "complaint_investigation") return CANONICAL_EVIDENCE_TYPES.COMPLAINT_INVESTIGATION;
  if (v === "complaint_metrics") return CANONICAL_EVIDENCE_TYPES.COMPLAINT_METRICS;
  if (v === "imdrf_classification_complaints") return CANONICAL_EVIDENCE_TYPES.IMDRF_CLASSIFICATION_COMPLAINTS;
  if (v === "complaint_control_chart") return CANONICAL_EVIDENCE_TYPES.COMPLAINT_CONTROL_CHART;
  if (v === "complaint_segmentation") return CANONICAL_EVIDENCE_TYPES.COMPLAINT_SEGMENTATION;
  if (v === "root_cause_clusters") return CANONICAL_EVIDENCE_TYPES.ROOT_CAUSE_CLUSTERS;
  // Backward compat aliases for complaints
  if (v === "complaint_summary") return CANONICAL_EVIDENCE_TYPES.COMPLAINT_METRICS;
  if (v === "complaints_by_region") return CANONICAL_EVIDENCE_TYPES.COMPLAINT_METRICS;

  // ── Category 3: Vigilance ──
  if (v === "serious_incidents" || v === "serious_incident" || v === "incidents" || v === "serious_incident_record") return CANONICAL_EVIDENCE_TYPES.SERIOUS_INCIDENT;
  if (v === "serious_incident_investigation") return CANONICAL_EVIDENCE_TYPES.SERIOUS_INCIDENT_INVESTIGATION;
  if (v === "imdrf_classification_incidents") return CANONICAL_EVIDENCE_TYPES.IMDRF_CLASSIFICATION_INCIDENTS;
  if (v === "vigilance_submission_log") return CANONICAL_EVIDENCE_TYPES.VIGILANCE_SUBMISSION_LOG;
  if (v === "serious_incident_metrics") return CANONICAL_EVIDENCE_TYPES.SERIOUS_INCIDENT_METRICS;
  // Backward compat aliases for vigilance
  if (v === "serious_incident_summary") return CANONICAL_EVIDENCE_TYPES.SERIOUS_INCIDENT_METRICS;
  if (v === "serious_incident_records_imdrf") return CANONICAL_EVIDENCE_TYPES.IMDRF_CLASSIFICATION_INCIDENTS;
  if (v === "vigilance_report") return CANONICAL_EVIDENCE_TYPES.SERIOUS_INCIDENT_METRICS;

  // ── Category 4: Sales & Distribution ──
  if (v === "sales" || v === "sales_volume" || v === "sales_transactions") return CANONICAL_EVIDENCE_TYPES.SALES;
  if (v === "sales_aggregated") return CANONICAL_EVIDENCE_TYPES.SALES_AGGREGATED;
  if (v === "population_exposure") return CANONICAL_EVIDENCE_TYPES.POPULATION_EXPOSURE;
  if (v === "market_history") return CANONICAL_EVIDENCE_TYPES.MARKET_HISTORY;
  // Backward compat aliases for sales
  if (v === "sales_summary") return CANONICAL_EVIDENCE_TYPES.SALES_AGGREGATED;
  if (v === "sales_by_region") return CANONICAL_EVIDENCE_TYPES.SALES_AGGREGATED;
  if (v === "distribution_summary") return CANONICAL_EVIDENCE_TYPES.SALES_AGGREGATED;
  if (v === "usage_estimate" || v === "population_estimate" || v === "exposure_model") return CANONICAL_EVIDENCE_TYPES.POPULATION_EXPOSURE;

  // ── Category 5: FSCA ──
  if (v === "fsca" || v === "fsca_record") return CANONICAL_EVIDENCE_TYPES.FSCA;
  if (v === "fsca_effectiveness") return CANONICAL_EVIDENCE_TYPES.FSCA_EFFECTIVENESS;
  if (v === "fsca_metrics") return CANONICAL_EVIDENCE_TYPES.FSCA_METRICS;
  if (v === "recall" || v === "recall_record") return CANONICAL_EVIDENCE_TYPES.FSCA;
  // Backward compat
  if (v === "fsca_summary") return CANONICAL_EVIDENCE_TYPES.FSCA_METRICS;

  // ── Category 6: CAPA ──
  if (v === "capa" || v === "capa_record") return CANONICAL_EVIDENCE_TYPES.CAPA;
  if (v === "ncr" || v === "ncr_record") return CANONICAL_EVIDENCE_TYPES.NCR;
  if (v === "capa_metrics") return CANONICAL_EVIDENCE_TYPES.CAPA_METRICS;
  // Backward compat
  if (v === "capa_summary") return CANONICAL_EVIDENCE_TYPES.CAPA_METRICS;

  // ── Category 7: CER ──
  if (v === "cer_metadata") return CANONICAL_EVIDENCE_TYPES.CER_METADATA;
  if (v === "cer_intended_use") return CANONICAL_EVIDENCE_TYPES.CER_INTENDED_USE;
  if (v === "cer_clinical_benefits") return CANONICAL_EVIDENCE_TYPES.CER_CLINICAL_BENEFITS;
  if (v === "cer_clinical_risks") return CANONICAL_EVIDENCE_TYPES.CER_CLINICAL_RISKS;
  if (v === "cer_literature_summary") return CANONICAL_EVIDENCE_TYPES.CER_LITERATURE_SUMMARY;
  if (v === "cer_pmcf_summary") return CANONICAL_EVIDENCE_TYPES.CER_PMCF_SUMMARY;
  if (v === "cer_equivalence") return CANONICAL_EVIDENCE_TYPES.CER_EQUIVALENCE;
  if (v === "cer_state_of_art") return CANONICAL_EVIDENCE_TYPES.CER_STATE_OF_ART;
  if (v === "cer_conclusions") return CANONICAL_EVIDENCE_TYPES.CER_CONCLUSIONS;
  if (v === "cer_change_log") return CANONICAL_EVIDENCE_TYPES.CER_CHANGE_LOG;
  // Backward compat aliases for CER
  if (v === "cer_extract") return CANONICAL_EVIDENCE_TYPES.CER_METADATA;
  if (v === "clinical_evaluation_extract") return CANONICAL_EVIDENCE_TYPES.CER_CONCLUSIONS;

  // ── Category 8: RMF ──
  if (v === "rmf_metadata") return CANONICAL_EVIDENCE_TYPES.RMF_METADATA;
  if (v === "rmf_hazard_analysis") return CANONICAL_EVIDENCE_TYPES.RMF_HAZARD_ANALYSIS;
  if (v === "rmf_risk_assessment_pre") return CANONICAL_EVIDENCE_TYPES.RMF_RISK_ASSESSMENT_PRE;
  if (v === "rmf_risk_controls") return CANONICAL_EVIDENCE_TYPES.RMF_RISK_CONTROLS;
  if (v === "rmf_risk_assessment_post") return CANONICAL_EVIDENCE_TYPES.RMF_RISK_ASSESSMENT_POST;
  if (v === "rmf_acceptability") return CANONICAL_EVIDENCE_TYPES.RMF_ACCEPTABILITY;
  if (v === "rmf_benefit_risk") return CANONICAL_EVIDENCE_TYPES.RMF_BENEFIT_RISK;
  if (v === "rmf_change_log") return CANONICAL_EVIDENCE_TYPES.RMF_CHANGE_LOG;
  // Backward compat aliases for RMF
  if (v === "rmf_extract") return CANONICAL_EVIDENCE_TYPES.RMF_METADATA;
  if (v === "benefit_risk_assessment") return CANONICAL_EVIDENCE_TYPES.BENEFIT_RISK_QUANTIFICATION;
  if (v === "risk_assessment") return CANONICAL_EVIDENCE_TYPES.RISK_REASSESSMENT;

  // ── Category 9: PMCF ──
  if (v === "pmcf_plan_extract") return CANONICAL_EVIDENCE_TYPES.PMCF_PLAN_EXTRACT;
  if (v === "pmcf_activity_record") return CANONICAL_EVIDENCE_TYPES.PMCF_ACTIVITY_RECORD;
  if (v === "pmcf" || v === "pmcf_result" || v === "pmcf_results") return CANONICAL_EVIDENCE_TYPES.PMCF_RESULTS;
  if (v === "pmcf_evaluation_summary") return CANONICAL_EVIDENCE_TYPES.PMCF_EVALUATION_SUMMARY;
  // Backward compat aliases for PMCF
  if (v === "pmcf_summary") return CANONICAL_EVIDENCE_TYPES.PMCF_EVALUATION_SUMMARY;
  if (v === "pmcf_report_extract") return CANONICAL_EVIDENCE_TYPES.PMCF_EVALUATION_SUMMARY;

  // ── Category 10: Literature & External Databases ──
  if (v === "literature_search_protocol") return CANONICAL_EVIDENCE_TYPES.LITERATURE_SEARCH_PROTOCOL;
  if (v === "literature_screening_results") return CANONICAL_EVIDENCE_TYPES.LITERATURE_SCREENING_RESULTS;
  if (v === "literature" || v === "literature_result" || v === "literature_findings") return CANONICAL_EVIDENCE_TYPES.LITERATURE_FINDINGS;
  if (v === "literature_synthesis") return CANONICAL_EVIDENCE_TYPES.LITERATURE_SYNTHESIS;
  if (v === "external_db_query_log") return CANONICAL_EVIDENCE_TYPES.EXTERNAL_DB_QUERY_LOG;
  if (v === "external_db_findings") return CANONICAL_EVIDENCE_TYPES.EXTERNAL_DB_FINDINGS;
  // Backward compat aliases
  if (v === "literature_review_summary") return CANONICAL_EVIDENCE_TYPES.LITERATURE_SYNTHESIS;
  if (v === "literature_search_strategy") return CANONICAL_EVIDENCE_TYPES.LITERATURE_SEARCH_PROTOCOL;
  if (v === "external_db_summary") return CANONICAL_EVIDENCE_TYPES.EXTERNAL_DB_FINDINGS;

  // ── Category 11: PMS Plan & Activity Log ──
  if (v === "pms_plan_extract") return CANONICAL_EVIDENCE_TYPES.PMS_PLAN_EXTRACT;
  if (v === "pms_activity_log") return CANONICAL_EVIDENCE_TYPES.PMS_ACTIVITY_LOG;
  // Backward compat aliases
  if (v === "change_control" || v === "change_control_record") return CANONICAL_EVIDENCE_TYPES.PMS_ACTIVITY_LOG;
  if (v === "data_source_register") return CANONICAL_EVIDENCE_TYPES.PMS_ACTIVITY_LOG;

  // ── Category 12: Previous PSUR ──
  if (v === "previous_psur_metadata") return CANONICAL_EVIDENCE_TYPES.PREVIOUS_PSUR_METADATA;
  if (v === "previous_psur_conclusions") return CANONICAL_EVIDENCE_TYPES.PREVIOUS_PSUR_CONCLUSIONS;
  if (v === "previous_psur_metrics") return CANONICAL_EVIDENCE_TYPES.PREVIOUS_PSUR_METRICS;
  if (v === "previous_psur_actions") return CANONICAL_EVIDENCE_TYPES.PREVIOUS_PSUR_ACTIONS;
  if (v === "previous_psur_action_status") return CANONICAL_EVIDENCE_TYPES.PREVIOUS_PSUR_ACTION_STATUS;
  // Backward compat alias
  if (v === "previous_psur_extract") return CANONICAL_EVIDENCE_TYPES.PREVIOUS_PSUR_METADATA;

  // ── Calculated Evidence ──
  if (v === "complaint_rate_analysis") return CANONICAL_EVIDENCE_TYPES.COMPLAINT_RATE_ANALYSIS;
  if (v === "statistical_trending") return CANONICAL_EVIDENCE_TYPES.STATISTICAL_TRENDING;
  if (v === "control_chart_data") return CANONICAL_EVIDENCE_TYPES.CONTROL_CHART_DATA;
  if (v === "segmentation_analysis") return CANONICAL_EVIDENCE_TYPES.SEGMENTATION_ANALYSIS;
  if (v === "benefit_risk_quantification") return CANONICAL_EVIDENCE_TYPES.BENEFIT_RISK_QUANTIFICATION;
  if (v === "risk_reassessment") return CANONICAL_EVIDENCE_TYPES.RISK_REASSESSMENT;
  // Backward compat aliases for calculated
  if (v === "trend_analysis") return CANONICAL_EVIDENCE_TYPES.STATISTICAL_TRENDING;
  if (v === "signal_log") return CANONICAL_EVIDENCE_TYPES.STATISTICAL_TRENDING;

  // ── Legacy types ──
  if (v === "psur_case_record") return "psur_case_record";
  if (v === "registry") return CANONICAL_EVIDENCE_TYPES.EXTERNAL_DB_FINDINGS;

  throw new Error(`Unsupported evidence_type: ${raw}. Supported types: ${Object.values(CANONICAL_EVIDENCE_TYPES).join(", ")}`);
}

export async function persistEvidenceAtoms(params: {
  psurCaseId: number;
  deviceCode: string;
  periodStart: string;
  periodEnd: string;
  uploadId?: number;
  atoms: EvidenceAtomRecord[];
}): Promise<{ inserted: number; atomIds: string[] }> {
  const { psurCaseId, deviceCode, periodStart, periodEnd, uploadId, atoms } = params;
  
  if (atoms.length === 0) {
    return { inserted: 0, atomIds: [] };
  }
  
  // OPTIMIZED: Query existing atoms in batches to avoid query size limits
  const LOOKUP_BATCH_SIZE = 1000;
  const atomIds = atoms.map(a => a.atomId);
  const existingIds = new Set<string>();
  
  for (let i = 0; i < atomIds.length; i += LOOKUP_BATCH_SIZE) {
    const batchIds = atomIds.slice(i, i + LOOKUP_BATCH_SIZE);
    const existingAtoms = await db.query.evidenceAtoms.findMany({
      where: and(
        inArray(evidenceAtoms.atomId, batchIds),
        eq(evidenceAtoms.psurCaseId, psurCaseId),
      ),
      columns: { atomId: true },
    });
    for (const e of existingAtoms) {
      existingIds.add(e.atomId);
    }
  }
  
  // Filter to only new atoms
  const newAtoms = atoms.filter(atom => !existingIds.has(atom.atomId));
  
  if (newAtoms.length === 0) {
    return { inserted: 0, atomIds: [] };
  }
  
  // OPTIMIZED: Batch insert in chunks to avoid stack overflow with large datasets
  const BATCH_SIZE = 500; // Safe batch size for Drizzle ORM
  const insertValues = newAtoms.map(atom => ({
    atomId: atom.atomId,
    psurCaseId,
    uploadId: uploadId ?? null,
    evidenceType: atom.evidenceType,
    sourceSystem: atom.provenance.sourceFile || "upload",
    extractDate: new Date(atom.provenance.extractDate || atom.provenance.uploadedAt),
    contentHash: atom.contentHash,
    periodStart: new Date(periodStart),
    periodEnd: new Date(periodEnd),
    deviceRef: { deviceCode },
    data: atom.normalizedData,
    normalizedData: atom.normalizedData,
    provenance: atom.provenance,
    status: "valid" as const,
    version: 1,
  }));
  
  // Insert in batches to prevent stack overflow
  for (let i = 0; i < insertValues.length; i += BATCH_SIZE) {
    const batch = insertValues.slice(i, i + BATCH_SIZE);
    await db.insert(evidenceAtoms).values(batch);
  }
  
  const insertedAtomIds = newAtoms.map(a => a.atomId);
  return { inserted: insertedAtomIds.length, atomIds: insertedAtomIds };
}

export async function listEvidenceAtomsByCase(psurCaseId: number): Promise<EvidenceAtomRecord[]> {
  const rows = await db.query.evidenceAtoms.findMany({
    where: eq(evidenceAtoms.psurCaseId, psurCaseId),
    orderBy: (atoms, { asc }) => [asc(atoms.id)],
  });
  
  return rows.map((r) => ({
    id: r.id,
    atomId: r.atomId,
    evidenceType: r.evidenceType as EvidenceType,
    contentHash: r.contentHash,
    normalizedData: r.normalizedData ?? r.data,
    provenance: r.provenance as EvidenceAtomRecord["provenance"],
  }));
}

export async function getEvidenceAtomIds(psurCaseId: number): Promise<number[]> {
  const rows = await db.query.evidenceAtoms.findMany({
    where: eq(evidenceAtoms.psurCaseId, psurCaseId),
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}
