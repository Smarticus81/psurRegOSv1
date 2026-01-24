/**
 * Executive Summary Narrative Agent
 * 
 * Generates the Executive Summary section using 3-layer prompt architecture.
 * Synthesizes ALL PSUR data into high-level conclusions.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";

export class ExecSummaryNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "EXEC_SUMMARY";

  constructor() {
    super(
      "ExecSummaryNarrativeAgent",
      "Executive Summary Narrative Agent"
    );
  }

  protected identifyGaps(input: NarrativeInput): string[] {
    const gaps: string[] = [];
    const evidenceTypes = new Set(input.evidenceAtoms.map(a => a.evidenceType));

    // Executive summary needs comprehensive data
    const requiredTypes = [
      "sales_summary",
      "complaint_summary",
      "serious_incident_summary",
      "fsca_summary",
      "capa_summary",
      "pmcf_summary",
      "literature_review_summary",
      "benefit_risk_assessment",
    ];

    for (const type of requiredTypes) {
      if (!evidenceTypes.has(type) && !evidenceTypes.has(type.replace("_summary", "_record"))) {
        gaps.push(`Missing ${type.replace(/_/g, " ")} for executive summary`);
      }
    }

    return gaps;
  }

  protected buildUserPrompt(
    input: NarrativeInput,
    evidenceSummary: string,
    evidenceRecords: string
  ): string {
    // Calculate key statistics for exec summary
    const complaintAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("complaint")
    );
    const incidentAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("incident") || a.evidenceType.includes("vigilance")
    );
    const salesAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("sales")
    );
    const fscaAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("fsca") || a.evidenceType.includes("recall")
    );

    const totalSales = salesAtoms.reduce((sum, a) => {
      const qty = Number(a.normalizedData.quantity || a.normalizedData.units_sold || 0);
      return sum + qty;
    }, 0);

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Provide a high-level synthesis of ALL post-market surveillance data

## Device Context:
- Device Code: ${input.context.deviceCode}
- Device Name: ${input.context.deviceName || "Medical Device"}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## KEY STATISTICS FOR EXECUTIVE SUMMARY:
- Total Complaints: ${complaintAtoms.length}
- Serious Incidents: ${incidentAtoms.length}
- Units Sold/Distributed: ${totalSales.toLocaleString()}
- FSCAs/Recalls: ${fscaAtoms.length}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## IMPORTANT INSTRUCTIONS:
1. This is the EXECUTIVE SUMMARY - synthesize, don't just list
2. Start with the overall benefit-risk conclusion
3. Highlight ANY safety signals or trends
4. Reference specific evidence atoms [ATOM-xxx]
5. End with recommended actions or confirmation of continued favorable B/R`;
  }
}
