import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverOllamaModels,
  discoverOllamaModelsCached,
  resetOllamaModelsCacheForTests,
} from "./models.js";

interface FakeOptions {
  host: string;
  headers?: Record<string, string>;
}

interface FakeListResponse {
  models?: Array<{ name?: string; model?: string; details?: { parameter_size?: string } }>;
}

class FakeOllama {
  static byHost = new Map<string, () => Promise<FakeListResponse> | FakeListResponse>();
  static reset() {
    FakeOllama.byHost.clear();
    FakeOllama.constructed = [];
  }
  static constructed: FakeOptions[] = [];
  host: string;
  headers?: Record<string, string>;
  constructor(opts: FakeOptions) {
    this.host = opts.host;
    this.headers = opts.headers;
    FakeOllama.constructed.push({ host: opts.host, headers: opts.headers });
  }
  async list(): Promise<FakeListResponse> {
    const handler = FakeOllama.byHost.get(this.host);
    if (!handler) return { models: [] };
    const result = handler();
    return result instanceof Promise ? await result : result;
  }
}

afterEach(() => {
  FakeOllama.reset();
  resetOllamaModelsCacheForTests();
});

describe("discoverOllamaModels", () => {
  it("queries only the primary host when there is no api key", async () => {
    FakeOllama.byHost.set("http://localhost:11434", () => ({
      models: [{ name: "llama3.1" }, { name: "qwen2.5" }],
    }));

    const result = await discoverOllamaModels({
      host: "http://localhost:11434",
      apiKey: null,
      ollamaCtor: FakeOllama as unknown as typeof import("ollama").Ollama,
    });

    expect(FakeOllama.constructed).toHaveLength(1);
    expect(FakeOllama.constructed[0]?.host).toBe("http://localhost:11434");
    expect(FakeOllama.constructed[0]?.headers).toBeUndefined();
    expect(result.map((m) => m.id)).toEqual(["llama3.1", "qwen2.5"]);
  });

  it("merges cloud results when host is local and apiKey is set", async () => {
    FakeOllama.byHost.set("http://localhost:11434", () => ({
      models: [{ name: "llama3.1" }],
    }));
    FakeOllama.byHost.set("https://ollama.com", () => ({
      models: [{ name: "kimi-k2.6:cloud" }, { name: "deepseek-v4:cloud" }],
    }));

    const result = await discoverOllamaModels({
      host: "http://localhost:11434",
      apiKey: "sk-test",
      ollamaCtor: FakeOllama as unknown as typeof import("ollama").Ollama,
    });

    expect(FakeOllama.constructed).toHaveLength(2);
    const cloudCtor = FakeOllama.constructed[1];
    expect(cloudCtor?.host).toBe("https://ollama.com");
    expect(cloudCtor?.headers).toEqual({ Authorization: "Bearer sk-test" });

    expect(result.map((m) => m.id)).toEqual([
      "deepseek-v4:cloud",
      "kimi-k2.6:cloud",
      "llama3.1",
    ]);
    const cloudEntry = result.find((m) => m.id === "kimi-k2.6:cloud");
    expect(cloudEntry?.label).toContain("(cloud)");
  });

  it("does not double-query the cloud when host is already cloud", async () => {
    FakeOllama.byHost.set("https://ollama.com", () => ({
      models: [{ name: "gpt-oss:120b" }],
    }));
    const result = await discoverOllamaModels({
      host: "https://ollama.com",
      apiKey: "sk-test",
      ollamaCtor: FakeOllama as unknown as typeof import("ollama").Ollama,
    });
    expect(FakeOllama.constructed).toHaveLength(1);
    expect(FakeOllama.constructed[0]?.host).toBe("https://ollama.com");
    expect(FakeOllama.constructed[0]?.headers).toEqual({
      Authorization: "Bearer sk-test",
    });
    expect(result.map((m) => m.id)).toEqual(["gpt-oss:120b"]);
  });

  it("dedupes overlapping ids from local and cloud", async () => {
    FakeOllama.byHost.set("http://localhost:11434", () => ({
      models: [{ name: "shared" }, { name: "local-only" }],
    }));
    FakeOllama.byHost.set("https://ollama.com", () => ({
      models: [{ name: "shared" }, { name: "cloud-only" }],
    }));
    const result = await discoverOllamaModels({
      host: "http://localhost:11434",
      apiKey: "sk-test",
      ollamaCtor: FakeOllama as unknown as typeof import("ollama").Ollama,
    });
    expect(result.map((m) => m.id)).toEqual(["cloud-only", "local-only", "shared"]);
  });

  it("tolerates a primary failure when the cloud list succeeds", async () => {
    FakeOllama.byHost.set("http://localhost:11434", () => {
      throw new Error("ECONNREFUSED");
    });
    FakeOllama.byHost.set("https://ollama.com", () => ({
      models: [{ name: "kimi-k2.6:cloud" }],
    }));
    const result = await discoverOllamaModels({
      host: "http://localhost:11434",
      apiKey: "sk-test",
      ollamaCtor: FakeOllama as unknown as typeof import("ollama").Ollama,
    });
    expect(result.map((m) => m.id)).toEqual(["kimi-k2.6:cloud"]);
  });

  it("throws when *every* source fails", async () => {
    FakeOllama.byHost.set("http://localhost:11434", () => {
      throw new Error("ECONNREFUSED");
    });
    FakeOllama.byHost.set("https://ollama.com", () => {
      throw new Error("401 Unauthorized");
    });
    await expect(
      discoverOllamaModels({
        host: "http://localhost:11434",
        apiKey: "sk-bad",
        ollamaCtor: FakeOllama as unknown as typeof import("ollama").Ollama,
      }),
    ).rejects.toThrow(/discovery failed/i);
  });

  it("accepts entries that use `model` instead of `name`", async () => {
    FakeOllama.byHost.set("http://localhost:11434", () => ({
      models: [{ model: "phi-mini" }],
    }));
    const result = await discoverOllamaModels({
      host: "http://localhost:11434",
      apiKey: null,
      ollamaCtor: FakeOllama as unknown as typeof import("ollama").Ollama,
    });
    expect(result.map((m) => m.id)).toEqual(["phi-mini"]);
  });
});

describe("discoverOllamaModelsCached", () => {
  it("hits the SDK only once within the TTL", async () => {
    const handler = vi
      .fn()
      .mockReturnValue({ models: [{ name: "llama3.1" }] });
    FakeOllama.byHost.set("http://localhost:11434", handler);

    await discoverOllamaModelsCached({
      host: "http://localhost:11434",
      apiKey: null,
      ollamaCtor: FakeOllama as unknown as typeof import("ollama").Ollama,
    });
    await discoverOllamaModelsCached({
      host: "http://localhost:11434",
      apiKey: null,
      ollamaCtor: FakeOllama as unknown as typeof import("ollama").Ollama,
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("uses a separate cache slot when apiKey changes", async () => {
    const handler = vi
      .fn()
      .mockReturnValue({ models: [{ name: "llama3.1" }] });
    FakeOllama.byHost.set("http://localhost:11434", handler);
    FakeOllama.byHost.set("https://ollama.com", () => ({
      models: [{ name: "cloud-only" }],
    }));

    await discoverOllamaModelsCached({
      host: "http://localhost:11434",
      apiKey: null,
      ollamaCtor: FakeOllama as unknown as typeof import("ollama").Ollama,
    });
    await discoverOllamaModelsCached({
      host: "http://localhost:11434",
      apiKey: "sk-1",
      ollamaCtor: FakeOllama as unknown as typeof import("ollama").Ollama,
    });
    // Local handler is hit twice (separate cache key per hasKey state).
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
