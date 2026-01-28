# PSUR System Architecture - Final State

## Executive Summary

This document captures the reorganized system architecture after cleanup and consolidation.
The system is now nimble, PSUR-expert-facing with workflow-aligned navigation.

**Cleanup Summary:**
- Removed 6 unused files (46KB of dead code)
- Consolidated navigation from 9 items to 7 workflow-aligned groups
- Updated nomenclature to expert-facing PSUR terminology
- Added legacy route redirects for backward compatibility

---

## Final State Architecture

### Server-Side Modules

| Module Path | Purpose | Status |
|-------------|---------|--------|
| `server/src/agents/runtime/compileOrchestrator.ts` | Main PSUR compilation orchestrator | CORE |
| `server/src/agents/runtime/narratives/*` | Narrative generation agents (11 types) | CORE |
| `server/src/agents/runtime/tables/*` | Table generation agents (10 types) | CORE |
| `server/src/agents/runtime/charts/*` | Chart generation agents (6 types) | CORE |
| `server/src/parsers/sotaExtractor.ts` | SOTA evidence extraction | CORE |
| `server/src/parsers/sotaSchemaDiscovery.ts` | GPT-5.2 schema discovery | CORE |
| `server/src/parsers/sotaValidation.ts` | Multi-level validation | CORE |
| `server/src/parsers/sotaEvidenceRegistry.ts` | Canonical evidence types | CORE |
| `server/src/parsers/documentParser.ts` | File parsing (Excel, DOCX, PDF, CSV) | CORE |
| `server/src/parsers/evidenceExtractor.ts` | Evidence extraction orchestrator | CORE |
| `server/src/services/templatePipeline.ts` | Template processing | CORE |
| `server/src/services/hierarchicalMapping.ts` | MDCG mapping | CORE |
| `server/src/services/grkbService.ts` | GRKB service | CORE |
| `server/src/services/neo4jGrkbService.ts` | Neo4j GRKB integration | CORE |
| `server/src/services/compileTraceRepository.ts` | Execution tracing | EVOLVE → Provenance |
| `server/src/services/contentTraceService.ts` | Content tracing | EVOLVE → Provenance |
| `server/src/services/decisionTraceService.ts` | Decision tracing | EVOLVE → Provenance |
| `server/src/agents/agentOrchestrator.ts` | Legacy orchestrator | REVIEW |
| `server/src/orchestrator/workflowRunner.ts` | Workflow execution | CORE |
| `server/src/psur/*` | PSUR engines and mappings | CORE |
| `server/src/templates/*` | Template schema and linting | CORE |

### Client-Side Pages (Final State)

| New Route | Component | Purpose | Status |
|-----------|-----------|---------|--------|
| `/psur` | PsurWizard | Main PSUR generation workflow | **ACTIVE** |
| `/lineage` | ContentTraces | Evidence provenance & lineage | **ACTIVE** |
| `/templates` | TemplatePipeline | Template management | **ACTIVE** |
| `/prompts` | SystemInstructions | Agent configuration | **ACTIVE** |
| `/regulatory` | GrkbView | Regulatory knowledge reference | **ACTIVE** |
| `/guide` | Instructions | User documentation | **ACTIVE** |
| `/settings` | Admin | System configuration | **ACTIVE** |

### Files Removed (Cleanup)

| File | Reason | Size |
|------|--------|------|
| `agent-activity.tsx` | Execution tracing not needed for decision traceability | 26KB |
| `agent-system.tsx` | Content merged into User Guide | 15KB |
| `app-sidebar.tsx` | Replaced by App.tsx Navigation | 4KB |
| `template-management.tsx` | Consolidated into TemplatePipeline | 64KB |
| `field-mapping-tool.tsx` | Orphaned - never imported | 21KB |
| `ComplianceReport.tsx` | Orphaned - never imported | 12KB |

**Total Cleanup: ~142KB of dead code removed**

---

## Final Navigation Structure (Implemented)

```
┌─────────────────────────────────────────────────────────────────────┐
│  PSUR DraftEngine - EU MDR Compliant                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  WORKFLOW                    CONFIGURATION              SYSTEM      │
│  ┌──────────────────┐       ┌─────────────────┐       ┌──────────┐ │
│  │ Report Generation│       │ Templates       │       │User Guide│ │
│  │ Evidence Lineage │       │ Agent Config    │       │ Settings │ │
│  └──────────────────┘       │ Regulatory      │       └──────────┘ │
│                             └─────────────────┘                     │
│                                                                     │
│  [MDR Compliant] status indicator                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Route Mapping (with Legacy Redirects)

| New Route | Old Routes (Redirect) | Component |
|-----------|----------------------|-----------|
| `/psur` | - | PsurWizard |
| `/lineage` | `/content-traces` | ContentTraces |
| `/templates` | `/pipeline`, `/template-management` | TemplatePipeline |
| `/prompts` | `/system-instructions` | SystemInstructions |
| `/regulatory` | `/grkb`, `/grkb-mapping` | GrkbView |
| `/guide` | `/instructions` | Instructions |
| `/settings` | `/admin` | Admin |

---

## Nomenclature Updates (Expert-Facing)

### Navigation Labels

| Current | New (Expert-Facing) |
|---------|---------------------|
| "Wizard" | "Report Generation" |
| "Pipeline" | "Templates" |
| "Agents" | REMOVE |
| "Content" | "Evidence Lineage" |
| "Prompts" | "Agent Configuration" |
| "GRKB" | "Regulatory Knowledge" |
| "Mappings" | Merge into Regulatory |
| "Docs" | "User Guide" |
| "Admin" | "Settings" |

### Feature Names

| Current | New (PSUR Expert Term) |
|---------|------------------------|
| "Evidence Atoms" | "Evidence Records" |
| "Slots" | "Report Sections" |
| "Compile Trace" | "Generation Audit Trail" |
| "Content Trace" | "Evidence Lineage" |
| "LLM Call" | "AI Analysis" |

---

## Server Module Organization

### Core Modules (Keep)

```
server/src/
├── agents/
│   └── runtime/           # PSUR compilation agents
│       ├── narratives/    # Section narrative writers
│       ├── tables/        # Table generators
│       └── charts/        # Chart generators
├── parsers/               # Document & evidence extraction
│   ├── sota*.ts          # SOTA extraction pipeline
│   └── document*.ts      # File parsers
├── services/              # Business logic
│   ├── template*.ts      # Template services
│   ├── grkb*.ts          # Regulatory services
│   └── provenance*.ts    # NEW: Provenance system
├── orchestrator/          # Workflow execution
│   ├── workflowRunner.ts
│   └── steps/
└── psur/                  # PSUR-specific logic
    ├── engines/          # Section engines
    └── mappings/         # MDCG mappings
```

### New Modules to Create

1. `server/src/services/provenanceService.ts` - Provenance registry
2. `server/src/services/provenanceGraph.ts` - Query provenance chains
3. Client: Consolidated pages as per plan above

---

## Implementation Completed

### Phase 1: Cleanup (Done)
- [x] Removed `agent-activity.tsx` - Execution tracing not needed
- [x] Removed `agent-system.tsx` - Content can go in User Guide
- [x] Removed `app-sidebar.tsx` - Using App.tsx Navigation
- [x] Removed `template-management.tsx` - Consolidated into TemplatePipeline
- [x] Removed `field-mapping-tool.tsx` - Orphaned code
- [x] Removed `ComplianceReport.tsx` - Orphaned code

### Phase 2: Navigation Reorganization (Done)
- [x] Updated App.tsx with grouped navigation (Workflow/Configuration/System)
- [x] Applied expert-facing nomenclature
- [x] Added legacy route redirects for backward compatibility
- [x] Updated brand to "PSUR DraftEngine - EU MDR Compliant"

### Phase 3: Nomenclature Updates (Done)
- [x] "Wizard" → "Report Generation"
- [x] "Content" → "Evidence Lineage"  
- [x] "Pipeline" → "Templates"
- [x] "Prompts" → "Agent Config"
- [x] "GRKB" → "Regulatory"
- [x] "Docs" → "User Guide"
- [x] "Admin" → "Settings"

### Phase 4: Data Consistency & Provenance (Completed)
- [x] Built `CanonicalMetricsService` - Single source of truth for all statistics
- [x] Updated `ExecSummaryAgent` to use canonical metrics
- [x] Updated `SalesExposureTableAgent` with canonical validation
- [x] Updated `ComplaintsTableAgent` with canonical denominator
- [x] Built `CrossSectionValidator` - Validates consistency after compilation
- [x] Built `ProvenanceRegistry` - Statement-level decision traceability

### New Services Created

| Service | Purpose |
|---------|---------|
| `canonicalMetricsService.ts` | Centralized statistics with provenance |
| `crossSectionValidator.ts` | Post-compilation consistency validation |
| `provenanceRegistry.ts` | WHERE/WHEN/HOW/WHY/WHICH tracing |

### Phase 5: Next Steps (Future)
- [ ] Integrate provenance into Evidence Lineage UI
- [ ] Add provenance export for regulatory audits
- [ ] Build provenance visualization in UI

---

## API Route Inventory

170 routes in `server/routes.ts` - Key categories:

| Category | Example Routes | Notes |
|----------|---------------|-------|
| PSUR Cases | `/api/psur-cases/*` | KEEP |
| Templates | `/api/templates/*` | KEEP |
| Evidence | `/api/evidence/*` | KEEP |
| Ingestion | `/api/ingest/*` | KEEP |
| GRKB | `/api/grkb/*` | KEEP |
| Traces | `/api/trace/*` | EVOLVE → Provenance |
| System | `/api/health`, `/api/system-instructions/*` | KEEP |

---

## Summary

The PSUR DraftEngine system has been cleaned up and reorganized:

1. **Navigation**: Now workflow-aligned with 3 logical groups
2. **Nomenclature**: Expert-facing PSUR terminology throughout
3. **Code Quality**: 142KB of dead code removed
4. **Maintainability**: Cleaner component structure
5. **Backward Compatibility**: Legacy routes redirect to new paths

The system is now ready for:
- Provenance infrastructure implementation
- Data processing accuracy improvements
- Evidence lineage development

---

Generated: 2026-01-28
Updated after cleanup session
