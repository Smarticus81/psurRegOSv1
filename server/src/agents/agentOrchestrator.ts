/**
 * Agent Orchestrator
 * 
 * Coordinates all AI agents for document ingestion and PSUR compilation.
 * Manages agent lifecycle, resource allocation, and decision tracing.
 */

import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";
import { BaseAgent, AgentContext, AgentResult } from "./baseAgent";
import { FieldMappingAgent, FieldMappingInput, FieldMappingOutput } from "./ingestion/fieldMappingAgent";
import { EvidenceExtractionAgent, ExtractionInput, ExtractionOutput } from "./ingestion/evidenceExtractionAgent";
import { NarrativeWriterAgent, NarrativeInput, NarrativeOutput } from "./runtime/narrativeWriterAgent";
import { startTrace, resumeTrace, TraceContext, TraceEvents, logTraceEvent } from "../services/decisionTraceService";
import { db } from "../../db";
import { evidenceAtoms, slotProposals, psurCases } from "@shared/schema";
import { eq } from "drizzle-orm";
import { checkLLMHealth } from "./llmService";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface OrchestratorConfig {
  maxConcurrentAgents: number;
  defaultTimeout: number;
  enableTracing: boolean;
  llmProvider: "openai" | "anthropic" | "auto";
}

export interface IngestionWorkflowInput {
  psurCaseId: number;
  parsedContent: ExtractionInput["parsedContent"];
  sourceFile: string;
  sourceType: string;
  evidenceType: string;
  userMappings?: Record<string, string>;
  deviceCode: string;
  periodStart: string;
  periodEnd: string;
}

export interface IngestionWorkflowResult {
  success: boolean;
  mappings: FieldMappingOutput;
  extraction: ExtractionOutput;
  atomsCreated: number;
  traceId: string;
  errors: string[];
  warnings: string[];
}

export interface RuntimeWorkflowInput {
  psurCaseId: number;
  templateId: string;
  slots: {
    slotId: string;
    title: string;
    sectionPath: string;
    slotKind: string;
    requirements?: string;
    guidance?: string;
    requiredEvidenceTypes: string[];
  }[];
  deviceCode: string;
  periodStart: string;
  periodEnd: string;
}

export interface RuntimeWorkflowResult {
  success: boolean;
  slotOutputs: {
    slotId: string;
    content: string;
    citedAtoms: string[];
    confidence: number;
    generationMethod: string;
  }[];
  totalSlots: number;
  completedSlots: number;
  failedSlots: string[];
  traceId: string;
  llmMetrics: {
    totalCalls: number;
    totalTokens: number;
    totalCost: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxConcurrentAgents: 5,
  defaultTimeout: 120000,
  enableTracing: true,
  llmProvider: "auto",
};

export class AgentOrchestrator {
  private config: OrchestratorConfig;
  private activeAgents: Map<string, BaseAgent> = new Map();

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════════

  async checkHealth(): Promise<{
    orchestrator: { status: string };
    llm: { openai: { available: boolean }; anthropic: { available: boolean } };
    database: { connected: boolean };
  }> {
    const llmHealth = await checkLLMHealth();
    
    let dbConnected = false;
    try {
      await db.select().from(psurCases).limit(1);
      dbConnected = true;
    } catch (e) {
      dbConnected = false;
    }

    return {
      orchestrator: { status: "running" },
      llm: llmHealth,
      database: { connected: dbConnected },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // INGESTION WORKFLOW
  // ═══════════════════════════════════════════════════════════════════════════════

  async runIngestionWorkflow(input: IngestionWorkflowInput): Promise<IngestionWorkflowResult> {
    const workflowId = uuidv4();
    const errors: string[] = [];
    const warnings: string[] = [];

    console.log(`[Orchestrator] Starting ingestion workflow ${workflowId}`);

    // Initialize or resume trace
    let traceCtx: TraceContext;
    const existingTrace = await resumeTrace(input.psurCaseId);
    if (existingTrace) {
      traceCtx = existingTrace;
    } else {
      traceCtx = await startTrace(input.psurCaseId);
    }

    try {
      // Log workflow start
      await logTraceEvent(traceCtx, {
        eventType: "WORKFLOW_STARTED",
        actor: "AgentOrchestrator",
        entityType: "EVIDENCE_UPLOAD",
        entityId: workflowId,
        inputData: {
          sourceFile: input.sourceFile,
          evidenceType: input.evidenceType,
          contentType: input.parsedContent.type,
        },
      });

      // Step 1: Field Mapping
      console.log(`[Orchestrator] Step 1: Field Mapping`);
      const mappingAgent = new FieldMappingAgent();
      const agentContext: AgentContext = {
        psurCaseId: input.psurCaseId,
        traceCtx,
        deviceCode: input.deviceCode,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      };

      // Prepare mapping input
      const sourceColumns = this.extractSourceColumns(input.parsedContent);
      const targetSchema = this.getTargetSchema(input.evidenceType);

      const mappingInput: FieldMappingInput = {
        sourceColumns,
        targetSchema,
        evidenceType: input.evidenceType,
        hints: input.userMappings,
      };

      const mappingResult = await mappingAgent.run(mappingInput, agentContext);
      
      if (!mappingResult.success) {
        errors.push(`Field mapping failed: ${mappingResult.error}`);
        throw new Error(`Field mapping failed: ${mappingResult.error}`);
      }

      warnings.push(...mappingResult.warnings);

      // Check if we have enough mapped fields
      const validMappings = mappingResult.data!.mappings.filter(m => m.targetField !== null);
      if (validMappings.length === 0) {
        errors.push("No fields could be mapped. Please provide manual mappings.");
        throw new Error("No fields could be mapped");
      }

      // Build field mapping dictionary
      const fieldMappings: Record<string, string> = {};
      for (const mapping of validMappings) {
        fieldMappings[mapping.sourceColumn] = mapping.targetField!;
      }

      // Step 2: Evidence Extraction
      console.log(`[Orchestrator] Step 2: Evidence Extraction`);
      const extractionAgent = new EvidenceExtractionAgent();
      
      const extractionInput: ExtractionInput = {
        parsedContent: input.parsedContent,
        sourceFile: input.sourceFile,
        sourceType: input.sourceType,
        evidenceType: input.evidenceType,
        fieldMappings,
        context: {
          deviceCode: input.deviceCode,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        },
      };

      const extractionResult = await extractionAgent.run(extractionInput, agentContext);
      
      if (!extractionResult.success) {
        errors.push(`Evidence extraction failed: ${extractionResult.error}`);
        throw new Error(`Evidence extraction failed: ${extractionResult.error}`);
      }

      warnings.push(...extractionResult.warnings);

      // Step 3: Create Evidence Atoms in Database
      console.log(`[Orchestrator] Step 3: Creating ${extractionResult.data!.records.length} evidence atoms`);
      let atomsCreated = 0;

      for (const record of extractionResult.data!.records) {
        try {
          const contentHash = createHash("sha256")
            .update(JSON.stringify(record.normalizedData))
            .digest("hex");
            
          await db.insert(evidenceAtoms).values({
            psurCaseId: input.psurCaseId,
            atomId: record.recordId,
            evidenceType: input.evidenceType,
            normalizedData: record.normalizedData,
            data: record.rawData || record.normalizedData,
            sourceSystem: input.sourceType,
            extractDate: new Date(),
            contentHash,
            provenance: {
              sourceFile: input.sourceFile,
              extractedBy: "EvidenceExtractionAgent",
              extractionConfidence: record.extractionConfidence,
              deviceRef: { deviceCode: input.deviceCode },
              psurPeriod: { periodStart: input.periodStart, periodEnd: input.periodEnd },
            },
            status: "valid",
          });
          atomsCreated++;

          await logTraceEvent(traceCtx, {
            eventType: "EVIDENCE_ATOM_CREATED",
            actor: "AgentOrchestrator",
            entityType: "EVIDENCE_ATOM",
            entityId: record.recordId,
            inputData: { evidenceType: input.evidenceType },
            outputData: { confidence: record.extractionConfidence },
          });

        } catch (error: any) {
          warnings.push(`Failed to create atom ${record.recordId}: ${error.message}`);
        }
      }

      // Log completion
      await logTraceEvent(traceCtx, {
        eventType: "WORKFLOW_COMPLETED",
        actor: "AgentOrchestrator",
        entityType: "EVIDENCE_UPLOAD",
        entityId: workflowId,
        decision: "PASS",
        outputData: {
          atomsCreated,
          totalRecords: extractionResult.data!.totalExtracted,
          skipped: extractionResult.data!.totalSkipped,
        },
      });

      console.log(`[Orchestrator] Ingestion workflow completed. Created ${atomsCreated} atoms.`);

      return {
        success: true,
        mappings: mappingResult.data!,
        extraction: extractionResult.data!,
        atomsCreated,
        traceId: traceCtx.traceId,
        errors,
        warnings,
      };

    } catch (error: any) {
      await logTraceEvent(traceCtx, {
        eventType: "WORKFLOW_FAILED",
        actor: "AgentOrchestrator",
        entityType: "EVIDENCE_UPLOAD",
        entityId: workflowId,
        decision: "FAIL",
        outputData: { error: error.message },
        reasons: [error.message],
      });

      return {
        success: false,
        mappings: { mappings: [], unmappedSources: [], unmappedTargets: [], overallConfidence: 0, suggestedActions: [] },
        extraction: { records: [], totalExtracted: 0, totalSkipped: 0, skippedReasons: [], classifications: { bySeverity: {}, adverseEvents: 0, seriousIncidents: 0 }, overallConfidence: 0 },
        atomsCreated: 0,
        traceId: traceCtx.traceId,
        errors: [...errors, error.message],
        warnings,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // RUNTIME WORKFLOW (PSUR COMPILATION)
  // ═══════════════════════════════════════════════════════════════════════════════

  async runRuntimeWorkflow(input: RuntimeWorkflowInput): Promise<RuntimeWorkflowResult> {
    const workflowId = uuidv4();
    const slotOutputs: RuntimeWorkflowResult["slotOutputs"] = [];
    const failedSlots: string[] = [];
    let totalCalls = 0;
    let totalTokens = 0;
    let totalCost = 0;

    console.log(`[Orchestrator] Starting runtime workflow ${workflowId}`);

    // Get or create trace
    let traceCtx: TraceContext;
    const existingTrace = await resumeTrace(input.psurCaseId);
    if (existingTrace) {
      traceCtx = existingTrace;
    } else {
      traceCtx = await startTrace(input.psurCaseId);
    }

    try {
      await logTraceEvent(traceCtx, {
        eventType: "WORKFLOW_STARTED",
        actor: "AgentOrchestrator",
        entityType: "PSUR_CASE",
        entityId: String(input.psurCaseId),
        inputData: {
          templateId: input.templateId,
          totalSlots: input.slots.length,
        },
      });

      // Load all evidence atoms for this case
      const allAtoms = await db.query.evidenceAtoms.findMany({
        where: eq(evidenceAtoms.psurCaseId, input.psurCaseId),
      });

      console.log(`[Orchestrator] Loaded ${allAtoms.length} evidence atoms`);

      // Process each slot
      for (const slot of input.slots) {
        console.log(`[Orchestrator] Processing slot: ${slot.slotId}`);

        try {
          // Filter atoms for this slot
          const slotAtoms = allAtoms.filter(a => 
            slot.requiredEvidenceTypes.length === 0 || 
            slot.requiredEvidenceTypes.includes(a.evidenceType)
          );

          if (slot.slotKind === "NARRATIVE") {
            // Use NarrativeWriterAgent
            const agent = new NarrativeWriterAgent();
            const agentContext: AgentContext = {
              psurCaseId: input.psurCaseId,
              traceCtx,
              slotId: slot.slotId,
              templateId: input.templateId,
              deviceCode: input.deviceCode,
              periodStart: input.periodStart,
              periodEnd: input.periodEnd,
            };

            const narrativeInput: NarrativeInput = {
              slot: {
                slotId: slot.slotId,
                title: slot.title,
                sectionPath: slot.sectionPath,
                requirements: slot.requirements,
                guidance: slot.guidance,
              },
              evidenceAtoms: slotAtoms.map(a => ({
                atomId: a.atomId,
                evidenceType: a.evidenceType,
                normalizedData: a.normalizedData as Record<string, unknown>,
              })),
              context: {
                deviceCode: input.deviceCode,
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
                templateId: input.templateId,
              },
            };

            const result = await agent.run(narrativeInput, agentContext);
            const metrics = agent.getMetrics();
            
            totalCalls += metrics.llmCalls;
            totalTokens += metrics.tokens;
            totalCost += metrics.cost;

            if (result.success && result.data) {
              slotOutputs.push({
                slotId: slot.slotId,
                content: result.data.content,
                citedAtoms: result.data.citedAtoms,
                confidence: result.confidence,
                generationMethod: "llm_narrative",
              });
            } else {
              failedSlots.push(slot.slotId);
            }

          } else if (slot.slotKind === "TABLE") {
            // Generate table using rule-based approach
            const tableContent = this.generateTableContent(slot, slotAtoms);
            slotOutputs.push({
              slotId: slot.slotId,
              content: tableContent.content,
              citedAtoms: tableContent.atomIds,
              confidence: 0.95,
              generationMethod: "rule_based_table",
            });

          } else {
            // ADMIN, METRIC - use deterministic generation
            const content = this.generateAdminContent(slot, input);
            slotOutputs.push({
              slotId: slot.slotId,
              content,
              citedAtoms: [],
              confidence: 1.0,
              generationMethod: "deterministic",
            });
          }

          await logTraceEvent(traceCtx, {
            eventType: "SLOT_PROPOSED",
            actor: "AgentOrchestrator",
            entityType: "SLOT",
            entityId: slot.slotId,
            decision: "PASS",
            outputData: {
              slotKind: slot.slotKind,
              wordCount: slotOutputs[slotOutputs.length - 1]?.content.split(/\s+/).length || 0,
              citedAtoms: slotOutputs[slotOutputs.length - 1]?.citedAtoms.length || 0,
            },
          });

        } catch (error: any) {
          console.error(`[Orchestrator] Failed to process slot ${slot.slotId}:`, error);
          failedSlots.push(slot.slotId);
          
          await logTraceEvent(traceCtx, {
            eventType: "SLOT_REJECTED",
            actor: "AgentOrchestrator",
            entityType: "SLOT",
            entityId: slot.slotId,
            decision: "FAIL",
            outputData: { error: error.message },
            reasons: [error.message],
          });
        }
      }

      await logTraceEvent(traceCtx, {
        eventType: "WORKFLOW_COMPLETED",
        actor: "AgentOrchestrator",
        entityType: "PSUR_CASE",
        entityId: String(input.psurCaseId),
        decision: failedSlots.length === 0 ? "PASS" : "PARTIAL",
        outputData: {
          completedSlots: slotOutputs.length,
          failedSlots: failedSlots.length,
          totalLLMCalls: totalCalls,
          totalTokens,
          totalCost,
        },
      });

      return {
        success: failedSlots.length === 0,
        slotOutputs,
        totalSlots: input.slots.length,
        completedSlots: slotOutputs.length,
        failedSlots,
        traceId: traceCtx.traceId,
        llmMetrics: {
          totalCalls,
          totalTokens,
          totalCost,
        },
      };

    } catch (error: any) {
      await logTraceEvent(traceCtx, {
        eventType: "WORKFLOW_FAILED",
        actor: "AgentOrchestrator",
        entityType: "PSUR_CASE",
        entityId: String(input.psurCaseId),
        decision: "FAIL",
        outputData: { error: error.message },
        reasons: [error.message],
      });

      return {
        success: false,
        slotOutputs: [],
        totalSlots: input.slots.length,
        completedSlots: 0,
        failedSlots: input.slots.map(s => s.slotId),
        traceId: traceCtx.traceId,
        llmMetrics: { totalCalls, totalTokens, totalCost },
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════════

  private extractSourceColumns(parsedContent: ExtractionInput["parsedContent"]): FieldMappingInput["sourceColumns"] {
    if (parsedContent.type === "tabular" && parsedContent.rows && parsedContent.rows.length > 0) {
      const firstRow = parsedContent.rows[0];
      const columns: FieldMappingInput["sourceColumns"] = [];

      for (const [name, value] of Object.entries(firstRow)) {
        const sampleValues = parsedContent.rows
          .slice(0, 10)
          .map(r => r[name])
          .filter(v => v !== null && v !== undefined);

        columns.push({
          name,
          sampleValues,
          dataType: typeof value,
        });
      }

      return columns;
    }

    return [];
  }

  private getTargetSchema(evidenceType: string): FieldMappingInput["targetSchema"] {
    const schemas: Record<string, FieldMappingInput["targetSchema"]> = {
      complaint_record: [
        { fieldName: "complaintId", displayName: "Complaint ID", type: "string", required: true, description: "Unique complaint identifier" },
        { fieldName: "deviceCode", displayName: "Device Code", type: "string", required: true, description: "Device/product code or part number" },
        { fieldName: "complaintDate", displayName: "Complaint Date", type: "date", required: true, description: "When complaint was received or reported" },
        { fieldName: "description", displayName: "Description", type: "string", required: true, description: "Complaint description or nonconformity" },
        { fieldName: "severity", displayName: "Severity", type: "string", required: false, description: "Severity level" },
        { fieldName: "region", displayName: "Region", type: "string", required: false, description: "Geographic region" },
        { fieldName: "country", displayName: "Country", type: "string", required: false, description: "Country code" },
        { fieldName: "patientOutcome", displayName: "Patient Outcome", type: "string", required: false, description: "Patient outcome if applicable" },
        { fieldName: "rootCause", displayName: "Root Cause", type: "string", required: false, description: "Root cause or investigation findings" },
        { fieldName: "correctiveAction", displayName: "Corrective Action", type: "string", required: false, description: "Corrective action taken" },
        { fieldName: "investigationStatus", displayName: "Investigation Status", type: "string", required: false, description: "Status of investigation" },
        { fieldName: "serious", displayName: "Serious", type: "string", required: false, description: "Whether complaint is reportable/serious" },
      ],
      sales_volume: [
        { fieldName: "deviceCode", displayName: "Device Code", type: "string", required: true, description: "Device/product code" },
        { fieldName: "region", displayName: "Region", type: "string", required: true, description: "Geographic region" },
        { fieldName: "periodStart", displayName: "Period Start", type: "date", required: true, description: "Start of period" },
        { fieldName: "periodEnd", displayName: "Period End", type: "date", required: true, description: "End of period" },
        { fieldName: "quantity", displayName: "Quantity", type: "number", required: true, description: "Number of units sold" },
        { fieldName: "revenue", displayName: "Revenue", type: "number", required: false, description: "Revenue amount" },
      ],
      fsca_record: [
        { fieldName: "fscaId", displayName: "FSCA ID", type: "string", required: true, description: "FSCA identifier" },
        { fieldName: "deviceCode", displayName: "Device Code", type: "string", required: true, description: "Device/product code" },
        { fieldName: "initiationDate", displayName: "Initiation Date", type: "date", required: true, description: "When FSCA was initiated" },
        { fieldName: "description", displayName: "Description", type: "string", required: true, description: "FSCA description" },
        { fieldName: "affectedUnits", displayName: "Affected Units", type: "number", required: false, description: "Number of affected units" },
        { fieldName: "investigationStatus", displayName: "Status", type: "string", required: false, description: "Current status" },
      ],
      capa_record: [
        { fieldName: "capaId", displayName: "CAPA ID", type: "string", required: true, description: "CAPA identifier" },
        { fieldName: "deviceCode", displayName: "Device Code", type: "string", required: true, description: "Device/product code" },
        { fieldName: "openDate", displayName: "Open Date", type: "date", required: true, description: "When CAPA was opened" },
        { fieldName: "description", displayName: "Description", type: "string", required: true, description: "CAPA description" },
        { fieldName: "type", displayName: "Type", type: "string", required: false, description: "Corrective or Preventive" },
        { fieldName: "status", displayName: "Status", type: "string", required: false, description: "Current status" },
      ],
      // Add more schemas as needed
    };

    return schemas[evidenceType] || [];
  }

  private generateTableContent(
    slot: RuntimeWorkflowInput["slots"][0],
    atoms: any[]
  ): { content: string; atomIds: string[] } {
    if (atoms.length === 0) {
      return {
        content: "| No Data Available |\n|---|\n| No records found for this reporting period |",
        atomIds: [],
      };
    }

    // Determine columns from first atom
    const firstAtom = atoms[0];
    const data = firstAtom.normalizedData as Record<string, unknown>;
    const columns = Object.keys(data).filter(k => !["raw_data"].includes(k)).slice(0, 8);

    // Build table
    const lines: string[] = [];
    lines.push(`| ${columns.map(c => c.replace(/_/g, " ").toUpperCase()).join(" | ")} | Evidence |`);
    lines.push(`| ${columns.map(() => "---").join(" | ")} | --- |`);

    for (const atom of atoms.slice(0, 100)) {
      const d = atom.normalizedData as Record<string, unknown>;
      const values = columns.map(c => String(d[c] || "-").substring(0, 50));
      lines.push(`| ${values.join(" | ")} | ${atom.atomId} |`);
    }

    if (atoms.length > 100) {
      lines.push(`| ... | ... | ... | ${atoms.length - 100} more rows |`);
    }

    return {
      content: lines.join("\n"),
      atomIds: atoms.map(a => a.atomId),
    };
  }

  private generateAdminContent(
    slot: RuntimeWorkflowInput["slots"][0],
    input: RuntimeWorkflowInput
  ): string {
    if (slot.slotId.includes("COVER")) {
      return `**Device:** ${input.deviceCode}\n**Reporting Period:** ${input.periodStart} to ${input.periodEnd}\n**Template:** ${input.templateId}`;
    }
    
    if (slot.slotId.includes("TOC")) {
      return "Table of Contents will be auto-generated during document assembly.";
    }

    return `Administrative section: ${slot.title}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let orchestratorInstance: AgentOrchestrator | null = null;

export function getOrchestrator(): AgentOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new AgentOrchestrator();
  }
  return orchestratorInstance;
}
