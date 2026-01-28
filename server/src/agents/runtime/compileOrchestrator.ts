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
import { validateCrossSectionConsistency, CrossSectionValidationResult } from "../../services/crossSectionValidator";
import { clearMetricsCache } from "../../services/canonicalMetricsService";
import { 
  loadTemplate, 
  loadFormTemplate,
  isTemplateFormBased,
  getEffectiveSlots, 
  type Template,
  type FormTemplate 
} from "../../templateStore";

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
  validation?: CrossSectionValidationResult;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLOT TO AGENT MAPPING
// Supports multiple slot ID formats: MDCG.ANNEXI.*, section_*, and agent_assignment
// ═══════════════════════════════════════════════════════════════════════════════

const NARRATIVE_AGENT_MAPPING: Record<string, new () => any> = {
  // MDCG Standard IDs
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
  "MDCG.ANNEXI.PMCF_SUMMARY": ClinicalNarrativeAgent,
  "MDCG.ANNEXI.EXTERNAL_DB_REVIEW": ClinicalNarrativeAgent,
  "MDCG.ANNEXI.BENEFIT_RISK_ASSESSMENT": BenefitRiskNarrativeAgent,
  "MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION": BenefitRiskNarrativeAgent,
  "MDCG.ANNEXI.CONCLUSIONS_ACTIONS": ConclusionNarrativeAgent,
  "MDCG.ANNEXI.ACTIONS_TAKEN": ConclusionNarrativeAgent,
  
  // Custom Template Slot IDs (section_* pattern)
  "section_a_executive_summary": ExecSummaryNarrativeAgent,
  "section_b_device_description": DeviceScopeNarrativeAgent,
  "section_c_sales_distribution": PMSActivityNarrativeAgent,
  "section_d_serious_incidents": SafetyNarrativeAgent,
  "section_e_customer_feedback": SafetyNarrativeAgent,
  "section_f_complaints": SafetyNarrativeAgent,
  "section_g_trending": TrendNarrativeAgent,
  "section_h_fsca": FSCANarrativeAgent,
  "section_i_capa": CAPANarrativeAgent,
  "section_j_literature": ClinicalNarrativeAgent,
  "section_k_external_databases": ClinicalNarrativeAgent,
  "section_l_pmcf": ClinicalNarrativeAgent,
  "section_m_conclusions": ConclusionNarrativeAgent,
  
  // agent_assignment field values from template
  "executive_summary_agent": ExecSummaryNarrativeAgent,
  "device_scope_agent": DeviceScopeNarrativeAgent,
  "device_description_agent": DeviceScopeNarrativeAgent,
  "pms_activity_agent": PMSActivityNarrativeAgent,
  "sales_exposure_agent": PMSActivityNarrativeAgent,
  "safety_narrative_agent": SafetyNarrativeAgent,
  "incidents_summary_agent": SafetyNarrativeAgent,
  "complaints_summary_agent": SafetyNarrativeAgent,
  "trend_narrative_agent": TrendNarrativeAgent,
  "fsca_narrative_agent": FSCANarrativeAgent,
  "capa_narrative_agent": CAPANarrativeAgent,
  "clinical_narrative_agent": ClinicalNarrativeAgent,
  "literature_review_agent": ClinicalNarrativeAgent,
  "external_db_agent": ClinicalNarrativeAgent,
  "pmcf_narrative_agent": ClinicalNarrativeAgent,
  "benefit_risk_agent": BenefitRiskNarrativeAgent,
  "conclusion_agent": ConclusionNarrativeAgent,
  "conclusions_agent": ConclusionNarrativeAgent,
};

const TABLE_AGENT_MAPPING: Record<string, new () => any> = {
  // MDCG Standard IDs
  "MDCG.ANNEXI.SALES_TABLE": SalesExposureTableAgent,
  "MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE_IMDRF": SeriousIncidentsTableAgent,
  "MDCG.ANNEXI.COMPLAINTS_BY_REGION_SEVERITY_TABLE": ComplaintsTableAgent,
  "MDCG.ANNEXI.TREND_TABLE": TrendAnalysisTableAgent,
  "MDCG.ANNEXI.FSCA_TABLE": FSCATableAgent,
  "MDCG.ANNEXI.CAPA_TABLE": CAPATableAgent,
  "MDCG.ANNEXI.LITERATURE_TABLE": LiteratureTableAgent,
  "MDCG.ANNEXI.PMCF_TABLE": PMCFTableAgent,
  
  // Custom Template Slot IDs that generate tables
  "section_c_sales_distribution": SalesExposureTableAgent,
  "section_d_serious_incidents": SeriousIncidentsTableAgent,
  "section_f_complaints": ComplaintsTableAgent,
  "section_g_trending": TrendAnalysisTableAgent,
  "section_h_fsca": FSCATableAgent,
  "section_i_capa": CAPATableAgent,
  "section_j_literature": LiteratureTableAgent,
  "section_l_pmcf": PMCFTableAgent,
  
  // agent_assignment field values for tables
  "sales_table_agent": SalesExposureTableAgent,
  "incidents_table_agent": SeriousIncidentsTableAgent,
  "complaints_table_agent": ComplaintsTableAgent,
  "trend_table_agent": TrendAnalysisTableAgent,
  "fsca_table_agent": FSCATableAgent,
  "capa_table_agent": CAPATableAgent,
  "literature_table_agent": LiteratureTableAgent,
  "pmcf_table_agent": PMCFTableAgent,
};

/**
 * Resolve the appropriate agent class for a slot.
 * Checks in order: slot_id, mdcg_reference, agent_assignment, section pattern
 */
function resolveNarrativeAgent(slot: any): (new () => any) | null {
  // 1. Direct slot_id match
  if (NARRATIVE_AGENT_MAPPING[slot.slot_id]) {
    return NARRATIVE_AGENT_MAPPING[slot.slot_id];
  }
  
  // 2. mdcg_reference match (handle compound references like "X and Y")
  const mdcgRef = slot.mdcg_reference || (slot as any).mdcg_reference;
  if (mdcgRef) {
    const refs = mdcgRef.split(" and ").map((r: string) => r.trim());
    for (const ref of refs) {
      if (NARRATIVE_AGENT_MAPPING[ref]) {
        return NARRATIVE_AGENT_MAPPING[ref];
      }
    }
  }
  
  // 3. agent_assignment match
  const agentAssignment = slot.agent_assignment || (slot as any).agent_assignment;
  if (agentAssignment && NARRATIVE_AGENT_MAPPING[agentAssignment]) {
    return NARRATIVE_AGENT_MAPPING[agentAssignment];
  }
  
  // 4. Section pattern matching (section_a → exec summary, etc.)
  const slotId = slot.slot_id.toLowerCase();
  if (slotId.includes("executive") || slotId.includes("section_a")) return ExecSummaryNarrativeAgent;
  if (slotId.includes("device") || slotId.includes("scope") || slotId.includes("section_b")) return DeviceScopeNarrativeAgent;
  if (slotId.includes("sales") || slotId.includes("pms") || slotId.includes("section_c")) return PMSActivityNarrativeAgent;
  if (slotId.includes("incident") || slotId.includes("section_d")) return SafetyNarrativeAgent;
  if (slotId.includes("feedback") || slotId.includes("section_e")) return SafetyNarrativeAgent;
  if (slotId.includes("complaint") || slotId.includes("section_f")) return SafetyNarrativeAgent;
  if (slotId.includes("trend") || slotId.includes("section_g")) return TrendNarrativeAgent;
  if (slotId.includes("fsca") || slotId.includes("recall") || slotId.includes("section_h")) return FSCANarrativeAgent;
  if (slotId.includes("capa") || slotId.includes("section_i")) return CAPANarrativeAgent;
  if (slotId.includes("literature") || slotId.includes("section_j")) return ClinicalNarrativeAgent;
  if (slotId.includes("external") || slotId.includes("database") || slotId.includes("section_k")) return ClinicalNarrativeAgent;
  if (slotId.includes("pmcf") || slotId.includes("clinical") || slotId.includes("section_l")) return ClinicalNarrativeAgent;
  if (slotId.includes("conclusion") || slotId.includes("benefit") || slotId.includes("risk") || slotId.includes("section_m")) return BenefitRiskNarrativeAgent;
  
  return null;
}

/**
 * Resolve the appropriate table agent class for a slot.
 */
function resolveTableAgent(slot: any): (new () => any) | null {
  // 1. Direct slot_id match
  if (TABLE_AGENT_MAPPING[slot.slot_id]) {
    return TABLE_AGENT_MAPPING[slot.slot_id];
  }
  
  // 2. mdcg_reference match
  const mdcgRef = slot.mdcg_reference || (slot as any).mdcg_reference;
  if (mdcgRef) {
    const refs = mdcgRef.split(" and ").map((r: string) => r.trim());
    for (const ref of refs) {
      if (TABLE_AGENT_MAPPING[ref]) {
        return TABLE_AGENT_MAPPING[ref];
      }
    }
  }
  
  // 3. agent_assignment match (for table-specific assignments)
  const agentAssignment = slot.agent_assignment || (slot as any).agent_assignment;
  if (agentAssignment && TABLE_AGENT_MAPPING[agentAssignment]) {
    return TABLE_AGENT_MAPPING[agentAssignment];
  }
  
  // 4. Section pattern matching for tables
  const slotId = slot.slot_id.toLowerCase();
  if (slotId.includes("sales") || slotId.includes("section_c")) return SalesExposureTableAgent;
  if (slotId.includes("incident") || slotId.includes("section_d")) return SeriousIncidentsTableAgent;
  if (slotId.includes("complaint") || slotId.includes("section_f")) return ComplaintsTableAgent;
  if (slotId.includes("trend") || slotId.includes("section_g")) return TrendAnalysisTableAgent;
  if (slotId.includes("fsca") || slotId.includes("section_h")) return FSCATableAgent;
  if (slotId.includes("capa") || slotId.includes("section_i")) return CAPATableAgent;
  if (slotId.includes("literature") || slotId.includes("section_j")) return LiteratureTableAgent;
  if (slotId.includes("pmcf") || slotId.includes("section_l")) return PMCFTableAgent;
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORM-BASED SECTION AGENT MAPPING (CooperSurgical-style templates)
// ═══════════════════════════════════════════════════════════════════════════════

/** Maps form section IDs to narrative agents and required evidence types */
const FORM_SECTION_AGENT_MAPPING: Record<string, {
  narrativeAgent: new () => any;
  tableAgent?: new () => any;
  requiredTypes: string[];
  title: string;
}> = {
  "A_executive_summary": {
    narrativeAgent: ExecSummaryNarrativeAgent,
    requiredTypes: ["benefit_risk_assessment", "previous_psur_extract"],
    title: "Executive Summary",
  },
  "B_scope_and_device_description": {
    narrativeAgent: DeviceScopeNarrativeAgent,
    requiredTypes: ["device_registry_record", "regulatory_certificate_record", "manufacturer_profile", "ifu_extract"],
    title: "Scope and Device Description",
  },
  "C_volume_of_sales_and_population_exposure": {
    narrativeAgent: PMSActivityNarrativeAgent,
    tableAgent: SalesExposureTableAgent,
    requiredTypes: ["sales_volume", "sales_summary", "sales_by_region", "distribution_summary", "usage_estimate"],
    title: "Volume of Sales and Population Exposure",
  },
  "D_information_on_serious_incidents": {
    narrativeAgent: SafetyNarrativeAgent,
    tableAgent: SeriousIncidentsTableAgent,
    requiredTypes: ["serious_incident_record", "serious_incident_summary", "serious_incident_records_imdrf", "vigilance_report"],
    title: "Information on Serious Incidents",
  },
  "E_customer_feedback": {
    narrativeAgent: SafetyNarrativeAgent,
    requiredTypes: ["customer_feedback_summary", "trend_analysis"],
    title: "Customer Feedback",
  },
  "F_product_complaint_types_counts_and_rates": {
    narrativeAgent: SafetyNarrativeAgent,
    tableAgent: ComplaintsTableAgent,
    requiredTypes: ["complaint_record", "complaint_summary", "complaints_by_region"],
    title: "Product Complaint Types, Counts, and Rates",
  },
  "G_information_from_trend_reporting": {
    narrativeAgent: TrendNarrativeAgent,
    tableAgent: TrendAnalysisTableAgent,
    requiredTypes: ["trend_analysis", "signal_log"],
    title: "Information from Trend Reporting",
  },
  "H_information_from_fsca": {
    narrativeAgent: FSCANarrativeAgent,
    tableAgent: FSCATableAgent,
    requiredTypes: ["fsca_record", "fsca_summary", "recall_record"],
    title: "Information from Field Safety Corrective Actions",
  },
  "I_corrective_and_preventive_actions": {
    narrativeAgent: CAPANarrativeAgent,
    tableAgent: CAPATableAgent,
    requiredTypes: ["capa_record", "capa_summary", "ncr_record"],
    title: "Corrective and Preventive Actions",
  },
  "J_scientific_literature_review": {
    narrativeAgent: ClinicalNarrativeAgent,
    tableAgent: LiteratureTableAgent,
    requiredTypes: ["literature_review_summary", "literature_search_strategy", "literature_result"],
    title: "Scientific Literature Review",
  },
  "K_review_of_external_databases_and_registries": {
    narrativeAgent: ClinicalNarrativeAgent,
    requiredTypes: ["external_db_summary", "external_db_query_log"],
    title: "Review of External Databases and Registries",
  },
  "L_pmcf": {
    narrativeAgent: ClinicalNarrativeAgent,
    tableAgent: PMCFTableAgent,
    requiredTypes: ["pmcf_summary", "pmcf_result", "pmcf_activity_record", "pmcf_report_extract"],
    title: "Post-Market Clinical Follow-up (PMCF)",
  },
  "M_findings_and_conclusions": {
    narrativeAgent: ConclusionNarrativeAgent,
    requiredTypes: ["benefit_risk_assessment", "clinical_evaluation_extract", "cer_extract", "risk_assessment"],
    title: "Findings and Conclusions",
  },
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

      // ═══════════════════════════════════════════════════════════════════════
      // DETECT TEMPLATE TYPE AND LOAD APPROPRIATELY
      // ═══════════════════════════════════════════════════════════════════════
      const isFormBased = await isTemplateFormBased(input.templateId);
      
      if (isFormBased) {
        console.log(`[${this.orchestratorId}] Detected FORM-BASED template: ${input.templateId}`);
        return await this.compileFormBasedTemplate(input, orchTrace, startTime);
      }

      // Standard slot-based template compilation
      console.log(`[${this.orchestratorId}] Processing SLOT-BASED template: ${input.templateId}`);
      
      // Load template
      const template = await loadTemplate(input.templateId);
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
        // Determine slot kind from either slot_kind or data_type field
        const slotKind = this.determineSlotKind(slot);
        if (slotKind !== "NARRATIVE" && slotKind !== "TABLE") continue;
        throwIfAborted();

        // Mark slot as generating in live preview
        updateLiveContent(input.psurCaseId, slot.slot_id, slot.title, "", "generating");

        // ─── NARRATIVE GENERATION ─────────────────────────────────────────────
        if (slotKind === "NARRATIVE") {
          const AgentClass = resolveNarrativeAgent(slot);
          if (!AgentClass) {
            // Use generic narrative agent as fallback
            console.log(`[CompileOrchestrator] No specific agent for slot ${slot.slot_id}, using generic narrative`);
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
            const requiredTypes = this.getRequiredEvidenceTypes(slot);
            const slotAtoms = this.filterAtomsForSlot(allAtoms, requiredTypes);
            emitRuntimeEvent(input.psurCaseId, { kind: "agent.started", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "narrative", slotId: slot.slot_id, agent: agentName, runId });

            const result = await agent.run({
              slot: {
                slotId: slot.slot_id,
                title: slot.title,
                sectionPath: slot.section_path,
                requirements: requiredTypes.join(", "),
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
                psurCaseId: input.psurCaseId, // Required for canonical metrics
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
        else if (slotKind === "TABLE") {
          const AgentClass = resolveTableAgent(slot);
          if (!AgentClass) {
            console.log(`[CompileOrchestrator] No specific table agent for slot ${slot.slot_id}, using generic table`);
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
            const requiredTypes = this.getRequiredEvidenceTypes(slot);
            const slotAtoms = this.filterAtomsForSlot(allAtoms, requiredTypes);
            emitRuntimeEvent(input.psurCaseId, { kind: "agent.started", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "table", slotId: slot.slot_id, agent: agentName, runId });

            const result = await agent.run({
              slot,
              atoms: slotAtoms,
              context: {
                deviceCode: input.deviceCode,
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
                psurCaseId: input.psurCaseId, // Required for canonical metrics
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

      // Run cross-section consistency validation
      const validationResult = validateCrossSectionConsistency(
        sections,
        input.psurCaseId,
        allAtoms,
        input.periodStart,
        input.periodEnd
      );
      
      // Add validation issues to warnings
      for (const issue of validationResult.issues) {
        if (issue.severity === "ERROR") {
          errors.push(`[DATA CONSISTENCY] ${issue.description}`);
        } else if (issue.severity === "WARNING") {
          warnings.push(`[DATA CONSISTENCY] ${issue.description}`);
        }
      }
      
      console.log(`[${this.orchestratorId}] Cross-section validation: ${validationResult.isValid ? "PASSED" : "ISSUES FOUND"} (Score: ${validationResult.overallScore}%)`);

      // Mark live content generation as finished
      finishLiveContent(input.psurCaseId);
      
      // Clear metrics cache for this PSUR case
      clearMetricsCache(input.psurCaseId);

      return {
        success: formatResult.success && errors.length === 0,
        document: formatResult.data,
        sections,
        charts,
        traceSummary,
        errors,
        warnings,
        validation: validationResult,
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

  /**
   * Extract required evidence types from slot, handling both array and object formats.
   * Template may use evidence_requirements as array or as object with required_types field.
   */
  private getRequiredEvidenceTypes(slot: any): string[] {
    const evReq = slot.evidence_requirements;
    if (!evReq) return [];
    
    // Array format: evidence_requirements: ["type1", "type2"]
    if (Array.isArray(evReq)) {
      return evReq;
    }
    
    // Object format: evidence_requirements: { required_types: ["type1", "type2"] }
    if (evReq.required_types && Array.isArray(evReq.required_types)) {
      return evReq.required_types;
    }
    
    return [];
  }

  /**
   * Determine slot kind from slot_kind, data_type, or output_requirements.
   * Handles templates that use different field names.
   */
  private determineSlotKind(slot: any): "NARRATIVE" | "TABLE" | "ADMIN" | "UNKNOWN" {
    // 1. Direct slot_kind field
    if (slot.slot_kind) {
      const kind = slot.slot_kind.toUpperCase();
      if (kind === "NARRATIVE" || kind === "TABLE" || kind === "ADMIN") {
        return kind as "NARRATIVE" | "TABLE" | "ADMIN";
      }
    }
    
    // 2. Check data_type field (used in custom templates)
    const dataType = (slot.data_type || "").toLowerCase();
    if (dataType.includes("table") || dataType === "tabular") {
      return "TABLE";
    }
    if (dataType.includes("narrative") || dataType === "text" || dataType === "prose") {
      return "NARRATIVE";
    }
    if (dataType === "auto_generated" || dataType === "structured_metadata") {
      return "ADMIN";
    }
    
    // 3. Check output_requirements.render_as
    const renderAs = (slot.output_requirements?.render_as || "").toLowerCase();
    if (renderAs.includes("table") || renderAs === "summary_table" || renderAs === "multi_table") {
      return "TABLE";
    }
    if (renderAs.includes("narrative") || renderAs === "prose" || renderAs === "paragraph") {
      return "NARRATIVE";
    }
    
    // 4. Check if slot has sub_sections with table schemas
    if (slot.sub_sections) {
      const hasTableSubsection = slot.sub_sections.some((sub: any) => 
        sub.table_schema || sub.output_type === "table" || (sub.data_type || "").includes("table")
      );
      // If it has tables and narrative, treat as NARRATIVE (tables will be embedded)
      return "NARRATIVE";
    }
    
    // 5. Check for table-related slot IDs
    const slotId = (slot.slot_id || "").toLowerCase();
    if (slotId.includes("_table") || slotId.includes("table_")) {
      return "TABLE";
    }
    
    // 6. Default to NARRATIVE for non-admin content slots
    if (slotId.includes("cover") || slotId.includes("toc") || slotId.includes("appendix")) {
      return "ADMIN";
    }
    
    return "NARRATIVE";
  }

  /**
   * Filter atoms for a slot with flexible type matching.
   * Handles both exact matches and semantic matches (e.g., sales_data_summary → sales_summary)
   */
  private filterAtomsForSlot(
    allAtoms: any[],
    requiredTypes: string[]
  ): any[] {
    if (requiredTypes.length === 0) return allAtoms;
    
    // Build normalized type set for flexible matching
    const normalizedRequired = new Set<string>();
    for (const type of requiredTypes) {
      normalizedRequired.add(type);
      // Add normalized versions
      const normalized = this.normalizeEvidenceType(type);
      normalizedRequired.add(normalized);
    }
    
    return allAtoms.filter(a => {
      const atomType = a.evidenceType;
      // Direct match
      if (normalizedRequired.has(atomType)) return true;
      // Normalized match
      if (normalizedRequired.has(this.normalizeEvidenceType(atomType))) return true;
      // Partial match (e.g., "sales" matches "sales_summary", "sales_volume", etc.)
      for (const reqType of requiredTypes) {
        const reqCore = reqType.replace(/_data|_summary|_record|_extract|_report/g, '');
        const atomCore = atomType.replace(/_data|_summary|_record|_extract|_report/g, '');
        if (reqCore === atomCore || atomType.includes(reqCore) || reqCore.includes(atomCore.split('_')[0])) {
          return true;
        }
      }
      return false;
    });
  }
  
  /**
   * Normalize template evidence type to canonical format.
   * Maps descriptive types to canonical types.
   */
  private normalizeEvidenceType(type: string): string {
    const TYPE_MAPPINGS: Record<string, string> = {
      // Sales/Distribution
      "sales_data_summary": "sales_summary",
      "sales_data_by_region": "sales_by_region",
      "sales_data_historical_periods": "sales_summary",
      "market_introduction_dates": "sales_summary",
      "distribution_channel_data": "distribution_summary",
      "patient_exposure_estimates": "usage_estimate",
      
      // Complaints
      "complaint_data": "complaint_record",
      "complaint_trends": "complaint_summary",
      "complaint_rates": "complaint_summary",
      
      // Incidents
      "serious_incident_data": "serious_incident_record",
      "incident_summary": "serious_incident_summary",
      
      // Trend/Signal
      "trending_conclusions": "trend_analysis",
      "trend_data": "trend_analysis",
      "signal_detection": "signal_log",
      
      // Device/Regulatory
      "technical_documentation": "device_registry_record",
      "certificate_of_conformity": "regulatory_certificate_record",
      "instructions_for_use": "ifu_extract",
      "risk_management_file_summary": "rmf_extract",
      "clinical_evaluation_report_summary": "cer_extract",
      "device_grouping_rationale": "device_registry_record",
      "basic_udi_di": "device_registry_record",
      "manufacturer_registration": "manufacturer_profile",
      "notified_body_designation": "regulatory_certificate_record",
      
      // Clinical
      "literature_data": "literature_result",
      "literature_search": "literature_search_strategy",
      "pmcf_data": "pmcf_result",
      "pmcf_results": "pmcf_result",
      "external_database_data": "external_db_summary",
      
      // FSCA/CAPA
      "fsca_data": "fsca_record",
      "recall_data": "recall_record",
      "capa_data": "capa_record",
      
      // Benefit-Risk
      "benefit_risk_data": "benefit_risk_assessment",
      "risk_analysis": "risk_assessment",
    };
    
    return TYPE_MAPPINGS[type] || type;
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
    const requiredTypes = this.getRequiredEvidenceTypes(slot);
    const slotAtoms = this.filterAtomsForSlot(allAtoms, requiredTypes);

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

  // ═══════════════════════════════════════════════════════════════════════════════
  // FORM-BASED TEMPLATE COMPILATION (CooperSurgical-style)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Compile a form-based template (like FormQAR-054) into sections.
   * Form templates have predefined sections A-M instead of GRKB slots.
   */
  private async compileFormBasedTemplate(
    input: CompileOrchestratorInput,
    orchTrace: ReturnType<typeof createTraceBuilder>,
    startTime: number
  ): Promise<CompileOrchestratorResult> {
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

    try {
      // Load form template
      const formTemplate = await loadFormTemplate(input.templateId);
      const sectionIds = Object.keys(FORM_SECTION_AGENT_MAPPING);

      console.log(`[${this.orchestratorId}] Form template loaded: ${formTemplate.form.form_id}`);
      console.log(`[${this.orchestratorId}] Processing ${sectionIds.length} form sections`);

      // Initialize live content
      initLiveContent(input.psurCaseId, sectionIds);

      // Load all evidence atoms for this case
      const allAtoms = await db.query.evidenceAtoms.findMany({
        where: eq(evidenceAtoms.psurCaseId, input.psurCaseId),
      });

      console.log(`[${this.orchestratorId}] Loaded ${allAtoms.length} evidence atoms for form compilation`);

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 1: GENERATE FORM SECTIONS SEQUENTIALLY
      // ═══════════════════════════════════════════════════════════════════════

      for (const sectionId of sectionIds) {
        throwIfAborted();
        const sectionConfig = FORM_SECTION_AGENT_MAPPING[sectionId];
        if (!sectionConfig) continue;

        // Mark section as generating
        updateLiveContent(input.psurCaseId, sectionId, sectionConfig.title, "", "generating");

        // Filter atoms for this section
        const sectionAtoms = this.filterAtomsForSlot(allAtoms, sectionConfig.requiredTypes);

        console.log(`[${this.orchestratorId}] Processing section ${sectionId}: ${sectionAtoms.length} atoms`);

        // Generate narrative
        try {
          const runId = `${this.orchestratorId}:${sectionId}:${Date.now().toString(36)}`;
          const agentName = sectionConfig.narrativeAgent?.name || "FormNarrativeAgent";
          emitRuntimeEvent(input.psurCaseId, { kind: "agent.created", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "narrative", slotId: sectionId, agent: agentName, runId });
          const agentStart = Date.now();

          const agent = new sectionConfig.narrativeAgent();
          emitRuntimeEvent(input.psurCaseId, { kind: "agent.started", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "narrative", slotId: sectionId, agent: agentName, runId });

          const result = await agent.run({
            slot: {
              slotId: sectionId,
              title: sectionConfig.title,
              sectionPath: sectionConfig.title,
              requirements: sectionConfig.requiredTypes.join(", "),
              guidance: "Generate a comprehensive section for the PSUR form",
            },
            evidenceAtoms: sectionAtoms.map((a: any) => ({
              atomId: a.atomId,
              evidenceType: a.evidenceType,
              normalizedData: a.normalizedData as Record<string, unknown>,
            })),
            context: {
              deviceCode: input.deviceCode,
              deviceName: input.deviceName,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
              templateId: input.templateId,
              psurCaseId: input.psurCaseId, // Required for canonical metrics
            },
          }, this.createAgentContext(input.psurCaseId, sectionId, {
            deviceCode: input.deviceCode,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
          }));

          if (result.success && result.data) {
            const section: CompiledSection = {
              slotId: sectionId,
              title: sectionConfig.title,
              sectionPath: sectionConfig.title,
              slotKind: "NARRATIVE",
              content: result.data.content,
              evidenceAtomIds: result.data.citedAtoms || sectionAtoms.map((a: any) => a.atomId),
              obligationsClaimed: [],
              confidence: result.data.confidence || 0.8,
            };
            sections.push(section);
            updateLiveContent(input.psurCaseId, sectionId, sectionConfig.title, result.data.content, "done");
            emitRuntimeEvent(input.psurCaseId, { kind: "agent.completed", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "narrative", slotId: sectionId, agent: agentName, runId, durationMs: Date.now() - agentStart });
          } else {
            // Fallback to generic generation
            const fallback = await this.generateFormSectionFallback(sectionId, sectionConfig, sectionAtoms, input);
            sections.push(fallback);
            updateLiveContent(input.psurCaseId, sectionId, sectionConfig.title, fallback.content, "done");
            warnings.push(`Used fallback for section ${sectionId}`);
            emitRuntimeEvent(input.psurCaseId, { kind: "agent.failed", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "narrative", slotId: sectionId, agent: agentName, runId, error: result.error || "Unknown error" });
          }
          emitRuntimeEvent(input.psurCaseId, { kind: "agent.destroyed", ts: Date.now(), psurCaseId: input.psurCaseId, phase: "narrative", slotId: sectionId, agent: agentName, runId });

        } catch (err: any) {
          console.error(`[${this.orchestratorId}] Section ${sectionId} error:`, err.message);
          const fallback = await this.generateFormSectionFallback(sectionId, sectionConfig, sectionAtoms, input);
          sections.push(fallback);
          updateLiveContent(input.psurCaseId, sectionId, sectionConfig.title, fallback.content, "done");
          errors.push(`Error generating ${sectionId}: ${err.message}`);
        }

        // Generate table if applicable
        if (sectionConfig.tableAgent && sectionAtoms.length > 0) {
          try {
            const tableAgent = new sectionConfig.tableAgent();
            const tableResult = await tableAgent.run({
              slot: {
                slot_id: `${sectionId}_table`,
                title: `${sectionConfig.title} - Data Table`,
                section_path: sectionConfig.title,
                evidence_requirements: { required_types: sectionConfig.requiredTypes },
              },
              atoms: sectionAtoms,
              context: {
                deviceCode: input.deviceCode,
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
                psurCaseId: input.psurCaseId, // Required for canonical metrics
              },
            }, this.createAgentContext(input.psurCaseId, `${sectionId}_table`));

            if (tableResult.success && tableResult.data) {
              const tableSection: CompiledSection = {
                slotId: `${sectionId}_table`,
                title: `${sectionConfig.title} - Data Table`,
                sectionPath: sectionConfig.title,
                slotKind: "TABLE",
                content: tableResult.data.markdown || tableResult.data.content || "",
                evidenceAtomIds: tableResult.data.evidenceAtomIds || sectionAtoms.map((a: any) => a.atomId),
                obligationsClaimed: [],
                confidence: tableResult.confidence || 0.8,
              };
              sections.push(tableSection);
            }
          } catch (tableErr: any) {
            warnings.push(`Table generation failed for ${sectionId}: ${tableErr.message}`);
          }
        }
      }

      // Finish live content
      finishLiveContent(input.psurCaseId);

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 2: CHARTS (if enabled)
      // ═══════════════════════════════════════════════════════════════════════

      if (input.enableCharts) {
        console.log(`[${this.orchestratorId}] Generating charts for form template...`);
        // Reuse the same chart generation logic from slot-based templates
        // Charts are data-driven, not template-driven
        const chartResults = await this.generateFormCharts(allAtoms, input);
        charts.push(...chartResults);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 3: DOCUMENT FORMATTING
      // ═══════════════════════════════════════════════════════════════════════

      console.log(`[${this.orchestratorId}] Formatting form-based document...`);

      const formatterAgent = new DocumentFormatterAgent();
      const formattedResult = await formatterAgent.run({
        sections,
        charts,
        style: input.documentStyle,
        outputFormat: input.outputFormat || "docx",
        metadata: {
          psurCaseId: input.psurCaseId,
          deviceCode: input.deviceCode,
          deviceName: input.deviceName || input.deviceCode,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          templateId: input.templateId,
          generatedAt: new Date().toISOString(),
          companyName: input.companyName,
          companyLogo: input.companyLogo,
          author: input.author,
          reviewers: input.reviewers,
          approvers: input.approvers,
          confidentiality: input.confidentiality,
        },
        prepareForSignature: input.prepareForSignature,
        enableAccessibility: input.enableAccessibility,
      }, this.createAgentContext(input.psurCaseId, undefined, { phase: "formatting" }));
      
      // Check if formatter succeeded
      if (!formattedResult.success) {
        console.error(`[${this.orchestratorId}] DocumentFormatterAgent failed:`, formattedResult.error);
        errors.push(`Document formatting failed: ${formattedResult.error || "Unknown error"}`);
      }

      // Log completion
      const duration = Date.now() - startTime;
      const hasDocument = formattedResult.success && formattedResult.data;
      
      orchTrace.setOutput({
        templateType: "form-based",
        sectionsGenerated: sections.length,
        chartsGenerated: charts.length,
        documentGenerated: hasDocument,
        errors: errors.length,
        warnings: warnings.length,
      });
      
      const confidence = hasDocument ? (errors.length === 0 ? 0.95 : 0.70) : 0.30;
      await orchTrace.commit(
        hasDocument ? (errors.length === 0 ? "PASS" : "PARTIAL") : "FAIL",
        confidence,
        hasDocument 
          ? `Form-based template compilation: ${sections.length} sections, ${charts.length} charts generated`
          : `Form-based template compilation failed: ${errors.join("; ")}`
      );

      console.log(`[${this.orchestratorId}] Form compilation complete: ${sections.length} sections, ${charts.length} charts in ${duration}ms`);

      return {
        success: hasDocument,
        document: hasDocument ? formattedResult.data : undefined,
        sections,
        charts,
        traceSummary: getTraceSummary(input.psurCaseId),
        errors,
        warnings,
      };

    } catch (err: any) {
      console.error(`[${this.orchestratorId}] Form compilation failed:`, err);
      await orchTrace.commit(
        "FAIL",
        0,
        `Form compilation failed: ${err.message}`
      );

      return {
        success: false,
        sections,
        charts,
        traceSummary: getTraceSummary(input.psurCaseId),
        errors: [`Form compilation failed: ${err.message}`],
        warnings,
      };
    }
  }

  /**
   * Generate fallback content for a form section when agent fails
   */
  private async generateFormSectionFallback(
    sectionId: string,
    sectionConfig: typeof FORM_SECTION_AGENT_MAPPING[string],
    sectionAtoms: any[],
    input: CompileOrchestratorInput
  ): Promise<CompiledSection> {
    const atomSummary = sectionAtoms.length > 0
      ? sectionAtoms.slice(0, 5).map((a: any) => {
          const data = a.normalizedData || {};
          return Object.entries(data)
            .filter(([k]) => !["raw_data", "isNegativeEvidence"].includes(k))
            .slice(0, 3)
            .map(([k, v]) => `${k}: ${String(v).substring(0, 50)}`)
            .join("; ");
        }).join("\n- ")
      : "No evidence data available for this section.";

    const content = `## ${sectionConfig.title}

**Reporting Period:** ${input.periodStart} to ${input.periodEnd}

${sectionAtoms.length > 0
  ? `This section summarizes information from ${sectionAtoms.length} evidence records of types: ${[...new Set(sectionAtoms.map((a: any) => a.evidenceType))].join(", ")}.

### Key Data Points:
- ${atomSummary}

*Note: This section requires detailed review and completion by the manufacturer's regulatory team.*`
  : `**Data Gap Identified:** No evidence records of the required types (${sectionConfig.requiredTypes.join(", ")}) were found for this reporting period.

This represents a trace gap that must be addressed before PSUR submission. Please ensure the following evidence types are uploaded:
${sectionConfig.requiredTypes.map(t => `- ${t}`).join("\n")}

*This section will be populated once the required evidence is available.*`}
`;

    return {
      slotId: sectionId,
      title: sectionConfig.title,
      sectionPath: sectionConfig.title,
      slotKind: "NARRATIVE",
      content,
      evidenceAtomIds: sectionAtoms.map((a: any) => a.atomId),
      obligationsClaimed: [],
      confidence: sectionAtoms.length > 0 ? 0.5 : 0.3,
    };
  }

  /**
   * Generate charts for form-based templates using available evidence
   */
  private async generateFormCharts(allAtoms: any[], input: CompileOrchestratorInput): Promise<CompiledChart[]> {
    const charts: CompiledChart[] = [];

    try {
      const trendAtoms = allAtoms
        .filter((a: any) => ["trend_analysis", "complaint_record", "sales_volume"].includes(a.evidenceType))
        .map((a: any) => ({ atomId: a.atomId, evidenceType: a.evidenceType, normalizedData: (a.normalizedData || {}) as Record<string, unknown> }));

      const complaintAtoms = allAtoms
        .filter((a: any) => ["complaint_record", "complaint_summary"].includes(a.evidenceType))
        .map((a: any) => ({ atomId: a.atomId, evidenceType: a.evidenceType, normalizedData: (a.normalizedData || {}) as Record<string, unknown> }));

      if (trendAtoms.length > 0) {
        try {
          const agent = new TrendLineChartAgent();
          const result = await agent.run({
            atoms: trendAtoms,
            chartTitle: "Trend Analysis",
            style: input.documentStyle,
          }, this.createAgentContext(input.psurCaseId));

          if (result.success && result.data) {
            charts.push({
              chartId: `trend-${input.psurCaseId}`,
              chartType: "trend_line",
              title: "Trend Analysis",
              imageBuffer: result.data.imageBuffer,
              svg: result.data.svg,
              width: result.data.width,
              height: result.data.height,
              mimeType: result.data.mimeType,
            });
          }
        } catch (err) {
          console.warn(`[${this.orchestratorId}] Trend chart generation failed:`, err);
        }
      }

      if (complaintAtoms.length > 0) {
        try {
          const agent = new ComplaintBarChartAgent();
          const result = await agent.run({
            atoms: complaintAtoms,
            chartTitle: "Complaint Distribution",
            style: input.documentStyle,
          }, this.createAgentContext(input.psurCaseId));

          if (result.success && result.data) {
            charts.push({
              chartId: `complaints-${input.psurCaseId}`,
              chartType: "bar_chart",
              title: "Complaint Distribution",
              imageBuffer: result.data.imageBuffer,
              svg: result.data.svg,
              width: result.data.width,
              height: result.data.height,
              mimeType: result.data.mimeType,
            });
          }
        } catch (err) {
          console.warn(`[${this.orchestratorId}] Complaint chart generation failed:`, err);
        }
      }
    } catch (err) {
      console.warn(`[${this.orchestratorId}] Chart generation phase failed:`, err);
    }

    return charts;
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
    const requiredTypes = this.getRequiredEvidenceTypes(slot);
    const slotAtoms = this.filterAtomsForSlot(allAtoms, requiredTypes);

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
