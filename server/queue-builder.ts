import type { QueueSlotItem, EvidenceAtom, SlotProposal } from "@shared/schema";

interface SlotDefinition {
  slot_id: string;
  slot_path: string;
  slot_type: "narrative" | "table" | "kv" | "object" | "array";
  requiredness: "required" | "conditional" | "required_if_applicable";
  obligation_ids: string[];
  evidence_types: string[];
  allowed_transformations: string[];
  trace_granularity: "paragraph" | "cell" | "key";
  dependencies: string[];
  acceptance_criteria: string[];
  tier: number;
  recommended_agents: string[];
}

interface ObligationDefinition {
  obligation_id: string;
  requirement_level: "MUST" | "SHOULD" | "MUST_IF_APPLICABLE";
  jurisdictions: string[];
}

const ANNEX_I_SLOTS: SlotDefinition[] = [
  { slot_id: "cover.manufacturer_information", slot_path: "Cover Page / Manufacturer information", slot_type: "object", requiredness: "required", obligation_ids: ["MDCG_COVER_MIN_FIELDS"], evidence_types: ["manufacturer_master_data"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["Manufacturer legal name and address present.", "Trace nodes exist per key with evidence pointer."], tier: 0, recommended_agents: ["IdentitySlotFiller"] },
  { slot_id: "cover.devices_covered", slot_path: "Cover Page / Medical device(s) covered", slot_type: "array", requiredness: "required", obligation_ids: ["MDCG_COVER_MIN_FIELDS"], evidence_types: ["device_master_data"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["Lists all Basic UDI-DIs (or device identifiers) in scope.", "Trace contains evidence for each identifier."], tier: 0, recommended_agents: ["DeviceScopeAgent"] },
  { slot_id: "cover.data_collection_period", slot_path: "Cover Page / Data collection period", slot_type: "object", requiredness: "required", obligation_ids: ["MDCG_COVER_MIN_FIELDS"], evidence_types: ["psur_case_record"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: ["cover.devices_covered"], acceptance_criteria: ["Start/end dates match PSUR case and pass contiguity checks.", "Trace nodes per date field."], tier: 0, recommended_agents: ["PSURCaseAgent"] },
  { slot_id: "cover.psur_reference", slot_path: "Cover Page / PSUR reference number", slot_type: "kv", requiredness: "required", obligation_ids: ["MDCG_COVER_MIN_FIELDS"], evidence_types: ["psur_case_record"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["PSUR reference matches case record."], tier: 0, recommended_agents: ["PSURCaseAgent"] },
  { slot_id: "sales.criteria_used", slot_path: "Volume of sales / criteria", slot_type: "array", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION"], evidence_types: ["sales_volume"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["States sales criteria used (placed on market, units distributed, etc.).", "Cites sales extract evidence atom IDs.", "No invented numbers."], tier: 1, recommended_agents: ["SalesMethodAgent"] },
  { slot_id: "sales.volume_table", slot_path: "Volume of sales / data table", slot_type: "table", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION"], evidence_types: ["sales_volume"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["sales.criteria_used"], acceptance_criteria: ["Sales data matches evidence atoms.", "Period coverage verified."], tier: 1, recommended_agents: ["SalesTableAgent"] },
  { slot_id: "population.exposure_estimate", slot_path: "Population exposure / estimate", slot_type: "object", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION"], evidence_types: ["population_estimate", "exposure_model"], allowed_transformations: ["cite", "summarize"], trace_granularity: "paragraph", dependencies: ["sales.volume_table"], acceptance_criteria: ["If estimate exists: shows method + inputs and ties to sales/use assumptions.", "If estimate not available: explicit 'not available' + justification + impact statement."], tier: 1, recommended_agents: ["ExposureModelAgent"] },
  { slot_id: "incidents.serious_characterization", slot_path: "Serious incidents / characterization", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SERIOUS_INCIDENTS"], evidence_types: ["incidents"], allowed_transformations: ["summarize", "cite", "aggregate"], trace_granularity: "paragraph", dependencies: ["population.exposure_estimate"], acceptance_criteria: ["All serious incidents characterized.", "Root cause analysis referenced.", "No fabricated incidents."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "incidents.serious_table", slot_path: "Serious incidents / data table", slot_type: "table", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SERIOUS_INCIDENTS"], evidence_types: ["incidents"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["incidents.serious_characterization"], acceptance_criteria: ["All serious incidents listed with required fields.", "Period coverage verified."], tier: 2, recommended_agents: ["IncidentTableAgent"] },
  { slot_id: "fsca.summary", slot_path: "FSCA / summary", slot_type: "narrative", requiredness: "required_if_applicable", obligation_ids: ["EU.PSUR.CONTENT.FSCA"], evidence_types: ["fsca"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["All FSCAs in period listed.", "If none: explicit statement with justification."], tier: 2, recommended_agents: ["FSCAAgent"] },
  { slot_id: "trends.analysis", slot_path: "Trend analysis / narrative", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.TREND_REPORTING"], evidence_types: ["complaints", "incidents"], allowed_transformations: ["summarize", "aggregate", "cite"], trace_granularity: "paragraph", dependencies: ["incidents.serious_table", "population.exposure_estimate"], acceptance_criteria: ["Statistical methods stated.", "Trends identified or explicitly stated as none.", "No invented trends."], tier: 2, recommended_agents: ["TrendAnalysisAgent"] },
  { slot_id: "pmcf.summary", slot_path: "PMCF / summary", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.PMCF"], evidence_types: ["pmcf"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["PMCF activities and findings summarized.", "Links to PMCF plan/report."], tier: 3, recommended_agents: ["PMCFAgent"] },
  { slot_id: "literature.review", slot_path: "Literature review / summary", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.LITERATURE"], evidence_types: ["literature"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["Search methodology stated.", "Relevant findings summarized.", "No new risks or explicitly stated."], tier: 3, recommended_agents: ["LiteratureAgent"] },
  { slot_id: "similar_devices.comparison", slot_path: "Similar devices / comparison", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["EU.PSUR.CONTENT.SIMILAR_DEVICES"], evidence_types: ["registry", "literature"], allowed_transformations: ["summarize", "cite", "cross_reference"], trace_granularity: "paragraph", dependencies: ["literature.review"], acceptance_criteria: ["If applicable: similar devices identified and compared.", "If not applicable: justification provided."], tier: 3, recommended_agents: ["SimilarDevicesAgent"] },
  { slot_id: "benefit_risk.evaluation", slot_path: "Benefit-risk / evaluation", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.BENEFIT_RISK"], evidence_types: ["incidents", "complaints", "pmcf", "literature"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["incidents.serious_table", "trends.analysis", "pmcf.summary", "literature.review"], acceptance_criteria: ["Benefit-risk determination stated.", "Based on evidence from prior sections.", "No new conclusions without evidence."], tier: 4, recommended_agents: ["BenefitRiskAgent"] },
  { slot_id: "conclusions.summary", slot_path: "Conclusions / summary", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.CONCLUSIONS"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["benefit_risk.evaluation"], acceptance_criteria: ["Conclusions consistent with prior sections.", "Actions recommended if needed.", "Next PSUR period stated."], tier: 4, recommended_agents: ["ConclusionAgent"] },
];

const FORMQAR_SLOTS: SlotDefinition[] = [
  { slot_id: "A.manufacturer", slot_path: "Section A / Manufacturer Details", slot_type: "object", requiredness: "required", obligation_ids: ["MDCG_COVER_MIN_FIELDS", "FORMQAR_A_MANUFACTURER"], evidence_types: ["manufacturer_master_data"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["All manufacturer fields populated.", "Legal entity verified."], tier: 0, recommended_agents: ["IdentitySlotFiller"] },
  { slot_id: "A.device_scope", slot_path: "Section A / Device Scope", slot_type: "array", requiredness: "required", obligation_ids: ["MDCG_COVER_MIN_FIELDS", "FORMQAR_A_SCOPE"], evidence_types: ["device_master_data"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["All devices in scope listed.", "UDI-DIs verified."], tier: 0, recommended_agents: ["DeviceScopeAgent"] },
  { slot_id: "A.reporting_period", slot_path: "Section A / Reporting Period", slot_type: "object", requiredness: "required", obligation_ids: ["MDCG_COVER_MIN_FIELDS"], evidence_types: ["psur_case_record"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["Start/end dates verified.", "Contiguity with previous PSUR checked."], tier: 0, recommended_agents: ["PSURCaseAgent"] },
  { slot_id: "B.executive_summary", slot_path: "Section B / Executive Summary", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_B_EXEC_SUMMARY"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["M.conclusions"], acceptance_criteria: ["Summary reflects all key findings.", "Generated after body sections."], tier: 4, recommended_agents: ["ExecutiveSummaryAgent"] },
  { slot_id: "C.sales_methodology", slot_path: "Section C / Sales Methodology", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION", "FORMQAR_C_SALES"], evidence_types: ["sales_volume"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["Sales methodology stated.", "Data sources identified."], tier: 1, recommended_agents: ["SalesMethodAgent"] },
  { slot_id: "C.sales_table", slot_path: "Section C / Sales Data Table", slot_type: "table", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION", "FORMQAR_C_SALES"], evidence_types: ["sales_volume"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["C.sales_methodology"], acceptance_criteria: ["All required columns populated.", "Period coverage verified."], tier: 1, recommended_agents: ["SalesTableAgent"] },
  { slot_id: "C.exposure_estimate", slot_path: "Section C / Population Exposure", slot_type: "object", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION"], evidence_types: ["population_estimate", "exposure_model"], allowed_transformations: ["cite", "summarize"], trace_granularity: "paragraph", dependencies: ["C.sales_table"], acceptance_criteria: ["Exposure method described.", "Estimate or justified absence."], tier: 1, recommended_agents: ["ExposureModelAgent"] },
  { slot_id: "D.serious_incidents", slot_path: "Section D / Serious Incidents", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SERIOUS_INCIDENTS", "FORMQAR_D_INCIDENTS"], evidence_types: ["incidents"], allowed_transformations: ["summarize", "cite", "aggregate"], trace_granularity: "paragraph", dependencies: ["C.exposure_estimate"], acceptance_criteria: ["All serious incidents characterized.", "Root cause referenced."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "D.incidents_table", slot_path: "Section D / Incidents Table", slot_type: "table", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SERIOUS_INCIDENTS"], evidence_types: ["incidents"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["D.serious_incidents"], acceptance_criteria: ["All required fields populated.", "Period coverage verified."], tier: 2, recommended_agents: ["IncidentTableAgent"] },
  { slot_id: "E.non_serious_incidents", slot_path: "Section E / Non-Serious Incidents", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_E_NON_SERIOUS"], evidence_types: ["incidents"], allowed_transformations: ["summarize", "cite", "aggregate"], trace_granularity: "paragraph", dependencies: ["D.incidents_table"], acceptance_criteria: ["Non-serious incidents summarized.", "Categorization applied."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "F.complaints_summary", slot_path: "Section F / Complaints Summary", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_F_COMPLAINTS"], evidence_types: ["complaints"], allowed_transformations: ["summarize", "cite", "aggregate"], trace_granularity: "paragraph", dependencies: ["C.exposure_estimate"], acceptance_criteria: ["Complaints summarized by category.", "Rates calculated if exposure available."], tier: 2, recommended_agents: ["ComplaintsAgent"] },
  { slot_id: "F.complaints_table", slot_path: "Section F / Complaints Table", slot_type: "table", requiredness: "required", obligation_ids: ["FORMQAR_F_COMPLAINTS"], evidence_types: ["complaints"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["F.complaints_summary"], acceptance_criteria: ["All categories listed.", "Period coverage verified."], tier: 2, recommended_agents: ["ComplaintsTableAgent"] },
  { slot_id: "G.trend_analysis", slot_path: "Section G / Trend Analysis", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.TREND_REPORTING", "FORMQAR_G_TRENDS"], evidence_types: ["complaints", "incidents"], allowed_transformations: ["summarize", "aggregate", "cite"], trace_granularity: "paragraph", dependencies: ["D.incidents_table", "F.complaints_table"], acceptance_criteria: ["Statistical methods stated.", "Trends identified or none stated."], tier: 2, recommended_agents: ["TrendAnalysisAgent"] },
  { slot_id: "H.fsca_summary", slot_path: "Section H / FSCA Summary", slot_type: "narrative", requiredness: "required_if_applicable", obligation_ids: ["EU.PSUR.CONTENT.FSCA", "FORMQAR_H_FSCA"], evidence_types: ["fsca"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["All FSCAs listed or explicit none statement."], tier: 2, recommended_agents: ["FSCAAgent"] },
  { slot_id: "I.capa_summary", slot_path: "Section I / CAPA Summary", slot_type: "narrative", requiredness: "required_if_applicable", obligation_ids: ["FORMQAR_I_CAPA"], evidence_types: ["capa"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["D.serious_incidents"], acceptance_criteria: ["CAPAs linked to incidents.", "Status tracked."], tier: 2, recommended_agents: ["CAPAAgent"] },
  { slot_id: "J.literature_review", slot_path: "Section J / Literature Review", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.LITERATURE", "FORMQAR_J_LITERATURE"], evidence_types: ["literature"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["Search methodology stated.", "Findings summarized."], tier: 3, recommended_agents: ["LiteratureAgent"] },
  { slot_id: "K.databases_review", slot_path: "Section K / External Databases", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_K_DATABASES"], evidence_types: ["registry"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["EUDAMED, MAUDE, etc. reviewed.", "Findings summarized."], tier: 3, recommended_agents: ["DatabaseReviewAgent"] },
  { slot_id: "L.pmcf_summary", slot_path: "Section L / PMCF Summary", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.PMCF", "FORMQAR_L_PMCF"], evidence_types: ["pmcf"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["PMCF activities summarized.", "Links to PMCF plan."], tier: 3, recommended_agents: ["PMCFAgent"] },
  { slot_id: "M.benefit_risk", slot_path: "Section M / Benefit-Risk Evaluation", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.BENEFIT_RISK", "FORMQAR_M_BENEFIT_RISK"], evidence_types: ["incidents", "complaints", "pmcf", "literature"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["G.trend_analysis", "L.pmcf_summary", "J.literature_review"], acceptance_criteria: ["Benefit-risk determination stated.", "Based on prior sections."], tier: 4, recommended_agents: ["BenefitRiskAgent"] },
  { slot_id: "M.conclusions", slot_path: "Section M / Conclusions", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.CONCLUSIONS", "FORMQAR_M_CONCLUSIONS"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["M.benefit_risk"], acceptance_criteria: ["Conclusions consistent with prior sections.", "Actions recommended if needed."], tier: 4, recommended_agents: ["ConclusionAgent"] },
];

const OBLIGATIONS: Record<string, ObligationDefinition> = {
  "MDCG_COVER_MIN_FIELDS": { obligation_id: "MDCG_COVER_MIN_FIELDS", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "EU.PSUR.CONTENT.SALES_AND_POPULATION": { obligation_id: "EU.PSUR.CONTENT.SALES_AND_POPULATION", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "EU.PSUR.CONTENT.SERIOUS_INCIDENTS": { obligation_id: "EU.PSUR.CONTENT.SERIOUS_INCIDENTS", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "EU.PSUR.CONTENT.FSCA": { obligation_id: "EU.PSUR.CONTENT.FSCA", requirement_level: "MUST_IF_APPLICABLE", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "EU.PSUR.CONTENT.TREND_REPORTING": { obligation_id: "EU.PSUR.CONTENT.TREND_REPORTING", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "EU.PSUR.CONTENT.PMCF": { obligation_id: "EU.PSUR.CONTENT.PMCF", requirement_level: "MUST", jurisdictions: ["EU_MDR"] },
  "EU.PSUR.CONTENT.LITERATURE": { obligation_id: "EU.PSUR.CONTENT.LITERATURE", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "EU.PSUR.CONTENT.SIMILAR_DEVICES": { obligation_id: "EU.PSUR.CONTENT.SIMILAR_DEVICES", requirement_level: "SHOULD", jurisdictions: ["EU_MDR"] },
  "EU.PSUR.CONTENT.BENEFIT_RISK": { obligation_id: "EU.PSUR.CONTENT.BENEFIT_RISK", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "EU.PSUR.CONTENT.CONCLUSIONS": { obligation_id: "EU.PSUR.CONTENT.CONCLUSIONS", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_A_MANUFACTURER": { obligation_id: "FORMQAR_A_MANUFACTURER", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_A_SCOPE": { obligation_id: "FORMQAR_A_SCOPE", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_B_EXEC_SUMMARY": { obligation_id: "FORMQAR_B_EXEC_SUMMARY", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_C_SALES": { obligation_id: "FORMQAR_C_SALES", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_D_INCIDENTS": { obligation_id: "FORMQAR_D_INCIDENTS", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_E_NON_SERIOUS": { obligation_id: "FORMQAR_E_NON_SERIOUS", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_F_COMPLAINTS": { obligation_id: "FORMQAR_F_COMPLAINTS", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_G_TRENDS": { obligation_id: "FORMQAR_G_TRENDS", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_H_FSCA": { obligation_id: "FORMQAR_H_FSCA", requirement_level: "MUST_IF_APPLICABLE", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_I_CAPA": { obligation_id: "FORMQAR_I_CAPA", requirement_level: "MUST_IF_APPLICABLE", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_J_LITERATURE": { obligation_id: "FORMQAR_J_LITERATURE", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_K_DATABASES": { obligation_id: "FORMQAR_K_DATABASES", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_L_PMCF": { obligation_id: "FORMQAR_L_PMCF", requirement_level: "MUST", jurisdictions: ["EU_MDR"] },
  "FORMQAR_M_BENEFIT_RISK": { obligation_id: "FORMQAR_M_BENEFIT_RISK", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
  "FORMQAR_M_CONCLUSIONS": { obligation_id: "FORMQAR_M_CONCLUSIONS", requirement_level: "MUST", jurisdictions: ["EU_MDR", "UK_MDR"] },
};

function getSlotDefinitions(profileId: string): SlotDefinition[] {
  return profileId === "FormQAR-054_C" ? FORMQAR_SLOTS : ANNEX_I_SLOTS;
}

function computeSlotScore(
  slot: SlotDefinition,
  filledSlotIds: Set<string>,
  availableEvidenceTypes: Set<string>,
  unsatisfiedObligationIds: Set<string>
): number {
  let score = 0;
  
  const hasUnsatisfiedMust = slot.obligation_ids.some(obId => {
    const ob = OBLIGATIONS[obId];
    return ob && ob.requirement_level === "MUST" && unsatisfiedObligationIds.has(obId);
  });
  if (hasUnsatisfiedMust) score += 100;
  
  if (slot.requiredness === "required") score += 40;
  
  const unlocksDependencies = slot.slot_id.includes("sales") || slot.slot_id.includes("exposure") || slot.slot_id.includes("population");
  if (unlocksDependencies) score += 30;
  
  const hasAllEvidence = slot.evidence_types.every(et => availableEvidenceTypes.has(et));
  if (hasAllEvidence) score += 25;
  else score -= 50;
  
  const additionalUnsatisfied = slot.obligation_ids.filter(obId => unsatisfiedObligationIds.has(obId)).length - 1;
  if (additionalUnsatisfied > 0) score += additionalUnsatisfied * 10;
  
  if (slot.slot_type === "table") score += 15;
  
  score -= slot.tier * 10;
  
  return score;
}

export interface QueueBuilderInput {
  psurReference: string;
  profileId: string;
  jurisdictions: string[];
  evidenceAtoms: EvidenceAtom[];
  acceptedProposals: SlotProposal[];
  periodStart: Date;
  periodEnd: Date;
}

export interface CoverageSlotQueueOutput {
  psurReference: string;
  profileId: string;
  generatedAt: string;
  coverageSummary: {
    mandatoryObligationsTotal: number;
    mandatoryObligationsSatisfied: number;
    mandatoryObligationsRemaining: number;
    requiredSlotsTotal: number;
    requiredSlotsFilled: number;
    requiredSlotsRemaining: number;
  };
  queue: QueueSlotItem[];
}

export function buildCoverageSlotQueue(input: QueueBuilderInput): CoverageSlotQueueOutput {
  const slots = getSlotDefinitions(input.profileId);
  
  const availableEvidenceTypes = new Set<string>();
  for (const atom of input.evidenceAtoms) {
    availableEvidenceTypes.add(atom.evidenceType);
  }
  
  const filledSlotIds = new Set<string>();
  const satisfiedObligationIds = new Set<string>();
  for (const proposal of input.acceptedProposals) {
    if (proposal.status === "accepted") {
      filledSlotIds.add(proposal.slotId);
      for (const obId of proposal.obligationIds || []) {
        satisfiedObligationIds.add(obId);
      }
    }
  }
  
  const allObligationIds = new Set<string>();
  for (const slot of slots) {
    for (const obId of slot.obligation_ids) {
      const ob = OBLIGATIONS[obId];
      if (ob && (ob.requirement_level === "MUST" || ob.requirement_level === "MUST_IF_APPLICABLE")) {
        if (ob.jurisdictions.some(j => input.jurisdictions.includes(j))) {
          allObligationIds.add(obId);
        }
      }
    }
  }
  
  const unsatisfiedObligationIds = new Set<string>();
  Array.from(allObligationIds).forEach(obId => {
    if (!satisfiedObligationIds.has(obId)) {
      unsatisfiedObligationIds.add(obId);
    }
  });
  
  const unfilledSlots = slots.filter(s => !filledSlotIds.has(s.slot_id));
  
  const scoredSlots = unfilledSlots.map(slot => ({
    slot,
    score: computeSlotScore(slot, filledSlotIds, availableEvidenceTypes, unsatisfiedObligationIds),
  }));
  
  scoredSlots.sort((a, b) => b.score - a.score);
  
  const queue: QueueSlotItem[] = scoredSlots.map((item, index) => {
    const slot = item.slot;
    const missingEvidence = slot.evidence_types.filter(et => !availableEvidenceTypes.has(et));
    const availableEvidence = slot.evidence_types.filter(et => availableEvidenceTypes.has(et));
    
    const mappedObligations = slot.obligation_ids.map(obId => {
      const ob = OBLIGATIONS[obId];
      const isSatisfied = satisfiedObligationIds.has(obId);
      return {
        obligation_id: obId,
        requirement_level: ob?.requirement_level || "MUST" as const,
        status: isSatisfied ? "satisfied" as const : "unsatisfied" as const,
        why_unsatisfied: isSatisfied ? [] : [`No accepted payload for ${slot.slot_id}`],
      };
    });
    
    return {
      queue_rank: index + 1,
      slot_id: slot.slot_id,
      slot_path: slot.slot_path,
      slot_type: slot.slot_type,
      requiredness: slot.requiredness,
      mapped_obligations: mappedObligations,
      evidence_requirements: {
        required_evidence_types: slot.evidence_types,
        available_evidence_types: availableEvidence,
        missing_evidence_types: missingEvidence,
        period_check: missingEvidence.length === 0 ? "pass" as const : "unknown" as const,
      },
      generation_contract: {
        allowed_transformations: slot.allowed_transformations,
        forbidden_transformations: ["infer", "invent", "extrapolate", "re_weight_risk"],
        must_include: ["evidence_atom_ids", "method_description"],
        trace_granularity: slot.trace_granularity,
      },
      dependencies: {
        must_fill_before: slot.dependencies.filter(d => !filledSlotIds.has(d)),
        must_have_evidence_before: missingEvidence,
      },
      recommended_agents: slot.recommended_agents,
      acceptance_criteria: slot.acceptance_criteria,
    };
  });
  
  const requiredSlots = slots.filter(s => s.requiredness === "required");
  
  return {
    psurReference: input.psurReference,
    profileId: input.profileId,
    generatedAt: new Date().toISOString(),
    coverageSummary: {
      mandatoryObligationsTotal: allObligationIds.size,
      mandatoryObligationsSatisfied: satisfiedObligationIds.size,
      mandatoryObligationsRemaining: unsatisfiedObligationIds.size,
      requiredSlotsTotal: requiredSlots.length,
      requiredSlotsFilled: requiredSlots.filter(s => filledSlotIds.has(s.slot_id)).length,
      requiredSlotsRemaining: requiredSlots.filter(s => !filledSlotIds.has(s.slot_id)).length,
    },
    queue,
  };
}
