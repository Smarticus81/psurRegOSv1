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
    if (!evidenceTypes.has("benefit_risk_assessment") && !evidenceTypes.has("clinical_evaluation_extract")) {
      gaps.push("No existing benefit-risk assessment or clinical evaluation data");
    }

    if (!evidenceTypes.has("risk_analysis") && !evidenceTypes.has("hazard_analysis")) {
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
    dossierContext?: DossierContext
  ): string {
    // Calculate risk metrics
    const complaintAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("complaint")
    );
    const incidentAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("incident")
    );
    const salesAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("sales")
    );
    const clinicalAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("clinical") ||
      a.evidenceType.includes("pmcf") ||
      a.evidenceType.includes("benefit")
    );

    const totalSales = salesAtoms.reduce((sum, a) => {
      const qty = Number(a.normalizedData.quantity || a.normalizedData.units_sold || 0);
      return sum + qty;
    }, 0);

    // Severity breakdown
    const seriousComplaints = complaintAtoms.filter(a =>
      a.normalizedData.severity === "HIGH" ||
      a.normalizedData.severity === "CRITICAL" ||
      a.normalizedData.serious === true
    );

    const complaintRate = totalSales > 0
      ? (complaintAtoms.length / totalSales) * 1000
      : 0;
    const complaintRateStr = totalSales > 0 ? complaintRate.toFixed(2) : "N/A";

    const seriousRate = totalSales > 0
      ? ((seriousComplaints.length / totalSales) * 1000).toFixed(4)
      : "N/A";

    // Build dossier context section - critical for non-generic B/R assessment
    let benefitRiskContextSection = "";
    if (dossierContext?.dossierExists) {
      // Clinical benefits section
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

      // Clinical context
      if (dossierContext.clinicalContext) {
        benefitRiskContextSection += `

---

${dossierContext.clinicalContext}`;
      }

      // Risk context
      benefitRiskContextSection += `

---

${dossierContext.riskContext}`;

      // Prior B/R conclusion for continuity
      if (dossierContext.priorPsurConclusion) {
        benefitRiskContextSection += `

---

## PRIOR PSUR B/R CONCLUSION:
- Period: ${dossierContext.priorPsurConclusion.periodStart} to ${dossierContext.priorPsurConclusion.periodEnd}
- Conclusion: ${dossierContext.priorPsurConclusion.benefitRiskConclusion}`;
        
        if (dossierContext.priorPsurConclusion.keyFindings.length > 0) {
          benefitRiskContextSection += `
- Key Findings:`;
          for (const finding of dossierContext.priorPsurConclusion.keyFindings.slice(0, 5)) {
            benefitRiskContextSection += `
  - ${finding}`;
          }
        }

        const openActions = dossierContext.priorPsurConclusion.actionsRequired.filter(a => !a.completed);
        if (openActions.length > 0) {
          benefitRiskContextSection += `
- Outstanding Actions from Prior PSUR:`;
          for (const action of openActions) {
            benefitRiskContextSection += `
  - ${action.description}${action.dueDate ? ` (Due: ${action.dueDate})` : ""}`;
          }
        }
      }

      // Threshold status
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

NOTE: No device dossier found. The B/R assessment will be based on:
- Evidence data only (no defined clinical benefits to reference)
- No risk acceptability criteria defined
- No prior PSUR conclusions for comparison

Consider creating a device dossier to enable device-specific B/R assessment with:
- Quantified clinical benefits to weigh against risks
- Risk acceptability criteria and thresholds
- Prior PSUR conclusions for continuity
- State of the art comparison data`;
    }

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Comprehensive benefit-risk assessment with justified conclusion

## REPORTING PERIOD: ${input.context.periodStart} to ${input.context.periodEnd}
## DEVICE: ${input.context.deviceCode}

${benefitRiskContextSection}

---

## CURRENT PERIOD RISK METRICS:
- Total Complaints: ${complaintAtoms.length}
- Serious Incidents: ${incidentAtoms.length}
- Serious/High Severity Complaints: ${seriousComplaints.length}
- Units Distributed: ${totalSales.toLocaleString()}
- Complaint Rate: ${complaintRateStr} per 1,000 units
- Serious Event Rate: ${seriousRate} per 1,000 units

## BENEFIT EVIDENCE:
- Clinical Evidence Records: ${clinicalAtoms.length}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS FOR B/R ASSESSMENT:
1. This is the MOST CRITICAL section - conclusion must be clear and justified
2. WEIGH the specific clinical benefits from dossier against observed risks
3. Use the risk acceptability criteria from dossier if available
4. COMPARE to state of the art if mentioned in dossier
5. REFERENCE the prior PSUR conclusion and assess continuity
6. Address any outstanding actions from prior PSUR
7. Use specific numbers and rates - never generic statements
8. MUST END WITH CLEAR CONCLUSION using one of:
   - "The benefit-risk profile remains FAVORABLE" (risks acceptable, benefits clear)
   - "The benefit-risk profile remains ACCEPTABLE" (risks manageable with conditions)
   - "The benefit-risk profile is UNFAVORABLE" (only if serious concerns exist)
9. Include any conditions, limitations, or recommendations
10. Write clean, professional regulatory prose
11. DO NOT use placeholder citations - only cite actual atom IDs from evidence`;
  }
}
