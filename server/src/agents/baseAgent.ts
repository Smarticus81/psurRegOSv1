/**
 * Base Agent - Foundation class for all AI agents
 * 
 * Provides:
 * - Lifecycle management (spawn, initialize, execute, terminate)
 * - Decision trace integration
 * - LLM invocation with tracing
 * - Configuration management
 * - Error handling with recovery
 */

import { v4 as uuidv4 } from "uuid";
import { complete, completeJSON, LLMRequest, LLMResponse, applyTemplate, PROMPT_TEMPLATES } from "./llmService";
import { 
  logTraceEvent, 
  TraceContext, 
  TraceEventInput,
} from "../services/decisionTraceService";
import { 
  traceContentElement,
  traceContentBatch,
  ContentTraceInput,
  ContentType,
  CalculationType,
} from "../services/contentTraceService";
import { DecisionTraceEventType } from "@shared/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT TYPES AND INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export type AgentStatus = "IDLE" | "INITIALIZING" | "RUNNING" | "COMPLETED" | "FAILED" | "TERMINATED";

export interface AgentConfig {
  agentType: string;
  name: string;
  
  llm: {
    provider: "openai" | "anthropic" | "auto";
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  
  behavior: {
    maxRetries: number;
    retryDelayMs: number;
    timeoutMs: number;
    confidenceThreshold: number;
  };
  
  tracing: {
    verbosity: "minimal" | "standard" | "verbose";
    logLLMContent: boolean;
    logIntermediateSteps: boolean;
  };
}

export interface AgentContext {
  psurCaseId: number;
  traceCtx: TraceContext;
  templateId?: string;
  slotId?: string;
  deviceCode?: string;
  periodStart?: string;
  periodEnd?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  confidence: number;
  warnings: string[];
  
  // Execution metadata
  executionTime: number;
  llmCalls: number;
  tokensUsed: number;
  cost: number;
  
  // Trace
  traceEvents: string[];
}

export interface LLMCallResult<T = string> {
  content: T;
  response: LLMResponse;
  traceEventId: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  agentType: "BaseAgent",
  name: "Unnamed Agent",
  
  llm: {
    provider: "auto",
    model: "gpt-4o",
    temperature: 0.1,
    maxTokens: 4096,
  },
  
  behavior: {
    maxRetries: 3,
    retryDelayMs: 1000,
    timeoutMs: 120000,
    confidenceThreshold: 0.7,
  },
  
  tracing: {
    verbosity: "standard",
    logLLMContent: true,
    logIntermediateSteps: true,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// BASE AGENT CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
  readonly agentId: string;
  readonly config: AgentConfig;
  
  protected context: AgentContext | null = null;
  protected status: AgentStatus = "IDLE";
  protected startTime: number = 0;
  
  // Execution metrics
  protected llmCallCount: number = 0;
  protected totalTokens: number = 0;
  protected totalCost: number = 0;
  protected traceEventIds: string[] = [];
  protected warnings: string[] = [];

  constructor(config?: Partial<AgentConfig>) {
    this.agentId = `${config?.agentType || "Agent"}-${uuidv4().substring(0, 8)}`;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // LIFECYCLE METHODS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Spawn and run the agent
   */
  async run(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>> {
    this.context = context;
    this.startTime = Date.now();
    this.status = "INITIALIZING";

    try {
      // Log agent spawn
      await this.logTrace("AGENT_SPAWNED", "INFO", undefined, undefined, {
        agentType: this.config.agentType,
        agentName: this.config.name,
      });

      // Initialize
      await this.initialize(input);
      this.status = "RUNNING";

      await this.logTrace("AGENT_INITIALIZED", "INFO", undefined, undefined, {
        inputSummary: this.summarizeInput(input),
      });

      // Execute main logic
      const output = await this.execute(input);

      this.status = "COMPLETED";

      // Log completion
      await this.logTrace("AGENT_COMPLETED", "PASS", undefined, undefined, {
        outputSummary: this.summarizeOutput(output),
        executionTimeMs: Date.now() - this.startTime,
        llmCalls: this.llmCallCount,
        tokensUsed: this.totalTokens,
      });

      return {
        success: true,
        data: output,
        confidence: this.calculateConfidence(output),
        warnings: this.warnings,
        executionTime: Date.now() - this.startTime,
        llmCalls: this.llmCallCount,
        tokensUsed: this.totalTokens,
        cost: this.totalCost,
        traceEvents: this.traceEventIds,
      };

    } catch (error: any) {
      this.status = "FAILED";

      await this.logTrace("AGENT_FAILED", "FAIL", undefined, undefined, {
        error: error.message,
        stack: error.stack?.substring(0, 500),
      }, [error.message]);

      return {
        success: false,
        error: error.message,
        confidence: 0,
        warnings: this.warnings,
        executionTime: Date.now() - this.startTime,
        llmCalls: this.llmCallCount,
        tokensUsed: this.totalTokens,
        cost: this.totalCost,
        traceEvents: this.traceEventIds,
      };

    } finally {
      await this.cleanup();
      this.status = "TERMINATED";
    }
  }

  /**
   * Initialize agent - override in subclasses for setup
   */
  protected async initialize(input: TInput): Promise<void> {
    // Default: no-op. Override in subclasses.
  }

  /**
   * Main execution logic - MUST be implemented by subclasses
   */
  protected abstract execute(input: TInput): Promise<TOutput>;

  /**
   * Cleanup - override in subclasses for teardown
   */
  protected async cleanup(): Promise<void> {
    // Default: no-op. Override in subclasses.
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // LLM INVOCATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Make an LLM call with full tracing
   */
  protected async invokeLLM(
    systemPrompt: string,
    userPrompt: string,
    options?: {
      operation?: string;
      entityType?: string;
      entityId?: string;
    }
  ): Promise<LLMCallResult<string>> {
    const operation = options?.operation || "LLM_CALL";

    // Log invocation start
    const invokeEventId = await this.logTrace("LLM_INVOKED", "INFO", options?.entityType, options?.entityId, {
      operation,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      ...(this.config.tracing.logLLMContent && this.config.tracing.verbosity === "verbose" ? {
        systemPrompt: systemPrompt.substring(0, 500),
        userPrompt: userPrompt.substring(0, 500),
      } : {}),
    });

    try {
      const response = await complete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        config: {
          provider: this.config.llm.provider,
          model: this.config.llm.model,
          temperature: this.config.llm.temperature,
          maxTokens: this.config.llm.maxTokens,
        },
        agentId: this.agentId,
        traceContext: {
          psurCaseId: this.context?.psurCaseId,
          slotId: this.context?.slotId,
          operation,
        },
      });

      // Update metrics
      this.llmCallCount++;
      this.totalTokens += response.usage.totalTokens;
      this.totalCost += response.cost || 0;

      // Log response
      const responseEventId = await this.logTrace("LLM_RESPONSE_RECEIVED", "INFO", options?.entityType, options?.entityId, {
        operation,
        model: response.model,
        provider: response.provider,
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        latencyMs: response.latencyMs,
        cost: response.cost,
        ...(this.config.tracing.logLLMContent ? {
          contentPreview: response.content.substring(0, 200),
        } : {}),
      });

      return {
        content: response.content,
        response,
        traceEventId: responseEventId,
      };

    } catch (error: any) {
      await this.logTrace("LLM_INVOKED", "FAIL", options?.entityType, options?.entityId, {
        operation,
        error: error.message,
      }, [error.message]);

      throw error;
    }
  }

  /**
   * Make an LLM call expecting JSON response
   */
  protected async invokeLLMForJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    validator?: (data: unknown) => data is T,
    options?: {
      operation?: string;
      entityType?: string;
      entityId?: string;
    }
  ): Promise<LLMCallResult<T>> {
    const operation = options?.operation || "LLM_JSON_CALL";

    // Log invocation
    await this.logTrace("LLM_INVOKED", "INFO", options?.entityType, options?.entityId, {
      operation,
      expectingJSON: true,
    });

    try {
      const { data, response } = await completeJSON<T>(
        {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          config: {
            provider: this.config.llm.provider,
            model: this.config.llm.model,
            temperature: this.config.llm.temperature,
            maxTokens: this.config.llm.maxTokens,
          },
          agentId: this.agentId,
        },
        validator
      );

      // Update metrics
      this.llmCallCount++;
      this.totalTokens += response.usage.totalTokens;
      this.totalCost += response.cost || 0;

      // Log response
      const responseEventId = await this.logTrace("LLM_RESPONSE_RECEIVED", "INFO", options?.entityType, options?.entityId, {
        operation,
        model: response.model,
        provider: response.provider,
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        latencyMs: response.latencyMs,
        parsedSuccessfully: true,
        ...(this.config.tracing.verbosity === "verbose" ? {
          parsedData: data,
        } : {}),
      });

      return {
        content: data,
        response,
        traceEventId: responseEventId,
      };

    } catch (error: any) {
      await this.logTrace("LLM_INVOKED", "FAIL", options?.entityType, options?.entityId, {
        operation,
        error: error.message,
        parseError: true,
      }, [error.message]);

      throw error;
    }
  }

  /**
   * Apply a prompt template
   */
  protected applyTemplate(
    templateKey: keyof typeof PROMPT_TEMPLATES,
    variables: Record<string, string | number | boolean | object>
  ): string {
    return applyTemplate(PROMPT_TEMPLATES[templateKey], variables);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DECISION TRACING
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Log a decision with full context
   */
  protected async logDecision(
    decisionType: string,
    options: Array<{ option: string; score: number; reasoning: string }>,
    selected: string,
    confidence: number,
    reasoning: string,
    entityType?: string,
    entityId?: string
  ): Promise<string> {
    return this.logTrace("DECISION_MADE", confidence >= this.config.behavior.confidenceThreshold ? "PASS" : "INFO", 
      entityType, entityId, {
        decisionType,
        options,
        selected,
        confidence,
        reasoning,
      }, [reasoning]);
  }

  /**
   * Log a trace event
   */
  protected async logTrace(
    eventType: DecisionTraceEventType,
    decision: string,
    entityType?: string,
    entityId?: string,
    outputData?: Record<string, unknown>,
    reasons?: string[]
  ): Promise<string> {
    if (!this.context?.traceCtx) {
      console.warn(`[${this.agentId}] No trace context available`);
      return "";
    }

    try {
      const result = await logTraceEvent(this.context.traceCtx, {
        eventType,
        actor: this.agentId,
        decision,
        entityType,
        entityId,
        inputData: { agentType: this.config.agentType, agentName: this.config.name },
        outputData,
        reasons,
      });

      this.traceEventIds.push(String(result.entry.id));
      return String(result.entry.id);
    } catch (error) {
      console.error(`[${this.agentId}] Failed to log trace:`, error);
      return "";
    }
  }

  /**
   * Add a warning
   */
  protected addWarning(warning: string): void {
    this.warnings.push(warning);
    console.warn(`[${this.agentId}] Warning: ${warning}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONTENT TRACING (Granular element-level tracing)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Trace a single content element (sentence, paragraph, table cell, etc.)
   */
  protected async traceContent(input: {
    slotId: string;
    slotTitle?: string;
    contentType: ContentType;
    contentId: string;
    contentIndex: number;
    contentPreview: string;
    rationale: string;
    methodology: string;
    standardReference?: string;
    evidenceType?: string;
    atomIds?: string[];
    sourceDocument?: string;
    obligationId?: string;
    obligationTitle?: string;
    jurisdictions?: string[];
    calculationType?: CalculationType;
    calculationFormula?: string;
    calculationInputs?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.context?.psurCaseId) {
      console.warn(`[${this.agentId}] Cannot trace content - no psurCaseId`);
      return;
    }

    try {
      await traceContentElement({
        psurCaseId: this.context.psurCaseId,
        ...input,
        agentId: this.agentId,
        agentName: this.config.name,
      });
    } catch (error) {
      console.error(`[${this.agentId}] Failed to trace content:`, error);
    }
  }

  /**
   * Trace multiple content elements in batch (more efficient)
   */
  protected async traceContentBatch(items: Array<{
    slotId: string;
    slotTitle?: string;
    contentType: ContentType;
    contentId: string;
    contentIndex: number;
    contentPreview: string;
    rationale: string;
    methodology: string;
    standardReference?: string;
    evidenceType?: string;
    atomIds?: string[];
    sourceDocument?: string;
    obligationId?: string;
    obligationTitle?: string;
    jurisdictions?: string[];
    calculationType?: CalculationType;
    calculationFormula?: string;
    calculationInputs?: Record<string, unknown>;
  }>): Promise<void> {
    if (!this.context?.psurCaseId) {
      console.warn(`[${this.agentId}] Cannot trace content batch - no psurCaseId`);
      return;
    }

    try {
      const inputs = items.map(item => ({
        psurCaseId: this.context!.psurCaseId,
        ...item,
        agentId: this.agentId,
        agentName: this.config.name,
      }));
      await traceContentBatch(inputs);
    } catch (error) {
      console.error(`[${this.agentId}] Failed to trace content batch:`, error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPERS (Override in subclasses for custom behavior)
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Summarize input for tracing
   */
  protected summarizeInput(input: TInput): string {
    if (typeof input === "string") return input.substring(0, 100);
    if (Array.isArray(input)) return `Array[${input.length}]`;
    if (typeof input === "object") return JSON.stringify(input).substring(0, 100);
    return String(input);
  }

  /**
   * Summarize output for tracing
   */
  protected summarizeOutput(output: TOutput): string {
    if (typeof output === "string") return output.substring(0, 100);
    if (Array.isArray(output)) return `Array[${output.length}]`;
    if (typeof output === "object") return JSON.stringify(output).substring(0, 100);
    return String(output);
  }

  /**
   * Calculate confidence for the result
   */
  protected calculateConfidence(output: TOutput): number {
    // Default: high confidence if we got here without errors
    return 0.9;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════════

  getStatus(): AgentStatus {
    return this.status;
  }

  getMetrics(): { llmCalls: number; tokens: number; cost: number } {
    return {
      llmCalls: this.llmCallCount,
      tokens: this.totalTokens,
      cost: this.totalCost,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create agent config with defaults (deep merges nested objects)
 */
export function createAgentConfig(
  agentType: string,
  name: string,
  overrides?: Partial<AgentConfig>
): AgentConfig {
  return {
    ...DEFAULT_AGENT_CONFIG,
    agentType,
    name,
    llm: {
      ...DEFAULT_AGENT_CONFIG.llm,
      ...overrides?.llm,
    },
    behavior: {
      ...DEFAULT_AGENT_CONFIG.behavior,
      ...overrides?.behavior,
    },
    tracing: {
      ...DEFAULT_AGENT_CONFIG.tracing,
      ...overrides?.tracing,
    },
  };
}
