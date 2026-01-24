/**
 * TEMPLATE STORE
 *
 * Central template loader with strict Zod validation.
 *
 * Responsibilities:
 * - Lists all JSON templates in server/templates folder
 * - Validates template schema using Zod (templateSchema.ts)
 * - Indexes templates by template_id
 * - Enforces deterministic constraints
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  TemplateZ,
  validateTemplate as zodValidateTemplate,
  formatTemplateErrors,
  type Template,
  type SlotDefinition,
  type TemplateDefaults,
} from "./templates/templateSchema";
import {
  validateFormTemplate,
  isFormBasedTemplate,
  formatFormTemplateErrors,
  type FormTemplate,
} from "./templates/formTemplateSchema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type HttpError = Error & { status?: number };

function httpError(status: number, message: string): HttpError {
  const err: HttpError = new Error(message);
  err.status = status;
  return err;
}

// Re-export types for backward compatibility
export type { Template, SlotDefinition as TemplateSlot, TemplateDefaults, FormTemplate };

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  templateType?: 'slot-based' | 'form-based';
}

// -----------------------------------------------------------------------------
// TEMPLATE ALIASES
// -----------------------------------------------------------------------------

const TEMPLATE_ALIASES: Record<string, string> = {
  "MDCG_2022_21": "MDCG_2022_21_ANNEX_I",
  "MDCG_2022_21_ANNEX_I": "MDCG_2022_21_ANNEX_I",
  "mdcg_2022_21_annex_i": "MDCG_2022_21_ANNEX_I",
  "mdcg_2022_21": "MDCG_2022_21_ANNEX_I",
};

// -----------------------------------------------------------------------------
// TEMPLATE DIRECTORY
// -----------------------------------------------------------------------------

function getTemplatesDir(): string {
  // Try resolving relative to CWD first (most reliable in production/docker)
  const cwdPath = path.resolve(process.cwd(), "server", "templates");
  if (fs.existsSync(cwdPath)) return cwdPath;

  // Fallback for development/local where __dirname might work better
  return path.resolve(__dirname, "..", "..", "templates");
}

export function getTemplateDirsDebugInfo() {
  const dirs = [
    path.resolve(process.cwd(), "server", "templates"),
    path.resolve(__dirname, "..", "..", "templates"),
    path.resolve(__dirname, "templates"),
  ];

  return {
    cwd: process.cwd(),
    __dirname,
    checks: dirs.map(dir => ({
      dir,
      exists: fs.existsSync(dir),
      files: fs.existsSync(dir) ? fs.readdirSync(dir) : [],
    })),
  };
}

// -----------------------------------------------------------------------------
// LIST TEMPLATES
// -----------------------------------------------------------------------------

export function listTemplates(): string[] {
  const dir = getTemplatesDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

export function listTemplatesWithMetadata(): { templateId: string; name: string; version: string; jurisdictions: string[]; templateType: 'slot-based' | 'form-based' }[] {
  const templates: { templateId: string; name: string; version: string; jurisdictions: string[]; templateType: 'slot-based' | 'form-based' }[] = [];
  const dir = getTemplatesDir();
  
  if (!fs.existsSync(dir)) return templates;
  
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  
  for (const file of files) {
    try {
      const filePath = path.join(dir, file);
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      
      // Detect form-based vs slot-based templates
      if (isFormBasedTemplate(parsed)) {
        templates.push({
          templateId: parsed.form?.form_id || file.replace(".json", ""),
          name: parsed.form?.form_title || "Custom Form Template",
          version: parsed.form?.revision || "1.0",
          jurisdictions: ["EU_MDR"],
          templateType: 'form-based',
        });
      } else {
        templates.push({
          templateId: parsed.template_id,
          name: parsed.name,
          version: parsed.version,
          jurisdictions: parsed.jurisdiction_scope || [],
          templateType: 'slot-based',
        });
      }
    } catch (e) {
      console.warn(`[TemplateStore] Failed to parse ${file}:`, e);
    }
  }
  
  return templates;
}

// -----------------------------------------------------------------------------
// VALIDATE TEMPLATE (using Zod - supports both slot-based and form-based)
// -----------------------------------------------------------------------------

export function validateTemplate(template: unknown): TemplateValidationResult {
  // First, detect if this is a form-based template
  if (isFormBasedTemplate(template)) {
    const result = validateFormTemplate(template);
    
    if (result.success) {
      const warnings: string[] = [];
      const t = result.data;
      
      // Validate form has required sections
      if (!t.sections) {
        warnings.push("No sections defined in form template");
      }
      
      return { valid: true, errors: [], warnings, templateType: 'form-based' };
    }
    
    return {
      valid: false,
      errors: formatFormTemplateErrors(result.errors),
      warnings: [],
      templateType: 'form-based',
    };
  }
  
  // Otherwise, validate as slot-based template
  const result = zodValidateTemplate(template);
  
  if (result.success) {
    const warnings: string[] = [];
    
    // Additional business logic warnings
    const t = result.data;
    for (const slot of t.slots) {
      if (slot.slot_kind === "TABLE" && !slot.output_requirements.table_schema) {
        warnings.push(`Slot '${slot.slot_id}' has slot_kind=TABLE but no table_schema defined`);
      }
    }
    
    return { valid: true, errors: [], warnings, templateType: 'slot-based' };
  }
  
  return {
    valid: false,
    errors: formatTemplateErrors(result.errors),
    warnings: [],
    templateType: 'slot-based',
  };
}

// -----------------------------------------------------------------------------
// LOAD TEMPLATE
// -----------------------------------------------------------------------------

export function loadTemplate(templateIdRaw: string): Template {
  const templateId = (templateIdRaw || "").trim();
  if (!templateId) throw httpError(400, "templateId is required");

  const canonicalId = TEMPLATE_ALIASES[templateId] || templateId;
  const dir = getTemplatesDir();
  const filePath = path.join(dir, `${canonicalId}.json`);

  console.log(`[TemplateStore] Loading template: ${templateId} -> ${canonicalId}`);
  console.log(`[TemplateStore] Path: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw httpError(
      400,
      `Template '${templateId}' not found. Expected file: ${filePath}. Available: ${listTemplates().join(", ")}`
    );
  }

  const raw = fs.readFileSync(filePath, "utf8");
  let parsed: unknown;
  
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    throw httpError(500, `Template '${canonicalId}' JSON parse error: ${e?.message || e}`);
  }

  // Validate using Zod schema
  const validation = zodValidateTemplate(parsed);
  
  if (!validation.success) {
    const errors = formatTemplateErrors(validation.errors);
    console.error(`[TemplateStore] Template validation errors:`, errors);
    throw httpError(500, `Template '${canonicalId}' validation failed:\n${errors.join("\n")}`);
  }

  const template = validation.data;
  console.log(`[TemplateStore] Template loaded successfully: ${template.template_id} with ${template.slots.length} slots`);

  return template;
}

/**
 * Load a form-based template (CooperSurgical style).
 * These templates don't have slots/mapping - they use direct section definitions.
 */
export function loadFormTemplate(templateIdRaw: string): FormTemplate {
  const templateId = (templateIdRaw || "").trim();
  if (!templateId) throw httpError(400, "templateId is required");

  const canonicalId = TEMPLATE_ALIASES[templateId] || templateId;
  const dir = getTemplatesDir();
  const filePath = path.join(dir, `${canonicalId}.json`);

  console.log(`[TemplateStore] Loading form template: ${templateId} -> ${canonicalId}`);

  if (!fs.existsSync(filePath)) {
    throw httpError(
      400,
      `Template '${templateId}' not found. Expected file: ${filePath}. Available: ${listTemplates().join(", ")}`
    );
  }

  const raw = fs.readFileSync(filePath, "utf8");
  let parsed: unknown;
  
  try {
    parsed = JSON.parse(raw);
  } catch (e: any) {
    throw httpError(500, `Template '${canonicalId}' JSON parse error: ${e?.message || e}`);
  }

  const validation = validateFormTemplate(parsed);
  
  if (!validation.success) {
    const errors = formatFormTemplateErrors(validation.errors);
    console.error(`[TemplateStore] Form template validation errors:`, errors);
    throw httpError(500, `Form template '${canonicalId}' validation failed:\n${errors.join("\n")}`);
  }

  const template = validation.data;
  console.log(`[TemplateStore] Form template loaded successfully: ${template.form.form_id}`);

  return template;
}

/**
 * Detect if a template ID refers to a form-based template.
 */
export function isTemplateFormBased(templateIdRaw: string): boolean {
  const templateId = (templateIdRaw || "").trim();
  if (!templateId) return false;

  const canonicalId = TEMPLATE_ALIASES[templateId] || templateId;
  const dir = getTemplatesDir();
  const filePath = path.join(dir, `${canonicalId}.json`);

  if (!fs.existsSync(filePath)) return false;

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return isFormBasedTemplate(parsed);
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// GET TEMPLATE BY ID (with caching)
// -----------------------------------------------------------------------------

const templateCache = new Map<string, Template>();

export function getTemplateById(templateId: string): Template {
  const canonicalId = TEMPLATE_ALIASES[templateId] || templateId;
  
  if (templateCache.has(canonicalId)) {
    return templateCache.get(canonicalId)!;
  }
  
  const template = loadTemplate(templateId);
  templateCache.set(canonicalId, template);
  return template;
}

export function clearTemplateCache(): void {
  templateCache.clear();
}

// -----------------------------------------------------------------------------
// SLOT ACCESSORS
// -----------------------------------------------------------------------------

export function getSlots(template: Template): SlotDefinition[] {
  return template.slots;
}

export function getSlotById(template: Template, slotId: string): SlotDefinition | undefined {
  return template.slots.find(s => s.slot_id === slotId);
}

export function getSlotRequiredTypes(template: Template, slotId: string): string[] {
  const slot = getSlotById(template, slotId);
  return slot?.evidence_requirements?.required_types || [];
}

export function getSlotObligations(template: Template, slotId: string): string[] {
  return template.mapping[slotId] || [];
}

// -----------------------------------------------------------------------------
// AGGREGATE ACCESSORS
// -----------------------------------------------------------------------------

export function getAllRequiredEvidenceTypes(template: Template): string[] {
  const types = new Set<string>();
  
  for (const slot of template.slots) {
    for (const type of slot.evidence_requirements.required_types) {
      types.add(type);
    }
  }
  
  return Array.from(types);
}

export function getAllObligationIds(template: Template): string[] {
  const obligations = new Set<string>();
  
  for (const ids of Object.values(template.mapping)) {
    for (const id of ids) {
      obligations.add(id);
    }
  }
  
  // Also include mandatory obligations
  for (const id of template.mandatory_obligation_ids) {
    obligations.add(id);
  }
  
  return Array.from(obligations);
}

export function getRequiredSlots(template: Template): SlotDefinition[] {
  return template.slots.filter(s => s.required);
}

export function getTableSlots(template: Template): SlotDefinition[] {
  return template.slots.filter(s => s.slot_kind === "TABLE");
}

export function getNarrativeSlots(template: Template): SlotDefinition[] {
  return template.slots.filter(s => s.slot_kind === "NARRATIVE");
}

// -----------------------------------------------------------------------------
// TEMPLATE DEFAULTS
// -----------------------------------------------------------------------------

export function getTemplateDefaults(template: Template): TemplateDefaults {
  return template.defaults;
}

// -----------------------------------------------------------------------------
// BACKWARD COMPATIBILITY HELPERS
// (These map old field names to new schema)
// -----------------------------------------------------------------------------

export function getEffectiveSlots(template: Template): SlotDefinition[] {
  return template.slots;
}

export function getEffectiveMapping(template: Template): Record<string, string[]> {
  return template.mapping;
}

// Helper to get render_as from output_requirements (for backward compatibility)
export function getSlotRenderAs(slot: SlotDefinition): string | undefined {
  return slot.output_requirements.render_as;
}

// Helper to get section from section_path (first part before " > ")
export function getSlotSection(slot: SlotDefinition): string {
  const parts = slot.section_path.split(" > ");
  return parts[0];
}
