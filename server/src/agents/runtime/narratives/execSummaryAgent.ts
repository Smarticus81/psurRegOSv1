/**
 * Executive Summary Narrative Agent
 * 
 * Generates the Executive Summary section using 4-layer prompt architecture:
 * - Layer 1: Agent Persona
 * - Layer 2: System Prompt (from DB)
 * - Layer 3: Field Instructions
 * - Layer 4: Device Dossier Context (rich device-specific information)
 * 
 * Synthesizes ALL PSUR data into high-level conclusions.
 * 
 * CRITICAL: Uses CanonicalMetricsService for ALL statistics to ensure
 * consistency with other sections per EU MDR Article 86.
 * 
 * CRITICAL: Uses DeviceDossierService for device-specific context to
 * generate non-generic, device-appropriate content.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { getCanonicalMetrics } from "../../../services/canonicalMetricsService";
import { type DossierContext } from "../../../services/deviceDossierService";

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

    // Extract canonical values with provenance
    const totalUnits = metrics.sales.totalUnits;
    const totalComplaints = metrics.complaints.totalCount;
    const seriousComplaints = metrics.complaints.seriousCount;
    const totalIncidents = metrics.incidents.totalCount;
    const seriousIncidents = metrics.incidents.seriousCount;
    const fscaCount = metrics.incidents.fscaCount;
    const complaintRate = metrics.complaints.ratePerThousand;

    // Build validation warnings if any
    const validationNotes = metrics.validation.issues.length > 0 || metrics.validation.warnings.length > 0
      ? `\n## DATA VALIDATION NOTES:\n${[...metrics.validation.issues, ...metrics.validation.warnings].map(w => `- ${w}`).join("\n")}`
      : "";

    // Build dossier context section - this is the key to non-generic content
    let deviceContextSection = "";
    if (dossierContext?.dossierExists) {
      deviceContextSection = `
${dossierContext.productSummary}

---

${dossierContext.clinicalContext}

---

${dossierContext.riskContext}

---

${dossierContext.priorPsurContext}`;

      // Add threshold comparison if available
      if (dossierContext.riskThresholds && complaintRate) {
        const threshold = dossierContext.riskThresholds.complaintRateThreshold;
        const currentRate = complaintRate.value;
        const status = currentRate > threshold ? "ABOVE THRESHOLD - INVESTIGATE" : "Within acceptable limits";
        deviceContextSection += `

## THRESHOLD COMPARISON:
- Current Complaint Rate: ${complaintRate.formatted} per 1,000 units
- Defined Threshold: ${threshold} per 1,000 units
- Status: ${status}
- Signal Detection Method: ${dossierContext.riskThresholds.signalDetectionMethod}`;
      }

      // Add trend comparison if baselines available
      if (dossierContext.performanceBaselines.length > 0) {
        const priorComplaintRate = dossierContext.performanceBaselines.find(
          b => b.metricType === "complaint_rate"
        );
        if (priorComplaintRate && complaintRate) {
          const change = ((complaintRate.value - priorComplaintRate.value) / priorComplaintRate.value * 100);
          const direction = change > 0 ? "increase" : "decrease";
          deviceContextSection += `
- Prior Period Rate: ${priorComplaintRate.value} per 1,000 units
- Change: ${Math.abs(change).toFixed(1)}% ${direction}`;
        }
      }

      // Add clinical benefits for B/R assessment
      if (dossierContext.clinicalBenefits.length > 0) {
        deviceContextSection += `

## CLINICAL BENEFITS TO WEIGH AGAINST RISKS:`;
        for (const benefit of dossierContext.clinicalBenefits.slice(0, 5)) {
          deviceContextSection += `
- ${benefit.description}${benefit.quantifiedValue ? `: ${benefit.quantifiedValue}` : ""}`;
        }
      }
    } else {
      deviceContextSection = `
## DEVICE CONTEXT: Limited Information Available
- Device Code: ${input.context.deviceCode}
- Device Name: ${input.context.deviceName || "Medical Device"}

NOTE: No device dossier found for this device code. The content below may be 
more generic than desired. Consider creating a device dossier to enable 
device-specific context including:
- Intended purpose and clinical benefits
- Risk thresholds and signal detection criteria
- Prior PSUR conclusions and commitments
- Performance baselines for trend analysis`;
    }

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Provide a high-level synthesis of ALL post-market surveillance data

## REPORTING PERIOD: ${input.context.periodStart} to ${input.context.periodEnd}

${deviceContextSection}

---

## CANONICAL STATISTICS (Validated & Consistent):
- Total Units Distributed: ${totalUnits.formatted} [Confidence: ${(totalUnits.provenance.confidence * 100).toFixed(0)}%]
- Total Complaints: ${totalComplaints.formatted} [Confidence: ${(totalComplaints.provenance.confidence * 100).toFixed(0)}%]
- Serious Complaints: ${seriousComplaints.formatted}
- Total Incidents: ${totalIncidents.formatted}
- Serious Incidents: ${seriousIncidents.formatted}
- FSCAs/Recalls: ${fscaCount.formatted}
${complaintRate ? `- Complaint Rate: ${complaintRate.formatted} per 1,000 units` : "- Complaint Rate: N/A (no denominator)"}
${validationNotes}

## Data Quality:
- Sales Data Quality: ${metrics.sales.dataQuality}%
- Complaints Data Quality: ${metrics.complaints.dataQuality}%
- Cross-Section Consistent: ${metrics.validation.crossSectionConsistent ? "YES" : "NO - See warnings above"}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS FOR EXECUTIVE SUMMARY:
1. This is the EXECUTIVE SUMMARY - synthesize, don't just list
2. Use ONLY the CANONICAL STATISTICS above - these are validated for consistency
3. START with the overall benefit-risk conclusion
4. REFERENCE the specific clinical benefits from the dossier context
5. COMPARE current metrics against the defined thresholds if available
6. COMPARE to prior PSUR period if data available
7. Highlight ANY safety signals or trends
8. Reference any outstanding actions from prior PSUR
9. END with recommended actions or confirmation of continued favorable B/R
10. If data quality is low or cross-section consistency is NO, acknowledge limitations
11. DO NOT use placeholder citations - only cite actual atom IDs from the evidence`;
  }
}
