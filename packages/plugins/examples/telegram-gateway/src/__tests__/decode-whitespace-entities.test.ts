import { describe, it, expect } from "vitest";
import { decodeWhitespaceEntities } from "../worker.js";

// FID-43: Telegram (iOS) sometimes encodes trailing whitespace as HTML
// numeric character references that survive react-markdown rendering and
// leak into the UI as literal text. The ingestion-side decoder normalizes
// these whitespace entities so downstream rendering stays clean.

describe("decodeWhitespaceEntities", () => {
  it("decodes a hex space entity", () => {
    expect(decodeWhitespaceEntities("hello&#x20;world")).toBe("hello world");
  });

  it("decodes a decimal space entity", () => {
    expect(decodeWhitespaceEntities("hello&#32;world")).toBe("hello world");
  });

  it("decodes the FID-43 backslash-escaped form `\\&#x20;`", () => {
    // The leading backslash is consumed along with the entity so the
    // final string contains a plain space, not `\ ` (which would render
    // as a hard break in markdown).
    expect(decodeWhitespaceEntities("hello\\&#x20;world")).toBe("hello world");
  });

  it("decodes non-breaking space entities (hex and decimal)", () => {
    expect(decodeWhitespaceEntities("a&#xA0;b")).toBe("a\u00A0b");
    expect(decodeWhitespaceEntities("a&#160;b")).toBe("a\u00A0b");
  });

  it("decodes tab, LF, and CR entities", () => {
    expect(decodeWhitespaceEntities("a&#x09;b")).toBe("a\tb");
    expect(decodeWhitespaceEntities("a&#x0A;b")).toBe("a\nb");
    expect(decodeWhitespaceEntities("a&#x0D;b")).toBe("a\rb");
    expect(decodeWhitespaceEntities("a&#9;b")).toBe("a\tb");
    expect(decodeWhitespaceEntities("a&#10;b")).toBe("a\nb");
    expect(decodeWhitespaceEntities("a&#13;b")).toBe("a\rb");
  });

  it("handles multiple occurrences in a single string", () => {
    expect(decodeWhitespaceEntities("a&#x20;b&#x20;c")).toBe("a b c");
  });

  it("matches the lowercase hex form `&#xa0;`", () => {
    expect(decodeWhitespaceEntities("a&#xa0;b")).toBe("a\u00A0b");
  });

  it("leaves non-whitespace numeric entities untouched", () => {
    // Intentionally narrow scope — comments that legitimately mention
    // `&#x41;` (capital A) or other non-whitespace entities are preserved
    // verbatim so we do not change semantics for unrelated content.
    expect(decodeWhitespaceEntities("M&#x26;Ms")).toBe("M&#x26;Ms");
    expect(decodeWhitespaceEntities("char &#x41; here")).toBe("char &#x41; here");
  });

  it("is a no-op for strings without entities", () => {
    expect(decodeWhitespaceEntities("plain text")).toBe("plain text");
    expect(decodeWhitespaceEntities("")).toBe("");
  });

  it("handles realistic FID-39 comment fragments", () => {
    // Comment 4e59728f shape: trailing whitespace marker
    expect(decodeWhitespaceEntities("Plan revision&#x20;")).toBe("Plan revision ");
    // Comment c76450dd shape: backslash-escaped form
    expect(decodeWhitespaceEntities("Plan revision\\&#x20;")).toBe("Plan revision ");
  });
});
