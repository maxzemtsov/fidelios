import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listCodexSkills,
  syncCodexSkills,
} from "@fidelios/adapter-codex-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("codex local skill sync", () => {
  const fideliosKey = "fideliosai/fidelios/fidelios";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured FideliOS skills for workspace injection on the next run", async () => {
    const codexHome = await makeTempDir("fidelios-codex-skill-sync-");
    cleanupDirs.add(codexHome);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        fideliosSkillSync: {
          desiredSkills: [fideliosKey],
        },
      },
    } as const;

    const before = await listCodexSkills(ctx);
    expect(before.mode).toBe("ephemeral");
    expect(before.desiredSkills).toContain(fideliosKey);
    expect(before.entries.find((entry) => entry.key === fideliosKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("configured");
    expect(before.entries.find((entry) => entry.key === fideliosKey)?.detail).toContain("CODEX_HOME/skills/");
  });

  it("does not persist FideliOS skills into CODEX_HOME during sync", async () => {
    const codexHome = await makeTempDir("fidelios-codex-skill-prune-");
    cleanupDirs.add(codexHome);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        fideliosSkillSync: {
          desiredSkills: [fideliosKey],
        },
      },
    } as const;

    const after = await syncCodexSkills(configuredCtx, [fideliosKey]);
    expect(after.mode).toBe("ephemeral");
    expect(after.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("configured");
    await expect(fs.lstat(path.join(codexHome, "skills", "fidelios"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("keeps required bundled FideliOS skills configured even when the desired set is emptied", async () => {
    const codexHome = await makeTempDir("fidelios-codex-skill-required-");
    cleanupDirs.add(codexHome);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        fideliosSkillSync: {
          desiredSkills: [],
        },
      },
    } as const;

    const after = await syncCodexSkills(configuredCtx, []);
    expect(after.desiredSkills).toContain(fideliosKey);
    expect(after.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("configured");
  });

  it("normalizes legacy flat FideliOS skill refs before reporting configured state", async () => {
    const codexHome = await makeTempDir("fidelios-codex-legacy-skill-sync-");
    cleanupDirs.add(codexHome);

    const snapshot = await listCodexSkills({
      agentId: "agent-3",
      companyId: "company-1",
      adapterType: "codex_local",
      config: {
        env: {
          CODEX_HOME: codexHome,
        },
        fideliosSkillSync: {
          desiredSkills: ["fidelios"],
        },
      },
    });

    expect(snapshot.warnings).toEqual([]);
    expect(snapshot.desiredSkills).toContain(fideliosKey);
    expect(snapshot.desiredSkills).not.toContain("fidelios");
    expect(snapshot.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("configured");
    expect(snapshot.entries.find((entry) => entry.key === "fidelios")).toBeUndefined();
  });
});
