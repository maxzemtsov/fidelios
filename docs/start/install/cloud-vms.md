---
title: Install on Cloud VMs
summary: Run FideliOS on AWS, Azure, or any cloud VM
---

FideliOS runs on any Linux VM. This guide covers the extra steps needed to make it accessible from outside the server.

## Supported Providers

Any provider that offers a Linux VM will work. The instructions below use Ubuntu 22.04 as the example OS.

| Provider | Recommended VM size |
|----------|---------------------|
| AWS EC2 | t3.small or larger |
| Azure | Standard_B2s or larger |
| DigitalOcean | Basic 2 GB Droplet |
| Hetzner | CX22 or larger |
| Google Cloud | e2-small or larger |

## Step 1 — Provision a VM

Create a new VM running Ubuntu 22.04 LTS. Note your VM's public IP address — you'll need it in a moment.

Make sure you can SSH into it:

```sh
ssh ubuntu@<your-vm-ip>
```

## Step 2 — Install FideliOS

Once connected via SSH, run:

```sh
curl -fsSL https://fidelios.nl/install-linux.sh | bash
```

This installs Docker and the `fidelios` CLI.

## Step 3 — Open Port 3100

FideliOS listens on port `3100`. Open that port in your provider's firewall so you can reach it from a browser.

**AWS** — Edit the inbound rules on your EC2 security group:
- Type: Custom TCP
- Port: 3100
- Source: your IP address (or `0.0.0.0/0` for public access)

**Azure** — Add an inbound security rule on your network security group:
- Port: 3100
- Source: your IP (or Any)

**DigitalOcean / Hetzner** — Add a firewall rule that allows TCP inbound on port 3100.

## Step 4 — Bind FideliOS to All Interfaces

By default FideliOS only listens on `127.0.0.1`. To accept external connections, set the `HOST` variable:

```sh
HOST=0.0.0.0 fidelios run
```

Then open FideliOS in your browser:

```
http://<your-vm-ip>:3100
```

## Step 5 — Run as a System Service

To keep FideliOS running after you close the SSH session and restart on reboot:

```sh
sudo tee /etc/systemd/system/fidelios.service > /dev/null <<EOF
[Unit]
Description=FideliOS
After=network.target

[Service]
ExecStart=/usr/local/bin/fidelios run
Restart=on-failure
User=$USER
Environment=HOME=$HOME
Environment=HOST=0.0.0.0

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now fidelios
```

Check it is running:

```sh
curl http://localhost:3100/api/health
# -> {"status":"ok"}
```

## Private Access with Tailscale (Recommended)

Exposing port 3100 to the internet works but is not ideal. A better option is to use Tailscale so that only devices on your private network can reach FideliOS.

1. Install Tailscale on the VM: follow the [Tailscale Linux install docs](https://tailscale.com/kb/1031/install-linux)
2. Join your Tailnet: `sudo tailscale up`
3. Find your Tailscale IP: `tailscale ip -4`
4. Close port 3100 in your cloud firewall (only allow Tailscale traffic)
5. Access FideliOS via the Tailscale IP: `http://<tailscale-ip>:3100`

See [Tailscale Private Access](/deploy/tailscale-private-access) for details on allowed hostnames and MagicDNS.

## Where Your Data Lives

All data is stored under `~/.fidelios/` on the VM:

| Data | Location |
|------|----------|
| Config | `~/.fidelios/instances/default/config.json` |
| Database | `~/.fidelios/instances/default/db` |
| Secrets key | `~/.fidelios/instances/default/secrets/master.key` |

Back up this directory if you want to preserve your data before resizing or destroying the VM.

## What's Next

<CardGroup cols={2}>
  <Card title="Core Concepts" href="/start/core-concepts">
    Learn how agents, tasks, and goals fit together
  </Card>
  <Card title="Adapters" href="/adapters/overview">
    Connect FideliOS to Claude, Codex, or your own model
  </Card>
</CardGroup>
