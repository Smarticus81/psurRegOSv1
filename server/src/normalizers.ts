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

function ensureStringArray(v: any, fallback: string[]) {
  if (Array.isArray(v) && v.every((x) => typeof x === "string" && x.length > 0) && v.length > 0) return v;
  return fallback;
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

export function normalizeSlotProposals(
  rawProposals: any[],
  template?: any
) {
  const proposals = Array.isArray(rawProposals) ? rawProposals : [];

  return proposals.map((p, idx) => {
    const slotId = p?.slotId || p?.slot_id || p?.slot || `UNKNOWN_SLOT_${idx}`;
    const psurRef = p?.psurRef || p?.psur_ref || p?.caseRef || p?.case_ref || "UNKNOWN_PSUR_REF";
    const content = typeof p?.content === "string" ? p.content : (typeof p?.text === "string" ? p.text : "");

    const evidenceAtomIds = ensureStringArray(p?.evidenceAtomIds, ensureStringArray(p?.evidence_atom_ids, []));
    const fixedEvidenceAtomIds = evidenceAtomIds.length ? evidenceAtomIds : ["TRACE_ATOM_MISSING_FIXME"];

    const fromTemplate =
      template?.mapping?.[slotId] ||
      template?.mapping?.[p?.slot_id] ||
      [];
    const claimedObligationIds = ensureStringArray(p?.claimedObligationIds, ensureStringArray(p?.claimed_obligation_ids, fromTemplate));
    const fixedClaimedObligationIds = claimedObligationIds.length ? claimedObligationIds : ["TRACE_OBLIGATION_MISSING_FIXME"];

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
      content: content || "", // Content generated dynamically by renderer from evidence atoms
      evidenceAtomIds: fixedEvidenceAtomIds,
      claimedObligationIds: fixedClaimedObligationIds,
      methodStatement,
      transformations: Array.isArray(p?.transformations) ? p.transformations : ["summarize", "cite"],
      createdAt: typeof p?.createdAt === "string" ? p.createdAt : new Date().toISOString(),
    };
  });
}
