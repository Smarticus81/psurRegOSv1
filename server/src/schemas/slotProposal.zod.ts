import { z } from "zod";

export const SlotProposalZ = z.object({
  proposalId: z.string().min(8),
  psurRef: z.string().min(1),
  slotId: z.string().min(1),
  content: z.string(),
  evidenceAtomIds: z.array(z.string()).min(1),
  claimedObligationIds: z.array(z.string()).min(1),
  methodStatement: z.string().min(10),
  transformations: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
});

export type SlotProposal = z.infer<typeof SlotProposalZ>;
