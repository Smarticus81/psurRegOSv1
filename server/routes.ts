import type { Express } from "express";
import { createServer, type Server } from "http";
import { createHash } from "crypto";
import multer from "multer";
import * as fs from "node:fs";
import * as path from "node:path";
import { storage } from "./storage";
import { isDatabaseConnectionError } from "./db";

// ═══════════════════════════════════════════════════════════════════════════════
// PREVIEW CACHE - Fast in-memory cache for document previews
// ═══════════════════════════════════════════════════════════════════════════════
interface CachedPreview {
  html: string;
  generatedAt: number;
  expiresAt: number;
}
const previewCache = new Map<string, CachedPreview>();
const PREVIEW_CACHE_TTL = 60000; // 1 minute cache

// ═══════════════════════════════════════════════════════════════════════════════
// COMPILED DOCUMENT CACHE - Stores generated DOCX/PDF buffers to avoid re-generation
// ═══════════════════════════════════════════════════════════════════════════════
interface CachedDocument {
  docx?: Buffer;
  pdf?: Buffer;
  html?: string;
  pageCount: number;
  sectionCount: number;
  chartCount: number;
  contentHash: string;
  style: string;
  generatedAt: number;
  expiresAt: number;
}
const compiledDocumentCache = new Map<string, CachedDocument>();
const COMPILED_DOC_CACHE_TTL = 3600000; // 1 hour cache for compiled documents

export function cacheCompiledDocument(psurCaseId: number, style: string, doc: CachedDocument): void {
  const key = `${psurCaseId}:${style}`;
  compiledDocumentCache.set(key, {
    ...doc,
    generatedAt: Date.now(),
    expiresAt: Date.now() + COMPILED_DOC_CACHE_TTL,
  });
  console.log(`[DocumentCache] Cached compiled document for case ${psurCaseId} style ${style}`);
}

export function getCachedCompiledDocument(psurCaseId: number, style: string): CachedDocument | null {
  const key = `${psurCaseId}:${style}`;
  const cached = compiledDocumentCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached;
  }
  compiledDocumentCache.delete(key);
  return null;
}

export function invalidateCompiledDocumentCache(psurCaseId: number): void {
  for (const key of compiledDocumentCache.keys()) {
    if (key.startsWith(`${psurCaseId}:`)) {
      compiledDocumentCache.delete(key);
    }
  }
}

// Live content cache - stores sections as they're generated for incremental preview
interface LiveContent {
  sections: Map<string, { title: string; content: string; status: "pending" | "generating" | "done" }>;
  lastUpdated: number;
  isGenerating: boolean;
}
const liveContentCache = new Map<number, LiveContent>();

export function initLiveContent(psurCaseId: number, slotIds: string[]): void {
  const sections = new Map<string, { title: string; content: string; status: "pending" | "generating" | "done" }>();
  for (const slotId of slotIds) {
    sections.set(slotId, { title: slotId, content: "", status: "pending" });
  }
  liveContentCache.set(psurCaseId, {
    sections,
    lastUpdated: Date.now(),
    isGenerating: true,
  });
}

export function updateLiveContent(psurCaseId: number, slotId: string, title: string, content: string, status: "pending" | "generating" | "done"): void {
  const live = liveContentCache.get(psurCaseId);
  if (live) {
    live.sections.set(slotId, { title, content, status });
    live.lastUpdated = Date.now();
  }
}

export function finishLiveContent(psurCaseId: number): void {
  const live = liveContentCache.get(psurCaseId);
  if (live) {
    live.isGenerating = false;
    live.lastUpdated = Date.now();
  }
}

export function getLiveContent(psurCaseId: number): LiveContent | null {
  return liveContentCache.get(psurCaseId) || null;
}

function getCachedPreview(psurCaseId: number, style: string): CachedPreview | null {
  const key = `${psurCaseId}:${style}`;
  const cached = previewCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached;
  }
  previewCache.delete(key);
  return null;
}

function setCachedPreview(psurCaseId: number, style: string, html: string): void {
  const key = `${psurCaseId}:${style}`;
  previewCache.set(key, {
    html,
    generatedAt: Date.now(),
    expiresAt: Date.now() + PREVIEW_CACHE_TTL,
  });
}

function invalidatePreviewCache(psurCaseId: number): void {
  for (const key of previewCache.keys()) {
    if (key.startsWith(`${psurCaseId}:`)) {
      previewCache.delete(key);
    }
  }
  // Also clear live content when cache is invalidated for new generation
  liveContentCache.delete(psurCaseId);
}

// Generate fast preview HTML without LLM calls (with optional live content)
function generateFastPreviewHTML(params: {
  psurCase: any;
  template: any;
  slots: any[];
  atomsByType: Record<string, number>;
  totalAtoms: number;
  documentStyle: string;
  liveContent?: LiveContent | null;
}): string {
  const { psurCase, template, slots, atomsByType, totalAtoms, documentStyle, liveContent } = params;

  const periodStart = psurCase.startPeriod instanceof Date
    ? psurCase.startPeriod.toISOString().split("T")[0]
    : String(psurCase.startPeriod).split("T")[0];
  const periodEnd = psurCase.endPeriod instanceof Date
    ? psurCase.endPeriod.toISOString().split("T")[0]
    : String(psurCase.endPeriod).split("T")[0];

  // Group slots by section
  const sections: { path: string; title: string; slots: any[] }[] = [];
  const sectionMap = new Map<string, any[]>();

  for (const slot of slots) {
    const parts = (slot.section_path || "").split(" > ");
    const sectionKey = parts.slice(0, 2).join(" > ");
    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, []);
    }
    sectionMap.get(sectionKey)!.push(slot);
  }

  sectionMap.forEach((slotList, path) => {
    sections.push({
      path,
      title: path.split(" > ").pop() || path,
      slots: slotList
    });
  });

  // Evidence summary
  const evidenceSummaryRows = Object.entries(atomsByType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([type, count]) => `<tr><td>${type.replace(/_/g, " ")}</td><td class="count">${count}</td></tr>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PSUR Preview - ${psurCase.psurReference}</title>
  <style>
    :root {
      --primary: #1e40af;
      --primary-light: #3b82f6;
      --success: #059669;
      --warning: #d97706;
      --bg: #f8fafc;
      --card: #ffffff;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    .header {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
      color: white;
      padding: 32px 40px;
    }
    .header h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
    .header .meta { opacity: 0.9; font-size: 14px; }
    .header .meta span { margin-right: 24px; }
    .container { max-width: 1200px; margin: 0 auto; padding: 32px 40px; }
    .status-bar {
      display: flex;
      gap: 16px;
      margin-bottom: 32px;
    }
    .status-card {
      flex: 1;
      background: var(--card);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .status-card .label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .status-card .value { font-size: 28px; font-weight: 700; color: var(--primary); margin-top: 4px; }
    .status-card .value.success { color: var(--success); }
    .section {
      background: var(--card);
      border-radius: 12px;
      margin-bottom: 16px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .section-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .section-number {
      width: 28px;
      height: 28px;
      background: var(--primary);
      color: white;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
    }
    .section-title { font-size: 16px; font-weight: 600; }
    .section-content { padding: 20px; }
    .slot-list { display: flex; flex-direction: column; gap: 8px; }
    .slot-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--bg);
      border-radius: 8px;
    }
    .slot-icon { color: var(--text-muted); }
    .slot-title { flex: 1; font-size: 14px; }
    .slot-type {
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 4px;
      background: var(--border);
      color: var(--text-muted);
      text-transform: uppercase;
    }
    .evidence-table {
      width: 100%;
      border-collapse: collapse;
    }
    .evidence-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }
    .evidence-table td:first-child { text-transform: capitalize; }
    .evidence-table td.count {
      text-align: right;
      font-weight: 600;
      color: var(--primary);
    }
    .slot-item { padding: 12px 16px; background: var(--bg); border-radius: 8px; margin-bottom: 8px; }
    .slot-item.done { border-left: 3px solid var(--success); }
    .slot-item.generating { border-left: 3px solid var(--warning); background: #fffbeb; }
    .slot-item.pending { border-left: 3px solid var(--border); }
    .slot-header { display: flex; align-items: center; gap: 12px; }
    .status-icon { flex-shrink: 0; }
    .status-icon.done { color: var(--success); }
    .status-icon.generating { color: var(--warning); animation: pulse 1.5s infinite; }
    .status-icon.pending { color: var(--text-muted); opacity: 0.5; }
    .slot-content { 
      margin-top: 12px; padding: 12px; background: white; border-radius: 6px; 
      font-size: 13px; color: var(--text-muted); line-height: 1.5; 
      border: 1px solid var(--border);
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spinning { animation: spin 2s linear infinite; }
    .preview-notice {
      text-align: center;
      padding: 40px;
      color: var(--text-muted);
      font-size: 14px;
    }
    .preview-notice svg { margin-bottom: 16px; opacity: 0.5; }
    .toc { margin-bottom: 32px; }
    .toc-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text-muted); }
    .toc-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .toc-item {
      font-size: 12px;
      padding: 6px 12px;
      background: var(--card);
      border-radius: 20px;
      border: 1px solid var(--border);
      color: var(--text);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Periodic Safety Update Report</h1>
    <div class="meta">
      <span>Reference: ${psurCase.psurReference}</span>
      <span>Period: ${periodStart} to ${periodEnd}</span>
      <span>Template: ${template.template_id || psurCase.templateId}</span>
    </div>
  </div>
  
  <div class="container">
    <div class="status-bar">
      <div class="status-card">
        <div class="label">Total Sections</div>
        <div class="value">${slots.length}</div>
      </div>
      <div class="status-card">
        <div class="label">Evidence Records</div>
        <div class="value success">${totalAtoms}</div>
      </div>
      <div class="status-card">
        <div class="label">Evidence Types</div>
        <div class="value">${Object.keys(atomsByType).length}</div>
      </div>
      <div class="status-card">
        <div class="label">Status</div>
        <div class="value" style="font-size: 16px; color: var(--warning);">Draft Preview</div>
      </div>
    </div>

    <div class="toc">
      <div class="toc-title">Document Sections</div>
      <div class="toc-list">
        ${sections.map((s, i) => `<span class="toc-item">${i + 1}. ${s.title}</span>`).join("")}
      </div>
    </div>

    <div class="section">
      <div class="section-header">
        <div class="section-number">i</div>
        <div class="section-title">Evidence Summary</div>
      </div>
      <div class="section-content">
        <table class="evidence-table">
          ${evidenceSummaryRows || "<tr><td colspan='2' style='text-align:center;color:var(--text-muted)'>No evidence uploaded yet</td></tr>"}
        </table>
      </div>
    </div>

    ${sections.map((section, sIndex) => {
    // Check if we have live content for any slots in this section
    const hasLiveContent = liveContent && section.slots.some(slot => {
      const live = liveContent.sections.get(slot.slot_id);
      return live && live.status === "done" && live.content;
    });

    return `
    <div class="section">
      <div class="section-header">
        <div class="section-number">${sIndex + 1}</div>
        <div class="section-title">${section.title}</div>
      </div>
      <div class="section-content">
        ${section.slots.map(slot => {
      const live = liveContent?.sections.get(slot.slot_id);
      const statusClass = live?.status === "done" ? "done" : live?.status === "generating" ? "generating" : "pending";
      const statusIcon = live?.status === "done"
        ? '<svg class="status-icon done" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        : live?.status === "generating"
          ? '<svg class="status-icon generating" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
          : '<svg class="status-icon pending" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';

      return `
          <div class="slot-item ${statusClass}">
            <div class="slot-header">
              ${statusIcon}
              <span class="slot-title">${slot.title}</span>
              <span class="slot-type">${slot.slot_kind || "narrative"}</span>
            </div>
            ${live?.content ? `<div class="slot-content">${live.content.substring(0, 500)}${live.content.length > 500 ? '...' : ''}</div>` : ''}
          </div>`;
    }).join("")}
      </div>
    </div>`;
  }).join("")}

    <div class="preview-notice">
      ${liveContent?.isGenerating
      ? `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="spinning">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          <p>Document generation in progress...</p>
          <p>Sections will appear as they are completed.</p>`
      : liveContent && !liveContent.isGenerating
        ? `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <p>Document generation complete.</p>
          <p>Click "Refresh" to see the final document.</p>`
        : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          <p>This is a preview of the PSUR structure.</p>
          <p>Full document content will be generated when the report is finalized.</p>`
    }
    </div>
  </div>
</body>
</html>`;
}
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
  orchestratorRunRequestSchema,
  CANONICAL_EVIDENCE_TYPES
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
import { parseFileBuffer, detectColumnMappings, applyColumnMapping } from "./file-parser";
import {
  computeFileSha256,
  computeContentHash,
  generateAtomId,
  validateEvidenceAtomPayload,
  buildEvidenceAtom,
  hasSchemaFor,
  validateSlotProposal,
  validateSlotProposalForAdjudication,
  validateWithAjv,
  type ProvenanceInput,
  type SlotProposalInput
} from "./schema-validator";
import {
  normalizeComplaintRecordRow,
  normalizeSalesVolumeRow,
} from "./evidence/normalize";
import { EVIDENCE_DEFINITIONS } from "@shared/schema";
import { loadTemplate, listTemplates, getTemplateDirsDebugInfo, getAllRequiredEvidenceTypes } from "./src/templateStore";
import { type EvidenceAtomData } from "./src/orchestrator/render/psurTableGenerator";
import {
  renderPsurFromTemplate,
  type Template,
  type SlotProposal as RendererSlotProposal,
  type PsurCase as RendererPsurCase,
  type QualificationReport,
} from "./src/orchestrator/render/templateRenderer";
import { normalizeEvidenceAtoms, normalizeSlotProposals } from "./src/normalizers";
import { strictParseEvidenceAtoms, strictParseSlotProposals } from "./src/strictGate";
import {
  coerceEvidenceType as coerceEvType,
  makeAtomId,
  makeContentHash,
  persistEvidenceAtoms,
  type EvidenceAtom as EvidenceAtomRecord,
} from "./src/services/evidenceStore";
import { startOrchestratorWorkflow, cancelOrchestratorWorkflow, getWorkflowResultForCase, getCachedWorkflowResult, attachRuntimeStream } from "./src/orchestrator/workflowRunner";
import {
  listGrkbEntries,
  getObligations as getGrkbObligations,
  getConstraints as getGrkbConstraints
} from "./src/services/grkbService";
import ingestionRoutes from "./src/parsers/ingestionRoutes";
import templateRoutes from "./src/templateRoutes";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Standard 400 error response helper
function badRequest(res: any, code: string, message: string, details?: any) {
  return res.status(400).json({
    error: "Bad Request",
    code,
    message,
    details: details ?? null,
  });
}

// Template-driven PSUR markdown generator
function generatePsurMarkdown(
  psurCase: any,
  evidenceAtoms: any[],
  proposals: any[],
  qualificationReport: any
): string {
  // Load the actual template
  let template: Template;
  try {
    template = loadTemplate(psurCase.templateId) as Template;
  } catch (e) {
    console.error("Failed to load template for PSUR rendering:", e);
    // Fallback to minimal output
    return `# PSUR ${psurCase.psurReference}\n\nError: Could not load template ${psurCase.templateId}`;
  }

  // Convert DB evidence atoms to the format expected by renderer
  const atomData: EvidenceAtomData[] = evidenceAtoms.map(a => ({
    atomId: a.atomId,
    evidenceType: a.evidenceType,
    normalizedData: a.normalizedData || a.data,
    provenance: a.provenance,
  }));

  // Convert proposals to renderer format
  const rendererProposals: RendererSlotProposal[] = proposals.map(p => ({
    slotId: p.slotId,
    status: p.status,
    evidenceAtomIds: p.evidenceAtomIds,
    claimedObligationIds: p.claimedObligationIds,
    methodStatement: p.methodStatement,
    transformations: p.transformations,
    renderedText: p.renderedText,
    gapJustification: p.gapJustification,
  }));

  // Convert case to renderer format
  const rendererCase: RendererPsurCase = {
    id: psurCase.id,
    psurReference: psurCase.psurReference,
    templateId: psurCase.templateId,
    jurisdictions: psurCase.jurisdictions || [],
    startPeriod: psurCase.startPeriod,
    endPeriod: psurCase.endPeriod,
    status: psurCase.status,
    version: psurCase.version,
    deviceCode: psurCase.deviceCode,
  };

  // Convert qualification report
  const rendererQualReport: QualificationReport | null = qualificationReport ? {
    status: qualificationReport.status,
    templateId: qualificationReport.templateId,
    slotCount: qualificationReport.slotCount,
    mappingCount: qualificationReport.mappingCount,
    mandatoryObligationsFound: qualificationReport.mandatoryObligationsFound,
    mandatoryObligationsTotal: qualificationReport.mandatoryObligationsTotal,
    constraints: qualificationReport.constraints,
    validatedAt: qualificationReport.validatedAt,
    missingObligations: qualificationReport.missingObligations,
    blockingErrors: qualificationReport.blockingErrors,
  } : null;

  return renderPsurFromTemplate(template, rendererCase, atomData, rendererProposals, rendererQualReport);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Mount evidence ingestion routes
  app.use("/api/ingest", ingestionRoutes);

  // Mount template routes (validation, upload)
  app.use("/api/templates", templateRoutes);

  // Client error reporting (from frontend)
  app.post("/api/client-errors", (req, res) => {
    const payload = typeof req.body === "object" && req.body !== null
      ? req.body
      : { raw: req.body };
    console.error("[ClientError]", JSON.stringify(payload));
    res.json({ ok: true });
  });

  // Health check endpoint with database connectivity test
  app.get("/api/health", async (_req, res) => {
    const { isPoolHealthy, pool } = await import("./db");
    const dbHealthy = await isPoolHealthy();
    const status = dbHealthy ? "healthy" : "degraded";

    res.status(dbHealthy ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      database: {
        connected: dbHealthy,
        poolTotal: pool.totalCount,
        poolIdle: pool.idleCount,
        poolWaiting: pool.waitingCount,
      },
      uptime: process.uptime(),
    });
  });


  // System Instructions Routes
  app.get("/api/system-instructions", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { systemInstructions } = await import("@shared/schema");

      const instructions = await db.select().from(systemInstructions);
      const { DEFAULT_PROMPT_TEMPLATES } = await import("./src/agents/llmService");

      // Check for missing instructions
      const existingKeys = new Set(instructions.map(i => i.key));
      const missingKeys = Object.keys(DEFAULT_PROMPT_TEMPLATES).filter(key => !existingKeys.has(key));

      if (missingKeys.length > 0) {
        const getCategory = (key: string) => {
          if (["SEVERITY_CLASSIFICATION", "FIELD_MAPPING_RESOLUTION", "EVIDENCE_EXTRACTION", "DOCUMENT_ANALYSIS", "FIELD_MAPPING_REFINEMENT", "BATCH_FIELD_MAPPING"].includes(key)) return "Ingestion";
          if (["COMPLIANCE_CHECK"].includes(key)) return "Compliance";
          if (key.includes("Agent")) return "Agents";
          return "Narrative Generation";
        };

        const extractVariables = (tmpl: string) => {
          const matches = tmpl.match(/\{([a-zA-Z0-9_]+)\}/g);
          return matches ? Array.from(new Set(matches.map(m => m.slice(1, -1)))) : [];
        };

        const seedData = missingKeys.map(key => {
          const template = (DEFAULT_PROMPT_TEMPLATES as any)[key];
          return {
            key,
            category: getCategory(key),
            description: "System default template",
            template,
            defaultTemplate: template,
            version: 1,
            variables: extractVariables(template),
            updatedBy: "system"
          };
        });

        await db.insert(systemInstructions).values(seedData);
        // Refresh after seeding missing ones
        const updatedInstructions = await db.select().from(systemInstructions);
        return res.json(updatedInstructions);
      }

      res.json(instructions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/system-instructions/:key", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { systemInstructions, instructionVersions } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");

      const instructions = await db.select().from(systemInstructions).where(eq(systemInstructions.key, req.params.key));
      if (!instructions.length) return res.status(404).json({ error: "Instruction not found" });

      const versions = await db.select()
        .from(instructionVersions)
        .where(eq(instructionVersions.instructionKey, req.params.key))
        .orderBy(desc(instructionVersions.version));

      res.json({ ...instructions[0], versions });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/system-instructions/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const { template, changeReason, updatedBy } = req.body;
      const { db } = await import("./db");
      const { systemInstructions, instructionVersions } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      await db.transaction(async (tx) => {
        const current = await tx.select().from(systemInstructions).where(eq(systemInstructions.key, key));
        if (!current.length) {
          // If it doesn't exist, we can create it if we want, but typically we want to seed defaults first.
          // For now let's assume existence or create if missing (first edit from default in code)
          // NOTE: Since defaults are in code, if it's separate from DB, we might need a sync step.
          // But for now, let's assume the DB is seeded.
          throw new Error("Instruction not found in DB");
        }

        const newVersion = current[0].version + 1;

        // Archive current
        await tx.insert(instructionVersions).values({
          instructionKey: key,
          template: current[0].template,
          version: current[0].version,
          changeReason: changeReason || "Update",
          createdBy: updatedBy || "user",
        });

        // Update main
        await tx.update(systemInstructions)
          .set({
            template,
            version: newVersion,
            lastUpdated: new Date(),
            updatedBy
          })
          .where(eq(systemInstructions.key, key));
      });

      const { initializePrompts } = await import("./src/agents/llmService");

      await initializePrompts(true);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/system-instructions/:key/reset", async (req, res) => {
    try {
      const { key } = req.params;
      const { db } = await import("./db");
      const { systemInstructions, instructionVersions } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      await db.transaction(async (tx) => {
        const current = await tx.select().from(systemInstructions).where(eq(systemInstructions.key, key));
        if (!current.length) return res.status(404).json({ error: "Instruction not found" });

        const newVersion = current[0].version + 1;

        // Archive current
        await tx.insert(instructionVersions).values({
          instructionKey: key,
          template: current[0].template,
          version: current[0].version,
          changeReason: "Reset to default",
          createdBy: "system",
        });

        await tx.update(systemInstructions)
          .set({
            template: current[0].defaultTemplate,
            version: newVersion,
            lastUpdated: new Date(),
            updatedBy: "system"
          })
          .where(eq(systemInstructions.key, key));
      });

      const { initializePrompts } = await import("./src/agents/llmService");

      await initializePrompts(true);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/system-instructions/:key/rollback/:version", async (req, res) => {
    try {
      const { key, version } = req.params;
      const { db } = await import("./db");
      const { systemInstructions, instructionVersions } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const { initializePrompts } = await import("./src/agents/llmService");

      await db.transaction(async (tx) => {
        const targetVersion = await tx.select()
          .from(instructionVersions)
          .where(and(
            eq(instructionVersions.instructionKey, key),
            eq(instructionVersions.version, parseInt(version))
          ));

        if (!targetVersion.length) throw new Error("Target version not found");

        const current = await tx.select().from(systemInstructions).where(eq(systemInstructions.key, key));
        if (!current.length) throw new Error("Instruction not found");

        // Archive current
        await tx.insert(instructionVersions).values({
          instructionKey: key,
          template: current[0].template,
          version: current[0].version,
          changeReason: `Rollback to version ${version}`,
          createdBy: "user",
        });

        // Restore
        await tx.update(systemInstructions)
          .set({
            template: targetVersion[0].template,
            version: current[0].version + 1,
            lastUpdated: new Date(),
            updatedBy: "user"
          })
          .where(eq(systemInstructions.key, key));
      });

      await initializePrompts(true);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // LLM-powered preview - generate actual AI output from template + sample data
  app.post("/api/system-instructions/:key/preview", async (req, res) => {
    try {
      const { key } = req.params;
      const { variables } = req.body; // { variableName: value, ... }

      const { db } = await import("./db");
      const { systemInstructions } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const { complete, DEFAULT_PROMPT_TEMPLATES } = await import("./src/agents/llmService");

      // Get the template
      const instructions = await db.select().from(systemInstructions).where(eq(systemInstructions.key, key));
      let template = instructions.length > 0 ? instructions[0].template : (DEFAULT_PROMPT_TEMPLATES as any)[key];

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Substitute variables into template
      if (variables && typeof variables === "object") {
        for (const [varName, value] of Object.entries(variables)) {
          template = template.replace(new RegExp(`\\{${varName}\\}`, 'g'), String(value));
        }
      }

      // Call LLM to generate output
      const llmResponse = await complete({
        messages: [
          {
            role: "system",
            content: "You are an expert medical device regulatory writer creating PSUR (Periodic Safety Update Report) content. Generate professional, compliant content based on the following instructions."
          },
          {
            role: "user",
            content: template
          }
        ],
        config: {
          maxTokens: 1000,
          temperature: 0.3,
        }
      });

      res.json({
        output: llmResponse.content,
        templateUsed: template.substring(0, 500) + (template.length > 500 ? "..." : ""),
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[POST /api/system-instructions/:key/preview] Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate preview" });
    }
  });

  // Template endpoints
  app.get("/api/templates", (_req, res) => {
    res.json({ templates: listTemplates() });
  });

  app.get("/api/templates/debug", (_req, res) => {
    res.json(getTemplateDirsDebugInfo());
  });

  // Template lint endpoint (must be before :id route)
  app.get("/api/templates/:templateId/lint", async (req, res) => {
    try {
      const { lintTemplate } = await import("./src/templates/lintTemplates");
      const templatePath = path.join(process.cwd(), "server", "templates", `${req.params.templateId}.json`);
      const result = await lintTemplate(templatePath);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  app.get("/api/templates/:id", (req, res) => {
    try {
      const t = loadTemplate(req.params.id);
      res.json({ ok: true, template_id: t.template_id, slotCount: t.slots.length });
    } catch (e: any) {
      res.status(e?.status || 500).json({ ok: false, error: e?.message || String(e) });
    }
  });

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

  // ============== ENHANCED PSUR-GRKB API ==============
  // State-of-the-art PSUR-specific regulatory knowledge base endpoints

  const { psurGrkbService } = await import("./src/services/psurGrkbService");

  // Get GRKB statistics summary
  app.get("/api/psur-grkb/statistics", async (req, res) => {
    try {
      const stats = await psurGrkbService.getGrkbStatistics();
      res.json(stats);
    } catch (error) {
      console.error("[PSUR-GRKB] Statistics error:", error);
      res.status(500).json({ error: "Failed to fetch GRKB statistics" });
    }
  });

  // Evidence Types
  app.get("/api/psur-grkb/evidence-types", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const evidenceTypes = category
        ? await psurGrkbService.getEvidenceTypesByCategory(category)
        : await psurGrkbService.getAllEvidenceTypes();
      res.json(evidenceTypes);
    } catch (error) {
      console.error("[PSUR-GRKB] Evidence types error:", error);
      res.status(500).json({ error: "Failed to fetch evidence types" });
    }
  });

  app.get("/api/psur-grkb/evidence-types/:evidenceTypeId", async (req, res) => {
    try {
      const evType = await psurGrkbService.getEvidenceTypeById(req.params.evidenceTypeId);
      if (!evType) {
        return res.status(404).json({ error: "Evidence type not found" });
      }
      res.json(evType);
    } catch (error) {
      console.error("[PSUR-GRKB] Evidence type error:", error);
      res.status(500).json({ error: "Failed to fetch evidence type" });
    }
  });

  app.get("/api/psur-grkb/evidence-types/:evidenceTypeId/schema", async (req, res) => {
    try {
      const schema = await psurGrkbService.getEvidenceTypeSchema(req.params.evidenceTypeId);
      if (!schema) {
        return res.status(404).json({ error: "Evidence type not found" });
      }
      res.json(schema);
    } catch (error) {
      console.error("[PSUR-GRKB] Evidence type schema error:", error);
      res.status(500).json({ error: "Failed to fetch evidence type schema" });
    }
  });

  app.post("/api/psur-grkb/evidence-types/:evidenceTypeId/validate", async (req, res) => {
    try {
      const result = await psurGrkbService.validateEvidenceData(req.params.evidenceTypeId, req.body);
      res.json(result);
    } catch (error) {
      console.error("[PSUR-GRKB] Validation error:", error);
      res.status(500).json({ error: "Failed to validate evidence data" });
    }
  });

  // PSUR Sections
  app.get("/api/psur-grkb/sections/:templateId", async (req, res) => {
    try {
      const sections = await psurGrkbService.getSectionsForTemplate(req.params.templateId);
      res.json(sections);
    } catch (error) {
      console.error("[PSUR-GRKB] Sections error:", error);
      res.status(500).json({ error: "Failed to fetch sections" });
    }
  });

  app.get("/api/psur-grkb/sections/:templateId/hierarchy", async (req, res) => {
    try {
      const hierarchy = await psurGrkbService.getSectionHierarchy(req.params.templateId);
      res.json(hierarchy);
    } catch (error) {
      console.error("[PSUR-GRKB] Section hierarchy error:", error);
      res.status(500).json({ error: "Failed to fetch section hierarchy" });
    }
  });

  // Obligations
  app.get("/api/psur-grkb/obligations", async (req, res) => {
    try {
      const jurisdictions = req.query.jurisdictions
        ? (req.query.jurisdictions as string).split(",")
        : [];
      const mandatoryOnly = req.query.mandatory === "true";

      const obligations = mandatoryOnly
        ? await psurGrkbService.getMandatoryObligations(jurisdictions)
        : jurisdictions.length > 0
          ? await psurGrkbService.getObligationsForJurisdictions(jurisdictions)
          : await psurGrkbService.getObligationsForJurisdictions(["EU_MDR", "UK_MDR"]);

      res.json(obligations);
    } catch (error) {
      console.error("[PSUR-GRKB] Obligations error:", error);
      res.status(500).json({ error: "Failed to fetch obligations" });
    }
  });

  app.get("/api/psur-grkb/obligations/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Search query required" });
      }
      const jurisdictions = req.query.jurisdictions
        ? (req.query.jurisdictions as string).split(",")
        : undefined;

      const results = await psurGrkbService.searchObligations(query, jurisdictions);
      res.json(results);
    } catch (error) {
      console.error("[PSUR-GRKB] Search error:", error);
      res.status(500).json({ error: "Failed to search obligations" });
    }
  });

  app.get("/api/psur-grkb/obligations/:obligationId", async (req, res) => {
    try {
      const obligation = await psurGrkbService.getObligationById(req.params.obligationId);
      if (!obligation) {
        return res.status(404).json({ error: "Obligation not found" });
      }
      res.json(obligation);
    } catch (error) {
      console.error("[PSUR-GRKB] Obligation error:", error);
      res.status(500).json({ error: "Failed to fetch obligation" });
    }
  });

  app.get("/api/psur-grkb/obligations/:obligationId/dependencies", async (req, res) => {
    try {
      const deps = await psurGrkbService.getObligationDependencies(req.params.obligationId);
      res.json(deps);
    } catch (error) {
      console.error("[PSUR-GRKB] Dependencies error:", error);
      res.status(500).json({ error: "Failed to fetch obligation dependencies" });
    }
  });

  app.get("/api/psur-grkb/obligations/:obligationId/graph", async (req, res) => {
    try {
      const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth as string) : 5;
      const graph = await psurGrkbService.getObligationDependencyGraph(req.params.obligationId, maxDepth);

      // Convert Map to array for JSON serialization
      const entries = Array.from(graph.entries()).map(([id, data]) => ({
        obligationId: id,
        ...data,
      }));
      res.json(entries);
    } catch (error) {
      console.error("[PSUR-GRKB] Graph error:", error);
      res.status(500).json({ error: "Failed to fetch obligation graph" });
    }
  });

  // Slot-Obligation Mappings
  app.get("/api/psur-grkb/mappings/:templateId", async (req, res) => {
    try {
      const mappings = await psurGrkbService.getSlotObligationsForTemplate(req.params.templateId);
      res.json(mappings);
    } catch (error) {
      console.error("[PSUR-GRKB] Mappings error:", error);
      res.status(500).json({ error: "Failed to fetch slot mappings" });
    }
  });

  app.get("/api/psur-grkb/mappings/:templateId/slot/:slotId", async (req, res) => {
    try {
      const obligations = await psurGrkbService.getObligationsForSlot(
        req.params.templateId,
        req.params.slotId
      );
      res.json(obligations);
    } catch (error) {
      console.error("[PSUR-GRKB] Slot obligations error:", error);
      res.status(500).json({ error: "Failed to fetch obligations for slot" });
    }
  });

  app.get("/api/psur-grkb/coverage/:templateId", async (req, res) => {
    try {
      const jurisdictions = req.query.jurisdictions
        ? (req.query.jurisdictions as string).split(",")
        : ["EU_MDR"];

      const coverage = await psurGrkbService.checkTemplateCoverage(
        req.params.templateId,
        jurisdictions
      );
      res.json(coverage);
    } catch (error) {
      console.error("[PSUR-GRKB] Coverage error:", error);
      res.status(500).json({ error: "Failed to check template coverage" });
    }
  });

  // Compliance Checklist
  app.post("/api/psur-grkb/compliance/:psurCaseId/initialize", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const { jurisdictions } = req.body;

      if (!jurisdictions || !Array.isArray(jurisdictions)) {
        return res.status(400).json({ error: "jurisdictions array required" });
      }

      const checklist = await psurGrkbService.initializeComplianceChecklist(psurCaseId, jurisdictions);
      res.json(checklist);
    } catch (error) {
      console.error("[PSUR-GRKB] Compliance init error:", error);
      res.status(500).json({ error: "Failed to initialize compliance checklist" });
    }
  });

  app.get("/api/psur-grkb/compliance/:psurCaseId/summary", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const summary = await psurGrkbService.getComplianceSummary(psurCaseId);
      res.json(summary);
    } catch (error) {
      console.error("[PSUR-GRKB] Compliance summary error:", error);
      res.status(500).json({ error: "Failed to fetch compliance summary" });
    }
  });

  app.get("/api/psur-grkb/compliance/:psurCaseId/unresolved", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const unresolved = await psurGrkbService.getUnresolvedObligations(psurCaseId);
      res.json(unresolved);
    } catch (error) {
      console.error("[PSUR-GRKB] Unresolved obligations error:", error);
      res.status(500).json({ error: "Failed to fetch unresolved obligations" });
    }
  });

  app.put("/api/psur-grkb/compliance/:psurCaseId/:obligationId", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const obligationId = req.params.obligationId;

      const updated = await psurGrkbService.updateChecklistItem(psurCaseId, obligationId, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Checklist item not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("[PSUR-GRKB] Compliance update error:", error);
      res.status(500).json({ error: "Failed to update compliance item" });
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
      // Report status from the Python compliance kernel (psur_orchestrator)
      const result = await getOrchestratorStatus();
      if (!result.success || !result.data) {
        return res.status(500).json({ error: result.error || "Failed to get orchestrator status" });
      }

      res.json(result.data);
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

  app.get("/api/templates/:templateId/requirements", async (req, res) => {
    try {
      const templateId = req.params.templateId;

      // Load template from JSON file (single source of truth)
      const template = loadTemplate(templateId);

      // Extract all required evidence types from the template's slots
      const requiredTypes = getAllRequiredEvidenceTypes(template);

      console.log(`[TemplateRequirements] Template '${templateId}' requires ${requiredTypes.length} evidence types:`, requiredTypes);

      res.json({ requiredEvidenceTypes: requiredTypes });
    } catch (error: any) {
      console.error(`[TemplateRequirements] Error loading template '${req.params.templateId}':`, error.message);
      res.status(error.status || 500).json({
        error: "Failed to get template requirements",
        details: error.message
      });
    }
  });

  app.post("/api/orchestrator/qualify", async (req, res) => {
    try {
      const templateIdRaw = req.body?.templateId || req.body?.template || req.body?.template_id;

      // FORCE template loading through templateStore (single source of truth)
      let template;
      try {
        template = loadTemplate(templateIdRaw);
      } catch (e: any) {
        return res.status(e?.status || 500).json({ error: e?.message || String(e) });
      }

      // Qualification is done directly in Node.js using templateStore
      // Template is valid if it loaded successfully with slots and mapping
      const slotCount = template.slots?.length || 0;
      const mappingCount = Object.keys(template.mapping || {}).length;

      res.json({
        status: "PASS",
        template_id: template.template_id,
        slotCount,
        mappingCount,
        message: `Template '${template.template_id}' qualified successfully with ${slotCount} slots and ${mappingCount} mappings`
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to qualify template" });
    }
  });

  app.post("/api/orchestrator/run", async (req, res) => {
    try {
      const parsed = orchestratorRunRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`),
        });
      }

      const started = startOrchestratorWorkflow(parsed.data);
      res.status(202).json(started);
    } catch (error: any) {
      console.error("[POST /api/orchestrator/run] Error:", error);
      if (isDatabaseConnectionError(error)) {
        return res.status(503).json({
          error: "Database unavailable",
          code: "DATABASE_UNAVAILABLE",
        });
      }
      res.status(500).json({ error: error.message || "Failed to run workflow" });
    }
  });

  app.post("/api/orchestrator/cases/:psurCaseId/cancel", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      if (isNaN(psurCaseId)) {
        return res.status(400).json({ error: "Invalid psurCaseId" });
      }
      const ok = cancelOrchestratorWorkflow(psurCaseId, "Cancelled by user");
      res.status(200).json({ ok });
    } catch (error: any) {
      console.error("[POST /api/orchestrator/cases/:psurCaseId/cancel] Error:", error);
      res.status(500).json({ error: error.message || "Failed to cancel workflow" });
    }
  });

  app.get("/api/orchestrator/cases/:psurCaseId/stream", async (req, res) => {
    const psurCaseId = parseInt(req.params.psurCaseId);
    if (isNaN(psurCaseId)) {
      return res.status(400).json({ error: "Invalid psurCaseId" });
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // initial ping
    res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now(), psurCaseId })}\n\n`);

    // attach stream
    const detach = attachRuntimeStream(psurCaseId, res);

    // keepalive
    const ping = setInterval(() => {
      try {
        res.write(`event: ping\ndata: ${JSON.stringify({ ts: Date.now(), psurCaseId })}\n\n`);
      } catch {
        // ignore
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(ping);
      detach();
    });
  });

  app.get("/api/orchestrator/cases/:psurCaseId", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      if (isNaN(psurCaseId)) {
        return res.status(400).json({ error: "Invalid psurCaseId" });
      }

      // PRIORITY 1: Check cached result from active workflow (real-time status)
      const cached = getCachedWorkflowResult(psurCaseId);
      if (cached) {
        return res.json(cached);
      }

      // PRIORITY 2: Reconstruct from database (historical/persisted status)
      const result = await getWorkflowResultForCase(psurCaseId);
      if (!result) {
        return res.status(404).json({ error: "PSUR case not found" });
      }

      res.json(result);
    } catch (error: any) {
      console.error("[GET /api/orchestrator/cases/:psurCaseId] Error:", error);
      const psurCaseId = parseInt(req.params.psurCaseId);
      const cached = Number.isNaN(psurCaseId) ? null : getCachedWorkflowResult(psurCaseId);
      if (cached) {
        return res.status(200).json(cached);
      }
      if (isDatabaseConnectionError(error)) {
        return res.status(503).json({
          error: "Database unavailable",
          code: "DATABASE_UNAVAILABLE",
        });
      }
      res.status(500).json({ error: error.message || "Failed to get workflow state" });
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

  // Workflow Insights API - Human-friendly decision explanations
  app.get("/api/psur-cases/:id/workflow", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const psurCase = await storage.getPSURCase(id);
      if (!psurCase) {
        return res.status(404).json({ error: "PSUR case not found" });
      }

      // Get decision trace entries for this case
      const { decisionTraceEntries, evidenceAtoms } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");

      // Get trace entries
      const traces = await db.select()
        .from(decisionTraceEntries)
        .where(eq(decisionTraceEntries.psurCaseId, id))
        .orderBy(decisionTraceEntries.sequenceNum);

      // Get evidence atom counts
      const atoms = await db.select()
        .from(evidenceAtoms)
        .where(eq(evidenceAtoms.psurCaseId, id));

      // Build simplified steps for the Audit Trail UI
      const steps: Array<{
        id: string;
        title: string;
        status: "completed" | "running" | "pending" | "failed";
        timestamp: string;
        duration?: string;
        summary: string;
        details?: string;
        dataUsed?: string[];
        findings?: string[];
      }> = [];

      // Step 1: Data Loading
      if (atoms.length > 0) {
        // Group atoms by type
        const typeCounts: Record<string, number> = {};
        atoms.forEach(a => {
          const type = a.evidenceType || "Unknown";
          typeCounts[type] = (typeCounts[type] || 0) + 1;
        });

        steps.push({
          id: "data-loaded",
          title: "Evidence Data Loaded",
          status: "completed",
          timestamp: psurCase.createdAt?.toISOString() || new Date().toISOString(),
          duration: "Complete",
          summary: `${atoms.length} evidence records imported from your data files.`,
          details: `The system analyzed and categorized ${atoms.length} records including complaints, incidents, and sales data. Each record has been validated and is ready for report generation.`,
          dataUsed: Object.entries(typeCounts).map(([type, count]) => `${type} (${count})`),
          findings: [
            `${atoms.length} total records processed`,
            `${Object.keys(typeCounts).length} different data types identified`,
          ],
        });
      } else {
        steps.push({
          id: "awaiting-data",
          title: "Waiting for Data",
          status: "pending",
          timestamp: new Date().toISOString(),
          summary: "No evidence data uploaded yet. Upload your surveillance data to begin.",
          details: "To generate your PSUR report, you'll need to upload your post-market surveillance data including sales volumes, complaints, incidents, and any field safety actions.",
          dataUsed: [],
          findings: ["No data uploaded yet"],
        });
      }

      // Step 2+: Process trace entries into readable steps
      const traceSteps = traces.slice(0, 10).map((trace, index) => {
        const eventType = trace.eventType || "UNKNOWN";
        let title = eventType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        let status: "completed" | "running" | "pending" | "failed" = "completed";

        if (trace.decision === "REJECT" || trace.decision === "FAIL") {
          status = "failed";
        } else if (eventType.includes("STARTED") || eventType.includes("RUNNING")) {
          status = "running";
        }

        // Make titles human-friendly
        const titleMap: Record<string, string> = {
          "EVIDENCE_EXTRACTION": "Analyzed Data Sources",
          "SLOT_GENERATION": "Generated Report Section",
          "COMPLIANCE_CHECK": "Verified Regulatory Compliance",
          "SLOT_QUALIFIED": "Section Ready for Review",
          "OBLIGATION_SATISFIED": "Met Regulatory Requirement",
          "TREND_ANALYSIS": "Analyzed Trends",
          "SUMMARY_GENERATED": "Created Summary",
        };
        title = titleMap[eventType] || title;

        return {
          id: trace.traceId || `trace-${trace.id}`,
          title,
          status,
          timestamp: trace.eventTimestamp?.toISOString() || new Date().toISOString(),
          summary: trace.humanSummary || `${title} for ${trace.entityType || "report section"}`,
          details: trace.humanSummary || undefined,
          dataUsed: trace.entityType ? [trace.entityType] : undefined,
          findings: trace.decision ? [`Decision: ${trace.decision}`] : undefined,
        };
      });

      steps.push(...traceSteps);

      // Calculate summary
      const completedCount = steps.filter(s => s.status === "completed").length;
      const summary = {
        totalSteps: steps.length,
        completedSteps: completedCount,
        status: completedCount === steps.length ? "completed" :
          steps.some(s => s.status === "failed") ? "needs attention" :
            steps.some(s => s.status === "running") ? "in progress" : "pending",
      };

      res.json({ steps, summary });
    } catch (error) {
      console.error("[GET /api/psur-cases/:id/workflow] Error:", error);
      res.status(500).json({ error: "Failed to fetch workflow data" });
    }
  });

  // Helper functions for workflow insights (trace-based)
  function categorizeTraceEvent(eventType: string): "data" | "analysis" | "generation" | "validation" {
    if (eventType.includes("EVIDENCE") || eventType.includes("EXTRACTION") || eventType.includes("INGESTED")) {
      return "data";
    }
    if (eventType.includes("TREND") || eventType.includes("ANALYSIS") || eventType.includes("COVERAGE")) {
      return "analysis";
    }
    if (eventType.includes("VALIDATION") || eventType.includes("COMPLIANCE") || eventType.includes("QUALIFIED")) {
      return "validation";
    }
    return "generation";
  }

  function mapTraceStatus(eventType: string, decision?: string | null): "completed" | "in_progress" | "pending" | "attention_needed" {
    if (eventType.includes("COMPLETED") || eventType.includes("SATISFIED") || decision === "ACCEPT" || decision === "PASS") {
      return "completed";
    }
    if (eventType.includes("FAILED") || eventType.includes("UNSATISFIED") || eventType.includes("BLOCKED") || decision === "REJECT" || decision === "FAIL") {
      return "attention_needed";
    }
    if (eventType.includes("STARTED") || eventType.includes("SPAWNED")) {
      return "in_progress";
    }
    return "completed";
  }

  function getHumanFriendlyTraceTitle(eventType: string, entityType?: string | null): string {
    const titleMap: Record<string, string> = {
      "WORKFLOW_STARTED": "Report Generation Started",
      "WORKFLOW_COMPLETED": "Report Generation Complete",
      "WORKFLOW_FAILED": "Report Generation Failed",
      "TEMPLATE_QUALIFIED": "Template Validation Passed",
      "TEMPLATE_BLOCKED": "Template Validation Failed",
      "CASE_CREATED": "PSUR Case Created",
      "EVIDENCE_UPLOADED": "Evidence File Uploaded",
      "EVIDENCE_ATOM_CREATED": "Evidence Record Processed",
      "EVIDENCE_INGESTED": "Evidence Data Imported",
      "SLOT_PROPOSED": "Section Draft Created",
      "SLOT_ACCEPTED": "Section Approved",
      "SLOT_REJECTED": "Section Needs Revision",
      "COVERAGE_COMPUTED": "Compliance Coverage Calculated",
      "DOCUMENT_RENDERED": "Document Generated",
      "BUNDLE_EXPORTED": "Audit Bundle Exported",
      "OBLIGATION_SATISFIED": "Requirement Met",
      "OBLIGATION_UNSATISFIED": "Requirement Not Met",
      "AGENT_SPAWNED": "AI Agent Started",
      "AGENT_COMPLETED": "AI Agent Completed",
      "NARRATIVE_GENERATED": "Narrative Written",
      "LLM_INVOKED": "AI Analysis Performed",
    };
    return titleMap[eventType] || `${eventType.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}`;
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  }

  function calculateTraceDuration(traceGroup: any[]): string {
    if (traceGroup.length < 2) return "Instant";
    const first = traceGroup[0].eventTimestamp;
    const last = traceGroup[traceGroup.length - 1].eventTimestamp;
    if (!first || !last) return "Unknown";
    const ms = new Date(last).getTime() - new Date(first).getTime();
    return formatDuration(ms);
  }

  function generateTraceSummary(eventType: string, trace: any): string {
    if (trace.decision) {
      return `Decision: ${trace.decision}. ${trace.entityType ? `Affected: ${trace.entityType}` : ""}`;
    }
    return `Workflow event: ${eventType.replace(/_/g, " ").toLowerCase()}`;
  }

  function generateTraceWhatHappened(mainTrace: any, traceGroup: any[]): string {
    if (mainTrace.humanSummary) return mainTrace.humanSummary;

    const eventType = mainTrace.eventType;
    if (eventType?.includes("EVIDENCE")) {
      return "Evidence data was processed and validated. Each record was checked for completeness, categorized by type, and prepared for use in narrative generation.";
    }
    if (eventType?.includes("NARRATIVE")) {
      return "The AI agent analyzed the relevant evidence and generated compliant narrative content following regulatory requirements and your selected template structure.";
    }
    if (eventType?.includes("COVERAGE")) {
      return "The system calculated how well the available evidence satisfies the regulatory requirements. This coverage analysis identifies any gaps that need to be addressed.";
    }
    return "A workflow step was executed as part of the PSUR generation process.";
  }

  function generateTraceWhyItMatters(eventType: string): string {
    if (eventType.includes("EVIDENCE")) {
      return "Complete and accurate evidence is the foundation of a compliant PSUR. Each data point contributes to demonstrating your ongoing post-market surveillance activities.";
    }
    if (eventType.includes("OBLIGATION")) {
      return "Regulatory obligations must be satisfied to maintain market authorization. This step tracks whether your report meets the specific requirements.";
    }
    if (eventType.includes("COVERAGE")) {
      return "Coverage analysis ensures you haven't missed any required content. Regulators expect comprehensive documentation of all surveillance activities.";
    }
    return "This step contributes to the overall quality and compliance of your PSUR submission.";
  }

  function extractTraceDataSources(trace: any, atoms: any[]): { name: string; records: number }[] {
    const result: { name: string; records: number }[] = [];
    if (atoms.length > 0) {
      const types = new Set(atoms.map(a => a.evidenceType));
      types.forEach(type => {
        const count = atoms.filter(a => a.evidenceType === type).length;
        result.push({ name: type?.replace(/_/g, " ") || "Evidence", records: count });
      });
    }
    return result.slice(0, 4);
  }

  function extractTraceFindings(traceGroup: any[]): string[] {
    const findings: string[] = [];
    traceGroup.forEach(trace => {
      if (trace.decision === "ACCEPT" || trace.decision === "PASS") {
        findings.push(`✓ ${trace.entityType || "Item"} validated successfully`);
      }
      if (trace.reasons && Array.isArray(trace.reasons)) {
        findings.push(...trace.reasons.slice(0, 2).map((r: any) => typeof r === "string" ? r : r.message || JSON.stringify(r)));
      }
    });
    return findings.length > 0 ? findings.slice(0, 4) : ["Processing completed"];
  }

  function extractTraceRecommendations(trace: any): string[] | undefined {
    if (trace.decision === "REJECT" || trace.decision === "FAIL") {
      return ["Review the identified issues", "Address missing data or content gaps", "Re-run the affected step after corrections"];
    }
    return undefined;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // GRKB VALIDATION ENDPOINT - Pre-generation compliance check
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get("/api/psur-cases/:id/grkb-validation", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const psurCase = await storage.getPSURCase(id);
      if (!psurCase) {
        return res.status(404).json({ error: "PSUR case not found" });
      }

      const { grkbObligations, grkbValidationReports, evidenceAtoms } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq, and, inArray } = await import("drizzle-orm");

      // Check if we have a cached validation report
      const existingReports = await db.select()
        .from(grkbValidationReports)
        .where(eq(grkbValidationReports.psurCaseId, id))
        .orderBy(grkbValidationReports.validatedAt);

      if (existingReports.length > 0) {
        const report = existingReports[existingReports.length - 1];
        return res.json(report);
      }

      // Calculate fresh validation
      const jurisdictions = psurCase.jurisdictions || ["EU_MDR"];
      const templateId = psurCase.templateId;

      // Get mandatory obligations for these jurisdictions
      const obligations = await db.select()
        .from(grkbObligations)
        .where(and(
          inArray(grkbObligations.jurisdiction, jurisdictions),
          eq(grkbObligations.mandatory, true)
        ));

      // Get evidence atoms for this case
      const atoms = await db.select()
        .from(evidenceAtoms)
        .where(eq(evidenceAtoms.psurCaseId, id));

      // Calculate coverage
      const availableEvidenceTypes = new Set(atoms.map(a => a.evidenceType));
      const requiredEvidenceTypes = new Set<string>();

      obligations.forEach(ob => {
        if (ob.requiredEvidenceTypes) {
          ob.requiredEvidenceTypes.forEach(t => requiredEvidenceTypes.add(t));
        }
      });

      const satisfiedObligations = obligations.filter(ob => {
        if (!ob.requiredEvidenceTypes || ob.requiredEvidenceTypes.length === 0) return true;
        return ob.requiredEvidenceTypes.some(t => availableEvidenceTypes.has(t));
      });

      const missingEvidenceTypes = Array.from(requiredEvidenceTypes).filter(t => !availableEvidenceTypes.has(t));
      const blockingIssues = obligations
        .filter(ob => ob.mandatory && ob.requiredEvidenceTypes?.some(t => !availableEvidenceTypes.has(t)))
        .map(ob => ({
          obligationId: ob.obligationId,
          obligationText: ob.text,
          sourceCitation: ob.sourceCitation || "",
          requiredEvidenceTypes: ob.requiredEvidenceTypes || [],
          missingEvidenceTypes: ob.requiredEvidenceTypes?.filter(t => !availableEvidenceTypes.has(t)) || [],
          severity: "critical" as const,
        }));

      const validationStatus = blockingIssues.length > 0 ? "FAIL" :
        missingEvidenceTypes.length > 0 ? "WARNING" : "PASS";

      const validation = {
        validationStatus,
        canProceed: blockingIssues.length === 0,
        mandatoryObligationsTotal: obligations.length,
        mandatoryObligationsSatisfied: satisfiedObligations.length,
        optionalObligationsTotal: 0,
        optionalObligationsSatisfied: 0,
        requiredEvidenceTypesTotal: requiredEvidenceTypes.size,
        requiredEvidenceTypesPresent: Array.from(requiredEvidenceTypes).filter(t => availableEvidenceTypes.has(t)).length,
        evidenceCoveragePercent: requiredEvidenceTypes.size > 0
          ? Math.round((Array.from(requiredEvidenceTypes).filter(t => availableEvidenceTypes.has(t)).length / requiredEvidenceTypes.size) * 100).toString()
          : "100",
        blockingIssues,
        warnings: [],
        missingEvidenceTypes,
        unsatisfiedObligationIds: obligations.filter(ob => !satisfiedObligations.includes(ob)).map(ob => ob.obligationId),
        slotDetails: [],
        validatedAt: new Date().toISOString(),
      };

      res.json(validation);
    } catch (error) {
      console.error("[GET /api/psur-cases/:id/grkb-validation] Error:", error);
      res.status(500).json({ error: "Failed to validate GRKB compliance" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // SENTENCE ATTRIBUTIONS ENDPOINT - Granular provenance data
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get("/api/psur-cases/:id/sentences/:slotId", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const slotId = req.params.slotId;

      const psurCase = await storage.getPSURCase(id);
      if (!psurCase) {
        return res.status(404).json({ error: "PSUR case not found" });
      }

      const { sentenceAttributions } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq, and } = await import("drizzle-orm");

      const sentences = await db.select()
        .from(sentenceAttributions)
        .where(and(
          eq(sentenceAttributions.psurCaseId, id),
          eq(sentenceAttributions.slotId, slotId)
        ))
        .orderBy(sentenceAttributions.paragraphIndex, sentenceAttributions.sentenceIndex);

      res.json(sentences);
    } catch (error) {
      console.error("[GET /api/psur-cases/:id/sentences/:slotId] Error:", error);
      res.status(500).json({ error: "Failed to fetch sentence attributions" });
    }
  });

  // Get all sentences for a case (for search/filtering)
  app.get("/api/psur-cases/:id/sentences", async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      const { sentenceAttributions } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");

      const sentences = await db.select()
        .from(sentenceAttributions)
        .where(eq(sentenceAttributions.psurCaseId, id))
        .orderBy(sentenceAttributions.slotId, sentenceAttributions.paragraphIndex, sentenceAttributions.sentenceIndex);

      res.json(sentences);
    } catch (error) {
      console.error("[GET /api/psur-cases/:id/sentences] Error:", error);
      res.status(500).json({ error: "Failed to fetch sentence attributions" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // PROVENANCE GRAPH ENDPOINT - For graph visualization
  // ═══════════════════════════════════════════════════════════════════════════════

  app.get("/api/psur-cases/:id/provenance-graph", async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      const { provenanceEdges, sentenceAttributions, evidenceAtoms } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");

      // Get all edges for this case
      const edges = await db.select()
        .from(provenanceEdges)
        .where(eq(provenanceEdges.psurCaseId, id));

      // Get sentences as vertices
      const sentences = await db.select()
        .from(sentenceAttributions)
        .where(eq(sentenceAttributions.psurCaseId, id));

      // Get evidence atoms as vertices
      const atoms = await db.select()
        .from(evidenceAtoms)
        .where(eq(evidenceAtoms.psurCaseId, id));

      // Build graph structure
      const vertices = [
        ...sentences.map(s => ({
          id: `sentence:${s.id}`,
          type: "sentence",
          label: s.sentenceText.substring(0, 50) + "...",
          data: s,
        })),
        ...atoms.map(a => ({
          id: `atom:${a.id}`,
          type: "evidence_atom",
          label: `${a.evidenceType || "Evidence"} #${a.id}`,
          data: a,
        })),
      ];

      res.json({
        vertices,
        edges: edges.map(e => ({
          source: `${e.sourceVertexType}:${e.sourceVertexId}`,
          target: `${e.targetVertexType}:${e.targetVertexId}`,
          type: e.edgeType,
          properties: e.properties,
        })),
      });
    } catch (error) {
      console.error("[GET /api/psur-cases/:id/provenance-graph] Error:", error);
      res.status(500).json({ error: "Failed to fetch provenance graph" });
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

      // Validate: Check if a case already exists for this device and period
      const deviceId = parsed.data.leadingDeviceId;
      const startPeriod = parsed.data.startPeriod;
      const endPeriod = parsed.data.endPeriod;

      if (deviceId && startPeriod && endPeriod) {
        // Check for existing cases with the same device and surveillance period
        const existingCases = await storage.getPSURCasesByDeviceAndPeriod(
          deviceId,
          startPeriod,
          endPeriod
        );

        // Filter to find cases that would block creation
        const blockingCases = existingCases.filter(c => {
          // A case blocks creation if it's NOT closed, voided, or exported (reviewed)
          const status = c.status;
          return status !== "closed" && status !== "voided" && status !== "exported";
        });

        if (blockingCases.length > 0) {
          const existingCase = blockingCases[0];
          console.log(`[POST /api/psur-cases] Blocked: existing case ${existingCase.psurReference} (status: ${existingCase.status}) for device ${deviceId}`);
          return res.status(409).json({
            error: "A PSUR case already exists for this device and surveillance period",
            existingCase: {
              id: existingCase.id,
              psurReference: existingCase.psurReference,
              status: existingCase.status,
              startPeriod: existingCase.startPeriod,
              endPeriod: existingCase.endPeriod,
            },
            message: "A new case can only be created if the existing case is closed, voided, or exported (reviewed). Alternatively, change the surveillance period dates.",
          });
        }

        // Log if creating alongside closed/voided/exported cases
        if (existingCases.length > 0) {
          console.log(`[POST /api/psur-cases] Creating new case - existing cases are closed/voided/exported: ${existingCases.map(c => `${c.psurReference}(${c.status})`).join(', ')}`);
        }
      }

      const psurCase = await storage.createPSURCase(parsed.data);
      res.status(201).json(psurCase);
    } catch (error) {
      console.error("[POST /api/psur-cases] Error:", error);
      res.status(500).json({
        error: "Failed to create PSUR case",
        details:
          process.env.NODE_ENV === "development"
            ? (error as any)?.message || String(error)
            : undefined,
        code: process.env.NODE_ENV === "development" ? (error as any)?.code : undefined,
      });
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

  app.post("/api/evidence/analyze", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          error: "No file uploaded",
          totalRows: 0,
          sourceColumns: [],
          sampleRows: [],
          missingRequiredColumns: [],
          recommendedMapping: {},
          sheetNames: [],
          selectedSheet: "",
          fileFormat: "unknown",
          requiredFields: [],
        });
      }

      const { evidence_type, selected_sheet } = req.body;
      if (!evidence_type) {
        return res.status(400).json({
          error: "evidence_type is required",
          totalRows: 0,
          sourceColumns: [],
          sampleRows: [],
          missingRequiredColumns: [],
          recommendedMapping: {},
          sheetNames: [],
          selectedSheet: "",
          fileFormat: "unknown",
          requiredFields: [],
        });
      }

      const parseResult = parseFileBuffer(file.buffer, file.originalname, selected_sheet);

      if (!parseResult.success) {
        return res.status(400).json({
          error: "Failed to parse file",
          details: parseResult.errors,
          totalRows: 0,
          sourceColumns: parseResult.columns || [],
          sampleRows: [],
          missingRequiredColumns: [],
          recommendedMapping: {},
          sheetNames: parseResult.sheetNames || [],
          selectedSheet: parseResult.sheetName || "",
          fileFormat: parseResult.fileType || "unknown",
          requiredFields: [],
        });
      }

      const mappingDetection = detectColumnMappings(parseResult.columns || [], evidence_type);
      const existingProfiles = await storage.getColumnMappingProfiles(evidence_type);

      const sampleRows = (parseResult.rows || []).slice(0, 5);
      const sourceColumns = parseResult.columns || [];

      const missingRequiredColumns = (mappingDetection.requiredFields || []).filter(
        (field: string) => !mappingDetection.autoMapped[field]
      );

      res.json({
        success: true,
        totalRows: parseResult.rows?.length || 0,
        sourceColumns,
        sampleRows,
        missingRequiredColumns,
        recommendedMapping: mappingDetection.autoMapped || {},
        sheetNames: parseResult.sheetNames || [],
        selectedSheet: parseResult.sheetName || "",
        fileFormat: parseResult.fileType || "unknown",
        requiredFields: mappingDetection.requiredFields || [],
        suggestedMappings: mappingDetection.autoMapped || {},
        existingProfiles: existingProfiles.map(p => ({
          id: p.id,
          name: p.name,
          usageCount: p.usageCount,
          columnMappings: p.columnMappings,
        })),
        warnings: parseResult.errors || [],
      });
    } catch (error) {
      console.error("File analysis error:", error);
      res.status(500).json({
        error: "Failed to analyze file",
        totalRows: 0,
        sourceColumns: [],
        sampleRows: [],
        missingRequiredColumns: [],
        recommendedMapping: {},
        sheetNames: [],
        selectedSheet: "",
        fileFormat: "unknown",
        requiredFields: [],
      });
    }
  });

  app.get("/api/column-mapping-profiles", async (req, res) => {
    try {
      const evidenceType = req.query.evidenceType as string | undefined;
      const profiles = await storage.getColumnMappingProfiles(evidenceType);
      res.json(profiles);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch column mapping profiles" });
    }
  });

  app.post("/api/column-mapping-profiles", async (req, res) => {
    try {
      const { name, evidenceType, sourceSystemHint, columnMappings } = req.body;
      if (!name || !evidenceType || !columnMappings) {
        return res.status(400).json({ error: "name, evidenceType, and columnMappings are required" });
      }
      const profile = await storage.createColumnMappingProfile({
        name,
        evidenceType,
        sourceSystemHint: sourceSystemHint || null,
        columnMappings,
      });
      res.status(201).json(profile);
    } catch (error) {
      res.status(500).json({ error: "Failed to create column mapping profile" });
    }
  });

  // Find matching profile for given columns and evidence type
  app.post("/api/column-mapping-profiles/match", async (req, res) => {
    try {
      const { evidenceType, sourceColumns } = req.body;
      if (!evidenceType || !sourceColumns || !Array.isArray(sourceColumns)) {
        return res.status(400).json({ error: "evidenceType and sourceColumns array are required" });
      }

      const matchingProfile = await storage.findMatchingMappingProfile(evidenceType, sourceColumns);

      if (matchingProfile) {
        // Auto-apply: return the profile with a flag indicating it can be used directly
        res.json({
          found: true,
          profile: matchingProfile,
          canAutoApply: matchingProfile.usageCount >= 1, // Profile has been verified at least once
          message: `Found verified mapping profile "${matchingProfile.name}" (used ${matchingProfile.usageCount} times)`
        });
      } else {
        res.json({
          found: false,
          profile: null,
          canAutoApply: false,
          message: "No matching profile found. Manual mapping required."
        });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to find matching profile" });
    }
  });

  // Update an existing profile
  app.put("/api/column-mapping-profiles/:id", async (req, res) => {
    try {
      const profileId = parseInt(req.params.id);
      const { name, columnMappings, sourceSystemHint } = req.body;

      const updated = await storage.updateColumnMappingProfile(profileId, {
        name,
        columnMappings,
        sourceSystemHint,
      });

      if (updated) {
        res.json(updated);
      } else {
        res.status(404).json({ error: "Profile not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Delete a profile
  app.delete("/api/column-mapping-profiles/:id", async (req, res) => {
    try {
      const profileId = parseInt(req.params.id);
      const deleted = await storage.deleteColumnMappingProfile(profileId);

      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Profile not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to delete profile" });
    }
  });

  app.post("/api/evidence/upload", upload.single("file"), async (req, res) => {
    try {
      // ═══════════════════════════════════════════════════════════════════════
      // REQUIRED FIELD VALIDATION (Industry-ready: all uploads must be linked to a case)
      // ═══════════════════════════════════════════════════════════════════════
      const evidenceType = req.body?.evidence_type || req.body?.evidenceType;
      if (!evidenceType) {
        return badRequest(res, "MISSING_EVIDENCE_TYPE", "evidence_type is required.");
      }

      if (!req.file) {
        return badRequest(res, "MISSING_FILE", "file is required.");
      }

      // REQUIRED: psurCaseId - every upload must be linked to a PSUR case
      const psurCaseId = req.body?.psur_case_id || req.body?.psurCaseId;
      if (!psurCaseId) {
        return badRequest(res, "MISSING_PSUR_CASE_ID",
          "psur_case_id is required. Create a PSUR case first, then upload evidence for that case.");
      }

      // REQUIRED: deviceCode
      const deviceCode = req.body?.device_code || req.body?.deviceCode;
      if (!deviceCode) {
        return badRequest(res, "MISSING_DEVICE_CODE", "device_code is required.");
      }

      // REQUIRED: periodStart and periodEnd
      const periodStart = req.body?.period_start || req.body?.periodStart;
      const periodEnd = req.body?.period_end || req.body?.periodEnd;
      if (!periodStart || !periodEnd) {
        return badRequest(res, "MISSING_PERIOD",
          "period_start and period_end are required (YYYY-MM-DD format).");
      }

      const file = req.file;
      const { device_scope_id, source_system, extraction_notes, jurisdiction } = req.body;

      if (!hasSchemaFor(evidenceType)) {
        return badRequest(res, "UNSUPPORTED_EVIDENCE_TYPE",
          `Unsupported evidence_type: ${evidenceType}. Supported types: ${Object.values(CANONICAL_EVIDENCE_TYPES).join(", ")}`,
          { providedType: evidenceType }
        );
      }

      const sourceFileSha256 = computeFileSha256(file.buffer);
      const columnMappings = req.body.column_mappings ? JSON.parse(req.body.column_mappings) : null;
      const jurisdictions = req.body.jurisdictions ? JSON.parse(req.body.jurisdictions) : [];
      const mappingProfileId = req.body.mapping_profile_id ? parseInt(req.body.mapping_profile_id) : null;

      const evidenceUpload = await storage.createEvidenceUpload({
        filename: `${Date.now()}_${file.originalname}`,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        sha256Hash: sourceFileSha256,
        evidenceType: evidenceType,
        deviceScopeId: device_scope_id ? parseInt(device_scope_id) : null,
        psurCaseId: parseInt(psurCaseId), // REQUIRED - not nullable
        uploadedBy: "system",
        sourceSystem: source_system || "manual_upload",
        extractionNotes: extraction_notes || null,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
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
        parserVersion: "1.1.0",
        extractionTimestamp: new Date().toISOString(),
        jurisdiction: jurisdiction || "EU",
      };

      const fileParseResult = parseFileBuffer(file.buffer, file.originalname);
      if (!fileParseResult.success) {
        await storage.updateEvidenceUpload(evidenceUpload.id, {
          status: "failed",
          processingErrors: { errors: fileParseResult.errors },
        });
        return res.status(400).json({
          error: "Failed to parse file",
          details: fileParseResult.errors,
          upload: evidenceUpload,
        });
      }

      let rows = fileParseResult.rows;
      if (columnMappings && Object.keys(columnMappings).length > 0) {
        rows = applyColumnMapping(rows, columnMappings);
      }

      if (mappingProfileId) {
        await storage.incrementMappingProfileUsage(mappingProfileId);
      }

      const validAtoms: any[] = [];
      const rejectedRecords: Array<{
        rowIndex: number;
        errors: Array<{ path: string; message: string }>;
        row: Record<string, unknown>;
      }> = [];

      // Use centralized parser logic which supports all canonical evidence types
      const parseResult = parseEvidenceFile("", evidenceType, {
        periodStart: periodStart,
        periodEnd: periodEnd,
        defaultDeviceCode: deviceCode,
      }, rows);

      // Hard-fail if the file parses to zero records (e.g. header-only CSV)
      if (!parseResult.records || parseResult.records.length === 0) {
        await storage.updateEvidenceUpload(evidenceUpload.id, {
          status: "rejected",
          recordsParsed: 0,
          recordsRejected: 0,
          processingErrors: { errors: parseResult.errors },
          processedAt: new Date(),
        });
        return res.status(400).json({
          error: "Failed to parse evidence file",
          details: parseResult.errors,
          upload: await storage.getEvidenceUpload(evidenceUpload.id),
        });
      }

      const batch = createEvidenceAtomBatch(parseResult, evidenceUpload.id, {
        psurCaseId: parseInt(psurCaseId),
        deviceScopeId: device_scope_id ? parseInt(device_scope_id) : undefined,
        sourceSystem: source_system || "manual_upload",
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd)
      });

      for (const atom of batch.atoms) {
        validAtoms.push(atom);
      }

      for (const r of batch.rejected) {
        rejectedRecords.push({
          rowIndex: r.rowIndex,
          errors: r.validationErrors.map(e => ({ path: "/", message: e })),
          row: r.data as Record<string, unknown>
        });
      }

      if (rejectedRecords.length > 0 && validAtoms.length === 0) {
        await storage.updateEvidenceUpload(evidenceUpload.id, {
          status: "rejected",
          recordsParsed: rows.length,
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
          sampleErrors: rejectedRecords.slice(0, 3).map(r => ({
            rowIndex: r.rowIndex,
            ajvErrors: r.errors,
            row: r.row,
          })),
          upload: await storage.getEvidenceUpload(evidenceUpload.id),
        });
      }

      let persistResult = { inserted: 0, atomIds: [] as string[] };
      if (validAtoms.length > 0) {
        const atomRecords: EvidenceAtomRecord[] = validAtoms.map((a) => ({
          atomId: a.atomId,
          evidenceType: a.evidenceType,
          contentHash: a.contentHash,
          normalizedData: a.normalizedData,
          provenance: {
            uploadId: a.uploadId,
            sourceFile: a.provenance?.sourceFile || file.originalname,
            uploadedAt: a.provenance?.uploadedAt || new Date().toISOString(),
            deviceRef: { deviceCode: deviceCode },
            psurPeriod: { periodStart: periodStart, periodEnd: periodEnd },
            extractDate: a.provenance?.extractionTimestamp?.slice(0, 10),
          },
        }));

        persistResult = await persistEvidenceAtoms({
          psurCaseId: parseInt(psurCaseId),
          deviceCode: deviceCode,
          periodStart: periodStart,
          periodEnd: periodEnd,
          uploadId: evidenceUpload.id,
          atoms: atomRecords,
        });

        // Invalidate preview cache when new evidence is added
        invalidatePreviewCache(parseInt(psurCaseId));
      }

      await storage.updateEvidenceUpload(evidenceUpload.id, {
        status: validAtoms.length > 0 ? "completed" : "rejected",
        atomsCreated: persistResult.inserted,
        recordsParsed: rows.length,
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
          totalRecords: rows.length,
          validRecords: validAtoms.length,
          rejectedRecords: rejectedRecords.length,
          atomsCreated: persistResult.inserted,
          atomIds: persistResult.atomIds,
          sourceFileSha256,
        },
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

  // ============== EVIDENCE ATOM COUNTS (for PSUR Wizard) ==============
  // GET /api/evidence/atoms/counts?psur_case_id=12
  // Returns totals, counts by evidenceType, and coverage information for this PSUR case.
  // Coverage includes ALL evidence types from any source that has been uploaded,
  // not just the types that have explicit atoms.
  app.get("/api/evidence/atoms/counts", async (req, res) => {
    try {
      const psurCaseId = req.query.psur_case_id ? parseInt(req.query.psur_case_id as string) : undefined;

      if (!psurCaseId || isNaN(psurCaseId)) {
        return res.status(400).json({
          code: "MISSING_PSUR_CASE_ID",
          message: "psur_case_id is required"
        });
      }

      const atoms = await storage.getEvidenceAtoms(psurCaseId);

      const byType: Record<string, number> = {};
      let total = 0;

      for (const atom of atoms) {
        byType[atom.evidenceType] = (byType[atom.evidenceType] || 0) + 1;
        total += 1;
      }

      // Get evidence types that have at least one atom
      const typesWithData = Object.keys(byType);

      // Import source mapping to expand coverage
      const { getExpandedCoveredTypes } = await import("./src/parsers/sourceMapping");
      const { coveredTypes, coveredSources, coverageBySource } = getExpandedCoveredTypes(typesWithData);

      // Mark types as "covered" even if they have 0 atoms
      // This happens when a source is uploaded but a specific type has no data (e.g., "N/A" for recalls)
      const coveredByType: Record<string, { count: number; covered: boolean; source: string | null }> = {};

      for (const type of coveredTypes) {
        const count = byType[type] || 0;
        // Find which source this type belongs to
        let sourceForType: string | null = null;
        for (const [source, types] of Object.entries(coverageBySource)) {
          if (types.includes(type)) {
            sourceForType = source;
            break;
          }
        }
        coveredByType[type] = { count, covered: true, source: sourceForType };
      }

      res.json({
        psurCaseId,
        totals: { all: total },
        byType,
        // Enhanced coverage information
        coverage: {
          coveredSources,            // e.g., ["fsca", "complaints", "sales"]
          coveredTypes,              // ALL types from uploaded sources
          coverageBySource,          // e.g., { fsca: ["fsca_record", "recall_record", "fsca_summary"] }
          coveredByType,             // Detailed per-type coverage with counts
        },
      });
    } catch (error) {
      console.error("[GET /api/evidence/atoms/counts] Error:", error);
      res.status(500).json({ error: "Failed to get evidence atom counts" });
    }
  });

  // POST /api/evidence/atoms/batch - Create multiple atoms at once with optional decision tracing
  // OPTIMIZED: Batch all atoms into a single persistEvidenceAtoms call
  app.post("/api/evidence/atoms/batch", async (req, res) => {
    // Helper to convert Excel serial dates to ISO strings
    function excelSerialToISODate(value: unknown): string {
      if (typeof value === "string") {
        // Already a string - check if it's a valid date
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().slice(0, 10);
        }
        return value;
      }
      if (typeof value === "number") {
        // Excel serial date: days since 1899-12-30 (with leap year bug adjustment)
        // Excel considers 1900 a leap year incorrectly, so dates after Feb 28, 1900 need adjustment
        const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
        const msPerDay = 24 * 60 * 60 * 1000;
        const dateValue = new Date(excelEpoch.getTime() + value * msPerDay);
        return dateValue.toISOString().slice(0, 10);
      }
      return String(value);
    }

    try {
      const { atoms, decisionTrace, psurCaseId: batchPsurCaseId, sourceType, filename } = req.body;

      if (!Array.isArray(atoms) || atoms.length === 0) {
        return res.status(400).json({ error: "atoms must be a non-empty array" });
      }

      console.log(`[POST /api/evidence/atoms/batch] Processing ${atoms.length} atoms...`);
      const startTime = Date.now();

      const errors: Array<{ index: number; error: string }> = [];
      const atomRecords: EvidenceAtomRecord[] = [];
      const atomIdMap: Map<string, any> = new Map();

      // Prepare all atoms in memory first (fast)
      for (let i = 0; i < atoms.length; i++) {
        const atom = atoms[i];
        try {
          const atomId = makeAtomId(coerceEvType(atom.evidence_type), atom.normalized_data || {});
          const contentHash = makeContentHash(atom.normalized_data || {});

          // Normalize provenance fields - client may send different field names
          const rawProvenance = atom.provenance || {};
          const extractDate = rawProvenance.extractDate ||
            rawProvenance.extracted_at ||
            rawProvenance.uploadedAt ||
            new Date().toISOString();
          const uploadedAt = rawProvenance.uploadedAt ||
            rawProvenance.extracted_at ||
            new Date().toISOString();

          const record: EvidenceAtomRecord = {
            atomId,
            evidenceType: coerceEvType(atom.evidence_type),
            normalizedData: atom.normalized_data || {},
            contentHash,
            provenance: {
              uploadId: rawProvenance.uploadId || rawProvenance.upload_id || 0,
              sourceFile: rawProvenance.source_file || rawProvenance.sourceFile || filename || "upload",
              extractDate,
              uploadedAt,
              deviceRef: rawProvenance.deviceRef || { deviceCode: atom.device_code || "" },
              psurPeriod: rawProvenance.psurPeriod || { periodStart: atom.period_start, periodEnd: atom.period_end },
              ...(rawProvenance.mapping && { mapping: rawProvenance.mapping }),
              ...(rawProvenance.filters && { filters: rawProvenance.filters }),
              ...(sourceType && { sourceType }),
            },
          };

          atomRecords.push(record);
          atomIdMap.set(atomId, atom);
        } catch (err: any) {
          errors.push({ index: i, error: err?.message || String(err) });
        }
      }

      // Get common parameters from first atom
      const firstAtom = atoms[0];
      const periodStart = excelSerialToISODate(firstAtom.period_start);
      const periodEnd = excelSerialToISODate(firstAtom.period_end);
      const psurCaseId = firstAtom.psur_case_id || batchPsurCaseId;
      const deviceCode = firstAtom.device_code;

      // OPTIMIZED: Single batch insert
      console.log(`[POST /api/evidence/atoms/batch] Inserting ${atomRecords.length} atoms...`);
      const { inserted, atomIds: createdAtomIds } = await persistEvidenceAtoms({
        psurCaseId,
        deviceCode,
        periodStart,
        periodEnd,
        atoms: atomRecords,
      });

      console.log(`[POST /api/evidence/atoms/batch] Inserted ${inserted} atoms in ${Date.now() - startTime}ms`);

      // Auto-extract device info from device_registry_record atoms and update PSUR case
      if (psurCaseId && inserted > 0) {
        try {
          const deviceRegistryAtoms = atoms.filter((a: any) =>
            a.evidence_type === "device_registry_record" && a.normalized_data
          );

          if (deviceRegistryAtoms.length > 0) {
            // Get the most complete device info from the atoms
            const deviceAtom = deviceRegistryAtoms[0];
            const data = deviceAtom.normalized_data || {};

            // Helper to ensure value is a string (handles arrays by taking first element or joining)
            const ensureString = (value: unknown): string | undefined => {
              if (value === undefined || value === null) return undefined;
              if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined;
              return String(value);
            };

            // Extract device info fields (handle various field name formats)
            const extractedDeviceInfo: Record<string, string | undefined> = {
              deviceName: ensureString(data.device_name || data.deviceName || data.name || data.trade_name),
              deviceCode: ensureString(data.device_code || data.deviceCode || data.model || data.model_number),
              manufacturerName: ensureString(data.manufacturer_name || data.manufacturerName || data.manufacturer),
              udiDi: ensureString(data.udi_di || data.udiDi || data.udi),
              gmdnCode: ensureString(data.gmdn_code || data.gmdnCode || data.gmdn),
              riskClass: ensureString(data.risk_class || data.riskClass || data.classification),
              intendedPurpose: ensureString(data.intended_purpose || data.intendedPurpose || data.intended_use),
              extractedFrom: filename || deviceAtom.provenance?.source_file || "evidence_upload",
              extractedAt: new Date().toISOString(),
            };

            // Only update if we extracted meaningful device info
            const hasDeviceInfo = extractedDeviceInfo.deviceName || extractedDeviceInfo.manufacturerName;
            if (hasDeviceInfo) {
              // Get current case to merge device info
              const currentCase = await storage.getPSURCase(psurCaseId);
              const existingDeviceInfo = (currentCase?.deviceInfo as Record<string, unknown>) || {};

              // Merge: extracted values take precedence over existing, but don't overwrite with undefined
              const mergedDeviceInfo = { ...existingDeviceInfo };
              for (const [key, value] of Object.entries(extractedDeviceInfo)) {
                if (value !== undefined && value !== null && value !== "") {
                  mergedDeviceInfo[key] = value;
                }
              }

              await storage.updatePSURCase(psurCaseId, { deviceInfo: mergedDeviceInfo } as any);
              console.log(`[POST /api/evidence/atoms/batch] Updated PSUR case ${psurCaseId} with extracted device info:`, {
                deviceName: mergedDeviceInfo.deviceName,
                manufacturerName: mergedDeviceInfo.manufacturerName,
              });
            }
          }
        } catch (deviceErr) {
          console.warn("[POST /api/evidence/atoms/batch] Failed to extract device info:", deviceErr);
          // Don't fail the request - device info extraction is optional
        }
      }

      // Store EVIDENCE_ATOM_CREATED trace events (skip individual tracing for performance)
      // Only log a summary trace event instead of one per atom
      if (createdAtomIds.length > 0 && batchPsurCaseId) {
        try {
          const { startTrace, resumeTrace, logTraceEvent } = await import("./src/services/decisionTraceService");
          let ctx = await resumeTrace(batchPsurCaseId);
          if (!ctx) {
            ctx = await startTrace(batchPsurCaseId);
          }

          // Single batch trace event
          await logTraceEvent(ctx, {
            eventType: "EVIDENCE_ATOM_CREATED",
            actor: "batchUpload",
            workflowStep: 2,
            entityType: "evidence_batch",
            entityId: `batch-${Date.now()}`,
            outputData: {
              atomCount: createdAtomIds.length,
              evidenceTypes: [...new Set(atoms.map((a: any) => a.evidence_type))],
              sourceFile: filename || "batch_upload",
              sourceType: sourceType || "unknown",
            },
          });
        } catch (traceErr) {
          console.error("[batch] Failed to store atom traces:", traceErr);
        }
      }

      // Store ingestion decision traces if provided
      let tracesStored = 0;
      if (decisionTrace && Array.isArray(decisionTrace) && decisionTrace.length > 0) {
        try {
          const psurCaseIdForTrace = batchPsurCaseId || atoms[0]?.psur_case_id;
          if (psurCaseIdForTrace) {
            const { startTrace, resumeTrace, logTraceEventBatch } = await import("./src/services/decisionTraceService");

            // Get or create trace context
            let ctx = await resumeTrace(psurCaseIdForTrace);
            if (!ctx) {
              ctx = await startTrace(psurCaseIdForTrace);
            }

            // Log ingestion traces
            const traceEvents = decisionTrace.map((t: any) => ({
              eventType: "EVIDENCE_UPLOADED" as const,
              actor: "ingestionAgent",
              workflowStep: 3,
              entityType: "evidence_extraction",
              entityId: t.traceId,
              decision: t.decision,
              inputData: {
                stage: t.stage,
                inputSummary: t.inputSummary,
                filename: filename || "unknown",
                sourceType: sourceType || "unknown",
              },
              outputData: {
                outputSummary: t.outputSummary,
                confidence: t.confidence,
                alternativesConsidered: t.alternativesConsidered,
              },
              reasons: t.reasoning,
              relatedEntityIds: createdAtomIds.slice(0, 10), // Link to created atoms
            }));

            await logTraceEventBatch(ctx, traceEvents);
            tracesStored = traceEvents.length;
            console.log(`[POST /api/evidence/atoms/batch] Stored ${tracesStored} decision traces for PSUR case ${psurCaseIdForTrace}`);
          }
        } catch (traceErr: any) {
          console.warn(`[POST /api/evidence/atoms/batch] Failed to store decision traces:`, traceErr?.message);
        }
      }

      console.log(`[POST /api/evidence/atoms/batch] Complete: ${inserted} atoms, ${tracesStored} traces in ${Date.now() - startTime}ms`);

      res.json({
        success: true,
        created: inserted,
        atomIds: createdAtomIds,
        tracesStored,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("[POST /api/evidence/atoms/batch] Error:", error);
      res.status(500).json({ error: error?.message || "Failed to create atoms" });
    }
  });

  // ============== MARK EVIDENCE TYPE AS N/A (NOT APPLICABLE) ==============
  // Creates a "negative evidence" atom for evidence types where there is genuinely no data
  // e.g., "No FSCAs during period", "No CAPAs", etc.
  app.post("/api/evidence/mark-na", async (req, res) => {
    try {
      const {
        psurCaseId,
        deviceCode,
        periodStart,
        periodEnd,
        evidenceTypes, // Array of evidence types to mark as N/A
        reason // Optional reason/justification
      } = req.body;

      if (!psurCaseId || !deviceCode || !periodStart || !periodEnd || !evidenceTypes || !Array.isArray(evidenceTypes)) {
        return res.status(400).json({
          error: "Missing required fields: psurCaseId, deviceCode, periodStart, periodEnd, evidenceTypes (array)"
        });
      }

      const createdAtomIds: string[] = [];
      const errors: Array<{ evidenceType: string; error: string }> = [];

      for (const evidenceType of evidenceTypes) {
        try {
          const normalizedType = coerceEvType(evidenceType);

          // Create negative evidence atom
          const normalizedData = {
            isNegativeEvidence: true,
            count: 0,
            periodStart,
            periodEnd,
            deviceCode,
            statement: reason || `No ${evidenceType.replace(/_/g, " ")} events reported during the PSUR period.`,
            verificationDate: new Date().toISOString(),
            verifiedBy: "user",
          };

          const atomId = makeAtomId(normalizedType, normalizedData);
          const contentHash = makeContentHash(normalizedData);

          const record: EvidenceAtomRecord = {
            atomId,
            evidenceType: normalizedType,
            normalizedData,
            contentHash,
            provenance: {
              uploadId: 0,
              sourceFile: "user_marked_na",
              extractDate: new Date().toISOString(),
              uploadedAt: new Date().toISOString(),
              deviceRef: { deviceCode },
              psurPeriod: { periodStart, periodEnd },
              verificationMethod: "user_confirmation",
            },
          };

          await persistEvidenceAtoms({
            psurCaseId,
            deviceCode,
            periodStart,
            periodEnd,
            atoms: [record],
          });

          createdAtomIds.push(atomId);

          // Log trace event
          try {
            const { startTrace, resumeTrace, logTraceEvent } = await import("./src/services/decisionTraceService");
            let ctx = await resumeTrace(psurCaseId);
            if (!ctx) {
              ctx = await startTrace(psurCaseId);
            }

            await logTraceEvent(ctx, {
              eventType: "NEGATIVE_EVIDENCE_CREATED",
              actor: "user",
              workflowStep: 2,
              entityType: "evidence_atom",
              entityId: atomId,
              decision: `User marked ${evidenceType} as N/A`,
              inputData: { evidenceType, reason },
              outputData: { atomId, isNegative: true },
              reasons: [reason || "User confirmed no data for this evidence type"],
            });
          } catch (traceErr) {
            console.warn("[mark-na] Failed to log trace:", traceErr);
          }

        } catch (err: any) {
          errors.push({ evidenceType, error: err?.message || String(err) });
        }
      }

      res.json({
        success: true,
        created: createdAtomIds.length,
        atomIds: createdAtomIds,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("[POST /api/evidence/mark-na] Error:", error);
      res.status(500).json({ error: error?.message || "Failed to mark evidence as N/A" });
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

      // Invalidate preview cache when new evidence is added
      if (parsed.data.psurCaseId) {
        invalidatePreviewCache(parsed.data.psurCaseId);
      }

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
      const proposalInput: SlotProposalInput = {
        slotId: req.body.slotId,
        templateId: req.body.templateId,
        content: req.body.content,
        evidenceAtomIds: req.body.evidenceAtomIds || [],
        claimedObligationIds: req.body.claimedObligationIds || [],
        methodStatement: req.body.methodStatement || "",
        transformations: req.body.transformations,
        confidenceScore: req.body.confidenceScore,
        psurCaseId: req.body.psurCaseId,
        status: req.body.status,
      };

      const validation = validateSlotProposal(proposalInput);
      if (!validation.valid) {
        return res.status(400).json({
          error: "Slot proposal validation failed",
          validationErrors: validation.errors,
          warnings: validation.warnings
        });
      }

      if (proposalInput.evidenceAtomIds.length > 0) {
        const atoms = await storage.getEvidenceAtomsByIds(proposalInput.evidenceAtomIds);
        const foundIds = atoms.map(a => a.id);
        const missingAtomIds = proposalInput.evidenceAtomIds.filter(id => !foundIds.includes(id));
        if (missingAtomIds.length > 0) {
          return res.status(400).json({
            error: "Referenced evidence atoms do not exist",
            missingAtomIds
          });
        }
      }

      const parsed = insertSlotProposalSchema.safeParse({
        ...req.body,
        evidenceAtomIds: proposalInput.evidenceAtomIds,
        claimedObligationIds: proposalInput.claimedObligationIds,
        methodStatement: proposalInput.methodStatement,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors });
      }

      const proposal = await storage.createSlotProposal(parsed.data);
      res.status(201).json({
        proposal,
        validationWarnings: validation.warnings.length > 0 ? validation.warnings : undefined
      });
    } catch (error) {
      console.error("Slot proposal creation error:", error);
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

  app.post("/api/slot-proposals/:id/adjudicate", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { decision, rejectionReasons } = req.body;

      if (!["accepted", "rejected", "needs_review"].includes(decision)) {
        return res.status(400).json({ error: "Invalid decision. Use: accepted, rejected, needs_review" });
      }

      const proposal = await storage.getSlotProposal(id);
      if (!proposal) {
        return res.status(404).json({ error: "Slot proposal not found" });
      }

      if (decision === "accepted") {
        const proposalInput: SlotProposalInput = {
          slotId: proposal.slotId,
          templateId: proposal.templateId,
          content: proposal.content || undefined,
          evidenceAtomIds: proposal.evidenceAtomIds || [],
          claimedObligationIds: proposal.claimedObligationIds || [],
          methodStatement: proposal.methodStatement,
          transformations: proposal.transformations || undefined,
          psurCaseId: proposal.psurCaseId || undefined,
        };

        const obligationsResult = await listObligations();
        if (!obligationsResult.success || !obligationsResult.data || obligationsResult.data.length === 0) {
          return res.status(500).json({
            error: "Cannot validate proposal - failed to retrieve valid obligations from orchestrator",
            orchestratorError: obligationsResult.error
          });
        }
        const validObligationIds = obligationsResult.data.map((o: { id: string }) => o.id);

        const adjValidation = validateSlotProposalForAdjudication(proposalInput, validObligationIds);
        if (!adjValidation.valid) {
          return res.status(400).json({
            error: "Proposal cannot be accepted - validation failed",
            validationErrors: adjValidation.errors,
            warnings: adjValidation.warnings
          });
        }
      }

      const updatedProposal = await storage.updateSlotProposal(id, {
        status: decision,
        rejectionReasons: decision === "rejected" ? rejectionReasons : null,
        adjudicatedAt: new Date(),
        adjudicationResult: {
          decision,
          adjudicatedAt: new Date().toISOString(),
          rejectionReasons: decision === "rejected" ? rejectionReasons : undefined,
        }
      });

      res.json(updatedProposal);
    } catch (error) {
      console.error("Adjudication error:", error);
      res.status(500).json({ error: "Failed to adjudicate slot proposal" });
    }
  });

  // ============== DETERMINISTIC SLOT GENERATION ==============
  app.post("/api/slots/generate-deterministic", async (req, res) => {
    try {
      const { psurCaseId: rawPsurCaseId, psurRef, slotId, autoAdjudicate = true } = req.body;

      if ((!rawPsurCaseId && !psurRef) || !slotId) {
        return res.status(400).json({ error: "psurCaseId (or psurRef) and slotId are required" });
      }

      const { isDeterministicSupported, runDeterministicGenerator } = await import("./deterministic-generators");
      const { buildCoverageSlotQueue } = await import("./queue-builder");

      if (!isDeterministicSupported(slotId)) {
        return res.status(400).json({
          error: `Slot ${slotId} does not support deterministic generation`,
          supportedSlots: ["F.11.complaints_by_region_severity", "PSUR.COMPLAINTS.SUMMARY_BY_REGION_SERIOUSNESS"]
        });
      }

      // Resolve psurCaseId from psurRef if needed
      let psurCaseId = rawPsurCaseId;
      let psurCase;

      if (psurRef && !rawPsurCaseId) {
        // Look up PSUR case by reference
        const allCases = await storage.getPSURCases();
        psurCase = allCases.find(c => c.psurReference === psurRef);
        if (!psurCase) {
          return res.status(404).json({ error: `PSUR case not found for reference: ${psurRef}` });
        }
        psurCaseId = psurCase.id;
      } else {
        psurCase = await storage.getPSURCase(psurCaseId);
        if (!psurCase) {
          return res.status(404).json({ error: "PSUR case not found" });
        }
      }

      const evidenceAtoms = await storage.getEvidenceAtoms(psurCaseId);

      // Normalize atoms before validation (Step 3)
      const normalizedAtoms = normalizeEvidenceAtoms(evidenceAtoms, {
        deviceCode: "UNKNOWN_DEVICE",
        periodStart: psurCase.startPeriod.toISOString(),
        periodEnd: psurCase.endPeriod.toISOString(),
      });
      console.log("[DEBUG] atom sample", normalizedAtoms?.[0]);

      const result = runDeterministicGenerator(slotId, evidenceAtoms, psurCase, psurCase.templateId);

      // GENERATION FAILURE - return with error details
      if (!result.success) {
        return res.status(422).json({
          success: false,
          error: "Deterministic generation failed",
          details: result.error,
          errorDetails: result.errorDetails,
          slotId: result.slotId,
          proposalId: result.proposalId,
          agentId: result.agentId,
        });
      }

      // ADJUDICATION ENFORCEMENT: Reject if evidence_atom_ids is empty
      if (result.evidenceAtomIds.length === 0) {
        return res.status(422).json({
          success: false,
          adjudication: "REJECTED",
          reasons: ["evidence_atom_ids is empty - slot requires in-period evidence"],
          error: "Adjudication rejected: No evidence atoms",
          adjudicationResult: {
            decision: "rejected",
            reason: "evidence_atom_ids is empty - slot requires in-period evidence",
            rejectedAt: new Date().toISOString(),
          },
          slotId: result.slotId,
          proposalId: result.proposalId,
          agentId: result.agentId,
        });
      }

      // ADJUDICATION ENFORCEMENT: Verify all evidence atoms are in-period
      const periodStart = new Date(psurCase.startPeriod);
      const periodEnd = new Date(psurCase.endPeriod);
      const outOfPeriodAtoms: number[] = [];

      for (const atomId of result.evidenceAtomIds) {
        const atom = evidenceAtoms.find(a => a.id === atomId);
        if (atom) {
          const normalizedData = atom.normalizedData as Record<string, unknown> | null;
          const complaintDateRaw = normalizedData?.complaintDate;
          if (complaintDateRaw) {
            const complaintDate = new Date(complaintDateRaw as string);
            if (complaintDate < periodStart || complaintDate > periodEnd) {
              outOfPeriodAtoms.push(atomId);
            }
          }
        }
      }

      if (outOfPeriodAtoms.length > 0) {
        return res.status(422).json({
          success: false,
          adjudication: "REJECTED",
          reasons: [`${outOfPeriodAtoms.length} evidence atoms are outside the PSUR period`],
          error: "Adjudication rejected: Out-of-period evidence atoms detected",
          adjudicationResult: {
            decision: "rejected",
            reason: `${outOfPeriodAtoms.length} evidence atoms are outside the PSUR period`,
            outOfPeriodAtomIds: outOfPeriodAtoms,
            rejectedAt: new Date().toISOString(),
          },
          slotId: result.slotId,
          proposalId: result.proposalId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
      }

      // Build adjudication result
      const adjudicationResult = autoAdjudicate ? {
        decision: "accepted" as const,
        adjudicatedAt: new Date().toISOString(),
        autoAdjudicated: true,
        reason: "Deterministic generation - no AI inference",
        agentId: result.agentId,
        contentHash: result.contentHash,
        evidenceAtomCount: result.evidenceAtomIds.length,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      } : null;

      // Normalize proposals before validation (Step 4)
      const template = loadTemplate(psurCase.templateId);
      const rawProposal = {
        psurCaseId,
        psurRef: psurCase.psurReference,
        slotId: result.slotId,
        templateId: psurCase.templateId,
        content: JSON.stringify(result.content),
        evidenceAtomIds: result.evidenceAtomIds,
        claimedObligationIds: result.claimedObligationIds,
        methodStatement: result.methodStatement,
        transformations: result.transformationsUsed,
        obligationIds: result.claimedObligationIds,
        confidenceScore: "1.0",
        status: autoAdjudicate ? "accepted" : "pending",
        adjudicationResult,
        adjudicatedAt: autoAdjudicate ? new Date() : null
      };
      const [normalizedProposal] = normalizeSlotProposals([rawProposal], template);
      console.log("[DEBUG] proposal sample", normalizedProposal);

      const proposalData = {
        ...normalizedProposal,
        psurCaseId,
        templateId: psurCase.templateId,
      };

      // PERSIST the SlotProposal
      const proposal = await storage.createSlotProposal(proposalData);

      // RECOMPUTE COVERAGE after acceptance
      let coverageSummary = null;
      let coverageDelta = null;

      if (autoAdjudicate) {
        // Get all accepted proposals for this PSUR case
        const allProposals = await storage.getSlotProposals(psurCaseId);
        const acceptedProposals = allProposals.filter(p => p.status === "accepted");

        // Build coverage queue to get updated coverage summary
        const coverageOutput = buildCoverageSlotQueue({
          psurReference: psurCase.psurReference,
          profileId: psurCase.templateId,
          jurisdictions: psurCase.jurisdictions || [],
          evidenceAtoms,
          acceptedProposals,
          periodStart,
          periodEnd,
        });

        coverageSummary = {
          mandatory_remaining: coverageOutput.coverageSummary.mandatoryObligationsRemaining,
          required_slots_remaining: coverageOutput.coverageSummary.requiredSlotsRemaining,
          satisfied_obligations_count: coverageOutput.coverageSummary.mandatoryObligationsSatisfied,
          mandatory_total: coverageOutput.coverageSummary.mandatoryObligationsTotal,
          required_slots_total: coverageOutput.coverageSummary.requiredSlotsTotal,
          required_slots_filled: coverageOutput.coverageSummary.requiredSlotsFilled,
        };

        // Calculate delta (coverage before vs after this proposal)
        const proposalsBefore = acceptedProposals.filter(p => p.id !== proposal.id);
        const coverageBefore = buildCoverageSlotQueue({
          psurReference: psurCase.psurReference,
          profileId: psurCase.templateId,
          jurisdictions: psurCase.jurisdictions || [],
          evidenceAtoms,
          acceptedProposals: proposalsBefore,
          periodStart,
          periodEnd,
        });

        coverageDelta = {
          obligations_satisfied_delta: coverageOutput.coverageSummary.mandatoryObligationsSatisfied - coverageBefore.coverageSummary.mandatoryObligationsSatisfied,
          slots_filled_delta: coverageOutput.coverageSummary.requiredSlotsFilled - coverageBefore.coverageSummary.requiredSlotsFilled,
        };
      }

      // FULL DEBUG PAYLOAD
      res.status(201).json({
        success: true,
        proposalId: result.proposalId,

        // Component-compatible fields
        adjudication: autoAdjudicate ? "ACCEPTED" : "PENDING",
        reasons: [], // Empty for accepted proposals

        // Full proposal JSON
        proposal: {
          id: proposal.id,
          psurCaseId: proposal.psurCaseId,
          slotId: proposal.slotId,
          templateId: proposal.templateId,
          content: result.content,
          evidenceAtomIds: proposal.evidenceAtomIds,
          claimedObligationIds: proposal.claimedObligationIds,
          methodStatement: proposal.methodStatement,
          transformations: proposal.transformations,
          obligationIds: proposal.obligationIds,
          confidenceScore: proposal.confidenceScore,
          status: proposal.status,
          createdAt: proposal.createdAt,
          adjudicatedAt: proposal.adjudicatedAt,
        },

        // Adjudication result with reasons
        adjudicationResult: adjudicationResult ? {
          ...adjudicationResult,
          proposalAccepted: true,
        } : { decision: "pending", proposalAccepted: false },

        // Generation result details
        generationResult: {
          contentType: result.contentType,
          contentHash: result.contentHash,
          evidenceAtomCount: result.evidenceAtomIds.length,
          evidenceAtomIds: result.evidenceAtomIds,
          methodStatement: result.methodStatement,
          transformationsUsed: result.transformationsUsed,
          agentId: result.agentId,
          autoAdjudicated: autoAdjudicate,
        },

        // Coverage summary after persistence
        coverageSummary,
        coverageDelta,

        // Period context
        periodContext: {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          totalEvidenceAtoms: evidenceAtoms.length,
          inPeriodEvidenceAtoms: result.evidenceAtomIds.length,
        },

        // Debug output from generator
        debug: (result as { debug?: Record<string, unknown> }).debug || null,
      });
    } catch (error) {
      console.error("Deterministic generation error:", error);
      res.status(500).json({ error: "Failed to generate slot deterministically" });
    }
  });

  app.get("/api/slots/deterministic-supported", async (req, res) => {
    try {
      const { DETERMINISTIC_SUPPORTED_SLOTS } = await import("./deterministic-generators");
      const slotId = req.query.slotId as string | undefined;
      const slotsArray = Array.from(DETERMINISTIC_SUPPORTED_SLOTS);
      res.json({
        supportedSlots: slotsArray,
        supportedSlotIds: slotsArray, // Alias for component compatibility
        isSupported: slotId ? DETERMINISTIC_SUPPORTED_SLOTS.has(slotId) : null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get supported slots" });
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

  // Download audit bundle as ZIP
  app.get("/api/audit-bundles/:psurCaseId/download", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);

      // Get the bundle record
      const bundles = await storage.getAuditBundles(psurCaseId);
      if (!bundles || bundles.length === 0) {
        return res.status(404).json({ error: "Audit bundle not found for this case" });
      }
      const bundle = bundles[0];

      // Get the PSUR case
      const psurCase = await storage.getPSURCase(psurCaseId);
      if (!psurCase) {
        return res.status(404).json({ error: "PSUR case not found" });
      }

      // Get evidence atoms for this case
      const evidenceAtoms = await storage.getEvidenceAtoms(psurCaseId);

      // Get coverage slot queues
      const coverageQueues = await storage.getCoverageSlotQueues(psurCaseId);
      const latestCoverage = coverageQueues.length > 0 ? coverageQueues[0] : null;

      // Get slot proposals for this case
      const proposals = await storage.getSlotProposals(psurCaseId);
      const acceptedProposals = proposals.filter(p => p.status === "accepted");

      // Build the bundle files - fetch complete decision trace from database
      const {
        exportTraceAsJsonl: exportTrace,
        exportTraceSummary: exportSummary,
        verifyTraceChain: verifyChain
      } = await import("./src/services/decisionTraceService");

      // Get complete trace JSONL from database
      let traceJsonlContent = "";
      let traceSummaryData: any = null;
      let traceVerification: any = null;

      try {
        traceJsonlContent = await exportTrace(psurCaseId);
        traceSummaryData = await exportSummary(psurCaseId);
        if (traceSummaryData.summary?.traceId) {
          traceVerification = await verifyChain(traceSummaryData.summary.traceId);
        }
      } catch (e) {
        console.warn("Could not fetch decision trace from database, using fallback:", e);
      }

      // Fallback trace data if DB trace not available
      const traceData = traceJsonlContent ? null : {
        bundleReference: bundle.bundleReference,
        psurCaseId: psurCaseId,
        psurReference: psurCase.psurReference,
        exportedAt: bundle.exportedAt,
        events: [
          { timestamp: psurCase.createdAt, event: "case_created", data: { psurReference: psurCase.psurReference } },
          { timestamp: bundle.exportedAt, event: "bundle_exported", data: { bundleReference: bundle.bundleReference } },
        ],
        warning: "Decision trace database not populated - this is a minimal fallback trace"
      };

      const coverageReport = latestCoverage ? {
        psurCaseId,
        psurReference: psurCase.psurReference,
        profileId: latestCoverage.profileId,
        mandatoryObligationsTotal: latestCoverage.mandatoryObligationsTotal,
        mandatoryObligationsSatisfied: latestCoverage.mandatoryObligationsSatisfied,
        mandatoryObligationsRemaining: latestCoverage.mandatoryObligationsRemaining,
        requiredSlotsTotal: latestCoverage.requiredSlotsTotal,
        requiredSlotsFilled: latestCoverage.requiredSlotsFilled,
        requiredSlotsRemaining: latestCoverage.requiredSlotsRemaining,
        queue: latestCoverage.queue,
        generatedAt: latestCoverage.generatedAt,
      } : {
        psurCaseId,
        psurReference: psurCase.psurReference,
        message: "No coverage report available"
      };

      const evidenceRegister = {
        psurCaseId,
        psurReference: psurCase.psurReference,
        totalAtoms: evidenceAtoms.length,
        atoms: evidenceAtoms.map(a => ({
          atomId: a.atomId,
          evidenceType: a.evidenceType,
          provenance: a.provenance,
          createdAt: a.createdAt,
        })),
        byType: evidenceAtoms.reduce((acc: Record<string, number>, a) => {
          acc[a.evidenceType] = (acc[a.evidenceType] || 0) + 1;
          return acc;
        }, {}),
      };

      // Fetch actual qualification report from database
      const dbQualReport = await storage.getQualificationReport(psurCaseId);
      const qualificationReport = dbQualReport ? {
        psurCaseId,
        psurReference: psurCase.psurReference,
        templateId: dbQualReport.templateId,
        jurisdictions: dbQualReport.jurisdictions,
        status: dbQualReport.status,
        slotCount: dbQualReport.slotCount,
        mappingCount: dbQualReport.mappingCount,
        mandatoryObligationsTotal: dbQualReport.mandatoryObligationsTotal,
        mandatoryObligationsFound: dbQualReport.mandatoryObligationsFound,
        missingObligations: dbQualReport.missingObligations,
        constraints: dbQualReport.constraints,
        blockingErrors: dbQualReport.blockingErrors,
        validatedAt: dbQualReport.validatedAt,
      } : {
        psurCaseId,
        psurReference: psurCase.psurReference,
        templateId: psurCase.templateId,
        jurisdictions: psurCase.jurisdictions,
        status: "NO_QUALIFICATION_RUN",
        mandatoryObligationsTotal: 0,
        mandatoryObligationsFound: 0,
        missingObligations: [],
        blockingErrors: ["No qualification report found - run the workflow first"],
      };

      // SOTA: Generate PSUR using CompileOrchestrator with LLM-powered agents
      console.log(`[Audit Bundle] Generating SOTA documents for case ${psurCaseId}`);

      const devices = await storage.getDevices();
      const psurCaseAny = psurCase as any;
      const deviceCode = psurCaseAny.deviceCode || (psurCaseAny.deviceId ? devices.find((d: any) => d.id === psurCaseAny.deviceId)?.deviceCode : null) || devices[0]?.deviceCode || "DEVICE-001";

      const { CompileOrchestrator } = await import("./src/agents/runtime/compileOrchestrator");
      const orchestrator = new CompileOrchestrator();

      const compileResult = await orchestrator.compile({
        psurCaseId,
        templateId: psurCase.templateId,
        deviceCode: deviceCode,
        periodStart: psurCase.startPeriod.toISOString().split("T")[0],
        periodEnd: psurCase.endPeriod.toISOString().split("T")[0],
        documentStyle: "corporate",
        enableCharts: true,
      });

      // Build markdown from SOTA sections
      const markdownParts: string[] = [];
      markdownParts.push(`# PERIODIC SAFETY UPDATE REPORT`);
      markdownParts.push(``);
      markdownParts.push(`**PSUR Reference:** ${psurCase.psurReference}`);
      markdownParts.push(`**Reporting Period:** ${psurCase.startPeriod.toISOString().split("T")[0]} to ${psurCase.endPeriod.toISOString().split("T")[0]}`);
      markdownParts.push(`**Generated:** ${new Date().toISOString()}`);
      markdownParts.push(``);
      markdownParts.push(`---`);
      markdownParts.push(``);

      for (const section of compileResult.sections) {
        markdownParts.push(`## ${section.title}`);
        markdownParts.push(``);
        markdownParts.push(section.content);
        markdownParts.push(``);
        if (section.evidenceAtomIds.length > 0) {
          markdownParts.push(`*Evidence: ${section.evidenceAtomIds.slice(0, 5).join(", ")}${section.evidenceAtomIds.length > 5 ? ` +${section.evidenceAtomIds.length - 5} more` : ""}*`);
          markdownParts.push(``);
        }
        markdownParts.push(`---`);
        markdownParts.push(``);
      }

      const psurMarkdown = markdownParts.join("\n");
      const psurDocx = compileResult.success && compileResult.document ? compileResult.document.buffer : null;

      console.log(`[Audit Bundle] SOTA compilation: ${compileResult.sections.length} sections, success=${compileResult.success}`);

      // Create ZIP file using archiver
      const archiver = await import("archiver");
      const archive = archiver.default("zip", { zlib: { level: 9 } });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${bundle.bundleReference}.zip"`);

      archive.pipe(res);

      // Append trace.jsonl - use database trace if available, fallback otherwise
      if (traceJsonlContent) {
        archive.append(traceJsonlContent, { name: "trace.jsonl" });
      } else {
        archive.append(JSON.stringify(traceData, null, 2), { name: "trace.jsonl" });
      }

      // Append trace summary with verification info
      if (traceSummaryData) {
        archive.append(JSON.stringify({
          ...traceSummaryData,
          verification: traceVerification,
        }, null, 2), { name: "trace_summary.json" });
      }

      archive.append(JSON.stringify(coverageReport, null, 2), { name: "coverage_report.json" });
      archive.append(JSON.stringify(evidenceRegister, null, 2), { name: "evidence_register.json" });
      archive.append(JSON.stringify(qualificationReport, null, 2), { name: "qualification_report.json" });
      archive.append(psurMarkdown, { name: "psur.md" });

      // Include compile result details
      archive.append(JSON.stringify({
        success: compileResult.success,
        errors: compileResult.errors,
        warnings: compileResult.warnings,
        sectionCount: compileResult.sections.length,
        chartCount: compileResult.charts.length,
      }, null, 2), { name: "compile_report.json" });

      if (psurDocx) {
        archive.append(psurDocx, { name: "psur.docx" });
      }

      await archive.finalize();
    } catch (error: any) {
      console.error("[GET /api/audit-bundles/:psurCaseId/download] Error:", error);
      res.status(500).json({ error: "Failed to download audit bundle", details: error.message });
    }
  });

  // ============== DECISION TRACE API ==============
  // Import decision trace service with enhanced traceability features
  const {
    queryTraceEntries,
    getTraceSummary,
    getSlotDecisionChain,
    getEntityTrace,
    verifyTraceChain,
    exportTraceAsJsonl,
    exportTraceSummary,
    exportAuditNarrative,
    searchTraces,
    queryTracesByObligation,
    getObligationContext,
  } = await import("./src/services/decisionTraceService");

  // Get trace summary for a PSUR case
  app.get("/api/psur-cases/:psurCaseId/trace/summary", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const summary = await getTraceSummary(psurCaseId);

      if (!summary) {
        return res.status(404).json({ error: "No trace found for this case" });
      }

      res.json(summary);
    } catch (error: any) {
      console.error("[GET /api/psur-cases/:psurCaseId/trace/summary] Error:", error);
      res.status(500).json({ error: "Failed to get trace summary", details: error.message });
    }
  });

  // Get trace entries with filters
  app.get("/api/psur-cases/:psurCaseId/trace/entries", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const eventTypes = req.query.eventTypes
        ? (req.query.eventTypes as string).split(",") as any[]
        : undefined;
      const entityType = req.query.entityType as string | undefined;
      const entityId = req.query.entityId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const orderBy = (req.query.orderBy as "asc" | "desc") || "asc";

      const entries = await queryTraceEntries({
        psurCaseId,
        eventTypes,
        entityType,
        entityId,
        limit,
        offset,
        orderBy,
      });

      res.json({
        psurCaseId,
        count: entries.length,
        limit,
        offset,
        entries,
      });
    } catch (error: any) {
      console.error("[GET /api/psur-cases/:psurCaseId/trace/entries] Error:", error);
      res.status(500).json({ error: "Failed to get trace entries", details: error.message });
    }
  });

  // Get decision chain for a specific slot
  app.get("/api/psur-cases/:psurCaseId/trace/slots/:slotId", async (req, res) => {
    try {
      const slotId = req.params.slotId;
      const chain = await getSlotDecisionChain(slotId);

      res.json({
        slotId,
        decisionChain: chain,
      });
    } catch (error: any) {
      console.error("[GET /api/psur-cases/:psurCaseId/trace/slots/:slotId] Error:", error);
      res.status(500).json({ error: "Failed to get slot decision chain", details: error.message });
    }
  });

  // Get trace for a specific entity (evidence atom, obligation, etc.)
  app.get("/api/trace/entity/:entityType/:entityId", async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const entries = await getEntityTrace(entityType, entityId);

      res.json({
        entityType,
        entityId,
        traceCount: entries.length,
        entries,
      });
    } catch (error: any) {
      console.error("[GET /api/trace/entity/:entityType/:entityId] Error:", error);
      res.status(500).json({ error: "Failed to get entity trace", details: error.message });
    }
  });

  // Verify trace chain integrity
  app.get("/api/psur-cases/:psurCaseId/trace/verify", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const summary = await getTraceSummary(psurCaseId);

      if (!summary) {
        return res.status(404).json({ error: "No trace found for this case" });
      }

      const validation = await verifyTraceChain(summary.traceId);

      res.json({
        psurCaseId,
        traceId: summary.traceId,
        validation,
      });
    } catch (error: any) {
      console.error("[GET /api/psur-cases/:psurCaseId/trace/verify] Error:", error);
      res.status(500).json({ error: "Failed to verify trace chain", details: error.message });
    }
  });

  // Export trace as JSONL (for audit bundle)
  app.get("/api/psur-cases/:psurCaseId/trace/export", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const format = req.query.format as string || "jsonl";

      if (format === "jsonl") {
        const jsonl = await exportTraceAsJsonl(psurCaseId);
        res.setHeader("Content-Type", "application/x-ndjson");
        res.setHeader("Content-Disposition", `attachment; filename="trace-${psurCaseId}.jsonl"`);
        res.send(jsonl);
      } else if (format === "summary") {
        const exportData = await exportTraceSummary(psurCaseId);
        res.json(exportData);
      } else {
        res.status(400).json({ error: "Invalid format. Use 'jsonl' or 'summary'" });
      }
    } catch (error: any) {
      console.error("[GET /api/psur-cases/:psurCaseId/trace/export] Error:", error);
      res.status(500).json({ error: "Failed to export trace", details: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ENHANCED TRACEABILITY API - Natural Language & GRKB Integration
  // ═══════════════════════════════════════════════════════════════════════════════

  // Natural language search across trace entries
  app.get("/api/psur-cases/:psurCaseId/trace/search", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const searchText = req.query.q as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      if (!searchText || searchText.trim().length === 0) {
        return res.status(400).json({ error: "Search query 'q' is required" });
      }

      const entries = await searchTraces(psurCaseId, searchText, limit);

      res.json({
        psurCaseId,
        searchQuery: searchText,
        resultCount: entries.length,
        results: entries.map(e => ({
          sequenceNum: e.sequenceNum,
          timestamp: e.eventTimestamp,
          eventType: e.eventType,
          entityType: e.entityType,
          entityId: e.entityId,
          decision: e.decision,
          humanSummary: e.humanSummary,
          regulatoryContext: e.regulatoryContext,
          complianceAssertion: e.complianceAssertion,
        })),
      });
    } catch (error: any) {
      console.error("[GET /api/psur-cases/:psurCaseId/trace/search] Error:", error);
      res.status(500).json({ error: "Failed to search traces", details: error.message });
    }
  });

  // Query traces by GRKB obligation ID
  app.get("/api/psur-cases/:psurCaseId/trace/obligation/:obligationId", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const obligationId = req.params.obligationId;

      // Get obligation context from GRKB
      const obligationContext = await getObligationContext(obligationId);

      // Get all traces related to this obligation
      const entries = await queryTracesByObligation(psurCaseId, obligationId);

      res.json({
        psurCaseId,
        obligationId,
        obligationContext: obligationContext ? {
          title: obligationContext.title,
          text: obligationContext.text,
          sourceCitation: obligationContext.sourceCitation,
          jurisdiction: obligationContext.jurisdiction,
          mandatory: obligationContext.mandatory,
        } : null,
        traceCount: entries.length,
        traces: entries.map(e => ({
          sequenceNum: e.sequenceNum,
          timestamp: e.eventTimestamp,
          eventType: e.eventType,
          entityType: e.entityType,
          entityId: e.entityId,
          decision: e.decision,
          humanSummary: e.humanSummary,
          complianceAssertion: e.complianceAssertion,
        })),
      });
    } catch (error: any) {
      console.error("[GET /api/psur-cases/:psurCaseId/trace/obligation/:obligationId] Error:", error);
      res.status(500).json({ error: "Failed to query traces by obligation", details: error.message });
    }
  });

  // Export plain-English audit narrative for regulatory review
  app.get("/api/psur-cases/:psurCaseId/trace/narrative", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const format = req.query.format as string || "text";

      const narrative = await exportAuditNarrative(psurCaseId);

      if (format === "download") {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="audit-narrative-${psurCaseId}.txt"`);
        res.send(narrative);
      } else if (format === "json") {
        // Split into sections for structured consumption
        const lines = narrative.split("\n");
        const sections: { title: string; content: string[] }[] = [];
        let currentSection: { title: string; content: string[] } | null = null;

        for (const line of lines) {
          if (line.startsWith("## ")) {
            if (currentSection) sections.push(currentSection);
            currentSection = { title: line.replace("## ", ""), content: [] };
          } else if (currentSection) {
            currentSection.content.push(line);
          }
        }
        if (currentSection) sections.push(currentSection);

        res.json({
          psurCaseId,
          generatedAt: new Date().toISOString(),
          sections,
          fullText: narrative,
        });
      } else {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.send(narrative);
      }
    } catch (error: any) {
      console.error("[GET /api/psur-cases/:psurCaseId/trace/narrative] Error:", error);
      res.status(500).json({ error: "Failed to export audit narrative", details: error.message });
    }
  });

  // Get human-readable timeline view of all decisions
  app.get("/api/psur-cases/:psurCaseId/trace/timeline", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

      const entries = await queryTraceEntries({
        psurCaseId,
        orderBy: "asc",
        limit,
      });

      const timeline = entries.map(e => ({
        timestamp: e.eventTimestamp,
        step: e.workflowStep,
        event: e.eventType,
        entity: e.entityType ? `${e.entityType}:${e.entityId}` : null,
        decision: e.decision,
        summary: e.humanSummary || `[${e.eventType}] ${e.decision || ""} - ${e.entityId || ""}`,
        hasRegulatoryContext: !!e.regulatoryContext,
        complianceStatus: e.complianceAssertion
          ? (e.complianceAssertion as any).riskLevel || "unknown"
          : "not_applicable",
      }));

      res.json({
        psurCaseId,
        eventCount: timeline.length,
        timeline,
      });
    } catch (error: any) {
      console.error("[GET /api/psur-cases/:psurCaseId/trace/timeline] Error:", error);
      res.status(500).json({ error: "Failed to get trace timeline", details: error.message });
    }
  });

  // Get compliance summary from traces
  app.get("/api/psur-cases/:psurCaseId/trace/compliance-summary", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);

      // Get all obligation-related traces
      const obligationTraces = await queryTraceEntries({
        psurCaseId,
        eventTypes: ["OBLIGATION_SATISFIED", "OBLIGATION_UNSATISFIED"],
        orderBy: "asc",
      });

      const satisfied: string[] = [];
      const unsatisfied: string[] = [];
      const complianceDetails: Array<{
        obligationId: string;
        status: "satisfied" | "unsatisfied";
        humanSummary: string | null;
        sourceCitation: string | null;
      }> = [];

      for (const entry of obligationTraces) {
        const obligationId = entry.entityId;
        if (!obligationId) continue;

        const status = entry.eventType === "OBLIGATION_SATISFIED" ? "satisfied" : "unsatisfied";
        if (status === "satisfied") {
          satisfied.push(obligationId);
        } else {
          unsatisfied.push(obligationId);
        }

        const regCtx = entry.regulatoryContext as any;
        complianceDetails.push({
          obligationId,
          status,
          humanSummary: entry.humanSummary,
          sourceCitation: regCtx?.sourceCitation || null,
        });
      }

      res.json({
        psurCaseId,
        totalObligations: satisfied.length + unsatisfied.length,
        satisfiedCount: satisfied.length,
        unsatisfiedCount: unsatisfied.length,
        coveragePercent: satisfied.length + unsatisfied.length > 0
          ? ((satisfied.length / (satisfied.length + unsatisfied.length)) * 100).toFixed(1)
          : "0.0",
        satisfiedObligations: satisfied,
        unsatisfiedObligations: unsatisfied,
        details: complianceDetails,
      });
    } catch (error: any) {
      console.error("[GET /api/psur-cases/:psurCaseId/trace/compliance-summary] Error:", error);
      res.status(500).json({ error: "Failed to get compliance summary", details: error.message });
    }
  });

  // Download PSUR as Word document - SOTA with LLM optimization, accessibility, and signature prep
  // Uses cached document from workflow if available for instant download
  // Query params: ?style=corporate|regulatory|premium&llm=true&accessibility=true&signature=true&nocache=true
  app.get("/api/psur-cases/:psurCaseId/psur.docx", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const documentStyle = (req.query.style as string) || "corporate";
      const enableLLM = req.query.llm !== "false";
      const enableAccessibility = req.query.accessibility !== "false";
      const prepareForSignature = req.query.signature === "true";
      const noCache = req.query.nocache === "true";

      const psurCase = await storage.getPSURCase(psurCaseId);
      if (!psurCase) {
        return res.status(404).json({ error: "PSUR case not found" });
      }

      // Check cache first for instant download (unless nocache requested)
      if (!noCache) {
        const cached = getCachedCompiledDocument(psurCaseId, documentStyle);
        if (cached?.docx) {
          console.log(`[PSUR DOCX] Serving cached document for case ${psurCaseId}`);
          res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
          res.setHeader("Content-Disposition", `attachment; filename="PSUR-${psurCase.psurReference}.docx"`);
          res.setHeader("X-PSUR-Pages", cached.pageCount.toString());
          res.setHeader("X-PSUR-Content-Hash", cached.contentHash);
          res.setHeader("X-PSUR-Cached", "true");
          return res.send(cached.docx);
        }
      }

      console.log(`[PSUR DOCX] SOTA generation: case=${psurCaseId}, style=${documentStyle}, LLM=${enableLLM}, accessibility=${enableAccessibility}`);

      // Get device info
      const devices = await storage.getDevices();
      const psurCaseAny = psurCase as any;
      const device = psurCaseAny.deviceId ? devices.find((d: any) => d.id === psurCaseAny.deviceId) : devices[0];
      const deviceCode = psurCaseAny.deviceCode || device?.deviceCode || "DEVICE-001";
      const deviceName = device?.deviceName || device?.name;

      // SOTA CompileOrchestrator with all enhancements
      const { CompileOrchestrator } = await import("./src/agents/runtime/compileOrchestrator");
      const orchestrator = new CompileOrchestrator();

      const result = await orchestrator.compile({
        psurCaseId,
        templateId: psurCase.templateId,
        deviceCode,
        deviceName,
        periodStart: psurCase.startPeriod.toISOString().split("T")[0],
        periodEnd: psurCase.endPeriod.toISOString().split("T")[0],
        documentStyle: documentStyle as "corporate" | "regulatory" | "premium",
        outputFormat: "docx",
        enableCharts: true,
        enableLLMOptimization: enableLLM,
        enableAccessibility,
        prepareForSignature,
      });

      if (result.success && result.document?.docx) {
        // Cache the result for future downloads
        cacheCompiledDocument(psurCaseId, documentStyle, {
          docx: result.document.docx,
          pdf: result.document.pdf,
          html: result.document.html,
          pageCount: result.document.pageCount,
          sectionCount: result.sections.length,
          chartCount: result.charts.length,
          contentHash: result.document.contentHash,
          style: documentStyle,
          generatedAt: Date.now(),
          expiresAt: Date.now() + COMPILED_DOC_CACHE_TTL,
        });

        console.log(`[PSUR DOCX] Generated: ${result.document.pageCount} pages, ${result.sections.length} sections, accessibility: ${JSON.stringify(result.document.accessibility)}`);
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="PSUR-${psurCase.psurReference}.docx"`);
        res.setHeader("X-PSUR-Pages", result.document.pageCount.toString());
        res.setHeader("X-PSUR-Content-Hash", result.document.contentHash);
        res.setHeader("X-PSUR-Cached", "false");
        res.send(result.document.docx);
      } else {
        console.error("[PSUR DOCX] Compilation failed:", result.errors);
        res.status(500).json({
          error: "PSUR compilation failed",
          details: result.errors.join("; "),
          warnings: result.warnings
        });
      }
    } catch (error: any) {
      console.error("[PSUR DOCX] Error:", error);
      res.status(500).json({ error: "Failed to generate PSUR document", details: error.message });
    }
  });

  // Download PSUR as PDF/A - SOTA with regulatory-compliant archival format
  // Uses cached document from workflow if available for instant download
  // Query params: ?style=corporate|regulatory|premium&signature=true&nocache=true
  app.get("/api/psur-cases/:psurCaseId/psur.pdf", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const documentStyle = (req.query.style as string) || "regulatory"; // Default to regulatory for PDF
      const prepareForSignature = req.query.signature === "true";
      const noCache = req.query.nocache === "true";

      const psurCase = await storage.getPSURCase(psurCaseId);
      if (!psurCase) {
        return res.status(404).json({ error: "PSUR case not found" });
      }

      // Check cache first for instant download (unless nocache requested)
      if (!noCache) {
        const cached = getCachedCompiledDocument(psurCaseId, documentStyle);
        if (cached?.pdf) {
          console.log(`[PSUR PDF] Serving cached document for case ${psurCaseId}`);
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", `attachment; filename="PSUR-${psurCase.psurReference}.pdf"`);
          res.setHeader("X-PSUR-Pages", cached.pageCount.toString());
          res.setHeader("X-PSUR-Content-Hash", cached.contentHash);
          res.setHeader("X-PSUR-Cached", "true");
          return res.send(cached.pdf);
        }
      }

      console.log(`[PSUR PDF] SOTA PDF/A generation: case=${psurCaseId}, style=${documentStyle}, signature=${prepareForSignature}`);

      // Get device info
      const devices = await storage.getDevices();
      const psurCaseAny = psurCase as any;
      const device = psurCaseAny.deviceId ? devices.find((d: any) => d.id === psurCaseAny.deviceId) : devices[0];
      const deviceCode = psurCaseAny.deviceCode || device?.deviceCode || "DEVICE-001";
      const deviceName = device?.deviceName || device?.name;

      // SOTA CompileOrchestrator with PDF output
      const { CompileOrchestrator } = await import("./src/agents/runtime/compileOrchestrator");
      const orchestrator = new CompileOrchestrator();

      const result = await orchestrator.compile({
        psurCaseId,
        templateId: psurCase.templateId,
        deviceCode,
        deviceName,
        periodStart: psurCase.startPeriod.toISOString().split("T")[0],
        periodEnd: psurCase.endPeriod.toISOString().split("T")[0],
        documentStyle: documentStyle as "corporate" | "regulatory" | "premium",
        outputFormat: "pdf",
        enableCharts: true,
        enableLLMOptimization: true,
        enableAccessibility: true,
        prepareForSignature,
      });

      if (result.success && result.document?.pdf) {
        // Cache the result for future downloads
        cacheCompiledDocument(psurCaseId, documentStyle, {
          docx: result.document.docx,
          pdf: result.document.pdf,
          html: result.document.html,
          pageCount: result.document.pageCount,
          sectionCount: result.sections.length,
          chartCount: result.charts.length,
          contentHash: result.document.contentHash,
          style: documentStyle,
          generatedAt: Date.now(),
          expiresAt: Date.now() + COMPILED_DOC_CACHE_TTL,
        });

        console.log(`[PSUR PDF] Generated: ${result.document.pageCount} pages, PDF/UA compliant: ${result.document.accessibility.pdfUaCompliant}`);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="PSUR-${psurCase.psurReference}.pdf"`);
        res.setHeader("X-PSUR-Pages", result.document.pageCount.toString());
        res.setHeader("X-PSUR-Content-Hash", result.document.contentHash);
        res.setHeader("X-PDF-UA-Compliant", result.document.accessibility.pdfUaCompliant.toString());
        res.setHeader("X-PSUR-Cached", "false");
        res.send(result.document.pdf);
      } else {
        console.error("[PSUR PDF] Compilation failed:", result.errors);
        res.status(500).json({
          error: "PSUR PDF generation failed",
          details: result.errors.join("; "),
          warnings: result.warnings
        });
      }
    } catch (error: any) {
      console.error("[PSUR PDF] Error:", error);
      res.status(500).json({ error: "Failed to generate PSUR PDF", details: error.message });
    }
  });

  // Live Content API - Returns sections as they're being generated for real-time UI updates
  app.get("/api/psur-cases/:psurCaseId/live-content", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);

      const liveContent = getLiveContent(psurCaseId);

      if (!liveContent) {
        // No live content yet, return empty but valid response
        return res.json({
          psurCaseId,
          sections: [],
          isGenerating: false,
          lastUpdated: null,
        });
      }

      // Convert Map to array for JSON serialization
      const sections = Array.from(liveContent.sections.entries()).map(([slotId, data]) => ({
        slotId,
        title: data.title,
        content: data.content,
        status: data.status,
      }));

      res.json({
        psurCaseId,
        sections,
        isGenerating: liveContent.isGenerating,
        lastUpdated: liveContent.lastUpdated,
      });
    } catch (error: any) {
      console.error("[Live Content] Error:", error);
      res.status(500).json({ error: "Failed to get live content", details: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DECISION TRACE API - Natural language decision tracking and audit trail
  // ═══════════════════════════════════════════════════════════════════════════════

  // Get all decision traces for a PSUR case
  app.get("/api/psur-cases/:psurCaseId/decision-traces", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const eventTypes = req.query.eventTypes ? (req.query.eventTypes as string).split(",") : undefined;
      const orderBy = (req.query.orderBy as string) === "desc" ? "desc" : "asc";

      const { queryTraceEntries } = await import("./src/services/decisionTraceService");

      const entries = await queryTraceEntries({
        psurCaseId,
        eventTypes: eventTypes as any,
        limit,
        offset,
        orderBy,
      });

      res.json({
        psurCaseId,
        total: entries.length,
        offset,
        limit,
        entries: entries.map(e => ({
          id: e.id,
          traceId: e.traceId,
          sequenceNum: e.sequenceNum,
          eventType: e.eventType,
          timestamp: e.eventTimestamp,
          actor: e.actor,
          entityType: e.entityType,
          entityId: e.entityId,
          decision: e.decision,
          humanSummary: e.humanSummary,
          regulatoryContext: e.regulatoryContext,
          complianceAssertion: e.complianceAssertion,
          reasons: e.reasons,
          workflowStep: e.workflowStep,
        })),
      });
    } catch (error: any) {
      console.error("[Decision Traces] Error:", error);
      res.status(500).json({ error: "Failed to get decision traces", details: error.message });
    }
  });

  // Get decision trace summary
  app.get("/api/psur-cases/:psurCaseId/decision-traces/summary", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);

      const { getTraceSummary, verifyTraceChain } = await import("./src/services/decisionTraceService");

      const summary = await getTraceSummary(psurCaseId);

      if (!summary) {
        return res.json({
          psurCaseId,
          exists: false,
          summary: null,
          chainValidation: null,
        });
      }

      const chainValidation = await verifyTraceChain(summary.traceId);

      res.json({
        psurCaseId,
        exists: true,
        summary: {
          traceId: summary.traceId,
          workflowStatus: summary.workflowStatus,
          totalEvents: summary.totalEvents,
          acceptedSlots: summary.acceptedSlots,
          rejectedSlots: summary.rejectedSlots,
          traceGaps: summary.traceGaps,
          evidenceAtoms: summary.evidenceAtoms,
          negativeEvidence: summary.negativeEvidence,
          obligationsSatisfied: summary.obligationsSatisfied,
          obligationsUnsatisfied: summary.obligationsUnsatisfied,
          completedSteps: summary.completedSteps,
          chainValid: summary.chainValid,
          startedAt: summary.startedAt,
          completedAt: summary.completedAt,
          failedStep: summary.failedStep,
          failureReason: summary.failureReason,
        },
        chainValidation,
      });
    } catch (error: any) {
      console.error("[Decision Traces Summary] Error:", error);
      res.status(500).json({ error: "Failed to get trace summary", details: error.message });
    }
  });

  // Natural language search in decision traces
  app.get("/api/psur-cases/:psurCaseId/decision-traces/search", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const searchText = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!searchText || searchText.trim().length < 2) {
        return res.status(400).json({ error: "Search query must be at least 2 characters" });
      }

      const { searchTraces } = await import("./src/services/decisionTraceService");

      const entries = await searchTraces(psurCaseId, searchText.trim(), limit);

      res.json({
        psurCaseId,
        query: searchText,
        total: entries.length,
        entries: entries.map(e => ({
          id: e.id,
          sequenceNum: e.sequenceNum,
          eventType: e.eventType,
          timestamp: e.eventTimestamp,
          actor: e.actor,
          entityType: e.entityType,
          entityId: e.entityId,
          decision: e.decision,
          humanSummary: e.humanSummary,
          workflowStep: e.workflowStep,
        })),
      });
    } catch (error: any) {
      console.error("[Decision Traces Search] Error:", error);
      res.status(500).json({ error: "Failed to search traces", details: error.message });
    }
  });

  // Get audit narrative (plain English export)
  app.get("/api/psur-cases/:psurCaseId/decision-traces/narrative", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const format = req.query.format as string || "text";

      const { exportAuditNarrative, exportTraceSummary } = await import("./src/services/decisionTraceService");

      if (format === "json") {
        const data = await exportTraceSummary(psurCaseId);
        res.json(data);
      } else {
        const narrative = await exportAuditNarrative(psurCaseId);
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.send(narrative);
      }
    } catch (error: any) {
      console.error("[Decision Traces Narrative] Error:", error);
      res.status(500).json({ error: "Failed to export narrative", details: error.message });
    }
  });

  // Get decision timeline view
  app.get("/api/psur-cases/:psurCaseId/decision-traces/timeline", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);

      const { queryTraceEntries, getTraceSummary } = await import("./src/services/decisionTraceService");

      const summary = await getTraceSummary(psurCaseId);
      const entries = await queryTraceEntries({
        psurCaseId,
        orderBy: "asc",
        limit: 500,
      });

      // Group by workflow step
      const byStep: Record<number, any[]> = {};
      const stepNames: Record<number, string> = {
        0: "Initialization",
        1: "Template Qualification",
        2: "Case Creation",
        3: "Evidence Ingestion",
        4: "Slot Proposal",
        5: "Adjudication",
        6: "Coverage Report",
        7: "Document Rendering",
        8: "Bundle Export",
      };

      for (const entry of entries) {
        const step = entry.workflowStep || 0;
        if (!byStep[step]) byStep[step] = [];
        byStep[step].push({
          id: entry.id,
          sequenceNum: entry.sequenceNum,
          eventType: entry.eventType,
          timestamp: entry.eventTimestamp,
          actor: entry.actor,
          decision: entry.decision,
          humanSummary: entry.humanSummary,
          entityType: entry.entityType,
          entityId: entry.entityId,
        });
      }

      const timeline = Object.entries(byStep)
        .map(([step, events]) => ({
          step: parseInt(step),
          name: stepNames[parseInt(step)] || `Step ${step}`,
          eventCount: events.length,
          events: events.slice(0, 20), // Limit events per step for performance
          hasMore: events.length > 20,
        }))
        .sort((a, b) => a.step - b.step);

      res.json({
        psurCaseId,
        summary: summary ? {
          workflowStatus: summary.workflowStatus,
          totalEvents: summary.totalEvents,
          completedSteps: summary.completedSteps,
        } : null,
        timeline,
      });
    } catch (error: any) {
      console.error("[Decision Traces Timeline] Error:", error);
      res.status(500).json({ error: "Failed to get timeline", details: error.message });
    }
  });

  // Get traces for a specific entity (slot, evidence, etc.)
  app.get("/api/psur-cases/:psurCaseId/decision-traces/entity/:entityId", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const entityId = req.params.entityId;

      const { getEntityTrace, getSlotDecisionChain } = await import("./src/services/decisionTraceService");

      // Try to get full slot decision chain if it's a slot
      const slotChain = await getSlotDecisionChain(entityId);
      const entityTrace = await getEntityTrace("", entityId);

      res.json({
        psurCaseId,
        entityId,
        slotChain: slotChain.proposal || slotChain.adjudication ? slotChain : null,
        entries: entityTrace.map(e => ({
          id: e.id,
          sequenceNum: e.sequenceNum,
          eventType: e.eventType,
          timestamp: e.eventTimestamp,
          actor: e.actor,
          decision: e.decision,
          humanSummary: e.humanSummary,
          regulatoryContext: e.regulatoryContext,
          complianceAssertion: e.complianceAssertion,
        })),
      });
    } catch (error: any) {
      console.error("[Decision Traces Entity] Error:", error);
      res.status(500).json({ error: "Failed to get entity traces", details: error.message });
    }
  });

  // Fast Preview - lightweight HTML preview without full LLM generation
  app.get("/api/psur-cases/:psurCaseId/preview.html", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const documentStyle = (req.query.style as string) || "premium";
      const noCache = (req.query.nocache as string) === "1";

      // Check cache first (unless nocache)
      if (!noCache) {
        const cached = getCachedPreview(psurCaseId, documentStyle);
        if (cached) {
          console.log(`[PSUR Preview] Serving cached preview for case ${psurCaseId}`);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("X-Preview-Cached", "true");
          res.setHeader("X-Preview-Age", (Date.now() - cached.generatedAt).toString());
          return res.send(cached.html);
        }
      }

      const psurCase = await storage.getPSURCase(psurCaseId);
      if (!psurCase) {
        return res.status(404).json({ error: "PSUR case not found" });
      }

      // Generate fast preview - use template structure without full LLM generation
      const template = loadTemplate(psurCase.templateId);
      const slots = template.slots || [];

      // Get evidence counts for display
      const atoms = await storage.getEvidenceAtoms(psurCaseId);
      const atomsByType: Record<string, number> = {};
      atoms.forEach((a: any) => {
        atomsByType[a.evidenceType] = (atomsByType[a.evidenceType] || 0) + 1;
      });

      // Get live content if available
      const liveContent = getLiveContent(psurCaseId);

      // Generate lightweight HTML preview with live content
      const html = generateFastPreviewHTML({
        psurCase,
        template,
        slots,
        atomsByType,
        totalAtoms: atoms.length,
        documentStyle,
        liveContent,
      });

      // Only cache if not actively generating (live content updates frequently)
      if (!liveContent?.isGenerating) {
        setCachedPreview(psurCaseId, documentStyle, html);
      }

      console.log(`[PSUR Preview] Generated fast preview for case ${psurCaseId}`);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Preview-Cached", "false");
      res.send(html);
    } catch (error: any) {
      console.error("[PSUR Preview] Error:", error);
      // Return a minimal error page instead of JSON
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`<!DOCTYPE html><html><head><title>Preview Error</title><style>body{font-family:system-ui;padding:40px;color:#666}h1{color:#dc2626}</style></head><body><h1>Preview Unavailable</h1><p>${error.message || "Failed to generate preview"}</p></body></html>`);
    }
  });

  // Download PSUR as accessible HTML (full generation with caching)
  app.get("/api/psur-cases/:psurCaseId/psur.html", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const documentStyle = (req.query.style as string) || "premium";
      const download = (req.query.download as string) === "1";
      const noCache = (req.query.nocache as string) === "1";

      // Check cache first for non-download requests
      if (!download && !noCache) {
        const cached = getCachedPreview(psurCaseId, `full:${documentStyle}`);
        if (cached) {
          console.log(`[PSUR HTML] Serving cached HTML for case ${psurCaseId}`);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Content-Disposition", `inline; filename="PSUR-${psurCaseId}.html"`);
          res.setHeader("X-Cached", "true");
          return res.send(cached.html);
        }
      }

      console.log(`[PSUR HTML] SOTA HTML generation: case=${psurCaseId}, style=${documentStyle}`);

      const psurCase = await storage.getPSURCase(psurCaseId);
      if (!psurCase) {
        return res.status(404).json({ error: "PSUR case not found" });
      }

      // Get device info
      const devices = await storage.getDevices();
      const psurCaseAny = psurCase as any;
      const device = psurCaseAny.deviceId ? devices.find((d: any) => d.id === psurCaseAny.deviceId) : devices[0];
      const deviceCode = psurCaseAny.deviceCode || device?.deviceCode || "DEVICE-001";
      const deviceName = device?.deviceName || device?.name;

      // SOTA CompileOrchestrator with HTML output
      const { CompileOrchestrator } = await import("./src/agents/runtime/compileOrchestrator");
      const orchestrator = new CompileOrchestrator();

      const result = await orchestrator.compile({
        psurCaseId,
        templateId: psurCase.templateId,
        deviceCode,
        deviceName,
        periodStart: psurCase.startPeriod.toISOString().split("T")[0],
        periodEnd: psurCase.endPeriod.toISOString().split("T")[0],
        documentStyle: documentStyle as "corporate" | "regulatory" | "premium",
        outputFormat: "html",
        enableCharts: true,
        enableLLMOptimization: true,
        enableAccessibility: true,
      });

      if (result.success && result.document?.html) {
        // Cache the full HTML
        setCachedPreview(psurCaseId, `full:${documentStyle}`, result.document.html);

        console.log(`[PSUR HTML] Generated: WCAG ${result.document.accessibility.wcagLevel} compliant`);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        if (download) {
          res.setHeader("Content-Disposition", `attachment; filename="PSUR-${psurCase.psurReference}.html"`);
        } else {
          res.setHeader("Content-Disposition", `inline; filename="PSUR-${psurCase.psurReference}.html"`);
        }
        res.send(result.document.html);
      } else {
        console.error("[PSUR HTML] Compilation failed:", result.errors);
        res.status(500).json({
          error: "PSUR HTML generation failed",
          details: result.errors.join("; "),
          warnings: result.warnings
        });
      }
    } catch (error: any) {
      console.error("[PSUR HTML] Error:", error);
      res.status(500).json({ error: "Failed to generate PSUR HTML", details: error.message });
    }
  });

  // Download PSUR as Markdown - ALWAYS uses SOTA LLM-powered agents
  app.get("/api/psur-cases/:psurCaseId/psur.md", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const documentStyle = (req.query.style as string) || "corporate";

      console.log(`[PSUR MD] Generating SOTA markdown for case ${psurCaseId}`);

      const psurCase = await storage.getPSURCase(psurCaseId);
      if (!psurCase) {
        return res.status(404).json({ error: "PSUR case not found" });
      }

      // Get device info
      const devices = await storage.getDevices();
      const psurCaseAny = psurCase as any;
      const deviceCode = psurCaseAny.deviceCode || (psurCaseAny.deviceId ? devices.find((d: any) => d.id === psurCaseAny.deviceId)?.deviceCode : null) || devices[0]?.deviceCode || "DEVICE-001";

      // ALWAYS use SOTA CompileOrchestrator
      const { CompileOrchestrator } = await import("./src/agents/runtime/compileOrchestrator");
      const orchestrator = new CompileOrchestrator();

      const result = await orchestrator.compile({
        psurCaseId,
        templateId: psurCase.templateId,
        deviceCode: deviceCode,
        periodStart: psurCase.startPeriod.toISOString().split("T")[0],
        periodEnd: psurCase.endPeriod.toISOString().split("T")[0],
        documentStyle: documentStyle as "corporate" | "regulatory" | "premium",
        enableCharts: false, // No charts for markdown
      });

      if (result.success && result.sections.length > 0) {
        // Convert sections to markdown
        const markdownParts: string[] = [];
        markdownParts.push(`# PERIODIC SAFETY UPDATE REPORT`);
        markdownParts.push(``);
        markdownParts.push(`**PSUR Reference:** ${psurCase.psurReference}`);
        markdownParts.push(`**Reporting Period:** ${psurCase.startPeriod.toISOString().split("T")[0]} to ${psurCase.endPeriod.toISOString().split("T")[0]}`);
        markdownParts.push(`**Generated:** ${new Date().toISOString()}`);
        markdownParts.push(``);
        markdownParts.push(`---`);
        markdownParts.push(``);

        for (const section of result.sections) {
          markdownParts.push(`## ${section.title}`);
          markdownParts.push(``);
          markdownParts.push(section.content);
          markdownParts.push(``);
          if (section.evidenceAtomIds.length > 0) {
            markdownParts.push(`*Evidence: ${section.evidenceAtomIds.slice(0, 5).join(", ")}${section.evidenceAtomIds.length > 5 ? ` +${section.evidenceAtomIds.length - 5} more` : ""}*`);
            markdownParts.push(``);
          }
          markdownParts.push(`---`);
          markdownParts.push(``);
        }

        const psurMarkdown = markdownParts.join("\n");

        console.log(`[PSUR MD] Successfully generated ${result.sections.length} sections`);
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="PSUR-${psurCase.psurReference}.md"`);
        res.send(psurMarkdown);
      } else {
        console.error("[PSUR MD] Compilation failed:", result.errors);
        res.status(500).json({
          error: "PSUR compilation failed",
          details: result.errors.join("; "),
          warnings: result.warnings
        });
      }
    } catch (error: any) {
      console.error("[PSUR MD] Error:", error);
      res.status(500).json({ error: "Failed to generate PSUR document", details: error.message });
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

  // ============== AI AGENT ROUTES ==============

  // Health check for AI agents
  app.get("/api/agents/health", async (req, res) => {
    try {
      const { getOrchestrator } = await import("./src/agents/agentOrchestrator");
      const orchestrator = getOrchestrator();
      const health = await orchestrator.checkHealth();
      res.json(health);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to check agent health", details: error.message });
    }
  });

  // Get system configuration
  app.get("/api/agents/config", async (req, res) => {
    try {
      const { getConfig, CONFIG_PRESETS } = await import("./src/agents/config");
      res.json({
        current: getConfig(),
        availablePresets: Object.keys(CONFIG_PRESETS),
      });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get config", details: error.message });
    }
  });

  // Update system configuration
  app.put("/api/agents/config", async (req, res) => {
    try {
      const { updateConfig } = await import("./src/agents/config");
      const newConfig = updateConfig(req.body);
      res.json(newConfig);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update config", details: error.message });
    }
  });

  // Apply configuration preset
  app.post("/api/agents/config/preset/:presetName", async (req, res) => {
    try {
      const { applyPreset } = await import("./src/agents/config");
      const newConfig = applyPreset(req.params.presetName as any);
      res.json(newConfig);
    } catch (error: any) {
      res.status(400).json({ error: "Failed to apply preset", details: error.message });
    }
  });

  // Get evidence type mappings
  app.get("/api/agents/evidence-types", async (req, res) => {
    try {
      const { EVIDENCE_TYPE_MAPPINGS, getEvidenceTypesByCategory } = await import("./src/agents/config");
      const category = req.query.category as string;

      if (category) {
        res.json(getEvidenceTypesByCategory(category as any));
      } else {
        res.json(EVIDENCE_TYPE_MAPPINGS);
      }
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get evidence types", details: error.message });
    }
  });

  // Run AI-powered document ingestion workflow
  app.post("/api/agents/ingest", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { psurCaseId, evidenceType, sourceType, userMappings, deviceCode, periodStart, periodEnd } = req.body;

      if (!psurCaseId || !evidenceType) {
        return res.status(400).json({ error: "psurCaseId and evidenceType are required" });
      }

      // Parse the file
      const parseResult = await parseFileBuffer(req.file.buffer, req.file.originalname, "xlsx");

      // Run the ingestion workflow
      const { getOrchestrator } = await import("./src/agents/agentOrchestrator");
      const orchestrator = getOrchestrator();

      const result = await orchestrator.runIngestionWorkflow({
        psurCaseId: parseInt(psurCaseId),
        parsedContent: {
          type: "tabular",
          rows: parseResult.data,
        },
        sourceFile: req.file.originalname,
        sourceType: sourceType || "excel",
        evidenceType,
        userMappings: userMappings ? JSON.parse(userMappings) : undefined,
        deviceCode: deviceCode || "UNKNOWN",
        periodStart: periodStart || new Date().toISOString().split("T")[0],
        periodEnd: periodEnd || new Date().toISOString().split("T")[0],
      });

      res.json(result);
    } catch (error: any) {
      console.error("[POST /api/agents/ingest] Error:", error);
      res.status(500).json({ error: "Ingestion workflow failed", details: error.message });
    }
  });

  // Get field mapping suggestions for a file
  app.post("/api/agents/suggest-mappings", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { evidenceType } = req.body;
      if (!evidenceType) {
        return res.status(400).json({ error: "evidenceType is required" });
      }

      // Parse the file to get columns
      const parseResult = await parseFileBuffer(req.file.buffer, req.file.originalname, "xlsx");

      // Extract source columns
      const sourceColumns = Object.keys(parseResult.data[0] || {}).map(name => ({
        name,
        sampleValues: parseResult.data.slice(0, 10).map((r: any) => r[name]).filter((v: any) => v != null),
        dataType: typeof parseResult.data[0]?.[name],
      }));

      // Get target schema
      const { getEvidenceTypeMapping } = await import("./src/agents/config");
      const schema = getEvidenceTypeMapping(evidenceType);

      if (!schema) {
        return res.status(400).json({ error: `Unknown evidence type: ${evidenceType}` });
      }

      const targetSchema = [
        ...schema.requiredFields.map(f => ({ fieldName: f, displayName: f.replace(/_/g, " "), type: "string", required: true })),
        ...schema.optionalFields.map(f => ({ fieldName: f, displayName: f.replace(/_/g, " "), type: "string", required: false })),
      ];

      // Run the mapping agent
      const { FieldMappingAgent } = await import("./src/agents/ingestion/fieldMappingAgent");
      const { startTrace } = await import("./src/services/decisionTraceService");

      const agent = new FieldMappingAgent();
      const traceCtx = await startTrace(0); // No case yet

      const result = await agent.run(
        { sourceColumns, targetSchema, evidenceType },
        { psurCaseId: 0, traceCtx }
      );

      res.json({
        success: result.success,
        mappings: result.data?.mappings || [],
        sourceColumns,
        targetSchema,
        overallConfidence: result.data?.overallConfidence || 0,
        suggestedActions: result.data?.suggestedActions || [],
      });
    } catch (error: any) {
      console.error("[POST /api/agents/suggest-mappings] Error:", error);
      res.status(500).json({ error: "Mapping suggestion failed", details: error.message });
    }
  });

  // Run runtime agents for a PSUR case (generate narrative content)
  app.post("/api/agents/generate-content/:psurCaseId", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const psurCase = await storage.getPSURCase(psurCaseId);

      if (!psurCase) {
        return res.status(404).json({ error: "PSUR case not found" });
      }

      // Load template
      const template = loadTemplate(psurCase.templateId);
      if (!template) {
        return res.status(400).json({ error: `Template ${psurCase.templateId} not found` });
      }

      // Prepare slots for runtime agents
      const slots = template.slots.filter(s => s.slot_kind === "NARRATIVE").map(s => ({
        slotId: s.slot_id,
        title: s.title,
        sectionPath: s.section_path,
        slotKind: s.slot_kind,
        requirements: s.output_requirements?.guidance,
        guidance: s.output_requirements?.guidance,
        requiredEvidenceTypes: s.evidence_requirements?.required_types || [],
      }));

      // Run runtime workflow
      const { getOrchestrator } = await import("./src/agents/agentOrchestrator");
      const orchestrator = getOrchestrator();

      const result = await orchestrator.runRuntimeWorkflow({
        psurCaseId,
        templateId: psurCase.templateId,
        slots,
        deviceCode: psurCase.deviceCode,
        periodStart: new Date(psurCase.startPeriod).toISOString().split("T")[0],
        periodEnd: new Date(psurCase.endPeriod).toISOString().split("T")[0],
      });

      res.json(result);
    } catch (error: any) {
      console.error("[POST /api/agents/generate-content/:psurCaseId] Error:", error);
      res.status(500).json({ error: "Content generation failed", details: error.message });
    }
  });

  // Test LLM connection
  app.post("/api/agents/test-llm", async (req, res) => {
    try {
      const { complete } = await import("./src/agents/llmService");

      const response = await complete({
        messages: [
          { role: "system", content: "You are a test assistant." },
          { role: "user", content: "Say 'LLM connection successful' and nothing else." },
        ],
        config: {
          provider: req.body.provider || "auto",
          maxTokens: 50,
        },
      });

      res.json({
        success: true,
        provider: response.provider,
        model: response.model,
        content: response.content,
        latencyMs: response.latencyMs,
        usage: response.usage,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
        hint: "Make sure OPENAI_API_KEY or ANTHROPIC_API_KEY is set in .env",
      });
    }
  });

  // ============== COMPILE TRACE ENDPOINTS ==============

  // Get full compile trace for a PSUR case
  app.get("/api/trace/compile/:psurCaseId", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const { getCompileTrace } = await import("./src/services/compileTraceRepository");

      const entries = await getCompileTrace(psurCaseId);
      res.json({ psurCaseId, entries, count: entries.length });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get compile trace", details: error.message });
    }
  });

  // Get compile trace summary for a PSUR case
  app.get("/api/trace/compile/:psurCaseId/summary", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const { getTraceSummary } = await import("./src/services/compileTraceRepository");

      const summary = await getTraceSummary(psurCaseId);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get compile trace summary", details: error.message });
    }
  });

  // Get compile trace by slot
  app.get("/api/trace/compile/:psurCaseId/by-slot/:slotId", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const slotId = req.params.slotId;
      const { getTraceBySlot } = await import("./src/services/compileTraceRepository");

      const entries = await getTraceBySlot(psurCaseId, slotId);
      res.json({ psurCaseId, slotId, entries, count: entries.length });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get compile trace by slot", details: error.message });
    }
  });

  // Get compile trace by agent type
  app.get("/api/trace/compile/:psurCaseId/by-agent/:agentType", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const agentType = req.params.agentType;
      const { getTraceByAgent } = await import("./src/services/compileTraceRepository");

      const entries = await getTraceByAgent(psurCaseId, agentType);
      res.json({ psurCaseId, agentType, entries, count: entries.length });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get compile trace by agent", details: error.message });
    }
  });

  // Get compile trace by phase
  app.get("/api/trace/compile/:psurCaseId/by-phase/:phase", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const phase = req.params.phase as "NARRATIVE" | "TABLE" | "CHART" | "FORMAT" | "ORCHESTRATION";
      const { getTraceByPhase } = await import("./src/services/compileTraceRepository");

      const entries = await getTraceByPhase(psurCaseId, phase);
      res.json({ psurCaseId, phase, entries, count: entries.length });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get compile trace by phase", details: error.message });
    }
  });

  // Get identified gaps
  app.get("/api/trace/compile/:psurCaseId/gaps", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const { getGaps } = await import("./src/services/compileTraceRepository");

      const gaps = await getGaps(psurCaseId);
      res.json({ psurCaseId, gaps, count: gaps.length });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to get compile gaps", details: error.message });
    }
  });

  // Verify trace integrity
  app.get("/api/trace/compile/:psurCaseId/verify", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const { verifyTraceIntegrity } = await import("./src/services/compileTraceRepository");

      const verification = await verifyTraceIntegrity(psurCaseId);
      res.json({ psurCaseId, ...verification });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to verify compile trace", details: error.message });
    }
  });

  // Export trace as JSON
  app.get("/api/trace/compile/:psurCaseId/export", async (req, res) => {
    try {
      const psurCaseId = parseInt(req.params.psurCaseId);
      const { exportTraceJSON } = await import("./src/services/compileTraceRepository");

      const json = await exportTraceJSON(psurCaseId);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=compile-trace-${psurCaseId}.json`);
      res.send(json);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to export compile trace", details: error.message });
    }
  });

  ensureOrchestratorInitialized().catch(console.error);

  return httpServer;
}
