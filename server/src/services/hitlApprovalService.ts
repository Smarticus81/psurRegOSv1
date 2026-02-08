/**
 * Human-in-the-Loop (HITL) Approval Service
 *
 * Manages pause/resume gates during PSUR document generation.
 * After each section is generated, the workflow pauses and waits
 * for explicit human approval or revision feedback before continuing.
 *
 * Flow:
 *   1. CompileOrchestrator generates a section (narrative, table, chart)
 *   2. It calls `requestApproval(...)` which emits an SSE event and blocks
 *   3. The client shows the content with Approve / Request Revision buttons
 *   4. The client POSTs the decision to `/api/compilation/:id/approve`
 *   5. The route handler calls `submitDecision(...)` which resolves the promise
 *   6. The CompileOrchestrator continues with the next section (or re-runs)
 *
 * All pending gates are tracked in-memory per psurCaseId.
 * If the workflow is cancelled, all pending gates are rejected.
 */

import { v4 as uuidv4 } from "uuid";
import { emitRuntimeEvent } from "../orchestrator/workflowRunner";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ApprovalStatus = "pending" | "approved" | "revision_requested" | "skipped";

export interface ApprovalRequest {
  gateId: string;
  psurCaseId: number;
  slotId: string;
  sectionTitle: string;
  slotKind: "NARRATIVE" | "TABLE" | "CHART" | "ADMIN";
  generatedContent: string;
  confidence: number;
  evidenceAtomIds: string[];
  agentName: string;
  generatedAt: Date;
  wordCount: number;
}

export interface ApprovalDecision {
  gateId: string;
  status: "approved" | "revision_requested";
  feedback?: string;
  reviewedBy?: string;
  reviewedAt: Date;
}

interface PendingGate {
  request: ApprovalRequest;
  resolve: (decision: ApprovalDecision) => void;
  reject: (reason: Error) => void;
  createdAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IN-MEMORY GATE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/** Map<psurCaseId, Map<gateId, PendingGate>> */
const pendingGates = new Map<number, Map<string, PendingGate>>();

/** Completed decisions log for audit trail */
const decisionLog = new Map<number, ApprovalDecision[]>();

// ═══════════════════════════════════════════════════════════════════════════════
// CORE API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Request human approval for a generated section.
 * Blocks until the human submits a decision via `submitDecision()`.
 * Emits an SSE `await_approval` event to all connected clients.
 *
 * @returns The human's decision (approved or revision_requested with feedback)
 */
export function requestApproval(
  request: Omit<ApprovalRequest, "gateId" | "generatedAt" | "wordCount">
): Promise<ApprovalDecision> {
  const gateId = uuidv4();
  const wordCount = request.generatedContent.split(/\s+/).filter(Boolean).length;

  const fullRequest: ApprovalRequest = {
    ...request,
    gateId,
    generatedAt: new Date(),
    wordCount,
  };

  return new Promise<ApprovalDecision>((resolve, reject) => {
    // Register the gate
    if (!pendingGates.has(request.psurCaseId)) {
      pendingGates.set(request.psurCaseId, new Map());
    }
    pendingGates.get(request.psurCaseId)!.set(gateId, {
      request: fullRequest,
      resolve,
      reject,
      createdAt: Date.now(),
    });

    // Emit SSE event so the client knows to show the approval UI
    emitRuntimeEvent(request.psurCaseId, {
      kind: "hitl.await_approval" as any,
      ts: Date.now(),
      psurCaseId: request.psurCaseId,
      gateId,
      slotId: request.slotId,
      sectionTitle: request.sectionTitle,
      slotKind: request.slotKind,
      content: request.generatedContent,
      confidence: request.confidence,
      evidenceAtomIds: request.evidenceAtomIds,
      agentName: request.agentName,
      wordCount,
    } as any);

    console.log(
      `[HITL] Approval gate ${gateId} opened for slot ${request.slotId} ` +
      `(${request.sectionTitle}) — ${wordCount} words, ` +
      `${(request.confidence * 100).toFixed(0)}% confidence`
    );
  });
}

/**
 * Submit a human decision for a pending approval gate.
 * Resolves the blocked promise in the CompileOrchestrator.
 *
 * @returns true if the gate was found and resolved, false if not found
 */
export function submitDecision(
  psurCaseId: number,
  gateId: string,
  status: "approved" | "revision_requested",
  feedback?: string,
  reviewedBy?: string
): boolean {
  const caseGates = pendingGates.get(psurCaseId);
  if (!caseGates) return false;

  const gate = caseGates.get(gateId);
  if (!gate) return false;

  const decision: ApprovalDecision = {
    gateId,
    status,
    feedback,
    reviewedBy,
    reviewedAt: new Date(),
  };

  // Log the decision
  if (!decisionLog.has(psurCaseId)) {
    decisionLog.set(psurCaseId, []);
  }
  decisionLog.get(psurCaseId)!.push(decision);

  // Emit SSE event confirming the decision
  emitRuntimeEvent(psurCaseId, {
    kind: "hitl.decision_received" as any,
    ts: Date.now(),
    psurCaseId,
    gateId,
    slotId: gate.request.slotId,
    status,
    feedback: feedback || null,
  } as any);

  console.log(
    `[HITL] Decision received for gate ${gateId}: ${status}` +
    (feedback ? ` — feedback: "${feedback.substring(0, 100)}"` : "")
  );

  // Resolve the promise — this unblocks the CompileOrchestrator
  gate.resolve(decision);
  caseGates.delete(gateId);

  if (caseGates.size === 0) {
    pendingGates.delete(psurCaseId);
  }

  return true;
}

/**
 * Get all pending approval gates for a PSUR case.
 * Used by the client to restore state after reconnection.
 */
export function getPendingGates(psurCaseId: number): ApprovalRequest[] {
  const caseGates = pendingGates.get(psurCaseId);
  if (!caseGates) return [];
  return Array.from(caseGates.values()).map(g => g.request);
}

/**
 * Get the decision log for a PSUR case (audit trail).
 */
export function getDecisionLog(psurCaseId: number): ApprovalDecision[] {
  return decisionLog.get(psurCaseId) || [];
}

/**
 * Cancel all pending gates for a PSUR case.
 * Called when the workflow is cancelled.
 */
export function cancelAllGates(psurCaseId: number): number {
  const caseGates = pendingGates.get(psurCaseId);
  if (!caseGates) return 0;

  let cancelled = 0;
  caseGates.forEach((gate, gateId) => {
    gate.reject(new Error("Workflow cancelled"));
    cancelled++;
  });

  pendingGates.delete(psurCaseId);
  console.log(`[HITL] Cancelled ${cancelled} pending gates for case ${psurCaseId}`);
  return cancelled;
}

/**
 * Auto-approve a gate (used when HITL is disabled).
 */
export function autoApprove(psurCaseId: number, gateId: string): boolean {
  return submitDecision(psurCaseId, gateId, "approved", undefined, "auto-approve");
}

/**
 * Check if any gates are pending for a case.
 */
export function hasPendingGates(psurCaseId: number): boolean {
  const caseGates = pendingGates.get(psurCaseId);
  return !!caseGates && caseGates.size > 0;
}
