/**
 * Template-Driven PSUR Renderer
 * 
 * Generates PSUR content by following the actual template structure,
 * rendering each slot with its specific evidence requirements.
 */

import {
  generateSalesTable,
  generateExposureTable,
  generateComplaintsTable,
  generateComplaintsByRegionTable,
  generateSeriousIncidentsTable,
  generateFSCATable,
  generateCAPATable,
  generateLiteratureTable,
  generateExternalDBTable,
  generatePMCFTable,
  generateTrendTable,
  generateBenefitRiskNarrative,
  type EvidenceAtomData,
} from "./psurTableGenerator";
import type { Template as StrictTemplate, SlotDefinition } from "../../templates/templateSchema";

// Adapter interface for backward compatibility with existing code
export interface TemplateSlot {
  slot_id: string;
  title: string;
  section: string;
  render_as: "narrative" | "table" | "cover_page" | "table_of_contents";
  evidence_requirements?: {
    required_types: string[];
  };
  table_schema?: {
    columns: { name: string; type: string }[];
    primary_key: string[];
  };
}

export interface Template {
  template_id: string;
  name: string;
  version: string;
  jurisdiction_scope: string[];
  normative_basis?: string[];
  slots: TemplateSlot[];
  mapping?: Record<string, string[]>;
}

// Convert strict template to renderer format
function adaptTemplate(strictTemplate: StrictTemplate): Template {
  return {
    template_id: strictTemplate.template_id,
    name: strictTemplate.name,
    version: strictTemplate.version,
    jurisdiction_scope: strictTemplate.jurisdiction_scope,
    normative_basis: strictTemplate.normative_basis,
    slots: strictTemplate.slots.map(adaptSlot),
    mapping: strictTemplate.mapping,
  };
}

// Convert strict slot to renderer format
function adaptSlot(slot: SlotDefinition): TemplateSlot {
  // Extract section from section_path (first part before " > ")
  const section = slot.section_path.split(" > ")[0];
  
  // Map render_as from output_requirements
  let render_as: "narrative" | "table" | "cover_page" | "table_of_contents" = "narrative";
  if (slot.output_requirements.render_as) {
    render_as = slot.output_requirements.render_as;
  } else if (slot.slot_kind === "TABLE") {
    render_as = "table";
  }
  
  return {
    slot_id: slot.slot_id,
    title: slot.title,
    section,
    render_as,
    evidence_requirements: {
      required_types: slot.evidence_requirements.required_types,
    },
    table_schema: slot.output_requirements.table_schema ? {
      columns: slot.output_requirements.table_schema.columns,
      primary_key: slot.output_requirements.table_schema.primary_key || [],
    } : undefined,
  };
}

export interface SlotProposal {
  slotId: string;
  status: "accepted" | "rejected" | "pending";
  evidenceAtomIds?: number[];
  claimedObligationIds?: string[];
  methodStatement?: string;
  transformations?: string[];
  renderedText?: string;
  gapJustification?: string;
}

export interface PsurCase {
  id: number;
  psurReference: string;
  templateId: string;
  jurisdictions: string[];
  startPeriod: Date;
  endPeriod: Date;
  status: string;
  version?: number;
  deviceCode?: string;
}

export interface QualificationReport {
  status: string;
  templateId: string;
  slotCount?: number;
  mappingCount?: number;
  mandatoryObligationsFound?: number;
  mandatoryObligationsTotal?: number;
  constraints?: number;
  validatedAt?: string;
  missingObligations?: { jurisdiction: string; count: number; message: string }[];
  blockingErrors?: string[];
}

// Helper to extract value from evidence atom data
function getValue(data: any, ...keys: string[]): any {
  for (const key of keys) {
    const val = data?.[key];
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return null;
}

// Get atoms for specific evidence types
function getAtomsForTypes(atoms: EvidenceAtomData[], types: string[]): EvidenceAtomData[] {
  return atoms.filter(a => types.includes(a.evidenceType));
}

// ═══════════════════════════════════════════════════════════════════════════════
// COVER PAGE RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function renderCoverPage(
  psurCase: PsurCase,
  slot: TemplateSlot,
  atoms: EvidenceAtomData[]
): string[] {
  const lines: string[] = [];
  const requiredTypes = slot.evidence_requirements?.required_types || [];
  const relevantAtoms = getAtomsForTypes(atoms, requiredTypes);
  
  // Extract manufacturer info
  const manufacturerAtom = relevantAtoms.find(a => a.evidenceType === "manufacturer_profile");
  const deviceAtom = relevantAtoms.find(a => a.evidenceType === "device_registry_record");
  const certAtom = relevantAtoms.find(a => a.evidenceType === "regulatory_certificate_record");
  
  lines.push("# PERIODIC SAFETY UPDATE REPORT");
  lines.push("");
  
  // Manufacturer Block
  if (manufacturerAtom?.normalizedData) {
    const mfr = manufacturerAtom.normalizedData;
    lines.push("## Manufacturer Information");
    lines.push("");
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| **Manufacturer** | ${getValue(mfr, "manufacturer_name", "name") || "[MISSING]"} |`);
    lines.push(`| **Address** | ${getValue(mfr, "address") || "[MISSING]"} |`);
    lines.push(`| **SRN** | ${getValue(mfr, "srn") || "[MISSING]"} |`);
    lines.push(`| **Contact** | ${getValue(mfr, "contact") || "[MISSING]"} |`);
    lines.push("");
  }
  
  // Device Block
  if (deviceAtom?.normalizedData) {
    const dev = deviceAtom.normalizedData;
    lines.push("## Device Information");
    lines.push("");
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| **Device Name** | ${getValue(dev, "device_name", "name") || "[MISSING]"} |`);
    lines.push(`| **Model/Catalog** | ${getValue(dev, "model", "catalog_number") || "[MISSING]"} |`);
    lines.push(`| **UDI-DI** | ${getValue(dev, "udi_di") || "[MISSING]"} |`);
    lines.push(`| **Risk Class** | ${getValue(dev, "risk_class", "class") || "[MISSING]"} |`);
    lines.push(`| **Intended Purpose** | ${getValue(dev, "intended_purpose") || "[MISSING]"} |`);
    lines.push("");
  }
  
  // Certificate Block
  if (certAtom?.normalizedData) {
    const cert = certAtom.normalizedData;
    lines.push("## Regulatory Certificates");
    lines.push("");
    lines.push(`| Certificate | Number | Notified Body | Expiry |`);
    lines.push(`|-------------|--------|---------------|--------|`);
    lines.push(`| ${getValue(cert, "certificate_type") || "[MISSING]"} | ${getValue(cert, "certificate_number") || "[MISSING]"} | ${getValue(cert, "notified_body") || "[MISSING]"} | ${getValue(cert, "expiry_date") || "[MISSING]"} |`);
    lines.push("");
  }
  
  // Document Info Block
  lines.push("## Document Information");
  lines.push("");
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| **Document Reference** | ${psurCase.psurReference} |`);
  lines.push(`| **Template** | ${psurCase.templateId} |`);
  lines.push(`| **Jurisdictions** | ${psurCase.jurisdictions.join(", ")} |`);
  lines.push(`| **Reporting Period** | ${psurCase.startPeriod.toISOString().split("T")[0]} to ${psurCase.endPeriod.toISOString().split("T")[0]} |`);
  lines.push(`| **Version** | ${psurCase.version || 1} |`);
  lines.push(`| **Status** | ${psurCase.status} |`);
  lines.push(`| **Generation Date** | ${new Date().toISOString().split("T")[0]} |`);
  lines.push("");
  
  return lines;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE OF CONTENTS RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function renderTableOfContents(template: Template): string[] {
  const lines: string[] = [];
  lines.push("## Table of Contents");
  lines.push("");
  
  // Group slots by section
  const sections: Record<string, TemplateSlot[]> = {};
  for (const slot of template.slots) {
    if (slot.render_as === "table_of_contents") continue; // Skip TOC itself
    if (slot.render_as === "cover_page") continue; // Skip cover page
    
    const sec = slot.section;
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(slot);
  }
  
  let sectionNum = 1;
  for (const [section, slots] of Object.entries(sections)) {
    // Get clean section title (avoid showing just numbers)
    const sectionTitle = getSectionTitle(section, slots[0]?.title);
    lines.push(`**${sectionNum}. ${sectionTitle}**`);
    
    for (const slot of slots) {
      // Clean up slot title - remove redundant prefixes
      let slotTitle = slot.title
        .replace(/^Section [A-Z] — /, "")
        .replace(/^Section \d+ — /, "");
      lines.push(`   - ${slotTitle}`);
    }
    lines.push("");
    sectionNum++;
  }
  
  lines.push("**Appendices**");
  lines.push("   - Appendix A: Evidence Atom Summary");
  lines.push("   - Appendix B: Slot to Evidence Mapping");
  lines.push("   - Appendix C: Qualification Report");
  lines.push("");
  
  return lines;
}

function getSectionTitle(section: string, firstSlotTitle?: string): string {
  const sectionNames: Record<string, string> = {
    // FormQAR-054 sections
    "A": "Executive Summary",
    "B": "Scope and Device Description",
    "C": "Volume of Sales and Population Exposure",
    "D": "Serious Incidents",
    "E": "Customer Feedback",
    "F": "Product Complaints",
    "G": "Trend Reporting",
    "H": "Field Safety Corrective Actions (FSCA)",
    "I": "Corrective and Preventive Actions (CAPA)",
    "J": "Scientific Literature Review",
    "K": "External Databases and Registries",
    "L": "Post-Market Clinical Follow-up (PMCF)",
    "M": "Findings and Conclusions",
    // MDCG Annex I sections
    "ExecutiveSummary": "Executive Summary",
    "DeviceDescription": "Device Description and Scope",
    "PMSActivities": "Post-Market Surveillance Activities",
    "Exposure": "Sales Volume and Population Exposure",
    "Safety": "Safety Information (Incidents and Complaints)",
    "Trend": "Trend Reporting and Signal Detection",
    "FSCA": "Field Safety Corrective Actions",
    "CAPA": "Corrective and Preventive Actions",
    "Literature": "Scientific Literature Review",
    "ExternalDatabases": "External Databases and Registries",
    "PMCF": "Post-Market Clinical Follow-up",
    "Conclusions": "Conclusions and Actions",
    // Common
    "Cover": "Cover Page",
    "FrontMatter": "Front Matter",
  };
  return sectionNames[section] || section;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NARRATIVE SLOT RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function renderNarrativeSlot(
  slot: TemplateSlot,
  atoms: EvidenceAtomData[],
  proposal: SlotProposal | undefined,
  psurCase: PsurCase
): string[] {
  const lines: string[] = [];
  const requiredTypes = slot.evidence_requirements?.required_types || [];
  const relevantAtoms = getAtomsForTypes(atoms, requiredTypes);
  
  // If proposal has rendered text, use it
  if (proposal?.renderedText) {
    lines.push(proposal.renderedText);
    lines.push("");
    return lines;
  }
  
  // Generate narrative based on slot type
  const slotId = slot.slot_id;
  
  // Executive Summary
  if (slotId.includes("EXEC_SUMMARY")) {
    lines.push(`This Periodic Safety Update Report covers the period from **${psurCase.startPeriod.toISOString().split("T")[0]}** to **${psurCase.endPeriod.toISOString().split("T")[0]}** and is prepared in accordance with ${psurCase.jurisdictions.join(" and ")} requirements.`);
    lines.push("");
    lines.push("This report summarizes the post-market surveillance data collected during the reporting period, including:");
    lines.push("- Sales volume and population exposure");
    lines.push("- Serious incidents and vigilance reporting");
    lines.push("- Customer complaints and feedback");
    lines.push("- Trend analysis and signal detection");
    lines.push("- Field Safety Corrective Actions (FSCAs)");
    lines.push("- Corrective and Preventive Actions (CAPAs)");
    lines.push("- Post-Market Clinical Follow-up (PMCF) activities");
    lines.push("- Scientific literature review");
    lines.push("- External database searches");
    lines.push("- Overall benefit-risk assessment");
    lines.push("");
  }
  // Previous Actions Status
  else if (slotId.includes("PREVIOUS_ACTIONS")) {
    const prevActionsAtom = relevantAtoms.find(a => a.evidenceType === "previous_psur_actions");
    if (prevActionsAtom?.normalizedData) {
      const data = prevActionsAtom.normalizedData;
      lines.push(`**Previous PSUR Reference:** ${getValue(data, "psur_reference") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Action Status:** ${getValue(data, "status") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Description:** ${getValue(data, "description") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Effectiveness:** ${getValue(data, "effectiveness") || "[MISSING]"}`);
    } else {
      lines.push("No previous PSUR actions requiring follow-up.");
    }
    lines.push("");
  }
  // NB Review Status
  else if (slotId.includes("NB_REVIEW")) {
    const nbAtom = relevantAtoms.find(a => a.evidenceType === "notified_body_review_record");
    if (nbAtom?.normalizedData) {
      const data = nbAtom.normalizedData;
      lines.push(`**Last Review Date:** ${getValue(data, "review_date", "date") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Reviewer:** ${getValue(data, "reviewer") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Findings:** ${getValue(data, "findings") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Outcome:** ${getValue(data, "outcome") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Next Review:** ${getValue(data, "next_review") || "[MISSING]"}`);
    } else {
      lines.push("No Notified Body review data available for this period.");
    }
    lines.push("");
  }
  // Period Change
  else if (slotId.includes("PERIOD_CHANGE")) {
    const periodAtom = relevantAtoms.find(a => a.evidenceType === "psur_period_change_record");
    if (periodAtom?.normalizedData) {
      const data = periodAtom.normalizedData;
      lines.push(`**Period Status:** ${getValue(data, "change_type") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Justification:** ${getValue(data, "justification") || "[MISSING]"}`);
    } else {
      lines.push("No changes to the PSUR reporting period during this cycle.");
    }
    lines.push("");
  }
  // Benefit-Risk Statement
  else if (slotId.includes("BENEFIT_RISK")) {
    const brResult = generateBenefitRiskNarrative(atoms);
    lines.push(brResult.markdown);
    lines.push("");
    lines.push(`*${brResult.dataSourceFooter}*`);
    lines.push("");
  }
  // Scope/Device Description
  else if (slotId.includes("SCOPE") || slotId.includes("DEVICE_DESCRIPTION")) {
    const deviceAtom = relevantAtoms.find(a => a.evidenceType === "device_registry_record");
    const ifuAtom = relevantAtoms.find(a => a.evidenceType === "ifu_extract");
    
    if (deviceAtom?.normalizedData) {
      const dev = deviceAtom.normalizedData;
      lines.push(`**Device Name:** ${getValue(dev, "device_name", "name") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Model/Catalog Number:** ${getValue(dev, "model") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Risk Classification:** ${getValue(dev, "risk_class") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Intended Purpose:** ${getValue(dev, "intended_purpose") || "[MISSING]"}`);
      lines.push("");
    }
    
    if (ifuAtom?.normalizedData) {
      const ifu = ifuAtom.normalizedData;
      if (getValue(ifu, "content")) {
        lines.push("**From Instructions for Use:**");
        lines.push("");
        lines.push(getValue(ifu, "content"));
        lines.push("");
      }
    }
    
    if (!deviceAtom && !ifuAtom) {
      lines.push("Device description data not available. See device registry records.");
    }
    lines.push("");
  }
  // Timeline Status
  else if (slotId.includes("TIMELINE")) {
    const deviceAtom = relevantAtoms.find(a => a.evidenceType === "device_registry_record");
    const certAtom = relevantAtoms.find(a => a.evidenceType === "regulatory_certificate_record");
    
    if (certAtom?.normalizedData) {
      const cert = certAtom.normalizedData;
      lines.push(`**Certificate Status:** Active`);
      lines.push("");
      lines.push(`**Issue Date:** ${getValue(cert, "issue_date") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Expiry Date:** ${getValue(cert, "expiry_date") || "[MISSING]"}`);
      lines.push("");
    }
    
    if (deviceAtom?.normalizedData) {
      const dev = deviceAtom.normalizedData;
      lines.push(`**Market Status:** ${getValue(dev, "registration_status") || "[MISSING]"}`);
      lines.push("");
    }
    
    if (!deviceAtom && !certAtom) {
      lines.push("Timeline and status information not available.");
    }
    lines.push("");
  }
  // PSUR Obligation Status
  else if (slotId.includes("OBLIGATION_STATUS")) {
    const lifetimeAtom = relevantAtoms.find(a => a.evidenceType === "device_lifetime_record");
    const salesAtom = relevantAtoms.find(a => a.evidenceType === "sales_summary");
    
    lines.push("**PSUR Obligation:** This device is subject to periodic safety update reporting requirements under EU MDR Article 86 and UK MDR Regulation 44ZM.");
    lines.push("");
    
    if (lifetimeAtom?.normalizedData) {
      const life = lifetimeAtom.normalizedData;
      lines.push(`**Device Lifetime:** ${getValue(life, "value") || "[MISSING]"}`);
      lines.push("");
    }
    
    lines.push("**Reporting Frequency:** Annual (or as required by competent authorities)");
    lines.push("");
    lines.push(`**Reporting Period End Rationale:** The PMS data collection period ends on ${psurCase.endPeriod.toISOString().split("T")[0]} as per the established PSUR cycle.`);
    lines.push("");
  }
  // Sales/Exposure Narrative
  else if (slotId.includes("SALES_VOLUME") || slotId.includes("EXPOSURE")) {
    const salesTable = generateSalesTable(atoms);
    const exposureTable = generateExposureTable(atoms);
    
    lines.push("The following data summarizes the volume of sales and population exposure during the reporting period:");
    lines.push("");
    lines.push(salesTable.markdown);
    lines.push("");
    lines.push(`*${salesTable.dataSourceFooter}*`);
    lines.push("");
    lines.push("### Usage and Exposure Estimates");
    lines.push("");
    lines.push(exposureTable.markdown);
    lines.push("");
    lines.push(`*${exposureTable.dataSourceFooter}*`);
    lines.push("");
  }
  // Serious Incidents Narrative
  else if (slotId.includes("SERIOUS_INCIDENTS") && !slotId.includes("TABLE")) {
    const incidentAtoms = getAtomsForTypes(atoms, ["serious_incident_summary", "serious_incident_records_imdrf", "vigilance_report"]);
    const hasIncidents = incidentAtoms.some(a => !a.normalizedData?.isNegativeEvidence);
    
    if (hasIncidents) {
      lines.push("The following serious incidents were reported during the PSUR period. All incidents have been investigated and reported to the relevant competent authorities in accordance with vigilance requirements.");
      lines.push("");
      const incTable = generateSeriousIncidentsTable(atoms);
      lines.push(incTable.markdown);
      lines.push("");
      lines.push(`*${incTable.dataSourceFooter}*`);
    } else {
      lines.push("**No serious incidents** were reported during the PSUR period. Vigilance monitoring continues as per the PMS plan.");
    }
    lines.push("");
  }
  // Customer Feedback
  else if (slotId.includes("CUSTOMER_FEEDBACK")) {
    const feedbackAtom = relevantAtoms.find(a => a.evidenceType === "customer_feedback_summary");
    
    if (feedbackAtom?.normalizedData) {
      const data = feedbackAtom.normalizedData;
      lines.push(`**Feedback Category:** ${getValue(data, "feedback_category") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Count:** ${getValue(data, "count") || 0}`);
      lines.push("");
      lines.push(`**Sentiment:** ${getValue(data, "sentiment") || "[MISSING]"}`);
      lines.push("");
      lines.push(`**Action Required:** ${getValue(data, "action_required") || "[MISSING]"}`);
    } else {
      lines.push("Customer feedback has been monitored during the reporting period. No significant themes requiring action were identified beyond those captured in the formal complaint process.");
    }
    lines.push("");
  }
  // Complaints Narrative
  else if (slotId.includes("COMPLAINTS") && !slotId.includes("TABLE") && !slotId.includes("BY_REGION")) {
    const complaintsTable = generateComplaintsTable(atoms);
    
    lines.push("Product complaints received during the reporting period have been categorized and analyzed:");
    lines.push("");
    lines.push(complaintsTable.markdown);
    lines.push("");
    lines.push(`*${complaintsTable.dataSourceFooter}*`);
    lines.push("");
  }
  // Trend Reporting Narrative
  else if (slotId.includes("TREND_REPORTING") && !slotId.includes("TABLE")) {
    const trendAtoms = getAtomsForTypes(atoms, ["trend_analysis", "signal_log"]);
    const hasSignals = trendAtoms.some(a => getValue(a.normalizedData, "signal_detected") === true);
    
    lines.push("Statistical trend analysis has been performed on safety and performance indicators:");
    lines.push("");
    const trendTable = generateTrendTable(atoms);
    lines.push(trendTable.markdown);
    lines.push("");
    lines.push(`*${trendTable.dataSourceFooter}*`);
    lines.push("");
    
    if (hasSignals) {
      lines.push("**Note:** Signals detected have been investigated and appropriate actions taken as documented in the CAPA section.");
    } else {
      lines.push("**Conclusion:** No statistically significant adverse trends requiring action were identified.");
    }
    lines.push("");
  }
  // FSCA Narrative
  else if (slotId.includes("FSCA") && !slotId.includes("TABLE")) {
    const fscaAtoms = getAtomsForTypes(atoms, ["fsca_summary", "fsca_record", "recall_record"]);
    const hasFscas = fscaAtoms.some(a => !a.normalizedData?.isNegativeEvidence);
    
    if (hasFscas) {
      lines.push("The following Field Safety Corrective Actions were conducted during the reporting period:");
      lines.push("");
      const fscaTable = generateFSCATable(atoms);
      lines.push(fscaTable.markdown);
      lines.push("");
      lines.push(`*${fscaTable.dataSourceFooter}*`);
    } else {
      lines.push("**No Field Safety Corrective Actions (FSCAs)** were required during the reporting period.");
    }
    lines.push("");
  }
  // CAPA Narrative
  else if (slotId.includes("CAPA") && !slotId.includes("TABLE")) {
    const capaAtoms = getAtomsForTypes(atoms, ["capa_summary", "capa_record", "ncr_record"]);
    const hasCapas = capaAtoms.some(a => !a.normalizedData?.isNegativeEvidence);
    
    if (hasCapas) {
      lines.push("Corrective and Preventive Actions undertaken during the reporting period:");
      lines.push("");
      const capaTable = generateCAPATable(atoms);
      lines.push(capaTable.markdown);
      lines.push("");
      lines.push(`*${capaTable.dataSourceFooter}*`);
    } else {
      lines.push("**No significant CAPAs** were initiated during the reporting period. Routine quality management activities continue as per the QMS.");
    }
    lines.push("");
  }
  // Literature Review
  else if (slotId.includes("LITERATURE")) {
    const litTable = generateLiteratureTable(atoms);
    
    lines.push("A systematic literature review was conducted covering relevant scientific publications:");
    lines.push("");
    lines.push(litTable.markdown);
    lines.push("");
    lines.push(`*${litTable.dataSourceFooter}*`);
    lines.push("");
    
    const litAtoms = getAtomsForTypes(atoms, ["literature_review_summary"]);
    for (const atom of litAtoms) {
      const conclusion = getValue(atom.normalizedData, "conclusion", "summary");
      if (conclusion) {
        lines.push(`**Review Conclusion:** ${conclusion}`);
        lines.push("");
        break;
      }
    }
  }
  // External Databases
  else if (slotId.includes("EXTERNAL_DATABASE") && !slotId.includes("TABLE")) {
    const extTable = generateExternalDBTable(atoms);
    
    lines.push("External databases and registries were searched for relevant safety information:");
    lines.push("");
    lines.push(extTable.markdown);
    lines.push("");
    lines.push(`*${extTable.dataSourceFooter}*`);
    lines.push("");
  }
  // PMCF
  else if (slotId.includes("PMCF") && !slotId.includes("TABLE")) {
    const pmcfTable = generatePMCFTable(atoms);
    
    lines.push("Post-Market Clinical Follow-up activities conducted during the reporting period:");
    lines.push("");
    lines.push(pmcfTable.markdown);
    lines.push("");
    lines.push(`*${pmcfTable.dataSourceFooter}*`);
    lines.push("");
    
    const pmcfAtoms = getAtomsForTypes(atoms, ["pmcf_report_extract", "pmcf_summary"]);
    for (const atom of pmcfAtoms) {
      const findings = getValue(atom.normalizedData, "key_findings", "findings", "summary");
      if (findings) {
        lines.push(`**Key Findings:** ${findings}`);
        lines.push("");
        break;
      }
    }
  }
  // Findings and Conclusions
  else if (slotId.includes("FINDINGS") || slotId.includes("BENEFIT_RISK_CONCLUSION")) {
    const brResult = generateBenefitRiskNarrative(atoms);
    
    lines.push("### Overall Benefit-Risk Assessment");
    lines.push("");
    lines.push(brResult.markdown);
    lines.push("");
    lines.push(`*${brResult.dataSourceFooter}*`);
    lines.push("");
    
    lines.push("### Summary of Benefits Achieved");
    lines.push("");
    lines.push("Based on the clinical evidence and post-market surveillance data collected:");
    lines.push("- The device continues to perform as intended");
    lines.push("- Clinical benefits are being realized in clinical practice");
    lines.push("- No new or unacceptable risks have been identified");
    lines.push("");
    
    lines.push("### Actions and Recommendations");
    lines.push("");
    lines.push("1. Continue routine post-market surveillance activities");
    lines.push("2. Maintain current PMCF activities as per the PMCF plan");
    lines.push("3. No changes to labeling or risk management documentation required");
    lines.push("4. Next PSUR due as per regulatory requirements");
    lines.push("");
  }
  // MDCG: Device Changes vs Previous PSUR
  else if (slotId.includes("DEVICES_CHANGES")) {
    const changeAtom = relevantAtoms.find(a => a.evidenceType === "change_control_record");
    const prevPsurAtom = relevantAtoms.find(a => a.evidenceType === "previous_psur_extract");
    
    if (changeAtom?.normalizedData || prevPsurAtom?.normalizedData) {
      lines.push("**Changes to Device Scope:**");
      lines.push("");
      if (changeAtom?.normalizedData) {
        const change = changeAtom.normalizedData;
        lines.push(`- Change Description: ${getValue(change, "description") || "[MISSING]"}`);
        lines.push(`- Change Date: ${getValue(change, "date") || "[MISSING]"}`);
        lines.push(`- Status: ${getValue(change, "status") || "[MISSING]"}`);
      }
      if (prevPsurAtom?.normalizedData) {
        const prev = prevPsurAtom.normalizedData;
        lines.push("");
        lines.push(`**Previous PSUR Reference:** ${getValue(prev, "psur_reference") || "[MISSING]"}`);
        lines.push(`**Previous Period:** ${getValue(prev, "period") || "[MISSING]"}`);
      }
    } else {
      lines.push("No changes to device scope compared to previous PSUR. All devices previously covered remain within scope.");
    }
    lines.push("");
  }
  // MDCG: PMS Overview
  else if (slotId.includes("PMS_OVERVIEW")) {
    const pmsAtom = relevantAtoms.find(a => a.evidenceType === "pms_plan_extract");
    const activityAtom = relevantAtoms.find(a => a.evidenceType === "pms_activity_log");
    
    lines.push("**Post-Market Surveillance Activities Overview:**");
    lines.push("");
    lines.push("The following PMS activities were performed during the reporting period:");
    lines.push("- Complaint handling and trending");
    lines.push("- Vigilance reporting and incident investigation");
    lines.push("- Literature monitoring");
    lines.push("- External database searches (MAUDE, Eudamed)");
    lines.push("- Customer feedback collection");
    lines.push("- PMCF activities as defined in the PMCF plan");
    lines.push("");
    
    if (pmsAtom?.normalizedData) {
      const pms = pmsAtom.normalizedData;
      const content = getValue(pms, "content", "summary");
      if (content) {
        lines.push(`**PMS Plan Summary:** ${content}`);
        lines.push("");
      }
    }
  }
  // MDCG: Actions Taken
  else if (slotId.includes("ACTIONS_TAKEN")) {
    const changeAtom = relevantAtoms.find(a => a.evidenceType === "change_control_record");
    const rmfAtom = relevantAtoms.find(a => a.evidenceType === "rmf_change_log");
    const cerAtom = relevantAtoms.find(a => a.evidenceType === "cer_change_log");
    const capaAtom = relevantAtoms.find(a => a.evidenceType === "capa_summary");
    
    lines.push("**Actions Taken During Reporting Period:**");
    lines.push("");
    
    if (capaAtom?.normalizedData) {
      const capa = capaAtom.normalizedData;
      lines.push(`- **CAPAs:** ${getValue(capa, "total_capas", "completed") || 0} completed`);
    }
    
    if (rmfAtom?.normalizedData) {
      const rmf = rmfAtom.normalizedData;
      lines.push(`- **Risk Management File Updates:** ${getValue(rmf, "description") || "[MISSING]"}`);
    }
    
    if (cerAtom?.normalizedData) {
      const cer = cerAtom.normalizedData;
      lines.push(`- **Clinical Evaluation Report Updates:** ${getValue(cer, "description") || "[MISSING]"}`);
    }
    
    if (changeAtom?.normalizedData) {
      const change = changeAtom.normalizedData;
      lines.push(`- **Other Changes:** ${getValue(change, "description") || "[MISSING]"}`);
    }
    
    if (!capaAtom && !rmfAtom && !cerAtom && !changeAtom) {
      lines.push("- No significant actions or document updates required during this period.");
    }
    lines.push("");
  }
  // Default narrative
  else {
    if (relevantAtoms.length > 0) {
      for (const atom of relevantAtoms.slice(0, 3)) {
        const content = getValue(atom.normalizedData, "content", "summary", "description", "findings");
        if (content) {
          lines.push(content);
          lines.push("");
        }
      }
      if (lines.length === 0) {
        lines.push(`Evidence data available from: ${relevantAtoms.map(a => a.evidenceType).join(", ")}`);
        lines.push("");
      }
    } else if (proposal?.gapJustification) {
      lines.push(`**Note:** ${proposal.gapJustification}`);
      lines.push("");
    } else {
      lines.push("Evidence for this section has not been uploaded. Please upload the required evidence types.");
      lines.push("");
    }
  }
  
  return lines;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE SLOT RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

function renderTableSlot(
  slot: TemplateSlot,
  atoms: EvidenceAtomData[]
): string[] {
  const lines: string[] = [];
  const slotId = slot.slot_id.toUpperCase();
  
  // Route to appropriate table generator based on slot ID
  if (slotId.includes("SALES_TABLE") || slotId.includes("SALES_BY_REGION")) {
    const result = generateSalesTable(atoms);
    lines.push(result.markdown);
    lines.push("");
    lines.push(`*${result.dataSourceFooter}*`);
  }
  else if (slotId.includes("SERIOUS_INCIDENTS_TABLE") || slotId.includes("IMDRF")) {
    const result = generateSeriousIncidentsTable(atoms);
    lines.push(result.markdown);
    lines.push("");
    lines.push(`*${result.dataSourceFooter}*`);
  }
  else if (slotId.includes("COMPLAINTS_TABLE_TYPES") || slotId.includes("COMPLAINTS_BY_TYPE")) {
    const result = generateComplaintsTable(atoms);
    lines.push(result.markdown);
    lines.push("");
    lines.push(`*${result.dataSourceFooter}*`);
  }
  else if (slotId.includes("COMPLAINTS_BY_REGION") || slotId.includes("SEVERITY_TABLE")) {
    const result = generateComplaintsByRegionTable(atoms);
    lines.push(result.markdown);
    lines.push("");
    lines.push(`*${result.dataSourceFooter}*`);
  }
  else if (slotId.includes("TREND_TABLE")) {
    const result = generateTrendTable(atoms);
    lines.push(result.markdown);
    lines.push("");
    lines.push(`*${result.dataSourceFooter}*`);
  }
  else if (slotId.includes("FSCA_TABLE")) {
    const result = generateFSCATable(atoms);
    lines.push(result.markdown);
    lines.push("");
    lines.push(`*${result.dataSourceFooter}*`);
  }
  else if (slotId.includes("CAPA_TABLE")) {
    const result = generateCAPATable(atoms);
    lines.push(result.markdown);
    lines.push("");
    lines.push(`*${result.dataSourceFooter}*`);
  }
  else if (slotId.includes("TABLE10") || slotId.includes("ADVERSE_EVENTS_RECALLS") || slotId.includes("EXTERNAL_DB")) {
    const result = generateExternalDBTable(atoms);
    lines.push(result.markdown);
    lines.push("");
    lines.push(`*${result.dataSourceFooter}*`);
  }
  else if (slotId.includes("TABLE11") || slotId.includes("PMCF_ACTIVITIES") || slotId.includes("PMCF_TABLE")) {
    const result = generatePMCFTable(atoms);
    lines.push(result.markdown);
    lines.push("");
    lines.push(`*${result.dataSourceFooter}*`);
  }
  else {
    // Generic table - log for debugging
    console.warn(`[templateRenderer] No specific table handler for slot: ${slot.slot_id}`);
    lines.push("| Data | Value |");
    lines.push("|------|-------|");
    lines.push("| *Evidence required* | Upload evidence to populate this table |");
  }
  
  lines.push("");
  return lines;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN RENDERER
// ═══════════════════════════════════════════════════════════════════════════════

export function renderPsurFromTemplate(
  inputTemplate: Template | StrictTemplate,
  psurCase: PsurCase,
  atoms: EvidenceAtomData[],
  proposals: SlotProposal[],
  qualificationReport: QualificationReport | null
): string {
  // Adapt strict template to renderer format if needed
  const template: Template = 'slots' in inputTemplate && inputTemplate.slots[0]?.section_path
    ? adaptTemplate(inputTemplate as StrictTemplate)
    : inputTemplate as Template;
  const lines: string[] = [];
  
  // Create proposal lookup
  const proposalBySlot: Record<string, SlotProposal> = {};
  for (const p of proposals) {
    proposalBySlot[p.slotId] = p;
  }
  
  // Group slots by section
  const slotsBySection: Record<string, TemplateSlot[]> = {};
  const sectionOrder: string[] = [];
  
  for (const slot of template.slots) {
    const sec = slot.section;
    if (!slotsBySection[sec]) {
      slotsBySection[sec] = [];
      sectionOrder.push(sec);
    }
    slotsBySection[sec].push(slot);
  }
  
  // Track section numbering
  let sectionNum = 0;
  
  // Render each section
  for (const section of sectionOrder) {
    const slots = slotsBySection[section];
    
    for (const slot of slots) {
      const proposal = proposalBySlot[slot.slot_id];
      
      // Cover Page
      if (slot.render_as === "cover_page") {
        lines.push(...renderCoverPage(psurCase, slot, atoms));
        lines.push("---");
        lines.push("");
      }
      // Table of Contents
      else if (slot.render_as === "table_of_contents") {
        lines.push(...renderTableOfContents(template));
        lines.push("---");
        lines.push("");
      }
      // Regular sections
      else {
        // Add section header for first slot in section
        if (slots.indexOf(slot) === 0 && section !== "Cover" && section !== "FrontMatter") {
          sectionNum++;
          const sectionTitle = getSectionTitle(section, slot.title);
          lines.push(`## ${sectionNum}. ${sectionTitle}`);
          lines.push("");
        }
        
        // Add slot title as subsection - clean up redundant prefixes
        const slotTitle = slot.title
          .replace(/^Section [A-Z] — /, "")
          .replace(/^Section \d+ — /, "");
        lines.push(`### ${slotTitle}`);
        lines.push("");
        
        // Render based on type
        if (slot.render_as === "table") {
          lines.push(...renderTableSlot(slot, atoms));
        } else {
          lines.push(...renderNarrativeSlot(slot, atoms, proposal, psurCase));
        }
      }
    }
    
    // Add section separator
    if (section !== "Cover" && section !== "FrontMatter") {
      lines.push("---");
      lines.push("");
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // APPENDICES
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Appendix A: Evidence Summary
  sectionNum++;
  lines.push(`## ${sectionNum}. Appendix A: Evidence Atom Summary`);
  lines.push("");
  
  const byType: Record<string, number> = {};
  for (const a of atoms) {
    byType[a.evidenceType] = (byType[a.evidenceType] || 0) + 1;
  }
  
  lines.push("| Evidence Type | Count |");
  lines.push("|---------------|-------|");
  for (const [type, count] of Object.entries(byType).sort()) {
    lines.push(`| ${type} | ${count} |`);
  }
  lines.push(`| **Total** | **${atoms.length}** |`);
  lines.push("");
  lines.push("---");
  lines.push("");
  
  // Appendix B: Slot Mapping
  sectionNum++;
  lines.push(`## ${sectionNum}. Appendix B: Slot to Evidence Mapping`);
  lines.push("");
  
  const acceptedProposals = proposals.filter(p => p.status === "accepted");
  lines.push("| Slot ID | Evidence Atoms | Claimed Obligations |");
  lines.push("|---------|----------------|---------------------|");
  for (const p of acceptedProposals) {
    const atomCount = p.evidenceAtomIds?.length || 0;
    const obligations = (p.claimedObligationIds || []).slice(0, 2).join(", ");
    const moreObs = (p.claimedObligationIds?.length || 0) > 2 ? ` +${(p.claimedObligationIds?.length || 0) - 2}` : "";
    lines.push(`| ${p.slotId} | ${atomCount} atom(s) | ${obligations}${moreObs} |`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  
  // Appendix C: Qualification Report
  sectionNum++;
  lines.push(`## ${sectionNum}. Appendix C: Template Qualification Report`);
  lines.push("");
  
  if (qualificationReport && qualificationReport.status !== "NO_QUALIFICATION_RUN") {
    lines.push("| Parameter | Value |");
    lines.push("|-----------|-------|");
    lines.push(`| **Status** | ${qualificationReport.status} |`);
    lines.push(`| Template ID | ${qualificationReport.templateId} |`);
    lines.push(`| Total Slots | ${qualificationReport.slotCount || 0} |`);
    lines.push(`| Mandatory Obligations | ${qualificationReport.mandatoryObligationsFound || 0} / ${qualificationReport.mandatoryObligationsTotal || 0} |`);
    lines.push(`| Validated At | ${qualificationReport.validatedAt || "[MISSING]"} |`);
  } else {
    lines.push("No qualification report available. Run the orchestrator workflow to generate.");
  }
  lines.push("");
  
  // Footer
  lines.push("---");
  lines.push("");
  lines.push(`*Document generated by RegulatoryOS PSUR Engine v1.0.0 on ${new Date().toISOString()}*`);
  lines.push("");
  lines.push("**End of Document**");
  
  return lines.join("\n");
}
