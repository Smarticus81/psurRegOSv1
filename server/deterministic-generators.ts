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
]);

export function isDeterministicSupported(slotId: string): boolean {
  return DETERMINISTIC_SUPPORTED_SLOTS.has(slotId);
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

export function runDeterministicGenerator(
  slotId: string,
  evidenceAtoms: EvidenceAtom[],
  psurCase: PSURCase,
  templateId: string
): DeterministicGeneratorResult {
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
