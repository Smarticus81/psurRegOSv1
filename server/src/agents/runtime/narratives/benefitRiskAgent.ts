/**
 * Benefit-Risk Narrative Agent
 * 
 * SOTA agent for generating Benefit-Risk Assessment sections.
 * Specializes in balanced argumentation and regulatory conclusions.
 * 
 * Uses Device Dossier Context for:
 * - Clinical benefits (quantified) for the BENEFIT side
 * - Principal identified risks for the RISK side
 * - Risk acceptability criteria for determining acceptable B/R
 * - State of the art comparison
 * - Prior PSUR B/R conclusions for continuity
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { type DossierContext } from "../../../services/deviceDossierService";
import { type AgentRoleContext } from "../../../services/agentRoleContextService";
import { getCanonicalMetrics } from "../../../services/canonicalMetricsService";

export class BenefitRiskNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "BENEFIT_RISK";

  constructor() {
    super(
      "BenefitRiskNarrativeAgent",
      "Benefit-Risk Narrative Agent"
    );
  }

  protected identifyGaps(input: NarrativeInput): string[] {
    const gaps: string[] = [];
    const evidenceTypes = new Set(input.evidenceAtoms.map(a => a.evidenceType));

    // B/R assessment needs comprehensive data
    if (!evidenceTypes.has("benefit_risk_assessment") &&
        !evidenceTypes.has("benefit_risk_quantification") &&
        !evidenceTypes.has("clinical_evaluation_extract") &&
        !evidenceTypes.has("cer_clinical_benefits")) {
      gaps.push("No existing benefit-risk assessment or clinical evaluation data");
    }

    if (!evidenceTypes.has("risk_analysis") &&
        !evidenceTypes.has("hazard_analysis") &&
        !evidenceTypes.has("rmf_hazard_analysis") &&
        !evidenceTypes.has("rmf_risk_assessment_post")) {
      gaps.push("No risk management data for risk side of B/R");
    }

    // Need PMS data for current period risks
    const hasPMSData = input.evidenceAtoms.some(a =>
      a.evidenceType.includes("complaint") ||
      a.evidenceType.includes("incident")
    );
    if (!hasPMSData) {
      gaps.push("No PMS data for current period risk assessment");
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

    const totalSales = metrics.sales.totalUnits.value;
    const complaintRate = metrics.complaints.ratePerThousand?.value ?? 0;
    const complaintRateStr = metrics.complaints.ratePerThousand
      ? metrics.complaints.ratePerThousand.formatted
      : "N/A";
    const seriousRate = totalSales > 0
      ? ((metrics.incidents.seriousCount.value / totalSales) * 1000).toFixed(4)
      : "N/A";

    const clinicalAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("clinical") ||
      a.evidenceType.includes("pmcf") ||
      a.evidenceType.includes("benefit")
    );

    // Engine data for deterministic B/R inputs
    const analytics = input.analyticsContext;

    // Quantitative B/R engine data
    let quantitativeBRSection = "";
    if (analytics?.benefitRiskAnalysis) {
      const br = analytics.benefitRiskAnalysis;
      quantitativeBRSection = `
## QUANTITATIVE BENEFIT-RISK ANALYSIS (Engine-Computed):

### BENEFITS:
- Primary Clinical Benefit: ${br.benefits.primaryClinicalBenefit}
- Performance: ${br.benefits.benefitMagnitude}${br.benefits.benefitUnits}
- Evidence: ${br.benefits.evidenceSource}
- Patient Population: ${br.benefits.patientPopulationSize.toLocaleString()} procedures

### RISKS:
- Serious Incidents: ${br.risks.seriousIncidents} (${br.risks.seriousIncidentRate.toFixed(2)} per 1,000 uses)
  - Deaths: ${br.risks.deaths}
  - Serious Injuries: ${br.risks.seriousInjuries}
  - Malfunctions (no harm): ${br.risks.malfunctionsNoHarm}
- Confirmed Complaint Rate: ${br.risks.confirmedComplaintRate.toFixed(4)} per 1,000 units

### DETERMINATION:
- Benefit-Risk Ratio: ${br.benefitRiskRatio === Infinity ? "∞ (no risk events)" : br.benefitRiskRatio.toFixed(0) + ":1"}
- Acceptability Threshold (from RMF): ${br.acceptabilityThreshold}:1
- STATUS: ${br.determination}
- Change from Previous PSUR: ${br.changeFromPrevious}

### CONDITION CHECKS:
${br.conditionChecks.map(c => `- [${c.weight.toUpperCase()}] ${c.label}: ${c.passed ? "PASS" : "FAIL"} (${c.detail})`).join("\n")}`;

      if (br.comparative.available) {
        quantitativeBRSection += `

### COMPARATIVE ANALYSIS (vs. ${br.comparative.alternativeTherapy}):
- Benefit Advantage: ${br.comparative.benefitDelta > 0 ? "+" : ""}${br.comparative.benefitDelta.toFixed(1)}${br.benefits.benefitUnits}
- Risk Profile: ${br.comparative.riskDelta < 0 ? "" : "+"}${br.comparative.riskDelta.toFixed(3)} per 1,000 ${br.comparative.riskDelta < 0 ? "fewer" : "more"} incidents`;
      }
    }

    // PMCF decision from engine
    let pmcfSection = "";
    if (analytics?.pmcfDecision) {
      const pd = analytics.pmcfDecision;
      pmcfSection = `
## PMCF DECISION (Engine-Computed):
- PMCF Required: ${pd.pmcfRequired ? "YES" : "NO"}
- Decision: ${pd.decision}
- Justification: ${pd.justification.overallConclusion}`;
    }

    // Literature conclusions from engine
    let literatureSection = "";
    if (analytics?.literatureAnalysis) {
      const la = analytics.literatureAnalysis;
      literatureSection = `
## LITERATURE CONCLUSIONS (Engine-Computed):
- No New Risks Identified: ${la.conclusions.noNewRisksIdentified ? "CONFIRMED" : "NEW RISKS FOUND"}
- State of Art Aligned: ${la.conclusions.stateOfArtAligned ? "YES" : "NO"}
- Safety Profile Confirmed: ${la.conclusions.safetyProfileConfirmed ? "YES" : "NO"}
- References Reviewed: ${la.metrics.totalReferencesReviewed}
- Safety Signals Found: ${la.metrics.safetySignalsIdentified}`;
    }

    // Build dossier context section - critical for non-generic B/R assessment
    let benefitRiskContextSection = "";
    if (dossierContext?.dossierExists) {
      if (dossierContext.clinicalBenefits.length > 0) {
        benefitRiskContextSection = `
## DEFINED CLINICAL BENEFITS (From Dossier):
These are the claimed benefits that must be weighed against observed risks:
`;
        for (const benefit of dossierContext.clinicalBenefits) {
          benefitRiskContextSection += `
### ${benefit.description}
- Endpoint: ${benefit.endpoint}
- Evidence Source: ${benefit.evidenceSource}
${benefit.quantifiedValue ? `- Quantified Value: ${benefit.quantifiedValue}` : ""}`;
        }
      }

      if (dossierContext.clinicalContext) {
        benefitRiskContextSection += `\n\n---\n\n${dossierContext.clinicalContext}`;
      }

      benefitRiskContextSection += `\n\n---\n\n${dossierContext.riskContext}`;

      if (dossierContext.priorPsurConclusion) {
        benefitRiskContextSection += `

---

## PRIOR PSUR B/R CONCLUSION:
- Period: ${dossierContext.priorPsurConclusion.periodStart} to ${dossierContext.priorPsurConclusion.periodEnd}
- Conclusion: ${dossierContext.priorPsurConclusion.benefitRiskConclusion}`;

        if (dossierContext.priorPsurConclusion.keyFindings.length > 0) {
          benefitRiskContextSection += "\n- Key Findings:";
          for (const finding of dossierContext.priorPsurConclusion.keyFindings.slice(0, 5)) {
            benefitRiskContextSection += `\n  - ${finding}`;
          }
        }

        const openActions = dossierContext.priorPsurConclusion.actionsRequired.filter(a => !a.completed);
        if (openActions.length > 0) {
          benefitRiskContextSection += "\n- Outstanding Actions from Prior PSUR:";
          for (const action of openActions) {
            benefitRiskContextSection += `\n  - ${action.description}${action.dueDate ? ` (Due: ${action.dueDate})` : ""}`;
          }
        }
      }

      if (dossierContext.riskThresholds && totalSales > 0) {
        const threshold = dossierContext.riskThresholds.complaintRateThreshold;
        const status = complaintRate > threshold
          ? "ABOVE THRESHOLD - B/R may be affected"
          : "Within acceptable limits";
        benefitRiskContextSection += `

---

## THRESHOLD STATUS FOR B/R DETERMINATION:
- Current Complaint Rate: ${complaintRateStr} per 1,000 units
- Defined Threshold: ${threshold} per 1,000 units
- Status: ${status}`;
      }
    } else {
      benefitRiskContextSection = `
## DEVICE CONTEXT: Limited Information Available

NOTE: No device dossier found. B/R assessment based on evidence data and engine analysis only.`;
    }

    const deviceName = input.context.deviceName || input.context.deviceCode;
    const hasSeriousIssues = metrics.incidents.seriousCount.value > 0;
    const brDetermination = analytics?.benefitRiskAnalysis?.determination;
    const isFavorable = brDetermination === "FAVORABLE" || brDetermination === "ACCEPTABLE";

    return `Generate the Benefit-Risk Determination section. This is the single most important statement in the PSUR.

## DATA:
- Device: ${deviceName}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}
- Units Distributed: ${metrics.sales.totalUnits.formatted}
- Total Complaints: ${metrics.complaints.totalCount.formatted}
- Complaint Rate: ${complaintRateStr} per 1,000 units
- Serious Incidents: ${metrics.incidents.seriousCount.formatted}

${quantitativeBRSection}

${benefitRiskContextSection}

${pmcfSection}

${literatureSection}

## REQUIRED OUTPUT FORMAT:

Write 3-5 paragraphs with quantitative justification:

1. **Clinical Benefit Summary** (1 paragraph):
   State the primary clinical benefit with quantified performance data and evidence source.
   State how many patients/procedures benefited during this period.

2. **Safety Profile** (1 paragraph):
   Quantify the serious incident rate per 1,000 uses. State deaths, injuries, malfunctions.
   State the confirmed complaint rate and compare to RMF maximum acceptable rate.
   Reference IMDRF harm classifications where applicable.

3. **Benefit-Risk Ratio** (1 paragraph):
   State the quantitative benefit-risk ratio. Compare to the acceptability threshold from the RMF.
   If comparative data is available, state the comparison vs. alternative therapy.
   Compare to the previous PSUR period if available.

4. **Conclusion** (1 paragraph):
   "${isFavorable
      ? `Based on comprehensive analysis, the benefit-risk profile of ${deviceName} has NOT been adversely impacted and remains ACCEPTABLE per MDCG 2022-21.`
      : `Based on analysis, the benefit-risk profile of ${deviceName} has been adversely impacted. Immediate corrective action is required.`}"
   State that all identified risks remain within acceptable limits (or identify which do not).

Use exact numbers from the engine-computed data above. Do NOT invent different values.
Write in professional regulatory tone. Quantify everything.

## Evidence Records:
${evidenceRecords}`;
  }
}
