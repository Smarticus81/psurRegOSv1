import { listEvidenceAtomsByCase, EvidenceAtomRecord } from "../../services/evidenceStore";

export interface IngestContext {
  psurCaseId: number;
  evidenceAtoms?: EvidenceAtomRecord[];
  log?: (msg: string) => void;
}

/**
 * Step 3: Ingest Evidence
 * 
 * INDUSTRY-READY BEHAVIOR:
 * - If no evidence atoms are linked to the PSUR case, the workflow MUST FAIL.
 * - This prevents "fake PSURs" and "fake coverage" from being generated.
 */
export async function ingestEvidenceStep(ctx: IngestContext): Promise<EvidenceAtomRecord[]> {
  const { psurCaseId } = ctx;

  const atoms = await listEvidenceAtomsByCase(Number(psurCaseId));

  ctx.evidenceAtoms = atoms;

  ctx.log?.(`[Step 3/8] Ingest Evidence: Loaded ${atoms.length} evidence atoms from DB for case ${psurCaseId}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // INDUSTRY-READY HARD STOP:
  // If no atoms are linked to case, workflow must stop.
  // This prevents fake PSURs from being generated.
  // ═══════════════════════════════════════════════════════════════════════════
  if (!atoms || atoms.length === 0) {
    throw new Error(
      `No evidence atoms found for PSUR case ${psurCaseId}. ` +
      `Upload evidence for this case before running generation. ` +
      `Required evidence types include: sales_volume, complaint_record, serious_incident_record, etc.`
    );
  }

  // Log evidence type breakdown
  const typeBreakdown: Record<string, number> = {};
  for (const atom of atoms) {
    typeBreakdown[atom.evidenceType] = (typeBreakdown[atom.evidenceType] || 0) + 1;
  }
  ctx.log?.(`[Step 3/8] Evidence breakdown: ${JSON.stringify(typeBreakdown)}`);

  return atoms;
}
