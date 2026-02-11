/**
 * TEMPLATE MANAGEMENT SERVICE
 * 
 * State-of-the-art template management system that:
 * 1. Parses custom DOCX/JSON templates
 * 2. Extracts slots from template structure
 * 3. Grounds slots to GRKB obligations
 * 4. Validates MDCG 2022-21 and EU MDR/UK MDR compliance
 * 5. Maps slots to regulatory requirements
 * 6. Updates agent system instructions dynamically
 * 7. Maintains full audit trail with tracing
 */

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { db } from "../../db";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  grkbObligations,
  systemInstructions,
  instructionVersions,
  decisionTraceEntries,
  psurSections,
  psurSlotObligations,
  slotDefinitions,
  slotObligationLinks,
  templates,
  type GrkbObligation,
  type InsertDecisionTraceEntry,
} from "@shared/schema";
import { v4 as uuidv4 } from "uuid";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SlotMappingGuide {
  metadata: {
    template_name: string;
    template_version: string;
    mapping_version: string;
    created_date: string;
    description: string;
    form_id?: string;
    revision?: string;
    compliance_frameworks: string[];
    multi_product_support?: {
      max_products: number;
      product_naming_convention: string;
    };
  };
  slot_categories: SlotCategory[];
  global_formatting_rules?: GlobalFormattingRules;
}

export interface SlotCategory {
  category_id: string;
  category_name: string;
  section_reference?: string;
  slots: SlotDefinitionInput[];
}

export interface SlotDefinitionInput {
  slot_id: string;
  slot_name: string;
  data_type: string;
  required: boolean;
  description?: string;
  formatting?: SlotFormatting;
  source_mapping?: SourceMapping;
  regulatory_reference?: string;
  evidence_requirements?: string[];
  children?: SlotDefinitionInput[];
  per_product?: boolean;
  product_index_range?: number[];
}

export interface SlotFormatting {
  font_family?: string;
  font_size?: number;
  bold?: boolean;
  italic?: boolean;
  alignment?: string;
  number_format?: string;
}

export interface SourceMapping {
  data_source: string;
  field_name?: string;
  calculation_type?: string;
  lookup_key?: string;
  aggregation?: string;
}

export interface GlobalFormattingRules {
  page_setup?: {
    size: string;
    margins: { top: number; bottom: number; left: number; right: number };
    orientation: string;
  };
  typography?: Record<string, TypographyRule>;
  spacing?: SpacingRules;
}

export interface TypographyRule {
  font: string;
  size: number;
  bold?: boolean;
  color?: string;
  space_before?: number;
  space_after?: number;
}

export interface SpacingRules {
  paragraph?: { before: number; after: number; line_spacing: number };
  table?: { cell_padding: { top: number; bottom: number; left: number; right: number } };
}

export interface FormattingGuide {
  metadata: {
    document_title: string;
    version: string;
    created_date: string;
    description: string;
    target_format: string;
    compliance_note?: string;
  };
  page_setup: {
    size: string;
    orientation: string;
    margins: { top: string; bottom: string; left: string; right: string };
    header_distance?: string;
    footer_distance?: string;
  };
  typography: Record<string, TypographySpec>;
  spacing_rules: SpacingSpec;
  table_formatting?: TableFormattingSpec;
  checkbox_formatting?: CheckboxFormattingSpec;
  implementation_notes?: ImplementationNotes;
}

export interface TypographySpec {
  font_name: string;
  font_size: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  all_caps?: boolean;
  color?: string;
  space_before?: number;
  space_after?: number;
  line_spacing?: number;
}

export interface SpacingSpec {
  paragraph_spacing: { before: number; after: number };
  line_spacing: { type: string; value: number };
  first_line_indent?: number;
  indentation?: { normal: number; bullet_level_1: number; bullet_level_2: number };
}

export interface TableFormattingSpec {
  header_row: { background: string; font_bold: boolean; alignment: string; text_color?: string };
  data_rows: { alternating_colors?: { odd: string; even: string }; alignment: string };
  borders: { style: string; width: string; color: string };
  cell_padding: { top: string; bottom: string; left: string; right: string };
  column_widths?: Record<string, string>;
}

export interface CheckboxFormattingSpec {
  checked_symbol: string;
  unchecked_symbol: string;
  font_name: string;
  font_size: number;
}

export interface ImplementationNotes {
  python_docx?: Record<string, string>;
  critical_requirements?: string[];
}

export interface GRKBGroundingResult {
  success: boolean;
  templateId: string;
  jurisdictions: string[];
  totalSlots: number;
  groundedSlots: number;
  ungroundedSlots: string[];
  obligationMapping: Record<string, string[]>;
  complianceGaps: ComplianceGap[];
  mdcgCompliance: MDCGComplianceResult;
  traceId: string;
}

export interface ComplianceGap {
  slotId: string;
  slotName: string;
  missingRequirements: string[];
  severity: "critical" | "high" | "medium" | "low";
  recommendation: string;
}

export interface MDCGComplianceResult {
  annex1Coverage: number;
  annex2Coverage: number;
  annex3Coverage: number;
  annex4Compliant: boolean;
  missingMandatorySections: string[];
  missingMandatoryTables: string[];
  deviceRequirements?: AnnexIVRequirements;
  passed: boolean;
}

export interface AgentInstructionUpdate {
  agentKey: string;
  category: string;
  previousTemplate: string;
  newTemplate: string;
  templateVariables: string[];
  reason: string;
  version: number;
}

export interface TemplateManagementResult {
  success: boolean;
  templateId: string;
  templateType: "slot-based" | "form-based";
  savedTo: string;
  slotCount: number;
  groundingResult: GRKBGroundingResult;
  agentUpdates: AgentInstructionUpdate[];
  complianceAudit?: ComplianceAuditResult;
  traceId: string;
  errors: string[];
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA TRANSFORMATION: Input → Workflow Format
// 
// SOTA approach: Transform at ingestion, store in canonical format.
// The database always stores workflow-compatible templates.
// ═══════════════════════════════════════════════════════════════════════════════

interface WorkflowSlotDefinition {
  slot_id: string;
  title: string;
  section_path: string;
  slot_kind: "ADMIN" | "NARRATIVE" | "TABLE" | "METRIC";
  required: boolean;
  evidence_requirements: {
    required_types: string[];
    min_atoms: number;
    allow_empty_with_justification: boolean;
  };
  output_requirements: {
    renderer: "md" | "docx";
    render_as?: "cover_page" | "table_of_contents" | "narrative" | "table";
  };
}

interface WorkflowTemplate {
  template_id: string;
  name: string;
  version: string;
  jurisdiction_scope: ("EU_MDR" | "UK_MDR")[];
  normative_basis?: string[];
  mandatory_obligation_ids: string[];
  defaults: {
    require_traceability: boolean;
    require_method_statement: boolean;
    require_claimed_obligations: boolean;
    min_method_chars: number;
    min_evidence_atoms: number;
  };
  slots: WorkflowSlotDefinition[];
  mapping: Record<string, string[]>;
}

/**
 * Transform input template to workflow-compatible schema format.
 */
function transformTemplateToWorkflowSchema(
  templateJson: any,
  slots: SlotDefinitionInput[],
  obligationMapping: Record<string, string[]>
): WorkflowTemplate {
  // Filter jurisdiction to only valid values
  const inputJurisdictions = templateJson.jurisdiction_scope || [];
  const validJurisdictions = inputJurisdictions
    .filter((j: string): j is "EU_MDR" | "UK_MDR" => j === "EU_MDR" || j === "UK_MDR");
  
  // Collect all obligation IDs from mapping
  const allObligationIds = new Set<string>();
  for (const oblIds of Object.values(obligationMapping)) {
    for (const id of oblIds) {
      allObligationIds.add(id);
    }
  }
  
  // Transform slots to workflow format
  const transformedSlots: WorkflowSlotDefinition[] = slots.map((slot, idx) => ({
    slot_id: slot.slot_id,
    title: slot.slot_name || slot.slot_id,
    section_path: deriveSectionPathFromSlot(slot, idx),
    slot_kind: mapDataTypeToSlotKindTMS(slot.data_type),
    required: slot.required !== false,
    evidence_requirements: {
      required_types: slot.evidence_requirements || [],
      min_atoms: 0,
      allow_empty_with_justification: false,
    },
    output_requirements: {
      renderer: "md" as const,
      render_as: mapDataTypeToRenderAsTMS(slot.data_type),
    },
  }));
  
  return {
    template_id: templateJson.template_id,
    name: templateJson.name || templateJson.template_id,
    version: templateJson.version || "1.0",
    jurisdiction_scope: validJurisdictions.length > 0 ? validJurisdictions : ["EU_MDR"],
    mandatory_obligation_ids: Array.from(allObligationIds),
    defaults: {
      require_traceability: true,
      require_method_statement: true,
      require_claimed_obligations: true,
      min_method_chars: 10,
      min_evidence_atoms: 0,
    },
    slots: transformedSlots,
    mapping: obligationMapping,
  };
}

function mapDataTypeToSlotKindTMS(dataType: string): "ADMIN" | "NARRATIVE" | "TABLE" | "METRIC" {
  const type = (dataType || "").toLowerCase();
  if (type === "table" || type.includes("table")) return "TABLE";
  if (type === "metric" || type === "number" || type === "numeric") return "METRIC";
  if (type === "admin" || type === "toc" || type === "auto_generated" || type.includes("cover")) return "ADMIN";
  return "NARRATIVE";
}

function mapDataTypeToRenderAsTMS(dataType: string): "cover_page" | "table_of_contents" | "narrative" | "table" | undefined {
  const type = (dataType || "").toLowerCase();
  if (type === "table" || type.includes("table")) return "table";
  if (type.includes("cover")) return "cover_page";
  if (type === "toc" || type.includes("table_of_contents") || type === "auto_generated") return "table_of_contents";
  return "narrative";
}

function deriveSectionPathFromSlot(slot: SlotDefinitionInput, idx: number): string {
  // Use existing section info if available
  const slotAny = slot as any;
  if (slotAny.section_path) return slotAny.section_path;
  if (slotAny.section_number) return `Section ${slotAny.section_number}`;
  
  // Derive from slot_id
  const id = slot.slot_id.toLowerCase();
  const sectionPatterns: Record<string, string> = {
    "toc": "Table of Contents", "cover": "Cover Page",
    "executive": "A > Executive Summary", "device": "B > Device Description",
    "sales": "C > Sales and Distribution", "serious": "D > Serious Incidents",
    "incident": "D > Incidents", "feedback": "E > Customer Feedback",
    "complaint": "F > Complaints", "trend": "G > Trend Analysis",
    "fsca": "H > Field Safety Corrective Actions", "capa": "I > CAPA",
    "literature": "J > Scientific Literature", "database": "K > External Databases",
    "pmcf": "L > Post-Market Clinical Follow-Up", "conclusion": "M > Conclusions",
    "benefit": "M > Benefit-Risk",
  };
  
  for (const [pattern, sectionPath] of Object.entries(sectionPatterns)) {
    if (id.includes(pattern)) return sectionPath;
  }
  
  return slot.slot_name || `Section ${idx + 1}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY GRKB GROUNDING ENGINE (DEPRECATED)
// Use grkbGroundingService.ts for SOTA semantic matching
// This class is kept for backward compatibility only
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use createSOTAGroundingEngine from grkbGroundingService.ts instead.
 * This legacy engine uses keyword-based matching which is less accurate than
 * the SOTA semantic embedding approach.
 */
export class GRKBGroundingEngine {
  private traceId: string;
  private sequenceNum: number = 0;

  constructor(traceId?: string) {
    this.traceId = traceId || uuidv4();
  }

  /**
   * Ground template slots to GRKB obligations
   */
  async groundTemplate(
    templateId: string,
    slots: SlotDefinitionInput[],
    jurisdictions: string[] = ["EU_MDR", "UK_MDR"]
  ): Promise<GRKBGroundingResult> {
    console.log(`[GRKBGroundingEngine] Grounding template ${templateId} with ${slots.length} slots`);

    // Fetch all relevant GRKB obligations
    const obligations = await db
      .select()
      .from(grkbObligations)
      .where(
        and(
          inArray(grkbObligations.jurisdiction, jurisdictions),
          eq(grkbObligations.artifactType, "PSUR")
        )
      );

    console.log(`[GRKBGroundingEngine] Found ${obligations.length} GRKB obligations`);

    const obligationMapping: Record<string, string[]> = {};
    const ungroundedSlots: string[] = [];
    const complianceGaps: ComplianceGap[] = [];
    let groundedCount = 0;

    // Process each slot
    for (const slot of slots) {
      const matchedObligations = this.findMatchingObligations(slot, obligations);
      
      if (matchedObligations.length > 0) {
        obligationMapping[slot.slot_id] = matchedObligations.map(o => o.obligationId);
        groundedCount++;

        // Trace the grounding
        await this.trace({
          eventType: "OBLIGATION_SATISFIED",
          actor: "GRKBGroundingEngine",
          entityType: "slot",
          entityId: slot.slot_id,
          decision: "GROUNDED",
          humanSummary: `Slot '${slot.slot_name}' grounded to ${matchedObligations.length} GRKB obligations`,
          regulatoryContext: {
            obligationId: matchedObligations[0].obligationId,
            obligationText: matchedObligations[0].text,
            sourceCitation: matchedObligations[0].sourceCitation || "",
            jurisdictions,
            mandatory: matchedObligations[0].mandatory,
          },
          outputData: {
            slotId: slot.slot_id,
            obligationIds: matchedObligations.map(o => o.obligationId),
          },
          templateId,
        });
      } else {
        ungroundedSlots.push(slot.slot_id);
        complianceGaps.push({
          slotId: slot.slot_id,
          slotName: slot.slot_name,
          missingRequirements: ["No matching GRKB obligation found"],
          severity: slot.required ? "high" : "medium",
          recommendation: `Review slot definition and add corresponding GRKB obligation for ${slot.slot_name}`,
        });
      }

      // Process children recursively
      if (slot.children) {
        for (const child of slot.children) {
          const childResult = await this.groundSlot(child, templateId, obligations, jurisdictions);
          if (childResult.obligationIds.length > 0) {
            obligationMapping[child.slot_id] = childResult.obligationIds;
            groundedCount++;
          } else {
            ungroundedSlots.push(child.slot_id);
          }
        }
      }
    }

    // Check MDCG 2022-21 compliance
    const mdcgCompliance = await this.checkMDCGCompliance(slots, obligationMapping, jurisdictions);

    const result: GRKBGroundingResult = {
      success: ungroundedSlots.length === 0 && mdcgCompliance.passed,
      templateId,
      jurisdictions,
      totalSlots: this.countSlots(slots),
      groundedSlots: groundedCount,
      ungroundedSlots,
      obligationMapping,
      complianceGaps,
      mdcgCompliance,
      traceId: this.traceId,
    };

    // Final trace
    await this.trace({
      eventType: "TEMPLATE_QUALIFIED",
      actor: "GRKBGroundingEngine",
      entityType: "template",
      entityId: templateId,
      decision: result.success ? "PASS" : "FAIL",
      humanSummary: `Template grounding ${result.success ? "passed" : "failed"}: ${groundedCount}/${this.countSlots(slots)} slots grounded`,
      outputData: result,
      templateId,
    });

    return result;
  }

  private async groundSlot(
    slot: SlotDefinitionInput,
    templateId: string,
    obligations: GrkbObligation[],
    jurisdictions: string[]
  ): Promise<{ obligationIds: string[] }> {
    const matched = this.findMatchingObligations(slot, obligations);
    return { obligationIds: matched.map(o => o.obligationId) };
  }

  /**
   * Find GRKB obligations that match a slot based on:
   * - Evidence type requirements
   * - Section references
   * - Keyword matching
   * - Regulatory references
   */
  private findMatchingObligations(
    slot: SlotDefinitionInput,
    obligations: GrkbObligation[]
  ): GrkbObligation[] {
    const matched: GrkbObligation[] = [];

    for (const obligation of obligations) {
      let score = 0;

      // Match by evidence type requirements
      if (slot.evidence_requirements && obligation.requiredEvidenceTypes) {
        const slotTypes = new Set(slot.evidence_requirements);
        const oblTypes = obligation.requiredEvidenceTypes as string[];
        const overlap = oblTypes.filter(t => slotTypes.has(t));
        if (overlap.length > 0) {
          score += overlap.length * 10;
        }
      }

      // Match by regulatory reference
      if (slot.regulatory_reference && obligation.sourceCitation) {
        if (
          obligation.sourceCitation.toLowerCase().includes(slot.regulatory_reference.toLowerCase()) ||
          slot.regulatory_reference.toLowerCase().includes(obligation.sourceCitation.toLowerCase())
        ) {
          score += 15;
        }
      }

      // Match by keyword in slot name/description
      const slotText = `${slot.slot_name} ${slot.description || ""}`.toLowerCase();
      const oblText = `${obligation.title} ${obligation.text}`.toLowerCase();

      // Key PSUR terms to match
      const keyTerms = [
        "complaint", "incident", "safety", "sales", "distribution", "trend",
        "capa", "fsca", "literature", "clinical", "pmcf", "benefit", "risk",
        "conclusion", "summary", "device", "manufacturer", "period",
      ];

      for (const term of keyTerms) {
        if (slotText.includes(term) && oblText.includes(term)) {
          score += 5;
        }
      }

      // Section matching (e.g., "Section D" → incidents)
      const sectionMatch = this.matchSection(slot, obligation);
      if (sectionMatch) {
        score += 20;
      }

      if (score >= 10) {
        matched.push(obligation);
      }
    }

    // Sort by relevance and return top matches
    return matched.slice(0, 5);
  }

  private matchSection(slot: SlotDefinitionInput, obligation: GrkbObligation): boolean {
    // Map section letters to content types
    const sectionMap: Record<string, string[]> = {
      "A": ["device", "manufacturer", "scope", "identification"],
      "B": ["previous", "psur", "history"],
      "C": ["sales", "distribution", "volume", "exposure"],
      "D": ["incident", "serious", "vigilance"],
      "E": ["non-serious", "expected"],
      "F": ["complaint", "feedback"],
      "G": ["trend", "analysis", "signal"],
      "H": ["fsca", "corrective", "field"],
      "I": ["capa", "preventive"],
      "J": ["literature", "review", "publication"],
      "K": ["database", "registry", "external"],
      "L": ["pmcf", "clinical", "follow-up"],
      "M": ["benefit", "risk", "conclusion"],
    };

    const slotLower = slot.slot_id.toLowerCase();
    const oblLower = obligation.text.toLowerCase();

    for (const [section, keywords] of Object.entries(sectionMap)) {
      const hasSlotKeyword = keywords.some(k => slotLower.includes(k));
      const hasOblKeyword = keywords.some(k => oblLower.includes(k));
      if (hasSlotKeyword && hasOblKeyword) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check compliance with MDCG 2022-21 structure
   */
  private async checkMDCGCompliance(
    slots: SlotDefinitionInput[],
    obligationMapping: Record<string, string[]>,
    jurisdictions: string[]
  ): Promise<MDCGComplianceResult> {
    // Required MDCG 2022-21 sections
    const mandatorySections = [
      { section: "A", name: "Device Identification" },
      { section: "B", name: "Previous PSUR Reference" },
      { section: "C", name: "Sales/Distribution Data" },
      { section: "D", name: "Serious Incidents" },
      { section: "M", name: "Conclusions" },
    ];

    const slotIds = new Set(slots.map(s => s.slot_id.toLowerCase()));
    const missingMandatory: string[] = [];

    for (const section of mandatorySections) {
      const hasSection = Array.from(slotIds).some(
        id => id.includes(section.section.toLowerCase()) || id.includes(section.name.toLowerCase().replace(/\s+/g, "_"))
      );
      if (!hasSection) {
        missingMandatory.push(`Section ${section.section}: ${section.name}`);
      }
    }

    // Calculate Annex coverage
    const annex1Slots = slots.filter(s => 
      s.regulatory_reference?.includes("Annex I") || s.slot_id.includes("annex_i")
    ).length;
    const annex2Slots = slots.filter(s => 
      s.regulatory_reference?.includes("Annex II") || s.slot_id.includes("annex_ii")
    ).length;
    const annex3Slots = slots.filter(s => 
      s.regulatory_reference?.includes("Annex III") || s.slot_id.includes("annex_iii")
    ).length;

    const totalSlots = this.countSlots(slots);

    return {
      annex1Coverage: totalSlots > 0 ? Math.min(100, (annex1Slots / totalSlots) * 100) : 0,
      annex2Coverage: totalSlots > 0 ? Math.min(100, (annex2Slots / totalSlots) * 100) : 0,
      annex3Coverage: totalSlots > 0 ? Math.min(100, (annex3Slots / totalSlots) * 100) : 0,
      annex4Compliant: true, // Legacy engine doesn't do full Annex IV validation
      missingMandatorySections: missingMandatory,
      missingMandatoryTables: [],
      passed: missingMandatory.length === 0,
    };
  }

  private countSlots(slots: SlotDefinitionInput[]): number {
    let count = slots.length;
    for (const slot of slots) {
      if (slot.children) {
        count += this.countSlots(slot.children);
      }
    }
    return count;
  }

  private async trace(data: Partial<InsertDecisionTraceEntry>): Promise<void> {
    const hash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");

    await db.insert(decisionTraceEntries).values({
      traceId: this.traceId,
      sequenceNum: ++this.sequenceNum,
      eventTimestamp: new Date(),
      contentHash: hash,
      jurisdictions: data.jurisdictions || ["EU_MDR"],
      ...data,
    } as any);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT INSTRUCTION UPDATER
// ═══════════════════════════════════════════════════════════════════════════════

export class AgentInstructionUpdater {
  private traceId: string;

  constructor(traceId: string) {
    this.traceId = traceId;
  }

  /**
   * Update agent system instructions based on template configuration
   */
  async updateInstructions(
    templateId: string,
    slots: SlotDefinitionInput[],
    formattingGuide?: FormattingGuide,
    slotMappingGuide?: SlotMappingGuide
  ): Promise<AgentInstructionUpdate[]> {
    const updates: AgentInstructionUpdate[] = [];

    // Generate template-specific instructions
    const templateInstructions = this.generateTemplateInstructions(templateId, slots, slotMappingGuide);
    const formattingInstructions = formattingGuide 
      ? this.generateFormattingInstructions(formattingGuide)
      : null;

    // Define which agents need updates
    const agentConfigs = [
      {
        key: "TEMPLATE_FIELD_INSTRUCTIONS",
        category: "Template",
        generateFn: () => templateInstructions,
      },
      {
        key: "DOCUMENT_FORMATTING",
        category: "Formatting",
        generateFn: () => formattingInstructions || "",
      },
      {
        key: "NARRATIVE_GENERATION",
        category: "Narrative Generation",
        generateFn: () => this.generateNarrativeInstructions(slots, slotMappingGuide),
      },
      {
        key: "TABLE_GENERATION",
        category: "Table Generation",
        generateFn: () => this.generateTableInstructions(slots, slotMappingGuide),
      },
    ];

    for (const config of agentConfigs) {
      const newTemplate = config.generateFn();
      if (!newTemplate) continue;

      try {
        const result = await this.updateAgentInstruction(
          config.key,
          config.category,
          newTemplate,
          `Updated for template ${templateId}`
        );
        if (result) {
          updates.push(result);
        }
      } catch (error) {
        console.error(`[AgentInstructionUpdater] Failed to update ${config.key}:`, error);
      }
    }

    return updates;
  }

  private async updateAgentInstruction(
    key: string,
    category: string,
    newTemplate: string,
    reason: string
  ): Promise<AgentInstructionUpdate | null> {
    // Check if instruction exists
    const existing = await db
      .select()
      .from(systemInstructions)
      .where(eq(systemInstructions.key, key));

    const variables = this.extractVariables(newTemplate);

    if (existing.length === 0) {
      // Create new instruction
      await db.insert(systemInstructions).values({
        key,
        category,
        description: `Auto-generated for template management`,
        template: newTemplate,
        defaultTemplate: newTemplate,
        version: 1,
        variables,
        updatedBy: "TemplateManagementService",
      });

      return {
        agentKey: key,
        category,
        previousTemplate: "",
        newTemplate,
        templateVariables: variables,
        reason,
        version: 1,
      };
    }

    const current = existing[0];
    const newVersion = current.version + 1;

    // Archive current version
    await db.insert(instructionVersions).values({
      instructionKey: key,
      template: current.template,
      version: current.version,
      changeReason: reason,
      createdBy: "TemplateManagementService",
    });

    // Update instruction
    await db
      .update(systemInstructions)
      .set({
        template: newTemplate,
        version: newVersion,
        variables,
        lastUpdated: new Date(),
        updatedBy: "TemplateManagementService",
      })
      .where(eq(systemInstructions.key, key));

    return {
      agentKey: key,
      category,
      previousTemplate: current.template,
      newTemplate,
      templateVariables: variables,
      reason,
      version: newVersion,
    };
  }

  private generateTemplateInstructions(
    templateId: string,
    slots: SlotDefinitionInput[],
    guide?: SlotMappingGuide
  ): string {
    const lines: string[] = [
      `## TEMPLATE: ${templateId}`,
      "",
      "### Slot Definitions",
      "",
    ];

    // Add metadata from guide if available
    if (guide?.metadata) {
      lines.push(`Template: ${guide.metadata.template_name} v${guide.metadata.template_version}`);
      lines.push(`Description: ${guide.metadata.description}`);
      lines.push(`Compliance Frameworks: ${guide.metadata.compliance_frameworks.join(", ")}`);
      lines.push("");
    }

    // Document each slot
    for (const slot of slots) {
      lines.push(`#### ${slot.slot_id}: ${slot.slot_name}`);
      lines.push(`- Type: ${slot.data_type}`);
      lines.push(`- Required: ${slot.required ? "Yes" : "No"}`);
      if (slot.description) {
        lines.push(`- Description: ${slot.description}`);
      }
      if (slot.evidence_requirements) {
        lines.push(`- Evidence Required: ${slot.evidence_requirements.join(", ")}`);
      }
      if (slot.regulatory_reference) {
        lines.push(`- Regulatory Reference: ${slot.regulatory_reference}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private generateFormattingInstructions(guide: FormattingGuide): string {
    // Handle incomplete formatting guide gracefully
    if (!guide) return "";
    
    const lines: string[] = [
      `## DOCUMENT FORMATTING GUIDE`,
      "",
    ];
    
    if (guide.metadata?.target_format) {
      lines.push(`Target Format: ${guide.metadata.target_format}`);
      lines.push("");
    }
    
    if (guide.page_setup) {
      lines.push("### Page Setup");
      if (guide.page_setup.size) lines.push(`- Size: ${guide.page_setup.size}`);
      if (guide.page_setup.orientation) lines.push(`- Orientation: ${guide.page_setup.orientation}`);
      if (guide.page_setup.margins) {
        lines.push(`- Margins: Top ${guide.page_setup.margins.top || 'N/A'}, Bottom ${guide.page_setup.margins.bottom || 'N/A'}, Left ${guide.page_setup.margins.left || 'N/A'}, Right ${guide.page_setup.margins.right || 'N/A'}`);
      }
      lines.push("");
    }
    
    if (guide.typography && Object.keys(guide.typography).length > 0) {
      lines.push("### Typography");
      for (const [style, spec] of Object.entries(guide.typography)) {
        if (spec) {
          lines.push(`- ${style}: ${spec.font_name || 'Default'} ${spec.font_size || 12}pt${spec.bold ? " Bold" : ""}${spec.italic ? " Italic" : ""}`);
        }
      }
      lines.push("");
    }

    if (guide.table_formatting) {
      lines.push("### Table Formatting");
      if (guide.table_formatting.header_row) {
        lines.push(`- Header: ${guide.table_formatting.header_row.background || 'Default'} background, ${guide.table_formatting.header_row.font_bold ? "Bold" : "Normal"}`);
      }
      if (guide.table_formatting.borders) {
        lines.push(`- Borders: ${guide.table_formatting.borders.style || 'solid'} ${guide.table_formatting.borders.width || '1px'} ${guide.table_formatting.borders.color || 'black'}`);
      }
      lines.push("");
    }

    if (guide.checkbox_formatting) {
      lines.push("### Checkbox Formatting");
      lines.push(`- Checked: ${guide.checkbox_formatting.checked_symbol || '[X]'}`);
      lines.push(`- Unchecked: ${guide.checkbox_formatting.unchecked_symbol || '[ ]'}`);
      lines.push("");
    }

    return lines.join("\n");
  }

  private generateNarrativeInstructions(
    slots: SlotDefinitionInput[],
    guide?: SlotMappingGuide
  ): string {
    const narrativeSlots = slots.filter(s => 
      s.data_type.toLowerCase().includes("text") ||
      s.data_type.toLowerCase().includes("narrative") ||
      s.data_type.toLowerCase().includes("paragraph")
    );

    if (narrativeSlots.length === 0) return "";

    const lines: string[] = [
      "## NARRATIVE GENERATION INSTRUCTIONS",
      "",
      "When generating narrative content for this template, follow these slot-specific guidelines:",
      "",
    ];

    for (const slot of narrativeSlots) {
      lines.push(`### ${slot.slot_id}`);
      lines.push(`Purpose: ${slot.description || slot.slot_name}`);
      if (slot.evidence_requirements) {
        lines.push(`Evidence to cite: ${slot.evidence_requirements.join(", ")}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private generateTableInstructions(
    slots: SlotDefinitionInput[],
    guide?: SlotMappingGuide
  ): string {
    const tableSlots = slots.filter(s => 
      s.data_type.toLowerCase().includes("table") ||
      s.slot_id.toLowerCase().includes("table") ||
      (s.children && s.children.length > 0)
    );

    if (tableSlots.length === 0) return "";

    const lines: string[] = [
      "## TABLE GENERATION INSTRUCTIONS",
      "",
      "When generating tables for this template, follow these column specifications:",
      "",
    ];

    for (const slot of tableSlots) {
      lines.push(`### ${slot.slot_id}: ${slot.slot_name}`);
      if (slot.children) {
        lines.push("Columns:");
        for (const col of slot.children) {
          lines.push(`  - ${col.slot_name} (${col.data_type})${col.required ? " *required" : ""}`);
        }
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private extractVariables(template: string): string[] {
    const matches = template.match(/\{([a-zA-Z0-9_]+)\}/g);
    return matches ? Array.from(new Set(matches.map(m => m.slice(1, -1)))) : [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SLOT PARSER
// ═══════════════════════════════════════════════════════════════════════════════

export class SlotParser {
  /**
   * Parse slots from a slot mapping guide JSON
   * Handles multiple formats:
   * 1. Standard format with slot_categories array
   * 2. Ultra-granular format with nested category objects (cover_page_slots, product_slots, etc.)
   */
  parseSlotMappingGuide(guide: any): SlotDefinitionInput[] {
    const slots: SlotDefinitionInput[] = [];

    // Check if it's the standard format with slot_categories
    if (guide.slot_categories && Array.isArray(guide.slot_categories)) {
      for (const category of guide.slot_categories) {
        for (const slot of category.slots || []) {
          slots.push({
            ...slot,
            regulatory_reference: slot.regulatory_reference || category.section_reference,
          });
        }
      }
      return slots;
    }

    // Handle ultra-granular format with nested objects
    // Look for keys ending in "_slots" or specific known category patterns
    const categoryKeys = Object.keys(guide).filter(key => 
      key.endsWith("_slots") || 
      key.endsWith("_info") ||
      key.includes("section") ||
      key.includes("product") ||
      key.includes("table") ||
      key.includes("chart")
    );

    // If no specific category keys found, try to parse all object keys
    const keysToProcess = categoryKeys.length > 0 ? categoryKeys : Object.keys(guide).filter(key => 
      typeof guide[key] === "object" && 
      guide[key] !== null &&
      !["metadata", "key_features", "slot_naming_conventions", "template_name", "version", "based_on", "description"].includes(key) &&
      !Array.isArray(guide[key])
    );

    for (const categoryKey of keysToProcess) {
      const category = guide[categoryKey];
      if (typeof category !== "object" || category === null) continue;

      this.extractSlotsFromNestedObject(category, categoryKey, slots);
    }

    console.log(`[SlotParser] Extracted ${slots.length} slots from ultra-granular format`);
    return slots;
  }

  /**
   * Recursively extract slot definitions from nested objects
   */
  private extractSlotsFromNestedObject(
    obj: any, 
    path: string, 
    slots: SlotDefinitionInput[],
    depth: number = 0
  ): void {
    if (depth > 5) return; // Prevent infinite recursion

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value !== "object" || value === null) continue;

      // Check if this is a slot definition (has type field or is a leaf with known slot properties)
      if (this.isSlotDefinition(value)) {
        const slotId = `${path}_${key}`.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
        const slotDef = value as any;
        
        slots.push({
          slot_id: slotId,
          slot_name: slotDef.description || key.replace(/_/g, " "),
          data_type: this.normalizeDataType(slotDef.type || "text"),
          required: slotDef.required !== false,
          description: slotDef.description || `${path} > ${key}`,
          formatting: slotDef.formatting ? {
            font_family: slotDef.font,
            font_size: slotDef.font_size,
            bold: slotDef.bold,
            alignment: slotDef.alignment,
          } : undefined,
          evidence_requirements: slotDef.evidence_types || [],
          regulatory_reference: slotDef.regulatory_reference || slotDef.conditional,
          per_product: key.includes("product_") || path.includes("product"),
        });
      } else {
        // Recurse into nested objects
        this.extractSlotsFromNestedObject(value, `${path}_${key}`, slots, depth + 1);
      }
    }
  }

  /**
   * Check if an object is a slot definition
   */
  private isSlotDefinition(obj: any): boolean {
    if (typeof obj !== "object" || obj === null) return false;
    
    // Has explicit type field (text, date, checkbox, table, etc.)
    if (obj.type && typeof obj.type === "string") return true;
    
    // Has example field (common in slot definitions)
    if (obj.example !== undefined) return true;
    
    // Has format field
    if (obj.format && typeof obj.format === "string") return true;
    
    // Has description and no nested objects with type
    if (obj.description && !Object.values(obj).some((v: any) => typeof v === "object" && v?.type)) return true;
    
    return false;
  }

  /**
   * Normalize data type strings
   */
  private normalizeDataType(type: string): string {
    const typeMap: Record<string, string> = {
      "text": "text",
      "string": "text",
      "date": "date",
      "date_range": "date_range",
      "checkbox": "checkbox",
      "boolean": "checkbox",
      "table": "table",
      "number": "number",
      "numeric": "number",
      "image": "image",
      "chart": "image",
      "figure": "image",
      "narrative": "narrative",
      "paragraph": "narrative",
      "multi_paragraph": "narrative",
    };
    return typeMap[type.toLowerCase()] || type;
  }

  /**
   * Parse slots from a form-based template JSON
   */
  parseFormTemplate(template: any): SlotDefinitionInput[] {
    const slots: SlotDefinitionInput[] = [];

    if (template.form?.sections) {
      for (const section of template.form.sections) {
        this.extractSlotsFromSection(section, slots);
      }
    }

    if (template.sections) {
      for (const section of template.sections) {
        this.extractSlotsFromSection(section, slots);
      }
    }

    return slots;
  }

  private extractSlotsFromSection(
    section: any,
    slots: SlotDefinitionInput[],
    parentPath: string = ""
  ): void {
    const sectionPath = parentPath ? `${parentPath} > ${section.title || section.section_id}` : (section.title || section.section_id);

    // Create slot for section if it has content fields
    if (section.content || section.fields) {
      slots.push({
        slot_id: section.section_id || `section_${slots.length}`,
        slot_name: section.title || section.section_id,
        data_type: section.type || "narrative",
        required: section.required !== false,
        description: section.description,
        regulatory_reference: section.regulatory_basis,
        evidence_requirements: section.evidence_types || [],
      });
    }

    // Process table columns
    if (section.table_schema?.columns) {
      const children: SlotDefinitionInput[] = section.table_schema.columns.map((col: any) => ({
        slot_id: `${section.section_id}_${col.name}`,
        slot_name: col.header || col.name,
        data_type: col.type || "string",
        required: col.required !== false,
        description: col.description,
      }));

      slots.push({
        slot_id: section.section_id,
        slot_name: section.title,
        data_type: "table",
        required: section.required !== false,
        children,
      });
    }

    // Recursively process subsections
    if (section.subsections) {
      for (const sub of section.subsections) {
        this.extractSlotsFromSection(sub, slots, sectionPath);
      }
    }
  }

  /**
   * Parse slots from a slot-based template JSON
   */
  parseSlotBasedTemplate(template: any): SlotDefinitionInput[] {
    if (!template.slots) return [];

    return template.slots.map((slot: any) => ({
      slot_id: slot.slot_id,
      slot_name: slot.title || slot.slot_id,
      data_type: slot.slot_kind || "narrative",
      required: slot.required !== false,
      description: slot.description,
      evidence_requirements: slot.evidence_requirements?.required_types || [],
      regulatory_reference: slot.regulatory_basis,
      formatting: slot.output_requirements ? {
        alignment: slot.output_requirements.render_as,
      } : undefined,
    }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

import { 
  createSOTAGroundingEngine, 
  validateTemplateGrkbCoverage,
  createMDCGEnhancedGroundingEngine,
  type SlotInput as SOTASlotInput,
  type GroundingValidationResult,
  type MDCGEnhancedGroundingResult,
  type DeviceClassification
} from "./grkbGroundingService";

import {
  createMDCGValidationService,
  type AnnexIVRequirements,
} from "./mdcgValidationService";

import {
  createAnnexIComplianceAuditor,
  type ComplianceAuditResult,
} from "./annexIComplianceAuditor";

export class TemplateManagementService {
  private instructionUpdater: AgentInstructionUpdater;
  private slotParser: SlotParser;
  private traceId: string;

  constructor() {
    this.traceId = uuidv4();
    this.instructionUpdater = new AgentInstructionUpdater(this.traceId);
    this.slotParser = new SlotParser();
  }

  /**
   * Process a new template with optional guides
   * Uses SOTA semantic grounding engine for obligation mapping
   * Enhanced with MDCG 2022-21 Annex II, III, and IV validation
   */
  async processTemplate(
    templateJson: any,
    options: {
      slotMappingGuide?: SlotMappingGuide;
      formattingGuide?: FormattingGuide;
      jurisdictions?: string[];
      updateAgentInstructions?: boolean;
      useSOTAGrounding?: boolean;
      strictMode?: boolean;
      /** Device classification for MDCG-enhanced validation */
      deviceClassification?: DeviceClassification;
      /** Enable full MDCG 2022-21 Annex II, III, IV validation */
      useMDCGValidation?: boolean;
    } = {}
  ): Promise<TemplateManagementResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const jurisdictions = options.jurisdictions || ["EU_MDR", "UK_MDR"];
    const useSOTAGrounding = options.useSOTAGrounding !== false; // Default to SOTA
    const strictMode = options.strictMode !== false; // Default to strict
    const useMDCGValidation = options.useMDCGValidation !== false; // Default to MDCG validation
    
    // Default device classification if not provided
    const deviceClassification: DeviceClassification = options.deviceClassification || {
      deviceClass: "Class IIb",
      isImplantable: false,
      isLegacy: false,
    };

    // Determine template type, ID, and name
    const isFormBased = this.isFormBasedTemplate(templateJson);
    const templateId = isFormBased
      ? templateJson.form?.form_id || `form_${Date.now()}`
      : templateJson.template_id || `template_${Date.now()}`;
    const templateName = isFormBased
      ? templateJson.form?.form_title || "Custom PSUR Form"
      : templateJson.name || templateId;

    console.log(`[TemplateManagementService] Processing ${isFormBased ? "form-based" : "slot-based"} template: ${templateId}`);

    // Trace: Template processing started
    await this.trace({
      eventType: "TEMPLATE_PROCESSING_START",
      actor: "TemplateManagementService",
      entityType: "template",
      entityId: templateId,
      decision: "IN_PROGRESS",
      humanSummary: `Started processing ${isFormBased ? "form-based" : "slot-based"} template: ${templateId}`,
      inputData: {
        templateId,
        isFormBased,
        hasSlotMappingGuide: !!options.slotMappingGuide,
        hasFormattingGuide: !!options.formattingGuide,
        jurisdictions,
        useSOTAGrounding,
        strictMode,
      },
      templateId,
    });

    // Parse slots from template or guide
    let slots: SlotDefinitionInput[];
    
    if (options.slotMappingGuide) {
      // Use slot mapping guide as primary source
      slots = this.slotParser.parseSlotMappingGuide(options.slotMappingGuide);
      console.log(`[TemplateManagementService] Parsed ${slots.length} slots from mapping guide`);
    } else if (isFormBased) {
      slots = this.slotParser.parseFormTemplate(templateJson);
      console.log(`[TemplateManagementService] Parsed ${slots.length} slots from form template`);
    } else {
      slots = this.slotParser.parseSlotBasedTemplate(templateJson);
      console.log(`[TemplateManagementService] Parsed ${slots.length} slots from slot-based template`);
    }

    if (slots.length === 0) {
      errors.push("No slots could be extracted from template");
    }

    // Use SOTA grounding engine for semantic obligation matching
    let groundingResult: GRKBGroundingResult;
    let sotaResult: GroundingValidationResult | null = null;
    let mdcgEnhancedResult: MDCGEnhancedGroundingResult | null = null;
    
    if (useSOTAGrounding && slots.length > 0) {
      console.log(`[TemplateManagementService] Using SOTA semantic grounding engine`);
      
      // Convert slots to SOTA format
      const sotaSlots: SOTASlotInput[] = slots.map(s => ({
        slot_id: s.slot_id,
        slot_name: s.slot_name,
        description: s.description,
        evidence_requirements: s.evidence_requirements,
        regulatory_reference: s.regulatory_reference,
        required: s.required,
        data_type: s.data_type,
      }));
      
      // Use MDCG-enhanced grounding if enabled for EU MDR
      if (useMDCGValidation && jurisdictions.includes("EU_MDR")) {
        console.log(`[TemplateManagementService] Using MDCG 2022-21 enhanced grounding (Annex II, III, IV)`);
        
        const mdcgEngine = createMDCGEnhancedGroundingEngine(this.traceId);
        mdcgEnhancedResult = await mdcgEngine.groundTemplateWithMDCG(
          templateId,
          sotaSlots,
          jurisdictions,
          {
            deviceClassification,
            useLLMAnalysis: true,
            confidenceThreshold: 0.6,
            strictMode,
            validateAnnexCompliance: true,
          }
        );
        
        sotaResult = mdcgEnhancedResult;
        
        console.log(`[TemplateManagementService] MDCG compliance: Annex II=${mdcgEnhancedResult.mdcgCompliance.annexIIScore}%, Annex III=${mdcgEnhancedResult.mdcgCompliance.annexIIIScore}%`);
      } else {
        const sotaEngine = createSOTAGroundingEngine(this.traceId);
        sotaResult = await sotaEngine.groundTemplate(templateId, sotaSlots, jurisdictions, {
          useLLMAnalysis: true,
          confidenceThreshold: 0.6,
          strictMode,
        });
      }
      
      // Convert SOTA result to legacy format for compatibility
      const obligationMapping: Record<string, string[]> = {};
      for (const slotResult of sotaResult.slotResults) {
        if (slotResult.isGrounded) {
          obligationMapping[slotResult.slotId] = slotResult.matches
            .filter(m => m.confidence >= 0.6)
            .map(m => m.obligationId);
        }
      }
      
      const ungroundedSlots = sotaResult.slotResults
        .filter(r => !r.isGrounded)
        .map(r => r.slotId);
      
      // Build MDCG compliance result with Annex II, III, IV data
      const mdcgCompliance: MDCGComplianceResult = mdcgEnhancedResult ? {
        annex1Coverage: sotaResult.complianceScore,
        annex2Coverage: mdcgEnhancedResult.mdcgCompliance.annexIIScore,
        annex3Coverage: mdcgEnhancedResult.mdcgCompliance.annexIIIScore,
        annex4Compliant: mdcgEnhancedResult.mdcgCompliance.annexIVCompliant,
        missingMandatorySections: [],
        missingMandatoryTables: mdcgEnhancedResult.deviceRequirements.mandatoryTables.filter(
          t => !mdcgEnhancedResult!.mdcgCompliance.mandatoryTables.includes(t)
        ),
        deviceRequirements: mdcgEnhancedResult.deviceRequirements,
        passed: sotaResult.status !== "BLOCKED" && mdcgEnhancedResult.mdcgCompliance.annexIVCompliant,
      } : {
        annex1Coverage: sotaResult.complianceScore,
        annex2Coverage: 0,
        annex3Coverage: 0,
        annex4Compliant: true,
        missingMandatorySections: [],
        missingMandatoryTables: [],
        passed: sotaResult.status !== "BLOCKED",
      };
      
      groundingResult = {
        success: sotaResult.status !== "BLOCKED",
        templateId,
        jurisdictions,
        totalSlots: slots.length,
        groundedSlots: sotaResult.slotResults.filter(r => r.isGrounded).length,
        ungroundedSlots,
        obligationMapping,
        complianceGaps: ungroundedSlots.map(slotId => ({
          slotId,
          slotName: slots.find(s => s.slot_id === slotId)?.slot_name || slotId,
          missingRequirements: ["No matching GRKB obligation found with sufficient confidence"],
          severity: "high" as const,
          recommendation: `Review slot definition or manually assign obligations`,
        })),
        mdcgCompliance,
        traceId: this.traceId,
      };
      
      // Add SOTA-specific warnings/errors
      if (sotaResult.status === "BLOCKED") {
        errors.push(...sotaResult.blockingErrors);
      }
      warnings.push(...sotaResult.warnings);
      
      if (sotaResult.uncoveredObligations.length > 0) {
        warnings.push(`${sotaResult.uncoveredObligations.length} GRKB obligations not covered by template slots`);
      }
      
      // Add MDCG-specific warnings
      if (mdcgEnhancedResult) {
        if (mdcgEnhancedResult.mdcgCompliance.annexIIScore < 80) {
          warnings.push(`MDCG 2022-21 Annex II table coverage is ${mdcgEnhancedResult.mdcgCompliance.annexIIScore}% (recommended: 80%+)`);
        }
        if (!mdcgEnhancedResult.mdcgCompliance.annexIVCompliant) {
          warnings.push(`Device requirements (${deviceClassification.deviceClass}) may not be fully met - review mandatory tables`);
        }
        if (mdcgEnhancedResult.deviceRequirements.eudamedSubmission) {
          warnings.push(`EUDAMED submission will be required for ${deviceClassification.deviceClass} ${deviceClassification.isImplantable ? "implantable" : ""} device`);
        }
      }
      
      console.log(`[TemplateManagementService] Grounding complete: ${sotaResult.complianceScore}% coverage, status=${sotaResult.status}`);
    } else {
      // Fallback to legacy grounding (backward compatibility)
      console.log(`[TemplateManagementService] Using legacy keyword-based grounding`);
      const legacyEngine = new GRKBGroundingEngine(this.traceId);
      groundingResult = await legacyEngine.groundTemplate(templateId, slots, jurisdictions);
      
      if (!groundingResult.success) {
        warnings.push(`Template grounding incomplete: ${groundingResult.ungroundedSlots.length} slots without GRKB mapping`);
      }

      if (!groundingResult.mdcgCompliance.passed) {
        warnings.push(`MDCG 2022-21 compliance gaps: ${groundingResult.mdcgCompliance.missingMandatorySections.join(", ")}`);
      }
    }

    // Save slot definitions to database (SOTA engine already saves mappings)
    if (!useSOTAGrounding) {
      await this.saveSlotDefinitions(templateId, slots, groundingResult.obligationMapping, jurisdictions);
    } else {
      // Just save the slot definitions, mappings are saved by SOTA engine
      await this.saveSlotDefinitionsOnly(templateId, slots);
    }

    // Trace: Slots saved
    await this.trace({
      eventType: "SLOTS_PERSISTED",
      actor: "TemplateManagementService",
      entityType: "template",
      entityId: templateId,
      decision: "COMPLETE",
      humanSummary: `Persisted ${slots.length} slot definitions with ${Object.keys(groundingResult.obligationMapping).length} GRKB mappings`,
      outputData: {
        slotCount: slots.length,
        groundedCount: groundingResult.groundedSlots,
        ungroundedCount: groundingResult.ungroundedSlots.length,
      },
      templateId,
    });

    // Update agent instructions if requested
    let agentUpdates: AgentInstructionUpdate[] = [];
    if (options.updateAgentInstructions !== false) {
      agentUpdates = await this.instructionUpdater.updateInstructions(
        templateId,
        slots,
        options.formattingGuide,
        options.slotMappingGuide
      );
      console.log(`[TemplateManagementService] Updated ${agentUpdates.length} agent instructions`);

      // Trace: Agent instructions updated
      await this.trace({
        eventType: "AGENT_INSTRUCTIONS_UPDATED",
        actor: "AgentInstructionUpdater",
        entityType: "instructions",
        entityId: templateId,
        decision: "COMPLETE",
        humanSummary: `Updated ${agentUpdates.length} agent instruction categories for template ${templateId}`,
        outputData: {
          updatedCategories: agentUpdates.map(u => u.category),
          agentKeys: agentUpdates.map(u => u.agentKey),
        },
        templateId,
      });
    }

    // Run Annex I compliance audit (non-blocking)
    let complianceAudit: ComplianceAuditResult | undefined;
    try {
      // Only audit if template is slot-based and for EU_MDR jurisdiction
      if (!isFormBased && jurisdictions.includes("EU_MDR")) {
        console.log(`[TemplateManagementService] Running Annex I compliance audit`);
        
        // Transform to workflow schema first
        const workflowTemplate = transformTemplateToWorkflowSchema(
          templateJson, 
          slots, 
          groundingResult.obligationMapping
        );
        
        const auditor = createAnnexIComplianceAuditor();
        complianceAudit = await auditor.auditTemplate(workflowTemplate);
        
        console.log(
          `[TemplateManagementService] Compliance audit complete: ${complianceAudit.overallComplianceScore}% compliance, ${complianceAudit.warnings.length} warnings`
        );
        
        // Add audit warnings to main warnings list
        for (const warning of complianceAudit.warnings) {
          if (warning.level === "CRITICAL") {
            warnings.push(`[CRITICAL] ${warning.message} - ${warning.remediation}`);
          } else if (warning.level === "WARNING") {
            warnings.push(`[WARNING] ${warning.message}`);
          }
        }
        
        // Trace: Compliance audit complete
        await this.trace({
          eventType: "COMPLIANCE_AUDIT_COMPLETE",
          actor: "AnnexIComplianceAuditor",
          entityType: "template",
          entityId: templateId,
          decision: complianceAudit.overallComplianceScore >= 80 ? "PASS" : "WARNING",
          humanSummary: `Annex I compliance audit: ${complianceAudit.overallComplianceScore}% score with ${complianceAudit.warnings.length} warnings`,
          outputData: {
            score: complianceAudit.overallComplianceScore,
            warningCount: complianceAudit.warnings.length,
            criticalWarnings: complianceAudit.warnings.filter(w => w.level === "CRITICAL").length,
          },
          templateId,
        });
      }
    } catch (auditError: any) {
      console.error(`[TemplateManagementService] Compliance audit failed (non-blocking):`, auditError);
      warnings.push(`Compliance audit failed: ${auditError.message}`);
    }

    // Save template to disk
    const templateVersion = isFormBased 
      ? (templateJson.form?.revision || "1.0")
      : (templateJson.version || "1.0");
    const templateJurisdictions = options.jurisdictions || ["EU_MDR", "UK_MDR"];
    
    const savedTo = await this.saveTemplate(
      templateId, 
      templateName, 
      templateVersion,
      templateJurisdictions,
      templateJson, 
      isFormBased,
      slots,
      groundingResult.obligationMapping,
      complianceAudit
    );

    // Trace: Template processing complete
    await this.trace({
      eventType: "TEMPLATE_PROCESSING_COMPLETE",
      actor: "TemplateManagementService",
      entityType: "template",
      entityId: templateId,
      decision: errors.length === 0 ? "SUCCESS" : "PARTIAL_SUCCESS",
      humanSummary: `Template ${templateId} processing complete with ${errors.length} errors and ${warnings.length} warnings`,
      outputData: {
        success: errors.length === 0,
        slotCount: slots.length,
        groundedSlots: groundingResult.groundedSlots,
        agentUpdatesCount: agentUpdates.length,
        savedTo,
        errors,
        warnings,
      },
      templateId,
    });

    return {
      success: errors.length === 0,
      templateId,
      templateType: isFormBased ? "form-based" : "slot-based",
      savedTo,
      slotCount: slots.length,
      groundingResult,
      agentUpdates,
      complianceAudit,
      traceId: this.traceId,
      errors,
      warnings,
    };
  }

  private isFormBasedTemplate(template: any): boolean {
    return !!(template.form || template.sections);
  }

  private async saveSlotDefinitions(
    templateId: string,
    slots: SlotDefinitionInput[],
    obligationMapping: Record<string, string[]>,
    jurisdictions: string[]
  ): Promise<void> {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];

      // Upsert slot definition
      await db
        .insert(slotDefinitions)
        .values({
          slotId: slot.slot_id,
          title: slot.slot_name,
          description: slot.description || "",
          templateId,
          jurisdictions,
          requiredEvidenceTypes: slot.evidence_requirements || [],
          hardRequireEvidence: slot.required,
          minAtoms: 1,
          sortOrder: i,
        })
        .onConflictDoUpdate({
          target: [slotDefinitions.slotId, slotDefinitions.templateId],
          set: {
            title: slot.slot_name,
            description: slot.description || "",
            jurisdictions,
            requiredEvidenceTypes: slot.evidence_requirements || [],
            hardRequireEvidence: slot.required,
            sortOrder: i,
          },
        });

      // Save obligation links
      const obligationIds = obligationMapping[slot.slot_id] || [];
      for (const obligationId of obligationIds) {
        await db
          .insert(slotObligationLinks)
          .values({
            templateId,
            slotId: slot.slot_id,
            obligationId,
            mandatory: slot.required,
          })
          .onConflictDoNothing();
      }
    }
  }

  /**
   * Save slot definitions only (without obligation links).
   * Used when SOTA grounding engine handles mappings separately.
   */
  private async saveSlotDefinitionsOnly(
    templateId: string,
    slots: SlotDefinitionInput[]
  ): Promise<void> {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];

      // Upsert slot definition
      await db
        .insert(slotDefinitions)
        .values({
          slotId: slot.slot_id,
          title: slot.slot_name,
          description: slot.description || "",
          templateId,
          jurisdictions: ["EU_MDR", "UK_MDR"],
          requiredEvidenceTypes: slot.evidence_requirements || [],
          hardRequireEvidence: slot.required,
          minAtoms: 1,
          sortOrder: i,
        })
        .onConflictDoUpdate({
          target: [slotDefinitions.slotId, slotDefinitions.templateId],
          set: {
            title: slot.slot_name,
            description: slot.description || "",
            requiredEvidenceTypes: slot.evidence_requirements || [],
            hardRequireEvidence: slot.required,
            sortOrder: i,
          },
        });
    }
    console.log(`[TemplateManagementService] Saved ${slots.length} slot definitions (SOTA mode)`);
  }

  private async saveTemplate(
    templateId: string,
    name: string,
    version: string,
    jurisdictions: string[],
    template: any,
    isFormBased: boolean,
    slots?: SlotDefinitionInput[],
    obligationMapping?: Record<string, string[]>,
    complianceAudit?: ComplianceAuditResult
  ): Promise<string> {
    // SOTA: Transform slot-based templates to workflow-compatible format before saving
    // This ensures the database always stores templates in canonical format that
    // the workflow can directly consume without runtime conversion
    let templateToSave = template;
    
    if (!isFormBased && slots && obligationMapping) {
      templateToSave = transformTemplateToWorkflowSchema(template, slots, obligationMapping);
      console.log(`[TemplateManagementService] Transformed template to workflow-compatible format`);
    }
    
    // Filter jurisdictions to valid values
    const validJurisdictions = jurisdictions.filter(
      (j): j is "EU_MDR" | "UK_MDR" => j === "EU_MDR" || j === "UK_MDR"
    );
    
    // Save to database (primary storage)
    try {
      await db.insert(templates).values({
        templateId,
        name,
        version,
        jurisdictions: validJurisdictions.length > 0 ? validJurisdictions : ["EU_MDR"],
        templateType: isFormBased ? 'form-based' : 'slot-based',
        templateJson: templateToSave, // Save workflow-compatible format
        complianceAudit: complianceAudit ? (complianceAudit as any) : null,
      }).onConflictDoUpdate({
        target: templates.templateId,
        set: {
          name,
          version,
          jurisdictions: validJurisdictions.length > 0 ? validJurisdictions : ["EU_MDR"],
          templateType: isFormBased ? 'form-based' : 'slot-based',
          templateJson: templateToSave, // Save workflow-compatible format
          complianceAudit: complianceAudit ? (complianceAudit as any) : null,
          updatedAt: new Date(),
        },
      });

      console.log(`[TemplateManagementService] Saved workflow-compatible template to database: ${templateId}`);
    } catch (dbError: any) {
      console.error(`[TemplateManagementService] Failed to save to database:`, dbError);
      throw new Error(`Failed to save template to database: ${dbError.message}`);
    }

    // Also save to filesystem for backward compatibility (save transformed version)
    const templatesDir = path.resolve(process.cwd(), "server", "templates");
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true });
    }

    const safeFileName = templateId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = path.join(templatesDir, `${safeFileName}.json`);
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(templateToSave, null, 2), "utf-8");
      console.log(`[TemplateManagementService] Also saved template to filesystem: ${filePath}`);
    } catch (fsError) {
      console.warn(`[TemplateManagementService] Failed to save to filesystem (non-critical):`, fsError);
    }

    return filePath;
  }

  private sequenceNum = 0;

  private async trace(data: Partial<InsertDecisionTraceEntry>): Promise<void> {
    const hash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");

    await db.insert(decisionTraceEntries).values({
      traceId: this.traceId,
      sequenceNum: ++this.sequenceNum,
      eventTimestamp: new Date(),
      contentHash: hash,
      jurisdictions: data.jurisdictions || ["EU_MDR"],
      ...data,
    } as any);
  }

  /**
   * Get template analysis without saving
   */
  async analyzeTemplate(
    templateJson: any,
    slotMappingGuide?: SlotMappingGuide,
    jurisdictions: string[] = ["EU_MDR", "UK_MDR"]
  ): Promise<{
    templateType: "slot-based" | "form-based";
    slots: SlotDefinitionInput[];
    groundingPreview: Partial<GRKBGroundingResult>;
  }> {
    const isFormBased = this.isFormBasedTemplate(templateJson);
    
    let slots: SlotDefinitionInput[];
    if (slotMappingGuide) {
      slots = this.slotParser.parseSlotMappingGuide(slotMappingGuide);
    } else if (isFormBased) {
      slots = this.slotParser.parseFormTemplate(templateJson);
    } else {
      slots = this.slotParser.parseSlotBasedTemplate(templateJson);
    }

    // Quick grounding preview (without full trace)
    const tempEngine = new GRKBGroundingEngine();
    const groundingResult = await tempEngine.groundTemplate(
      "preview",
      slots,
      jurisdictions
    );

    return {
      templateType: isFormBased ? "form-based" : "slot-based",
      slots,
      groundingPreview: {
        totalSlots: groundingResult.totalSlots,
        groundedSlots: groundingResult.groundedSlots,
        ungroundedSlots: groundingResult.ungroundedSlots,
        mdcgCompliance: groundingResult.mdcgCompliance,
      },
    };
  }
}

// Export singleton instance
export const templateManagementService = new TemplateManagementService();
