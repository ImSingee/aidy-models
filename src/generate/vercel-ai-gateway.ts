import type { Model } from "../types.ts";
import { normalizeModelType } from "./model-types.ts";
import { VERCEL_AI_GATEWAY_BASE_URL } from "./shared.ts";
import {
  createPricing,
  type OfficialCatalog,
  normalizeReleasedAt,
  parsePrice,
} from "./official-shared.ts";

type RawVercelModel = {
  id: string;
  created?: number;
  released?: number;
  owned_by?: string;
  name?: string;
  description?: string;
  context_window?: number;
  max_tokens?: number;
  type?: string;
  tags?: string[];
  pricing?: Record<string, string | number | undefined>;
};

type VercelResponse = { data?: RawVercelModel[] };

function normalizeModel(rawModel: RawVercelModel): Model {
  const tags = rawModel.tags ?? [];

  return {
    id: rawModel.id,
    name: rawModel.name || rawModel.id,
    description: rawModel.description,
    type: normalizeModelType(rawModel.type, `vercel-ai-gateway/${rawModel.id}`),
    releasedAt: normalizeReleasedAt(rawModel.released ?? rawModel.created),
    abilities: {
      toolCall: tags.includes("tool-use"),
      reasoning: tags.includes("reasoning"),
      vision: tags.includes("vision"),
      structuredOutput: tags.includes("structured-output"),
      search: tags.includes("search"),
      imageOutput:
        tags.includes("image-output") || rawModel.type?.includes("image") === true,
      video:
        tags.includes("video") ||
        tags.includes("video-output") ||
        rawModel.type?.includes("video") === true,
    },
    // The catalog reports 0 for unknown limits (e.g. embedding models).
    contextWindow: rawModel.context_window || undefined,
    maxOutput: rawModel.max_tokens || undefined,
    pricing: createPricing(
      parsePrice(rawModel.pricing?.input),
      parsePrice(rawModel.pricing?.output),
      parsePrice(rawModel.pricing?.input_cache_read),
      parsePrice(rawModel.pricing?.input_cache_write),
    ),
  };
}

export async function fetchVercelAiGatewayCatalog(): Promise<OfficialCatalog> {
  const raw = await fetch(`${VERCEL_AI_GATEWAY_BASE_URL}/models`).then(
    (response) => response.json() as Promise<VercelResponse>,
  );
  const models = (raw.data ?? []).map(normalizeModel);

  return {
    providerCount: models.length > 0 ? 1 : 0,
    modelCount: models.length,
    models,
  };
}
