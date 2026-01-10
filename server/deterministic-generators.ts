import type { EvidenceAtom, PSURCase } from "@shared/schema";
import { FORMQAR_SLOTS, getSlotDefinitionsForTemplate } from "./queue-builder";
import { loadTemplate } from "./template-loader";
import crypto from "crypto";

export interface DeterministicGeneratorResult {
  success: boolean;
  slotId: string;
  proposalId: string;
  contentType: "table" | "narrative" | "object";
  content: unknown;
  contentHash: string;
  evidenceAtomIds: number[];
  methodStatement: string;
  claimedObligationIds: string[];
  transformationsUsed: string[];
  agentId: string;
  error?: string;
  errorDetails?: {
    totalAtoms: number;
    filteredOutAtoms: number;
    periodStart: string;
    periodEnd: string;
    reason: string;
  };
}

function generateProposalId(): string {
  return `PROP-${crypto.randomBytes(6).toString("hex")}`;
}

function sha256Json(obj: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

export interface TableContent {
  headers: string[];
  rows: Array<Record<string, string | number>>;
  summary?: string;
}

export interface SlotMetadata {
  obligationIds: string[];
  allowedTransformations: string[];
}

export const DETERMINISTIC_SUPPORTED_SLOTS = new Set([
  "F.11.complaints_by_region_severity",
  "PSUR.COMPLAINTS.SUMMARY_BY_REGION_SERIOUSNESS",
  "C.02.sales_table",
  "sales.volume_table",
  "D.01.incidents_summary",
  "incidents.by_region_severity",
  "H.01.fsca_summary",
  "fsca.summary_table",
]);

export function isDeterministicSupported(slotId: string): boolean {
  return DETERMINISTIC_SUPPORTED_SLOTS.has(slotId);
}

function dateOnly(s: string | Date | unknown): string {
  if (s instanceof Date) {
    return s.toISOString().slice(0, 10);
  }
  return String(s || "").slice(0, 10);
}

function inPeriod(d: string, start: string, end: string): boolean {
  const x = dateOnly(d);
  return x >= start && x <= end;
}

function severityToSeriousness(sev: unknown): "serious_incident" | "non_serious" | "unknown" {
  const s = String(sev || "").trim().toLowerCase();
  if (s === "high" || s === "critical") return "serious_incident";
  if (s === "low" || s === "medium") return "non_serious";
  return "unknown";
}

export function getSlotMetadata(slotId: string, templateId: string): SlotMetadata | null {
  try {
    const template = loadTemplate(templateId);
    const obligationIds = template.mapping[slotId] || [];
    const slotDef = template.slots?.find((s: { slot_id: string }) => s.slot_id === slotId);
    
    if (obligationIds.length === 0 && !slotDef) {
      const slots = getSlotDefinitionsForTemplate(templateId);
      const fallbackSlot = slots.find(s => s.slot_id === slotId);
      if (!fallbackSlot) return null;
      return {
        obligationIds: fallbackSlot.obligation_ids,
        allowedTransformations: fallbackSlot.allowed_transformations,
      };
    }
    
    return {
      obligationIds,
      allowedTransformations: ["tabulate", "aggregate"],
    };
  } catch {
    const slots = getSlotDefinitionsForTemplate(templateId);
    const slotDef = slots.find(s => s.slot_id === slotId);
    if (!slotDef) return null;
    return {
      obligationIds: slotDef.obligation_ids,
      allowedTransformations: slotDef.allowed_transformations,
    };
  }
}

function normalizeToDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "number") {
    return new Date(value);
  }
  return null;
}

function formatDateSafe(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function generateComplaintsByRegionSeverity(
  complaintAtoms: EvidenceAtom[],
  psurCase: PSURCase,
  slotMetadata: SlotMetadata
): DeterministicGeneratorResult {
  const slotId = "F.11.complaints_by_region_severity";
  
  const periodStart = normalizeToDate(psurCase.startPeriod);
  const periodEnd = normalizeToDate(psurCase.endPeriod);
  
  const agentId = "DeterministicSlotGenerator:v1";
  
  if (!periodStart || !periodEnd) {
    return {
      success: false,
      slotId,
      proposalId: generateProposalId(),
      contentType: "table",
      content: null,
      contentHash: "",
      evidenceAtomIds: [],
      methodStatement: "",
      claimedObligationIds: slotMetadata.obligationIds,
      transformationsUsed: slotMetadata.allowedTransformations,
      agentId,
      error: "Invalid PSUR period dates - cannot determine reporting period",
      errorDetails: {
        totalAtoms: complaintAtoms.length,
        filteredOutAtoms: 0,
        periodStart: String(psurCase.startPeriod),
        periodEnd: String(psurCase.endPeriod),
        reason: "Could not parse startPeriod or endPeriod as valid dates",
      },
    };
  }
  
  if (complaintAtoms.length === 0) {
    return {
      success: false,
      slotId,
      proposalId: generateProposalId(),
      contentType: "table",
      content: null,
      contentHash: "",
      evidenceAtomIds: [],
      methodStatement: "",
      claimedObligationIds: slotMetadata.obligationIds,
      transformationsUsed: slotMetadata.allowedTransformations,
      agentId,
      error: "No complaint_record evidence atoms available",
      errorDetails: {
        totalAtoms: 0,
        filteredOutAtoms: 0,
        periodStart: formatDateSafe(periodStart),
        periodEnd: formatDateSafe(periodEnd),
        reason: "No complaint_record evidence atoms have been ingested for this PSUR case",
      },
    };
  }

  const inPeriodAtoms: EvidenceAtom[] = [];
  const outOfPeriodAtoms: EvidenceAtom[] = [];
  
  for (const atom of complaintAtoms) {
    const atomData = atom.data as Record<string, unknown>;
    const complaintDateRaw = atomData.complaintDate;
    const atomDate = normalizeToDate(complaintDateRaw);
    
    if (!atomDate) {
      outOfPeriodAtoms.push(atom);
      continue;
    }
    
    if (atomDate >= periodStart && atomDate <= periodEnd) {
      inPeriodAtoms.push(atom);
    } else {
      outOfPeriodAtoms.push(atom);
    }
  }

  if (inPeriodAtoms.length === 0) {
    return {
      success: false,
      slotId,
      proposalId: generateProposalId(),
      contentType: "table",
      content: null,
      contentHash: "",
      evidenceAtomIds: complaintAtoms.map(a => a.id),
      methodStatement: "",
      claimedObligationIds: slotMetadata.obligationIds,
      transformationsUsed: slotMetadata.allowedTransformations,
      agentId,
      error: `No complaint records found within the PSUR period`,
      errorDetails: {
        totalAtoms: complaintAtoms.length,
        filteredOutAtoms: outOfPeriodAtoms.length,
        periodStart: formatDateSafe(periodStart),
        periodEnd: formatDateSafe(periodEnd),
        reason: `All ${complaintAtoms.length} complaint records are outside the reporting period (${outOfPeriodAtoms.length} filtered out)`,
      },
    };
  }

  const groupedCounts: Record<string, Record<string, number>> = {};
  const regionsSet = new Set<string>();
  const severitiesSet = new Set<string>();

  for (const atom of inPeriodAtoms) {
    const atomData = atom.data as Record<string, unknown>;
    const region = (atomData.region as string) || (atomData.country as string) || "Unknown";
    const severity = (atomData.severity as string) || "unclassified";
    
    regionsSet.add(region);
    severitiesSet.add(severity);
    
    if (!groupedCounts[region]) {
      groupedCounts[region] = {};
    }
    groupedCounts[region][severity] = (groupedCounts[region][severity] || 0) + 1;
  }

  const regions = Array.from(regionsSet).sort();
  const severities = Array.from(severitiesSet).sort();

  const tableRows: Array<Record<string, string | number>> = [];
  
  for (const region of regions) {
    const row: Record<string, string | number> = { region };
    let rowTotal = 0;
    for (const severity of severities) {
      const count = groupedCounts[region]?.[severity] || 0;
      row[severity] = count;
      rowTotal += count;
    }
    row["total"] = rowTotal;
    tableRows.push(row);
  }

  const totalsRow: Record<string, string | number> = { region: "TOTAL" };
  let grandTotal = 0;
  for (const severity of severities) {
    let severityTotal = 0;
    for (const region of regions) {
      severityTotal += groupedCounts[region]?.[severity] || 0;
    }
    totalsRow[severity] = severityTotal;
    grandTotal += severityTotal;
  }
  totalsRow["total"] = grandTotal;
  tableRows.push(totalsRow);

  const headers = ["region", ...severities, "total"];

  const tableContent: TableContent = {
    headers,
    rows: tableRows,
    summary: `Cross-tabulation of ${inPeriodAtoms.length} complaints by region and severity for the reporting period ${formatDateSafe(periodStart)} to ${formatDateSafe(periodEnd)}.`,
  };

  const methodStatement = `Deterministic aggregation of ${inPeriodAtoms.length} complaint_record evidence atoms. ` +
    `Each record was filtered by complaintDate within the PSUR period [${formatDateSafe(periodStart)}, ${formatDateSafe(periodEnd)}]. ` +
    `Records were grouped by (region OR country field) × (severity field). ` +
    `Counts represent unique complaint records per cell. ` +
    `${outOfPeriodAtoms.length} records were excluded as out-of-period. ` +
    `No interpolation, estimation, or AI inference was applied.`;

  return {
    success: true,
    slotId,
    proposalId: generateProposalId(),
    contentType: "table",
    content: tableContent,
    contentHash: sha256Json(tableContent),
    evidenceAtomIds: inPeriodAtoms.map(a => a.id),
    methodStatement,
    claimedObligationIds: slotMetadata.obligationIds,
    transformationsUsed: slotMetadata.allowedTransformations,
    agentId,
  };
}

export function generateComplaintsByRegionSeriousness(
  complaintAtoms: EvidenceAtom[],
  psurCase: PSURCase,
  slotMetadata: SlotMetadata
): DeterministicGeneratorResult & { debug?: Record<string, unknown> } {
  const slotId = "PSUR.COMPLAINTS.SUMMARY_BY_REGION_SERIOUSNESS";
  const agentId = "DeterministicSlotGenerator:v1";
  
  const periodStart = dateOnly(psurCase.startPeriod);
  const periodEnd = dateOnly(psurCase.endPeriod);
  
  if (!periodStart || !periodEnd || periodStart.length !== 10 || periodEnd.length !== 10) {
    return {
      success: false,
      slotId,
      proposalId: generateProposalId(),
      contentType: "table",
      content: null,
      contentHash: "",
      evidenceAtomIds: [],
      methodStatement: "",
      claimedObligationIds: slotMetadata.obligationIds,
      transformationsUsed: slotMetadata.allowedTransformations,
      agentId,
      error: "Invalid PSUR period dates",
      debug: {
        totalAtoms: complaintAtoms.length,
        periodStart: String(psurCase.startPeriod),
        periodEnd: String(psurCase.endPeriod),
      },
    };
  }
  
  if (complaintAtoms.length === 0) {
    return {
      success: false,
      slotId,
      proposalId: generateProposalId(),
      contentType: "table",
      content: null,
      contentHash: "",
      evidenceAtomIds: [],
      methodStatement: "",
      claimedObligationIds: slotMetadata.obligationIds,
      transformationsUsed: slotMetadata.allowedTransformations,
      agentId,
      error: "No complaint_record evidence atoms available",
      debug: {
        totalAtoms: 0,
        inPeriodAtoms: 0,
        periodStart,
        periodEnd,
      },
    };
  }

  const inPeriodAtoms: EvidenceAtom[] = [];
  const outOfPeriodAtoms: EvidenceAtom[] = [];
  
  for (const atom of complaintAtoms) {
    const normalizedData = atom.normalizedData as Record<string, unknown> | null;
    if (!normalizedData) {
      outOfPeriodAtoms.push(atom);
      continue;
    }
    
    const complaintDate = normalizedData.complaintDate as string;
    if (!complaintDate || !inPeriod(complaintDate, periodStart, periodEnd)) {
      outOfPeriodAtoms.push(atom);
    } else {
      inPeriodAtoms.push(atom);
    }
  }

  if (inPeriodAtoms.length === 0) {
    return {
      success: false,
      slotId,
      proposalId: generateProposalId(),
      contentType: "table",
      content: null,
      contentHash: "",
      evidenceAtomIds: complaintAtoms.map(a => a.id),
      methodStatement: "",
      claimedObligationIds: slotMetadata.obligationIds,
      transformationsUsed: slotMetadata.allowedTransformations,
      agentId,
      error: `No complaint records found within PSUR period`,
      debug: {
        totalAtoms: complaintAtoms.length,
        inPeriodAtoms: 0,
        periodStart,
        periodEnd,
      },
    };
  }

  const groupedCounts: Record<string, Record<string, number>> = {};
  const regionsSet = new Set<string>();
  const seriousnessSet = new Set<string>();

  for (const atom of inPeriodAtoms) {
    const normalizedData = atom.normalizedData as Record<string, unknown>;
    const region = (normalizedData.region as string) || (normalizedData.country as string) || "Unknown";
    const severity = normalizedData.severity as string | undefined;
    const seriousness = severityToSeriousness(severity);
    
    regionsSet.add(region);
    seriousnessSet.add(seriousness);
    
    if (!groupedCounts[region]) {
      groupedCounts[region] = {};
    }
    groupedCounts[region][seriousness] = (groupedCounts[region][seriousness] || 0) + 1;
  }

  const regions = Array.from(regionsSet).sort();
  const seriousnessValues = ["serious_incident", "non_serious", "unknown"].filter(s => seriousnessSet.has(s));

  const tableRows: Array<Record<string, string | number>> = [];
  
  for (const region of regions) {
    const row: Record<string, string | number> = { region };
    let rowTotal = 0;
    for (const seriousness of seriousnessValues) {
      const count = groupedCounts[region]?.[seriousness] || 0;
      row[seriousness] = count;
      rowTotal += count;
    }
    row["total"] = rowTotal;
    tableRows.push(row);
  }

  const totalsRow: Record<string, string | number> = { region: "TOTAL" };
  let grandTotal = 0;
  for (const seriousness of seriousnessValues) {
    let seriousnessTotal = 0;
    for (const region of regions) {
      seriousnessTotal += groupedCounts[region]?.[seriousness] || 0;
    }
    totalsRow[seriousness] = seriousnessTotal;
    grandTotal += seriousnessTotal;
  }
  totalsRow["total"] = grandTotal;
  tableRows.push(totalsRow);

  const headers = ["region", ...seriousnessValues, "total"];

  const tableContent: TableContent = {
    headers,
    rows: tableRows,
    summary: `Cross-tabulation of ${inPeriodAtoms.length} complaints by region and seriousness for reporting period ${periodStart} to ${periodEnd}.`,
  };

  const methodStatement = 
    `Filtered complaint EvidenceAtoms by normalizedData.complaintDate within PSUR period ` +
    `(${periodStart} to ${periodEnd}) and counted by region + mapped seriousness (from severity). ` +
    `Severity→seriousness: high/critical→serious_incident, low/medium→non_serious, else→unknown. ` +
    `${outOfPeriodAtoms.length} records excluded as out-of-period. No interpolation or AI inference.`;

  return {
    success: true,
    slotId,
    proposalId: generateProposalId(),
    contentType: "table",
    content: tableContent,
    contentHash: sha256Json(tableContent),
    evidenceAtomIds: inPeriodAtoms.map(a => a.id),
    methodStatement,
    claimedObligationIds: slotMetadata.obligationIds,
    transformationsUsed: slotMetadata.allowedTransformations,
    agentId,
    debug: {
      totalAtoms: complaintAtoms.length,
      inPeriodAtoms: inPeriodAtoms.length,
      periodStart,
      periodEnd,
    },
  };
}

export function generateSalesVolumeTable(
  salesAtoms: EvidenceAtom[],
  psurCase: PSURCase,
  slotMetadata: SlotMetadata,
  originalSlotId: string
): DeterministicGeneratorResult {
  const agentId = "DeterministicSlotGenerator:v1";
  
  const periodStart = dateOnly(psurCase.startPeriod);
  const periodEnd = dateOnly(psurCase.endPeriod);
  
  if (salesAtoms.length === 0) {
    return {
      success: false,
      slotId: originalSlotId,
      proposalId: generateProposalId(),
      contentType: "table",
      content: null,
      contentHash: "",
      evidenceAtomIds: [],
      methodStatement: "",
      claimedObligationIds: slotMetadata.obligationIds,
      transformationsUsed: slotMetadata.allowedTransformations,
      agentId,
      error: "No sales_volume evidence atoms available",
      errorDetails: {
        totalAtoms: 0,
        filteredOutAtoms: 0,
        periodStart,
        periodEnd,
        reason: "No sales_volume evidence atoms have been ingested for this PSUR case",
      },
    };
  }

  const tableRows: Array<Record<string, string | number>> = [];
  const usedAtomIds: number[] = [];
  const skippedAtoms: number[] = [];
  let totalUnits = 0;

  for (const atom of salesAtoms) {
    const data = (atom.normalizedData || atom.data) as Record<string, unknown>;
    const unitsRaw = data.units ?? data.quantity ?? data.volume;
    
    if (unitsRaw === undefined || unitsRaw === null) {
      skippedAtoms.push(atom.id);
      continue;
    }
    
    const units = Number(unitsRaw);
    if (isNaN(units)) {
      skippedAtoms.push(atom.id);
      continue;
    }
    
    const region = String(data.region || data.country || data.market || "Global");
    const period = String(data.period || data.reportingPeriod || `${periodStart} - ${periodEnd}`);
    
    tableRows.push({ region, units, period });
    totalUnits += units;
    usedAtomIds.push(atom.id);
  }

  if (usedAtomIds.length === 0) {
    return {
      success: false,
      slotId: originalSlotId,
      proposalId: generateProposalId(),
      contentType: "table",
      content: null,
      contentHash: "",
      evidenceAtomIds: salesAtoms.map(a => a.id),
      methodStatement: "",
      claimedObligationIds: slotMetadata.obligationIds,
      transformationsUsed: slotMetadata.allowedTransformations,
      agentId,
      error: "No sales_volume atoms with valid units/quantity field",
      errorDetails: {
        totalAtoms: salesAtoms.length,
        filteredOutAtoms: skippedAtoms.length,
        periodStart,
        periodEnd,
        reason: `All ${salesAtoms.length} sales_volume atoms are missing required 'units' or 'quantity' field`,
      },
    };
  }

  tableRows.push({ region: "TOTAL", units: totalUnits, period: `${periodStart} to ${periodEnd}` });

  const tableContent: TableContent = {
    headers: ["region", "units", "period"],
    rows: tableRows,
    summary: `Sales volume data from ${usedAtomIds.length} evidence atoms for reporting period ${periodStart} to ${periodEnd}. Total units: ${totalUnits}.`,
  };

  const methodStatement = `Aggregated ${usedAtomIds.length} sales_volume evidence atoms. Extracted region/units/period fields. ${skippedAtoms.length} atoms skipped due to missing/invalid units field. No interpolation or AI inference applied.`;

  return {
    success: true,
    slotId: originalSlotId,
    proposalId: generateProposalId(),
    contentType: "table",
    content: tableContent,
    contentHash: sha256Json(tableContent),
    evidenceAtomIds: usedAtomIds,
    methodStatement,
    claimedObligationIds: slotMetadata.obligationIds,
    transformationsUsed: slotMetadata.allowedTransformations,
    agentId,
  };
}

export function generateIncidentsByRegionSeriousness(
  incidentAtoms: EvidenceAtom[],
  psurCase: PSURCase,
  slotMetadata: SlotMetadata,
  originalSlotId: string
): DeterministicGeneratorResult {
  const agentId = "DeterministicSlotGenerator:v1";
  
  const periodStart = dateOnly(psurCase.startPeriod);
  const periodEnd = dateOnly(psurCase.endPeriod);
  
  if (incidentAtoms.length === 0) {
    return {
      success: false,
      slotId: originalSlotId,
      proposalId: generateProposalId(),
      contentType: "table",
      content: null,
      contentHash: "",
      evidenceAtomIds: [],
      methodStatement: "",
      claimedObligationIds: slotMetadata.obligationIds,
      transformationsUsed: slotMetadata.allowedTransformations,
      agentId,
      error: "No incident_record evidence atoms available",
      errorDetails: {
        totalAtoms: 0,
        filteredOutAtoms: 0,
        periodStart,
        periodEnd,
        reason: "No incident_record evidence atoms have been ingested for this PSUR case",
      },
    };
  }

  const inPeriodAtoms: EvidenceAtom[] = [];
  const outOfPeriodAtoms: EvidenceAtom[] = [];
  
  for (const atom of incidentAtoms) {
    const data = (atom.normalizedData || atom.data) as Record<string, unknown>;
    const incidentDate = dateOnly(data.incidentDate || data.eventDate || data.date);
    if (incidentDate && inPeriod(incidentDate, periodStart, periodEnd)) {
      inPeriodAtoms.push(atom);
    } else {
      outOfPeriodAtoms.push(atom);
    }
  }

  if (inPeriodAtoms.length === 0) {
    return {
      success: false,
      slotId: originalSlotId,
      proposalId: generateProposalId(),
      contentType: "table",
      content: null,
      contentHash: "",
      evidenceAtomIds: incidentAtoms.map(a => a.id),
      methodStatement: "",
      claimedObligationIds: slotMetadata.obligationIds,
      transformationsUsed: slotMetadata.allowedTransformations,
      agentId,
      error: `No incident records found within PSUR period`,
      errorDetails: {
        totalAtoms: incidentAtoms.length,
        filteredOutAtoms: outOfPeriodAtoms.length,
        periodStart,
        periodEnd,
        reason: `All ${incidentAtoms.length} incident records are outside the reporting period`,
      },
    };
  }

  const groupedCounts: Record<string, Record<string, number>> = {};
  const regionsSet = new Set<string>();
  const seriousnessSet = new Set<string>();

  for (const atom of inPeriodAtoms) {
    const data = (atom.normalizedData || atom.data) as Record<string, unknown>;
    const region = String(data.region || data.country || "Unknown");
    const severity = data.severity as string | undefined;
    const seriousness = severityToSeriousness(severity);
    
    regionsSet.add(region);
    seriousnessSet.add(seriousness);
    
    if (!groupedCounts[region]) groupedCounts[region] = {};
    groupedCounts[region][seriousness] = (groupedCounts[region][seriousness] || 0) + 1;
  }

  const regions = Array.from(regionsSet).sort();
  const seriousnessValues = ["serious_incident", "non_serious", "unknown"].filter(s => seriousnessSet.has(s));

  const tableRows: Array<Record<string, string | number>> = [];
  for (const region of regions) {
    const row: Record<string, string | number> = { region };
    let rowTotal = 0;
    for (const seriousness of seriousnessValues) {
      const count = groupedCounts[region]?.[seriousness] || 0;
      row[seriousness] = count;
      rowTotal += count;
    }
    row["total"] = rowTotal;
    tableRows.push(row);
  }

  const totalsRow: Record<string, string | number> = { region: "TOTAL" };
  let grandTotal = 0;
  for (const seriousness of seriousnessValues) {
    let seriousnessTotal = 0;
    for (const region of regions) {
      seriousnessTotal += groupedCounts[region]?.[seriousness] || 0;
    }
    totalsRow[seriousness] = seriousnessTotal;
    grandTotal += seriousnessTotal;
  }
  totalsRow["total"] = grandTotal;
  tableRows.push(totalsRow);

  const headers = ["region", ...seriousnessValues, "total"];

  const tableContent: TableContent = {
    headers,
    rows: tableRows,
    summary: `Cross-tabulation of ${inPeriodAtoms.length} incidents by region and seriousness for ${periodStart} to ${periodEnd}.`,
  };

  const methodStatement = `Filtered ${incidentAtoms.length} incident_record atoms by date within PSUR period (${periodStart} to ${periodEnd}). Grouped by region × seriousness (severity mapped: high/critical→serious_incident, low/medium→non_serious, else→unknown). ${outOfPeriodAtoms.length} excluded as out-of-period. No AI inference.`;

  return {
    success: true,
    slotId: originalSlotId,
    proposalId: generateProposalId(),
    contentType: "table",
    content: tableContent,
    contentHash: sha256Json(tableContent),
    evidenceAtomIds: inPeriodAtoms.map(a => a.id),
    methodStatement,
    claimedObligationIds: slotMetadata.obligationIds,
    transformationsUsed: slotMetadata.allowedTransformations,
    agentId,
  };
}

export function generateFSCASummaryTable(
  fscaAtoms: EvidenceAtom[],
  psurCase: PSURCase,
  slotMetadata: SlotMetadata,
  originalSlotId: string
): DeterministicGeneratorResult {
  const agentId = "DeterministicSlotGenerator:v1";
  
  const periodStart = dateOnly(psurCase.startPeriod);
  const periodEnd = dateOnly(psurCase.endPeriod);
  
  if (fscaAtoms.length === 0) {
    return {
      success: false,
      slotId: originalSlotId,
      proposalId: generateProposalId(),
      contentType: "table",
      content: null,
      contentHash: "",
      evidenceAtomIds: [],
      methodStatement: "",
      claimedObligationIds: slotMetadata.obligationIds,
      transformationsUsed: slotMetadata.allowedTransformations,
      agentId,
      error: "No fsca evidence atoms available",
      errorDetails: {
        totalAtoms: 0,
        filteredOutAtoms: 0,
        periodStart,
        periodEnd,
        reason: "No fsca evidence atoms have been ingested for this PSUR case",
      },
    };
  }

  const tableRows: Array<Record<string, string | number>> = [];
  const usedAtomIds: number[] = [];

  for (const atom of fscaAtoms) {
    const data = (atom.normalizedData || atom.data) as Record<string, unknown>;
    const fscaRef = String(data.fscaReference || data.referenceNumber || data.id || `FSCA-${atom.id}`);
    const actionType = String(data.actionType || data.type || "Unspecified");
    const status = String(data.status || "Open");
    const initiationDate = dateOnly(data.initiationDate || data.date || data.startDate);
    const affectedRegions = String(data.affectedRegions || data.regions || data.countries || "Global");
    
    tableRows.push({
      fscaReference: fscaRef,
      actionType,
      status,
      initiationDate: initiationDate || "N/A",
      affectedRegions,
    });
    usedAtomIds.push(atom.id);
  }

  const tableContent: TableContent = {
    headers: ["fscaReference", "actionType", "status", "initiationDate", "affectedRegions"],
    rows: tableRows,
    summary: `Summary of ${fscaAtoms.length} Field Safety Corrective Actions for reporting period ${periodStart} to ${periodEnd}.`,
  };

  const methodStatement = `Listed ${fscaAtoms.length} FSCA evidence atoms. Extracted reference, action type, status, initiation date, and affected regions. No interpolation or AI inference.`;

  return {
    success: true,
    slotId: originalSlotId,
    proposalId: generateProposalId(),
    contentType: "table",
    content: tableContent,
    contentHash: sha256Json(tableContent),
    evidenceAtomIds: usedAtomIds,
    methodStatement,
    claimedObligationIds: slotMetadata.obligationIds,
    transformationsUsed: slotMetadata.allowedTransformations,
    agentId,
  };
}

export function runDeterministicGenerator(
  slotId: string,
  evidenceAtoms: EvidenceAtom[],
  psurCase: PSURCase,
  templateId: string
): DeterministicGeneratorResult & { debug?: Record<string, unknown> } {
  const slotMetadata = getSlotMetadata(slotId, templateId);
  const agentId = "DeterministicSlotGenerator:v1";
  
  if (!slotMetadata) {
    return {
      success: false,
      slotId,
      proposalId: generateProposalId(),
      contentType: "table",
      content: null,
      contentHash: "",
      evidenceAtomIds: [],
      methodStatement: "",
      claimedObligationIds: [],
      transformationsUsed: [],
      agentId,
      error: `Slot definition not found for slot '${slotId}' in template '${templateId}'`,
    };
  }

  switch (slotId) {
    case "F.11.complaints_by_region_severity": {
      const complaintAtoms = evidenceAtoms.filter(
        a => a.evidenceType === "complaint_record"
      );
      return generateComplaintsByRegionSeverity(complaintAtoms, psurCase, slotMetadata);
    }
    case "PSUR.COMPLAINTS.SUMMARY_BY_REGION_SERIOUSNESS": {
      const complaintAtoms = evidenceAtoms.filter(
        a => a.evidenceType === "complaint_record"
      );
      return generateComplaintsByRegionSeriousness(complaintAtoms, psurCase, slotMetadata);
    }
    case "C.02.sales_table":
    case "sales.volume_table": {
      const salesAtoms = evidenceAtoms.filter(
        a => a.evidenceType === "sales_volume"
      );
      return generateSalesVolumeTable(salesAtoms, psurCase, slotMetadata, slotId);
    }
    case "D.01.incidents_summary":
    case "incidents.by_region_severity": {
      const incidentAtoms = evidenceAtoms.filter(
        a => a.evidenceType === "incident_record"
      );
      return generateIncidentsByRegionSeriousness(incidentAtoms, psurCase, slotMetadata, slotId);
    }
    case "H.01.fsca_summary":
    case "fsca.summary_table": {
      const fscaAtoms = evidenceAtoms.filter(
        a => a.evidenceType === "fsca"
      );
      return generateFSCASummaryTable(fscaAtoms, psurCase, slotMetadata, slotId);
    }
    default:
      return {
        success: false,
        slotId,
        proposalId: generateProposalId(),
        contentType: "table",
        content: null,
        contentHash: "",
        evidenceAtomIds: [],
        methodStatement: "",
        claimedObligationIds: slotMetadata.obligationIds,
        transformationsUsed: slotMetadata.allowedTransformations,
        agentId,
        error: `No deterministic generator implemented for slot: ${slotId}`,
      };
  }
}
