// src/worker.ts
import { definePlugin, runWorker } from "@fideliosai/plugin-sdk";
var PLUGIN_ID = "fidelios.telegram-gateway";
var currentContext = null;
var currentConfig = null;
async function telegramRequest(ctx, botToken, method, body) {
  const url = `https://api.telegram.org/bot${botToken}/${method}`;
  const response = await ctx.http.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}
async function sendMessage(ctx, config, text, topicId) {
  const params = {
    chat_id: config.chatId,
    text,
    parse_mode: "HTML"
  };
  if (topicId) params.message_thread_id = topicId;
  try {
    const result = await telegramRequest(ctx, config.botToken, "sendMessage", params);
    if (result.ok && result.result) return result.result;
    return null;
  } catch {
    ctx.logger.warn("Telegram sendMessage failed");
    return null;
  }
}
function resolveTopicId(routing, companyId, key, defaultTopicId) {
  return routing[companyId]?.[key] ?? defaultTopicId;
}
function parseTopicRouting(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
var MSG_MAP_KEY = "tg-message-map";
async function saveMessageMapping(ctx, telegramMessageId, entityType, entityId, companyId) {
  const raw = await ctx.state.get({
    scopeKind: "instance",
    stateKey: MSG_MAP_KEY
  });
  const current = raw ?? {};
  current[String(telegramMessageId)] = { entityType, entityId, companyId };
  const keys = Object.keys(current);
  if (keys.length > 1e3) {
    const oldest = keys.slice(0, keys.length - 1e3);
    for (const k of oldest) delete current[k];
  }
  await ctx.state.set({ scopeKind: "instance", stateKey: MSG_MAP_KEY }, current);
}
async function lookupMessage(ctx, telegramMessageId) {
  const raw = await ctx.state.get({
    scopeKind: "instance",
    stateKey: MSG_MAP_KEY
  });
  const map = raw;
  return map?.[String(telegramMessageId)] ?? null;
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function formatEvent(event) {
  const p = event.payload;
  switch (event.eventType) {
    case "agent.run.finished": {
      const name = escapeHtml(String(p.agentDisplayName ?? p.agentName ?? "Agent"));
      const task = p.issueTitle ? ` on <b>${escapeHtml(String(p.issueTitle))}</b>` : "";
      const status = escapeHtml(String(p.status ?? "finished"));
      return { text: `\u2705 <b>${name}</b> finished${task} [${status}]`, topicKey: "tasks" };
    }
    case "agent.run.failed": {
      const name = escapeHtml(String(p.agentDisplayName ?? p.agentName ?? "Agent"));
      const err = p.errorMessage ? `
<code>${escapeHtml(String(p.errorMessage).slice(0, 200))}</code>` : "";
      return { text: `\u274C <b>${name}</b> run failed${err}`, topicKey: "system" };
    }
    case "issue.updated": {
      const title = escapeHtml(String(p.title ?? "Task"));
      const status = p.status ? ` \u2192 <b>${escapeHtml(String(p.status))}</b>` : "";
      const assignee = p.assigneeAgentName ? ` (${escapeHtml(String(p.assigneeAgentName))})` : "";
      return { text: `\u{1F4CB} <b>${title}</b>${status}${assignee}`, topicKey: "tasks" };
    }
    case "issue.created": {
      const title = escapeHtml(String(p.title ?? "Task"));
      return { text: `\u{1F195} New task: <b>${title}</b>`, topicKey: "tasks" };
    }
    case "approval.created": {
      const subject = escapeHtml(String(p.subject ?? "Approval requested"));
      const by = p.requestedByAgentName ? ` by ${escapeHtml(String(p.requestedByAgentName))}` : "";
      return { text: `\u{1F514} Approval requested${by}: <b>${subject}</b>`, topicKey: "approvals" };
    }
    case "approval.decided": {
      const subject = escapeHtml(String(p.subject ?? "Approval"));
      const decision = String(p.decision ?? "decided");
      const emoji = decision === "approved" ? "\u2705" : "\u274C";
      return { text: `${emoji} <b>${subject}</b> \u2014 ${escapeHtml(decision)}`, topicKey: "approvals" };
    }
    case "agent.created": {
      const name = escapeHtml(String(p.displayName ?? p.name ?? "New agent"));
      const role = p.role ? ` (${escapeHtml(String(p.role))})` : "";
      return { text: `\u{1F91D} New agent hired: <b>${name}</b>${role}`, topicKey: "hiring" };
    }
    default:
      return null;
  }
}
var plugin = definePlugin({
  async setup(ctx) {
    currentContext = ctx;
    ctx.logger.info(`${PLUGIN_ID} setup`);
    const raw = await ctx.config.get();
    const config = raw;
    if (!config?.botToken || !config?.chatId) {
      ctx.logger.warn(`${PLUGIN_ID}: botToken and chatId required \u2014 not subscribing to events`);
      return;
    }
    currentConfig = config;
    const routing = parseTopicRouting(config.topicRouting);
    const SUBSCRIBED = [
      "agent.run.finished",
      "agent.run.failed",
      "issue.created",
      "issue.updated",
      "approval.created",
      "approval.decided",
      "agent.created"
    ];
    for (const eventType of SUBSCRIBED) {
      ctx.events.on(eventType, async (event) => {
        const cfg = currentConfig;
        if (!cfg) return;
        const formatted = formatEvent(event);
        if (!formatted) return;
        const topicId = resolveTopicId(routing, event.companyId, formatted.topicKey, cfg.defaultTopicId);
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
  async onConfigChanged(newConfig) {
    currentConfig = newConfig;
  },
  async onValidateConfig(config) {
    const errors = [];
    const c = config;
    if (!c.botToken) errors.push("botToken is required");
    if (!c.chatId) errors.push("chatId is required");
    if (c.chatId && !c.chatId.startsWith("-")) errors.push("chatId must be a negative number (supergroup IDs start with -)");
    if (c.topicRouting) {
      try {
        JSON.parse(c.topicRouting);
      } catch {
        errors.push("topicRouting must be valid JSON");
      }
    }
    return errors.length > 0 ? { ok: false, errors } : { ok: true };
  },
  async onWebhook(input) {
    if (input.endpointKey !== "telegram-update") {
      throw new Error(`Unsupported webhook endpoint: ${input.endpointKey}`);
    }
    const ctx = currentContext;
    const config = currentConfig;
    if (!ctx || !config) return;
    const update = input.parsedBody;
    if (!update) return;
    const message = update.message;
    if (!message) return;
    const text = message.text;
    if (!text) return;
    const replyTo = message.reply_to_message;
    if (!replyTo) return;
    const originalMessageId = replyTo.message_id;
    if (!originalMessageId) return;
    const entry = await lookupMessage(ctx, originalMessageId);
    if (!entry || entry.entityType !== "issue") return;
    const from = message.from;
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
  }
});
var worker_default = plugin;
runWorker(plugin, import.meta.url);
export {
  worker_default as default
};
