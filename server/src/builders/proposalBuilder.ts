import crypto from "crypto";

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

export class ProposalBuildError extends Error {
  constructor(
    message: string,
    public slotId: string,
    public missingFields: string[]
  ) {
    super(message);
    this.name = "ProposalBuildError";
  }
}

export interface BuildProposalParams {
  psurRef: string;
  slotId: string;
  content: string;
  evidenceAtomIds: string[];
  claimedObligationIds: string[];
  transformations?: string[];
  methodStatement?: string;
}

export interface BuiltProposal {
  proposalId: string;
  psurRef: string;
  slotId: string;
  content: string;
  evidenceAtomIds: string[];
  claimedObligationIds: string[];
  methodStatement: string;
  transformations: string[];
  createdAt: string;
}

/**
 * Builds a validated slot proposal with all required fields.
 * 
 * @param params - Proposal parameters
 * @returns Built proposal object
 * @throws ProposalBuildError if required fields are missing or empty
 */
export function buildProposal(params: BuildProposalParams): BuiltProposal {
  const missingFields: string[] = [];

  if (!params.psurRef || params.psurRef.trim().length === 0) {
    missingFields.push("psurRef");
  }

  if (!params.slotId || params.slotId.trim().length === 0) {
    missingFields.push("slotId");
  }

  if (!params.evidenceAtomIds || params.evidenceAtomIds.length === 0) {
    missingFields.push("evidenceAtomIds");
  }

  if (!params.claimedObligationIds || params.claimedObligationIds.length === 0) {
    missingFields.push("claimedObligationIds");
  }

  if (missingFields.length > 0) {
    throw new ProposalBuildError(
      `Cannot build proposal for slot "${params.slotId || 'unknown'}": ` +
      `missing required fields [${missingFields.join(", ")}]. ` +
      `Every proposal must have evidence atom references for traceability ` +
      `and obligation IDs for regulatory compliance tracking.`,
      params.slotId || "unknown",
      missingFields
    );
  }

  const transformations = params.transformations && params.transformations.length > 0
    ? params.transformations
    : ["summarize"];

  const methodStatement = params.methodStatement && params.methodStatement.trim().length >= 10
    ? params.methodStatement
    : `Generated for slot ${params.slotId} from ${params.evidenceAtomIds.length} evidence atom(s); ` +
      `transformations applied: ${transformations.join(", ")}.`;

  return {
    proposalId: makeId("prop"),
    psurRef: params.psurRef,
    slotId: params.slotId,
    content: params.content,
    evidenceAtomIds: params.evidenceAtomIds,
    claimedObligationIds: params.claimedObligationIds,
    methodStatement,
    transformations,
    createdAt: new Date().toISOString(),
  };
}
