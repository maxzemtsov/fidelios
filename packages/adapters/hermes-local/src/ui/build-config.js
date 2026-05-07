/**
 * Build adapter configuration from UI form values.
 *
 * Translates FideliOS's CreateConfigValues into the adapterConfig
 * object stored in the agent record.
 */
import { DEFAULT_TIMEOUT_SEC, } from "../shared/constants.js";
/**
 * Build a Hermes Agent adapter config from the FideliOS UI form values.
 */
export function buildHermesConfig(v) {
    const ac = {};
    // Model
    if (v.model.trim()) {
        ac.model = v.model.trim();
    }
    // Execution limits
    ac.timeoutSec = DEFAULT_TIMEOUT_SEC;
    // maxTurnsPerRun maps to Hermes's max_turns (set via config, not CLI flag)
    // Session persistence (default: on)
    ac.persistSession = true;
    // Working directory
    if (v.cwd) {
        ac.cwd = v.cwd;
    }
    // Custom hermes binary path
    if (v.command) {
        ac.hermesCommand = v.command;
    }
    // Extra CLI arguments
    if (v.extraArgs) {
        ac.extraArgs = v.extraArgs.split(/\s+/).filter(Boolean);
    }
    // Thinking/reasoning effort
    if (v.thinkingEffort) {
        const existing = ac.extraArgs || [];
        existing.push("--reasoning-effort", String(v.thinkingEffort));
        ac.extraArgs = existing;
    }
    // Prompt template
    if (v.promptTemplate) {
        ac.promptTemplate = v.promptTemplate;
    }
    // Toolset whitelist (empty → LLM-driven triage chooses per prompt)
    if (typeof v.toolsets === "string" && v.toolsets.trim()) {
        ac.toolsets = v.toolsets.trim();
    }
    // Optional triage router model override
    if (typeof v.triageModel === "string" && v.triageModel.trim()) {
        ac.triageModel = v.triageModel.trim();
    }
    // Heartbeat config is handled by FideliOS itself
    return ac;
}
//# sourceMappingURL=build-config.js.map