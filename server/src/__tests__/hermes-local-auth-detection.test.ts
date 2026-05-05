import { describe, expect, it } from "vitest";
import { isHermesAuthRequiredText } from "@fideliosai/adapter-hermes-local/server";

describe("hermes_local auth-failure detection", () => {
  it("detects 'authentication required'", () => {
    expect(isHermesAuthRequiredText("Error: Authentication required for provider openrouter")).toBe(true);
  });

  it("detects 'invalid API key'", () => {
    expect(isHermesAuthRequiredText("Anthropic returned 401 — invalid API key")).toBe(true);
  });

  it("detects 'invalid or missing api key'", () => {
    expect(isHermesAuthRequiredText("invalid or missing api_key in request")).toBe(true);
  });

  it("detects 'not logged in'", () => {
    expect(isHermesAuthRequiredText("Hermes is not logged in to the configured provider")).toBe(true);
  });

  it("detects 'unauthorized'", () => {
    expect(isHermesAuthRequiredText("HTTP 401 Unauthorized")).toBe(true);
  });

  it("detects 'insufficient_quota' (treated as auth/credential failure)", () => {
    expect(isHermesAuthRequiredText('{"code":"insufficient_quota","message":"You exceeded your quota"}')).toBe(true);
  });

  it("detects 'free usage exceeded'", () => {
    expect(isHermesAuthRequiredText("Free usage exceeded — please upgrade your plan")).toBe(true);
  });

  it("detects 'please run hermes login'", () => {
    expect(isHermesAuthRequiredText("Please run `hermes login openrouter` first.")).toBe(true);
  });

  it("returns false for unrelated successful output", () => {
    expect(isHermesAuthRequiredText("hello\n[session: abc-123] tokens=42")).toBe(false);
  });

  it("returns false for non-string input", () => {
    expect(isHermesAuthRequiredText(undefined)).toBe(false);
    expect(isHermesAuthRequiredText(null)).toBe(false);
    expect(isHermesAuthRequiredText(42)).toBe(false);
  });
});
