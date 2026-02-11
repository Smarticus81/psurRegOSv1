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
import { type AgentRoleContext } from "../../../services/agentRoleContextService";
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

    // Use canonical values
    const totalSales = metrics.sales.totalUnits.value;
    const complaintRate = metrics.complaints.ratePerThousand?.value ?? 0;
    const complaintRateStr = metrics.complaints.ratePerThousand
      ? metrics.complaints.ratePerThousand.formatted
      : "N/A";

    // Use engine data for harm-level classification if available
    const analytics = input.analyticsContext;
    const ca = analytics?.complaintAnalysis;
    const va = analytics?.vigilanceAnalysis;

    // Harm breakdown from engine (replaces ad-hoc severity breakdown)
    let harmBreakdownSection = "";
    if (ca && ca.metrics.byHarm.length > 0) {
      harmBreakdownSection = "## HARM CLASSIFICATION (Engine-Computed, ISO 14971):\n";
      for (const h of ca.metrics.byHarm.filter(h => h.count > 0)) {
        harmBreakdownSection += `- ${h.harmLevel}: ${h.count} (${h.percentage.toFixed(1)}%)\n`;
      }
    } else {
      // Fallback to ad-hoc severity breakdown from raw atoms
      const complaintAtoms = input.evidenceAtoms.filter(a => a.evidenceType.includes("complaint"));
      const bySeverity: Record<string, number> = {};
      for (const atom of complaintAtoms) {
        const severity = String(atom.normalizedData.severity || "UNKNOWN");
        bySeverity[severity] = (bySeverity[severity] || 0) + 1;
      }
      harmBreakdownSection = "## SEVERITY BREAKDOWN:\n";
      harmBreakdownSection += Object.entries(bySeverity).map(([sev, count]) => `- ${sev}: ${count}`).join("\n") || "- No severity data available";
    }

    // Vigilance engine data (IMDRF tables, outcomes)
    let vigilanceSection = "";
    if (va) {
      vigilanceSection = `
## VIGILANCE ANALYSIS (Engine-Computed):
- Total Serious Incidents: ${va.metrics.totalSeriousIncidents}
- Total Non-Serious Incidents: ${va.metrics.totalNonSeriousIncidents}
- Active FSCAs: ${va.metrics.activeFscas}
- Open CAPAs: ${va.metrics.openCapas}

### Incident Outcomes:
- Deaths: ${va.metrics.incidentsByOutcome.DEATH}
- Hospitalization: ${va.metrics.incidentsByOutcome.HOSPITALIZATION}
- Disability: ${va.metrics.incidentsByOutcome.DISABILITY}
- Required Medical Intervention: ${va.metrics.incidentsByOutcome.INTERVENTION_REQUIRED}

### Pre-Computed Narrative Blocks:
- Incidents: ${va.narrativeBlocks.seriousIncidentStatement}
- FSCAs: ${va.narrativeBlocks.fscaStatement}
- CAPAs: ${va.narrativeBlocks.capaStatement}`;
    }

    // Complaint engine narrative blocks
    let complaintNarrativeSection = "";
    if (ca) {
      complaintNarrativeSection = `
## COMPLAINT ANALYSIS (Engine-Computed):
- Total Complaints: ${ca.metrics.totalComplaints}
- Device-Related: ${ca.metrics.totalDeviceRelated}
- Patient Injury: ${ca.metrics.totalPatientInjury}
- Complaint Rate: ${ca.metrics.complaintRate.toFixed(2)} per 1,000 units`;

      if (ca.metrics.byCategory.length > 0) {
        complaintNarrativeSection += "\n- Top Categories:";
        for (const cat of ca.metrics.byCategory.slice(0, 5)) {
          complaintNarrativeSection += `\n  - ${cat.category}: ${cat.count} (${cat.percentage.toFixed(1)}%)`;
        }
      }
    }

    // Build dossier context section for safety
    let riskContextSection = "";
    if (dossierContext?.dossierExists) {
      riskContextSection = `
## DEVICE RISK CONTEXT (From Dossier):

${dossierContext.riskContext}

---

## THRESHOLD ANALYSIS:`;

      if (dossierContext.riskThresholds && totalSales > 0) {
        const threshold = dossierContext.riskThresholds.complaintRateThreshold;
        const status = complaintRate > threshold
          ? "ABOVE THRESHOLD - SIGNAL INVESTIGATION REQUIRED"
          : "Within acceptable limits";
        riskContextSection += `
- Current Complaint Rate: ${complaintRateStr} per 1,000 units
- Defined Threshold: ${threshold} per 1,000 units
- Status: ${status}`;
      }
    }

    const deviceName = input.context.deviceName || input.context.deviceCode;
    const totalComplaints = metrics.complaints.totalCount.formatted;
    const seriousIncidents = metrics.incidents.seriousCount.formatted;

    return `Generate the Serious Incidents section. Be concise — state facts directly.

## DATA:
- Device: ${deviceName}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}
- Total Complaints: ${totalComplaints}
- Serious Incidents: ${seriousIncidents}
- Units Sold: ${metrics.sales.totalUnits.formatted}
- Complaint Rate: ${complaintRateStr} per 1,000 units

${harmBreakdownSection}

${vigilanceSection}

${complaintNarrativeSection}

${riskContextSection}

## REQUIRED OUTPUT FORMAT:
1. Start with ONE sentence stating the total complaints and how they were evaluated: "During the data collection period [dates], [N] product complaints were reported. All reported complaints were evaluated for Serious Incidents and there are [N] serious incidents."

2. Then include three IMDRF tables by region. If zero incidents, each cell should read "N/A-No serious incident" with count 0 and rate 0%:
   - Table: Serious incidents by IMDRF Annex A (Medical Device Problem) by region
   - Table: Serious incidents by IMDRF Annex C (Cause Investigation) by region
   - Table: Serious incidents by IMDRF Annex F (Health Impact) by region

3. If there ARE incidents, list them with IMDRF codes, complaint numbers, regions, and outcomes.

## Evidence Records:
${evidenceRecords}`;
  }
}
