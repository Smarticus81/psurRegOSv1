import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  AlignmentType,
  BorderStyle,
  PageBreak,
  convertInchesToTwip,
  ShadingType
} from "docx";
import { loadTemplate, getSlots, type Template } from "../../templateStore";
import type { SlotDefinition } from "../../templates/templateSchema";
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

// Font configuration
const FONTS = {
  TITLE: { name: "Arial", size: 24 },           // Arial 12pt = 24 half-points
  SUBTITLE: { name: "Arial", size: 20 },        // Arial 10pt Bold = 20 half-points
  BODY: { name: "Arial", size: 20 },            // Arial 10pt = 20 half-points
  TABLE: { name: "Calibri", size: 20 },         // Calibri 10pt = 20 half-points
};

// Helper to create styled title paragraph
function createTitle(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONTS.TITLE.name, size: FONTS.TITLE.size, bold: true })],
    spacing: { before: 200, after: 100 },
  });
}

// Helper to create styled section heading
function createSectionHeading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONTS.TITLE.name, size: FONTS.TITLE.size, bold: true })],
    spacing: { before: 300, after: 100 },
  });
}

// Helper to create styled subsection heading
function createSubHeading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONTS.SUBTITLE.name, size: FONTS.SUBTITLE.size, bold: true })],
    spacing: { before: 200, after: 80 },
  });
}

// Helper to create regular body text
function createBodyText(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONTS.BODY.name, size: FONTS.BODY.size })],
    spacing: { before: 60, after: 60 },
  });
}

// Helper to create bullet item
function createBulletItem(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `• ${text}`, font: FONTS.BODY.name, size: FONTS.BODY.size })],
    indent: { left: convertInchesToTwip(0.25) },
    spacing: { before: 40, after: 40 },
  });
}

// Helper to create table header cell
function createTableHeaderCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, font: FONTS.TABLE.name, size: FONTS.TABLE.size, bold: true })],
    })],
    shading: { fill: "E8E8E8", type: ShadingType.SOLID },
  });
}

// Helper to create table body cell
function createTableCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text, font: FONTS.TABLE.name, size: FONTS.TABLE.size })],
    })],
  });
}

interface TemplateSlot {
  slot_id: string;
  title: string;
  section: string;
  render_as: string;
  evidence_requirements?: { required_types: string[] };
}

// Convert new schema slot to renderer format
function adaptSlot(slot: SlotDefinition): TemplateSlot {
  const section = slot.section_path.split(" > ")[0];
  return {
    slot_id: slot.slot_id,
    title: slot.title,
    section,
    render_as: slot.output_requirements.render_as || (slot.slot_kind === "TABLE" ? "table" : "narrative"),
    evidence_requirements: {
      required_types: slot.evidence_requirements.required_types,
    },
  };
}

// Helper to get value from data
function getValue(data: any, ...keys: string[]): any {
  for (const key of keys) {
    const val = data?.[key];
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return null;
}

function getAtomsForTypes(atoms: EvidenceAtomData[], types: string[]): EvidenceAtomData[] {
  return atoms.filter(a => types.includes(a.evidenceType));
}

function getSectionTitle(section: string): string {
  const sectionNames: Record<string, string> = {
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
    "ExecutiveSummary": "Executive Summary",
    "DeviceDescription": "Device Description and Scope",
    "PMSActivities": "Post-Market Surveillance Activities",
    "Exposure": "Sales Volume and Population Exposure",
    "Safety": "Safety Information",
    "Trend": "Trend Reporting",
    "FSCA": "Field Safety Corrective Actions",
    "CAPA": "Corrective and Preventive Actions",
    "Literature": "Scientific Literature Review",
    "ExternalDatabases": "External Databases",
    "PMCF": "Post-Market Clinical Follow-up",
    "Conclusions": "Conclusions and Actions",
    "Cover": "Cover Page",
    "FrontMatter": "Front Matter",
  };
  return sectionNames[section] || section;
}

export async function generatePsurDocx(
  psurCase: any,
  evidenceAtoms: any[],
  proposals: any[],
  qualificationReport: any
): Promise<Buffer> {
  // Load template
  let template: any;
  try {
    template = loadTemplate(psurCase.templateId);
  } catch (e) {
    console.error("Failed to load template for DOCX:", e);
    // Return minimal document
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: `PSUR ${psurCase.psurReference}`, heading: HeadingLevel.TITLE }),
          new Paragraph({ text: `Error: Could not load template ${psurCase.templateId}` }),
        ],
      }],
    });
    return await Packer.toBuffer(doc);
  }

  // Convert atoms to renderer format
  const atomData: EvidenceAtomData[] = evidenceAtoms.map(a => ({
    atomId: a.atomId,
    evidenceType: a.evidenceType,
    normalizedData: a.normalizedData || a.data,
    provenance: a.provenance,
  }));

  const children: any[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(new Paragraph({ 
    children: [new TextRun({ 
      text: "PERIODIC SAFETY UPDATE REPORT", 
      font: FONTS.TITLE.name, 
      size: 36,  // 18pt for main title
      bold: true 
    })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 }
  }));

  // Manufacturer info
  const mfrAtom = atomData.find(a => a.evidenceType === "manufacturer_profile");
  if (mfrAtom?.normalizedData) {
    const mfr = mfrAtom.normalizedData;
    children.push(createSectionHeading("Manufacturer Information"));
    children.push(createKeyValueLine("Manufacturer", getValue(mfr, "manufacturer_name", "name") || "[MISSING]"));
    children.push(createKeyValueLine("Address", getValue(mfr, "address") || "[MISSING]"));
    children.push(createKeyValueLine("SRN", getValue(mfr, "srn") || "[MISSING]"));
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  }

  // Device info
  const devAtom = atomData.find(a => a.evidenceType === "device_registry_record");
  if (devAtom?.normalizedData) {
    const dev = devAtom.normalizedData;
    children.push(createSectionHeading("Device Information"));
    children.push(createKeyValueLine("Device Name", getValue(dev, "device_name", "name") || "[MISSING]"));
    children.push(createKeyValueLine("Model", getValue(dev, "model") || "[MISSING]"));
    children.push(createKeyValueLine("UDI-DI", getValue(dev, "udi_di") || "[MISSING]"));
    children.push(createKeyValueLine("Risk Class", getValue(dev, "risk_class") || "[MISSING]"));
    children.push(createKeyValueLine("Intended Purpose", getValue(dev, "intended_purpose") || "[MISSING]"));
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  }

  // Document info
  children.push(createSectionHeading("Document Information"));
  children.push(createKeyValueLine("Document Reference", psurCase.psurReference));
  children.push(createKeyValueLine("Template", psurCase.templateId));
  children.push(createKeyValueLine("Jurisdictions", (psurCase.jurisdictions || []).join(", ")));
  children.push(createKeyValueLine("Reporting Period", `${psurCase.startPeriod.toISOString().split("T")[0]} to ${psurCase.endPeriod.toISOString().split("T")[0]}`));
  children.push(createKeyValueLine("Version", String(psurCase.version || 1)));
  children.push(createKeyValueLine("Status", psurCase.status));
  children.push(createKeyValueLine("Generation Date", new Date().toISOString().split("T")[0]));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ═══════════════════════════════════════════════════════════════════════════
  // TABLE OF CONTENTS
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(createSectionHeading("Table of Contents"));
  
  // Adapt slots from new schema format
  const rawSlots = getSlots(template);
  const slots: TemplateSlot[] = rawSlots.map(adaptSlot);
  const sections: Record<string, TemplateSlot[]> = {};
  for (const slot of slots) {
    if (slot.render_as === "table_of_contents" || slot.render_as === "cover_page") continue;
    const sec = slot.section;
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(slot);
  }
  
  let tocNum = 1;
  for (const [section, sectionSlots] of Object.entries(sections)) {
    children.push(new Paragraph({ 
      children: [new TextRun({ 
        text: `${tocNum}. ${getSectionTitle(section)}`,
        font: FONTS.BODY.name,
        size: FONTS.BODY.size
      })],
      spacing: { before: 100 }
    }));
    tocNum++;
  }
  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ═══════════════════════════════════════════════════════════════════════════
  // QUALIFICATION STATUS
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(createSectionHeading("Template Qualification Status"));
  
  if (qualificationReport && qualificationReport.status !== "NO_QUALIFICATION_RUN") {
    children.push(createKeyValueLine("Status", qualificationReport.status));
    children.push(createKeyValueLine("Template ID", qualificationReport.templateId || "[MISSING]"));
    children.push(createKeyValueLine("Total Slots", String(qualificationReport.slotCount || 0)));
    children.push(createKeyValueLine("Mandatory Obligations", 
      `${qualificationReport.mandatoryObligationsFound || 0} / ${qualificationReport.mandatoryObligationsTotal || 0}`));
    children.push(createKeyValueLine("Constraints", String(qualificationReport.constraints || 0)));
  } else {
    children.push(createBodyText("No qualification report available."));
  }
  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER EACH SECTION
  // ═══════════════════════════════════════════════════════════════════════════
  let sectionNum = 1;
  for (const [section, sectionSlots] of Object.entries(sections)) {
    // Section header
    children.push(createSectionHeading(`${sectionNum}. ${getSectionTitle(section)}`));

    for (const slot of sectionSlots) {
      const slotId = slot.slot_id;
      const requiredTypes = slot.evidence_requirements?.required_types || [];
      const relevantAtoms = getAtomsForTypes(atomData, requiredTypes);

      // Slot title - clean up redundant prefixes
      const slotTitle = slot.title
        .replace(/^Section [A-Z] — /, "")
        .replace(/^Section \d+ — /, "");
      children.push(createSubHeading(slotTitle));

      // Render content based on slot type
      if (slot.render_as === "table") {
        children.push(...renderTableSection(slotId, atomData));
      } else {
        children.push(...renderNarrativeSection(slotId, atomData, relevantAtoms, psurCase));
      }
    }
    sectionNum++;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPENDICES
  // ═══════════════════════════════════════════════════════════════════════════
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(new Paragraph({ text: "Appendix A: Evidence Summary", heading: HeadingLevel.HEADING_1 }));
  
  const byType: Record<string, number> = {};
  for (const a of atomData) {
    byType[a.evidenceType] = (byType[a.evidenceType] || 0) + 1;
  }
  
  const evidenceRows = [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Evidence Type", bold: true })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Count", bold: true })] })] }),
      ],
    }),
  ];
  for (const [type, count] of Object.entries(byType).sort()) {
    evidenceRows.push(new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: type })] }),
        new TableCell({ children: [new Paragraph({ text: String(count) })] }),
      ],
    }));
  }
  evidenceRows.push(new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Total", bold: true })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(atomData.length), bold: true })] })] }),
    ],
  }));
  
  children.push(new Table({ rows: evidenceRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
  children.push(new Paragraph({ text: "", spacing: { after: 200 } }));

  // Slot mapping appendix
  children.push(new Paragraph({ text: "Appendix B: Slot to Evidence Mapping", heading: HeadingLevel.HEADING_1 }));
  
  const acceptedProposals = proposals.filter(p => p.status === "accepted");
  const mappingRows = [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Slot ID", bold: true })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Evidence Atoms", bold: true })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Obligations", bold: true })] })] }),
      ],
    }),
  ];
  for (const p of acceptedProposals) {
    const atomCount = p.evidenceAtomIds?.length || 0;
    const obligationCount = p.claimedObligationIds?.length || 0;
    mappingRows.push(new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: p.slotId })] }),
        new TableCell({ children: [new Paragraph({ text: `${atomCount} atom(s)` })] }),
        new TableCell({ children: [new Paragraph({ text: `${obligationCount} obligation(s)` })] }),
      ],
    }));
  }
  children.push(new Table({ rows: mappingRows, width: { size: 100, type: WidthType.PERCENTAGE } }));

  // Footer
  children.push(new Paragraph({
    children: [
      new TextRun({
        text: `Generated by RegulatoryOS PSUR Engine v1.0.0 on ${new Date().toISOString()}`,
        italics: true,
        size: 20,
        color: "808080"
      })
    ],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 }
  }));

  const doc = new Document({
    sections: [{
      properties: {},
      children: children,
    }],
  });

  return await Packer.toBuffer(doc);
}

function renderTableSection(slotId: string, atoms: EvidenceAtomData[]): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  let tableData: { markdown: string; dataSourceFooter: string } | null = null;
  const slotIdUpper = slotId.toUpperCase();

  if (slotIdUpper.includes("SALES_TABLE") || slotIdUpper.includes("SALES_BY_REGION")) {
    tableData = generateSalesTable(atoms);
  } else if (slotIdUpper.includes("SERIOUS_INCIDENTS_TABLE") || slotIdUpper.includes("IMDRF")) {
    tableData = generateSeriousIncidentsTable(atoms);
  } else if (slotIdUpper.includes("COMPLAINTS_TABLE") || slotIdUpper.includes("COMPLAINTS_BY_TYPE")) {
    tableData = generateComplaintsTable(atoms);
  } else if (slotIdUpper.includes("COMPLAINTS_BY_REGION") || slotIdUpper.includes("SEVERITY_TABLE")) {
    tableData = generateComplaintsByRegionTable(atoms);
  } else if (slotIdUpper.includes("TREND_TABLE")) {
    tableData = generateTrendTable(atoms);
  } else if (slotIdUpper.includes("FSCA_TABLE")) {
    tableData = generateFSCATable(atoms);
  } else if (slotIdUpper.includes("CAPA_TABLE")) {
    tableData = generateCAPATable(atoms);
  } else if (slotIdUpper.includes("TABLE10") || slotIdUpper.includes("ADVERSE_EVENTS") || slotIdUpper.includes("EXTERNAL_DB")) {
    tableData = generateExternalDBTable(atoms);
  } else if (slotIdUpper.includes("TABLE11") || slotIdUpper.includes("PMCF_ACTIVITIES") || slotIdUpper.includes("PMCF_TABLE")) {
    tableData = generatePMCFTable(atoms);
  }

  if (tableData) {
    // Parse markdown table to DOCX table
    const lines = tableData.markdown.split("\n").filter(l => l.trim());
    if (lines.length >= 2) {
      const headerLine = lines[0];
      const headers = headerLine.split("|").filter(c => c.trim()).map(c => c.trim());
      
      const tableRows: TableRow[] = [];
      
      // Header row with Calibri 10pt Bold and gray background
      tableRows.push(new TableRow({
        children: headers.map(h => new TableCell({
          children: [new Paragraph({ 
            children: [new TextRun({ 
              text: h, 
              bold: true, 
              font: FONTS.TABLE.name, 
              size: FONTS.TABLE.size 
            })] 
          })],
          shading: { fill: "E8E8E8", type: ShadingType.SOLID },
        }))
      }));
      
      // Data rows (skip separator line at index 1) with Calibri 10pt
      for (let i = 2; i < lines.length; i++) {
        const cells = lines[i].split("|").filter(c => c.trim()).map(c => c.trim());
        if (cells.length > 0) {
          tableRows.push(new TableRow({
            children: cells.map(c => new TableCell({
              children: [new Paragraph({ 
                children: [new TextRun({ 
                  text: c.replace(/\*\*/g, ""), 
                  font: FONTS.TABLE.name, 
                  size: FONTS.TABLE.size,
                  bold: c.includes("**") // Bold for total rows
                })] 
              })]
            }))
          }));
        }
      }
      
      if (tableRows.length > 0) {
        elements.push(new Table({ 
          rows: tableRows, 
          width: { size: 100, type: WidthType.PERCENTAGE } 
        }));
      }
    }
    
    elements.push(new Paragraph({
      children: [new TextRun({ text: tableData.dataSourceFooter, italics: true, font: FONTS.BODY.name, size: 18 })],
      spacing: { after: 200 }
    }));
  } else {
    elements.push(createBodyText("Evidence required - upload evidence to populate this table."));
  }

  return elements;
}

function renderNarrativeSection(
  slotId: string, 
  atoms: EvidenceAtomData[], 
  relevantAtoms: EvidenceAtomData[],
  psurCase: any
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  const slotIdUpper = slotId.toUpperCase();

  // Executive Summary
  if (slotIdUpper.includes("EXEC_SUMMARY")) {
    elements.push(createBodyText(`This Periodic Safety Update Report covers the period from ${psurCase.startPeriod.toISOString().split("T")[0]} to ${psurCase.endPeriod.toISOString().split("T")[0]} and is prepared in accordance with ${(psurCase.jurisdictions || []).join(" and ")} requirements.`));
    elements.push(createBodyText("This report summarizes the post-market surveillance data collected during the reporting period, including:"));
    elements.push(createBulletPoint("Sales volume and population exposure"));
    elements.push(createBulletPoint("Serious incidents and vigilance reporting"));
    elements.push(createBulletPoint("Customer complaints and feedback"));
    elements.push(createBulletPoint("Trend analysis and signal detection"));
    elements.push(createBulletPoint("Field Safety Corrective Actions (FSCAs)"));
    elements.push(createBulletPoint("Corrective and Preventive Actions (CAPAs)"));
    elements.push(createBulletPoint("Post-Market Clinical Follow-up (PMCF) activities"));
    elements.push(createBulletPoint("Scientific literature review"));
    elements.push(createBulletPoint("External database searches"));
    elements.push(createBulletPoint("Overall benefit-risk assessment"));
  }
  // Sales/Exposure
  else if (slotIdUpper.includes("SALES_VOLUME") || slotIdUpper.includes("EXPOSURE")) {
    elements.push(createBodyText("The following data summarizes the volume of sales and population exposure during the reporting period:"));
    const salesResult = generateSalesTable(atoms);
    elements.push(new Paragraph({ children: [new TextRun({ text: salesResult.dataSourceFooter, italics: true, font: FONTS.BODY.name, size: 18 })], spacing: { after: 200 } }));
  }
  // Serious Incidents
  else if (slotIdUpper.includes("SERIOUS_INCIDENTS") && !slotIdUpper.includes("TABLE")) {
    const incidentAtoms = getAtomsForTypes(atoms, ["serious_incident_summary", "serious_incident_records_imdrf", "vigilance_report"]);
    const hasIncidents = incidentAtoms.some(a => !a.normalizedData?.isNegativeEvidence);
    if (hasIncidents) {
      elements.push(createBodyText("The following serious incidents were reported during the PSUR period. All incidents have been investigated and reported to the relevant competent authorities."));
    } else {
      elements.push(new Paragraph({ children: [new TextRun({ text: "No serious incidents were reported during the PSUR period.", bold: true, font: FONTS.BODY.name, size: FONTS.BODY.size })], spacing: { after: 200 } }));
    }
  }
  // Complaints
  else if (slotIdUpper.includes("COMPLAINTS") && !slotIdUpper.includes("TABLE") && !slotIdUpper.includes("BY_REGION")) {
    elements.push(createBodyText("Product complaints received during the reporting period have been categorized and analyzed."));
  }
  // FSCA
  else if (slotIdUpper.includes("FSCA") && !slotIdUpper.includes("TABLE")) {
    const fscaAtoms = getAtomsForTypes(atoms, ["fsca_summary", "fsca_record"]);
    const hasFscas = fscaAtoms.some(a => !a.normalizedData?.isNegativeEvidence);
    if (hasFscas) {
      elements.push(createBodyText("The following Field Safety Corrective Actions were conducted during the reporting period:"));
    } else {
      elements.push(new Paragraph({ children: [new TextRun({ text: "No Field Safety Corrective Actions (FSCAs) were required during the reporting period.", bold: true, font: FONTS.BODY.name, size: FONTS.BODY.size })], spacing: { after: 200 } }));
    }
  }
  // CAPA
  else if (slotIdUpper.includes("CAPA") && !slotIdUpper.includes("TABLE")) {
    const capaAtoms = getAtomsForTypes(atoms, ["capa_summary", "capa_record"]);
    const hasCapas = capaAtoms.some(a => !a.normalizedData?.isNegativeEvidence);
    if (hasCapas) {
      elements.push(createBodyText("Corrective and Preventive Actions undertaken during the reporting period:"));
    } else {
      elements.push(createBodyText("No significant CAPAs were initiated during the reporting period."));
    }
  }
  // Literature
  else if (slotIdUpper.includes("LITERATURE")) {
    elements.push(createBodyText("A systematic literature review was conducted covering relevant scientific publications:"));
  }
  // External Databases
  else if (slotIdUpper.includes("EXTERNAL_DATABASE") || slotIdUpper.includes("EXTERNAL_DB")) {
    elements.push(createBodyText("External databases and registries were searched for relevant safety information:"));
  }
  // PMCF
  else if (slotIdUpper.includes("PMCF") && !slotIdUpper.includes("TABLE")) {
    elements.push(createBodyText("Post-Market Clinical Follow-up activities conducted during the reporting period:"));
  }
  // Benefit-Risk / Conclusions
  else if (slotIdUpper.includes("BENEFIT_RISK") || slotIdUpper.includes("FINDINGS") || slotIdUpper.includes("CONCLUSIONS")) {
    const brResult = generateBenefitRiskNarrative(atoms);
    
    // Parse the markdown narrative
    const lines = brResult.markdown.split("\n").filter(l => l.trim());
    for (const line of lines) {
      if (line.startsWith("**")) {
        const text = line.replace(/\*\*/g, "");
        elements.push(new Paragraph({ children: [new TextRun({ text, bold: true, font: FONTS.BODY.name, size: FONTS.BODY.size })], spacing: { after: 100 } }));
      } else if (line.startsWith("- ")) {
        elements.push(createBulletPoint(line.substring(2)));
      } else {
        elements.push(createBodyText(line));
      }
    }
    elements.push(new Paragraph({ children: [new TextRun({ text: brResult.dataSourceFooter, italics: true, font: FONTS.BODY.name, size: 18 })], spacing: { after: 200 } }));
  }
  // Default
  else {
    if (relevantAtoms.length > 0) {
      for (const atom of relevantAtoms.slice(0, 2)) {
        const content = getValue(atom.normalizedData, "content", "summary", "description", "findings");
        if (content) {
          elements.push(createBodyText(String(content)));
        }
      }
    }
    if (elements.length === 0) {
      elements.push(createBodyText("Evidence data available - see evidence appendix for details."));
    }
  }

  return elements;
}

function createKeyValueLine(key: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${key}: `, bold: true, font: FONTS.BODY.name, size: FONTS.BODY.size }),
      new TextRun({ text: value, font: FONTS.BODY.name, size: FONTS.BODY.size }),
    ],
    spacing: { after: 60 }
  });
}

function createBulletPoint(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `• ${text}`, font: FONTS.BODY.name, size: FONTS.BODY.size })],
    indent: { left: convertInchesToTwip(0.25) },
    spacing: { after: 50 }
  });
}
