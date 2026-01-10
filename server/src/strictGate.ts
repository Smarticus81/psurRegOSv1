import { normalizeEvidenceAtoms, normalizeSlotProposals } from "./normalizers";
import { EvidenceAtomZ } from "./schemas/evidenceAtom.zod";
import { SlotProposalZ } from "./schemas/slotProposal.zod";

export function strictParseEvidenceAtoms(
  rawAtoms: any[],
  ctx: { deviceCode?: string; periodStart?: string; periodEnd?: string }
) {
  const normalized = normalizeEvidenceAtoms(rawAtoms, ctx);
  return EvidenceAtomZ.array().parse(normalized);
}

export function strictParseSlotProposals(rawProposals: any[], template: any) {
  const normalized = normalizeSlotProposals(rawProposals, template);
  return SlotProposalZ.array().parse(normalized);
}
