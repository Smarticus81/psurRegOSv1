/**
 * Benefit-Risk Narrative Agent
 * 
 * SOTA agent for generating Benefit-Risk Assessment sections.
 * Specializes in balanced argumentation and regulatory conclusions.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";

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
    evidenceRecords: string
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
      ? ((complaintAtoms.length / totalSales) * 1000).toFixed(2)
      : "N/A";

    const seriousRate = totalSales > 0
      ? ((seriousComplaints.length / totalSales) * 1000).toFixed(4)
      : "N/A";

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Comprehensive benefit-risk assessment

## Device Context:
- Device Code: ${input.context.deviceCode}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## RISK METRICS:
- Total Complaints: ${complaintAtoms.length}
- Serious Incidents: ${incidentAtoms.length}
- Serious/High Severity Complaints: ${seriousComplaints.length}
- Units Sold: ${totalSales.toLocaleString()}
- Complaint Rate: ${complaintRate} per 1,000 units
- Serious Event Rate: ${seriousRate} per 1,000 units

## BENEFIT DATA:
- Clinical Evidence Records: ${clinicalAtoms.length}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS:
1. This is a CRITICAL section - conclusion must be clear and justified
2. Present BOTH benefits and risks with equal rigor
3. Use specific numbers and rates
4. Compare to state of the art if data available
5. DO NOT include [ATOM-xxx] citations - they will be tracked via metadata
6. MUST END WITH CLEAR CONCLUSION:
   - "The benefit-risk profile remains FAVORABLE/ACCEPTABLE/UNFAVORABLE"
   - Include any conditions or recommendations
7. Write clean, professional prose without markdown symbols`;
  }
}
