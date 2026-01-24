import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { slotDefinitions, slotObligationLinks, SlotDefinition as DBSlotDefinition } from "@shared/schema";
import { EvidenceAtomRecord } from "../../services/evidenceStore";
import { 
  loadTemplate, 
  loadFormTemplate,
  isTemplateFormBased,
  getTemplateDefaults,
  getEffectiveSlots,
  getEffectiveMapping,
  type Template,
  type TemplateSlot,
  type FormTemplate
} from "../../templateStore";
import { NarrativeWriterAgent, NarrativeInput } from "../../agents/runtime/narrativeWriterAgent";
import { TraceContext, startTrace, resumeTrace } from "../../services/decisionTraceService";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ProposalStatus = 
  | "READY"          // Evidence available, ready for adjudication
  | "TRACE_GAP"      // Required types but no evidence available
  | "NO_EVIDENCE_REQUIRED"; // Slot has empty required_types (admin/TOC slots)

export interface SlotProposalOutput {
  proposalId: string;
  slotId: string;
  content: string;
  evidenceAtomIds: string[];
  claimedObligationIds: string[];
  methodStatement: string;
  transformations: string[];
  status: ProposalStatus;
  requiredTypes: string[];
}

export interface ProposeContext {
  psurCaseId: number;
  templateId: string;
  evidenceAtoms: EvidenceAtomRecord[];
  log?: (msg: string) => void;
  slotProposals?: SlotProposalOutput[];
  // Extended context for AI agents
  traceCtx?: TraceContext;
  deviceCode?: string;
  periodStart?: string;
  periodEnd?: string;
  enableAIGeneration?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN STEP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Step 4: Propose Slots
 * 
 * DETERMINISTIC BEHAVIOR:
 * 1. Loads template from JSON files (supports both DB slots and template JSON)
 * 2. For each slot:
 *    - Choose evidenceAtomIds by required_types
 *    - If required_types is empty: status = NO_EVIDENCE_REQUIRED, evidenceAtomIds = []
 *    - If required_types non-empty but no atoms: status = TRACE_GAP, evidenceAtomIds = []
 *    - If atoms found: status = READY, evidenceAtomIds populated
 * 3. claimedObligationIds always populated from template mapping
 */
export async function proposeSlotsStep(ctx: ProposeContext): Promise<SlotProposalOutput[]> {
  const { templateId, evidenceAtoms } = ctx;
  
  ctx.log?.(`[Step 4/8] Propose Slots: Starting for template ${templateId}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STRATEGY 0: Check if this is a form-based template (CooperSurgical style)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isTemplateFormBased(templateId)) {
    ctx.log?.(`[Step 4/8] Form-based template detected, using form section proposals`);
    return proposeSlotsFromFormTemplate(ctx);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STRATEGY 1: Try database slot definitions first
  // ═══════════════════════════════════════════════════════════════════════════
  const canonicalSlots = await db
    .select()
    .from(slotDefinitions)
    .where(eq(slotDefinitions.templateId, templateId))
    .orderBy(slotDefinitions.sortOrder);

  if (canonicalSlots.length > 0) {
    ctx.log?.(`[Step 4/8] Using ${canonicalSlots.length} canonical slots from database`);
    return proposeSlotsFromDatabase(ctx, canonicalSlots);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STRATEGY 2: Fall back to template JSON slots
  // ═══════════════════════════════════════════════════════════════════════════
  ctx.log?.(`[Step 4/8] No DB slots found, using template JSON slots`);
  return proposeSlotsFromTemplate(ctx);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE-BASED SLOT PROPOSAL
// ═══════════════════════════════════════════════════════════════════════════════

async function proposeSlotsFromDatabase(
  ctx: ProposeContext,
  canonicalSlots: DBSlotDefinition[]
): Promise<SlotProposalOutput[]> {
  const { templateId, evidenceAtoms } = ctx;
  
  // Load obligation links for this template
  const links = await db
    .select()
    .from(slotObligationLinks)
    .where(eq(slotObligationLinks.templateId, templateId));

  ctx.log?.(`[Step 4/8] Loaded ${links.length} slot↔obligation links from database`);

  const proposals: SlotProposalOutput[] = [];

  for (const slot of canonicalSlots) {
    // Get obligation links for this slot
    const slotLinks = links.filter((l: typeof links[number]) => l.slotId === slot.slotId);
    const claimedObligationIds = slotLinks.map((l: typeof links[number]) => l.obligationId);

    if (claimedObligationIds.length === 0) {
      ctx.log?.(`[Step 4/8] WARNING: Slot ${slot.slotId} has no obligation links`);
      // Don't throw - allow proposal with empty obligations
    }

    // Get required evidence types
    const requiredTypes = (slot.requiredEvidenceTypes as string[]) || [];
    
    // Find eligible evidence atoms
    const eligibleAtoms = evidenceAtoms.filter(a =>
      requiredTypes.includes(a.evidenceType)
    );

    // Determine proposal status
    const proposal = generateProposal(
      slot.slotId,
      slot.title,
      requiredTypes,
      eligibleAtoms,
      claimedObligationIds,
      slot.minAtoms ?? 1
    );

    proposals.push(proposal);
  }

  ctx.slotProposals = proposals;
  
  const readyCount = proposals.filter(p => p.status === "READY").length;
  const gapCount = proposals.filter(p => p.status === "TRACE_GAP").length;
  const noEvidenceCount = proposals.filter(p => p.status === "NO_EVIDENCE_REQUIRED").length;
  
  ctx.log?.(`[Step 4/8] Generated ${proposals.length} proposals: ${readyCount} READY, ${gapCount} TRACE_GAP, ${noEvidenceCount} NO_EVIDENCE_REQUIRED`);

  return proposals;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORM-BASED TEMPLATE SECTION PROPOSAL (CooperSurgical style)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Form-based templates (like FormQAR-054) use sections instead of GRKB slots.
 * Each section maps to specific evidence types based on the section purpose.
 */
const FORM_SECTION_EVIDENCE_MAP: Record<string, string[]> = {
  "A_executive_summary": ["benefit_risk_assessment", "previous_psur_extract"],
  "B_scope_and_device_description": ["device_registry_record", "regulatory_certificate_record", "manufacturer_profile", "ifu_extract"],
  "C_volume_of_sales_and_population_exposure": ["sales_volume", "sales_summary", "sales_by_region", "distribution_summary", "usage_estimate"],
  "D_information_on_serious_incidents": ["serious_incident_record", "serious_incident_summary", "serious_incident_records_imdrf", "vigilance_report"],
  "E_customer_feedback": ["customer_feedback_summary", "trend_analysis"],
  "F_product_complaint_types_counts_and_rates": ["complaint_record", "complaint_summary", "complaints_by_region", "signal_log"],
  "G_information_from_trend_reporting": ["trend_analysis", "signal_log"],
  "H_information_from_fsca": ["fsca_record", "fsca_summary", "recall_record"],
  "I_corrective_and_preventive_actions": ["capa_record", "capa_summary", "ncr_record"],
  "J_scientific_literature_review": ["literature_review_summary", "literature_search_strategy", "literature_result"],
  "K_review_of_external_databases_and_registries": ["external_db_summary", "external_db_query_log"],
  "L_pmcf": ["pmcf_summary", "pmcf_result", "pmcf_activity_record", "pmcf_report_extract"],
  "M_findings_and_conclusions": ["benefit_risk_assessment", "clinical_evaluation_extract", "cer_extract", "risk_assessment"],
};

const FORM_SECTION_TITLES: Record<string, string> = {
  "A_executive_summary": "A - Executive Summary",
  "B_scope_and_device_description": "B - Scope and Device Description",
  "C_volume_of_sales_and_population_exposure": "C - Volume of Sales and Population Exposure",
  "D_information_on_serious_incidents": "D - Information on Serious Incidents",
  "E_customer_feedback": "E - Customer Feedback",
  "F_product_complaint_types_counts_and_rates": "F - Product Complaint Types, Counts and Rates",
  "G_information_from_trend_reporting": "G - Information from Trend Reporting",
  "H_information_from_fsca": "H - Information from FSCA",
  "I_corrective_and_preventive_actions": "I - Corrective and Preventive Actions",
  "J_scientific_literature_review": "J - Scientific Literature Review",
  "K_review_of_external_databases_and_registries": "K - Review of External Databases and Registries",
  "L_pmcf": "L - Post-Market Clinical Follow-up (PMCF)",
  "M_findings_and_conclusions": "M - Findings and Conclusions",
};

async function proposeSlotsFromFormTemplate(ctx: ProposeContext): Promise<SlotProposalOutput[]> {
  const { templateId, evidenceAtoms } = ctx;
  
  // Load form template
  let formTemplate: FormTemplate;
  try {
    formTemplate = loadFormTemplate(templateId);
  } catch (e: any) {
    throw new Error(`Failed to load form template ${templateId}: ${e.message}`);
  }

  const sections = formTemplate.sections;
  const sectionKeys = Object.keys(sections);
  
  ctx.log?.(`[Step 4/8] Form template ${templateId} has ${sectionKeys.length} sections`);

  const proposals: SlotProposalOutput[] = [];

  for (const sectionKey of sectionKeys) {
    // Get required evidence types for this section
    const requiredTypes = FORM_SECTION_EVIDENCE_MAP[sectionKey] || [];
    const title = FORM_SECTION_TITLES[sectionKey] || sectionKey;

    // Find eligible evidence atoms
    const eligibleAtoms = evidenceAtoms.filter(a =>
      requiredTypes.includes(a.evidenceType)
    );

    // Generate proposal
    const proposal = generateProposal(
      sectionKey,      // Use section key as slot ID
      title,
      requiredTypes,
      eligibleAtoms,
      [],              // Form-based templates don't use GRKB obligations
      1                // Min atoms = 1
    );

    proposals.push(proposal);
  }

  ctx.slotProposals = proposals;
  
  const readyCount = proposals.filter(p => p.status === "READY").length;
  const gapCount = proposals.filter(p => p.status === "TRACE_GAP").length;
  const noEvidenceCount = proposals.filter(p => p.status === "NO_EVIDENCE_REQUIRED").length;
  
  ctx.log?.(`[Step 4/8] Generated ${proposals.length} form section proposals: ${readyCount} READY, ${gapCount} TRACE_GAP, ${noEvidenceCount} NO_EVIDENCE_REQUIRED`);

  return proposals;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE JSON-BASED SLOT PROPOSAL
// ═══════════════════════════════════════════════════════════════════════════════

async function proposeSlotsFromTemplate(ctx: ProposeContext): Promise<SlotProposalOutput[]> {
  const { templateId, evidenceAtoms } = ctx;
  
  // Load template from JSON
  let template: Template;
  try {
    template = loadTemplate(templateId);
  } catch (e: any) {
    throw new Error(`Failed to load template ${templateId}: ${e.message}`);
  }

  // Get effective slots and mapping
  const effectiveSlots = getEffectiveSlots(template);
  const effectiveMapping = getEffectiveMapping(template);
  const defaults = getTemplateDefaults(template);

  ctx.log?.(`[Step 4/8] Template ${templateId} has ${effectiveSlots.length} slots`);

  const proposals: SlotProposalOutput[] = [];

  // Ensure we have trace context for AI agents
  let traceCtx = ctx.traceCtx;
  if (!traceCtx && ctx.enableAIGeneration) {
    traceCtx = await resumeTrace(ctx.psurCaseId) || await startTrace(ctx.psurCaseId, templateId);
  }

  for (const slot of effectiveSlots) {
    const slotId = slot.slot_id;
    const title = slot.title;
    const requiredTypes = slot.evidence_requirements?.required_types || [];
    const claimedObligationIds = effectiveMapping[slotId] || [];
    const slotKind = slot.slot_kind;

    // Find eligible evidence atoms
    const eligibleAtoms = evidenceAtoms.filter(a =>
      requiredTypes.includes(a.evidenceType)
    );

    // Generate base proposal with appropriate status
    const proposal = generateProposal(
      slotId,
      title,
      requiredTypes,
      eligibleAtoms,
      claimedObligationIds,
      defaults.min_evidence_atoms
    );

    // For NARRATIVE slots with evidence, use AI to generate content
    if (slotKind === "NARRATIVE" && proposal.status === "READY" && ctx.enableAIGeneration && traceCtx) {
      ctx.log?.(`[Step 4/8] Generating AI narrative for slot: ${slotId}`);
      
      try {
        const narrativeContent = await generateNarrativeContent(
          slot,
          eligibleAtoms,
          {
            psurCaseId: ctx.psurCaseId,
            traceCtx,
            templateId,
            deviceCode: ctx.deviceCode || "",
            periodStart: ctx.periodStart || "",
            periodEnd: ctx.periodEnd || "",
          }
        );
        
        proposal.content = narrativeContent.content;
        proposal.evidenceAtomIds = narrativeContent.citedAtoms;
        proposal.methodStatement = `AI-Generated: ${narrativeContent.reasoning}. ` +
          `Word count: ${narrativeContent.wordCount}. ` +
          `Confidence: ${(narrativeContent.confidence * 100).toFixed(0)}%. ` +
          `Cited ${narrativeContent.citedAtoms.length} atoms. ` +
          `Obligations: [${claimedObligationIds.join(", ")}].`;
        proposal.transformations = ["ai_narrative_generation", "cite_evidence"];
        
        ctx.log?.(`[Step 4/8] Generated ${narrativeContent.wordCount} words for ${slotId}`);
        
      } catch (error: any) {
        ctx.log?.(`[Step 4/8] AI generation failed for ${slotId}: ${error.message}`);
        // Keep the deterministic proposal as fallback
        proposal.methodStatement += ` [AI generation attempted but failed: ${error.message}]`;
      }
    }

    proposals.push(proposal);
  }

  ctx.slotProposals = proposals;
  
  const readyCount = proposals.filter(p => p.status === "READY").length;
  const gapCount = proposals.filter(p => p.status === "TRACE_GAP").length;
  const noEvidenceCount = proposals.filter(p => p.status === "NO_EVIDENCE_REQUIRED").length;
  const aiGeneratedCount = proposals.filter(p => p.transformations.includes("ai_narrative_generation")).length;
  
  ctx.log?.(`[Step 4/8] Generated ${proposals.length} proposals: ${readyCount} READY, ${gapCount} TRACE_GAP, ${noEvidenceCount} NO_EVIDENCE_REQUIRED, ${aiGeneratedCount} AI-generated`);

  return proposals;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI NARRATIVE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

interface NarrativeResult {
  content: string;
  citedAtoms: string[];
  wordCount: number;
  confidence: number;
  reasoning: string;
}

async function generateNarrativeContent(
  slot: TemplateSlot,
  atoms: EvidenceAtomRecord[],
  context: {
    psurCaseId: number;
    traceCtx: TraceContext;
    templateId: string;
    deviceCode: string;
    periodStart: string;
    periodEnd: string;
  }
): Promise<NarrativeResult> {
  const agent = new NarrativeWriterAgent();
  
  const input: NarrativeInput = {
    slot: {
      slotId: slot.slot_id,
      title: slot.title,
      sectionPath: slot.section_path,
      requirements: slot.evidence_requirements?.required_types?.join(", "),
      guidance: slot.output_requirements?.render_as,
    },
    evidenceAtoms: atoms.map(a => ({
      atomId: a.atomId,
      evidenceType: a.evidenceType,
      normalizedData: a.normalizedData as Record<string, unknown>,
    })),
    context: {
      deviceCode: context.deviceCode,
      periodStart: context.periodStart,
      periodEnd: context.periodEnd,
      templateId: context.templateId,
    },
  };
  
  const agentContext = {
    psurCaseId: context.psurCaseId,
    traceCtx: context.traceCtx,
    templateId: context.templateId,
    slotId: slot.slot_id,
    deviceCode: context.deviceCode,
    periodStart: context.periodStart,
    periodEnd: context.periodEnd,
  };
  
  const result = await agent.run(input, agentContext);
  
  if (!result.success || !result.data) {
    throw new Error(result.error || "Narrative generation failed");
  }
  
  return {
    content: result.data.content,
    citedAtoms: result.data.citedAtoms,
    wordCount: result.data.wordCount,
    confidence: result.data.confidence,
    reasoning: result.data.reasoning,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROPOSAL GENERATOR
// ═══════════════════════════════════════════════════════════════════════════════

function generateProposal(
  slotId: string,
  title: string,
  requiredTypes: string[],
  eligibleAtoms: EvidenceAtomRecord[],
  claimedObligationIds: string[],
  minAtoms: number
): SlotProposalOutput {
  const timestamp = Date.now();
  
  // RULE 1: If required_types is empty, this is an admin/TOC slot
  if (requiredTypes.length === 0) {
    return {
      proposalId: `${slotId}:${timestamp}`,
      slotId,
      content: "",
      evidenceAtomIds: [], // Empty is VALID for admin slots
      claimedObligationIds,
      methodStatement: `Deterministic: Administrative slot "${title}" requires no evidence atoms. Obligations: [${claimedObligationIds.join(", ")}].`,
      transformations: ["passthrough"],
      status: "NO_EVIDENCE_REQUIRED",
      requiredTypes,
    };
  }

  // RULE 2: If required_types non-empty but no atoms found, this is a TRACE_GAP
  if (eligibleAtoms.length === 0) {
    return {
      proposalId: `${slotId}:${timestamp}`,
      slotId,
      content: "",
      evidenceAtomIds: [], // Empty but status is TRACE_GAP
      claimedObligationIds,
      methodStatement: `TRACE_GAP: Slot "${title}" requires evidence types [${requiredTypes.join(", ")}] but none found. ` +
        `Upload evidence of type: ${requiredTypes.join(", ")} before proceeding. ` +
        `Obligations claimed: [${claimedObligationIds.join(", ")}].`,
      transformations: [],
      status: "TRACE_GAP",
      requiredTypes,
    };
  }

  // RULE 3: Check for negative evidence atoms
  const negativeAtoms = eligibleAtoms.filter(a => 
    a.normalizedData?.isNegativeEvidence === true
  );
  const positiveAtoms = eligibleAtoms.filter(a => 
    !a.normalizedData?.isNegativeEvidence
  );
  
  // RULE 3a: Only negative evidence found - valid "none reported" scenario
  if (negativeAtoms.length > 0 && positiveAtoms.length === 0) {
    const evidenceAtomIds = negativeAtoms.map(a => a.atomId);
    return {
      proposalId: `${slotId}:${timestamp}`,
      slotId,
      content: "",
      evidenceAtomIds,
      claimedObligationIds,
      methodStatement: `Deterministic: Slot "${title}" - NEGATIVE EVIDENCE confirmed. ` +
        `Zero ${requiredTypes.join("/")} events reported for period. ` +
        `Confirmed via negative evidence atoms: [${evidenceAtomIds.join(", ")}]. ` +
        `This is a valid "None reported" scenario with full traceability. ` +
        `Obligations: [${claimedObligationIds.join(", ")}].`,
      transformations: ["cite_negative_evidence"],
      status: "READY",
      requiredTypes,
    };
  }

  // RULE 3b: Positive evidence atoms available - select up to minAtoms
  const selectedAtoms = positiveAtoms.slice(0, Math.max(minAtoms, 1));
  const evidenceAtomIds = selectedAtoms.map(a => a.atomId);

  return {
    proposalId: `${slotId}:${timestamp}`,
    slotId,
    content: "",
    evidenceAtomIds,
    claimedObligationIds,
    methodStatement: `Deterministic: Slot "${title}" populated with ${evidenceAtomIds.length} evidence atom(s). ` +
      `Evidence types: [${requiredTypes.join(", ")}]. ` +
      `Atoms: [${evidenceAtomIds.join(", ")}]. ` +
      `Obligations: [${claimedObligationIds.join(", ")}].`,
    transformations: ["summarize", "cite_evidence"],
    status: "READY",
    requiredTypes,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Helper: Pick evidence atoms for a slot based on required types
 */
export function pickEvidenceForSlot(
  evidenceAtoms: EvidenceAtomRecord[],
  requiredTypes?: string[]
): { atomIds: string[]; methodStatement: string; status: ProposalStatus } {
  // No required types = admin slot
  if (!requiredTypes || requiredTypes.length === 0) {
    return {
      atomIds: [],
      methodStatement: "Deterministic: Administrative slot, no evidence required.",
      status: "NO_EVIDENCE_REQUIRED",
    };
  }

  const filtered = evidenceAtoms.filter(a => requiredTypes.includes(a.evidenceType));

  // No matching atoms = trace gap
  if (filtered.length === 0) {
    return {
      atomIds: [],
      methodStatement: `TRACE_GAP: No evidence atoms found for types [${requiredTypes.join(", ")}]. Upload required evidence.`,
      status: "TRACE_GAP",
    };
  }

  // Atoms found = ready
  const atomIds = filtered.map(a => a.atomId);
  return {
    atomIds,
    methodStatement: `Deterministic: ${atomIds.length} evidence atom(s) matched for types [${requiredTypes.join(", ")}].`,
    status: "READY",
  };
}

/**
 * Check if all proposals are ready for adjudication
 */
export function areAllProposalsReady(proposals: SlotProposalOutput[]): boolean {
  return proposals.every(p => p.status === "READY" || p.status === "NO_EVIDENCE_REQUIRED");
}

/**
 * Get trace gaps from proposals
 */
export function getTraceGaps(proposals: SlotProposalOutput[]): SlotProposalOutput[] {
  return proposals.filter(p => p.status === "TRACE_GAP");
}
