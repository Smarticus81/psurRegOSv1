import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { slotDefinitions, slotObligationLinks, SlotDefinition as DBSlotDefinition } from "@shared/schema";
import { EvidenceAtomRecord } from "../../services/evidenceStore";

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
  templateId: string;
  evidenceAtoms: EvidenceAtomRecord[];
  log?: (msg: string) => void;
  slotProposals?: SlotProposalOutput[];
}

/**
 * Step 4: Propose Slots
 * 
 * INDUSTRY-READY BEHAVIOR:
 * - Loads canonical slot definitions from the database (not template JSON)
 * - Enforces evidence contracts deterministically
 * - Hard-fails if required evidence is missing for any slot
 * - Links proposals to canonical obligations from the database
 */
export async function proposeSlotsStep(ctx: ProposeContext): Promise<SlotProposalOutput[]> {
  const { templateId, evidenceAtoms } = ctx;

  // ═══════════════════════════════════════════════════════════════════════════
  // Load canonical slot definitions from database
  // ═══════════════════════════════════════════════════════════════════════════
  const canonicalSlots = await db
    .select()
    .from(slotDefinitions)
    .where(eq(slotDefinitions.templateId, templateId))
    .orderBy(slotDefinitions.sortOrder);

  if (!canonicalSlots.length) {
    throw new Error(
      `No slot definitions found for templateId=${templateId}. ` +
      `Run 'npm run db:seed:slots' to seed the slot catalog.`
    );
  }

  ctx.log?.(`[Step 4/8] Loaded ${canonicalSlots.length} canonical slots from database for template: ${templateId}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Load obligation links for this template
  // ═══════════════════════════════════════════════════════════════════════════
  const links = await db
    .select()
    .from(slotObligationLinks)
    .where(eq(slotObligationLinks.templateId, templateId));

  ctx.log?.(`[Step 4/8] Loaded ${links.length} slot↔obligation links`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Generate proposals for each canonical slot
  // ═══════════════════════════════════════════════════════════════════════════
  const proposals: SlotProposalOutput[] = [];
  const missingEvidenceErrors: string[] = [];

  for (const slot of canonicalSlots) {
    // Get obligation links for this slot
    const slotLinks = links.filter((l: typeof links[number]) => l.slotId === slot.slotId);
    const claimedObligationIds = slotLinks.map((l: typeof links[number]) => l.obligationId);

    if (claimedObligationIds.length === 0) {
      throw new Error(
        `Slot ${slot.slotId} has no obligation links. ` +
        `Run 'npm run db:seed:slots' to seed slot_obligation_links.`
      );
    }

    // Find eligible evidence atoms that match required types
    const requiredTypes = slot.requiredEvidenceTypes as string[];
    const eligibleAtoms = evidenceAtoms.filter(a =>
      requiredTypes.includes(a.evidenceType)
    );

    // ═══════════════════════════════════════════════════════════════════════
    // INDUSTRY-READY: Enforce evidence contracts deterministically
    // ═══════════════════════════════════════════════════════════════════════
    if (slot.hardRequireEvidence && eligibleAtoms.length < slot.minAtoms) {
      missingEvidenceErrors.push(
        `Slot "${slot.title}" (${slot.slotId}): ` +
        `Required evidence types: [${requiredTypes.join(", ")}], ` +
        `Found: ${eligibleAtoms.length} atoms (need: ${slot.minAtoms})`
      );
    }

    // Select atoms up to minAtoms
    const selectedAtoms = eligibleAtoms.slice(0, slot.minAtoms);
    const evidenceAtomIds = selectedAtoms.map(a => a.atomId);

    // Build method statement
    const methodStatement = evidenceAtomIds.length > 0
      ? `Deterministic slot generator. Evidence types: [${requiredTypes.join(", ")}]. ` +
      `Atoms used: [${evidenceAtomIds.join(", ")}]. ` +
      `Obligations claimed: [${claimedObligationIds.join(", ")}].`
      : `EVIDENCE GAP: No atoms available for types [${requiredTypes.join(", ")}]. ` +
      `Upload evidence before proceeding.`;

    proposals.push({
      proposalId: `${slot.slotId}:${Date.now()}`,
      slotId: slot.slotId,
      content: "", // Content will be generated in Step 5
      evidenceAtomIds,
      claimedObligationIds,
      methodStatement,
      transformations: ["summarize", "cite_evidence"],
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HARD-FAIL if any required evidence is missing
  // ═══════════════════════════════════════════════════════════════════════════
  if (missingEvidenceErrors.length > 0) {
    ctx.log?.(`[Step 4/8] ❌ Missing evidence for ${missingEvidenceErrors.length} slots`);
    throw new Error(
      `Missing required evidence for ${missingEvidenceErrors.length} slot(s):\n` +
      missingEvidenceErrors.map(e => `  - ${e}`).join("\n") +
      `\n\nUpload the required evidence before running generation.`
    );
  }

  ctx.slotProposals = proposals;
  ctx.log?.(`[Step 4/8] Propose Slots: Generated ${proposals.length} contract-compliant proposals`);

  return proposals;
}

/**
 * Helper: Pick evidence atoms for a slot based on required types
 */
export function pickEvidenceForSlot(
  evidenceAtoms: EvidenceAtomRecord[],
  requiredTypes?: string[]
): { atomIds: string[]; methodStatement: string } {
  const filtered = requiredTypes?.length
    ? evidenceAtoms.filter(a => requiredTypes.includes(a.evidenceType))
    : evidenceAtoms;

  const atomIds = filtered.length ? [filtered[0].atomId] : [];

  const methodStatement = atomIds.length
    ? `Deterministic: derived from ${atomIds.length} evidence atoms (${(requiredTypes || []).join(", ") || "any"}), period-scoped and trace-linked.`
    : `Deterministic: no evidence atoms available for this case; slot generated as placeholder with explicit trace gap.`;

  return { atomIds, methodStatement };
}
