import crypto from "crypto";
import { EvidenceAtomZ } from "../schemas/evidenceAtom.zod";

function stableHash(obj: any) {
  const json = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash("sha256").update(json).digest("hex");
}

export function buildAtom(params: {
  type: any;
  normalizedData: any;
  provenance: any;
}) {
  const contentHash = stableHash({
    type: params.type,
    normalizedData: params.normalizedData,
    provenance: params.provenance,
  });

  const atom = {
    atomId: `${params.type}:${contentHash.slice(0, 12)}`,
    type: params.type,
    version: 1,
    contentHash,
    data: params.normalizedData,
    normalizedData: params.normalizedData,
    provenance: params.provenance,
  };

  return EvidenceAtomZ.parse(atom);
}
