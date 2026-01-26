/**
 * ANNEX I COMPLIANCE AUDITOR
 * 
 * Non-blocking compliance auditing system that flags templates not meeting
 * full MDCG 2022-21 Annex I requirements WITHOUT failing validation.
 * 
 * This service runs AFTER permissive schema validation and generates a
 * detailed compliance report with warnings and recommendations.
 */

import { MDCG_ANNEX_I_OBLIGATIONS, type ObligationDefinition, type EvidenceType } from "../psur/mappings/mdcg2022AnnexI";
import type { Template, SlotDefinition } from "../templates/templateSchema";

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

    // Layer 1: Section Structure
    const sectionStructure = this.checkSectionStructure(template);
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
  // LAYER 1: SECTION STRUCTURE
  // ========================================================================

  private checkSectionStructure(template: Template): SectionStructureResult {
    const expectedSections = [
      { id: "COVER", pattern: /cover/i, path: "Cover" },
      { id: "TOC", pattern: /toc|table.*contents/i, path: "FrontMatter" },
      { id: "EXEC_SUMMARY", pattern: /executive.*summary/i, path: "1 > Executive Summary" },
      { id: "DEVICE_DESC", pattern: /device.*description|scope/i, path: "2 > Device Description" },
      { id: "SALES", pattern: /sales|distribution|exposure/i, path: "3 > Sales" },
      { id: "COMPLAINTS", pattern: /complaint/i, path: "4 > Complaints" },
      { id: "INCIDENTS", pattern: /incident|vigilance/i, path: "5 > Serious Incidents" },
      { id: "FSCA", pattern: /fsca|field.*safety/i, path: "6 > FSCAs" },
      { id: "CAPA", pattern: /capa|corrective/i, path: "7 > CAPAs" },
      { id: "LITERATURE", pattern: /literature/i, path: "8 > Literature" },
      { id: "PMCF", pattern: /pmcf|clinical/i, path: "9 > PMCF" },
      { id: "BENEFIT_RISK", pattern: /benefit.*risk/i, path: "10 > Benefit-Risk" },
      { id: "CONCLUSIONS", pattern: /conclusion/i, path: "11 > Conclusions" },
    ];

    const missingSections: string[] = [];
    const invalidPaths: string[] = [];
    const recommendations: string[] = [];

    for (const expected of expectedSections) {
      const found = template.slots.find(
        (slot) =>
          expected.pattern.test(slot.slot_id) ||
          expected.pattern.test(slot.title) ||
          expected.pattern.test(slot.section_path)
      );

      if (!found) {
        missingSections.push(`${expected.id}: ${expected.path}`);
        if (expected.id === "EXEC_SUMMARY" || expected.id === "CONCLUSIONS") {
          recommendations.push(
            `Add mandatory section ${expected.id} at path "${expected.path}" per MDCG 2022-21 Annex I`
          );
        }
      } else {
        // Check if section_path follows standard format
        if (!found.section_path.includes(">") && found.slot_kind !== "ADMIN") {
          invalidPaths.push(
            `Slot "${found.slot_id}" should use hierarchical path (e.g., "1 > Executive Summary")`
          );
        }
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
  // LAYER 3: REQUIRED TABLES
  // ========================================================================

  private checkRequiredTables(template: Template): RequiredTablesResult {
    const missingTables: Array<{ obligationId: string; tableId: string; slotId?: string }> = [];
    const recommendations: string[] = [];

    for (const obligation of MDCG_ANNEX_I_OBLIGATIONS) {
      if (!obligation.isMandatory) continue;

      for (const tableId of obligation.requiredTables) {
        // Check if any slot references this table
        const hasTable = template.slots.some(
          (slot) =>
            slot.slot_kind === "TABLE" &&
            (slot.slot_id.includes(tableId) ||
              slot.title.includes(tableId) ||
              (slot.output_requirements as any)?.table_id === tableId)
        );

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
  // LAYER 4: EVIDENCE TYPE MAPPING
  // ========================================================================

  private checkEvidenceTypes(template: Template): EvidenceTypesResult {
    const missingMappings: Array<{
      obligationId: string;
      slotId?: string;
      missingTypes: string[];
    }> = [];
    const recommendations: string[] = [];

    // Build map of slot -> evidence types
    const slotEvidenceMap = new Map<string, Set<string>>();
    for (const slot of template.slots) {
      const types = new Set(slot.evidence_requirements.required_types);
      slotEvidenceMap.set(slot.slot_id, types);
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
