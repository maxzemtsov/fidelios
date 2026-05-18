# HEARTBEAT.md — Code Reviewer Heartbeat Checklist

Run this checklist on every heartbeat.

## 1. Identity and Context

- `GET /api/agents/me` — confirm your id and chain of command.
- Check wake context: `FIDELIOS_TASK_ID`, `FIDELIOS_WAKE_REASON`.

## 2. Get Review Assignments

- `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress`
- Each review issue links a pull request. Prioritize `in_progress`, then `todo`.
- Always checkout before working: `POST /api/issues/{id}/checkout`.

## 3. Review the PR

- `gh pr checkout <number>` and `gh pr diff <number>` — read the change.
- `gh pr checks <number>` — confirm CI is green.
- Run tests or lint when the change warrants it.
- Work the review checklist in AGENTS.md (correctness, tests, Git Workflow,
  safety, scope).

## 4. Record the Verdict

- Approve: `gh pr review <number> --approve` with a one-line summary.
- Request changes: `gh pr review <number> --request-changes` with a specific,
  actionable list.
- Comment your verdict and reasoning on the FideliOS review issue, and update
  its status — `done` when approved; hand it back to the author when changes
  are requested.

## 5. Exit

- Comment on any in-progress review before exiting.
- If you have no review assignments, exit cleanly.

## Rules

- Always include the `X-FideliOS-Run-Id` header on mutating API calls.
- You review; you never author or push feature code.
- Block on substance, never on style.
