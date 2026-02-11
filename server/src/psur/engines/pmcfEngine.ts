/**
 * PMCF DECISION ENGINE
 * 
 * Deterministic engine for Post-Market Clinical Follow-up decisions.
 * Produces a YES/NO PMCF decision with full justification.
 * 
 * NO HUMAN JUDGMENT ALLOWED - All decisions are algorithm-driven.
 * 
 * Evaluates:
 * - Device novelty
 * - Risk profile changes
 * - Literature sufficiency
 * - State of the Art alignment
 * - Clinical evidence gaps
 * 
 * Per MDCG 2022-21 Annex I, Sections 24-25 and MDCG 2020-7
 */

import type {
  PSURTable,
  TableRow,
  TraceReference,
} from "../psurContract";
import { createTraceReference } from "../psurContract";

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface PMCFEvidenceAtom {
  atomId: string;
  evidenceType: "pmcf_result";
  studyId: string;
  studyName: string;
  studyType: PMCFStudyType;
  status: PMCFStudyStatus;
  enrolledSubjects?: number;
  startDate?: string;
  endDate?: string;
  findings?: string;
  adverseEvents?: number;
  deviceFailures?: number;
  clinicalEndpointsReached?: boolean;
  deviceCode: string;
}

export interface DeviceProfile {
  deviceName: string;
  deviceCode: string;
  riskClass: "I" | "IIa" | "IIb" | "III";
  isNovel: boolean;
  noveltyJustification?: string;
  yearsOnMarket: number;
  implantable: boolean;
  hasActiveSubstance: boolean;
  containsNanomaterial: boolean;
  usesAnimalTissue: boolean;
  intendedForChildren: boolean;
  lifeSustaining: boolean;
  clinicalEvidenceBasis: ClinicalEvidenceBasis;
}

export interface RiskProfileInput {
  hasNewRisksIdentified: boolean;
  newRisksDescription?: string;
  hasUnacceptableRisks: boolean;
  residualRisksAcceptable: boolean;
  riskControlsEffective: boolean;
}

export interface LiteratureInput {
  totalReferencesReviewed: number;
  directlyRelevant: number;
  clinicalDataAvailable: boolean;
  clinicalDataSufficient: boolean;
  gapsIdentified: string[];
}

export interface StateOfArtInput {
  isAligned: boolean;
  gapsIdentified: string[];
  competitorComparison?: string;
}

export type PMCFStudyType = 
  | "REGISTRY"
  | "SURVEY"
  | "CLINICAL_INVESTIGATION"
  | "LITERATURE_REVIEW"
  | "PROACTIVE_SURVEILLANCE"
  | "OTHER";

export type PMCFStudyStatus = 
  | "PLANNED"
  | "ONGOING"
  | "COMPLETED"
  | "TERMINATED"
  | "NOT_STARTED";

export type ClinicalEvidenceBasis = 
  | "CLINICAL_INVESTIGATION"
  | "EQUIVALENCE"
  | "LITERATURE_ONLY"
  | "COMBINATION";

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface PMCFDecisionResult {
  success: boolean;
  errors: string[];
  
  // THE DECISION (STRICT)
  pmcfRequired: boolean;
  decision: "YES_PMCF_REQUIRED" | "NO_PMCF_NOT_REQUIRED";
  
  // Tables
  pmcfActivitiesTable: PSURTable;
  decisionMatrix: PSURTable;
  
  // Full justification
  justification: PMCFJustification;
  
  // Trace
  allEvidenceAtomIds: string[];
  decisionTrace: DecisionTraceEntry[];
}

export interface PMCFJustification {
  noveltyAssessment: JustificationFactor;
  riskProfileAssessment: JustificationFactor;
  literatureSufficiencyAssessment: JustificationFactor;
  stateOfArtAssessment: JustificationFactor;
  clinicalGapAssessment: JustificationFactor;
  overallConclusion: string;
  narrativeJustification: string;
  regulatoryReference: string;
}

export interface JustificationFactor {
  factorName: string;
  score: "REQUIRES_PMCF" | "SUPPORTS_NO_PMCF" | "NEUTRAL";
  weight: number; // 1-5
  rationale: string;
  evidenceAtomIds: string[];
}

export interface DecisionTraceEntry {
  step: number;
  factorName: string;
  evaluation: string;
  result: "PASS" | "FAIL" | "WARNING";
  contributes: "REQUIRES_PMCF" | "SUPPORTS_NO_PMCF" | "NEUTRAL";
  timestamp: string;
}

// ============================================================================
// DECISION WEIGHTS AND THRESHOLDS
// ============================================================================

const DECISION_CONFIG = {
  // Automatic PMCF triggers (any one = PMCF required)
  automaticTriggers: {
    classIII: true,
    implantable: true,
    novel: true,
    unacceptableRisks: true,
    newRisksIdentified: true,
    lifeSustaining: true,
    containsNanomaterial: true,
    usesAnimalTissue: true,
  },
  
  // Threshold for weighted decision (if no automatic trigger)
  weightedThreshold: 0.6, // If weighted score > 0.6, PMCF required
  
  // Factor weights
  weights: {
    novelty: 5,
    riskProfile: 5,
    literatureSufficiency: 4,
    stateOfArt: 3,
    clinicalGaps: 4,
    yearsOnMarket: 2,
    deviceClass: 3,
  },
} as const;

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export function computePMCFDecision(
  pmcfAtoms: PMCFEvidenceAtom[],
  deviceProfile: DeviceProfile,
  riskProfile: RiskProfileInput,
  literatureInput: LiteratureInput,
  stateOfArtInput: StateOfArtInput
): PMCFDecisionResult {
  const errors: string[] = [];
  const allEvidenceAtomIds = pmcfAtoms.map(a => a.atomId);
  const decisionTrace: DecisionTraceEntry[] = [];
  let stepCounter = 0;
  
  // -------------------------------------------------------------------------
  // STEP 1: CHECK AUTOMATIC TRIGGERS
  // -------------------------------------------------------------------------
  const automaticTriggerResults: { trigger: string; triggered: boolean; reason: string }[] = [];
  
  // Class III
  automaticTriggerResults.push({
    trigger: "classIII",
    triggered: deviceProfile.riskClass === "III",
    reason: deviceProfile.riskClass === "III" 
      ? "Class III devices require PMCF per MDR Article 83(2)" 
      : "Device is not Class III",
  });
  
  // Implantable
  automaticTriggerResults.push({
    trigger: "implantable",
    triggered: deviceProfile.implantable,
    reason: deviceProfile.implantable 
      ? "Implantable devices require PMCF per MDR Annex XIV Part B" 
      : "Device is not implantable",
  });
  
  // Novel
  automaticTriggerResults.push({
    trigger: "novel",
    triggered: deviceProfile.isNovel,
    reason: deviceProfile.isNovel 
      ? `Novel device: ${deviceProfile.noveltyJustification || "No equivalent device exists"}` 
      : "Device is not novel (equivalent exists)",
  });
  
  // New risks
  automaticTriggerResults.push({
    trigger: "newRisks",
    triggered: riskProfile.hasNewRisksIdentified,
    reason: riskProfile.hasNewRisksIdentified 
      ? `New risks identified: ${riskProfile.newRisksDescription || "See risk analysis"}` 
      : "No new risks identified",
  });
  
  // Life sustaining
  automaticTriggerResults.push({
    trigger: "lifeSustaining",
    triggered: deviceProfile.lifeSustaining,
    reason: deviceProfile.lifeSustaining 
      ? "Life-sustaining devices require enhanced surveillance" 
      : "Device is not life-sustaining",
  });
  
  // Nanomaterial
  automaticTriggerResults.push({
    trigger: "nanomaterial",
    triggered: deviceProfile.containsNanomaterial,
    reason: deviceProfile.containsNanomaterial 
      ? "Devices containing nanomaterials require PMCF" 
      : "Device does not contain nanomaterials",
  });
  
  // Animal tissue
  automaticTriggerResults.push({
    trigger: "animalTissue",
    triggered: deviceProfile.usesAnimalTissue,
    reason: deviceProfile.usesAnimalTissue 
      ? "Devices using animal tissue require PMCF" 
      : "Device does not use animal tissue",
  });
  
  // Log automatic trigger checks
  for (const result of automaticTriggerResults) {
    decisionTrace.push({
      step: ++stepCounter,
      factorName: `Automatic Trigger: ${result.trigger}`,
      evaluation: result.reason,
      result: result.triggered ? "FAIL" : "PASS",
      contributes: result.triggered ? "REQUIRES_PMCF" : "NEUTRAL",
      timestamp: new Date().toISOString(),
    });
  }
  
  // Check if any automatic trigger is hit
  const hasAutomaticTrigger = automaticTriggerResults.some(r => r.triggered);
  
  // -------------------------------------------------------------------------
  // STEP 2: EVALUATE FACTORS FOR WEIGHTED DECISION
  // -------------------------------------------------------------------------
  const factors: JustificationFactor[] = [];
  
  // Novelty assessment
  factors.push({
    factorName: "Device Novelty",
    score: deviceProfile.isNovel ? "REQUIRES_PMCF" : "SUPPORTS_NO_PMCF",
    weight: DECISION_CONFIG.weights.novelty,
    rationale: deviceProfile.isNovel
      ? "Device is novel with no established clinical history from equivalent devices."
      : "Device is not novel; clinical data from equivalent devices available.",
    evidenceAtomIds: allEvidenceAtomIds,
  });
  
  decisionTrace.push({
    step: ++stepCounter,
    factorName: "Novelty Assessment",
    evaluation: deviceProfile.isNovel ? "Device is novel" : "Device is not novel",
    result: deviceProfile.isNovel ? "FAIL" : "PASS",
    contributes: deviceProfile.isNovel ? "REQUIRES_PMCF" : "SUPPORTS_NO_PMCF",
    timestamp: new Date().toISOString(),
  });
  
  // Risk profile assessment
  const riskScore: "REQUIRES_PMCF" | "SUPPORTS_NO_PMCF" | "NEUTRAL" = 
    riskProfile.hasNewRisksIdentified || !riskProfile.residualRisksAcceptable
      ? "REQUIRES_PMCF"
      : riskProfile.riskControlsEffective
        ? "SUPPORTS_NO_PMCF"
        : "NEUTRAL";
  
  factors.push({
    factorName: "Risk Profile Changes",
    score: riskScore,
    weight: DECISION_CONFIG.weights.riskProfile,
    rationale: riskProfile.hasNewRisksIdentified
      ? "New risks have been identified that require clinical data for evaluation."
      : riskProfile.residualRisksAcceptable && riskProfile.riskControlsEffective
        ? "Risk profile remains acceptable with effective controls."
        : "Risk profile requires monitoring.",
    evidenceAtomIds: allEvidenceAtomIds,
  });
  
  decisionTrace.push({
    step: ++stepCounter,
    factorName: "Risk Profile Assessment",
    evaluation: riskProfile.hasNewRisksIdentified 
      ? "New risks identified" 
      : "No new risks",
    result: riskScore === "REQUIRES_PMCF" ? "FAIL" : "PASS",
    contributes: riskScore,
    timestamp: new Date().toISOString(),
  });
  
  // Literature sufficiency assessment
  const literatureScore: "REQUIRES_PMCF" | "SUPPORTS_NO_PMCF" | "NEUTRAL" =
    !literatureInput.clinicalDataSufficient || literatureInput.gapsIdentified.length > 0
      ? "REQUIRES_PMCF"
      : literatureInput.clinicalDataAvailable && literatureInput.directlyRelevant >= 5
        ? "SUPPORTS_NO_PMCF"
        : "NEUTRAL";
  
  factors.push({
    factorName: "Literature Sufficiency",
    score: literatureScore,
    weight: DECISION_CONFIG.weights.literatureSufficiency,
    rationale: literatureInput.clinicalDataSufficient
      ? `Sufficient clinical data available from ${literatureInput.directlyRelevant} directly relevant publications.`
      : `Clinical data gaps identified: ${literatureInput.gapsIdentified.join("; ") || "Insufficient clinical evidence"}`,
    evidenceAtomIds: allEvidenceAtomIds,
  });
  
  decisionTrace.push({
    step: ++stepCounter,
    factorName: "Literature Sufficiency Assessment",
    evaluation: literatureInput.clinicalDataSufficient 
      ? "Clinical data sufficient" 
      : "Clinical data gaps identified",
    result: literatureScore === "REQUIRES_PMCF" ? "FAIL" : "PASS",
    contributes: literatureScore,
    timestamp: new Date().toISOString(),
  });
  
  // State of the art assessment
  const sotaScore: "REQUIRES_PMCF" | "SUPPORTS_NO_PMCF" | "NEUTRAL" =
    !stateOfArtInput.isAligned || stateOfArtInput.gapsIdentified.length > 0
      ? "REQUIRES_PMCF"
      : "SUPPORTS_NO_PMCF";
  
  factors.push({
    factorName: "State of the Art Alignment",
    score: sotaScore,
    weight: DECISION_CONFIG.weights.stateOfArt,
    rationale: stateOfArtInput.isAligned
      ? "Device remains aligned with current state of the art."
      : `State of the art gaps: ${stateOfArtInput.gapsIdentified.join("; ")}`,
    evidenceAtomIds: allEvidenceAtomIds,
  });
  
  decisionTrace.push({
    step: ++stepCounter,
    factorName: "State of Art Assessment",
    evaluation: stateOfArtInput.isAligned 
      ? "Aligned with state of art" 
      : "Gaps identified",
    result: sotaScore === "REQUIRES_PMCF" ? "FAIL" : "PASS",
    contributes: sotaScore,
    timestamp: new Date().toISOString(),
  });
  
  // Clinical gaps assessment
  const totalGaps = literatureInput.gapsIdentified.length + stateOfArtInput.gapsIdentified.length;
  const gapScore: "REQUIRES_PMCF" | "SUPPORTS_NO_PMCF" | "NEUTRAL" =
    totalGaps > 2 ? "REQUIRES_PMCF" : totalGaps === 0 ? "SUPPORTS_NO_PMCF" : "NEUTRAL";
  
  factors.push({
    factorName: "Clinical Evidence Gaps",
    score: gapScore,
    weight: DECISION_CONFIG.weights.clinicalGaps,
    rationale: totalGaps === 0
      ? "No clinical evidence gaps identified."
      : `${totalGaps} clinical evidence gap(s) identified requiring PMCF to address.`,
    evidenceAtomIds: allEvidenceAtomIds,
  });
  
  decisionTrace.push({
    step: ++stepCounter,
    factorName: "Clinical Gaps Assessment",
    evaluation: `${totalGaps} gaps identified`,
    result: gapScore === "REQUIRES_PMCF" ? "FAIL" : totalGaps === 0 ? "PASS" : "WARNING",
    contributes: gapScore,
    timestamp: new Date().toISOString(),
  });
  
  // -------------------------------------------------------------------------
  // STEP 3: CALCULATE WEIGHTED SCORE
  // -------------------------------------------------------------------------
  let requiresPMCFScore = 0;
  let supportsNoPMCFScore = 0;
  let totalWeight = 0;
  
  for (const factor of factors) {
    totalWeight += factor.weight;
    if (factor.score === "REQUIRES_PMCF") {
      requiresPMCFScore += factor.weight;
    } else if (factor.score === "SUPPORTS_NO_PMCF") {
      supportsNoPMCFScore += factor.weight;
    }
  }
  
  const weightedScore = totalWeight > 0 ? requiresPMCFScore / totalWeight : 0;
  
  decisionTrace.push({
    step: ++stepCounter,
    factorName: "Weighted Score Calculation",
    evaluation: `Score: ${(weightedScore * 100).toFixed(1)}% (threshold: ${(DECISION_CONFIG.weightedThreshold * 100).toFixed(1)}%)`,
    result: weightedScore >= DECISION_CONFIG.weightedThreshold ? "FAIL" : "PASS",
    contributes: weightedScore >= DECISION_CONFIG.weightedThreshold ? "REQUIRES_PMCF" : "SUPPORTS_NO_PMCF",
    timestamp: new Date().toISOString(),
  });
  
  // -------------------------------------------------------------------------
  // STEP 4: MAKE FINAL DECISION
  // -------------------------------------------------------------------------
  const pmcfRequired = hasAutomaticTrigger || weightedScore >= DECISION_CONFIG.weightedThreshold;
  const decision: "YES_PMCF_REQUIRED" | "NO_PMCF_NOT_REQUIRED" = 
    pmcfRequired ? "YES_PMCF_REQUIRED" : "NO_PMCF_NOT_REQUIRED";
  
  decisionTrace.push({
    step: ++stepCounter,
    factorName: "FINAL DECISION",
    evaluation: pmcfRequired 
      ? "PMCF IS REQUIRED" 
      : "PMCF IS NOT REQUIRED",
    result: pmcfRequired ? "FAIL" : "PASS",
    contributes: pmcfRequired ? "REQUIRES_PMCF" : "SUPPORTS_NO_PMCF",
    timestamp: new Date().toISOString(),
  });
  
  // -------------------------------------------------------------------------
  // STEP 5: GENERATE JUSTIFICATION
  // -------------------------------------------------------------------------
  const justification = generateJustification(
    pmcfRequired,
    hasAutomaticTrigger,
    automaticTriggerResults,
    factors,
    weightedScore,
    deviceProfile
  );
  
  // -------------------------------------------------------------------------
  // STEP 6: BUILD TABLES
  // -------------------------------------------------------------------------
  const pmcfActivitiesTable = buildPMCFActivitiesTable(pmcfAtoms, allEvidenceAtomIds);
  const decisionMatrix = buildDecisionMatrixTable(factors, allEvidenceAtomIds);
  
  return {
    success: errors.length === 0,
    errors,
    pmcfRequired,
    decision,
    pmcfActivitiesTable,
    decisionMatrix,
    justification,
    allEvidenceAtomIds,
    decisionTrace,
  };
}

// ============================================================================
// JUSTIFICATION GENERATION
// ============================================================================

function generateJustification(
  pmcfRequired: boolean,
  hasAutomaticTrigger: boolean,
  automaticTriggers: { trigger: string; triggered: boolean; reason: string }[],
  factors: JustificationFactor[],
  weightedScore: number,
  deviceProfile: DeviceProfile
): PMCFJustification {
  const triggeredFactors = automaticTriggers.filter(t => t.triggered);
  
  let overallConclusion: string;
  let narrativeJustification: string;
  
  if (pmcfRequired) {
    if (hasAutomaticTrigger) {
      const triggers = triggeredFactors.map(t => t.trigger).join(", ");
      overallConclusion = `PMCF IS REQUIRED. Automatic trigger(s) activated: ${triggers}.`;
      narrativeJustification = `Based on the deterministic PMCF evaluation algorithm, Post-Market Clinical Follow-up is REQUIRED for the ${deviceProfile.deviceName}. ` +
        `The following automatic trigger(s) mandate PMCF regardless of weighted factor analysis: ${triggeredFactors.map(t => t.reason).join("; ")}. ` +
        `No human judgment was applied in this determination.`;
    } else {
      overallConclusion = `PMCF IS REQUIRED. Weighted factor score ${(weightedScore * 100).toFixed(1)}% exceeds threshold ${(DECISION_CONFIG.weightedThreshold * 100).toFixed(1)}%.`;
      narrativeJustification = `Based on the deterministic PMCF evaluation algorithm, Post-Market Clinical Follow-up is REQUIRED for the ${deviceProfile.deviceName}. ` +
        `While no automatic triggers were activated, the weighted analysis of risk factors, literature sufficiency, state of the art alignment, and clinical evidence gaps ` +
        `produced a score of ${(weightedScore * 100).toFixed(1)}%, which exceeds the threshold of ${(DECISION_CONFIG.weightedThreshold * 100).toFixed(1)}%. ` +
        `No human judgment was applied in this determination.`;
    }
  } else {
    overallConclusion = `PMCF IS NOT REQUIRED. No automatic triggers activated. Weighted factor score ${(weightedScore * 100).toFixed(1)}% below threshold.`;
    narrativeJustification = `Based on the deterministic PMCF evaluation algorithm, Post-Market Clinical Follow-up is NOT REQUIRED for the ${deviceProfile.deviceName} at this time. ` +
      `No automatic triggers were activated (device is not Class III, not implantable, not novel, no new risks identified). ` +
      `The weighted analysis of risk factors, literature sufficiency, state of the art alignment, and clinical evidence gaps ` +
      `produced a score of ${(weightedScore * 100).toFixed(1)}%, which is below the threshold of ${(DECISION_CONFIG.weightedThreshold * 100).toFixed(1)}%. ` +
      `However, continued surveillance through complaint monitoring and literature review is recommended. ` +
      `No human judgment was applied in this determination.`;
  }
  
  return {
    noveltyAssessment: factors.find(f => f.factorName === "Device Novelty")!,
    riskProfileAssessment: factors.find(f => f.factorName === "Risk Profile Changes")!,
    literatureSufficiencyAssessment: factors.find(f => f.factorName === "Literature Sufficiency")!,
    stateOfArtAssessment: factors.find(f => f.factorName === "State of the Art Alignment")!,
    clinicalGapAssessment: factors.find(f => f.factorName === "Clinical Evidence Gaps")!,
    overallConclusion,
    narrativeJustification,
    regulatoryReference: "Per EU MDR 2017/745 Article 83, Annex XIV Part B, and MDCG 2020-7",
  };
}

// ============================================================================
// TABLE BUILDERS
// ============================================================================

function buildPMCFActivitiesTable(
  pmcfAtoms: PMCFEvidenceAtom[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_pmcf_activities", evidenceAtomIds);
  
  if (pmcfAtoms.length === 0) {
    return {
      tableId: "TABLE_PMCF_ACTIVITIES",
      title: "PMCF Activities Summary",
      columns: ["Study ID", "Study Name", "Type", "Status", "Enrolled", "Findings"],
      rows: [
        {
          rowId: "header",
          isHeader: true,
          cells: [
            { value: "Study ID", format: "text" },
            { value: "Study Name", format: "text" },
            { value: "Type", format: "text" },
            { value: "Status", format: "text" },
            { value: "Enrolled", format: "text" },
            { value: "Findings", format: "text" },
          ],
        },
        {
          rowId: "none",
          cells: [
            { value: "No PMCF studies", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
            { value: "-", format: "text" },
          ],
        },
      ],
      footnotes: ["No PMCF studies are currently active or completed."],
      traceRef,
    };
  }
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Study ID", format: "text" },
        { value: "Study Name", format: "text" },
        { value: "Type", format: "text" },
        { value: "Status", format: "text" },
        { value: "Enrolled", format: "number" },
        { value: "Key Findings", format: "text" },
      ],
    },
  ];
  
  for (const study of pmcfAtoms) {
    rows.push({
      rowId: `study_${study.studyId}`,
      cells: [
        { value: study.studyId, format: "text" },
        { value: study.studyName, format: "text" },
        { value: study.studyType, format: "text" },
        { value: study.status, format: "text" },
        { value: study.enrolledSubjects || 0, format: "number" },
        { value: study.findings || "Pending", format: "text" },
      ],
    });
  }
  
  return {
    tableId: "TABLE_PMCF_ACTIVITIES",
    title: "PMCF Activities Summary",
    columns: ["Study ID", "Study Name", "Type", "Status", "Enrolled", "Key Findings"],
    rows,
    traceRef,
  };
}

function buildDecisionMatrixTable(
  factors: JustificationFactor[],
  evidenceAtomIds: string[]
): PSURTable {
  const traceRef = createTraceReference("table_pmcf_decision_matrix", evidenceAtomIds);
  
  const rows: TableRow[] = [
    {
      rowId: "header",
      isHeader: true,
      cells: [
        { value: "Factor", format: "text" },
        { value: "Weight", format: "number" },
        { value: "Assessment", format: "text" },
        { value: "Rationale", format: "text" },
      ],
    },
  ];
  
  for (const factor of factors) {
    rows.push({
      rowId: `factor_${factor.factorName.replace(/\s+/g, "_")}`,
      cells: [
        { value: factor.factorName, format: "text" },
        { value: factor.weight, format: "number" },
        { value: factor.score, format: "text" },
        { value: factor.rationale, format: "text" },
      ],
    });
  }
  
  return {
    tableId: "TABLE_PMCF_ACTIVITIES", // Closest match in contract
    title: "PMCF Decision Matrix",
    columns: ["Factor", "Weight", "Assessment", "Rationale"],
    rows,
    footnotes: [
      "REQUIRES_PMCF: Factor indicates PMCF is needed",
      "SUPPORTS_NO_PMCF: Factor supports no PMCF required",
      "NEUTRAL: Factor does not strongly indicate either direction",
    ],
    traceRef,
  };
}

// ============================================================================
// EXPORTS FOR PSUR RENDERING
// ============================================================================

export function getPMCFNarrativeBlocks(result: PMCFDecisionResult): string[] {
  const blocks: string[] = [];
  
  blocks.push(result.justification.narrativeJustification);
  blocks.push(result.justification.overallConclusion);
  blocks.push(`Regulatory Reference: ${result.justification.regulatoryReference}`);
  
  return blocks;
}

export function getPMCFDecisionStatement(result: PMCFDecisionResult): string {
  return result.pmcfRequired
    ? "PMCF IS REQUIRED based on the deterministic evaluation algorithm."
    : "PMCF IS NOT REQUIRED based on the deterministic evaluation algorithm.";
}
