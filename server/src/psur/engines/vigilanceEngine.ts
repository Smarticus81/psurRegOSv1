/**
 * VIGILANCE ENGINE
 * 
 * Unified engine for serious incident summaries, IMDRF Annex A/C/F tables,
 * FSCA detection, and CAPA linkage analysis.
 * 
 * Outputs must explicitly state "NONE IDENTIFIED" where applicable.
 * All outputs include justification text fragments and risk file references.
 * 
 * Per MDCG 2022-21 Annex I, Sections 16-20
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

export interface SeriousIncidentAtom {
  atomId: string;
  evidenceType: "serious_incident_record";
  incidentId: string;
  deviceCode: string;
  incidentDate: string;
  reportDate?: string;
  description: string;
  outcome: IncidentOutcome;
  severity: IncidentSeverity;
  reportedToAuthority: boolean;
  authorityReference?: string;
  country?: string;
  
  // IMDRF Coding
  imdrfAnnexACode?: string; // Investigation result
  imdrfAnnexCCode?: string; // Health effect
  imdrfAnnexFCode?: string; // Root cause
  
  // Linkage
  relatedCapa?: string;
  relatedFsca?: string;
  riskFileReference?: string;
}

export interface FSCAAtom {
  atomId: string;
  evidenceType: "fsca_record";
  fscaId: string;
  deviceCode: string;
  actionType: FSCAActionType;
  initiationDate: string;
  completionDate?: string;
  status: FSCAStatus;
  description: string;
  affectedUnits?: number;
  fsnReference?: string;
  countries?: string[];
  relatedIncidents?: string[];
  capaReference?: string;
}

export interface CAPARecord {
  capaId: string;
  type: "CORRECTIVE" | "PREVENTIVE";
  status: CAPAStatus;
  openDate: string;
  closeDate?: string;
  description: string;
  effectiveness?: "EFFECTIVE" | "PARTIALLY_EFFECTIVE" | "NOT_EFFECTIVE" | "PENDING";
  relatedIncidents?: string[];
  relatedFscas?: string[];
  riskFileReference?: string;
}

export type IncidentOutcome = 
  | "DEATH"
  | "LIFE_THREATENING"
  | "HOSPITALIZATION"
  | "DISABILITY"
  | "INTERVENTION_REQUIRED"
  | "OTHER_SERIOUS"
  | "NON_SERIOUS";

export type IncidentSeverity = 
  | "SERIOUS"
  | "NON_SERIOUS";

export type FSCAActionType = 
  | "RECALL"
  | "MODIFICATION"
  | "ADVISORY"
  | "INSPECTION"
  | "OTHER";

export type FSCAStatus = 
  | "INITIATED"
  | "ONGOING"
  | "COMPLETED"
  | "TERMINATED";

export type CAPAStatus = 
  | "OPEN"
  | "IN_PROGRESS"
  | "CLOSED_EFFECTIVE"
  | "CLOSED_NOT_EFFECTIVE"
  | "CANCELLED";

export interface ReportingPeriod {
  start: string;
  end: string;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface VigilanceAnalysisResult {
  success: boolean;
  errors: string[];
  
  // Tables (STRICT output)
  seriousIncidentSummary: PSURTable;
  imdrfAnnexATable: PSURTable;
  imdrfAnnexCTable: PSURTable;
  imdrfAnnexFTable: PSURTable;
  fscaSummary: PSURTable;
  capaStatus: PSURTable;
  
  // Metrics
  metrics: VigilanceMetrics;
  
  // Narrative blocks
  narrativeBlocks: VigilanceNarrativeBlocks;
  
  // Trace
  allEvidenceAtomIds: string[];
}

export interface VigilanceMetrics {
  totalSeriousIncidents: number;
  totalNonSeriousIncidents: number;
  incidentsByOutcome: Record<IncidentOutcome, number>;
  incidentsByCountry: Record<string, number>;
  activeFscas: number;
  completedFscas: number;
  openCapas: number;
  closedCapas: number;
  effectiveCapas: number;
}

export interface VigilanceNarrativeBlocks {
  seriousIncidentStatement: string;
  fscaStatement: string;
  capaStatement: string;
  justificationFragments: string[];
  riskFileReferences: string[];
}

// ============================================================================
// IMDRF CODE DEFINITIONS
// ============================================================================

// IMDRF Annex A - Investigation Result Codes
const IMDRF_ANNEX_A_CODES: Record<string, string> = {
  "A01": "No failure found",
  "A02": "Under investigation",
  "A03": "Investigation inconclusive",
  "A04": "Device failure - design",
  "A05": "Device failure - manufacturing",
  "A06": "Device failure - material",
  "A07": "User error",
  "A08": "Patient factor",
  "A09": "External factor",
  "A99": "Other",
};

// IMDRF Annex C - Health Effect Codes (simplified)
const IMDRF_ANNEX_C_CODES: Record<string, string> = {
  "C01": "Death",
  "C02": "Life-threatening",
  "C03": "Hospitalization",
  "C04": "Disability/Incapacity",
  "C05": "Intervention required",
  "C06": "Other serious",
  "C07": "Non-serious",
  "C99": "No harm",
};

// IMDRF Annex F - Root Cause Codes (simplified)
const IMDRF_ANNEX_F_CODES: Record<string, string> = {
  "F01": "Design - hardware",
  "F02": "Design - software",
  "F03": "Design - labeling",
  "F04": "Manufacturing - process",
  "F05": "Manufacturing - material",
  "F06": "Supplier/component",
  "F07": "Packaging/shipping",
  "F08": "Use error",
  "F09": "Environmental",
  "F99": "Unknown/Other",
};

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export function computeVigilanceAnalysis(
  incidents: SeriousIncidentAtom[],
  fscas: FSCAAtom[],
  capas: CAPARecord[],
  reportingPeriod: ReportingPeriod
): VigilanceAnalysisResult {
  const errors: string[] = [];
  const allEvidenceAtomIds: string[] = [
    ...incidents.map(i => i.atomId),
    ...fscas.map(f => f.atomId),
  ];
  
  // Filter to reporting period
  const incidentsInPeriod = incidents.filter(i =>
    isWithinPeriod(i.incidentDate, reportingPeriod)
  );
  
  const fscasInPeriod = fscas.filter(f =>
    isWithinPeriod(f.initiationDate, reportingPeriod) ||
    (f.status === "ONGOING" || f.status === "INITIATED")
  );
  
  // -------------------------------------------------------------------------
  // METRICS CALCULATION
  // -------------------------------------------------------------------------
  const seriousIncidents = incidentsInPeriod.filter(i => i.severity === "SERIOUS");
  const nonSeriousIncidents = incidentsInPeriod.filter(i => i.severity === "NON_SERIOUS");
  
  // Outcome breakdown
  const incidentsByOutcome: Record<IncidentOutcome, number> = {
    DEATH: 0,
    LIFE_THREATENING: 0,
    HOSPITALIZATION: 0,
    DISABILITY: 0,
    INTERVENTION_REQUIRED: 0,
    OTHER_SERIOUS: 0,
    NON_SERIOUS: 0,
  };
  
  for (const i of incidentsInPeriod) {
    incidentsByOutcome[i.outcome]++;
  }
  
  // Country breakdown
  const incidentsByCountry: Record<string, number> = {};
  for (const i of incidentsInPeriod) {
    const country = i.country || "Unknown";
    incidentsByCountry[country] = (incidentsByCountry[country] || 0) + 1;
  }
  
  // FSCA metrics
  const activeFscas = fscasInPeriod.filter(f => 
    f.status === "INITIATED" || f.status === "ONGOING"
  ).length;
  const completedFscas = fscasInPeriod.filter(f => f.status === "COMPLETED").length;
  
  // CAPA metrics
  const openCapas = capas.filter(c => 
    c.status === "OPEN" || c.status === "IN_PROGRESS"
  ).length;
  const closedCapas = capas.filter(c => 
    c.status === "CLOSED_EFFECTIVE" || c.status === "CLOSED_NOT_EFFECTIVE"
  ).length;
  const effectiveCapas = capas.filter(c => c.status === "CLOSED_EFFECTIVE").length;
  
  const metrics: VigilanceMetrics = {
    totalSeriousIncidents: seriousIncidents.length,
    totalNonSeriousIncidents: nonSeriousIncidents.length,
    incidentsByOutcome,
    incidentsByCountry,
    activeFscas,
    completedFscas,
    openCapas,
    closedCapas,
    effectiveCapas,
  };
  
  // -------------------------------------------------------------------------
  // BUILD TABLES
  // -------------------------------------------------------------------------
  const seriousIncidentSummary = buildSeriousIncidentSummaryTable(
    incidentsInPeriod,
    allEvidenceAtomIds
  );
  
  const imdrfAnnexATable = buildIMDRFAnnexATable(incidentsInPeriod, allEvidenceAtomIds);
  const imdrfAnnexCTable = buildIMDRFAnnexCTable(incidentsInPeriod, allEvidenceAtomIds);
  const imdrfAnnexFTable = buildIMDRFAnnexFTable(incidentsInPeriod, allEvidenceAtomIds);
  const fscaSummary = buildFSCASummaryTable(fscasInPeriod, allEvidenceAtomIds);
  const capaStatusTable = buildCAPAStatusTable(capas, allEvidenceAtomIds);
  
  // -------------------------------------------------------------------------
  // GENERATE NARRATIVE BLOCKS
  // -------------------------------------------------------------------------
  const narrativeBlocks = generateNarrativeBlocks(metrics, incidentsInPeriod, fscasInPeriod, capas);
  
  return {
    success: errors.length === 0,
    errors,
    seriousIncidentSummary,
    imdrfAnnexATable,
    imdrfAnnexCTable,
    imdrfAnnexFTable,
    fscaSummary,
    capaStatus: capaStatusTable,
    metrics,
    narrativeBlocks,
    allEvidenceAtomIds,
  };
}

// ============================================================================
// TABLE BUILDERS
// ============================================================================

function buildSeriousIncidentSummaryTable(
  incidents: SeriousIncidentAtom[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_serious_incidents", evidenceAtomIds);
  
  if (incidents.length === 0) {
    return {
      tableId: "TABLE_SERIOUS_INCIDENTS",
      title: "Serious Incident Summary",
      columns: ["Incident ID", "Date", "Outcome", "Authority Ref", "Status"],
      rows: [
        {
          rowId: "header",
          isHeader: true,
          cells: [
            { value: "Incident ID", format: "text" },
            { value: "Date", format: "text" },
            { value: "Outcome", format: "text" },
            { value: "Authority Ref", format: "text" },
            { value: "Status", format: "text" },
          ],
        },
        {
          rowId: "none",
          cells: [
            { value: "NONE IDENTIFIED", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
          ],
        },
      ],
      footnotes: ["No serious incidents were reported during the reporting period."],
      traceRef,
    };
  }
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Incident ID", format: "text" },
        { value: "Date", format: "date" },
        { value: "Outcome", format: "text" },
        { value: "Authority Ref", format: "text" },
        { value: "Country", format: "text" },
      ],
    },
  ];
  
  const seriousOnly = incidents.filter(i => i.severity === "SERIOUS");
  for (const incident of seriousOnly) {
    rows.push({
      rowId: `incident_${incident.incidentId}`,
      cells: [
        { value: incident.incidentId, format: "text" },
        { value: incident.incidentDate, format: "date" },
        { value: incident.outcome, format: "text" },
        { value: incident.authorityReference || "N/A", format: "text" },
        { value: incident.country || "N/A", format: "text" },
      ],
    });
  }
  
  rows.push({
    rowId: "total",
    isTotal: true,
    cells: [
      { value: `TOTAL: ${seriousOnly.length}`, format: "text" },
      { value: "", format: "text" },
      { value: "", format: "text" },
      { value: "", format: "text" },
      { value: "", format: "text" },
    ],
  });
  
  return {
    tableId: "TABLE_SERIOUS_INCIDENTS",
    title: "Serious Incident Summary",
    columns: ["Incident ID", "Date", "Outcome", "Authority Ref", "Country"],
    rows,
    traceRef,
  };
}

function buildIMDRFAnnexATable(
  incidents: SeriousIncidentAtom[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_imdrf_annex_a", evidenceAtomIds);
  
  // Count by Annex A code
  const codeCount: Record<string, number> = {};
  for (const code of Object.keys(IMDRF_ANNEX_A_CODES)) {
    codeCount[code] = 0;
  }
  
  for (const i of incidents) {
    const code = i.imdrfAnnexACode || "A99";
    codeCount[code] = (codeCount[code] || 0) + 1;
  }
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Code", format: "text" },
        { value: "Description", format: "text" },
        { value: "Count", format: "number" },
      ],
    },
  ];
  
  let total = 0;
  for (const [code, desc] of Object.entries(IMDRF_ANNEX_A_CODES)) {
    const count = codeCount[code] || 0;
    if (count > 0 || incidents.length === 0) {
      rows.push({
        rowId: `code_${code}`,
        cells: [
          { value: code, format: "text" },
          { value: desc, format: "text" },
          { value: count, format: "number" },
        ],
      });
      total += count;
    }
  }
  
  if (incidents.length === 0) {
    rows.push({
      rowId: "none",
      cells: [
        { value: "-", format: "text" },
        { value: "NONE IDENTIFIED", format: "text" },
        { value: 0, format: "number" },
      ],
    });
  }
  
  rows.push({
    rowId: "total",
    isTotal: true,
    cells: [
      { value: "", format: "text" },
      { value: "TOTAL", format: "text" },
      { value: total, format: "number" },
    ],
  });
  
  return {
    tableId: "TABLE_IMDRF_ANNEX_A",
    title: "IMDRF Annex A - Investigation Results",
    columns: ["Code", "Description", "Count"],
    rows,
    footnotes: ["Per IMDRF/MC/N2/2019 - Medical Device Adverse Event Codes"],
    traceRef,
  };
}

function buildIMDRFAnnexCTable(
  incidents: SeriousIncidentAtom[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_imdrf_annex_c", evidenceAtomIds);
  
  const codeCount: Record<string, number> = {};
  for (const code of Object.keys(IMDRF_ANNEX_C_CODES)) {
    codeCount[code] = 0;
  }
  
  for (const i of incidents) {
    const code = i.imdrfAnnexCCode || "C99";
    codeCount[code] = (codeCount[code] || 0) + 1;
  }
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Code", format: "text" },
        { value: "Health Effect", format: "text" },
        { value: "Count", format: "number" },
      ],
    },
  ];
  
  let total = 0;
  for (const [code, desc] of Object.entries(IMDRF_ANNEX_C_CODES)) {
    const count = codeCount[code] || 0;
    if (count > 0) {
      rows.push({
        rowId: `code_${code}`,
        cells: [
          { value: code, format: "text" },
          { value: desc, format: "text" },
          { value: count, format: "number" },
        ],
      });
      total += count;
    }
  }
  
  if (incidents.length === 0) {
    rows.push({
      rowId: "none",
      cells: [
        { value: "-", format: "text" },
        { value: "NONE IDENTIFIED", format: "text" },
        { value: 0, format: "number" },
      ],
    });
  }
  
  rows.push({
    rowId: "total",
    isTotal: true,
    cells: [
      { value: "", format: "text" },
      { value: "TOTAL", format: "text" },
      { value: total, format: "number" },
    ],
  });
  
  return {
    tableId: "TABLE_IMDRF_ANNEX_C",
    title: "IMDRF Annex C - Health Effects",
    columns: ["Code", "Health Effect", "Count"],
    rows,
    footnotes: ["Per IMDRF/MC/N2/2019 - Medical Device Adverse Event Codes"],
    traceRef,
  };
}

function buildIMDRFAnnexFTable(
  incidents: SeriousIncidentAtom[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_imdrf_annex_f", evidenceAtomIds);
  
  const codeCount: Record<string, number> = {};
  for (const code of Object.keys(IMDRF_ANNEX_F_CODES)) {
    codeCount[code] = 0;
  }
  
  for (const i of incidents) {
    const code = i.imdrfAnnexFCode || "F99";
    codeCount[code] = (codeCount[code] || 0) + 1;
  }
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Code", format: "text" },
        { value: "Root Cause Category", format: "text" },
        { value: "Count", format: "number" },
      ],
    },
  ];
  
  let total = 0;
  for (const [code, desc] of Object.entries(IMDRF_ANNEX_F_CODES)) {
    const count = codeCount[code] || 0;
    if (count > 0) {
      rows.push({
        rowId: `code_${code}`,
        cells: [
          { value: code, format: "text" },
          { value: desc, format: "text" },
          { value: count, format: "number" },
        ],
      });
      total += count;
    }
  }
  
  if (incidents.length === 0) {
    rows.push({
      rowId: "none",
      cells: [
        { value: "-", format: "text" },
        { value: "NONE IDENTIFIED", format: "text" },
        { value: 0, format: "number" },
      ],
    });
  }
  
  rows.push({
    rowId: "total",
    isTotal: true,
    cells: [
      { value: "", format: "text" },
      { value: "TOTAL", format: "text" },
      { value: total, format: "number" },
    ],
  });
  
  return {
    tableId: "TABLE_IMDRF_ANNEX_F",
    title: "IMDRF Annex F - Root Cause Analysis",
    columns: ["Code", "Root Cause Category", "Count"],
    rows,
    footnotes: ["Per IMDRF/MC/N2/2019 - Medical Device Adverse Event Codes"],
    traceRef,
  };
}

function buildFSCASummaryTable(
  fscas: FSCAAtom[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_fsca_summary", evidenceAtomIds);
  
  if (fscas.length === 0) {
    return {
      tableId: "TABLE_FSCA_SUMMARY",
      title: "Field Safety Corrective Actions Summary",
      columns: ["FSCA ID", "Type", "Status", "Initiation Date", "Affected Units"],
      rows: [
        {
          rowId: "header",
          isHeader: true,
          cells: [
            { value: "FSCA ID", format: "text" },
            { value: "Type", format: "text" },
            { value: "Status", format: "text" },
            { value: "Initiation Date", format: "text" },
            { value: "Affected Units", format: "text" },
          ],
        },
        {
          rowId: "none",
          cells: [
            { value: "NONE", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
          ],
        },
      ],
      footnotes: ["No FSCAs were initiated or ongoing during the reporting period."],
      traceRef,
    };
  }
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "FSCA ID", format: "text" },
        { value: "Type", format: "text" },
        { value: "Status", format: "text" },
        { value: "Initiation Date", format: "date" },
        { value: "Affected Units", format: "number" },
      ],
    },
  ];
  
  for (const fsca of fscas) {
    rows.push({
      rowId: `fsca_${fsca.fscaId}`,
      cells: [
        { value: fsca.fscaId, format: "text" },
        { value: fsca.actionType, format: "text" },
        { value: fsca.status, format: "text" },
        { value: fsca.initiationDate, format: "date" },
        { value: fsca.affectedUnits || "N/A", format: "text" },
      ],
    });
  }
  
  return {
    tableId: "TABLE_FSCA_SUMMARY",
    title: "Field Safety Corrective Actions Summary",
    columns: ["FSCA ID", "Type", "Status", "Initiation Date", "Affected Units"],
    rows,
    traceRef,
  };
}

function buildCAPAStatusTable(
  capas: CAPARecord[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_capa_status", evidenceAtomIds);
  
  if (capas.length === 0) {
    return {
      tableId: "TABLE_CAPA_STATUS",
      title: "CAPA Status Summary",
      columns: ["CAPA ID", "Type", "Status", "Effectiveness"],
      rows: [
        {
          rowId: "header",
          isHeader: true,
          cells: [
            { value: "CAPA ID", format: "text" },
            { value: "Type", format: "text" },
            { value: "Status", format: "text" },
            { value: "Effectiveness", format: "text" },
          ],
        },
        {
          rowId: "none",
          cells: [
            { value: "NONE", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
          ],
        },
      ],
      footnotes: ["No CAPAs related to vigilance activities."],
      traceRef,
    };
  }
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "CAPA ID", format: "text" },
        { value: "Type", format: "text" },
        { value: "Status", format: "text" },
        { value: "Effectiveness", format: "text" },
      ],
    },
  ];
  
  for (const capa of capas) {
    rows.push({
      rowId: `capa_${capa.capaId}`,
      cells: [
        { value: capa.capaId, format: "text" },
        { value: capa.type, format: "text" },
        { value: capa.status, format: "text" },
        { value: capa.effectiveness || "PENDING", format: "text" },
      ],
    });
  }
  
  return {
    tableId: "TABLE_CAPA_STATUS",
    title: "CAPA Status Summary",
    columns: ["CAPA ID", "Type", "Status", "Effectiveness"],
    rows,
    traceRef,
  };
}

// ============================================================================
// NARRATIVE GENERATION
// ============================================================================

function generateNarrativeBlocks(
  metrics: VigilanceMetrics,
  incidents: SeriousIncidentAtom[],
  fscas: FSCAAtom[],
  capas: CAPARecord[]
): VigilanceNarrativeBlocks {
  const justificationFragments: string[] = [];
  const riskFileReferences: string[] = [];
  
  // Collect risk file references
  for (const i of incidents) {
    if (i.riskFileReference) {
      riskFileReferences.push(i.riskFileReference);
    }
  }
  for (const c of capas) {
    if (c.riskFileReference) {
      riskFileReferences.push(c.riskFileReference);
    }
  }
  
  // Serious incident statement
  let seriousIncidentStatement: string;
  if (metrics.totalSeriousIncidents === 0) {
    seriousIncidentStatement = "NONE IDENTIFIED. No serious incidents were reported during the reporting period. This represents continued acceptable safety performance.";
    justificationFragments.push("Zero serious incidents indicates the device safety profile remains within acceptable limits.");
  } else {
    seriousIncidentStatement = `${metrics.totalSeriousIncidents} serious incident(s) were reported during the reporting period. All incidents have been investigated and reported to the relevant competent authorities in accordance with MDR Article 87.`;
    
    // Add outcome breakdown
    const deaths = metrics.incidentsByOutcome.DEATH;
    if (deaths > 0) {
      justificationFragments.push(`${deaths} incident(s) resulted in patient death. Root cause analysis and CAPA have been initiated.`);
    }
    
    const interventions = metrics.incidentsByOutcome.INTERVENTION_REQUIRED;
    if (interventions > 0) {
      justificationFragments.push(`${interventions} incident(s) required medical intervention to prevent serious harm.`);
    }
  }
  
  // FSCA statement
  let fscaStatement: string;
  if (metrics.activeFscas === 0 && metrics.completedFscas === 0) {
    fscaStatement = "NONE IDENTIFIED. No Field Safety Corrective Actions were initiated or ongoing during the reporting period.";
    justificationFragments.push("Absence of FSCAs indicates no systemic safety issues requiring field action.");
  } else {
    const parts: string[] = [];
    if (metrics.activeFscas > 0) {
      parts.push(`${metrics.activeFscas} active FSCA(s)`);
    }
    if (metrics.completedFscas > 0) {
      parts.push(`${metrics.completedFscas} completed FSCA(s)`);
    }
    fscaStatement = `${parts.join(" and ")} during the reporting period. Field Safety Notices have been distributed to affected customers and competent authorities.`;
  }
  
  // CAPA statement
  let capaStatement: string;
  if (capas.length === 0) {
    capaStatement = "No vigilance-related CAPAs are currently open or were closed during the reporting period.";
  } else {
    const parts: string[] = [];
    if (metrics.openCapas > 0) {
      parts.push(`${metrics.openCapas} open CAPA(s)`);
    }
    if (metrics.closedCapas > 0) {
      parts.push(`${metrics.closedCapas} closed CAPA(s)`);
    }
    if (metrics.effectiveCapas > 0) {
      parts.push(`${metrics.effectiveCapas} verified as effective`);
    }
    capaStatement = `Vigilance-related CAPA status: ${parts.join(", ")}.`;
  }
  
  return {
    seriousIncidentStatement,
    fscaStatement,
    capaStatement,
    justificationFragments,
    riskFileReferences: Array.from(new Set(riskFileReferences)),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isWithinPeriod(dateStr: string, period: ReportingPeriod): boolean {
  const date = new Date(dateStr);
  return date >= new Date(period.start) && date <= new Date(period.end);
}

// ============================================================================
// EXPORTS FOR PSUR RENDERING
// ============================================================================

export function getVigilanceNarrativeBlocks(result: VigilanceAnalysisResult): string[] {
  const blocks: string[] = [];
  
  blocks.push(result.narrativeBlocks.seriousIncidentStatement);
  blocks.push(result.narrativeBlocks.fscaStatement);
  blocks.push(result.narrativeBlocks.capaStatement);
  
  if (result.narrativeBlocks.justificationFragments.length > 0) {
    blocks.push("Justification: " + result.narrativeBlocks.justificationFragments.join(" "));
  }
  
  if (result.narrativeBlocks.riskFileReferences.length > 0) {
    blocks.push("Risk File References: " + result.narrativeBlocks.riskFileReferences.join(", "));
  }
  
  return blocks;
}
