/**
 * Executive Summary Narrative Agent
 * 
 * Generates the Executive Summary section using 3-layer prompt architecture.
 * Synthesizes ALL PSUR data into high-level conclusions.
 * 
 * CRITICAL: Uses CanonicalMetricsService for ALL statistics to ensure
 * consistency with other sections per EU MDR Article 86.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { getCanonicalMetrics, CanonicalMetrics } from "../../../services/canonicalMetricsService";

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
    // Use CANONICAL METRICS for ALL statistics - ensures cross-section consistency
    // Cast context to access psurCaseId (added to interface)
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

    // Extract canonical values with provenance
    const totalUnits = metrics.sales.totalUnits;
    const totalComplaints = metrics.complaints.totalCount;
    const seriousComplaints = metrics.complaints.seriousCount;
    const totalIncidents = metrics.incidents.totalCount;
    const seriousIncidents = metrics.incidents.seriousCount;
    const fscaCount = metrics.incidents.fscaCount;

    // Build validation warnings if any
    const validationNotes = metrics.validation.issues.length > 0 || metrics.validation.warnings.length > 0
      ? `\n## DATA VALIDATION NOTES:\n${[...metrics.validation.issues, ...metrics.validation.warnings].map(w => `- ${w}`).join("\n")}`
      : "";

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Provide a high-level synthesis of ALL post-market surveillance data

## Device Context:
- Device Code: ${input.context.deviceCode}
- Device Name: ${input.context.deviceName || "Medical Device"}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## CANONICAL STATISTICS (Validated & Consistent):
- Total Units Distributed: ${totalUnits.formatted} [Confidence: ${(totalUnits.provenance.confidence * 100).toFixed(0)}%]
- Total Complaints: ${totalComplaints.formatted} [Confidence: ${(totalComplaints.provenance.confidence * 100).toFixed(0)}%]
- Serious Complaints: ${seriousComplaints.formatted}
- Total Incidents: ${totalIncidents.formatted}
- Serious Incidents: ${seriousIncidents.formatted}
- FSCAs/Recalls: ${fscaCount.formatted}
${metrics.complaints.ratePerThousand ? `- Complaint Rate: ${metrics.complaints.ratePerThousand.formatted} per 1,000 units` : "- Complaint Rate: N/A (no denominator)"}
${validationNotes}

## Data Quality:
- Sales Data Quality: ${metrics.sales.dataQuality}%
- Complaints Data Quality: ${metrics.complaints.dataQuality}%
- Cross-Section Consistent: ${metrics.validation.crossSectionConsistent ? "YES" : "NO - See warnings above"}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## IMPORTANT INSTRUCTIONS:
1. This is the EXECUTIVE SUMMARY - synthesize, don't just list
2. Use ONLY the CANONICAL STATISTICS above - these are validated for consistency
3. Start with the overall benefit-risk conclusion
4. Highlight ANY safety signals or trends
5. Reference specific evidence atoms [ATOM-xxx]
6. End with recommended actions or confirmation of continued favorable B/R
7. If data quality is low or cross-section consistency is NO, acknowledge data limitations`;
  }
}
