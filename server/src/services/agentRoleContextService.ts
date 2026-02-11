/**
 * AGENT ROLE CONTEXT SERVICE
 * 
 * SOTA semantic context for agents - gives them deep understanding of:
 * - Their position in the PSUR workflow
 * - Relationships between sections (which cite which)
 * - GRKB obligations they must satisfy
 * - Data quality and completeness awareness
 * - Device-specific context from the dossier
 * 
 * This module bridges the Device Dossier, GRKB, and Neo4j graph to provide
 * agents with the richest possible semantic context for high-quality generation.
 * 
 * Graph Model Extensions:
 * - (Agent)-[:GENERATES]->(Slot)
 * - (Slot)-[:CITES]->(Slot)
 * - (Slot)-[:REQUIRES_DATA]->(DataField)
 * - (DeviceDossier)-[:CONTEXT_FOR]->(Agent)
 */

import { getSession, getDriver, syncObligationsToNeo4j, type Neo4jObligation } from "./neo4jGrkbService";
import { calculateCompletenessBreakdown, getDossierContext, type DossierContext, type CompletenessBreakdown } from "./deviceDossierService";
import { PSUR_REGULATORY_CONTEXT_SECTIONS } from "../constants/psurRegulatoryContext";
import { getAnnexIIIRulesForSection } from "../constants/grkbMdcgAlignment";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - Agent Role Context
// ═══════════════════════════════════════════════════════════════════════════════

export interface SectionRelationship {
    sectionId: string;
    title: string;
    relationship: "upstream" | "downstream" | "parallel" | "referenced_by";
    dataFlows: string[];  // What data flows between sections
    citationGuidance?: string;  // How to cite this section
}

export interface DataQualityFlag {
    field: string;
    status: "available" | "partial" | "missing" | "inferred";
    confidence: number;
    source?: string;
    recommendation?: string;
}

export interface GRKBObligationContext {
    obligationId: string;
    title: string;
    text: string;
    mandatory: boolean;
    sourceCitation: string;
    requiredEvidenceTypes: string[];
    satisfactionGuidance: string;
}

export interface WorkflowPosition {
    currentSection: string;
    sectionNumber: number;
    totalSections: number;
    phase: "introduction" | "data_presentation" | "analysis" | "conclusions";
    criticalPath: boolean;  // Is this section on the critical path for B/R conclusion?
}

export interface AgentRoleContext {
    // WHO the agent is
    agentRole: {
        sectionType: string;
        primaryResponsibility: string;
        outputExpectations: string[];
        qualityStandards: string[];
    };

    // WHERE in the workflow
    workflowPosition: WorkflowPosition;

    // WHAT data is available
    dataAvailability: {
        dossierCompleteness: number;
        availableFields: DataQualityFlag[];
        criticalMissing: string[];
        recommendations: string[];
    };

    // HOW sections relate
    sectionRelationships: SectionRelationship[];

    // WHY (regulatory obligations)
    grkbObligations: GRKBObligationContext[];

    // CROSS-SECTION citation guidance
    citationGuidance: {
        mustCite: string[];
        mayCite: string[];
        citationInstructions: string;
    };

    // DEVICE-SPECIFIC context summary
    deviceContextSummary: string;

    // PRIOR PSUR continuity
    priorPsurContinuity: {
        hasPriorPsur: boolean;
        openActions: string[];
        trendContext: string;
        conclusionEvolution: string;
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION WORKFLOW MAP - Defines semantic relationships between PSUR sections
// ═══════════════════════════════════════════════════════════════════════════════

interface SectionDefinition {
    slotId: string;
    title: string;
    order: number;
    phase: "introduction" | "data_presentation" | "analysis" | "conclusions";
    criticalPath: boolean;
    upstream: string[];  // Sections that must be completed before this one
    downstream: string[];  // Sections that depend on this one
    dataInputs: string[];  // Data fields required from dossier
    citesFrom: string[];  // Sections this section typically cites
    citedBy: string[];  // Sections that cite this section
    primaryResponsibility: string;
    outputExpectations: string[];
}

// MDCG 2022-21 Annex I Section Workflow Map
const PSUR_SECTION_WORKFLOW: SectionDefinition[] = [
    {
        slotId: "MDCG.ANNEXI.COVER",
        title: "Cover Page",
        order: 1,
        phase: "introduction",
        criticalPath: false,
        upstream: [],
        downstream: ["MDCG.ANNEXI.DEVICES_SCOPE"],
        dataInputs: ["tradeName", "deviceCode", "manufacturer", "notifiedBody", "periodStart", "periodEnd"],
        citesFrom: [],
        citedBy: [],
        primaryResponsibility: "Establish PSUR identification and scope",
        outputExpectations: ["Complete device identification", "Clear period definition", "NB information"],
    },
    {
        slotId: "MDCG.ANNEXI.DEVICES_SCOPE",
        title: "Devices Covered",
        order: 2,
        phase: "introduction",
        criticalPath: true,
        upstream: ["MDCG.ANNEXI.COVER"],
        downstream: ["MDCG.ANNEXI.SALES_VOLUME_EXPOSURE", "MDCG.ANNEXI.COMPLAINTS_SUMMARY"],
        dataInputs: ["classification", "intendedPurpose", "variants", "accessories", "basicUdiDi"],
        citesFrom: ["MDCG.ANNEXI.COVER"],
        citedBy: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        primaryResponsibility: "Define exact scope of devices under evaluation",
        outputExpectations: ["UDI-DI listing", "Classification rationale", "Variant coverage", "Intended purpose verbatim"],
    },
    {
        slotId: "MDCG.ANNEXI.DEVICES_CHANGES",
        title: "Significant Changes",
        order: 3,
        phase: "introduction",
        criticalPath: false,
        upstream: ["MDCG.ANNEXI.DEVICES_SCOPE"],
        downstream: ["MDCG.ANNEXI.CAPA_SUMMARY"],
        dataInputs: ["designChanges", "labelingChanges", "manufacturingChanges"],
        citesFrom: ["MDCG.ANNEXI.DEVICES_SCOPE"],
        citedBy: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        primaryResponsibility: "Document changes since last PSUR affecting safety/performance",
        outputExpectations: ["Change timeline", "Regulatory impact assessment", "Justification for significance"],
    },
    {
        slotId: "MDCG.ANNEXI.SALES_VOLUME_EXPOSURE",
        title: "Sales & Exposure Data",
        order: 4,
        phase: "data_presentation",
        criticalPath: true,
        upstream: ["MDCG.ANNEXI.DEVICES_SCOPE"],
        downstream: ["MDCG.ANNEXI.COMPLAINTS_SUMMARY", "MDCG.ANNEXI.TREND_REPORTING"],
        dataInputs: ["salesData", "cumulativeExposure", "geographicDistribution"],
        citesFrom: [],
        citedBy: ["MDCG.ANNEXI.COMPLAINTS_SUMMARY", "MDCG.ANNEXI.TREND_REPORTING", "MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        primaryResponsibility: "Establish denominator for rate calculations",
        outputExpectations: ["Units sold by region", "Cumulative exposure", "Clear denominator methodology"],
    },
    {
        slotId: "MDCG.ANNEXI.COMPLAINTS_SUMMARY",
        title: "Complaints Summary",
        order: 5,
        phase: "data_presentation",
        criticalPath: true,
        upstream: ["MDCG.ANNEXI.SALES_VOLUME_EXPOSURE"],
        downstream: ["MDCG.ANNEXI.TREND_REPORTING", "MDCG.ANNEXI.CAPA_SUMMARY"],
        dataInputs: ["complaints", "complaintRate", "principalRisks"],
        citesFrom: ["MDCG.ANNEXI.SALES_VOLUME_EXPOSURE", "MDCG.ANNEXI.DEVICES_SCOPE"],
        citedBy: ["MDCG.ANNEXI.TREND_REPORTING", "MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        primaryResponsibility: "Characterize complaint profile using IMDRF terminology",
        outputExpectations: ["IMDRF-coded complaint summary", "Rate calculations vs denominator", "Severity distribution"],
    },
    {
        slotId: "MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE_IMDRF",
        title: "Serious Incidents (IMDRF)",
        order: 6,
        phase: "data_presentation",
        criticalPath: true,
        upstream: ["MDCG.ANNEXI.COMPLAINTS_SUMMARY"],
        downstream: ["MDCG.ANNEXI.TREND_REPORTING", "MDCG.ANNEXI.FSCA_SUMMARY"],
        dataInputs: ["seriousIncidents", "vigilanceReports", "principalRisks"],
        citesFrom: ["MDCG.ANNEXI.COMPLAINTS_SUMMARY", "MDCG.ANNEXI.SALES_VOLUME_EXPOSURE"],
        citedBy: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION", "MDCG.ANNEXI.FSCA_SUMMARY"],
        primaryResponsibility: "Document serious incidents with IMDRF AE/Patient codes",
        outputExpectations: ["Complete IMDRF coding", "Investigation status", "Regulatory notifications"],
    },
    {
        slotId: "MDCG.ANNEXI.TREND_REPORTING",
        title: "Trend Analysis",
        order: 7,
        phase: "analysis",
        criticalPath: true,
        upstream: ["MDCG.ANNEXI.COMPLAINTS_SUMMARY", "MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE_IMDRF"],
        downstream: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        dataInputs: ["trendData", "baselines", "riskThresholds", "signalDetectionMethod"],
        citesFrom: ["MDCG.ANNEXI.COMPLAINTS_SUMMARY", "MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE_IMDRF", "MDCG.ANNEXI.SALES_VOLUME_EXPOSURE"],
        citedBy: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        primaryResponsibility: "Identify statistically significant trends and signals",
        outputExpectations: ["Statistical analysis", "Comparison to baselines", "Signal assessment", "Threshold breach analysis"],
    },
    {
        slotId: "MDCG.ANNEXI.EXTERNAL_DATABASES",
        title: "External Database Analysis",
        order: 8,
        phase: "data_presentation",
        criticalPath: false,
        upstream: ["MDCG.ANNEXI.DEVICES_SCOPE"],
        downstream: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        dataInputs: ["externalDbSearchProtocol", "fscaHistory"],
        citesFrom: ["MDCG.ANNEXI.DEVICES_SCOPE"],
        citedBy: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        primaryResponsibility: "Review external vigilance databases (MAUDE, MHRA, Health Canada)",
        outputExpectations: ["Search methodology", "Relevant findings", "Comparison to internal data"],
    },
    {
        slotId: "MDCG.ANNEXI.PMCF_REVIEW",
        title: "PMCF Activities Review",
        order: 9,
        phase: "data_presentation",
        criticalPath: false,
        upstream: ["MDCG.ANNEXI.DEVICES_SCOPE"],
        downstream: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        dataInputs: ["pmcfPlan", "pmcfResults", "clinicalBenefits"],
        citesFrom: ["MDCG.ANNEXI.DEVICES_SCOPE"],
        citedBy: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        primaryResponsibility: "Summarize PMCF status and findings",
        outputExpectations: ["Study status", "Interim results", "Enrollment progress", "Data gaps addressed"],
    },
    {
        slotId: "MDCG.ANNEXI.CAPA_SUMMARY",
        title: "CAPA Summary",
        order: 10,
        phase: "analysis",
        criticalPath: false,
        upstream: ["MDCG.ANNEXI.COMPLAINTS_SUMMARY", "MDCG.ANNEXI.TREND_REPORTING"],
        downstream: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        dataInputs: ["capaActions", "capaEffectiveness"],
        citesFrom: ["MDCG.ANNEXI.COMPLAINTS_SUMMARY", "MDCG.ANNEXI.TREND_REPORTING"],
        citedBy: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        primaryResponsibility: "Document corrective actions and their effectiveness",
        outputExpectations: ["CAPA list", "Effectiveness metrics", "Open vs closed status"],
    },
    {
        slotId: "MDCG.ANNEXI.FSCA_SUMMARY",
        title: "FSCA Summary",
        order: 11,
        phase: "analysis",
        criticalPath: false,
        upstream: ["MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE_IMDRF"],
        downstream: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        dataInputs: ["fscaHistory", "recalls"],
        citesFrom: ["MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE_IMDRF"],
        citedBy: ["MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION"],
        primaryResponsibility: "Document field safety corrective actions",
        outputExpectations: ["FSCA timeline", "Affected units", "Status", "Effectiveness"],
    },
    {
        slotId: "MDCG.ANNEXI.BENEFIT_RISK_CONCLUSION",
        title: "Benefit-Risk Conclusion",
        order: 12,
        phase: "conclusions",
        criticalPath: true,
        upstream: [
            "MDCG.ANNEXI.DEVICES_SCOPE",
            "MDCG.ANNEXI.COMPLAINTS_SUMMARY",
            "MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE_IMDRF",
            "MDCG.ANNEXI.TREND_REPORTING",
            "MDCG.ANNEXI.CAPA_SUMMARY",
            "MDCG.ANNEXI.FSCA_SUMMARY",
            "MDCG.ANNEXI.PMCF_REVIEW",
        ],
        downstream: [],
        dataInputs: [
            "clinicalBenefits",
            "principalRisks",
            "residualRiskAcceptability",
            "cerConclusions",
            "priorPsurConclusion",
        ],
        citesFrom: [
            "MDCG.ANNEXI.DEVICES_SCOPE",
            "MDCG.ANNEXI.COMPLAINTS_SUMMARY",
            "MDCG.ANNEXI.SERIOUS_INCIDENTS_TABLE_IMDRF",
            "MDCG.ANNEXI.TREND_REPORTING",
        ],
        citedBy: [],
        primaryResponsibility: "Synthesize all data into definitive B/R conclusion",
        outputExpectations: [
            "Clear ACCEPTABLE/UNACCEPTABLE statement",
            "Evidence synthesis",
            "Comparison to prior PSUR",
            "Actions if required",
        ],
    },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CORE FUNCTION - Build Agent Role Context
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build comprehensive semantic context for an agent working on a specific section.
 * This is the main function agents should call to understand their role.
 */
export async function buildAgentRoleContext(
    slotId: string,
    deviceCode: string,
    periodStart: string,
    periodEnd: string,
    templateId: string
): Promise<AgentRoleContext> {
    // Find the section definition
    const sectionDef = PSUR_SECTION_WORKFLOW.find(s => s.slotId === slotId);
    if (!sectionDef) {
        // Fallback for unknown sections
        return buildFallbackContext(slotId, deviceCode, periodStart, periodEnd);
    }

    // Fetch dossier context and completeness in parallel
    // Handle errors gracefully - if dossier context fails, we still want to provide workflow info
    let dossierContext: DossierContext | null = null;
    let completeness: CompletenessBreakdown;

    try {
        [dossierContext, completeness] = await Promise.all([
            getDossierContext(deviceCode, periodStart, periodEnd).catch(() => null),
            calculateCompletenessBreakdown(deviceCode),
        ]);
    } catch (error) {
        completeness = await calculateCompletenessBreakdown(deviceCode);
    }

    // Build section relationships
    const sectionRelationships = buildSectionRelationships(sectionDef);

    // Get GRKB obligations from graph (or fallback to static mapping)
    const grkbObligations = await getGRKBObligationsForSlot(slotId, templateId);

    // Build data availability assessment (handle null dossier context)
    const dataAvailability = dossierContext
        ? buildDataAvailability(sectionDef, completeness, dossierContext)
        : {
            dossierCompleteness: completeness.score,
            availableFields: [],
            criticalMissing: completeness.criticalMissing.concat(["Device dossier context unavailable"]),
            recommendations: completeness.recommendations,
        };

    // Build citation guidance
    const citationGuidance = buildCitationGuidance(sectionDef);

    // Build device context summary (handle null dossier context)
    const deviceContextSummary = dossierContext
        ? buildDeviceContextSummary(dossierContext)
        : "Device dossier not available. Please complete device dossier for richer context.";

    // Build prior PSUR continuity (handle null dossier context)
    const priorPsurContinuity = dossierContext
        ? buildPriorPsurContinuity(dossierContext)
        : {
            hasPriorPsur: false,
            openActions: [],
            trendContext: "Device dossier unavailable. Prior PSUR data cannot be assessed.",
            conclusionEvolution: "N/A - Dossier context required",
        };

    return {
        agentRole: {
            sectionType: sectionDef.slotId,
            primaryResponsibility: sectionDef.primaryResponsibility,
            outputExpectations: sectionDef.outputExpectations,
            qualityStandards: [
                "Use IMDRF terminology where applicable",
                "Cite evidence atoms for all data points",
                "Maintain consistency with prior PSUR language",
                "Reference MDCG 2022-21 requirements",
                "Quantify rates using established denominators",
            ],
        },

        workflowPosition: {
            currentSection: sectionDef.title,
            sectionNumber: sectionDef.order,
            totalSections: PSUR_SECTION_WORKFLOW.length,
            phase: sectionDef.phase,
            criticalPath: sectionDef.criticalPath,
        },

        dataAvailability,
        sectionRelationships,
        grkbObligations,
        citationGuidance,
        deviceContextSummary,
        priorPsurContinuity,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function buildSectionRelationships(sectionDef: SectionDefinition): SectionRelationship[] {
    const relationships: SectionRelationship[] = [];

    // Upstream sections (must be completed before)
    for (const upstreamId of sectionDef.upstream) {
        const upstream = PSUR_SECTION_WORKFLOW.find(s => s.slotId === upstreamId);
        if (upstream) {
            relationships.push({
                sectionId: upstreamId,
                title: upstream.title,
                relationship: "upstream",
                dataFlows: upstream.dataInputs.filter(d => sectionDef.dataInputs.includes(d)),
                citationGuidance: sectionDef.citesFrom.includes(upstreamId)
                    ? `Reference ${upstream.title} when discussing ${upstream.dataInputs.slice(0, 2).join(", ")}`
                    : undefined,
            });
        }
    }

    // Downstream sections (depend on this section)
    for (const downstreamId of sectionDef.downstream) {
        const downstream = PSUR_SECTION_WORKFLOW.find(s => s.slotId === downstreamId);
        if (downstream) {
            relationships.push({
                sectionId: downstreamId,
                title: downstream.title,
                relationship: "downstream",
                dataFlows: sectionDef.dataInputs.filter(d => downstream.dataInputs.includes(d)),
            });
        }
    }

    // Sections that cite this section
    for (const citerId of sectionDef.citedBy) {
        const citer = PSUR_SECTION_WORKFLOW.find(s => s.slotId === citerId);
        if (citer && !relationships.find(r => r.sectionId === citerId)) {
            relationships.push({
                sectionId: citerId,
                title: citer.title,
                relationship: "referenced_by",
                dataFlows: [],
            });
        }
    }

    return relationships;
}

function buildDataAvailability(
    sectionDef: SectionDefinition,
    completeness: CompletenessBreakdown,
    dossierContext: DossierContext
): AgentRoleContext["dataAvailability"] {
    const availableFields: DataQualityFlag[] = [];

    // Map section data inputs to completeness categories
    const dataInputMappings: Record<string, { category: keyof CompletenessBreakdown["categories"]; field: string }> = {
        tradeName: { category: "identity", field: "Trade name" },
        deviceCode: { category: "identity", field: "Device code" },
        classification: { category: "identity", field: "Classification" },
        basicUdiDi: { category: "identity", field: "Basic UDI-DI" },
        intendedPurpose: { category: "clinicalContext", field: "Intended purpose" },
        clinicalBenefits: { category: "clinicalContext", field: "Clinical benefits" },
        principalRisks: { category: "riskContext", field: "Principal risks" },
        riskThresholds: { category: "riskContext", field: "Risk thresholds" },
        cerConclusions: { category: "clinicalEvidence", field: "CER conclusions" },
        pmcfPlan: { category: "clinicalEvidence", field: "PMCF plan" },
        priorPsurConclusion: { category: "priorPsurs", field: "Prior PSUR" },
        baselines: { category: "baselines", field: "Performance baselines" },
    };

    for (const input of sectionDef.dataInputs) {
        const mapping = dataInputMappings[input];
        if (mapping) {
            const category = completeness.categories[mapping.category];
            const isMissing = category.missing.some(m => m.toLowerCase().includes(mapping.field.toLowerCase()));

            availableFields.push({
                field: mapping.field,
                status: isMissing ? "missing" : category.score >= category.max * 0.8 ? "available" : "partial",
                confidence: category.score / category.max,
                source: "Device Dossier",
                recommendation: isMissing ? `Add ${mapping.field} to device dossier for complete context` : undefined,
            });
        } else {
            // Data not in dossier (comes from evidence atoms)
            availableFields.push({
                field: input,
                status: "available",
                confidence: 0.9,
                source: "Evidence Atoms",
            });
        }
    }

    return {
        dossierCompleteness: completeness.score,
        availableFields,
        criticalMissing: completeness.criticalMissing,
        recommendations: completeness.recommendations,
    };
}

async function getGRKBObligationsForSlot(slotId: string, templateId: string): Promise<GRKBObligationContext[]> {
    const session = getSession();

    if (session) {
        try {
            // Query Neo4j for obligations linked to this slot
            const result = await session.run(`
        MATCH (s:Slot {slotId: $slotId})-[r:SATISFIES]->(o:Obligation)
        RETURN o.obligationId AS obligationId,
               o.title AS title,
               o.text AS text,
               o.mandatory AS mandatory,
               o.sourceCitation AS sourceCitation,
               r.confidence AS confidence
        ORDER BY r.confidence DESC
        LIMIT 5
      `, { slotId });

            if (result.records.length > 0) {
                return result.records.map(r => ({
                    obligationId: r.get("obligationId"),
                    title: r.get("title"),
                    text: r.get("text") || "",
                    mandatory: r.get("mandatory") ?? true,
                    sourceCitation: r.get("sourceCitation") || "MDCG 2022-21",
                    requiredEvidenceTypes: [],
                    satisfactionGuidance: `Address this obligation with ${Math.round((r.get("confidence") || 0.8) * 100)}% confidence match`,
                }));
            }
        } catch (error) {
            console.debug("[AgentRoleContext] Neo4j query failed, using static mapping");
        } finally {
            await session.close();
        }
    }

    // Fallback to static mapping from PSUR_REGULATORY_CONTEXT_SECTIONS
    const relevantSections = PSUR_REGULATORY_CONTEXT_SECTIONS.filter(
        s => s.slotIds?.includes(slotId)
    );

    return relevantSections.map(section => ({
        obligationId: section.id,
        title: section.title,
        text: typeof section.content === "string" ? section.content : JSON.stringify(section.content),
        mandatory: true,
        sourceCitation: "MDCG 2022-21",
        requiredEvidenceTypes: [],
        satisfactionGuidance: `Apply the methodologies and requirements defined in "${section.title}"`,
    }));
}

function buildCitationGuidance(sectionDef: SectionDefinition): AgentRoleContext["citationGuidance"] {
    const mustCite = sectionDef.citesFrom.map(id => {
        const section = PSUR_SECTION_WORKFLOW.find(s => s.slotId === id);
        return section?.title || id;
    });

    const mayCite = sectionDef.upstream
        .filter(id => !sectionDef.citesFrom.includes(id))
        .map(id => {
            const section = PSUR_SECTION_WORKFLOW.find(s => s.slotId === id);
            return section?.title || id;
        });

    return {
        mustCite,
        mayCite,
        citationInstructions: sectionDef.criticalPath
            ? "This section is on the critical path to the Benefit-Risk Conclusion. Ensure all data points are cited with evidence atom IDs. Cross-reference denominator data from Sales section when calculating rates."
            : "Cite relevant prior sections where data is referenced. Ensure internal consistency with established figures.",
    };
}

function buildDeviceContextSummary(dossierContext: DossierContext): string {
    const lines: string[] = [];

    if (dossierContext.productSummary) {
        lines.push(dossierContext.productSummary);
    }

    if (dossierContext.clinicalBenefits.length > 0) {
        lines.push("", "**Key Clinical Benefits:**");
        for (const benefit of dossierContext.clinicalBenefits.slice(0, 3)) {
            lines.push(`- ${benefit.description}${benefit.quantifiedValue ? ` (${benefit.quantifiedValue})` : ""}`);
        }
    }

    if (dossierContext.riskThresholds) {
        lines.push("", "**Risk Thresholds:**");
        if (dossierContext.riskThresholds.complaintRateThreshold) {
            lines.push(`- Complaint Rate Alert: >${dossierContext.riskThresholds.complaintRateThreshold} per 1,000 units`);
        }
        if (dossierContext.riskThresholds.seriousIncidentThreshold) {
            lines.push(`- Serious Incident Alert: >${dossierContext.riskThresholds.seriousIncidentThreshold} events`);
        }
    }

    return lines.join("\n");
}

function buildPriorPsurContinuity(dossierContext: DossierContext): AgentRoleContext["priorPsurContinuity"] {
    const priorPsur = dossierContext.priorPsurConclusion;

    if (!priorPsur) {
        return {
            hasPriorPsur: false,
            openActions: [],
            trendContext: "This is the first PSUR for this device. Establish baseline metrics for future comparison.",
            conclusionEvolution: "N/A - First PSUR",
        };
    }

    const openActions = (priorPsur.actionsRequired || [])
        .filter(a => !a.completed)
        .map(a => a.description);

    return {
        hasPriorPsur: true,
        openActions,
        trendContext: `Prior period (${priorPsur.periodStart} to ${priorPsur.periodEnd}): Compare current data against prior metrics. ${priorPsur.periodMetrics?.complaintRate ? `Prior complaint rate: ${priorPsur.periodMetrics.complaintRate} per 1,000 units.` : ""}`,
        conclusionEvolution: `Prior B/R conclusion: "${priorPsur.benefitRiskConclusion}". ${openActions.length > 0 ? `Address ${openActions.length} outstanding actions from prior PSUR.` : "No outstanding actions from prior PSUR."}`,
    };
}

async function buildFallbackContext(
    slotId: string,
    deviceCode: string,
    periodStart: string,
    periodEnd: string
): Promise<AgentRoleContext> {
    const dossierContext = await getDossierContext(deviceCode, periodStart, periodEnd);
    const completeness = await calculateCompletenessBreakdown(deviceCode);

    return {
        agentRole: {
            sectionType: slotId,
            primaryResponsibility: "Generate content for this PSUR section",
            outputExpectations: ["Regulatory-compliant narrative", "Evidence-based content"],
            qualityStandards: ["Use IMDRF terminology", "Cite evidence atoms"],
        },
        workflowPosition: {
            currentSection: slotId,
            sectionNumber: 0,
            totalSections: PSUR_SECTION_WORKFLOW.length,
            phase: "data_presentation",
            criticalPath: false,
        },
        dataAvailability: {
            dossierCompleteness: completeness.score,
            availableFields: [],
            criticalMissing: completeness.criticalMissing,
            recommendations: completeness.recommendations,
        },
        sectionRelationships: [],
        grkbObligations: [],
        citationGuidance: {
            mustCite: [],
            mayCite: [],
            citationInstructions: "Cite relevant evidence where applicable.",
        },
        deviceContextSummary: buildDeviceContextSummary(dossierContext),
        priorPsurContinuity: buildPriorPsurContinuity(dossierContext),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT FOR PROMPT INJECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format Agent Role Context as a structured string for prompt injection.
 * This is what gets added to the agent's system/user prompt.
 */
export function formatAgentRoleContextForPrompt(context: AgentRoleContext): string {
    const lines: string[] = [];

    // Header
    lines.push("═══════════════════════════════════════════════════════════════════════════════");
    lines.push("AGENT ROLE CONTEXT - Your Semantic Understanding of This Task");
    lines.push("═══════════════════════════════════════════════════════════════════════════════");

    // WHO you are
    lines.push("");
    lines.push("## YOUR ROLE");
    lines.push(`**Section:** ${context.workflowPosition.currentSection} (${context.workflowPosition.sectionNumber} of ${context.workflowPosition.totalSections})`);
    lines.push(`**Phase:** ${context.workflowPosition.phase.replace("_", " ").toUpperCase()}`);
    lines.push(`**Primary Responsibility:** ${context.agentRole.primaryResponsibility}`);
    if (context.workflowPosition.criticalPath) {
        lines.push("⚠️ **CRITICAL PATH:** This section directly feeds into the Benefit-Risk Conclusion.");
    }
    lines.push("");
    lines.push("**Output Expectations:**");
    for (const exp of context.agentRole.outputExpectations) {
        lines.push(`- ${exp}`);
    }

    // Data availability
    lines.push("");
    lines.push("## DATA AVAILABILITY");
    lines.push(`**Dossier Completeness:** ${context.dataAvailability.dossierCompleteness}%`);

    const available = context.dataAvailability.availableFields.filter(f => f.status === "available");
    const partial = context.dataAvailability.availableFields.filter(f => f.status === "partial");
    const missing = context.dataAvailability.availableFields.filter(f => f.status === "missing");

    if (available.length > 0) {
        lines.push("✅ **Available:** " + available.map(f => f.field).join(", "));
    }
    if (partial.length > 0) {
        lines.push("⚠️ **Partial:** " + partial.map(f => f.field).join(", "));
    }
    if (missing.length > 0) {
        lines.push("❌ **Missing:** " + missing.map(f => f.field).join(", "));
    }

    if (context.dataAvailability.criticalMissing.length > 0) {
        lines.push("");
        lines.push("**Critical Data Gaps:**");
        for (const gap of context.dataAvailability.criticalMissing.slice(0, 3)) {
            lines.push(`- ${gap}`);
        }
    }

    // Section relationships
    if (context.sectionRelationships.length > 0) {
        lines.push("");
        lines.push("## WORKFLOW RELATIONSHIPS");

        const upstream = context.sectionRelationships.filter(r => r.relationship === "upstream");
        const downstream = context.sectionRelationships.filter(r => r.relationship === "downstream");

        if (upstream.length > 0) {
            lines.push("**Upstream (completed before you):**");
            for (const rel of upstream) {
                lines.push(`- ${rel.title}${rel.citationGuidance ? `: ${rel.citationGuidance}` : ""}`);
            }
        }

        if (downstream.length > 0) {
            lines.push("**Downstream (depends on your output):**");
            for (const rel of downstream) {
                lines.push(`- ${rel.title}`);
            }
        }
    }

    // Citation guidance
    lines.push("");
    lines.push("## CITATION REQUIREMENTS");
    if (context.citationGuidance.mustCite.length > 0) {
        lines.push("**Must cite:** " + context.citationGuidance.mustCite.join(", "));
    }
    if (context.citationGuidance.mayCite.length > 0) {
        lines.push("**May cite:** " + context.citationGuidance.mayCite.join(", "));
    }
    lines.push(context.citationGuidance.citationInstructions);

    // GRKB obligations
    if (context.grkbObligations.length > 0) {
        lines.push("");
        lines.push("## REGULATORY OBLIGATIONS YOU MUST SATISFY (GRKB)");
        lines.push("You MUST produce content that fully satisfies each obligation below.");
        lines.push("However, do NOT cite or name any regulation, article, or standard in your output text.");
        lines.push("Comply with the SUBSTANCE of each obligation through your content structure and completeness.");
        lines.push("");
        for (const obl of context.grkbObligations.slice(0, 5)) {
            lines.push(`**${obl.title}**`);
            lines.push(`  Requirement: ${obl.text || obl.satisfactionGuidance}`);
            if (obl.requiredEvidenceTypes.length > 0) {
                lines.push(`  Evidence needed: ${obl.requiredEvidenceTypes.join(", ")}`);
            }
        }
    }

    // Annex III assessment rules for this section type
    const annexIIIRules = getAnnexIIIRulesForSection(context.agentRole.sectionType);
    if (annexIIIRules.length > 0) {
        lines.push("");
        lines.push("## MANDATORY PRESENTATION & ASSESSMENT RULES (Annex III)");
        lines.push("Your output MUST satisfy ALL of the following data presentation and assessment requirements:");
        lines.push("");
        for (const rule of annexIIIRules) {
            lines.push(`**${rule.title}:** ${rule.requirement}`);
        }
    }

    // Prior PSUR continuity
    lines.push("");
    lines.push("## PRIOR PSUR CONTINUITY");
    lines.push(context.priorPsurContinuity.trendContext);
    lines.push(context.priorPsurContinuity.conclusionEvolution);
    if (context.priorPsurContinuity.openActions.length > 0) {
        lines.push("**Open Actions to Address:**");
        for (const action of context.priorPsurContinuity.openActions) {
            lines.push(`- ${action}`);
        }
    }

    // Device context summary
    if (context.deviceContextSummary) {
        lines.push("");
        lines.push("## DEVICE CONTEXT");
        lines.push(context.deviceContextSummary);
    }

    lines.push("");
    lines.push("═══════════════════════════════════════════════════════════════════════════════");

    return lines.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEO4J GRAPH ENHANCEMENT - Sync workflow to graph
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Sync the PSUR workflow structure to Neo4j for visualization and queries.
 * Creates (Slot)-[:FLOWS_TO]->(Slot) and (Slot)-[:CITES]->(Slot) relationships.
 */
export async function syncWorkflowToNeo4j(): Promise<number> {
    const session = getSession();
    if (!session) return 0;

    let synced = 0;

    try {
        for (const section of PSUR_SECTION_WORKFLOW) {
            // Create/update slot with workflow metadata
            await session.run(`
        MERGE (s:Slot {slotId: $slotId})
        SET s.title = $title,
            s.order = $order,
            s.phase = $phase,
            s.criticalPath = $criticalPath,
            s.primaryResponsibility = $primaryResponsibility,
            s.updatedAt = datetime()
      `, {
                slotId: section.slotId,
                title: section.title,
                order: section.order,
                phase: section.phase,
                criticalPath: section.criticalPath,
                primaryResponsibility: section.primaryResponsibility,
            });

            // Create FLOWS_TO relationships (workflow order)
            for (const downstreamId of section.downstream) {
                await session.run(`
          MATCH (from:Slot {slotId: $fromId})
          MATCH (to:Slot {slotId: $toId})
          MERGE (from)-[:FLOWS_TO]->(to)
        `, { fromId: section.slotId, toId: downstreamId });
            }

            // Create CITES relationships (citation structure)
            for (const citesFromId of section.citesFrom) {
                await session.run(`
          MATCH (from:Slot {slotId: $fromId})
          MATCH (to:Slot {slotId: $toId})
          MERGE (from)-[:CITES]->(to)
        `, { fromId: section.slotId, toId: citesFromId });
            }

            synced++;
        }

        console.log(`[AgentRoleContext] Synced ${synced} workflow sections to Neo4j`);
        return synced;
    } catch (error) {
        console.error("[AgentRoleContext] Workflow sync failed:", error);
        return synced;
    } finally {
        await session.close();
    }
}

/**
 * Sync static regulatory obligations from PSUR_REGULATORY_CONTEXT_SECTIONS to Neo4j.
 * This populates the "Obligation" nodes in the graph.
 */
export async function syncStaticObligationsToGraph(): Promise<number> {
    const obligations: Neo4jObligation[] = PSUR_REGULATORY_CONTEXT_SECTIONS.map(section => ({
        obligationId: section.id,
        title: section.title,
        text: typeof section.content === "string" ? section.content : JSON.stringify(section.content),
        jurisdiction: "EU_MDR", // Default to EU MDR for static context
        mandatory: true,
        sourceCitation: "MDCG 2022-21 Annex I",
        requiredEvidenceTypes: [], // To be enriched later
    }));

    console.log(`[AgentRoleContext] Syncing ${obligations.length} static obligations to graph...`);
    const count = await syncObligationsToNeo4j(obligations);

    // Create SATISFIES relationships to link Slots -> Obligations
    const session = getSession();
    if (session) {
        try {
            for (const section of PSUR_REGULATORY_CONTEXT_SECTIONS) {
                if (section.slotIds && section.slotIds.length > 0) {
                    for (const slotId of section.slotIds) {
                        await session.run(`
                            MATCH (s:Slot {slotId: $slotId})
                            MATCH (o:Obligation {obligationId: $oblId})
                            MERGE (s)-[r:SATISFIES]->(o)
                            SET r.confidence = 1.0, r.source = "Static Mapping"
                        `, { slotId, oblId: section.id });
                    }
                }
            }
            console.log("[AgentRoleContext] Created SATISFIES relationships in graph");
        } catch (error) {
            console.error("[AgentRoleContext] Failed to link obligations:", error);
        } finally {
            await session.close();
        }
    }

    return count;
}
