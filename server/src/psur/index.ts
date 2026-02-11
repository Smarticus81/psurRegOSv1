/**
 * PSUR ENGINE INDEX
 * 
 * Central export point for all PSUR-related modules.
 * 
 * This module provides:
 * - PSUR Contract (authoritative schema)
 * - MDCG 2022-21 Annex I Mapping
 * - Calculation Engines (Sales, Complaints, Vigilance, Literature, PMCF)
 * - Markdown Renderer
 * - Quality Gate Validator
 * - Template Extension Validator
 */

// Contract
export * from "./psurContract";

// Mappings
// Mappings
export * from "./mappings/mdcg2022AnnexI";
export { MDCG_ANNEX_II_OBLIGATIONS } from "./mappings/mdcg2022AnnexII";
export { MDCG_ANNEX_III_OBLIGATIONS } from "./mappings/mdcg2022AnnexIII";

// Engines
// Note: Some types (ReportingPeriod, CalculationLogEntry) are defined in multiple engines
// Export all from salesExposureEngine first (as the canonical source for shared types)
export * from "./engines/salesExposureEngine";

// Re-export functions and unique types from other engines
// (duplicate interfaces like ReportingPeriod are excluded)
export {
  computeComplaintAnalysis,
  getComplaintNarrativeBlocks,
  type ComplaintAnalysisResult,
  type ComplaintEvidenceAtom,
  type CategoryBreakdown,
  type HarmBreakdown,
  type SeverityBreakdown,
  type HarmLevel,
} from "./engines/complaintEngine";

export {
  computeVigilanceAnalysis,
  getVigilanceNarrativeBlocks,
  type VigilanceAnalysisResult,
  type SeriousIncidentAtom,
  type FSCAAtom,
  type CAPARecord,
} from "./engines/vigilanceEngine";

export {
  computeLiteratureAnalysis,
  getLiteratureNarrativeBlocks,
  getLiteratureCitations,
  type LiteratureAnalysisResult,
  type LiteratureEvidenceAtom,
  type ExternalDatabaseSource,
} from "./engines/literatureEngine";

export {
  computePMCFDecision,
  getPMCFNarrativeBlocks,
  getPMCFDecisionStatement,
  type PMCFDecisionResult,
  type PMCFEvidenceAtom,
} from "./engines/pmcfEngine";

// Render
export * from "./render/renderPsurMarkdown";

// Validation
export * from "./validate/psurQualityGate";

// Template Extension
export * from "./templateExtension";
