/**
 * SOTA Geographic Heat Map Agent
 * 
 * Generates geographic distribution charts using pure SVG.
 * Uses a stacked bar chart to show regional distribution.
 * No native dependencies - works on all platforms.
 */

import { BaseChartAgent, ChartInput, CHART_THEMES, DocumentStyle } from "./baseChartAgent";
import { ChartConfig, DataSeries } from "./svgChartGenerator";

export class GeographicHeatMapAgent extends BaseChartAgent {
  protected readonly chartType = "GEOGRAPHIC_HEATMAP";

  constructor() {
    super(
      "GeographicHeatMapAgent",
      "SOTA Geographic Distribution Chart Agent"
    );
  }

  protected async generateChartConfig(
    input: ChartInput,
    theme: typeof CHART_THEMES[DocumentStyle]
  ): Promise<Omit<ChartConfig, "width" | "height" | "style">> {
    // Group events by region/country
    const byRegion: Record<string, number> = {};
    const byRegionAndType: Record<string, Record<string, number>> = {};
    const eventTypes = new Set<string>();

    for (const atom of input.atoms) {
      const data = atom.normalizedData;
      const region = String(this.getValue(data, "region", "country", "location", "geographic_region", "market") || "Unknown");
      const type = atom.evidenceType;
      
      byRegion[region] = (byRegion[region] || 0) + 1;
      eventTypes.add(type);
      
      if (!byRegionAndType[region]) {
        byRegionAndType[region] = {};
      }
      byRegionAndType[region][type] = (byRegionAndType[region][type] || 0) + 1;
    }

    // Sort regions by total count and take top 10
    const sortedRegions = Object.entries(byRegion)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([region]) => region);

    const types = Array.from(eventTypes).slice(0, 5);

    // If we have multiple types, create a stacked bar chart
    if (types.length > 1) {
      const series: DataSeries[] = types.map((type, i) => ({
        name: this.formatTypeName(type),
        data: sortedRegions.map(region => ({
          label: this.formatRegionName(region),
          value: byRegionAndType[region]?.[type] || 0,
        })),
        color: theme.primaryColors[i % theme.primaryColors.length],
      }));

      return {
        type: "stacked-bar",
        title: input.chartTitle || "Geographic Distribution by Event Type",
        series,
        showLegend: true,
        showGrid: true,
        yAxisLabel: "Event Count",
        xAxisLabel: "Region",
      };
    }

    // Single type - simple bar chart
    const series: DataSeries[] = [
      {
        name: "Events",
        data: sortedRegions.map((region, i) => ({
          label: this.formatRegionName(region),
          value: byRegion[region],
          color: theme.primaryColors[i % theme.primaryColors.length],
        })),
      },
    ];

    return {
      type: "bar",
      title: input.chartTitle || "Geographic Distribution of Events",
      series,
      showLegend: false,
      showGrid: true,
      showValues: true,
      yAxisLabel: "Event Count",
      xAxisLabel: "Region",
    };
  }

  private formatRegionName(region: string): string {
    // Common region/country abbreviations
    const abbreviations: Record<string, string> = {
      "United States": "US",
      "United Kingdom": "UK",
      "Germany": "DE",
      "France": "FR",
      "Japan": "JP",
      "China": "CN",
      "Canada": "CA",
      "Australia": "AU",
      "European Union": "EU",
      "Asia Pacific": "APAC",
    };
    
    return abbreviations[region] || region.substring(0, 10);
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
