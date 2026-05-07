import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/db",
      "packages/adapters/opencode-local",
      "packages/adapters/ollama-local",
      "packages/adapters/hermes-local",
      "packages/plugins/examples/telegram-gateway",
      "server",
      "ui",
      "cli",
    ],
  },
});
