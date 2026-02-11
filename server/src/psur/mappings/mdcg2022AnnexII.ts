/**
 * MDCG 2022-21 ANNEX II (Web Form) → PSUR CONTRACT MAPPING
 */

import type {
    PSURSectionId,
    TableId,
    NarrativeConstraint,
} from "../psurContract";

export type ObligationId =
    | "ANNEX_II_1_MFG_INFO"
    | "ANNEX_II_2_DEVICE_INFO"
    | "ANNEX_II_3_PERIOD"
    | "ANNEX_II_4_SALES_METRICS"
    | "ANNEX_II_5_INCIDENTS_METRICS"
    | "ANNEX_II_6_CONCLUSION";

export type EvidenceType =
    | "manufacturer_profile"
    | "device_registry_record"
    | "sales_volume"
    | "serious_incident_summary"
    | "complaint_summary"
    | "benefit_risk_assessment";

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

export const MDCG_ANNEX_II_OBLIGATIONS: ObligationDefinition[] = [
    {
        obligationId: "ANNEX_II_1_MFG_INFO",
        mdcgReference: "MDCG 2022-21 Annex II, Section 1",
        title: "Manufacturer Info",
        description: "SRN and address",
        isMandatory: true,
        jurisdiction: "EU_MDR",
        psurSectionId: "SECTION_A_PRODUCT_INFO",
        requiredTables: [],
        requiredEvidenceTypes: ["manufacturer_profile"],
        narrativeConstraints: [],
    },
    {
        obligationId: "ANNEX_II_2_DEVICE_INFO",
        mdcgReference: "MDCG 2022-21 Annex II, Section 2",
        title: "Device Info",
        description: "Basic UDI-DI",
        isMandatory: true,
        jurisdiction: "EU_MDR",
        psurSectionId: "SECTION_A_PRODUCT_INFO",
        requiredTables: [],
        requiredEvidenceTypes: ["device_registry_record"],
        narrativeConstraints: [],
    },
    {
        obligationId: "ANNEX_II_3_PERIOD",
        mdcgReference: "MDCG 2022-21 Annex II, Section 3",
        title: "Reporting Period",
        description: "Start and end dates",
        isMandatory: true,
        jurisdiction: "EU_MDR",
        psurSectionId: "SECTION_A_PRODUCT_INFO",
        requiredTables: [],
        requiredEvidenceTypes: [],
        narrativeConstraints: [],
    },
    {
        obligationId: "ANNEX_II_4_SALES_METRICS",
        mdcgReference: "MDCG 2022-21 Annex II, Section 4",
        title: "Sales Metrics",
        description: "Total units sold",
        isMandatory: true,
        jurisdiction: "EU_MDR",
        psurSectionId: "SECTION_C_SALES_EXPOSURE",
        requiredTables: [],
        requiredEvidenceTypes: ["sales_volume"],
        narrativeConstraints: [],
    },
    {
        obligationId: "ANNEX_II_5_INCIDENTS_METRICS",
        mdcgReference: "MDCG 2022-21 Annex II, Section 5",
        title: "Incidents Metrics",
        description: "Total serious incidents",
        isMandatory: true,
        jurisdiction: "EU_MDR",
        psurSectionId: "SECTION_F_SERIOUS_INCIDENTS",
        requiredTables: [],
        requiredEvidenceTypes: ["serious_incident_summary"],
        narrativeConstraints: [],
    },
    {
        obligationId: "ANNEX_II_6_CONCLUSION",
        mdcgReference: "MDCG 2022-21 Annex II, Section 6",
        title: "Conclusion",
        description: "Benefit-risk conclusion",
        isMandatory: true,
        jurisdiction: "EU_MDR",
        psurSectionId: "SECTION_M_CONCLUSIONS",
        requiredTables: [],
        requiredEvidenceTypes: ["benefit_risk_assessment"],
        narrativeConstraints: [],
    },
];

export function getObligationById(id: ObligationId): ObligationDefinition | undefined {
    return MDCG_ANNEX_II_OBLIGATIONS.find(o => o.obligationId === id);
}
