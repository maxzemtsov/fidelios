export const type = "claude_local";
export const label = "Claude Code (local)";

export const models = [
  { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-6", label: "Claude Haiku 4.6" },
  { id: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

export const agentConfigurationDoc = `# claude_local agent configuration

Adapter: claude_local

Core fields:
- cwd (string, optional): default absolute working directory fallback for the agent process (created if missing when possible)
- instructionsFilePath (string, optional): absolute path to a markdown instructions file injected at runtime
- model (string, optional): Claude model id
- effort (string, optional): reasoning effort passed via --effort. Valid values: low | medium | high | max (GA on Opus 4.7 / 4.6 / Sonnet 4.6). Pick low for fast/cheap subagents, xhigh for deep coding.
- fallbackModel (string, optional): alternative model id passed via --fallback-model when the primary model is overloaded (only applies with --print). Good failover pair: primary=opus, fallback=sonnet.
- maxBudgetUsd (number, optional): hard spend cap in USD for a single run, passed via --max-budget-usd. The Claude Code CLI will abort the run once the cap is reached. Complements FideliOS's per-agent monthly budgets.
- betas (string, optional): comma- or space-separated Anthropic beta-header names forwarded via --betas (API-key users only). Examples worth trying:
    * "advisor-tool-2026-03-01" — let a cheaper executor consult Opus 4.7 as an advisor
    * "task-budgets-2026-03-13" — Opus 4.7 self-paces against a token budget countdown
    * "fast-mode-2026-02-01" — 2.5x output speed on Opus 4.6 (waitlist, 6x price)
- chrome (boolean, optional): pass --chrome when running Claude
- promptTemplate (string, optional): run prompt template
- maxTurnsPerRun (number, optional): max turns for one run
- dangerouslySkipPermissions (boolean, optional): pass --dangerously-skip-permissions to claude
- command (string, optional): defaults to "claude"
- extraArgs (string[], optional): additional CLI args
- env (object, optional): KEY=VALUE environment variables
- workspaceStrategy (object, optional): execution workspace strategy; currently supports { type: "git_worktree", baseRef?, branchTemplate?, worktreeParentDir? }
- workspaceRuntime (object, optional): workspace runtime service intents; local host-managed services are realized before Claude starts and exposed back via context/env

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds

Notes:
- When FideliOS realizes a workspace/runtime for a run, it injects FIDELIOS_WORKSPACE_* and FIDELIOS_RUNTIME_* env vars for agent-side tooling.
`;

