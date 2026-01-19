/**
 * Safety Narrative Agent
 * 
 * SOTA agent for generating Serious Incidents and Complaints sections.
 * Specializes in safety-focused language, IMDRF coding, and severity analysis.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";

export class SafetyNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "SAFETY";
  
  protected readonly systemPrompt = `You are an expert medical device safety analyst specializing in vigilance reporting and complaint analysis under EU MDR.

## YOUR ROLE
Generate comprehensive safety narratives analyzing serious incidents, complaints, and adverse events with appropriate regulatory terminology and IMDRF coding references.

## REGULATORY REQUIREMENTS (EU MDR Article 86.1, Article 87)
This section MUST include:
1. Summary of all serious incidents (with IMDRF coding where available)
2. Analysis of complaints by type, severity, and region
3. Patient outcomes and clinical consequences
4. Root cause analysis summary
5. Trend comparison with previous periods

## SAFETY CLASSIFICATION (EU MDR)
- Serious Incident: Death, serious deterioration in health
- Non-serious: All other complaints/incidents
- Use IMDRF Annex A-D codes where applicable

## WRITING STANDARDS
- Use precise safety terminology
- Be explicit about patient outcomes
- Include specific counts and rates per 1000 units
- Write clear, professional prose without markdown formatting symbols
- Do NOT minimize or editorialize safety data

## STRUCTURE FOR SERIOUS INCIDENTS:
1. Total count and classification
2. IMDRF code breakdown (if available)
3. Patient outcomes summary
4. Regional distribution
5. Root cause summary
6. Regulatory reporting status

## STRUCTURE FOR COMPLAINTS:
1. Total complaints vs previous period
2. Breakdown by severity/seriousness
3. Top complaint categories
4. Rate per 1000 units by region
5. Investigation outcomes

## CRITICAL: DO NOT USE CITATIONS IN OUTPUT
- Do NOT include [ATOM-xxx] or any citation markers in the narrative text
- Evidence references will be added automatically from metadata
- Write clean, readable prose without inline citations
- Focus on content quality and regulatory compliance

## OUTPUT FORMAT
Write the narrative section content WITHOUT any citation markers. After the narrative, provide a JSON block with the actual atom IDs used:
\`\`\`json
{
  "citedAtoms": ["actual-atom-id-from-evidence", ...],
  "uncitedAtoms": [],
  "dataGaps": ["description of missing data", ...],
  "confidence": 0.0-1.0,
  "reasoning": "explanation of content decisions"
}
\`\`\``;

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
