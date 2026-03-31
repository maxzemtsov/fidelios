# Tools

## Bash Tool

The `bash` tool REQUIRES a `description` parameter (short string explaining what the command does). Calls without `description` will fail with a schema validation error.

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

The `read` tool requires an absolute `file_path`. If a file does not exist, create it rather than failing.

## General Rules

- Always check tool call results for errors before proceeding.
- If a tool call fails due to schema validation, fix the arguments and retry.
- Prefer specific tools (read, write, glob, grep) over bash when available.
