import { describe, it, expect } from "vitest";
import {
  HERMES_TOOLSET_REGISTRY,
  SAFE_DEFAULT_TOOLSETS,
  TOOLSET_BY_NAME,
  isHeadlessSafeToolset,
  isKnownToolset,
} from "./toolset-registry.js";

describe("toolset-registry", () => {
  it("exposes a non-empty canonical list with unique names", () => {
    expect(HERMES_TOOLSET_REGISTRY.length).toBeGreaterThan(0);
    const names = HERMES_TOOLSET_REGISTRY.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("populates name → entry map for every entry", () => {
    expect(TOOLSET_BY_NAME.size).toBe(HERMES_TOOLSET_REGISTRY.length);
    for (const entry of HERMES_TOOLSET_REGISTRY) {
      expect(TOOLSET_BY_NAME.get(entry.name)).toBe(entry);
    }
  });

  it("requires every entry to have a non-empty description", () => {
    for (const entry of HERMES_TOOLSET_REGISTRY) {
      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("marks `clarify` as not headless-safe (FID-47)", () => {
    expect(isHeadlessSafeToolset("clarify")).toBe(false);
  });

  it("treats unknown toolsets as not headless-safe", () => {
    expect(isHeadlessSafeToolset("does_not_exist")).toBe(false);
  });

  it("treats omitted-flag toolsets as headless-safe by default", () => {
    expect(isHeadlessSafeToolset("file")).toBe(true);
    expect(isHeadlessSafeToolset("terminal")).toBe(true);
  });

  it("isKnownToolset identifies registry vs unknown names", () => {
    expect(isKnownToolset("file")).toBe(true);
    expect(isKnownToolset("not_a_real_toolset")).toBe(false);
  });

  it("safe-default subset is fully contained in the registry", () => {
    for (const name of SAFE_DEFAULT_TOOLSETS) {
      expect(TOOLSET_BY_NAME.has(name)).toBe(true);
    }
  });

  it("safe-default subset excludes the known stdin-blocker `clarify`", () => {
    expect(SAFE_DEFAULT_TOOLSETS).not.toContain("clarify");
  });
});
