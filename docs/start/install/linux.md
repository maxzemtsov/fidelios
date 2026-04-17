---
title: Install on Linux
summary: Get FideliOS running on Linux
---

Get FideliOS running on Linux with a single command.

## Prerequisites

- Ubuntu 22.04+, Debian 12+, Fedora 39+, or any modern Linux distribution
- `curl` installed (the installer installs it for you if missing)

You do **not** need Docker, sudo, or a system-wide Node install — FideliOS installs Node.js into your home directory via `nvm` and the CLI via user-local npm.

## Install

Open a terminal and run:

```sh
curl -fsSL https://fidelios.nl/install-linux.sh | bash
```

The script:

1. Installs `curl` (if missing) via your distro's package manager — needs sudo only for this step
2. Installs Node.js LTS via `nvm` into `~/.nvm` — no sudo
3. Redirects npm's global prefix to `~/.npm-global` if the default prefix isn't writable
4. Installs the `fidelios` CLI (`npm install -g fidelios@latest`)
5. Runs the interactive setup wizard — or `fidelios onboard --yes` in non-interactive shells

## Start FideliOS

```sh
fidelios run
```

Then open [http://127.0.0.1:3100](http://127.0.0.1:3100) in your browser.

The first time you open it, a setup wizard walks you through creating your first company and hiring your first agent.

## Stop and Restart

Press `Ctrl+C` in the terminal to stop FideliOS.

To start it again:

```sh
fidelios run
```

Your data is preserved between restarts in `~/.fidelios/`.

## Run as a Background Service

To keep FideliOS running after you close the terminal and have it start automatically at login:

```sh
fidelios service install
```

This writes a systemd user unit to `~/.config/systemd/user/fidelios.service` and runs `systemctl --user enable --now fidelios`.

Check the service:

```sh
fidelios service status
tail -f ~/.fidelios/instances/default/fidelios.log
```

Remove the service:

```sh
fidelios service uninstall
```

See [Service Commands](/cli/service-commands) for dev/release mode options.

## Running in Docker (advanced)

A `fidelios` container is available at `ghcr.io/fideliosai/fidelios`. This is intended for containerised deployments (Kubernetes, docker-compose, corp platforms). For a single-user desktop or laptop install, the Node+CLI path above is simpler and gives you the full CLI.

```sh
docker run -d --name fidelios \
  -p 3100:3100 \
  --restart unless-stopped \
  -v fidelios-data:/root/.fidelios \
  ghcr.io/fideliosai/fidelios:latest
```

The image is published from the main branch (`:nightly`, `:latest`, `:X.Y.Z`). If `docker pull` returns `manifest unknown` the image may still be private — ask your FideliOS admin to flip the package visibility to Public at GitHub Container Registry.

## Where Your Data Lives

| Data | Location |
|------|----------|
| Config | `~/.fidelios/instances/default/config.json` |
| Database | `~/.fidelios/instances/default/db` |
| Secrets key | `~/.fidelios/instances/default/secrets/master.key` |
| Logs | `~/.fidelios/instances/default/logs` |
| Service log | `~/.fidelios/instances/default/fidelios.log` |

## What's Next

<CardGroup cols={2}>
  <Card title="Core Concepts" href="/start/core-concepts">
    Learn how agents, tasks, and goals fit together
  </Card>
  <Card title="Cloud VMs" href="/start/install/cloud-vms">
    Running FideliOS on AWS, Azure, or other cloud providers
  </Card>
  <Card title="Updating FideliOS" href="/cli/updating">
    Keep FideliOS up to date with the latest release
  </Card>
</CardGroup>
