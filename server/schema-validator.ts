import { createHash } from "crypto";
import { EVIDENCE_DEFINITIONS, type EvidenceType, CANONICAL_EVIDENCE_TYPES } from "@shared/schema";

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
}

export interface EvidenceAtomInput {
  atomType: EvidenceType;
  payload: Record<string, unknown>;
  deviceRef?: {
    deviceId?: number;
    deviceCode: string;
    deviceName?: string;
    udiDi?: string;
  };
  psurPeriod?: {
    psurCaseId?: number;
    periodStart: string;
    periodEnd: string;
    reportingInterval?: "annual" | "biennial" | "triennial" | "custom";
  };
}

export interface ProvenanceInput {
  sourceSystem: string;
  sourceFile: string;
  sourceFileSha256: string;
  uploadId?: number;
  uploadedAt: string;
  uploadedBy?: string;
  parserVersion?: string;
  extractionTimestamp?: string;
  jurisdiction?: string;
}

export interface EvidenceAtomOutput {
  atomId: string;
  atomType: string;
  version: number;
  status: "valid" | "invalid" | "superseded";
  psurPeriod?: EvidenceAtomInput["psurPeriod"];
  deviceRef?: EvidenceAtomInput["deviceRef"];
  provenance: ProvenanceInput;
  contentHash: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export function computeFileSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function deepSortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(deepSortKeys);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = deepSortKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function computeContentHash(payload: Record<string, unknown>): string {
  const canonical = deepSortKeys(payload);
  const normalized = JSON.stringify(canonical);
  return createHash("sha256").update(normalized).digest("hex");
}

export function generateAtomId(atomType: string, contentHash: string): string {
  return `${atomType}:${contentHash}`;
}

export function validateDeviceRef(deviceRef: unknown): ValidationResult {
  const errors: Array<{ path: string; message: string }> = [];
  
  if (!deviceRef || typeof deviceRef !== "object") {
    return { valid: false, errors: [{ path: "", message: "deviceRef must be an object" }] };
  }
  
  const ref = deviceRef as Record<string, unknown>;
  if (!ref.deviceCode || typeof ref.deviceCode !== "string") {
    errors.push({ path: "/deviceCode", message: "deviceCode is required and must be a string" });
  }
  
  return { valid: errors.length === 0, errors };
}

export function validateProvenance(provenance: unknown): ValidationResult {
  const errors: Array<{ path: string; message: string }> = [];
  
  if (!provenance || typeof provenance !== "object") {
    return { valid: false, errors: [{ path: "", message: "provenance must be an object" }] };
  }
  
  const p = provenance as Record<string, unknown>;
  if (!p.sourceSystem || typeof p.sourceSystem !== "string") {
    errors.push({ path: "/sourceSystem", message: "sourceSystem is required" });
  }
  if (!p.sourceFile || typeof p.sourceFile !== "string") {
    errors.push({ path: "/sourceFile", message: "sourceFile is required" });
  }
  if (!p.sourceFileSha256 || typeof p.sourceFileSha256 !== "string") {
    errors.push({ path: "/sourceFileSha256", message: "sourceFileSha256 is required" });
  }
  if (!p.uploadedAt || typeof p.uploadedAt !== "string") {
    errors.push({ path: "/uploadedAt", message: "uploadedAt is required" });
  }
  
  return { valid: errors.length === 0, errors };
}

export function validatePsurPeriod(period: unknown): ValidationResult {
  const errors: Array<{ path: string; message: string }> = [];
  
  if (!period || typeof period !== "object") {
    return { valid: false, errors: [{ path: "", message: "period must be an object" }] };
  }
  
  const p = period as Record<string, unknown>;
  if (!p.periodStart || typeof p.periodStart !== "string") {
    errors.push({ path: "/periodStart", message: "periodStart is required" });
  }
  if (!p.periodEnd || typeof p.periodEnd !== "string") {
    errors.push({ path: "/periodEnd", message: "periodEnd is required" });
  }
  
  return { valid: errors.length === 0, errors };
}

export function validateEvidenceAtomPayload(atomType: string, payload: unknown): ValidationResult {
  const definition = EVIDENCE_DEFINITIONS.find(d => d.type === atomType);
  
  if (!definition) {
    // Allow any type that's in CANONICAL_EVIDENCE_TYPES or has a valid structure
    if (Object.values(CANONICAL_EVIDENCE_TYPES).includes(atomType as any)) {
      return { valid: true, errors: [] };
    }
    // For unknown types, just ensure payload is an object
    if (payload && typeof payload === "object") {
      return { valid: true, errors: [] };
    }
    return { valid: false, errors: [{ path: "", message: `Invalid payload for type: ${atomType}` }] };
  }
  
  if (definition.requiredFields.length > 0) {
    const payloadObj = payload as Record<string, unknown>;
    const missingFields = definition.requiredFields.filter(f => !(f in payloadObj));
    if (missingFields.length > 0) {
      return {
        valid: false,
        errors: missingFields.map(f => ({ path: `/${f}`, message: `required field missing: ${f}` }))
      };
    }
  }
  
  return { valid: true, errors: [] };
}

export function buildEvidenceAtom(
  input: EvidenceAtomInput,
  provenance: ProvenanceInput
): { atom: EvidenceAtomOutput; errors: Array<{ path: string; message: string }> } {
  const errors: Array<{ path: string; message: string }> = [];
  
  const payloadValidation = validateEvidenceAtomPayload(input.atomType, input.payload);
  if (!payloadValidation.valid) {
    errors.push(...payloadValidation.errors.map(e => ({ ...e, path: `/payload${e.path}` })));
  }
  
  const provenanceValidation = validateProvenance(provenance);
  if (!provenanceValidation.valid) {
    errors.push(...provenanceValidation.errors.map(e => ({ ...e, path: `/provenance${e.path}` })));
  }
  
  if (input.deviceRef) {
    const deviceRefValidation = validateDeviceRef(input.deviceRef);
    if (!deviceRefValidation.valid) {
      errors.push(...deviceRefValidation.errors.map(e => ({ ...e, path: `/deviceRef${e.path}` })));
    }
  }
  
  if (input.psurPeriod) {
    const periodValidation = validatePsurPeriod(input.psurPeriod);
    if (!periodValidation.valid) {
      errors.push(...periodValidation.errors.map(e => ({ ...e, path: `/psurPeriod${e.path}` })));
    }
  }
  
  const contentHash = computeContentHash(input.payload);
  const atomId = generateAtomId(input.atomType, contentHash);
  
  const atom: EvidenceAtomOutput = {
    atomId,
    atomType: input.atomType,
    version: 1,
    status: errors.length > 0 ? "invalid" : "valid",
    psurPeriod: input.psurPeriod,
    deviceRef: input.deviceRef,
    provenance,
    contentHash,
    payload: input.payload,
    createdAt: new Date().toISOString()
  };
  
  return { atom, errors };
}

export function getAvailableSchemaTypes(): string[] {
  return EVIDENCE_DEFINITIONS.map(d => d.type);
}

export function validateWithAjv(schemaName: string, data: unknown): {
  ok: boolean;
  errors: Array<{ path: string; message: string; keyword?: string }>;
} {
  // Simplified validation without AJV - just check basic structure
  if (!data || typeof data !== "object") {
    return { ok: false, errors: [{ path: "", message: "Data must be an object" }] };
  }
  return { ok: true, errors: [] };
}

export function hasSchemaFor(atomType: string): boolean {
  return EVIDENCE_DEFINITIONS.some(d => d.type === atomType) || 
         Object.values(CANONICAL_EVIDENCE_TYPES).includes(atomType as any);
}

export interface SlotProposalInput {
  slotId: string;
  templateId: string;
  content?: string;
  evidenceAtomIds: number[];
  claimedObligationIds: string[];
  methodStatement: string;
  transformations?: string[];
  confidenceScore?: number;
  psurCaseId?: number;
  status?: "pending" | "accepted" | "rejected" | "needs_review";
}

export interface SlotProposalValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
}

export function validateSlotProposal(proposal: unknown): SlotProposalValidationResult {
  const errors: Array<{ path: string; message: string }> = [];
  const warnings: Array<{ path: string; message: string }> = [];
  
  if (!proposal || typeof proposal !== "object") {
    return { valid: false, errors: [{ path: "", message: "proposal must be an object" }], warnings: [] };
  }
  
  const p = proposal as Record<string, unknown>;
  
  if (!p.slotId || typeof p.slotId !== "string") {
    errors.push({ path: "/slotId", message: "slotId is required and must be a string" });
  }
  
  if (!p.evidenceAtomIds || !Array.isArray(p.evidenceAtomIds) || p.evidenceAtomIds.length === 0) {
    errors.push({ 
      path: "/evidenceAtomIds", 
      message: "evidenceAtomIds is required and must contain at least one atom ID for traceability" 
    });
  }
  
  if (!p.claimedObligationIds || !Array.isArray(p.claimedObligationIds) || p.claimedObligationIds.length === 0) {
    errors.push({ 
      path: "/claimedObligationIds", 
      message: "claimedObligationIds is required and must claim at least one obligation" 
    });
  }
  
  if (!p.methodStatement || typeof p.methodStatement !== "string" || p.methodStatement.length < 10) {
    errors.push({ 
      path: "/methodStatement", 
      message: "methodStatement is required and must explain how evidence was used (min 10 chars)" 
    });
  }
  
  if (p.confidenceScore !== undefined) {
    const score = p.confidenceScore as number;
    if (score < 0.5) {
      warnings.push({ 
        path: "/confidenceScore", 
        message: `Low confidence score (${score}) - consider manual review` 
      });
    }
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

export function validateSlotProposalForAdjudication(
  proposal: SlotProposalInput,
  validObligationIds: string[]
): SlotProposalValidationResult {
  const baseValidation = validateSlotProposal(proposal);
  
  if (!baseValidation.valid) {
    return baseValidation;
  }
  
  const errors: Array<{ path: string; message: string }> = [];
  const warnings = [...baseValidation.warnings];
  
  const invalidObligations = proposal.claimedObligationIds.filter(
    id => !validObligationIds.includes(id)
  );
  
  if (invalidObligations.length > 0) {
    errors.push({
      path: "/claimedObligationIds",
      message: `Invalid obligation IDs: ${invalidObligations.join(", ")}. Must reference valid obligations from the template.`
    });
  }
  
  if (proposal.claimedObligationIds.length === 0) {
    errors.push({
      path: "/claimedObligationIds",
      message: "Proposal must satisfy at least one obligation to be accepted"
    });
  }
  
  return { valid: errors.length === 0, errors, warnings };
}
