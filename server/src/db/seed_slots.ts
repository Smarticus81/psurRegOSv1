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
    console.log("Loaded environment from .env");
} catch {
    console.log("No .env file found, using existing environment");
}

async function seedSlots() {
    // Dynamic imports after env is loaded
    const { db, pool } = await import("../../db.js");
    const schema = await import("@shared/schema");
    const { slotDefinitions, slotObligationLinks, CANONICAL_EVIDENCE_TYPES } = schema;

    console.log("[Slot Seed] Seeding Slot Catalog + Slot Obligation links...");

    // ─────────────────────────────────────────────────────────────
    // CANONICAL MDCG Annex I Slots
    // Slot IDs MUST match template JSON for seamless template-to-DB mapping
    // ─────────────────────────────────────────────────────────────
    console.log("  → Seeding MDCG 2022-21 Annex I slot definitions...");
    const slots = [
        // COVER & TOC
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "MDCG.ANNEXI.COVER",
            title: "PSUR Cover Page",
            description: "Administrative information including device identification, UDI-DI, manufacturer details.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: ["device_registry_record", "manufacturer_profile", "regulatory_certificate_record"],
            hardRequireEvidence: false, // Admin slot
            minAtoms: 0,
            sortOrder: 1,
        },
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "MDCG.ANNEXI.TOC",
            title: "Table of Contents",
            description: "Auto-generated table of contents.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: [], // No evidence required
            hardRequireEvidence: false,
            minAtoms: 0,
            sortOrder: 2,
        },
        // EXECUTIVE SUMMARY
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "MDCG.ANNEXI.EXEC_SUMMARY",
            title: "Executive Summary",
            description: "Overview of key findings including conclusions on benefit-risk profile.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: ["sales_summary", "complaint_summary", "serious_incident_summary"],
            hardRequireEvidence: false,
            minAtoms: 0,
            sortOrder: 3,
        },
        // SALES VOLUME & EXPOSURE
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "MDCG.ANNEXI.SALES_VOLUME_EXPOSURE",
            title: "Sales Volume & Population Exposure",
            description: "Sales volume, population exposure and usage frequency estimates.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: [CANONICAL_EVIDENCE_TYPES.SALES, "sales_summary", "distribution_summary"],
            hardRequireEvidence: true,
            minAtoms: 1,
            sortOrder: 10,
        },
        // COMPLAINTS
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "MDCG.ANNEXI.COMPLAINTS_SUMMARY",
            title: "Complaints & Non-Serious Incidents Summary",
            description: "Summary and analysis of complaints and non-serious incidents.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: [CANONICAL_EVIDENCE_TYPES.COMPLAINT, "complaint_summary"],
            hardRequireEvidence: true,
            minAtoms: 1,
            sortOrder: 20,
        },
        // SERIOUS INCIDENTS
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "MDCG.ANNEXI.SERIOUS_INCIDENTS_SUMMARY",
            title: "Serious Incidents Summary (IMDRF-coded)",
            description: "Summary of serious incidents including IMDRF coding, outcomes and trends.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: [CANONICAL_EVIDENCE_TYPES.SERIOUS_INCIDENT, "serious_incident_summary", "vigilance_report"],
            hardRequireEvidence: true,
            minAtoms: 1,
            sortOrder: 30,
        },
        // FSCA
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "MDCG.ANNEXI.FSCA_SUMMARY",
            title: "Field Safety Corrective Actions (FSCA)",
            description: "Summary of FSCAs/recalls, rationales, and effectiveness.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: [CANONICAL_EVIDENCE_TYPES.FSCA, "fsca_summary", "recall_record"],
            hardRequireEvidence: true,
            minAtoms: 1,
            sortOrder: 40,
        },
        // LITERATURE
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "MDCG.ANNEXI.LITERATURE_REVIEW",
            title: "Literature Review",
            description: "Systematic review of scientific literature relevant to the device.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: [CANONICAL_EVIDENCE_TYPES.LITERATURE, "literature_review_summary", "literature_search_strategy"],
            hardRequireEvidence: true,
            minAtoms: 1,
            sortOrder: 50,
        },
        // PMCF
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "MDCG.ANNEXI.PMCF_SUMMARY",
            title: "PMCF Results",
            description: "Summary of PMCF activities, results, and integration into CER/RMF.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: [CANONICAL_EVIDENCE_TYPES.PMCF, "pmcf_summary", "pmcf_report_extract"],
            hardRequireEvidence: true,
            minAtoms: 1,
            sortOrder: 60,
        },
        // TREND REPORTING
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "MDCG.ANNEXI.TREND_REPORTING",
            title: "Trend Reporting",
            description: "Statistically significant increases in incidents/complaints.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: ["trend_analysis", "signal_log", CANONICAL_EVIDENCE_TYPES.COMPLAINT, CANONICAL_EVIDENCE_TYPES.SALES],
            hardRequireEvidence: false,
            minAtoms: 0,
            sortOrder: 70,
        },
        // CONCLUSIONS
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION",
            title: "Conclusions & Benefit-Risk",
            description: "Overall conclusions including benefit-risk determination.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: ["benefit_risk_assessment", "rmf_extract"],
            hardRequireEvidence: false,
            minAtoms: 0,
            sortOrder: 80,
        },
    ];

    for (const slot of slots) {
        await db.insert(slotDefinitions).values(slot).onConflictDoNothing();
    }
    console.log(`    Slot definitions: ${slots.length}`);

    // ─────────────────────────────────────────────────────────────
    // Slot Obligation Links
    // Obligation IDs MUST exist in grkb_obligations
    // ─────────────────────────────────────────────────────────────
    console.log("  → Seeding Slot Obligation links...");
    const links = [
        // COVER
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.COVER", obligationId: "MDCG.2022-21.ANNEX_I.COVER", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.COVER", obligationId: "EU.MDR.ART86.1.ADMIN", mandatory: true },
        
        // TOC
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.TOC", obligationId: "MDCG.2022-21.ANNEX_I.COVER.TOC", mandatory: true },
        
        // EXEC SUMMARY
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.EXEC_SUMMARY", obligationId: "MDCG.2022-21.ANNEX_I.EXEC_SUMMARY", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.EXEC_SUMMARY", obligationId: "EU.MDR.ART86.1.CONCLUSIONS", mandatory: true },
        
        // SALES VOLUME
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.SALES_VOLUME_EXPOSURE", obligationId: "EU.MDR.ART86.1.SALES_POPULATION_USAGE", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.SALES_VOLUME_EXPOSURE", obligationId: "EU_MDR.PSUR.OBL.86_1", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.SALES_VOLUME_EXPOSURE", obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_C", mandatory: true },
        
        // COMPLAINTS
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.COMPLAINTS_SUMMARY", obligationId: "EU.MDR.ANNEX_III.COMPLAINTS_FEEDBACK", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.COMPLAINTS_SUMMARY", obligationId: "MDCG.2022-21.ANNEX_I.SAFETY.COMPLAINTS", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.COMPLAINTS_SUMMARY", obligationId: "EU_MDR.PSUR.OBL.86_1", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.COMPLAINTS_SUMMARY", obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_F", mandatory: true },
        
        // SERIOUS INCIDENTS
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.SERIOUS_INCIDENTS_SUMMARY", obligationId: "EU.MDR.ART86.1.SERIOUS_INCIDENTS", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.SERIOUS_INCIDENTS_SUMMARY", obligationId: "MDCG.2022-21.ANNEX_I.SAFETY.SERIOUS_INCIDENTS", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.SERIOUS_INCIDENTS_SUMMARY", obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_D", mandatory: true },
        
        // FSCA
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.FSCA_SUMMARY", obligationId: "EU.MDR.ART86.1.FSCA", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.FSCA_SUMMARY", obligationId: "MDCG.2022-21.ANNEX_I.FSCA", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.FSCA_SUMMARY", obligationId: "EU_MDR.PSUR.OBL.86_1a", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.FSCA_SUMMARY", obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_H", mandatory: true },
        
        // LITERATURE
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.LITERATURE_REVIEW", obligationId: "EU.MDR.ANNEX_III.LITERATURE_REVIEW", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.LITERATURE_REVIEW", obligationId: "MDCG_2022_21.PSUR.OBL.2_2", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.LITERATURE_REVIEW", obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_J", mandatory: true },
        
        // PMCF
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.PMCF_SUMMARY", obligationId: "EU.MDR.ART86.1.PMCF_MAIN_FINDINGS", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.PMCF_SUMMARY", obligationId: "EU.MDR.ANNEX_III.PMCF", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.PMCF_SUMMARY", obligationId: "MDCG_2022_21.PSUR.OBL.2_2", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.PMCF_SUMMARY", obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_L", mandatory: true },
        
        // TREND REPORTING
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.TREND_REPORTING", obligationId: "EU.MDR.ART88.TREND_REPORTING", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.TREND_REPORTING", obligationId: "EU.MDR.ANNEX_III.1.1.COMPLAINT_TRENDS", mandatory: true },
        
        // CONCLUSIONS
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION", obligationId: "EU.MDR.ART86.1.CONCLUSIONS", mandatory: true },
        { templateId: "MDCG_2022_21_ANNEX_I", slotId: "MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION", obligationId: "MDCG.2022-21.ANNEX_I.CONCLUSIONS", mandatory: true },
    ];

    for (const link of links) {
        await db.insert(slotObligationLinks).values(link).onConflictDoNothing();
    }
    console.log(`    Slot Obligation links: ${links.length}`);

    // ─────────────────────────────────────────────────────────────
    // COMPLETE
    // ─────────────────────────────────────────────────────────────
    console.log("\n[Slot Seed] Complete!");
    console.log(`   Slots: ${slots.length}`);
    console.log(`   Links: ${links.length}`);

    await pool.end();
}

seedSlots().catch((e) => {
    console.error("[Slot Seed] Failed:", e);
    process.exit(1);
});
