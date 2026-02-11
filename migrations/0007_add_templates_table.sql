-- Add templates table for persistent storage
CREATE TABLE IF NOT EXISTS "templates" (
  "id" SERIAL PRIMARY KEY,
  "template_id" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "jurisdictions" JSONB NOT NULL,
  "template_type" TEXT NOT NULL,
  "template_json" JSONB NOT NULL,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "templates_template_id_idx" ON "templates" ("template_id");

-- Add comment for documentation
COMMENT ON TABLE "templates" IS 'Stores complete template JSON for deployment persistence';
COMMENT ON COLUMN "templates"."template_type" IS 'Either slot-based or form-based';
COMMENT ON COLUMN "templates"."template_json" IS 'Full template structure stored as JSONB';
