/**
 * PSUR-GRKB Service
 * 
 * State-of-the-art query and validation service for the PSUR-specific
 * Global Regulatory Knowledge Base. Provides:
 * 
 * - Evidence type registry queries
 * - Obligation graph traversal
 * - Slot-obligation mapping resolution
 * - Compliance checklist management
 * - Validation and completeness checking
 */

import { db } from "../../db";
import {
  psurEvidenceTypes,
  psurSections,
  psurObligationDependencies,
  psurSlotObligations,
  psurComplianceChecklist,
  grkbObligations,
  type PsurEvidenceType,
  type PsurSection,
  type PsurObligationDependency,
  type PsurSlotObligation,
  type PsurComplianceChecklist,
  type GrkbObligation,
  type InsertPsurComplianceChecklist,
} from "@shared/schema";
import { eq, and, or, inArray, sql, desc, asc } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE TYPE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all registered evidence types
 */
export async function getAllEvidenceTypes(): Promise<PsurEvidenceType[]> {
  return db.select().from(psurEvidenceTypes).where(eq(psurEvidenceTypes.isActive, true));
}

/**
 * Get evidence type by ID
 */
export async function getEvidenceTypeById(evidenceTypeId: string): Promise<PsurEvidenceType | null> {
  const results = await db.select()
    .from(psurEvidenceTypes)
    .where(eq(psurEvidenceTypes.evidenceTypeId, evidenceTypeId))
    .limit(1);
  return results[0] || null;
}

/**
 * Get evidence types by category
 */
export async function getEvidenceTypesByCategory(category: string): Promise<PsurEvidenceType[]> {
  return db.select()
    .from(psurEvidenceTypes)
    .where(and(
      eq(psurEvidenceTypes.category, category),
      eq(psurEvidenceTypes.isActive, true)
    ));
}

/**
 * Get field definitions for an evidence type (for mapping tools)
 */
export async function getEvidenceTypeSchema(evidenceTypeId: string): Promise<{
  requiredFields: string[];
  optionalFields: string[];
  fieldDefinitions: Record<string, any>;
} | null> {
  const evType = await getEvidenceTypeById(evidenceTypeId);
  if (!evType) return null;
  
  return {
    requiredFields: evType.requiredFields || [],
    optionalFields: evType.optionalFields || [],
    fieldDefinitions: (evType.fieldDefinitions as Record<string, any>) || {},
  };
}

/**
 * Validate data against evidence type schema
 */
export async function validateEvidenceData(
  evidenceTypeId: string,
  data: Record<string, any>
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const schema = await getEvidenceTypeSchema(evidenceTypeId);
  if (!schema) {
    return { valid: false, errors: [`Unknown evidence type: ${evidenceTypeId}`], warnings: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  for (const field of schema.requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate field types
  for (const [field, def] of Object.entries(schema.fieldDefinitions)) {
    const value = data[field];
    if (value === undefined || value === null) continue;

    const fieldDef = def as { type: string; enum?: string[]; format?: string };
    
    // Type checking
    if (fieldDef.type === "number" && typeof value !== "number") {
      if (isNaN(Number(value))) {
        errors.push(`Field ${field} must be a number`);
      }
    }
    
    if (fieldDef.type === "date" && typeof value === "string") {
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        errors.push(`Field ${field} must be a valid date`);
      }
    }
    
    // Enum validation
    if (fieldDef.enum && !fieldDef.enum.includes(String(value))) {
      warnings.push(`Field ${field} value '${value}' not in allowed values: ${fieldDef.enum.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PSUR SECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all sections for a template
 */
export async function getSectionsForTemplate(templateId: string): Promise<PsurSection[]> {
  return db.select()
    .from(psurSections)
    .where(eq(psurSections.templateId, templateId))
    .orderBy(asc(psurSections.displayOrder));
}

/**
 * Get section by ID
 */
export async function getSectionById(sectionId: string): Promise<PsurSection | null> {
  const results = await db.select()
    .from(psurSections)
    .where(eq(psurSections.sectionId, sectionId))
    .limit(1);
  return results[0] || null;
}

/**
 * Get child sections
 */
export async function getChildSections(parentSectionId: string): Promise<PsurSection[]> {
  return db.select()
    .from(psurSections)
    .where(eq(psurSections.parentSectionId, parentSectionId))
    .orderBy(asc(psurSections.displayOrder));
}

/**
 * Get section hierarchy (flat list with depth indicator)
 */
export async function getSectionHierarchy(templateId: string): Promise<Array<PsurSection & { depth: number }>> {
  const allSections = await getSectionsForTemplate(templateId);
  const result: Array<PsurSection & { depth: number }> = [];
  
  // Build parent map
  const byId = new Map<string, PsurSection>();
  for (const s of allSections) {
    byId.set(s.sectionId, s);
  }
  
  // Calculate depth
  function getDepth(section: PsurSection): number {
    if (!section.parentSectionId) return 0;
    const parent = byId.get(section.parentSectionId);
    if (!parent) return 0;
    return 1 + getDepth(parent);
  }
  
  for (const s of allSections) {
    result.push({ ...s, depth: getDepth(s) });
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OBLIGATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all PSUR obligations for a jurisdiction
 */
export async function getObligationsForJurisdiction(jurisdiction: string): Promise<GrkbObligation[]> {
  return db.select()
    .from(grkbObligations)
    .where(and(
      eq(grkbObligations.jurisdiction, jurisdiction),
      eq(grkbObligations.artifactType, "PSUR")
    ));
}

/**
 * Get all obligations for multiple jurisdictions
 */
export async function getObligationsForJurisdictions(jurisdictions: string[]): Promise<GrkbObligation[]> {
  if (jurisdictions.length === 0) return [];
  
  return db.select()
    .from(grkbObligations)
    .where(and(
      inArray(grkbObligations.jurisdiction, jurisdictions),
      eq(grkbObligations.artifactType, "PSUR")
    ));
}

/**
 * Get mandatory obligations only
 */
export async function getMandatoryObligations(jurisdictions: string[]): Promise<GrkbObligation[]> {
  if (jurisdictions.length === 0) return [];
  
  return db.select()
    .from(grkbObligations)
    .where(and(
      inArray(grkbObligations.jurisdiction, jurisdictions),
      eq(grkbObligations.artifactType, "PSUR"),
      eq(grkbObligations.mandatory, true)
    ));
}

/**
 * Get obligation by ID
 */
export async function getObligationById(obligationId: string): Promise<GrkbObligation | null> {
  const results = await db.select()
    .from(grkbObligations)
    .where(eq(grkbObligations.obligationId, obligationId))
    .limit(1);
  return results[0] || null;
}

/**
 * Get obligations that require a specific evidence type
 */
export async function getObligationsRequiringEvidenceType(evidenceTypeId: string): Promise<GrkbObligation[]> {
  return db.select()
    .from(grkbObligations)
    .where(and(
      eq(grkbObligations.artifactType, "PSUR"),
      sql`${grkbObligations.requiredEvidenceTypes} @> ARRAY[${evidenceTypeId}]::text[]`
    ));
}

// ═══════════════════════════════════════════════════════════════════════════════
// OBLIGATION DEPENDENCIES (GRAPH TRAVERSAL)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get direct dependencies of an obligation
 */
export async function getObligationDependencies(obligationId: string): Promise<{
  requires: GrkbObligation[];
  requiredBy: GrkbObligation[];
  crossReferences: GrkbObligation[];
  sameSection: GrkbObligation[];
}> {
  // Get outgoing dependencies (this obligation depends on...)
  const outgoing = await db.select()
    .from(psurObligationDependencies)
    .where(eq(psurObligationDependencies.fromObligationId, obligationId));
  
  // Get incoming dependencies (...depends on this obligation)
  const incoming = await db.select()
    .from(psurObligationDependencies)
    .where(eq(psurObligationDependencies.toObligationId, obligationId));
  
  // Resolve obligation IDs to full objects
  const allIds = new Set<string>();
  for (const d of [...outgoing, ...incoming]) {
    allIds.add(d.fromObligationId);
    allIds.add(d.toObligationId);
  }
  allIds.delete(obligationId);
  
  const obligations = allIds.size > 0 
    ? await db.select().from(grkbObligations).where(inArray(grkbObligations.obligationId, Array.from(allIds)))
    : [];
  
  const byId = new Map<string, GrkbObligation>();
  for (const o of obligations) {
    byId.set(o.obligationId, o);
  }
  
  const requires: GrkbObligation[] = [];
  const crossReferences: GrkbObligation[] = [];
  const sameSection: GrkbObligation[] = [];
  const requiredBy: GrkbObligation[] = [];
  
  for (const d of outgoing) {
    const target = byId.get(d.toObligationId);
    if (!target) continue;
    
    switch (d.relationType) {
      case "REQUIRES": requires.push(target); break;
      case "CROSS_REFERENCES": crossReferences.push(target); break;
      case "SAME_SECTION": sameSection.push(target); break;
    }
  }
  
  for (const d of incoming) {
    if (d.relationType === "REQUIRES") {
      const source = byId.get(d.fromObligationId);
      if (source) requiredBy.push(source);
    }
  }
  
  return { requires, requiredBy, crossReferences, sameSection };
}

/**
 * Get full dependency graph for an obligation (transitive closure)
 */
export async function getObligationDependencyGraph(
  obligationId: string,
  maxDepth: number = 5
): Promise<Map<string, { obligation: GrkbObligation; depth: number; dependsOn: string[] }>> {
  const graph = new Map<string, { obligation: GrkbObligation; depth: number; dependsOn: string[] }>();
  const visited = new Set<string>();
  
  async function traverse(currentId: string, depth: number) {
    if (depth > maxDepth || visited.has(currentId)) return;
    visited.add(currentId);
    
    const obligation = await getObligationById(currentId);
    if (!obligation) return;
    
    const deps = await db.select()
      .from(psurObligationDependencies)
      .where(and(
        eq(psurObligationDependencies.fromObligationId, currentId),
        eq(psurObligationDependencies.relationType, "REQUIRES")
      ));
    
    const dependsOn = deps.map(d => d.toObligationId);
    
    graph.set(currentId, { obligation, depth, dependsOn });
    
    for (const depId of dependsOn) {
      await traverse(depId, depth + 1);
    }
  }
  
  await traverse(obligationId, 0);
  return graph;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLOT-OBLIGATION MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all slot-obligation mappings for a template
 */
export async function getSlotObligationsForTemplate(templateId: string): Promise<PsurSlotObligation[]> {
  return db.select()
    .from(psurSlotObligations)
    .where(eq(psurSlotObligations.templateId, templateId));
}

/**
 * Get obligations mapped to a specific slot
 */
export async function getObligationsForSlot(
  templateId: string,
  slotId: string
): Promise<Array<{ mapping: PsurSlotObligation; obligation: GrkbObligation }>> {
  const mappings = await db.select()
    .from(psurSlotObligations)
    .where(and(
      eq(psurSlotObligations.templateId, templateId),
      eq(psurSlotObligations.slotId, slotId)
    ));
  
  const results: Array<{ mapping: PsurSlotObligation; obligation: GrkbObligation }> = [];
  
  for (const mapping of mappings) {
    const obligation = await getObligationById(mapping.obligationId);
    if (obligation) {
      results.push({ mapping, obligation });
    }
  }
  
  return results;
}

/**
 * Get slots that satisfy a specific obligation
 */
export async function getSlotsForObligation(
  templateId: string,
  obligationId: string
): Promise<PsurSlotObligation[]> {
  return db.select()
    .from(psurSlotObligations)
    .where(and(
      eq(psurSlotObligations.templateId, templateId),
      eq(psurSlotObligations.obligationId, obligationId)
    ));
}

/**
 * Check if all mandatory obligations are covered by template slots
 */
export async function checkTemplateCoverage(
  templateId: string,
  jurisdictions: string[]
): Promise<{
  covered: string[];
  uncovered: string[];
  partialCoverage: Array<{ obligationId: string; totalCoverage: number }>;
}> {
  const mandatoryObligations = await getMandatoryObligations(jurisdictions);
  const mappings = await getSlotObligationsForTemplate(templateId);
  
  // Calculate coverage per obligation
  const coverageByObligation = new Map<string, number>();
  for (const mapping of mappings) {
    const current = coverageByObligation.get(mapping.obligationId) || 0;
    coverageByObligation.set(mapping.obligationId, current + (mapping.coveragePercentage || 100));
  }
  
  const covered: string[] = [];
  const uncovered: string[] = [];
  const partialCoverage: Array<{ obligationId: string; totalCoverage: number }> = [];
  
  for (const obligation of mandatoryObligations) {
    const totalCoverage = coverageByObligation.get(obligation.obligationId) || 0;
    
    if (totalCoverage >= 100) {
      covered.push(obligation.obligationId);
    } else if (totalCoverage > 0) {
      partialCoverage.push({ obligationId: obligation.obligationId, totalCoverage });
    } else {
      uncovered.push(obligation.obligationId);
    }
  }
  
  return { covered, uncovered, partialCoverage };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE CHECKLIST
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize compliance checklist for a PSUR case
 */
export async function initializeComplianceChecklist(
  psurCaseId: number,
  jurisdictions: string[]
): Promise<PsurComplianceChecklist[]> {
  // Get all applicable obligations
  const obligations = await getObligationsForJurisdictions(jurisdictions);
  
  // Create checklist items
  const items: InsertPsurComplianceChecklist[] = obligations.map(o => ({
    psurCaseId,
    obligationId: o.obligationId,
    status: "pending",
    evidenceCount: 0,
  }));
  
  // Insert (ignore conflicts for idempotency)
  for (const item of items) {
    await db.insert(psurComplianceChecklist).values(item).onConflictDoNothing();
  }
  
  // Return full checklist
  return db.select()
    .from(psurComplianceChecklist)
    .where(eq(psurComplianceChecklist.psurCaseId, psurCaseId));
}

/**
 * Update checklist item status
 */
export async function updateChecklistItem(
  psurCaseId: number,
  obligationId: string,
  update: Partial<{
    status: string;
    satisfiedBySlots: string[];
    evidenceAtomIds: string[];
    evidenceCount: number;
    validationPassed: boolean;
    validationErrors: string[];
    validationWarnings: string[];
    waiverJustification: string;
    waiverApprovedBy: string;
  }>
): Promise<PsurComplianceChecklist | null> {
  const results = await db.update(psurComplianceChecklist)
    .set({
      ...update,
      updatedAt: new Date(),
    })
    .where(and(
      eq(psurComplianceChecklist.psurCaseId, psurCaseId),
      eq(psurComplianceChecklist.obligationId, obligationId)
    ))
    .returning();
  
  return results[0] || null;
}

/**
 * Get compliance summary for a PSUR case
 */
export async function getComplianceSummary(psurCaseId: number): Promise<{
  total: number;
  satisfied: number;
  pending: number;
  failed: number;
  waived: number;
  notApplicable: number;
  percentComplete: number;
}> {
  const items = await db.select()
    .from(psurComplianceChecklist)
    .where(eq(psurComplianceChecklist.psurCaseId, psurCaseId));
  
  const total = items.length;
  const satisfied = items.filter(i => i.status === "satisfied").length;
  const pending = items.filter(i => i.status === "pending").length;
  const failed = items.filter(i => i.status === "failed").length;
  const waived = items.filter(i => i.status === "waived").length;
  const notApplicable = items.filter(i => i.status === "not_applicable").length;
  
  const applicable = total - notApplicable;
  const percentComplete = applicable > 0 
    ? Math.round(((satisfied + waived) / applicable) * 100)
    : 100;
  
  return { total, satisfied, pending, failed, waived, notApplicable, percentComplete };
}

/**
 * Get failed/pending obligations with details
 */
export async function getUnresolvedObligations(psurCaseId: number): Promise<Array<{
  checklist: PsurComplianceChecklist;
  obligation: GrkbObligation;
}>> {
  const items = await db.select()
    .from(psurComplianceChecklist)
    .where(and(
      eq(psurComplianceChecklist.psurCaseId, psurCaseId),
      or(
        eq(psurComplianceChecklist.status, "pending"),
        eq(psurComplianceChecklist.status, "failed")
      )
    ));
  
  const results: Array<{ checklist: PsurComplianceChecklist; obligation: GrkbObligation }> = [];
  
  for (const item of items) {
    const obligation = await getObligationById(item.obligationId);
    if (obligation) {
      results.push({ checklist: item, obligation });
    }
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY & ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get GRKB statistics
 */
export async function getGrkbStatistics(): Promise<{
  evidenceTypes: number;
  sections: { total: number; byTemplate: Record<string, number> };
  obligations: { total: number; byJurisdiction: Record<string, number>; mandatory: number };
  dependencies: number;
  slotMappings: number;
}> {
  const evTypes = await db.select().from(psurEvidenceTypes);
  const sections = await db.select().from(psurSections);
  const obligations = await db.select().from(grkbObligations).where(eq(grkbObligations.artifactType, "PSUR"));
  const deps = await db.select().from(psurObligationDependencies);
  const mappings = await db.select().from(psurSlotObligations);
  
  // Group sections by template
  const sectionsByTemplate: Record<string, number> = {};
  for (const s of sections) {
    sectionsByTemplate[s.templateId] = (sectionsByTemplate[s.templateId] || 0) + 1;
  }
  
  // Group obligations by jurisdiction
  const obligationsByJurisdiction: Record<string, number> = {};
  let mandatoryCount = 0;
  for (const o of obligations) {
    obligationsByJurisdiction[o.jurisdiction] = (obligationsByJurisdiction[o.jurisdiction] || 0) + 1;
    if (o.mandatory) mandatoryCount++;
  }
  
  return {
    evidenceTypes: evTypes.length,
    sections: { total: sections.length, byTemplate: sectionsByTemplate },
    obligations: { total: obligations.length, byJurisdiction: obligationsByJurisdiction, mandatory: mandatoryCount },
    dependencies: deps.length,
    slotMappings: mappings.length,
  };
}

/**
 * Search obligations by text
 */
export async function searchObligations(
  searchTerm: string,
  jurisdictions?: string[]
): Promise<GrkbObligation[]> {
  let query = db.select()
    .from(grkbObligations)
    .where(and(
      eq(grkbObligations.artifactType, "PSUR"),
      or(
        sql`${grkbObligations.title} ILIKE ${`%${searchTerm}%`}`,
        sql`${grkbObligations.text} ILIKE ${`%${searchTerm}%`}`,
        sql`${grkbObligations.sourceCitation} ILIKE ${`%${searchTerm}%`}`
      )
    ));
  
  const results = await query;
  
  if (jurisdictions && jurisdictions.length > 0) {
    return results.filter(o => jurisdictions.includes(o.jurisdiction));
  }
  
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const psurGrkbService = {
  // Evidence Types
  getAllEvidenceTypes,
  getEvidenceTypeById,
  getEvidenceTypesByCategory,
  getEvidenceTypeSchema,
  validateEvidenceData,
  
  // Sections
  getSectionsForTemplate,
  getSectionById,
  getChildSections,
  getSectionHierarchy,
  
  // Obligations
  getObligationsForJurisdiction,
  getObligationsForJurisdictions,
  getMandatoryObligations,
  getObligationById,
  getObligationsRequiringEvidenceType,
  searchObligations,
  
  // Dependencies
  getObligationDependencies,
  getObligationDependencyGraph,
  
  // Slot Mappings
  getSlotObligationsForTemplate,
  getObligationsForSlot,
  getSlotsForObligation,
  checkTemplateCoverage,
  
  // Compliance
  initializeComplianceChecklist,
  updateChecklistItem,
  getComplianceSummary,
  getUnresolvedObligations,
  
  // Analytics
  getGrkbStatistics,
};
