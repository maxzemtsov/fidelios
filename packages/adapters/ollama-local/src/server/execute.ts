import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@fideliosai/adapter-utils";
import {
  asString,
  joinPromptSections,
  parseObject,
  redactEnvForLogs,
  renderTemplate,
} from "@fideliosai/adapter-utils/server-utils";
import { Ollama } from "ollama";
import {
  buildOllamaHeaders,
  isCloudHost,
  parseOllamaConfig,
  type OllamaConfig,
} from "./config.js";
import {
  newConversationId,
  type OllamaChatMessage,
  type OllamaSessionParams,
} from "./session-codec.js";

const DEFAULT_PROMPT_TEMPLATE =
  "You are agent {{agent.id}} ({{agent.name}}). Continue your FideliOS work.";

interface OllamaChatOptions {
  num_ctx?: number;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: true;
  keep_alive?: string | number;
  think?: boolean | "low" | "medium" | "high";
  options?: OllamaChatOptions;
}

function readPriorMessages(runtime: AdapterExecutionContext["runtime"]): {
  conversationId: string | null;
  messages: OllamaChatMessage[];
} {
  const params = parseObject(runtime.sessionParams) as Partial<OllamaSessionParams> &
    Record<string, unknown>;
  const conversationId =
    typeof params.conversationId === "string" && params.conversationId.trim().length > 0
      ? params.conversationId.trim()
      : runtime.sessionId ?? null;
  const messages = Array.isArray(params.messages)
    ? (params.messages.filter(
        (entry): entry is OllamaChatMessage =>
          typeof entry === "object" && entry !== null && typeof (entry as { role?: unknown }).role === "string",
      ) as OllamaChatMessage[])
    : [];
  return { conversationId, messages };
}

function buildClient(config: OllamaConfig): Ollama {
  // Send Authorization header whenever a key is configured. Some self-hosted
  // proxies in front of a local daemon also expect a bearer token, so we do
  // not gate this on isCloudHost(host) — buildOllamaHeaders returns undefined
  // when there's no key.
  const headers = buildOllamaHeaders(config.apiKey);
  return new Ollama({
    host: config.host,
    ...(headers ? { headers } : {}),
  });
}

function buildChatRequest(
  config: OllamaConfig,
  messages: OllamaChatMessage[],
): OllamaChatRequest {
  const req: OllamaChatRequest = {
    model: config.model,
    messages,
    stream: true,
  };
  if (config.keepAlive !== null) req.keep_alive = config.keepAlive;
  if (config.think !== null) req.think = config.think;
  if (config.numCtx !== null) req.options = { num_ctx: config.numCtx };
  return req;
}

interface StreamPart {
  message?: { content?: string; thinking?: string; tool_calls?: unknown[] };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}

interface StreamSummary {
  text: string;
  thinking: string;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  doneReason: string | null;
}

async function streamChat(
  client: Ollama,
  request: OllamaChatRequest,
  ctx: AdapterExecutionContext,
): Promise<StreamSummary> {
  const stream = (await client.chat(request)) as AsyncIterable<StreamPart>;
  let text = "";
  let thinking = "";
  let toolCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let doneReason: string | null = null;

  let pendingStdout = "";
  let pendingStderr = "";

  const flushStdout = async (force: boolean) => {
    while (true) {
      const newlineIdx = pendingStdout.indexOf("\n");
      if (newlineIdx === -1) {
        if (force && pendingStdout.length > 0) {
          await ctx.onLog("stdout", pendingStdout);
          pendingStdout = "";
        }
        return;
      }
      const line = pendingStdout.slice(0, newlineIdx + 1);
      pendingStdout = pendingStdout.slice(newlineIdx + 1);
      await ctx.onLog("stdout", line);
    }
  };

  const flushStderr = async (force: boolean) => {
    while (true) {
      const newlineIdx = pendingStderr.indexOf("\n");
      if (newlineIdx === -1) {
        if (force && pendingStderr.length > 0) {
          await ctx.onLog("stderr", pendingStderr);
          pendingStderr = "";
        }
        return;
      }
      const line = pendingStderr.slice(0, newlineIdx + 1);
      pendingStderr = pendingStderr.slice(newlineIdx + 1);
      await ctx.onLog("stderr", line);
    }
  };

  for await (const part of stream) {
    const message = part.message;
    if (message?.content) {
      text += message.content;
      pendingStdout += message.content;
      await flushStdout(false);
    }
    if (message?.thinking) {
      thinking += message.thinking;
      pendingStderr += `[thinking] ${message.thinking}`;
      await flushStderr(false);
    }
    if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
      toolCalls += message.tool_calls.length;
    }
    if (part.done) {
      if (typeof part.prompt_eval_count === "number") inputTokens = part.prompt_eval_count;
      if (typeof part.eval_count === "number") outputTokens = part.eval_count;
      if (typeof part.done_reason === "string") doneReason = part.done_reason;
    }
  }

  // Final flush: streamed text rarely ends with a newline.
  await flushStdout(true);
  await flushStderr(true);
  if (text.length > 0 && !text.endsWith("\n")) {
    await ctx.onLog("stdout", "\n");
  }

  return { text, thinking, toolCalls, inputTokens, outputTokens, doneReason };
}

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config: rawConfig, context, onLog, onMeta } = ctx;

  let cfg: OllamaConfig;
  try {
    cfg = parseOllamaConfig(rawConfig);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: message,
    };
  }

  const promptTemplate = asString(
    (rawConfig as Record<string, unknown>).promptTemplate,
    DEFAULT_PROMPT_TEMPLATE,
  );
  const bootstrapPromptTemplate = asString(
    (rawConfig as Record<string, unknown>).bootstrapPromptTemplate,
    "",
  );

  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };
  const renderedPrompt = renderTemplate(promptTemplate, templateData);
  const bootstrapPrompt = bootstrapPromptTemplate.trim().length > 0
    ? renderTemplate(bootstrapPromptTemplate, templateData).trim()
    : "";
  const sessionHandoff = asString(context.fideliosSessionHandoffMarkdown, "").trim();
  const heartbeatContext = asString(context.fideliosHeartbeatContext, "").trim();

  const prior = readPriorMessages(runtime);
  const conversationId = prior.conversationId ?? newConversationId();
  const isResumingSession = prior.messages.length > 0;

  const userPrompt = joinPromptSections([
    heartbeatContext,
    isResumingSession ? "" : bootstrapPrompt,
    sessionHandoff,
    renderedPrompt,
  ]);

  const messages: OllamaChatMessage[] = [
    ...prior.messages,
    { role: "user", content: userPrompt },
  ];

  const client = buildClient(cfg);
  const request = buildChatRequest(cfg, messages);

  if (onMeta) {
    await onMeta({
      adapterType: "ollama_local",
      command: `ollama:${cfg.host}`,
      cwd: process.cwd(),
      commandArgs: [
        cfg.model,
        ...(cfg.keepAlive !== null ? [`keep_alive=${cfg.keepAlive}`] : []),
        ...(cfg.numCtx !== null ? [`num_ctx=${cfg.numCtx}`] : []),
        ...(cfg.think !== null ? [`think=${String(cfg.think)}`] : []),
      ],
      env: redactEnvForLogs(cfg.apiKey ? { OLLAMA_API_KEY: cfg.apiKey } : {}),
      prompt: userPrompt,
      promptMetrics: {
        promptChars: userPrompt.length,
        priorMessages: prior.messages.length,
      },
      context,
    });
  }

  // Per-call timeout: SDK exposes client.abort() — we wire it to a setTimeout.
  let timedOut = false;
  const timeoutMs = cfg.timeoutSec * 1000;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    try {
      client.abort();
    } catch {
      // ignore
    }
  }, timeoutMs);

  let summary: StreamSummary;
  try {
    summary = await streamChat(client, request, ctx);
  } catch (err) {
    clearTimeout(timeoutHandle);
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || /aborted/i.test(err.message));
    const message = err instanceof Error ? err.message : String(err);

    if (timedOut || isAbort) {
      await onLog("stderr", `[ollama] aborted after ${cfg.timeoutSec}s\n`);
      return {
        exitCode: null,
        signal: null,
        timedOut: true,
        errorMessage: `Ollama chat timed out after ${cfg.timeoutSec}s`,
        sessionId: conversationId,
        sessionParams: { conversationId, messages: prior.messages },
        sessionDisplayId: conversationId,
        provider: isCloudHost(cfg.host) ? "ollama_cloud" : "ollama_local",
        biller: isCloudHost(cfg.host) ? "ollama_cloud" : "self_hosted",
        model: cfg.model,
        billingType: isCloudHost(cfg.host) ? "subscription" : "fixed",
      };
    }

    await onLog("stderr", `[ollama] error: ${message}\n`);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: message,
      sessionId: conversationId,
      sessionParams: { conversationId, messages: prior.messages },
      sessionDisplayId: conversationId,
      provider: isCloudHost(cfg.host) ? "ollama_cloud" : "ollama_local",
      biller: isCloudHost(cfg.host) ? "ollama_cloud" : "self_hosted",
      model: cfg.model,
      billingType: isCloudHost(cfg.host) ? "subscription" : "fixed",
    };
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (summary.toolCalls > 0) {
    await onLog(
      "stderr",
      `[ollama] model returned ${summary.toolCalls} tool_call(s); Phase 1 does not execute tools — treating as final.\n`,
    );
  }

  const updatedMessages: OllamaChatMessage[] = [
    ...messages,
    { role: "assistant", content: summary.text },
  ];

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    errorMessage: null,
    usage: {
      inputTokens: summary.inputTokens,
      outputTokens: summary.outputTokens,
    },
    sessionId: conversationId,
    sessionParams: { conversationId, messages: updatedMessages },
    sessionDisplayId: conversationId,
    provider: isCloudHost(cfg.host) ? "ollama_cloud" : "ollama_local",
    biller: isCloudHost(cfg.host) ? "ollama_cloud" : "self_hosted",
    model: cfg.model,
    billingType: isCloudHost(cfg.host) ? "subscription" : "fixed",
    summary: summary.text,
    resultJson: {
      doneReason: summary.doneReason,
      toolCallsObserved: summary.toolCalls,
      ...(summary.thinking ? { thinking: summary.thinking } : {}),
    },
    clearSession: false,
  };
}
