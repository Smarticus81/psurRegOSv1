-- Migration: Add SOTA grounding metadata columns to slot_obligation_links
-- Date: 2026-01-25

-- Add new columns for SOTA grounding metadata
ALTER TABLE slot_obligation_links
ADD COLUMN IF NOT EXISTS confidence integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS match_method text,
ADD COLUMN IF NOT EXISTS reasoning text,
ADD COLUMN IF NOT EXISTS is_manual_override boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS updated_by text,
ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT CURRENT_TIMESTAMP;

-- Add index for faster queries by template and match method
CREATE INDEX IF NOT EXISTS idx_slot_obligation_links_template_method 
ON slot_obligation_links(template_id, match_method);

-- Add index for confidence-based filtering
CREATE INDEX IF NOT EXISTS idx_slot_obligation_links_confidence
ON slot_obligation_links(confidence DESC);
