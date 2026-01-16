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
}
