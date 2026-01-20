import crypto from "crypto";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function stableStringify(obj: any) {
  try {
    return JSON.stringify(obj, Object.keys(obj || {}).sort());
  } catch {
    return JSON.stringify(obj);
  }
}

function ensureString(v: any, fallback: string) {
  if (typeof v === "string" && v.trim().length > 0) return v;
  return fallback;
}

function ensureStringArray(v: any): string[] {
  if (Array.isArray(v) && v.every((x) => typeof x === "string" && x.length > 0)) {
    return v;
  }
  return [];
}

function ensureObject(v: any, fallback: any) {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  return fallback;
}

function inferAtomType(a: any): string {
  const t = a?.type || a?.evidenceType || a?.evidence_type;
  if (typeof t === "string") return t;

  const n = a?.normalizedData || a?.data || {};
  if (n?.complaintId || n?.complaintDate) return "complaint_record";
  if (n?.incidentId || n?.imdrfCode) return "incident_record";
  if (n?.fscaId || n?.fscaDate) return "fsca_record";
  if (n?.studyId || n?.pmcf) return "pmcf_result";
  if (n?.pubmedId || n?.doi) return "literature_result";
  return "sales_volume";
}

export interface NormalizationWarning {
  field: string;
  message: string;
  slotId?: string;
  proposalId?: string;
}

export class ProposalValidationError extends Error {
  constructor(
    message: string,
    public slotId: string,
    public missingFields: string[]
  ) {
    super(message);
    this.name = "ProposalValidationError";
  }
}

export function normalizeEvidenceAtoms(rawAtoms: any[], ctx?: { deviceCode?: string; periodStart?: string; periodEnd?: string }) {
  const atoms = Array.isArray(rawAtoms) ? rawAtoms : [];

  return atoms.map((a, idx) => {
    const normalizedData =
      a?.normalizedData ??
      a?.data ??
      a?.row ??
      a?.normalized ??
      a ??
      {};

    const type = inferAtomType(a);

    const provenance = ensureObject(a?.provenance, {
      uploadId: a?.uploadId ?? a?.upload?.id ?? 0,
      sourceFile: a?.sourceFile ?? a?.upload?.filename ?? a?.filename ?? "unknown",
      extractedAt: a?.extractedAt ?? a?.uploadedAt ?? new Date().toISOString(),
      deviceRef: { deviceCode: ctx?.deviceCode || a?.deviceCode || normalizedData?.deviceCode || "UNKNOWN_DEVICE" },
      psurPeriod: { periodStart: ctx?.periodStart || "UNKNOWN_START", periodEnd: ctx?.periodEnd || "UNKNOWN_END" },
      filters: a?.filters ?? {},
    });

    const contentHash = ensureString(
      a?.contentHash,
      sha256Hex(stableStringify({ type, normalizedData, provenance, idx }))
    );

    const atomId = ensureString(
      a?.atomId,
      `${type}:${contentHash.slice(0, 12)}`
    );

    const data = a?.data ?? normalizedData;

    return {
      atomId,
      type,
      version: typeof a?.version === "number" ? a.version : 1,
      contentHash,
      data,
      normalizedData,
      provenance,
    };
  });
}

export interface NormalizedSlotProposal {
  proposalId: string;
  psurRef: string;
  slotId: string;
  content: string;
  evidenceAtomIds: string[];
  claimedObligationIds: string[];
  methodStatement: string;
  transformations: string[];
  createdAt: string;
  [key: string]: unknown;
}

export interface NormalizeSlotProposalsOptions {
  /** If true, throws ProposalValidationError when required fields are missing. Default: true */
  strict?: boolean;
}

/**
 * Normalizes raw slot proposals into a consistent format.
 * 
 * In strict mode (default), throws ProposalValidationError if:
 * - evidenceAtomIds is empty (traceability required)
 * - claimedObligationIds is empty (regulatory mapping required)
 * 
 * @param rawProposals - Raw proposal data from various sources
 * @param template - Template containing obligation mappings
 * @param options - Normalization options
 * @returns Normalized proposals array
 * @throws ProposalValidationError if strict mode and required fields missing
 */
export function normalizeSlotProposals(
  rawProposals: any[],
  template?: any,
  options: NormalizeSlotProposalsOptions = { strict: true }
): NormalizedSlotProposal[] {
  const proposals = Array.isArray(rawProposals) ? rawProposals : [];
  const { strict = true } = options;

  return proposals.map((p, idx) => {
    const slotId = p?.slotId || p?.slot_id || p?.slot;
    
    if (!slotId) {
      throw new ProposalValidationError(
        `Proposal at index ${idx} is missing required slotId`,
        `unknown_slot_${idx}`,
        ["slotId"]
      );
    }
    
    const psurRef = p?.psurRef || p?.psur_ref || p?.caseRef || p?.case_ref;
    
    if (!psurRef) {
      throw new ProposalValidationError(
        `Proposal for slot "${slotId}" is missing required psurRef (PSUR case reference)`,
        slotId,
        ["psurRef"]
      );
    }
    
    const content = typeof p?.content === "string" ? p.content : (typeof p?.text === "string" ? p.text : "");

    // Extract evidence atom IDs from multiple possible field names
    const evidenceAtomIds = ensureStringArray(p?.evidenceAtomIds) || 
                            ensureStringArray(p?.evidence_atom_ids);

    // Get obligation IDs from proposal or fall back to template mapping
    const templateObligations = template?.mapping?.[slotId] || 
                                template?.mapping?.[p?.slot_id] || 
                                [];
    const claimedObligationIds = ensureStringArray(p?.claimedObligationIds) || 
                                 ensureStringArray(p?.claimed_obligation_ids) ||
                                 ensureStringArray(templateObligations);

    // Strict validation: require evidence traceability
    if (strict && evidenceAtomIds.length === 0) {
      throw new ProposalValidationError(
        `Proposal for slot "${slotId}" has no evidence atom IDs. ` +
        `Every proposal must reference at least one evidence atom for traceability. ` +
        `Provide evidenceAtomIds array with valid atom references.`,
        slotId,
        ["evidenceAtomIds"]
      );
    }

    // Strict validation: require regulatory obligation mapping
    if (strict && claimedObligationIds.length === 0) {
      throw new ProposalValidationError(
        `Proposal for slot "${slotId}" has no claimed obligation IDs. ` +
        `Every proposal must claim at least one regulatory obligation. ` +
        `Provide claimedObligationIds array or ensure template has mapping for this slot.`,
        slotId,
        ["claimedObligationIds"]
      );
    }

    const methodStatement =
      typeof p?.methodStatement === "string" && p.methodStatement.trim().length >= 10
        ? p.methodStatement
        : `Evidence used to support slot ${slotId} with traceability references.`;

    const proposalId = ensureString(
      p?.proposalId,
      `prop-${crypto.randomBytes(6).toString("hex")}`
    );

    return {
      ...p,
      proposalId,
      psurRef,
      slotId,
      content: content || "",
      evidenceAtomIds,
      claimedObligationIds,
      methodStatement,
      transformations: Array.isArray(p?.transformations) ? p.transformations : ["summarize", "cite"],
      createdAt: typeof p?.createdAt === "string" ? p.createdAt : new Date().toISOString(),
    };
  });
}
