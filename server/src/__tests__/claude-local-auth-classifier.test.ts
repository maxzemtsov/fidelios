import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { detectClaudeLoginRequired, execute } from "@fideliosai/adapter-claude-local/server";

// FID-56 regression: a successful Claude run must never be flagged `claude_auth_required` from its own output.

describe("detectClaudeLoginRequired", () => {
  it("ignores login/auth phrases in a successful model turn", () => {
    const parsed = {
      type: "result",
      subtype: "success",
      is_error: false,
      result: "Done. The /login route returns 401 Unauthorized; logged-out users see 'Not logged in'.",
    };
    const stdout = [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "The CLI hint is: Please run /login." }] },
      }),
      JSON.stringify(parsed),
    ].join("\n");
    expect(detectClaudeLoginRequired({ parsed, stdout, stderr: "" }).requiresLogin).toBe(false);
  });

  it("does not flag a clean success", () => {
    const parsed = { type: "result", subtype: "success", is_error: false, result: "ok" };
    expect(
      detectClaudeLoginRequired({ parsed, stdout: JSON.stringify(parsed), stderr: "" }).requiresLogin,
    ).toBe(false);
  });

  it("flags a genuine CLI auth error on stderr", () => {
    expect(
      detectClaudeLoginRequired({
        parsed: null,
        stdout: "",
        stderr: "Invalid API key · Please run /login",
      }).requiresLogin,
    ).toBe(true);
  });

  it("flags an error-subtype result that reports a login requirement", () => {
    const parsed = {
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      result: "Not logged in. Please run /login",
    };
    expect(
      detectClaudeLoginRequired({ parsed, stdout: JSON.stringify(parsed), stderr: "" }).requiresLogin,
    ).toBe(true);
  });

  it("flags a plain-text auth error when no result JSON was produced", () => {
    expect(
      detectClaudeLoginRequired({
        parsed: null,
        stdout: "Not logged in. Please run /login",
        stderr: "",
      }).requiresLogin,
    ).toBe(true);
  });
});

async function writeFakeClaude(commandPath: string): Promise<void> {
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
try { fs.readFileSync(0, "utf8"); } catch {}
const mode = process.env.FIDELIOS_TEST_CLAUDE_MODE || "success";
if (mode === "authfail") {
  process.stderr.write("Not logged in. Please run /login\\n");
  process.exit(1);
}
console.log(JSON.stringify({ type: "system", subtype: "init", session_id: "claude-session-1", model: "claude-sonnet-4-6" }));
console.log(JSON.stringify({ type: "assistant", session_id: "claude-session-1", message: { content: [{ type: "text", text: "Investigating the /login route; the error users hit is 'Not logged in'." }] } }));
console.log(JSON.stringify({ type: "result", subtype: "success", session_id: "claude-session-1", is_error: false, result: "Done. The /login route returns 401 Unauthorized for bad credentials.", total_cost_usd: 0 }));
process.exit(0);
`;
  await fs.writeFile(commandPath, script, "utf8");
  await fs.chmod(commandPath, 0o755);
}

async function runClaudeExecute(root: string, mode: "success" | "authfail") {
  const workspace = path.join(root, "workspace");
  const commandPath = path.join(root, "claude");
  await fs.mkdir(workspace, { recursive: true });
  await writeFakeClaude(commandPath);
  return execute({
    runId: `run-${mode}`,
    agent: {
      id: "agent-1",
      companyId: "company-1",
      name: "Fullstack Engineer",
      adapterType: "claude",
      adapterConfig: {},
    },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: {
      command: commandPath,
      cwd: workspace,
      env: { FIDELIOS_TEST_CLAUDE_MODE: mode },
      promptTemplate: "Continue your FideliOS work.",
    },
    context: {},
    authToken: "run-jwt-token",
    onLog: async () => {},
  });
}

describe("claude execute — auth classification", () => {
  it("does not mark a successful login-themed run as claude_auth_required", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fidelios-claude-auth-ok-"));
    const previousHome = process.env.HOME;
    process.env.HOME = root;
    try {
      const result = await runClaudeExecute(root, "success");
      expect(result.exitCode).toBe(0);
      expect(result.errorCode).toBeNull();
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("marks a genuine CLI auth failure as claude_auth_required", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "fidelios-claude-auth-fail-"));
    const previousHome = process.env.HOME;
    process.env.HOME = root;
    try {
      const result = await runClaudeExecute(root, "authfail");
      expect(result.exitCode).toBe(1);
      expect(result.errorCode).toBe("claude_auth_required");
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
