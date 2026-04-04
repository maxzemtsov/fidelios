> [!IMPORTANT]
> **April 2025: Third-party tools (OpenClaw, Cline) now charge extra fees. FideliOS doesn't — and saves your tokens on top.** [Learn how →](#-zero-extra-fees-smarter-token-usage-no-provider-restrictions)

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

*Hire AI agents. Give them goals. Run the company from your dashboard.*

[![MIT License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20%2B-brightgreen)](https://nodejs.org)
[![Stars](https://img.shields.io/github/stars/fideliosai/fidelios?style=flat)](https://github.com/fideliosai/fidelios/stargazers)

[**Quick Start**](#quick-start) · [**Why FideliOS**](#why-fidelios) · [**Features**](#features) · [**Architecture**](#architecture) · [**fidelios.nl**](https://fidelios.nl)

<br>

<video src="https://github.com/user-attachments/assets/e64935a9-1676-440e-9120-0e7ce6989a44" width="720" controls></video>

</div>

<br>

## 🚀 Zero extra fees. Smarter token usage. No provider restrictions.

As of April 2025, AI providers started charging extra fees for third-party tools like OpenClaw and Cline — every agent action now costs premium credits on top of your subscription. Many users are already seeing unexpected bills.

**FideliOS is not affected.** We connect through official provider tools (Claude Code, Codex, Gemini CLI), so your agents run entirely within your existing subscription. No extra charges. No restrictions. No surprises.

But we go further — FideliOS **actively saves your money:**

| | |
|:---|:---|
| **🛡️ No extra fees** | While third-party tools now burn premium credits per action, FideliOS runs on your existing plan. You pay what you already pay — nothing more. |
| **⚡ Tokens stay in your pocket** | Built-in context caching (CAG/RAG) means agents don't re-read the same data over and over. Less tokens spent = more work done for the same money. |
| **💸 Go near-zero** | Add local AI models (Ollama, LM Studio) for routine tasks — same management, same quality, near-zero cost. Cloud when you need power, local when you don't. |

### Your subscription. Your savings. Your rules.

<br>

## What is FideliOS?

FideliOS is an **operating system for AI-driven companies**. You define the mission, hire a team of AI agents, set budgets and rules — and they figure out the work.

It's self-hosted, runs locally, and works with any agent runtime: Claude Code, Codex, Cursor, Gemini, OpenClaw — anything that can receive an HTTP heartbeat.

```
You set the goal     →  "Build the #1 AI note-taking app to $1M MRR"
You hire the team    →  CEO, CTO, engineers, marketers — any agent, any provider
You approve and go   →  Review strategy, set budgets, monitor from the dashboard
```

<br>

## Why FideliOS

**The before/after of managing AI agents:**

| 🔴 Without | 🟢 With FideliOS |
|:---|:---|
| 20 Claude Code tabs, no idea who does what. Reboot = start over. | Ticket-based tasks, threaded conversations, sessions persist across reboots. |
| Copy-pasting context between agents manually. | Context flows from task → project → company goal automatically. |
| Reinventing task management with folders and scripts. | Org charts, ticketing, delegation, governance — out of the box. |
| Runaway token costs you discover too late. | Budgets per agent + Peak Hours Guard to block expensive time windows. |
| Recurring jobs you forget to kick off. | Heartbeat scheduler handles it. Management supervises. |
| "Let me fire up Claude Code and babysit this tab..." | Add a task. Agent works until done. Management reviews. |
| Need laptop + terminal to manage anything. | PWA on any device. Telegram bot for approvals and updates on the go. |

<br>

## Features

<table>
<tr>
<td width="50%">

**🔌 Bring Your Own Agent** — Claude Code, Codex, Cursor, Gemini, OpenClaw, or any HTTP-compatible runtime. One org chart for all of them.

**🎯 Goal Alignment** — Every task traces back to the company mission. Agents always know *what* to do and *why*.

**💓 Heartbeat Scheduler** — Agents wake on schedule, check their work, act, and go back to sleep. No babysitting.

**💰 Cost Control** — Monthly budgets per agent. Peak Hours Guard blocks runs during expensive API windows.

**🏢 Multi-Company** — One deployment, many companies, complete data isolation.

**🎫 Ticket System** — Every conversation traced. Every decision explained. Full audit log.

</td>
<td width="50%">

**🛡️ Governance** — You're the board. Approve hires, override strategy, pause or fire any agent.

**📊 Org Chart** — Hierarchies, roles, reporting lines — just like a real company.

**📱 Mobile + Telegram** — PWA works on any device. Telegram plugin for updates, approvals, and task creation.

**🔌 Plugin System** — Extend with Telegram, webhooks, MCP servers. First-class SDK with hot-reload in dev.

**💾 Auto Backups** — Compressed backups every 15 minutes. One-command restore. Optional S3 sync.

**🔄 Self-Updating** — Version checker notifies when a new release is available. One command to upgrade.

</td>
</tr>
</table>

<br>

## What makes FideliOS different

| | |
|:---|:---|
| **🔒 Subscription-safe** | First-party CLI integration means your agents run on your existing subscription — not on metered third-party credits. Zero extra usage fees, zero harness surcharges, zero surprises. |
| **CAG (Context-Augmented Generation)** | Pre-compiled context bundles so agents get full project state in one shot — no API round-trips, no hallucinated context. |
| **RAG-ready architecture** | Structured knowledge retrieval from issues, comments, goals, and org data — agents search, not guess. |
| **Token optimization** | Smart context compression, session persistence across heartbeats, and skip-detection to avoid wasting tokens on no-op runs. |
| **Process security** | Atomic task checkout, budget enforcement, approval gates, and full audit trails — no agent acts without authorization. |
| **Atomic execution** | Task checkout + budget check in one transaction. No double-work, no surprise bills. |
| **Persistent state** | Agents resume the same context across heartbeats — no "starting from scratch" every run. |
| **Skill injection** | Agents learn your workflows at runtime without retraining. |
| **Goal ancestry** | Every task carries the full chain: task → project → company goal. Agents see the big picture. |
| **Plugin-first** | Telegram, webhooks, custom tools — all through a first-class plugin SDK, not hacks. |
| **Zero cloud dependency** | Everything local. Your data stays on your machine. S3 backup is opt-in. |

<br>

## What FideliOS is NOT

> **Not a chatbot** — agents have jobs, not chat windows.
> **Not an agent framework** — we don't build agents, we run companies made of them.
> **Not a workflow builder** — no drag-and-drop. FideliOS models companies with org charts, goals, and governance.
> **Not for one agent** — if you have one agent, you don't need this. If you have twenty — you do.

<br>

---

## Quick Start

```bash
npm install -g fidelios
fidelios run
```

Open **http://127.0.0.1:3100** — the wizard walks you through creating your first company and hiring your first agent. Embedded PostgreSQL starts automatically.

<details>
<summary><strong>All commands</strong></summary>

```bash
fidelios run           # Start the server
fidelios onboard       # Re-run the setup wizard
fidelios doctor        # Check your environment
fidelios update        # Update to the latest version
fidelios db:restore    # Restore from a backup
fidelios --help        # All commands
```

</details>

<details>
<summary><strong>Run from source</strong></summary>

```bash
git clone https://github.com/fideliosai/fidelios.git
cd fidelios
pnpm install
pnpm dev:watch
```

See [doc/DEVELOPING.md](doc/DEVELOPING.md) for the full guide.

</details>

<br>

---

## Backup & Restore

Automatic compressed backups every 15 minutes. Optional S3 cloud sync.

```bash
fidelios db:restore --latest    # Restore latest backup
fidelios db:restore             # Pick from a list
```

<details>
<summary><strong>S3 Cloud Sync</strong></summary>

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

</details>

<br>

---

## Guides

| | |
|:---|:---|
| 📡 [Tailscale Remote Access](doc/TAILSCALE.md) | Access FideliOS from your phone over a secure private network |
| 💬 [Telegram Gateway](doc/TELEGRAM-PLUGIN.md) | Agent updates, approvals, two-way messaging via Telegram |
| 🛠 [Developing](doc/DEVELOPING.md) | Full development guide for contributors |
| 📖 [CLI Reference](doc/CLI.md) | All CLI commands and options |

<br>

---

## Architecture

```
fidelios/
├── cli/               # fidelios CLI — onboard, run, doctor, restore
├── server/            # Express API + Vite UI + embedded PostgreSQL
├── ui/                # React + Vite frontend
├── packages/
│   ├── db/            # Drizzle ORM, migrations, backup/restore
│   ├── shared/        # Types, config schema
│   ├── adapter-utils/ # Shared adapter base
│   ├── adapters/      # claude, codex, cursor, gemini, openclaw…
│   └── plugins/       # Plugin SDK + examples
└── scripts/           # Release, backup, dev tooling
```

**Stack:** Node.js · TypeScript · Express · React · Vite · Drizzle ORM · embedded PostgreSQL

<br>

---

## License

MIT — see [LICENSE](LICENSE).

<p align="center">
  <sub>Open source. Self-hosted. Built for people who want to run companies, not babysit agents.</sub>
</p>
