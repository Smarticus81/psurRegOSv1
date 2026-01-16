/**
 * Base Chart Agent
 * 
 * Foundation for all SOTA chart generator agents using Chart.js.
 * Generates PNG images for embedding in DOCX documents.
 */

import { BaseAgent, AgentConfig, AgentContext, createAgentConfig } from "../../baseAgent";
import { createTraceBuilder } from "../../../services/compileTraceRepository";

// Dynamic import for chartjs-node-canvas (may not be available in all environments)
let ChartJSNodeCanvas: any = null;
let Chart: any = null;

async function loadChartJS() {
  if (ChartJSNodeCanvas === null) {
    try {
      const module = await import("chartjs-node-canvas");
      ChartJSNodeCanvas = module.ChartJSNodeCanvas;
      Chart = (await import("chart.js")).Chart;
      
      // Register all chart components
      const { registerables } = await import("chart.js");
      Chart.register(...registerables);
    } catch (err) {
      console.warn("[ChartAgent] chartjs-node-canvas not available, charts will be disabled");
    }
  }
  return { ChartJSNodeCanvas, Chart };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type DocumentStyle = "corporate" | "regulatory" | "premium";

export interface ChartEvidenceAtom {
  atomId: string;
  evidenceType: string;
  normalizedData: Record<string, unknown>;
}

export interface ChartInput {
  atoms: ChartEvidenceAtom[];
  chartTitle: string;
  style: DocumentStyle;
  width?: number;
  height?: number;
}

export interface ChartOutput {
  imageBuffer: Buffer;
  width: number;
  height: number;
  mimeType: string;
  chartType: string;
  dataPointCount: number;
}

export interface ChartAgentContext extends AgentContext {
  psurCaseId: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLE THEMES
// ═══════════════════════════════════════════════════════════════════════════════

export const CHART_THEMES: Record<DocumentStyle, {
  backgroundColor: string;
  textColor: string;
  gridColor: string;
  primaryColors: string[];
  fontFamily: string;
}> = {
  corporate: {
    backgroundColor: "#ffffff",
    textColor: "#1a365d",
    gridColor: "#e2e8f0",
    primaryColors: ["#2c5282", "#3182ce", "#4299e1", "#63b3ed", "#90cdf4", "#bee3f8"],
    fontFamily: "Arial, sans-serif",
  },
  regulatory: {
    backgroundColor: "#ffffff",
    textColor: "#000000",
    gridColor: "#cccccc",
    primaryColors: ["#000000", "#333333", "#666666", "#999999", "#cccccc", "#eeeeee"],
    fontFamily: "Times New Roman, serif",
  },
  premium: {
    backgroundColor: "#0f172a",
    textColor: "#f8fafc",
    gridColor: "#334155",
    primaryColors: ["#8b5cf6", "#a78bfa", "#c4b5fd", "#06b6d4", "#22d3ee", "#67e8f9"],
    fontFamily: "Inter, system-ui, sans-serif",
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// BASE CHART AGENT
// ═══════════════════════════════════════════════════════════════════════════════

export abstract class BaseChartAgent extends BaseAgent<ChartInput, ChartOutput> {
  protected abstract readonly chartType: string;
  protected chartCanvas: any = null;

  constructor(
    agentType: string,
    agentName: string,
    config?: Partial<AgentConfig>
  ) {
    super(createAgentConfig(agentType, agentName, {
      llm: {
        provider: "auto",
        temperature: 0.1,
        maxTokens: 1024,
      },
      behavior: {
        confidenceThreshold: 0.8,
        maxRetries: 2,
        retryDelayMs: 500,
        timeoutMs: 60000,
      },
      ...config,
    }));
  }

  protected async execute(input: ChartInput): Promise<ChartOutput> {
    const ctx = this.context as ChartAgentContext;
    
    // Load Chart.js
    const { ChartJSNodeCanvas } = await loadChartJS();
    
    if (!ChartJSNodeCanvas) {
      throw new Error("Chart generation not available - chartjs-node-canvas not installed");
    }

    // Create trace builder
    const trace = createTraceBuilder(
      ctx.psurCaseId,
      this.agentId,
      this.config.agentType,
      "CHART"
    );
    trace.setInput({
      chartType: this.chartType,
      chartTitle: input.chartTitle,
      style: input.style,
      atomCount: input.atoms.length,
    });

    await this.logTrace("EVIDENCE_ATOM_CREATED" as any, "INFO", "CHART", this.chartType, {
      chartTitle: input.chartTitle,
      style: input.style,
      atomCount: input.atoms.length,
    });

    const width = input.width || 800;
    const height = input.height || 400;
    const theme = CHART_THEMES[input.style];

    // Initialize canvas
    this.chartCanvas = new ChartJSNodeCanvas({
      width,
      height,
      backgroundColour: theme.backgroundColor,
    });

    // Generate chart configuration
    const chartConfig = await this.generateChartConfig(input, theme);
    
    // Render to PNG buffer
    const imageBuffer = await this.chartCanvas.renderToBuffer(chartConfig);

    const dataPointCount = this.countDataPoints(chartConfig);

    trace.setOutput({
      width,
      height,
      dataPointCount,
      mimeType: "image/png",
    });

    await trace.commit(
      dataPointCount > 0 ? "PASS" : "PARTIAL",
      dataPointCount > 0 ? 0.9 : 0.5,
      `Generated ${this.chartType} chart with ${dataPointCount} data points`
    );

    await this.logTrace("SLOT_CONTENT_GENERATED" as any, "PASS", "CHART", this.chartType, {
      width,
      height,
      dataPointCount,
    });

    return {
      imageBuffer,
      width,
      height,
      mimeType: "image/png",
      chartType: this.chartType,
      dataPointCount,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Generate the Chart.js configuration object
   */
  protected abstract generateChartConfig(
    input: ChartInput,
    theme: typeof CHART_THEMES[DocumentStyle]
  ): Promise<any>;

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  protected getValue(data: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
      const val = data?.[key];
      if (val !== undefined && val !== null && val !== "") return val;
    }
    return null;
  }

  protected countDataPoints(config: any): number {
    try {
      const datasets = config.data?.datasets || [];
      return datasets.reduce((sum: number, ds: any) => sum + (ds.data?.length || 0), 0);
    } catch {
      return 0;
    }
  }

  protected getBaseChartOptions(theme: typeof CHART_THEMES[DocumentStyle], title: string): any {
    return {
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: title,
          color: theme.textColor,
          font: {
            family: theme.fontFamily,
            size: 16,
            weight: "bold",
          },
        },
        legend: {
          labels: {
            color: theme.textColor,
            font: {
              family: theme.fontFamily,
              size: 12,
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: theme.textColor,
            font: { family: theme.fontFamily },
          },
          grid: {
            color: theme.gridColor,
          },
        },
        y: {
          ticks: {
            color: theme.textColor,
            font: { family: theme.fontFamily },
          },
          grid: {
            color: theme.gridColor,
          },
        },
      },
    };
  }

  protected calculateConfidence(output: ChartOutput): number {
    if (output.dataPointCount === 0) return 0.5;
    if (output.dataPointCount < 5) return 0.7;
    return 0.9;
  }
}
