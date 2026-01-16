/**
 * Complaint Bar Chart Agent
 * 
 * SOTA agent for generating stacked/grouped bar charts for complaints by severity/region.
 */

import { BaseChartAgent, ChartInput, CHART_THEMES, DocumentStyle } from "./baseChartAgent";

export class ComplaintBarChartAgent extends BaseChartAgent {
  protected readonly chartType = "COMPLAINT_BAR";

  constructor() {
    super(
      "ComplaintBarChartAgent",
      "Complaint Bar Chart Agent"
    );
  }

  protected async generateChartConfig(
    input: ChartInput,
    theme: typeof CHART_THEMES[DocumentStyle]
  ): Promise<any> {
    // Extract complaint data
    const complaintAtoms = input.atoms.filter(a => 
      ["complaint_record", "complaint_summary"].includes(a.evidenceType)
    );

    // Group by region and severity
    const grouped: Record<string, Record<string, number>> = {};
    const severities = new Set<string>();

    for (const atom of complaintAtoms) {
      const data = atom.normalizedData;
      const region = String(this.getValue(data, "region", "country") || "Unknown");
      const severity = String(this.getValue(data, "severity", "seriousness") || "Unknown");

      if (!grouped[region]) grouped[region] = {};
      grouped[region][severity] = (grouped[region][severity] || 0) + 1;
      severities.add(severity);
    }

    // Order severities by importance
    const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL", "Unknown"];
    const orderedSeverities = Array.from(severities).sort((a, b) => {
      const indexA = severityOrder.indexOf(a);
      const indexB = severityOrder.indexOf(b);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    // Prepare data
    const regions = Object.keys(grouped).sort();
    const datasets = orderedSeverities.map((severity, idx) => ({
      label: severity,
      data: regions.map(region => grouped[region][severity] || 0),
      backgroundColor: theme.primaryColors[idx % theme.primaryColors.length],
      borderColor: theme.primaryColors[idx % theme.primaryColors.length],
      borderWidth: 1,
    }));

    return {
      type: "bar",
      data: {
        labels: regions,
        datasets,
      },
      options: {
        ...this.getBaseChartOptions(theme, input.chartTitle),
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
            stacked: true,
            title: {
              display: true,
              text: "Region",
              color: theme.textColor,
            },
          },
          y: {
            ...this.getBaseChartOptions(theme, input.chartTitle).scales.y,
            stacked: true,
            beginAtZero: true,
            title: {
              display: true,
              text: "Number of Complaints",
              color: theme.textColor,
            },
          },
        },
      },
    };
  }
}
