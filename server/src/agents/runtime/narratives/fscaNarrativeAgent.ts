/**
 * FSCA Narrative Agent
 * 
 * SOTA agent for generating Field Safety Corrective Action sections.
 * Specializes in recall and corrective action regulatory language.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { type DossierContext } from "../../../services/deviceDossierService";
import { type AgentRoleContext } from "../../../services/agentRoleService";
import { getCanonicalMetrics } from "../../../services/canonicalMetricsService";

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
    evidenceRecords: string,
    dossierContext?: DossierContext,
    agentRoleContext?: AgentRoleContext
  ): string {
    // Use CANONICAL METRICS for FSCA counts — ensures consistency with FSCA table
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

    const canonicalFscaCount = metrics.incidents.fscaCount.value;

    // Extract FSCA-specific data for detail breakdown
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

    // Use canonical count as the authoritative total
    const totalFSCAs = Math.max(canonicalFscaCount, fscaAtoms.length);

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Document all Field Safety Corrective Actions during the reporting period

## Device Context:
- Device Code: ${input.context.deviceCode}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## FSCA STATISTICS (Canonical):
- Total FSCAs: ${totalFSCAs}
- Open/Ongoing: ${openFSCAs.length}
- Closed: ${closedFSCAs.length}
- Confirmed No FSCAs: ${isNegativeEvidence ? "YES" : "No"}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS:
1. FSCAs are MANDATORY to report - completeness is essential
2. Use the EXACT statistics above — do NOT recalculate from evidence records
3. Include ALL FSCAs even if closed before period start (if relevant)
4. Document reason, scope, actions, and effectiveness for each
5. If ZERO FSCAs, explicitly state this is confirmed (not a gap)
6. Reference specific evidence atoms [ATOM-xxx]
7. Include any regulatory notifications made (Competent Authority reports)`;
  }
}
