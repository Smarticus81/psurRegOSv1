import { z } from "zod";

// Column definition for table schemas
export const TableColumnZ = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "number", "boolean"]),
});

// Table schema for TABLE slot kinds
export const TableSchemaZ = z.object({
  columns: z.array(TableColumnZ).min(1),
  primary_key: z.array(z.string()).optional(),
});

// Output requirements define how a slot is rendered
export const OutputRequirementsZ = z.object({
  renderer: z.enum(["md", "docx"]),
  render_as: z.enum(["cover_page", "table_of_contents", "narrative", "table"]).optional(),
  table_schema: TableSchemaZ.optional(),
});

// Evidence requirements define what evidence is needed for a slot
export const EvidenceRequirementsZ = z.object({
  required_types: z.array(z.string()),
  min_atoms: z.number().int().min(0).default(0),
  allow_empty_with_justification: z.boolean().default(false),
});

// Slot definition - a single section/field in the PSUR template
export const SlotDefinitionZ = z.object({
  slot_id: z.string().min(1),
  title: z.string().min(1),
  section_path: z.string().min(1), // e.g. "A > Executive Summary"
  slot_kind: z.enum(["ADMIN", "NARRATIVE", "TABLE", "METRIC"]),
  required: z.boolean(),
  evidence_requirements: EvidenceRequirementsZ,
  output_requirements: OutputRequirementsZ,
});

// Template defaults
export const TemplateDefaultsZ = z.object({
  require_traceability: z.boolean(),
  require_method_statement: z.boolean(),
  require_claimed_obligations: z.boolean(),
  min_method_chars: z.number().int().min(0),
  min_evidence_atoms: z.number().int().min(0),
});

// Full template schema
export const TemplateZ = z.object({
  template_id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  jurisdiction_scope: z.array(z.enum(["EU_MDR", "UK_MDR"])).min(1),
  normative_basis: z.array(z.string()).optional(),
  mandatory_obligation_ids: z.array(z.string()),
  defaults: TemplateDefaultsZ,
  slots: z.array(SlotDefinitionZ).min(1),
  mapping: z.record(z.string(), z.array(z.string())),
});

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
