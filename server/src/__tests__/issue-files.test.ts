import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execFileSync } from "node:child_process";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  companies,
  createDb,
  issues,
  projectWorkspaces,
  projects,
} from "@fideliosai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { issueFileService } from "../services/issue-files.ts";
import { HttpError } from "../errors.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres issue file tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("issueFileService.readWorkspaceFile", () => {
  let db!: ReturnType<typeof createDb>;
  let svc!: ReturnType<typeof issueFileService>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const tempDirs = new Set<string>();

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("fidelios-issue-files-");
    db = createDb(tempDb.connectionString);
    svc = issueFileService(db);
  }, 20_000);

  afterEach(async () => {
    await db.delete(issues);
    await db.delete(projectWorkspaces);
    await db.delete(projects);
    await db.delete(companies);
    await Promise.all(Array.from(tempDirs, (dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.clear();
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function makeWorkspaceDir() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fidelios-workspace-"));
    tempDirs.add(dir);
    return dir;
  }

  /**
   * Seed a company + project + workspace + issue. When `workspaceCwd` is null
   * the issue is created without a `projectWorkspaceId`.
   */
  async function seedIssue(workspaceCwd: string | null) {
    const companyId = randomUUID();
    const projectId = randomUUID();
    const issueId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "FideliOS",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });

    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Workspace project",
    });

    let projectWorkspaceId: string | null = null;
    if (workspaceCwd !== null) {
      projectWorkspaceId = randomUUID();
      await db.insert(projectWorkspaces).values({
        id: projectWorkspaceId,
        companyId,
        projectId,
        name: "Primary workspace",
        cwd: workspaceCwd,
      });
    }

    await db.insert(issues).values({
      id: issueId,
      companyId,
      projectId,
      ...(projectWorkspaceId ? { projectWorkspaceId } : {}),
      title: "Workspace issue",
      status: "todo",
      priority: "medium",
    });

    return { companyId, issueId };
  }

  it("resolves a file at the workspace root and returns its content", async () => {
    const cwd = await makeWorkspaceDir();
    await fs.writeFile(path.join(cwd, "PANEL_CONSENT.md"), "# Consent panel\n", "utf8");
    const { companyId, issueId } = await seedIssue(cwd);

    const result = await svc.readWorkspaceFile(companyId, issueId, "PANEL_CONSENT.md");

    expect(result.path).toBe("PANEL_CONSENT.md");
    expect(result.kind).toBe("text");
    expect(result.content).toBe("# Consent panel\n");
    expect(result.truncated).toBe(false);
    expect(result.multipleMatches).toBe(false);
  });

  it("classifies a binary file as binary and omits inline content", async () => {
    const cwd = await makeWorkspaceDir();
    await fs.writeFile(
      path.join(cwd, "report.pdf"),
      Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0x01]),
    );
    const { companyId, issueId } = await seedIssue(cwd);

    const result = await svc.readWorkspaceFile(companyId, issueId, "report.pdf");

    expect(result.kind).toBe("binary");
    expect(result.content).toBe("");
    expect(result.size).toBeGreaterThan(0);
  });

  it("resolves a bare filename living in a subdirectory via recursive search", async () => {
    const cwd = await makeWorkspaceDir();
    await fs.mkdir(path.join(cwd, "docs", "panels"), { recursive: true });
    await fs.writeFile(
      path.join(cwd, "docs", "panels", "DEEP_NOTE.md"),
      "buried content\n",
      "utf8",
    );
    const { companyId, issueId } = await seedIssue(cwd);

    const result = await svc.readWorkspaceFile(companyId, issueId, "DEEP_NOTE.md");

    expect(result.path).toBe("docs/panels/DEEP_NOTE.md");
    expect(result.content).toBe("buried content\n");
    expect(result.multipleMatches).toBe(false);
  });

  it("resolves a file via git ls-files in a git workspace", async () => {
    const cwd = await makeWorkspaceDir();
    execFileSync("git", ["init", "-q"], { cwd });
    await fs.mkdir(path.join(cwd, "docs", "deep"), { recursive: true });
    await fs.writeFile(path.join(cwd, "docs", "deep", "GIT_NOTE.md"), "tracked-ish\n", "utf8");
    const { companyId, issueId } = await seedIssue(cwd);

    const result = await svc.readWorkspaceFile(companyId, issueId, "GIT_NOTE.md");

    expect(result.kind).toBe("text");
    expect(result.path).toBe("docs/deep/GIT_NOTE.md");
    expect(result.content).toBe("tracked-ish\n");
  });

  it("keeps a traversal attempt inside the workspace", async () => {
    const cwd = await makeWorkspaceDir();
    const { companyId, issueId } = await seedIssue(cwd);

    // `../../etc/hosts` normalizes the `..` segments away, leaving `etc/hosts`
    // — which does not exist in the workspace, so it resolves to `missing`.
    const result = await svc.readWorkspaceFile(companyId, issueId, "../../etc/hosts");
    expect(result.kind).toBe("missing");
    expect(result.path).toBe("etc/hosts");
  });

  it("returns a missing result for a file not in the workspace", async () => {
    const cwd = await makeWorkspaceDir();
    const { companyId, issueId } = await seedIssue(cwd);

    const result = await svc.readWorkspaceFile(companyId, issueId, "DOES_NOT_EXIST.md");
    expect(result.kind).toBe("missing");
    expect(result.path).toBe("DOES_NOT_EXIST.md");
    expect(result.workspaceDir).toBeTruthy();
  });

  it("returns 404 when the issue has no project workspace", async () => {
    const { companyId, issueId } = await seedIssue(null);

    let thrown: unknown;
    try {
      await svc.readWorkspaceFile(companyId, issueId, "PANEL_CONSENT.md");
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(HttpError);
    expect((thrown as HttpError).status).toBe(404);
    expect((thrown as HttpError).message).toBe("No workspace is configured for this issue");
  });

  it("returns 404 when the issue belongs to a different company", async () => {
    const cwd = await makeWorkspaceDir();
    await fs.writeFile(path.join(cwd, "PANEL_CONSENT.md"), "# Consent panel\n", "utf8");
    const { issueId } = await seedIssue(cwd);

    await expect(
      svc.readWorkspaceFile(randomUUID(), issueId, "PANEL_CONSENT.md"),
    ).rejects.toMatchObject({ status: 404, message: "Issue not found" });
  });
});
