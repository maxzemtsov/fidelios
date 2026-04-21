export function extractProviderId(modelId: string): string | null {
  const trimmed = modelId.trim();
  if (!trimmed.includes("/")) return null;
  const provider = trimmed.slice(0, trimmed.indexOf("/")).trim();
  return provider || null;
}

export function extractProviderIdWithFallback(modelId: string, fallback = "other"): string {
  return extractProviderId(modelId) ?? fallback;
}

export function extractModelName(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed.includes("/")) return trimmed;
  return trimmed.slice(trimmed.indexOf("/") + 1).trim();
}

const PROVIDER_DISPLAY_LABELS: Record<string, string> = {
  "ollama": "Ollama (local)",
  "ollama-cloud": "Ollama Cloud",
  "amazon-bedrock": "Amazon Bedrock",
  "anthropic": "Anthropic",
  "openai": "OpenAI",
  "opencode": "OpenCode",
  "google": "Google",
  "groq": "Groq",
  "mistral": "Mistral",
  "cohere": "Cohere",
  "azure": "Azure OpenAI",
  "vertex": "Google Vertex AI",
  "xai": "xAI",
  "deepseek": "DeepSeek",
  "together": "Together AI",
  "fireworks": "Fireworks AI",
  "perplexity": "Perplexity",
};

export function providerDisplayLabel(providerId: string): string {
  return PROVIDER_DISPLAY_LABELS[providerId] ?? providerId;
}

export function isCloudProvider(providerId: string): boolean {
  return providerId.endsWith("-cloud") || CLOUD_PROVIDERS.has(providerId);
}

const CLOUD_PROVIDERS = new Set([
  "amazon-bedrock",
  "anthropic",
  "openai",
  "opencode",
  "google",
  "groq",
  "mistral",
  "cohere",
  "azure",
  "vertex",
  "xai",
  "deepseek",
  "together",
  "fireworks",
  "perplexity",
  "ollama-cloud",
]);
