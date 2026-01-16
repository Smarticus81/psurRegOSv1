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
 * POST /api/ingest/parse-preview
 * Parse a document and return preview for mapping UI
 */
router.post("/parse-preview", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { buffer, originalname } = req.file;
    const sourceType = req.body.sourceType;

    console.log(`[Ingest] Parsing preview for: ${originalname}, size: ${buffer.length}, sourceType: ${sourceType}`);

    const parsed = await parseDocument(buffer, originalname);

    if (parsed.errors.length > 0 && parsed.rawText.length === 0 && parsed.tables.length === 0) {
      return res.status(400).json({ 
        error: "Failed to parse document", 
        details: parsed.errors 
      });
    }

    // Determine content type based on what was extracted
    if (parsed.tables.length > 0) {
      // Tabular data (Excel, CSV)
      const mainTable = parsed.tables[0];
      const columns = mainTable.headers;
      const rows = mainTable.rows.map(row => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        return obj;
      });

      res.json({
        type: "tabular",
        filename: originalname,
        columns,
        rows,
        preview: rows.slice(0, 10),
        totalRows: rows.length,
        tables: parsed.tables.length,
      });
    } else if (parsed.sections.length > 0) {
      // Document data (DOCX, PDF)
      res.json({
        type: "document",
        filename: originalname,
        sections: parsed.sections.map(s => ({
          title: s.title || "Untitled Section",
          content: s.content.substring(0, 500),
          type: s.tables.length > 0 ? "data" : "narrative",
          level: s.level,
        })),
        totalSections: parsed.sections.length,
        textLength: parsed.rawText.length,
      });
    } else {
      // Raw text fallback
      res.json({
        type: "text",
        filename: originalname,
        content: parsed.rawText.substring(0, 2000),
        textLength: parsed.rawText.length,
      });
    }
  } catch (error: any) {
    console.error("[Ingest] Parse preview error:", error);
    res.status(500).json({ error: error?.message || "Failed to parse document" });
  }
});

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
 * Parse document and extract evidence atoms with full decision tracing
 */
router.post("/extract", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { buffer, originalname } = req.file;
    const sourceType = req.body.sourceType;
    const includeTrace = req.body.includeTrace !== "false"; // Default to true

    console.log(`[Ingest] Extracting evidence from: ${originalname}, sourceType: ${sourceType}, tracing: ${includeTrace}`);

    // Parse document
    const parsed = await parseDocument(buffer, originalname);

    if (parsed.errors.length > 0 && parsed.rawText.length === 0) {
      return res.status(400).json({ 
        error: "Failed to parse document", 
        details: parsed.errors 
      });
    }

    // Extract evidence with decision tracing
    const extraction = await extractEvidence(parsed, sourceType);

    console.log(`[Ingest] Extracted ${extraction.extractedEvidence.length} evidence items from ${originalname} with ${extraction.decisionTrace.length} trace entries`);

    // Build response
    const response: Record<string, unknown> = {
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
        isCER: sourceType?.toLowerCase() === "cer" || extraction.cerExtractionResult !== undefined,
      },
    };

    // Include decision trace if requested
    if (includeTrace) {
      response.decisionTrace = extraction.decisionTrace.map(t => ({
        traceId: t.traceId,
        timestamp: t.timestamp,
        stage: t.stage,
        decision: t.decision,
        confidence: t.confidence,
        inputSummary: t.inputSummary,
        outputSummary: t.outputSummary,
        reasoning: t.reasoning,
        alternativesConsidered: t.alternativesConsidered,
        warnings: t.warnings,
        durationMs: t.durationMs,
      }));
      response.traceCount = extraction.decisionTrace.length;
    }

    // Include CER-specific results if available
    if (extraction.cerExtractionResult) {
      response.cerExtraction = {
        sectionsClassified: extraction.cerExtractionResult.sections.length,
        sectionTypes: Array.from(new Set(extraction.cerExtractionResult.sections.map(s => s.type))),
        processingTimeMs: extraction.cerExtractionResult.processingTimeMs,
        warnings: extraction.cerExtractionResult.warnings,
      };
    }

    res.json(response);
  } catch (error: any) {
    console.error("[Ingest] Extract error:", error);
    res.status(500).json({ error: error?.message || "Failed to extract evidence" });
  }
});

/**
 * POST /api/ingest/batch
 * Process multiple files at once with decision tracing
 */
router.post("/batch", upload.array("files", 20), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const sourceType = req.body.sourceType;
    const includeTrace = req.body.includeTrace !== "false";
    const results = [];
    const allTraces: any[] = [];

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
          traceCount: extraction.decisionTrace.length,
          isCER: extraction.cerExtractionResult !== undefined,
        });

        if (includeTrace) {
          allTraces.push(...extraction.decisionTrace.map(t => ({
            ...t,
            filename: file.originalname,
          })));
        }
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

    const response: Record<string, unknown> = {
      success: true,
      filesProcessed: files.length,
      totalEvidenceExtracted: totalEvidence,
      results,
    };

    if (includeTrace) {
      response.decisionTrace = allTraces;
      response.totalTraceEntries = allTraces.length;
    }

    res.json(response);
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
// SOTA FIELD MAPPING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ingest/auto-map
 * Use SOTA AI agent to automatically map columns with multi-pass reasoning
 */
router.post("/auto-map", async (req: Request, res: Response) => {
  try {
    const { sourceColumns, evidenceType } = req.body;

    if (!sourceColumns || !Array.isArray(sourceColumns)) {
      return res.status(400).json({ error: "sourceColumns array is required" });
    }

    if (!evidenceType) {
      return res.status(400).json({ error: "evidenceType is required" });
    }

    // Import the SOTA field mapping agent
    const { FieldMappingAgent } = await import("../agents/ingestion/fieldMappingAgent");
    const { getEvidenceTypeMapping } = await import("../agents/config");

    // Get target schema for the evidence type
    const targetMapping = getEvidenceTypeMapping(evidenceType);
    const targetSchema = targetMapping ? [
      ...targetMapping.requiredFields.map(f => ({
        fieldName: f,
        displayName: f.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        type: "string",
        required: true,
        description: `Required field for ${evidenceType}`,
      })),
      ...targetMapping.optionalFields.map(f => ({
        fieldName: f,
        displayName: f.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        type: "string",
        required: false,
        description: `Optional field for ${evidenceType}`,
      })),
    ] : [];

    // Build input for the agent
    const agentInput = {
      sourceColumns: sourceColumns.map((col: string) => ({
        name: col,
        sampleValues: [],
        dataType: "unknown",
      })),
      targetSchema,
      evidenceType,
    };

    // Run the SOTA mapping agent
    const agent = new FieldMappingAgent();
    const result = await agent.run(agentInput, {
      psurCaseId: 0,
      traceCtx: {
        traceId: `auto-map-${Date.now()}`,
        psurCaseId: 0,
        currentSequence: 0,
        previousHash: null,
      },
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || "Auto-mapping failed");
    }

    res.json({
      success: true,
      mappings: result.data.mappings.map((m: any) => ({
        sourceColumn: m.sourceColumn,
        targetField: m.targetField,
        confidence: m.confidence,
        method: m.method,
        reasoning: m.reasoning,
        alternatives: m.alternatives,
        requiresConfirmation: m.requiresConfirmation,
      })),
      unmappedSources: result.data.unmappedSources,
      unmappedTargets: result.data.unmappedTargets,
      overallConfidence: result.data.overallConfidence,
      suggestedActions: result.data.suggestedActions,
    });
  } catch (error: any) {
    console.error("[Ingest] Auto-map error:", error);
    res.status(500).json({ 
      error: error?.message || "Auto-mapping failed",
      fallback: true,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI-POWERED INGESTION WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ingest/ai-workflow
 * Full AI-powered ingestion using AgentOrchestrator
 * - Parses document
 * - Uses FieldMappingAgent for intelligent column mapping
 * - Uses EvidenceExtractionAgent for extraction and classification
 * - Creates atoms with full decision tracing
 */
router.post("/ai-workflow", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { buffer, originalname } = req.file;
    const { psurCaseId, sourceType, evidenceType, deviceCode, periodStart, periodEnd, userMappings } = req.body;

    if (!psurCaseId) {
      return res.status(400).json({ error: "psurCaseId is required" });
    }

    if (!evidenceType) {
      return res.status(400).json({ error: "evidenceType is required" });
    }

    console.log(`[AI Ingest] Starting AI workflow for: ${originalname}, caseId: ${psurCaseId}, type: ${evidenceType}`);

    // Parse document
    const parsed = await parseDocument(buffer, originalname);

    if (parsed.errors.length > 0 && parsed.rawText.length === 0 && parsed.tables.length === 0) {
      return res.status(400).json({ 
        error: "Failed to parse document", 
        details: parsed.errors 
      });
    }

    // Build parsed content for agent
    let parsedContent: any;
    if (parsed.tables.length > 0) {
      const mainTable = parsed.tables[0];
      const rows = mainTable.rows.map(row => {
        const obj: Record<string, unknown> = {};
        mainTable.headers.forEach((col, i) => {
          obj[col] = row[i];
        });
        return obj;
      });
      parsedContent = { type: "tabular", rows };
    } else if (parsed.sections.length > 0) {
      parsedContent = { 
        type: "document", 
        sections: parsed.sections.map(s => ({
          title: s.title,
          content: s.content,
          page: undefined,
        }))
      };
    } else {
      parsedContent = { type: "text", rawText: parsed.rawText };
    }

    // Run AI ingestion workflow
    const { getOrchestrator } = await import("../agents/agentOrchestrator");
    const orchestrator = getOrchestrator();

    const result = await orchestrator.runIngestionWorkflow({
      psurCaseId: parseInt(psurCaseId),
      parsedContent,
      sourceFile: originalname,
      sourceType: sourceType || "upload",
      evidenceType,
      userMappings: userMappings ? JSON.parse(userMappings) : undefined,
      deviceCode: deviceCode || "",
      periodStart: periodStart || new Date().toISOString().split("T")[0],
      periodEnd: periodEnd || new Date().toISOString().split("T")[0],
    });

    console.log(`[AI Ingest] Workflow completed: ${result.atomsCreated} atoms created, success: ${result.success}`);

    res.json({
      success: result.success,
      atomsCreated: result.atomsCreated,
      traceId: result.traceId,
      mappings: {
        applied: result.mappings.mappings.filter(m => m.targetField !== null).length,
        unmapped: result.mappings.unmappedSources.length,
        confidence: result.mappings.overallConfidence,
        details: result.mappings.mappings,
      },
      extraction: {
        totalExtracted: result.extraction.totalExtracted,
        totalSkipped: result.extraction.totalSkipped,
        classifications: result.extraction.classifications,
        confidence: result.extraction.overallConfidence,
      },
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (error: any) {
    console.error("[AI Ingest] Workflow error:", error);
    res.status(500).json({ 
      error: error?.message || "AI ingestion workflow failed",
      stack: process.env.NODE_ENV === "development" ? error?.stack : undefined,
    });
  }
});

/**
 * POST /api/ingest/ai-classify
 * Classify complaint severity using AI
 */
router.post("/ai-classify", async (req: Request, res: Response) => {
  try {
    const { description, deviceType, outcome, psurCaseId } = req.body;

    if (!description) {
      return res.status(400).json({ error: "description is required" });
    }

    const { complete, applyTemplate, PROMPT_TEMPLATES } = await import("../agents/llmService");
    const { startTrace, logTraceEvent } = await import("../services/decisionTraceService");

    // Start trace if psurCaseId provided
    let traceCtx = null;
    if (psurCaseId) {
      traceCtx = await startTrace(parseInt(psurCaseId));
    }

    const prompt = applyTemplate(PROMPT_TEMPLATES.SEVERITY_CLASSIFICATION, {
      description,
      deviceType: deviceType || "Unknown",
      outcome: outcome || "Not specified",
    });

    const response = await complete({
      messages: [
        { role: "system", content: "You are a medical device safety expert." },
        { role: "user", content: prompt },
      ],
      config: { temperature: 0.1 },
      responseFormat: "json",
    });

    let classification;
    try {
      classification = JSON.parse(response.content);
    } catch {
      // Try extracting JSON from markdown
      const jsonMatch = response.content.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        classification = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error("Failed to parse classification response");
      }
    }

    // Log classification decision if tracing
    if (traceCtx) {
      await logTraceEvent(traceCtx, {
        eventType: "EVIDENCE_CLASSIFIED",
        actor: "ai-classify-endpoint",
        entityType: "EVIDENCE_ATOM",
        decision: classification.severity,
        outputData: classification,
        reasons: [classification.reasoning],
      });
    }

    res.json({
      success: true,
      classification,
      model: response.model,
      provider: response.provider,
      latencyMs: response.latencyMs,
    });
  } catch (error: any) {
    console.error("[AI Classify] Error:", error);
    res.status(500).json({ error: error?.message || "Classification failed" });
  }
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
