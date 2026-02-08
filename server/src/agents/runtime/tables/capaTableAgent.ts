/**
 * CAPA Table Agent
 * 
 * SOTA agent for generating Corrective and Preventive Action tables.
 */

import { BaseTableAgent, TableInput, TableOutput, TableEvidenceAtom } from "./baseTableAgent";
import { getCanonicalMetrics } from "../../../services/canonicalMetricsService";

export class CAPATableAgent extends BaseTableAgent {
  protected readonly tableType = "CAPA";
  protected readonly defaultColumns = ["CAPA ID", "Trigger", "Root Cause", "Actions", "Effectiveness", "Status"];

  constructor() {
    super(
      "CAPATableAgent",
      "CAPA Table Agent"
    );
  }

  protected filterRelevantAtoms(atoms: TableEvidenceAtom[]): TableEvidenceAtom[] {
    return atoms.filter(a => 
      ["capa_record", "capa_summary", "ncr_record", "corrective_action_record"].includes(a.evidenceType)
    );
  }

  protected async generateTable(input: TableInput, atoms: TableEvidenceAtom[]): Promise<TableOutput> {
    const columns = this.defaultColumns;
    const atomIds: string[] = [];
    const rows: string[][] = [];

    // Sort by open date, most recent first
    const sortedAtoms = [...atoms].sort((a, b) => {
      const dateA = new Date(String(this.getValue(a.normalizedData, "open_date", "openDate", "created_date") || ""));
      const dateB = new Date(String(this.getValue(b.normalizedData, "open_date", "openDate", "created_date") || ""));
      return dateB.getTime() - dateA.getTime();
    });

    for (const atom of sortedAtoms) {
      const data = atom.normalizedData;
      
      const capaId = String(this.getValue(data, "capa_id", "capaId", "id", "reference") || atom.atomId.substring(0, 15));
      const trigger = String(this.getValue(data, "trigger", "source", "origin", "trigger_event") || "-");
      const rootCause = String(this.getValue(data, "root_cause", "rootCause", "cause") || "-");
      const actions = String(this.getValue(data, "actions", "corrective_action", "correctiveAction", "action_taken") || "-");
      const effectiveness = String(this.getValue(data, "effectiveness", "effectiveness_verification", "verification_result") || "-");
      const status = String(this.getValue(data, "status", "state") || "-");

      rows.push([
        capaId,
        this.truncate(trigger, 35),
        this.truncate(rootCause, 35),
        this.truncate(actions, 35),
        this.truncate(effectiveness, 25),
        status,
      ]);

      atomIds.push(atom.atomId);
    }

    // Add summary row — cross-reference with canonical metrics for consistency
    const ctx = input.context;
    const metrics = getCanonicalMetrics(
      ctx.psurCaseId || 0,
      input.atoms.map(a => ({
        atomId: a.atomId,
        evidenceType: a.evidenceType,
        normalizedData: a.normalizedData as Record<string, unknown>,
      })),
      ctx.periodStart,
      ctx.periodEnd
    );

    const openCount = rows.filter(r => 
      r[5].toLowerCase().includes("open") || 
      r[5].toLowerCase().includes("progress")
    ).length;
    const closedCount = rows.filter(r => 
      r[5].toLowerCase().includes("closed") || 
      r[5].toLowerCase().includes("completed")
    ).length;
    
    if (rows.length > 0) {
      rows.push([
        `**TOTAL: ${rows.length}**`,
        "-",
        "-",
        "-",
        "-",
        `Open: ${openCount}, Closed: ${closedCount}`,
      ]);
    }

    // Generate markdown
    const markdownLines = [
      `| ${columns.join(" | ")} |`,
      `| ${columns.map(() => "---").join(" | ")} |`,
      ...rows.map(row => `| ${row.join(" | ")} |`),
    ];

    return {
      markdown: markdownLines.join("\n"),
      evidenceAtomIds: Array.from(new Set(atomIds)),
      rowCount: rows.length - 1,
      columns,
      dataSourceFooter: `Data Source: ${atomIds.length} CAPA records.`,
      docxTable: {
        headers: columns,
        rows,
        headerStyle: "corporate",
        alternatingRows: true,
      },
    };
  }
}
