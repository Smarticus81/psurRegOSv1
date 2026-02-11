/**
 * SEGMENTATION ENGINE
 *
 * Multi-dimensional segmentation analysis for complaints:
 * - By Region (geographic clustering)
 * - By Product (catalog/product number)
 * - By Lot (manufacturing batch — critical for quality signals)
 * - By Quarter (temporal clustering)
 *
 * Generates alerts when segments exceed expected baseline rates.
 *
 * Per MDCG 2022-21 Section 5.3: Manufacturers should identify trends by
 * analyzing data across multiple dimensions to detect emerging safety signals.
 */

import type {
  PSURTable,
  TableRow,
} from "../psurContract";
import { createTraceReference } from "../psurContract";
import type { ComplaintEvidenceAtom } from "./complaintEngine";
import type { SalesEvidenceAtom } from "./salesExposureEngine";

// ============================================================================
// TYPES
// ============================================================================

export interface SegmentedComplaintAnalysis {
  success: boolean;
  errors: string[];

  byRegion: SegmentMetrics[];
  byProduct: SegmentMetrics[];
  byLot: SegmentMetrics[];
  byQuarter: SegmentMetrics[];

  /** Segments that exceed alert thresholds */
  significantSegments: SegmentAlert[];

  /** Summary table for PSUR insertion */
  segmentationTable: PSURTable;

  allEvidenceAtomIds: string[];
}

export interface SegmentMetrics {
  segmentType: "region" | "product" | "lot" | "quarter";
  segmentId: string;
  complaintCount: number;
  confirmedCount: number;
  salesCount: number;
  complaintRate: number;
  confirmedRate: number;
  expectedRate: number;
  rateRatio: number;
}

export interface SegmentAlert {
  segmentType: "region" | "product" | "lot" | "quarter";
  segmentId: string;
  metrics: SegmentMetrics;
  alertReason: string;
  recommendedAction: string;
}

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export function computeSegmentationAnalysis(
  complaints: ComplaintEvidenceAtom[],
  sales: SalesEvidenceAtom[],
  expectedRateBaseline: number
): SegmentedComplaintAnalysis {
  const errors: string[] = [];
  const allAtomIds = complaints.map(c => c.atomId);
  const significantSegments: SegmentAlert[] = [];

  if (complaints.length === 0 && sales.length === 0) {
    return emptyResult(allAtomIds);
  }

  // Total sales for fallback rate calculations
  const totalSales = sales.reduce((sum, s) => sum + s.quantity, 0);

  // ── Region Segmentation ──
  const regionMap = groupBy(sales, s => s.country || s.region || "Unknown");
  const byRegion: SegmentMetrics[] = [];

  for (const [region, regionSales] of Array.from(regionMap)) {
    const regionUnitsSold = regionSales.reduce((sum, s) => sum + s.quantity, 0);
    const regionComplaints = complaints.filter(c =>
      (c.country || "").toLowerCase() === region.toLowerCase()
    );
    const m = calcMetrics("region", region, regionComplaints, regionUnitsSold, expectedRateBaseline);
    byRegion.push(m);

    if (m.rateRatio > 2.0 && regionComplaints.length >= 3) {
      significantSegments.push({
        segmentType: "region",
        segmentId: region,
        metrics: m,
        alertReason: `Complaint rate (${m.complaintRate.toFixed(2)} per 1,000) is ${m.rateRatio.toFixed(1)}x higher than expected (${expectedRateBaseline.toFixed(2)} per 1,000)`,
        recommendedAction: "Review regional distribution, storage, training, or usage patterns",
      });
    }
  }
  byRegion.sort((a, b) => b.complaintCount - a.complaintCount);

  // ── Product Segmentation ──
  const productSalesMap = groupBy(sales, s => s.productName || s.deviceCode || "Unknown");
  const byProduct: SegmentMetrics[] = [];

  for (const [product, productSales] of Array.from(productSalesMap)) {
    const productUnitsSold = productSales.reduce((sum, s) => sum + s.quantity, 0);
    const productComplaints = complaints.filter(c =>
      (c.productNumber || c.deviceCode || "").toLowerCase() === product.toLowerCase()
    );
    const m = calcMetrics("product", product, productComplaints, productUnitsSold, expectedRateBaseline);
    byProduct.push(m);

    if (m.rateRatio > 2.0 && productComplaints.length >= 3) {
      significantSegments.push({
        segmentType: "product",
        segmentId: product,
        metrics: m,
        alertReason: `Product ${product} has elevated complaint rate (${m.rateRatio.toFixed(1)}x expected)`,
        recommendedAction: "Initiate product-specific investigation. Review DHR and incoming inspection records.",
      });
    }
  }
  byProduct.sort((a, b) => b.complaintCount - a.complaintCount);

  // ── Lot Segmentation ──
  const lotsWithComplaints = Array.from(
    new Set(complaints.map(c => c.lotNumber).filter(Boolean))
  ) as string[];
  const byLot: SegmentMetrics[] = [];

  for (const lot of lotsWithComplaints) {
    const lotComplaints = complaints.filter(c => c.lotNumber === lot);
    // Estimate lot sales from sales data if lot info available, otherwise use total/lot count
    const lotSalesAtoms = sales.filter(s =>
      (s as unknown as Record<string, unknown>).lotNumber === lot ||
      (s as unknown as Record<string, unknown>).lot_number === lot
    );
    const lotUnitsSold = lotSalesAtoms.length > 0
      ? lotSalesAtoms.reduce((sum, s) => sum + s.quantity, 0)
      : totalSales > 0 ? Math.round(totalSales / Math.max(lotsWithComplaints.length, 1)) : 0;

    if (lotUnitsSold > 0) {
      const m = calcMetrics("lot", lot, lotComplaints, lotUnitsSold, expectedRateBaseline);
      byLot.push(m);

      // Alert if >1 complaint from same lot (potential manufacturing defect)
      if (lotComplaints.length > 1) {
        significantSegments.push({
          segmentType: "lot",
          segmentId: lot,
          metrics: m,
          alertReason: `Multiple complaints (${lotComplaints.length}) from single lot`,
          recommendedAction: "URGENT: Quarantine remaining lot inventory. Perform DHR review and dimensional/functional testing on retained samples.",
        });
      }
    }
  }
  byLot.sort((a, b) => b.complaintCount - a.complaintCount);

  // ── Quarter Segmentation ──
  const byQuarter: SegmentMetrics[] = [];
  const quarterMap = new Map<string, ComplaintEvidenceAtom[]>();

  for (const c of complaints) {
    const d = new Date(c.complaintDate);
    if (isNaN(d.getTime())) continue;
    const q = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    const existing = quarterMap.get(q) || [];
    existing.push(c);
    quarterMap.set(q, existing);
  }

  const quartersEstSales = totalSales / Math.max(quarterMap.size, 1);
  for (const [quarter, qComplaints] of Array.from(quarterMap)) {
    const m = calcMetrics("quarter", quarter, qComplaints, quartersEstSales, expectedRateBaseline);
    byQuarter.push(m);
  }
  byQuarter.sort((a, b) => a.segmentId.localeCompare(b.segmentId));

  // ── Build summary table ──
  const segmentationTable = buildSegmentationTable(
    byRegion, byProduct, byLot, significantSegments, allAtomIds
  );

  return {
    success: errors.length === 0,
    errors,
    byRegion,
    byProduct,
    byLot,
    byQuarter,
    significantSegments,
    segmentationTable,
    allEvidenceAtomIds: allAtomIds,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function calcMetrics(
  segmentType: SegmentMetrics["segmentType"],
  segmentId: string,
  complaints: ComplaintEvidenceAtom[],
  sales: number,
  expectedRate: number
): SegmentMetrics {
  const confirmed = complaints.filter(c =>
    c.complaintConfirmed?.toLowerCase() === "yes"
  );
  const complaintRate = sales > 0 ? (complaints.length / sales) * 1000 : 0;
  const confirmedRate = sales > 0 ? (confirmed.length / sales) * 1000 : 0;
  const rateRatio = expectedRate > 0 ? complaintRate / expectedRate : 0;

  return {
    segmentType,
    segmentId,
    complaintCount: complaints.length,
    confirmedCount: confirmed.length,
    salesCount: sales,
    complaintRate,
    confirmedRate,
    expectedRate,
    rateRatio,
  };
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const existing = map.get(key) || [];
    existing.push(item);
    map.set(key, existing);
  }
  return map;
}

function emptyResult(atomIds: string[]): SegmentedComplaintAnalysis {
  const traceRef = createTraceReference("table_segmentation", atomIds);
  return {
    success: true,
    errors: [],
    byRegion: [],
    byProduct: [],
    byLot: [],
    byQuarter: [],
    significantSegments: [],
    segmentationTable: {
      tableId: "TABLE_SEGMENTATION_ANALYSIS",
      title: "Complaint Segmentation Analysis",
      columns: ["Segment", "Complaints", "Sales", "Rate", "Expected", "Ratio", "Alert"],
      rows: [
        {
          rowId: "header",
          isHeader: true,
          cells: [
            { value: "Segment", format: "text" },
            { value: "Complaints", format: "number" },
            { value: "Sales", format: "number" },
            { value: "Rate (per 1,000)", format: "number" },
            { value: "Expected (per 1,000)", format: "number" },
            { value: "Ratio", format: "number" },
            { value: "Alert", format: "text" },
          ],
        },
        {
          rowId: "no_data",
          cells: [
            { value: "No data available", format: "text" },
            { value: 0, format: "number" },
            { value: 0, format: "number" },
            { value: 0, format: "number" },
            { value: 0, format: "number" },
            { value: 0, format: "number" },
            { value: "-", format: "text" },
          ],
        },
      ],
      traceRef,
    },
    allEvidenceAtomIds: atomIds,
  };
}

function buildSegmentationTable(
  byRegion: SegmentMetrics[],
  byProduct: SegmentMetrics[],
  byLot: SegmentMetrics[],
  alerts: SegmentAlert[],
  atomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_segmentation", atomIds);
  const alertIds = new Set(alerts.map(a => `${a.segmentType}_${a.segmentId}`));

  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Segment", format: "text" },
        { value: "Complaints", format: "number" },
        { value: "Sales", format: "number" },
        { value: "Rate (per 1,000)", format: "number" },
        { value: "Expected (per 1,000)", format: "number" },
        { value: "Ratio", format: "number" },
        { value: "Alert", format: "text" },
      ],
    },
  ];

  // Region section
  if (byRegion.length > 0) {
    rows.push({
      rowId: "region_header",
      cells: [
        { value: "BY REGION", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
      ],
    });
    for (const m of byRegion) {
      const hasAlert = alertIds.has(`region_${m.segmentId}`);
      rows.push(segmentRow(`region_${m.segmentId}`, m.segmentId, m, hasAlert));
    }
  }

  // Product section
  if (byProduct.length > 0) {
    rows.push({
      rowId: "product_header",
      cells: [
        { value: "BY PRODUCT", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
      ],
    });
    for (const m of byProduct) {
      const hasAlert = alertIds.has(`product_${m.segmentId}`);
      rows.push(segmentRow(`product_${m.segmentId}`, m.segmentId, m, hasAlert));
    }
  }

  // Lot section (only lots with >1 complaint)
  const significantLots = byLot.filter(l => l.complaintCount > 1);
  if (significantLots.length > 0) {
    rows.push({
      rowId: "lot_header",
      cells: [
        { value: "BY LOT (>1 complaint)", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
        { value: "", format: "text" },
      ],
    });
    for (const m of significantLots) {
      rows.push(segmentRow(`lot_${m.segmentId}`, m.segmentId, m, true));
    }
  }

  return {
    tableId: "TABLE_SEGMENTATION_ANALYSIS",
    title: "Complaint Segmentation Analysis",
    columns: ["Segment", "Complaints", "Sales", "Rate (per 1,000)", "Expected (per 1,000)", "Ratio", "Alert"],
    rows,
    footnotes: [
      "Rate Ratio = Observed Rate / Expected Baseline Rate",
      "Alert triggered when ratio > 2.0 with >= 3 complaints, or > 1 complaint from single lot",
    ],
    traceRef,
  };
}

function segmentRow(rowId: string, label: string, m: SegmentMetrics, hasAlert: boolean): TableRow {
  return {
    rowId,
    cells: [
      { value: label, format: "text" },
      { value: m.complaintCount, format: "number" },
      { value: m.salesCount, format: "number" },
      { value: m.complaintRate, format: "number", precision: 2 },
      { value: m.expectedRate, format: "number", precision: 2 },
      { value: m.rateRatio, format: "number", precision: 2 },
      { value: hasAlert ? "⚠" : "-", format: "text" },
    ],
  };
}
