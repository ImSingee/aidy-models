import type {
  BedrockCompat,
  Model,
  ModelCompat,
  ModelPricing,
  Provider,
} from "../types.ts";
import {
  COPILOT_BASE_URL,
  OPENCODE_ANTHROPIC_BASE_URL,
  OPENCODE_BASE_URL,
} from "./shared.ts";
import { convertFlatCostPricing, convertLobehubPricing } from "./pricing.ts";
import { clone, compactObject, mergeCompat, mergeHeaders } from "./utils.ts";

function resolveOpencodeRuntime(rawModel: Record<string, any>): Partial<Model> {
  const npm = rawModel.provider?.npm;
  if (npm === "@ai-sdk/openai") {
    return {
      api: "openai-responses",
      baseUrl: OPENCODE_BASE_URL,
    };
  }
  if (npm === "@ai-sdk/anthropic") {
    return {
      api: "anthropic-messages",
      baseUrl: OPENCODE_ANTHROPIC_BASE_URL,
    };
  }
  if (npm === "@ai-sdk/google") {
    return {
      api: "google-generative-ai",
      baseUrl: OPENCODE_BASE_URL,
    };
  }
  return {
    api: "openai-completions",
    baseUrl: OPENCODE_BASE_URL,
  };
}

export function normalizeModelsDevModel(
  providerId: string,
  rawModel: Record<string, any>,
): Model {
  const model: Model = {
    id: rawModel.id,
    name: rawModel.name || rawModel.id,
    family: rawModel.family,
    releasedAt: rawModel.release_date,
    knowledge: rawModel.knowledge,
    openWeights: rawModel.open_weights,
    deprecated: rawModel.status === "deprecated" || undefined,
    abilities: {
      toolCall: rawModel.tool_call ?? undefined,
      reasoning: rawModel.reasoning ?? undefined,
      attachment: rawModel.attachment ?? undefined,
      temperature: rawModel.temperature ?? undefined,
      structuredOutput: rawModel.structured_output ?? undefined,
      interleaved: rawModel.interleaved ?? undefined,
      vision: rawModel.modalities?.input?.includes("image") || undefined,
    },
    contextWindow: rawModel.limit?.context,
    maxOutput: rawModel.limit?.output,
    modalities: rawModel.modalities,
    pricing: convertFlatCostPricing(rawModel.cost, rawModel),
  };

  if (providerId === "opencode") {
    Object.assign(model, resolveOpencodeRuntime(rawModel));
  }

  return model;
}

export function normalizeLobehubModel(rawModel: Record<string, any>): Model {
  return {
    id: rawModel.id,
    name: rawModel.displayName || rawModel.id,
    description: rawModel.description,
    type: rawModel.type,
    releasedAt: rawModel.releasedAt,
    abilities: {
      toolCall: rawModel.abilities?.functionCall ?? undefined,
      reasoning: rawModel.abilities?.reasoning ?? undefined,
      vision: rawModel.abilities?.vision ?? undefined,
      structuredOutput: rawModel.abilities?.structuredOutput ?? undefined,
      search: rawModel.abilities?.search ?? undefined,
      imageOutput: rawModel.abilities?.imageOutput ?? undefined,
      video: rawModel.abilities?.video ?? undefined,
    },
    contextWindow: rawModel.contextWindowTokens,
    maxOutput: rawModel.maxOutput,
    pricing: convertLobehubPricing(rawModel.pricing, rawModel, rawModel.id),
  };
}

function mergePricing(
  lobehubPricing?: ModelPricing,
  modelsDevPricing?: ModelPricing,
): ModelPricing | undefined {
  if (!lobehubPricing && !modelsDevPricing) return undefined;
  if (
    lobehubPricing?.basePricing &&
    Object.keys(lobehubPricing.basePricing).length > 0
  ) {
    return lobehubPricing;
  }
  return modelsDevPricing;
}

export function mergeModels(
  lobehubModel: Model | undefined,
  modelsDevModel: Model | undefined,
): Model {
  if (!lobehubModel) return modelsDevModel!;
  if (!modelsDevModel) return lobehubModel;

  return {
    id: lobehubModel.id,
    name: lobehubModel.name || modelsDevModel.name,
    api: modelsDevModel.api ?? lobehubModel.api,
    baseUrl: modelsDevModel.baseUrl ?? lobehubModel.baseUrl,
    headers: mergeHeaders(lobehubModel.headers, modelsDevModel.headers),
    description: lobehubModel.description ?? modelsDevModel.description,
    type: lobehubModel.type ?? modelsDevModel.type,
    family: modelsDevModel.family,
    releasedAt: lobehubModel.releasedAt ?? modelsDevModel.releasedAt,
    knowledge: modelsDevModel.knowledge,
    openWeights: modelsDevModel.openWeights,
    deprecated: lobehubModel.deprecated ?? modelsDevModel.deprecated,
    abilities: {
      toolCall: lobehubModel.abilities.toolCall ?? modelsDevModel.abilities.toolCall,
      reasoning:
        lobehubModel.abilities.reasoning ?? modelsDevModel.abilities.reasoning,
      vision: lobehubModel.abilities.vision ?? modelsDevModel.abilities.vision,
      structuredOutput:
        lobehubModel.abilities.structuredOutput ??
        modelsDevModel.abilities.structuredOutput,
      search: lobehubModel.abilities.search,
      imageOutput: lobehubModel.abilities.imageOutput,
      video: lobehubModel.abilities.video,
      attachment: modelsDevModel.abilities.attachment,
      temperature: modelsDevModel.abilities.temperature,
      interleaved: modelsDevModel.abilities.interleaved,
    },
    contextWindow: lobehubModel.contextWindow ?? modelsDevModel.contextWindow,
    maxOutput: lobehubModel.maxOutput ?? modelsDevModel.maxOutput,
    modalities: modelsDevModel.modalities ?? lobehubModel.modalities,
    pricing: mergePricing(lobehubModel.pricing, modelsDevModel.pricing),
    compat: mergeCompat(lobehubModel.compat, modelsDevModel.compat),
  };
}

export function mergeAuthoritativeModel(
  authoritativeModel: Model,
  supplementalModel: Model | undefined,
): Model {
  if (!supplementalModel) {
    return clone(authoritativeModel);
  }

  return {
    id: authoritativeModel.id,
    name: authoritativeModel.name || supplementalModel.name,
    api: authoritativeModel.api ?? supplementalModel.api,
    baseUrl: authoritativeModel.baseUrl ?? supplementalModel.baseUrl,
    headers: mergeHeaders(supplementalModel.headers, authoritativeModel.headers),
    description: authoritativeModel.description ?? supplementalModel.description,
    type: authoritativeModel.type ?? supplementalModel.type,
    family: supplementalModel.family ?? authoritativeModel.family,
    releasedAt: authoritativeModel.releasedAt ?? supplementalModel.releasedAt,
    knowledge: supplementalModel.knowledge ?? authoritativeModel.knowledge,
    openWeights: supplementalModel.openWeights ?? authoritativeModel.openWeights,
    deprecated: authoritativeModel.deprecated ?? supplementalModel.deprecated,
    abilities: {
      toolCall:
        authoritativeModel.abilities.toolCall ??
        supplementalModel.abilities.toolCall,
      reasoning:
        authoritativeModel.abilities.reasoning ??
        supplementalModel.abilities.reasoning,
      vision:
        authoritativeModel.abilities.vision ?? supplementalModel.abilities.vision,
      structuredOutput:
        authoritativeModel.abilities.structuredOutput ??
        supplementalModel.abilities.structuredOutput,
      search:
        authoritativeModel.abilities.search ?? supplementalModel.abilities.search,
      imageOutput:
        authoritativeModel.abilities.imageOutput ??
        supplementalModel.abilities.imageOutput,
      video:
        authoritativeModel.abilities.video ?? supplementalModel.abilities.video,
      attachment:
        authoritativeModel.abilities.attachment ??
        supplementalModel.abilities.attachment,
      temperature:
        authoritativeModel.abilities.temperature ??
        supplementalModel.abilities.temperature,
      interleaved:
        authoritativeModel.abilities.interleaved ??
        supplementalModel.abilities.interleaved,
    },
    contextWindow:
      authoritativeModel.contextWindow ?? supplementalModel.contextWindow,
    maxOutput: authoritativeModel.maxOutput ?? supplementalModel.maxOutput,
    modalities: authoritativeModel.modalities ?? supplementalModel.modalities,
    pricing: authoritativeModel.pricing ?? supplementalModel.pricing,
    compat: mergeCompat(supplementalModel.compat, authoritativeModel.compat),
  };
}

function createAnthropicModelCompat(modelId: string): ModelCompat | undefined {
  const normalized = modelId.toLowerCase();
  const supportsAdaptiveThinking =
    normalized.includes("opus-4-6") ||
    normalized.includes("opus-4.6") ||
    normalized.includes("sonnet-4-6") ||
    normalized.includes("sonnet-4.6");

  if (!supportsAdaptiveThinking) {
    return undefined;
  }

  return {
    anthropic: {
      supportsAdaptiveThinking: true,
      xHighReasoningEffort:
        normalized.includes("opus-4-6") || normalized.includes("opus-4.6")
          ? "max"
          : "high",
    },
  };
}

function hasPromptCachingPricing(model: Model): boolean {
  const basePricing = model.pricing?.basePricing;
  if (!basePricing) return false;

  return (
    "textInput_cacheRead" in basePricing || "textInput_cacheWrite" in basePricing
  );
}

function createBedrockModelCompat(model: Model): ModelCompat | undefined {
  const normalized = model.id.toLowerCase();
  const supportsAdaptiveThinking =
    normalized.includes("opus-4-6") ||
    normalized.includes("opus-4.6") ||
    normalized.includes("sonnet-4-6") ||
    normalized.includes("sonnet-4.6");
  const supportsThinkingSignature =
    normalized.includes("anthropic.claude") ||
    normalized.includes("anthropic/claude");
  const supportsPromptCaching =
    hasPromptCachingPricing(model) ||
    ((normalized.includes("anthropic.claude") ||
      normalized.includes("anthropic/claude")) &&
      ((normalized.includes("-4-") || normalized.includes("-4.")) ||
        normalized.includes("claude-3-7-sonnet") ||
        normalized.includes("claude-3-5-haiku")));

  const compat: BedrockCompat = {};
  if (supportsAdaptiveThinking) {
    compat.supportsAdaptiveThinking = true;
    compat.xHighReasoningEffort =
      normalized.includes("opus-4-6") || normalized.includes("opus-4.6")
        ? "max"
        : "high";
  }
  if (supportsPromptCaching) {
    compat.supportsPromptCaching = true;
  }
  if (supportsThinkingSignature) {
    compat.supportsThinkingSignature = true;
  }

  const bedrock = compactObject(compat);
  return bedrock ? { bedrock } : undefined;
}

function buildGoogleReasoningCompat(
  modelId: string,
): NonNullable<ModelCompat["google"]> | undefined {
  const normalized = modelId.toLowerCase();
  const google: NonNullable<ModelCompat["google"]> = {};

  if (normalized.includes("gemini-3")) {
    google.supportsMultimodalFunctionResponse = true;
  }

  if (normalized.includes("3-pro")) {
    google.reasoningMode = "level";
    google.reasoningLevelMap = {
      minimal: "LOW",
      low: "LOW",
      medium: "HIGH",
      high: "HIGH",
    };
  } else if (normalized.includes("3-flash")) {
    google.reasoningMode = "level";
    google.reasoningLevelMap = {
      minimal: "MINIMAL",
      low: "LOW",
      medium: "MEDIUM",
      high: "HIGH",
    };
  } else if (normalized.includes("2.5-pro")) {
    google.reasoningMode = "budget";
    google.defaultThinkingBudgets = {
      minimal: 128,
      low: 2048,
      medium: 8192,
      high: 32768,
    };
  } else if (normalized.includes("2.5-flash")) {
    google.reasoningMode = "budget";
    google.defaultThinkingBudgets = {
      minimal: 128,
      low: 2048,
      medium: 8192,
      high: 24576,
    };
  }

  return compactObject(google);
}

function createGoogleReasoningCompat(modelId: string): ModelCompat | undefined {
  const compat = buildGoogleReasoningCompat(modelId);
  return compat ? { google: compat } : undefined;
}

function createGoogleGeminiCliReasoningCompat(
  modelId: string,
): ModelCompat | undefined {
  const compat = buildGoogleReasoningCompat(modelId);
  return compat ? { googleGeminiCli: compat } : undefined;
}

function resolveGitHubCopilotModelRuntime(
  modelId: string,
): Pick<Model, "api" | "baseUrl"> {
  const isClaude4 = /^claude-(haiku|sonnet|opus)-4([.-]|$)/.test(modelId);
  const needsResponsesApi =
    modelId.startsWith("gpt-5") || modelId.startsWith("oswe");

  if (isClaude4) {
    return {
      api: "anthropic-messages",
      baseUrl: COPILOT_BASE_URL,
    };
  }

  if (needsResponsesApi) {
    return {
      api: "openai-responses",
      baseUrl: COPILOT_BASE_URL,
    };
  }

  return {
    api: "openai-completions",
    baseUrl: COPILOT_BASE_URL,
  };
}

export function finalizeModel(
  providerId: string,
  _provider: Provider | undefined,
  model: Model,
): Model {
  const finalized: Model = clone(model);

  if (providerId === "github-copilot") {
    Object.assign(finalized, resolveGitHubCopilotModelRuntime(finalized.id));
  }
  finalized.compat = mergeCompat(
    finalized.compat,
    providerId === "anthropic"
      ? createAnthropicModelCompat(finalized.id)
      : undefined,
    providerId === "amazon-bedrock"
      ? createBedrockModelCompat(finalized)
      : undefined,
    providerId === "google" || providerId === "google-vertex"
      ? createGoogleReasoningCompat(finalized.id)
      : undefined,
    providerId === "google-gemini-cli" || providerId === "google-antigravity"
      ? createGoogleGeminiCliReasoningCompat(finalized.id)
      : undefined,
  );

  return finalized;
}
