-- Migration: Create content_traces table for ultra-granular PSUR content tracing
-- Traces every content element with decision rationale and evidence linkage

CREATE TABLE IF NOT EXISTS content_traces (
  id SERIAL PRIMARY KEY,
  
  -- Linking
  psur_case_id INTEGER NOT NULL REFERENCES psur_cases(id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL,
  slot_title TEXT,
  
  -- Content Identification
  content_type TEXT NOT NULL, -- "sentence", "paragraph", "table_row", "table_cell", "calculation", "entry", "chart_point", "conclusion", "list_item", "heading"
  content_id TEXT NOT NULL,
  content_index INTEGER NOT NULL,
  content_preview TEXT NOT NULL,
  
  -- Decision Rationale
  rationale TEXT NOT NULL,
  methodology TEXT NOT NULL,
  standard_reference TEXT,
  
  -- Evidence & Sources
  evidence_type TEXT,
  atom_ids TEXT[] DEFAULT ARRAY[]::text[],
  source_document TEXT,
  data_source_id INTEGER REFERENCES data_sources(id) ON DELETE SET NULL,
  
  -- Regulatory Linkage
  obligation_id TEXT,
  obligation_title TEXT,
  jurisdictions TEXT[] DEFAULT ARRAY[]::text[],
  
  -- Calculation Details (if applicable)
  calculation_type TEXT,
  calculation_formula TEXT,
  calculation_inputs JSONB,
  
  -- Agent Information
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  
  -- Timestamp and Chain
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  content_hash TEXT NOT NULL,
  
  -- Queryability Enhancement
  searchable_text TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS content_trace_psur_case_id_idx ON content_traces(psur_case_id);
CREATE INDEX IF NOT EXISTS content_trace_slot_id_idx ON content_traces(slot_id);
CREATE INDEX IF NOT EXISTS content_trace_content_type_idx ON content_traces(content_type);
CREATE INDEX IF NOT EXISTS content_trace_obligation_id_idx ON content_traces(obligation_id);
CREATE INDEX IF NOT EXISTS content_trace_agent_id_idx ON content_traces(agent_id);
CREATE INDEX IF NOT EXISTS content_trace_searchable_idx ON content_traces(searchable_text);
CREATE INDEX IF NOT EXISTS content_trace_created_at_idx ON content_traces(created_at);

-- Add comment for documentation
COMMENT ON TABLE content_traces IS 'Ultra-granular PSUR content tracing - tracks every sentence, paragraph, table cell, and calculation with full decision rationale and evidence linkage';
