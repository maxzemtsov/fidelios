/**
 * Hermes toolset triage engine (FID-48).
 *
 * Before each Hermes spawn, ask the configured local LLM to pick which subset
 * of available toolsets is relevant for the user's prompt. The selected names
 * are then passed to Hermes via `-t a,b,c`, replacing the static whitelist
 * approach rejected in FID-47.
 *
 * Design decisions:
 *   - The router LLM defaults to `adapterConfig.model` (the same Ollama model
 *     already configured for the agent). Optional `triageModel` override.
 *   - We call Ollama with `format: 'json'` for robust parsing.
 *   - Hard 30s timeout. On any failure (timeout, parse error, empty result,
 *     bad JSON shape) we fall back to SAFE_DEFAULT_TOOLSETS and surface a
 *     warning + `triageError` field.
 *   - LLM-returned names are intersected with the registry, so unknown / made-up
 *     toolsets are silently dropped.
 */
import { Ollama } from "ollama";
import {
  HERMES_TOOLSET_REGISTRY,
  SAFE_DEFAULT_TOOLSETS,
  TOOLSET_BY_NAME,
} from "./toolset-registry.js";

/**
 * @typedef {import("./toolset-registry.js").ToolsetEntry} ToolsetEntry
 */

/**
 * @typedef {Object} TriageResult
 * @property {string[]} toolsets         Filtered, deduped list of canonical toolset names.
 * @property {boolean}  usedFallback     True when SAFE_DEFAULT_TOOLSETS was returned.
 * @property {string=}  error            Human-readable error string when fallback was used.
 * @property {number}   durationMs       Wall-clock time spent on the triage call.
 * @property {string=}  rawContent       Raw LLM response (for debug / log truncation).
 */

const DEFAULT_TRIAGE_TIMEOUT_MS = 30_000;

/**
 * Build the system prompt presented to the triage LLM.
 *
 * Kept short and structured to maximize JSON-mode reliability with small
 * local models. We err on the side of "include the toolset if unsure" so
 * the downstream agent is never starved of capability.
 *
 * @param {ToolsetEntry[]} registry
 * @returns {string}
 */
export function buildTriageSystemPrompt(registry) {
  const lines = registry.map((t) => `- ${t.name}: ${t.description}`);
  return [
    "You are a tool-selection router for an autonomous AI agent.",
    "Given the user's task, choose which toolsets the agent will actually need.",
    "",
    "Rules:",
    '- Reply with valid JSON only, shape: {"toolsets": ["name1", "name2", ...]}.',
    "- Use only canonical names from the list below — do not invent new ones.",
    "- Prefer fewer toolsets, but include any that the agent may plausibly need.",
    "- If the task is ambiguous or general, include the core defaults: terminal, file, code_execution, web, skills, todo, memory.",
    "",
    "Available toolsets:",
    ...lines,
  ].join("\n");
}

/**
 * Parse a raw LLM JSON response into a clean array of toolset names.
 * Tolerates whitespace, trailing prose, and bare JSON without code fences.
 *
 * @param {string} raw
 * @returns {string[] | null} null when content is unparseable.
 */
export function parseTriageJson(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  // Try direct parse first (Ollama format:'json' should already give us a JSON doc).
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fall back to extracting the first {...} block.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const list = parsed.toolsets ?? parsed.tools ?? parsed.selected;
  if (!Array.isArray(list)) return null;
  return list.filter((v) => typeof v === "string" && v.length > 0);
}

/**
 * Dedupe + filter a list of LLM-returned names against the canonical registry
 * (or a caller-supplied registry, for tests).
 *
 * @param {string[]} names
 * @param {ToolsetEntry[]} [registry] Defaults to the canonical Hermes registry.
 * @returns {string[]}
 */
export function filterToolsetNames(names, registry) {
  const lookup = registry
    ? new Set(registry.map((t) => t.name))
    : TOOLSET_BY_NAME;
  const seen = new Set();
  const out = [];
  for (const name of names) {
    if (typeof name !== "string") continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    const known = lookup instanceof Set ? lookup.has(trimmed) : lookup.has(trimmed);
    if (!known) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Wrap a promise with a timeout. Resolves with the original promise's value
 * or rejects with a timeout Error.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    timeout,
  ]);
}

/**
 * Run the triage LLM call. Always resolves — never rejects.
 * On any error, returns SAFE_DEFAULT_TOOLSETS with `usedFallback: true` and
 * an `error` field describing what went wrong.
 *
 * @param {Object} opts
 * @param {string} opts.prompt                User-facing prompt that the agent will execute.
 * @param {string} opts.model                 Ollama model name (e.g. "qwen3:4b").
 * @param {ToolsetEntry[]} [opts.registry]    Override registry (defaults to the canonical one).
 * @param {string[]} [opts.fallback]          Override fallback list.
 * @param {number} [opts.timeoutMs]           Hard timeout in ms.
 * @param {string} [opts.host]                Optional Ollama host override.
 * @param {{ chat: Function } | null} [opts.client]  Optional pre-built Ollama client (tests).
 * @param {{ Ollama: any } | null} [opts.ollamaCtor] Optional Ollama ctor (tests).
 * @returns {Promise<TriageResult>}
 */
export async function triageToolsets(opts) {
  const start = Date.now();
  const registry = opts.registry ?? HERMES_TOOLSET_REGISTRY;
  const fallback = opts.fallback ?? SAFE_DEFAULT_TOOLSETS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TRIAGE_TIMEOUT_MS;

  const fallbackResult = (error, rawContent) => ({
    toolsets: filterToolsetNames(fallback, registry),
    usedFallback: true,
    error,
    durationMs: Date.now() - start,
    rawContent,
  });

  if (!opts.model || typeof opts.model !== "string") {
    return fallbackResult("triage skipped: no model configured");
  }
  if (!opts.prompt || typeof opts.prompt !== "string") {
    return fallbackResult("triage skipped: empty prompt");
  }

  let client = opts.client;
  if (!client) {
    try {
      const Ctor = opts.ollamaCtor?.Ollama ?? Ollama;
      client = new Ctor(opts.host ? { host: opts.host } : {});
    } catch (err) {
      return fallbackResult(`failed to construct Ollama client: ${err?.message ?? err}`);
    }
  }

  const system = buildTriageSystemPrompt(registry);
  const messages = [
    { role: "system", content: system },
    { role: "user", content: `Task:\n${opts.prompt.slice(0, 4000)}` },
  ];

  let response;
  try {
    response = await withTimeout(
      client.chat({
        model: opts.model,
        messages,
        format: "json",
        stream: false,
        options: { temperature: 0 },
      }),
      timeoutMs,
      "hermes-triage"
    );
  } catch (err) {
    return fallbackResult(`triage call failed: ${err?.message ?? err}`);
  }

  const raw = response?.message?.content ?? "";
  const parsed = parseTriageJson(raw);
  if (!parsed) {
    return fallbackResult("triage response not valid JSON", raw);
  }

  const filtered = filterToolsetNames(parsed, registry);
  if (filtered.length === 0) {
    return fallbackResult("triage returned no known toolsets", raw);
  }

  return {
    toolsets: filtered,
    usedFallback: false,
    durationMs: Date.now() - start,
    rawContent: raw,
  };
}
