# FideliOS Roadmap

> Last updated: 2026-04-01

## Current: v0.0.11

### Recently Shipped

- **Routines engine** — scheduled and on-demand recurring tasks with concurrency policies
- **Telegram gateway plugin** — bidirectional messaging with inline approval buttons and voice transcription
- **Company skills library** — shared skill system with GitHub import, project scanning, and per-agent assignment
- **Orphaned process recovery** — graceful shutdown, startup reconciliation, and PID-based cancel fallback for detached agent runs
- **Adapter improvements** — `$AGENT_HOME` resolution, Read-before-Write directive, project-scoped routine context

### Known Issues

#### Codex Local Adapter — High Token Consumption (Advisory)

The `codex_local` adapter sends the **full project source tree** as context on every heartbeat run (~936K input tokens/run average). This is an architectural limitation of Codex CLI — it does not support session persistence or incremental context.

**Recommendation:** Avoid assigning the Codex adapter to agents unless specifically needed. Use `claude_local` (37 input tokens/run via session resumption) or `opencode_local` with local Ollama models (zero API cost) instead.

This will be addressed by the **Context Caching** initiative below.

---

## Near-Term: v0.1.x

### Context Caching (CAG) — Level 1 ✅ (In Progress)

Adapter-level caching to reduce redundant token usage:

- [x] Persistent skills directory for Claude adapter (avoid tmpdir rebuild every run)
- [x] In-memory instructions file cache for OpenCode adapter (mtime-based invalidation)
- [x] Read-before-Write directive injected into all OpenCode agent runs
- [ ] Ollama MLX acceleration with NVFP4 quantization (qwen3.5:35b-a3b-coding-nvfp4)

### Context Caching (CAG) — Level 2 (Planned)

FideliOS middleware-level context optimization:

- [ ] **Pre-compiled context bundles** — issue + ancestors + comments assembled once per heartbeat instead of N API calls per agent
- [ ] **Incremental context deltas** — agent receives only changes since last run ("2 new comments, status changed to blocked") instead of full thread replay
- [ ] **Shared agent context store** — cross-agent context deduplication for agents working on the same issue tree

### Egress & Data Controls (Planned)

- [ ] **PII detection** — scan agent outputs for personal data before posting comments or committing code
- [ ] **Egress policy engine** — configurable rules for what data agents can send to external APIs
- [ ] **Audit trail enhancement** — full request/response logging for external API calls with redaction

---

## Mid-Term: v0.2.x

### RAG/CAG Engine — Level 3

Full retrieval-augmented generation for agent context:

- [ ] **Codebase indexing** — embeddings for project source files (pgvector in Neon Postgres)
- [ ] **Semantic issue search** — vector search across issue history, comments, and agent memory
- [ ] **Context-aware heartbeats** — agent receives only relevant files/docs instead of full project tree
- [ ] **qmd integration** — leverage existing `qmd` semantic search for agent memory recall

### Multi-Provider Orchestration

- [ ] **Provider-aware routing** — route tasks to the best adapter based on task type and cost
- [ ] **Ollama cloud integration** — seamless failover between local and cloud Ollama models
- [ ] **Budget-aware model selection** — auto-downgrade to cheaper models when budget is tight

### Governance & Compliance

- [ ] **Agent output review queue** — human-in-the-loop approval for sensitive operations
- [ ] **Role-based secret access** — per-project 1Password service account token routing
- [ ] **Compliance reporting** — automated reports on agent activity, cost, and data access patterns

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started. Feature requests and bug reports welcome via [GitHub Issues](https://github.com/fideliosai/fidelios/issues).
