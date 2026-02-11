/**
 * SOTA GRKB Grounding Service
 * 
 * State-of-the-art template-to-obligation grounding using:
 * 1. Semantic embeddings for intelligent matching
 * 2. Strict validation gate that blocks on uncovered mandatory obligations
 * 3. Confidence scoring with manual override support
 * 4. Full audit trail with decision tracing
 * 
 * This replaces the old keyword-based matching system.
 */

import { db } from "../../db";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  grkbObligations,
  slotDefinitions,
  slotObligationLinks,
  decisionTraceEntries,
  type GrkbObligation,
  type InsertDecisionTraceEntry,
} from "@shared/schema";
import { v4 as uuidv4 } from "uuid";
import { embed, complete, type LLMResponse } from "../agents/llmService";
import { createHash } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SlotInput {
  slot_id: string;
  slot_name: string;
  description?: string;
  evidence_requirements?: string[];
  regulatory_reference?: string;
  required: boolean;
  data_type: string;
}

export interface ObligationMatch {
  obligationId: string;
  obligationTitle: string;
  jurisdiction: string;
  confidence: number;
  matchMethod: "semantic" | "evidence_type" | "regulatory_ref" | "llm_analysis" | "manual";
  reasoning: string;
}

export interface SlotGroundingResult {
  slotId: string;
  slotName: string;
  matches: ObligationMatch[];
  bestMatch: ObligationMatch | null;
  isGrounded: boolean;
  manualOverride: boolean;
}

export interface GroundingValidationResult {
  status: "PASS" | "BLOCKED" | "WARNING";
  templateId: string;
  jurisdictions: string[];
  totalObligations: number;
  coveredObligations: string[];
  uncoveredObligations: UncoveredObligation[];
  slotResults: SlotGroundingResult[];
  complianceScore: number;
  blockingErrors: string[];
  warnings: string[];
  traceId: string;
}

export interface UncoveredObligation {
  obligationId: string;
  title: string;
  jurisdiction: string;
  mandatory: boolean;
  sourceCitation: string | null;
  reason: string;
}

export interface ManualMappingUpdate {
  slotId: string;
  obligationIds: string[];
  reason: string;
  updatedBy: string;
}

// Embedding cache to avoid repeated API calls
const embeddingCache = new Map<string, number[]>();

// ═══════════════════════════════════════════════════════════════════════════════
// SOTA GROUNDING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export class SOTAGroundingEngine {
  private traceId: string;
  private sequenceNum: number = 0;

  constructor(traceId?: string) {
    this.traceId = traceId || uuidv4();
  }

  /**
   * Ground template slots to GRKB obligations using semantic matching
   */
  async groundTemplate(
    templateId: string,
    slots: SlotInput[],
    jurisdictions: string[] = ["EU_MDR", "UK_MDR"],
    options: {
      useLLMAnalysis?: boolean;
      confidenceThreshold?: number;
      strictMode?: boolean;
    } = {}
  ): Promise<GroundingValidationResult> {
    const {
      useLLMAnalysis = true,
      confidenceThreshold = 0.6,
      strictMode = true,
    } = options;

    console.log(`[SOTAGroundingEngine] Starting grounding for ${templateId} with ${slots.length} slots`);

    // Fetch all mandatory obligations for the jurisdictions
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

    console.log(`[SOTAGroundingEngine] Found ${obligations.length} mandatory GRKB obligations`);

    // Pre-compute embeddings for all obligations
    const obligationEmbeddings = await this.computeObligationEmbeddings(obligations);

    // Process each slot
    const slotResults: SlotGroundingResult[] = [];
    const coveredObligationIds = new Set<string>();

    for (const slot of slots) {
      const result = await this.groundSlot(
        slot,
        obligations,
        obligationEmbeddings,
        {
          useLLMAnalysis,
          confidenceThreshold,
        }
      );

      slotResults.push(result);

      // Track covered obligations
      for (const match of result.matches) {
        if (match.confidence >= confidenceThreshold) {
          coveredObligationIds.add(match.obligationId);
        }
      }
    }

    // Identify uncovered obligations
    const uncoveredObligations: UncoveredObligation[] = [];
    for (const obl of obligations) {
      if (!coveredObligationIds.has(obl.obligationId)) {
        uncoveredObligations.push({
          obligationId: obl.obligationId,
          title: obl.title,
          jurisdiction: obl.jurisdiction,
          mandatory: obl.mandatory,
          sourceCitation: obl.sourceCitation,
          reason: "No template slot matches this obligation with sufficient confidence",
        });
      }
    }

    // Calculate compliance score
    const complianceScore = obligations.length > 0
      ? Math.round((coveredObligationIds.size / obligations.length) * 100)
      : 100;

    // Determine status
    const blockingErrors: string[] = [];
    const warnings: string[] = [];

    if (strictMode && uncoveredObligations.length > 0) {
      const mandatoryUncovered = uncoveredObligations.filter(o => o.mandatory);
      if (mandatoryUncovered.length > 0) {
        blockingErrors.push(
          `BLOCKED: ${mandatoryUncovered.length} mandatory obligations are not covered by any template slot`
        );
        for (const obl of mandatoryUncovered.slice(0, 5)) {
          blockingErrors.push(`  - ${obl.obligationId}: ${obl.title}`);
        }
        if (mandatoryUncovered.length > 5) {
          blockingErrors.push(`  ... and ${mandatoryUncovered.length - 5} more`);
        }
      }
    }

    if (uncoveredObligations.length > 0 && !strictMode) {
      warnings.push(`${uncoveredObligations.length} obligations not covered (non-blocking mode)`);
    }

    const ungroundedSlots = slotResults.filter(r => !r.isGrounded);
    if (ungroundedSlots.length > 0) {
      warnings.push(`${ungroundedSlots.length} slots could not be matched to any GRKB obligation`);
    }

    const status = blockingErrors.length > 0 
      ? "BLOCKED" 
      : warnings.length > 0 
        ? "WARNING" 
        : "PASS";

    // Save mappings to database
    await this.saveMappings(templateId, slotResults, confidenceThreshold);

    // Trace the grounding result
    await this.trace({
      eventType: "TEMPLATE_GROUNDING_COMPLETE",
      actor: "SOTAGroundingEngine",
      entityType: "template",
      entityId: templateId,
      decision: status,
      humanSummary: `Template grounding ${status}: ${coveredObligationIds.size}/${obligations.length} obligations covered (${complianceScore}%)`,
      outputData: {
        totalSlots: slots.length,
        groundedSlots: slotResults.filter(r => r.isGrounded).length,
        totalObligations: obligations.length,
        coveredObligations: coveredObligationIds.size,
        uncoveredObligations: uncoveredObligations.length,
        complianceScore,
      },
      regulatoryContext: {
        jurisdictions,
        mandatory: true,
      },
      templateId,
    });

    return {
      status,
      templateId,
      jurisdictions,
      totalObligations: obligations.length,
      coveredObligations: Array.from(coveredObligationIds),
      uncoveredObligations,
      slotResults,
      complianceScore,
      blockingErrors,
      warnings,
      traceId: this.traceId,
    };
  }

  /**
   * Ground a single slot using multiple matching strategies
   */
  private async groundSlot(
    slot: SlotInput,
    obligations: GrkbObligation[],
    obligationEmbeddings: Map<string, number[]>,
    options: {
      useLLMAnalysis?: boolean;
      confidenceThreshold?: number;
    }
  ): Promise<SlotGroundingResult> {
    const { useLLMAnalysis = true, confidenceThreshold = 0.6 } = options;
    const matches: ObligationMatch[] = [];

    // Strategy 1: Evidence type matching (highest precision)
    const evidenceMatches = await this.matchByEvidenceTypes(slot, obligations);
    matches.push(...evidenceMatches);

    // Strategy 2: Regulatory reference matching
    const regRefMatches = await this.matchByRegulatoryReference(slot, obligations);
    matches.push(...regRefMatches);

    // Strategy 3: Semantic embedding similarity
    const semanticMatches = await this.matchBySemantic(slot, obligations, obligationEmbeddings);
    matches.push(...semanticMatches);

    // Strategy 4: LLM-based analysis for complex cases
    if (useLLMAnalysis && matches.filter(m => m.confidence >= confidenceThreshold).length === 0) {
      const llmMatches = await this.matchByLLMAnalysis(slot, obligations);
      matches.push(...llmMatches);
    }

    // Deduplicate and sort by confidence
    const uniqueMatches = this.deduplicateMatches(matches);
    const sortedMatches = uniqueMatches.sort((a, b) => b.confidence - a.confidence);

    const bestMatch = sortedMatches.length > 0 && sortedMatches[0].confidence >= confidenceThreshold
      ? sortedMatches[0]
      : null;

    return {
      slotId: slot.slot_id,
      slotName: slot.slot_name,
      matches: sortedMatches.slice(0, 10), // Keep top 10 matches
      bestMatch,
      isGrounded: bestMatch !== null,
      manualOverride: false,
    };
  }

  /**
   * Match by evidence type overlap (most reliable)
   */
  private async matchByEvidenceTypes(
    slot: SlotInput,
    obligations: GrkbObligation[]
  ): Promise<ObligationMatch[]> {
    if (!slot.evidence_requirements || slot.evidence_requirements.length === 0) {
      return [];
    }

    const slotTypes = new Set(slot.evidence_requirements);
    const matches: ObligationMatch[] = [];

    for (const obl of obligations) {
      const oblTypes = (obl.requiredEvidenceTypes as string[]) || [];
      if (oblTypes.length === 0) continue;

      const overlap = oblTypes.filter(t => slotTypes.has(t));
      if (overlap.length === 0) continue;

      // Calculate confidence based on overlap percentage
      const overlapPercent = overlap.length / Math.max(slotTypes.size, oblTypes.length);
      const confidence = Math.min(0.95, 0.5 + (overlapPercent * 0.45));

      matches.push({
        obligationId: obl.obligationId,
        obligationTitle: obl.title,
        jurisdiction: obl.jurisdiction,
        confidence,
        matchMethod: "evidence_type",
        reasoning: `Evidence type overlap: ${overlap.join(", ")} (${Math.round(overlapPercent * 100)}% match)`,
      });
    }

    return matches;
  }

  /**
   * Match by regulatory reference citation
   */
  private async matchByRegulatoryReference(
    slot: SlotInput,
    obligations: GrkbObligation[]
  ): Promise<ObligationMatch[]> {
    if (!slot.regulatory_reference) {
      return [];
    }

    const slotRef = slot.regulatory_reference.toLowerCase();
    const matches: ObligationMatch[] = [];

    for (const obl of obligations) {
      if (!obl.sourceCitation) continue;

      const oblRef = obl.sourceCitation.toLowerCase();
      
      // Check for exact or partial citation match
      if (oblRef.includes(slotRef) || slotRef.includes(oblRef)) {
        const confidence = oblRef === slotRef ? 0.95 : 0.8;
        matches.push({
          obligationId: obl.obligationId,
          obligationTitle: obl.title,
          jurisdiction: obl.jurisdiction,
          confidence,
          matchMethod: "regulatory_ref",
          reasoning: `Regulatory reference match: "${obl.sourceCitation}"`,
        });
      }

      // Check for article/section number match
      const articleMatch = this.extractArticleNumbers(slotRef);
      const oblArticleMatch = this.extractArticleNumbers(oblRef);
      if (articleMatch.length > 0 && oblArticleMatch.some(a => articleMatch.includes(a))) {
        matches.push({
          obligationId: obl.obligationId,
          obligationTitle: obl.title,
          jurisdiction: obl.jurisdiction,
          confidence: 0.75,
          matchMethod: "regulatory_ref",
          reasoning: `Article/Section number match: ${articleMatch.join(", ")}`,
        });
      }
    }

    return matches;
  }

  /**
   * Match using semantic embeddings
   */
  private async matchBySemantic(
    slot: SlotInput,
    obligations: GrkbObligation[],
    obligationEmbeddings: Map<string, number[]>
  ): Promise<ObligationMatch[]> {
    // Create slot text for embedding
    const slotText = `${slot.slot_name}. ${slot.description || ""}. Evidence types: ${slot.evidence_requirements?.join(", ") || "none"}`;
    
    let slotEmbedding: number[];
    try {
      slotEmbedding = await this.getEmbedding(slotText);
    } catch (error) {
      console.warn(`[SOTAGroundingEngine] Failed to get embedding for slot ${slot.slot_id}:`, error);
      return [];
    }

    const matches: ObligationMatch[] = [];

    for (const obl of obligations) {
      const oblEmbedding = obligationEmbeddings.get(obl.obligationId);
      if (!oblEmbedding) continue;

      const similarity = this.cosineSimilarity(slotEmbedding, oblEmbedding);
      
      // Only include if similarity is meaningful
      if (similarity >= 0.5) {
        // Map similarity to confidence (0.5-1.0 similarity → 0.4-0.85 confidence)
        const confidence = 0.4 + (similarity - 0.5) * 0.9;
        
        matches.push({
          obligationId: obl.obligationId,
          obligationTitle: obl.title,
          jurisdiction: obl.jurisdiction,
          confidence,
          matchMethod: "semantic",
          reasoning: `Semantic similarity: ${Math.round(similarity * 100)}%`,
        });
      }
    }

    return matches;
  }

  /**
   * Match using LLM analysis for complex cases
   */
  private async matchByLLMAnalysis(
    slot: SlotInput,
    obligations: GrkbObligation[]
  ): Promise<ObligationMatch[]> {
    // Select top candidate obligations based on partial matches
    const candidateObligations = obligations.slice(0, 15);

    const systemPrompt = `You are an EU MDR/UK MDR regulatory compliance expert. Your task is to match template slots to regulatory obligations.

Analyze the template slot and identify which regulatory obligations it satisfies.

Return your response as a JSON array of matches with the following structure:
[
  {
    "obligationId": "string",
    "confidence": number between 0 and 1,
    "reasoning": "brief explanation"
  }
]

Only include obligations with confidence >= 0.5. Be precise and conservative in your matching.`;

    const userPrompt = `## Template Slot
- ID: ${slot.slot_id}
- Name: ${slot.slot_name}
- Description: ${slot.description || "N/A"}
- Evidence Types Required: ${slot.evidence_requirements?.join(", ") || "N/A"}
- Regulatory Reference: ${slot.regulatory_reference || "N/A"}

## Candidate Regulatory Obligations
${candidateObligations.map((o, i) => `
${i + 1}. ${o.obligationId}
   Title: ${o.title}
   Text: ${o.text}
   Jurisdiction: ${o.jurisdiction}
   Source: ${o.sourceCitation || "N/A"}
   Required Evidence: ${(o.requiredEvidenceTypes as string[] || []).join(", ") || "N/A"}
`).join("\n")}

Identify which obligations this slot satisfies. Return ONLY the JSON array.`;

    try {
      const response = await complete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        config: {
          model: "gpt-4o-mini",
          temperature: 0.1,
          maxTokens: 2000,
        },
        responseFormat: "json",
      });

      const parsed = JSON.parse(response.content);
      if (!Array.isArray(parsed)) return [];

      const matches: ObligationMatch[] = [];
      for (const match of parsed) {
        const obl = candidateObligations.find(o => o.obligationId === match.obligationId);
        if (obl && typeof match.confidence === "number" && match.confidence >= 0.5) {
          matches.push({
            obligationId: obl.obligationId,
            obligationTitle: obl.title,
            jurisdiction: obl.jurisdiction,
            confidence: Math.min(0.85, match.confidence), // Cap LLM confidence at 0.85
            matchMethod: "llm_analysis",
            reasoning: match.reasoning || "LLM-identified match",
          });
        }
      }

      return matches;
    } catch (error) {
      console.warn(`[SOTAGroundingEngine] LLM analysis failed for slot ${slot.slot_id}:`, error);
      return [];
    }
  }

  /**
   * Pre-compute embeddings for all obligations
   */
  private async computeObligationEmbeddings(
    obligations: GrkbObligation[]
  ): Promise<Map<string, number[]>> {
    const embeddings = new Map<string, number[]>();

    for (const obl of obligations) {
      const oblText = `${obl.title}. ${obl.text}. Required evidence: ${(obl.requiredEvidenceTypes as string[] || []).join(", ")}`;
      
      try {
        const embedding = await this.getEmbedding(oblText);
        embeddings.set(obl.obligationId, embedding);
      } catch (error) {
        console.warn(`[SOTAGroundingEngine] Failed to get embedding for obligation ${obl.obligationId}`);
      }
    }

    console.log(`[SOTAGroundingEngine] Computed embeddings for ${embeddings.size}/${obligations.length} obligations`);
    return embeddings;
  }

  /**
   * Get embedding with caching
   */
  private async getEmbedding(text: string): Promise<number[]> {
    const cacheKey = createHash("md5").update(text).digest("hex");
    
    if (embeddingCache.has(cacheKey)) {
      return embeddingCache.get(cacheKey)!;
    }

    const embedding = await embed(text);
    embeddingCache.set(cacheKey, embedding);
    return embedding;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Extract article/section numbers from regulatory text
   */
  private extractArticleNumbers(text: string): string[] {
    const patterns = [
      /article\s*(\d+)/gi,
      /art\.\s*(\d+)/gi,
      /section\s*(\d+)/gi,
      /annex\s*([IVX]+|\d+)/gi,
    ];

    const numbers: string[] = [];
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        numbers.push(match[1].toLowerCase());
      }
    }

    return [...new Set(numbers)];
  }

  /**
   * Deduplicate matches by obligation ID, keeping highest confidence
   */
  private deduplicateMatches(matches: ObligationMatch[]): ObligationMatch[] {
    const byObligation = new Map<string, ObligationMatch>();
    
    for (const match of matches) {
      const existing = byObligation.get(match.obligationId);
      if (!existing || match.confidence > existing.confidence) {
        byObligation.set(match.obligationId, match);
      }
    }
    
    return Array.from(byObligation.values());
  }

  /**
   * Save grounding mappings to database
   */
  private async saveMappings(
    templateId: string,
    slotResults: SlotGroundingResult[],
    confidenceThreshold: number
  ): Promise<void> {
    // Clear existing mappings for this template
    await db
      .delete(slotObligationLinks)
      .where(eq(slotObligationLinks.templateId, templateId));

    // Insert new mappings
    const links: any[] = [];
    for (const result of slotResults) {
      for (const match of result.matches) {
        if (match.confidence >= confidenceThreshold) {
          links.push({
            templateId,
            slotId: result.slotId,
            obligationId: match.obligationId,
            confidence: Math.round(match.confidence * 100),
            matchMethod: match.matchMethod,
            reasoning: match.reasoning,
            isManualOverride: result.manualOverride,
          });
        }
      }
    }

    if (links.length > 0) {
      await db.insert(slotObligationLinks).values(links).onConflictDoNothing();
    }

    console.log(`[SOTAGroundingEngine] Saved ${links.length} slot-obligation mappings for ${templateId}`);
  }

  /**
   * Apply manual mapping overrides
   */
  async applyManualMappings(
    templateId: string,
    updates: ManualMappingUpdate[]
  ): Promise<void> {
    for (const update of updates) {
      // Remove existing mappings for this slot
      await db
        .delete(slotObligationLinks)
        .where(
          and(
            eq(slotObligationLinks.templateId, templateId),
            eq(slotObligationLinks.slotId, update.slotId)
          )
        );

      // Insert new manual mappings
      const links = update.obligationIds.map(oblId => ({
        templateId,
        slotId: update.slotId,
        obligationId: oblId,
        confidence: 100, // Manual = 100% confidence
        matchMethod: "manual" as const,
        reasoning: update.reason,
        isManualOverride: true,
        updatedBy: update.updatedBy,
      }));

      if (links.length > 0) {
        await db.insert(slotObligationLinks).values(links);
      }

      // Trace the manual override
      await this.trace({
        eventType: "MANUAL_MAPPING_APPLIED",
        actor: update.updatedBy,
        entityType: "slot",
        entityId: update.slotId,
        decision: "OVERRIDE",
        humanSummary: `Manual mapping applied: ${update.slotId} → [${update.obligationIds.join(", ")}]`,
        outputData: {
          slotId: update.slotId,
          obligationIds: update.obligationIds,
          reason: update.reason,
        },
        templateId,
      });
    }
  }

  private async trace(data: Partial<InsertDecisionTraceEntry>): Promise<void> {
    const hash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");

    try {
      await db.insert(decisionTraceEntries).values({
        traceId: this.traceId,
        sequenceNum: ++this.sequenceNum,
        eventTimestamp: new Date(),
        contentHash: hash,
        jurisdictions: data.regulatoryContext?.jurisdictions || ["EU_MDR"],
        ...data,
      } as any);
    } catch (error) {
      console.warn("[SOTAGroundingEngine] Failed to save trace:", error);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION GATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate template coverage against GRKB obligations
 * This is the hard gate that blocks workflow if mandatory obligations are missing
 */
export async function validateTemplateGrkbCoverage(
  templateId: string,
  jurisdictions: string[]
): Promise<{
  valid: boolean;
  status: "PASS" | "BLOCKED" | "WARNING";
  coveredObligations: string[];
  uncoveredObligations: UncoveredObligation[];
  complianceScore: number;
  report: string;
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

  const coveredObligationIds = new Set(mappings.map(m => m.obligationId));
  const uncoveredObligations: UncoveredObligation[] = [];

  for (const obl of obligations) {
    if (!coveredObligationIds.has(obl.obligationId)) {
      uncoveredObligations.push({
        obligationId: obl.obligationId,
        title: obl.title,
        jurisdiction: obl.jurisdiction,
        mandatory: obl.mandatory,
        sourceCitation: obl.sourceCitation,
        reason: "No template slot mapped to this obligation",
      });
    }
  }

  const complianceScore = obligations.length > 0
    ? Math.round((coveredObligationIds.size / obligations.length) * 100)
    : 100;

  const status = uncoveredObligations.length === 0
    ? "PASS"
    : uncoveredObligations.some(o => o.mandatory)
      ? "BLOCKED"
      : "WARNING";

  const reportLines = [
    `=== GRKB Coverage Report for ${templateId} ===`,
    `Jurisdictions: ${jurisdictions.join(", ")}`,
    `Total Mandatory Obligations: ${obligations.length}`,
    `Covered: ${coveredObligationIds.size}`,
    `Uncovered: ${uncoveredObligations.length}`,
    `Compliance Score: ${complianceScore}%`,
    `Status: ${status}`,
    "",
  ];

  if (uncoveredObligations.length > 0) {
    reportLines.push("Uncovered Obligations:");
    for (const obl of uncoveredObligations) {
      reportLines.push(`  - [${obl.jurisdiction}] ${obl.obligationId}: ${obl.title}`);
    }
  }

  return {
    valid: status !== "BLOCKED",
    status,
    coveredObligations: Array.from(coveredObligationIds),
    uncoveredObligations,
    complianceScore,
    report: reportLines.join("\n"),
  };
}

/**
 * Get template grounding status with details
 */
export async function getTemplateGroundingStatus(
  templateId: string
): Promise<{
  templateId: string;
  totalMappings: number;
  mappingsByMethod: Record<string, number>;
  slotCoverage: { slotId: string; obligationCount: number; methods: string[] }[];
  lastUpdated: Date | null;
}> {
  const mappings = await db
    .select()
    .from(slotObligationLinks)
    .where(eq(slotObligationLinks.templateId, templateId));

  const byMethod: Record<string, number> = {};
  const bySlot: Record<string, { obligationCount: number; methods: Set<string> }> = {};

  for (const mapping of mappings) {
    const method = mapping.matchMethod || "unknown";
    byMethod[method] = (byMethod[method] || 0) + 1;

    if (!bySlot[mapping.slotId]) {
      bySlot[mapping.slotId] = { obligationCount: 0, methods: new Set() };
    }
    bySlot[mapping.slotId].obligationCount++;
    bySlot[mapping.slotId].methods.add(method);
  }

  return {
    templateId,
    totalMappings: mappings.length,
    mappingsByMethod: byMethod,
    slotCoverage: Object.entries(bySlot).map(([slotId, data]) => ({
      slotId,
      obligationCount: data.obligationCount,
      methods: Array.from(data.methods),
    })),
    lastUpdated: mappings.length > 0 ? new Date() : null,
  };
}

// Export singleton instance creator
export function createSOTAGroundingEngine(traceId?: string): SOTAGroundingEngine {
  return new SOTAGroundingEngine(traceId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MDCG 2022-21 ENHANCED GROUNDING
// Integrates Annex II, III, and IV validation into template grounding
// ═══════════════════════════════════════════════════════════════════════════════

import { 
  createMDCGValidationService, 
  type DeviceClassification,
  type AnnexIVRequirements,
  type MDCGComplianceReport 
} from "./mdcgValidationService";

export interface MDCGEnhancedGroundingOptions {
  deviceClassification: DeviceClassification;
  useLLMAnalysis?: boolean;
  confidenceThreshold?: number;
  strictMode?: boolean;
  validateAnnexCompliance?: boolean;
}

export interface MDCGEnhancedGroundingResult extends GroundingValidationResult {
  mdcgCompliance: {
    annexIIScore: number;
    annexIIIScore: number;
    annexIVCompliant: boolean;
    mandatoryTables: string[];
    timeBuckets: string[];
    frequency: string;
    eudamedRequired: boolean;
  };
  deviceRequirements: AnnexIVRequirements;
  mdcgValidationReport?: MDCGComplianceReport;
}

/**
 * Enhanced grounding engine with MDCG 2022-21 Annex II, III, and IV integration
 */
export class MDCGEnhancedGroundingEngine {
  private sotaEngine: SOTAGroundingEngine;
  private mdcgService: ReturnType<typeof createMDCGValidationService>;
  private traceId: string;

  constructor(traceId?: string) {
    this.traceId = traceId || uuidv4();
    this.sotaEngine = new SOTAGroundingEngine(this.traceId);
    this.mdcgService = createMDCGValidationService(this.traceId);
  }

  /**
   * Ground template with MDCG 2022-21 compliance validation
   */
  async groundTemplateWithMDCG(
    templateId: string,
    slots: SlotInput[],
    jurisdictions: string[] = ["EU_MDR"],
    options: MDCGEnhancedGroundingOptions
  ): Promise<MDCGEnhancedGroundingResult> {
    const {
      deviceClassification,
      useLLMAnalysis = true,
      confidenceThreshold = 0.6,
      strictMode = true,
      validateAnnexCompliance = true,
    } = options;

    console.log(`[MDCGEnhancedGroundingEngine] Starting MDCG-enhanced grounding for ${templateId}`);
    console.log(`[MDCGEnhancedGroundingEngine] Device class: ${deviceClassification.deviceClass}, Implantable: ${deviceClassification.isImplantable}`);

    // Get device requirements from Annex IV
    const deviceRequirements = this.mdcgService.getRequirementsForDevice(deviceClassification);
    console.log(`[MDCGEnhancedGroundingEngine] Device requirements: ${deviceRequirements.frequency}, EUDAMED: ${deviceRequirements.eudamedSubmission}`);

    // Run standard SOTA grounding
    const groundingResult = await this.sotaEngine.groundTemplate(
      templateId,
      slots,
      jurisdictions,
      { useLLMAnalysis, confidenceThreshold, strictMode }
    );

    // Extract evidence types from slots
    const evidenceTypes = [...new Set(slots.flatMap(s => s.evidence_requirements || []))];

    // Validate against MDCG Annex II (table requirements)
    const annexIIResult = await this.mdcgService.validateAnnexII(
      templateId,
      deviceClassification,
      slots.map(s => s.slot_id),
      evidenceTypes
    );

    // LLM-powered template mapping validation
    let annexIIIScore = 0;
    if (validateAnnexCompliance && useLLMAnalysis) {
      const mappingValidation = await this.mdcgService.validateTemplateMappingWithLLM(
        templateId,
        slots.map(s => ({
          slotId: s.slot_id,
          title: s.slot_name,
          description: s.description,
          evidenceTypes: s.evidence_requirements || [],
        })),
        deviceClassification
      );
      annexIIIScore = mappingValidation.annexCompliance.annexIII;

      // Add mapping issues to warnings
      if (mappingValidation.mappingIssues.length > 0) {
        groundingResult.warnings.push(...mappingValidation.mappingIssues);
      }
    }

    // Check if mandatory Annex II tables are covered
    const missingMandatoryTables = deviceRequirements.mandatoryTables.filter(
      table => !annexIIResult.tablesCovered.includes(table)
    );

    if (strictMode && missingMandatoryTables.length > 0) {
      groundingResult.blockingErrors.push(
        `MDCG 2022-21 Annex II: Missing mandatory tables for ${deviceClassification.deviceClass}: ${missingMandatoryTables.join(", ")}`
      );
      groundingResult.status = "BLOCKED";
    }

    // Enhance result with MDCG compliance data
    const enhancedResult: MDCGEnhancedGroundingResult = {
      ...groundingResult,
      mdcgCompliance: {
        annexIIScore: annexIIResult.score,
        annexIIIScore,
        annexIVCompliant: missingMandatoryTables.length === 0,
        mandatoryTables: deviceRequirements.mandatoryTables,
        timeBuckets: deviceRequirements.timeBuckets,
        frequency: deviceRequirements.frequency,
        eudamedRequired: deviceRequirements.eudamedSubmission,
      },
      deviceRequirements,
    };

    // Recalculate compliance score with MDCG weighting
    const mdcgWeight = 0.3; // 30% weight for MDCG compliance
    const standardWeight = 0.7; // 70% weight for standard obligation coverage
    enhancedResult.complianceScore = Math.round(
      (groundingResult.complianceScore * standardWeight) +
      (annexIIResult.score * mdcgWeight)
    );

    console.log(`[MDCGEnhancedGroundingEngine] Enhanced compliance score: ${enhancedResult.complianceScore}%`);
    console.log(`[MDCGEnhancedGroundingEngine] MDCG Annex II: ${annexIIResult.score}%, Annex III: ${annexIIIScore}%`);

    return enhancedResult;
  }

  /**
   * Validate PSUR content against MDCG 2022-21 requirements
   */
  async validatePSURContent(
    templateId: string,
    deviceClassification: DeviceClassification,
    psurContent: {
      sections: { id: string; title: string; content: string }[];
      tables: { id: string; data: any }[];
      methodology?: string;
      conclusions?: string;
    },
    psurInfo: {
      psurNumber: number;
      reportingPeriodStart: Date;
      reportingPeriodEnd: Date;
      submissionDate?: Date;
      isEudamedSubmitted?: boolean;
    },
    evidenceTypes: string[]
  ): Promise<MDCGComplianceReport> {
    const slots = psurContent.sections.map(s => s.id);
    
    return this.mdcgService.validateFullCompliance(
      templateId,
      deviceClassification,
      psurContent,
      psurInfo,
      slots,
      evidenceTypes
    );
  }
}

/**
 * Create MDCG-enhanced grounding engine
 */
export function createMDCGEnhancedGroundingEngine(traceId?: string): MDCGEnhancedGroundingEngine {
  return new MDCGEnhancedGroundingEngine(traceId);
}

/**
 * Get PSUR requirements for a device classification
 */
export function getDevicePSURRequirements(device: DeviceClassification): AnnexIVRequirements {
  const service = createMDCGValidationService();
  return service.getRequirementsForDevice(device);
}
