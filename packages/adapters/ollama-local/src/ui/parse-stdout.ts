import type { TranscriptEntry } from "@fideliosai/adapter-utils";

/**
 * ollama_local emits plain text deltas (not JSONL). Stderr lines may
 * arrive prefixed with `[thinking] ` (model thinking trace) or
 * `[ollama] ` (adapter-level error/warning). Everything else is a
 * normal assistant text delta.
 */
export function parseOllamaStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.replace(/\r?\n$/, "");
  if (!trimmed) return [];

  if (trimmed.startsWith("[thinking]")) {
    const body = trimmed.replace(/^\[thinking\]\s?/, "");
    if (!body) return [];
    return [{ kind: "thinking", ts, text: body, delta: true }];
  }

  if (trimmed.startsWith("[ollama]")) {
    const body = trimmed.replace(/^\[ollama\]\s?/, "");
    return [{ kind: "system", ts, text: body }];
  }

  return [{ kind: "assistant", ts, text: trimmed, delta: true }];
}
