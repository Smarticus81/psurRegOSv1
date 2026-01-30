-- MDCG 2022-21 Section 10: External database search protocol
ALTER TABLE "dossier_clinical_evidence" ADD COLUMN IF NOT EXISTS "external_db_search_protocol" jsonb;
