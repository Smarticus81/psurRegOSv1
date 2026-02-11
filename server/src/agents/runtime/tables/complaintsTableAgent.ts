/**
 * Complaints Table Agent
 * 
 * SOTA agent for generating complaints by region/severity tables.
 * 
 * CRITICAL: Uses CanonicalMetricsService for denominator (total units) to
 * ensure rate calculations are consistent with other sections.
 * 
 * Features:
 * - Multi-dimensional grouping (region, severity, type)
 * - IMDRF code extraction and categorization
 * - Rate calculation with canonical denominator
 * - Severity normalization across different data sources
 * - Trend detection for complaint patterns
 * - Data quality scoring
 */

import { BaseTableAgent, TableInput, TableOutput, TableEvidenceAtom } from "./baseTableAgent";
import { getCanonicalMetrics } from "../../../services/canonicalMetricsService";

// Severity normalization map
const SEVERITY_NORMALIZATION: Record<string, string> = {
  "critical": "Critical",
  "severe": "Critical",
  "high": "High",
  "major": "High",
  "significant": "High",
  "medium": "Medium",
  "moderate": "Medium",
  "minor": "Low",
  "low": "Low",
  "minimal": "Low",
  "informational": "Informational",
  "info": "Informational",
  "feedback": "Informational",
  "unknown": "Unknown",
  "not specified": "Unknown",
  "n/a": "Unknown",
};

// Severity display order (most severe first)
const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low", "Informational", "Unknown"];

interface ComplaintAggregation {
  count: number;
  issues: Map<string, number>; // Issue type -> count
  imdrfCodes: Set<string>;
  dates: string[];
  outcomes: string[];
  atomIds: string[];
  hasSeriousOutcome: boolean;
}

export class ComplaintsTableAgent extends BaseTableAgent {
  protected readonly tableType = "COMPLAINTS";
  protected readonly defaultColumns = ["Region", "Severity", "Count", "Rate per 1,000", "Top Issue"];

  constructor() {
    super(
      "ComplaintsTableAgent",
      "Complaints Table Agent"
    );
  }

  protected filterRelevantAtoms(atoms: TableEvidenceAtom[]): TableEvidenceAtom[] {
    return atoms.filter(a => {
      const type = a.evidenceType.toLowerCase();
      
      // Explicit complaint types
      if ([
        "complaint_record", 
        "complaint_summary", 
        "complaints_by_region", 
        "complaints_by_type",
        "customer_complaint",
        "product_complaint",
        "quality_complaint"
      ].includes(a.evidenceType)) {
        return true;
      }
      
      // Type contains "complaint"
      if (type.includes("complaint")) return true;
      
      // Customer feedback that might be complaints
      if (type.includes("feedback") && !type.includes("positive")) return true;
      
      return false;
    });
  }

  /**
   * Normalize severity level for consistent grouping
   */
  private normalizeSeverity(raw: string): string {
    if (!raw) return "Unknown";
    const normalized = SEVERITY_NORMALIZATION[raw.toLowerCase().trim()];
    return normalized || "Unknown";
  }

  /**
   * Extract IMDRF code from various field formats
   */
  private extractImdrfCode(data: Record<string, unknown>): string | null {
    const fields = ["imdrf_code", "imdrfCode", "annex_code", "problem_code", "device_problem_code"];
    for (const field of fields) {
      const value = data[field];
      if (value && typeof value === "string" && value.match(/^[A-Z]\d{4}$/)) {
        return value;
      }
    }
    return null;
  }

  /**
   * Check if complaint resulted in serious outcome
   */
  private hasSeriousOutcome(data: Record<string, unknown>): boolean {
    const outcome = String(this.getValue(data, "patient_outcome", "outcome", "harm") || "").toLowerCase();
    const serious = String(this.getValue(data, "serious", "is_serious", "reportable") || "").toLowerCase();
    
    return (
      outcome.includes("death") ||
      outcome.includes("injury") ||
      outcome.includes("hospitalization") ||
      outcome.includes("intervention") ||
      serious === "true" ||
      serious === "yes" ||
      serious === "1"
    );
  }

  protected async generateTable(input: TableInput, atoms: TableEvidenceAtom[]): Promise<TableOutput> {
    const columns = this.defaultColumns;
    const atomIds: string[] = [];

    // Filter out negative evidence (confirmed zero complaints)
    const realComplaints = atoms.filter(a => 
      a.normalizedData?.isNegativeEvidence !== true
    );

    // Use CANONICAL METRICS for denominator - ensures consistency with other sections
    const ctx = input.context as typeof input.context & { psurCaseId?: number };
    const canonicalMetrics = getCanonicalMetrics(
      ctx.psurCaseId || 0,
      input.atoms,
      input.context.periodStart,
      input.context.periodEnd
    );
    const totalUnits = canonicalMetrics.sales.totalUnits.value;

    // Multi-dimensional aggregation: Region -> Severity -> ComplaintAggregation
    const grouped = new Map<string, Map<string, ComplaintAggregation>>();
    let totalSeriousCount = 0;
    
    for (const atom of realComplaints) {
      const data = atom.normalizedData;
      
      // Extract fields with fallbacks
      const region = String(this.getValue(data, "region", "country", "geography", "territory") || "Global");
      const rawSeverity = String(this.getValue(data, "severity", "seriousness", "severity_level", "priority") || "");
      const severity = this.normalizeSeverity(rawSeverity);
      
      const issue = String(this.getValue(data, 
        "description", "complaint_type", "issue", "complaint_description",
        "problem_description", "failure_mode", "device_problem"
      ) || "");
      
      const date = String(this.getValue(data, "date", "complaint_date", "reported_date", "event_date") || "");
      const outcome = String(this.getValue(data, "patient_outcome", "outcome", "result") || "");
      const imdrfCode = this.extractImdrfCode(data);
      const isSerious = this.hasSeriousOutcome(data);

      // Initialize region map
      if (!grouped.has(region)) {
        grouped.set(region, new Map());
      }
      const regionMap = grouped.get(region)!;
      
      // Initialize severity aggregation
      if (!regionMap.has(severity)) {
        regionMap.set(severity, {
          count: 0,
          issues: new Map(),
          imdrfCodes: new Set(),
          dates: [],
          outcomes: [],
          atomIds: [],
          hasSeriousOutcome: false,
        });
      }
      
      const agg = regionMap.get(severity)!;
      agg.count++;
      
      // Track issue types with counts
      if (issue) {
        const normalizedIssue = issue.substring(0, 50).trim();
        agg.issues.set(normalizedIssue, (agg.issues.get(normalizedIssue) || 0) + 1);
      }
      
      if (imdrfCode) agg.imdrfCodes.add(imdrfCode);
      if (date) agg.dates.push(date);
      if (outcome) agg.outcomes.push(outcome);
      if (isSerious) {
        agg.hasSeriousOutcome = true;
        totalSeriousCount++;
      }
      
      agg.atomIds.push(atom.atomId);
      atomIds.push(atom.atomId);
    }

    // Build rows - sorted by region, then severity order
    const rows: string[][] = [];
    const sortedRegions = Array.from(grouped.keys()).sort();
    
    for (const region of sortedRegions) {
      const regionMap = grouped.get(region)!;
      
      // Sort severities by defined order
      const severities = Array.from(regionMap.keys()).sort((a, b) => {
        const aIdx = SEVERITY_ORDER.indexOf(a);
        const bIdx = SEVERITY_ORDER.indexOf(b);
        return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
      });

      for (const severity of severities) {
        const agg = regionMap.get(severity)!;
        
        // Calculate rate per 1,000 units
        const rate = totalUnits > 0 
          ? ((agg.count / totalUnits) * 1000).toFixed(3)
          : "N/A";
        
        // Find top issue by count
        let topIssue = "-";
        let maxCount = 0;
        for (const [issue, count] of agg.issues.entries()) {
          if (count > maxCount) {
            maxCount = count;
            topIssue = issue;
          }
        }
        
        // Add IMDRF code if available
        if (agg.imdrfCodes.size > 0) {
          const codes = Array.from(agg.imdrfCodes).slice(0, 2).join(", ");
          topIssue = topIssue !== "-" ? `${topIssue} [${codes}]` : codes;
        }
        
        // Mark serious complaints
        const severityDisplay = agg.hasSeriousOutcome ? `${severity} *` : severity;

        rows.push([
          region,
          severityDisplay,
          String(agg.count),
          rate,
          this.truncate(topIssue, 45),
        ]);
      }
    }

    // Calculate totals
    const totalComplaints = realComplaints.length;
    const totalRate = totalUnits > 0 
      ? ((totalComplaints / totalUnits) * 1000).toFixed(3)
      : "N/A";
    
    if (rows.length > 0) {
      rows.push([
        "**TOTAL**",
        totalSeriousCount > 0 ? `**${totalSeriousCount} serious**` : "-",
        `**${totalComplaints}**`,
        `**${totalRate}**`,
        "-",
      ]);
    }

    // Generate markdown with proper alignment
    const markdownLines = [
      `| ${columns.join(" | ")} |`,
      `| :--- | :--- | ---: | ---: | :--- |`, // Align counts and rates right
      ...rows.map(row => `| ${row.join(" | ")} |`),
    ];

    // Build comprehensive footer
    const uniqueRegions = grouped.size;
    const denominatorNote = totalUnits > 0 
      ? `Denominator: ${totalUnits.toLocaleString()} units`
      : "Denominator: Not available (no sales data)";

    return {
      markdown: markdownLines.join("\n"),
      evidenceAtomIds: Array.from(new Set(atomIds)),
      rowCount: rows.length - 1,
      columns,
      dataSourceFooter: `Data Source: ${atomIds.length} complaint records across ${uniqueRegions} regions. ${denominatorNote}.` +
        (totalSeriousCount > 0 ? ` * Includes ${totalSeriousCount} serious complaint(s).` : ""),
      docxTable: {
        headers: columns,
        rows,
        headerStyle: "corporate",
        alternatingRows: true,
      },
    };
  }
}
