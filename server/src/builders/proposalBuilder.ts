import crypto from "crypto";

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

export function buildProposal(params: {
  psurRef: string;
  slotId: string;
  content: string;
  evidenceAtomIds: string[];
  claimedObligationIds: string[];
  transformations?: string[];
}) {
  return {
    proposalId: makeId("prop"),
    psurRef: params.psurRef,
    slotId: params.slotId,
    content: params.content,
    evidenceAtomIds: params.evidenceAtomIds.length ? params.evidenceAtomIds : ["MISSING_ATOM_FIXME"],
    claimedObligationIds: params.claimedObligationIds.length
      ? params.claimedObligationIds
      : ["MISSING_OBLIGATION_FIXME"],
    methodStatement:
      `Generated for slot ${params.slotId} from ${params.evidenceAtomIds.length} evidence atoms; ` +
      `transformations: ${(params.transformations || ["summarize"]).join(", ")}`,
    transformations: params.transformations || ["summarize"],
    createdAt: new Date().toISOString(),
  };
}
