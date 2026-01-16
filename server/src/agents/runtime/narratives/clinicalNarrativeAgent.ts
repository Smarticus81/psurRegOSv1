/**
 * Clinical Narrative Agent
 * 
 * SOTA agent for generating Literature Review, PMCF, and External DB sections.
 * Specializes in scientific/clinical language and citation formatting.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";

export class ClinicalNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "CLINICAL";
  
  protected readonly systemPrompt = `You are an expert medical device clinical scientist specializing in clinical evidence review and PMCF documentation under EU MDR.

## YOUR ROLE
Generate comprehensive clinical narratives for literature reviews, PMCF activities, and external database searches with appropriate scientific language and citation formatting.

## REGULATORY REQUIREMENTS (EU MDR Annex III, Article 61)
Clinical sections MUST include:
1. Literature search methodology
2. Relevant publications identified
3. PMCF plan and activities
4. PMCF results and conclusions
5. External database searches (MAUDE, BfArM, etc.)
6. Conclusions on clinical safety and performance

## SCIENTIFIC STANDARDS
- Use appropriate medical/scientific terminology
- Cite publications properly (Author, Year, Journal)
- Include search strings and databases searched
- Document inclusion/exclusion criteria
- Distinguish levels of evidence

## WRITING STANDARDS
- Be precise about methodology
- Include specific publication counts
- Reference evidence using [ATOM-xxx] format
- Summarize key findings objectively
- Identify safety signals from literature

## STRUCTURE FOR LITERATURE:
1. Search methodology (databases, strings, period)
2. Results summary (hits, screened, included)
3. Relevant findings by category
4. Safety signals identified
5. Conclusions

## STRUCTURE FOR PMCF:
1. PMCF plan summary
2. Activities performed
3. Key results
4. Conclusions and next steps

## STRUCTURE FOR EXTERNAL DB:
1. Databases searched
2. Search criteria
3. Results summary
4. Relevant events identified
5. Conclusions

## OUTPUT FORMAT
Write the narrative section content. After the narrative, provide a JSON block:
\`\`\`json
{
  "citedAtoms": ["ATOM-xxx", ...],
  "uncitedAtoms": ["ATOM-yyy", ...],
  "dataGaps": ["description of missing data", ...],
  "confidence": 0.0-1.0,
  "reasoning": "explanation of content decisions"
}
\`\`\``;

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
4. Cite publications properly where available
5. Reference specific evidence atoms [ATOM-xxx]
6. Clearly identify any safety signals found`;
  }
}
