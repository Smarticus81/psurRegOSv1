/**
 * PMS Activity Narrative Agent
 * 
 * SOTA agent for generating PMS Overview and Data Sources sections.
 * Describes post-market surveillance activities and methodology.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { getCanonicalMetrics } from "../../../services/canonicalMetricsService";

export class PMSActivityNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "PMS_ACTIVITY";

  constructor() {
    super(
      "PMSActivityNarrativeAgent",
      "PMS Activity Narrative Agent"
    );
  }

  protected identifyGaps(input: NarrativeInput): string[] {
    const gaps: string[] = [];
    const evidenceTypes = new Set(input.evidenceAtoms.map(a => a.evidenceType));

    // PMS activity needs methodology documentation
    if (!evidenceTypes.has("pms_plan_extract") && !evidenceTypes.has("pms_activity_log")) {
      gaps.push("No PMS plan or activity log evidence");
    }

    if (!evidenceTypes.has("data_source_register")) {
      gaps.push("No data source register documentation");
    }

    // Check for sales/exposure data
    const hasSales = input.evidenceAtoms.some(a =>
      a.evidenceType.includes("sales") ||
      a.evidenceType.includes("distribution")
    );
    if (!hasSales) {
      gaps.push("No sales or distribution data for exposure estimation");
    }

    return gaps;
  }

  protected buildUserPrompt(
    input: NarrativeInput,
    evidenceSummary: string,
    evidenceRecords: string
  ): string {
    // Use CANONICAL METRICS for ALL statistics - ensures cross-section consistency
    const ctx = input.context as typeof input.context & { psurCaseId?: number };
    const metrics = getCanonicalMetrics(
      ctx.psurCaseId || 0,
      input.evidenceAtoms.map(a => ({
        atomId: a.atomId,
        evidenceType: a.evidenceType,
        normalizedData: a.normalizedData as Record<string, unknown>,
      })),
      input.context.periodStart,
      input.context.periodEnd
    );

    // Calculate region data from local atoms for detail
    const salesAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("sales") || a.evidenceType.includes("volume")
    );

    const regionSet = new Set(salesAtoms.map(a =>
      a.normalizedData.region || a.normalizedData.country || "Unknown"
    ));
    const regions = Array.from(regionSet);

    const deviceName = input.context.deviceName || input.context.deviceCode;

    return `Generate the Volume of Sales and Population Exposure section. Be concise and data-driven.

## DATA:
- Device: ${deviceName}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}
- Total Units: ${metrics.sales.totalUnits.formatted}
- Regions: ${regions.join(", ") || "Not specified"}

## REQUIRED OUTPUT FORMAT:

1. **Sales Methodology** (1-2 sentences): State the criteria used for sales data (e.g., "devices placed on the market" or "units distributed").

2. **Sales Summary** (1-2 sentences): State total units sold during the period and list main markets.

3. **Sales Table**: Include a table with columns: Region | [12-month periods] | Period Total | % of Global Sales. Use data from evidence records. End with a Worldwide total row.

4. **Population Exposure** (2-3 sentences): State whether the device is single-use, the estimated patient population, and target demographics.

Do NOT write lengthy market analysis. Keep to facts and tables.

## Evidence Records:
${evidenceRecords}`;
  }
}
