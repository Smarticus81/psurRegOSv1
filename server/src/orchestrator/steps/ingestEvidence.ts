import { listEvidenceAtomsByCase, EvidenceAtomRecord } from "../../services/evidenceStore";

export interface IngestContext {
  psurCaseId: number;
  evidenceAtoms?: EvidenceAtomRecord[];
  log?: (msg: string) => void;
}

export async function ingestEvidenceStep(ctx: IngestContext): Promise<EvidenceAtomRecord[]> {
  const { psurCaseId } = ctx;

  const atoms = await listEvidenceAtomsByCase(Number(psurCaseId));

  ctx.evidenceAtoms = atoms;

  ctx.log?.(`[Step 3/8] Ingest Evidence: Loaded ${atoms.length} evidence atoms from DB for case ${psurCaseId}`);

  return atoms;
}
