import { readFileSync } from "fs";
import { resolve } from "path";

// ═══════════════════════════════════════════════════════════════════════════
// LOAD ENVIRONMENT FIRST (before any other imports that might need DATABASE_URL)
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

// ═══════════════════════════════════════════════════════════════════════════
// NOW IMPORT DATABASE (after env is loaded)
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
    // Dynamic imports to ensure env is loaded first
    const { db, pool } = await import("../../db.js");
    const schema = await import("@shared/schema");
    const { grkbEntries, grkbObligations, companies, devices, users } = schema;

    console.log("🌱 Seeding RegulatoryOS database...");

    // ─────────────────────────────────────────────
    // 1. SYSTEM USER (deterministic)
    // ─────────────────────────────────────────────
    console.log("  → Creating system user...");
    const [systemUser] = await db
        .insert(users)
        .values({
            id: "system",
            username: "system",
            password: "SYSTEM_ACCOUNT_NO_LOGIN"
        })
        .onConflictDoNothing()
        .returning();
    console.log(`    ✓ System user: ${systemUser?.id ?? "already exists"}`);

    // ─────────────────────────────────────────────
    // 2. DEFAULT COMPANY
    // ─────────────────────────────────────────────
    console.log("  → Creating default company...");
    const [company] = await db
        .insert(companies)
        .values({
            name: "Default Manufacturer",
            description: "System default manufacturer for initial setup",
            jurisdictions: ["EU_MDR", "UK_MDR"]
        })
        .onConflictDoNothing()
        .returning();

    const companyId = company?.id ?? 1;
    console.log(`    ✓ Company ID: ${companyId}`);

    // ─────────────────────────────────────────────
    // 3. SAMPLE DEVICE (can be modified or deleted)
    // ─────────────────────────────────────────────
    console.log("  → Creating sample device...");
    const [device] = await db
        .insert(devices)
        .values({
            companyId: companyId,
            deviceName: "Sample Medical Device",
            deviceCode: "SAMPLE-001",
            riskClass: "Class IIa",
            jurisdictions: ["EU_MDR", "UK_MDR"],
            gmdnCode: "00000",
            imdrfClassification: "general-medical"
        })
        .onConflictDoNothing()
        .returning();
    console.log(`    ✓ Device: ${device?.deviceName ?? "already exists"} (sample - edit or delete in Admin > Device Registry)`);

    // ─────────────────────────────────────────────
    // 4. GRKB OBLIGATIONS – EU MDR PSUR (Article 86)
    // ─────────────────────────────────────────────
    console.log("  → Seeding EU MDR PSUR obligations...");
    const euMdrObligations = [
        {
            obligationId: "EU_MDR.PSUR.OBL.86_1",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "PSUR Content and Update Frequency",
            text: "Manufacturers of class IIa, class IIb and class III devices shall prepare a periodic safety update report (PSUR) for each device and where relevant for each category or group of devices summarising the results and conclusions of the analyses of the post-market surveillance data gathered as a result of the post-market surveillance plan.",
            sourceCitation: "EU MDR Article 86(1)",
            mandatory: true,
            requiredEvidenceTypes: ["sales_volume", "complaints", "incidents"]
        },
        {
            obligationId: "EU_MDR.PSUR.OBL.86_1a",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "PSUR Benefit-Risk Ratio and PMCF",
            text: "The PSUR shall include a rationale and description of any preventive and corrective actions taken, together with an overall conclusions regarding the benefit-risk determination including PMCF data where available.",
            sourceCitation: "EU MDR Article 86(1)",
            mandatory: true,
            requiredEvidenceTypes: ["pmcf", "capa", "fsca"]
        },
        {
            obligationId: "EU_MDR.PSUR.OBL.86_2a",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "Class IIa PSUR Frequency",
            text: "For class IIa devices, the PSUR shall be updated when necessary and at least every two years.",
            sourceCitation: "EU MDR Article 86(2)(a)",
            mandatory: true,
            requiredEvidenceTypes: []
        },
        {
            obligationId: "EU_MDR.PSUR.OBL.86_2b",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "Class IIb/III PSUR Frequency",
            text: "For class IIb and class III devices, the PSUR shall be updated at least annually.",
            sourceCitation: "EU MDR Article 86(2)(b)",
            mandatory: true,
            requiredEvidenceTypes: []
        },
        {
            obligationId: "EU_MDR.PSUR.OBL.83",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "Post-market Surveillance System",
            text: "Manufacturers shall plan, establish, document, implement, maintain and update a post-market surveillance system in a manner that is proportionate to the risk class and appropriate for the type of device.",
            sourceCitation: "EU MDR Article 83",
            mandatory: true,
            requiredEvidenceTypes: ["complaints", "incidents", "literature"]
        }
    ];

    for (const obl of euMdrObligations) {
        await db.insert(grkbObligations).values(obl).onConflictDoNothing();
    }
    console.log(`    ✓ EU MDR obligations: ${euMdrObligations.length}`);

    // ─────────────────────────────────────────────
    // 5. GRKB OBLIGATIONS – MDCG 2022-21 (FULL)
    // ─────────────────────────────────────────────
    console.log("  → Seeding MDCG 2022-21 obligations...");
    const mdcgObligations = [
        // Section 2 - General Requirements
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.2_1",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "PSUR Purpose and Scope",
            text: "The PSUR should provide an update on the safety and performance of the device based on post-market surveillance data collected since the last report.",
            sourceCitation: "MDCG 2022-21 Section 2.1",
            mandatory: true,
            requiredEvidenceTypes: []
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.2_2",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "PSUR Structure and Minimum Datasets",
            text: "The PSUR shall follow the structure outlined in Annex I and include all mandatory data elements including device identification, sales data, complaint analysis, incident reporting, and PMCF results.",
            sourceCitation: "MDCG 2022-21 Section 2.2",
            mandatory: true,
            requiredEvidenceTypes: ["sales_volume", "complaints", "incidents", "pmcf"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.2_3",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "Trend Reporting and Statistical Analysis",
            text: "Trends in complaints and incidents shall be identified and reported. Statistical methods should be used where appropriate to identify significant increases in complaint rates or incident frequencies.",
            sourceCitation: "MDCG 2022-21 Section 2.3",
            mandatory: true,
            requiredEvidenceTypes: ["complaints", "incidents"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.2_4",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "Conclusions and Actions",
            text: "The PSUR shall include conclusions on the overall benefit-risk determination and describe any preventive or corrective actions taken or planned.",
            sourceCitation: "MDCG 2022-21 Section 2.4",
            mandatory: true,
            requiredEvidenceTypes: ["capa", "fsca"]
        },
        // Section 3 - Device Identification
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.3_1",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "Device Identification Data",
            text: "The PSUR shall include complete device identification including UDI-DI, trade name, model/catalogue numbers, intended purpose, device classification, and notified body information.",
            sourceCitation: "MDCG 2022-21 Section 3.1",
            mandatory: true,
            requiredEvidenceTypes: ["device_master_data"]
        },
        // Annex I - Template Content
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_A",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            templateId: "MDCG_2022_21_ANNEX_I",
            kind: "obligation",
            title: "Section A - Device Identification",
            text: "Complete device identification including manufacturer details, legal representative, UDI-DI, trade name(s), and device classification.",
            sourceCitation: "MDCG 2022-21 Annex I Section A",
            mandatory: true,
            requiredEvidenceTypes: ["manufacturer_master_data", "device_master_data"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_B",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            templateId: "MDCG_2022_21_ANNEX_I",
            kind: "obligation",
            title: "Section B - Reporting Period",
            text: "Clear specification of the reporting period covered by the PSUR.",
            sourceCitation: "MDCG 2022-21 Annex I Section B",
            mandatory: true,
            requiredEvidenceTypes: ["psur_case_record"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_C",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            templateId: "MDCG_2022_21_ANNEX_I",
            kind: "obligation",
            title: "Section C - Sales Volume and Population",
            text: "Sales data, number of devices placed on the market, and estimated patient/user population during the reporting period.",
            sourceCitation: "MDCG 2022-21 Annex I Section C",
            mandatory: true,
            requiredEvidenceTypes: ["sales_volume", "population_estimate", "exposure_model"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_D",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            templateId: "MDCG_2022_21_ANNEX_I",
            kind: "obligation",
            title: "Section D - Serious Incidents",
            text: "Summary and analysis of serious incidents reported during the period, including trending analysis.",
            sourceCitation: "MDCG 2022-21 Annex I Section D",
            mandatory: true,
            requiredEvidenceTypes: ["incidents"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_E",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            templateId: "MDCG_2022_21_ANNEX_I",
            kind: "obligation",
            title: "Section E - Non-Serious Incidents",
            text: "Summary of non-serious incidents and trend analysis.",
            sourceCitation: "MDCG 2022-21 Annex I Section E",
            mandatory: true,
            requiredEvidenceTypes: ["incidents"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_F",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            templateId: "MDCG_2022_21_ANNEX_I",
            kind: "obligation",
            title: "Section F - Complaint Summary",
            text: "Summary and analysis of complaints received during the reporting period.",
            sourceCitation: "MDCG 2022-21 Annex I Section F",
            mandatory: true,
            requiredEvidenceTypes: ["complaints", "complaint_record"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_G",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            templateId: "MDCG_2022_21_ANNEX_I",
            kind: "obligation",
            title: "Section G - Trend Analysis",
            text: "Statistical analysis of trends in complaints, incidents, and other PMS data.",
            sourceCitation: "MDCG 2022-21 Annex I Section G",
            mandatory: true,
            requiredEvidenceTypes: ["complaints", "incidents", "sales_volume"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_H",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            templateId: "MDCG_2022_21_ANNEX_I",
            kind: "obligation",
            title: "Section H - FSCA Summary",
            text: "Summary of field safety corrective actions initiated during the reporting period.",
            sourceCitation: "MDCG 2022-21 Annex I Section H",
            mandatory: true,
            requiredEvidenceTypes: ["fsca"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_I",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            templateId: "MDCG_2022_21_ANNEX_I",
            kind: "obligation",
            title: "Section I - CAPA Summary",
            text: "Summary of corrective and preventive actions implemented.",
            sourceCitation: "MDCG 2022-21 Annex I Section I",
            mandatory: true,
            requiredEvidenceTypes: ["capa"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_J",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            templateId: "MDCG_2022_21_ANNEX_I",
            kind: "obligation",
            title: "Section J - Literature Review",
            text: "Summary of relevant scientific literature published during the reporting period.",
            sourceCitation: "MDCG 2022-21 Annex I Section J",
            mandatory: true,
            requiredEvidenceTypes: ["literature"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_K",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            templateId: "MDCG_2022_21_ANNEX_I",
            kind: "obligation",
            title: "Section K - Registry Data",
            text: "Analysis of data from registries and databases consulted.",
            sourceCitation: "MDCG 2022-21 Annex I Section K",
            mandatory: false,
            requiredEvidenceTypes: ["registry"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_L",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            templateId: "MDCG_2022_21_ANNEX_I",
            kind: "obligation",
            title: "Section L - PMCF Results",
            text: "Summary of PMCF study results and findings.",
            sourceCitation: "MDCG 2022-21 Annex I Section L",
            mandatory: true,
            requiredEvidenceTypes: ["pmcf"]
        },
        {
            obligationId: "MDCG_2022_21.PSUR.OBL.ANNEX_I_M",
            jurisdiction: "EU_MDR",
            artifactType: "PSUR",
            templateId: "MDCG_2022_21_ANNEX_I",
            kind: "obligation",
            title: "Section M - Conclusions",
            text: "Overall conclusions on device safety and performance, benefit-risk determination, and planned actions.",
            sourceCitation: "MDCG 2022-21 Annex I Section M",
            mandatory: true,
            requiredEvidenceTypes: []
        }
    ];

    for (const obl of mdcgObligations) {
        await db.insert(grkbObligations).values(obl).onConflictDoNothing();
    }
    console.log(`    ✓ MDCG 2022-21 obligations: ${mdcgObligations.length}`);

    // ─────────────────────────────────────────────
    // 6. GRKB OBLIGATIONS – UK MDR (Mirroring)
    // ─────────────────────────────────────────────
    console.log("  → Seeding UK MDR mirroring obligations...");
    const ukMdrObligations = [
        {
            obligationId: "UK_MDR.PSUR.OBL.86_1",
            jurisdiction: "UK_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "PSUR Content and Update Frequency (UK)",
            text: "Manufacturers of class IIa, class IIb and class III devices shall prepare a periodic safety update report (PSUR) for each device, summarising the results and conclusions of post-market surveillance data.",
            sourceCitation: "UK MDR Regulation 86(1)",
            mandatory: true,
            requiredEvidenceTypes: ["sales_volume", "complaints", "incidents"]
        },
        {
            obligationId: "UK_MDR.PSUR.OBL.86_2a",
            jurisdiction: "UK_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "Class IIa PSUR Frequency (UK)",
            text: "For class IIa devices, the PSUR shall be updated when necessary and at least every two years.",
            sourceCitation: "UK MDR Regulation 86(2)(a)",
            mandatory: true,
            requiredEvidenceTypes: []
        },
        {
            obligationId: "UK_MDR.PSUR.OBL.86_2b",
            jurisdiction: "UK_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "Class IIb/III PSUR Frequency (UK)",
            text: "For class IIb and class III devices, the PSUR shall be updated at least annually.",
            sourceCitation: "UK MDR Regulation 86(2)(b)",
            mandatory: true,
            requiredEvidenceTypes: []
        },
        {
            obligationId: "UK_MDR.PSUR.OBL.83",
            jurisdiction: "UK_MDR",
            artifactType: "PSUR",
            kind: "obligation",
            title: "Post-market Surveillance System (UK)",
            text: "Manufacturers shall establish, document, implement, maintain and update a post-market surveillance system proportionate to the risk class of the device.",
            sourceCitation: "UK MDR Regulation 83",
            mandatory: true,
            requiredEvidenceTypes: ["complaints", "incidents", "literature"]
        }
    ];

    for (const obl of ukMdrObligations) {
        await db.insert(grkbObligations).values(obl).onConflictDoNothing();
    }
    console.log(`    ✓ UK MDR obligations: ${ukMdrObligations.length}`);

    // ─────────────────────────────────────────────
    // 7. GRKB ENTRIES (Legacy format - interpretations)
    // ─────────────────────────────────────────────
    console.log("  → Seeding GRKB entries (interpretations)...");
    const grkbInterpretations = [
        {
            regulation: "EU_MDR",
            category: "psur_requirements",
            requirement: {
                obligationId: "EU_MDR_86_1",
                summary: "PSUR Content Requirements",
                interpretation: "Manufacturers shall prepare PSURs summarizing PMS data, conclusions, and corrective actions. The PSUR must include an overall conclusion on benefit-risk.",
                keyPoints: [
                    "PMS data summary required",
                    "Must include corrective actions taken",
                    "Benefit-risk conclusion mandatory"
                ]
            },
            references: ["Article 86(1)", "MDCG 2022-21"]
        },
        {
            regulation: "EU_MDR",
            category: "psur_requirements",
            requirement: {
                obligationId: "MDCG_2022_21_2_2",
                summary: "PSUR Structure Requirements",
                interpretation: "PSURs must include complaints, serious incidents, sales data, PMCF results, and literature review following the structure in MDCG 2022-21 Annex I.",
                keyPoints: [
                    "Structured format per Annex I",
                    "All evidence types required",
                    "Trend analysis mandatory"
                ]
            },
            references: ["MDCG 2022-21 Section 2.2", "MDCG 2022-21 Annex I"]
        },
        {
            regulation: "EU_MDR",
            category: "evidence_requirements",
            requirement: {
                type: "sales_volume",
                summary: "Sales Volume Evidence",
                interpretation: "Sales data must be provided to establish the population denominator for incident and complaint rate calculations.",
                requiredFor: ["Section C", "Trend Analysis"]
            },
            references: ["Article 86(1)", "MDCG 2022-21 Section C"]
        },
        {
            regulation: "UK_MDR",
            category: "psur_requirements",
            requirement: {
                obligationId: "UK_MDR_86",
                summary: "UK PSUR Requirements",
                interpretation: "UK MDR mirrors EU MDR PSUR requirements. Manufacturers must prepare PSURs with the same content and frequency requirements.",
                keyPoints: [
                    "Mirrors EU MDR Article 86",
                    "Same frequency requirements",
                    "Submit to UK Approved Body"
                ]
            },
            references: ["UK MDR Regulation 86"]
        }
    ];

    for (const entry of grkbInterpretations) {
        await db.insert(grkbEntries).values(entry).onConflictDoNothing();
    }
    console.log(`    ✓ GRKB entries: ${grkbInterpretations.length}`);

    // ─────────────────────────────────────────────
    // COMPLETE
    // ─────────────────────────────────────────────
    const totalObligations = euMdrObligations.length + mdcgObligations.length + ukMdrObligations.length;
    console.log("\n✅ RegulatoryOS seed complete!");
    console.log(`   📊 Total obligations seeded: ${totalObligations}`);
    console.log(`   📄 GRKB entries seeded: ${grkbInterpretations.length}`);
    console.log(`   🏢 Default company created`);
    console.log(`   🔧 Default device created`);
    console.log(`   👤 System user created`);

    await pool.end();
}

main().catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
});
