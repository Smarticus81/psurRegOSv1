import type { EvidenceAtom, SlotProposal, PSURCase } from "@shared/schema";

export interface DeterministicGeneratorResult {
  success: boolean;
  slotId: string;
  contentType: "table" | "narrative" | "object";
  content: unknown;
  evidenceAtomIds: number[];
  methodStatement: string;
  claimedObligationIds: string[];
  transformationsUsed: string[];
  error?: string;
}

export interface TableContent {
  headers: string[];
  rows: Array<Record<string, string | number>>;
  summary?: string;
}

export const DETERMINISTIC_SUPPORTED_SLOTS = new Set([
  "F.11.complaints_by_region_severity",
]);

export function isDeterministicSupported(slotId: string): boolean {
  return DETERMINISTIC_SUPPORTED_SLOTS.has(slotId);
}

export function generateComplaintsByRegionSeverity(
  complaintAtoms: EvidenceAtom[],
  psurCase: PSURCase
): DeterministicGeneratorResult {
  const slotId = "F.11.complaints_by_region_severity";
  
  if (complaintAtoms.length === 0) {
    return {
      success: false,
      slotId,
      contentType: "table",
      content: null,
      evidenceAtomIds: [],
      methodStatement: "",
      claimedObligationIds: [],
      transformationsUsed: [],
      error: "No complaint_record evidence atoms available for the PSUR period",
    };
  }

  const periodStart = psurCase.startPeriod;
  const periodEnd = psurCase.endPeriod;

  const inPeriodAtoms = complaintAtoms.filter(atom => {
    const atomData = atom.data as Record<string, unknown>;
    const complaintDate = atomData.complaintDate as string | undefined;
    if (!complaintDate) return false;
    const date = new Date(complaintDate);
    return date >= periodStart && date <= periodEnd;
  });

  if (inPeriodAtoms.length === 0) {
    return {
      success: false,
      slotId,
      contentType: "table",
      content: null,
      evidenceAtomIds: complaintAtoms.map(a => a.id),
      methodStatement: "",
      claimedObligationIds: [],
      transformationsUsed: [],
      error: `No complaint records found within the PSUR period (${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]})`,
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
    summary: `Cross-tabulation of ${inPeriodAtoms.length} complaints by region and severity for the reporting period ${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}.`,
  };

  const methodStatement = `Deterministic aggregation of ${inPeriodAtoms.length} complaint_record evidence atoms. ` +
    `Each record was filtered by complaintDate within the PSUR period [${periodStart.toISOString().split('T')[0]}, ${periodEnd.toISOString().split('T')[0]}]. ` +
    `Records were grouped by (region OR country field) × (severity field). ` +
    `Counts represent unique complaint records per cell. ` +
    `No interpolation, estimation, or AI inference was applied.`;

  return {
    success: true,
    slotId,
    contentType: "table",
    content: tableContent,
    evidenceAtomIds: inPeriodAtoms.map(a => a.id),
    methodStatement,
    claimedObligationIds: ["FORMQAR_F_COMPLAINTS"],
    transformationsUsed: ["tabulate", "aggregate"],
  };
}

export function runDeterministicGenerator(
  slotId: string,
  evidenceAtoms: EvidenceAtom[],
  psurCase: PSURCase
): DeterministicGeneratorResult {
  switch (slotId) {
    case "F.11.complaints_by_region_severity": {
      const complaintAtoms = evidenceAtoms.filter(
        a => a.evidenceType === "complaint_record"
      );
      return generateComplaintsByRegionSeverity(complaintAtoms, psurCase);
    }
    default:
      return {
        success: false,
        slotId,
        contentType: "table",
        content: null,
        evidenceAtomIds: [],
        methodStatement: "",
        claimedObligationIds: [],
        transformationsUsed: [],
        error: `No deterministic generator available for slot: ${slotId}`,
      };
  }
}
