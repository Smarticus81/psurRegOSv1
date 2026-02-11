import { z } from "zod";

/**
 * TEMPLATE VALIDATION SCHEMA
 * 
 * PERMISSIVE SCHEMA - accepts custom fields and values.
 * 
 * Validation will PASS if:
 * - Core structural fields are present (template_id, name, slots array, etc.)
 * - Extra fields, custom enum values, and extensions are ALLOWED
 * 
 * Validation will FAIL only if:
 * - A core structural field is completely missing
 * - slots is not an array or is empty
 */

// Column definition for table schemas - permissive
export const TableColumnZ = z.object({
  name: z.string().min(1),
  type: z.string(), // Any string type allowed
}).passthrough();

// Table schema - can be object OR string reference
export const TableSchemaZ = z.union([
  z.string(), // String reference to predefined schema
  z.object({
    columns: z.array(TableColumnZ).optional(),
    primary_key: z.array(z.string()).optional(),
  }).passthrough(),
]);

// Output requirements - fully permissive
export const OutputRequirementsZ = z.object({
  renderer: z.string().default("md"), // Any renderer string
  render_as: z.string().optional(), // Any render type: narrative, table, list, summary_table, multi_table, etc.
  table_schema: TableSchemaZ.optional(),
  table_schemas: z.array(TableSchemaZ).optional(), // Support multiple schemas
}).passthrough();

// Evidence requirements - permissive
export const EvidenceRequirementsZ = z.union([
  // Array format (legacy)
  z.array(z.string()),
  // Object format (preferred)
  z.object({
    required_types: z.array(z.string()).default([]),
    min_atoms: z.number().int().min(0).default(0),
    allow_empty_with_justification: z.boolean().default(false),
  }).passthrough(),
]);

// Slot definition - permissive with only core fields required
export const SlotDefinitionZ = z.object({
  slot_id: z.string().min(1),
  title: z.string().min(1),
  section_path: z.string().default(""), // Optional, can be empty
  slot_kind: z.string().default("NARRATIVE"), // Any slot kind allowed
  required: z.boolean().default(false),
  evidence_requirements: EvidenceRequirementsZ.optional().default({ required_types: [], min_atoms: 0, allow_empty_with_justification: false }),
  output_requirements: OutputRequirementsZ.optional().default({ renderer: "md" }),
}).passthrough();

// Template defaults - all optional with defaults
export const TemplateDefaultsZ = z.object({
  require_traceability: z.boolean().default(true),
  require_method_statement: z.boolean().default(true),
  require_claimed_obligations: z.boolean().default(true),
  min_method_chars: z.number().int().min(0).default(10),
  min_evidence_atoms: z.number().int().min(0).default(0),
}).passthrough();

// Full template schema - minimal required fields
export const TemplateZ = z.object({
  template_id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().default("1.0"),
  jurisdiction_scope: z.array(z.string()).default(["EU_MDR"]),
  normative_basis: z.array(z.string()).optional(),
  mandatory_obligation_ids: z.array(z.string()).default([]),
  defaults: TemplateDefaultsZ.optional().default({}),
  slots: z.array(SlotDefinitionZ).min(1),
  mapping: z.record(z.string(), z.array(z.string())).default({}),
}).passthrough();

// Type exports
export type TableColumn = z.infer<typeof TableColumnZ>;
export type TableSchema = z.infer<typeof TableSchemaZ>;
export type OutputRequirements = z.infer<typeof OutputRequirementsZ>;
export type EvidenceRequirements = z.infer<typeof EvidenceRequirementsZ>;
export type SlotDefinition = z.infer<typeof SlotDefinitionZ>;
export type TemplateDefaults = z.infer<typeof TemplateDefaultsZ>;
export type Template = z.infer<typeof TemplateZ>;

// Validation helper
export function validateTemplate(data: unknown): { success: true; data: Template } | { success: false; errors: z.ZodError } {
  const result = TemplateZ.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

// Format Zod errors for display
export function formatTemplateErrors(errors: z.ZodError): string[] {
  return errors.errors.map(err => {
    const path = err.path.join(".");
    return `[${path || "root"}] ${err.message}`;
  });
}
