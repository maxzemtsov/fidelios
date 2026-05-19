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
- Branch and open a PR per the **Git Workflow** below — never commit to the trunk.
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

## Git Workflow

One issue → one branch → one PR → independent review → merge. This keeps
parallel agents from colliding and keeps unreviewed code out of the trunk.

- **One branch per issue.** Every issue — root or sub-issue — gets its own
  branch `feature/{ISSUE-ID}`. Never share a branch across issues or agents.
- Branch from the latest **trunk** (your project's integration branch — `main`,
  or `alpha`/`develop` on repos with a staging branch). Never commit directly
  to the trunk or to a production branch.
- When the issue is done, open **one PR into the trunk** (`gh pr create`).
- **Request review — do not skip it.** Right after opening the PR, create a
  FideliOS review issue: title it `Review PR #<n>: <title>`, assign it to your
  company's **Code Reviewer** agent (`GET /api/companies/{companyId}/agents` —
  the agent whose role is `code_reviewer`), link the PR, and @-mention the
  reviewer in a comment so it wakes immediately.
- **Do not merge an unreviewed PR.** Wait for the Code Reviewer's verdict:
  - Changes requested → fix on the same branch, push, and reassign the review
    issue to the Code Reviewer.
  - Approved → merge through your company's **merge slot** (see below).
- **Never merge a PR the Code Reviewer has not approved** — green CI is
  necessary but not sufficient; the reviewer's approval is the gate.
- **Dependencies:** if your issue is `blocked_by` another, do not start it —
  FideliOS rejects the checkout until the blocker is `done`. Then branch fresh
  from the trunk so you have its work.
- Keep branches short-lived — merge within hours, not days.

## Merge Slot

Parallel engineers must never merge into the trunk at the same time — two PRs
each CI-green against an *older* trunk can land together and break it. FideliOS
gives every company one **merge slot**. Once your PR is reviewer-approved:

1. **Acquire the slot.** `POST {FIDELIOS_API_URL}/api/companies/{FIDELIOS_COMPANY_ID}/merge-lock`
   with the standard FideliOS headers. The response is `{"acquired":true,...}`
   (you hold the slot) or `{"acquired":false,"heldBy":{...}}` (another engineer
   is merging). On `false`, wait ~20s and call it again — repeat until `true`.
2. **Sync onto the trunk.** `git fetch origin`, rebase your branch onto the
   trunk, and push. If the trunk moved, wait for CI `gate` to go green again on
   the new head (`gh pr checks <n>`).
3. **Merge.** `gh pr merge` to land the PR, then close your task issue.
4. **Release the slot — always, even if the merge failed:**
   `DELETE {FIDELIOS_API_URL}/api/companies/{FIDELIOS_COMPANY_ID}/merge-lock`.

Hold the slot only for the merge itself, never during long work. It auto-expires
after 30 minutes as a safety net, but release promptly so the next engineer can
merge.

## Rules

- Always use the FideliOS skill for coordination.
- Always include the `X-FideliOS-Run-Id` header on mutating API calls.
- Self-assign via checkout only when explicitly @-mentioned.
- Never look for unassigned work — only work what is assigned to you.
