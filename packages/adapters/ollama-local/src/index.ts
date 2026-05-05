export const type = "ollama_local";
export const label = "Ollama (local)";

export const models: Array<{ id: string; label: string }> = [];

export const agentConfigurationDoc = `# ollama_local agent configuration

Adapter: ollama_local

Use when:
- You want a raw chat/streaming adapter that talks directly to Ollama
- You want to bypass the Hermes runtime for non-agentic workloads
  (research, classification, summarization, pre-processing)
- You want to target either a local Ollama daemon (default
  http://localhost:11434) or Ollama Cloud (https://ollama.com) by setting
  OLLAMA_API_KEY
- You want Ollama-native knobs: keep_alive, num_ctx, think

Don't use when:
- You need agentic tool execution (Phase 2 — see FID-16)
- You need Hermes-style provider routing across multiple backends
- You need MCP tool servers wired into the run

Phase 1 scope (current):
- Single-turn chat, streamed deltas piped to onLog("stdout")
- If the model emits tool_calls they are logged as a warning and the
  response is treated as final (no execution)
- Sessions: chat history is round-tripped via sessionParams.messages
  so the next heartbeat can resume the conversation if desired
- Health check probes /api/version + /api/tags + a one-shot "say hello"
  chat to mirror PR #44 hermes-local parity

Core fields:
- model (string, required): Ollama model id, e.g. "llama3.1" or
  "kimi-k2.6:cloud" — any id surfaced by /api/tags is valid
- host (string, optional): Ollama host URL. Defaults to
  http://localhost:11434. Set to https://ollama.com for cloud.
- promptTemplate (string, optional): user prompt template; supports
  {{agent.id}}, {{agent.name}}, {{run.id}}, {{context.*}}
- bootstrapPromptTemplate (string, optional): one-time bootstrap prompt
  prepended on the first turn (no resumed session)

Tunables (all optional):
- keepAlive (string | number, optional): Ollama keep_alive — how long the
  model stays loaded after the request. Examples: "10m", 600, "5m".
- numCtx (number, optional): context window size (Ollama options.num_ctx).
- think (boolean | "low" | "medium" | "high", optional): enable extended
  reasoning for models that support it; thinking trace is streamed to
  onLog("stderr") prefixed with "[thinking] ".
- ollamaTier (string, optional): operator-supplied tag describing the
  Ollama Cloud tier (e.g. "free", "pro", "team"). NOTE: there is no
  public Ollama API to verify a tier — this field is documentation only
  and is surfaced verbatim by testEnvironment.

Operational fields:
- timeoutSec (number, optional): hard cap on the chat call in seconds.
  Defaults to 300. Implemented via the SDK's .abort() method.
- env (object, optional): KEY=VALUE bag. OLLAMA_API_KEY here (or via
  the agent secret store) is forwarded as the cloud Bearer token.

Notes:
- This adapter is in-process. There is no spawned CLI — all I/O is
  HTTP to the configured host using the official "ollama" npm SDK.
- Streaming deltas are written to onLog("stdout") line by line so they
  are visible live in run logs.
- Models list is dynamic: GET /api/tags is called against the configured
  host and merged with the cloud /api/tags when OLLAMA_API_KEY is set.
  Results are cached for 60 seconds per (host, hasKey) tuple.
`;
