import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@fideliosai/adapter-utils";
import { Ollama } from "ollama";
import {
  buildOllamaHeaders,
  isCloudHost,
  parseOllamaConfig,
  type OllamaConfig,
} from "./config.js";
import { discoverOllamaModelsCached } from "./models.js";

/**
 * Pattern that flags responses indicating an auth/license/quota gate
 * rather than a daemon outage. Mirrors PR #44 hermes-local parity.
 */
export const isOllamaAuthRequiredText = (text: string): boolean =>
  /(?:unauthor(?:ized|ised)|forbidden|invalid\s*api\s*key|api\s*key|missing\s*token|please\s+sign\s+in|payment\s*required|insufficient\s*credit|quota\s*exceeded|rate\s*limit)/i.test(
    text,
  );

function summarizeStatus(
  checks: AdapterEnvironmentCheck[],
): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}

function truncate(text: string, max = 240): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

function buildClient(cfg: OllamaConfig, ctor: typeof Ollama = Ollama): Ollama {
  const headers = buildOllamaHeaders(cfg.apiKey);
  return new ctor({ host: cfg.host, ...(headers ? { headers } : {}) });
}

interface TestEnvironmentDeps {
  ollamaCtor?: typeof Ollama;
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
  deps: TestEnvironmentDeps = {},
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];

  let cfg: OllamaConfig;
  try {
    cfg = parseOllamaConfig(ctx.config);
  } catch (err) {
    checks.push({
      code: "ollama_config_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid ollama_local config.",
      hint: "Set adapterConfig.model to a model id from `/api/tags` (e.g. llama3.1).",
    });
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  const Ctor = deps.ollamaCtor ?? Ollama;
  const client = buildClient(cfg, Ctor);

  // Surface tier verbatim (no public Ollama API to verify it).
  if (cfg.ollamaTier) {
    checks.push({
      code: "ollama_tier_configured",
      level: "info",
      message: `Configured Ollama tier: ${cfg.ollamaTier}`,
      hint: "There is no public Ollama API to verify a tier — this value is documentation only.",
    });
  }

  // 1) /api/version
  let versionOk = false;
  try {
    const v = (await client.version()) as { version?: string };
    if (v?.version) {
      versionOk = true;
      checks.push({
        code: "ollama_version_ok",
        level: "info",
        message: `Ollama daemon reachable at ${cfg.host} (version ${v.version}).`,
      });
    } else {
      checks.push({
        code: "ollama_version_unexpected",
        level: "warn",
        message: `Ollama /api/version at ${cfg.host} returned no version string.`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isOllamaAuthRequiredText(msg)) {
      checks.push({
        code: "ollama_version_auth_required",
        level: "warn",
        message: `Ollama at ${cfg.host} requires authentication.`,
        detail: truncate(msg),
        hint: "Set OLLAMA_API_KEY in adapterConfig.env or the agent secret store.",
      });
    } else {
      checks.push({
        code: "ollama_version_unreachable",
        level: "error",
        message: `Ollama daemon at ${cfg.host} is unreachable.`,
        detail: truncate(msg),
        hint:
          isCloudHost(cfg.host)
            ? "Check OLLAMA_API_KEY and your network access to ollama.com."
            : "Start the daemon with `ollama serve` or update `host` to point at a running instance.",
      });
    }
  }

  // 2) /api/tags
  let discovered: { id: string; label: string }[] = [];
  if (versionOk) {
    try {
      discovered = await discoverOllamaModelsCached({
        host: cfg.host,
        apiKey: cfg.apiKey,
        ollamaCtor: Ctor,
      });
      if (discovered.length === 0) {
        checks.push({
          code: "ollama_models_empty",
          level: "warn",
          message: "Ollama returned no models.",
          hint:
            isCloudHost(cfg.host)
              ? "Verify your OLLAMA_API_KEY can access cloud models."
              : "Pull a model with `ollama pull <model>` and retry.",
        });
      } else {
        checks.push({
          code: "ollama_models_discovered",
          level: "info",
          message: `Discovered ${discovered.length} model(s) from ${cfg.host}.`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isOllamaAuthRequiredText(msg)) {
        checks.push({
          code: "ollama_tags_auth_required",
          level: "warn",
          message: "Ollama /api/tags requires authentication.",
          detail: truncate(msg),
          hint: "Set OLLAMA_API_KEY in adapterConfig.env.",
        });
      } else {
        checks.push({
          code: "ollama_tags_failed",
          level: "warn",
          message: "Ollama /api/tags discovery failed.",
          detail: truncate(msg),
        });
      }
    }
  }

  // Verify configured model is available (when we have a list).
  if (discovered.length > 0) {
    if (discovered.some((m) => m.id === cfg.model)) {
      checks.push({
        code: "ollama_model_configured",
        level: "info",
        message: `Configured model is available: ${cfg.model}`,
      });
    } else {
      const sample = discovered.slice(0, 8).map((m) => m.id).join(", ");
      checks.push({
        code: "ollama_model_not_found",
        level: "warn",
        message: `Configured model "${cfg.model}" is not in /api/tags.`,
        detail: `Available: ${sample}${discovered.length > 8 ? ", ..." : ""}`,
        hint: "Pull the model or pick one from /api/tags.",
      });
    }
  }

  // 3) Hello probe — only when daemon is reachable. Mirrors PR #44 parity.
  if (versionOk) {
    try {
      const stream = (await client.chat({
        model: cfg.model,
        messages: [{ role: "user", content: "Respond with the single word: hello" }],
        stream: true,
        ...(cfg.keepAlive !== null ? { keep_alive: cfg.keepAlive } : {}),
      })) as AsyncIterable<{ message?: { content?: string } }>;

      let text = "";
      for await (const part of stream) {
        if (part.message?.content) text += part.message.content;
        if (text.length > 256) break;
      }

      if (/\bhello\b/i.test(text)) {
        checks.push({
          code: "ollama_hello_probe_passed",
          level: "info",
          message: "Ollama hello probe succeeded.",
          detail: truncate(text),
        });
      } else if (text.trim().length > 0) {
        checks.push({
          code: "ollama_hello_probe_unexpected_output",
          level: "warn",
          message: "Ollama probe ran but did not return `hello` as expected.",
          detail: truncate(text),
        });
      } else {
        checks.push({
          code: "ollama_hello_probe_empty",
          level: "warn",
          message: "Ollama probe returned no content.",
          hint: "Run `ollama run <model>` manually to confirm the model is loaded.",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isOllamaAuthRequiredText(msg)) {
        checks.push({
          code: "ollama_hello_probe_auth_required",
          level: "warn",
          message: "Ollama daemon is reachable, but provider authentication is not ready.",
          detail: truncate(msg),
          hint: "Set OLLAMA_API_KEY for cloud models or verify the local daemon's access policy.",
        });
      } else {
        checks.push({
          code: "ollama_hello_probe_failed",
          level: "warn",
          message: "Ollama hello probe failed.",
          detail: truncate(msg),
          hint: `Run \`ollama run ${cfg.model}\` manually against ${cfg.host} to debug.`,
        });
      }
    }
  } else {
    checks.push({
      code: "ollama_hello_probe_skipped",
      level: "warn",
      message: "Skipped Ollama hello probe because /api/version did not respond.",
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
