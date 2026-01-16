/**
 * AI Agents Module - Main Entry Point
 * 
 * Exports all agent functionality for use throughout the application.
 */

// Base infrastructure
export { BaseAgent, AgentConfig, AgentContext, AgentResult, createAgentConfig } from "./baseAgent";
export { 
  complete, 
  completeJSON, 
  embed, 
  applyTemplate, 
  checkLLMHealth,
  PROMPT_TEMPLATES,
  LLMConfig,
  LLMRequest,
  LLMResponse,
} from "./llmService";

// Orchestrator
export { 
  AgentOrchestrator, 
  getOrchestrator,
  IngestionWorkflowInput,
  IngestionWorkflowResult,
  RuntimeWorkflowInput,
  RuntimeWorkflowResult,
} from "./agentOrchestrator";

// Configuration
export {
  SystemConfig,
  getConfig,
  updateConfig,
  applyPreset,
  resetConfig,
  createAgentConfigFromSystem,
  CONFIG_PRESETS,
  EVIDENCE_TYPE_MAPPINGS,
  getEvidenceTypeMapping,
  getEvidenceTypesByCategory,
} from "./config";

// Ingestion Agents
export { FieldMappingAgent, FieldMappingInput, FieldMappingOutput, FieldMapping } from "./ingestion/fieldMappingAgent";
export { EvidenceExtractionAgent, ExtractionInput, ExtractionOutput, ExtractedRecord } from "./ingestion/evidenceExtractionAgent";

// Runtime Agents
export { NarrativeWriterAgent, NarrativeInput, NarrativeOutput } from "./runtime/narrativeWriterAgent";

// SOTA Compile Agents
export { CompileOrchestrator, getCompileOrchestrator, CompileOrchestratorInput, CompileOrchestratorResult, CompiledSection, CompiledChart } from "./runtime/compileOrchestrator";
export { DocumentFormatterAgent, DocumentStyle, FormattedDocument, DocumentMetadata, DocumentFormatterInput } from "./runtime/documentFormatterAgent";

// Narrative Agents
export * from "./runtime/narratives";

// Table Agents
export * from "./runtime/tables";

// Chart Agents
export * from "./runtime/charts";
