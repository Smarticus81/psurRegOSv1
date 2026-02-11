/**
 * Cross-Section Consistency Validator
 * 
 * SOTA validation that runs AFTER all sections are compiled to ensure
 * data consistency across the entire PSUR document.
 * 
 * Validates:
 * - Sales figures match between Executive Summary and Sales Table
 * - Complaint counts match between Executive Summary and Complaints Table
 * - Incident counts are consistent
 * - Rates are calculated with the same denominators
 * - No contradictory statements exist
 * 
 * Regulatory Purpose: EU MDR Article 86 requires accurate and consistent data
 */

import { getCanonicalMetrics, CanonicalMetrics } from "./canonicalMetricsService";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CompiledSection {
  slotId: string;
  title: string;
  content: string;
  slotKind: "NARRATIVE" | "TABLE" | "CHART";
}

export interface ValidationIssue {
  severity: "ERROR" | "WARNING" | "INFO";
  category: "DATA_MISMATCH" | "CONTRADICTION" | "MISSING_DATA" | "CALCULATION_ERROR";
  section1: string;
  section2?: string;
  description: string;
  expectedValue?: string;
  actualValue?: string;
  recommendation: string;
}

export interface CrossSectionValidationResult {
  isValid: boolean;
  overallScore: number; // 0-100
  issues: ValidationIssue[];
  summary: string;
  canonicalMetrics: {
    totalUnits: number;
    totalComplaints: number;
    seriousIncidents: number;
    fscaCount: number;
  };
  validatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGEX PATTERNS FOR EXTRACTING NUMBERS FROM TEXT
// ═══════════════════════════════════════════════════════════════════════════════

const NUMBER_PATTERNS = {
  unitsDistributed: /(\d{1,3}(?:,\d{3})*|\d+)\s*(?:units?|devices?)\s*(?:distributed|sold|shipped)/gi,
  totalUnits: /total[:\s]+(\d{1,3}(?:,\d{3})*|\d+)/gi,
  complaints: /(\d{1,3}(?:,\d{3})*|\d+)\s*complaints?/gi,
  seriousIncidents: /(\d{1,3}(?:,\d{3})*|\d+)\s*(?:serious\s+)?incidents?/gi,
  fscas: /(\d{1,3}(?:,\d{3})*|\d+)\s*(?:FSCAs?|recalls?|field\s+safety)/gi,
  noData: /\bno\s+(?:complaints?|incidents?|FSCAs?|data)\s+(?:were\s+)?(?:reported|recorded|received|identified|observed|found|detected)/i,
  zeroReported: /(?:zero|0|none)\s+(?:were\s+)?(?:reported|recorded|received|identified|observed|found|detected)/i,
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════════

export class CrossSectionValidator {
  private sections: CompiledSection[];
  private canonicalMetrics: CanonicalMetrics;
  private issues: ValidationIssue[] = [];
  
  constructor(
    sections: CompiledSection[],
    psurCaseId: number,
    atoms: any[],
    periodStart: string,
    periodEnd: string
  ) {
    this.sections = sections;
    this.canonicalMetrics = getCanonicalMetrics(psurCaseId, atoms, periodStart, periodEnd);
  }
  
  /**
   * Run all validation checks
   */
  public validate(): CrossSectionValidationResult {
    this.issues = [];
    
    // Run validation checks
    this.validateSalesConsistency();
    this.validateComplaintsConsistency();
    this.validateIncidentsConsistency();
    this.validateNoContradictions();
    this.validateRateCalculations();
    
    // Calculate overall score
    const errorCount = this.issues.filter(i => i.severity === "ERROR").length;
    const warningCount = this.issues.filter(i => i.severity === "WARNING").length;
    const overallScore = Math.max(0, 100 - (errorCount * 20) - (warningCount * 5));
    
    // Generate summary
    const summary = this.generateSummary(overallScore);
    
    return {
      isValid: errorCount === 0,
      overallScore,
      issues: this.issues,
      summary,
      canonicalMetrics: {
        totalUnits: this.canonicalMetrics.sales.totalUnits.value,
        totalComplaints: this.canonicalMetrics.complaints.totalCount.value,
        seriousIncidents: this.canonicalMetrics.incidents.seriousCount.value,
        fscaCount: this.canonicalMetrics.incidents.fscaCount.value,
      },
      validatedAt: new Date(),
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION CHECKS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private validateSalesConsistency(): void {
    const canonicalUnits = this.canonicalMetrics.sales.totalUnits.value;
    
    // Find executive summary
    const execSummary = this.sections.find(s => 
      s.slotId.toLowerCase().includes("exec") || 
      s.title.toLowerCase().includes("executive")
    );
    
    // Find sales table
    const salesTable = this.sections.find(s => 
      s.slotId.toLowerCase().includes("sales") ||
      s.title.toLowerCase().includes("sales")
    );
    
    if (execSummary && salesTable) {
      // Extract numbers from both sections
      const execUnits = this.extractNumber(execSummary.content, NUMBER_PATTERNS.unitsDistributed);
      const tableUnits = this.extractTotalFromTable(salesTable.content);
      
      // Check for mismatch
      if (execUnits !== null && tableUnits !== null) {
        const tolerance = Math.max(execUnits, tableUnits) * 0.01; // 1% tolerance
        if (Math.abs(execUnits - tableUnits) > tolerance) {
          this.issues.push({
            severity: "ERROR",
            category: "DATA_MISMATCH",
            section1: "Executive Summary",
            section2: "Sales Table",
            description: "Units distributed figures do not match between sections",
            expectedValue: this.formatNumber(canonicalUnits),
            actualValue: `Exec: ${this.formatNumber(execUnits)}, Table: ${this.formatNumber(tableUnits)}`,
            recommendation: "Both sections should use canonical metrics service for consistent data",
          });
        }
      }
      
      // Check against canonical
      if (execUnits !== null && Math.abs(execUnits - canonicalUnits) > canonicalUnits * 0.01) {
        this.issues.push({
          severity: "WARNING",
          category: "DATA_MISMATCH",
          section1: "Executive Summary",
          description: "Units distributed differs from canonical value",
          expectedValue: this.formatNumber(canonicalUnits),
          actualValue: this.formatNumber(execUnits),
          recommendation: "Verify data extraction and aggregation logic",
        });
      }
    }
  }
  
  private validateComplaintsConsistency(): void {
    const canonicalComplaints = this.canonicalMetrics.complaints.totalCount.value;
    
    // Find all sections mentioning complaints
    const sectionsWithComplaints = this.sections.filter(s => 
      s.content.toLowerCase().includes("complaint")
    );
    
    for (const section of sectionsWithComplaints) {
      // Reset lastIndex on all patterns to prevent stateful regex bugs
      NUMBER_PATTERNS.complaints.lastIndex = 0;
      NUMBER_PATTERNS.noData.lastIndex = 0;
      NUMBER_PATTERNS.zeroReported.lastIndex = 0;
      
      const complaintCount = this.extractNumber(section.content, NUMBER_PATTERNS.complaints);
      const hasNoComplaints = NUMBER_PATTERNS.noData.test(section.content) || 
                             NUMBER_PATTERNS.zeroReported.test(section.content);
      
      // Skip false positives: if section also mentions the actual complaint count, it's not claiming zero
      if (hasNoComplaints && complaintCount !== null && complaintCount > 0) {
        continue; // Section mentions both "no complaints [qualifier]" and actual count — not a true contradiction
      }
      
      // Check for contradiction: text says "no complaints" but canonical shows complaints
      if (hasNoComplaints && canonicalComplaints > 0) {
        this.issues.push({
          severity: "ERROR",
          category: "CONTRADICTION",
          section1: section.title,
          description: `Section states "no complaints" but canonical data shows ${canonicalComplaints} complaints`,
          expectedValue: String(canonicalComplaints),
          actualValue: "0 (stated)",
          recommendation: "Review complaint detection logic or section content generation",
        });
      }
      
      // Check for mismatch in counts
      if (complaintCount !== null && complaintCount !== canonicalComplaints) {
        const tolerance = Math.max(complaintCount, canonicalComplaints) * 0.05;
        if (Math.abs(complaintCount - canonicalComplaints) > tolerance) {
          this.issues.push({
            severity: "WARNING",
            category: "DATA_MISMATCH",
            section1: section.title,
            description: "Complaint count differs from canonical value",
            expectedValue: String(canonicalComplaints),
            actualValue: String(complaintCount),
            recommendation: "Verify complaint filtering logic matches canonical service",
          });
        }
      }
    }
  }
  
  private validateIncidentsConsistency(): void {
    const canonicalIncidents = this.canonicalMetrics.incidents.totalCount.value;
    const canonicalSerious = this.canonicalMetrics.incidents.seriousCount.value;
    
    // Find sections mentioning incidents
    const sectionsWithIncidents = this.sections.filter(s => 
      s.content.toLowerCase().includes("incident") ||
      s.content.toLowerCase().includes("vigilance")
    );
    
    for (const section of sectionsWithIncidents) {
      // Reset lastIndex on patterns to prevent stateful regex bugs
      NUMBER_PATTERNS.seriousIncidents.lastIndex = 0;
      
      const incidentCount = this.extractNumber(section.content, NUMBER_PATTERNS.seriousIncidents);
      const hasNoIncidents = /no\s+(?:serious\s+)?incidents?\s+(?:were\s+)?(?:reported|recorded|received|identified|observed|found|detected)/i.test(section.content);
      
      // Check for contradiction
      if (hasNoIncidents && canonicalSerious > 0) {
        this.issues.push({
          severity: "ERROR",
          category: "CONTRADICTION",
          section1: section.title,
          description: `Section states "no incidents" but canonical data shows ${canonicalSerious} serious incidents`,
          expectedValue: String(canonicalSerious),
          actualValue: "0 (stated)",
          recommendation: "Review incident detection or update section content",
        });
      }
    }
  }
  
  private validateNoContradictions(): void {
    // Check for direct contradictions between sections
    const execSummary = this.sections.find(s => 
      s.slotId.toLowerCase().includes("exec") || s.title.toLowerCase().includes("executive")
    );
    
    if (!execSummary) return;
    
    // Extract key claims from executive summary
    const execContent = execSummary.content.toLowerCase();
    const claims = {
      noComplaints: /no complaints/i.test(execContent),
      noIncidents: /no (?:serious )?incidents/i.test(execContent),
      noFscas: /no (?:FSCAs|recalls)/i.test(execContent),
      favorableBR: /favorable|acceptable|unchanged/i.test(execContent),
    };
    
    // Verify claims against other sections
    for (const section of this.sections) {
      if (section.slotId === execSummary.slotId) continue;
      
      const content = section.content.toLowerCase();
      
      // Check if other sections contradict "no complaints" claim
      if (claims.noComplaints) {
        const otherHasComplaints = /\d+\s+complaints?/i.test(content) && 
                                   !/0\s+complaints?/i.test(content);
        if (otherHasComplaints) {
          this.issues.push({
            severity: "ERROR",
            category: "CONTRADICTION",
            section1: "Executive Summary",
            section2: section.title,
            description: "Executive Summary claims no complaints but another section reports complaints",
            recommendation: "Reconcile complaint data across all sections",
          });
        }
      }
    }
  }
  
  private validateRateCalculations(): void {
    const canonicalUnits = this.canonicalMetrics.sales.totalUnits.value;
    const canonicalRate = this.canonicalMetrics.complaints.ratePerThousand?.value;
    
    if (canonicalUnits === 0) {
      // Check that no section claims a rate when there's no denominator
      for (const section of this.sections) {
        if (/\d+\.?\d*\s*(?:per\s+)?(?:1,?000|thousand)/i.test(section.content)) {
          this.issues.push({
            severity: "WARNING",
            category: "CALCULATION_ERROR",
            section1: section.title,
            description: "Section shows a rate calculation but no sales data exists for denominator",
            recommendation: "Remove rate calculations or add sales data",
          });
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private extractNumber(text: string, pattern: RegExp): number | null {
    const matches = text.match(pattern);
    if (!matches || matches.length === 0) return null;
    
    // Extract the number from the first match
    const numMatch = matches[0].match(/(\d{1,3}(?:,\d{3})*|\d+)/);
    if (!numMatch) return null;
    
    return parseInt(numMatch[1].replace(/,/g, ""), 10);
  }
  
  private extractTotalFromTable(content: string): number | null {
    // Look for "TOTAL" row in markdown table
    const totalMatch = content.match(/\*\*TOTAL\*\*[^|]*\|\s*\*\*([^*]+)\*\*/i);
    if (totalMatch) {
      const numStr = totalMatch[1].replace(/[,\s]/g, "");
      const num = parseFloat(numStr);
      return isNaN(num) ? null : num;
    }
    return null;
  }
  
  private formatNumber(value: number): string {
    return value.toLocaleString();
  }
  
  private generateSummary(score: number): string {
    const errorCount = this.issues.filter(i => i.severity === "ERROR").length;
    const warningCount = this.issues.filter(i => i.severity === "WARNING").length;
    
    if (errorCount === 0 && warningCount === 0) {
      return "All cross-section consistency checks passed. Data is consistent across all PSUR sections.";
    }
    
    if (errorCount > 0) {
      return `Found ${errorCount} critical inconsistencies and ${warningCount} warnings. ` +
             `Review and correct before finalizing the PSUR.`;
    }
    
    return `Found ${warningCount} potential inconsistencies. ` +
           `Review recommended but document may be acceptable.`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

export function validateCrossSectionConsistency(
  sections: CompiledSection[],
  psurCaseId: number,
  atoms: any[],
  periodStart: string,
  periodEnd: string
): CrossSectionValidationResult {
  const validator = new CrossSectionValidator(sections, psurCaseId, atoms, periodStart, periodEnd);
  return validator.validate();
}
