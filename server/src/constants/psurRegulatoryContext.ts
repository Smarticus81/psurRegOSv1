/**
 * PSUR Regulatory Context - Single Source of Truth
 *
 * 16-section context that agents MUST use for methods, thresholds, terminology,
 * and criteria. Injected into every narrative agent prompt.
 *
 * Can be synced to Neo4j (ContextSection nodes) for the knowledge graph;
 * generation reads from this module (no Neo4j at inference time).
 */

export interface RegulatoryContextSection {
  id: string;
  title: string;
  content: Record<string, unknown> | string;
  /** Optional: which MDCG slot IDs use this section (for Neo4j USES_CONTEXT) */
  slotIds?: string[];
}

/** All 16 sections - authoritative content for agent prompts */
export const PSUR_REGULATORY_CONTEXT_SECTIONS: RegulatoryContextSection[] = [
  {
    id: "1_device_classification_rules",
    title: "Device Classification & Rules",
    slotIds: ["MDCG.ANNEXI.COVER", "MDCG.ANNEXI.DEVICES_SCOPE"],
    content: {
      regulatory_classification: {
        eu_mdr_class: "Class I / IIa / IIb / III",
        eu_mdr_rule: "Rule number (1-22) from Annex VIII",
        uk_mdr_class: "Class I / IIa / IIb / III",
        fda_classification: "Class I / II / III",
        health_canada_class: "Class I / II / III / IV",
      },
      update_frequency_requirements: {
        class_i: "Not required unless requested",
        class_iia: "Every 2 years (24 months)",
        class_iib: "Annually (12 months)",
        class_iii: "Annually (12 months)",
        implantable: "Annually (12 months)",
      },
      applicable_standards: [
        "MDCG 2022-21 (PSUR Guidance)",
        "ISO 14971 (Risk Management)",
        "ISO 13485 (QMS)",
        "IMDRF Adverse Event Terminology",
      ],
    },
  },
  {
    id: "2_submission_requirements",
    title: "Submission Requirements",
    slotIds: ["MDCG.ANNEXI.COVER"],
    content: {
      notified_body_info: {
        name: "Notified Body name",
        identification_number: "NB XXXX",
        submission_method: "EUDAMED / Direct portal / Email",
        submission_deadline: "Days after period end",
      },
      competent_authorities: ["List of regulatory authorities requiring notification"],
      eudamed_requirements: {
        upload_required: "Yes/No",
        web_form_completion: "Yes/No",
        public_summary: "Yes/No (for Class III/implantable)",
      },
    },
  },
  {
    id: "3_surveillance_period",
    title: "Surveillance Period Definition",
    slotIds: ["MDCG.ANNEXI.EXEC_SUMMARY", "MDCG.ANNEXI.SALES_VOLUME_EXPOSURE"],
    content: {
      current_period: {
        start_date: "YYYY-MM-DD",
        end_date: "YYYY-MM-DD",
        duration_months: "12 or 24",
        period_type: "Annual / Biennial",
      },
      previous_period: {
        start_date: "YYYY-MM-DD",
        end_date: "YYYY-MM-DD",
        duration_months: "For comparison purposes",
        previous_psur_reference: "Document ID",
      },
      period_change_justification: {
        did_period_change: "Yes/No",
        reason: "Regulatory requirement change / Certificate renewal / etc.",
      },
    },
  },
  {
    id: "4_device_scope_identification",
    title: "Device Scope & Identification",
    slotIds: ["MDCG.ANNEXI.DEVICES_SCOPE", "MDCG.ANNEXI.DEVICES_CHANGES"],
    content: {
      device_identifiers: {
        basic_udi_di: "List of UDI-DIs if MDR device",
        device_group_family: "If Legacy MDD device",
        gmdn_code: "Global Medical Device Nomenclature code",
        emdn_code: "European Medical Device Nomenclature (if applicable)",
        trade_names: "All commercial names",
        model_catalog_numbers: "Complete list - deduplicated",
      },
      technical_documentation: {
        td_reference: "Technical Documentation ID",
        certificate_number: "CE certificate number",
        certificate_expiry: "YYYY-MM-DD",
      },
      grouping_information: {
        is_grouped_psur: "Yes/No",
        leading_device: "Which device in group",
        grouping_justification: [
          "Same Clinical Evaluation Report?",
          "Same intended use and similar technology?",
          "Same Notified Body?",
        ],
      },
      device_description: "Narrative technical description",
      intended_use: "Full intended use statement from labeling",
      indications: "Clinical indications for use",
      contraindications: "List from Instructions for Use",
      target_population: {
        age_range: "Pediatric / Adult / Geriatric",
        gender: "Male / Female / Both",
        clinical_conditions: "Specific patient populations",
        geographic_distribution: "Primary markets",
      },
      device_lifetime: {
        shelf_life: "Years",
        service_life: "Years (for reusable devices)",
        total_lifetime: "shelf_life + service_life",
      },
    },
  },
  {
    id: "5_risk_thresholds_criteria",
    title: "Risk Management Thresholds & Criteria",
    slotIds: ["MDCG.ANNEXI.SERIOUS_INCIDENTS_SUMMARY", "MDCG.ANNEXI.COMPLAINTS_SUMMARY", "MDCG.ANNEXI.TREND_REPORTING", "MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
    content: {
      maximum_acceptable_rates: {
        overall_complaint_rate: "e.g., 5.00%",
        serious_incident_rate: "e.g., 0.1% or X per 10,000 units",
        specific_hazard_rates: "Per hazard from RMF",
      },
      probability_classifications: { rare: "< 0.01%", occasional: "0.01% - 0.1%", frequent: "0.1% - 1%", very_frequent: "> 1%" },
      severity_classifications: { negligible: "No health consequence", minor: "Temporary discomfort", major: "Temporary injury requiring intervention", critical: "Permanent injury or death" },
      risk_matrix: "Acceptable risk combinations (Probability + Severity)",
      hazard_list_structure: "hazard_id, hazardous_situation, associated_harm, probability_pre_mitigation, severity_pre_mitigation, risk_controls, residual_risk_acceptability, max_expected_occurrence_rate",
    },
  },
  {
    id: "6_sales_data_requirements",
    title: "Sales Data Requirements",
    slotIds: ["MDCG.ANNEXI.SALES_VOLUME_EXPOSURE", "MDCG.ANNEXI.SALES_TABLE"],
    content: {
      required_fields: ["Part_Number/SKU", "Product_Description", "Quantity_Sold", "Ship_Date or Invoice_Date", "Ship_to_Country/Region", "Customer_Type (optional)"],
      data_quality: { completeness: "No missing critical fields", accuracy: "Validated against financial records", date_format: "ISO 8601" },
      region_definitions: { EEA_TR_XI: "EU + Iceland, Liechtenstein, Norway, Turkey, NI", UK: "England, Scotland, Wales", United_States: "USA", Rest_of_World: "All other" },
      denominator_methods: { units_sold: "Most common", procedures_performed: "If available", patient_exposures: "Implantable/long-term", device_years: "Reusable devices" },
    },
  },
  {
    id: "7_complaint_data_requirements",
    title: "Complaint Data & IMDRF",
    slotIds: ["MDCG.ANNEXI.COMPLAINTS_SUMMARY", "MDCG.ANNEXI.COMPLAINTS_BY_REGION_SEVERITY_TABLE", "MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE_IMDRF"],
    content: {
      required_fields: ["Complaint_ID", "Date_Received", "Product_Identification", "Complaint_Description", "Severity_Classification", "MDR_Filed", "Investigation_Status", "Root_Cause", "Corrective_Action_Taken"],
      imdrf_annex_a: { medical_device_problem_codes: "4-digit + term", harm_codes: "H999 No health consequence; H1XX Death; H2XX Life-threatening; H3XX Permanent injury", patient_problem_codes: "PP codes optional" },
      serious_incident_criteria: { eu_mdr_article_2_65: "Death; serious injury (life-threatening, permanent impairment, intervention to prevent); malfunction if recurring would lead to death/serious injury", assessment: "Patient harm vs procedural impact - document clearly" },
    },
  },
  {
    id: "8_statistical_methods",
    title: "Statistical Methods & Calculations",
    slotIds: ["MDCG.ANNEXI.TREND_REPORTING", "MDCG.ANNEXI.TREND_TABLE", "MDCG.ANNEXI.COMPLAINTS_SUMMARY"],
    content: {
      complaint_rate: { formula: "(Complaint_Count / Units_Sold) x 100", units: "%", precision: "2 decimal places" },
      incident_rate: { formula: "(Incident_Count / Units_Sold) x 100 or x 10,000", units: "% or per 10,000" },
      trend_detection: { ucl: "UCL = Mean + (3 x SD); exceeds UCL = statistically significant", meaningful_increase: "> 25% relative", substantial_increase: "> 50% relative" },
      capa_effectiveness: { pre_post_analysis: "Pre-rate vs Post-rate; reduction > 25% meaningful, > 50% substantial", washout_period: "Optional" },
    },
  },
  {
    id: "9_external_database_search",
    title: "External Database Search Parameters",
    slotIds: ["MDCG.ANNEXI.EXTERNAL_DATABASES"],
    content: {
      required_databases: ["FDA MAUDE", "MHRA", "Health Canada", "Eudamed"],
      search_frequency: ["Beginning of period", "Mid-point (6-12 months)", "End of period"],
      device_specific_searches: ["Trade name", "Manufacturer", "Basic UDI-DI", "Model numbers", "GMDN code"],
      similar_device_searches: ["Device category", "Intended use", "Technology type"],
      search_logic: "Primary: device-specific terms; Secondary: broader category; date filter within surveillance period",
    },
  },
  {
    id: "10_cer_pmcf_requirements",
    title: "Clinical Evaluation & PMCF Requirements",
    slotIds: ["MDCG.ANNEXI.PMCF_SUMMARY", "MDCG.ANNEXI.PMCF_TABLE", "MDCG.ANNEXI.LITERATURE_REVIEW"],
    content: {
      cer_required_extracts: ["device_description", "intended_use", "target_population", "clinical_benefits", "clinical_risks", "clinical_evidence", "state_of_art"],
      pmcf_necessity: { formal_pmcf: "Evidence gaps, novel tech, long-term safety", passive_pmcf: "Sufficient evidence, well-established tech" },
      passive_activities: ["Complaint analysis", "Literature monitoring", "User feedback", "External DB review"],
      active_activities: ["Prospective study", "Registry enrollment"],
    },
  },
  {
    id: "11_capa_requirements",
    title: "CAPA System Requirements",
    slotIds: ["MDCG.ANNEXI.CAPA_SUMMARY", "MDCG.ANNEXI.CAPA_TABLE"],
    content: {
      required_fields: ["CAPA_Number", "Initiation_Date", "Initiating_Source", "Problem_Statement", "Root_Cause", "Corrective_Action", "Preventive_Action", "Implementation_Date", "Effectiveness_Check_Date", "Effectiveness_Result", "Closure_Date"],
      verification_methods: ["Complaint rate monitoring (3-6 months post)", "Process validation", "Design verification testing", "Customer feedback"],
      effectiveness_thresholds: { minimal: "< 25% reduction", moderate: "25-50%", substantial: "> 50%", complete: "Zero recurrence" },
    },
  },
  {
    id: "12_benefit_risk_criteria",
    title: "Benefit-Risk Determination Criteria",
    slotIds: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
    content: {
      favorable: "Benefits substantially outweigh residual risks; clinically meaningful benefit; risk rates within thresholds; no unexpected serious risks",
      unfavorable: "Risks outweigh benefits; serious risks exceed rates; benefits not achieved; new serious risks; better alternatives",
      required_statement: "Bold, clear: Benefit-risk profile NOT/HAS been adversely impacted - REMAINS ACCEPTABLE or Actions taken: [list]",
    },
  },
  {
    id: "13_fsca_criteria",
    title: "Field Safety Corrective Action Criteria",
    slotIds: ["MDCG.ANNEXI.FSCA_SUMMARY", "MDCG.ANNEXI.FSCA_TABLE"],
    content: {
      triggers: ["Death or serious injury (device-caused)", "Systematic safety defect", "Risk analysis change (residual risk unacceptable)", "Previously unidentified risk", "Labeling inadequacy"],
      fsca_types: ["Recall", "Device modification", "Software update", "Labeling/IFU revision", "Customer notification"],
      notification: "Competent authorities without delay; Notified Body immediately; EUDAMED upload",
    },
  },
  {
    id: "14_documentation_standards",
    title: "Documentation Standards & Formatting",
    slotIds: [],
    content: {
      mandatory_sections: "Cover, Executive Summary, A Device Info, B Scope, C Sales, D Vigilance, F Complaints, G Trend, H FSCA, I CAPA, J Benefit-Risk, K External Data, L PMCF, M Conclusions",
      narrative_style: { voice: "Third person", tense: "Present for current, past for historical", tone: "Professional, objective", format: "Narrative paragraphs - NO bullet points in narratives; bullets OK in lists/tables" },
      prohibited: ["First person (I, we)", "Promotional language", "Vague quantifiers (some, many)", "Speculation", "Marketing claims"],
      required: ["Quantitative data", "Source citations", "Consistent terminology", "Honest trend assessment"],
    },
  },
  {
    id: "15_key_thresholds",
    title: "Key Threshold Values & Decision Criteria",
    slotIds: ["MDCG.ANNEXI.TREND_REPORTING", "MDCG.ANNEXI.COMPLAINTS_SUMMARY", "MDCG.ANNEXI.SERIOUS_INCIDENTS_SUMMARY"],
    content: {
      complaint_rate_threshold: "Typically 5.00% max (device-specific from RMF)",
      trend_significance: { ucl_breach: "Statistically significant", meaningful_increase: "> 25%", substantial_increase: "> 50%", favorable_reduction: "> 25% decrease" },
      mandatory_investigation: ["Any serious incident", "UCL breach", "New complaint category", "Rate exceeds RMF threshold", "Multiple same root cause"],
      capa_required_when: ["Root cause requiring systemic correction", "Recurring same cause", "Rate trending up significantly"],
      capa_not_required_when: ["User error only", "Random isolated events", "Within statistical variation", "Root cause external"],
    },
  },
  {
    id: "16_language_terminology",
    title: "Language & Terminology Standards",
    slotIds: [],
    content: {
      use: "IMDRF Annex A device problem and harm codes; ISO 14971 risk terms; same term throughout for same concept",
      never_use: ["Favorable reduction from X% to Y% when Y > X", "No issues (be specific)", "Perfect safety record", "Zero defects", "Best in class", "I believe/We think"],
      instead_use: ["Increased from X% to Y%", "No complaints in category Z during period", "Zero deaths/serious injuries during period", "Analysis shows / Data indicates"],
    },
  },
  {
    id: "17_final_synthesis_section_m",
    title: "Final Synthesis Requirements (Section M)",
    slotIds: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION", "MDCG.ANNEXI.ACTIONS_TAKEN"],
    content: {
      benefit_risk_statement: "Bold, centered; Has/Has NOT been adversely impacted; supporting data: units, complaints, incidents, CAPA, external DB, PMCF",
      intended_benefits_achievement: "Primary/Secondary: Achieved / Partially / Not achieved with evidence",
      data_limitations: "List with impact (Minimal/Moderate/Significant) and mitigation",
      new_emerging_risks: "New risks; emerging trends; new benefits if any",
      actions_taken: "RMF updates, CAPAs with effectiveness, IFU updates, design changes, FSCA, or none required",
      overall_conclusion: "Device suitable for intended use; safety meets requirements; continued marketing justified; next PSUR date",
    },
  },
];

/**
 * Build the full regulatory context block for agent prompts.
 * All narrative agents receive this so they use consistent methods, thresholds, and terminology.
 */
export function buildRegulatoryContextForAgents(options?: { slotId?: string }): string {
  const lines: string[] = [
    "## REGULATORY CONTEXT (Methods, Thresholds, Terminology)",
    "",
    "Use the following context for calculations, terminology, and criteria. Do not deviate.",
    "",
  ];

  const sections = options?.slotId
    ? PSUR_REGULATORY_CONTEXT_SECTIONS.filter((s) => s.slotIds?.includes(options.slotId) || s.slotIds?.length === 0)
    : PSUR_REGULATORY_CONTEXT_SECTIONS;

  for (const section of sections) {
    lines.push(`### ${section.title}`);
    if (typeof section.content === "string") {
      lines.push(section.content);
    } else {
      lines.push(JSON.stringify(section.content, null, 2));
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Section IDs for Neo4j sync (ContextSection nodes) */
export function getRegulatoryContextSectionIds(): string[] {
  return PSUR_REGULATORY_CONTEXT_SECTIONS.map((s) => s.id);
}
