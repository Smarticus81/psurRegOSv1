/**
 * MDCG 2022-21 ANNEX III (Legacy) → PSUR CONTRACT MAPPING
 */

import type {
    PSURSectionId,
    TableId,
    NarrativeConstraint,
} from "../psurContract";

export type ObligationId =
    | "ANNEX_III_1_PRODUCT_DESC"
    | "ANNEX_III_2_SALES_EXPOSURE"
    | "ANNEX_III_3_COMPLAINTS"
    | "ANNEX_III_4_VIGILANCE"
    | "ANNEX_III_5_FSCA"
    | "ANNEX_III_6_PMCF"
    | "ANNEX_III_7_BENEFIT_RISK"
    | "ANNEX_III_8_CONCLUSIONS";

export type EvidenceType =
    | "device_registry_record"
    | "sales_volume"
    | "complaint_record"
    | "serious_incident_record"
    | "vigilance_report"
    | "fsca_record"
    | "pmcf_result"
    | "risk_analysis"
    | "benefit_risk_assessment"
    | "ifu_extract"
    | "manufacturer_profile"
    | "complaint_summary";

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
    narrativeConstraints: NarrativeConstraint[];
    dependsOn?: ObligationId[];
}

export const MDCG_ANNEX_III_OBLIGATIONS: ObligationDefinition[] = [
    {
        obligationId: "ANNEX_III_1_PRODUCT_DESC",
        mdcgReference: "MDCG 2022-21 Annex III, Section 1",
        title: "Product Description",
        description: "Product description and intended purpose",
        isMandatory: true,
        jurisdiction: "BOTH",
        psurSectionId: "SECTION_B_DEVICE_DESCRIPTION",
        requiredTables: [],
        requiredEvidenceTypes: ["device_registry_record", "ifu_extract"],
        narrativeConstraints: [
            { type: "MUST_STATE", condition: "always", requiredText: "Device description provided." }
        ],
    },
    {
        obligationId: "ANNEX_III_2_SALES_EXPOSURE",
        mdcgReference: "MDCG 2022-21 Annex III, Section 2",
        title: "Sales & Exposure",
        description: "Sales volume and population exposure",
        isMandatory: true,
        jurisdiction: "BOTH",
        psurSectionId: "SECTION_C_SALES_EXPOSURE",
        requiredTables: [],
        requiredEvidenceTypes: ["sales_volume"],
        narrativeConstraints: [],
    },
    {
        obligationId: "ANNEX_III_3_COMPLAINTS",
        mdcgReference: "MDCG 2022-21 Annex III, Section 3",
        title: "Complaints",
        description: "Summary of complaints",
        isMandatory: true,
        jurisdiction: "BOTH",
        psurSectionId: "SECTION_D_COMPLAINTS",
        requiredTables: [],
        requiredEvidenceTypes: ["complaint_summary"],
        narrativeConstraints: [],
    },
    {
        obligationId: "ANNEX_III_4_VIGILANCE",
        mdcgReference: "MDCG 2022-21 Annex III, Section 4",
        title: "Vigilance",
        description: "Vigilance reporting",
        isMandatory: true,
        jurisdiction: "BOTH",
        psurSectionId: "SECTION_H_VIGILANCE_SUMMARY",
        requiredTables: [],
        requiredEvidenceTypes: ["serious_incident_record"],
        narrativeConstraints: [],
    },
    {
        obligationId: "ANNEX_III_5_FSCA",
        mdcgReference: "MDCG 2022-21 Annex III, Section 5",
        title: "FSCA",
        description: "Field Safety Corrective Actions",
        isMandatory: true,
        jurisdiction: "BOTH",
        psurSectionId: "SECTION_G_FSCA",
        requiredTables: [],
        requiredEvidenceTypes: ["fsca_record"],
        narrativeConstraints: [],
    },
    {
        obligationId: "ANNEX_III_6_PMCF",
        mdcgReference: "MDCG 2022-21 Annex III, Section 6",
        title: "PMCF",
        description: "Summary of findings from PMCF",
        isMandatory: true,
        jurisdiction: "BOTH",
        psurSectionId: "SECTION_K_PMCF",
        requiredTables: [],
        requiredEvidenceTypes: ["pmcf_result"],
        narrativeConstraints: [],
    },
    {
        obligationId: "ANNEX_III_7_BENEFIT_RISK",
        mdcgReference: "MDCG 2022-21 Annex III, Section 7",
        title: "Benefit-Risk",
        description: "Benefit-risk analysis",
        isMandatory: true,
        jurisdiction: "BOTH",
        psurSectionId: "SECTION_L_BENEFIT_RISK",
        requiredTables: [],
        requiredEvidenceTypes: ["benefit_risk_assessment"],
        narrativeConstraints: [],
    },
    {
        obligationId: "ANNEX_III_8_CONCLUSIONS",
        mdcgReference: "MDCG 2022-21 Annex III, Section 8",
        title: "Conclusions",
        description: "Overall conclusions",
        isMandatory: true,
        jurisdiction: "BOTH",
        psurSectionId: "SECTION_M_CONCLUSIONS",
        requiredTables: [],
        requiredEvidenceTypes: [],
        narrativeConstraints: [],
    }
];

export function getObligationById(id: ObligationId): ObligationDefinition | undefined {
    return MDCG_ANNEX_III_OBLIGATIONS.find(o => o.obligationId === id);
}
