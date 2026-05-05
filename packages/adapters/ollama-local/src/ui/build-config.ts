import type { CreateConfigValues } from "@fideliosai/adapter-utils";

function parseEnvVars(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    env[key] = value;
  }
  return env;
}

function parseEnvBindings(bindings: unknown): Record<string, unknown> {
  if (typeof bindings !== "object" || bindings === null || Array.isArray(bindings)) return {};
  const env: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(bindings)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (typeof raw === "string") {
      env[key] = { type: "plain", value: raw };
      continue;
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const rec = raw as Record<string, unknown>;
    if (rec.type === "plain" && typeof rec.value === "string") {
      env[key] = { type: "plain", value: rec.value };
      continue;
    }
    if (rec.type === "secret_ref" && typeof rec.secretId === "string") {
      env[key] = {
        type: "secret_ref",
        secretId: rec.secretId,
        ...(typeof rec.version === "number" || rec.version === "latest"
          ? { version: rec.version }
          : {}),
      };
    }
  }
  return env;
}

/**
 * Maps the shared agent-config form values onto an ollama_local
 * adapterConfig payload. The form's free-form `args` field is reused
 * to surface ollama-specific knobs as `key=value` lines:
 *   host=https://ollama.com
 *   keepAlive=10m
 *   numCtx=8192
 *   think=high
 *   ollamaTier=pro
 *   timeoutSec=120
 */
export function buildOllamaLocalConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.promptTemplate) ac.promptTemplate = v.promptTemplate;
  if (v.bootstrapPrompt) ac.bootstrapPromptTemplate = v.bootstrapPrompt;
  if (v.model) ac.model = v.model;

  const argLines = parseEnvVars(`${v.args ?? ""}\n${v.extraArgs ?? ""}`);

  if (argLines.host) ac.host = argLines.host;
  if (argLines.keepAlive) ac.keepAlive = argLines.keepAlive;
  if (argLines.numCtx) {
    const n = Number(argLines.numCtx);
    if (Number.isFinite(n)) ac.numCtx = n;
  }
  if (argLines.think) {
    const t = argLines.think.trim().toLowerCase();
    if (t === "true" || t === "false") ac.think = t === "true";
    else if (t === "low" || t === "medium" || t === "high") ac.think = t;
  }
  if (argLines.ollamaTier) ac.ollamaTier = argLines.ollamaTier;
  if (argLines.timeoutSec) {
    const n = Number(argLines.timeoutSec);
    if (Number.isFinite(n) && n > 0) ac.timeoutSec = n;
  }

  const env = parseEnvBindings(v.envBindings);
  const legacy = parseEnvVars(v.envVars);
  for (const [key, value] of Object.entries(legacy)) {
    if (!Object.prototype.hasOwnProperty.call(env, key)) {
      env[key] = { type: "plain", value };
    }
  }
  if (Object.keys(env).length > 0) ac.env = env;

  return ac;
}
