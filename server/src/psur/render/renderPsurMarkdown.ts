/**
 * PSUR MARKDOWN RENDERER
 * 
 * Section-aware PSUR renderer that produces a Notified Body-ready document.
 * 
 * Rules:
 * - One markdown file output
 * - Section headers are FIXED per PSUR contract
 * - Tables rendered deterministically
 * - Figures referenced but not embedded
 * - Paragraph-level trace IDs injected
 * 
 * Per PSUR Contract and MDCG 2022-21
 */

import type {
  PSURDocument,
  PSURSection,
  PSURTable,
  PSURFigure,
  PSURParagraph,
  TableRow,
  PSURCoverPage,
  PSURConclusionBlock,
  PSURSignoffBlock,
  TraceReference,
  PSURSectionId,
} from "../psurContract";
import { SECTION_NUMBERS, SECTION_TITLES } from "../psurContract";

// ============================================================================
// RENDER OPTIONS
// ============================================================================

export interface RenderOptions {
  includeTraceIds: boolean;
  includeTableOfContents: boolean;
  includeFigureReferences: boolean;
  includeAppendices: boolean;
  dateFormat: "ISO" | "EU" | "US";
  traceIdFormat: "INLINE" | "FOOTNOTE" | "HIDDEN";
}

const DEFAULT_OPTIONS: RenderOptions = {
  includeTraceIds: true,
  includeTableOfContents: true,
  includeFigureReferences: true,
  includeAppendices: true,
  dateFormat: "ISO",
  traceIdFormat: "INLINE",
};

// ============================================================================
// MAIN RENDER FUNCTION
// ============================================================================

export function renderPsurToMarkdown(
  document: PSURDocument,
  options: Partial<RenderOptions> = {}
): string {
  const opts: RenderOptions = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [];
  
  // -------------------------------------------------------------------------
  // RENDER COVER PAGE
  // -------------------------------------------------------------------------
  lines.push(...renderCoverPage(document.coverPage, opts));
  lines.push("");
  lines.push("---");
  lines.push("");
  
  // -------------------------------------------------------------------------
  // RENDER TABLE OF CONTENTS
  // -------------------------------------------------------------------------
  if (opts.includeTableOfContents) {
    lines.push(...renderTableOfContents(document.sections, opts));
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  
  // -------------------------------------------------------------------------
  // RENDER SECTIONS
  // -------------------------------------------------------------------------
  for (const section of document.sections) {
    lines.push(...renderSection(section, opts, 2));
    lines.push("");
  }
  
  // -------------------------------------------------------------------------
  // RENDER CONCLUSIONS
  // -------------------------------------------------------------------------
  lines.push(...renderConclusions(document.conclusions, opts));
  lines.push("");
  
  // -------------------------------------------------------------------------
  // RENDER SIGNOFF
  // -------------------------------------------------------------------------
  lines.push(...renderSignoff(document.signoff, opts));
  lines.push("");
  
  // -------------------------------------------------------------------------
  // RENDER APPENDICES
  // -------------------------------------------------------------------------
  if (opts.includeAppendices) {
    lines.push("---");
    lines.push("");
    lines.push(...renderAppendices(document, opts));
  }
  
  // -------------------------------------------------------------------------
  // RENDER TRACE LOG APPENDIX
  // -------------------------------------------------------------------------
  if (opts.includeTraceIds) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(...renderTraceLogAppendix(document.traceLog, opts));
  }
  
  return lines.join("\n");
}

// ============================================================================
// COVER PAGE RENDERER
// ============================================================================

function renderCoverPage(cover: PSURCoverPage, opts: RenderOptions): string[] {
  const lines: string[] = [];
  
  lines.push(`# ${cover.documentTitle}`);
  lines.push("");
  lines.push(`**Document Type:** ${cover.documentType}`);
  lines.push(`**PSUR Reference:** ${cover.psurReference}`);
  lines.push(`**Version:** ${cover.version}`);
  lines.push(`**Generated:** ${formatDate(cover.traceRef.validatedAt, opts.dateFormat)}`);
  lines.push("");
  
  lines.push("## Reporting Period");
  lines.push("");
  lines.push(`**Start Date:** ${formatDate(cover.reportingPeriod.start, opts.dateFormat)}`);
  lines.push(`**End Date:** ${formatDate(cover.reportingPeriod.end, opts.dateFormat)}`);
  lines.push("");
  
  lines.push("## Device Information");
  lines.push("");
  lines.push(`| Parameter | Value |`);
  lines.push(`|-----------|-------|`);
  lines.push(`| Device Name | ${cover.deviceInfo.deviceName} |`);
  lines.push(`| Device Code | ${cover.deviceInfo.deviceCode} |`);
  if (cover.deviceInfo.udiDi) {
    lines.push(`| UDI-DI | ${cover.deviceInfo.udiDi} |`);
  }
  lines.push(`| Risk Class | ${cover.deviceInfo.riskClass} |`);
  lines.push(`| Intended Purpose | ${cover.deviceInfo.intendedPurpose} |`);
  lines.push("");
  
  lines.push("## Manufacturer Information");
  lines.push("");
  lines.push(`**Manufacturer:** ${cover.manufacturerInfo.name}`);
  if (cover.manufacturerInfo.address) {
    lines.push(`**Address:** ${cover.manufacturerInfo.address}`);
  }
  if (cover.manufacturerInfo.authorizedRepresentative) {
    lines.push(`**EU Authorized Representative:** ${cover.manufacturerInfo.authorizedRepresentative}`);
  }
  lines.push("");
  
  lines.push("## Regulatory Information");
  lines.push("");
  lines.push(`**Jurisdictions:** ${cover.regulatoryInfo.jurisdictions.join(", ")}`);
  if (cover.regulatoryInfo.certificateNumbers && cover.regulatoryInfo.certificateNumbers.length > 0) {
    lines.push(`**Certificate Numbers:** ${cover.regulatoryInfo.certificateNumbers.join(", ")}`);
  }
  if (cover.regulatoryInfo.notifiedBody) {
    lines.push(`**Notified Body:** ${cover.regulatoryInfo.notifiedBody}`);
  }
  lines.push("");
  
  lines.push("## Document Control");
  lines.push("");
  lines.push(`**Prepared By:** ${cover.documentControl.preparedBy}`);
  if (cover.documentControl.reviewedBy) {
    lines.push(`**Reviewed By:** ${cover.documentControl.reviewedBy}`);
  }
  if (cover.documentControl.approvedBy) {
    lines.push(`**Approved By:** ${cover.documentControl.approvedBy}`);
  }
  if (cover.documentControl.approvalDate) {
    lines.push(`**Approval Date:** ${formatDate(cover.documentControl.approvalDate, opts.dateFormat)}`);
  }
  
  if (opts.includeTraceIds && opts.traceIdFormat === "INLINE") {
    lines.push("");
    lines.push(`*[Trace: ${cover.traceRef.paragraphId}]*`);
  }
  
  return lines;
}

// ============================================================================
// TABLE OF CONTENTS RENDERER
// ============================================================================

function renderTableOfContents(sections: PSURSection[], opts: RenderOptions): string[] {
  const lines: string[] = [];
  
  lines.push("## Table of Contents");
  lines.push("");
  
  for (const section of sections) {
    const indent = section.sectionNumber.split(".").length - 1;
    const prefix = "  ".repeat(indent);
    lines.push(`${prefix}- [${section.sectionNumber}. ${section.title}](#${slugify(section.title)})`);
    
    if (section.subsections) {
      for (const sub of section.subsections) {
        const subIndent = sub.sectionNumber.split(".").length - 1;
        const subPrefix = "  ".repeat(subIndent);
        lines.push(`${subPrefix}- [${sub.sectionNumber}. ${sub.title}](#${slugify(sub.title)})`);
      }
    }
  }
  
  lines.push("");
  lines.push("- [Conclusions and Recommendations](#conclusions-and-recommendations)");
  lines.push("- [Document Approval and Signoff](#document-approval-and-signoff)");
  lines.push("- [Appendix A: Evidence Register](#appendix-a-evidence-register)");
  lines.push("- [Appendix B: Trace Log](#appendix-b-trace-log)");
  
  return lines;
}

// ============================================================================
// SECTION RENDERER
// ============================================================================

function renderSection(
  section: PSURSection,
  opts: RenderOptions,
  headingLevel: number
): string[] {
  const lines: string[] = [];
  const heading = "#".repeat(headingLevel);
  
  lines.push(`${heading} ${section.sectionNumber}. ${section.title}`);
  lines.push("");
  
  // Render paragraphs
  for (const paragraph of section.paragraphs) {
    lines.push(...renderParagraph(paragraph, opts));
    lines.push("");
  }
  
  // Render tables
  if (section.tables && section.tables.length > 0) {
    for (const table of section.tables) {
      lines.push(...renderTable(table, opts));
      lines.push("");
    }
  }
  
  // Render figure references
  if (opts.includeFigureReferences && section.figures && section.figures.length > 0) {
    for (const figure of section.figures) {
      lines.push(...renderFigureReference(figure, opts));
      lines.push("");
    }
  }
  
  // Render subsections
  if (section.subsections && section.subsections.length > 0) {
    for (const sub of section.subsections) {
      lines.push(...renderSection(sub, opts, headingLevel + 1));
    }
  }
  
  // Add trace reference
  if (opts.includeTraceIds && opts.traceIdFormat === "INLINE") {
    lines.push(`*[Section Trace: ${section.traceRef.paragraphId} | Evidence: ${section.traceRef.evidenceAtomIds.length} atoms]*`);
    lines.push("");
  }
  
  return lines;
}

// ============================================================================
// PARAGRAPH RENDERER
// ============================================================================

function renderParagraph(paragraph: PSURParagraph, opts: RenderOptions): string[] {
  const lines: string[] = [];
  
  lines.push(paragraph.content);
  
  if (opts.includeTraceIds) {
    if (opts.traceIdFormat === "INLINE" && paragraph.traceRef.evidenceAtomIds.length > 0) {
      const atomIds = paragraph.traceRef.evidenceAtomIds.slice(0, 3).join(", ");
      const moreCount = paragraph.traceRef.evidenceAtomIds.length - 3;
      const moreText = moreCount > 0 ? ` +${moreCount} more` : "";
      lines.push(`*[Ref: ${atomIds}${moreText}]*`);
    } else if (opts.traceIdFormat === "FOOTNOTE") {
      lines.push(`[^${paragraph.paragraphId}]`);
    }
  }
  
  return lines;
}

// ============================================================================
// TABLE RENDERER
// ============================================================================

function renderTable(table: PSURTable, opts: RenderOptions): string[] {
  const lines: string[] = [];
  
  lines.push(`**${table.title}**`);
  lines.push("");
  
  // Determine column widths (simplified)
  const columnCount = table.columns.length;
  
  // Render header
  if (table.rows.length > 0) {
    const headerRow = table.rows.find(r => r.isHeader);
    if (headerRow) {
      lines.push("| " + headerRow.cells.map(c => formatCellValue(c.value, c.format)).join(" | ") + " |");
      lines.push("| " + headerRow.cells.map(() => "---").join(" | ") + " |");
    } else {
      // Use column names as header
      lines.push("| " + table.columns.join(" | ") + " |");
      lines.push("| " + table.columns.map(() => "---").join(" | ") + " |");
    }
  }
  
  // Render data rows
  for (const row of table.rows) {
    if (row.isHeader) continue; // Skip header row
    
    const prefix = row.isTotal ? "**" : "";
    const suffix = row.isTotal ? "**" : "";
    
    const cells = row.cells.map(c => `${prefix}${formatCellValue(c.value, c.format)}${suffix}`);
    lines.push("| " + cells.join(" | ") + " |");
  }
  
  // Add footnotes
  if (table.footnotes && table.footnotes.length > 0) {
    lines.push("");
    for (const footnote of table.footnotes) {
      lines.push(`*${footnote}*`);
    }
  }
  
  // Add calculation formula reference
  if (table.calculationFormula && opts.includeTraceIds) {
    lines.push("");
    lines.push(`*Calculation: ${table.calculationFormula}*`);
  }
  
  // Add trace
  if (opts.includeTraceIds && opts.traceIdFormat === "INLINE") {
    lines.push(`*[Table Trace: ${table.traceRef.paragraphId}]*`);
  }
  
  return lines;
}

// ============================================================================
// FIGURE REFERENCE RENDERER
// ============================================================================

function renderFigureReference(figure: PSURFigure, opts: RenderOptions): string[] {
  const lines: string[] = [];
  
  lines.push(`**${figure.title}**`);
  lines.push("");
  lines.push(`*[Figure ${figure.figureId}: ${figure.description}]*`);
  lines.push(`*Chart Type: ${figure.chartType} | Data Source: ${figure.dataSource}*`);
  
  if (figure.xAxis && figure.yAxis) {
    lines.push(`*X-Axis: ${figure.xAxis} | Y-Axis: ${figure.yAxis}*`);
  }
  
  lines.push("");
  lines.push("<!-- Figure to be generated from data source -->");
  
  return lines;
}

// ============================================================================
// CONCLUSIONS RENDERER
// ============================================================================

function renderConclusions(conclusions: PSURConclusionBlock, opts: RenderOptions): string[] {
  const lines: string[] = [];
  
  lines.push("## 13. Conclusions and Recommendations");
  lines.push("");
  
  lines.push("### Overall Conclusion");
  lines.push("");
  lines.push(`**Status:** ${conclusions.overallConclusion}`);
  lines.push("");
  lines.push(conclusions.benefitRiskStatement);
  lines.push("");
  
  if (conclusions.keyFindings.length > 0) {
    lines.push("### Key Findings");
    lines.push("");
    for (const finding of conclusions.keyFindings) {
      lines.push(`- ${finding}`);
    }
    lines.push("");
  }
  
  if (conclusions.actionsRequired.length > 0) {
    lines.push("### Actions Required");
    lines.push("");
    for (const action of conclusions.actionsRequired) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  } else {
    lines.push("### Actions Required");
    lines.push("");
    lines.push("No additional actions are required at this time.");
    lines.push("");
  }
  
  lines.push("### PMCF Determination");
  lines.push("");
  lines.push(`**PMCF Required:** ${conclusions.pmcfRequired ? "YES" : "NO"}`);
  lines.push("");
  lines.push(conclusions.pmcfJustification);
  lines.push("");
  
  lines.push("### Next Review");
  lines.push("");
  lines.push(`The next PSUR is due: ${formatDate(conclusions.nextReviewDate, opts.dateFormat)}`);
  
  if (opts.includeTraceIds && opts.traceIdFormat === "INLINE") {
    lines.push("");
    lines.push(`*[Trace: ${conclusions.traceRef.paragraphId}]*`);
  }
  
  return lines;
}

// ============================================================================
// SIGNOFF RENDERER
// ============================================================================

function renderSignoff(signoff: PSURSignoffBlock, opts: RenderOptions): string[] {
  const lines: string[] = [];
  
  lines.push("## 14. Document Approval and Signoff");
  lines.push("");
  lines.push(signoff.declarationText);
  lines.push("");
  
  lines.push("### Document Preparation");
  lines.push("");
  lines.push(`| Role | Name | Date | Signature |`);
  lines.push(`|------|------|------|-----------|`);
  lines.push(`| ${signoff.preparer.role} | ${signoff.preparer.name || "_________________"} | ${formatDate(signoff.preparer.date, opts.dateFormat)} | ${signoff.preparer.signature || "_________________"} |`);
  
  if (signoff.qmsReviewer) {
    lines.push(`| ${signoff.qmsReviewer.role} | ${signoff.qmsReviewer.name || "_________________"} | ${formatDate(signoff.qmsReviewer.date, opts.dateFormat)} | ${signoff.qmsReviewer.signature || "_________________"} |`);
  }
  
  if (signoff.raReviewer) {
    lines.push(`| ${signoff.raReviewer.role} | ${signoff.raReviewer.name || "_________________"} | ${formatDate(signoff.raReviewer.date, opts.dateFormat)} | ${signoff.raReviewer.signature || "_________________"} |`);
  }
  
  lines.push(`| ${signoff.finalApprover.role} | ${signoff.finalApprover.name || "_________________"} | ${signoff.finalApprover.date ? formatDate(signoff.finalApprover.date, opts.dateFormat) : "_________________"} | ${signoff.finalApprover.signature || "_________________"} |`);
  lines.push("");
  
  lines.push("### Declaration");
  lines.push("");
  lines.push(`> ${signoff.preparer.declaration}`);
  lines.push("");
  lines.push(`> ${signoff.finalApprover.declaration}`);
  
  return lines;
}

// ============================================================================
// APPENDICES RENDERER
// ============================================================================

function renderAppendices(document: PSURDocument, opts: RenderOptions): string[] {
  const lines: string[] = [];
  
  lines.push("## Appendix A: Evidence Register");
  lines.push("");
  lines.push("The following evidence atoms were used in the preparation of this PSUR:");
  lines.push("");
  
  // Collect all evidence atom IDs from sections
  const allAtomIds = new Set<string>();
  for (const section of document.sections) {
    for (const atomId of section.traceRef.evidenceAtomIds) {
      allAtomIds.add(atomId);
    }
    for (const paragraph of section.paragraphs) {
      for (const atomId of paragraph.traceRef.evidenceAtomIds) {
        allAtomIds.add(atomId);
      }
    }
    if (section.tables) {
      for (const table of section.tables) {
        for (const atomId of table.traceRef.evidenceAtomIds) {
          allAtomIds.add(atomId);
        }
      }
    }
  }
  
  lines.push("| Atom ID | Section(s) Referenced |");
  lines.push("|---------|----------------------|");
  
  const atomSections = new Map<string, string[]>();
  for (const section of document.sections) {
    for (const atomId of section.traceRef.evidenceAtomIds) {
      const existing = atomSections.get(atomId) || [];
      existing.push(section.sectionNumber);
      atomSections.set(atomId, existing);
    }
  }
  
  for (const [atomId, sections] of atomSections) {
    lines.push(`| ${atomId} | ${sections.join(", ")} |`);
  }
  
  if (atomSections.size === 0) {
    lines.push("| No evidence atoms | - |");
  }
  
  return lines;
}

// ============================================================================
// TRACE LOG APPENDIX RENDERER
// ============================================================================

function renderTraceLogAppendix(traceLog: TraceReference[], opts: RenderOptions): string[] {
  const lines: string[] = [];
  
  lines.push("## Appendix B: Trace Log");
  lines.push("");
  lines.push("Complete traceability log for audit purposes:");
  lines.push("");
  
  lines.push("| Paragraph ID | Evidence Count | Calculation | Validated At |");
  lines.push("|--------------|----------------|-------------|--------------|");
  
  for (const trace of traceLog) {
    lines.push(`| ${trace.paragraphId} | ${trace.evidenceAtomIds.length} | ${trace.calculationId || "-"} | ${formatDate(trace.validatedAt, opts.dateFormat)} |`);
  }
  
  if (traceLog.length === 0) {
    lines.push("| No trace entries | - | - | - |");
  }
  
  return lines;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatDate(dateStr: string | undefined, format: "ISO" | "EU" | "US"): string {
  if (!dateStr) return "_________________";
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    switch (format) {
      case "ISO":
        return date.toISOString().split("T")[0];
      case "EU":
        return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;
      case "US":
        return `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getDate().toString().padStart(2, "0")}/${date.getFullYear()}`;
      default:
        return dateStr;
    }
  } catch {
    return dateStr;
  }
}

function formatCellValue(
  value: string | number | null | undefined,
  format?: "text" | "number" | "percentage" | "date" | "currency"
): string {
  if (value === null || value === undefined) return "-";
  
  switch (format) {
    case "number":
      return typeof value === "number" ? value.toLocaleString() : String(value);
    case "percentage":
      return typeof value === "number" ? `${value.toFixed(1)}%` : String(value);
    case "currency":
      return typeof value === "number" ? `$${value.toLocaleString()}` : String(value);
    case "date":
      return String(value);
    default:
      return String(value);
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ============================================================================
// QUICK RENDER FUNCTION FOR SIMPLE PSUR
// ============================================================================

export function renderQuickPsur(
  psurReference: string,
  deviceName: string,
  reportingPeriod: { start: string; end: string },
  sections: { title: string; content: string; tables?: PSURTable[] }[]
): string {
  const lines: string[] = [];
  
  lines.push(`# Periodic Safety Update Report`);
  lines.push("");
  lines.push(`**Reference:** ${psurReference}`);
  lines.push(`**Device:** ${deviceName}`);
  lines.push(`**Period:** ${reportingPeriod.start} to ${reportingPeriod.end}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  
  let sectionNum = 1;
  for (const section of sections) {
    lines.push(`## ${sectionNum}. ${section.title}`);
    lines.push("");
    lines.push(section.content);
    lines.push("");
    
    if (section.tables) {
      for (const table of section.tables) {
        lines.push(...renderTable(table, DEFAULT_OPTIONS));
        lines.push("");
      }
    }
    
    sectionNum++;
  }
  
  lines.push("---");
  lines.push("");
  lines.push("*Document generated by RegulatoryOS PSUR Engine*");
  
  return lines.join("\n");
}
