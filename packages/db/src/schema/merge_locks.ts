import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { issues } from "./issues.js";

/**
 * Per-company merge slot — the FideliOS-native equivalent of a GitHub merge
 * queue, without an Enterprise plan.
 *
 * An engineer agent acquires this slot before merging its PR into the trunk
 * so that parallel agents in the same company never merge into the integration
 * branch concurrently (which can land two PRs that were each CI-green against
 * an older trunk and break it together).
 *
 * Invariant: at most one *active* row (`released_at IS NULL`) per company —
 * enforced at the database level by the partial unique index below. The
 * service mirrors the `issues` checkout-lock pattern: a conditional write is
 * the entire concurrency primitive. Released rows are retained as an audit
 * trail of who merged when.
 */
export const mergeLocks = pgTable(
  "merge_locks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    /** The heartbeat run that holds the slot. A terminal run releases it (reaper / lazy steal). */
    holderRunId: uuid("holder_run_id")
      .notNull()
      .references(() => heartbeatRuns.id, { onDelete: "cascade" }),
    /** Denormalized for cheap status display ("Engineer X is merging") and a self-contained audit trail. */
    holderAgentId: uuid("holder_agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** Informational: which issue/PR is being merged under this slot. */
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    prNumber: integer("pr_number"),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
    /** TTL backstop — a stuck holder never blocks the company past this. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    /** released | reclaimed_dead_run | reclaimed_expired | reaped_dead_run | reaped_expired | force_released */
    releaseReason: text("release_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The core invariant: one live merge slot per company.
    activeCompanyIdx: uniqueIndex("merge_locks_active_company_uq")
      .on(table.companyId)
      .where(sql`${table.releasedAt} is null`),
    companyAcquiredIdx: index("merge_locks_company_acquired_idx").on(
      table.companyId,
      table.acquiredAt,
    ),
  }),
);
