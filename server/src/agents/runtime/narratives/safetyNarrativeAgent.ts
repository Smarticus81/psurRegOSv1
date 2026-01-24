/**
 * Safety Narrative Agent
 * 
 * SOTA agent for generating Serious Incidents and Complaints sections.
 * Specializes in safety-focused language, IMDRF coding, and severity analysis.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { PROMPT_TEMPLATES } from "../../llmService";

export class SafetyNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "SAFETY";

  protected readonly systemPrompt = PROMPT_TEMPLATES.SAFETY_NARRATIVE_SYSTEM;

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
    evidenceRecords: string
  ): string {
    // Calculate safety statistics
    const complaintAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("complaint")
    );
    const incidentAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("incident") || a.evidenceType.includes("vigilance")
    );
    const salesAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("sales")
    );

    const totalSales = salesAtoms.reduce((sum, a) => {
      const qty = Number(a.normalizedData.quantity || a.normalizedData.units_sold || 0);
      return sum + qty;
    }, 0);

    // Severity breakdown
    const bySeverity: Record<string, number> = {};
    for (const atom of complaintAtoms) {
      const severity = String(atom.normalizedData.severity || "UNKNOWN");
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    }

    // Patient outcomes
    const outcomes = complaintAtoms
      .map(a => a.normalizedData.patient_outcome || a.normalizedData.patientOutcome)
      .filter(Boolean);

    const complaintRate = totalSales > 0
      ? ((complaintAtoms.length / totalSales) * 1000).toFixed(2)
      : "N/A";

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Analyze safety data including serious incidents and complaints

## Device Context:
- Device Code: ${input.context.deviceCode}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## SAFETY STATISTICS:
- Total Complaints: ${complaintAtoms.length}
- Serious Incidents: ${incidentAtoms.length}
- Units Sold (denominator): ${totalSales.toLocaleString()}
- Complaint Rate: ${complaintRate} per 1,000 units

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
3. Provide complaint rates per 1,000 units where possible
4. Use IMDRF codes if available in the evidence
5. Reference specific evidence atoms [ATOM-xxx]
6. If zero incidents/complaints, explicitly state this is confirmed data (not a gap)`;
  }
}
