import { z } from "zod";

/**
 * FORM-BASED TEMPLATE SCHEMA
 * 
 * Supports CooperSurgical-style PSUR form templates with direct section mapping.
 * This is an alternative to the slot-based GRKB template format.
 */

// Form metadata
export const FormMetadataZ = z.object({
  form_id: z.string().min(1),
  form_title: z.string().min(1),
  revision: z.string().optional(),
  document_control: z.object({
    product_or_product_family: z.string().default(""),
    infocard_number: z.string().default(""),
    page_control: z.object({
      current_page: z.number().nullable(),
      total_pages: z.number().nullable(),
    }).optional(),
  }).optional(),
});

// Manufacturer information
export const ManufacturerInfoZ = z.object({
  company_name: z.string(),
  address_lines: z.array(z.string()),
  manufacturer_srn: z.string().optional(),
  authorized_representative: z.object({
    is_applicable: z.boolean(),
    name: z.string().optional(),
    address_lines: z.array(z.string()).optional(),
    authorized_representative_srn: z.string().optional(),
  }).optional(),
});

// Cover page
export const CoverPageZ = z.object({
  manufacturer_information: ManufacturerInfoZ.optional(),
  regulatory_information: z.object({
    certificate_number: z.string().optional(),
    date_of_issue: z.string().optional(),
    notified_body: z.object({
      name: z.string(),
      number: z.string(),
    }).optional(),
    psur_available_within_3_working_days: z.boolean().optional(),
  }).optional(),
  document_information: z.object({
    data_collection_period: z.object({
      start_date: z.string(),
      end_date: z.string(),
    }).optional(),
    psur_cadence: z.string().optional(),
  }).optional(),
});

// Table of contents entry
export const TOCEntryZ = z.object({
  section: z.string(),
  title: z.string(),
  page: z.number().nullable(),
});

// Generic field with allowed values
export const SelectFieldZ = z.object({
  status: z.string().optional(),
  allowed_values: z.array(z.string()).optional(),
  details_if_needed: z.string().optional(),
});

// Section A - Executive Summary
export const SectionAZ = z.object({
  previous_psur_actions_status: z.any().optional(),
  notified_body_review_status: z.any().optional(),
  data_collection_period_changes: z.any().optional(),
  benefit_risk_assessment_conclusion: z.any().optional(),
}).passthrough();

// Section B - Scope and Device Description
export const SectionBZ = z.object({
  device_information: z.any().optional(),
  device_classification: z.any().optional(),
  device_timeline_and_status: z.any().optional(),
  device_description_and_information: z.any().optional(),
  device_information_breakdown: z.any().optional(),
  data_collection_period_reporting_period_information: z.any().optional(),
  technical_information: z.any().optional(),
  model_catalog_numbers: z.any().optional(),
  device_grouping_information: z.any().optional(),
}).passthrough();

// Section C - Volume of Sales
export const SectionCZ = z.object({
  sales_methodology: z.any().optional(),
  table_1_sales_by_region: z.any().optional(),
  sales_data_analysis: z.any().optional(),
  size_and_characteristics_of_population_using_device: z.any().optional(),
}).passthrough();

// Section D - Serious Incidents
export const SectionDZ = z.object({
  narrative_summary: z.string().optional(),
  table_2_serious_incidents_by_imdrf_annex_a_by_region: z.array(z.any()).optional(),
  table_3_serious_incidents_by_imdrf_annex_c_investigation_findings_by_region: z.array(z.any()).optional(),
  table_4_health_impact_by_investigation_conclusion: z.array(z.any()).optional(),
  new_incident_types_identified_this_cycle: z.string().optional(),
}).passthrough();

// Section E - Customer Feedback
export const SectionEZ = z.object({
  summary: z.string().optional(),
  table_6_feedback_by_type_and_source: z.array(z.any()).optional(),
}).passthrough();

// Section F - Complaints
export const SectionFZ = z.object({
  complaint_rate_calculation: z.any().optional(),
  annual_number_of_complaints_and_complaint_rate_by_harm_and_medical_device_problem: z.any().optional(),
  table_7_complaint_rate_and_count: z.any().optional(),
}).passthrough();

// Section G - Trend Reporting
export const SectionGZ = z.object({
  overall_monthly_complaint_rate_trending: z.any().optional(),
  trend_reporting_summary: z.any().optional(),
}).passthrough();

// Section H - FSCA
export const SectionHZ = z.object({
  summary_or_na_statement: z.string().optional(),
  table_8_fsca_initiated_current_period_and_open_fscas: z.array(z.any()).optional(),
}).passthrough();

// Section I - CAPA
export const SectionIZ = z.object({
  summary_or_na_statement: z.string().optional(),
  table_9_capa_initiated_current_reporting_period: z.array(z.any()).optional(),
}).passthrough();

// Section J - Literature Review
export const SectionJZ = z.object({
  literature_search_methodology: z.string().optional(),
  number_of_relevant_articles_identified: z.number().nullable().optional(),
  summary_of_new_data_performance_or_safety: z.string().optional(),
  newly_observed_uses: z.string().optional(),
  previously_unassessed_risks: z.string().optional(),
  state_of_the_art_changes: z.string().optional(),
  comparison_with_similar_devices: z.string().optional(),
  technical_documentation_search_results_reference: z.string().optional(),
}).passthrough();

// Section K - External Databases
export const SectionKZ = z.object({
  registries_reviewed_summary: z.string().optional(),
  table_10_adverse_events_and_recalls: z.array(z.any()).optional(),
}).passthrough();

// Section L - PMCF
export const SectionLZ = z.object({
  summary_or_na_statement: z.string().optional(),
  table_11_pmcf_activities: z.array(z.any()).optional(),
}).passthrough();

// Section M - Findings and Conclusions
export const SectionMZ = z.object({
  benefit_risk_profile_conclusion: z.string().optional(),
  intended_benefits_achieved: z.string().optional(),
  limitations_of_data_and_conclusion: z.string().optional(),
  new_or_emerging_risks_or_new_benefits: z.string().optional(),
  actions_taken_or_planned: z.any().optional(),
  overall_performance_conclusion: z.string().optional(),
}).passthrough();

// All sections container
export const FormSectionsZ = z.object({
  A_executive_summary: SectionAZ.optional(),
  B_scope_and_device_description: SectionBZ.optional(),
  C_volume_of_sales_and_population_exposure: SectionCZ.optional(),
  D_information_on_serious_incidents: SectionDZ.optional(),
  E_customer_feedback: SectionEZ.optional(),
  F_product_complaint_types_counts_and_rates: SectionFZ.optional(),
  G_information_from_trend_reporting: SectionGZ.optional(),
  H_information_from_fsca: SectionHZ.optional(),
  I_corrective_and_preventive_actions: SectionIZ.optional(),
  J_scientific_literature_review: SectionJZ.optional(),
  K_review_of_external_databases_and_registries: SectionKZ.optional(),
  L_pmcf: SectionLZ.optional(),
  M_findings_and_conclusions: SectionMZ.optional(),
}).passthrough();

// Full form-based template schema (hierarchical structure)
export const FormTemplateZ = z.object({
  form: FormMetadataZ,
  psur_cover_page: CoverPageZ.optional(),
  table_of_contents: z.array(TOCEntryZ).optional(),
  sections: FormSectionsZ,
});

// Granular section item (flat array structure)
export const GranularSectionItemZ = z.object({
  section_id: z.string(),
  title: z.string(),
  type: z.string().optional(),
  content: z.string().optional(),
  evidence_types: z.array(z.string()).optional(),
  formatting: z.any().optional(),
}).passthrough();

// Granular form metadata (sections as array inside form object)
export const GranularFormMetadataZ = z.object({
  form_id: z.string().min(1),
  form_title: z.string().min(1),
  revision: z.string().optional(),
  sections: z.array(GranularSectionItemZ),
});

// Granular form-based template schema (sections as flat array)
export const GranularFormTemplateZ = z.object({
  form: GranularFormMetadataZ,
});

// Type exports
export type FormMetadata = z.infer<typeof FormMetadataZ>;
export type CoverPage = z.infer<typeof CoverPageZ>;
export type TOCEntry = z.infer<typeof TOCEntryZ>;
export type FormSections = z.infer<typeof FormSectionsZ>;
export type FormTemplate = z.infer<typeof FormTemplateZ>;
export type GranularSectionItem = z.infer<typeof GranularSectionItemZ>;
export type GranularFormTemplate = z.infer<typeof GranularFormTemplateZ>;

// Validation helper for hierarchical form template
export function validateFormTemplate(data: unknown): { success: true; data: FormTemplate } | { success: false; errors: z.ZodError } {
  const result = FormTemplateZ.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

// Validation helper for granular form template
export function validateGranularFormTemplate(data: unknown): { success: true; data: GranularFormTemplate } | { success: false; errors: z.ZodError } {
  const result = GranularFormTemplateZ.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

// Check if template is granular format (sections as array inside form)
export function isGranularFormTemplate(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  
  if ('form' in obj && typeof obj.form === 'object' && obj.form !== null) {
    const form = obj.form as Record<string, unknown>;
    return 'form_id' in form && 'sections' in form && Array.isArray(form.sections);
  }
  
  return false;
}

// Detect if a template is form-based
// Supports two structures:
// 1. { form: {...}, sections: {...} } - original structure
// 2. { form: { form_id, sections: [...] } } - granular template structure
export function isFormBasedTemplate(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  
  // Check for original structure: form and sections at top level
  if ('form' in obj && 'sections' in obj) {
    return true;
  }
  
  // Check for granular structure: form with nested sections array
  if ('form' in obj && typeof obj.form === 'object' && obj.form !== null) {
    const form = obj.form as Record<string, unknown>;
    if ('form_id' in form && 'sections' in form && Array.isArray(form.sections)) {
      return true;
    }
  }
  
  return false;
}

// Format errors for display
export function formatFormTemplateErrors(error: z.ZodError): string[] {
  return error.errors.map(e => {
    const path = e.path.join('.');
    return `${path}: ${e.message}`;
  });
}
