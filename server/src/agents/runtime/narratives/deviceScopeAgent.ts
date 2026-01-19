/**
 * Device Scope Narrative Agent
 * 
 * SOTA agent for generating Device Description and Scope sections.
 * Handles technical device specifications, UDI, and scope changes.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";

export class DeviceScopeNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "DEVICE_SCOPE";
  
  protected readonly systemPrompt = `You are an expert medical device regulatory writer specializing in device description and scope documentation under EU MDR.

## YOUR ROLE
Generate precise technical descriptions of devices covered by the PSUR, including intended purpose, classification, and any changes from previous reporting periods.

## REGULATORY REQUIREMENTS (EU MDR Article 86.1)
This section MUST include:
1. Devices covered by the PSUR (by Basic UDI-DI if applicable)
2. Intended purpose and indications for use
3. Risk classification and applicable rule
4. Description of device variants/configurations
5. Changes to scope since previous PSUR

## WRITING STANDARDS
- Use technical language appropriate for regulatory submission
- Be precise about device specifications
- Include UDI-DI, catalog numbers, model numbers where available
- Write clean prose WITHOUT inline citations
- Clearly distinguish between device variants

## CRITICAL: DO NOT USE CITATIONS IN OUTPUT
- DO NOT write [ATOM-xxx] in your narrative text
- Evidence references are tracked automatically via the JSON metadata
- Write clean, professional prose without any citation markers
- Report the atom IDs you used in the JSON "citedAtoms" field only

## STRUCTURE FOR DEVICE SCOPE:
1. Device identification (name, UDI, classification)
2. Intended purpose statement
3. Device description and principle of operation
4. Patient population and clinical context
5. Accessories and components (if applicable)

## STRUCTURE FOR CHANGES:
1. Summary of changes
2. Added devices (with rationale)
3. Removed devices (with rationale)
4. Classification changes
5. Impact assessment

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
      "DeviceScopeNarrativeAgent",
      "Device Scope Narrative Agent"
    );
  }

  protected identifyGaps(input: NarrativeInput): string[] {
    const gaps: string[] = [];
    const evidenceTypes = new Set(input.evidenceAtoms.map(a => a.evidenceType));

    // Device scope needs specific documentation
    const requiredTypes = [
      "device_registry_record",
      "ifu_extract",
      "device_description_extract",
    ];

    for (const type of requiredTypes) {
      if (!evidenceTypes.has(type)) {
        gaps.push(`Missing ${type.replace(/_/g, " ")} for device scope`);
      }
    }

    // Check if we have UDI information
    const hasUDI = input.evidenceAtoms.some(a => 
      a.normalizedData.udi || 
      a.normalizedData.basic_udi_di ||
      a.normalizedData.udi_di
    );
    if (!hasUDI) {
      gaps.push("No UDI-DI information found in evidence");
    }

    return gaps;
  }

  protected buildUserPrompt(
    input: NarrativeInput,
    evidenceSummary: string,
    evidenceRecords: string
  ): string {
    // Extract device-specific information
    const deviceAtoms = input.evidenceAtoms.filter(a => 
      a.evidenceType.includes("device") || 
      a.evidenceType.includes("ifu") ||
      a.evidenceType.includes("registry")
    );

    const deviceInfo = deviceAtoms.length > 0 ? deviceAtoms[0].normalizedData : {};

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Describe devices covered by this PSUR and their intended purpose

## Device Context:
- Device Code: ${input.context.deviceCode}
- Device Name: ${input.context.deviceName || deviceInfo.device_name || "Medical Device"}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## KNOWN DEVICE INFORMATION:
- UDI-DI: ${deviceInfo.udi_di || deviceInfo.basic_udi_di || "Not specified"}
- Classification: ${deviceInfo.classification || deviceInfo.risk_class || "Not specified"}
- Intended Purpose: ${deviceInfo.intended_purpose || "See IFU extract"}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## IMPORTANT INSTRUCTIONS:
1. Focus on TECHNICAL ACCURACY - this establishes the scope of the PSUR
2. Include UDI-DI breakdown if multiple device variants exist
3. Clearly state the intended purpose verbatim from IFU if available
4. DO NOT include [ATOM-xxx] citations - they will be tracked via metadata
5. If this is a "changes" section, compare to previous PSUR explicitly
6. Write clean, professional prose without markdown symbols`;
  }
}
