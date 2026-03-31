import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listCursorSkills,
  syncCursorSkills,
} from "@fidelios/adapter-cursor-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createSkillDir(root: string, name: string) {
  const skillDir = path.join(root, name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\n---\n`, "utf8");
  return skillDir;
}

describe("cursor local skill sync", () => {
  const fideliosKey = "maxzemtsov/fidelios/fidelios";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured FideliOS skills and installs them into the Cursor skills home", async () => {
    const home = await makeTempDir("fidelios-cursor-skill-sync-");
    cleanupDirs.add(home);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        env: {
          HOME: home,
        },
        fideliosSkillSync: {
          desiredSkills: [fideliosKey],
        },
      },
    } as const;

    const before = await listCursorSkills(ctx);
    expect(before.mode).toBe("persistent");
    expect(before.desiredSkills).toContain(fideliosKey);
    expect(before.entries.find((entry) => entry.key === fideliosKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("missing");

    const after = await syncCursorSkills(ctx, [fideliosKey]);
    expect(after.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".cursor", "skills", "fidelios"))).isSymbolicLink()).toBe(true);
  });

  it("recognizes company-library runtime skills supplied outside the bundled FideliOS directory", async () => {
    const home = await makeTempDir("fidelios-cursor-runtime-skills-home-");
    const runtimeSkills = await makeTempDir("fidelios-cursor-runtime-skills-src-");
    cleanupDirs.add(home);
    cleanupDirs.add(runtimeSkills);

    const fideliosDir = await createSkillDir(runtimeSkills, "fidelios");
    const asciiHeartDir = await createSkillDir(runtimeSkills, "ascii-heart");

    const ctx = {
      agentId: "agent-3",
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        env: {
          HOME: home,
        },
        fideliosRuntimeSkills: [
          {
            key: "fidelios",
            runtimeName: "fidelios",
            source: fideliosDir,
            required: true,
            requiredReason: "Bundled FideliOS skills are always available for local adapters.",
          },
          {
            key: "ascii-heart",
            runtimeName: "ascii-heart",
            source: asciiHeartDir,
          },
        ],
        fideliosSkillSync: {
          desiredSkills: ["ascii-heart"],
        },
      },
    } as const;

    const before = await listCursorSkills(ctx);
    expect(before.warnings).toEqual([]);
    expect(before.desiredSkills).toEqual(["fidelios", "ascii-heart"]);
    expect(before.entries.find((entry) => entry.key === "ascii-heart")?.state).toBe("missing");

    const after = await syncCursorSkills(ctx, ["ascii-heart"]);
    expect(after.warnings).toEqual([]);
    expect(after.entries.find((entry) => entry.key === "ascii-heart")?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".cursor", "skills", "ascii-heart"))).isSymbolicLink()).toBe(true);
  });

  it("keeps required bundled FideliOS skills installed even when the desired set is emptied", async () => {
    const home = await makeTempDir("fidelios-cursor-skill-prune-");
    cleanupDirs.add(home);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        env: {
          HOME: home,
        },
        fideliosSkillSync: {
          desiredSkills: [fideliosKey],
        },
      },
    } as const;

    await syncCursorSkills(configuredCtx, [fideliosKey]);

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

    const after = await syncCursorSkills(clearedCtx, []);
    expect(after.desiredSkills).toContain(fideliosKey);
    expect(after.entries.find((entry) => entry.key === fideliosKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".cursor", "skills", "fidelios"))).isSymbolicLink()).toBe(true);
  });
});
