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
    
    // Check for negative evidence (confirmed zero data)
    const negativeEvidence = relevantAtoms.find(a => 
      a.normalizedData.isNegativeEvidence === true
    );

    let result: TableOutput;

    if (negativeEvidence) {
      // Generate "no data" table
      result = this.generateNoDataTable(input, negativeEvidence);
    } else if (relevantAtoms.length === 0) {
      // Generate empty table with gap notice
      result = this.generateEmptyTable(input);
      trace.addGap(`No ${this.tableType} data available`);
    } else {
      // Generate full table with LLM assistance for formatting
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

  protected formatDate(value: unknown): string {
    if (!value) return "-";
    const str = String(value);
    try {
      const date = new Date(str);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }
    } catch {
      // Fall through
    }
    return str.substring(0, 10);
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
