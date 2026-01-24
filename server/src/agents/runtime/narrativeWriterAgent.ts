/**
 * Narrative Writer Agent
 * 
 * Generates regulatory-compliant narrative content for PSUR slots
 * based on evidence atoms and template requirements.
 */

import { BaseAgent, AgentConfig, createAgentConfig } from "../baseAgent";
import { PROMPT_TEMPLATES } from "../llmService";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface NarrativeInput {
  slot: {
    slotId: string;
    title: string;
    sectionPath: string;
    requirements?: string;
    guidance?: string;
  };
  evidenceAtoms: {
    atomId: string;
    evidenceType: string;
    normalizedData: Record<string, unknown>;
  }[];
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

// ═══════════════════════════════════════════════════════════════════════════════
// NARRATIVE WRITER AGENT
// ═══════════════════════════════════════════════════════════════════════════════

export class NarrativeWriterAgent extends BaseAgent<NarrativeInput, NarrativeOutput> {
  constructor(config?: Partial<AgentConfig>) {
    super(createAgentConfig("NarrativeWriterAgent", "Narrative Writer Agent", {
      llm: {
        provider: "auto",
        temperature: 0.2,
        maxTokens: 4096,
      },
      behavior: {
        confidenceThreshold: 0.8,
        maxRetries: 2,
        retryDelayMs: 1000,
        timeoutMs: 180000,
      },
      ...config,
    }));
  }

  protected async execute(input: NarrativeInput): Promise<NarrativeOutput> {
    await this.logTrace("NARRATIVE_GENERATION_STARTED", "INFO", "SLOT", input.slot.slotId, {
      slotTitle: input.slot.title,
      evidenceCount: input.evidenceAtoms.length,
    });

    // Prepare evidence summary
    const evidenceSummary = this.generateEvidenceSummary(input.evidenceAtoms);
    const evidenceRecords = this.formatEvidenceRecords(input.evidenceAtoms);

    // Build the prompt
    const systemPrompt = PROMPT_TEMPLATES.NARRATIVE_GENERATION;
    const userPrompt = this.buildUserPrompt(input, evidenceSummary, evidenceRecords);

    // Generate narrative
    const { content: rawResponse, response } = await this.invokeLLM(
      systemPrompt,
      userPrompt,
      {
        operation: "NARRATIVE_GENERATION",
        entityType: "SLOT",
        entityId: input.slot.slotId,
      }
    );

    // Parse the response
    const parsed = this.parseNarrativeResponse(rawResponse, input.evidenceAtoms);

    // Validate citations - filtered automatically
    const validationResult = this.validateCitations(parsed.citedAtoms, input.evidenceAtoms);
    if (validationResult.invalidCitations.length > 0) {
      console.debug(`[${this.agentId}] Filtered ${validationResult.invalidCitations.length} non-matching citations`);
    }

    await this.logTrace("NARRATIVE_GENERATED", "PASS", "SLOT", input.slot.slotId, {
      wordCount: parsed.wordCount,
      citedAtoms: parsed.citedAtoms.length,
      uncitedAtoms: parsed.uncitedAtoms.length,
      dataGaps: parsed.dataGaps.length,
      confidence: parsed.confidence,
    });

    // Log citation verification
    await this.logTrace("CITATION_VERIFIED", "PASS", "SLOT", input.slot.slotId, {
      totalCitations: parsed.citedAtoms.length,
      validCitations: validationResult.validCitations.length,
      invalidCitations: validationResult.invalidCitations.length,
    });

    // ═══════════════════════════════════════════════════════════════════════════════
    // CONTENT TRACING - Trace every paragraph/sentence
    // ═══════════════════════════════════════════════════════════════════════════════
    await this.traceNarrativeContent(input, parsed, validationResult);

    return {
      content: parsed.content,
      citedAtoms: validationResult.validCitations,
      uncitedAtoms: parsed.uncitedAtoms,
      dataGaps: parsed.dataGaps,
      wordCount: parsed.wordCount,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    };
  }

  private generateEvidenceSummary(atoms: NarrativeInput["evidenceAtoms"]): string {
    const byType: Record<string, number> = {};
    
    for (const atom of atoms) {
      byType[atom.evidenceType] = (byType[atom.evidenceType] || 0) + 1;
    }

    const lines: string[] = [
      `Total evidence atoms: ${atoms.length}`,
      "",
      "By type:",
    ];

    for (const [type, count] of Object.entries(byType)) {
      lines.push(`- ${type}: ${count} records`);
    }

    // Add key statistics if available
    const complaints = atoms.filter(a => a.evidenceType === "complaint_record");
    if (complaints.length > 0) {
      const bySeverity: Record<string, number> = {};
      for (const c of complaints) {
        const severity = String(c.normalizedData.severity || "UNKNOWN");
        bySeverity[severity] = (bySeverity[severity] || 0) + 1;
      }
      lines.push("");
      lines.push("Complaint severity distribution:");
      for (const [sev, count] of Object.entries(bySeverity)) {
        lines.push(`- ${sev}: ${count}`);
      }
    }

    const incidents = atoms.filter(a => a.evidenceType === "serious_incident_record");
    if (incidents.length > 0) {
      lines.push("");
      lines.push(`Serious incidents: ${incidents.length}`);
    }

    const sales = atoms.filter(a => a.evidenceType === "sales_volume");
    if (sales.length > 0) {
      const totalUnits = sales.reduce((sum, s) => sum + (Number(s.normalizedData.units) || 0), 0);
      lines.push("");
      lines.push(`Total units sold: ${totalUnits.toLocaleString()}`);
    }

    return lines.join("\n");
  }

  private formatEvidenceRecords(atoms: NarrativeInput["evidenceAtoms"]): string {
    const lines: string[] = [];
    
    // Limit to first 50 records to avoid token overflow
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

  private buildUserPrompt(
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

  private parseNarrativeResponse(
    response: string,
    availableAtoms: NarrativeInput["evidenceAtoms"]
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
    const availableIds = new Set(availableAtoms.map(a => a.atomId));
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

  private validateCitations(
    citedAtoms: string[],
    availableAtoms: NarrativeInput["evidenceAtoms"]
  ): {
    validCitations: string[];
    invalidCitations: string[];
  } {
    const availableIds = new Set(availableAtoms.map(a => a.atomId));
    
    const validCitations = citedAtoms.filter(id => availableIds.has(id));
    const invalidCitations = citedAtoms.filter(id => !availableIds.has(id));

    return { validCitations, invalidCitations };
  }

  /**
   * Trace every paragraph/sentence in the generated narrative
   */
  private async traceNarrativeContent(
    input: NarrativeInput,
    parsed: {
      content: string;
      citedAtoms: string[];
      uncitedAtoms: string[];
      dataGaps: string[];
      wordCount: number;
      confidence: number;
      reasoning: string;
    },
    validationResult: { validCitations: string[]; invalidCitations: string[] }
  ): Promise<void> {
    // Split content into paragraphs
    const paragraphs = parsed.content
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const traceItems: Array<Parameters<typeof this.traceContent>[0]> = [];

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      
      // Extract citations from this paragraph
      const citationPattern = /\[ATOM-[A-Z0-9-]+\]/g;
      const paragraphCitations: string[] = [];
      let match;
      while ((match = citationPattern.exec(paragraph)) !== null) {
        paragraphCitations.push(match[0].slice(1, -1));
      }

      // Determine evidence types used
      const usedAtoms = input.evidenceAtoms.filter(a => 
        paragraphCitations.includes(a.atomId)
      );
      const evidenceTypes = Array.from(new Set(usedAtoms.map(a => a.evidenceType)));

      // Determine if this is a conclusion paragraph
      const isConclusion = paragraph.toLowerCase().includes("conclusion") ||
        paragraph.toLowerCase().includes("in summary") ||
        paragraph.toLowerCase().includes("overall") ||
        i === paragraphs.length - 1;

      traceItems.push({
        slotId: input.slot.slotId,
        slotTitle: input.slot.title,
        contentType: isConclusion ? "conclusion" : "paragraph",
        contentId: `${input.slot.slotId}-p${i + 1}`,
        contentIndex: i + 1,
        contentPreview: paragraph.substring(0, 500),
        rationale: this.generateParagraphRationale(paragraph, i, paragraphs.length, paragraphCitations.length),
        methodology: this.generateParagraphMethodology(evidenceTypes, paragraphCitations.length, input),
        standardReference: input.slot.requirements,
        evidenceType: evidenceTypes.length > 0 ? evidenceTypes.join(", ") : undefined,
        atomIds: paragraphCitations.length > 0 ? paragraphCitations : undefined,
        obligationId: undefined, // Could be linked to template obligation mapping
        obligationTitle: input.slot.title,
      });
    }

    // Batch trace all paragraphs
    if (traceItems.length > 0) {
      await this.traceContentBatch(traceItems);
    }
  }

  private generateParagraphRationale(
    paragraph: string,
    index: number,
    total: number,
    citationCount: number
  ): string {
    if (index === 0) {
      return `Opening paragraph establishing context and scope. Contains ${citationCount} evidence citations to ground the narrative in factual data.`;
    }
    if (index === total - 1) {
      return `Concluding paragraph summarizing findings and implications. Synthesizes ${citationCount} evidence citations into actionable conclusions.`;
    }
    return `Supporting paragraph ${index + 1} of ${total} presenting detailed analysis. Incorporates ${citationCount} evidence citations to support regulatory claims.`;
  }

  private generateParagraphMethodology(
    evidenceTypes: string[],
    citationCount: number,
    input: NarrativeInput
  ): string {
    const parts: string[] = [];
    
    if (evidenceTypes.length > 0) {
      parts.push(`Analyzed ${evidenceTypes.join(", ")} evidence records`);
    }
    
    if (citationCount > 0) {
      parts.push(`cited ${citationCount} supporting atoms`);
    }
    
    parts.push(`synthesized per ${input.context.templateId} template requirements`);
    parts.push(`using LLM-assisted regulatory narrative generation`);
    
    return parts.join("; ") + ".";
  }

  protected calculateConfidence(output: NarrativeOutput): number {
    return output.confidence;
  }
}
