/**
 * Trend Analysis Table Agent
 * 
 * SOTA agent for generating Article 88 trend analysis tables with signal detection.
 */

import { BaseTableAgent, TableInput, TableOutput, TableEvidenceAtom } from "./baseTableAgent";

export class TrendAnalysisTableAgent extends BaseTableAgent {
  protected readonly tableType = "TREND_ANALYSIS";
  protected readonly defaultColumns = ["Metric", "Baseline Rate", "Current Rate", "Threshold", "Signal?", "Conclusion"];

  constructor() {
    super(
      "TrendAnalysisTableAgent",
      "Trend Analysis Table Agent"
    );
  }

  protected filterRelevantAtoms(atoms: TableEvidenceAtom[]): TableEvidenceAtom[] {
    return atoms.filter(a => 
      ["trend_analysis", "signal_log", "trend_report"].includes(a.evidenceType)
    );
  }

  protected async generateTable(input: TableInput, atoms: TableEvidenceAtom[]): Promise<TableOutput> {
    const columns = this.defaultColumns;
    const atomIds: string[] = [];
    const rows: string[][] = [];

    // If we have pre-computed trend data, use it
    if (atoms.length > 0) {
      for (const atom of atoms) {
        const data = atom.normalizedData;
        const metric = String(this.getValue(data, "metric", "trend_metric", "indicator") || "Complaint Rate");
        const baseline = this.getValue(data, "baseline_rate", "baseline", "previous_rate");
        const current = this.getValue(data, "current_rate", "current", "rate");
        const threshold = this.getValue(data, "threshold", "signal_threshold");
        const signal = this.getValue(data, "signal_detected", "significant", "signal");
        const conclusion = String(this.getValue(data, "conclusion", "assessment", "determination") || "");

        rows.push([
          metric,
          baseline !== null ? this.formatRate(baseline) : "N/A",
          current !== null ? this.formatRate(current) : "N/A",
          threshold !== null ? this.formatRate(threshold) : "2x baseline",
          signal === true ? "**YES**" : "No",
          this.truncate(conclusion, 40) || (signal === true ? "Requires investigation" : "Within expected range"),
        ]);

        atomIds.push(atom.atomId);
      }
    } else {
      // Calculate trends from raw complaint and sales data
      const complaintAtoms = input.atoms.filter(a => 
        a.evidenceType.includes("complaint")
      );
      const salesAtoms = input.atoms.filter(a => 
        a.evidenceType.includes("sales")
      );

      const totalComplaints = complaintAtoms.length;
      const totalUnits = salesAtoms.reduce((sum, a) => {
        return sum + Number(this.getValue(a.normalizedData, "quantity", "units_sold") || 0);
      }, 0);

      if (totalUnits > 0) {
        const currentRate = (totalComplaints / totalUnits) * 1000;
        const threshold = 2.0; // Default 2x threshold
        const signal = currentRate > threshold;

        rows.push([
          "Complaint Rate (per 1,000)",
          "1.0", // Default baseline
          currentRate.toFixed(2),
          String(threshold),
          signal ? "**YES**" : "No",
          signal ? "Exceeds threshold - requires investigation" : "Within expected range",
        ]);

        atomIds.push(...complaintAtoms.slice(0, 5).map(a => a.atomId));
        atomIds.push(...salesAtoms.slice(0, 5).map(a => a.atomId));
      }
    }

    // Generate markdown
    const markdownLines = [
      `| ${columns.join(" | ")} |`,
      `| ${columns.map(() => "---").join(" | ")} |`,
      ...rows.map(row => `| ${row.join(" | ")} |`),
    ];

    // Add note if signals detected
    const signalDetected = rows.some(r => r[4].includes("YES"));
    if (signalDetected) {
      markdownLines.push("");
      markdownLines.push("**Note:** Signals detected require investigation per Article 88 requirements.");
    }

    return {
      markdown: markdownLines.join("\n"),
      evidenceAtomIds: Array.from(new Set(atomIds)),
      rowCount: rows.length,
      columns,
      dataSourceFooter: `Data Source: Trend analysis based on ${atomIds.length} evidence records.`,
      docxTable: {
        headers: columns,
        rows,
        headerStyle: "regulatory",
        alternatingRows: false,
      },
    };
  }

  private formatRate(value: unknown): string {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return num.toFixed(2);
  }
}
