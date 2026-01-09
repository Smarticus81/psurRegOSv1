import type { Express } from "express";
import { createServer, type Server } from "http";
import { createHash } from "crypto";
import multer from "multer";
import * as fs from "node:fs";
import * as path from "node:path";
import { storage } from "./storage";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { 
  insertCompanySchema, 
  insertDeviceSchema, 
  insertPsurItemSchema,
  insertDataSourceSchema,
  insertAgentExecutionSchema,
  insertGeneratedDocumentSchema,
  insertPsurCaseSchema,
  insertEvidenceAtomSchema,
  insertSlotProposalSchema,
  insertCoverageReportSchema,
  insertAuditBundleSchema,
} from "@shared/schema";
import {
  ensureOrchestratorInitialized,
  getOrchestratorStatus,
  listObligations,
  listConstraints,
  qualifyTemplate,
  compileCombinedDsl,
} from "./orchestrator";
import { buildCoverageSlotQueue } from "./queue-builder";
import { parseEvidenceFile, createEvidenceAtomBatch } from "./evidence-parser";
import { 
  computeFileSha256, 
  computeContentHash, 
  generateAtomId,
  validateEvidenceAtomPayload,
  buildEvidenceAtom,
  hasSchemaFor,
  type ProvenanceInput
} from "./schema-validator";
import { EVIDENCE_DEFINITIONS } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  registerObjectStorageRoutes(app);

  app.get("/api/companies", async (req, res) => {
    try {
      const companies = await storage.getCompanies();
      res.json(companies);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const company = await storage.getCompany(id);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });

  app.post("/api/companies", async (req, res) => {
    try {
      const parsed = insertCompanySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const company = await storage.createCompany(parsed.data);
      res.status(201).json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to create company" });
    }
  });

  app.patch("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const company = await storage.updateCompany(id, req.body);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to update company" });
    }
  });

  app.delete("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteCompany(id);
      if (!deleted) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete company" });
    }
  });

  app.get("/api/devices", async (req, res) => {
    try {
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      const devices = companyId 
        ? await storage.getDevicesByCompany(companyId)
        : await storage.getDevices();
      res.json(devices);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch devices" });
    }
  });

  app.get("/api/devices/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const device = await storage.getDevice(id);
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }
      res.json(device);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch device" });
    }
  });

  app.post("/api/devices", async (req, res) => {
    try {
      const parsed = insertDeviceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const device = await storage.createDevice(parsed.data);
      res.status(201).json(device);
    } catch (error) {
      res.status(500).json({ error: "Failed to create device" });
    }
  });

  app.patch("/api/devices/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const device = await storage.updateDevice(id, req.body);
      if (!device) {
        return res.status(404).json({ error: "Device not found" });
      }
      res.json(device);
    } catch (error) {
      res.status(500).json({ error: "Failed to update device" });
    }
  });

  app.delete("/api/devices/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteDevice(id);
      if (!deleted) {
        return res.status(404).json({ error: "Device not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete device" });
    }
  });

  app.get("/api/psur-items", async (req, res) => {
    try {
      const deviceId = req.query.deviceId ? parseInt(req.query.deviceId as string) : undefined;
      const items = deviceId 
        ? await storage.getPSURItemsByDevice(deviceId)
        : await storage.getPSURItems();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch PSUR items" });
    }
  });

  app.post("/api/psur-items", async (req, res) => {
    try {
      const parsed = insertPsurItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const item = await storage.createPSURItem(parsed.data);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to create PSUR item" });
    }
  });

  app.patch("/api/psur-items/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const item = await storage.updatePSURItem(id, req.body);
      if (!item) {
        return res.status(404).json({ error: "PSUR item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to update PSUR item" });
    }
  });

  app.get("/api/data-sources", async (req, res) => {
    try {
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      const sources = companyId 
        ? await storage.getDataSourcesByCompany(companyId)
        : await storage.getDataSources();
      res.json(sources);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch data sources" });
    }
  });

  app.post("/api/data-sources", async (req, res) => {
    try {
      const parsed = insertDataSourceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const source = await storage.createDataSource(parsed.data);
      res.status(201).json(source);
    } catch (error) {
      res.status(500).json({ error: "Failed to create data source" });
    }
  });

  app.post("/api/data-sources/complete-upload", async (req, res) => {
    try {
      const { companyId, type, fileName, objectPath } = req.body;

      if (!companyId || isNaN(parseInt(companyId))) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      if (!type) {
        return res.status(400).json({ error: "Data type is required" });
      }

      if (!objectPath) {
        return res.status(400).json({ error: "Object path is required" });
      }

      const company = await storage.getCompany(parseInt(companyId));
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const dataSource = await storage.createDataSource({
        companyId: parseInt(companyId),
        name: fileName || "Uploaded file",
        type,
        filePath: objectPath,
        recordCount: 0,
        lastUpdated: new Date(),
      });

      await storage.createAuditEvent({
        entityType: 'data_source',
        entityId: dataSource.id,
        action: 'create',
        actor: 'system',
        newData: { fileName, type, companyId, objectPath },
      });

      res.status(201).json(dataSource);
    } catch (error) {
      console.error("Upload complete error:", error);
      res.status(500).json({ error: "Failed to complete upload" });
    }
  });

  app.patch("/api/data-sources/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const source = await storage.updateDataSource(id, req.body);
      if (!source) {
        return res.status(404).json({ error: "Data source not found" });
      }
      res.json(source);
    } catch (error) {
      res.status(500).json({ error: "Failed to update data source" });
    }
  });

  app.delete("/api/data-sources/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteDataSource(id);
      if (!deleted) {
        return res.status(404).json({ error: "Data source not found" });
      }

      await storage.createAuditEvent({
        entityType: 'data_source',
        entityId: id,
        action: 'delete',
        actor: 'system',
      });

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete data source" });
    }
  });

  app.get("/api/agent-executions", async (req, res) => {
    try {
      const executions = await storage.getAgentExecutions();
      res.json(executions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch agent executions" });
    }
  });

  app.get("/api/agent-executions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const execution = await storage.getAgentExecution(id);
      if (!execution) {
        return res.status(404).json({ error: "Agent execution not found" });
      }
      res.json(execution);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch agent execution" });
    }
  });

  app.post("/api/agent-executions", async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.startPeriod && typeof body.startPeriod === "string") {
        body.startPeriod = new Date(body.startPeriod);
      }
      if (body.endPeriod && typeof body.endPeriod === "string") {
        body.endPeriod = new Date(body.endPeriod);
      }
      if (body.startedAt && typeof body.startedAt === "string") {
        body.startedAt = new Date(body.startedAt);
      }
      if (body.completedAt && typeof body.completedAt === "string") {
        body.completedAt = new Date(body.completedAt);
      }
      const parsed = insertAgentExecutionSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const execution = await storage.createAgentExecution(parsed.data);
      res.status(201).json(execution);
    } catch (error) {
      res.status(500).json({ error: "Failed to create agent execution" });
    }
  });

  app.patch("/api/agent-executions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const execution = await storage.updateAgentExecution(id, req.body);
      if (!execution) {
        return res.status(404).json({ error: "Agent execution not found" });
      }
      res.json(execution);
    } catch (error) {
      res.status(500).json({ error: "Failed to update agent execution" });
    }
  });

  app.get("/api/documents", async (req, res) => {
    try {
      const documents = await storage.getDocuments();
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const doc = await storage.getDocument(id);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(doc);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.post("/api/documents", async (req, res) => {
    try {
      const parsed = insertGeneratedDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const doc = await storage.createDocument(parsed.data);
      res.status(201).json(doc);
    } catch (error) {
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  app.get("/api/documents/:id/download", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const doc = await storage.getDocument(id);
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      if (!doc.filePath) {
        return res.status(404).json({ error: "Document file not available" });
      }
      
      // Check if filePath is a URL (object storage) or local path
      if (doc.filePath.startsWith("http")) {
        res.redirect(doc.filePath);
      } else {
        const fullPath = path.resolve(doc.filePath);
        
        if (!fs.existsSync(fullPath)) {
          return res.status(404).json({ error: "Document file not found on disk" });
        }
        
        res.setHeader("Content-Disposition", `attachment; filename="${doc.title || "document"}.pdf"`);
        res.setHeader("Content-Type", "application/pdf");
        fs.createReadStream(fullPath).pipe(res);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to download document" });
    }
  });

  app.get("/api/grkb", async (req, res) => {
    try {
      const regulation = req.query.regulation as string | undefined;
      const category = req.query.category as string | undefined;
      const entries = await storage.getGRKBEntries(regulation, category);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch GRKB entries" });
    }
  });

  app.get("/api/audit-events", async (req, res) => {
    try {
      const entityType = req.query.entityType as string | undefined;
      const entityId = req.query.entityId ? parseInt(req.query.entityId as string) : undefined;
      const events = await storage.getAuditEvents(entityType, entityId);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch audit events" });
    }
  });

  app.get("/api/orchestrator/status", async (req, res) => {
    try {
      const status = await getOrchestratorStatus();
      res.json(status.data);
    } catch (error) {
      res.status(500).json({ error: "Failed to get orchestrator status" });
    }
  });

  app.post("/api/orchestrator/initialize", async (req, res) => {
    try {
      const success = await ensureOrchestratorInitialized();
      res.json({ success, message: success ? "Compliance kernel initialized" : "Failed to initialize" });
    } catch (error) {
      res.status(500).json({ error: "Failed to initialize orchestrator" });
    }
  });

  app.get("/api/orchestrator/obligations", async (req, res) => {
    try {
      const result = await listObligations();
      if (result.success) {
        res.json(result.data);
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to list obligations" });
    }
  });

  app.get("/api/orchestrator/constraints", async (req, res) => {
    try {
      const result = await listConstraints();
      if (result.success) {
        res.json(result.data);
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to list constraints" });
    }
  });

  app.post("/api/orchestrator/compile", async (req, res) => {
    try {
      const result = await compileCombinedDsl();
      if (result.success) {
        res.json(result.data);
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to compile DSL" });
    }
  });

  app.post("/api/orchestrator/qualify", async (req, res) => {
    try {
      const { templateId } = req.body;
      if (!templateId) {
        return res.status(400).json({ error: "Template ID required" });
      }
      const result = await qualifyTemplate(templateId);
      if (result.success) {
        res.json(result.data);
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to qualify template" });
    }
  });

  // ============== PSUR CASES ==============
  app.get("/api/psur-cases", async (req, res) => {
    try {
      const cases = await storage.getPSURCases();
      res.json(cases);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch PSUR cases" });
    }
  });

  app.get("/api/psur-cases/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const psurCase = await storage.getPSURCase(id);
      if (!psurCase) {
        return res.status(404).json({ error: "PSUR case not found" });
      }
      res.json(psurCase);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch PSUR case" });
    }
  });

  app.post("/api/psur-cases", async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.startPeriod && typeof body.startPeriod === "string") {
        body.startPeriod = new Date(body.startPeriod);
      }
      if (body.endPeriod && typeof body.endPeriod === "string") {
        body.endPeriod = new Date(body.endPeriod);
      }
      const parsed = insertPsurCaseSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const psurCase = await storage.createPSURCase(parsed.data);
      res.status(201).json(psurCase);
    } catch (error) {
      res.status(500).json({ error: "Failed to create PSUR case" });
    }
  });

  app.patch("/api/psur-cases/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const psurCase = await storage.updatePSURCase(id, req.body);
      if (!psurCase) {
        return res.status(404).json({ error: "PSUR case not found" });
      }
      res.json(psurCase);
    } catch (error) {
      res.status(500).json({ error: "Failed to update PSUR case" });
    }
  });

  // ============== EVIDENCE UPLOADS ==============
  app.get("/api/evidence/uploads", async (req, res) => {
    try {
      const psurCaseId = req.query.psurCaseId ? parseInt(req.query.psurCaseId as string) : undefined;
      const uploads = await storage.getEvidenceUploads(psurCaseId);
      res.json(uploads);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch evidence uploads" });
    }
  });

  app.get("/api/evidence/uploads/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const upload = await storage.getEvidenceUpload(id);
      if (!upload) {
        return res.status(404).json({ error: "Evidence upload not found" });
      }
      res.json(upload);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch evidence upload" });
    }
  });

  app.post("/api/evidence/upload", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { evidence_type, device_scope_id, psur_case_id, source_system, extraction_notes, period_start, period_end, device_code } = req.body;

      if (!evidence_type) {
        return res.status(400).json({ error: "evidence_type is required" });
      }

      if (!hasSchemaFor(evidence_type)) {
        return res.status(400).json({ 
          error: `Unsupported evidence_type: ${evidence_type}. Supported types: sales_volume, complaint_record` 
        });
      }

      const fileContent = file.buffer.toString("utf-8");
      const sourceFileSha256 = computeFileSha256(file.buffer);

      const evidenceUpload = await storage.createEvidenceUpload({
        filename: `${Date.now()}_${file.originalname}`,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        sha256Hash: sourceFileSha256,
        evidenceType: evidence_type,
        deviceScopeId: device_scope_id ? parseInt(device_scope_id) : null,
        psurCaseId: psur_case_id ? parseInt(psur_case_id) : null,
        uploadedBy: "system",
        sourceSystem: source_system || "manual_upload",
        extractionNotes: extraction_notes || null,
        periodStart: period_start ? new Date(period_start) : null,
        periodEnd: period_end ? new Date(period_end) : null,
        status: "processing",
        storagePath: null,
      });

      const provenance: ProvenanceInput = {
        sourceSystem: source_system || "manual_upload",
        sourceFile: file.originalname,
        sourceFileSha256,
        uploadId: evidenceUpload.id,
        uploadedAt: new Date().toISOString(),
        uploadedBy: "system",
        parserVersion: "1.0.0",
        extractionTimestamp: new Date().toISOString(),
      };

      const parseResult = parseEvidenceFile(fileContent, evidence_type, {
        periodStart: period_start,
        periodEnd: period_end,
      });

      if (!parseResult.success) {
        await storage.updateEvidenceUpload(evidenceUpload.id, {
          status: "failed",
          processingErrors: { errors: parseResult.errors },
        });
        return res.status(400).json({
          error: "Failed to parse file",
          details: parseResult.errors,
          upload: evidenceUpload,
        });
      }

      const validAtoms: any[] = [];
      const rejectedRecords: Array<{ rowIndex: number; errors: Array<{ path: string; message: string }> }> = [];

      for (const record of parseResult.records) {
        if (!record.isValid || !record.normalizedData) {
          rejectedRecords.push({ 
            rowIndex: record.rowIndex, 
            errors: record.validationErrors.map(e => ({ path: "/", message: e }))
          });
          continue;
        }

        const normalizedPayload = record.normalizedData as Record<string, unknown>;
        const deviceCodeFromData = normalizedPayload.deviceCode as string | undefined;
        
        const { atom, errors } = buildEvidenceAtom(
          {
            atomType: evidence_type,
            payload: normalizedPayload,
            deviceRef: device_code || deviceCodeFromData ? {
              deviceCode: (device_code || deviceCodeFromData) as string,
              deviceId: device_scope_id ? parseInt(device_scope_id) : undefined,
            } : undefined,
            psurPeriod: period_start && period_end ? {
              psurCaseId: psur_case_id ? parseInt(psur_case_id) : undefined,
              periodStart: period_start,
              periodEnd: period_end,
            } : undefined,
          },
          provenance
        );

        if (errors.length > 0) {
          rejectedRecords.push({ rowIndex: record.rowIndex, errors });
        } else {
          validAtoms.push({
            atomId: atom.atomId,
            psurCaseId: psur_case_id ? parseInt(psur_case_id) : null,
            uploadId: evidenceUpload.id,
            evidenceType: evidence_type,
            sourceSystem: source_system || "manual_upload",
            extractDate: new Date(),
            contentHash: atom.contentHash,
            recordCount: 1,
            periodStart: period_start ? new Date(period_start) : null,
            periodEnd: period_end ? new Date(period_end) : null,
            deviceScopeId: device_scope_id ? parseInt(device_scope_id) : null,
            deviceRef: atom.deviceRef || null,
            data: record.data,
            normalizedData: normalizedPayload,
            provenance: {
              ...provenance,
              atomId: atom.atomId,
              version: atom.version,
              deviceRef: atom.deviceRef,
              psurPeriod: atom.psurPeriod,
            },
            validationErrors: null,
            status: "valid",
            version: 1,
          });
        }
      }

      if (rejectedRecords.length > 0 && validAtoms.length === 0) {
        await storage.updateEvidenceUpload(evidenceUpload.id, {
          status: "rejected",
          recordsParsed: parseResult.records.length,
          recordsRejected: rejectedRecords.length,
          processingErrors: { 
            schemaValidationFailed: true,
            rejectedRecords: rejectedRecords.slice(0, 10),
          },
          processedAt: new Date(),
        });
        return res.status(400).json({
          error: "All records failed schema validation",
          rejectedCount: rejectedRecords.length,
          sampleErrors: rejectedRecords.slice(0, 3),
          upload: await storage.getEvidenceUpload(evidenceUpload.id),
        });
      }

      const createdAtoms = validAtoms.length > 0 
        ? await storage.createEvidenceAtomsBatch(validAtoms)
        : [];

      await storage.updateEvidenceUpload(evidenceUpload.id, {
        status: validAtoms.length > 0 ? "completed" : "rejected",
        atomsCreated: createdAtoms.length,
        recordsParsed: parseResult.records.length,
        recordsRejected: rejectedRecords.length,
        processingErrors: rejectedRecords.length > 0 ? {
          schemaValidationFailed: true,
          rejectedRecords: rejectedRecords.slice(0, 10),
        } : null,
        processedAt: new Date(),
      });

      const updatedUpload = await storage.getEvidenceUpload(evidenceUpload.id);

      res.status(201).json({
        upload: updatedUpload,
        summary: {
          totalRecords: parseResult.records.length,
          validRecords: validAtoms.length,
          rejectedRecords: rejectedRecords.length,
          atomsCreated: createdAtoms.length,
          sourceFileSha256,
        },
        atoms: createdAtoms,
        validationErrors: rejectedRecords.length > 0 ? rejectedRecords.slice(0, 5) : undefined,
      });
    } catch (error) {
      console.error("Evidence upload error:", error);
      res.status(500).json({ error: "Failed to process evidence upload" });
    }
  });

  app.get("/api/evidence", async (req, res) => {
    try {
      const psurCaseId = req.query.psurCaseId ? parseInt(req.query.psurCaseId as string) : undefined;
      const evidenceType = req.query.evidenceType as string | undefined;
      const periodStart = req.query.periodStart ? new Date(req.query.periodStart as string) : undefined;
      const periodEnd = req.query.periodEnd ? new Date(req.query.periodEnd as string) : undefined;
      
      let atoms;
      if (evidenceType) {
        atoms = await storage.getEvidenceAtomsByType(evidenceType, psurCaseId);
      } else {
        atoms = await storage.getEvidenceAtoms(psurCaseId);
      }

      const mandatoryTypes = EVIDENCE_DEFINITIONS
        .filter(d => d.tier <= 2 && !d.isAggregated)
        .map(d => d.type);
      
      const typeCoverage: Record<string, { 
        count: number; 
        inPeriod: number;
        outOfPeriod: number;
        periodStart: Date | null; 
        periodEnd: Date | null;
        label: string;
        tier: number;
      }> = {};
      
      for (const def of EVIDENCE_DEFINITIONS) {
        typeCoverage[def.type] = { 
          count: 0, 
          inPeriod: 0, 
          outOfPeriod: 0, 
          periodStart: null, 
          periodEnd: null,
          label: def.label,
          tier: def.tier
        };
      }

      for (const atom of atoms) {
        if (!typeCoverage[atom.evidenceType]) {
          const def = EVIDENCE_DEFINITIONS.find(d => d.type === atom.evidenceType);
          typeCoverage[atom.evidenceType] = { 
            count: 0, 
            inPeriod: 0, 
            outOfPeriod: 0, 
            periodStart: null, 
            periodEnd: null,
            label: def?.label || atom.evidenceType,
            tier: def?.tier || 0
          };
        }
        typeCoverage[atom.evidenceType].count++;

        if (periodStart && periodEnd && atom.periodStart && atom.periodEnd) {
          const atomStart = new Date(atom.periodStart);
          const atomEnd = new Date(atom.periodEnd);
          const overlaps = atomStart <= periodEnd && atomEnd >= periodStart;
          if (overlaps) {
            typeCoverage[atom.evidenceType].inPeriod++;
          } else {
            typeCoverage[atom.evidenceType].outOfPeriod++;
          }
        } else {
          typeCoverage[atom.evidenceType].inPeriod++;
        }

        if (atom.periodStart) {
          const start = new Date(atom.periodStart);
          if (!typeCoverage[atom.evidenceType].periodStart || start < typeCoverage[atom.evidenceType].periodStart!) {
            typeCoverage[atom.evidenceType].periodStart = start;
          }
        }
        if (atom.periodEnd) {
          const end = new Date(atom.periodEnd);
          if (!typeCoverage[atom.evidenceType].periodEnd || end > typeCoverage[atom.evidenceType].periodEnd!) {
            typeCoverage[atom.evidenceType].periodEnd = end;
          }
        }
      }

      const presentTypes = Object.keys(typeCoverage).filter(t => typeCoverage[t].count > 0);
      const missingMandatoryTypes = mandatoryTypes.filter(t => !presentTypes.includes(t));
      
      const coverageSummary = {
        totalAtoms: atoms.length,
        uniqueTypes: presentTypes.length,
        missingMandatoryTypes,
        ready: missingMandatoryTypes.length === 0 && atoms.length > 0,
        reportingPeriod: periodStart && periodEnd ? { start: periodStart, end: periodEnd } : null,
      };

      res.json({
        atoms,
        totalCount: atoms.length,
        coverageByType: typeCoverage,
        coverageSummary,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch evidence" });
    }
  });

  app.get("/api/evidence/coverage", async (req, res) => {
    try {
      const psurCaseId = req.query.psurCaseId ? parseInt(req.query.psurCaseId as string) : undefined;
      const periodStart = req.query.periodStart ? new Date(req.query.periodStart as string) : undefined;
      const periodEnd = req.query.periodEnd ? new Date(req.query.periodEnd as string) : undefined;

      const allAtoms = await storage.getEvidenceAtoms(psurCaseId);
      
      const mandatoryTypes = ["sales_volume", "complaint_record", "incident_record"];
      const coverageByType: Record<string, {
        count: number;
        inPeriod: number;
        outOfPeriod: number;
        periodCoverage: { start: Date | null; end: Date | null };
      }> = {};

      for (const type of mandatoryTypes) {
        coverageByType[type] = { count: 0, inPeriod: 0, outOfPeriod: 0, periodCoverage: { start: null, end: null } };
      }

      for (const atom of allAtoms) {
        if (!coverageByType[atom.evidenceType]) {
          coverageByType[atom.evidenceType] = { count: 0, inPeriod: 0, outOfPeriod: 0, periodCoverage: { start: null, end: null } };
        }
        
        coverageByType[atom.evidenceType].count++;

        if (periodStart && periodEnd && atom.periodStart && atom.periodEnd) {
          const atomStart = new Date(atom.periodStart);
          const atomEnd = new Date(atom.periodEnd);
          if (atomStart >= periodStart && atomEnd <= periodEnd) {
            coverageByType[atom.evidenceType].inPeriod++;
          } else {
            coverageByType[atom.evidenceType].outOfPeriod++;
          }
        }

        if (atom.periodStart) {
          const start = new Date(atom.periodStart);
          if (!coverageByType[atom.evidenceType].periodCoverage.start || start < coverageByType[atom.evidenceType].periodCoverage.start!) {
            coverageByType[atom.evidenceType].periodCoverage.start = start;
          }
        }
        if (atom.periodEnd) {
          const end = new Date(atom.periodEnd);
          if (!coverageByType[atom.evidenceType].periodCoverage.end || end > coverageByType[atom.evidenceType].periodCoverage.end!) {
            coverageByType[atom.evidenceType].periodCoverage.end = end;
          }
        }
      }

      const missingMandatory = mandatoryTypes.filter(type => coverageByType[type].count === 0);

      let deviceMatchRate = 1.0;
      if (psurCaseId) {
        const psurCase = await storage.getPSURCase(psurCaseId);
        if (psurCase && psurCase.leadingDeviceId) {
          const matchedAtoms = allAtoms.filter(a => a.deviceScopeId === psurCase.leadingDeviceId);
          deviceMatchRate = allAtoms.length > 0 ? matchedAtoms.length / allAtoms.length : 0;
        }
      }

      res.json({
        psurCaseId,
        reportingPeriod: periodStart && periodEnd ? { start: periodStart, end: periodEnd } : null,
        coverageByType,
        missingMandatoryTypes: missingMandatory,
        totalAtoms: allAtoms.length,
        deviceMatchRate,
        ready: missingMandatory.length === 0,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to compute evidence coverage" });
    }
  });

  // ============== EVIDENCE ATOMS ==============
  app.get("/api/evidence-atoms", async (req, res) => {
    try {
      const psurCaseId = req.query.psurCaseId ? parseInt(req.query.psurCaseId as string) : undefined;
      const atoms = await storage.getEvidenceAtoms(psurCaseId);
      res.json(atoms);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch evidence atoms" });
    }
  });

  app.post("/api/evidence-atoms", async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.extractDate && typeof body.extractDate === "string") {
        body.extractDate = new Date(body.extractDate);
      }
      if (body.periodStart && typeof body.periodStart === "string") {
        body.periodStart = new Date(body.periodStart);
      }
      if (body.periodEnd && typeof body.periodEnd === "string") {
        body.periodEnd = new Date(body.periodEnd);
      }
      const parsed = insertEvidenceAtomSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const atom = await storage.createEvidenceAtom(parsed.data);
      res.status(201).json(atom);
    } catch (error) {
      res.status(500).json({ error: "Failed to create evidence atom" });
    }
  });

  // ============== SLOT PROPOSALS ==============
  app.get("/api/slot-proposals", async (req, res) => {
    try {
      const psurCaseId = req.query.psurCaseId ? parseInt(req.query.psurCaseId as string) : undefined;
      const proposals = await storage.getSlotProposals(psurCaseId);
      res.json(proposals);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch slot proposals" });
    }
  });

  app.post("/api/slot-proposals", async (req, res) => {
    try {
      const parsed = insertSlotProposalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const proposal = await storage.createSlotProposal(parsed.data);
      res.status(201).json(proposal);
    } catch (error) {
      res.status(500).json({ error: "Failed to create slot proposal" });
    }
  });

  app.patch("/api/slot-proposals/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const proposal = await storage.updateSlotProposal(id, req.body);
      if (!proposal) {
        return res.status(404).json({ error: "Slot proposal not found" });
      }
      res.json(proposal);
    } catch (error) {
      res.status(500).json({ error: "Failed to update slot proposal" });
    }
  });

  // ============== COVERAGE REPORTS ==============
  app.get("/api/coverage-reports", async (req, res) => {
    try {
      const psurCaseId = req.query.psurCaseId ? parseInt(req.query.psurCaseId as string) : undefined;
      const reports = await storage.getCoverageReports(psurCaseId);
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch coverage reports" });
    }
  });

  app.post("/api/coverage-reports", async (req, res) => {
    try {
      const parsed = insertCoverageReportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const report = await storage.createCoverageReport(parsed.data);
      res.status(201).json(report);
    } catch (error) {
      res.status(500).json({ error: "Failed to create coverage report" });
    }
  });

  // ============== AUDIT BUNDLES ==============
  app.get("/api/audit-bundles", async (req, res) => {
    try {
      const psurCaseId = req.query.psurCaseId ? parseInt(req.query.psurCaseId as string) : undefined;
      const bundles = await storage.getAuditBundles(psurCaseId);
      res.json(bundles);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch audit bundles" });
    }
  });

  app.post("/api/audit-bundles", async (req, res) => {
    try {
      const parsed = insertAuditBundleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }
      const bundle = await storage.createAuditBundle(parsed.data);
      res.status(201).json(bundle);
    } catch (error) {
      res.status(500).json({ error: "Failed to create audit bundle" });
    }
  });

  // ============== COVERAGE SLOT QUEUE ==============
  app.get("/api/coverage-slot-queues", async (req, res) => {
    try {
      const psurCaseId = req.query.psurCaseId ? parseInt(req.query.psurCaseId as string) : undefined;
      const queues = await storage.getCoverageSlotQueues(psurCaseId);
      res.json(queues);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch coverage slot queues" });
    }
  });

  app.get("/api/coverage-slot-queues/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const queue = await storage.getCoverageSlotQueue(id);
      if (!queue) {
        return res.status(404).json({ error: "Coverage slot queue not found" });
      }
      res.json(queue);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch coverage slot queue" });
    }
  });

  app.post("/api/coverage-slot-queues/build", async (req, res) => {
    try {
      const { psurCaseId } = req.body;
      if (!psurCaseId) {
        return res.status(400).json({ error: "psurCaseId is required" });
      }
      
      const psurCase = await storage.getPSURCase(psurCaseId);
      if (!psurCase) {
        return res.status(404).json({ error: "PSUR case not found" });
      }
      
      const evidenceAtoms = await storage.getEvidenceAtoms(psurCaseId);
      const acceptedProposals = await storage.getSlotProposals(psurCaseId);
      
      const queueOutput = buildCoverageSlotQueue({
        psurReference: psurCase.psurReference,
        profileId: psurCase.templateId,
        jurisdictions: psurCase.jurisdictions || [],
        evidenceAtoms,
        acceptedProposals,
        periodStart: new Date(psurCase.startPeriod),
        periodEnd: new Date(psurCase.endPeriod),
      });
      
      const savedQueue = await storage.createCoverageSlotQueue({
        psurCaseId,
        psurReference: queueOutput.psurReference,
        profileId: queueOutput.profileId,
        mandatoryObligationsTotal: queueOutput.coverageSummary.mandatoryObligationsTotal,
        mandatoryObligationsSatisfied: queueOutput.coverageSummary.mandatoryObligationsSatisfied,
        mandatoryObligationsRemaining: queueOutput.coverageSummary.mandatoryObligationsRemaining,
        requiredSlotsTotal: queueOutput.coverageSummary.requiredSlotsTotal,
        requiredSlotsFilled: queueOutput.coverageSummary.requiredSlotsFilled,
        requiredSlotsRemaining: queueOutput.coverageSummary.requiredSlotsRemaining,
        queue: queueOutput.queue,
      });
      
      res.status(201).json({
        ...savedQueue,
        coverageSummary: queueOutput.coverageSummary,
      });
    } catch (error) {
      console.error("Failed to build coverage slot queue:", error);
      res.status(500).json({ error: "Failed to build coverage slot queue" });
    }
  });

  ensureOrchestratorInitialized().catch(console.error);

  return httpServer;
}
