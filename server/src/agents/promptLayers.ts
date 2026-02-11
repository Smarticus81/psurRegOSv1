/**
 * 3-Layer Prompt Architecture
 * 
 * Layer 1: AGENT PERSONAS - WHO the agent is (identity, tone, expertise)
 * Layer 2: SYSTEM PROMPTS - WHAT to do (from DATABASE via getPromptTemplate)
 * Layer 3: TEMPLATE FIELD INSTRUCTIONS - HOW to handle custom fields (examples, format)
 * 
 * At runtime, prompts are composed as:
 * SYSTEM MESSAGE = Persona + System Prompt + Field Instructions (if any)
 * 
 * SINGLE SOURCE OF TRUTH: All system prompts come from the database.
 * The System Instructions UI edits prompts in the database.
 * No hardcoded fallbacks - if prompt is missing from DB, it's an error.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 1: AGENT PERSONAS - WHO the agent is
// ═══════════════════════════════════════════════════════════════════════════════

export const AGENT_PERSONAS = {
  REGULATORY_WRITER: `You are a regulatory medical writer producing PSUR sections for Notified Body review. Write concise, factual prose in third person. State data and conclusions directly — no filler, no marketing language, no speculation. Every sentence must add information.`,

  SAFETY_ANALYST: `You are a medical device safety analyst writing PSUR safety sections. Be precise and factual about safety data using IMDRF terminology. State incident counts, outcomes, and conclusions directly. Never minimize or sensationalize.`,

  CLINICAL_SCIENTIST: `You are a clinical scientist writing PSUR literature and PMCF sections. Summarize study findings concisely with author/year citations. State whether findings confirm the safety profile or identify new risks.`,

  QUALITY_SPECIALIST: `You are a quality specialist writing PSUR CAPA sections. List CAPAs with reference numbers, scope, root cause, status, and effectiveness. Be precise about dates and outcomes.`,

  DATA_ANALYST: `You are a data analyst writing PSUR trend and sales sections. Present rates, statistical thresholds (UCL/LCL), and trend conclusions. Use tables for regional/temporal data. State signal detection outcomes directly.`,

  TABLE_GENERATOR: `You generate regulatory-compliant tables for PSURs. Use clear column headers, mark missing data as "N/A", and ensure data accuracy.`,

  CHART_GENERATOR: `You generate regulatory-appropriate charts for PSURs. Use clear titles, axis labels, and legends. Ensure accurate data representation.`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 2: SYSTEM PROMPTS - WHAT to do (loaded from DATABASE ONLY)
// ═══════════════════════════════════════════════════════════════════════════════
//
// SINGLE SOURCE OF TRUTH: All system prompts come from the database.
// Use getPromptTemplate() from llmService.ts to retrieve prompts.
// The System Instructions UI (/system-instructions) manages all prompts.
// 
// Initial seeding: GET /api/system-instructions seeds prompts from 
// DEFAULT_PROMPT_TEMPLATES (in llmService.ts) on first access.
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 3: TEMPLATE FIELD INSTRUCTIONS - HOW to handle custom template fields
// ═══════════════════════════════════════════════════════════════════════════════

export interface TemplateFieldInstruction {
  field: string;
  description: string;
  dataType: "text" | "number" | "date" | "list" | "table" | "json";
  format?: string;
  examples: string[];
  validationRules?: string[];
}

// Default field instructions for common PSUR template fields
export const TEMPLATE_FIELD_INSTRUCTIONS: Record<string, TemplateFieldInstruction[]> = {
  EXEC_SUMMARY: [
    {
      field: "executive_summary",
      description: "Concise executive summary with structured subsections",
      dataType: "text",
      format: "Structured subsections: Previous Actions, NB Review, B/R Conclusion paragraph",
      examples: [
        "During the data collection period, X units were distributed globally. There were Y complaints, Z serious incidents, and N FSCAs were opened or closed. Based on the comprehensive analysis of all collected post-market surveillance data, the benefit-risk profile has not been adversely impacted and remains unchanged."
      ],
    },
  ],

  TREND_ANALYSIS: [
    {
      field: "trend_reporting",
      description: "Monthly complaint rate trending with UCL analysis",
      dataType: "text",
      format: "Methodology sentence, UCL description, excursion analysis if any, conclusion",
      examples: [
        "Complaint rate trending was performed monthly. The Upper Control Limit (UCL) was established using three standard deviations above the average. In one month, November 2023, the monthly complaint rate (0.086%) exceeded the UCL (0.081%). The medical device problems were varied with the most common being Suction Problem (12). Without intervention, the rate returned to typical levels the following month. No trend report was submitted as there was no indication of a significant increase in frequency or severity."
      ],
    },
  ],

  SAFETY: [
    {
      field: "safety_data",
      description: "Incident summary with IMDRF tables",
      dataType: "text",
      format: "Total count statement, IMDRF Annex A/C/F tables by region, conclusion",
      examples: [
        "During the data collection period, 408 product complaints were reported. All reported complaints were evaluated for Serious Incidents and there are zero (0) serious incidents."
      ],
    },
  ],

  BENEFIT_RISK: [],
  CONCLUSION: [],
  CLINICAL: [],
  VIGILANCE: [],
  FSCA: [],
  CAPA: [],
  PMS_ACTIVITY: [],

  // Common output format instruction
  OUTPUT_FORMAT: [
    {
      field: "json_metadata",
      description: "Required JSON block at end of all narratives",
      dataType: "json",
      format: "JSON block with citation and confidence data",
      examples: [
        '```json\n{\n  "citedAtoms": [],\n  "uncitedAtoms": [],\n  "dataGaps": [],\n  "confidence": 0.85,\n  "reasoning": "Based on complete data for reporting period"\n}\n```'
      ],
      validationRules: [
        "citedAtoms must contain only atom IDs that exist in the evidence",
        "confidence must be between 0.0 and 1.0",
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT COMPOSITION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the appropriate persona for an agent type
 */
export function getPersonaForAgent(agentType: string): string {
  const typeUpper = agentType.toUpperCase();
  
  // Narrative agents
  if (typeUpper.includes("EXEC") || typeUpper.includes("SUMMARY") || typeUpper.includes("DEVICE") || typeUpper.includes("PMS") || typeUpper.includes("CONCLUSION")) {
    return AGENT_PERSONAS.REGULATORY_WRITER;
  }
  if (typeUpper.includes("SAFETY") || typeUpper.includes("INCIDENT") || typeUpper.includes("VIGILANCE") || typeUpper.includes("FSCA")) {
    return AGENT_PERSONAS.SAFETY_ANALYST;
  }
  if (typeUpper.includes("CLINICAL") || typeUpper.includes("LITERATURE") || typeUpper.includes("PMCF")) {
    return AGENT_PERSONAS.CLINICAL_SCIENTIST;
  }
  if (typeUpper.includes("CAPA") || typeUpper.includes("QUALITY")) {
    return AGENT_PERSONAS.QUALITY_SPECIALIST;
  }
  if (typeUpper.includes("TREND") || typeUpper.includes("ANALYSIS") || typeUpper.includes("DATA")) {
    return AGENT_PERSONAS.DATA_ANALYST;
  }
  if (typeUpper.includes("BENEFIT") || typeUpper.includes("RISK")) {
    return AGENT_PERSONAS.REGULATORY_WRITER;
  }
  
  // Table/Chart agents
  if (typeUpper.includes("TABLE")) {
    return AGENT_PERSONAS.TABLE_GENERATOR;
  }
  if (typeUpper.includes("CHART") || typeUpper.includes("GRAPH")) {
    return AGENT_PERSONAS.CHART_GENERATOR;
  }
  
  // Default
  return AGENT_PERSONAS.REGULATORY_WRITER;
}

/**
 * Get field instructions for a section type
 */
export function getFieldInstructions(sectionType: string): TemplateFieldInstruction[] {
  const typeUpper = sectionType.toUpperCase();
  const sectionInstructions = TEMPLATE_FIELD_INSTRUCTIONS[typeUpper] || [];
  const outputInstructions = TEMPLATE_FIELD_INSTRUCTIONS.OUTPUT_FORMAT || [];
  return [...sectionInstructions, ...outputInstructions];
}

/**
 * Format field instructions as a prompt section
 */
export function formatFieldInstructions(instructions: TemplateFieldInstruction[]): string {
  if (instructions.length === 0) return "";
  
  let formatted = "\n## FIELD HANDLING INSTRUCTIONS\n\n";
  
  for (const inst of instructions) {
    formatted += `### ${inst.field}\n`;
    formatted += `**Description:** ${inst.description}\n`;
    formatted += `**Format:** ${inst.format || inst.dataType}\n`;
    
    if (inst.examples.length > 0) {
      formatted += `**Examples:**\n`;
      for (const ex of inst.examples) {
        formatted += `\`\`\`\n${ex}\n\`\`\`\n`;
      }
    }
    
    if (inst.validationRules && inst.validationRules.length > 0) {
      formatted += `**Validation:**\n`;
      for (const rule of inst.validationRules) {
        formatted += `- ${rule}\n`;
      }
    }
    
    formatted += "\n";
  }
  
  return formatted;
}

/**
 * Compose the full system message for an agent
 * 
 * Combines: Persona + System Prompt + Field Instructions
 */
export function composeSystemMessage(
  agentType: string,
  systemPrompt: string,
  sectionType?: string
): string {
  // Layer 1: Get persona
  const persona = getPersonaForAgent(agentType);
  
  // Layer 2: System prompt is passed in (from DB or defaults)
  
  // Layer 3: Get field instructions
  const fieldInstructions = sectionType ? getFieldInstructions(sectionType) : [];
  const fieldInstructionsText = formatFieldInstructions(fieldInstructions);
  
  // Compose full message
  return `${persona}

${systemPrompt}
${fieldInstructionsText}
## WRITING RULES
1. BE CONCISE. Each section should be as short as possible while covering all required data. A section with no incidents should be 1-2 sentences, not 3 paragraphs.
2. STATE FACTS DIRECTLY. Write "There were 408 complaints and zero serious incidents." not "A comprehensive analysis of the surveillance data reveals that during the reporting period..."
3. USE TABLES for structured data (sales by region, incidents by IMDRF code, CAPAs). Do not repeat table data as prose.
4. NEVER cite regulations, standards, articles, or guidance documents in the output text. No "in accordance with", "per MDR", "Article 88", etc.
5. NEVER fabricate data. Use only the numbers provided. If data is missing, state "No data available."
6. End with a JSON metadata block tracking cited atoms, data gaps, and confidence.`;
}

// NOTE: getDefaultSystemPrompt() has been REMOVED.
// All prompts must come from the database via getPromptTemplate().
// If a prompt is not in the database, it's an error - visit System Instructions to seed prompts.
