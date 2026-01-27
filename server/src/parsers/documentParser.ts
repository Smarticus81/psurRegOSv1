/**
 * SOTA Document Parser Infrastructure
 * Handles parsing of Excel, DOCX, PDF, and JSON files
 * Uses pdfjs-dist for SOTA PDF parsing - pure JavaScript, no native deps
 */

import * as xlsx from "xlsx";
import mammoth from "mammoth";
import { createHash } from "crypto";

// SOTA PDF parsing with pdfjs-dist (Mozilla's pdf.js)
let pdfjsLib: any = null;
let pdfParserReady = false;

async function initPDFParser() {
  if (pdfParserReady) return true;
  
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjsLib = pdfjs;
    
    // Disable worker for Node.js environment (runs synchronously)
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";
    
    pdfParserReady = true;
    console.log("[documentParser] SOTA PDF parser (pdfjs-dist) initialized");
    return true;
  } catch (err: any) {
    console.error("[documentParser] Failed to load pdfjs-dist:", err?.message);
    return false;
  }
}

// Initialize PDF parser on module load
initPDFParser();

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
// EXCEL VALUE NORMALIZATION (SOTA)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Normalize Excel cell values for consistent data handling.
 * Handles: Date objects, Excel serial dates, numbers, strings with trimming.
 */
function normalizeExcelValue(value: unknown): unknown {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  
  // Handle Date objects (from cellDates: true)
  if (value instanceof Date) {
    if (!isNaN(value.getTime())) {
      // Check if this is a time-only value (year 1899/1900)
      if (value.getFullYear() <= 1900) {
        // Likely a time, return as HH:MM:SS
        return value.toISOString().split("T")[1]?.split(".")[0] || String(value);
      }
      // Normal date - return ISO format
      return value.toISOString().split("T")[0];
    }
    return String(value);
  }
  
  // Handle numbers that might be Excel serial dates
  if (typeof value === "number") {
    // Excel serial date range: ~1 (Jan 1, 1900) to ~60000+ (year 2064)
    // But we need to distinguish from regular numbers
    // Serial dates for reasonable years (1990-2100) are roughly 32874 to 73415
    if (Number.isInteger(value) && value >= 25569 && value <= 73415) {
      // Likely an Excel serial date - convert it
      // 25569 = Jan 1, 1970 in Excel (Unix epoch)
      const date = excelSerialToDate(value);
      if (date) {
        return date.toISOString().split("T")[0];
      }
    }
    return value;
  }
  
  // Handle strings
  if (typeof value === "string") {
    const trimmed = value.trim();
    
    // Check if it's a numeric string that looks like an Excel serial date
    const num = parseFloat(trimmed);
    if (!isNaN(num) && /^\d+$/.test(trimmed) && num >= 25569 && num <= 73415) {
      const date = excelSerialToDate(num);
      if (date) {
        return date.toISOString().split("T")[0];
      }
    }
    
    return trimmed;
  }
  
  return value;
}

/**
 * Convert Excel serial date number to JavaScript Date.
 * Handles the Excel 1900 date system with its leap year bug.
 */
function excelSerialToDate(serial: number): Date | null {
  if (serial < 1 || serial > 100000) return null;
  
  // Excel's epoch is December 30, 1899 (not Jan 1, 1900)
  // This accounts for Excel's off-by-one and leap year bug
  const excelEpoch = Date.UTC(1899, 11, 30);
  const msPerDay = 24 * 60 * 60 * 1000;
  
  // For dates after Feb 28, 1900 (serial 60), Excel has a leap year bug
  // We need to subtract 1 day for serials > 60
  const adjustedSerial = serial > 60 ? serial - 1 : serial;
  
  const date = new Date(excelEpoch + adjustedSerial * msPerDay);
  
  // Validate the result is reasonable
  const year = date.getUTCFullYear();
  if (year >= 1990 && year <= 2100) {
    return date;
  }
  
  return null;
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
    // SOTA Excel parsing with comprehensive date handling
    // - cellDates: true converts serial dates to JS Date objects
    // - dateNF: standard ISO format for consistent output
    const workbook = xlsx.read(buffer, { 
      type: "buffer", 
      cellDates: true,
      dateNF: "yyyy-mm-dd",
    });
    
    result.metadata.sheetNames = workbook.SheetNames;
    result.metadata.sheetCount = workbook.SheetNames.length;

    const textParts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      
      // Parse with raw: false to get formatted values, defval for empty cells
      const jsonData = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { 
        defval: "",
        raw: false, // Get formatted strings instead of raw values
        dateNF: "yyyy-mm-dd", // ISO date format
      });
      
      if (jsonData.length === 0) continue;

      // Post-process: normalize dates and clean values
      const processedRows = jsonData.map(row => {
        const processed: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          processed[key] = normalizeExcelValue(value);
        }
        return processed;
      });

      // Extract headers from first row keys
      const headers = Object.keys(processedRows[0] || {});
      
      // Create table
      const table: ParsedTable = {
        name: sheetName,
        headers,
        rows: processedRows,
      };
      result.tables.push(table);

      // Add to raw text
      textParts.push(`=== Sheet: ${sheetName} ===`);
      textParts.push(headers.join("\t"));
      for (const row of processedRows) {
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
// SOTA PDF PARSER (using pdfjs-dist - Mozilla's pdf.js)
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
    // Ensure PDF parser is initialized
    const parserReady = await initPDFParser();
    if (!parserReady || !pdfjsLib) {
      result.errors.push("SOTA PDF parsing not available - pdfjs-dist not loaded");
      return result;
    }

    // Convert Buffer to Uint8Array for pdfjs
    const uint8Array = new Uint8Array(buffer);
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0, // Suppress console output
    });
    
    const pdfDoc = await loadingTask.promise;
    
    // Extract metadata
    result.metadata.numPages = pdfDoc.numPages;
    
    try {
      const metadata = await pdfDoc.getMetadata();
      result.metadata.info = metadata?.info || {};
      result.metadata.pdfVersion = metadata?.metadata?.get("pdf:PDFVersion") || "unknown";
    } catch {
      // Metadata extraction is optional
    }

    // Extract text from all pages
    const textParts: string[] = [];
    const pageStructures: { pageNum: number; text: string; items: any[] }[] = [];

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Build text with position awareness for table detection
      const items = textContent.items as any[];
      const pageText: string[] = [];
      let lastY: number | null = null;
      let currentLine: string[] = [];
      
      for (const item of items) {
        if (item.str === undefined) continue;
        
        const y = item.transform?.[5] || 0;
        
        // New line detection based on Y position change
        if (lastY !== null && Math.abs(y - lastY) > 5) {
          if (currentLine.length > 0) {
            pageText.push(currentLine.join(" "));
            currentLine = [];
          }
        }
        
        currentLine.push(item.str);
        lastY = y;
      }
      
      if (currentLine.length > 0) {
        pageText.push(currentLine.join(" "));
      }
      
      const fullPageText = pageText.join("\n");
      textParts.push(`=== Page ${pageNum} ===\n${fullPageText}`);
      
      pageStructures.push({
        pageNum,
        text: fullPageText,
        items,
      });
    }

    result.rawText = textParts.join("\n\n");
    result.metadata.textExtracted = true;
    result.metadata.totalCharacters = result.rawText.length;

    // Parse sections from the text
    const lines = result.rawText.split("\n").filter(l => l.trim() && !l.startsWith("=== Page"));
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

    // SOTA table extraction from PDF structure
    result.tables = extractTablesFromPDFStructure(pageStructures);
    
    // Also try text-based table extraction as fallback
    const textTables = extractTablesFromText(result.rawText);
    for (const table of textTables) {
      if (!result.tables.some(t => t.name === table.name)) {
        result.tables.push(table);
      }
    }

    console.log(`[documentParser] SOTA PDF parsed: ${pdfDoc.numPages} pages, ${result.sections.length} sections, ${result.tables.length} tables`);

  } catch (error: any) {
    console.error(`[documentParser] PDF parse error:`, error);
    result.errors.push(`PDF parse error: ${error?.message || String(error)}`);
  }

  return result;
}

/**
 * SOTA table extraction from PDF structure
 * Uses text item positions to detect tabular data
 */
function extractTablesFromPDFStructure(pageStructures: { pageNum: number; text: string; items: any[] }[]): ParsedTable[] {
  const tables: ParsedTable[] = [];
  let tableIndex = 0;

  for (const page of pageStructures) {
    const { items, pageNum } = page;
    if (items.length < 4) continue;

    // Group items by Y position (rows)
    const rowMap = new Map<number, { x: number; text: string }[]>();
    
    for (const item of items) {
      if (!item.str || item.str.trim() === "") continue;
      
      const y = Math.round((item.transform?.[5] || 0) / 5) * 5; // Round to nearest 5 for row grouping
      const x = item.transform?.[4] || 0;
      
      if (!rowMap.has(y)) {
        rowMap.set(y, []);
      }
      rowMap.get(y)!.push({ x, text: item.str.trim() });
    }

    // Sort rows by Y position (descending for PDF coordinate system)
    const sortedRows = Array.from(rowMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([_, cells]) => cells.sort((a, b) => a.x - b.x).map(c => c.text));

    // Detect potential tables (consecutive rows with similar column counts)
    let tableRows: string[][] = [];
    let lastColCount = 0;

    for (const row of sortedRows) {
      const colCount = row.length;
      
      if (colCount >= 2 && (lastColCount === 0 || Math.abs(colCount - lastColCount) <= 1)) {
        tableRows.push(row);
        lastColCount = colCount;
      } else if (tableRows.length >= 3) {
        // Save detected table
        const table = createTableFromRows(tableRows, tableIndex++);
        if (table) {
          table.name = `Table_Page${pageNum}_${tables.length + 1}`;
          tables.push(table);
        }
        tableRows = [];
        lastColCount = 0;
      } else {
        tableRows = [];
        lastColCount = 0;
      }
    }

    // Handle remaining rows
    if (tableRows.length >= 3) {
      const table = createTableFromRows(tableRows, tableIndex++);
      if (table) {
        table.name = `Table_Page${pageNum}_${tables.length + 1}`;
        tables.push(table);
      }
    }
  }

  return tables;
}

function createTableFromRows(rows: string[][], index: number): ParsedTable | null {
  if (rows.length < 2) return null;
  
  // First row as headers
  const maxCols = Math.max(...rows.map(r => r.length));
  const headers = rows[0].map((h, i) => h || `Column_${i + 1}`);
  
  // Pad headers if needed
  while (headers.length < maxCols) {
    headers.push(`Column_${headers.length + 1}`);
  }
  
  // Data rows
  const dataRows: Record<string, unknown>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const record: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = row[j] || "";
    }
    dataRows.push(record);
  }
  
  if (dataRows.length === 0) return null;
  
  return {
    name: `Table_${index + 1}`,
    headers,
    rows: dataRows,
  };
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
