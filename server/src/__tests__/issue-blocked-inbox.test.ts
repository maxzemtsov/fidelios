import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb, issueRelations, issues } from "@fideliosai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueService } from "../services/issues.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping blocked-inbox tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issueService blocked inbox", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof issueService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("fidelios-blocked-inbox-");
    db = createDb(tempDb.connectionString);
    svc = issueService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issueRelations);
    await db.delete(issues);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  /**
   * Seed one company with the six issue shapes the blocked inbox classifies:
   * an open blocker, a done blocker, a manually-blocked issue, a dependency-
   * blocked issue, a stale-blocked issue, and a healthy todo.
   */
  async function seed() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const ids = {
      openBlocker: randomUUID(),
      doneBlocker: randomUUID(),
      manualBlocked: randomUUID(),
      depBlocked: randomUUID(),
      staleBlocked: randomUUID(),
      plainTodo: randomUUID(),
    };

    await db.insert(companies).values({
      id: companyId,
      name: "FideliOS",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
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
    await db.insert(issues).values([
      { id: ids.openBlocker, companyId, title: "Open blocker", status: "todo", priority: "medium", createdByAgentId: agentId },
      { id: ids.doneBlocker, companyId, title: "Done blocker", status: "done", priority: "medium", createdByAgentId: agentId },
      { id: ids.manualBlocked, companyId, title: "Manually blocked", status: "blocked", priority: "high", createdByAgentId: agentId },
      { id: ids.depBlocked, companyId, title: "Dependency blocked", status: "todo", priority: "medium", createdByAgentId: agentId },
      { id: ids.staleBlocked, companyId, title: "Stale blocked", status: "blocked", priority: "low", createdByAgentId: agentId },
      { id: ids.plainTodo, companyId, title: "Plain todo", status: "todo", priority: "medium", createdByAgentId: agentId },
    ]);
    await db.insert(issueRelations).values([
      { companyId, type: "blocked_by", issueId: ids.depBlocked, relatedIssueId: ids.openBlocker },
      { companyId, type: "blocked_by", issueId: ids.staleBlocked, relatedIssueId: ids.doneBlocker },
    ]);
    return { companyId, ...ids };
  }

  it("lists blocked, dependency-blocked, and stale issues and excludes healthy work", async () => {
    const seeded = await seed();
    const rows = await svc.list(seeded.companyId, { attention: "blocked" });
    const ids = new Set(rows.map((row) => row.id));
    expect(ids.has(seeded.manualBlocked)).toBe(true);
    expect(ids.has(seeded.depBlocked)).toBe(true);
    expect(ids.has(seeded.staleBlocked)).toBe(true);
    expect(ids.has(seeded.plainTodo)).toBe(false);
    expect(ids.has(seeded.openBlocker)).toBe(false);
    expect(ids.has(seeded.doneBlocker)).toBe(false);
  });

  it("classifies a blocked issue with no dependency as manually_blocked", async () => {
    const seeded = await seed();
    const rows = await svc.list(seeded.companyId, { attention: "blocked" });
    const issue = rows.find((row) => row.id === seeded.manualBlocked);
    expect(issue?.blockedInbox).toEqual({ reason: "manually_blocked", blockedBy: [] });
  });

  it("classifies an issue with an unresolved blocker as blocked_by_dependency", async () => {
    const seeded = await seed();
    const rows = await svc.list(seeded.companyId, { attention: "blocked" });
    const issue = rows.find((row) => row.id === seeded.depBlocked);
    expect(issue?.blockedInbox?.reason).toBe("blocked_by_dependency");
    expect(issue?.blockedInbox?.blockedBy.map((blocker) => blocker.id)).toEqual([seeded.openBlocker]);
  });

  it("classifies a blocked issue with only resolved blockers as stale_dependency", async () => {
    const seeded = await seed();
    const rows = await svc.list(seeded.companyId, { attention: "blocked" });
    const issue = rows.find((row) => row.id === seeded.staleBlocked);
    expect(issue?.blockedInbox?.reason).toBe("stale_dependency");
    expect(issue?.blockedInbox?.blockedBy.map((blocker) => blocker.status)).toEqual(["done"]);
  });

  it("does not annotate blockedInbox on a normal issue list", async () => {
    const seeded = await seed();
    const rows = await svc.list(seeded.companyId, {});
    expect(rows.every((row) => !("blockedInbox" in row))).toBe(true);
  });
});
