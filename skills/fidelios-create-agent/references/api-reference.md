# FideliOS Create Agent API Reference

## Core Endpoints

- `GET /llms/agent-configuration.txt`
- `GET /llms/agent-configuration/:adapterType.txt`
- `GET /llms/agent-icons.txt`
- `GET /api/companies/:companyId/agent-configurations`
- `GET /api/companies/:companyId/skills`
- `POST /api/companies/:companyId/skills/import`
- `GET /api/agents/:agentId/configuration`
- `POST /api/agents/:agentId/skills/sync`
- `POST /api/companies/:companyId/agent-hires`
- `POST /api/companies/:companyId/agents`
- `GET /api/agents/:agentId/config-revisions`
- `POST /api/agents/:agentId/config-revisions/:revisionId/rollback`
- `POST /api/issues/:issueId/approvals`
- `GET /api/approvals/:approvalId/issues`

Approval collaboration:

- `GET /api/approvals/:approvalId`
- `POST /api/approvals/:approvalId/request-revision` (board)
- `POST /api/approvals/:approvalId/resubmit`
- `GET /api/approvals/:approvalId/comments`
- `POST /api/approvals/:approvalId/comments`
- `GET /api/approvals/:approvalId/issues`

## `POST /api/companies/:companyId/agent-hires`

Request body matches agent create shape:

```json
{
  "name": "CTO",
  "role": "cto",
  "title": "Chief Technology Officer",
  "icon": "crown",
  "reportsTo": "uuid-or-null",
  "capabilities": "Owns architecture and engineering execution",
  "desiredSkills": ["vercel-labs/agent-browser/agent-browser"],
  "adapterType": "claude_local",
  "adapterConfig": {
    "cwd": "/absolute/path",
    "model": "claude-opus-4-7"
  },
  "runtimeConfig": {
    "heartbeat": {
      "enabled": true,
      "intervalSec": 300,
      "wakeOnDemand": true
    }
  },
  "instructionFiles": {
    "AGENTS.md": "# AGENTS.md — role-specific operational brief ...",
    "SOUL.md": "# SOUL.md — role-specific persona ...",
    "HEARTBEAT.md": "# HEARTBEAT.md — role-specific recurring checklist ...",
    "TOOLS.md": "# TOOLS.md — tools and access ..."
  },
  "budgetMonthlyCents": 0,
  "sourceIssueId": "uuid-or-null",
  "sourceIssueIds": ["uuid-1", "uuid-2"]
}
```

Response:

```json
{
  "agent": {
    "id": "uuid",
    "status": "pending_approval"
  },
  "approval": {
    "id": "uuid",
    "type": "hire_agent",
    "status": "pending",
    "payload": {
      "desiredSkills": ["vercel-labs/agent-browser/agent-browser"]
    }
  }
}
```

If company setting disables required approval, `approval` is `null` and the agent is created as `idle`.

`desiredSkills` accepts company skill ids, canonical keys, or a unique slug. The server resolves and stores canonical company skill keys.

`instructionFiles` is an optional map of the four managed bundle files —
`AGENTS.md`, `SOUL.md`, `HEARTBEAT.md`, `TOOLS.md` — to their markdown content.
Each file provided overrides that file in the scaffolded role bundle; omitted
files keep the generic scaffold. The materialized bundle is shown in the hire
approval so the human reviewer sees the full instruction package before
deciding. A legacy `adapterConfig.promptTemplate` is still accepted and becomes
`AGENTS.md`, but it no longer suppresses the other three files — prefer
`instructionFiles`.

## Approval Lifecycle

Statuses:

- `pending`
- `revision_requested`
- `approved`
- `rejected`
- `cancelled`

For hire approvals:

- approved: linked agent transitions `pending_approval -> idle`
- rejected: linked agent is terminated

## Safety Notes

- Config read APIs redact obvious secrets.
- `pending_approval` agents cannot run heartbeats, receive assignments, or create keys.
- All actions are logged in activity for auditability.
- Use markdown in issue/approval comments and include links to approval, agent, and source issue.
- After approval resolution, requester may be woken with `FIDELIOS_APPROVAL_ID` and should reconcile linked issues.
