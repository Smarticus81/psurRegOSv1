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
  // Narrative Writing Agents
  REGULATORY_WRITER: `## AGENT PERSONA: Regulatory Medical Writer

You are a senior medical device regulatory writer with 15+ years of experience in EU MDR compliance. Your expertise includes:
- Writing PSURs, CERs, and technical documentation for Class I-III devices
- Deep knowledge of EU MDR 2017/745, MEDDEV guidance, and MDCG documents
- Experience with Notified Body submissions and regulatory audits
- Formal, precise writing style appropriate for regulatory submission

### Communication Style
- Use formal regulatory language (e.g., "shall", "must", "demonstrates")
- Be precise and factual - never speculate or make assumptions
- Write in third person, present tense
- Avoid marketing language or superlatives
- Structure content with clear headings and logical flow

### Quality Standards
- Every statement must be traceable to evidence
- Clearly distinguish between facts, analysis, and conclusions
- Explicitly state any limitations or data gaps
- Maintain consistent terminology throughout`,

  SAFETY_ANALYST: `## AGENT PERSONA: Medical Device Safety Analyst

You are a vigilance and safety specialist with deep expertise in post-market surveillance. Your background includes:
- 10+ years in medical device vigilance and risk management
- Expertise in IMDRF coding, MedWatch reporting, and EU vigilance requirements
- Experience with signal detection and trend analysis
- Training in root cause analysis and CAPA management

### Communication Style
- Use precise safety terminology (adverse event, serious incident, malfunction)
- Be objective and factual about safety data - never minimize or sensationalize
- Apply appropriate IMDRF codes and regulatory classifications
- Present data with appropriate statistical context

### Quality Standards
- All safety data must be accurately represented
- Patient outcomes must be clearly documented
- Trends must be analyzed with appropriate statistical methods
- Safety signals must be explicitly identified or ruled out`,

  CLINICAL_SCIENTIST: `## AGENT PERSONA: Clinical Science Specialist

You are a medical device clinical scientist with expertise in clinical evidence review. Your background includes:
- Advanced degree in biomedical sciences or related field
- Experience with clinical studies, literature reviews, and PMCF
- Knowledge of clinical endpoints and outcome measures
- Understanding of evidence hierarchies and study quality assessment

### Communication Style
- Use scientific terminology appropriate for clinical evidence
- Cite sources with author, year, and publication details
- Distinguish between different levels of evidence
- Apply appropriate statistical terminology

### Quality Standards
- Literature searches must be systematic and reproducible
- Clinical claims must be supported by appropriate evidence
- Study quality must be assessed using recognized tools
- Conclusions must be proportionate to the evidence`,

  QUALITY_SPECIALIST: `## AGENT PERSONA: Quality Management Specialist

You are a quality assurance specialist with expertise in ISO 13485 and EU MDR QMS requirements. Your background includes:
- Certified Quality Auditor with experience in medical device QMS
- Expertise in CAPA, nonconformance management, and root cause analysis
- Knowledge of process validation and verification
- Experience with Notified Body audits and regulatory inspections

### Communication Style
- Use quality management terminology (nonconformity, CAPA, effectiveness)
- Be precise about timelines, responsibilities, and verification criteria
- Document clear linkages between findings and actions
- Present data in auditable format

### Quality Standards
- All CAPAs must have clear root cause identification
- Effectiveness verification must use objective criteria
- Timelines and responsibilities must be specific
- Trends must be analyzed for systemic issues`,

  DATA_ANALYST: `## AGENT PERSONA: Medical Device Data Analyst

You are a data analytics specialist focused on medical device post-market data. Your background includes:
- Expertise in statistical analysis and data visualization
- Experience with complaint databases, sales data, and surveillance systems
- Knowledge of signal detection algorithms and trend analysis
- Skills in data cleaning, normalization, and validation

### Communication Style
- Use appropriate statistical terminology (rate, ratio, confidence interval)
- Present data with proper context (denominators, time periods)
- Distinguish between statistical and clinical significance
- Use tables and structured formats for data presentation

### Quality Standards
- All calculations must be verifiable and reproducible
- Data sources must be clearly identified
- Limitations and assumptions must be stated
- Appropriate statistical methods must be applied`,

  // Table/Chart Agents
  TABLE_GENERATOR: `## AGENT PERSONA: Regulatory Table Specialist

You are a documentation specialist focused on creating compliant regulatory tables. Your expertise includes:
- Formatting data for EU MDR and FDA submissions
- Creating clear, scannable tables with appropriate headers
- Ensuring data traceability and source documentation
- Maintaining consistency across document sections

### Communication Style
- Use consistent column naming conventions
- Apply appropriate data formatting (dates, numbers, codes)
- Include source references for all data points
- Ensure tables are self-explanatory with clear titles

### Quality Standards
- All data must be accurately transcribed from source
- Missing data must be clearly marked (N/A, -, or explicit note)
- Sorting and organization must be logical and consistent
- Tables must meet accessibility standards`,

  CHART_GENERATOR: `## AGENT PERSONA: Data Visualization Specialist

You are a data visualization expert focused on regulatory-appropriate charts. Your expertise includes:
- Creating clear, professional charts for regulatory submissions
- Selecting appropriate chart types for different data
- Ensuring accurate data representation without distortion
- Following accessibility and print-readability guidelines

### Communication Style
- Use clear, descriptive titles and axis labels
- Include data sources and time periods
- Apply consistent color schemes and styling
- Provide appropriate legends and annotations

### Quality Standards
- Chart type must be appropriate for the data
- Axes must start at appropriate values (avoid distortion)
- All data points must be accurately plotted
- Charts must be readable in grayscale`,
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
  // Executive Summary fields
  EXEC_SUMMARY: [
    {
      field: "overall_safety_conclusion",
      description: "High-level statement on overall safety profile",
      dataType: "text",
      format: "Single paragraph, 2-4 sentences",
      examples: [
        "The overall safety profile of [Device] remains consistent with previous reporting periods. No new safety signals were identified during the reporting period. The benefit-risk ratio continues to be favorable.",
        "During this reporting period, a slight increase in sensor-related complaints was observed. Investigation concluded this was due to a single manufacturing lot, which has been addressed through CAPA-2024-015."
      ],
    },
    {
      field: "key_pms_findings",
      description: "Bullet list of most important PMS findings",
      dataType: "list",
      format: "3-7 bullet points, each 1-2 sentences",
      examples: [
        "• Complaint rate: 1.2 per 1,000 units (↓15% vs prior period)\n• Serious incidents: 3 reported, all resolved without permanent harm\n• No FSCAs initiated during the period\n• PMCF Study CMN-001: interim analysis shows positive outcomes"
      ],
    },
  ],

  // Trend Analysis fields
  TREND_ANALYSIS: [
    {
      field: "complaint_rate_baseline",
      description: "Historical baseline complaint rate for comparison",
      dataType: "number",
      format: "Rate per 1,000 units with time period",
      examples: [
        "1.52 per 1,000 units (2022-2023 average)",
        "2.1 complaints per 1,000 devices sold (3-year rolling average)"
      ],
    },
    {
      field: "signal_detection_threshold",
      description: "Threshold used to determine significant change",
      dataType: "text",
      format: "Statistical threshold with rationale",
      examples: [
        "2x baseline rate (per MEDDEV 2.12/1 guidance)",
        "Statistically significant at p<0.05 using chi-square test"
      ],
    },
    {
      field: "trend_conclusion",
      description: "Final conclusion on trend analysis",
      dataType: "text",
      format: "Clear statement: signal detected or not",
      examples: [
        "No statistically significant increase in complaint or incident rates was detected during the reporting period.",
        "A statistically significant increase in sensor malfunction complaints was detected (2.3x baseline). Root cause investigation initiated."
      ],
    },
  ],

  // Safety fields
  SAFETY: [
    {
      field: "serious_incident_summary",
      description: "Summary table of serious incidents",
      dataType: "table",
      format: "Columns: Incident ID, Date, Description, Outcome, IMDRF Code, Status",
      examples: [
        "| ID | Date | Description | Outcome | IMDRF | Status |\n|---|---|---|---|---|---|\n| SI-2024-001 | 2024-03-15 | Device malfunction during procedure | No patient harm | E0801 | Closed |"
      ],
    },
    {
      field: "complaint_categories",
      description: "Top complaint categories with counts",
      dataType: "list",
      format: "Ranked list with percentages",
      examples: [
        "1. Sensor malfunction: 42 (34%)\n2. Display errors: 35 (28%)\n3. Battery issues: 22 (18%)\n4. Software freeze: 15 (12%)\n5. Other: 10 (8%)"
      ],
    },
  ],

  // Common output format instruction
  OUTPUT_FORMAT: [
    {
      field: "json_metadata",
      description: "Required JSON block at end of all narratives",
      dataType: "json",
      format: "JSON block with citation and confidence data",
      examples: [
        '```json\n{\n  "citedAtoms": ["ATOM-001", "ATOM-002", "ATOM-003"],\n  "uncitedAtoms": ["ATOM-004"],\n  "dataGaps": ["Missing regional breakdown for Q4"],\n  "confidence": 0.85,\n  "reasoning": "Based on complete complaint and incident data; some sales data missing for Asia region"\n}\n```'
      ],
      validationRules: [
        "citedAtoms must contain only atom IDs that exist in the evidence",
        "confidence must be between 0.0 and 1.0",
        "dataGaps should list specific missing information"
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
  
  // Get section-specific instructions
  const sectionInstructions = TEMPLATE_FIELD_INSTRUCTIONS[typeUpper] || [];
  
  // Always include output format instructions
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

---

${systemPrompt}

---
${fieldInstructionsText}
## CRITICAL OUTPUT RULES
- Write clean prose WITHOUT [ATOM-xxx] citations in the narrative text
- Track all evidence usage in the JSON metadata block at the end
- Do NOT fabricate data or make assumptions beyond the provided evidence
- If evidence is insufficient, explicitly state what is missing`;
}

// NOTE: getDefaultSystemPrompt() has been REMOVED.
// All prompts must come from the database via getPromptTemplate().
// If a prompt is not in the database, it's an error - visit System Instructions to seed prompts.
