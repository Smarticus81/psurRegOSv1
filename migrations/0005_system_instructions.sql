CREATE TABLE IF NOT EXISTS "system_instructions" (
  "key" text PRIMARY KEY NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "template" text NOT NULL,
  "default_template" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "variables" jsonb,
  "last_updated" timestamp DEFAULT now() NOT NULL,
  "updated_by" text
);

CREATE TABLE IF NOT EXISTS "instruction_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "instruction_key" text NOT NULL REFERENCES "system_instructions"("key") ON DELETE CASCADE,
  "template" text NOT NULL,
  "version" integer NOT NULL,
  "change_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "created_by" text
);
