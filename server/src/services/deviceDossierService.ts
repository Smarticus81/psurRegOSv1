/**
 * Device Dossier Service
 * 
 * Provides rich device-specific context for PSUR content generation.
 * This is the core service that transforms generic evidence data into
 * device-specific, non-generic content by providing therapeutic context,
 * risk management references, regulatory history, and performance baselines.
 * 
 * SINGLE SOURCE OF TRUTH for device context used by all narrative agents.
 */

import { db } from "../../db";
import { eq, and, desc, lte, gte } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import { completeJSON } from "../agents/llmService";
import {
  deviceDossiers,
  dossierClinicalContext,
  dossierRiskContext,
  dossierPriorPsurs,
  dossierBaselines,
  dossierClinicalEvidence,
  dossierRegulatoryHistory,
  type DeviceDossier,
  type DossierClinicalContext,
  type DossierRiskContext,
  type DossierPriorPsur,
  type DossierBaseline,
  type DossierClinicalEvidence,
  type DossierRegulatoryHistory,
  type InsertDeviceDossier,
  type InsertDossierClinicalContext,
  type InsertDossierRiskContext,
  type InsertDossierPriorPsur,
  type InsertDossierBaseline,
  type InsertDossierClinicalEvidence,
  type InsertDossierRegulatoryHistory,
} from "@shared/schema";
import { buildRegulatoryAlignmentBlock } from "../constants/grkbMdcgAlignment";
import { buildRegulatoryContextForAgents } from "../constants/psurRegulatoryContext";

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT TYPES - What agents receive
// ═══════════════════════════════════════════════════════════════════════════════

export interface DossierContext {
  // Pre-formatted context strings for agent prompts
  productSummary: string;
  clinicalContext: string;
  riskContext: string;
  regulatoryContext: string;
  baselineContext: string;
  priorPsurContext: string;
  /** GRKB and MDCG 2022-21 alignment requirements for agent prompts */
  regulatoryAlignment: string;
  /** 16-section regulatory context (methods, thresholds, terminology) for agent prompts */
  regulatoryKnowledgeContext: string;

  // Structured data for calculations and comparisons
  riskThresholds: RiskThresholds | null;
  clinicalBenefits: ClinicalBenefit[];
  priorPsurConclusion: PriorPsurSummary | null;
  performanceBaselines: PerformanceBaseline[];

  // Metadata
  dossierExists: boolean;
  completenessScore: number;
  lastUpdated: string | null;
}

export interface RiskThresholds {
  complaintRateThreshold: number;
  seriousIncidentThreshold: number;
  signalDetectionMethod: string;
}

export interface ClinicalBenefit {
  benefitId: string;
  description: string;
  endpoint: string;
  evidenceSource: string;
  quantifiedValue?: string;
}

export interface PriorPsurSummary {
  periodStart: string;
  periodEnd: string;
  psurReference?: string;
  benefitRiskConclusion: string;
  keyFindings: string[];
  actionsRequired: Array<{
    actionId: string;
    description: string;
    completed: boolean;
    dueDate?: string;
  }>;
  periodMetrics?: {
    totalUnits?: number;
    complaintRate?: number;
    seriousIncidents?: number;
  };
}

export interface PerformanceBaseline {
  metricType: string;
  value: number;
  unit: string;
  periodStart: string;
  periodEnd: string;
  methodology?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL DOSSIER TYPE - Complete device dossier with all related data
// ═══════════════════════════════════════════════════════════════════════════════

export interface FullDeviceDossier {
  core: DeviceDossier;
  clinicalContext: DossierClinicalContext | null;
  riskContext: DossierRiskContext | null;
  clinicalEvidence: DossierClinicalEvidence | null;
  regulatoryHistory: DossierRegulatoryHistory | null;
  priorPsurs: DossierPriorPsur[];
  baselines: DossierBaseline[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE SERVICE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the full dossier context for an agent to use in prompt construction.
 * This is the primary function agents should call.
 */
export async function getDossierContext(
  deviceCode: string,
  periodStart?: string,
  periodEnd?: string
): Promise<DossierContext> {
  const dossier = await getFullDossier(deviceCode);
  if (!dossier) {
    throw new Error(`Device dossier required for PSUR generation. No dossier found for device: ${deviceCode}. Create and complete a device dossier first.`);
  }

  // Find the most recent prior PSUR before current period
  const priorPsur = periodStart 
    ? getMostRecentPriorPsur(dossier.priorPsurs, periodStart)
    : dossier.priorPsurs[0] || null;
  
  return {
    productSummary: buildProductSummary(dossier),
    clinicalContext: buildClinicalContextString(dossier),
    riskContext: buildRiskContextString(dossier),
    regulatoryContext: buildRegulatoryContextString(dossier),
    baselineContext: buildBaselineContextString(dossier, periodStart, periodEnd),
    priorPsurContext: buildPriorPsurContextString(priorPsur, dossier.core.deviceCode),
    regulatoryAlignment: buildRegulatoryAlignmentBlock("MDCG_2022_21_ANNEX_I"),
    regulatoryKnowledgeContext: buildRegulatoryContextForAgents(),

    riskThresholds: extractRiskThresholds(dossier.riskContext),
    clinicalBenefits: extractClinicalBenefits(dossier.clinicalContext),
    priorPsurConclusion: priorPsur ? mapToPriorPsurSummary(priorPsur) : null,
    performanceBaselines: extractPerformanceBaselines(dossier.baselines),

    dossierExists: true,
    completenessScore: dossier.core.completenessScore || 0,
    lastUpdated: dossier.core.updatedAt?.toISOString() || null,
  };
}

/**
 * Get the full device dossier with all related data.
 */
export async function getFullDossier(deviceCode: string): Promise<FullDeviceDossier | null> {
  const core = await db.query.deviceDossiers.findFirst({
    where: eq(deviceDossiers.deviceCode, deviceCode),
  });
  
  if (!core) {
    return null;
  }
  
  const [
    clinicalCtx,
    riskCtx,
    clinicalEvidence,
    regulatoryHist,
    priorPsurs,
    baselines,
  ] = await Promise.all([
    db.query.dossierClinicalContext.findFirst({
      where: eq(dossierClinicalContext.deviceCode, deviceCode),
    }),
    db.query.dossierRiskContext.findFirst({
      where: eq(dossierRiskContext.deviceCode, deviceCode),
    }),
    db.query.dossierClinicalEvidence.findFirst({
      where: eq(dossierClinicalEvidence.deviceCode, deviceCode),
    }),
    db.query.dossierRegulatoryHistory.findFirst({
      where: eq(dossierRegulatoryHistory.deviceCode, deviceCode),
    }),
    db.query.dossierPriorPsurs.findMany({
      where: eq(dossierPriorPsurs.deviceCode, deviceCode),
      orderBy: [desc(dossierPriorPsurs.periodEnd)],
    }),
    db.query.dossierBaselines.findMany({
      where: eq(dossierBaselines.deviceCode, deviceCode),
      orderBy: [desc(dossierBaselines.periodEnd)],
    }),
  ]);
  
  return {
    core,
    clinicalContext: clinicalCtx || null,
    riskContext: riskCtx || null,
    clinicalEvidence: clinicalEvidence || null,
    regulatoryHistory: regulatoryHist || null,
    priorPsurs: priorPsurs || [],
    baselines: baselines || [],
  };
}

/**
 * List all device dossiers.
 */
export async function listDossiers(): Promise<DeviceDossier[]> {
  return db.query.deviceDossiers.findMany({
    orderBy: [desc(deviceDossiers.updatedAt)],
  });
}

/**
 * Check if a dossier exists for a device.
 */
export async function dossierExists(deviceCode: string): Promise<boolean> {
  const result = await db.query.deviceDossiers.findFirst({
    where: eq(deviceDossiers.deviceCode, deviceCode),
    columns: { id: true },
  });
  return !!result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new device dossier.
 */
export async function createDossier(data: InsertDeviceDossier): Promise<DeviceDossier> {
  const [result] = await db.insert(deviceDossiers).values(data).returning();
  return result;
}

/**
 * Update a device dossier.
 */
export async function updateDossier(
  deviceCode: string,
  data: Partial<InsertDeviceDossier>
): Promise<DeviceDossier | null> {
  const [result] = await db
    .update(deviceDossiers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(deviceDossiers.deviceCode, deviceCode))
    .returning();
  return result || null;
}

/**
 * Delete a device dossier and all related data.
 */
export async function deleteDossier(deviceCode: string): Promise<boolean> {
  const result = await db
    .delete(deviceDossiers)
    .where(eq(deviceDossiers.deviceCode, deviceCode));
  return (result.rowCount || 0) > 0;
}

// --- Clinical Context ---

export async function upsertClinicalContext(
  deviceCode: string,
  data: Omit<InsertDossierClinicalContext, "deviceCode">
): Promise<DossierClinicalContext> {
  const existing = await db.query.dossierClinicalContext.findFirst({
    where: eq(dossierClinicalContext.deviceCode, deviceCode),
  });
  
  if (existing) {
    const [result] = await db
      .update(dossierClinicalContext)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dossierClinicalContext.deviceCode, deviceCode))
      .returning();
    return result;
  } else {
    const [result] = await db
      .insert(dossierClinicalContext)
      .values({ ...data, deviceCode })
      .returning();
    return result;
  }
}

// --- Risk Context ---

export async function upsertRiskContext(
  deviceCode: string,
  data: Omit<InsertDossierRiskContext, "deviceCode">
): Promise<DossierRiskContext> {
  const existing = await db.query.dossierRiskContext.findFirst({
    where: eq(dossierRiskContext.deviceCode, deviceCode),
  });
  
  if (existing) {
    const [result] = await db
      .update(dossierRiskContext)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dossierRiskContext.deviceCode, deviceCode))
      .returning();
    return result;
  } else {
    const [result] = await db
      .insert(dossierRiskContext)
      .values({ ...data, deviceCode })
      .returning();
    return result;
  }
}

// --- Clinical Evidence ---

export async function upsertClinicalEvidence(
  deviceCode: string,
  data: Omit<InsertDossierClinicalEvidence, "deviceCode">
): Promise<DossierClinicalEvidence> {
  const existing = await db.query.dossierClinicalEvidence.findFirst({
    where: eq(dossierClinicalEvidence.deviceCode, deviceCode),
  });
  
  if (existing) {
    const [result] = await db
      .update(dossierClinicalEvidence)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dossierClinicalEvidence.deviceCode, deviceCode))
      .returning();
    return result;
  } else {
    const [result] = await db
      .insert(dossierClinicalEvidence)
      .values({ ...data, deviceCode })
      .returning();
    return result;
  }
}

// --- Regulatory History ---

export async function upsertRegulatoryHistory(
  deviceCode: string,
  data: Omit<InsertDossierRegulatoryHistory, "deviceCode">
): Promise<DossierRegulatoryHistory> {
  const existing = await db.query.dossierRegulatoryHistory.findFirst({
    where: eq(dossierRegulatoryHistory.deviceCode, deviceCode),
  });
  
  if (existing) {
    const [result] = await db
      .update(dossierRegulatoryHistory)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dossierRegulatoryHistory.deviceCode, deviceCode))
      .returning();
    return result;
  } else {
    const [result] = await db
      .insert(dossierRegulatoryHistory)
      .values({ ...data, deviceCode })
      .returning();
    return result;
  }
}

// --- Prior PSURs ---

export async function addPriorPsur(
  deviceCode: string,
  data: Omit<InsertDossierPriorPsur, "deviceCode">
): Promise<DossierPriorPsur> {
  const [result] = await db
    .insert(dossierPriorPsurs)
    .values({ ...data, deviceCode })
    .returning();
  return result;
}

export async function updatePriorPsur(
  id: number,
  data: Partial<InsertDossierPriorPsur>
): Promise<DossierPriorPsur | null> {
  const [result] = await db
    .update(dossierPriorPsurs)
    .set(data)
    .where(eq(dossierPriorPsurs.id, id))
    .returning();
  return result || null;
}

export async function deletePriorPsur(id: number): Promise<boolean> {
  const result = await db
    .delete(dossierPriorPsurs)
    .where(eq(dossierPriorPsurs.id, id));
  return (result.rowCount || 0) > 0;
}

// --- Baselines ---

export async function addBaseline(
  deviceCode: string,
  data: Omit<InsertDossierBaseline, "deviceCode">
): Promise<DossierBaseline> {
  const [result] = await db
    .insert(dossierBaselines)
    .values({ ...data, deviceCode })
    .returning();
  return result;
}

export async function updateBaseline(
  id: number,
  data: Partial<InsertDossierBaseline>
): Promise<DossierBaseline | null> {
  const [result] = await db
    .update(dossierBaselines)
    .set(data)
    .where(eq(dossierBaselines.id, id))
    .returning();
  return result || null;
}

export async function deleteBaseline(id: number): Promise<boolean> {
  const result = await db
    .delete(dossierBaselines)
    .where(eq(dossierBaselines.id, id));
  return (result.rowCount || 0) > 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT BUILDING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function buildProductSummary(dossier: FullDeviceDossier): string {
  const { core, clinicalContext } = dossier;
  const classification = core.classification as any;
  
  const lines: string[] = [
    `## DEVICE PROFILE: ${core.tradeName}`,
    "",
    `${core.tradeName} (${core.deviceCode}) is a Class ${classification?.class || "Unknown"} medical device${classification?.rule ? ` classified under ${classification.rule}` : ""}.`,
  ];
  
  if (core.manufacturerName) {
    lines.push(`Manufacturer: ${core.manufacturerName}`);
  }
  
  if (core.basicUdiDi) {
    lines.push(`Basic UDI-DI: ${core.basicUdiDi}`);
  }
  
  if (clinicalContext?.intendedPurpose) {
    lines.push("");
    lines.push(`**Intended Purpose:** ${clinicalContext.intendedPurpose}`);
  }
  
  const targetPop = clinicalContext?.targetPopulation as any;
  if (targetPop?.description) {
    lines.push("");
    lines.push(`**Target Population:** ${targetPop.description}`);
    if (targetPop.ageRange) {
      lines.push(`- Age Range: ${targetPop.ageRange.min}-${targetPop.ageRange.max} years`);
    }
    if (targetPop.conditions?.length) {
      lines.push(`- Conditions: ${targetPop.conditions.join(", ")}`);
    }
  }
  
  const benefits = clinicalContext?.clinicalBenefits as ClinicalBenefit[] || [];
  if (benefits.length > 0) {
    lines.push("");
    lines.push("**Clinical Benefits:**");
    for (const b of benefits.slice(0, 5)) {
      lines.push(`- ${b.description}${b.quantifiedValue ? `: ${b.quantifiedValue}` : ""}`);
    }
  }
  
  if (core.marketEntryDate) {
    lines.push("");
    lines.push(`**Market Entry:** ${core.marketEntryDate.toISOString().split("T")[0]}`);
  }
  
  const exposure = core.cumulativeExposure as any;
  if (exposure?.patientYears || exposure?.unitsDistributed) {
    const expStr = exposure.patientYears 
      ? `${exposure.patientYears.toLocaleString()} patient-years`
      : `${exposure.unitsDistributed?.toLocaleString()} units distributed`;
    lines.push(`**Cumulative Exposure:** ${expStr}`);
  }
  
  return lines.join("\n");
}

function buildClinicalContextString(dossier: FullDeviceDossier): string {
  const { clinicalContext, clinicalEvidence } = dossier;
  if (!clinicalContext) {
    throw new Error(`Dossier clinical context required for device: ${dossier.core.deviceCode}. Add clinical context in the device dossier.`);
  }

  const lines: string[] = ["## CLINICAL CONTEXT"];
  
  if (clinicalContext.intendedPurpose) {
    lines.push("");
    lines.push(`**Intended Purpose (Verbatim):**`);
    lines.push(clinicalContext.intendedPurpose);
  }
  
  if (clinicalContext.indications?.length) {
    lines.push("");
    lines.push("**Indications:**");
    for (const ind of clinicalContext.indications) {
      lines.push(`- ${ind}`);
    }
  }
  
  if (clinicalContext.contraindications?.length) {
    lines.push("");
    lines.push("**Contraindications:**");
    for (const contra of clinicalContext.contraindications) {
      lines.push(`- ${contra}`);
    }
  }
  
  const sota = clinicalContext.stateOfTheArt as any;
  if (sota?.description) {
    lines.push("");
    lines.push("**State of the Art:**");
    lines.push(sota.description);
    if (sota.benchmarkDevices?.length) {
      lines.push(`Benchmark devices: ${sota.benchmarkDevices.join(", ")}`);
    }
  }
  
  // Add PMCF info if available
  const pmcf = clinicalEvidence?.pmcfPlan as any;
  if (pmcf?.objectives?.length) {
    lines.push("");
    lines.push("**PMCF Plan Objectives:**");
    for (const obj of pmcf.objectives.slice(0, 5)) {
      lines.push(`- ${obj}`);
    }
    if (pmcf.currentStatus) {
      lines.push(`Status: ${pmcf.currentStatus}`);
    }
  }

  // External database search protocol (MDCG 2022-21 Section 10)
  const extDb = clinicalEvidence?.externalDbSearchProtocol as any;
  if (extDb?.databases?.length) {
    lines.push("");
    lines.push("**External Database Search Protocol:**");
    lines.push(`Databases: ${extDb.databases.join(", ")}`);
    if (extDb.lastSearchDate) lines.push(`Last search: ${extDb.lastSearchDate}`);
    if (extDb.queryTerms?.length) lines.push(`Query terms: ${extDb.queryTerms.join("; ")}`);
    if (extDb.relevanceCriteria?.length) lines.push(`Relevance criteria: ${extDb.relevanceCriteria.join("; ")}`);
  }

  return lines.join("\n");
}

function buildRiskContextString(dossier: FullDeviceDossier): string {
  const { riskContext } = dossier;
  if (!riskContext) {
    throw new Error(`Dossier risk context required for device: ${dossier.core.deviceCode}. Add risk context in the device dossier.`);
  }

  const lines: string[] = ["## RISK MANAGEMENT CONTEXT"];
  
  const risks = riskContext.principalRisks as any[] || [];
  if (risks.length > 0) {
    lines.push("");
    lines.push("**Principal Identified Risks:**");
    for (const risk of risks.slice(0, 5)) {
      const rateStr = risk.preMarketOccurrenceRate 
        ? ` (Pre-market rate: ${(risk.preMarketOccurrenceRate * 100).toFixed(2)}%)`
        : "";
      lines.push(`- ${risk.hazard} → ${risk.harm} [${risk.severity}]${rateStr}`);
    }
  }
  
  const acceptability = riskContext.residualRiskAcceptability as any;
  if (acceptability?.criteria) {
    lines.push("");
    lines.push("**Risk Acceptability Criteria:**");
    lines.push(acceptability.criteria);
  }
  
  const thresholds = riskContext.riskThresholds as any;
  if (thresholds) {
    lines.push("");
    lines.push("**Signal Detection Thresholds:**");
    if (thresholds.complaintRateThreshold) {
      lines.push(`- Complaint Rate Alert: >${thresholds.complaintRateThreshold} per 1,000 units`);
    }
    if (thresholds.seriousIncidentThreshold) {
      lines.push(`- Serious Incident Alert: >${thresholds.seriousIncidentThreshold} events`);
    }
    if (thresholds.signalDetectionMethod) {
      lines.push(`- Method: ${thresholds.signalDetectionMethod}`);
    }
  }
  
  if (acceptability?.afapAnalysisSummary) {
    lines.push("");
    lines.push("**AFAP Analysis Summary:**");
    lines.push(acceptability.afapAnalysisSummary);
  }
  
  return lines.join("\n");
}

function buildRegulatoryContextString(dossier: FullDeviceDossier): string {
  const { regulatoryHistory } = dossier;
  if (!regulatoryHistory) {
    throw new Error(`Dossier regulatory history required for device: ${dossier.core.deviceCode}. Add regulatory history in the device dossier.`);
  }

  const lines: string[] = ["## REGULATORY CONTEXT"];
  
  const certs = regulatoryHistory.certificates as any[] || [];
  const activeCerts = certs.filter(c => c.status === "Active");
  if (activeCerts.length > 0) {
    lines.push("");
    lines.push("**Active Certificates:**");
    for (const cert of activeCerts) {
      lines.push(`- ${cert.type} (${cert.notifiedBody}) - Expires: ${cert.expiryDate}`);
    }
  }
  
  const commitments = regulatoryHistory.nbCommitments as any[] || [];
  const openCommitments = commitments.filter(c => c.status !== "Completed");
  if (openCommitments.length > 0) {
    lines.push("");
    lines.push("**Outstanding NB Commitments:**");
    for (const commit of openCommitments) {
      const dueStr = commit.dueDate ? ` (Due: ${commit.dueDate})` : "";
      lines.push(`- ${commit.description} [${commit.status}]${dueStr}`);
    }
  }
  
  const fscas = regulatoryHistory.fscaHistory as any[] || [];
  if (fscas.length > 0) {
    lines.push("");
    lines.push("**FSCA History:**");
    for (const fsca of fscas.slice(0, 3)) {
      lines.push(`- ${fsca.type}: ${fsca.description} (${fsca.initiationDate}) [${fsca.status}]`);
    }
  }
  
  const changes = regulatoryHistory.designChanges as any[] || [];
  const recentChanges = changes.slice(0, 3);
  if (recentChanges.length > 0) {
    lines.push("");
    lines.push("**Recent Design Changes:**");
    for (const change of recentChanges) {
      lines.push(`- ${change.description} (${change.effectiveDate}) [${change.significance}]`);
    }
  }
  
  return lines.join("\n");
}

function buildBaselineContextString(
  dossier: FullDeviceDossier,
  periodStart?: string,
  periodEnd?: string
): string {
  const { baselines } = dossier;
  if (!baselines || baselines.length === 0) {
    throw new Error(`Dossier performance baselines required for device: ${dossier.core.deviceCode}. Add at least one baseline in the device dossier.`);
  }

  const lines: string[] = ["## PERFORMANCE BASELINES"];
  
  // Group baselines by metric type
  const byType = new Map<string, DossierBaseline[]>();
  for (const baseline of baselines) {
    const existing = byType.get(baseline.metricType) || [];
    existing.push(baseline);
    byType.set(baseline.metricType, existing);
  }
  
  for (const [metricType, typeBaselines] of byType) {
    const mostRecent = typeBaselines[0]; // Already sorted by periodEnd desc
    
    lines.push("");
    lines.push(`**${formatMetricType(metricType)}:**`);
    lines.push(`- Current Baseline: ${mostRecent.value} ${mostRecent.unit || ""}`);
    lines.push(`- Period: ${mostRecent.periodStart?.toISOString().split("T")[0]} to ${mostRecent.periodEnd?.toISOString().split("T")[0]}`);
    
    if (mostRecent.methodology) {
      lines.push(`- Methodology: ${mostRecent.methodology}`);
    }
    
    // Show trend if multiple baselines exist
    if (typeBaselines.length > 1) {
      const previous = typeBaselines[1];
      const currentVal = parseFloat(mostRecent.value);
      const previousVal = parseFloat(previous.value);
      if (!isNaN(currentVal) && !isNaN(previousVal) && previousVal !== 0) {
        const changePercent = ((currentVal - previousVal) / previousVal * 100).toFixed(1);
        const direction = currentVal > previousVal ? "increase" : "decrease";
        lines.push(`- Trend: ${Math.abs(parseFloat(changePercent))}% ${direction} from prior period`);
      }
    }
  }
  
  return lines.join("\n");
}

function buildPriorPsurContextString(priorPsur: DossierPriorPsur | null, deviceCode: string): string {
  if (!priorPsur) {
    throw new Error(`Prior PSUR record required for device: ${deviceCode}. Add prior PSUR period and conclusion in the device dossier.`);
  }

  const lines: string[] = ["## PRIOR PSUR SUMMARY"];
  
  lines.push("");
  lines.push(`**Period:** ${priorPsur.periodStart?.toISOString().split("T")[0]} to ${priorPsur.periodEnd?.toISOString().split("T")[0]}`);
  
  if (priorPsur.psurReference) {
    lines.push(`**Reference:** ${priorPsur.psurReference}`);
  }
  
  if (priorPsur.benefitRiskConclusion) {
    lines.push(`**B/R Conclusion:** ${priorPsur.benefitRiskConclusion}`);
  }
  
  if (priorPsur.keyFindings?.length) {
    lines.push("");
    lines.push("**Key Findings:**");
    for (const finding of priorPsur.keyFindings) {
      lines.push(`- ${finding}`);
    }
  }
  
  const actions = priorPsur.actionsRequired as any[] || [];
  const openActions = actions.filter(a => !a.completed);
  if (openActions.length > 0) {
    lines.push("");
    lines.push("**Outstanding Actions from Prior PSUR:**");
    for (const action of openActions) {
      const dueStr = action.dueDate ? ` (Due: ${action.dueDate})` : "";
      lines.push(`- ${action.description}${dueStr}`);
    }
  }
  
  const metrics = priorPsur.periodMetrics as any;
  if (metrics) {
    lines.push("");
    lines.push("**Prior Period Metrics:**");
    if (metrics.totalUnits) {
      lines.push(`- Units Distributed: ${metrics.totalUnits.toLocaleString()}`);
    }
    if (metrics.complaintRate !== undefined) {
      lines.push(`- Complaint Rate: ${metrics.complaintRate} per 1,000 units`);
    }
    if (metrics.seriousIncidents !== undefined) {
      lines.push(`- Serious Incidents: ${metrics.seriousIncidents}`);
    }
  }
  
  return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function getMostRecentPriorPsur(
  priorPsurs: DossierPriorPsur[],
  beforeDate: string
): DossierPriorPsur | null {
  const beforeTimestamp = new Date(beforeDate).getTime();
  
  for (const psur of priorPsurs) {
    if (psur.periodEnd && psur.periodEnd.getTime() < beforeTimestamp) {
      return psur;
    }
  }
  
  return null;
}

function extractRiskThresholds(riskContext: DossierRiskContext | null): RiskThresholds | null {
  if (!riskContext?.riskThresholds) {
    return null;
  }
  
  const thresholds = riskContext.riskThresholds as any;
  return {
    complaintRateThreshold: thresholds.complaintRateThreshold || 0,
    seriousIncidentThreshold: thresholds.seriousIncidentThreshold || 0,
    signalDetectionMethod: thresholds.signalDetectionMethod || "Not specified",
  };
}

function extractClinicalBenefits(clinicalContext: DossierClinicalContext | null): ClinicalBenefit[] {
  if (!clinicalContext?.clinicalBenefits) {
    return [];
  }
  
  const benefits = clinicalContext.clinicalBenefits as ClinicalBenefit[];
  return benefits.map(b => ({
    benefitId: b.benefitId,
    description: b.description,
    endpoint: b.endpoint,
    evidenceSource: b.evidenceSource,
    quantifiedValue: b.quantifiedValue,
  }));
}

function extractPerformanceBaselines(baselines: DossierBaseline[]): PerformanceBaseline[] {
  return baselines.map(b => ({
    metricType: b.metricType,
    value: parseFloat(b.value) || 0,
    unit: b.unit || "",
    periodStart: b.periodStart?.toISOString() || "",
    periodEnd: b.periodEnd?.toISOString() || "",
    methodology: b.methodology || undefined,
  }));
}

function mapToPriorPsurSummary(psur: DossierPriorPsur): PriorPsurSummary {
  const actions = psur.actionsRequired as any[] || [];
  const metrics = psur.periodMetrics as any;
  
  return {
    periodStart: psur.periodStart?.toISOString() || "",
    periodEnd: psur.periodEnd?.toISOString() || "",
    psurReference: psur.psurReference || undefined,
    benefitRiskConclusion: psur.benefitRiskConclusion || "Unknown",
    keyFindings: psur.keyFindings || [],
    actionsRequired: actions.map(a => ({
      actionId: a.actionId,
      description: a.description,
      completed: a.completed,
      dueDate: a.dueDate,
    })),
    periodMetrics: metrics ? {
      totalUnits: metrics.totalUnits,
      complaintRate: metrics.complaintRate,
      seriousIncidents: metrics.seriousIncidents,
    } : undefined,
  };
}

function formatMetricType(metricType: string): string {
  return metricType
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETENESS SCORING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate and update the completeness score for a dossier.
 */
export async function updateCompletenessScore(deviceCode: string): Promise<number> {
  const dossier = await getFullDossier(deviceCode);
  
  if (!dossier) {
    return 0;
  }
  
  let score = 0;
  const weights = {
    identity: 15,           // Trade name, device code, classification
    clinicalContext: 25,    // Intended purpose, benefits, population
    riskContext: 20,        // Principal risks, thresholds
    clinicalEvidence: 15,   // CER, PMCF
    regulatoryHistory: 10,  // Certificates, commitments
    priorPsurs: 10,         // Prior PSUR data
    baselines: 5,           // Performance baselines
  };
  
  // Identity (15 points)
  if (dossier.core.tradeName) score += 5;
  if (dossier.core.classification) score += 5;
  if (dossier.core.basicUdiDi) score += 5;
  
  // Clinical Context (25 points)
  if (dossier.clinicalContext?.intendedPurpose) score += 10;
  const benefits = dossier.clinicalContext?.clinicalBenefits as any[] || [];
  if (benefits.length > 0) score += 10;
  if (dossier.clinicalContext?.targetPopulation) score += 5;
  
  // Risk Context (20 points)
  const risks = dossier.riskContext?.principalRisks as any[] || [];
  if (risks.length > 0) score += 10;
  if (dossier.riskContext?.riskThresholds) score += 10;
  
  // Clinical Evidence (15 points)
  if (dossier.clinicalEvidence?.cerConclusions) score += 8;
  if (dossier.clinicalEvidence?.pmcfPlan) score += 7;
  
  // Regulatory History (10 points)
  const certs = dossier.regulatoryHistory?.certificates as any[] || [];
  if (certs.length > 0) score += 5;
  const commitments = dossier.regulatoryHistory?.nbCommitments as any[] || [];
  if (commitments.length > 0 || certs.length > 0) score += 5;
  
  // Prior PSURs (10 points)
  if (dossier.priorPsurs.length > 0) score += 10;
  
  // Baselines (5 points)
  if (dossier.baselines.length > 0) score += 5;
  
  // Update the score in the database
  await db
    .update(deviceDossiers)
    .set({ completenessScore: score, lastValidatedAt: new Date() })
    .where(eq(deviceDossiers.deviceCode, deviceCode));
  
  return score;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-POPULATE (LLM EXTRACTOR → DOSSIER)
// ═══════════════════════════════════════════════════════════════════════════════

export interface AutoPopulateEvidenceItem {
  evidenceType: string;
  confidence?: number;
  data: Record<string, any>;
  sourceName?: string;
  sourceFile?: string;
}

export interface AutoPopulateOptions {
  overwrite?: boolean; // default: false (only fill missing)
  useLLMInference?: boolean; // default: true (infer dossier patch from extracted evidence)
}

export interface AutoPopulateResult {
  deviceCode: string;
  overwrite: boolean;
  evidenceItemsProcessed: number;
  evidenceTypesUsed: Record<string, number>;
  applied: {
    core: boolean;
    clinicalContext: boolean;
    riskContext: boolean;
    clinicalEvidence: boolean;
    regulatoryHistory: boolean;
    priorPsursAdded: number;
    priorPsursUpdated: number;
  };
  filledFields: string[];
  warnings: string[];
  llmInference?: {
    attempted: boolean;
    applied: boolean;
    provider?: string;
    model?: string;
    latencyMs?: number;
    filledFields?: string[];
    warnings?: string[];
    error?: string;
  };
}

function asString(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function asStringArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(asString).filter(Boolean) as string[];
  const s = asString(v);
  if (!s) return [];
  // Common delimiters in extracted text
  return s
    .split(/\r?\n|;|•|\u2022|\t/)
    .map(x => x.trim())
    .filter(Boolean);
}

function mergeString(existing: any, incoming: any, overwrite: boolean): string | null {
  const inc = asString(incoming);
  if (!inc) return asString(existing);
  if (overwrite) return inc;
  const ex = asString(existing);
  return ex || inc;
}

function mergeStringArray(existing: any, incoming: any, overwrite: boolean): string[] {
  const incArr = asStringArray(incoming);
  const exArr = asStringArray(existing);
  if (overwrite) return incArr.length ? incArr : exArr;
  const set = new Set<string>(exArr);
  for (const s of incArr) set.add(s);
  return Array.from(set);
}

function normalizeRiskClass(v: any): "I" | "IIa" | "IIb" | "III" | null {
  const s = asString(v);
  if (!s) return null;
  const normalized = s.replace(/\s+/g, "").toUpperCase();
  if (normalized === "I") return "I";
  if (normalized === "IIA") return "IIa";
  if (normalized === "IIB") return "IIb";
  if (normalized === "III") return "III";
  return null;
}

function safeDateString(v: any): string | null {
  const s = asString(v);
  if (!s) return null;
  // accept YYYY-MM-DD or ISO; attempt parse
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function pickBestByConfidence(items: AutoPopulateEvidenceItem[]): AutoPopulateEvidenceItem | null {
  if (items.length === 0) return null;
  return [...items].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0] || null;
}

// -------------------------
// LLM-based inference of dossier fields from extracted evidence
// -------------------------

const DossierInferenceSchema = z.object({
  core: z.object({
    tradeName: z.string().min(1).optional(),
    manufacturerName: z.string().min(1).optional(),
    basicUdiDi: z.string().min(1).optional(),
    classification: z.object({
      class: z.enum(["I", "IIa", "IIb", "III"]),
      rule: z.string().optional(),
      rationale: z.string().optional(),
    }).optional(),
    marketEntryDate: z.string().optional(), // YYYY-MM-DD
  }).optional(),
  clinicalContext: z.object({
    intendedPurpose: z.string().optional(),
    indications: z.array(z.string()).optional(),
    contraindications: z.array(z.string()).optional(),
    targetPopulation: z.object({
      description: z.string(),
      ageRange: z.object({ min: z.number(), max: z.number() }).optional(),
      conditions: z.array(z.string()),
      excludedPopulations: z.array(z.string()),
    }).optional(),
    clinicalBenefits: z.array(z.object({
      benefitId: z.string().min(1),
      description: z.string().min(1),
      endpoint: z.string().min(1),
      evidenceSource: z.string().min(1),
      quantifiedValue: z.string().optional(),
    })).optional(),
    alternativeTreatments: z.array(z.string()).optional(),
    stateOfTheArt: z.object({
      description: z.string(),
      benchmarkDevices: z.array(z.string()),
      performanceThresholds: z.record(z.number()),
    }).optional(),
  }).optional(),
  riskContext: z.object({
    principalRisks: z.array(z.object({
      riskId: z.string().min(1),
      hazard: z.string().min(1),
      harm: z.string().min(1),
      severity: z.enum(["Negligible", "Minor", "Serious", "Critical", "Catastrophic"]),
      probability: z.string(),
      preMarketOccurrenceRate: z.number().optional(),
      mitigations: z.array(z.string()),
      residualRiskAcceptable: z.boolean(),
    })).optional(),
    residualRiskAcceptability: z.object({
      criteria: z.string(),
      afapAnalysisSummary: z.string(),
    }).optional(),
    riskThresholds: z.object({
      complaintRateThreshold: z.number(),
      seriousIncidentThreshold: z.number(),
      signalDetectionMethod: z.string(),
    }).optional(),
    hazardCategories: z.array(z.string()).optional(),
  }).optional(),
  clinicalEvidence: z.object({
    cerConclusions: z.object({
      lastUpdateDate: z.string(),
      benefitRiskConclusion: z.string(),
      keyFindings: z.array(z.string()),
      dataGapsIdentified: z.array(z.string()),
    }).optional(),
    pmcfPlan: z.object({
      objectives: z.array(z.string()),
      endpoints: z.array(z.object({
        endpointId: z.string(),
        description: z.string(),
        targetValue: z.string().optional(),
        measurementMethod: z.string().optional(),
      })).optional(),
      targetEnrollment: z.number().optional(),
      currentStatus: z.string(),
      studyIds: z.array(z.string()).optional(),
    }).optional(),
    literatureSearchProtocol: z.object({
      databases: z.array(z.string()),
      searchStrings: z.array(z.string()),
      inclusionCriteria: z.array(z.string()),
      exclusionCriteria: z.array(z.string()),
      lastSearchDate: z.string(),
    }).optional(),
    externalDbSearchProtocol: z.object({
      databases: z.array(z.string()),
      queryTerms: z.array(z.string()),
      dateRange: z.string().optional(),
      lastSearchDate: z.string(),
      relevanceCriteria: z.array(z.string()),
    }).optional(),
  }).optional(),
  regulatoryHistory: z.object({
    certificates: z.array(z.object({
      certificateId: z.string(),
      type: z.string(),
      notifiedBody: z.string(),
      issueDate: z.string(),
      expiryDate: z.string(),
      scope: z.string(),
      status: z.enum(["Active", "Expired", "Suspended", "Withdrawn"]),
    })).optional(),
    nbCommitments: z.array(z.object({
      commitmentId: z.string(),
      description: z.string(),
      source: z.string(),
      dueDate: z.string().optional(),
      status: z.enum(["Open", "In Progress", "Completed", "Overdue"]),
      completedDate: z.string().optional(),
      evidence: z.string().optional(),
    })).optional(),
    fscaHistory: z.array(z.object({
      fscaId: z.string(),
      type: z.string(),
      initiationDate: z.string(),
      description: z.string(),
      affectedUnits: z.number().optional(),
      regions: z.array(z.string()),
      status: z.enum(["Active", "Completed"]),
      completionDate: z.string().optional(),
    })).optional(),
    designChanges: z.array(z.object({
      changeId: z.string(),
      description: z.string(),
      effectiveDate: z.string(),
      type: z.string(),
      significance: z.enum(["Significant", "Non-Significant"]),
      regulatoryImpact: z.string(),
    })).optional(),
  }).optional(),
}).strict();

type DossierInference = z.infer<typeof DossierInferenceSchema>;

async function inferDossierPatchFromEvidence(
  deviceCode: string,
  evidence: AutoPopulateEvidenceItem[]
): Promise<{ patch: DossierInference; provider: string; model: string; latencyMs: number }> {
  const evidenceBrief = evidence.slice(0, 120).map(e => ({
    evidenceType: e.evidenceType,
    confidence: e.confidence ?? null,
    sourceFile: e.sourceFile ?? null,
    sourceName: e.sourceName ?? null,
    data: e.data,
  }));

  const { data, response } = await completeJSON<DossierInference>(
    {
      agentId: "DeviceDossierInference",
      traceContext: { operation: "dossier_auto_populate_infer" },
      config: {
        provider: "auto",
        model: "gpt-4o",
        temperature: 0.0,
        maxTokens: 4096,
        timeout: 120000,
      },
      messages: [
        {
          role: "system",
          content:
            "You are a medical device regulatory data extraction specialist. " +
            "You must ONLY infer dossier fields from the provided extracted evidence items. " +
            "DO NOT invent values. If a field is not supported by evidence, omit it. " +
            "Prefer verbatim phrasing where possible. Output valid JSON only.",
        },
        {
          role: "user",
          content:
            `Device code: ${deviceCode}\n\n` +
            "Extracted evidence items (structured):\n" +
            JSON.stringify(evidenceBrief, null, 2) +
            "\n\nExtract every dossier field that has support in the evidence. Return a JSON object with optional sections:\n" +
            "core: tradeName, manufacturerName, basicUdiDi, classification { class (I|IIa|IIb|III), rule, rationale }, marketEntryDate (YYYY-MM-DD).\n" +
            "clinicalContext: intendedPurpose, indications[], contraindications[], targetPopulation { description, ageRange { min, max }, conditions[], excludedPopulations[] }, clinicalBenefits[] { benefitId, description, endpoint, evidenceSource, quantifiedValue }, alternativeTreatments[], stateOfTheArt { description, benchmarkDevices[], performanceThresholds{} }.\n" +
            "riskContext: principalRisks[] { riskId, hazard, harm, severity (Negligible|Minor|Serious|Critical|Catastrophic), probability, preMarketOccurrenceRate, mitigations[], residualRiskAcceptable }, residualRiskAcceptability { criteria, afapAnalysisSummary }, riskThresholds { complaintRateThreshold, seriousIncidentThreshold, signalDetectionMethod }, hazardCategories[].\n" +
            "clinicalEvidence: cerConclusions { lastUpdateDate, benefitRiskConclusion, keyFindings[], dataGapsIdentified[] }, pmcfPlan { objectives[], endpoints[] { endpointId, description, targetValue, measurementMethod }, targetEnrollment, currentStatus, studyIds[] }, literatureSearchProtocol { databases[], searchStrings[], inclusionCriteria[], exclusionCriteria[], lastSearchDate }, externalDbSearchProtocol { databases[], queryTerms[], dateRange, lastSearchDate, relevanceCriteria[] }.\n" +
            "regulatoryHistory: certificates[] { certificateId, type, notifiedBody, issueDate, expiryDate, scope, status (Active|Expired|Suspended|Withdrawn) }, nbCommitments[] { commitmentId, description, source, dueDate, status (Open|In Progress|Completed|Overdue), completedDate, evidence }, fscaHistory[] { fscaId, type, initiationDate, description, affectedUnits, regions[], status (Active|Completed), completionDate }, designChanges[] { changeId, description, effectiveDate, type, significance (Significant|Non-Significant), regulatoryImpact }.\n" +
            "Rules: Never hallucinate. If not present, omit. Use YYYY-MM-DD for dates. Infer only from explicit evidence.\n",
        },
      ],
    },
    (v): v is DossierInference => DossierInferenceSchema.safeParse(v).success
  );

  return { patch: data, provider: response.provider, model: response.model, latencyMs: response.latencyMs };
}

async function applyInferredPatchToDossier(
  deviceCode: string,
  patch: DossierInference,
  overwrite: boolean
): Promise<{ applied: boolean; filledFields: string[]; warnings: string[] }> {
  const filledFields: string[] = [];
  const warnings: string[] = [];

  const dossier = await getFullDossier(deviceCode);
  if (!dossier) throw new Error(`Dossier not found for deviceCode=${deviceCode}`);

  let applied = false;

  // Core
  if (patch.core) {
    const coreUpdates: Partial<InsertDeviceDossier> = {};
    const nextTradeName = mergeString(dossier.core.tradeName, patch.core.tradeName, overwrite);
    if (nextTradeName && nextTradeName !== dossier.core.tradeName) {
      coreUpdates.tradeName = nextTradeName;
      filledFields.push("core.tradeName");
    }
    const nextManufacturer = mergeString(dossier.core.manufacturerName, patch.core.manufacturerName, overwrite);
    if (nextManufacturer && nextManufacturer !== dossier.core.manufacturerName) {
      coreUpdates.manufacturerName = nextManufacturer;
      filledFields.push("core.manufacturerName");
    }
    const nextUdi = mergeString(dossier.core.basicUdiDi, patch.core.basicUdiDi, overwrite);
    if (nextUdi && nextUdi !== dossier.core.basicUdiDi) {
      coreUpdates.basicUdiDi = nextUdi;
      filledFields.push("core.basicUdiDi");
    }
    if (patch.core.classification && (overwrite || !dossier.core.classification)) {
      coreUpdates.classification = {
        class: patch.core.classification.class,
        rule: patch.core.classification.rule || (dossier.core.classification as any)?.rule || "",
        rationale: patch.core.classification.rationale || (dossier.core.classification as any)?.rationale || "",
      } as any;
      filledFields.push("core.classification");
    }
    const dateStr = safeDateString(patch.core.marketEntryDate);
    if (dateStr && (overwrite || !dossier.core.marketEntryDate)) {
      coreUpdates.marketEntryDate = new Date(dateStr) as any;
      filledFields.push("core.marketEntryDate");
    }
    if (Object.keys(coreUpdates).length) {
      await updateDossier(deviceCode, coreUpdates);
      applied = true;
    }
  }

  // Clinical context
  if (patch.clinicalContext) {
    const existing = dossier.clinicalContext;
    const next: any = {
      intendedPurpose: existing?.intendedPurpose || "",
      indications: existing?.indications || [],
      contraindications: existing?.contraindications || [],
      targetPopulation: existing?.targetPopulation,
      clinicalBenefits: existing?.clinicalBenefits || [],
      alternativeTreatments: existing?.alternativeTreatments || [],
      stateOfTheArt: existing?.stateOfTheArt,
    };

    next.intendedPurpose = mergeString(next.intendedPurpose, patch.clinicalContext.intendedPurpose, overwrite) || next.intendedPurpose;
    next.indications = mergeStringArray(next.indications, patch.clinicalContext.indications, overwrite);
    next.contraindications = mergeStringArray(next.contraindications, patch.clinicalContext.contraindications, overwrite);
    if (patch.clinicalContext.targetPopulation && (overwrite || !next.targetPopulation)) {
      next.targetPopulation = patch.clinicalContext.targetPopulation as any;
    }
    if (patch.clinicalContext.clinicalBenefits && (overwrite || !(next.clinicalBenefits as any[])?.length)) {
      next.clinicalBenefits = patch.clinicalContext.clinicalBenefits as any;
    }
    next.alternativeTreatments = mergeStringArray(next.alternativeTreatments, patch.clinicalContext.alternativeTreatments, overwrite);
    if (patch.clinicalContext.stateOfTheArt && (overwrite || !next.stateOfTheArt)) {
      next.stateOfTheArt = patch.clinicalContext.stateOfTheArt as any;
    }

    if (asString(next.intendedPurpose) && JSON.stringify(next) !== JSON.stringify(existing || {})) {
      await upsertClinicalContext(deviceCode, { ...next, intendedPurpose: next.intendedPurpose });
      applied = true;
      if (patch.clinicalContext.clinicalBenefits?.length) filledFields.push("clinical.clinicalBenefits");
      if (patch.clinicalContext.stateOfTheArt) filledFields.push("clinical.stateOfTheArt");
    } else if (!asString(next.intendedPurpose)) {
      warnings.push("LLM inference did not produce clinical intended purpose; cannot upsert clinical context without it.");
    }
  }

  // Risk context
  if (patch.riskContext) {
    const existing = dossier.riskContext;
    const next: any = {
      principalRisks: existing?.principalRisks || [],
      residualRiskAcceptability: existing?.residualRiskAcceptability || { criteria: "", afapAnalysisSummary: "" },
      riskThresholds: existing?.riskThresholds,
      hazardCategories: existing?.hazardCategories || [],
    };

    if (patch.riskContext.principalRisks && (overwrite || !(next.principalRisks as any[])?.length)) {
      next.principalRisks = patch.riskContext.principalRisks as any;
      filledFields.push("risk.principalRisks");
    }
    if (patch.riskContext.residualRiskAcceptability && (overwrite || !existing?.residualRiskAcceptability)) {
      next.residualRiskAcceptability = patch.riskContext.residualRiskAcceptability as any;
      filledFields.push("risk.residualRiskAcceptability");
    }
    if (patch.riskContext.riskThresholds && (overwrite || !existing?.riskThresholds)) {
      next.riskThresholds = patch.riskContext.riskThresholds as any;
      filledFields.push("risk.riskThresholds");
    }
    next.hazardCategories = mergeStringArray(next.hazardCategories, patch.riskContext.hazardCategories, overwrite);

    if (JSON.stringify(next) !== JSON.stringify(existing || {})) {
      await upsertRiskContext(deviceCode, next);
      applied = true;
    }
  }

  // Clinical evidence
  if (patch.clinicalEvidence) {
    const existing = dossier.clinicalEvidence;
    const next: any = {
      cerConclusions: existing?.cerConclusions,
      pmcfPlan: existing?.pmcfPlan,
      literatureSearchProtocol: existing?.literatureSearchProtocol,
      externalDbSearchProtocol: existing?.externalDbSearchProtocol,
      equivalentDevices: existing?.equivalentDevices,
    };

    if (patch.clinicalEvidence.cerConclusions && (overwrite || !next.cerConclusions)) {
      next.cerConclusions = patch.clinicalEvidence.cerConclusions as any;
      filledFields.push("clinicalEvidence.cerConclusions");
    }
    if (patch.clinicalEvidence.pmcfPlan && (overwrite || !next.pmcfPlan)) {
      next.pmcfPlan = patch.clinicalEvidence.pmcfPlan as any;
      filledFields.push("clinicalEvidence.pmcfPlan");
    }
    if (patch.clinicalEvidence.literatureSearchProtocol && (overwrite || !next.literatureSearchProtocol)) {
      next.literatureSearchProtocol = patch.clinicalEvidence.literatureSearchProtocol as any;
      filledFields.push("clinicalEvidence.literatureSearchProtocol");
    }
    if (patch.clinicalEvidence.externalDbSearchProtocol && (overwrite || !next.externalDbSearchProtocol)) {
      next.externalDbSearchProtocol = patch.clinicalEvidence.externalDbSearchProtocol as any;
      filledFields.push("clinicalEvidence.externalDbSearchProtocol");
    }

    if (JSON.stringify(next) !== JSON.stringify(existing || {})) {
      await upsertClinicalEvidence(deviceCode, next);
      applied = true;
    }
  }

  // Regulatory history
  if (patch.regulatoryHistory) {
    const existing = dossier.regulatoryHistory;
    const next: any = {
      certificates: existing?.certificates || [],
      nbCommitments: existing?.nbCommitments || [],
      fscaHistory: existing?.fscaHistory || [],
      designChanges: existing?.designChanges || [],
    };

    if (patch.regulatoryHistory.certificates && (overwrite || !(next.certificates as any[])?.length)) {
      next.certificates = patch.regulatoryHistory.certificates as any;
      filledFields.push("regulatory.certificates");
    }
    if (patch.regulatoryHistory.nbCommitments && (overwrite || !(next.nbCommitments as any[])?.length)) {
      next.nbCommitments = patch.regulatoryHistory.nbCommitments as any;
      filledFields.push("regulatory.nbCommitments");
    }
    if (patch.regulatoryHistory.fscaHistory && (overwrite || !(next.fscaHistory as any[])?.length)) {
      next.fscaHistory = patch.regulatoryHistory.fscaHistory as any;
      filledFields.push("regulatory.fscaHistory");
    }
    if (patch.regulatoryHistory.designChanges && (overwrite || !(next.designChanges as any[])?.length)) {
      next.designChanges = patch.regulatoryHistory.designChanges as any;
      filledFields.push("regulatory.designChanges");
    }

    if (JSON.stringify(next) !== JSON.stringify(existing || {})) {
      await upsertRegulatoryHistory(deviceCode, next);
      applied = true;
    }
  }

  return { applied, filledFields: Array.from(new Set(filledFields)), warnings: Array.from(new Set(warnings)) };
}

export async function autoPopulateDossierFromEvidence(
  deviceCode: string,
  evidence: AutoPopulateEvidenceItem[],
  options: AutoPopulateOptions = {}
): Promise<AutoPopulateResult> {
  const overwrite = options.overwrite === true;
  const useLLMInference = options.useLLMInference !== false;

  const dossier = await getFullDossier(deviceCode);
  if (!dossier) {
    throw new Error(`Dossier not found for deviceCode=${deviceCode}`);
  }

  const evidenceTypesUsed: Record<string, number> = {};
  for (const e of evidence) {
    evidenceTypesUsed[e.evidenceType] = (evidenceTypesUsed[e.evidenceType] || 0) + 1;
  }

  const filledFields: string[] = [];
  const warnings: string[] = [];

  // Group evidence by type
  const byType = new Map<string, AutoPopulateEvidenceItem[]>();
  for (const e of evidence) {
    const arr = byType.get(e.evidenceType) || [];
    arr.push(e);
    byType.set(e.evidenceType, arr);
  }

  // -------------------------
  // CORE (device_dossiers)
  // -------------------------
  const coreUpdates: Partial<InsertDeviceDossier> = {};

  const deviceRegistry = pickBestByConfidence(byType.get("device_registry_record") || []);
  const manufacturerProfile = pickBestByConfidence(byType.get("manufacturer_profile") || []);

  if (deviceRegistry?.data) {
    const tradeName =
      deviceRegistry.data.device_name ??
      deviceRegistry.data.deviceName ??
      deviceRegistry.data.trade_name ??
      deviceRegistry.data.tradeName;
    const manufacturer =
      deviceRegistry.data.manufacturer ??
      deviceRegistry.data.manufacturer_name ??
      deviceRegistry.data.manufacturerName;
    const udi =
      deviceRegistry.data.udi_di ??
      deviceRegistry.data.udiDi ??
      deviceRegistry.data.basic_udi_di ??
      deviceRegistry.data.basicUdiDi;
    const riskClass =
      deviceRegistry.data.risk_class ??
      deviceRegistry.data.riskClass ??
      deviceRegistry.data.classification;

    const mergedTradeName = mergeString(dossier.core.tradeName, tradeName, overwrite);
    if (mergedTradeName && mergedTradeName !== dossier.core.tradeName) {
      coreUpdates.tradeName = mergedTradeName;
      filledFields.push("core.tradeName");
    }

    const mergedManufacturer = mergeString(dossier.core.manufacturerName, manufacturer, overwrite);
    if (mergedManufacturer && mergedManufacturer !== dossier.core.manufacturerName) {
      coreUpdates.manufacturerName = mergedManufacturer;
      filledFields.push("core.manufacturerName");
    }

    const mergedUdi = mergeString(dossier.core.basicUdiDi, udi, overwrite);
    if (mergedUdi && mergedUdi !== dossier.core.basicUdiDi) {
      coreUpdates.basicUdiDi = mergedUdi;
      filledFields.push("core.basicUdiDi");
    }

    const cls = normalizeRiskClass(riskClass);
    if (cls) {
      const existing = dossier.core.classification as any;
      const next = overwrite
        ? { class: cls, rule: existing?.rule || "", rationale: existing?.rationale || "" }
        : (existing?.class ? existing : { class: cls, rule: "", rationale: "" });
      if (!existing?.class || overwrite) {
        coreUpdates.classification = next as any;
        filledFields.push("core.classification.class");
      }
    }
  }

  if (manufacturerProfile?.data) {
    const manufacturer =
      manufacturerProfile.data.manufacturer_name ??
      manufacturerProfile.data.manufacturerName ??
      manufacturerProfile.data.name;
    const mergedManufacturer = mergeString(dossier.core.manufacturerName, manufacturer, overwrite);
    if (mergedManufacturer && mergedManufacturer !== dossier.core.manufacturerName) {
      coreUpdates.manufacturerName = mergedManufacturer;
      filledFields.push("core.manufacturerName");
    }
  }

  const coreApplied = Object.keys(coreUpdates).length > 0;
  if (coreApplied) {
    await updateDossier(deviceCode, coreUpdates);
  }

  // -------------------------
  // CLINICAL CONTEXT
  // -------------------------
  const existingClinical = dossier.clinicalContext;
  const ifu = pickBestByConfidence(byType.get("ifu_extract") || []);

  const clinicalUpdate: any = {};
  if (existingClinical) {
    clinicalUpdate.intendedPurpose = existingClinical.intendedPurpose;
    clinicalUpdate.indications = existingClinical.indications;
    clinicalUpdate.contraindications = existingClinical.contraindications;
    clinicalUpdate.targetPopulation = existingClinical.targetPopulation;
    clinicalUpdate.clinicalBenefits = existingClinical.clinicalBenefits;
    clinicalUpdate.alternativeTreatments = existingClinical.alternativeTreatments;
    clinicalUpdate.stateOfTheArt = existingClinical.stateOfTheArt;
  } else {
    clinicalUpdate.intendedPurpose = "";
    clinicalUpdate.indications = [];
    clinicalUpdate.contraindications = [];
    clinicalUpdate.targetPopulation = undefined;
    clinicalUpdate.clinicalBenefits = [];
    clinicalUpdate.alternativeTreatments = [];
    clinicalUpdate.stateOfTheArt = undefined;
  }

  if (ifu?.data) {
    clinicalUpdate.intendedPurpose = mergeString(
      clinicalUpdate.intendedPurpose,
      ifu.data.intended_use ?? ifu.data.intendedUse ?? ifu.data.intended_purpose ?? ifu.data.intendedPurpose,
      overwrite
    ) || clinicalUpdate.intendedPurpose;
    if (clinicalUpdate.intendedPurpose && (!existingClinical?.intendedPurpose || overwrite)) {
      filledFields.push("clinical.intendedPurpose");
    }

    clinicalUpdate.indications = mergeStringArray(
      clinicalUpdate.indications,
      ifu.data.indications,
      overwrite
    );
    if (clinicalUpdate.indications.length && (!existingClinical?.indications?.length || overwrite)) {
      filledFields.push("clinical.indications");
    }

    clinicalUpdate.contraindications = mergeStringArray(
      clinicalUpdate.contraindications,
      ifu.data.contraindications,
      overwrite
    );
    if (clinicalUpdate.contraindications.length && (!existingClinical?.contraindications?.length || overwrite)) {
      filledFields.push("clinical.contraindications");
    }
  }

  // Ensure required field intendedPurpose is not empty if we need to upsert
  const clinicalHasMinimum = asString(clinicalUpdate.intendedPurpose) || existingClinical?.intendedPurpose;
  const clinicalApplied =
    (ifu?.data && asString(clinicalUpdate.intendedPurpose) !== asString(existingClinical?.intendedPurpose)) ||
    (ifu?.data && JSON.stringify(clinicalUpdate.indications || []) !== JSON.stringify(existingClinical?.indications || [])) ||
    (ifu?.data && JSON.stringify(clinicalUpdate.contraindications || []) !== JSON.stringify(existingClinical?.contraindications || []));

  if (clinicalApplied) {
    if (!clinicalHasMinimum) {
      warnings.push("Clinical Context: intended purpose could not be extracted from uploaded documents.");
    } else {
      await upsertClinicalContext(deviceCode, {
        ...clinicalUpdate,
        intendedPurpose: (asString(clinicalUpdate.intendedPurpose) || existingClinical?.intendedPurpose || "") as string,
      });
    }
  }

  // -------------------------
  // RISK CONTEXT
  // -------------------------
  const existingRisk = dossier.riskContext;
  const riskAssessment = pickBestByConfidence(byType.get("risk_assessment") || []);
  const rmf = pickBestByConfidence(byType.get("rmf_extract") || []);

  const riskUpdate: any = {};
  if (existingRisk) {
    riskUpdate.principalRisks = existingRisk.principalRisks;
    riskUpdate.residualRiskAcceptability = existingRisk.residualRiskAcceptability;
    riskUpdate.riskThresholds = existingRisk.riskThresholds;
    riskUpdate.hazardCategories = existingRisk.hazardCategories;
  } else {
    riskUpdate.principalRisks = [];
    riskUpdate.residualRiskAcceptability = { criteria: "", afapAnalysisSummary: "" };
    riskUpdate.riskThresholds = { complaintRateThreshold: 0, seriousIncidentThreshold: 0, signalDetectionMethod: "" };
    riskUpdate.hazardCategories = [];
  }

  const riskSources = [riskAssessment, rmf].filter(Boolean) as AutoPopulateEvidenceItem[];
  for (const src of riskSources) {
    const d = src.data || {};

    // Hazard categories
    const hazards = d.hazard_categories ?? d.hazards ?? d.hazardCategories;
    if (hazards) {
      riskUpdate.hazardCategories = mergeStringArray(riskUpdate.hazardCategories, hazards, overwrite);
      if (riskUpdate.hazardCategories.length && (!existingRisk?.hazardCategories?.length || overwrite)) {
        filledFields.push("risk.hazardCategories");
      }
    }

    // Residual risk acceptability (criteria / AFAP)
    const criteria = d.residual_risk_criteria ?? d.criteria ?? d.acceptability_criteria ?? d.acceptabilityCriteria;
    const afap = d.afap_analysis_summary ?? d.afapAnalysisSummary ?? d.afap;
    riskUpdate.residualRiskAcceptability = {
      criteria: mergeString(riskUpdate.residualRiskAcceptability?.criteria, criteria, overwrite) || "",
      afapAnalysisSummary: mergeString(riskUpdate.residualRiskAcceptability?.afapAnalysisSummary, afap, overwrite) || "",
    };
    if (asString(riskUpdate.residualRiskAcceptability.criteria) && (!existingRisk?.residualRiskAcceptability || overwrite)) {
      filledFields.push("risk.residualRiskAcceptability.criteria");
    }

    // Thresholds (if present)
    const complaintRateThreshold = d.complaint_rate_threshold ?? d.complaintRateThreshold;
    const seriousIncidentThreshold = d.serious_incident_threshold ?? d.seriousIncidentThreshold;
    const method = d.signal_detection_method ?? d.signalDetectionMethod;
    if (complaintRateThreshold !== undefined || seriousIncidentThreshold !== undefined || method !== undefined) {
      const next = {
        complaintRateThreshold: Number(complaintRateThreshold ?? riskUpdate.riskThresholds?.complaintRateThreshold ?? 0) || 0,
        seriousIncidentThreshold: Number(seriousIncidentThreshold ?? riskUpdate.riskThresholds?.seriousIncidentThreshold ?? 0) || 0,
        signalDetectionMethod: mergeString(riskUpdate.riskThresholds?.signalDetectionMethod, method, overwrite) || "",
      };
      if (overwrite || !existingRisk?.riskThresholds) {
        riskUpdate.riskThresholds = next;
        if (next.complaintRateThreshold || next.seriousIncidentThreshold || next.signalDetectionMethod) {
          filledFields.push("risk.riskThresholds");
        }
      }
    }

    // Principal risks (if extractor gives structured risks)
    const principalRisks = d.principal_risks ?? d.principalRisks ?? d.identified_risks ?? d.identifiedRisks;
    if (Array.isArray(principalRisks) && principalRisks.length) {
      if (overwrite || !(existingRisk?.principalRisks as any[])?.length) {
        riskUpdate.principalRisks = principalRisks;
        filledFields.push("risk.principalRisks");
      }
    }
  }

  const riskApplied =
    JSON.stringify(riskUpdate.principalRisks || []) !== JSON.stringify(existingRisk?.principalRisks || []) ||
    JSON.stringify(riskUpdate.residualRiskAcceptability || {}) !== JSON.stringify(existingRisk?.residualRiskAcceptability || {}) ||
    JSON.stringify(riskUpdate.riskThresholds || {}) !== JSON.stringify(existingRisk?.riskThresholds || {}) ||
    JSON.stringify(riskUpdate.hazardCategories || []) !== JSON.stringify(existingRisk?.hazardCategories || []);

  if (riskApplied) {
    await upsertRiskContext(deviceCode, riskUpdate);
  }

  // -------------------------
  // CLINICAL EVIDENCE
  // -------------------------
  const existingCE = dossier.clinicalEvidence;
  const ceUpdate: any = {};
  if (existingCE) {
    ceUpdate.cerConclusions = existingCE.cerConclusions;
    ceUpdate.pmcfPlan = existingCE.pmcfPlan;
    ceUpdate.literatureSearchProtocol = existingCE.literatureSearchProtocol;
    ceUpdate.equivalentDevices = existingCE.equivalentDevices;
  } else {
    ceUpdate.cerConclusions = undefined;
    ceUpdate.pmcfPlan = undefined;
    ceUpdate.literatureSearchProtocol = undefined;
    ceUpdate.equivalentDevices = undefined;
  }

  const clinicalEval = pickBestByConfidence(byType.get("clinical_evaluation_extract") || []);
  const bra = pickBestByConfidence(byType.get("benefit_risk_assessment") || []);
  const litStrategy = pickBestByConfidence(byType.get("literature_search_strategy") || []);
  const pmcfSummary = pickBestByConfidence(byType.get("pmcf_summary") || []);
  const pmcfResults = (byType.get("pmcf_result") || []).sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  // CER conclusions
  if (clinicalEval?.data || bra?.data) {
    const existing = ceUpdate.cerConclusions || {
      lastUpdateDate: "",
      benefitRiskConclusion: "",
      keyFindings: [],
      dataGapsIdentified: [],
    };
    const lastUpdateDate = safeDateString(clinicalEval?.data?.date ?? clinicalEval?.data?.last_update_date ?? clinicalEval?.data?.lastUpdateDate);
    const brConclusion = asString(bra?.data?.conclusion ?? bra?.data?.overall_conclusion ?? bra?.data?.benefitRiskConclusion);
    const findings = asStringArray(clinicalEval?.data?.key_findings ?? clinicalEval?.data?.keyFindings ?? clinicalEval?.data?.findings);
    const gaps = asStringArray(clinicalEval?.data?.data_gaps ?? clinicalEval?.data?.dataGapsIdentified ?? clinicalEval?.data?.gaps);

    const next = {
      lastUpdateDate: mergeString(existing.lastUpdateDate, lastUpdateDate, overwrite) || existing.lastUpdateDate || "",
      benefitRiskConclusion: mergeString(existing.benefitRiskConclusion, brConclusion, overwrite) || existing.benefitRiskConclusion || "",
      keyFindings: mergeStringArray(existing.keyFindings, findings, overwrite),
      dataGapsIdentified: mergeStringArray(existing.dataGapsIdentified, gaps, overwrite),
    };
    ceUpdate.cerConclusions = next;
    if (asString(next.benefitRiskConclusion)) filledFields.push("clinicalEvidence.cerConclusions.benefitRiskConclusion");
    if (next.keyFindings.length) filledFields.push("clinicalEvidence.cerConclusions.keyFindings");
  }

  // Literature search protocol
  if (litStrategy?.data) {
    const existing = ceUpdate.literatureSearchProtocol || {
      databases: [],
      searchStrings: [],
      inclusionCriteria: [],
      exclusionCriteria: [],
      lastSearchDate: "",
    };
    const next = {
      databases: mergeStringArray(existing.databases, litStrategy.data.databases ?? litStrategy.data.database, overwrite),
      searchStrings: mergeStringArray(existing.searchStrings, litStrategy.data.search_terms ?? litStrategy.data.searchStrings ?? litStrategy.data.searchTerms, overwrite),
      inclusionCriteria: mergeStringArray(existing.inclusionCriteria, litStrategy.data.inclusion_criteria ?? litStrategy.data.inclusionCriteria, overwrite),
      exclusionCriteria: mergeStringArray(existing.exclusionCriteria, litStrategy.data.exclusion_criteria ?? litStrategy.data.exclusionCriteria, overwrite),
      lastSearchDate: mergeString(existing.lastSearchDate, safeDateString(litStrategy.data.last_search_date ?? litStrategy.data.lastSearchDate), overwrite) || existing.lastSearchDate || "",
    };
    ceUpdate.literatureSearchProtocol = next;
    if (next.databases.length) filledFields.push("clinicalEvidence.literatureSearchProtocol.databases");
  }

  // PMCF plan (basic scaffolding from summary/results)
  if (pmcfSummary?.data || pmcfResults.length) {
    const existing = ceUpdate.pmcfPlan || {
      objectives: [],
      endpoints: [],
      targetEnrollment: undefined,
      currentStatus: "",
      studyIds: [],
    };

    const summaryObjectives = asStringArray(pmcfSummary?.data?.objectives ?? pmcfSummary?.data?.activities ?? pmcfSummary?.data?.main_findings ?? pmcfSummary?.data?.mainFindings);
    const status = asString(pmcfSummary?.data?.status ?? pmcfSummary?.data?.currentStatus ?? pmcfSummary?.data?.current_status);
    const targetEnrollment = pmcfSummary?.data?.target_enrollment ?? pmcfSummary?.data?.targetEnrollment;

    const studyIdsFromResults = pmcfResults
      .map(r => asString(r.data?.study_id ?? r.data?.studyId))
      .filter(Boolean) as string[];
    const findingsFromResults = pmcfResults
      .map(r => asString(r.data?.finding ?? r.data?.conclusion))
      .filter(Boolean) as string[];

    const next = {
      objectives: mergeStringArray(existing.objectives, [...summaryObjectives, ...findingsFromResults], overwrite),
      endpoints: existing.endpoints || [],
      targetEnrollment: overwrite
        ? (Number(targetEnrollment) || existing.targetEnrollment)
        : (existing.targetEnrollment ?? (Number(targetEnrollment) || undefined)),
      currentStatus: mergeString(existing.currentStatus, status, overwrite) || existing.currentStatus || "",
      studyIds: mergeStringArray(existing.studyIds, studyIdsFromResults, overwrite),
    };

    ceUpdate.pmcfPlan = next;
    if (next.objectives.length) filledFields.push("clinicalEvidence.pmcfPlan.objectives");
    if (next.studyIds?.length) filledFields.push("clinicalEvidence.pmcfPlan.studyIds");
  }

  const ceApplied =
    JSON.stringify(ceUpdate.cerConclusions || null) !== JSON.stringify(existingCE?.cerConclusions || null) ||
    JSON.stringify(ceUpdate.pmcfPlan || null) !== JSON.stringify(existingCE?.pmcfPlan || null) ||
    JSON.stringify(ceUpdate.literatureSearchProtocol || null) !== JSON.stringify(existingCE?.literatureSearchProtocol || null);

  if (ceApplied) {
    await upsertClinicalEvidence(deviceCode, ceUpdate);
  }

  // -------------------------
  // REGULATORY HISTORY
  // -------------------------
  const existingReg = dossier.regulatoryHistory;
  const regUpdate: any = {};
  if (existingReg) {
    regUpdate.certificates = existingReg.certificates;
    regUpdate.nbCommitments = existingReg.nbCommitments;
    regUpdate.fscaHistory = existingReg.fscaHistory;
    regUpdate.designChanges = existingReg.designChanges;
  } else {
    regUpdate.certificates = [];
    regUpdate.nbCommitments = [];
    regUpdate.fscaHistory = [];
    regUpdate.designChanges = [];
  }

  const certs = byType.get("regulatory_certificate_record") || [];
  if (certs.length) {
    const existingArr = Array.isArray(regUpdate.certificates) ? regUpdate.certificates : [];
    for (const c of certs) {
      const d = c.data || {};
      const certificateId = asString(d.certificate_number ?? d.certificateNumber ?? d.certificate_id ?? d.certificateId) || randomUUID();
      const existingMatch = existingArr.find((x: any) => x.certificateId === certificateId);
      const next = {
        certificateId,
        type: asString(d.type ?? d.certificate_type ?? d.certificateType) || "Certificate",
        notifiedBody: asString(d.notified_body ?? d.notifiedBody ?? d.nb) || "",
        issueDate: safeDateString(d.issue_date ?? d.issueDate) || "",
        expiryDate: safeDateString(d.expiry_date ?? d.expiryDate) || "",
        scope: asString(d.scope) || "",
        status: (asString(d.status) as any) || "Active",
      };
      if (!existingMatch || overwrite) {
        if (existingMatch) {
          Object.assign(existingMatch, next);
        } else {
          existingArr.push(next);
        }
      }
    }
    regUpdate.certificates = existingArr;
    if (existingArr.length) filledFields.push("regulatory.certificates");
  }

  const fsca = byType.get("fsca_record") || [];
  if (fsca.length) {
    const existingArr = Array.isArray(regUpdate.fscaHistory) ? regUpdate.fscaHistory : [];
    for (const f of fsca) {
      const d = f.data || {};
      const fscaId = asString(d.fsca_id ?? d.fscaId) || randomUUID();
      const existingMatch = existingArr.find((x: any) => x.fscaId === fscaId);
      const next = {
        fscaId,
        type: asString(d.action_type ?? d.type) || "FSCA",
        initiationDate: safeDateString(d.initiation_date ?? d.initiationDate) || "",
        description: asString(d.description) || "",
        affectedUnits: d.affected_units ? Number(d.affected_units) : (d.affectedUnits ? Number(d.affectedUnits) : undefined),
        regions: mergeStringArray([], d.regions ?? d.region, true),
        status: (asString(d.status) as any) || "Active",
        completionDate: safeDateString(d.completion_date ?? d.completionDate) || undefined,
      };
      if (!existingMatch || overwrite) {
        if (existingMatch) {
          Object.assign(existingMatch, next);
        } else {
          existingArr.push(next);
        }
      }
    }
    regUpdate.fscaHistory = existingArr;
    if (existingArr.length) filledFields.push("regulatory.fscaHistory");
  }

  const changes = byType.get("change_control_record") || [];
  if (changes.length) {
    const existingArr = Array.isArray(regUpdate.designChanges) ? regUpdate.designChanges : [];
    for (const ch of changes) {
      const d = ch.data || {};
      const changeId = asString(d.change_id ?? d.changeId) || randomUUID();
      const existingMatch = existingArr.find((x: any) => x.changeId === changeId);
      const next = {
        changeId,
        description: asString(d.description) || "",
        effectiveDate: safeDateString(d.effective_date ?? d.effectiveDate) || "",
        type: asString(d.type ?? d.change_type ?? d.changeType) || "Other",
        significance: ((asString(d.significance) as any) || "Non-Significant") as any,
        regulatoryImpact: asString(d.regulatory_impact ?? d.regulatoryImpact) || "",
      };
      if (!existingMatch || overwrite) {
        if (existingMatch) {
          Object.assign(existingMatch, next);
        } else {
          existingArr.push(next);
        }
      }
    }
    regUpdate.designChanges = existingArr;
    if (existingArr.length) filledFields.push("regulatory.designChanges");
  }

  const regApplied =
    JSON.stringify(regUpdate.certificates || []) !== JSON.stringify(existingReg?.certificates || []) ||
    JSON.stringify(regUpdate.fscaHistory || []) !== JSON.stringify(existingReg?.fscaHistory || []) ||
    JSON.stringify(regUpdate.designChanges || []) !== JSON.stringify(existingReg?.designChanges || []);

  if (regApplied) {
    await upsertRegulatoryHistory(deviceCode, regUpdate);
  }

  // -------------------------
  // PRIOR PSURS
  // -------------------------
  const priorExtracts = byType.get("previous_psur_extract") || [];
  let priorAdded = 0;
  let priorUpdated = 0;
  for (const p of priorExtracts) {
    const d = p.data || {};
    const periodStart = safeDateString(d.period_start ?? d.periodStart);
    const periodEnd = safeDateString(d.period_end ?? d.periodEnd);
    if (!periodStart || !periodEnd) continue;

    const psurReference = asString(d.psur_reference ?? d.psurReference) || null;
    const br = asString(d.benefit_risk_conclusion ?? d.benefitRiskConclusion ?? d.conclusion) || null;
    const keyFindings = asStringArray(d.key_findings ?? d.keyFindings ?? d.findings);

    const match = dossier.priorPsurs.find(existing => {
      const exStart = existing.periodStart?.toISOString().split("T")[0];
      const exEnd = existing.periodEnd?.toISOString().split("T")[0];
      if (psurReference && existing.psurReference && psurReference === existing.psurReference) return true;
      return exStart === periodStart && exEnd === periodEnd;
    });

    if (match) {
      if (overwrite) {
        const updated = await updatePriorPsur(match.id, {
          psurReference: psurReference ?? match.psurReference,
          benefitRiskConclusion: br ?? match.benefitRiskConclusion,
          keyFindings: overwrite ? keyFindings : mergeStringArray(match.keyFindings, keyFindings, false),
        } as any);
        if (updated) priorUpdated += 1;
      }
      continue;
    }

    await addPriorPsur(deviceCode, {
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      psurReference: psurReference ?? undefined,
      benefitRiskConclusion: br ?? undefined,
      keyFindings,
      actionsRequired: [],
    } as any);
    priorAdded += 1;
  }

  if (priorAdded || priorUpdated) {
    filledFields.push("priorPsurs");
  }

  // Final warnings for missing critical minimums
  let llmInference: AutoPopulateResult["llmInference"] | undefined;
  if (useLLMInference) {
    llmInference = { attempted: true, applied: false };
    try {
      const { patch, provider, model, latencyMs } = await inferDossierPatchFromEvidence(deviceCode, evidence);
      const appliedPatch = await applyInferredPatchToDossier(deviceCode, patch, overwrite);
      llmInference = {
        attempted: true,
        applied: appliedPatch.applied,
        provider,
        model,
        latencyMs,
        filledFields: appliedPatch.filledFields,
        warnings: appliedPatch.warnings,
      };
    } catch (e: any) {
      llmInference = {
        attempted: true,
        applied: false,
        error: e?.message || String(e),
      };
    }
  }

  const after = await getFullDossier(deviceCode);
  if (after) {
    if (!after.clinicalContext?.intendedPurpose) {
      warnings.push("Missing: clinical intended purpose (upload IFU or provide manually).");
    }
    const benefitsArr = after.clinicalContext?.clinicalBenefits as any[] || [];
    if (!benefitsArr.length) {
      warnings.push("Missing: clinical benefits (define benefits/endpoints for B/R narrative).");
    }
    const principalRisksArr = after.riskContext?.principalRisks as any[] || [];
    if (!principalRisksArr.length) {
      warnings.push("Missing: principal identified risks (upload RMF/FMEA or provide manually).");
    }
    if (!after.riskContext?.riskThresholds) {
      warnings.push("Missing: risk thresholds (complaint rate / serious incident thresholds).");
    }
  }

  return {
    deviceCode,
    overwrite,
    evidenceItemsProcessed: evidence.length,
    evidenceTypesUsed,
    applied: {
      core: coreApplied,
      clinicalContext: !!clinicalApplied,
      riskContext: !!riskApplied,
      clinicalEvidence: !!ceApplied,
      regulatoryHistory: !!regApplied,
      priorPsursAdded: priorAdded,
      priorPsursUpdated: priorUpdated,
    },
    filledFields: Array.from(new Set(filledFields)),
    warnings: Array.from(new Set(warnings)),
    llmInference,
  };
}
