/**
 * Conclusion Narrative Agent
 * 
 * SOTA agent for generating Conclusions and Actions sections.
 * Specializes in forward-looking statements and regulatory commitments.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { getCanonicalMetrics } from "../../../services/canonicalMetricsService";

export class ConclusionNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "CONCLUSION";

  constructor() {
    super(
      "ConclusionNarrativeAgent",
      "Conclusion Narrative Agent"
    );
  }

  protected identifyGaps(input: NarrativeInput): string[] {
    const gaps: string[] = [];

    // Conclusions need comprehensive preceding data
    // This section summarizes, so fewer specific requirements
    if (input.evidenceAtoms.length === 0) {
      gaps.push("No evidence atoms available for conclusion synthesis");
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

    const capaAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("capa")
    );
    const trendAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("trend")
    );

    // Check for signals
    const signalsDetected = trendAtoms.some(a =>
      a.normalizedData.signal_detected === true ||
      a.normalizedData.significant === true
    );

    // Check for open items
    const openCAPAs = capaAtoms.filter(a =>
      !a.normalizedData.close_date && a.normalizedData.status !== "CLOSED"
    );

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: PSUR conclusions and planned actions

## Device Context:
- Device Code: ${input.context.deviceCode}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## PERIOD SUMMARY (Canonical - Validated & Consistent):
- Total Units: ${metrics.sales.totalUnits.formatted}
- Total Complaints: ${metrics.complaints.totalCount.formatted}
- Serious Incidents: ${metrics.incidents.seriousCount.formatted}
- FSCAs: ${metrics.incidents.fscaCount.formatted}
- CAPAs: ${capaAtoms.length} (${openCAPAs.length} open)
- Signals Detected: ${signalsDetected ? "YES - REQUIRES ACTION" : "None"}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS:
1. This is the FINAL section - must be CONCLUSIVE
2. Summarize overall safety and performance conclusions
3. List ALL actions taken during the period
4. List planned actions for next period
5. DO NOT include [ATOM-xxx] citations - they will be tracked via metadata
6. MUST END WITH:
   - Clear statement on benefit-risk (favorable/acceptable)
   - Compliance confirmation with EU MDR Article 86/88
   - Next PSUR submission commitment
7. Write clean, professional prose without markdown symbols`;
  }
}
