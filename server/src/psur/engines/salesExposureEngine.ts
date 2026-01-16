/**
 * SALES & EXPOSURE ENGINE
 * 
 * Deterministic engine for calculating sales volume and population exposure metrics.
 * All outputs include calculation formulas, evidence atom IDs, and period filters.
 * 
 * Per MDCG 2022-21 Annex I, Sections 10-11
 */

import type {
  PSURTable,
  TableRow,
  TableCell,
  TraceReference,
} from "../psurContract";
import { createTraceReference, CALCULATION_FORMULAS } from "../psurContract";

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface SalesEvidenceAtom {
  atomId: string;
  evidenceType: "sales_volume";
  deviceCode: string;
  quantity: number;
  region: string;
  country?: string;
  saleDate?: string;
  periodStart: string;
  periodEnd: string;
  productName?: string;
}

export interface ReportingPeriod {
  start: string; // ISO date
  end: string;   // ISO date
}

export type DeviceUsageModel = "SINGLE_USE" | "REUSABLE";

export interface DeviceUsageConfig {
  model: DeviceUsageModel;
  avgProceduresPerDevice?: number; // Required for REUSABLE
  avgDeviceLifespanYears?: number;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface SalesExposureResult {
  success: boolean;
  errors: string[];
  
  // Tables (STRICT output)
  yearlySalesByRegion: PSURTable;
  cumulativeTotals: PSURTable;
  globalSalesPercentage: PSURTable;
  populationExposure: PSURTable;
  monthlySalesSeries: MonthlySalesDataPoint[];
  
  // Metrics
  metrics: SalesMetrics;
  
  // Trace
  allEvidenceAtomIds: string[];
  calculationLog: CalculationLogEntry[];
}

export interface SalesMetrics {
  totalUnitsSoldInPeriod: number;
  cumulativeUnitsSold: number;
  populationExposureEstimate: number;
  regionBreakdown: RegionSalesBreakdown[];
  yearOverYearGrowth?: number;
}

export interface RegionSalesBreakdown {
  region: string;
  unitsSold: number;
  percentOfGlobal: number;
}

export interface MonthlySalesDataPoint {
  month: string; // YYYY-MM format
  unitsSold: number;
  cumulativeToDate: number;
  evidenceAtomIds: string[];
}

export interface CalculationLogEntry {
  calculationId: string;
  formula: string;
  inputs: Record<string, number | string>;
  output: number;
  outputUnit: string;
  evidenceAtomIds: string[];
  timestamp: string;
}

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export function computeSalesExposure(
  salesAtoms: SalesEvidenceAtom[],
  reportingPeriod: ReportingPeriod,
  usageConfig: DeviceUsageConfig,
  cumulativeSalesBeforePeriod: number = 0
): SalesExposureResult {
  const errors: string[] = [];
  const calculationLog: CalculationLogEntry[] = [];
  const allEvidenceAtomIds: string[] = salesAtoms.map(a => a.atomId);
  
  // Validate inputs
  if (salesAtoms.length === 0) {
    errors.push("No sales evidence atoms provided");
  }
  
  if (usageConfig.model === "REUSABLE" && !usageConfig.avgProceduresPerDevice) {
    errors.push("avgProceduresPerDevice required for REUSABLE device model");
  }
  
  // Filter atoms to reporting period
  const atomsInPeriod = salesAtoms.filter(a => 
    isWithinPeriod(a.periodStart, a.periodEnd, reportingPeriod)
  );
  
  // -------------------------------------------------------------------------
  // CALCULATION 1: Total Units Sold in Period
  // -------------------------------------------------------------------------
  const totalUnitsSoldInPeriod = atomsInPeriod.reduce((sum, a) => sum + a.quantity, 0);
  
  calculationLog.push({
    calculationId: "CALC_TOTAL_PERIOD_SALES",
    formula: "SUM(quantity) for all atoms in period",
    inputs: { atomCount: atomsInPeriod.length },
    output: totalUnitsSoldInPeriod,
    outputUnit: "units",
    evidenceAtomIds: atomsInPeriod.map(a => a.atomId),
    timestamp: new Date().toISOString(),
  });
  
  // -------------------------------------------------------------------------
  // CALCULATION 2: Cumulative Total
  // -------------------------------------------------------------------------
  const cumulativeUnitsSold = cumulativeSalesBeforePeriod + totalUnitsSoldInPeriod;
  
  calculationLog.push({
    calculationId: "CALC_CUMULATIVE_SALES",
    formula: CALCULATION_FORMULAS.POPULATION_EXPOSURE_SINGLE_USE,
    inputs: { 
      cumulativeBefore: cumulativeSalesBeforePeriod, 
      periodSales: totalUnitsSoldInPeriod 
    },
    output: cumulativeUnitsSold,
    outputUnit: "units",
    evidenceAtomIds: allEvidenceAtomIds,
    timestamp: new Date().toISOString(),
  });
  
  // -------------------------------------------------------------------------
  // CALCULATION 3: Regional Breakdown
  // -------------------------------------------------------------------------
  const regionMap = new Map<string, { units: number; atomIds: string[] }>();
  
  for (const atom of atomsInPeriod) {
    const region = atom.region || "UNKNOWN";
    const existing = regionMap.get(region) || { units: 0, atomIds: [] };
    existing.units += atom.quantity;
    existing.atomIds.push(atom.atomId);
    regionMap.set(region, existing);
  }
  
  const regionBreakdown: RegionSalesBreakdown[] = [];
  for (const [region, data] of Array.from(regionMap)) {
    const percentOfGlobal = totalUnitsSoldInPeriod > 0 
      ? (data.units / totalUnitsSoldInPeriod) * 100 
      : 0;
    
    regionBreakdown.push({
      region,
      unitsSold: data.units,
      percentOfGlobal: Math.round(percentOfGlobal * 100) / 100,
    });
    
    calculationLog.push({
      calculationId: `CALC_REGIONAL_PERCENT_${region}`,
      formula: CALCULATION_FORMULAS.PERCENT_OF_GLOBAL,
      inputs: { regional_sales: data.units, global_sales: totalUnitsSoldInPeriod },
      output: percentOfGlobal,
      outputUnit: "percentage",
      evidenceAtomIds: data.atomIds,
      timestamp: new Date().toISOString(),
    });
  }
  
  // Sort by units descending
  regionBreakdown.sort((a, b) => b.unitsSold - a.unitsSold);
  
  // -------------------------------------------------------------------------
  // CALCULATION 4: Population Exposure
  // -------------------------------------------------------------------------
  let populationExposureEstimate: number;
  
  if (usageConfig.model === "SINGLE_USE") {
    populationExposureEstimate = cumulativeUnitsSold;
    
    calculationLog.push({
      calculationId: "CALC_POPULATION_EXPOSURE",
      formula: CALCULATION_FORMULAS.POPULATION_EXPOSURE_SINGLE_USE,
      inputs: { cumulative_units_sold: cumulativeUnitsSold },
      output: populationExposureEstimate,
      outputUnit: "patient_exposures",
      evidenceAtomIds: allEvidenceAtomIds,
      timestamp: new Date().toISOString(),
    });
  } else {
    const avgProcedures = usageConfig.avgProceduresPerDevice || 1;
    populationExposureEstimate = cumulativeUnitsSold * avgProcedures;
    
    calculationLog.push({
      calculationId: "CALC_POPULATION_EXPOSURE",
      formula: CALCULATION_FORMULAS.POPULATION_EXPOSURE_REUSABLE,
      inputs: { 
        cumulative_units_sold: cumulativeUnitsSold, 
        avg_procedures_per_device: avgProcedures 
      },
      output: populationExposureEstimate,
      outputUnit: "patient_exposures",
      evidenceAtomIds: allEvidenceAtomIds,
      timestamp: new Date().toISOString(),
    });
  }
  
  // -------------------------------------------------------------------------
  // CALCULATION 5: Monthly Sales Series
  // -------------------------------------------------------------------------
  const monthlySalesSeries = computeMonthlySeries(atomsInPeriod, reportingPeriod);
  
  // -------------------------------------------------------------------------
  // BUILD OUTPUT TABLES
  // -------------------------------------------------------------------------
  
  // Table: Yearly Sales by Region
  const yearlySalesByRegion = buildYearlySalesByRegionTable(
    regionBreakdown,
    reportingPeriod,
    allEvidenceAtomIds
  );
  
  // Table: Cumulative Totals
  const cumulativeTotals = buildCumulativeTotalsTable(
    cumulativeSalesBeforePeriod,
    totalUnitsSoldInPeriod,
    cumulativeUnitsSold,
    allEvidenceAtomIds
  );
  
  // Table: Global Sales Percentage
  const globalSalesPercentage = buildGlobalSalesPercentageTable(
    regionBreakdown,
    allEvidenceAtomIds
  );
  
  // Table: Population Exposure
  const populationExposureTable = buildPopulationExposureTable(
    cumulativeUnitsSold,
    populationExposureEstimate,
    usageConfig,
    allEvidenceAtomIds
  );
  
  return {
    success: errors.length === 0,
    errors,
    yearlySalesByRegion,
    cumulativeTotals,
    globalSalesPercentage: globalSalesPercentage,
    populationExposure: populationExposureTable,
    monthlySalesSeries,
    metrics: {
      totalUnitsSoldInPeriod,
      cumulativeUnitsSold,
      populationExposureEstimate,
      regionBreakdown,
    },
    allEvidenceAtomIds,
    calculationLog,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function isWithinPeriod(
  atomStart: string,
  atomEnd: string,
  period: ReportingPeriod
): boolean {
  const aStart = new Date(atomStart);
  const aEnd = new Date(atomEnd);
  const pStart = new Date(period.start);
  const pEnd = new Date(period.end);
  
  // Atom overlaps with period if atom start <= period end AND atom end >= period start
  return aStart <= pEnd && aEnd >= pStart;
}

function computeMonthlySeries(
  atoms: SalesEvidenceAtom[],
  period: ReportingPeriod
): MonthlySalesDataPoint[] {
  const monthMap = new Map<string, { units: number; atomIds: string[] }>();
  
  // Initialize all months in the period
  const start = new Date(period.start);
  const end = new Date(period.end);
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  
  while (current <= end) {
    const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(monthKey, { units: 0, atomIds: [] });
    current.setMonth(current.getMonth() + 1);
  }
  
  // Distribute atom quantities to months (simplified: assign to period start month)
  for (const atom of atoms) {
    const atomDate = new Date(atom.periodStart);
    const monthKey = `${atomDate.getFullYear()}-${String(atomDate.getMonth() + 1).padStart(2, "0")}`;
    
    const existing = monthMap.get(monthKey);
    if (existing) {
      existing.units += atom.quantity;
      existing.atomIds.push(atom.atomId);
    }
  }
  
  // Convert to array and compute cumulative
  const series: MonthlySalesDataPoint[] = [];
  let cumulative = 0;
  
  const sortedMonths = Array.from(monthMap.keys()).sort();
  for (const month of sortedMonths) {
    const data = monthMap.get(month)!;
    cumulative += data.units;
    series.push({
      month,
      unitsSold: data.units,
      cumulativeToDate: cumulative,
      evidenceAtomIds: data.atomIds,
    });
  }
  
  return series;
}

// ============================================================================
// TABLE BUILDERS
// ============================================================================

function buildYearlySalesByRegionTable(
  regionBreakdown: RegionSalesBreakdown[],
  period: ReportingPeriod,
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference(
    "table_sales_by_region_year",
    evidenceAtomIds,
    { calculationId: "CALC_REGIONAL_SALES" }
  );
  
  const rows: TableRow[] = [];
  
  // Header row
  rows.push({
    rowId: "header",
    isHeader: true,
    cells: [
      { value: "Region", format: "text" },
      { value: "Units Sold", format: "number" },
      { value: "% of Global", format: "percentage" },
    ],
  });
  
  // Data rows
  for (const region of regionBreakdown) {
    rows.push({
      rowId: `region_${region.region}`,
      cells: [
        { value: region.region, format: "text" },
        { value: region.unitsSold, format: "number" },
        { value: region.percentOfGlobal, format: "percentage", precision: 1 },
      ],
    });
  }
  
  // Total row
  const totalUnits = regionBreakdown.reduce((sum, r) => sum + r.unitsSold, 0);
  rows.push({
    rowId: "total",
    isTotal: true,
    cells: [
      { value: "TOTAL", format: "text" },
      { value: totalUnits, format: "number" },
      { value: 100, format: "percentage" },
    ],
  });
  
  return {
    tableId: "TABLE_SALES_BY_REGION_YEAR",
    title: "Sales Distribution by Region",
    columns: ["Region", "Units Sold", "% of Global"],
    rows,
    footnotes: [
      `Reporting period: ${period.start} to ${period.end}`,
      "Percentages may not sum to 100% due to rounding.",
    ],
    traceRef,
    calculationFormula: CALCULATION_FORMULAS.PERCENT_OF_GLOBAL,
    periodFilter: period,
  };
}

function buildCumulativeTotalsTable(
  beforePeriod: number,
  inPeriod: number,
  cumulative: number,
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference(
    "table_sales_cumulative",
    evidenceAtomIds,
    { calculationId: "CALC_CUMULATIVE_SALES" }
  );
  
  return {
    tableId: "TABLE_SALES_CUMULATIVE",
    title: "Cumulative Sales Summary",
    columns: ["Metric", "Value"],
    rows: [
      {
        rowId: "header",
        isHeader: true,
        cells: [
          { value: "Metric", format: "text" },
          { value: "Value", format: "text" },
        ],
      },
      {
        rowId: "before_period",
        cells: [
          { value: "Units Sold Before Reporting Period", format: "text" },
          { value: beforePeriod, format: "number" },
        ],
      },
      {
        rowId: "in_period",
        cells: [
          { value: "Units Sold During Reporting Period", format: "text" },
          { value: inPeriod, format: "number" },
        ],
      },
      {
        rowId: "cumulative",
        isTotal: true,
        cells: [
          { value: "Cumulative Total (Since Market Entry)", format: "text" },
          { value: cumulative, format: "number" },
        ],
      },
    ],
    traceRef,
    calculationFormula: "cumulative = before_period + in_period",
  };
}

function buildGlobalSalesPercentageTable(
  regionBreakdown: RegionSalesBreakdown[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference(
    "table_global_sales_percentage",
    evidenceAtomIds,
    { calculationId: "CALC_REGIONAL_PERCENT" }
  );
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Region", format: "text" },
        { value: "Percentage of Global Sales", format: "text" },
      ],
    },
  ];
  
  for (const region of regionBreakdown) {
    rows.push({
      rowId: `region_${region.region}`,
      cells: [
        { value: region.region, format: "text" },
        { value: `${region.percentOfGlobal.toFixed(1)}%`, format: "text" },
      ],
    });
  }
  
  return {
    tableId: "TABLE_SALES_CUMULATIVE", // Using cumulative as closest match
    title: "Global Sales Distribution",
    columns: ["Region", "Percentage of Global Sales"],
    rows,
    traceRef,
    calculationFormula: CALCULATION_FORMULAS.PERCENT_OF_GLOBAL,
  };
}

function buildPopulationExposureTable(
  cumulativeUnits: number,
  exposureEstimate: number,
  usageConfig: DeviceUsageConfig,
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference(
    "table_population_exposure",
    evidenceAtomIds,
    { calculationId: "CALC_POPULATION_EXPOSURE" }
  );
  
  const formula = usageConfig.model === "SINGLE_USE"
    ? CALCULATION_FORMULAS.POPULATION_EXPOSURE_SINGLE_USE
    : CALCULATION_FORMULAS.POPULATION_EXPOSURE_REUSABLE;
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Parameter", format: "text" },
        { value: "Value", format: "text" },
      ],
    },
    {
      rowId: "usage_model",
      cells: [
        { value: "Device Usage Model", format: "text" },
        { value: usageConfig.model, format: "text" },
      ],
    },
    {
      rowId: "cumulative_units",
      cells: [
        { value: "Cumulative Units Sold", format: "text" },
        { value: cumulativeUnits, format: "number" },
      ],
    },
  ];
  
  if (usageConfig.model === "REUSABLE") {
    rows.push({
      rowId: "avg_procedures",
      cells: [
        { value: "Average Procedures per Device", format: "text" },
        { value: usageConfig.avgProceduresPerDevice || 0, format: "number" },
      ],
    });
  }
  
  rows.push({
    rowId: "exposure_estimate",
    isTotal: true,
    cells: [
      { value: "Estimated Patient Exposures", format: "text" },
      { value: exposureEstimate, format: "number" },
    ],
  });
  
  return {
    tableId: "TABLE_POPULATION_EXPOSURE",
    title: "Population Exposure Estimate",
    columns: ["Parameter", "Value"],
    rows,
    footnotes: [
      `Calculation: ${formula}`,
      usageConfig.model === "REUSABLE" 
        ? "For reusable devices, exposure is based on estimated average procedures per device lifetime."
        : "For single-use devices, exposure equals cumulative units sold.",
    ],
    traceRef,
    calculationFormula: formula,
  };
}

// ============================================================================
// EXPORTS FOR PSUR RENDERING
// ============================================================================

export function getSalesNarrativeBlocks(result: SalesExposureResult): string[] {
  const blocks: string[] = [];
  
  blocks.push(
    `During the reporting period, ${result.metrics.totalUnitsSoldInPeriod.toLocaleString()} units were sold globally.`
  );
  
  blocks.push(
    `The cumulative number of devices sold since market entry is ${result.metrics.cumulativeUnitsSold.toLocaleString()} units.`
  );
  
  if (result.metrics.regionBreakdown.length > 0) {
    const topRegion = result.metrics.regionBreakdown[0];
    blocks.push(
      `The primary market is ${topRegion.region}, representing ${topRegion.percentOfGlobal.toFixed(1)}% of global sales.`
    );
  }
  
  blocks.push(
    `Based on the device usage model, the estimated population exposure is ${result.metrics.populationExposureEstimate.toLocaleString()} patient exposures.`
  );
  
  return blocks;
}
