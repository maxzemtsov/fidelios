import pc from "picocolors";

/**
 * ollama_local streams plain text deltas (not JSONL). The adapter
 * already line-buffers stdout in execute.ts, so the CLI just needs to
 * pass lines through with light coloring. Stderr lines may carry the
 * `[thinking]` and `[ollama]` prefixes the adapter writes.
 */
export function printOllamaStreamEvent(raw: string, _debug: boolean): void {
  const line = raw.replace(/\r?\n$/, "");
  if (!line) return;

  if (line.startsWith("[thinking]")) {
    console.log(pc.gray(line));
    return;
  }
  if (line.startsWith("[ollama]")) {
    console.log(pc.yellow(line));
    return;
  }

  console.log(pc.green(line));
}
