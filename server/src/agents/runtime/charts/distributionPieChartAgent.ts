/**
 * Distribution Pie Chart Agent
 * 
 * SOTA agent for generating pie/donut charts for complaint type distributions.
 */

import { BaseChartAgent, ChartInput, CHART_THEMES, DocumentStyle } from "./baseChartAgent";

export class DistributionPieChartAgent extends BaseChartAgent {
  protected readonly chartType = "DISTRIBUTION_PIE";

  constructor() {
    super(
      "DistributionPieChartAgent",
      "Distribution Pie Chart Agent"
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

    // Group by complaint type/category
    const grouped: Record<string, number> = {};

    for (const atom of complaintAtoms) {
      const data = atom.normalizedData;
      const type = String(
        this.getValue(data, "complaint_type", "category", "type", "description") || "Other"
      ).substring(0, 30);

      grouped[type] = (grouped[type] || 0) + 1;
    }

    // Sort by count and limit to top 8 + "Other"
    const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
    const topCategories = sorted.slice(0, 8);
    const otherCount = sorted.slice(8).reduce((sum, [, count]) => sum + count, 0);
    
    if (otherCount > 0) {
      topCategories.push(["Other", otherCount]);
    }

    const labels = topCategories.map(([label]) => label);
    const data = topCategories.map(([, count]) => count);

    return {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: theme.primaryColors.slice(0, labels.length),
          borderColor: theme.backgroundColor,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: input.chartTitle,
            color: theme.textColor,
            font: {
              family: theme.fontFamily,
              size: 16,
              weight: "bold",
            },
          },
          legend: {
            position: "right",
            labels: {
              color: theme.textColor,
              font: { family: theme.fontFamily, size: 11 },
              padding: 10,
              generateLabels: (chart: any) => {
                const datasets = chart.data.datasets;
                return chart.data.labels.map((label: string, i: number) => {
                  const value = datasets[0].data[i];
                  const total = datasets[0].data.reduce((a: number, b: number) => a + b, 0);
                  const percentage = ((value / total) * 100).toFixed(1);
                  return {
                    text: `${label} (${percentage}%)`,
                    fillStyle: datasets[0].backgroundColor[i],
                    strokeStyle: datasets[0].borderColor,
                    lineWidth: datasets[0].borderWidth,
                    hidden: false,
                    index: i,
                  };
                });
              },
            },
          },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const value = context.parsed;
                const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${context.label}: ${value} (${percentage}%)`;
              },
            },
          },
        },
        cutout: "50%", // Makes it a donut chart
      },
    };
  }
}
