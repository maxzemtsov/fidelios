import { describe, expect, it } from "vitest";
import { modelRoutingSchema, type ModelRoutingRule } from "@fideliosai/shared";
import {
  addRule,
  emptyRule,
  isRuleInvalid,
  moveRule,
  removeRule,
  rulesFromConfig,
  rulesToConfig,
  updateRule,
} from "./model-routing-rules";

describe("model-routing-rules", () => {
  it("normalizes legacy/partial config into a clean rule list", () => {
    const config = [
      { when: { taskKind: "code" }, model: "claude-opus-4-6", effort: "high" },
      { when: null, model: "gpt-5" },
      { when: { agentRole: "engineer" }, model: "" },
      "junk",
      null,
      { model: "drop-this-no-when" },
    ];
    const rules = rulesFromConfig(config);
    expect(rules).toEqual([
      { when: { taskKind: "code" }, model: "claude-opus-4-6", effort: "high" },
      { when: {}, model: "gpt-5" },
      { when: { agentRole: "engineer" }, model: "" },
      { when: {}, model: "drop-this-no-when" },
    ]);
  });

  it("returns empty list for non-array values", () => {
    expect(rulesFromConfig(undefined)).toEqual([]);
    expect(rulesFromConfig({})).toEqual([]);
    expect(rulesFromConfig("nope")).toEqual([]);
  });

  it("round-trips a valid rule list through shared schema", () => {
    const initial = [
      { when: { taskKind: "comment" }, model: "claude-haiku-4-5" },
      { when: { agentRole: "engineer", taskKind: "code" }, model: "claude-opus-4-6", effort: "high" },
    ];
    const rules = rulesFromConfig(initial);
    const out = rulesToConfig(rules);
    expect(out).toEqual(initial);
    // Server schema must accept the round-tripped value.
    expect(() => modelRoutingSchema.parse(out)).not.toThrow();
  });

  it("returns undefined when the working list is empty", () => {
    expect(rulesToConfig([])).toBeUndefined();
  });

  it("supports add/remove/move/update flows", () => {
    let rules = [emptyRule()];
    rules = updateRule(rules, 0, { taskKind: "code", model: "claude-opus-4-6" });
    rules = addRule(rules);
    rules = updateRule(rules, 1, { taskKind: "comment", model: "claude-haiku-4-5" });
    expect(rules).toHaveLength(2);

    rules = moveRule(rules, 1, "up");
    expect(rules[0]?.when.taskKind).toBe("comment");
    expect(rules[1]?.when.taskKind).toBe("code");

    rules = removeRule(rules, 0);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.when.taskKind).toBe("code");
  });

  it("clears predicate fields when an empty selection is chosen", () => {
    let rules: ModelRoutingRule[] = [
      { when: { taskKind: "code", agentRole: "engineer" }, model: "x" },
    ];
    rules = updateRule(rules, 0, { taskKind: undefined });
    expect(rules[0]?.when.taskKind).toBeUndefined();
    expect(rules[0]?.when.agentRole).toBe("engineer");
    rules = updateRule(rules, 0, { agentRole: undefined });
    expect(rules[0]?.when).toEqual({});
  });

  it("flags rules with empty models as invalid", () => {
    expect(isRuleInvalid({ when: {}, model: "" })).toBe(true);
    expect(isRuleInvalid({ when: {}, model: "  " })).toBe(true);
    expect(isRuleInvalid({ when: {}, model: "claude-opus-4-6" })).toBe(false);
  });

  it("ignores out-of-range indices for mutating helpers", () => {
    const rules = [emptyRule()];
    expect(removeRule(rules, 5)).toBe(rules);
    expect(moveRule(rules, 0, "up")).toBe(rules);
    expect(moveRule(rules, 0, "down")).toBe(rules);
    expect(updateRule(rules, 5, { model: "x" })).toBe(rules);
  });
});
