/**
 * BENEFIT-RISK QUANTIFICATION ENGINE
 *
 * Deterministic engine for quantitative benefit-risk assessment per MDCG 2022-21.
 * Integrates clinical benefit data, PMS safety data, and risk management data
 * to produce a structured, auditable benefit-risk determination.
 *
 * Outputs feed Section J (Benefit-Risk) and Section M (Conclusions).
 *
 * Per MDCG 2022-21 Annex I, Section 20:
 * "The manufacturer shall determine from the analysis of all the data gathered
 *  whether the benefit-risk determination has been adversely impacted."
 */

import type {
  PSURTable,
  TableRow,
  TraceReference,
} from "../psurContract";
import { createTraceReference } from "../psurContract";
import type { ConfirmedComplaintMetrics } from "./complaintEngine";

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface BenefitRiskInput {
  /** Clinical benefit data (from CER or dossier) */
  clinicalBenefit: {
    primaryBenefit: string;
    benefitMagnitude: number;
    benefitUnits: string;
    evidenceSource: string;
    patientPopulationSize: number;
  };

  /** Safety data from current PSUR period */
  safety: {
    totalUnitsSold: number;
    totalComplaints: number;
    confirmedComplaints: number;
    confirmedRate: number;
    seriousIncidents: number;
    deaths: number;
    seriousInjuries: number;
    malfunctionsNoHarm: number;
    article88Triggered: boolean;
    uclExcursions: number;
  };

  /** Risk management file data */
  riskManagement: {
    maxAcceptableComplaintRate?: number;
    maxAcceptableIncidentRate?: number;
    benefitRiskThreshold?: number;
    residualRisksAcceptable: boolean;
    riskControlsEffective: boolean;
  };

  /** Comparative data (from CER state-of-the-art) */
  comparative?: {
    alternativeTherapy: string;
    alternativeBenefit: number;
    alternativeRisk: number;
  };

  /** Literature conclusions */
  literature: {
    noNewRisksIdentified: boolean;
    stateOfArtAligned: boolean;
    safetyProfileConfirmed: boolean;
  };

  /** Previous PSUR data for trend comparison */
  previousPSUR?: {
    benefitRiskRatio: number;
    confirmedRate: number;
    seriousIncidentRate: number;
    conclusion: string;
  };
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface BenefitRiskAnalysisResult {
  success: boolean;
  errors: string[];

  /** Quantified benefit assessment */
  benefits: {
    primaryClinicalBenefit: string;
    benefitMagnitude: number;
    benefitUnits: string;
    evidenceSource: string;
    patientPopulationSize: number;
    totalBenefitDelivered: number;
  };

  /** Quantified risk assessment */
  risks: {
    seriousIncidents: number;
    seriousIncidentRate: number;
    deaths: number;
    seriousInjuries: number;
    malfunctionsNoHarm: number;
    confirmedComplaintRate: number;
    totalRiskEvents: number;
  };

  /** Comparative analysis (if available) */
  comparative: {
    available: boolean;
    alternativeTherapy: string;
    benefitDelta: number;
    riskDelta: number;
    favorableComparison: boolean;
  };

  /** Quantitative ratio and determination */
  benefitRiskRatio: number;
  acceptabilityThreshold: number;
  acceptable: boolean;
  determination: "FAVORABLE" | "ACCEPTABLE" | "UNFAVORABLE";
  changeFromPrevious: "Improved" | "Unchanged" | "Deteriorated" | "N/A";

  /** Condition checks (auditable) */
  conditionChecks: BRConditionCheck[];

  /** Tables for PSUR output */
  benefitRiskSummaryTable: PSURTable;

  /** Trace */
  allEvidenceAtomIds: string[];
}

export interface BRConditionCheck {
  label: string;
  passed: boolean;
  detail: string;
  weight: "critical" | "major" | "minor";
}

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export function computeBenefitRiskAnalysis(
  input: BenefitRiskInput
): BenefitRiskAnalysisResult {
  const errors: string[] = [];

  // ── Benefits ──
  const totalBenefitDelivered =
    input.clinicalBenefit.benefitMagnitude * input.clinicalBenefit.patientPopulationSize;

  // ── Risks ──
  const seriousIncidentRate =
    input.safety.totalUnitsSold > 0
      ? (input.safety.seriousIncidents / input.safety.totalUnitsSold) * 1000
      : 0;

  const totalRiskEvents =
    input.safety.deaths +
    input.safety.seriousInjuries +
    input.safety.malfunctionsNoHarm;

  // ── Comparative ──
  const hasComparative = !!input.comparative;
  const benefitDelta = hasComparative
    ? input.clinicalBenefit.benefitMagnitude - (input.comparative?.alternativeBenefit || 0)
    : 0;
  const riskDelta = hasComparative
    ? seriousIncidentRate - (input.comparative?.alternativeRisk || 0)
    : 0;

  // ── Benefit-Risk Ratio ──
  // Ratio: (benefit magnitude × population) / max(risk events, 1)
  const benefitRiskRatio = totalRiskEvents > 0
    ? totalBenefitDelivered / totalRiskEvents
    : totalBenefitDelivered > 0
      ? Infinity
      : 0;

  const threshold = input.riskManagement.benefitRiskThreshold || 100;

  // ── Condition Checks ──
  const checks: BRConditionCheck[] = [];

  // Critical checks
  checks.push({
    label: "No patient deaths",
    passed: input.safety.deaths === 0,
    detail: `${input.safety.deaths} death(s) reported`,
    weight: "critical",
  });

  checks.push({
    label: "No new risks from literature",
    passed: input.literature.noNewRisksIdentified,
    detail: input.literature.noNewRisksIdentified ? "No new risks identified" : "New risks found in literature",
    weight: "critical",
  });

  checks.push({
    label: "Article 88 not triggered",
    passed: !input.safety.article88Triggered,
    detail: input.safety.article88Triggered ? "Article 88 TRIGGERED" : "Not triggered",
    weight: "critical",
  });

  // Major checks
  checks.push({
    label: "Confirmed complaint rate within threshold",
    passed: !input.riskManagement.maxAcceptableComplaintRate ||
      input.safety.confirmedRate <= input.riskManagement.maxAcceptableComplaintRate,
    detail: input.riskManagement.maxAcceptableComplaintRate
      ? `${input.safety.confirmedRate.toFixed(4)} per 1,000 (threshold: ${input.riskManagement.maxAcceptableComplaintRate})`
      : "No threshold defined",
    weight: "major",
  });

  checks.push({
    label: "No UCL excursions",
    passed: input.safety.uclExcursions === 0,
    detail: `${input.safety.uclExcursions} excursion(s)`,
    weight: "major",
  });

  checks.push({
    label: "Residual risks acceptable",
    passed: input.riskManagement.residualRisksAcceptable,
    detail: input.riskManagement.residualRisksAcceptable ? "Acceptable" : "Not acceptable",
    weight: "major",
  });

  checks.push({
    label: "Risk controls effective",
    passed: input.riskManagement.riskControlsEffective,
    detail: input.riskManagement.riskControlsEffective ? "Effective" : "Not effective",
    weight: "major",
  });

  // Minor checks
  checks.push({
    label: "State of art aligned",
    passed: input.literature.stateOfArtAligned,
    detail: input.literature.stateOfArtAligned ? "Aligned" : "Gaps identified",
    weight: "minor",
  });

  checks.push({
    label: "Safety profile confirmed by literature",
    passed: input.literature.safetyProfileConfirmed,
    detail: input.literature.safetyProfileConfirmed ? "Confirmed" : "Not confirmed",
    weight: "minor",
  });

  // ── Determination ──
  const criticalFails = checks.filter(c => !c.passed && c.weight === "critical");
  const majorFails = checks.filter(c => !c.passed && c.weight === "major");
  const allPassed = checks.every(c => c.passed);

  let determination: "FAVORABLE" | "ACCEPTABLE" | "UNFAVORABLE";
  if (criticalFails.length > 0) {
    determination = "UNFAVORABLE";
  } else if (allPassed && benefitRiskRatio >= threshold) {
    determination = "FAVORABLE";
  } else if (majorFails.length <= 1) {
    determination = "ACCEPTABLE";
  } else {
    determination = "UNFAVORABLE";
  }

  // ── Change from previous ──
  let changeFromPrevious: "Improved" | "Unchanged" | "Deteriorated" | "N/A" = "N/A";
  if (input.previousPSUR) {
    const prevRatio = input.previousPSUR.benefitRiskRatio;
    if (benefitRiskRatio > prevRatio * 1.1) {
      changeFromPrevious = "Improved";
    } else if (benefitRiskRatio < prevRatio * 0.9) {
      changeFromPrevious = "Deteriorated";
    } else {
      changeFromPrevious = "Unchanged";
    }
  }

  // ── Build table ──
  const table = buildBenefitRiskSummaryTable(input, {
    seriousIncidentRate,
    totalRiskEvents,
    totalBenefitDelivered,
    benefitRiskRatio,
    threshold,
    determination,
    benefitDelta,
    riskDelta,
    changeFromPrevious,
  });

  return {
    success: errors.length === 0,
    errors,
    benefits: {
      primaryClinicalBenefit: input.clinicalBenefit.primaryBenefit,
      benefitMagnitude: input.clinicalBenefit.benefitMagnitude,
      benefitUnits: input.clinicalBenefit.benefitUnits,
      evidenceSource: input.clinicalBenefit.evidenceSource,
      patientPopulationSize: input.clinicalBenefit.patientPopulationSize,
      totalBenefitDelivered,
    },
    risks: {
      seriousIncidents: input.safety.seriousIncidents,
      seriousIncidentRate,
      deaths: input.safety.deaths,
      seriousInjuries: input.safety.seriousInjuries,
      malfunctionsNoHarm: input.safety.malfunctionsNoHarm,
      confirmedComplaintRate: input.safety.confirmedRate,
      totalRiskEvents,
    },
    comparative: {
      available: hasComparative,
      alternativeTherapy: input.comparative?.alternativeTherapy || "N/A",
      benefitDelta,
      riskDelta,
      favorableComparison: benefitDelta > 0 || riskDelta < 0,
    },
    benefitRiskRatio,
    acceptabilityThreshold: threshold,
    acceptable: determination !== "UNFAVORABLE",
    determination,
    changeFromPrevious,
    conditionChecks: checks,
    benefitRiskSummaryTable: table,
    allEvidenceAtomIds: [],
  };
}

// ============================================================================
// TABLE BUILDER
// ============================================================================

function buildBenefitRiskSummaryTable(
  input: BenefitRiskInput,
  computed: {
    seriousIncidentRate: number;
    totalRiskEvents: number;
    totalBenefitDelivered: number;
    benefitRiskRatio: number;
    threshold: number;
    determination: string;
    benefitDelta: number;
    riskDelta: number;
    changeFromPrevious: string;
  }
): PSURTable {
  const traceRef = createTraceReference("table_benefit_risk_summary", []);

  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Parameter", format: "text" },
        { value: "Value", format: "text" },
      ],
    },
    // Benefits section
    {
      rowId: "section_benefits",
      cells: [
        { value: "=== BENEFITS ===", format: "text" },
        { value: "", format: "text" },
      ],
    },
    {
      rowId: "primary_benefit",
      cells: [
        { value: "Primary Clinical Benefit", format: "text" },
        { value: input.clinicalBenefit.primaryBenefit, format: "text" },
      ],
    },
    {
      rowId: "benefit_magnitude",
      cells: [
        { value: "Benefit Magnitude", format: "text" },
        { value: `${input.clinicalBenefit.benefitMagnitude}${input.clinicalBenefit.benefitUnits}`, format: "text" },
      ],
    },
    {
      rowId: "patient_population",
      cells: [
        { value: "Patient Population (procedures)", format: "text" },
        { value: input.clinicalBenefit.patientPopulationSize.toLocaleString(), format: "text" },
      ],
    },
    // Risks section
    {
      rowId: "section_risks",
      cells: [
        { value: "=== RISKS ===", format: "text" },
        { value: "", format: "text" },
      ],
    },
    {
      rowId: "serious_incidents",
      cells: [
        { value: "Serious Incidents", format: "text" },
        { value: `${input.safety.seriousIncidents} (${computed.seriousIncidentRate.toFixed(2)} per 1,000 uses)`, format: "text" },
      ],
    },
    {
      rowId: "deaths",
      cells: [
        { value: "Deaths", format: "text" },
        { value: String(input.safety.deaths), format: "text" },
      ],
    },
    {
      rowId: "serious_injuries",
      cells: [
        { value: "Serious Injuries", format: "text" },
        { value: String(input.safety.seriousInjuries), format: "text" },
      ],
    },
    {
      rowId: "confirmed_rate",
      cells: [
        { value: "Confirmed Complaint Rate", format: "text" },
        { value: `${input.safety.confirmedRate.toFixed(4)} per 1,000 units`, format: "text" },
      ],
    },
    // Determination section
    {
      rowId: "section_determination",
      cells: [
        { value: "=== DETERMINATION ===", format: "text" },
        { value: "", format: "text" },
      ],
    },
    {
      rowId: "br_ratio",
      cells: [
        { value: "Benefit-Risk Ratio", format: "text" },
        { value: computed.benefitRiskRatio === Infinity
          ? "∞ (no risk events)"
          : `${computed.benefitRiskRatio.toFixed(0)}:1`,
          format: "text" },
      ],
    },
    {
      rowId: "threshold",
      cells: [
        { value: "Acceptability Threshold (from RMF)", format: "text" },
        { value: `${computed.threshold}:1`, format: "text" },
      ],
    },
    {
      rowId: "determination",
      cells: [
        { value: "Determination", format: "text" },
        { value: computed.determination, format: "text" },
      ],
    },
    {
      rowId: "change",
      cells: [
        { value: "Change from Previous PSUR", format: "text" },
        { value: computed.changeFromPrevious, format: "text" },
      ],
    },
  ];

  // Add comparative if available
  if (input.comparative) {
    rows.splice(rows.length - 4, 0, {
      rowId: "section_comparative",
      cells: [
        { value: "=== COMPARATIVE ===", format: "text" },
        { value: "", format: "text" },
      ],
    });
    rows.splice(rows.length - 4, 0, {
      rowId: "alternative",
      cells: [
        { value: `vs. ${input.comparative.alternativeTherapy}`, format: "text" },
        { value: `Benefit: ${computed.benefitDelta > 0 ? "+" : ""}${computed.benefitDelta.toFixed(1)}${input.clinicalBenefit.benefitUnits} | Risk: ${computed.riskDelta < 0 ? "" : "+"}${computed.riskDelta.toFixed(3)} per 1,000`,
          format: "text" },
      ],
    });
  }

  return {
    tableId: "TABLE_BENEFIT_RISK_SUMMARY",
    title: "Benefit-Risk Quantitative Assessment",
    columns: ["Parameter", "Value"],
    rows,
    footnotes: [
      "B/R Ratio = (Benefit Magnitude × Patient Population) / max(Risk Events, 1)",
      "Determination per MDCG 2022-21 Section 20",
    ],
    traceRef,
  };
}

