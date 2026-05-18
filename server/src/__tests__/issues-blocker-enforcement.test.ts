import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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
    `Skipping blocker-enforcement tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issueService blocker enforcement", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof issueService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("fidelios-blocker-enforcement-");
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

  /** Seed a company with one agent, a blocker issue, and an issue blocked_by it. */
  async function seed() {
    const companyId = randomUUID();
    const agentId = randomUUID();
    const blockerIssueId = randomUUID();
    const blockedIssueId = randomUUID();

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
      {
        id: blockerIssueId,
        companyId,
        title: "Blocker issue",
        status: "todo",
        priority: "medium",
        createdByAgentId: agentId,
      },
      {
        id: blockedIssueId,
        companyId,
        title: "Blocked issue",
        status: "todo",
        priority: "medium",
        assigneeAgentId: agentId,
        createdByAgentId: agentId,
      },
    ]);
    await db.insert(issueRelations).values({
      companyId,
      type: "blocked_by",
      issueId: blockedIssueId,
      relatedIssueId: blockerIssueId,
    });
    return { companyId, agentId, blockerIssueId, blockedIssueId };
  }

  it("rejects checkout of an issue with an unresolved blocker", async () => {
    const { agentId, blockedIssueId } = await seed();
    await expect(
      svc.checkout(blockedIssueId, agentId, ["todo"], null),
    ).rejects.toThrow(/blocked by unresolved dependencies/i);
  });

  it("allows checkout once the blocker is done", async () => {
    const { agentId, blockerIssueId, blockedIssueId } = await seed();
    await db.update(issues).set({ status: "done" }).where(eq(issues.id, blockerIssueId));
    const checked = await svc.checkout(blockedIssueId, agentId, ["todo"], null);
    expect(checked.status).toBe("in_progress");
  });

  it("exempts a re-checkout by the agent that already owns the in-progress issue", async () => {
    const { agentId, blockedIssueId } = await seed();
    await db.update(issues).set({ status: "in_progress" }).where(eq(issues.id, blockedIssueId));
    // The blocker is still unresolved, but the owning agent's re-checkout of an
    // already-running issue must not be interrupted.
    const checked = await svc.checkout(blockedIssueId, agentId, ["todo", "in_progress"], null);
    expect(checked.status).toBe("in_progress");
  });

  it("omits blocked issues from list when skipBlockedByUnresolvedDependencies is set", async () => {
    const { companyId, blockerIssueId, blockedIssueId } = await seed();
    const filtered = await svc.list(companyId, { skipBlockedByUnresolvedDependencies: true });
    const ids = new Set(filtered.map((issue) => issue.id));
    expect(ids.has(blockerIssueId)).toBe(true);
    expect(ids.has(blockedIssueId)).toBe(false);
  });

  it("includes blocked issues in list by default (no flag)", async () => {
    const { companyId, blockedIssueId } = await seed();
    const all = await svc.list(companyId, {});
    expect(new Set(all.map((issue) => issue.id)).has(blockedIssueId)).toBe(true);
  });

  it("re-includes a blocked issue once its blocker is resolved", async () => {
    const { companyId, blockerIssueId, blockedIssueId } = await seed();
    await db.update(issues).set({ status: "done" }).where(eq(issues.id, blockerIssueId));
    const filtered = await svc.list(companyId, { skipBlockedByUnresolvedDependencies: true });
    expect(new Set(filtered.map((issue) => issue.id)).has(blockedIssueId)).toBe(true);
  });
});
