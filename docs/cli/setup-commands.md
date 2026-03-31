---
title: Setup Commands
summary: Onboard, run, doctor, and configure
---

Instance setup and diagnostics commands.

## `fidelios run`

One-command bootstrap and start:

```sh
pnpm fidelios run
```

Does:

1. Auto-onboards if config is missing
2. Runs `fidelios doctor` with repair enabled
3. Starts the server when checks pass

Choose a specific instance:

```sh
pnpm fidelios run --instance dev
```

## `fidelios onboard`

Interactive first-time setup:

```sh
pnpm fidelios onboard
```

First prompt:

1. `Quickstart` (recommended): local defaults (embedded database, no LLM provider, local disk storage, default secrets)
2. `Advanced setup`: full interactive configuration

Start immediately after onboarding:

```sh
pnpm fidelios onboard --run
```

Non-interactive defaults + immediate start (opens browser on server listen):

```sh
pnpm fidelios onboard --yes
```

## `fidelios doctor`

Health checks with optional auto-repair:

```sh
pnpm fidelios doctor
pnpm fidelios doctor --repair
```

Validates:

- Server configuration
- Database connectivity
- Secrets adapter configuration
- Storage configuration
- Missing key files

## `fidelios configure`

Update configuration sections:

```sh
pnpm fidelios configure --section server
pnpm fidelios configure --section secrets
pnpm fidelios configure --section storage
```

## `fidelios env`

Show resolved environment configuration:

```sh
pnpm fidelios env
```

## `fidelios allowed-hostname`

Allow a private hostname for authenticated/private mode:

```sh
pnpm fidelios allowed-hostname my-tailscale-host
```

## Local Storage Paths

| Data | Default Path |
|------|-------------|
| Config | `~/.fidelios/instances/default/config.json` |
| Database | `~/.fidelios/instances/default/db` |
| Logs | `~/.fidelios/instances/default/logs` |
| Storage | `~/.fidelios/instances/default/data/storage` |
| Secrets key | `~/.fidelios/instances/default/secrets/master.key` |

Override with:

```sh
FIDELIOS_HOME=/custom/home FIDELIOS_INSTANCE_ID=dev pnpm fidelios run
```

Or pass `--data-dir` directly on any command:

```sh
pnpm fidelios run --data-dir ./tmp/fidelios-dev
pnpm fidelios doctor --data-dir ./tmp/fidelios-dev
```
