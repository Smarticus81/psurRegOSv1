/**
 * Base Narrative Agent
 * 
 * Foundation for all section-specific narrative agents.
 * Provides common functionality for PSUR narrative generation.
 */

import { BaseAgent, AgentConfig, AgentContext, createAgentConfig } from "../../baseAgent";
import { createTraceBuilder } from "../../../services/compileTraceRepository";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface NarrativeSlotInput {
  slotId: string;
  title: string;
  sectionPath: string;
  requirements?: string;
  guidance?: string;
}

export interface NarrativeEvidenceAtom {
  atomId: string;
  evidenceType: string;
  normalizedData: Record<string, unknown>;
}

export interface NarrativeInput {
  slot: NarrativeSlotInput;
  evidenceAtoms: NarrativeEvidenceAtom[];
  context: {
    deviceCode: string;
    deviceName?: string;
    periodStart: string;
    periodEnd: string;
    templateId: string;
  };
  previousSections?: {
    slotId: string;
    summary: string;
  }[];
}

export interface NarrativeOutput {
  content: string;
  citedAtoms: string[];
  uncitedAtoms: string[];
  dataGaps: string[];
  wordCount: number;
  confidence: number;
  reasoning: string;
}

export interface NarrativeAgentContext extends AgentContext {
  slotId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BASE NARRATIVE AGENT
// ═══════════════════════════════════════════════════════════════════════════════

export abstract class BaseNarrativeAgent extends BaseAgent<NarrativeInput, NarrativeOutput> {
  protected abstract readonly sectionType: string;
  protected abstract readonly systemPrompt: string;

  constructor(
    agentType: string,
    agentName: string,
    config?: Partial<AgentConfig>
  ) {
    super(createAgentConfig(agentType, agentName, {
      llm: {
        provider: "auto",
        temperature: 0.2,
        maxTokens: 4096,
      },
      behavior: {
        confidenceThreshold: 0.7,
        maxRetries: 2,
        retryDelayMs: 1000,
        timeoutMs: 180000,
      },
      ...config,
    }));
  }

  protected async execute(input: NarrativeInput): Promise<NarrativeOutput> {
    const ctx = this.context as NarrativeAgentContext;
    
    // Create trace builder
    const trace = createTraceBuilder(
      ctx.psurCaseId,
      this.agentId,
      this.config.agentType,
      "NARRATIVE"
    );
    trace.setSlot(input.slot.slotId);
    trace.setInput({
      slotTitle: input.slot.title,
      evidenceCount: input.evidenceAtoms.length,
      evidenceTypes: Array.from(new Set(input.evidenceAtoms.map(a => a.evidenceType))),
    });

    await this.logTrace("NARRATIVE_GENERATION_STARTED", "INFO", "SLOT", input.slot.slotId, {
      slotTitle: input.slot.title,
      sectionType: this.sectionType,
      evidenceCount: input.evidenceAtoms.length,
    });

    // Check for data gaps
    const gaps = this.identifyGaps(input);
    for (const gap of gaps) {
      trace.addGap(gap);
    }

    // Generate evidence summary
    const evidenceSummary = this.generateEvidenceSummary(input.evidenceAtoms);
    const evidenceRecords = this.formatEvidenceRecords(input.evidenceAtoms);

    // Build the prompt
    const userPrompt = this.buildUserPrompt(input, evidenceSummary, evidenceRecords);

    // Generate narrative using LLM
    const { content: rawResponse, response } = await this.invokeLLM(
      this.systemPrompt,
      userPrompt,
      {
        operation: `NARRATIVE_${this.sectionType}`,
        entityType: "SLOT",
        entityId: input.slot.slotId,
      }
    );

    // Update trace with LLM metrics
    trace.setLLMMetrics({
      calls: 1,
      tokens: response.usage.totalTokens,
      cost: response.cost || 0,
      model: response.model,
    });

    // Parse the response
    const parsed = this.parseNarrativeResponse(rawResponse, input.evidenceAtoms);

    // Validate citations
    const validationResult = this.validateCitations(parsed.citedAtoms, input.evidenceAtoms);
    if (validationResult.invalidCitations.length > 0) {
      this.addWarning(`Invalid citations: ${validationResult.invalidCitations.join(", ")}`);
      trace.addWarning(`Invalid citations detected: ${validationResult.invalidCitations.length}`);
    }

    // Set output and commit trace
    trace.setOutput({
      wordCount: parsed.wordCount,
      citedAtoms: parsed.citedAtoms.length,
      uncitedAtoms: parsed.uncitedAtoms.length,
      dataGaps: parsed.dataGaps.length,
      confidence: parsed.confidence,
    });
    trace.addEvidence(validationResult.validCitations);

    await trace.commit(
      parsed.confidence >= 0.7 ? "PASS" : "PARTIAL",
      parsed.confidence,
      parsed.reasoning
    );

    await this.logTrace("NARRATIVE_GENERATED", "PASS", "SLOT", input.slot.slotId, {
      wordCount: parsed.wordCount,
      citedAtoms: parsed.citedAtoms.length,
      confidence: parsed.confidence,
    });

    return {
      content: parsed.content,
      citedAtoms: validationResult.validCitations,
      uncitedAtoms: parsed.uncitedAtoms,
      dataGaps: [...gaps, ...parsed.dataGaps],
      wordCount: parsed.wordCount,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHODS - Must be implemented by subclasses
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Identify data gaps specific to this section type
   */
  protected abstract identifyGaps(input: NarrativeInput): string[];

  /**
   * Build section-specific user prompt
   */
  protected buildUserPrompt(
    input: NarrativeInput,
    evidenceSummary: string,
    evidenceRecords: string
  ): string {
    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Section Requirements: ${input.slot.requirements || "Generate appropriate content based on evidence"}
## Template Guidance: ${input.slot.guidance || "Follow regulatory best practices"}

## Device Context:
- Device Code: ${input.context.deviceCode}
- Device Name: ${input.context.deviceName || "N/A"}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  protected generateEvidenceSummary(atoms: NarrativeEvidenceAtom[]): string {
    const byType: Record<string, number> = {};
    
    for (const atom of atoms) {
      byType[atom.evidenceType] = (byType[atom.evidenceType] || 0) + 1;
    }

    const lines: string[] = [
      `Total evidence atoms: ${atoms.length}`,
      "",
      "By type:",
    ];

    for (const type of Object.keys(byType)) {
      lines.push(`- ${type}: ${byType[type]} records`);
    }

    return lines.join("\n");
  }

  protected formatEvidenceRecords(atoms: NarrativeEvidenceAtom[]): string {
    const lines: string[] = [];
    const limitedAtoms = atoms.slice(0, 50);
    
    for (const atom of limitedAtoms) {
      lines.push(`[${atom.atomId}] (${atom.evidenceType})`);
      
      const keyFields = Object.entries(atom.normalizedData)
        .filter(([k, v]) => v && !["raw_data"].includes(k))
        .slice(0, 8)
        .map(([k, v]) => `  ${k}: ${String(v).substring(0, 100)}`);
      
      lines.push(...keyFields);
      lines.push("");
    }

    if (atoms.length > 50) {
      lines.push(`... and ${atoms.length - 50} more records`);
    }

    return lines.join("\n");
  }

  protected parseNarrativeResponse(
    response: string,
    availableAtoms: NarrativeEvidenceAtom[]
  ): {
    content: string;
    citedAtoms: string[];
    uncitedAtoms: string[];
    dataGaps: string[];
    wordCount: number;
    confidence: number;
    reasoning: string;
  } {
    // Extract JSON block from response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
    
    let metadata = {
      citedAtoms: [] as string[],
      uncitedAtoms: [] as string[],
      dataGaps: [] as string[],
      confidence: 0.8,
      reasoning: "",
    };

    if (jsonMatch) {
      try {
        metadata = JSON.parse(jsonMatch[1]);
      } catch (e) {
        this.addWarning("Failed to parse narrative metadata JSON");
      }
    }

    // Extract narrative content (everything before the JSON block)
    let content = response;
    if (jsonMatch) {
      content = response.substring(0, response.indexOf("```json")).trim();
    }

    // Extract citations from content
    const citationPattern = /\[ATOM-[A-Z0-9-]+\]/g;
    const citedInContent: string[] = [];
    let match;
    while ((match = citationPattern.exec(content)) !== null) {
      citedInContent.push(match[0].slice(1, -1));
    }
    
    // Merge with metadata citations
    const allCitedSet = new Set([...citedInContent, ...(metadata.citedAtoms || [])]);
    const allCited = Array.from(allCitedSet);
    
    // Find uncited atoms
    const uncited = availableAtoms
      .filter(a => !allCited.includes(a.atomId))
      .map(a => a.atomId);

    return {
      content,
      citedAtoms: allCited,
      uncitedAtoms: uncited,
      dataGaps: metadata.dataGaps || [],
      wordCount: content.split(/\s+/).length,
      confidence: metadata.confidence || 0.8,
      reasoning: metadata.reasoning || "Generated based on available evidence",
    };
  }

  protected validateCitations(
    citedAtoms: string[],
    availableAtoms: NarrativeEvidenceAtom[]
  ): {
    validCitations: string[];
    invalidCitations: string[];
  } {
    const availableIds = new Set(availableAtoms.map(a => a.atomId));
    
    const validCitations = citedAtoms.filter(id => availableIds.has(id));
    const invalidCitations = citedAtoms.filter(id => !availableIds.has(id));

    return { validCitations, invalidCitations };
  }

  protected calculateConfidence(output: NarrativeOutput): number {
    return output.confidence;
  }
}
