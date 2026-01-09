import type { Express } from "express";
import { createServer, type Server } from "http";
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

  ensureOrchestratorInitialized().catch(console.error);

  return httpServer;
}
