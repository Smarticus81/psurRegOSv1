/**
 * Evidence Ingestion API Routes
 * Handles document upload, parsing, and evidence extraction
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import { parseDocument, detectDocumentType } from "./documentParser";
import { extractEvidence, EVIDENCE_TYPES, getEvidenceTypeInfo, getAllCategories } from "./evidenceExtractor";
import { 
  getSourceConfigs, 
  getSourceConfig, 
  updateSourceConfig, 
  deleteSourceConfig,
  resetToDefaults,
  SourceConfig,
  SourceConfigSchema,
  DEFAULT_SOURCE_CONFIGS 
} from "./sourceMapping";
import { createHash } from "crypto";

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT PARSING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ingest/parse
 * Parse a document and extract structure
 */
router.post("/parse", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { buffer, originalname } = req.file;
    const sourceType = req.body.sourceType;

    console.log(`[Ingest] Parsing document: ${originalname}, size: ${buffer.length}, sourceType: ${sourceType}`);

    const parsed = await parseDocument(buffer, originalname);

    if (parsed.errors.length > 0) {
      console.warn(`[Ingest] Parse warnings for ${originalname}:`, parsed.errors);
    }

    res.json({
      success: true,
      document: {
        filename: parsed.filename,
        documentType: parsed.documentType,
        contentHash: parsed.contentHash,
        sectionCount: parsed.sections.length,
        tableCount: parsed.tables.length,
        textLength: parsed.rawText.length,
        errors: parsed.errors,
        metadata: parsed.metadata,
      },
      sections: parsed.sections.map(s => ({
        title: s.title,
        level: s.level,
        contentPreview: s.content.substring(0, 200),
        tableCount: s.tables.length,
      })),
      tables: parsed.tables.map(t => ({
        name: t.name,
        headers: t.headers,
        rowCount: t.rows.length,
        sampleRows: t.rows.slice(0, 3),
      })),
    });
  } catch (error: any) {
    console.error("[Ingest] Parse error:", error);
    res.status(500).json({ error: error?.message || "Failed to parse document" });
  }
});

/**
 * POST /api/ingest/extract
 * Parse document and extract evidence atoms
 */
router.post("/extract", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { buffer, originalname } = req.file;
    const sourceType = req.body.sourceType;

    console.log(`[Ingest] Extracting evidence from: ${originalname}, sourceType: ${sourceType}`);

    // Parse document
    const parsed = await parseDocument(buffer, originalname);

    if (parsed.errors.length > 0 && parsed.rawText.length === 0) {
      return res.status(400).json({ 
        error: "Failed to parse document", 
        details: parsed.errors 
      });
    }

    // Extract evidence
    const extraction = await extractEvidence(parsed, sourceType);

    console.log(`[Ingest] Extracted ${extraction.extractedEvidence.length} evidence items from ${originalname}`);

    res.json({
      success: true,
      documentId: extraction.documentId,
      filename: extraction.filename,
      processingTime: extraction.processingTime,
      evidenceCount: extraction.extractedEvidence.length,
      evidence: extraction.extractedEvidence.map(e => ({
        evidenceType: e.evidenceType,
        confidence: e.confidence,
        source: e.source,
        sourceName: e.sourceName,
        data: e.data,
        extractionMethod: e.extractionMethod,
        warnings: e.warnings,
      })),
      suggestions: extraction.suggestions,
      documentInfo: {
        type: parsed.documentType,
        sections: parsed.sections.length,
        tables: parsed.tables.length,
      },
    });
  } catch (error: any) {
    console.error("[Ingest] Extract error:", error);
    res.status(500).json({ error: error?.message || "Failed to extract evidence" });
  }
});

/**
 * POST /api/ingest/batch
 * Process multiple files at once
 */
router.post("/batch", upload.array("files", 20), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const sourceType = req.body.sourceType;
    const results = [];

    for (const file of files) {
      try {
        const parsed = await parseDocument(file.buffer, file.originalname);
        const extraction = await extractEvidence(parsed, sourceType);
        
        results.push({
          filename: file.originalname,
          success: true,
          evidenceCount: extraction.extractedEvidence.length,
          evidence: extraction.extractedEvidence,
          suggestions: extraction.suggestions,
        });
      } catch (error: any) {
        results.push({
          filename: file.originalname,
          success: false,
          error: error?.message || "Processing failed",
        });
      }
    }

    const totalEvidence = results
      .filter(r => r.success)
      .reduce((sum, r) => sum + (r.evidenceCount || 0), 0);

    res.json({
      success: true,
      filesProcessed: files.length,
      totalEvidenceExtracted: totalEvidence,
      results,
    });
  } catch (error: any) {
    console.error("[Ingest] Batch error:", error);
    res.status(500).json({ error: error?.message || "Batch processing failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE TYPE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ingest/evidence-types
 * Get all evidence types
 */
router.get("/evidence-types", (_req: Request, res: Response) => {
  res.json({
    evidenceTypes: EVIDENCE_TYPES.map(t => ({
      type: t.type,
      category: t.category,
      description: t.description,
      requiredFields: t.requiredFields,
      optionalFields: t.optionalFields,
    })),
    categories: getAllCategories(),
  });
});

/**
 * GET /api/ingest/evidence-types/:type
 * Get specific evidence type info
 */
router.get("/evidence-types/:type", (req: Request, res: Response) => {
  const info = getEvidenceTypeInfo(req.params.type);
  if (!info) {
    return res.status(404).json({ error: "Evidence type not found" });
  }
  res.json(info);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SOURCE CONFIGURATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ingest/sources
 * Get all source configurations
 */
router.get("/sources", (_req: Request, res: Response) => {
  res.json({
    sources: getSourceConfigs(),
    defaults: DEFAULT_SOURCE_CONFIGS.map(d => d.id),
  });
});

/**
 * GET /api/ingest/sources/:id
 * Get specific source configuration
 */
router.get("/sources/:id", (req: Request, res: Response) => {
  const config = getSourceConfig(req.params.id);
  if (!config) {
    return res.status(404).json({ error: "Source configuration not found" });
  }
  res.json(config);
});

/**
 * POST /api/ingest/sources
 * Create new source configuration
 */
router.post("/sources", (req: Request, res: Response) => {
  try {
    const validated = SourceConfigSchema.parse(req.body);
    const config = updateSourceConfig(validated);
    res.status(201).json(config);
  } catch (error: any) {
    res.status(400).json({ error: "Invalid configuration", details: error?.message });
  }
});

/**
 * PUT /api/ingest/sources/:id
 * Update source configuration
 */
router.put("/sources/:id", (req: Request, res: Response) => {
  try {
    const existing = getSourceConfig(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Source configuration not found" });
    }
    
    const validated = SourceConfigSchema.parse({ ...req.body, id: req.params.id });
    const config = updateSourceConfig(validated);
    res.json(config);
  } catch (error: any) {
    res.status(400).json({ error: "Invalid configuration", details: error?.message });
  }
});

/**
 * DELETE /api/ingest/sources/:id
 * Delete source configuration
 */
router.delete("/sources/:id", (req: Request, res: Response) => {
  const deleted = deleteSourceConfig(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: "Source configuration not found" });
  }
  res.json({ success: true });
});

/**
 * POST /api/ingest/sources/reset
 * Reset to default configurations
 */
router.post("/sources/reset", (_req: Request, res: Response) => {
  resetToDefaults();
  res.json({ success: true, sources: getSourceConfigs() });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ingest/validate
 * Validate extracted evidence before creating atoms
 */
router.post("/validate", (req: Request, res: Response) => {
  const { evidence } = req.body;
  
  if (!Array.isArray(evidence)) {
    return res.status(400).json({ error: "Evidence must be an array" });
  }

  const validationResults = evidence.map((e: any, index: number) => {
    const typeInfo = getEvidenceTypeInfo(e.evidenceType);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!typeInfo) {
      errors.push(`Unknown evidence type: ${e.evidenceType}`);
      return { index, evidenceType: e.evidenceType, valid: false, errors, warnings };
    }

    // Check required fields
    for (const field of typeInfo.requiredFields) {
      if (!e.data?.[field] && e.data?.[field] !== 0) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check confidence
    if (e.confidence < 0.5) {
      warnings.push("Low confidence extraction - manual review recommended");
    }

    return {
      index,
      evidenceType: e.evidenceType,
      valid: errors.length === 0,
      errors,
      warnings,
    };
  });

  const allValid = validationResults.every(r => r.valid);

  res.json({
    valid: allValid,
    totalChecked: evidence.length,
    validCount: validationResults.filter(r => r.valid).length,
    invalidCount: validationResults.filter(r => !r.valid).length,
    results: validationResults,
  });
});

export default router;
