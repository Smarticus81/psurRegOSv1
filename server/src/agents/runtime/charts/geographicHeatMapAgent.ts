/**
 * Geographic Heat Map Agent
 * 
 * SOTA agent for generating regional distribution visualizations.
 * Uses a horizontal bar chart as a heat map proxy for document embedding.
 */

import { BaseChartAgent, ChartInput, CHART_THEMES, DocumentStyle } from "./baseChartAgent";

export class GeographicHeatMapAgent extends BaseChartAgent {
  protected readonly chartType = "GEOGRAPHIC_HEATMAP";

  constructor() {
    super(
      "GeographicHeatMapAgent",
      "Geographic Heat Map Agent"
    );
  }

  protected async generateChartConfig(
    input: ChartInput,
    theme: typeof CHART_THEMES[DocumentStyle]
  ): Promise<any> {
    // Extract regional data from atoms
    const regionData: Record<string, { complaints: number; sales: number }> = {};

    for (const atom of input.atoms) {
      const data = atom.normalizedData;
      const region = String(this.getValue(data, "region", "country") || "Unknown");

      if (!regionData[region]) {
        regionData[region] = { complaints: 0, sales: 0 };
      }

      if (atom.evidenceType.includes("complaint") || atom.evidenceType.includes("incident")) {
        regionData[region].complaints++;
      } else if (atom.evidenceType.includes("sales")) {
        regionData[region].sales += Number(this.getValue(data, "quantity", "units_sold") || 0);
      }
    }

    // Calculate rates and sort by rate descending
    const ratesWithRegion = Object.entries(regionData)
      .map(([region, data]) => ({
        region,
        rate: data.sales > 0 ? (data.complaints / data.sales) * 1000 : 0,
        complaints: data.complaints,
        sales: data.sales,
      }))
      .sort((a, b) => b.rate - a.rate);

    const labels = ratesWithRegion.map(r => r.region);
    const rates = ratesWithRegion.map(r => r.rate);

    // Color by rate intensity
    const maxRate = Math.max(...rates, 1);
    const backgroundColors = rates.map(rate => {
      const intensity = rate / maxRate;
      if (input.style === "premium") {
        // Purple gradient for premium
        return `rgba(139, 92, 246, ${0.3 + intensity * 0.7})`;
      } else if (input.style === "regulatory") {
        // Grayscale for regulatory
        const gray = Math.round(200 - intensity * 150);
        return `rgb(${gray}, ${gray}, ${gray})`;
      } else {
        // Blue gradient for corporate
        return `rgba(44, 82, 130, ${0.3 + intensity * 0.7})`;
      }
    });

    return {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Complaint Rate (per 1,000 units)",
          data: rates,
          backgroundColor: backgroundColors,
          borderColor: theme.primaryColors[0],
          borderWidth: 1,
        }],
      },
      options: {
        ...this.getBaseChartOptions(theme, input.chartTitle),
        indexAxis: "y", // Horizontal bar chart
        plugins: {
          ...this.getBaseChartOptions(theme, input.chartTitle).plugins,
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const idx = context.dataIndex;
                const data = ratesWithRegion[idx];
                return [
                  `Rate: ${data.rate.toFixed(2)} per 1,000`,
                  `Complaints: ${data.complaints}`,
                  `Units: ${data.sales.toLocaleString()}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            ...this.getBaseChartOptions(theme, input.chartTitle).scales.x,
            beginAtZero: true,
            title: {
              display: true,
              text: "Rate per 1,000 Units",
              color: theme.textColor,
            },
          },
          y: {
            ...this.getBaseChartOptions(theme, input.chartTitle).scales.y,
            title: {
              display: true,
              text: "Region",
              color: theme.textColor,
            },
          },
        },
      },
    };
  }
}
