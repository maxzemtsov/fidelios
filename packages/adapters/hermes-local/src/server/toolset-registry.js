/**
 * Canonical registry of Hermes Agent built-in toolsets.
 *
 * Snapshot from `hermes tools list` (Hermes Agent v0.12.0, 2026.4.30).
 * Used by the triage engine (FID-48) to:
 *   1. expose names + descriptions to the triage LLM,
 *   2. filter LLM-returned toolsets to known names,
 *   3. supply a safe-default fallback when triage fails.
 *
 * Source-of-truth refresh policy: rerun `hermes tools list` and update this
 * file when a new Hermes release adds/removes toolsets.
 *
 * `headlessSafe` flag:
 *   - false  → tool is known to block on stdin or otherwise hang in headless mode.
 *   - true (or omitted) → safe for unattended runs.
 * Currently only `clarify` is marked unsafe (FID-47). The headless I/O contract
 * is being addressed separately under FID-52.
 */

/**
 * @typedef {Object} ToolsetEntry
 * @property {string} name           Canonical Hermes toolset name (matches `-t` flag).
 * @property {string} description    Human + LLM-facing description for triage prompt.
 * @property {boolean} [headlessSafe] Default true; false for stdin-blocking toolsets.
 */

/** @type {ToolsetEntry[]} */
export const HERMES_TOOLSET_REGISTRY = [
  { name: "web", description: "Web Search & Scraping — fetch and parse pages, run web queries." },
  { name: "browser", description: "Browser Automation — drive a real browser (clicks, forms, screenshots)." },
  { name: "terminal", description: "Terminal & Processes — run shell commands, manage long-running processes." },
  { name: "file", description: "File Operations — read, write, edit files on disk." },
  { name: "code_execution", description: "Code Execution — run Python / JavaScript snippets in a sandbox." },
  { name: "vision", description: "Vision / Image Analysis — describe and reason about images." },
  { name: "video", description: "Video Analysis — extract frames, transcribe, summarize video." },
  { name: "image_gen", description: "Image Generation — generate images from text prompts." },
  { name: "moa", description: "Mixture of Agents — multi-model ensemble reasoning." },
  { name: "tts", description: "Text-to-Speech — synthesize spoken audio from text." },
  { name: "skills", description: "Skills — invoke installed Hermes skill packages." },
  { name: "todo", description: "Task Planning — track multi-step todo lists during execution." },
  { name: "memory", description: "Memory — persist facts and preferences across sessions." },
  { name: "session_search", description: "Session Search — search prior chat sessions for context." },
  { name: "clarify", description: "Clarifying Questions — ask the user follow-up questions interactively.", headlessSafe: false },
  { name: "delegation", description: "Task Delegation — spawn sub-agents to handle parts of a task." },
  { name: "cronjob", description: "Cron Jobs — schedule recurring background tasks." },
  { name: "messaging", description: "Cross-Platform Messaging — send messages on Telegram/Discord/Slack/etc." },
  { name: "rl", description: "RL Training — record trajectories for reinforcement-learning fine-tunes." },
  { name: "homeassistant", description: "Home Assistant — control smart-home devices via HA." },
  { name: "spotify", description: "Spotify — control playback and query the Spotify catalog." },
  { name: "yuanbao", description: "Yuanbao — Tencent Yuanbao integration." },
];

/**
 * Safe-default subset used when triage fails or produces no usable result.
 *
 * Chosen to cover the vast majority of FideliOS agent tasks (read code, run
 * commands, fetch the web, persist memory) while excluding stdin-blocking and
 * heavyweight toolsets (`clarify`, `browser`, `image_gen`, etc.).
 */
export const SAFE_DEFAULT_TOOLSETS = [
  "terminal",
  "file",
  "code_execution",
  "web",
  "skills",
  "todo",
  "memory",
  "session_search",
];

/**
 * Map of toolset name → registry entry, for O(1) filter/validation.
 * @type {Map<string, ToolsetEntry>}
 */
export const TOOLSET_BY_NAME = new Map(
  HERMES_TOOLSET_REGISTRY.map((entry) => [entry.name, entry])
);

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isKnownToolset(name) {
  return TOOLSET_BY_NAME.has(name);
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isHeadlessSafeToolset(name) {
  const entry = TOOLSET_BY_NAME.get(name);
  if (!entry) return false;
  return entry.headlessSafe !== false;
}
