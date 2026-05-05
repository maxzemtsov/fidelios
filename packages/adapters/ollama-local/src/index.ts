export { getQuotaWindows } from "./server/concurrency.js";

export const type = "ollama_local";
export const label = "Ollama (local)";

export const models: Array<{ id: string; label: string }> = [];

export const agentConfigurationDoc = `# ollama_local agent configuration

Adapter: ollama_local

Use when:
- You want an in-process agent that talks directly to Ollama (local daemon
  or Ollama Cloud) with full tool-calling support
- You want to bypass Hermes for autonomous coding tasks using cloud models
  like Kimi-K2.6:cloud, DeepSeek, or other Ollama-hosted models
- You want Ollama-native knobs: keep_alive, num_ctx, think

Phase 2 capabilities (current):
- In-process agent harness: native tool-calling loop (read, write, bash,
  grep, edit) executed inside the FideliOS server process
- Workspace cwd integration: tools run relative to the issue workspace
- Concurrency cap: Free=1 / Pro=3 / Max=10 concurrent runs per cloud model
- Multi-turn conversation history via sessionParams.messages

Don't use when:
- You need MCP tool servers or Hermes-style provider routing
- You need tools beyond the built-in set (use pi-local or hermes-local)

Core fields:
- model (string, required): Ollama model id, e.g. "llama3.1" or
  "kimi-k2.6:cloud" — any id surfaced by /api/tags is valid
- host (string, optional): Ollama host URL. Defaults to
  http://localhost:11434. Set to https://ollama.com for cloud.
- promptTemplate (string, optional): user prompt template; supports
  {{agent.id}}, {{agent.name}}, {{run.id}}, {{context.*}}
- bootstrapPromptTemplate (string, optional): one-time bootstrap prompt
  prepended on the first turn (no resumed session)

Phase 2 fields (all optional):
- tier ("free" | "pro" | "max", optional): Ollama Cloud concurrency tier.
  Determines the max concurrent runs for cloud models.
  Free=1, Pro=3, Max=10. Defaults to "free".
- maxTurns (number, optional): Max agent tool-calling loop turns before
  halting. Defaults to 20.

Tunables (all optional):
- keepAlive (string | number, optional): Ollama keep_alive — how long the
  model stays loaded after the request. Examples: "10m", 600, "5m".
- numCtx (number, optional): context window size (Ollama options.num_ctx).
- think (boolean | "low" | "medium" | "high", optional): enable extended
  reasoning for models that support it; thinking trace is streamed to
  onLog("stderr") prefixed with "[thinking] ".
- ollamaTier (string, optional): legacy alias for tier (documentation-only
  label for health check display; tier field controls actual cap logic).

Operational fields:
- timeoutSec (number, optional): hard cap on the total chat call per turn
  in seconds. Defaults to 300. Implemented via the SDK's .abort() method.
- env (object, optional): KEY=VALUE bag. OLLAMA_API_KEY here (or via
  the agent secret store) is forwarded as the cloud Bearer token.

Built-in tools (OpenAI-compatible, executed in workspace cwd):
- read(path): read a file
- write(path, content): write a file
- bash(command, timeout?): execute a shell command (max 120s)
- grep(pattern, path?, flags?): search with ripgrep-style patterns
- edit(path, old_string, new_string): exact-match string replacement

Notes:
- Fully in-process: no CLI spawned. All I/O is HTTP to the configured
  Ollama host using the official "ollama" npm SDK.
- Streaming deltas are written to onLog("stdout") line by line.
- Tool execution is logged to onLog("stderr") with name + truncated result.
- Models list is dynamic: GET /api/tags is called against the configured
  host and merged with the cloud /api/tags when OLLAMA_API_KEY is set.
  Results are cached for 60 seconds per (host, hasKey) tuple.
- Concurrency cap queues runs that exceed the tier limit; they do not fail.
`;
