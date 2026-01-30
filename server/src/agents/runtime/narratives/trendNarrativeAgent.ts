/**
 * Trend Narrative Agent
 * 
 * SOTA agent for generating Trend Reporting sections (Article 88).
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
    dossierContext?: DossierContext
  ): string {
    // Extract trend-specific data
    const trendAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType === "trend_analysis" || a.evidenceType === "signal_log"
    );
    const complaintAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("complaint")
    );
    const incidentAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("incident")
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

    // Check for signals in evidence
    const signalsDetected = trendAtoms.some(a =>
      a.normalizedData.signal_detected === true ||
      a.normalizedData.significant === true
    );

    // Build dossier context section for trends
    let trendContextSection = "";
    let baselineData = "";
    let signalAnalysis = "";

    if (dossierContext?.dossierExists) {
      // Performance baselines from dossier
      if (dossierContext.performanceBaselines.length > 0) {
        baselineData = `
## HISTORICAL BASELINES (From Dossier):`;
        
        // Find complaint rate baseline
        const complaintBaseline = dossierContext.performanceBaselines.find(
          b => b.metricType === "complaint_rate"
        );
        if (complaintBaseline) {
          const change = complaintBaseline.value !== 0 
            ? ((currentRate - complaintBaseline.value) / complaintBaseline.value * 100)
            : 0;
          const direction = change > 0 ? "INCREASE" : "DECREASE";
          baselineData += `

### Complaint Rate Baseline:
- Baseline Period: ${complaintBaseline.periodStart?.split("T")[0]} to ${complaintBaseline.periodEnd?.split("T")[0]}
- Baseline Rate: ${complaintBaseline.value} per 1,000 units
- Current Rate: ${currentRate.toFixed(2)} per 1,000 units
- Change: ${Math.abs(change).toFixed(1)}% ${direction}
${complaintBaseline.methodology ? `- Methodology: ${complaintBaseline.methodology}` : ""}`;
        }

        // Find incident rate baseline
        const incidentBaseline = dossierContext.performanceBaselines.find(
          b => b.metricType === "incident_rate"
        );
        if (incidentBaseline) {
          const currentIncidentRate = totalSales > 0 
            ? (incidentAtoms.length / totalSales) * 1000 
            : 0;
          const change = incidentBaseline.value !== 0
            ? ((currentIncidentRate - incidentBaseline.value) / incidentBaseline.value * 100)
            : 0;
          const direction = change > 0 ? "INCREASE" : "DECREASE";
          baselineData += `

### Incident Rate Baseline:
- Baseline Rate: ${incidentBaseline.value} per 1,000 units
- Current Rate: ${currentIncidentRate.toFixed(4)} per 1,000 units
- Change: ${Math.abs(change).toFixed(1)}% ${direction}`;
        }
      }

      // Signal detection thresholds
      if (dossierContext.riskThresholds) {
        const threshold = dossierContext.riskThresholds.complaintRateThreshold;
        const complaintBaseline = dossierContext.performanceBaselines.find(
          b => b.metricType === "complaint_rate"
        );
        
        // Determine signal status
        let signalStatus = "NO SIGNAL DETECTED";
        let signalReason = "";
        
        if (totalSales > 0) {
          // Check against threshold
          if (currentRate > threshold) {
            signalStatus = "SIGNAL DETECTED - Above Threshold";
            signalReason = `Current rate (${currentRate.toFixed(2)}) exceeds threshold (${threshold})`;
          }
          // Check against 2x baseline if available
          else if (complaintBaseline && currentRate > complaintBaseline.value * 2) {
            signalStatus = "SIGNAL DETECTED - >2x Baseline";
            signalReason = `Current rate (${currentRate.toFixed(2)}) exceeds 2x baseline (${(complaintBaseline.value * 2).toFixed(2)})`;
          }
        }

        signalAnalysis = `

## SIGNAL DETECTION ANALYSIS:
- Detection Method: ${dossierContext.riskThresholds.signalDetectionMethod}
- Defined Threshold: ${threshold} per 1,000 units
${complaintBaseline ? `- 2x Baseline Threshold: ${(complaintBaseline.value * 2).toFixed(2)} per 1,000 units` : ""}
- Current Rate: ${currentRate.toFixed(2)} per 1,000 units

### SIGNAL STATUS: ${signalStatus}
${signalReason ? `Reason: ${signalReason}` : "Current rates are within acceptable limits based on defined thresholds."}`;
      }

      // Prior period comparison
      if (dossierContext.priorPsurConclusion?.periodMetrics) {
        const priorRate = dossierContext.priorPsurConclusion.periodMetrics.complaintRate;
        if (priorRate !== undefined) {
          const priorChange = priorRate !== 0 
            ? ((currentRate - priorRate) / priorRate * 100)
            : 0;
          const priorDirection = priorChange > 0 ? "INCREASE" : "DECREASE";
          trendContextSection += `

## PRIOR PSUR PERIOD COMPARISON:
- Prior Period: ${dossierContext.priorPsurConclusion.periodStart?.split("T")[0]} to ${dossierContext.priorPsurConclusion.periodEnd?.split("T")[0]}
- Prior Complaint Rate: ${priorRate} per 1,000 units
- Current Complaint Rate: ${currentRate.toFixed(2)} per 1,000 units
- Period-over-Period Change: ${Math.abs(priorChange).toFixed(1)}% ${priorDirection}`;
        }
      }
    } else {
      trendContextSection = `
## TREND CONTEXT: Limited Baseline Data

NOTE: No device dossier found with historical baselines.
Trend analysis is limited to evidence data only.

Consider creating a device dossier with performance baselines to enable:
- Multi-period trend comparison
- Statistical signal detection against defined thresholds
- Proper Article 88 compliance with documented methodology`;
    }

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Article 88 trend reporting and signal detection analysis

## REPORTING PERIOD: ${input.context.periodStart} to ${input.context.periodEnd}
## DEVICE: ${input.context.deviceCode}

${baselineData}
${signalAnalysis}
${trendContextSection}

---

## CURRENT PERIOD DATA:
- Current Complaint Rate: ${currentRate.toFixed(2)} per 1,000 units
- Total Complaints: ${complaintAtoms.length}
- Total Incidents: ${incidentAtoms.length}
- Total Units (denominator): ${totalSales.toLocaleString()}
- Pre-computed Trend Records: ${trendAtoms.length}
- Signals in Evidence Data: ${signalsDetected ? "YES" : "No"}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS FOR TREND REPORTING:
1. Article 88 REQUIRES trend reporting - this is MANDATORY compliance
2. USE the baseline data from dossier as the comparison reference
3. APPLY the signal detection method specified in the dossier
4. COMPARE current rates against both thresholds AND baselines
5. Calculate percentage change with proper direction (increase/decrease)
6. CLEARLY STATE the signal detection outcome:
   - "No statistically significant trend detected" OR
   - "Signal detected: [describe what was found]"
7. If signal detected, specify required follow-up actions
8. If NO baseline data available, explicitly state this is a compliance gap
9. Reference the methodology used (from dossier or state if none defined)
10. DO NOT use placeholder citations - only cite actual atom IDs from evidence`;
  }
}
