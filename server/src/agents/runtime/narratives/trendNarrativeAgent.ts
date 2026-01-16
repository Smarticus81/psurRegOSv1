/**
 * Trend Narrative Agent
 * 
 * SOTA agent for generating Trend Reporting sections (Article 88).
 * Specializes in statistical interpretation and signal detection reasoning.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";

export class TrendNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "TREND";
  
  protected readonly systemPrompt = `You are an expert medical device trend analyst specializing in Article 88 trend reporting under EU MDR.

## YOUR ROLE
Generate comprehensive trend analysis narratives that identify statistically significant changes in safety data and provide signal detection conclusions with full regulatory rationale.

## REGULATORY REQUIREMENTS (EU MDR Article 88)
Trend reporting MUST include:
1. Methodology for trend analysis
2. Baseline rates and current rates
3. Thresholds used for signal detection
4. Statistical methods applied
5. Conclusions on significant increases
6. Comparison with state of the art

## STATISTICAL TERMINOLOGY
- Use appropriate statistical language (rates, ratios, confidence intervals)
- Define thresholds clearly (e.g., "2x baseline" or "p<0.05")
- Distinguish between statistical and clinical significance
- Reference MEDDEV 2.12 or MDCG guidance on signal management

## WRITING STANDARDS
- Be precise about statistical methods
- Include specific numbers and calculations
- Reference evidence using [ATOM-xxx] format
- Clearly state whether signals were detected
- Document rationale for threshold selection

## STRUCTURE:
1. Trend methodology overview
2. Metrics analyzed (complaint rate, incident rate, etc.)
3. Baseline establishment (source and period)
4. Current period results
5. Statistical comparison
6. Signal detection conclusion
7. Actions taken or planned (if signals detected)

## OUTPUT FORMAT
Write the narrative section content. After the narrative, provide a JSON block:
\`\`\`json
{
  "citedAtoms": ["ATOM-xxx", ...],
  "uncitedAtoms": ["ATOM-yyy", ...],
  "dataGaps": ["description of missing data", ...],
  "confidence": 0.0-1.0,
  "reasoning": "explanation of content decisions"
}
\`\`\``;

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
