import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agents, companies, createDb, heartbeatRuns, mergeLocks } from "@fideliosai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { mergeLockService } from "../services/merge-locks.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping merge-lock tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("mergeLockService", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof mergeLockService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("fidelios-merge-lock-");
    db = createDb(tempDb.connectionString);
    svc = mergeLockService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(mergeLocks);
    await db.delete(heartbeatRuns);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function createCompany(): Promise<string> {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "FideliOS",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return companyId;
  }

  async function createAgent(companyId: string): Promise<string> {
    const agentId = randomUUID();
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Engineer",
      role: "engineer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
    return agentId;
  }

  async function createRun(companyId: string, agentId: string, status = "running"): Promise<string> {
    const runId = randomUUID();
    await db.insert(heartbeatRuns).values({ id: runId, companyId, agentId, status });
    return runId;
  }

  /** A company with one engineer agent and two distinct heartbeat runs. */
  async function seed() {
    const companyId = await createCompany();
    const agentId = await createAgent(companyId);
    const runA = await createRun(companyId, agentId);
    const runB = await createRun(companyId, agentId);
    return { companyId, agentId, runA, runB };
  }

  it("grants the merge slot to the first run", async () => {
    const { companyId, agentId, runA } = await seed();
    const result = await svc.acquire({ companyId, holderRunId: runA, holderAgentId: agentId });
    expect(result.acquired).toBe(true);
    if (result.acquired) {
      expect(result.fresh).toBe(true);
      expect(result.lock.holderRunId).toBe(runA);
    }
  });

  it("denies a second live run while the slot is held", async () => {
    const { companyId, agentId, runA, runB } = await seed();
    await svc.acquire({ companyId, holderRunId: runA, holderAgentId: agentId });
    const second = await svc.acquire({ companyId, holderRunId: runB, holderAgentId: agentId });
    expect(second.acquired).toBe(false);
    if (!second.acquired) {
      expect(second.heldBy?.holderRunId).toBe(runA);
    }
  });

  it("is idempotent for the same run and extends the TTL", async () => {
    const { companyId, agentId, runA } = await seed();
    const first = await svc.acquire({
      companyId,
      holderRunId: runA,
      holderAgentId: agentId,
      ttlMs: 60_000,
    });
    const second = await svc.acquire({
      companyId,
      holderRunId: runA,
      holderAgentId: agentId,
      ttlMs: 600_000,
    });
    expect(first.acquired && second.acquired).toBe(true);
    if (first.acquired && second.acquired) {
      expect(second.fresh).toBe(false);
      expect(second.lock.id).toBe(first.lock.id);
      expect(second.lock.expiresAt.getTime()).toBeGreaterThan(first.lock.expiresAt.getTime());
    }
  });

  it("frees the slot on release so the next run can acquire", async () => {
    const { companyId, agentId, runA, runB } = await seed();
    await svc.acquire({ companyId, holderRunId: runA, holderAgentId: agentId });
    const released = await svc.release({ companyId, actorRunId: runA });
    expect(released.released).toBe(true);
    const next = await svc.acquire({ companyId, holderRunId: runB, holderAgentId: agentId });
    expect(next.acquired).toBe(true);
  });

  it("rejects a release by a run that does not hold the slot", async () => {
    const { companyId, agentId, runA, runB } = await seed();
    await svc.acquire({ companyId, holderRunId: runA, holderAgentId: agentId });
    await expect(svc.release({ companyId, actorRunId: runB })).rejects.toThrow(/holder run/i);
  });

  it("allows a forced release regardless of holder", async () => {
    const { companyId, agentId, runA, runB } = await seed();
    await svc.acquire({ companyId, holderRunId: runA, holderAgentId: agentId });
    const forced = await svc.release({ companyId, actorRunId: runB, force: true });
    expect(forced.released).toBe(true);
    const next = await svc.acquire({ companyId, holderRunId: runB, holderAgentId: agentId });
    expect(next.acquired).toBe(true);
  });

  it("reports released: false when nothing is held", async () => {
    const { companyId, runA } = await seed();
    const result = await svc.release({ companyId, actorRunId: runA });
    expect(result.released).toBe(false);
    expect(result.lock).toBeNull();
  });

  it("reclaims a slot held by a terminal run on contention", async () => {
    const { companyId, agentId, runA, runB } = await seed();
    await svc.acquire({ companyId, holderRunId: runA, holderAgentId: agentId });
    await db.update(heartbeatRuns).set({ status: "failed" }).where(eq(heartbeatRuns.id, runA));
    const result = await svc.acquire({ companyId, holderRunId: runB, holderAgentId: agentId });
    expect(result.acquired).toBe(true);
    if (result.acquired) expect(result.lock.holderRunId).toBe(runB);
    const reclaimed = await db
      .select()
      .from(mergeLocks)
      .where(eq(mergeLocks.holderRunId, runA))
      .then((rows) => rows[0]);
    expect(reclaimed?.releaseReason).toBe("reclaimed_dead_run");
  });

  it("reclaims an expired slot on contention", async () => {
    const { companyId, agentId, runA, runB } = await seed();
    // A negative TTL makes the slot born already expired.
    await svc.acquire({ companyId, holderRunId: runA, holderAgentId: agentId, ttlMs: -1_000 });
    const result = await svc.acquire({ companyId, holderRunId: runB, holderAgentId: agentId });
    expect(result.acquired).toBe(true);
    const reclaimed = await db
      .select()
      .from(mergeLocks)
      .where(eq(mergeLocks.holderRunId, runA))
      .then((rows) => rows[0]);
    expect(reclaimed?.releaseReason).toBe("reclaimed_expired");
  });

  it("reaper releases an expired slot", async () => {
    const { companyId, agentId, runA } = await seed();
    await svc.acquire({ companyId, holderRunId: runA, holderAgentId: agentId, ttlMs: 60_000 });
    // Sweep with a clock 10 minutes in the future.
    const result = await svc.reapExpiredMergeLocks(new Date(Date.now() + 10 * 60_000));
    expect(result.reaped).toBe(1);
    expect((await svc.getStatus(companyId)).lock).toBeNull();
  });

  it("reaper releases a slot whose holder run is terminal", async () => {
    const { companyId, agentId, runA } = await seed();
    await svc.acquire({ companyId, holderRunId: runA, holderAgentId: agentId });
    await db.update(heartbeatRuns).set({ status: "succeeded" }).where(eq(heartbeatRuns.id, runA));
    const result = await svc.reapExpiredMergeLocks();
    expect(result.reaped).toBe(1);
    const row = await db
      .select()
      .from(mergeLocks)
      .where(eq(mergeLocks.holderRunId, runA))
      .then((rows) => rows[0]);
    expect(row?.releaseReason).toBe("reaped_dead_run");
  });

  it("keeps merge slots independent per company", async () => {
    const a = await seed();
    const b = await seed();
    const first = await svc.acquire({
      companyId: a.companyId,
      holderRunId: a.runA,
      holderAgentId: a.agentId,
    });
    const second = await svc.acquire({
      companyId: b.companyId,
      holderRunId: b.runA,
      holderAgentId: b.agentId,
    });
    expect(first.acquired && second.acquired).toBe(true);
  });

  it("getStatus reflects the active slot through its lifecycle", async () => {
    const { companyId, agentId, runA } = await seed();
    expect((await svc.getStatus(companyId)).lock).toBeNull();
    await svc.acquire({ companyId, holderRunId: runA, holderAgentId: agentId });
    expect((await svc.getStatus(companyId)).lock?.holderRunId).toBe(runA);
    await svc.release({ companyId, actorRunId: runA });
    expect((await svc.getStatus(companyId)).lock).toBeNull();
  });
});
