---
name: fidelios-create-agent
description: >
  Create new agents in FideliOS with governance-aware hiring. Use when you need
  to inspect adapter configuration options, compare existing agent configs,
  triage the new agent's skills, author its four-file instruction package, and
  submit a hire request.
---

# FideliOS Create Agent Skill

Use this skill when you are asked to hire/create an agent.

## Preconditions

You need either:

- board access, or
- agent permission `can_create_agents=true` in your company

If you do not have this permission, escalate to your CEO or board.

## Workflow

1. Confirm identity and company context.

```sh
curl -sS "$FIDELIOS_API_URL/api/agents/me" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"
```

2. Discover available adapter configuration docs for this FideliOS instance.

```sh
curl -sS "$FIDELIOS_API_URL/llms/agent-configuration.txt" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"
```

3. Read adapter-specific docs (example: `claude_local`).

```sh
curl -sS "$FIDELIOS_API_URL/llms/agent-configuration/claude_local.txt" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"
```

4. Compare existing agent configurations in your company.

```sh
curl -sS "$FIDELIOS_API_URL/api/companies/$FIDELIOS_COMPANY_ID/agent-configurations" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"
```

5. Discover allowed agent icons and pick one that matches the role.

```sh
curl -sS "$FIDELIOS_API_URL/llms/agent-icons.txt" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"
```

6. Triage skills from the company library (REQUIRED).

List the skills already installed in this company and decide which ones the new
role needs:

```sh
curl -sS "$FIDELIOS_API_URL/api/companies/$FIDELIOS_COMPANY_ID/skills" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"
```

Review every skill in the catalog against the role. Select the ones this agent
will actually use and collect their canonical keys for `desiredSkills`. If the
role needs a skill that is not yet installed, install it first via the
company-skills workflow. Skill triage is not optional — an empty `desiredSkills`
must be a deliberate decision you can justify, not an oversight.

7. Author the four-file instruction package (REQUIRED).

Every hire receives a managed instruction bundle of four files. You MUST author
all four and submit them in `instructionFiles` — do not rely on the generic
scaffold; it is too vague for a specific role. See the "Four-File Instruction
Package" section below for what goes in each file.

8. Draft the hire config: role/title/name, icon, reporting line (`reportsTo`),
   adapter type, adapter and runtime config aligned to this environment,
   capabilities, `desiredSkills` (step 6), `instructionFiles` (step 7), and
   source issue linkage (`sourceIssueId` or `sourceIssueIds`) when the hire came
   from an issue.

9. Submit the hire request.

```sh
curl -sS -X POST "$FIDELIOS_API_URL/api/companies/$FIDELIOS_COMPANY_ID/agent-hires" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CTO",
    "role": "cto",
    "title": "Chief Technology Officer",
    "icon": "crown",
    "reportsTo": "<ceo-agent-id>",
    "capabilities": "Owns technical roadmap, architecture, staffing, execution",
    "desiredSkills": ["vercel-labs/agent-browser/agent-browser"],
    "adapterType": "claude_local",
    "adapterConfig": {"cwd": "/abs/path/to/repo", "model": "claude-opus-4-7"},
    "runtimeConfig": {"heartbeat": {"enabled": true, "intervalSec": 300, "wakeOnDemand": true}},
    "instructionFiles": {
      "AGENTS.md": "# AGENTS.md ... role-specific operational brief ...",
      "SOUL.md": "# SOUL.md ... role-specific persona ...",
      "HEARTBEAT.md": "# HEARTBEAT.md ... role-specific recurring checklist ...",
      "TOOLS.md": "# TOOLS.md ... tools and access ..."
    },
    "sourceIssueId": "<issue-id>"
  }'
```

10. Handle governance state:
- if the response has `approval`, the hire is `pending_approval`
- monitor and discuss on the approval thread
- when the board approves, you will be woken with `FIDELIOS_APPROVAL_ID`; read
  linked issues and close/comment follow-up

```sh
curl -sS "$FIDELIOS_API_URL/api/approvals/<approval-id>" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"

curl -sS -X POST "$FIDELIOS_API_URL/api/approvals/<approval-id>/comments" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"body":"## CTO hire request submitted\n\n- Approval: [<approval-id>](/approvals/<approval-id>)\n- Pending agent: [<agent-ref>](/agents/<agent-url-key-or-id>)\n- Source issue: [<issue-ref>](/issues/<issue-identifier-or-id>)\n\nFour-file instruction package and triaged skills attached."}'
```

If the approval already exists and needs manual linking to the issue:

```sh
curl -sS -X POST "$FIDELIOS_API_URL/api/issues/<issue-id>/approvals" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"approvalId":"<approval-id>"}'
```

After approval is granted, run this follow-up loop:

```sh
curl -sS "$FIDELIOS_API_URL/api/approvals/$FIDELIOS_APPROVAL_ID" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"

curl -sS "$FIDELIOS_API_URL/api/approvals/$FIDELIOS_APPROVAL_ID/issues" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"
```

For each linked issue, either:
- close it if approval resolved the request, or
- comment in markdown with links to the approval and next actions.

## Four-File Instruction Package (REQUIRED)

Every new hire receives a managed bundle of four markdown files. Author all four
and submit them in the `instructionFiles` field of the hire request. FideliOS
scaffolds a generic starting template for each file; your job is to rewrite
every one of them so it is specific to this role. Any file you omit falls back
to the generic scaffold — acceptable only if that file genuinely needs nothing
role-specific.

### `AGENTS.md` — the operational brief

The agent's primary instructions. Must include:

1. **Role identity**: "You are a {role} at {company}. You report to {manager}."
2. **Responsibilities**: 3-5 bullets specific to this role.
3. **Domain context**: key files, directories, repositories, tools, services.
4. **Collaboration**: who to escalate to, who to delegate to, who to coordinate
   with.
5. **Task workflow**: checkout → work → comment → update status.
6. **Critical Safety Rules** (copy verbatim into every agent's `AGENTS.md`):

```
## Critical Safety Rules
- NEVER write FIDELIOS_IN_WORKTREE or FIDELIOS_HOME to ~/.fidelios/instances/default/.env
- NEVER publish npm releases without explicit board approval
- NEVER run fidelios run from the repository source directory
- NEVER modify production config paths to point into /var/folders/ or temp directories
- NEVER delete database backups, .env files, or config without creating a backup first
- ALWAYS work on a per-issue feature branch and open a PR — never commit to the trunk or a production branch
- ALWAYS verify production port is 3100 after any config-related changes
```

7. **Escalation rule**: when Board approval is needed, the agent MUST create an
   Approval request via API (not just comment and wait), set the issue to
   `blocked`, and escalate to its manager after one heartbeat with no response.

### `SOUL.md` — the persona

Who the agent is: strategic posture, standards, voice, and tone. Tailor it to
the role's seniority and function — a QA Lead's posture differs from a Growth
Marketer's. Keep it concrete and behavioral, not a list of adjectives.

### `HEARTBEAT.md` — the recurring checklist

What the agent does on every heartbeat: confirm identity and context, get
assignments, checkout and work, follow up on approvals, escalate blockers, exit
cleanly. Add any cadence specific to the role (e.g. a weekly research pass, a
daily metrics review).

It MUST include a **Git Workflow** section, with the repo's real trunk named:

- One issue → one branch → one PR. Every issue — root or sub-issue — gets its
  own `feature/{ISSUE-ID}` branch; never share a branch across issues or agents.
- Branch from, and PR into, the repo's integration trunk — name it explicitly
  (e.g. `alpha` for `TraitTune_v2`, `main` for repos with no staging branch).
  Never commit to the trunk or a production branch directly.
- Green CI + review, then the merge queue lands the PR.
- If an issue is `blocked_by` another, do not start it — checkout is rejected
  until the blocker is `done`; then branch fresh from the trunk.

### `TOOLS.md` — tools and access

Tool-usage notes for this role. Always include the `bash`/`read` tool rules. If
the role needs credentials, include the `## 1Password Access` section from the
`op-secrets` skill (§8) so the agent can resolve project-scoped vaults — the
`op-secrets` skill must be in the company's skill library for this to work.

Example `AGENTS.md` for a Frontend Engineer:

```
You are a Frontend Engineer at Iron Balls, Inc. You report to CTO.

## Responsibilities
- Build and test React components following the design system at /design-guide
- Implement UI features assigned via FideliOS issues
- Review and fix TypeScript errors before committing
- Coordinate with Backend Engineer on API contracts

## Key Files
- ui/src/components/ — all React components
- ui/src/api/ — API client layer
- ui/src/pages/ — page-level components

## Critical Safety Rules
[include all safety rules above]

## Workflow
- Always checkout issues before working
- Create feature branches: feature/{ISSUE-ID}
- Run pnpm typecheck before committing
- Comment on the issue when work is done
```

## Quality Bar

Before sending a hire request:

- **REQUIRED**: author all four `instructionFiles`, each rewritten for this
  specific role — never left as the generic scaffold.
- **REQUIRED**: triage `desiredSkills` against the company skill library; if a
  needed skill is not installed, install it first.
- Reuse proven config patterns from related agents where possible.
- Set a concrete `icon` from `/llms/agent-icons.txt` so the new hire is
  identifiable in org and task views.
- Avoid secrets in plain text unless required by adapter behavior.
- Ensure the reporting line is correct and in-company.
- If the board requests revision, update the payload (including
  `instructionFiles` and `desiredSkills`) and resubmit through the approval
  flow.

For endpoint payload shapes and full examples, read:
`skills/fidelios-create-agent/references/api-reference.md`
