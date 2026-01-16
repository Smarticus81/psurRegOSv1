/**
 * LLM Service - Unified interface for OpenAI and Anthropic
 * 
 * Provides a single API for all LLM operations with:
 * - Automatic fallback between providers
 * - Retry logic with exponential backoff
 * - Token counting and cost estimation
 * - Full traceability for audit
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// Debug/version stamp so we can confirm the running process is using this file
const LLM_SERVICE_BUILD_ID = `llmService:${new Date().toISOString()}`;
let didLogBuildId = false;

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface LLMConfig {
  provider: "openai" | "anthropic" | "auto";
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

const DEFAULT_CONFIG: Required<LLMConfig> = {
  provider: "auto",
  model: "gpt-4o",
  temperature: 0.1,
  maxTokens: 4096,
  timeout: 60000,
  retryCount: 3,
  retryDelay: 1000,
};

// Model mappings - Updated January 2026
// gpt-4o is stable fallback, gpt-4o-mini for fast/cheap
// claude-sonnet-4.5 released Sep 2025, claude-haiku-4.5 released Oct 2025
const OPENAI_MODELS = {
  default: "gpt-4o",
  fast: "gpt-4o-mini",
  powerful: "gpt-4o",
  reasoning: "gpt-4o",
  embedding: "text-embedding-3-small",
} as const;

// Claude models - Sonnet 4.5 (Sep 2025) and Haiku 4.5 (Oct 2025) are SOTA
const ANTHROPIC_MODELS = {
  default: "claude-sonnet-4-5-20250929",
  fast: "claude-haiku-4-5-20251015",
  powerful: "claude-sonnet-4-5-20250929",
  reasoning: "claude-sonnet-4-5-20250929",
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// LLM CLIENTS (Lazy initialization)
// ═══════════════════════════════════════════════════════════════════════════════

let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[LLM] OpenAI API key not configured");
    return null;
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[LLM] Anthropic API key not configured");
    return null;
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REQUEST/RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  config?: Partial<LLMConfig>;
  responseFormat?: "text" | "json";
  agentId?: string;
  traceContext?: {
    psurCaseId?: number;
    slotId?: string;
    operation?: string;
  };
}

export interface LLMResponse {
  content: string;
  provider: "openai" | "anthropic";
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  cost?: number;
  traceData: {
    requestId: string;
    timestamp: string;
    agentId?: string;
    operation?: string;
  };
}

export interface LLMError {
  code: string;
  message: string;
  provider?: string;
  retryable: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

export const PROMPT_TEMPLATES = {
  // Document Ingestion Prompts
  SEVERITY_CLASSIFICATION: `You are a medical device safety expert classifying complaint severity.

Based on the complaint description, classify the severity according to EU MDR definitions.

Complaint Description: {description}
Device Type: {deviceType}
Patient Outcome (if mentioned): {outcome}

Classify as one of:
- CRITICAL: Life-threatening, death, permanent impairment
- HIGH: Serious injury requiring hospitalization
- MEDIUM: Temporary injury, medical intervention needed
- LOW: Minor issue, no medical intervention
- INFORMATIONAL: Feedback, no safety concern

Respond ONLY with valid JSON:
{
  "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFORMATIONAL",
  "isAdverseEvent": boolean,
  "isSeriousIncident": boolean,
  "reasoning": "Brief explanation",
  "confidence": 0.0-1.0
}`,

  FIELD_MAPPING_RESOLUTION: `You are a data mapping expert for medical device regulatory documents.

Given a source column name and sample values, determine the best target field.

Source Column: {sourceColumn}
Sample Values: {sampleValues}
Target Schema Fields: {targetFields}

Analyze the column name semantics and data patterns to determine the mapping.

Respond ONLY with valid JSON:
{
  "targetField": "field_name or null if no match",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "alternatives": [{"field": "...", "confidence": 0.0-1.0}]
}`,

  EVIDENCE_EXTRACTION: `You are extracting structured evidence from a medical device document section.

Document Type: {documentType}
Section Title: {sectionTitle}
Section Content:
{content}

Target Evidence Type: {evidenceType}
Required Fields: {requiredFields}

Extract all relevant evidence records from this section. Each record should include all required fields where available.

Respond ONLY with valid JSON:
{
  "records": [
    {
      "field1": "value1",
      "field2": "value2",
      ...
    }
  ],
  "extractionConfidence": 0.0-1.0,
  "warnings": ["any issues or missing data"],
  "sourceLocations": ["paragraph 1", "table 2", etc]
}`,

  // Runtime Agent Prompts
  NARRATIVE_GENERATION: `You are writing a section of a Periodic Safety Update Report (PSUR) for a medical device under EU MDR regulations.

## Section: {slotTitle}
## Section Requirements: {slotRequirements}
## Template Guidance: {templateGuidance}

## Evidence Summary:
{evidenceSummary}

## Detailed Evidence Records:
{evidenceRecords}

## INSTRUCTIONS:
1. Write in formal regulatory tone appropriate for submission to Notified Bodies
2. Reference ALL evidence by atom ID using format [ATOM-xxx]
3. Include specific numbers, dates, and statistics from the evidence
4. State conclusions based ONLY on provided evidence
5. If evidence is missing or incomplete, explicitly state what is unavailable
6. Do NOT fabricate or assume any data not present in the evidence

## OUTPUT FORMAT:
Write the narrative section content. After the narrative, provide a JSON block:
\`\`\`json
{
  "citedAtoms": ["ATOM-xxx", ...],
  "uncitedAtoms": ["ATOM-yyy", ...],
  "dataGaps": ["description of missing data", ...],
  "confidence": 0.0-1.0,
  "reasoning": "explanation of content decisions"
}
\`\`\``,

  TABLE_FORMATTING: `You are formatting evidence data into a regulatory-compliant table for a PSUR.

## Table Type: {tableType}
## Column Definitions: {columns}

## Evidence Data:
{evidenceData}

Format the data into a clean, well-organized table. Ensure:
1. All required columns are present
2. Data is sorted appropriately (typically by date descending or ID)
3. Missing values are marked as "-" or "N/A"
4. Each row includes its source atom ID

Respond with the formatted table in markdown format.`,

  BENEFIT_RISK_CONCLUSION: `You are writing the benefit-risk conclusion for a medical device PSUR.

## Device Information:
{deviceInfo}

## Safety Summary:
- Total complaints: {complaintCount}
- Serious incidents: {incidentCount}
- FSCAs issued: {fscaCount}
- Deaths/serious injuries: {seriousOutcomes}

## Clinical Evidence:
{clinicalSummary}

## Risk Assessment:
{riskSummary}

Write a regulatory-appropriate benefit-risk conclusion that:
1. Summarizes known benefits based on clinical evidence
2. Summarizes known and potential risks based on PMS data
3. Concludes whether the benefit-risk profile remains favorable
4. Identifies any actions needed or changes from previous assessment

Respond with the conclusion narrative followed by:
\`\`\`json
{
  "benefitRiskStatus": "FAVORABLE|ACCEPTABLE|UNFAVORABLE|REQUIRES_ACTION",
  "keyFindings": ["finding1", ...],
  "recommendedActions": ["action1", ...],
  "confidence": 0.0-1.0
}
\`\`\``,

  GAP_JUSTIFICATION: `You are generating a regulatory justification for missing evidence in a PSUR.

## Missing Evidence Type: {evidenceType}
## Slot Requirement: {slotRequirement}
## Available Context: {context}
## Reporting Period: {period}

Generate a regulatory-appropriate justification that:
1. Acknowledges what evidence is expected
2. Explains why it is not available (if applicable)
3. States any mitigating factors
4. References any alternative evidence or data sources used

Keep the justification concise but sufficient for regulatory review.

Respond with the justification text followed by:
\`\`\`json
{
  "justificationType": "NO_DATA_AVAILABLE|NOT_APPLICABLE|ALTERNATIVE_USED|PENDING",
  "acceptableForRegulator": boolean,
  "confidence": 0.0-1.0
}
\`\`\``,

  COMPLIANCE_CHECK: `You are validating PSUR content against regulatory requirements.

## Requirement: {requirementText}
## Source: {sourceArticle}
## Content Being Validated:
{content}

Evaluate whether the content satisfies the regulatory requirement.

Respond ONLY with valid JSON:
{
  "satisfied": boolean,
  "reasoning": "Brief explanation",
  "missingElements": ["element1", ...],
  "suggestions": ["suggestion1", ...],
  "confidence": 0.0-1.0
}`,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// CORE LLM FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main entry point for LLM completions
 */
export async function complete(request: LLMRequest): Promise<LLMResponse> {
  if (!didLogBuildId) {
    didLogBuildId = true;
    console.log(`[LLM] Loaded ${LLM_SERVICE_BUILD_ID}`);
  }

  // Merge config, filtering out undefined values from request.config
  const requestConfig = request.config || {};
  const filteredConfig = Object.fromEntries(
    Object.entries(requestConfig).filter(([_, v]) => v !== undefined)
  );
  const config = { ...DEFAULT_CONFIG, ...filteredConfig } as Required<LLMConfig>;
  
  // Ensure model is always defined (defensive)
  if (!config.model || typeof config.model !== "string") {
    config.model = DEFAULT_CONFIG.model;
  }
  
  const startTime = Date.now();
  const requestId = `llm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  let lastError: Error | null = null;

  // Determine provider order
  const providers = getProviderOrder(config.provider);

  for (const provider of providers) {
    for (let attempt = 0; attempt < config.retryCount; attempt++) {
      try {
        const response = await executeCompletion(provider, request, config);
        
        return {
          ...response,
          latencyMs: Date.now() - startTime,
          traceData: {
            requestId,
            timestamp: new Date().toISOString(),
            agentId: request.agentId,
            operation: request.traceContext?.operation,
          },
        };
      } catch (error: any) {
        lastError = error;
        const errMsg = error?.message || String(error);
        const errStack = error?.stack || "(no stack)";
        console.warn(`[LLM] ${provider} attempt ${attempt + 1} failed:`, errMsg);
        console.warn(`[LLM] ${provider} attempt ${attempt + 1} stack:`, errStack);
        console.warn(`[LLM] ${provider} attempt ${attempt + 1} config:`, {
          providerPreference: config.provider,
          model: config.model,
          modelType: typeof config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          responseFormat: request.responseFormat,
          agentId: request.agentId,
          traceContext: request.traceContext,
        });
        
        if (attempt < config.retryCount - 1) {
          await sleep(config.retryDelay * Math.pow(2, attempt));
        }
      }
    }
  }

  throw lastError || new Error("All LLM providers failed");
}

/**
 * Generate embeddings for text
 */
export async function embed(text: string): Promise<number[]> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error("OpenAI client not available for embeddings");
  }

  const response = await client.embeddings.create({
    model: OPENAI_MODELS.embedding,
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Structured JSON completion with parsing
 */
export async function completeJSON<T>(
  request: LLMRequest,
  validator?: (data: unknown) => data is T
): Promise<{ data: T; response: LLMResponse }> {
  const response = await complete({
    ...request,
    responseFormat: "json",
    messages: request.messages.map(m => ({
      ...m,
      content: m.role === "system" 
        ? m.content + "\n\nRespond ONLY with valid JSON. No additional text."
        : m.content,
    })),
  });

  // Extract JSON from response
  let jsonContent = response.content;
  
  // Try to extract JSON from markdown code blocks
  const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1].trim();
  }

  try {
    const data = JSON.parse(jsonContent);
    
    if (validator && !validator(data)) {
      throw new Error("Response failed validation");
    }

    return { data, response };
  } catch (parseError) {
    throw new Error(`Failed to parse LLM JSON response: ${parseError}`);
  }
}

/**
 * Apply a prompt template with variables
 */
export function applyTemplate(
  template: string,
  variables: Record<string, string | number | boolean | object>
): string {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    const stringValue = typeof value === "object" 
      ? JSON.stringify(value, null, 2) 
      : String(value);
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), stringValue);
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getProviderOrder(preference: string): ("openai" | "anthropic")[] {
  const openaiAvailable = !!process.env.OPENAI_API_KEY;
  const anthropicAvailable = !!process.env.ANTHROPIC_API_KEY;

  if (preference === "openai" && openaiAvailable) {
    return anthropicAvailable ? ["openai", "anthropic"] : ["openai"];
  }
  
  if (preference === "anthropic" && anthropicAvailable) {
    return openaiAvailable ? ["anthropic", "openai"] : ["anthropic"];
  }

  // Auto: prefer OpenAI, fallback to Anthropic
  const order: ("openai" | "anthropic")[] = [];
  if (openaiAvailable) order.push("openai");
  if (anthropicAvailable) order.push("anthropic");
  
  if (order.length === 0) {
    throw new Error("No LLM provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env");
  }

  return order;
}

async function executeCompletion(
  provider: "openai" | "anthropic",
  request: LLMRequest,
  config: Required<LLMConfig>
): Promise<Omit<LLMResponse, "latencyMs" | "traceData">> {
  if (provider === "openai") {
    return executeOpenAI(request, config);
  } else {
    return executeAnthropic(request, config);
  }
}

async function executeOpenAI(
  request: LLMRequest,
  config: Required<LLMConfig>
): Promise<Omit<LLMResponse, "latencyMs" | "traceData">> {
  const client = getOpenAIClient();
  if (!client) throw new Error("OpenAI client not available");

  // Defensive: ensure model is always a valid string
  const modelName = config.model && typeof config.model === "string" 
    ? config.model 
    : OPENAI_MODELS.default;
  const model = modelName.startsWith("gpt") || modelName.startsWith("o1") || modelName.startsWith("o3")
    ? modelName 
    : OPENAI_MODELS.default;

  const response = await client.chat.completions.create({
    model,
    messages: request.messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    response_format: request.responseFormat === "json" ? { type: "json_object" } : undefined,
  });

  const choice = response.choices[0];
  
  return {
    content: choice.message.content || "",
    provider: "openai",
    model: response.model,
    usage: {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
    },
    cost: calculateCost("openai", response.model, response.usage),
  };
}

async function executeAnthropic(
  request: LLMRequest,
  config: Required<LLMConfig>
): Promise<Omit<LLMResponse, "latencyMs" | "traceData">> {
  const client = getAnthropicClient();
  if (!client) throw new Error("Anthropic client not available");

  // Defensive: ensure model is always a valid string
  const modelName = config.model && typeof config.model === "string"
    ? config.model
    : ANTHROPIC_MODELS.default;
  const model = modelName.startsWith("claude") ? modelName : ANTHROPIC_MODELS.default;

  // Extract system message
  const systemMessage = request.messages.find(m => m.role === "system");
  const userMessages = request.messages.filter(m => m.role !== "system");

  const response = await client.messages.create({
    model,
    max_tokens: config.maxTokens,
    system: systemMessage?.content,
    messages: userMessages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const textContent = response.content.find(c => c.type === "text");
  
  return {
    content: textContent?.type === "text" ? textContent.text : "",
    provider: "anthropic",
    model: response.model,
    usage: {
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    },
    cost: calculateCost("anthropic", response.model, {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
    }),
  };
}

function calculateCost(
  provider: string,
  model: string,
  usage?: { prompt_tokens?: number; completion_tokens?: number }
): number {
  if (!usage) return 0;

  // Approximate costs per 1K tokens (as of January 2026)
  const costs: Record<string, { input: number; output: number }> = {
    // OpenAI models
    "gpt-4o": { input: 0.005, output: 0.015 },
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    // Anthropic Claude 4.5 family (Sep-Oct 2025)
    "claude-sonnet-4-5-20250929": { input: 0.003, output: 0.015 },
    "claude-haiku-4-5-20251015": { input: 0.001, output: 0.005 },
  };

  const modelCosts = costs[model] || costs["gpt-4o"];
  const inputCost = ((usage.prompt_tokens || 0) / 1000) * modelCosts.input;
  const outputCost = ((usage.completion_tokens || 0) / 1000) * modelCosts.output;

  return inputCost + outputCost;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

export async function checkLLMHealth(): Promise<{
  openai: { available: boolean; error?: string };
  anthropic: { available: boolean; error?: string };
}> {
  const results = {
    openai: { available: false, error: undefined as string | undefined },
    anthropic: { available: false, error: undefined as string | undefined },
  };

  // Check OpenAI
  try {
    const client = getOpenAIClient();
    if (client) {
      await client.models.list();
      results.openai.available = true;
    } else {
      results.openai.error = "API key not configured";
    }
  } catch (error: any) {
    results.openai.error = error.message;
  }

  // Check Anthropic
  try {
    const client = getAnthropicClient();
    if (client) {
      // Anthropic doesn't have a models endpoint, so we'll just check the client exists
      results.anthropic.available = true;
    } else {
      results.anthropic.error = "API key not configured";
    }
  } catch (error: any) {
    results.anthropic.error = error.message;
  }

  return results;
}
