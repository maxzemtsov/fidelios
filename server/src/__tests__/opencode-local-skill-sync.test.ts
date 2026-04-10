import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listOpenCodeSkills,
  syncOpenCodeSkills,
} from "@fideliosai/adapter-opencode-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("opencode local skill sync", () => {
  const fideliosKey = "fideliosai/fidelios/fidelios";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured FideliOS skills and installs them into the OpenCode skills home", async () => {
    const home = await makeTempDir("fidelios-opencode-skill-sync-");
    cleanupDirs.add(home);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "opencode_local",
      config: {
        env: {
          HOME: home,
        },
        fideliosSkillSync: {
          desiredSkills: [fideliosKey],
        },
      },
    } as const;

    const before = await listOpenCodeSkills(ctx);
    expect(before.mode).toBe("persistent");
    expect(before.warnings ?? []).toHaveLength(0);
    expect(before.desiredSkills).toContain(fideliosKey);
    expect(before.entries.find((entry) => entry.key === fideliosKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("missing");

    const after = await syncOpenCodeSkills(ctx, [fideliosKey]);
    expect(after.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".opencode", "skills", "fidelios"))).isSymbolicLink()).toBe(true);
  });

  it("keeps required bundled FideliOS skills installed even when the desired set is emptied", async () => {
    const home = await makeTempDir("fidelios-opencode-skill-prune-");
    cleanupDirs.add(home);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "opencode_local",
      config: {
        env: {
          HOME: home,
        },
        fideliosSkillSync: {
          desiredSkills: [fideliosKey],
        },
      },
    } as const;

    await syncOpenCodeSkills(configuredCtx, [fideliosKey]);

    const clearedCtx = {
      ...configuredCtx,
      config: {
        env: {
          HOME: home,
        },
        fideliosSkillSync: {
          desiredSkills: [],
        },
      },
    } as const;

    const after = await syncOpenCodeSkills(clearedCtx, []);
    expect(after.desiredSkills).toContain(fideliosKey);
    expect(after.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".opencode", "skills", "fidelios"))).isSymbolicLink()).toBe(true);
  });
});
