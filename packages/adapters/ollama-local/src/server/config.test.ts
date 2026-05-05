import { describe, expect, it } from "vitest";
import {
  CLOUD_HOST,
  DEFAULT_HOST,
  DEFAULT_TIMEOUT_SEC,
  buildOllamaHeaders,
  isCloudHost,
  parseOllamaConfig,
} from "./config.js";

describe("parseOllamaConfig", () => {
  it("requires a model", () => {
    expect(() => parseOllamaConfig({})).toThrow(/requires.*model/i);
    expect(() => parseOllamaConfig({ model: "" })).toThrow(/requires.*model/i);
    expect(() => parseOllamaConfig({ model: "   " })).toThrow(/requires.*model/i);
  });

  it("applies defaults for optional fields", () => {
    const cfg = parseOllamaConfig({ model: "llama3.1" });
    expect(cfg.model).toBe("llama3.1");
    expect(cfg.host).toBe(DEFAULT_HOST);
    expect(cfg.apiKey).toBeNull();
    expect(cfg.keepAlive).toBeNull();
    expect(cfg.numCtx).toBeNull();
    expect(cfg.think).toBeNull();
    expect(cfg.ollamaTier).toBeNull();
    expect(cfg.timeoutSec).toBe(DEFAULT_TIMEOUT_SEC);
  });

  it("normalizes the host (strips trailing slashes)", () => {
    expect(parseOllamaConfig({ model: "x", host: "http://host:1234/" }).host).toBe(
      "http://host:1234",
    );
    expect(parseOllamaConfig({ model: "x", host: "https://ollama.com//" }).host).toBe(
      "https://ollama.com",
    );
  });

  it("reads OLLAMA_API_KEY from env.plain bindings", () => {
    const cfg = parseOllamaConfig({
      model: "x",
      env: { OLLAMA_API_KEY: { type: "plain", value: "sk-test" } },
    });
    expect(cfg.apiKey).toBe("sk-test");
  });

  it("reads OLLAMA_API_KEY as a raw string in env", () => {
    const cfg = parseOllamaConfig({
      model: "x",
      env: { OLLAMA_API_KEY: "raw-key" },
    });
    expect(cfg.apiKey).toBe("raw-key");
  });

  it("falls back to top-level apiKey when env binding missing", () => {
    const cfg = parseOllamaConfig({ model: "x", apiKey: "top-key" });
    expect(cfg.apiKey).toBe("top-key");
  });

  it("parses think option strings and booleans", () => {
    expect(parseOllamaConfig({ model: "x", think: true }).think).toBe(true);
    expect(parseOllamaConfig({ model: "x", think: "high" }).think).toBe("high");
    expect(parseOllamaConfig({ model: "x", think: "MEDIUM" }).think).toBe("medium");
    expect(parseOllamaConfig({ model: "x", think: "low" }).think).toBe("low");
    expect(parseOllamaConfig({ model: "x", think: "garbage" }).think).toBeNull();
  });

  it("accepts numeric and string keepAlive", () => {
    expect(parseOllamaConfig({ model: "x", keepAlive: "10m" }).keepAlive).toBe("10m");
    expect(parseOllamaConfig({ model: "x", keepAlive: 600 }).keepAlive).toBe(600);
    expect(parseOllamaConfig({ model: "x", keepAlive: "" }).keepAlive).toBeNull();
  });

  it("clamps timeoutSec to a positive default", () => {
    expect(parseOllamaConfig({ model: "x", timeoutSec: 0 }).timeoutSec).toBe(
      DEFAULT_TIMEOUT_SEC,
    );
    expect(parseOllamaConfig({ model: "x", timeoutSec: -5 }).timeoutSec).toBe(
      DEFAULT_TIMEOUT_SEC,
    );
    expect(parseOllamaConfig({ model: "x", timeoutSec: 90 }).timeoutSec).toBe(90);
  });

  it("captures ollamaTier verbatim", () => {
    expect(parseOllamaConfig({ model: "x", ollamaTier: "pro" }).ollamaTier).toBe("pro");
    expect(parseOllamaConfig({ model: "x", ollamaTier: "  team  " }).ollamaTier).toBe(
      "team",
    );
  });
});

describe("buildOllamaHeaders", () => {
  it("returns undefined when no key", () => {
    expect(buildOllamaHeaders(null)).toBeUndefined();
  });

  it("formats Authorization: Bearer <key>", () => {
    expect(buildOllamaHeaders("k1")).toEqual({ Authorization: "Bearer k1" });
  });
});

describe("isCloudHost", () => {
  it("recognizes ollama.com variants", () => {
    expect(isCloudHost(CLOUD_HOST)).toBe(true);
    expect(isCloudHost("https://ollama.com/")).toBe(true);
    expect(isCloudHost("https://ollama.com/api")).toBe(true);
    expect(isCloudHost("http://ollama.com")).toBe(true);
  });

  it("treats local daemons as non-cloud", () => {
    expect(isCloudHost("http://localhost:11434")).toBe(false);
    expect(isCloudHost("http://127.0.0.1:11434")).toBe(false);
    expect(isCloudHost("http://my-ollama-proxy.internal")).toBe(false);
  });
});
