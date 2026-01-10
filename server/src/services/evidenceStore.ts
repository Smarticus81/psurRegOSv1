import crypto from "crypto";
import { db } from "../../db";
import { evidenceAtoms } from "@shared/schema";
import { eq } from "drizzle-orm";

export type EvidenceType = "sales_volume" | "complaint_record" | "serious_incident" | "fsca" | "pmcf" | "literature";

export type EvidenceAtomRecord = {
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

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function makeAtomId(evidenceType: EvidenceType, normalizedData: any): string {
  const content = JSON.stringify(normalizedData);
  return `${evidenceType}:${sha256Hex(content).slice(0, 12)}`;
}

export function makeContentHash(normalizedData: any): string {
  return sha256Hex(JSON.stringify(normalizedData));
}

export function coerceEvidenceType(raw: string): EvidenceType {
  const v = (raw || "").trim().toLowerCase();

  if (v === "sales" || v === "sales_volume") return "sales_volume";
  if (v === "complaints" || v === "complaint_record") return "complaint_record";
  if (v === "serious_incidents" || v === "serious_incident" || v === "incidents") return "serious_incident";
  if (v === "fsca" || v === "fsca_record") return "fsca";
  if (v === "pmcf" || v === "pmcf_result") return "pmcf";
  if (v === "literature" || v === "literature_result") return "literature";

  throw new Error(`Unsupported evidence_type: ${raw}. Supported types: sales_volume, complaint_record, serious_incident, fsca, pmcf, literature`);
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
  
  const insertedAtomIds: string[] = [];
  
  for (const atom of atoms) {
    const existing = await db.query.evidenceAtoms.findFirst({
      where: eq(evidenceAtoms.atomId, atom.atomId),
    });
    
    if (!existing) {
      await db.insert(evidenceAtoms).values({
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
        status: "valid",
        version: 1,
      });
      insertedAtomIds.push(atom.atomId);
    }
  }
  
  return { inserted: insertedAtomIds.length, atomIds: insertedAtomIds };
}

export async function listEvidenceAtomsByCase(psurCaseId: number): Promise<EvidenceAtomRecord[]> {
  const rows = await db.query.evidenceAtoms.findMany({
    where: eq(evidenceAtoms.psurCaseId, psurCaseId),
    orderBy: (atoms, { asc }) => [asc(atoms.id)],
  });
  
  return rows.map((r) => ({
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
