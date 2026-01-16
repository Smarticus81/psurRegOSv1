/**
 * Time Series Chart Agent
 * 
 * SOTA agent for generating multi-line time series charts for historical comparison.
 */

import { BaseChartAgent, ChartInput, CHART_THEMES, DocumentStyle } from "./baseChartAgent";

export class TimeSeriesChartAgent extends BaseChartAgent {
  protected readonly chartType = "TIME_SERIES";

  constructor() {
    super(
      "TimeSeriesChartAgent",
      "Time Series Chart Agent"
    );
  }

  protected async generateChartConfig(
    input: ChartInput,
    theme: typeof CHART_THEMES[DocumentStyle]
  ): Promise<any> {
    // Group data by type and period
    const seriesData: Record<string, Record<string, number>> = {
      complaints: {},
      incidents: {},
      sales: {},
    };

    for (const atom of input.atoms) {
      const data = atom.normalizedData;
      const dateStr = String(
        this.getValue(data, "date", "complaint_date", "complaintDate", "incident_date", "period_start") || ""
      );
      const period = this.extractPeriod(dateStr);
      if (!period) continue;

      if (atom.evidenceType.includes("complaint")) {
        seriesData.complaints[period] = (seriesData.complaints[period] || 0) + 1;
      } else if (atom.evidenceType.includes("incident") || atom.evidenceType.includes("vigilance")) {
        seriesData.incidents[period] = (seriesData.incidents[period] || 0) + 1;
      } else if (atom.evidenceType.includes("sales")) {
        const qty = Number(this.getValue(data, "quantity", "units_sold") || 0);
        seriesData.sales[period] = (seriesData.sales[period] || 0) + qty;
      }
    }

    // Get all unique periods and sort
    const allPeriods = new Set<string>();
    for (const series of Object.values(seriesData)) {
      for (const period of Object.keys(series)) {
        allPeriods.add(period);
      }
    }
    const periods = Array.from(allPeriods).sort();

    // Build datasets
    const datasets = [];

    // Complaints line
    const complaintData = periods.map(p => seriesData.complaints[p] || 0);
    if (complaintData.some(d => d > 0)) {
      datasets.push({
        label: "Complaints",
        data: complaintData,
        borderColor: theme.primaryColors[0],
        backgroundColor: theme.primaryColors[0] + "20",
        fill: false,
        tension: 0.3,
        pointRadius: 4,
        yAxisID: "y",
      });
    }

    // Incidents line
    const incidentData = periods.map(p => seriesData.incidents[p] || 0);
    if (incidentData.some(d => d > 0)) {
      datasets.push({
        label: "Serious Incidents",
        data: incidentData,
        borderColor: input.style === "premium" ? "#ef4444" : "#dc2626",
        backgroundColor: "#ef444420",
        fill: false,
        tension: 0.3,
        pointRadius: 4,
        yAxisID: "y",
      });
    }

    // Sales line (secondary axis)
    const salesData = periods.map(p => seriesData.sales[p] || 0);
    if (salesData.some(d => d > 0)) {
      datasets.push({
        label: "Units Sold",
        data: salesData,
        borderColor: theme.primaryColors[3] || theme.primaryColors[1],
        backgroundColor: (theme.primaryColors[3] || theme.primaryColors[1]) + "20",
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        borderDash: [5, 5],
        yAxisID: "y1",
      });
    }

    return {
      type: "line",
      data: {
        labels: periods,
        datasets,
      },
      options: {
        ...this.getBaseChartOptions(theme, input.chartTitle),
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          ...this.getBaseChartOptions(theme, input.chartTitle).plugins,
          legend: {
            position: "bottom",
            labels: {
              color: theme.textColor,
              font: { family: theme.fontFamily, size: 11 },
              padding: 15,
            },
          },
        },
        scales: {
          x: {
            ...this.getBaseChartOptions(theme, input.chartTitle).scales.x,
            title: {
              display: true,
              text: "Period",
              color: theme.textColor,
            },
          },
          y: {
            type: "linear",
            display: true,
            position: "left",
            ticks: {
              color: theme.textColor,
              font: { family: theme.fontFamily },
            },
            grid: {
              color: theme.gridColor,
            },
            title: {
              display: true,
              text: "Events Count",
              color: theme.textColor,
            },
          },
          y1: {
            type: "linear",
            display: salesData.some(d => d > 0),
            position: "right",
            ticks: {
              color: theme.textColor,
              font: { family: theme.fontFamily },
            },
            grid: {
              drawOnChartArea: false,
            },
            title: {
              display: true,
              text: "Units Sold",
              color: theme.textColor,
            },
          },
        },
      },
    };
  }

  private extractPeriod(dateStr: string): string | null {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      }
    } catch {
      // Fall through
    }
    const match = dateStr.match(/(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : null;
  }
}
