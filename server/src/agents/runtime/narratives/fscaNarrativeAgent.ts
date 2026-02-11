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

    const deviceName = input.context.deviceName || input.context.deviceCode;

    return `Generate the FSCA section. Be concise.

## DATA:
- Device: ${deviceName}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}
- Total FSCAs: ${totalFSCAs}
- Open: ${openFSCAs.length}
- Closed: ${closedFSCAs.length}

## REQUIRED OUTPUT FORMAT:
${totalFSCAs === 0
      ? `Include a table with columns: Type of action | Manufacturer Reference number | Issuing Date | Scope of FSCA | Status | Rationale | Impacted regions
Put a single row: "N/A – There were no FSCAs initiated or closed during the data collection period for ${deviceName}"`
      : `For each FSCA, provide a table with columns: Type of action | Manufacturer Reference number | Issuing Date / Date of Final FSN | Scope of FSCA/Device models | Status | Rationale and description of action taken | Impacted regions
Then add a brief paragraph describing the actions and their outcomes.`}

Do NOT write lengthy analysis. If zero FSCAs, the entire section output should be just the table.

## Evidence Records:
${evidenceRecords}`;
  }
}
