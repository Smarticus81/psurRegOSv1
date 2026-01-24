/**
 * PMS Activity Narrative Agent
 * 
 * SOTA agent for generating PMS Overview and Data Sources sections.
 * Describes post-market surveillance activities and methodology.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { PROMPT_TEMPLATES } from "../../llmService";

export class PMSActivityNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "PMS_ACTIVITY";

  protected readonly systemPrompt = PROMPT_TEMPLATES.PMS_ACTIVITY_SYSTEM;

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
    // Calculate sales metrics
    const salesAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("sales") || a.evidenceType.includes("volume")
    );

    const totalUnits = salesAtoms.reduce((sum, a) => {
      const qty = Number(a.normalizedData.quantity || a.normalizedData.units_sold || 0);
      return sum + qty;
    }, 0);

    const regionSet = new Set(salesAtoms.map(a =>
      a.normalizedData.region || a.normalizedData.country || "Unknown"
    ));
    const regions = Array.from(regionSet);

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Describe PMS activities and data sources used during the reporting period

## Device Context:
- Device Code: ${input.context.deviceCode}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## SALES/EXPOSURE METRICS:
- Total Units Sold/Distributed: ${totalUnits.toLocaleString()}
- Markets/Regions: ${regions.join(", ") || "Not specified"}
- Data Records: ${salesAtoms.length}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## IMPORTANT INSTRUCTIONS:
1. Describe the METHODOLOGY used for PMS, not just results
2. List all data sources consulted (complaints, literature, registries, etc.)
3. Include collection frequency and responsible parties
4. For sales/exposure, provide denominator data quality assessment
5. DO NOT include [ATOM-xxx] citations - they will be tracked via metadata
6. Write clean, professional prose without markdown symbols`;
  }
}
