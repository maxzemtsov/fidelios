import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@fideliosai/db";
import { heartbeatRuns, mergeLocks } from "@fideliosai/db";
import { conflict } from "../errors.js";

/**
 * FideliOS-native merge coordination — the per-company "merge slot".
 *
 * An engineer agent acquires its company's slot before merging a PR into the
 * trunk, so parallel agents never merge concurrently. This composes the same
 * primitive the issue checkout-lock uses: a conditional database write is the
 * entire concurrency mechanism. Here the conditional write is an
 * `INSERT ... ON CONFLICT DO NOTHING` guarded by a partial unique index
 * (`merge_locks_active_company_uq`) — at most one active row per company.
 */

/** Default lifetime of a merge slot — a rebase + CI re-check + merge fits comfortably inside this. */
export const DEFAULT_MERGE_LOCK_TTL_MS = 30 * 60 * 1000;

/** A heartbeat run in one of these states no longer holds anything — its slot is reclaimable. */
const TERMINAL_HEARTBEAT_RUN_STATUSES: readonly string[] = [
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
];

type MergeLockRow = typeof mergeLocks.$inferSelect;

export type AcquireMergeLockResult =
  | { acquired: true; fresh: boolean; lock: MergeLockRow }
  | { acquired: false; heldBy: MergeLockRow | null };

export type ReleaseMergeLockResult = { released: boolean; lock: MergeLockRow | null };

export function mergeLockService(db: Db) {
  /** The current active (unreleased) merge slot for a company, or null. */
  async function getActiveLock(companyId: string): Promise<MergeLockRow | null> {
    return db
      .select()
      .from(mergeLocks)
      .where(and(eq(mergeLocks.companyId, companyId), isNull(mergeLocks.releasedAt)))
      .then((rows) => rows[0] ?? null);
  }

  /** True when the holder run is gone or terminal — its slot is safe to reclaim. */
  async function isHolderRunTerminalOrMissing(runId: string): Promise<boolean> {
    const run = await db
      .select({ status: heartbeatRuns.status })
      .from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId))
      .then((rows) => rows[0] ?? null);
    if (!run) return true;
    return TERMINAL_HEARTBEAT_RUN_STATUSES.includes(run.status);
  }

  /** Mark a specific lock released — only if it is still active (race-safe conditional write). */
  async function releaseLockRow(lockId: string, reason: string, now: Date): Promise<MergeLockRow | null> {
    return db
      .update(mergeLocks)
      .set({ releasedAt: now, releaseReason: reason, updatedAt: now })
      .where(and(eq(mergeLocks.id, lockId), isNull(mergeLocks.releasedAt)))
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  function isStale(lock: MergeLockRow, now: Date, holderTerminal: boolean): boolean {
    return holderTerminal || lock.expiresAt.getTime() <= now.getTime();
  }

  return {
    /**
     * Acquire (or renew) the merge slot for a company. Non-blocking: returns
     * immediately with `acquired: true` (caller now holds the slot) or
     * `acquired: false` (a live run holds it — caller should wait and poll).
     *
     * Contention is the *expected* path of a poll loop, so it is reported as a
     * boolean rather than a 409 — this is a deliberate divergence from the
     * issue checkout-lock, which throws on contention.
     *
     * Idempotent for the same run (`fresh: false` on a renew). A stale slot —
     * expired, or held by a terminal/missing run — is reclaimed transparently.
     */
    async acquire(input: {
      companyId: string;
      holderRunId: string;
      holderAgentId: string;
      issueId?: string | null;
      prNumber?: number | null;
      ttlMs?: number;
    }): Promise<AcquireMergeLockResult> {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (input.ttlMs ?? DEFAULT_MERGE_LOCK_TTL_MS));

      // Up to 3 attempts: a clean insert, or reclaim-a-stale-slot then retry.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const inserted = await db
          .insert(mergeLocks)
          .values({
            companyId: input.companyId,
            holderRunId: input.holderRunId,
            holderAgentId: input.holderAgentId,
            issueId: input.issueId ?? null,
            prNumber: input.prNumber ?? null,
            acquiredAt: now,
            expiresAt,
            updatedAt: now,
          })
          // The partial unique index rejects a second active row for the company.
          .onConflictDoNothing()
          .returning()
          .then((rows) => rows[0] ?? null);
        if (inserted) {
          return { acquired: true, fresh: true, lock: inserted };
        }

        // An active slot exists. Read it and decide.
        const active = await getActiveLock(input.companyId);
        if (!active) {
          // Released between our insert and this read — retry the insert.
          continue;
        }

        // Same run already holds it → idempotent success; extend the TTL.
        if (active.holderRunId === input.holderRunId) {
          const renewed = await db
            .update(mergeLocks)
            .set({
              expiresAt,
              issueId: input.issueId ?? active.issueId,
              prNumber: input.prNumber ?? active.prNumber,
              updatedAt: now,
            })
            .where(and(eq(mergeLocks.id, active.id), isNull(mergeLocks.releasedAt)))
            .returning()
            .then((rows) => rows[0] ?? null);
          return { acquired: true, fresh: false, lock: renewed ?? active };
        }

        // Held by another run. If that run is dead or the slot expired, reclaim and retry.
        const holderTerminal = await isHolderRunTerminalOrMissing(active.holderRunId);
        if (isStale(active, now, holderTerminal)) {
          await releaseLockRow(
            active.id,
            holderTerminal ? "reclaimed_dead_run" : "reclaimed_expired",
            now,
          );
          continue;
        }

        // A live run holds the slot — the caller must wait and poll.
        return { acquired: false, heldBy: active };
      }

      // Retries exhausted (heavy contention) — report as not-acquired so the caller polls again.
      return { acquired: false, heldBy: await getActiveLock(input.companyId) };
    },

    /**
     * Release the merge slot for a company. The holder run releases its own
     * slot; a board admin may `force` a release (ops escape hatch for a slot
     * whose holder is wedged). Idempotent — releasing when nothing is active
     * returns `released: false` rather than throwing.
     */
    async release(input: {
      companyId: string;
      actorRunId: string | null;
      force?: boolean;
    }): Promise<ReleaseMergeLockResult> {
      const now = new Date();
      const active = await getActiveLock(input.companyId);
      if (!active) {
        return { released: false, lock: null };
      }
      if (!input.force && active.holderRunId !== input.actorRunId) {
        throw conflict("Only the merge-lock holder run can release it", {
          companyId: input.companyId,
          heldBy: {
            holderRunId: active.holderRunId,
            holderAgentId: active.holderAgentId,
            acquiredAt: active.acquiredAt,
          },
        });
      }
      const released = await releaseLockRow(
        active.id,
        input.force ? "force_released" : "released",
        now,
      );
      return { released: Boolean(released), lock: released ?? active };
    },

    /** The current active merge slot for a company, or null (for UI / debugging). */
    async getStatus(companyId: string): Promise<{ lock: MergeLockRow | null }> {
      return { lock: await getActiveLock(companyId) };
    },

    /**
     * Sweep: release any active slot that has expired or whose holder run is
     * terminal/missing. Runs on the periodic scheduler tick. Active slots are
     * at most one per company, so this stays a tiny query regardless of how
     * much released history has accumulated.
     */
    async reapExpiredMergeLocks(now: Date = new Date()): Promise<{ reaped: number }> {
      const active = await db.select().from(mergeLocks).where(isNull(mergeLocks.releasedAt));
      let reaped = 0;
      for (const lock of active) {
        const holderTerminal = await isHolderRunTerminalOrMissing(lock.holderRunId);
        if (!isStale(lock, now, holderTerminal)) continue;
        const released = await releaseLockRow(
          lock.id,
          holderTerminal ? "reaped_dead_run" : "reaped_expired",
          now,
        );
        if (released) reaped += 1;
      }
      return { reaped };
    },
  };
}
