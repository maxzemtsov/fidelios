/**
 * Concurrency cap singleton for ollama_local cloud model runs.
 *
 * Tier caps (Free=1 / PRO=3 / MAX=10) are enforced per (adapterType+model) key.
 * Applies when the model ends with `:cloud` or the host points at Ollama Cloud.
 * Local daemon runs are not subject to a cap.
 */

import type { ProviderQuotaResult } from "@fideliosai/adapter-utils";

export type OllamaTierName = "free" | "pro" | "max";

export const TIER_CAPS: Record<OllamaTierName, number> = {
  free: 1,
  pro: 3,
  max: 10,
};

export const DEFAULT_TIER: OllamaTierName = "free";

/** Normalize a raw config value to a valid tier name, falling back to "free". */
export function parseTier(raw: unknown): OllamaTierName {
  if (typeof raw === "string") {
    const lower = raw.trim().toLowerCase();
    if (lower === "pro" || lower === "max" || lower === "free") return lower;
  }
  return DEFAULT_TIER;
}

/** Returns the concurrency cap for the given tier. */
export function tierCap(tier: OllamaTierName): number {
  return TIER_CAPS[tier];
}

interface SlotQueue {
  active: number;
  cap: number;
  waiting: Array<() => void>;
}

// Module-level singleton: Map<concurrencyKey, SlotQueue>
const slotsMap = new Map<string, SlotQueue>();

/** @internal exposed for tests only */
export function _resetSlotsForTests(): void {
  slotsMap.clear();
}

function getOrCreateSlot(key: string, cap: number): SlotQueue {
  let slot = slotsMap.get(key);
  if (!slot) {
    slot = { active: 0, cap, waiting: [] };
    slotsMap.set(key, slot);
  } else {
    // Update cap in case the operator changed the tier config.
    slot.cap = cap;
  }
  return slot;
}

/**
 * Acquire a concurrency slot for the given key+cap.
 * If the cap is already reached, the returned Promise queues until a slot is freed.
 * Returns a release function — call it when the run completes (use try/finally).
 */
export async function acquireConcurrencySlot(key: string, cap: number): Promise<() => void> {
  const slot = getOrCreateSlot(key, cap);

  if (slot.active < slot.cap) {
    slot.active++;
    return makeRelease(slot);
  }

  // Queue: wait for a slot to become available.
  await new Promise<void>((resolve) => {
    slot.waiting.push(resolve);
  });
  slot.active++;
  return makeRelease(slot);
}

function makeRelease(slot: SlotQueue): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    slot.active = Math.max(0, slot.active - 1);
    const next = slot.waiting.shift();
    if (next) next();
  };
}

/**
 * Returns the current active count for a key (0 if not seen yet).
 * For diagnostic use only.
 */
export function getActiveCount(key: string): number {
  return slotsMap.get(key)?.active ?? 0;
}

/**
 * Build a concurrency key for ollama cloud runs.
 * Format: "ollama_cloud:<model>"
 */
export function buildConcurrencyKey(model: string): string {
  return `ollama_cloud:${model}`;
}

/**
 * True when this run should be subject to the concurrency cap.
 * Applies for cloud-hosted models (`:cloud` suffix or ollama.com host).
 */
export function requiresConcurrencyCap(model: string, isCloud: boolean): boolean {
  return isCloud || /:\s*cloud\s*$/i.test(model.trim());
}

/**
 * getQuotaWindows — reports the configured tier + cap as a quota window.
 * There is no public Ollama API to poll live utilization, so we surface the
 * cap and current in-process active count as a "configured" window.
 */
export async function getQuotaWindows(
  tier: OllamaTierName,
  model: string,
  isCloud: boolean,
): Promise<ProviderQuotaResult> {
  const cap = tierCap(tier);
  const key = buildConcurrencyKey(model);
  const active = getActiveCount(key);
  const usedPercent = cap > 0 ? Math.min(100, Math.round((active / cap) * 100)) : null;
  const subject = requiresConcurrencyCap(model, isCloud);

  return {
    provider: "ollama",
    source: "ollama_local_concurrency",
    ok: true,
    windows: [
      {
        label: `Concurrency cap (${tier})`,
        usedPercent: subject ? usedPercent : null,
        resetsAt: null,
        valueLabel: subject ? `${active}/${cap} active` : "N/A (local model)",
        detail: subject
          ? `Configured tier: ${tier}, cap: ${cap} concurrent run(s). Active: ${active}.`
          : `Concurrency cap applies to cloud models only. Configured tier: ${tier} (cap: ${cap}).`,
      },
    ],
  };
}
