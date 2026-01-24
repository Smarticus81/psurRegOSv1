/**
 * Device Scope Narrative Agent
 * 
 * SOTA agent for generating Device Description and Scope sections.
 * Handles technical device specifications, UDI, and scope changes.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { PROMPT_TEMPLATES } from "../../llmService";

export class DeviceScopeNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "DEVICE_SCOPE";

  protected readonly systemPrompt = PROMPT_TEMPLATES.DEVICE_SCOPE_SYSTEM;

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
