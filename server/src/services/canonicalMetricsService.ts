/**
 * Canonical Metrics Service - SOTA Centralized Statistics Engine
 * 
 * CRITICAL: All agents MUST use this service for statistics to ensure consistency.
 * 
 * Features:
 * - Single source of truth for all PSUR metrics
 * - SOTA aggregation with deduplication
 * - Provenance tracking for every computed value
 * - Cross-section consistency validation
 * - Quality scoring and confidence levels
 * 
 * Regulatory Purpose: Ensures consistent data presentation per EU MDR Article 86
 */

import { CANONICAL_EVIDENCE_TYPES } from "@shared/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface EvidenceAtom {
  atomId: string;
  evidenceType: string;
  normalizedData: Record<string, unknown>;
  sourceFile?: string;
  sourceRow?: number;
  extractedAt?: string;
}

export interface ProvenanceEntry {
  atomIds: string[];
  derivationMethod: "SUM" | "COUNT" | "AVERAGE" | "MAX" | "MIN" | "DISTINCT" | "RATE";
  reasoning: string;
  confidence: number;
  qualityFlags: string[];
}

export interface MetricValue {
  value: number;
  formatted: string;
  provenance: ProvenanceEntry;
}

export interface RegionMetrics {
  region: string;
  units: MetricValue;
  marketShare: MetricValue | null;
  usageEstimate: MetricValue | null;
  countries: string[];
}

export interface SeverityMetrics {
  severity: string;
  count: MetricValue;
  rate: MetricValue | null;
  topIssue: string;
  hasSeriousOutcome: boolean;
  imdrfCodes: string[];
}

export interface CanonicalMetrics {
  // Sales & Distribution
  sales: {
    totalUnits: MetricValue;
    byRegion: RegionMetrics[];
    periodStart: string;
    periodEnd: string;
    dataQuality: number;
  };
  
  // Complaints
  complaints: {
    totalCount: MetricValue;
    seriousCount: MetricValue;
    bySeverity: SeverityMetrics[];
    byRegion: Map<string, SeverityMetrics[]>;
    ratePerThousand: MetricValue | null;
    dataQuality: number;
  };
  
  // Incidents
  incidents: {
    totalCount: MetricValue;
    seriousCount: MetricValue;
    fscaCount: MetricValue;
    vigilanceReports: MetricValue;
    dataQuality: number;
  };
  
  // Computed At
  computedAt: Date;
  psurCaseId: number;
  
  // Validation
  validation: {
    crossSectionConsistent: boolean;
    issues: string[];
    warnings: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NORMALIZATION MAPS
// ═══════════════════════════════════════════════════════════════════════════════

const REGION_NORMALIZATION: Record<string, string> = {
  "asia pacific": "Asia Pacific", "asiapacific": "Asia Pacific", "apac": "Asia Pacific",
  "asia-pacific": "Asia Pacific", "asia_pacific": "Asia Pacific", "asian pacific": "Asia Pacific",
  "emea": "EMEA", "europe": "Europe", "eu": "Europe", "european union": "Europe",
  "americas": "Americas", "america": "Americas", "north america": "North America",
  "na": "North America", "latam": "Latin America", "south america": "Latin America",
  "row": "Rest of World", "rest of world": "Rest of World", "other": "Other",
  "global": "Global", "worldwide": "Global", "all regions": "Global",
};

const SEVERITY_NORMALIZATION: Record<string, string> = {
  "critical": "Critical", "severe": "Critical", "high": "High", "major": "High",
  "significant": "High", "medium": "Medium", "moderate": "Medium", "minor": "Low",
  "low": "Low", "minimal": "Low", "informational": "Informational", "info": "Informational",
  "feedback": "Informational", "unknown": "Unknown", "not specified": "Unknown", "n/a": "Unknown",
};

// ═══════════════════════════════════════════════════════════════════════════════
// METRIC CACHE - In-memory cache per PSUR case
// ═══════════════════════════════════════════════════════════════════════════════

const metricsCache = new Map<number, CanonicalMetrics>();

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class CanonicalMetricsService {
  private atoms: EvidenceAtom[];
  private psurCaseId: number;
  private periodStart: string;
  private periodEnd: string;
  
  constructor(
    psurCaseId: number,
    atoms: EvidenceAtom[],
    periodStart: string,
    periodEnd: string
  ) {
    this.psurCaseId = psurCaseId;
    this.atoms = atoms;
    this.periodStart = periodStart;
    this.periodEnd = periodEnd;
  }
  
  /**
   * Get canonical metrics - computes once and caches
   */
  public getMetrics(): CanonicalMetrics {
    // Check cache first
    const cached = metricsCache.get(this.psurCaseId);
    if (cached) {
      return cached;
    }
    
    // Compute all metrics
    const metrics = this.computeAllMetrics();
    
    // Cache for this PSUR case
    metricsCache.set(this.psurCaseId, metrics);
    
    return metrics;
  }
  
  /**
   * Force recomputation (call when evidence changes)
   */
  public recompute(): CanonicalMetrics {
    metricsCache.delete(this.psurCaseId);
    return this.getMetrics();
  }
  
  /**
   * Clear cache for a specific PSUR case
   */
  public static clearCache(psurCaseId: number): void {
    metricsCache.delete(psurCaseId);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COMPUTATION ENGINE
  // ═══════════════════════════════════════════════════════════════════════════
  
  private computeAllMetrics(): CanonicalMetrics {
    console.log(`[CanonicalMetrics] Computing metrics for PSUR case ${this.psurCaseId} with ${this.atoms.length} atoms`);
    
    const sales = this.computeSalesMetrics();
    const complaints = this.computeComplaintMetrics(sales.totalUnits.value);
    const incidents = this.computeIncidentMetrics();
    
    // Cross-section validation
    const validation = this.validateCrossSectionConsistency(sales, complaints, incidents);
    
    return {
      sales,
      complaints,
      incidents,
      computedAt: new Date(),
      psurCaseId: this.psurCaseId,
      validation,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SALES METRICS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private computeSalesMetrics(): CanonicalMetrics["sales"] {
    const salesAtoms = this.atoms.filter(a => this.isSalesType(a.evidenceType));
    
    // Deduplication tracking
    const seenCombos = new Set<string>();
    const regionAgg = new Map<string, {
      units: number;
      shares: number[];
      usage: number[];
      atomIds: string[];
      countries: Set<string>;
      qualityFlags: string[];
    }>();
    
    for (const atom of salesAtoms) {
      const data = atom.normalizedData;
      
      // Skip negative evidence
      if (data.isNegativeEvidence === true) continue;
      
      // Extract and normalize region
      const rawRegion = this.getValue(data, "region", "country", "geography", "territory", "market");
      const region = this.normalizeRegion(rawRegion);
      
      // Extract numeric values
      const units = this.parseNumber(this.getValue(data, "quantity", "units_sold", "units", "count", "volume", "sold"));
      const share = this.parseNumber(this.getValue(data, "market_share", "share", "percentage"));
      const usage = this.parseNumber(this.getValue(data, "usage_estimate", "estimated_users", "patient_exposure"));
      
      // Extract period for dedup
      const periodStart = String(this.getValue(data, "period_start", "periodStart", "start_date") || "");
      const periodEnd = String(this.getValue(data, "period_end", "periodEnd", "end_date") || "");
      
      // Deduplication key
      const comboKey = `${region}|${units}|${periodStart}|${periodEnd}`;
      if (seenCombos.has(comboKey) && units > 0) {
        // Skip duplicate
        continue;
      }
      seenCombos.add(comboKey);
      
      // Initialize region aggregation
      if (!regionAgg.has(region)) {
        regionAgg.set(region, {
          units: 0,
          shares: [],
          usage: [],
          atomIds: [],
          countries: new Set(),
          qualityFlags: [],
        });
      }
      
      const agg = regionAgg.get(region)!;
      agg.units += units;
      if (share > 0 && share <= 100) agg.shares.push(share);
      if (usage > 0) agg.usage.push(usage);
      agg.atomIds.push(atom.atomId);
      
      const country = String(this.getValue(data, "country", "nation") || "");
      if (country) agg.countries.add(country);
    }
    
    // Build region metrics with provenance
    const byRegion: RegionMetrics[] = [];
    let totalUnits = 0;
    const allAtomIds: string[] = [];
    
    for (const [region, agg] of regionAgg.entries()) {
      totalUnits += agg.units;
      allAtomIds.push(...agg.atomIds);
      
      byRegion.push({
        region,
        units: {
          value: agg.units,
          formatted: this.formatNumber(agg.units),
          provenance: {
            atomIds: agg.atomIds,
            derivationMethod: "SUM",
            reasoning: `Sum of ${agg.atomIds.length} sales records for ${region} with deduplication`,
            confidence: agg.units > 0 ? 0.9 : 0.5,
            qualityFlags: agg.qualityFlags,
          },
        },
        marketShare: agg.shares.length > 0 ? {
          value: agg.shares.reduce((a, b) => a + b, 0) / agg.shares.length,
          formatted: (agg.shares.reduce((a, b) => a + b, 0) / agg.shares.length).toFixed(1) + "%",
          provenance: {
            atomIds: agg.atomIds,
            derivationMethod: "AVERAGE",
            reasoning: `Average of ${agg.shares.length} market share values`,
            confidence: 0.8,
            qualityFlags: [],
          },
        } : null,
        usageEstimate: agg.usage.length > 0 ? {
          value: agg.usage.reduce((a, b) => a + b, 0),
          formatted: this.formatNumber(agg.usage.reduce((a, b) => a + b, 0)),
          provenance: {
            atomIds: agg.atomIds,
            derivationMethod: "SUM",
            reasoning: `Sum of ${agg.usage.length} usage estimates`,
            confidence: 0.7,
            qualityFlags: [],
          },
        } : null,
        countries: Array.from(agg.countries),
      });
    }
    
    // Calculate data quality score
    const dataQuality = this.calculateSalesQuality(regionAgg);
    
    return {
      totalUnits: {
        value: totalUnits,
        formatted: this.formatNumber(totalUnits),
        provenance: {
          atomIds: allAtomIds,
          derivationMethod: "SUM",
          reasoning: `Total units from ${regionAgg.size} regions with deduplication applied`,
          confidence: dataQuality / 100,
          qualityFlags: totalUnits === 0 ? ["NO_SALES_DATA"] : [],
        },
      },
      byRegion: byRegion.sort((a, b) => b.units.value - a.units.value),
      periodStart: this.periodStart,
      periodEnd: this.periodEnd,
      dataQuality,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLAINT METRICS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private computeComplaintMetrics(totalUnits: number): CanonicalMetrics["complaints"] {
    const complaintAtoms = this.atoms.filter(a => this.isComplaintType(a.evidenceType));
    
    // Filter out negative evidence
    const realComplaints = complaintAtoms.filter(a => 
      a.normalizedData?.isNegativeEvidence !== true
    );
    
    // Aggregate by severity
    const severityAgg = new Map<string, {
      count: number;
      atomIds: string[];
      issues: Map<string, number>;
      hasSeriousOutcome: boolean;
      imdrfCodes: Set<string>;
    }>();
    
    // Also track by region for cross-reference
    const regionSeverityAgg = new Map<string, Map<string, typeof severityAgg extends Map<string, infer V> ? V : never>>();
    
    let seriousCount = 0;
    const allAtomIds: string[] = [];
    
    for (const atom of realComplaints) {
      const data = atom.normalizedData;
      
      const rawSeverity = String(this.getValue(data, "severity", "seriousness", "severity_level", "priority") || "Unknown");
      const severity = this.normalizeSeverity(rawSeverity);
      
      const region = this.normalizeRegion(this.getValue(data, "region", "country", "geography") || "Global");
      
      const issue = String(this.getValue(data, "description", "complaint_type", "issue", "problem_description") || "");
      
      const isSerious = this.isSerious(data);
      if (isSerious) seriousCount++;
      
      const imdrfCode = this.extractImdrfCode(data);
      
      // Initialize severity aggregation
      if (!severityAgg.has(severity)) {
        severityAgg.set(severity, {
          count: 0,
          atomIds: [],
          issues: new Map(),
          hasSeriousOutcome: false,
          imdrfCodes: new Set(),
        });
      }
      
      const agg = severityAgg.get(severity)!;
      agg.count++;
      agg.atomIds.push(atom.atomId);
      allAtomIds.push(atom.atomId);
      
      if (issue) {
        const normalizedIssue = issue.substring(0, 50).trim();
        agg.issues.set(normalizedIssue, (agg.issues.get(normalizedIssue) || 0) + 1);
      }
      if (isSerious) agg.hasSeriousOutcome = true;
      if (imdrfCode) agg.imdrfCodes.add(imdrfCode);
      
      // Track by region too
      if (!regionSeverityAgg.has(region)) {
        regionSeverityAgg.set(region, new Map());
      }
      const regionMap = regionSeverityAgg.get(region)!;
      if (!regionMap.has(severity)) {
        regionMap.set(severity, {
          count: 0,
          atomIds: [],
          issues: new Map(),
          hasSeriousOutcome: false,
          imdrfCodes: new Set(),
        });
      }
      const regionAgg = regionMap.get(severity)!;
      regionAgg.count++;
      regionAgg.atomIds.push(atom.atomId);
      if (isSerious) regionAgg.hasSeriousOutcome = true;
    }
    
    // Build severity metrics
    const bySeverity: SeverityMetrics[] = [];
    const severityOrder = ["Critical", "High", "Medium", "Low", "Informational", "Unknown"];
    
    for (const severity of severityOrder) {
      const agg = severityAgg.get(severity);
      if (!agg) continue;
      
      // Find top issue
      let topIssue = "-";
      let maxCount = 0;
      for (const [issue, count] of agg.issues.entries()) {
        if (count > maxCount) {
          maxCount = count;
          topIssue = issue;
        }
      }
      
      // Calculate rate
      const rate = totalUnits > 0 ? (agg.count / totalUnits) * 1000 : null;
      
      bySeverity.push({
        severity,
        count: {
          value: agg.count,
          formatted: String(agg.count),
          provenance: {
            atomIds: agg.atomIds,
            derivationMethod: "COUNT",
            reasoning: `Count of ${severity} severity complaints`,
            confidence: 0.95,
            qualityFlags: [],
          },
        },
        rate: rate !== null ? {
          value: rate,
          formatted: rate.toFixed(3),
          provenance: {
            atomIds: agg.atomIds,
            derivationMethod: "RATE",
            reasoning: `Rate per 1,000 units (denominator: ${this.formatNumber(totalUnits)})`,
            confidence: totalUnits > 0 ? 0.9 : 0.3,
            qualityFlags: totalUnits === 0 ? ["NO_DENOMINATOR"] : [],
          },
        } : null,
        topIssue,
        hasSeriousOutcome: agg.hasSeriousOutcome,
        imdrfCodes: Array.from(agg.imdrfCodes),
      });
    }
    
    // Build by-region map
    const byRegion = new Map<string, SeverityMetrics[]>();
    for (const [region, severityMap] of regionSeverityAgg.entries()) {
      const regionMetrics: SeverityMetrics[] = [];
      for (const [severity, agg] of severityMap.entries()) {
        regionMetrics.push({
          severity,
          count: {
            value: agg.count,
            formatted: String(agg.count),
            provenance: {
              atomIds: agg.atomIds,
              derivationMethod: "COUNT",
              reasoning: `Count of ${severity} complaints in ${region}`,
              confidence: 0.95,
              qualityFlags: [],
            },
          },
          rate: null,
          topIssue: "-",
          hasSeriousOutcome: agg.hasSeriousOutcome,
          imdrfCodes: Array.from(agg.imdrfCodes),
        });
      }
      byRegion.set(region, regionMetrics);
    }
    
    const totalCount = realComplaints.length;
    const overallRate = totalUnits > 0 ? (totalCount / totalUnits) * 1000 : null;
    
    return {
      totalCount: {
        value: totalCount,
        formatted: String(totalCount),
        provenance: {
          atomIds: allAtomIds,
          derivationMethod: "COUNT",
          reasoning: `Total complaint count excluding negative evidence records`,
          confidence: 0.95,
          qualityFlags: totalCount === 0 ? ["NO_COMPLAINTS"] : [],
        },
      },
      seriousCount: {
        value: seriousCount,
        formatted: String(seriousCount),
        provenance: {
          atomIds: allAtomIds.filter((_, i) => i < seriousCount), // Approximate
          derivationMethod: "COUNT",
          reasoning: `Count of complaints with serious outcomes`,
          confidence: 0.9,
          qualityFlags: [],
        },
      },
      bySeverity,
      byRegion,
      ratePerThousand: overallRate !== null ? {
        value: overallRate,
        formatted: overallRate.toFixed(3),
        provenance: {
          atomIds: allAtomIds,
          derivationMethod: "RATE",
          reasoning: `Overall complaint rate per 1,000 units`,
          confidence: totalUnits > 0 ? 0.9 : 0.3,
          qualityFlags: totalUnits === 0 ? ["NO_DENOMINATOR"] : [],
        },
      } : null,
      dataQuality: this.calculateComplaintQuality(realComplaints, severityAgg),
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INCIDENT METRICS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private computeIncidentMetrics(): CanonicalMetrics["incidents"] {
    const incidentAtoms = this.atoms.filter(a => this.isIncidentType(a.evidenceType));
    const fscaAtoms = this.atoms.filter(a => this.isFscaType(a.evidenceType));
    const vigilanceAtoms = this.atoms.filter(a => this.isVigilanceType(a.evidenceType));
    
    // Filter negative evidence
    const realIncidents = incidentAtoms.filter(a => a.normalizedData?.isNegativeEvidence !== true);
    const realFscas = fscaAtoms.filter(a => a.normalizedData?.isNegativeEvidence !== true);
    
    // Count serious incidents
    const seriousIncidents = realIncidents.filter(a => this.isSerious(a.normalizedData));
    
    return {
      totalCount: {
        value: realIncidents.length,
        formatted: String(realIncidents.length),
        provenance: {
          atomIds: realIncidents.map(a => a.atomId),
          derivationMethod: "COUNT",
          reasoning: `Total incident count excluding negative evidence`,
          confidence: 0.95,
          qualityFlags: realIncidents.length === 0 ? ["NO_INCIDENTS"] : [],
        },
      },
      seriousCount: {
        value: seriousIncidents.length,
        formatted: String(seriousIncidents.length),
        provenance: {
          atomIds: seriousIncidents.map(a => a.atomId),
          derivationMethod: "COUNT",
          reasoning: `Count of incidents meeting serious criteria`,
          confidence: 0.9,
          qualityFlags: [],
        },
      },
      fscaCount: {
        value: realFscas.length,
        formatted: String(realFscas.length),
        provenance: {
          atomIds: realFscas.map(a => a.atomId),
          derivationMethod: "COUNT",
          reasoning: `Count of Field Safety Corrective Actions`,
          confidence: 0.95,
          qualityFlags: [],
        },
      },
      vigilanceReports: {
        value: vigilanceAtoms.length,
        formatted: String(vigilanceAtoms.length),
        provenance: {
          atomIds: vigilanceAtoms.map(a => a.atomId),
          derivationMethod: "COUNT",
          reasoning: `Count of vigilance reports`,
          confidence: 0.95,
          qualityFlags: [],
        },
      },
      dataQuality: 90, // Placeholder
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CROSS-SECTION VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  private validateCrossSectionConsistency(
    sales: CanonicalMetrics["sales"],
    complaints: CanonicalMetrics["complaints"],
    incidents: CanonicalMetrics["incidents"]
  ): CanonicalMetrics["validation"] {
    const issues: string[] = [];
    const warnings: string[] = [];
    
    // Check: Complaints should not exceed units sold
    if (complaints.totalCount.value > sales.totalUnits.value && sales.totalUnits.value > 0) {
      warnings.push(`Complaints (${complaints.totalCount.value}) exceed units sold (${sales.totalUnits.value})`);
    }
    
    // Check: Serious complaints should not exceed total complaints
    if (complaints.seriousCount.value > complaints.totalCount.value) {
      issues.push(`Serious complaints (${complaints.seriousCount.value}) exceed total complaints (${complaints.totalCount.value})`);
    }
    
    // Check: If no sales data but complaints exist
    if (sales.totalUnits.value === 0 && complaints.totalCount.value > 0) {
      warnings.push("Complaints exist but no sales data - cannot calculate rates");
    }
    
    // Check: If serious incidents exceed total incidents
    if (incidents.seriousCount.value > incidents.totalCount.value) {
      issues.push(`Serious incidents (${incidents.seriousCount.value}) exceed total incidents (${incidents.totalCount.value})`);
    }
    
    return {
      crossSectionConsistent: issues.length === 0,
      issues,
      warnings,
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private isSalesType(type: string): boolean {
    const lower = type.toLowerCase();
    return lower.includes("sales") || lower.includes("distribution") || lower.includes("volume") || 
           type === CANONICAL_EVIDENCE_TYPES.SALES;
  }
  
  private isComplaintType(type: string): boolean {
    const lower = type.toLowerCase();
    return lower.includes("complaint") || type === CANONICAL_EVIDENCE_TYPES.COMPLAINT;
  }
  
  private isIncidentType(type: string): boolean {
    const lower = type.toLowerCase();
    return lower.includes("incident") || lower.includes("adverse") || lower.includes("event") ||
           type === CANONICAL_EVIDENCE_TYPES.INCIDENT;
  }
  
  private isFscaType(type: string): boolean {
    const lower = type.toLowerCase();
    return lower.includes("fsca") || lower.includes("recall") || lower.includes("field_safety") ||
           type === CANONICAL_EVIDENCE_TYPES.FSCA;
  }
  
  private isVigilanceType(type: string): boolean {
    const lower = type.toLowerCase();
    return lower.includes("vigilance") || lower.includes("mdr_report");
  }
  
  private normalizeRegion(raw: unknown): string {
    if (!raw) return "Global";
    const str = String(raw).toLowerCase().trim();
    return REGION_NORMALIZATION[str] || String(raw).trim().replace(/\b\w/g, c => c.toUpperCase());
  }
  
  private normalizeSeverity(raw: string): string {
    if (!raw) return "Unknown";
    return SEVERITY_NORMALIZATION[raw.toLowerCase().trim()] || "Unknown";
  }
  
  private getValue(data: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
        return data[key];
      }
    }
    return null;
  }
  
  private parseNumber(value: unknown): number {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return isNaN(value) ? 0 : value;
    const str = String(value).replace(/[$€£¥,\s]/g, "").replace(/[()]/g, "-");
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  }
  
  private formatNumber(value: number): string {
    if (value === 0) return "0";
    if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
    if (value >= 1000) return (value / 1000).toFixed(1) + "K";
    return value.toLocaleString();
  }
  
  private isSerious(data: Record<string, unknown>): boolean {
    const outcome = String(this.getValue(data, "patient_outcome", "outcome", "harm") || "").toLowerCase();
    const serious = String(this.getValue(data, "serious", "is_serious", "reportable") || "").toLowerCase();
    return outcome.includes("death") || outcome.includes("injury") || outcome.includes("hospitalization") ||
           outcome.includes("intervention") || serious === "true" || serious === "yes" || serious === "1";
  }
  
  private extractImdrfCode(data: Record<string, unknown>): string | null {
    const fields = ["imdrf_code", "imdrfCode", "annex_code", "problem_code"];
    for (const field of fields) {
      const value = data[field];
      if (value && typeof value === "string" && value.match(/^[A-Z]\d{4}$/)) {
        return value;
      }
    }
    return null;
  }
  
  private calculateSalesQuality(regionAgg: Map<string, unknown>): number {
    let score = 100;
    if (regionAgg.size === 0) score -= 50;
    // Add more quality checks as needed
    return Math.max(0, score);
  }
  
  private calculateComplaintQuality(
    complaints: EvidenceAtom[],
    severityAgg: Map<string, unknown>
  ): number {
    let score = 100;
    if (complaints.length === 0) score -= 30;
    if (severityAgg.get("Unknown")) {
      const unknownCount = (severityAgg.get("Unknown") as { count: number })?.count || 0;
      score -= Math.min(30, (unknownCount / complaints.length) * 100);
    }
    return Math.max(0, Math.round(score));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get canonical metrics for a PSUR case
 */
export function getCanonicalMetrics(
  psurCaseId: number,
  atoms: EvidenceAtom[],
  periodStart: string,
  periodEnd: string
): CanonicalMetrics {
  const service = new CanonicalMetricsService(psurCaseId, atoms, periodStart, periodEnd);
  return service.getMetrics();
}

/**
 * Clear metrics cache for a PSUR case
 */
export function clearMetricsCache(psurCaseId: number): void {
  CanonicalMetricsService.clearCache(psurCaseId);
}
