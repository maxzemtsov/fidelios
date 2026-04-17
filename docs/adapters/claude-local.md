---
title: Claude Local
summary: Claude Code local adapter setup and configuration
---

The `claude_local` adapter runs Anthropic's Claude Code CLI locally. It supports session persistence, skills injection, and structured output parsing.

## Prerequisites

- Claude Code CLI installed (`claude` command available)
- `ANTHROPIC_API_KEY` set in the environment or agent config

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | string | Yes | Working directory for the agent process (absolute path; created automatically if missing when permissions allow) |
| `model` | string | No | Claude model to use (see [Supported models](#supported-models) below — defaults to the Claude Code CLI's default when unset) |
| `effort` | string | No | Reasoning effort. Valid: `low`, `medium`, `high`, `max`. Maps to `claude --effort`. Use `low` for cheap subagents, `high` (default) for complex work, `max` for frontier problems. |
| `fallbackModel` | string | No | Alternative Claude model ID used when the primary model is overloaded. Maps to `claude --fallback-model`. Typical pairing: primary=`claude-opus-4-7`, fallback=`claude-sonnet-4-6`. |
| `maxBudgetUsd` | number | No | Hard USD cap for a single run. Maps to `claude --max-budget-usd`. The CLI aborts the run once the cap is reached. Complements FideliOS's per-agent monthly budgets. |
| `betas` | string | No | Comma- or space-separated Anthropic beta-header names forwarded via `claude --betas`. API-key users only. See [Beta features](#beta-features) below. |
| `promptTemplate` | string | No | Prompt used for all runs |
| `env` | object | No | Environment variables (supports secret refs) |
| `timeoutSec` | number | No | Process timeout (0 = no timeout) |
| `graceSec` | number | No | Grace period before force-kill |
| `maxTurnsPerRun` | number | No | Max agentic turns per heartbeat (defaults to `300`) |
| `dangerouslySkipPermissions` | boolean | No | Skip permission prompts (dev only) |

## Supported models

The adapter's model list mirrors whatever the installed Claude Code CLI exposes.
As of FideliOS 0.0.29 the dropdown shows:

| Model ID | Label |
|----------|-------|
| `claude-opus-4-7` | Claude Opus 4.7 |
| `claude-opus-4-6` | Claude Opus 4.6 |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 |
| `claude-haiku-4-6` | Claude Haiku 4.6 |

Leave `model` unset to defer to the Claude Code CLI's default (recommended for
most agents). Explicit overrides are useful when you want to pin a specific
model for cost or capability reasons.

## Beta features

The Claude Code CLI (v2.1.101+) forwards Anthropic beta headers via the
`--betas` flag. Set the `betas` field on your agent's adapter config to
opt in. These are API-key-only features — they do not work with
subscription auth.

### Advisor tool — Opus 4.7 as strategic advisor for cheaper executors

```yaml
model: claude-sonnet-4-6
betas: "advisor-tool-2026-03-01"
```

Lets a faster, cheaper executor (Sonnet or Haiku) consult Opus 4.7
mid-generation for strategic advice. Typical saving: 30-50% of cost
at near-Opus-solo quality on agentic tasks. Works well on long-horizon
coding / research pipelines where the plan matters more than every
output token.

See [Anthropic's Advisor Tool docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool).

### Task budgets — Opus 4.7 self-pacing

```yaml
model: claude-opus-4-7
betas: "task-budgets-2026-03-13"
maxBudgetUsd: 2.50
```

Gives Opus 4.7 a token countdown so it paces itself over a long
agentic loop and finishes gracefully before the limit. Complements
`maxBudgetUsd` (which is a hard cap — task-budget is a soft hint).

Opus 4.7 only. See [Task Budgets docs](https://platform.claude.com/docs/en/build-with-claude/task-budgets).

### Fast mode — 2.5x output speed on Opus 4.6

```yaml
model: claude-opus-4-6
betas: "fast-mode-2026-02-01"
```

Up to 2.5x faster output tokens per second. 6x the token price.
Waitlist-gated, Opus 4.6 only. Useful for real-time tasks; not a default.

See [Fast Mode docs](https://platform.claude.com/docs/en/build-with-claude/fast-mode).

### Combining betas

Space or comma separate to pass multiple:

```yaml
betas: "advisor-tool-2026-03-01, task-budgets-2026-03-13"
```

## Prompt Templates

Templates support `{{variable}}` substitution:

| Variable | Value |
|----------|-------|
| `{{agentId}}` | Agent's ID |
| `{{companyId}}` | Company ID |
| `{{runId}}` | Current run ID |
| `{{agent.name}}` | Agent's name |
| `{{company.name}}` | Company name |

## Session Persistence

The adapter persists Claude Code session IDs between heartbeats. On the next wake, it resumes the existing conversation so the agent retains full context.

Session resume is cwd-aware: if the agent's working directory changed since the last run, a fresh session starts instead.

If resume fails with an unknown session error, the adapter automatically retries with a fresh session.

## Skills Injection

The adapter creates a temporary directory with symlinks to FideliOS skills and passes it via `--add-dir`. This makes skills discoverable without polluting the agent's working directory.

For manual local CLI usage outside heartbeat runs (for example running as `claudecoder` directly), use:

```sh
pnpm fidelios agent local-cli claudecoder --company-id <company-id>
```

This installs FideliOS skills in `~/.claude/skills`, creates an agent API key, and prints shell exports to run as that agent.

## Environment Test

Use the "Test Environment" button in the UI to validate the adapter config. It checks:

- Claude CLI is installed and accessible
- Working directory is absolute and available (auto-created if missing and permitted)
- API key/auth mode hints (`ANTHROPIC_API_KEY` vs subscription login)
- A live hello probe (`claude --print - --output-format stream-json --verbose` with prompt `Respond with hello.`) to verify CLI readiness

