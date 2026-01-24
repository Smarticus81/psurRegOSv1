# Decision Traceability Architecture
## SOTA Provenance Tracking for PSUR Generation

### Executive Summary
This document outlines the architecture for granular traceability in PSUR generation, enabling users to trace any sentence, calculation, or claim back through its complete lineage to source evidence, regulatory obligations, and the GRKB.

---

## 1. Data Model Enhancement

### 1.1 Sentence-Level Attribution Schema

```sql
-- New table for sentence-level provenance
CREATE TABLE sentence_attributions (
  id SERIAL PRIMARY KEY,
  psur_case_id INTEGER REFERENCES psur_cases(id),
  slot_id TEXT NOT NULL,
  
  -- The actual content
  sentence_text TEXT NOT NULL,
  sentence_index INTEGER NOT NULL,  -- Position in paragraph
  paragraph_index INTEGER NOT NULL, -- Position in slot
  
  -- Attribution chain
  evidence_atom_ids INTEGER[] NOT NULL,
  obligation_ids TEXT[] NOT NULL,
  calculation_trace JSONB,  -- For computed values
  
  -- Generation metadata
  llm_reasoning TEXT,
  confidence_score DECIMAL(3,2),
  generation_model TEXT,
  generation_timestamp TIMESTAMP DEFAULT NOW(),
  
  -- Verification status
  verified_by TEXT,
  verified_at TIMESTAMP,
  verification_notes TEXT
);

-- Calculation trace structure
CREATE TABLE calculation_traces (
  id SERIAL PRIMARY KEY,
  sentence_attribution_id INTEGER REFERENCES sentence_attributions(id),
  
  -- What was calculated
  result_value TEXT NOT NULL,
  result_type TEXT NOT NULL,  -- 'count', 'sum', 'percentage', 'rate', etc.
  
  -- How it was calculated
  formula TEXT NOT NULL,
  
  -- Inputs (linked to evidence atoms)
  inputs JSONB NOT NULL,  -- [{atomId, field, value}, ...]
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 1.2 GRKB Validation Before Generation

```sql
-- Pre-generation validation results
CREATE TABLE grkb_validation_reports (
  id SERIAL PRIMARY KEY,
  psur_case_id INTEGER REFERENCES psur_cases(id),
  template_id TEXT NOT NULL,
  
  -- Validation status
  status TEXT NOT NULL,  -- 'PASS', 'FAIL', 'WARNING'
  blocking_issues JSONB,  -- Mandatory obligations without evidence
  warnings JSONB,         -- Optional obligations without evidence
  
  -- Coverage metrics
  mandatory_obligations_total INTEGER,
  mandatory_obligations_satisfied INTEGER,
  evidence_coverage_percent DECIMAL(5,2),
  
  -- What's missing
  missing_evidence_types TEXT[],
  unsatisfied_obligation_ids TEXT[],
  
  validated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 2. Graph Database Integration (Cosmos DB + Gremlin)

### 2.1 Graph Schema

```
Vertices:
  - Sentence (id, text, slotId, confidence)
  - EvidenceAtom (id, type, data, sourceDocument)
  - Obligation (id, text, jurisdiction, mandatory)
  - Regulation (id, name, article, version)
  - Calculation (id, formula, result)
  - Slot (id, title, sectionPath)
  - Document (id, filename, uploadDate)

Edges:
  - Sentence --[cites]--> EvidenceAtom
  - Sentence --[satisfies]--> Obligation
  - Sentence --[computed_from]--> Calculation
  - Sentence --[belongs_to]--> Slot
  - EvidenceAtom --[extracted_from]--> Document
  - Obligation --[defined_by]--> Regulation
  - Calculation --[uses]--> EvidenceAtom
```

### 2.2 Query Examples

```gremlin
// Trace a sentence back to all sources
g.V().hasLabel('Sentence').has('id', sentenceId)
  .as('sentence')
  .out('cites').as('evidence')
  .out('extracted_from').as('document')
  .select('sentence', 'evidence', 'document')

// Find all obligations satisfied by a slot
g.V().hasLabel('Slot').has('id', slotId)
  .in('belongs_to').hasLabel('Sentence')
  .out('satisfies').hasLabel('Obligation')
  .dedup()

// Get calculation breakdown
g.V().hasLabel('Sentence').has('id', sentenceId)
  .out('computed_from').as('calc')
  .out('uses').as('inputs')
  .select('calc', 'inputs')
```

---

## 3. Agent Enhancement for Trace Capture

### 3.1 Narrative Agent Modifications

Each narrative agent must:
1. Track which evidence atoms it uses for each sentence
2. Record the reasoning/method for content decisions
3. Link generated content to specific obligations
4. For calculations, record the full trace

```typescript
interface SentenceTrace {
  text: string;
  sentenceIndex: number;
  paragraphIndex: number;
  evidenceAtomIds: number[];
  obligationIds: string[];
  calculationTrace?: {
    formula: string;
    inputs: { atomId: number; field: string; value: any }[];
    result: any;
  };
  llmReasoning: string;
  confidence: number;
}
```

### 3.2 Pre-Generation Validation

Before any generation:
1. Load all mandatory obligations from GRKB for the selected jurisdictions
2. Check evidence atoms against required evidence types
3. Flag any gaps as blocking issues
4. Return validation report to UI

---

## 4. UI Design: Hierarchical Trace Explorer

### 4.1 Component Hierarchy

```
TraceExplorer
├── ValidationPanel (GRKB compliance check)
│   ├── ObligationsList (mandatory vs optional)
│   ├── EvidenceGaps (what's missing)
│   └── GenerationBlockers (critical issues)
│
├── SlotNavigator (left panel)
│   ├── SlotTree (hierarchical sections)
│   └── CoverageIndicators (per-slot status)
│
├── ContentPanel (center)
│   ├── GeneratedText (with inline attribution markers)
│   └── SentenceDetails (on hover/click)
│
└── ProvenancePanel (right panel)
    ├── EvidenceChain (atoms → documents)
    ├── ObligationLinks (GRKB ties)
    ├── CalculationBreakdown (if applicable)
    └── GraphVisualization (mini graph view)
```

### 4.2 Compact Display

- **Inline Markers**: Small icons next to sentences indicating evidence count, obligation count
- **Hover Preview**: Quick preview of sources on hover
- **Expand on Click**: Full provenance panel on click
- **Color Coding**: Green (verified), Yellow (auto-generated), Red (missing attribution)

---

## 5. Implementation Phases

### Phase 1: PostgreSQL Enhancement (Current Sprint)
- Add sentence_attributions table
- Add calculation_traces table
- Add grkb_validation_reports table
- Modify narrative agents to capture traces

### Phase 2: Pre-Generation Validation (Current Sprint)
- Add validation endpoint
- UI for showing GRKB compliance before generation
- Block generation if mandatory requirements unmet

### Phase 3: Graph DB Integration (Next Sprint)
- Set up Cosmos DB Gremlin API
- Create graph schema
- Implement dual-write from agents
- Add graph query endpoints

### Phase 4: UI Enhancement (Parallel)
- Build hierarchical trace explorer
- Implement inline attribution markers
- Add provenance panel
- Graph visualization component

---

## 6. Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Transactional DB | PostgreSQL | Cases, uploads, core data |
| Graph DB | Cosmos DB (Gremlin) | Provenance relationships |
| Backend | Express + TypeScript | API layer |
| Frontend | React + Tanstack Query | UI |
| Graph Viz | D3.js or vis.js | Relationship visualization |

---

## 7. Migration Strategy

1. **Backward Compatible**: New tables don't break existing functionality
2. **Progressive Enhancement**: Old cases show limited trace, new cases full trace
3. **Graph Sync Job**: Batch job to populate graph from PostgreSQL for history
