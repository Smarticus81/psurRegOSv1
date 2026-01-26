-- Migration: Add compliance_audit column to templates table
-- This stores Annex I compliance audit results for templates

ALTER TABLE templates 
ADD COLUMN IF NOT EXISTS compliance_audit JSONB;

COMMENT ON COLUMN templates.compliance_audit IS 'MDCG 2022-21 Annex I compliance audit result with warnings and recommendations';
