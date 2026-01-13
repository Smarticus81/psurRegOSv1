/**
 * Document Parser Infrastructure
 * Handles parsing of Excel, DOCX, PDF, and JSON files
 */

import * as xlsx from "xlsx";
import mammoth from "mammoth";
import { createHash } from "crypto";

// Dynamic import for pdf-parse (CommonJS module)
let pdfParse: (dataBuffer: Buffer) => Promise<{ text: string; numpages: number; info: any; version: string }>;
import("pdf-parse").then(module => {
  pdfParse = module.default;
}).catch(() => {
  console.warn("[documentParser] pdf-parse not available, PDF parsing disabled");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type DocumentType = "excel" | "docx" | "pdf" | "json" | "csv" | "unknown";

export interface ParsedTable {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export interface ParsedSection {
  title: string;
  content: string;
  level: number;
  tables: ParsedTable[];
  lists: string[][];
}

export interface ParsedDocument {
  filename: string;
  documentType: DocumentType;
  contentHash: string;
  rawText: string;
  sections: ParsedSection[];
  tables: ParsedTable[];
  metadata: Record<string, unknown>;
  parseDate: string;
  errors: string[];
}

export interface DocumentParseOptions {
  extractTables?: boolean;
  extractSections?: boolean;
  maxTextLength?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PARSER
// ═══════════════════════════════════════════════════════════════════════════════

export async function parseDocument(
  buffer: Buffer,
  filename: string,
  options: DocumentParseOptions = {}
): Promise<ParsedDocument> {
  const docType = detectDocumentType(filename, buffer);
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  
  const result: ParsedDocument = {
    filename,
    documentType: docType,
    contentHash,
    rawText: "",
    sections: [],
    tables: [],
    metadata: {},
    parseDate: new Date().toISOString(),
    errors: [],
  };

  try {
    switch (docType) {
      case "excel":
      case "csv":
        return parseExcelDocument(buffer, filename, contentHash, options);
      case "docx":
        return await parseDocxDocument(buffer, filename, contentHash, options);
      case "pdf":
        return await parsePdfDocument(buffer, filename, contentHash, options);
      case "json":
        return parseJsonDocument(buffer, filename, contentHash, options);
      default:
        result.errors.push(`Unsupported document type: ${docType}`);
        return result;
    }
  } catch (error: any) {
    result.errors.push(`Parse error: ${error?.message || String(error)}`);
    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT TYPE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

export function detectDocumentType(filename: string, buffer?: Buffer): DocumentType {
  const ext = filename.toLowerCase().split(".").pop();
  
  switch (ext) {
    case "xlsx":
    case "xls":
      return "excel";
    case "csv":
      return "csv";
    case "docx":
    case "doc":
      return "docx";
    case "pdf":
      return "pdf";
    case "json":
      return "json";
    default:
      // Try to detect from buffer magic bytes
      if (buffer) {
        // ZIP header (DOCX/XLSX are ZIP files)
        if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
          // Check for DOCX vs XLSX by content
          const content = buffer.toString("utf8", 0, 1000);
          if (content.includes("word/")) return "docx";
          if (content.includes("xl/")) return "excel";
        }
        // PDF header
        if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
          return "pdf";
        }
        // JSON detection
        const text = buffer.toString("utf8", 0, 100).trim();
        if (text.startsWith("{") || text.startsWith("[")) {
          return "json";
        }
      }
      return "unknown";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXCEL PARSER
// ═══════════════════════════════════════════════════════════════════════════════

function parseExcelDocument(
  buffer: Buffer,
  filename: string,
  contentHash: string,
  options: DocumentParseOptions
): ParsedDocument {
  const result: ParsedDocument = {
    filename,
    documentType: "excel",
    contentHash,
    rawText: "",
    sections: [],
    tables: [],
    metadata: {},
    parseDate: new Date().toISOString(),
    errors: [],
  };

  try {
    const workbook = xlsx.read(buffer, { type: "buffer" });
    result.metadata.sheetNames = workbook.SheetNames;
    result.metadata.sheetCount = workbook.SheetNames.length;

    const textParts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      
      if (jsonData.length === 0) continue;

      // Extract headers from first row keys
      const headers = Object.keys(jsonData[0] || {});
      
      // Create table
      const table: ParsedTable = {
        name: sheetName,
        headers,
        rows: jsonData,
      };
      result.tables.push(table);

      // Add to raw text
      textParts.push(`=== Sheet: ${sheetName} ===`);
      textParts.push(headers.join("\t"));
      for (const row of jsonData) {
        textParts.push(headers.map(h => String(row[h] ?? "")).join("\t"));
      }
      textParts.push("");
    }

    result.rawText = textParts.join("\n");
    
    // Create a section for each sheet
    for (const table of result.tables) {
      result.sections.push({
        title: table.name,
        content: `Table with ${table.rows.length} rows and ${table.headers.length} columns`,
        level: 1,
        tables: [table],
        lists: [],
      });
    }

  } catch (error: any) {
    result.errors.push(`Excel parse error: ${error?.message || String(error)}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCX PARSER
// ═══════════════════════════════════════════════════════════════════════════════

async function parseDocxDocument(
  buffer: Buffer,
  filename: string,
  contentHash: string,
  options: DocumentParseOptions
): Promise<ParsedDocument> {
  const result: ParsedDocument = {
    filename,
    documentType: "docx",
    contentHash,
    rawText: "",
    sections: [],
    tables: [],
    metadata: {},
    parseDate: new Date().toISOString(),
    errors: [],
  };

  try {
    // Extract text and HTML
    const textResult = await mammoth.extractRawText({ buffer });
    const htmlResult = await mammoth.convertToHtml({ buffer });
    
    result.rawText = textResult.value;
    result.metadata.warnings = textResult.messages;

    // Parse sections from the text
    const lines = result.rawText.split("\n").filter(l => l.trim());
    let currentSection: ParsedSection | null = null;
    const contentLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Detect section headers (lines that look like titles)
      const isHeader = detectSectionHeader(trimmed);
      
      if (isHeader) {
        // Save previous section
        if (currentSection) {
          currentSection.content = contentLines.join("\n");
          result.sections.push(currentSection);
        }
        
        currentSection = {
          title: trimmed,
          content: "",
          level: isHeader.level,
          tables: [],
          lists: [],
        };
        contentLines.length = 0;
      } else if (currentSection) {
        contentLines.push(trimmed);
      } else {
        // Content before first section
        contentLines.push(trimmed);
      }
    }

    // Save last section
    if (currentSection) {
      currentSection.content = contentLines.join("\n");
      result.sections.push(currentSection);
    } else if (contentLines.length > 0) {
      // No sections detected, create a default section
      result.sections.push({
        title: "Document Content",
        content: contentLines.join("\n"),
        level: 1,
        tables: [],
        lists: [],
      });
    }

    // Extract tables from HTML
    result.tables = extractTablesFromHtml(htmlResult.value);

    // Assign tables to sections based on position
    // (simplified - assigns all tables to first section for now)
    if (result.sections.length > 0 && result.tables.length > 0) {
      result.sections[0].tables = result.tables;
    }

  } catch (error: any) {
    result.errors.push(`DOCX parse error: ${error?.message || String(error)}`);
  }

  return result;
}

function detectSectionHeader(line: string): { level: number } | null {
  // Numbered sections like "1. Introduction" or "1.1 Scope"
  if (/^\d+(\.\d+)*\.?\s+[A-Z]/.test(line)) {
    const dots = (line.match(/\./g) || []).length;
    return { level: Math.min(dots + 1, 4) };
  }
  
  // All caps lines (likely headers)
  if (line === line.toUpperCase() && line.length > 3 && line.length < 100 && /^[A-Z]/.test(line)) {
    return { level: 1 };
  }
  
  // Lines starting with common section words
  const sectionWords = ["INTRODUCTION", "SUMMARY", "CONCLUSION", "APPENDIX", "SECTION", "CHAPTER"];
  const upper = line.toUpperCase();
  for (const word of sectionWords) {
    if (upper.startsWith(word)) {
      return { level: 1 };
    }
  }
  
  return null;
}

function extractTablesFromHtml(html: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  
  // Simple regex-based table extraction
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let match;
  let tableIndex = 0;
  
  while ((match = tableRegex.exec(html)) !== null) {
    const tableHtml = match[1];
    const rows: Record<string, unknown>[] = [];
    let headers: string[] = [];
    
    // Extract header row
    const headerMatch = /<tr[^>]*>([\s\S]*?)<\/tr>/i.exec(tableHtml);
    if (headerMatch) {
      const thRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      let thMatch;
      while ((thMatch = thRegex.exec(headerMatch[1])) !== null) {
        headers.push(stripHtml(thMatch[1]).trim());
      }
    }
    
    if (headers.length === 0) {
      headers = [`Column_${tableIndex}_1`, `Column_${tableIndex}_2`, `Column_${tableIndex}_3`];
    }
    
    // Extract data rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let isFirst = true;
    
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      if (isFirst) {
        isFirst = false;
        continue; // Skip header row
      }
      
      const cells: string[] = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(stripHtml(cellMatch[1]).trim());
      }
      
      if (cells.length > 0) {
        const row: Record<string, unknown> = {};
        for (let i = 0; i < cells.length && i < headers.length; i++) {
          row[headers[i]] = cells[i];
        }
        rows.push(row);
      }
    }
    
    if (rows.length > 0 || headers.length > 0) {
      tables.push({
        name: `Table_${tableIndex + 1}`,
        headers,
        rows,
      });
    }
    
    tableIndex++;
  }
  
  return tables;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF PARSER
// ═══════════════════════════════════════════════════════════════════════════════

async function parsePdfDocument(
  buffer: Buffer,
  filename: string,
  contentHash: string,
  options: DocumentParseOptions
): Promise<ParsedDocument> {
  const result: ParsedDocument = {
    filename,
    documentType: "pdf",
    contentHash,
    rawText: "",
    sections: [],
    tables: [],
    metadata: {},
    parseDate: new Date().toISOString(),
    errors: [],
  };

  try {
    if (!pdfParse) {
      result.errors.push("PDF parsing not available");
      return result;
    }
    const data = await pdfParse(buffer);
    
    result.rawText = data.text;
    result.metadata.numPages = data.numpages;
    result.metadata.info = data.info;
    result.metadata.version = data.version;

    // Parse sections from the text
    const lines = result.rawText.split("\n").filter(l => l.trim());
    let currentSection: ParsedSection | null = null;
    const contentLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const isHeader = detectSectionHeader(trimmed);
      
      if (isHeader) {
        if (currentSection) {
          currentSection.content = contentLines.join("\n");
          result.sections.push(currentSection);
        }
        
        currentSection = {
          title: trimmed,
          content: "",
          level: isHeader.level,
          tables: [],
          lists: [],
        };
        contentLines.length = 0;
      } else if (currentSection) {
        contentLines.push(trimmed);
      } else {
        contentLines.push(trimmed);
      }
    }

    if (currentSection) {
      currentSection.content = contentLines.join("\n");
      result.sections.push(currentSection);
    } else if (contentLines.length > 0) {
      result.sections.push({
        title: "Document Content",
        content: contentLines.join("\n"),
        level: 1,
        tables: [],
        lists: [],
      });
    }

    // Attempt to extract tables from structured text
    result.tables = extractTablesFromText(result.rawText);

  } catch (error: any) {
    result.errors.push(`PDF parse error: ${error?.message || String(error)}`);
  }

  return result;
}

function extractTablesFromText(text: string): ParsedTable[] {
  // Simple heuristic: look for tab-separated or pipe-separated lines
  const tables: ParsedTable[] = [];
  const lines = text.split("\n");
  
  let tableLines: string[] = [];
  let inTable = false;
  let tableIndex = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    const hasSeparators = trimmed.includes("\t") || trimmed.includes("|");
    const cellCount = hasSeparators ? 
      (trimmed.includes("|") ? trimmed.split("|").length : trimmed.split("\t").length) : 0;
    
    if (cellCount >= 2) {
      inTable = true;
      tableLines.push(trimmed);
    } else if (inTable && tableLines.length > 0) {
      // End of table
      const table = parseTextTable(tableLines, tableIndex);
      if (table) {
        tables.push(table);
        tableIndex++;
      }
      tableLines = [];
      inTable = false;
    }
  }
  
  // Handle last table
  if (tableLines.length > 0) {
    const table = parseTextTable(tableLines, tableIndex);
    if (table) {
      tables.push(table);
    }
  }
  
  return tables;
}

function parseTextTable(lines: string[], index: number): ParsedTable | null {
  if (lines.length < 2) return null;
  
  const separator = lines[0].includes("|") ? "|" : "\t";
  const headers = lines[0].split(separator).map(h => h.trim()).filter(h => h);
  
  if (headers.length < 2) return null;
  
  const rows: Record<string, unknown>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(separator).map(c => c.trim());
    const row: Record<string, unknown> = {};
    
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] || "";
    }
    
    rows.push(row);
  }
  
  return {
    name: `Table_${index + 1}`,
    headers,
    rows,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// JSON PARSER
// ═══════════════════════════════════════════════════════════════════════════════

function parseJsonDocument(
  buffer: Buffer,
  filename: string,
  contentHash: string,
  options: DocumentParseOptions
): ParsedDocument {
  const result: ParsedDocument = {
    filename,
    documentType: "json",
    contentHash,
    rawText: buffer.toString("utf8"),
    sections: [],
    tables: [],
    metadata: {},
    parseDate: new Date().toISOString(),
    errors: [],
  };

  try {
    const data = JSON.parse(result.rawText);
    result.metadata.isArray = Array.isArray(data);
    result.metadata.topLevelKeys = Array.isArray(data) ? [] : Object.keys(data);

    // If array of objects, treat as table
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
      const headers = Object.keys(data[0] || {});
      result.tables.push({
        name: "Root",
        headers,
        rows: data,
      });
      
      result.sections.push({
        title: "JSON Data",
        content: `Array with ${data.length} records`,
        level: 1,
        tables: result.tables,
        lists: [],
      });
    } else if (typeof data === "object" && data !== null) {
      // Object - look for nested arrays that could be tables
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
          const headers = Object.keys(value[0] || {});
          result.tables.push({
            name: key,
            headers,
            rows: value as Record<string, unknown>[],
          });
        }
      }
      
      result.sections.push({
        title: "JSON Object",
        content: JSON.stringify(data, null, 2),
        level: 1,
        tables: result.tables,
        lists: [],
      });
    }

  } catch (error: any) {
    result.errors.push(`JSON parse error: ${error?.message || String(error)}`);
  }

  return result;
}
