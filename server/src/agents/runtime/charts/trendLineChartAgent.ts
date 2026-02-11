/**
 * SOTA Trend Line Chart Agent
 * 
 * Generates Article 88 trend line charts with threshold visualization.
 * Uses pure SVG generation - no native dependencies.
 */

import { BaseChartAgent, ChartInput, CHART_THEMES, DocumentStyle } from "./baseChartAgent";
import { ChartConfig, DataSeries } from "./svgChartGenerator";
import { getCanonicalMetrics } from "../../../services/canonicalMetricsService";

export class TrendLineChartAgent extends BaseChartAgent {
  protected readonly chartType = "TREND_LINE";

  constructor() {
    super(
      "TrendLineChartAgent",
      "SOTA Trend Line Chart Agent"
    );
  }

  protected async generateChartConfig(
    input: ChartInput,
    theme: typeof CHART_THEMES[DocumentStyle]
  ): Promise<Omit<ChartConfig, "width" | "height" | "style">> {
    // Extract trend data from atoms for period-level breakdown
    const trendAtoms = input.atoms.filter(a => 
      ["trend_analysis", "complaint_record", "sales_volume"].includes(a.evidenceType)
    );

    // Group complaints by month/period (for the line chart data points)
    const complaintsByPeriod: Record<string, number> = {};
    const salesByPeriod: Record<string, number> = {};

    for (const atom of trendAtoms) {
      const data = atom.normalizedData;
      
      if (atom.evidenceType === "complaint_record") {
        const date = String(this.getValue(data, "complaint_date", "complaintDate", "date") || "");
        const period = this.extractPeriod(date);
        if (period) {
          complaintsByPeriod[period] = (complaintsByPeriod[period] || 0) + 1;
        }
      } else if (atom.evidenceType === "sales_volume") {
        const date = String(this.getValue(data, "period_start", "periodStart", "date") || "");
        const period = this.extractPeriod(date);
        const qty = Number(this.getValue(data, "quantity", "units_sold") || 0);
        if (period) {
          salesByPeriod[period] = (salesByPeriod[period] || 0) + qty;
        }
      }
    }

    // Calculate per-period rates for the line chart
    const periodSet = new Set([...Object.keys(complaintsByPeriod), ...Object.keys(salesByPeriod)]);
    const periods = Array.from(periodSet).sort();
    
    const rateData: { label: string; value: number }[] = [];

    for (const period of periods) {
      const complaints = complaintsByPeriod[period] || 0;
      const sales = salesByPeriod[period] || 1;
      const rate = (complaints / sales) * 1000;
      rateData.push({ label: period, value: rate });
    }

    // Use CANONICAL METRICS for the overall threshold calculation
    // This ensures the threshold line is consistent with narrative sections
    const metrics = getCanonicalMetrics(
      0, // Charts don't have psurCaseId in their input; cache will be warm from prior phases
      input.atoms.map(a => ({
        atomId: a.atomId,
        evidenceType: a.evidenceType,
        normalizedData: a.normalizedData as Record<string, unknown>,
      })),
      "", // Period info not available in chart input; metrics cached from phase 1
      ""
    );

    const canonicalRate = metrics.complaints.ratePerThousand?.value ?? 0;
    // Threshold: 2x the canonical overall complaint rate, or 2x average if canonical unavailable
    const avgRate = rateData.length > 0 
      ? rateData.reduce((a, b) => a + b.value, 0) / rateData.length 
      : 1;
    const threshold = canonicalRate > 0 ? canonicalRate * 2 : avgRate * 2;

    const series: DataSeries[] = [
      {
        name: "Complaint Rate",
        data: rateData,
        color: theme.primaryColors[0],
      },
    ];

    return {
      type: "line",
      title: input.chartTitle || "Complaint Rate Trend Analysis",
      subtitle: `Per 1,000 units sold (Overall: ${canonicalRate > 0 ? canonicalRate.toFixed(2) : avgRate.toFixed(2)})`,
      series,
      showLegend: true,
      showGrid: true,
      showValues: false,
      yAxisLabel: "Rate (per 1,000)",
      xAxisLabel: "Period",
      thresholdLine: {
        value: threshold,
        label: `Threshold (${threshold.toFixed(2)})`,
        color: "#ef4444",
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADDITIONAL CHART AGENTS
// ═══════════════════════════════════════════════════════════════════════════════

export class ComplaintDistributionChartAgent extends BaseChartAgent {
  protected readonly chartType = "COMPLAINT_DISTRIBUTION";

  constructor() {
    super(
      "ComplaintDistributionChartAgent",
      "SOTA Complaint Distribution Chart Agent"
    );
  }

  protected async generateChartConfig(
    input: ChartInput,
    theme: typeof CHART_THEMES[DocumentStyle]
  ): Promise<Omit<ChartConfig, "width" | "height" | "style">> {
    // Group complaints by category/type
    const byCategory: Record<string, number> = {};

    for (const atom of input.atoms) {
      if (atom.evidenceType === "complaint_record") {
        const category = String(this.getValue(atom.normalizedData, "complaint_type", "category", "type") || "Other");
        byCategory[category] = (byCategory[category] || 0) + 1;
      }
    }

    const sortedCategories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const series: DataSeries[] = [
      {
        name: "Complaints",
        data: sortedCategories.map(([label, value]) => ({ label, value })),
      },
    ];

    return {
      type: "bar",
      title: input.chartTitle || "Complaint Distribution by Category",
      series,
      showLegend: false,
      showGrid: true,
      showValues: true,
      yAxisLabel: "Count",
      xAxisLabel: "Category",
    };
  }
}

export class SeverityPieChartAgent extends BaseChartAgent {
  protected readonly chartType = "SEVERITY_PIE";

  constructor() {
    super(
      "SeverityPieChartAgent",
      "SOTA Severity Distribution Chart Agent"
    );
  }

  protected async generateChartConfig(
    input: ChartInput,
    theme: typeof CHART_THEMES[DocumentStyle]
  ): Promise<Omit<ChartConfig, "width" | "height" | "style">> {
    // Group by severity level
    const bySeverity: Record<string, number> = {};
    const severityColors: Record<string, string> = {
      "Critical": "#dc2626",
      "High": "#ea580c",
      "Medium": "#f59e0b",
      "Low": "#22c55e",
      "Negligible": "#6b7280",
    };

    for (const atom of input.atoms) {
      const severity = String(this.getValue(atom.normalizedData, "severity", "severity_level", "risk_level") || "Unknown");
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    }

    const series: DataSeries[] = [
      {
        name: "Severity",
        data: Object.entries(bySeverity).map(([label, value]) => ({
          label,
          value,
          color: severityColors[label] || theme.primaryColors[Object.keys(bySeverity).indexOf(label) % theme.primaryColors.length],
        })),
      },
    ];

    return {
      type: "donut",
      title: input.chartTitle || "Event Severity Distribution",
      series,
      showLegend: true,
    };
  }
}

export class TimelineAreaChartAgent extends BaseChartAgent {
  protected readonly chartType = "TIMELINE_AREA";

  constructor() {
    super(
      "TimelineAreaChartAgent",
      "SOTA Timeline Area Chart Agent"
    );
  }

  protected async generateChartConfig(
    input: ChartInput,
    theme: typeof CHART_THEMES[DocumentStyle]
  ): Promise<Omit<ChartConfig, "width" | "height" | "style">> {
    // Group events by period and type
    const eventsByPeriodAndType: Record<string, Record<string, number>> = {};
    const eventTypes = new Set<string>();

    for (const atom of input.atoms) {
      const date = String(this.getValue(atom.normalizedData, "date", "event_date", "reported_date") || "");
      const period = this.extractPeriod(date);
      const type = atom.evidenceType;
      
      if (period) {
        eventTypes.add(type);
        if (!eventsByPeriodAndType[period]) {
          eventsByPeriodAndType[period] = {};
        }
        eventsByPeriodAndType[period][type] = (eventsByPeriodAndType[period][type] || 0) + 1;
      }
    }

    const periods = Object.keys(eventsByPeriodAndType).sort();
    const types = Array.from(eventTypes);

    const series: DataSeries[] = types.map((type, i) => ({
      name: type.replace(/_/g, " "),
      data: periods.map(period => ({
        label: period,
        value: eventsByPeriodAndType[period]?.[type] || 0,
      })),
      color: theme.primaryColors[i % theme.primaryColors.length],
    }));

    return {
      type: "area",
      title: input.chartTitle || "Event Timeline",
      series,
      showLegend: true,
      showGrid: true,
      yAxisLabel: "Count",
      xAxisLabel: "Period",
    };
  }
}
