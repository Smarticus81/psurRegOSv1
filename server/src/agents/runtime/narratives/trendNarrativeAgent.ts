/**
 * Trend Narrative Agent
 * 
 * SOTA agent for generating Trend Reporting sections (Article 88).
 * Specializes in statistical interpretation and signal detection reasoning.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";

export class TrendNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "TREND";

  constructor() {
    super(
      "TrendNarrativeAgent",
      "Trend Narrative Agent"
    );
  }

  protected identifyGaps(input: NarrativeInput): string[] {
    const gaps: string[] = [];
    const evidenceTypes = new Set(input.evidenceAtoms.map(a => a.evidenceType));

    // Trend analysis needs specific data
    if (!evidenceTypes.has("trend_analysis")) {
      gaps.push("No pre-computed trend analysis data");
    }

    // Need historical data for comparison
    const hasHistorical = input.evidenceAtoms.some(a =>
      a.normalizedData.baseline_rate ||
      a.normalizedData.previous_rate ||
      a.normalizedData.historical
    );
    if (!hasHistorical) {
      gaps.push("No historical baseline data for trend comparison");
    }

    // Need current period data
    const hasCurrent = input.evidenceAtoms.some(a =>
      a.evidenceType.includes("complaint") ||
      a.evidenceType.includes("sales")
    );
    if (!hasCurrent) {
      gaps.push("Insufficient current period data for trend calculation");
    }

    return gaps;
  }

  protected buildUserPrompt(
    input: NarrativeInput,
    evidenceSummary: string,
    evidenceRecords: string
  ): string {
    // Extract trend-specific data
    const trendAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType === "trend_analysis" || a.evidenceType === "signal_log"
    );
    const complaintAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("complaint")
    );
    const salesAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("sales")
    );

    const totalSales = salesAtoms.reduce((sum, a) => {
      const qty = Number(a.normalizedData.quantity || a.normalizedData.units_sold || 0);
      return sum + qty;
    }, 0);

    const currentRate = totalSales > 0
      ? (complaintAtoms.length / totalSales) * 1000
      : 0;

    // Check for signals
    const signalsDetected = trendAtoms.some(a =>
      a.normalizedData.signal_detected === true ||
      a.normalizedData.significant === true
    );

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Article 88 trend reporting and signal detection analysis

## Device Context:
- Device Code: ${input.context.deviceCode}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## TREND ANALYSIS DATA:
- Current Complaint Rate: ${currentRate.toFixed(2)} per 1,000 units
- Total Complaints: ${complaintAtoms.length}
- Total Units (denominator): ${totalSales.toLocaleString()}
- Pre-computed Trend Records: ${trendAtoms.length}
- Signals Detected in Data: ${signalsDetected ? "YES - REQUIRES ATTENTION" : "No"}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS:
1. Article 88 REQUIRES trend reporting - this is mandatory
2. Define the baseline period and rate explicitly
3. State the threshold methodology (e.g., 2x baseline, 95% CI)
4. Calculate statistical comparison
5. CLEARLY STATE: Signal detected or No signal detected
6. If NO trend data available, state this is a compliance gap
7. Reference specific evidence atoms [ATOM-xxx]
8. If signals detected, document required follow-up actions`;
  }
}
