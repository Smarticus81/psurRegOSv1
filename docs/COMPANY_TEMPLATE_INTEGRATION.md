# Company Template Integration Guide

**Version**: 1.0.0  
**Last Updated**: January 2026  
**Classification**: Technical Documentation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Template Architecture](#2-template-architecture)
3. [Company Template Schema](#3-company-template-schema)
4. [Creating a Company Template](#4-creating-a-company-template)
5. [Template Validation Rules](#5-template-validation-rules)
6. [Slot-to-Obligation Mapping](#6-slot-to-obligation-mapping)
7. [Template Loading and Resolution](#7-template-loading-and-resolution)
8. [Worked Example: FormQAR-054_C](#8-worked-example-formqar-054_c)
9. [API Integration](#9-api-integration)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

The RegulatoryOS PSUR Engine supports **company-specific templates** that extend the regulatory baseline (MDCG 2022-21 Annex I) while maintaining full compliance with EU MDR and UK MDR obligations.

### Key Principles

| Principle | Description |
|-----------|-------------|
| **Extension-Only** | Company templates ADD sections but cannot REMOVE or RENAME core regulatory sections |
| **Obligation Preservation** | All mandatory MDCG obligations must be mapped; company templates cannot override regulatory requirements |
| **Calculation Integrity** | Deterministic calculations (complaint rates, UCL analysis, etc.) are defined by the PSUR kernel and cannot be redefined |
| **Traceability** | All content must trace to evidence atoms regardless of template |

### Template Hierarchy

```
PSUR Contract (psurContract.ts)
    │
    ├── Defines core sections (SECTION_A through SECTION_N)
    ├── Defines required tables per section
    ├── Defines calculation formulas
    └── Defines trace requirements
         │
         ├─────────────────────────────────────────────────┐
         │                                                 │
         ▼                                                 ▼
MDCG 2022-21 Annex I Template              Company Template (e.g., FormQAR-054_C)
(Base regulatory template)                  (Extends MDCG with company-specific slots)
         │                                                 │
         │                                                 │
         ├── EU MDR obligations only                       ├── EU MDR + UK MDR obligations
         ├── Standard section structure                    ├── Additional company sections
         ├── MDCG-defined slots                            ├── Extended evidence requirements
         └── Baseline evidence requirements                └── Company-specific approvers
```

---

## 2. Template Architecture

### 2.1 System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TEMPLATE SYSTEM                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │ Template Store   │     │ Template         │     │ PSUR Contract    │    │
│  │ (templateStore.ts)│    │ Extension        │     │ (psurContract.ts)│    │
│  │                  │     │ (templateExt.ts) │     │                  │    │
│  │ - Load templates │     │ - Validate ext   │     │ - Core sections  │    │
│  │ - Cache templates│     │ - Check coverage │     │ - Required tables│    │
│  │ - Zod validation │     │ - Prevent override│    │ - Calculations   │    │
│  └────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘    │
│           │                        │                        │               │
│           └────────────────────────┼────────────────────────┘               │
│                                    │                                        │
│                                    ▼                                        │
│                    ┌───────────────────────────────┐                       │
│                    │    Template Schema (Zod)       │                       │
│                    │    (templateSchema.ts)         │                       │
│                    │                                │                       │
│                    │    - template_id               │                       │
│                    │    - jurisdiction_scope        │                       │
│                    │    - mandatory_obligation_ids  │                       │
│                    │    - slots[]                   │                       │
│                    │    - mapping{}                 │                       │
│                    └───────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Template Files Location

```
server/
└── templates/
    ├── MDCG_2022_21_ANNEX_I.json    # Base regulatory template (EU MDR)
    ├── FormQAR-054_C.json           # Company template example (EU + UK MDR)
    └── {YOUR_COMPANY}_TEMPLATE.json  # Your company template
```

### 2.3 Template Aliasing

The system supports multiple naming conventions for template IDs:

```typescript
const TEMPLATE_ALIASES: Record<string, string> = {
  "MDCG_2022_21": "MDCG_2022_21_ANNEX_I",
  "MDCG_2022_21_ANNEX_I": "MDCG_2022_21_ANNEX_I",
  "FormQAR-054_C": "FormQAR-054_C",
  "FORMQAR_054_C": "FormQAR-054_C",
  "formqar_054_c": "FormQAR-054_C",
};
```

---

## 3. Company Template Schema

### 3.1 Root Structure

A company template JSON file must conform to this schema:

```typescript
interface Template {
  template_id: string;           // Unique identifier: "COMPANY_PSUR_V1"
  name: string;                  // Human-readable: "Acme Corp PSUR Template"
  version: string;               // Semantic version: "1.0.0"
  jurisdiction_scope: string[];  // ["EU_MDR"] or ["EU_MDR", "UK_MDR"]
  normative_basis: string[];     // Regulatory references
  mandatory_obligation_ids: string[];  // GRKB obligation IDs this template covers
  defaults: TemplateDefaults;
  slots: SlotDefinition[];       // Template sections/fields
  mapping: Record<string, string[]>;  // slot_id -> obligation_id[]
}
```

### 3.2 Template Defaults

```typescript
interface TemplateDefaults {
  require_traceability: boolean;        // Must all content trace to evidence? (should be true)
  require_method_statement: boolean;    // Must proposals explain methodology? (should be true)
  require_claimed_obligations: boolean; // Must proposals claim obligations? (should be true)
  min_method_chars: number;             // Minimum method statement length (e.g., 10)
  min_evidence_atoms: number;           // Minimum atoms per slot (e.g., 1)
}
```

### 3.3 Slot Definition

Each slot represents a section or field in the PSUR:

```typescript
interface SlotDefinition {
  slot_id: string;              // Unique: "COMPANY.SECTION_A.INTRO"
  title: string;                // Display: "Section A - Introduction"
  section_path: string;         // Hierarchy: "A > Introduction > Overview"
  slot_kind: SlotKind;          // "ADMIN" | "NARRATIVE" | "TABLE" | "METRIC"
  required: boolean;            // Is this slot mandatory?
  evidence_requirements: EvidenceRequirements;
  output_requirements: OutputRequirements;
}

interface EvidenceRequirements {
  required_types: string[];     // Evidence type IDs from GRKB
  min_atoms: number;            // Minimum evidence atoms required
  allow_empty_with_justification: boolean;  // Can slot be empty with justification?
}

interface OutputRequirements {
  renderer: "md" | "docx";
  render_as?: "cover_page" | "table_of_contents" | "narrative" | "table";
  table_schema?: TableSchema;   // For TABLE slots
}
```

---

## 4. Creating a Company Template

### 4.1 Step-by-Step Process

```
STEP 1: Copy Base Template
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ cp server/templates/MDCG_2022_21_ANNEX_I.json                              │
│    server/templates/ACME_PSUR_TEMPLATE.json                                 │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
STEP 2: Update Template Metadata
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ {                                                                           │
│   "template_id": "ACME_PSUR_V1",                                           │
│   "name": "Acme Corporation PSUR Template (EU MDR + UK MDR)",              │
│   "version": "1.0.0",                                                       │
│   "jurisdiction_scope": ["EU_MDR", "UK_MDR"],                              │
│   "normative_basis": [                                                      │
│     "EU.MDR.2017/745.ART86",                                               │
│     "UK.MDR.2002.44ZM",                                                     │
│     "ACME.CORP.QMS.PROC.PSU-001"                                           │
│   ],                                                                        │
│   ...                                                                       │
│ }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
STEP 3: Add UK MDR Obligations (if applicable)
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ "mandatory_obligation_ids": [                                               │
│   // Existing EU MDR obligations...                                         │
│   "EU.MDR.ART86.1.ADMIN",                                                  │
│   "EU.MDR.ART86.1.CONCLUSIONS",                                            │
│   ...                                                                       │
│   // ADD UK MDR obligations                                                 │
│   "UK.MDR.44ZM.3.CONCLUSIONS",                                             │
│   "UK.MDR.44ZM.3.DEVICES_INTENDED_USE",                                    │
│   "UK.MDR.44ZM.3.SALES_POPULATION_USAGE",                                  │
│   "UK.MDR.44ZM.3.SERIOUS_INCIDENTS",                                       │
│   "UK.MDR.44ZM.3.FSCA",                                                    │
│   "UK.MDR.44ZM.3.PMCF_MAIN_FINDINGS",                                      │
│   "UK.MDR.44ZM.3.PMS_RESULTS"                                              │
│ ],                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
STEP 4: Add Company-Specific Slots
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ "slots": [                                                                  │
│   // Keep all core slots from MDCG template...                              │
│   { "slot_id": "MDCG.ANNEXI.COVER", ... },                                 │
│   { "slot_id": "MDCG.ANNEXI.TOC", ... },                                   │
│   ...                                                                       │
│   // ADD company-specific slots                                             │
│   {                                                                         │
│     "slot_id": "ACME.NOTIFIED_BODY_CORRESPONDENCE",                        │
│     "title": "Notified Body Correspondence Summary",                        │
│     "section_path": "A > Executive Summary > NB Review",                   │
│     "slot_kind": "NARRATIVE",                                              │
│     "required": true,                                                       │
│     "evidence_requirements": {                                              │
│       "required_types": ["notified_body_review_record"],                   │
│       "min_atoms": 1,                                                       │
│       "allow_empty_with_justification": true                               │
│     },                                                                      │
│     "output_requirements": {                                                │
│       "renderer": "md",                                                     │
│       "render_as": "narrative"                                             │
│     }                                                                       │
│   }                                                                         │
│ ]                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
STEP 5: Update Slot-Obligation Mappings
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ "mapping": {                                                                │
│   "MDCG.ANNEXI.COVER": ["EU.MDR.ART86.1.ADMIN"],                           │
│   "MDCG.ANNEXI.CONCLUSIONS": [                                             │
│     "EU.MDR.ART86.1.CONCLUSIONS",                                          │
│     "UK.MDR.44ZM.3.CONCLUSIONS"   // <-- ADD UK obligation                 │
│   ],                                                                        │
│   "ACME.NOTIFIED_BODY_CORRESPONDENCE": [                                   │
│     "EU.MDR.ART83.PMS_SYSTEM"     // <-- Map new slot to obligation        │
│   ],                                                                        │
│   ...                                                                       │
│ }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
STEP 6: Validate Template
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ The system automatically validates on load:                                 │
│ - Zod schema validation                                                    │
│ - Obligation coverage check                                                │
│ - Extension rule enforcement                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Company Template JSON Example

```json
{
  "template_id": "ACME_PSUR_V1",
  "name": "Acme Corporation PSUR Template (EU MDR + UK MDR)",
  "version": "1.0.0",
  "jurisdiction_scope": ["EU_MDR", "UK_MDR"],
  "normative_basis": [
    "EU.MDR.2017/745.ART86",
    "EU.MDR.2017/745.ANNEX_III",
    "UK.MDR.2002.44ZM",
    "ACME.QMS.PROC.PSU-001"
  ],
  "mandatory_obligation_ids": [
    "EU.MDR.ART86.1.ADMIN",
    "EU.MDR.ART86.1.CONCLUSIONS",
    "EU.MDR.ART86.1.DEVICES_INTENDED_USE",
    "EU.MDR.ART86.1.SALES_POPULATION_USAGE",
    "EU.MDR.ART86.1.SERIOUS_INCIDENTS",
    "EU.MDR.ART86.1.FSCA",
    "EU.MDR.ART86.1.PMCF_MAIN_FINDINGS",
    "EU.MDR.ART88.TREND_REPORTING",
    "EU.MDR.ANNEX_III.COMPLAINTS_FEEDBACK",
    "EU.MDR.ANNEX_III.LITERATURE_REVIEW",
    "UK.MDR.44ZM.3.CONCLUSIONS",
    "UK.MDR.44ZM.3.SERIOUS_INCIDENTS",
    "UK.MDR.44ZM.3.PMS_RESULTS"
  ],
  "defaults": {
    "require_traceability": true,
    "require_method_statement": true,
    "require_claimed_obligations": true,
    "min_method_chars": 10,
    "min_evidence_atoms": 1
  },
  "slots": [
    {
      "slot_id": "ACME.COVER",
      "title": "PSUR Cover Page (Acme Format)",
      "section_path": "Cover",
      "slot_kind": "ADMIN",
      "required": true,
      "evidence_requirements": {
        "required_types": ["manufacturer_profile", "device_registry_record"],
        "min_atoms": 1,
        "allow_empty_with_justification": false
      },
      "output_requirements": {
        "renderer": "md",
        "render_as": "cover_page"
      }
    },
    {
      "slot_id": "ACME.EXEC_SUMMARY",
      "title": "Section A - Executive Summary",
      "section_path": "A > Executive Summary",
      "slot_kind": "NARRATIVE",
      "required": true,
      "evidence_requirements": {
        "required_types": [
          "previous_psur_actions",
          "sales_summary",
          "complaint_summary",
          "serious_incident_summary"
        ],
        "min_atoms": 1,
        "allow_empty_with_justification": true
      },
      "output_requirements": {
        "renderer": "md",
        "render_as": "narrative"
      }
    }
  ],
  "mapping": {
    "ACME.COVER": ["EU.MDR.ART86.1.ADMIN"],
    "ACME.EXEC_SUMMARY": [
      "EU.MDR.ART86.1.CONCLUSIONS",
      "UK.MDR.44ZM.3.CONCLUSIONS"
    ]
  }
}
```

---

## 5. Template Validation Rules

### 5.1 Extension Constraints (ENFORCED)

The template extension validator (`templateExtension.ts`) enforces these rules:

| Rule | Description | Violation Result |
|------|-------------|------------------|
| **No Override** | `extensionType` must be `ADDITIVE`, never `OVERRIDE` | Template rejected |
| **No Calculation Override** | `overrideCalculation` must be `false` for all section extensions | Template rejected |
| **No Obligation Override** | `overrideObligation` must be `false` for all section extensions | Template rejected |
| **Valid Obligation References** | All obligation IDs must exist in GRKB | Template rejected |
| **No Core Section Conflict** | Additional section IDs must not conflict with core PSUR sections | Template rejected |
| **Kernel Override Prevention** | `validationRules.preventKernelOverride` must be `true` | Template rejected |
| **Schema Version** | Must use supported schema version (currently `1.0.0`) | Template rejected |
| **Base Contract** | Must extend `PSUR_CONTRACT_V1` | Template rejected |

### 5.2 Validation Process

```
Template Loaded
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: ZOD SCHEMA VALIDATION                                               │
│ (templateSchema.ts)                                                         │
│                                                                              │
│ - Check template_id, name, version present                                  │
│ - Validate jurisdiction_scope is ["EU_MDR"] or ["EU_MDR", "UK_MDR"]        │
│ - Validate each slot has required fields                                   │
│ - Validate output_requirements structure                                   │
│ - Validate evidence_requirements structure                                 │
└─────────────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: EXTENSION VALIDATION                                                │
│ (templateExtension.ts)                                                      │
│                                                                              │
│ - Check extensionType != "OVERRIDE"                                        │
│ - Check no sectionExtension has overrideCalculation = true                 │
│ - Check no sectionExtension has overrideObligation = true                  │
│ - Validate all obligationReferences exist in GRKB                          │
│ - Check additionalSections don't conflict with core sections               │
└─────────────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: OBLIGATION COVERAGE CHECK                                           │
│ (psurGrkbService.checkTemplateCoverage)                                     │
│                                                                              │
│ - Get all mandatory obligations for selected jurisdictions                 │
│ - For each mandatory obligation:                                           │
│   - Check if any slot maps to it                                           │
│   - Calculate coverage percentage                                          │
│ - Report: covered, uncovered, partial coverage                             │
└─────────────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: DEPENDENCY GRAPH VALIDATION                                         │
│                                                                              │
│ - For each obligation:                                                      │
│   - Traverse REQUIRES dependencies                                         │
│   - Verify all dependencies are satisfiable                                │
│ - Report: All dependency chains valid or list failures                     │
└─────────────────────────────────────────────────────────────────────────────┘
     │
     ├── ALL PASS ──────► Template QUALIFIED
     │
     └── ANY FAIL ──────► Template BLOCKED (with detailed errors)
```

### 5.3 Validation Error Categories

```typescript
type TemplateErrorCategory =
  | "OVERRIDE_VIOLATION"           // Attempted to override core functionality
  | "MISSING_OBLIGATION_REFERENCE" // Referenced non-existent obligation
  | "CALCULATION_OVERRIDE"         // Attempted to redefine calculations
  | "CORE_SECTION_MODIFICATION"    // Attempted to modify core section
  | "INVALID_SCHEMA"               // Schema validation failed
  | "ANNEX_I_CONFLICT";            // Conflicts with MDCG Annex I requirements
```

---

## 6. Slot-to-Obligation Mapping

### 6.1 Mapping Structure

The `mapping` object in the template connects slots to regulatory obligations:

```json
{
  "mapping": {
    "SLOT_ID_1": ["OBLIGATION_ID_1", "OBLIGATION_ID_2"],
    "SLOT_ID_2": ["OBLIGATION_ID_3"],
    ...
  }
}
```

### 6.2 How Mappings Work

```
SLOT: ACME.COMPLAINTS_SUMMARY
     │
     │ mapping["ACME.COMPLAINTS_SUMMARY"] = [
     │   "EU.MDR.ANNEX_III.COMPLAINTS_FEEDBACK",
     │   "UK.MDR.44ZM.3.PMS_RESULTS"
     │ ]
     │
     ├─────────────────────────────────────────────────────────────┐
     │                                                             │
     ▼                                                             ▼
┌─────────────────────────────────┐     ┌─────────────────────────────────────┐
│ EU.MDR.ANNEX_III.COMPLAINTS_    │     │ UK.MDR.44ZM.3.PMS_RESULTS           │
│ FEEDBACK                        │     │                                      │
│                                 │     │ UK MDR Regulation 44ZM(3):          │
│ Annex III MDR:                  │     │ "Summary of results of PMS          │
│ "Information from manufacturer's │     │  activities including complaints,   │
│  complaints and feedback system  │     │  incidents, and corrective actions" │
│  (e.g., complaints, inquiries)"  │     │                                      │
└─────────────────────────────────┘     └─────────────────────────────────────┘
     │                                             │
     └──────────────────────┬──────────────────────┘
                            │
                            ▼
              Slot satisfies BOTH obligations
              when evidence is provided
```

### 6.3 Coverage Calculation

```
For each mandatory obligation:

  Coverage% = Sum of coveragePercentage from all slots mapping to it

  If Coverage% >= 100%: Obligation SATISFIED
  If Coverage% > 0% and < 100%: PARTIAL COVERAGE (warning)
  If Coverage% = 0%: UNCOVERED (error for mandatory obligations)
```

### 6.4 Multi-Slot Coverage

Some obligations may be covered by multiple slots:

```json
{
  "mapping": {
    "SLOT_A": ["OBL.COMPLAINTS"],    // 50% coverage
    "SLOT_B": ["OBL.COMPLAINTS"],    // 30% coverage  
    "SLOT_C": ["OBL.COMPLAINTS"]     // 20% coverage
  }
}
// Total: 100% coverage of OBL.COMPLAINTS
```

---

## 7. Template Loading and Resolution

### 7.1 Template Loading Flow

```
User selects template in PSUR Wizard
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ loadTemplate(templateId)                                                    │
│ (templateStore.ts)                                                          │
│                                                                              │
│ 1. Resolve alias: "FormQAR-054_C" -> canonical ID                          │
│ 2. Locate file: server/templates/{canonicalId}.json                        │
│ 3. Parse JSON                                                               │
│ 4. Validate with Zod schema                                                │
│ 5. Return Template object or throw error                                   │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Orchestrator Step 1: qualifyTemplate                                        │
│                                                                              │
│ 1. Check jurisdiction scope matches case jurisdictions                     │
│ 2. Validate slot definitions                                               │
│ 3. Check mandatory obligation coverage via GRKB                            │
│ 4. Verify dependency graph validity                                        │
│ 5. Return qualification result                                             │
│                                                                              │
│ Output:                                                                      │
│ {                                                                            │
│   status: "QUALIFIED" | "BLOCKED",                                          │
│   slotCount: 22,                                                            │
│   mappingCount: 19,                                                         │
│   mandatoryObligationsTotal: 20,                                            │
│   mandatoryObligationsFound: 19,                                            │
│   constraints: 12                                                           │
│ }                                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Template Caching

Templates are cached after first load for performance:

```typescript
const templateCache = new Map<string, Template>();

export function getTemplateById(templateId: string): Template {
  const canonicalId = TEMPLATE_ALIASES[templateId] || templateId;
  
  if (templateCache.has(canonicalId)) {
    return templateCache.get(canonicalId)!;
  }
  
  const template = loadTemplate(templateId);
  templateCache.set(canonicalId, template);
  return template;
}

// Clear cache when templates are updated
export function clearTemplateCache(): void {
  templateCache.clear();
}
```

### 7.3 Template Accessors

```typescript
// Get all slots
getSlots(template: Template): SlotDefinition[]

// Get specific slot
getSlotById(template: Template, slotId: string): SlotDefinition | undefined

// Get required evidence types for a slot
getSlotRequiredTypes(template: Template, slotId: string): string[]

// Get obligations mapped to a slot
getSlotObligations(template: Template, slotId: string): string[]

// Get all required evidence types across template
getAllRequiredEvidenceTypes(template: Template): string[]

// Get all obligation IDs referenced in template
getAllObligationIds(template: Template): string[]
```

---

## 8. Worked Example: FormQAR-054_C

The FormQAR-054_C template demonstrates how a company template extends MDCG 2022-21:

### 8.1 Key Differences from MDCG Base

| Aspect | MDCG 2022-21 Annex I | FormQAR-054_C |
|--------|---------------------|---------------|
| **Jurisdictions** | EU_MDR only | EU_MDR + UK_MDR |
| **Slot Count** | 22 slots | 28 slots |
| **Obligation Count** | 15 mandatory | 19 mandatory |
| **Additional Sections** | None | Previous PSUR Actions, NB Review, Company-specific subsections |
| **Evidence Types** | Standard | Extended with `previous_psur_actions`, `notified_body_review_record` |

### 8.2 Company-Specific Slots Added

```json
{
  "slot_id": "FORMQAR054.A.PREV_PSUR_ACTIONS",
  "title": "Previous PSUR Actions and Status",
  "section_path": "A > Executive Summary > Previous Actions",
  "slot_kind": "TABLE",
  "required": true,
  "evidence_requirements": {
    "required_types": ["previous_psur_actions"],
    "min_atoms": 0,
    "allow_empty_with_justification": true
  },
  "output_requirements": {
    "renderer": "md",
    "render_as": "table",
    "table_schema": {
      "columns": [
        { "name": "action_id", "type": "string" },
        { "name": "action_description", "type": "string" },
        { "name": "status", "type": "string" },
        { "name": "completion_date", "type": "string" }
      ]
    }
  }
}
```

### 8.3 UK MDR Obligation Mapping

```json
{
  "FORMQAR054.M.CONCLUSIONS": [
    "EU.MDR.ART86.1.CONCLUSIONS",
    "UK.MDR.44ZM.3.CONCLUSIONS"
  ],
  "FORMQAR054.C.SALES_EXPOSURE": [
    "EU.MDR.ART86.1.SALES_POPULATION_USAGE",
    "UK.MDR.44ZM.3.SALES_POPULATION_USAGE"
  ]
}
```

---

## 9. API Integration

### 9.1 Template Selection Endpoint

```
GET /api/templates

Response:
{
  "templates": [
    {
      "templateId": "MDCG_2022_21_ANNEX_I",
      "name": "MDCG 2022-21 Annex I - Template for the PSUR (EU MDR)",
      "version": "1.0.0",
      "jurisdictions": ["EU_MDR"]
    },
    {
      "templateId": "FormQAR-054_C",
      "name": "FormQAR-054 Rev C - Company PSUR Template (EU MDR + UK MDR)",
      "version": "1.0.0",
      "jurisdictions": ["EU_MDR", "UK_MDR"]
    }
  ]
}
```

### 9.2 Template Coverage Check

```
GET /api/psur-grkb/coverage/:templateId?jurisdictions=EU_MDR,UK_MDR

Response:
{
  "templateId": "FormQAR-054_C",
  "jurisdictions": ["EU_MDR", "UK_MDR"],
  "coverage": {
    "covered": ["EU.MDR.ART86.1.ADMIN", "EU.MDR.ART86.1.CONCLUSIONS", ...],
    "uncovered": [],
    "partialCoverage": [
      { "obligationId": "EU.MDR.ART88.TREND_REPORTING", "totalCoverage": 75 }
    ]
  },
  "qualified": true
}
```

### 9.3 Case Creation with Company Template

```
POST /api/psur-cases

Request:
{
  "templateId": "FormQAR-054_C",
  "deviceCode": "DEV001",
  "deviceId": 1,
  "jurisdictions": ["EU_MDR", "UK_MDR"],
  "periodStart": "2025-01-01",
  "periodEnd": "2025-12-31"
}

Response:
{
  "id": 42,
  "psurReference": "PSUR-DEV001-1736789123456",
  "templateId": "FormQAR-054_C",
  "status": "draft"
}
```

---

## 10. Troubleshooting

### 10.1 Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Template not found` | Template file missing or wrong path | Check `server/templates/` folder |
| `Template validation failed` | JSON schema mismatch | Run Zod validation manually |
| `Obligation not found` | Referenced non-existent obligation ID | Check GRKB for valid obligation IDs |
| `Core section conflict` | New section ID matches core section | Rename new section with company prefix |
| `Coverage insufficient` | Mandatory obligation not mapped | Add slot that maps to missing obligation |

### 10.2 Debugging Template Load

```typescript
// Get debug info about template resolution
import { getTemplateDirsDebugInfo } from "./templateStore";

const debug = getTemplateDirsDebugInfo();
console.log(debug);
// {
//   cwd: "/path/to/project",
//   __dirname: "/path/to/server/src",
//   checks: [
//     { dir: ".../server/templates", exists: true, files: ["MDCG_2022_21_ANNEX_I.json", ...] }
//   ]
// }
```

### 10.3 Validating Template Manually

```typescript
import { validateTemplate } from "./templates/templateSchema";
import { loadTemplate } from "./templateStore";

const template = loadTemplate("YOUR_TEMPLATE_ID");
const result = validateTemplate(template);

if (!result.success) {
  console.error("Validation errors:", result.errors);
}
```

### 10.4 Template Lint Command

```bash
# Run template linting (if available)
npx ts-node server/src/templates/runLint.ts
```

---

## Summary

To incorporate a company template instead of the default MDCG template:

1. **Create** a new JSON file in `server/templates/` following the schema
2. **Extend** (don't replace) the MDCG base by adding slots and UK MDR obligations
3. **Map** all new slots to valid GRKB obligation IDs
4. **Validate** by loading the template - the system enforces all extension rules
5. **Select** your template in the PSUR Wizard when creating a new case

The system ensures regulatory compliance by:
- Preventing core section removal or modification
- Enforcing obligation coverage
- Maintaining calculation integrity
- Requiring evidence traceability

Company templates allow organizational customization while preserving the regulatory foundation required for EU MDR and UK MDR compliance.
