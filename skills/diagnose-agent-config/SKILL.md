---
name: diagnose-agent-config
description: >
  Diagnose a FideliOS agent's or company's configuration health and report
  problems — a wrong, missing, or temp-directory working directory; instruction
  bundle warnings; an empty or non-editable bundle; an unconfigured project
  workspace or missing repo remote; a missing model. Use when asked to
  "diagnose an agent", "why is this agent misconfigured", "why won't this agent
  run / wake / pick up work", "health-check this agent or company", or to audit
  agent configuration before a launch. This skill reports findings only and
  never edits configuration.
---

# Diagnose Agent Config

A read-only diagnostic for FideliOS agent and company **configuration health**.
It inspects an agent — or every agent in a company — and reports configuration
problems, each with a recommended fix.

This skill is **diagnostic only**. It never edits configuration. See Safety below.

## When to use

Trigger on a request or assignment that matches any of:

- "diagnose this agent", "why is this agent misconfigured", "why won't this
  agent run / wake / pick up work"
- "health-check the company's agents", "audit agent config before launch"
- an agent that starts but behaves as if it has no instructions, or whose runs
  fail immediately on startup

## When NOT to use

- To actually fix a config problem. Repairing configuration is a deliberate
  `PATCH /api/agents/:id` change an authorized operator makes after reviewing
  this report — it is not something this skill does.
- Instance-level infrastructure checks (database, ports, secrets adapter, LLM
  key). That is the `fidelios doctor` CLI command — a different concern.
- Diagnosing why an *issue tree* stalled or looped. That is execution-liveness
  forensics, not configuration health.

## Safety — MANDATORY

- **Report only. NEVER `PATCH` agent configuration from this skill.** A wrong
  `cwd` or instructions path written into an agent's adapter config can poison
  its launches. Surface the problem and the recommended fix; let an authorized
  operator apply it deliberately.
- **Never echo secret values.** The configuration endpoints already redact
  secrets — keep your report at that level. If you find a secret exposed in
  plain text, report *that it is exposed*, not the value.
- This skill issues only `GET` requests.

## Authentication

Standard FideliOS skill auth — `Authorization: Bearer $FIDELIOS_API_KEY`, all
endpoints under `$FIDELIOS_API_URL/api`. See the `fidelios` skill for the full
auth contract and environment variables.

## Procedure

### 1. Resolve scope

Confirm identity and decide whether you are diagnosing one agent or the company.

```sh
curl -sS "$FIDELIOS_API_URL/api/agents/me" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"
```

- **Single agent** — an agent id or shortname was named in the request.
- **Whole company** — no specific agent named, or the request says "all agents"
  / "the company".

### 2. Fetch the configuration(s)

Single agent:

```sh
curl -sS "$FIDELIOS_API_URL/api/agents/<agent-id>/configuration" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"
```

Whole company:

```sh
curl -sS "$FIDELIOS_API_URL/api/companies/$FIDELIOS_COMPANY_ID/agent-configurations" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"
```

### 3. Run the configuration checks

For each agent, classify every check **pass / warn / fail**:

**(a) Adapter.** `adapterType` is set and `adapterConfig` is a non-empty object.
A terminated agent (`status: "terminated"`) is out of scope — skip it.

**(b) Working directory.** If `adapterConfig.cwd` is set:

- it MUST be an **absolute path** (`/...`) — a relative `cwd` is a `fail`;
- it MUST NOT point inside a temporary directory (`/var/folders/`,
  `/private/var/folders/`, `/tmp/`) — a temp `cwd` is a known launch-poisoning
  failure mode, so it is a `fail`;
- if you have a shell, the directory should exist (`test -d "<cwd>"`) — a
  missing directory is a `fail`; "could not check (no shell)" is a `warn`.

**(c) Model.** `adapterConfig.model` is set. A missing model for an adapter that
needs one is a `warn`.

**(d) Instruction bundle.** Fetch the bundle:

```sh
curl -sS "$FIDELIOS_API_URL/api/agents/<agent-id>/instructions-bundle" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"
```

- surface **every** string in `warnings[]` as its own finding — the server
  already flags stale configured roots, missing entry files, and legacy
  relative paths there;
- `resolvedEntryPath` must be non-null and `files[]` must be non-empty — an
  empty bundle means the agent effectively has no instructions (`fail`);
- `editable` should be `true`;
- `legacyPromptTemplateActive: true` → `warn` (a deprecated inline
  promptTemplate is still in use; recommend migrating to a managed bundle).

### 4. Check project workspaces (repo remotes)

```sh
curl -sS "$FIDELIOS_API_URL/api/companies/$FIDELIOS_COMPANY_ID/projects" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"
```

For each project, fetch its workspaces:

```sh
curl -sS "$FIDELIOS_API_URL/api/projects/<project-id>/workspaces" \
  -H "Authorization: Bearer $FIDELIOS_API_KEY"
```

- each workspace should declare at least one of `cwd` / `repoUrl`;
- a code project whose workspace has no `repoUrl` → `warn` ("no repo remote
  configured");
- **optional, only with a shell:** verify the remote resolves —
  `git -C "<cwd>" remote -v`, or `git ls-remote "<repoUrl>"`. Do **not** mark a
  check `fail` on a network or auth error — report "remote configured, could
  not verify reachability" instead.

### 5. Report

Produce a findings report — and change nothing:

- a table with columns: agent, check, status (pass / warn / fail), detail,
  recommended fix;
- one summary line: N agents checked, M warnings, K failures;
- if this skill was triggered by an issue, post the report as a markdown issue
  comment; otherwise return it directly to the requester.

Every `fail` and `warn` must name the **recommended fix** (e.g. "set
`adapterConfig.cwd` to the absolute repo path on the agent settings page"), but
the skill itself applies nothing.

## Reference

For endpoint response shapes, read
`skills/diagnose-agent-config/references/api-reference.md`.
