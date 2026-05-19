CREATE TABLE IF NOT EXISTS "merge_locks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id"),
  "holder_run_id" uuid NOT NULL REFERENCES "heartbeat_runs"("id") ON DELETE CASCADE,
  "holder_agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "issue_id" uuid REFERENCES "issues"("id") ON DELETE SET NULL,
  "pr_number" integer,
  "acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "released_at" timestamp with time zone,
  "release_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- The core invariant: at most one active (unreleased) merge slot per company.
CREATE UNIQUE INDEX IF NOT EXISTS "merge_locks_active_company_uq"
  ON "merge_locks" ("company_id")
  WHERE "released_at" IS NULL;

CREATE INDEX IF NOT EXISTS "merge_locks_company_acquired_idx"
  ON "merge_locks" ("company_id", "acquired_at");
