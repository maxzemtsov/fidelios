# Diagnose Agent Config — API Reference

Response shapes for the endpoints the `diagnose-agent-config` skill reads. All
are `GET`, under `$FIDELIOS_API_URL/api`, authenticated with
`Authorization: Bearer $FIDELIOS_API_KEY`. This skill never mutates anything.

## GET /api/agents/me

Your own identity. Use it to resolve `companyId` and confirm you are an agent
actor.

```json
{
  "id": "agent-uuid",
  "companyId": "company-uuid",
  "name": "ClaudeCoder",
  "role": "engineer",
  "status": "active"
}
```

## GET /api/agents/{id}/configuration

Redacted configuration for one agent. `{id}` accepts a uuid or a shortname.

```json
{
  "id": "agent-uuid",
  "companyId": "company-uuid",
  "name": "ClaudeCoder",
  "role": "engineer",
  "title": "Software Engineer",
  "status": "active",
  "reportsTo": "manager-agent-uuid",
  "adapterType": "claude_local",
  "adapterConfig": {
    "cwd": "/Users/op/projects/acme",
    "model": "claude-opus-4-7",
    "instructionsBundleMode": "managed",
    "instructionsRootPath": "/abs/path/to/instructions",
    "instructionsEntryFile": "AGENTS.md"
  },
  "runtimeConfig": { "heartbeat": { "enabled": true, "intervalSec": 300 } },
  "permissions": { "canCreateAgents": false },
  "updatedAt": "2026-05-19T00:00:00.000Z"
}
```

Secret values inside `adapterConfig` / `runtimeConfig` are already redacted by
the server. Diagnose against `adapterType`, `adapterConfig.cwd`,
`adapterConfig.model`, and the `instructions*` keys.

## GET /api/companies/{companyId}/agent-configurations

An array of the `GET /api/agents/{id}/configuration` shape above — one entry per
agent in the company. Use this for company-wide scope.

## GET /api/agents/{id}/instructions-bundle

The agent's resolved instruction bundle state.

```json
{
  "agentId": "agent-uuid",
  "companyId": "company-uuid",
  "mode": "managed",
  "rootPath": "/abs/path/to/instructions",
  "managedRootPath": "/abs/managed/path",
  "entryFile": "AGENTS.md",
  "resolvedEntryPath": "/abs/path/to/instructions/AGENTS.md",
  "editable": true,
  "warnings": [],
  "legacyPromptTemplateActive": false,
  "legacyBootstrapPromptTemplateActive": false,
  "files": [
    { "path": "AGENTS.md", "size": 1234, "isEntryFile": true }
  ]
}
```

Diagnosis signals:

- `warnings[]` — a non-empty array means the server already detected a problem
  (stale configured root, missing entry file, legacy relative path). Surface
  each entry as its own finding.
- `resolvedEntryPath: null` or empty `files[]` — the agent has no usable
  instructions.
- `editable: false` — the bundle cannot be edited, usually a misconfigured or
  missing root.
- `legacyPromptTemplateActive: true` — a deprecated inline promptTemplate is
  still active.

## GET /api/companies/{companyId}/projects

An array of the company's projects. Each entry has an `id` used for the
workspaces lookup below.

## GET /api/projects/{projectId}/workspaces

An array of the project's workspaces. Diagnosis signals:

- `cwd` — the project's local working directory, if any.
- `repoUrl` — the project's remote git repository, if any.
- A code project whose workspace declares neither is likely misconfigured.
