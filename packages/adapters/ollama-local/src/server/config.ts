/**
 * Pure helpers for parsing ollama_local adapter config values out of an
 * untrusted Record<string, unknown>. Kept separate from execute.ts so the
 * tests can exercise them without spinning up a fake fetch().
 */

export const DEFAULT_HOST = "http://localhost:11434";
export const CLOUD_HOST = "https://ollama.com";
export const DEFAULT_TIMEOUT_SEC = 300;

export type ThinkOption = boolean | "low" | "medium" | "high";

export interface OllamaConfig {
  host: string;
  model: string;
  apiKey: string | null;
  keepAlive: string | number | null;
  numCtx: number | null;
  think: ThinkOption | null;
  ollamaTier: string | null;
  timeoutSec: number;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readEnvString(envConfig: Record<string, unknown>, key: string): string | null {
  const raw = envConfig[key];
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    if (rec.type === "plain" && typeof rec.value === "string" && rec.value.trim().length > 0) {
      return rec.value.trim();
    }
  }
  return null;
}

function parseThink(value: unknown): ThinkOption | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "low" || lower === "medium" || lower === "high") return lower;
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return null;
}

function parseKeepAlive(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

function normalizeHost(host: string): string {
  const trimmed = host.trim();
  if (!trimmed) return DEFAULT_HOST;
  // Strip trailing slashes so the SDK builds clean URLs
  return trimmed.replace(/\/+$/, "");
}

/**
 * Parse and normalize the adapter config object. Throws if `model` is
 * missing — every other field has a sensible default.
 */
export function parseOllamaConfig(rawConfig: unknown): OllamaConfig {
  const config = parseObject(rawConfig);
  const envConfig = parseObject(config.env);

  const model = asString(config.model).trim();
  if (!model) {
    throw new Error("ollama_local requires `adapterConfig.model`.");
  }

  const host = normalizeHost(asString(config.host, DEFAULT_HOST));

  const apiKey =
    readEnvString(envConfig, "OLLAMA_API_KEY") ??
    (asString(config.apiKey).trim() || null);

  const keepAlive = parseKeepAlive(config.keepAlive);
  const numCtx = asNumberOrNull(config.numCtx);
  const think = parseThink(config.think);
  const ollamaTier = asString(config.ollamaTier).trim() || null;

  const timeoutSecRaw = asNumberOrNull(config.timeoutSec);
  const timeoutSec =
    timeoutSecRaw !== null && timeoutSecRaw > 0 ? timeoutSecRaw : DEFAULT_TIMEOUT_SEC;

  return {
    host,
    model,
    apiKey: apiKey && apiKey.length > 0 ? apiKey : null,
    keepAlive,
    numCtx,
    think,
    ollamaTier,
    timeoutSec,
  };
}

/**
 * Build the headers map handed to the Ollama SDK. Returns null when no
 * Authorization header is needed (purely-local daemons don't need one).
 */
export function buildOllamaHeaders(apiKey: string | null): Record<string, string> | undefined {
  if (!apiKey) return undefined;
  return { Authorization: `Bearer ${apiKey}` };
}

/** True when host points at Ollama Cloud rather than a local daemon. */
export function isCloudHost(host: string): boolean {
  return /^https?:\/\/ollama\.com(\/|$)/i.test(host.trim());
}
