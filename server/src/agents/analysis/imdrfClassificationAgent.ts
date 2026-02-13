/**
 * IMDRF CLASSIFICATION AGENT (Stage 2)
 *
 * LLM-powered agent for context-dependent IMDRF classification.
 * Handles complaints where the harm code depends on patient outcome,
 * investigation findings, and additional medical attention context.
 *
 * Called after Stage 1 deterministic classification for complaints
 * that have requiresAdjudication=true and couldn't be resolved from context.
 *
 * Output feeds PSUR Section E (IMDRF-coded complaint tables) per MDCG 2022-21.
 */

import { BaseAgent } from "../baseAgent";
import type { ComplaintEvidenceAtom } from "../../psur/engines/complaintEngine";
import type {
  IMDRFClassificationResult,
  IMDRFMapping,
} from "../../psur/engines/imdrfClassification";

// ============================================================================
// TYPES
// ============================================================================

export interface IMDRFAdjudicationInput {
  complaints: AdjudicationCase[];
}

export interface AdjudicationCase {
  complaint: ComplaintEvidenceAtom;
  defaultMapping: IMDRFMapping;
  deterministicResult: IMDRFClassificationResult;
}

export interface IMDRFAdjudicationOutput {
  results: AdjudicatedResult[];
  adjudicatedCount: number;
}

export interface AdjudicatedResult {
  atomId: string;
  classification: IMDRFClassificationResult;
}

// ============================================================================
// AGENT IMPLEMENTATION
// ============================================================================

export class IMDRFClassificationAgent extends BaseAgent<
  IMDRFAdjudicationInput,
  IMDRFAdjudicationOutput
> {
  constructor() {
    super({
      agentType: "IMDRFClassificationAgent",
      name: "IMDRF Classification Agent",
    });
  }

  protected async execute(
    input: IMDRFAdjudicationInput
  ): Promise<IMDRFAdjudicationOutput> {
    const { complaints } = input;

    if (complaints.length === 0) {
      return { results: [], adjudicatedCount: 0 };
    }

    // Process in batches of 10 to keep prompts manageable
    const batchSize = 10;
    const allResults: AdjudicatedResult[] = [];

    for (let i = 0; i < complaints.length; i += batchSize) {
      const batch = complaints.slice(i, i + batchSize);
      const batchResults = await this.adjudicateBatch(batch);
      allResults.push(...batchResults);
    }

    return {
      results: allResults,
      adjudicatedCount: allResults.length,
    };
  }

  private async adjudicateBatch(
    cases: AdjudicationCase[]
  ): Promise<AdjudicatedResult[]> {
    const caseDescriptions = cases.map((c, idx) => {
      const complaint = c.complaint;
      return `
CASE ${idx + 1} (ID: ${complaint.atomId}):
  Symptom Code: ${complaint.symptomCode || complaint.category || "unknown"}
  Description: ${(complaint.description || "").substring(0, 400)}
  Patient Involvement: ${complaint.patientInvolvement || "unknown"}
  Additional Medical Attention: ${complaint.additionalMedicalAttention || "unknown"}
  Investigation Findings: ${(complaint.investigationFindings || "").substring(0, 300)}
  Corrective Actions: ${(complaint.correctiveActions || "").substring(0, 200)}
  Complaint Confirmed: ${complaint.complaintConfirmed || "unknown"}

  DEFAULT MDP: ${c.defaultMapping.mdpCode} - ${c.defaultMapping.mdpTerm}
  DEFAULT HARM: ${c.defaultMapping.harmCode || "None"} - ${c.defaultMapping.harmTerm}
`;
    });

    const systemPrompt = `You are a medical device regulatory expert classifying complaints using IMDRF Annex A (Medical Device Problem codes) and Annex E (Health Effect codes).

For each complaint, determine:
1. The correct MDP code based on the actual device problem described
2. Whether actual patient harm occurred (based on patient involvement, medical attention, and investigation)
3. If harm occurred, the appropriate Annex E health effect code

Key Decision Rules:
- If patient involvement is "no" or "n/a" AND no additional medical attention → harm_code is null
- If patient was involved but no injury detected → harm_code is null
- If actual injury occurred (burn, laceration, etc.) → assign specific harm code
- If additional medical attention was needed → likely serious, assign harm code
- Shipping damage or user error → MDP 3010/3001, harm is null

Return valid JSON only.`;

    const userPrompt = `Classify the following ${cases.length} complaint(s) using IMDRF codes.

${caseDescriptions.join("\n---\n")}

Respond with JSON array:
[
  {
    "case_index": 1,
    "mdp_code": "2003",
    "mdp_term": "Mechanical Problem - Break/Fracture",
    "harm_code": null,
    "harm_term": "No Health Effect",
    "severity": "non-serious",
    "confidence": 0.95,
    "reasoning": "Brief explanation of classification decision"
  }
]`;

    try {
      const llmResult = await this.invokeLLMForJSON<Array<{
        case_index: number;
        mdp_code: string;
        mdp_term: string;
        harm_code: string | null;
        harm_term: string;
        severity: string;
        confidence: number;
        reasoning?: string;
      }>>(systemPrompt, userPrompt);

      const parsed = llmResult.content as any;
      const items = Array.isArray(parsed) ? parsed : [];

      return cases.map((c, idx) => {
        const llmItem = items.find((item: any) => item.case_index === idx + 1) || items[idx];

        if (llmItem) {
          return {
            atomId: c.complaint.atomId,
            classification: {
              mdpCode: String(llmItem.mdp_code || c.deterministicResult.mdpCode),
              mdpTerm: String(llmItem.mdp_term || c.deterministicResult.mdpTerm),
              harmCode: llmItem.harm_code ? String(llmItem.harm_code) : null,
              harmTerm: String(llmItem.harm_term || "No Health Effect"),
              severity: (llmItem.severity === "serious" ? "serious" : "non-serious") as "serious" | "non-serious",
              classificationMethod: "llm_adjudicated" as const,
              confidence: typeof llmItem.confidence === "number" ? llmItem.confidence : 0.8,
            },
          };
        }

        // Fallback to deterministic result if LLM didn't return this case
        return {
          atomId: c.complaint.atomId,
          classification: c.deterministicResult,
        };
      });
    } catch {
      // If LLM fails, return deterministic results for all cases
      return cases.map(c => ({
        atomId: c.complaint.atomId,
        classification: c.deterministicResult,
      }));
    }
  }
}
