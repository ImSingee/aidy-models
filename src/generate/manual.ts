import type { Model, ModelPricing, Provider } from "../types.ts";
import { VERCEL_AI_GATEWAY_BASE_URL } from "./shared.ts";

function createTextPricing(
  input: number,
  output: number,
  cacheRead = 0,
  cacheWrite = 0,
): ModelPricing {
  return {
    currency: "USD",
    unit: "millionTokens",
    basePricing: {
      textInput: input,
      textOutput: output,
      textInput_cacheRead: cacheRead,
      textInput_cacheWrite: cacheWrite,
    },
  };
}

type ManualModelInput = {
  id: string;
  name: string;
  contextWindow: number;
  maxOutput: number;
  pricing: ModelPricing;
  input: string[];
  reasoning: boolean;
};

function createManualModel(input: ManualModelInput): Model {
  return {
    id: input.id,
    name: input.name,
    abilities: {
      toolCall: true,
      reasoning: input.reasoning,
      vision: input.input.includes("image"),
    },
    contextWindow: input.contextWindow,
    maxOutput: input.maxOutput,
    modalities: {
      input: input.input,
      output: ["text"],
    },
    pricing: input.pricing,
  };
}

const codexContextWindow = 272000;
const codexMaxOutput = 128000;
const googleContextWindow = 1048576;
const googleMaxOutput = 65535;
const googleCliBaseUrl = "https://cloudcode-pa.googleapis.com";
const googleAntigravityBaseUrl =
  "https://daily-cloudcode-pa.sandbox.googleapis.com";
const openAICodexBaseUrl = "https://chatgpt.com/backend-api";
const kimiCodingBaseUrl = "https://api.kimi.com/coding";

export const manualProviders: Record<string, Provider> = {
  "vercel-ai-gateway": {
    id: "vercel-ai-gateway",
    name: "Vercel AI Gateway",
    official: false,
    featured: false,
    api: "openai-completions",
    baseUrl: VERCEL_AI_GATEWAY_BASE_URL,
    description:
      "Vercel AI Gateway provides a unified API for 100+ models across OpenAI, Anthropic, Google, and more, with budgeting, usage monitoring, load balancing, and failover.",
    url: "https://vercel.com/ai-gateway",
    doc: "https://github.com/vercel/ai/tree/5eb85cc45a259553501f535b8ac79a77d0e79223/packages/gateway",
    checkModel: "openai/gpt-5-nano",
    apiKeyUrl: "https://vercel.com/dashboard/ai-gateway",
    _: {
      disableBrowserRequest: true,
      responseAnimation: "smooth",
      showModelFetcher: true,
      env: ["AI_GATEWAY_API_KEY"],
      npm: "@ai-sdk/gateway",
      modelsUrl: "https://vercel.com/ai-gateway/models",
    },
  },
  "openai-codex": {
    id: "openai-codex",
    name: "OpenAI Codex",
    official: false,
    featured: false,
    api: "openai-codex-responses",
    baseUrl: openAICodexBaseUrl,
    description:
      "OpenAI Codex routes ChatGPT-authenticated coding models through the Codex backend.",
  },
  "google-gemini-cli": {
    id: "google-gemini-cli",
    name: "Google Gemini CLI",
    official: false,
    featured: false,
    api: "google-gemini-cli",
    baseUrl: googleCliBaseUrl,
    description:
      "Google Cloud Code Assist endpoint used by Gemini CLI-compatible models.",
  },
  "google-antigravity": {
    id: "google-antigravity",
    name: "Google Antigravity",
    official: false,
    featured: false,
    api: "google-gemini-cli",
    baseUrl: googleAntigravityBaseUrl,
    description:
      "Google sandbox endpoint with alternate OAuth credentials for Antigravity-only models.",
  },
};

export const manualModels: Record<string, Model[]> = {
  "openrouter": [
    createManualModel({
      id: "auto",
      name: "Auto",
      contextWindow: 2000000,
      maxOutput: 30000,
      pricing: createTextPricing(0, 0, 0, 0),
      input: ["text", "image"],
      reasoning: true,
    }),
  ],
  "openai-codex": [
    createManualModel({
      id: "gpt-5.1",
      name: "GPT-5.1",
      contextWindow: codexContextWindow,
      maxOutput: codexMaxOutput,
      pricing: createTextPricing(1.25, 10, 0.125),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gpt-5.1-codex-max",
      name: "GPT-5.1 Codex Max",
      contextWindow: codexContextWindow,
      maxOutput: codexMaxOutput,
      pricing: createTextPricing(1.25, 10, 0.125),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gpt-5.1-codex-mini",
      name: "GPT-5.1 Codex Mini",
      contextWindow: codexContextWindow,
      maxOutput: codexMaxOutput,
      pricing: createTextPricing(0.25, 2, 0.025),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gpt-5.2",
      name: "GPT-5.2",
      contextWindow: codexContextWindow,
      maxOutput: codexMaxOutput,
      pricing: createTextPricing(1.75, 14, 0.175),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gpt-5.2-codex",
      name: "GPT-5.2 Codex",
      contextWindow: codexContextWindow,
      maxOutput: codexMaxOutput,
      pricing: createTextPricing(1.75, 14, 0.175),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gpt-5.3-codex",
      name: "GPT-5.3 Codex",
      contextWindow: codexContextWindow,
      maxOutput: codexMaxOutput,
      pricing: createTextPricing(1.75, 14, 0.175),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gpt-5.4",
      name: "GPT-5.4",
      contextWindow: codexContextWindow,
      maxOutput: codexMaxOutput,
      pricing: createTextPricing(2.5, 15, 0.25),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gpt-5.3-codex-spark",
      name: "GPT-5.3 Codex Spark",
      contextWindow: 128000,
      maxOutput: codexMaxOutput,
      pricing: createTextPricing(0, 0, 0, 0),
      input: ["text"],
      reasoning: true,
    }),
  ],
  "google-gemini-cli": [
    createManualModel({
      id: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro (Cloud Code Assist)",
      contextWindow: googleContextWindow,
      maxOutput: googleMaxOutput,
      pricing: createTextPricing(0, 0, 0, 0),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash (Cloud Code Assist)",
      contextWindow: googleContextWindow,
      maxOutput: googleMaxOutput,
      pricing: createTextPricing(0, 0, 0, 0),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash (Cloud Code Assist)",
      contextWindow: googleContextWindow,
      maxOutput: 8192,
      pricing: createTextPricing(0, 0, 0, 0),
      input: ["text", "image"],
      reasoning: false,
    }),
    createManualModel({
      id: "gemini-3-pro-preview",
      name: "Gemini 3 Pro Preview (Cloud Code Assist)",
      contextWindow: googleContextWindow,
      maxOutput: googleMaxOutput,
      pricing: createTextPricing(0, 0, 0, 0),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gemini-3-flash-preview",
      name: "Gemini 3 Flash Preview (Cloud Code Assist)",
      contextWindow: googleContextWindow,
      maxOutput: googleMaxOutput,
      pricing: createTextPricing(0, 0, 0, 0),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro Preview (Cloud Code Assist)",
      contextWindow: googleContextWindow,
      maxOutput: googleMaxOutput,
      pricing: createTextPricing(0, 0, 0, 0),
      input: ["text", "image"],
      reasoning: true,
    }),
  ],
  "google-antigravity": [
    createManualModel({
      id: "gemini-3.1-pro-high",
      name: "Gemini 3.1 Pro High (Antigravity)",
      contextWindow: googleContextWindow,
      maxOutput: googleMaxOutput,
      pricing: createTextPricing(2, 12, 0.2, 2.375),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gemini-3.1-pro-low",
      name: "Gemini 3.1 Pro Low (Antigravity)",
      contextWindow: googleContextWindow,
      maxOutput: googleMaxOutput,
      pricing: createTextPricing(2, 12, 0.2, 2.375),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gemini-3-flash",
      name: "Gemini 3 Flash (Antigravity)",
      contextWindow: googleContextWindow,
      maxOutput: googleMaxOutput,
      pricing: createTextPricing(0.5, 3, 0.5, 0),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "claude-sonnet-4-5",
      name: "Claude Sonnet 4.5 (Antigravity)",
      contextWindow: 200000,
      maxOutput: 64000,
      pricing: createTextPricing(3, 15, 0.3, 3.75),
      input: ["text", "image"],
      reasoning: false,
    }),
    createManualModel({
      id: "claude-sonnet-4-5-thinking",
      name: "Claude Sonnet 4.5 Thinking (Antigravity)",
      contextWindow: 200000,
      maxOutput: 64000,
      pricing: createTextPricing(3, 15, 0.3, 3.75),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "claude-opus-4-5-thinking",
      name: "Claude Opus 4.5 Thinking (Antigravity)",
      contextWindow: 200000,
      maxOutput: 64000,
      pricing: createTextPricing(5, 25, 0.5, 6.25),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "claude-opus-4-6-thinking",
      name: "Claude Opus 4.6 Thinking (Antigravity)",
      contextWindow: 200000,
      maxOutput: 128000,
      pricing: createTextPricing(5, 25, 0.5, 6.25),
      input: ["text", "image"],
      reasoning: true,
    }),
    createManualModel({
      id: "gpt-oss-120b-medium",
      name: "GPT-OSS 120B Medium (Antigravity)",
      contextWindow: 131072,
      maxOutput: 32768,
      pricing: createTextPricing(0.09, 0.36, 0, 0),
      input: ["text"],
      reasoning: false,
    }),
  ],
  "google": [
    createManualModel({
      id: "gemini-3.1-flash-lite-preview",
      name: "Gemini 3.1 Flash Lite Preview",
      contextWindow: googleContextWindow,
      maxOutput: 65536,
      pricing: createTextPricing(0, 0, 0, 0),
      input: ["text", "image"],
      reasoning: true,
    }),
  ],
  "google-vertex": [
    createManualModel({
      id: "gemini-1.5-pro",
      name: "Gemini 1.5 Pro (Vertex)",
      contextWindow: 1000000,
      maxOutput: 8192,
      pricing: createTextPricing(1.25, 5, 0.3125, 0),
      input: ["text", "image"],
      reasoning: false,
    }),
    createManualModel({
      id: "gemini-1.5-flash",
      name: "Gemini 1.5 Flash (Vertex)",
      contextWindow: 1000000,
      maxOutput: 8192,
      pricing: createTextPricing(0.075, 0.3, 0.01875, 0),
      input: ["text", "image"],
      reasoning: false,
    }),
    createManualModel({
      id: "gemini-1.5-flash-8b",
      name: "Gemini 1.5 Flash-8B (Vertex)",
      contextWindow: 1000000,
      maxOutput: 8192,
      pricing: createTextPricing(0.0375, 0.15, 0.01, 0),
      input: ["text", "image"],
      reasoning: false,
    }),
  ],
};

export const kimiCodingFallbackModels: Model[] = [
  createManualModel({
    id: "kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    contextWindow: 262144,
    maxOutput: 32768,
    pricing: createTextPricing(0, 0, 0, 0),
    input: ["text"],
    reasoning: true,
  }),
  createManualModel({
    id: "k2p5",
    name: "Kimi K2.5",
    contextWindow: 262144,
    maxOutput: 32768,
    pricing: createTextPricing(0, 0, 0, 0),
    input: ["text"],
    reasoning: true,
  }),
];

export const fallbackDerivedProviders: Record<string, Provider> = {
  "kimi-coding": {
    id: "kimi-coding",
    name: "Kimi Coding",
    official: false,
    featured: false,
    api: "anthropic-messages",
    baseUrl: kimiCodingBaseUrl,
  },
  "azure-openai-responses": {
    id: "azure-openai-responses",
    name: "Azure OpenAI Responses",
    official: false,
    featured: false,
    api: "azure-openai-responses",
    baseUrl: "",
  },
};
