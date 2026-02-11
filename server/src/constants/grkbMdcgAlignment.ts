/**
 * GRKB and MDCG 2022-21 Required Context Alignment
 *
 * Single source of truth for required PSUR context per:
 * - EU MDR 2017/745 Article 86, Article 83, Article 88, Annex III
 * - MDCG 2022-21 Annex I  (Template for the PSUR)
 * - MDCG 2022-21 Annex II (Mandatory Data Tables)
 * - MDCG 2022-21 Annex III (Presentation & Assessment Rules)
 *
 * Dossier context and narrative content must align with these obligations.
 * CRITICAL: Annex II and III are equally mandatory alongside Annex I.
 */

export const MDCG_2022_21_ANNEX_I_MANDATORY_OBLIGATION_IDS = [
  "EU.MDR.ART86.1.ADMIN",
  "EU.MDR.ART86.1.CONCLUSIONS",
  "EU.MDR.ART86.1.DEVICES_INTENDED_USE",
  "EU.MDR.ART86.1.SALES_POPULATION_USAGE",
  "EU.MDR.ART86.1.SERIOUS_INCIDENTS",
  "EU.MDR.ART86.1.FSCA",
  "EU.MDR.ART86.1.PMCF_MAIN_FINDINGS",
  "EU.MDR.ART88.TREND_REPORTING",
  "EU.MDR.ART83.PMS_SYSTEM",
  "EU.MDR.ANNEX_III.COMPLAINTS_FEEDBACK",
  "EU.MDR.ANNEX_III.LITERATURE_REVIEW",
  "EU.MDR.ANNEX_III.EXTERNAL_DATABASES",
  "EU.MDR.ANNEX_III.CORRECTIVE_PREVENTIVE_ACTIONS",
  "EU.MDR.ANNEX_III.PMCF",
  "EU.MDR.ANNEX_III.ACTIONS_TAKEN",
] as const;

/**
 * MDCG 2022-21 Annex II — Mandatory Data Tables
 * Every PSUR must include these tables with the required structure.
 */
export const MDCG_2022_21_ANNEX_II_MANDATORY_TABLE_IDS = [
  "MDCG.ANNEXII.TABLE_1",   // Volume of Sales by Region Over Time
  "MDCG.ANNEXII.TABLE_2",   // Estimated Population Using the Device
  "MDCG.ANNEXII.TABLE_3",   // Population Characteristics
  "MDCG.ANNEXII.TABLE_4",   // Serious Incidents by Device Problem (IMDRF Annex A)
  "MDCG.ANNEXII.TABLE_5",   // Serious Incidents by Investigation Finding (IMDRF Annex C)
  "MDCG.ANNEXII.TABLE_6",   // Health Impact by Investigation Conclusion (IMDRF Annex D/F)
  "MDCG.ANNEXII.TABLE_7",   // Field Safety Corrective Actions
  "MDCG.ANNEXII.TABLE_8",   // Corrective and Preventive Actions
] as const;

/**
 * MDCG 2022-21 Annex III — Presentation & Assessment Requirements
 * These are CRITICAL quality rules that govern HOW data is presented and assessed.
 */
export const MDCG_2022_21_ANNEX_III_MANDATORY_REQUIREMENTS = [
  "ANNEXIII.01",  // Dataset separation — each data source presented individually
  "ANNEXIII.02",  // Basic UDI-DI level data or justified aggregation
  "ANNEXIII.03",  // EEA+TR+XI and Worldwide regional split
  "ANNEXIII.04",  // Temporal comparison with appropriate time buckets (4-yr III/IIb, 2-yr IIa)
  "ANNEXIII.05",  // IMDRF Level 2 terminology used for incident coding
  "ANNEXIII.06",  // Cross-dataset analysis performed
  "ANNEXIII.07",  // State-of-the-art comparison included
  "ANNEXIII.08",  // Risk threshold analysis performed
  "ANNEXIII.09",  // Signal detection methodology applied and documented
  "ANNEXIII.10",  // Data quality assessment documented
  "ANNEXIII.11",  // Methodology statement complete (sources, criteria, statistics)
  "ANNEXIII.12",  // Benefit-risk conclusion stated with supporting rationale
  "ANNEXIII.13",  // Action items identified with timelines
] as const;

/**
 * Annex II table requirements — maps each table to its data/evidence needs.
 */
export const ANNEX_II_TABLE_REQUIREMENTS: Record<
  string,
  { title: string; evidenceTypes: string[]; imdrfAnnex?: string; regionalSplit: boolean; temporalComparison: boolean }
> = {
  "MDCG.ANNEXII.TABLE_1": {
    title: "Volume of Sales by Region Over Time",
    evidenceTypes: ["sales_volume", "sales_by_region"],
    regionalSplit: true,
    temporalComparison: true,
  },
  "MDCG.ANNEXII.TABLE_2": {
    title: "Estimated Population Using the Device",
    evidenceTypes: ["usage_estimate", "population_estimate"],
    regionalSplit: true,
    temporalComparison: true,
  },
  "MDCG.ANNEXII.TABLE_3": {
    title: "Population Characteristics",
    evidenceTypes: ["population_estimate", "clinical_evaluation_extract"],
    regionalSplit: true,
    temporalComparison: true,
  },
  "MDCG.ANNEXII.TABLE_4": {
    title: "Serious Incidents by Device Problem",
    evidenceTypes: ["serious_incident_record", "serious_incident_summary", "serious_incident_records_imdrf"],
    imdrfAnnex: "Annex A (Device Problem Codes)",
    regionalSplit: true,
    temporalComparison: true,
  },
  "MDCG.ANNEXII.TABLE_5": {
    title: "Serious Incidents by Investigation Finding",
    evidenceTypes: ["serious_incident_record", "vigilance_report"],
    imdrfAnnex: "Annex C (Investigation Finding Codes)",
    regionalSplit: true,
    temporalComparison: true,
  },
  "MDCG.ANNEXII.TABLE_6": {
    title: "Health Impact by Investigation Conclusion",
    evidenceTypes: ["serious_incident_record", "serious_incident_summary"],
    imdrfAnnex: "Annex D (Health Impact) + Annex F (Investigation Conclusion)",
    regionalSplit: true,
    temporalComparison: true,
  },
  "MDCG.ANNEXII.TABLE_7": {
    title: "Field Safety Corrective Actions",
    evidenceTypes: ["fsca_record", "fsca_summary"],
    regionalSplit: false,
    temporalComparison: false,
  },
  "MDCG.ANNEXII.TABLE_8": {
    title: "Corrective and Preventive Actions",
    evidenceTypes: ["capa_record", "capa_summary", "ncr_record"],
    regionalSplit: false,
    temporalComparison: false,
  },
};

/**
 * Annex III assessment rules — maps each requirement to the content expectation.
 */
export const ANNEX_III_ASSESSMENT_RULES: Record<
  string,
  { title: string; requirement: string; appliesTo: string[] }
> = {
  "ANNEXIII.01": {
    title: "Dataset Separation",
    requirement: "Each data source (complaints, incidents, literature, registries, PMCF) must be presented in its own section BEFORE any combined analysis",
    appliesTo: ["SAFETY", "TREND", "BENEFIT_RISK", "EXEC_SUMMARY"],
  },
  "ANNEXIII.02": {
    title: "Device Granularity",
    requirement: "Data must be presented at the Basic UDI-DI level. If aggregated across variants, provide explicit justification",
    appliesTo: ["DEVICE_SCOPE", "SAFETY", "TREND", "PMS_ACTIVITY"],
  },
  "ANNEXIII.03": {
    title: "Regional Split",
    requirement: "ALL quantitative data must be split between EEA+TR+XI and Worldwide as a minimum",
    appliesTo: ["SAFETY", "PMS_ACTIVITY", "TREND"],
  },
  "ANNEXIII.04": {
    title: "Temporal Comparison",
    requirement: "Use 4-year rolling comparison (N, N-12, N2-12, N3-12) for Class III/IIb or 2-period comparison for Class IIa. Show trends over time",
    appliesTo: ["SAFETY", "TREND", "PMS_ACTIVITY"],
  },
  "ANNEXIII.05": {
    title: "IMDRF Terminology",
    requirement: "Use IMDRF Level 2 codes for all incident categorization: Annex A (device problems), Annex C (investigation findings), Annex D (health impact), Annex F (investigation conclusions)",
    appliesTo: ["SAFETY", "FSCA"],
  },
  "ANNEXIII.06": {
    title: "Cross-Dataset Analysis",
    requirement: "Analyze patterns ACROSS data sources: complaint themes vs incident types, literature vs real-world experience, registry benchmarking, PMCF correlation with safety data",
    appliesTo: ["BENEFIT_RISK", "EXEC_SUMMARY", "CONCLUSION"],
  },
  "ANNEXIII.07": {
    title: "State-of-the-Art Comparison",
    requirement: "Compare device safety and performance against current state of the art: published clinical standards, similar device performance, clinical guidelines, benchmark registries",
    appliesTo: ["BENEFIT_RISK", "CLINICAL", "CONCLUSION"],
  },
  "ANNEXIII.08": {
    title: "Risk Threshold Analysis",
    requirement: "Identify when incident rates exceed predefined thresholds: absolute incidence thresholds, rate increase triggers (>50%), statistical significance, clinical significance",
    appliesTo: ["SAFETY", "TREND", "BENEFIT_RISK"],
  },
  "ANNEXIII.09": {
    title: "Signal Detection",
    requirement: "Apply and document systematic signal detection: disproportionality analysis, trend analysis over time, new event type identification, geographic cluster detection, lot/batch-specific signals",
    appliesTo: ["TREND", "SAFETY"],
  },
  "ANNEXIII.10": {
    title: "Data Quality Assessment",
    requirement: "Assess and document data quality: completeness of incident reports, coding accuracy, under-reporting estimation, data lag considerations",
    appliesTo: ["SAFETY", "PMS_ACTIVITY", "EXEC_SUMMARY"],
  },
  "ANNEXIII.11": {
    title: "Methodology Statement",
    requirement: "Explicitly state methodology: data sources and collection methods, inclusion/exclusion criteria, coding conventions, statistical methods, time periods covered",
    appliesTo: ["PMS_ACTIVITY", "TREND", "SAFETY", "CLINICAL"],
  },
  "ANNEXIII.12": {
    title: "Benefit-Risk Conclusion",
    requirement: "Provide clear benefit-risk conclusion: summary of demonstrated benefits, summary of identified risks, overall B/R determination, comparison to previous PSUR conclusion",
    appliesTo: ["BENEFIT_RISK", "CONCLUSION", "EXEC_SUMMARY"],
  },
  "ANNEXIII.13": {
    title: "Action Items",
    requirement: "Identify required actions with timelines: FSCA decisions, CAPA implementations, IFU/labeling updates, clinical evaluation updates, risk management file updates, PMCF protocol adjustments",
    appliesTo: ["CONCLUSION", "CAPA", "FSCA"],
  },
};

/** MDCG 2022-21 Annex I section IDs and required dossier context fields */
export const MDCG_SECTION_TO_DOSSIER_CONTEXT: Record<
  string,
  { dossierFields: string[]; evidenceTypes: string[] }
> = {
  "MDCG.ANNEXI.COVER": {
    dossierFields: ["tradeName", "manufacturerName", "basicUdiDi", "certificates"],
    evidenceTypes: ["device_registry_record", "manufacturer_profile", "regulatory_certificate_record"],
  },
  "MDCG.ANNEXI.EXEC_SUMMARY": {
    dossierFields: ["productSummary", "clinicalContext", "riskContext", "priorPsurContext", "regulatoryContext"],
    evidenceTypes: ["sales_summary", "complaint_summary", "serious_incident_summary", "trend_analysis", "fsca_summary", "capa_summary", "pmcf_summary", "literature_review_summary", "external_db_summary", "benefit_risk_assessment"],
  },
  "MDCG.ANNEXI.DEVICES_SCOPE": {
    dossierFields: ["tradeName", "intendedPurpose", "classification", "variants", "cerConclusions", "pmcfPlan"],
    evidenceTypes: ["device_registry_record", "ifu_extract", "clinical_evaluation_extract", "pms_plan_extract"],
  },
  "MDCG.ANNEXI.DEVICES_CHANGES": {
    dossierFields: ["variants", "designChanges", "priorPsurContext"],
    evidenceTypes: ["device_registry_record", "change_control_record", "previous_psur_extract"],
  },
  "MDCG.ANNEXI.PMS_OVERVIEW": {
    dossierFields: ["productSummary", "pmcfPlan", "literatureSearchProtocol", "externalDbSearchProtocol"],
    evidenceTypes: ["pms_plan_extract", "pms_activity_log", "data_source_register"],
  },
  "MDCG.ANNEXI.SALES_VOLUME_EXPOSURE": {
    dossierFields: ["cumulativeExposure", "marketEntryDate"],
    evidenceTypes: ["sales_summary", "distribution_summary", "usage_estimate"],
  },
  "MDCG.ANNEXI.SALES_TABLE": {
    dossierFields: ["cumulativeExposure"],
    evidenceTypes: ["sales_by_region", "usage_estimate"],
  },
  "MDCG.ANNEXI.SERIOUS_INCIDENTS_SUMMARY": {
    dossierFields: ["principalRisks", "riskThresholds", "hazardCategories"],
    evidenceTypes: ["serious_incident_summary", "vigilance_report"],
  },
  "MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE_IMDRF": {
    dossierFields: ["hazardCategories", "principalRisks"],
    evidenceTypes: ["serious_incident_records_imdrf"],
  },
  "MDCG.ANNEXI.COMPLAINTS_SUMMARY": {
    dossierFields: ["riskThresholds", "principalRisks"],
    evidenceTypes: ["complaint_summary", "complaint_record"],
  },
  "MDCG.ANNEXI.COMPLAINTS_BY_REGION_SEVERITY_TABLE": {
    dossierFields: [],
    evidenceTypes: ["complaints_by_region", "sales_by_region"],
  },
  "MDCG.ANNEXI.TREND_REPORTING": {
    dossierFields: ["riskThresholds", "performanceBaselines", "priorPsurContext"],
    evidenceTypes: ["trend_analysis", "signal_log", "complaint_record", "sales_summary"],
  },
  "MDCG.ANNEXI.TREND_TABLE": {
    dossierFields: ["performanceBaselines", "riskThresholds"],
    evidenceTypes: ["trend_analysis"],
  },
  "MDCG.ANNEXI.FSCA_SUMMARY": {
    dossierFields: ["fscaHistory", "regulatoryContext"],
    evidenceTypes: ["fsca_summary", "fsca_record", "recall_record"],
  },
  "MDCG.ANNEXI.FSCA_TABLE": {
    dossierFields: ["fscaHistory"],
    evidenceTypes: ["fsca_record"],
  },
  "MDCG.ANNEXI.CAPA_SUMMARY": {
    dossierFields: ["regulatoryContext"],
    evidenceTypes: ["capa_summary", "capa_record", "ncr_record"],
  },
  "MDCG.ANNEXI.CAPA_TABLE": {
    dossierFields: [],
    evidenceTypes: ["capa_record"],
  },
  "MDCG.ANNEXI.LITERATURE_REVIEW": {
    dossierFields: ["literatureSearchProtocol", "clinicalBenefits", "stateOfTheArt"],
    evidenceTypes: ["literature_review_summary", "literature_search_strategy"],
  },
  "MDCG.ANNEXI.EXTERNAL_DATABASES": {
    dossierFields: ["externalDbSearchProtocol"],
    evidenceTypes: ["external_db_summary", "external_db_query_log"],
  },
  "MDCG.ANNEXI.PMCF_SUMMARY": {
    dossierFields: ["pmcfPlan", "cerConclusions", "clinicalBenefits", "principalRisks"],
    evidenceTypes: ["pmcf_summary", "pmcf_report_extract", "cer_extract", "rmf_extract"],
  },
  "MDCG.ANNEXI.PMCF_TABLE": {
    dossierFields: ["pmcfPlan"],
    evidenceTypes: ["pmcf_activity_record"],
  },
  "MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION": {
    dossierFields: ["clinicalBenefits", "principalRisks", "residualRiskAcceptability", "priorPsurContext"],
    evidenceTypes: ["benefit_risk_assessment", "rmf_extract", "previous_psur_extract"],
  },
  "MDCG.ANNEXI.ACTIONS_TAKEN": {
    dossierFields: ["priorPsurContext", "nbCommitments", "designChanges"],
    evidenceTypes: ["change_control_record", "capa_summary", "rmf_change_log", "cer_change_log"],
  },
};

/** Build regulatory alignment text for agent prompts (template-level). */
export function buildRegulatoryAlignmentBlock(templateId: string): string {
  const lines: string[] = [
    "## MANDATORY CONTENT REQUIREMENTS (GRKB Alignment — Annex I + II + III)",
    "",
    "IMPORTANT: These requirements define WHAT content you must produce, WHAT tables you must generate,",
    "and HOW data must be presented and assessed. You MUST fully satisfy every obligation listed below",
    "through your content structure, completeness, and analytical rigor.",
    "However, NEVER cite, quote, or name any regulation, standard, or article number in the output text.",
    "",
    "### Annex I — PSUR Section Obligations (what sections to include):",
    ...MDCG_2022_21_ANNEX_I_MANDATORY_OBLIGATION_IDS.map((id) => `- ${id}`),
    "",
    "### Annex II — Mandatory Data Tables (what tables to produce):",
    ...MDCG_2022_21_ANNEX_II_MANDATORY_TABLE_IDS.map((id) => {
      const req = ANNEX_II_TABLE_REQUIREMENTS[id];
      return req ? `- ${id}: ${req.title}${req.imdrfAnnex ? ` [${req.imdrfAnnex}]` : ""}${req.regionalSplit ? " [Regional Split Required]" : ""}` : `- ${id}`;
    }),
    "",
    "### Annex III — Presentation & Assessment Rules (HOW to present and analyze):",
    ...MDCG_2022_21_ANNEX_III_MANDATORY_REQUIREMENTS.map((id) => {
      const rule = ANNEX_III_ASSESSMENT_RULES[id];
      return rule ? `- ${id}: ${rule.title} — ${rule.requirement}` : `- ${id}`;
    }),
    "",
    "**Required context:** All narrative and tabular content must be grounded in:",
    "- Device dossier context (identity, intended purpose, clinical benefits, principal risks, thresholds, baselines, prior PSUR conclusions)",
    "- Evidence atoms provided for this section",
    "- No generic or placeholder statements; every conclusion must reference device-specific dossier context or cited evidence.",
  ];
  return lines.join("\n");
}

/**
 * Get Annex III assessment rules applicable to a specific section type.
 * Returns the rules that the agent for this section MUST satisfy.
 */
export function getAnnexIIIRulesForSection(sectionType: string): { title: string; requirement: string; appliesTo: string[] }[] {
  return Object.values(ANNEX_III_ASSESSMENT_RULES).filter(
    (rule) => rule.appliesTo.includes(sectionType)
  );
}

/**
 * Get Annex II table requirements applicable to evidence types in a section.
 */
export function getAnnexIITablesForEvidenceTypes(evidenceTypes: string[]): { title: string; evidenceTypes: string[]; imdrfAnnex?: string; regionalSplit: boolean; temporalComparison: boolean }[] {
  const evidenceSet = new Set(evidenceTypes);
  return Object.values(ANNEX_II_TABLE_REQUIREMENTS).filter(
    (table) => table.evidenceTypes.some((et) => evidenceSet.has(et))
  );
}

/** Optional: section-specific alignment hint for a given slot. */
export function getSectionAlignmentHint(slotId: string): string | null {
  const mapping = MDCG_SECTION_TO_DOSSIER_CONTEXT[slotId];
  if (!mapping) return null;
  const parts: string[] = [];
  if (mapping.dossierFields.length) {
    parts.push(`Dossier fields to use: ${mapping.dossierFields.join(", ")}.`);
  }
  if (mapping.evidenceTypes.length) {
    parts.push(`Evidence types expected: ${mapping.evidenceTypes.join(", ")}.`);
  }
  return parts.length ? parts.join(" ") : null;
}
