/**
 * NEO4J GRKB SERVICE
 * 
 * Graph database layer for the Global Regulatory Knowledge Base.
 * Provides semantic relationships between obligations, templates, and slots.
 * 
 * Graph Model:
 * - (Obligation)-[:REQUIRES]->(EvidenceType)
 * - (Slot)-[:SATISFIES]->(Obligation)
 * - (Template)-[:CONTAINS]->(Slot)
 * - (Obligation)-[:DEPENDS_ON]->(Obligation)
 * - (Obligation)-[:PART_OF]->(Regulation)
 */

import neo4j, { Driver, Session, Integer } from "neo4j-driver";

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTION
// ═══════════════════════════════════════════════════════════════════════════════

let driver: Driver | null = null;

export function initNeo4j(): Driver | null {
  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USERNAME || process.env.NEO4J_USER || "neo4j";
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !password) {
    console.log("[Neo4j] Not configured - set NEO4J_URI and NEO4J_PASSWORD to enable graph features");
    return null;
  }

  console.log(`[Neo4j] Connecting to: ${uri} as user: ${user}`);

  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 30000,
    });
    console.log("[Neo4j] Driver initialized successfully");
    return driver;
  } catch (error) {
    console.error("[Neo4j] Failed to initialize driver:", error);
    return null;
  }
}

export function getDriver(): Driver | null {
  if (!driver) {
    driver = initNeo4j();
  }
  return driver;
}

export async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

function getSession(): Session | null {
  const d = getDriver();
  if (!d) return null;
  return d.session();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Neo4jObligation {
  obligationId: string;
  title: string;
  text: string;
  jurisdiction: string;
  mandatory: boolean;
  sourceCitation: string;
  requiredEvidenceTypes: string[];
}

export interface Neo4jSlot {
  slotId: string;
  slotName: string;
  templateId: string;
  evidenceTypes: string[];
}

export interface SlotObligationMatch {
  slotId: string;
  obligationId: string;
  confidence: number;
  matchPath: string[];
  reasoning: string;
}

export interface ObligationGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: "Obligation" | "Slot" | "Template" | "EvidenceType" | "Regulation";
  properties: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA SETUP
// ═══════════════════════════════════════════════════════════════════════════════

export async function setupGrkbSchema(): Promise<boolean> {
  const session = getSession();
  if (!session) return false;

  try {
    // Create constraints and indexes
    const constraints = [
      "CREATE CONSTRAINT obligation_id IF NOT EXISTS FOR (o:Obligation) REQUIRE o.obligationId IS UNIQUE",
      "CREATE CONSTRAINT template_id IF NOT EXISTS FOR (t:Template) REQUIRE t.templateId IS UNIQUE",
      "CREATE CONSTRAINT slot_id IF NOT EXISTS FOR (s:Slot) REQUIRE s.slotId IS UNIQUE",
      "CREATE CONSTRAINT evidence_type_id IF NOT EXISTS FOR (e:EvidenceType) REQUIRE e.typeId IS UNIQUE",
      "CREATE CONSTRAINT regulation_id IF NOT EXISTS FOR (r:Regulation) REQUIRE r.regulationId IS UNIQUE",
    ];

    const indexes = [
      "CREATE INDEX obligation_jurisdiction IF NOT EXISTS FOR (o:Obligation) ON (o.jurisdiction)",
      "CREATE INDEX obligation_mandatory IF NOT EXISTS FOR (o:Obligation) ON (o.mandatory)",
      "CREATE INDEX slot_template IF NOT EXISTS FOR (s:Slot) ON (s.templateId)",
    ];

    for (const constraint of constraints) {
      try {
        await session.run(constraint);
      } catch (e: any) {
        // Constraint may already exist
        if (!e.message?.includes("already exists")) {
          console.warn(`[Neo4j] Constraint warning:`, e.message);
        }
      }
    }

    for (const index of indexes) {
      try {
        await session.run(index);
      } catch (e: any) {
        if (!e.message?.includes("already exists")) {
          console.warn(`[Neo4j] Index warning:`, e.message);
        }
      }
    }

    console.log("[Neo4j] GRKB schema setup complete");
    return true;
  } catch (error) {
    console.error("[Neo4j] Schema setup failed:", error);
    return false;
  } finally {
    await session.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC FROM POSTGRES
// ═══════════════════════════════════════════════════════════════════════════════

export async function syncObligationsToNeo4j(obligations: Neo4jObligation[]): Promise<number> {
  const session = getSession();
  if (!session) return 0;

  let synced = 0;
  try {
    for (const obl of obligations) {
      await session.run(`
        MERGE (o:Obligation {obligationId: $obligationId})
        SET o.title = $title,
            o.text = $text,
            o.jurisdiction = $jurisdiction,
            o.mandatory = $mandatory,
            o.sourceCitation = $sourceCitation,
            o.updatedAt = datetime()
        
        WITH o
        
        // Create Regulation node and link
        MERGE (r:Regulation {regulationId: $jurisdiction})
        MERGE (o)-[:PART_OF]->(r)
        
        // Create EvidenceType nodes and links
        WITH o
        UNWIND $evidenceTypes AS evType
        MERGE (e:EvidenceType {typeId: evType})
        MERGE (o)-[:REQUIRES]->(e)
      `, {
        obligationId: obl.obligationId,
        title: obl.title,
        text: obl.text,
        jurisdiction: obl.jurisdiction,
        mandatory: obl.mandatory,
        sourceCitation: obl.sourceCitation,
        evidenceTypes: obl.requiredEvidenceTypes || [],
      });
      synced++;
    }

    console.log(`[Neo4j] Synced ${synced} obligations to graph`);
    return synced;
  } catch (error) {
    console.error("[Neo4j] Sync failed:", error);
    return synced;
  } finally {
    await session.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE & SLOT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export async function createTemplateInGraph(
  templateId: string,
  name: string,
  templateType: string,
  jurisdictions: string[]
): Promise<boolean> {
  const session = getSession();
  if (!session) return false;

  try {
    await session.run(`
      MERGE (t:Template {templateId: $templateId})
      SET t.name = $name,
          t.templateType = $templateType,
          t.jurisdictions = $jurisdictions,
          t.updatedAt = datetime()
    `, { templateId, name, templateType, jurisdictions });

    return true;
  } catch (error) {
    console.error("[Neo4j] Create template failed:", error);
    return false;
  } finally {
    await session.close();
  }
}

export async function addSlotToGraph(slot: Neo4jSlot): Promise<boolean> {
  const session = getSession();
  if (!session) return false;

  try {
    await session.run(`
      MERGE (s:Slot {slotId: $slotId})
      SET s.slotName = $slotName,
          s.templateId = $templateId,
          s.updatedAt = datetime()
      
      WITH s
      
      // Link to template
      MATCH (t:Template {templateId: $templateId})
      MERGE (t)-[:CONTAINS]->(s)
      
      WITH s
      
      // Create EvidenceType nodes and links
      UNWIND $evidenceTypes AS evType
      MERGE (e:EvidenceType {typeId: evType})
      MERGE (s)-[:ACCEPTS]->(e)
    `, {
      slotId: slot.slotId,
      slotName: slot.slotName,
      templateId: slot.templateId,
      evidenceTypes: slot.evidenceTypes || [],
    });

    return true;
  } catch (error) {
    console.error("[Neo4j] Add slot failed:", error);
    return false;
  } finally {
    await session.close();
  }
}

export async function createSlotObligationMapping(
  slotId: string,
  obligationId: string,
  confidence: number,
  matchMethod: string,
  reasoning: string
): Promise<boolean> {
  const session = getSession();
  if (!session) return false;

  try {
    await session.run(`
      MATCH (s:Slot {slotId: $slotId})
      MATCH (o:Obligation {obligationId: $obligationId})
      MERGE (s)-[r:SATISFIES]->(o)
      SET r.confidence = $confidence,
          r.matchMethod = $matchMethod,
          r.reasoning = $reasoning,
          r.createdAt = datetime()
    `, { slotId, obligationId, confidence, matchMethod, reasoning });

    return true;
  } catch (error) {
    console.error("[Neo4j] Create mapping failed:", error);
    return false;
  } finally {
    await session.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAPH QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find obligations that share evidence types with a slot
 * Uses graph traversal to find semantic connections
 */
export async function findObligationsByEvidenceGraph(
  slotId: string,
  jurisdictions: string[]
): Promise<SlotObligationMatch[]> {
  const session = getSession();
  if (!session) return [];

  try {
    const result = await session.run(`
      MATCH (s:Slot {slotId: $slotId})-[:ACCEPTS]->(e:EvidenceType)<-[:REQUIRES]-(o:Obligation)
      WHERE o.jurisdiction IN $jurisdictions AND o.mandatory = true
      WITH s, o, collect(e.typeId) AS sharedEvidence, count(e) AS matchCount
      OPTIONAL MATCH (o)-[:REQUIRES]->(allEv:EvidenceType)
      WITH o, sharedEvidence, matchCount, count(allEv) AS totalRequired
      RETURN o.obligationId AS obligationId,
             o.title AS title,
             sharedEvidence,
             matchCount,
             CASE WHEN totalRequired > 0 THEN toFloat(matchCount) / totalRequired ELSE 0.0 END AS confidence
      ORDER BY confidence DESC
      LIMIT 10
    `, { slotId, jurisdictions });

    return result.records.map(r => ({
      slotId,
      obligationId: r.get("obligationId"),
      confidence: r.get("confidence") * 100,
      matchPath: r.get("sharedEvidence"),
      reasoning: `Shared evidence types: ${r.get("sharedEvidence").join(", ")}`,
    }));
  } catch (error) {
    console.error("[Neo4j] Evidence graph query failed:", error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Get uncovered obligations for a template
 */
export async function getUncoveredObligationsGraph(
  templateId: string,
  jurisdictions: string[]
): Promise<Neo4jObligation[]> {
  const session = getSession();
  if (!session) return [];

  try {
    const result = await session.run(`
      MATCH (o:Obligation)
      WHERE o.jurisdiction IN $jurisdictions AND o.mandatory = true
      AND NOT EXISTS {
        MATCH (t:Template {templateId: $templateId})-[:CONTAINS]->(s:Slot)-[:SATISFIES]->(o)
      }
      RETURN o.obligationId AS obligationId,
             o.title AS title,
             o.text AS text,
             o.jurisdiction AS jurisdiction,
             o.mandatory AS mandatory,
             o.sourceCitation AS sourceCitation
      ORDER BY o.jurisdiction, o.obligationId
    `, { templateId, jurisdictions });

    return result.records.map(r => ({
      obligationId: r.get("obligationId"),
      title: r.get("title"),
      text: r.get("text"),
      jurisdiction: r.get("jurisdiction"),
      mandatory: r.get("mandatory"),
      sourceCitation: r.get("sourceCitation"),
      requiredEvidenceTypes: [],
    }));
  } catch (error) {
    console.error("[Neo4j] Uncovered obligations query failed:", error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Get the full obligation dependency graph
 */
export async function getObligationDependencyGraph(
  obligationId: string,
  maxDepth: number = 3
): Promise<ObligationGraph> {
  const session = getSession();
  if (!session) return { nodes: [], edges: [] };

  try {
    const result = await session.run(`
      MATCH path = (o:Obligation {obligationId: $obligationId})-[r*1..${maxDepth}]-(connected)
      WITH nodes(path) AS pathNodes, relationships(path) AS pathRels
      UNWIND pathNodes AS node
      WITH collect(DISTINCT node) AS allNodes, pathRels
      UNWIND pathRels AS rel
      WITH allNodes, collect(DISTINCT rel) AS allRels
      RETURN allNodes, allRels
    `, { obligationId });

    if (result.records.length === 0) {
      return { nodes: [], edges: [] };
    }

    const record = result.records[0];
    const allNodes = record.get("allNodes") || [];
    const allRels = record.get("allRels") || [];

    const nodes: GraphNode[] = allNodes.map((n: any) => ({
      id: n.properties.obligationId || n.properties.slotId || n.properties.typeId || n.properties.templateId,
      label: n.properties.title || n.properties.slotName || n.properties.typeId || n.properties.name || "Unknown",
      type: n.labels[0] as any,
      properties: n.properties,
    }));

    const edges: GraphEdge[] = allRels.map((r: any) => ({
      source: r.start.properties?.obligationId || r.start.properties?.slotId || String(r.startNodeElementId),
      target: r.end.properties?.obligationId || r.end.properties?.slotId || String(r.endNodeElementId),
      type: r.type,
      properties: r.properties,
    }));

    return { nodes, edges };
  } catch (error) {
    console.error("[Neo4j] Dependency graph query failed:", error);
    return { nodes: [], edges: [] };
  } finally {
    await session.close();
  }
}

/**
 * Get template coverage statistics
 */
export async function getTemplateCoverageStats(
  templateId: string,
  jurisdictions: string[]
): Promise<{
  totalObligations: number;
  coveredObligations: number;
  coveragePercent: number;
  byJurisdiction: Record<string, { total: number; covered: number }>;
}> {
  const session = getSession();
  if (!session) {
    return { totalObligations: 0, coveredObligations: 0, coveragePercent: 0, byJurisdiction: {} };
  }

  try {
    const result = await session.run(`
      // Get total mandatory obligations per jurisdiction
      MATCH (o:Obligation)
      WHERE o.jurisdiction IN $jurisdictions AND o.mandatory = true
      WITH o.jurisdiction AS jurisdiction, collect(o.obligationId) AS allObligations
      
      // Get covered obligations
      OPTIONAL MATCH (t:Template {templateId: $templateId})-[:CONTAINS]->(s:Slot)-[:SATISFIES]->(covered:Obligation)
      WHERE covered.jurisdiction = jurisdiction
      WITH jurisdiction, allObligations, collect(DISTINCT covered.obligationId) AS coveredObligations
      
      RETURN jurisdiction,
             size(allObligations) AS total,
             size(coveredObligations) AS covered
    `, { templateId, jurisdictions });

    const byJurisdiction: Record<string, { total: number; covered: number }> = {};
    let totalObligations = 0;
    let coveredObligations = 0;

    for (const r of result.records) {
      const jur = r.get("jurisdiction");
      const total = (r.get("total") as Integer).toNumber();
      const covered = (r.get("covered") as Integer).toNumber();
      byJurisdiction[jur] = { total, covered };
      totalObligations += total;
      coveredObligations += covered;
    }

    return {
      totalObligations,
      coveredObligations,
      coveragePercent: totalObligations > 0 ? Math.round((coveredObligations / totalObligations) * 100) : 100,
      byJurisdiction,
    };
  } catch (error) {
    console.error("[Neo4j] Coverage stats query failed:", error);
    return { totalObligations: 0, coveredObligations: 0, coveragePercent: 0, byJurisdiction: {} };
  } finally {
    await session.close();
  }
}

/**
 * Clear all mappings for a template (before re-grounding)
 */
export async function clearTemplateMappings(templateId: string): Promise<void> {
  const session = getSession();
  if (!session) return;

  try {
    await session.run(`
      MATCH (t:Template {templateId: $templateId})-[:CONTAINS]->(s:Slot)-[r:SATISFIES]->()
      DELETE r
    `, { templateId });
  } catch (error) {
    console.error("[Neo4j] Clear mappings failed:", error);
  } finally {
    await session.close();
  }
}

/**
 * Health check
 */
export async function neo4jHealthCheck(): Promise<boolean> {
  const session = getSession();
  if (!session) return false;

  try {
    await session.run("RETURN 1");
    return true;
  } catch (error: any) {
    console.error("[Neo4j] Health check failed:", error.message || error);
    return false;
  } finally {
    await session.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MDCG 2022-21 SPECIFIC QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

export interface MDCGAnnex {
  templateId: string;
  name: string;
  annexNumber: string;
  description: string;
}

export interface DeviceRequirement {
  requirementId: string;
  deviceType: string;
  deviceClass: string;
  isImplantable: boolean;
  frequency: string;
  frequencyMonths: number;
  eudamedSubmission: boolean;
  firstPsurDue: string;
  mandatoryTables: string[];
  timeBuckets: string[];
}

export interface AnnexIITable {
  tableId: string;
  tableKey: string;
  title: string;
  description: string;
  regulatoryReference: string;
  mandatoryForClasses: string[];
  terminologyStandard?: string;
}

export interface ValidationRule {
  ruleId: string;
  requirement: string;
  mandatory: boolean;
}

export interface AssessmentRule {
  ruleId: string;
  name: string;
  description: string;
  required: boolean;
  validationPrompt?: string;
}

/**
 * Get all MDCG 2022-21 Annex templates
 */
export async function getMDCGAnnexes(): Promise<MDCGAnnex[]> {
  const session = getSession();
  if (!session) return [];

  try {
    const result = await session.run(`
      MATCH (t:Template)-[:DEFINED_BY]->(r:Regulation {regulationId: 'MDCG_2022_21'})
      RETURN t.templateId AS templateId,
             t.name AS name,
             t.annexNumber AS annexNumber,
             t.description AS description
      ORDER BY t.annexNumber
    `);

    return result.records.map(r => ({
      templateId: r.get("templateId"),
      name: r.get("name"),
      annexNumber: r.get("annexNumber"),
      description: r.get("description") || "",
    }));
  } catch (error) {
    console.error("[Neo4j] getMDCGAnnexes failed:", error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Get device requirements from Annex IV
 */
export async function getDeviceRequirements(deviceClass: string, isImplantable: boolean = false): Promise<DeviceRequirement | null> {
  const session = getSession();
  if (!session) return null;

  try {
    const result = await session.run(`
      MATCH (dr:DeviceRequirement)
      WHERE dr.deviceClass = $deviceClass AND dr.isImplantable = $isImplantable
      RETURN dr
      LIMIT 1
    `, { deviceClass, isImplantable });

    if (result.records.length === 0) return null;

    const dr = result.records[0].get("dr").properties;
    return {
      requirementId: dr.requirementId,
      deviceType: dr.deviceType,
      deviceClass: dr.deviceClass,
      isImplantable: dr.isImplantable,
      frequency: dr.frequency,
      frequencyMonths: dr.frequencyMonths,
      eudamedSubmission: dr.eudamedSubmission,
      firstPsurDue: dr.firstPsurDue || "",
      mandatoryTables: dr.mandatoryTables || [],
      timeBuckets: dr.timeBuckets || [],
    };
  } catch (error) {
    console.error("[Neo4j] getDeviceRequirements failed:", error);
    return null;
  } finally {
    await session.close();
  }
}

/**
 * Get all Annex II mandatory tables
 */
export async function getAnnexIITables(): Promise<AnnexIITable[]> {
  const session = getSession();
  if (!session) return [];

  try {
    const result = await session.run(`
      MATCH (t:Template {templateId: 'MDCG_2022_21_ANNEX_II'})-[:DEFINES_TABLE]->(at:AnnexTable)
      RETURN at
      ORDER BY at.tableKey
    `);

    return result.records.map(r => {
      const at = r.get("at").properties;
      return {
        tableId: at.tableId,
        tableKey: at.tableKey,
        title: at.title,
        description: at.description || "",
        regulatoryReference: at.regulatoryReference || "",
        mandatoryForClasses: at.mandatoryForClasses || [],
        terminologyStandard: at.terminologyStandard,
      };
    });
  } catch (error) {
    console.error("[Neo4j] getAnnexIITables failed:", error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Get mandatory tables for a device class
 */
export async function getMandatoryTablesForDevice(deviceClass: string, isImplantable: boolean = false): Promise<AnnexIITable[]> {
  const session = getSession();
  if (!session) return [];

  try {
    const result = await session.run(`
      MATCH (dr:DeviceRequirement)-[:REQUIRES_TABLE]->(at:AnnexTable)
      WHERE dr.deviceClass = $deviceClass AND dr.isImplantable = $isImplantable
      RETURN at
      ORDER BY at.tableKey
    `, { deviceClass, isImplantable });

    return result.records.map(r => {
      const at = r.get("at").properties;
      return {
        tableId: at.tableId,
        tableKey: at.tableKey,
        title: at.title,
        description: at.description || "",
        regulatoryReference: at.regulatoryReference || "",
        mandatoryForClasses: at.mandatoryForClasses || [],
        terminologyStandard: at.terminologyStandard,
      };
    });
  } catch (error) {
    console.error("[Neo4j] getMandatoryTablesForDevice failed:", error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Get Annex III validation rules
 */
export async function getAnnexIIIValidationRules(): Promise<ValidationRule[]> {
  const session = getSession();
  if (!session) return [];

  try {
    const result = await session.run(`
      MATCH (t:Template {templateId: 'MDCG_2022_21_ANNEX_III'})-[:DEFINES_RULE]->(vr:ValidationRule)
      RETURN vr
      ORDER BY vr.ruleId
    `);

    return result.records.map(r => {
      const vr = r.get("vr").properties;
      return {
        ruleId: vr.ruleId,
        requirement: vr.requirement,
        mandatory: vr.mandatory ?? true,
      };
    });
  } catch (error) {
    console.error("[Neo4j] getAnnexIIIValidationRules failed:", error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Get Annex III assessment rules
 */
export async function getAnnexIIIAssessmentRules(): Promise<AssessmentRule[]> {
  const session = getSession();
  if (!session) return [];

  try {
    const result = await session.run(`
      MATCH (t:Template {templateId: 'MDCG_2022_21_ANNEX_III'})-[:DEFINES_ASSESSMENT]->(ar:AssessmentRule)
      RETURN ar
      ORDER BY ar.ruleId
    `);

    return result.records.map(r => {
      const ar = r.get("ar").properties;
      return {
        ruleId: ar.ruleId,
        name: ar.name,
        description: ar.description || "",
        required: ar.required ?? false,
        validationPrompt: ar.validationPrompt,
      };
    });
  } catch (error) {
    console.error("[Neo4j] getAnnexIIIAssessmentRules failed:", error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Get full MDCG compliance graph for a template
 */
export async function getMDCGComplianceGraph(templateId: string): Promise<ObligationGraph> {
  const session = getSession();
  if (!session) return { nodes: [], edges: [] };

  try {
    const result = await session.run(`
      // Get template and related structures
      MATCH (t:Template {templateId: $templateId})
      OPTIONAL MATCH (t)-[:CONTAINS]->(s:Slot)
      OPTIONAL MATCH (s)-[:SATISFIES]->(o:Obligation)
      OPTIONAL MATCH (s)-[:ACCEPTS]->(e:EvidenceType)
      OPTIONAL MATCH (o)-[:REQUIRES]->(re:EvidenceType)
      OPTIONAL MATCH (o)-[:PART_OF]->(r:Regulation)
      
      WITH collect(DISTINCT t) + collect(DISTINCT s) + collect(DISTINCT o) + 
           collect(DISTINCT e) + collect(DISTINCT re) + collect(DISTINCT r) AS allNodes
      
      MATCH (t:Template {templateId: $templateId})
      OPTIONAL MATCH (t)-[r1:CONTAINS]->(s:Slot)
      OPTIONAL MATCH (s)-[r2:SATISFIES]->(o:Obligation)
      OPTIONAL MATCH (s)-[r3:ACCEPTS]->(e:EvidenceType)
      OPTIONAL MATCH (o)-[r4:REQUIRES]->(re:EvidenceType)
      OPTIONAL MATCH (o)-[r5:PART_OF]->(reg:Regulation)
      
      WITH allNodes,
           collect(DISTINCT r1) + collect(DISTINCT r2) + collect(DISTINCT r3) + 
           collect(DISTINCT r4) + collect(DISTINCT r5) AS allRels
      
      RETURN allNodes, allRels
    `, { templateId });

    if (result.records.length === 0) {
      return { nodes: [], edges: [] };
    }

    const record = result.records[0];
    const allNodes = (record.get("allNodes") || []).filter((n: any) => n !== null);
    const allRels = (record.get("allRels") || []).filter((r: any) => r !== null);

    const nodes: GraphNode[] = allNodes.map((n: any) => {
      const props = n.properties || {};
      const labels = n.labels || [];
      return {
        id: props.templateId || props.slotId || props.obligationId || props.typeId || props.regulationId || "unknown",
        label: props.name || props.title || props.slotName || props.typeId || "Unknown",
        type: labels[0] as any,
        properties: props,
      };
    });

    const edges: GraphEdge[] = allRels.map((r: any) => ({
      source: String(r.startNodeElementId || ""),
      target: String(r.endNodeElementId || ""),
      type: r.type,
      properties: r.properties,
    }));

    return { nodes, edges };
  } catch (error) {
    console.error("[Neo4j] getMDCGComplianceGraph failed:", error);
    return { nodes: [], edges: [] };
  } finally {
    await session.close();
  }
}

/**
 * Find obligations linked to a specific Annex II table
 */
export async function getObligationsForAnnexIITable(tableKey: string): Promise<Neo4jObligation[]> {
  const session = getSession();
  if (!session) return [];

  try {
    const result = await session.run(`
      MATCH (at:AnnexTable {tableKey: $tableKey})<-[:REQUIRES_EVIDENCE]-(e:EvidenceType)<-[:REQUIRES]-(o:Obligation)
      RETURN DISTINCT o.obligationId AS obligationId,
             o.title AS title,
             o.text AS text,
             o.jurisdiction AS jurisdiction,
             o.mandatory AS mandatory,
             o.sourceCitation AS sourceCitation
      ORDER BY o.obligationId
    `, { tableKey });

    return result.records.map(r => ({
      obligationId: r.get("obligationId"),
      title: r.get("title"),
      text: r.get("text"),
      jurisdiction: r.get("jurisdiction"),
      mandatory: r.get("mandatory"),
      sourceCitation: r.get("sourceCitation") || "",
      requiredEvidenceTypes: [],
    }));
  } catch (error) {
    console.error("[Neo4j] getObligationsForAnnexIITable failed:", error);
    return [];
  } finally {
    await session.close();
  }
}

/**
 * Validate a PSUR against MDCG requirements in the graph
 */
export async function validatePSURAgainstMDCG(
  templateId: string,
  deviceClass: string,
  isImplantable: boolean,
  availableEvidenceTypes: string[]
): Promise<{
  valid: boolean;
  missingTables: string[];
  missingEvidenceTypes: string[];
  uncoveredObligations: string[];
  warnings: string[];
}> {
  const session = getSession();
  if (!session) {
    return {
      valid: false,
      missingTables: [],
      missingEvidenceTypes: [],
      uncoveredObligations: [],
      warnings: ["Neo4j not available"],
    };
  }

  try {
    // Get device requirements
    const deviceReqs = await getDeviceRequirements(deviceClass, isImplantable);
    if (!deviceReqs) {
      return {
        valid: false,
        missingTables: [],
        missingEvidenceTypes: [],
        uncoveredObligations: [],
        warnings: [`No requirements found for device class ${deviceClass}`],
      };
    }

    // Get mandatory tables for device
    const mandatoryTables = await getMandatoryTablesForDevice(deviceClass, isImplantable);
    const missingTables: string[] = [];
    const missingEvidenceTypes: string[] = [];

    // Check each mandatory table's evidence requirements
    for (const table of mandatoryTables) {
      const result = await session.run(`
        MATCH (at:AnnexTable {tableId: $tableId})-[:REQUIRES_EVIDENCE]->(e:EvidenceType)
        RETURN collect(e.typeId) AS requiredTypes
      `, { tableId: table.tableId });

      if (result.records.length > 0) {
        const requiredTypes = result.records[0].get("requiredTypes") as string[];
        const missing = requiredTypes.filter(t => !availableEvidenceTypes.includes(t));
        if (missing.length > 0) {
          missingTables.push(table.tableKey);
          missingEvidenceTypes.push(...missing);
        }
      }
    }

    // Get uncovered obligations
    const uncoveredResult = await session.run(`
      MATCH (o:Obligation)
      WHERE o.mandatory = true
        AND NOT EXISTS {
          MATCH (t:Template {templateId: $templateId})-[:CONTAINS]->(s:Slot)-[:SATISFIES]->(o)
        }
      RETURN collect(o.obligationId) AS uncoveredIds
    `, { templateId });

    const uncoveredObligations = uncoveredResult.records.length > 0
      ? uncoveredResult.records[0].get("uncoveredIds") as string[]
      : [];

    // Dedupe missing evidence types
    const uniqueMissingEvidence = [...new Set(missingEvidenceTypes)];

    const valid = missingTables.length === 0 && uniqueMissingEvidence.length === 0;

    return {
      valid,
      missingTables,
      missingEvidenceTypes: uniqueMissingEvidence,
      uncoveredObligations,
      warnings: [],
    };
  } catch (error) {
    console.error("[Neo4j] validatePSURAgainstMDCG failed:", error);
    return {
      valid: false,
      missingTables: [],
      missingEvidenceTypes: [],
      uncoveredObligations: [],
      warnings: [`Validation error: ${error}`],
    };
  } finally {
    await session.close();
  }
}

/**
 * Get graph statistics for MDCG compliance dashboard
 */
export async function getMDCGGraphStats(): Promise<{
  totalObligations: number;
  totalSlots: number;
  totalEvidenceTypes: number;
  totalAnnexTables: number;
  totalValidationRules: number;
  totalAssessmentRules: number;
  totalDeviceRequirements: number;
  byJurisdiction: Record<string, number>;
}> {
  const session = getSession();
  if (!session) {
    return {
      totalObligations: 0,
      totalSlots: 0,
      totalEvidenceTypes: 0,
      totalAnnexTables: 0,
      totalValidationRules: 0,
      totalAssessmentRules: 0,
      totalDeviceRequirements: 0,
      byJurisdiction: {},
    };
  }

  try {
    const result = await session.run(`
      MATCH (o:Obligation) 
      WITH count(o) AS obligations, 
           reduce(m = {}, o IN collect(o) | 
             CASE WHEN m[o.jurisdiction] IS NULL 
               THEN m + {[o.jurisdiction]: 1} 
               ELSE m + {[o.jurisdiction]: m[o.jurisdiction] + 1} 
             END
           ) AS byJur
      
      MATCH (s:Slot) WITH obligations, byJur, count(s) AS slots
      MATCH (e:EvidenceType) WITH obligations, byJur, slots, count(e) AS evidenceTypes
      MATCH (at:AnnexTable) WITH obligations, byJur, slots, evidenceTypes, count(at) AS annexTables
      MATCH (vr:ValidationRule) WITH obligations, byJur, slots, evidenceTypes, annexTables, count(vr) AS validationRules
      MATCH (ar:AssessmentRule) WITH obligations, byJur, slots, evidenceTypes, annexTables, validationRules, count(ar) AS assessmentRules
      MATCH (dr:DeviceRequirement) 
      
      RETURN obligations, slots, evidenceTypes, annexTables, validationRules, assessmentRules, 
             count(dr) AS deviceRequirements, byJur
    `);

    if (result.records.length === 0) {
      return {
        totalObligations: 0,
        totalSlots: 0,
        totalEvidenceTypes: 0,
        totalAnnexTables: 0,
        totalValidationRules: 0,
        totalAssessmentRules: 0,
        totalDeviceRequirements: 0,
        byJurisdiction: {},
      };
    }

    const r = result.records[0];
    return {
      totalObligations: (r.get("obligations") as any)?.toNumber?.() || r.get("obligations") || 0,
      totalSlots: (r.get("slots") as any)?.toNumber?.() || r.get("slots") || 0,
      totalEvidenceTypes: (r.get("evidenceTypes") as any)?.toNumber?.() || r.get("evidenceTypes") || 0,
      totalAnnexTables: (r.get("annexTables") as any)?.toNumber?.() || r.get("annexTables") || 0,
      totalValidationRules: (r.get("validationRules") as any)?.toNumber?.() || r.get("validationRules") || 0,
      totalAssessmentRules: (r.get("assessmentRules") as any)?.toNumber?.() || r.get("assessmentRules") || 0,
      totalDeviceRequirements: (r.get("deviceRequirements") as any)?.toNumber?.() || r.get("deviceRequirements") || 0,
      byJurisdiction: r.get("byJur") || {},
    };
  } catch (error) {
    console.error("[Neo4j] getMDCGGraphStats failed:", error);
    return {
      totalObligations: 0,
      totalSlots: 0,
      totalEvidenceTypes: 0,
      totalAnnexTables: 0,
      totalValidationRules: 0,
      totalAssessmentRules: 0,
      totalDeviceRequirements: 0,
      byJurisdiction: {},
    };
  } finally {
    await session.close();
  }
}
