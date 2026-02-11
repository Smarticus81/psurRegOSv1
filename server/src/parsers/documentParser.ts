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

// OCR fallback support
let ocrModule: any = null;
const OCR_THRESHOLD_CHARS_PER_PAGE = 100; // If avg chars/page < this, try OCR

async function initPDFParser() {
  if (pdfParserReady) return true;

  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjsLib = pdfjs;

    // Disable worker for Node.js environment (runs synchronously)
    pdfjsLib.GlobalWorkerOptions.workerSrc = "";

    pdfParserReady = true;
    console.log("[documentParser] SOTA PDF parser (pdfjs-dist) initialized");

    // Try to initialize OCR module
    try {
      ocrModule = await import("./sotaPdfOcr");
      console.log("[documentParser] OCR fallback module loaded");
    } catch {
      console.log("[documentParser] OCR fallback not available");
    }

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

export type DocumentType = "excel" | "docx" | "pdf" | "json" | "csv" | "txt" | "unknown";

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
      case "txt":
        return parseTxtDocument(buffer, filename, contentHash, options);
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
    case "txt":
      return "txt";
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

/**
 * SOTA Section Header Detection
 * Multi-heuristic approach for detecting document section headers
 */
function detectSectionHeader(line: string): { level: number; confidence: number } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 200) return null;

  // Track confidence for the detection
  let confidence = 0;
  let detectedLevel = 1;

  // HEURISTIC 1: Numbered sections like "1. Introduction" or "1.1 Scope" or "Section 1.2.3"
  const numberedMatch = trimmed.match(/^(?:section\s+)?(\d+(?:\.\d+)*)[.:\s]+(.+)/i);
  if (numberedMatch) {
    const numParts = numberedMatch[1].split(".").length;
    detectedLevel = Math.min(numParts, 4);
    confidence += 0.7;

    // Boost if rest is title-like (starts with capital, not too long)
    const rest = numberedMatch[2];
    if (/^[A-Z]/.test(rest) && rest.length < 80) {
      confidence += 0.2;
    }
  }

  // HEURISTIC 2: Roman numeral sections like "I. Executive Summary" or "III.2 Methods"
  const romanMatch = trimmed.match(/^([IVXivx]+)(?:\.\d+)?[.:\s]+(.+)/);
  if (romanMatch && /^[IVXivx]+$/.test(romanMatch[1])) {
    const roman = romanMatch[1].toUpperCase();
    const romanValue = romanToInt(roman);
    if (romanValue > 0 && romanValue <= 50) {
      detectedLevel = 1;
      confidence = Math.max(confidence, 0.6);
    }
  }

  // HEURISTIC 3: All caps lines (likely headers) - but be more careful
  if (trimmed === trimmed.toUpperCase() && /^[A-Z]/.test(trimmed)) {
    const wordCount = trimmed.split(/\s+/).length;
    // All caps headers typically 1-8 words, not sentences
    if (wordCount >= 1 && wordCount <= 8 && !trimmed.includes(",") && !trimmed.endsWith(".")) {
      confidence = Math.max(confidence, 0.5);
      detectedLevel = 1;
    }
  }

  // HEURISTIC 4: Known CER/regulatory document section patterns
  const cerPatterns: { pattern: RegExp; level: number; boost: number }[] = [
    // Executive/Overview sections
    { pattern: /^(?:\d+\.?\s*)?executive\s+summary/i, level: 1, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?management\s+summary/i, level: 1, boost: 0.8 },
    { pattern: /^(?:\d+\.?\s*)?overview/i, level: 1, boost: 0.6 },

    // Scope and Introduction
    { pattern: /^(?:\d+\.?\s*)?(?:scope|introduction|background)/i, level: 1, boost: 0.8 },
    { pattern: /^(?:\d+\.?\s*)?purpose\s+(?:of|and)/i, level: 1, boost: 0.7 },

    // Device sections
    { pattern: /^(?:\d+\.?\s*)?device\s+(?:description|identification|under\s+evaluation)/i, level: 1, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?product\s+description/i, level: 1, boost: 0.8 },
    { pattern: /^(?:\d+\.?\s*)?intended\s+(?:purpose|use)/i, level: 2, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?indications?\s+for\s+use/i, level: 2, boost: 0.8 },

    // Regulatory sections
    { pattern: /^(?:\d+\.?\s*)?regulatory\s+(?:status|history|background)/i, level: 1, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?ce\s+mark/i, level: 2, boost: 0.7 },
    { pattern: /^(?:\d+\.?\s*)?certification/i, level: 2, boost: 0.6 },

    // Clinical sections
    { pattern: /^(?:\d+\.?\s*)?clinical\s+(?:evaluation|background|data|evidence|performance|safety)/i, level: 1, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?state\s+of\s+(?:the\s+)?art/i, level: 2, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?equivalen(?:ce|t)/i, level: 2, boost: 0.8 },

    // Literature sections
    { pattern: /^(?:\d+\.?\s*)?literature\s+(?:search|review|analysis)/i, level: 1, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?search\s+(?:strategy|protocol|results)/i, level: 2, boost: 0.8 },
    { pattern: /^(?:\d+\.?\s*)?(?:inclusion|exclusion)\s+criteria/i, level: 3, boost: 0.7 },
    { pattern: /^(?:\d+\.?\s*)?appraisal/i, level: 2, boost: 0.7 },

    // PMCF/PMS sections
    { pattern: /^(?:\d+\.?\s*)?(?:pmcf|post.?market\s+clinical)/i, level: 1, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?(?:pms|post.?market\s+surveillance)/i, level: 1, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?vigilance/i, level: 2, boost: 0.8 },

    // Complaints and incidents
    { pattern: /^(?:\d+\.?\s*)?complaint(?:s|\s+(?:summary|analysis|data))/i, level: 2, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?(?:serious\s+)?incident(?:s|\s+(?:summary|analysis))/i, level: 2, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?adverse\s+event/i, level: 2, boost: 0.8 },

    // Sales and distribution
    { pattern: /^(?:\d+\.?\s*)?(?:sales|distribution|market)\s+(?:data|summary|analysis)/i, level: 2, boost: 0.8 },
    { pattern: /^(?:\d+\.?\s*)?(?:units?\s+)?(?:sold|distributed)/i, level: 2, boost: 0.7 },

    // Risk and benefit
    { pattern: /^(?:\d+\.?\s*)?benefit.?risk/i, level: 1, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?risk.?benefit/i, level: 1, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?risk\s+(?:analysis|assessment|management)/i, level: 2, boost: 0.8 },
    { pattern: /^(?:\d+\.?\s*)?(?:clinical\s+)?benefit(?:s|\s+analysis)?/i, level: 2, boost: 0.7 },
    { pattern: /^(?:\d+\.?\s*)?residual\s+risk/i, level: 3, boost: 0.7 },

    // Conclusions
    { pattern: /^(?:\d+\.?\s*)?conclusion(?:s)?/i, level: 1, boost: 0.9 },
    { pattern: /^(?:\d+\.?\s*)?(?:final\s+)?(?:summary|assessment|recommendation)/i, level: 1, boost: 0.8 },

    // References and appendices
    { pattern: /^(?:\d+\.?\s*)?(?:references?|bibliography)/i, level: 1, boost: 0.8 },
    { pattern: /^(?:\d+\.?\s*)?append(?:ix|ices)/i, level: 1, boost: 0.8 },
    { pattern: /^(?:\d+\.?\s*)?annex(?:es)?/i, level: 1, boost: 0.8 },
  ];

  for (const { pattern, level, boost } of cerPatterns) {
    if (pattern.test(trimmed)) {
      if (boost > confidence) {
        confidence = boost;
        detectedLevel = level;
      }
    }
  }

  // HEURISTIC 5: Title case with specific length (2-8 words, each starting capital)
  const words = trimmed.split(/\s+/);
  if (words.length >= 2 && words.length <= 8) {
    const allTitleCase = words.every(w => /^[A-Z]/.test(w) || /^(and|or|of|the|for|in|to|a|an)$/i.test(w));
    const noSentenceEnd = !trimmed.endsWith(".") && !trimmed.endsWith(",");
    if (allTitleCase && noSentenceEnd) {
      confidence = Math.max(confidence, 0.4);
    }
  }

  // Return only if confidence threshold met
  if (confidence >= 0.4) {
    return { level: detectedLevel, confidence };
  }

  return null;
}

/**
 * Convert Roman numeral to integer
 */
function romanToInt(roman: string): number {
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let result = 0;
  for (let i = 0; i < roman.length; i++) {
    const current = values[roman[i]] || 0;
    const next = values[roman[i + 1]] || 0;
    if (current < next) {
      result -= current;
    } else {
      result += current;
    }
  }
  return result;
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

/**
 * SOTA PDF Document Parser
 * 
 * Uses multi-pass extraction strategy:
 * 1. Extract raw text with position and style metadata
 * 2. Detect semantic structure (headers, paragraphs, lists)
 * 3. Identify and extract tables using spatial analysis
 * 4. Build coherent document structure
 */
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
      verbosity: 0,
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

    // SOTA PASS 1: Extract text with rich metadata
    const pageStructures: PDFPageStructure[] = [];
    const textParts: string[] = [];

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });

      // Extract items with full metadata
      const items = textContent.items as any[];
      const enrichedItems: PDFTextItem[] = [];

      for (const item of items) {
        if (item.str === undefined || item.str.trim() === "") continue;

        const transform = item.transform || [1, 0, 0, 1, 0, 0];
        enrichedItems.push({
          text: item.str,
          x: transform[4],
          y: transform[5],
          width: item.width || 0,
          height: item.height || Math.abs(transform[0]) || 12,
          fontName: item.fontName || "",
          fontSize: Math.abs(transform[0]) || 12,
        });
      }

      // SOTA line reconstruction with paragraph detection
      const pageLines = reconstructLinesSOTA(enrichedItems, viewport);
      const fullPageText = pageLines.map(l => l.text).join("\n");

      textParts.push(`=== Page ${pageNum} ===\n${fullPageText}`);

      pageStructures.push({
        pageNum,
        width: viewport.width,
        height: viewport.height,
        items: enrichedItems,
        lines: pageLines,
        text: fullPageText,
      });
    }

    result.rawText = textParts.join("\n\n");
    result.metadata.textExtracted = true;
    result.metadata.totalCharacters = result.rawText.length;

    // SOTA PASS 2: Detect sections using multi-heuristic approach
    result.sections = extractSectionsSOTA(pageStructures);

    // SOTA PASS 3: Extract tables using spatial clustering
    result.tables = extractTablesSOTA(pageStructures);

    // SOTA PASS 4: Try pattern-based table extraction as supplement
    const textTables = extractTablesFromTextSOTA(result.rawText);
    for (const table of textTables) {
      // Avoid duplicates by checking for similar content
      const isDuplicate = result.tables.some(t =>
        t.rows.length === table.rows.length &&
        t.headers.length === table.headers.length
      );
      if (!isDuplicate) {
        result.tables.push(table);
      }
    }

    // SOTA PASS 5: Associate tables with sections
    assignTablesToSections(result.sections, result.tables, pageStructures);

    console.log(`[documentParser] SOTA PDF parsed: ${pdfDoc.numPages} pages, ${result.sections.length} sections, ${result.tables.length} tables`);

  } catch (error: any) {
    console.error(`[documentParser] PDF parse error:`, error);
    result.errors.push(`PDF parse error: ${error?.message || String(error)}`);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOTA PDF TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface PDFTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  fontSize: number;
}

interface PDFLine {
  text: string;
  y: number;
  items: PDFTextItem[];
  isHeader: boolean;
  headerLevel?: number;
  isBold: boolean;
  avgFontSize: number;
}

interface PDFPageStructure {
  pageNum: number;
  width: number;
  height: number;
  items: PDFTextItem[];
  lines: PDFLine[];
  text: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOTA LINE RECONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SOTA line reconstruction using clustering and spatial analysis
 */
function reconstructLinesSOTA(items: PDFTextItem[], viewport: any): PDFLine[] {
  if (items.length === 0) return [];

  // Group items by Y position with tolerance
  const lineGroups = new Map<number, PDFTextItem[]>();
  const yTolerance = 3; // pixels

  for (const item of items) {
    const y = Math.round(item.y / yTolerance) * yTolerance;
    if (!lineGroups.has(y)) {
      lineGroups.set(y, []);
    }
    lineGroups.get(y)!.push(item);
  }

  // Sort and process each line group
  const lines: PDFLine[] = [];
  const sortedYs = Array.from(lineGroups.keys()).sort((a, b) => b - a); // Top to bottom (PDF Y is inverted)

  // Calculate document-wide font statistics for header detection
  const allFontSizes = items.map(i => i.fontSize);
  const avgFontSize = allFontSizes.reduce((a, b) => a + b, 0) / allFontSizes.length;
  const maxFontSize = Math.max(...allFontSizes);

  for (const y of sortedYs) {
    const lineItems = lineGroups.get(y)!.sort((a, b) => a.x - b.x);

    // Reconstruct text with proper spacing
    let lineText = "";
    let lastX = 0;
    let lastWidth = 0;

    for (const item of lineItems) {
      // Add space if there's a gap between items
      if (lineText.length > 0) {
        const gap = item.x - (lastX + lastWidth);
        if (gap > item.fontSize * 0.3) {
          lineText += " ";
        }
      }
      lineText += item.text;
      lastX = item.x;
      lastWidth = item.width;
    }

    lineText = lineText.trim();
    if (!lineText) continue;

    // Calculate line properties
    const lineFontSizes = lineItems.map(i => i.fontSize);
    const lineAvgFontSize = lineFontSizes.reduce((a, b) => a + b, 0) / lineFontSizes.length;

    // Detect if line is bold (heuristic: font name contains "Bold" or "Heavy")
    const isBold = lineItems.some(i =>
      /bold|heavy|black|medium/i.test(i.fontName)
    );

    // Detect header using multiple signals
    const headerDetection = detectSectionHeader(lineText);
    const isFontSizeHeader = lineAvgFontSize > avgFontSize * 1.15 || lineAvgFontSize >= maxFontSize * 0.9;
    const isHeader = headerDetection !== null || (isFontSizeHeader && lineText.length < 150 && !lineText.endsWith("."));

    lines.push({
      text: lineText,
      y,
      items: lineItems,
      isHeader,
      headerLevel: headerDetection?.level || (isHeader ? (isFontSizeHeader ? 1 : 2) : undefined),
      isBold,
      avgFontSize: lineAvgFontSize,
    });
  }

  return lines;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOTA SECTION EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SOTA section extraction using multi-signal header detection
 */
function extractSectionsSOTA(pageStructures: PDFPageStructure[]): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;
  let contentBuffer: string[] = [];

  // Collect all lines across pages
  const allLines: (PDFLine & { pageNum: number })[] = [];
  for (const page of pageStructures) {
    for (const line of page.lines) {
      allLines.push({ ...line, pageNum: page.pageNum });
    }
  }

  // Calculate global statistics for header detection refinement
  const headerCandidates = allLines.filter(l => l.isHeader);
  const nonHeaders = allLines.filter(l => !l.isHeader);
  const avgNonHeaderSize = nonHeaders.length > 0
    ? nonHeaders.reduce((a, b) => a + b.avgFontSize, 0) / nonHeaders.length
    : 12;

  for (const line of allLines) {
    // Enhanced header detection
    const isDefiniteHeader = line.isHeader && (
      line.headerLevel !== undefined ||
      line.avgFontSize > avgNonHeaderSize * 1.2 ||
      line.isBold ||
      detectSectionHeader(line.text) !== null
    );

    // Skip page markers
    if (line.text.startsWith("=== Page")) continue;

    if (isDefiniteHeader && line.text.length >= 3) {
      // Save current section
      if (currentSection) {
        currentSection.content = contentBuffer.join("\n").trim();
        if (currentSection.content.length > 0 || contentBuffer.length > 0) {
          sections.push(currentSection);
        }
      }

      // Start new section
      const headerInfo = detectSectionHeader(line.text);
      currentSection = {
        title: line.text,
        content: "",
        level: headerInfo?.level || line.headerLevel || 1,
        tables: [],
        lists: [],
      };
      contentBuffer = [];
    } else if (currentSection) {
      contentBuffer.push(line.text);
    } else {
      // Content before first section
      contentBuffer.push(line.text);
    }
  }

  // Save final section
  if (currentSection) {
    currentSection.content = contentBuffer.join("\n").trim();
    if (currentSection.content.length > 0) {
      sections.push(currentSection);
    }
  } else if (contentBuffer.length > 0) {
    // No sections detected - create default
    sections.push({
      title: "Document Content",
      content: contentBuffer.join("\n").trim(),
      level: 1,
      tables: [],
      lists: [],
    });
  }

  // Post-process: merge very short sections or split very long ones
  return postProcessSections(sections);
}

/**
 * Post-process sections for better structure
 */
function postProcessSections(sections: ParsedSection[]): ParsedSection[] {
  const processed: ParsedSection[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    // Skip empty sections
    if (!section.content && section.tables.length === 0) continue;

    // Merge very short sections (< 50 chars) with next section if same level
    if (section.content.length < 50 && i < sections.length - 1) {
      const nextSection = sections[i + 1];
      if (nextSection.level >= section.level) {
        // Prepend this content to next section
        nextSection.content = section.content + "\n\n" + nextSection.content;
        // Add this title as prefix if it's meaningful
        if (section.title && section.title !== "Document Content") {
          nextSection.content = `[${section.title}]\n${nextSection.content}`;
        }
        continue;
      }
    }

    processed.push(section);
  }

  return processed;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOTA TABLE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SOTA table extraction using spatial clustering
 */
function extractTablesSOTA(pageStructures: PDFPageStructure[]): ParsedTable[] {
  const tables: ParsedTable[] = [];
  let tableIndex = 0;

  for (const page of pageStructures) {
    const { items, pageNum, width, height } = page;
    if (items.length < 4) continue;

    // Group items by Y position (rows) with dynamic tolerance
    const avgHeight = items.reduce((a, b) => a + b.height, 0) / items.length;
    const rowTolerance = Math.max(avgHeight * 0.5, 3);

    const rowMap = new Map<number, PDFTextItem[]>();

    for (const item of items) {
      const y = Math.round(item.y / rowTolerance) * rowTolerance;
      if (!rowMap.has(y)) {
        rowMap.set(y, []);
      }
      rowMap.get(y)!.push(item);
    }

    // Sort rows by Y position (descending for PDF coordinate system)
    const sortedRows = Array.from(rowMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([_, cells]) => cells.sort((a, b) => a.x - b.x));

    // SOTA: Detect table regions using column alignment analysis
    const tableRegions = detectTableRegions(sortedRows, width);

    for (const region of tableRegions) {
      const { startRow, endRow, columns } = region;
      if (endRow - startRow < 2) continue; // Need at least header + 1 row

      const regionRows = sortedRows.slice(startRow, endRow + 1);

      // Extract table using detected columns
      const table = extractTableFromRegion(regionRows, columns, tableIndex++, pageNum);
      if (table && table.rows.length > 0) {
        tables.push(table);
      }
    }
  }

  return tables;
}

/**
 * Detect table regions using column alignment analysis
 */
function detectTableRegions(sortedRows: PDFTextItem[][], pageWidth: number): {
  startRow: number;
  endRow: number;
  columns: number[];
}[] {
  const regions: { startRow: number; endRow: number; columns: number[] }[] = [];

  // Analyze column positions across rows
  const columnBuckets = new Map<number, number>(); // X position -> count
  const bucketSize = pageWidth / 50; // 50 potential column positions

  for (const row of sortedRows) {
    for (const item of row) {
      const bucket = Math.round(item.x / bucketSize) * bucketSize;
      columnBuckets.set(bucket, (columnBuckets.get(bucket) || 0) + 1);
    }
  }

  // Find significant column positions (appear in many rows)
  const threshold = sortedRows.length * 0.3;
  const columnPositions = Array.from(columnBuckets.entries())
    .filter(([_, count]) => count >= threshold)
    .map(([pos]) => pos)
    .sort((a, b) => a - b);

  if (columnPositions.length < 2) return regions;

  // Find continuous table regions
  let tableStartRow = -1;
  let consecutiveTableRows = 0;

  for (let i = 0; i < sortedRows.length; i++) {
    const row = sortedRows[i];
    const colCount = row.length;

    // Check if this row aligns with detected columns
    let alignedCells = 0;
    for (const item of row) {
      const nearestCol = columnPositions.find(c => Math.abs(c - item.x) < bucketSize * 1.5);
      if (nearestCol !== undefined) alignedCells++;
    }

    const isTableRow = colCount >= 2 && alignedCells >= Math.min(colCount, columnPositions.length) * 0.5;

    if (isTableRow) {
      if (tableStartRow === -1) {
        tableStartRow = i;
      }
      consecutiveTableRows++;
    } else {
      if (consecutiveTableRows >= 3) {
        regions.push({
          startRow: tableStartRow,
          endRow: i - 1,
          columns: columnPositions,
        });
      }
      tableStartRow = -1;
      consecutiveTableRows = 0;
    }
  }

  // Handle table at end of page
  if (consecutiveTableRows >= 3) {
    regions.push({
      startRow: tableStartRow,
      endRow: sortedRows.length - 1,
      columns: columnPositions,
    });
  }

  return regions;
}

/**
 * Extract table from detected region
 */
function extractTableFromRegion(
  rows: PDFTextItem[][],
  columns: number[],
  index: number,
  pageNum: number
): ParsedTable | null {
  if (rows.length < 2) return null;

  // Build table with proper column assignment
  const tableData: string[][] = [];
  const bucketSize = columns.length > 1 ? (columns[1] - columns[0]) * 0.75 : 50;

  for (const row of rows) {
    const cells: string[] = new Array(columns.length).fill("");

    for (const item of row) {
      // Find best matching column
      let bestColIdx = 0;
      let bestDist = Infinity;
      for (let c = 0; c < columns.length; c++) {
        const dist = Math.abs(item.x - columns[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestColIdx = c;
        }
      }

      if (bestDist < bucketSize * 2) {
        cells[bestColIdx] = cells[bestColIdx]
          ? cells[bestColIdx] + " " + item.text
          : item.text;
      }
    }

    // Only include rows with actual content
    if (cells.some(c => c.trim())) {
      tableData.push(cells.map(c => c.trim()));
    }
  }

  if (tableData.length < 2) return null;

  // First row as headers
  const headers = tableData[0].map((h, i) => h || `Column_${i + 1}`);

  // Data rows
  const dataRows: Record<string, unknown>[] = [];
  for (let i = 1; i < tableData.length; i++) {
    const row = tableData[i];
    const record: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = row[j] || "";
    }
    // Skip empty rows
    if (Object.values(record).some(v => v && String(v).trim())) {
      dataRows.push(record);
    }
  }

  if (dataRows.length === 0) return null;

  return {
    name: `Table_Page${pageNum}_${index + 1}`,
    headers,
    rows: dataRows,
  };
}

/**
 * SOTA text-based table extraction using pattern recognition
 */
function extractTablesFromTextSOTA(text: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const lines = text.split("\n");

  let tableLines: string[] = [];
  let inTable = false;
  let tableIndex = 0;

  // Detect tables by looking for consistent delimiters
  const delimiters = ["\t", "|", "  ", ";"];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("=== Page")) continue;

    // Check for table-like structure
    let bestDelimiter: string | null = null;
    let maxCells = 0;

    for (const delim of delimiters) {
      const parts = trimmed.split(delim).filter(p => p.trim());
      if (parts.length > maxCells) {
        maxCells = parts.length;
        bestDelimiter = delim;
      }
    }

    const isTableLine = maxCells >= 2 && bestDelimiter !== null;

    if (isTableLine) {
      inTable = true;
      tableLines.push(trimmed);
    } else if (inTable && tableLines.length > 0) {
      // End of table
      const table = parseTextTableSOTA(tableLines, tableIndex);
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
    const table = parseTextTableSOTA(tableLines, tableIndex);
    if (table) {
      tables.push(table);
    }
  }

  return tables;
}

/**
 * Parse text table with smart delimiter detection
 */
function parseTextTableSOTA(lines: string[], index: number): ParsedTable | null {
  if (lines.length < 2) return null;

  // Detect best delimiter
  const delimiters = ["|", "\t", ";", "  "];
  let bestDelimiter = "\t";
  let maxConsistency = 0;

  for (const delim of delimiters) {
    const counts = lines.map(l => l.split(delim).filter(p => p.trim()).length);
    const mode = counts.sort()[Math.floor(counts.length / 2)];
    const consistency = counts.filter(c => c === mode).length;
    if (consistency > maxConsistency && mode >= 2) {
      maxConsistency = consistency;
      bestDelimiter = delim;
    }
  }

  const headers = lines[0].split(bestDelimiter).map(h => h.trim()).filter(h => h);

  if (headers.length < 2) return null;

  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(bestDelimiter).map(c => c.trim());
    const row: Record<string, unknown> = {};

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] || "";
    }

    if (Object.values(row).some(v => v && String(v).trim())) {
      rows.push(row);
    }
  }

  if (rows.length === 0) return null;

  return {
    name: `TextTable_${index + 1}`,
    headers,
    rows,
  };
}

/**
 * Associate tables with their parent sections
 */
function assignTablesToSections(
  sections: ParsedSection[],
  tables: ParsedTable[],
  pageStructures: PDFPageStructure[]
): void {
  // For now, simple heuristic: assign tables to sections based on content mention
  for (const table of tables) {
    const tableNameWords = table.name.toLowerCase().split(/[_\s]+/);
    const headerWords = table.headers.map(h => h.toLowerCase());

    for (const section of sections) {
      const sectionContent = (section.title + " " + section.content).toLowerCase();

      // Check if section mentions table headers or table name
      const mentionsTable = headerWords.some(h => sectionContent.includes(h)) ||
        tableNameWords.some(w => w.length > 3 && sectionContent.includes(w));

      if (mentionsTable) {
        section.tables.push(table);
        break; // Assign to first matching section
      }
    }
  }

  // Assign remaining tables to the first section (or create one)
  const unassignedTables = tables.filter(t =>
    !sections.some(s => s.tables.includes(t))
  );

  if (unassignedTables.length > 0 && sections.length > 0) {
    sections[0].tables.push(...unassignedTables);
  }
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

// ═══════════════════════════════════════════════════════════════════════════════
// TXT PARSER
// ═══════════════════════════════════════════════════════════════════════════════

function parseTxtDocument(
  buffer: Buffer,
  filename: string,
  contentHash: string,
  options: DocumentParseOptions
): ParsedDocument {
  const result: ParsedDocument = {
    filename,
    documentType: "txt",
    contentHash,
    rawText: buffer.toString("utf8"),
    sections: [],
    tables: [],
    metadata: {},
    parseDate: new Date().toISOString(),
    errors: [],
  };

  try {
    const text = result.rawText;
    result.metadata.lineCount = text.split("\n").length;
    result.metadata.charCount = text.length;

    // Try to parse as JSON first (some .txt files contain JSON)
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const data = JSON.parse(trimmed);
        result.metadata.detectedFormat = "json";

        // If array of objects, treat as table
        if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
          const headers = Object.keys(data[0] || {});
          result.tables.push({
            name: "Root",
            headers,
            rows: data,
          });
        } else if (typeof data === "object" && data !== null) {
          // Object - look for nested arrays
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
        }
      } catch {
        // Not valid JSON, continue with text parsing
      }
    }

    // Parse sections from text
    const lines = text.split("\n");
    let currentSection: ParsedSection | null = null;
    const contentLines: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      const isHeader = detectSectionHeader(trimmedLine);

      if (isHeader) {
        if (currentSection) {
          currentSection.content = contentLines.join("\n");
          result.sections.push(currentSection);
        }

        currentSection = {
          title: trimmedLine,
          content: "",
          level: isHeader.level,
          tables: [],
          lists: [],
        };
        contentLines.length = 0;
      } else if (trimmedLine) {
        contentLines.push(trimmedLine);
      }
    }

    // Save last section
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

    // Try to detect tables from text (tab-separated or pipe-separated)
    const textTables = extractTablesFromTextSOTA(text);
    for (const table of textTables) {
      result.tables.push(table);
    }

    // Assign tables to sections
    if (result.sections.length > 0 && result.tables.length > 0) {
      result.sections[0].tables = result.tables;
    }

    console.log(`[documentParser] TXT parsed: ${result.metadata.lineCount} lines, ${result.sections.length} sections, ${result.tables.length} tables`);

  } catch (error: any) {
    result.errors.push(`TXT parse error: ${error?.message || String(error)}`);
  }

  return result;
}
