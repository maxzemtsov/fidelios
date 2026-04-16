import { definePlugin, runWorker } from "@fideliosai/plugin-sdk";
import type { PluginContext, PluginEvent, PluginWebhookInput } from "@fideliosai/plugin-sdk";

const PLUGIN_ID = "fidelios.telegram-gateway";

// ---------------------------------------------------------------------------
// Config shape
// ---------------------------------------------------------------------------

interface TelegramConfig {
  botToken: string;
  chatId: string;
  defaultTopicId: number;
  topicRouting?: string;
}

interface TopicRouting {
  [companyId: string]: {
    [key: string]: number;
  };
}

// ---------------------------------------------------------------------------
// Module-level context (set in setup, used in onWebhook)
// ---------------------------------------------------------------------------

let currentContext: PluginContext | null = null;
let currentConfig: TelegramConfig | null = null;

// ---------------------------------------------------------------------------
// Telegram API helpers
// ---------------------------------------------------------------------------

async function telegramRequest(
  ctx: PluginContext,
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const response = await ctx.http.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function sendMessage(
  ctx: PluginContext,
  config: TelegramConfig,
  text: string,
  topicId?: number,
): Promise<{ message_id?: number } | null> {
  const params: Record<string, unknown> = {
    chat_id: config.chatId,
    text,
    parse_mode: "HTML",
  };
  if (topicId) params.message_thread_id = topicId;

  try {
    const result = await telegramRequest(ctx, config.botToken, "sendMessage", params) as { ok: boolean; result?: { message_id: number } };
    if (result.ok && result.result) return result.result;
    return null;
  } catch {
    ctx.logger.warn("Telegram sendMessage failed");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Topic routing
// ---------------------------------------------------------------------------

const TOPICS_STATE_KEY = "tg-topics";

const TOPIC_DEFINITIONS = [
  { key: "tasks", name: "Tasks" },
  { key: "approvals", name: "Approvals" },
  { key: "hiring", name: "Hiring" },
  { key: "system", name: "System" },
] as const;

type TopicKey = typeof TOPIC_DEFINITIONS[number]["key"];
type TopicMap = Record<TopicKey, number>;

async function getSavedTopics(ctx: PluginContext, companyId: string): Promise<TopicMap | null> {
  const raw = await ctx.state.get({ scopeKind: "company", scopeId: companyId, stateKey: TOPICS_STATE_KEY });
  return raw as TopicMap | null;
}

// Exported so unit tests can verify routing without spinning up a worker
// (see ./__tests__/routing.test.ts). Ordering contract:
//   1. UI-created topics (saved in plugin state) win for the given key
//   2. Config JSON `topicRouting[companyId][key]` is the fallback
//   3. `defaultTopicId` is the final fallback
export function resolveTopicId(routing: TopicRouting, companyId: string, key: string, defaultTopicId: number, savedTopics: TopicMap | null): number {
  if (savedTopics && key in savedTopics) {
    return (savedTopics as Record<string, number>)[key]!;
  }
  return routing[companyId]?.[key] ?? defaultTopicId;
}

export function parseTopicRouting(raw: string | undefined): TopicRouting {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as TopicRouting;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// State helpers — map Telegram message IDs back to FideliOS entities
// ---------------------------------------------------------------------------

const MSG_MAP_KEY = "tg-message-map";

interface MessageEntry {
  entityType: string;
  entityId: string;
  companyId: string;
}

async function saveMessageMapping(
  ctx: PluginContext,
  telegramMessageId: number,
  entityType: string,
  entityId: string,
  companyId: string,
): Promise<void> {
  const raw = await ctx.state.get({
    scopeKind: "instance",
    stateKey: MSG_MAP_KEY,
  });
  const current = (raw as Record<string, MessageEntry> | null) ?? {};
  current[String(telegramMessageId)] = { entityType, entityId, companyId };
  // Keep map bounded to last 1000 messages
  const keys = Object.keys(current);
  if (keys.length > 1000) {
    const oldest = keys.slice(0, keys.length - 1000);
    for (const k of oldest) delete current[k];
  }
  await ctx.state.set({ scopeKind: "instance", stateKey: MSG_MAP_KEY }, current);
}

async function lookupMessage(
  ctx: PluginContext,
  telegramMessageId: number,
): Promise<MessageEntry | null> {
  const raw = await ctx.state.get({
    scopeKind: "instance",
    stateKey: MSG_MAP_KEY,
  });
  const map = raw as Record<string, MessageEntry> | null;
  return map?.[String(telegramMessageId)] ?? null;
}

// ---------------------------------------------------------------------------
// Event formatting
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatEvent(event: PluginEvent): { text: string; topicKey: string } | null {
  const p = event.payload as Record<string, unknown>;

  switch (event.eventType) {
    case "agent.run.finished": {
      const name = escapeHtml(String(p.agentDisplayName ?? p.agentName ?? "Agent"));
      const task = p.issueTitle ? ` on <b>${escapeHtml(String(p.issueTitle))}</b>` : "";
      const status = escapeHtml(String(p.status ?? "finished"));
      return { text: `✅ <b>${name}</b> finished${task} [${status}]`, topicKey: "tasks" };
    }
    case "agent.run.failed": {
      const name = escapeHtml(String(p.agentDisplayName ?? p.agentName ?? "Agent"));
      const err = p.errorMessage ? `\n<code>${escapeHtml(String(p.errorMessage).slice(0, 200))}</code>` : "";
      return { text: `❌ <b>${name}</b> run failed${err}`, topicKey: "system" };
    }
    case "issue.updated": {
      const title = escapeHtml(String(p.title ?? "Task"));
      const status = p.status ? ` → <b>${escapeHtml(String(p.status))}</b>` : "";
      const assignee = p.assigneeAgentName ? ` (${escapeHtml(String(p.assigneeAgentName))})` : "";
      return { text: `📋 <b>${title}</b>${status}${assignee}`, topicKey: "tasks" };
    }
    case "issue.created": {
      const title = escapeHtml(String(p.title ?? "Task"));
      return { text: `🆕 New task: <b>${title}</b>`, topicKey: "tasks" };
    }
    case "approval.created": {
      const subject = escapeHtml(String(p.subject ?? "Approval requested"));
      const by = p.requestedByAgentName ? ` by ${escapeHtml(String(p.requestedByAgentName))}` : "";
      return { text: `🔔 Approval requested${by}: <b>${subject}</b>`, topicKey: "approvals" };
    }
    case "approval.decided": {
      const subject = escapeHtml(String(p.subject ?? "Approval"));
      const decision = String(p.decision ?? "decided");
      const emoji = decision === "approved" ? "✅" : "❌";
      return { text: `${emoji} <b>${subject}</b> — ${escapeHtml(decision)}`, topicKey: "approvals" };
    }
    case "agent.created": {
      const name = escapeHtml(String(p.displayName ?? p.name ?? "New agent"));
      const role = p.role ? ` (${escapeHtml(String(p.role))})` : "";
      return { text: `🤝 New agent hired: <b>${name}</b>${role}`, topicKey: "hiring" };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const plugin = definePlugin({
  async setup(ctx: PluginContext) {
    currentContext = ctx;
    ctx.logger.info(`${PLUGIN_ID} setup`);

    // ---- Data handlers (UI) — registered unconditionally ----
    ctx.data.register("plugin-status", async (params) => {
      const companyId = typeof params.companyId === "string" ? params.companyId : "";
      const cfg = (await ctx.config.get()) as unknown as TelegramConfig | null;
      const savedTopics = companyId ? await getSavedTopics(ctx, companyId) : null;
      return {
        config: cfg ? { chatId: cfg.chatId, defaultTopicId: cfg.defaultTopicId, topicRouting: cfg.topicRouting } : {},
        topics: savedTopics,
      };
    });

    // ---- Action handlers (UI) ----
    ctx.actions.register("create-topics", async (params) => {
      const companyId = typeof params.companyId === "string" ? params.companyId : "";
      if (!companyId) throw new Error("companyId is required");
      const cfg = (await ctx.config.get()) as unknown as TelegramConfig | null;
      if (!cfg?.botToken || !cfg?.chatId) {
        return { ok: false, error: "Plugin is not configured (botToken and chatId required)" };
      }

      const topicMap: Record<string, number> = {};
      const errors: string[] = [];
      let effectiveChatId = cfg.chatId;
      let migratedChatId: string | undefined;

      for (const def of TOPIC_DEFINITIONS) {
        try {
          let result = await telegramRequest(ctx, cfg.botToken, "createForumTopic", {
            chat_id: effectiveChatId,
            name: def.name,
          }) as { ok: boolean; result?: { message_thread_id: number }; description?: string; parameters?: { migrate_to_chat_id?: number } };

          // When Topics/Forum mode is enabled on a regular group, Telegram upgrades it to a
          // supergroup and the chat ID changes.  The API returns the new ID in
          // parameters.migrate_to_chat_id.  Detect this, switch IDs, and retry.
          if (!result.ok && result.parameters?.migrate_to_chat_id) {
            const newChatId = String(result.parameters.migrate_to_chat_id);
            ctx.logger.info(`${PLUGIN_ID}: group migrated to supergroup, retrying with new chat ID`, {
              oldChatId: effectiveChatId,
              newChatId,
            });
            effectiveChatId = newChatId;
            migratedChatId = newChatId;

            result = await telegramRequest(ctx, cfg.botToken, "createForumTopic", {
              chat_id: effectiveChatId,
              name: def.name,
            }) as { ok: boolean; result?: { message_thread_id: number }; description?: string; parameters?: { migrate_to_chat_id?: number } };
          }

          if (result.ok && result.result?.message_thread_id) {
            topicMap[def.key] = result.result.message_thread_id;
          } else {
            errors.push(`${def.name}: ${result.description ?? "unknown error"}`);
          }
        } catch (err) {
          errors.push(`${def.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (Object.keys(topicMap).length === 0) {
        return { ok: false, error: errors.join("; ") };
      }

      await ctx.state.set({ scopeKind: "company", scopeId: companyId, stateKey: TOPICS_STATE_KEY }, topicMap);
      ctx.logger.info(`${PLUGIN_ID}: created ${Object.keys(topicMap).length} topics for company ${companyId}`);

      return {
        ok: true,
        topics: topicMap,
        ...(migratedChatId ? { newChatId: migratedChatId } : {}),
        ...(errors.length > 0 ? { errors } : {}),
      };
    });

    ctx.actions.register("test-connection", async (_params) => {
      const cfg = (await ctx.config.get()) as unknown as TelegramConfig | null;
      if (!cfg?.botToken || !cfg?.chatId) {
        return { ok: false, error: "Plugin is not configured (botToken and chatId required)" };
      }

      try {
        const meResult = await telegramRequest(ctx, cfg.botToken, "getMe", {}) as {
          ok: boolean;
          result?: { username?: string; first_name?: string };
          description?: string;
        };
        if (!meResult.ok) {
          return { ok: false, error: meResult.description ?? "getMe failed" };
        }
        const botName = meResult.result?.username ?? meResult.result?.first_name ?? "Bot";

        const chatResult = await telegramRequest(ctx, cfg.botToken, "getChat", { chat_id: cfg.chatId }) as {
          ok: boolean;
          result?: { title?: string; is_forum?: boolean };
          description?: string;
        };
        if (!chatResult.ok) {
          return { ok: false, error: chatResult.description ?? "getChat failed" };
        }

        return {
          ok: true,
          botName,
          chatTitle: chatResult.result?.title ?? cfg.chatId,
          forumEnabled: chatResult.result?.is_forum === true,
        };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    // ---- Event subscriptions (only when fully configured) ----
    const raw = await ctx.config.get();
    const config = raw as unknown as TelegramConfig | null;
    if (!config?.botToken || !config?.chatId) {
      ctx.logger.warn(`${PLUGIN_ID}: botToken and chatId required — not subscribing to events`);
      return;
    }
    currentConfig = config;

    const routing = parseTopicRouting(config.topicRouting);

    const SUBSCRIBED: Array<import("@fideliosai/plugin-sdk").PluginEventType> = [
      "agent.run.finished",
      "agent.run.failed",
      "issue.created",
      "issue.updated",
      "approval.created",
      "approval.decided",
      "agent.created",
    ];

    for (const eventType of SUBSCRIBED) {
      ctx.events.on(eventType, async (event: PluginEvent) => {
        const cfg = currentConfig;
        if (!cfg) return;
        const formatted = formatEvent(event);
        if (!formatted) return;
        const savedTopics = await getSavedTopics(ctx, event.companyId);
        const topicId = resolveTopicId(routing, event.companyId, formatted.topicKey, cfg.defaultTopicId, savedTopics);
        const sent = await sendMessage(ctx, cfg, formatted.text, topicId);
        if (sent?.message_id && event.entityId && event.entityType) {
          await saveMessageMapping(ctx, sent.message_id, event.entityType, event.entityId, event.companyId);
        }
      });
    }

    ctx.logger.info(`${PLUGIN_ID} subscribed to ${SUBSCRIBED.length} event types`);
  },

  async onHealth() {
    return { status: "ok", message: "Telegram Gateway ready" };
  },

  async onConfigChanged(newConfig: Record<string, unknown>) {
    currentConfig = newConfig as unknown as TelegramConfig;
  },

  async onValidateConfig(config: Record<string, unknown>) {
    const errors: string[] = [];
    const c = config as unknown as TelegramConfig;
    if (!c.botToken) errors.push("botToken is required");
    if (!c.chatId) errors.push("chatId is required");
    if (c.chatId && !c.chatId.startsWith("-")) errors.push("chatId must be a negative number (supergroup IDs start with -)");
    if (c.topicRouting) {
      try { JSON.parse(c.topicRouting); } catch { errors.push("topicRouting must be valid JSON"); }
    }
    return errors.length > 0 ? { ok: false, errors } : { ok: true };
  },

  async onWebhook(input: PluginWebhookInput) {
    if (input.endpointKey !== "telegram-update") {
      throw new Error(`Unsupported webhook endpoint: ${input.endpointKey}`);
    }

    const ctx = currentContext;
    const config = currentConfig;
    if (!ctx || !config) return;

    // Parse Telegram update
    const update = input.parsedBody as Record<string, unknown> | undefined;
    if (!update) return;

    const message = update.message as Record<string, unknown> | undefined;
    if (!message) return;

    const text = message.text as string | undefined;
    if (!text) return;

    // Only handle replies to our bot messages
    const replyTo = message.reply_to_message as Record<string, unknown> | undefined;
    if (!replyTo) return;

    const originalMessageId = replyTo.message_id as number | undefined;
    if (!originalMessageId) return;

    // Look up what FideliOS entity this reply corresponds to
    const entry = await lookupMessage(ctx, originalMessageId);
    if (!entry || entry.entityType !== "issue") return;

    // Post the reply back to FideliOS as a comment on the issue
    const from = message.from as Record<string, unknown> | undefined;
    const senderName = from ? String(from.first_name ?? from.username ?? "Telegram user") : "Telegram user";
    const commentBody = `**${senderName} via Telegram:** ${text}`;

    try {
      await ctx.issues.createComment(entry.entityId, commentBody, entry.companyId);
      ctx.logger.info(`${PLUGIN_ID}: posted Telegram reply as comment on issue ${entry.entityId}`);
    } catch (err) {
      ctx.logger.error(`${PLUGIN_ID}: failed to post comment`, { err });
    }
  },

  async onShutdown() {
    currentContext = null;
    currentConfig = null;
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
