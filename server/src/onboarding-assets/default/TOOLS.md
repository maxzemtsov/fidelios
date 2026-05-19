# Tools

## Bash Tool

The `bash` tool REQUIRES a `description` parameter (a short string explaining
what the command does). Calls without `description` fail with a schema
validation error.

**Correct:**
```json
{"command": "echo $AGENT_HOME", "description": "Print agent home directory"}
```

**Wrong (will fail):**
```json
{"command": "echo $AGENT_HOME"}
```

Always include `description` on every `bash` call.

## Read Tool

The `read` tool requires an absolute `file_path`. If a file does not exist,
create it rather than failing.

## Credentials

If this role needs API keys or other secrets, retrieve them through the
company's secrets workflow (the `op-secrets` skill) — never hard-code
credentials and never write them into source files or `.env`.

## General Rules

- Always check tool call results for errors before proceeding.
- If a tool call fails schema validation, fix the arguments and retry.
- Prefer specific tools (read, write, glob, grep) over bash when available.
