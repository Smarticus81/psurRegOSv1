/**
 * ROOT CAUSE CLUSTERING AGENT
 *
 * Even when individual complaint root causes are inconclusive,
 * aggregate pattern analysis across the complaint population can
 * reveal systemic themes, failure modes, and lot/product clustering.
 *
 * Uses LLM to identify clusters across complaint narratives, symptom codes,
 * product numbers, and lot numbers.
 *
 * Output feeds Section E (complaint analysis) and Section G (CAPA).
 */

import { BaseAgent } from "../baseAgent";
import type { ComplaintEvidenceAtom } from "../../psur/engines/complaintEngine";

// ============================================================================
// TYPES
// ============================================================================

export interface RootCauseClusteringInput {
  complaints: ComplaintEvidenceAtom[];
  periodStart: string;
  periodEnd: string;
}

export interface RootCauseClusteringOutput {
  clusters: ComplaintCluster[];
  insights: string[];
  clusterCount: number;
}

export interface ComplaintCluster {
  theme: string;
  complaintIds: string[];
  patternDescription: string;
  rootCauseHypothesis: string;
  recommendedAction: string;
  affectedProducts: string[];
  affectedLots: string[];
  complaintCount: number;
}

// ============================================================================
// AGENT IMPLEMENTATION
// ============================================================================

export class RootCauseClusteringAgent extends BaseAgent<
  RootCauseClusteringInput,
  RootCauseClusteringOutput
> {
  constructor() {
    super({
      agentType: "RootCauseClusteringAgent",
      name: "Root Cause Clustering Agent",
    });
  }

  protected async execute(
    input: RootCauseClusteringInput
  ): Promise<RootCauseClusteringOutput> {
    const { complaints } = input;

    if (complaints.length < 3) {
      return {
        clusters: [],
        insights: ["Insufficient complaint volume for meaningful cluster analysis."],
        clusterCount: 0,
      };
    }

    // Prepare complaint narratives for LLM analysis
    const narratives = complaints.map((c, i) => ({
      idx: i + 1,
      id: c.complaintId,
      product: c.productNumber || c.deviceCode,
      lot: c.lotNumber || "N/A",
      symptom: c.symptomCode || c.category || "unknown",
      description: (c.description || "").substring(0, 400),
      findings: (c.investigationFindings || "").substring(0, 300),
      corrective: (c.correctiveActions || "").substring(0, 200),
      rootCause: c.rootCause || "not determined",
      confirmed: c.complaintConfirmed || "unknown",
      country: c.country || "unknown",
    }));

    const systemPrompt = `You are a medical device post-market surveillance expert analyzing complaint patterns to identify root cause clusters. Your analysis supports PSUR Section E per MDCG 2022-21.

Rules:
- Only identify clusters where a genuine pattern exists (>=2 complaints with common characteristics)
- Be specific about failure modes and use technical language
- Each cluster must have an actionable hypothesis and recommended corrective action
- Insights should be evidence-based observations, not speculation
- Return valid JSON only`;

    const userPrompt = `Analyze the following ${narratives.length} complaints to identify root cause clusters and patterns.

COMPLAINT DATA:
${narratives.map(n => `
${n.idx}. ID: ${n.id} | Product: ${n.product} | Lot: ${n.lot} | Symptom: ${n.symptom} | Country: ${n.country}
   Confirmed: ${n.confirmed} | Root Cause: ${n.rootCause}
   Description: ${n.description}
   Investigation: ${n.findings}
   Corrective: ${n.corrective}
`).join("\n")}

ANALYSIS TASKS:
1. Identify common themes, failure modes, or patterns across complaints
2. Look for: component-specific failures, lot-specific patterns, user environment factors, temporal clustering
3. Generate actionable insights even when individual root causes are inconclusive

Respond with JSON:
{
  "clusters": [
    {
      "theme": "Short descriptive theme name",
      "complaintIds": ["id1", "id2"],
      "patternDescription": "Detailed description of the pattern observed",
      "rootCauseHypothesis": "Best hypothesis for the root cause",
      "recommendedAction": "Specific corrective or preventive action",
      "affectedProducts": ["product1"],
      "affectedLots": ["lot1"],
      "complaintCount": 2
    }
  ],
  "insights": [
    "Insight about the overall complaint population"
  ]
}`;

    const llmResult = await this.invokeLLMForJSON<{
      clusters: ComplaintCluster[];
      insights: string[];
    }>(systemPrompt, userPrompt);

    if (!llmResult) {
      return {
        clusters: [],
        insights: ["Root cause clustering analysis could not be completed."],
        clusterCount: 0,
      };
    }

    const parsed = llmResult.content as any;

    // Validate and normalize the clusters
    const clusters = (parsed.clusters || []).map((c: any) => ({
      theme: c.theme || "Unknown Theme",
      complaintIds: Array.isArray(c.complaintIds) ? c.complaintIds : [],
      patternDescription: c.patternDescription || "",
      rootCauseHypothesis: c.rootCauseHypothesis || "",
      recommendedAction: c.recommendedAction || "",
      affectedProducts: Array.isArray(c.affectedProducts) ? c.affectedProducts : [],
      affectedLots: Array.isArray(c.affectedLots) ? c.affectedLots : [],
      complaintCount: c.complaintCount || (Array.isArray(c.complaintIds) ? c.complaintIds.length : 0),
    }));

    return {
      clusters,
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      clusterCount: clusters.length,
    };
  }
}
