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

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Document Corrective and Preventive Actions related to PMS findings

## Device Context:
- Device Code: ${input.context.deviceCode}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## CAPA STATISTICS (Canonical):
- Total CAPAs: ${capaAtoms.length}
- Open: ${openCAPAs.length}
- Closed: ${closedCAPAs.length}
- Confirmed No CAPAs: ${isNegativeEvidence ? "YES" : "No"}

## PMS TRIGGER CONTEXT (from Canonical Metrics):
- Total Complaints in Period: ${totalComplaints}
- Serious Incidents in Period: ${totalIncidents}
- FSCAs in Period: ${metrics.incidents.fscaCount.formatted}

## BY TYPE:
${Object.entries(byType).map(([type, count]) => `- ${type}: ${count}`).join("\n") || "- No type breakdown available"}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS:
1. Focus on CAPAs TRIGGERED BY PMS findings (complaints, incidents, trends)
2. Use the EXACT statistics above — do NOT recalculate from evidence records
3. Document root cause analysis methodology and findings
4. Include effectiveness verification criteria and results
5. If ZERO CAPAs, explicitly state this is confirmed (not a gap)
6. Reference specific evidence atoms [ATOM-xxx]
7. Link CAPAs to their triggering PMS data where possible`;
  }
}
