/**
 * MDCG 2022-21 ANNEX I → PSUR CONTRACT MAPPING
 * 
 * This file provides a DETERMINISTIC, MACHINE-READABLE mapping between
 * MDCG 2022-21 Annex I obligations and the PSUR contract sections.
 * 
 * This mapping is AUTHORITATIVE and AUDITABLE.
 */

import type {
  PSURSectionId,
  TableId,
  NarrativeConstraint,
} from "../psurContract";

// ============================================================================
// OBLIGATION DEFINITIONS - Per MDCG 2022-21 Annex I
// ============================================================================

export type ObligationId =
  | "ANNEX_I_1_DEVICE_IDENTIFICATION"
  | "ANNEX_I_2_INTENDED_PURPOSE"
  | "ANNEX_I_3_INDICATIONS"
  | "ANNEX_I_4_CONTRAINDICATIONS"
  | "ANNEX_I_5_TARGET_POPULATION"
  | "ANNEX_I_6_USER_PROFILE"
  | "ANNEX_I_7_DEVICE_DESCRIPTION"
  | "ANNEX_I_8_VARIANTS_ACCESSORIES"
  | "ANNEX_I_9_PREVIOUS_GENERATIONS"
  | "ANNEX_I_10_SALES_DISTRIBUTION"
  | "ANNEX_I_11_POPULATION_EXPOSURE"
  | "ANNEX_I_12_COMPLAINTS_SUMMARY"
  | "ANNEX_I_13_COMPLAINT_RATES"
  | "ANNEX_I_14_COMPLAINT_TRENDS"
  | "ANNEX_I_15_HARM_CATEGORIES"
  | "ANNEX_I_16_SERIOUS_INCIDENTS"
  | "ANNEX_I_17_VIGILANCE_REPORTS"
  | "ANNEX_I_18_FSCA"
  | "ANNEX_I_19_TREND_REPORTING"
  | "ANNEX_I_20_CAPA_STATUS"
  | "ANNEX_I_21_LITERATURE_REVIEW"
  | "ANNEX_I_22_EXTERNAL_DATABASES"
  | "ANNEX_I_23_STATE_OF_ART"
  | "ANNEX_I_24_PMCF_STATUS"
  | "ANNEX_I_25_PMCF_RESULTS"
  | "ANNEX_I_26_BENEFIT_RISK"
  | "ANNEX_I_27_RISK_MANAGEMENT"
  | "ANNEX_I_28_CONCLUSIONS"
  | "ANNEX_I_29_RECOMMENDATIONS"
  | "ANNEX_I_30_NEXT_REVIEW";

export type EvidenceType =
  | "sales_volume"
  | "complaint_record"
  | "serious_incident_record"
  | "fsca_record"
  | "literature_result"
  | "pmcf_result"
  | "capa_record"
  | "risk_analysis"
  | "device_specification";

// ============================================================================
// OBLIGATION METADATA
// ============================================================================

export interface ObligationDefinition {
  obligationId: ObligationId;
  mdcgReference: string;
  title: string;
  description: string;
  isMandatory: boolean;
  jurisdiction: "EU_MDR" | "UK_MDR" | "BOTH";
  psurSectionId: PSURSectionId;
  requiredTables: TableId[];
  requiredEvidenceTypes: EvidenceType[];
  calculationRules?: CalculationRule[];
  narrativeConstraints: NarrativeConstraint[];
  dependsOn?: ObligationId[];
}

export interface CalculationRule {
  ruleId: string;
  name: string;
  formula: string;
  inputs: string[];
  outputUnit: string;
  description: string;
}

// ============================================================================
// FULL OBLIGATION MAPPING
// ============================================================================

export const MDCG_ANNEX_I_OBLIGATIONS: ObligationDefinition[] = [
  // -------------------------------------------------------------------------
  // SECTION A: PRODUCT IDENTIFICATION (Obligations 1-9)
  // -------------------------------------------------------------------------
  {
    obligationId: "ANNEX_I_1_DEVICE_IDENTIFICATION",
    mdcgReference: "MDCG 2022-21 Annex I, Section 1",
    title: "Device Identification",
    description: "Basic Unique Device Identification, nomenclature codes, and trade names",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_A_PRODUCT_INFO",
    requiredTables: ["TABLE_DEVICE_IDENTIFICATION"],
    requiredEvidenceTypes: ["device_specification"],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "always",
        requiredText: "The device is identified by the following UDI-DI and nomenclature codes.",
      },
    ],
  },
  {
    obligationId: "ANNEX_I_2_INTENDED_PURPOSE",
    mdcgReference: "MDCG 2022-21 Annex I, Section 2",
    title: "Intended Purpose",
    description: "Statement of the intended purpose as per technical documentation",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_B_DEVICE_DESCRIPTION",
    requiredTables: [],
    requiredEvidenceTypes: ["device_specification"],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "always",
        requiredText: "The intended purpose of the device is:",
      },
    ],
  },
  {
    obligationId: "ANNEX_I_3_INDICATIONS",
    mdcgReference: "MDCG 2022-21 Annex I, Section 3",
    title: "Indications for Use",
    description: "Medical indications for which the device is intended",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_B_DEVICE_DESCRIPTION",
    requiredTables: [],
    requiredEvidenceTypes: ["device_specification"],
    narrativeConstraints: [],
  },
  {
    obligationId: "ANNEX_I_4_CONTRAINDICATIONS",
    mdcgReference: "MDCG 2022-21 Annex I, Section 4",
    title: "Contraindications",
    description: "Contraindications and warnings",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_B_DEVICE_DESCRIPTION",
    requiredTables: [],
    requiredEvidenceTypes: ["device_specification"],
    narrativeConstraints: [],
  },
  {
    obligationId: "ANNEX_I_5_TARGET_POPULATION",
    mdcgReference: "MDCG 2022-21 Annex I, Section 5",
    title: "Target Patient Population",
    description: "Description of the target patient population",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_B_DEVICE_DESCRIPTION",
    requiredTables: [],
    requiredEvidenceTypes: ["device_specification"],
    narrativeConstraints: [],
  },
  {
    obligationId: "ANNEX_I_6_USER_PROFILE",
    mdcgReference: "MDCG 2022-21 Annex I, Section 6",
    title: "Intended User Profile",
    description: "Description of intended users and required training",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_B_DEVICE_DESCRIPTION",
    requiredTables: [],
    requiredEvidenceTypes: ["device_specification"],
    narrativeConstraints: [],
  },
  {
    obligationId: "ANNEX_I_7_DEVICE_DESCRIPTION",
    mdcgReference: "MDCG 2022-21 Annex I, Section 7",
    title: "Device Description",
    description: "Technical description of the device",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_B_DEVICE_DESCRIPTION",
    requiredTables: [],
    requiredEvidenceTypes: ["device_specification"],
    narrativeConstraints: [],
  },
  {
    obligationId: "ANNEX_I_8_VARIANTS_ACCESSORIES",
    mdcgReference: "MDCG 2022-21 Annex I, Section 8",
    title: "Variants and Accessories",
    description: "Description of device variants, configurations, and accessories",
    isMandatory: false,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_B_DEVICE_DESCRIPTION",
    requiredTables: [],
    requiredEvidenceTypes: ["device_specification"],
    narrativeConstraints: [],
  },
  {
    obligationId: "ANNEX_I_9_PREVIOUS_GENERATIONS",
    mdcgReference: "MDCG 2022-21 Annex I, Section 9",
    title: "Previous Generations",
    description: "Information on predecessor devices if applicable",
    isMandatory: false,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_B_DEVICE_DESCRIPTION",
    requiredTables: [],
    requiredEvidenceTypes: ["device_specification"],
    narrativeConstraints: [],
  },

  // -------------------------------------------------------------------------
  // SECTION C: SALES & EXPOSURE (Obligations 10-11)
  // -------------------------------------------------------------------------
  {
    obligationId: "ANNEX_I_10_SALES_DISTRIBUTION",
    mdcgReference: "MDCG 2022-21 Annex I, Section 10",
    title: "Sales and Distribution Data",
    description: "Number of devices placed on market by region and time period",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_C_SALES_EXPOSURE",
    requiredTables: ["TABLE_SALES_BY_REGION_YEAR", "TABLE_SALES_CUMULATIVE"],
    requiredEvidenceTypes: ["sales_volume"],
    calculationRules: [
      {
        ruleId: "CALC_REGIONAL_PERCENT",
        name: "Regional Sales Percentage",
        formula: "(regional_sales / global_sales) * 100",
        inputs: ["regional_sales", "global_sales"],
        outputUnit: "percentage",
        description: "Calculate percentage of global sales per region",
      },
      {
        ruleId: "CALC_CUMULATIVE",
        name: "Cumulative Sales",
        formula: "SUM(sales_by_period)",
        inputs: ["sales_by_period[]"],
        outputUnit: "units",
        description: "Calculate cumulative sales since market entry",
      },
    ],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "always",
        requiredText: "The following table summarizes the distribution of devices during the reporting period.",
      },
    ],
  },
  {
    obligationId: "ANNEX_I_11_POPULATION_EXPOSURE",
    mdcgReference: "MDCG 2022-21 Annex I, Section 11",
    title: "Population Exposure Estimate",
    description: "Estimate of patient/user exposure based on sales and usage patterns",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_C_SALES_EXPOSURE",
    requiredTables: ["TABLE_POPULATION_EXPOSURE"],
    requiredEvidenceTypes: ["sales_volume"],
    calculationRules: [
      {
        ruleId: "CALC_EXPOSURE_SINGLE_USE",
        name: "Single-Use Exposure",
        formula: "cumulative_units_sold",
        inputs: ["cumulative_units_sold"],
        outputUnit: "patient_exposures",
        description: "For single-use devices, exposure equals units sold",
      },
      {
        ruleId: "CALC_EXPOSURE_REUSABLE",
        name: "Reusable Device Exposure",
        formula: "cumulative_units_sold * avg_procedures_per_device",
        inputs: ["cumulative_units_sold", "avg_procedures_per_device"],
        outputUnit: "patient_exposures",
        description: "For reusable devices, estimate based on average procedures",
      },
    ],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "always",
        requiredText: "Population exposure is estimated based on the device usage model:",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // SECTION D: COMPLAINTS (Obligations 12-15)
  // -------------------------------------------------------------------------
  {
    obligationId: "ANNEX_I_12_COMPLAINTS_SUMMARY",
    mdcgReference: "MDCG 2022-21 Annex I, Section 12",
    title: "Complaint Summary",
    description: "Summary of customer complaints received during reporting period",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_D_COMPLAINTS",
    requiredTables: ["TABLE_COMPLAINTS_BY_CATEGORY"],
    requiredEvidenceTypes: ["complaint_record"],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "complaint_count > 0",
        requiredText: "During the reporting period, [COUNT] complaints were received.",
      },
      {
        type: "MUST_STATE",
        condition: "complaint_count == 0",
        requiredText: "No complaints were received during the reporting period.",
      },
    ],
  },
  {
    obligationId: "ANNEX_I_13_COMPLAINT_RATES",
    mdcgReference: "MDCG 2022-21 Annex I, Section 13",
    title: "Complaint Rates",
    description: "Complaint rates normalized to units sold",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_D_COMPLAINTS",
    requiredTables: ["TABLE_COMPLAINT_RATES"],
    requiredEvidenceTypes: ["complaint_record", "sales_volume"],
    calculationRules: [
      {
        ruleId: "CALC_COMPLAINT_RATE",
        name: "Complaint Rate",
        formula: "(complaints / units_sold) * 1000",
        inputs: ["complaints", "units_sold"],
        outputUnit: "per_1000_units",
        description: "Complaints per 1,000 units sold",
      },
    ],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "always",
        requiredText: "The complaint rate is calculated as complaints per 1,000 units sold.",
      },
    ],
    dependsOn: ["ANNEX_I_10_SALES_DISTRIBUTION", "ANNEX_I_12_COMPLAINTS_SUMMARY"],
  },
  {
    obligationId: "ANNEX_I_14_COMPLAINT_TRENDS",
    mdcgReference: "MDCG 2022-21 Annex I, Section 14",
    title: "Complaint Trends",
    description: "Analysis of complaint trends over time",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_E_COMPLAINT_TRENDS",
    requiredTables: ["TABLE_COMPLAINT_TRENDS", "TABLE_UCL_ANALYSIS"],
    requiredEvidenceTypes: ["complaint_record"],
    calculationRules: [
      {
        ruleId: "CALC_UCL",
        name: "Upper Control Limit",
        formula: "mean + (3 * stddev)",
        inputs: ["mean", "stddev"],
        outputUnit: "rate",
        description: "3-sigma upper control limit for trend detection",
      },
      {
        ruleId: "CALC_TREND_SLOPE",
        name: "Trend Slope",
        formula: "linear_regression_slope(time_series)",
        inputs: ["time_series"],
        outputUnit: "rate_change_per_period",
        description: "Slope of linear regression for trend analysis",
      },
    ],
    narrativeConstraints: [
      {
        type: "MUST_CONCLUDE",
        condition: "trend_significant == true",
        requiredText: "A statistically significant trend has been identified. A Trend Report per Article 88 is required.",
      },
      {
        type: "MUST_STATE",
        condition: "trend_significant == false",
        requiredText: "No statistically significant trends have been identified.",
      },
    ],
    dependsOn: ["ANNEX_I_12_COMPLAINTS_SUMMARY"],
  },
  {
    obligationId: "ANNEX_I_15_HARM_CATEGORIES",
    mdcgReference: "MDCG 2022-21 Annex I, Section 15",
    title: "Harm Categories",
    description: "Analysis of complaints by patient harm category",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_D_COMPLAINTS",
    requiredTables: ["TABLE_COMPLAINTS_BY_HARM"],
    requiredEvidenceTypes: ["complaint_record"],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "always",
        requiredText: "Complaints have been categorized by severity of patient harm per ISO 14971.",
      },
    ],
    dependsOn: ["ANNEX_I_12_COMPLAINTS_SUMMARY"],
  },

  // -------------------------------------------------------------------------
  // SECTION F-H: VIGILANCE (Obligations 16-20)
  // -------------------------------------------------------------------------
  {
    obligationId: "ANNEX_I_16_SERIOUS_INCIDENTS",
    mdcgReference: "MDCG 2022-21 Annex I, Section 16",
    title: "Serious Incidents",
    description: "Summary of serious incidents reported during the period",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_F_SERIOUS_INCIDENTS",
    requiredTables: ["TABLE_SERIOUS_INCIDENTS", "TABLE_IMDRF_ANNEX_A"],
    requiredEvidenceTypes: ["serious_incident_record"],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "incident_count > 0",
        requiredText: "[COUNT] serious incidents were reported during the reporting period.",
      },
      {
        type: "MUST_STATE",
        condition: "incident_count == 0",
        requiredText: "No serious incidents were reported during the reporting period.",
      },
    ],
  },
  {
    obligationId: "ANNEX_I_17_VIGILANCE_REPORTS",
    mdcgReference: "MDCG 2022-21 Annex I, Section 17",
    title: "Vigilance Reports",
    description: "Details of vigilance reports submitted to competent authorities",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_H_VIGILANCE_SUMMARY",
    requiredTables: ["TABLE_IMDRF_ANNEX_C", "TABLE_IMDRF_ANNEX_F"],
    requiredEvidenceTypes: ["serious_incident_record"],
    narrativeConstraints: [
      {
        type: "MUST_REFERENCE",
        condition: "vigilance_report_exists",
        requiredText: "Vigilance reports have been submitted per MDR Article 87.",
      },
    ],
    dependsOn: ["ANNEX_I_16_SERIOUS_INCIDENTS"],
  },
  {
    obligationId: "ANNEX_I_18_FSCA",
    mdcgReference: "MDCG 2022-21 Annex I, Section 18",
    title: "Field Safety Corrective Actions",
    description: "Summary of any FSCAs initiated or ongoing during the period",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_G_FSCA",
    requiredTables: ["TABLE_FSCA_SUMMARY"],
    requiredEvidenceTypes: ["fsca_record"],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "fsca_count > 0",
        requiredText: "[COUNT] Field Safety Corrective Actions were initiated or ongoing during the reporting period.",
      },
      {
        type: "MUST_STATE",
        condition: "fsca_count == 0",
        requiredText: "No Field Safety Corrective Actions were initiated during the reporting period.",
      },
    ],
  },
  {
    obligationId: "ANNEX_I_19_TREND_REPORTING",
    mdcgReference: "MDCG 2022-21 Annex I, Section 19",
    title: "Trend Reporting per Article 88",
    description: "Assessment of whether Article 88 trend reporting is triggered",
    isMandatory: true,
    jurisdiction: "EU_MDR",
    psurSectionId: "SECTION_E_COMPLAINT_TRENDS",
    requiredTables: [],
    requiredEvidenceTypes: ["complaint_record", "serious_incident_record"],
    narrativeConstraints: [
      {
        type: "MUST_CONCLUDE",
        condition: "always",
        requiredText: "Based on the trend analysis, Article 88 trend reporting [IS/IS NOT] required.",
      },
    ],
    dependsOn: ["ANNEX_I_14_COMPLAINT_TRENDS"],
  },
  {
    obligationId: "ANNEX_I_20_CAPA_STATUS",
    mdcgReference: "MDCG 2022-21 Annex I, Section 20",
    title: "CAPA Status",
    description: "Status of corrective and preventive actions",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_H_VIGILANCE_SUMMARY",
    requiredTables: ["TABLE_CAPA_STATUS"],
    requiredEvidenceTypes: ["capa_record"],
    narrativeConstraints: [],
    dependsOn: ["ANNEX_I_16_SERIOUS_INCIDENTS", "ANNEX_I_18_FSCA"],
  },

  // -------------------------------------------------------------------------
  // SECTION I-J: LITERATURE & EXTERNAL DATA (Obligations 21-23)
  // -------------------------------------------------------------------------
  {
    obligationId: "ANNEX_I_21_LITERATURE_REVIEW",
    mdcgReference: "MDCG 2022-21 Annex I, Section 21",
    title: "Literature Review",
    description: "Systematic review of published literature",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_I_LITERATURE_REVIEW",
    requiredTables: ["TABLE_LITERATURE_SUMMARY"],
    requiredEvidenceTypes: ["literature_result"],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "new_safety_signals == 0",
        requiredText: "No new safety signals were identified from the literature review.",
      },
      {
        type: "MUST_STATE",
        condition: "new_safety_signals > 0",
        requiredText: "[COUNT] potential safety signals were identified and evaluated.",
      },
    ],
  },
  {
    obligationId: "ANNEX_I_22_EXTERNAL_DATABASES",
    mdcgReference: "MDCG 2022-21 Annex I, Section 22",
    title: "External Database Review",
    description: "Review of MAUDE, MHRA, TGA, and other databases",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_J_EXTERNAL_DATABASES",
    requiredTables: ["TABLE_EXTERNAL_DB_FINDINGS"],
    requiredEvidenceTypes: ["literature_result"],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "always",
        requiredText: "The following external databases were reviewed:",
      },
    ],
  },
  {
    obligationId: "ANNEX_I_23_STATE_OF_ART",
    mdcgReference: "MDCG 2022-21 Annex I, Section 23",
    title: "State of the Art Assessment",
    description: "Assessment of alignment with current state of the art",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_I_LITERATURE_REVIEW",
    requiredTables: [],
    requiredEvidenceTypes: ["literature_result"],
    narrativeConstraints: [
      {
        type: "MUST_CONCLUDE",
        condition: "always",
        requiredText: "The device remains aligned with the current state of the art.",
      },
    ],
    dependsOn: ["ANNEX_I_21_LITERATURE_REVIEW"],
  },

  // -------------------------------------------------------------------------
  // SECTION K: PMCF (Obligations 24-25)
  // -------------------------------------------------------------------------
  {
    obligationId: "ANNEX_I_24_PMCF_STATUS",
    mdcgReference: "MDCG 2022-21 Annex I, Section 24",
    title: "PMCF Status",
    description: "Status of post-market clinical follow-up activities",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_K_PMCF",
    requiredTables: ["TABLE_PMCF_ACTIVITIES"],
    requiredEvidenceTypes: ["pmcf_result"],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "pmcf_ongoing",
        requiredText: "PMCF activities are ongoing per the PMCF Plan.",
      },
      {
        type: "MUST_STATE",
        condition: "pmcf_not_required",
        requiredText: "PMCF is not required based on the following justification:",
      },
    ],
  },
  {
    obligationId: "ANNEX_I_25_PMCF_RESULTS",
    mdcgReference: "MDCG 2022-21 Annex I, Section 25",
    title: "PMCF Results",
    description: "Summary of PMCF study results if available",
    isMandatory: false,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_K_PMCF",
    requiredTables: [],
    requiredEvidenceTypes: ["pmcf_result"],
    narrativeConstraints: [],
    dependsOn: ["ANNEX_I_24_PMCF_STATUS"],
  },

  // -------------------------------------------------------------------------
  // SECTION L-M: BENEFIT-RISK & CONCLUSIONS (Obligations 26-30)
  // -------------------------------------------------------------------------
  {
    obligationId: "ANNEX_I_26_BENEFIT_RISK",
    mdcgReference: "MDCG 2022-21 Annex I, Section 26",
    title: "Benefit-Risk Analysis",
    description: "Updated benefit-risk determination",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_L_BENEFIT_RISK",
    requiredTables: ["TABLE_RISK_BENEFIT_MATRIX"],
    requiredEvidenceTypes: ["risk_analysis"],
    narrativeConstraints: [
      {
        type: "MUST_CONCLUDE",
        condition: "always",
        requiredText: "The benefit-risk profile of the device remains [FAVORABLE/UNFAVORABLE].",
      },
    ],
    dependsOn: [
      "ANNEX_I_12_COMPLAINTS_SUMMARY",
      "ANNEX_I_16_SERIOUS_INCIDENTS",
      "ANNEX_I_21_LITERATURE_REVIEW",
    ],
  },
  {
    obligationId: "ANNEX_I_27_RISK_MANAGEMENT",
    mdcgReference: "MDCG 2022-21 Annex I, Section 27",
    title: "Risk Management Update",
    description: "Impact on risk management file",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_L_BENEFIT_RISK",
    requiredTables: [],
    requiredEvidenceTypes: ["risk_analysis"],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "risk_file_updated",
        requiredText: "The Risk Management File has been updated to reflect the findings of this PSUR.",
      },
      {
        type: "MUST_STATE",
        condition: "risk_file_not_updated",
        requiredText: "No updates to the Risk Management File are required based on this PSUR.",
      },
    ],
    dependsOn: ["ANNEX_I_26_BENEFIT_RISK"],
  },
  {
    obligationId: "ANNEX_I_28_CONCLUSIONS",
    mdcgReference: "MDCG 2022-21 Annex I, Section 28",
    title: "Conclusions",
    description: "Overall conclusions from the periodic safety review",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_M_CONCLUSIONS",
    requiredTables: [],
    requiredEvidenceTypes: [],
    narrativeConstraints: [
      {
        type: "MUST_CONCLUDE",
        condition: "always",
        requiredText: "Based on the analysis in this PSUR, the following conclusions are drawn:",
      },
    ],
    dependsOn: ["ANNEX_I_26_BENEFIT_RISK"],
  },
  {
    obligationId: "ANNEX_I_29_RECOMMENDATIONS",
    mdcgReference: "MDCG 2022-21 Annex I, Section 29",
    title: "Recommendations",
    description: "Recommendations for actions if any",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_M_CONCLUSIONS",
    requiredTables: [],
    requiredEvidenceTypes: [],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "actions_required > 0",
        requiredText: "The following actions are recommended:",
      },
      {
        type: "MUST_STATE",
        condition: "actions_required == 0",
        requiredText: "No additional actions are recommended at this time.",
      },
    ],
    dependsOn: ["ANNEX_I_28_CONCLUSIONS"],
  },
  {
    obligationId: "ANNEX_I_30_NEXT_REVIEW",
    mdcgReference: "MDCG 2022-21 Annex I, Section 30",
    title: "Next Review Date",
    description: "Planned date for next PSUR",
    isMandatory: true,
    jurisdiction: "BOTH",
    psurSectionId: "SECTION_M_CONCLUSIONS",
    requiredTables: [],
    requiredEvidenceTypes: [],
    narrativeConstraints: [
      {
        type: "MUST_STATE",
        condition: "always",
        requiredText: "The next PSUR is due:",
      },
    ],
  },
];

// ============================================================================
// LOOKUP FUNCTIONS
// ============================================================================

export function getObligationById(id: ObligationId): ObligationDefinition | undefined {
  return MDCG_ANNEX_I_OBLIGATIONS.find(o => o.obligationId === id);
}

export function getObligationsBySection(sectionId: PSURSectionId): ObligationDefinition[] {
  return MDCG_ANNEX_I_OBLIGATIONS.filter(o => o.psurSectionId === sectionId);
}

export function getMandatoryObligations(): ObligationDefinition[] {
  return MDCG_ANNEX_I_OBLIGATIONS.filter(o => o.isMandatory);
}

export function getObligationsByJurisdiction(jurisdiction: "EU_MDR" | "UK_MDR"): ObligationDefinition[] {
  return MDCG_ANNEX_I_OBLIGATIONS.filter(
    o => o.jurisdiction === jurisdiction || o.jurisdiction === "BOTH"
  );
}

export function getRequiredEvidenceTypes(): Set<EvidenceType> {
  const types = new Set<EvidenceType>();
  for (const obligation of MDCG_ANNEX_I_OBLIGATIONS) {
    for (const et of obligation.requiredEvidenceTypes) {
      types.add(et);
    }
  }
  return types;
}

export function getObligationDependencies(id: ObligationId): ObligationId[] {
  const obligation = getObligationById(id);
  return obligation?.dependsOn || [];
}

export function getCalculationRulesForObligation(id: ObligationId): CalculationRule[] {
  const obligation = getObligationById(id);
  return obligation?.calculationRules || [];
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

export interface ObligationValidationResult {
  obligationId: ObligationId;
  satisfied: boolean;
  errors: string[];
  warnings: string[];
  evidenceAtomIds: string[];
}

export function validateObligationCoverage(
  obligationId: ObligationId,
  providedTables: TableId[],
  providedEvidenceTypes: EvidenceType[],
  evidenceAtomIds: string[]
): ObligationValidationResult {
  const obligation = getObligationById(obligationId);
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!obligation) {
    return {
      obligationId,
      satisfied: false,
      errors: [`Unknown obligation: ${obligationId}`],
      warnings: [],
      evidenceAtomIds: [],
    };
  }
  
  // Check required tables
  for (const requiredTable of obligation.requiredTables) {
    if (!providedTables.includes(requiredTable)) {
      errors.push(`Missing required table: ${requiredTable}`);
    }
  }
  
  // Check required evidence types
  for (const requiredType of obligation.requiredEvidenceTypes) {
    if (!providedEvidenceTypes.includes(requiredType)) {
      errors.push(`Missing required evidence type: ${requiredType}`);
    }
  }
  
  // Check evidence atom linkage
  if (evidenceAtomIds.length === 0 && obligation.requiredEvidenceTypes.length > 0) {
    warnings.push("No evidence atoms linked to this obligation");
  }
  
  return {
    obligationId,
    satisfied: errors.length === 0,
    errors,
    warnings,
    evidenceAtomIds,
  };
}

// ============================================================================
// SECTION → OBLIGATION MAPPING (Reverse lookup)
// ============================================================================

export const SECTION_OBLIGATION_MAP: Record<PSURSectionId, ObligationId[]> = {
  COVER_PAGE: [],
  TABLE_OF_CONTENTS: [],
  SECTION_A_PRODUCT_INFO: ["ANNEX_I_1_DEVICE_IDENTIFICATION"],
  SECTION_B_DEVICE_DESCRIPTION: [
    "ANNEX_I_2_INTENDED_PURPOSE",
    "ANNEX_I_3_INDICATIONS",
    "ANNEX_I_4_CONTRAINDICATIONS",
    "ANNEX_I_5_TARGET_POPULATION",
    "ANNEX_I_6_USER_PROFILE",
    "ANNEX_I_7_DEVICE_DESCRIPTION",
    "ANNEX_I_8_VARIANTS_ACCESSORIES",
    "ANNEX_I_9_PREVIOUS_GENERATIONS",
  ],
  SECTION_C_SALES_EXPOSURE: [
    "ANNEX_I_10_SALES_DISTRIBUTION",
    "ANNEX_I_11_POPULATION_EXPOSURE",
  ],
  SECTION_D_COMPLAINTS: [
    "ANNEX_I_12_COMPLAINTS_SUMMARY",
    "ANNEX_I_13_COMPLAINT_RATES",
    "ANNEX_I_15_HARM_CATEGORIES",
  ],
  SECTION_E_COMPLAINT_TRENDS: [
    "ANNEX_I_14_COMPLAINT_TRENDS",
    "ANNEX_I_19_TREND_REPORTING",
  ],
  SECTION_F_SERIOUS_INCIDENTS: ["ANNEX_I_16_SERIOUS_INCIDENTS"],
  SECTION_G_FSCA: ["ANNEX_I_18_FSCA"],
  SECTION_H_VIGILANCE_SUMMARY: [
    "ANNEX_I_17_VIGILANCE_REPORTS",
    "ANNEX_I_20_CAPA_STATUS",
  ],
  SECTION_I_LITERATURE_REVIEW: [
    "ANNEX_I_21_LITERATURE_REVIEW",
    "ANNEX_I_23_STATE_OF_ART",
  ],
  SECTION_J_EXTERNAL_DATABASES: ["ANNEX_I_22_EXTERNAL_DATABASES"],
  SECTION_K_PMCF: ["ANNEX_I_24_PMCF_STATUS", "ANNEX_I_25_PMCF_RESULTS"],
  SECTION_L_BENEFIT_RISK: ["ANNEX_I_26_BENEFIT_RISK", "ANNEX_I_27_RISK_MANAGEMENT"],
  SECTION_M_CONCLUSIONS: [
    "ANNEX_I_28_CONCLUSIONS",
    "ANNEX_I_29_RECOMMENDATIONS",
    "ANNEX_I_30_NEXT_REVIEW",
  ],
  SECTION_N_SIGNOFF: [],
  APPENDIX_A_EVIDENCE_REGISTER: [],
  APPENDIX_B_TRACE_LOG: [],
};
