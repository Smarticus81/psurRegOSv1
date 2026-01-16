/**
 * Trend Line Chart Agent
 * 
 * SOTA agent for generating Article 88 trend line charts with threshold visualization.
 */

import { BaseChartAgent, ChartInput, CHART_THEMES, DocumentStyle } from "./baseChartAgent";

export class TrendLineChartAgent extends BaseChartAgent {
  protected readonly chartType = "TREND_LINE";

  constructor() {
    super(
      "TrendLineChartAgent",
      "Trend Line Chart Agent"
    );
  }

  protected async generateChartConfig(
    input: ChartInput,
    theme: typeof CHART_THEMES[DocumentStyle]
  ): Promise<any> {
    // Extract trend data from atoms
    const trendAtoms = input.atoms.filter(a => 
      ["trend_analysis", "complaint_record", "sales_volume"].includes(a.evidenceType)
    );

    // Group complaints by month/period
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

    // Calculate rates
    const periodSet = new Set([...Object.keys(complaintsByPeriod), ...Object.keys(salesByPeriod)]);
    const periods = Array.from(periodSet).sort();
    const rateData: number[] = [];
    const labels: string[] = [];

    for (const period of periods) {
      const complaints = complaintsByPeriod[period] || 0;
      const sales = salesByPeriod[period] || 1;
      const rate = (complaints / sales) * 1000;
      rateData.push(rate);
      labels.push(period);
    }

    // Calculate threshold (2x average baseline)
    const avgRate = rateData.length > 0 
      ? rateData.reduce((a, b) => a + b, 0) / rateData.length 
      : 1;
    const threshold = avgRate * 2;

    return {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Complaint Rate (per 1,000 units)",
            data: rateData,
            borderColor: theme.primaryColors[0],
            backgroundColor: theme.primaryColors[0] + "40",
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          {
            label: "Signal Threshold",
            data: labels.map(() => threshold),
            borderColor: input.style === "premium" ? "#ef4444" : "#dc2626",
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0,
          },
          {
            label: "Baseline",
            data: labels.map(() => avgRate),
            borderColor: theme.primaryColors[2],
            borderDash: [2, 2],
            fill: false,
            pointRadius: 0,
          },
        ],
      },
      options: {
        ...this.getBaseChartOptions(theme, input.chartTitle),
        plugins: {
          ...this.getBaseChartOptions(theme, input.chartTitle).plugins,
          annotation: {
            annotations: {
              thresholdLine: {
                type: "line",
                yMin: threshold,
                yMax: threshold,
                borderColor: "#dc2626",
                borderWidth: 2,
                borderDash: [5, 5],
              },
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
            ...this.getBaseChartOptions(theme, input.chartTitle).scales.y,
            beginAtZero: true,
            title: {
              display: true,
              text: "Rate per 1,000 Units",
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
    // Try to extract YYYY-MM from string
    const match = dateStr.match(/(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : null;
  }
}
