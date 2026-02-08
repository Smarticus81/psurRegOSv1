/**
 * Safety Narrative Agent
 * 
 * SOTA agent for generating Serious Incidents and Complaints sections.
 * Specializes in safety-focused language, IMDRF coding, and severity analysis.
 * 
 * Uses Device Dossier Context for:
 * - Principal identified risks from risk analysis
 * - Risk thresholds for signal detection
 * - Hazard categories for IMDRF mapping context
 * - Prior period safety metrics for comparison
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { type DossierContext } from "../../../services/deviceDossierService";
import { getCanonicalMetrics } from "../../../services/canonicalMetricsService";

export class SafetyNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "SAFETY";

  constructor() {
    super(
      "SafetyNarrativeAgent",
      "Safety Narrative Agent"
    );
  }

  protected identifyGaps(input: NarrativeInput): string[] {
    const gaps: string[] = [];
    const evidenceTypes = new Set(input.evidenceAtoms.map(a => a.evidenceType));

    // Safety section needs incident and complaint data
    if (!evidenceTypes.has("serious_incident_record") && !evidenceTypes.has("serious_incident_summary")) {
      gaps.push("No serious incident data - confirm if zero incidents or data gap");
    }

    if (!evidenceTypes.has("complaint_record") && !evidenceTypes.has("complaint_summary")) {
      gaps.push("No complaint data - confirm if zero complaints or data gap");
    }

    // Check for IMDRF coding
    const hasIMDRF = input.evidenceAtoms.some(a =>
      a.normalizedData.imdrf_code ||
      a.normalizedData.event_code ||
      a.normalizedData.problem_code
    );
    if (!hasIMDRF && (evidenceTypes.has("complaint_record") || evidenceTypes.has("serious_incident_record"))) {
      gaps.push("No IMDRF coding available for incidents/complaints");
    }

    // Check for sales data for rate calculation
    const hasSales = input.evidenceAtoms.some(a =>
      a.evidenceType.includes("sales")
    );
    if (!hasSales) {
      gaps.push("No sales data for complaint rate calculation");
    }

    return gaps;
  }

  protected buildUserPrompt(
    input: NarrativeInput,
    evidenceSummary: string,
    evidenceRecords: string,
    dossierContext?: DossierContext
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

    // Use canonical values
    const totalSales = metrics.sales.totalUnits.value;
    const complaintCount = metrics.complaints.totalCount.value;
    const incidentCount = metrics.incidents.seriousCount.value;
    const complaintRate = metrics.complaints.ratePerThousand?.value ?? 0;
    const complaintRateStr = metrics.complaints.ratePerThousand
      ? metrics.complaints.ratePerThousand.formatted
      : "N/A";

    // Use local atoms for severity breakdown (detailed analysis)
    const complaintAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("complaint")
    );
    const incidentAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("incident") || a.evidenceType.includes("vigilance")
    );

    // Severity breakdown from local atoms
    const bySeverity: Record<string, number> = {};
    for (const atom of complaintAtoms) {
      const severity = String(atom.normalizedData.severity || "UNKNOWN");
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    }

    // Patient outcomes
    const outcomes = complaintAtoms
      .map(a => a.normalizedData.patient_outcome || a.normalizedData.patientOutcome)
      .filter(Boolean);

    // Build dossier context section for safety
    let riskContextSection = "";
    if (dossierContext?.dossierExists) {
      riskContextSection = `
## DEVICE RISK CONTEXT (From Dossier):

${dossierContext.riskContext}

---

## THRESHOLD ANALYSIS:`;

      // Add threshold comparison
      if (dossierContext.riskThresholds && totalSales > 0) {
        const threshold = dossierContext.riskThresholds.complaintRateThreshold;
        const status = complaintRate > threshold 
          ? "ABOVE THRESHOLD - SIGNAL INVESTIGATION REQUIRED" 
          : "Within acceptable limits";
        riskContextSection += `
- Current Complaint Rate: ${complaintRateStr} per 1,000 units
- Defined Threshold: ${threshold} per 1,000 units
- Status: ${status}
- Signal Detection Method: ${dossierContext.riskThresholds.signalDetectionMethod}`;

        if (dossierContext.riskThresholds.seriousIncidentThreshold) {
          const incidentStatus = incidentAtoms.length > dossierContext.riskThresholds.seriousIncidentThreshold
            ? "ABOVE THRESHOLD - INVESTIGATION REQUIRED"
            : "Within acceptable limits";
          riskContextSection += `

- Serious Incidents This Period: ${incidentAtoms.length}
- Serious Incident Threshold: ${dossierContext.riskThresholds.seriousIncidentThreshold}
- Status: ${incidentStatus}`;
        }
      }

      // Add prior period comparison if available
      if (dossierContext.priorPsurConclusion?.periodMetrics) {
        const priorRate = dossierContext.priorPsurConclusion.periodMetrics.complaintRate;
        const priorIncidents = dossierContext.priorPsurConclusion.periodMetrics.seriousIncidents;
        
        if (priorRate !== undefined && totalSales > 0) {
          const change = ((complaintRate - priorRate) / priorRate * 100);
          const direction = change > 0 ? "increase" : "decrease";
          riskContextSection += `

## COMPARISON TO PRIOR PERIOD:
- Prior Period Complaint Rate: ${priorRate} per 1,000 units
- Change: ${Math.abs(change).toFixed(1)}% ${direction}`;
        }
        
        if (priorIncidents !== undefined) {
          riskContextSection += `
- Prior Period Serious Incidents: ${priorIncidents}
- Current Period Serious Incidents: ${incidentAtoms.length}`;
        }
      }
    } else {
      riskContextSection = `
## DEVICE RISK CONTEXT: Not Available
NOTE: No device dossier found. Cannot compare against defined risk thresholds.
Consider creating a device dossier to enable:
- Comparison against pre-market identified risks
- Signal detection against defined thresholds
- Trend analysis against prior periods`;
    }

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Analyze safety data including serious incidents and complaints

## REPORTING PERIOD: ${input.context.periodStart} to ${input.context.periodEnd}
## DEVICE: ${input.context.deviceCode}

${riskContextSection}

---

## SAFETY STATISTICS (Canonical - Current Period):
- Total Complaints: ${metrics.complaints.totalCount.formatted}
- Serious Incidents: ${metrics.incidents.seriousCount.formatted}
- Units Sold (denominator): ${metrics.sales.totalUnits.formatted}
- Complaint Rate: ${complaintRateStr} per 1,000 units

## SEVERITY BREAKDOWN:
${Object.entries(bySeverity).map(([sev, count]) => `- ${sev}: ${count}`).join("\n") || "- No severity data available"}

## PATIENT OUTCOMES MENTIONED:
${outcomes.length > 0 ? outcomes.slice(0, 10).join(", ") : "No patient outcomes documented"}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS:
1. SAFETY IS PARAMOUNT - do not minimize or omit adverse events
2. Include ALL serious incidents with outcomes
3. COMPARE current rates to thresholds if available from dossier
4. COMPARE to prior period if baseline data available
5. Reference principal identified risks from dossier context where relevant
6. Use IMDRF codes if available in the evidence
7. If zero incidents/complaints, explicitly state this is confirmed data (not a gap)
8. If rates exceed thresholds, clearly flag as safety signal requiring investigation
9. DO NOT use placeholder citations - only cite actual atom IDs from evidence`;
  }
}
