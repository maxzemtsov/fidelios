import { afterEach, describe, expect, it } from "vitest";
import {
  _resetSlotsForTests,
  acquireConcurrencySlot,
  buildConcurrencyKey,
  getActiveCount,
  getQuotaWindows,
  parseTier,
  requiresConcurrencyCap,
  TIER_CAPS,
  tierCap,
} from "./concurrency.js";

afterEach(() => {
  _resetSlotsForTests();
});

describe("parseTier", () => {
  it("parses valid tier names case-insensitively", () => {
    expect(parseTier("free")).toBe("free");
    expect(parseTier("pro")).toBe("pro");
    expect(parseTier("max")).toBe("max");
    expect(parseTier("PRO")).toBe("pro");
    expect(parseTier("MAX")).toBe("max");
  });

  it("falls back to free for unknown values", () => {
    expect(parseTier("team")).toBe("free");
    expect(parseTier("enterprise")).toBe("free");
    expect(parseTier(null)).toBe("free");
    expect(parseTier(undefined)).toBe("free");
    expect(parseTier(42)).toBe("free");
    expect(parseTier("")).toBe("free");
  });
});

describe("tierCap", () => {
  it("returns correct caps for each tier", () => {
    expect(tierCap("free")).toBe(TIER_CAPS.free);
    expect(tierCap("pro")).toBe(TIER_CAPS.pro);
    expect(tierCap("max")).toBe(TIER_CAPS.max);
    expect(TIER_CAPS.free).toBe(1);
    expect(TIER_CAPS.pro).toBe(3);
    expect(TIER_CAPS.max).toBe(10);
  });
});

describe("requiresConcurrencyCap", () => {
  it("applies when host is cloud", () => {
    expect(requiresConcurrencyCap("llama3.1", true)).toBe(true);
  });

  it("applies when model has :cloud suffix", () => {
    expect(requiresConcurrencyCap("kimi-k2.6:cloud", false)).toBe(true);
    expect(requiresConcurrencyCap("model:CLOUD", false)).toBe(true);
    expect(requiresConcurrencyCap("model:cloud", false)).toBe(true);
  });

  it("does not apply for local models on local host", () => {
    expect(requiresConcurrencyCap("llama3.1", false)).toBe(false);
    expect(requiresConcurrencyCap("codellama:13b", false)).toBe(false);
  });
});

describe("buildConcurrencyKey", () => {
  it("prefixes with ollama_cloud:", () => {
    expect(buildConcurrencyKey("kimi-k2.6:cloud")).toBe("ollama_cloud:kimi-k2.6:cloud");
    expect(buildConcurrencyKey("llama3.1")).toBe("ollama_cloud:llama3.1");
  });
});

describe("acquireConcurrencySlot", () => {
  it("immediately grants a slot when under cap", async () => {
    const release = await acquireConcurrencySlot("test-key", 2);
    expect(getActiveCount("test-key")).toBe(1);
    release();
    expect(getActiveCount("test-key")).toBe(0);
  });

  it("release is idempotent", async () => {
    const release = await acquireConcurrencySlot("test-key", 2);
    release();
    release(); // second call is a no-op
    expect(getActiveCount("test-key")).toBe(0);
  });

  it("queues when at cap and resolves when released", async () => {
    const key = "cap-test";
    const cap = 1;

    const release1 = await acquireConcurrencySlot(key, cap);
    expect(getActiveCount(key)).toBe(1);

    // Second acquire should queue (cap=1, already 1 active).
    let release2: (() => void) | null = null;
    const p2 = acquireConcurrencySlot(key, cap).then((r) => {
      release2 = r;
    });

    // Still 1 active, p2 is pending.
    expect(getActiveCount(key)).toBe(1);

    // Releasing the first slot should unblock p2.
    release1();
    await p2;

    expect(release2).not.toBeNull();
    expect(getActiveCount(key)).toBe(1);

    release2!();
    expect(getActiveCount(key)).toBe(0);
  });

  it("allows multiple simultaneous slots up to cap", async () => {
    const key = "multi-cap";
    const cap = 3;

    const r1 = await acquireConcurrencySlot(key, cap);
    const r2 = await acquireConcurrencySlot(key, cap);
    const r3 = await acquireConcurrencySlot(key, cap);
    expect(getActiveCount(key)).toBe(3);

    r1();
    expect(getActiveCount(key)).toBe(2);
    r2();
    r3();
    expect(getActiveCount(key)).toBe(0);
  });
});

describe("getQuotaWindows", () => {
  it("returns ok result with configured tier + cap for cloud model", async () => {
    const result = await getQuotaWindows("pro", "kimi-k2.6:cloud", false);
    expect(result.ok).toBe(true);
    expect(result.provider).toBe("ollama");
    expect(result.windows).toHaveLength(1);
    const w = result.windows[0]!;
    expect(w.label).toContain("pro");
    expect(w.valueLabel).toContain("0/3");
    expect(w.usedPercent).toBe(0);
  });

  it("shows N/A for local models", async () => {
    const result = await getQuotaWindows("free", "llama3.1", false);
    expect(result.ok).toBe(true);
    const w = result.windows[0]!;
    expect(w.valueLabel).toContain("N/A");
    expect(w.usedPercent).toBeNull();
  });

  it("reflects active count in usedPercent", async () => {
    const key = buildConcurrencyKey("kimi-k2.6:cloud");
    const release = await acquireConcurrencySlot(key, 3);

    const result = await getQuotaWindows("pro", "kimi-k2.6:cloud", false);
    const w = result.windows[0]!;
    expect(w.usedPercent).toBe(33); // 1/3 = 33%
    expect(w.valueLabel).toContain("1/3");

    release();

    const result2 = await getQuotaWindows("pro", "kimi-k2.6:cloud", false);
    expect(result2.windows[0]!.usedPercent).toBe(0);
  });
});
