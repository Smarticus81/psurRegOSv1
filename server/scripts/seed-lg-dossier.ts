import { readFileSync } from "fs";
import { resolve } from "path";
import { eq } from "drizzle-orm";

async function main() {
    // Load environment first
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

    // Dynamic imports to ensure env is loaded before DB connection
    const { db } = await import("../db");
    const { deviceDossiers } = await import("@shared/schema");
    type InsertDeviceDossier = import("@shared/schema").InsertDeviceDossier;

    const {
        createDossier,
        upsertClinicalContext,
        upsertRiskContext,
        upsertRegulatoryHistory,
        upsertClinicalEvidence
    } = await import("../src/services/deviceDossierService");

    console.log("Seeding LG Device Dossier...");

    const deviceCode = "LG";

    // 1. Create/Update Core Dossier
    const dossierData: InsertDeviceDossier = {
        deviceCode,
        tradeName: "LG Device",
        manufacturerName: "LG Manufacturer Inc.",
        basicUdiDi: "1234567890LG",
        classification: {
            class: "IIb",
            rule: "Rule 11",
            rationale: "Active implantable medical device"
        },
        marketEntryDate: new Date("2020-01-01"),
        cumulativeExposure: {
            unitsDistributed: 50000,
            patientYears: 120000,
            asOfDate: "2023-12-31"
        },
        completenessScore: 100
    };

    try {
        const existing = await db.query.deviceDossiers.findFirst({
            where: eq(deviceDossiers.deviceCode, deviceCode)
        });

        if (existing) {
            console.log("Updating existing dossier...");
        } else {
            console.log("Creating new dossier...");
            await createDossier(dossierData);
        }
    } catch (e) {
        console.log("Error checking/creating dossier:", e);
    }

    // 2. Clinical Context
    await upsertClinicalContext(deviceCode, {
        intendedPurpose: "The LG Device is intended for the treatment of cardiac arrhythmias.",
        indications: ["Atrial Fibrillation", "Ventricular Tachycardia"],
        contraindications: ["Active systemic infection", "Pregnancy"],
        targetPopulation: {
            description: "Adult patients with diagnosed arrhythmias",
            ageRange: { min: 18, max: 99 },
            conditions: ["Cardiac Arrhythmia"],
            excludedPopulations: ["Pediatric patients < 18 years"]
        },
        clinicalBenefits: [
            {
                benefitId: "BEN-01",
                description: "Reduction in arrhythmia episodes",
                endpoint: "Episode count",
                evidenceSource: "Clinical Study 001",
                quantifiedValue: "50% reduction"
            }
        ],
        stateOfTheArt: {
            description: "Current standard of care involves pharmacological therapy or ablation.",
            benchmarkDevices: ["Competitor Device A", "Competitor Device B"],
            performanceThresholds: { "success_rate": 0.95 }
        },
        alternativeTreatments: ["Drug Therapy", "Surgery"]
    });
    console.log("Clinical context seeded.");

    // 3. Risk Context
    await upsertRiskContext(deviceCode, {
        principalRisks: [
            {
                riskId: "R001",
                hazard: "Device Infection",
                harm: "Sepsis",
                severity: "Critical",
                probability: "Rare",
                preMarketOccurrenceRate: 0.001,
                mitigations: ["Sterile packaging", "Antibiotic coating"],
                residualRiskAcceptable: true
            },
            {
                riskId: "R002",
                hazard: "Lead Dislodgement",
                harm: "Inappropriate Shock",
                severity: "Serious",
                probability: "Occasional",
                preMarketOccurrenceRate: 0.005,
                mitigations: ["Secure fixation mechanism"],
                residualRiskAcceptable: true
            }
        ],
        riskThresholds: {
            complaintRateThreshold: 0.01,
            seriousIncidentThreshold: 0.001,
            signalDetectionMethod: "Trend Analysis"
        },
        residualRiskAcceptability: {
            criteria: "Risks are acceptable if benefits outweigh risks and all mitigations are applied.",
            afapAnalysisSummary: "All risks reduced as far as possible."
        }
    });
    console.log("Risk context seeded.");

    // 4. Regulatory History
    await upsertRegulatoryHistory(deviceCode, {
        certificates: [
            {
                certificateId: "CE 12345",
                type: "EC Certificate",
                notifiedBody: "BSI (0086)",
                issueDate: "2020-01-01",
                expiryDate: "2025-01-01",
                scope: "Full Quality Assurance System",
                status: "Active"
            }
        ],
        nbCommitments: [],
        fscaHistory: [],
        designChanges: []
    });
    console.log("Regulatory history seeded.");

    // 5. Clinical Evidence
    await upsertClinicalEvidence(deviceCode, {
        pmcfPlan: {
            objectives: ["Confirm long-term safety", "Monitor rare adverse events"],
            currentStatus: "Ongoing",
            endpoints: [
                {
                    endpointId: "EP-01",
                    description: "Rate of infections",
                    targetValue: "< 1%",
                    measurementMethod: "Chart review"
                }
            ]
        },
        externalDbSearchProtocol: {
            databases: ["MAUDE", "EUDAMED"],
            lastSearchDate: "2023-12-01",
            queryTerms: ["LG Device", "Cardiac Arrhythmia"],
            relevanceCriteria: ["Device specific", "Adverse event"]
        }
    });
    console.log("Clinical evidence seeded.");

    console.log("LG Device Dossier seeding complete.");
    process.exit(0);
}

main().catch((err) => {
    console.error("Error seeding dossier:", err);
    process.exit(1);
});
