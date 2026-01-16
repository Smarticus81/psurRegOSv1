/**
 * LITERATURE & EXTERNAL DATABASE REVIEW ENGINE
 * 
 * Engine for processing literature evidence atoms and external database
 * (MAUDE, MHRA, TGA) evidence to generate summary tables, benchmark
 * comparisons, and state-of-the-art alignment conclusions.
 * 
 * All statements must cite evidence atoms.
 * Explicit "no new risks identified" statements when valid.
 * 
 * Per MDCG 2022-21 Annex I, Sections 21-23
 */

import type {
  PSURTable,
  TableRow,
  TraceReference,
} from "../psurContract";
import { createTraceReference } from "../psurContract";

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface LiteratureEvidenceAtom {
  atomId: string;
  evidenceType: "literature_result";
  referenceId: string;
  title: string;
  authors?: string;
  publicationDate?: string;
  journal?: string;
  abstract?: string;
  relevance?: LiteratureRelevance;
  deviceRelated: boolean;
  safetySignal: boolean;
  safetySignalDescription?: string;
  newRiskIdentified: boolean;
  riskDescription?: string;
  stateOfArtRelevant: boolean;
  stateOfArtFindings?: string;
  searchDatabase?: string;
  searchDate?: string;
}

export interface ExternalDatabaseAtom {
  atomId: string;
  evidenceType: "external_database";
  database: ExternalDatabaseSource;
  searchDate: string;
  searchQuery: string;
  totalResults: number;
  relevantResults: number;
  deviceRelatedReports: number;
  safetySignalsIdentified: number;
  newRisksIdentified: number;
  findings?: string;
  benchmarkComparison?: string;
}

export type LiteratureRelevance = 
  | "DIRECTLY_RELEVANT"
  | "INDIRECTLY_RELEVANT"
  | "BACKGROUND"
  | "NOT_RELEVANT";

export type ExternalDatabaseSource = 
  | "MAUDE"
  | "MHRA"
  | "TGA"
  | "SWISSMEDIC"
  | "HEALTH_CANADA"
  | "EUDAMED"
  | "OTHER";

export interface ReportingPeriod {
  start: string;
  end: string;
}

export interface DeviceContext {
  deviceName: string;
  deviceCode: string;
  intendedPurpose: string;
  riskClass: string;
  equivalentDevices?: string[];
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface LiteratureAnalysisResult {
  success: boolean;
  errors: string[];
  
  // Tables (STRICT output)
  literatureSummary: PSURTable;
  externalDbFindings: PSURTable;
  
  // Metrics
  metrics: LiteratureMetrics;
  
  // Conclusions
  conclusions: LiteratureConclusions;
  
  // Narrative blocks (all cite evidence atoms)
  narrativeBlocks: LiteratureNarrativeBlock[];
  
  // Trace
  allEvidenceAtomIds: string[];
}

export interface LiteratureMetrics {
  totalReferencesReviewed: number;
  directlyRelevant: number;
  indirectlyRelevant: number;
  safetySignalsIdentified: number;
  newRisksIdentified: number;
  stateOfArtRelevant: number;
  databasesSearched: string[];
  externalDbTotalReports: number;
  externalDbDeviceRelated: number;
}

export interface LiteratureConclusions {
  noNewRisksIdentified: boolean;
  noNewRisksStatement: string;
  stateOfArtAligned: boolean;
  stateOfArtStatement: string;
  safetyProfileConfirmed: boolean;
  safetyProfileStatement: string;
  recommendedActions: string[];
}

export interface LiteratureNarrativeBlock {
  paragraphId: string;
  content: string;
  evidenceAtomIds: string[];
  blockType: "SUMMARY" | "FINDING" | "CONCLUSION" | "BENCHMARK" | "STATE_OF_ART";
}

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export function computeLiteratureAnalysis(
  literatureAtoms: LiteratureEvidenceAtom[],
  externalDbAtoms: ExternalDatabaseAtom[],
  reportingPeriod: ReportingPeriod,
  deviceContext: DeviceContext
): LiteratureAnalysisResult {
  const errors: string[] = [];
  const allEvidenceAtomIds: string[] = [
    ...literatureAtoms.map(l => l.atomId),
    ...externalDbAtoms.map(e => e.atomId),
  ];
  
  // -------------------------------------------------------------------------
  // CALCULATE METRICS
  // -------------------------------------------------------------------------
  const directlyRelevant = literatureAtoms.filter(l => 
    l.relevance === "DIRECTLY_RELEVANT"
  );
  const indirectlyRelevant = literatureAtoms.filter(l => 
    l.relevance === "INDIRECTLY_RELEVANT"
  );
  const safetySignalLit = literatureAtoms.filter(l => l.safetySignal);
  const newRiskLit = literatureAtoms.filter(l => l.newRiskIdentified);
  const stateOfArtLit = literatureAtoms.filter(l => l.stateOfArtRelevant);
  
  const databasesSearched = Array.from(new Set(externalDbAtoms.map(e => e.database)));
  const externalDbTotalReports = externalDbAtoms.reduce((s, e) => s + e.totalResults, 0);
  const externalDbDeviceRelated = externalDbAtoms.reduce((s, e) => s + e.deviceRelatedReports, 0);
  const externalDbSafetySignals = externalDbAtoms.reduce((s, e) => s + e.safetySignalsIdentified, 0);
  const externalDbNewRisks = externalDbAtoms.reduce((s, e) => s + e.newRisksIdentified, 0);
  
  const totalSafetySignals = safetySignalLit.length + externalDbSafetySignals;
  const totalNewRisks = newRiskLit.length + externalDbNewRisks;
  
  const metrics: LiteratureMetrics = {
    totalReferencesReviewed: literatureAtoms.length,
    directlyRelevant: directlyRelevant.length,
    indirectlyRelevant: indirectlyRelevant.length,
    safetySignalsIdentified: totalSafetySignals,
    newRisksIdentified: totalNewRisks,
    stateOfArtRelevant: stateOfArtLit.length,
    databasesSearched,
    externalDbTotalReports,
    externalDbDeviceRelated,
  };
  
  // -------------------------------------------------------------------------
  // GENERATE CONCLUSIONS
  // -------------------------------------------------------------------------
  const conclusions = generateConclusions(
    metrics,
    literatureAtoms,
    externalDbAtoms,
    deviceContext
  );
  
  // -------------------------------------------------------------------------
  // BUILD TABLES
  // -------------------------------------------------------------------------
  const literatureSummary = buildLiteratureSummaryTable(
    literatureAtoms,
    allEvidenceAtomIds
  );
  
  const externalDbFindings = buildExternalDbFindingsTable(
    externalDbAtoms,
    allEvidenceAtomIds
  );
  
  // -------------------------------------------------------------------------
  // GENERATE NARRATIVE BLOCKS
  // -------------------------------------------------------------------------
  const narrativeBlocks = generateNarrativeBlocks(
    metrics,
    conclusions,
    literatureAtoms,
    externalDbAtoms,
    deviceContext
  );
  
  return {
    success: errors.length === 0,
    errors,
    literatureSummary,
    externalDbFindings,
    metrics,
    conclusions,
    narrativeBlocks,
    allEvidenceAtomIds,
  };
}

// ============================================================================
// CONCLUSIONS GENERATION
// ============================================================================

function generateConclusions(
  metrics: LiteratureMetrics,
  literatureAtoms: LiteratureEvidenceAtom[],
  externalDbAtoms: ExternalDatabaseAtom[],
  deviceContext: DeviceContext
): LiteratureConclusions {
  const recommendedActions: string[] = [];
  
  // No new risks determination
  const noNewRisksIdentified = metrics.newRisksIdentified === 0;
  let noNewRisksStatement: string;
  
  if (noNewRisksIdentified) {
    noNewRisksStatement = `Based on the systematic review of ${metrics.totalReferencesReviewed} publications and ${metrics.databasesSearched.length} external databases, NO NEW RISKS have been identified that would affect the established benefit-risk profile of the ${deviceContext.deviceName}.`;
  } else {
    noNewRisksStatement = `The review identified ${metrics.newRisksIdentified} potential new risk(s) that require evaluation against the current Risk Management File.`;
    recommendedActions.push("Update Risk Management File to address newly identified risks");
    recommendedActions.push("Evaluate impact on benefit-risk determination");
  }
  
  // State of the art determination
  const stateOfArtLit = literatureAtoms.filter(l => l.stateOfArtRelevant);
  const stateOfArtAligned = stateOfArtLit.every(l => 
    !l.stateOfArtFindings?.toLowerCase().includes("obsolete") &&
    !l.stateOfArtFindings?.toLowerCase().includes("superseded")
  );
  
  let stateOfArtStatement: string;
  if (stateOfArtAligned) {
    stateOfArtStatement = `The device remains aligned with the current state of the art. No publications were identified that indicate the device technology or clinical approach has been superseded by superior alternatives.`;
  } else {
    stateOfArtStatement = `Publications have been identified that may indicate changes to the state of the art. Further evaluation is recommended.`;
    recommendedActions.push("Evaluate state of the art alignment per MEDDEV 2.7/1 rev 4");
  }
  
  // Safety profile confirmation
  const safetyProfileConfirmed = metrics.safetySignalsIdentified === 0 || 
    (metrics.safetySignalsIdentified > 0 && metrics.newRisksIdentified === 0);
  
  let safetyProfileStatement: string;
  if (safetyProfileConfirmed && metrics.safetySignalsIdentified === 0) {
    safetyProfileStatement = `No new safety signals were identified from the literature review. The known safety profile of the device is confirmed.`;
  } else if (safetyProfileConfirmed && metrics.safetySignalsIdentified > 0) {
    safetyProfileStatement = `${metrics.safetySignalsIdentified} safety signal(s) were identified and evaluated. All signals are consistent with the known and accepted risks documented in the Risk Management File. No changes to the safety profile are required.`;
  } else {
    safetyProfileStatement = `Safety signals have been identified that may indicate changes to the device safety profile. Investigation and risk file update are recommended.`;
    recommendedActions.push("Investigate safety signals for potential impact on safety profile");
  }
  
  return {
    noNewRisksIdentified,
    noNewRisksStatement,
    stateOfArtAligned,
    stateOfArtStatement,
    safetyProfileConfirmed,
    safetyProfileStatement,
    recommendedActions,
  };
}

// ============================================================================
// TABLE BUILDERS
// ============================================================================

function buildLiteratureSummaryTable(
  literatureAtoms: LiteratureEvidenceAtom[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_literature_summary", evidenceAtomIds);
  
  if (literatureAtoms.length === 0) {
    return {
      tableId: "TABLE_LITERATURE_SUMMARY",
      title: "Literature Review Summary",
      columns: ["Reference ID", "Title", "Relevance", "Safety Signal", "New Risk"],
      rows: [
        {
          rowId: "header",
          isHeader: true,
          cells: [
            { value: "Reference ID", format: "text" },
            { value: "Title", format: "text" },
            { value: "Relevance", format: "text" },
            { value: "Safety Signal", format: "text" },
            { value: "New Risk", format: "text" },
          ],
        },
        {
          rowId: "none",
          cells: [
            { value: "No references", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
          ],
        },
      ],
      footnotes: ["No literature references were available for review."],
      traceRef,
    };
  }
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Reference ID", format: "text" },
        { value: "Title", format: "text" },
        { value: "Journal/Source", format: "text" },
        { value: "Relevance", format: "text" },
        { value: "Safety Signal", format: "text" },
        { value: "New Risk", format: "text" },
      ],
    },
  ];
  
  // Sort by relevance (directly relevant first)
  const sorted = [...literatureAtoms].sort((a, b) => {
    const order: Record<string, number> = {
      DIRECTLY_RELEVANT: 0,
      INDIRECTLY_RELEVANT: 1,
      BACKGROUND: 2,
      NOT_RELEVANT: 3,
    };
    return (order[a.relevance || "NOT_RELEVANT"] || 3) - (order[b.relevance || "NOT_RELEVANT"] || 3);
  });
  
  for (const lit of sorted) {
    rows.push({
      rowId: `ref_${lit.referenceId}`,
      cells: [
        { value: lit.referenceId, format: "text" },
        { value: truncate(lit.title, 50), format: "text" },
        { value: lit.journal || "-", format: "text" },
        { value: lit.relevance || "NOT_RELEVANT", format: "text" },
        { value: lit.safetySignal ? "YES" : "NO", format: "text" },
        { value: lit.newRiskIdentified ? "YES" : "NO", format: "text" },
      ],
    });
  }
  
  // Summary row
  const safetySignalCount = literatureAtoms.filter(l => l.safetySignal).length;
  const newRiskCount = literatureAtoms.filter(l => l.newRiskIdentified).length;
  
  rows.push({
    rowId: "summary",
    isTotal: true,
    cells: [
      { value: `TOTAL: ${literatureAtoms.length}`, format: "text" },
      { value: "", format: "text" },
      { value: "", format: "text" },
      { value: "", format: "text" },
      { value: `${safetySignalCount}`, format: "text" },
      { value: `${newRiskCount}`, format: "text" },
    ],
  });
  
  return {
    tableId: "TABLE_LITERATURE_SUMMARY",
    title: "Literature Review Summary",
    columns: ["Reference ID", "Title", "Journal/Source", "Relevance", "Safety Signal", "New Risk"],
    rows,
    footnotes: [
      "Relevance categories per MEDDEV 2.7/1 rev 4",
      "Safety signals evaluated against Risk Management File",
    ],
    traceRef,
  };
}

function buildExternalDbFindingsTable(
  externalDbAtoms: ExternalDatabaseAtom[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_external_db_findings", evidenceAtomIds);
  
  const defaultDatabases: ExternalDatabaseSource[] = ["MAUDE", "MHRA", "TGA", "EUDAMED"];
  
  if (externalDbAtoms.length === 0) {
    // Show template with all databases marked as "Not Searched"
    const rows: TableRow[] = [
      {
        rowId: "header",
        isHeader: true,
        cells: [
          { value: "Database", format: "text" },
          { value: "Search Date", format: "text" },
          { value: "Total Results", format: "number" },
          { value: "Device Related", format: "number" },
          { value: "Safety Signals", format: "number" },
          { value: "New Risks", format: "number" },
        ],
      },
    ];
    
    for (const db of defaultDatabases) {
      rows.push({
        rowId: `db_${db}`,
        cells: [
          { value: db, format: "text" },
          { value: "Not Searched", format: "text" },
          { value: 0, format: "number" },
          { value: 0, format: "number" },
          { value: 0, format: "number" },
          { value: 0, format: "number" },
        ],
      });
    }
    
    return {
      tableId: "TABLE_EXTERNAL_DB_FINDINGS",
      title: "External Database Review Summary",
      columns: ["Database", "Search Date", "Total Results", "Device Related", "Safety Signals", "New Risks"],
      rows,
      footnotes: ["External database searches should be conducted as part of the literature review process."],
      traceRef,
    };
  }
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Database", format: "text" },
        { value: "Search Date", format: "text" },
        { value: "Total Results", format: "number" },
        { value: "Device Related", format: "number" },
        { value: "Safety Signals", format: "number" },
        { value: "New Risks", format: "number" },
      ],
    },
  ];
  
  let totalResults = 0;
  let totalDeviceRelated = 0;
  let totalSafetySignals = 0;
  let totalNewRisks = 0;
  
  for (const atom of externalDbAtoms) {
    rows.push({
      rowId: `db_${atom.database}`,
      cells: [
        { value: atom.database, format: "text" },
        { value: atom.searchDate, format: "date" },
        { value: atom.totalResults, format: "number" },
        { value: atom.deviceRelatedReports, format: "number" },
        { value: atom.safetySignalsIdentified, format: "number" },
        { value: atom.newRisksIdentified, format: "number" },
      ],
    });
    
    totalResults += atom.totalResults;
    totalDeviceRelated += atom.deviceRelatedReports;
    totalSafetySignals += atom.safetySignalsIdentified;
    totalNewRisks += atom.newRisksIdentified;
  }
  
  rows.push({
    rowId: "total",
    isTotal: true,
    cells: [
      { value: "TOTAL", format: "text" },
      { value: "", format: "text" },
      { value: totalResults, format: "number" },
      { value: totalDeviceRelated, format: "number" },
      { value: totalSafetySignals, format: "number" },
      { value: totalNewRisks, format: "number" },
    ],
  });
  
  return {
    tableId: "TABLE_EXTERNAL_DB_FINDINGS",
    title: "External Database Review Summary",
    columns: ["Database", "Search Date", "Total Results", "Device Related", "Safety Signals", "New Risks"],
    rows,
    footnotes: [
      "MAUDE: FDA Manufacturer and User Facility Device Experience",
      "MHRA: UK Medicines and Healthcare products Regulatory Agency",
      "TGA: Australian Therapeutic Goods Administration",
    ],
    traceRef,
  };
}

// ============================================================================
// NARRATIVE GENERATION
// ============================================================================

function generateNarrativeBlocks(
  metrics: LiteratureMetrics,
  conclusions: LiteratureConclusions,
  literatureAtoms: LiteratureEvidenceAtom[],
  externalDbAtoms: ExternalDatabaseAtom[],
  deviceContext: DeviceContext
): LiteratureNarrativeBlock[] {
  const blocks: LiteratureNarrativeBlock[] = [];
  
  // Summary block
  blocks.push({
    paragraphId: "lit_summary",
    content: `A systematic literature review was conducted covering the reporting period. A total of ${metrics.totalReferencesReviewed} publications were identified and reviewed for relevance to the ${deviceContext.deviceName}. Of these, ${metrics.directlyRelevant} were directly relevant to the device or equivalent devices, and ${metrics.indirectlyRelevant} were indirectly relevant.`,
    evidenceAtomIds: literatureAtoms.map(l => l.atomId),
    blockType: "SUMMARY",
  });
  
  // External database summary
  if (externalDbAtoms.length > 0) {
    blocks.push({
      paragraphId: "ext_db_summary",
      content: `External databases reviewed: ${metrics.databasesSearched.join(", ")}. A total of ${metrics.externalDbTotalReports} reports were retrieved, of which ${metrics.externalDbDeviceRelated} were determined to be device-related.`,
      evidenceAtomIds: externalDbAtoms.map(e => e.atomId),
      blockType: "SUMMARY",
    });
  }
  
  // Safety signal findings
  if (metrics.safetySignalsIdentified > 0) {
    const signalAtoms = literatureAtoms.filter(l => l.safetySignal);
    blocks.push({
      paragraphId: "safety_signals",
      content: `${metrics.safetySignalsIdentified} safety signal(s) were identified during the review. Each signal was evaluated against the current Risk Management File to determine if updates are required.`,
      evidenceAtomIds: signalAtoms.map(l => l.atomId),
      blockType: "FINDING",
    });
  }
  
  // No new risks conclusion
  blocks.push({
    paragraphId: "no_new_risks",
    content: conclusions.noNewRisksStatement,
    evidenceAtomIds: literatureAtoms.map(l => l.atomId),
    blockType: "CONCLUSION",
  });
  
  // State of the art conclusion
  blocks.push({
    paragraphId: "state_of_art",
    content: conclusions.stateOfArtStatement,
    evidenceAtomIds: literatureAtoms.filter(l => l.stateOfArtRelevant).map(l => l.atomId),
    blockType: "STATE_OF_ART",
  });
  
  // Benchmark comparison (if available)
  const benchmarkAtoms = externalDbAtoms.filter(e => e.benchmarkComparison);
  if (benchmarkAtoms.length > 0) {
    const benchmarkText = benchmarkAtoms.map(e => e.benchmarkComparison).join(" ");
    blocks.push({
      paragraphId: "benchmark",
      content: `Benchmark Comparison: ${benchmarkText}`,
      evidenceAtomIds: benchmarkAtoms.map(e => e.atomId),
      blockType: "BENCHMARK",
    });
  }
  
  // Safety profile confirmation
  blocks.push({
    paragraphId: "safety_profile",
    content: conclusions.safetyProfileStatement,
    evidenceAtomIds: literatureAtoms.map(l => l.atomId),
    blockType: "CONCLUSION",
  });
  
  return blocks;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + "...";
}

// ============================================================================
// EXPORTS FOR PSUR RENDERING
// ============================================================================

export function getLiteratureNarrativeBlocks(result: LiteratureAnalysisResult): string[] {
  return result.narrativeBlocks.map(b => b.content);
}

export function getLiteratureCitations(result: LiteratureAnalysisResult): string[] {
  return result.narrativeBlocks.flatMap(b => 
    b.evidenceAtomIds.map(id => `[${id}]`)
  );
}
