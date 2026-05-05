import { describe, expect, it } from "vitest";
import { isClaudeMaxTurnsResult, isClaudeUnknownSessionError } from "@fideliosai/adapter-claude-local/server";

describe("claude_local max-turn detection", () => {
  it("detects max-turn exhaustion by subtype", () => {
    expect(
      isClaudeMaxTurnsResult({
        subtype: "error_max_turns",
        result: "Reached max turns",
      }),
    ).toBe(true);
  });

  it("detects max-turn exhaustion by stop_reason", () => {
    expect(
      isClaudeMaxTurnsResult({
        stop_reason: "max_turns",
      }),
    ).toBe(true);
  });

  it("returns false for non-max-turn results", () => {
    expect(
      isClaudeMaxTurnsResult({
        subtype: "success",
        stop_reason: "end_turn",
      }),
    ).toBe(false);
  });
});

describe("claude_local stale session detection", () => {
  it("detects 'no rollout found for thread id' error in result text", () => {
    expect(
      isClaudeUnknownSessionError({
        result: "Error: thread/resume: thread/resume failed: no rollout found for thread id ef6b5f90-c9ac-4a7a-94f1-0a4c5340c293",
      }),
    ).toBe(true);
  });

  it("detects legacy 'no conversation found with session id' error", () => {
    expect(
      isClaudeUnknownSessionError({
        result: "No conversation found with session id abc-123",
      }),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(
      isClaudeUnknownSessionError({
        result: "Claude run failed: some other error",
      }),
    ).toBe(false);
  });
});
