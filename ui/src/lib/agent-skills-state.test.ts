import { describe, expect, it } from "vitest";
import { applyAgentSkillSnapshot, isReadOnlyUnmanagedSkillEntry } from "./agent-skills-state";

describe("applyAgentSkillSnapshot", () => {
  it("hydrates the initial snapshot without arming autosave", () => {
    const result = applyAgentSkillSnapshot(
      {
        draft: [],
        lastSaved: [],
        hasHydratedSnapshot: false,
      },
      ["fidelios", "para-memory-files"],
    );

    expect(result).toEqual({
      draft: ["fidelios", "para-memory-files"],
      lastSaved: ["fidelios", "para-memory-files"],
      hasHydratedSnapshot: true,
      shouldSkipAutosave: true,
    });
  });

  it("keeps unsaved local edits when a fresh snapshot arrives", () => {
    const result = applyAgentSkillSnapshot(
      {
        draft: ["fidelios", "custom-skill"],
        lastSaved: ["fidelios"],
        hasHydratedSnapshot: true,
      },
      ["fidelios"],
    );

    expect(result).toEqual({
      draft: ["fidelios", "custom-skill"],
      lastSaved: ["fidelios"],
      hasHydratedSnapshot: true,
      shouldSkipAutosave: false,
    });
  });

  it("adopts server state after a successful save and skips the follow-up autosave pass", () => {
    const result = applyAgentSkillSnapshot(
      {
        draft: ["fidelios", "custom-skill"],
        lastSaved: ["fidelios", "custom-skill"],
        hasHydratedSnapshot: true,
      },
      ["fidelios", "custom-skill"],
    );

    expect(result).toEqual({
      draft: ["fidelios", "custom-skill"],
      lastSaved: ["fidelios", "custom-skill"],
      hasHydratedSnapshot: true,
      shouldSkipAutosave: true,
    });
  });

  it("treats user-installed entries outside the company library as read-only unmanaged skills", () => {
    expect(isReadOnlyUnmanagedSkillEntry({
      key: "crack-python",
      runtimeName: "crack-python",
      desired: false,
      managed: false,
      state: "external",
      origin: "user_installed",
    }, new Set(["fidelios"]))).toBe(true);
  });

  it("keeps company-library entries in the managed section even when the adapter reports an external conflict", () => {
    expect(isReadOnlyUnmanagedSkillEntry({
      key: "fidelios",
      runtimeName: "fidelios",
      desired: true,
      managed: false,
      state: "external",
      origin: "company_managed",
    }, new Set(["fidelios"]))).toBe(false);
  });

  it("falls back to legacy snapshots that only mark unmanaged external entries", () => {
    expect(isReadOnlyUnmanagedSkillEntry({
      key: "legacy-external",
      runtimeName: "legacy-external",
      desired: false,
      managed: false,
      state: "external",
    }, new Set())).toBe(true);
  });
});

