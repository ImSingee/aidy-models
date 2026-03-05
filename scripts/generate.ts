#!/usr/bin/env bun

import { join } from "node:path";
import type { Model, ModelPricing, PricingUnit, PricingTier, Provider, ModelsDatabase } from "../src/types.ts";
import { overrides } from "../src/overrides.ts";

const ROOT = join(import.meta.dirname, "..");

const MODELS_DEV_URL = "https://models.dev/api.json";
const LOBEHUB_URL =
  "https://raw.githubusercontent.com/ImSingee/lobehub-models/refs/heads/master/models.json";

// models.dev provider ID -> lobehub provider ID
const PROVIDER_ID_MAP: Record<string, string> = {
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
  "vercel": "vercelaigateway",
  "xiaomi": "xiaomimimo",
};

// Reverse: lobehub ID -> canonical (models.dev) ID
const LOBEHUB_TO_CANONICAL: Record<string, string> = {};
for (const [mdId, lhId] of Object.entries(PROVIDER_ID_MAP)) {
  LOBEHUB_TO_CANONICAL[lhId] = mdId;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

console.log("Fetching data sources...");
const [modelsDevRaw, lobehubRaw] = await Promise.all([
  fetch(MODELS_DEV_URL).then((r) => r.json()),
  fetch(LOBEHUB_URL).then((r) => r.json()),
]);

const mdProviderIds = Object.keys(modelsDevRaw);
const lhProviderIds = Object.keys(lobehubRaw.providers ?? {});
const mdModelCount = mdProviderIds.reduce(
  (sum, pid) => sum + Object.keys(modelsDevRaw[pid]?.models ?? {}).length,
  0,
);
const lhModelCount = Object.values(lobehubRaw.models ?? {}).reduce(
  (sum: number, arr: unknown) => sum + (Array.isArray(arr) ? arr.length : 0),
  0,
);
console.log(`  models.dev: ${mdProviderIds.length} providers, ${mdModelCount} models`);
console.log(`  lobehub:    ${lhProviderIds.length} providers, ${lhModelCount} models`);

// ---------------------------------------------------------------------------
// Normalize helpers
// ---------------------------------------------------------------------------

function canonicalProviderId(id: string, source: "modelsDev" | "lobehub"): string {
  if (source === "lobehub") return LOBEHUB_TO_CANONICAL[id] ?? id;
  return id;
}

function lobehubIdFor(canonicalId: string): string | undefined {
  return PROVIDER_ID_MAP[canonicalId] ?? (lobehubRaw.providers?.[canonicalId] ? canonicalId : undefined);
}

function flatCostToUnits(cost: Record<string, any>): PricingUnit[] {
  const co2 = cost.context_over_200k;
  const UNIT = "millionTokens";

  const pairs: [string, string, string][] = [
    ["textInput", "input", "input"],
    ["textOutput", "output", "output"],
    ["textInput_cacheRead", "cacheRead", "cache_read"],
    ["textInput_cacheWrite", "cacheWrite", "cache_write"],
  ];

  const units: PricingUnit[] = [];
  for (const [name, _camel, flat] of pairs) {
    const base = cost[flat];
    if (base == null) continue;

    const over200k = co2?.[flat];
    if (over200k != null && over200k !== base) {
      units.push({
        name,
        strategy: "tiered",
        unit: UNIT,
        tiers: [
          { rate: base, upTo: 0.2 },
          { rate: over200k, upTo: "infinity" },
        ],
      });
    } else {
      units.push({ name, rate: base, strategy: "fixed", unit: UNIT });
    }
  }
  return units;
}

function normalizeModelsDevModel(m: Record<string, any>): Model {
  const cost = m.cost;
  return {
    id: m.id,
    name: m.name || m.id,
    family: m.family,
    releasedAt: m.release_date,
    knowledge: m.knowledge,
    openWeights: m.open_weights,
    status: m.status,
    abilities: {
      toolCall: m.tool_call ?? undefined,
      reasoning: m.reasoning ?? undefined,
      attachment: m.attachment ?? undefined,
      temperature: m.temperature ?? undefined,
      structuredOutput: m.structured_output ?? undefined,
      interleaved: m.interleaved ?? undefined,
      vision: m.modalities?.input?.includes("image") || undefined,
    },
    contextWindow: m.limit?.context,
    maxOutput: m.limit?.output,
    modalities: m.modalities,
    pricing: cost ? { currency: "USD", units: flatCostToUnits(cost) } : undefined,
  };
}

function normalizeLobehubModel(m: Record<string, any>): Model {
  return {
    id: m.id,
    name: m.displayName || m.id,
    description: m.description,
    type: m.type,
    releasedAt: m.releasedAt,
    enabled: m.enabled,
    abilities: {
      toolCall: m.abilities?.functionCall ?? undefined,
      reasoning: m.abilities?.reasoning ?? undefined,
      vision: m.abilities?.vision ?? undefined,
      structuredOutput: m.abilities?.structuredOutput ?? undefined,
      search: m.abilities?.search ?? undefined,
      imageOutput: m.abilities?.imageOutput ?? undefined,
      video: m.abilities?.video ?? undefined,
    },
    contextWindow: m.contextWindowTokens,
    maxOutput: m.maxOutput,
    pricing: m.pricing
      ? { currency: m.pricing.currency ?? "USD", units: m.pricing.units }
      : undefined,
  };
}

function mergePricing(lh?: ModelPricing, md?: ModelPricing): ModelPricing | undefined {
  if (!lh && !md) return undefined;
  if (lh?.units) return lh;
  return md;
}

function mergeModels(lh: Model | undefined, md: Model | undefined): Model {
  if (!lh) return md!;
  if (!md) return lh;
  return {
    id: lh.id,
    name: lh.name || md.name,
    description: lh.description ?? md.description,
    type: lh.type ?? md.type,
    family: md.family,
    releasedAt: lh.releasedAt ?? md.releasedAt,
    knowledge: md.knowledge,
    openWeights: md.openWeights,
    status: md.status,
    enabled: lh.enabled,
    abilities: {
      toolCall: lh.abilities.toolCall ?? md.abilities.toolCall,
      reasoning: lh.abilities.reasoning ?? md.abilities.reasoning,
      vision: lh.abilities.vision ?? md.abilities.vision,
      structuredOutput: lh.abilities.structuredOutput ?? md.abilities.structuredOutput,
      search: lh.abilities.search,
      imageOutput: lh.abilities.imageOutput,
      video: lh.abilities.video,
      attachment: md.abilities.attachment,
      temperature: md.abilities.temperature,
      interleaved: md.abilities.interleaved,
    },
    contextWindow: lh.contextWindow ?? md.contextWindow,
    maxOutput: lh.maxOutput ?? md.maxOutput,
    modalities: md.modalities ?? lh.modalities,
    pricing: mergePricing(lh.pricing, md.pricing),
  };
}

// ---------------------------------------------------------------------------
// Merge providers
// ---------------------------------------------------------------------------

// lobehub sdkType -> pi-ai api protocol
const SDK_TO_API: Record<string, string> = {
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

// Explicit api / baseUrl for providers not covered by lobehub sdkType or models.dev api URL
const PROVIDER_DEFAULTS: Record<string, { api?: string; baseUrl?: string }> = {
  "openai": { api: "openai-responses", baseUrl: "https://api.openai.com/v1" },
  "anthropic": { api: "anthropic-messages", baseUrl: "https://api.anthropic.com" },
  "google": { api: "google-generative-ai", baseUrl: "https://generativelanguage.googleapis.com" },
  "google-vertex": { api: "google-vertex", baseUrl: "https://us-central1-aiplatform.googleapis.com" },
  "google-vertex-anthropic": { api: "anthropic-messages", baseUrl: "https://us-central1-aiplatform.googleapis.com" },
  "amazon-bedrock": { api: "bedrock-converse-stream", baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com" },
  "azure": { api: "azure-openai-responses" },
  "azure-cognitive-services": { api: "azure-openai-responses" },
  "groq": { api: "openai-completions", baseUrl: "https://api.groq.com/openai/v1" },
  "xai": { api: "openai-completions", baseUrl: "https://api.x.ai/v1" },
  "mistral": { api: "openai-completions", baseUrl: "https://api.mistral.ai/v1" },
  "cerebras": { api: "openai-completions", baseUrl: "https://api.cerebras.ai/v1" },
  "cohere": { api: "openai-completions", baseUrl: "https://api.cohere.com/v2" },
  "perplexity": { api: "openai-completions", baseUrl: "https://api.perplexity.ai" },
  "togetherai": { api: "openai-completions", baseUrl: "https://api.together.xyz/v1" },
  "deepinfra": { api: "openai-completions", baseUrl: "https://api.deepinfra.com/v1/openai" },
  "venice": { api: "openai-completions", baseUrl: "https://api.venice.ai/api/v1" },
  "gitlab": { api: "openai-completions" },
  "sap-ai-core": { api: "openai-completions" },
  "cloudflare-ai-gateway": { api: "openai-completions" },
  "lobehub": { api: "openai-completions" },
  "vercel": { api: "openai-completions" },
  "fal": { api: "openai-completions" },
  "bfl": { api: "openai-completions" },
};

function inferApi(baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined;
  if (baseUrl.includes("/anthropic/")) return "anthropic-messages";
  return "openai-completions";
}

console.log("\nMerging providers...");
const mergedProviders: Record<string, Provider> = {};

for (const mdId of mdProviderIds) {
  const mdProv = modelsDevRaw[mdId];
  const canonical = mdId;
  const lhId = lobehubIdFor(canonical);
  const lhProv = lhId ? lobehubRaw.providers?.[lhId] : undefined;

  const defaults = PROVIDER_DEFAULTS[canonical];
  const lhSdkType: string | undefined = lhProv?.settings?.sdkType;
  const lhApi = lhSdkType ? SDK_TO_API[lhSdkType] : undefined;
  const mdBaseUrl: string | undefined = mdProv.api;
  const lhBaseUrl: string | undefined = lhProv?.proxyUrl?.placeholder;

  mergedProviders[canonical] = {
    id: canonical,
    name: lhProv?.name ?? mdProv.name ?? canonical,
    api: defaults?.api ?? lhApi ?? inferApi(mdBaseUrl),
    baseUrl: mdBaseUrl ?? lhBaseUrl ?? defaults?.baseUrl,
    description: lhProv?.description,
    url: lhProv?.url,
    env: mdProv.env,
    npm: mdProv.npm,
    doc: mdProv.doc,
    enabled: lhProv?.enabled,
    checkModel: lhProv?.checkModel,
    modelsUrl: lhProv?.modelsUrl,
    apiKeyUrl: lhProv?.apiKeyUrl,
    settings: lhProv?.settings,
  };
}

// Add lobehub-only providers
for (const lhId of lhProviderIds) {
  const canonical = canonicalProviderId(lhId, "lobehub");
  if (mergedProviders[canonical]) continue;
  const lhProv = lobehubRaw.providers[lhId];
  const lhDefaults = PROVIDER_DEFAULTS[canonical];
  const lhSdk: string | undefined = lhProv.settings?.sdkType;
  const lhApiVal = lhSdk ? SDK_TO_API[lhSdk] : undefined;
  mergedProviders[canonical] = {
    id: canonical,
    name: lhProv.name ?? canonical,
    api: lhDefaults?.api ?? lhApiVal,
    baseUrl: lhProv.proxyUrl?.placeholder ?? lhDefaults?.baseUrl,
    description: lhProv.description,
    url: lhProv.url,
    enabled: lhProv.enabled,
    checkModel: lhProv.checkModel,
    modelsUrl: lhProv.modelsUrl,
    apiKeyUrl: lhProv.apiKeyUrl,
    settings: lhProv.settings,
  };
}

console.log(`  ${Object.keys(mergedProviders).length} providers`);

// ---------------------------------------------------------------------------
// Merge models
// ---------------------------------------------------------------------------

console.log("\nMerging models...");
const mergedModels: Record<string, Model[]> = {};
let totalModels = 0;

// Collect all canonical provider IDs that have models in either source
const allProviderIds = new Set<string>();
for (const mdId of mdProviderIds) {
  if (Object.keys(modelsDevRaw[mdId]?.models ?? {}).length > 0) allProviderIds.add(mdId);
}
for (const lhId of Object.keys(lobehubRaw.models ?? {})) {
  allProviderIds.add(canonicalProviderId(lhId, "lobehub"));
}

for (const canonical of allProviderIds) {
  // models.dev models for this provider
  const mdModelsRaw: Record<string, any> = modelsDevRaw[canonical]?.models ?? {};
  const mdMap = new Map<string, Model>();
  for (const [id, raw] of Object.entries(mdModelsRaw)) {
    mdMap.set(id, normalizeModelsDevModel({ id, ...raw }));
  }

  // lobehub models for this provider
  const lhId = lobehubIdFor(canonical) ?? canonical;
  const lhModelsRaw: any[] = lobehubRaw.models?.[lhId] ?? [];
  const lhMap = new Map<string, Model>();
  for (const raw of lhModelsRaw) {
    if (raw.id) lhMap.set(raw.id, normalizeLobehubModel(raw));
  }

  // Union of model IDs
  const allModelIds = new Set([...mdMap.keys(), ...lhMap.keys()]);
  if (allModelIds.size === 0) continue;

  const list: Model[] = [];
  for (const modelId of allModelIds) {
    list.push(mergeModels(lhMap.get(modelId), mdMap.get(modelId)));
  }

  mergedModels[canonical] = list;
  totalModels += list.length;
}

console.log(`  ${totalModels} models across ${Object.keys(mergedModels).length} providers`);

// ---------------------------------------------------------------------------
// Apply overrides
// ---------------------------------------------------------------------------

let overridesApplied = 0;

if (overrides.providers) {
  for (const [pid, patch] of Object.entries(overrides.providers)) {
    if (mergedProviders[pid]) {
      Object.assign(mergedProviders[pid], patch);
      overridesApplied++;
    }
  }
}

if (overrides.models) {
  for (const [key, patch] of Object.entries(overrides.models)) {
    const [pid, mid] = key.split("/", 2);
    const list = mergedModels[pid];
    if (!list) continue;
    const model = list.find((m) => m.id === mid);
    if (model) {
      deepAssign(model, patch);
      overridesApplied++;
    }
  }
}

function deepAssign(target: Record<string, any>, source: Record<string, any>) {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof target[k] === "object") {
      deepAssign(target[k], v);
    } else {
      target[k] = v;
    }
  }
}

if (overridesApplied > 0) {
  console.log(`\nApplied ${overridesApplied} overrides`);
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const output: ModelsDatabase = {
  _meta: {
    generatedAt: new Date().toISOString(),
    sources: {
      modelsDev: { providerCount: mdProviderIds.length, modelCount: mdModelCount },
      lobehub: {
        commitHash: lobehubRaw._meta?.commitHash ?? "unknown",
        providerCount: lhProviderIds.length,
        modelCount: lhModelCount,
      },
    },
    merged: {
      providerCount: Object.keys(mergedProviders).length,
      modelCount: totalModels,
    },
    overridesApplied,
  },
  providers: mergedProviders,
  models: mergedModels,
};

const outPath = join(ROOT, "models.json");
await Bun.write(outPath, JSON.stringify(output, null, 2));
console.log(
  `\nDone: models.json (${Object.keys(mergedProviders).length} providers, ${totalModels} models)`,
);
