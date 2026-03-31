---
title: Environment Variables
summary: Full environment variable reference
---

All environment variables that FideliOS uses for server configuration.

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3100` | Server port |
| `HOST` | `127.0.0.1` | Server host binding |
| `DATABASE_URL` | (embedded) | PostgreSQL connection string |
| `FIDELIOS_HOME` | `~/.fidelios` | Base directory for all FideliOS data |
| `FIDELIOS_INSTANCE_ID` | `default` | Instance identifier (for multiple local instances) |
| `FIDELIOS_DEPLOYMENT_MODE` | `local_trusted` | Runtime mode override |

## Secrets

| Variable | Default | Description |
|----------|---------|-------------|
| `FIDELIOS_SECRETS_MASTER_KEY` | (from file) | 32-byte encryption key (base64/hex/raw) |
| `FIDELIOS_SECRETS_MASTER_KEY_FILE` | `~/.fidelios/.../secrets/master.key` | Path to key file |
| `FIDELIOS_SECRETS_STRICT_MODE` | `false` | Require secret refs for sensitive env vars |

## Agent Runtime (Injected into agent processes)

These are set automatically by the server when invoking agents:

| Variable | Description |
|----------|-------------|
| `FIDELIOS_AGENT_ID` | Agent's unique ID |
| `FIDELIOS_COMPANY_ID` | Company ID |
| `FIDELIOS_API_URL` | FideliOS API base URL |
| `FIDELIOS_API_KEY` | Short-lived JWT for API auth |
| `FIDELIOS_RUN_ID` | Current heartbeat run ID |
| `FIDELIOS_TASK_ID` | Issue that triggered this wake |
| `FIDELIOS_WAKE_REASON` | Wake trigger reason |
| `FIDELIOS_WAKE_COMMENT_ID` | Comment that triggered this wake |
| `FIDELIOS_APPROVAL_ID` | Resolved approval ID |
| `FIDELIOS_APPROVAL_STATUS` | Approval decision |
| `FIDELIOS_LINKED_ISSUE_IDS` | Comma-separated linked issue IDs |

## LLM Provider Keys (for adapters)

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude Local adapter) |
| `OPENAI_API_KEY` | OpenAI API key (for Codex Local adapter) |

