import { describe, expect, it } from "vitest";
import { newConversationId, sessionCodec } from "./session-codec.js";

describe("ollama_local sessionCodec", () => {
  it("returns null for null/non-object inputs", () => {
    expect(sessionCodec.deserialize(null)).toBeNull();
    expect(sessionCodec.deserialize("string")).toBeNull();
    expect(sessionCodec.deserialize(["a"])).toBeNull();
    expect(sessionCodec.serialize(null)).toBeNull();
  });

  it("requires a non-empty conversationId", () => {
    expect(sessionCodec.deserialize({ messages: [] })).toBeNull();
    expect(sessionCodec.deserialize({ conversationId: "" })).toBeNull();
  });

  it("accepts legacy sessionId / session_id field names", () => {
    expect(sessionCodec.deserialize({ sessionId: "abc" })).toEqual({
      conversationId: "abc",
      messages: [],
    });
    expect(sessionCodec.deserialize({ session_id: "abc" })).toEqual({
      conversationId: "abc",
      messages: [],
    });
  });

  it("round-trips a conversation with mixed roles", () => {
    const params = {
      conversationId: "ollama-deadbeef",
      messages: [
        { role: "system", content: "you are X" },
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    };
    const decoded = sessionCodec.deserialize(params);
    expect(decoded).toEqual(params);
    const encoded = sessionCodec.serialize(decoded);
    expect(encoded).toEqual(params);
  });

  it("drops malformed message entries", () => {
    const decoded = sessionCodec.deserialize({
      conversationId: "x",
      messages: [
        { role: "user", content: "kept" },
        { role: "alien", content: "dropped" },
        "not-an-object",
        null,
        { role: "assistant" }, // content optional → kept, content normalized to ""
      ],
    });
    expect(decoded?.messages).toEqual([
      { role: "user", content: "kept" },
      { role: "assistant", content: "" },
    ]);
  });

  it("preserves auxiliary keys like tool_calls when round-tripping", () => {
    const tooled = {
      conversationId: "x",
      messages: [
        {
          role: "assistant",
          content: "",
          tool_calls: [{ function: { name: "f", arguments: "{}" } }],
        },
      ],
    };
    const decoded = sessionCodec.deserialize(tooled);
    const messages = decoded?.messages as Array<Record<string, unknown>>;
    expect(messages[0]?.tool_calls).toEqual([
      { function: { name: "f", arguments: "{}" } },
    ]);
  });

  it("getDisplayId returns the conversationId", () => {
    expect(sessionCodec.getDisplayId?.({ conversationId: "abc", messages: [] })).toBe(
      "abc",
    );
    expect(sessionCodec.getDisplayId?.({ sessionId: "legacy", messages: [] })).toBe(
      "legacy",
    );
    expect(sessionCodec.getDisplayId?.(null)).toBeNull();
  });
});

describe("newConversationId", () => {
  it("returns a unique id with the ollama- prefix", () => {
    const a = newConversationId();
    const b = newConversationId();
    expect(a).toMatch(/^ollama-/);
    expect(b).toMatch(/^ollama-/);
    expect(a).not.toBe(b);
  });
});
