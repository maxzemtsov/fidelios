import { describe, expect, it } from "vitest";
import { sanitizeRunId } from "../middleware/auth.js";

const VALID = "1f0c4a2e-0b7d-4c9a-9e3f-7a2b6c8d9e10";

describe("sanitizeRunId — X-FideliOS-Run-Id header validation", () => {
  it("keeps a valid lowercase UUID", () => {
    expect(sanitizeRunId(VALID)).toBe(VALID);
  });

  it("keeps an uppercase UUID (validation is case-insensitive)", () => {
    expect(sanitizeRunId(VALID.toUpperCase())).toBe(VALID.toUpperCase());
  });

  it("trims surrounding whitespace before validating", () => {
    expect(sanitizeRunId(`  ${VALID}\n`)).toBe(VALID);
  });

  it("drops a non-UUID run id — the bug that 500'd a uuid column", () => {
    expect(sanitizeRunId("operator-reviewer-rollout")).toBeUndefined();
    expect(sanitizeRunId("not-a-uuid")).toBeUndefined();
    expect(sanitizeRunId("12345")).toBeUndefined();
  });

  it("drops a malformed or partial UUID", () => {
    expect(sanitizeRunId("1f0c4a2e-0b7d-4c9a-9e3f")).toBeUndefined();
    expect(sanitizeRunId("1f0c4a2e0b7d4c9a9e3f7a2b6c8d9e10")).toBeUndefined();
    expect(sanitizeRunId(`${VALID} extra`)).toBeUndefined();
  });

  it("returns undefined for an absent or empty header", () => {
    expect(sanitizeRunId(undefined)).toBeUndefined();
    expect(sanitizeRunId(null)).toBeUndefined();
    expect(sanitizeRunId("")).toBeUndefined();
    expect(sanitizeRunId("   ")).toBeUndefined();
  });
});
