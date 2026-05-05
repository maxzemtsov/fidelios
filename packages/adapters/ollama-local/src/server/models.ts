import type { AdapterModel } from "@fideliosai/adapter-utils";
import { Ollama } from "ollama";
import {
  CLOUD_HOST,
  DEFAULT_HOST,
  buildOllamaHeaders,
  isCloudHost,
} from "./config.js";

const MODELS_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  expiresAt: number;
  models: AdapterModel[];
}

const discoveryCache = new Map<string, CacheEntry>();

function cacheKey(host: string, hasKey: boolean): string {
  return `${host}|${hasKey ? "1" : "0"}`;
}

function pruneExpired(now: number) {
  for (const [key, value] of discoveryCache.entries()) {
    if (value.expiresAt <= now) discoveryCache.delete(key);
  }
}

interface OllamaListResponseModel {
  // The SDK's ModelResponse type uses `name`; some Ollama versions also
  // return `model`. Accept both for forward-compatibility.
  name?: string;
  model?: string;
  details?: { parameter_size?: string };
}

function shapeModels(
  raw: OllamaListResponseModel[] | undefined,
  prefix: string | null,
): AdapterModel[] {
  if (!Array.isArray(raw)) return [];
  const out: AdapterModel[] = [];
  for (const entry of raw) {
    const id = (entry.name ?? entry.model ?? "").trim();
    if (!id) continue;
    const labelBase = prefix ? `${id} (${prefix})` : id;
    out.push({ id, label: labelBase });
  }
  return out;
}

function dedupeAndSort(models: AdapterModel[]): AdapterModel[] {
  const seen = new Map<string, AdapterModel>();
  for (const m of models) {
    if (!seen.has(m.id)) seen.set(m.id, m);
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" }),
  );
}

export interface DiscoverInput {
  host?: string;
  apiKey?: string | null;
  /** Override SDK constructor used in tests. */
  ollamaCtor?: typeof Ollama;
}

/**
 * Discover models available against the configured host. When the host
 * is a local daemon and an OLLAMA_API_KEY is configured, the cloud
 * /api/tags is queried in parallel and merged in. Errors fetching one
 * source are tolerated as long as the other succeeds.
 */
export async function discoverOllamaModels(
  input: DiscoverInput = {},
): Promise<AdapterModel[]> {
  const host = input.host?.trim() || DEFAULT_HOST;
  const apiKey = input.apiKey?.trim() || null;
  const Ctor = input.ollamaCtor ?? Ollama;

  const tasks: Array<Promise<AdapterModel[]>> = [];
  const errors: string[] = [];

  // Primary host
  const primaryHeaders = isCloudHost(host) ? buildOllamaHeaders(apiKey) : undefined;
  const primaryClient = new Ctor({ host, ...(primaryHeaders ? { headers: primaryHeaders } : {}) });
  tasks.push(
    primaryClient
      .list()
      .then((res) =>
        shapeModels(
          (res?.models ?? []) as OllamaListResponseModel[],
          isCloudHost(host) ? "cloud" : null,
        ),
      )
      .catch((err: unknown) => {
        errors.push(
          `primary list failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return [];
      }),
  );

  // Cloud merge: only when the primary is *not* the cloud host AND we have a key.
  if (!isCloudHost(host) && apiKey) {
    const cloudClient = new Ctor({
      host: CLOUD_HOST,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    tasks.push(
      cloudClient
        .list()
        .then((res) =>
          shapeModels((res?.models ?? []) as OllamaListResponseModel[], "cloud"),
        )
        .catch((err: unknown) => {
          errors.push(
            `cloud list failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          return [];
        }),
    );
  }

  const results = await Promise.all(tasks);
  const merged = dedupeAndSort(results.flat());

  if (merged.length === 0 && errors.length > 0) {
    throw new Error(`Ollama model discovery failed: ${errors.join("; ")}`);
  }

  return merged;
}

export async function discoverOllamaModelsCached(
  input: DiscoverInput = {},
): Promise<AdapterModel[]> {
  const host = input.host?.trim() || DEFAULT_HOST;
  const apiKey = input.apiKey?.trim() || null;
  const key = cacheKey(host, apiKey !== null);
  const now = Date.now();
  pruneExpired(now);
  const cached = discoveryCache.get(key);
  if (cached && cached.expiresAt > now) return cached.models;

  const models = await discoverOllamaModels(input);
  discoveryCache.set(key, { expiresAt: now + MODELS_CACHE_TTL_MS, models });
  return models;
}

export async function listOllamaModels(): Promise<AdapterModel[]> {
  // Used when no agent context is available — best effort against the
  // default daemon, with optional cloud merge if OLLAMA_API_KEY is in env.
  try {
    return await discoverOllamaModelsCached({
      host: DEFAULT_HOST,
      apiKey: process.env.OLLAMA_API_KEY ?? null,
    });
  } catch {
    return [];
  }
}

export function resetOllamaModelsCacheForTests(): void {
  discoveryCache.clear();
}
