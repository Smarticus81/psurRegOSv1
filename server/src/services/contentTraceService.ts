/**
 * Content Trace Service - Ultra-Granular PSUR Content Tracing
 *
 * Traces EVERY content element in the PSUR:
 * - Sentences, paragraphs, table cells
 * - Calculations with formulas and inputs
 * - Entries, conclusions, chart points
 * 
 * Each trace captures:
 * - Rationale: WHY the content was created
 * - Methodology: HOW the decision was made
 * - Standard: Which requirement is being met
 * - Evidence: Which atoms/sources support this
 * - Agent: Which system made the decision
 * - Timestamp: When the decision was made
 */

import { db } from "../../db";
import {
  contentTraces,
  ContentTrace,
  InsertContentTrace,
  dataSources,
} from "@shared/schema";
import { eq, and, or, ilike, inArray, desc, asc, sql } from "drizzle-orm";
import { createHash } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ContentType =
  | "sentence"
  | "paragraph"
  | "table_row"
  | "table_cell"
  | "calculation"
  | "entry"
  | "chart_point"
  | "conclusion"
  | "list_item"
  | "heading";

export type CalculationType =
  | "average"
  | "sum"
  | "percentage"
  | "count"
  | "formula"
  | "aggregation"
  | "ratio"
  | "other";

export interface ContentTraceInput {
  psurCaseId: number;
  slotId: string;
  slotTitle?: string;
  contentType: ContentType;
  contentId: string;
  contentIndex: number;
  contentPreview: string;
  rationale: string; // WHY
  methodology: string; // HOW
  standardReference?: string;
  evidenceType?: string;
  atomIds?: string[];
  sourceDocument?: string;
  dataSourceId?: number;
  obligationId?: string;
  obligationTitle?: string;
  jurisdictions?: string[];
  calculationType?: CalculationType;
  calculationFormula?: string;
  calculationInputs?: Record<string, unknown>;
  agentId: string;
  agentName?: string;
}

export interface ContentTraceQueryOptions {
  psurCaseId?: number;
  slotId?: string;
  contentType?: ContentType[];
  obligationId?: string;
  agentId?: string;
  evidenceType?: string;
  searchText?: string; // Natural language search
  limit?: number;
  offset?: number;
  orderBy?: "asc" | "desc";
}

export interface ContentTraceStats {
  totalTraces: number;
  byContentType: Record<ContentType, number>;
  byAgent: Record<string, number>;
  byObligation: Record<string, number>;
  byEvidenceType: Record<string, number>;
  calculationsCount: number;
  withNegativeEvidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HASHING
// ═══════════════════════════════════════════════════════════════════════════════

function computeContentHash(input: Omit<InsertContentTrace, "contentHash">): string {
  const hashContent = {
    slotId: input.slotId,
    contentType: input.contentType,
    contentId: input.contentId,
    contentPreview: input.contentPreview,
    rationale: input.rationale,
    methodology: input.methodology,
    atomIds: input.atomIds?.sort(),
    agentId: input.agentId,
  };

  return createHash("sha256")
    .update(JSON.stringify(hashContent, Object.keys(hashContent).sort()))
    .digest("hex");
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log a trace for a content element
 */
export async function traceContentElement(
  input: ContentTraceInput
): Promise<ContentTrace> {
  // Build searchable text for NL queries
  const searchableText = [
    input.rationale,
    input.methodology,
    input.standardReference || "",
    input.evidenceType || "",
    input.obligationTitle || "",
    input.contentPreview,
  ]
    .join(" ")
    .toLowerCase();

  const entryData: Omit<InsertContentTrace, "contentHash"> = {
    psurCaseId: input.psurCaseId,
    slotId: input.slotId,
    slotTitle: input.slotTitle,
    contentType: input.contentType,
    contentId: input.contentId,
    contentIndex: input.contentIndex,
    contentPreview: input.contentPreview.substring(0, 500),
    rationale: input.rationale,
    methodology: input.methodology,
    standardReference: input.standardReference,
    evidenceType: input.evidenceType,
    atomIds: input.atomIds || [],
    sourceDocument: input.sourceDocument,
    dataSourceId: input.dataSourceId,
    obligationId: input.obligationId,
    obligationTitle: input.obligationTitle,
    jurisdictions: input.jurisdictions || [],
    calculationType: input.calculationType,
    calculationFormula: input.calculationFormula,
    calculationInputs: input.calculationInputs,
    agentId: input.agentId,
    agentName: input.agentName,
    searchableText,
  };

  const contentHash = computeContentHash(entryData);

  const [trace] = await db
    .insert(contentTraces)
    .values({
      ...entryData,
      contentHash,
    })
    .returning();

  return trace;
}

/**
 * Batch trace multiple content elements
 */
export async function traceContentBatch(
  inputs: ContentTraceInput[]
): Promise<ContentTrace[]> {
  if (inputs.length === 0) return [];

  const entriesData = inputs.map((input) => {
    const searchableText = [
      input.rationale,
      input.methodology,
      input.standardReference || "",
      input.evidenceType || "",
      input.obligationTitle || "",
      input.contentPreview,
    ]
      .join(" ")
      .toLowerCase();

    const entryData: Omit<InsertContentTrace, "contentHash"> = {
      psurCaseId: input.psurCaseId,
      slotId: input.slotId,
      slotTitle: input.slotTitle,
      contentType: input.contentType,
      contentId: input.contentId,
      contentIndex: input.contentIndex,
      contentPreview: input.contentPreview.substring(0, 500),
      rationale: input.rationale,
      methodology: input.methodology,
      standardReference: input.standardReference,
      evidenceType: input.evidenceType,
      atomIds: input.atomIds || [],
      sourceDocument: input.sourceDocument,
      dataSourceId: input.dataSourceId,
      obligationId: input.obligationId,
      obligationTitle: input.obligationTitle,
      jurisdictions: input.jurisdictions || [],
      calculationType: input.calculationType,
      calculationFormula: input.calculationFormula,
      calculationInputs: input.calculationInputs,
      agentId: input.agentId,
      agentName: input.agentName,
      searchableText,
    };

    const contentHash = computeContentHash(entryData);
    return { ...entryData, contentHash };
  });

  return db.insert(contentTraces).values(entriesData).returning();
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERYING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Query content traces with filtering
 */
export async function queryContentTraces(
  options: ContentTraceQueryOptions
): Promise<ContentTrace[]> {
  const conditions = [];

  if (options.psurCaseId) {
    conditions.push(eq(contentTraces.psurCaseId, options.psurCaseId));
  }

  if (options.slotId) {
    conditions.push(eq(contentTraces.slotId, options.slotId));
  }

  if (options.contentType && options.contentType.length > 0) {
    conditions.push(inArray(contentTraces.contentType, options.contentType));
  }

  if (options.obligationId) {
    conditions.push(eq(contentTraces.obligationId, options.obligationId));
  }

  if (options.agentId) {
    conditions.push(eq(contentTraces.agentId, options.agentId));
  }

  if (options.evidenceType) {
    conditions.push(eq(contentTraces.evidenceType, options.evidenceType));
  }

  if (options.searchText) {
    conditions.push(
      ilike(contentTraces.searchableText, `%${options.searchText}%`)
    );
  }

  const query = db
    .select()
    .from(contentTraces)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      options.orderBy === "desc"
        ? desc(contentTraces.createdAt)
        : asc(contentTraces.createdAt)
    )
    .limit(options.limit || 100)
    .offset(options.offset || 0);

  return query;
}

/**
 * Natural language search across all traces
 */
export async function searchContentTraces(
  psurCaseId: number,
  query: string,
  limit: number = 50
): Promise<ContentTrace[]> {
  return db
    .select()
    .from(contentTraces)
    .where(
      and(
        eq(contentTraces.psurCaseId, psurCaseId),
        ilike(contentTraces.searchableText, `%${query}%`)
      )
    )
    .orderBy(desc(contentTraces.createdAt))
    .limit(limit);
}

/**
 * Get all traces for a specific slot
 */
export async function getSlotContentTraces(
  slotId: string
): Promise<ContentTrace[]> {
  return db
    .select()
    .from(contentTraces)
    .where(eq(contentTraces.slotId, slotId))
    .orderBy(asc(contentTraces.contentIndex));
}

/**
 * Get all traces related to an obligation
 */
export async function getObligationTraces(
  psurCaseId: number,
  obligationId: string
): Promise<ContentTrace[]> {
  return db
    .select()
    .from(contentTraces)
    .where(
      and(
        eq(contentTraces.psurCaseId, psurCaseId),
        eq(contentTraces.obligationId, obligationId)
      )
    )
    .orderBy(asc(contentTraces.createdAt));
}

/**
 * Get all traces using specific evidence atoms
 */
export async function getTracesForAtoms(
  psurCaseId: number,
  atomIds: string[]
): Promise<ContentTrace[]> {
  if (atomIds.length === 0) return [];

  return db
    .select()
    .from(contentTraces)
    .where(
      and(
        eq(contentTraces.psurCaseId, psurCaseId),
        sql`${contentTraces.atomIds} && ${atomIds}::text[]` // PostgreSQL array overlap operator
      )
    )
    .orderBy(asc(contentTraces.createdAt));
}

/**
 * Get calculations for a case
 */
export async function getCaseCalculations(
  psurCaseId: number
): Promise<ContentTrace[]> {
  return db
    .select()
    .from(contentTraces)
    .where(
      and(
        eq(contentTraces.psurCaseId, psurCaseId),
        eq(contentTraces.contentType, "calculation")
      )
    )
    .orderBy(desc(contentTraces.createdAt));
}

/**
 * Get traces by agent
 */
export async function getTracesByAgent(
  psurCaseId: number,
  agentId: string
): Promise<ContentTrace[]> {
  return db
    .select()
    .from(contentTraces)
    .where(
      and(
        eq(contentTraces.psurCaseId, psurCaseId),
        eq(contentTraces.agentId, agentId)
      )
    )
    .orderBy(asc(contentTraces.createdAt));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS & STATS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get comprehensive statistics about content traces
 */
export async function getContentTraceStats(
  psurCaseId: number
): Promise<ContentTraceStats> {
  const traces = await db
    .select()
    .from(contentTraces)
    .where(eq(contentTraces.psurCaseId, psurCaseId));

  const stats: ContentTraceStats = {
    totalTraces: traces.length,
    byContentType: {},
    byAgent: {},
    byObligation: {},
    byEvidenceType: {},
    calculationsCount: 0,
    withNegativeEvidence: 0,
  };

  for (const trace of traces) {
    // Count by content type
    stats.byContentType[trace.contentType as ContentType] =
      (stats.byContentType[trace.contentType as ContentType] || 0) + 1;

    // Count by agent
    stats.byAgent[trace.agentId] = (stats.byAgent[trace.agentId] || 0) + 1;

    // Count by obligation
    if (trace.obligationId) {
      stats.byObligation[trace.obligationId] =
        (stats.byObligation[trace.obligationId] || 0) + 1;
    }

    // Count by evidence type
    if (trace.evidenceType) {
      stats.byEvidenceType[trace.evidenceType] =
        (stats.byEvidenceType[trace.evidenceType] || 0) + 1;
    }

    // Count calculations
    if (trace.contentType === "calculation") {
      stats.calculationsCount++;
    }
  }

  return stats;
}

/**
 * Get summary of traces by content type
 */
export async function getTracesSummaryByType(
  psurCaseId: number
): Promise<
  Array<{ contentType: ContentType; count: number; examples: ContentTrace[] }>
> {
  const traces = await db
    .select()
    .from(contentTraces)
    .where(eq(contentTraces.psurCaseId, psurCaseId))
    .orderBy(desc(contentTraces.createdAt));

  const byType = new Map<ContentType, ContentTrace[]>();

  for (const trace of traces) {
    const type = trace.contentType as ContentType;
    if (!byType.has(type)) {
      byType.set(type, []);
    }
    byType.get(type)!.push(trace);
  }

  return Array.from(byType.entries()).map(([type, list]) => ({
    contentType: type,
    count: list.length,
    examples: list.slice(0, 3),
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Export traces as JSONL for audit
 */
export async function exportTracesAsJsonl(
  psurCaseId: number
): Promise<string> {
  const traces = await db
    .select()
    .from(contentTraces)
    .where(eq(contentTraces.psurCaseId, psurCaseId))
    .orderBy(asc(contentTraces.createdAt));

  return traces
    .map((t) =>
      JSON.stringify({
        id: t.id,
        timestamp: t.createdAt,
        slot: { id: t.slotId, title: t.slotTitle },
        contentType: t.contentType,
        content: t.contentPreview,
        rationale: t.rationale,
        methodology: t.methodology,
        standard: t.standardReference,
        evidence: {
          type: t.evidenceType,
          atomIds: t.atomIds,
          sourceDocument: t.sourceDocument,
        },
        obligation: { id: t.obligationId, title: t.obligationTitle },
        calculation:
          t.contentType === "calculation"
            ? {
                type: t.calculationType,
                formula: t.calculationFormula,
                inputs: t.calculationInputs,
              }
            : null,
        agent: { id: t.agentId, name: t.agentName },
        hash: t.contentHash,
      })
    )
    .join("\n");
}

/**
 * Generate audit narrative
 */
export async function generateAuditNarrative(
  psurCaseId: number
): Promise<string> {
  const traces = await db
    .select()
    .from(contentTraces)
    .where(eq(contentTraces.psurCaseId, psurCaseId))
    .orderBy(asc(contentTraces.createdAt));

  if (traces.length === 0) {
    return "No content traces available.";
  }

  const sections: string[] = [
    `# PSUR Content Audit Trail (Case ${psurCaseId})`,
    `Generated: ${new Date().toISOString()}`,
    `Total Content Elements Traced: ${traces.length}`,
    "",
  ];

  // Group by slot
  const bySlot = new Map<string, ContentTrace[]>();
  for (const trace of traces) {
    if (!bySlot.has(trace.slotId)) {
      bySlot.set(trace.slotId, []);
    }
    bySlot.get(trace.slotId)!.push(trace);
  }

  for (const [slotId, slotTraces] of bySlot) {
    sections.push(`## Slot: ${slotId}`);
    sections.push(`### Content Elements (${slotTraces.length})`);

    for (const trace of slotTraces) {
      sections.push(`#### ${trace.contentType} #${trace.contentIndex}`);
      sections.push(`**Content:** ${trace.contentPreview}`);
      sections.push(`**Rationale:** ${trace.rationale}`);
      sections.push(`**Methodology:** ${trace.methodology}`);

      if (trace.standardReference) {
        sections.push(`**Standard:** ${trace.standardReference}`);
      }

      if (trace.evidenceType) {
        sections.push(`**Evidence Type:** ${trace.evidenceType}`);
        if (trace.atomIds && trace.atomIds.length > 0) {
          sections.push(`**Evidence Atoms:** ${trace.atomIds.join(", ")}`);
        }
      }

      if (trace.obligationId) {
        sections.push(
          `**Obligation:** ${trace.obligationTitle} (${trace.obligationId})`
        );
      }

      if (trace.contentType === "calculation" && trace.calculationFormula) {
        sections.push(`**Calculation:** ${trace.calculationFormula}`);
        if (trace.calculationInputs) {
          sections.push(
            `**Inputs:** ${JSON.stringify(trace.calculationInputs)}`
          );
        }
      }

      sections.push(
        `**Agent:** ${trace.agentName || trace.agentId} | **Timestamp:** ${trace.createdAt.toISOString()}`
      );
      sections.push("");
    }
  }

  return sections.join("\n");
}
