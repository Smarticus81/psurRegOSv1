/**
 * Trend Narrative Agent
 * 
 * SOTA agent for generating Trend Reporting sections.
 * Specializes in statistical interpretation and signal detection reasoning.
 * 
 * Uses Device Dossier Context for:
 * - Historical performance baselines for trend comparison
 * - Defined signal detection thresholds and methodology
 * - Prior period rates for multi-period trend analysis
 * - Risk thresholds for signal determination
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { type DossierContext } from "../../../services/deviceDossierService";
import { type AgentRoleContext } from "../../../services/agentRoleContextService";

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
    evidenceRecords: string,
    dossierContext?: DossierContext,
    agentRoleContext?: AgentRoleContext
  ): string {
    // Use engine-computed data if available, falling back to raw atom counts
    const analytics = input.analyticsContext;
    const ca = analytics?.complaintAnalysis;
    const se = analytics?.salesExposure;

    // Engine-computed values (deterministic, consistent across sections)
    const currentRate = ca ? ca.metrics.complaintRate : 0;
    const totalComplaints = ca ? ca.metrics.totalComplaints : input.evidenceAtoms.filter(a => a.evidenceType.includes("complaint")).length;
    const totalSales = se ? se.metrics.totalUnitsSoldInPeriod : 0;
    const article88Required = ca ? ca.article88Required : false;
    const article88Justification = ca ? ca.article88Justification : "No engine data";

    // Trend analysis from engine
    let trendDataSection = "";
    if (ca) {
      const ta = ca.trendAnalysis;
      trendDataSection = `
## PRE-COMPUTED STATISTICAL ANALYSIS (Deterministic Engine Output):
- Mean Rate: ${ta.mean.toFixed(4)} per 1,000 units
- Standard Deviation: ${ta.stdDev.toFixed(4)}
- UCL (3-sigma): ${ta.ucl.toFixed(4)}
- LCL (3-sigma): ${ta.lcl.toFixed(4)}
- Trend Slope: ${ta.slope.toFixed(6)} (${ta.isIncreasing ? "INCREASING" : "DECREASING"})
- Statistically Significant: ${ta.isStatisticallySignificant ? "YES" : "NO"}
- UCL Excursions: ${ta.excursions.length}
- Article 88 Reporting Required: ${article88Required ? "YES" : "NO"}
- Article 88 Justification: ${article88Justification}`;

      if (ta.excursions.length > 0) {
        trendDataSection += "\n- UCL Breach Data Points:";
        for (const ex of ta.excursions) {
          trendDataSection += `\n  - ${ex.period}: rate ${ex.observedRate.toFixed(4)} > ${ex.excursionType} threshold ${ex.threshold.toFixed(4)}`;
        }
      }

      trendDataSection += "\n- Monthly Data Points:";
      for (const dp of ta.dataPoints) {
        const status = dp.rate > ta.ucl ? " [ABOVE UCL]" : "";
        trendDataSection += `\n  - ${dp.period}: ${dp.count} complaints, rate ${dp.rate.toFixed(4)}${status}`;
      }
    } else {
      trendDataSection = `
## TREND DATA: No Engine Data Available
NOTE: Deterministic engines did not produce trend analysis.
The agent should use raw evidence data for basic trend observations.`;
    }

    // Check for signals in evidence
    const trendAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType === "trend_analysis" || a.evidenceType === "signal_log"
    );
    const signalsDetected = ca
      ? ca.trendAnalysis.isStatisticallySignificant
      : trendAtoms.some(a => a.normalizedData.signal_detected === true);

    // Build dossier baseline comparison (still uses dossier for historical context)
    let baselineSection = "";
    if (dossierContext?.dossierExists && dossierContext.performanceBaselines.length > 0) {
      baselineSection = "\n## HISTORICAL BASELINES (From Dossier):";
      const complaintBaseline = dossierContext.performanceBaselines.find(
        b => b.metricType === "complaint_rate"
      );
      if (complaintBaseline) {
        const change = complaintBaseline.value !== 0
          ? ((currentRate - complaintBaseline.value) / complaintBaseline.value * 100)
          : 0;
        const direction = change > 0 ? "INCREASE" : "DECREASE";
        baselineSection += `
- Baseline Period: ${complaintBaseline.periodStart?.split("T")[0]} to ${complaintBaseline.periodEnd?.split("T")[0]}
- Baseline Rate: ${complaintBaseline.value} per 1,000 units
- Current Rate (Engine): ${currentRate.toFixed(2)} per 1,000 units
- Change: ${Math.abs(change).toFixed(1)}% ${direction}`;
      }

      if (dossierContext.riskThresholds) {
        const threshold = dossierContext.riskThresholds.complaintRateThreshold;
        const status = currentRate > threshold
          ? "SIGNAL DETECTED - Above Threshold"
          : "NO SIGNAL DETECTED";
        baselineSection += `

## SIGNAL DETECTION (Dossier Thresholds):
- Defined Threshold: ${threshold} per 1,000 units
- Current Rate (Engine): ${currentRate.toFixed(2)} per 1,000 units
- Status: ${status}
- Method: ${dossierContext.riskThresholds.signalDetectionMethod}`;
      }
    }

    const deviceName = input.context.deviceName || input.context.deviceCode;
    const noExcursions = !ca || ca.trendAnalysis.excursions.length === 0;

    return `Generate the Trend Reporting section. Be concise and factual.

## DATA:
- Device: ${deviceName}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}
- Total Complaints: ${totalComplaints}
- Total Units Sold: ${totalSales.toLocaleString()}
- Current Complaint Rate: ${currentRate.toFixed(4)} per 1,000 units
- Signal Detected: ${signalsDetected ? "YES" : "No"}

${trendDataSection}

${baselineSection}

## REQUIRED OUTPUT FORMAT:
Write 2-3 short paragraphs maximum:

1. **Methodology** (1-2 sentences): State that complaint rate trending was performed monthly. The UCL was established at three standard deviations above the average.

2. **Analysis** (1-2 sentences): ${noExcursions
      ? "State that no monthly complaint rate exceeded the UCL during the reporting period."
      : "Describe each month where the complaint rate exceeded the UCL, state the rate and UCL values, describe the device problems, and note whether the rate returned to normal."}

3. **Conclusion** (1-2 sentences): ${signalsDetected
      ? "State that a statistically significant trend was detected and describe what action is being taken."
      : "State: 'Because there is no indication of a significant increase in the frequency or severity of incidents that are expected to have a significant impact on the benefit-risk profile, a trend report is not needed. The monthly complaint rate will continue to be monitored through monthly complaint trending activities.'"}

Do NOT write more than 3 paragraphs. Do NOT repeat data as bullet lists.

## Evidence Records:
${evidenceRecords}`;
  }
}
