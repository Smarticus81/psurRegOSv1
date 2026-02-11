/**
 * Serious Incidents Table Agent
 * 
 * SOTA agent for generating serious incidents table with IMDRF breakdown.
 */

import { BaseTableAgent, TableInput, TableOutput, TableEvidenceAtom } from "./baseTableAgent";

export class SeriousIncidentsTableAgent extends BaseTableAgent {
  protected readonly tableType = "SERIOUS_INCIDENTS";
  protected readonly defaultColumns = ["IMDRF Code", "Event Term", "Count", "Regions", "Patient Outcome"];

  constructor() {
    super(
      "SeriousIncidentsTableAgent",
      "Serious Incidents Table Agent"
    );
  }

  protected filterRelevantAtoms(atoms: TableEvidenceAtom[]): TableEvidenceAtom[] {
    return atoms.filter(a => 
      ["serious_incident_record", "serious_incident_records_imdrf", "serious_incident_summary", "vigilance_report"].includes(a.evidenceType)
    );
  }

  protected async generateTable(input: TableInput, atoms: TableEvidenceAtom[]): Promise<TableOutput> {
    const columns = this.defaultColumns;
    const atomIds: string[] = [];

    // Group by IMDRF code
    const grouped: Record<string, {
      term: string;
      count: number;
      regions: Set<string>;
      outcomes: string[];
      atomIds: string[];
    }> = {};

    for (const atom of atoms) {
      const data = atom.normalizedData;
      const imdrfCode = String(this.getValue(data, "imdrf_code", "event_code", "problem_code") || "NOT_CODED");
      const term = String(this.getValue(data, "event_term", "description", "event_type") || "Unspecified");
      const region = String(this.getValue(data, "region", "country") || "Unknown");
      const outcome = String(this.getValue(data, "patient_outcome", "outcome", "patientOutcome") || "");

      if (!grouped[imdrfCode]) {
        grouped[imdrfCode] = {
          term: term.substring(0, 50),
          count: 0,
          regions: new Set(),
          outcomes: [],
          atomIds: [],
        };
      }

      grouped[imdrfCode].count++;
      grouped[imdrfCode].regions.add(region);
      if (outcome && !grouped[imdrfCode].outcomes.includes(outcome)) {
        grouped[imdrfCode].outcomes.push(outcome);
      }
      grouped[imdrfCode].atomIds.push(atom.atomId);
      atomIds.push(atom.atomId);
    }

    // Build rows sorted by count descending
    const rows: string[][] = [];
    const sortedCodes = Object.keys(grouped).sort((a, b) => 
      grouped[b].count - grouped[a].count
    );

    for (const code of sortedCodes) {
      const data = grouped[code];
      rows.push([
        code,
        this.truncate(data.term, 40),
        String(data.count),
        this.truncate(Array.from(data.regions).join(", "), 30),
        this.truncate(data.outcomes.slice(0, 3).join("; "), 40),
      ]);
    }

    // Add total row
    const totalIncidents = atoms.length;
    if (rows.length > 0) {
      rows.push([
        "**TOTAL**",
        "-",
        `**${totalIncidents}**`,
        "-",
        "-",
      ]);
    }

    // Generate markdown
    const markdownLines = [
      `| ${columns.join(" | ")} |`,
      `| ${columns.map(() => "---").join(" | ")} |`,
      ...rows.map(row => `| ${row.join(" | ")} |`),
    ];

    return {
      markdown: markdownLines.join("\n"),
      evidenceAtomIds: Array.from(new Set(atomIds)),
      rowCount: rows.length - 1,
      columns,
      dataSourceFooter: `Data Source: ${atomIds.length} serious incident records with IMDRF coding.`,
      docxTable: {
        headers: columns,
        rows,
        headerStyle: "regulatory",
        alternatingRows: true,
      },
    };
  }
}
