/**
 * Literature Table Agent
 * 
 * SOTA agent for generating literature search results tables.
 */

import { BaseTableAgent, TableInput, TableOutput, TableEvidenceAtom } from "./baseTableAgent";

export class LiteratureTableAgent extends BaseTableAgent {
  protected readonly tableType = "LITERATURE";
  protected readonly defaultColumns = ["Reference", "Title", "Authors", "Journal/Year", "Relevance", "Safety Signals"];

  constructor() {
    super(
      "LiteratureTableAgent",
      "Literature Table Agent"
    );
  }

  protected filterRelevantAtoms(atoms: TableEvidenceAtom[]): TableEvidenceAtom[] {
    return atoms.filter(a => 
      ["literature_result", "literature_review_summary", "publication_record"].includes(a.evidenceType)
    );
  }

  protected async generateTable(input: TableInput, atoms: TableEvidenceAtom[]): Promise<TableOutput> {
    const columns = this.defaultColumns;
    const atomIds: string[] = [];
    const rows: string[][] = [];

    // Sort by relevance (if available) or publication date
    const sortedAtoms = [...atoms].sort((a, b) => {
      const relA = Number(this.getValue(a.normalizedData, "relevance_score", "relevance") || 0);
      const relB = Number(this.getValue(b.normalizedData, "relevance_score", "relevance") || 0);
      return relB - relA;
    });

    for (const atom of sortedAtoms) {
      const data = atom.normalizedData;
      
      const refId = String(this.getValue(data, "reference_id", "referenceId", "pmid", "doi") || atom.atomId.substring(0, 12));
      const title = String(this.getValue(data, "title", "article_title") || "-");
      const authors = String(this.getValue(data, "authors", "author", "first_author") || "-");
      const journal = String(this.getValue(data, "journal", "publication", "source") || "-");
      const year = String(this.getValue(data, "publication_date", "year", "date") || "").substring(0, 4);
      const journalYear = year ? `${this.truncate(journal, 20)}/${year}` : this.truncate(journal, 25);
      const relevance = String(this.getValue(data, "relevance", "relevance_score", "applicable") || "-");
      const signals = String(this.getValue(data, "safety_signals", "signals", "findings") || "None identified");

      rows.push([
        refId,
        this.truncate(title, 40),
        this.truncate(authors, 25),
        journalYear,
        relevance,
        this.truncate(signals, 30),
      ]);

      atomIds.push(atom.atomId);
    }

    // Add summary row
    const withSignals = rows.filter(r => 
      r[5] !== "None identified" && r[5] !== "-" && r[5].toLowerCase() !== "none"
    ).length;
    
    if (rows.length > 0) {
      rows.push([
        `**TOTAL: ${rows.length}**`,
        "-",
        "-",
        "-",
        "-",
        `${withSignals} with signals`,
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
      dataSourceFooter: `Data Source: ${atomIds.length} literature records from systematic search.`,
      docxTable: {
        headers: columns,
        rows,
        headerStyle: "corporate",
        alternatingRows: true,
      },
    };
  }
}
