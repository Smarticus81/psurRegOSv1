/**
 * Base Narrative Agent
 * 
 * Foundation for all section-specific narrative agents.
 * Provides common functionality for PSUR narrative generation.
 * 
 * Uses 5-layer prompt architecture:
 * - Layer 1: Agent Persona (WHO)
 * - Layer 2: System Prompt (WHAT) - loaded from DATABASE ONLY
 * - Layer 3: Template Field Instructions (HOW)
 * - Layer 4: Agent Role Context (SEMANTIC) - workflow position, relationships, GRKB obligations
 * - Layer 5: Device Dossier Context (SPECIFICS) - rich device context for non-generic content
 * 
 * SINGLE SOURCE OF TRUTH: All prompts come from the database.
 * Visit System Instructions page to manage prompts.
 */

import { BaseAgent, AgentConfig, AgentContext, createAgentConfig } from "../../baseAgent";
import { createTraceBuilder } from "../../../services/compileTraceRepository";
import { composeSystemMessage } from "../../promptLayers";
import { getPromptTemplate } from "../../llmService";
import { getDossierContext, type DossierContext } from "../../../services/deviceDossierService";
import { buildAgentRoleContext, formatAgentRoleContextForPrompt, type AgentRoleContext } from "../../../services/agentRoleContextService";
import { formatAnalyticsForSlot, type PSURAnalyticsContext } from "../../../psur/psurAnalyticsContext";

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
    psurCaseId?: number; // Required for canonical metrics lookup
  };
  previousSections?: {
    slotId: string;
    summary: string;
  }[];
  /** Pre-computed analytics from deterministic PSUR engines */
  analyticsContext?: PSURAnalyticsContext;
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

  // Subclasses can override to provide a prompt key for DB lookup
  protected get promptKey(): string {
    return `${this.sectionType}_SYSTEM`;
  }

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

  /**
   * Get the composed system message using 3-layer architecture
   * 
   * SINGLE SOURCE OF TRUTH: Prompt must exist in the database.
   * Visit System Instructions page to manage prompts.
   */
  protected async getComposedSystemMessage(): Promise<string> {
    // Get prompt from database - this is the ONLY source
    const systemPrompt = await getPromptTemplate(this.promptKey);

    if (!systemPrompt) {
      throw new Error(
        `[${this.config.agentType}] Prompt '${this.promptKey}' not found in database. ` +
        `Visit System Instructions page to seed prompts, or ensure the prompt exists.`
      );
    }

    // Compose with persona and field instructions
    return composeSystemMessage(this.config.agentType, systemPrompt, this.sectionType);
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

    // Fetch device dossier context for non-generic content generation
    const dossierContext = await this.fetchDossierContext(input);

    await this.logTrace("DOSSIER_CONTEXT_LOADED", "INFO", "SLOT", input.slot.slotId, {
      completenessScore: dossierContext.completenessScore,
      hasClinicalBenefits: dossierContext.clinicalBenefits.length > 0,
      hasRiskThresholds: !!dossierContext.riskThresholds,
      hasPriorPsur: !!dossierContext.priorPsurConclusion,
    });

    // Fetch Agent Role Context for semantic understanding
    const agentRoleContext = await this.fetchAgentRoleContext(input);

    await this.logTrace("AGENT_ROLE_CONTEXT_LOADED", "INFO", "SLOT", input.slot.slotId, {
      workflowPosition: agentRoleContext.workflowPosition.sectionNumber,
      phase: agentRoleContext.workflowPosition.phase,
      criticalPath: agentRoleContext.workflowPosition.criticalPath,
      grkbObligations: agentRoleContext.grkbObligations.length,
      upstreamSections: agentRoleContext.sectionRelationships.filter(r => r.relationship === "upstream").length,
    });

    // Check for data gaps
    const gaps = this.identifyGaps(input);
    for (const gap of gaps) {
      trace.addGap(gap);
    }

    // Generate evidence summary
    const evidenceSummary = this.generateEvidenceSummary(input.evidenceAtoms);
    const evidenceRecords = this.formatEvidenceRecords(input.evidenceAtoms);

    // Build the prompt with dossier context AND agent role context
    let userPrompt = this.buildUserPrompt(input, evidenceSummary, evidenceRecords, dossierContext, agentRoleContext);

    // Inject pre-computed analytics from deterministic engines
    if (input.analyticsContext) {
      const analyticsBlock = formatAnalyticsForSlot(input.slot.slotId, input.analyticsContext);
      if (analyticsBlock.length > 50) {
        userPrompt += `\n\n${analyticsBlock}`;
        await this.logTrace("ANALYTICS_INJECTED", "INFO", "SLOT", input.slot.slotId, {
          analyticsLength: analyticsBlock.length,
          hasComplaint: !!input.analyticsContext.complaintAnalysis,
          hasVigilance: !!input.analyticsContext.vigilanceAnalysis,
          hasSales: !!input.analyticsContext.salesExposure,
          hasLiterature: !!input.analyticsContext.literatureAnalysis,
          hasPMCF: !!input.analyticsContext.pmcfDecision,
        });
      }
    }

    // Get composed system message (3-layer architecture)
    const systemMessage = await this.getComposedSystemMessage();

    // Generate narrative using LLM
    const { content: rawResponse, response } = await this.invokeLLM(
      systemMessage,
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

    // Validate citations - filtered out automatically, log only for debugging
    const validationResult = this.validateCitations(parsed.citedAtoms, input.evidenceAtoms);
    if (validationResult.invalidCitations.length > 0) {
      // Only log in debug mode - these are being filtered correctly
      console.debug(`[${this.agentId}] Filtered ${validationResult.invalidCitations.length} non-matching citations`);
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
  // DOSSIER CONTEXT - Rich device-specific context for non-generic content
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Fetch device dossier context for enriching prompts.
   * Subclasses can override to customize context fetching.
   */
  protected async fetchDossierContext(input: NarrativeInput): Promise<DossierContext> {
    return getDossierContext(
      input.context.deviceCode,
      input.context.periodStart,
      input.context.periodEnd
    );
  }

  /**
   * Fetch agent role context for semantic understanding.
   * Provides workflow position, section relationships, GRKB obligations, etc.
   */
  protected async fetchAgentRoleContext(input: NarrativeInput): Promise<AgentRoleContext> {
    return buildAgentRoleContext(
      input.slot.slotId,
      input.context.deviceCode,
      input.context.periodStart,
      input.context.periodEnd,
      input.context.templateId
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHODS - Must be implemented by subclasses
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Identify data gaps specific to this section type
   */
  protected abstract identifyGaps(input: NarrativeInput): string[];

  /**
   * Build section-specific user prompt with dossier context and agent role context.
   * 
   * Subclasses should override this to include section-specific context.
   * The dossierContext parameter provides rich device-specific information
   * that should be used to generate non-generic, device-appropriate content.
   * The agentRoleContext provides semantic understanding of workflow position.
   */
  protected buildUserPrompt(
    input: NarrativeInput,
    evidenceSummary: string,
    evidenceRecords: string,
    dossierContext?: DossierContext,
    agentRoleContext?: AgentRoleContext
  ): string {
    // Build list of actual atom IDs for reference
    const atomIdList = input.evidenceAtoms.slice(0, 20).map(a => a.atomId).join(", ");

    // Build dossier section - use dossier if available, otherwise rely on canonical evidence
    let dossierSection = "";
    if (dossierContext?.dossierExists) {
      dossierSection = this.formatDossierContextForPrompt(dossierContext);
    } else {
      // Generate context from canonical evidence data
      const evidenceTypeCounts = input.evidenceAtoms.reduce((acc, atom) => {
        acc[atom.evidenceType] = (acc[atom.evidenceType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const typeBreakdown = Object.entries(evidenceTypeCounts)
        .map(([type, count]) => `- ${type}: ${count} records`)
        .join("\n");

      dossierSection = `## CANONICAL EVIDENCE DATA ANALYSIS

No device dossier is configured. Generate this narrative section based ENTIRELY 
on the canonical evidence data provided below.

### Evidence Summary (${input.evidenceAtoms.length} total records):
${typeBreakdown}

### Analysis Instructions:
1. READ AND ANALYZE ALL EVIDENCE RECORDS THOROUGHLY
2. Extract key findings, trends, and metrics from the normalizedData fields
3. Cite specific evidence by atomId when making claims
4. Report actual numbers and statistics from the data
5. Do not fabricate data - only report what is present in the evidence
6. If data is missing for a required topic, explicitly state the gap

The evidence data below is AUTHORITATIVE and COMPLETE for this reporting period.`;
    }

    // Format agent role context for semantic understanding
    const agentRoleSection = agentRoleContext
      ? formatAgentRoleContextForPrompt(agentRoleContext)
      : "";

    const deviceName = input.context.deviceName || input.context.deviceCode;

    return `Generate the "${input.slot.title}" section for the PSUR.

## DATA:
- Device: ${deviceName}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}
- Requirements: ${input.slot.requirements || "Generate appropriate content based on evidence"}

${agentRoleSection}

${dossierSection}

## Evidence Summary:
${evidenceSummary}

## Evidence Records:
${evidenceRecords}

Be concise and factual. State data directly. Use tables for structured data. Do not cite regulations.`;
  }

  /**
   * Format dossier context for inclusion in the prompt.
   * Subclasses can override to customize which dossier sections are included.
   */
  protected formatDossierContextForPrompt(dossier: DossierContext): string {
    const sections: string[] = [];

    if (dossier.productSummary) sections.push(dossier.productSummary);
    if (dossier.clinicalContext) sections.push(dossier.clinicalContext);
    if (dossier.riskContext) sections.push(dossier.riskContext);
    if (dossier.priorPsurContext) sections.push(dossier.priorPsurContext);
    if (dossier.baselineContext) sections.push(dossier.baselineContext);

    return sections.join("\n\n");
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
    const limitedAtoms = atoms.slice(0, 100);

    for (const atom of limitedAtoms) {
      // Make atom ID prominent - this is the ID to cite
      lines.push(`EVIDENCE RECORD - Citable ID: ${atom.atomId}`);
      lines.push(`Type: ${atom.evidenceType}`);

      const keyFields = Object.entries(atom.normalizedData)
        .filter(([k, v]) => v && !["raw_data"].includes(k))
        .slice(0, 8)
        .map(([k, v]) => `  ${k}: ${String(v).substring(0, 200)}`);

      lines.push(...keyFields);
      lines.push("---");
    }

    if (atoms.length > 100) {
      lines.push(`... and ${atoms.length - 100} more records`);
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
    const citationPattern = /\[ATOM-[A-Za-z0-9_-]+\]/g;
    const citedInContent: string[] = [];
    let match;
    while ((match = citationPattern.exec(content)) !== null) {
      citedInContent.push(match[0].slice(1, -1).replace("ATOM-", ""));
    }

    // Merge with metadata citations
    const allCitedSet = new Set([...citedInContent, ...(metadata.citedAtoms || [])]);
    let allCited = Array.from(allCitedSet);

    // Filter out placeholder citations (like ATOM-001, ATOM-002, ATOM-xxx, etc.)
    // Valid atom IDs are typically UUIDs or longer alphanumeric strings
    allCited = allCited.filter(id => {
      // Remove "ATOM-" prefix if present
      const cleanId = id.replace(/^ATOM-/i, "");
      // Filter out obvious placeholders
      if (/^0*\d{1,3}$/.test(cleanId)) return false; // 001, 002, etc.
      if (/^x+$/i.test(cleanId)) return false; // xxx
      if (cleanId.length < 8) return false; // Too short to be real
      return true;
    });

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
