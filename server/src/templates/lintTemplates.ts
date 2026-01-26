import * as fs from "node:fs";
import * as path from "node:path";
import { TemplateZ, validateTemplate, formatTemplateErrors, type Template } from "./templateSchema";
import { 
  validateFormTemplate, 
  validateGranularFormTemplate,
  isFormBasedTemplate, 
  isGranularFormTemplate,
  formatFormTemplateErrors,
  type FormTemplate,
  type GranularFormTemplate
} from "./formTemplateSchema";

export interface LintError {
  level: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export interface LintResult {
  templateId: string;
  templateType: "slot-based" | "form-based";
  valid: boolean;
  errors: LintError[];
  warnings: LintError[];
}

/**
 * Lint template JSON data directly (without reading from file).
 * Supports both slot-based (GRKB) templates and form-based (CooperSurgical) templates.
 * 
 * @param rawData - The template JSON data
 * @param sourceIdentifier - Optional identifier for error reporting
 * @param knownTemplateType - If provided, skip auto-detection and use this type (useful when loading from DB)
 */
export async function lintTemplateFromJson(
  rawData: unknown, 
  sourceIdentifier?: string,
  knownTemplateType?: "slot-based" | "form-based"
): Promise<LintResult> {
  const errors: LintError[] = [];
  const warnings: LintError[] = [];
  let templateType: "slot-based" | "form-based" = "slot-based";
  
  // Get ID from either format
  let templateId = (rawData as any)?.template_id 
    || (rawData as any)?.form?.form_id 
    || sourceIdentifier
    || "unknown";

  // Determine template type: use known type if provided, otherwise auto-detect
  const isFormBased = knownTemplateType 
    ? knownTemplateType === "form-based"
    : isFormBasedTemplate(rawData);

  if (isFormBased) {
    templateType = "form-based";
    return lintFormBasedTemplateData(rawData, templateId, sourceIdentifier || "database");
  }

  // Slot-based template validation
  const validation = validateTemplate(rawData);
  if (!validation.success) {
    const schemaErrors = formatTemplateErrors(validation.errors);
    for (const err of schemaErrors) {
      errors.push({
        level: "error",
        code: "SCHEMA_ERROR",
        message: err,
        path: sourceIdentifier || "json",
      });
    }
    return { templateId, templateType, valid: false, errors, warnings };
  }

  const template = validation.data;
  templateId = template.template_id;

  // Continue with slot-based validation rules
  return lintSlotBasedTemplateData(template, templateId, sourceIdentifier || "json");
}

/**
 * Lint a single template JSON against the schema and business rules.
 * Supports both slot-based (GRKB) templates and form-based (CooperSurgical) templates.
 */
export async function lintTemplate(templatePath: string): Promise<LintResult> {
  const errors: LintError[] = [];
  const warnings: LintError[] = [];
  let templateId = "unknown";
  let templateType: "slot-based" | "form-based" = "slot-based";

  // 1. Read and parse JSON
  let rawData: unknown;
  try {
    const content = fs.readFileSync(templatePath, "utf-8");
    rawData = JSON.parse(content);
    // Get ID from either format
    templateId = (rawData as any)?.template_id 
      || (rawData as any)?.form?.form_id 
      || path.basename(templatePath, ".json");
  } catch (e: any) {
    errors.push({
      level: "error",
      code: "PARSE_ERROR",
      message: `Failed to parse JSON: ${e.message}`,
      path: templatePath,
    });
    return { templateId, templateType, valid: false, errors, warnings };
  }

  // 2. Detect template type and validate against appropriate schema
  if (isFormBasedTemplate(rawData)) {
    templateType = "form-based";
    return lintFormBasedTemplateData(rawData, templateId, templatePath);
  }

  // Slot-based template validation
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
    return { templateId, templateType, valid: false, errors, warnings };
  }

  const template = validation.data;
  templateId = template.template_id;

  // Delegate to shared slot-based validation
  return lintSlotBasedTemplateData(template, templateId, templatePath);
}

/**
 * Lint a slot-based template (GRKB style) from parsed data
 */
function lintSlotBasedTemplateData(
  template: Template,
  templateId: string,
  sourcePath: string
): LintResult {
  const errors: LintError[] = [];
  const warnings: LintError[] = [];
  const templateType: "slot-based" = "slot-based";

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
    templateType,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Lint a form-based template (CooperSurgical-style) from parsed data.
 * Supports both hierarchical format and granular format (sections as flat array).
 */
function lintFormBasedTemplateData(
  rawData: unknown,
  templateId: string,
  sourcePath: string
): LintResult {
  const errors: LintError[] = [];
  const warnings: LintError[] = [];
  const templateType: "form-based" = "form-based";

  // Check if it's a granular format (sections as array inside form object)
  if (isGranularFormTemplate(rawData)) {
    return lintGranularFormTemplateData(rawData, templateId, sourcePath);
  }

  // Validate against hierarchical form template schema
  const validation = validateFormTemplate(rawData);
  if (!validation.success) {
    const schemaErrors = formatFormTemplateErrors(validation.errors);
    for (const err of schemaErrors) {
      errors.push({
        level: "error",
        code: "SCHEMA_ERROR",
        message: err,
        path: sourcePath,
      });
    }
    return { templateId, templateType, valid: false, errors, warnings };
  }

  const template = validation.data;
  templateId = template.form.form_id;

  // Form-specific lint rules

  // 1. Check form metadata completeness
  if (!template.form.revision) {
    warnings.push({
      level: "warning",
      code: "MISSING_REVISION",
      message: "Form template has no revision number specified",
      path: "form.revision",
    });
  }

  // 2. Check table of contents if present
  if (template.table_of_contents && template.table_of_contents.length > 0) {
    const tocSections = template.table_of_contents.map(e => e.section);
    const expectedSections = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
    
    for (const section of expectedSections) {
      if (!tocSections.includes(section)) {
        warnings.push({
          level: "warning",
          code: "MISSING_TOC_SECTION",
          message: `Table of contents missing standard section ${section}`,
          path: "table_of_contents",
        });
      }
    }
  }

  // 3. Check that key sections have content structure
  const sections = template.sections;
  const sectionKeys = Object.keys(sections);
  
  if (sectionKeys.length === 0) {
    errors.push({
      level: "error",
      code: "EMPTY_SECTIONS",
      message: "Form template has no sections defined",
      path: "sections",
    });
  }

  // 4. Check critical sections exist
  const criticalSections = [
    "A_executive_summary",
    "B_scope_and_device_description",
    "M_findings_and_conclusions"
  ];

  for (const critical of criticalSections) {
    if (!sections[critical as keyof typeof sections]) {
      warnings.push({
        level: "warning",
        code: "MISSING_CRITICAL_SECTION",
        message: `Form template missing recommended section: ${critical}`,
        path: `sections.${critical}`,
      });
    }
  }

  return {
    templateId,
    templateType,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Lint a granular form-based template (sections as flat array inside form object)
 */
function lintGranularFormTemplateData(
  rawData: unknown,
  templateId: string,
  sourcePath: string
): LintResult {
  const errors: LintError[] = [];
  const warnings: LintError[] = [];
  const templateType: "form-based" = "form-based";

  // Validate against granular form template schema
  const validation = validateGranularFormTemplate(rawData);
  if (!validation.success) {
    const schemaErrors = formatFormTemplateErrors(validation.errors);
    for (const err of schemaErrors) {
      errors.push({
        level: "error",
        code: "SCHEMA_ERROR",
        message: err,
        path: sourcePath,
      });
    }
    return { templateId, templateType, valid: false, errors, warnings };
  }

  const template = validation.data;
  templateId = template.form.form_id;

  // Granular form-specific lint rules

  // 1. Check form metadata completeness
  if (!template.form.revision) {
    warnings.push({
      level: "warning",
      code: "MISSING_REVISION",
      message: "Form template has no revision number specified",
      path: "form.revision",
    });
  }

  // 2. Check sections array is not empty
  if (template.form.sections.length === 0) {
    errors.push({
      level: "error",
      code: "EMPTY_SECTIONS",
      message: "Form template has no sections defined",
      path: "form.sections",
    });
  }

  // 3. Check each section has required fields
  for (let i = 0; i < template.form.sections.length; i++) {
    const section = template.form.sections[i];
    if (!section.section_id) {
      errors.push({
        level: "error",
        code: "MISSING_SECTION_ID",
        message: `Section at index ${i} is missing section_id`,
        path: `form.sections[${i}]`,
      });
    }
    if (!section.title) {
      warnings.push({
        level: "warning",
        code: "MISSING_SECTION_TITLE",
        message: `Section '${section.section_id || i}' is missing title`,
        path: `form.sections[${i}]`,
      });
    }
  }

  // 4. Check for duplicate section IDs
  const sectionIds = template.form.sections.map(s => s.section_id);
  const duplicates = sectionIds.filter((id, index) => sectionIds.indexOf(id) !== index);
  if (duplicates.length > 0) {
    const uniqueDuplicates = [...new Set(duplicates)];
    for (const dup of uniqueDuplicates) {
      warnings.push({
        level: "warning",
        code: "DUPLICATE_SECTION_ID",
        message: `Duplicate section_id found: ${dup}`,
        path: "form.sections",
      });
    }
  }

  return {
    templateId,
    templateType,
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
 * Load and validate a template, throwing on errors.
 * Returns either a slot-based Template or a form-based FormTemplate.
 */
export async function loadValidatedTemplate(templatePath: string): Promise<Template | FormTemplate> {
  const result = await lintTemplate(templatePath);

  if (!result.valid) {
    const errorMessages = result.errors.map(e => `[${e.code}] ${e.message}`).join("; ");
    throw new Error(`Template validation failed for ${result.templateId}: ${errorMessages}`);
  }

  // Re-read and parse since we know it's valid
  const content = fs.readFileSync(templatePath, "utf-8");
  const data = JSON.parse(content);
  
  if (result.templateType === "form-based") {
    const validation = validateFormTemplate(data);
    if (!validation.success) {
      throw new Error("Form template validation unexpectedly failed after lint");
    }
    return validation.data;
  }

  const validation = validateTemplate(data);
  if (!validation.success) {
    throw new Error("Template validation unexpectedly failed after lint");
  }

  return validation.data;
}
