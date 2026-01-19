/**
 * SOTA Distribution Pie Chart Agent
 * 
 * Generates distribution pie/donut charts using pure SVG.
 * No native dependencies - works on all platforms.
 */

import { BaseChartAgent, ChartInput, CHART_THEMES, DocumentStyle } from "./baseChartAgent";
import { ChartConfig, DataSeries } from "./svgChartGenerator";

export class DistributionPieChartAgent extends BaseChartAgent {
  protected readonly chartType = "DISTRIBUTION_PIE";

  constructor() {
    super(
      "DistributionPieChartAgent",
      "SOTA Distribution Pie Chart Agent"
    );
  }

  protected async generateChartConfig(
    input: ChartInput,
    theme: typeof CHART_THEMES[DocumentStyle]
  ): Promise<Omit<ChartConfig, "width" | "height" | "style">> {
    // Determine distribution type based on evidence
    const bySeverity: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};

    const severityColors: Record<string, string> = {
      "Critical": "#dc2626",
      "High": "#ea580c",
      "Medium": "#f59e0b",
      "Low": "#22c55e",
      "Negligible": "#6b7280",
      "Unknown": "#9ca3af",
    };

    for (const atom of input.atoms) {
      const data = atom.normalizedData;
      
      // Severity distribution
      const severity = String(this.getValue(data, "severity", "severity_level", "risk_level", "seriousness") || "Unknown");
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;
      
      // Status distribution
      const status = String(this.getValue(data, "status", "outcome", "resolution_status") || "");
      if (status) byStatus[status] = (byStatus[status] || 0) + 1;
      
      // Type distribution
      byType[atom.evidenceType] = (byType[atom.evidenceType] || 0) + 1;
    }

    // Use severity if we have meaningful data, otherwise fall back to type
    let distributionData: Record<string, number>;
    let chartTitle: string;
    let useColors: boolean;

    if (Object.keys(bySeverity).filter(k => k !== "Unknown").length >= 2) {
      distributionData = bySeverity;
      chartTitle = input.chartTitle || "Event Severity Distribution";
      useColors = true;
    } else if (Object.keys(byStatus).length >= 2) {
      distributionData = byStatus;
      chartTitle = input.chartTitle || "Event Status Distribution";
      useColors = false;
    } else {
      distributionData = byType;
      chartTitle = input.chartTitle || "Evidence Type Distribution";
      useColors = false;
    }

    const sortedEntries = Object.entries(distributionData)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const series: DataSeries[] = [
      {
        name: "Distribution",
        data: sortedEntries.map(([label, value], i) => ({
          label: this.formatLabel(label),
          value,
          color: useColors 
            ? (severityColors[label] || theme.primaryColors[i % theme.primaryColors.length])
            : theme.primaryColors[i % theme.primaryColors.length],
        })),
      },
    ];

    return {
      type: "donut",
      title: chartTitle,
      series,
      showLegend: true,
    };
  }

  private formatLabel(label: string): string {
    return label
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }
}
