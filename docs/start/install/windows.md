---
title: Install on Windows
summary: Get FideliOS running on Windows
---

Get FideliOS running on Windows with a single command.

## Prerequisites

- Windows 10 or 11 (64-bit)
- PowerShell 5.1 or later (built-in on Windows 10+)

No other software required. The installer handles everything.

## Install

Open **PowerShell** (search the Start menu for "PowerShell") and run:

```powershell
iwr -useb https://fidelios.nl/install.ps1 | iex
```

The script:

1. Checks for Node.js and installs it if missing
2. Installs the `fidelios` CLI
3. Runs a quick health check

> If you see a security warning about running scripts, open PowerShell as Administrator and run:
> `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`
> Then retry the install command.

## Start FideliOS

```powershell
fidelios run
```

Then open [http://127.0.0.1:3100](http://127.0.0.1:3100) in your browser.

The first time you open it, a setup wizard walks you through creating your first company and hiring your first agent.

## Stop and Restart

Press `Ctrl+C` in the PowerShell window to stop FideliOS.

To start it again:

```powershell
fidelios run
```

Your data is preserved between restarts.

## Where Your Data Lives

| Data | Location |
|------|----------|
| Config | `%USERPROFILE%\.fidelios\instances\default\config.json` |
| Database | `%USERPROFILE%\.fidelios\instances\default\db` |
| Secrets key | `%USERPROFILE%\.fidelios\instances\default\secrets\master.key` |
| Logs | `%USERPROFILE%\.fidelios\instances\default\logs` |

## Using WSL (Optional)

If you already use Windows Subsystem for Linux (WSL), you can run the Linux installer inside your WSL terminal instead:

```sh
curl -fsSL https://fidelios.nl/install-linux.sh | bash
```

Then follow the [Linux install guide](/start/install/linux). The FideliOS UI is still accessible from your Windows browser at [http://127.0.0.1:3100](http://127.0.0.1:3100).

## What's Next

<CardGroup cols={2}>
  <Card title="Core Concepts" href="/start/core-concepts">
    Learn how agents, tasks, and goals fit together
  </Card>
  <Card title="Adapters" href="/adapters/overview">
    Connect FideliOS to Claude, Codex, or your own model
  </Card>
</CardGroup>
