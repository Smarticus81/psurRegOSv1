/**
 * GRKB and MDCG 2022-21 Required Context Alignment
 *
 * Single source of truth for required PSUR context per:
 * - EU MDR 2017/745 Article 86, Article 83, Article 88, Annex III
 * - MDCG 2022-21 Annex I (Template for the PSUR)
 *
 * Dossier context and narrative content must align with these obligations.
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
    "## REGULATORY ALIGNMENT (GRKB and MDCG 2022-21)",
    "",
    "**Normative basis:** EU MDR 2017/745 Article 86(1), Article 83, Article 88, Annex III; MDCG 2022-21 Annex I (Template for the PSUR).",
    "",
    "**Mandatory GRKB obligations this PSUR must satisfy:**",
    ...MDCG_2022_21_ANNEX_I_MANDATORY_OBLIGATION_IDS.map((id) => `- ${id}`),
    "",
    "**Required context:** All narrative and tabular content must be grounded in:",
    "- Device dossier context (identity, intended purpose, clinical benefits, principal risks, thresholds, baselines, prior PSUR conclusions, regulatory history)",
    "- Evidence atoms provided for this section",
    "- No generic or placeholder statements; every conclusion must reference device-specific dossier context or cited evidence.",
    "",
    "**MDCG 2022-21 compliance:** Structure and content must align with MDCG 2022-21 Annex I section structure (Cover, Executive Summary, Device Scope, PMS, Sales/Exposure, Serious Incidents, Complaints, Trend Reporting, FSCA, CAPA, Literature Review, External Databases, PMCF, Benefit-Risk Conclusion, Actions Taken).",
  ];
  return lines.join("\n");
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
