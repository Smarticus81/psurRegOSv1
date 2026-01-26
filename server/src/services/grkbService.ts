/**
 * GRKB Service - DB-backed Global Regulatory Knowledge Base
 * 
 * This service provides the single source of truth for regulatory obligations
 * and constraints. All obligation queries MUST go through this service.
 * 
 * No hardcoded/mock data - all data comes from the grkb_obligations table.
 */

import { db } from "../../db";
import { grkbObligations, type GrkbObligation, type InsertGrkbObligation } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

export interface GrkbFilter {
  jurisdiction?: string;
  jurisdictions?: string[];
  artifactType?: string;
  templateId?: string;
  kind?: "obligation" | "constraint" | "definition";
}

export interface ObligationEntry {
  id: number;
  obligationId: string;
  jurisdiction: string;
  artifactType: string;
  templateId: string | null;
  kind: string;
  title: string;
  text: string;
  sourceCitation: string | null;
  version: string;
  effectiveFrom: Date | null;
  mandatory: boolean;
  requiredEvidenceTypes: string[];
}

export interface QualificationReport {
  status: "VERIFIED" | "BLOCKED";
  templateId: string;
  jurisdictions: string[];
  slotCount: number;
  mappingCount: number;
  mandatoryObligationsTotal: number;
  mandatoryObligationsFound: number;
  missingObligations: {
    jurisdiction: string;
    count: number;
    message: string;
  }[];
  constraints: number;
  validatedAt: string;
  blockingErrors: string[];
}

/**
 * List GRKB entries with optional filtering.
 * Returns all entries if no filter is provided.
 */
export async function listGrkbEntries(filter?: GrkbFilter): Promise<GrkbObligation[]> {
  let query = db.select().from(grkbObligations);
  
  const conditions: any[] = [];
  
  if (filter?.jurisdiction) {
    conditions.push(eq(grkbObligations.jurisdiction, filter.jurisdiction));
  }
  
  if (filter?.jurisdictions && filter.jurisdictions.length > 0) {
    conditions.push(inArray(grkbObligations.jurisdiction, filter.jurisdictions));
  }
  
  if (filter?.artifactType) {
    conditions.push(eq(grkbObligations.artifactType, filter.artifactType));
  }
  
  if (filter?.templateId) {
    conditions.push(eq(grkbObligations.templateId, filter.templateId));
  }
  
  if (filter?.kind) {
    conditions.push(eq(grkbObligations.kind, filter.kind));
  }
  
  if (conditions.length > 0) {
    return db.select().from(grkbObligations).where(and(...conditions));
  }
  
  return db.select().from(grkbObligations);
}

/**
 * Get mandatory obligations for the given jurisdictions, artifact type, and template.
 * This is the core method for Step 1 qualification.
 * 
 * Returns ONLY mandatory obligations (kind = "obligation" and mandatory = true).
 */
export async function getObligations(
  jurisdictions: string[],
  artifactType: string,
  templateId?: string
): Promise<GrkbObligation[]> {
  if (jurisdictions.length === 0) {
    return [];
  }
  
  const conditions = [
    inArray(grkbObligations.jurisdiction, jurisdictions),
    eq(grkbObligations.artifactType, artifactType),
    eq(grkbObligations.kind, "obligation"),
    eq(grkbObligations.mandatory, true),
  ];
  
  // If templateId is provided, filter by it; otherwise get all for artifact type
  if (templateId) {
    // Include entries with matching templateId OR null templateId (applies to all templates)
    conditions.push(
      sql`(${grkbObligations.templateId} = ${templateId} OR ${grkbObligations.templateId} IS NULL)`
    );
  }
  
  return db.select().from(grkbObligations).where(and(...conditions));
}

/**
 * Get constraints for the given jurisdictions and artifact type.
 * Constraints are non-mandatory rules that may affect processing.
 */
export async function getConstraints(
  jurisdictions: string[],
  artifactType: string,
  templateId?: string
): Promise<GrkbObligation[]> {
  if (jurisdictions.length === 0) {
    return [];
  }
  
  const conditions = [
    inArray(grkbObligations.jurisdiction, jurisdictions),
    eq(grkbObligations.artifactType, artifactType),
    eq(grkbObligations.kind, "constraint"),
  ];
  
  if (templateId) {
    conditions.push(
      sql`(${grkbObligations.templateId} = ${templateId} OR ${grkbObligations.templateId} IS NULL)`
    );
  }
  
  return db.select().from(grkbObligations).where(and(...conditions));
}

/**
 * Get obligations count per jurisdiction for reporting.
 */
export async function getObligationCountsByJurisdiction(
  jurisdictions: string[],
  artifactType: string
): Promise<Record<string, number>> {
  const obligations = await getObligations(jurisdictions, artifactType);
  
  const counts: Record<string, number> = {};
  for (const jur of jurisdictions) {
    counts[jur] = obligations.filter(o => o.jurisdiction === jur).length;
  }
  
  return counts;
}

/**
 * Qualify template against GRKB obligations.
 * 
 * HARD FAIL (BLOCKED) if any selected jurisdiction has ZERO mandatory obligations.
 * This ensures the GRKB is properly populated before workflow can proceed.
 * 
 * @returns QualificationReport with status VERIFIED or BLOCKED
 */
export async function qualifyTemplateAgainstGrkb(
  templateId: string,
  jurisdictions: string[],
  artifactType: string,
  templateSlots: any[],
  templateMapping: Record<string, any>
): Promise<QualificationReport> {
  const validatedAt = new Date().toISOString();
  const slotCount = templateSlots?.length || 0;
  const mappingCount = Object.keys(templateMapping || {}).length;
  
  // Fetch obligations from DB
  const obligations = await getObligations(jurisdictions, artifactType, templateId);
  const constraints = await getConstraints(jurisdictions, artifactType, templateId);
  
  // Check per-jurisdiction obligation counts
  const obligationsByJurisdiction: Record<string, GrkbObligation[]> = {};
  for (const jur of jurisdictions) {
    obligationsByJurisdiction[jur] = obligations.filter(o => o.jurisdiction === jur);
  }
  
  // Build missing obligations list
  const missingObligations: { jurisdiction: string; count: number; message: string }[] = [];
  const blockingErrors: string[] = [];
  
  for (const jur of jurisdictions) {
    const count = obligationsByJurisdiction[jur]?.length || 0;
    if (count === 0) {
      const msg = `BLOCKED: No mandatory obligations found for jurisdiction '${jur}' with artifact type '${artifactType}'`;
      missingObligations.push({
        jurisdiction: jur,
        count: 0,
        message: msg,
      });
      blockingErrors.push(msg);
    }
  }
  
  // Determine status: BLOCKED if any jurisdiction has zero obligations
  const status = blockingErrors.length > 0 ? "BLOCKED" : "VERIFIED";
  
  console.log(`[GRKB] Validating ${slotCount} slots against ${obligations.length} mandatory obligations...`);
  console.log(`[GRKB] Jurisdictions: ${jurisdictions.join(", ")}, Artifact: ${artifactType}`);
  
  if (status === "BLOCKED") {
    console.log(`[GRKB] QUALIFICATION BLOCKED: ${blockingErrors.join("; ")}`);
  } else {
    console.log(`[GRKB] QUALIFICATION VERIFIED: ${obligations.length} obligations, ${constraints.length} constraints`);
  }
  
  return {
    status,
    templateId,
    jurisdictions,
    slotCount,
    mappingCount,
    mandatoryObligationsTotal: obligations.length,
    mandatoryObligationsFound: obligations.length,
    missingObligations,
    constraints: constraints.length,
    validatedAt,
    blockingErrors,
  };
}

/**
 * Create a new GRKB obligation entry.
 */
export async function createGrkbObligation(entry: InsertGrkbObligation): Promise<GrkbObligation> {
  const [newEntry] = await db.insert(grkbObligations).values(entry).returning();
  return newEntry;
}

/**
 * Create multiple GRKB obligation entries.
 */
export async function createGrkbObligationsBatch(entries: InsertGrkbObligation[]): Promise<GrkbObligation[]> {
  if (entries.length === 0) return [];
  return db.insert(grkbObligations).values(entries).returning();
}

/**
 * Delete all GRKB entries (for testing/seeding only).
 */
export async function deleteAllGrkbObligations(): Promise<void> {
  await db.delete(grkbObligations);
}

/**
 * Enhanced qualification that validates template coverage against ALL mandatory obligations.
 * This is the strict validation gate that ensures no mandatory obligations are missed.
 * 
 * BLOCKED if:
 * - Any jurisdiction has zero obligations in GRKB
 * - Any mandatory obligation is not covered by template slots (when strictCoverage is true)
 */
export async function qualifyTemplateWithStrictCoverage(
  templateId: string,
  jurisdictions: string[],
  artifactType: string,
  templateMapping: Record<string, string[]>,
  options: {
    strictCoverage?: boolean;
    minimumCoveragePercent?: number;
  } = {}
): Promise<QualificationReport & {
  coverageDetails: {
    covered: string[];
    uncovered: string[];
    coveragePercent: number;
  };
}> {
  const { strictCoverage = true, minimumCoveragePercent = 80 } = options;
  const validatedAt = new Date().toISOString();
  
  // Fetch all mandatory obligations
  const obligations = await getObligations(jurisdictions, artifactType, templateId);
  const constraints = await getConstraints(jurisdictions, artifactType, templateId);
  
  // Get all claimed obligation IDs from template mapping
  const claimedObligationIds = new Set(
    Object.values(templateMapping).flat()
  );
  
  // Check which mandatory obligations are covered
  const covered: string[] = [];
  const uncovered: string[] = [];
  
  for (const obl of obligations) {
    if (claimedObligationIds.has(obl.obligationId)) {
      covered.push(obl.obligationId);
    } else {
      uncovered.push(obl.obligationId);
    }
  }
  
  const coveragePercent = obligations.length > 0
    ? Math.round((covered.length / obligations.length) * 100)
    : 100;
  
  // Build blocking errors
  const blockingErrors: string[] = [];
  const missingObligations: { jurisdiction: string; count: number; message: string }[] = [];
  
  // Check per-jurisdiction obligation counts
  for (const jur of jurisdictions) {
    const jurObligations = obligations.filter(o => o.jurisdiction === jur);
    if (jurObligations.length === 0) {
      const msg = `BLOCKED: No mandatory obligations found for jurisdiction '${jur}' with artifact type '${artifactType}'`;
      missingObligations.push({ jurisdiction: jur, count: 0, message: msg });
      blockingErrors.push(msg);
    }
  }
  
  // Strict coverage check
  if (strictCoverage && uncovered.length > 0) {
    const uncoveredByJur: Record<string, string[]> = {};
    for (const oblId of uncovered) {
      const obl = obligations.find(o => o.obligationId === oblId);
      if (obl) {
        if (!uncoveredByJur[obl.jurisdiction]) {
          uncoveredByJur[obl.jurisdiction] = [];
        }
        uncoveredByJur[obl.jurisdiction].push(`${obl.obligationId}: ${obl.title}`);
      }
    }
    
    for (const [jur, oblIds] of Object.entries(uncoveredByJur)) {
      const msg = `COVERAGE_GAP: ${oblIds.length} mandatory obligations not covered in ${jur}`;
      missingObligations.push({ jurisdiction: jur, count: oblIds.length, message: msg });
      blockingErrors.push(msg);
      // Add first 3 uncovered obligations to error message
      for (const oblId of oblIds.slice(0, 3)) {
        blockingErrors.push(`  - ${oblId}`);
      }
      if (oblIds.length > 3) {
        blockingErrors.push(`  ... and ${oblIds.length - 3} more`);
      }
    }
  }
  
  // Check minimum coverage threshold
  if (coveragePercent < minimumCoveragePercent) {
    blockingErrors.push(
      `COVERAGE_THRESHOLD: Template covers only ${coveragePercent}% of mandatory obligations (minimum: ${minimumCoveragePercent}%)`
    );
  }
  
  const status = blockingErrors.length > 0 ? "BLOCKED" : "VERIFIED";
  
  console.log(`[GRKB] Strict coverage validation: ${covered.length}/${obligations.length} obligations covered (${coveragePercent}%)`);
  if (status === "BLOCKED") {
    console.log(`[GRKB] QUALIFICATION BLOCKED: ${blockingErrors.length} issues found`);
  } else {
    console.log(`[GRKB] QUALIFICATION VERIFIED: Full coverage achieved`);
  }
  
  return {
    status,
    templateId,
    jurisdictions,
    slotCount: Object.keys(templateMapping).length,
    mappingCount: claimedObligationIds.size,
    mandatoryObligationsTotal: obligations.length,
    mandatoryObligationsFound: covered.length,
    missingObligations,
    constraints: constraints.length,
    validatedAt,
    blockingErrors,
    coverageDetails: {
      covered,
      uncovered,
      coveragePercent,
    },
  };
}