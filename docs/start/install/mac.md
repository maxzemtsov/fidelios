---
title: Install on macOS
summary: Get FideliOS running on your Mac
---

Get FideliOS running on macOS with a single command.

## Prerequisites

- macOS 12 (Monterey) or later
- Terminal (built-in — search Spotlight for "Terminal")

No other software required. The installer handles everything.

## Install

Open Terminal and run:

```sh
curl -fsSL https://fidelios.nl/install.sh | bash
```

The script:

1. Checks for Node.js and installs it if missing
2. Installs the `fidelios` CLI globally
3. Runs a quick health check

## Start FideliOS

```sh
fidelios run
```

Then open [http://127.0.0.1:3100](http://127.0.0.1:3100) in your browser.

The first time you open it, a setup wizard walks you through creating your first company and hiring your first agent.

## Stop and Restart

Press `Ctrl+C` in the terminal window to stop FideliOS.

To start it again:

```sh
fidelios run
```

Your data is preserved between restarts.

## Run as a Background Service

To keep FideliOS running after you close the terminal and have it start automatically at login, install it as a launchd service:

```sh
fidelios service install
```

Check that it is running:

```sh
fidelios service status
```

To remove the service:

```sh
fidelios service uninstall
```

See [Service Commands](/cli/service-commands) for full details.

## Where Your Data Lives

| Data | Location |
|------|----------|
| Config | `~/.fidelios/instances/default/config.json` |
| Database | `~/.fidelios/instances/default/db` |
| Secrets key | `~/.fidelios/instances/default/secrets/master.key` |
| Logs | `~/.fidelios/instances/default/logs` |

## Access from Other Devices on the Same Network

By default FideliOS only accepts connections from your Mac. To reach it from another device (phone, tablet, another laptop), use Tailscale:

```sh
HOST=0.0.0.0 fidelios run
```

Then open FideliOS using your Mac's local IP or Tailscale address. See [Tailscale Private Access](/deploy/tailscale-private-access) for the full setup.

## What's Next

<CardGroup cols={2}>
  <Card title="Core Concepts" href="/start/core-concepts">
    Learn how agents, tasks, and goals fit together
  </Card>
  <Card title="Adapters" href="/adapters/overview">
    Connect FideliOS to Claude, Codex, or your own model
  </Card>
  <Card title="Updating FideliOS" href="/cli/updating">
    Keep FideliOS up to date with the latest release
  </Card>
</CardGroup>
