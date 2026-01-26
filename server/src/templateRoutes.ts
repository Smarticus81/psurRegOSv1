
import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { 
  validateTemplate, 
  TemplateValidationResult, 
  listTemplatesWithMetadata, 
  listAllTemplatesWithMetadata,
  loadTemplate, 
  isTemplateFormBased, 
  loadFormTemplate,
  BASE_TEMPLATE_IDS,
  DEFAULT_TEMPLATE_ID,
  isBaseTemplate,
  getDefaultTemplate,
} from "./templateStore";
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
  templates,
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

// Upload endpoint - saves template to database and filesystem
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
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
        let templateVersion: string;
        let jurisdictions: string[] = [];
        
        if (result.templateType === 'form-based') {
            // Form-based template
            templateId = json.form?.form_id || `form_${Date.now()}`;
            templateName = json.form?.form_title || "Custom PSUR Form";
            templateVersion = json.form?.revision || "1.0";
            jurisdictions = ["EU_MDR"]; // Default jurisdiction for form templates
        } else {
            // Slot-based template
            templateId = json.template_id;
            templateName = json.name;
            templateVersion = json.version || "1.0";
            jurisdictions = json.jurisdiction_scope || [];
        }

        // Save to database (primary storage)
        try {
            await db.insert(templates).values({
                templateId,
                name: templateName,
                version: templateVersion,
                jurisdictions,
                templateType: result.templateType,
                templateJson: json,
            }).onConflictDoUpdate({
                target: templates.templateId,
                set: {
                    name: templateName,
                    version: templateVersion,
                    jurisdictions,
                    templateType: result.templateType,
                    templateJson: json,
                    updatedAt: new Date(),
                },
            });

            console.log(`[Templates] Saved ${result.templateType} template to database: ${templateId}`);
        } catch (dbError: any) {
            console.error(`[Templates] Failed to save to database:`, dbError);
            return res.status(500).json({ error: "Failed to save template to database: " + dbError.message });
        }

        // Also save to filesystem for backward compatibility
        try {
            const templatesDir = path.resolve(process.cwd(), "server", "templates");
            if (!fs.existsSync(templatesDir)) {
                fs.mkdirSync(templatesDir, { recursive: true });
            }
            
            const safeFileName = templateId.replace(/[^a-zA-Z0-9_-]/g, '_');
            const filePath = path.join(templatesDir, `${safeFileName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
            
            console.log(`[Templates] Also saved ${result.templateType} template to filesystem: ${filePath}`);
        } catch (fsError) {
            console.warn(`[Templates] Failed to save to filesystem (non-critical):`, fsError);
        }

        res.json({
            success: true,
            templateId,
            name: templateName,
            version: templateVersion,
            jurisdictions,
            templateType: result.templateType,
            savedToDb: true,
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
 * List CUSTOM templates only (excludes MDCG base templates)
 * For template selection dropdowns in the UI
 */
router.get("/list", async (req: Request, res: Response) => {
    try {
        const templatesList = await listTemplatesWithMetadata();
        res.json({
            success: true,
            count: templatesList.length,
            templates: templatesList,
            // Include info about the default template
            defaultTemplate: {
                templateId: DEFAULT_TEMPLATE_ID,
                name: "MDCG 2022-21 Annex I (Official EU Standard)",
                description: "The official EU template for PSURs. Used automatically when no custom template is selected.",
            }
        });
    } catch (error: any) {
        console.error("[Templates] List error:", error);
        res.status(500).json({ error: "Failed to list templates: " + error.message });
    }
});

/**
 * GET /api/templates/all
 * List ALL templates including MDCG base templates
 * For admin views and debugging
 */
router.get("/all", async (req: Request, res: Response) => {
    try {
        const templatesList = await listAllTemplatesWithMetadata();
        res.json({
            success: true,
            count: templatesList.length,
            templates: templatesList,
            baseTemplates: BASE_TEMPLATE_IDS,
            defaultTemplateId: DEFAULT_TEMPLATE_ID,
        });
    } catch (error: any) {
        console.error("[Templates] List all error:", error);
        res.status(500).json({ error: "Failed to list templates: " + error.message });
    }
});

/**
 * GET /api/templates/default
 * Get the default MDCG 2022-21 Annex I template
 * This is the base layer used when no custom template is selected
 */
router.get("/default", async (req: Request, res: Response) => {
    try {
        const template = await getDefaultTemplate();
        if (!template) {
            return res.status(404).json({ 
                error: "Default template not found",
                templateId: DEFAULT_TEMPLATE_ID,
            });
        }
        res.json({
            success: true,
            template,
            templateId: DEFAULT_TEMPLATE_ID,
            isBase: true,
            description: "MDCG 2022-21 Annex I is the official EU template for PSURs and provides 100% coverage of MDR Article 86 requirements.",
        });
    } catch (error: any) {
        console.error("[Templates] Default template error:", error);
        res.status(500).json({ error: "Failed to load default template: " + error.message });
    }
});

/**
 * GET /api/templates/base
 * List all base MDCG templates (not for selection, but for reference)
 */
router.get("/base", async (req: Request, res: Response) => {
    try {
        const allTemplates = await listAllTemplatesWithMetadata();
        const baseTemplates = allTemplates.filter(t => isBaseTemplate(t.templateId));
        res.json({
            success: true,
            baseTemplates,
            defaultTemplateId: DEFAULT_TEMPLATE_ID,
            description: "These are the official MDCG 2022-21 templates that form the regulatory foundation layer.",
        });
    } catch (error: any) {
        console.error("[Templates] Base templates error:", error);
        res.status(500).json({ error: "Failed to list base templates: " + error.message });
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
        const isForm = await isTemplateFormBased(templateId);
        
        let template: any;
        if (isForm) {
            template = await loadFormTemplate(templateId);
        } else {
            template = await loadTemplate(templateId);
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
            complianceAudit: result.complianceAudit ? {
                overallScore: result.complianceAudit.overallComplianceScore,
                warnings: result.complianceAudit.warnings.length,
                criticalWarnings: result.complianceAudit.warnings.filter(w => w.level === "CRITICAL").length,
                recommendations: result.complianceAudit.recommendations.slice(0, 5), // Top 5
            } : null,
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
 * GET /api/templates/:templateId/compliance
 * Get Annex I compliance audit report for a template
 */
router.get("/:templateId/compliance", async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;

        // Get template from database
        const [template] = await db
            .select()
            .from(templates)
            .where(eq(templates.templateId, templateId));

        if (!template) {
            return res.status(404).json({ error: "Template not found" });
        }

        // Return stored compliance audit if available
        if (template.complianceAudit) {
            return res.json({
                success: true,
                templateId,
                audit: template.complianceAudit,
                cached: true,
            });
        }

        // Run fresh audit if not cached
        const { createAnnexIComplianceAuditor } = await import("./services/annexIComplianceAuditor");
        const auditor = createAnnexIComplianceAuditor();
        const audit = await auditor.auditTemplate(template.templateJson as any);

        // Save to database
        await db
            .update(templates)
            .set({ complianceAudit: audit as any })
            .where(eq(templates.templateId, templateId));

        res.json({
            success: true,
            templateId,
            audit,
            cached: false,
        });
    } catch (error: any) {
        console.error("[Templates] Compliance audit error:", error);
        res.status(500).json({ error: "Failed to get compliance audit: " + error.message });
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
        const isForm = await isTemplateFormBased(templateId);
        let template: any;
        
        if (isForm) {
            template = await loadFormTemplate(templateId);
        } else {
            template = await loadTemplate(templateId);
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
 * POST /api/templates/:templateId/validate-mdcg
 * Validate template against MDCG 2022-21 Annex II, III, and IV requirements
 * 
 * Uses LLM-powered validation for comprehensive compliance checking
 */
router.post("/:templateId/validate-mdcg", async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;
        const { 
            deviceClass = "Class IIb",
            isImplantable = false,
            isLegacy = false,
        } = req.body;

        // Import MDCG validation service dynamically
        const { createMDCGValidationService, createMDCGEnhancedGroundingEngine } = await import("./services/grkbGroundingService");
        const { createMDCGValidationService: createMDCGService } = await import("./services/mdcgValidationService");

        const deviceClassification = {
            deviceClass: deviceClass as "Class I" | "Class IIa" | "Class IIb" | "Class III" | "Custom",
            isImplantable,
            isLegacy,
        };

        // Get slot definitions
        const slots = await db
            .select()
            .from(slotDefinitions)
            .where(eq(slotDefinitions.templateId, templateId));

        if (slots.length === 0) {
            return res.status(404).json({ 
                error: "No slots found for template. Process the template first.",
                templateId 
            });
        }

        // Get MDCG validation service
        const mdcgService = createMDCGService();
        
        // Get device requirements
        const deviceRequirements = mdcgService.getRequirementsForDevice(deviceClassification);

        // Extract evidence types from slots
        const evidenceTypes = [...new Set(slots.flatMap(s => 
            (s.requiredEvidenceTypes as string[]) || []
        ))];

        // Validate against Annex II
        const annexIIResult = await mdcgService.validateAnnexII(
            templateId,
            deviceClassification,
            slots.map(s => s.slotId),
            evidenceTypes
        );

        // LLM-powered template mapping validation
        const mappingValidation = await mdcgService.validateTemplateMappingWithLLM(
            templateId,
            slots.map(s => ({
                slotId: s.slotId,
                title: s.title,
                description: s.description || undefined,
                evidenceTypes: (s.requiredEvidenceTypes as string[]) || [],
            })),
            deviceClassification
        );

        // Calculate overall compliance
        const overallScore = Math.round(
            (annexIIResult.score * 0.4) + 
            (mappingValidation.score * 0.4) +
            (mappingValidation.annexCompliance.annexIV * 0.2)
        );

        const status = overallScore >= 80 ? "PASS" : overallScore >= 50 ? "WARNING" : "FAIL";

        res.json({
            success: true,
            templateId,
            deviceClassification,
            deviceRequirements,
            overallScore,
            status,
            annexII: {
                score: annexIIResult.score,
                valid: annexIIResult.valid,
                tablesCovered: annexIIResult.tablesCovered,
                tablesMissing: annexIIResult.tablesMissing,
                imdrfCodingValid: annexIIResult.imdrfCodingValid,
                imdrfIssues: annexIIResult.imdrfIssues,
                regionalSplitValid: annexIIResult.regionalSplitValid,
                temporalComparisonValid: annexIIResult.temporalComparisonValid,
            },
            annexIII: {
                score: mappingValidation.annexCompliance.annexIII,
            },
            annexIV: {
                score: mappingValidation.annexCompliance.annexIV,
                frequency: deviceRequirements.frequency,
                eudamedRequired: deviceRequirements.eudamedSubmission,
                mandatoryTables: deviceRequirements.mandatoryTables,
                timeBuckets: deviceRequirements.timeBuckets,
            },
            mappingIssues: mappingValidation.mappingIssues,
            suggestions: mappingValidation.suggestions,
            traceId: annexIIResult.traceId,
        });
    } catch (error: any) {
        console.error("[Templates] MDCG validation error:", error);
        res.status(500).json({ error: "MDCG validation failed: " + error.message });
    }
});

/**
 * GET /api/templates/mdcg-requirements/:deviceClass
 * Get PSUR requirements for a specific device classification
 */
router.get("/mdcg-requirements/:deviceClass", async (req: Request, res: Response) => {
    try {
        const { deviceClass } = req.params;
        const isImplantable = req.query.implantable === "true";
        const isLegacy = req.query.legacy === "true";

        const { createMDCGValidationService } = await import("./services/mdcgValidationService");

        const deviceClassification = {
            deviceClass: deviceClass as "Class I" | "Class IIa" | "Class IIb" | "Class III" | "Custom",
            isImplantable,
            isLegacy,
        };

        const mdcgService = createMDCGValidationService();
        const requirements = mdcgService.getRequirementsForDevice(deviceClassification);

        res.json({
            success: true,
            deviceClassification,
            requirements,
            description: `PSUR requirements for ${deviceClass}${isImplantable ? " implantable" : ""} device per MDCG 2022-21 Annex IV`,
        });
    } catch (error: any) {
        console.error("[Templates] Get MDCG requirements error:", error);
        res.status(500).json({ error: "Failed to get requirements: " + error.message });
    }
});

/**
 * GET /api/templates/debug/list-all
 * Debug endpoint: List all templates in database with their types
 */
router.get("/debug/list-all", async (req: Request, res: Response) => {
    try {
        const allTemplates = await db.select({
            templateId: templates.templateId,
            name: templates.name,
            version: templates.version,
            templateType: templates.templateType,
            jurisdictions: templates.jurisdictions,
            createdAt: templates.createdAt,
            updatedAt: templates.updatedAt,
        }).from(templates);

        res.json({
            success: true,
            count: allTemplates.length,
            templates: allTemplates,
        });
    } catch (error: any) {
        console.error("[Templates] Debug list error:", error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/templates/debug/purge-all
 * Debug endpoint: Delete ALL templates from database (use with caution!)
 */
router.delete("/debug/purge-all", async (req: Request, res: Response) => {
    try {
        console.log("[Templates] PURGING ALL TEMPLATES FROM DATABASE");
        
        // Delete all slot obligation links
        const deletedLinks = await db.delete(slotObligationLinks).returning();
        console.log(`[Templates] Deleted ${deletedLinks.length} slot obligation links`);
        
        // Delete all slot definitions
        const deletedSlots = await db.delete(slotDefinitions).returning();
        console.log(`[Templates] Deleted ${deletedSlots.length} slot definitions`);
        
        // Delete all templates
        const deletedTemplates = await db.delete(templates).returning();
        console.log(`[Templates] Deleted ${deletedTemplates.length} templates`);
        
        res.json({
            success: true,
            message: "All templates purged from database",
            deleted: {
                templates: deletedTemplates.length,
                slotDefinitions: deletedSlots.length,
                obligationLinks: deletedLinks.length,
            },
        });
    } catch (error: any) {
        console.error("[Templates] Purge error:", error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/templates/:templateId
 * Delete a template and its associated data
 */
router.delete("/:templateId", async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;

        console.log(`[Templates] Deleting template: ${templateId}`);

        // Delete from disk
        const templatesDir = path.resolve(process.cwd(), "server", "templates");
        const safeFileName = templateId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const filePath = path.join(templatesDir, `${safeFileName}.json`);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[Templates] Deleted file: ${filePath}`);
        }

        // Delete slot definitions
        const deletedSlots = await db
            .delete(slotDefinitions)
            .where(eq(slotDefinitions.templateId, templateId))
            .returning();
        console.log(`[Templates] Deleted ${deletedSlots.length} slot definitions`);

        // Delete obligation links
        const deletedLinks = await db
            .delete(slotObligationLinks)
            .where(eq(slotObligationLinks.templateId, templateId))
            .returning();
        console.log(`[Templates] Deleted ${deletedLinks.length} obligation links`);

        // Delete the template record itself from the templates table
        const deletedTemplates = await db
            .delete(templates)
            .where(eq(templates.templateId, templateId))
            .returning();
        console.log(`[Templates] Deleted ${deletedTemplates.length} template record(s)`);

        res.json({
            success: true,
            message: `Template ${templateId} deleted successfully`,
            deleted: {
                templateRecords: deletedTemplates.length,
                slotDefinitions: deletedSlots.length,
                obligationLinks: deletedLinks.length,
            },
        });
    } catch (error: any) {
        console.error("[Templates] Delete error:", error);
        res.status(500).json({ error: "Delete failed: " + error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NEO4J MDCG GRAPH ROUTES
// State-of-the-art graph database queries for MDCG 2022-21 compliance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/templates/neo4j/health
 * Check Neo4j connection health
 */
router.get("/neo4j/health", async (req: Request, res: Response) => {
    try {
        const { neo4jHealthCheck } = await import("./services/neo4jGrkbService");
        const healthy = await neo4jHealthCheck();
        
        res.json({
            success: true,
            neo4jAvailable: healthy,
            message: healthy 
                ? "Neo4j graph database is connected and operational" 
                : "Neo4j is not available - graph features disabled",
        });
    } catch (error: any) {
        res.json({
            success: false,
            neo4jAvailable: false,
            error: error.message,
        });
    }
});

/**
 * GET /api/templates/neo4j/stats
 * Get MDCG graph statistics for compliance dashboard
 */
router.get("/neo4j/stats", async (req: Request, res: Response) => {
    try {
        const { getMDCGGraphStats } = await import("./services/neo4jGrkbService");
        const stats = await getMDCGGraphStats();
        
        res.json({
            success: true,
            stats,
            description: "MDCG 2022-21 graph database statistics",
        });
    } catch (error: any) {
        console.error("[Templates] Neo4j stats error:", error);
        res.status(500).json({ error: "Failed to get graph stats: " + error.message });
    }
});

/**
 * GET /api/templates/neo4j/annexes
 * Get all MDCG 2022-21 Annex templates from the graph
 */
router.get("/neo4j/annexes", async (req: Request, res: Response) => {
    try {
        const { getMDCGAnnexes } = await import("./services/neo4jGrkbService");
        const annexes = await getMDCGAnnexes();
        
        res.json({
            success: true,
            annexes,
            count: annexes.length,
            description: "MDCG 2022-21 Annex I, II, III, IV templates",
        });
    } catch (error: any) {
        console.error("[Templates] Neo4j annexes error:", error);
        res.status(500).json({ error: "Failed to get annexes: " + error.message });
    }
});

/**
 * GET /api/templates/neo4j/device-requirements/:deviceClass
 * Get device requirements from Annex IV
 */
router.get("/neo4j/device-requirements/:deviceClass", async (req: Request, res: Response) => {
    try {
        const { deviceClass } = req.params;
        const isImplantable = req.query.implantable === "true";
        
        const { getDeviceRequirements } = await import("./services/neo4jGrkbService");
        const requirements = await getDeviceRequirements(deviceClass, isImplantable);
        
        if (!requirements) {
            return res.status(404).json({ 
                error: `No requirements found for device class: ${deviceClass}`,
                hint: "Run the Neo4j seed script to populate MDCG data: npx tsx server/scripts/seed-neo4j-mdcg.ts"
            });
        }
        
        res.json({
            success: true,
            requirements,
            deviceClass,
            isImplantable,
        });
    } catch (error: any) {
        console.error("[Templates] Neo4j device requirements error:", error);
        res.status(500).json({ error: "Failed to get device requirements: " + error.message });
    }
});

/**
 * GET /api/templates/neo4j/annex-ii-tables
 * Get all Annex II mandatory tables
 */
router.get("/neo4j/annex-ii-tables", async (req: Request, res: Response) => {
    try {
        const { getAnnexIITables } = await import("./services/neo4jGrkbService");
        const tables = await getAnnexIITables();
        
        res.json({
            success: true,
            tables,
            count: tables.length,
            description: "MDCG 2022-21 Annex II mandatory table definitions",
        });
    } catch (error: any) {
        console.error("[Templates] Neo4j Annex II tables error:", error);
        res.status(500).json({ error: "Failed to get Annex II tables: " + error.message });
    }
});

/**
 * GET /api/templates/neo4j/annex-ii-tables/:deviceClass
 * Get mandatory tables for a specific device class
 */
router.get("/neo4j/annex-ii-tables/:deviceClass", async (req: Request, res: Response) => {
    try {
        const { deviceClass } = req.params;
        const isImplantable = req.query.implantable === "true";
        
        const { getMandatoryTablesForDevice } = await import("./services/neo4jGrkbService");
        const tables = await getMandatoryTablesForDevice(deviceClass, isImplantable);
        
        res.json({
            success: true,
            deviceClass,
            isImplantable,
            tables,
            count: tables.length,
            description: `Mandatory Annex II tables for ${deviceClass}${isImplantable ? " implantable" : ""} devices`,
        });
    } catch (error: any) {
        console.error("[Templates] Neo4j device tables error:", error);
        res.status(500).json({ error: "Failed to get device tables: " + error.message });
    }
});

/**
 * GET /api/templates/neo4j/annex-iii/validation-rules
 * Get Annex III validation rules
 */
router.get("/neo4j/annex-iii/validation-rules", async (req: Request, res: Response) => {
    try {
        const { getAnnexIIIValidationRules } = await import("./services/neo4jGrkbService");
        const rules = await getAnnexIIIValidationRules();
        
        res.json({
            success: true,
            rules,
            count: rules.length,
            description: "MDCG 2022-21 Annex III validation checklist rules",
        });
    } catch (error: any) {
        console.error("[Templates] Neo4j Annex III rules error:", error);
        res.status(500).json({ error: "Failed to get validation rules: " + error.message });
    }
});

/**
 * GET /api/templates/neo4j/annex-iii/assessment-rules
 * Get Annex III assessment rules
 */
router.get("/neo4j/annex-iii/assessment-rules", async (req: Request, res: Response) => {
    try {
        const { getAnnexIIIAssessmentRules } = await import("./services/neo4jGrkbService");
        const rules = await getAnnexIIIAssessmentRules();
        
        res.json({
            success: true,
            rules,
            count: rules.length,
            description: "MDCG 2022-21 Annex III assessment rules for data evaluation",
        });
    } catch (error: any) {
        console.error("[Templates] Neo4j Annex III assessment error:", error);
        res.status(500).json({ error: "Failed to get assessment rules: " + error.message });
    }
});

/**
 * GET /api/templates/neo4j/compliance-graph/:templateId
 * Get full compliance graph for a template
 */
router.get("/neo4j/compliance-graph/:templateId", async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;
        
        const { getMDCGComplianceGraph } = await import("./services/neo4jGrkbService");
        const graph = await getMDCGComplianceGraph(templateId);
        
        res.json({
            success: true,
            templateId,
            graph,
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
            description: `MDCG compliance graph for template ${templateId}`,
        });
    } catch (error: any) {
        console.error("[Templates] Neo4j compliance graph error:", error);
        res.status(500).json({ error: "Failed to get compliance graph: " + error.message });
    }
});

/**
 * GET /api/templates/neo4j/obligations/:tableKey
 * Get obligations linked to a specific Annex II table
 */
router.get("/neo4j/obligations/:tableKey", async (req: Request, res: Response) => {
    try {
        const { tableKey } = req.params;
        
        const { getObligationsForAnnexIITable } = await import("./services/neo4jGrkbService");
        const obligations = await getObligationsForAnnexIITable(tableKey);
        
        res.json({
            success: true,
            tableKey,
            obligations,
            count: obligations.length,
            description: `Regulatory obligations satisfied by Annex II table: ${tableKey}`,
        });
    } catch (error: any) {
        console.error("[Templates] Neo4j table obligations error:", error);
        res.status(500).json({ error: "Failed to get table obligations: " + error.message });
    }
});

/**
 * POST /api/templates/neo4j/validate-psur
 * Validate a PSUR against MDCG requirements in the graph
 */
router.post("/neo4j/validate-psur", async (req: Request, res: Response) => {
    try {
        const { 
            templateId,
            deviceClass,
            isImplantable = false,
            availableEvidenceTypes = [],
        } = req.body;

        if (!templateId || !deviceClass) {
            return res.status(400).json({ 
                error: "templateId and deviceClass are required",
            });
        }

        const { validatePSURAgainstMDCG } = await import("./services/neo4jGrkbService");
        const result = await validatePSURAgainstMDCG(
            templateId,
            deviceClass,
            isImplantable,
            availableEvidenceTypes
        );
        
        res.json({
            success: true,
            templateId,
            deviceClass,
            isImplantable,
            validation: result,
            status: result.valid ? "PASS" : "FAIL",
            description: result.valid 
                ? "PSUR meets MDCG 2022-21 requirements" 
                : `PSUR has ${result.missingTables.length} missing tables and ${result.missingEvidenceTypes.length} missing evidence types`,
        });
    } catch (error: any) {
        console.error("[Templates] Neo4j PSUR validation error:", error);
        res.status(500).json({ error: "PSUR validation failed: " + error.message });
    }
});

/**
 * GET /api/templates/neo4j/coverage/:templateId
 * Get template coverage statistics from the graph
 */
router.get("/neo4j/coverage/:templateId", async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;
        const jurisdictions = req.query.jurisdictions 
            ? (req.query.jurisdictions as string).split(",")
            : ["EU_MDR", "UK_MDR"];
        
        const { getTemplateCoverageStats } = await import("./services/neo4jGrkbService");
        const stats = await getTemplateCoverageStats(templateId, jurisdictions);
        
        res.json({
            success: true,
            templateId,
            jurisdictions,
            coverage: stats,
            description: `Obligation coverage statistics for template ${templateId}`,
        });
    } catch (error: any) {
        console.error("[Templates] Neo4j coverage error:", error);
        res.status(500).json({ error: "Failed to get coverage stats: " + error.message });
    }
});

export default router;

