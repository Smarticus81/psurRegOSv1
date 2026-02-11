/**
 * Base Table Agent
 * 
 * Foundation for all SOTA table generator agents.
 * Provides common functionality for PSUR table generation with LLM assistance.
 */

import { BaseAgent, AgentConfig, AgentContext, createAgentConfig } from "../../baseAgent";
import { createTraceBuilder } from "../../../services/compileTraceRepository";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TableSlotInput {
  slot_id: string;
  title: string;
  section_path: string;
  output_requirements?: {
    table_schema?: {
      columns: { name: string; type: string }[];
      primary_key?: string[];
    };
  };
}

export interface TableEvidenceAtom {
  atomId: string;
  evidenceType: string;
  normalizedData: Record<string, unknown>;
}

export interface TableInput {
  slot: TableSlotInput;
  atoms: TableEvidenceAtom[];
  context: {
    deviceCode: string;
    periodStart: string;
    periodEnd: string;
    psurCaseId?: number; // Required for canonical metrics lookup
  };
}

export interface TableOutput {
  markdown: string;
  evidenceAtomIds: string[];
  rowCount: number;
  columns: string[];
  dataSourceFooter: string;
  docxTable?: DocxTableDefinition;
}

export interface DocxTableDefinition {
  headers: string[];
  rows: string[][];
  headerStyle: "corporate" | "regulatory" | "premium";
  alternatingRows: boolean;
}

export interface TableAgentContext extends AgentContext {
  slotId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BASE TABLE AGENT
// ═══════════════════════════════════════════════════════════════════════════════

export abstract class BaseTableAgent extends BaseAgent<TableInput, TableOutput> {
  protected abstract readonly tableType: string;
  protected abstract readonly defaultColumns: string[];

  constructor(
    agentType: string,
    agentName: string,
    config?: Partial<AgentConfig>
  ) {
    super(createAgentConfig(agentType, agentName, {
      llm: {
        provider: "auto",
        temperature: 0.1, // Low temperature for consistent formatting
        maxTokens: 4096,
      },
      behavior: {
        confidenceThreshold: 0.8,
        maxRetries: 2,
        retryDelayMs: 500,
        timeoutMs: 120000,
      },
      ...config,
    }));
  }

  protected async execute(input: TableInput): Promise<TableOutput> {
    const ctx = this.context as TableAgentContext;
    
    // Create trace builder
    const trace = createTraceBuilder(
      ctx.psurCaseId,
      this.agentId,
      this.config.agentType,
      "TABLE"
    );
    trace.setSlot(input.slot.slot_id);
    trace.setInput({
      slotTitle: input.slot.title,
      atomCount: input.atoms.length,
      atomTypes: Array.from(new Set(input.atoms.map(a => a.evidenceType))),
    });

    await this.logTrace("FIELD_MAPPED" as any, "INFO", "SLOT", input.slot.slot_id, {
      slotTitle: input.slot.title,
      tableType: this.tableType,
      atomCount: input.atoms.length,
    });

    // Filter relevant atoms
    const relevantAtoms = this.filterRelevantAtoms(input.atoms);
    
    // Separate negative evidence from real data
    const negativeEvidenceAtoms = relevantAtoms.filter(a => 
      a.normalizedData.isNegativeEvidence === true
    );
    const realDataAtoms = relevantAtoms.filter(a => 
      a.normalizedData.isNegativeEvidence !== true
    );

    let result: TableOutput;

    if (realDataAtoms.length > 0) {
      // Generate full table with real data (ignore negative evidence)
      result = await this.generateTable(input, realDataAtoms);
    } else if (negativeEvidenceAtoms.length > 0) {
      // Only negative evidence - generate "no data" table (confirmed zero)
      result = this.generateNoDataTable(input, negativeEvidenceAtoms[0]);
    } else if (relevantAtoms.length === 0) {
      // No relevant atoms at all - generate empty table with gap notice
      result = this.generateEmptyTable(input);
      trace.addGap(`No ${this.tableType} data available`);
    } else {
      // Fallback - should not reach here, but generate full table
      result = await this.generateTable(input, relevantAtoms);
    }

    trace.setOutput({
      rowCount: result.rowCount,
      columnCount: result.columns.length,
      hasDocxDefinition: !!result.docxTable,
    });
    trace.addEvidence(result.evidenceAtomIds);

    await trace.commit(
      result.rowCount > 0 ? "PASS" : "PARTIAL",
      result.rowCount > 0 ? 0.9 : 0.5,
      `Generated ${this.tableType} table with ${result.rowCount} rows`
    );

    await this.logTrace("SLOT_CONTENT_GENERATED" as any, "PASS", "SLOT", input.slot.slot_id, {
      rowCount: result.rowCount,
      columns: result.columns,
    });

    // ═══════════════════════════════════════════════════════════════════════════════
    // CONTENT TRACING - Trace every table row
    // ═══════════════════════════════════════════════════════════════════════════════
    await this.traceTableRows(input, result, relevantAtoms);

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ABSTRACT METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Filter atoms relevant to this table type
   */
  protected abstract filterRelevantAtoms(atoms: TableEvidenceAtom[]): TableEvidenceAtom[];

  /**
   * Generate the full table from relevant atoms
   */
  protected abstract generateTable(input: TableInput, atoms: TableEvidenceAtom[]): Promise<TableOutput>;

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  protected generateNoDataTable(input: TableInput, negativeAtom: TableEvidenceAtom): TableOutput {
    const columns = this.defaultColumns;
    const markdown = [
      `| ${columns.join(" | ")} |`,
      `| ${columns.map(() => "---").join(" | ")} |`,
      `| **None Reported** | ${columns.slice(1).map(() => "N/A").join(" | ")} |`,
    ].join("\n");

    return {
      markdown,
      evidenceAtomIds: [negativeAtom.atomId],
      rowCount: 1,
      columns,
      dataSourceFooter: `Data Source: Negative Evidence [${negativeAtom.atomId.substring(0, 15)}] - Confirmed zero records`,
      docxTable: {
        headers: columns,
        rows: [["None Reported", ...columns.slice(1).map(() => "N/A")]],
        headerStyle: "regulatory",
        alternatingRows: false,
      },
    };
  }

  protected generateEmptyTable(input: TableInput): TableOutput {
    const columns = this.defaultColumns;
    const markdown = [
      `| ${columns.join(" | ")} |`,
      `| ${columns.map(() => "---").join(" | ")} |`,
      `| *No data available* | ${columns.slice(1).map(() => "-").join(" | ")} |`,
    ].join("\n");

    return {
      markdown,
      evidenceAtomIds: [],
      rowCount: 0,
      columns,
      dataSourceFooter: "Data Source: No evidence atoms uploaded",
      docxTable: {
        headers: columns,
        rows: [["No data available", ...columns.slice(1).map(() => "-")]],
        headerStyle: "regulatory",
        alternatingRows: false,
      },
    };
  }

  protected getValue(data: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
      const val = data?.[key];
      if (val !== undefined && val !== null && val !== "") return val;
    }
    return null;
  }

  protected formatNumber(value: unknown): string {
    const num = Number(value);
    if (isNaN(num)) return String(value || "-");
    return num.toLocaleString();
  }

  /**
   * SOTA date parsing with multi-format support.
   * Handles: Excel serial dates (1900/1904 systems), ISO strings, Unix timestamps,
   * locale formats, and partial dates.
   */
  protected formatDate(value: unknown): string {
    if (!value) return "-";
    
    // Already a Date object (from xlsx with cellDates: true)
    if (value instanceof Date) {
      if (!isNaN(value.getTime()) && this.isReasonableDate(value)) {
        return value.toISOString().split("T")[0];
      }
    }
    
    const numValue = Number(value);
    
    // Excel serial date detection (Windows 1900 system: 1-60000+, Mac 1904 system: -1462 to 58538)
    // Excel stores dates as days since epoch, with optional fractional time component
    if (!isNaN(numValue) && Math.abs(numValue) < 100000) {
      const date = this.excelSerialToDate(numValue);
      if (date && this.isReasonableDate(date)) {
        return date.toISOString().split("T")[0];
      }
    }
    
    // Unix timestamp detection (seconds since 1970-01-01)
    // Valid range: ~946684800 (2000-01-01) to ~1893456000 (2030-01-01)
    if (!isNaN(numValue) && numValue > 946684800 && numValue < 2000000000) {
      const date = new Date(numValue * 1000);
      if (this.isReasonableDate(date)) {
        return date.toISOString().split("T")[0];
      }
    }
    
    // Unix timestamp in milliseconds
    if (!isNaN(numValue) && numValue > 946684800000 && numValue < 2000000000000) {
      const date = new Date(numValue);
      if (this.isReasonableDate(date)) {
        return date.toISOString().split("T")[0];
      }
    }
    
    const str = String(value).trim();
    
    // ISO 8601 format (most reliable)
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const date = new Date(str);
      if (!isNaN(date.getTime()) && this.isReasonableDate(date)) {
        return date.toISOString().split("T")[0];
      }
    }
    
    // Common date formats: DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY
    const datePatterns = [
      { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, dayIdx: 0, monthIdx: 1, yearIdx: 2 }, // US: MM/DD/YYYY
      { regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, dayIdx: 0, monthIdx: 1, yearIdx: 2 }, // EU: DD.MM.YYYY
      { regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, dayIdx: 2, monthIdx: 1, yearIdx: 0 }, // YYYY/MM/DD
    ];
    
    for (const pattern of datePatterns) {
      const match = str.match(pattern.regex);
      if (match) {
        const parts = [match[1], match[2], match[3]].map(Number);
        // Heuristic: if first number > 12, it's likely day-first format
        const isEuropean = parts[0] > 12 && parts[1] <= 12;
        const day = isEuropean ? parts[0] : parts[pattern.dayIdx];
        const month = isEuropean ? parts[1] : parts[pattern.monthIdx];
        const year = parts[pattern.yearIdx];
        
        if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          const date = new Date(year, month - 1, day);
          if (this.isReasonableDate(date)) {
            return date.toISOString().split("T")[0];
          }
        }
      }
    }
    
    // Last resort: try native Date parsing
    try {
      const date = new Date(str);
      if (!isNaN(date.getTime()) && this.isReasonableDate(date)) {
        return date.toISOString().split("T")[0];
      }
    } catch {
      // Fall through
    }
    
    // Return first 10 chars if looks like a date, otherwise "-"
    return str.length >= 10 && /\d/.test(str) ? str.substring(0, 10) : "-";
  }

  /**
   * Convert Excel serial date number to JavaScript Date.
   * Handles both Windows 1900 system and Mac 1904 system.
   */
  private excelSerialToDate(serial: number, use1904System = false): Date | null {
    if (serial < -1500 || serial > 100000) return null;
    
    // Excel 1900 system has a leap year bug: it treats 1900 as a leap year
    // Serial 1 = January 1, 1900 (in 1900 system)
    // Serial 60 = February 29, 1900 (doesn't exist, but Excel thinks it does)
    // Serial 61 = March 1, 1900
    
    let epoch: Date;
    if (use1904System) {
      // Mac Excel 1904 system: Serial 0 = January 1, 1904
      epoch = new Date(Date.UTC(1904, 0, 1));
    } else {
      // Windows Excel 1900 system: Serial 1 = January 1, 1900
      // We use Dec 30, 1899 as base because:
      // - Serial 1 should be Jan 1, 1900
      // - Dec 30, 1899 + 1 day = Dec 31, 1899? No, we need to account for the bug
      epoch = new Date(Date.UTC(1899, 11, 30));
    }
    
    // Handle the 1900 leap year bug for dates after Feb 28, 1900
    let adjustedSerial = serial;
    if (!use1904System && serial > 60) {
      // Subtract 1 to account for the phantom Feb 29, 1900
      adjustedSerial = serial;
    }
    
    const msPerDay = 24 * 60 * 60 * 1000;
    const resultMs = epoch.getTime() + adjustedSerial * msPerDay;
    
    return new Date(resultMs);
  }

  /**
   * Validate that a date falls within a reasonable range for PSUR data.
   */
  private isReasonableDate(date: Date): boolean {
    const year = date.getFullYear();
    return !isNaN(date.getTime()) && year >= 1990 && year <= 2100;
  }

  protected truncate(value: unknown, maxLength: number = 50): string {
    const str = String(value || "-");
    return str.length > maxLength ? str.substring(0, maxLength - 3) + "..." : str;
  }

  protected calculateConfidence(output: TableOutput): number {
    if (output.rowCount === 0) return 0.5;
    if (output.rowCount < 5) return 0.7;
    return 0.9;
  }

  /**
   * Trace every row in the generated table
   */
  protected async traceTableRows(
    input: TableInput,
    result: TableOutput,
    atoms: TableEvidenceAtom[]
  ): Promise<void> {
    if (!result.docxTable || result.rowCount === 0) return;

    const traceItems: Array<Parameters<typeof this.traceContent>[0]> = [];

    // Map atoms by ID for quick lookup
    const atomMap = new Map(atoms.map(a => [a.atomId, a]));

    for (let rowIndex = 0; rowIndex < result.docxTable.rows.length; rowIndex++) {
      const row = result.docxTable.rows[rowIndex];
      const rowPreview = row.join(" | ");

      // Try to match this row to an evidence atom
      const matchedAtom = atoms[rowIndex] || atoms.find(a => {
        const atomData = Object.values(a.normalizedData).join(" ").toLowerCase();
        return row.some(cell => atomData.includes(String(cell).toLowerCase().substring(0, 20)));
      });

      // Trace each row
      traceItems.push({
        slotId: input.slot.slot_id,
        slotTitle: input.slot.title,
        contentType: "table_row",
        contentId: `${input.slot.slot_id}-row${rowIndex + 1}`,
        contentIndex: rowIndex + 1,
        contentPreview: rowPreview.substring(0, 500),
        rationale: `Row ${rowIndex + 1} of ${this.tableType} table: ${result.docxTable.headers[0]} = "${row[0]}"`,
        methodology: `Extracted from ${matchedAtom?.evidenceType || this.tableType} evidence record and formatted per regulatory table schema (${result.columns.length} columns).`,
        standardReference: input.slot.output_requirements?.table_schema 
          ? `Table schema: ${result.columns.join(", ")}` 
          : undefined,
        evidenceType: matchedAtom?.evidenceType || this.tableType,
        atomIds: matchedAtom ? [matchedAtom.atomId] : undefined,
      });

      // Also trace individual cells for calculations if present
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const cellValue = row[colIndex];
        const header = result.docxTable.headers[colIndex];
        
        // Check if this looks like a calculation
        const isNumeric = !isNaN(Number(String(cellValue).replace(/,/g, "")));
        const isCalculation = isNumeric && (
          header.toLowerCase().includes("total") ||
          header.toLowerCase().includes("rate") ||
          header.toLowerCase().includes("count") ||
          header.toLowerCase().includes("sum") ||
          header.toLowerCase().includes("average") ||
          header.toLowerCase().includes("%") ||
          header.toLowerCase().includes("percentage")
        );

        if (isCalculation) {
          traceItems.push({
            slotId: input.slot.slot_id,
            slotTitle: input.slot.title,
            contentType: "calculation",
            contentId: `${input.slot.slot_id}-row${rowIndex + 1}-col${colIndex + 1}`,
            contentIndex: rowIndex * 100 + colIndex + 1,
            contentPreview: `${header}: ${cellValue}`,
            rationale: `Calculated value for ${header} in row ${rowIndex + 1}.`,
            methodology: `Derived from evidence data using ${this.getCalculationType(header)} calculation.`,
            evidenceType: matchedAtom?.evidenceType || this.tableType,
            atomIds: matchedAtom ? [matchedAtom.atomId] : undefined,
            calculationType: this.getCalculationType(header),
            calculationFormula: `${header} = aggregated value`,
            calculationInputs: { column: header, row: rowIndex + 1, value: cellValue },
          });
        }
      }
    }

    // Batch trace all rows
    if (traceItems.length > 0) {
      await this.traceContentBatch(traceItems);
    }
  }

  private getCalculationType(header: string): "average" | "sum" | "percentage" | "count" | "ratio" | "other" {
    const h = header.toLowerCase();
    if (h.includes("average") || h.includes("mean")) return "average";
    if (h.includes("total") || h.includes("sum")) return "sum";
    if (h.includes("%") || h.includes("percent") || h.includes("rate")) return "percentage";
    if (h.includes("count") || h.includes("number")) return "count";
    if (h.includes("ratio")) return "ratio";
    return "other";
  }
}
