/**
 * PSUR QUALITY GATE
 * 
 * Strict validation gate that produces PASS or FAIL only.
 * NO WARNINGS - only binary pass/fail decisions.
 * 
 * The gate FAILS if:
 * - Any Annex I obligation is unmet
 * - Any required table is missing
 * - Any rate calculation lacks denominator
 * - Any paragraph lacks trace (when required)
 * - Any template overrides kernel logic
 * 
 * Per MDCG 2022-21 and EU MDR Article 86
 */

import type {
  PSURDocument,
  PSURSection,
  PSURTable,
  PSURParagraph,
  PSURSectionId,
  TableId,
} from "../psurContract";
import {
  CORE_SECTIONS,
  REQUIRED_TABLES,
  SECTION_TITLES,
  validateSectionStructure,
} from "../psurContract";
import {
  MDCG_ANNEX_I_OBLIGATIONS,
  getMandatoryObligations,
  getObligationsBySection,
  validateObligationCoverage,
  SECTION_OBLIGATION_MAP,
  type ObligationId,
} from "../mappings/mdcg2022AnnexI";

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface QualityGateResult {
  passed: boolean;
  timestamp: string;
  validatorVersion: string;
  
  // Failure details (only if passed = false)
  failures: QualityGateFailure[];
  
  // Summary
  summary: QualityGateSummary;
  
  // For audit trail
  checksPerformed: QualityCheckResult[];
}

export interface QualityGateFailure {
  failureId: string;
  category: FailureCategory;
  severity: "CRITICAL"; // Only CRITICAL - no warnings
  message: string;
  details: string;
  remediation: string;
  affectedSection?: PSURSectionId;
  affectedObligation?: ObligationId;
}

export type FailureCategory =
  | "OBLIGATION_UNMET"
  | "TABLE_MISSING"
  | "RATE_NO_DENOMINATOR"
  | "PARAGRAPH_NO_TRACE"
  | "TEMPLATE_OVERRIDE_VIOLATION"
  | "CORE_SECTION_MISSING"
  | "EVIDENCE_NOT_LINKED"
  | "CALCULATION_ERROR"
  | "STRUCTURAL_VIOLATION";

export interface QualityGateSummary {
  totalChecks: number;
  checksPassed: number;
  checksFailed: number;
  obligationsCovered: number;
  obligationsTotal: number;
  tablesPresent: number;
  tablesRequired: number;
  sectionsPresent: number;
  sectionsRequired: number;
}

export interface QualityCheckResult {
  checkId: string;
  checkName: string;
  category: FailureCategory;
  passed: boolean;
  message: string;
  timestamp: string;
}

// ============================================================================
// QUALITY GATE IMPLEMENTATION
// ============================================================================

export function validatePsurDocument(
  document: PSURDocument,
  templateId: string
): QualityGateResult {
  const failures: QualityGateFailure[] = [];
  const checksPerformed: QualityCheckResult[] = [];
  const timestamp = new Date().toISOString();
  let failureCounter = 0;
  
  // -------------------------------------------------------------------------
  // CHECK 1: Core Sections Present
  // -------------------------------------------------------------------------
  const coreSectionCheck = validateCoreSections(document.sections);
  checksPerformed.push(...coreSectionCheck.checks);
  failures.push(...coreSectionCheck.failures.map(f => ({ ...f, failureId: `FAIL-${++failureCounter}` })));
  
  // -------------------------------------------------------------------------
  // CHECK 2: All Required Tables Present
  // -------------------------------------------------------------------------
  const tableCheck = validateRequiredTables(document.sections);
  checksPerformed.push(...tableCheck.checks);
  failures.push(...tableCheck.failures.map(f => ({ ...f, failureId: `FAIL-${++failureCounter}` })));
  
  // -------------------------------------------------------------------------
  // CHECK 3: All Mandatory Obligations Met
  // -------------------------------------------------------------------------
  const obligationCheck = validateObligations(document.sections);
  checksPerformed.push(...obligationCheck.checks);
  failures.push(...obligationCheck.failures.map(f => ({ ...f, failureId: `FAIL-${++failureCounter}` })));
  
  // -------------------------------------------------------------------------
  // CHECK 4: Rate Calculations Have Denominators
  // -------------------------------------------------------------------------
  const rateCheck = validateRateCalculations(document.sections);
  checksPerformed.push(...rateCheck.checks);
  failures.push(...rateCheck.failures.map(f => ({ ...f, failureId: `FAIL-${++failureCounter}` })));
  
  // -------------------------------------------------------------------------
  // CHECK 5: Paragraphs Have Trace References
  // -------------------------------------------------------------------------
  const traceCheck = validateParagraphTraces(document.sections);
  checksPerformed.push(...traceCheck.checks);
  failures.push(...traceCheck.failures.map(f => ({ ...f, failureId: `FAIL-${++failureCounter}` })));
  
  // -------------------------------------------------------------------------
  // CHECK 6: Template Does Not Override Kernel Logic
  // -------------------------------------------------------------------------
  const templateCheck = validateTemplateCompliance(document, templateId);
  checksPerformed.push(...templateCheck.checks);
  failures.push(...templateCheck.failures.map(f => ({ ...f, failureId: `FAIL-${++failureCounter}` })));
  
  // -------------------------------------------------------------------------
  // CHECK 7: Evidence Atoms Linked to Sections
  // -------------------------------------------------------------------------
  const evidenceCheck = validateEvidenceLinkage(document.sections);
  checksPerformed.push(...evidenceCheck.checks);
  failures.push(...evidenceCheck.failures.map(f => ({ ...f, failureId: `FAIL-${++failureCounter}` })));
  
  // -------------------------------------------------------------------------
  // CHECK 8: Structural Integrity
  // -------------------------------------------------------------------------
  const structureCheck = validateStructuralIntegrity(document);
  checksPerformed.push(...structureCheck.checks);
  failures.push(...structureCheck.failures.map(f => ({ ...f, failureId: `FAIL-${++failureCounter}` })));
  
  // -------------------------------------------------------------------------
  // COMPILE SUMMARY
  // -------------------------------------------------------------------------
  const mandatoryObligations = getMandatoryObligations();
  const coveredObligations = new Set<string>();
  for (const section of document.sections) {
    for (const oblId of section.obligationIds) {
      coveredObligations.add(oblId);
    }
  }
  
  const allRequiredTables = new Set<TableId>();
  for (const [sectionId, tables] of Object.entries(REQUIRED_TABLES)) {
    for (const table of tables) {
      allRequiredTables.add(table);
    }
  }
  
  const presentTables = new Set<TableId>();
  for (const section of document.sections) {
    if (section.tables) {
      for (const table of section.tables) {
        presentTables.add(table.tableId);
      }
    }
  }
  
  const summary: QualityGateSummary = {
    totalChecks: checksPerformed.length,
    checksPassed: checksPerformed.filter(c => c.passed).length,
    checksFailed: checksPerformed.filter(c => !c.passed).length,
    obligationsCovered: coveredObligations.size,
    obligationsTotal: mandatoryObligations.length,
    tablesPresent: presentTables.size,
    tablesRequired: allRequiredTables.size,
    sectionsPresent: document.sections.length,
    sectionsRequired: CORE_SECTIONS.length,
  };
  
  return {
    passed: failures.length === 0,
    timestamp,
    validatorVersion: "1.0.0",
    failures,
    summary,
    checksPerformed,
  };
}

// ============================================================================
// CHECK IMPLEMENTATIONS
// ============================================================================

function validateCoreSections(sections: PSURSection[]): {
  checks: QualityCheckResult[];
  failures: QualityGateFailure[];
} {
  const checks: QualityCheckResult[] = [];
  const failures: QualityGateFailure[] = [];
  const timestamp = new Date().toISOString();
  
  const presentSectionIds = new Set(sections.map(s => s.sectionId));
  
  for (const coreSection of CORE_SECTIONS) {
    const passed = presentSectionIds.has(coreSection);
    
    checks.push({
      checkId: `CORE_SECTION_${coreSection}`,
      checkName: `Core Section Present: ${SECTION_TITLES[coreSection]}`,
      category: "CORE_SECTION_MISSING",
      passed,
      message: passed
        ? `Core section ${coreSection} is present`
        : `Core section ${coreSection} is MISSING`,
      timestamp,
    });
    
    if (!passed) {
      failures.push({
        failureId: "", // Will be set by caller
        category: "CORE_SECTION_MISSING",
        severity: "CRITICAL",
        message: `Missing core section: ${SECTION_TITLES[coreSection]}`,
        details: `The PSUR contract requires section ${coreSection} (${SECTION_TITLES[coreSection]}) to be present. This section cannot be removed by templates.`,
        remediation: `Add section ${coreSection} to the PSUR document with all required content.`,
        affectedSection: coreSection,
      });
    }
  }
  
  return { checks, failures };
}

function validateRequiredTables(sections: PSURSection[]): {
  checks: QualityCheckResult[];
  failures: QualityGateFailure[];
} {
  const checks: QualityCheckResult[] = [];
  const failures: QualityGateFailure[] = [];
  const timestamp = new Date().toISOString();
  
  for (const section of sections) {
    const requiredTables = REQUIRED_TABLES[section.sectionId] || [];
    const presentTableIds = (section.tables || []).map(t => t.tableId);
    
    for (const requiredTable of requiredTables) {
      const passed = presentTableIds.includes(requiredTable);
      
      checks.push({
        checkId: `TABLE_${section.sectionId}_${requiredTable}`,
        checkName: `Required Table: ${requiredTable} in ${section.sectionId}`,
        category: "TABLE_MISSING",
        passed,
        message: passed
          ? `Table ${requiredTable} is present in ${section.sectionId}`
          : `Table ${requiredTable} is MISSING from ${section.sectionId}`,
        timestamp,
      });
      
      if (!passed) {
        failures.push({
          failureId: "",
          category: "TABLE_MISSING",
          severity: "CRITICAL",
          message: `Missing required table: ${requiredTable}`,
          details: `Section ${section.sectionId} requires table ${requiredTable} per the PSUR contract.`,
          remediation: `Generate and include table ${requiredTable} using the appropriate engine.`,
          affectedSection: section.sectionId,
        });
      }
    }
  }
  
  return { checks, failures };
}

function validateObligations(sections: PSURSection[]): {
  checks: QualityCheckResult[];
  failures: QualityGateFailure[];
} {
  const checks: QualityCheckResult[] = [];
  const failures: QualityGateFailure[] = [];
  const timestamp = new Date().toISOString();
  
  const mandatoryObligations = getMandatoryObligations();
  const coveredObligations = new Set<string>();
  
  // Collect all covered obligations from sections
  for (const section of sections) {
    for (const oblId of section.obligationIds) {
      coveredObligations.add(oblId);
    }
  }
  
  // Check each mandatory obligation
  for (const obligation of mandatoryObligations) {
    const passed = coveredObligations.has(obligation.obligationId);
    
    checks.push({
      checkId: `OBLIGATION_${obligation.obligationId}`,
      checkName: `Mandatory Obligation: ${obligation.title}`,
      category: "OBLIGATION_UNMET",
      passed,
      message: passed
        ? `Obligation ${obligation.obligationId} is satisfied`
        : `Obligation ${obligation.obligationId} is NOT satisfied`,
      timestamp,
    });
    
    if (!passed) {
      failures.push({
        failureId: "",
        category: "OBLIGATION_UNMET",
        severity: "CRITICAL",
        message: `Mandatory obligation not met: ${obligation.title}`,
        details: `${obligation.mdcgReference}: ${obligation.description}. This is a mandatory requirement per MDCG 2022-21.`,
        remediation: `Ensure section ${obligation.psurSectionId} addresses this obligation with appropriate content and evidence.`,
        affectedSection: obligation.psurSectionId,
        affectedObligation: obligation.obligationId,
      });
    }
  }
  
  return { checks, failures };
}

function validateRateCalculations(sections: PSURSection[]): {
  checks: QualityCheckResult[];
  failures: QualityGateFailure[];
} {
  const checks: QualityCheckResult[] = [];
  const failures: QualityGateFailure[] = [];
  const timestamp = new Date().toISOString();
  
  // Rate tables that require denominators
  const rateTables: TableId[] = [
    "TABLE_COMPLAINT_RATES",
    "TABLE_UCL_ANALYSIS",
    "TABLE_POPULATION_EXPOSURE",
  ];
  
  for (const section of sections) {
    if (!section.tables) continue;
    
    for (const table of section.tables) {
      if (!rateTables.includes(table.tableId)) continue;
      
      // Check if any row contains a rate without a denominator reference
      let hasDenominator = false;
      
      // Check table footnotes for formula
      if (table.calculationFormula) {
        hasDenominator = table.calculationFormula.includes("/") || 
                         table.calculationFormula.includes("units_sold") ||
                         table.calculationFormula.includes("denominator");
      }
      
      // Check rows for denominator-related content
      for (const row of table.rows) {
        for (const cell of row.cells) {
          const value = String(cell.value || "").toLowerCase();
          if (value.includes("denominator") || 
              value.includes("units sold") || 
              value.includes("per 1000") ||
              value.includes("per 1,000")) {
            hasDenominator = true;
          }
        }
      }
      
      checks.push({
        checkId: `RATE_DENOMINATOR_${table.tableId}`,
        checkName: `Rate Calculation Denominator: ${table.tableId}`,
        category: "RATE_NO_DENOMINATOR",
        passed: hasDenominator,
        message: hasDenominator
          ? `Table ${table.tableId} has denominator reference`
          : `Table ${table.tableId} LACKS denominator reference`,
        timestamp,
      });
      
      if (!hasDenominator) {
        failures.push({
          failureId: "",
          category: "RATE_NO_DENOMINATOR",
          severity: "CRITICAL",
          message: `Rate table lacks denominator: ${table.tableId}`,
          details: `Table ${table.tableId} contains rate calculations but does not specify the denominator used. All rates must be traceable to a denominator (e.g., units sold, patient exposures).`,
          remediation: `Add the denominator value and formula to the table footnotes or as a dedicated row.`,
          affectedSection: section.sectionId,
        });
      }
    }
  }
  
  return { checks, failures };
}

function validateParagraphTraces(sections: PSURSection[]): {
  checks: QualityCheckResult[];
  failures: QualityGateFailure[];
} {
  const checks: QualityCheckResult[] = [];
  const failures: QualityGateFailure[] = [];
  const timestamp = new Date().toISOString();
  
  for (const section of sections) {
    for (const paragraph of section.paragraphs) {
      // Only check paragraphs that require narrative (have content)
      if (!paragraph.isNarrativeRequired) continue;
      
      const hasTrace = paragraph.traceRef && 
                       paragraph.traceRef.evidenceAtomIds && 
                       paragraph.traceRef.evidenceAtomIds.length > 0;
      
      checks.push({
        checkId: `TRACE_${section.sectionId}_${paragraph.paragraphId}`,
        checkName: `Paragraph Trace: ${paragraph.paragraphId}`,
        category: "PARAGRAPH_NO_TRACE",
        passed: hasTrace,
        message: hasTrace
          ? `Paragraph ${paragraph.paragraphId} has trace reference`
          : `Paragraph ${paragraph.paragraphId} LACKS trace reference`,
        timestamp,
      });
      
      if (!hasTrace) {
        failures.push({
          failureId: "",
          category: "PARAGRAPH_NO_TRACE",
          severity: "CRITICAL",
          message: `Required paragraph lacks trace: ${paragraph.paragraphId}`,
          details: `Paragraph ${paragraph.paragraphId} in section ${section.sectionId} requires evidence atom traceability but has no linked atoms.`,
          remediation: `Link evidence atoms to this paragraph's traceRef.evidenceAtomIds array.`,
          affectedSection: section.sectionId,
        });
      }
    }
  }
  
  return { checks, failures };
}

function validateTemplateCompliance(document: PSURDocument, templateId: string): {
  checks: QualityCheckResult[];
  failures: QualityGateFailure[];
} {
  const checks: QualityCheckResult[] = [];
  const failures: QualityGateFailure[] = [];
  const timestamp = new Date().toISOString();
  
  // Check 1: Template cannot remove core sections
  const presentSectionIds = new Set(document.sections.map(s => s.sectionId));
  for (const coreSection of CORE_SECTIONS) {
    if (!presentSectionIds.has(coreSection)) {
      checks.push({
        checkId: `TEMPLATE_CORE_${coreSection}`,
        checkName: `Template Core Section Preservation: ${coreSection}`,
        category: "TEMPLATE_OVERRIDE_VIOLATION",
        passed: false,
        message: `Template ${templateId} appears to have removed core section ${coreSection}`,
        timestamp,
      });
      
      failures.push({
        failureId: "",
        category: "TEMPLATE_OVERRIDE_VIOLATION",
        severity: "CRITICAL",
        message: `Template illegally removes core section: ${coreSection}`,
        details: `Template ${templateId} has removed or hidden core section ${coreSection}. Templates may add sections but cannot remove or rename core sections.`,
        remediation: `Restore section ${coreSection} to the template. Templates must extend, not override, the PSUR kernel.`,
        affectedSection: coreSection,
      });
    }
  }
  
  // Check 2: Template extensions are flagged
  if (document.templateExtensions && document.templateExtensions.length > 0) {
    checks.push({
      checkId: "TEMPLATE_EXTENSIONS_DECLARED",
      checkName: "Template Extensions Declared",
      category: "TEMPLATE_OVERRIDE_VIOLATION",
      passed: true,
      message: `Template ${templateId} has ${document.templateExtensions.length} declared extension(s)`,
      timestamp,
    });
  }
  
  // Check 3: No section has overrideKernel flag (hypothetical check)
  for (const section of document.sections) {
    const hasOverride = (section as any).overrideKernel === true;
    
    if (hasOverride) {
      checks.push({
        checkId: `TEMPLATE_OVERRIDE_${section.sectionId}`,
        checkName: `Section Override Check: ${section.sectionId}`,
        category: "TEMPLATE_OVERRIDE_VIOLATION",
        passed: false,
        message: `Section ${section.sectionId} has illegal overrideKernel flag`,
        timestamp,
      });
      
      failures.push({
        failureId: "",
        category: "TEMPLATE_OVERRIDE_VIOLATION",
        severity: "CRITICAL",
        message: `Template illegally overrides kernel in section: ${section.sectionId}`,
        details: `Section ${section.sectionId} has overrideKernel=true which violates the PSUR contract.`,
        remediation: `Remove the overrideKernel flag. Templates cannot override kernel calculations or logic.`,
        affectedSection: section.sectionId,
      });
    }
  }
  
  // If no issues found, add passing check
  if (failures.length === 0) {
    checks.push({
      checkId: "TEMPLATE_COMPLIANCE_OVERALL",
      checkName: "Overall Template Compliance",
      category: "TEMPLATE_OVERRIDE_VIOLATION",
      passed: true,
      message: `Template ${templateId} complies with PSUR contract`,
      timestamp,
    });
  }
  
  return { checks, failures };
}

function validateEvidenceLinkage(sections: PSURSection[]): {
  checks: QualityCheckResult[];
  failures: QualityGateFailure[];
} {
  const checks: QualityCheckResult[] = [];
  const failures: QualityGateFailure[] = [];
  const timestamp = new Date().toISOString();
  
  // Sections that MUST have evidence linkage
  const evidenceRequiredSections: PSURSectionId[] = [
    "SECTION_C_SALES_EXPOSURE",
    "SECTION_D_COMPLAINTS",
    "SECTION_E_COMPLAINT_TRENDS",
    "SECTION_F_SERIOUS_INCIDENTS",
    "SECTION_G_FSCA",
    "SECTION_I_LITERATURE_REVIEW",
    "SECTION_K_PMCF",
  ];
  
  for (const section of sections) {
    if (!evidenceRequiredSections.includes(section.sectionId)) continue;
    
    const hasEvidence = section.traceRef.evidenceAtomIds.length > 0;
    
    checks.push({
      checkId: `EVIDENCE_LINK_${section.sectionId}`,
      checkName: `Evidence Linkage: ${section.sectionId}`,
      category: "EVIDENCE_NOT_LINKED",
      passed: hasEvidence,
      message: hasEvidence
        ? `Section ${section.sectionId} has ${section.traceRef.evidenceAtomIds.length} evidence atoms linked`
        : `Section ${section.sectionId} has NO evidence atoms linked`,
      timestamp,
    });
    
    if (!hasEvidence) {
      failures.push({
        failureId: "",
        category: "EVIDENCE_NOT_LINKED",
        severity: "CRITICAL",
        message: `Section lacks evidence linkage: ${section.sectionId}`,
        details: `Section ${section.sectionId} requires evidence atom linkage but has none. All data-driven sections must be traceable to source evidence.`,
        remediation: `Ingest evidence atoms of the appropriate type and link them to this section.`,
        affectedSection: section.sectionId,
      });
    }
  }
  
  return { checks, failures };
}

function validateStructuralIntegrity(document: PSURDocument): {
  checks: QualityCheckResult[];
  failures: QualityGateFailure[];
} {
  const checks: QualityCheckResult[] = [];
  const failures: QualityGateFailure[] = [];
  const timestamp = new Date().toISOString();
  
  // Check 1: Document has cover page
  const hasCoverPage = !!(document.coverPage && 
                       document.coverPage.psurReference && 
                       document.coverPage.deviceInfo?.deviceName);
  
  checks.push({
    checkId: "STRUCTURE_COVER_PAGE",
    checkName: "Cover Page Complete",
    category: "STRUCTURAL_VIOLATION",
    passed: hasCoverPage,
    message: hasCoverPage
      ? "Cover page is complete"
      : "Cover page is INCOMPLETE",
    timestamp,
  });
  
  if (!hasCoverPage) {
    failures.push({
      failureId: "",
      category: "STRUCTURAL_VIOLATION",
      severity: "CRITICAL",
      message: "Cover page incomplete",
      details: "The PSUR cover page must include PSUR reference and device name at minimum.",
      remediation: "Populate all required cover page fields.",
    });
  }
  
  // Check 2: Document has conclusions
  const hasConclusions = !!(document.conclusions && 
                         document.conclusions.overallConclusion &&
                         document.conclusions.benefitRiskStatement);
  
  checks.push({
    checkId: "STRUCTURE_CONCLUSIONS",
    checkName: "Conclusions Complete",
    category: "STRUCTURAL_VIOLATION",
    passed: hasConclusions,
    message: hasConclusions
      ? "Conclusions section is complete"
      : "Conclusions section is INCOMPLETE",
    timestamp,
  });
  
  if (!hasConclusions) {
    failures.push({
      failureId: "",
      category: "STRUCTURAL_VIOLATION",
      severity: "CRITICAL",
      message: "Conclusions incomplete",
      details: "The PSUR must include overall conclusion and benefit-risk statement.",
      remediation: "Generate conclusions using the appropriate engines.",
    });
  }
  
  // Check 3: Document has signoff
  const hasSignoff = !!(document.signoff && 
                     document.signoff.preparer &&
                     document.signoff.finalApprover);
  
  checks.push({
    checkId: "STRUCTURE_SIGNOFF",
    checkName: "Signoff Section Present",
    category: "STRUCTURAL_VIOLATION",
    passed: hasSignoff,
    message: hasSignoff
      ? "Signoff section is present"
      : "Signoff section is MISSING",
    timestamp,
  });
  
  if (!hasSignoff) {
    failures.push({
      failureId: "",
      category: "STRUCTURAL_VIOLATION",
      severity: "CRITICAL",
      message: "Signoff section missing",
      details: "The PSUR must include preparer and final approver signoff blocks.",
      remediation: "Add signoff metadata to the document.",
    });
  }
  
  // Check 4: Schema version is valid
  const validSchemaVersion = document.schemaVersion === "1.0.0";
  
  checks.push({
    checkId: "STRUCTURE_SCHEMA_VERSION",
    checkName: "Schema Version Valid",
    category: "STRUCTURAL_VIOLATION",
    passed: validSchemaVersion,
    message: validSchemaVersion
      ? `Schema version ${document.schemaVersion} is valid`
      : `Schema version ${document.schemaVersion} is INVALID`,
    timestamp,
  });
  
  if (!validSchemaVersion) {
    failures.push({
      failureId: "",
      category: "STRUCTURAL_VIOLATION",
      severity: "CRITICAL",
      message: "Invalid schema version",
      details: `Document schema version ${document.schemaVersion} is not supported. Expected: 1.0.0`,
      remediation: "Regenerate document using current PSUR contract version.",
    });
  }
  
  return { checks, failures };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getQualityGateSummaryText(result: QualityGateResult): string {
  if (result.passed) {
    return `QUALITY GATE: PASSED\n` +
           `${result.summary.checksPassed}/${result.summary.totalChecks} checks passed\n` +
           `${result.summary.obligationsCovered}/${result.summary.obligationsTotal} obligations covered\n` +
           `${result.summary.tablesPresent}/${result.summary.tablesRequired} tables present`;
  } else {
    return `QUALITY GATE: FAILED\n` +
           `${result.failures.length} critical failure(s) detected\n` +
           `${result.summary.checksPassed}/${result.summary.totalChecks} checks passed\n` +
           `Failures:\n` +
           result.failures.map(f => `  - ${f.message}`).join("\n");
  }
}

export function isQualityGatePassed(result: QualityGateResult): boolean {
  return result.passed;
}
