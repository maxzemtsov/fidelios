import { describe, it, expect } from "vitest";
import { parseTopicRouting, resolveTopicId } from "../worker.js";

// FID-1: Automated test to verify Telegram plugin routes to correct topic/group
// for every (companyId, key) combination across the three-source precedence
// chain: UI-saved state > config JSON > default.

const COMPANY_FIDELIOS = "company-fidelios";
const COMPANY_OTHER = "company-other";
const DEFAULT_TOPIC = 999;

describe("parseTopicRouting", () => {
  it("returns an empty object for missing / undefined input", () => {
    expect(parseTopicRouting(undefined)).toEqual({});
    expect(parseTopicRouting("")).toEqual({});
  });

  it("parses a valid JSON routing map", () => {
    const raw = JSON.stringify({
      [COMPANY_FIDELIOS]: { tasks: 11, approvals: 22 },
      [COMPANY_OTHER]: { tasks: 33 },
    });
    expect(parseTopicRouting(raw)).toEqual({
      [COMPANY_FIDELIOS]: { tasks: 11, approvals: 22 },
      [COMPANY_OTHER]: { tasks: 33 },
    });
  });

  it("falls back to {} on malformed JSON instead of throwing", () => {
    expect(parseTopicRouting("{ not json")).toEqual({});
    expect(parseTopicRouting("null")).toBeNull();
  });
});

describe("resolveTopicId — precedence", () => {
  const configRouting = {
    [COMPANY_FIDELIOS]: { tasks: 11, approvals: 22 },
    [COMPANY_OTHER]: { tasks: 33 },
  };

  it("returns the default topic when nothing is configured", () => {
    expect(resolveTopicId({}, COMPANY_FIDELIOS, "tasks", DEFAULT_TOPIC, null)).toBe(DEFAULT_TOPIC);
  });

  it("returns the config JSON topic when no UI-saved topics exist", () => {
    expect(resolveTopicId(configRouting, COMPANY_FIDELIOS, "tasks", DEFAULT_TOPIC, null)).toBe(11);
    expect(resolveTopicId(configRouting, COMPANY_FIDELIOS, "approvals", DEFAULT_TOPIC, null)).toBe(22);
  });

  it("UI-saved topics win over config JSON for the same key", () => {
    const savedTopics = { tasks: 777, approvals: 888, hiring: 999, system: 1000 };
    expect(resolveTopicId(configRouting, COMPANY_FIDELIOS, "tasks", DEFAULT_TOPIC, savedTopics)).toBe(777);
    expect(resolveTopicId(configRouting, COMPANY_FIDELIOS, "approvals", DEFAULT_TOPIC, savedTopics)).toBe(888);
  });

  it("falls back to defaultTopicId for unknown keys", () => {
    expect(resolveTopicId(configRouting, COMPANY_FIDELIOS, "unknown-key", DEFAULT_TOPIC, null)).toBe(DEFAULT_TOPIC);
  });

  it("isolates routing per-company — one company's rules do not leak to another", () => {
    // COMPANY_FIDELIOS has tasks=11, COMPANY_OTHER has tasks=33, unrelated company should fall back.
    expect(resolveTopicId(configRouting, COMPANY_FIDELIOS, "tasks", DEFAULT_TOPIC, null)).toBe(11);
    expect(resolveTopicId(configRouting, COMPANY_OTHER, "tasks", DEFAULT_TOPIC, null)).toBe(33);
    expect(resolveTopicId(configRouting, "some-other-company", "tasks", DEFAULT_TOPIC, null)).toBe(DEFAULT_TOPIC);
  });

  it("handles mixed saved topics — saved keys win, missing keys fall through", () => {
    const savedTopics = { tasks: 777, approvals: 888, hiring: 999, system: 1000 };
    // tasks is in saved → 777; approvals is in saved → 888; hiring is in saved → 999
    expect(resolveTopicId(configRouting, COMPANY_FIDELIOS, "tasks", DEFAULT_TOPIC, savedTopics)).toBe(777);
    // Unknown key not in saved and not in config for the company → default
    expect(resolveTopicId(configRouting, COMPANY_FIDELIOS, "nonexistent", DEFAULT_TOPIC, savedTopics)).toBe(DEFAULT_TOPIC);
  });
});
