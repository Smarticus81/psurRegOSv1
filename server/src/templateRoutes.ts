
import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { validateTemplate, TemplateValidationResult } from "./templateStore";
import { isFormBasedTemplate } from "./templates/formTemplateSchema";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

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

export default router;
