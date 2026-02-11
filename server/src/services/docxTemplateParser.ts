/**
 * DOCX TEMPLATE PARSER
 * 
 * Parses DOCX files to extract slot definitions for template management.
 * Supports:
 * - Form-based templates (checkboxes, tables, field markers)
 * - Structured templates with section headers
 * - Content control parsing
 * - Table structure extraction
 */

import mammoth from "mammoth";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import type { SlotDefinitionInput, SlotCategory } from "./templateManagementService";

export interface DocxParseResult {
  success: boolean;
  filename: string;
  contentHash: string;
  sections: ParsedSection[];
  slots: SlotDefinitionInput[];
  tables: ParsedTable[];
  formFields: ParsedFormField[];
  metadata: DocxMetadata;
  errors: string[];
  warnings: string[];
}

export interface ParsedSection {
  id: string;
  title: string;
  level: number;
  content: string;
  startIndex: number;
  endIndex: number;
  type: "heading" | "paragraph" | "list";
}

export interface ParsedTable {
  id: string;
  title?: string;
  headers: string[];
  rows: string[][];
  columnCount: number;
  rowCount: number;
  sectionRef?: string;
}

export interface ParsedFormField {
  id: string;
  type: "checkbox" | "text" | "dropdown" | "date";
  label: string;
  value?: string;
  checked?: boolean;
  options?: string[];
  sectionRef?: string;
}

export interface DocxMetadata {
  title?: string;
  author?: string;
  subject?: string;
  created?: string;
  modified?: string;
  pageCount?: number;
  wordCount?: number;
}

// Patterns for identifying PSUR-related content
const PSUR_SECTION_PATTERNS = {
  deviceScope: /^(A\.?|Section\s*A|Device\s*(Identification|Scope|Description))/i,
  previousPsur: /^(B\.?|Section\s*B|Previous\s*PSUR|Reference)/i,
  salesDistribution: /^(C\.?|Section\s*C|Sales|Distribution|Volume|Exposure)/i,
  seriousIncidents: /^(D\.?|Section\s*D|Serious\s*Incident|Vigilance)/i,
  nonSeriousIncidents: /^(E\.?|Section\s*E|Non-?Serious|Expected)/i,
  complaints: /^(F\.?|Section\s*F|Complaint|Feedback)/i,
  trendAnalysis: /^(G\.?|Section\s*G|Trend|Signal|Analysis)/i,
  fsca: /^(H\.?|Section\s*H|FSCA|Field\s*Safety|Corrective)/i,
  capa: /^(I\.?|Section\s*I|CAPA|Corrective.*Preventive)/i,
  literature: /^(J\.?|Section\s*J|Literature|Publication|Review)/i,
  registry: /^(K\.?|Section\s*K|Registry|Database|External)/i,
  pmcf: /^(L\.?|Section\s*L|PMCF|Clinical\s*Follow)/i,
  conclusions: /^(M\.?|Section\s*M|Conclusion|Benefit.*Risk|Summary)/i,
};

const EVIDENCE_TYPE_KEYWORDS: Record<string, string[]> = {
  sales_volume: ["sales", "distribution", "units sold", "shipped", "volume"],
  complaint_record: ["complaint", "customer feedback", "product feedback"],
  serious_incident_record: ["serious incident", "vigilance", "MDR reportable", "adverse event"],
  fsca_record: ["fsca", "field safety", "corrective action", "recall"],
  capa: ["capa", "corrective", "preventive", "action"],
  literature_result: ["literature", "publication", "study", "research"],
  pmcf_result: ["pmcf", "clinical follow", "clinical data"],
};

export class DocxTemplateParser {
  private buffer: Buffer | null = null;
  private rawHtml: string = "";
  private rawText: string = "";

  /**
   * Parse a DOCX file from a buffer
   */
  async parseFromBuffer(buffer: Buffer, filename: string): Promise<DocxParseResult> {
    this.buffer = buffer;
    
    const errors: string[] = [];
    const warnings: string[] = [];

    const contentHash = createHash("sha256").update(buffer).digest("hex");

    try {
      // Extract HTML representation
      const htmlResult = await mammoth.convertToHtml({ buffer });
      this.rawHtml = htmlResult.value;
      
      if (htmlResult.messages.length > 0) {
        warnings.push(...htmlResult.messages.map(m => m.message));
      }

      // Extract raw text
      const textResult = await mammoth.extractRawText({ buffer });
      this.rawText = textResult.value;

      // Parse sections
      const sections = this.parseSections();

      // Parse tables
      const tables = this.parseTables();

      // Parse form fields
      const formFields = this.parseFormFields();

      // Generate slot definitions
      const slots = this.generateSlotDefinitions(sections, tables, formFields);

      // Extract metadata
      const metadata = this.extractMetadata();

      return {
        success: true,
        filename,
        contentHash,
        sections,
        slots,
        tables,
        formFields,
        metadata,
        errors,
        warnings,
      };
    } catch (error: any) {
      errors.push(`Failed to parse DOCX: ${error.message}`);
      return {
        success: false,
        filename,
        contentHash,
        sections: [],
        slots: [],
        tables: [],
        formFields: [],
        metadata: {},
        errors,
        warnings,
      };
    }
  }

  /**
   * Parse a DOCX file from disk
   */
  async parseFromFile(filePath: string): Promise<DocxParseResult> {
    const buffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    return this.parseFromBuffer(buffer, filename);
  }

  /**
   * Extract document sections from HTML
   */
  private parseSections(): ParsedSection[] {
    const sections: ParsedSection[] = [];
    
    // Simple heading extraction from HTML
    const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
    let match;
    let sectionIndex = 0;

    while ((match = headingRegex.exec(this.rawHtml)) !== null) {
      const level = parseInt(match[1]);
      const title = this.stripHtml(match[2]).trim();
      
      if (title) {
        sections.push({
          id: `section_${sectionIndex++}`,
          title,
          level,
          content: "",
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          type: "heading",
        });
      }
    }

    // Also look for bold/strong text that might be section headers
    const boldRegex = /<(strong|b)[^>]*>(.*?)<\/\1>/gi;
    while ((match = boldRegex.exec(this.rawHtml)) !== null) {
      const text = this.stripHtml(match[2]).trim();
      
      // Check if this looks like a section header
      if (text && this.looksLikeSectionHeader(text) && !sections.some(s => s.title === text)) {
        sections.push({
          id: `section_${sectionIndex++}`,
          title: text,
          level: 2,
          content: "",
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          type: "heading",
        });
      }
    }

    // Sort by start index
    sections.sort((a, b) => a.startIndex - b.startIndex);

    // Fill in content between sections
    for (let i = 0; i < sections.length; i++) {
      const startIdx = sections[i].endIndex;
      const endIdx = i < sections.length - 1 ? sections[i + 1].startIndex : this.rawHtml.length;
      const contentHtml = this.rawHtml.substring(startIdx, endIdx);
      sections[i].content = this.stripHtml(contentHtml).trim();
    }

    return sections;
  }

  /**
   * Parse tables from HTML
   */
  private parseTables(): ParsedTable[] {
    const tables: ParsedTable[] = [];
    
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let match;
    let tableIndex = 0;

    while ((match = tableRegex.exec(this.rawHtml)) !== null) {
      const tableHtml = match[1];
      
      // Extract rows
      const rows: string[][] = [];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch;

      while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        const rowHtml = rowMatch[1];
        const cells: string[] = [];
        
        // Extract cells (th or td)
        const cellRegex = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi;
        let cellMatch;

        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
          cells.push(this.stripHtml(cellMatch[2]).trim());
        }

        if (cells.length > 0) {
          rows.push(cells);
        }
      }

      if (rows.length > 0) {
        const headers = rows.length > 0 ? rows[0] : [];
        const dataRows = rows.length > 1 ? rows.slice(1) : [];

        tables.push({
          id: `table_${tableIndex++}`,
          headers,
          rows: dataRows,
          columnCount: headers.length,
          rowCount: dataRows.length,
        });
      }
    }

    return tables;
  }

  /**
   * Parse form fields (checkboxes, text fields)
   */
  private parseFormFields(): ParsedFormField[] {
    const fields: ParsedFormField[] = [];
    let fieldIndex = 0;

    // Look for checkbox patterns in text
    // Common patterns: ☐, ☑, ☒, [], [X], ( ), (X)
    const checkboxPatterns = [
      { pattern: /☒\s*([^\n☐☑☒\[\]]+)/g, checked: true },
      { pattern: /☑\s*([^\n☐☑☒\[\]]+)/g, checked: true },
      { pattern: /☐\s*([^\n☐☑☒\[\]]+)/g, checked: false },
      { pattern: /\[X\]\s*([^\n\[\]]+)/gi, checked: true },
      { pattern: /\[\s*\]\s*([^\n\[\]]+)/g, checked: false },
      { pattern: /\(X\)\s*([^\n\(\)]+)/gi, checked: true },
      { pattern: /\(\s*\)\s*([^\n\(\)]+)/g, checked: false },
    ];

    for (const { pattern, checked } of checkboxPatterns) {
      let match;
      while ((match = pattern.exec(this.rawText)) !== null) {
        const label = match[1].trim();
        if (label && label.length < 200) {
          fields.push({
            id: `checkbox_${fieldIndex++}`,
            type: "checkbox",
            label,
            checked,
          });
        }
      }
    }

    // Look for text field patterns (e.g., "Field Name: ___________")
    const textFieldPattern = /([A-Za-z][A-Za-z\s]+):\s*_{3,}|([A-Za-z][A-Za-z\s]+):\s*\[[\s_]*\]/g;
    let match;

    while ((match = textFieldPattern.exec(this.rawText)) !== null) {
      const label = (match[1] || match[2]).trim();
      if (label) {
        fields.push({
          id: `textfield_${fieldIndex++}`,
          type: "text",
          label,
        });
      }
    }

    // Look for date fields
    const datePattern = /([A-Za-z\s]+Date):\s*[\s_\/\-]+|Period\s*(Start|End|From|To):\s*[\s_\/\-]+/gi;
    while ((match = datePattern.exec(this.rawText)) !== null) {
      const label = match[0].split(":")[0].trim();
      if (label) {
        fields.push({
          id: `datefield_${fieldIndex++}`,
          type: "date",
          label,
        });
      }
    }

    return fields;
  }

  /**
   * Generate slot definitions from parsed content
   */
  private generateSlotDefinitions(
    sections: ParsedSection[],
    tables: ParsedTable[],
    formFields: ParsedFormField[]
  ): SlotDefinitionInput[] {
    const slots: SlotDefinitionInput[] = [];
    let slotIndex = 0;

    // Create slots from sections
    for (const section of sections) {
      const sectionType = this.identifySectionType(section.title);
      const evidenceTypes = this.inferEvidenceTypes(section.title, section.content);

      slots.push({
        slot_id: `slot_${slotIndex++}_${this.sanitizeId(section.title)}`,
        slot_name: section.title,
        data_type: "narrative",
        required: this.isRequiredSection(section.title),
        description: section.content.substring(0, 200),
        evidence_requirements: evidenceTypes,
        regulatory_reference: sectionType ? `MDCG 2022-21 Section ${sectionType}` : undefined,
      });
    }

    // Create slots from tables
    for (const table of tables) {
      const children: SlotDefinitionInput[] = table.headers.map((header, i) => ({
        slot_id: `col_${slotIndex}_${i}`,
        slot_name: header,
        data_type: this.inferColumnType(header),
        required: true,
      }));

      slots.push({
        slot_id: `table_slot_${slotIndex++}`,
        slot_name: table.title || `Table ${slotIndex}`,
        data_type: "table",
        required: true,
        children,
      });
    }

    // Create slots from form fields
    for (const field of formFields) {
      slots.push({
        slot_id: `field_${slotIndex++}_${this.sanitizeId(field.label)}`,
        slot_name: field.label,
        data_type: field.type,
        required: false,
        description: `Form field: ${field.type}`,
      });
    }

    return slots;
  }

  /**
   * Extract document metadata
   */
  private extractMetadata(): DocxMetadata {
    // Word count from raw text
    const wordCount = this.rawText.split(/\s+/).filter(w => w.length > 0).length;

    return {
      wordCount,
      // Note: Full metadata extraction would require XML parsing of docx internals
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }

  private looksLikeSectionHeader(text: string): boolean {
    // Check against PSUR section patterns
    for (const pattern of Object.values(PSUR_SECTION_PATTERNS)) {
      if (pattern.test(text)) return true;
    }

    // Check for numbered sections
    if (/^\d+\.?\s/.test(text)) return true;
    if (/^[A-M]\.?\s/i.test(text)) return true;

    // Check for common header keywords
    const headerKeywords = [
      "summary", "introduction", "conclusion", "analysis", "review",
      "assessment", "description", "overview", "appendix", "annex",
    ];
    const lowerText = text.toLowerCase();
    return headerKeywords.some(k => lowerText.includes(k));
  }

  private identifySectionType(title: string): string | null {
    for (const [type, pattern] of Object.entries(PSUR_SECTION_PATTERNS)) {
      if (pattern.test(title)) {
        // Map type to section letter
        const sectionMap: Record<string, string> = {
          deviceScope: "A",
          previousPsur: "B",
          salesDistribution: "C",
          seriousIncidents: "D",
          nonSeriousIncidents: "E",
          complaints: "F",
          trendAnalysis: "G",
          fsca: "H",
          capa: "I",
          literature: "J",
          registry: "K",
          pmcf: "L",
          conclusions: "M",
        };
        return sectionMap[type] || null;
      }
    }
    return null;
  }

  private inferEvidenceTypes(title: string, content: string): string[] {
    const types: string[] = [];
    const combinedText = `${title} ${content}`.toLowerCase();

    for (const [evidenceType, keywords] of Object.entries(EVIDENCE_TYPE_KEYWORDS)) {
      if (keywords.some(k => combinedText.includes(k))) {
        types.push(evidenceType);
      }
    }

    return types;
  }

  private isRequiredSection(title: string): boolean {
    // Sections A, C, D, and M are typically required per MDCG 2022-21
    const requiredPatterns = [
      PSUR_SECTION_PATTERNS.deviceScope,
      PSUR_SECTION_PATTERNS.salesDistribution,
      PSUR_SECTION_PATTERNS.seriousIncidents,
      PSUR_SECTION_PATTERNS.conclusions,
    ];
    return requiredPatterns.some(p => p.test(title));
  }

  private inferColumnType(header: string): string {
    const lowerHeader = header.toLowerCase();
    
    if (lowerHeader.includes("date") || lowerHeader.includes("period")) {
      return "date";
    }
    if (lowerHeader.includes("count") || lowerHeader.includes("number") || lowerHeader.includes("quantity")) {
      return "integer";
    }
    if (lowerHeader.includes("rate") || lowerHeader.includes("percentage") || lowerHeader.includes("%")) {
      return "decimal";
    }
    if (lowerHeader.includes("yes") || lowerHeader.includes("no") || lowerHeader.includes("status")) {
      return "boolean";
    }
    
    return "string";
  }

  private sanitizeId(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .substring(0, 50);
  }
}

// Export singleton
export const docxTemplateParser = new DocxTemplateParser();
