/**
 * Complaints Table Agent
 * 
 * SOTA agent for generating complaints by region/severity tables with IMDRF coding.
 */

import { BaseTableAgent, TableInput, TableOutput, TableEvidenceAtom } from "./baseTableAgent";

export class ComplaintsTableAgent extends BaseTableAgent {
  protected readonly tableType = "COMPLAINTS";
  protected readonly defaultColumns = ["Region", "Severity", "Count", "Rate per 1,000", "Top Issue"];

  constructor() {
    super(
      "ComplaintsTableAgent",
      "Complaints Table Agent"
    );
  }

  protected filterRelevantAtoms(atoms: TableEvidenceAtom[]): TableEvidenceAtom[] {
    return atoms.filter(a => 
      ["complaint_record", "complaint_summary", "complaints_by_region", "complaints_by_type"].includes(a.evidenceType)
    );
  }

  protected async generateTable(input: TableInput, atoms: TableEvidenceAtom[]): Promise<TableOutput> {
    const columns = this.defaultColumns;
    const atomIds: string[] = [];

    // Calculate total units for rate calculation
    const salesAtoms = input.atoms?.filter(a => 
      a.evidenceType.includes("sales")
    ) || [];
    const totalUnits = salesAtoms.reduce((sum, a) => {
      return sum + Number(this.getValue(a.normalizedData, "quantity", "units_sold") || 0);
    }, 0);

    // Group complaints by region and severity
    const grouped: Record<string, Record<string, { count: number; issues: string[] }>> = {};
    
    for (const atom of atoms) {
      const data = atom.normalizedData;
      const region = String(this.getValue(data, "region", "country") || "Global");
      const severity = String(this.getValue(data, "severity", "seriousness") || "Unknown");
      const issue = String(this.getValue(data, "description", "complaint_type", "issue") || "");

      if (!grouped[region]) grouped[region] = {};
      if (!grouped[region][severity]) grouped[region][severity] = { count: 0, issues: [] };
      
      grouped[region][severity].count++;
      if (issue && !grouped[region][severity].issues.includes(issue)) {
        grouped[region][severity].issues.push(issue);
      }

      atomIds.push(atom.atomId);
    }

    // Build rows
    const rows: string[][] = [];
    const regions = Object.keys(grouped).sort();
    
    for (const region of regions) {
      const severities = Object.keys(grouped[region]).sort((a, b) => {
        const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL", "Unknown"];
        return order.indexOf(a) - order.indexOf(b);
      });

      for (const severity of severities) {
        const data = grouped[region][severity];
        const rate = totalUnits > 0 
          ? ((data.count / totalUnits) * 1000).toFixed(2)
          : "N/A";
        const topIssue = this.truncate(data.issues[0] || "-", 40);

        rows.push([
          region,
          severity,
          String(data.count),
          rate,
          topIssue,
        ]);
      }
    }

    // Add total row
    const totalComplaints = atoms.length;
    const totalRate = totalUnits > 0 
      ? ((totalComplaints / totalUnits) * 1000).toFixed(2)
      : "N/A";
    
    if (rows.length > 0) {
      rows.push([
        "**TOTAL**",
        "-",
        `**${totalComplaints}**`,
        `**${totalRate}**`,
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
      dataSourceFooter: `Data Source: ${atomIds.length} complaint records. Denominator: ${totalUnits.toLocaleString()} units.`,
      docxTable: {
        headers: columns,
        rows,
        headerStyle: "corporate",
        alternatingRows: true,
      },
    };
  }
}
