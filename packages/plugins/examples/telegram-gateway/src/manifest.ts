import type { FideliOSPluginManifestV1 } from "@fideliosai/plugin-sdk";

const PLUGIN_ID = "fidelios.telegram-gateway";
const PLUGIN_VERSION = "0.1.1";

const manifest: FideliOSPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Telegram Gateway",
  description: "Routes agent heartbeats, task assignments, approvals, and errors to a Telegram supergroup. Reply from Telegram to post comments back to FideliOS.",
  author: "FideliOS",
  categories: ["connector", "automation"],
  capabilities: [
    "companies.read",
    "issues.read",
    "issue.comments.create",
    "agents.read",
    "events.subscribe",
    "webhooks.receive",
    "http.outbound",
    "plugin.state.read",
    "plugin.state.write",
    "instance.settings.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "settingsPage",
        id: "telegram-gateway-settings",
        displayName: "Telegram Gateway Settings",
        exportName: "TelegramGatewaySettingsPage",
      },
    ],
  },
  instanceConfigSchema: {
    type: "object",
    required: ["botToken", "chatId", "defaultTopicId"],
    properties: {
      botToken: {
        type: "string",
        title: "Telegram Bot Token",
        description: "Token from @BotFather, e.g. 1234567890:ABCdefGhIjKlMnOpQrStUvWxYz",
      },
      chatId: {
        type: "string",
        title: "Telegram Chat ID",
        description: "Supergroup chat ID — a negative number like -1001234567890",
      },
      defaultTopicId: {
        type: "number",
        title: "Default Topic ID",
        description: "Topic thread ID used when no specific routing rule matches",
        default: 1,
      },
      topicRouting: {
        type: "string",
        title: "Topic Routing (JSON)",
        description: "Optional JSON mapping agent roles and event types to topic thread IDs. See docs for format.",
        default: "{}",
      },
    },
  },
  webhooks: [
    {
      endpointKey: "telegram-update",
      displayName: "Telegram Bot Updates",
      description: "Receives Telegram bot updates (replies, messages). Register this URL as your bot's webhook in Telegram.",
    },
  ],
};

export default manifest;
