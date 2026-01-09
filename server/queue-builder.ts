import type { QueueSlotItem, EvidenceAtom, SlotProposal } from "@shared/schema";
import { 
  EVIDENCE_DEFINITIONS, 
  getEvidenceDefinition, 
  evidenceTypeSatisfies,
  getTypesContributingTo,
  RAW_TO_AGGREGATED_MAP,
  type EvidenceDefinition 
} from "@shared/schema";

// Validate all slot evidence types are in the shared registry
const VALID_EVIDENCE_TYPES = new Set(EVIDENCE_DEFINITIONS.map(d => d.type));

function validateSlotEvidenceTypes(slots: SlotDefinition[], context: string): void {
  for (const slot of slots) {
    for (const evidenceType of slot.evidence_types) {
      if (evidenceType && !VALID_EVIDENCE_TYPES.has(evidenceType)) {
        console.warn(`[Queue-Builder] Invalid evidence type "${evidenceType}" in slot ${slot.slot_id} (${context}). Not in shared registry.`);
      }
    }
  }
}

// Get evidence metadata from registry for enhanced coverage calculation
function getEvidenceMetadata(type: string): { tier: number; isAggregated: boolean; sections: string[] } | null {
  const def = getEvidenceDefinition(type);
  if (!def) return null;
  return { tier: def.tier, isAggregated: def.isAggregated, sections: def.sections };
}

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
  // ==================== SECTION A: ADMINISTRATIVE (8 slots) ====================
  { slot_id: "A.01.manufacturer_name", slot_path: "A / Administrative / Manufacturer Legal Name", slot_type: "kv", requiredness: "required", obligation_ids: ["MDCG_COVER_MIN_FIELDS", "FORMQAR_A_MANUFACTURER"], evidence_types: ["manufacturer_master_data"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["Legal entity name matches registration."], tier: 0, recommended_agents: ["IdentitySlotFiller"] },
  { slot_id: "A.02.manufacturer_address", slot_path: "A / Administrative / Manufacturer Address", slot_type: "object", requiredness: "required", obligation_ids: ["MDCG_COVER_MIN_FIELDS", "FORMQAR_A_MANUFACTURER"], evidence_types: ["manufacturer_master_data"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["Full legal address with country code."], tier: 0, recommended_agents: ["IdentitySlotFiller"] },
  { slot_id: "A.03.srn", slot_path: "A / Administrative / Single Registration Number", slot_type: "kv", requiredness: "required", obligation_ids: ["FORMQAR_A_MANUFACTURER"], evidence_types: ["manufacturer_master_data"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["Valid SRN format verified."], tier: 0, recommended_agents: ["IdentitySlotFiller"] },
  { slot_id: "A.04.device_scope_table", slot_path: "A / Administrative / Devices Covered", slot_type: "table", requiredness: "required", obligation_ids: ["MDCG_COVER_MIN_FIELDS", "FORMQAR_A_SCOPE"], evidence_types: ["device_master_data"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: [], acceptance_criteria: ["All devices in scope listed with Basic UDI-DI."], tier: 0, recommended_agents: ["DeviceScopeAgent"] },
  { slot_id: "A.05.basic_udi_di", slot_path: "A / Administrative / Basic UDI-DI Identifier", slot_type: "kv", requiredness: "required", obligation_ids: ["FORMQAR_A_SCOPE"], evidence_types: ["device_master_data"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["Valid UDI-DI format."], tier: 0, recommended_agents: ["DeviceScopeAgent"] },
  { slot_id: "A.06.device_classification", slot_path: "A / Administrative / Risk Classification", slot_type: "kv", requiredness: "required", obligation_ids: ["FORMQAR_A_SCOPE"], evidence_types: ["device_master_data"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["Classification matches EUDAMED."], tier: 0, recommended_agents: ["DeviceScopeAgent"] },
  { slot_id: "A.07.reporting_period", slot_path: "A / Administrative / Reporting Period", slot_type: "object", requiredness: "required", obligation_ids: ["MDCG_COVER_MIN_FIELDS"], evidence_types: ["psur_case_record"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["Start/end dates verified.", "Contiguity checked."], tier: 0, recommended_agents: ["PSURCaseAgent"] },
  { slot_id: "A.08.psur_reference", slot_path: "A / Administrative / PSUR Reference Number", slot_type: "kv", requiredness: "required", obligation_ids: ["MDCG_COVER_MIN_FIELDS"], evidence_types: ["psur_case_record"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["PSUR reference matches case record."], tier: 0, recommended_agents: ["PSURCaseAgent"] },

  // ==================== SECTION B: EXECUTIVE SUMMARY (4 slots) ====================
  { slot_id: "B.01.key_findings", slot_path: "B / Executive Summary / Key Safety Findings", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_B_EXEC_SUMMARY"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["M.08.conclusions_summary"], acceptance_criteria: ["Summarizes major safety signals."], tier: 4, recommended_agents: ["ExecutiveSummaryAgent"] },
  { slot_id: "B.02.benefit_risk_summary", slot_path: "B / Executive Summary / B-R Summary Statement", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_B_EXEC_SUMMARY"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["M.07.overall_br_conclusion"], acceptance_criteria: ["Reflects Section M determination."], tier: 4, recommended_agents: ["ExecutiveSummaryAgent"] },
  { slot_id: "B.03.actions_summary", slot_path: "B / Executive Summary / Planned Actions", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_B_EXEC_SUMMARY"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["M.08.conclusions_summary"], acceptance_criteria: ["Lists corrective actions if any."], tier: 4, recommended_agents: ["ExecutiveSummaryAgent"] },
  { slot_id: "B.04.period_overview", slot_path: "B / Executive Summary / Period Data Overview", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_B_EXEC_SUMMARY"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["C.08.exposure_summary"], acceptance_criteria: ["Summarizes sales and exposure data."], tier: 4, recommended_agents: ["ExecutiveSummaryAgent"] },

  // ==================== SECTION C: SALES & POPULATION (12 slots) ====================
  { slot_id: "C.01.sales_methodology", slot_path: "C / Sales / Data Collection Methodology", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION", "FORMQAR_C_SALES"], evidence_types: ["sales_volume"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["Sales methodology stated.", "Data sources identified."], tier: 1, recommended_agents: ["SalesMethodAgent"] },
  { slot_id: "C.02.sales_criteria", slot_path: "C / Sales / Sales Criteria Definition", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION"], evidence_types: ["sales_volume"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["Explains what counts as 'placed on market'."], tier: 1, recommended_agents: ["SalesMethodAgent"] },
  { slot_id: "C.03.sales_by_region_table", slot_path: "C / Sales / Sales by Region Table", slot_type: "table", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION", "FORMQAR_C_SALES"], evidence_types: ["sales_volume"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["C.01.sales_methodology"], acceptance_criteria: ["Breakdown by EU/UK/Other regions."], tier: 1, recommended_agents: ["SalesTableAgent"] },
  { slot_id: "C.04.sales_by_period_table", slot_path: "C / Sales / Sales by Quarter Table", slot_type: "table", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION"], evidence_types: ["sales_volume"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["C.01.sales_methodology"], acceptance_criteria: ["Quarterly breakdown for reporting period."], tier: 1, recommended_agents: ["SalesTableAgent"] },
  { slot_id: "C.05.sales_cumulative_table", slot_path: "C / Sales / Cumulative Sales Table", slot_type: "table", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION"], evidence_types: ["sales_volume"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["C.03.sales_by_region_table"], acceptance_criteria: ["Lifetime sales since market approval."], tier: 1, recommended_agents: ["SalesTableAgent"] },
  { slot_id: "C.06.sales_year_over_year", slot_path: "C / Sales / Year-Over-Year Comparison", slot_type: "table", requiredness: "conditional", obligation_ids: ["FORMQAR_C_SALES"], evidence_types: ["sales_volume"], allowed_transformations: ["tabulate", "cite", "aggregate"], trace_granularity: "cell", dependencies: ["C.04.sales_by_period_table"], acceptance_criteria: ["Comparison with previous PSUR period."], tier: 1, recommended_agents: ["SalesTableAgent"] },
  { slot_id: "C.07.exposure_methodology", slot_path: "C / Population / Exposure Calculation Method", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION"], evidence_types: ["population_estimate", "exposure_model"], allowed_transformations: ["cite", "summarize"], trace_granularity: "paragraph", dependencies: ["C.05.sales_cumulative_table"], acceptance_criteria: ["Method described.", "Assumptions stated."], tier: 1, recommended_agents: ["ExposureModelAgent"] },
  { slot_id: "C.08.exposure_summary", slot_path: "C / Population / Exposure Estimate", slot_type: "object", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION"], evidence_types: ["population_estimate", "exposure_model"], allowed_transformations: ["cite", "summarize"], trace_granularity: "paragraph", dependencies: ["C.07.exposure_methodology"], acceptance_criteria: ["Patient-days or uses estimated."], tier: 1, recommended_agents: ["ExposureModelAgent"] },
  { slot_id: "C.09.exposure_limitations", slot_path: "C / Population / Exposure Data Limitations", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION"], evidence_types: ["exposure_model"], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["C.08.exposure_summary"], acceptance_criteria: ["Limitations and uncertainties stated."], tier: 1, recommended_agents: ["ExposureModelAgent"] },
  { slot_id: "C.10.exposure_by_indication", slot_path: "C / Population / Exposure by Indication", slot_type: "table", requiredness: "conditional", obligation_ids: ["FORMQAR_C_SALES"], evidence_types: ["population_estimate"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["C.08.exposure_summary"], acceptance_criteria: ["If multiple indications: breakdown provided."], tier: 1, recommended_agents: ["ExposureModelAgent"] },
  { slot_id: "C.11.denominator_statement", slot_path: "C / Population / Denominator for Rates", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SALES_AND_POPULATION"], evidence_types: ["exposure_model"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["C.08.exposure_summary"], acceptance_criteria: ["States denominator used for rate calculations."], tier: 1, recommended_agents: ["ExposureModelAgent"] },
  { slot_id: "C.12.sales_data_quality", slot_path: "C / Sales / Data Quality Assessment", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_C_SALES"], evidence_types: ["sales_volume"], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["C.03.sales_by_region_table"], acceptance_criteria: ["Data completeness and accuracy stated."], tier: 1, recommended_agents: ["SalesMethodAgent"] },

  // ==================== SECTION D: SERIOUS INCIDENTS (10 slots) ====================
  { slot_id: "D.01.serious_incident_summary", slot_path: "D / Serious Incidents / Overview", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SERIOUS_INCIDENTS", "FORMQAR_D_INCIDENTS"], evidence_types: ["incident_record"], allowed_transformations: ["summarize", "cite", "aggregate"], trace_granularity: "paragraph", dependencies: ["C.08.exposure_summary"], acceptance_criteria: ["Total count and characterization."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "D.02.serious_incident_table", slot_path: "D / Serious Incidents / Listing Table", slot_type: "table", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SERIOUS_INCIDENTS"], evidence_types: ["incident_record"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["D.01.serious_incident_summary"], acceptance_criteria: ["All serious incidents listed with required fields."], tier: 2, recommended_agents: ["IncidentTableAgent"] },
  { slot_id: "D.03.death_incidents", slot_path: "D / Serious Incidents / Death Cases", slot_type: "narrative", requiredness: "required_if_applicable", obligation_ids: ["EU.PSUR.CONTENT.SERIOUS_INCIDENTS"], evidence_types: ["incident_record"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["D.02.serious_incident_table"], acceptance_criteria: ["Each death case individually characterized."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "D.04.life_threatening_incidents", slot_path: "D / Serious Incidents / Life-Threatening Cases", slot_type: "narrative", requiredness: "required_if_applicable", obligation_ids: ["EU.PSUR.CONTENT.SERIOUS_INCIDENTS"], evidence_types: ["incident_record"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["D.02.serious_incident_table"], acceptance_criteria: ["Each life-threatening case characterized."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "D.05.hospitalization_incidents", slot_path: "D / Serious Incidents / Hospitalization Cases", slot_type: "narrative", requiredness: "required_if_applicable", obligation_ids: ["EU.PSUR.CONTENT.SERIOUS_INCIDENTS"], evidence_types: ["incident_record"], allowed_transformations: ["summarize", "cite", "aggregate"], trace_granularity: "paragraph", dependencies: ["D.02.serious_incident_table"], acceptance_criteria: ["Hospitalization incidents summarized."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "D.06.incident_by_type_table", slot_path: "D / Serious Incidents / By Type Table", slot_type: "table", requiredness: "required", obligation_ids: ["FORMQAR_D_INCIDENTS"], evidence_types: ["incident_record"], allowed_transformations: ["tabulate", "aggregate"], trace_granularity: "cell", dependencies: ["D.02.serious_incident_table"], acceptance_criteria: ["Categorized by incident type."], tier: 2, recommended_agents: ["IncidentTableAgent"] },
  { slot_id: "D.07.incident_rates", slot_path: "D / Serious Incidents / Incidence Rates", slot_type: "object", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SERIOUS_INCIDENTS"], evidence_types: ["incident_record", "exposure_model"], allowed_transformations: ["aggregate", "cite"], trace_granularity: "paragraph", dependencies: ["D.01.serious_incident_summary", "C.08.exposure_summary"], acceptance_criteria: ["Rates per patient-exposure calculated."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "D.08.root_cause_analysis", slot_path: "D / Serious Incidents / Root Cause Summary", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_D_INCIDENTS"], evidence_types: ["incident_record"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["D.02.serious_incident_table"], acceptance_criteria: ["Root causes identified or investigation status."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "D.09.device_deficiency_analysis", slot_path: "D / Serious Incidents / Device Deficiency Analysis", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.SERIOUS_INCIDENTS"], evidence_types: ["incident_record"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["D.08.root_cause_analysis"], acceptance_criteria: ["Device-related deficiencies categorized."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "D.10.serious_incident_absence", slot_path: "D / Serious Incidents / No Incidents Statement", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["EU.PSUR.CONTENT.SERIOUS_INCIDENTS"], evidence_types: [], allowed_transformations: ["cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["If no incidents: explicit statement with period coverage."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },

  // ==================== SECTION E: NON-SERIOUS INCIDENTS (8 slots) ====================
  { slot_id: "E.01.non_serious_summary", slot_path: "E / Non-Serious Incidents / Overview", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_E_NON_SERIOUS"], evidence_types: ["incident_record"], allowed_transformations: ["summarize", "cite", "aggregate"], trace_granularity: "paragraph", dependencies: ["D.02.serious_incident_table"], acceptance_criteria: ["Total count and general characterization."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "E.02.non_serious_by_category", slot_path: "E / Non-Serious Incidents / By Category Table", slot_type: "table", requiredness: "required", obligation_ids: ["FORMQAR_E_NON_SERIOUS"], evidence_types: ["incident_record"], allowed_transformations: ["tabulate", "aggregate"], trace_granularity: "cell", dependencies: ["E.01.non_serious_summary"], acceptance_criteria: ["Categorized by incident type."], tier: 2, recommended_agents: ["IncidentTableAgent"] },
  { slot_id: "E.03.non_serious_trends", slot_path: "E / Non-Serious Incidents / Trend Observations", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_E_NON_SERIOUS"], evidence_types: ["incident_record"], allowed_transformations: ["summarize", "aggregate"], trace_granularity: "paragraph", dependencies: ["E.02.non_serious_by_category"], acceptance_criteria: ["Trends compared to previous periods."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "E.04.non_serious_rates", slot_path: "E / Non-Serious Incidents / Incidence Rates", slot_type: "object", requiredness: "required", obligation_ids: ["FORMQAR_E_NON_SERIOUS"], evidence_types: ["incident_record", "exposure_model"], allowed_transformations: ["aggregate", "cite"], trace_granularity: "paragraph", dependencies: ["E.01.non_serious_summary", "C.08.exposure_summary"], acceptance_criteria: ["Rates per exposure calculated."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "E.05.non_serious_top10", slot_path: "E / Non-Serious Incidents / Top 10 by Frequency", slot_type: "table", requiredness: "conditional", obligation_ids: ["FORMQAR_E_NON_SERIOUS"], evidence_types: ["incident_record"], allowed_transformations: ["tabulate", "aggregate"], trace_granularity: "cell", dependencies: ["E.02.non_serious_by_category"], acceptance_criteria: ["Top incident types listed."], tier: 2, recommended_agents: ["IncidentTableAgent"] },
  { slot_id: "E.06.near_miss_events", slot_path: "E / Non-Serious Incidents / Near-Miss Events", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_E_NON_SERIOUS"], evidence_types: ["incident_record"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["E.01.non_serious_summary"], acceptance_criteria: ["Near-miss events summarized if applicable."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "E.07.user_errors", slot_path: "E / Non-Serious Incidents / Use Errors", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_E_NON_SERIOUS"], evidence_types: ["incident_record"], allowed_transformations: ["summarize", "cite", "aggregate"], trace_granularity: "paragraph", dependencies: ["E.01.non_serious_summary"], acceptance_criteria: ["Use errors separately characterized."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },
  { slot_id: "E.08.non_serious_absence", slot_path: "E / Non-Serious Incidents / No Incidents Statement", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_E_NON_SERIOUS"], evidence_types: [], allowed_transformations: ["cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["If no non-serious incidents: explicit statement."], tier: 2, recommended_agents: ["IncidentAnalysisAgent"] },

  // ==================== SECTION F: COMPLAINTS (10 slots) ====================
  { slot_id: "F.01.complaints_overview", slot_path: "F / Complaints / Overview", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_F_COMPLAINTS"], evidence_types: ["complaint_record"], allowed_transformations: ["summarize", "cite", "aggregate"], trace_granularity: "paragraph", dependencies: ["C.08.exposure_summary"], acceptance_criteria: ["Total complaints and data sources."], tier: 2, recommended_agents: ["ComplaintsAgent"] },
  { slot_id: "F.02.complaints_by_category", slot_path: "F / Complaints / By Category Table", slot_type: "table", requiredness: "required", obligation_ids: ["FORMQAR_F_COMPLAINTS"], evidence_types: ["complaint_record"], allowed_transformations: ["tabulate", "aggregate"], trace_granularity: "cell", dependencies: ["F.01.complaints_overview"], acceptance_criteria: ["Categorized by complaint type."], tier: 2, recommended_agents: ["ComplaintsTableAgent"] },
  { slot_id: "F.03.complaints_by_region", slot_path: "F / Complaints / By Region Table", slot_type: "table", requiredness: "required", obligation_ids: ["FORMQAR_F_COMPLAINTS"], evidence_types: ["complaint_record"], allowed_transformations: ["tabulate", "aggregate"], trace_granularity: "cell", dependencies: ["F.01.complaints_overview"], acceptance_criteria: ["Breakdown by EU/UK/Other."], tier: 2, recommended_agents: ["ComplaintsTableAgent"] },
  { slot_id: "F.04.complaints_rates", slot_path: "F / Complaints / Complaint Rates", slot_type: "object", requiredness: "required", obligation_ids: ["FORMQAR_F_COMPLAINTS"], evidence_types: ["complaint_record", "exposure_model"], allowed_transformations: ["aggregate", "cite"], trace_granularity: "paragraph", dependencies: ["F.01.complaints_overview", "C.08.exposure_summary"], acceptance_criteria: ["Rates per exposure calculated."], tier: 2, recommended_agents: ["ComplaintsAgent"] },
  { slot_id: "F.05.complaints_trends", slot_path: "F / Complaints / Trend Analysis", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_F_COMPLAINTS"], evidence_types: ["complaint_record"], allowed_transformations: ["summarize", "aggregate"], trace_granularity: "paragraph", dependencies: ["F.02.complaints_by_category"], acceptance_criteria: ["Trends vs previous periods."], tier: 2, recommended_agents: ["ComplaintsAgent"] },
  { slot_id: "F.06.complaints_top10", slot_path: "F / Complaints / Top 10 Complaint Types", slot_type: "table", requiredness: "conditional", obligation_ids: ["FORMQAR_F_COMPLAINTS"], evidence_types: ["complaint_record"], allowed_transformations: ["tabulate", "aggregate"], trace_granularity: "cell", dependencies: ["F.02.complaints_by_category"], acceptance_criteria: ["Top complaint types ranked."], tier: 2, recommended_agents: ["ComplaintsTableAgent"] },
  { slot_id: "F.07.complaint_investigation_status", slot_path: "F / Complaints / Investigation Status", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_F_COMPLAINTS"], evidence_types: ["complaint_record"], allowed_transformations: ["summarize", "aggregate"], trace_granularity: "paragraph", dependencies: ["F.01.complaints_overview"], acceptance_criteria: ["Open vs closed investigations."], tier: 2, recommended_agents: ["ComplaintsAgent"] },
  { slot_id: "F.08.device_related_complaints", slot_path: "F / Complaints / Device-Related Analysis", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_F_COMPLAINTS"], evidence_types: ["complaint_record"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["F.02.complaints_by_category"], acceptance_criteria: ["Device-related vs non-device-related split."], tier: 2, recommended_agents: ["ComplaintsAgent"] },
  { slot_id: "F.09.severity_distribution", slot_path: "F / Complaints / Severity Distribution", slot_type: "table", requiredness: "required", obligation_ids: ["FORMQAR_F_COMPLAINTS"], evidence_types: ["complaint_record"], allowed_transformations: ["tabulate", "aggregate"], trace_granularity: "cell", dependencies: ["F.01.complaints_overview"], acceptance_criteria: ["High/Medium/Low severity breakdown."], tier: 2, recommended_agents: ["ComplaintsTableAgent"] },
  { slot_id: "F.10.complaints_absence", slot_path: "F / Complaints / No Complaints Statement", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_F_COMPLAINTS"], evidence_types: [], allowed_transformations: ["cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["If no complaints: explicit statement."], tier: 2, recommended_agents: ["ComplaintsAgent"] },
  { slot_id: "F.11.complaints_by_region_severity", slot_path: "F / Complaints / By Region and Severity Table", slot_type: "table", requiredness: "required", obligation_ids: ["FORMQAR_F_COMPLAINTS"], evidence_types: ["complaint_record"], allowed_transformations: ["tabulate", "aggregate"], trace_granularity: "cell", dependencies: ["F.01.complaints_overview"], acceptance_criteria: ["Cross-tabulation of region vs severity.", "Counts grouped by (region, seriousness)."], tier: 2, recommended_agents: ["DeterministicComplaintsAgent"] },

  // ==================== SECTION G: TREND ANALYSIS (8 slots) ====================
  { slot_id: "G.01.trend_methodology", slot_path: "G / Trend Analysis / Statistical Methodology", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.TREND_REPORTING", "FORMQAR_G_TRENDS"], evidence_types: ["complaint_record", "incident_record"], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["Statistical methods stated."], tier: 2, recommended_agents: ["TrendAnalysisAgent"] },
  { slot_id: "G.02.incident_trends", slot_path: "G / Trend Analysis / Incident Trend Chart", slot_type: "table", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.TREND_REPORTING"], evidence_types: ["incident_record"], allowed_transformations: ["tabulate", "aggregate"], trace_granularity: "cell", dependencies: ["D.02.serious_incident_table", "E.02.non_serious_by_category"], acceptance_criteria: ["Quarterly trend data."], tier: 2, recommended_agents: ["TrendAnalysisAgent"] },
  { slot_id: "G.03.complaint_trends", slot_path: "G / Trend Analysis / Complaint Trend Chart", slot_type: "table", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.TREND_REPORTING"], evidence_types: ["complaint_record"], allowed_transformations: ["tabulate", "aggregate"], trace_granularity: "cell", dependencies: ["F.02.complaints_by_category"], acceptance_criteria: ["Quarterly trend data."], tier: 2, recommended_agents: ["TrendAnalysisAgent"] },
  { slot_id: "G.04.rate_trends", slot_path: "G / Trend Analysis / Rate Trend Analysis", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.TREND_REPORTING"], evidence_types: ["incident_record", "complaint_record", "exposure_model"], allowed_transformations: ["summarize", "aggregate"], trace_granularity: "paragraph", dependencies: ["G.02.incident_trends", "G.03.complaint_trends"], acceptance_criteria: ["Rate trends normalized by exposure."], tier: 2, recommended_agents: ["TrendAnalysisAgent"] },
  { slot_id: "G.05.emerging_signals", slot_path: "G / Trend Analysis / Emerging Safety Signals", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_G_TRENDS"], evidence_types: ["incident_record", "complaint_record"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["G.04.rate_trends"], acceptance_criteria: ["New signals identified or none stated."], tier: 2, recommended_agents: ["TrendAnalysisAgent"] },
  { slot_id: "G.06.trend_comparison", slot_path: "G / Trend Analysis / Period-Over-Period Comparison", slot_type: "table", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.TREND_REPORTING"], evidence_types: ["incident_record", "complaint_record"], allowed_transformations: ["tabulate", "aggregate"], trace_granularity: "cell", dependencies: ["G.02.incident_trends"], acceptance_criteria: ["Current vs previous PSUR period."], tier: 2, recommended_agents: ["TrendAnalysisAgent"] },
  { slot_id: "G.07.trend_conclusions", slot_path: "G / Trend Analysis / Trend Conclusions", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_G_TRENDS"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["G.05.emerging_signals"], acceptance_criteria: ["Overall trend assessment stated."], tier: 2, recommended_agents: ["TrendAnalysisAgent"] },
  { slot_id: "G.08.statistical_significance", slot_path: "G / Trend Analysis / Statistical Significance", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_G_TRENDS"], evidence_types: ["incident_record", "complaint_record"], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["G.04.rate_trends"], acceptance_criteria: ["Significance testing results if applicable."], tier: 2, recommended_agents: ["TrendAnalysisAgent"] },

  // ==================== SECTION H: FSCA (6 slots) ====================
  { slot_id: "H.01.fsca_overview", slot_path: "H / FSCA / Overview", slot_type: "narrative", requiredness: "required_if_applicable", obligation_ids: ["EU.PSUR.CONTENT.FSCA", "FORMQAR_H_FSCA"], evidence_types: ["fsca"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["All FSCAs listed or none stated."], tier: 2, recommended_agents: ["FSCAAgent"] },
  { slot_id: "H.02.fsca_table", slot_path: "H / FSCA / FSCA Listing Table", slot_type: "table", requiredness: "required_if_applicable", obligation_ids: ["EU.PSUR.CONTENT.FSCA"], evidence_types: ["fsca"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["H.01.fsca_overview"], acceptance_criteria: ["Date, scope, action, status for each FSCA."], tier: 2, recommended_agents: ["FSCAAgent"] },
  { slot_id: "H.03.fsca_effectiveness", slot_path: "H / FSCA / Effectiveness Assessment", slot_type: "narrative", requiredness: "required_if_applicable", obligation_ids: ["FORMQAR_H_FSCA"], evidence_types: ["fsca"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["H.02.fsca_table"], acceptance_criteria: ["Effectiveness of completed FSCAs assessed."], tier: 2, recommended_agents: ["FSCAAgent"] },
  { slot_id: "H.04.fsca_ongoing", slot_path: "H / FSCA / Ongoing FSCAs", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_H_FSCA"], evidence_types: ["fsca"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["H.01.fsca_overview"], acceptance_criteria: ["Status of ongoing FSCAs."], tier: 2, recommended_agents: ["FSCAAgent"] },
  { slot_id: "H.05.fsca_link_to_incidents", slot_path: "H / FSCA / Link to Incidents", slot_type: "narrative", requiredness: "required_if_applicable", obligation_ids: ["EU.PSUR.CONTENT.FSCA"], evidence_types: ["fsca", "incident_record"], allowed_transformations: ["cite", "cross_reference"], trace_granularity: "paragraph", dependencies: ["D.02.serious_incident_table", "H.02.fsca_table"], acceptance_criteria: ["FSCAs linked to triggering incidents."], tier: 2, recommended_agents: ["FSCAAgent"] },
  { slot_id: "H.06.fsca_absence", slot_path: "H / FSCA / No FSCA Statement", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["EU.PSUR.CONTENT.FSCA"], evidence_types: [], allowed_transformations: ["cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["If no FSCAs: explicit statement."], tier: 2, recommended_agents: ["FSCAAgent"] },

  // ==================== SECTION I: CAPA (6 slots) ====================
  { slot_id: "I.01.capa_overview", slot_path: "I / CAPA / Overview", slot_type: "narrative", requiredness: "required_if_applicable", obligation_ids: ["FORMQAR_I_CAPA"], evidence_types: ["capa"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["D.02.serious_incident_table"], acceptance_criteria: ["CAPAs linked to incidents."], tier: 2, recommended_agents: ["CAPAAgent"] },
  { slot_id: "I.02.capa_table", slot_path: "I / CAPA / CAPA Listing Table", slot_type: "table", requiredness: "required_if_applicable", obligation_ids: ["FORMQAR_I_CAPA"], evidence_types: ["capa"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["I.01.capa_overview"], acceptance_criteria: ["CAPA ID, trigger, status, target date."], tier: 2, recommended_agents: ["CAPAAgent"] },
  { slot_id: "I.03.capa_effectiveness", slot_path: "I / CAPA / Effectiveness Verification", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_I_CAPA"], evidence_types: ["capa"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["I.02.capa_table"], acceptance_criteria: ["Completed CAPAs effectiveness verified."], tier: 2, recommended_agents: ["CAPAAgent"] },
  { slot_id: "I.04.capa_ongoing", slot_path: "I / CAPA / Ongoing CAPAs", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_I_CAPA"], evidence_types: ["capa"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["I.01.capa_overview"], acceptance_criteria: ["Status of ongoing CAPAs."], tier: 2, recommended_agents: ["CAPAAgent"] },
  { slot_id: "I.05.capa_design_changes", slot_path: "I / CAPA / Design Change Summary", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_I_CAPA"], evidence_types: ["capa"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["I.02.capa_table"], acceptance_criteria: ["Design changes from CAPAs summarized."], tier: 2, recommended_agents: ["CAPAAgent"] },
  { slot_id: "I.06.capa_absence", slot_path: "I / CAPA / No CAPA Statement", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_I_CAPA"], evidence_types: [], allowed_transformations: ["cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["If no CAPAs: explicit statement."], tier: 2, recommended_agents: ["CAPAAgent"] },

  // ==================== SECTION J: LITERATURE (10 slots) ====================
  { slot_id: "J.01.literature_methodology", slot_path: "J / Literature / Search Methodology", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.LITERATURE", "FORMQAR_J_LITERATURE"], evidence_types: ["literature"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["Databases, terms, date range stated."], tier: 3, recommended_agents: ["LiteratureAgent"] },
  { slot_id: "J.02.literature_search_strategy", slot_path: "J / Literature / Search Strategy Table", slot_type: "table", requiredness: "required", obligation_ids: ["FORMQAR_J_LITERATURE"], evidence_types: ["literature"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: [], acceptance_criteria: ["Database, terms, results count."], tier: 3, recommended_agents: ["LiteratureAgent"] },
  { slot_id: "J.03.literature_screening", slot_path: "J / Literature / Screening Process", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_J_LITERATURE"], evidence_types: ["literature"], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["J.02.literature_search_strategy"], acceptance_criteria: ["Inclusion/exclusion criteria stated."], tier: 3, recommended_agents: ["LiteratureAgent"] },
  { slot_id: "J.04.literature_relevant_articles", slot_path: "J / Literature / Relevant Articles Table", slot_type: "table", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.LITERATURE"], evidence_types: ["literature"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["J.03.literature_screening"], acceptance_criteria: ["Reference, findings, relevance for each."], tier: 3, recommended_agents: ["LiteratureAgent"] },
  { slot_id: "J.05.literature_safety_findings", slot_path: "J / Literature / Safety-Related Findings", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.LITERATURE"], evidence_types: ["literature"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["J.04.literature_relevant_articles"], acceptance_criteria: ["Safety findings synthesized."], tier: 3, recommended_agents: ["LiteratureAgent"] },
  { slot_id: "J.06.literature_efficacy_findings", slot_path: "J / Literature / Efficacy/Performance Findings", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_J_LITERATURE"], evidence_types: ["literature"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["J.04.literature_relevant_articles"], acceptance_criteria: ["Performance data synthesized if available."], tier: 3, recommended_agents: ["LiteratureAgent"] },
  { slot_id: "J.07.literature_new_risks", slot_path: "J / Literature / New Risks Identified", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.LITERATURE"], evidence_types: ["literature"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["J.05.literature_safety_findings"], acceptance_criteria: ["New risks or none stated."], tier: 3, recommended_agents: ["LiteratureAgent"] },
  { slot_id: "J.08.literature_gaps", slot_path: "J / Literature / Identified Gaps", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_J_LITERATURE"], evidence_types: ["literature"], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["J.05.literature_safety_findings"], acceptance_criteria: ["Knowledge gaps identified."], tier: 3, recommended_agents: ["LiteratureAgent"] },
  { slot_id: "J.09.literature_conclusions", slot_path: "J / Literature / Conclusions", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_J_LITERATURE"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["J.07.literature_new_risks"], acceptance_criteria: ["Overall literature conclusions stated."], tier: 3, recommended_agents: ["LiteratureAgent"] },
  { slot_id: "J.10.literature_absence", slot_path: "J / Literature / No Relevant Literature Statement", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["EU.PSUR.CONTENT.LITERATURE"], evidence_types: [], allowed_transformations: ["cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["If no relevant literature: explicit statement."], tier: 3, recommended_agents: ["LiteratureAgent"] },

  // ==================== SECTION K: EXTERNAL DATABASES (8 slots) ====================
  { slot_id: "K.01.database_methodology", slot_path: "K / Databases / Search Methodology", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_K_DATABASES"], evidence_types: ["registry"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["Databases searched and date range."], tier: 3, recommended_agents: ["DatabaseReviewAgent"] },
  { slot_id: "K.02.eudamed_review", slot_path: "K / Databases / EUDAMED Review", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_K_DATABASES"], evidence_types: ["registry"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["EUDAMED vigilance data reviewed."], tier: 3, recommended_agents: ["DatabaseReviewAgent"] },
  { slot_id: "K.03.maude_review", slot_path: "K / Databases / MAUDE Review", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_K_DATABASES"], evidence_types: ["registry"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["FDA MAUDE data reviewed if US market."], tier: 3, recommended_agents: ["DatabaseReviewAgent"] },
  { slot_id: "K.04.mhra_review", slot_path: "K / Databases / MHRA Review", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_K_DATABASES"], evidence_types: ["registry"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["MHRA data reviewed if UK market."], tier: 3, recommended_agents: ["DatabaseReviewAgent"] },
  { slot_id: "K.05.similar_device_database", slot_path: "K / Databases / Similar Device Findings", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["EU.PSUR.CONTENT.SIMILAR_DEVICES", "FORMQAR_K_DATABASES"], evidence_types: ["registry", "literature"], allowed_transformations: ["summarize", "cite", "cross_reference"], trace_granularity: "paragraph", dependencies: ["K.02.eudamed_review"], acceptance_criteria: ["Similar device data compared."], tier: 3, recommended_agents: ["DatabaseReviewAgent"] },
  { slot_id: "K.06.database_findings_table", slot_path: "K / Databases / Findings Summary Table", slot_type: "table", requiredness: "required", obligation_ids: ["FORMQAR_K_DATABASES"], evidence_types: ["registry"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["K.02.eudamed_review"], acceptance_criteria: ["Database, events found, relevance."], tier: 3, recommended_agents: ["DatabaseReviewAgent"] },
  { slot_id: "K.07.database_conclusions", slot_path: "K / Databases / Conclusions", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_K_DATABASES"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["K.06.database_findings_table"], acceptance_criteria: ["Overall database review conclusions."], tier: 3, recommended_agents: ["DatabaseReviewAgent"] },
  { slot_id: "K.08.database_absence", slot_path: "K / Databases / No External Findings Statement", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_K_DATABASES"], evidence_types: [], allowed_transformations: ["cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["If no external findings: explicit statement."], tier: 3, recommended_agents: ["DatabaseReviewAgent"] },

  // ==================== SECTION L: PMCF (10 slots) ====================
  { slot_id: "L.01.pmcf_overview", slot_path: "L / PMCF / Overview", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.PMCF", "FORMQAR_L_PMCF"], evidence_types: ["pmcf"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["PMCF plan summary."], tier: 3, recommended_agents: ["PMCFAgent"] },
  { slot_id: "L.02.pmcf_activities_table", slot_path: "L / PMCF / Activities Table", slot_type: "table", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.PMCF"], evidence_types: ["pmcf"], allowed_transformations: ["tabulate", "cite"], trace_granularity: "cell", dependencies: ["L.01.pmcf_overview"], acceptance_criteria: ["Activity, status, timeline for each."], tier: 3, recommended_agents: ["PMCFAgent"] },
  { slot_id: "L.03.pmcf_studies_ongoing", slot_path: "L / PMCF / Ongoing Studies", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_L_PMCF"], evidence_types: ["pmcf"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["L.02.pmcf_activities_table"], acceptance_criteria: ["Ongoing PMCF studies described."], tier: 3, recommended_agents: ["PMCFAgent"] },
  { slot_id: "L.04.pmcf_studies_completed", slot_path: "L / PMCF / Completed Studies", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_L_PMCF"], evidence_types: ["pmcf"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["L.02.pmcf_activities_table"], acceptance_criteria: ["Completed studies and results."], tier: 3, recommended_agents: ["PMCFAgent"] },
  { slot_id: "L.05.pmcf_findings", slot_path: "L / PMCF / Key Findings", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.PMCF"], evidence_types: ["pmcf"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["L.04.pmcf_studies_completed"], acceptance_criteria: ["Safety/performance findings summarized."], tier: 3, recommended_agents: ["PMCFAgent"] },
  { slot_id: "L.06.pmcf_registries", slot_path: "L / PMCF / Registry Data", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_L_PMCF"], evidence_types: ["pmcf", "registry"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["Registry participation and data if applicable."], tier: 3, recommended_agents: ["PMCFAgent"] },
  { slot_id: "L.07.pmcf_user_feedback", slot_path: "L / PMCF / User Feedback Surveys", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_L_PMCF"], evidence_types: ["pmcf"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["User feedback data if collected."], tier: 3, recommended_agents: ["PMCFAgent"] },
  { slot_id: "L.08.pmcf_cer_update", slot_path: "L / PMCF / CER Update Impact", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.PMCF"], evidence_types: ["pmcf"], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["L.05.pmcf_findings"], acceptance_criteria: ["Impact on CER stated."], tier: 3, recommended_agents: ["PMCFAgent"] },
  { slot_id: "L.09.pmcf_conclusions", slot_path: "L / PMCF / Conclusions", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_L_PMCF"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["L.08.pmcf_cer_update"], acceptance_criteria: ["Overall PMCF conclusions."], tier: 3, recommended_agents: ["PMCFAgent"] },
  { slot_id: "L.10.pmcf_absence", slot_path: "L / PMCF / No PMCF Statement", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["EU.PSUR.CONTENT.PMCF"], evidence_types: [], allowed_transformations: ["cite"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["If no PMCF activities: justified statement."], tier: 3, recommended_agents: ["PMCFAgent"] },

  // ==================== SECTION M: BENEFIT-RISK & CONCLUSIONS (12 slots) ====================
  { slot_id: "M.01.br_methodology", slot_path: "M / Benefit-Risk / Methodology", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.BENEFIT_RISK", "FORMQAR_M_BENEFIT_RISK"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: [], acceptance_criteria: ["B-R methodology stated."], tier: 4, recommended_agents: ["BenefitRiskAgent"] },
  { slot_id: "M.02.known_risks_update", slot_path: "M / Benefit-Risk / Known Risks Update", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.BENEFIT_RISK"], evidence_types: ["incident_record", "complaint_record"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["G.07.trend_conclusions"], acceptance_criteria: ["Known risks reviewed with new data."], tier: 4, recommended_agents: ["BenefitRiskAgent"] },
  { slot_id: "M.03.new_risks_identified", slot_path: "M / Benefit-Risk / New Risks Identified", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.BENEFIT_RISK"], evidence_types: ["incident_record", "complaint_record", "literature"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["J.07.literature_new_risks", "G.05.emerging_signals"], acceptance_criteria: ["New risks or none explicitly stated."], tier: 4, recommended_agents: ["BenefitRiskAgent"] },
  { slot_id: "M.04.risk_mitigation_update", slot_path: "M / Benefit-Risk / Risk Mitigation Measures", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_M_BENEFIT_RISK"], evidence_types: ["capa", "fsca"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["I.01.capa_overview", "H.01.fsca_overview"], acceptance_criteria: ["Mitigation measures status."], tier: 4, recommended_agents: ["BenefitRiskAgent"] },
  { slot_id: "M.05.clinical_benefit_summary", slot_path: "M / Benefit-Risk / Clinical Benefit Summary", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.BENEFIT_RISK"], evidence_types: ["pmcf", "literature"], allowed_transformations: ["summarize", "cite"], trace_granularity: "paragraph", dependencies: ["L.05.pmcf_findings"], acceptance_criteria: ["Clinical benefits stated."], tier: 4, recommended_agents: ["BenefitRiskAgent"] },
  { slot_id: "M.06.br_profile_table", slot_path: "M / Benefit-Risk / B-R Profile Table", slot_type: "table", requiredness: "required", obligation_ids: ["FORMQAR_M_BENEFIT_RISK"], evidence_types: ["incident_record", "complaint_record", "pmcf"], allowed_transformations: ["tabulate", "summarize"], trace_granularity: "cell", dependencies: ["M.02.known_risks_update", "M.05.clinical_benefit_summary"], acceptance_criteria: ["Risks vs benefits tabulated."], tier: 4, recommended_agents: ["BenefitRiskAgent"] },
  { slot_id: "M.07.overall_br_conclusion", slot_path: "M / Benefit-Risk / Overall Conclusion", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.BENEFIT_RISK", "FORMQAR_M_BENEFIT_RISK"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["M.06.br_profile_table"], acceptance_criteria: ["Positive B-R determination stated."], tier: 4, recommended_agents: ["BenefitRiskAgent"] },
  { slot_id: "M.08.conclusions_summary", slot_path: "M / Conclusions / Summary Statement", slot_type: "narrative", requiredness: "required", obligation_ids: ["EU.PSUR.CONTENT.CONCLUSIONS", "FORMQAR_M_CONCLUSIONS"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["M.07.overall_br_conclusion"], acceptance_criteria: ["Conclusions consistent with prior sections."], tier: 4, recommended_agents: ["ConclusionAgent"] },
  { slot_id: "M.09.actions_recommended", slot_path: "M / Conclusions / Recommended Actions", slot_type: "narrative", requiredness: "required", obligation_ids: ["FORMQAR_M_CONCLUSIONS"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["M.08.conclusions_summary"], acceptance_criteria: ["Actions recommended or none needed stated."], tier: 4, recommended_agents: ["ConclusionAgent"] },
  { slot_id: "M.10.ifu_labeling_changes", slot_path: "M / Conclusions / IFU/Labeling Changes", slot_type: "narrative", requiredness: "conditional", obligation_ids: ["FORMQAR_M_CONCLUSIONS"], evidence_types: [], allowed_transformations: ["summarize"], trace_granularity: "paragraph", dependencies: ["M.09.actions_recommended"], acceptance_criteria: ["Labeling changes or none stated."], tier: 4, recommended_agents: ["ConclusionAgent"] },
  { slot_id: "M.11.next_psur_period", slot_path: "M / Conclusions / Next PSUR Period", slot_type: "kv", requiredness: "required", obligation_ids: ["FORMQAR_M_CONCLUSIONS"], evidence_types: ["psur_case_record"], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: [], acceptance_criteria: ["Next reporting period stated."], tier: 4, recommended_agents: ["ConclusionAgent"] },
  { slot_id: "M.12.authorizing_signature", slot_path: "M / Conclusions / Authorization Statement", slot_type: "object", requiredness: "required", obligation_ids: ["FORMQAR_M_CONCLUSIONS"], evidence_types: [], allowed_transformations: ["cite"], trace_granularity: "key", dependencies: ["M.08.conclusions_summary"], acceptance_criteria: ["Authorized signatory information."], tier: 4, recommended_agents: ["ConclusionAgent"] },
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

// Validate slots at module initialization to catch misalignments early
let slotsValidated = false;

export function getSlotDefinitionsForTemplate(profileId: string): SlotDefinition[] {
  const slots = profileId === "FormQAR-054_C" ? FORMQAR_SLOTS : ANNEX_I_SLOTS;
  
  if (!slotsValidated) {
    validateSlotEvidenceTypes(ANNEX_I_SLOTS, "ANNEX_I_SLOTS");
    validateSlotEvidenceTypes(FORMQAR_SLOTS, "FORMQAR_SLOTS");
    slotsValidated = true;
  }
  
  return slots;
}

function getSlotDefinitions(profileId: string): SlotDefinition[] {
  const slots = profileId === "FormQAR-054_C" ? FORMQAR_SLOTS : ANNEX_I_SLOTS;
  
  if (!slotsValidated) {
    validateSlotEvidenceTypes(ANNEX_I_SLOTS, "ANNEX_I_SLOTS");
    validateSlotEvidenceTypes(FORMQAR_SLOTS, "FORMQAR_SLOTS");
    slotsValidated = true;
  }
  
  return slots;
}

// Check if any available evidence type satisfies a required type (with raw→aggregated mapping)
function hasEvidenceSatisfyingType(requiredType: string, availableTypes: Set<string>): boolean {
  const typesArray = Array.from(availableTypes);
  for (const availableType of typesArray) {
    if (evidenceTypeSatisfies(availableType, requiredType)) return true;
  }
  return false;
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
  
  // Use raw→aggregated mapping for evidence satisfaction
  const hasAllEvidence = slot.evidence_types.every(et => hasEvidenceSatisfyingType(et, availableEvidenceTypes));
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

function isAtomInPeriod(atom: EvidenceAtom, periodStart: Date, periodEnd: Date): boolean {
  if (!atom.periodStart || !atom.periodEnd) return false;
  const atomStart = new Date(atom.periodStart);
  const atomEnd = new Date(atom.periodEnd);
  return atomStart >= periodStart && atomEnd <= periodEnd;
}

function getEvidenceCoverage(atoms: EvidenceAtom[], evidenceType: string, periodStart: Date, periodEnd: Date): {
  total: number;
  inPeriod: number;
  outOfPeriod: number;
  coverage: "full" | "partial" | "none" | "out_of_period";
} {
  const typeAtoms = atoms.filter(a => a.evidenceType === evidenceType);
  const inPeriodAtoms = typeAtoms.filter(a => isAtomInPeriod(a, periodStart, periodEnd));
  const outOfPeriodAtoms = typeAtoms.length - inPeriodAtoms.length;
  
  let coverage: "full" | "partial" | "none" | "out_of_period" = "none";
  if (typeAtoms.length === 0) coverage = "none";
  else if (inPeriodAtoms.length === 0) coverage = "out_of_period";
  else if (inPeriodAtoms.length === typeAtoms.length) coverage = "full";
  else coverage = "partial";
  
  return {
    total: typeAtoms.length,
    inPeriod: inPeriodAtoms.length,
    outOfPeriod: outOfPeriodAtoms,
    coverage,
  };
}

export function buildCoverageSlotQueue(input: QueueBuilderInput): CoverageSlotQueueOutput {
  const slots = getSlotDefinitions(input.profileId);
  
  const availableEvidenceTypes = new Set<string>();
  const inPeriodEvidenceTypes = new Set<string>();
  const evidenceCoverageMap = new Map<string, ReturnType<typeof getEvidenceCoverage>>();
  
  for (const atom of input.evidenceAtoms) {
    availableEvidenceTypes.add(atom.evidenceType);
    if (isAtomInPeriod(atom, input.periodStart, input.periodEnd)) {
      inPeriodEvidenceTypes.add(atom.evidenceType);
    }
    
    if (!evidenceCoverageMap.has(atom.evidenceType)) {
      evidenceCoverageMap.set(
        atom.evidenceType, 
        getEvidenceCoverage(input.evidenceAtoms, atom.evidenceType, input.periodStart, input.periodEnd)
      );
    }
  }
  
  // Seed aggregated types from raw data (raw→aggregated mapping)
  // When raw records exist, they contribute to aggregated type requirements
  for (const [rawType, aggregatedType] of Object.entries(RAW_TO_AGGREGATED_MAP)) {
    if (availableEvidenceTypes.has(rawType) && !availableEvidenceTypes.has(aggregatedType)) {
      // Raw data exists but aggregated key not set - add aggregated availability 
      availableEvidenceTypes.add(aggregatedType);
      
      if (inPeriodEvidenceTypes.has(rawType)) {
        inPeriodEvidenceTypes.add(aggregatedType);
      }
      
      // Copy coverage from raw to aggregated
      const rawCoverage = evidenceCoverageMap.get(rawType);
      if (rawCoverage && !evidenceCoverageMap.has(aggregatedType)) {
        evidenceCoverageMap.set(aggregatedType, rawCoverage);
      }
    }
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
    // Use raw→aggregated mapping for evidence satisfaction
    const missingEvidence = slot.evidence_types.filter(et => !hasEvidenceSatisfyingType(et, availableEvidenceTypes));
    const availableEvidence = slot.evidence_types.filter(et => hasEvidenceSatisfyingType(et, availableEvidenceTypes));
    const inPeriodEvidence = slot.evidence_types.filter(et => hasEvidenceSatisfyingType(et, inPeriodEvidenceTypes));
    
    let periodCheck: "pass" | "partial" | "fail" | "unknown" = "unknown";
    if (slot.evidence_types.length === 0) {
      periodCheck = "pass";
    } else if (missingEvidence.length === slot.evidence_types.length) {
      periodCheck = "fail";
    } else if (inPeriodEvidence.length === slot.evidence_types.length) {
      periodCheck = "pass";
    } else if (inPeriodEvidence.length > 0) {
      periodCheck = "partial";
    } else if (availableEvidence.length > 0 && inPeriodEvidence.length === 0) {
      periodCheck = "fail";
    }
    
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
    
    const evidenceCoverageDetails = slot.evidence_types.map(et => {
      // Check if required type is satisfied by any available type (including raw→aggregated)
      const available = hasEvidenceSatisfyingType(et, availableEvidenceTypes);
      const inPeriod = hasEvidenceSatisfyingType(et, inPeriodEvidenceTypes);
      
      // Get coverage from direct type or contributing types
      let coverageInfo = evidenceCoverageMap.get(et);
      if (!coverageInfo) {
        const contributingTypes = getTypesContributingTo(et);
        for (const ct of contributingTypes) {
          const ctInfo = evidenceCoverageMap.get(ct);
          if (ctInfo) {
            coverageInfo = ctInfo;
            break;
          }
        }
      }
      
      return {
        type: et,
        available,
        inPeriod,
        coverage: coverageInfo?.coverage || "none",
        atomCount: coverageInfo?.total || 0,
        inPeriodCount: coverageInfo?.inPeriod || 0,
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
        in_period_evidence_types: inPeriodEvidence,
        period_check: periodCheck,
        evidence_coverage: evidenceCoverageDetails,
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
