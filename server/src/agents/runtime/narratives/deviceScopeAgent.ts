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

    return `Generate the Scope and Device Description section. Be factual and structured.

## DEVICE INFORMATION:
- Device Name: ${deviceName}${manufacturerSection}
- Basic UDI-DI: ${udiDi}
- Classification: ${classification}${classificationRationale ? ` — ${classificationRationale}` : ""}
- Intended Purpose: ${intendedPurpose}
- Reporting Period: ${input.context.periodStart} to ${input.context.periodEnd}
${clinicalBenefitsSection}

## REQUIRED OUTPUT FORMAT:

1. **Device Information**: State device name, Basic UDI-DI, and whether it is implantable (Yes/No).

2. **Device Classification**: State the EU-MDR classification (Class IIa/IIb/III) and classification rule.

3. **PSUR Obligation Status**: State market status ("On Market"), certificate status, and confirm ongoing PSUR obligation.

4. **Device Description**: Write a concise technical description of the device from the evidence records. Include materials, dimensions, and variants if available.

5. **Intended Purpose**: State the intended purpose verbatim from the IFU or dossier.

6. **Indications and Contraindications**: List if available from evidence.

7. **UDI-DI Table**: If multiple device variants, include a table with columns: Basic UDI-DI | Device Trade Name | EMDN Code | Changes from Previous PSUR.

8. **Data Collection Period**: State the date range.

Keep each subsection short. Do not elaborate beyond what the evidence provides.

## Evidence Records:
${evidenceRecords}`;
  }
}
