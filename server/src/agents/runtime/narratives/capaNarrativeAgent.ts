/**
 * CAPA Narrative Agent
 * 
 * SOTA agent for generating Corrective and Preventive Action sections.
 * Specializes in root cause analysis and effectiveness verification.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";

export class CAPANarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "CAPA";
  
  protected readonly systemPrompt = `You are an expert medical device quality specialist specializing in CAPA documentation under EU MDR and ISO 13485.

## YOUR ROLE
Generate comprehensive CAPA narratives documenting corrective and preventive actions related to PMS findings, including root cause analysis and effectiveness verification.

## REGULATORY REQUIREMENTS (EU MDR Annex III)
CAPA section MUST include:
1. CAPAs triggered by PMS findings
2. Root cause analysis summary
3. Corrective actions implemented
4. Preventive actions planned/implemented
5. Effectiveness verification results
6. Link to original PMS findings

## CAPA TYPES
- Corrective Action: Addressing identified nonconformity
- Preventive Action: Preventing potential nonconformity
- Combined: Both corrective and preventive elements

## WRITING STANDARDS
- Use quality management terminology
- Include CAPA reference numbers
- Document clear linkage to PMS triggers
- Include effectiveness criteria and verification
- Write clean, professional prose without markdown formatting symbols

## CRITICAL: DO NOT USE CITATIONS IN OUTPUT
- Do NOT include [ATOM-xxx] or any citation markers in the narrative text
- Evidence references will be added automatically from metadata
- Write clean, readable prose without inline citations

## STRUCTURE:
1. Summary of CAPA activity during period
2. For each significant CAPA:
   - Reference number and type (C/P/Combined)
   - Trigger/source (complaint, audit, trend, etc.)
   - Root cause summary
   - Actions taken
   - Effectiveness verification
   - Status (Open/Closed)
3. Trend in CAPA activity
4. Conclusions on corrective/preventive effectiveness

## OUTPUT FORMAT
Write the narrative section content WITHOUT any citation markers. After the narrative, provide a JSON block:
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
      "CAPANarrativeAgent",
      "CAPA Narrative Agent"
    );
  }

  protected identifyGaps(input: NarrativeInput): string[] {
    const gaps: string[] = [];
    const evidenceTypes = new Set(input.evidenceAtoms.map(a => a.evidenceType));

    // Check for CAPA data
    if (!evidenceTypes.has("capa_record") && !evidenceTypes.has("capa_summary") && !evidenceTypes.has("ncr_record")) {
      gaps.push("No CAPA or NCR records - confirm if zero CAPAs or data gap");
    }

    // Check for effectiveness data
    const hasEffectiveness = input.evidenceAtoms.some(a => 
      a.normalizedData.effectiveness || 
      a.normalizedData.effectiveness_verification
    );
    if (!hasEffectiveness && (evidenceTypes.has("capa_record") || evidenceTypes.has("ncr_record"))) {
      gaps.push("No CAPA effectiveness verification data");
    }

    // Check for root cause analysis
    const hasRootCause = input.evidenceAtoms.some(a => 
      a.normalizedData.root_cause || 
      a.normalizedData.rootCause
    );
    if (!hasRootCause && evidenceTypes.has("capa_record")) {
      gaps.push("No root cause analysis documented in CAPA records");
    }

    return gaps;
  }

  protected buildUserPrompt(
    input: NarrativeInput,
    evidenceSummary: string,
    evidenceRecords: string
  ): string {
    // Extract CAPA-specific data
    const capaAtoms = input.evidenceAtoms.filter(a => 
      a.evidenceType.includes("capa") || a.evidenceType.includes("ncr")
    );

    const openCAPAs = capaAtoms.filter(a => 
      a.normalizedData.status === "OPEN" || 
      a.normalizedData.status === "In Progress" ||
      !a.normalizedData.close_date
    );

    const closedCAPAs = capaAtoms.filter(a => 
      a.normalizedData.status === "CLOSED" || 
      a.normalizedData.status === "Completed" ||
      a.normalizedData.close_date
    );

    // Group by type
    const byType: Record<string, number> = {};
    for (const atom of capaAtoms) {
      const type = String(atom.normalizedData.type || atom.normalizedData.capa_type || "Unspecified");
      byType[type] = (byType[type] || 0) + 1;
    }

    // Check for negative evidence (no CAPAs)
    const isNegativeEvidence = capaAtoms.some(a => 
      a.normalizedData.isNegativeEvidence === true
    );

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Document Corrective and Preventive Actions related to PMS findings

## Device Context:
- Device Code: ${input.context.deviceCode}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## CAPA STATISTICS:
- Total CAPAs: ${capaAtoms.length}
- Open: ${openCAPAs.length}
- Closed: ${closedCAPAs.length}
- Confirmed No CAPAs: ${isNegativeEvidence ? "YES" : "No"}

## BY TYPE:
${Object.entries(byType).map(([type, count]) => `- ${type}: ${count}`).join("\n") || "- No type breakdown available"}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS:
1. Focus on CAPAs TRIGGERED BY PMS findings (complaints, incidents, trends)
2. Document root cause analysis methodology and findings
3. Include effectiveness verification criteria and results
4. If ZERO CAPAs, explicitly state this is confirmed (not a gap)
5. Reference specific evidence atoms [ATOM-xxx]
6. Link CAPAs to their triggering PMS data where possible`;
  }
}
