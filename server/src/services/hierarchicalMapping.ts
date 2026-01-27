/**
 * HIERARCHICAL MAPPING SERVICE
 * 
 * Architecture:
 * ┌─────────────────────────────────────┐
 * │   EU MDR / UK MDR (Regulations)    │  ← GRKB obligations
 * └───────────────────┬─────────────────┘
 *                     │ 100% Coverage
 *                     ▼
 * ┌─────────────────────────────────────┐
 * │   MDCG 2022-21 (Reference Standard) │  ← The gold standard
 * └───────────────────┬─────────────────┘
 *                     │ Alignment Check
 *                     ▼
 * ┌─────────────────────────────────────┐
 * │   Custom Templates                  │  ← Mapped against MDCG
 * └─────────────────────────────────────┘
 * 
 * Custom templates are validated against MDCG 2022-21, NOT directly against GRKB.
 * Any "uncovered" means misalignment with MDCG 2022-21 standard.
 */

import { db } from "../../db";
import { eq, and, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  templates,
  slotDefinitions,
  slotObligationLinks,
  grkbObligations,
} from "@shared/schema";
import { complete, embed } from "../agents/llmService";
import { createHash } from "crypto";
import * as neo4jService from "./neo4jGrkbService";

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Safely get slot name from various slot formats.
 * Custom templates may use slot_name, title, or name fields.
 */
function getSlotName(slot: any): string {
  return slot?.slot_name || slot?.title || slot?.name || slot?.slot_id || "Unknown";
}

/**
 * Parse the required field to convert conditional strings to booleans.
 * Templates may use strings like "conditional:serious_incidents_count_greater_than_zero"
 * but the database expects boolean values.
 * 
 * @param required - The required field value (boolean, string, or any)
 * @returns boolean - true if absolutely required, false if conditional or not required
 */
function parseRequiredField(required: any): boolean {
  // If it's already a boolean, return it
  if (typeof required === 'boolean') {
    return required;
  }
  
  // If it's a string starting with "conditional:", treat as not absolutely required
  if (typeof required === 'string' && required.startsWith('conditional:')) {
    return false;
  }
  
  // Coerce other values to boolean
  return Boolean(required);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface MdcgSlot {
  slot_id: string;
  title: string;
  section_path?: string;
  slot_kind?: string;
  required: boolean;
  evidence_requirements?: {
    required_types?: string[];
    min_atoms?: number;
  };
}

export interface CustomSlot {
  slot_id: string;
  slot_name: string;
  description?: string;
  evidence_requirements?: string[] | {
    required_types: string[];
    min_atoms?: number;
    allow_empty_with_justification?: boolean;
  };
  regulatory_reference?: string;
  required: boolean;
  data_type: string;
}

export interface SlotAlignmentResult {
  customSlotId: string;
  customSlotName: string;
  mdcgSlotId: string | null;
  mdcgSlotTitle: string | null;
  confidence: number;
  method: "llm" | "evidence_overlap" | "semantic" | "name_match" | "manual" | "no_match";
  reasoning: string;
  // Through MDCG, these are the GRKB obligations covered
  grkbObligationsCovered: string[];
}

export interface HierarchicalMappingResult {
  success: boolean;
  customTemplateId: string;
  referenceStandard: string;  // e.g., "MDCG_2022_21_ANNEX_I"
  
  // Alignment with MDCG 2022-21
  alignmentStats: {
    totalMdcgSlots: number;
    coveredMdcgSlots: number;
    alignmentPercent: number;
    totalCustomSlots: number;
    unmatchedCustomSlots: number;
  };
  
  // Through MDCG, coverage of GRKB obligations
  grkbStats: {
    totalGrkbObligations: number;
    coveredGrkbObligations: number;
    grkbCoveragePercent: number;
  };
  
  slotAlignments: SlotAlignmentResult[];
  uncoveredMdcgSlots: Array<{ slotId: string; title: string; reason: string }>;
  orphanedCustomSlots: Array<{ slotId: string; name: string }>;
  
  status: "ALIGNED" | "PARTIAL" | "MISALIGNED";
  warnings: string[];
  errors: string[];
}

// Cache for embeddings
const embeddingCache = new Map<string, number[]>();

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

export async function mapCustomTemplateToMdcg(
  customTemplate: {
    template_id: string;
    name: string;
    version: string;
    jurisdiction_scope?: string[];
    slots: CustomSlot[];
  },
  options: {
    referenceTemplateId?: string;
    useLLM?: boolean;
    confidenceThreshold?: number;
    syncToNeo4j?: boolean;
  } = {}
): Promise<HierarchicalMappingResult> {
  const {
    referenceTemplateId = "MDCG_2022_21_ANNEX_I",
    useLLM = true,
    confidenceThreshold = 60,
    syncToNeo4j = true,
  } = options;

  const warnings: string[] = [];
  const errors: string[] = [];
  const alignments: SlotAlignmentResult[] = [];

  console.log(`[HierarchicalMapping] Mapping ${customTemplate.template_id} against ${referenceTemplateId}`);

  // Step 1: Load MDCG 2022-21 reference template
  const mdcgTemplate = await loadReferenceTemplate(referenceTemplateId);
  if (!mdcgTemplate) {
    return {
      success: false,
      customTemplateId: customTemplate.template_id,
      referenceStandard: referenceTemplateId,
      alignmentStats: { totalMdcgSlots: 0, coveredMdcgSlots: 0, alignmentPercent: 0, totalCustomSlots: customTemplate.slots.length, unmatchedCustomSlots: customTemplate.slots.length },
      grkbStats: { totalGrkbObligations: 0, coveredGrkbObligations: 0, grkbCoveragePercent: 0 },
      slotAlignments: [],
      uncoveredMdcgSlots: [],
      orphanedCustomSlots: customTemplate.slots.map(s => ({ slotId: s.slot_id, name: getSlotName(s) })),
      status: "MISALIGNED",
      warnings,
      errors: [`Reference template ${referenceTemplateId} not found`],
    };
  }

  const mdcgSlots = mdcgTemplate.slots as MdcgSlot[];
  const mdcgObligationIds = (mdcgTemplate.mandatory_obligation_ids as string[]) || [];

  console.log(`[HierarchicalMapping] MDCG has ${mdcgSlots.length} slots, ${mdcgObligationIds.length} obligation mappings`);

  // Step 2: Build MDCG slot -> GRKB obligations mapping
  const mdcgSlotToObligations = await buildMdcgObligationMapping(mdcgSlots, mdcgObligationIds);

  // Step 3: Match each custom slot to MDCG slots using LLM
  const coveredMdcgSlotIds = new Set<string>();
  const matchedCustomSlotIds = new Set<string>();

  for (const customSlot of customTemplate.slots) {
    const alignment = await matchCustomSlotToMdcg(
      customSlot,
      mdcgSlots,
      mdcgSlotToObligations,
      { useLLM, confidenceThreshold }
    );
    
    alignments.push(alignment);
    
    if (alignment.mdcgSlotId && alignment.confidence >= confidenceThreshold) {
      coveredMdcgSlotIds.add(alignment.mdcgSlotId);
      matchedCustomSlotIds.add(customSlot.slot_id);
    }
  }

  // Step 4: Calculate alignment stats
  const totalMdcgSlots = mdcgSlots.filter(s => s.required).length; // Only required slots
  const coveredMdcgSlots = [...coveredMdcgSlotIds].filter(id => 
    mdcgSlots.find(s => s.slot_id === id)?.required
  ).length;
  const alignmentPercent = totalMdcgSlots > 0 
    ? Math.round((coveredMdcgSlots / totalMdcgSlots) * 100) 
    : 100;

  // Step 5: Calculate GRKB coverage through MDCG
  const coveredGrkbObligations = new Set<string>();
  for (const alignment of alignments) {
    for (const oblId of alignment.grkbObligationsCovered) {
      coveredGrkbObligations.add(oblId);
    }
  }
  
  const grkbCoveragePercent = mdcgObligationIds.length > 0
    ? Math.round((coveredGrkbObligations.size / mdcgObligationIds.length) * 100)
    : 100;

  // Step 6: Find uncovered MDCG slots
  const uncoveredMdcgSlots = mdcgSlots
    .filter(s => s.required && !coveredMdcgSlotIds.has(s.slot_id))
    .map(s => ({
      slotId: s.slot_id,
      title: s.title,
      reason: "No matching custom slot found",
    }));

  // Step 7: Find orphaned custom slots (not mapped to anything)
  const orphanedCustomSlots = customTemplate.slots
    .filter(s => !matchedCustomSlotIds.has(s.slot_id))
    .map(s => ({ slotId: s.slot_id, name: getSlotName(s) }));

  // Step 8: Determine status
  let status: "ALIGNED" | "PARTIAL" | "MISALIGNED" = "ALIGNED";
  if (alignmentPercent < 50) {
    status = "MISALIGNED";
    errors.push(`Only ${alignmentPercent}% alignment with ${referenceTemplateId}`);
  } else if (alignmentPercent < 100) {
    status = "PARTIAL";
    warnings.push(`${100 - alignmentPercent}% of MDCG slots uncovered`);
  }

  if (orphanedCustomSlots.length > 0) {
    warnings.push(`${orphanedCustomSlots.length} custom slots not aligned to MDCG standard`);
  }

  // Step 9: Save to database
  await saveHierarchicalMapping(customTemplate, alignments, referenceTemplateId, confidenceThreshold);

  // Step 10: Sync to Neo4j
  let neo4jSynced = false;
  if (syncToNeo4j) {
    neo4jSynced = await syncHierarchicalToNeo4j(customTemplate, alignments, referenceTemplateId);
  }

  console.log(`[HierarchicalMapping] Complete: ${status}, ${alignmentPercent}% alignment, ${grkbCoveragePercent}% GRKB coverage`);

  return {
    success: status !== "MISALIGNED",
    customTemplateId: customTemplate.template_id,
    referenceStandard: referenceTemplateId,
    alignmentStats: {
      totalMdcgSlots,
      coveredMdcgSlots,
      alignmentPercent,
      totalCustomSlots: customTemplate.slots.length,
      unmatchedCustomSlots: orphanedCustomSlots.length,
    },
    grkbStats: {
      totalGrkbObligations: mdcgObligationIds.length,
      coveredGrkbObligations: coveredGrkbObligations.size,
      grkbCoveragePercent,
    },
    slotAlignments: alignments,
    uncoveredMdcgSlots,
    orphanedCustomSlots,
    status,
    warnings,
    errors,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLOT MATCHING
// ═══════════════════════════════════════════════════════════════════════════════

async function matchCustomSlotToMdcg(
  customSlot: CustomSlot,
  mdcgSlots: MdcgSlot[],
  mdcgSlotToObligations: Map<string, string[]>,
  options: { useLLM: boolean; confidenceThreshold: number }
): Promise<SlotAlignmentResult> {
  const candidates: Array<{
    mdcgSlot: MdcgSlot;
    score: number;
    method: SlotAlignmentResult["method"];
    reasoning: string;
  }> = [];

  // Strategy 0: Direct MDCG reference (highest priority)
  const mdcgReference = (customSlot as any).mdcg_reference;
  if (mdcgReference) {
    const directMatch = mdcgSlots.find(s => s.slot_id === mdcgReference);
    if (directMatch) {
      return {
        customSlotId: customSlot.slot_id,
        customSlotName: getSlotName(customSlot),
        mdcgSlotId: directMatch.slot_id,
        mdcgSlotTitle: directMatch.title,
        confidence: 100,
        method: "manual",
        reasoning: `Direct MDCG reference: ${mdcgReference}`,
        grkbObligationsCovered: mdcgSlotToObligations.get(directMatch.slot_id) || [],
      };
    }
  }

  // Strategy 1: Name/title similarity
  // Handle slots that may have slot_name, title, or name fields
  const customName = (customSlot.slot_name || (customSlot as any).title || (customSlot as any).name || customSlot.slot_id || "").toLowerCase();
  
  if (!customName) {
    console.warn(`[HierarchicalMapping] Custom slot missing name: ${JSON.stringify(customSlot).slice(0, 200)}`);
  }
  
  for (const mdcgSlot of mdcgSlots) {
    const mdcgTitle = (mdcgSlot.title || mdcgSlot.slot_id || "").toLowerCase();
    
    if (customName && mdcgTitle && (
        customName === mdcgTitle || 
        customName.includes(mdcgTitle) || 
        mdcgTitle.includes(customName))) {
      candidates.push({
        mdcgSlot,
        score: 90,
        method: "name_match",
        reasoning: `Direct name match: "${customSlot.slot_name || (customSlot as any).title}" ~ "${mdcgSlot.title}"`,
      });
    }
  }

  // Strategy 2: Evidence type overlap
  const customEvidenceTypes = Array.isArray(customSlot.evidence_requirements)
    ? customSlot.evidence_requirements
    : customSlot.evidence_requirements?.required_types || [];
    
  if (customEvidenceTypes.length > 0) {
    const customTypes = new Set(customEvidenceTypes);
    
    for (const mdcgSlot of mdcgSlots) {
      const mdcgTypes = mdcgSlot.evidence_requirements?.required_types || [];
      const overlap = mdcgTypes.filter(t => customTypes.has(t));
      
      if (overlap.length > 0) {
        const overlapRatio = overlap.length / Math.max(customTypes.size, mdcgTypes.length);
        candidates.push({
          mdcgSlot,
          score: Math.round(50 + overlapRatio * 40),
          method: "evidence_overlap",
          reasoning: `Evidence overlap: ${overlap.join(", ")} (${Math.round(overlapRatio * 100)}%)`,
        });
      }
    }
  }

  // Strategy 3: LLM-powered semantic matching
  if (options.useLLM) {
    const llmMatch = await llmMatchSlot(customSlot, mdcgSlots);
    if (llmMatch) {
      candidates.push(llmMatch);
    }
  }

  // Find best match
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (best && best.score >= options.confidenceThreshold) {
    return {
      customSlotId: customSlot.slot_id,
      customSlotName: getSlotName(customSlot),
      mdcgSlotId: best.mdcgSlot.slot_id,
      mdcgSlotTitle: best.mdcgSlot.title,
      confidence: best.score,
      method: best.method,
      reasoning: best.reasoning,
      grkbObligationsCovered: mdcgSlotToObligations.get(best.mdcgSlot.slot_id) || [],
    };
  }

  // No match found
  return {
    customSlotId: customSlot.slot_id,
    customSlotName: getSlotName(customSlot),
    mdcgSlotId: null,
    mdcgSlotTitle: null,
    confidence: 0,
    method: "no_match",
    reasoning: "No matching MDCG slot found above confidence threshold",
    grkbObligationsCovered: [],
  };
}

async function llmMatchSlot(
  customSlot: CustomSlot,
  mdcgSlots: MdcgSlot[]
): Promise<{
  mdcgSlot: MdcgSlot;
  score: number;
  method: "llm";
  reasoning: string;
} | null> {
  const systemPrompt = `You are an EU MDR PSUR expert. Match a custom template slot to the most appropriate MDCG 2022-21 Annex I standard slot.

IMPORTANT: MDCG 2022-21 is the OFFICIAL EU template for PSURs. Custom templates should align with this standard.

Return JSON: {"mdcgSlotId": "...", "confidence": 0-100, "reasoning": "..."}
- confidence should reflect how well the custom slot fulfills the MDCG slot's purpose
- Return {"mdcgSlotId": null, "confidence": 0, "reasoning": "..."} if no good match`;

  const userPrompt = `## Custom Slot
ID: ${customSlot.slot_id}
Name: ${getSlotName(customSlot)}
Description: ${customSlot.description || "N/A"}
Evidence: ${Array.isArray(customSlot.evidence_requirements) 
    ? customSlot.evidence_requirements.join(", ") 
    : customSlot.evidence_requirements?.required_types?.join(", ") || "N/A"}

## MDCG 2022-21 Standard Slots (choose the best match)
${mdcgSlots.map((s, i) => `${i + 1}. ${s.slot_id}: ${s.title}${s.evidence_requirements?.required_types ? ` [Evidence: ${s.evidence_requirements.required_types.slice(0, 3).join(", ")}]` : ""}`).join("\n")}`;

  try {
    const response = await complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      config: { model: "gpt-5.2", temperature: 0.1, maxTokens: 4000 },
      responseFormat: "json",
    });

    const parsed = JSON.parse(response.content);
    if (!parsed.mdcgSlotId || parsed.confidence < 50) return null;

    const matchedSlot = mdcgSlots.find(s => s.slot_id === parsed.mdcgSlotId);
    if (!matchedSlot) return null;

    return {
      mdcgSlot: matchedSlot,
      score: Math.min(90, parsed.confidence), // Cap LLM confidence
      method: "llm",
      reasoning: parsed.reasoning || "LLM semantic analysis",
    };
  } catch (error) {
    console.warn(`[HierarchicalMapping] LLM match failed for ${customSlot.slot_id}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function loadReferenceTemplate(templateId: string): Promise<any | null> {
  // Try database first
  const [dbTemplate] = await db
    .select()
    .from(templates)
    .where(eq(templates.templateId, templateId))
    .limit(1);

  if (dbTemplate) {
    return dbTemplate.templateJson;
  }

  // Fallback to filesystem
  const fs = await import("fs/promises");
  const path = await import("path");
  
  const templatePaths = [
    path.resolve(process.cwd(), `server/templates/${templateId}.json`),
    path.resolve(process.cwd(), `templates/${templateId}.json`),
  ];

  for (const templatePath of templatePaths) {
    try {
      const content = await fs.readFile(templatePath, "utf-8");
      return JSON.parse(content);
    } catch {
      continue;
    }
  }

  return null;
}

async function buildMdcgObligationMapping(
  mdcgSlots: MdcgSlot[],
  mandatoryObligationIds: string[]
): Promise<Map<string, string[]>> {
  // This maps MDCG slots to the GRKB obligations they satisfy
  // The mapping is based on evidence types and the MDCG template structure
  
  const mapping = new Map<string, string[]>();
  
  // Fetch GRKB obligations
  const obligations = await db
    .select()
    .from(grkbObligations)
    .where(inArray(grkbObligations.obligationId, mandatoryObligationIds));

  for (const mdcgSlot of mdcgSlots) {
    const slotTypes = mdcgSlot.evidence_requirements?.required_types || [];
    const matchedOblIds: string[] = [];

    for (const obl of obligations) {
      const oblTypes = (obl.requiredEvidenceTypes as string[]) || [];
      const overlap = slotTypes.filter(t => oblTypes.includes(t));
      
      // If there's evidence overlap or the slot kind matches, map it
      if (overlap.length > 0) {
        matchedOblIds.push(obl.obligationId);
      }
    }

    mapping.set(mdcgSlot.slot_id, matchedOblIds);
  }

  return mapping;
}

async function saveHierarchicalMapping(
  template: { template_id: string; name: string; version: string; jurisdiction_scope?: string[]; slots: CustomSlot[] },
  alignments: SlotAlignmentResult[],
  referenceStandard: string,
  confidenceThreshold: number
): Promise<void> {
  const jurisdictions = template.jurisdiction_scope || ["EU_MDR"];

  // Save template
  await db.insert(templates).values({
    templateId: template.template_id,
    name: template.name,
    version: template.version,
    jurisdictions,
    templateType: "slot-based",
    templateJson: template,
  }).onConflictDoUpdate({
    target: templates.templateId,
    set: {
      name: template.name,
      version: template.version,
      jurisdictions,
      templateJson: template,
      updatedAt: new Date(),
    },
  });

  // Save slot definitions
  for (let i = 0; i < template.slots.length; i++) {
    const slot = template.slots[i];
    const slotTitle = getSlotName(slot);
    const isRequired = parseRequiredField(slot.required);
    
    await db.insert(slotDefinitions).values({
      slotId: slot.slot_id,
      title: slotTitle,
      description: slot.description || "",
      templateId: template.template_id,
      jurisdictions,
      requiredEvidenceTypes: Array.isArray(slot.evidence_requirements)
        ? slot.evidence_requirements
        : slot.evidence_requirements?.required_types || [],
      hardRequireEvidence: isRequired,
      minAtoms: 1,
      sortOrder: i,
    }).onConflictDoUpdate({
      target: [slotDefinitions.slotId, slotDefinitions.templateId],
      set: {
        title: slotTitle,
        description: slot.description || "",
        requiredEvidenceTypes: Array.isArray(slot.evidence_requirements)
          ? slot.evidence_requirements
          : slot.evidence_requirements?.required_types || [],
        hardRequireEvidence: isRequired,
        sortOrder: i,
      },
    });
  }

  // Clear existing obligation links
  await db.delete(slotObligationLinks)
    .where(eq(slotObligationLinks.templateId, template.template_id));

  // Save obligation links (from GRKB through MDCG mapping)
  const linksToInsert: any[] = [];
  for (const alignment of alignments) {
    if (alignment.confidence < confidenceThreshold) continue;
    
    for (const oblId of alignment.grkbObligationsCovered) {
      linksToInsert.push({
        templateId: template.template_id,
        slotId: alignment.customSlotId,
        obligationId: oblId,
        mandatory: true,
        confidence: alignment.confidence,
        matchMethod: `hierarchical:${alignment.method}`,
        reasoning: `Via MDCG ${alignment.mdcgSlotId}: ${alignment.reasoning}`,
        isManualOverride: alignment.method === "manual",
      });
    }
  }

  if (linksToInsert.length > 0) {
    await db.insert(slotObligationLinks).values(linksToInsert).onConflictDoNothing();
  }

  console.log(`[HierarchicalMapping] Saved template + ${linksToInsert.length} obligation links`);
}

async function syncHierarchicalToNeo4j(
  template: { template_id: string; name: string; jurisdiction_scope?: string[]; slots: CustomSlot[] },
  alignments: SlotAlignmentResult[],
  referenceStandard: string
): Promise<boolean> {
  const healthy = await neo4jService.neo4jHealthCheck();
  if (!healthy) return false;

  try {
    // Create template node
    await neo4jService.createTemplateInGraph(
      template.template_id,
      template.name,
      "slot-based",
      template.jurisdiction_scope || ["EU_MDR"]
    );

    // Create relationship to reference standard
    const driver = neo4jService.getDriver();
    if (driver) {
      const session = driver.session();
      try {
        await session.run(`
          MATCH (custom:Template {templateId: $customId})
          MATCH (ref:Template {templateId: $refId})
          MERGE (custom)-[:ALIGNS_WITH {confidence: $confidence}]->(ref)
        `, {
          customId: template.template_id,
          refId: referenceStandard,
          confidence: alignments.length > 0 
            ? Math.round(alignments.reduce((sum, a) => sum + a.confidence, 0) / alignments.length)
            : 0,
        });
      } finally {
        await session.close();
      }
    }

    // Add slots with MDCG alignment relationships
    for (const slot of template.slots) {
      await neo4jService.addSlotToGraph({
        slotId: slot.slot_id,
        slotName: getSlotName(slot),
        templateId: template.template_id,
        evidenceTypes: Array.isArray(slot.evidence_requirements)
          ? slot.evidence_requirements
          : slot.evidence_requirements?.required_types || [],
      });

      const alignment = alignments.find(a => a.customSlotId === slot.slot_id);
      if (alignment?.mdcgSlotId) {
        // Create ALIGNS_WITH relationship to MDCG slot
        const driver = neo4jService.getDriver();
        if (driver) {
          const session = driver.session();
          try {
            await session.run(`
              MATCH (customSlot:Slot {slotId: $customSlotId})
              MATCH (mdcgSlot:Slot {slotId: $mdcgSlotId})
              MERGE (customSlot)-[:ALIGNS_WITH {
                confidence: $confidence,
                method: $method,
                reasoning: $reasoning
              }]->(mdcgSlot)
            `, {
              customSlotId: slot.slot_id,
              mdcgSlotId: alignment.mdcgSlotId,
              confidence: alignment.confidence,
              method: alignment.method,
              reasoning: alignment.reasoning,
            });
          } finally {
            await session.close();
          }
        }
      }
    }

    console.log("[HierarchicalMapping] Synced hierarchical structure to Neo4j");
    return true;
  } catch (error) {
    console.error("[HierarchicalMapping] Neo4j sync failed:", error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANUAL OVERRIDE
// ═══════════════════════════════════════════════════════════════════════════════

export async function applyManualSlotAlignment(
  customTemplateId: string,
  customSlotId: string,
  mdcgSlotId: string,
  reason: string = "Manual alignment"
): Promise<void> {
  // Load MDCG template to get obligations
  const mdcgTemplate = await loadReferenceTemplate("MDCG_2022_21_ANNEX_I");
  if (!mdcgTemplate) throw new Error("MDCG reference template not found");

  const mdcgSlots = mdcgTemplate.slots as MdcgSlot[];
  const mdcgObligationIds = (mdcgTemplate.mandatory_obligation_ids as string[]) || [];
  const mdcgSlotToObligations = await buildMdcgObligationMapping(mdcgSlots, mdcgObligationIds);

  const oblIds = mdcgSlotToObligations.get(mdcgSlotId) || [];

  // Clear existing links for this slot
  await db.delete(slotObligationLinks)
    .where(
      and(
        eq(slotObligationLinks.templateId, customTemplateId),
        eq(slotObligationLinks.slotId, customSlotId)
      )
    );

  // Insert new links
  const links = oblIds.map(oblId => ({
    templateId: customTemplateId,
    slotId: customSlotId,
    obligationId: oblId,
    mandatory: true,
    confidence: 100,
    matchMethod: "hierarchical:manual",
    reasoning: `Manual: aligned to MDCG ${mdcgSlotId}. ${reason}`,
    isManualOverride: true,
  }));

  if (links.length > 0) {
    await db.insert(slotObligationLinks).values(links);
  }

  console.log(`[HierarchicalMapping] Manual alignment: ${customSlotId} -> ${mdcgSlotId} (${oblIds.length} obligations)`);
}
