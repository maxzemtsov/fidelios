---
title: Codex Local
summary: Run OpenAI's Codex CLI as a FideliOS agent — step-by-step install and setup
---

The `codex_local` adapter runs OpenAI's Codex CLI on your own machine as
a FideliOS agent. Your agent works like any other team member — assign
it tasks, connect it to plugins, give it skills — only the underlying
model is ChatGPT / OpenAI instead of Claude or Gemini.

This page walks you through everything from a **fresh machine with no
Codex installed** to a working FideliOS Codex agent. If you already
have the `codex` command working, jump to
[Add Codex to FideliOS](#add-codex-to-fidelios).

## What you need before starting

1. **A FideliOS install** — if you don't have one yet, follow the
   [Quick Start](/start/quickstart).
2. **A ChatGPT account (Plus, Pro, Business, Edu, or Enterprise)**
   **OR** an OpenAI API key. Codex works with either. The ChatGPT
   subscription path is cheaper for most users because it bundles
   Codex usage into your existing plan.
3. **Node.js 20+** — the Codex CLI is distributed on npm. If you
   installed FideliOS already, Node is already on your machine.
   Check with `node --version` in a terminal. If the command is not
   found, install Node from [nodejs.org](https://nodejs.org/en/download)
   first.

## Step 1 — Install the Codex CLI

Pick the tab for your operating system.

### macOS

The easiest path on macOS is **Homebrew**:

```sh
brew install --cask codex
```

If you don't have Homebrew, or you prefer npm (same Codex, just a
different package manager):

```sh
npm install -g @openai/codex
```

### Linux

Codex ships as an npm package on Linux:

```sh
npm install -g @openai/codex
```

If you get a permission error (`EACCES`), it means npm is trying to
write to a system folder. The cleanest fix is to point npm at your home
directory:

```sh
npm config set prefix "$HOME/.npm-global"
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
npm install -g @openai/codex
```

### Windows

Open **PowerShell** (not Command Prompt) and run:

```powershell
npm install -g @openai/codex
```

If PowerShell refuses to run the command with a **PSSecurityException**
("running scripts is disabled on this system"), unlock it for your own
user once and then retry:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
npm install -g @openai/codex
```

## Step 2 — Sign in to Codex

The first time you run `codex`, it will ask you to log in. There are
two ways to authenticate.

### Option A — Sign in with ChatGPT (recommended)

This is the path most people want. Codex piggy-backs on your existing
ChatGPT subscription — no separate billing, no API key to manage.

In a terminal, run:

```sh
codex
```

Codex opens a browser tab at `chatgpt.com`. Sign in with the account
that has your ChatGPT Plus / Pro / Business / Edu / Enterprise
subscription and approve the request. The terminal picks up the login
automatically and drops you into the Codex prompt. Type `exit` or press
<kbd>Ctrl</kbd>+<kbd>C</kbd> twice to leave — you only needed to open
it once to complete the login. The credentials are stored in
`~/.codex/` on macOS/Linux and `%USERPROFILE%\.codex\` on Windows, so
you won't have to sign in again.

### Option B — Sign in with an OpenAI API key

Use this path if you want per-token billing on your OpenAI developer
account instead of a ChatGPT subscription.

1. Create a key at
   [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
2. Export it in the shell you'll use for FideliOS:

    ```sh
    # macOS / Linux
    export OPENAI_API_KEY="sk-..."
    ```

    ```powershell
    # Windows PowerShell
    [System.Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "sk-...", "User")
    ```

    On Windows, **close and reopen** PowerShell after running that
    command so the new variable is visible.

3. You can also paste the key inside FideliOS when you create the
   agent (under the adapter's `env` field) — see
   [Add Codex to FideliOS](#add-codex-to-fidelios) below. That keeps
   the key scoped to a single agent instead of your entire shell.

## Step 3 — Verify Codex works

Run these two checks before going back to FideliOS:

```sh
codex --version
```

You should see a version number like `rust-v0.75.0`. If instead you see
`command not found` / `'codex' is not recognized`, the npm `-g` folder
isn't on your `PATH`. Close and reopen your terminal. If it still
doesn't work, follow the Linux fallback instructions above (the
`npm config set prefix` block) — the same trick works on macOS.

Then run a real probe:

```sh
codex exec "Respond with hello."
```

If Codex prints a short reply, the CLI is fully working and FideliOS
will be able to drive it.

## Add Codex to FideliOS

Now that the CLI works on its own, connect it to a FideliOS agent.

1. In FideliOS, open the agent you want to power with Codex (or create
   a new one).
2. Open **Adapter** → select **Codex Local**.
3. Fill in the configuration fields:

### Configuration fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | string | Yes | Absolute path to the folder the agent works in (e.g. `/Users/you/projects/my-site`). Created automatically if missing and the user has permission. |
| `model` | string | No | Model to use. Leave blank to use Codex's default. |
| `promptTemplate` | string | No | Prompt used for every run. Supports `{{agentId}}`, `{{companyId}}`, `{{runId}}`, `{{agent.name}}`, `{{company.name}}`. |
| `env` | object | No | Environment variables for the Codex process (supports secret refs). Put `OPENAI_API_KEY` here if you chose API-key auth in Step 2. |
| `timeoutSec` | number | No | Process timeout in seconds (`0` = no timeout). |
| `graceSec` | number | No | Grace period before force-kill when a run is cancelled. |
| `dangerouslyBypassApprovalsAndSandbox` | boolean | No | Skip Codex's safety prompts. **Dev only** — never turn on in production. |

4. Click **Test Environment**. FideliOS will verify the CLI is on
   `PATH`, that `cwd` is usable, that auth is present, and will send a
   live "hello" probe to Codex. All four checks should turn green.
5. Save the agent and assign it a task.

## How the adapter behaves

### Session persistence

Codex uses `previous_response_id` for session continuity. FideliOS
serializes and restores this value between heartbeats, so the agent
keeps conversation context across runs — just like a human coworker
remembering what you discussed yesterday.

### Skills injection

FideliOS symlinks your skills into the global Codex skills directory
(`~/.codex/skills`) so Codex can discover them. Your own hand-written
skills in that folder are not overwritten — FideliOS only adds, never
replaces.

When FideliOS is running inside a managed worktree instance
(`FIDELIOS_IN_WORKTREE=true`), the adapter uses a worktree-isolated
`CODEX_HOME` under the FideliOS instance folder instead. That way
Codex skills, sessions, logs, and other runtime state don't leak
across checkouts. The isolated home is seeded from your main Codex
home so auth and config carry over.

For manual local CLI usage outside heartbeat runs — for example
running an agent named `codexcoder` directly from a terminal:

```sh
pnpm fidelios agent local-cli codexcoder --company-id <company-id>
```

This installs any missing skills, creates an agent API key, and
prints shell exports that let you run commands as that agent.

### Instructions resolution

If you set `instructionsFilePath` on the agent, FideliOS reads that
file and prepends it to the prompt sent to `codex exec` on every run.

This is separate from any workspace-level instruction discovery Codex
does on its own. FideliOS does **not** suppress Codex's native
instruction files, so a repo-local `AGENTS.md` may still be loaded in
addition to the FideliOS-managed agent instructions.

### Environment test

The **Test Environment** button checks four things:

- The `codex` command is installed and on `PATH`
- Working directory is absolute and usable (auto-created if missing
  and the user has permission)
- Authentication signal is present (`OPENAI_API_KEY` set, or Codex
  already logged in via ChatGPT)
- A live hello probe (`codex exec --json -` with prompt
  "Respond with hello.") succeeds, proving the CLI can actually reach
  OpenAI

## Troubleshooting

**"Codex CLI not found"** — `codex` is not on `PATH`. Close and reopen
your terminal. If that doesn't help, run `npm prefix -g` to see where
npm installs global binaries, and make sure that folder is on your
`PATH`.

**"No authentication detected"** — you haven't signed in yet. Run
`codex` once from a terminal to complete the browser login, or set
`OPENAI_API_KEY` in the agent's `env` config.

**"Hello probe failed" with a 401 / auth error** — either your
ChatGPT session expired (run `codex` from a terminal to refresh) or
your `OPENAI_API_KEY` is invalid or out of credit.

**Windows: `PSSecurityException` when running `npm`** — PowerShell's
default policy blocks script files. Fix it once with
`Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force`
and retry.

**macOS: `codex` works in one terminal but not another** — your new
`PATH` only applies to shells started after the install. Open a fresh
terminal window.

Still stuck? Open a thread in the [FideliOS Discord](https://discord.gg/fidelios)
or file an issue in the [repo](https://github.com/fideliosai/fidelios).
