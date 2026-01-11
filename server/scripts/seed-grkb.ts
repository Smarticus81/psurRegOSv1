/**
 * GRKB Seed Script
 * 
 * Seeds the grkb_obligations table with mandatory PSUR obligations for EU_MDR and UK_MDR.
 * Run this script once to populate the GRKB before running workflows.
 * 
 * Usage: npx tsx server/scripts/seed-grkb.ts
 */

import { db } from "../db";
import { grkbObligations, type InsertGrkbObligation } from "@shared/schema";

// EU MDR PSUR Obligations based on MDCG 2022-21
const EU_MDR_OBLIGATIONS: InsertGrkbObligation[] = [
    {
        obligationId: "EU_MDR.PSUR.OBL.001",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Administrative Identification",
        text: "The PSUR shall include administrative identification of the device and the manufacturer, including UDI-DI and Basic UDI-DI.",
        sourceCitation: "MDCG 2022-21 Section A",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["manufacturer_master_data", "device_master_data"],
    },
    {
        obligationId: "EU_MDR.PSUR.OBL.002",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Executive Summary",
        text: "An executive summary shall provide a brief overview of the key findings from the PSUR, including conclusions on the benefit-risk profile.",
        sourceCitation: "MDCG 2022-21 Section B",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["psur_case_record"],
    },
    {
        obligationId: "EU_MDR.PSUR.OBL.003",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Estimated Population and Sales Volume",
        text: "The PSUR shall include an estimate of the population exposed to the device and the sales volume during the reporting period.",
        sourceCitation: "MDCG 2022-21 Section C",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["sales_volume", "population_estimate"],
    },
    {
        obligationId: "EU_MDR.PSUR.OBL.004",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Serious Incidents Summary",
        text: "A summary of serious incidents reported during the reporting period, including any incidents reported to competent authorities.",
        sourceCitation: "MDCG 2022-21 Section D, Article 87",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["incident_record", "incidents"],
    },
    {
        obligationId: "EU_MDR.PSUR.OBL.005",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Non-Serious Incidents and Trends",
        text: "Review of non-serious incidents and any statistically significant increase in the frequency or severity of incidents.",
        sourceCitation: "MDCG 2022-21 Section E",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["incident_record"],
    },
    {
        obligationId: "EU_MDR.PSUR.OBL.006",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Complaints Analysis",
        text: "Summary and analysis of customer complaints related to the device during the reporting period.",
        sourceCitation: "MDCG 2022-21 Section F",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["complaint_record", "complaints"],
    },
    {
        obligationId: "EU_MDR.PSUR.OBL.007",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Trending Analysis",
        text: "Analysis of incident and complaint trends, including comparison with previous reporting periods.",
        sourceCitation: "MDCG 2022-21 Section G",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["incident_record", "complaint_record", "exposure_model"],
    },
    {
        obligationId: "EU_MDR.PSUR.OBL.008",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Field Safety Corrective Actions",
        text: "Summary of any field safety corrective actions (FSCAs) initiated during the reporting period.",
        sourceCitation: "MDCG 2022-21 Section H, Article 82",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["fsca"],
    },
    {
        obligationId: "EU_MDR.PSUR.OBL.009",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "CAPA Review",
        text: "Status update on corrective and preventive actions related to the device.",
        sourceCitation: "MDCG 2022-21 Section I",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["capa"],
    },
    {
        obligationId: "EU_MDR.PSUR.OBL.010",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Literature Review",
        text: "Systematic review of scientific and clinical literature relevant to the device.",
        sourceCitation: "MDCG 2022-21 Section J",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["literature"],
    },
    {
        obligationId: "EU_MDR.PSUR.OBL.011",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Registry and Database Review",
        text: "Review of data from relevant registries and databases.",
        sourceCitation: "MDCG 2022-21 Section K",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["registry"],
    },
    {
        obligationId: "EU_MDR.PSUR.OBL.012",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "PMCF Results",
        text: "Summary of post-market clinical follow-up (PMCF) activities and results.",
        sourceCitation: "MDCG 2022-21 Section L, Article 61",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["pmcf"],
    },
    {
        obligationId: "EU_MDR.PSUR.OBL.013",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Conclusions and Benefit-Risk",
        text: "Overall conclusions including the benefit-risk determination and any required updates to documentation.",
        sourceCitation: "MDCG 2022-21 Section M, Article 2(24)",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: [],
    },
];

// UK MDR PSUR Obligations
const UK_MDR_OBLIGATIONS: InsertGrkbObligation[] = [
    {
        obligationId: "UK_MDR.PSUR.OBL.001",
        jurisdiction: "UK_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Administrative Identification (UK)",
        text: "The PSUR shall include administrative identification of the device and the manufacturer under UK MDR requirements.",
        sourceCitation: "UK MDR 2002 Schedule 3",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["manufacturer_master_data", "device_master_data"],
    },
    {
        obligationId: "UK_MDR.PSUR.OBL.002",
        jurisdiction: "UK_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "UK Market Exposure",
        text: "Estimated UK population exposed to the device and UK sales volume during the reporting period.",
        sourceCitation: "UK MDR 2002",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["sales_volume", "population_estimate"],
    },
    {
        obligationId: "UK_MDR.PSUR.OBL.003",
        jurisdiction: "UK_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "UK Vigilance Report",
        text: "Summary of all adverse incidents reported to MHRA during the reporting period.",
        sourceCitation: "UK MDR 2002 Regulation 46",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["incident_record", "incidents"],
    },
    {
        obligationId: "UK_MDR.PSUR.OBL.004",
        jurisdiction: "UK_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "UK Complaints Summary",
        text: "Summary of complaints received from UK customers and healthcare providers.",
        sourceCitation: "UK MDR 2002",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["complaint_record", "complaints"],
    },
    {
        obligationId: "UK_MDR.PSUR.OBL.005",
        jurisdiction: "UK_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "UK FSN Summary",
        text: "Summary of any Field Safety Notices issued in the UK.",
        sourceCitation: "UK MDR 2002 Regulation 47",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["fsca"],
    },
    {
        obligationId: "UK_MDR.PSUR.OBL.006",
        jurisdiction: "UK_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "UK Benefit-Risk Conclusion",
        text: "Conclusions specific to the UK market including benefit-risk assessment.",
        sourceCitation: "UK MDR 2002",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: [],
    },
];

// GRKB Constraints (non-mandatory but enforced)
const CONSTRAINTS: InsertGrkbObligation[] = [
    {
        obligationId: "EU_MDR.PSUR.CON.001",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "constraint",
        title: "Period Coverage",
        text: "All evidence must fall within the PSUR reporting period. Out-of-period evidence must be flagged.",
        sourceCitation: "MDCG 2022-21 Section 2.1",
        version: "1.0.0",
        mandatory: false,
        requiredEvidenceTypes: [],
    },
    {
        obligationId: "EU_MDR.PSUR.CON.002",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "constraint",
        title: "Evidence Traceability",
        text: "All claims must be traceable to source evidence atoms with full provenance.",
        sourceCitation: "MDR Article 10(9)",
        version: "1.0.0",
        mandatory: false,
        requiredEvidenceTypes: [],
    },
    {
        obligationId: "UK_MDR.PSUR.CON.001",
        jurisdiction: "UK_MDR",
        artifactType: "PSUR",
        kind: "constraint",
        title: "MHRA Format Compliance",
        text: "PSUR format must comply with MHRA guidance for UK submissions.",
        sourceCitation: "MHRA Guidance 2023",
        version: "1.0.0",
        mandatory: false,
        requiredEvidenceTypes: [],
    },
];

async function seedGrkb() {
    console.log("[GRKB Seed] Starting GRKB seed...");

    const allEntries = [...EU_MDR_OBLIGATIONS, ...UK_MDR_OBLIGATIONS, ...CONSTRAINTS];

    console.log(`[GRKB Seed] Inserting ${allEntries.length} entries...`);
    console.log(`  - EU_MDR obligations: ${EU_MDR_OBLIGATIONS.length}`);
    console.log(`  - UK_MDR obligations: ${UK_MDR_OBLIGATIONS.length}`);
    console.log(`  - Constraints: ${CONSTRAINTS.length}`);

    try {
        // Clear existing entries first (optional - comment out to append)
        // await db.delete(grkbObligations);

        // Insert all entries
        for (const entry of allEntries) {
            await db.insert(grkbObligations).values(entry).onConflictDoNothing();
        }

        console.log("[GRKB Seed] Seed completed successfully!");

        // Log summary
        const allObligations = await db.select().from(grkbObligations);
        const euCount = allObligations.filter(o => o.jurisdiction === "EU_MDR" && o.kind === "obligation").length;
        const ukCount = allObligations.filter(o => o.jurisdiction === "UK_MDR" && o.kind === "obligation").length;
        const constraintCount = allObligations.filter(o => o.kind === "constraint").length;

        console.log(`[GRKB Seed] Final counts:`);
        console.log(`  - EU_MDR obligations: ${euCount}`);
        console.log(`  - UK_MDR obligations: ${ukCount}`);
        console.log(`  - Constraints: ${constraintCount}`);
        console.log(`  - Total: ${allObligations.length}`);

    } catch (error) {
        console.error("[GRKB Seed] Error:", error);
        throw error;
    }
}

// Run if executed directly
seedGrkb().then(() => {
    console.log("[GRKB Seed] Done.");
    process.exit(0);
}).catch((err) => {
    console.error("[GRKB Seed] Fatal error:", err);
    process.exit(1);
});
