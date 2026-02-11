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

    // Build section guidance based on canonical evidence data
    if (isLiterature) {
      sectionGuidance = `
## LITERATURE REVIEW FOCUS:
- Total publications found in evidence: ${literatureAtoms.length}
- Focus on search methodology and relevant findings
- Identify any safety signals from literature
- Summarize key findings by topic/theme`;
    } else if (isPMCF) {
      sectionGuidance = `
## PMCF FOCUS:
- Total PMCF records in evidence: ${pmcfAtoms.length}
- Focus on PMCF activities and data collected
- Report on clinical endpoints and outcomes
- Identify any trends or signals requiring attention`;
    } else if (isExternalDB) {
      sectionGuidance = `
## EXTERNAL DATABASE FOCUS:
- Total external DB records in evidence: ${externalDBAtoms.length}
- Report on databases searched (MAUDE, EUDAMED, etc.)
- Summarize search criteria and date ranges
- Report any relevant events or signals found`;
    } else {
      sectionGuidance = `
## CLINICAL SECTION FOCUS:
- Synthesize clinical evidence from uploaded data
- Focus on safety and performance findings`;
    }

    // Include dossier context if available for richer content
    if (dossierContext?.dossierExists) {
      if (isLiterature) {
        dossierSection = `
## LITERATURE SEARCH CONTEXT (From Dossier):

${dossierContext.clinicalContext}

NOTE: Use the search protocol from the dossier to validate that the evidence 
covers the required databases and search criteria. Document any deviations.`;
      } else if (isPMCF) {
        dossierSection = `
## PMCF PLAN CONTEXT (From Dossier):

${dossierContext.clinicalContext}

IMPORTANT: The narrative must address progress against the PMCF plan objectives 
listed above. Report on each defined endpoint where data is available.`;
      } else if (isExternalDB) {
        dossierSection = `
## DEVICE CONTEXT FOR DATABASE SEARCH:

${dossierContext.productSummary}

Use the device identifiers and intended purpose to ensure external database 
searches are appropriately scoped.`;
      } else {
        dossierSection = `
## CLINICAL CONTEXT (From Dossier):

${dossierContext.productSummary}

---

${dossierContext.clinicalContext}`;
      }

      // Add CER conclusions if relevant
      if (dossierContext.clinicalContext?.includes("CER") || 
          dossierContext.clinicalContext?.includes("Clinical Evaluation")) {
        dossierSection += `

---

## CER REFERENCE:
The content should be consistent with conclusions from the most recent 
Clinical Evaluation Report. Reference the CER where appropriate.`;
      }
    } else {
      // No dossier - rely entirely on canonical evidence data
      dossierSection = `
## CANONICAL EVIDENCE DATA ANALYSIS:

No device dossier is configured. Generate the clinical narrative based ENTIRELY 
on the canonical evidence data provided below. This includes:

- Literature records: ${literatureAtoms.length} items
- PMCF records: ${pmcfAtoms.length} items  
- External database records: ${externalDBAtoms.length} items

Analyze ALL evidence records thoroughly and synthesize findings. The evidence 
data is authoritative and complete for this reporting period.`;
    }

    const deviceName = input.context.deviceName || input.context.deviceCode;

    let sectionInstruction = "";
    if (isLiterature) {
      sectionInstruction = `Generate the Scientific Literature Review section.

Start with: "The literature searches for ${deviceName} resulted in [N] articles specific to the subject devices."
Then summarize the key findings by topic (complications, outcomes, etc.) referencing studies by Author et al. (Year).
End with a conclusion about whether the device performance is aligned with state of the art.
If no literature was found, state that clearly.`;
    } else if (isPMCF) {
      sectionInstruction = `Generate the PMCF section.

If no PMCF studies were performed, state: "No clinical investigations or Post Market Clinical Follow-up (PMCF) studies have been performed since the last update of the CER." Then provide a brief list of reasons why no PMCF was needed.
If PMCF was performed, summarize findings against the defined endpoints.`;
    } else if (isExternalDB) {
      sectionInstruction = `Generate the External Databases Review section.

List the databases searched (MAUDE, MHRA, TGA, etc.) with search criteria.
Include a table of search results showing: Database | Results for Subject Device | Results for Similar Devices.
Summarize whether any new failure modes or risks were identified.
If similar devices are mentioned in evidence, list them in a table with: Manufacturer | Location | Device Types.`;
    } else {
      sectionInstruction = `Generate the clinical evidence section based on the evidence provided.`;
    }

    return `${sectionInstruction}

## DATA:
- Device: ${deviceName}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}
- Literature Records: ${literatureAtoms.length}
- PMCF Records: ${pmcfAtoms.length}
- External DB Records: ${externalDBAtoms.length}

${dossierSection}

Be concise and factual. Cite studies as "Author et al. (Year)". Do not write verbose introductions.

## Evidence Records:
${evidenceRecords}`;
  }
}
