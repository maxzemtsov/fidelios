import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Db } from "@fideliosai/db";
import { validate } from "../middleware/validate.js";
import { logActivity, mergeLockService } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const acquireMergeLockSchema = z
  .object({
    issueId: z.string().uuid().optional(),
    prNumber: z.number().int().positive().optional(),
  })
  .default({});

/**
 * Merge-lock routes — FideliOS-native merge coordination.
 *
 *   POST   /api/companies/:companyId/merge-lock   acquire / renew / poll the slot
 *   DELETE /api/companies/:companyId/merge-lock   release the slot
 *   GET    /api/companies/:companyId/merge-lock   current slot status
 *
 * The merge slot is an agent-run primitive: an engineer agent acquires it
 * before merging a PR so parallel agents never merge concurrently. Acquire is
 * non-blocking — a contended call returns `{ acquired: false }`, and the agent
 * polls. See HEARTBEAT.md "Git Workflow" for the agent-side procedure.
 */
export function mergeLockRoutes(db: Db) {
  const router = Router();
  const svc = mergeLockService(db);

  // Reject a malformed company id with 400 rather than letting a non-uuid
  // reach Postgres and surface as a 500.
  router.param("companyId", (_req, res, next, value) => {
    if (typeof value === "string" && UUID_RE.test(value)) {
      next();
      return;
    }
    res.status(400).json({ error: "Invalid company id" });
  });

  /**
   * Resolve the engineer agent + run holding (or acquiring) the slot. The
   * merge slot can only be held by an agent run; a board admin may read status
   * and force-release, but not hold one.
   */
  function requireHolder(req: Request, res: Response): { agentId: string; runId: string } | null {
    if (req.actor.type !== "agent" || !req.actor.agentId) {
      res.status(403).json({ error: "Merge lock can only be held by an engineer agent run" });
      return null;
    }
    const runId = req.actor.runId?.trim();
    if (!runId) {
      res.status(401).json({ error: "Agent run id required" });
      return null;
    }
    return { agentId: req.actor.agentId, runId };
  }

  function isBoardAdmin(req: Request): boolean {
    return (
      req.actor.type === "board" &&
      (req.actor.source === "local_implicit" || Boolean(req.actor.isInstanceAdmin))
    );
  }

  // Acquire (or renew / poll) the company merge slot.
  router.post(
    "/companies/:companyId/merge-lock",
    validate(acquireMergeLockSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const holder = requireHolder(req, res);
      if (!holder) return;

      const result = await svc.acquire({
        companyId,
        holderRunId: holder.runId,
        holderAgentId: holder.agentId,
        issueId: req.body.issueId ?? null,
        prNumber: req.body.prNumber ?? null,
      });

      // Log only a genuinely new acquisition — a poll loop that renews its own
      // slot must not spam the activity timeline.
      if (result.acquired && result.fresh) {
        const actor = getActorInfo(req);
        await logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "merge_lock.acquired",
          entityType: "merge_lock",
          entityId: result.lock.id,
          details: { issueId: result.lock.issueId, prNumber: result.lock.prNumber },
        });
      }
      res.json(result);
    },
  );

  // Release the company merge slot (the holder run, or a board-admin force-release).
  router.delete("/companies/:companyId/merge-lock", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const force = isBoardAdmin(req);
    let actorRunId: string | null = null;
    if (!force) {
      const holder = requireHolder(req, res);
      if (!holder) return;
      actorRunId = holder.runId;
    }

    const result = await svc.release({ companyId, actorRunId, force });
    if (result.released && result.lock) {
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: force ? "merge_lock.force_released" : "merge_lock.released",
        entityType: "merge_lock",
        entityId: result.lock.id,
      });
    }
    res.json(result);
  });

  // Current merge-slot status for a company (UI / debugging).
  router.get("/companies/:companyId/merge-lock", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.getStatus(companyId));
  });

  return router;
}
