# RegulatoryOS PSUR Engine: Complete Technical Specification

**Version**: 1.0.0  
**Last Updated**: January 2026  
**Classification**: Technical Documentation

---

## Table of Contents

1. [Executive Overview](#1-executive-overview)
2. [System Architecture](#2-system-architecture)
3. [User Experience Flow](#3-user-experience-flow)
4. [Step 1: Case Creation](#4-step-1-case-creation)
5. [Step 2: Document Upload & AI Ingestion](#5-step-2-document-upload--ai-ingestion)
6. [Step 3: Evidence Review & Atomization](#6-step-3-evidence-review--atomization)
7. [Step 4: PSUR Compilation Workflow](#7-step-4-psur-compilation-workflow)
8. [Orchestrator Deep Dive](#8-orchestrator-deep-dive)
9. [GRKB Integration](#9-grkb-integration)
10. [AI Agent Infrastructure](#10-ai-agent-infrastructure)
11. [Decision Tracing System](#11-decision-tracing-system)
12. [Final Outputs](#12-final-outputs)
13. [Database Schema Summary](#13-database-schema-summary)
14. [API Reference](#14-api-reference)

---

## 1. Executive Overview

The RegulatoryOS PSUR Engine is a state-of-the-art regulatory document automation system that generates EU MDR/UK MDR compliant Periodic Safety Update Reports. The system combines:

- **Template-driven document generation** following MDCG 2022-21 and company-specific templates
- **AI-powered document ingestion** with automatic field mapping and evidence extraction
- **Regulatory knowledge base (GRKB)** with 70+ PSUR-specific obligations
- **Hash-verified decision tracing** for complete audit trail
- **Ephemeral AI agents** for narrative generation and compliance checking

### Key Metrics

| Metric | Value |
|--------|-------|
| Templates Supported | 2 (FormQAR-054_C, MDCG_2022_21_ANNEX_I) |
| Evidence Types | 11 categories |
| EU MDR Obligations | 20+ |
| UK MDR Obligations | 6 |
| Workflow Steps | 8 orchestrator steps |
| Output Formats | DOCX, Markdown, ZIP Bundle |

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ PSUR Wizard │  │ Admin Panel │  │ Instructions│  │ API Clients │        │
│  │  (React)    │  │  (React)    │  │   (React)   │  │   (REST)    │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER (Express.js)                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Routes: /api/psur-cases, /api/orchestrator, /api/psur-grkb, etc.    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SERVICE LAYER                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Orchestrator │  │  PSUR-GRKB   │  │   Decision   │  │    Agent     │    │
│  │   Workflow   │  │   Service    │  │    Trace     │  │ Orchestrator │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA LAYER                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     PostgreSQL (Neon Serverless)                      │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │  │
│  │  │ psur_cases │ │ evidence_  │ │ grkb_      │ │ decision_  │        │  │
│  │  │            │ │ atoms      │ │ obligations│ │ trace_     │        │  │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL (Neon), Drizzle ORM |
| AI/LLM | OpenAI GPT-4, Anthropic Claude (fallback) |
| Document Processing | mammoth, pdf-parse, xlsx, docx |
| Authentication | Session-based (extensible) |

---

## 3. User Experience Flow

### 3.1 Wizard Overview

The PSUR Wizard guides users through a 4-step process:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 1          STEP 2           STEP 3           STEP 4                   │
│  ┌─────┐        ┌─────┐          ┌─────┐          ┌─────┐                  │
│  │ 1   │───────▶│ 2   │─────────▶│ 3   │─────────▶│ 4   │                  │
│  └─────┘        └─────┘          └─────┘          └─────┘                  │
│  Create         Upload           Review           Compile                   │
│  Case           Documents        Evidence         PSUR                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Step-by-Step UX Description

#### Step 1: Create Case
- **Visual**: Two template cards (FormQAR-054 and MDCG 2022-21) for selection
- **Inputs**: Device Code, Device ID dropdown, Jurisdiction checkboxes, Period dates
- **Action**: "Create PSUR Case" button
- **Feedback**: Case ID displayed, step indicator advances

#### Step 2: Upload Documents
- **Tabs**: "AI Document Ingestion" | "Manual Upload"
- **AI Ingestion Modal**: 
  - Source type selector (Sales, Complaints, FSCA, etc.)
  - Drag-and-drop file zone
  - Field mapping tool with auto-suggestions
- **Manual Upload Modal**:
  - Evidence type selector (cards with icons)
  - File upload for CSV/Excel
- **Load Sample Data**: Button to populate demo evidence

#### Step 3: Review Evidence
- **Display**: Evidence atoms grouped by category (Safety, Clinical, Commercial, etc.)
- **Metrics**: Total atoms, Types covered, Types missing
- **Validation**: Red badges for missing required types
- **Action**: "Continue to Compile" (disabled until all required types present)

#### Step 4: Compile PSUR
- **Pre-run Summary**: Case details, template, jurisdictions
- **Run Button**: "Run PSUR Workflow"
- **Progress Display**: 8-step progress with real-time status updates
- **Decision Trace Panel**: Event counts, accepted/rejected slots, chain validity
- **Downloads**: DOCX, Markdown, Full Audit Bundle, Decision Trace JSONL
- **Exit**: "Start New PSUR" button resets wizard

---

## 4. Step 1: Case Creation

### 4.1 UX Components

```typescript
// Template Selection (Visual Cards)
interface TemplateCard {
  templateId: "FormQAR-054_C" | "MDCG_2022_21_ANNEX_I";
  name: string;
  description: string;
  slotCount: number;
  obligationCount: number;
}

// Form Inputs
interface CaseCreationForm {
  templateId: string;
  deviceCode: string;
  deviceId: number;
  jurisdictions: ("EU_MDR" | "UK_MDR")[];
  periodStart: Date;
  periodEnd: Date;
}
```

### 4.2 Backend Process

```
User clicks "Create PSUR Case"
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ POST /api/psur-cases                                                        │
│                                                                              │
│ 1. Validate input schema (Zod)                                              │
│ 2. Generate PSUR reference: "PSUR-{deviceCode}-{timestamp}"                 │
│ 3. Insert into psur_cases table                                             │
│ 4. Link to device (devices table)                                           │
│ 5. Return case ID                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Database: psur_cases                                                        │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ id: 42                                                                   ││
│ │ psur_reference: "PSUR-DEV001-1736789123456"                              ││
│ │ template_id: "MDCG_2022_21_ANNEX_I"                                      ││
│ │ jurisdictions: ["EU_MDR", "UK_MDR"]                                      ││
│ │ start_period: 2025-01-01                                                 ││
│ │ end_period: 2025-12-31                                                   ││
│ │ status: "draft"                                                          ││
│ └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Decision Trace Entry

```json
{
  "traceId": "a1b2c3d4-...",
  "sequenceNum": 1,
  "eventType": "CASE_CREATED",
  "actor": "createCase",
  "entityType": "psur_case",
  "entityId": "42",
  "outputData": {
    "psurReference": "PSUR-DEV001-1736789123456",
    "templateId": "MDCG_2022_21_ANNEX_I"
  },
  "contentHash": "sha256:abc123...",
  "previousHash": null
}
```

---

## 5. Step 2: Document Upload & AI Ingestion

### 5.1 Source Types Supported

| Source Type | File Formats | Evidence Types Extracted |
|-------------|--------------|-------------------------|
| Sales Data | Excel, CSV, JSON | sales_volume |
| Complaints | Excel, CSV, DOCX | complaint_record, serious_incident_record |
| FSCA | Excel, DOCX | fsca_record |
| CAPA | Excel, DOCX | capa_record |
| PMCF | DOCX, PDF | pmcf_result |
| Literature | DOCX, Excel | literature_result |
| External DB | Excel | external_db_query |
| Risk | DOCX, PDF | risk_assessment |
| CER | DOCX, PDF | device_registry_record |

### 5.2 AI Ingestion Pipeline

```
User uploads file(s)
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AGENT: Format Detection Agent                                               │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ Input: Raw file bytes, filename, MIME type                              ││
│ │ Process:                                                                 ││
│ │   1. Detect file type (Excel, DOCX, PDF, CSV, JSON)                     ││
│ │   2. Extract raw content                                                 ││
│ │   3. Identify structure (tabular vs narrative)                          ││
│ │ Output: { format, structure, rawContent, headers?, sections? }          ││
│ │ Confidence: 0.95                                                         ││
│ └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AGENT: Domain Extraction Agent                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ Input: Parsed content, selected source type                             ││
│ │ Process:                                                                 ││
│ │   1. Apply domain-specific extraction rules                             ││
│ │   2. Identify candidate evidence types                                  ││
│ │   3. Extract key fields per row/section                                 ││
│ │ Output: { evidenceType, records: [...], confidence }                    ││
│ │ LLM Call: For unstructured content (DOCX narratives)                    ││
│ └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AGENT: Field Mapping Agent                                                  │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ Input: Extracted fields, target evidence type schema                    ││
│ │ Process:                                                                 ││
│ │   1. Exact match (source "Complaint ID" → target "complaint_id")        ││
│ │   2. Semantic match (source "Date Received" → target "received_date")   ││
│ │   3. LLM inference for ambiguous fields                                 ││
│ │ Output: { mappings: [{source, target, confidence, autoMapped}] }        ││
│ │ Decision Trace: MAPPING_SUGGESTED for each field                        ││
│ └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ UI: Field Mapping Tool (Manual Override)                                    │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ Source Fields          │  Target Schema (from GRKB)                     ││
│ │ ┌─────────────────┐    │  ┌─────────────────────────────────────┐      ││
│ │ │ Complaint ID    │────┼─▶│ complaint_id (required) [AUTO]      │      ││
│ │ │ Date Received   │────┼─▶│ received_date (required) [AUTO]     │      ││
│ │ │ Issue Desc      │────┼─▶│ description (required) [AUTO]       │      ││
│ │ │ Risk Level      │────┼─▶│ severity (optional) [MANUAL]        │      ││
│ │ │ Customer Name   │    │  │ [unmapped - not in schema]          │      ││
│ │ └─────────────────┘    │  └─────────────────────────────────────┘      ││
│ └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AGENT: Validation Agent                                                     │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ Input: Mapped data, evidence type schema (from psur_evidence_types)     ││
│ │ Process:                                                                 ││
│ │   1. Check required fields present                                      ││
│ │   2. Validate field types (date, number, enum)                          ││
│ │   3. Apply custom validation rules                                      ││
│ │ Output: { valid: boolean, errors: [], warnings: [] }                    ││
│ │ Decision Trace: EVIDENCE_VALIDATED                                      ││
│ └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Database: evidence_atoms                                                    │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ For each validated record:                                               ││
│ │ {                                                                        ││
│ │   atom_id: "atom-complaint-001-{uuid}",                                  ││
│ │   psur_case_id: 42,                                                      ││
│ │   evidence_type: "complaint_record",                                     ││
│ │   source_file: "complaints_2025.xlsx",                                   ││
│ │   normalized_data: { complaint_id: "C-2025-001", ... },                  ││
│ │   confidence_score: 0.92                                                 ││
│ │ }                                                                        ││
│ └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Classification Sub-Pipeline (for Complaints)

```
Complaint Record
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AGENT: Severity Classification Agent                                        │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ Input: Complaint description, patient outcome field                     ││
│ │ LLM Prompt:                                                              ││
│ │   "Classify this complaint. Does it describe:                           ││
│ │    - Death                                                               ││
│ │    - Serious injury requiring hospitalization                           ││
│ │    - Life-threatening condition                                         ││
│ │    - Intervention required to prevent permanent damage                  ││
│ │    - Non-serious complaint"                                             ││
│ │ Output:                                                                  ││
│ │   { classification: "SERIOUS_INCIDENT" | "ADVERSE_EVENT" | "FEEDBACK",  ││
│ │     confidence: 0.89,                                                    ││
│ │     reasoning: "Patient required hospitalization..." }                  ││
│ │ Decision Trace: EVIDENCE_CLASSIFIED                                     ││
│ └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ├── If SERIOUS_INCIDENT → Create additional serious_incident_record atom
         │
         └── Update original complaint_record with severity field
```

### 5.4 Negative Evidence Generation

When a user uploads sales data but no complaints:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ NEGATIVE EVIDENCE GENERATOR                                                 │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ Trigger: Evidence type has 0 records after ingestion                    ││
│ │ Process:                                                                 ││
│ │   1. Check if evidence type is required for template                    ││
│ │   2. If required, create negative evidence atom                         ││
│ │ Output:                                                                  ││
│ │   {                                                                      ││
│ │     atom_id: "neg-complaint-{uuid}",                                    ││
│ │     evidence_type: "complaint_record",                                  ││
│ │     normalized_data: {                                                   ││
│ │       isNegativeEvidence: true,                                         ││
│ │       statement: "No complaints received during reporting period",      ││
│ │       period: "2025-01-01 to 2025-12-31"                                ││
│ │     }                                                                    ││
│ │   }                                                                      ││
│ │ Decision Trace: NEGATIVE_EVIDENCE_CREATED                               ││
│ └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Step 3: Evidence Review & Atomization

### 6.1 Evidence Summary Display

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Evidence Review                                              Total: 156     │
├─────────────────────────────────────────────────────────────────────────────┤
│ SAFETY                                                                      │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│ │ Complaints  │ │ Serious Inc │ │ FSCA        │ │ CAPA        │           │
│ │    127      │ │      3      │ │      1      │ │      8      │           │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                                             │
│ CLINICAL                                                                    │
│ ┌─────────────┐ ┌─────────────┐                                            │
│ │ PMCF        │ │ Literature  │                                            │
│ │      2      │ │     12      │                                            │
│ └─────────────┘ └─────────────┘                                            │
│                                                                             │
│ COMMERCIAL                                                                  │
│ ┌─────────────┐                                                            │
│ │ Sales       │                                                            │
│ │      4      │                                                            │
│ └─────────────┘                                                            │
│                                                                             │
│ Types Covered: 7/11 │ MISSING: trend_analysis, external_db_query,          │
│                      risk_assessment, device_registry_record               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Evidence Atom Structure

```typescript
interface EvidenceAtom {
  id: number;
  atomId: string;                    // "atom-complaint-001-abc123"
  psurCaseId: number;
  evidenceType: string;              // "complaint_record"
  sourceUploadId: number | null;
  sourceFile: string | null;
  normalizedData: {
    // Type-specific fields validated against psur_evidence_types schema
    complaint_id?: string;
    received_date?: string;
    description?: string;
    severity?: string;
    // ... or for negative evidence:
    isNegativeEvidence?: boolean;
    statement?: string;
  };
  rawData: Record<string, unknown>;  // Original unprocessed data
  confidenceScore: number;           // 0.0 - 1.0
  validationStatus: "pending" | "valid" | "invalid";
  validationErrors: string[];
  createdAt: Date;
}
```

### 6.3 Evidence Type Requirements Check

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ GRKB EVIDENCE REQUIREMENTS CHECK                                            │
│                                                                              │
│ Template: MDCG_2022_21_ANNEX_I                                              │
│ Jurisdictions: EU_MDR, UK_MDR                                               │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ Obligation                    │ Required Type     │ Atoms │ Status     ││
│ ├─────────────────────────────────────────────────────────────────────────┤│
│ │ EU_MDR.ART86.1.c             │ sales_volume      │   4   │ SATISFIED  ││
│ │ EU_MDR.ART86.COMPLAINTS      │ complaint_record  │  127  │ SATISFIED  ││
│ │ EU_MDR.ART86.SI.SUMMARY      │ serious_incident  │   3   │ SATISFIED  ││
│ │ EU_MDR.ART86.FSCA            │ fsca_record       │   1   │ SATISFIED  ││
│ │ EU_MDR.ART86.PMCF            │ pmcf_result       │   2   │ SATISFIED  ││
│ │ EU_MDR.ART88.TREND           │ trend_analysis    │   0   │ MISSING    ││
│ │ EU_MDR.ANNEXIII.EXTERNAL_DB  │ external_db_query │   0   │ MISSING    ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│ Coverage: 5/7 mandatory obligations have evidence                           │
│ Action Required: Upload trend analysis and external DB search results       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Step 4: PSUR Compilation Workflow

### 7.1 Pre-Run Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PSUR Compilation - Ready to Run                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Case:         PSUR-DEV001-1736789123456                                     │
│ Template:     MDCG 2022-21 Annex I                                          │
│ Device:       DEV001 - CardioMonitor Pro                                    │
│ Period:       2025-01-01 to 2025-12-31                                      │
│ Jurisdictions: EU MDR, UK MDR                                               │
│ Evidence:     156 atoms across 7 types                                      │
│ Obligations:  20 EU + 6 UK = 26 total                                       │
│                                                                              │
│ [▶ Run PSUR Workflow]                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Real-Time Progress Display

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Workflow Progress                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ Step 1: Qualify Template      [████████████████████] COMPLETE  2.3s        │
│ Step 2: Create/Load Case      [████████████████████] COMPLETE  0.8s        │
│ Step 3: Ingest Evidence       [████████████████████] COMPLETE  5.2s        │
│ Step 4: Propose Slots         [████████████████████] COMPLETE  3.1s        │
│ Step 5: Adjudicate            [██████████░░░░░░░░░░] RUNNING   1.2s        │
│ Step 6: Coverage Report       [░░░░░░░░░░░░░░░░░░░░] PENDING               │
│ Step 7: Render Document       [░░░░░░░░░░░░░░░░░░░░] PENDING               │
│ Step 8: Export Bundle         [░░░░░░░░░░░░░░░░░░░░] PENDING               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Orchestrator Deep Dive

### 8.1 Orchestrator Step 1: Qualify Template

**Purpose**: Validate template against GRKB obligations before proceeding.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: QUALIFY TEMPLATE                                                    │
│ Actor: qualifyTemplate                                                      │
│ Input: templateId, jurisdictions                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ 1. Load Template JSON                                                       │
│    ├── File: server/templates/MDCG_2022_21_ANNEX_I.json                    │
│    └── Parse: 22 slots, 19 mappings                                        │
│                                                                              │
│ 2. Validate Against Zod Schema                                              │
│    ├── Check: template_id, name, version                                   │
│    ├── Check: jurisdiction_scope matches request                           │
│    ├── Check: Each slot has required fields                                │
│    └── Result: PASS or FAIL with errors                                    │
│                                                                              │
│ 3. GRKB Obligation Coverage Check                                           │
│    ├── Query: getMandatoryObligations(["EU_MDR", "UK_MDR"])                │
│    ├── For each obligation:                                                 │
│    │   └── Check if any slot maps to it (psur_slot_obligations)            │
│    ├── Calculate: covered / total                                          │
│    └── Result: { covered: 19, uncovered: 1, partialCoverage: [] }          │
│                                                                              │
│ 4. Dependency Graph Validation                                              │
│    ├── For each obligation:                                                 │
│    │   └── Check if REQUIRES dependencies are satisfiable                  │
│    └── Result: All dependency chains valid                                 │
│                                                                              │
│ Output:                                                                      │
│ {                                                                            │
│   status: "QUALIFIED",                                                       │
│   slotCount: 22,                                                            │
│   mappingCount: 19,                                                         │
│   mandatoryObligationsTotal: 20,                                            │
│   mandatoryObligationsFound: 19,                                            │
│   constraints: 12                                                           │
│ }                                                                            │
│                                                                              │
│ Decision Traces:                                                             │
│   - TEMPLATE_QUALIFIED (if pass)                                            │
│   - TEMPLATE_BLOCKED (if fail)                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Orchestrator Step 2: Create Case

**Purpose**: Create or load the PSUR case record.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: CREATE CASE                                                         │
│ Actor: createCase                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ If existing psurCaseId provided:                                            │
│   ├── Load from database                                                    │
│   └── Verify template matches                                               │
│                                                                              │
│ If new case:                                                                 │
│   ├── Generate PSUR reference                                               │
│   ├── Insert into psur_cases                                                │
│   └── Initialize compliance checklist (psur_compliance_checklist)          │
│                                                                              │
│ Output:                                                                      │
│ {                                                                            │
│   psurCaseId: 42,                                                           │
│   psurReference: "PSUR-DEV001-...",                                         │
│   status: "in_progress"                                                     │
│ }                                                                            │
│                                                                              │
│ GRKB Integration:                                                            │
│   - Initialize compliance checklist with all applicable obligations         │
│   - Set all items to "pending" status                                       │
│                                                                              │
│ Decision Trace: CASE_CREATED                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Orchestrator Step 3: Ingest Evidence

**Purpose**: Load all evidence atoms for the case and validate.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: INGEST EVIDENCE                                                     │
│ Actor: ingestEvidence                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ 1. Query Evidence Atoms                                                     │
│    SELECT * FROM evidence_atoms WHERE psur_case_id = 42                     │
│    Result: 156 atoms                                                        │
│                                                                              │
│ 2. Group by Evidence Type                                                   │
│    {                                                                         │
│      "complaint_record": 127,                                               │
│      "serious_incident_record": 3,                                          │
│      "fsca_record": 1,                                                      │
│      "capa_record": 8,                                                      │
│      "pmcf_result": 2,                                                      │
│      "literature_result": 12,                                               │
│      "sales_volume": 4                                                      │
│    }                                                                         │
│                                                                              │
│ 3. Validate Each Atom Against Schema                                        │
│    For each atom:                                                            │
│      ├── Get schema from psur_evidence_types                                │
│      ├── Validate required fields                                           │
│      ├── Validate field types                                               │
│      └── Update validation_status                                           │
│                                                                              │
│ 4. Generate Negative Evidence (if needed)                                   │
│    For each required evidence type with 0 atoms:                            │
│      └── Create negative evidence atom                                      │
│                                                                              │
│ Output:                                                                      │
│ {                                                                            │
│   totalAtoms: 156,                                                          │
│   byType: { ... },                                                          │
│   negativeEvidence: ["trend_analysis", "external_db_query"],                │
│   validationErrors: []                                                      │
│ }                                                                            │
│                                                                              │
│ Decision Traces:                                                             │
│   - EVIDENCE_ATOM_CREATED (for each atom)                                   │
│   - NEGATIVE_EVIDENCE_CREATED (for negative evidence)                       │
│   - EVIDENCE_VALIDATED (batch)                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Orchestrator Step 4: Propose Slots

**Purpose**: Generate slot proposals by matching evidence to template slots.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: PROPOSE SLOTS                                                       │
│ Actor: proposeSlots (Deterministic Generators + Ephemeral Agents)           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ For each slot in template:                                                   │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ SLOT: MDCG.ANNEXI.F (Complaints Summary)                                ││
│ │                                                                          ││
│ │ 1. Get Required Evidence Types                                          ││
│ │    ├── From slot definition: ["complaint_record"]                       ││
│ │    └── From GRKB mappings: obligations requiring this type              ││
│ │                                                                          ││
│ │ 2. Query Matching Atoms                                                 ││
│ │    SELECT * FROM evidence_atoms                                         ││
│ │    WHERE psur_case_id = 42                                              ││
│ │    AND evidence_type IN ('complaint_record')                            ││
│ │    Result: 127 atoms                                                    ││
│ │                                                                          ││
│ │ 3. Deterministic Generator: Table Data                                  ││
│ │    ├── Extract fields: complaint_id, date, severity, outcome            ││
│ │    ├── Calculate statistics: by region, by severity, by month           ││
│ │    └── Generate table rows                                              ││
│ │                                                                          ││
│ │ 4. Ephemeral Agent: Narrative Writer                                    ││
│ │    ├── Input: Aggregated complaint data, template requirements          ││
│ │    ├── Prompt: "Write a regulatory narrative summarizing..."            ││
│ │    ├── Output: Narrative text with citations                            ││
│ │    └── Confidence: 0.88                                                 ││
│ │                                                                          ││
│ │ 5. Build Proposal                                                       ││
│ │    {                                                                     ││
│ │      slotId: "MDCG.ANNEXI.F",                                           ││
│ │      proposalId: "prop-F-001",                                          ││
│ │      status: "READY",                                                   ││
│ │      evidenceAtomIds: ["atom-001", "atom-002", ...], // 127 atoms       ││
│ │      claimedObligationIds: ["EU_MDR.ART86.COMPLAINTS.SUMMARY"],         ││
│ │      methodStatement: "Generated from 127 complaint records...",        ││
│ │      generatedContent: { table: [...], narrative: "..." }               ││
│ │    }                                                                     ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│ If evidence missing for required slot:                                       │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ SLOT: MDCG.ANNEXI.E (Trend Reporting)                                   ││
│ │                                                                          ││
│ │ Required types: ["trend_analysis"]                                      ││
│ │ Available atoms: 0                                                      ││
│ │                                                                          ││
│ │ Check: allowEmptyWithJustification = true                               ││
│ │                                                                          ││
│ │ Proposal:                                                                ││
│ │ {                                                                        ││
│ │   slotId: "MDCG.ANNEXI.E",                                              ││
│ │   status: "TRACE_GAP",                                                  ││
│ │   evidenceAtomIds: [],                                                  ││
│ │   traceGapJustification: "No statistically significant trend..."       ││
│ │ }                                                                        ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│ Output:                                                                      │
│ {                                                                            │
│   proposals: [22 slot proposals],                                           │
│   ready: 18,                                                                │
│   traceGaps: 4                                                              │
│ }                                                                            │
│                                                                              │
│ Decision Traces:                                                             │
│   - SLOT_PROPOSED (for each slot)                                           │
│   - TRACE_GAP_DETECTED (for missing evidence)                               │
│   - AGENT_INVOKED (for each LLM call)                                       │
│   - NARRATIVE_GENERATED (for agent outputs)                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.5 Orchestrator Step 5: Adjudicate

**Purpose**: Review and accept/reject slot proposals based on quality criteria.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: ADJUDICATE                                                          │
│ Actor: adjudicator (Deterministic Rules + Quality Agent)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ For each proposal:                                                           │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ ADJUDICATION RULES                                                      ││
│ │                                                                          ││
│ │ Rule 1: Evidence Presence                                               ││
│ │   ├── Required: evidenceAtomIds.length >= slot.minAtoms                 ││
│ │   └── Check: 127 >= 1 → PASS                                            ││
│ │                                                                          ││
│ │ Rule 2: Obligation Coverage                                             ││
│ │   ├── Required: claimedObligationIds covers slot mapping                ││
│ │   └── Check: ["EU_MDR.ART86.COMPLAINTS.SUMMARY"] → PASS                 ││
│ │                                                                          ││
│ │ Rule 3: Method Statement Quality                                        ││
│ │   ├── Required: methodStatement.length >= 50 chars                      ││
│ │   └── Check: 234 chars → PASS                                           ││
│ │                                                                          ││
│ │ Rule 4: Content Completeness                                            ││
│ │   ├── For tables: All required columns present                          ││
│ │   ├── For narratives: Minimum word count met                            ││
│ │   └── Check: 22 columns, 450 words → PASS                               ││
│ │                                                                          ││
│ │ Rule 5: Trace Gap Justification (if TRACE_GAP)                          ││
│ │   ├── Required: justification present and meaningful                    ││
│ │   └── Agent: Quality Auditor validates justification                    ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ EPHEMERAL AGENT: Quality Auditor (Optional)                             ││
│ │                                                                          ││
│ │ Invoked for: Narrative slots, Trace gap justifications                  ││
│ │ Input: Generated content, template requirements, evidence summary       ││
│ │ Prompt: "Review this content for regulatory compliance..."              ││
│ │ Output: { approved: boolean, issues: [], suggestions: [] }              ││
│ │ Decision: If approved → ACCEPT, else → REJECT with reasons              ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│ Output:                                                                      │
│ {                                                                            │
│   accepted: [20 proposals],                                                 │
│   rejected: [2 proposals with reasons]                                      │
│ }                                                                            │
│                                                                              │
│ Update Database:                                                             │
│   - slot_proposals: Update status to "ACCEPTED" or "REJECTED"               │
│   - psur_compliance_checklist: Update obligation status                     │
│                                                                              │
│ Decision Traces:                                                             │
│   - SLOT_ACCEPTED (for each accepted)                                       │
│   - SLOT_REJECTED (for each rejected with reasons)                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.6 Orchestrator Step 6: Coverage Report

**Purpose**: Calculate final obligation coverage and compliance status.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 6: COVERAGE REPORT                                                     │
│ Actor: coverageReport                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ 1. Query All Obligations                                                    │
│    ├── EU_MDR: 20 obligations                                              │
│    └── UK_MDR: 6 obligations                                               │
│                                                                              │
│ 2. For Each Obligation:                                                     │
│    ├── Find mapped slots (psur_slot_obligations)                           │
│    ├── Check if any accepted proposal covers it                            │
│    ├── Calculate coverage percentage                                       │
│    └── Update compliance checklist                                         │
│                                                                              │
│ 3. Resolve Dependency Graph                                                 │
│    For obligation with dependencies:                                        │
│    ├── Traverse REQUIRES relationships                                     │
│    ├── Verify all dependencies satisfied                                   │
│    └── Mark as satisfied only if all deps met                              │
│                                                                              │
│ 4. Generate Report                                                          │
│    {                                                                         │
│      total: 26,                                                             │
│      satisfied: 24,                                                         │
│      unsatisfied: 2,                                                        │
│      coverage: "92.3%",                                                     │
│      traceGaps: 2,                                                          │
│      byJurisdiction: {                                                       │
│        EU_MDR: { total: 20, satisfied: 19 },                                │
│        UK_MDR: { total: 6, satisfied: 5 }                                   │
│      },                                                                      │
│      unsatisfiedObligations: [                                               │
│        { id: "EU_MDR.ART88.TREND", reason: "No trend data" },               │
│        { id: "UK_MDR.PSUR.INCIDENTS", reason: "Insufficient evidence" }     │
│      ]                                                                       │
│    }                                                                         │
│                                                                              │
│ 5. Update Compliance Checklist                                              │
│    UPDATE psur_compliance_checklist                                         │
│    SET status = 'satisfied', satisfied_by_slots = [...]                     │
│    WHERE psur_case_id = 42 AND obligation_id = '...'                        │
│                                                                              │
│ Decision Traces:                                                             │
│   - OBLIGATION_SATISFIED (for each satisfied)                               │
│   - OBLIGATION_UNSATISFIED (for each unsatisfied with reasons)              │
│   - COVERAGE_COMPUTED (summary)                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.7 Orchestrator Step 7: Render Document

**Purpose**: Generate the final PSUR document in Markdown and DOCX formats.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 7: RENDER DOCUMENT                                                     │
│ Actor: documentRenderer                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ 1. Load Template Structure                                                  │
│    ├── Get section hierarchy from psur_sections                            │
│    └── Order by display_order                                              │
│                                                                              │
│ 2. For Each Section:                                                        │
│    ├── Get accepted proposal for slot                                      │
│    ├── Get rendering hints (render_as, table_schema)                       │
│    └── Generate content based on type                                      │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ RENDERING BY TYPE                                                       ││
│ │                                                                          ││
│ │ cover_page:                                                              ││
│ │   ├── Insert company logo                                                ││
│ │   ├── Device name, UDI, period                                          ││
│ │   └── Document version, date                                            ││
│ │                                                                          ││
│ │ table_of_contents:                                                       ││
│ │   ├── Auto-generate from section hierarchy                              ││
│ │   └── Include page numbers (DOCX only)                                  ││
│ │                                                                          ││
│ │ narrative:                                                               ││
│ │   ├── Insert agent-generated text                                       ││
│ │   ├── Add evidence citations                                            ││
│ │   └── Format: Arial 10pt                                                ││
│ │                                                                          ││
│ │ table:                                                                   ││
│ │   ├── Build from evidence atoms                                         ││
│ │   ├── Apply table_schema columns                                        ││
│ │   ├── Format: Calibri 10pt, Bold headers                                ││
│ │   └── Add "Data Source: Evidence Atom IDs" footer                       ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│ 3. Generate Appendices                                                      │
│    ├── Appendix A: Evidence Sources                                        │
│    │   └── Table of all evidence atoms with metadata                       │
│    └── Appendix B: Slot-Evidence Mapping                                   │
│        └── Which evidence atoms support which slots                        │
│                                                                              │
│ 4. Output Formats                                                           │
│    ├── Markdown: psur_PSUR-DEV001-xxx.md                                   │
│    └── DOCX: psur_PSUR-DEV001-xxx.docx                                     │
│        ├── Styles: Arial 12pt titles, Arial 10pt body                      │
│        └── Tables: Calibri 10pt, shaded headers                            │
│                                                                              │
│ Decision Trace: DOCUMENT_RENDERED                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.8 Orchestrator Step 8: Export Bundle

**Purpose**: Package all artifacts into an audit bundle.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 8: EXPORT BUNDLE                                                       │
│ Actor: bundleExporter                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Bundle Contents:                                                             │
│                                                                              │
│ audit-bundle-PSUR-DEV001-xxx.zip                                            │
│ ├── psur_PSUR-DEV001-xxx.docx          # Final PSUR document               │
│ ├── psur_PSUR-DEV001-xxx.md            # Markdown version                  │
│ ├── qualification_report.json          # Step 1 output                     │
│ ├── evidence_summary.json              # All evidence atoms metadata       │
│ ├── slot_proposals.json                # All proposals with status         │
│ ├── adjudication_report.json           # Acceptance/rejection details      │
│ ├── coverage_report.json               # Obligation coverage               │
│ ├── compliance_checklist.json          # Full checklist with status        │
│ ├── trace.jsonl                        # Full decision trace (JSONL)       │
│ ├── trace_summary.json                 # Trace statistics                  │
│ └── manifest.json                      # Bundle metadata                   │
│     {                                                                        │
│       bundleId: "bundle-xxx",                                               │
│       psurCaseId: 42,                                                       │
│       psurReference: "PSUR-DEV001-xxx",                                     │
│       templateId: "MDCG_2022_21_ANNEX_I",                                   │
│       createdAt: "2026-01-13T...",                                          │
│       fileCount: 11,                                                        │
│       sha256: "abc123..."                                                   │
│     }                                                                        │
│                                                                              │
│ Store:                                                                       │
│   - Files written to file system or cloud storage                           │
│   - Reference stored in psur_cases.bundle_reference                         │
│                                                                              │
│ Decision Traces:                                                             │
│   - BUNDLE_EXPORTED (with file list)                                        │
│   - WORKFLOW_COMPLETED                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. GRKB Integration

### 9.1 GRKB Data Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PSUR-GRKB ENHANCED RELATIONAL MODEL                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐        │
│ │ psur_evidence_  │     │ grkb_obligations│     │ psur_sections   │        │
│ │ types           │     │                 │     │                 │        │
│ ├─────────────────┤     ├─────────────────┤     ├─────────────────┤        │
│ │ evidence_type_id│     │ obligation_id   │     │ section_id      │        │
│ │ display_name    │     │ jurisdiction    │     │ template_id     │        │
│ │ category        │     │ artifact_type   │     │ parent_section  │        │
│ │ required_fields │     │ title           │     │ section_type    │        │
│ │ field_defs      │     │ text            │     │ required_evid   │        │
│ │ validation_rules│     │ source_citation │     │ render_as       │        │
│ └────────┬────────┘     │ required_evid   │     └────────┬────────┘        │
│          │              │ mandatory       │              │                  │
│          │              └────────┬────────┘              │                  │
│          │                       │                       │                  │
│          │              ┌────────┴────────┐              │                  │
│          │              │ psur_obligation │              │                  │
│          │              │ _dependencies   │              │                  │
│          │              ├─────────────────┤              │                  │
│          │              │ from_obligation │              │                  │
│          │              │ to_obligation   │              │                  │
│          │              │ relation_type   │              │                  │
│          │              └─────────────────┘              │                  │
│          │                       │                       │                  │
│          └───────────────────────┼───────────────────────┘                  │
│                                  │                                          │
│                         ┌────────┴────────┐                                 │
│                         │ psur_slot_      │                                 │
│                         │ obligations     │                                 │
│                         ├─────────────────┤                                 │
│                         │ template_id     │                                 │
│                         │ slot_id         │                                 │
│                         │ obligation_id   │                                 │
│                         │ coverage_%      │                                 │
│                         │ min_atoms       │                                 │
│                         └─────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Evidence Type Registry

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ EVIDENCE TYPE: complaint_record                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ {                                                                           │
│   evidenceTypeId: "complaint_record",                                       │
│   displayName: "Complaint Record",                                          │
│   category: "safety",                                                       │
│   requiredFields: ["complaint_id", "received_date", "description"],         │
│   optionalFields: ["severity", "outcome", "region", "patient_outcome"],     │
│   fieldDefinitions: {                                                       │
│     complaint_id: { type: "string", description: "Unique identifier" },     │
│     received_date: { type: "date", format: "ISO8601" },                     │
│     severity: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", ...] } │
│   },                                                                        │
│   validationRules: [                                                        │
│     { rule: "received_date <= today", severity: "error" },                  │
│     { rule: "description.length >= 10", severity: "warning" }               │
│   ],                                                                        │
│   expectedSourceTypes: ["excel", "csv", "json"],                            │
│   supportsClassification: true,                                             │
│   typicalPsurSections: ["complaints", "safety_summary", "trend_analysis"]   │
│ }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Obligation Dependency Graph

```
                          EU_MDR.ART86.1 (Core PSUR)
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
     EU_MDR.ART86.1.a     EU_MDR.ART86.1.b     EU_MDR.ART86.1.c
     (Benefit-Risk)       (PMCF Findings)       (Sales Volume)
              │
    ┌─────────┴─────────┬────────────────┐
    │                   │                │
    ▼                   ▼                ▼
EU_MDR.ART86.     EU_MDR.ART86.    EU_MDR.ART86.
SI.SUMMARY        COMPLAINTS       PMCF.FINDINGS
(Serious          (Complaints)     (PMCF)
Incidents)
```

### 9.4 Slot-Obligation Mapping Example

```
Template: MDCG_2022_21_ANNEX_I

SLOT                    OBLIGATIONS                              COVERAGE
─────────────────────────────────────────────────────────────────────────
MDCG.ANNEXI.C     →   EU_MDR.ART86.1.c                          100%
MDCG.ANNEXI.D     →   EU_MDR.ART86.SI.SUMMARY                   100%
MDCG.ANNEXI.F     →   EU_MDR.ART86.COMPLAINTS.SUMMARY           100%
MDCG.ANNEXI.H     →   EU_MDR.ART86.FSCA.SUMMARY                  50%
                  →   EU_MDR.ART86.FSCA.EFFECTIVENESS             50%
MDCG.ANNEXI.L     →   EU_MDR.ART86.PMCF.ACTIVITIES               50%
                  →   EU_MDR.ART86.PMCF.FINDINGS                  50%
                  →   EU_MDR.ART86.1.b                           100%
```

---

## 10. AI Agent Infrastructure

### 10.1 Agent Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AGENT ORCHESTRATOR                                    │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ AgentOrchestrator                                                       ││
│ │ ├── LLM Service (OpenAI/Anthropic with fallback)                        ││
│ │ ├── Agent Registry                                                      ││
│ │ ├── Configuration Manager                                               ││
│ │ └── Decision Trace Integration                                          ││
│ └─────────────────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INGESTION AGENTS                          RUNTIME AGENTS                   │
│  ┌─────────────────────┐                   ┌─────────────────────┐         │
│  │ Format Detection    │                   │ Narrative Writer    │         │
│  │ Agent               │                   │ Agent               │         │
│  ├─────────────────────┤                   ├─────────────────────┤         │
│  │ Domain Extraction   │                   │ Quality Auditor     │         │
│  │ Agent               │                   │ Agent               │         │
│  ├─────────────────────┤                   ├─────────────────────┤         │
│  │ Field Mapping       │                   │ Regulatory          │         │
│  │ Agent               │                   │ Compliance Agent    │         │
│  ├─────────────────────┤                   ├─────────────────────┤         │
│  │ Validation          │                   │ Trace Gap           │         │
│  │ Agent               │                   │ Resolution Agent    │         │
│  ├─────────────────────┤                   └─────────────────────┘         │
│  │ Severity            │                                                   │
│  │ Classification Agent│                                                   │
│  └─────────────────────┘                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 LLM Service

```typescript
// server/src/agents/llmService.ts

interface LLMServiceConfig {
  primaryProvider: "openai" | "anthropic";
  fallbackProvider: "openai" | "anthropic" | null;
  maxRetries: number;
  retryDelayMs: number;
  timeout: number;
}

interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  tokensUsed: number;
  latencyMs: number;
  cost?: number;
}

// Features:
// - Automatic fallback to secondary provider on failure
// - Retry logic with exponential backoff
// - Token counting and cost estimation
// - Pre-built prompt templates for regulatory tasks
// - Caching for identical prompts (optional)
```

### 10.3 Base Agent Class

```typescript
// server/src/agents/baseAgent.ts

abstract class BaseAgent<TInput, TOutput> {
  protected name: string;
  protected version: string;
  protected llmService: LLMService;
  protected traceContext?: TraceContext;

  // Lifecycle
  async execute(input: TInput): Promise<AgentResult<TOutput>> {
    // 1. Log AGENT_INVOKED trace event
    // 2. Validate input
    // 3. Call abstract process() method
    // 4. Log AGENT_COMPLETED or AGENT_FAILED trace event
    // 5. Return result with confidence score
  }

  protected abstract process(input: TInput): Promise<TOutput>;
  protected abstract getConfidenceScore(input: TInput, output: TOutput): number;
}

interface AgentResult<T> {
  success: boolean;
  output?: T;
  confidence: number;
  error?: string;
  metrics: {
    executionTimeMs: number;
    llmCalls: number;
    tokensUsed: number;
  };
}
```

### 10.4 Field Mapping Agent

```typescript
// server/src/agents/ingestion/fieldMappingAgent.ts

interface FieldMappingInput {
  sourceFields: string[];
  sampleData: Record<string, any>[];
  targetEvidenceType: string;
  targetSchema: EvidenceFieldSchema[];
}

interface FieldMapping {
  sourceField: string;
  targetField: string;
  confidence: number;
  mappingType: "EXACT" | "SEMANTIC" | "LLM_INFERRED";
}

class FieldMappingAgent extends BaseAgent<FieldMappingInput, FieldMapping[]> {
  protected async process(input: FieldMappingInput): Promise<FieldMapping[]> {
    const mappings: FieldMapping[] = [];

    for (const sourceField of input.sourceFields) {
      // Step 1: Exact match
      const exactMatch = input.targetSchema.find(
        t => t.name.toLowerCase() === sourceField.toLowerCase().replace(/\s+/g, "_")
      );
      if (exactMatch) {
        mappings.push({
          sourceField,
          targetField: exactMatch.name,
          confidence: 1.0,
          mappingType: "EXACT"
        });
        continue;
      }

      // Step 2: Semantic keyword match
      const semanticMatch = this.findSemanticMatch(sourceField, input.targetSchema);
      if (semanticMatch && semanticMatch.confidence > 0.7) {
        mappings.push({
          sourceField,
          targetField: semanticMatch.targetField,
          confidence: semanticMatch.confidence,
          mappingType: "SEMANTIC"
        });
        continue;
      }

      // Step 3: LLM inference (expensive, use sparingly)
      const llmMatch = await this.inferWithLLM(sourceField, input.targetSchema, input.sampleData);
      if (llmMatch) {
        mappings.push({
          ...llmMatch,
          mappingType: "LLM_INFERRED"
        });
      }
    }

    return mappings;
  }
}
```

### 10.5 Narrative Writer Agent

```typescript
// server/src/agents/runtime/narrativeWriterAgent.ts

interface NarrativeWriterInput {
  slotId: string;
  slotTitle: string;
  templateRequirements: {
    minWordCount?: number;
    requiredTopics?: string[];
    tone?: string;
  };
  evidenceAtoms: EvidenceAtom[];
  obligationText: string;
  previousSections?: { title: string; summary: string }[];
}

interface NarrativeWriterOutput {
  narrative: string;
  wordCount: number;
  citations: { atomId: string; inline: string }[];
  dataGaps: string[];
  suggestedFollowUps: string[];
}

class NarrativeWriterAgent extends BaseAgent<NarrativeWriterInput, NarrativeWriterOutput> {
  protected async process(input: NarrativeWriterInput): Promise<NarrativeWriterOutput> {
    // Build context from evidence
    const evidenceSummary = this.summarizeEvidence(input.evidenceAtoms);

    // Construct prompt
    const prompt = this.buildPrompt(input, evidenceSummary);

    // Call LLM
    const response = await this.llmService.complete({
      systemPrompt: REGULATORY_NARRATIVE_SYSTEM_PROMPT,
      prompt,
      temperature: 0.3, // Lower for consistency
      maxTokens: 2000
    });

    // Parse and validate response
    return this.parseNarrativeResponse(response, input.evidenceAtoms);
  }

  private buildPrompt(input: NarrativeWriterInput, evidenceSummary: string): string {
    return `
You are writing section "${input.slotTitle}" of a PSUR (Periodic Safety Update Report).

REGULATORY OBLIGATION:
${input.obligationText}

EVIDENCE SUMMARY:
${evidenceSummary}

REQUIREMENTS:
- Minimum ${input.templateRequirements.minWordCount || 100} words
- Must cite evidence atom IDs in format [ATOM:xxx]
- Professional regulatory tone
- Factual, data-driven conclusions

Write the narrative section:
    `.trim();
  }
}
```

### 10.6 Confidence-Based Routing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CONFIDENCE-BASED ROUTING                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Confidence Score │ Action                                                   │
│ ─────────────────────────────────────────────────────────────────────────  │
│ 0.95 - 1.00      │ AUTO-ACCEPT: Proceed without review                     │
│ 0.80 - 0.94      │ AUTO-ACCEPT WITH FLAG: Proceed, flag for QA review      │
│ 0.60 - 0.79      │ MANUAL REVIEW: Require human confirmation               │
│ 0.40 - 0.59      │ RETRY WITH DIFFERENT STRATEGY: Try alternative agent    │
│ 0.00 - 0.39      │ ESCALATE: Require expert intervention                   │
│                                                                              │
│ Example Flow:                                                                │
│                                                                              │
│ Field Mapping Agent                                                         │
│ ├── "Complaint ID" → "complaint_id"    confidence: 1.00  → AUTO-ACCEPT     │
│ ├── "Date Recv" → "received_date"      confidence: 0.85  → AUTO-ACCEPT+FLAG│
│ ├── "Problem Desc" → "description"     confidence: 0.72  → MANUAL REVIEW   │
│ └── "Risk Score" → ???                 confidence: 0.35  → ESCALATE        │
│                                                                              │
│ Each routing decision logged to Decision Trace                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.7 Agent Configuration

```typescript
// server/src/agents/config.ts

interface AgentConfig {
  global: {
    primaryLLM: "openai" | "anthropic";
    fallbackLLM: "openai" | "anthropic" | null;
    maxRetriesPerAgent: number;
    confidenceThreshold: {
      autoAccept: number;        // 0.95
      autoAcceptWithFlag: number; // 0.80
      manualReview: number;       // 0.60
      retry: number;              // 0.40
    };
    enableTracing: boolean;
  };
  agents: {
    fieldMapping: {
      enabled: boolean;
      useLLMFallback: boolean;
      maxLLMCallsPerBatch: number;
    };
    narrativeWriter: {
      enabled: boolean;
      model: string;
      temperature: number;
      maxTokens: number;
    };
    severityClassifier: {
      enabled: boolean;
      classificationThreshold: number;
    };
  };
}

// Presets
const PRESETS = {
  fast: { /* Minimal LLM usage, maximum deterministic */ },
  regulatory: { /* Maximum accuracy, full LLM */ },
  development: { /* Verbose logging, mock LLM */ },
  offline: { /* No LLM, deterministic only */ }
};
```

---

## 11. Decision Tracing System

### 11.1 Trace Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ DECISION TRACE SYSTEM                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │                      HASH-LINKED CHAIN                                   ││
│ │                                                                          ││
│ │  Entry 1          Entry 2          Entry 3          Entry 4             ││
│ │  ┌──────┐        ┌──────┐        ┌──────┐        ┌──────┐              ││
│ │  │Hash:A│───────▶│Hash:B│───────▶│Hash:C│───────▶│Hash:D│              ││
│ │  │Prev:─│        │Prev:A│        │Prev:B│        │Prev:C│              ││
│ │  └──────┘        └──────┘        └──────┘        └──────┘              ││
│ │                                                                          ││
│ │  Each entry's hash = SHA256(content + previous_hash)                    ││
│ │  Any tampering breaks the chain                                         ││
│ └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │                      TRACE ENTRY STRUCTURE                               ││
│ │                                                                          ││
│ │  {                                                                       ││
│ │    id: 12345,                                                           ││
│ │    traceId: "uuid-...",           // Groups entries by workflow run     ││
│ │    psurCaseId: 42,                                                       ││
│ │    sequenceNum: 15,               // Order within trace                 ││
│ │    eventType: "SLOT_ACCEPTED",    // What happened                      ││
│ │    eventTimestamp: "2026-01-13T...",                                     ││
│ │    actor: "adjudicator",          // Who/what made decision             ││
│ │    entityType: "slot",            // What entity was affected           ││
│ │    entityId: "MDCG.ANNEXI.F",     // Entity identifier                  ││
│ │    decision: "ACCEPTED",          // Decision made                      ││
│ │    inputData: { ... },            // Inputs to decision                 ││
│ │    outputData: { ... },           // Outputs/results                    ││
│ │    reasons: ["127 evidence atoms", "All rules passed"],                 ││
│ │    relatedEntityIds: ["atom-001", "atom-002", ...],                     ││
│ │    workflowStep: 5,               // Orchestrator step                  ││
│ │    contentHash: "sha256:abc...",  // This entry's hash                  ││
│ │    previousHash: "sha256:xyz..."  // Previous entry's hash              ││
│ │  }                                                                       ││
│ └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Event Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TRACE EVENT TYPES                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ WORKFLOW LIFECYCLE                                                          │
│ ├── WORKFLOW_STARTED           # Workflow begins                           │
│ ├── WORKFLOW_COMPLETED         # Workflow success                          │
│ └── WORKFLOW_FAILED            # Workflow error                            │
│                                                                              │
│ TEMPLATE & GRKB                                                             │
│ ├── TEMPLATE_QUALIFIED         # Template passed validation                │
│ ├── TEMPLATE_BLOCKED           # Template failed validation                │
│ ├── OBLIGATION_DEPENDENCY_EVALUATED  # Dependency graph checked            │
│ └── TEMPLATE_COVERAGE_CHECKED  # Slot-obligation coverage verified         │
│                                                                              │
│ CASE MANAGEMENT                                                             │
│ ├── CASE_CREATED               # New PSUR case                             │
│ └── CASE_UPDATED               # Case status changed                       │
│                                                                              │
│ EVIDENCE                                                                    │
│ ├── EVIDENCE_UPLOADED          # File uploaded                             │
│ ├── EVIDENCE_ATOM_CREATED      # Atom extracted                            │
│ ├── EVIDENCE_VALIDATED         # Atom validated against schema             │
│ ├── EVIDENCE_CLASSIFIED        # Severity/type classified                  │
│ └── NEGATIVE_EVIDENCE_CREATED  # "None reported" atom                      │
│                                                                              │
│ SLOT PROCESSING                                                             │
│ ├── SLOT_PROPOSED              # Proposal generated                        │
│ ├── SLOT_ACCEPTED              # Proposal accepted                         │
│ ├── SLOT_REJECTED              # Proposal rejected                         │
│ └── TRACE_GAP_DETECTED         # Missing evidence flagged                  │
│                                                                              │
│ OBLIGATIONS                                                                 │
│ ├── OBLIGATION_SATISFIED       # Obligation met                            │
│ ├── OBLIGATION_UNSATISFIED     # Obligation not met                        │
│ └── COVERAGE_COMPUTED          # Coverage report generated                 │
│                                                                              │
│ AGENTS                                                                      │
│ ├── AGENT_INVOKED              # Agent called                              │
│ ├── AGENT_COMPLETED            # Agent succeeded                           │
│ ├── AGENT_FAILED               # Agent error                               │
│ ├── MAPPING_SUGGESTED          # Field mapping proposed                    │
│ ├── NARRATIVE_GENERATED        # Narrative content created                 │
│ └── CONFIDENCE_ROUTED          # Decision routed by confidence             │
│                                                                              │
│ OUTPUT                                                                      │
│ ├── DOCUMENT_RENDERED          # PSUR document generated                   │
│ └── BUNDLE_EXPORTED            # Audit bundle created                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.3 Trace Query Examples

```sql
-- Get all decisions for a specific slot
SELECT * FROM decision_trace_entries
WHERE psur_case_id = 42
  AND entity_type = 'slot'
  AND entity_id = 'MDCG.ANNEXI.F'
ORDER BY sequence_num;

-- Get workflow timeline
SELECT event_type, event_timestamp, decision, actor
FROM decision_trace_entries
WHERE trace_id = 'uuid-...'
ORDER BY sequence_num;

-- Find all rejected slots with reasons
SELECT entity_id, reasons, input_data
FROM decision_trace_entries
WHERE psur_case_id = 42
  AND event_type = 'SLOT_REJECTED';

-- Verify chain integrity
SELECT 
  id,
  content_hash,
  previous_hash,
  LAG(content_hash) OVER (ORDER BY sequence_num) as expected_prev
FROM decision_trace_entries
WHERE trace_id = 'uuid-...'
ORDER BY sequence_num;
-- Check: previous_hash should equal expected_prev for all rows
```

### 11.4 Trace Summary

```json
{
  "psurCaseId": 42,
  "traceId": "uuid-...",
  "firstEntryHash": "sha256:abc...",
  "lastEntryHash": "sha256:xyz...",
  "chainValid": true,
  "totalEntries": 247,
  "acceptedSlots": 20,
  "rejectedSlots": 2,
  "traceGaps": 2,
  "evidenceAtoms": 156,
  "obligationsSatisfied": 24,
  "obligationsUnsatisfied": 2,
  "workflowStatus": "COMPLETED",
  "completedSteps": 8,
  "failedStep": null,
  "failureReason": null,
  "lastUpdatedAt": "2026-01-13T12:34:56Z"
}
```

---

## 12. Final Outputs

### 12.1 PSUR Document (DOCX)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PERIODIC SAFETY UPDATE REPORT                                               │
│                                                                              │
│ COVER PAGE                                                                  │
│ ├── Company Logo                                                            │
│ ├── Document Title                                                          │
│ ├── Device: CardioMonitor Pro                                              │
│ ├── UDI-DI: 123456789                                                      │
│ ├── Period: 2025-01-01 to 2025-12-31                                       │
│ └── Version: 1.0 | Date: 2026-01-13                                        │
│                                                                              │
│ TABLE OF CONTENTS                                                           │
│ ├── A. Device Description ........................... 3                     │
│ ├── B. PMS Activities ............................... 5                     │
│ ├── C. Sales and Exposure ........................... 7                     │
│ └── ... (auto-generated)                                                    │
│                                                                              │
│ SECTION A: DEVICE DESCRIPTION                                               │
│ ├── Arial 12pt Bold Title                                                  │
│ ├── Arial 10pt Body Text                                                   │
│ └── Evidence Citations: [ATOM:device-001]                                  │
│                                                                              │
│ SECTION C: SALES VOLUME                                                     │
│ ├── Calibri 10pt Table                                                     │
│ ├── Bold Headers with Shading                                              │
│ │   ┌──────────┬──────────┬──────────┐                                    │
│ │   │ Region   │ Period   │ Units    │                                    │
│ │   ├──────────┼──────────┼──────────┤                                    │
│ │   │ EU       │ Q1 2025  │ 15,234   │                                    │
│ │   │ EU       │ Q2 2025  │ 16,891   │                                    │
│ │   └──────────┴──────────┴──────────┘                                    │
│ └── Data Source: Evidence Atoms [sales-001, sales-002, ...]               │
│                                                                              │
│ SECTION F: COMPLAINTS                                                       │
│ ├── Summary Table (127 complaints)                                         │
│ ├── Trend Analysis Graph                                                   │
│ └── Narrative Analysis (agent-generated)                                   │
│                                                                              │
│ APPENDIX A: EVIDENCE SOURCES                                                │
│ └── Full list of evidence atoms with metadata                              │
│                                                                              │
│ APPENDIX B: SLOT-EVIDENCE MAPPING                                           │
│ └── Traceability matrix                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Audit Bundle Contents

```
audit-bundle-PSUR-DEV001-1736789123456.zip
│
├── psur_PSUR-DEV001-xxx.docx         [1.2 MB]  Final PSUR document
├── psur_PSUR-DEV001-xxx.md           [450 KB]  Markdown version
│
├── qualification_report.json         [12 KB]   Template qualification
│   {
│     "status": "QUALIFIED",
│     "slotCount": 22,
│     "obligationCoverage": "95%",
│     ...
│   }
│
├── evidence_summary.json             [156 KB]  All evidence atoms
│   {
│     "totalAtoms": 156,
│     "byType": { "complaint_record": 127, ... },
│     "atoms": [ { "atomId": "...", "type": "...", "data": {...} }, ... ]
│   }
│
├── slot_proposals.json               [89 KB]   All slot proposals
│   {
│     "proposals": [
│       { "slotId": "MDCG.ANNEXI.F", "status": "ACCEPTED", "evidenceAtomIds": [...] },
│       ...
│     ]
│   }
│
├── adjudication_report.json          [23 KB]   Acceptance/rejection details
│   {
│     "accepted": 20,
│     "rejected": 2,
│     "rejectionDetails": [...]
│   }
│
├── coverage_report.json              [18 KB]   Obligation coverage
│   {
│     "total": 26,
│     "satisfied": 24,
│     "coverage": "92.3%",
│     "unsatisfiedObligations": [...]
│   }
│
├── compliance_checklist.json         [45 KB]   Full compliance status
│
├── trace.jsonl                       [890 KB]  Full decision trace
│   {"sequenceNum":1,"eventType":"WORKFLOW_STARTED",...}
│   {"sequenceNum":2,"eventType":"TEMPLATE_QUALIFIED",...}
│   ...
│   {"sequenceNum":247,"eventType":"WORKFLOW_COMPLETED",...}
│
├── trace_summary.json                [2 KB]    Trace statistics
│   {
│     "totalEntries": 247,
│     "chainValid": true,
│     "acceptedSlots": 20,
│     ...
│   }
│
└── manifest.json                     [1 KB]    Bundle metadata
    {
      "bundleId": "bundle-xxx",
      "psurReference": "PSUR-DEV001-...",
      "createdAt": "2026-01-13T12:34:56Z",
      "sha256": "abc123..."
    }
```

### 12.3 Decision Trace Export (JSONL)

```jsonl
{"traceId":"a1b2c3d4","sequenceNum":1,"eventType":"WORKFLOW_STARTED","actor":"workflowRunner","inputData":{"templateId":"MDCG_2022_21_ANNEX_I","jurisdictions":["EU_MDR","UK_MDR"]},"contentHash":"sha256:aaa","previousHash":null}
{"traceId":"a1b2c3d4","sequenceNum":2,"eventType":"TEMPLATE_QUALIFIED","actor":"qualifyTemplate","entityType":"template","entityId":"MDCG_2022_21_ANNEX_I","decision":"QUALIFIED","outputData":{"slotCount":22,"coverage":"95%"},"contentHash":"sha256:bbb","previousHash":"sha256:aaa"}
{"traceId":"a1b2c3d4","sequenceNum":3,"eventType":"CASE_CREATED","actor":"createCase","entityType":"psur_case","entityId":"42","outputData":{"psurReference":"PSUR-DEV001-xxx"},"contentHash":"sha256:ccc","previousHash":"sha256:bbb"}
...
{"traceId":"a1b2c3d4","sequenceNum":247,"eventType":"WORKFLOW_COMPLETED","actor":"workflowRunner","decision":"SUCCESS","outputData":{"bundleRef":"bundle-xxx","totalTime":"45.2s"},"contentHash":"sha256:zzz","previousHash":"sha256:yyy"}
```

---

## 13. Database Schema Summary

### 13.1 Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `psur_cases` | PSUR case records | id, psur_reference, template_id, status |
| `evidence_uploads` | Uploaded files | id, filename, evidence_type, psur_case_id |
| `evidence_atoms` | Extracted evidence | atom_id, psur_case_id, evidence_type, normalized_data |
| `slot_proposals` | Generated proposals | slot_id, psur_case_id, status, evidence_atom_ids |
| `devices` | Device registry | id, device_code, device_name, udi_di |
| `companies` | Company records | id, name, logo_url |

### 13.2 GRKB Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `grkb_obligations` | Regulatory obligations | obligation_id, jurisdiction, text, required_evidence |
| `psur_evidence_types` | Evidence type registry | evidence_type_id, field_definitions, validation_rules |
| `psur_sections` | Template section definitions | section_id, template_id, section_type, render_as |
| `psur_obligation_dependencies` | Obligation relationships | from_id, to_id, relation_type |
| `psur_slot_obligations` | Slot-obligation mappings | template_id, slot_id, obligation_id, coverage_% |
| `psur_compliance_checklist` | Compliance tracking | psur_case_id, obligation_id, status |

### 13.3 Tracing Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `decision_trace_entries` | Individual trace events | trace_id, event_type, content_hash, previous_hash |
| `decision_trace_summaries` | Aggregated trace stats | psur_case_id, chain_valid, total_entries |

---

## 14. API Reference

### 14.1 Key Endpoints

```
PSUR CASES
  POST   /api/psur-cases                    Create new case
  GET    /api/psur-cases/:id                Get case details
  GET    /api/psur-cases/:id/evidence       Get evidence atoms

ORCHESTRATOR
  POST   /api/orchestrator/run              Run workflow
  GET    /api/orchestrator/status           Get workflow status

PSUR-GRKB
  GET    /api/psur-grkb/statistics          GRKB summary stats
  GET    /api/psur-grkb/evidence-types      List evidence types
  GET    /api/psur-grkb/obligations         List obligations
  GET    /api/psur-grkb/coverage/:template  Check template coverage
  POST   /api/psur-grkb/compliance/:id/init Initialize checklist

DECISION TRACE
  GET    /api/psur-cases/:id/trace/summary  Trace summary
  GET    /api/psur-cases/:id/trace/entries  Query trace entries
  GET    /api/psur-cases/:id/trace/verify   Verify chain integrity
  GET    /api/psur-cases/:id/trace/export   Export trace

AGENTS
  GET    /api/agents/health                 Agent system status
  POST   /api/agents/ingest                 AI document ingestion
  POST   /api/agents/suggest-mappings       Get mapping suggestions

DOWNLOADS
  GET    /api/audit-bundles/:id/download    Download audit bundle
  GET    /api/psur-cases/:id/docx           Download DOCX only
```

---

## Conclusion

The RegulatoryOS PSUR Engine represents a comprehensive, auditable system for generating EU MDR/UK MDR compliant PSURs. Key differentiators:

1. **Template-Driven**: Fully configurable via JSON templates
2. **AI-Augmented**: Intelligent document ingestion and narrative generation
3. **Fully Traceable**: Hash-verified decision chain for regulatory audits
4. **GRKB-Backed**: Formal regulatory knowledge base with obligation dependencies
5. **Compliance-First**: Built around obligation coverage and evidence traceability

The system transforms PSUR generation from a manual document-writing task into an automated, verifiable, and auditable process.
