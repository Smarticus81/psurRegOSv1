/**
 * Device Scope Narrative Agent
 * 
 * SOTA agent for generating Device Description and Scope sections.
 * Handles technical device specifications, UDI, and scope changes.
 */

import { BaseNarrativeAgent, NarrativeInput } from "./baseNarrativeAgent";
import { type DossierContext } from "../../../services/deviceDossierService";
import { type AgentRoleContext } from "../../../services/agentRoleService";

export class DeviceScopeNarrativeAgent extends BaseNarrativeAgent {
  protected readonly sectionType = "DEVICE_SCOPE";

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
    evidenceRecords: string,
    dossierContext?: DossierContext,
    agentRoleContext?: AgentRoleContext
  ): string {
    // Extract device-specific information from evidence atoms (fallback)
    const deviceAtoms = input.evidenceAtoms.filter(a =>
      a.evidenceType.includes("device") ||
      a.evidenceType.includes("ifu") ||
      a.evidenceType.includes("registry")
    );

    const deviceInfo = deviceAtoms.length > 0 ? deviceAtoms[0].normalizedData : {};

    // PRIORITY: Dossier context is the authoritative source for device identity
    // Only fall back to evidence atoms if dossier is unavailable
    let deviceName = input.context.deviceName || "Medical Device";
    let udiDi = "Not specified";
    let classification = "Not specified";
    let intendedPurpose = "See IFU extract";
    let manufacturerName = "";
    let classificationRationale = "";

    if (dossierContext?.dossierExists) {
      // Use authoritative dossier data
      deviceName = dossierContext.tradeName || deviceName;
      udiDi = dossierContext.basicUdiDi || udiDi;
      manufacturerName = dossierContext.manufacturerName || "";

      // Extract classification from dossier
      if (dossierContext.classification) {
        const cls = dossierContext.classification as { class?: string; rule?: string; rationale?: string };
        classification = cls.class && cls.rule ? `${cls.class} (${cls.rule})` : (cls.class || classification);
        classificationRationale = cls.rationale || "";
      }

      // Extract intended purpose from clinical context
      if (dossierContext.intendedPurpose) {
        intendedPurpose = dossierContext.intendedPurpose;
      }
    } else {
      // Fallback to evidence atom data
      deviceName = input.context.deviceName || (deviceInfo.device_name as string) || deviceName;
      udiDi = (deviceInfo.udi_di as string) || (deviceInfo.basic_udi_di as string) || udiDi;
      classification = (deviceInfo.classification as string) || (deviceInfo.risk_class as string) || classification;
      intendedPurpose = (deviceInfo.intended_purpose as string) || intendedPurpose;
    }

    // Build clinical benefits section from dossier
    let clinicalBenefitsSection = "";
    if (dossierContext?.clinicalBenefits && dossierContext.clinicalBenefits.length > 0) {
      clinicalBenefitsSection = `\n## CLINICAL BENEFITS (from Device Dossier):\n` +
        dossierContext.clinicalBenefits.map((b: any) =>
          `- ${b.description}${b.quantifiedValue ? ` (${b.quantifiedValue})` : ""}${b.evidenceSource ? ` — Source: ${b.evidenceSource}` : ""}`
        ).join("\n");
    }

    // Build manufacturer info section
    let manufacturerSection = "";
    if (manufacturerName) {
      manufacturerSection = `\n- Manufacturer: ${manufacturerName}`;
    }

    return `## Section: ${input.slot.title}
## Section Path: ${input.slot.sectionPath}
## Purpose: Describe devices covered by this PSUR and their intended purpose

## Device Context:
- Device Code: ${input.context.deviceCode}
- Device Name: ${deviceName}${manufacturerSection}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}

## KNOWN DEVICE INFORMATION:
- UDI-DI: ${udiDi}
- Classification: ${classification}${classificationRationale ? ` — ${classificationRationale}` : ""}
- Intended Purpose: ${intendedPurpose}
${clinicalBenefitsSection}

## Evidence Summary:
${evidenceSummary}

## Detailed Evidence Records:
${evidenceRecords}

## IMPORTANT INSTRUCTIONS:
1. Focus on TECHNICAL ACCURACY - this establishes the scope of the PSUR
2. Use ONLY the device identity information provided above (Device Name, UDI-DI, Classification)
3. DO NOT substitute device names or identifiers from evidence records if they differ from the dossier
4. Include UDI-DI breakdown if multiple device variants exist
5. Clearly state the intended purpose verbatim from IFU if available
6. DO NOT include [ATOM-xxx] citations - they will be tracked via metadata
7. If this is a "changes" section, compare to previous PSUR explicitly
8. Write clean, professional prose without markdown symbols`;
  }
}
