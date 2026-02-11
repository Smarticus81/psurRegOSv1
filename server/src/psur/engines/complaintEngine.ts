/**
 * COMPLAINT RATE + TRENDING ENGINE
 * 
 * Deterministic engine for complaint analysis with UCL (Upper Control Limit)
 * calculations, trend detection, and Article 88 trend reporting determination.
 * 
 * Outputs feed Sections D, E, F, and G directly.
 * 
 * Per MDCG 2022-21 Annex I, Sections 12-15, 19
 */

import type {
  PSURTable,
  TableRow,
  TraceReference,
} from "../psurContract";
import { createTraceReference, CALCULATION_FORMULAS } from "../psurContract";

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface ComplaintEvidenceAtom {
  atomId: string;
  evidenceType: "complaint_record";
  complaintId: string;
  deviceCode: string;
  complaintDate: string;
  description: string;
  category?: string;
  severity?: "low" | "medium" | "high" | "critical";
  harmLevel?: HarmLevel;
  deviceRelated?: boolean;
  patientInjury?: boolean;
  investigationStatus?: string;
  rootCause?: string;
  imdrfProblemCode?: string;
  country?: string;
  /** Whether the complaint was confirmed as a product defect ("yes"/"no") */
  complaintConfirmed?: string;
  /** Investigation findings narrative */
  investigationFindings?: string;
  /** Corrective actions taken */
  correctiveActions?: string;
  /** Product/catalog number */
  productNumber?: string;
  /** Manufacturing lot/batch number */
  lotNumber?: string;
  /** Patient additional medical attention required */
  additionalMedicalAttention?: string;
  /** Patient involvement flag */
  patientInvolvement?: string;
  /** Symptom code (internal taxonomy) */
  symptomCode?: string;
}

export type HarmLevel = 
  | "NONE"
  | "NEGLIGIBLE"
  | "MINOR"
  | "SERIOUS"
  | "CRITICAL"
  | "DEATH";

export interface RACTThreshold {
  category: string;
  warningThreshold: number;
  actionThreshold: number;
  unit: "per_1000_units" | "per_million_units";
}

export interface ReportingPeriod {
  start: string;
  end: string;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface ComplaintAnalysisResult {
  success: boolean;
  errors: string[];

  // Tables (STRICT output)
  complaintsByCategory: PSURTable;
  complaintsByHarm: PSURTable;
  complaintRates: PSURTable;
  complaintTrends: PSURTable;
  uclAnalysis: PSURTable;
  confirmedUnconfirmedBreakdown: PSURTable;

  // Metrics
  metrics: ComplaintMetrics;

  // Confirmed / Unconfirmed Tiered Rates
  confirmedMetrics: ConfirmedComplaintMetrics;

  // Trend Analysis
  trendAnalysis: TrendAnalysisResult;

  // Article 88 Determination
  article88Required: boolean;
  article88Justification: string;

  // Trace
  allEvidenceAtomIds: string[];
  calculationLog: CalculationLogEntry[];
}

export interface ConfirmedComplaintMetrics {
  /** Complaints confirmed as product defects via investigation */
  confirmedComplaints: number;
  /** Confirmed complaint rate (per 1,000 units) */
  confirmedRate: number;
  /** Complaints where investigation was inconclusive */
  unconfirmedComplaints: number;
  /** Unconfirmed complaint rate (per 1,000 units) */
  unconfirmedRate: number;
  /** Complaints attributed to external causes (shipping damage, user error) */
  externalCauseComplaints: number;
  /** External cause complaint rate (per 1,000 units) */
  externalCauseRate: number;
  /** Combined rate for regulatory comparison (all complaints / units) */
  combinedRate: number;
  /** Percentage of total that are confirmed */
  confirmedPercentage: number;
  /** Percentage of total that are unconfirmed */
  unconfirmedPercentage: number;
  /** Percentage of total that are external cause */
  externalCausePercentage: number;
}

export interface ComplaintMetrics {
  totalComplaints: number;
  totalDeviceRelated: number;
  totalPatientInjury: number;
  complaintRate: number;
  complaintRateUnit: string;
  byCategory: CategoryBreakdown[];
  byHarm: HarmBreakdown[];
  bySeverity: SeverityBreakdown[];
}

export interface CategoryBreakdown {
  category: string;
  count: number;
  percentage: number;
  rate: number;
}

export interface HarmBreakdown {
  harmLevel: HarmLevel;
  count: number;
  percentage: number;
}

export interface SeverityBreakdown {
  severity: string;
  count: number;
  percentage: number;
}

export interface TrendAnalysisResult {
  dataPoints: TrendDataPoint[];
  mean: number;
  stdDev: number;
  ucl: number;
  lcl: number;
  slope: number;
  isIncreasing: boolean;
  isStatisticallySignificant: boolean;
  excursions: TrendExcursion[];
}

export interface TrendDataPoint {
  period: string;
  count: number;
  rate: number;
  unitsSold: number;
  evidenceAtomIds: string[];
}

export interface TrendExcursion {
  period: string;
  observedRate: number;
  threshold: number;
  excursionType: "UCL_BREACH" | "RACT_WARNING" | "RACT_ACTION";
  significance: string;
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
// DEFAULT RACT THRESHOLDS
// ============================================================================

const DEFAULT_RACT_THRESHOLDS: RACTThreshold[] = [
  { category: "malfunction", warningThreshold: 5, actionThreshold: 10, unit: "per_1000_units" },
  { category: "labeling", warningThreshold: 2, actionThreshold: 5, unit: "per_1000_units" },
  { category: "performance", warningThreshold: 3, actionThreshold: 7, unit: "per_1000_units" },
  { category: "usability", warningThreshold: 4, actionThreshold: 8, unit: "per_1000_units" },
  { category: "default", warningThreshold: 5, actionThreshold: 10, unit: "per_1000_units" },
];

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export function computeComplaintAnalysis(
  complaintAtoms: ComplaintEvidenceAtom[],
  unitsSoldInPeriod: number,
  reportingPeriod: ReportingPeriod,
  historicalData?: TrendDataPoint[],
  ractThresholds: RACTThreshold[] = DEFAULT_RACT_THRESHOLDS
): ComplaintAnalysisResult {
  const errors: string[] = [];
  const calculationLog: CalculationLogEntry[] = [];
  const allEvidenceAtomIds = complaintAtoms.map(a => a.atomId);
  
  // Validate inputs
  if (unitsSoldInPeriod <= 0) {
    errors.push("Units sold must be greater than zero for rate calculation");
  }
  
  // Filter to reporting period
  const complaintsInPeriod = complaintAtoms.filter(a =>
    isWithinPeriod(a.complaintDate, reportingPeriod)
  );
  
  // -------------------------------------------------------------------------
  // CALCULATION 1: Basic Metrics
  // -------------------------------------------------------------------------
  const totalComplaints = complaintsInPeriod.length;
  const totalDeviceRelated = complaintsInPeriod.filter(a => a.deviceRelated).length;
  const totalPatientInjury = complaintsInPeriod.filter(a => a.patientInjury).length;
  
  // -------------------------------------------------------------------------
  // CALCULATION 2: Complaint Rate
  // -------------------------------------------------------------------------
  const complaintRate = unitsSoldInPeriod > 0
    ? (totalComplaints / unitsSoldInPeriod) * 1000
    : 0;
  
  calculationLog.push({
    calculationId: "CALC_COMPLAINT_RATE",
    formula: CALCULATION_FORMULAS.COMPLAINT_RATE,
    inputs: { complaints: totalComplaints, units_sold: unitsSoldInPeriod },
    output: complaintRate,
    outputUnit: "per_1000_units",
    evidenceAtomIds: allEvidenceAtomIds,
    timestamp: new Date().toISOString(),
  });
  
  // -------------------------------------------------------------------------
  // CALCULATION 3: Category Breakdown
  // -------------------------------------------------------------------------
  const categoryMap = new Map<string, { count: number; atomIds: string[] }>();
  
  for (const c of complaintsInPeriod) {
    const category = c.category || "uncategorized";
    const existing = categoryMap.get(category) || { count: 0, atomIds: [] };
    existing.count++;
    existing.atomIds.push(c.atomId);
    categoryMap.set(category, existing);
  }
  
  const byCategory: CategoryBreakdown[] = [];
  for (const [category, data] of Array.from(categoryMap)) {
    const percentage = totalComplaints > 0 ? (data.count / totalComplaints) * 100 : 0;
    const rate = unitsSoldInPeriod > 0 ? (data.count / unitsSoldInPeriod) * 1000 : 0;
    
    byCategory.push({ category, count: data.count, percentage, rate });
  }
  byCategory.sort((a, b) => b.count - a.count);
  
  // -------------------------------------------------------------------------
  // CALCULATION 4: Harm Level Breakdown (IMDRF aligned)
  // -------------------------------------------------------------------------
  const harmMap = new Map<HarmLevel, number>();
  const harmLevels: HarmLevel[] = ["NONE", "NEGLIGIBLE", "MINOR", "SERIOUS", "CRITICAL", "DEATH"];
  
  for (const level of harmLevels) {
    harmMap.set(level, 0);
  }
  
  for (const c of complaintsInPeriod) {
    const harm = c.harmLevel || "NONE";
    harmMap.set(harm, (harmMap.get(harm) || 0) + 1);
  }
  
  const byHarm: HarmBreakdown[] = harmLevels.map(level => ({
    harmLevel: level,
    count: harmMap.get(level) || 0,
    percentage: totalComplaints > 0 ? ((harmMap.get(level) || 0) / totalComplaints) * 100 : 0,
  }));
  
  // -------------------------------------------------------------------------
  // CALCULATION 5: Severity Breakdown
  // -------------------------------------------------------------------------
  const severityMap = new Map<string, number>();
  for (const c of complaintsInPeriod) {
    const severity = c.severity || "unknown";
    severityMap.set(severity, (severityMap.get(severity) || 0) + 1);
  }
  
  const bySeverity: SeverityBreakdown[] = [];
  for (const [severity, count] of Array.from(severityMap)) {
    bySeverity.push({
      severity,
      count,
      percentage: totalComplaints > 0 ? (count / totalComplaints) * 100 : 0,
    });
  }
  bySeverity.sort((a, b) => b.count - a.count);
  
  // -------------------------------------------------------------------------
  // CALCULATION 6: Trend Analysis with UCL
  // -------------------------------------------------------------------------
  const trendAnalysis = computeTrendAnalysis(
    complaintsInPeriod,
    unitsSoldInPeriod,
    reportingPeriod,
    historicalData,
    calculationLog
  );
  
  // -------------------------------------------------------------------------
  // CALCULATION 7: RACT Threshold Checking
  // -------------------------------------------------------------------------
  const excursions: TrendExcursion[] = [...trendAnalysis.excursions];
  
  for (const catData of byCategory) {
    const threshold = ractThresholds.find(t => t.category === catData.category)
      || ractThresholds.find(t => t.category === "default")!;
    
    if (catData.rate >= threshold.actionThreshold) {
      excursions.push({
        period: reportingPeriod.start + " to " + reportingPeriod.end,
        observedRate: catData.rate,
        threshold: threshold.actionThreshold,
        excursionType: "RACT_ACTION",
        significance: `Category "${catData.category}" exceeds action threshold`,
      });
    } else if (catData.rate >= threshold.warningThreshold) {
      excursions.push({
        period: reportingPeriod.start + " to " + reportingPeriod.end,
        observedRate: catData.rate,
        threshold: threshold.warningThreshold,
        excursionType: "RACT_WARNING",
        significance: `Category "${catData.category}" exceeds warning threshold`,
      });
    }
  }
  
  // -------------------------------------------------------------------------
  // DETERMINATION: Article 88 Trend Reporting
  // -------------------------------------------------------------------------
  const article88Required = trendAnalysis.isStatisticallySignificant ||
    excursions.some(e => e.excursionType === "UCL_BREACH" || e.excursionType === "RACT_ACTION");
  
  let article88Justification: string;
  if (article88Required) {
    const reasons: string[] = [];
    if (trendAnalysis.isStatisticallySignificant) {
      reasons.push("statistically significant increasing trend detected");
    }
    if (excursions.some(e => e.excursionType === "UCL_BREACH")) {
      reasons.push("complaint rate exceeded 3-sigma upper control limit");
    }
    if (excursions.some(e => e.excursionType === "RACT_ACTION")) {
      reasons.push("complaint rate exceeded RACT action threshold");
    }
    article88Justification = `Article 88 trend reporting IS REQUIRED. Reasons: ${reasons.join("; ")}.`;
  } else {
    article88Justification = "Article 88 trend reporting is NOT required. No statistically significant trends or threshold excursions were identified.";
  }
  
  // -------------------------------------------------------------------------
  // CALCULATION 8: Confirmed / Unconfirmed Tiered Rates
  // -------------------------------------------------------------------------
  const confirmed = complaintsInPeriod.filter(c =>
    c.complaintConfirmed?.toLowerCase() === "yes"
  );
  const externalCause = complaintsInPeriod.filter(c => isExternalCause(c));
  const unconfirmed = complaintsInPeriod.filter(c =>
    c.complaintConfirmed?.toLowerCase() !== "yes" && !isExternalCause(c)
  );

  const confirmedRate = unitsSoldInPeriod > 0
    ? (confirmed.length / unitsSoldInPeriod) * 1000
    : 0;
  const unconfirmedRate = unitsSoldInPeriod > 0
    ? (unconfirmed.length / unitsSoldInPeriod) * 1000
    : 0;
  const externalCauseRate = unitsSoldInPeriod > 0
    ? (externalCause.length / unitsSoldInPeriod) * 1000
    : 0;

  calculationLog.push({
    calculationId: "CALC_CONFIRMED_RATE",
    formula: "(confirmed_complaints / units_sold) × 1000",
    inputs: { confirmed_complaints: confirmed.length, units_sold: unitsSoldInPeriod },
    output: confirmedRate,
    outputUnit: "per_1000_units",
    evidenceAtomIds: confirmed.map(c => c.atomId),
    timestamp: new Date().toISOString(),
  });

  const confirmedMetrics: ConfirmedComplaintMetrics = {
    confirmedComplaints: confirmed.length,
    confirmedRate,
    unconfirmedComplaints: unconfirmed.length,
    unconfirmedRate,
    externalCauseComplaints: externalCause.length,
    externalCauseRate,
    combinedRate: complaintRate,
    confirmedPercentage: totalComplaints > 0 ? (confirmed.length / totalComplaints) * 100 : 0,
    unconfirmedPercentage: totalComplaints > 0 ? (unconfirmed.length / totalComplaints) * 100 : 0,
    externalCausePercentage: totalComplaints > 0 ? (externalCause.length / totalComplaints) * 100 : 0,
  };

  // -------------------------------------------------------------------------
  // BUILD OUTPUT TABLES
  // -------------------------------------------------------------------------
  const complaintsByCategory = buildComplaintsByCategoryTable(byCategory, allEvidenceAtomIds);
  const complaintsByHarm = buildComplaintsByHarmTable(byHarm, allEvidenceAtomIds);
  const complaintRatesTable = buildComplaintRatesTable(
    totalComplaints,
    totalDeviceRelated,
    unitsSoldInPeriod,
    complaintRate,
    allEvidenceAtomIds
  );
  const complaintTrends = buildComplaintTrendsTable(trendAnalysis, allEvidenceAtomIds);
  const uclAnalysisTable = buildUCLAnalysisTable(trendAnalysis, excursions, allEvidenceAtomIds);
  const confirmedTable = buildConfirmedUnconfirmedTable(confirmedMetrics, unitsSoldInPeriod, allEvidenceAtomIds);

  return {
    success: errors.length === 0,
    errors,
    complaintsByCategory,
    complaintsByHarm,
    complaintRates: complaintRatesTable,
    complaintTrends,
    uclAnalysis: uclAnalysisTable,
    confirmedUnconfirmedBreakdown: confirmedTable,
    metrics: {
      totalComplaints,
      totalDeviceRelated,
      totalPatientInjury,
      complaintRate,
      complaintRateUnit: "per_1000_units",
      byCategory,
      byHarm,
      bySeverity,
    },
    confirmedMetrics,
    trendAnalysis,
    article88Required,
    article88Justification,
    allEvidenceAtomIds,
    calculationLog,
  };
}

// ============================================================================
// TREND ANALYSIS WITH UCL (3-SIGMA RULE)
// ============================================================================

function computeTrendAnalysis(
  complaints: ComplaintEvidenceAtom[],
  unitsSoldInPeriod: number,
  reportingPeriod: ReportingPeriod,
  historicalData: TrendDataPoint[] | undefined,
  calculationLog: CalculationLogEntry[]
): TrendAnalysisResult {
  // Group complaints by month
  const monthlyMap = new Map<string, { count: number; atomIds: string[] }>();
  
  for (const c of complaints) {
    const date = new Date(c.complaintDate);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const existing = monthlyMap.get(monthKey) || { count: 0, atomIds: [] };
    existing.count++;
    existing.atomIds.push(c.atomId);
    monthlyMap.set(monthKey, existing);
  }
  
  // Build data points
  const dataPoints: TrendDataPoint[] = [];
  const startDate = new Date(reportingPeriod.start);
  const endDate = new Date(reportingPeriod.end);
  
  // Estimate monthly units (simple division)
  const months = Math.max(1, monthsBetween(startDate, endDate));
  const monthlyUnitEstimate = unitsSoldInPeriod / months;
  
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (current <= endDate) {
    const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    const data = monthlyMap.get(monthKey) || { count: 0, atomIds: [] };
    const rate = monthlyUnitEstimate > 0 ? (data.count / monthlyUnitEstimate) * 1000 : 0;
    
    dataPoints.push({
      period: monthKey,
      count: data.count,
      rate,
      unitsSold: monthlyUnitEstimate,
      evidenceAtomIds: data.atomIds,
    });
    
    current.setMonth(current.getMonth() + 1);
  }
  
  // Include historical data if provided
  const allDataPoints = historicalData ? [...historicalData, ...dataPoints] : dataPoints;
  
  // Calculate statistics
  const rates = allDataPoints.map(d => d.rate);
  const mean = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  
  const variance = rates.length > 1
    ? rates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (rates.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  
  // UCL and LCL (3-sigma)
  const ucl = mean + (3 * stdDev);
  const lcl = Math.max(0, mean - (3 * stdDev));
  
  calculationLog.push({
    calculationId: "CALC_UCL",
    formula: CALCULATION_FORMULAS.UCL_3SIGMA,
    inputs: { mean, stddev: stdDev },
    output: ucl,
    outputUnit: "rate",
    evidenceAtomIds: complaints.map(c => c.atomId),
    timestamp: new Date().toISOString(),
  });
  
  calculationLog.push({
    calculationId: "CALC_LCL",
    formula: CALCULATION_FORMULAS.LCL_3SIGMA,
    inputs: { mean, stddev: stdDev },
    output: lcl,
    outputUnit: "rate",
    evidenceAtomIds: complaints.map(c => c.atomId),
    timestamp: new Date().toISOString(),
  });
  
  // Calculate trend slope (linear regression)
  const slope = calculateSlope(allDataPoints.map((d, i) => ({ x: i, y: d.rate })));
  const isIncreasing = slope > 0;
  
  calculationLog.push({
    calculationId: "CALC_TREND_SLOPE",
    formula: CALCULATION_FORMULAS.TREND_SLOPE,
    inputs: { dataPoints: allDataPoints.length },
    output: slope,
    outputUnit: "rate_change_per_period",
    evidenceAtomIds: complaints.map(c => c.atomId),
    timestamp: new Date().toISOString(),
  });
  
  // Check for excursions
  const excursions: TrendExcursion[] = [];
  for (const dp of dataPoints) {
    if (dp.rate > ucl) {
      excursions.push({
        period: dp.period,
        observedRate: dp.rate,
        threshold: ucl,
        excursionType: "UCL_BREACH",
        significance: `Rate ${dp.rate.toFixed(2)} exceeded UCL ${ucl.toFixed(2)}`,
      });
    }
  }
  
  // Determine statistical significance
  // Significant if: slope > 0 AND (last 3 points above mean OR UCL breach)
  const lastThree = dataPoints.slice(-3);
  const lastThreeAboveMean = lastThree.every(d => d.rate > mean);
  const isStatisticallySignificant = (isIncreasing && lastThreeAboveMean) || excursions.length > 0;
  
  return {
    dataPoints,
    mean,
    stdDev,
    ucl,
    lcl,
    slope,
    isIncreasing,
    isStatisticallySignificant,
    excursions,
  };
}

function calculateSlope(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;
  
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return 0;
  
  return (n * sumXY - sumX * sumY) / denominator;
}

function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
}

function isWithinPeriod(dateStr: string, period: ReportingPeriod): boolean {
  const date = new Date(dateStr);
  return date >= new Date(period.start) && date <= new Date(period.end);
}

// ============================================================================
// TABLE BUILDERS
// ============================================================================

function buildComplaintsByCategoryTable(
  byCategory: CategoryBreakdown[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_complaints_by_category", evidenceAtomIds);
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Category", format: "text" },
        { value: "Count", format: "number" },
        { value: "Percentage", format: "percentage" },
        { value: "Rate (per 1000)", format: "number" },
      ],
    },
  ];
  
  for (const cat of byCategory) {
    rows.push({
      rowId: `cat_${cat.category}`,
      cells: [
        { value: cat.category, format: "text" },
        { value: cat.count, format: "number" },
        { value: cat.percentage, format: "percentage", precision: 1 },
        { value: cat.rate, format: "number", precision: 2 },
      ],
    });
  }
  
  const total = byCategory.reduce((s, c) => s + c.count, 0);
  rows.push({
    rowId: "total",
    isTotal: true,
    cells: [
      { value: "TOTAL", format: "text" },
      { value: total, format: "number" },
      { value: 100, format: "percentage" },
      { value: null, format: "text" },
    ],
  });
  
  return {
    tableId: "TABLE_COMPLAINTS_BY_CATEGORY",
    title: "Complaints by Category",
    columns: ["Category", "Count", "Percentage", "Rate (per 1000)"],
    rows,
    traceRef,
    calculationFormula: CALCULATION_FORMULAS.COMPLAINT_RATE,
  };
}

function buildComplaintsByHarmTable(
  byHarm: HarmBreakdown[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_complaints_by_harm", evidenceAtomIds);
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Harm Level (ISO 14971)", format: "text" },
        { value: "Count", format: "number" },
        { value: "Percentage", format: "percentage" },
      ],
    },
  ];
  
  for (const harm of byHarm) {
    rows.push({
      rowId: `harm_${harm.harmLevel}`,
      cells: [
        { value: harm.harmLevel, format: "text" },
        { value: harm.count, format: "number" },
        { value: harm.percentage, format: "percentage", precision: 1 },
      ],
    });
  }
  
  return {
    tableId: "TABLE_COMPLAINTS_BY_HARM",
    title: "Complaints by Patient Harm Level",
    columns: ["Harm Level (ISO 14971)", "Count", "Percentage"],
    rows,
    footnotes: ["Harm levels per ISO 14971 classification"],
    traceRef,
  };
}

function buildComplaintRatesTable(
  total: number,
  deviceRelated: number,
  unitsSold: number,
  rate: number,
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_complaint_rates", evidenceAtomIds, {
    calculationId: "CALC_COMPLAINT_RATE",
  });
  
  const deviceRelatedRate = unitsSold > 0 ? (deviceRelated / unitsSold) * 1000 : 0;
  
  return {
    tableId: "TABLE_COMPLAINT_RATES",
    title: "Complaint Rates",
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
        rowId: "total_complaints",
        cells: [
          { value: "Total Complaints", format: "text" },
          { value: total, format: "number" },
        ],
      },
      {
        rowId: "device_related",
        cells: [
          { value: "Device-Related Complaints", format: "text" },
          { value: deviceRelated, format: "number" },
        ],
      },
      {
        rowId: "units_sold",
        cells: [
          { value: "Units Sold (Denominator)", format: "text" },
          { value: unitsSold, format: "number" },
        ],
      },
      {
        rowId: "overall_rate",
        cells: [
          { value: "Overall Complaint Rate (per 1,000 units)", format: "text" },
          { value: rate.toFixed(2), format: "text" },
        ],
      },
      {
        rowId: "device_related_rate",
        cells: [
          { value: "Device-Related Rate (per 1,000 units)", format: "text" },
          { value: deviceRelatedRate.toFixed(2), format: "text" },
        ],
      },
    ],
    footnotes: [`Formula: ${CALCULATION_FORMULAS.COMPLAINT_RATE}`],
    traceRef,
    calculationFormula: CALCULATION_FORMULAS.COMPLAINT_RATE,
  };
}

function buildComplaintTrendsTable(
  trend: TrendAnalysisResult,
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_complaint_trends", evidenceAtomIds, {
    calculationId: "CALC_TREND_SLOPE",
  });
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Period", format: "text" },
        { value: "Complaints", format: "number" },
        { value: "Rate (per 1000)", format: "number" },
        { value: "Status", format: "text" },
      ],
    },
  ];
  
  for (const dp of trend.dataPoints) {
    const status = dp.rate > trend.ucl ? "ABOVE UCL" : dp.rate < trend.lcl ? "BELOW LCL" : "NORMAL";
    rows.push({
      rowId: `period_${dp.period}`,
      cells: [
        { value: dp.period, format: "text" },
        { value: dp.count, format: "number" },
        { value: dp.rate, format: "number", precision: 2 },
        { value: status, format: "text" },
      ],
    });
  }
  
  return {
    tableId: "TABLE_COMPLAINT_TRENDS",
    title: "Monthly Complaint Trends",
    columns: ["Period", "Complaints", "Rate (per 1000)", "Status"],
    rows,
    footnotes: [
      `Mean rate: ${trend.mean.toFixed(2)}`,
      `Standard deviation: ${trend.stdDev.toFixed(2)}`,
      `Trend slope: ${trend.slope.toFixed(4)} (${trend.isIncreasing ? "increasing" : "decreasing"})`,
    ],
    traceRef,
  };
}

function buildUCLAnalysisTable(
  trend: TrendAnalysisResult,
  excursions: TrendExcursion[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_ucl_analysis", evidenceAtomIds, {
    calculationId: "CALC_UCL",
  });
  
  return {
    tableId: "TABLE_UCL_ANALYSIS",
    title: "Statistical Process Control Analysis",
    columns: ["Parameter", "Value"],
    rows: [
      {
        rowId: "header",
        isHeader: true,
        cells: [
          { value: "Parameter", format: "text" },
          { value: "Value", format: "text" },
        ],
      },
      {
        rowId: "mean",
        cells: [
          { value: "Mean Rate", format: "text" },
          { value: trend.mean.toFixed(4), format: "text" },
        ],
      },
      {
        rowId: "stddev",
        cells: [
          { value: "Standard Deviation", format: "text" },
          { value: trend.stdDev.toFixed(4), format: "text" },
        ],
      },
      {
        rowId: "ucl",
        cells: [
          { value: "Upper Control Limit (3σ)", format: "text" },
          { value: trend.ucl.toFixed(4), format: "text" },
        ],
      },
      {
        rowId: "lcl",
        cells: [
          { value: "Lower Control Limit (3σ)", format: "text" },
          { value: trend.lcl.toFixed(4), format: "text" },
        ],
      },
      {
        rowId: "excursions",
        cells: [
          { value: "UCL Excursions Detected", format: "text" },
          { value: excursions.filter(e => e.excursionType === "UCL_BREACH").length, format: "number" },
        ],
      },
      {
        rowId: "significance",
        cells: [
          { value: "Statistically Significant Trend", format: "text" },
          { value: trend.isStatisticallySignificant ? "YES" : "NO", format: "text" },
        ],
      },
    ],
    footnotes: [
      `Formula: ${CALCULATION_FORMULAS.UCL_3SIGMA}`,
      "UCL breach indicates rate exceeded 3 standard deviations above mean",
    ],
    traceRef,
    calculationFormula: CALCULATION_FORMULAS.UCL_3SIGMA,
  };
}

// ============================================================================
// CONFIRMED / UNCONFIRMED HELPERS
// ============================================================================

function isExternalCause(complaint: ComplaintEvidenceAtom): boolean {
  const findings = (complaint.investigationFindings || "").toLowerCase();
  const corrective = (complaint.correctiveActions || "").toLowerCase();
  const rootCause = (complaint.rootCause || "").toLowerCase();

  return (
    findings.includes("damage incurred in transit") ||
    findings.includes("shipping damage") ||
    findings.includes("damaged during shipping") ||
    corrective.includes("user error") ||
    corrective.includes("handling error") ||
    rootCause.includes("shipping") ||
    rootCause.includes("user error") ||
    rootCause.includes("external cause")
  );
}

function buildConfirmedUnconfirmedTable(
  cm: ConfirmedComplaintMetrics,
  unitsSold: number,
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_confirmed_unconfirmed", evidenceAtomIds, {
    calculationId: "CALC_CONFIRMED_RATE",
  });
  const total = cm.confirmedComplaints + cm.unconfirmedComplaints + cm.externalCauseComplaints;

  return {
    tableId: "TABLE_CONFIRMED_UNCONFIRMED_BREAKDOWN",
    title: "Complaint Confirmation Status Breakdown",
    columns: ["Classification", "Count", "Percentage", "Rate (per 1,000 units)"],
    rows: [
      {
        rowId: "header",
        isHeader: true,
        cells: [
          { value: "Classification", format: "text" },
          { value: "Count", format: "number" },
          { value: "Percentage", format: "percentage" },
          { value: "Rate (per 1,000 units)", format: "number" },
        ],
      },
      {
        rowId: "confirmed",
        cells: [
          { value: "Confirmed Product Defects", format: "text" },
          { value: cm.confirmedComplaints, format: "number" },
          { value: cm.confirmedPercentage, format: "percentage", precision: 1 },
          { value: cm.confirmedRate, format: "number", precision: 4 },
        ],
      },
      {
        rowId: "unconfirmed",
        cells: [
          { value: "Unconfirmed (Inconclusive Investigation)", format: "text" },
          { value: cm.unconfirmedComplaints, format: "number" },
          { value: cm.unconfirmedPercentage, format: "percentage", precision: 1 },
          { value: cm.unconfirmedRate, format: "number", precision: 4 },
        ],
      },
      {
        rowId: "external_cause",
        cells: [
          { value: "External Cause (Shipping/User Error)", format: "text" },
          { value: cm.externalCauseComplaints, format: "number" },
          { value: cm.externalCausePercentage, format: "percentage", precision: 1 },
          { value: cm.externalCauseRate, format: "number", precision: 4 },
        ],
      },
      {
        rowId: "total",
        isTotal: true,
        cells: [
          { value: "TOTAL (Combined)", format: "text" },
          { value: total, format: "number" },
          { value: 100, format: "percentage" },
          { value: cm.combinedRate, format: "number", precision: 4 },
        ],
      },
    ],
    footnotes: [
      "Confirmed = investigation verified product defect",
      "Unconfirmed = product not returned or unable to replicate",
      "External = shipping damage, user error, or other non-product cause",
      `Denominator: ${unitsSold.toLocaleString()} units sold in period`,
    ],
    traceRef,
  };
}

// ============================================================================
// NARRATIVE GENERATION
// ============================================================================

export function getComplaintNarrativeBlocks(result: ComplaintAnalysisResult): string[] {
  const blocks: string[] = [];

  if (result.metrics.totalComplaints === 0) {
    blocks.push("No complaints were received during the reporting period.");
    return blocks;
  }

  blocks.push(
    `During the reporting period, ${result.metrics.totalComplaints} complaints were received, ` +
    `of which ${result.metrics.totalDeviceRelated} (${((result.metrics.totalDeviceRelated / result.metrics.totalComplaints) * 100).toFixed(1)}%) were determined to be device-related. ` +
    `The combined complaint rate is ${result.metrics.complaintRate.toFixed(2)} per 1,000 units sold.`
  );

  // Confirmed/unconfirmed breakdown
  const cm = result.confirmedMetrics;
  if (cm.confirmedComplaints > 0 || cm.unconfirmedComplaints > 0) {
    blocks.push(
      `Of these, ${cm.confirmedComplaints} (${cm.confirmedPercentage.toFixed(1)}%) were CONFIRMED as product defects ` +
      `through investigation, yielding a confirmed product defect rate of ${cm.confirmedRate.toFixed(4)} per 1,000 units. ` +
      `The remaining ${cm.unconfirmedComplaints + cm.externalCauseComplaints} complaints (${(cm.unconfirmedPercentage + cm.externalCausePercentage).toFixed(1)}%) ` +
      `could not be verified as product-related issues` +
      (cm.externalCauseComplaints > 0
        ? `, including ${cm.externalCauseComplaints} attributed to external causes (shipping damage or user error).`
        : ".")
    );
  }

  if (result.metrics.byCategory.length > 0) {
    const topCategory = result.metrics.byCategory[0];
    blocks.push(
      `The most common complaint category is "${topCategory.category}" with ${topCategory.count} complaints ` +
      `(${topCategory.percentage.toFixed(1)}% of total).`
    );
  }

  if (result.trendAnalysis.isStatisticallySignificant) {
    blocks.push(
      `A statistically significant ${result.trendAnalysis.isIncreasing ? "increasing" : "decreasing"} trend ` +
      `has been identified in complaint rates.`
    );
  } else {
    blocks.push("No statistically significant trends have been identified in complaint rates.");
  }

  blocks.push(result.article88Justification);

  return blocks;
}
