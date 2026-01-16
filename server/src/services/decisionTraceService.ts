/**
 * Decision Trace Service
 * 
 * Provides comprehensive, auditable tracing of all PSUR workflow decisions.
 * Each trace entry is hash-verified and linked in a chain for integrity.
 */

import { db } from "../../db";
import { 
  decisionTraceEntries, 
  decisionTraceSummaries,
  DecisionTraceEntry,
  InsertDecisionTraceEntry,
  DecisionTraceSummary,
  DecisionTraceEventType,
  decisionTraceEventTypeEnum
} from "@shared/schema";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TraceContext {
  traceId: string;
  psurCaseId: number;
  templateId?: string;
  jurisdictions?: string[];
  currentSequence: number;
  previousHash: string | null;
}

export interface TraceEventInput {
  eventType: DecisionTraceEventType;
  actor: string;
  entityType?: string;
  entityId?: string;
  decision?: string;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  reasons?: string[];
  relatedEntityIds?: string[];
  workflowStep?: number;
  parentTraceEntryId?: number;
}

export interface TraceQueryOptions {
  psurCaseId?: number;
  traceId?: string;
  eventTypes?: DecisionTraceEventType[];
  entityType?: string;
  entityId?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
  orderBy?: "asc" | "desc";
}

export interface TraceChainValidation {
  valid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  brokenAt?: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HASHING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a deterministic hash of a trace entry's content
 */
function computeEntryHash(entry: Omit<InsertDecisionTraceEntry, "contentHash" | "previousHash">): string {
  const content = {
    traceId: entry.traceId,
    sequenceNum: entry.sequenceNum,
    eventType: entry.eventType,
    eventTimestamp: entry.eventTimestamp,
    actor: entry.actor,
    entityType: entry.entityType,
    entityId: entry.entityId,
    decision: entry.decision,
    inputData: entry.inputData,
    outputData: entry.outputData,
    reasons: entry.reasons,
    relatedEntityIds: entry.relatedEntityIds,
    workflowStep: entry.workflowStep,
    templateId: entry.templateId,
    jurisdictions: entry.jurisdictions,
  };
  
  return createHash("sha256")
    .update(JSON.stringify(content, Object.keys(content).sort()))
    .digest("hex");
}

/**
 * Verify that an entry's hash matches its content
 */
function verifyEntryHash(entry: DecisionTraceEntry): boolean {
  const computed = computeEntryHash({
    traceId: entry.traceId,
    sequenceNum: entry.sequenceNum,
    eventType: entry.eventType as DecisionTraceEventType,
    eventTimestamp: entry.eventTimestamp,
    actor: entry.actor,
    entityType: entry.entityType,
    entityId: entry.entityId,
    decision: entry.decision,
    inputData: entry.inputData as Record<string, unknown>,
    outputData: entry.outputData as Record<string, unknown>,
    reasons: entry.reasons as string[],
    relatedEntityIds: entry.relatedEntityIds as string[],
    workflowStep: entry.workflowStep,
    templateId: entry.templateId,
    jurisdictions: entry.jurisdictions as string[],
    psurCaseId: entry.psurCaseId,
  });
  
  return computed === entry.contentHash;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACE CONTEXT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Start a new trace for a PSUR case
 */
export async function startTrace(
  psurCaseId: number,
  templateId?: string,
  jurisdictions?: string[]
): Promise<TraceContext> {
  const traceId = randomUUID();
  
  // Create or update summary
  await db.insert(decisionTraceSummaries).values({
    psurCaseId,
    traceId,
    totalEvents: 0,
    workflowStatus: "STARTED",
    startedAt: new Date(),
    completedSteps: [],
  }).onConflictDoUpdate({
    target: decisionTraceSummaries.psurCaseId,
    set: {
      traceId,
      totalEvents: 0,
      workflowStatus: "STARTED",
      startedAt: new Date(),
      completedSteps: [],
      acceptedSlots: 0,
      rejectedSlots: 0,
      traceGaps: 0,
      evidenceAtoms: 0,
      negativeEvidence: 0,
      obligationsSatisfied: 0,
      obligationsUnsatisfied: 0,
      failedStep: null,
      failureReason: null,
      chainValid: true,
      lastUpdatedAt: new Date(),
    },
  });
  
  return {
    traceId,
    psurCaseId,
    templateId,
    jurisdictions,
    currentSequence: 0,
    previousHash: null,
  };
}

/**
 * Resume an existing trace for a PSUR case
 */
export async function resumeTrace(psurCaseId: number): Promise<TraceContext | null> {
  // Get the summary
  const summary = await db.query.decisionTraceSummaries.findFirst({
    where: eq(decisionTraceSummaries.psurCaseId, psurCaseId),
  });
  
  if (!summary) return null;
  
  // Get the last entry to continue the chain
  const lastEntry = await db.query.decisionTraceEntries.findFirst({
    where: eq(decisionTraceEntries.traceId, summary.traceId),
    orderBy: desc(decisionTraceEntries.sequenceNum),
  });
  
  return {
    traceId: summary.traceId,
    psurCaseId,
    currentSequence: lastEntry?.sequenceNum || 0,
    previousHash: lastEntry?.contentHash || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACE EVENT LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log a trace event with hash verification
 */
export async function logTraceEvent(
  ctx: TraceContext,
  event: TraceEventInput
): Promise<{ entry: DecisionTraceEntry; ctx: TraceContext }> {
  const sequenceNum = ctx.currentSequence + 1;
  const eventTimestamp = new Date();
  
  // Build the entry (without hash first)
  const entryData: Omit<InsertDecisionTraceEntry, "contentHash" | "previousHash"> = {
    psurCaseId: ctx.psurCaseId,
    traceId: ctx.traceId,
    sequenceNum,
    eventType: event.eventType,
    eventTimestamp,
    actor: event.actor,
    entityType: event.entityType || null,
    entityId: event.entityId || null,
    decision: event.decision || null,
    inputData: event.inputData || null,
    outputData: event.outputData || null,
    reasons: event.reasons || null,
    parentTraceEntryId: event.parentTraceEntryId || null,
    relatedEntityIds: event.relatedEntityIds || null,
    workflowStep: event.workflowStep || null,
    templateId: ctx.templateId || null,
    jurisdictions: ctx.jurisdictions || null,
  };
  
  // Compute content hash
  const contentHash = computeEntryHash(entryData);
  
  // Insert the entry
  const [inserted] = await db.insert(decisionTraceEntries).values({
    ...entryData,
    contentHash,
    previousHash: ctx.previousHash,
  }).returning();
  
  // Update summary counts
  await updateSummaryCounts(ctx.psurCaseId, event.eventType);
  
  // Return updated context
  return {
    entry: inserted,
    ctx: {
      ...ctx,
      currentSequence: sequenceNum,
      previousHash: contentHash,
    },
  };
}

/**
 * Log multiple trace events in a batch
 */
export async function logTraceEventBatch(
  ctx: TraceContext,
  events: TraceEventInput[]
): Promise<{ entries: DecisionTraceEntry[]; ctx: TraceContext }> {
  const entries: DecisionTraceEntry[] = [];
  let currentCtx = ctx;
  
  for (const event of events) {
    const result = await logTraceEvent(currentCtx, event);
    entries.push(result.entry);
    currentCtx = result.ctx;
  }
  
  return { entries, ctx: currentCtx };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

async function updateSummaryCounts(psurCaseId: number, eventType: DecisionTraceEventType): Promise<void> {
  const updates: Record<string, unknown> = {
    totalEvents: sql`${decisionTraceSummaries.totalEvents} + 1`,
    lastUpdatedAt: new Date(),
  };
  
  switch (eventType) {
    case "SLOT_ACCEPTED":
      updates.acceptedSlots = sql`${decisionTraceSummaries.acceptedSlots} + 1`;
      break;
    case "SLOT_REJECTED":
      updates.rejectedSlots = sql`${decisionTraceSummaries.rejectedSlots} + 1`;
      break;
    case "TRACE_GAP_DETECTED":
      updates.traceGaps = sql`${decisionTraceSummaries.traceGaps} + 1`;
      break;
    case "EVIDENCE_ATOM_CREATED":
      updates.evidenceAtoms = sql`${decisionTraceSummaries.evidenceAtoms} + 1`;
      break;
    case "NEGATIVE_EVIDENCE_CREATED":
      updates.negativeEvidence = sql`${decisionTraceSummaries.negativeEvidence} + 1`;
      break;
    case "OBLIGATION_SATISFIED":
      updates.obligationsSatisfied = sql`${decisionTraceSummaries.obligationsSatisfied} + 1`;
      break;
    case "OBLIGATION_UNSATISFIED":
      updates.obligationsUnsatisfied = sql`${decisionTraceSummaries.obligationsUnsatisfied} + 1`;
      break;
    case "WORKFLOW_COMPLETED":
      updates.workflowStatus = "COMPLETED";
      updates.completedAt = new Date();
      break;
    case "WORKFLOW_FAILED":
      updates.workflowStatus = "FAILED";
      break;
  }
  
  await db.update(decisionTraceSummaries)
    .set(updates)
    .where(eq(decisionTraceSummaries.psurCaseId, psurCaseId));
}

/**
 * Mark a workflow step as completed
 */
export async function markStepCompleted(psurCaseId: number, step: number): Promise<void> {
  const summary = await db.query.decisionTraceSummaries.findFirst({
    where: eq(decisionTraceSummaries.psurCaseId, psurCaseId),
  });
  
  if (summary) {
    const completedSteps = (summary.completedSteps as number[]) || [];
    if (!completedSteps.includes(step)) {
      completedSteps.push(step);
      await db.update(decisionTraceSummaries)
        .set({ completedSteps, lastUpdatedAt: new Date() })
        .where(eq(decisionTraceSummaries.psurCaseId, psurCaseId));
    }
  }
}

/**
 * Mark workflow as failed
 */
export async function markWorkflowFailed(
  psurCaseId: number, 
  step: number, 
  reason: string
): Promise<void> {
  await db.update(decisionTraceSummaries)
    .set({
      workflowStatus: "FAILED",
      failedStep: step,
      failureReason: reason,
      lastUpdatedAt: new Date(),
    })
    .where(eq(decisionTraceSummaries.psurCaseId, psurCaseId));
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACE QUERYING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Query trace entries with filters
 */
export async function queryTraceEntries(options: TraceQueryOptions): Promise<DecisionTraceEntry[]> {
  const conditions = [];
  
  if (options.psurCaseId) {
    conditions.push(eq(decisionTraceEntries.psurCaseId, options.psurCaseId));
  }
  if (options.traceId) {
    conditions.push(eq(decisionTraceEntries.traceId, options.traceId));
  }
  if (options.eventTypes && options.eventTypes.length > 0) {
    conditions.push(inArray(decisionTraceEntries.eventType, options.eventTypes));
  }
  if (options.entityType) {
    conditions.push(eq(decisionTraceEntries.entityType, options.entityType));
  }
  if (options.entityId) {
    conditions.push(eq(decisionTraceEntries.entityId, options.entityId));
  }
  
  const query = db.select()
    .from(decisionTraceEntries)
    .where(and(...conditions))
    .orderBy(options.orderBy === "desc" 
      ? desc(decisionTraceEntries.sequenceNum) 
      : asc(decisionTraceEntries.sequenceNum)
    )
    .limit(options.limit || 1000)
    .offset(options.offset || 0);
  
  return query;
}

/**
 * Get trace entries for a specific entity (e.g., slot, evidence atom)
 */
export async function getEntityTrace(
  entityType: string,
  entityId: string
): Promise<DecisionTraceEntry[]> {
  return db.select()
    .from(decisionTraceEntries)
    .where(and(
      eq(decisionTraceEntries.entityType, entityType),
      eq(decisionTraceEntries.entityId, entityId)
    ))
    .orderBy(asc(decisionTraceEntries.sequenceNum));
}

/**
 * Get full decision chain for a slot
 */
export async function getSlotDecisionChain(slotId: string): Promise<{
  proposal: DecisionTraceEntry | null;
  adjudication: DecisionTraceEntry | null;
  evidenceLinks: DecisionTraceEntry[];
}> {
  const entries = await db.select()
    .from(decisionTraceEntries)
    .where(eq(decisionTraceEntries.entityId, slotId))
    .orderBy(asc(decisionTraceEntries.sequenceNum));
  
  return {
    proposal: entries.find(e => e.eventType === "SLOT_PROPOSED") || null,
    adjudication: entries.find(e => 
      e.eventType === "SLOT_ACCEPTED" || e.eventType === "SLOT_REJECTED"
    ) || null,
    evidenceLinks: entries.filter(e => 
      e.eventType === "EVIDENCE_ATOM_CREATED" || (Array.isArray(e.relatedEntityIds) && e.relatedEntityIds.includes(slotId))
    ),
  };
}

/**
 * Get trace summary for a case
 */
export async function getTraceSummary(psurCaseId: number): Promise<DecisionTraceSummary | null> {
  const result = await db.query.decisionTraceSummaries.findFirst({
    where: eq(decisionTraceSummaries.psurCaseId, psurCaseId),
  });
  return result ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAIN VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verify the integrity of a trace chain
 */
export async function verifyTraceChain(traceId: string): Promise<TraceChainValidation> {
  const entries = await db.select()
    .from(decisionTraceEntries)
    .where(eq(decisionTraceEntries.traceId, traceId))
    .orderBy(asc(decisionTraceEntries.sequenceNum));
  
  if (entries.length === 0) {
    return { valid: true, totalEntries: 0, verifiedEntries: 0 };
  }
  
  let verifiedCount = 0;
  let previousHash: string | null = null;
  
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    
    // Verify content hash
    if (!verifyEntryHash(entry)) {
      return {
        valid: false,
        totalEntries: entries.length,
        verifiedEntries: verifiedCount,
        brokenAt: entry.sequenceNum,
        error: `Content hash mismatch at sequence ${entry.sequenceNum}`,
      };
    }
    
    // Verify chain link (previous hash)
    if (previousHash !== entry.previousHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        verifiedEntries: verifiedCount,
        brokenAt: entry.sequenceNum,
        error: `Chain link broken at sequence ${entry.sequenceNum}`,
      };
    }
    
    verifiedCount++;
    previousHash = entry.contentHash;
  }
  
  // Update summary with chain validity
  await db.update(decisionTraceSummaries)
    .set({ 
      chainValid: true,
      firstEntryHash: entries[0].contentHash,
      lastEntryHash: entries[entries.length - 1].contentHash,
      lastUpdatedAt: new Date(),
    })
    .where(eq(decisionTraceSummaries.traceId, traceId));
  
  return {
    valid: true,
    totalEntries: entries.length,
    verifiedEntries: verifiedCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACE EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Export complete trace as JSONL (one JSON object per line)
 */
export async function exportTraceAsJsonl(psurCaseId: number): Promise<string> {
  const entries = await db.select()
    .from(decisionTraceEntries)
    .where(eq(decisionTraceEntries.psurCaseId, psurCaseId))
    .orderBy(asc(decisionTraceEntries.sequenceNum));
  
  return entries.map(e => JSON.stringify({
    sequence: e.sequenceNum,
    timestamp: e.eventTimestamp,
    event: e.eventType,
    actor: e.actor,
    entity: e.entityType ? { type: e.entityType, id: e.entityId } : null,
    decision: e.decision,
    input: e.inputData,
    output: e.outputData,
    reasons: e.reasons,
    relatedEntities: e.relatedEntityIds,
    workflowStep: e.workflowStep,
    contentHash: e.contentHash,
    previousHash: e.previousHash,
    chainVerified: true,
  })).join("\n");
}

/**
 * Export trace summary with statistics
 */
export async function exportTraceSummary(psurCaseId: number): Promise<{
  summary: DecisionTraceSummary | null;
  chainValidation: TraceChainValidation;
  timeline: { timestamp: Date; event: string; decision?: string }[];
}> {
  const summary = await getTraceSummary(psurCaseId);
  
  if (!summary) {
    return {
      summary: null,
      chainValidation: { valid: false, totalEntries: 0, verifiedEntries: 0, error: "No trace found" },
      timeline: [],
    };
  }
  
  const chainValidation = await verifyTraceChain(summary.traceId);
  
  const entries = await queryTraceEntries({
    psurCaseId,
    orderBy: "asc",
    limit: 100,
  });
  
  const timeline = entries.map(e => ({
    timestamp: e.eventTimestamp,
    event: e.eventType,
    decision: e.decision || undefined,
  }));
  
  return { summary, chainValidation, timeline };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS FOR COMMON TRACE EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

export const TraceEvents = {
  workflowStarted: (ctx: TraceContext, templateId: string, jurisdictions: string[]) => 
    logTraceEvent(ctx, {
      eventType: "WORKFLOW_STARTED",
      actor: "workflowRunner",
      workflowStep: 1,
      inputData: { templateId, jurisdictions },
    }),

  templateQualified: (ctx: TraceContext, step: number, qualReport: Record<string, unknown>) =>
    logTraceEvent(ctx, {
      eventType: "TEMPLATE_QUALIFIED",
      actor: "qualifyTemplate",
      workflowStep: step,
      entityType: "template",
      entityId: ctx.templateId,
      decision: "QUALIFIED",
      outputData: qualReport,
    }),

  templateBlocked: (ctx: TraceContext, step: number, reasons: string[]) =>
    logTraceEvent(ctx, {
      eventType: "TEMPLATE_BLOCKED",
      actor: "qualifyTemplate",
      workflowStep: step,
      entityType: "template",
      entityId: ctx.templateId,
      decision: "BLOCKED",
      reasons,
    }),

  caseCreated: (ctx: TraceContext, psurRef: string, psurCaseId: number) =>
    logTraceEvent(ctx, {
      eventType: "CASE_CREATED",
      actor: "createCase",
      workflowStep: 2,
      entityType: "psur_case",
      entityId: String(psurCaseId),
      outputData: { psurReference: psurRef },
    }),

  evidenceUploaded: (ctx: TraceContext, uploadId: number, filename: string, atomCount: number) =>
    logTraceEvent(ctx, {
      eventType: "EVIDENCE_UPLOADED",
      actor: "ingestEvidence",
      workflowStep: 3,
      entityType: "evidence_upload",
      entityId: String(uploadId),
      outputData: { filename, atomCount },
    }),

  evidenceAtomCreated: (ctx: TraceContext, atomId: string, evidenceType: string, sourceFile?: string) =>
    logTraceEvent(ctx, {
      eventType: "EVIDENCE_ATOM_CREATED",
      actor: "ingestEvidence",
      workflowStep: 3,
      entityType: "evidence_atom",
      entityId: atomId,
      outputData: { evidenceType, sourceFile },
    }),

  negativeEvidenceCreated: (ctx: TraceContext, atomId: string, evidenceType: string) =>
    logTraceEvent(ctx, {
      eventType: "NEGATIVE_EVIDENCE_CREATED",
      actor: "ingestEvidence",
      workflowStep: 3,
      entityType: "evidence_atom",
      entityId: atomId,
      outputData: { evidenceType, isNegative: true },
    }),

  slotProposed: (ctx: TraceContext, slotId: string, status: string, evidenceAtomIds: string[], obligationIds: string[]) =>
    logTraceEvent(ctx, {
      eventType: "SLOT_PROPOSED",
      actor: "proposeSlots",
      workflowStep: 4,
      entityType: "slot",
      entityId: slotId,
      decision: status,
      relatedEntityIds: evidenceAtomIds,
      outputData: { status, evidenceCount: evidenceAtomIds.length, obligationIds },
    }),

  traceGapDetected: (ctx: TraceContext, slotId: string, requiredTypes: string[]) =>
    logTraceEvent(ctx, {
      eventType: "TRACE_GAP_DETECTED",
      actor: "proposeSlots",
      workflowStep: 4,
      entityType: "slot",
      entityId: slotId,
      decision: "TRACE_GAP",
      reasons: [`Missing evidence types: ${requiredTypes.join(", ")}`],
      inputData: { requiredTypes },
    }),

  slotAccepted: (ctx: TraceContext, slotId: string, evidenceAtomIds: string[], reasons: string[]) =>
    logTraceEvent(ctx, {
      eventType: "SLOT_ACCEPTED",
      actor: "adjudicator",
      workflowStep: 5,
      entityType: "slot",
      entityId: slotId,
      decision: "ACCEPTED",
      relatedEntityIds: evidenceAtomIds,
      reasons,
    }),

  slotRejected: (ctx: TraceContext, slotId: string, reasons: string[]) =>
    logTraceEvent(ctx, {
      eventType: "SLOT_REJECTED",
      actor: "adjudicator",
      workflowStep: 5,
      entityType: "slot",
      entityId: slotId,
      decision: "REJECTED",
      reasons,
    }),

  obligationSatisfied: (ctx: TraceContext, obligationId: string, slotId: string) =>
    logTraceEvent(ctx, {
      eventType: "OBLIGATION_SATISFIED",
      actor: "coverageReport",
      workflowStep: 6,
      entityType: "obligation",
      entityId: obligationId,
      decision: "SATISFIED",
      relatedEntityIds: [slotId],
    }),

  obligationUnsatisfied: (ctx: TraceContext, obligationId: string, reasons: string[]) =>
    logTraceEvent(ctx, {
      eventType: "OBLIGATION_UNSATISFIED",
      actor: "coverageReport",
      workflowStep: 6,
      entityType: "obligation",
      entityId: obligationId,
      decision: "UNSATISFIED",
      reasons,
    }),

  coverageComputed: (ctx: TraceContext, satisfied: number, total: number, traceGaps: number) =>
    logTraceEvent(ctx, {
      eventType: "COVERAGE_COMPUTED",
      actor: "coverageReport",
      workflowStep: 6,
      outputData: { satisfied, total, coverage: `${((satisfied/total)*100).toFixed(1)}%`, traceGaps },
    }),

  documentRendered: (ctx: TraceContext, format: string, sections: number) =>
    logTraceEvent(ctx, {
      eventType: "DOCUMENT_RENDERED",
      actor: "documentRenderer",
      workflowStep: 7,
      outputData: { format, sections },
    }),

  bundleExported: (ctx: TraceContext, bundleRef: string, files: string[]) =>
    logTraceEvent(ctx, {
      eventType: "BUNDLE_EXPORTED",
      actor: "bundleExporter",
      workflowStep: 8,
      entityType: "bundle",
      entityId: bundleRef,
      outputData: { files },
    }),

  workflowCompleted: (ctx: TraceContext, duration: number) =>
    logTraceEvent(ctx, {
      eventType: "WORKFLOW_COMPLETED",
      actor: "workflowRunner",
      workflowStep: 8,
      outputData: { durationMs: duration },
    }),

  workflowFailed: (ctx: TraceContext, step: number, error: string) =>
    logTraceEvent(ctx, {
      eventType: "WORKFLOW_FAILED",
      actor: "workflowRunner",
      workflowStep: step,
      decision: "FAILED",
      reasons: [error],
    }),
};
