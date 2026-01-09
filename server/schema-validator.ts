import Ajv from "ajv";
import addFormats from "ajv-formats";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "crypto";
import { EVIDENCE_DEFINITIONS, type EvidenceType } from "@shared/schema";

const ajv = new Ajv({ 
  strict: false, 
  allErrors: true,
  verbose: true
});
addFormats(ajv);

const schemasDir = path.join(process.cwd(), "schemas");

const deviceRefSchema = JSON.parse(fs.readFileSync(path.join(schemasDir, "device_ref.schema.json"), "utf-8"));
const provenanceSchema = JSON.parse(fs.readFileSync(path.join(schemasDir, "provenance.schema.json"), "utf-8"));
const psurPeriodSchema = JSON.parse(fs.readFileSync(path.join(schemasDir, "psur_period.schema.json"), "utf-8"));
const evidenceAtomBaseSchema = JSON.parse(fs.readFileSync(path.join(schemasDir, "evidence_atom_base.schema.json"), "utf-8"));
const salesVolumeSchema = JSON.parse(fs.readFileSync(path.join(schemasDir, "evidence_atom.sales_volume.schema.json"), "utf-8"));
const complaintRecordSchema = JSON.parse(fs.readFileSync(path.join(schemasDir, "evidence_atom.complaint_record.schema.json"), "utf-8"));
const slotProposalSchema = JSON.parse(fs.readFileSync(path.join(schemasDir, "slot_proposal.schema.json"), "utf-8"));

ajv.addSchema(deviceRefSchema, "device_ref.schema.json");
ajv.addSchema(provenanceSchema, "provenance.schema.json");
ajv.addSchema(psurPeriodSchema, "psur_period.schema.json");
ajv.addSchema(evidenceAtomBaseSchema, "evidence_atom_base.schema.json");
ajv.addSchema(salesVolumeSchema, "evidence_atom.sales_volume.schema.json");
ajv.addSchema(complaintRecordSchema, "evidence_atom.complaint_record.schema.json");
ajv.addSchema(slotProposalSchema, "slot_proposal.schema.json");

const typeSchemaMap: Record<string, string> = {
  "sales_volume": "evidence_atom.sales_volume.schema.json",
  "complaint_record": "evidence_atom.complaint_record.schema.json",
};

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
  const validate = ajv.getSchema("device_ref.schema.json");
  if (!validate) {
    return { valid: false, errors: [{ path: "", message: "device_ref schema not found" }] };
  }
  const valid = validate(deviceRef);
  if (valid) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: (validate.errors || []).map(e => ({
      path: e.instancePath || "/",
      message: e.message || "validation error"
    }))
  };
}

export function validateProvenance(provenance: unknown): ValidationResult {
  const validate = ajv.getSchema("provenance.schema.json");
  if (!validate) {
    return { valid: false, errors: [{ path: "", message: "provenance schema not found" }] };
  }
  const valid = validate(provenance);
  if (valid) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: (validate.errors || []).map(e => ({
      path: e.instancePath || "/",
      message: e.message || "validation error"
    }))
  };
}

export function validatePsurPeriod(period: unknown): ValidationResult {
  const validate = ajv.getSchema("psur_period.schema.json");
  if (!validate) {
    return { valid: false, errors: [{ path: "", message: "psur_period schema not found" }] };
  }
  const valid = validate(period);
  if (valid) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: (validate.errors || []).map(e => ({
      path: e.instancePath || "/",
      message: e.message || "validation error"
    }))
  };
}

export function validateEvidenceAtomPayload(atomType: string, payload: unknown): ValidationResult {
  const schemaName = typeSchemaMap[atomType];
  
  if (!schemaName) {
    const definition = EVIDENCE_DEFINITIONS.find(d => d.type === atomType);
    if (!definition) {
      return { valid: false, errors: [{ path: "", message: `Unknown evidence type: ${atomType}` }] };
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
  
  const validate = ajv.getSchema(schemaName);
  if (!validate) {
    return { valid: false, errors: [{ path: "", message: `Schema not found: ${schemaName}` }] };
  }
  
  const testObj = { atomType, payload };
  const valid = validate(testObj);
  if (valid) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: (validate.errors || []).map(e => ({
      path: e.instancePath || "/",
      message: e.message || "validation error"
    }))
  };
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
  return Object.keys(typeSchemaMap);
}

export function hasSchemaFor(atomType: string): boolean {
  return atomType in typeSchemaMap;
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
  const validate = ajv.getSchema("slot_proposal.schema.json");
  if (!validate) {
    return { 
      valid: false, 
      errors: [{ path: "", message: "slot_proposal schema not found" }],
      warnings: []
    };
  }
  
  const valid = validate(proposal);
  const errors: Array<{ path: string; message: string }> = [];
  const warnings: Array<{ path: string; message: string }> = [];
  
  if (!valid) {
    for (const e of validate.errors || []) {
      errors.push({
        path: e.instancePath || "/",
        message: e.message || "validation error"
      });
    }
  }
  
  const p = proposal as Record<string, unknown>;
  
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
