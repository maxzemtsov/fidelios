<div align="center">

```
███████╗██╗██████╗ ███████╗██╗     ██╗ ██████╗ ███████╗
██╔════╝██║██╔══██╗██╔════╝██║     ██║██╔═══██╗██╔════╝
█████╗  ██║██║  ██║█████╗  ██║     ██║██║   ██║███████╗
██╔══╝  ██║██║  ██║██╔══╝  ██║     ██║██║   ██║╚════██║
██║     ██║██████╔╝███████╗███████╗██║╚██████╔╝███████║
╚═╝     ╚═╝╚═════╝ ╚══════╝╚══════╝╚═╝ ╚═════╝ ╚══════╝
```

**AI Agent Orchestration Platform**

*One dashboard to hire, manage, and scale your AI agent team*

[![MIT License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20%2B-brightgreen)](https://nodejs.org)
[![Stars](https://img.shields.io/github/stars/fideliosai/fidelios?style=flat)](https://github.com/fideliosai/fidelios/stargazers)

[**Quick Start**](#quick-start) · [**Features**](#features) · [**Architecture**](#architecture) · [**fidelios.nl**](https://fidelios.nl)

</div>

---

## What is FideliOS?

FideliOS runs a **team of AI agents like a real company** — org charts, goals, budgets, schedules, and governance — all from a local dashboard you host yourself.

Think of it as a task manager where employees are AI agents. You set the mission. They figure out the work.

| | |
|---|---|
| **01 — Define the goal** | *"Build the #1 AI note-taking app to $1M MRR"* |
| **02 — Hire the team** | CEO, CTO, engineers, marketers — any agent, any provider |
| **03 — Approve & run** | Review strategy, set budgets, hit go — monitor from the dashboard |

Works with **Claude Code, Codex, Cursor, Gemini, OpenClaw**, and any agent that can receive HTTP heartbeats.

---

## Features

| | |
|---|---|
| 🤖 **Bring Your Own Agent** | Any agent, any runtime — one org chart to rule them all |
| 🎯 **Goal Alignment** | Every task traces back to the company mission |
| ⏰ **Heartbeat Scheduler** | Agents wake on schedule, check work, and act autonomously |
| 💰 **Cost Control** | Monthly budgets per agent — when they hit the limit, they stop |
| 🏢 **Multi-Company** | One deployment, many companies, complete data isolation |
| 🎫 **Ticket System** | Every conversation traced, full audit log |
| 🛡 **Governance** | Approve hires, override strategy, pause or terminate any agent |
| 🌳 **Org Chart** | Hierarchies, roles, reporting lines — just like a real company |
| 💾 **Bulletproof Backups** | Hourly compressed backups, one-command restore, optional S3 sync |
| 🔌 **Plugin System** | Extend with custom tools (Telegram, webhooks, custom MCP servers) |

---

## Quick Start

> **Requirements:** Node.js ≥ 20

### Install

```bash
npm install -g fidelios
```

### Run

```bash
fidelios run
```

That's it. Open **http://127.0.0.1:3100** — the setup wizard will guide you through creating your first company and hiring your first agent.

No cloud account needed. An embedded PostgreSQL database starts automatically.

### Useful commands

```bash
fidelios run           # Start the server
fidelios onboard       # Re-run the setup wizard
fidelios doctor        # Check your environment
fidelios db:restore    # Restore from a backup
fidelios --help        # See all commands
```

### Development (from source)

If you want to contribute or run from source:

```bash
git clone https://github.com/fideliosai/fidelios.git
cd fidelios
pnpm install
pnpm dev:watch
```

---

## Backup & Restore

FideliOS backs up your database automatically every 60 minutes.

```bash
# Restore from the latest backup (creates a safety snapshot first)
fidelios db:restore --latest

# Interactive restore — pick from a list
fidelios db:restore
```

### S3 Cloud Sync (optional)

Add to `~/.fidelios/instances/default/config.json`:

```json
{
  "database": {
    "backup": {
      "s3": {
        "enabled": true,
        "bucket": "your-bucket",
        "region": "eu-west-1",
        "prefix": "fidelios/backups/"
      }
    }
  }
}
```

S3 sync happens after every local backup. If S3 is unreachable, local backups continue without interruption.

---

## Architecture

```
fidelios/
├── cli/               # `fidelios` CLI — onboard, run, doctor, restore
├── server/            # Express API + Vite UI + embedded PostgreSQL
├── ui/                # React + Vite frontend
├── packages/
│   ├── db/            # Drizzle ORM, migrations, backup/restore
│   ├── shared/        # Types, config schema
│   ├── adapter-utils/ # Shared adapter base classes
│   └── adapters/      # claude-local, codex-local, cursor-local, gemini…
└── scripts/           # Release, backup, dev tooling
```

**Tech stack:** Node.js · TypeScript · Express · React · Vite · Drizzle ORM · embedded PostgreSQL

---

## Development

```bash
pnpm dev:watch      # Start dev server (API + Vite, watch mode, port 3100)
pnpm build          # Build all packages
pnpm typecheck      # TypeScript type-check across all packages
pnpm test:run       # Run test suite
pnpm db:generate    # Generate a new database migration
pnpm db:migrate     # Apply pending migrations
```

See [doc/DEVELOPING.md](doc/DEVELOPING.md) for the full development guide.

---

## Data Location

Your data lives here — nothing goes to the cloud unless you configure S3.

| OS | Path |
|---|---|
| macOS / Linux | `~/.fidelios/instances/default/` |
| Windows | `%USERPROFILE%\.fidelios\instances\default\` |

Inside: `db/` — database · `data/backups/` — automatic hourly backups · `config.json` — settings

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
  <sub>Open source. Self-hosted. Built for people who want to run companies, not babysit agents.</sub>
</div>
