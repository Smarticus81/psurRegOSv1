/**
 * SOTA SVG Chart Generator
 * 
 * Pure JavaScript/TypeScript chart generation using SVG.
 * No native dependencies - works on all platforms.
 * Generates high-quality vector graphics suitable for regulatory documents.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ChartType = "line" | "bar" | "pie" | "donut" | "scatter" | "area" | "stacked-bar";
export type DocumentStyle = "corporate" | "regulatory" | "premium";

export interface DataPoint {
  label: string;
  value: number;
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface DataSeries {
  name: string;
  data: DataPoint[];
  color?: string;
  lineStyle?: "solid" | "dashed" | "dotted";
}

export interface ChartConfig {
  type: ChartType;
  title: string;
  subtitle?: string;
  series: DataSeries[];
  width?: number;
  height?: number;
  style?: DocumentStyle;
  showLegend?: boolean;
  showGrid?: boolean;
  showValues?: boolean;
  yAxisLabel?: string;
  xAxisLabel?: string;
  thresholdLine?: { value: number; label: string; color?: string };
}

export interface ChartOutput {
  svg: string;
  width: number;
  height: number;
  dataPointCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLE THEMES
// ═══════════════════════════════════════════════════════════════════════════════

const THEMES: Record<DocumentStyle, {
  background: string;
  text: string;
  grid: string;
  colors: string[];
  font: string;
  titleSize: number;
  labelSize: number;
}> = {
  corporate: {
    background: "#ffffff",
    text: "#1a365d",
    grid: "#e2e8f0",
    colors: ["#2c5282", "#3182ce", "#4299e1", "#63b3ed", "#90cdf4", "#38a169", "#ed8936", "#e53e3e"],
    font: "Arial, Helvetica, sans-serif",
    titleSize: 18,
    labelSize: 12,
  },
  regulatory: {
    background: "#ffffff",
    text: "#000000",
    grid: "#cccccc",
    colors: ["#000000", "#333333", "#555555", "#777777", "#999999", "#bbbbbb", "#444444", "#666666"],
    font: "Times New Roman, Times, serif",
    titleSize: 16,
    labelSize: 11,
  },
  premium: {
    background: "#0f172a",
    text: "#f1f5f9",
    grid: "#334155",
    colors: ["#8b5cf6", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#3b82f6", "#14b8a6"],
    font: "Inter, system-ui, sans-serif",
    titleSize: 18,
    labelSize: 12,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SVG CHART GENERATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class SVGChartGenerator {
  private config: Required<ChartConfig>;
  private theme: typeof THEMES[DocumentStyle];
  private padding = { top: 60, right: 40, bottom: 60, left: 70 };

  constructor(config: ChartConfig) {
    this.config = {
      type: config.type,
      title: config.title,
      subtitle: config.subtitle || "",
      series: config.series,
      width: config.width || 800,
      height: config.height || 400,
      style: config.style || "corporate",
      showLegend: config.showLegend !== false,
      showGrid: config.showGrid !== false,
      showValues: config.showValues || false,
      yAxisLabel: config.yAxisLabel || "",
      xAxisLabel: config.xAxisLabel || "",
      thresholdLine: config.thresholdLine || undefined as any,
    };
    this.theme = THEMES[this.config.style];
  }

  generate(): ChartOutput {
    const { width, height, type } = this.config;
    
    let chartContent: string;
    
    switch (type) {
      case "line":
        chartContent = this.generateLineChart();
        break;
      case "bar":
        chartContent = this.generateBarChart();
        break;
      case "stacked-bar":
        chartContent = this.generateStackedBarChart();
        break;
      case "pie":
      case "donut":
        chartContent = this.generatePieChart(type === "donut");
        break;
      case "scatter":
        chartContent = this.generateScatterChart();
        break;
      case "area":
        chartContent = this.generateAreaChart();
        break;
      default:
        chartContent = this.generateBarChart();
    }

    const svg = this.wrapSVG(chartContent);
    
    return {
      svg,
      width,
      height,
      dataPointCount: this.countDataPoints(),
    };
  }

  private countDataPoints(): number {
    return this.config.series.reduce((sum, s) => sum + s.data.length, 0);
  }

  private wrapSVG(content: string): string {
    const { width, height, title, subtitle } = this.config;
    const { background, text, font, titleSize } = this.theme;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <style>
      .chart-title { font-family: ${font}; font-size: ${titleSize}px; font-weight: bold; fill: ${text}; }
      .chart-subtitle { font-family: ${font}; font-size: ${titleSize - 4}px; fill: ${text}; opacity: 0.7; }
      .axis-label { font-family: ${font}; font-size: ${this.theme.labelSize}px; fill: ${text}; }
      .legend-text { font-family: ${font}; font-size: ${this.theme.labelSize}px; fill: ${text}; }
      .value-label { font-family: ${font}; font-size: ${this.theme.labelSize - 1}px; fill: ${text}; }
      .grid-line { stroke: ${this.theme.grid}; stroke-width: 1; }
      .axis-line { stroke: ${text}; stroke-width: 1; }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="${background}"/>
  <text x="${width / 2}" y="25" text-anchor="middle" class="chart-title">${this.escapeXml(title)}</text>
  ${subtitle ? `<text x="${width / 2}" y="45" text-anchor="middle" class="chart-subtitle">${this.escapeXml(subtitle)}</text>` : ""}
  ${content}
  ${this.config.showLegend ? this.generateLegend() : ""}
</svg>`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // LINE CHART
  // ═══════════════════════════════════════════════════════════════════════════════

  private generateLineChart(): string {
    const { width, height, series, showGrid, thresholdLine } = this.config;
    const chartWidth = width - this.padding.left - this.padding.right;
    const chartHeight = height - this.padding.top - this.padding.bottom;

    const allValues = series.flatMap(s => s.data.map(d => d.value));
    const minValue = Math.min(0, ...allValues);
    const maxValue = Math.max(...allValues) * 1.1;
    const valueRange = maxValue - minValue;

    const labels = series[0]?.data.map(d => d.label) || [];
    const xStep = chartWidth / Math.max(labels.length - 1, 1);

    let svg = "";

    // Grid
    if (showGrid) {
      svg += this.generateGrid(chartWidth, chartHeight, 5, labels.length);
    }

    // Y-axis labels
    for (let i = 0; i <= 5; i++) {
      const value = minValue + (valueRange * i) / 5;
      const y = this.padding.top + chartHeight - (chartHeight * i) / 5;
      svg += `<text x="${this.padding.left - 10}" y="${y + 4}" text-anchor="end" class="axis-label">${this.formatValue(value)}</text>`;
    }

    // X-axis labels
    labels.forEach((label, i) => {
      const x = this.padding.left + i * xStep;
      svg += `<text x="${x}" y="${this.padding.top + chartHeight + 20}" text-anchor="middle" class="axis-label">${this.escapeXml(this.truncateLabel(label))}</text>`;
    });

    // Threshold line
    if (thresholdLine) {
      const y = this.padding.top + chartHeight - ((thresholdLine.value - minValue) / valueRange) * chartHeight;
      svg += `<line x1="${this.padding.left}" y1="${y}" x2="${this.padding.left + chartWidth}" y2="${y}" stroke="${thresholdLine.color || "#ef4444"}" stroke-width="2" stroke-dasharray="5,5"/>`;
      svg += `<text x="${this.padding.left + chartWidth + 5}" y="${y + 4}" class="axis-label" fill="${thresholdLine.color || "#ef4444"}">${this.escapeXml(thresholdLine.label)}</text>`;
    }

    // Lines
    series.forEach((s, seriesIndex) => {
      const color = s.color || this.theme.colors[seriesIndex % this.theme.colors.length];
      const dashArray = s.lineStyle === "dashed" ? "8,4" : s.lineStyle === "dotted" ? "2,4" : "";
      
      const points = s.data.map((d, i) => {
        const x = this.padding.left + i * xStep;
        const y = this.padding.top + chartHeight - ((d.value - minValue) / valueRange) * chartHeight;
        return `${x},${y}`;
      });

      svg += `<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" ${dashArray ? `stroke-dasharray="${dashArray}"` : ""}/>`;

      // Data points
      s.data.forEach((d, i) => {
        const x = this.padding.left + i * xStep;
        const y = this.padding.top + chartHeight - ((d.value - minValue) / valueRange) * chartHeight;
        svg += `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="${this.theme.background}" stroke-width="2"/>`;
        
        if (this.config.showValues) {
          svg += `<text x="${x}" y="${y - 10}" text-anchor="middle" class="value-label">${this.formatValue(d.value)}</text>`;
        }
      });
    });

    // Axes
    svg += `<line x1="${this.padding.left}" y1="${this.padding.top}" x2="${this.padding.left}" y2="${this.padding.top + chartHeight}" class="axis-line"/>`;
    svg += `<line x1="${this.padding.left}" y1="${this.padding.top + chartHeight}" x2="${this.padding.left + chartWidth}" y2="${this.padding.top + chartHeight}" class="axis-line"/>`;

    // Axis labels
    if (this.config.yAxisLabel) {
      svg += `<text x="15" y="${this.padding.top + chartHeight / 2}" text-anchor="middle" transform="rotate(-90, 15, ${this.padding.top + chartHeight / 2})" class="axis-label">${this.escapeXml(this.config.yAxisLabel)}</text>`;
    }
    if (this.config.xAxisLabel) {
      svg += `<text x="${this.padding.left + chartWidth / 2}" y="${height - 10}" text-anchor="middle" class="axis-label">${this.escapeXml(this.config.xAxisLabel)}</text>`;
    }

    return svg;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // BAR CHART
  // ═══════════════════════════════════════════════════════════════════════════════

  private generateBarChart(): string {
    const { width, height, series, showGrid } = this.config;
    const chartWidth = width - this.padding.left - this.padding.right;
    const chartHeight = height - this.padding.top - this.padding.bottom;

    const allValues = series.flatMap(s => s.data.map(d => d.value));
    const maxValue = Math.max(...allValues) * 1.1;

    const labels = series[0]?.data.map(d => d.label) || [];
    const groupWidth = chartWidth / labels.length;
    const barWidth = (groupWidth * 0.8) / series.length;
    const groupPadding = groupWidth * 0.1;

    let svg = "";

    // Grid
    if (showGrid) {
      svg += this.generateGrid(chartWidth, chartHeight, 5, 0);
    }

    // Y-axis labels
    for (let i = 0; i <= 5; i++) {
      const value = (maxValue * i) / 5;
      const y = this.padding.top + chartHeight - (chartHeight * i) / 5;
      svg += `<text x="${this.padding.left - 10}" y="${y + 4}" text-anchor="end" class="axis-label">${this.formatValue(value)}</text>`;
    }

    // Bars
    series.forEach((s, seriesIndex) => {
      const color = s.color || this.theme.colors[seriesIndex % this.theme.colors.length];
      
      s.data.forEach((d, i) => {
        const x = this.padding.left + i * groupWidth + groupPadding + seriesIndex * barWidth;
        const barHeight = (d.value / maxValue) * chartHeight;
        const y = this.padding.top + chartHeight - barHeight;
        
        svg += `<rect x="${x}" y="${y}" width="${barWidth - 2}" height="${barHeight}" fill="${color}" rx="2"/>`;
        
        if (this.config.showValues) {
          svg += `<text x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle" class="value-label">${this.formatValue(d.value)}</text>`;
        }
      });
    });

    // X-axis labels
    labels.forEach((label, i) => {
      const x = this.padding.left + i * groupWidth + groupWidth / 2;
      svg += `<text x="${x}" y="${this.padding.top + chartHeight + 20}" text-anchor="middle" class="axis-label">${this.escapeXml(this.truncateLabel(label))}</text>`;
    });

    // Axes
    svg += `<line x1="${this.padding.left}" y1="${this.padding.top}" x2="${this.padding.left}" y2="${this.padding.top + chartHeight}" class="axis-line"/>`;
    svg += `<line x1="${this.padding.left}" y1="${this.padding.top + chartHeight}" x2="${this.padding.left + chartWidth}" y2="${this.padding.top + chartHeight}" class="axis-line"/>`;

    return svg;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STACKED BAR CHART
  // ═══════════════════════════════════════════════════════════════════════════════

  private generateStackedBarChart(): string {
    const { width, height, series, showGrid } = this.config;
    const chartWidth = width - this.padding.left - this.padding.right;
    const chartHeight = height - this.padding.top - this.padding.bottom;

    const labels = series[0]?.data.map(d => d.label) || [];
    
    // Calculate stacked totals
    const stackedTotals = labels.map((_, i) => 
      series.reduce((sum, s) => sum + (s.data[i]?.value || 0), 0)
    );
    const maxValue = Math.max(...stackedTotals) * 1.1;

    const barWidth = (chartWidth / labels.length) * 0.7;
    const barPadding = (chartWidth / labels.length) * 0.15;

    let svg = "";

    // Grid
    if (showGrid) {
      svg += this.generateGrid(chartWidth, chartHeight, 5, 0);
    }

    // Y-axis labels
    for (let i = 0; i <= 5; i++) {
      const value = (maxValue * i) / 5;
      const y = this.padding.top + chartHeight - (chartHeight * i) / 5;
      svg += `<text x="${this.padding.left - 10}" y="${y + 4}" text-anchor="end" class="axis-label">${this.formatValue(value)}</text>`;
    }

    // Stacked bars
    labels.forEach((label, labelIndex) => {
      let stackY = this.padding.top + chartHeight;
      
      series.forEach((s, seriesIndex) => {
        const color = s.color || this.theme.colors[seriesIndex % this.theme.colors.length];
        const value = s.data[labelIndex]?.value || 0;
        const barHeight = (value / maxValue) * chartHeight;
        stackY -= barHeight;
        
        const x = this.padding.left + labelIndex * (chartWidth / labels.length) + barPadding;
        svg += `<rect x="${x}" y="${stackY}" width="${barWidth}" height="${barHeight}" fill="${color}"/>`;
      });
    });

    // X-axis labels
    labels.forEach((label, i) => {
      const x = this.padding.left + i * (chartWidth / labels.length) + (chartWidth / labels.length) / 2;
      svg += `<text x="${x}" y="${this.padding.top + chartHeight + 20}" text-anchor="middle" class="axis-label">${this.escapeXml(this.truncateLabel(label))}</text>`;
    });

    // Axes
    svg += `<line x1="${this.padding.left}" y1="${this.padding.top}" x2="${this.padding.left}" y2="${this.padding.top + chartHeight}" class="axis-line"/>`;
    svg += `<line x1="${this.padding.left}" y1="${this.padding.top + chartHeight}" x2="${this.padding.left + chartWidth}" y2="${this.padding.top + chartHeight}" class="axis-line"/>`;

    return svg;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PIE / DONUT CHART
  // ═══════════════════════════════════════════════════════════════════════════════

  private generatePieChart(isDonut: boolean): string {
    const { width, height, series } = this.config;
    const data = series[0]?.data || [];
    
    const centerX = width / 2;
    const centerY = (height - 40) / 2 + 50;
    const radius = Math.min(width, height - 100) / 2 - 40;
    const innerRadius = isDonut ? radius * 0.6 : 0;

    const total = data.reduce((sum, d) => sum + d.value, 0);
    
    let svg = "";
    let startAngle = -Math.PI / 2;

    data.forEach((d, i) => {
      const color = d.color || this.theme.colors[i % this.theme.colors.length];
      const sliceAngle = (d.value / total) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;
      
      const x1 = centerX + radius * Math.cos(startAngle);
      const y1 = centerY + radius * Math.sin(startAngle);
      const x2 = centerX + radius * Math.cos(endAngle);
      const y2 = centerY + radius * Math.sin(endAngle);
      
      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      
      if (isDonut) {
        const ix1 = centerX + innerRadius * Math.cos(startAngle);
        const iy1 = centerY + innerRadius * Math.sin(startAngle);
        const ix2 = centerX + innerRadius * Math.cos(endAngle);
        const iy2 = centerY + innerRadius * Math.sin(endAngle);
        
        svg += `<path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z" fill="${color}"/>`;
      } else {
        svg += `<path d="M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${color}"/>`;
      }
      
      // Label
      const labelAngle = startAngle + sliceAngle / 2;
      const labelRadius = isDonut ? (radius + innerRadius) / 2 : radius * 0.65;
      const labelX = centerX + labelRadius * Math.cos(labelAngle);
      const labelY = centerY + labelRadius * Math.sin(labelAngle);
      
      const percentage = Math.round((d.value / total) * 100);
      if (percentage >= 5) {
        svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" class="value-label" fill="${this.getContrastColor(color)}">${percentage}%</text>`;
      }
      
      startAngle = endAngle;
    });

    return svg;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SCATTER CHART
  // ═══════════════════════════════════════════════════════════════════════════════

  private generateScatterChart(): string {
    const { width, height, series, showGrid } = this.config;
    const chartWidth = width - this.padding.left - this.padding.right;
    const chartHeight = height - this.padding.top - this.padding.bottom;

    const allValues = series.flatMap(s => s.data.map(d => d.value));
    const maxValue = Math.max(...allValues) * 1.1;
    const labels = series[0]?.data.map(d => d.label) || [];

    let svg = "";

    // Grid
    if (showGrid) {
      svg += this.generateGrid(chartWidth, chartHeight, 5, labels.length);
    }

    // Points
    series.forEach((s, seriesIndex) => {
      const color = s.color || this.theme.colors[seriesIndex % this.theme.colors.length];
      
      s.data.forEach((d, i) => {
        const x = this.padding.left + (i / (labels.length - 1)) * chartWidth;
        const y = this.padding.top + chartHeight - (d.value / maxValue) * chartHeight;
        
        svg += `<circle cx="${x}" cy="${y}" r="6" fill="${color}" opacity="0.8"/>`;
      });
    });

    // Axes
    svg += `<line x1="${this.padding.left}" y1="${this.padding.top}" x2="${this.padding.left}" y2="${this.padding.top + chartHeight}" class="axis-line"/>`;
    svg += `<line x1="${this.padding.left}" y1="${this.padding.top + chartHeight}" x2="${this.padding.left + chartWidth}" y2="${this.padding.top + chartHeight}" class="axis-line"/>`;

    return svg;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // AREA CHART
  // ═══════════════════════════════════════════════════════════════════════════════

  private generateAreaChart(): string {
    const { width, height, series, showGrid } = this.config;
    const chartWidth = width - this.padding.left - this.padding.right;
    const chartHeight = height - this.padding.top - this.padding.bottom;

    const allValues = series.flatMap(s => s.data.map(d => d.value));
    const minValue = Math.min(0, ...allValues);
    const maxValue = Math.max(...allValues) * 1.1;
    const valueRange = maxValue - minValue;

    const labels = series[0]?.data.map(d => d.label) || [];
    const xStep = chartWidth / Math.max(labels.length - 1, 1);

    let svg = "";

    // Grid
    if (showGrid) {
      svg += this.generateGrid(chartWidth, chartHeight, 5, labels.length);
    }

    // Areas (in reverse order so first series is on top)
    [...series].reverse().forEach((s, seriesIndex) => {
      const actualIndex = series.length - 1 - seriesIndex;
      const color = s.color || this.theme.colors[actualIndex % this.theme.colors.length];
      
      const points = s.data.map((d, i) => {
        const x = this.padding.left + i * xStep;
        const y = this.padding.top + chartHeight - ((d.value - minValue) / valueRange) * chartHeight;
        return `${x},${y}`;
      });

      const firstX = this.padding.left;
      const lastX = this.padding.left + (s.data.length - 1) * xStep;
      const baseY = this.padding.top + chartHeight;

      svg += `<polygon points="${firstX},${baseY} ${points.join(" ")} ${lastX},${baseY}" fill="${color}" opacity="0.3"/>`;
      svg += `<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="2"/>`;
    });

    // Axes
    svg += `<line x1="${this.padding.left}" y1="${this.padding.top}" x2="${this.padding.left}" y2="${this.padding.top + chartHeight}" class="axis-line"/>`;
    svg += `<line x1="${this.padding.left}" y1="${this.padding.top + chartHeight}" x2="${this.padding.left + chartWidth}" y2="${this.padding.top + chartHeight}" class="axis-line"/>`;

    // X-axis labels
    labels.forEach((label, i) => {
      const x = this.padding.left + i * xStep;
      svg += `<text x="${x}" y="${this.padding.top + chartHeight + 20}" text-anchor="middle" class="axis-label">${this.escapeXml(this.truncateLabel(label))}</text>`;
    });

    return svg;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  private generateGrid(chartWidth: number, chartHeight: number, yLines: number, xLines: number): string {
    let svg = "";
    
    // Horizontal grid lines
    for (let i = 0; i <= yLines; i++) {
      const y = this.padding.top + (chartHeight * i) / yLines;
      svg += `<line x1="${this.padding.left}" y1="${y}" x2="${this.padding.left + chartWidth}" y2="${y}" class="grid-line"/>`;
    }
    
    // Vertical grid lines
    if (xLines > 1) {
      for (let i = 0; i <= xLines; i++) {
        const x = this.padding.left + (chartWidth * i) / (xLines - 1);
        svg += `<line x1="${x}" y1="${this.padding.top}" x2="${x}" y2="${this.padding.top + chartHeight}" class="grid-line"/>`;
      }
    }
    
    return svg;
  }

  private generateLegend(): string {
    const { width, series } = this.config;
    const legendY = this.config.height - 25;
    const itemWidth = 120;
    const totalWidth = series.length * itemWidth;
    const startX = (width - totalWidth) / 2;

    let svg = "";
    
    series.forEach((s, i) => {
      const color = s.color || this.theme.colors[i % this.theme.colors.length];
      const x = startX + i * itemWidth;
      
      svg += `<rect x="${x}" y="${legendY - 6}" width="12" height="12" fill="${color}" rx="2"/>`;
      svg += `<text x="${x + 18}" y="${legendY + 4}" class="legend-text">${this.escapeXml(this.truncateLabel(s.name, 12))}</text>`;
    });

    return svg;
  }

  private formatValue(value: number): string {
    if (Math.abs(value) >= 1000000) {
      return (value / 1000000).toFixed(1) + "M";
    }
    if (Math.abs(value) >= 1000) {
      return (value / 1000).toFixed(1) + "K";
    }
    if (Number.isInteger(value)) {
      return value.toString();
    }
    return value.toFixed(2);
  }

  private truncateLabel(label: string, maxLen: number = 10): string {
    if (label.length <= maxLen) return label;
    return label.substring(0, maxLen - 2) + "..";
  }

  private getContrastColor(hexColor: string): string {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? "#000000" : "#ffffff";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function generateLineChart(config: Omit<ChartConfig, "type">): ChartOutput {
  return new SVGChartGenerator({ ...config, type: "line" }).generate();
}

export function generateBarChart(config: Omit<ChartConfig, "type">): ChartOutput {
  return new SVGChartGenerator({ ...config, type: "bar" }).generate();
}

export function generatePieChart(config: Omit<ChartConfig, "type">): ChartOutput {
  return new SVGChartGenerator({ ...config, type: "pie" }).generate();
}

export function generateAreaChart(config: Omit<ChartConfig, "type">): ChartOutput {
  return new SVGChartGenerator({ ...config, type: "area" }).generate();
}
