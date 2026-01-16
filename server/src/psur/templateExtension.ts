/**
 * TEMPLATE EXTENSION VALIDATOR
 * 
 * Validates that template extensions comply with
 * the PSUR contract rules:
 * - May ADD sections but may NOT remove or rename core sections
 * - May NOT redefine calculations
 * - May NOT override MDCG obligations
 * - Must explicitly reference MDCG obligation IDs where applicable
 * 
 * Fails if FormQAR conflicts with Annex I.
 */

import { CORE_SECTIONS, SECTION_TITLES, type PSURSectionId } from "./psurContract";
import { MDCG_ANNEX_I_OBLIGATIONS, type ObligationId } from "./mappings/mdcg2022AnnexI";

// ============================================================================
// TEMPLATE EXTENSION TYPES
// ============================================================================

export interface TemplateExtension {
  templateId: string;
  name: string;
  description?: string;
  version: string;
  schemaVersion: string;
  baseContract: string;
  extensionType: "ADDITIVE" | "OVERRIDE"; // OVERRIDE should fail validation
  
  metadata?: {
    author?: string;
    lastUpdated?: string;
    complianceLevel?: string;
    notifiedBodyApproved?: boolean;
  };
  
  jurisdictionScope: string[];
  
  obligationReferences: Record<string, ObligationId[]>;
  
  sectionExtensions?: SectionExtension[];
  additionalSections?: AdditionalSection[];
  
  evidenceTypeMapping?: Record<string, EvidenceTypeMapping>;
  
  validationRules?: {
    preventKernelOverride: boolean;
    requireObligationMapping: boolean;
    allowAdditionalSectionsOnly: boolean;
    enforceDisplayOrderConstraints: boolean;
  };
  
  renderingOptions?: RenderingOptions;
  
  // Legacy compatibility for existing systems
  legacyCompatibility?: {
    slots?: LegacySlot[];
    mapping?: Record<string, string[]>;
  };
}

export interface SectionExtension {
  targetSection: PSURSectionId;
  companyWording?: {
    headerPrefix?: string;
    additionalText?: string;
  };
  additionalFields?: AdditionalField[];
  additionalSubsections?: AdditionalSubsection[];
  displayOrder?: number;
  requiredApprovers?: RequiredApprover[];
  overrideCalculation: boolean; // MUST be false
  overrideObligation: boolean;  // MUST be false
}

export interface AdditionalField {
  fieldId: string;
  label: string;
  required: boolean;
  dataType?: string;
  validation?: string;
}

export interface AdditionalSubsection {
  subsectionId: string;
  title: string;
  description?: string;
  linkedObligation?: ObligationId;
}

export interface RequiredApprover {
  role: string;
  required: boolean;
}

export interface AdditionalSection {
  sectionId: string;
  title: string;
  insertAfter: PSURSectionId | string;
  isCompanySpecific: boolean;
  content?: {
    template?: string;
    requiredFields?: string[];
  };
}

export interface EvidenceTypeMapping {
  displayName: string;
  internalCode: string;
  sourceSystem: string;
}

export interface RenderingOptions {
  includeCompanyLogo?: boolean;
  logoPlacement?: string;
  headerFormat?: string;
  footerFormat?: string;
  dateFormat?: "ISO" | "EU" | "US";
}

export interface LegacySlot {
  slot_id: string;
  title: string;
  evidence_requirements: { required_types: string[] };
  mapsTo?: PSURSectionId;
}

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

export interface TemplateValidationResult {
  valid: boolean;
  templateId: string;
  timestamp: string;
  errors: TemplateValidationError[];
  warnings: string[]; // Warnings are informational only
}

export interface TemplateValidationError {
  errorId: string;
  category: TemplateErrorCategory;
  message: string;
  details: string;
  severity: "CRITICAL";
}

export type TemplateErrorCategory =
  | "OVERRIDE_VIOLATION"
  | "MISSING_OBLIGATION_REFERENCE"
  | "CALCULATION_OVERRIDE"
  | "CORE_SECTION_MODIFICATION"
  | "INVALID_SCHEMA"
  | "ANNEX_I_CONFLICT";

// ============================================================================
// VALIDATION IMPLEMENTATION
// ============================================================================

export function validateTemplateExtension(template: TemplateExtension): TemplateValidationResult {
  const errors: TemplateValidationError[] = [];
  const warnings: string[] = [];
  const timestamp = new Date().toISOString();
  let errorCounter = 0;
  
  // -------------------------------------------------------------------------
  // CHECK 1: Extension type must be ADDITIVE
  // -------------------------------------------------------------------------
  if (template.extensionType === "OVERRIDE") {
    errors.push({
      errorId: `ERR-${++errorCounter}`,
      category: "OVERRIDE_VIOLATION",
      message: "Template extension type cannot be OVERRIDE",
      details: `Template ${template.templateId} has extensionType: OVERRIDE. Templates must extend the PSUR contract, not override it.`,
      severity: "CRITICAL",
    });
  }
  
  // -------------------------------------------------------------------------
  // CHECK 2: No section extensions can override calculations
  // -------------------------------------------------------------------------
  if (template.sectionExtensions) {
    for (const ext of template.sectionExtensions) {
      if (ext.overrideCalculation) {
        errors.push({
          errorId: `ERR-${++errorCounter}`,
          category: "CALCULATION_OVERRIDE",
          message: `Section ${ext.targetSection} attempts to override calculations`,
          details: `Section extension for ${ext.targetSection} has overrideCalculation: true. Calculation logic is defined by the PSUR kernel and cannot be overridden by templates.`,
          severity: "CRITICAL",
        });
      }
      
      if (ext.overrideObligation) {
        errors.push({
          errorId: `ERR-${++errorCounter}`,
          category: "OVERRIDE_VIOLATION",
          message: `Section ${ext.targetSection} attempts to override obligations`,
          details: `Section extension for ${ext.targetSection} has overrideObligation: true. MDCG obligations cannot be overridden by templates.`,
          severity: "CRITICAL",
        });
      }
    }
  }
  
  // -------------------------------------------------------------------------
  // CHECK 3: All obligation references must be valid MDCG obligations
  // -------------------------------------------------------------------------
  const validObligationIds = new Set(MDCG_ANNEX_I_OBLIGATIONS.map(o => o.obligationId));
  
  for (const [slotId, obligations] of Object.entries(template.obligationReferences || {})) {
    for (const oblId of obligations) {
      if (!validObligationIds.has(oblId)) {
        errors.push({
          errorId: `ERR-${++errorCounter}`,
          category: "MISSING_OBLIGATION_REFERENCE",
          message: `Invalid obligation reference: ${oblId}`,
          details: `Slot ${slotId} references obligation ${oblId} which is not a valid MDCG 2022-21 Annex I obligation ID.`,
          severity: "CRITICAL",
        });
      }
    }
  }
  
  // -------------------------------------------------------------------------
  // CHECK 4: Template cannot remove or rename core sections
  // -------------------------------------------------------------------------
  // (This would be checked when applying the template, not just validating the schema)
  // For now, check that no section extension targets a core section with rename
  if (template.sectionExtensions) {
    for (const ext of template.sectionExtensions) {
      if (CORE_SECTIONS.includes(ext.targetSection)) {
        // Core sections can be extended but the title should warn if it differs
        if (ext.companyWording?.headerPrefix) {
          warnings.push(
            `Section ${ext.targetSection} has custom header prefix "${ext.companyWording.headerPrefix}". ` +
            `Core section title "${SECTION_TITLES[ext.targetSection]}" must remain identifiable.`
          );
        }
      }
    }
  }
  
  // -------------------------------------------------------------------------
  // CHECK 5: Additional sections must not conflict with core section IDs
  // -------------------------------------------------------------------------
  if (template.additionalSections) {
    for (const addSection of template.additionalSections) {
      if (CORE_SECTIONS.includes(addSection.sectionId as PSURSectionId)) {
        errors.push({
          errorId: `ERR-${++errorCounter}`,
          category: "CORE_SECTION_MODIFICATION",
          message: `Additional section ID conflicts with core section: ${addSection.sectionId}`,
          details: `Template defines additional section with ID ${addSection.sectionId} which conflicts with a core PSUR section.`,
          severity: "CRITICAL",
        });
      }
    }
  }
  
  // -------------------------------------------------------------------------
  // CHECK 6: Validation rules must prevent kernel override
  // -------------------------------------------------------------------------
  if (template.validationRules) {
    if (!template.validationRules.preventKernelOverride) {
      errors.push({
        errorId: `ERR-${++errorCounter}`,
        category: "OVERRIDE_VIOLATION",
        message: "Template validation rules must prevent kernel override",
        details: "validationRules.preventKernelOverride must be true. Templates cannot be configured to allow kernel overrides.",
        severity: "CRITICAL",
      });
    }
  }
  
  // -------------------------------------------------------------------------
  // CHECK 7: Schema version compatibility
  // -------------------------------------------------------------------------
  if (template.schemaVersion !== "1.0.0") {
    errors.push({
      errorId: `ERR-${++errorCounter}`,
      category: "INVALID_SCHEMA",
      message: `Unsupported schema version: ${template.schemaVersion}`,
      details: `Template uses schema version ${template.schemaVersion} but only version 1.0.0 is supported.`,
      severity: "CRITICAL",
    });
  }
  
  // -------------------------------------------------------------------------
  // CHECK 8: Base contract must be PSUR_CONTRACT_V1
  // -------------------------------------------------------------------------
  if (template.baseContract !== "PSUR_CONTRACT_V1") {
    errors.push({
      errorId: `ERR-${++errorCounter}`,
      category: "INVALID_SCHEMA",
      message: `Invalid base contract: ${template.baseContract}`,
      details: `Template references base contract ${template.baseContract} but must extend PSUR_CONTRACT_V1.`,
      severity: "CRITICAL",
    });
  }
  
  // -------------------------------------------------------------------------
  // CHECK 9: Verify no Annex I conflicts in subsections
  // -------------------------------------------------------------------------
  if (template.sectionExtensions) {
    for (const ext of template.sectionExtensions) {
      if (ext.additionalSubsections) {
        for (const sub of ext.additionalSubsections) {
          if (sub.linkedObligation && !validObligationIds.has(sub.linkedObligation)) {
            errors.push({
              errorId: `ERR-${++errorCounter}`,
              category: "ANNEX_I_CONFLICT",
              message: `Subsection links to invalid obligation: ${sub.linkedObligation}`,
              details: `Subsection ${sub.subsectionId} in ${ext.targetSection} links to obligation ${sub.linkedObligation} which is not valid.`,
              severity: "CRITICAL",
            });
          }
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    templateId: template.templateId,
    timestamp,
    errors,
    warnings,
  };
}

// ============================================================================
// TEMPLATE LOADER WITH VALIDATION
// ============================================================================

export async function loadAndValidateTemplate(
  templatePath: string
): Promise<{ template: TemplateExtension | null; validation: TemplateValidationResult }> {
  try {
    // In a real implementation, this would read from the file system
    // For now, we'll use dynamic import which works with JSON files
    const fs = await import("fs").then(m => m.promises);
    const content = await fs.readFile(templatePath, "utf-8");
    const template = JSON.parse(content) as TemplateExtension;
    
    const validation = validateTemplateExtension(template);
    
    if (!validation.valid) {
      console.error(`[TemplateValidator] Template ${template.templateId} failed validation:`);
      for (const error of validation.errors) {
        console.error(`  [${error.category}] ${error.message}`);
      }
      return { template: null, validation };
    }
    
    return { template, validation };
  } catch (error) {
    return {
      template: null,
      validation: {
        valid: false,
        templateId: "UNKNOWN",
        timestamp: new Date().toISOString(),
        errors: [{
          errorId: "ERR-LOAD",
          category: "INVALID_SCHEMA",
          message: "Failed to load template",
          details: `Error loading template from ${templatePath}: ${error}`,
          severity: "CRITICAL",
        }],
        warnings: [],
      },
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getTemplateObligationCoverage(template: TemplateExtension): {
  covered: ObligationId[];
  missing: ObligationId[];
  coverage: number;
} {
  const allObligations = MDCG_ANNEX_I_OBLIGATIONS.filter(o => o.isMandatory).map(o => o.obligationId);
  const covered = new Set<ObligationId>();
  
  for (const obligations of Object.values(template.obligationReferences || {})) {
    for (const oblId of obligations) {
      covered.add(oblId);
    }
  }
  
  const coveredArray = Array.from(covered) as ObligationId[];
  const missing = allObligations.filter(o => !covered.has(o));
  const coverage = allObligations.length > 0 ? (coveredArray.length / allObligations.length) * 100 : 0;
  
  return { covered: coveredArray, missing, coverage };
}

export function generateTemplateComplianceReport(template: TemplateExtension): string {
  const validation = validateTemplateExtension(template);
  const coverage = getTemplateObligationCoverage(template);
  
  const lines: string[] = [];
  
  lines.push(`# Template Compliance Report`);
  lines.push(`**Template:** ${template.templateId}`);
  lines.push(`**Version:** ${template.version}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");
  
  lines.push(`## Validation Status`);
  lines.push(`**Status:** ${validation.valid ? "PASSED" : "FAILED"}`);
  lines.push(`**Errors:** ${validation.errors.length}`);
  lines.push(`**Warnings:** ${validation.warnings.length}`);
  lines.push("");
  
  if (validation.errors.length > 0) {
    lines.push(`### Errors`);
    for (const error of validation.errors) {
      lines.push(`- **[${error.category}]** ${error.message}`);
      lines.push(`  - ${error.details}`);
    }
    lines.push("");
  }
  
  if (validation.warnings.length > 0) {
    lines.push(`### Warnings`);
    for (const warning of validation.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push("");
  }
  
  lines.push(`## Obligation Coverage`);
  lines.push(`**Coverage:** ${coverage.coverage.toFixed(1)}%`);
  lines.push(`**Covered:** ${coverage.covered.length}`);
  lines.push(`**Missing:** ${coverage.missing.length}`);
  lines.push("");
  
  if (coverage.missing.length > 0) {
    lines.push(`### Missing Obligations`);
    for (const oblId of coverage.missing) {
      lines.push(`- ${oblId}`);
    }
  }
  
  return lines.join("\n");
}
