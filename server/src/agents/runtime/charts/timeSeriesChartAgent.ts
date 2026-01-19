/**
 * SOTA Time Series Chart Agent
 * 
 * Generates time series area charts using pure SVG.
 * No native dependencies - works on all platforms.
 */

import { BaseChartAgent, ChartInput, CHART_THEMES, DocumentStyle } from "./baseChartAgent";
import { ChartConfig, DataSeries } from "./svgChartGenerator";

export class TimeSeriesChartAgent extends BaseChartAgent {
  protected readonly chartType = "TIME_SERIES";

  constructor() {
    super(
      "TimeSeriesChartAgent",
      "SOTA Time Series Chart Agent"
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
      const data = atom.normalizedData;
      const dateStr = String(this.getValue(data, "date", "event_date", "reported_date", "complaint_date", "occurrence_date") || "");
      const period = this.extractPeriod(dateStr);
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

    // Limit to top 5 types by total count
    const typeTotals = types.map(type => ({
      type,
      total: periods.reduce((sum, p) => sum + (eventsByPeriodAndType[p]?.[type] || 0), 0)
    }));
    typeTotals.sort((a, b) => b.total - a.total);
    const topTypes = typeTotals.slice(0, 5).map(t => t.type);

    const series: DataSeries[] = topTypes.map((type, i) => ({
      name: this.formatTypeName(type),
      data: periods.map(period => ({
        label: period,
        value: eventsByPeriodAndType[period]?.[type] || 0,
      })),
      color: theme.primaryColors[i % theme.primaryColors.length],
    }));

    return {
      type: "area",
      title: input.chartTitle || "Event Timeline",
      subtitle: `${periods.length} periods, ${topTypes.length} event types`,
      series,
      showLegend: true,
      showGrid: true,
      yAxisLabel: "Event Count",
      xAxisLabel: "Period",
    };
  }

  private formatTypeName(type: string): string {
    return type
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }
}
