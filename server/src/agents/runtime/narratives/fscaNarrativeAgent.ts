/**
 * FSCA Narrative Agent
 * 
 * SOTA agent for generating Field Safety Corrective Action sections.
 * Specializes in recall and corrective action regulatory language.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";

export class FSCANarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "FSCA";

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
