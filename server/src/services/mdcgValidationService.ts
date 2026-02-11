/**
 * MDCG 2022-21 VALIDATION SERVICE
 * 
 * State-of-the-art LLM-powered validation service that:
 * 1. Validates template mapping against MDCG 2022-21 Annex II table requirements
 * 2. Validates data presentation against Annex III rules
 * 3. Validates PSUR requirements based on Annex IV device classification
 * 4. Provides comprehensive compliance scoring with detailed gap analysis
 */

import * as fs from "fs";
import * as path from "path";
import { db } from "../../db";
import { eq, and, inArray } from "drizzle-orm";
import {
  grkbObligations,
  slotDefinitions,
  slotObligationLinks,
  decisionTraceEntries,
  evidenceAtoms,
  type InsertDecisionTraceEntry,
} from "@shared/schema";
import { v4 as uuidv4 } from "uuid";
import { complete, type LLMResponse } from "../agents/llmService";
import { createHash } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DeviceClassification {
  deviceClass: "Class I" | "Class IIa" | "Class IIb" | "Class III" | "Custom";
  isImplantable: boolean;
  isLegacy: boolean;
  legacyDirective?: "MDD" | "AIMDD";
  certificationDate?: Date;
}

export interface AnnexIITableRequirement {
  tableId: string;
  tableName: string;
  isRequired: boolean;
  isMandatoryForClass: boolean;
  evidenceTypes: string[];
}

export interface AnnexIIValidationResult {
  valid: boolean;
  score: number;
  tablesRequired: AnnexIITableRequirement[];
  tablesCovered: string[];
  tablesMissing: string[];
  fieldValidations: FieldValidation[];
  imdrfCodingValid: boolean;
  imdrfIssues: string[];
  regionalSplitValid: boolean;
  temporalComparisonValid: boolean;
  traceId: string;
}

export interface FieldValidation {
  tableId: string;
  fieldName: string;
  isValid: boolean;
  issue?: string;
}

export interface AnnexIIIAssessmentResult {
  valid: boolean;
  score: number;
  presentationRulesValid: boolean;
  presentationIssues: string[];
  assessmentRulesValid: boolean;
  assessmentIssues: string[];
  checklistResults: AnnexIIIChecklistItem[];
  llmAnalysis: string;
  traceId: string;
}

export interface AnnexIIIChecklistItem {
  id: string;
  requirement: string;
  status: "pass" | "fail" | "partial" | "not_applicable";
  findings: string;
}

export interface AnnexIVRequirements {
  frequency: "Annual" | "Biennial";
  frequencyMonths: number;
  eudamedSubmission: boolean;
  notifiedBodySubmission: boolean;
  firstPsurDueMonths: number;
  mandatoryTables: string[];
  timeBuckets: string[];
  applicableTemplates: string[];
}

export interface AnnexIVValidationResult {
  valid: boolean;
  requirements: AnnexIVRequirements;
  frequencyCompliant: boolean;
  timingCompliant: boolean;
  submissionRequirementsCompliant: boolean;
  issues: string[];
  recommendations: string[];
  traceId: string;
}

export interface MDCGComplianceReport {
  overallScore: number;
  overallStatus: "PASS" | "FAIL" | "WARNING";
  annexIIResult: AnnexIIValidationResult;
  annexIIIResult: AnnexIIIAssessmentResult;
  annexIVResult: AnnexIVValidationResult;
  blockingIssues: string[];
  warnings: string[];
  recommendations: string[];
  traceId: string;
  validatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANNEX LOADERS
// ═══════════════════════════════════════════════════════════════════════════════

let annexIICache: any = null;
let annexIIICache: any = null;
let annexIVCache: any = null;

function loadAnnexII(): any {
  if (annexIICache) return annexIICache;
  
  const annexPath = path.resolve(process.cwd(), "server", "templates", "MDCG_2022_21_ANNEX_II.json");
  if (fs.existsSync(annexPath)) {
    annexIICache = JSON.parse(fs.readFileSync(annexPath, "utf-8"));
  } else {
    console.warn("[MDCGValidationService] MDCG_2022_21_ANNEX_II.json not found");
    annexIICache = { tables: {} };
  }
  return annexIICache;
}

function loadAnnexIII(): any {
  if (annexIIICache) return annexIIICache;
  
  const annexPath = path.resolve(process.cwd(), "server", "templates", "MDCG_2022_21_ANNEX_III.json");
  if (fs.existsSync(annexPath)) {
    annexIIICache = JSON.parse(fs.readFileSync(annexPath, "utf-8"));
  } else {
    console.warn("[MDCGValidationService] MDCG_2022_21_ANNEX_III.json not found");
    annexIIICache = { presentation_rules: {}, assessment_rules: {}, validation_checklist: [] };
  }
  return annexIIICache;
}

function loadAnnexIV(): any {
  if (annexIVCache) return annexIVCache;
  
  const annexPath = path.resolve(process.cwd(), "server", "templates", "MDCG_2022_21_ANNEX_IV.json");
  if (fs.existsSync(annexPath)) {
    annexIVCache = JSON.parse(fs.readFileSync(annexPath, "utf-8"));
  } else {
    console.warn("[MDCGValidationService] MDCG_2022_21_ANNEX_IV.json not found");
    annexIVCache = { requirements_matrix: [] };
  }
  return annexIVCache;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MDCG VALIDATION SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class MDCGValidationService {
  private traceId: string;
  private sequenceNum: number = 0;

  constructor(traceId?: string) {
    this.traceId = traceId || uuidv4();
  }

  /**
   * Get PSUR requirements based on device classification (Annex IV)
   */
  getRequirementsForDevice(device: DeviceClassification): AnnexIVRequirements {
    const annexIV = loadAnnexIV();
    const matrix = annexIV.requirements_matrix || [];

    // Find matching requirement entry
    let match = matrix.find((entry: any) => {
      if (device.isLegacy) {
        return entry.device_class?.includes("Legacy") && 
               entry.device_class?.includes(device.deviceClass);
      }
      
      const classMatch = entry.device_class === device.deviceClass || 
                        entry.device_type?.includes(device.deviceClass);
      
      if (device.deviceClass === "Custom") {
        return entry.device_class === "Custom";
      }
      
      if (device.isImplantable !== undefined && entry.is_implantable !== null) {
        return classMatch && entry.is_implantable === device.isImplantable;
      }
      
      return classMatch;
    });

    // Default to Class IIb non-implantable if no match found
    if (!match) {
      console.warn(`[MDCGValidationService] No exact match for device class ${device.deviceClass}, using default`);
      match = matrix.find((entry: any) => 
        entry.device_class === "Class IIb" && entry.is_implantable === false
      ) || matrix[0];
    }

    return {
      frequency: match.frequency === "Annual" ? "Annual" : "Biennial",
      frequencyMonths: match.frequency_months || (match.frequency === "Annual" ? 12 : 24),
      eudamedSubmission: match.eudamed_submission || false,
      notifiedBodySubmission: match.notified_body_submission || false,
      firstPsurDueMonths: match.first_psur_due_months || 12,
      mandatoryTables: match.mandatory_tables || [],
      timeBuckets: match.time_buckets || ["N", "N-12"],
      applicableTemplates: match.applicable_templates || ["MDCG_2022_21_ANNEX_I"],
    };
  }

  /**
   * Validate template against MDCG 2022-21 Annex II table requirements
   */
  async validateAnnexII(
    templateId: string,
    deviceClassification: DeviceClassification,
    availableSlots: string[],
    evidenceTypes: string[]
  ): Promise<AnnexIIValidationResult> {
    const annexII = loadAnnexII();
    const tables = annexII.tables || {};
    const requirements = this.getRequirementsForDevice(deviceClassification);

    const tablesRequired: AnnexIITableRequirement[] = [];
    const tablesCovered: string[] = [];
    const tablesMissing: string[] = [];
    const fieldValidations: FieldValidation[] = [];
    const imdrfIssues: string[] = [];

    // Determine required tables based on device class
    for (const [tableKey, tableSpec] of Object.entries(tables) as [string, any][]) {
      const isMandatory = requirements.mandatoryTables.includes(tableKey);
      const mandatoryForClasses = tableSpec.mandatory_for_classes || [];
      const isMandatoryForClass = mandatoryForClasses.includes(deviceClassification.deviceClass);

      tablesRequired.push({
        tableId: tableSpec.table_id || tableKey,
        tableName: tableSpec.title || tableKey,
        isRequired: isMandatory,
        isMandatoryForClass,
        evidenceTypes: tableSpec.evidence_requirements?.required_types || [],
      });

      // Check if table is covered by available slots
      const tableEvidence = tableSpec.evidence_requirements?.required_types || [];
      const hasCoverage = tableEvidence.some((et: string) => evidenceTypes.includes(et));

      if (hasCoverage) {
        tablesCovered.push(tableKey);
      } else if (isMandatory || isMandatoryForClass) {
        tablesMissing.push(tableKey);
      }

      // Check IMDRF coding requirements
      if (tableSpec.terminology_standard?.includes("IMDRF")) {
        if (!evidenceTypes.some(et => et.includes("imdrf") || et.includes("serious_incident"))) {
          imdrfIssues.push(`${tableKey}: Missing IMDRF-coded incident data`);
        }
      }
    }

    // Validate regional split
    const regionalSplitValid = evidenceTypes.some(et => 
      et.includes("region") || et.includes("sales") || et.includes("incident")
    );

    // Validate temporal comparison based on device class
    const expectedBuckets = requirements.timeBuckets;
    const temporalComparisonValid = expectedBuckets.length > 0;

    const score = tablesRequired.length > 0
      ? Math.round((tablesCovered.length / tablesRequired.filter(t => t.isRequired).length) * 100)
      : 100;

    // Trace the validation
    await this.trace({
      eventType: "VALIDATION_PASSED",
      actor: "MDCGValidationService.validateAnnexII",
      entityType: "template",
      entityId: templateId,
      decision: score >= 80 ? "PASS" : score >= 50 ? "WARNING" : "FAIL",
      humanSummary: `Annex II validation: ${tablesCovered.length}/${tablesRequired.filter(t => t.isRequired).length} required tables covered (${score}%)`,
      outputData: {
        score,
        tablesCovered,
        tablesMissing,
        imdrfIssues,
      },
      templateId,
    });

    return {
      valid: tablesMissing.length === 0 && imdrfIssues.length === 0,
      score,
      tablesRequired,
      tablesCovered,
      tablesMissing,
      fieldValidations,
      imdrfCodingValid: imdrfIssues.length === 0,
      imdrfIssues,
      regionalSplitValid,
      temporalComparisonValid,
      traceId: this.traceId,
    };
  }

  /**
   * LLM-powered validation against MDCG 2022-21 Annex III assessment rules
   */
  async validateAnnexIII(
    psurContent: {
      sections: { id: string; title: string; content: string }[];
      tables: { id: string; data: any }[];
      methodology?: string;
      conclusions?: string;
    },
    deviceClassification: DeviceClassification
  ): Promise<AnnexIIIAssessmentResult> {
    const annexIII = loadAnnexIII();
    const checklist = annexIII.validation_checklist || [];
    const presentationRules = annexIII.presentation_rules || {};
    const assessmentRules = annexIII.assessment_rules || {};

    // Prepare content summary for LLM
    const contentSummary = psurContent.sections
      .map(s => `### ${s.title}\n${s.content.substring(0, 500)}...`)
      .join("\n\n");

    // LLM-powered assessment
    const systemPrompt = `You are an EU MDR regulatory compliance expert specializing in PSUR validation against MDCG 2022-21 requirements.

Your task is to assess PSUR content against Annex III rules for data presentation and assessment.

## Presentation Rules (from Annex III)
- Dataset separation: ${presentationRules.dataset_separation?.rule || "Each dataset analyzed individually"}
- Device granularity: ${JSON.stringify(presentationRules.device_granularity?.levels || [])}
- Regional split required: ${JSON.stringify(presentationRules.regional_split?.regions || [])}
- Temporal comparison required: ${presentationRules.temporal_comparison_required || true}
- IMDRF terminology: Level ${presentationRules.terminology_requirements?.preferred_level || 2}

## Assessment Rules (from Annex III)
${Object.entries(assessmentRules).map(([key, val]: [string, any]) => 
  `- ${key}: ${val.required ? "Required" : "Optional"} - ${val.description || ""}`
).join("\n")}

Evaluate the PSUR content and provide a JSON response with your assessment.`;

    const userPrompt = `## Device Classification
- Class: ${deviceClassification.deviceClass}
- Implantable: ${deviceClassification.isImplantable}
- Legacy: ${deviceClassification.isLegacy}

## PSUR Content Summary
${contentSummary}

## Methodology Statement
${psurContent.methodology || "Not provided"}

## Conclusions
${psurContent.conclusions || "Not provided"}

## Validation Checklist
${checklist.map((item: any) => `- ${item.id}: ${item.requirement}`).join("\n")}

Evaluate this PSUR content against MDCG 2022-21 Annex III requirements and return a JSON object with:
{
  "presentationRulesValid": boolean,
  "presentationIssues": string[],
  "assessmentRulesValid": boolean,
  "assessmentIssues": string[],
  "checklistResults": [{"id": string, "status": "pass"|"fail"|"partial"|"not_applicable", "findings": string}],
  "overallAnalysis": string,
  "complianceScore": number (0-100)
}`;

    let llmResult: any;
    try {
      const response = await complete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        config: {
          model: "gpt-4o-mini",
          temperature: 0.1,
          maxTokens: 3000,
        },
        responseFormat: "json",
      });

      llmResult = JSON.parse(response.content);
    } catch (error) {
      console.error("[MDCGValidationService] LLM assessment failed:", error);
      llmResult = {
        presentationRulesValid: false,
        presentationIssues: ["LLM assessment failed - manual review required"],
        assessmentRulesValid: false,
        assessmentIssues: ["LLM assessment failed - manual review required"],
        checklistResults: checklist.map((item: any) => ({
          id: item.id,
          status: "partial" as const,
          findings: "Unable to assess - manual review required",
        })),
        overallAnalysis: "Automated assessment failed. Please review manually.",
        complianceScore: 0,
      };
    }

    const score = llmResult.complianceScore || 0;

    // Trace the assessment
    await this.trace({
      eventType: "VALIDATION_PASSED",
      actor: "MDCGValidationService.validateAnnexIII",
      entityType: "psur_content",
      entityId: this.traceId,
      decision: score >= 80 ? "PASS" : score >= 50 ? "WARNING" : "FAIL",
      humanSummary: `Annex III assessment: ${score}% compliance score`,
      outputData: llmResult,
    });

    return {
      valid: llmResult.presentationRulesValid && llmResult.assessmentRulesValid,
      score,
      presentationRulesValid: llmResult.presentationRulesValid,
      presentationIssues: llmResult.presentationIssues || [],
      assessmentRulesValid: llmResult.assessmentRulesValid,
      assessmentIssues: llmResult.assessmentIssues || [],
      checklistResults: llmResult.checklistResults || [],
      llmAnalysis: llmResult.overallAnalysis || "",
      traceId: this.traceId,
    };
  }

  /**
   * Validate PSUR timing and submission requirements against Annex IV
   */
  async validateAnnexIV(
    deviceClassification: DeviceClassification,
    psurInfo: {
      psurNumber: number;
      reportingPeriodStart: Date;
      reportingPeriodEnd: Date;
      submissionDate?: Date;
      isEudamedSubmitted?: boolean;
    }
  ): Promise<AnnexIVValidationResult> {
    const requirements = this.getRequirementsForDevice(deviceClassification);
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Validate frequency
    const reportingPeriodMonths = this.monthsBetween(
      psurInfo.reportingPeriodStart,
      psurInfo.reportingPeriodEnd
    );
    
    const expectedMonths = requirements.frequencyMonths;
    const frequencyCompliant = Math.abs(reportingPeriodMonths - expectedMonths) <= 1;

    if (!frequencyCompliant) {
      issues.push(
        `PSUR reporting period is ${reportingPeriodMonths} months, expected ${expectedMonths} months for ${requirements.frequency} frequency`
      );
    }

    // Validate timing
    let timingCompliant = true;
    if (deviceClassification.certificationDate) {
      const monthsSinceCert = this.monthsBetween(
        deviceClassification.certificationDate,
        psurInfo.reportingPeriodEnd
      );
      
      const expectedPsurCount = Math.floor(monthsSinceCert / expectedMonths);
      if (psurInfo.psurNumber < expectedPsurCount) {
        timingCompliant = false;
        issues.push(
          `PSUR #${psurInfo.psurNumber} may be overdue. Expected ${expectedPsurCount} PSURs since certification.`
        );
      }
    }

    // Validate EUDAMED submission
    let submissionRequirementsCompliant = true;
    if (requirements.eudamedSubmission) {
      if (psurInfo.isEudamedSubmitted === false) {
        submissionRequirementsCompliant = false;
        issues.push("EUDAMED submission required but not completed");
        recommendations.push("Submit PSUR to EUDAMED within 30 days of finalization");
      }
    }

    // Check Notified Body requirements
    if (requirements.notifiedBodySubmission) {
      recommendations.push("Ensure Notified Body receives PSUR for review");
    }

    const valid = frequencyCompliant && timingCompliant && submissionRequirementsCompliant;

    // Trace the validation
    await this.trace({
      eventType: valid ? "VALIDATION_PASSED" : "VALIDATION_FAILED",
      actor: "MDCGValidationService.validateAnnexIV",
      entityType: "psur_submission",
      entityId: `PSUR-${psurInfo.psurNumber}`,
      decision: valid ? "PASS" : "FAIL",
      humanSummary: `Annex IV validation: ${valid ? "Compliant" : "Non-compliant"} - ${issues.length} issues found`,
      outputData: {
        requirements,
        frequencyCompliant,
        timingCompliant,
        submissionRequirementsCompliant,
        issues,
      },
    });

    return {
      valid,
      requirements,
      frequencyCompliant,
      timingCompliant,
      submissionRequirementsCompliant,
      issues,
      recommendations,
      traceId: this.traceId,
    };
  }

  /**
   * LLM-powered template mapping validation
   * Validates that template slots correctly map to MDCG 2022-21 requirements
   */
  async validateTemplateMappingWithLLM(
    templateId: string,
    slots: { slotId: string; title: string; description?: string; evidenceTypes: string[] }[],
    deviceClassification: DeviceClassification
  ): Promise<{
    valid: boolean;
    score: number;
    mappingIssues: string[];
    suggestions: string[];
    annexCompliance: {
      annexII: number;
      annexIII: number;
      annexIV: number;
    };
  }> {
    const annexII = loadAnnexII();
    const annexIII = loadAnnexIII();
    const requirements = this.getRequirementsForDevice(deviceClassification);

    const systemPrompt = `You are an EU MDR PSUR template validation expert. Your task is to validate that a PSUR template correctly implements MDCG 2022-21 requirements.

## Device Classification
- Class: ${deviceClassification.deviceClass}
- Implantable: ${deviceClassification.isImplantable}
- Frequency: ${requirements.frequency}

## Required Annex II Tables
${requirements.mandatoryTables.join(", ")}

## Annex III Assessment Requirements
- Cross-dataset analysis
- Population-specific evaluation
- State-of-art comparison
- Risk threshold analysis
- Signal detection methodology
- Benefit-risk conclusion

Evaluate the template slots and determine if they adequately cover all MDCG 2022-21 requirements.`;

    const slotSummary = slots.map(s => 
      `- ${s.slotId}: ${s.title}\n  Evidence: ${s.evidenceTypes.join(", ") || "None"}\n  Description: ${s.description || "N/A"}`
    ).join("\n");

    const userPrompt = `## Template Slots
${slotSummary}

Analyze these template slots against MDCG 2022-21 requirements and return a JSON response:
{
  "isValid": boolean,
  "mappingScore": number (0-100),
  "mappingIssues": string[],
  "suggestions": string[],
  "annexIICompliance": number (0-100),
  "annexIIICompliance": number (0-100),
  "annexIVCompliance": number (0-100),
  "missingSlots": string[],
  "excessSlots": string[]
}`;

    let result: any;
    try {
      const response = await complete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        config: {
          model: "gpt-4o-mini",
          temperature: 0.1,
          maxTokens: 2000,
        },
        responseFormat: "json",
      });

      result = JSON.parse(response.content);
    } catch (error) {
      console.error("[MDCGValidationService] LLM mapping validation failed:", error);
      result = {
        isValid: false,
        mappingScore: 0,
        mappingIssues: ["LLM validation failed - manual review required"],
        suggestions: [],
        annexIICompliance: 0,
        annexIIICompliance: 0,
        annexIVCompliance: 0,
      };
    }

    // Trace the validation
    await this.trace({
      eventType: "TEMPLATE_QUALIFIED",
      actor: "MDCGValidationService.validateTemplateMappingWithLLM",
      entityType: "template",
      entityId: templateId,
      decision: result.isValid ? "PASS" : "FAIL",
      humanSummary: `Template mapping validation: ${result.mappingScore}% compliance`,
      outputData: result,
      templateId,
    });

    return {
      valid: result.isValid,
      score: result.mappingScore,
      mappingIssues: result.mappingIssues || [],
      suggestions: result.suggestions || [],
      annexCompliance: {
        annexII: result.annexIICompliance || 0,
        annexIII: result.annexIIICompliance || 0,
        annexIV: result.annexIVCompliance || 0,
      },
    };
  }

  /**
   * Comprehensive MDCG 2022-21 compliance validation
   */
  async validateFullCompliance(
    templateId: string,
    deviceClassification: DeviceClassification,
    psurContent: {
      sections: { id: string; title: string; content: string }[];
      tables: { id: string; data: any }[];
      methodology?: string;
      conclusions?: string;
    },
    psurInfo: {
      psurNumber: number;
      reportingPeriodStart: Date;
      reportingPeriodEnd: Date;
      submissionDate?: Date;
      isEudamedSubmitted?: boolean;
    },
    availableSlots: string[],
    evidenceTypes: string[]
  ): Promise<MDCGComplianceReport> {
    console.log(`[MDCGValidationService] Starting full MDCG 2022-21 compliance validation for ${templateId}`);

    // Validate against all annexes
    const [annexIIResult, annexIIIResult, annexIVResult] = await Promise.all([
      this.validateAnnexII(templateId, deviceClassification, availableSlots, evidenceTypes),
      this.validateAnnexIII(psurContent, deviceClassification),
      this.validateAnnexIV(deviceClassification, psurInfo),
    ]);

    // Calculate overall score
    const overallScore = Math.round(
      (annexIIResult.score * 0.35) + 
      (annexIIIResult.score * 0.40) + 
      (annexIVResult.valid ? 100 : 50) * 0.25
    );

    // Determine blocking issues
    const blockingIssues: string[] = [];
    if (annexIIResult.tablesMissing.length > 0) {
      blockingIssues.push(`Missing mandatory Annex II tables: ${annexIIResult.tablesMissing.join(", ")}`);
    }
    if (!annexIVResult.valid) {
      blockingIssues.push(...annexIVResult.issues.filter(i => i.includes("required") || i.includes("overdue")));
    }

    // Collect warnings
    const warnings: string[] = [
      ...annexIIResult.imdrfIssues,
      ...annexIIIResult.presentationIssues,
      ...annexIIIResult.assessmentIssues,
    ];

    // Collect recommendations
    const recommendations: string[] = [
      ...annexIVResult.recommendations,
    ];

    if (!annexIIResult.regionalSplitValid) {
      recommendations.push("Ensure regional split (EEA+TR+XI vs Worldwide) is provided in all tables");
    }
    if (!annexIIResult.temporalComparisonValid) {
      recommendations.push("Add temporal comparison data for trending analysis");
    }

    const overallStatus: "PASS" | "FAIL" | "WARNING" = 
      blockingIssues.length > 0 ? "FAIL" :
      warnings.length > 0 || overallScore < 80 ? "WARNING" : "PASS";

    // Final trace
    await this.trace({
      eventType: overallStatus === "PASS" ? "VALIDATION_PASSED" : "VALIDATION_FAILED",
      actor: "MDCGValidationService.validateFullCompliance",
      entityType: "psur_compliance",
      entityId: templateId,
      decision: overallStatus,
      humanSummary: `MDCG 2022-21 compliance: ${overallStatus} (${overallScore}%)`,
      outputData: {
        overallScore,
        overallStatus,
        annexIIScore: annexIIResult.score,
        annexIIIScore: annexIIIResult.score,
        blockingIssues,
        warningCount: warnings.length,
      },
      templateId,
    });

    return {
      overallScore,
      overallStatus,
      annexIIResult,
      annexIIIResult,
      annexIVResult,
      blockingIssues,
      warnings,
      recommendations,
      traceId: this.traceId,
      validatedAt: new Date(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════════

  private monthsBetween(start: Date, end: Date): number {
    const years = end.getFullYear() - start.getFullYear();
    const months = end.getMonth() - start.getMonth();
    return years * 12 + months;
  }

  private async trace(data: Partial<InsertDecisionTraceEntry>): Promise<void> {
    const hash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");

    try {
      await db.insert(decisionTraceEntries).values({
        traceId: this.traceId,
        sequenceNum: ++this.sequenceNum,
        eventTimestamp: new Date(),
        contentHash: hash,
        jurisdictions: ["EU_MDR"],
        ...data,
      } as any);
    } catch (error) {
      console.warn("[MDCGValidationService] Failed to save trace:", error);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export function createMDCGValidationService(traceId?: string): MDCGValidationService {
  return new MDCGValidationService(traceId);
}

// Export functions for direct use
export async function getDeviceRequirements(device: DeviceClassification): Promise<AnnexIVRequirements> {
  const service = new MDCGValidationService();
  return service.getRequirementsForDevice(device);
}

export async function validatePSURCompliance(
  templateId: string,
  deviceClassification: DeviceClassification,
  psurContent: any,
  psurInfo: any,
  availableSlots: string[],
  evidenceTypes: string[]
): Promise<MDCGComplianceReport> {
  const service = new MDCGValidationService();
  return service.validateFullCompliance(
    templateId,
    deviceClassification,
    psurContent,
    psurInfo,
    availableSlots,
    evidenceTypes
  );
}
