/**
 * SOTA Complaint Bar Chart Agent
 * 
 * Generates complaint distribution bar charts using pure SVG.
 * No native dependencies - works on all platforms.
 */

import { BaseChartAgent, ChartInput, CHART_THEMES, DocumentStyle } from "./baseChartAgent";
import { ChartConfig, DataSeries } from "./svgChartGenerator";
import { getCanonicalMetrics } from "../../../services/canonicalMetricsService";

export class ComplaintBarChartAgent extends BaseChartAgent {
  protected readonly chartType = "COMPLAINT_BAR";

  constructor() {
    super(
      "ComplaintBarChartAgent",
      "SOTA Complaint Bar Chart Agent"
    );
  }

  protected async generateChartConfig(
    input: ChartInput,
    theme: typeof CHART_THEMES[DocumentStyle]
  ): Promise<Omit<ChartConfig, "width" | "height" | "style">> {
    // Use CANONICAL METRICS for the overall total so chart subtitle matches narratives
    const metrics = getCanonicalMetrics(
      0,
      input.atoms.map(a => ({
        atomId: a.atomId,
        evidenceType: a.evidenceType,
        normalizedData: a.normalizedData as Record<string, unknown>,
      })),
      "",
      ""
    );
    const canonicalTotal = metrics.complaints.totalCount.value;

    // Group complaints by category/type (still use atoms for breakdown)
    const byCategory: Record<string, number> = {};

    for (const atom of input.atoms) {
      if (atom.evidenceType === "complaint_record" || atom.evidenceType === "customer_complaint") {
        const category = String(this.getValue(atom.normalizedData, "complaint_type", "category", "type", "complaint_category") || "Uncategorized");
        byCategory[category] = (byCategory[category] || 0) + 1;
      }
    }

    // Sort by count and take top categories
    const sortedCategories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const series: DataSeries[] = [
      {
        name: "Complaints",
        data: sortedCategories.map(([label, value], i) => ({
          label: this.formatCategoryLabel(label),
          value,
          color: theme.primaryColors[i % theme.primaryColors.length],
        })),
      },
    ];

    return {
      type: "bar",
      title: input.chartTitle || "Complaint Distribution by Category",
      subtitle: `Total Complaints: ${canonicalTotal}`,
      series,
      showLegend: false,
      showGrid: true,
      showValues: true,
      yAxisLabel: "Number of Complaints",
      xAxisLabel: "Category",
    };
  }

  private formatCategoryLabel(label: string): string {
    return label
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ")
      .substring(0, 15);
  }
}
