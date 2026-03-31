import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listGeminiSkills,
  syncGeminiSkills,
} from "@fidelios/adapter-gemini-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("gemini local skill sync", () => {
  const fideliosKey = "maxzemtsov/fidelios/fidelios";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured FideliOS skills and installs them into the Gemini skills home", async () => {
    const home = await makeTempDir("fidelios-gemini-skill-sync-");
    cleanupDirs.add(home);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "gemini_local",
      config: {
        env: {
          HOME: home,
        },
        fideliosSkillSync: {
          desiredSkills: [fideliosKey],
        },
      },
    } as const;

    const before = await listGeminiSkills(ctx);
    expect(before.mode).toBe("persistent");
    expect(before.desiredSkills).toContain(fideliosKey);
    expect(before.entries.find((entry) => entry.key === fideliosKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("missing");

    const after = await syncGeminiSkills(ctx, [fideliosKey]);
    expect(after.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".gemini", "skills", "fidelios"))).isSymbolicLink()).toBe(true);
  });

  it("keeps required bundled FideliOS skills installed even when the desired set is emptied", async () => {
    const home = await makeTempDir("fidelios-gemini-skill-prune-");
    cleanupDirs.add(home);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "gemini_local",
      config: {
        env: {
          HOME: home,
        },
        fideliosSkillSync: {
          desiredSkills: [fideliosKey],
        },
      },
    } as const;

    await syncGeminiSkills(configuredCtx, [fideliosKey]);

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

    const after = await syncGeminiSkills(clearedCtx, []);
    expect(after.desiredSkills).toContain(fideliosKey);
    expect(after.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".gemini", "skills", "fidelios"))).isSymbolicLink()).toBe(true);
  });
});
