import type { Model } from "../types.ts";
import {
  createPricing,
  type OfficialCatalog,
  normalizeModalities,
  normalizeReleasedAt,
  parsePrice,
} from "./official-shared.ts";

type RawOpenRouterModel = {
  id: string;
  name?: string;
  created?: number;
  description?: string;
  context_length?: number;
  pricing?: Record<string, string | number | undefined>;
  supported_parameters?: string[];
  default_parameters?: Record<string, unknown>;
  architecture?: {
    input_modalities?: string[];
    modality?: string;
    output_modalities?: string[];
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
  };
};

type OpenRouterResponse = { data?: RawOpenRouterModel[] };

function getInputModalities(rawModel: RawOpenRouterModel): string[] {
  const input = rawModel.architecture?.input_modalities;
  if (Array.isArray(input) && input.length > 0) {
    return input;
  }

  const modality = rawModel.architecture?.modality;
  if (!modality) {
    return ["text"];
  }

  const [inputPart] = modality.split("->", 1);
  return inputPart
    .split("+")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeModel(rawModel: RawOpenRouterModel): Model {
  const supportedParameters = rawModel.supported_parameters ?? [];
  const inputModalities = getInputModalities(rawModel);
  const outputModalities = rawModel.architecture?.output_modalities;
  const hasTemperature =
    rawModel.default_parameters !== undefined &&
    rawModel.default_parameters !== null &&
    Object.hasOwn(rawModel.default_parameters, "temperature");

  return {
    id: rawModel.id,
    name: rawModel.name || rawModel.id,
    description: rawModel.description,
    releasedAt: normalizeReleasedAt(rawModel.created),
    abilities: {
      toolCall: supportedParameters.includes("tools"),
      reasoning:
        supportedParameters.includes("reasoning") ||
        supportedParameters.includes("include_reasoning"),
      vision: inputModalities.includes("image"),
      structuredOutput:
        supportedParameters.includes("structured_outputs") ||
        supportedParameters.includes("response_format"),
      search:
        supportedParameters.includes("web_search") ||
        rawModel.pricing?.web_search !== undefined,
      imageOutput: outputModalities?.includes("image") ?? false,
      video:
        inputModalities.includes("video") ||
        (outputModalities?.includes("video") ?? false),
      attachment:
        inputModalities.includes("file") || inputModalities.includes("pdf"),
      temperature: hasTemperature,
    },
    contextWindow:
      rawModel.context_length ?? rawModel.top_provider?.context_length,
    maxOutput: rawModel.top_provider?.max_completion_tokens,
    modalities: normalizeModalities(inputModalities, outputModalities),
    pricing: createPricing(
      parsePrice(rawModel.pricing?.prompt),
      parsePrice(rawModel.pricing?.completion),
      parsePrice(rawModel.pricing?.input_cache_read),
      parsePrice(rawModel.pricing?.input_cache_write),
    ),
  };
}

export async function fetchOpenRouterCatalog(): Promise<OfficialCatalog> {
  const raw = await fetch("https://openrouter.ai/api/v1/models").then(
    (response) => response.json() as Promise<OpenRouterResponse>,
  );
  const models = (raw.data ?? []).map(normalizeModel);

  return {
    providerCount: models.length > 0 ? 1 : 0,
    modelCount: models.length,
    models,
  };
}
