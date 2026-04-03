CREATE TABLE IF NOT EXISTS "issue_relations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "type" text NOT NULL,
  "issue_id" uuid NOT NULL REFERENCES "issues"("id") ON DELETE CASCADE,
  "related_issue_id" uuid NOT NULL REFERENCES "issues"("id") ON DELETE CASCADE,
  "created_by_actor_type" text,
  "created_by_actor_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "issue_relations_issue_type_idx"
  ON "issue_relations" ("company_id", "issue_id", "type");

CREATE INDEX IF NOT EXISTS "issue_relations_related_type_idx"
  ON "issue_relations" ("company_id", "related_issue_id", "type");

CREATE UNIQUE INDEX IF NOT EXISTS "issue_relations_unique_idx"
  ON "issue_relations" ("issue_id", "related_issue_id", "type");
