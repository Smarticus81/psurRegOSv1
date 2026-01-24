/**
 * Decision Trace Service - Enhanced Traceability Edition
 * 
 * Provides comprehensive, auditable tracing of all PSUR workflow decisions.
 * Each trace entry is hash-verified, linked in a chain, and includes:
 * - Human-readable summaries for generalist understanding
 * - GRKB regulatory context with actual obligation text
 * - Evidence justification explaining why evidence satisfies requirements
 * - Compliance assertions for explicit obligation satisfaction tracking
 */

import { db } from "../../db";
import { 
  decisionTraceEntries, 
  decisionTraceSummaries,
  grkbObligations,
  DecisionTraceEntry,
  InsertDecisionTraceEntry,
  DecisionTraceSummary,
  DecisionTraceEventType,
  decisionTraceEventTypeEnum,
  TraceRegulatoryContext,
  TraceEvidenceJustification,
  TraceComplianceAssertion,
} from "@shared/schema";
import { eq, and, desc, asc, sql, inArray, ilike, or } from "drizzle-orm";
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

// Enhanced trace event input with GRKB context and natural language support
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
  
  // Enhanced traceability fields
  humanSummary?: string;
  regulatoryContext?: TraceRegulatoryContext | TraceRegulatoryContext[];
  evidenceJustification?: TraceEvidenceJustification;
  complianceAssertion?: TraceComplianceAssertion;
}

export interface TraceQueryOptions {
  psurCaseId?: number;
  traceId?: string;
  eventTypes?: DecisionTraceEventType[];
  entityType?: string;
  entityId?: string;
  obligationId?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
  orderBy?: "asc" | "desc";
  searchText?: string;  // Natural language search in humanSummary
}

export interface TraceChainValidation {
  valid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  brokenAt?: number;
  error?: string;
}

// Obligation context from GRKB for enriched traces
export interface ObligationContext {
  obligationId: string;
  title: string;
  text: string;
  sourceCitation: string | null;
  jurisdiction: string;
  mandatory: boolean;
  requiredEvidenceTypes: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRKB INTEGRATION - Fetch obligation context for traces
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch GRKB obligation details for enriching trace entries
 */
export async function getObligationContext(obligationId: string): Promise<ObligationContext | null> {
  const obligation = await db.query.grkbObligations.findFirst({
    where: eq(grkbObligations.obligationId, obligationId),
  });
  
  if (!obligation) return null;
  
  return {
    obligationId: obligation.obligationId,
    title: obligation.title,
    text: obligation.text,
    sourceCitation: obligation.sourceCitation,
    jurisdiction: obligation.jurisdiction,
    mandatory: obligation.mandatory,
    requiredEvidenceTypes: obligation.requiredEvidenceTypes || [],
  };
}

/**
 * Fetch multiple GRKB obligation contexts
 */
export async function getObligationContexts(obligationIds: string[]): Promise<Map<string, ObligationContext>> {
  if (obligationIds.length === 0) return new Map();
  
  const obligations = await db.select()
    .from(grkbObligations)
    .where(inArray(grkbObligations.obligationId, obligationIds));
  
  const contextMap = new Map<string, ObligationContext>();
  for (const obl of obligations) {
    contextMap.set(obl.obligationId, {
      obligationId: obl.obligationId,
      title: obl.title,
      text: obl.text,
      sourceCitation: obl.sourceCitation,
      jurisdiction: obl.jurisdiction,
      mandatory: obl.mandatory,
      requiredEvidenceTypes: obl.requiredEvidenceTypes || [],
    });
  }
  
  return contextMap;
}

/**
 * Build regulatory context for trace entry from GRKB obligation
 */
export function buildRegulatoryContext(obligation: ObligationContext): TraceRegulatoryContext {
  return {
    obligationId: obligation.obligationId,
    obligationText: obligation.text,
    sourceCitation: obligation.sourceCitation,
    jurisdictions: [obligation.jurisdiction],
    mandatory: obligation.mandatory,
    requirementLevel: obligation.mandatory ? "MUST" : "SHOULD",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NATURAL LANGUAGE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate human-readable summary for workflow started event
 */
export function generateWorkflowStartedSummary(templateId: string, jurisdictions: string[]): string {
  const jurisdictionText = jurisdictions.length === 1 
    ? jurisdictions[0].replace("_", " ") 
    : jurisdictions.map(j => j.replace("_", " ")).join(" and ");
  return `Started PSUR workflow for ${jurisdictionText} using template ${templateId}. The system will validate the template, ingest evidence, propose slot content, adjudicate proposals, compute coverage, render the document, and export the audit bundle.`;
}

/**
 * Generate human-readable summary for template qualification
 */
export function generateTemplateQualifiedSummary(
  templateId: string, 
  slotCount: number, 
  obligationsCount: number, 
  jurisdictions: string[]
): string {
  return `Template ${templateId} passed qualification checks. Found ${slotCount} content slots mapped to ${obligationsCount} regulatory obligations across ${jurisdictions.join(", ")}. The template is ready for PSUR generation.`;
}

/**
 * Generate human-readable summary for template blocked
 */
export function generateTemplateBlockedSummary(templateId: string, reasons: string[]): string {
  return `Template ${templateId} failed qualification: ${reasons.join("; ")}. The workflow cannot proceed until these issues are resolved in the template configuration or GRKB database.`;
}

/**
 * Generate human-readable summary for case created
 */
export function generateCaseCreatedSummary(psurRef: string, periodStart: string, periodEnd: string): string {
  return `Created PSUR case ${psurRef} for reporting period ${periodStart} to ${periodEnd}. All evidence and decisions will be tracked against this case reference.`;
}

/**
 * Generate human-readable summary for evidence atom created
 */
export function generateEvidenceAtomSummary(
  atomId: string, 
  evidenceType: string, 
  recordCount?: number,
  periodStart?: string,
  periodEnd?: string
): string {
  const countText = recordCount ? ` containing ${recordCount} records` : "";
  const periodText = periodStart && periodEnd ? ` for period ${periodStart} to ${periodEnd}` : "";
  return `Ingested evidence atom ${atomId} of type "${evidenceType}"${countText}${periodText}. This evidence is now available for slot proposals.`;
}

/**
 * Generate human-readable summary for negative evidence
 */
export function generateNegativeEvidenceSummary(evidenceType: string): string {
  return `Created negative evidence record for "${evidenceType}" indicating no events of this type occurred during the reporting period. This is a valid "none reported" scenario with full traceability.`;
}

/**
 * Generate human-readable summary for slot proposed
 */
export function generateSlotProposedSummary(
  slotId: string,
  slotTitle: string,
  status: string,
  evidenceCount: number,
  obligationIds: string[]
): string {
  if (status === "READY") {
    return `Proposed content for "${slotTitle}" (${slotId}) using ${evidenceCount} evidence atoms. This proposal claims to satisfy ${obligationIds.length} regulatory obligations: ${obligationIds.slice(0, 3).join(", ")}${obligationIds.length > 3 ? ` and ${obligationIds.length - 3} more` : ""}.`;
  } else if (status === "TRACE_GAP") {
    return `Unable to propose content for "${slotTitle}" (${slotId}) due to missing evidence. This represents a trace gap that must be resolved before the PSUR can be completed.`;
  } else {
    return `Proposed administrative content for "${slotTitle}" (${slotId}). No evidence required for this slot type.`;
  }
}

/**
 * Generate human-readable summary for trace gap
 */
export function generateTraceGapSummary(slotId: string, slotTitle: string, requiredTypes: string[]): string {
  return `TRACE GAP DETECTED: Slot "${slotTitle}" (${slotId}) requires evidence of type(s): ${requiredTypes.join(", ")}. Upload the required evidence before proceeding to ensure complete regulatory compliance.`;
}

/**
 * Generate human-readable summary for slot accepted
 */
export function generateSlotAcceptedSummary(
  slotId: string,
  slotTitle: string,
  evidenceCount: number,
  obligationsSatisfied: string[]
): string {
  return `ACCEPTED: "${slotTitle}" (${slotId}) passed adjudication with ${evidenceCount} supporting evidence atoms. This decision satisfies regulatory obligations: ${obligationsSatisfied.slice(0, 3).join(", ")}${obligationsSatisfied.length > 3 ? ` and ${obligationsSatisfied.length - 3} more` : ""}.`;
}

/**
 * Generate human-readable summary for slot rejected
 */
export function generateSlotRejectedSummary(slotId: string, slotTitle: string, reasons: string[]): string {
  return `REJECTED: "${slotTitle}" (${slotId}) failed adjudication. Reasons: ${reasons.join("; ")}. Review the evidence and slot requirements to resolve this issue.`;
}

/**
 * Generate human-readable summary for obligation satisfied
 */
export function generateObligationSatisfiedSummary(
  obligationId: string,
  obligationTitle: string,
  sourceCitation: string | null,
  slotId: string
): string {
  const citationText = sourceCitation ? ` (${sourceCitation})` : "";
  return `OBLIGATION SATISFIED: "${obligationTitle}"${citationText} has been met by content in slot ${slotId}. This regulatory requirement is now covered in the PSUR.`;
}

/**
 * Generate human-readable summary for obligation unsatisfied
 */
export function generateObligationUnsatisfiedSummary(
  obligationId: string,
  obligationTitle: string,
  sourceCitation: string | null,
  reasons: string[]
): string {
  const citationText = sourceCitation ? ` (${sourceCitation})` : "";
  return `OBLIGATION UNSATISFIED: "${obligationTitle}"${citationText} has not been met. Reasons: ${reasons.join("; ")}. This represents a compliance gap that should be addressed.`;
}

/**
 * Generate human-readable summary for coverage computed
 */
export function generateCoverageComputedSummary(
  satisfied: number,
  total: number,
  traceGaps: number
): string {
  const coveragePercent = total > 0 ? ((satisfied / total) * 100).toFixed(1) : "0.0";
  const gapText = traceGaps > 0 ? ` with ${traceGaps} trace gap(s) requiring attention` : "";
  return `Coverage report complete: ${satisfied} of ${total} regulatory obligations satisfied (${coveragePercent}%)${gapText}. ${parseFloat(coveragePercent) >= 80 ? "Coverage threshold met." : "Coverage below 80% threshold - review required."}`;
}

/**
 * Generate human-readable summary for document rendered
 */
export function generateDocumentRenderedSummary(format: string, sections: number): string {
  return `PSUR document rendered in ${format} format with ${sections} sections. The document is ready for export and review.`;
}

/**
 * Generate human-readable summary for bundle exported
 */
export function generateBundleExportedSummary(bundleRef: string, files: string[]): string {
  return `Audit bundle ${bundleRef} exported successfully containing ${files.length} files: ${files.join(", ")}. The complete decision trace is preserved for regulatory audit.`;
}

/**
 * Generate human-readable summary for workflow completed
 */
export function generateWorkflowCompletedSummary(durationMs: number): string {
  const seconds = (durationMs / 1000).toFixed(1);
  return `PSUR workflow completed successfully in ${seconds} seconds. All decisions have been traced and the audit bundle is ready for submission.`;
}

/**
 * Generate human-readable summary for workflow failed
 */
export function generateWorkflowFailedSummary(step: number, error: string): string {
  const stepNames: Record<number, string> = {
    1: "Template Qualification",
    2: "Case Creation", 
    3: "Evidence Ingestion",
    4: "Slot Proposal",
    5: "Adjudication",
    6: "Coverage Report",
    7: "Document Rendering",
    8: "Bundle Export",
  };
  const stepName = stepNames[step] || `Step ${step}`;
  return `WORKFLOW FAILED at ${stepName}: ${error}. Review the error and resolve before rerunning the workflow.`;
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
    humanSummary: entry.humanSummary,
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
    humanSummary: entry.humanSummary,
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
// TRACE EVENT LOGGING - Enhanced with GRKB and Natural Language
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log a trace event with enhanced traceability features
 */
export async function logTraceEvent(
  ctx: TraceContext,
  event: TraceEventInput
): Promise<{ entry: DecisionTraceEntry; ctx: TraceContext }> {
  const sequenceNum = ctx.currentSequence + 1;
  const eventTimestamp = new Date();
  
  // Build the entry with enhanced fields
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
    humanSummary: event.humanSummary || null,
    regulatoryContext: event.regulatoryContext || null,
    evidenceJustification: event.evidenceJustification || null,
    complianceAssertion: event.complianceAssertion || null,
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
// TRACE QUERYING - Enhanced with Natural Language and Obligation Search
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Query trace entries with enhanced filters including natural language search
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
  // Natural language search in humanSummary
  if (options.searchText) {
    conditions.push(ilike(decisionTraceEntries.humanSummary, `%${options.searchText}%`));
  }
  
  const query = db.select()
    .from(decisionTraceEntries)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(options.orderBy === "desc" 
      ? desc(decisionTraceEntries.sequenceNum) 
      : asc(decisionTraceEntries.sequenceNum)
    )
    .limit(options.limit || 1000)
    .offset(options.offset || 0);
  
  return query;
}

/**
 * Query traces by obligation ID - finds all decisions related to a specific GRKB obligation
 */
export async function queryTracesByObligation(
  psurCaseId: number,
  obligationId: string
): Promise<DecisionTraceEntry[]> {
  // Find entries where the obligation is referenced in entityId or regulatoryContext
  const entries = await db.select()
    .from(decisionTraceEntries)
    .where(and(
      eq(decisionTraceEntries.psurCaseId, psurCaseId),
      or(
        eq(decisionTraceEntries.entityId, obligationId),
        sql`${decisionTraceEntries.regulatoryContext}::jsonb @> ${JSON.stringify({ obligationId })}`
      )
    ))
    .orderBy(asc(decisionTraceEntries.sequenceNum));
  
  return entries;
}

/**
 * Natural language search across all trace entries
 */
export async function searchTraces(
  psurCaseId: number,
  searchText: string,
  limit: number = 50
): Promise<DecisionTraceEntry[]> {
  const entries = await db.select()
    .from(decisionTraceEntries)
    .where(and(
      eq(decisionTraceEntries.psurCaseId, psurCaseId),
      or(
        ilike(decisionTraceEntries.humanSummary, `%${searchText}%`),
        ilike(decisionTraceEntries.decision, `%${searchText}%`),
        ilike(decisionTraceEntries.entityId, `%${searchText}%`)
      )
    ))
    .orderBy(asc(decisionTraceEntries.sequenceNum))
    .limit(limit);
  
  return entries;
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
 * Get full decision chain for a slot with GRKB context
 */
export async function getSlotDecisionChain(slotId: string): Promise<{
  proposal: DecisionTraceEntry | null;
  adjudication: DecisionTraceEntry | null;
  evidenceLinks: DecisionTraceEntry[];
  obligations: DecisionTraceEntry[];
}> {
  const entries = await db.select()
    .from(decisionTraceEntries)
    .where(eq(decisionTraceEntries.entityId, slotId))
    .orderBy(asc(decisionTraceEntries.sequenceNum));
  
  // Also find obligation entries that reference this slot
  const obligationEntries = await db.select()
    .from(decisionTraceEntries)
    .where(and(
      eq(decisionTraceEntries.entityType, "obligation"),
      sql`${decisionTraceEntries.relatedEntityIds}::jsonb ? ${slotId}`
    ))
    .orderBy(asc(decisionTraceEntries.sequenceNum));
  
  return {
    proposal: entries.find(e => e.eventType === "SLOT_PROPOSED") || null,
    adjudication: entries.find(e => 
      e.eventType === "SLOT_ACCEPTED" || e.eventType === "SLOT_REJECTED"
    ) || null,
    evidenceLinks: entries.filter(e => 
      e.eventType === "EVIDENCE_ATOM_CREATED" || (Array.isArray(e.relatedEntityIds) && e.relatedEntityIds.includes(slotId))
    ),
    obligations: obligationEntries,
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
// TRACE EXPORT - Enhanced with Natural Language Narrative
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Export complete trace as JSONL with enhanced fields
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
    humanSummary: e.humanSummary,
    regulatoryContext: e.regulatoryContext,
    evidenceJustification: e.evidenceJustification,
    complianceAssertion: e.complianceAssertion,
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
  timeline: { timestamp: Date; event: string; decision?: string; humanSummary?: string }[];
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
    humanSummary: e.humanSummary || undefined,
  }));
  
  return { summary, chainValidation, timeline };
}

/**
 * Export plain-English audit narrative for regulatory review
 */
export async function exportAuditNarrative(psurCaseId: number): Promise<string> {
  const summary = await getTraceSummary(psurCaseId);
  const entries = await queryTraceEntries({
    psurCaseId,
    orderBy: "asc",
    limit: 1000,
  });
  
  if (!summary || entries.length === 0) {
    return "No audit trail available for this PSUR case.";
  }
  
  const lines: string[] = [];
  
  // Header
  lines.push("═══════════════════════════════════════════════════════════════════════════════");
  lines.push("PSUR DECISION AUDIT NARRATIVE");
  lines.push("═══════════════════════════════════════════════════════════════════════════════");
  lines.push("");
  lines.push(`Case ID: ${psurCaseId}`);
  lines.push(`Trace ID: ${summary.traceId}`);
  lines.push(`Status: ${summary.workflowStatus}`);
  lines.push(`Total Decisions: ${summary.totalEvents}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push("DECISION TIMELINE");
  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push("");
  
  // Group entries by workflow step
  const stepGroups = new Map<number, DecisionTraceEntry[]>();
  for (const entry of entries) {
    const step = entry.workflowStep || 0;
    if (!stepGroups.has(step)) {
      stepGroups.set(step, []);
    }
    stepGroups.get(step)!.push(entry);
  }
  
  const stepNames: Record<number, string> = {
    0: "Initialization",
    1: "Template Qualification",
    2: "Case Creation",
    3: "Evidence Ingestion",
    4: "Slot Proposal",
    5: "Adjudication",
    6: "Coverage Report",
    7: "Document Rendering",
    8: "Bundle Export",
  };
  
  for (const [step, stepEntries] of Array.from(stepGroups.entries()).sort((a, b) => a[0] - b[0])) {
    lines.push(`\n## Step ${step}: ${stepNames[step] || "Unknown"}`);
    lines.push("");
    
    for (const entry of stepEntries) {
      const timestamp = entry.eventTimestamp.toISOString().replace("T", " ").slice(0, 19);
      
      // Use humanSummary if available, otherwise generate from event data
      let narrative = entry.humanSummary;
      if (!narrative) {
        narrative = `[${entry.eventType}] ${entry.decision || ""} - ${entry.entityType || ""}: ${entry.entityId || ""}`;
      }
      
      lines.push(`[${timestamp}] ${narrative}`);
      
      // Include regulatory context if available
      if (entry.regulatoryContext) {
        const ctx = entry.regulatoryContext as TraceRegulatoryContext | TraceRegulatoryContext[];
        const contexts = Array.isArray(ctx) ? ctx : [ctx];
        for (const c of contexts) {
          if (c.sourceCitation) {
            lines.push(`  → Regulatory Basis: ${c.sourceCitation}`);
          }
        }
      }
      
      // Include compliance assertion if available
      if (entry.complianceAssertion) {
        const assertion = entry.complianceAssertion as TraceComplianceAssertion;
        if (assertion.complianceStatement) {
          lines.push(`  → Compliance: ${assertion.complianceStatement}`);
        }
      }
    }
  }
  
  // Summary statistics
  lines.push("");
  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push("SUMMARY STATISTICS");
  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push("");
  lines.push(`Slots Accepted: ${summary.acceptedSlots}`);
  lines.push(`Slots Rejected: ${summary.rejectedSlots}`);
  lines.push(`Trace Gaps: ${summary.traceGaps}`);
  lines.push(`Evidence Atoms: ${summary.evidenceAtoms}`);
  lines.push(`Negative Evidence: ${summary.negativeEvidence}`);
  lines.push(`Obligations Satisfied: ${summary.obligationsSatisfied}`);
  lines.push(`Obligations Unsatisfied: ${summary.obligationsUnsatisfied}`);
  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════════════════════");
  lines.push("END OF AUDIT NARRATIVE");
  lines.push("═══════════════════════════════════════════════════════════════════════════════");
  
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED TRACE EVENTS - With GRKB Context and Natural Language
// ═══════════════════════════════════════════════════════════════════════════════

export const TraceEvents = {
  workflowStarted: (ctx: TraceContext, templateId: string, jurisdictions: string[]) => 
    logTraceEvent(ctx, {
      eventType: "WORKFLOW_STARTED",
      actor: "workflowRunner",
      workflowStep: 1,
      inputData: { templateId, jurisdictions },
      humanSummary: generateWorkflowStartedSummary(templateId, jurisdictions),
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
      humanSummary: generateTemplateQualifiedSummary(
        ctx.templateId || "",
        (qualReport.slotCount as number) || 0,
        (qualReport.obligationsTotal as number) || (qualReport.mandatoryObligationsTotal as number) || 0,
        ctx.jurisdictions || []
      ),
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
      humanSummary: generateTemplateBlockedSummary(ctx.templateId || "", reasons),
    }),

  caseCreated: (ctx: TraceContext, psurRef: string, psurCaseId: number, periodStart?: string, periodEnd?: string) =>
    logTraceEvent(ctx, {
      eventType: "CASE_CREATED",
      actor: "createCase",
      workflowStep: 2,
      entityType: "psur_case",
      entityId: String(psurCaseId),
      outputData: { psurReference: psurRef },
      humanSummary: generateCaseCreatedSummary(psurRef, periodStart || "N/A", periodEnd || "N/A"),
    }),

  evidenceUploaded: (ctx: TraceContext, uploadId: number, filename: string, atomCount: number) =>
    logTraceEvent(ctx, {
      eventType: "EVIDENCE_UPLOADED",
      actor: "ingestEvidence",
      workflowStep: 3,
      entityType: "evidence_upload",
      entityId: String(uploadId),
      outputData: { filename, atomCount },
      humanSummary: `Uploaded evidence file "${filename}" containing ${atomCount} evidence atoms for processing.`,
    }),

  evidenceAtomCreated: (
    ctx: TraceContext, 
    atomId: string, 
    evidenceType: string, 
    sourceFile?: string,
    recordCount?: number,
    periodStart?: string,
    periodEnd?: string
  ) =>
    logTraceEvent(ctx, {
      eventType: "EVIDENCE_ATOM_CREATED",
      actor: "ingestEvidence",
      workflowStep: 3,
      entityType: "evidence_atom",
      entityId: atomId,
      outputData: { evidenceType, sourceFile, recordCount },
      humanSummary: generateEvidenceAtomSummary(atomId, evidenceType, recordCount, periodStart, periodEnd),
      evidenceJustification: {
        requiredEvidenceTypes: [evidenceType],
        providedEvidenceTypes: [evidenceType],
        atomCount: 1,
        periodCoverage: periodStart && periodEnd ? "full" : "not_applicable",
        justificationNarrative: `Evidence atom ${atomId} provides ${evidenceType} data${sourceFile ? ` from ${sourceFile}` : ""}.`,
      },
    }),

  evidenceAtomsIngestedSummary: (
    ctx: TraceContext,
    totalAtoms: number,
    byType: Record<string, number>,
    periodStart?: string,
    periodEnd?: string
  ) =>
    logTraceEvent(ctx, {
      eventType: "EVIDENCE_INGEST_SUMMARY",
      actor: "ingestEvidence",
      workflowStep: 3,
      entityType: "evidence_batch",
      entityId: `batch_${Date.now()}`,
      outputData: { totalAtoms, byType },
      humanSummary: `Ingested ${totalAtoms} records across ${Object.keys(byType).length} data categories for period ${periodStart || "N/A"} to ${periodEnd || "N/A"}.`,
      evidenceJustification: {
        requiredEvidenceTypes: Object.keys(byType),
        providedEvidenceTypes: Object.keys(byType),
        atomCount: totalAtoms,
        periodCoverage: periodStart && periodEnd ? "full" : "not_applicable",
        justificationNarrative: `Batch ingest captured ${totalAtoms} records across ${Object.keys(byType).length} categories.`,
      },
    }),

  negativeEvidenceCreated: (ctx: TraceContext, atomId: string, evidenceType: string) =>
    logTraceEvent(ctx, {
      eventType: "NEGATIVE_EVIDENCE_CREATED",
      actor: "ingestEvidence",
      workflowStep: 3,
      entityType: "evidence_atom",
      entityId: atomId,
      outputData: { evidenceType, isNegative: true },
      humanSummary: generateNegativeEvidenceSummary(evidenceType),
      evidenceJustification: {
        requiredEvidenceTypes: [evidenceType],
        providedEvidenceTypes: [evidenceType],
        atomCount: 1,
        periodCoverage: "full",
        justificationNarrative: `Negative evidence confirms no ${evidenceType} events occurred during the reporting period.`,
      },
    }),

  slotProposed: async (
    ctx: TraceContext, 
    slotId: string, 
    slotTitle: string,
    status: string, 
    evidenceAtomIds: string[], 
    obligationIds: string[]
  ) => {
    // Fetch GRKB context for obligations
    const obligationContexts = await getObligationContexts(obligationIds);
    const regulatoryContexts: TraceRegulatoryContext[] = [];
    for (const [, oblCtx] of obligationContexts) {
      regulatoryContexts.push(buildRegulatoryContext(oblCtx));
    }
    
    return logTraceEvent(ctx, {
      eventType: "SLOT_PROPOSED",
      actor: "proposeSlots",
      workflowStep: 4,
      entityType: "slot",
      entityId: slotId,
      decision: status,
      relatedEntityIds: evidenceAtomIds,
      outputData: { status, evidenceCount: evidenceAtomIds.length, obligationIds },
      humanSummary: generateSlotProposedSummary(slotId, slotTitle, status, evidenceAtomIds.length, obligationIds),
      regulatoryContext: regulatoryContexts.length > 0 ? regulatoryContexts : undefined,
      evidenceJustification: {
        requiredEvidenceTypes: [],
        providedEvidenceTypes: [],
        atomCount: evidenceAtomIds.length,
        periodCoverage: evidenceAtomIds.length > 0 ? "full" : "none",
        justificationNarrative: status === "READY" 
          ? `${evidenceAtomIds.length} evidence atoms support this slot proposal.`
          : status === "TRACE_GAP"
            ? "Missing required evidence - trace gap detected."
            : "Administrative slot - no evidence required.",
      },
    });
  },

  traceGapDetected: (ctx: TraceContext, slotId: string, slotTitle: string, requiredTypes: string[]) =>
    logTraceEvent(ctx, {
      eventType: "TRACE_GAP_DETECTED",
      actor: "proposeSlots",
      workflowStep: 4,
      entityType: "slot",
      entityId: slotId,
      decision: "TRACE_GAP",
      reasons: [`Missing evidence types: ${requiredTypes.join(", ")}`],
      inputData: { requiredTypes },
      humanSummary: generateTraceGapSummary(slotId, slotTitle, requiredTypes),
      evidenceJustification: {
        requiredEvidenceTypes: requiredTypes,
        providedEvidenceTypes: [],
        atomCount: 0,
        periodCoverage: "none",
        justificationNarrative: `Slot requires evidence of type(s): ${requiredTypes.join(", ")}. None available.`,
      },
      complianceAssertion: {
        satisfies: [],
        doesNotSatisfy: [],
        complianceStatement: `Compliance gap: Required evidence types [${requiredTypes.join(", ")}] not available.`,
        riskLevel: "high",
      },
    }),

  slotAccepted: async (
    ctx: TraceContext, 
    slotId: string, 
    slotTitle: string,
    evidenceAtomIds: string[], 
    obligationIds: string[],
    reasons: string[]
  ) => {
    const obligationContexts = await getObligationContexts(obligationIds);
    const regulatoryContexts: TraceRegulatoryContext[] = [];
    for (const [, oblCtx] of obligationContexts) {
      regulatoryContexts.push(buildRegulatoryContext(oblCtx));
    }
    
    return logTraceEvent(ctx, {
      eventType: "SLOT_ACCEPTED",
      actor: "adjudicator",
      workflowStep: 5,
      entityType: "slot",
      entityId: slotId,
      decision: "ACCEPTED",
      relatedEntityIds: evidenceAtomIds,
      reasons,
      humanSummary: generateSlotAcceptedSummary(slotId, slotTitle, evidenceAtomIds.length, obligationIds),
      regulatoryContext: regulatoryContexts.length > 0 ? regulatoryContexts : undefined,
      complianceAssertion: {
        satisfies: obligationIds,
        doesNotSatisfy: [],
        complianceStatement: `Slot "${slotTitle}" satisfies ${obligationIds.length} regulatory obligation(s) with ${evidenceAtomIds.length} supporting evidence atom(s).`,
        riskLevel: "low",
      },
    });
  },

  slotRejected: (ctx: TraceContext, slotId: string, slotTitle: string, reasons: string[], obligationIds?: string[]) =>
    logTraceEvent(ctx, {
      eventType: "SLOT_REJECTED",
      actor: "adjudicator",
      workflowStep: 5,
      entityType: "slot",
      entityId: slotId,
      decision: "REJECTED",
      reasons,
      humanSummary: generateSlotRejectedSummary(slotId, slotTitle, reasons),
      complianceAssertion: {
        satisfies: [],
        doesNotSatisfy: obligationIds || [],
        complianceStatement: `Slot "${slotTitle}" failed adjudication: ${reasons.join("; ")}`,
        riskLevel: "high",
      },
    }),

  obligationSatisfied: async (ctx: TraceContext, obligationId: string, slotId: string) => {
    const oblCtx = await getObligationContext(obligationId);
    
    return logTraceEvent(ctx, {
      eventType: "OBLIGATION_SATISFIED",
      actor: "coverageReport",
      workflowStep: 6,
      entityType: "obligation",
      entityId: obligationId,
      decision: "SATISFIED",
      relatedEntityIds: [slotId],
      humanSummary: oblCtx 
        ? generateObligationSatisfiedSummary(obligationId, oblCtx.title, oblCtx.sourceCitation, slotId)
        : `Obligation ${obligationId} satisfied by slot ${slotId}.`,
      regulatoryContext: oblCtx ? buildRegulatoryContext(oblCtx) : undefined,
      complianceAssertion: {
        satisfies: [obligationId],
        doesNotSatisfy: [],
        complianceStatement: oblCtx 
          ? `"${oblCtx.title}" is now satisfied by content in slot ${slotId}.`
          : `Obligation ${obligationId} satisfied.`,
        riskLevel: "low",
      },
    });
  },

  obligationUnsatisfied: async (ctx: TraceContext, obligationId: string, reasons: string[]) => {
    const oblCtx = await getObligationContext(obligationId);
    
    return logTraceEvent(ctx, {
      eventType: "OBLIGATION_UNSATISFIED",
      actor: "coverageReport",
      workflowStep: 6,
      entityType: "obligation",
      entityId: obligationId,
      decision: "UNSATISFIED",
      reasons,
      humanSummary: oblCtx 
        ? generateObligationUnsatisfiedSummary(obligationId, oblCtx.title, oblCtx.sourceCitation, reasons)
        : `Obligation ${obligationId} not satisfied: ${reasons.join("; ")}`,
      regulatoryContext: oblCtx ? buildRegulatoryContext(oblCtx) : undefined,
      complianceAssertion: {
        satisfies: [],
        doesNotSatisfy: [obligationId],
        complianceStatement: oblCtx 
          ? `"${oblCtx.title}" has not been met: ${reasons.join("; ")}`
          : `Obligation ${obligationId} unsatisfied.`,
        riskLevel: oblCtx?.mandatory ? "critical" : "medium",
      },
    });
  },

  coverageComputed: (ctx: TraceContext, satisfied: number, total: number, traceGaps: number) =>
    logTraceEvent(ctx, {
      eventType: "COVERAGE_COMPUTED",
      actor: "coverageReport",
      workflowStep: 6,
      outputData: { satisfied, total, coverage: `${((satisfied/total)*100).toFixed(1)}%`, traceGaps },
      humanSummary: generateCoverageComputedSummary(satisfied, total, traceGaps),
      complianceAssertion: {
        satisfies: [],
        doesNotSatisfy: [],
        complianceStatement: `Coverage: ${satisfied}/${total} obligations (${((satisfied/total)*100).toFixed(1)}%) with ${traceGaps} trace gap(s).`,
        riskLevel: (satisfied/total) >= 0.8 ? "low" : "high",
      },
    }),

  documentRendered: (ctx: TraceContext, format: string, sections: number) =>
    logTraceEvent(ctx, {
      eventType: "DOCUMENT_RENDERED",
      actor: "documentRenderer",
      workflowStep: 7,
      outputData: { format, sections },
      humanSummary: generateDocumentRenderedSummary(format, sections),
    }),

  bundleExported: (ctx: TraceContext, bundleRef: string, files: string[]) =>
    logTraceEvent(ctx, {
      eventType: "BUNDLE_EXPORTED",
      actor: "bundleExporter",
      workflowStep: 8,
      entityType: "bundle",
      entityId: bundleRef,
      outputData: { files },
      humanSummary: generateBundleExportedSummary(bundleRef, files),
    }),

  workflowCompleted: (ctx: TraceContext, duration: number) =>
    logTraceEvent(ctx, {
      eventType: "WORKFLOW_COMPLETED",
      actor: "workflowRunner",
      workflowStep: 8,
      outputData: { durationMs: duration },
      humanSummary: generateWorkflowCompletedSummary(duration),
    }),

  workflowFailed: (ctx: TraceContext, step: number, error: string) =>
    logTraceEvent(ctx, {
      eventType: "WORKFLOW_FAILED",
      actor: "workflowRunner",
      workflowStep: step,
      decision: "FAILED",
      reasons: [error],
      humanSummary: generateWorkflowFailedSummary(step, error),
    }),
};
