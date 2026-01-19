/**
 * PMS Activity Narrative Agent
 * 
 * SOTA agent for generating PMS Overview and Data Sources sections.
 * Describes post-market surveillance activities and methodology.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";

export class PMSActivityNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "PMS_ACTIVITY";
  
  protected readonly systemPrompt = `You are an expert medical device regulatory writer specializing in Post-Market Surveillance documentation under EU MDR.

## YOUR ROLE
Generate comprehensive descriptions of PMS activities performed during the reporting period, including data sources, collection methods, and analysis approaches.

## REGULATORY REQUIREMENTS (EU MDR Article 83, Article 86)
This section MUST include:
1. Overview of PMS system and plan
2. Data sources used (internal and external)
3. Collection methods and frequency
4. Analysis methodology
5. Integration with quality management system

## WRITING STANDARDS
- Use methodological language appropriate for regulatory submission
- Be specific about data sources and collection periods
- Include metrics on data completeness
- Write clean prose WITHOUT inline citations
- Demonstrate systematic approach to PMS

## CRITICAL: DO NOT USE CITATIONS IN OUTPUT
- DO NOT write [ATOM-xxx] in your narrative text
- Evidence references are tracked automatically via the JSON metadata
- Write clean, professional prose without any citation markers
- Report the atom IDs you used in the JSON "citedAtoms" field only

## STRUCTURE FOR PMS OVERVIEW:
1. PMS plan summary (reference document)
2. Proactive vs. reactive surveillance activities
3. Data collection methods
4. Analysis and trending approach
5. Responsible personnel/functions

## STRUCTURE FOR SALES/EXPOSURE:
1. Sales volume by region/market
2. Estimated patient exposure
3. Usage frequency data
4. Denominator data quality assessment

## OUTPUT FORMAT
Write the narrative section content WITHOUT any citation markers. After the narrative, provide a JSON block with the atom IDs you referenced:
\`\`\`json
{
  "citedAtoms": ["actual-atom-id-1", "actual-atom-id-2"],
  "uncitedAtoms": ["other-atom-ids"],
  "dataGaps": ["description of missing data", ...],
  "confidence": 0.0-1.0,
  "reasoning": "explanation of content decisions"
}
\`\`\``;

  constructor() {
    super(
      "PMSActivityNarrativeAgent",
      "PMS Activity Narrative Agent"
    );
  }

  protected identifyGaps(input: NarrativeInput): string[] {
    const gaps: string[] = [];
    const evidenceTypes = new Set(input.evidenceAtoms.map(a => a.evidenceType));

    // PMS activity needs methodology documentation
    if (!evidenceTypes.has("pms_plan_extract") && !evidenceTypes.has("pms_activity_log")) {
      gaps.push("No PMS plan or activity log evidence");
    }

    if (!evidenceTypes.has("data_source_register")) {
      gaps.push("No data source register documentation");
    }

    // Check for sales/exposure data
    const hasSales = input.evidenceAtoms.some(a => 
      a.evidenceType.includes("sales") || 
      a.evidenceType.includes("distribution")
    );
    if (!hasSales) {
      gaps.push("No sales or distribution data for exposure estimation");
    }

    return gaps;
  }

  protected buildUserPrompt(
    input: NarrativeInput,
    evidenceSummary: string,
    evidenceRecords: string
  ): string {
    // Calculate sales metrics
    const salesAtoms = input.evidenceAtoms.filter(a => 
      a.evidenceType.includes("sales") || a.evidenceType.includes("volume")
    );

    const totalUnits = salesAtoms.reduce((sum, a) => {
      const qty = Number(a.normalizedData.quantity || a.normalizedData.units_sold || 0);
      return sum + qty;
    }, 0);

    const regionSet = new Set(salesAtoms.map(a => 
      a.normalizedData.region || a.normalizedData.country || "Unknown"
    ));
    const regions = Array.from(regionSet);

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Describe PMS activities and data sources used during the reporting period

## Device Context:
- Device Code: ${input.context.deviceCode}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## SALES/EXPOSURE METRICS:
- Total Units Sold/Distributed: ${totalUnits.toLocaleString()}
- Markets/Regions: ${regions.join(", ") || "Not specified"}
- Data Records: ${salesAtoms.length}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## IMPORTANT INSTRUCTIONS:
1. Describe the METHODOLOGY used for PMS, not just results
2. List all data sources consulted (complaints, literature, registries, etc.)
3. Include collection frequency and responsible parties
4. For sales/exposure, provide denominator data quality assessment
5. DO NOT include [ATOM-xxx] citations - they will be tracked via metadata
6. Write clean, professional prose without markdown symbols`;
  }
}
