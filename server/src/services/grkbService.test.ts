/**
 * GRKB Service Tests
 * 
 * Tests for the DB-backed GRKB qualification logic.
 * Verifies that Step 1 BLOCKS when no obligations exist and VERIFIES when they do.
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { db } from "../../db";
import { grkbObligations, type InsertGrkbObligation } from "@shared/schema";
import {
    listGrkbEntries,
    getObligations,
    getConstraints,
    qualifyTemplateAgainstGrkb,
    createGrkbObligationsBatch,
    deleteAllGrkbObligations,
} from "../services/grkbService";

// Sample template slots for testing
const SAMPLE_TEMPLATE_SLOTS = [
    { slot_id: "ADMIN", title: "Administrative Identification" },
    { slot_id: "SUMMARY", title: "Executive Summary" },
];

const SAMPLE_TEMPLATE_MAPPING = {
    ADMIN: ["MDCG.2022-21.ANNEX_I.ADMIN"],
    SUMMARY: ["MDCG.2022-21.ANNEX_I.SUMMARY"],
};

describe("GRKB Service", () => {
    beforeAll(async () => {
        // Clean up any existing test data
        await deleteAllGrkbObligations();
    });

    afterAll(async () => {
        // Clean up after tests
        await deleteAllGrkbObligations();
    });

    describe("When DB has NO EU_MDR obligations", () => {
        it("Step 1 should return BLOCKED status", async () => {
            // Ensure no obligations exist
            await deleteAllGrkbObligations();

            const result = await qualifyTemplateAgainstGrkb(
                "MDCG_2022_21_ANNEX_I",
                ["EU_MDR"],
                "PSUR",
                SAMPLE_TEMPLATE_SLOTS,
                SAMPLE_TEMPLATE_MAPPING
            );

            expect(result.status).toBe("BLOCKED");
            expect(result.mandatoryObligationsFound).toBe(0);
            expect(result.blockingErrors.length).toBeGreaterThan(0);
            expect(result.blockingErrors[0]).toContain("EU_MDR");
            expect(result.missingObligations.length).toBe(1);
            expect(result.missingObligations[0].jurisdiction).toBe("EU_MDR");
        });

        it("Step 1 should include specific error message with jurisdiction", async () => {
            await deleteAllGrkbObligations();

            const result = await qualifyTemplateAgainstGrkb(
                "FormQAR-054_C",
                ["EU_MDR", "UK_MDR"],
                "PSUR",
                SAMPLE_TEMPLATE_SLOTS,
                SAMPLE_TEMPLATE_MAPPING
            );

            expect(result.status).toBe("BLOCKED");
            expect(result.blockingErrors.length).toBe(2); // Both jurisdictions missing
            expect(result.blockingErrors.some(e => e.includes("EU_MDR"))).toBe(true);
            expect(result.blockingErrors.some(e => e.includes("UK_MDR"))).toBe(true);
        });
    });

    describe("When DB has EU_MDR obligations", () => {
        const testObligations: InsertGrkbObligation[] = [
            {
                obligationId: "TEST.EU_MDR.001",
                jurisdiction: "EU_MDR",
                artifactType: "PSUR",
                kind: "obligation",
                title: "Test Obligation 1",
                text: "This is a test obligation for EU_MDR.",
                version: "1.0.0",
                mandatory: true,
                requiredEvidenceTypes: ["sales_volume"],
            },
            {
                obligationId: "TEST.EU_MDR.002",
                jurisdiction: "EU_MDR",
                artifactType: "PSUR",
                kind: "obligation",
                title: "Test Obligation 2",
                text: "This is another test obligation for EU_MDR.",
                version: "1.0.0",
                mandatory: true,
                requiredEvidenceTypes: ["complaint_record"],
            },
            {
                obligationId: "TEST.EU_MDR.CON.001",
                jurisdiction: "EU_MDR",
                artifactType: "PSUR",
                kind: "constraint",
                title: "Test Constraint",
                text: "This is a test constraint.",
                version: "1.0.0",
                mandatory: false,
                requiredEvidenceTypes: [],
            },
        ];

        beforeAll(async () => {
            await deleteAllGrkbObligations();
            await createGrkbObligationsBatch(testObligations);
        });

        it("Step 1 should return VERIFIED status", async () => {
            const result = await qualifyTemplateAgainstGrkb(
                "MDCG_2022_21_ANNEX_I",
                ["EU_MDR"],
                "PSUR",
                SAMPLE_TEMPLATE_SLOTS,
                SAMPLE_TEMPLATE_MAPPING
            );

            expect(result.status).toBe("VERIFIED");
            expect(result.mandatoryObligationsTotal).toBe(2); // Only mandatory obligations
            expect(result.mandatoryObligationsFound).toBe(2);
            expect(result.blockingErrors.length).toBe(0);
            expect(result.missingObligations.length).toBe(0);
        });

        it("Obligation counts should match DB entries", async () => {
            const result = await qualifyTemplateAgainstGrkb(
                "MDCG_2022_21_ANNEX_I",
                ["EU_MDR"],
                "PSUR",
                SAMPLE_TEMPLATE_SLOTS,
                SAMPLE_TEMPLATE_MAPPING
            );

            // Should have exactly 2 mandatory obligations (excludes constraint)
            expect(result.mandatoryObligationsTotal).toBe(2);
            expect(result.constraints).toBe(1);
        });

        it("getObligations should return only mandatory obligations", async () => {
            const obligations = await getObligations(["EU_MDR"], "PSUR");

            expect(obligations.length).toBe(2);
            expect(obligations.every(o => o.mandatory === true)).toBe(true);
            expect(obligations.every(o => o.kind === "obligation")).toBe(true);
        });

        it("getConstraints should return only constraints", async () => {
            const constraints = await getConstraints(["EU_MDR"], "PSUR");

            expect(constraints.length).toBe(1);
            expect(constraints[0].kind).toBe("constraint");
        });

        it("listGrkbEntries should return all entries", async () => {
            const entries = await listGrkbEntries();

            expect(entries.length).toBe(3);
        });

        it("listGrkbEntries with filter should return matching entries", async () => {
            const euEntries = await listGrkbEntries({ jurisdiction: "EU_MDR" });

            expect(euEntries.length).toBe(3);
            expect(euEntries.every(e => e.jurisdiction === "EU_MDR")).toBe(true);
        });
    });

    describe("Multi-jurisdiction scenarios", () => {
        const multiJurisdictionObligations: InsertGrkbObligation[] = [
            {
                obligationId: "TEST.EU_MDR.MULTI.001",
                jurisdiction: "EU_MDR",
                artifactType: "PSUR",
                kind: "obligation",
                title: "EU Test Obligation",
                text: "EU obligation for multi-jurisdiction test.",
                version: "1.0.0",
                mandatory: true,
                requiredEvidenceTypes: [],
            },
            {
                obligationId: "TEST.UK_MDR.MULTI.001",
                jurisdiction: "UK_MDR",
                artifactType: "PSUR",
                kind: "obligation",
                title: "UK Test Obligation",
                text: "UK obligation for multi-jurisdiction test.",
                version: "1.0.0",
                mandatory: true,
                requiredEvidenceTypes: [],
            },
        ];

        beforeAll(async () => {
            await deleteAllGrkbObligations();
            await createGrkbObligationsBatch(multiJurisdictionObligations);
        });

        it("Should VERIFY when both jurisdictions have obligations", async () => {
            const result = await qualifyTemplateAgainstGrkb(
                "MDCG_2022_21_ANNEX_I",
                ["EU_MDR", "UK_MDR"],
                "PSUR",
                SAMPLE_TEMPLATE_SLOTS,
                SAMPLE_TEMPLATE_MAPPING
            );

            expect(result.status).toBe("VERIFIED");
            expect(result.mandatoryObligationsTotal).toBe(2);
        });

        it("Should BLOCK when one jurisdiction has no obligations", async () => {
            // Remove UK obligations
            await db.delete(grkbObligations).where(
                // Import eq if needed
                // eq(grkbObligations.jurisdiction, "UK_MDR")
            );
            await deleteAllGrkbObligations();

            // Add only EU obligation
            await createGrkbObligationsBatch([multiJurisdictionObligations[0]]);

            const result = await qualifyTemplateAgainstGrkb(
                "MDCG_2022_21_ANNEX_I",
                ["EU_MDR", "UK_MDR"],
                "PSUR",
                SAMPLE_TEMPLATE_SLOTS,
                SAMPLE_TEMPLATE_MAPPING
            );

            expect(result.status).toBe("BLOCKED");
            expect(result.blockingErrors.some(e => e.includes("UK_MDR"))).toBe(true);
            expect(result.missingObligations.some(m => m.jurisdiction === "UK_MDR")).toBe(true);
        });
    });
});
