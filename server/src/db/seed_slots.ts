import { readFileSync } from "fs";
import { resolve } from "path";

// ═══════════════════════════════════════════════════════════════════════════
// LOAD ENVIRONMENT FIRST
// ═══════════════════════════════════════════════════════════════════════════
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

async function seedSlots() {
    // Dynamic imports after env is loaded
    const { db, pool } = await import("../../db.js");
    const schema = await import("@shared/schema");
    const { slotDefinitions, slotObligationLinks, CANONICAL_EVIDENCE_TYPES } = schema;

    console.log("🌱 Seeding Slot Catalog + Slot↔Obligation links...");

    // ─────────────────────────────────────────────────────────────
    // CANONICAL MDCG Annex I Slots (minimal set to enforce real evidence gates)
    // These are the "hard gate" slots that stop fake coverage.
    // ─────────────────────────────────────────────────────────────
    console.log("  → Seeding MDCG 2022-21 Annex I slot definitions...");
    const slots = [
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_SALES_VOLUME",
            title: "Sales volume & population exposure",
            description: "Summarize sales volume and estimate population exposed for the reporting period.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: [CANONICAL_EVIDENCE_TYPES.SALES],
            hardRequireEvidence: true,
            minAtoms: 1,
            sortOrder: 10,
        },
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_COMPLAINT_SUMMARY",
            title: "Complaints & non-serious incidents summary",
            description: "Summarize complaint trends and non-serious incident signals for the reporting period.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: [CANONICAL_EVIDENCE_TYPES.COMPLAINT],
            hardRequireEvidence: true,
            minAtoms: 1,
            sortOrder: 20,
        },
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_SERIOUS_INCIDENTS",
            title: "Serious incidents summary (IMDRF-coded)",
            description: "Summarize serious incidents, IMDRF coding, outcomes and trend signals.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: [CANONICAL_EVIDENCE_TYPES.SERIOUS_INCIDENT],
            hardRequireEvidence: true,
            minAtoms: 1,
            sortOrder: 30,
        },
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_FSCA",
            title: "Field Safety Corrective Actions (FSCA)",
            description: "List and summarize FSCAs/recalls, rationales, and effectiveness checks.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: [CANONICAL_EVIDENCE_TYPES.FSCA],
            hardRequireEvidence: true,
            minAtoms: 1,
            sortOrder: 40,
        },
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_LITERATURE",
            title: "Literature review",
            description: "Summarize literature findings and relevance to risk/benefit and known hazards.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: [CANONICAL_EVIDENCE_TYPES.LITERATURE],
            hardRequireEvidence: true,
            minAtoms: 1,
            sortOrder: 50,
        },
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_PMCF",
            title: "PMCF results",
            description: "Summarize PMCF findings, signals, and impact on risk/benefit.",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            requiredEvidenceTypes: [CANONICAL_EVIDENCE_TYPES.PMCF],
            hardRequireEvidence: true,
            minAtoms: 1,
            sortOrder: 60,
        },
    ];

    for (const slot of slots) {
        await db.insert(slotDefinitions).values(slot).onConflictDoNothing();
    }
    console.log(`    ✓ Slot definitions: ${slots.length}`);

    // ─────────────────────────────────────────────────────────────
    // Slot↔Obligation Links (tie seeded GRKB obligations to slots)
    // These obligationIds MUST exist in grkb_obligations.
    // ─────────────────────────────────────────────────────────────
    console.log("  → Seeding Slot↔Obligation links...");
    const links = [
        // Sales Volume slot → EU MDR Article 86(1) and MDCG 2022-21 Section C
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_SALES_VOLUME",
            obligationId: "EU_MDR.PSUR.OBL.86_1",
            mandatory: true,
        },
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_SALES_VOLUME",
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_C",
            mandatory: true,
        },
        // Complaint Summary slot → EU MDR Article 86(1) and MDCG 2022-21 Section F
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_COMPLAINT_SUMMARY",
            obligationId: "EU_MDR.PSUR.OBL.86_1",
            mandatory: true,
        },
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_COMPLAINT_SUMMARY",
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_F",
            mandatory: true,
        },
        // Serious Incidents slot → MDCG 2022-21 Section D
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_SERIOUS_INCIDENTS",
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_D",
            mandatory: true,
        },
        // FSCA slot → EU MDR Article 86(1) and MDCG 2022-21 Section H
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_FSCA",
            obligationId: "EU_MDR.PSUR.OBL.86_1a",
            mandatory: true,
        },
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_FSCA",
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_H",
            mandatory: true,
        },
        // Literature slot → MDCG 2022-21 Section 2.2 and Section J
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_LITERATURE",
            obligationId: "MDCG_2022_21.PSUR.OBL.2_2",
            mandatory: true,
        },
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_LITERATURE",
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_J",
            mandatory: true,
        },
        // PMCF slot → MDCG 2022-21 Section 2.2 and Section L
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_PMCF",
            obligationId: "MDCG_2022_21.PSUR.OBL.2_2",
            mandatory: true,
        },
        {
            templateId: "MDCG_2022_21_ANNEX_I",
            slotId: "ANNEXI_PMCF",
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_L",
            mandatory: true,
        },
    ];

    for (const link of links) {
        await db.insert(slotObligationLinks).values(link).onConflictDoNothing();
    }
    console.log(`    ✓ Slot↔Obligation links: ${links.length}`);

    // ─────────────────────────────────────────────────────────────
    // COMPLETE
    // ─────────────────────────────────────────────────────────────
    console.log("\n✅ Slot Catalog seed complete!");
    console.log(`   📋 Total slots: ${slots.length}`);
    console.log(`   🔗 Total obligation links: ${links.length}`);

    await pool.end();
}

seedSlots().catch((e) => {
    console.error("❌ Slot seed failed:", e);
    process.exit(1);
});
