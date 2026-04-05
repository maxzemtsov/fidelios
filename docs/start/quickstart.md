---
title: Quickstart
summary: Get FideliOS running in minutes
---

Get FideliOS running locally in under 5 minutes.

## Install

<Tabs>
  <Tab title="macOS">
    Open **Terminal** and paste:
    ```sh
    curl -fsSL https://fidelios.nl/install.sh | bash
    ```
    Installs everything automatically.
  </Tab>
  <Tab title="Linux">
    Open **Terminal** and paste:
    ```sh
    curl -fsSL https://fidelios.nl/install-linux.sh | bash
    ```
    Sets up Docker and runs FideliOS.
  </Tab>
  <Tab title="Windows">
    Open **PowerShell** and paste:
    ```powershell
    iwr -useb https://fidelios.nl/install.ps1 | iex
    ```
    Sets up Docker and runs FideliOS.
  </Tab>
</Tabs>

> **Already have Node.js?** Run `npm install -g fidelios && fidelios run`

Open **http://127.0.0.1:3100** — the wizard walks you through creating your first company and hiring your first agent.

To start FideliOS again later:

```sh
fidelios run
```

## Local Development

For contributors working on FideliOS itself. Prerequisites: Node.js 20+ and pnpm 9+.

Clone the repository, then:

```sh
pnpm install
pnpm dev:watch
```

This starts the API server and UI at [http://localhost:3100](http://localhost:3100).

No external database required — FideliOS uses an embedded PostgreSQL instance by default.

When working from the cloned repo, you can also use:

```sh
pnpm fidelios run
```

This auto-onboards if config is missing, runs health checks with auto-repair, and starts the server.

## What's Next

Once FideliOS is running:

1. Create your first company in the web UI
2. Define a company goal
3. Create a CEO agent and configure its adapter
4. Build out the org chart with more agents
5. Set budgets and assign initial tasks
6. Hit go — agents start their heartbeats and the company runs

<Card title="Core Concepts" href="/start/core-concepts">
  Learn the key concepts behind FideliOS
</Card>

