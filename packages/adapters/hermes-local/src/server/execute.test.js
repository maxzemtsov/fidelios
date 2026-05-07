import { describe, it, expect, vi, beforeEach } from "vitest";

// Module mocks must be declared before importing the SUT.
const runChildProcessMock = vi.fn();
const triageToolsetsMock = vi.fn();

vi.mock("@fideliosai/adapter-utils/server-utils", async () => {
  const actual = await vi.importActual(
    "@fideliosai/adapter-utils/server-utils"
  );
  return {
    ...actual,
    runChildProcess: (...args) => runChildProcessMock(...args),
    ensureAbsoluteDirectory: vi.fn(async () => undefined),
  };
});

vi.mock("./triage.js", () => ({
  triageToolsets: (...args) => triageToolsetsMock(...args),
}));

const { execute } = await import("./execute.js");

function makeCtx(overrides = {}) {
  const logs = [];
  const ctx = {
    runId: "run-1",
    authToken: "tok",
    agent: {
      id: "agent-1",
      companyId: "co-1",
      name: "TestAgent",
      adapterConfig: {
        hermesCommand: "echo", // anything; we mock runChildProcess
        model: "qwen3:4b",
        ...overrides.adapterConfig,
      },
    },
    config: {
      ...overrides.config,
    },
    runtime: {},
    onLog: async (stream, chunk) => {
      logs.push({ stream, chunk });
    },
  };
  return { ctx, logs };
}

beforeEach(() => {
  runChildProcessMock.mockReset();
  triageToolsetsMock.mockReset();
  runChildProcessMock.mockResolvedValue({
    stdout: "ok\n\nsession_id: sess-1\n",
    stderr: "",
    exitCode: 0,
    signal: null,
    timedOut: false,
  });
});

function getArgs() {
  expect(runChildProcessMock).toHaveBeenCalledTimes(1);
  // (runId, cmd, args, opts)
  return runChildProcessMock.mock.calls[0][2];
}

function findToolsetsArg(args) {
  const idx = args.indexOf("-t");
  return idx === -1 ? null : args[idx + 1];
}

describe("execute: explicit toolsets bypass triage (backwards-compat)", () => {
  it("respects adapterConfig.toolsets and never calls triage", async () => {
    const { ctx } = makeCtx({
      adapterConfig: { toolsets: "file,terminal" },
    });

    await execute(ctx);

    expect(triageToolsetsMock).not.toHaveBeenCalled();
    expect(findToolsetsArg(getArgs())).toBe("file,terminal");
  });

  it("respects adapterConfig.enabledToolsets array form", async () => {
    const { ctx } = makeCtx({
      adapterConfig: { enabledToolsets: ["file", "web"] },
    });

    await execute(ctx);

    expect(triageToolsetsMock).not.toHaveBeenCalled();
    expect(findToolsetsArg(getArgs())).toBe("file,web");
  });

  it("does not invoke triage when triageEnabled === false", async () => {
    const { ctx } = makeCtx({
      adapterConfig: { triageEnabled: false },
    });

    await execute(ctx);

    expect(triageToolsetsMock).not.toHaveBeenCalled();
    // No -t flag — Hermes will use its default enabled set.
    expect(findToolsetsArg(getArgs())).toBeNull();
  });
});

describe("execute: auto-triage path", () => {
  it("calls triage with the configured model when toolsets is unset", async () => {
    triageToolsetsMock.mockResolvedValue({
      toolsets: ["file", "terminal"],
      usedFallback: false,
      durationMs: 42,
    });

    const { ctx } = makeCtx();

    await execute(ctx);

    expect(triageToolsetsMock).toHaveBeenCalledTimes(1);
    const triageArgs = triageToolsetsMock.mock.calls[0][0];
    expect(triageArgs.model).toBe("qwen3:4b");
    expect(typeof triageArgs.prompt).toBe("string");
    expect(triageArgs.prompt.length).toBeGreaterThan(0);

    expect(findToolsetsArg(getArgs())).toBe("file,terminal");
  });

  it("uses adapterConfig.triageModel override when set", async () => {
    triageToolsetsMock.mockResolvedValue({
      toolsets: ["file"],
      usedFallback: false,
      durationMs: 10,
    });

    const { ctx } = makeCtx({
      adapterConfig: { triageModel: "qwen3:0.6b" },
    });

    await execute(ctx);

    expect(triageToolsetsMock.mock.calls[0][0].model).toBe("qwen3:0.6b");
  });

  it("forwards triageHost / ollamaHost / triageTimeoutMs into triage opts", async () => {
    triageToolsetsMock.mockResolvedValue({
      toolsets: ["file"],
      usedFallback: false,
      durationMs: 5,
    });

    const { ctx } = makeCtx({
      adapterConfig: {
        ollamaHost: "http://localhost:11434",
        triageTimeoutMs: 5000,
      },
    });

    await execute(ctx);

    const opts = triageToolsetsMock.mock.calls[0][0];
    expect(opts.host).toBe("http://localhost:11434");
    expect(opts.timeoutMs).toBe(5000);
  });

  it("emits a banner log including the selected subset and total registry size", async () => {
    triageToolsetsMock.mockResolvedValue({
      toolsets: ["file", "web"],
      usedFallback: false,
      durationMs: 17,
    });

    const { ctx, logs } = makeCtx();
    await execute(ctx);

    const banner = logs.find((l) =>
      l.chunk.startsWith("[hermes-triage] selected: file,web")
    );
    expect(banner).toBeTruthy();
    // total registry size of 22 (current Hermes v0.12)
    expect(banner.chunk).toMatch(/\(2 of \d+,/);
    expect(banner.chunk).toMatch(/17ms/);
  });

  it("surfaces triage metadata in resultJson.triage", async () => {
    triageToolsetsMock.mockResolvedValue({
      toolsets: ["file"],
      usedFallback: false,
      durationMs: 9,
    });

    const { ctx } = makeCtx();
    const result = await execute(ctx);

    expect(result.resultJson?.triage).toEqual({
      toolsets: ["file"],
      used_fallback: false,
      error: null,
      duration_ms: 9,
    });
  });

  it("when triage returns an empty list, omits -t and surfaces fallback metadata", async () => {
    triageToolsetsMock.mockResolvedValue({
      toolsets: [],
      usedFallback: true,
      error: "triage call failed",
      durationMs: 4,
    });

    const { ctx } = makeCtx();
    const result = await execute(ctx);

    expect(findToolsetsArg(getArgs())).toBeNull();
    expect(result.resultJson?.triage?.used_fallback).toBe(true);
    expect(result.resultJson?.triage?.error).toBe("triage call failed");
  });
});

describe("execute: triage off when no toolsets and triageEnabled disabled", () => {
  it("resultJson.triage is null when triage is skipped", async () => {
    const { ctx } = makeCtx({
      adapterConfig: { toolsets: "file" },
    });
    const result = await execute(ctx);
    expect(result.resultJson?.triage).toBeNull();
  });
});
