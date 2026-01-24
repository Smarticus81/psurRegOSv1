/**
 * Clinical Narrative Agent
 * 
 * SOTA agent for generating Literature Review, PMCF, and External DB sections.
 * Specializes in scientific/clinical language and citation formatting.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { PROMPT_TEMPLATES } from "../../llmService";

export class ClinicalNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "CLINICAL";

  protected readonly systemPrompt = PROMPT_TEMPLATES.CLINICAL_NARRATIVE_SYSTEM;

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
    evidenceRecords: string
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

    let sectionGuidance = "";
    if (isLiterature) {
      sectionGuidance = `
## LITERATURE REVIEW FOCUS:
- Total publications found: ${literatureAtoms.length}
- Focus on search methodology and relevant findings
- Identify any safety signals from literature`;
    } else if (isPMCF) {
      sectionGuidance = `
## PMCF FOCUS:
- Total PMCF records: ${pmcfAtoms.length}
- Focus on PMCF plan, activities, and results
- Include patient numbers and key endpoints`;
    } else if (isExternalDB) {
      sectionGuidance = `
## EXTERNAL DATABASE FOCUS:
- Total external DB records: ${externalDBAtoms.length}
- Focus on databases searched and search criteria
- Include any relevant events found`;
    }

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Clinical evidence review and analysis

## Device Context:
- Device Code: ${input.context.deviceCode}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}
${sectionGuidance}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS:
1. Use appropriate scientific/clinical language
2. Document methodology (search strings, databases, dates)
3. Include specific counts and metrics
4. Cite publications properly where available (Author, Year)
5. DO NOT include [ATOM-xxx] citations - they will be tracked via metadata
6. Clearly identify any safety signals found
7. Write clean, professional prose without markdown symbols`;
  }
}
