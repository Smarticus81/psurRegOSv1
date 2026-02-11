/**
 * HITL (Human-in-the-Loop) & Provenance API Routes
 *
 * Provides endpoints for:
 *   - Submitting section approval/revision decisions
 *   - Querying pending approval gates
 *   - Querying provenance audit reports
 *   - Decision log (audit trail)
 */

import type { Express, Request, Response } from "express";
import {
  submitDecision,
  getPendingGates,
  getDecisionLog,
  cancelAllGates,
  hasPendingGates,
} from "./services/hitlApprovalService";
import {
  ProvenanceRegistry,
} from "./services/provenanceRegistry";

export function registerHITLRoutes(app: Express): void {
  // ═══════════════════════════════════════════════════════════════════════════
  // HITL APPROVAL ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/compilation/:psurCaseId/approve
   * Submit an approval or revision decision for a pending gate.
   *
   * Body: { gateId: string, status: "approved" | "revision_requested", feedback?: string }
   */
  app.post("/api/compilation/:psurCaseId/approve", (req: Request, res: Response) => {
    const psurCaseId = parseInt(req.params.psurCaseId, 10);
    if (isNaN(psurCaseId)) {
      return res.status(400).json({ error: "Invalid psurCaseId" });
    }

    const { gateId, status, feedback, reviewedBy } = req.body;

    if (!gateId || !status) {
      return res.status(400).json({ error: "gateId and status are required" });
    }

    if (status !== "approved" && status !== "revision_requested") {
      return res.status(400).json({ error: "status must be 'approved' or 'revision_requested'" });
    }

    const resolved = submitDecision(psurCaseId, gateId, status, feedback, reviewedBy);

    if (!resolved) {
      return res.status(404).json({ error: "Gate not found or already resolved" });
    }

    return res.json({
      success: true,
      gateId,
      status,
      message: status === "approved"
        ? "Section approved, continuing to next section"
        : "Revision requested, re-generating section with feedback",
    });
  });

  /**
   * GET /api/compilation/:psurCaseId/pending-gates
   * Get all pending approval gates for a PSUR case.
   * Used by the client to restore approval UI after reconnection.
   */
  app.get("/api/compilation/:psurCaseId/pending-gates", (req: Request, res: Response) => {
    const psurCaseId = parseInt(req.params.psurCaseId, 10);
    if (isNaN(psurCaseId)) {
      return res.status(400).json({ error: "Invalid psurCaseId" });
    }

    const gates = getPendingGates(psurCaseId);
    return res.json({
      psurCaseId,
      pendingCount: gates.length,
      gates,
    });
  });

  /**
   * GET /api/compilation/:psurCaseId/decision-log
   * Get the full decision log (audit trail) for a PSUR case.
   */
  app.get("/api/compilation/:psurCaseId/decision-log", (req: Request, res: Response) => {
    const psurCaseId = parseInt(req.params.psurCaseId, 10);
    if (isNaN(psurCaseId)) {
      return res.status(400).json({ error: "Invalid psurCaseId" });
    }

    const log = getDecisionLog(psurCaseId);
    return res.json({
      psurCaseId,
      totalDecisions: log.length,
      decisions: log,
    });
  });

  /**
   * POST /api/compilation/:psurCaseId/cancel-gates
   * Cancel all pending approval gates (used when workflow is cancelled).
   */
  app.post("/api/compilation/:psurCaseId/cancel-gates", (req: Request, res: Response) => {
    const psurCaseId = parseInt(req.params.psurCaseId, 10);
    if (isNaN(psurCaseId)) {
      return res.status(400).json({ error: "Invalid psurCaseId" });
    }

    const cancelled = cancelAllGates(psurCaseId);
    return res.json({
      psurCaseId,
      cancelledGates: cancelled,
    });
  });

  /**
   * GET /api/compilation/:psurCaseId/hitl-status
   * Quick check if there are pending gates.
   */
  app.get("/api/compilation/:psurCaseId/hitl-status", (req: Request, res: Response) => {
    const psurCaseId = parseInt(req.params.psurCaseId, 10);
    if (isNaN(psurCaseId)) {
      return res.status(400).json({ error: "Invalid psurCaseId" });
    }

    return res.json({
      psurCaseId,
      hasPendingGates: hasPendingGates(psurCaseId),
      pendingCount: getPendingGates(psurCaseId).length,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROVENANCE ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/provenance/:psurCaseId/audit-report
   * Get the full provenance audit report for a PSUR case.
   */
  app.get("/api/provenance/:psurCaseId/audit-report", (req: Request, res: Response) => {
    const psurCaseId = parseInt(req.params.psurCaseId, 10);
    if (isNaN(psurCaseId)) {
      return res.status(400).json({ error: "Invalid psurCaseId" });
    }

    const report = ProvenanceRegistry.generateAuditReport(psurCaseId);
    return res.json(report);
  });

  /**
   * GET /api/provenance/:psurCaseId/nodes
   * Get all provenance nodes for a PSUR case.
   */
  app.get("/api/provenance/:psurCaseId/nodes", (req: Request, res: Response) => {
    const psurCaseId = parseInt(req.params.psurCaseId, 10);
    if (isNaN(psurCaseId)) {
      return res.status(400).json({ error: "Invalid psurCaseId" });
    }

    const nodes = ProvenanceRegistry.getByPsurCase(psurCaseId);
    return res.json({
      psurCaseId,
      totalNodes: nodes.length,
      nodes,
    });
  });

  /**
   * GET /api/provenance/:psurCaseId/slot/:slotId
   * Get provenance nodes for a specific slot.
   */
  app.get("/api/provenance/:psurCaseId/slot/:slotId", (req: Request, res: Response) => {
    const psurCaseId = parseInt(req.params.psurCaseId, 10);
    const slotId = req.params.slotId;
    if (isNaN(psurCaseId)) {
      return res.status(400).json({ error: "Invalid psurCaseId" });
    }

    const nodes = ProvenanceRegistry.getBySlot(psurCaseId, slotId);
    return res.json({
      psurCaseId,
      slotId,
      totalNodes: nodes.length,
      nodes,
    });
  });

  /**
   * GET /api/provenance/:psurCaseId/chain/:nodeId
   * Get the full provenance chain (trace back to source) for a node.
   */
  app.get("/api/provenance/:psurCaseId/chain/:nodeId", (req: Request, res: Response) => {
    const nodeId = req.params.nodeId;
    const chain = ProvenanceRegistry.getProvenanceChain(nodeId);
    return res.json({
      nodeId,
      chainLength: chain.length,
      chain,
    });
  });

  console.log("[Routes] HITL approval & provenance routes registered");
}
