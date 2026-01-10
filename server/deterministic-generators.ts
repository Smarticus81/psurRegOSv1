import type { EvidenceAtom, PSURCase } from "@shared/schema";
import { FORMQAR_SLOTS, getSlotDefinitionsForTemplate } from "./queue-builder";
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
  const slots = getSlotDefinitionsForTemplate(templateId);
  const slotDef = slots.find(s => s.slot_id === slotId);
  if (!slotDef) return null;
  return {
    obligationIds: slotDef.obligation_ids,
    allowedTransformations: slotDef.allowed_transformations,
  };
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
