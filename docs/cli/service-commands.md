---
title: Service Commands
summary: Run FideliOS as a persistent background service
---

Run FideliOS as a persistent background service that starts automatically at login and survives terminal close.

## Overview

By default, `fidelios run` runs in the foreground of your terminal — closing the terminal or pressing `Ctrl+C` stops the server.

The `fidelios service` commands register FideliOS with your operating system's process manager:

- **macOS** — [launchd](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html) (`~/Library/LaunchAgents/`)
- **Linux** — [systemd user session](https://systemd.io/) (`~/.config/systemd/user/`)

Once installed, the server:

- Starts automatically at login
- Restarts automatically on crash
- Runs independently of any terminal window

## `fidelios service install`

Registers FideliOS with the OS process manager and starts it immediately.

```sh
fidelios service install          # release mode (default — published binary)
fidelios service install --dev    # dev mode (runs dev-runner.mjs from your repo)
```

### Release vs Dev mode

| Mode | Runs | `Auto-Restart When Idle` toggle | When to use |
|------|------|----------------------------------|-------------|
| `release` | `/opt/homebrew/bin/fidelios run` from `$HOME` — the published CLI | No-op | Normal operation — using FideliOS as a tool |
| `dev` | `node <repo>/scripts/dev-runner.mjs watch` from the repo root | Honored — agents in Company FideliOS can edit source without crashing their own runs | Debugging FideliOS itself with agents in Company `FideliOS` |

Switch between modes later without uninstalling:

```sh
fidelios service dev       # shortcut for `fidelios service switch dev`
fidelios service release   # shortcut for `fidelios service switch release`
fidelios service switch dev --repo ~/some-other-checkout
```

The CLI remembers the selected mode in
`~/.fidelios/instances/default/service-mode.json` so subsequent
`fidelios service status` calls show what's running.

<Tabs>
  <Tab title="macOS">
    Writes a launchd plist to:
    ```
    ~/Library/LaunchAgents/nl.fidelios.server.plist
    ```
    Then loads it with `launchctl load` and immediately force-starts it with
    `launchctl kickstart`. `RunAtLoad=true` + `KeepAlive=true` in the plist mean
    the service starts automatically at login and is restarted by launchd on any
    exit (clean or crash). The plist also seeds `PATH` with the common adapter
    locations (`~/.claude/local/bin`, `~/.codex/bin`, `/opt/homebrew/bin`, …) so
    agent heartbeats can resolve `claude`, `codex`, `gh`, `git`, and friends.

    Expected output:
    ```
    ✓  Plist written to ~/Library/LaunchAgents/nl.fidelios.server.plist
    ✓  Service registered.
    ✓  Service started.
    ◆  FideliOS service installed. It will restart automatically on crash and at login.
    ```
  </Tab>
  <Tab title="Linux">
    Writes a systemd user unit to:
    ```
    ~/.config/systemd/user/fidelios.service
    ```
    Then runs `systemctl --user enable --now fidelios`. The service starts immediately and is enabled for future logins.

    Expected output:
    ```
    ✓  Unit file written to ~/.config/systemd/user/fidelios.service
    ✓  Service enabled and started.
    ◆  Service installed.
    ```
  </Tab>
</Tabs>

> **Onboard shortcut:** `fidelios onboard` offers to run `service install` at the end of the wizard. Answer `y` to skip this manual step.

## `fidelios service uninstall`

Stops and removes the background service.

```sh
fidelios service uninstall
```

<Tabs>
  <Tab title="macOS">
    Runs `launchctl unload` on the plist and removes it from `~/Library/LaunchAgents/`.
  </Tab>
  <Tab title="Linux">
    Runs `systemctl --user stop` and `disable`, removes the unit file, and reloads the systemd daemon.
  </Tab>
</Tabs>

Your data in `~/.fidelios/` is not affected. Reinstall at any time with `fidelios service install`.

This is the single command for stopping **either** a release or a dev service —
both register under the same service name (`nl.fidelios.server`). A dev service
runs `dev-runner.mjs`, which kills its entire child process tree (`pnpm` →
`tsx` → the `node` server → plugin workers) on shutdown, so `uninstall` leaves
nothing running behind it. To stop a dev service without removing it, switch it
back to release mode with `fidelios service release`.

## `fidelios service status`

Reports whether the service is installed, running, and accepting connections.

```sh
fidelios service status
```

Example output (macOS, running):

```
✓  Service file: ~/Library/LaunchAgents/nl.fidelios.server.plist
✓  Service: running (PID 12345)
✓  Port 3100: in use (server is listening)
```

| Check | What it means |
|-------|---------------|
| Service file | Whether the plist or unit file is present on disk |
| Service | `running (PID …)` / `loaded but not running` / `not loaded` |
| Port 3100 | Whether the server is currently accepting connections |

## Recommended workflow

```sh
# First-time setup
fidelios onboard

# Install as a background service
fidelios service install

# Confirm it is running
fidelios service status

# Open the web UI
open http://127.0.0.1:3100   # macOS
xdg-open http://127.0.0.1:3100  # Linux
```

After this, FideliOS starts automatically at login. You do not need to run `fidelios run` again.

## Viewing logs

The service writes stdout and stderr to the FideliOS log file:

```
~/.fidelios/instances/default/fidelios.log
```

Tail it in real time:

```sh
tail -f ~/.fidelios/instances/default/fidelios.log
```

## Stopping everything (`fidelios stop`)

If you see stale processes — leftover embedded PostgreSQL, stuck plugin workers,
or a port still bound after `Ctrl+C` — use:

```sh
fidelios stop
```

This walks the fidelios process tree (server, embedded-postgres and its
background workers, plugin workers, anything bound to ports 3100-3110 / 5173 /
54331), sends SIGTERM, then SIGKILL to stragglers, and removes any stale
`~/.fidelios/instances/*/db/postmaster.pid` so the next `fidelios run` can start
cleanly.

Flags:

| Flag | Purpose |
|------|---------|
| `--service` | Also `launchctl unload` / `systemctl --user stop` the background service |
| `--dry-run` / `-n` | Print what would be killed without killing anything |

## Stray servers started outside the service

`fidelios service uninstall` and `fidelios stop --service` only manage the
**registered** service. A server started *outside* that system — for example a
bare `pnpm --filter @fideliosai/server dev` or `pnpm dev` run in a terminal — is
not a registered service: neither command targets it, and if its terminal
closes it keeps running (re-parented to PID 1) until the machine reboots.

**Always run a background dev server with `fidelios service install --dev`** —
never a bare `pnpm dev`. A registered dev service stops with one command
(`fidelios service uninstall`) and shows up in `fidelios service status`.

To check for a stray server (macOS / Linux):

```sh
pgrep -fl "fidelios run|@fideliosai/server dev|dev-runner.mjs"
lsof -nP -iTCP -sTCP:LISTEN | grep node   # look for unexpected ports

# stop a stray one by its process GROUP — this kills its whole tree:
kill -TERM -$(ps -o pgid= -p <pid> | tr -d ' ')
```

Two servers pointed at the same instance both execute agent heartbeats and
corrupt each other's runs. If more than one FideliOS server is running, stop
the extra one.

## Platform support

| Platform | Process manager | Supported |
|----------|----------------|-----------|
| macOS | launchd | Yes |
| Linux | systemd (user session) | Yes |
| Windows | — | Not supported |
