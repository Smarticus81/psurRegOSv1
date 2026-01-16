/**
 * Sales & Exposure Table Agent
 * 
 * SOTA agent for generating sales volume and exposure estimate tables.
 */

import { BaseTableAgent, TableInput, TableOutput, TableEvidenceAtom } from "./baseTableAgent";

export class SalesExposureTableAgent extends BaseTableAgent {
  protected readonly tableType = "SALES_EXPOSURE";
  protected readonly defaultColumns = ["Region", "Units Sold", "Market Share", "Usage Estimate", "Period"];

  constructor() {
    super(
      "SalesExposureTableAgent",
      "Sales & Exposure Table Agent"
    );
  }

  protected filterRelevantAtoms(atoms: TableEvidenceAtom[]): TableEvidenceAtom[] {
    return atoms.filter(a => 
      ["sales_volume", "sales_summary", "sales_by_region", "distribution_summary", "usage_estimate"].includes(a.evidenceType)
    );
  }

  protected async generateTable(input: TableInput, atoms: TableEvidenceAtom[]): Promise<TableOutput> {
    const columns = this.defaultColumns;
    const rows: string[][] = [];
    const atomIds: string[] = [];
    const seenRegions = new Set<string>();
    let totalUnits = 0;

    // Sort atoms by region for consistent ordering
    const sortedAtoms = [...atoms].sort((a, b) => {
      const regionA = String(this.getValue(a.normalizedData, "region", "country") || "ZZZ");
      const regionB = String(this.getValue(b.normalizedData, "region", "country") || "ZZZ");
      return regionA.localeCompare(regionB);
    });

    for (const atom of sortedAtoms) {
      const data = atom.normalizedData;
      const region = String(this.getValue(data, "region", "country") || "[Unknown]");
      const units = Number(this.getValue(data, "quantity", "units_sold", "count") || 0);
      
      // Avoid duplicate regions
      const regionKey = `${region}-${units}`;
      if (seenRegions.has(regionKey)) continue;
      seenRegions.add(regionKey);

      const share = this.getValue(data, "market_share") || "-";
      const usage = this.getValue(data, "usage_estimate", "estimated_users") || "-";
      const periodStart = this.getValue(data, "period_start", "periodStart") || "";
      const periodEnd = this.getValue(data, "period_end", "periodEnd") || "";
      const period = periodStart && periodEnd 
        ? `${this.formatDate(periodStart)} to ${this.formatDate(periodEnd)}`
        : this.getValue(data, "period") || input.context.periodStart + " - " + input.context.periodEnd;

      rows.push([
        region,
        this.formatNumber(units),
        String(share),
        String(usage),
        String(period),
      ]);

      atomIds.push(atom.atomId);
      totalUnits += units;
    }

    // Add total row
    if (rows.length > 0) {
      rows.push([
        "**TOTAL**",
        `**${this.formatNumber(totalUnits)}**`,
        "-",
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
      evidenceAtomIds: atomIds,
      rowCount: rows.length - 1, // Exclude total row
      columns,
      dataSourceFooter: `Data Source: Evidence Atoms [${atomIds.slice(0, 3).map(id => id.substring(0, 12)).join(", ")}${atomIds.length > 3 ? ` +${atomIds.length - 3} more` : ""}]`,
      docxTable: {
        headers: columns,
        rows,
        headerStyle: "corporate",
        alternatingRows: true,
      },
    };
  }
}
