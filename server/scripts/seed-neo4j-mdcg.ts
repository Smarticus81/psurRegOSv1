/**
 * NEO4J MDCG 2022-21 SEED SCRIPT
 * 
 * Comprehensive seeding of MDCG 2022-21 Annex I, II, III, IV to Neo4j graph database.
 * Creates the full regulatory knowledge graph with:
 * - Regulation nodes (EU_MDR, UK_MDR)
 * - Template nodes (MDCG Annexes)
 * - Obligation nodes with all EU MDR/UK MDR requirements
 * - Slot nodes from template definitions
 * - EvidenceType nodes
 * - All relationships (PART_OF, REQUIRES, SATISFIES, CONTAINS, DEPENDS_ON)
 * 
 * Run: npx tsx server/scripts/seed-neo4j-mdcg.ts
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load environment
const envPath = resolve(process.cwd(), ".env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join("=").trim();
    }
  }
  console.log("[Neo4j MDCG Seed] Loaded environment from .env");
} catch {
  console.log("[Neo4j MDCG Seed] No .env file found, using existing environment");
}

import neo4j, { Driver, Session } from "neo4j-driver";
import {
  grkbObligations,
  psurSections,
  psurEvidenceTypes,
  psurObligationDependencies,
  psurSlotObligations,
  slotDefinitions,
  templates,
} from "@shared/schema";

// ═══════════════════════════════════════════════════════════════════════════════
// NEO4J CONNECTION
// ═══════════════════════════════════════════════════════════════════════════════

let driver: Driver | null = null;

function initNeo4j(): Driver | null {
  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USERNAME || process.env.NEO4J_USER || "neo4j";
  const password = process.env.NEO4J_PASSWORD;

  if (!uri || !password) {
    console.error("[Neo4j MDCG Seed] ERROR: NEO4J_URI and NEO4J_PASSWORD must be set");
    console.error("  Set these in your .env file:");
    console.error("    NEO4J_URI=bolt://localhost:7687");
    console.error("    NEO4J_PASSWORD=your_password");
    return null;
  }

  console.log(`[Neo4j MDCG Seed] Connecting to: ${uri} as user: ${user}`);

  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 30000,
    });
    return driver;
  } catch (error) {
    console.error("[Neo4j MDCG Seed] Failed to initialize driver:", error);
    return null;
  }
}

async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA SETUP
// ═══════════════════════════════════════════════════════════════════════════════

async function setupSchema(session: Session): Promise<void> {
  console.log("\n[Neo4j MDCG Seed] Setting up schema constraints and indexes...");

  const constraints = [
    "CREATE CONSTRAINT obligation_id IF NOT EXISTS FOR (o:Obligation) REQUIRE o.obligationId IS UNIQUE",
    "CREATE CONSTRAINT template_id IF NOT EXISTS FOR (t:Template) REQUIRE t.templateId IS UNIQUE",
    "CREATE CONSTRAINT slot_id IF NOT EXISTS FOR (s:Slot) REQUIRE s.slotId IS UNIQUE",
    "CREATE CONSTRAINT evidence_type_id IF NOT EXISTS FOR (e:EvidenceType) REQUIRE e.typeId IS UNIQUE",
    "CREATE CONSTRAINT regulation_id IF NOT EXISTS FOR (r:Regulation) REQUIRE r.regulationId IS UNIQUE",
    "CREATE CONSTRAINT section_id IF NOT EXISTS FOR (sec:Section) REQUIRE sec.sectionId IS UNIQUE",
    "CREATE CONSTRAINT annex_table_id IF NOT EXISTS FOR (at:AnnexTable) REQUIRE at.tableId IS UNIQUE",
  ];

  const indexes = [
    "CREATE INDEX obligation_jurisdiction IF NOT EXISTS FOR (o:Obligation) ON (o.jurisdiction)",
    "CREATE INDEX obligation_mandatory IF NOT EXISTS FOR (o:Obligation) ON (o.mandatory)",
    "CREATE INDEX obligation_artifact IF NOT EXISTS FOR (o:Obligation) ON (o.artifactType)",
    "CREATE INDEX slot_template IF NOT EXISTS FOR (s:Slot) ON (s.templateId)",
    "CREATE INDEX section_template IF NOT EXISTS FOR (sec:Section) ON (sec.templateId)",
    "CREATE INDEX template_jurisdiction IF NOT EXISTS FOR (t:Template) ON (t.jurisdictions)",
  ];

  for (const constraint of constraints) {
    try {
      await session.run(constraint);
    } catch (e: any) {
      if (!e.message?.includes("already exists")) {
        console.warn(`  Constraint warning: ${e.message}`);
      }
    }
  }

  for (const index of indexes) {
    try {
      await session.run(index);
    } catch (e: any) {
      if (!e.message?.includes("already exists")) {
        console.warn(`  Index warning: ${e.message}`);
      }
    }
  }

  console.log("  Schema setup complete");
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED REGULATIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function seedRegulations(session: Session): Promise<void> {
  console.log("\n[Neo4j MDCG Seed] Seeding Regulation nodes...");

  const regulations = [
    {
      regulationId: "EU_MDR",
      name: "EU Medical Device Regulation 2017/745",
      shortName: "EU MDR",
      effectiveDate: "2021-05-26",
      jurisdiction: "EU",
    },
    {
      regulationId: "UK_MDR",
      name: "UK Medical Devices Regulations 2002 (as amended)",
      shortName: "UK MDR",
      effectiveDate: "2021-01-01",
      jurisdiction: "UK",
    },
    {
      regulationId: "MDCG_2022_21",
      name: "MDCG 2022-21 Guidance on PSUR",
      shortName: "MDCG 2022-21",
      effectiveDate: "2022-12-01",
      jurisdiction: "EU",
      parentRegulation: "EU_MDR",
    },
  ];

  for (const reg of regulations) {
    await session.run(`
      MERGE (r:Regulation {regulationId: $regulationId})
      SET r.name = $name,
          r.shortName = $shortName,
          r.effectiveDate = $effectiveDate,
          r.jurisdiction = $jurisdiction,
          r.updatedAt = datetime()
    `, reg);

    // Link MDCG to EU MDR
    if (reg.parentRegulation) {
      await session.run(`
        MATCH (child:Regulation {regulationId: $childId})
        MATCH (parent:Regulation {regulationId: $parentId})
        MERGE (child)-[:IMPLEMENTS]->(parent)
      `, { childId: reg.regulationId, parentId: reg.parentRegulation });
    }
  }

  console.log(`  Created ${regulations.length} Regulation nodes`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED TEMPLATES (MDCG Annexes)
// ═══════════════════════════════════════════════════════════════════════════════

async function seedTemplates(session: Session): Promise<void> {
  console.log("\n[Neo4j MDCG Seed] Seeding Template nodes (MDCG Annexes)...");

  const templateFiles = [
    { path: "server/templates/MDCG_2022_21_ANNEX_I.json", annexNumber: "I" },
    { path: "server/templates/MDCG_2022_21_ANNEX_II.json", annexNumber: "II" },
    { path: "server/templates/MDCG_2022_21_ANNEX_III.json", annexNumber: "III" },
    { path: "server/templates/MDCG_2022_21_ANNEX_IV.json", annexNumber: "IV" },
  ];

  let count = 0;
  for (const tf of templateFiles) {
    const fullPath = resolve(process.cwd(), tf.path);
    if (!existsSync(fullPath)) {
      console.warn(`  WARNING: Template file not found: ${tf.path}`);
      continue;
    }

    const template = JSON.parse(readFileSync(fullPath, "utf-8"));
    
    await session.run(`
      MERGE (t:Template {templateId: $templateId})
      SET t.name = $name,
          t.version = $version,
          t.annexNumber = $annexNumber,
          t.description = $description,
          t.jurisdictions = $jurisdictions,
          t.updatedAt = datetime()
      
      WITH t
      MATCH (r:Regulation {regulationId: 'MDCG_2022_21'})
      MERGE (t)-[:DEFINED_BY]->(r)
    `, {
      templateId: template.template_id,
      name: template.name,
      version: template.version || "1.0.0",
      annexNumber: tf.annexNumber,
      description: template.description || "",
      jurisdictions: template.jurisdiction_scope || ["EU_MDR"],
    });

    count++;
  }

  console.log(`  Created ${count} Template nodes`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED ANNEX II TABLES
// ═══════════════════════════════════════════════════════════════════════════════

async function seedAnnexIITables(session: Session): Promise<void> {
  console.log("\n[Neo4j MDCG Seed] Seeding Annex II Table definitions...");

  const annexIIPath = resolve(process.cwd(), "server/templates/MDCG_2022_21_ANNEX_II.json");
  if (!existsSync(annexIIPath)) {
    console.warn("  WARNING: MDCG_2022_21_ANNEX_II.json not found");
    return;
  }

  const annexII = JSON.parse(readFileSync(annexIIPath, "utf-8"));
  const tables = annexII.tables || {};

  let count = 0;
  for (const [tableKey, tableSpec] of Object.entries(tables) as [string, any][]) {
    await session.run(`
      MERGE (at:AnnexTable {tableId: $tableId})
      SET at.tableKey = $tableKey,
          at.title = $title,
          at.description = $description,
          at.regulatoryReference = $regulatoryReference,
          at.mandatoryForClasses = $mandatoryForClasses,
          at.terminologyStandard = $terminologyStandard,
          at.updatedAt = datetime()
      
      WITH at
      MATCH (t:Template {templateId: 'MDCG_2022_21_ANNEX_II'})
      MERGE (t)-[:DEFINES_TABLE]->(at)
    `, {
      tableId: tableSpec.table_id || `MDCG.ANNEXII.${tableKey.toUpperCase()}`,
      tableKey,
      title: tableSpec.title || tableKey,
      description: tableSpec.description || "",
      regulatoryReference: tableSpec.regulatory_reference || "",
      mandatoryForClasses: tableSpec.mandatory_for_classes || [],
      terminologyStandard: tableSpec.terminology_standard || null,
    });

    // Link evidence requirements
    const evidenceTypes = tableSpec.evidence_requirements?.required_types || [];
    for (const evType of evidenceTypes) {
      await session.run(`
        MATCH (at:AnnexTable {tableId: $tableId})
        MERGE (e:EvidenceType {typeId: $evType})
        MERGE (at)-[:REQUIRES_EVIDENCE]->(e)
      `, { tableId: tableSpec.table_id || `MDCG.ANNEXII.${tableKey.toUpperCase()}`, evType });
    }

    count++;
  }

  console.log(`  Created ${count} Annex II Table nodes`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED OBLIGATIONS FROM POSTGRES
// ═══════════════════════════════════════════════════════════════════════════════

async function seedObligationsFromPostgres(session: Session): Promise<void> {
  console.log("\n[Neo4j MDCG Seed] Syncing Obligations from PostgreSQL...");

  const { db } = await import("../db");
  
  const obligations = await db.select().from(grkbObligations);
  console.log(`  Found ${obligations.length} obligations in PostgreSQL`);

  let count = 0;
  for (const obl of obligations) {
    await session.run(`
      MERGE (o:Obligation {obligationId: $obligationId})
      SET o.title = $title,
          o.text = $text,
          o.jurisdiction = $jurisdiction,
          o.artifactType = $artifactType,
          o.kind = $kind,
          o.mandatory = $mandatory,
          o.sourceCitation = $sourceCitation,
          o.version = $version,
          o.updatedAt = datetime()
      
      WITH o
      
      // Link to Regulation
      MATCH (r:Regulation {regulationId: $jurisdiction})
      MERGE (o)-[:PART_OF]->(r)
    `, {
      obligationId: obl.obligationId,
      title: obl.title,
      text: obl.text,
      jurisdiction: obl.jurisdiction,
      artifactType: obl.artifactType,
      kind: obl.kind,
      mandatory: obl.mandatory,
      sourceCitation: obl.sourceCitation || "",
      version: obl.version,
    });

    // Link required evidence types
    const evidenceTypes = (obl.requiredEvidenceTypes as string[]) || [];
    for (const evType of evidenceTypes) {
      await session.run(`
        MATCH (o:Obligation {obligationId: $obligationId})
        MERGE (e:EvidenceType {typeId: $evType})
        MERGE (o)-[:REQUIRES]->(e)
      `, { obligationId: obl.obligationId, evType });
    }

    count++;
  }

  console.log(`  Synced ${count} Obligations to Neo4j`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED EVIDENCE TYPES FROM POSTGRES
// ═══════════════════════════════════════════════════════════════════════════════

async function seedEvidenceTypes(session: Session): Promise<void> {
  console.log("\n[Neo4j MDCG Seed] Syncing Evidence Types from PostgreSQL...");

  const { db } = await import("../db");
  
  const evidenceTypes = await db.select().from(psurEvidenceTypes);
  console.log(`  Found ${evidenceTypes.length} evidence types in PostgreSQL`);

  let count = 0;
  for (const et of evidenceTypes) {
    await session.run(`
      MERGE (e:EvidenceType {typeId: $typeId})
      SET e.displayName = $displayName,
          e.description = $description,
          e.category = $category,
          e.requiredFields = $requiredFields,
          e.optionalFields = $optionalFields,
          e.expectedSourceTypes = $expectedSourceTypes,
          e.supportsClassification = $supportsClassification,
          e.typicalPsurSections = $typicalPsurSections,
          e.isActive = $isActive,
          e.updatedAt = datetime()
    `, {
      typeId: et.evidenceTypeId,
      displayName: et.displayName,
      description: et.description || "",
      category: et.category,
      requiredFields: et.requiredFields || [],
      optionalFields: et.optionalFields || [],
      expectedSourceTypes: et.expectedSourceTypes || [],
      supportsClassification: et.supportsClassification || false,
      typicalPsurSections: et.typicalPsurSections || [],
      isActive: et.isActive ?? true,
    });
    count++;
  }

  console.log(`  Synced ${count} Evidence Types to Neo4j`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED PSUR SECTIONS FROM POSTGRES
// ═══════════════════════════════════════════════════════════════════════════════

async function seedSections(session: Session): Promise<void> {
  console.log("\n[Neo4j MDCG Seed] Syncing PSUR Sections from PostgreSQL...");

  const { db } = await import("../db");
  
  const sections = await db.select().from(psurSections);
  console.log(`  Found ${sections.length} sections in PostgreSQL`);

  let count = 0;
  for (const sec of sections) {
    await session.run(`
      MERGE (s:Section {sectionId: $sectionId})
      SET s.title = $title,
          s.sectionNumber = $sectionNumber,
          s.sectionPath = $sectionPath,
          s.sectionType = $sectionType,
          s.mandatory = $mandatory,
          s.templateId = $templateId,
          s.displayOrder = $displayOrder,
          s.regulatoryBasis = $regulatoryBasis,
          s.updatedAt = datetime()
      
      WITH s
      
      // Link to Template
      MATCH (t:Template {templateId: $templateId})
      MERGE (t)-[:CONTAINS_SECTION]->(s)
    `, {
      sectionId: sec.sectionId,
      title: sec.title,
      sectionNumber: sec.sectionNumber,
      sectionPath: sec.sectionPath,
      sectionType: sec.sectionType,
      mandatory: sec.mandatory ?? true,
      templateId: sec.templateId,
      displayOrder: sec.displayOrder,
      regulatoryBasis: sec.regulatoryBasis || "",
    });

    // Link parent sections
    if (sec.parentSectionId) {
      await session.run(`
        MATCH (child:Section {sectionId: $childId})
        MATCH (parent:Section {sectionId: $parentId})
        MERGE (child)-[:CHILD_OF]->(parent)
      `, { childId: sec.sectionId, parentId: sec.parentSectionId });
    }

    // Link required evidence types
    const evidenceTypes = sec.requiredEvidenceTypes || [];
    for (const evType of evidenceTypes) {
      await session.run(`
        MATCH (s:Section {sectionId: $sectionId})
        MERGE (e:EvidenceType {typeId: $evType})
        MERGE (s)-[:REQUIRES]->(e)
      `, { sectionId: sec.sectionId, evType });
    }

    count++;
  }

  console.log(`  Synced ${count} Sections to Neo4j`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED SLOT DEFINITIONS FROM POSTGRES
// ═══════════════════════════════════════════════════════════════════════════════

async function seedSlots(session: Session): Promise<void> {
  console.log("\n[Neo4j MDCG Seed] Syncing Slot Definitions from PostgreSQL...");

  const { db } = await import("../db");
  
  const slots = await db.select().from(slotDefinitions);
  console.log(`  Found ${slots.length} slots in PostgreSQL`);

  let count = 0;
  for (const slot of slots) {
    await session.run(`
      MERGE (s:Slot {slotId: $slotId})
      SET s.title = $title,
          s.description = $description,
          s.templateId = $templateId,
          s.jurisdictions = $jurisdictions,
          s.hardRequireEvidence = $hardRequireEvidence,
          s.minAtoms = $minAtoms,
          s.sortOrder = $sortOrder,
          s.updatedAt = datetime()
      
      WITH s
      
      // Link to Template
      MATCH (t:Template {templateId: $templateId})
      MERGE (t)-[:CONTAINS]->(s)
    `, {
      slotId: slot.slotId,
      title: slot.title,
      description: slot.description || "",
      templateId: slot.templateId,
      jurisdictions: slot.jurisdictions || [],
      hardRequireEvidence: slot.hardRequireEvidence ?? true,
      minAtoms: slot.minAtoms ?? 1,
      sortOrder: slot.sortOrder ?? 0,
    });

    // Link required evidence types
    const evidenceTypes = (slot.requiredEvidenceTypes as string[]) || [];
    for (const evType of evidenceTypes) {
      await session.run(`
        MATCH (s:Slot {slotId: $slotId})
        MERGE (e:EvidenceType {typeId: $evType})
        MERGE (s)-[:ACCEPTS]->(e)
      `, { slotId: slot.slotId, evType });
    }

    count++;
  }

  console.log(`  Synced ${count} Slots to Neo4j`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED OBLIGATION DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════════

async function seedObligationDependencies(session: Session): Promise<void> {
  console.log("\n[Neo4j MDCG Seed] Syncing Obligation Dependencies...");

  const { db } = await import("../db");
  
  const deps = await db.select().from(psurObligationDependencies);
  console.log(`  Found ${deps.length} dependencies in PostgreSQL`);

  let count = 0;
  for (const dep of deps) {
    const relType = dep.relationType.toUpperCase().replace(/-/g, "_");
    
    await session.run(`
      MATCH (from:Obligation {obligationId: $fromId})
      MATCH (to:Obligation {obligationId: $toId})
      MERGE (from)-[r:${relType}]->(to)
      SET r.strength = $strength,
          r.description = $description,
          r.regulatoryBasis = $regulatoryBasis,
          r.createdAt = datetime()
    `, {
      fromId: dep.fromObligationId,
      toId: dep.toObligationId,
      strength: dep.strength || "STRONG",
      description: dep.description || "",
      regulatoryBasis: dep.regulatoryBasis || "",
    });
    count++;
  }

  console.log(`  Synced ${count} Obligation Dependencies to Neo4j`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED SLOT-OBLIGATION MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════════

async function seedSlotObligationMappings(session: Session): Promise<void> {
  console.log("\n[Neo4j MDCG Seed] Syncing Slot-Obligation Mappings...");

  const { db } = await import("../db");
  
  const mappings = await db.select().from(psurSlotObligations);
  console.log(`  Found ${mappings.length} slot-obligation mappings in PostgreSQL`);

  let count = 0;
  for (const mapping of mappings) {
    await session.run(`
      MATCH (s:Slot {slotId: $slotId})
      MATCH (o:Obligation {obligationId: $obligationId})
      MERGE (s)-[r:SATISFIES]->(o)
      SET r.mandatory = $mandatory,
          r.coveragePercentage = $coveragePercentage,
          r.minimumEvidenceAtoms = $minimumEvidenceAtoms,
          r.allowEmptyWithJustification = $allowEmptyWithJustification,
          r.mappingRationale = $mappingRationale,
          r.createdAt = datetime()
    `, {
      slotId: mapping.slotId,
      obligationId: mapping.obligationId,
      mandatory: mapping.mandatory ?? true,
      coveragePercentage: mapping.coveragePercentage ?? 100,
      minimumEvidenceAtoms: mapping.minimumEvidenceAtoms ?? 1,
      allowEmptyWithJustification: mapping.allowEmptyWithJustification ?? false,
      mappingRationale: mapping.mappingRationale || "",
    });
    count++;
  }

  console.log(`  Synced ${count} Slot-Obligation Mappings to Neo4j`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED ANNEX III VALIDATION RULES
// ═══════════════════════════════════════════════════════════════════════════════

async function seedAnnexIIIRules(session: Session): Promise<void> {
  console.log("\n[Neo4j MDCG Seed] Seeding Annex III Validation Rules...");

  const annexIIIPath = resolve(process.cwd(), "server/templates/MDCG_2022_21_ANNEX_III.json");
  if (!existsSync(annexIIIPath)) {
    console.warn("  WARNING: MDCG_2022_21_ANNEX_III.json not found");
    return;
  }

  const annexIII = JSON.parse(readFileSync(annexIIIPath, "utf-8"));
  
  // Create ValidationRule nodes for each checklist item
  const checklist = annexIII.validation_checklist || [];
  let count = 0;
  
  for (const item of checklist) {
    await session.run(`
      MERGE (vr:ValidationRule {ruleId: $ruleId})
      SET vr.requirement = $requirement,
          vr.mandatory = $mandatory,
          vr.source = 'MDCG_2022_21_ANNEX_III',
          vr.updatedAt = datetime()
      
      WITH vr
      MATCH (t:Template {templateId: 'MDCG_2022_21_ANNEX_III'})
      MERGE (t)-[:DEFINES_RULE]->(vr)
    `, {
      ruleId: item.id,
      requirement: item.requirement,
      mandatory: item.mandatory ?? true,
    });
    count++;
  }

  // Create AssessmentRule nodes
  const assessmentRules = annexIII.assessment_rules || {};
  for (const [ruleKey, ruleSpec] of Object.entries(assessmentRules) as [string, any][]) {
    await session.run(`
      MERGE (ar:AssessmentRule {ruleId: $ruleId})
      SET ar.name = $name,
          ar.description = $description,
          ar.required = $required,
          ar.validationPrompt = $validationPrompt,
          ar.updatedAt = datetime()
      
      WITH ar
      MATCH (t:Template {templateId: 'MDCG_2022_21_ANNEX_III'})
      MERGE (t)-[:DEFINES_ASSESSMENT]->(ar)
    `, {
      ruleId: `ANNEXIII.ASSESS.${ruleKey.toUpperCase()}`,
      name: ruleKey.replace(/_/g, " "),
      description: ruleSpec.description || "",
      required: ruleSpec.required ?? ruleSpec.required_if_applicable ?? false,
      validationPrompt: ruleSpec.validation_prompt || "",
    });
    count++;
  }

  console.log(`  Created ${count} Annex III rules in Neo4j`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED ANNEX IV REQUIREMENTS MATRIX
// ═══════════════════════════════════════════════════════════════════════════════

async function seedAnnexIVRequirements(session: Session): Promise<void> {
  console.log("\n[Neo4j MDCG Seed] Seeding Annex IV Device Requirements...");

  const annexIVPath = resolve(process.cwd(), "server/templates/MDCG_2022_21_ANNEX_IV.json");
  if (!existsSync(annexIVPath)) {
    console.warn("  WARNING: MDCG_2022_21_ANNEX_IV.json not found");
    return;
  }

  const annexIV = JSON.parse(readFileSync(annexIVPath, "utf-8"));
  const matrix = annexIV.requirements_matrix || [];

  let count = 0;
  for (const req of matrix) {
    const reqId = `ANNEXIV.${req.device_class.replace(/\s+/g, "_").toUpperCase()}${req.is_implantable ? ".IMPLANT" : ""}`;
    
    await session.run(`
      MERGE (dr:DeviceRequirement {requirementId: $requirementId})
      SET dr.deviceType = $deviceType,
          dr.deviceClass = $deviceClass,
          dr.isImplantable = $isImplantable,
          dr.frequency = $frequency,
          dr.frequencyMonths = $frequencyMonths,
          dr.eudamedSubmission = $eudamedSubmission,
          dr.firstPsurDue = $firstPsurDue,
          dr.mandatoryTables = $mandatoryTables,
          dr.timeBuckets = $timeBuckets,
          dr.updatedAt = datetime()
      
      WITH dr
      MATCH (t:Template {templateId: 'MDCG_2022_21_ANNEX_IV'})
      MERGE (t)-[:DEFINES_REQUIREMENT]->(dr)
    `, {
      requirementId: reqId,
      deviceType: req.device_type,
      deviceClass: req.device_class,
      isImplantable: req.is_implantable,
      frequency: req.frequency,
      frequencyMonths: req.frequency_months || (req.frequency === "Annual" ? 12 : 24),
      eudamedSubmission: req.eudamed_submission ?? false,
      firstPsurDue: req.first_psur_due || "",
      mandatoryTables: req.mandatory_tables || [],
      timeBuckets: req.time_buckets || [],
    });

    // Link to mandatory Annex II tables
    for (const tableKey of req.mandatory_tables || []) {
      await session.run(`
        MATCH (dr:DeviceRequirement {requirementId: $reqId})
        MATCH (at:AnnexTable) WHERE at.tableKey = $tableKey
        MERGE (dr)-[:REQUIRES_TABLE]->(at)
      `, { reqId, tableKey });
    }

    count++;
  }

  console.log(`  Created ${count} Annex IV Device Requirement nodes`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFY GRAPH
// ═══════════════════════════════════════════════════════════════════════════════

async function verifyGraph(session: Session): Promise<void> {
  console.log("\n[Neo4j MDCG Seed] Verifying graph...");

  const counts = await session.run(`
    MATCH (n)
    WITH labels(n) AS labels, count(n) AS count
    UNWIND labels AS label
    RETURN label, sum(count) AS nodeCount
    ORDER BY label
  `);

  console.log("\n  Node counts:");
  for (const record of counts.records) {
    console.log(`    ${record.get("label")}: ${record.get("nodeCount")}`);
  }

  const relCounts = await session.run(`
    MATCH ()-[r]->()
    RETURN type(r) AS relType, count(r) AS relCount
    ORDER BY relType
  `);

  console.log("\n  Relationship counts:");
  for (const record of relCounts.records) {
    console.log(`    ${record.get("relType")}: ${record.get("relCount")}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("[Neo4j MDCG Seed] MDCG 2022-21 Graph Database Seeding");
  console.log("═══════════════════════════════════════════════════════════════════");

  const driver = initNeo4j();
  if (!driver) {
    console.error("\n[Neo4j MDCG Seed] Failed to connect to Neo4j. Exiting.");
    process.exit(1);
  }

  const session = driver.session();

  try {
    // Verify connection
    await session.run("RETURN 1");
    console.log("[Neo4j MDCG Seed] Connected to Neo4j successfully");

    // Run all seeding steps
    await setupSchema(session);
    await seedRegulations(session);
    await seedTemplates(session);
    await seedAnnexIITables(session);
    await seedObligationsFromPostgres(session);
    await seedEvidenceTypes(session);
    await seedSections(session);
    await seedSlots(session);
    await seedObligationDependencies(session);
    await seedSlotObligationMappings(session);
    await seedAnnexIIIRules(session);
    await seedAnnexIVRequirements(session);
    
    // Verify
    await verifyGraph(session);

    console.log("\n═══════════════════════════════════════════════════════════════════");
    console.log("[Neo4j MDCG Seed] COMPLETE - MDCG 2022-21 graph seeded successfully!");
    console.log("═══════════════════════════════════════════════════════════════════");

  } catch (error) {
    console.error("\n[Neo4j MDCG Seed] ERROR:", error);
    throw error;
  } finally {
    await session.close();
    await closeNeo4j();
    
    // Close postgres pool
    const { pool } = await import("../db");
    await pool.end();
  }
}

// Run
main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error("[Neo4j MDCG Seed] Fatal error:", err);
  process.exit(1);
});
