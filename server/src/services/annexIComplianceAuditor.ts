/**
 * ANNEX I COMPLIANCE AUDITOR
 * 
 * Non-blocking compliance auditing system that flags templates not meeting
 * full MDCG 2022-21 Annex I requirements WITHOUT failing validation.
 * 
 * This service runs AFTER permissive schema validation and generates a
 * detailed compliance report with warnings and recommendations.
 * 
 * HYBRID APPROACH:
 * 1. Fast regex + mdcg_reference check first
 * 2. LLM semantic matching fallback for uncertain cases
 */

import { MDCG_ANNEX_I_OBLIGATIONS, type ObligationDefinition, type EvidenceType } from "../psur/mappings/mdcg2022AnnexI";
import type { Template, SlotDefinition } from "../templates/templateSchema";
import { complete } from "../agents/llmService";

// ============================================================================
// COMPLIANCE AUDIT TYPES
// ============================================================================

export interface ComplianceAuditResult {
  templateId: string;
  overallComplianceScore: number; // 0-100
  passedChecks: ComplianceCheck[];
  warnings: ComplianceWarning[];
  recommendations: string[];
  layerResults: {
    sectionStructure: SectionStructureResult;
    obligationCoverage: ObligationCoverageResult;
    requiredTables: RequiredTablesResult;
    evidenceTypes: EvidenceTypesResult;
    calculationRules: CalculationRulesResult;
    narrativeConstraints: NarrativeConstraintsResult;
    dependencies: DependenciesResult;
  };
  auditedAt: Date;
}

export interface ComplianceCheck {
  checkId: string;
  layer: ComplianceLayer;
  description: string;
  passed: boolean;
}

export interface ComplianceWarning {
  level: "INFO" | "WARNING" | "CRITICAL";
  category: ComplianceLayer;
  obligationId?: string;
  slotId?: string;
  message: string;
  remediation: string;
  impact: string;
}

export type ComplianceLayer = 
  | "STRUCTURE" 
  | "OBLIGATION" 
  | "TABLE" 
  | "EVIDENCE" 
  | "CALCULATION" 
  | "NARRATIVE" 
  | "DEPENDENCY";

export interface SectionStructureResult {
  score: number;
  missingSections: string[];
  invalidPaths: string[];
  recommendations: string[];
}

export interface ObligationCoverageResult {
  score: number;
  totalMandatory: number;
  covered: number;
  missing: string[];
  recommendations: string[];
}

export interface RequiredTablesResult {
  score: number;
  missingTables: Array<{
    obligationId: string;
    tableId: string;
    slotId?: string;
  }>;
  recommendations: string[];
}

export interface EvidenceTypesResult {
  score: number;
  missingMappings: Array<{
    obligationId: string;
    slotId?: string;
    missingTypes: string[];
  }>;
  recommendations: string[];
}

export interface CalculationRulesResult {
  score: number;
  missingRules: Array<{
    obligationId: string;
    ruleId: string;
    slotId?: string;
  }>;
  recommendations: string[];
}

export interface NarrativeConstraintsResult {
  score: number;
  missingConstraints: Array<{
    obligationId: string;
    constraintType: string;
    slotId?: string;
  }>;
  recommendations: string[];
}

export interface DependenciesResult {
  score: number;
  brokenDependencies: Array<{
    obligationId: string;
    dependsOn: string[];
    missing: string[];
  }>;
  recommendations: string[];
}

// ============================================================================
// ANNEX I COMPLIANCE AUDITOR
// ============================================================================

export class AnnexIComplianceAuditor {
  /**
   * Audit a template for MDCG 2022-21 Annex I compliance
   * Returns detailed report with warnings but NEVER fails the template
   */
  async auditTemplate(template: Template): Promise<ComplianceAuditResult> {
    console.log(`[AnnexIComplianceAuditor] Starting compliance audit for template: ${template.template_id}`);

    const warnings: ComplianceWarning[] = [];
    const passedChecks: ComplianceCheck[] = [];
    const recommendations: string[] = [];

    // Layer 1: Section Structure (async - uses LLM fallback)
    const sectionStructure = await this.checkSectionStructure(template);
    this.collectResults(sectionStructure, "STRUCTURE", passedChecks, warnings, recommendations);

    // Layer 2: Obligation Coverage
    const obligationCoverage = this.checkObligationCoverage(template);
    this.collectResults(obligationCoverage, "OBLIGATION", passedChecks, warnings, recommendations);

    // Layer 3: Required Tables
    const requiredTables = this.checkRequiredTables(template);
    this.collectResults(requiredTables, "TABLE", passedChecks, warnings, recommendations);

    // Layer 4: Evidence Type Mapping
    const evidenceTypes = this.checkEvidenceTypes(template);
    this.collectResults(evidenceTypes, "EVIDENCE", passedChecks, warnings, recommendations);

    // Layer 5: Calculation Rules
    const calculationRules = this.checkCalculationRules(template);
    this.collectResults(calculationRules, "CALCULATION", passedChecks, warnings, recommendations);

    // Layer 6: Narrative Constraints
    const narrativeConstraints = this.checkNarrativeConstraints(template);
    this.collectResults(narrativeConstraints, "NARRATIVE", passedChecks, warnings, recommendations);

    // Layer 7: Dependency Chain
    const dependencies = this.checkDependencies(template);
    this.collectResults(dependencies, "DEPENDENCY", passedChecks, warnings, recommendations);

    // Calculate overall compliance score (average of all layers)
    const overallScore = Math.round(
      (sectionStructure.score +
        obligationCoverage.score +
        requiredTables.score +
        evidenceTypes.score +
        calculationRules.score +
        narrativeConstraints.score +
        dependencies.score) / 7
    );

    console.log(`[AnnexIComplianceAuditor] Audit complete: ${overallScore}% compliance, ${warnings.length} warnings`);

    return {
      templateId: template.template_id,
      overallComplianceScore: overallScore,
      passedChecks,
      warnings,
      recommendations: [...new Set(recommendations)], // Deduplicate
      layerResults: {
        sectionStructure,
        obligationCoverage,
        requiredTables,
        evidenceTypes,
        calculationRules,
        narrativeConstraints,
        dependencies,
      },
      auditedAt: new Date(),
    };
  }

  // ========================================================================
  // LAYER 1: SECTION STRUCTURE (Hybrid: Regex + mdcg_reference + LLM fallback)
  // ========================================================================

  private async checkSectionStructure(template: Template): Promise<SectionStructureResult> {
    // Expected sections with regex patterns AND mdcg_reference patterns
    const expectedSections = [
      { id: "COVER", pattern: /cover/i, mdcgRef: /MDCG\.ANNEXI\.COVER/i, path: "Cover" },
      { id: "TOC", pattern: /toc|table.*contents/i, mdcgRef: /MDCG\.ANNEXI\.TOC/i, path: "FrontMatter" },
      { id: "EXEC_SUMMARY", pattern: /executive.*summary/i, mdcgRef: /MDCG\.ANNEXI\.EXEC/i, path: "A > Executive Summary" },
      { id: "DEVICE_SCOPE", pattern: /device.*description|scope|intended.*purpose/i, mdcgRef: /MDCG\.ANNEXI\.DEVICES_SCOPE/i, path: "B > Device Scope" },
      { id: "SALES", pattern: /sales|distribution|exposure/i, mdcgRef: /MDCG\.ANNEXI\.SALES/i, path: "C > Sales" },
      { id: "INCIDENTS", pattern: /serious.*incident|vigilance/i, mdcgRef: /MDCG\.ANNEXI\.SERIOUS_INCIDENTS/i, path: "D > Serious Incidents" },
      { id: "COMPLAINTS", pattern: /complaint/i, mdcgRef: /MDCG\.ANNEXI\.COMPLAINTS/i, path: "F > Complaints" },
      { id: "TRENDS", pattern: /trend/i, mdcgRef: /MDCG\.ANNEXI\.TREND/i, path: "G > Trends" },
      { id: "FSCA", pattern: /fsca|field.*safety/i, mdcgRef: /MDCG\.ANNEXI\.FSCA/i, path: "H > FSCAs" },
      { id: "CAPA", pattern: /capa|corrective/i, mdcgRef: /MDCG\.ANNEXI\.CAPA/i, path: "I > CAPAs" },
      { id: "LITERATURE", pattern: /literature/i, mdcgRef: /MDCG\.ANNEXI\.LITERATURE/i, path: "J > Literature" },
      { id: "EXTERNAL_DB", pattern: /external.*database|registry|maude/i, mdcgRef: /MDCG\.ANNEXI\.EXTERNAL/i, path: "K > External Databases" },
      { id: "PMCF", pattern: /pmcf|post.*market.*clinical/i, mdcgRef: /MDCG\.ANNEXI\.PMCF/i, path: "L > PMCF" },
      { id: "CONCLUSIONS", pattern: /conclusion|benefit.*risk/i, mdcgRef: /MDCG\.ANNEXI\.(CONCLUSION|BENEFIT_RISK|ACTIONS)/i, path: "M > Conclusions" },
    ];

    const missingSections: string[] = [];
    const invalidPaths: string[] = [];
    const recommendations: string[] = [];
    const potentiallyMissing: Array<{ expected: typeof expectedSections[0], slots: any[] }> = [];

    for (const expected of expectedSections) {
      // Phase 1: Fast regex check on slot_id, title, section_path
      let found = template.slots.find(
        (slot) =>
          expected.pattern.test(slot.slot_id) ||
          expected.pattern.test(slot.title) ||
          expected.pattern.test(slot.section_path)
      );

      // Phase 2: Check mdcg_reference field (custom field many templates use)
      if (!found) {
        found = template.slots.find((slot) => {
          const slotAny = slot as any;
          const mdcgRef = slotAny.mdcg_reference || slotAny.mdcgReference || "";
          return expected.mdcgRef.test(mdcgRef);
        });
      }

      // Phase 3: Check regulatory_obligations array
      if (!found) {
        found = template.slots.find((slot) => {
          const slotAny = slot as any;
          const regObligs = slotAny.regulatory_obligations || [];
          return regObligs.some((obl: string) => expected.mdcgRef.test(obl));
        });
      }

      if (!found) {
        // Queue for LLM verification
        potentiallyMissing.push({ expected, slots: template.slots });
      } else {
        // Check if section_path follows standard format
        if (!found.section_path.includes(">") && found.slot_kind !== "ADMIN") {
          invalidPaths.push(
            `Slot "${found.slot_id}" should use hierarchical path (e.g., "1 > Executive Summary")`
          );
        }
      }
    }

    // Phase 4: LLM fallback for potentially missing sections
    let llmVerifiedMissing: string[] = [];
    if (potentiallyMissing.length > 0) {
      llmVerifiedMissing = await this.llmVerifyMissingSections(potentiallyMissing, template);
    }

    // Build final missing list
    for (const missing of llmVerifiedMissing) {
      missingSections.push(missing);
      const expected = expectedSections.find(e => e.id === missing.split(":")[0]);
      if (expected && (expected.id === "EXEC_SUMMARY" || expected.id === "CONCLUSIONS")) {
        recommendations.push(
          `Add mandatory section ${expected.id} at path "${expected.path}" per MDCG 2022-21 Annex I`
        );
      }
    }

    const score = Math.round(
      ((expectedSections.length - missingSections.length) / expectedSections.length) * 100
    );

    return {
      score,
      missingSections,
      invalidPaths,
      recommendations,
    };
  }

  /**
   * LLM fallback to verify if sections are truly missing
   * Only called for sections not found by regex/mdcg_reference
   */
  private async llmVerifyMissingSections(
    potentiallyMissing: Array<{ expected: { id: string; path: string }; slots: any[] }>,
    template: Template
  ): Promise<string[]> {
    const confirmedMissing: string[] = [];

    // Build slot summary for LLM
    const slotSummary = template.slots.map((s: any) => ({
      slot_id: s.slot_id,
      title: s.title,
      section_path: s.section_path,
      mdcg_reference: s.mdcg_reference || s.mdcgReference || null,
      regulatory_obligations: s.regulatory_obligations || [],
      slot_kind: s.slot_kind,
    }));

    for (const { expected } of potentiallyMissing) {
      try {
        const response = await complete({
          messages: [
            {
              role: "system",
              content: `You are a regulatory expert analyzing PSUR templates for MDCG 2022-21 Annex I compliance.
Determine if the required section is covered by any slot in the template.
Return JSON: {"covered": true/false, "matchingSlotId": "slot_id or null", "confidence": 0-100, "reasoning": "brief explanation"}`,
            },
            {
              role: "user",
              content: `Required Section: ${expected.id}
Description: ${expected.path}
MDCG Reference Pattern: MDCG.ANNEXI.${expected.id}

Template Slots:
${JSON.stringify(slotSummary, null, 2)}

Is this required section covered by any of the template slots? Consider:
- The slot's title and section_path
- The slot's mdcg_reference field
- The slot's regulatory_obligations array
- Semantic equivalence (e.g., "Section D" covering "Serious Incidents")`,
            },
          ],
          model: "gpt-4o-mini",
          temperature: 0.1,
          response_format: { type: "json_object" },
        });

        const result = JSON.parse(response.content);
        
        if (!result.covered || result.confidence < 70) {
          confirmedMissing.push(`${expected.id}: ${expected.path}`);
          console.log(`[ComplianceAuditor] LLM confirmed missing: ${expected.id} (confidence: ${result.confidence})`);
        } else {
          console.log(`[ComplianceAuditor] LLM found match for ${expected.id}: ${result.matchingSlotId} (confidence: ${result.confidence})`);
        }
      } catch (error) {
        // If LLM fails, be conservative and mark as missing
        console.warn(`[ComplianceAuditor] LLM verification failed for ${expected.id}, marking as missing`);
        confirmedMissing.push(`${expected.id}: ${expected.path}`);
      }
    }

    return confirmedMissing;
  }

  // ========================================================================
  // LAYER 2: OBLIGATION COVERAGE
  // ========================================================================

  private checkObligationCoverage(template: Template): ObligationCoverageResult {
    const mandatoryObligations = MDCG_ANNEX_I_OBLIGATIONS.filter((o) => o.isMandatory);
    const covered = new Set(template.mandatory_obligation_ids);
    const missing = mandatoryObligations
      .filter((o) => !covered.has(o.obligationId))
      .map((o) => o.obligationId);

    const recommendations: string[] = [];
    for (const missedId of missing) {
      const obl = MDCG_ANNEX_I_OBLIGATIONS.find((o) => o.obligationId === missedId);
      if (obl) {
        recommendations.push(
          `Add obligation "${obl.title}" (${missedId}) - Required by ${obl.mdcgReference}`
        );
      }
    }

    const score = Math.round((covered.size / mandatoryObligations.length) * 100);

    return {
      score,
      totalMandatory: mandatoryObligations.length,
      covered: covered.size,
      missing,
      recommendations,
    };
  }

  // ========================================================================
  // LAYER 3: REQUIRED TABLES (Enhanced: checks table_schema, mdcg_reference)
  // ========================================================================

  private checkRequiredTables(template: Template): RequiredTablesResult {
    const missingTables: Array<{ obligationId: string; tableId: string; slotId?: string }> = [];
    const recommendations: string[] = [];

    for (const obligation of MDCG_ANNEX_I_OBLIGATIONS) {
      if (!obligation.isMandatory) continue;

      for (const tableId of obligation.requiredTables) {
        // Check if any slot references this table (multiple detection methods)
        const hasTable = template.slots.some((slot) => {
          const slotAny = slot as any;
          
          // Method 1: Direct slot_id/title match
          if (slot.slot_id.toLowerCase().includes(tableId.toLowerCase()) ||
              slot.title.toLowerCase().includes(tableId.toLowerCase())) {
            return true;
          }
          
          // Method 2: Check output_requirements.table_id
          if (slotAny.output_requirements?.table_id === tableId) {
            return true;
          }
          
          // Method 3: Check output_requirements.table_schema (string reference)
          if (slotAny.output_requirements?.table_schema === tableId) {
            return true;
          }
          
          // Method 4: Check output_requirements.table_schemas array
          if (Array.isArray(slotAny.output_requirements?.table_schemas)) {
            if (slotAny.output_requirements.table_schemas.includes(tableId)) {
              return true;
            }
          }
          
          // Method 5: Check mdcg_reference for table patterns
          const mdcgRef = slotAny.mdcg_reference || slotAny.mdcgReference || "";
          if (mdcgRef.toLowerCase().includes(tableId.toLowerCase().replace("table_", ""))) {
            return true;
          }
          
          // Method 6: Check regulatory_obligations array
          const regObligs = slotAny.regulatory_obligations || [];
          if (regObligs.some((obl: string) => 
            obl.toLowerCase().includes(tableId.toLowerCase().replace("table_", "")))) {
            return true;
          }
          
          // Method 7: Check if slot is a TABLE with matching Annex II reference
          if (slot.slot_kind === "TABLE" && slotAny.output_requirements?.mdcg_annex_ii_compliant) {
            // Map common table IDs to MDCG patterns
            const tablePatterns: Record<string, RegExp> = {
              "TABLE_SALES_BY_REGION_YEAR": /sales|exposure/i,
              "TABLE_SALES_CUMULATIVE": /sales|cumulative/i,
              "TABLE_IMDRF_ANNEX_A": /imdrf|serious.*incident|problem.*code/i,
              "TABLE_IMDRF_ANNEX_C": /imdrf|investigation|conclusion/i,
              "TABLE_IMDRF_ANNEX_F": /imdrf|health.*effect/i,
              "TABLE_COMPLAINTS_BY_CATEGORY": /complaint/i,
              "TABLE_COMPLAINT_RATES": /complaint.*rate/i,
              "TABLE_FSCA_SUMMARY": /fsca|field.*safety/i,
              "TABLE_CAPA_STATUS": /capa|corrective/i,
              "TABLE_PMCF_ACTIVITIES": /pmcf|clinical.*follow/i,
            };
            const pattern = tablePatterns[tableId];
            if (pattern && (pattern.test(slot.title) || pattern.test(slot.slot_id))) {
              return true;
            }
          }
          
          return false;
        });

        if (!hasTable) {
          missingTables.push({
            obligationId: obligation.obligationId,
            tableId,
          });
          recommendations.push(
            `Add table "${tableId}" for obligation "${obligation.title}" (${obligation.obligationId})`
          );
        }
      }
    }

    const totalRequired = MDCG_ANNEX_I_OBLIGATIONS.filter((o) => o.isMandatory)
      .flatMap((o) => o.requiredTables)
      .length;

    const score =
      totalRequired > 0 ? Math.round(((totalRequired - missingTables.length) / totalRequired) * 100) : 100;

    return {
      score,
      missingTables,
      recommendations: [...new Set(recommendations)],
    };
  }

  // ========================================================================
  // LAYER 4: EVIDENCE TYPE MAPPING (Handles both array and object formats)
  // ========================================================================

  private checkEvidenceTypes(template: Template): EvidenceTypesResult {
    const missingMappings: Array<{
      obligationId: string;
      slotId?: string;
      missingTypes: string[];
    }> = [];
    const recommendations: string[] = [];

    // Build map of slot -> evidence types (handle both formats)
    const slotEvidenceMap = new Map<string, Set<string>>();
    for (const slot of template.slots) {
      const slotAny = slot as any;
      let evidenceTypes: string[] = [];
      
      // Handle object format: { required_types: [...] }
      if (slotAny.evidence_requirements?.required_types) {
        evidenceTypes = slotAny.evidence_requirements.required_types;
      }
      // Handle legacy array format: [...]
      else if (Array.isArray(slotAny.evidence_requirements)) {
        evidenceTypes = slotAny.evidence_requirements;
      }
      
      slotEvidenceMap.set(slot.slot_id, new Set(evidenceTypes));
    }

    // Build map of obligation -> slots (from template.mapping)
    const obligationToSlots = new Map<string, string[]>();
    for (const [slotId, obligationIds] of Object.entries(template.mapping)) {
      for (const oblId of obligationIds) {
        if (!obligationToSlots.has(oblId)) {
          obligationToSlots.set(oblId, []);
        }
        obligationToSlots.get(oblId)!.push(slotId);
      }
    }

    for (const obligation of MDCG_ANNEX_I_OBLIGATIONS) {
      if (!obligation.isMandatory || obligation.requiredEvidenceTypes.length === 0) continue;

      const slotIds = obligationToSlots.get(obligation.obligationId) || [];
      const slotTypes = new Set<string>();

      for (const slotId of slotIds) {
        const types = slotEvidenceMap.get(slotId);
        if (types) {
          types.forEach((t) => slotTypes.add(t));
        }
      }

      const missing = obligation.requiredEvidenceTypes.filter((et) => !slotTypes.has(et as string));

      if (missing.length > 0) {
        missingMappings.push({
          obligationId: obligation.obligationId,
          slotId: slotIds[0],
          missingTypes: missing as string[],
        });
        recommendations.push(
          `Obligation "${obligation.title}" requires evidence types: ${missing.join(", ")}`
        );
      }
    }

    const totalRequired = MDCG_ANNEX_I_OBLIGATIONS.filter((o) => o.isMandatory && o.requiredEvidenceTypes.length > 0)
      .length;

    const score =
      totalRequired > 0 ? Math.round(((totalRequired - missingMappings.length) / totalRequired) * 100) : 100;

    return {
      score,
      missingMappings,
      recommendations: [...new Set(recommendations)],
    };
  }

  // ========================================================================
  // LAYER 5: CALCULATION RULES
  // ========================================================================

  private checkCalculationRules(template: Template): CalculationRulesResult {
    const missingRules: Array<{
      obligationId: string;
      ruleId: string;
      slotId?: string;
    }> = [];
    const recommendations: string[] = [];

    for (const obligation of MDCG_ANNEX_I_OBLIGATIONS) {
      if (!obligation.isMandatory || !obligation.calculationRules) continue;

      for (const rule of obligation.calculationRules) {
        // Check if any slot mentions this calculation
        const hasRule = template.slots.some((slot) => {
          const slotAny = slot as any;
          return (
            slotAny.calculation_rules?.some((r: any) => r.ruleId === rule.ruleId) ||
            slotAny.description?.includes(rule.name) ||
            slotAny.description?.includes(rule.formula)
          );
        });

        if (!hasRule) {
          missingRules.push({
            obligationId: obligation.obligationId,
            ruleId: rule.ruleId,
          });
          recommendations.push(
            `Add calculation "${rule.name}" (${rule.formula}) for obligation "${obligation.title}"`
          );
        }
      }
    }

    const totalRequired = MDCG_ANNEX_I_OBLIGATIONS.filter((o) => o.isMandatory && o.calculationRules)
      .flatMap((o) => o.calculationRules!)
      .length;

    const score =
      totalRequired > 0 ? Math.round(((totalRequired - missingRules.length) / totalRequired) * 100) : 100;

    return {
      score,
      missingRules,
      recommendations: [...new Set(recommendations)],
    };
  }

  // ========================================================================
  // LAYER 6: NARRATIVE CONSTRAINTS
  // ========================================================================

  private checkNarrativeConstraints(template: Template): NarrativeConstraintsResult {
    const missingConstraints: Array<{
      obligationId: string;
      constraintType: string;
      slotId?: string;
    }> = [];
    const recommendations: string[] = [];

    for (const obligation of MDCG_ANNEX_I_OBLIGATIONS) {
      if (!obligation.isMandatory || obligation.narrativeConstraints.length === 0) continue;

      for (const constraint of obligation.narrativeConstraints) {
        // Check if any slot references this constraint
        const hasConstraint = template.slots.some((slot) => {
          const slotAny = slot as any;
          return (
            slotAny.narrative_constraints?.some((nc: any) => nc.type === constraint.type) ||
            slotAny.quality_checks?.some((qc: string) =>
              qc.toLowerCase().includes(constraint.type.toLowerCase())
            ) ||
            slotAny.description?.includes(constraint.requiredText)
          );
        });

        if (!hasConstraint) {
          missingConstraints.push({
            obligationId: obligation.obligationId,
            constraintType: constraint.type,
          });
          recommendations.push(
            `Add narrative constraint "${constraint.type}" for obligation "${obligation.title}": "${constraint.requiredText}"`
          );
        }
      }
    }

    const totalRequired = MDCG_ANNEX_I_OBLIGATIONS.filter(
      (o) => o.isMandatory && o.narrativeConstraints.length > 0
    )
      .flatMap((o) => o.narrativeConstraints)
      .length;

    const score =
      totalRequired > 0 ? Math.round(((totalRequired - missingConstraints.length) / totalRequired) * 100) : 100;

    return {
      score,
      missingConstraints,
      recommendations: [...new Set(recommendations)],
    };
  }

  // ========================================================================
  // LAYER 7: DEPENDENCY CHAIN
  // ========================================================================

  private checkDependencies(template: Template): DependenciesResult {
    const brokenDependencies: Array<{
      obligationId: string;
      dependsOn: string[];
      missing: string[];
    }> = [];
    const recommendations: string[] = [];

    const covered = new Set(template.mandatory_obligation_ids);

    for (const obligation of MDCG_ANNEX_I_OBLIGATIONS) {
      if (!obligation.isMandatory || !obligation.dependsOn) continue;

      const missing = obligation.dependsOn.filter((depId) => !covered.has(depId));

      if (missing.length > 0) {
        brokenDependencies.push({
          obligationId: obligation.obligationId,
          dependsOn: obligation.dependsOn,
          missing,
        });

        for (const missedId of missing) {
          const depObl = MDCG_ANNEX_I_OBLIGATIONS.find((o) => o.obligationId === missedId);
          recommendations.push(
            `Obligation "${obligation.title}" depends on "${depObl?.title || missedId}" which is missing`
          );
        }
      }
    }

    const totalRequired = MDCG_ANNEX_I_OBLIGATIONS.filter((o) => o.isMandatory && o.dependsOn).length;

    const score =
      totalRequired > 0 ? Math.round(((totalRequired - brokenDependencies.length) / totalRequired) * 100) : 100;

    return {
      score,
      brokenDependencies,
      recommendations: [...new Set(recommendations)],
    };
  }

  // ========================================================================
  // HELPERS
  // ========================================================================

  private collectResults(
    result: any,
    layer: ComplianceLayer,
    passedChecks: ComplianceCheck[],
    warnings: ComplianceWarning[],
    recommendations: string[]
  ): void {
    // Add passed check
    passedChecks.push({
      checkId: `${layer}_CHECK`,
      layer,
      description: `${layer} validation`,
      passed: result.score >= 80,
    });

    // Collect warnings based on score
    if (result.score < 80) {
      const level = result.score < 50 ? "CRITICAL" : result.score < 70 ? "WARNING" : "INFO";
      warnings.push({
        level,
        category: layer,
        message: `${layer} compliance is ${result.score}% (recommended: 80%+)`,
        remediation: result.recommendations[0] || "Review and add missing requirements",
        impact:
          level === "CRITICAL"
            ? "Template may not meet regulatory requirements"
            : "Template coverage is incomplete",
      });
    }

    // Collect recommendations
    recommendations.push(...result.recommendations);
  }
}

/**
 * Factory function to create auditor instance
 */
export function createAnnexIComplianceAuditor(): AnnexIComplianceAuditor {
  return new AnnexIComplianceAuditor();
}
