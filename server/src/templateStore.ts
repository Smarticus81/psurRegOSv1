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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type HttpError = Error & { status?: number };

function httpError(status: number, message: string): HttpError {
  const err: HttpError = new Error(message);
  err.status = status;
  return err;
}

// Re-export types for backward compatibility
export type { Template, SlotDefinition as TemplateSlot, TemplateDefaults };

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// -----------------------------------------------------------------------------
// TEMPLATE ALIASES
// -----------------------------------------------------------------------------

const TEMPLATE_ALIASES: Record<string, string> = {
  "MDCG_2022_21": "MDCG_2022_21_ANNEX_I",
  "MDCG_2022_21_ANNEX_I": "MDCG_2022_21_ANNEX_I",
  "FormQAR-054_C": "FormQAR-054_C",
  "FORMQAR_054_C": "FormQAR-054_C",
  "formqar_054_c": "FormQAR-054_C",
  "FormQAR_054_C": "FormQAR-054_C",
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

export function listTemplatesWithMetadata(): { templateId: string; name: string; version: string; jurisdictions: string[] }[] {
  const templates: { templateId: string; name: string; version: string; jurisdictions: string[] }[] = [];
  const dir = getTemplatesDir();
  
  if (!fs.existsSync(dir)) return templates;
  
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  
  for (const file of files) {
    try {
      const filePath = path.join(dir, file);
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      
      templates.push({
        templateId: parsed.template_id,
        name: parsed.name,
        version: parsed.version,
        jurisdictions: parsed.jurisdiction_scope || [],
      });
    } catch (e) {
      console.warn(`[TemplateStore] Failed to parse ${file}:`, e);
    }
  }
  
  return templates;
}

// -----------------------------------------------------------------------------
// VALIDATE TEMPLATE (using Zod)
// -----------------------------------------------------------------------------

export function validateTemplate(template: unknown): TemplateValidationResult {
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
    
    return { valid: true, errors: [], warnings };
  }
  
  return {
    valid: false,
    errors: formatTemplateErrors(result.errors),
    warnings: [],
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
