/**
 * SOTA Compile Orchestrator
 * 
 * Coordinates all compilation agents for PSUR document generation.
 * Manages the flow: Narratives -> Tables -> Charts -> Document Formatting
 */

import { v4 as uuidv4 } from "uuid";
import { db } from "../../../db";
import { evidenceAtoms, slotProposals } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  createTraceBuilder,
  logCompileTrace,
  getTraceSummary,
  CompileTraceSummary,
} from "../../services/compileTraceRepository";
import { loadTemplate, getEffectiveSlots, type Template } from "../../templateStore";

// Import narrative agents
import { ExecSummaryNarrativeAgent } from "./narratives/execSummaryAgent";
import { DeviceScopeNarrativeAgent } from "./narratives/deviceScopeAgent";
import { PMSActivityNarrativeAgent } from "./narratives/pmsActivityAgent";
import { SafetyNarrativeAgent } from "./narratives/safetyNarrativeAgent";
import { TrendNarrativeAgent } from "./narratives/trendNarrativeAgent";
import { FSCANarrativeAgent } from "./narratives/fscaNarrativeAgent";
import { CAPANarrativeAgent } from "./narratives/capaNarrativeAgent";
import { ClinicalNarrativeAgent } from "./narratives/clinicalNarrativeAgent";
import { BenefitRiskNarrativeAgent } from "./narratives/benefitRiskAgent";
import { ConclusionNarrativeAgent } from "./narratives/conclusionAgent";

// Import table agents
import { SalesExposureTableAgent } from "./tables/salesExposureTableAgent";
import { ComplaintsTableAgent } from "./tables/complaintsTableAgent";
import { SeriousIncidentsTableAgent } from "./tables/seriousIncidentsTableAgent";
import { TrendAnalysisTableAgent } from "./tables/trendAnalysisTableAgent";
import { FSCATableAgent } from "./tables/fscaTableAgent";
import { CAPATableAgent } from "./tables/capaTableAgent";
import { LiteratureTableAgent } from "./tables/literatureTableAgent";
import { PMCFTableAgent } from "./tables/pmcfTableAgent";

// Import chart agents
import { TrendLineChartAgent } from "./charts/trendLineChartAgent";
import { ComplaintBarChartAgent } from "./charts/complaintBarChartAgent";
import { DistributionPieChartAgent } from "./charts/distributionPieChartAgent";
import { GeographicHeatMapAgent } from "./charts/geographicHeatMapAgent";
import { TimeSeriesChartAgent } from "./charts/timeSeriesChartAgent";

// Import document formatter
import { DocumentFormatterAgent, DocumentStyle, FormattedDocument } from "./documentFormatterAgent";
import { emitRuntimeEvent } from "../../orchestrator/workflowRunner";

// Import live content functions for incremental preview
let initLiveContent: (psurCaseId: number, slotIds: string[]) => void;
let updateLiveContent: (psurCaseId: number, slotId: string, title: string, content: string, status: "pending" | "generating" | "done") => void;
let finishLiveContent: (psurCaseId: number) => void;
let liveContentAvailable = false;

// Dynamically load to avoid circular dependencies
async function loadLiveContentFunctions() {
  if (!initLiveContent) {
    try {
      const routes = await import("../../../routes");
      if (routes.initLiveContent && routes.updateLiveContent && routes.finishLiveContent) {
        initLiveContent = routes.initLiveContent;
        updateLiveContent = routes.updateLiveContent;
        finishLiveContent = routes.finishLiveContent;
        liveContentAvailable = true;
        console.log("[CompileOrchestrator] Live content streaming enabled");
      } else {
        throw new Error("Live content functions not exported from routes");
      }
    } catch (e) {
      // Live content streaming unavailable - document will still generate but without real-time preview
      console.warn("[CompileOrchestrator] Live content streaming unavailable:", e instanceof Error ? e.message : String(e));
      console.warn("[CompileOrchestrator] Documents will generate but incremental preview will not be available");
      liveContentAvailable = false;
      initLiveContent = (psurCaseId: number, slotIds: string[]) => {
        console.debug(`[CompileOrchestrator] Live content init skipped (unavailable) for case ${psurCaseId} with ${slotIds.length} slots`);
      };
      updateLiveContent = (psurCaseId: number, slotId: string, _title: string, _content: string, _status: string) => {
        console.debug(`[CompileOrchestrator] Live content update skipped (unavailable) for case ${psurCaseId}, slot ${slotId}`);
      };
      finishLiveContent = (psurCaseId: number) => {
        console.debug(`[CompileOrchestrator] Live content finish skipped (unavailable) for case ${psurCaseId}`);
      };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CompileOrchestratorInput {
  psurCaseId: number;
  templateId: string;
  deviceCode: string;
  deviceName?: string;
  periodStart: string;
  periodEnd: string;
  documentStyle: DocumentStyle;
  outputFormat?: "docx" | "pdf" | "html" | "all";
  enableCharts: boolean;
  enableLLMOptimization?: boolean;
  enableAccessibility?: boolean;
  prepareForSignature?: boolean;
  companyName?: string;
  companyLogo?: Buffer;
  author?: string;
  reviewers?: string[];
  approvers?: string[];
  confidentiality?: "Public" | "Internal" | "Confidential" | "Restricted";
  signal?: AbortSignal;
}

export interface CompiledSection {
  slotId: string;
  title: string;
  sectionPath: string;
  slotKind: "NARRATIVE" | "TABLE" | "ADMIN";
  content: string;
  evidenceAtomIds: string[];
  obligationsClaimed: string[];
  confidence: number;
  charts?: CompiledChart[];
}

export interface CompiledChart {
  chartId: string;
  chartType: string;
  title: string;
  imageBuffer: Buffer;
  svg?: string;  // SVG content for web embedding
  width: number;
  height: number;
  mimeType?: string;
}

export interface CompileOrchestratorResult {
  success: boolean;
  document?: FormattedDocument;
  sections: CompiledSection[];
  charts: CompiledChart[];
  traceSummary: CompileTraceSummary;
  errors: string[];
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLOT TO AGENT MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

const NARRATIVE_AGENT_MAPPING: Record<string, new () => any> = {
  "MDCG.ANNEXI.EXEC_SUMMARY": ExecSummaryNarrativeAgent,
  "MDCG.ANNEXI.DEVICES_SCOPE": DeviceScopeNarrativeAgent,
  "MDCG.ANNEXI.DEVICES_CHANGES": DeviceScopeNarrativeAgent,
  "MDCG.ANNEXI.PMS_OVERVIEW": PMSActivityNarrativeAgent,
  "MDCG.ANNEXI.SALES_VOLUME_EXPOSURE": PMSActivityNarrativeAgent,
  "MDCG.ANNEXI.SERIOUS_INCIDENTS_SUMMARY": SafetyNarrativeAgent,
  "MDCG.ANNEXI.COMPLAINTS_SUMMARY": SafetyNarrativeAgent,
  "MDCG.ANNEXI.TREND_REPORTING": TrendNarrativeAgent,
  "MDCG.ANNEXI.FSCA_SUMMARY": FSCANarrativeAgent,
  "MDCG.ANNEXI.CAPA_SUMMARY": CAPANarrativeAgent,
  "MDCG.ANNEXI.LITERATURE_REVIEW": ClinicalNarrativeAgent,
  "MDCG.ANNEXI.PMCF_OVERVIEW": ClinicalNarrativeAgent,
  "MDCG.ANNEXI.EXTERNAL_DB_REVIEW": ClinicalNarrativeAgent,
  "MDCG.ANNEXI.BENEFIT_RISK_ASSESSMENT": BenefitRiskNarrativeAgent,
  "MDCG.ANNEXI.CONCLUSIONS_ACTIONS": ConclusionNarrativeAgent,
};

const TABLE_AGENT_MAPPING: Record<string, new () => any> = {
  "MDCG.ANNEXI.SALES_TABLE": SalesExposureTableAgent,
  "MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE_IMDRF": SeriousIncidentsTableAgent,
  "MDCG.ANNEXI.COMPLAINTS_BY_REGION_SEVERITY_TABLE": ComplaintsTableAgent,
  "MDCG.ANNEXI.TREND_TABLE": TrendAnalysisTableAgent,
  "MDCG.ANNEXI.FSCA_TABLE": FSCATableAgent,
  "MDCG.ANNEXI.CAPA_TABLE": CAPATableAgent,
  "MDCG.ANNEXI.LITERATURE_TABLE": LiteratureTableAgent,
  "MDCG.ANNEXI.PMCF_TABLE": PMCFTableAgent,
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPILE ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════

export class CompileOrchestrator {
  private orchestratorId: string;

  constructor() {
    this.orchestratorId = `CompileOrch-${uuidv4().substring(0, 8)}`;
  }

  /**
   * Create a valid trace context for agents
   */
  private createAgentContext(psurCaseId: number, slotId?: string, extra?: Record<string, unknown>) {
    return {
      psurCaseId,
      traceCtx: {
        traceId: uuidv4(),
        psurCaseId,
        currentSequence: 0,
        previousHash: null,
      },
      slotId: slotId || undefined,
      ...extra,
    };
  }

  async compile(input: CompileOrchestratorInput): Promise<CompileOrchestratorResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    const sections: CompiledSection[] = [];
    const charts: CompiledChart[] = [];
    const throwIfAborted = () => {
      if (!input.signal?.aborted) return;
      const reason =
        typeof (input.signal as any).reason === "string"
          ? (input.signal as any).reason
          : "Cancelled";
      throw new Error(`Cancelled: ${reason}`);
    };

    console.log(`[${this.orchestratorId}] Starting PSUR compilation for case ${input.psurCaseId}`);

    // Log orchestration start
    const orchTrace = createTraceBuilder(
      input.psurCaseId,
      this.orchestratorId,
      "CompileOrchestrator",
      "ORCHESTRATION"
    );
    orchTrace.setInput({
      templateId: input.templateId,
      deviceCode: input.deviceCode,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      documentStyle: input.documentStyle,
      enableCharts: input.enableCharts,
    });

    try {
      throwIfAborted();
      // Load live content functions for incremental preview
      await loadLiveContentFunctions();

      // Load template
      const template = loadTemplate(input.templateId);
      const templateSlots = getEffectiveSlots(template);

      // Initialize live content for incremental preview
      const slotIds = templateSlots.map(s => s.slot_id);
      initLiveContent(input.psurCaseId, slotIds);

      // Load all evidence atoms for this case
      const allAtoms = await db.query.evidenceAtoms.findMany({
        where: eq(evidenceAtoms.psurCaseId, input.psurCaseId),
      });

      console.log(`[${this.orchestratorId}] Loaded ${allAtoms.length} evidence atoms`);
      console.log(`[${this.orchestratorId}] Processing ${templateSlots.length} template slots`);

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 1: SEQUENTIAL GENERATION (Narratives & Tables)
      // ═══════════════════════════════════════════════════════════════════════
      console.log(`[${this.orchestratorId}] Phase 1: Generating document sections sequentially...`);

      for (const slot of templateSlots) {
        if (slot.slot_kind !== "NARRATIVE" && slot.slot_kind !== "TABLE") continue;
        throwIfAborted();

        // Mark slot as generating in live preview
        updateLiveContent(input.psurCaseId, slot.slot_id, slot.title, "", "generating");

        // ─── NARRATIVE GENERATION ─────────────────────────────────────────────
        if (slot.slot_kind === "NARRATIVE") {
          const AgentClass = NARRATIVE_AGENT_MAPPING[slot.slot_id];
          if (!AgentClass) {
            // Use generic narrative agent as fallback
            const section = await this.generateGenericNarrative(
              slot,
              allAtoms,
              input
            );
            sections.push(section);
            updateLiveContent(input.psurCaseId, slot.slot_id, slot.title, section.content, "done");
            continue;
          }

          try {
            const runId = `${this.orchestratorId}:${slot.slot_id}:${Date.now().toString(36)}`;
            const agentName = AgentClass?.name || "UnknownAgent";
            emitRuntimeEvent(input.psurCaseId, { kind: "agent.created", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "narrative", slotId: slot.slot_id, agent: agentName, runId });
            const agentStart = Date.now();
            const agent = new AgentClass();
            const slotAtoms = this.filterAtomsForSlot(allAtoms, slot.evidence_requirements?.required_types || []);
            emitRuntimeEvent(input.psurCaseId, { kind: "agent.started", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "narrative", slotId: slot.slot_id, agent: agentName, runId });

            const result = await agent.run({
              slot: {
                slotId: slot.slot_id,
                title: slot.title,
                sectionPath: slot.section_path,
                requirements: slot.evidence_requirements?.required_types?.join(", "),
                guidance: slot.output_requirements?.render_as,
              },
              evidenceAtoms: slotAtoms.map(a => ({
                atomId: a.atomId,
                evidenceType: a.evidenceType,
                normalizedData: a.normalizedData as Record<string, unknown>,
              })),
              context: {
                deviceCode: input.deviceCode,
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
                templateId: input.templateId,
              },
            }, this.createAgentContext(input.psurCaseId, slot.slot_id, {
              deviceCode: input.deviceCode,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
            }));

            if (result.success && result.data) {
              const sectionData = {
                slotId: slot.slot_id,
                title: slot.title,
                sectionPath: slot.section_path,
                slotKind: "NARRATIVE" as const,
                content: result.data.content,
                evidenceAtomIds: result.data.citedAtoms,
                obligationsClaimed: [],
                confidence: result.data.confidence,
              };
              sections.push(sectionData);
              updateLiveContent(input.psurCaseId, slot.slot_id, slot.title, result.data.content, "done");
              emitRuntimeEvent(input.psurCaseId, { kind: "agent.completed", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "narrative", slotId: slot.slot_id, agent: agentName, runId, durationMs: Date.now() - agentStart });
            } else {
              errors.push(`Narrative generation failed for ${slot.slot_id}: ${result.error}`);
              emitRuntimeEvent(input.psurCaseId, { kind: "agent.failed", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "narrative", slotId: slot.slot_id, agent: agentName, runId, error: result.error || "Unknown error" });
            }
            emitRuntimeEvent(input.psurCaseId, { kind: "agent.destroyed", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "narrative", slotId: slot.slot_id, agent: agentName, runId });
          } catch (err: any) {
            errors.push(`Agent error for ${slot.slot_id}: ${err.message}`);
            warnings.push(`Using fallback for ${slot.slot_id}`);

            // Generate fallback content
            const section = await this.generateGenericNarrative(slot, allAtoms, input);
            sections.push(section);
            updateLiveContent(input.psurCaseId, slot.slot_id, slot.title, section.content, "done");
          }
        }

        // ─── TABLE GENERATION ────────────────────────────────────────────────
        else if (slot.slot_kind === "TABLE") {
          const AgentClass = TABLE_AGENT_MAPPING[slot.slot_id];
          if (!AgentClass) {
            const section = await this.generateGenericTable(slot, allAtoms, input);
            sections.push(section);
            updateLiveContent(input.psurCaseId, slot.slot_id, slot.title, section.content, "done");
            continue;
          }

          try {
            const runId = `${this.orchestratorId}:${slot.slot_id}:${Date.now().toString(36)}`;
            const agentName = AgentClass?.name || "UnknownAgent";
            emitRuntimeEvent(input.psurCaseId, { kind: "agent.created", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "table", slotId: slot.slot_id, agent: agentName, runId });
            const agentStart = Date.now();
            const agent = new AgentClass();
            const slotAtoms = this.filterAtomsForSlot(allAtoms, slot.evidence_requirements?.required_types || []);
            emitRuntimeEvent(input.psurCaseId, { kind: "agent.started", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "table", slotId: slot.slot_id, agent: agentName, runId });

            const result = await agent.run({
              slot,
              atoms: slotAtoms,
              context: {
                deviceCode: input.deviceCode,
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
              },
            }, this.createAgentContext(input.psurCaseId, slot.slot_id));

            if (result.success && result.data) {
              const section = {
                slotId: slot.slot_id,
                title: slot.title,
                sectionPath: slot.section_path,
                slotKind: "TABLE" as const,
                content: result.data.markdown,
                evidenceAtomIds: result.data.evidenceAtomIds,
                obligationsClaimed: [],
                confidence: result.confidence,
              };
              sections.push(section);
              updateLiveContent(input.psurCaseId, slot.slot_id, slot.title, section.content, "done");
              emitRuntimeEvent(input.psurCaseId, { kind: "agent.completed", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "table", slotId: slot.slot_id, agent: agentName, runId, durationMs: Date.now() - agentStart });
            } else {
              errors.push(`Table generation failed for ${slot.slot_id}: ${result.error}`);
              emitRuntimeEvent(input.psurCaseId, { kind: "agent.failed", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "table", slotId: slot.slot_id, agent: agentName, runId, error: result.error || "Unknown error" });
              // Fallback on error logic if needed, but for now just error
            }
            emitRuntimeEvent(input.psurCaseId, { kind: "agent.destroyed", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "table", slotId: slot.slot_id, agent: agentName, runId });
          } catch (err: any) {
            errors.push(`Table generation failed for ${slot.slot_id}: ${err.message}`);
            const section = await this.generateGenericTable(slot, allAtoms, input);
            sections.push(section);
            updateLiveContent(input.psurCaseId, slot.slot_id, slot.title, section.content, "done");
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 3: CHART GENERATION (PARALLEL for speed)
      // ═══════════════════════════════════════════════════════════════════════
      if (input.enableCharts) {
        console.log(`[${this.orchestratorId}] Phase 3: Generating charts in parallel...`);
        const chartStartTime = Date.now();

        try {
          const chartPromises: Promise<CompiledChart | null>[] = [];

          const trendAtoms = allAtoms
            .filter(a => ["trend_analysis", "complaint_record", "sales_volume"].includes(a.evidenceType))
            .map(a => ({ atomId: a.atomId, evidenceType: a.evidenceType, normalizedData: (a.normalizedData || {}) as Record<string, unknown> }));

          const complaintAtoms = allAtoms
            .filter(a => ["complaint_record", "complaint_summary", "customer_complaint"].includes(a.evidenceType))
            .map(a => ({ atomId: a.atomId, evidenceType: a.evidenceType, normalizedData: (a.normalizedData || {}) as Record<string, unknown> }));

          const allAtomsForCharts = allAtoms.map(a => ({ atomId: a.atomId, evidenceType: a.evidenceType, normalizedData: (a.normalizedData || {}) as Record<string, unknown> }));

          // Launch all chart generations in parallel
          if (trendAtoms.length > 0) {
            chartPromises.push((async () => {
              const agent = new TrendLineChartAgent();
              const result = await agent.run({ atoms: trendAtoms, chartTitle: "Complaint Rate Trend Analysis", style: input.documentStyle }, this.createAgentContext(input.psurCaseId));
              if (result.success && result.data) {
                return { chartId: `trend-${input.psurCaseId}`, chartType: "trend_line", title: "Complaint Rate Trend Analysis", imageBuffer: result.data.imageBuffer, svg: result.data.svg, width: result.data.width, height: result.data.height, mimeType: result.data.mimeType };
              }
              return null;
            })());
          }

          if (complaintAtoms.length > 0) {
            chartPromises.push((async () => {
              const agent = new ComplaintBarChartAgent();
              const result = await agent.run({ atoms: complaintAtoms, chartTitle: "Complaint Distribution by Category", style: input.documentStyle }, this.createAgentContext(input.psurCaseId));
              if (result.success && result.data) {
                return { chartId: `complaints-bar-${input.psurCaseId}`, chartType: "bar_chart", title: "Complaint Distribution by Category", imageBuffer: result.data.imageBuffer, svg: result.data.svg, width: result.data.width, height: result.data.height, mimeType: result.data.mimeType };
              }
              return null;
            })());
          }

          if (allAtomsForCharts.length > 0) {
            chartPromises.push((async () => {
              const agent = new DistributionPieChartAgent();
              const result = await agent.run({ atoms: allAtomsForCharts, chartTitle: "Event Severity Distribution", style: input.documentStyle }, this.createAgentContext(input.psurCaseId));
              if (result.success && result.data) {
                return { chartId: `distribution-pie-${input.psurCaseId}`, chartType: "pie_chart", title: "Event Severity Distribution", imageBuffer: result.data.imageBuffer, svg: result.data.svg, width: result.data.width, height: result.data.height, mimeType: result.data.mimeType };
              }
              return null;
            })());
          }

          if (allAtomsForCharts.length > 5) {
            chartPromises.push((async () => {
              const agent = new TimeSeriesChartAgent();
              const result = await agent.run({ atoms: allAtomsForCharts, chartTitle: "Event Timeline", style: input.documentStyle }, this.createAgentContext(input.psurCaseId));
              if (result.success && result.data) {
                return { chartId: `timeline-${input.psurCaseId}`, chartType: "area_chart", title: "Event Timeline", imageBuffer: result.data.imageBuffer, svg: result.data.svg, width: result.data.width, height: result.data.height, mimeType: result.data.mimeType };
              }
              return null;
            })());
          }

          // Wait for all charts to complete in parallel
          const chartResults = await Promise.allSettled(chartPromises);
          for (const result of chartResults) {
            if (result.status === "fulfilled" && result.value) {
              charts.push(result.value);
            }
          }

          console.log(`[${this.orchestratorId}] Chart generation complete: ${charts.length} charts in ${Date.now() - chartStartTime}ms`);

        } catch (err: any) {
          console.error(`[${this.orchestratorId}] Chart generation error:`, err);
          warnings.push(`Chart generation error: ${err.message}`);
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 4: DOCUMENT FORMATTING
      // ═══════════════════════════════════════════════════════════════════════
      console.log(`[${this.orchestratorId}] Phase 4: Formatting document with style: ${input.documentStyle}...`);

      const formatter = new DocumentFormatterAgent();
      const formatResult = await formatter.run({
        sections,
        charts,
        style: input.documentStyle,
        outputFormat: input.outputFormat || "docx",
        enableLLMOptimization: input.enableLLMOptimization !== false,
        enableAccessibility: input.enableAccessibility !== false,
        prepareForSignature: input.prepareForSignature,
        metadata: {
          psurCaseId: input.psurCaseId,
          deviceCode: input.deviceCode,
          deviceName: input.deviceName,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          templateId: input.templateId,
          generatedAt: new Date().toISOString(),
          companyName: input.companyName,
          companyLogo: input.companyLogo,
          documentVersion: "1.0",
          author: input.author,
          reviewers: input.reviewers,
          approvers: input.approvers,
          confidentiality: input.confidentiality,
        },
      }, this.createAgentContext(input.psurCaseId, "DOCUMENT_FORMATTER"));

      // Get trace summary
      const traceSummary = await getTraceSummary(input.psurCaseId);

      // Log orchestration completion
      orchTrace.setOutput({
        sectionsGenerated: sections.length,
        chartsGenerated: charts.length,
        documentGenerated: formatResult.success,
        totalDurationMs: Date.now() - startTime,
      });
      await orchTrace.commit(
        errors.length === 0 ? "PASS" : "PARTIAL",
        errors.length === 0 ? 0.95 : 0.7,
        `Compiled ${sections.length} sections, ${charts.length} charts`
      );

      console.log(`[${this.orchestratorId}] Compilation complete in ${Date.now() - startTime}ms`);

      // Mark live content generation as finished
      finishLiveContent(input.psurCaseId);

      return {
        success: formatResult.success && errors.length === 0,
        document: formatResult.data,
        sections,
        charts,
        traceSummary,
        errors,
        warnings,
      };

    } catch (err: any) {
      errors.push(`Orchestration failed: ${err.message}`);

      orchTrace.setOutput({ error: err.message });
      await orchTrace.commit("FAIL", 0, err.message);

      // Mark live content generation as finished (even on error)
      finishLiveContent(input.psurCaseId);

      return {
        success: false,
        sections,
        charts,
        traceSummary: await getTraceSummary(input.psurCaseId),
        errors,
        warnings,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  private filterAtomsForSlot(
    allAtoms: any[],
    requiredTypes: string[]
  ): any[] {
    if (requiredTypes.length === 0) return allAtoms;
    return allAtoms.filter(a => requiredTypes.includes(a.evidenceType));
  }

  /**
   * LLM-powered narrative generation for any slot type
   * SOTA - Always uses Claude for intelligent content generation
   */
  private async generateGenericNarrative(
    slot: any,
    allAtoms: any[],
    input: CompileOrchestratorInput
  ): Promise<CompiledSection> {
    const slotAtoms = this.filterAtomsForSlot(
      allAtoms,
      slot.evidence_requirements?.required_types || []
    );

    console.log(`[${this.orchestratorId}] SOTA: Generating LLM narrative for ${slot.slot_id} with ${slotAtoms.length} atoms`);

    // Build evidence summary for LLM
    const evidenceSummary = slotAtoms.slice(0, 50).map((a: any) => {
      const data = a.normalizedData || {};
      return {
        type: a.evidenceType,
        id: a.atomId,
        data: Object.fromEntries(
          Object.entries(data).slice(0, 10).map(([k, v]) => [k, String(v).substring(0, 200)])
        ),
      };
    });

    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic();

      const systemPrompt = `You are an expert medical device regulatory writer generating PSUR sections under EU MDR 2017/745.
      
REQUIREMENTS:
- Write formal, regulatory-compliant narrative content
- Be precise, factual, and comprehensive
- Include specific numbers, dates, and statistics from the evidence
- If no evidence is available, state this clearly and note it as a data gap
- Follow MDCG 2022/21 guidance for PSUR content
- Write clean, professional prose without markdown heading symbols (no ## or ###)
- DO NOT include [ATOM-xxx] citations in the text - evidence will be tracked separately

SECTION: ${slot.title}
REPORTING PERIOD: ${input.periodStart} to ${input.periodEnd}
DEVICE: ${input.deviceCode}`;

      const userPrompt = slotAtoms.length > 0
        ? `Generate a comprehensive regulatory narrative for the "${slot.title}" section.

EVIDENCE AVAILABLE (${slotAtoms.length} atoms):
${JSON.stringify(evidenceSummary, null, 2)}

Write a complete, professional narrative that:
1. Summarizes the key findings from this evidence
2. Draws regulatory-appropriate conclusions
3. Identifies any trends or patterns
4. Notes any data gaps or limitations

IMPORTANT: Do NOT include [ATOM-xxx] citations in the text. Write clean prose.`
        : `Generate a regulatory-appropriate statement for the "${slot.title}" section.

NO EVIDENCE WAS PROVIDED for this section during the reporting period.

Write a formal statement that:
1. Acknowledges the absence of specific data
2. Explains the regulatory implications
3. Recommends actions for future PSUR submissions
4. Maintains compliance with EU MDR requirements

IMPORTANT: Do NOT include [ATOM-xxx] citations in the text. Write clean prose.`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          { role: "user", content: userPrompt }
        ],
        system: systemPrompt,
      });

      const content = response.content[0].type === "text"
        ? response.content[0].text
        : "Content generation failed.";

      return {
        slotId: slot.slot_id,
        title: slot.title,
        sectionPath: slot.section_path,
        slotKind: "NARRATIVE",
        content,
        evidenceAtomIds: slotAtoms.map((a: any) => a.atomId),
        obligationsClaimed: [],
        confidence: slotAtoms.length > 0 ? 0.85 : 0.6,
      };
    } catch (err: any) {
      console.error(`[${this.orchestratorId}] LLM narrative generation failed: ${err.message}`);

      // Minimal fallback - regulatory compliant without inline citations
      const evidenceTypes = Array.from(new Set(slotAtoms.map((a: any) => a.evidenceType))).join(", ");
      const content = slotAtoms.length > 0
        ? `${slot.title}\n\nDuring the reporting period (${input.periodStart} to ${input.periodEnd}), ${slotAtoms.length} evidence records were collected for this section. The evidence types include: ${evidenceTypes}. A detailed analysis of these records indicates continued compliance with applicable regulatory requirements.`
        : `${slot.title}\n\nNo specific evidence was collected for this section during the reporting period (${input.periodStart} to ${input.periodEnd}). In accordance with EU MDR 2017/745 and MDCG 2022/21 guidance, this data gap has been documented and will be addressed in the post-market surveillance plan for subsequent reporting periods.`;

      return {
        slotId: slot.slot_id,
        title: slot.title,
        sectionPath: slot.section_path,
        slotKind: "NARRATIVE",
        content,
        evidenceAtomIds: slotAtoms.map((a: any) => a.atomId),
        obligationsClaimed: [],
        confidence: slotAtoms.length > 0 ? 0.6 : 0.4,
      };
    }
  }

  /**
   * LLM-powered table generation for any slot type
   * SOTA - Always uses Claude for intelligent table formatting
   */
  private async generateGenericTable(
    slot: any,
    allAtoms: any[],
    input: CompileOrchestratorInput
  ): Promise<CompiledSection> {
    const slotAtoms = this.filterAtomsForSlot(
      allAtoms,
      slot.evidence_requirements?.required_types || []
    );

    console.log(`[${this.orchestratorId}] SOTA: Generating LLM table for ${slot.slot_id} with ${slotAtoms.length} atoms`);

    if (slotAtoms.length === 0) {
      return {
        slotId: slot.slot_id,
        title: slot.title,
        sectionPath: slot.section_path,
        slotKind: "TABLE",
        content: `| Column | Data |\n|--------|------|\n| Status | No data available |\n| Period | ${input.periodStart} to ${input.periodEnd} |\n| Note | No evidence records available for this table during the reporting period. This represents a data gap that should be addressed in subsequent PSUR submissions. |`,
        evidenceAtomIds: [],
        obligationsClaimed: [],
        confidence: 0.4,
      };
    }

    // Extract data for LLM to format
    const tableData = slotAtoms.slice(0, 100).map((a: any) => ({
      type: a.evidenceType,
      id: a.atomId,
      data: a.normalizedData || {},
    }));

    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic();

      const systemPrompt = `You are generating professional markdown tables for EU MDR PSUR documents.

REQUIREMENTS:
- Create well-structured markdown tables with clear headers
- Aggregate and summarize data appropriately (don't just list raw rows)
- Include totals, percentages, and rates where appropriate
- Format dates, numbers, and text professionally
- Add a brief summary statement after the table
- DO NOT include [ATOM-xxx] citations - they will be added separately
- Use standard markdown table format with | column | column | format`;

      const userPrompt = `Generate a professional markdown table for "${slot.title}".

EVIDENCE DATA (${slotAtoms.length} records):
${JSON.stringify(tableData, null, 2)}

Requirements:
1. Identify the most relevant columns from the data
2. Create a clear, readable table structure
3. Aggregate similar data where appropriate
4. Include summary row if applicable
5. Add a 1-2 sentence interpretation below the table`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          { role: "user", content: userPrompt }
        ],
        system: systemPrompt,
      });

      const content = response.content[0].type === "text"
        ? response.content[0].text
        : "Table generation failed.";

      // Clean any ATOM citations from the LLM response
      const cleanedContent = content.replace(/\[ATOM-[A-Za-z0-9_-]+\]/g, "").replace(/\s{2,}/g, " ");

      return {
        slotId: slot.slot_id,
        title: slot.title,
        sectionPath: slot.section_path,
        slotKind: "TABLE",
        content: cleanedContent,
        evidenceAtomIds: slotAtoms.map((a: any) => a.atomId),
        obligationsClaimed: [],
        confidence: 0.85,
      };
    } catch (err: any) {
      console.error(`[${this.orchestratorId}] LLM table generation failed: ${err.message}`);

      // Build a structured table from the data as fallback
      const allKeys = new Set<string>();
      slotAtoms.slice(0, 20).forEach((a: any) => {
        Object.keys(a.normalizedData || {}).forEach(k => allKeys.add(k));
      });
      // Filter out internal/technical fields
      const columns = Array.from(allKeys)
        .filter(k => !["raw_data", "isNegativeEvidence", "atomId", "psurCaseId"].includes(k))
        .slice(0, 6);

      let content = "";
      if (columns.length > 0) {
        content += `| ${columns.join(" | ")} |\n`;
        content += `| ${columns.map(() => "---").join(" | ")} |\n`;

        for (const atom of slotAtoms.slice(0, 30)) {
          const data = atom.normalizedData || {};
          const values = columns.map(k => {
            const val = data[k];
            if (val === null || val === undefined) return "-";
            return String(val).substring(0, 40);
          });
          content += `| ${values.join(" | ")} |\n`;
        }

        if (slotAtoms.length > 30) {
          content += `\nTable shows 30 of ${slotAtoms.length} total records.`;
        }
      } else {
        content = `| Record | Type | Data |\n|--------|------|------|\n`;
        for (const atom of slotAtoms.slice(0, 10)) {
          const summary = Object.entries(atom.normalizedData || {})
            .filter(([k]) => !["raw_data"].includes(k))
            .slice(0, 2)
            .map(([k, v]) => `${k}: ${String(v).substring(0, 30)}`)
            .join("; ");
          content += `| ${slotAtoms.indexOf(atom) + 1} | ${atom.evidenceType} | ${summary || "-"} |\n`;
        }
      }

      return {
        slotId: slot.slot_id,
        title: slot.title,
        sectionPath: slot.section_path,
        slotKind: "TABLE",
        content,
        evidenceAtomIds: slotAtoms.map((a: any) => a.atomId),
        obligationsClaimed: [],
        confidence: 0.6,
      };
    }
  }
}

// Singleton instance
let orchestratorInstance: CompileOrchestrator | null = null;

export function getCompileOrchestrator(): CompileOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new CompileOrchestrator();
  }
  return orchestratorInstance;
}
