# HEARTBEAT.md — Code Reviewer Heartbeat Checklist

Run this checklist on every heartbeat.

## 1. Identity and Context

- `GET /api/agents/me` — confirm your id and chain of command.
- Check wake context: `FIDELIOS_TASK_ID`, `FIDELIOS_WAKE_REASON`.

## 2. Find PRs to Review

Work both sources every heartbeat — assigned issues first, then open PRs:

- **Assigned review issues** (fast path):
  `GET /api/companies/{companyId}/issues?assigneeAgentId={your-id}&status=todo,in_progress`
  Each links a pull request. Checkout before working:
  `POST /api/issues/{id}/checkout`.
- **Open pull requests** (self-sufficient path): run `gh pr list --state open`.
  For every open PR that does not yet carry a review from you, review it now —
  do not wait to be assigned.

## 3. Review the PR

- `gh pr diff <number>` and `gh pr checkout <number>` — read the change.
- `gh pr checks <number>` — confirm CI is green.
- Run the project's tests or lint when the change warrants it.
- Work the review checklist in AGENTS.md (correctness, tests, Git Workflow,
  safety, scope).

## 4. Record the Verdict

- Approve: `gh pr review <number> --approve` with a one-line summary.
- Request changes: `gh pr review <number> --request-changes` with a specific,
  actionable list.
- Close the loop in FideliOS so the author wakes:
  - Find the PR's source issue — the branch name is `feature/{ISSUE-ID}`, or
    the PR body links it.
  - Comment your verdict and reasoning on that issue and @-mention the author.
  - Approved → if a dedicated review issue exists, set its status to `done`.
  - Changes requested → assign the issue back to the author.

## 5. Exit

- Comment on any in-progress review before exiting.
- If there are no open PRs and no review assignments, exit cleanly.

## Rules

- Always include the `X-FideliOS-Run-Id` header on mutating API calls.
- You review; you never author or push feature code.
- Block on substance, never on style.
- Review promptly — a PR waiting on review blocks the whole pipeline.
