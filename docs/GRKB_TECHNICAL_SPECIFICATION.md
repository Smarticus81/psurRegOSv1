# Global Regulatory Knowledge Base (GRKB)
## Technical Specification and Architecture Deep-Dive

**Classification**: Proprietary Regulatory Ontology  
**Domain**: Medical Device Post-Market Surveillance  
**Standards Alignment**: EU MDR 2017/745, UK MDR 2002, FDA 21 CFR Part 803/806  
**Version**: 2.0.0

---

## Executive Technical Summary

The Global Regulatory Knowledge Base (GRKB) is a purpose-built regulatory ontology engineered for the medical device industry. It serves as the authoritative source of truth for regulatory obligations, constraints, evidence requirements, and compliance validation rules across multiple jurisdictions.

Unlike generic compliance databases, the GRKB is designed as a **queryable inference engine** that understands the semantic relationships between regulations, artifacts, evidence types, and obligations. It enables deterministic regulatory compliance verification with full auditability.

---

## 1. Purpose and Regulatory Context

### 1.1 Problem Domain

Medical device manufacturers operating under EU MDR 2017/745 face a complex regulatory landscape:

- **Article 83**: Post-Market Surveillance System requirements
- **Article 84**: Post-Market Surveillance Plan specifications
- **Article 85**: Post-Market Surveillance Report (for Class I devices)
- **Article 86**: Periodic Safety Update Report (for Class IIa, IIb, III devices)
- **Article 87-89**: Vigilance reporting requirements
- **Annex III**: Technical documentation requirements including PMS data

Each regulatory article cross-references others, creating a **directed acyclic graph** of obligations. For example:
- Article 86(1) requires inclusion of "serious incidents" → which references Article 87 definitions
- Article 86(1)(c) requires PMCF findings → which references Article 61 and Annex XIV Part B
- Annex III requires PMS data → which references Article 83-86

**The GRKB encodes these relationships programmatically**, enabling automated compliance verification that would otherwise require expert human interpretation.

### 1.2 Regulatory Scope

The GRKB currently encodes obligations for:

| Jurisdiction | Regulation | Artifact Types |
|--------------|------------|----------------|
| EU_MDR | Regulation (EU) 2017/745 | PSUR, CER, PMS_PLAN, PMS_REPORT, TECH_FILE |
| UK_MDR | UK MDR 2002 (as amended) | PSUR, PMSR, TECH_FILE |
| FDA_510K | 21 CFR Part 807 | 510K_SUBMISSION |
| FDA_PMA | 21 CFR Part 814 | PMA_SUBMISSION, PMA_SUPPLEMENT |
| FDA_MDR | 21 CFR Part 803 | MDR_REPORT |

### 1.3 Core Functions

1. **Obligation Discovery**: Given a jurisdiction, device class, and artifact type, return all applicable mandatory and optional obligations
2. **Coverage Validation**: Given a set of fulfilled slots, determine which obligations are satisfied and which remain uncovered
3. **Evidence Mapping**: For each obligation, specify which evidence types are required and with what constraints
4. **Constraint Enforcement**: Apply temporal, logical, and domain-specific constraints to evidence and claims
5. **Cross-Reference Resolution**: Trace obligation dependencies across regulatory articles

---

## 2. Ontological Structure

### 2.1 Entity Taxonomy

The GRKB is structured as a **typed entity graph** with the following node types:

```
GRKB Entity Hierarchy
=====================

Regulation
├── Jurisdiction (EU_MDR, UK_MDR, FDA_MDR, ...)
├── RegulatorySource (EU MDR 2017/745, MDCG 2022-21, ...)
└── EffectiveDate (temporal validity)

Obligation
├── ObligationID (stable unique identifier)
├── Kind (MANDATORY | CONDITIONAL | OPTIONAL)
├── Scope (artifact type, device class, risk level)
├── EvidenceRequirements (→ EvidenceType[])
├── DependsOn (→ Obligation[])
├── Satisfies (→ RegulatoryArticle)
└── Constraints (→ Constraint[])

Constraint
├── ConstraintID
├── ConstraintType (TEMPORAL | LOGICAL | CARDINALITY | FORMAT)
├── Expression (constraint logic)
└── ErrorSeverity (BLOCKING | WARNING | INFO)

EvidenceType
├── EvidenceTypeID (e.g., "complaint_record")
├── Schema (→ JSONSchema)
├── RequiredFields (string[])
├── OptionalFields (string[])
├── ValidationRules (→ ValidationRule[])
└── SourceTypes (→ DocumentType[])

Slot
├── SlotID (template-specific identifier)
├── SlotKind (NARRATIVE | TABLE | METRIC | ADMIN)
├── ClaimsObligations (→ Obligation[])
├── RequiredEvidenceTypes (→ EvidenceType[])
└── RenderingInstructions

Mapping
├── SlotID → ObligationID[]
├── Mandatory (boolean)
└── Justification (why this mapping exists)
```

### 2.2 Relationship Types

The GRKB encodes the following semantic relationships:

| Relationship | From | To | Cardinality | Description |
|--------------|------|-----|-------------|-------------|
| `REQUIRES` | Obligation | EvidenceType | 1:N | Evidence needed to satisfy obligation |
| `DEPENDS_ON` | Obligation | Obligation | N:M | Prerequisite obligations |
| `SATISFIES` | Slot | Obligation | N:M | Slot fulfills obligation |
| `DERIVED_FROM` | Obligation | RegulatorySource | N:1 | Legal basis |
| `CONSTRAINS` | Constraint | Obligation | N:M | Rules applied to obligation |
| `SUPERSEDES` | Obligation | Obligation | 1:1 | Temporal versioning |
| `APPLIES_TO` | Obligation | DeviceClass | 1:N | Scope limitation |

### 2.3 Obligation Encoding

Each obligation in the GRKB is encoded with full regulatory provenance:

```typescript
interface GrkbObligation {
  // ═══════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════
  
  obligationId: string;          // Stable, immutable identifier
                                 // Format: "{JURISDICTION}.{SOURCE}.{TYPE}.{SEQUENCE}"
                                 // Example: "EU_MDR.ART86.OBL.SERIOUS_INCIDENTS"
  
  // ═══════════════════════════════════════════════════════════════
  // REGULATORY PROVENANCE
  // ═══════════════════════════════════════════════════════════════
  
  jurisdiction: Jurisdiction;    // EU_MDR | UK_MDR | FDA_MDR | ...
  
  regulatorySource: {
    document: string;            // "Regulation (EU) 2017/745"
    article: string;             // "Article 86(1)(a)"
    paragraph?: string;          // Specific paragraph reference
    annexReference?: string;     // "Annex III Section 1.1"
    guidanceDocument?: string;   // "MDCG 2022-21"
    effectiveDate: ISO8601Date;  // When this became law
    amendedBy?: string[];        // Subsequent amendments
  };
  
  // ═══════════════════════════════════════════════════════════════
  // OBLIGATION SEMANTICS
  // ═══════════════════════════════════════════════════════════════
  
  kind: "obligation" | "constraint" | "definition" | "guidance";
  
  mandatory: boolean;            // Hard requirement vs. recommended
  
  conditionalOn?: {              // When obligation applies
    deviceClass?: DeviceClass[]; // Class I, IIa, IIb, III
    riskLevel?: RiskLevel[];     // High, Medium, Low
    marketPresence?: string[];   // Countries where sold
    condition?: string;          // Custom condition expression
  };
  
  // ═══════════════════════════════════════════════════════════════
  // HUMAN-READABLE CONTENT
  // ═══════════════════════════════════════════════════════════════
  
  title: string;                 // Short title for UI display
  
  text: string;                  // Full obligation text (regulatory language)
  
  interpretation: string;        // Plain English explanation
  
  examples?: string[];           // Compliance examples
  
  // ═══════════════════════════════════════════════════════════════
  // EVIDENCE REQUIREMENTS
  // ═══════════════════════════════════════════════════════════════
  
  requiredEvidenceTypes: {
    evidenceTypeId: string;      // Reference to EvidenceType
    minCount: number;            // Minimum atoms required (0 = optional)
    maxCount?: number;           // Maximum (null = unlimited)
    allowNegativeEvidence: boolean; // Can "none reported" satisfy?
    constraints: EvidenceConstraint[];
  }[];
  
  // ═══════════════════════════════════════════════════════════════
  // DEPENDENCY GRAPH
  // ═══════════════════════════════════════════════════════════════
  
  dependsOn: string[];           // Prerequisite obligation IDs
  
  supersedes?: string;           // Previous version of this obligation
  
  supersededBy?: string;         // Newer version (if deprecated)
  
  // ═══════════════════════════════════════════════════════════════
  // VALIDATION RULES
  // ═══════════════════════════════════════════════════════════════
  
  constraints: ObligationConstraint[];
  
  // ═══════════════════════════════════════════════════════════════
  // VERSIONING
  // ═══════════════════════════════════════════════════════════════
  
  version: SemanticVersion;      // "1.2.0"
  
  validFrom: ISO8601Date;        // Temporal validity start
  
  validUntil?: ISO8601Date;      // Temporal validity end (null = current)
  
  lastModified: ISO8601DateTime;
  
  modifiedBy: string;            // Author of last change
  
  changeLog: ChangeLogEntry[];   // Audit trail of modifications
}
```

---

## 3. Storage Architecture

### 3.1 Primary Storage: PostgreSQL with Graph Extensions

The GRKB uses PostgreSQL as the primary storage engine, leveraging:

- **JSONB columns** for flexible schema storage
- **Array types** for multi-valued attributes
- **GIN indexes** for efficient JSON querying
- **Materialized views** for pre-computed traversals
- **Row-level security** for multi-tenant isolation

#### 3.1.1 Core Tables

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- GRKB OBLIGATIONS TABLE
-- Central table storing all regulatory obligations
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE grkb_obligations (
    id SERIAL PRIMARY KEY,
    
    -- Identity
    obligation_id TEXT NOT NULL UNIQUE,
    
    -- Regulatory provenance
    jurisdiction TEXT NOT NULL,
    artifact_type TEXT NOT NULL,
    template_id TEXT,  -- NULL = applies to all templates
    
    -- Semantics
    kind TEXT NOT NULL CHECK (kind IN ('obligation', 'constraint', 'definition', 'guidance')),
    mandatory BOOLEAN NOT NULL DEFAULT true,
    
    -- Content
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    interpretation TEXT,
    source_citation TEXT,
    
    -- Evidence requirements (JSONB for flexibility)
    required_evidence_types JSONB NOT NULL DEFAULT '[]',
    
    -- Dependencies (array of obligation_ids)
    depends_on TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Conditional applicability
    applies_to_device_classes TEXT[] DEFAULT ARRAY['Class I', 'Class IIa', 'Class IIb', 'Class III'],
    conditional_expression TEXT,
    
    -- Constraints (JSONB array)
    constraints JSONB NOT NULL DEFAULT '[]',
    
    -- Versioning
    version TEXT NOT NULL DEFAULT '1.0.0',
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    updated_by TEXT,
    
    -- Indexes
    CONSTRAINT valid_jurisdiction CHECK (jurisdiction IN ('EU_MDR', 'UK_MDR', 'FDA_MDR', 'FDA_510K', 'FDA_PMA', 'HEALTH_CANADA')),
    CONSTRAINT valid_artifact CHECK (artifact_type IN ('PSUR', 'CER', 'PMS_PLAN', 'PMS_REPORT', 'TECH_FILE', '510K', 'PMA'))
);

-- ═══════════════════════════════════════════════════════════════════════════
-- EVIDENCE TYPE REGISTRY
-- Formal definitions of all evidence types
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE grkb_evidence_types (
    id SERIAL PRIMARY KEY,
    
    evidence_type_id TEXT NOT NULL UNIQUE,
    
    -- Classification
    category TEXT NOT NULL, -- 'safety', 'clinical', 'commercial', 'quality', 'regulatory'
    
    -- Schema
    display_name TEXT NOT NULL,
    description TEXT,
    json_schema JSONB NOT NULL,  -- Full JSON Schema for validation
    required_fields TEXT[] NOT NULL,
    optional_fields TEXT[] DEFAULT ARRAY[]::TEXT[],
    
    -- Source mapping
    expected_source_types TEXT[] DEFAULT ARRAY[]::TEXT[],  -- 'excel', 'docx', 'pdf', 'json'
    
    -- Validation
    validation_rules JSONB DEFAULT '[]',
    
    -- Examples
    example_data JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- OBLIGATION RELATIONSHIPS
-- Graph edges between obligations
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE grkb_obligation_relationships (
    id SERIAL PRIMARY KEY,
    
    from_obligation_id TEXT NOT NULL REFERENCES grkb_obligations(obligation_id),
    to_obligation_id TEXT NOT NULL REFERENCES grkb_obligations(obligation_id),
    
    relationship_type TEXT NOT NULL CHECK (relationship_type IN (
        'DEPENDS_ON',      -- from requires to be satisfied first
        'SUPERSEDES',      -- from replaces to (temporal)
        'CONFLICTS_WITH',  -- from and to cannot both be satisfied
        'IMPLIES',         -- satisfying from automatically satisfies to
        'CROSS_REFERENCES' -- from mentions to in its text
    )),
    
    -- Relationship metadata
    strength TEXT DEFAULT 'STRONG' CHECK (strength IN ('STRONG', 'WEAK', 'INFORMATIONAL')),
    justification TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(from_obligation_id, to_obligation_id, relationship_type)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- SLOT-OBLIGATION MAPPING
-- Links template slots to obligations they satisfy
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE grkb_slot_obligation_links (
    id SERIAL PRIMARY KEY,
    
    template_id TEXT NOT NULL,
    slot_id TEXT NOT NULL,
    obligation_id TEXT NOT NULL REFERENCES grkb_obligations(obligation_id),
    
    mandatory BOOLEAN NOT NULL DEFAULT true,
    coverage_percentage INTEGER DEFAULT 100 CHECK (coverage_percentage BETWEEN 0 AND 100),
    
    -- Justification for the mapping
    mapping_rationale TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(template_id, slot_id, obligation_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_obligations_jurisdiction ON grkb_obligations(jurisdiction);
CREATE INDEX idx_obligations_artifact ON grkb_obligations(artifact_type);
CREATE INDEX idx_obligations_kind ON grkb_obligations(kind);
CREATE INDEX idx_obligations_mandatory ON grkb_obligations(mandatory);
CREATE INDEX idx_obligations_valid_temporal ON grkb_obligations(valid_from, valid_until);

CREATE INDEX idx_evidence_types_category ON grkb_evidence_types(category);

CREATE INDEX idx_relationships_from ON grkb_obligation_relationships(from_obligation_id);
CREATE INDEX idx_relationships_to ON grkb_obligation_relationships(to_obligation_id);
CREATE INDEX idx_relationships_type ON grkb_obligation_relationships(relationship_type);

CREATE INDEX idx_slot_links_template ON grkb_slot_obligation_links(template_id);
CREATE INDEX idx_slot_links_slot ON grkb_slot_obligation_links(slot_id);
CREATE INDEX idx_slot_links_obligation ON grkb_slot_obligation_links(obligation_id);

-- GIN index for JSONB querying
CREATE INDEX idx_obligations_evidence_gin ON grkb_obligations USING GIN (required_evidence_types);
CREATE INDEX idx_obligations_constraints_gin ON grkb_obligations USING GIN (constraints);
```

### 3.2 Secondary Storage: Semantic Vector Index

For semantic search capabilities, the GRKB maintains a vector index using pgvector:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- OBLIGATION EMBEDDINGS
-- Vector representations for semantic search
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE grkb_obligation_embeddings (
    id SERIAL PRIMARY KEY,
    
    obligation_id TEXT NOT NULL UNIQUE REFERENCES grkb_obligations(obligation_id),
    
    -- Text that was embedded
    embedded_text TEXT NOT NULL,
    
    -- Vector embedding (1536 dimensions for OpenAI text-embedding-3-small)
    embedding vector(1536) NOT NULL,
    
    -- Metadata
    model_id TEXT NOT NULL,  -- 'text-embedding-3-small'
    model_version TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- HNSW index for fast similarity search
CREATE INDEX idx_obligation_embeddings_hnsw 
    ON grkb_obligation_embeddings 
    USING hnsw (embedding vector_cosine_ops);
```

---

## 4. Constraint System

### 4.1 Constraint Types

The GRKB enforces four categories of constraints:

#### 4.1.1 Temporal Constraints

```typescript
interface TemporalConstraint {
  type: "TEMPORAL";
  
  rule: 
    | "EVIDENCE_WITHIN_PERIOD"     // Evidence dates must fall within PSUR period
    | "EVIDENCE_BEFORE_CUTOFF"     // Evidence must predate a specific date
    | "OBLIGATION_EFFECTIVE"       // Obligation must be in effect
    | "SUPERSESSION_CHECK";        // Check if obligation has been superseded
  
  parameters: {
    periodStart?: string;         // ISO8601 date
    periodEnd?: string;
    gracePeriodDays?: number;     // Allow evidence slightly outside period
    referenceField?: string;      // Which date field to check
  };
  
  errorSeverity: "BLOCKING" | "WARNING" | "INFO";
  errorMessage: string;
}
```

Example:
```json
{
  "type": "TEMPORAL",
  "rule": "EVIDENCE_WITHIN_PERIOD",
  "parameters": {
    "referenceField": "incident_date",
    "gracePeriodDays": 30
  },
  "errorSeverity": "WARNING",
  "errorMessage": "Evidence date {incident_date} is outside the reporting period"
}
```

#### 4.1.2 Logical Constraints

```typescript
interface LogicalConstraint {
  type: "LOGICAL";
  
  rule:
    | "IF_THEN"                   // If condition, then requirement
    | "MUTUAL_EXCLUSION"          // Cannot have both A and B
    | "REQUIRES_ALL"              // Must have all of A, B, C
    | "REQUIRES_ANY"              // Must have at least one of A, B, C
    | "IMPLIES";                  // A implies B
  
  parameters: {
    condition?: string;           // Boolean expression
    antecedent?: string;          // "If" part
    consequent?: string;          // "Then" part
    items?: string[];             // List for ALL/ANY rules
  };
  
  errorSeverity: "BLOCKING" | "WARNING" | "INFO";
  errorMessage: string;
}
```

Example:
```json
{
  "type": "LOGICAL",
  "rule": "IF_THEN",
  "parameters": {
    "antecedent": "serious_incident_count > 0",
    "consequent": "must_include_vigilance_summary = true"
  },
  "errorSeverity": "BLOCKING",
  "errorMessage": "Serious incidents detected but vigilance summary is missing"
}
```

#### 4.1.3 Cardinality Constraints

```typescript
interface CardinalityConstraint {
  type: "CARDINALITY";
  
  rule:
    | "MIN_COUNT"                 // At least N items
    | "MAX_COUNT"                 // At most N items
    | "EXACT_COUNT"               // Exactly N items
    | "RANGE";                    // Between min and max
  
  parameters: {
    field: string;                // What to count
    min?: number;
    max?: number;
    exact?: number;
  };
  
  errorSeverity: "BLOCKING" | "WARNING" | "INFO";
  errorMessage: string;
}
```

Example:
```json
{
  "type": "CARDINALITY",
  "rule": "MIN_COUNT",
  "parameters": {
    "field": "evidence_atoms",
    "min": 1
  },
  "errorSeverity": "BLOCKING",
  "errorMessage": "At least one evidence atom is required for this obligation"
}
```

#### 4.1.4 Format Constraints

```typescript
interface FormatConstraint {
  type: "FORMAT";
  
  rule:
    | "REGEX_MATCH"               // Must match pattern
    | "DATE_FORMAT"               // Must be valid ISO8601
    | "ENUM_VALUE"                // Must be one of allowed values
    | "JSON_SCHEMA";              // Must validate against schema
  
  parameters: {
    field: string;
    pattern?: string;             // Regex pattern
    allowedValues?: string[];     // Enum values
    schema?: object;              // JSON Schema
  };
  
  errorSeverity: "BLOCKING" | "WARNING" | "INFO";
  errorMessage: string;
}
```

### 4.2 Constraint Evaluation Engine

Constraints are evaluated at multiple points in the workflow:

1. **Evidence Ingestion**: Format and cardinality constraints
2. **Slot Proposal**: Logical and temporal constraints
3. **Adjudication**: All constraints before acceptance
4. **Coverage Report**: Final validation of all obligations

```typescript
interface ConstraintEvaluationResult {
  constraintId: string;
  passed: boolean;
  severity: "BLOCKING" | "WARNING" | "INFO";
  
  // If failed
  errorMessage?: string;
  errorContext?: {
    field?: string;
    actualValue?: any;
    expectedValue?: any;
    suggestion?: string;
  };
  
  // Trace
  evaluatedAt: ISO8601DateTime;
  evaluatedBy: string;  // Agent ID
}
```

---

## 5. Validation Mechanisms

### 5.1 Template Qualification

Before any PSUR workflow can execute, the template must be qualified against the GRKB:

```typescript
interface TemplateQualificationProcess {
  // Step 1: Schema Validation
  schemaValidation: {
    validator: "Zod";
    schema: "TemplateSchema";
    strictMode: true;
    result: "PASS" | "FAIL";
    errors: SchemaError[];
  };
  
  // Step 2: Slot Completeness
  slotCompleteness: {
    totalSlots: number;
    requiredSlots: number;
    optionalSlots: number;
    missingRequiredSlots: string[];
    result: "PASS" | "FAIL";
  };
  
  // Step 3: Mapping Validation
  mappingValidation: {
    totalMappings: number;
    validMappings: number;
    invalidMappings: {
      slotId: string;
      obligationId: string;
      reason: string;
    }[];
    result: "PASS" | "FAIL";
  };
  
  // Step 4: GRKB Obligation Coverage
  obligationCoverage: {
    jurisdiction: string;
    artifactType: string;
    totalMandatoryObligations: number;
    coveredObligations: number;
    uncoveredObligations: string[];
    coveragePercentage: number;
    result: "PASS" | "FAIL" | "WARNING";
  };
  
  // Step 5: Constraint Consistency
  constraintConsistency: {
    conflictingConstraints: {
      constraint1: string;
      constraint2: string;
      conflict: string;
    }[];
    result: "PASS" | "FAIL";
  };
  
  // Final Result
  overallResult: "VERIFIED" | "BLOCKED";
  blockingErrors: string[];
  warnings: string[];
  qualifiedAt: ISO8601DateTime;
}
```

### 5.2 Evidence Validation

Each evidence atom is validated against its type definition in the GRKB:

```typescript
interface EvidenceValidationProcess {
  atomId: string;
  evidenceType: string;
  
  // Step 1: Schema Compliance
  schemaCompliance: {
    schema: JSONSchema;
    valid: boolean;
    errors: {
      path: string;
      message: string;
      keyword: string;
    }[];
  };
  
  // Step 2: Required Fields
  requiredFieldsPresent: {
    required: string[];
    present: string[];
    missing: string[];
    valid: boolean;
  };
  
  // Step 3: Field-Level Constraints
  fieldConstraints: {
    field: string;
    constraint: string;
    passed: boolean;
    actualValue: any;
    expectedValue: any;
  }[];
  
  // Step 4: Cross-Reference Validation
  crossReferences: {
    referencedEntity: string;
    entityType: string;
    exists: boolean;
    valid: boolean;
  }[];
  
  // Result
  validationResult: "VALID" | "INVALID" | "VALID_WITH_WARNINGS";
  validatedAt: ISO8601DateTime;
  validatedBy: string;
}
```

### 5.3 Coverage Validation

At the end of the workflow, the GRKB validates that all mandatory obligations are satisfied:

```typescript
interface CoverageValidationProcess {
  psurCaseId: number;
  templateId: string;
  jurisdictions: string[];
  
  // Per-Obligation Coverage
  obligations: {
    obligationId: string;
    mandatory: boolean;
    satisfied: boolean;
    satisfiedBy: string[];  // Slot IDs
    evidenceAtomCount: number;
    constraintsPassed: boolean;
    constraintResults: ConstraintEvaluationResult[];
  }[];
  
  // Summary
  summary: {
    totalObligations: number;
    mandatoryObligations: number;
    satisfiedMandatory: number;
    satisfiedOptional: number;
    unsatisfiedMandatory: string[];
    coveragePercentage: number;
  };
  
  // Result
  coverageResult: "COMPLETE" | "INCOMPLETE";
  blockingGaps: string[];
  validatedAt: ISO8601DateTime;
}
```

---

## 6. Query Capabilities

### 6.1 Obligation Discovery Queries

```typescript
// Get all mandatory obligations for a jurisdiction and artifact type
async function getObligations(
  jurisdictions: string[],
  artifactType: string,
  deviceClass?: DeviceClass,
  asOfDate?: ISO8601Date
): Promise<GrkbObligation[]>;

// Get obligations with their dependency graph
async function getObligationsWithDependencies(
  jurisdictions: string[],
  artifactType: string
): Promise<{
  obligations: GrkbObligation[];
  dependencies: { from: string; to: string; type: string }[];
}>;

// Get obligations for a specific template
async function getTemplateObligations(
  templateId: string
): Promise<{
  required: GrkbObligation[];
  optional: GrkbObligation[];
  mappings: SlotObligationMapping[];
}>;
```

### 6.2 Semantic Search Queries

```typescript
// Find obligations related to a concept
async function searchObligationsBySemantic(
  query: string,
  limit: number = 10,
  threshold: number = 0.7
): Promise<{
  obligationId: string;
  title: string;
  text: string;
  similarity: number;
}[]>;

// Find related evidence types
async function findRelatedEvidenceTypes(
  obligationId: string
): Promise<EvidenceType[]>;
```

### 6.3 Graph Traversal Queries

```typescript
// Get full dependency chain for an obligation
async function getDependencyChain(
  obligationId: string,
  maxDepth: number = 5
): Promise<{
  obligation: GrkbObligation;
  dependencies: GrkbObligation[];
  depth: number;
}>;

// Find all obligations that transitively depend on a source
async function findDependents(
  obligationId: string
): Promise<GrkbObligation[]>;

// Get regulatory article cross-references
async function getCrossReferences(
  obligationId: string
): Promise<{
  referencedBy: GrkbObligation[];
  references: GrkbObligation[];
}>;
```

### 6.4 Temporal Queries

```typescript
// Get obligations as they were at a specific date
async function getObligationsAsOf(
  jurisdictions: string[],
  artifactType: string,
  asOfDate: ISO8601Date
): Promise<GrkbObligation[]>;

// Get obligation change history
async function getObligationHistory(
  obligationId: string
): Promise<{
  version: string;
  validFrom: ISO8601Date;
  validUntil: ISO8601Date | null;
  changes: string[];
}[]>;
```

---

## 7. Extensibility Architecture

### 7.1 Extension Points

The GRKB is designed for extension to additional regulatory domains:

#### 7.1.1 New Jurisdictions

```typescript
// Register a new jurisdiction
await registerJurisdiction({
  jurisdictionId: "HEALTH_CANADA",
  displayName: "Health Canada - Medical Devices",
  regulatoryAuthority: "Health Canada",
  country: "CA",
  
  primaryRegulations: [
    {
      name: "Medical Devices Regulations (SOR/98-282)",
      effectiveDate: "1998-07-01",
      currentVersion: "2024-01-01",
    },
  ],
  
  artifactTypes: ["MDEL", "MDL", "PSUR"],
  
  deviceClassification: {
    system: "Health Canada Classes",
    classes: ["Class I", "Class II", "Class III", "Class IV"],
  },
});
```

#### 7.1.2 New Artifact Types

```typescript
// Register a new artifact type
await registerArtifactType({
  artifactTypeId: "CER",
  displayName: "Clinical Evaluation Report",
  
  applicableJurisdictions: ["EU_MDR", "UK_MDR"],
  
  regulatoryBasis: [
    "EU MDR Article 61",
    "EU MDR Annex XIV",
    "MDCG 2020-13",
  ],
  
  requiredForDeviceClasses: ["Class IIa", "Class IIb", "Class III"],
  
  templateSchema: CERTemplateSchema,
});
```

#### 7.1.3 New Evidence Types

```typescript
// Register a new evidence type
await registerEvidenceType({
  evidenceTypeId: "clinical_investigation_report",
  
  displayName: "Clinical Investigation Report",
  category: "clinical",
  
  jsonSchema: {
    type: "object",
    required: ["investigation_id", "title", "start_date", "end_date", "conclusions"],
    properties: {
      investigation_id: { type: "string" },
      title: { type: "string" },
      start_date: { type: "string", format: "date" },
      end_date: { type: "string", format: "date" },
      patient_count: { type: "integer" },
      primary_endpoint: { type: "string" },
      secondary_endpoints: { type: "array", items: { type: "string" } },
      conclusions: { type: "string" },
      adverse_events: { type: "array" },
    },
  },
  
  expectedSourceTypes: ["docx", "pdf"],
  
  validationRules: [
    {
      rule: "end_date >= start_date",
      errorMessage: "End date must be after start date",
    },
  ],
});
```

### 7.2 QARA Process Extensions

The GRKB architecture supports expansion to other Quality Assurance and Regulatory Affairs processes:

| Process | Artifact Type | Key Obligations |
|---------|---------------|-----------------|
| **Clinical Evaluation** | CER | EU MDR Article 61, Annex XIV, MEDDEV 2.7/1 |
| **Risk Management** | RMF | ISO 14971, EU MDR Annex I Chapter I |
| **Technical Documentation** | TECH_FILE | EU MDR Annex II, Annex III |
| **PMS Planning** | PMS_PLAN | EU MDR Article 84, Annex III Section 1 |
| **SSCP** | SSCP | EU MDR Article 32, Annex III Section 2 |
| **Design History** | DHF | 21 CFR 820.30 |
| **510(k) Submission** | 510K | 21 CFR 807 Subpart E |
| **PMA Submission** | PMA | 21 CFR 814 |

Each extension reuses the core GRKB infrastructure:
- Same obligation schema
- Same constraint system
- Same evidence type registry
- Same validation mechanisms
- Same decision tracing

---

## 8. Integration APIs

### 8.1 REST API Endpoints

```
GET  /api/grkb/obligations
     Query: jurisdiction, artifactType, deviceClass, mandatory, asOfDate
     Returns: GrkbObligation[]

GET  /api/grkb/obligations/:obligationId
     Returns: GrkbObligation with full details

GET  /api/grkb/obligations/:obligationId/dependencies
     Returns: Dependency graph

GET  /api/grkb/obligations/:obligationId/history
     Returns: Version history

GET  /api/grkb/evidence-types
     Query: category
     Returns: EvidenceType[]

GET  /api/grkb/evidence-types/:evidenceTypeId
     Returns: Full schema and validation rules

POST /api/grkb/search
     Body: { query: string, limit: number, threshold: number }
     Returns: Semantic search results

POST /api/grkb/validate/template
     Body: { templateId: string, jurisdictions: string[] }
     Returns: TemplateQualificationResult

POST /api/grkb/validate/coverage
     Body: { psurCaseId: number }
     Returns: CoverageValidationResult
```

### 8.2 GraphQL API

```graphql
type Query {
  obligation(id: ID!): Obligation
  obligations(
    jurisdictions: [String!]!
    artifactType: String!
    mandatory: Boolean
    deviceClass: DeviceClass
  ): [Obligation!]!
  
  obligationDependencies(id: ID!): DependencyGraph
  
  evidenceType(id: ID!): EvidenceType
  evidenceTypes(category: String): [EvidenceType!]!
  
  searchObligations(query: String!, limit: Int): [SearchResult!]!
  
  templateCoverage(templateId: ID!): TemplateCoverage
}

type Obligation {
  id: ID!
  obligationId: String!
  jurisdiction: Jurisdiction!
  artifactType: String!
  kind: ObligationKind!
  mandatory: Boolean!
  title: String!
  text: String!
  sourceCitation: String
  requiredEvidenceTypes: [EvidenceRequirement!]!
  dependsOn: [Obligation!]!
  dependedOnBy: [Obligation!]!
  constraints: [Constraint!]!
  validFrom: DateTime!
  validUntil: DateTime
}
```

---

## 9. Audit and Compliance

### 9.1 GRKB Change Audit

All modifications to the GRKB are logged:

```typescript
interface GrkbAuditEntry {
  auditId: string;
  timestamp: ISO8601DateTime;
  
  action: "CREATE" | "UPDATE" | "DELETE" | "DEPRECATE";
  
  entityType: "OBLIGATION" | "EVIDENCE_TYPE" | "RELATIONSHIP" | "CONSTRAINT";
  entityId: string;
  
  previousValue: any;
  newValue: any;
  
  changedBy: string;
  changeReason: string;
  
  approvedBy?: string;
  approvalTimestamp?: ISO8601DateTime;
}
```

### 9.2 Regulatory Update Tracking

The GRKB tracks regulatory updates from source:

```typescript
interface RegulatoryUpdateEntry {
  updateId: string;
  
  source: "EUR-LEX" | "MHRA" | "FDA_FR" | "MANUAL";
  sourceDocument: string;
  sourceUrl?: string;
  
  publicationDate: ISO8601Date;
  effectiveDate: ISO8601Date;
  
  affectedObligations: string[];
  
  changeType: "NEW" | "AMENDMENT" | "REPEAL" | "CORRECTION";
  changeSummary: string;
  
  processedAt: ISO8601DateTime;
  processedBy: string;
}
```

---

## 10. Performance Specifications

### 10.1 Query Performance Targets

| Query Type | Target Latency | Notes |
|------------|----------------|-------|
| Get obligations by jurisdiction | < 50ms | Indexed query |
| Full template qualification | < 500ms | Multiple validations |
| Semantic search (10 results) | < 200ms | Vector similarity |
| Dependency graph traversal | < 100ms | Materialized view |
| Coverage validation | < 1s | Full constraint evaluation |

### 10.2 Scalability Targets

| Metric | Current Capacity | Target Capacity |
|--------|------------------|-----------------|
| Total obligations | 500 | 10,000+ |
| Jurisdictions | 5 | 50+ |
| Artifact types | 10 | 100+ |
| Evidence types | 50 | 500+ |
| Concurrent queries | 100/s | 10,000/s |
| Template validations | 10/s | 1,000/s |

---

## Appendix A: Regulatory Citation Format

```
{JURISDICTION}.{SOURCE}.{ARTICLE}.{PARAGRAPH?}.{TYPE}

Examples:
- EU_MDR.MDR.ART86.1.OBL          (EU MDR Article 86(1) Obligation)
- EU_MDR.MDCG_2022_21.ANNEX_I.A.OBL  (MDCG Guidance Annex I Section A)
- UK_MDR.UKCA.REG46.OBL           (UK MDR Regulation 46)
- FDA.21CFR803.50.OBL             (FDA 21 CFR 803.50)
```

## Appendix B: Evidence Type Schema Reference

All evidence types conform to a base schema:

```typescript
interface BaseEvidenceSchema {
  // Required for all evidence atoms
  atom_id: string;              // Unique identifier
  evidence_type: string;        // Reference to EvidenceType
  source_file: string;          // Original file name
  source_type: string;          // 'excel', 'docx', 'pdf', etc.
  extraction_timestamp: string; // When extracted
  extraction_confidence: number; // 0.0 - 1.0
  extraction_method: string;    // 'rule_based', 'llm_assisted', 'manual'
  
  // Optional metadata
  source_row?: number;
  source_sheet?: string;
  source_section?: string;
  source_page?: number;
  
  // The actual evidence data (type-specific)
  normalized_data: Record<string, unknown>;
  raw_data: Record<string, unknown>;
}
```

---

*Document Classification: Technical Specification*  
*Confidentiality: Internal Use Only*  
*Version: 2.0.0*  
*Last Updated: 2026-01-13*
