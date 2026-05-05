import type { CLIAdapterModule } from "@fideliosai/adapter-utils";
import { printClaudeStreamEvent } from "@fideliosai/adapter-claude-local/cli";
import { printCodexStreamEvent } from "@fideliosai/adapter-codex-local/cli";
import { printCursorStreamEvent } from "@fideliosai/adapter-cursor-local/cli";
import { printGeminiStreamEvent } from "@fideliosai/adapter-gemini-local/cli";
import { printOpenCodeStreamEvent } from "@fideliosai/adapter-opencode-local/cli";
import { printPiStreamEvent } from "@fideliosai/adapter-pi-local/cli";
import { printOllamaStreamEvent } from "@fideliosai/adapter-ollama-local/cli";
import { printOpenClawGatewayStreamEvent } from "@fideliosai/adapter-openclaw-gateway/cli";
import { processCLIAdapter } from "./process/index.js";
import { httpCLIAdapter } from "./http/index.js";

const claudeLocalCLIAdapter: CLIAdapterModule = {
  type: "claude_local",
  formatStdoutEvent: printClaudeStreamEvent,
};

const codexLocalCLIAdapter: CLIAdapterModule = {
  type: "codex_local",
  formatStdoutEvent: printCodexStreamEvent,
};

const openCodeLocalCLIAdapter: CLIAdapterModule = {
  type: "opencode_local",
  formatStdoutEvent: printOpenCodeStreamEvent,
};

const piLocalCLIAdapter: CLIAdapterModule = {
  type: "pi_local",
  formatStdoutEvent: printPiStreamEvent,
};

const ollamaLocalCLIAdapter: CLIAdapterModule = {
  type: "ollama_local",
  formatStdoutEvent: printOllamaStreamEvent,
};

const cursorLocalCLIAdapter: CLIAdapterModule = {
  type: "cursor",
  formatStdoutEvent: printCursorStreamEvent,
};

const geminiLocalCLIAdapter: CLIAdapterModule = {
  type: "gemini_local",
  formatStdoutEvent: printGeminiStreamEvent,
};

const openclawGatewayCLIAdapter: CLIAdapterModule = {
  type: "openclaw_gateway",
  formatStdoutEvent: printOpenClawGatewayStreamEvent,
};

const adaptersByType = new Map<string, CLIAdapterModule>(
  [
    claudeLocalCLIAdapter,
    codexLocalCLIAdapter,
    openCodeLocalCLIAdapter,
    piLocalCLIAdapter,
    ollamaLocalCLIAdapter,
    cursorLocalCLIAdapter,
    geminiLocalCLIAdapter,
    openclawGatewayCLIAdapter,
    processCLIAdapter,
    httpCLIAdapter,
  ].map((a) => [a.type, a]),
);

export function getCLIAdapter(type: string): CLIAdapterModule {
  return adaptersByType.get(type) ?? processCLIAdapter;
}
