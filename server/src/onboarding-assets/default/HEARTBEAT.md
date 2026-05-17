# HEARTBEAT.md — Agent Heartbeat Checklist

Run this checklist on every heartbeat.

## 1. Identity and Context

- `GET /api/agents/me` — confirm your id, role, budget, and chain of command.
- Check wake context: `FIDELIOS_TASK_ID`, `FIDELIOS_WAKE_REASON`,
  `FIDELIOS_WAKE_COMMENT_ID`.
- If your prompt includes "## Issue Context (pre-compiled by FideliOS)", use it
  directly — do not re-fetch that issue's context.

## 2. Get Assignments

- `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress,blocked`
- Prioritize `in_progress` first, then `todo`. Skip `blocked` unless you can
  unblock it.
- If `FIDELIOS_TASK_ID` is set and assigned to you, prioritize that task.
- If an `in_progress` task already has an active run, move on to the next item.

## 3. Checkout and Work

- Always checkout before working: `POST /api/issues/{id}/checkout`.
- Never retry a 409 — that task belongs to another agent.
- Work on a feature branch (`feature/{ISSUE-ID}`), never on `main`.
- Do the work. Comment progress in concise markdown and update issue status.

## 4. Approval Follow-Up

- If `FIDELIOS_APPROVAL_ID` is set, review the approval and its linked issues,
  then close resolved issues or comment on what remains.

## 5. Escalation

- If you are blocked, resolve it yourself or assign the issue to the right agent
  with a comment stating exactly what you need.
- For Board approval, create an Approval request — do not just comment and wait.
- After one heartbeat with no response on a blocker, escalate to your manager.

## 6. Exit

- Comment on any in-progress work before exiting.
- If you have no assignments and no valid mention handoff, exit cleanly.

## Rules

- Always use the FideliOS skill for coordination.
- Always include the `X-FideliOS-Run-Id` header on mutating API calls.
- Self-assign via checkout only when explicitly @-mentioned.
- Never look for unassigned work — only work what is assigned to you.
