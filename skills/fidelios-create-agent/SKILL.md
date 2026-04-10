---
name: fidelios-create-agent
description: >
  Create new agents in FideliOS with governance-aware hiring. Use when you need
  to inspect adapter configuration options, compare existing agent configs,
  draft a new agent prompt/config, and submit a hire request.
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

6. Draft the new hire config:
- role/title/name
- icon (required in practice; use one from `/llms/agent-icons.txt`)
- reporting line (`reportsTo`)
- adapter type
- optional `desiredSkills` from the company skill library when this role needs installed skills on day one
- adapter and runtime config aligned to this environment
- capabilities
- run prompt in adapter config (`promptTemplate` where applicable)
- source issue linkage (`sourceIssueId` or `sourceIssueIds`) when this hire came from an issue

7. Submit hire request.

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
    "adapterType": "codex_local",
    "adapterConfig": {"cwd": "/abs/path/to/repo", "model": "o4-mini"},
    "runtimeConfig": {"heartbeat": {"enabled": true, "intervalSec": 300, "wakeOnDemand": true}},
    "sourceIssueId": "<issue-id>"
  }'
```

8. Handle governance state:
- if response has `approval`, hire is `pending_approval`
- monitor and discuss on approval thread
- when the board approves, you will be woken with `FIDELIOS_APPROVAL_ID`; read linked issues and close/comment follow-up

```sh
curl -sS "$FIDELIOS_API_URL/api/approvals/<approval-id>" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"

curl -sS -X POST "$FIDELIOS_API_URL/api/approvals/<approval-id>/comments" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"body":"## CTO hire request submitted\n\n- Approval: [<approval-id>](/approvals/<approval-id>)\n- Pending agent: [<agent-ref>](/agents/<agent-url-key-or-id>)\n- Source issue: [<issue-ref>](/issues/<issue-identifier-or-id>)\n\nUpdated prompt and adapter config per board feedback."}'
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

## Individualized Agent Instructions (REQUIRED)

Every new hire MUST receive a role-specific `promptTemplate` in `adapterConfig`. Do NOT rely on the generic default template — it is too vague for specialized roles.

Your `promptTemplate` must include:

1. **Role identity**: "You are a {role} at {company}. You report to {manager}."
2. **Responsibilities**: 3-5 bullet points specific to this role (e.g., Frontend Engineer: "Build and test React components", "Follow the design system in /design-guide")
3. **Domain context**: Key files, directories, tools, or services this agent will work with
4. **Collaboration rules**: Who to escalate to, who to delegate to, which agents to coordinate with
5. **Critical Safety Rules** (copy verbatim for every agent):

```
## Critical Safety Rules
- NEVER write FIDELIOS_IN_WORKTREE or FIDELIOS_HOME to ~/.fidelios/instances/default/.env
- NEVER publish npm releases without explicit board approval
- NEVER run fidelios run from the repository source directory
- NEVER modify production config paths to point into /var/folders/ or temp directories
- NEVER delete database backups, .env files, or config without creating a backup first
- ALWAYS work on feature branches (feature/{ISSUE-ID}) — never commit to main
- ALWAYS verify production port is 3100 after any config-related changes
```

6. **Escalation rule**: When Board approval is needed, agent MUST create an Approval request via API (not just comment and wait). Set issue to `blocked` and escalate to manager after 1 heartbeat with no response.
7. **Task workflow**: Checkout → work → comment → update status (matching HEARTBEAT.md patterns)
8. **1Password Access** (if the role needs credentials): Include the `## 1Password Access` section from the `op-secrets` skill (§8). This ensures the agent knows how to securely access project-specific vaults based on the current Issue's Project. The `op-secrets` skill must be in the company's skill library for this to work.

Example for a Frontend Engineer:
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
- Comment on issue when work is done
```

## Quality Bar

Before sending a hire request:

- **REQUIRED**: Include a role-specific `promptTemplate` with all 6 sections above
- if the role needs skills, make sure they already exist in the company library or install them first using the FideliOS company-skills workflow
- Reuse proven config patterns from related agents where possible.
- Set a concrete `icon` from `/llms/agent-icons.txt` so the new hire is identifiable in org and task views.
- Avoid secrets in plain text unless required by adapter behavior.
- Ensure reporting line is correct and in-company.
- Ensure prompt is role-specific and operationally scoped.
- If board requests revision, update payload and resubmit through approval flow.

For endpoint payload shapes and full examples, read:
`skills/fidelios-create-agent/references/api-reference.md`
