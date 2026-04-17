---
title: Quickstart
summary: Get FideliOS running in under 5 minutes
---

You don't need to know anything about development. FideliOS installs with one copy-paste. The hardest part is finding the app where you paste it in (called **Terminal** on Mac, **PowerShell** on Windows) — skip to [First time on a Mac?](/start/first-time-mac) if you've never opened it before.

## Install

<Tabs>
  <Tab title="macOS">
    1. Press `⌘ + Space`, type **Terminal**, press `Enter`.
    2. Paste this and press `Enter`:

       ```sh
       curl -fsSL https://fidelios.nl/install.sh | bash
       ```
    3. Watch the installer. It will install everything it needs (Homebrew, Node.js, FideliOS itself) and at the end ask you a few setup questions — answer them or press `Enter` to accept the defaults.

    When it's done, keep the Terminal window open and continue to [Open FideliOS](#open-fidelios) below.
  </Tab>
  <Tab title="Linux">
    Open a terminal and run:
    ```sh
    curl -fsSL https://fidelios.nl/install-linux.sh | bash
    ```
    Installs Node.js LTS via nvm (no sudo) and the FideliOS CLI.
  </Tab>
  <Tab title="Windows">
    1. Press the Windows key, type **PowerShell**, press `Enter`.
    2. Paste this and press `Enter`:

       ```powershell
       iwr -useb https://fidelios.nl/install.ps1 | iex
       ```

    If Windows blocks the script, open PowerShell as Administrator and run
    `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`, then retry.
  </Tab>
</Tabs>

## Start FideliOS

On **macOS** and **Windows** the installer asks whether to start FideliOS right away — say yes.

If you closed the installer or want to start it manually later:

```sh
fidelios run
```

## Open FideliOS

Open your browser and go to [http://127.0.0.1:3100](http://127.0.0.1:3100).

The first time you open it, a setup wizard walks you through creating your first company and hiring your first agent. No further commands needed.

## Keep it running after you close the terminal

By default FideliOS runs in the foreground of the terminal. To make it start automatically at login and survive closing your terminal window:

<Tabs>
  <Tab title="macOS / Linux">
    ```sh
    fidelios service install
    fidelios service status
    ```
    See [Service Commands](/cli/service-commands) for dev/release mode options.
  </Tab>
  <Tab title="Windows">
    Native background service on Windows is planned. For now keep PowerShell open, or wrap the CLI with [nssm](https://nssm.cc/) or Task Scheduler.
  </Tab>
</Tabs>

## Something didn't work?

See the [Troubleshooting guide](/start/troubleshooting) — it covers the most common install errors and what to do about them.

## What's Next

1. Create your first company in the web UI
2. Define a company goal
3. Create a CEO agent and configure its adapter (Claude, Codex, Gemini, etc.)
4. Build out the org chart with more agents
5. Set budgets and assign initial tasks
6. Hit go — agents start their heartbeats and the company runs

<Card title="Core Concepts" href="/start/core-concepts">
  Learn the key concepts behind FideliOS
</Card>
