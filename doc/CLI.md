# CLI Reference

FideliOS CLI now supports both:

- instance setup/diagnostics (`onboard`, `doctor`, `configure`, `env`, `allowed-hostname`)
- control-plane client operations (issues, approvals, agents, activity, dashboard)

## Base Usage

Use repo script in development:

```sh
pnpm fidelios --help
```

First-time local bootstrap + run:

```sh
pnpm fidelios run
```

Choose local instance:

```sh
pnpm fidelios run --instance dev
```

## Deployment Modes

Mode taxonomy and design intent are documented in `doc/DEPLOYMENT-MODES.md`.

Current CLI behavior:

- `fidelios onboard` and `fidelios configure --section server` set deployment mode in config
- runtime can override mode with `FIDELIOS_DEPLOYMENT_MODE`
- `fidelios run` and `fidelios doctor` do not yet expose a direct `--mode` flag

Target behavior (planned) is documented in `doc/DEPLOYMENT-MODES.md` section 5.

Allow an authenticated/private hostname (for example custom Tailscale DNS):

```sh
pnpm fidelios allowed-hostname dotta-macbook-pro
```

All client commands support:

- `--data-dir <path>`
- `--api-base <url>`
- `--api-key <token>`
- `--context <path>`
- `--profile <name>`
- `--json`

Company-scoped commands also support `--company-id <id>`.

Use `--data-dir` on any CLI command to isolate all default local state (config/context/db/logs/storage/secrets) away from `~/.fidelios`:

```sh
pnpm fidelios run --data-dir ./tmp/fidelios-dev
pnpm fidelios issue list --data-dir ./tmp/fidelios-dev
```

## Context Profiles

Store local defaults in `~/.fidelios/context.json`:

```sh
pnpm fidelios context set --api-base http://localhost:3100 --company-id <company-id>
pnpm fidelios context show
pnpm fidelios context list
pnpm fidelios context use default
```

To avoid storing secrets in context, set `apiKeyEnvVarName` and keep the key in env:

```sh
pnpm fidelios context set --api-key-env-var-name FIDELIOS_API_KEY
export FIDELIOS_API_KEY=...
```

## Company Commands

```sh
pnpm fidelios company list
pnpm fidelios company get <company-id>
pnpm fidelios company delete <company-id-or-prefix> --yes --confirm <same-id-or-prefix>
```

Examples:

```sh
pnpm fidelios company delete PAP --yes --confirm PAP
pnpm fidelios company delete 5cbe79ee-acb3-4597-896e-7662742593cd --yes --confirm 5cbe79ee-acb3-4597-896e-7662742593cd
```

Notes:

- Deletion is server-gated by `FIDELIOS_ENABLE_COMPANY_DELETION`.
- With agent authentication, company deletion is company-scoped. Use the current company ID/prefix (for example via `--company-id` or `FIDELIOS_COMPANY_ID`), not another company.

## Issue Commands

```sh
pnpm fidelios issue list --company-id <company-id> [--status todo,in_progress] [--assignee-agent-id <agent-id>] [--match text]
pnpm fidelios issue get <issue-id-or-identifier>
pnpm fidelios issue create --company-id <company-id> --title "..." [--description "..."] [--status todo] [--priority high]
pnpm fidelios issue update <issue-id> [--status in_progress] [--comment "..."]
pnpm fidelios issue comment <issue-id> --body "..." [--reopen]
pnpm fidelios issue checkout <issue-id> --agent-id <agent-id> [--expected-statuses todo,backlog,blocked]
pnpm fidelios issue release <issue-id>
```

## Agent Commands

```sh
pnpm fidelios agent list --company-id <company-id>
pnpm fidelios agent get <agent-id>
pnpm fidelios agent local-cli <agent-id-or-shortname> --company-id <company-id>
```

`agent local-cli` is the quickest way to run local Claude/Codex manually as a FideliOS agent:

- creates a new long-lived agent API key
- installs missing FideliOS skills into `~/.codex/skills` and `~/.claude/skills`
- prints `export ...` lines for `FIDELIOS_API_URL`, `FIDELIOS_COMPANY_ID`, `FIDELIOS_AGENT_ID`, and `FIDELIOS_API_KEY`

Example for shortname-based local setup:

```sh
pnpm fidelios agent local-cli codexcoder --company-id <company-id>
pnpm fidelios agent local-cli claudecoder --company-id <company-id>
```

## Approval Commands

```sh
pnpm fidelios approval list --company-id <company-id> [--status pending]
pnpm fidelios approval get <approval-id>
pnpm fidelios approval create --company-id <company-id> --type hire_agent --payload '{"name":"..."}' [--issue-ids <id1,id2>]
pnpm fidelios approval approve <approval-id> [--decision-note "..."]
pnpm fidelios approval reject <approval-id> [--decision-note "..."]
pnpm fidelios approval request-revision <approval-id> [--decision-note "..."]
pnpm fidelios approval resubmit <approval-id> [--payload '{"...":"..."}']
pnpm fidelios approval comment <approval-id> --body "..."
```

## Activity Commands

```sh
pnpm fidelios activity list --company-id <company-id> [--agent-id <agent-id>] [--entity-type issue] [--entity-id <id>]
```

## Dashboard Commands

```sh
pnpm fidelios dashboard get --company-id <company-id>
```

## Heartbeat Command

`heartbeat run` now also supports context/api-key options and uses the shared client stack:

```sh
pnpm fidelios heartbeat run --agent-id <agent-id> [--api-base http://localhost:3100] [--api-key <token>]
```

## Local Storage Defaults

Default local instance root is `~/.fidelios/instances/default`:

- config: `~/.fidelios/instances/default/config.json`
- embedded db: `~/.fidelios/instances/default/db`
- logs: `~/.fidelios/instances/default/logs`
- storage: `~/.fidelios/instances/default/data/storage`
- secrets key: `~/.fidelios/instances/default/secrets/master.key`

Override base home or instance with env vars:

```sh
FIDELIOS_HOME=/custom/home FIDELIOS_INSTANCE_ID=dev pnpm fidelios run
```

## Storage Configuration

Configure storage provider and settings:

```sh
pnpm fidelios configure --section storage
```

Supported providers:

- `local_disk` (default; local single-user installs)
- `s3` (S3-compatible object storage)
