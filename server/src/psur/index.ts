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
export * from "./mappings/mdcg2022AnnexI";

// Engines
export * from "./engines/salesExposureEngine";
export * from "./engines/complaintEngine";
export * from "./engines/vigilanceEngine";
export * from "./engines/literatureEngine";
export * from "./engines/pmcfEngine";

// Render
export * from "./render/renderPsurMarkdown";

// Validation
export * from "./validate/psurQualityGate";

// Template Extension
export * from "./templateExtension";
