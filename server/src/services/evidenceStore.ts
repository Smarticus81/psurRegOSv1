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

  // Raw data inputs
  if (v === "sales" || v === "sales_volume") return CANONICAL_EVIDENCE_TYPES.SALES;
  if (v === "complaints" || v === "complaint_record") return CANONICAL_EVIDENCE_TYPES.COMPLAINT;
  if (v === "serious_incidents" || v === "serious_incident" || v === "incidents" || v === "serious_incident_record") return CANONICAL_EVIDENCE_TYPES.SERIOUS_INCIDENT;
  if (v === "fsca" || v === "fsca_record") return CANONICAL_EVIDENCE_TYPES.FSCA;
  if (v === "pmcf" || v === "pmcf_result") return CANONICAL_EVIDENCE_TYPES.PMCF;
  if (v === "literature" || v === "literature_result") return CANONICAL_EVIDENCE_TYPES.LITERATURE;
  if (v === "capa" || v === "capa_record") return CANONICAL_EVIDENCE_TYPES.CAPA;
  if (v === "ncr" || v === "ncr_record") return CANONICAL_EVIDENCE_TYPES.NCR;
  if (v === "recall" || v === "recall_record") return CANONICAL_EVIDENCE_TYPES.RECALL;
  
  // Administrative records
  if (v === "device_registry" || v === "device_registry_record") return CANONICAL_EVIDENCE_TYPES.DEVICE_REGISTRY;
  if (v === "manufacturer_profile") return CANONICAL_EVIDENCE_TYPES.MANUFACTURER_PROFILE;
  if (v === "regulatory_certificate" || v === "regulatory_certificate_record") return CANONICAL_EVIDENCE_TYPES.REGULATORY_CERTIFICATE;
  if (v === "change_control" || v === "change_control_record") return CANONICAL_EVIDENCE_TYPES.CHANGE_CONTROL;
  if (v === "data_source_register") return CANONICAL_EVIDENCE_TYPES.DATA_SOURCE_REGISTER;
  if (v === "pms_activity_log") return CANONICAL_EVIDENCE_TYPES.PMS_ACTIVITY_LOG;
  
  // Document extracts
  if (v === "cer_extract") return CANONICAL_EVIDENCE_TYPES.CER_EXTRACT;
  if (v === "rmf_extract") return CANONICAL_EVIDENCE_TYPES.RMF_EXTRACT;
  if (v === "ifu_extract") return CANONICAL_EVIDENCE_TYPES.IFU_EXTRACT;
  if (v === "clinical_evaluation_extract") return CANONICAL_EVIDENCE_TYPES.CLINICAL_EVALUATION_EXTRACT;
  if (v === "pms_plan_extract") return CANONICAL_EVIDENCE_TYPES.PMS_PLAN_EXTRACT;
  if (v === "previous_psur_extract") return CANONICAL_EVIDENCE_TYPES.PREVIOUS_PSUR_EXTRACT;
  if (v === "pmcf_report_extract") return CANONICAL_EVIDENCE_TYPES.PMCF_REPORT_EXTRACT;
  if (v === "pmcf_activity_record") return CANONICAL_EVIDENCE_TYPES.PMCF_ACTIVITY_RECORD;
  
  // Summaries
  if (v === "sales_summary") return CANONICAL_EVIDENCE_TYPES.SALES_SUMMARY;
  if (v === "sales_by_region") return CANONICAL_EVIDENCE_TYPES.SALES_BY_REGION;
  if (v === "distribution_summary") return CANONICAL_EVIDENCE_TYPES.DISTRIBUTION_SUMMARY;
  if (v === "usage_estimate") return CANONICAL_EVIDENCE_TYPES.USAGE_ESTIMATE;
  if (v === "complaint_summary") return CANONICAL_EVIDENCE_TYPES.COMPLAINT_SUMMARY;
  if (v === "complaints_by_region") return CANONICAL_EVIDENCE_TYPES.COMPLAINTS_BY_REGION;
  if (v === "serious_incident_summary") return CANONICAL_EVIDENCE_TYPES.SERIOUS_INCIDENT_SUMMARY;
  if (v === "serious_incident_records_imdrf") return CANONICAL_EVIDENCE_TYPES.SERIOUS_INCIDENT_IMDRF;
  if (v === "trend_analysis") return CANONICAL_EVIDENCE_TYPES.TREND_ANALYSIS;
  if (v === "signal_log") return CANONICAL_EVIDENCE_TYPES.SIGNAL_LOG;
  if (v === "fsca_summary") return CANONICAL_EVIDENCE_TYPES.FSCA_SUMMARY;
  if (v === "capa_summary") return CANONICAL_EVIDENCE_TYPES.CAPA_SUMMARY;
  if (v === "pmcf_summary") return CANONICAL_EVIDENCE_TYPES.PMCF_SUMMARY;
  if (v === "literature_review_summary") return CANONICAL_EVIDENCE_TYPES.LITERATURE_REVIEW_SUMMARY;
  if (v === "literature_search_strategy") return CANONICAL_EVIDENCE_TYPES.LITERATURE_SEARCH_STRATEGY;
  if (v === "external_db_summary") return CANONICAL_EVIDENCE_TYPES.EXTERNAL_DB_SUMMARY;
  if (v === "external_db_query_log") return CANONICAL_EVIDENCE_TYPES.EXTERNAL_DB_QUERY_LOG;
  if (v === "vigilance_report") return CANONICAL_EVIDENCE_TYPES.VIGILANCE_REPORT;
  if (v === "benefit_risk_assessment") return CANONICAL_EVIDENCE_TYPES.BENEFIT_RISK_ASSESSMENT;
  if (v === "risk_assessment") return CANONICAL_EVIDENCE_TYPES.RISK_ASSESSMENT;
  
  // Change logs
  if (v === "cer_change_log") return CANONICAL_EVIDENCE_TYPES.CER_CHANGE_LOG;
  if (v === "rmf_change_log") return CANONICAL_EVIDENCE_TYPES.RMF_CHANGE_LOG;

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
