/**
 * GRKB Seed Script
 * 
 * Seeds the grkb_obligations table with mandatory PSUR obligations for EU_MDR and UK_MDR.
 * Obligation IDs MUST match those referenced in template mapping files.
 * 
 * Run this script once to populate the GRKB before running workflows.
 * 
 * Usage: npx tsx server/scripts/seed-grkb.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD ENVIRONMENT FIRST
// ═══════════════════════════════════════════════════════════════════════════════
const envPath = resolve(process.cwd(), ".env");
try {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join("=").trim();
        }
    }
    console.log("📦 Loaded environment from .env");
} catch {
    console.log("⚠️  No .env file found, using existing environment");
}

import { grkbObligations, type InsertGrkbObligation } from "@shared/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// EU MDR PSUR Obligations - Per MDCG 2022-21 and MDR Article 86
// Obligation IDs match template mapping in MDCG_2022_21_ANNEX_I.json
// ═══════════════════════════════════════════════════════════════════════════════
const EU_MDR_OBLIGATIONS: InsertGrkbObligation[] = [
    // === COVER / ADMIN ===
    {
        obligationId: "MDCG.2022-21.ANNEX_I.COVER",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "PSUR Cover Page",
        text: "Administrative information including device identification, UDI-DI, manufacturer details, and reporting period.",
        sourceCitation: "MDCG 2022-21 Annex I Cover",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["device_registry_record", "manufacturer_profile"],
    },
    {
        obligationId: "EU.MDR.ART86.1.ADMIN",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Administrative Identification per Article 86(1)",
        text: "The PSUR shall include administrative identification of the device and the manufacturer.",
        sourceCitation: "EU MDR Article 86(1)",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["manufacturer_master_data", "device_master_data"],
    },
    {
        obligationId: "MDCG.2022-21.ANNEX_I.COVER.TOC",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Table of Contents",
        text: "PSUR shall include a structured table of contents.",
        sourceCitation: "MDCG 2022-21 Annex I",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: [],
    },

    // === EXECUTIVE SUMMARY ===
    {
        obligationId: "MDCG.2022-21.ANNEX_I.EXEC_SUMMARY",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Executive Summary",
        text: "An executive summary providing overview of key findings including conclusions on benefit-risk profile.",
        sourceCitation: "MDCG 2022-21 Annex I Executive Summary",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["psur_case_record"],
    },
    {
        obligationId: "EU.MDR.ART86.1.CONCLUSIONS",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Conclusions per Article 86(1)",
        text: "Overall conclusions including benefit-risk determination per Article 86(1).",
        sourceCitation: "EU MDR Article 86(1)",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: [],
    },

    // === DEVICE DESCRIPTION ===
    {
        obligationId: "MDCG.2022-21.ANNEX_I.DEVICE_DESCRIPTION",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Device Description and Intended Purpose",
        text: "Description of devices covered by PSUR including scope and intended purpose.",
        sourceCitation: "MDCG 2022-21 Annex I Section A",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["device_registry_record", "ifu_extract"],
    },
    {
        obligationId: "EU.MDR.ART86.1.DEVICES_INTENDED_USE",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Devices and Intended Use per Article 86(1)",
        text: "The PSUR shall cover all devices included in the scope and their intended purpose.",
        sourceCitation: "EU MDR Article 86(1)",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["device_registry_record"],
    },
    {
        obligationId: "MDCG.2022-21.ANNEX_I.SCOPE_CHANGES",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Changes to Scope",
        text: "Changes to scope vs previous PSUR including added/removed devices.",
        sourceCitation: "MDCG 2022-21 Annex I",
        version: "1.0.0",
        mandatory: false,
        requiredEvidenceTypes: ["change_control_record", "previous_psur_extract"],
    },

    // === PMS ACTIVITIES ===
    {
        obligationId: "EU.MDR.ART83.PMS_SYSTEM",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "PMS System per Article 83",
        text: "Overview of post-market surveillance activities performed during the reporting period.",
        sourceCitation: "EU MDR Article 83",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["pms_plan_extract", "pms_activity_log"],
    },
    {
        obligationId: "EU.MDR.ANNEX_III.PMS_PLAN_SUMMARY",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "PMS Plan Summary per Annex III",
        text: "Summary of PMS plan implementation and activities.",
        sourceCitation: "EU MDR Annex III",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["pms_plan_extract"],
    },

    // === SALES VOLUME & EXPOSURE ===
    {
        obligationId: "EU.MDR.ART86.1.SALES_POPULATION_USAGE",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Sales Volume and Population Exposure per Article 86(1)",
        text: "Sales volume, population exposure and usage frequency estimates.",
        sourceCitation: "EU MDR Article 86(1)",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["sales_volume", "sales_summary", "distribution_summary"],
    },

    // === SERIOUS INCIDENTS ===
    {
        obligationId: "EU.MDR.ART86.1.SERIOUS_INCIDENTS",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Serious Incidents per Article 86(1)",
        text: "Summary of serious incidents including counts, severity, outcomes, and IMDRF coding.",
        sourceCitation: "EU MDR Article 86(1), Article 87",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["serious_incident_record", "serious_incident_summary", "vigilance_report"],
    },
    {
        obligationId: "MDCG.2022-21.ANNEX_I.SAFETY.SERIOUS_INCIDENTS",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Serious Incidents Summary per MDCG 2022-21",
        text: "Detailed summary of serious incidents per MDCG 2022-21 Annex I requirements.",
        sourceCitation: "MDCG 2022-21 Annex I Section D",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["serious_incident_record"],
    },

    // === COMPLAINTS ===
    {
        obligationId: "EU.MDR.ANNEX_III.COMPLAINTS_FEEDBACK",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Complaints and Feedback per Annex III",
        text: "Summary and analysis of complaints and non-serious incidents.",
        sourceCitation: "EU MDR Annex III",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["complaint_record", "complaint_summary"],
    },
    {
        obligationId: "MDCG.2022-21.ANNEX_I.SAFETY.COMPLAINTS",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Complaints Analysis per MDCG 2022-21",
        text: "Analysis of complaints including categorization by region and seriousness.",
        sourceCitation: "MDCG 2022-21 Annex I Section F",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["complaint_record"],
    },
    {
        obligationId: "EU.MDR.ANNEX_III.1.1.COMPLAINT_TRENDS",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Complaint Trends per Annex III",
        text: "Analysis of complaint trends including rates and statistical analysis.",
        sourceCitation: "EU MDR Annex III Section 1.1",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["complaint_record", "sales_volume"],
    },

    // === TREND REPORTING ===
    {
        obligationId: "EU.MDR.ART88.TREND_REPORTING",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Trend Reporting per Article 88",
        text: "Statistically significant increases in incidents/complaints must be reported as trends.",
        sourceCitation: "EU MDR Article 88",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["trend_analysis", "signal_log"],
    },

    // === FSCA ===
    {
        obligationId: "EU.MDR.ART86.1.FSCA",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "FSCA per Article 86(1)",
        text: "Summary of Field Safety Corrective Actions opened/closed, scope, and effectiveness.",
        sourceCitation: "EU MDR Article 86(1), Article 82",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["fsca_record", "fsca_summary", "recall_record"],
    },
    {
        obligationId: "MDCG.2022-21.ANNEX_I.FSCA",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "FSCA per MDCG 2022-21",
        text: "Detailed FSCA information per MDCG 2022-21 requirements.",
        sourceCitation: "MDCG 2022-21 Annex I Section H",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["fsca_record"],
    },

    // === CAPA ===
    {
        obligationId: "EU.MDR.ANNEX_III.CORRECTIVE_PREVENTIVE_ACTIONS",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Corrective and Preventive Actions",
        text: "Summary and status of CAPA linked to PMS findings.",
        sourceCitation: "EU MDR Annex III",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["capa_record", "capa_summary", "ncr_record"],
    },

    // === LITERATURE ===
    {
        obligationId: "EU.MDR.ANNEX_III.LITERATURE_REVIEW",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Literature Review per Annex III",
        text: "Systematic review of scientific literature relevant to the device.",
        sourceCitation: "EU MDR Annex III",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["literature_result", "literature_review_summary", "literature_search_strategy"],
    },

    // === EXTERNAL DATABASES ===
    {
        obligationId: "EU.MDR.ANNEX_III.EXTERNAL_DATABASES",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "External Database Review per Annex III",
        text: "Review of external databases/registries including MAUDE, MHRA, TGA.",
        sourceCitation: "EU MDR Annex III",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["external_db_summary", "external_db_query_log"],
    },

    // === PMCF ===
    {
        obligationId: "EU.MDR.ART86.1.PMCF_MAIN_FINDINGS",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "PMCF Main Findings per Article 86(1)",
        text: "Summary of PMCF activities, results, and integration into CER/RMF.",
        sourceCitation: "EU MDR Article 86(1), Article 61",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["pmcf_result", "pmcf_summary", "pmcf_report_extract"],
    },
    {
        obligationId: "EU.MDR.ANNEX_III.PMCF",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "PMCF per Annex III",
        text: "Post-market clinical follow-up activities and findings.",
        sourceCitation: "EU MDR Annex III",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["pmcf_result"],
    },

    // === CONCLUSIONS ===
    {
        obligationId: "MDCG.2022-21.ANNEX_I.CONCLUSIONS",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Conclusions per MDCG 2022-21",
        text: "Overall conclusions including benefit-risk determination and acceptability changes.",
        sourceCitation: "MDCG 2022-21 Annex I Section M",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["benefit_risk_assessment", "rmf_extract"],
    },
    {
        obligationId: "EU.MDR.ANNEX_III.ACTIONS_TAKEN",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Actions Taken",
        text: "Preventive/corrective actions, labeling changes, RMF/CER updates.",
        sourceCitation: "EU MDR Annex III",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["change_control_record", "capa_summary"],
    },

    // === Legacy obligations for slot seed compatibility ===
    {
        obligationId: "EU_MDR.PSUR.OBL.86_1",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Article 86(1) Core Requirements",
        text: "Core PSUR requirements per Article 86(1) including sales, incidents, conclusions.",
        sourceCitation: "EU MDR Article 86(1)",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["sales_volume", "serious_incident_record", "complaint_record"],
    },
    {
        obligationId: "EU_MDR.PSUR.OBL.86_1a",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "Article 86(1)(a) FSCA",
        text: "FSCA reporting requirements per Article 86(1)(a).",
        sourceCitation: "EU MDR Article 86(1)(a)",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["fsca_record"],
    },
    {
        obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_C",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "MDCG 2022-21 Section C: Sales & Exposure",
        text: "Sales volume and population exposure per MDCG 2022-21 Section C.",
        sourceCitation: "MDCG 2022-21 Section C",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["sales_volume"],
    },
    {
        obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_D",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "MDCG 2022-21 Section D: Serious Incidents",
        text: "Serious incidents per MDCG 2022-21 Section D.",
        sourceCitation: "MDCG 2022-21 Section D",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["serious_incident_record"],
    },
    {
        obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_F",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "MDCG 2022-21 Section F: Complaints",
        text: "Complaints analysis per MDCG 2022-21 Section F.",
        sourceCitation: "MDCG 2022-21 Section F",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["complaint_record"],
    },
    {
        obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_H",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "MDCG 2022-21 Section H: FSCA",
        text: "FSCA per MDCG 2022-21 Section H.",
        sourceCitation: "MDCG 2022-21 Section H",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["fsca_record"],
    },
    {
        obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_J",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "MDCG 2022-21 Section J: Literature",
        text: "Literature review per MDCG 2022-21 Section J.",
        sourceCitation: "MDCG 2022-21 Section J",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["literature_result"],
    },
    {
        obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_L",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "MDCG 2022-21 Section L: PMCF",
        text: "PMCF per MDCG 2022-21 Section L.",
        sourceCitation: "MDCG 2022-21 Section L",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["pmcf_result"],
    },
    {
        obligationId: "MDCG_2022_21.PSUR.OBL.2_2",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "MDCG 2022-21 Section 2.2: Data Sources",
        text: "Identification of data sources per MDCG 2022-21 Section 2.2.",
        sourceCitation: "MDCG 2022-21 Section 2.2",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: [],
    },
];

// ═══════════════════════════════════════════════════════════════════════════════
// UK MDR PSUR Obligations
// ═══════════════════════════════════════════════════════════════════════════════
const UK_MDR_OBLIGATIONS: InsertGrkbObligation[] = [
    {
        obligationId: "UK.MDR.PMS.PSUR.ADMIN",
        jurisdiction: "UK_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "UK PSUR Administrative Identification",
        text: "Administrative identification under UK MDR requirements.",
        sourceCitation: "UK MDR 2002 Schedule 3",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["manufacturer_master_data", "device_master_data"],
    },
    {
        obligationId: "UK.MDR.PMS.PSUR.SAFETY.COMPLAINTS",
        jurisdiction: "UK_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "UK Complaints Summary",
        text: "Summary of complaints from UK customers and healthcare providers.",
        sourceCitation: "UK MDR 2002",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["complaint_record"],
    },
    {
        obligationId: "UK_MDR.PSUR.OBL.002",
        jurisdiction: "UK_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "UK Market Exposure",
        text: "Estimated UK population exposure and sales volume.",
        sourceCitation: "UK MDR 2002",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["sales_volume"],
    },
    {
        obligationId: "UK_MDR.PSUR.OBL.003",
        jurisdiction: "UK_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "UK Vigilance Report",
        text: "Summary of adverse incidents reported to MHRA.",
        sourceCitation: "UK MDR 2002 Regulation 46",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["serious_incident_record"],
    },
    {
        obligationId: "UK_MDR.PSUR.OBL.005",
        jurisdiction: "UK_MDR",
        artifactType: "PSUR",
        kind: "obligation",
        title: "UK FSN Summary",
        text: "Summary of Field Safety Notices issued in the UK.",
        sourceCitation: "UK MDR 2002 Regulation 47",
        version: "1.0.0",
        mandatory: true,
        requiredEvidenceTypes: ["fsca_record"],
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

// ═══════════════════════════════════════════════════════════════════════════════
// GRKB Constraints (non-mandatory but enforced)
// ═══════════════════════════════════════════════════════════════════════════════
const CONSTRAINTS: InsertGrkbObligation[] = [
    {
        obligationId: "EU_MDR.PSUR.CON.001",
        jurisdiction: "EU_MDR",
        artifactType: "PSUR",
        kind: "constraint",
        title: "Period Coverage",
        text: "All evidence must fall within the PSUR reporting period.",
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
    // Dynamic import to use db after env vars set
    const { db, pool } = await import("../db");

    console.log("[GRKB Seed] Starting GRKB seed...");

    const allEntries = [...EU_MDR_OBLIGATIONS, ...UK_MDR_OBLIGATIONS, ...CONSTRAINTS];

    console.log(`[GRKB Seed] Inserting ${allEntries.length} entries...`);
    console.log(`  - EU_MDR obligations: ${EU_MDR_OBLIGATIONS.length}`);
    console.log(`  - UK_MDR obligations: ${UK_MDR_OBLIGATIONS.length}`);
    console.log(`  - Constraints: ${CONSTRAINTS.length}`);

    try {
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

        await pool.end();

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
