
import { Router, Request, Response } from "express";
import multer from "multer";
import { validateTemplate, TemplateValidationResult } from "./templateStore";

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
    // In a real implementation, we would save this to the templates directory
    // For now, we return success and the parsed ID so the frontend can "use" it as a custom template
    try {
        if (!req.file) return res.status(400).json({ error: "No file provided" });

        const content = req.file.buffer.toString("utf-8");
        const json = JSON.parse(content);
        const result = validateTemplate(json);

        if (!result.valid) {
            return res.status(400).json({ error: "Invalid template", details: result.errors });
        }

        // Return the template ID so frontend can set it
        res.json({
            success: true,
            templateId: json.template_id,
            name: json.name,
            jurisdictions: json.jurisdiction_scope || []
        });
    } catch (error: any) {
        res.status(500).json({ error: "Upload failed: " + error.message });
    }
});

export default router;
