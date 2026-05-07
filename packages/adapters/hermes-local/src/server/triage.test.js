import { describe, it, expect, vi } from "vitest";
import {
  buildTriageSystemPrompt,
  filterToolsetNames,
  parseTriageJson,
  triageToolsets,
} from "./triage.js";
import {
  HERMES_TOOLSET_REGISTRY,
  SAFE_DEFAULT_TOOLSETS,
} from "./toolset-registry.js";

// ---------- pure helpers ----------

describe("buildTriageSystemPrompt", () => {
  it("includes every registry name and description", () => {
    const prompt = buildTriageSystemPrompt(HERMES_TOOLSET_REGISTRY);
    for (const entry of HERMES_TOOLSET_REGISTRY) {
      expect(prompt).toContain(entry.name);
      expect(prompt).toContain(entry.description);
    }
  });

  it("instructs the model to emit JSON in the documented shape", () => {
    const prompt = buildTriageSystemPrompt(HERMES_TOOLSET_REGISTRY);
    expect(prompt).toMatch(/"toolsets"/);
    expect(prompt).toMatch(/JSON only/i);
  });
});

describe("parseTriageJson", () => {
  it("parses a clean JSON object with toolsets array", () => {
    const result = parseTriageJson('{"toolsets":["file","web"]}');
    expect(result).toEqual(["file", "web"]);
  });

  it("accepts the alias field `tools`", () => {
    const result = parseTriageJson('{"tools":["terminal"]}');
    expect(result).toEqual(["terminal"]);
  });

  it("accepts the alias field `selected`", () => {
    const result = parseTriageJson('{"selected":["memory"]}');
    expect(result).toEqual(["memory"]);
  });

  it("extracts the first JSON object when wrapped in surrounding prose", () => {
    const result = parseTriageJson('Sure! Here you go:\n{"toolsets":["file"]}\n— end.');
    expect(result).toEqual(["file"]);
  });

  it("returns null for unparseable content", () => {
    expect(parseTriageJson("nope, not json at all")).toBeNull();
  });

  it("returns null when the toolsets value is not an array", () => {
    expect(parseTriageJson('{"toolsets":"file"}')).toBeNull();
  });

  it("returns null for empty / non-string input", () => {
    expect(parseTriageJson("")).toBeNull();
    expect(parseTriageJson("   ")).toBeNull();
    expect(parseTriageJson(null)).toBeNull();
    expect(parseTriageJson(undefined)).toBeNull();
  });

  it("drops non-string entries", () => {
    const result = parseTriageJson('{"toolsets":["file",123,null,"web"]}');
    expect(result).toEqual(["file", "web"]);
  });
});

describe("filterToolsetNames", () => {
  it("keeps only registry-known names", () => {
    expect(filterToolsetNames(["file", "fake_tool", "web"])).toEqual(["file", "web"]);
  });

  it("dedupes while preserving order", () => {
    expect(filterToolsetNames(["file", "web", "file", "web"])).toEqual(["file", "web"]);
  });

  it("trims whitespace before matching", () => {
    expect(filterToolsetNames(["  file  ", "\tweb\n"])).toEqual(["file", "web"]);
  });

  it("rejects empty / non-string entries", () => {
    expect(filterToolsetNames(["", "  ", null, undefined, 1, "file"])).toEqual(["file"]);
  });

  it("returns [] when nothing is recognized", () => {
    expect(filterToolsetNames(["foo", "bar"])).toEqual([]);
  });
});

// ---------- triageToolsets (mocked Ollama) ----------

function makeFakeClient(impl) {
  return { chat: vi.fn(impl) };
}

describe("triageToolsets — happy path", () => {
  it("returns the LLM-selected subset filtered against the registry", async () => {
    const client = makeFakeClient(async () => ({
      message: { content: '{"toolsets":["file","web","made_up"]}' },
    }));

    const result = await triageToolsets({
      prompt: "Read README.md and summarize",
      model: "qwen3:4b",
      client,
    });

    expect(client.chat).toHaveBeenCalledTimes(1);
    expect(result.toolsets).toEqual(["file", "web"]);
    expect(result.usedFallback).toBe(false);
    expect(result.error).toBeUndefined();
    expect(typeof result.durationMs).toBe("number");
  });

  it("forwards the configured model and JSON format to Ollama.chat", async () => {
    const client = makeFakeClient(async () => ({
      message: { content: '{"toolsets":["file"]}' },
    }));

    await triageToolsets({
      prompt: "p",
      model: "qwen3:4b",
      client,
    });

    const call = client.chat.mock.calls[0][0];
    expect(call.model).toBe("qwen3:4b");
    expect(call.format).toBe("json");
    expect(call.stream).toBe(false);
    expect(Array.isArray(call.messages)).toBe(true);
    expect(call.messages[0].role).toBe("system");
    expect(call.messages[1].role).toBe("user");
  });

  it("truncates very long prompts to keep the router input bounded", async () => {
    const client = makeFakeClient(async () => ({
      message: { content: '{"toolsets":["file"]}' },
    }));
    const huge = "x".repeat(10_000);

    await triageToolsets({ prompt: huge, model: "qwen3:4b", client });

    const userMsg = client.chat.mock.calls[0][0].messages[1].content;
    // 4000-char cap + small "Task:\n" prefix
    expect(userMsg.length).toBeLessThanOrEqual(4100);
  });
});

describe("triageToolsets — fallback paths", () => {
  it("falls back to safe defaults when no model is provided", async () => {
    const result = await triageToolsets({ prompt: "p", model: "" });
    expect(result.usedFallback).toBe(true);
    expect(result.toolsets).toEqual([...SAFE_DEFAULT_TOOLSETS]);
    expect(result.error).toMatch(/no model/i);
  });

  it("falls back when the LLM call throws", async () => {
    const client = makeFakeClient(async () => {
      throw new Error("connection refused");
    });

    const result = await triageToolsets({
      prompt: "p",
      model: "qwen3:4b",
      client,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.toolsets).toEqual([...SAFE_DEFAULT_TOOLSETS]);
    expect(result.error).toMatch(/connection refused/);
  });

  it("falls back when the LLM returns invalid JSON", async () => {
    const client = makeFakeClient(async () => ({
      message: { content: "I am sorry I cannot comply." },
    }));

    const result = await triageToolsets({
      prompt: "p",
      model: "qwen3:4b",
      client,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.error).toMatch(/not valid JSON/i);
  });

  it("falls back when LLM picks zero known toolsets", async () => {
    const client = makeFakeClient(async () => ({
      message: { content: '{"toolsets":["bogus","also_bogus"]}' },
    }));

    const result = await triageToolsets({
      prompt: "p",
      model: "qwen3:4b",
      client,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.error).toMatch(/no known toolsets/i);
  });

  it("falls back when the LLM call exceeds the timeout", async () => {
    const client = makeFakeClient(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    const result = await triageToolsets({
      prompt: "p",
      model: "qwen3:4b",
      client,
      timeoutMs: 10,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.error).toMatch(/timed out/i);
  }, 1000);
});

describe("triageToolsets — registry override", () => {
  it("respects a custom registry/fallback pair end-to-end", async () => {
    const customRegistry = [
      { name: "alpha", description: "alpha tool" },
      { name: "beta", description: "beta tool" },
    ];
    const client = makeFakeClient(async () => ({
      message: { content: '{"toolsets":["beta","gamma"]}' },
    }));

    const result = await triageToolsets({
      prompt: "p",
      model: "qwen3:4b",
      client,
      registry: customRegistry,
      fallback: ["alpha"],
    });

    expect(result.usedFallback).toBe(false);
    expect(result.toolsets).toEqual(["beta"]);
  });

  it("filters fallback list against the supplied registry too", async () => {
    const customRegistry = [{ name: "alpha", description: "a" }];
    const client = makeFakeClient(async () => {
      throw new Error("offline");
    });

    const result = await triageToolsets({
      prompt: "p",
      model: "qwen3:4b",
      client,
      registry: customRegistry,
      fallback: ["alpha", "not_in_custom_registry"],
    });

    expect(result.usedFallback).toBe(true);
    expect(result.toolsets).toEqual(["alpha"]);
  });
});
