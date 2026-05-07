/**
 * Headless I/O contract for hermes-local (FID-52).
 *
 * Hermes ships interactive toolsets — most notably `clarify` — that block on
 * `stdin.read()` waiting for a human answer. When FideliOS spawns Hermes
 * unattended, no human is at the terminal and the agent stalls until Hermes'
 * own per-clarify timeout (120 s) elapses, multiplied by the number of
 * clarify calls in a session. FID-47 surfaced this as the 600 s adapter
 * timeout being hit.
 *
 * This module enforces a contract for headless runs:
 *   1. Detect headless mode (FideliOS spawn vs. interactive `hermes chat`).
 *   2. Strip toolsets flagged `headlessSafe: false` in the registry from the
 *      final `-t` whitelist, regardless of whether they were chosen by triage
 *      or pinned by the operator. Telemetry records what was stripped.
 *   3. Provide a small escalation helper used by both the prompt template
 *      (which teaches the model to escalate via curl) and an optional
 *      adapter-side safety-net.
 *
 * Resume flow is handled by FideliOS: when the Board comments on the issue,
 * the next heartbeat fires with `FIDELIOS_WAKE_COMMENT_ID` set, which the
 * existing prompt template surfaces to the model.
 */

import {
    HERMES_TOOLSET_REGISTRY,
    isHeadlessSafeToolset,
} from "./toolset-registry.js";

/**
 * @typedef {Object} HeadlessFilterResult
 * @property {string[]} kept       Toolset names that survived the filter.
 * @property {string[]} stripped   Toolset names that were removed (unknown to
 *                                 caller as either unsafe or unrecognised).
 */

/**
 * @typedef {Object} HeadlessTelemetry
 * @property {boolean} headless          True when running unattended.
 * @property {string[]} stripped         Toolsets removed because flagged
 *                                       `headlessSafe: false` in the registry.
 * @property {boolean} explicitOverride  True when the operator pinned toolsets
 *                                       and the strip removed at least one.
 */

/**
 * Heuristic: are we running unattended?
 *
 * FideliOS spawns always inject `FIDELIOS_RUN_ID`. An explicit override
 * (`FIDELIOS_HEADLESS=1`) is also honoured for tests / SaaS deployments where
 * the spawn is wrapped further. Otherwise fall back to TTY detection.
 *
 * @param {Record<string, string|undefined>} env
 * @param {{stdinIsTTY?: boolean}} [opts]
 * @returns {boolean}
 */
export function isHeadlessEnv(env, opts = {}) {
    if (env && env.FIDELIOS_HEADLESS === "0") return false;
    if (env && (env.FIDELIOS_HEADLESS === "1" || env.FIDELIOS_HEADLESS === "true")) return true;
    if (env && typeof env.FIDELIOS_RUN_ID === "string" && env.FIDELIOS_RUN_ID.length > 0) return true;
    // Fall back to stdin TTY hint if provided. Default: assume interactive
    // when no FideliOS markers are present so local `hermes chat` keeps working.
    if (typeof opts.stdinIsTTY === "boolean") return !opts.stdinIsTTY;
    return false;
}

/**
 * Filter a toolset list, dropping anything flagged `headlessSafe: false` in
 * the canonical registry. Unknown names pass through untouched (the triage
 * filter and Hermes itself will flag them).
 *
 * @param {string[]} toolsets
 * @param {Array<{name: string, headlessSafe?: boolean}>} [registry]
 * @returns {HeadlessFilterResult}
 */
export function filterHeadlessUnsafe(toolsets, registry) {
    const kept = [];
    const stripped = [];
    const reg = registry ?? HERMES_TOOLSET_REGISTRY;
    const byName = new Map(reg.map((e) => [e.name, e]));
    for (const name of toolsets) {
        const entry = byName.get(name);
        if (entry && entry.headlessSafe === false) {
            stripped.push(name);
        } else {
            kept.push(name);
        }
    }
    return { kept, stripped };
}

/**
 * Convenience: parse a comma-separated `-t` value, run the filter, and return
 * both the new comma-string and the stripped list. Empty input → empty output.
 *
 * @param {string|undefined} csv
 * @param {Array<{name: string, headlessSafe?: boolean}>} [registry]
 * @returns {{csv: string|undefined, stripped: string[]}}
 */
export function filterHeadlessCsv(csv, registry) {
    if (!csv || typeof csv !== "string") return { csv, stripped: [] };
    const names = csv.split(",").map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) return { csv, stripped: [] };
    const result = filterHeadlessUnsafe(names, registry);
    const newCsv = result.kept.length > 0 ? result.kept.join(",") : "";
    return { csv: newCsv, stripped: result.stripped };
}

/**
 * Escalation helper: post a comment on the FideliOS issue and PATCH it to
 * `blocked` so the Board sees the question and can answer.
 *
 * Designed to be safe to call from the prompt-template guidance path
 * (model-driven escalation) AND from a future adapter-level intercept.
 *
 * @param {Object} args
 * @param {string} args.question     The clarification question to escalate.
 * @param {string} args.taskId       The FideliOS issue ID.
 * @param {string} args.apiUrl       FideliOS API base, e.g. http://127.0.0.1:3100/api.
 * @param {string} [args.apiKey]     Optional bearer token.
 * @param {typeof fetch} [args.fetchImpl]
 * @returns {Promise<{ok: boolean, commentId?: string, error?: string}>}
 */
export async function escalateClarify(args) {
    const fetchImpl = args.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
        return { ok: false, error: "fetch not available" };
    }
    if (!args.taskId) return { ok: false, error: "taskId required" };
    if (!args.apiUrl) return { ok: false, error: "apiUrl required" };

    const headers = { "Content-Type": "application/json" };
    if (args.apiKey) headers["Authorization"] = `Bearer ${args.apiKey}`;
    const body = `❓ Agent question (escalated, headless): ${args.question}`;

    try {
        const commentRes = await fetchImpl(
            `${args.apiUrl.replace(/\/+$/, "")}/issues/${args.taskId}/comments`,
            { method: "POST", headers, body: JSON.stringify({ body }) },
        );
        if (!commentRes.ok) {
            return { ok: false, error: `comment POST ${commentRes.status}` };
        }
        const commentJson = await commentRes.json().catch(() => ({}));
        const commentId = commentJson?.id;

        const patchRes = await fetchImpl(
            `${args.apiUrl.replace(/\/+$/, "")}/issues/${args.taskId}`,
            { method: "PATCH", headers, body: JSON.stringify({ status: "blocked" }) },
        );
        if (!patchRes.ok) {
            return { ok: false, error: `status PATCH ${patchRes.status}`, commentId };
        }
        return { ok: true, commentId };
    } catch (err) {
        return { ok: false, error: err && err.message ? err.message : String(err) };
    }
}

/**
 * Hermes prints clarify questions to its TUI; in `-q` quiet mode it is not
 * trivial to extract them. This helper detects the marker line emitted by
 * Hermes' verbose log when entering clarify, so a future safety-net watcher
 * can pull the question text. Exposed for test ergonomics.
 *
 * Marker format (Hermes v0.12.0): `[tool] clarify { "question": "...", ... }`
 * or the `❓ Clarifying Questions` banner.
 *
 * @param {string} line
 * @returns {string|null} The question text if the line marks clarify entry.
 */
export function parseClarifyMarker(line) {
    if (!line || typeof line !== "string") return null;
    // Verbose tool-call line: [tool] clarify {"question":"..."}
    const toolMatch = line.match(/\[tool\]\s+clarify\s+(\{.*\})/);
    if (toolMatch) {
        try {
            const obj = JSON.parse(toolMatch[1]);
            if (obj && typeof obj.question === "string") return obj.question;
        } catch {
            // Fall through to other markers.
        }
    }
    return null;
}
