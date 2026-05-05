import { describe, expect, it } from "vitest";
import {
  modelRoutingPredicateSchema,
  modelRoutingRuleSchema,
  modelRoutingSchema,
  createAgentSchema,
} from "@fideliosai/shared";

describe("modelRoutingPredicateSchema", () => {
  it("accepts an empty predicate (catch-all)", () => {
    expect(modelRoutingPredicateSchema.parse({})).toEqual({});
  });

  it("validates known taskKind/agentRole values", () => {
    const out = modelRoutingPredicateSchema.parse({ taskKind: "comment", agentRole: "ceo" });
    expect(out).toMatchObject({ taskKind: "comment", agentRole: "ceo" });
  });

  it("rejects an invalid taskKind", () => {
    expect(() =>
      modelRoutingPredicateSchema.parse({ taskKind: "not-a-kind" }),
    ).toThrow();
  });

  it("preserves unknown predicate keys (forwards-compat)", () => {
    const out = modelRoutingPredicateSchema.parse({
      taskKind: "code",
      fileChangeEstimate: ">200",
    });
    expect(out).toMatchObject({ taskKind: "code", fileChangeEstimate: ">200" });
  });
});

describe("modelRoutingRuleSchema", () => {
  it("requires a model", () => {
    expect(() => modelRoutingRuleSchema.parse({ when: {} })).toThrow();
  });

  it("requires non-empty model", () => {
    expect(() =>
      modelRoutingRuleSchema.parse({ when: {}, model: "   " }),
    ).toThrow();
  });

  it("accepts a minimal rule", () => {
    expect(
      modelRoutingRuleSchema.parse({ when: { taskKind: "comment" }, model: "claude-haiku-4-5-20251001" }),
    ).toEqual({ when: { taskKind: "comment" }, model: "claude-haiku-4-5-20251001" });
  });
});

describe("modelRoutingSchema", () => {
  it("caps the rule list at 20 entries", () => {
    const oversized = Array.from({ length: 21 }, () => ({
      when: {},
      model: "claude-opus-4-7",
    }));
    expect(() => modelRoutingSchema.parse(oversized)).toThrow();
  });
});

describe("createAgentSchema integration", () => {
  it("accepts adapterConfig.modelRouting when valid", () => {
    const parsed = createAgentSchema.parse({
      name: "test-agent",
      adapterConfig: {
        model: "claude-opus-4-7",
        effort: "xhigh",
        modelRouting: [
          { when: { taskKind: "comment" }, model: "claude-haiku-4-5-20251001", effort: "low" },
          { when: { taskKind: "code" }, model: "claude-opus-4-7", effort: "xhigh" },
        ],
      },
    });
    const routing = (parsed.adapterConfig as Record<string, unknown>).modelRouting as unknown[];
    expect(routing).toHaveLength(2);
  });

  it("rejects malformed modelRouting in adapterConfig", () => {
    expect(() =>
      createAgentSchema.parse({
        name: "test-agent",
        adapterConfig: { modelRouting: "not-an-array" },
      }),
    ).toThrow();
  });
});
