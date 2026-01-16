/**
 * Compile Trace Repository
 * 
 * SOTA queryable trace storage for the PSUR compilation phase.
 * Stores and retrieves detailed decision traces for all compile agents.
 */

import { db } from "../../db";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type CompilePhase = "NARRATIVE" | "TABLE" | "CHART" | "FORMAT" | "ORCHESTRATION";

export interface CompileTraceEntry {
  id: string;
  psurCaseId: number;
  agentId: string;
  agentType: string;
  slotId: string | null;
  phase: CompilePhase;
  decision: "PASS" | "FAIL" | "SKIP" | "PARTIAL" | "INFO";
  inputHash: string;
  outputHash: string;
  evidenceAtomIds: string[];
  obligationsClaimed: string[];
  confidence: number;
  reasoning: string;
  inputSummary: Record<string, unknown>;
  outputSummary: Record<string, unknown>;
  gaps: string[];
  warnings: string[];
  timestamp: Date;
  durationMs: number;
  llmMetrics: {
    calls: number;
    tokens: number;
    cost: number;
    model: string;
  };
}

export interface CompileTraceSummary {
  psurCaseId: number;
  totalEntries: number;
  byPhase: Record<CompilePhase, number>;
  byDecision: Record<string, number>;
  totalLLMCalls: number;
  totalTokens: number;
  totalCost: number;
  averageConfidence: number;
  allGaps: string[];
  allWarnings: string[];
  startTime: Date | null;
  endTime: Date | null;
  totalDurationMs: number;
  integrityVerified: boolean;
}

export interface GapReport {
  slotId: string;
  slotTitle: string;
  missingEvidenceTypes: string[];
  agentRecommendation: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

// ═══════════════════════════════════════════════════════════════════════════════
// IN-MEMORY STORAGE (Will be persisted to DB in production)
// ═══════════════════════════════════════════════════════════════════════════════

const traceStore: Map<number, CompileTraceEntry[]> = new Map();

// ═══════════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a hash for input/output integrity verification
 */
export function generateHash(data: unknown): string {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return createHash("sha256").update(str).digest("hex").substring(0, 16);
}

/**
 * Log a compile trace entry
 */
export async function logCompileTrace(entry: Omit<CompileTraceEntry, "id" | "timestamp" | "inputHash" | "outputHash">): Promise<CompileTraceEntry> {
  const fullEntry: CompileTraceEntry = {
    ...entry,
    id: uuidv4(),
    timestamp: new Date(),
    inputHash: generateHash(entry.inputSummary),
    outputHash: generateHash(entry.outputSummary),
  };

  // Store in memory
  const existing = traceStore.get(entry.psurCaseId) || [];
  existing.push(fullEntry);
  traceStore.set(entry.psurCaseId, existing);

  // Log to console for debugging
  console.log(`[CompileTrace] ${fullEntry.phase}/${fullEntry.agentType}: ${fullEntry.decision} (confidence: ${(fullEntry.confidence * 100).toFixed(0)}%)`);

  return fullEntry;
}

/**
 * Get all trace entries for a PSUR case
 */
export async function getCompileTrace(psurCaseId: number): Promise<CompileTraceEntry[]> {
  return traceStore.get(psurCaseId) || [];
}

/**
 * Get trace entries for a specific slot
 */
export async function getTraceBySlot(psurCaseId: number, slotId: string): Promise<CompileTraceEntry[]> {
  const all = traceStore.get(psurCaseId) || [];
  return all.filter(e => e.slotId === slotId);
}

/**
 * Get trace entries by agent type
 */
export async function getTraceByAgent(psurCaseId: number, agentType: string): Promise<CompileTraceEntry[]> {
  const all = traceStore.get(psurCaseId) || [];
  return all.filter(e => e.agentType === agentType);
}

/**
 * Get trace entries by phase
 */
export async function getTraceByPhase(psurCaseId: number, phase: CompilePhase): Promise<CompileTraceEntry[]> {
  const all = traceStore.get(psurCaseId) || [];
  return all.filter(e => e.phase === phase);
}

/**
 * Get all identified gaps
 */
export async function getGaps(psurCaseId: number): Promise<GapReport[]> {
  const all = traceStore.get(psurCaseId) || [];
  const gaps: GapReport[] = [];

  for (const entry of all) {
    if (entry.gaps.length > 0) {
      gaps.push({
        slotId: entry.slotId || "UNKNOWN",
        slotTitle: (entry.inputSummary.slotTitle as string) || entry.slotId || "Unknown Slot",
        missingEvidenceTypes: entry.gaps,
        agentRecommendation: entry.reasoning,
        severity: entry.decision === "FAIL" ? "CRITICAL" : 
                  entry.confidence < 0.5 ? "HIGH" :
                  entry.confidence < 0.7 ? "MEDIUM" : "LOW",
      });
    }
  }

  return gaps;
}

/**
 * Generate a summary of the compile trace
 */
export async function getTraceSummary(psurCaseId: number): Promise<CompileTraceSummary> {
  const entries = traceStore.get(psurCaseId) || [];

  const byPhase: Record<CompilePhase, number> = {
    NARRATIVE: 0,
    TABLE: 0,
    CHART: 0,
    FORMAT: 0,
    ORCHESTRATION: 0,
  };

  const byDecision: Record<string, number> = {};
  let totalLLMCalls = 0;
  let totalTokens = 0;
  let totalCost = 0;
  let totalConfidence = 0;
  const allGaps: string[] = [];
  const allWarnings: string[] = [];
  let totalDurationMs = 0;

  for (const entry of entries) {
    byPhase[entry.phase] = (byPhase[entry.phase] || 0) + 1;
    byDecision[entry.decision] = (byDecision[entry.decision] || 0) + 1;
    totalLLMCalls += entry.llmMetrics.calls;
    totalTokens += entry.llmMetrics.tokens;
    totalCost += entry.llmMetrics.cost;
    totalConfidence += entry.confidence;
    allGaps.push(...entry.gaps);
    allWarnings.push(...entry.warnings);
    totalDurationMs += entry.durationMs;
  }

  const timestamps = entries.map(e => e.timestamp.getTime());
  const startTime = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null;
  const endTime = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;

  // Verify integrity by checking hash chain
  let integrityVerified = true;
  for (const entry of entries) {
    const expectedInputHash = generateHash(entry.inputSummary);
    const expectedOutputHash = generateHash(entry.outputSummary);
    if (entry.inputHash !== expectedInputHash || entry.outputHash !== expectedOutputHash) {
      integrityVerified = false;
      break;
    }
  }

  return {
    psurCaseId,
    totalEntries: entries.length,
    byPhase,
    byDecision,
    totalLLMCalls,
    totalTokens,
    totalCost,
    averageConfidence: entries.length > 0 ? totalConfidence / entries.length : 0,
    allGaps: Array.from(new Set(allGaps)),
    allWarnings: Array.from(new Set(allWarnings)),
    startTime,
    endTime,
    totalDurationMs,
    integrityVerified,
  };
}

/**
 * Verify trace integrity
 */
export async function verifyTraceIntegrity(psurCaseId: number): Promise<{
  verified: boolean;
  totalEntries: number;
  invalidEntries: string[];
}> {
  const entries = traceStore.get(psurCaseId) || [];
  const invalidEntries: string[] = [];

  for (const entry of entries) {
    const expectedInputHash = generateHash(entry.inputSummary);
    const expectedOutputHash = generateHash(entry.outputSummary);
    
    if (entry.inputHash !== expectedInputHash || entry.outputHash !== expectedOutputHash) {
      invalidEntries.push(entry.id);
    }
  }

  return {
    verified: invalidEntries.length === 0,
    totalEntries: entries.length,
    invalidEntries,
  };
}

/**
 * Clear trace for a PSUR case (useful for re-compilation)
 */
export async function clearCompileTrace(psurCaseId: number): Promise<void> {
  traceStore.delete(psurCaseId);
}

/**
 * Export trace as JSON for audit purposes
 */
export async function exportTraceJSON(psurCaseId: number): Promise<string> {
  const entries = traceStore.get(psurCaseId) || [];
  const summary = await getTraceSummary(psurCaseId);
  
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    psurCaseId,
    summary,
    entries,
  }, null, 2);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FOR AGENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a trace entry builder for consistent logging
 */
export function createTraceBuilder(
  psurCaseId: number,
  agentId: string,
  agentType: string,
  phase: CompilePhase
) {
  const startTime = Date.now();

  return {
    slotId: null as string | null,
    evidenceAtomIds: [] as string[],
    obligationsClaimed: [] as string[],
    inputSummary: {} as Record<string, unknown>,
    outputSummary: {} as Record<string, unknown>,
    gaps: [] as string[],
    warnings: [] as string[],
    llmMetrics: { calls: 0, tokens: 0, cost: 0, model: "unknown" },

    setSlot(slotId: string) {
      this.slotId = slotId;
      return this;
    },

    setInput(summary: Record<string, unknown>) {
      this.inputSummary = summary;
      return this;
    },

    setOutput(summary: Record<string, unknown>) {
      this.outputSummary = summary;
      return this;
    },

    addEvidence(atomIds: string[]) {
      this.evidenceAtomIds.push(...atomIds);
      return this;
    },

    addObligations(obligationIds: string[]) {
      this.obligationsClaimed.push(...obligationIds);
      return this;
    },

    addGap(gap: string) {
      this.gaps.push(gap);
      return this;
    },

    addWarning(warning: string) {
      this.warnings.push(warning);
      return this;
    },

    setLLMMetrics(metrics: { calls: number; tokens: number; cost: number; model: string }) {
      this.llmMetrics = metrics;
      return this;
    },

    async commit(decision: CompileTraceEntry["decision"], confidence: number, reasoning: string): Promise<CompileTraceEntry> {
      return logCompileTrace({
        psurCaseId,
        agentId,
        agentType,
        slotId: this.slotId,
        phase,
        decision,
        evidenceAtomIds: this.evidenceAtomIds,
        obligationsClaimed: this.obligationsClaimed,
        confidence,
        reasoning,
        inputSummary: this.inputSummary,
        outputSummary: this.outputSummary,
        gaps: this.gaps,
        warnings: this.warnings,
        durationMs: Date.now() - startTime,
        llmMetrics: this.llmMetrics,
      });
    },
  };
}
