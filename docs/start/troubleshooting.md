---
title: Troubleshooting
summary: Common install errors and how to fix them
---

If the installer failed or FideliOS won't start, check this page before anything else.

## Install-time errors

### I have an Intel Mac — is `/usr/local/bin/brew` normal?

Yes. On Intel Macs (x86_64, 2020 and earlier), Homebrew installs to
`/usr/local/` — not `/opt/homebrew/` like it does on Apple Silicon
(M1 / M2 / M3 / M4). Both paths are official and fully supported.

FideliOS handles this automatically:

- `install.sh` sources `brew shellenv` from whichever prefix the
  Homebrew installer chose (so `brew`, `node`, and `npm` are on `PATH`
  in the same install session).
- The launchd service `PATH` (written by `fidelios service install`)
  includes **both** `/opt/homebrew/bin` and `/usr/local/bin`, so
  adapter CLIs (`claude`, `codex`, `gh`, `git`) resolve regardless of
  which Mac you're on.
- `@embedded-postgres/darwin-x64` (Intel native) is published
  alongside `@embedded-postgres/darwin-arm64` — the embedded database
  runs natively on both architectures, no Rosetta.

You don't need to do anything. If the installer finishes and
`fidelios --version` works, you're good.

### `command not found: fidelios` after install

The `npm install -g` step put the binary somewhere not on your `PATH`.

**Fix on macOS / Linux:**
```sh
source ~/.zprofile   # or open a new Terminal window
fidelios --version
```

If that still fails, run `npm config get prefix` — the output is where npm put `fidelios`. Add `<prefix>/bin` to your `PATH`.

### `xcode-select: no developer tools`

macOS-only. Homebrew needs Apple's Command Line Tools. Accept the install dialog that pops up and wait 5-10 minutes. Then re-run the install command.

### Installer hangs on "Waiting for Docker daemon"

The Linux or Windows installer is waiting for Docker Desktop to finish starting. On first install Docker can take 1-2 minutes to boot. If it times out (120 s):

- **Windows:** open Docker Desktop from the Start menu, wait for the whale icon in the system tray to be steady (not animated), re-run the install command.
- **Linux:** `sudo systemctl status docker` — if inactive, `sudo systemctl start docker` then retry.

### `EACCES: permission denied` during `npm install -g`

npm is trying to write to a root-owned directory. Don't sudo — that creates more problems. Instead redirect npm globals to your home dir:

```sh
npm config set prefix "$HOME/.npm-global"
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
npm install -g fidelios@latest
```

The `install.sh` script does this automatically since v0.0.27 — if you hit this on a fresh install, update to the latest installer.

### `Postgres does not support running as root`

You are running FideliOS under UID 0 (common in Docker/VM/cloud root-ssh). Since v0.0.31 FideliOS auto-enables embedded-postgres's `createPostgresUser=true` path for root environments. If you're on an older version:

```sh
npm install -g fidelios@latest   # upgrade to v0.0.31+
```

Or opt out explicitly:
```sh
export FIDELIOS_EMBEDDED_POSTGRES_CREATE_USER=false
```
and run as a non-root user.

## Runtime errors

### Port 3100 already in use

Something is already bound to port 3100 (maybe a previous FideliOS that didn't shut down cleanly).

```sh
fidelios stop      # kill all fidelios processes, clean stale lockfiles
fidelios run       # start fresh
```

### `Command not found in PATH: "claude"` in heartbeat logs

The Claude adapter runs the `claude` CLI to execute agent runs. Install Claude Code (see [Anthropic docs](https://docs.claude.com/en/docs/claude-code/cli)) and re-run:

```sh
fidelios service uninstall
fidelios service install
```

This regenerates the launchd plist / systemd unit with an up-to-date `PATH` that includes `~/.claude/local/bin`.

### Service runs but heartbeats fail silently

Tail the log:

```sh
tail -f ~/.fidelios/instances/default/fidelios.log
```

Look for `ERROR: heartbeat execution failed`. The message tells you which adapter CLI is missing. Install it, then either restart the service (`launchctl kickstart -k gui/$(id -u)/nl.fidelios.server` on macOS) or `fidelios service install` to regenerate the unit with the current `PATH`.

### `pending migrations` loop

The server keeps restarting saying migrations are pending. Apply them explicitly:

```sh
FIDELIOS_MIGRATION_AUTO_APPLY=true fidelios run
```

Or delete the data dir and start from scratch (destroys your data — backup first):

```sh
fidelios stop
rm -rf ~/.fidelios/instances/default
fidelios onboard
```

## Docker-specific

### `manifest unknown` on `docker pull`

The GitHub Container Registry package is private. Ask the FideliOS team to make it public, or pull a specific version:

```sh
docker pull ghcr.io/fideliosai/fidelios:0.0.31
```

If you maintain the repo, set the package visibility to Public at
https://github.com/orgs/fideliosai/packages/container/fidelios/settings.

### Container starts but browser can't reach it

Check the port mapping:

```sh
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

You should see `0.0.0.0:3100->3100/tcp`. If not, the port is already taken on the host. Stop whatever is using 3100 (`lsof -ti:3100 | xargs kill -9`) and restart the container.

## Dev mode (contributors only)

### Auto-Restart toggle is on but agents still get killed on restart

Check you're actually in dev mode:

```sh
fidelios service status
# Should say: Mode: dev (hot-reload)
```

If `Mode: release`, switch: `fidelios service dev`.

### `fidelios service dev` fails with "Could not locate a FideliOS monorepo"

Either `cd ~/fidelios` first, or pass `--repo`:

```sh
fidelios service dev --repo /path/to/your/fidelios/checkout
```

## Still stuck?

Open an issue at [github.com/fideliosai/fidelios/issues](https://github.com/fideliosai/fidelios/issues) with:

- Your OS (`uname -a` on macOS/Linux, `systeminfo` on Windows)
- FideliOS version (`fidelios --version`)
- Full output of the failing command (redact any API keys)
- Tail of `~/.fidelios/instances/default/fidelios.log`
