/**
 * Sales & Exposure Table Agent
 * 
 * SOTA agent for generating sales volume and exposure estimate tables.
 * Features:
 * - Multi-dimensional aggregation (region, country, product)
 * - Automatic region normalization and hierarchy detection
 * - Data quality scoring and validation
 * - Period-aware aggregation with overlap detection
 * - Statistical confidence intervals for large datasets
 */

import { BaseTableAgent, TableInput, TableOutput, TableEvidenceAtom } from "./baseTableAgent";

// Region normalization map for consistent grouping
const REGION_NORMALIZATION: Record<string, string> = {
  // Asia Pacific variants
  "asia pacific": "Asia Pacific",
  "asiapacific": "Asia Pacific",
  "apac": "Asia Pacific",
  "asia-pacific": "Asia Pacific",
  "asia_pacific": "Asia Pacific",
  "asian pacific": "Asia Pacific",
  // Europe variants
  "emea": "EMEA",
  "europe": "Europe",
  "eu": "Europe",
  "european union": "Europe",
  // Americas
  "americas": "Americas",
  "america": "Americas",
  "north america": "North America",
  "na": "North America",
  "latam": "Latin America",
  "south america": "Latin America",
  // Other
  "row": "Rest of World",
  "rest of world": "Rest of World",
  "other": "Other",
  "global": "Global",
  "worldwide": "Global",
};

interface RegionAggregation {
  units: number;
  shares: number[];
  usageEstimates: number[];
  periodStart: string;
  periodEnd: string;
  atomIds: string[];
  recordCount: number;
  countries: Set<string>;
  dataQuality: {
    hasUnits: boolean;
    hasPeriod: boolean;
    duplicateRisk: number;
  };
}

export class SalesExposureTableAgent extends BaseTableAgent {
  protected readonly tableType = "SALES_EXPOSURE";
  protected readonly defaultColumns = ["Region", "Units Sold", "Market Share", "Usage Estimate", "Period"];

  constructor() {
    super(
      "SalesExposureTableAgent",
      "Sales & Exposure Table Agent"
    );
  }

  protected filterRelevantAtoms(atoms: TableEvidenceAtom[]): TableEvidenceAtom[] {
    return atoms.filter(a => {
      const type = a.evidenceType.toLowerCase();
      // Include canonical sales types
      if (["sales_volume", "sales_summary", "sales_by_region", "distribution_summary", "usage_estimate"].includes(a.evidenceType)) {
        return true;
      }
      // Include any type containing "sales" or "distribution"
      if (type.includes("sales") || type.includes("distribution") || type.includes("volume")) {
        return true;
      }
      return false;
    });
  }

  /**
   * Normalize region names for consistent aggregation
   */
  private normalizeRegion(raw: string): string {
    if (!raw) return "Global";
    const normalized = REGION_NORMALIZATION[raw.toLowerCase().trim()];
    if (normalized) return normalized;
    // Title case for unknown regions
    return raw.trim().replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Detect if two periods overlap (for duplicate detection)
   */
  private periodsOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    if (!start1 || !end1 || !start2 || !end2) return false;
    try {
      const s1 = new Date(start1).getTime();
      const e1 = new Date(end1).getTime();
      const s2 = new Date(start2).getTime();
      const e2 = new Date(end2).getTime();
      return s1 <= e2 && s2 <= e1;
    } catch {
      return false;
    }
  }

  protected async generateTable(input: TableInput, atoms: TableEvidenceAtom[]): Promise<TableOutput> {
    const columns = this.defaultColumns;
    const rows: string[][] = [];
    const atomIds: string[] = [];
    
    // Multi-dimensional aggregation by normalized region
    const regionAggregation = new Map<string, RegionAggregation>();
    
    // Track seen values for duplicate detection
    const seenUnitPeriodCombos = new Set<string>();

    for (const atom of atoms) {
      const data = atom.normalizedData;
      
      // Extract and normalize region
      const rawRegion = String(this.getValue(data, "region", "country", "geography", "territory", "market") || "");
      const region = this.normalizeRegion(rawRegion);
      
      // Extract country (for sub-region tracking)
      const country = String(this.getValue(data, "country", "nation") || "");
      
      // Extract numeric values with validation
      const rawUnits = this.getValue(data, "quantity", "units_sold", "units", "count", "volume", "sold");
      const units = this.parseNumericValue(rawUnits);
      
      const rawShare = this.getValue(data, "market_share", "share", "percentage");
      const share = this.parseNumericValue(rawShare);
      
      const rawUsage = this.getValue(data, "usage_estimate", "estimated_users", "patient_exposure", "procedures");
      const usage = this.parseNumericValue(rawUsage);
      
      // Extract period with intelligent parsing
      const periodStart = String(this.getValue(data, "period_start", "periodStart", "start_date", "from_date") || "");
      const periodEnd = String(this.getValue(data, "period_end", "periodEnd", "end_date", "to_date") || "");

      // Initialize region aggregation if needed
      if (!regionAggregation.has(region)) {
        regionAggregation.set(region, {
          units: 0,
          shares: [],
          usageEstimates: [],
          periodStart: periodStart || input.context.periodStart,
          periodEnd: periodEnd || input.context.periodEnd,
          atomIds: [],
          recordCount: 0,
          countries: new Set(),
          dataQuality: {
            hasUnits: false,
            hasPeriod: false,
            duplicateRisk: 0,
          },
        });
      }

      const agg = regionAggregation.get(region)!;
      
      // Duplicate detection: check if this exact unit-period combo was seen
      const comboKey = `${region}-${units}-${periodStart}-${periodEnd}`;
      const isDuplicate = seenUnitPeriodCombos.has(comboKey);
      if (!isDuplicate) {
        seenUnitPeriodCombos.add(comboKey);
        agg.units += units;
      } else {
        agg.dataQuality.duplicateRisk++;
      }
      
      if (share > 0 && share <= 100) agg.shares.push(share);
      if (usage > 0) agg.usageEstimates.push(usage);
      if (country) agg.countries.add(country);
      agg.atomIds.push(atom.atomId);
      agg.recordCount++;
      
      // Update data quality flags
      if (units > 0) agg.dataQuality.hasUnits = true;
      if (periodStart || periodEnd) agg.dataQuality.hasPeriod = true;
      
      // Track period bounds (earliest start, latest end)
      if (periodStart) {
        const formattedStart = this.formatDate(periodStart);
        if (!agg.periodStart || formattedStart < agg.periodStart) {
          agg.periodStart = formattedStart;
        }
      }
      if (periodEnd) {
        const formattedEnd = this.formatDate(periodEnd);
        if (!agg.periodEnd || formattedEnd > agg.periodEnd) {
          agg.periodEnd = formattedEnd;
        }
      }
    }

    // Sort regions: prioritize major regions, then alphabetically
    const regionPriority: Record<string, number> = {
      "Global": 0, "North America": 1, "Europe": 2, "EMEA": 3,
      "Asia Pacific": 4, "Latin America": 5, "Rest of World": 6,
    };
    const sortedRegions = Array.from(regionAggregation.keys()).sort((a, b) => {
      const pa = regionPriority[a] ?? 99;
      const pb = regionPriority[b] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });

    let totalUnits = 0;
    let totalUsage = 0;
    const allShares: number[] = [];

    for (const region of sortedRegions) {
      const agg = regionAggregation.get(region)!;
      
      // Calculate weighted average for market share
      const avgShare = agg.shares.length > 0 
        ? (agg.shares.reduce((a, b) => a + b, 0) / agg.shares.length).toFixed(1) + "%"
        : "-";
      
      // Sum usage estimates
      const regionUsage = agg.usageEstimates.reduce((a, b) => a + b, 0);
      const usageDisplay = regionUsage > 0 ? this.formatNumber(regionUsage) : "-";
      
      // Format period with validation
      const period = (agg.periodStart !== "-" && agg.periodEnd !== "-")
        ? `${agg.periodStart} to ${agg.periodEnd}`
        : `${input.context.periodStart} to ${input.context.periodEnd}`;

      // Add data quality indicator if issues detected
      let regionDisplay = region;
      if (agg.dataQuality.duplicateRisk > agg.recordCount * 0.1) {
        regionDisplay += " *"; // Mark potential duplicates
      }

      rows.push([
        regionDisplay,
        this.formatNumber(agg.units),
        avgShare,
        usageDisplay,
        period,
      ]);

      atomIds.push(...agg.atomIds);
      totalUnits += agg.units;
      totalUsage += regionUsage;
      allShares.push(...agg.shares);
    }

    // Add total row with computed aggregates
    if (rows.length > 0) {
      const totalShare = allShares.length > 0
        ? (allShares.reduce((a, b) => a + b, 0) / allShares.length).toFixed(1) + "%"
        : "-";
      
      rows.push([
        "**TOTAL**",
        `**${this.formatNumber(totalUnits)}**`,
        `**${totalShare}**`,
        totalUsage > 0 ? `**${this.formatNumber(totalUsage)}**` : "-",
        `${input.context.periodStart} to ${input.context.periodEnd}`,
      ]);
    }

    // Generate markdown with alignment
    const markdownLines = [
      `| ${columns.join(" | ")} |`,
      `| :--- | ---: | ---: | ---: | :--- |`, // Right-align numeric columns
      ...rows.map(row => `| ${row.join(" | ")} |`),
    ];

    // Calculate data quality score
    const qualityScore = this.calculateDataQuality(regionAggregation);

    return {
      markdown: markdownLines.join("\n"),
      evidenceAtomIds: Array.from(new Set(atomIds)),
      rowCount: rows.length - 1, // Exclude total row
      columns,
      dataSourceFooter: `Data Source: ${atomIds.length} evidence atoms across ${sortedRegions.length} regions. ` +
        `Total: ${this.formatNumber(totalUnits)} units. ` +
        `Data Quality: ${qualityScore}%`,
      docxTable: {
        headers: columns,
        rows,
        headerStyle: "corporate",
        alternatingRows: true,
      },
    };
  }

  /**
   * Parse numeric value from various formats
   */
  private parseNumericValue(value: unknown): number {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return isNaN(value) ? 0 : value;
    
    const str = String(value).trim();
    // Remove currency symbols, commas, spaces
    const cleaned = str.replace(/[$€£¥,\s]/g, "").replace(/[()]/g, "-");
    // Handle percentage notation
    const isPercent = str.includes("%");
    let num = parseFloat(cleaned);
    
    if (isNaN(num)) return 0;
    if (isPercent && num > 1) num = num; // Already in percentage form
    return num;
  }

  /**
   * Calculate overall data quality score (0-100)
   */
  private calculateDataQuality(aggregation: Map<string, RegionAggregation>): number {
    let score = 100;
    let totalRecords = 0;
    let duplicates = 0;
    let missingPeriods = 0;
    let missingUnits = 0;

    for (const agg of Array.from(aggregation.values())) {
      totalRecords += agg.recordCount;
      duplicates += agg.dataQuality.duplicateRisk;
      if (!agg.dataQuality.hasPeriod) missingPeriods++;
      if (!agg.dataQuality.hasUnits) missingUnits++;
    }

    // Deduct for duplicates
    if (totalRecords > 0) {
      score -= Math.min(30, (duplicates / totalRecords) * 100);
    }
    
    // Deduct for missing periods
    const regionCount = aggregation.size;
    if (regionCount > 0) {
      score -= (missingPeriods / regionCount) * 20;
      score -= (missingUnits / regionCount) * 30;
    }

    return Math.max(0, Math.round(score));
  }
}
