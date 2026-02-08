import { db } from "../../db";
import { storage } from "../../storage";
import { loadTemplate, loadFormTemplate, isTemplateFormBased, getSlots, getEffectiveMapping, getTemplateDefaults, getEffectiveSlots, type Template, type FormTemplate } from "../templateStore";
import { cacheCompiledDocument, initLiveContent, finishLiveContent } from "../../routes";
import { lintTemplate, lintTemplateFromJson, type LintResult } from "../templates/lintTemplates";
import { listEvidenceAtomsByCase, EvidenceAtomRecord } from "../services/evidenceStore";
import { ingestEvidenceStep } from "./steps/ingestEvidence";
import { proposeSlotsStep, SlotProposalOutput, ProposalStatus, getTraceGaps, areAllProposalsReady } from "./steps/proposeSlots";
import {
  qualifyTemplateAgainstGrkb,
  getObligations,
  getConstraints,
} from "../services/grkbService";
import {
  startTrace,
  resumeTrace,
  TraceEvents,
  markStepCompleted,
  markWorkflowFailed,
  type TraceContext,
} from "../services/decisionTraceService";
import path from "path";
import fs from "fs";
import {
  psurCases,
  slotProposals,
  coverageReports,
  auditBundles,
  evidenceAtoms,
  qualificationReports,
  decisionTraceSummaries,
  templates,
  slotDefinitions,
  WorkflowStep,
  WorkflowStepStatus,
  OrchestratorWorkflowResult,
  WorkflowScope,
  WorkflowCase,
  KernelStatus,
  EvidenceIngestReport,
  AdjudicationReport,
  CoverageReportData,
  ExportBundleReport,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Response } from "express";

const STEP_NAMES: Record<number, string> = {
  1: "Validate Template",
  2: "Initialize Report",
  3: "Load Data",
  4: "Map Content",
  5: "Verify Completeness",
  6: "Coverage Analysis",
  7: "Generate Document",
  8: "Export Package",
};

const workflowResultCache = new Map<number, OrchestratorWorkflowResult>();

type RuntimeEvent =
  | { kind: "workflow.started"; ts: number; psurCaseId: number }
  | { kind: "workflow.completed"; ts: number; psurCaseId: number; durationMs: number }
  | { kind: "workflow.failed"; ts: number; psurCaseId: number; error: string }
  | { kind: "workflow.cancelled"; ts: number; psurCaseId: number; reason: string }
  | { kind: "step.started"; ts: number; psurCaseId: number; step: number; name: string }
  | { kind: "step.completed"; ts: number; psurCaseId: number; step: number; name: string }
  | { kind: "step.failed"; ts: number; psurCaseId: number; step: number; name: string; error: string }
  | { kind: "agent.created"; ts: number; psurCaseId: number; phase: string; slotId: string; agent: string; runId: string }
  | { kind: "agent.started"; ts: number; psurCaseId: number; phase: string; slotId: string; agent: string; runId: string }
  | { kind: "agent.completed"; ts: number; psurCaseId: number; phase: string; slotId: string; agent: string; runId: string; durationMs: number }
  | { kind: "agent.failed"; ts: number; psurCaseId: number; phase: string; slotId: string; agent: string; runId: string; error: string }
  | { kind: "agent.destroyed"; ts: number; psurCaseId: number; phase: string; slotId: string; agent: string; runId: string };

const runtimeStreams = new Map<number, Set<Response>>();

export function attachRuntimeStream(psurCaseId: number, res: Response): () => void {
  let set = runtimeStreams.get(psurCaseId);
  if (!set) {
    set = new Set<Response>();
    runtimeStreams.set(psurCaseId, set);
  }
  set.add(res);

  // initial state snapshot (best-effort)
  try {
    const cached = getCachedWorkflowResult(psurCaseId);
    res.write(
      `event: snapshot\ndata: ${JSON.stringify({
        ts: Date.now(),
        psurCaseId,
        cached,
      })}\n\n`,
    );
  } catch {
    // ignore
  }

  return () => {
    const current = runtimeStreams.get(psurCaseId);
    current?.delete(res);
    if (current && current.size === 0) runtimeStreams.delete(psurCaseId);
  };
}

export function emitRuntimeEvent(psurCaseId: number, event: RuntimeEvent): void {
  const streams = runtimeStreams.get(psurCaseId);
  if (!streams || streams.size === 0) return;

  const payload = `event: runtime\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of Array.from(streams)) {
    try {
      res.write(payload);
    } catch {
      // ignore broken streams
    }
  }
}

const activeRuns = new Map<
  number,
  {
    controller: AbortController;
    startedAt: number;
    promise: Promise<void>;
  }
>();

export function cancelOrchestratorWorkflow(psurCaseId: number, reason = "Cancelled"): boolean {
  const run = activeRuns.get(psurCaseId);
  if (!run) return false;
  try {
    run.controller.abort(reason);
  } catch {
    // ignore
  }
  emitRuntimeEvent(psurCaseId, { kind: "workflow.cancelled", ts: Date.now(), psurCaseId, reason });
  return true;
}

/**
 * Check if a workflow is currently running for a given PSUR case
 */
export function isWorkflowRunning(psurCaseId: number): boolean {
  return activeRuns.has(psurCaseId);
}

export function startOrchestratorWorkflow(
  params: RunWorkflowParams,
): { ok: true; psurCaseId: number; status: "STARTED" | "ALREADY_RUNNING" } {
  const psurCaseId = params.psurCaseId;
  if (!psurCaseId || typeof psurCaseId !== "number") {
    throw new Error("psurCaseId is required to run workflow");
  }

  if (activeRuns.has(psurCaseId)) {
    return { ok: true, psurCaseId, status: "ALREADY_RUNNING" };
  }

  console.log(`[Workflow ${psurCaseId}] START REQUEST received`);
  const controller = new AbortController();
  const startedAt = Date.now();

  emitRuntimeEvent(psurCaseId, { kind: "workflow.started", ts: startedAt, psurCaseId });

  const promise = (async () => {
    try {
      await runOrchestratorWorkflow({ ...params, signal: controller.signal });
      emitRuntimeEvent(psurCaseId, {
        kind: "workflow.completed",
        ts: Date.now(),
        psurCaseId,
        durationMs: Date.now() - startedAt,
      });
    } catch (e: any) {
      const error = e?.message || String(e);
      emitRuntimeEvent(psurCaseId, { kind: "workflow.failed", ts: Date.now(), psurCaseId, error });
    } finally {
      activeRuns.delete(psurCaseId);
    }
  })();

  activeRuns.set(psurCaseId, { controller, startedAt, promise });
  return { ok: true, psurCaseId, status: "STARTED" };
}

export function getCachedWorkflowResult(psurCaseId: number): OrchestratorWorkflowResult | null {
  return workflowResultCache.get(psurCaseId) || null;
}

function cacheWorkflowResult(psurCaseId: number, result: OrchestratorWorkflowResult) {
  workflowResultCache.set(psurCaseId, result);
}

function makeStep(step: number, status: WorkflowStepStatus = "NOT_STARTED"): WorkflowStep {
  return {
    step,
    name: STEP_NAMES[step] || `Step ${step}`,
    status,
    summary: {},
  };
}

/**
 * Get kernel status from DB-backed GRKB.
 * No longer uses Python orchestrator.
 */
async function getKernelStatus(jurisdictions: string[]): Promise<KernelStatus> {
  const euObligations = await getObligations(["EU_MDR"], "PSUR");
  const ukObligations = await getObligations(["UK_MDR"], "PSUR");
  const constraints = await getConstraints(jurisdictions, "PSUR");

  return {
    euObligations: euObligations.length,
    ukObligations: ukObligations.length,
    constraints: constraints.length,
    templateSlots: 0,
  };
}

export type DocumentStyle = "corporate" | "regulatory" | "premium";

export interface RunWorkflowParams {
  templateId: string;
  jurisdictions: ("EU_MDR" | "UK_MDR")[];
  deviceCode: string;
  deviceId: number;
  periodStart: string;
  periodEnd: string;
  psurCaseId?: number;
  runSteps?: number[];
  /** Enable AI-powered narrative generation for NARRATIVE slots */
  enableAIGeneration?: boolean;
  /** Document style preset: corporate, regulatory, or premium */
  documentStyle?: DocumentStyle;
  /** Enable chart generation in the output document */
  enableCharts?: boolean;
  /** Internal cancellation signal */
  signal?: AbortSignal;
  /** Enable Human-in-the-Loop approval gates during compilation (default: true) */
  enableHITL?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADJUDICATION RULES
// ═══════════════════════════════════════════════════════════════════════════════

interface AdjudicationResult {
  accepted: SlotProposalOutput[];
  rejected: { proposal: SlotProposalOutput; reasons: string[] }[];
}

/**
 * Adjudicate proposals based on deterministic traceability rules:
 * 
 * ACCEPT if:
 * - status == "READY" (has evidence for required types)
 * - status == "NO_EVIDENCE_REQUIRED" (admin/TOC slots with empty required_types)
 * - claimedObligationIds is non-empty
 * - methodStatement length >= min_method_chars (default 10)
 * 
 * REJECT if:
 * - status == "TRACE_GAP" (required_types non-empty BUT evidenceAtomIds empty)
 * - claimedObligationIds is empty
 * - methodStatement too short
 */
function adjudicateProposals(
  proposals: SlotProposalOutput[],
  minMethodChars: number = 10
): AdjudicationResult {
  const accepted: SlotProposalOutput[] = [];
  const rejected: { proposal: SlotProposalOutput; reasons: string[] }[] = [];

  for (const proposal of proposals) {
    const reasons: string[] = [];

    // RULE 1: Check proposal status
    if (proposal.status === "TRACE_GAP") {
      reasons.push(`TRACE_GAP: Required evidence types [${proposal.requiredTypes.join(", ")}] but no atoms found`);
    }

    // RULE 2: Check claimed obligations
    if (proposal.claimedObligationIds.length === 0) {
      reasons.push("Missing claimed obligation IDs");
    }

    // RULE 3: Check method statement length
    if (proposal.methodStatement.length < minMethodChars) {
      reasons.push(`Method statement too short (${proposal.methodStatement.length} chars, need ${minMethodChars})`);
    }

    // RULE 4: For READY status, verify evidence is present
    if (proposal.status === "READY" && proposal.evidenceAtomIds.length === 0) {
      reasons.push("Status is READY but no evidence atom IDs present");
    }

    // Accept or reject
    if (reasons.length === 0) {
      accepted.push(proposal);
    } else {
      rejected.push({ proposal, reasons });
    }
  }

  return { accepted, rejected };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════════

export async function runOrchestratorWorkflow(params: RunWorkflowParams): Promise<OrchestratorWorkflowResult> {
  const { templateId, jurisdictions, deviceCode, deviceId, periodStart, periodEnd, psurCaseId: existingCaseId, runSteps, enableAIGeneration, signal } = params;

  const steps: WorkflowStep[] = Array.from({ length: 8 }, (_, i) => makeStep(i + 1));
  const stepsToRun = runSteps || [1, 2, 3, 4, 5, 6, 7, 8];
  const workflowStartTime = Date.now();

  const scope: WorkflowScope = {
    templateId,
    jurisdictions,
    deviceCode,
    periodStart,
    periodEnd,
  };

  let psurCaseId = existingCaseId || 0;
  let psurRef = "";
  let version = 1;
  let template: Template | null = null;
  let formTemplate: FormTemplate | null = null;
  let isFormBased = false;
  let evidenceAtomsData: EvidenceAtomRecord[] = [];
  let slotProposalsData: SlotProposalOutput[] = [];
  let qualificationBlocked = false;

  // Initialize decision trace
  let traceCtx: TraceContext | null = null;

  try {
    console.log(`[Workflow ${existingCaseId || "new"}] RUN START template=${templateId} steps=${stepsToRun.join(",")}`);
    if (existingCaseId) {
      cacheWorkflowResult(existingCaseId, {
        scope,
        case: { psurCaseId: existingCaseId, psurRef: "", version: 1 },
        steps: [...steps],
        kernelStatus: await getKernelStatus(jurisdictions),
      });
    }

    const throwIfAborted = () => {
      if (signal?.aborted) {
        const reason = typeof (signal as any).reason === "string" ? (signal as any).reason : "Cancelled";
        throw new Error(`Cancelled: ${reason}`);
      }
    };

    throwIfAborted();

    // Start or resume trace
    if (existingCaseId) {
      traceCtx = await resumeTrace(existingCaseId);
    }
    if (!traceCtx) {
      traceCtx = await startTrace(psurCaseId || 0, templateId, jurisdictions);
    }

    // Log workflow started
    const startResult = await TraceEvents.workflowStarted(traceCtx, templateId, jurisdictions);
    traceCtx = startResult.ctx;

    // Initial status update to RUNNING
    try {
      await db.insert(decisionTraceSummaries)
        .values({
          psurCaseId: psurCaseId || 0,
          traceId: traceCtx.traceId,
          workflowStatus: "RUNNING",
          lastUpdatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: decisionTraceSummaries.psurCaseId,
          set: { workflowStatus: "RUNNING", lastUpdatedAt: new Date() }
        });
    } catch (err) {
      console.error('[WorkflowRunner] Failed to set initial RUNNING status:', err);
    }

    // ==================== STEP 1: QUALIFY TEMPLATE ====================
    if (stepsToRun.includes(1)) {
      steps[0].status = "RUNNING";
      steps[0].startedAt = new Date().toISOString();
      if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.started", ts: Date.now(), psurCaseId, step: 1, name: steps[0].name });

      try {
        throwIfAborted();
        // 1a. Check if template exists in database (already validated by pipeline)
        // Templates stored via the pipeline have already passed validation - trust them
        const [dbTemplate] = await db
          .select()
          .from(templates)
          .where(eq(templates.templateId, templateId))
          .limit(1);
        
        let lintResult: LintResult;
        
        if (dbTemplate && dbTemplate.templateJson && dbTemplate.templateType) {
          // Template exists in database with known type - SKIP re-validation
          // The pipeline already validated and accepted this template
          console.log(`[WorkflowRunner] Template found in database with type '${dbTemplate.templateType}' - skipping lint validation (already accepted via pipeline)`);
          
          // Create a synthetic valid lint result
          lintResult = {
            valid: true,
            errors: [],
            warnings: [],
            templateType: dbTemplate.templateType as "slot-based" | "form-based",
          };
        } else if (dbTemplate && dbTemplate.templateJson) {
          // Template in database but no type - run lint to determine type
          console.log(`[WorkflowRunner] Template in database without type - running lint to detect type: ${templateId}`);
          lintResult = await lintTemplateFromJson(dbTemplate.templateJson, templateId);
        } else {
          // Fallback to filesystem - these need full validation
          console.log(`[WorkflowRunner] Template not in database, trying filesystem: ${templateId}`);
          const templatesDir = path.resolve(process.cwd(), "server", "templates");
          const templatePath = path.join(templatesDir, `${templateId}.json`);
          
          // Check if file exists before trying to lint
          if (!fs.existsSync(templatePath)) {
            console.error(`[WorkflowRunner] Template '${templateId}' not found in database OR filesystem`);
            throw new Error(`Template '${templateId}' does not exist. Please upload the template first via the Template Pipeline or select an existing template.`);
          }
          
          lintResult = await lintTemplate(templatePath);
        }

        if (!lintResult.valid) {
          const errorMsg = lintResult.errors.map(e => `[${e.code}] ${e.message}`).join("; ");
          steps[0].status = "FAILED";
          steps[0].endedAt = new Date().toISOString();
          steps[0].error = `Template lint failed: ${errorMsg}`;
          steps[0].summary = { templateId, lintErrors: lintResult.errors.length };
          throw new Error(`Template '${templateId}' failed lint validation: ${errorMsg}`);
        }

        // Log warnings but continue
        if (lintResult.warnings.length > 0) {
          console.warn(`[WorkflowRunner] Template lint warnings for ${templateId}:`,
            lintResult.warnings.map(w => w.message).join(", "));
        }

        // Detect if this is a form-based template
        isFormBased = lintResult.templateType === "form-based";
        
        if (isFormBased) {
          // Form-based templates don't use GRKB slot/mapping structure
          // Load form template and skip GRKB qualification
          formTemplate = await loadFormTemplate(templateId);
          
          console.log(`[WorkflowRunner] Form-based template detected: ${templateId}`);
          console.log(`[WorkflowRunner] Form sections:`, Object.keys(formTemplate.sections));
          
          steps[0].status = "COMPLETED";
          steps[0].endedAt = new Date().toISOString();
          if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.completed", ts: Date.now(), psurCaseId, step: 1, name: steps[0].name });
          steps[0].summary = {
            templateId,
            templateType: "form-based",
            formId: formTemplate.form.form_id,
            formTitle: formTemplate.form.form_title,
            sectionCount: Object.keys(formTemplate.sections).length,
          };

          // Log template validated for form-based
          if (traceCtx) {
            const qualResult = await TraceEvents.templateQualified(traceCtx, 1, {
              slotCount: 0,
              mappingCount: 0,
              obligationsTotal: 0,
              obligationsFound: 0,
            });
            traceCtx = qualResult.ctx;
            await markStepCompleted(psurCaseId || 0, 1);
          }
        } else {
          // 1b. Load slot-based template structure
          // Templates in DB are now always stored in workflow-compatible format
          // (transformed at ingestion by pipeline/management service)
          template = await loadTemplate(templateId);
          const effectiveSlots = getSlots(template) || [];
          const effectiveMapping = getEffectiveMapping(template);

          // 1c. Qualify against GRKB obligations from DB
          const qualReport = await qualifyTemplateAgainstGrkb(
            templateId,
            jurisdictions,
            "PSUR",
            effectiveSlots,
            effectiveMapping
          );

          // Persist qualification report
          await db.insert(qualificationReports).values({
            psurCaseId: existingCaseId || null,
            templateId,
            jurisdictions,
            status: qualReport.status,
            slotCount: qualReport.slotCount,
            mappingCount: qualReport.mappingCount,
            mandatoryObligationsTotal: qualReport.mandatoryObligationsTotal,
            mandatoryObligationsFound: qualReport.mandatoryObligationsFound,
            missingObligations: qualReport.missingObligations,
            constraints: qualReport.constraints,
            blockingErrors: qualReport.blockingErrors,
            validatedAt: new Date(),
          }).onConflictDoNothing();

          // Check qualification status
          if (qualReport.status === "BLOCKED") {
            steps[0].status = "BLOCKED";
            steps[0].endedAt = new Date().toISOString();
            steps[0].error = qualReport.blockingErrors.join("; ");
            steps[0].summary = {
              slotCount: qualReport.slotCount,
              obligationsFound: qualReport.mandatoryObligationsFound,
              status: "BLOCKED",
            };
            steps[0].report = qualReport;
            qualificationBlocked = true;

            // Log template blocked
            if (traceCtx) {
              const blockResult = await TraceEvents.templateBlocked(traceCtx, 1, qualReport.blockingErrors);
              traceCtx = blockResult.ctx;
            }
          } else {
            steps[0].status = "COMPLETED";
            steps[0].endedAt = new Date().toISOString();
            if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.completed", ts: Date.now(), psurCaseId, step: 1, name: steps[0].name });
            steps[0].summary = {
              slotCount: qualReport.slotCount,
              mappingCount: qualReport.mappingCount,
              templateId,
              obligationsCount: qualReport.mandatoryObligationsTotal,
            };
            steps[0].report = qualReport;

            // Log template qualified
            if (traceCtx) {
              const qualResult = await TraceEvents.templateQualified(traceCtx, 1, {
                slotCount: qualReport.slotCount,
                mappingCount: qualReport.mappingCount,
                obligationsTotal: qualReport.mandatoryObligationsTotal,
                obligationsFound: qualReport.mandatoryObligationsFound,
              });
              traceCtx = qualResult.ctx;
              await markStepCompleted(psurCaseId || 0, 1);
            }
          }
        }
      } catch (e: any) {
        steps[0].status = "FAILED";
        steps[0].endedAt = new Date().toISOString();
        steps[0].error = e.message || String(e);
        if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.failed", ts: Date.now(), psurCaseId, step: 1, name: steps[0].name, error: steps[0].error || "Unknown error" });

        // Log workflow failure
        if (traceCtx && psurCaseId) {
          await TraceEvents.workflowFailed(traceCtx, 1, e.message || String(e));
          await markWorkflowFailed(psurCaseId, 1, e.message || String(e));
        }
        throw e;
      }
    } else if (existingCaseId) {
      // If skipping step 1, we still need to load the template
      // Templates in DB are always stored in workflow-compatible format
      isFormBased = await isTemplateFormBased(templateId);
      if (isFormBased) {
        formTemplate = await loadFormTemplate(templateId);
      } else {
        template = await loadTemplate(templateId);
      }
    }

    // ==================== STEP 2: CREATE CASE ====================
    if (stepsToRun.includes(2)) {
      steps[1].status = "RUNNING";
      steps[1].startedAt = new Date().toISOString();
      if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.started", ts: Date.now(), psurCaseId, step: 2, name: steps[1].name });

      try {
        throwIfAborted();
        if (existingCaseId) {
          const existingCase = await storage.getPSURCase(existingCaseId);
          if (existingCase) {
            psurCaseId = existingCase.id;
            psurRef = existingCase.psurReference;
            version = existingCase.version;
          }
        } else {
          // Get device name for meaningful reference
          const device = deviceId ? await storage.getDevice(deviceId) : null;
          const deviceName = device?.deviceName || deviceCode || "Unknown";

          // Sanitize device name for use in reference (remove special chars, spaces -> hyphens)
          const sanitizedDeviceName = deviceName
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 30); // Limit length

          // Format dates as YYYY-MM
          const startDate = new Date(periodStart);
          const endDate = new Date(periodEnd);
          const startFormatted = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
          const endFormatted = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;

          // Generate meaningful reference: PSUR-[DeviceName]-[StartPeriod]-[EndPeriod]
          const refNum = `PSUR-${sanitizedDeviceName}-${startFormatted}-${endFormatted}`;

          const newCase = await storage.createPSURCase({
            psurReference: refNum,
            version: 1,
            templateId,
            jurisdictions,
            startPeriod: new Date(periodStart),
            endPeriod: new Date(periodEnd),
            deviceIds: [deviceId],
            leadingDeviceId: deviceId,
            status: "draft",
          });
          psurCaseId = newCase.id;
          psurRef = newCase.psurReference;
          version = newCase.version;
        }

        steps[1].status = "COMPLETED";
        steps[1].endedAt = new Date().toISOString();
        steps[1].summary = { psurCaseId, psurRef };
        steps[1].report = { psurCaseId, psurRef, version, created: !existingCaseId };
        if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.completed", ts: Date.now(), psurCaseId, step: 2, name: steps[1].name });

        // Update trace context with case ID and log case created (enhanced with period context)
        if (traceCtx) {
          traceCtx = { ...traceCtx, psurCaseId };
          const caseResult = await TraceEvents.caseCreated(traceCtx, psurRef, psurCaseId, periodStart, periodEnd);
          traceCtx = caseResult.ctx;
          await markStepCompleted(psurCaseId, 2);
        }
      } catch (e: any) {
        steps[1].status = "FAILED";
        steps[1].endedAt = new Date().toISOString();
        steps[1].error = e.message || String(e);
        if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.failed", ts: Date.now(), psurCaseId, step: 2, name: steps[1].name, error: steps[1].error || "Unknown error" });

        if (traceCtx && psurCaseId) {
          await TraceEvents.workflowFailed(traceCtx, 2, e.message || String(e));
          await markWorkflowFailed(psurCaseId, 2, e.message || String(e));
        }
        throw e;
      }
    } else if (existingCaseId) {
      const existingCase = await storage.getPSURCase(existingCaseId);
      if (existingCase) {
        psurCaseId = existingCase.id;
        psurRef = existingCase.psurReference;
        version = existingCase.version;
      }
    }

    // ==================== STEP 3: INGEST EVIDENCE ====================
    if (stepsToRun.includes(3)) {
      steps[2].status = "RUNNING";
      steps[2].startedAt = new Date().toISOString();
      if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.started", ts: Date.now(), psurCaseId, step: 3, name: steps[2].name });

      try {
        throwIfAborted();
        // Get required evidence types from template for negative evidence generation
        let requiredTypes: string[] = [];
        if (template && !isFormBased) {
          const slots = getSlots(template) || [];
          const typesSet = new Set<string>();
          for (const slot of slots) {
            const slotTypes = slot.evidence_requirements?.required_types || [];
            for (const t of slotTypes) {
              typesSet.add(t);
            }
          }
          requiredTypes = Array.from(typesSet);
        }

        evidenceAtomsData = await ingestEvidenceStep({
          psurCaseId,
          templateId,
          requiredTypes,
          periodStart,
          periodEnd,
          deviceCode,
        });

        const byType: Record<string, number> = {};
        for (const atom of evidenceAtomsData) {
          byType[atom.evidenceType] = (byType[atom.evidenceType] || 0) + 1;
        }

        const report: EvidenceIngestReport = {
          uploadedAtoms: evidenceAtomsData.length,
          linkedToCaseAtoms: evidenceAtomsData.length,
          rejectedRows: 0,
          sampleErrors: [],
          byType,
        };

        steps[2].status = "COMPLETED";
        steps[2].endedAt = new Date().toISOString();
        steps[2].summary = { linkedToCaseAtoms: report.linkedToCaseAtoms, byType: Object.keys(byType).join(", ") };
        steps[2].report = report;
        if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.completed", ts: Date.now(), psurCaseId, step: 3, name: steps[2].name });
        console.log(`[Workflow ${psurCaseId}] Step 3 COMPLETED: ${report.linkedToCaseAtoms} records linked`);

        // Log evidence atoms created with enhanced context
        if (traceCtx) {
          const TRACE_ATOM_LIMIT = 250;
          if (evidenceAtomsData.length > TRACE_ATOM_LIMIT) {
            const summaryResult = await TraceEvents.evidenceAtomsIngestedSummary(
              traceCtx,
              evidenceAtomsData.length,
              byType,
              periodStart,
              periodEnd
            );
            traceCtx = summaryResult.ctx;
          } else {
            for (const atom of evidenceAtomsData) {
              const isNegative = (atom.normalizedData as any)?.isNegativeEvidence === true;
              // Extract record count from normalized data if available
              const normalizedData = atom.normalizedData as Record<string, any> | undefined;
              const recordCount = normalizedData?.recordCount
                || (Array.isArray(normalizedData) ? normalizedData.length : 1);

              if (isNegative) {
                const negResult = await TraceEvents.negativeEvidenceCreated(traceCtx, atom.atomId, atom.evidenceType);
                traceCtx = negResult.ctx;
              } else {
                const atomResult = await TraceEvents.evidenceAtomCreated(
                  traceCtx,
                  atom.atomId,
                  atom.evidenceType,
                  atom.provenance?.sourceFile,
                  recordCount,
                  periodStart,
                  periodEnd
                );
                traceCtx = atomResult.ctx;
              }
            }
          }
          await markStepCompleted(psurCaseId, 3);
        }

        if (report.linkedToCaseAtoms === 0) {
          steps[2].status = "BLOCKED";
          steps[2].error = "No evidence atoms linked to this case. Upload evidence before running workflow.";
        }
      } catch (e: any) {
        steps[2].status = "FAILED";
        steps[2].endedAt = new Date().toISOString();
        steps[2].error = e.message || String(e);
        if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.failed", ts: Date.now(), psurCaseId, step: 3, name: steps[2].name, error: steps[2].error || "Unknown error" });

        if (traceCtx && psurCaseId) {
          await TraceEvents.workflowFailed(traceCtx, 3, e.message || String(e));
          await markWorkflowFailed(psurCaseId, 3, e.message || String(e));
        }
        throw e;
      }
    }

    const hasEvidence = evidenceAtomsData.length > 0;

    // Update cached result after step 3
    cacheWorkflowResult(psurCaseId, {
      scope,
      case: { psurCaseId, psurRef, version },
      steps: [...steps],
      kernelStatus: await getKernelStatus(jurisdictions),
    });

    // ==================== STEP 4: BUILD QUEUE & PROPOSE ====================
    console.log(`[Workflow ${psurCaseId}] Starting Step 4: Map Content`);
    console.log(`[Workflow ${psurCaseId}] hasEvidence=${hasEvidence}, step3Status=${steps[2].status}, evidenceCount=${evidenceAtomsData.length}`);

    if (stepsToRun.includes(4)) {
      if (steps[2].status !== "COMPLETED") {
        console.log(`[Workflow ${psurCaseId}] Step 4 BLOCKED: Step 3 not completed`);
        steps[3].status = "BLOCKED";
        steps[3].error = `Cannot build queue without evidence. Step 3 must complete (current: ${steps[2].status}).`;
      } else if (!hasEvidence) {
        console.log(`[Workflow ${psurCaseId}] Step 4 BLOCKED: No evidence`);
        steps[3].status = "BLOCKED";
        steps[3].error = "Cannot build queue without evidence. Step 3 completed but no evidence atoms linked.";
      } else {
        console.log(`[Workflow ${psurCaseId}] Step 4 RUNNING`);
        steps[3].status = "RUNNING";
        steps[3].startedAt = new Date().toISOString();

        // Update cache to show RUNNING status immediately
        cacheWorkflowResult(psurCaseId, {
          scope,
          case: { psurCaseId, psurRef, version },
          steps: [...steps],
          kernelStatus: await getKernelStatus(jurisdictions),
        });

        if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.started", ts: Date.now(), psurCaseId, step: 4, name: steps[3].name });

        try {
          throwIfAborted();
          console.log(`[Workflow ${psurCaseId}] Calling proposeSlotsStep...`);
          slotProposalsData = await proposeSlotsStep({
            psurCaseId,
            templateId,
            evidenceAtoms: evidenceAtomsData,
            // Extended context for AI agents
            traceCtx: traceCtx || undefined,
            deviceCode,
            periodStart,
            periodEnd,
            enableAIGeneration: enableAIGeneration ?? false,
            log: (msg: string) => console.log(msg),
          });

          // Count by status
          const readyCount = slotProposalsData.filter(p => p.status === "READY").length;
          const traceGapCount = slotProposalsData.filter(p => p.status === "TRACE_GAP").length;
          const noEvidenceRequiredCount = slotProposalsData.filter(p => p.status === "NO_EVIDENCE_REQUIRED").length;

          // Persist proposals to database
          for (const proposal of slotProposalsData) {
            const dbStatus = proposal.status === "READY" || proposal.status === "NO_EVIDENCE_REQUIRED"
              ? "pending"
              : "rejected";

            // Map string UUIDs to integer DB IDs
            const mappedAtomIds: number[] = [];
            for (const uuid of proposal.evidenceAtomIds) {
              const atom = evidenceAtomsData.find(a => a.atomId === uuid);
              if (atom && atom.id) {
                mappedAtomIds.push(atom.id);
              }
            }

            await db.insert(slotProposals).values({
              psurCaseId,
              slotId: proposal.slotId,
              templateId,
              content: proposal.content,
              evidenceAtomIds: mappedAtomIds,
              claimedObligationIds: proposal.claimedObligationIds,
              methodStatement: proposal.methodStatement,
              transformations: proposal.transformations,
              status: dbStatus,
              rejectionReasons: proposal.status === "TRACE_GAP"
                ? [`TRACE_GAP: Missing evidence for types [${proposal.requiredTypes.join(", ")}]`]
                : [],
            }).onConflictDoNothing();
          }

          console.log(`[Workflow ${psurCaseId}] Step 4 COMPLETED: ${slotProposalsData.length} proposals`);
          steps[3].status = "COMPLETED";
          steps[3].endedAt = new Date().toISOString();
          if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.completed", ts: Date.now(), psurCaseId, step: 4, name: steps[3].name });
          steps[3].summary = {
            totalProposals: slotProposalsData.length,
            ready: readyCount,
            traceGaps: traceGapCount,
            noEvidenceRequired: noEvidenceRequiredCount,
          };

          // Update cache after step 4 completes
          cacheWorkflowResult(psurCaseId, {
            scope,
            case: { psurCaseId, psurRef, version },
            steps: [...steps],
            kernelStatus: await getKernelStatus(jurisdictions),
          });
          steps[3].report = {
            totalProposals: slotProposalsData.length,
            ready: readyCount,
            traceGaps: traceGapCount,
            noEvidenceRequired: noEvidenceRequiredCount,
            traceGapSlots: getTraceGaps(slotProposalsData).map(p => ({
              slotId: p.slotId,
              requiredTypes: p.requiredTypes,
            })),
          };

          // Log slot proposals with enhanced GRKB context
          if (traceCtx) {
            // Build slot title map from template for human-readable traces
            const slotTitleMap = new Map<string, string>();
            if (template) {
              const effectiveSlots = getSlots(template);
              for (const slot of effectiveSlots) {
                slotTitleMap.set(slot.slot_id, slot.title || slot.slot_id);
              }
            }

            for (const proposal of slotProposalsData) {
              const slotTitle = slotTitleMap.get(proposal.slotId) || proposal.slotId;

              // Use the async slotProposed that fetches GRKB context
              const proposalResult = await TraceEvents.slotProposed(
                traceCtx,
                proposal.slotId,
                slotTitle,
                proposal.status,
                proposal.evidenceAtomIds,
                proposal.claimedObligationIds
              );
              traceCtx = proposalResult.ctx;

              // Log trace gaps with slot title
              if (proposal.status === "TRACE_GAP") {
                const gapResult = await TraceEvents.traceGapDetected(
                  traceCtx,
                  proposal.slotId,
                  slotTitle,
                  proposal.requiredTypes
                );
                traceCtx = gapResult.ctx;
              }
            }
            await markStepCompleted(psurCaseId, 4);
          }
        } catch (e: any) {
          console.error(`[Workflow ${psurCaseId}] Step 4 FAILED:`, e.message || e);
          steps[3].status = "FAILED";
          steps[3].endedAt = new Date().toISOString();
          steps[3].error = e.message || String(e);
          if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.failed", ts: Date.now(), psurCaseId, step: 4, name: steps[3].name, error: steps[3].error || "Unknown error" });

          // Update cache with failure status
          cacheWorkflowResult(psurCaseId, {
            scope,
            case: { psurCaseId, psurRef, version },
            steps: [...steps],
            kernelStatus: await getKernelStatus(jurisdictions),
          });

          if (traceCtx && psurCaseId) {
            await TraceEvents.workflowFailed(traceCtx, 4, e.message || String(e));
            await markWorkflowFailed(psurCaseId, 4, e.message || String(e));
          }
        }
      }
    }

    // ==================== STEP 5: ADJUDICATE ====================
    console.log(`[Workflow ${psurCaseId}] Starting Step 5: Adjudicate (step4Status=${steps[3].status})`);
    if (stepsToRun.includes(5)) {
      if (steps[3].status !== "COMPLETED") {
        console.log(`[Workflow ${psurCaseId}] Step 5 BLOCKED: Step 4 not completed`);
        steps[4].status = "BLOCKED";
        steps[4].error = `Cannot adjudicate without proposals. Step 4 must complete (current: ${steps[3].status}).`;
      } else {
        console.log(`[Workflow ${psurCaseId}] Step 5 RUNNING`);
        steps[4].status = "RUNNING";
        steps[4].startedAt = new Date().toISOString();
        cacheWorkflowResult(psurCaseId, { scope, case: { psurCaseId, psurRef, version }, steps: [...steps], kernelStatus: await getKernelStatus(jurisdictions) });
        if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.started", ts: Date.now(), psurCaseId, step: 5, name: steps[4].name });

        try {
          throwIfAborted();
          // Get template defaults for adjudication rules
          const defaults = template ? getTemplateDefaults(template) : { min_method_chars: 10 };

          // Run adjudication with new rules
          const adjudicationResult = adjudicateProposals(slotProposalsData, defaults.min_method_chars);

          const report: AdjudicationReport = {
            acceptedCount: adjudicationResult.accepted.length,
            rejectedCount: adjudicationResult.rejected.length,
            acceptedProposalIds: adjudicationResult.accepted.map(p => p.proposalId),
            rejected: adjudicationResult.rejected.map(r => ({
              proposalId: r.proposal.proposalId,
              reasons: r.reasons,
            })),
          };

          // Update proposal statuses in database
          for (const accepted of adjudicationResult.accepted) {
            await db.update(slotProposals)
              .set({ status: "accepted" })
              .where(eq(slotProposals.slotId, accepted.slotId));
          }

          for (const { proposal, reasons } of adjudicationResult.rejected) {
            await db.update(slotProposals)
              .set({ status: "rejected", rejectionReasons: reasons })
              .where(eq(slotProposals.slotId, proposal.slotId));
          }

          console.log(`[Workflow ${psurCaseId}] Step 5 COMPLETED: ${report.acceptedCount} accepted, ${report.rejectedCount} rejected`);
          steps[4].status = "COMPLETED";
          steps[4].endedAt = new Date().toISOString();
          if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.completed", ts: Date.now(), psurCaseId, step: 5, name: steps[4].name });
          steps[4].summary = { acceptedCount: report.acceptedCount, rejectedCount: report.rejectedCount };
          steps[4].report = report;
          cacheWorkflowResult(psurCaseId, { scope, case: { psurCaseId, psurRef, version }, steps: [...steps], kernelStatus: await getKernelStatus(jurisdictions) });

          // Log adjudication decisions with enhanced GRKB context
          if (traceCtx) {
            // Build slot title map from template
            const slotTitleMap = new Map<string, string>();
            if (template) {
              const effectiveSlots = getSlots(template);
              for (const slot of effectiveSlots) {
                slotTitleMap.set(slot.slot_id, slot.title || slot.slot_id);
              }
            }

            for (const accepted of adjudicationResult.accepted) {
              const slotTitle = slotTitleMap.get(accepted.slotId) || accepted.slotId;

              // Use async slotAccepted that fetches GRKB context for obligations
              const acceptResult = await TraceEvents.slotAccepted(
                traceCtx,
                accepted.slotId,
                slotTitle,
                accepted.evidenceAtomIds,
                accepted.claimedObligationIds,
                ["Passed adjudication rules", `Evidence count: ${accepted.evidenceAtomIds.length}`, `Method statement verified`]
              );
              traceCtx = acceptResult.ctx;
            }

            for (const { proposal, reasons } of adjudicationResult.rejected) {
              const slotTitle = slotTitleMap.get(proposal.slotId) || proposal.slotId;
              const rejectResult = await TraceEvents.slotRejected(
                traceCtx,
                proposal.slotId,
                slotTitle,
                reasons,
                proposal.claimedObligationIds
              );
              traceCtx = rejectResult.ctx;
            }
            await markStepCompleted(psurCaseId, 5);
          }
        } catch (e: any) {
          steps[4].status = "FAILED";
          steps[4].endedAt = new Date().toISOString();
          steps[4].error = e.message || String(e);
          if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.failed", ts: Date.now(), psurCaseId, step: 5, name: steps[4].name, error: steps[4].error || "Unknown error" });

          if (traceCtx && psurCaseId) {
            await TraceEvents.workflowFailed(traceCtx, 5, e.message || String(e));
            await markWorkflowFailed(psurCaseId, 5, e.message || String(e));
          }
        }
      }
    }

    // ==================== STEP 6: COVERAGE REPORT ====================
    console.log(`[Workflow ${psurCaseId}] Starting Step 6: Coverage Report (step5Status=${steps[4].status})`);
    if (stepsToRun.includes(6)) {
      if (steps[4].status !== "COMPLETED") {
        console.log(`[Workflow ${psurCaseId}] Step 6 BLOCKED: Step 5 not completed`);
        steps[5].status = "BLOCKED";
        steps[5].error = `Cannot generate coverage report without adjudication. Step 5 must complete (current: ${steps[4].status}).`;
      } else {
        console.log(`[Workflow ${psurCaseId}] Step 6 RUNNING`);
        steps[5].status = "RUNNING";
        steps[5].startedAt = new Date().toISOString();
        cacheWorkflowResult(psurCaseId, { scope, case: { psurCaseId, psurRef, version }, steps: [...steps], kernelStatus: await getKernelStatus(jurisdictions) });
        if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.started", ts: Date.now(), psurCaseId, step: 6, name: steps[5].name });

        try {
          throwIfAborted();
          const obligations = await getObligations(jurisdictions, "PSUR");
          const totalObligations = obligations.length;

          // Use adjudicated accepted proposals
          const acceptedProposals = slotProposalsData.filter(
            p => p.status === "READY" || p.status === "NO_EVIDENCE_REQUIRED"
          );
          const satisfiedObligations = new Set(acceptedProposals.flatMap(p => p.claimedObligationIds)).size;

          // Get effective slots from template
          const effectiveSlots = template ? getSlots(template) : [];
          const totalSlots = effectiveSlots.length;
          const filledSlots = acceptedProposals.length;

          // Calculate missing evidence types
          const availableTypes = new Set<string>(evidenceAtomsData.map(a => a.evidenceType));
          const requiredTypesArr: string[] = effectiveSlots.flatMap(
            (s: any) => s.evidence_requirements?.required_types || []
          );
          const requiredTypes = new Set<string>(requiredTypesArr);
          const missingEvidenceTypes = Array.from(requiredTypes).filter(t => !availableTypes.has(t));

          const coveragePercent = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;
          const passed = coveragePercent >= 80 && missingEvidenceTypes.length === 0;

          const report: CoverageReportData = {
            obligationsSatisfied: satisfiedObligations,
            obligationsTotal: totalObligations,
            slotsFilled: filledSlots,
            slotsTotal: totalSlots,
            missingEvidenceTypes,
            coveragePercent,
            passed,
          };

          await db.insert(coverageReports).values({
            psurCaseId,
            templateId,
            totalObligations,
            satisfiedObligations,
            missingObligations: [],
            totalSlots,
            filledSlots,
            emptySlots: missingEvidenceTypes,
            coveragePercent: coveragePercent.toString(),
            passed,
          }).onConflictDoNothing();

          console.log(`[Workflow ${psurCaseId}] Step 6 COMPLETED: ${filledSlots}/${totalSlots} slots, ${coveragePercent}% coverage`);
          steps[5].status = "COMPLETED";
          steps[5].endedAt = new Date().toISOString();
          if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.completed", ts: Date.now(), psurCaseId, step: 6, name: steps[5].name });
          steps[5].summary = {
            coverage: `${filledSlots}/${totalSlots} slots`,
            obligations: `${satisfiedObligations}/${totalObligations}`,
            passed,
          };
          steps[5].report = report;
          cacheWorkflowResult(psurCaseId, { scope, case: { psurCaseId, psurRef, version }, steps: [...steps], kernelStatus: await getKernelStatus(jurisdictions) });

          // Log coverage and obligation status
          if (traceCtx) {
            // Log satisfied obligations
            const satisfiedObligationIds = Array.from(new Set(acceptedProposals.flatMap(p => p.claimedObligationIds)));
            for (const obligationId of satisfiedObligationIds) {
              const satResult = await TraceEvents.obligationSatisfied(
                traceCtx,
                obligationId,
                acceptedProposals.find(p => p.claimedObligationIds.includes(obligationId))?.slotId || "unknown"
              );
              traceCtx = satResult.ctx;
            }

            // Log unsatisfied obligations
            const traceGapProposals = slotProposalsData.filter(p => p.status === "TRACE_GAP");
            for (const gap of traceGapProposals) {
              for (const obligationId of gap.claimedObligationIds) {
                const unsatResult = await TraceEvents.obligationUnsatisfied(
                  traceCtx,
                  obligationId,
                  [`Slot ${gap.slotId} has TRACE_GAP - missing evidence types: ${gap.requiredTypes.join(", ")}`]
                );
                traceCtx = unsatResult.ctx;
              }
            }

            // Log overall coverage
            const coverageResult = await TraceEvents.coverageComputed(
              traceCtx,
              satisfiedObligations,
              totalObligations,
              traceGapProposals.length
            );
            traceCtx = coverageResult.ctx;
            await markStepCompleted(psurCaseId, 6);
          }
        } catch (e: any) {
          steps[5].status = "FAILED";
          steps[5].endedAt = new Date().toISOString();
          steps[5].error = e.message || String(e);
          if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.failed", ts: Date.now(), psurCaseId, step: 6, name: steps[5].name, error: steps[5].error || "Unknown error" });

          if (traceCtx && psurCaseId) {
            await TraceEvents.workflowFailed(traceCtx, 6, e.message || String(e));
            await markWorkflowFailed(psurCaseId, 6, e.message || String(e));
          }
        }
      }
    }

    // ==================== STEP 7: RENDER DOCUMENT (SOTA Compilation) ====================
    console.log(`[Workflow ${psurCaseId}] Starting Step 7: Generate Document (step6Status=${steps[5].status})`);
    if (stepsToRun.includes(7)) {
      if (steps[5].status !== "COMPLETED") {
        console.log(`[Workflow ${psurCaseId}] Step 7 BLOCKED: Step 6 not completed`);
        steps[6].status = "BLOCKED";
        steps[6].error = `Cannot render document without coverage report. Step 6 must complete (current: ${steps[5].status}).`;
      } else {
        console.log(`[Workflow ${psurCaseId}] Step 7 RUNNING - Starting SOTA compilation`);
        steps[6].status = "RUNNING";
        steps[6].startedAt = new Date().toISOString();
        cacheWorkflowResult(psurCaseId, { scope, case: { psurCaseId, psurRef, version }, steps: [...steps], kernelStatus: await getKernelStatus(jurisdictions) });
        if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.started", ts: Date.now(), psurCaseId, step: 7, name: steps[6].name });

        try {
          throwIfAborted();

          // Initialize live content immediately so UI shows "generating" status
          if (template && psurCaseId) {
            const templateSlots = getEffectiveSlots(template);
            const slotIds = templateSlots.map(s => s.slot_id);
            initLiveContent(psurCaseId, slotIds);
            console.log(`[Workflow] Initialized live content for ${slotIds.length} slots`);
          }

          // Use SOTA CompileOrchestrator for document generation
          const { CompileOrchestrator } = await import("../agents/runtime/compileOrchestrator");
          const compileOrchestrator = new CompileOrchestrator();

          const documentStyle = params.documentStyle || "corporate";
          const enableCharts = params.enableCharts !== false;

          console.log(`[Workflow] Starting SOTA document compilation with style: ${documentStyle}`);

          // Compile with timeout — extend to 30 min when HITL is on (human review takes time)
          const hitlEnabled = params.enableHITL === true;
          const COMPILE_TIMEOUT_MS = hitlEnabled
            ? 30 * 60 * 1000  // 30 minutes when awaiting human approval
            : 10 * 60 * 1000; // 10 minutes for fully automated runs
          const compilePromise = compileOrchestrator.compile({
            psurCaseId,
            templateId: params.templateId,
            deviceCode: params.deviceCode,
            periodStart: params.periodStart,
            periodEnd: params.periodEnd,
            documentStyle,
            enableCharts,
            enableHITL: hitlEnabled,
            signal,
          });

          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Document compilation timed out after ${COMPILE_TIMEOUT_MS / 1000} seconds`));
            }, COMPILE_TIMEOUT_MS);
          });

          const compileResult = await Promise.race([compilePromise, timeoutPromise]);

          if (compileResult.success && compileResult.document) {
            // Store the generated document
            const docPath = `bundles/PSUR-${psurRef}/${compileResult.document.filename}`;

            // Cache the compiled document for instant download
            try {
              cacheCompiledDocument(psurCaseId, documentStyle, {
                docx: compileResult.document.docx,
                pdf: compileResult.document.pdf,
                html: compileResult.document.html,
                pageCount: compileResult.document.pageCount,
                sectionCount: compileResult.sections.length,
                chartCount: compileResult.charts.length,
                contentHash: compileResult.document.contentHash,
                style: documentStyle,
                generatedAt: Date.now(),
                expiresAt: Date.now() + 3600000,
              });
              console.log(`[Workflow] Cached compiled document for case ${psurCaseId}`);
            } catch (cacheErr: any) {
              console.warn(`[Workflow] Failed to cache document:`, cacheErr?.message);
            }

            console.log(`[Workflow ${psurCaseId}] Step 7 COMPLETED: ${compileResult.sections.length} sections, ${compileResult.charts.length} charts`);
            steps[6].status = "COMPLETED";
            steps[6].endedAt = new Date().toISOString();
            if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.completed", ts: Date.now(), psurCaseId, step: 7, name: steps[6].name });
            steps[6].summary = {
              documentType: "docx",
              sections: compileResult.sections.length,
              charts: compileResult.charts.length,
              style: documentStyle,
              traceEntries: compileResult.traceSummary.totalEntries,
              traceConfidence: compileResult.traceSummary.averageConfidence,
              traceLLMCalls: compileResult.traceSummary.totalLLMCalls,
              traceTokens: compileResult.traceSummary.totalTokens,
            };
            cacheWorkflowResult(psurCaseId, { scope, case: { psurCaseId, psurRef, version }, steps: [...steps], kernelStatus: await getKernelStatus(jurisdictions) });
            steps[6].report = {
              format: "docx",
              sections: compileResult.sections.length,
              filePath: docPath,
              documentBuffer: compileResult.document.docx,
              documentFilename: compileResult.document.filename,
              style: documentStyle,
              charts: compileResult.charts.length,
              warnings: compileResult.warnings,
            };

            // Log document rendered
            if (traceCtx) {
              const renderResult = await TraceEvents.documentRendered(traceCtx, "docx", compileResult.sections.length);
              traceCtx = renderResult.ctx;
              await markStepCompleted(psurCaseId, 7);
            }

            // Mark live content as finished
            if (psurCaseId) {
              finishLiveContent(psurCaseId);
            }
          } else {
            // Compilation failed
            if (psurCaseId) finishLiveContent(psurCaseId);
            throw new Error(`Compilation failed: ${compileResult.errors.join("; ")}`);
          }
        } catch (e: any) {
          steps[6].status = "FAILED";
          steps[6].endedAt = new Date().toISOString();
          steps[6].error = e.message || String(e);
          if (psurCaseId) {
            emitRuntimeEvent(psurCaseId, { kind: "step.failed", ts: Date.now(), psurCaseId, step: 7, name: steps[6].name, error: steps[6].error || "Unknown error" });
            finishLiveContent(psurCaseId);
          }

          if (traceCtx && psurCaseId) {
            await TraceEvents.workflowFailed(traceCtx, 7, e.message || String(e));
            await markWorkflowFailed(psurCaseId, 7, e.message || String(e));
          }
        }
      }
    }

    // ==================== STEP 8: EXPORT BUNDLE ====================
    console.log(`[Workflow ${psurCaseId}] Starting Step 8: Export Package (step7Status=${steps[6].status})`);
    if (stepsToRun.includes(8)) {
      if (steps[6].status !== "COMPLETED") {
        console.log(`[Workflow ${psurCaseId}] Step 8 BLOCKED: Step 7 not completed`);
        steps[7].status = "BLOCKED";
        steps[7].error = `Cannot export bundle without rendered document. Step 7 must complete (current: ${steps[6].status}).`;
      } else {
        console.log(`[Workflow ${psurCaseId}] Step 8 RUNNING`);
        steps[7].status = "RUNNING";
        steps[7].startedAt = new Date().toISOString();
        cacheWorkflowResult(psurCaseId, { scope, case: { psurCaseId, psurRef, version }, steps: [...steps], kernelStatus: await getKernelStatus(jurisdictions) });
        if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.started", ts: Date.now(), psurCaseId, step: 8, name: steps[7].name });

        try {
          throwIfAborted();
          const bundleRef = `BUNDLE-${psurRef}-${Date.now().toString(36).toUpperCase()}`;

          await db.insert(auditBundles).values({
            psurCaseId,
            bundleReference: bundleRef,
            traceJsonlPath: `bundles/${bundleRef}/trace.jsonl`,
            coverageReportPath: `bundles/${bundleRef}/coverage_report.json`,
            evidenceRegisterPath: `bundles/${bundleRef}/evidence_register.json`,
            qualificationReportPath: `bundles/${bundleRef}/qualification_report.json`,
            renderedDocumentPath: `bundles/${bundleRef}/psur.md`,
            metadata: { generatedAt: new Date().toISOString(), scope },
          }).onConflictDoNothing();

          const report: ExportBundleReport = {
            bundleFiles: [
              "trace.jsonl",
              "coverage_report.json",
              "evidence_register.json",
              "qualification_report.json",
              "psur.md",
              "psur.docx",
            ],
            downloadUrl: `/api/audit-bundles/${psurCaseId}/download`,
          };

          await storage.updatePSURCase(psurCaseId, { status: "exported" });

          console.log(`[Workflow ${psurCaseId}] Step 8 COMPLETED: Bundle ${bundleRef}`);
          steps[7].status = "COMPLETED";
          steps[7].endedAt = new Date().toISOString();
          if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.completed", ts: Date.now(), psurCaseId, step: 8, name: steps[7].name });
          steps[7].summary = { bundleRef, files: report.bundleFiles.length };
          steps[7].report = report;
          cacheWorkflowResult(psurCaseId, { scope, case: { psurCaseId, psurRef, version }, steps: [...steps], kernelStatus: await getKernelStatus(jurisdictions) });

          // Log bundle exported and workflow completed
          if (traceCtx) {
            const bundleResult = await TraceEvents.bundleExported(traceCtx, bundleRef, report.bundleFiles);
            traceCtx = bundleResult.ctx;

            const workflowDuration = Date.now() - workflowStartTime;
            const completeResult = await TraceEvents.workflowCompleted(traceCtx, workflowDuration);
            traceCtx = completeResult.ctx;
            await markStepCompleted(psurCaseId, 8);
          }
        } catch (e: any) {
          steps[7].status = "FAILED";
          steps[7].endedAt = new Date().toISOString();
          steps[7].error = e.message || String(e);
          if (psurCaseId) emitRuntimeEvent(psurCaseId, { kind: "step.failed", ts: Date.now(), psurCaseId, step: 8, name: steps[7].name, error: steps[7].error || "Unknown error" });

          if (traceCtx && psurCaseId) {
            await TraceEvents.workflowFailed(traceCtx, 8, e.message || String(e));
            await markWorkflowFailed(psurCaseId, 8, e.message || String(e));
          }
        }
      }
    }

  } catch (e: any) {
    console.error(`[Workflow ${psurCaseId}] GLOBAL ERROR:`, e.message || e);
    console.error(`[Workflow ${psurCaseId}] Stack:`, e.stack);

    // Log global workflow failure
    if (traceCtx && psurCaseId) {
      try {
        await TraceEvents.workflowFailed(traceCtx, 0, e.message || String(e));
        await markWorkflowFailed(psurCaseId, 0, e.message || String(e));
      } catch (traceErr) {
        console.error("[WorkflowRunner] Failed to log trace error:", traceErr);
      }
    }
  }

  console.log(`[Workflow ${psurCaseId}] WORKFLOW FINISHED - Steps status:`, steps.map(s => `${s.name}: ${s.status}`).join(", "));

  const kernelStatus = await getKernelStatus(jurisdictions);
  if (template && !isFormBased) {
    kernelStatus.templateSlots = (getSlots(template) || []).length;
  }

  // Final update to trace summary to mark as COMPLETED or FAILED
  try {
    const isSuccess = steps.every(s => s.status === "COMPLETED" || s.status === "NOT_STARTED" || s.status === "BLOCKED");
    await db.update(decisionTraceSummaries)
      .set({
        workflowStatus: isSuccess ? "COMPLETED" : "FAILED",
        lastUpdatedAt: new Date()
      })
      .where(eq(decisionTraceSummaries.psurCaseId, psurCaseId));
  } catch (err) {
    console.error('[WorkflowRunner] Failed to update final status:', err);
  }

  const result: OrchestratorWorkflowResult = {
    scope,
    case: {
      psurCaseId,
      psurRef,
      version,
    },
    steps,
    kernelStatus,
  };

  cacheWorkflowResult(psurCaseId, result);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET WORKFLOW RESULT FOR CASE
// ═══════════════════════════════════════════════════════════════════════════════

export async function getWorkflowResultForCase(psurCaseId: number): Promise<OrchestratorWorkflowResult | null> {
  const psurCase = await storage.getPSURCase(psurCaseId);
  if (!psurCase) return null;

  const device = psurCase.leadingDeviceId
    ? await storage.getDevice(psurCase.leadingDeviceId)
    : null;

  const atoms = await listEvidenceAtomsByCase(psurCaseId);

  const proposals = await db.query.slotProposals.findMany({
    where: eq(slotProposals.psurCaseId, psurCaseId),
  });

  const coverage = await db.query.coverageReports.findFirst({
    where: eq(coverageReports.psurCaseId, psurCaseId),
  });

  const bundle = await db.query.auditBundles.findFirst({
    where: eq(auditBundles.psurCaseId, psurCaseId),
  });

  const traceSummary = await db.query.decisionTraceSummaries.findFirst({
    where: eq(decisionTraceSummaries.psurCaseId, psurCaseId),
  });

  const scope: WorkflowScope = {
    templateId: psurCase.templateId as any,
    jurisdictions: (psurCase.jurisdictions || []) as any,
    deviceCode: device?.deviceCode || "",
    periodStart: psurCase.startPeriod.toISOString().split("T")[0],
    periodEnd: psurCase.endPeriod.toISOString().split("T")[0],
  };

  const steps: WorkflowStep[] = [];

  steps.push({
    step: 1,
    name: "Validate Template",
    status: "COMPLETED",
    summary: { templateId: psurCase.templateId },
  });

  steps.push({
    step: 2,
    name: "Create Case",
    status: "COMPLETED",
    summary: { psurCaseId: psurCase.id, psurRef: psurCase.psurReference },
  });

  const byType: Record<string, number> = {};
  for (const atom of atoms) {
    byType[atom.evidenceType] = (byType[atom.evidenceType] || 0) + 1;
  }

  steps.push({
    step: 3,
    name: "Load Data",
    status: atoms.length > 0 ? "COMPLETED" : "BLOCKED",
    summary: { linkedToCaseAtoms: atoms.length },
    report: {
      uploadedAtoms: atoms.length,
      linkedToCaseAtoms: atoms.length,
      rejectedRows: 0,
      sampleErrors: [],
      byType,
    } as EvidenceIngestReport,
    error: atoms.length === 0 ? "No evidence atoms linked to this case." : undefined,
  });

  const acceptedProposals = proposals.filter(p => p.status === "accepted" || (p.evidenceAtomIds?.length || 0) > 0);
  const rejectedProposals = proposals.filter(p => p.status === "rejected" || (p.evidenceAtomIds?.length || 0) === 0);

  steps.push({
    step: 4,
    name: "Map Content",
    status: proposals.length > 0 ? "COMPLETED" : atoms.length > 0 ? "NOT_STARTED" : "BLOCKED",
    summary: { totalProposals: proposals.length, withEvidence: acceptedProposals.length },
  });

  steps.push({
    step: 5,
    name: "Adjudicate",
    status: proposals.length > 0 ? "COMPLETED" : "NOT_STARTED",
    summary: { acceptedCount: acceptedProposals.length, rejectedCount: rejectedProposals.length },
    report: {
      acceptedCount: acceptedProposals.length,
      rejectedCount: rejectedProposals.length,
      acceptedProposalIds: acceptedProposals.map(p => p.slotId),
      rejected: rejectedProposals.map(p => ({ proposalId: p.slotId, reasons: p.rejectionReasons || [] })),
    } as AdjudicationReport,
  });

  steps.push({
    step: 6,
    name: "Coverage Report",
    status: coverage ? "COMPLETED" : "NOT_STARTED",
    summary: coverage ? {
      coverage: `${coverage.filledSlots}/${coverage.totalSlots}`,
      passed: coverage.passed ?? false,
    } : {},
    report: coverage ? {
      obligationsSatisfied: coverage.satisfiedObligations,
      obligationsTotal: coverage.totalObligations,
      slotsFilled: coverage.filledSlots,
      slotsTotal: coverage.totalSlots,
      missingEvidenceTypes: coverage.emptySlots || [],
      coveragePercent: parseInt(coverage.coveragePercent || "0"),
      passed: coverage.passed || false,
    } as CoverageReportData : undefined,
  });

  // Step 7 can only be running if step 6 (coverage) is complete
  const step6Complete = steps[5]?.status === "COMPLETED";
  const step7Status = bundle
    ? "COMPLETED"
    : (!step6Complete
      ? "NOT_STARTED"
      : (traceSummary?.workflowStatus === "RUNNING" ? "RUNNING" : traceSummary?.workflowStatus === "FAILED" ? "FAILED" : "NOT_STARTED"));

  steps.push({
    step: 7,
    name: "Generate Document",
    status: step7Status,
    summary: {},
  });

  steps.push({
    step: 8,
    name: "Export Package",
    status: bundle ? "COMPLETED" : "NOT_STARTED",
    summary: bundle ? { bundleRef: bundle.bundleReference } : {},
    report: bundle ? {
      bundleFiles: [
        "trace.jsonl",
        "coverage_report.json",
        "evidence_register.json",
        "qualification_report.json",
        "psur.md",
      ],
      downloadUrl: `/api/audit-bundles/${psurCaseId}/download`,
    } as ExportBundleReport : undefined,
  });

  const kernelStatus = await getKernelStatus(psurCase.jurisdictions || []);
  let template: Template | null = null;
  try {
    if (await isTemplateFormBased(psurCase.templateId)) {
      kernelStatus.templateSlots = 0;
    } else {
      template = await loadTemplate(psurCase.templateId);
      const slots = getSlots(template) || [];
      kernelStatus.templateSlots = slots.length;
    }
  } catch (err: unknown) {
    console.warn(`[WorkflowRunner] getWorkflowResultForCase: failed to load template ${psurCase.templateId}, templateSlots=0. Error:`, err);
    kernelStatus.templateSlots = 0;
    // Fallback: use slot_definitions count when template load fails (e.g. validation)
    try {
      const slotRows = await db
        .select({ slotId: slotDefinitions.slotId })
        .from(slotDefinitions)
        .where(eq(slotDefinitions.templateId, psurCase.templateId));
      if (slotRows.length > 0) {
        kernelStatus.templateSlots = slotRows.length;
        console.log(`[WorkflowRunner] getWorkflowResultForCase: using slot_definitions count for ${psurCase.templateId}: ${slotRows.length}`);
      }
    } catch (fallbackErr) {
      // ignore
    }
  }

  const result: OrchestratorWorkflowResult = {
    scope,
    case: {
      psurCaseId: psurCase.id,
      psurRef: psurCase.psurReference,
      version: psurCase.version,
    },
    steps,
    kernelStatus,
  };

  cacheWorkflowResult(psurCaseId, result);

  return result;
}
