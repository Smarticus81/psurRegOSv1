/**
 * Document Formatter Agent
 * 
 * SOTA agent for generating beautifully formatted DOCX documents.
 * Supports three style presets: Corporate Formal, Regulatory Minimal, Premium Modern.
 */

import { BaseAgent, AgentConfig, AgentContext, createAgentConfig } from "../baseAgent";
import { createTraceBuilder } from "../../services/compileTraceRepository";
import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  ShadingType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  TableOfContents,
  ImageRun,
  Packer,
  ITableCellOptions,
} from "docx";
import { CompiledSection, CompiledChart } from "./compileOrchestrator";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type DocumentStyle = "corporate" | "regulatory" | "premium";

export interface DocumentMetadata {
  psurCaseId: number;
  deviceCode: string;
  periodStart: string;
  periodEnd: string;
  templateId: string;
  generatedAt: string;
  companyName?: string;
  documentVersion?: string;
}

export interface DocumentFormatterInput {
  sections: CompiledSection[];
  charts: CompiledChart[];
  style: DocumentStyle;
  metadata: DocumentMetadata;
}

export interface FormattedDocument {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  pageCount: number;
  sectionCount: number;
  chartCount: number;
  style: DocumentStyle;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

interface StyleDefinition {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    background: string;
    headerBg: string;
    alternateBg: string;
    border: string;
  };
  fonts: {
    heading: string;
    body: string;
    table: string;
  };
  sizes: {
    h1: number;
    h2: number;
    h3: number;
    body: number;
    table: number;
    small: number;
  };
  tableStyle: {
    headerBold: boolean;
    alternatingRows: boolean;
    borderWidth: number;
    roundedCorners: boolean;
  };
}

const STYLE_DEFINITIONS: Record<DocumentStyle, StyleDefinition> = {
  corporate: {
    name: "Corporate Formal",
    colors: {
      primary: "1a365d",
      secondary: "2c5282",
      accent: "3182ce",
      text: "1a202c",
      background: "ffffff",
      headerBg: "e2e8f0",
      alternateBg: "f7fafc",
      border: "cbd5e0",
    },
    fonts: {
      heading: "Arial",
      body: "Arial",
      table: "Arial",
    },
    sizes: {
      h1: 28,
      h2: 24,
      h3: 18,
      body: 11,
      table: 10,
      small: 9,
    },
    tableStyle: {
      headerBold: true,
      alternatingRows: true,
      borderWidth: 1,
      roundedCorners: false,
    },
  },
  regulatory: {
    name: "Regulatory Minimal",
    colors: {
      primary: "000000",
      secondary: "333333",
      accent: "000000",
      text: "000000",
      background: "ffffff",
      headerBg: "ffffff",
      alternateBg: "ffffff",
      border: "000000",
    },
    fonts: {
      heading: "Times New Roman",
      body: "Times New Roman",
      table: "Times New Roman",
    },
    sizes: {
      h1: 24,
      h2: 20,
      h3: 16,
      body: 12,
      table: 11,
      small: 10,
    },
    tableStyle: {
      headerBold: true,
      alternatingRows: false,
      borderWidth: 1,
      roundedCorners: false,
    },
  },
  premium: {
    name: "Premium Modern",
    colors: {
      primary: "6b21a8",
      secondary: "7c3aed",
      accent: "8b5cf6",
      text: "1f2937",
      background: "ffffff",
      headerBg: "ede9fe",
      alternateBg: "faf5ff",
      border: "c4b5fd",
    },
    fonts: {
      heading: "Calibri",
      body: "Calibri",
      table: "Calibri",
    },
    sizes: {
      h1: 32,
      h2: 26,
      h3: 20,
      body: 11,
      table: 10,
      small: 9,
    },
    tableStyle: {
      headerBold: true,
      alternatingRows: true,
      borderWidth: 1,
      roundedCorners: true,
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT FORMATTER AGENT
// ═══════════════════════════════════════════════════════════════════════════════

export class DocumentFormatterAgent extends BaseAgent<DocumentFormatterInput, FormattedDocument> {
  private style!: StyleDefinition;

  constructor() {
    super(createAgentConfig("DocumentFormatterAgent", "Document Formatter Agent", {
      llm: {
        provider: "auto",
        temperature: 0.1,
        maxTokens: 1024,
      },
      behavior: {
        confidenceThreshold: 0.9,
        maxRetries: 2,
        retryDelayMs: 500,
        timeoutMs: 120000,
      },
    }));
  }

  protected async execute(input: DocumentFormatterInput): Promise<FormattedDocument> {
    const ctx = this.context as AgentContext;
    
    // Create trace builder
    const trace = createTraceBuilder(
      ctx.psurCaseId,
      this.agentId,
      this.config.agentType,
      "FORMAT"
    );
    trace.setInput({
      style: input.style,
      sectionCount: input.sections.length,
      chartCount: input.charts.length,
      metadata: input.metadata,
    });

    await this.logTrace("DOCUMENT_RENDERED" as any, "INFO", "DOCUMENT", input.style, {
      style: input.style,
      sectionCount: input.sections.length,
    });

    // Load style definition
    this.style = STYLE_DEFINITIONS[input.style];

    // Build document
    const doc = new Document({
      creator: "PSUR Generator",
      title: `Periodic Safety Update Report - ${input.metadata.deviceCode}`,
      description: `PSUR for device ${input.metadata.deviceCode}, period ${input.metadata.periodStart} to ${input.metadata.periodEnd}`,
      styles: this.buildStyles(),
      sections: [
        {
          headers: {
            default: this.buildHeader(input.metadata),
          },
          footers: {
            default: this.buildFooter(input.metadata),
          },
          children: [
            // Title page
            ...this.buildTitlePage(input.metadata),
            
            // Table of Contents
            new Paragraph({
              text: "Table of Contents",
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 400, after: 200 },
            }),
            new TableOfContents("Table of Contents", {
              hyperlink: true,
              headingStyleRange: "1-3",
            }),
            new Paragraph({
              children: [new PageBreak()],
            }),
            
            // Document content
            ...this.buildDocumentContent(input.sections, input.charts),
          ],
        },
      ],
    });

    // Pack document to buffer
    const buffer = await Packer.toBuffer(doc);
    const filename = `PSUR_${input.metadata.deviceCode}_${input.metadata.periodStart.replace(/-/g, "")}_${input.style}.docx`;

    trace.setOutput({
      filename,
      bufferSize: buffer.length,
      style: input.style,
    });

    await trace.commit(
      "PASS",
      0.95,
      `Generated ${this.style.name} DOCX with ${input.sections.length} sections`
    );

    await this.logTrace("BUNDLE_EXPORTED" as any, "PASS", "DOCUMENT", input.style, {
      filename,
      bufferSize: buffer.length,
    });

    return {
      buffer,
      filename,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pageCount: Math.ceil(input.sections.length * 1.5), // Estimate
      sectionCount: input.sections.length,
      chartCount: input.charts.length,
      style: input.style,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STYLE BUILDERS
  // ═══════════════════════════════════════════════════════════════════════════════

  private buildStyles() {
    return {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          basedOn: "Normal",
          run: {
            font: this.style.fonts.body,
            size: this.style.sizes.body * 2,
            color: this.style.colors.text,
          },
          paragraph: {
            spacing: { line: 276, before: 0, after: 200 },
          },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            font: this.style.fonts.heading,
            size: this.style.sizes.h1 * 2,
            bold: true,
            color: this.style.colors.primary,
          },
          paragraph: {
            spacing: { before: 400, after: 200 },
          },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            font: this.style.fonts.heading,
            size: this.style.sizes.h2 * 2,
            bold: true,
            color: this.style.colors.secondary,
          },
          paragraph: {
            spacing: { before: 300, after: 150 },
          },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            font: this.style.fonts.heading,
            size: this.style.sizes.h3 * 2,
            bold: true,
            color: this.style.colors.text,
          },
          paragraph: {
            spacing: { before: 200, after: 100 },
          },
        },
      ],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PAGE COMPONENT BUILDERS
  // ═══════════════════════════════════════════════════════════════════════════════

  private buildHeader(metadata: DocumentMetadata): Header {
    return new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({
              text: `PSUR - ${metadata.deviceCode}`,
              font: this.style.fonts.body,
              size: this.style.sizes.small * 2,
              color: this.style.colors.secondary,
            }),
            new TextRun({
              text: `  |  Period: ${metadata.periodStart} to ${metadata.periodEnd}`,
              font: this.style.fonts.body,
              size: this.style.sizes.small * 2,
              color: this.style.colors.secondary,
            }),
          ],
        }),
      ],
    });
  }

  private buildFooter(metadata: DocumentMetadata): Footer {
    return new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: `Generated: ${metadata.generatedAt}`,
              font: this.style.fonts.body,
              size: this.style.sizes.small * 2,
              color: this.style.colors.secondary,
            }),
            new TextRun({
              text: "  |  Page ",
              font: this.style.fonts.body,
              size: this.style.sizes.small * 2,
              color: this.style.colors.secondary,
            }),
            new TextRun({
              children: [PageNumber.CURRENT],
              font: this.style.fonts.body,
              size: this.style.sizes.small * 2,
              color: this.style.colors.secondary,
            }),
            new TextRun({
              text: " of ",
              font: this.style.fonts.body,
              size: this.style.sizes.small * 2,
              color: this.style.colors.secondary,
            }),
            new TextRun({
              children: [PageNumber.TOTAL_PAGES],
              font: this.style.fonts.body,
              size: this.style.sizes.small * 2,
              color: this.style.colors.secondary,
            }),
          ],
        }),
      ],
    });
  }

  private buildTitlePage(metadata: DocumentMetadata): Paragraph[] {
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 2000 },
        children: [
          new TextRun({
            text: "PERIODIC SAFETY UPDATE REPORT",
            font: this.style.fonts.heading,
            size: this.style.sizes.h1 * 2.5,
            bold: true,
            color: this.style.colors.primary,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
        children: [
          new TextRun({
            text: "(PSUR)",
            font: this.style.fonts.heading,
            size: this.style.sizes.h2 * 2,
            color: this.style.colors.secondary,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600 },
        children: [
          new TextRun({
            text: `Device: ${metadata.deviceCode}`,
            font: this.style.fonts.body,
            size: this.style.sizes.h3 * 2,
            color: this.style.colors.text,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
        children: [
          new TextRun({
            text: `Reporting Period: ${metadata.periodStart} to ${metadata.periodEnd}`,
            font: this.style.fonts.body,
            size: this.style.sizes.body * 2,
            color: this.style.colors.text,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600 },
        children: [
          new TextRun({
            text: metadata.companyName || "Medical Device Manufacturer",
            font: this.style.fonts.body,
            size: this.style.sizes.body * 2,
            bold: true,
            color: this.style.colors.text,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200 },
        children: [
          new TextRun({
            text: `Document Version: ${metadata.documentVersion || "1.0"}`,
            font: this.style.fonts.body,
            size: this.style.sizes.small * 2,
            color: this.style.colors.secondary,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100 },
        children: [
          new TextRun({
            text: `Template: ${metadata.templateId}`,
            font: this.style.fonts.body,
            size: this.style.sizes.small * 2,
            color: this.style.colors.secondary,
          }),
        ],
      }),
      new Paragraph({
        children: [new PageBreak()],
      }),
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONTENT BUILDERS
  // ═══════════════════════════════════════════════════════════════════════════════

  private buildDocumentContent(sections: CompiledSection[], charts: CompiledChart[]): (Paragraph | Table)[] {
    const content: (Paragraph | Table)[] = [];
    let lastSectionPath = "";

    for (const section of sections) {
      // Add section heading
      const pathParts = section.sectionPath.split(".");
      const headingLevel = Math.min(pathParts.length, 3) as 1 | 2 | 3;

      // Check if we need a major section break
      if (pathParts[0] !== lastSectionPath.split(".")[0]) {
        content.push(new Paragraph({ children: [new PageBreak()] }));
      }
      lastSectionPath = section.sectionPath;

      // Section heading
      content.push(
        new Paragraph({
          text: `${section.sectionPath} ${section.title}`,
          heading: headingLevel === 1 ? HeadingLevel.HEADING_1 : 
                   headingLevel === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        })
      );

      // Section content
      if (section.slotKind === "TABLE") {
        const table = this.buildTableFromMarkdown(section.content);
        if (table) {
          content.push(table);
        }
      } else {
        // Narrative content - split into paragraphs
        const paragraphs = section.content.split("\n\n").filter(p => p.trim());
        for (const para of paragraphs) {
          content.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: para.trim(),
                  font: this.style.fonts.body,
                  size: this.style.sizes.body * 2,
                }),
              ],
            })
          );
        }
      }

      // Add confidence note if low
      if (section.confidence < 0.7) {
        content.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `[Note: This section has lower confidence (${(section.confidence * 100).toFixed(0)}%) and may require manual review]`,
                font: this.style.fonts.body,
                size: this.style.sizes.small * 2,
                italics: true,
                color: "ff6600",
              }),
            ],
          })
        );
      }

      // Add evidence citation
      if (section.evidenceAtomIds.length > 0) {
        content.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Evidence Sources: ${section.evidenceAtomIds.slice(0, 5).map(id => id.substring(0, 15)).join(", ")}${section.evidenceAtomIds.length > 5 ? ` +${section.evidenceAtomIds.length - 5} more` : ""}`,
                font: this.style.fonts.body,
                size: this.style.sizes.small * 2,
                color: this.style.colors.secondary,
              }),
            ],
            spacing: { before: 100, after: 200 },
          })
        );
      }
    }

    // Add charts section if any
    if (charts.length > 0) {
      content.push(new Paragraph({ children: [new PageBreak()] }));
      content.push(
        new Paragraph({
          text: "Appendix: Visual Analytics",
          heading: HeadingLevel.HEADING_1,
        })
      );

      for (const chart of charts) {
        content.push(
          new Paragraph({
            text: chart.title,
            heading: HeadingLevel.HEADING_3,
          })
        );
        
        // Add chart image
        content.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: chart.imageBuffer,
                transformation: {
                  width: Math.min(chart.width, 600),
                  height: Math.min(chart.height, 400),
                },
                type: "png",
              }),
            ],
            alignment: AlignmentType.CENTER,
          })
        );
      }
    }

    return content;
  }

  private buildTableFromMarkdown(markdown: string): Table | null {
    const lines = markdown.trim().split("\n").filter(l => l.trim());
    if (lines.length < 2) return null;

    // Parse markdown table
    const rows: string[][] = [];
    for (const line of lines) {
      if (line.includes("---")) continue; // Skip separator row
      const cells = line
        .split("|")
        .map(c => c.trim())
        .filter(c => c !== "");
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length === 0) return null;

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Build table
    return new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      rows: [
        // Header row
        new TableRow({
          tableHeader: true,
          children: headers.map(header => 
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: header.replace(/\*\*/g, ""),
                      bold: this.style.tableStyle.headerBold,
                      font: this.style.fonts.table,
                      size: this.style.sizes.table * 2,
                      color: this.style.colors.primary,
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                }),
              ],
              shading: {
                type: ShadingType.SOLID,
                fill: this.style.colors.headerBg,
              },
              borders: {
                top: { style: BorderStyle.SINGLE, size: this.style.tableStyle.borderWidth * 8, color: this.style.colors.border },
                bottom: { style: BorderStyle.SINGLE, size: this.style.tableStyle.borderWidth * 8, color: this.style.colors.border },
                left: { style: BorderStyle.SINGLE, size: this.style.tableStyle.borderWidth * 8, color: this.style.colors.border },
                right: { style: BorderStyle.SINGLE, size: this.style.tableStyle.borderWidth * 8, color: this.style.colors.border },
              },
            } as ITableCellOptions)
          ),
        }),
        // Data rows
        ...dataRows.map((row, rowIdx) =>
          new TableRow({
            children: row.map((cell, cellIdx) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cell.replace(/\*\*/g, ""),
                        bold: cell.includes("**") || (rowIdx === dataRows.length - 1 && cell.toLowerCase().includes("total")),
                        font: this.style.fonts.table,
                        size: this.style.sizes.table * 2,
                        color: this.style.colors.text,
                      }),
                    ],
                    alignment: cellIdx === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
                  }),
                ],
                shading: this.style.tableStyle.alternatingRows && rowIdx % 2 === 1
                  ? { type: ShadingType.SOLID, fill: this.style.colors.alternateBg }
                  : undefined,
                borders: {
                  top: { style: BorderStyle.SINGLE, size: this.style.tableStyle.borderWidth * 4, color: this.style.colors.border },
                  bottom: { style: BorderStyle.SINGLE, size: this.style.tableStyle.borderWidth * 4, color: this.style.colors.border },
                  left: { style: BorderStyle.SINGLE, size: this.style.tableStyle.borderWidth * 4, color: this.style.colors.border },
                  right: { style: BorderStyle.SINGLE, size: this.style.tableStyle.borderWidth * 4, color: this.style.colors.border },
                },
              } as ITableCellOptions)
            ),
          })
        ),
      ],
    });
  }

  protected calculateConfidence(): number {
    return 0.95; // Document formatting is highly deterministic
  }
}
