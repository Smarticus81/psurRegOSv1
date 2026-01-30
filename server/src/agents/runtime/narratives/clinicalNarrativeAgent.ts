/**
 * Clinical Narrative Agent
 * 
 * SOTA agent for generating Literature Review, PMCF, and External DB sections.
 * Specializes in scientific/clinical language and citation formatting.
 * 
 * Uses Device Dossier Context for:
 * - PMCF plan objectives and endpoints
 * - Literature search protocol (databases, search strings, criteria)
 * - CER conclusions for context
 * - Equivalent devices for literature scope
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { type DossierContext } from "../../../services/deviceDossierService";

export class ClinicalNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "CLINICAL";

  constructor() {
    super(
      "ClinicalNarrativeAgent",
      "Clinical Narrative Agent"
    );
  }

  protected identifyGaps(input: NarrativeInput): string[] {
    const gaps: string[] = [];
    const evidenceTypes = new Set(input.evidenceAtoms.map(a => a.evidenceType));

    // Literature review requirements
    if (!evidenceTypes.has("literature_result") && !evidenceTypes.has("literature_review_summary")) {
      gaps.push("No literature review data");
    }

    // PMCF requirements
    if (!evidenceTypes.has("pmcf_result") && !evidenceTypes.has("pmcf_summary")) {
      gaps.push("No PMCF activity data");
    }

    // External database search
    if (!evidenceTypes.has("external_db_summary") && !evidenceTypes.has("external_db_query_log")) {
      gaps.push("No external database search documentation");
    }

    return gaps;
  }

  protected buildUserPrompt(
    input: NarrativeInput,
    evidenceSummary: string,
    evidenceRecords: string,
    dossierContext?: DossierContext
  ): string {
    // Extract clinical-specific data
    const literatureAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("literature")
    );
    const pmcfAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("pmcf")
    );
    const externalDBAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("external_db") || a.evidenceType.includes("maude")
    );

    // Determine section type from slot
    const isLiterature = input.slot.slotId.includes("LITERATURE");
    const isPMCF = input.slot.slotId.includes("PMCF");
    const isExternalDB = input.slot.slotId.includes("EXTERNAL");

    // Build dossier context section based on section type
    let dossierSection = "";
    let sectionGuidance = "";

    if (dossierContext?.dossierExists) {
      // Get clinical evidence data from dossier (need to fetch from full dossier)
      // For now, use the clinical context which contains PMCF/literature info

      if (isLiterature) {
        sectionGuidance = `
## LITERATURE REVIEW FOCUS:
- Total publications found in evidence: ${literatureAtoms.length}
- Focus on search methodology and relevant findings
- Identify any safety signals from literature`;

        // Add dossier literature protocol context
        dossierSection = `
## LITERATURE SEARCH CONTEXT (From Dossier):

${dossierContext.clinicalContext}

NOTE: Use the search protocol from the dossier to validate that the evidence 
covers the required databases and search criteria. Document any deviations.`;

      } else if (isPMCF) {
        sectionGuidance = `
## PMCF FOCUS:
- Total PMCF records in evidence: ${pmcfAtoms.length}
- Focus on PMCF plan objectives and activities
- Report against defined endpoints`;

        // Add dossier PMCF context
        dossierSection = `
## PMCF PLAN CONTEXT (From Dossier):

${dossierContext.clinicalContext}

IMPORTANT: The narrative must address progress against the PMCF plan objectives 
listed above. Report on each defined endpoint where data is available.`;

      } else if (isExternalDB) {
        sectionGuidance = `
## EXTERNAL DATABASE FOCUS:
- Total external DB records in evidence: ${externalDBAtoms.length}
- Focus on databases searched and search criteria
- Include any relevant events found`;

        dossierSection = `
## DEVICE CONTEXT FOR DATABASE SEARCH:

${dossierContext.productSummary}

Use the device identifiers and intended purpose to ensure external database 
searches are appropriately scoped.`;

      } else {
        // General clinical section
        dossierSection = `
## CLINICAL CONTEXT (From Dossier):

${dossierContext.productSummary}

---

${dossierContext.clinicalContext}`;
      }

      // Add CER conclusions if relevant
      if (dossierContext.clinicalContext.includes("CER") || 
          dossierContext.clinicalContext.includes("Clinical Evaluation")) {
        dossierSection += `

---

## CER REFERENCE:
The content should be consistent with conclusions from the most recent 
Clinical Evaluation Report. Reference the CER where appropriate.`;
      }

    } else {
      throw new Error("Device dossier required for clinical narrative. Create and complete a device dossier first.");
    }

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Clinical evidence review and analysis

## REPORTING PERIOD: ${input.context.periodStart} to ${input.context.periodEnd}
## DEVICE: ${input.context.deviceCode}

${dossierSection}

---
${sectionGuidance}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS:
1. Use appropriate scientific/clinical language
2. Document methodology (search strings, databases, dates) from both evidence AND dossier
3. If PMCF: Report against the specific endpoints defined in the dossier
4. If Literature: Validate coverage against the search protocol in dossier
5. Include specific counts and metrics
6. Cite publications properly where available (Author, Year)
7. Clearly identify any safety signals found
8. Reference CER conclusions where relevant
9. Write clean, professional prose without markdown symbols
10. DO NOT use placeholder citations - only cite actual atom IDs from evidence`;
  }
}
