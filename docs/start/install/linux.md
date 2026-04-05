---
title: Install on Linux
summary: Get FideliOS running on Linux
---

Get FideliOS running on Linux with a single command.

## Prerequisites

- Ubuntu 22.04+, Debian 12+, or any modern systemd-based distribution
- `curl` installed (`sudo apt install curl`)
- A user account with `sudo` access

## Install

Open a terminal and run:

```sh
curl -fsSL https://fidelios.nl/install-linux.sh | bash
```

The script:

1. Installs Docker if it is not already present
2. Installs the `fidelios` CLI
3. Runs a quick health check

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

Your data is preserved between restarts.

## Run as a System Service (Optional)

To keep FideliOS running in the background and have it start automatically on boot, create a systemd service:

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

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now fidelios
```

Check status:

```sh
sudo systemctl status fidelios
```

View logs:

```sh
journalctl -u fidelios -f
```

## Where Your Data Lives

| Data | Location |
|------|----------|
| Config | `~/.fidelios/instances/default/config.json` |
| Database | `~/.fidelios/instances/default/db` |
| Secrets key | `~/.fidelios/instances/default/secrets/master.key` |
| Logs | `~/.fidelios/instances/default/logs` |

## What's Next

<CardGroup cols={2}>
  <Card title="Core Concepts" href="/start/core-concepts">
    Learn how agents, tasks, and goals fit together
  </Card>
  <Card title="Cloud VMs" href="/start/install/cloud-vms">
    Running FideliOS on AWS, Azure, or other cloud providers
  </Card>
</CardGroup>
