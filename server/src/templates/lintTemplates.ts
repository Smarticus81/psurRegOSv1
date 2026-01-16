import * as fs from "node:fs";
import * as path from "node:path";
import { TemplateZ, validateTemplate, formatTemplateErrors, type Template } from "./templateSchema";

export interface LintError {
  level: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export interface LintResult {
  templateId: string;
  valid: boolean;
  errors: LintError[];
  warnings: LintError[];
}

/**
 * Lint a single template JSON against the schema and business rules
 */
export async function lintTemplate(templatePath: string): Promise<LintResult> {
  const errors: LintError[] = [];
  const warnings: LintError[] = [];
  let templateId = "unknown";

  // 1. Read and parse JSON
  let rawData: unknown;
  try {
    const content = fs.readFileSync(templatePath, "utf-8");
    rawData = JSON.parse(content);
    templateId = (rawData as any)?.template_id || path.basename(templatePath, ".json");
  } catch (e: any) {
    errors.push({
      level: "error",
      code: "PARSE_ERROR",
      message: `Failed to parse JSON: ${e.message}`,
      path: templatePath,
    });
    return { templateId, valid: false, errors, warnings };
  }

  // 2. Validate against Zod schema
  const validation = validateTemplate(rawData);
  if (!validation.success) {
    const schemaErrors = formatTemplateErrors(validation.errors);
    for (const err of schemaErrors) {
      errors.push({
        level: "error",
        code: "SCHEMA_ERROR",
        message: err,
        path: templatePath,
      });
    }
    return { templateId, valid: false, errors, warnings };
  }

  const template = validation.data;
  templateId = template.template_id;

  // 3. Check every slot_id has a mapping entry
  const slotIds = new Set(template.slots.map(s => s.slot_id));
  const mappingKeys = new Set(Object.keys(template.mapping));

  for (const slotId of Array.from(slotIds)) {
    if (!mappingKeys.has(slotId)) {
      errors.push({
        level: "error",
        code: "MISSING_MAPPING",
        message: `Slot '${slotId}' has no entry in mapping`,
        path: `slots[${slotId}]`,
      });
    }
  }

  // Check for orphaned mapping keys
  for (const mappingKey of Array.from(mappingKeys)) {
    if (!slotIds.has(mappingKey)) {
      warnings.push({
        level: "warning",
        code: "ORPHAN_MAPPING",
        message: `Mapping key '${mappingKey}' does not correspond to any slot`,
        path: `mapping[${mappingKey}]`,
      });
    }
  }

  // 4. Check mapping obligation IDs are present (GRKB check is done at runtime)
  const allObligationIds = new Set<string>();
  for (const ids of Object.values(template.mapping)) {
    for (const id of ids) {
      allObligationIds.add(id);
    }
  }
  // Also include mandatory_obligation_ids
  for (const id of template.mandatory_obligation_ids) {
    allObligationIds.add(id);
  }

  // Note: GRKB validation is performed at workflow runtime, not during lint
  // This keeps linting fast and independent of database state

  // 5. Check required slots have min_atoms >= 1 unless allow_empty_with_justification=true
  for (const slot of template.slots) {
    if (slot.required && slot.evidence_requirements.required_types.length > 0) {
      const minAtoms = slot.evidence_requirements.min_atoms;
      const allowEmpty = slot.evidence_requirements.allow_empty_with_justification;

      if (minAtoms < 1 && !allowEmpty) {
        errors.push({
          level: "error",
          code: "INVALID_MIN_ATOMS",
          message: `Required slot '${slot.slot_id}' with evidence requirements must have min_atoms >= 1 or allow_empty_with_justification=true`,
          path: `slots[${slot.slot_id}].evidence_requirements`,
        });
      }
    }
  }

  // 6. Check slot_kind consistency with output_requirements
  for (const slot of template.slots) {
    if (slot.slot_kind === "TABLE" && !slot.output_requirements.table_schema) {
      warnings.push({
        level: "warning",
        code: "TABLE_NO_SCHEMA",
        message: `Slot '${slot.slot_id}' has slot_kind=TABLE but no table_schema defined`,
        path: `slots[${slot.slot_id}].output_requirements`,
      });
    }

    if (slot.output_requirements.render_as === "table" && slot.slot_kind !== "TABLE") {
      warnings.push({
        level: "warning",
        code: "RENDER_KIND_MISMATCH",
        message: `Slot '${slot.slot_id}' has render_as=table but slot_kind is ${slot.slot_kind}`,
        path: `slots[${slot.slot_id}]`,
      });
    }
  }

  return {
    templateId,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Lint all templates in the templates directory
 */
export async function lintAllTemplates(templatesDir?: string): Promise<LintResult[]> {
  const dir = templatesDir || path.join(process.cwd(), "server", "templates");
  const results: LintResult[] = [];

  if (!fs.existsSync(dir)) {
    return [{
      templateId: "system",
      valid: false,
      errors: [{
        level: "error",
        code: "DIR_NOT_FOUND",
        message: `Templates directory not found: ${dir}`,
      }],
      warnings: [],
    }];
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));

  for (const file of files) {
    const result = await lintTemplate(path.join(dir, file));
    results.push(result);
  }

  return results;
}

/**
 * Format lint results for console output
 */
export function formatLintResults(results: LintResult[]): string {
  const lines: string[] = [];

  for (const result of results) {
    lines.push(`\n=== Template: ${result.templateId} ===`);
    lines.push(`Status: ${result.valid ? "VALID" : "INVALID"}`);

    if (result.errors.length > 0) {
      lines.push(`\nErrors (${result.errors.length}):`);
      for (const err of result.errors) {
        lines.push(`  [${err.code}] ${err.message}${err.path ? ` (${err.path})` : ""}`);
      }
    }

    if (result.warnings.length > 0) {
      lines.push(`\nWarnings (${result.warnings.length}):`);
      for (const warn of result.warnings) {
        lines.push(`  [${warn.code}] ${warn.message}${warn.path ? ` (${warn.path})` : ""}`);
      }
    }

    if (result.errors.length === 0 && result.warnings.length === 0) {
      lines.push("  No issues found.");
    }
  }

  return lines.join("\n");
}

/**
 * Load and validate a template, throwing on errors
 */
export async function loadValidatedTemplate(templatePath: string): Promise<Template> {
  const result = await lintTemplate(templatePath);

  if (!result.valid) {
    const errorMessages = result.errors.map(e => `[${e.code}] ${e.message}`).join("; ");
    throw new Error(`Template validation failed for ${result.templateId}: ${errorMessages}`);
  }

  // Re-read and parse since we know it's valid
  const content = fs.readFileSync(templatePath, "utf-8");
  const data = JSON.parse(content);
  const validation = validateTemplate(data);

  if (!validation.success) {
    throw new Error("Template validation unexpectedly failed after lint");
  }

  return validation.data;
}
