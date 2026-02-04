/**
 * SOTA PDF Parser with OCR Fallback
 * 
 * Hybrid extraction strategy:
 * 1. Try native text extraction via pdfjs-dist
 * 2. Detect if document is scanned (low text yield)
 * 3. Fall back to Tesseract.js OCR for image-based PDFs
 * 
 * @module sotaPdfOcr
 */

import { createWorker, Worker, OEM, PSM } from "tesseract.js";
import { createHash } from "crypto";

// Dynamic imports for PDF processing
let pdfjsLib: any = null;
let pdfToImg: any = null;

// Worker pool for OCR
let ocrWorker: Worker | null = null;
let workerInitPromise: Promise<Worker> | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface OCRPageResult {
    pageNum: number;
    text: string;
    confidence: number;
    words: Array<{
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
}

export interface PDFParseResult {
    filename: string;
    contentHash: string;
    rawText: string;
    pageCount: number;
    usedOCR: boolean;
    ocrConfidence?: number;
    sections: ParsedSection[];
    tables: ParsedTable[];
    metadata: Record<string, unknown>;
    parseDate: string;
    errors: string[];
    warnings: string[];
}

interface ParsedSection {
    title: string;
    content: string;
    level: number;
    pageNum?: number;
}

interface ParsedTable {
    name: string;
    headers: string[];
    rows: Record<string, unknown>[];
    pageNum?: number;
}

interface PDFTextItem {
    text: string;
    x: number;
    y: number;
    fontSize: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize the PDF.js library
 */
async function initPdfJs(): Promise<boolean> {
    if (pdfjsLib) return true;

    try {
        pdfjsLib = await import("pdfjs-dist");
        console.log("[sotaPdfOcr] PDF.js initialized");
        return true;
    } catch (error) {
        console.error("[sotaPdfOcr] Failed to initialize PDF.js:", error);
        return false;
    }
}

/**
 * Initialize pdf-to-img for image conversion
 */
async function initPdfToImg(): Promise<boolean> {
    if (pdfToImg) return true;

    try {
        pdfToImg = await import("pdf-to-img");
        console.log("[sotaPdfOcr] pdf-to-img initialized");
        return true;
    } catch (error) {
        console.warn("[sotaPdfOcr] pdf-to-img not available, OCR fallback disabled:", error);
        return false;
    }
}

/**
 * Initialize or get the OCR worker
 */
async function getOCRWorker(): Promise<Worker> {
    if (ocrWorker) return ocrWorker;

    if (workerInitPromise) return workerInitPromise;

    workerInitPromise = (async () => {
        console.log("[sotaPdfOcr] Initializing Tesseract.js worker...");
        const worker = await createWorker("eng", OEM.LSTM_ONLY, {
            logger: (m) => {
                if (m.status === "recognizing text" && m.progress) {
                    // Progress logging for long OCR operations
                    if (m.progress % 0.25 < 0.01) {
                        console.log(`[sotaPdfOcr] OCR progress: ${Math.round(m.progress * 100)}%`);
                    }
                }
            },
        });

        await worker.setParameters({
            tessedit_pageseg_mode: PSM.AUTO,
        });

        ocrWorker = worker;
        console.log("[sotaPdfOcr] Tesseract.js worker ready");
        return worker;
    })();

    return workerInitPromise;
}

/**
 * Terminate OCR worker (call on server shutdown)
 */
export async function terminateOCRWorker(): Promise<void> {
    if (ocrWorker) {
        await ocrWorker.terminate();
        ocrWorker = null;
        workerInitPromise = null;
        console.log("[sotaPdfOcr] OCR worker terminated");
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SOTA PDF Parser with automatic OCR fallback
 * 
 * @param buffer - PDF file buffer
 * @param filename - Original filename
 * @param options - Parse options
 * @returns Parsed document with text, sections, and tables
 */
export async function parsePdfWithOCR(
    buffer: Buffer,
    filename: string,
    options: {
        enableOCR?: boolean;
        ocrLanguage?: string;
        extractTables?: boolean;
        extractSections?: boolean;
    } = {}
): Promise<PDFParseResult> {
    const {
        enableOCR = true,
        extractTables = true,
        extractSections = true,
    } = options;

    const contentHash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);

    const result: PDFParseResult = {
        filename,
        contentHash,
        rawText: "",
        pageCount: 0,
        usedOCR: false,
        sections: [],
        tables: [],
        metadata: {},
        parseDate: new Date().toISOString(),
        errors: [],
        warnings: [],
    };

    try {
        // Initialize PDF.js
        const pdfReady = await initPdfJs();
        if (!pdfReady) {
            result.errors.push("PDF.js initialization failed");
            return result;
        }

        // Load PDF document
        const uint8Array = new Uint8Array(buffer);
        const loadingTask = pdfjsLib.getDocument({
            data: uint8Array,
            useSystemFonts: true,
            disableFontFace: true,
            verbosity: 0,
        });

        const pdfDoc = await loadingTask.promise;
        result.pageCount = pdfDoc.numPages;
        result.metadata.numPages = pdfDoc.numPages;

        // Try to get PDF metadata
        try {
            const metadata = await pdfDoc.getMetadata();
            result.metadata.info = metadata?.info || {};
        } catch {
            // Metadata extraction is optional
        }

        // PASS 1: Native text extraction
        const nativeResult = await extractNativeText(pdfDoc);
        result.rawText = nativeResult.text;
        result.metadata.nativeCharsPerPage = nativeResult.avgCharsPerPage;

        // PASS 2: Check if OCR is needed
        const needsOCR = enableOCR && detectScannedDocument(nativeResult);

        if (needsOCR) {
            console.log(`[sotaPdfOcr] Low text yield detected (${nativeResult.avgCharsPerPage} chars/page), attempting OCR...`);

            const ocrReady = await initPdfToImg();
            if (ocrReady) {
                try {
                    const ocrResult = await performOCR(buffer, filename);
                    result.rawText = ocrResult.text;
                    result.usedOCR = true;
                    result.ocrConfidence = ocrResult.confidence;
                    result.metadata.ocrPages = ocrResult.pages.length;
                    console.log(`[sotaPdfOcr] OCR complete: ${ocrResult.text.length} chars, ${Math.round(ocrResult.confidence)}% confidence`);
                } catch (ocrError: any) {
                    result.warnings.push(`OCR failed: ${ocrError.message}`);
                    console.error("[sotaPdfOcr] OCR failed:", ocrError);
                }
            } else {
                result.warnings.push("OCR fallback not available (pdf-to-img not installed)");
            }
        }

        // PASS 3: Extract sections
        if (extractSections && result.rawText.length > 0) {
            result.sections = extractSectionsFromText(result.rawText);
        }

        // PASS 4: Extract tables (from native extraction if available)
        if (extractTables && !result.usedOCR) {
            result.tables = nativeResult.tables;
        }

        console.log(`[sotaPdfOcr] Parsed ${filename}: ${result.pageCount} pages, ${result.rawText.length} chars, OCR=${result.usedOCR}`);

    } catch (error: any) {
        result.errors.push(`PDF parse error: ${error.message}`);
        console.error("[sotaPdfOcr] Parse error:", error);
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NATIVE TEXT EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

interface NativeExtractionResult {
    text: string;
    avgCharsPerPage: number;
    tables: ParsedTable[];
    pageData: Array<{
        pageNum: number;
        text: string;
        items: PDFTextItem[];
    }>;
}

async function extractNativeText(pdfDoc: any): Promise<NativeExtractionResult> {
    const textParts: string[] = [];
    const pageData: NativeExtractionResult["pageData"] = [];
    const tables: ParsedTable[] = [];

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();

        const items: PDFTextItem[] = [];
        const lineGroups = new Map<number, string[]>();
        const yTolerance = 3;

        for (const item of textContent.items as any[]) {
            if (!item.str || item.str.trim() === "") continue;

            const transform = item.transform || [1, 0, 0, 1, 0, 0];
            const y = Math.round(transform[5] / yTolerance) * yTolerance;

            items.push({
                text: item.str,
                x: transform[4],
                y: transform[5],
                fontSize: Math.abs(transform[0]) || 12,
            });

            if (!lineGroups.has(y)) {
                lineGroups.set(y, []);
            }
            lineGroups.get(y)!.push(item.str);
        }

        // Reconstruct text line by line
        const sortedYs = Array.from(lineGroups.keys()).sort((a, b) => b - a);
        const pageText = sortedYs
            .map(y => lineGroups.get(y)!.join(" "))
            .join("\n");

        textParts.push(pageText);
        pageData.push({ pageNum, text: pageText, items });

        // Try to detect tables from aligned columns
        const detectedTables = detectTablesFromItems(items, pageNum);
        tables.push(...detectedTables);
    }

    const fullText = textParts.join("\n\n");
    const avgCharsPerPage = fullText.length / pdfDoc.numPages;

    return {
        text: fullText,
        avgCharsPerPage,
        tables,
        pageData,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCANNED DOCUMENT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function detectScannedDocument(nativeResult: NativeExtractionResult): boolean {
    // Heuristic 1: Low character count per page
    if (nativeResult.avgCharsPerPage < 100) {
        return true;
    }

    // Heuristic 2: Almost no extractable text
    if (nativeResult.text.trim().length < 50) {
        return true;
    }

    // Heuristic 3: Text is mostly garbage (random characters)
    const alphanumericRatio = (nativeResult.text.match(/[a-zA-Z0-9]/g) || []).length /
        Math.max(nativeResult.text.length, 1);
    if (alphanumericRatio < 0.3) {
        return true;
    }

    return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OCR PROCESSING
// ═══════════════════════════════════════════════════════════════════════════════

interface OCRResult {
    text: string;
    confidence: number;
    pages: OCRPageResult[];
}

async function performOCR(buffer: Buffer, filename: string): Promise<OCRResult> {
    const worker = await getOCRWorker();

    // Convert PDF pages to images
    const images = await convertPdfToImages(buffer);

    if (images.length === 0) {
        throw new Error("Failed to convert PDF to images");
    }

    const pages: OCRPageResult[] = [];
    let totalConfidence = 0;

    for (let i = 0; i < images.length; i++) {
        const pageNum = i + 1;
        console.log(`[sotaPdfOcr] OCR processing page ${pageNum}/${images.length}...`);

        const { data } = await worker.recognize(images[i]);

        pages.push({
            pageNum,
            text: data.text,
            confidence: data.confidence,
            words: data.words.map(w => ({
                text: w.text,
                confidence: w.confidence,
                bbox: w.bbox,
            })),
        });

        totalConfidence += data.confidence;
    }

    const avgConfidence = totalConfidence / pages.length;
    const fullText = pages.map(p => p.text).join("\n\n");

    return {
        text: fullText,
        confidence: avgConfidence,
        pages,
    };
}

async function convertPdfToImages(buffer: Buffer): Promise<Buffer[]> {
    const images: Buffer[] = [];

    try {
        // Use pdf-to-img to convert PDF to images
        const { pdf } = pdfToImg;
        const doc = await pdf(buffer, { scale: 2.0 }); // 2x scale for better OCR quality

        for await (const image of doc) {
            images.push(image);
        }
    } catch (error) {
        console.error("[sotaPdfOcr] PDF to image conversion failed:", error);
    }

    return images;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

function extractSectionsFromText(text: string): ParsedSection[] {
    const sections: ParsedSection[] = [];
    const lines = text.split("\n").filter(l => l.trim());

    let currentSection: ParsedSection | null = null;
    let contentBuffer: string[] = [];

    // Section header patterns
    const headerPatterns = [
        { pattern: /^(\d+(?:\.\d+)*)[.:\s]+(.+)/, level: (m: string) => m.split(".").length },
        { pattern: /^([IVXLCDM]+)[.:\s]+(.+)/i, level: () => 1 },
        { pattern: /^(SECTION|CHAPTER|PART)\s+(\d+|[IVXLCDM]+)[.:\s]*(.*)$/i, level: () => 1 },
        { pattern: /^([A-Z][A-Z\s]{5,50})$/, level: () => 1 },
    ];

    for (const line of lines) {
        const trimmed = line.trim();
        let isHeader = false;
        let headerLevel = 1;
        let headerTitle = trimmed;

        for (const { pattern, level } of headerPatterns) {
            const match = trimmed.match(pattern);
            if (match) {
                isHeader = true;
                headerLevel = typeof level === "function" ? level(match[1]) : level;
                headerTitle = match[2] || match[3] || trimmed;
                break;
            }
        }

        if (isHeader && headerTitle.length > 2 && headerTitle.length < 150) {
            // Save previous section
            if (currentSection) {
                currentSection.content = contentBuffer.join("\n").trim();
                if (currentSection.content.length > 0) {
                    sections.push(currentSection);
                }
            }

            currentSection = {
                title: headerTitle,
                content: "",
                level: headerLevel,
            };
            contentBuffer = [];
        } else if (currentSection) {
            contentBuffer.push(trimmed);
        } else {
            contentBuffer.push(trimmed);
        }
    }

    // Save last section
    if (currentSection) {
        currentSection.content = contentBuffer.join("\n").trim();
        if (currentSection.content.length > 0) {
            sections.push(currentSection);
        }
    } else if (contentBuffer.length > 0) {
        sections.push({
            title: "Document Content",
            content: contentBuffer.join("\n").trim(),
            level: 1,
        });
    }

    return sections;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function detectTablesFromItems(items: PDFTextItem[], pageNum: number): ParsedTable[] {
    // Simple table detection based on column alignment
    // Group items by Y position
    const rows = new Map<number, PDFTextItem[]>();
    const yTolerance = 5;

    for (const item of items) {
        const y = Math.round(item.y / yTolerance) * yTolerance;
        if (!rows.has(y)) {
            rows.set(y, []);
        }
        rows.get(y)!.push(item);
    }

    // Find rows with consistent column structure (potential tables)
    const sortedRows = Array.from(rows.entries())
        .sort(([a], [b]) => b - a)
        .map(([_, items]) => items.sort((a, b) => a.x - b.x));

    // Look for consecutive rows with similar column counts
    const tables: ParsedTable[] = [];
    let tableStart = -1;
    let prevColCount = 0;

    for (let i = 0; i < sortedRows.length; i++) {
        const colCount = sortedRows[i].length;

        if (colCount >= 2 && colCount <= 10) {
            if (tableStart === -1) {
                tableStart = i;
                prevColCount = colCount;
            } else if (Math.abs(colCount - prevColCount) <= 1) {
                // Continue table
            } else {
                // End table if > 2 rows
                if (i - tableStart >= 2) {
                    const table = extractTableFromRows(sortedRows.slice(tableStart, i), pageNum, tables.length);
                    if (table) tables.push(table);
                }
                tableStart = -1;
            }
        } else {
            if (tableStart !== -1 && i - tableStart >= 2) {
                const table = extractTableFromRows(sortedRows.slice(tableStart, i), pageNum, tables.length);
                if (table) tables.push(table);
            }
            tableStart = -1;
        }
    }

    return tables;
}

function extractTableFromRows(rows: PDFTextItem[][], pageNum: number, tableIndex: number): ParsedTable | null {
    if (rows.length < 2) return null;

    const headers = rows[0].map(item => item.text.trim());
    const dataRows: Record<string, unknown>[] = [];

    for (let i = 1; i < rows.length; i++) {
        const row: Record<string, unknown> = {};
        const cells = rows[i];

        for (let j = 0; j < Math.min(cells.length, headers.length); j++) {
            row[headers[j] || `Column_${j}`] = cells[j].text.trim();
        }

        dataRows.push(row);
    }

    return {
        name: `Table_${pageNum}_${tableIndex + 1}`,
        headers,
        rows: dataRows,
        pageNum,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE DOSSIER EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════════

export interface ExtractedDeviceInfo {
    deviceName?: string;
    tradeName?: string;
    manufacturerName?: string;
    deviceCode?: string;
    udiDi?: string;
    gmdnCode?: string;
    classification?: {
        class?: string;
        rule?: string;
    };
    intendedPurpose?: string;
    indications?: string[];
    contraindications?: string[];
    regulatoryStatus?: {
        ceMarked?: boolean;
        fdaCleared?: boolean;
        notifiedBody?: string;
        certificateNumber?: string;
    };
    confidence: number;
}

/**
 * Extract device-related information from parsed PDF
 * Used to auto-populate device dossier fields
 */
export function extractDeviceInfoFromPDF(result: PDFParseResult): ExtractedDeviceInfo {
    const info: ExtractedDeviceInfo = { confidence: 0 };
    const text = result.rawText.toLowerCase();
    const fullText = result.rawText;
    let confidencePoints = 0;

    // Extract device name patterns
    const deviceNamePatterns = [
        /device\s+name[:\s]+([^\n]+)/i,
        /product\s+name[:\s]+([^\n]+)/i,
        /trade\s+name[:\s]+([^\n]+)/i,
        /device\s+under\s+evaluation[:\s]+([^\n]+)/i,
    ];

    for (const pattern of deviceNamePatterns) {
        const match = fullText.match(pattern);
        if (match && match[1]) {
            info.deviceName = match[1].trim().substring(0, 100);
            info.tradeName = info.deviceName;
            confidencePoints += 20;
            break;
        }
    }

    // Extract manufacturer
    const manufacturerPatterns = [
        /manufacturer[:\s]+([^\n]+)/i,
        /manufactured\s+by[:\s]+([^\n]+)/i,
        /legal\s+manufacturer[:\s]+([^\n]+)/i,
    ];

    for (const pattern of manufacturerPatterns) {
        const match = fullText.match(pattern);
        if (match && match[1]) {
            info.manufacturerName = match[1].trim().substring(0, 100);
            confidencePoints += 15;
            break;
        }
    }

    // Extract UDI-DI
    const udiPatterns = [
        /udi[-\s]*di[:\s]+([A-Z0-9\-]+)/i,
        /basic\s+udi[-\s]*di[:\s]+([A-Z0-9\-]+)/i,
        /\(01\)(\d{14})/,
    ];

    for (const pattern of udiPatterns) {
        const match = fullText.match(pattern);
        if (match && match[1]) {
            info.udiDi = match[1].trim();
            confidencePoints += 15;
            break;
        }
    }

    // Extract classification
    const classPatterns = [
        /class\s+(i{1,3}|iia|iib|iii)\b/i,
        /classification[:\s]+(class\s+)?(i{1,3}|iia|iib|iii)\b/i,
        /risk\s+class[:\s]+(i{1,3}|iia|iib|iii)\b/i,
    ];

    for (const pattern of classPatterns) {
        const match = fullText.match(pattern);
        if (match) {
            const classMatch = (match[2] || match[1]).toUpperCase().replace(/^CLASS\s+/i, "");
            info.classification = { class: classMatch };
            confidencePoints += 10;
            break;
        }
    }

    // Extract intended purpose
    const purposePatterns = [
        /intended\s+purpose[:\s]+([\s\S]{50,500}?)(?=\n\n|\.\s+[A-Z])/i,
        /intended\s+use[:\s]+([\s\S]{50,500}?)(?=\n\n|\.\s+[A-Z])/i,
        /indication[s]?\s+for\s+use[:\s]+([\s\S]{50,500}?)(?=\n\n|\.\s+[A-Z])/i,
    ];

    for (const pattern of purposePatterns) {
        const match = fullText.match(pattern);
        if (match && match[1]) {
            info.intendedPurpose = match[1].trim().substring(0, 1000);
            confidencePoints += 20;
            break;
        }
    }

    // Extract indications
    if (text.includes("indication")) {
        const indicationMatch = fullText.match(/indications?[:\s]+([\s\S]{100,1000}?)(?=contraindication|warning|precaution|\n\n)/i);
        if (indicationMatch) {
            const bullets = indicationMatch[1].match(/[-•]\s*([^\n-•]+)/g);
            if (bullets && bullets.length > 0) {
                info.indications = bullets.map(b => b.replace(/^[-•]\s*/, "").trim()).slice(0, 20);
                confidencePoints += 10;
            }
        }
    }

    // Extract contraindications
    if (text.includes("contraindication")) {
        const contraMatch = fullText.match(/contraindications?[:\s]+([\s\S]{100,1000}?)(?=warning|precaution|\n\n)/i);
        if (contraMatch) {
            const bullets = contraMatch[1].match(/[-•]\s*([^\n-•]+)/g);
            if (bullets && bullets.length > 0) {
                info.contraindications = bullets.map(b => b.replace(/^[-•]\s*/, "").trim()).slice(0, 20);
                confidencePoints += 10;
            }
        }
    }

    // Check for CE marking
    if (text.includes("ce mark") || text.includes("ce-mark") || fullText.includes("CE")) {
        info.regulatoryStatus = { ...info.regulatoryStatus, ceMarked: true };
        confidencePoints += 5;
    }

    // Extract notified body
    const nbMatch = fullText.match(/notified\s+body[:\s]+([^\n]+)/i);
    if (nbMatch) {
        info.regulatoryStatus = { ...info.regulatoryStatus, notifiedBody: nbMatch[1].trim() };
        confidencePoints += 5;
    }

    info.confidence = Math.min(confidencePoints, 100);

    return info;
}
