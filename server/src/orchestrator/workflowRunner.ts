import { db } from "../../db";
import { storage } from "../../storage";
import { loadTemplate, getSlots, getEffectiveMapping, getTemplateDefaults, type Template } from "../templateStore";
import { lintTemplate, type LintResult } from "../templates/lintTemplates";
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
import {
  psurCases,
  slotProposals,
  coverageReports,
  auditBundles,
  evidenceAtoms,
  qualificationReports,
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

const STEP_NAMES: Record<number, string> = {
  1: "Qualify Template",
  2: "Create Case",
  3: "Ingest Evidence",
  4: "Build Queue & Propose",
  5: "Adjudicate",
  6: "Coverage Report",
  7: "Render Document",
  8: "Export Bundle",
};

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
  templateId: "MDCG_2022_21_ANNEX_I";
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
  const { templateId, jurisdictions, deviceCode, deviceId, periodStart, periodEnd, psurCaseId: existingCaseId, runSteps, enableAIGeneration } = params;

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
  let evidenceAtomsData: EvidenceAtomRecord[] = [];
  let slotProposalsData: SlotProposalOutput[] = [];
  let qualificationBlocked = false;
  
  // Initialize decision trace
  let traceCtx: TraceContext | null = null;
  
  try {
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

    // ==================== STEP 1: QUALIFY TEMPLATE ====================
    if (stepsToRun.includes(1)) {
      steps[0].status = "RUNNING";
      steps[0].startedAt = new Date().toISOString();

      try {
        // 1a. Lint template JSON against strict Zod schema
        const templatesDir = path.resolve(process.cwd(), "server", "templates");
        const templatePath = path.join(templatesDir, `${templateId}.json`);
        const lintResult: LintResult = await lintTemplate(templatePath);
        
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

        // 1b. Load template structure (now guaranteed valid)
        template = loadTemplate(templateId);
        const effectiveSlots = getSlots(template);
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
      } catch (e: any) {
        steps[0].status = "FAILED";
        steps[0].endedAt = new Date().toISOString();
        steps[0].error = e.message || String(e);
        
        // Log workflow failure
        if (traceCtx && psurCaseId) {
          await TraceEvents.workflowFailed(traceCtx, 1, e.message || String(e));
          await markWorkflowFailed(psurCaseId, 1, e.message || String(e));
        }
        throw e;
      }
    } else if (existingCaseId) {
      template = loadTemplate(templateId);
    }

    // ==================== STEP 2: CREATE CASE ====================
    if (stepsToRun.includes(2)) {
      steps[1].status = "RUNNING";
      steps[1].startedAt = new Date().toISOString();

      try {
        if (existingCaseId) {
          const existingCase = await storage.getPSURCase(existingCaseId);
          if (existingCase) {
            psurCaseId = existingCase.id;
            psurRef = existingCase.psurReference;
            version = existingCase.version;
          }
        } else {
          const refNum = `PSUR-${Date.now().toString(36).toUpperCase()}`;
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
        
        // Update trace context with case ID and log case created
        if (traceCtx) {
          traceCtx = { ...traceCtx, psurCaseId };
          const caseResult = await TraceEvents.caseCreated(traceCtx, psurRef, psurCaseId);
          traceCtx = caseResult.ctx;
          await markStepCompleted(psurCaseId, 2);
        }
      } catch (e: any) {
        steps[1].status = "FAILED";
        steps[1].endedAt = new Date().toISOString();
        steps[1].error = e.message || String(e);
        
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

      try {
        // Get required evidence types from template for negative evidence generation
        let requiredTypes: string[] = [];
        if (template) {
          const slots = getSlots(template);
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

        // Log evidence atoms created
        if (traceCtx) {
          for (const atom of evidenceAtomsData) {
            const isNegative = atom.normalizedData?.isNegativeEvidence === true;
            if (isNegative) {
              const negResult = await TraceEvents.negativeEvidenceCreated(traceCtx, atom.atomId, atom.evidenceType);
              traceCtx = negResult.ctx;
            } else {
              const atomResult = await TraceEvents.evidenceAtomCreated(
                traceCtx, 
                atom.atomId, 
                atom.evidenceType, 
                atom.provenance?.sourceFile
              );
              traceCtx = atomResult.ctx;
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
        
        if (traceCtx && psurCaseId) {
          await TraceEvents.workflowFailed(traceCtx, 3, e.message || String(e));
          await markWorkflowFailed(psurCaseId, 3, e.message || String(e));
        }
        throw e;
      }
    }

    const hasEvidence = evidenceAtomsData.length > 0;

    // ==================== STEP 4: BUILD QUEUE & PROPOSE ====================
    if (stepsToRun.includes(4)) {
      if (!hasEvidence && steps[2].status !== "COMPLETED") {
        steps[3].status = "BLOCKED";
        steps[3].error = "Cannot build queue without evidence. Step 3 must complete with linkedToCaseAtoms > 0.";
      } else {
        steps[3].status = "RUNNING";
        steps[3].startedAt = new Date().toISOString();

        try {
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

          steps[3].status = "COMPLETED";
          steps[3].endedAt = new Date().toISOString();
          steps[3].summary = { 
            totalProposals: slotProposalsData.length, 
            ready: readyCount,
            traceGaps: traceGapCount,
            noEvidenceRequired: noEvidenceRequiredCount,
          };
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
          
          // Log slot proposals
          if (traceCtx) {
            for (const proposal of slotProposalsData) {
              const proposalResult = await TraceEvents.slotProposed(
                traceCtx,
                proposal.slotId,
                proposal.status,
                proposal.evidenceAtomIds,
                proposal.claimedObligationIds
              );
              traceCtx = proposalResult.ctx;
              
              // Log trace gaps
              if (proposal.status === "TRACE_GAP") {
                const gapResult = await TraceEvents.traceGapDetected(
                  traceCtx,
                  proposal.slotId,
                  proposal.requiredTypes
                );
                traceCtx = gapResult.ctx;
              }
            }
            await markStepCompleted(psurCaseId, 4);
          }
        } catch (e: any) {
          steps[3].status = "FAILED";
          steps[3].endedAt = new Date().toISOString();
          steps[3].error = e.message || String(e);
          
          if (traceCtx && psurCaseId) {
            await TraceEvents.workflowFailed(traceCtx, 4, e.message || String(e));
            await markWorkflowFailed(psurCaseId, 4, e.message || String(e));
          }
        }
      }
    }

    // ==================== STEP 5: ADJUDICATE ====================
    if (stepsToRun.includes(5)) {
      if (steps[3].status === "BLOCKED" || steps[3].status === "FAILED") {
        steps[4].status = "BLOCKED";
        steps[4].error = "Cannot adjudicate without proposals. Step 4 must complete.";
      } else {
        steps[4].status = "RUNNING";
        steps[4].startedAt = new Date().toISOString();

        try {
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

          steps[4].status = "COMPLETED";
          steps[4].endedAt = new Date().toISOString();
          steps[4].summary = { acceptedCount: report.acceptedCount, rejectedCount: report.rejectedCount };
          steps[4].report = report;
          
          // Log adjudication decisions
          if (traceCtx) {
            for (const accepted of adjudicationResult.accepted) {
              const acceptResult = await TraceEvents.slotAccepted(
                traceCtx,
                accepted.slotId,
                accepted.evidenceAtomIds,
                ["Passed adjudication rules"]
              );
              traceCtx = acceptResult.ctx;
            }
            
            for (const { proposal, reasons } of adjudicationResult.rejected) {
              const rejectResult = await TraceEvents.slotRejected(traceCtx, proposal.slotId, reasons);
              traceCtx = rejectResult.ctx;
            }
            await markStepCompleted(psurCaseId, 5);
          }
        } catch (e: any) {
          steps[4].status = "FAILED";
          steps[4].endedAt = new Date().toISOString();
          steps[4].error = e.message || String(e);
          
          if (traceCtx && psurCaseId) {
            await TraceEvents.workflowFailed(traceCtx, 5, e.message || String(e));
            await markWorkflowFailed(psurCaseId, 5, e.message || String(e));
          }
        }
      }
    }

    // ==================== STEP 6: COVERAGE REPORT ====================
    if (stepsToRun.includes(6)) {
      if (steps[4].status === "BLOCKED" || steps[4].status === "FAILED") {
        steps[5].status = "BLOCKED";
        steps[5].error = "Cannot generate coverage report without adjudication. Step 5 must complete.";
      } else {
        steps[5].status = "RUNNING";
        steps[5].startedAt = new Date().toISOString();

        try {
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

          steps[5].status = "COMPLETED";
          steps[5].endedAt = new Date().toISOString();
          steps[5].summary = {
            coverage: `${filledSlots}/${totalSlots} slots`,
            obligations: `${satisfiedObligations}/${totalObligations}`,
            passed,
          };
          steps[5].report = report;
          
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
          
          if (traceCtx && psurCaseId) {
            await TraceEvents.workflowFailed(traceCtx, 6, e.message || String(e));
            await markWorkflowFailed(psurCaseId, 6, e.message || String(e));
          }
        }
      }
    }

    // ==================== STEP 7: RENDER DOCUMENT (SOTA Compilation) ====================
    if (stepsToRun.includes(7)) {
      if (steps[5].status === "BLOCKED" || steps[5].status === "FAILED") {
        steps[6].status = "BLOCKED";
        steps[6].error = "Cannot render document without coverage report. Step 6 must complete.";
      } else {
        steps[6].status = "RUNNING";
        steps[6].startedAt = new Date().toISOString();

        try {
          // Use SOTA CompileOrchestrator for document generation
          const { CompileOrchestrator } = await import("../agents/runtime/compileOrchestrator");
          const compileOrchestrator = new CompileOrchestrator();
          
          const documentStyle = params.documentStyle || "corporate";
          const enableCharts = params.enableCharts !== false;
          
          console.log(`[Workflow] Starting SOTA document compilation with style: ${documentStyle}`);
          
          const compileResult = await compileOrchestrator.compile({
            psurCaseId,
            templateId: params.templateId,
            deviceCode: params.deviceCode,
            periodStart: params.periodStart,
            periodEnd: params.periodEnd,
            documentStyle,
            enableCharts,
          });
          
          if (compileResult.success && compileResult.document) {
            // Store the generated document
            const docPath = `bundles/PSUR-${psurRef}/${compileResult.document.filename}`;
            
            steps[6].status = "COMPLETED";
            steps[6].endedAt = new Date().toISOString();
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
            steps[6].report = {
              format: "docx",
              sections: compileResult.sections.length,
              filePath: docPath,
              documentBuffer: compileResult.document.buffer,
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
          } else {
            // Compilation failed
            throw new Error(`Compilation failed: ${compileResult.errors.join("; ")}`);
          }
        } catch (e: any) {
          steps[6].status = "FAILED";
          steps[6].endedAt = new Date().toISOString();
          steps[6].error = e.message || String(e);
          
          if (traceCtx && psurCaseId) {
            await TraceEvents.workflowFailed(traceCtx, 7, e.message || String(e));
            await markWorkflowFailed(psurCaseId, 7, e.message || String(e));
          }
        }
      }
    }

    // ==================== STEP 8: EXPORT BUNDLE ====================
    if (stepsToRun.includes(8)) {
      if (steps[6].status === "BLOCKED" || steps[6].status === "FAILED") {
        steps[7].status = "BLOCKED";
        steps[7].error = "Cannot export bundle without rendered document. Step 7 must complete.";
      } else {
        steps[7].status = "RUNNING";
        steps[7].startedAt = new Date().toISOString();

        try {
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

          steps[7].status = "COMPLETED";
          steps[7].endedAt = new Date().toISOString();
          steps[7].summary = { bundleRef, files: report.bundleFiles.length };
          steps[7].report = report;
          
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
          
          if (traceCtx && psurCaseId) {
            await TraceEvents.workflowFailed(traceCtx, 8, e.message || String(e));
            await markWorkflowFailed(psurCaseId, 8, e.message || String(e));
          }
        }
      }
    }

  } catch (e: any) {
    console.error("[WorkflowRunner] Error:", e);
    
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

  const kernelStatus = await getKernelStatus(jurisdictions);
  if (template) {
    kernelStatus.templateSlots = getSlots(template).length;
  }

  return {
    scope,
    case: {
      psurCaseId,
      psurRef,
      version,
    },
    steps,
    kernelStatus,
  };
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
    name: "Qualify Template",
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
    name: "Ingest Evidence",
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
    name: "Build Queue & Propose",
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

  steps.push({
    step: 7,
    name: "Render Document",
    status: bundle ? "COMPLETED" : "NOT_STARTED",
    summary: {},
  });

  steps.push({
    step: 8,
    name: "Export Bundle",
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
    template = loadTemplate(psurCase.templateId);
    kernelStatus.templateSlots = getSlots(template).length;
  } catch {
    kernelStatus.templateSlots = 0;
  }

  return {
    scope,
    case: {
      psurCaseId: psurCase.id,
      psurRef: psurCase.psurReference,
      version: psurCase.version,
    },
    steps,
    kernelStatus,
  };
}
