import type { AdapterSessionCodec } from "@fideliosai/adapter-utils";

/**
 * One chat turn as the Ollama SDK expects.
 * Kept loose on purpose so we can serialize even when the model returned
 * unexpected fields (tool_calls, thinking, etc.) — the SDK will ignore
 * unknown keys.
 */
export interface OllamaChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  // Allow round-trip of optional fields like tool_calls without losing them.
  [key: string]: unknown;
}

export interface OllamaSessionParams {
  /** Stable id assigned by the adapter on first execute(); used as displayId. */
  conversationId: string;
  /** Full prior chat history. The next execute() prepends this before the new user turn. */
  messages: OllamaChatMessage[];
}

function isMessageLike(value: unknown): value is OllamaChatMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  if (typeof rec.role !== "string") return false;
  if (rec.role !== "system" && rec.role !== "user" && rec.role !== "assistant" && rec.role !== "tool") {
    return false;
  }
  // content may be string or omitted (e.g., tool_calls only) — be permissive.
  if (typeof rec.content !== "string" && rec.content !== undefined) return false;
  return true;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeMessages(raw: unknown): OllamaChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: OllamaChatMessage[] = [];
  for (const entry of raw) {
    if (!isMessageLike(entry)) continue;
    out.push({
      ...entry,
      content: typeof entry.content === "string" ? entry.content : "",
    });
  }
  return out;
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const rec = raw as Record<string, unknown>;
    const conversationId =
      readNonEmptyString(rec.conversationId) ??
      readNonEmptyString(rec.sessionId) ??
      readNonEmptyString(rec.session_id);
    if (!conversationId) return null;
    return {
      conversationId,
      messages: normalizeMessages(rec.messages),
    };
  },
  serialize(params: Record<string, unknown> | null) {
    if (!params) return null;
    const conversationId =
      readNonEmptyString(params.conversationId) ??
      readNonEmptyString(params.sessionId) ??
      readNonEmptyString(params.session_id);
    if (!conversationId) return null;
    return {
      conversationId,
      messages: normalizeMessages(params.messages),
    };
  },
  getDisplayId(params: Record<string, unknown> | null) {
    if (!params) return null;
    return (
      readNonEmptyString(params.conversationId) ??
      readNonEmptyString(params.sessionId) ??
      readNonEmptyString(params.session_id)
    );
  },
};

export function newConversationId(): string {
  // Lightweight non-cryptographic id; collision-free enough for log labels.
  return `ollama-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
