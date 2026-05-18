import { describe, expect, it } from "vitest";
import {
  loadDefaultAgentInstructionsBundle,
  mergeAgentInstructionBundle,
  resolveDefaultAgentInstructionsBundleRole,
} from "../services/default-agent-instructions.js";

const BUNDLE_FILES = ["AGENTS.md", "SOUL.md", "HEARTBEAT.md", "TOOLS.md"];

describe("default agent instructions bundle", () => {
  it("resolves each role to its instruction bundle", () => {
    expect(resolveDefaultAgentInstructionsBundleRole("general")).toBe("default");
    expect(resolveDefaultAgentInstructionsBundleRole("engineer")).toBe("default");
    expect(resolveDefaultAgentInstructionsBundleRole("ceo")).toBe("ceo");
    expect(resolveDefaultAgentInstructionsBundleRole("code_reviewer")).toBe("code_reviewer");
  });

  it("scaffolds all four instruction files for the default role", async () => {
    const bundle = await loadDefaultAgentInstructionsBundle("default");
    expect(Object.keys(bundle).sort()).toEqual([...BUNDLE_FILES].sort());
    for (const name of BUNDLE_FILES) {
      expect((bundle[name]?.trim().length ?? 0), `${name} should not be empty`).toBeGreaterThan(0);
    }
  });

  it("scaffolds all four instruction files for the ceo role", async () => {
    const bundle = await loadDefaultAgentInstructionsBundle("ceo");
    expect(Object.keys(bundle).sort()).toEqual([...BUNDLE_FILES].sort());
  });

  it("scaffolds all four instruction files for the code_reviewer role", async () => {
    const bundle = await loadDefaultAgentInstructionsBundle("code_reviewer");
    expect(Object.keys(bundle).sort()).toEqual([...BUNDLE_FILES].sort());
    for (const name of BUNDLE_FILES) {
      expect((bundle[name]?.trim().length ?? 0), `${name} should not be empty`).toBeGreaterThan(0);
    }
  });

  describe("mergeAgentInstructionBundle", () => {
    const scaffold = {
      "AGENTS.md": "scaffold agents",
      "SOUL.md": "scaffold soul",
      "HEARTBEAT.md": "scaffold heartbeat",
      "TOOLS.md": "scaffold tools",
    };

    it("keeps the scaffold when nothing is provided", () => {
      expect(mergeAgentInstructionBundle(scaffold)).toEqual(scaffold);
    });

    it("overrides only the files the CEO authored", () => {
      const merged = mergeAgentInstructionBundle(scaffold, {
        overrideFiles: { "SOUL.md": "custom soul", "AGENTS.md": "custom agents" },
      });
      expect(merged["SOUL.md"]).toBe("custom soul");
      expect(merged["AGENTS.md"]).toBe("custom agents");
      // Files the CEO omitted keep the scaffold.
      expect(merged["HEARTBEAT.md"]).toBe("scaffold heartbeat");
      expect(merged["TOOLS.md"]).toBe("scaffold tools");
    });

    it("ignores empty or whitespace-only overrides", () => {
      const merged = mergeAgentInstructionBundle(scaffold, {
        overrideFiles: { "SOUL.md": "   ", "TOOLS.md": "" },
      });
      expect(merged["SOUL.md"]).toBe("scaffold soul");
      expect(merged["TOOLS.md"]).toBe("scaffold tools");
    });

    it("uses a legacy promptTemplate as AGENTS.md without dropping the other files", () => {
      const merged = mergeAgentInstructionBundle(scaffold, { promptTemplate: "legacy prompt" });
      expect(merged["AGENTS.md"]).toBe("legacy prompt");
      expect(merged["SOUL.md"]).toBe("scaffold soul");
      expect(merged["HEARTBEAT.md"]).toBe("scaffold heartbeat");
      expect(merged["TOOLS.md"]).toBe("scaffold tools");
    });

    it("lets an explicit AGENTS.md override win over a promptTemplate", () => {
      const merged = mergeAgentInstructionBundle(scaffold, {
        promptTemplate: "legacy prompt",
        overrideFiles: { "AGENTS.md": "explicit agents" },
      });
      expect(merged["AGENTS.md"]).toBe("explicit agents");
    });
  });
});
