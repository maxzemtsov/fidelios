import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { agents, companies, createDb } from "@fideliosai/db";
import { buildAgentMentionHref } from "@fideliosai/shared";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueService } from "../services/issues.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported
  ? describe
  : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres findMentionedAgents tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issueService.findMentionedAgents (FID-44)", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof issueService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;
  let bobId!: string;
  let platformEngId!: string;
  let pluginDevId!: string;
  let platformId!: string; // single-word agent name that is a prefix of "Platform Engineer"

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("fidelios-find-mentioned-agents-");
    db = createDb(tempDb.connectionString);
    svc = issueService(db);

    companyId = randomUUID();
    bobId = randomUUID();
    platformEngId = randomUUID();
    pluginDevId = randomUUID();
    platformId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "FideliOS",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(agents).values([
      { id: bobId, companyId, name: "Bob", role: "ic" },
      {
        id: platformEngId,
        companyId,
        name: "Platform Engineer",
        role: "ic",
      },
      { id: pluginDevId, companyId, name: "Plugin Developer", role: "ic" },
      { id: platformId, companyId, name: "Platform", role: "ic" },
    ]);
  }, 20_000);

  afterEach(async () => {
    // No row mutation in tests; nothing to clean per test.
  });

  afterAll(async () => {
    await db.delete(agents);
    await db.delete(companies);
    await tempDb?.cleanup();
  });

  it("resolves a plain-text single-word mention", async () => {
    const result = await svc.findMentionedAgents(companyId, "Hi @Bob please look");
    expect(result).toEqual([bobId]);
  });

  it("resolves a plain-text multi-word agent name", async () => {
    const result = await svc.findMentionedAgents(
      companyId,
      "@Platform Engineer can you take this",
    );
    expect(result).toEqual([platformEngId]);
  });

  it("resolves multi-word names case-insensitively", async () => {
    const result = await svc.findMentionedAgents(
      companyId,
      "ping @platform engineer about the deploy",
    );
    expect(result).toEqual([platformEngId]);
  });

  it("prefers the longest matching agent name (no false positive on `Platform`)", async () => {
    const result = await svc.findMentionedAgents(
      companyId,
      "@Platform Engineer please review",
    );
    // Only the longest match should resolve, not the shorter "Platform" agent.
    expect(result).toEqual([platformEngId]);
  });

  it("still resolves the short agent when the body uses just `@Platform` standalone", async () => {
    const result = await svc.findMentionedAgents(companyId, "@Platform team check this");
    expect(result).toEqual([platformId]);
  });

  it("fans out multiple distinct mentions with no duplicates", async () => {
    const result = await svc.findMentionedAgents(
      companyId,
      "@Platform Engineer and @Plugin Developer please coordinate",
    );
    expect(new Set(result)).toEqual(new Set([platformEngId, pluginDevId]));
  });

  it("does not match an unknown handle", async () => {
    const result = await svc.findMentionedAgents(companyId, "@nobody-here help!");
    expect(result).toEqual([]);
  });

  it("does not match an email address (no false positive on `foo@bar.com`)", async () => {
    const result = await svc.findMentionedAgents(
      companyId,
      "Send to bob@example.com or platform.engineer@corp.io",
    );
    expect(result).toEqual([]);
  });

  it("resolves an explicit markdown-link mention via [@Name](agent://id)", async () => {
    const href = buildAgentMentionHref(platformEngId, null);
    const result = await svc.findMentionedAgents(
      companyId,
      `Please [@Platform Engineer](${href}) take this on`,
    );
    expect(result).toEqual([platformEngId]);
  });

  it("does not double-count when the same agent is mentioned via plain text and markdown link", async () => {
    const href = buildAgentMentionHref(platformEngId, null);
    const result = await svc.findMentionedAgents(
      companyId,
      `[@Platform Engineer](${href}) reminder for @Platform Engineer`,
    );
    expect(result).toEqual([platformEngId]);
  });

  it("returns empty array when the body has no `@` and no agent links", async () => {
    const result = await svc.findMentionedAgents(companyId, "No mentions here at all");
    expect(result).toEqual([]);
  });

  it("decodes HTML-encoded whitespace in plain-text mentions", async () => {
    // Telegram/UI sometimes encodes a trailing space as &#x20; — the mention should
    // still resolve when the body contains numeric character references.
    const result = await svc.findMentionedAgents(
      companyId,
      "@Platform&#x20;Engineer please review",
    );
    expect(result).toEqual([platformEngId]);
  });
});
