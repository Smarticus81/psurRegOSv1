/**
 * SOTA Base Chart Agent
 * 
 * Foundation for all chart generator agents using pure SVG generation.
 * SVG is converted to PNG for DOCX embedding via Puppeteer.
 * Generates high-quality vector graphics suitable for regulatory documents.
 */

import { BaseAgent, AgentConfig, AgentContext, createAgentConfig } from "../../baseAgent";
import { createTraceBuilder } from "../../../services/compileTraceRepository";
import { SVGChartGenerator, ChartConfig, ChartOutput as SVGChartOutput, DocumentStyle as SVGDocStyle, DataSeries } from "./svgChartGenerator";
import * as puppeteer from "puppeteer";

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
  svg: string;
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
// STYLE THEMES (kept for backward compatibility)
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

    console.log(`[${this.agentId}] Generating SOTA chart: ${this.chartType}`);

    const width = input.width || 800;
    const height = input.height || 400;
    const theme = CHART_THEMES[input.style];

    // Generate chart configuration using abstract method
    const chartConfig = await this.generateChartConfig(input, theme);

    // Use SOTA SVG generator
    const generator = new SVGChartGenerator({
      ...chartConfig,
      width,
      height,
      style: input.style as SVGDocStyle,
    });

    const result = generator.generate();

    // Convert SVG to PNG using Puppeteer for DOCX embedding
    let pngBuffer: Buffer;
    try {
      pngBuffer = await this.convertSvgToPng(result.svg, width, height);
      console.log(`[${this.agentId}] SVG converted to PNG: ${pngBuffer.length} bytes`);
    } catch (convErr) {
      console.warn(`[${this.agentId}] PNG conversion failed, using SVG fallback:`, convErr);
      // Fallback to SVG buffer if PNG conversion fails
      pngBuffer = Buffer.from(result.svg, "utf-8");
    }

    trace.setOutput({
      width: result.width,
      height: result.height,
      dataPointCount: result.dataPointCount,
      mimeType: "image/png",
    });

    await trace.commit(
      result.dataPointCount > 0 ? "PASS" : "PARTIAL",
      result.dataPointCount > 0 ? 0.9 : 0.5,
      `Generated SOTA ${this.chartType} chart with ${result.dataPointCount} data points`
    );

    console.log(`[${this.agentId}] SOTA chart generated: ${result.dataPointCount} data points`);

    return {
      svg: result.svg,
      imageBuffer: pngBuffer,
      width: result.width,
      height: result.height,
      mimeType: "image/png",
      chartType: this.chartType,
      dataPointCount: result.dataPointCount,
    };
  }

  /**
   * Convert SVG to PNG using Puppeteer for DOCX embedding
   */
  private async convertSvgToPng(svg: string, width: number, height: number): Promise<Buffer> {
    let browser: puppeteer.Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 2 }); // 2x for retina quality

      // Create an HTML page with the SVG
      const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; }
    body { width: ${width}px; height: ${height}px; background: white; }
    svg { display: block; }
  </style>
</head>
<body>${svg}</body>
</html>`;

      await page.setContent(html, { waitUntil: "networkidle0" });

      // Take screenshot as PNG
      const screenshot = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width, height },
        omitBackground: false,
      });

      return Buffer.from(screenshot);
    } finally {
      if (browser) {
        // Graceful cleanup with retry for Windows file locking
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await new Promise(resolve => setTimeout(resolve, 100 * attempt));
            await browser.close();
            break;
          } catch {
            if (attempt === 3) {
              try { browser.disconnect(); } catch { /* ignore */ }
            }
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Generate the chart configuration object
   * Subclasses implement this to transform evidence atoms into chart data
   */
  protected abstract generateChartConfig(
    input: ChartInput,
    theme: typeof CHART_THEMES[DocumentStyle]
  ): Promise<Omit<ChartConfig, "width" | "height" | "style">>;

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

  protected countDataPoints(series: DataSeries[]): number {
    return series.reduce((sum, s) => sum + s.data.length, 0);
  }

  protected extractPeriod(dateStr: string): string | null {
    if (!dateStr) return null;

    // Normalize
    const norm = String(dateStr).trim().replace(/_/g, " ").replace(/-/g, " ");

    // Check for Quarter formats: "2023 Q1", "Q1 2023"
    const qMatch = norm.match(/(\d{4}).*?Q([1-4])/i) || norm.match(/Q([1-4]).*?(\d{4})/i);
    if (qMatch) {
      const year = qMatch[1].length === 4 ? qMatch[1] : qMatch[2];
      const quarter = qMatch[1].length === 4 ? qMatch[2] : qMatch[1];
      // Map Q1->01, Q2->04, Q3->07, Q4->10
      const startMonth = (parseInt(quarter) - 1) * 3 + 1;
      return `${year}-${String(startMonth).padStart(2, "0")}`;
    }

    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    } catch {
      return null;
    }
  }

  protected calculateConfidence(output: ChartOutput): number {
    if (output.dataPointCount === 0) return 0.5;
    if (output.dataPointCount < 5) return 0.7;
    return 0.9;
  }
}
