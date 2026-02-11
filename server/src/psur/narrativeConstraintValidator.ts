/**
 * NARRATIVE CONSTRAINT VALIDATOR
 *
 * Post-generation validator that checks narrative content against
 * MUST_STATE / MUST_CONCLUDE requirements from Annex I obligations.
 *
 * Uses keyword/phrase matching for fast path, flags missing critical
 * constraints for review.
 */

import type { SlotObligationContext, NarrativeConstraintWithData } from "./psurAnalyticsContext";

// ============================================================================
// TYPES
// ============================================================================

export interface ConstraintValidationResult {
  slotId: string;
  totalConstraints: number;
  satisfiedConstraints: number;
  missingConstraints: MissingConstraint[];
  overallPassed: boolean;
  score: number; // 0-100
}

export interface MissingConstraint {
  type: "MUST_STATE" | "MUST_CONCLUDE" | "MUST_REFERENCE" | "MUST_NOT_STATE";
  requiredText: string;
  severity: "CRITICAL" | "WARNING";
  suggestion: string;
}

// ============================================================================
// VALIDATOR
// ============================================================================

/**
 * Validates that a narrative section satisfies the MUST_STATE and MUST_CONCLUDE
 * constraints defined by Annex I obligations.
 *
 * Fast-path uses keyword/phrase matching. Does not use LLM.
 */
export function validateNarrativeConstraints(
  slotId: string,
  content: string,
  slotObligations?: SlotObligationContext
): ConstraintValidationResult {
  if (!slotObligations || slotObligations.narrativeConstraints.length === 0) {
    return {
      slotId,
      totalConstraints: 0,
      satisfiedConstraints: 0,
      missingConstraints: [],
      overallPassed: true,
      score: 100,
    };
  }

  const constraints = slotObligations.narrativeConstraints;
  const normalizedContent = content.toLowerCase();
  const missingConstraints: MissingConstraint[] = [];
  let satisfied = 0;

  for (const constraint of constraints) {
    // Skip constraints whose conditions aren't met
    if (!constraint.conditionMet) {
      satisfied++;
      continue;
    }

    const isSatisfied = checkConstraint(normalizedContent, constraint);
    if (isSatisfied) {
      satisfied++;
    } else {
      const severity = constraint.type === "MUST_STATE" || constraint.type === "MUST_CONCLUDE"
        ? "CRITICAL"
        : "WARNING";

      const reqText = constraint.requiredText || constraint.condition || "";
      missingConstraints.push({
        type: constraint.type,
        requiredText: reqText,
        severity,
        suggestion: `Add a statement addressing: "${reqText}"`,
      });
    }
  }

  const totalConstraints = constraints.length;
  const score = totalConstraints > 0
    ? Math.round((satisfied / totalConstraints) * 100)
    : 100;

  return {
    slotId,
    totalConstraints,
    satisfiedConstraints: satisfied,
    missingConstraints,
    overallPassed: missingConstraints.filter(c => c.severity === "CRITICAL").length === 0,
    score,
  };
}

// ============================================================================
// KEYWORD MATCHING
// ============================================================================

function checkConstraint(
  normalizedContent: string,
  constraint: NarrativeConstraintWithData
): boolean {
  if (!constraint.requiredText) return true;
  const required = constraint.requiredText.toLowerCase();

  // Extract key phrases from the required text
  const keyPhrases = extractKeyPhrases(required);

  // Check if at least 60% of key phrases are present
  if (keyPhrases.length === 0) return true;

  let matchedPhrases = 0;
  for (const phrase of keyPhrases) {
    if (normalizedContent.includes(phrase)) {
      matchedPhrases++;
    }
  }

  const matchRate = matchedPhrases / keyPhrases.length;

  // MUST_CONCLUDE needs stronger match (70%)
  if (constraint.type === "MUST_CONCLUDE") {
    return matchRate >= 0.7;
  }

  // MUST_STATE needs 60% match
  return matchRate >= 0.6;
}

/**
 * Extract meaningful key phrases from a constraint's required text.
 * Strips boilerplate words and returns the core semantic phrases.
 */
function extractKeyPhrases(text: string): string[] {
  // Remove boilerplate
  const cleaned = text
    .replace(/the following|summarizes|during the reporting period|in accordance with/g, "")
    .trim();

  // Split into meaningful words/phrases (3+ chars, not stop words)
  const stopWords = new Set([
    "the", "and", "for", "are", "was", "were", "been", "being",
    "have", "has", "had", "having", "with", "this", "that", "from",
    "they", "will", "would", "could", "should", "shall", "may",
    "can", "its", "all", "any", "not", "but", "also", "which",
    "their", "there", "these", "those", "than", "then", "into",
    "other", "some", "such",
  ]);

  const words = cleaned.split(/\s+/).filter(w =>
    w.length >= 3 && !stopWords.has(w)
  );

  // Return unique meaningful words as phrases
  return Array.from(new Set(words));
}
