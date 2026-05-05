import { describe, expect, it } from "vitest";
import { applyModelRoutingDecision, resolveModelRouting } from "../services/model-router.js";

describe("resolveModelRouting (FID-14)", () => {
  it("returns null when config has no default model and no rules fire", () => {
    expect(resolveModelRouting({ config: {} })).toBeNull();
  });

  it("falls back to default model/effort when no rules are configured", () => {
    const decision = resolveModelRouting({
      config: { model: "claude-opus-4-7", effort: "high" },
    });
    expect(decision).toEqual({
      model: "claude-opus-4-7",
      effort: "high",
      matchedRuleIndex: null,
      source: "default",
      taskKind: null,
    });
  });

  it("falls back to default when modelRouting is empty", () => {
    const decision = resolveModelRouting({
      config: { model: "claude-opus-4-7", modelRouting: [] },
      taskKind: "comment",
    });
    expect(decision?.source).toBe("default");
    expect(decision?.model).toBe("claude-opus-4-7");
  });

  it("returns the first matching rule by taskKind", () => {
    const decision = resolveModelRouting({
      config: {
        model: "claude-opus-4-7",
        effort: "xhigh",
        modelRouting: [
          { when: { taskKind: "code" }, model: "claude-opus-4-7", effort: "xhigh" },
          { when: { taskKind: "comment" }, model: "claude-haiku-4-5-20251001", effort: "low" },
        ],
      },
      taskKind: "comment",
    });
    expect(decision).toEqual({
      model: "claude-haiku-4-5-20251001",
      effort: "low",
      matchedRuleIndex: 1,
      source: "rule",
      taskKind: "comment",
    });
  });

  it("matches on agentRole", () => {
    const decision = resolveModelRouting({
      config: {
        model: "claude-opus-4-7",
        modelRouting: [
          { when: { agentRole: "ceo" }, model: "claude-haiku-4-5-20251001", effort: "low" },
        ],
      },
      agentRole: "ceo",
    });
    expect(decision?.model).toBe("claude-haiku-4-5-20251001");
    expect(decision?.matchedRuleIndex).toBe(0);
  });

  it("requires ALL predicate keys to match (AND, not OR)", () => {
    const decision = resolveModelRouting({
      config: {
        model: "claude-opus-4-7",
        modelRouting: [
          {
            when: { taskKind: "comment", agentRole: "ceo" },
            model: "claude-haiku-4-5-20251001",
            effort: "low",
          },
        ],
      },
      taskKind: "comment",
      agentRole: "engineer", // role mismatch — rule should NOT fire
    });
    expect(decision?.source).toBe("default");
    expect(decision?.model).toBe("claude-opus-4-7");
  });

  it("treats an empty `when` as a catch-all", () => {
    const decision = resolveModelRouting({
      config: {
        model: "claude-opus-4-7",
        modelRouting: [{ when: {}, model: "claude-sonnet-4-6" }],
      },
      taskKind: "research",
    });
    expect(decision?.model).toBe("claude-sonnet-4-6");
    expect(decision?.matchedRuleIndex).toBe(0);
  });

  it("inherits default effort when a rule omits it", () => {
    const decision = resolveModelRouting({
      config: {
        model: "claude-opus-4-7",
        effort: "xhigh",
        modelRouting: [{ when: { taskKind: "comment" }, model: "claude-haiku-4-5-20251001" }],
      },
      taskKind: "comment",
    });
    expect(decision?.model).toBe("claude-haiku-4-5-20251001");
    expect(decision?.effort).toBe("xhigh");
  });

  it("forceModel overrides everything (rules and defaults)", () => {
    const decision = resolveModelRouting({
      config: {
        model: "claude-opus-4-7",
        effort: "xhigh",
        modelRouting: [
          { when: { taskKind: "comment" }, model: "claude-haiku-4-5-20251001", effort: "low" },
        ],
      },
      taskKind: "comment",
      forceModel: "claude-sonnet-4-6",
      forceEffort: "medium",
    });
    expect(decision).toEqual({
      model: "claude-sonnet-4-6",
      effort: "medium",
      matchedRuleIndex: -1,
      source: "forceModel",
      taskKind: "comment",
    });
  });

  it("forceModel inherits default effort when forceEffort is absent", () => {
    const decision = resolveModelRouting({
      config: { model: "claude-opus-4-7", effort: "xhigh" },
      forceModel: "claude-sonnet-4-6",
    });
    expect(decision?.source).toBe("forceModel");
    expect(decision?.effort).toBe("xhigh");
  });

  it("ignores malformed modelRouting and falls back to default", () => {
    const decision = resolveModelRouting({
      config: {
        model: "claude-opus-4-7",
        modelRouting: "not-an-array",
      } as unknown as Record<string, unknown>,
      taskKind: "comment",
    });
    expect(decision?.source).toBe("default");
    expect(decision?.model).toBe("claude-opus-4-7");
  });

  it("ignores unknown predicate keys (forwards-compat)", () => {
    const decision = resolveModelRouting({
      config: {
        model: "claude-opus-4-7",
        modelRouting: [
          {
            when: { taskKind: "comment", futureKey: "ignore-me" },
            model: "claude-haiku-4-5-20251001",
          },
        ],
      },
      taskKind: "comment",
    });
    expect(decision?.model).toBe("claude-haiku-4-5-20251001");
  });
});

describe("applyModelRoutingDecision", () => {
  it("mutates model and effort in place", () => {
    const cfg: Record<string, unknown> = { model: "x", effort: "y", other: "keep" };
    applyModelRoutingDecision(cfg, {
      model: "new-model",
      effort: "new-effort",
      matchedRuleIndex: 0,
      source: "rule",
      taskKind: "code",
    });
    expect(cfg.model).toBe("new-model");
    expect(cfg.effort).toBe("new-effort");
    expect(cfg.other).toBe("keep");
  });

  it("does nothing when decision is null", () => {
    const cfg: Record<string, unknown> = { model: "x", effort: "y" };
    applyModelRoutingDecision(cfg, null);
    expect(cfg).toEqual({ model: "x", effort: "y" });
  });

  it("leaves effort untouched when decision omits it", () => {
    const cfg: Record<string, unknown> = { model: "x", effort: "keep-me" };
    applyModelRoutingDecision(cfg, {
      model: "new",
      matchedRuleIndex: null,
      source: "default",
      taskKind: null,
    });
    expect(cfg.model).toBe("new");
    expect(cfg.effort).toBe("keep-me");
  });
});
