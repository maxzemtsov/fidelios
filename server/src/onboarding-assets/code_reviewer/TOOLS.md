# Tools

## Bash Tool

The `bash` tool REQUIRES a `description` parameter (a short string explaining
what the command does). Calls without `description` fail with a schema
validation error.

## Read Tool

The `read` tool requires an absolute `file_path`.

## Reviewing with `gh`

- `gh pr list` — open pull requests.
- `gh pr checkout <number>` — check a PR's branch out locally.
- `gh pr diff <number>` — view the diff.
- `gh pr view <number>` — the PR description and metadata.
- `gh pr checks <number>` — CI status; confirm it is green before approving.
- `gh pr review <number> --approve` / `--request-changes` — record your verdict.

## General Rules

- Always check tool call results for errors before proceeding.
- Prefer specific tools (read, glob, grep) over bash when available.
- You do not need credentials to review — you read code, run tests, and post
  reviews. Do not request secret access unless a specific check requires it.
