/**
 * STREAMLINED TEMPLATE PIPELINE
 * 
 * Single unified flow for template processing:
 * 1. Ingest template (JSON preferred format)
 * 2. Auto-map slots to GRKB obligations (SOTA semantic matching)
 * 3. Save to PostgreSQL + sync to Neo4j graph
 * 
 * This replaces the redundant templateManagementService.ts flow.
 */

import { db } from "../../db";
import { eq, and, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  grkbObligations,
  slotDefinitions,
  slotObligationLinks,
  templates,
  decisionTraceEntries,
  type GrkbObligation,
} from "@shared/schema";
import { embed, complete } from "../agents/llmService";
import { createHash } from "crypto";
import * as neo4jService from "./neo4jGrkbService";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SlotTemplate {
  template_id: string;
  name: string;
  version: string;
  jurisdiction_scope: string[];
  slots: SlotDefinition[];
  mapping?: Record<string, string[]>;  // Optional pre-defined mappings
}

export interface SlotDefinition {
  slot_id: string;
  slot_name: string;
  description?: string;
  evidence_requirements?: string[];
  regulatory_reference?: string;
  required: boolean;
  data_type: string;
}

export interface MappingResult {
  slotId: string;
  obligationId: string;
  confidence: number;
  method: "semantic" | "evidence_type" | "regulatory_ref" | "llm_analysis" | "predefined" | "manual";
  reasoning: string;
}

export interface PipelineResult {
  success: boolean;
  templateId: string;
  status: "PASS" | "WARNING" | "BLOCKED";
  stats: {
    totalSlots: number;
    totalMappings: number;
    totalObligations: number;
    coveredObligations: number;
    coveragePercent: number;
  };
  mappings: MappingResult[];
  uncoveredObligations: string[];
  neo4jSynced: boolean;
  traceId: string;
  errors: string[];
  warnings: string[];
}

// Embedding cache
const embeddingCache = new Map<string, number[]>();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

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
// SCHEMA TRANSFORMATION: Pipeline → Workflow Format
// 
// SOTA approach: Transform at ingestion, store in canonical format.
// The database always stores workflow-compatible templates.
// ═══════════════════════════════════════════════════════════════════════════════

interface WorkflowSlotDefinition {
  slot_id: string;
  title: string;
  section_path: string;
  slot_kind: "ADMIN" | "NARRATIVE" | "TABLE" | "METRIC";
  required: boolean;
  evidence_requirements: {
    required_types: string[];
    min_atoms: number;
    allow_empty_with_justification: boolean;
  };
  output_requirements: {
    renderer: "md" | "docx";
    render_as?: "cover_page" | "table_of_contents" | "narrative" | "table";
    table_schema?: { columns: { name: string; type: "string" | "number" | "boolean" }[] };
  };
}

interface WorkflowTemplate {
  template_id: string;
  name: string;
  version: string;
  jurisdiction_scope: ("EU_MDR" | "UK_MDR")[];
  normative_basis?: string[];
  mandatory_obligation_ids: string[];
  defaults: {
    require_traceability: boolean;
    require_method_statement: boolean;
    require_claimed_obligations: boolean;
    min_method_chars: number;
    min_evidence_atoms: number;
  };
  slots: WorkflowSlotDefinition[];
  mapping: Record<string, string[]>;
}

/**
 * Transform pipeline input format to workflow-compatible schema.
 * This is the canonical transformation that ensures database stores
 * templates in a format the workflow can directly consume.
 */
function transformToWorkflowSchema(
  input: SlotTemplate,
  mappings: MappingResult[],
  confidenceThreshold: number
): WorkflowTemplate {
  // Filter jurisdiction to only valid values
  const validJurisdictions = (input.jurisdiction_scope || [])
    .filter((j): j is "EU_MDR" | "UK_MDR" => j === "EU_MDR" || j === "UK_MDR");
  
  // Build mapping from mappings array
  const slotMapping: Record<string, string[]> = {};
  for (const m of mappings) {
    if (m.confidence >= confidenceThreshold) {
      if (!slotMapping[m.slotId]) {
        slotMapping[m.slotId] = [];
      }
      if (!slotMapping[m.slotId].includes(m.obligationId)) {
        slotMapping[m.slotId].push(m.obligationId);
      }
    }
  }
  
  // Merge with predefined mappings
  if (input.mapping) {
    for (const [slotId, oblIds] of Object.entries(input.mapping)) {
      if (!slotMapping[slotId]) {
        slotMapping[slotId] = [];
      }
      for (const oblId of oblIds) {
        if (!slotMapping[slotId].includes(oblId)) {
          slotMapping[slotId].push(oblId);
        }
      }
    }
  }
  
  // Collect all mandatory obligation IDs from mappings
  const allObligationIds = new Set<string>();
  for (const oblIds of Object.values(slotMapping)) {
    for (const id of oblIds) {
      allObligationIds.add(id);
    }
  }
  
  // Transform slots
  const transformedSlots: WorkflowSlotDefinition[] = input.slots.map((slot, idx) => ({
    slot_id: slot.slot_id,
    title: slot.slot_name || slot.slot_id,
    section_path: deriveSectionPath(slot, idx),
    slot_kind: mapDataTypeToSlotKind(slot.data_type),
    required: slot.required !== false,
    evidence_requirements: {
      required_types: slot.evidence_requirements || [],
      min_atoms: 0,
      allow_empty_with_justification: false,
    },
    output_requirements: {
      renderer: "md" as const,
      render_as: mapDataTypeToRenderAs(slot.data_type),
    },
  }));
  
  return {
    template_id: input.template_id,
    name: input.name,
    version: input.version,
    jurisdiction_scope: validJurisdictions.length > 0 ? validJurisdictions : ["EU_MDR"],
    mandatory_obligation_ids: Array.from(allObligationIds),
    defaults: {
      require_traceability: true,
      require_method_statement: true,
      require_claimed_obligations: true,
      min_method_chars: 10,
      min_evidence_atoms: 0,
    },
    slots: transformedSlots,
    mapping: slotMapping,
  };
}

/**
 * Map pipeline data_type to workflow slot_kind enum
 */
function mapDataTypeToSlotKind(dataType: string): "ADMIN" | "NARRATIVE" | "TABLE" | "METRIC" {
  const type = (dataType || "").toLowerCase();
  
  // Table types
  if (type === "table" || type.includes("table")) return "TABLE";
  
  // Metric types
  if (type === "metric" || type === "number" || type === "numeric" || type === "integer" || type === "decimal") return "METRIC";
  
  // Admin types (TOC, cover page, etc.)
  if (type === "admin" || type === "administrative" || type === "toc" || 
      type === "auto_generated" || type === "cover" || type.includes("cover_page") ||
      type.includes("table_of_contents")) return "ADMIN";
  
  // Default to narrative
  return "NARRATIVE";
}

/**
 * Map data_type to render_as for output requirements
 */
function mapDataTypeToRenderAs(dataType: string): "cover_page" | "table_of_contents" | "narrative" | "table" | undefined {
  const type = (dataType || "").toLowerCase();
  
  if (type === "table" || type.includes("table")) return "table";
  if (type.includes("cover")) return "cover_page";
  if (type === "toc" || type.includes("table_of_contents") || type === "auto_generated") return "table_of_contents";
  
  return "narrative";
}

/**
 * Derive section_path from slot data
 */
function deriveSectionPath(slot: SlotDefinition & { section_number?: string; section_path?: string }, idx: number): string {
  // Use existing section_path if available
  if ((slot as any).section_path) {
    return (slot as any).section_path;
  }
  
  // Use section_number if available
  if ((slot as any).section_number) {
    return `Section ${(slot as any).section_number}`;
  }
  
  // Derive from slot_id pattern (e.g., "section_a_device_info" → "A > Device Info")
  const id = slot.slot_id.toLowerCase();
  
  // Common section patterns
  const sectionPatterns: Record<string, string> = {
    "toc": "Table of Contents",
    "cover": "Cover Page",
    "executive": "A > Executive Summary",
    "device": "B > Device Description",
    "sales": "C > Sales and Distribution",
    "serious": "D > Serious Incidents",
    "incident": "D > Incidents",
    "feedback": "E > Customer Feedback",
    "complaint": "F > Complaints",
    "trend": "G > Trend Analysis",
    "fsca": "H > Field Safety Corrective Actions",
    "capa": "I > Corrective and Preventive Actions",
    "literature": "J > Scientific Literature",
    "database": "K > External Databases",
    "pmcf": "L > Post-Market Clinical Follow-Up",
    "conclusion": "M > Conclusions",
    "benefit": "M > Benefit-Risk",
  };
  
  for (const [pattern, sectionPath] of Object.entries(sectionPatterns)) {
    if (id.includes(pattern)) {
      return sectionPath;
    }
  }
  
  // Default: use slot name or index
  return slot.slot_name || `Section ${idx + 1}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

export async function processTemplatePipeline(
  templateJson: SlotTemplate,
  options: {
    jurisdictions?: string[];
    strictMode?: boolean;
    confidenceThreshold?: number;
    useLLMAnalysis?: boolean;
    syncToNeo4j?: boolean;
  } = {}
): Promise<PipelineResult> {
  const traceId = uuidv4();
  const {
    jurisdictions = templateJson.jurisdiction_scope || ["EU_MDR", "UK_MDR"],
    strictMode = true,
    confidenceThreshold = 60,
    useLLMAnalysis = true,
    syncToNeo4j = true,
  } = options;

  const errors: string[] = [];
  const warnings: string[] = [];
  const mappings: MappingResult[] = [];

  console.log(`[Pipeline] Processing template: ${templateJson.template_id}`);
  console.log(`[Pipeline] Slots: ${templateJson.slots.length}, Jurisdictions: ${jurisdictions.join(", ")}`);

  // Step 1: Validate template structure
  if (!templateJson.template_id || !templateJson.slots || templateJson.slots.length === 0) {
    return {
      success: false,
      templateId: templateJson.template_id || "unknown",
      status: "BLOCKED",
      stats: { totalSlots: 0, totalMappings: 0, totalObligations: 0, coveredObligations: 0, coveragePercent: 0 },
      mappings: [],
      uncoveredObligations: [],
      neo4jSynced: false,
      traceId,
      errors: ["Invalid template: missing template_id or slots"],
      warnings: [],
    };
  }

  // Step 2: Fetch GRKB obligations
  const obligations = await db
    .select()
    .from(grkbObligations)
    .where(
      and(
        inArray(grkbObligations.jurisdiction, jurisdictions),
        eq(grkbObligations.artifactType, "PSUR"),
        eq(grkbObligations.mandatory, true)
      )
    );

  console.log(`[Pipeline] Found ${obligations.length} mandatory obligations`);

  // Step 3: Pre-compute embeddings
  const obligationEmbeddings = await computeObligationEmbeddings(obligations);

  // Step 4: Auto-map each slot
  const coveredObligationIds = new Set<string>();

  for (const slot of templateJson.slots) {
    // Check for predefined mapping first
    const predefined = templateJson.mapping?.[slot.slot_id];
    if (predefined && predefined.length > 0) {
      for (const oblId of predefined) {
        mappings.push({
          slotId: slot.slot_id,
          obligationId: oblId,
          confidence: 100,
          method: "predefined",
          reasoning: "Predefined in template mapping",
        });
        coveredObligationIds.add(oblId);
      }
      continue;
    }

    // Auto-map using SOTA methods
    const slotMappings = await autoMapSlot(
      slot,
      obligations,
      obligationEmbeddings,
      { useLLMAnalysis, confidenceThreshold }
    );

    for (const m of slotMappings) {
      mappings.push(m);
      if (m.confidence >= confidenceThreshold) {
        coveredObligationIds.add(m.obligationId);
      }
    }
  }

  // Step 5: Identify uncovered obligations
  const uncoveredObligations = obligations
    .filter(o => !coveredObligationIds.has(o.obligationId))
    .map(o => o.obligationId);

  // Step 6: Determine status
  const coveragePercent = obligations.length > 0
    ? Math.round((coveredObligationIds.size / obligations.length) * 100)
    : 100;

  let status: "PASS" | "WARNING" | "BLOCKED" = "PASS";
  if (strictMode && uncoveredObligations.length > 0) {
    status = "BLOCKED";
    errors.push(`${uncoveredObligations.length} mandatory obligations not covered`);
  } else if (uncoveredObligations.length > 0) {
    status = "WARNING";
    warnings.push(`${uncoveredObligations.length} obligations uncovered (non-strict mode)`);
  }

  // Step 7: Save to PostgreSQL
  await saveToDatabase(templateJson, mappings, jurisdictions, confidenceThreshold);

  // Step 8: Sync to Neo4j (if enabled and available)
  let neo4jSynced = false;
  if (syncToNeo4j) {
    neo4jSynced = await syncToNeo4jGraph(templateJson, mappings, obligations, confidenceThreshold);
  }

  // Step 9: Record trace
  await recordTrace(traceId, templateJson.template_id, {
    event: "PIPELINE_COMPLETE",
    status,
    stats: {
      totalSlots: templateJson.slots.length,
      totalMappings: mappings.length,
      totalObligations: obligations.length,
      coveredObligations: coveredObligationIds.size,
      coveragePercent,
    },
  });

  console.log(`[Pipeline] Complete: ${status}, ${coveragePercent}% coverage`);

  return {
    success: status !== "BLOCKED",
    templateId: templateJson.template_id,
    status,
    stats: {
      totalSlots: templateJson.slots.length,
      totalMappings: mappings.length,
      totalObligations: obligations.length,
      coveredObligations: coveredObligationIds.size,
      coveragePercent,
    },
    mappings,
    uncoveredObligations,
    neo4jSynced,
    traceId,
    errors,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

async function autoMapSlot(
  slot: SlotDefinition,
  obligations: GrkbObligation[],
  obligationEmbeddings: Map<string, number[]>,
  options: { useLLMAnalysis: boolean; confidenceThreshold: number }
): Promise<MappingResult[]> {
  const matches: MappingResult[] = [];

  // Strategy 1: Evidence type matching (highest precision)
  if (slot.evidence_requirements && slot.evidence_requirements.length > 0) {
    const slotTypes = new Set(slot.evidence_requirements);
    
    for (const obl of obligations) {
      const oblTypes = (obl.requiredEvidenceTypes as string[]) || [];
      const overlap = oblTypes.filter(t => slotTypes.has(t));
      
      if (overlap.length > 0) {
        const overlapPercent = overlap.length / Math.max(slotTypes.size, oblTypes.length);
        const confidence = Math.round(50 + (overlapPercent * 45));
        
        matches.push({
          slotId: slot.slot_id,
          obligationId: obl.obligationId,
          confidence,
          method: "evidence_type",
          reasoning: `Evidence overlap: ${overlap.join(", ")} (${Math.round(overlapPercent * 100)}%)`,
        });
      }
    }
  }

  // Strategy 2: Regulatory reference matching
  if (slot.regulatory_reference) {
    const slotRef = slot.regulatory_reference.toLowerCase();
    
    for (const obl of obligations) {
      if (!obl.sourceCitation) continue;
      const oblRef = obl.sourceCitation.toLowerCase();
      
      if (oblRef.includes(slotRef) || slotRef.includes(oblRef)) {
        const confidence = oblRef === slotRef ? 95 : 80;
        matches.push({
          slotId: slot.slot_id,
          obligationId: obl.obligationId,
          confidence,
          method: "regulatory_ref",
          reasoning: `Citation match: ${obl.sourceCitation}`,
        });
      }
    }
  }

  // Strategy 3: Semantic embedding similarity
  const slotText = `${slot.slot_name}. ${slot.description || ""}`;
  try {
    const slotEmbedding = await getEmbedding(slotText);
    
    for (const obl of obligations) {
      const oblEmbedding = obligationEmbeddings.get(obl.obligationId);
      if (!oblEmbedding) continue;
      
      const similarity = cosineSimilarity(slotEmbedding, oblEmbedding);
      if (similarity >= 0.5) {
        const confidence = Math.round(40 + (similarity - 0.5) * 90);
        matches.push({
          slotId: slot.slot_id,
          obligationId: obl.obligationId,
          confidence,
          method: "semantic",
          reasoning: `Semantic similarity: ${Math.round(similarity * 100)}%`,
        });
      }
    }
  } catch (error) {
    console.warn(`[Pipeline] Embedding failed for slot ${slot.slot_id}`);
  }

  // Strategy 4: LLM analysis for unmatched slots
  const highConfidenceMatches = matches.filter(m => m.confidence >= options.confidenceThreshold);
  if (options.useLLMAnalysis && highConfidenceMatches.length === 0) {
    const llmMatches = await llmAnalyzeSlot(slot, obligations.slice(0, 10));
    matches.push(...llmMatches);
  }

  // Deduplicate by obligation ID, keeping highest confidence
  const byObligation = new Map<string, MappingResult>();
  for (const m of matches) {
    const existing = byObligation.get(m.obligationId);
    if (!existing || m.confidence > existing.confidence) {
      byObligation.set(m.obligationId, m);
    }
  }

  return Array.from(byObligation.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10);
}

async function llmAnalyzeSlot(
  slot: SlotDefinition,
  candidates: GrkbObligation[]
): Promise<MappingResult[]> {
  const systemPrompt = `You are an EU MDR regulatory expert. Match the template slot to regulatory obligations.
Return JSON array: [{"obligationId": "...", "confidence": 0-100, "reasoning": "..."}]
Only include matches with confidence >= 50.`;

  const userPrompt = `## Slot
ID: ${slot.slot_id}
Name: ${slot.slot_name}
Description: ${slot.description || "N/A"}
Evidence: ${slot.evidence_requirements?.join(", ") || "N/A"}

## Candidate Obligations
${candidates.map((o, i) => `${i + 1}. ${o.obligationId}: ${o.title}`).join("\n")}`;

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
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((m: any) => m.confidence >= 50)
      .map((m: any) => ({
        slotId: slot.slot_id,
        obligationId: m.obligationId,
        confidence: Math.min(85, m.confidence), // Cap LLM confidence
        method: "llm_analysis" as const,
        reasoning: m.reasoning || "LLM analysis",
      }));
  } catch (error) {
    console.warn(`[Pipeline] LLM analysis failed for ${slot.slot_id}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMBEDDINGS
// ═══════════════════════════════════════════════════════════════════════════════

async function computeObligationEmbeddings(
  obligations: GrkbObligation[]
): Promise<Map<string, number[]>> {
  const embeddings = new Map<string, number[]>();
  
  for (const obl of obligations) {
    const text = `${obl.title}. ${obl.text}`;
    try {
      embeddings.set(obl.obligationId, await getEmbedding(text));
    } catch (error) {
      // Skip this obligation
    }
  }
  
  console.log(`[Pipeline] Computed ${embeddings.size}/${obligations.length} embeddings`);
  return embeddings;
}

async function getEmbedding(text: string): Promise<number[]> {
  const cacheKey = createHash("md5").update(text).digest("hex");
  
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }
  
  const embedding = await embed(text);
  embeddingCache.set(cacheKey, embedding);
  return embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

async function saveToDatabase(
  template: SlotTemplate,
  mappings: MappingResult[],
  jurisdictions: string[],
  confidenceThreshold: number
): Promise<void> {
  // SOTA: Transform to workflow-compatible format before saving
  // This ensures the database always stores templates in canonical format
  const workflowTemplate = transformToWorkflowSchema(template, mappings, confidenceThreshold);
  
  // Filter jurisdictions to valid values
  const validJurisdictions = jurisdictions.filter(
    (j): j is "EU_MDR" | "UK_MDR" => j === "EU_MDR" || j === "UK_MDR"
  );
  
  // Save template in workflow-compatible format
  await db.insert(templates).values({
    templateId: workflowTemplate.template_id,
    name: workflowTemplate.name,
    version: workflowTemplate.version,
    jurisdictions: validJurisdictions.length > 0 ? validJurisdictions : ["EU_MDR"],
    templateType: "slot-based",
    templateJson: workflowTemplate, // Store workflow-compatible format
  }).onConflictDoUpdate({
    target: templates.templateId,
    set: {
      name: workflowTemplate.name,
      version: workflowTemplate.version,
      jurisdictions: validJurisdictions.length > 0 ? validJurisdictions : ["EU_MDR"],
      templateJson: workflowTemplate, // Store workflow-compatible format
      updatedAt: new Date(),
    },
  });

  // Save slot definitions using transformed slot data
  for (let i = 0; i < workflowTemplate.slots.length; i++) {
    const slot = workflowTemplate.slots[i];
    const isRequired = parseRequiredField(slot.required);
    
    await db.insert(slotDefinitions).values({
      slotId: slot.slot_id,
      title: slot.title, // Use workflow field name
      description: slot.section_path, // Use section_path as description
      templateId: workflowTemplate.template_id,
      jurisdictions: validJurisdictions.length > 0 ? validJurisdictions : ["EU_MDR"],
      requiredEvidenceTypes: slot.evidence_requirements.required_types,
      hardRequireEvidence: isRequired,
      minAtoms: slot.evidence_requirements.min_atoms,
      sortOrder: i,
    }).onConflictDoUpdate({
      target: [slotDefinitions.slotId, slotDefinitions.templateId],
      set: {
        title: slot.title,
        description: slot.section_path,
        requiredEvidenceTypes: slot.evidence_requirements.required_types,
        hardRequireEvidence: isRequired,
        minAtoms: slot.evidence_requirements.min_atoms,
        sortOrder: i,
      },
    });
  }

  // Clear existing mappings
  await db.delete(slotObligationLinks)
    .where(eq(slotObligationLinks.templateId, workflowTemplate.template_id));

  // Save new mappings (already built into workflowTemplate.mapping)
  const linksToInsert = mappings
    .filter(m => m.confidence >= confidenceThreshold)
    .map(m => ({
      templateId: workflowTemplate.template_id,
      slotId: m.slotId,
      obligationId: m.obligationId,
      mandatory: true,
      confidence: m.confidence,
      matchMethod: m.method,
      reasoning: m.reasoning,
      isManualOverride: m.method === "manual",
    }));

  if (linksToInsert.length > 0) {
    await db.insert(slotObligationLinks).values(linksToInsert).onConflictDoNothing();
  }

  console.log(`[Pipeline] Saved workflow-compatible template + ${workflowTemplate.slots.length} slots + ${linksToInsert.length} mappings to DB`);
}

async function syncToNeo4jGraph(
  template: SlotTemplate,
  mappings: MappingResult[],
  obligations: GrkbObligation[],
  confidenceThreshold: number
): Promise<boolean> {
  const healthy = await neo4jService.neo4jHealthCheck();
  if (!healthy) {
    console.log("[Pipeline] Neo4j not available, skipping graph sync");
    return false;
  }

  try {
    // Sync obligations first
    await neo4jService.syncObligationsToNeo4j(
      obligations.map(o => ({
        obligationId: o.obligationId,
        title: o.title,
        text: o.text,
        jurisdiction: o.jurisdiction,
        mandatory: o.mandatory,
        sourceCitation: o.sourceCitation || "",
        requiredEvidenceTypes: (o.requiredEvidenceTypes as string[]) || [],
      }))
    );

    // Create template
    await neo4jService.createTemplateInGraph(
      template.template_id,
      template.name,
      "slot-based",
      template.jurisdiction_scope
    );

    // Clear existing mappings
    await neo4jService.clearTemplateMappings(template.template_id);

    // Add slots and mappings
    for (const slot of template.slots) {
      await neo4jService.addSlotToGraph({
        slotId: slot.slot_id,
        slotName: slot.slot_name,
        templateId: template.template_id,
        evidenceTypes: slot.evidence_requirements || [],
      });

      const slotMappings = mappings.filter(m => m.slotId === slot.slot_id && m.confidence >= confidenceThreshold);
      for (const m of slotMappings) {
        await neo4jService.createSlotObligationMapping(
          m.slotId,
          m.obligationId,
          m.confidence,
          m.method,
          m.reasoning
        );
      }
    }

    console.log("[Pipeline] Synced to Neo4j graph");
    return true;
  } catch (error) {
    console.error("[Pipeline] Neo4j sync failed:", error);
    return false;
  }
}

async function recordTrace(
  traceId: string,
  templateId: string,
  data: any
): Promise<void> {
  const hash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  
  try {
    await db.insert(decisionTraceEntries).values({
      traceId,
      sequenceNum: 1,
      eventTimestamp: new Date(),
      contentHash: hash,
      eventType: data.event,
      actor: "TemplatePipeline",
      entityType: "template",
      entityId: templateId,
      decision: data.status,
      humanSummary: `Template ${templateId}: ${data.status}, ${data.stats.coveragePercent}% coverage`,
      outputData: data,
      templateId,
      jurisdictions: ["EU_MDR", "UK_MDR"],
    } as any);
  } catch (error) {
    console.warn("[Pipeline] Trace recording failed:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANUAL MAPPING API
// ═══════════════════════════════════════════════════════════════════════════════

export async function applyManualMapping(
  templateId: string,
  slotId: string,
  obligationIds: string[],
  reason: string,
  updatedBy: string = "user"
): Promise<void> {
  // Clear existing mappings for this slot
  await db.delete(slotObligationLinks)
    .where(
      and(
        eq(slotObligationLinks.templateId, templateId),
        eq(slotObligationLinks.slotId, slotId)
      )
    );

  // Insert manual mappings
  const links = obligationIds.map(oblId => ({
    templateId,
    slotId,
    obligationId: oblId,
    mandatory: true,
    confidence: 100,
    matchMethod: "manual",
    reasoning: reason,
    isManualOverride: true,
    updatedBy,
  }));

  if (links.length > 0) {
    await db.insert(slotObligationLinks).values(links);
  }

  // Sync to Neo4j if available
  const healthy = await neo4jService.neo4jHealthCheck();
  if (healthy) {
    for (const oblId of obligationIds) {
      await neo4jService.createSlotObligationMapping(slotId, oblId, 100, "manual", reason);
    }
  }

  console.log(`[Pipeline] Manual mapping applied: ${slotId} -> ${obligationIds.join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY API
// ═══════════════════════════════════════════════════════════════════════════════

export async function getTemplateCoverage(
  templateId: string,
  jurisdictions: string[] = ["EU_MDR", "UK_MDR"]
): Promise<{
  coveragePercent: number;
  coveredObligations: string[];
  uncoveredObligations: Array<{ obligationId: string; title: string; jurisdiction: string }>;
  byJurisdiction: Record<string, { total: number; covered: number }>;
}> {
  // Get all mandatory obligations
  const obligations = await db
    .select()
    .from(grkbObligations)
    .where(
      and(
        inArray(grkbObligations.jurisdiction, jurisdictions),
        eq(grkbObligations.artifactType, "PSUR"),
        eq(grkbObligations.mandatory, true)
      )
    );

  // Get existing mappings
  const mappings = await db
    .select()
    .from(slotObligationLinks)
    .where(eq(slotObligationLinks.templateId, templateId));

  const coveredIds = new Set(mappings.map(m => m.obligationId));
  const covered = obligations.filter(o => coveredIds.has(o.obligationId));
  const uncovered = obligations.filter(o => !coveredIds.has(o.obligationId));

  // Group by jurisdiction
  const byJurisdiction: Record<string, { total: number; covered: number }> = {};
  for (const jur of jurisdictions) {
    const jurObligations = obligations.filter(o => o.jurisdiction === jur);
    const jurCovered = covered.filter(o => o.jurisdiction === jur);
    byJurisdiction[jur] = { total: jurObligations.length, covered: jurCovered.length };
  }

  return {
    coveragePercent: obligations.length > 0 
      ? Math.round((covered.length / obligations.length) * 100) 
      : 100,
    coveredObligations: covered.map(o => o.obligationId),
    uncoveredObligations: uncovered.map(o => ({
      obligationId: o.obligationId,
      title: o.title,
      jurisdiction: o.jurisdiction,
    })),
    byJurisdiction,
  };
}
