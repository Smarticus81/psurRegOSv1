/**
 * Coverage Slot Queue Builder
 * 
 * Builds comprehensive slot queues with:
 * - Obligation mapping and satisfaction status
 * - Evidence requirements and coverage analysis
 * - Recommended agents for content generation
 * - Generation contracts and dependencies
 * 
 * Populates the QueueSlotItem interface fully for regulatory compliance tracking.
 */

import { db } from "./db";
import { eq, and, inArray } from "drizzle-orm";
import {
  slotDefinitions,
  slotObligationLinks,
  grkbObligations,
  templates,
  QueueSlotItem,
  type EvidenceAtom,
  type SlotProposal,
} from "@shared/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT MAPPINGS (Centralized from compileOrchestrator)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps MDCG slot IDs to narrative agent class names
 */
const NARRATIVE_AGENT_MAP: Record<string, string> = {
  // MDCG Annex I standard slots
  "MDCG.ANNEXI.TOC": "DocumentFormatterAgent",
  "MDCG.ANNEXI.COVER": "DocumentFormatterAgent",
  "MDCG.ANNEXI.EXEC_SUMMARY": "ExecSummaryNarrativeAgent",
  "MDCG.ANNEXI.DEVICES_SCOPE": "DeviceScopeNarrativeAgent",
  "MDCG.ANNEXI.DEVICES_CHANGES": "DeviceScopeNarrativeAgent",
  "MDCG.ANNEXI.PMS_OVERVIEW": "PMSActivityNarrativeAgent",
  "MDCG.ANNEXI.SALES_VOLUME_EXPOSURE": "PMSActivityNarrativeAgent",
  "MDCG.ANNEXI.SERIOUS_INCIDENTS_SUMMARY": "SafetyNarrativeAgent",
  "MDCG.ANNEXI.COMPLAINTS_SUMMARY": "SafetyNarrativeAgent",
  "MDCG.ANNEXI.TREND_REPORTING": "TrendNarrativeAgent",
  "MDCG.ANNEXI.FSCA_SUMMARY": "FSCANarrativeAgent",
  "MDCG.ANNEXI.CAPA_SUMMARY": "CAPANarrativeAgent",
  "MDCG.ANNEXI.LITERATURE_REVIEW": "ClinicalNarrativeAgent",
  "MDCG.ANNEXI.PMCF_OVERVIEW": "ClinicalNarrativeAgent",
  "MDCG.ANNEXI.PMCF_SUMMARY": "ClinicalNarrativeAgent",
  "MDCG.ANNEXI.EXTERNAL_DB_REVIEW": "ClinicalNarrativeAgent",
  "MDCG.ANNEXI.EXTERNAL_DATABASES": "ClinicalNarrativeAgent",
  "MDCG.ANNEXI.BENEFIT_RISK_ASSESSMENT": "BenefitRiskNarrativeAgent",
  "MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION": "BenefitRiskNarrativeAgent",
  "MDCG.ANNEXI.CONCLUSIONS_ACTIONS": "ConclusionNarrativeAgent",
  "MDCG.ANNEXI.ACTIONS_TAKEN": "ConclusionNarrativeAgent",
};

/**
 * Maps MDCG slot IDs to table agent class names
 */
const TABLE_AGENT_MAP: Record<string, string> = {
  "MDCG.ANNEXI.SALES_TABLE": "SalesExposureTableAgent",
  "MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE_IMDRF": "SeriousIncidentsTableAgent",
  "MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE": "SeriousIncidentsTableAgent",
  "MDCG.ANNEXI.COMPLAINTS_BY_REGION_SEVERITY_TABLE": "ComplaintsTableAgent",
  "MDCG.ANNEXI.COMPLAINTS_TABLE": "ComplaintsTableAgent",
  "MDCG.ANNEXI.TREND_TABLE": "TrendAnalysisTableAgent",
  "MDCG.ANNEXI.FSCA_TABLE": "FSCATableAgent",
  "MDCG.ANNEXI.CAPA_TABLE": "CAPATableAgent",
  "MDCG.ANNEXI.LITERATURE_TABLE": "LiteratureTableAgent",
  "MDCG.ANNEXI.PMCF_TABLE": "PMCFTableAgent",
};

/**
 * Maps chart types to chart agent class names
 */
const CHART_AGENT_MAP: Record<string, string> = {
  "trend_line": "TrendLineChartAgent",
  "complaint_bar": "ComplaintBarChartAgent",
  "distribution_pie": "DistributionPieChartAgent",
  "geographic_heat": "GeographicHeatMapAgent",
  "time_series": "TimeSeriesChartAgent",
};

/**
 * Maps form section IDs to agent names (for form-based templates)
 */
const FORM_SECTION_AGENT_MAP: Record<string, { narrative: string; table?: string }> = {
  "A_executive_summary": { narrative: "ExecSummaryNarrativeAgent" },
  "B_scope_and_device_description": { narrative: "DeviceScopeNarrativeAgent" },
  "C_volume_of_sales_and_population_exposure": { narrative: "PMSActivityNarrativeAgent", table: "SalesExposureTableAgent" },
  "D_information_on_serious_incidents": { narrative: "SafetyNarrativeAgent", table: "SeriousIncidentsTableAgent" },
  "E_customer_feedback": { narrative: "SafetyNarrativeAgent" },
  "F_product_complaint_types_counts_and_rates": { narrative: "SafetyNarrativeAgent", table: "ComplaintsTableAgent" },
  "G_information_from_trend_reporting": { narrative: "TrendNarrativeAgent", table: "TrendAnalysisTableAgent" },
  "H_information_from_fsca": { narrative: "FSCANarrativeAgent", table: "FSCATableAgent" },
  "I_corrective_and_preventive_actions": { narrative: "CAPANarrativeAgent", table: "CAPATableAgent" },
  "J_scientific_literature_review": { narrative: "ClinicalNarrativeAgent", table: "LiteratureTableAgent" },
  "K_review_of_external_databases_and_registries": { narrative: "ClinicalNarrativeAgent" },
  "L_pmcf": { narrative: "ClinicalNarrativeAgent", table: "PMCFTableAgent" },
  "M_findings_and_conclusions": { narrative: "ConclusionNarrativeAgent" },
};

/**
 * Maps template agent_assignment field values to actual agent class names
 */
const TEMPLATE_AGENT_ASSIGNMENT_MAP: Record<string, string[]> = {
  "document_formatter": ["DocumentFormatterAgent"],
  "executive_summary_agent": ["ExecSummaryNarrativeAgent"],
  "device_description_agent": ["DeviceScopeNarrativeAgent"],
  "sales_distribution_agent": ["PMSActivityNarrativeAgent", "SalesExposureTableAgent"],
  "safety_narrative_agent": ["SafetyNarrativeAgent", "SeriousIncidentsTableAgent", "ComplaintsTableAgent"],
  "trend_analysis_agent": ["TrendNarrativeAgent", "TrendAnalysisTableAgent", "TrendLineChartAgent"],
  "fsca_narrative_agent": ["FSCANarrativeAgent", "FSCATableAgent"],
  "capa_documentation_agent": ["CAPANarrativeAgent", "CAPATableAgent"],
  "clinical_narrative_agent": ["ClinicalNarrativeAgent", "LiteratureTableAgent", "PMCFTableAgent"],
  "conclusions_actions_agent": ["ConclusionNarrativeAgent", "BenefitRiskNarrativeAgent"],
};

/**
 * Maps evidence types to relevant chart agents
 */
const EVIDENCE_TO_CHART_MAP: Record<string, string[]> = {
  "trend_analysis": ["TrendLineChartAgent", "TimeSeriesChartAgent"],
  "complaint_record": ["ComplaintBarChartAgent", "DistributionPieChartAgent"],
  "sales_volume": ["DistributionPieChartAgent", "TimeSeriesChartAgent"],
  "sales_by_region": ["GeographicHeatMapAgent", "DistributionPieChartAgent"],
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface BuildQueueInput {
  psurReference: string;
  profileId: string;  // templateId
  jurisdictions: string[];
  evidenceAtoms: EvidenceAtom[];
  acceptedProposals: SlotProposal[];
  periodStart: Date;
  periodEnd: Date;
}

export interface BuildQueueOutput {
  psurReference: string;
  profileId: string;
  queue: QueueSlotItem[];
  coverageSummary: {
    mandatoryObligationsTotal: number;
    mandatoryObligationsSatisfied: number;
    mandatoryObligationsRemaining: number;
    requiredSlotsTotal: number;
    requiredSlotsFilled: number;
    requiredSlotsRemaining: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT RECOMMENDATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine recommended agents for a slot based on multiple sources
 */
function getRecommendedAgents(
  slotId: string,
  slotType: "narrative" | "table" | "kv" | "object" | "array",
  mdcgReference: string | null,
  templateAgentAssignment: string | null,
  evidenceTypes: string[]
): string[] {
  const agents = new Set<string>();

  // 1. Direct MDCG slot mapping (highest priority for standard templates)
  if (mdcgReference) {
    const narrativeAgent = NARRATIVE_AGENT_MAP[mdcgReference];
    const tableAgent = TABLE_AGENT_MAP[mdcgReference];
    
    if (narrativeAgent) agents.add(narrativeAgent);
    if (tableAgent) agents.add(tableAgent);
  }

  // 2. Check by slot ID directly (for custom slot IDs that match MDCG pattern)
  const narrativeBySlotId = NARRATIVE_AGENT_MAP[slotId];
  const tableBySlotId = TABLE_AGENT_MAP[slotId];
  if (narrativeBySlotId) agents.add(narrativeBySlotId);
  if (tableBySlotId) agents.add(tableBySlotId);

  // 3. Template's agent_assignment field
  if (templateAgentAssignment) {
    const assignedAgents = TEMPLATE_AGENT_ASSIGNMENT_MAP[templateAgentAssignment];
    if (assignedAgents) {
      assignedAgents.forEach(a => agents.add(a));
    }
  }

  // 4. Form section mapping (if slot ID matches form section pattern)
  const formSection = FORM_SECTION_AGENT_MAP[slotId];
  if (formSection) {
    agents.add(formSection.narrative);
    if (formSection.table) agents.add(formSection.table);
  }

  // 5. Evidence-based chart recommendations
  for (const evidenceType of evidenceTypes) {
    const chartAgents = EVIDENCE_TO_CHART_MAP[evidenceType];
    if (chartAgents) {
      chartAgents.forEach(a => agents.add(a));
    }
  }

  // 6. Fallback based on slot type
  if (agents.size === 0) {
    switch (slotType) {
      case "narrative":
        agents.add("NarrativeWriterAgent");
        break;
      case "table":
        agents.add("GenericTableAgent");
        break;
      default:
        agents.add("DeterministicGenerator");
    }
  }

  return Array.from(agents);
}

/**
 * Determine slot type from slot kind or data type
 */
function determineSlotType(slotKind: string | null, dataType?: string): "narrative" | "table" | "kv" | "object" | "array" {
  const kind = (slotKind || dataType || "").toLowerCase();
  
  if (kind.includes("table")) return "table";
  if (kind.includes("narrative") || kind.includes("text") || kind.includes("summary")) return "narrative";
  if (kind.includes("array") || kind.includes("list")) return "array";
  if (kind.includes("kv") || kind.includes("key")) return "kv";
  if (kind.includes("admin") || kind.includes("metric")) return "kv";
  
  // Default based on common patterns
  return "narrative";
}

/**
 * Determine generation contract transformations based on slot type and evidence
 */
function getGenerationContract(
  slotType: "narrative" | "table" | "kv" | "object" | "array",
  hasEvidence: boolean
): QueueSlotItem["generation_contract"] {
  const baseContract = {
    forbidden_transformations: ["fabricate_data", "hallucinate_statistics", "invent_citations"],
    must_include: [] as string[],
    trace_granularity: "paragraph" as const,
  };

  switch (slotType) {
    case "narrative":
      return {
        ...baseContract,
        allowed_transformations: hasEvidence 
          ? ["summarize", "synthesize", "cite_evidence", "calculate_rates", "identify_trends"]
          : ["state_data_gap", "reference_requirements"],
        must_include: ["evidence_citations", "reporting_period_context"],
        trace_granularity: "paragraph",
      };
    case "table":
      return {
        ...baseContract,
        allowed_transformations: hasEvidence
          ? ["aggregate", "pivot", "calculate", "format_cells", "add_totals"]
          : ["show_empty_table", "indicate_missing_data"],
        must_include: ["column_headers", "data_sources"],
        trace_granularity: "cell",
      };
    case "kv":
    case "object":
      return {
        ...baseContract,
        allowed_transformations: ["extract", "format", "validate"],
        must_include: ["field_values"],
        trace_granularity: "key",
      };
    case "array":
      return {
        ...baseContract,
        allowed_transformations: ["collect", "deduplicate", "sort", "filter"],
        must_include: ["item_count"],
        trace_granularity: "cell",
      };
  }
}

/**
 * Get acceptance criteria based on slot type and obligations
 */
function getAcceptanceCriteria(
  slotType: "narrative" | "table" | "kv" | "object" | "array",
  obligationIds: string[],
  requiredEvidenceTypes: string[]
): string[] {
  const criteria: string[] = [];

  // Universal criteria
  criteria.push("All cited evidence must exist in the evidence store");
  criteria.push("Content must be traceable to source evidence atoms");
  
  switch (slotType) {
    case "narrative":
      criteria.push("Narrative must address all claimed obligations");
      criteria.push("No hallucinated statistics or fabricated data");
      criteria.push("Must state data gaps explicitly if evidence missing");
      criteria.push("Word count must be within template guidelines");
      break;
    case "table":
      criteria.push("Table structure must match template schema");
      criteria.push("All numeric values must be traceable to evidence");
      criteria.push("Calculations must be verifiable");
      criteria.push("Empty cells must be justified");
      break;
    case "kv":
      criteria.push("All required fields must be populated");
      criteria.push("Values must match expected data types");
      break;
    case "array":
      criteria.push("All items must be from valid evidence sources");
      criteria.push("Deduplication must be applied if specified");
      break;
  }

  // Obligation-specific criteria
  if (obligationIds.length > 0) {
    criteria.push(`Must satisfy ${obligationIds.length} regulatory obligation(s)`);
  }

  // Evidence-specific criteria
  if (requiredEvidenceTypes.length > 0) {
    criteria.push(`Requires evidence types: ${requiredEvidenceTypes.join(", ")}`);
  }

  return criteria;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN BUILDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a comprehensive coverage slot queue with all fields populated
 */
export async function buildCoverageSlotQueue(input: BuildQueueInput): Promise<BuildQueueOutput> {
  const { psurReference, profileId, jurisdictions, evidenceAtoms, acceptedProposals, periodStart, periodEnd } = input;

  // 1. Load slot definitions for this template
  const slots = await db
    .select()
    .from(slotDefinitions)
    .where(eq(slotDefinitions.templateId, profileId));

  if (slots.length === 0) {
    // Try to load from the templates table's JSON
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.templateId, profileId))
      .limit(1);

    if (template?.templateJson) {
      const templateJson = template.templateJson as any;
      if (templateJson.slots) {
        // Build queue from template JSON slots
        return buildQueueFromTemplateJson(input, templateJson);
      }
    }
  }

  // 2. Load obligation links for all slots
  const slotIds = slots.map(s => s.slotId);
  const obligationLinks = slotIds.length > 0 
    ? await db
        .select()
        .from(slotObligationLinks)
        .where(eq(slotObligationLinks.templateId, profileId))
    : [];

  // 3. Load obligation details
  const obligationIds = Array.from(new Set(obligationLinks.map(l => l.obligationId)));
  const obligations = obligationIds.length > 0
    ? await db
        .select()
        .from(grkbObligations)
        .where(inArray(grkbObligations.obligationId, obligationIds))
    : [];

  // Build obligation lookup
  const obligationMap = new Map(obligations.map(o => [o.obligationId, o]));

  // 4. Build evidence type index
  const evidenceByType = new Map<string, typeof evidenceAtoms>();
  for (const atom of evidenceAtoms) {
    const existing = evidenceByType.get(atom.evidenceType) || [];
    existing.push(atom);
    evidenceByType.set(atom.evidenceType, existing);
  }

  // 5. Build accepted proposal index
  const acceptedBySlot = new Map<string, typeof acceptedProposals[0]>();
  for (const proposal of acceptedProposals) {
    if (proposal.status === "accepted") {
      acceptedBySlot.set(proposal.slotId, proposal);
    }
  }

  // 6. Build queue items
  const queueItems: QueueSlotItem[] = [];
  let satisfiedObligations = new Set<string>();
  let filledSlots = 0;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const slotLinks = obligationLinks.filter(l => l.slotId === slot.slotId);
    const requiredTypes = (slot.requiredEvidenceTypes as string[]) || [];
    
    // Check evidence availability
    const availableTypes: string[] = [];
    const missingTypes: string[] = [];
    const evidenceCoverage: QueueSlotItem["evidence_requirements"]["evidence_coverage"] = [];

    for (const type of requiredTypes) {
      const atoms = evidenceByType.get(type) || [];
      const inPeriodAtoms = atoms.filter(a => {
        const extractDate = a.extractDate ? new Date(a.extractDate) : null;
        return extractDate && extractDate >= periodStart && extractDate <= periodEnd;
      });

      if (atoms.length > 0) {
        availableTypes.push(type);
      } else {
        missingTypes.push(type);
      }

      evidenceCoverage.push({
        type,
        available: atoms.length > 0,
        inPeriod: inPeriodAtoms.length > 0,
        coverage: atoms.length === 0 ? "none" 
          : inPeriodAtoms.length > 0 ? "full" 
          : "out_of_period",
        atomCount: atoms.length,
        inPeriodCount: inPeriodAtoms.length,
      });
    }

    // Check if slot is filled
    const acceptedProposal = acceptedBySlot.get(slot.slotId);
    const isFilled = !!acceptedProposal;
    if (isFilled) filledSlots++;

    // Determine slot type
    const slotType = determineSlotType(null, slot.title);

    // Build mapped obligations with satisfaction status
    const mappedObligations: QueueSlotItem["mapped_obligations"] = slotLinks.map(link => {
      const obligation = obligationMap.get(link.obligationId);
      const isSatisfied = isFilled && missingTypes.length === 0;
      
      if (isSatisfied) {
        satisfiedObligations.add(link.obligationId);
      }

      return {
        obligation_id: link.obligationId,
        requirement_level: obligation?.mandatory ? "MUST" as const : "SHOULD" as const,
        status: isSatisfied ? "satisfied" as const 
          : isFilled ? "partially_satisfied" as const 
          : "unsatisfied" as const,
        why_unsatisfied: isSatisfied ? [] : [
          ...(missingTypes.length > 0 ? [`Missing evidence: ${missingTypes.join(", ")}`] : []),
          ...(!isFilled ? ["Slot content not generated/accepted"] : []),
        ],
      };
    });

    // Get recommended agents
    const recommendedAgents = getRecommendedAgents(
      slot.slotId,
      slotType,
      null, // mdcgReference - could be added to slot definitions
      null, // templateAgentAssignment - could be added to slot definitions
      requiredTypes
    );

    // Build queue item
    const queueItem: QueueSlotItem = {
      queue_rank: i + 1,
      slot_id: slot.slotId,
      slot_path: slot.description || slot.title,
      slot_type: slotType,
      requiredness: slot.hardRequireEvidence ? "required" : "conditional",
      mapped_obligations: mappedObligations,
      evidence_requirements: {
        required_evidence_types: requiredTypes,
        available_evidence_types: availableTypes,
        missing_evidence_types: missingTypes,
        in_period_evidence_types: availableTypes.filter(t => 
          evidenceCoverage.find(c => c.type === t)?.inPeriod
        ),
        period_check: missingTypes.length === 0 
          ? "pass" 
          : availableTypes.length > 0 
            ? "partial" 
            : requiredTypes.length === 0 
              ? "unknown" 
              : "fail",
        evidence_coverage: evidenceCoverage,
      },
      generation_contract: getGenerationContract(slotType, availableTypes.length > 0),
      dependencies: {
        must_fill_before: [], // Could be populated from template dependencies
        must_have_evidence_before: missingTypes,
      },
      recommended_agents: recommendedAgents,
      acceptance_criteria: getAcceptanceCriteria(
        slotType,
        slotLinks.map(l => l.obligationId),
        requiredTypes
      ),
    };

    queueItems.push(queueItem);
  }

  // Sort by priority (unsatisfied obligations first, then by rank)
  queueItems.sort((a, b) => {
    const aUnsatisfied = a.mapped_obligations.filter(o => o.status === "unsatisfied").length;
    const bUnsatisfied = b.mapped_obligations.filter(o => o.status === "unsatisfied").length;
    if (aUnsatisfied !== bUnsatisfied) return bUnsatisfied - aUnsatisfied;
    return a.queue_rank - b.queue_rank;
  });

  // Recalculate ranks after sorting
  queueItems.forEach((item, idx) => {
    item.queue_rank = idx + 1;
  });

  return {
    psurReference,
    profileId,
    queue: queueItems,
    coverageSummary: {
      mandatoryObligationsTotal: obligationIds.length,
      mandatoryObligationsSatisfied: satisfiedObligations.size,
      mandatoryObligationsRemaining: obligationIds.length - satisfiedObligations.size,
      requiredSlotsTotal: slots.filter(s => s.hardRequireEvidence).length,
      requiredSlotsFilled: filledSlots,
      requiredSlotsRemaining: slots.filter(s => s.hardRequireEvidence).length - filledSlots,
    },
  };
}

/**
 * Build queue from template JSON when no database slots exist
 */
async function buildQueueFromTemplateJson(
  input: BuildQueueInput,
  templateJson: any
): Promise<BuildQueueOutput> {
  const { evidenceAtoms, acceptedProposals, periodStart, periodEnd } = input;
  const slots = templateJson.slots || [];

  // Build evidence type index
  const evidenceByType = new Map<string, typeof evidenceAtoms>();
  for (const atom of evidenceAtoms) {
    const existing = evidenceByType.get(atom.evidenceType) || [];
    existing.push(atom);
    evidenceByType.set(atom.evidenceType, existing);
  }

  // Build accepted proposal index
  const acceptedBySlot = new Map<string, typeof acceptedProposals[0]>();
  for (const proposal of acceptedProposals) {
    if (proposal.status === "accepted") {
      acceptedBySlot.set(proposal.slotId, proposal);
    }
  }

  const queueItems: QueueSlotItem[] = [];
  let filledSlots = 0;
  const satisfiedObligations = new Set<string>();

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const slotId = slot.slot_id || slot.slotId;
    const slotName = slot.slot_name || slot.title || slotId;
    const mdcgRef = slot.mdcg_reference || null;
    const agentAssignment = slot.agent_assignment || null;
    const requiredTypes: string[] = Array.isArray(slot.evidence_requirements)
      ? slot.evidence_requirements
      : slot.evidence_requirements?.required_types || [];

    // Check evidence availability
    const availableTypes: string[] = [];
    const missingTypes: string[] = [];
    const evidenceCoverage: QueueSlotItem["evidence_requirements"]["evidence_coverage"] = [];

    for (const type of requiredTypes) {
      const atoms = evidenceByType.get(type) || [];
      const inPeriodAtoms = atoms.filter(a => {
        const extractDate = a.extractDate ? new Date(a.extractDate) : null;
        return extractDate && extractDate >= periodStart && extractDate <= periodEnd;
      });

      if (atoms.length > 0) {
        availableTypes.push(type);
      } else {
        missingTypes.push(type);
      }

      evidenceCoverage.push({
        type,
        available: atoms.length > 0,
        inPeriod: inPeriodAtoms.length > 0,
        coverage: atoms.length === 0 ? "none" 
          : inPeriodAtoms.length > 0 ? "full" 
          : "out_of_period",
        atomCount: atoms.length,
        inPeriodCount: inPeriodAtoms.length,
      });
    }

    // Check if slot is filled
    const acceptedProposal = acceptedBySlot.get(slotId);
    const isFilled = !!acceptedProposal;
    if (isFilled) filledSlots++;

    // Determine slot type
    const dataType = slot.data_type || "narrative";
    const slotType = determineSlotType(null, dataType);

    // Get recommended agents with full context
    const recommendedAgents = getRecommendedAgents(
      slotId,
      slotType,
      mdcgRef,
      agentAssignment,
      requiredTypes
    );

    // Build queue item
    const isRequired = typeof slot.required === "boolean" 
      ? slot.required 
      : !String(slot.required || "").startsWith("conditional:");

    const queueItem: QueueSlotItem = {
      queue_rank: i + 1,
      slot_id: slotId,
      slot_path: slot.section_number 
        ? `Section ${slot.section_number}: ${slotName}`
        : slotName,
      slot_type: slotType,
      requiredness: isRequired ? "required" : "conditional",
      mapped_obligations: [], // Will be populated if obligation links exist
      evidence_requirements: {
        required_evidence_types: requiredTypes,
        available_evidence_types: availableTypes,
        missing_evidence_types: missingTypes,
        in_period_evidence_types: availableTypes.filter(t => 
          evidenceCoverage.find(c => c.type === t)?.inPeriod
        ),
        period_check: missingTypes.length === 0 
          ? "pass" 
          : availableTypes.length > 0 
            ? "partial" 
            : requiredTypes.length === 0 
              ? "unknown" 
              : "fail",
        evidence_coverage: evidenceCoverage,
      },
      generation_contract: getGenerationContract(slotType, availableTypes.length > 0),
      dependencies: {
        must_fill_before: slot.dependencies?.must_fill_before || [],
        must_have_evidence_before: missingTypes,
      },
      recommended_agents: recommendedAgents,
      acceptance_criteria: getAcceptanceCriteria(
        slotType,
        [],
        requiredTypes
      ),
    };

    queueItems.push(queueItem);
  }

  // Sort by priority
  queueItems.sort((a, b) => {
    const aMissing = a.evidence_requirements.missing_evidence_types.length;
    const bMissing = b.evidence_requirements.missing_evidence_types.length;
    if (a.requiredness !== b.requiredness) {
      return a.requiredness === "required" ? -1 : 1;
    }
    if (aMissing !== bMissing) return aMissing - bMissing;
    return a.queue_rank - b.queue_rank;
  });

  // Recalculate ranks
  queueItems.forEach((item, idx) => {
    item.queue_rank = idx + 1;
  });

  const requiredSlots = queueItems.filter(q => q.requiredness === "required");

  return {
    psurReference: input.psurReference,
    profileId: input.profileId,
    queue: queueItems,
    coverageSummary: {
      mandatoryObligationsTotal: 0,
      mandatoryObligationsSatisfied: 0,
      mandatoryObligationsRemaining: 0,
      requiredSlotsTotal: requiredSlots.length,
      requiredSlotsFilled: filledSlots,
      requiredSlotsRemaining: requiredSlots.length - filledSlots,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get recommended agents for a specific slot (standalone utility)
 */
export function getAgentsForSlot(
  slotId: string,
  mdcgReference?: string,
  agentAssignment?: string,
  evidenceTypes?: string[]
): string[] {
  const slotType = determineSlotType(null, slotId);
  return getRecommendedAgents(
    slotId,
    slotType,
    mdcgReference || null,
    agentAssignment || null,
    evidenceTypes || []
  );
}

/**
 * Get all available agent class names
 */
export function getAllAgentNames(): {
  narrative: string[];
  table: string[];
  chart: string[];
} {
  return {
    narrative: Array.from(new Set(Object.values(NARRATIVE_AGENT_MAP))),
    table: Array.from(new Set(Object.values(TABLE_AGENT_MAP))),
    chart: Array.from(new Set(Object.values(CHART_AGENT_MAP))),
  };
}
