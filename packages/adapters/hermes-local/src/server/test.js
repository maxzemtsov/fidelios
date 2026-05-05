/**
 * Environment test for the Hermes Agent adapter.
 *
 * Verifies that Hermes Agent is installed, accessible, and configured
 * before allowing the adapter to be used.
 */
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { HERMES_CLI, ADAPTER_TYPE } from "../shared/constants.js";
const execFileAsync = promisify(execFile);
function asString(v) {
    return typeof v === "string" ? v : undefined;
}
// Mirrors the patterns used by codex/opencode/pi adapters; matches the most
// common auth-failure substrings emitted by upstream LLM providers when a key
// is missing/invalid or Hermes itself isn't logged in.
const HERMES_AUTH_REQUIRED_RE = /(?:auth(?:entication)?\s+required|invalid(?:\s+or\s+missing)?\s+api(?:[_\s-]?key)?|api[_\s-]?key.*required|not\s+logged\s+in|please\s+log\s+in|unauthorized|401\s+unauthorized|insufficient_quota|free\s+usage\s+exceeded|please\s+run\s+`?hermes\s+(?:login|auth)`?)/i;
export function isHermesAuthRequiredText(text) {
    return typeof text === "string" && HERMES_AUTH_REQUIRED_RE.test(text);
}
function commandLooksLikeHermes(command) {
    const base = path.basename(command).toLowerCase();
    return base === "hermes" || base === "hermes.cmd" || base === "hermes.exe";
}
function summarizeProbeDetail(stdout, stderr) {
    const firstLine = (text) => text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean) ?? "";
    const raw = firstLine(stderr) || firstLine(stdout);
    if (!raw)
        return null;
    const clean = raw.replace(/\s+/g, " ").trim();
    return clean.length > 240 ? `${clean.slice(0, 239)}…` : clean;
}
// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------
async function checkCliInstalled(command) {
    try {
        // Try to run the command to see if it exists
        await execFileAsync(command, ["--version"], { timeout: 10_000 });
        return null; // OK — it ran successfully
    }
    catch (err) {
        const e = err;
        if (e.code === "ENOENT") {
            return {
                level: "error",
                message: `Hermes CLI "${command}" not found in PATH`,
                hint: "Install Hermes Agent: pip install hermes-agent",
                code: "hermes_cli_not_found",
            };
        }
        // Command exists but --version might have failed for some reason
        // Still consider it installed
        return null;
    }
}
async function checkCliVersion(command) {
    try {
        const { stdout } = await execFileAsync(command, ["--version"], {
            timeout: 10_000,
        });
        const version = stdout.trim();
        if (version) {
            return {
                level: "info",
                message: `Hermes Agent version: ${version}`,
                code: "hermes_version",
            };
        }
        return {
            level: "warn",
            message: "Could not determine Hermes Agent version",
            code: "hermes_version_unknown",
        };
    }
    catch {
        return {
            level: "warn",
            message: "Could not determine Hermes Agent version (hermes --version failed)",
            hint: "Make sure the hermes CLI is properly installed and functional",
            code: "hermes_version_failed",
        };
    }
}
async function checkPython() {
    try {
        const { stdout } = await execFileAsync("python3", ["--version"], {
            timeout: 5_000,
        });
        const version = stdout.trim();
        const match = version.match(/(\d+)\.(\d+)/);
        if (match) {
            const major = parseInt(match[1], 10);
            const minor = parseInt(match[2], 10);
            if (major < 3 || (major === 3 && minor < 10)) {
                return {
                    level: "error",
                    message: `Python ${version} found — Hermes requires Python 3.10+`,
                    hint: "Upgrade Python to 3.10 or later",
                    code: "hermes_python_old",
                };
            }
        }
        return null; // OK
    }
    catch {
        return {
            level: "warn",
            message: "python3 not found in PATH",
            hint: "Hermes Agent requires Python 3.10+. Install it from python.org",
            code: "hermes_python_missing",
        };
    }
}
function checkModel(config) {
    const model = asString(config.model);
    if (!model) {
        return {
            level: "info",
            message: "No model specified — Hermes will use its configured default model",
            hint: "Set a model explicitly in FideliOS only if you want to override your local Hermes configuration.",
            code: "hermes_configured_default_model",
        };
    }
    return {
        level: "info",
        message: `Model: ${model}`,
        code: "hermes_model_configured",
    };
}
function checkApiKeys(config) {
    // The server resolves secret refs into config.env before calling testEnvironment,
    // so we check config.env first (adapter-configured secrets), then fall back to
    // process.env (server/host environment). This mirrors how the Claude adapter does it.
    const envConfig = (config.env ?? {});
    const resolvedEnv = {};
    for (const [key, value] of Object.entries(envConfig)) {
        if (typeof value === "string" && value.length > 0)
            resolvedEnv[key] = value;
    }
    const has = (key) => !!(resolvedEnv[key] ?? process.env[key]);
    const hasAnthropic = has("ANTHROPIC_API_KEY");
    const hasOpenRouter = has("OPENROUTER_API_KEY");
    const hasOpenAI = has("OPENAI_API_KEY");
    const hasZai = has("ZAI_API_KEY");
    if (!hasAnthropic && !hasOpenRouter && !hasOpenAI && !hasZai) {
        return {
            level: "warn",
            message: "No LLM API keys found in environment",
            hint: "Set ANTHROPIC_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, or ZAI_API_KEY in the agent's env secrets. Hermes may also have keys configured in ~/.hermes/.env",
            code: "hermes_no_api_keys",
        };
    }
    const providers = [];
    if (hasAnthropic)
        providers.push("Anthropic");
    if (hasOpenRouter)
        providers.push("OpenRouter");
    if (hasOpenAI)
        providers.push("OpenAI");
    if (hasZai)
        providers.push("Z.AI");
    return {
        level: "info",
        message: `API keys found: ${providers.join(", ")}`,
        code: "hermes_api_keys_found",
    };
}
async function checkHelloProbe(command, config, hasAnyApiKey) {
    if (!commandLooksLikeHermes(command)) {
        return {
            level: "info",
            message: "Skipped hello probe because command is not `hermes`.",
            hint: "Use the `hermes` CLI command to enable the automatic auth probe.",
            code: "hermes_hello_probe_skipped_custom_command",
        };
    }
    const model = asString(config.model);
    if (!model && !hasAnyApiKey) {
        return {
            level: "info",
            message: "Skipped hello probe — no model and no provider API key configured.",
            hint: "Set a model and at least one provider key (e.g. ANTHROPIC_API_KEY, OPENROUTER_API_KEY) to enable the probe.",
            code: "hermes_hello_probe_skipped_no_config",
        };
    }
    const envConfig = (config.env ?? {});
    const env = { ...process.env };
    for (const [k, v] of Object.entries(envConfig)) {
        if (typeof v === "string")
            env[k] = v;
    }
    const args = ["chat", "-q", "Respond with hello.", "-Q", "--yolo", "--source", "tool"];
    if (model)
        args.push("-m", model);
    const provider = asString(config.provider);
    if (provider)
        args.push("--provider", provider);
    try {
        const { stdout, stderr } = await execFileAsync(command, args, {
            timeout: 30_000,
            env,
            maxBuffer: 1024 * 1024,
        });
        const combined = `${stdout}\n${stderr}`;
        if (HERMES_AUTH_REQUIRED_RE.test(combined)) {
            return {
                level: "warn",
                message: "Hermes hello probe reported an auth/credential failure.",
                detail: summarizeProbeDetail(stdout, stderr) ?? undefined,
                hint: "Run `hermes auth status` and verify upstream provider credentials (ANTHROPIC_API_KEY, OPENROUTER_API_KEY, etc.).",
                code: "hermes_hello_probe_auth_required",
            };
        }
        const replied = /\bhello\b/i.test(stdout);
        return {
            level: replied ? "info" : "warn",
            message: replied
                ? "Hermes hello probe succeeded."
                : "Hermes probe ran but did not return `hello` as expected.",
            detail: summarizeProbeDetail(stdout, stderr) ?? undefined,
            ...(replied
                ? {}
                : {
                    hint: "Try `hermes chat -q 'Respond with hello.' -Q` manually to debug provider/model behavior.",
                }),
            code: replied ? "hermes_hello_probe_passed" : "hermes_hello_probe_unexpected_output",
        };
    }
    catch (err) {
        const e = err;
        const text = `${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message ?? ""}`;
        if (e.killed || /etimedout|timeout/i.test(e.message ?? "")) {
            return {
                level: "warn",
                message: "Hermes hello probe timed out.",
                hint: "Retry the probe. If this persists, run `hermes chat -q 'ping' -Q` manually to verify the upstream provider responds.",
                code: "hermes_hello_probe_timed_out",
            };
        }
        if (HERMES_AUTH_REQUIRED_RE.test(text)) {
            return {
                level: "warn",
                message: "Hermes hello probe reported an auth/credential failure.",
                detail: summarizeProbeDetail(e.stdout ?? "", e.stderr ?? "") ?? undefined,
                hint: "Run `hermes auth status` and verify upstream provider credentials.",
                code: "hermes_hello_probe_auth_required",
            };
        }
        return {
            level: "error",
            message: "Hermes hello probe failed.",
            detail: summarizeProbeDetail(e.stdout ?? "", e.stderr ?? "") ?? e.message,
            hint: "Run `hermes chat -q 'Respond with hello.' -Q` manually in this directory to debug.",
            code: "hermes_hello_probe_failed",
        };
    }
}
// ---------------------------------------------------------------------------
// Main test
// ---------------------------------------------------------------------------
export async function testEnvironment(ctx) {
    const config = (ctx.config ?? {});
    const command = asString(config.hermesCommand) || HERMES_CLI;
    const checks = [];
    // 1. CLI installed?
    const cliCheck = await checkCliInstalled(command);
    if (cliCheck) {
        checks.push(cliCheck);
        if (cliCheck.level === "error") {
            return {
                adapterType: ADAPTER_TYPE,
                status: "fail",
                checks,
                testedAt: new Date().toISOString(),
            };
        }
    }
    // 2. CLI version
    const versionCheck = await checkCliVersion(command);
    if (versionCheck)
        checks.push(versionCheck);
    // 3. Python available?
    const pythonCheck = await checkPython();
    if (pythonCheck)
        checks.push(pythonCheck);
    // 4. Model config
    const modelCheck = checkModel(config);
    if (modelCheck)
        checks.push(modelCheck);
    // 5. API keys (check config.env — server resolves secrets before calling us)
    const apiKeyCheck = checkApiKeys(config);
    if (apiKeyCheck)
        checks.push(apiKeyCheck);
    // 6. Hello probe — actually exercise the configured model/provider.
    //    Skipped when command is custom or when there's no model AND no provider key
    //    (so we never spam an LLM with no way to authenticate).
    const hasAnyApiKey = apiKeyCheck.code === "hermes_api_keys_found";
    const probeCheck = await checkHelloProbe(command, config, hasAnyApiKey);
    if (probeCheck)
        checks.push(probeCheck);
    // Determine overall status
    const hasErrors = checks.some((c) => c.level === "error");
    const hasWarnings = checks.some((c) => c.level === "warn");
    return {
        adapterType: ADAPTER_TYPE,
        status: hasErrors ? "fail" : hasWarnings ? "warn" : "pass",
        checks,
        testedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=test.js.map