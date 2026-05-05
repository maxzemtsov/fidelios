export { execute } from "./execute.js";
export { testEnvironment, isOllamaAuthRequiredText } from "./test.js";
export { sessionCodec, newConversationId } from "./session-codec.js";
export type { OllamaSessionParams, OllamaChatMessage } from "./session-codec.js";
export {
  discoverOllamaModels,
  discoverOllamaModelsCached,
  listOllamaModels,
  resetOllamaModelsCacheForTests,
} from "./models.js";
export {
  parseOllamaConfig,
  buildOllamaHeaders,
  isCloudHost,
  DEFAULT_HOST,
  CLOUD_HOST,
  DEFAULT_TIMEOUT_SEC,
} from "./config.js";
export type { OllamaConfig, ThinkOption } from "./config.js";
