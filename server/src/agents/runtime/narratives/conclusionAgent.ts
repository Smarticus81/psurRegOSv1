/**
 * Conclusion Narrative Agent
 * 
 * SOTA agent for generating Conclusions and Actions sections.
 * Specializes in forward-looking statements and regulatory commitments.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";

export class ConclusionNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "CONCLUSION";
  
  protected readonly systemPrompt = `You are an expert medical device regulatory writer specializing in PSUR conclusions and action items under EU MDR.

## YOUR ROLE
Generate comprehensive conclusion narratives that summarize all PSUR findings and clearly state any actions taken or planned.

## REGULATORY REQUIREMENTS (EU MDR Article 86)
Conclusions section MUST include:
1. Summary of overall safety conclusions
2. Summary of performance conclusions
3. Actions taken during the period
4. Actions planned for next period
5. Updates to documentation (PMS plan, CER, labeling)
6. Confirmation of continued compliance

## WRITING STANDARDS
- Be definitive - conclusions must be clear
- Use action-oriented language for actions
- Include specific timelines where applicable
- Write clean prose WITHOUT inline citations
- End with compliance affirmation

## CRITICAL: DO NOT USE CITATIONS IN OUTPUT
- DO NOT write [ATOM-xxx] in your narrative text
- Evidence references are tracked automatically via the JSON metadata
- Write clean, professional prose without any citation markers
- Report the atom IDs you used in the JSON "citedAtoms" field only

## STRUCTURE:
1. Safety conclusions
   - Overall safety profile
   - Any emerging safety concerns
   - Signal detection conclusions
2. Performance conclusions
   - Clinical performance maintained
   - Any performance concerns
3. Actions taken
   - CAPAs implemented
   - Documentation updates
   - Process improvements
4. Actions planned
   - Ongoing monitoring commitments
   - Planned PMCF activities
   - Next PSUR timeline
5. Compliance statement
   - Continued favorable B/R
   - Compliance with Article 86/88

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
      "ConclusionNarrativeAgent",
      "Conclusion Narrative Agent"
    );
  }

  protected identifyGaps(input: NarrativeInput): string[] {
    const gaps: string[] = [];
    
    // Conclusions need comprehensive preceding data
    // This section summarizes, so fewer specific requirements
    if (input.evidenceAtoms.length === 0) {
      gaps.push("No evidence atoms available for conclusion synthesis");
    }

    return gaps;
  }

  protected buildUserPrompt(
    input: NarrativeInput,
    evidenceSummary: string,
    evidenceRecords: string
  ): string {
    // Summarize all evidence for conclusions
    const complaintAtoms = input.evidenceAtoms.filter(a => 
      a.evidenceType.includes("complaint")
    );
    const incidentAtoms = input.evidenceAtoms.filter(a => 
      a.evidenceType.includes("incident")
    );
    const fscaAtoms = input.evidenceAtoms.filter(a => 
      a.evidenceType.includes("fsca") || a.evidenceType.includes("recall")
    );
    const capaAtoms = input.evidenceAtoms.filter(a => 
      a.evidenceType.includes("capa")
    );
    const salesAtoms = input.evidenceAtoms.filter(a => 
      a.evidenceType.includes("sales")
    );
    const trendAtoms = input.evidenceAtoms.filter(a => 
      a.evidenceType.includes("trend")
    );

    const totalSales = salesAtoms.reduce((sum, a) => {
      const qty = Number(a.normalizedData.quantity || a.normalizedData.units_sold || 0);
      return sum + qty;
    }, 0);

    // Check for signals
    const signalsDetected = trendAtoms.some(a => 
      a.normalizedData.signal_detected === true ||
      a.normalizedData.significant === true
    );

    // Check for open items
    const openCAPAs = capaAtoms.filter(a => 
      !a.normalizedData.close_date && a.normalizedData.status !== "CLOSED"
    );
    const openFSCAs = fscaAtoms.filter(a => 
      !a.normalizedData.date_closed && a.normalizedData.status !== "CLOSED"
    );

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: PSUR conclusions and planned actions

## Device Context:
- Device Code: ${input.context.deviceCode}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## PERIOD SUMMARY:
- Total Units: ${totalSales.toLocaleString()}
- Total Complaints: ${complaintAtoms.length}
- Serious Incidents: ${incidentAtoms.length}
- FSCAs: ${fscaAtoms.length} (${openFSCAs.length} ongoing)
- CAPAs: ${capaAtoms.length} (${openCAPAs.length} open)
- Signals Detected: ${signalsDetected ? "YES - REQUIRES ACTION" : "None"}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## CRITICAL INSTRUCTIONS:
1. This is the FINAL section - must be CONCLUSIVE
2. Summarize overall safety and performance conclusions
3. List ALL actions taken during the period
4. List planned actions for next period
5. DO NOT include [ATOM-xxx] citations - they will be tracked via metadata
6. MUST END WITH:
   - Clear statement on benefit-risk (favorable/acceptable)
   - Compliance confirmation with EU MDR Article 86/88
   - Next PSUR submission commitment
7. Write clean, professional prose without markdown symbols`;
  }
}
