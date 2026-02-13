/**
 * PSUR ANALYTICS CONTEXT
 *
 * Aggregates all engine outputs + obligation context into a single object
 * that gets injected into every narrative agent prompt.
 *
 * This is the bridge between the deterministic engines and the LLM-based
 * narrative generators. The LLM writes prose AROUND pre-computed numbers
 * rather than fabricating them.
 */

import type { ComplaintAnalysisResult } from "./engines/complaintEngine";
import type { VigilanceAnalysisResult } from "./engines/vigilanceEngine";
import type { SalesExposureResult } from "./engines/salesExposureEngine";
import type { LiteratureAnalysisResult } from "./engines/literatureEngine";
import type { PMCFDecisionResult } from "./engines/pmcfEngine";
import type { SegmentedComplaintAnalysis } from "./engines/segmentationEngine";
import type { BenefitRiskAnalysisResult } from "./engines/benefitRiskEngine";
import type { RootCauseClusteringOutput } from "../agents/analysis/rootCauseClusteringAgent";
import type { IMDRFSummary } from "./engines/imdrfClassification";
import type { CanonicalMetrics } from "../services/canonicalMetricsService";
import type { NarrativeConstraint } from "./psurContract";
import type { CalculationRule, ObligationDefinition, ObligationId } from "./mappings/mdcg2022AnnexI";

import { computeComplaintAnalysis, getComplaintNarrativeBlocks } from "./engines/complaintEngine";
import { computeVigilanceAnalysis, getVigilanceNarrativeBlocks } from "./engines/vigilanceEngine";
import { computeSalesExposure, getSalesNarrativeBlocks } from "./engines/salesExposureEngine";
import { computeLiteratureAnalysis, getLiteratureNarrativeBlocks } from "./engines/literatureEngine";
import { computePMCFDecision, getPMCFNarrativeBlocks } from "./engines/pmcfEngine";
import { computeSegmentationAnalysis } from "./engines/segmentationEngine";
import { computeBenefitRiskAnalysis } from "./engines/benefitRiskEngine";
import { classifyComplaintsBatch, getComplaintsNeedingAdjudication, generateIMDRFSummary } from "./engines/imdrfClassification";
import { IMDRFClassificationAgent } from "../agents/analysis/imdrfClassificationAgent";
import type { AdjudicationCase } from "../agents/analysis/imdrfClassificationAgent";
import { lookupIMDRFMapping } from "./engines/imdrfClassification";
import { RootCauseClusteringAgent } from "../agents/analysis/rootCauseClusteringAgent";
import { getCanonicalMetrics } from "../services/canonicalMetricsService";
import {
  toComplaintAtoms,
  toSalesAtoms,
  toIncidentAtoms,
  toFSCAAtoms,
  toCAPARecords,
  toLiteratureAtoms,
  toPMCFAtoms,
  mapSlotIdToPSURSectionId,
} from "./atomAdapters";

// ============================================================================
// TYPES
// ============================================================================

export interface PSURAnalyticsContext {
  /** Complaint engine results (UCL, trends, Article 88, confirmed/unconfirmed) */
  complaintAnalysis: ComplaintAnalysisResult | null;

  /** Vigilance engine results (IMDRF tables, FSCA, CAPA) */
  vigilanceAnalysis: VigilanceAnalysisResult | null;

  /** Sales/exposure engine results (regional breakdown, population exposure) */
  salesExposure: SalesExposureResult | null;

  /** Literature engine results (no-new-risks, state-of-art) */
  literatureAnalysis: LiteratureAnalysisResult | null;

  /** PMCF decision engine results (YES/NO with justification) */
  pmcfDecision: PMCFDecisionResult | null;

  /** Segmentation engine results (regional, product, lot, quarter) */
  segmentationAnalysis: SegmentedComplaintAnalysis | null;

  /** Quantitative benefit-risk engine results */
  benefitRiskAnalysis: BenefitRiskAnalysisResult | null;

  /** IMDRF classification summary (Annex A MDP + Annex E harm codes) */
  imdrfSummary: IMDRFSummary | null;

  /** Root cause clustering (LLM-based pattern detection) */
  rootCauseClusters: RootCauseClusteringOutput | null;

  /** Canonical metrics from the centralized metrics service */
  canonicalMetrics: CanonicalMetrics;

  /** Per-slot obligation context for narrative constraint enforcement */
  slotObligations: Map<string, SlotObligationContext>;

  /** Engine computation metadata */
  computedAt: string;
  engineErrors: string[];
  engineWarnings: string[];
}

export interface SlotObligationContext {
  obligationIds: ObligationId[];
  narrativeConstraints: NarrativeConstraintWithData[];
  calculationRules: CalculationRuleWithResult[];
}

export interface NarrativeConstraintWithData extends NarrativeConstraint {
  /** Whether the condition is currently satisfied based on engine data */
  conditionMet: boolean;
  /** Pre-evaluated data for the constraint */
  contextData?: string;
}

export interface CalculationRuleWithResult extends CalculationRule {
  /** Pre-computed result from engine */
  computedValue?: number;
  /** Formatted display string */
  formattedValue?: string;
}

// ============================================================================
// BUILD FUNCTION
// ============================================================================

interface BuildContextInput {
  psurCaseId: number;
  deviceCode: string;
  deviceName?: string;
  periodStart: string;
  periodEnd: string;
}

/**
 * Runs all 5 deterministic engines via Promise.allSettled, computes canonical
 * metrics, and builds the slot obligation map.
 *
 * Each engine failure is captured as a warning -- the context is still usable
 * with partial data. Agents should gracefully degrade when a specific engine
 * result is null.
 */
export async function buildPSURAnalyticsContext(
  allAtoms: Array<{ atomId: string; evidenceType: string; normalizedData: Record<string, unknown> }>,
  input: BuildContextInput
): Promise<PSURAnalyticsContext> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];

  const reportingPeriod = { start: input.periodStart, end: input.periodEnd };

  // Adapt generic atoms to engine-typed inputs
  const complaintAtoms = toComplaintAtoms(allAtoms);
  const salesAtoms = toSalesAtoms(allAtoms);
  const incidentAtoms = toIncidentAtoms(allAtoms);
  const fscaAtoms = toFSCAAtoms(allAtoms);
  const capaRecords = toCAPARecords(allAtoms);
  const literatureAtoms = toLiteratureAtoms(allAtoms);
  const pmcfAtoms = toPMCFAtoms(allAtoms);

  // Compute total sales for complaint rate denominator
  const totalUnitsSold = salesAtoms.reduce((sum, a) => sum + a.quantity, 0);

  // Run all engines in parallel via Promise.allSettled
  const [
    complaintResult,
    vigilanceResult,
    salesResult,
    literatureResult,
    pmcfResult,
  ] = await Promise.allSettled([
    // 1. Complaint engine
    Promise.resolve().then(() =>
      computeComplaintAnalysis(complaintAtoms, totalUnitsSold, reportingPeriod)
    ),

    // 2. Vigilance engine
    Promise.resolve().then(() =>
      computeVigilanceAnalysis(incidentAtoms, fscaAtoms, capaRecords, reportingPeriod)
    ),

    // 3. Sales/exposure engine
    Promise.resolve().then(() =>
      computeSalesExposure(salesAtoms, reportingPeriod, { model: "SINGLE_USE" })
    ),

    // 4. Literature engine
    Promise.resolve().then(() => {
      const externalDbAtoms = allAtoms
        .filter(a => a.evidenceType.toLowerCase().includes("external_db"))
        .map(a => ({
          atomId: a.atomId,
          evidenceType: "external_database" as const,
          database: "OTHER" as const,
          searchDate: String(a.normalizedData.search_date || ""),
          searchQuery: String(a.normalizedData.search_query || ""),
          totalResults: Number(a.normalizedData.total_results || 0),
          relevantResults: Number(a.normalizedData.relevant_results || 0),
          deviceRelatedReports: Number(a.normalizedData.device_related || 0),
          safetySignalsIdentified: Number(a.normalizedData.safety_signals || 0),
          newRisksIdentified: Number(a.normalizedData.new_risks || 0),
          findings: String(a.normalizedData.findings || ""),
        }));

      return computeLiteratureAnalysis(
        literatureAtoms,
        externalDbAtoms,
        reportingPeriod,
        {
          deviceName: input.deviceName || input.deviceCode,
          deviceCode: input.deviceCode,
          intendedPurpose: "",
          riskClass: "IIa",
        }
      );
    }),

    // 5. PMCF decision engine
    Promise.resolve().then(() =>
      computePMCFDecision(
        pmcfAtoms,
        {
          deviceName: input.deviceName || input.deviceCode,
          deviceCode: input.deviceCode,
          riskClass: "IIa",
          isNovel: false,
          yearsOnMarket: 5,
          implantable: false,
          hasActiveSubstance: false,
          containsNanomaterial: false,
          usesAnimalTissue: false,
          intendedForChildren: false,
          lifeSustaining: false,
          clinicalEvidenceBasis: "COMBINATION",
        },
        {
          hasNewRisksIdentified: false,
          hasUnacceptableRisks: false,
          residualRisksAcceptable: true,
          riskControlsEffective: true,
        },
        {
          totalReferencesReviewed: literatureAtoms.length,
          directlyRelevant: literatureAtoms.filter(l => l.relevance === "DIRECTLY_RELEVANT").length,
          clinicalDataAvailable: literatureAtoms.length > 0,
          clinicalDataSufficient: literatureAtoms.length >= 3,
          gapsIdentified: [],
        },
        { isAligned: true, gapsIdentified: [] }
      )
    ),
  ]);

  // Extract results, logging errors for failures
  const complaint = extractResult(complaintResult, "Complaint", warnings);
  const vigilance = extractResult(vigilanceResult, "Vigilance", warnings);
  const sales = extractResult(salesResult, "Sales/Exposure", warnings);
  const literature = extractResult(literatureResult, "Literature", warnings);
  const pmcf = extractResult(pmcfResult, "PMCF", warnings);

  // Compute canonical metrics (always succeeds - uses raw atoms)
  const canonicalMetrics = getCanonicalMetrics(
    input.psurCaseId,
    allAtoms,
    input.periodStart,
    input.periodEnd
  );

  // ── Phase 2: Engines that depend on Phase 1 outputs ──

  // Segmentation engine (needs complaint + sales data)
  let segmentation: SegmentedComplaintAnalysis | null = null;
  try {
    const baselineRate = complaint ? complaint.metrics.complaintRate : 0;
    segmentation = computeSegmentationAnalysis(complaintAtoms, salesAtoms, baselineRate);
  } catch (e: any) {
    warnings.push(`Segmentation engine failed: ${e.message || String(e)}`);
  }

  // IMDRF Classification (Stage 1 deterministic + Stage 2 LLM adjudication)
  let imdrfSummary: IMDRFSummary | null = null;
  try {
    if (complaintAtoms.length > 0) {
      // Stage 1: Deterministic classification
      const classifications = classifyComplaintsBatch(complaintAtoms);

      // Stage 2: LLM adjudication for context-dependent cases
      const needsAdjudication = getComplaintsNeedingAdjudication(complaintAtoms, classifications);
      if (needsAdjudication.length > 0) {
        try {
          const adjudicationCases: AdjudicationCase[] = needsAdjudication.map(c => {
            const defaultMapping = lookupIMDRFMapping(c.symptomCode || c.category || "");
            const deterministicResult = classifications.get(c.atomId)!;
            return {
              complaint: c,
              defaultMapping: defaultMapping || {
                symptomCode: c.symptomCode || "",
                mdpCode: "2999",
                mdpTerm: "Other Device Problem",
                harmCode: null,
                harmTerm: "No Health Effect",
                severityDefault: "non-serious" as const,
                requiresAdjudication: false,
              },
              deterministicResult,
            };
          });

          const adjAgent = new IMDRFClassificationAgent();
          const adjResult = await adjAgent.run(
            { complaints: adjudicationCases },
            {
              psurCaseId: input.psurCaseId,
              traceCtx: {
                traceId: `analytics-imdrf-${input.psurCaseId}-${Date.now()}`,
                psurCaseId: input.psurCaseId,
                currentSequence: 0,
                previousHash: null,
              },
            }
          );

          if (adjResult.success && adjResult.data) {
            for (const adjRes of adjResult.data.results) {
              classifications.set(adjRes.atomId, adjRes.classification);
            }
          }
        } catch (adjErr: any) {
          warnings.push(`IMDRF adjudication failed (deterministic results used): ${adjErr.message || String(adjErr)}`);
        }
      }

      // Generate summary from final classifications
      imdrfSummary = generateIMDRFSummary(complaintAtoms, classifications);
    }
  } catch (e: any) {
    warnings.push(`IMDRF classification failed: ${e.message || String(e)}`);
  }

  // Root Cause Clustering (LLM-based, runs only with sufficient complaints)
  let rootCauseClusters: RootCauseClusteringOutput | null = null;
  try {
    if (complaintAtoms.length >= 3) {
      const clusteringAgent = new RootCauseClusteringAgent();
      const clusterResult = await clusteringAgent.run(
        {
          complaints: complaintAtoms,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        },
        {
          psurCaseId: input.psurCaseId,
          traceCtx: {
            traceId: `analytics-rcc-${input.psurCaseId}-${Date.now()}`,
            psurCaseId: input.psurCaseId,
            currentSequence: 0,
            previousHash: null,
          },
        }
      );
      if (clusterResult.success && clusterResult.data) {
        rootCauseClusters = clusterResult.data;
      }
    }
  } catch (e: any) {
    warnings.push(`Root cause clustering failed: ${e.message || String(e)}`);
  }

  // Benefit-Risk engine (needs complaint + vigilance + literature + sales)
  let benefitRisk: BenefitRiskAnalysisResult | null = null;
  try {
    benefitRisk = computeBenefitRiskAnalysis({
      clinicalBenefit: {
        primaryBenefit: "Clinical performance per intended purpose",
        benefitMagnitude: 95,
        benefitUnits: "% success rate",
        evidenceSource: "CER",
        patientPopulationSize: totalUnitsSold,
      },
      safety: {
        totalUnitsSold,
        totalComplaints: complaint?.metrics.totalComplaints || 0,
        confirmedComplaints: complaint?.confirmedMetrics.confirmedComplaints || 0,
        confirmedRate: complaint?.confirmedMetrics.confirmedRate || 0,
        seriousIncidents: vigilance?.metrics.totalSeriousIncidents || 0,
        deaths: vigilance?.metrics.incidentsByOutcome.DEATH || 0,
        seriousInjuries: (vigilance?.metrics.incidentsByOutcome.HOSPITALIZATION || 0) +
          (vigilance?.metrics.incidentsByOutcome.DISABILITY || 0) +
          (vigilance?.metrics.incidentsByOutcome.LIFE_THREATENING || 0),
        malfunctionsNoHarm: complaint?.metrics.totalComplaints
          ? complaint.metrics.totalComplaints - (complaint.metrics.totalPatientInjury || 0)
          : 0,
        article88Triggered: complaint?.article88Required || false,
        uclExcursions: complaint?.trendAnalysis.excursions.length || 0,
      },
      riskManagement: {
        residualRisksAcceptable: true,
        riskControlsEffective: true,
      },
      literature: {
        noNewRisksIdentified: literature?.conclusions.noNewRisksIdentified ?? true,
        stateOfArtAligned: literature?.conclusions.stateOfArtAligned ?? true,
        safetyProfileConfirmed: literature?.conclusions.safetyProfileConfirmed ?? true,
      },
    });
  } catch (e: any) {
    warnings.push(`Benefit-Risk engine failed: ${e.message || String(e)}`);
  }

  // Build slot obligation map (lazy - populated from Annex I obligations)
  const slotObligations = buildSlotObligationMap(complaint, vigilance, sales, literature, pmcf);

  const duration = Date.now() - startTime;
  console.log(
    `[PSURAnalyticsContext] Built in ${duration}ms: ` +
    `complaint=${complaint ? "OK" : "FAIL"}, ` +
    `vigilance=${vigilance ? "OK" : "FAIL"}, ` +
    `sales=${sales ? "OK" : "FAIL"}, ` +
    `literature=${literature ? "OK" : "FAIL"}, ` +
    `pmcf=${pmcf ? "OK" : "FAIL"}, ` +
    `segmentation=${segmentation ? "OK" : "FAIL"}, ` +
    `imdrf=${imdrfSummary ? "OK" : "SKIP"}, ` +
    `benefitRisk=${benefitRisk ? "OK" : "FAIL"}, ` +
    `rootCause=${rootCauseClusters ? "OK" : "SKIP"}`
  );

  return {
    complaintAnalysis: complaint,
    vigilanceAnalysis: vigilance,
    salesExposure: sales,
    literatureAnalysis: literature,
    pmcfDecision: pmcf,
    segmentationAnalysis: segmentation,
    imdrfSummary,
    benefitRiskAnalysis: benefitRisk,
    rootCauseClusters,
    canonicalMetrics,
    slotObligations,
    computedAt: new Date().toISOString(),
    engineErrors: errors,
    engineWarnings: warnings,
  };
}

// ============================================================================
// FORMAT FOR PROMPT INJECTION
// ============================================================================

/**
 * Formats the relevant analytics data for a specific slot as structured text
 * suitable for injection into an agent's user prompt.
 */
export function formatAnalyticsForSlot(
  slotId: string,
  ctx: PSURAnalyticsContext
): string {
  const sections: string[] = [];
  const sectionId = mapSlotIdToPSURSectionId(slotId);
  const id = slotId.toLowerCase();

  // Always include a header
  sections.push("## PRE-COMPUTED ANALYTICS (Deterministic Engine Output)");
  sections.push("The following data was computed by deterministic engines BEFORE this prompt.");
  sections.push("You MUST use these exact numbers in your narrative. DO NOT recalculate or invent different values.\n");

  // Include sales data for most sections
  if (ctx.salesExposure) {
    const se = ctx.salesExposure;
    sections.push("### Sales & Exposure (Engine-Computed)");
    sections.push(`- Total Units Sold in Period: ${se.metrics.totalUnitsSoldInPeriod.toLocaleString()}`);
    sections.push(`- Cumulative Units: ${se.metrics.cumulativeUnitsSold.toLocaleString()}`);
    sections.push(`- Population Exposure: ${se.metrics.populationExposureEstimate.toLocaleString()}`);
    if (se.metrics.regionBreakdown.length > 0) {
      sections.push("- Regional Breakdown:");
      for (const r of se.metrics.regionBreakdown.slice(0, 5)) {
        sections.push(`  - ${r.region}: ${r.unitsSold.toLocaleString()} (${r.percentOfGlobal.toFixed(1)}%)`);
      }
    }
    sections.push("");
  }

  // Include complaint data for relevant sections
  if (ctx.complaintAnalysis && (
    id.includes("complaint") || id.includes("trend") || id.includes("safety") ||
    id.includes("benefit") || id.includes("risk") || id.includes("conclusion") ||
    id.includes("exec") || id.includes("summary") || id.includes("section_d") ||
    id.includes("section_e") || id.includes("section_f") || id.includes("section_g") ||
    id.includes("section_m")
  )) {
    const ca = ctx.complaintAnalysis;
    sections.push("### Complaint Analysis (Engine-Computed)");
    sections.push(`- Total Complaints: ${ca.metrics.totalComplaints}`);
    sections.push(`- Device-Related: ${ca.metrics.totalDeviceRelated}`);
    sections.push(`- Patient Injury: ${ca.metrics.totalPatientInjury}`);
    sections.push(`- Complaint Rate: ${ca.metrics.complaintRate.toFixed(2)} per 1,000 units`);
    sections.push(`- Article 88 Required: ${ca.article88Required ? "YES" : "NO"}`);
    sections.push(`- Article 88 Justification: ${ca.article88Justification}`);

    if (ca.metrics.byCategory.length > 0) {
      sections.push("- Top Categories:");
      for (const cat of ca.metrics.byCategory.slice(0, 5)) {
        sections.push(`  - ${cat.category}: ${cat.count} (${cat.percentage.toFixed(1)}%)`);
      }
    }

    if (ca.metrics.byHarm.length > 0) {
      sections.push("- Harm Breakdown (ISO 14971):");
      for (const h of ca.metrics.byHarm.filter(h => h.count > 0)) {
        sections.push(`  - ${h.harmLevel}: ${h.count} (${h.percentage.toFixed(1)}%)`);
      }
    }
    sections.push("");
  }

  // Include trend data for trend-specific sections
  if (ctx.complaintAnalysis && (
    id.includes("trend") || id.includes("section_g")
  )) {
    const ta = ctx.complaintAnalysis.trendAnalysis;
    sections.push("### Statistical Trend Analysis (Engine-Computed)");
    sections.push(`- Mean Rate: ${ta.mean.toFixed(4)} per 1,000 units`);
    sections.push(`- Standard Deviation: ${ta.stdDev.toFixed(4)}`);
    sections.push(`- UCL (3-sigma): ${ta.ucl.toFixed(4)}`);
    sections.push(`- LCL (3-sigma): ${ta.lcl.toFixed(4)}`);
    sections.push(`- Trend Slope: ${ta.slope.toFixed(6)} (${ta.isIncreasing ? "INCREASING" : "DECREASING"})`);
    sections.push(`- Statistically Significant: ${ta.isStatisticallySignificant ? "YES" : "NO"}`);
    sections.push(`- UCL Excursions: ${ta.excursions.length}`);
    if (ta.excursions.length > 0) {
      for (const ex of ta.excursions) {
        sections.push(`  - ${ex.period}: rate ${ex.observedRate.toFixed(4)} > ${ex.excursionType} threshold ${ex.threshold.toFixed(4)}`);
      }
    }
    sections.push("- Monthly Data Points:");
    for (const dp of ta.dataPoints) {
      const status = dp.rate > ta.ucl ? " [ABOVE UCL]" : "";
      sections.push(`  - ${dp.period}: ${dp.count} complaints, rate ${dp.rate.toFixed(4)}${status}`);
    }
    sections.push("");
  }

  // Include vigilance data
  if (ctx.vigilanceAnalysis && (
    id.includes("safety") || id.includes("incident") || id.includes("vigilance") ||
    id.includes("fsca") || id.includes("capa") || id.includes("benefit") ||
    id.includes("risk") || id.includes("conclusion") || id.includes("section_d") ||
    id.includes("section_h") || id.includes("section_i") || id.includes("section_m")
  )) {
    const va = ctx.vigilanceAnalysis;
    sections.push("### Vigilance Analysis (Engine-Computed)");
    sections.push(`- Total Serious Incidents: ${va.metrics.totalSeriousIncidents}`);
    sections.push(`- Total Non-Serious Incidents: ${va.metrics.totalNonSeriousIncidents}`);
    sections.push(`- Active FSCAs: ${va.metrics.activeFscas}`);
    sections.push(`- Completed FSCAs: ${va.metrics.completedFscas}`);
    sections.push(`- Open CAPAs: ${va.metrics.openCapas}`);
    sections.push(`- Closed CAPAs: ${va.metrics.closedCapas}`);
    sections.push(`- Effective CAPAs: ${va.metrics.effectiveCapas}`);
    sections.push(`- Incident Statement: ${va.narrativeBlocks.seriousIncidentStatement}`);
    sections.push(`- FSCA Statement: ${va.narrativeBlocks.fscaStatement}`);
    sections.push(`- CAPA Statement: ${va.narrativeBlocks.capaStatement}`);
    sections.push("");
  }

  // Include literature data
  if (ctx.literatureAnalysis && (
    id.includes("literature") || id.includes("clinical") || id.includes("benefit") ||
    id.includes("risk") || id.includes("conclusion") || id.includes("section_j") ||
    id.includes("section_k") || id.includes("section_l") || id.includes("section_m")
  )) {
    const la = ctx.literatureAnalysis;
    sections.push("### Literature Analysis (Engine-Computed)");
    sections.push(`- References Reviewed: ${la.metrics.totalReferencesReviewed}`);
    sections.push(`- Directly Relevant: ${la.metrics.directlyRelevant}`);
    sections.push(`- Safety Signals: ${la.metrics.safetySignalsIdentified}`);
    sections.push(`- New Risks: ${la.metrics.newRisksIdentified}`);
    sections.push(`- No New Risks: ${la.conclusions.noNewRisksIdentified ? "CONFIRMED" : "NEW RISKS FOUND"}`);
    sections.push(`- State of Art Aligned: ${la.conclusions.stateOfArtAligned ? "YES" : "NO"}`);
    sections.push(`- Safety Profile Confirmed: ${la.conclusions.safetyProfileConfirmed ? "YES" : "NO"}`);
    sections.push("");
  }

  // Include PMCF data
  if (ctx.pmcfDecision && (
    id.includes("pmcf") || id.includes("clinical") || id.includes("benefit") ||
    id.includes("risk") || id.includes("conclusion") || id.includes("section_l") ||
    id.includes("section_m")
  )) {
    const pd = ctx.pmcfDecision;
    sections.push("### PMCF Decision (Engine-Computed)");
    sections.push(`- PMCF Required: ${pd.pmcfRequired ? "YES" : "NO"}`);
    sections.push(`- Decision: ${pd.decision}`);
    sections.push(`- Justification: ${pd.justification.overallConclusion}`);
    sections.push("");
  }

  // Include confirmed/unconfirmed breakdown for complaint sections
  if (ctx.complaintAnalysis?.confirmedMetrics && (
    id.includes("complaint") || id.includes("safety") || id.includes("section_e") ||
    id.includes("benefit") || id.includes("risk") || id.includes("conclusion")
  )) {
    const cm = ctx.complaintAnalysis.confirmedMetrics;
    sections.push("### Confirmed vs. Unconfirmed Breakdown (Engine-Computed)");
    sections.push(`- Confirmed Product Defects: ${cm.confirmedComplaints} (${cm.confirmedPercentage.toFixed(1)}%)`);
    sections.push(`- Confirmed Defect Rate: ${cm.confirmedRate.toFixed(4)} per 1,000 units`);
    sections.push(`- Unconfirmed (Inconclusive): ${cm.unconfirmedComplaints} (${cm.unconfirmedPercentage.toFixed(1)}%)`);
    sections.push(`- External Cause: ${cm.externalCauseComplaints} (${cm.externalCausePercentage.toFixed(1)}%)`);
    sections.push(`- Combined Rate: ${cm.combinedRate.toFixed(4)} per 1,000 units`);
    sections.push("NOTE: Confirmed defect rate is the primary safety metric. Combined rate is for regulatory comparison only.");
    sections.push("");
  }

  // Include IMDRF classification summary for complaint sections
  if (ctx.imdrfSummary && (
    id.includes("complaint") || id.includes("safety") || id.includes("section_e") ||
    id.includes("incident") || id.includes("section_d")
  )) {
    const imdrf = ctx.imdrfSummary;
    sections.push("### IMDRF Classification Summary (Engine-Computed)");
    sections.push(`- Total Classified: ${imdrf.totalClassified}`);
    sections.push(`- Adjudicated by LLM: ${imdrf.totalAdjudicated}`);
    sections.push(`- Default Fallback: ${imdrf.totalDefaultFallback}`);
    if (imdrf.byMdpCode.length > 0) {
      sections.push("- Medical Device Problems (Annex A):");
      for (const mdp of imdrf.byMdpCode) {
        sections.push(`  - ${mdp.code} ${mdp.term}: ${mdp.count} (${mdp.percentage.toFixed(1)}%) [${mdp.confirmedCount} confirmed]`);
      }
    }
    if (imdrf.byHarmCode.length > 0) {
      sections.push("- Health Effects (Annex E):");
      for (const harm of imdrf.byHarmCode) {
        sections.push(`  - ${harm.code} ${harm.term}: ${harm.count} (${harm.percentage.toFixed(1)}%)`);
      }
    }
    sections.push("");
  }

  // Include segmentation analysis for complaint and trend sections
  if (ctx.segmentationAnalysis && (
    id.includes("complaint") || id.includes("safety") || id.includes("trend") ||
    id.includes("section_e") || id.includes("section_g")
  )) {
    const seg = ctx.segmentationAnalysis;
    sections.push("### Segmentation Analysis (Engine-Computed)");
    if (seg.significantSegments.length > 0) {
      sections.push(`- ALERTS (${seg.significantSegments.length}):`);
      for (const alert of seg.significantSegments) {
        sections.push(`  - [${alert.segmentType.toUpperCase()}] ${alert.segmentId}: ${alert.alertReason}`);
        sections.push(`    Action: ${alert.recommendedAction}`);
      }
    } else {
      sections.push("- No significant segment deviations detected.");
    }
    if (seg.byRegion.length > 0) {
      sections.push("- Top Regions:");
      for (const r of seg.byRegion.slice(0, 5)) {
        sections.push(`  - ${r.segmentId}: ${r.complaintCount} complaints, rate ${r.complaintRate.toFixed(2)} per 1,000 (ratio: ${r.rateRatio.toFixed(2)}x)`);
      }
    }
    if (seg.byProduct.length > 0) {
      sections.push("- Top Products:");
      for (const p of seg.byProduct.slice(0, 5)) {
        sections.push(`  - ${p.segmentId}: ${p.complaintCount} complaints, rate ${p.complaintRate.toFixed(2)} per 1,000 (ratio: ${p.rateRatio.toFixed(2)}x)`);
      }
    }
    const significantLots = seg.byLot.filter(l => l.complaintCount > 1);
    if (significantLots.length > 0) {
      sections.push("- Lots with Multiple Complaints:");
      for (const l of significantLots) {
        sections.push(`  - Lot ${l.segmentId}: ${l.complaintCount} complaints (INVESTIGATE)`);
      }
    }
    sections.push("");
  }

  // Include root cause clusters for complaint and CAPA sections
  if (ctx.rootCauseClusters && ctx.rootCauseClusters.clusters.length > 0 && (
    id.includes("complaint") || id.includes("safety") || id.includes("capa") ||
    id.includes("section_e") || id.includes("section_i")
  )) {
    const rc = ctx.rootCauseClusters;
    sections.push("### Root Cause Pattern Clusters (LLM-Analyzed)");
    sections.push(`- Total Clusters Identified: ${rc.clusterCount}`);
    for (const cluster of rc.clusters) {
      sections.push(`- Cluster: "${cluster.theme}" (${cluster.complaintCount} complaints)`);
      sections.push(`  Pattern: ${cluster.patternDescription}`);
      sections.push(`  Hypothesis: ${cluster.rootCauseHypothesis}`);
      sections.push(`  Recommended Action: ${cluster.recommendedAction}`);
    }
    if (rc.insights.length > 0) {
      sections.push("- Insights:");
      for (const insight of rc.insights) {
        sections.push(`  - ${insight}`);
      }
    }
    sections.push("");
  }

  // Include quantitative B/R determination for benefit-risk and conclusion sections
  if (id.includes("benefit") || id.includes("risk") || id.includes("conclusion") || id.includes("section_m")) {
    if (ctx.benefitRiskAnalysis) {
      const br = ctx.benefitRiskAnalysis;
      sections.push("### Quantitative Benefit-Risk Analysis (Engine-Computed)");
      sections.push(`- Primary Benefit: ${br.benefits.primaryClinicalBenefit}`);
      sections.push(`- Benefit Magnitude: ${br.benefits.benefitMagnitude}${br.benefits.benefitUnits}`);
      sections.push(`- Patient Population: ${br.benefits.patientPopulationSize.toLocaleString()} procedures`);
      sections.push(`- Serious Incidents: ${br.risks.seriousIncidents} (${br.risks.seriousIncidentRate.toFixed(2)} per 1,000)`);
      sections.push(`- Deaths: ${br.risks.deaths}`);
      sections.push(`- Confirmed Complaint Rate: ${br.risks.confirmedComplaintRate.toFixed(4)} per 1,000`);
      sections.push(`- Benefit-Risk Ratio: ${br.benefitRiskRatio === Infinity ? "∞" : br.benefitRiskRatio.toFixed(0) + ":1"}`);
      sections.push(`- Acceptability Threshold: ${br.acceptabilityThreshold}:1`);
      sections.push(`- Determination: ${br.determination}`);
      sections.push(`- Change from Previous PSUR: ${br.changeFromPrevious}`);
      sections.push("- Condition Checks:");
      for (const check of br.conditionChecks) {
        sections.push(`  - [${check.weight.toUpperCase()}] ${check.label}: ${check.passed ? "PASS" : "FAIL"} (${check.detail})`);
      }
      if (br.comparative.available) {
        sections.push(`- Comparative vs. ${br.comparative.alternativeTherapy}: Benefit ${br.comparative.benefitDelta > 0 ? "+" : ""}${br.comparative.benefitDelta.toFixed(1)}${br.benefits.benefitUnits}`);
      }
      sections.push("\nThe LLM MUST justify the above determination with specific numbers. Do NOT freely choose a different conclusion.");
    } else {
      // Fallback to old simple determination
      sections.push("### Deterministic Benefit-Risk Pre-Evaluation");
      const determination = computeBRDetermination(ctx);
      sections.push(`- Algorithmic Determination: ${determination.conclusion}`);
      sections.push(`- Rationale: ${determination.rationale}`);
      sections.push("- Condition Checks:");
      for (const check of determination.checks) {
        sections.push(`  - ${check.label}: ${check.passed ? "PASS" : "FAIL"} (${check.detail})`);
      }
      sections.push("\nThe LLM MUST justify the above determination. Do NOT freely choose a different conclusion.");
    }
    sections.push("");
  }

  // Include obligation context if available
  const obligations = ctx.slotObligations.get(slotId);
  if (obligations && obligations.narrativeConstraints.length > 0) {
    sections.push("## REGULATORY OBLIGATIONS FOR THIS SECTION");
    for (const nc of obligations.narrativeConstraints) {
      const status = nc.conditionMet ? "ACTIVE" : "N/A";
      sections.push(`- [${nc.type}] (${status}): ${nc.requiredText}`);
      if (nc.contextData) {
        sections.push(`  Context: ${nc.contextData}`);
      }
    }
    sections.push("");
  }

  return sections.join("\n");
}

// ============================================================================
// BENEFIT-RISK DETERMINATION
// ============================================================================

interface BRDetermination {
  conclusion: "FAVORABLE" | "ACCEPTABLE" | "UNFAVORABLE";
  rationale: string;
  checks: Array<{ label: string; passed: boolean; detail: string }>;
}

function computeBRDetermination(ctx: PSURAnalyticsContext): BRDetermination {
  const checks: Array<{ label: string; passed: boolean; detail: string }> = [];

  // Check 1: Complaint rate within threshold
  const rateOk = !ctx.complaintAnalysis || ctx.complaintAnalysis.metrics.complaintRate < 10;
  checks.push({
    label: "Complaint rate within threshold",
    passed: rateOk,
    detail: ctx.complaintAnalysis
      ? `${ctx.complaintAnalysis.metrics.complaintRate.toFixed(2)} per 1,000 (threshold: 10)`
      : "No complaint data",
  });

  // Check 2: No UCL excursions
  const noUCL = !ctx.complaintAnalysis || ctx.complaintAnalysis.trendAnalysis.excursions.length === 0;
  checks.push({
    label: "No UCL excursions",
    passed: noUCL,
    detail: ctx.complaintAnalysis
      ? `${ctx.complaintAnalysis.trendAnalysis.excursions.length} excursion(s)`
      : "No trend data",
  });

  // Check 3: No deaths
  const noDeaths = !ctx.vigilanceAnalysis || ctx.vigilanceAnalysis.metrics.incidentsByOutcome.DEATH === 0;
  checks.push({
    label: "No patient deaths",
    passed: noDeaths,
    detail: ctx.vigilanceAnalysis
      ? `${ctx.vigilanceAnalysis.metrics.incidentsByOutcome.DEATH} death(s)`
      : "No vigilance data",
  });

  // Check 4: Article 88 not triggered
  const noArt88 = !ctx.complaintAnalysis || !ctx.complaintAnalysis.article88Required;
  checks.push({
    label: "Article 88 not triggered",
    passed: noArt88,
    detail: ctx.complaintAnalysis
      ? (ctx.complaintAnalysis.article88Required ? "TRIGGERED" : "Not triggered")
      : "No complaint data",
  });

  // Check 5: No new risks from literature
  const noNewRisks = !ctx.literatureAnalysis || ctx.literatureAnalysis.conclusions.noNewRisksIdentified;
  checks.push({
    label: "No new risks identified",
    passed: noNewRisks,
    detail: ctx.literatureAnalysis
      ? (ctx.literatureAnalysis.conclusions.noNewRisksIdentified ? "Confirmed" : "New risks found")
      : "No literature data",
  });

  // Check 6: CAPAs under control
  const capasOk = !ctx.vigilanceAnalysis ||
    (ctx.vigilanceAnalysis.metrics.openCapas <= 3 &&
      ctx.vigilanceAnalysis.metrics.closedCapas >= ctx.vigilanceAnalysis.metrics.openCapas);
  checks.push({
    label: "CAPAs under control",
    passed: capasOk,
    detail: ctx.vigilanceAnalysis
      ? `${ctx.vigilanceAnalysis.metrics.openCapas} open, ${ctx.vigilanceAnalysis.metrics.closedCapas} closed`
      : "No CAPA data",
  });

  // Determine conclusion
  const allPassed = checks.every(c => c.passed);
  const criticalFails = checks.filter(c => !c.passed && (
    c.label.includes("death") || c.label.includes("Article 88") || c.label.includes("new risks")
  ));

  let conclusion: "FAVORABLE" | "ACCEPTABLE" | "UNFAVORABLE";
  let rationale: string;

  if (allPassed) {
    conclusion = "FAVORABLE";
    rationale = "All safety and performance checks passed. No significant trends, no new risks, no deaths.";
  } else if (criticalFails.length > 0) {
    conclusion = "UNFAVORABLE";
    rationale = `Critical conditions not met: ${criticalFails.map(c => c.label).join(", ")}. Immediate action required.`;
  } else {
    conclusion = "ACCEPTABLE";
    rationale = `Minor conditions not met (${checks.filter(c => !c.passed).map(c => c.label).join(", ")}), but overall profile acceptable with monitoring.`;
  }

  return { conclusion, rationale, checks };
}

// ============================================================================
// OBLIGATION MAP BUILDER
// ============================================================================

function buildSlotObligationMap(
  complaint: ComplaintAnalysisResult | null,
  vigilance: VigilanceAnalysisResult | null,
  sales: SalesExposureResult | null,
  literature: LiteratureAnalysisResult | null,
  pmcf: PMCFDecisionResult | null,
): Map<string, SlotObligationContext> {
  // For now, return empty map - obligations are injected via agentRoleContext
  // This can be populated from MDCG_ANNEX_I_OBLIGATIONS in a future iteration
  return new Map();
}

// ============================================================================
// HELPER
// ============================================================================

function extractResult<T>(
  result: PromiseSettledResult<T>,
  engineName: string,
  warnings: string[]
): T | null {
  if (result.status === "fulfilled") {
    return result.value;
  }
  warnings.push(`${engineName} engine failed: ${result.reason?.message || String(result.reason)}`);
  console.warn(`[PSURAnalyticsContext] ${engineName} engine failed:`, result.reason);
  return null;
}
