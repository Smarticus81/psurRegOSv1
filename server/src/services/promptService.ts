/**
 * Prompt Service - Database-backed prompt management
 * 
 * SINGLE SOURCE OF TRUTH: All prompts come from the database.
 * This service handles retrieval, caching, and seeding.
 * 
 * The System Instructions UI edits prompts in the database.
 * Agents retrieve prompts from here - no hardcoded fallbacks.
 */

import { db } from "../../db";
import { systemInstructions } from "@shared/schema";
import { eq } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PromptRecord {
  key: string;
  category: string;
  description: string;
  template: string;
  defaultTemplate: string;
  version: number;
  variables: string[];
  updatedBy: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE (Optional - for performance)
// ═══════════════════════════════════════════════════════════════════════════════

let promptCache: Map<string, string> = new Map();
let cacheInitialized = false;
let lastCacheRefresh = 0;
const CACHE_TTL_MS = 30000; // 30 seconds - short TTL so edits appear quickly

/**
 * Clear the prompt cache (call after edits)
 */
export function clearPromptCache(): void {
  promptCache.clear();
  cacheInitialized = false;
  lastCacheRefresh = 0;
  console.log("[PromptService] Cache cleared");
}

/**
 * Refresh the cache from database
 */
async function refreshCache(): Promise<void> {
  try {
    const allPrompts = await db.select().from(systemInstructions);
    promptCache.clear();
    for (const prompt of allPrompts) {
      if (prompt.template) {
        promptCache.set(prompt.key, prompt.template);
      }
    }
    cacheInitialized = true;
    lastCacheRefresh = Date.now();
    console.log(`[PromptService] Cache refreshed with ${promptCache.size} prompts`);
  } catch (error) {
    console.error("[PromptService] Failed to refresh cache:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get a prompt by key from the database
 * 
 * This is the ONLY way agents should get prompts.
 * If the prompt doesn't exist, returns null - agents must handle this.
 */
export async function getPrompt(key: string): Promise<string | null> {
  // Check cache first (if fresh)
  if (cacheInitialized && Date.now() - lastCacheRefresh < CACHE_TTL_MS) {
    const cached = promptCache.get(key);
    if (cached) {
      return cached;
    }
  }

  // Query database directly
  try {
    const result = await db
      .select()
      .from(systemInstructions)
      .where(eq(systemInstructions.key, key))
      .limit(1);

    if (result.length > 0 && result[0].template) {
      // Update cache
      promptCache.set(key, result[0].template);
      return result[0].template;
    }
  } catch (error) {
    console.error(`[PromptService] Failed to get prompt '${key}':`, error);
  }

  console.warn(`[PromptService] Prompt not found: ${key}`);
  return null;
}

/**
 * Get a prompt with a required guarantee - throws if not found
 */
export async function getPromptRequired(key: string): Promise<string> {
  const prompt = await getPrompt(key);
  if (!prompt) {
    throw new Error(`[PromptService] Required prompt not found: ${key}. Ensure database is seeded.`);
  }
  return prompt;
}

/**
 * Get multiple prompts at once (batch operation)
 */
export async function getPrompts(keys: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  // Refresh cache if stale
  if (!cacheInitialized || Date.now() - lastCacheRefresh >= CACHE_TTL_MS) {
    await refreshCache();
  }

  for (const key of keys) {
    const prompt = promptCache.get(key);
    if (prompt) {
      results.set(key, prompt);
    }
  }

  return results;
}

/**
 * Check if a prompt exists in the database
 */
export async function promptExists(key: string): Promise<boolean> {
  try {
    const result = await db
      .select({ key: systemInstructions.key })
      .from(systemInstructions)
      .where(eq(systemInstructions.key, key))
      .limit(1);
    return result.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Get all prompt keys currently in the database
 */
export async function getAllPromptKeys(): Promise<string[]> {
  try {
    const result = await db
      .select({ key: systemInstructions.key })
      .from(systemInstructions);
    return result.map(r => r.key);
  } catch (error) {
    console.error("[PromptService] Failed to get prompt keys:", error);
    return [];
  }
}

/**
 * Update a prompt in the database
 */
export async function updatePrompt(
  key: string, 
  template: string, 
  updatedBy: string = "system"
): Promise<void> {
  try {
    await db
      .update(systemInstructions)
      .set({
        template,
        lastUpdated: new Date(),
        updatedBy,
        version: db.raw("version + 1") as any,
      })
      .where(eq(systemInstructions.key, key));

    // Clear cache so next read gets fresh data
    clearPromptCache();
  } catch (error) {
    console.error(`[PromptService] Failed to update prompt '${key}':`, error);
    throw error;
  }
}

/**
 * Reset a prompt to its default value
 */
export async function resetPromptToDefault(key: string): Promise<void> {
  try {
    const result = await db
      .select({ defaultTemplate: systemInstructions.defaultTemplate })
      .from(systemInstructions)
      .where(eq(systemInstructions.key, key))
      .limit(1);

    if (result.length > 0 && result[0].defaultTemplate) {
      await db
        .update(systemInstructions)
        .set({
          template: result[0].defaultTemplate,
          lastUpdated: new Date(),
          updatedBy: "system",
          version: db.raw("version + 1") as any,
        })
        .where(eq(systemInstructions.key, key));
      
      clearPromptCache();
    }
  } catch (error) {
    console.error(`[PromptService] Failed to reset prompt '${key}':`, error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize the prompt service (load cache)
 * Called on server startup after database connection is ready
 */
export async function initializePromptService(): Promise<void> {
  console.log("[PromptService] Initializing...");
  await refreshCache();
  console.log("[PromptService] Initialized successfully");
}
