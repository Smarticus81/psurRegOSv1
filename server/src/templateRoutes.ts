
import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { validateTemplate, TemplateValidationResult, listTemplatesWithMetadata, loadTemplate, isTemplateFormBased, loadFormTemplate } from "./templateStore";
import { isFormBasedTemplate } from "./templates/formTemplateSchema";
import { 
  templateManagementService, 
  TemplateManagementService,
  type SlotMappingGuide, 
  type FormattingGuide,
  type GRKBGroundingResult,
} from "./services/templateManagementService";
import { docxTemplateParser } from "./services/docxTemplateParser";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { 
  grkbObligations, 
  slotDefinitions, 
  slotObligationLinks,
  systemInstructions,
  decisionTraceEntries,
} from "@shared/schema";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB for DOCX files

/**
 * POST /api/templates/validate
 * Validate a template JSON file
 */
router.post("/validate", upload.single("file"), async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            // Check if JSON body
            if (req.body && req.body.template_id) {
                const result = validateTemplate(req.body);
                return res.json(result);
            }
            return res.status(400).json({ error: "No file or JSON body provided" });
        }

        const buffer = req.file.buffer;
        const content = buffer.toString("utf-8");
        let json;
        try {
            json = JSON.parse(content);
        } catch (e) {
            return res.status(400).json({ valid: false, errors: ["Invalid JSON file"], warnings: [] });
        }

        const result = validateTemplate(json);
        res.json(result);
    } catch (error: any) {
        console.error("Template validation error:", error);
        res.status(500).json({ error: "Validation failed" });
    }
});

// Mock upload endpoint for now, or real if we want to save
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
    // Save templates to the templates directory
    try {
        if (!req.file) return res.status(400).json({ error: "No file provided" });

        const content = req.file.buffer.toString("utf-8");
        
        // Check if it's a binary file (DOCX, ZIP, etc.) - these start with "PK"
        if (content.startsWith("PK") || req.file.mimetype?.includes("zip") || 
            req.file.originalname?.endsWith(".docx") || req.file.originalname?.endsWith(".xlsx")) {
            return res.status(400).json({ 
                error: "Invalid file type. Please upload a JSON template file, not a DOCX or other binary file.",
                hint: "Template files should be .json files containing the PSUR template structure."
            });
        }
        
        let json;
        try {
            json = JSON.parse(content);
        } catch (parseError) {
            return res.status(400).json({ 
                error: "Invalid JSON format. The file could not be parsed as JSON.",
                hint: "Ensure the file is a valid JSON template file."
            });
        }
        
        const result = validateTemplate(json);

        if (!result.valid) {
            return res.status(400).json({ error: "Invalid template", details: result.errors });
        }

        // Determine template ID and name based on type
        let templateId: string;
        let templateName: string;
        let jurisdictions: string[] = [];
        
        if (result.templateType === 'form-based') {
            // Form-based template
            templateId = json.form?.form_id || `form_${Date.now()}`;
            templateName = json.form?.form_title || "Custom PSUR Form";
            jurisdictions = ["EU_MDR"]; // Default jurisdiction for form templates
        } else {
            // Slot-based template
            templateId = json.template_id;
            templateName = json.name;
            jurisdictions = json.jurisdiction_scope || [];
        }

        // Save the template to disk
        const templatesDir = path.resolve(process.cwd(), "server", "templates");
        if (!fs.existsSync(templatesDir)) {
            fs.mkdirSync(templatesDir, { recursive: true });
        }
        
        const safeFileName = templateId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filePath = path.join(templatesDir, `${safeFileName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
        
        console.log(`[Templates] Saved ${result.templateType} template: ${filePath}`);

        res.json({
            success: true,
            templateId,
            name: templateName,
            jurisdictions,
            templateType: result.templateType,
            savedTo: filePath
        });
    } catch (error: any) {
        res.status(500).json({ error: "Upload failed: " + error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE MANAGEMENT ROUTES
// State-of-the-art template management with GRKB grounding
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/templates/list
 * List all available templates with metadata
 */
router.get("/list", async (req: Request, res: Response) => {
    try {
        const templates = listTemplatesWithMetadata();
        res.json({
            success: true,
            count: templates.length,
            templates,
        });
    } catch (error: any) {
        console.error("[Templates] List error:", error);
        res.status(500).json({ error: "Failed to list templates: " + error.message });
    }
});

/**
 * GET /api/templates/:templateId
 * Get a specific template with its slot definitions and GRKB mappings
 */
router.get("/:templateId", async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;

        // Check if form-based or slot-based
        const isForm = isTemplateFormBased(templateId);
        
        let template: any;
        if (isForm) {
            template = loadFormTemplate(templateId);
        } else {
            template = loadTemplate(templateId);
        }

        // Get slot definitions from DB
        const slots = await db
            .select()
            .from(slotDefinitions)
            .where(eq(slotDefinitions.templateId, templateId));

        // Get obligation mappings
        const obligationMappings = await db
            .select()
            .from(slotObligationLinks)
            .where(eq(slotObligationLinks.templateId, templateId));

        // Get related GRKB obligations
        const obligationIds = [...new Set(obligationMappings.map(m => m.obligationId))];
        let obligations: any[] = [];
        if (obligationIds.length > 0) {
            obligations = await db
                .select()
                .from(grkbObligations)
                .where(eq(grkbObligations.obligationId, obligationIds[0])); // TODO: Use inArray when multiple
        }

        res.json({
            success: true,
            template,
            templateType: isForm ? "form-based" : "slot-based",
            slots,
            obligationMappings,
            obligations,
        });
    } catch (error: any) {
        console.error("[Templates] Get template error:", error);
        res.status(500).json({ error: "Failed to get template: " + error.message });
    }
});

/**
 * POST /api/templates/process
 * Full template processing with GRKB grounding and agent instruction updates
 * 
 * Accepts:
 * - template: JSON template file (required)
 * - slotMappingGuide: Optional slot mapping guide JSON
 * - formattingGuide: Optional formatting guide JSON
 */
router.post("/process", upload.fields([
    { name: "template", maxCount: 1 },
    { name: "slotMappingGuide", maxCount: 1 },
    { name: "formattingGuide", maxCount: 1 },
]), async (req: Request, res: Response) => {
    try {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        
        if (!files?.template?.[0]) {
            return res.status(400).json({ error: "Template file is required" });
        }

        const templateFile = files.template[0];
        let templateJson: any;

        // Check if DOCX or JSON
        if (templateFile.originalname?.endsWith(".docx")) {
            // Parse DOCX to extract structure
            const parseResult = await docxTemplateParser.parseFromBuffer(
                templateFile.buffer,
                templateFile.originalname
            );

            if (!parseResult.success) {
                return res.status(400).json({
                    error: "Failed to parse DOCX template",
                    details: parseResult.errors,
                });
            }

            // Convert parsed DOCX to a form-based template structure
            templateJson = {
                form: {
                    form_id: path.basename(templateFile.originalname, ".docx"),
                    form_title: parseResult.metadata.title || templateFile.originalname,
                    revision: "1.0",
                    sections: parseResult.sections.map(s => ({
                        section_id: s.id,
                        title: s.title,
                        type: s.type,
                        content: s.content,
                    })),
                },
                parsedSlots: parseResult.slots,
                parsedTables: parseResult.tables,
                parsedFormFields: parseResult.formFields,
            };
        } else {
            // Parse JSON template
            const content = templateFile.buffer.toString("utf-8");
            try {
                templateJson = JSON.parse(content);
            } catch (e) {
                return res.status(400).json({ error: "Invalid JSON format in template file" });
            }
        }

        // Parse optional guides
        let slotMappingGuide: SlotMappingGuide | undefined;
        let formattingGuide: FormattingGuide | undefined;

        if (files?.slotMappingGuide?.[0]) {
            try {
                slotMappingGuide = JSON.parse(files.slotMappingGuide[0].buffer.toString("utf-8"));
            } catch (e) {
                return res.status(400).json({ error: "Invalid JSON format in slot mapping guide" });
            }
        }

        if (files?.formattingGuide?.[0]) {
            try {
                formattingGuide = JSON.parse(files.formattingGuide[0].buffer.toString("utf-8"));
            } catch (e) {
                return res.status(400).json({ error: "Invalid JSON format in formatting guide" });
            }
        }

        // Get options from request body
        const jurisdictions = req.body.jurisdictions 
            ? (typeof req.body.jurisdictions === "string" 
                ? JSON.parse(req.body.jurisdictions) 
                : req.body.jurisdictions)
            : ["EU_MDR", "UK_MDR"];
        
        const updateAgentInstructions = req.body.updateAgentInstructions !== "false";

        // Process template
        const service = new TemplateManagementService();
        const result = await service.processTemplate(templateJson, {
            slotMappingGuide,
            formattingGuide,
            jurisdictions,
            updateAgentInstructions,
        });

        res.json({
            success: result.success,
            templateId: result.templateId,
            templateType: result.templateType,
            savedTo: result.savedTo,
            slotCount: result.slotCount,
            grounding: {
                totalSlots: result.groundingResult.totalSlots,
                groundedSlots: result.groundingResult.groundedSlots,
                ungroundedSlots: result.groundingResult.ungroundedSlots,
                mdcgCompliance: result.groundingResult.mdcgCompliance,
                complianceGaps: result.groundingResult.complianceGaps,
            },
            agentUpdates: result.agentUpdates.map(u => ({
                agentKey: u.agentKey,
                category: u.category,
                version: u.version,
                reason: u.reason,
            })),
            traceId: result.traceId,
            errors: result.errors,
            warnings: result.warnings,
        });
    } catch (error: any) {
        console.error("[Templates] Process error:", error);
        res.status(500).json({ error: "Template processing failed: " + error.message });
    }
});

/**
 * POST /api/templates/analyze
 * Analyze a template without saving - preview grounding results
 */
router.post("/analyze", upload.fields([
    { name: "template", maxCount: 1 },
    { name: "slotMappingGuide", maxCount: 1 },
]), async (req: Request, res: Response) => {
    try {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        
        if (!files?.template?.[0]) {
            return res.status(400).json({ error: "Template file is required" });
        }

        const templateFile = files.template[0];
        let templateJson: any;

        if (templateFile.originalname?.endsWith(".docx")) {
            const parseResult = await docxTemplateParser.parseFromBuffer(
                templateFile.buffer,
                templateFile.originalname
            );
            
            if (!parseResult.success) {
                return res.status(400).json({
                    error: "Failed to parse DOCX",
                    details: parseResult.errors,
                });
            }

            res.json({
                success: true,
                type: "docx",
                filename: templateFile.originalname,
                contentHash: parseResult.contentHash,
                sections: parseResult.sections,
                tables: parseResult.tables,
                formFields: parseResult.formFields,
                slots: parseResult.slots,
                metadata: parseResult.metadata,
                warnings: parseResult.warnings,
            });
            return;
        }

        // Parse JSON
        const content = templateFile.buffer.toString("utf-8");
        try {
            templateJson = JSON.parse(content);
        } catch (e) {
            return res.status(400).json({ error: "Invalid JSON format" });
        }

        // Parse optional slot mapping guide
        let slotMappingGuide: SlotMappingGuide | undefined;
        if (files?.slotMappingGuide?.[0]) {
            try {
                slotMappingGuide = JSON.parse(files.slotMappingGuide[0].buffer.toString("utf-8"));
            } catch (e) {
                return res.status(400).json({ error: "Invalid slot mapping guide JSON" });
            }
        }

        const jurisdictions = req.body.jurisdictions 
            ? JSON.parse(req.body.jurisdictions) 
            : ["EU_MDR", "UK_MDR"];

        const service = new TemplateManagementService();
        const analysis = await service.analyzeTemplate(templateJson, slotMappingGuide, jurisdictions);

        res.json({
            success: true,
            type: "json",
            templateType: analysis.templateType,
            slots: analysis.slots,
            grounding: analysis.groundingPreview,
        });
    } catch (error: any) {
        console.error("[Templates] Analyze error:", error);
        res.status(500).json({ error: "Analysis failed: " + error.message });
    }
});

/**
 * GET /api/templates/:templateId/slots
 * Get all slot definitions for a template with GRKB obligation details
 */
router.get("/:templateId/slots", async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;

        // Get slot definitions
        const slots = await db
            .select()
            .from(slotDefinitions)
            .where(eq(slotDefinitions.templateId, templateId))
            .orderBy(slotDefinitions.sortOrder);

        // Get obligation mappings with full obligation details
        const slotsWithObligations = await Promise.all(
            slots.map(async (slot) => {
                const links = await db
                    .select()
                    .from(slotObligationLinks)
                    .where(
                        and(
                            eq(slotObligationLinks.templateId, templateId),
                            eq(slotObligationLinks.slotId, slot.slotId)
                        )
                    );

                const obligationDetails = await Promise.all(
                    links.map(async (link) => {
                        const [obl] = await db
                            .select()
                            .from(grkbObligations)
                            .where(eq(grkbObligations.obligationId, link.obligationId));
                        return {
                            ...link,
                            obligation: obl || null,
                        };
                    })
                );

                return {
                    ...slot,
                    obligations: obligationDetails,
                };
            })
        );

        res.json({
            success: true,
            templateId,
            slotCount: slots.length,
            slots: slotsWithObligations,
        });
    } catch (error: any) {
        console.error("[Templates] Get slots error:", error);
        res.status(500).json({ error: "Failed to get slots: " + error.message });
    }
});

/**
 * GET /api/templates/:templateId/grounding
 * Get GRKB grounding report for a template
 */
router.get("/:templateId/grounding", async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;

        // Get slot definitions
        const slots = await db
            .select()
            .from(slotDefinitions)
            .where(eq(slotDefinitions.templateId, templateId));

        // Get obligation links
        const links = await db
            .select()
            .from(slotObligationLinks)
            .where(eq(slotObligationLinks.templateId, templateId));

        // Get unique obligations
        const obligationIds = [...new Set(links.map(l => l.obligationId))];
        
        // Calculate grounding stats
        const groundedSlots = new Set(links.map(l => l.slotId));
        const ungroundedSlots = slots.filter(s => !groundedSlots.has(s.slotId));

        // Get trace entries for this template
        const traces = await db
            .select()
            .from(decisionTraceEntries)
            .where(eq(decisionTraceEntries.templateId, templateId))
            .orderBy(desc(decisionTraceEntries.eventTimestamp))
            .limit(50);

        res.json({
            success: true,
            templateId,
            summary: {
                totalSlots: slots.length,
                groundedSlots: groundedSlots.size,
                ungroundedSlots: ungroundedSlots.length,
                totalObligations: obligationIds.length,
                groundingRate: slots.length > 0 
                    ? Math.round((groundedSlots.size / slots.length) * 100) 
                    : 0,
            },
            ungroundedSlotIds: ungroundedSlots.map(s => s.slotId),
            obligationLinks: links,
            recentTraces: traces,
        });
    } catch (error: any) {
        console.error("[Templates] Get grounding error:", error);
        res.status(500).json({ error: "Failed to get grounding: " + error.message });
    }
});

/**
 * GET /api/templates/:templateId/agent-instructions
 * Get agent instructions related to a template
 */
router.get("/:templateId/agent-instructions", async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;

        // Get all system instructions
        const instructions = await db
            .select()
            .from(systemInstructions);

        // Filter those that reference this template
        const templateInstructions = instructions.filter(
            i => i.template.includes(templateId) || i.key.includes("TEMPLATE")
        );

        res.json({
            success: true,
            templateId,
            instructions: templateInstructions,
        });
    } catch (error: any) {
        console.error("[Templates] Get agent instructions error:", error);
        res.status(500).json({ error: "Failed to get agent instructions: " + error.message });
    }
});

/**
 * POST /api/templates/:templateId/reground
 * Re-run GRKB grounding for an existing template
 */
router.post("/:templateId/reground", async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;
        const { jurisdictions = ["EU_MDR", "UK_MDR"] } = req.body;

        // Load the template
        const isForm = isTemplateFormBased(templateId);
        let template: any;
        
        if (isForm) {
            template = loadFormTemplate(templateId);
        } else {
            template = loadTemplate(templateId);
        }

        // Process with new grounding
        const service = new TemplateManagementService();
        const result = await service.processTemplate(template, {
            jurisdictions,
            updateAgentInstructions: false, // Don't update agent instructions on reground
        });

        res.json({
            success: result.success,
            grounding: {
                totalSlots: result.groundingResult.totalSlots,
                groundedSlots: result.groundingResult.groundedSlots,
                ungroundedSlots: result.groundingResult.ungroundedSlots,
                mdcgCompliance: result.groundingResult.mdcgCompliance,
            },
            traceId: result.traceId,
            errors: result.errors,
            warnings: result.warnings,
        });
    } catch (error: any) {
        console.error("[Templates] Reground error:", error);
        res.status(500).json({ error: "Reground failed: " + error.message });
    }
});

/**
 * DELETE /api/templates/:templateId
 * Delete a template and its associated data
 */
router.delete("/:templateId", async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;

        // Delete from disk
        const templatesDir = path.resolve(process.cwd(), "server", "templates");
        const safeFileName = templateId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const filePath = path.join(templatesDir, `${safeFileName}.json`);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete slot definitions
        await db
            .delete(slotDefinitions)
            .where(eq(slotDefinitions.templateId, templateId));

        // Delete obligation links
        await db
            .delete(slotObligationLinks)
            .where(eq(slotObligationLinks.templateId, templateId));

        res.json({
            success: true,
            message: `Template ${templateId} deleted successfully`,
        });
    } catch (error: any) {
        console.error("[Templates] Delete error:", error);
        res.status(500).json({ error: "Delete failed: " + error.message });
    }
});

export default router;

