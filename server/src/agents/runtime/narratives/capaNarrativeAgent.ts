/**
 * CAPA Narrative Agent
 * 
 * SOTA agent for generating Corrective and Preventive Action sections.
 * Specializes in root cause analysis and effectiveness verification.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { type DossierContext } from "../../../services/deviceDossierService";
import { type AgentRoleContext } from "../../../services/agentRoleService";
import { getCanonicalMetrics } from "../../../services/canonicalMetricsService";

export class CAPANarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "CAPA";

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
    evidenceRecords: string,
    dossierContext?: DossierContext,
    agentRoleContext?: AgentRoleContext
  ): string {
    // Use CANONICAL METRICS for CAPA-related counts for cross-section consistency
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

    // Extract CAPA-specific data for detail breakdown
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

    // Cross-reference: include complaint/incident context so CAPA narrative
    // can reference the correct trigger counts
    const totalComplaints = metrics.complaints.totalCount.formatted;
    const totalIncidents = metrics.incidents.seriousCount.formatted;

    const deviceName = input.context.deviceName || input.context.deviceCode;

    return `Generate the CAPA section. Be concise.

## DATA:
- Device: ${deviceName}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}
- Total CAPAs: ${capaAtoms.length}
- Open: ${openCAPAs.length}
- Closed: ${closedCAPAs.length}

## REQUIRED OUTPUT FORMAT:
Start with ONE sentence: "During the surveillance period (${input.context.periodStart} – ${input.context.periodEnd}), there ${capaAtoms.length === 0 ? "were no CAPAs" : `${capaAtoms.length === 1 ? "was 1 CAPA" : `were ${capaAtoms.length} CAPAs`}`} associated with ${deviceName}."

${capaAtoms.length > 0
      ? `Then include a table with columns: CAPA Number | Initiation Date | Status (Open/Closed + Date) | CAPA Description | Root Cause | Effectiveness | Target Date
Populate from the evidence records below. Include the actual CAPA reference numbers.`
      : `If zero CAPAs, the section is complete after that one sentence. Do not add anything else.`}

Do NOT write lengthy analysis. Keep it factual and tabular.

## Evidence Records:
${evidenceRecords}`;
  }
}
