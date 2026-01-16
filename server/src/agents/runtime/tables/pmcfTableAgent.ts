/**
 * PMCF Table Agent
 * 
 * SOTA agent for generating Post-Market Clinical Follow-up tables.
 */

import { BaseTableAgent, TableInput, TableOutput, TableEvidenceAtom } from "./baseTableAgent";

export class PMCFTableAgent extends BaseTableAgent {
  protected readonly tableType = "PMCF";
  protected readonly defaultColumns = ["Study ID", "Study Type", "Status", "Patients", "Key Findings", "Conclusions"];

  constructor() {
    super(
      "PMCFTableAgent",
      "PMCF Table Agent"
    );
  }

  protected filterRelevantAtoms(atoms: TableEvidenceAtom[]): TableEvidenceAtom[] {
    return atoms.filter(a => 
      ["pmcf_result", "pmcf_summary", "clinical_study_record", "pmcf_study_record"].includes(a.evidenceType)
    );
  }

  protected async generateTable(input: TableInput, atoms: TableEvidenceAtom[]): Promise<TableOutput> {
    const columns = this.defaultColumns;
    const atomIds: string[] = [];
    const rows: string[][] = [];

    for (const atom of atoms) {
      const data = atom.normalizedData;
      
      const studyId = String(this.getValue(data, "study_id", "studyId", "protocol_id", "pmcf_id") || atom.atomId.substring(0, 15));
      const studyType = String(this.getValue(data, "study_type", "studyType", "type", "design") || "-");
      const status = String(this.getValue(data, "status", "study_status", "state") || "-");
      const patients = this.getValue(data, "patient_count", "patientCount", "subjects", "n");
      const findings = String(this.getValue(data, "findings", "key_findings", "results") || "-");
      const conclusions = String(this.getValue(data, "conclusions", "conclusion", "assessment") || "-");

      rows.push([
        studyId,
        this.truncate(studyType, 25),
        status,
        patients !== null ? this.formatNumber(patients) : "-",
        this.truncate(findings, 35),
        this.truncate(conclusions, 35),
      ]);

      atomIds.push(atom.atomId);
    }

    // Add summary row
    const totalPatients = atoms.reduce((sum, a) => {
      const n = Number(this.getValue(a.normalizedData, "patient_count", "patientCount", "subjects", "n") || 0);
      return sum + n;
    }, 0);
    
    const completedStudies = rows.filter(r => 
      r[2].toLowerCase().includes("completed") || 
      r[2].toLowerCase().includes("closed")
    ).length;
    
    if (rows.length > 0) {
      rows.push([
        `**TOTAL: ${rows.length} studies**`,
        "-",
        `${completedStudies} completed`,
        `**${this.formatNumber(totalPatients)}**`,
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
      dataSourceFooter: `Data Source: ${atomIds.length} PMCF study records. Total patient exposure: ${this.formatNumber(totalPatients)}.`,
      docxTable: {
        headers: columns,
        rows,
        headerStyle: "corporate",
        alternatingRows: true,
      },
    };
  }
}
