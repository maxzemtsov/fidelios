import { afterEach, describe, expect, it } from "vitest";
import { isOllamaAuthRequiredText, testEnvironment } from "./test.js";
import { resetOllamaModelsCacheForTests } from "./models.js";

interface FakeOptions {
  host: string;
  headers?: Record<string, string>;
}

interface ChatPart {
  message?: { content?: string };
}

interface FakeBehavior {
  version?: () => Promise<{ version: string }> | { version: string } | never;
  list?: () => Promise<{ models: Array<{ name: string }> }> | { models: Array<{ name: string }> } | never;
  chat?: () => AsyncIterable<ChatPart> | never;
}

class FakeOllama {
  static behaviors = new Map<string, FakeBehavior>();
  host: string;
  headers?: Record<string, string>;
  constructor(opts: FakeOptions) {
    this.host = opts.host;
    this.headers = opts.headers;
  }
  async version() {
    const b = FakeOllama.behaviors.get(this.host);
    if (!b?.version) return { version: "0.0.0" };
    return b.version();
  }
  async list() {
    const b = FakeOllama.behaviors.get(this.host);
    if (!b?.list) return { models: [] };
    return b.list();
  }
  async chat() {
    const b = FakeOllama.behaviors.get(this.host);
    if (!b?.chat) {
      async function* empty() {}
      return empty();
    }
    return b.chat();
  }
}

afterEach(() => {
  FakeOllama.behaviors.clear();
  resetOllamaModelsCacheForTests();
});

async function* helloStream(): AsyncIterable<ChatPart> {
  yield { message: { content: "hello" } };
}

const ctor = FakeOllama as unknown as typeof import("ollama").Ollama;

describe("isOllamaAuthRequiredText", () => {
  it.each([
    "401 Unauthorized",
    "Forbidden",
    "Invalid api key",
    "missing token",
    "Please sign in to continue",
    "rate limit exceeded",
    "Quota exceeded",
    "payment required",
  ])("flags %s as auth/quota gate", (text) => {
    expect(isOllamaAuthRequiredText(text)).toBe(true);
  });

  it.each(["ECONNREFUSED", "Connection reset", "model not found"])(
    "ignores generic transport errors like %s",
    (text) => {
      expect(isOllamaAuthRequiredText(text)).toBe(false);
    },
  );
});

describe("testEnvironment", () => {
  it("fails fast when config is invalid", async () => {
    const result = await testEnvironment(
      { adapterType: "ollama_local", companyId: "c", config: {} },
      { ollamaCtor: ctor },
    );
    expect(result.status).toBe("fail");
    const code = result.checks[0]?.code;
    expect(code).toBe("ollama_config_invalid");
  });

  it("returns pass when version, tags, and hello probe all succeed", async () => {
    FakeOllama.behaviors.set("http://localhost:11434", {
      version: () => ({ version: "0.5.0" }),
      list: () => ({ models: [{ name: "llama3.1" }] }),
      chat: () => helloStream(),
    });

    const result = await testEnvironment(
      {
        adapterType: "ollama_local",
        companyId: "c",
        config: { model: "llama3.1" },
      },
      { ollamaCtor: ctor },
    );
    expect(result.status).toBe("pass");
    const codes = result.checks.map((c) => c.code);
    expect(codes).toContain("ollama_version_ok");
    expect(codes).toContain("ollama_models_discovered");
    expect(codes).toContain("ollama_model_configured");
    expect(codes).toContain("ollama_hello_probe_passed");
  });

  it("flags configured tier as informational", async () => {
    FakeOllama.behaviors.set("http://localhost:11434", {
      version: () => ({ version: "0.5.0" }),
      list: () => ({ models: [{ name: "llama3.1" }] }),
      chat: () => helloStream(),
    });
    const result = await testEnvironment(
      {
        adapterType: "ollama_local",
        companyId: "c",
        config: { model: "llama3.1", ollamaTier: "pro" },
      },
      { ollamaCtor: ctor },
    );
    const tierCheck = result.checks.find((c) => c.code === "ollama_tier_configured");
    expect(tierCheck?.message).toMatch(/pro/);
    expect(tierCheck?.hint).toMatch(/concurrency cap applies to cloud models only/i);
  });

  it("warns when configured model is missing from /api/tags", async () => {
    FakeOllama.behaviors.set("http://localhost:11434", {
      version: () => ({ version: "0.5.0" }),
      list: () => ({ models: [{ name: "qwen" }] }),
      chat: () => helloStream(),
    });
    const result = await testEnvironment(
      {
        adapterType: "ollama_local",
        companyId: "c",
        config: { model: "missing-model" },
      },
      { ollamaCtor: ctor },
    );
    expect(result.status).toBe("warn");
    expect(result.checks.find((c) => c.code === "ollama_model_not_found")).toBeTruthy();
  });

  it("flags auth-required errors instead of marking the daemon unreachable", async () => {
    FakeOllama.behaviors.set("https://ollama.com", {
      version: () => {
        throw new Error("401 Unauthorized — invalid api key");
      },
    });
    const result = await testEnvironment(
      {
        adapterType: "ollama_local",
        companyId: "c",
        config: { model: "kimi-k2.6:cloud", host: "https://ollama.com" },
      },
      { ollamaCtor: ctor },
    );
    expect(result.checks.find((c) => c.code === "ollama_version_auth_required")).toBeTruthy();
  });

  it("returns fail when the daemon is unreachable", async () => {
    FakeOllama.behaviors.set("http://localhost:11434", {
      version: () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const result = await testEnvironment(
      {
        adapterType: "ollama_local",
        companyId: "c",
        config: { model: "llama3.1" },
      },
      { ollamaCtor: ctor },
    );
    expect(result.status).toBe("fail");
    const versionCheck = result.checks.find((c) => c.code === "ollama_version_unreachable");
    expect(versionCheck).toBeTruthy();
    // hello probe must be skipped, never run, when version failed
    expect(result.checks.find((c) => c.code === "ollama_hello_probe_skipped")).toBeTruthy();
  });

  it("classifies hello-probe auth failure as auth_required", async () => {
    FakeOllama.behaviors.set("http://localhost:11434", {
      version: () => ({ version: "0.5.0" }),
      list: () => ({ models: [{ name: "llama3.1" }] }),
      chat: () => {
        throw new Error("Invalid api key for this model");
      },
    });
    const result = await testEnvironment(
      {
        adapterType: "ollama_local",
        companyId: "c",
        config: { model: "llama3.1" },
      },
      { ollamaCtor: ctor },
    );
    expect(
      result.checks.find((c) => c.code === "ollama_hello_probe_auth_required"),
    ).toBeTruthy();
  });
});
