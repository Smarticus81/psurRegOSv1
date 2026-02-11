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
 * consistency with other sections.
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

    // Determine B/R conclusion text
    const hasSeriousIssues = seriousIncidents.value > 0;
    const brText = hasSeriousIssues
      ? "has been adversely impacted"
      : "has NOT been adversely impacted and remains UNCHANGED";

    return `Generate the Executive Summary section. Use ONLY the data below — do not invent numbers.

## DATA:
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}
- Device: ${input.context.deviceName || input.context.deviceCode}
- Units Distributed: ${totalUnits.formatted}
- Total Complaints: ${totalComplaints.formatted}
- Serious Incidents: ${seriousIncidents.formatted}
- FSCAs: ${fscaCount.formatted}
${complaintRate ? `- Complaint Rate: ${complaintRate.formatted} per 1,000 units` : ""}

${deviceContextSection}

## REQUIRED OUTPUT FORMAT:
Write the following subsections in this exact order. Be concise — the entire section should be under 250 words.

**Previous PSUR Actions Status**
State any actions from the previous PSUR and their status. If none, write: "There are no actions taken from previous PSUR."

**Notified Body Review Status**
State whether the previous PSUR was reviewed by the Notified Body and any actions taken. If unknown, write "N/A".

**Benefit-Risk Assessment Conclusion**
Write: "Based on the analysis of the collected data, it is concluded that the benefit-risk profile of the device(s) ${brText}."
Then write ONE paragraph summarizing the key numbers: units distributed, complaints, serious incidents, FSCAs, and the overall conclusion. Model it after this example:

"During the data collection period, ${totalUnits.formatted} units were distributed globally. There were ${totalComplaints.formatted} complaints, ${seriousIncidents.formatted} serious incidents, and ${fscaCount.formatted} Field Safety Corrective Actions (FSCAs) during the reporting period. Based on the comprehensive analysis of all collected post-market surveillance data during this reporting period, the benefit-risk profile has not been adversely impacted and remains unchanged."

## Evidence Records (for reference):
${evidenceRecords}`;
  }
}
