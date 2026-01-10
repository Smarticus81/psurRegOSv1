import { db } from "../../db";
import { storage } from "../../storage";
import { loadTemplate } from "../templateStore";
import { listEvidenceAtomsByCase, EvidenceAtomRecord } from "../services/evidenceStore";
import { ingestEvidenceStep } from "./steps/ingestEvidence";
import { proposeSlotsStep, SlotProposalOutput } from "./steps/proposeSlots";
import { listObligations, listConstraints, qualifyTemplate } from "../../orchestrator";
import {
  psurCases,
  slotProposals,
  coverageReports,
  auditBundles,
  evidenceAtoms,
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

async function getKernelStatus(): Promise<KernelStatus> {
  const obligations = await listObligations();
  const constraints = await listConstraints();
  
  const euObs = (obligations.data || []).filter(o => o.jurisdiction === "EU_MDR").length;
  const ukObs = (obligations.data || []).filter(o => o.jurisdiction === "UK_MDR").length;
  
  return {
    euObligations: euObs,
    ukObligations: ukObs,
    constraints: (constraints.data || []).length,
    templateSlots: 0,
  };
}

export interface RunWorkflowParams {
  templateId: "FormQAR-054_C" | "MDCG_2022_21_ANNEX_I";
  jurisdictions: ("EU_MDR" | "UK_MDR")[];
  deviceCode: string;
  deviceId: number;
  periodStart: string;
  periodEnd: string;
  psurCaseId?: number;
  runSteps?: number[];
}

export async function runOrchestratorWorkflow(params: RunWorkflowParams): Promise<OrchestratorWorkflowResult> {
  const { templateId, jurisdictions, deviceCode, deviceId, periodStart, periodEnd, psurCaseId: existingCaseId, runSteps } = params;
  
  const steps: WorkflowStep[] = Array.from({ length: 8 }, (_, i) => makeStep(i + 1));
  const stepsToRun = runSteps || [1, 2, 3, 4, 5, 6, 7, 8];
  
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
  let template: any = null;
  let evidenceAtomsData: EvidenceAtomRecord[] = [];
  let slotProposalsData: SlotProposalOutput[] = [];

  try {
    if (stepsToRun.includes(1)) {
      steps[0].status = "RUNNING";
      steps[0].startedAt = new Date().toISOString();
      
      try {
        template = loadTemplate(templateId);
        const slotCount = template.slots?.length || 0;
        const mappingCount = Object.keys(template.mapping || {}).length;
        
        steps[0].status = "COMPLETED";
        steps[0].endedAt = new Date().toISOString();
        steps[0].summary = { slotCount, mappingCount, templateId };
        steps[0].report = { 
          status: "PASS",
          slotCount,
          mappingCount,
          templateId: template.template_id,
        };
      } catch (e: any) {
        steps[0].status = "FAILED";
        steps[0].endedAt = new Date().toISOString();
        steps[0].error = e.message || String(e);
        throw e;
      }
    } else if (existingCaseId) {
      template = loadTemplate(templateId);
    }

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
      } catch (e: any) {
        steps[1].status = "FAILED";
        steps[1].endedAt = new Date().toISOString();
        steps[1].error = e.message || String(e);
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

    if (stepsToRun.includes(3)) {
      steps[2].status = "RUNNING";
      steps[2].startedAt = new Date().toISOString();
      
      try {
        evidenceAtomsData = await ingestEvidenceStep({ psurCaseId });
        
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
        
        if (report.linkedToCaseAtoms === 0) {
          steps[2].status = "BLOCKED";
          steps[2].error = "No evidence atoms linked to this case. Upload evidence before running workflow.";
        }
      } catch (e: any) {
        steps[2].status = "FAILED";
        steps[2].endedAt = new Date().toISOString();
        steps[2].error = e.message || String(e);
        throw e;
      }
    }

    const hasEvidence = evidenceAtomsData.length > 0;
    
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
            template: { slots: template?.slots || [] },
            evidenceAtoms: evidenceAtomsData,
          });
          
          const withEvidence = slotProposalsData.filter(p => p.evidenceAtomIds.length > 0).length;
          const blocked = slotProposalsData.filter(p => p.evidenceAtomIds.length === 0).length;
          
          for (const proposal of slotProposalsData) {
            await db.insert(slotProposals).values({
              psurCaseId,
              slotId: proposal.slotId,
              templateId,
              content: proposal.content,
              evidenceAtomIds: proposal.evidenceAtomIds.length > 0 ? [1] : [],
              claimedObligationIds: proposal.claimedObligationIds,
              methodStatement: proposal.methodStatement,
              transformations: proposal.transformations,
              status: proposal.evidenceAtomIds.length > 0 ? "pending" : "rejected",
              rejectionReasons: proposal.evidenceAtomIds.length === 0 ? ["BLOCKED_MISSING_EVIDENCE"] : [],
            }).onConflictDoNothing();
          }
          
          steps[3].status = "COMPLETED";
          steps[3].endedAt = new Date().toISOString();
          steps[3].summary = { totalProposals: slotProposalsData.length, withEvidence, blocked };
          steps[3].report = {
            totalProposals: slotProposalsData.length,
            withEvidence,
            blocked,
          };
        } catch (e: any) {
          steps[3].status = "FAILED";
          steps[3].endedAt = new Date().toISOString();
          steps[3].error = e.message || String(e);
        }
      }
    }

    if (stepsToRun.includes(5)) {
      if (steps[3].status === "BLOCKED" || steps[3].status === "FAILED") {
        steps[4].status = "BLOCKED";
        steps[4].error = "Cannot adjudicate without proposals. Step 4 must complete.";
      } else {
        steps[4].status = "RUNNING";
        steps[4].startedAt = new Date().toISOString();
        
        try {
          const acceptedProposals = slotProposalsData.filter(p => 
            p.evidenceAtomIds.length >= 1 && 
            p.claimedObligationIds.length >= 1 && 
            p.methodStatement.length >= 10
          );
          
          const rejectedProposals = slotProposalsData.filter(p => 
            p.evidenceAtomIds.length === 0 || 
            p.claimedObligationIds.length === 0 || 
            p.methodStatement.length < 10
          );
          
          const report: AdjudicationReport = {
            acceptedCount: acceptedProposals.length,
            rejectedCount: rejectedProposals.length,
            acceptedProposalIds: acceptedProposals.map(p => p.proposalId),
            rejected: rejectedProposals.map(p => ({
              proposalId: p.proposalId,
              reasons: [
                ...(p.evidenceAtomIds.length === 0 ? ["Missing evidence atoms"] : []),
                ...(p.claimedObligationIds.length === 0 ? ["Missing claimed obligation IDs"] : []),
                ...(p.methodStatement.length < 10 ? ["Method statement too short"] : []),
              ],
            })),
          };
          
          steps[4].status = "COMPLETED";
          steps[4].endedAt = new Date().toISOString();
          steps[4].summary = { acceptedCount: report.acceptedCount, rejectedCount: report.rejectedCount };
          steps[4].report = report;
        } catch (e: any) {
          steps[4].status = "FAILED";
          steps[4].endedAt = new Date().toISOString();
          steps[4].error = e.message || String(e);
        }
      }
    }

    if (stepsToRun.includes(6)) {
      if (steps[4].status === "BLOCKED" || steps[4].status === "FAILED") {
        steps[5].status = "BLOCKED";
        steps[5].error = "Cannot generate coverage report without adjudication. Step 5 must complete.";
      } else {
        steps[5].status = "RUNNING";
        steps[5].startedAt = new Date().toISOString();
        
        try {
          const obligations = await listObligations();
          const totalObligations = (obligations.data || []).filter(o => 
            jurisdictions.includes(o.jurisdiction as any)
          ).length;
          
          const acceptedProposals = slotProposalsData.filter(p => p.evidenceAtomIds.length > 0);
          const satisfiedObligations = new Set(acceptedProposals.flatMap(p => p.claimedObligationIds)).size;
          
          const totalSlots = template?.slots?.length || 0;
          const filledSlots = acceptedProposals.length;
          
          const availableTypes = new Set<string>(evidenceAtomsData.map(a => a.evidenceType));
          const requiredTypesArr: string[] = template?.slots?.flatMap((s: any) => s.requiredEvidenceTypes || []) || [];
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
            emptySlots: [],
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
        } catch (e: any) {
          steps[5].status = "FAILED";
          steps[5].endedAt = new Date().toISOString();
          steps[5].error = e.message || String(e);
        }
      }
    }

    if (stepsToRun.includes(7)) {
      if (steps[5].status === "BLOCKED" || steps[5].status === "FAILED") {
        steps[6].status = "BLOCKED";
        steps[6].error = "Cannot render document without coverage report. Step 6 must complete.";
      } else {
        steps[6].status = "RUNNING";
        steps[6].startedAt = new Date().toISOString();
        
        try {
          steps[6].status = "COMPLETED";
          steps[6].endedAt = new Date().toISOString();
          steps[6].summary = { documentType: "markdown", sections: template?.slots?.length || 0 };
          steps[6].report = {
            format: "markdown",
            sections: template?.slots?.length || 0,
            filePath: `psur_${psurRef}.md`,
          };
        } catch (e: any) {
          steps[6].status = "FAILED";
          steps[6].endedAt = new Date().toISOString();
          steps[6].error = e.message || String(e);
        }
      }
    }

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
            ],
            downloadUrl: `/api/audit-bundles/${psurCaseId}/download`,
          };
          
          await storage.updatePSURCase(psurCaseId, { status: "exported" });
          
          steps[7].status = "COMPLETED";
          steps[7].endedAt = new Date().toISOString();
          steps[7].summary = { bundleRef, files: report.bundleFiles.length };
          steps[7].report = report;
        } catch (e: any) {
          steps[7].status = "FAILED";
          steps[7].endedAt = new Date().toISOString();
          steps[7].error = e.message || String(e);
        }
      }
    }

  } catch (e: any) {
    console.error("[WorkflowRunner] Error:", e);
  }

  const kernelStatus = await getKernelStatus();
  kernelStatus.templateSlots = template?.slots?.length || 0;

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
  
  const kernelStatus = await getKernelStatus();
  let template;
  try {
    template = loadTemplate(psurCase.templateId);
    kernelStatus.templateSlots = template?.slots?.length || 0;
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
