/**
 * Conclusion Narrative Agent
 * 
 * SOTA agent for generating Conclusions and Actions sections.
 * Specializes in forward-looking statements and regulatory commitments.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { type DossierContext } from "../../../services/deviceDossierService";
import { type AgentRoleContext } from "../../../services/agentRoleContextService";
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
    evidenceRecords: string,
    dossierContext?: DossierContext,
    agentRoleContext?: AgentRoleContext
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

    const openCAPAs = capaAtoms.filter(a =>
      !a.normalizedData.close_date && a.normalizedData.status !== "CLOSED"
    );

    // Engine data for comprehensive conclusion
    const analytics = input.analyticsContext;

    // Engine summaries for the conclusion section
    let engineSummarySection = "";
    if (analytics) {
      engineSummarySection = "\n## ENGINE ANALYSIS SUMMARIES (Pre-Computed):";

      if (analytics.complaintAnalysis) {
        const ca = analytics.complaintAnalysis;
        engineSummarySection += `
### Complaint Analysis:
- Complaint Rate: ${ca.metrics.complaintRate.toFixed(2)} per 1,000 units
- Trend: ${ca.trendAnalysis.isIncreasing ? "INCREASING" : "DECREASING"} (slope: ${ca.trendAnalysis.slope.toFixed(6)})
- UCL Excursions: ${ca.trendAnalysis.excursions.length}
- Article 88 Required: ${ca.article88Required ? "YES" : "NO"}`;
      }

      if (analytics.vigilanceAnalysis) {
        const va = analytics.vigilanceAnalysis;
        engineSummarySection += `
### Vigilance:
- Serious Incidents: ${va.metrics.totalSeriousIncidents}
- Active FSCAs: ${va.metrics.activeFscas}
- Open CAPAs: ${va.metrics.openCapas}
- Deaths: ${va.metrics.incidentsByOutcome.DEATH}`;
      }

      if (analytics.literatureAnalysis) {
        const la = analytics.literatureAnalysis;
        engineSummarySection += `
### Literature:
- No New Risks: ${la.conclusions.noNewRisksIdentified ? "CONFIRMED" : "NEW RISKS FOUND"}
- State of Art Aligned: ${la.conclusions.stateOfArtAligned ? "YES" : "NO"}`;
      }

      if (analytics.pmcfDecision) {
        const pd = analytics.pmcfDecision;
        engineSummarySection += `
### PMCF:
- PMCF Required: ${pd.pmcfRequired ? "YES" : "NO"}
- Decision: ${pd.decision}`;
      }

      if (analytics.salesExposure) {
        const se = analytics.salesExposure;
        engineSummarySection += `
### Sales/Exposure:
- Total Units: ${se.metrics.totalUnitsSoldInPeriod.toLocaleString()}
- Regions: ${se.metrics.regionBreakdown.length}`;
      }
    }

    // Dossier context for prior PSUR conclusions and device specifics
    let dossierSection = "";
    if (dossierContext?.dossierExists) {
      if (dossierContext.priorPsurConclusion) {
        dossierSection += `
## PRIOR PSUR CONCLUSIONS (From Dossier):
- Period: ${dossierContext.priorPsurConclusion.periodStart} to ${dossierContext.priorPsurConclusion.periodEnd}
- B/R Conclusion: ${dossierContext.priorPsurConclusion.benefitRiskConclusion}`;

        const openActions = dossierContext.priorPsurConclusion.actionsRequired.filter(a => !a.completed);
        if (openActions.length > 0) {
          dossierSection += "\n- Outstanding Actions:";
          for (const action of openActions) {
            dossierSection += `\n  - ${action.description}${action.dueDate ? ` (Due: ${action.dueDate})` : ""}`;
          }
        }
      }

      if (dossierContext.clinicalBenefits.length > 0) {
        dossierSection += "\n\n## CLINICAL BENEFITS (For B/R Statement):";
        for (const benefit of dossierContext.clinicalBenefits.slice(0, 3)) {
          dossierSection += `\n- ${benefit.description} (${benefit.endpoint})`;
        }
      }
    }

    // Check for signals from engine data
    const signalsDetected = analytics?.complaintAnalysis?.trendAnalysis.isStatisticallySignificant ||
      input.evidenceAtoms.some(a => a.normalizedData.signal_detected === true);

    const deviceName = input.context.deviceName || input.context.deviceCode;

    return `Generate the Findings and Conclusions section. This must be concise — TWO paragraphs maximum.

## DATA:
- Device: ${deviceName}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}
- Units Distributed: ${metrics.sales.totalUnits.formatted}
- Total Complaints: ${metrics.complaints.totalCount.formatted}
- Serious Incidents: ${metrics.incidents.seriousCount.formatted}
- FSCAs: ${metrics.incidents.fscaCount.formatted}
- CAPAs: ${capaAtoms.length} (${openCAPAs.length} open)
- Signals Detected: ${signalsDetected ? "YES" : "None"}

${engineSummarySection}

${dossierSection}

## REQUIRED OUTPUT FORMAT:
Write exactly TWO paragraphs. Model it after this example:

PARAGRAPH 1: "Based on a comprehensive analysis of all surveillance data collected during the data collection period (${input.context.periodStart} to ${input.context.periodEnd}) including sales data, vigilance information, customer feedback, clinical literature, external databases for this device or similar devices, CAPAs and Field Safety Corrective Actions (FSCAs), there were no changes to the risk documentation required. All intended benefits of the device have been achieved, and no side effects, no new or emerging risks or benefits have been identified. The benefit-risk profile has not been adversely impacted and remains acceptable and unchanged."

PARAGRAPH 2: "There are no limitations to the data used in this analysis. [State any actions taken or 'No actions were taken to update' the PMS Plan, Product Design, Manufacturing Process, Instructions for Use, Labeling, Clinical Evaluation Report, or Summary of Safety and Clinical Performance.] Overall, the device continues to perform safely and effectively as intended, and the benefit-risk profile remains positive."

Adapt the text to match the actual data provided. If there WERE incidents, CAPAs, or signals, modify the conclusion accordingly while keeping the same concise format.

## Evidence Records:
${evidenceRecords}`;
  }
}
