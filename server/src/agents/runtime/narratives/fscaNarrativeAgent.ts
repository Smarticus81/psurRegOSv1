/**
 * FSCA Narrative Agent
 * 
 * SOTA agent for generating Field Safety Corrective Action sections.
 * Specializes in recall and corrective action regulatory language.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";

export class FSCANarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "FSCA";
  
  protected readonly systemPrompt = `You are an expert medical device regulatory writer specializing in Field Safety Corrective Actions (FSCAs) under EU MDR.

## YOUR ROLE
Generate comprehensive FSCA narratives documenting all field safety actions taken during the reporting period, including recalls, field modifications, and safety notices.

## REGULATORY REQUIREMENTS (EU MDR Article 83, Article 89)
FSCA section MUST include:
1. All FSCAs initiated during the period
2. Reason for each FSCA
3. Affected devices/lots/regions
4. Actions taken (recall, modification, notice)
5. Effectiveness of actions
6. Regulatory notifications made

## FSCA TYPES
- Product Recall: Physical retrieval of devices
- Field Safety Notice: Communication to users
- Field Modification: On-site correction
- Software Update: Remote correction

## WRITING STANDARDS
- Use precise regulatory terminology
- Include FSCA reference numbers
- Document affected quantities and regions
- Include timeline (initiation to closure)
- Write clean, professional prose without markdown formatting symbols

## CRITICAL: DO NOT USE CITATIONS IN OUTPUT
- Do NOT include [ATOM-xxx] or any citation markers in the narrative text
- Evidence references will be added automatically from metadata
- Write clean, readable prose without inline citations

## STRUCTURE:
1. Summary of FSCAs during period
2. For each FSCA:
   - Reference number and type
   - Reason/root cause
   - Affected devices (lot, serial, quantity)
   - Affected regions/markets
   - Actions taken
   - Effectiveness verification
   - Closure status
3. Ongoing FSCAs from previous periods
4. Conclusions on field safety

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
      "FSCANarrativeAgent",
      "FSCA Narrative Agent"
    );
  }

  protected identifyGaps(input: NarrativeInput): string[] {
    const gaps: string[] = [];
    const evidenceTypes = new Set(input.evidenceAtoms.map(a => a.evidenceType));

    // Check for FSCA data
    if (!evidenceTypes.has("fsca_record") && !evidenceTypes.has("fsca_summary") && !evidenceTypes.has("recall_record")) {
      gaps.push("No FSCA or recall records - confirm if zero FSCAs or data gap");
    }

    // Check for effectiveness data
    const hasEffectiveness = input.evidenceAtoms.some(a => 
      a.normalizedData.effectiveness || 
      a.normalizedData.effectiveness_verification ||
      a.normalizedData.closure_status
    );
    if (!hasEffectiveness && evidenceTypes.has("fsca_record")) {
      gaps.push("No FSCA effectiveness verification data");
    }

    return gaps;
  }

  protected buildUserPrompt(
    input: NarrativeInput,
    evidenceSummary: string,
    evidenceRecords: string
  ): string {
    // Extract FSCA-specific data
    const fscaAtoms = input.evidenceAtoms.filter(a => 
      a.evidenceType.includes("fsca") || a.evidenceType.includes("recall")
    );

    const openFSCAs = fscaAtoms.filter(a => 
      a.normalizedData.status === "OPEN" || 
      a.normalizedData.status === "In Progress" ||
      !a.normalizedData.date_closed
    );

    const closedFSCAs = fscaAtoms.filter(a => 
      a.normalizedData.status === "CLOSED" || 
      a.normalizedData.status === "Completed" ||
      a.normalizedData.date_closed
    );

    // Check for negative evidence (no FSCAs)
    const isNegativeEvidence = fscaAtoms.some(a => 
      a.normalizedData.isNegativeEvidence === true
    );

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Document all Field Safety Corrective Actions during the reporting period

## Device Context:
- Device Code: ${input.context.deviceCode}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## FSCA STATISTICS:
- Total FSCAs: ${fscaAtoms.length}
- Open/Ongoing: ${openFSCAs.length}
- Closed: ${closedFSCAs.length}
- Confirmed No FSCAs: ${isNegativeEvidence ? "YES" : "No"}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS:
1. FSCAs are MANDATORY to report - completeness is essential
2. Include ALL FSCAs even if closed before period start (if relevant)
3. Document reason, scope, actions, and effectiveness for each
4. If ZERO FSCAs, explicitly state this is confirmed (not a gap)
5. Reference specific evidence atoms [ATOM-xxx]
6. Include any regulatory notifications made (Competent Authority reports)`;
  }
}
