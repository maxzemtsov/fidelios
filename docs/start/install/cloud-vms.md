---
title: Install on Cloud VMs
summary: Run FideliOS on AWS, Azure, or any cloud VM
---

FideliOS runs on any Linux VM. This guide covers the extra steps needed to make it accessible from outside the server.

## Supported providers

Any provider with a Linux VM works. Examples below use Ubuntu 24.04 LTS.

| Provider | Recommended VM size |
|----------|---------------------|
| AWS EC2 | t3.small (2 vCPU, 2 GB RAM) |
| Azure | Standard_B2s |
| DigitalOcean | Basic 2 GB Droplet |
| Hetzner | CX22 |
| Google Cloud | e2-small |

## Step 1 — Provision a VM

Create a new VM running Ubuntu 22.04+ LTS. Note your VM's public IP — you'll need it in a moment.

SSH into it:

```sh
ssh ubuntu@<your-vm-ip>
```

## Step 2 — Install FideliOS

```sh
curl -fsSL https://fidelios.nl/install-linux.sh | bash
```

This installs Node.js LTS via nvm (in `~/.nvm`, no sudo) and `npm install -g fidelios`. You get the full CLI: `fidelios run`, `fidelios service install`, `fidelios doctor`.

If nvm-install complains about missing curl, the script installs it via your distro's package manager (`apt-get`, `dnf`, or `yum`) — that's the only step that uses sudo.

## Step 3 — Open port 3100

FideliOS listens on port 3100. Open that port in your provider's firewall so you can reach it from a browser.

| Provider | Where |
|----------|-------|
| AWS EC2 | Security Group → inbound → Custom TCP 3100 from your IP |
| Azure | Network security group → inbound rule port 3100 |
| DigitalOcean | Networking → Firewalls → TCP inbound 3100 |
| Hetzner | Firewall → add rule TCP 3100 |

## Step 4 — Bind FideliOS to all interfaces

By default FideliOS only accepts connections from `127.0.0.1`. To expose it beyond the VM:

```sh
HOST=0.0.0.0 fidelios run
```

Or for the background service, set `HOST` before installing:

```sh
HOST=0.0.0.0 fidelios service install
```

## Step 5 — Run as a background service

```sh
fidelios service install
fidelios service status
```

This writes a systemd user unit (`~/.config/systemd/user/fidelios.service`) with `Restart=always` and a `PATH` that includes `~/.claude/local/bin`, `~/.cargo/bin`, and common adapter locations.

Confirm it's up:

```sh
curl http://localhost:3100/api/health
```

## Step 6 — Private access with Tailscale (recommended)

Exposing port 3100 to the internet works but isn't ideal. A better option is Tailscale so only devices on your private network can reach FideliOS.

1. Install Tailscale on the VM — follow the [Tailscale Linux install docs](https://tailscale.com/kb/1031/install-linux)
2. Join your tailnet: `sudo tailscale up`
3. Find your Tailscale IP: `tailscale ip -4`
4. Close port 3100 in your cloud firewall (only allow Tailscale traffic)
5. Access FideliOS via the Tailscale IP: `http://<tailscale-ip>:3100`

See [Tailscale Private Access](/deploy/tailscale-private-access) for allowed hostnames and MagicDNS.

## Where your data lives

| Data | Location |
|------|----------|
| Config | `~/.fidelios/instances/default/config.json` |
| Database | `~/.fidelios/instances/default/db` |
| Secrets key | `~/.fidelios/instances/default/secrets/master.key` |
| Logs | `~/.fidelios/instances/default/logs` |
| Service log | `~/.fidelios/instances/default/fidelios.log` |

Back up this directory before resizing or destroying the VM.

## Running as a container (advanced)

A `ghcr.io/fideliosai/fidelios` image is published for Kubernetes and docker-compose deployments. Manual pull:

```sh
docker run -d --name fidelios \
  -p 3100:3100 \
  --restart unless-stopped \
  -v fidelios-data:/root/.fidelios \
  ghcr.io/fideliosai/fidelios:latest
```

For a single-VM install the CLI path above is simpler and gives you the full CLI.

## What's Next

<CardGroup cols={2}>
  <Card title="Core Concepts" href="/start/core-concepts">
    Learn how agents, tasks, and goals fit together
  </Card>
  <Card title="Adapters" href="/adapters/overview">
    Connect FideliOS to Claude, Codex, or your own model
  </Card>
</CardGroup>
