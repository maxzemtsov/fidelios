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
  acquireConcurrencySlot,
  buildConcurrencyKey,
  requiresConcurrencyCap,
  tierCap,
} from "./concurrency.js";
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
import {
  executeTool,
  FIDELIOS_TOOLS,
  type OllamaToolCall,
} from "./tools.js";

const DEFAULT_PROMPT_TEMPLATE =
  "You are agent {{agent.id}} ({{agent.name}}). Continue your FideliOS work.";

interface OllamaChatOptions {
  num_ctx?: number;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: true;
  tools?: typeof FIDELIOS_TOOLS;
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
    tools: FIDELIOS_TOOLS,
  };
  if (config.keepAlive !== null) req.keep_alive = config.keepAlive;
  if (config.think !== null) req.think = config.think;
  if (config.numCtx !== null) req.options = { num_ctx: config.numCtx };
  return req;
}

interface StreamPart {
  message?: {
    content?: string;
    thinking?: string;
    tool_calls?: OllamaToolCall[];
  };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}

interface StreamSummary {
  text: string;
  thinking: string;
  toolCalls: OllamaToolCall[];
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
  const toolCalls: OllamaToolCall[] = [];
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
      toolCalls.push(...message.tool_calls);
    }
    if (part.done) {
      if (typeof part.prompt_eval_count === "number") inputTokens = part.prompt_eval_count;
      if (typeof part.eval_count === "number") outputTokens = part.eval_count;
      if (typeof part.done_reason === "string") doneReason = part.done_reason;
    }
  }

  await flushStdout(true);
  await flushStderr(true);
  if (text.length > 0 && !text.endsWith("\n")) {
    await ctx.onLog("stdout", "\n");
  }

  return { text, thinking, toolCalls, inputTokens, outputTokens, doneReason };
}

/** Extract workspace cwd from the execution context (mirrors pi-local pattern). */
function resolveWorkspaceCwd(context: Record<string, unknown>, configCwd: string): string {
  const workspaceContext = parseObject(context.fideliosWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "").trim();
  return workspaceCwd || configCwd || process.cwd();
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

  const isCloud = isCloudHost(cfg.host);
  const cwd = resolveWorkspaceCwd(context, asString(rawConfig.cwd, "").trim());

  const promptTemplate = asString(
    rawConfig.promptTemplate,
    DEFAULT_PROMPT_TEMPLATE,
  );
  const bootstrapPromptTemplate = asString(
    rawConfig.bootstrapPromptTemplate,
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

  if (onMeta) {
    await onMeta({
      adapterType: "ollama_local",
      command: `ollama:${cfg.host}`,
      cwd,
      commandArgs: [
        cfg.model,
        ...(cfg.keepAlive !== null ? [`keep_alive=${cfg.keepAlive}`] : []),
        ...(cfg.numCtx !== null ? [`num_ctx=${cfg.numCtx}`] : []),
        ...(cfg.think !== null ? [`think=${String(cfg.think)}`] : []),
        `tier=${cfg.tier}`,
        `maxTurns=${cfg.maxTurns}`,
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

  // Acquire concurrency slot for cloud models.
  const needsCap = requiresConcurrencyCap(cfg.model, isCloud);
  const capKey = buildConcurrencyKey(cfg.model);
  const cap = tierCap(cfg.tier);
  let releaseSlot: (() => void) | null = null;
  if (needsCap) {
    try {
      releaseSlot = await acquireConcurrencySlot(capKey, cap);
      await onLog("stderr", `[ollama] concurrency slot acquired (tier=${cfg.tier}, cap=${cap})\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `[ollama] failed to acquire concurrency slot: ${message}`,
      };
    }
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

  const makeErrorResult = (
    exitCode: number | null,
    timedOutFlag: boolean,
    message: string | null,
    updatedMessages: OllamaChatMessage[],
    totalInput: number,
    totalOutput: number,
  ): AdapterExecutionResult => ({
    exitCode,
    signal: null,
    timedOut: timedOutFlag,
    errorMessage: message,
    usage: totalInput > 0 || totalOutput > 0
      ? { inputTokens: totalInput, outputTokens: totalOutput }
      : undefined,
    sessionId: conversationId,
    sessionParams: { conversationId, messages: updatedMessages },
    sessionDisplayId: conversationId,
    provider: isCloud ? "ollama_cloud" : "ollama_local",
    biller: isCloud ? "ollama_cloud" : "self_hosted",
    model: cfg.model,
    billingType: isCloud ? "subscription" : "fixed",
  });

  // -------------------------------------------------------------------------
  // Agent tool-calling loop
  // -------------------------------------------------------------------------
  let currentMessages: OllamaChatMessage[] = [...messages];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastText = "";
  let lastThinking = "";
  let lastDoneReason: string | null = null;

  try {
    for (let turn = 0; turn < cfg.maxTurns; turn++) {
      const request = buildChatRequest(cfg, currentMessages);
      let summary: StreamSummary;

      try {
        summary = await streamChat(client, request, ctx);
      } catch (err) {
        clearTimeout(timeoutHandle);
        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || /aborted/i.test(err.message));
        const msg = err instanceof Error ? err.message : String(err);

        if (timedOut || isAbort) {
          await onLog("stderr", `[ollama] aborted after ${cfg.timeoutSec}s\n`);
          return makeErrorResult(null, true, `Ollama chat timed out after ${cfg.timeoutSec}s`, currentMessages, totalInputTokens, totalOutputTokens);
        }

        await onLog("stderr", `[ollama] error: ${msg}\n`);
        return makeErrorResult(1, false, msg, currentMessages, totalInputTokens, totalOutputTokens);
      }

      totalInputTokens += summary.inputTokens;
      totalOutputTokens += summary.outputTokens;
      lastText = summary.text;
      lastThinking = summary.thinking;
      lastDoneReason = summary.doneReason;

      // Append assistant message to history (include tool_calls if present).
      const assistantMsg: OllamaChatMessage = {
        role: "assistant",
        content: summary.text,
        ...(summary.toolCalls.length > 0 ? { tool_calls: summary.toolCalls } : {}),
      };
      currentMessages = [...currentMessages, assistantMsg];

      // No tool calls → model is done.
      if (summary.toolCalls.length === 0) {
        break;
      }

      // Execute tools and feed results back.
      await onLog("stderr", `[ollama] turn ${turn + 1}: executing ${summary.toolCalls.length} tool call(s)\n`);

      for (const call of summary.toolCalls) {
        const toolName = call.function?.name ?? "unknown";
        await onLog("stderr", `[ollama] tool: ${toolName}(${JSON.stringify(call.function?.arguments ?? {})})\n`);

        const result = await executeTool(call, { cwd });

        await onLog("stderr", `[ollama] tool result (${toolName}): ${result.slice(0, 200)}${result.length > 200 ? "..." : ""}\n`);

        const toolMsg: OllamaChatMessage = {
          role: "tool",
          content: result,
        };
        currentMessages = [...currentMessages, toolMsg];
      }

      // If max turns reached, log and break.
      if (turn === cfg.maxTurns - 1) {
        await onLog("stderr", `[ollama] reached maxTurns (${cfg.maxTurns}); stopping.\n`);
      }
    }
  } finally {
    clearTimeout(timeoutHandle);
    if (releaseSlot) releaseSlot();
  }

  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    errorMessage: null,
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    },
    sessionId: conversationId,
    sessionParams: { conversationId, messages: currentMessages },
    sessionDisplayId: conversationId,
    provider: isCloud ? "ollama_cloud" : "ollama_local",
    biller: isCloud ? "ollama_cloud" : "self_hosted",
    model: cfg.model,
    billingType: isCloud ? "subscription" : "fixed",
    summary: lastText,
    resultJson: {
      doneReason: lastDoneReason,
      turns: currentMessages.filter((m) => m.role === "user").length,
      toolCallsExecuted: currentMessages.filter((m) => m.role === "tool").length,
      ...(lastThinking ? { thinking: lastThinking } : {}),
    },
    clearSession: false,
  };
}
