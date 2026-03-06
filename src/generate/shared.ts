import type { Provider } from "../types.ts";

export const MODELS_DEV_URL = "https://models.dev/api.json";
export const LOBEHUB_URL =
  "https://raw.githubusercontent.com/ImSingee/lobehub-models/refs/heads/master/models.json";
export const COPILOT_BASE_URL = "https://api.individual.githubcopilot.com";
export const OPENCODE_BASE_URL = "https://opencode.ai/zen/v1";
export const OPENCODE_ANTHROPIC_BASE_URL = "https://opencode.ai/zen";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const VERCEL_AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";

const COPILOT_STATIC_HEADERS = {
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
} as const;

export type ProviderDefaults = Pick<
  Provider,
  "api" | "baseUrl" | "headers" | "compat"
>;

// models.dev provider ID -> canonical provider ID
export const MODELS_DEV_TO_CANONICAL: Record<string, string> = {
  "vercel": "vercel-ai-gateway",
};

// canonical provider ID -> models.dev provider ID
export const CANONICAL_TO_MODELS_DEV: Record<string, string> = {};
for (const [modelsDevId, canonicalId] of Object.entries(MODELS_DEV_TO_CANONICAL)) {
  CANONICAL_TO_MODELS_DEV[canonicalId] = modelsDevId;
}

// canonical provider ID -> lobehub provider ID
export const PROVIDER_ID_MAP: Record<string, string> = {
  "302ai": "ai302",
  "amazon-bedrock": "bedrock",
  "fireworks-ai": "fireworksai",
  "github-copilot": "githubCopilot",
  "github-models": "github",
  "google-vertex": "vertexai",
  "novita-ai": "novita",
  "ollama-cloud": "ollamacloud",
  "qiniu-ai": "qiniu",
  "siliconflow": "siliconcloud",
  "zhipuai": "zhipu",
  "cloudflare-workers-ai": "cloudflare",
  "moonshotai": "moonshot",
  "vercel-ai-gateway": "vercelaigateway",
  "xiaomi": "xiaomimimo",
};

export const PROVIDER_DEFAULTS: Record<string, ProviderDefaults> = {
  "openai": {
    api: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
  },
  "anthropic": {
    api: "anthropic-messages",
    baseUrl: "https://api.anthropic.com",
  },
  "google": {
    api: "google-generative-ai",
    baseUrl: "https://generativelanguage.googleapis.com",
  },
  "google-vertex": {
    api: "google-vertex",
    baseUrl: "https://us-central1-aiplatform.googleapis.com",
  },
  "google-vertex-anthropic": {
    api: "anthropic-messages",
    baseUrl: "https://us-central1-aiplatform.googleapis.com",
  },
  "amazon-bedrock": {
    api: "bedrock-converse-stream",
    baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
  },
  "azure": { api: "azure-openai-responses" },
  "azure-cognitive-services": { api: "azure-openai-responses" },
  "github-copilot": {
    api: "openai-completions",
    baseUrl: COPILOT_BASE_URL,
    headers: { ...COPILOT_STATIC_HEADERS },
  },
  "groq": {
    api: "openai-completions",
    baseUrl: "https://api.groq.com/openai/v1",
  },
  "xai": { api: "openai-completions", baseUrl: "https://api.x.ai/v1" },
  "mistral": {
    api: "openai-completions",
    baseUrl: "https://api.mistral.ai/v1",
  },
  "cerebras": {
    api: "openai-completions",
    baseUrl: "https://api.cerebras.ai/v1",
  },
  "cohere": { api: "openai-completions", baseUrl: "https://api.cohere.com/v2" },
  "perplexity": {
    api: "openai-completions",
    baseUrl: "https://api.perplexity.ai",
  },
  "togetherai": {
    api: "openai-completions",
    baseUrl: "https://api.together.xyz/v1",
  },
  "deepinfra": {
    api: "openai-completions",
    baseUrl: "https://api.deepinfra.com/v1/openai",
  },
  "venice": {
    api: "openai-completions",
    baseUrl: "https://api.venice.ai/api/v1",
  },
  "gitlab": { api: "openai-completions" },
  "sap-ai-core": { api: "openai-completions" },
  "cloudflare-ai-gateway": { api: "openai-completions" },
  "lobehub": { api: "openai-completions" },
  "vercel-ai-gateway": {
    api: "openai-completions",
    baseUrl: VERCEL_AI_GATEWAY_BASE_URL,
  },
  "fal": { api: "openai-completions" },
  "bfl": { api: "openai-completions" },
};

// Reverse: lobehub ID -> canonical (models.dev) ID
export const LOBEHUB_TO_CANONICAL: Record<string, string> = {};
for (const [modelsDevId, lobehubId] of Object.entries(PROVIDER_ID_MAP)) {
  LOBEHUB_TO_CANONICAL[lobehubId] = modelsDevId;
}

// lobehub sdkType -> pi-ai api protocol
export const SDK_TO_API: Record<string, string> = {
  "openai": "openai-completions",
  "anthropic": "anthropic-messages",
  "google": "google-generative-ai",
  "azure": "azure-openai-responses",
  "azureai": "openai-completions",
  "bedrock": "bedrock-converse-stream",
  "cloudflare": "openai-completions",
  "huggingface": "openai-completions",
  "ollama": "openai-completions",
  "replicate": "openai-completions",
  "router": "openai-completions",
  "comfyui": "openai-completions",
};

export function canonicalProviderId(
  id: string,
  source: "modelsDev" | "lobehub",
): string {
  if (source === "modelsDev") {
    return MODELS_DEV_TO_CANONICAL[id] ?? id;
  }
  if (source === "lobehub") {
    return LOBEHUB_TO_CANONICAL[id] ?? id;
  }
  return id;
}

export function modelsDevIdFor(
  canonicalId: string,
  modelsDevProviders: Record<string, unknown>,
): string | undefined {
  return (
    CANONICAL_TO_MODELS_DEV[canonicalId] ??
    (modelsDevProviders[canonicalId] ? canonicalId : undefined)
  );
}

export function lobehubIdFor(
  canonicalId: string,
  lobehubProviders: Record<string, unknown>,
): string | undefined {
  return (
    PROVIDER_ID_MAP[canonicalId] ??
    (lobehubProviders[canonicalId] ? canonicalId : undefined)
  );
}

export function inferApi(baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined;
  if (baseUrl.includes("/anthropic/")) return "anthropic-messages";
  return "openai-completions";
}
