import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listPiSkills,
  syncPiSkills,
} from "@fidelios/adapter-pi-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("pi local skill sync", () => {
  const fideliosKey = "maxzemtsov/fidelios/fidelios";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured FideliOS skills and installs them into the Pi skills home", async () => {
    const home = await makeTempDir("fidelios-pi-skill-sync-");
    cleanupDirs.add(home);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "pi_local",
      config: {
        env: {
          HOME: home,
        },
        fideliosSkillSync: {
          desiredSkills: [fideliosKey],
        },
      },
    } as const;

    const before = await listPiSkills(ctx);
    expect(before.mode).toBe("persistent");
    expect(before.desiredSkills).toContain(fideliosKey);
    expect(before.entries.find((entry) => entry.key === fideliosKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("missing");

    const after = await syncPiSkills(ctx, [fideliosKey]);
    expect(after.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".pi", "agent", "skills", "fidelios"))).isSymbolicLink()).toBe(true);
  });

  it("keeps required bundled FideliOS skills installed even when the desired set is emptied", async () => {
    const home = await makeTempDir("fidelios-pi-skill-prune-");
    cleanupDirs.add(home);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "pi_local",
      config: {
        env: {
          HOME: home,
        },
        fideliosSkillSync: {
          desiredSkills: [fideliosKey],
        },
      },
    } as const;

    await syncPiSkills(configuredCtx, [fideliosKey]);

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

    const after = await syncPiSkills(clearedCtx, []);
    expect(after.desiredSkills).toContain(fideliosKey);
    expect(after.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".pi", "agent", "skills", "fidelios"))).isSymbolicLink()).toBe(true);
  });
});
