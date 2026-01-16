/**
 * FSCA Table Agent
 * 
 * SOTA agent for generating Field Safety Corrective Action tables.
 */

import { BaseTableAgent, TableInput, TableOutput, TableEvidenceAtom } from "./baseTableAgent";

export class FSCATableAgent extends BaseTableAgent {
  protected readonly tableType = "FSCA";
  protected readonly defaultColumns = ["FSCA ID", "Reason", "Date Opened", "Date Closed", "Regions", "Status"];

  constructor() {
    super(
      "FSCATableAgent",
      "FSCA Table Agent"
    );
  }

  protected filterRelevantAtoms(atoms: TableEvidenceAtom[]): TableEvidenceAtom[] {
    return atoms.filter(a => 
      ["fsca_record", "fsca_summary", "recall_record", "field_action_record"].includes(a.evidenceType)
    );
  }

  protected async generateTable(input: TableInput, atoms: TableEvidenceAtom[]): Promise<TableOutput> {
    const columns = this.defaultColumns;
    const atomIds: string[] = [];
    const rows: string[][] = [];

    // Sort by date opened, most recent first
    const sortedAtoms = [...atoms].sort((a, b) => {
      const dateA = new Date(String(this.getValue(a.normalizedData, "date_opened", "initiation_date", "initiationDate") || ""));
      const dateB = new Date(String(this.getValue(b.normalizedData, "date_opened", "initiation_date", "initiationDate") || ""));
      return dateB.getTime() - dateA.getTime();
    });

    for (const atom of sortedAtoms) {
      const data = atom.normalizedData;
      
      const fscaId = String(this.getValue(data, "fsca_id", "fscaId", "recall_id", "reference") || atom.atomId.substring(0, 15));
      const reason = String(this.getValue(data, "reason", "description", "issue") || "-");
      const dateOpened = this.formatDate(this.getValue(data, "date_opened", "initiation_date", "initiationDate", "open_date"));
      const dateClosed = this.formatDate(this.getValue(data, "date_closed", "completion_date", "close_date"));
      const regions = String(this.getValue(data, "regions", "countries", "affected_regions", "region") || "-");
      const status = String(this.getValue(data, "status", "state") || (dateClosed !== "-" ? "Closed" : "Open"));

      rows.push([
        fscaId,
        this.truncate(reason, 40),
        dateOpened,
        dateClosed,
        this.truncate(regions, 25),
        status,
      ]);

      atomIds.push(atom.atomId);
    }

    // Add summary row
    const openCount = rows.filter(r => r[5].toLowerCase().includes("open")).length;
    const closedCount = rows.filter(r => r[5].toLowerCase().includes("closed")).length;
    
    if (rows.length > 0) {
      rows.push([
        `**TOTAL: ${rows.length}**`,
        "-",
        "-",
        "-",
        "-",
        `Open: ${openCount}, Closed: ${closedCount}`,
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
      dataSourceFooter: `Data Source: ${atomIds.length} FSCA/recall records.`,
      docxTable: {
        headers: columns,
        rows,
        headerStyle: "regulatory",
        alternatingRows: true,
      },
    };
  }
}
