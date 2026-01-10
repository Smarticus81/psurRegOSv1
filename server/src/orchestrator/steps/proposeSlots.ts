import { listEvidenceAtomsByCase, EvidenceAtomRecord } from "../../services/evidenceStore";

export interface SlotDefinition {
  slotId: string;
  sectionId?: string;
  label?: string;
  requiredEvidenceTypes?: string[];
  obligationIds?: string[];
  claimedObligationIds?: string[];
  transformations?: string[];
  demoContent?: string;
}

export interface SlotProposalOutput {
  proposalId: string;
  slotId: string;
  content: string;
  evidenceAtomIds: string[];
  claimedObligationIds: string[];
  methodStatement: string;
  transformations: string[];
}

export interface ProposeContext {
  psurCaseId: number;
  template: {
    slots: SlotDefinition[];
  };
  evidenceAtoms: EvidenceAtomRecord[];
  log?: (msg: string) => void;
  slotProposals?: SlotProposalOutput[];
}

function pickEvidenceAtomIds(evidenceAtoms: EvidenceAtomRecord[], wantedTypes?: string[]): string[] {
  const filtered = wantedTypes?.length
    ? evidenceAtoms.filter(a => wantedTypes.includes(a.evidenceType))
    : evidenceAtoms;

  return filtered.length ? [filtered[0].atomId] : [];
}

export async function proposeSlotsStep(ctx: ProposeContext): Promise<SlotProposalOutput[]> {
  const { template, evidenceAtoms } = ctx;

  const proposals: SlotProposalOutput[] = template.slots.map((slot) => {
    const claimedObligationIds: string[] = Array.isArray(slot.claimedObligationIds)
      ? slot.claimedObligationIds
      : Array.isArray(slot.obligationIds)
        ? slot.obligationIds
        : [];

    const evidenceAtomIds = pickEvidenceAtomIds(evidenceAtoms, slot.requiredEvidenceTypes);

    const methodStatement =
      evidenceAtomIds.length
        ? `Deterministic: derived from ${evidenceAtomIds.length} evidence atoms (${(slot.requiredEvidenceTypes || []).join(", ") || "any"}), period-scoped and trace-linked.`
        : `Deterministic: no evidence atoms available for this case; slot generated as placeholder with explicit trace gap.`;

    return {
      proposalId: `${slot.slotId}:${Date.now()}`,
      slotId: slot.slotId,
      content: slot.demoContent ?? "",
      evidenceAtomIds,
      claimedObligationIds,
      methodStatement,
      transformations: slot.transformations ?? ["summarize"],
    };
  });

  ctx.slotProposals = proposals;
  ctx.log?.(`[Step 4/8] Propose Slots: Generated ${proposals.length} slot proposals`);

  return proposals;
}

export function pickEvidenceForSlot(
  evidenceAtoms: EvidenceAtomRecord[],
  requiredTypes?: string[]
): { atomIds: string[]; methodStatement: string } {
  const atomIds = pickEvidenceAtomIds(evidenceAtoms, requiredTypes);
  
  const methodStatement = atomIds.length
    ? `Deterministic: derived from ${atomIds.length} evidence atoms (${(requiredTypes || []).join(", ") || "any"}), period-scoped and trace-linked.`
    : `Deterministic: no evidence atoms available for this case; slot generated as placeholder with explicit trace gap.`;

  return { atomIds, methodStatement };
}
