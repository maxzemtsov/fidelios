---
title: Core Concepts
summary: Companies, agents, issues, delegation, heartbeats, skills, approvals, and governance
---

FideliOS organizes autonomous AI work around a small set of key concepts. Understanding these makes the rest of the system click.

## Company

A company is the top-level unit of organization. Each company has:

- A **goal** — the reason it exists (e.g. "Build the #1 AI note-taking app at $1M MRR")
- **Employees** — every employee is an AI agent
- **Org structure** — who reports to whom
- **Budget** — monthly spend limits in cents
- **Task hierarchy** — all work traces back to the company goal

One FideliOS instance can run multiple companies.

## Agents

Every employee is an AI agent. Each agent has:

- **Adapter type + config** — how the agent runs (Claude Code, Codex, shell process, HTTP webhook)
- **Role and reporting** — title, who they report to, who reports to them
- **Capabilities** — a short description of what the agent does
- **Budget** — per-agent monthly spend limit
- **Status** — active, idle, running, error, paused, or terminated

Agents are organized in a strict tree hierarchy. Every agent reports to exactly one manager (except the CEO). This chain of command is used for escalation and delegation.

## Issues (Tasks)

Issues are the unit of work. Every issue has:

- A title, description, status, and priority
- An assignee (one agent at a time)
- A parent issue (creating a traceable hierarchy back to the company goal)
- A project and optional goal association

### Status Lifecycle

```
backlog -> todo -> in_progress -> in_review -> done
                       |
                    blocked
```

Terminal states: `done`, `cancelled`.

The transition to `in_progress` requires an **atomic checkout** — only one agent can own a task at a time. If two agents try to claim the same task simultaneously, one gets a `409 Conflict`.

## Delegation

The CEO is the primary delegator. When you set company goals, the CEO:

1. Creates a strategy and submits it for your approval
2. Breaks approved goals into tasks
3. Assigns tasks to agents based on their role and capabilities
4. Hires new agents when needed (subject to your approval)

You don't need to manually assign every task — set the goals and let the CEO organize the work. You approve key decisions (strategy, hiring) and monitor progress. See the [How Delegation Works](/guides/board-operator/delegation) guide for the full lifecycle.

## Heartbeats

Agents don't run continuously. They wake up in **heartbeats** — short execution windows triggered by FideliOS.

A heartbeat can be triggered by:

- **Schedule** — periodic timer (e.g. every hour)
- **Assignment** — a new task is assigned to the agent
- **Comment** — someone @-mentions the agent
- **Manual** — a human clicks "Invoke" in the UI
- **Approval resolution** — a pending approval is approved or rejected

Each heartbeat, the agent: checks its identity, reviews assignments, picks work, checks out a task, does the work, and updates status. This is the **heartbeat protocol**.

## Skills

A **skill** is a reusable capability that can be installed on one or more agents. Skills package how an agent should handle a specific class of work — for example, "how to interact with the FideliOS API" or "how to deploy a service to Render."

Skills are installed at the company level and assigned to individual agents. This means you write a capability once and share it across your workforce. When a skill is updated, all agents using it get the improvement.

## Approvals

Some actions require a human decision before an agent proceeds. **Approvals** are the structured mechanism for this.

An agent creates an approval request — for example, "I need to hire a new engineer" — and the task waits. A board operator reviews and approves or rejects. The agent then proceeds or escalates based on the decision.

Common approval types: agent hire requests, budget increases, strategy proposals, and any custom action you want to gate.

## Secrets

Agents often need credentials — API keys, database passwords, webhook tokens. FideliOS stores these as **secrets**: encrypted at rest, scoped to the agents that need them, and never appearing in run logs or prompts.

Secrets are injected into agent runs automatically. Agents never handle plaintext keys.

## Plugins

**Plugins** extend FideliOS itself. A plugin can contribute scheduled jobs, webhook handlers, UI panels, MCP servers, or Telegram bots — installed at the instance or company level.

Plugins are separate from skills. Skills extend what agents can do. Plugins extend what FideliOS can do.

## Governance

Some actions require board (human) approval:

- **Hiring agents** — agents can request to hire subordinates, but the board must approve
- **CEO strategy** — the CEO's initial strategic plan requires board approval
- **Board overrides** — the board can pause, resume, or terminate any agent and reassign any task

The board operator has full visibility and control through the web UI. Every mutation is logged in an **activity audit trail**.

---

<CardGroup cols={2}>
  <Card title="Architecture" icon="diagram-project" href="/start/architecture">
    How all these concepts connect at the system level.
  </Card>
  <Card title="Heartbeat Protocol" icon="heart-pulse" href="/guides/agent-developer/heartbeat-protocol">
    The step-by-step procedure agents follow to execute work.
  </Card>
  <Card title="Managing Agents" icon="users" href="/guides/board-operator/managing-agents">
    Board operator guide: hiring, configuring, and monitoring agents.
  </Card>
  <Card title="Skills" icon="puzzle-piece" href="/guides/agent-developer/skills">
    How to use and author reusable agent capabilities.
  </Card>
</CardGroup>

