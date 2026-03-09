import type { Model, ModelsDatabase, Provider, SourceMeta } from "../types.ts";
import {
  fallbackDerivedProviders,
  kimiCodingFallbackModels,
  manualModels,
  manualProviders,
} from "./manual.ts";
import {
  finalizeModel,
  mergeAuthoritativeModel,
  mergeModels,
  normalizeLobehubModel,
  normalizeModelsDevModel,
} from "./models.ts";
import { overrides } from "./overrides.ts";
import { validatePricing } from "./pricing.ts";
import { mergeProviders } from "./providers.ts";
import {
  LOBEHUB_URL,
  MODELS_DEV_URL,
  canonicalProviderId,
  lobehubIdFor,
  modelsDevIdFor,
} from "./shared.ts";
import { clone, deepAssign } from "./utils.ts";
import { fetchOpenRouterCatalog } from "./openrouter.ts";
import { fetchVercelAiGatewayCatalog } from "./vercel-ai-gateway.ts";

type Logger = Pick<Console, "log">;

type RawModelsDev = Record<string, any>;
type RawLobehub = {
  _meta?: { commitHash?: string };
  providers?: Record<string, any>;
  models?: Record<string, any[]>;
};

type SourceStats = {
  lobehubMeta: SourceMeta & { commitHash: string };
  lobehubRaw: RawLobehub;
  manualMeta: SourceMeta;
  modelsDevMeta: SourceMeta;
  modelsDevRaw: RawModelsDev;
  openRouterMeta: SourceMeta;
  openRouterModels: Model[];
  vercelAiGatewayMeta: SourceMeta;
  vercelAiGatewayModels: Model[];
};

export interface GenerateResult {
  output: ModelsDatabase;
  providerCount: number;
  totalModels: number;
}

export interface WriteGeneratedModelsOptions {
  outputPath: string;
  logger?: Logger;
}

function sumModelCount(modelsByProvider: Record<string, Model[]>): number {
  return Object.values(modelsByProvider).reduce(
    (sum, models) => sum + models.length,
    0,
  );
}

async function fetchSources(logger: Logger): Promise<SourceStats> {
  logger.log("Fetching data sources...");

  const [
    modelsDevRaw,
    lobehubRaw,
    openRouterCatalog,
    vercelAiGatewayCatalog,
  ] = await Promise.all([
    fetch(MODELS_DEV_URL).then((response) => response.json() as Promise<RawModelsDev>),
    fetch(LOBEHUB_URL).then((response) => response.json() as Promise<RawLobehub>),
    fetchOpenRouterCatalog(),
    fetchVercelAiGatewayCatalog(),
  ]);

  const modelsDevProviderIds = Object.keys(modelsDevRaw);
  const modelsDevModelCount = modelsDevProviderIds.reduce(
    (sum, providerId) =>
      sum + Object.keys(modelsDevRaw[providerId]?.models ?? {}).length,
    0,
  );
  const lobehubProviderIds = Object.keys(lobehubRaw.providers ?? {});
  const lobehubModelCount = Object.values(lobehubRaw.models ?? {}).reduce(
    (sum: number, models: unknown) => sum + (Array.isArray(models) ? models.length : 0),
    0,
  );

  const manualProviderIds = new Set([
    ...Object.keys(manualProviders),
    ...Object.keys(manualModels),
  ]);
  const manualModelCount = Object.values(manualModels).reduce(
    (sum, models) => sum + models.length,
    0,
  );

  logger.log(
    `  models.dev:           ${modelsDevProviderIds.length} providers, ${modelsDevModelCount} models`,
  );
  logger.log(
    `  lobehub:              ${lobehubProviderIds.length} providers, ${lobehubModelCount} models`,
  );
  logger.log(
    `  openrouter official:  ${openRouterCatalog.providerCount} providers, ${openRouterCatalog.modelCount} models`,
  );
  logger.log(
    `  vercel official:      ${vercelAiGatewayCatalog.providerCount} providers, ${vercelAiGatewayCatalog.modelCount} models`,
  );
  logger.log(
    `  manual manifests:     ${manualProviderIds.size} providers, ${manualModelCount} models`,
  );

  return {
    lobehubMeta: {
      commitHash: lobehubRaw._meta?.commitHash ?? "unknown",
      providerCount: lobehubProviderIds.length,
      modelCount: lobehubModelCount,
    },
    lobehubRaw,
    manualMeta: {
      providerCount: manualProviderIds.size,
      modelCount: manualModelCount,
    },
    modelsDevMeta: {
      providerCount: modelsDevProviderIds.length,
      modelCount: modelsDevModelCount,
    },
    modelsDevRaw,
    openRouterMeta: {
      providerCount: openRouterCatalog.providerCount,
      modelCount: openRouterCatalog.modelCount,
    },
    openRouterModels: openRouterCatalog.models,
    vercelAiGatewayMeta: {
      providerCount: vercelAiGatewayCatalog.providerCount,
      modelCount: vercelAiGatewayCatalog.modelCount,
    },
    vercelAiGatewayModels: vercelAiGatewayCatalog.models,
  };
}

function buildBaseModels(input: {
  lobehubRaw: RawLobehub;
  mergedProviders: Record<string, Provider>;
  modelsDevRaw: RawModelsDev;
}): Record<string, Model[]> {
  const { lobehubRaw, mergedProviders, modelsDevRaw } = input;
  const lobehubProviders = lobehubRaw.providers ?? {};
  const mergedModels: Record<string, Model[]> = {};
  const allProviderIds = new Set<string>();

  for (const modelsDevId of Object.keys(modelsDevRaw)) {
    if (Object.keys(modelsDevRaw[modelsDevId]?.models ?? {}).length === 0) {
      continue;
    }
    allProviderIds.add(canonicalProviderId(modelsDevId, "modelsDev"));
  }

  for (const lobehubId of Object.keys(lobehubRaw.models ?? {})) {
    allProviderIds.add(canonicalProviderId(lobehubId, "lobehub"));
  }

  for (const canonicalId of allProviderIds) {
    const mdProviderId = modelsDevIdFor(canonicalId, modelsDevRaw);
    const mdModelsRaw: Record<string, any> = mdProviderId
      ? (modelsDevRaw[mdProviderId]?.models ?? {})
      : {};
    const mdMap = new Map<string, Model>();
    for (const [modelId, rawModel] of Object.entries(mdModelsRaw)) {
      mdMap.set(modelId, normalizeModelsDevModel(canonicalId, { id: modelId, ...rawModel }));
    }

    const lobehubProviderId =
      lobehubIdFor(canonicalId, lobehubProviders) ?? canonicalId;
    const lhModelsRaw: Array<Record<string, any>> =
      lobehubRaw.models?.[lobehubProviderId] ?? [];
    const lhMap = new Map<string, Model>();
    for (const rawModel of lhModelsRaw) {
      if (rawModel.id) {
        lhMap.set(rawModel.id, normalizeLobehubModel(rawModel));
      }
    }

    const allModelIds = new Set([...mdMap.keys(), ...lhMap.keys()]);
    if (allModelIds.size === 0 || !mergedProviders[canonicalId]) {
      continue;
    }

    mergedModels[canonicalId] = [...allModelIds].map((modelId) =>
      mergeModels(lhMap.get(modelId), mdMap.get(modelId)),
    );
  }

  return mergedModels;
}

function applyAuthoritativeCatalog(
  mergedModels: Record<string, Model[]>,
  providerId: string,
  authoritativeModels: Model[],
): void {
  const supplementalMap = new Map(
    (mergedModels[providerId] ?? []).map((model) => [model.id, model]),
  );

  mergedModels[providerId] = authoritativeModels.map((model) =>
    mergeAuthoritativeModel(model, supplementalMap.get(model.id)),
  );
}

function upsertProviders(
  mergedProviders: Record<string, Provider>,
  providers: Record<string, Provider>,
): void {
  for (const [providerId, provider] of Object.entries(providers)) {
    if (mergedProviders[providerId]) {
      deepAssign(mergedProviders[providerId], clone(provider));
      continue;
    }

    mergedProviders[providerId] = clone(provider);
  }
}

function upsertModels(
  mergedModels: Record<string, Model[]>,
  modelsByProvider: Record<string, Model[]>,
): void {
  for (const [providerId, models] of Object.entries(modelsByProvider)) {
    const modelMap = new Map(
      (mergedModels[providerId] ?? []).map((model) => [model.id, model]),
    );

    for (const model of models) {
      modelMap.set(
        model.id,
        mergeAuthoritativeModel(model, modelMap.get(model.id)),
      );
    }

    mergedModels[providerId] = [...modelMap.values()];
  }
}

function resolveModelApi(
  provider: Provider | undefined,
  model: Model,
): string | undefined {
  return model.api ?? provider?.api;
}

function deriveAzureOpenAIResponses(input: {
  mergedModels: Record<string, Model[]>;
  mergedProviders: Record<string, Provider>;
}): SourceMeta {
  const { mergedModels, mergedProviders } = input;
  const openAIProvider = mergedProviders["openai"];
  if (!openAIProvider) {
    return { providerCount: 0, modelCount: 0 };
  }

  const providerSeed =
    mergedProviders["azure"] ??
    mergedProviders["azure-cognitive-services"] ??
    fallbackDerivedProviders["azure-openai-responses"];
  const derivedProvider = clone(providerSeed);
  derivedProvider.id = "azure-openai-responses";
  derivedProvider.name = "Azure OpenAI Responses";
  derivedProvider.api = "azure-openai-responses";
  derivedProvider.baseUrl = "";
  mergedProviders["azure-openai-responses"] = derivedProvider;

  const derivedModels = (mergedModels["openai"] ?? [])
    .filter(
      (model) => resolveModelApi(openAIProvider, model) === "openai-responses",
    )
    .map((model) => ({
      ...clone(model),
      api: "azure-openai-responses",
      baseUrl: "",
    }));

  mergedModels["azure-openai-responses"] = derivedModels;

  return {
    providerCount: derivedModels.length > 0 ? 1 : 0,
    modelCount: derivedModels.length,
  };
}

function deriveKimiCoding(input: {
  mergedModels: Record<string, Model[]>;
  mergedProviders: Record<string, Provider>;
}): SourceMeta {
  const { mergedModels, mergedProviders } = input;
  const providerSeed =
    mergedProviders["kimi-for-coding"] ?? fallbackDerivedProviders["kimi-coding"];
  const derivedProvider = clone(providerSeed);
  derivedProvider.id = "kimi-coding";
  derivedProvider.name = "Kimi Coding";
  derivedProvider.api = "anthropic-messages";
  derivedProvider.baseUrl = "https://api.kimi.com/coding";
  mergedProviders["kimi-coding"] = derivedProvider;

  const sourceModels: Model[] = (mergedModels["kimi-for-coding"] ?? []).map(
    (model) => ({
      ...clone(model),
      api: "anthropic-messages",
      baseUrl: "https://api.kimi.com/coding",
    }),
  );

  const fallbackMap = new Map<string, Model>(
    sourceModels.map((model) => [model.id, model]),
  );
  for (const model of kimiCodingFallbackModels) {
    fallbackMap.set(
      model.id,
      mergeAuthoritativeModel(
        {
          ...clone(model),
          api: "anthropic-messages",
          baseUrl: "https://api.kimi.com/coding",
        },
        fallbackMap.get(model.id),
      ),
    );
  }

  mergedModels["kimi-coding"] = [...fallbackMap.values()];

  return {
    providerCount: mergedModels["kimi-coding"].length > 0 ? 1 : 0,
    modelCount: mergedModels["kimi-coding"].length,
  };
}

function applyOverrides(input: {
  mergedModels: Record<string, Model[]>;
  mergedProviders: Record<string, Provider>;
  logger: Logger;
}): number {
  const { logger, mergedModels, mergedProviders } = input;
  let overridesApplied = 0;

  if (overrides.providers) {
    for (const [providerId, patch] of Object.entries(overrides.providers)) {
      if (mergedProviders[providerId]) {
        deepAssign(mergedProviders[providerId], patch);
        overridesApplied += 1;
      }
    }
  }

  if (overrides.models) {
    for (const [key, patch] of Object.entries(overrides.models)) {
      const slashIndex = key.indexOf("/");
      if (slashIndex < 0) continue;

      const providerId = key.slice(0, slashIndex);
      const modelId = key.slice(slashIndex + 1);
      const models = mergedModels[providerId];
      if (!models) continue;

      const model = models.find((entry) => entry.id === modelId);
      if (model) {
        if (typeof patch === "function") {
          Object.assign(model, clone(patch(clone(model))));
        } else {
          deepAssign(model, clone(patch));
        }
        overridesApplied += 1;
      }
    }
  }

  if (overridesApplied > 0) {
    logger.log(`\nApplied ${overridesApplied} overrides`);
  }

  return overridesApplied;
}

function finalizeAllModels(
  mergedModels: Record<string, Model[]>,
  mergedProviders: Record<string, Provider>,
): void {
  for (const [providerId, models] of Object.entries(mergedModels)) {
    mergedModels[providerId] = models.map((model) =>
      finalizeModel(providerId, mergedProviders[providerId], model),
    );
  }
}

function normalizeProviderFlags(mergedProviders: Record<string, Provider>): void {
  for (const provider of Object.values(mergedProviders)) {
    provider.official = provider.official ?? false;
    provider.featured = provider.featured ?? false;
  }
}

function logPricingStats(mergedModels: Record<string, Model[]>, logger: Logger): void {
  let pricingBaseOnlyCount = 0;
  let pricingAbsoluteCount = 0;
  let pricingMultiplierCount = 0;

  for (const models of Object.values(mergedModels)) {
    for (const model of models) {
      if (!model.pricing) continue;

      validatePricing(model.id, model.pricing);

      const adjustments = model.pricing.adjustments ?? [];
      if (adjustments.length === 0) {
        pricingBaseOnlyCount += 1;
      } else {
        if (adjustments.some((adjustment) => adjustment.mode === "absolute")) {
          pricingAbsoluteCount += 1;
        }
        if (adjustments.some((adjustment) => adjustment.mode === "multiplier")) {
          pricingMultiplierCount += 1;
        }
      }
    }
  }

  logger.log("\nPricing migration stats...");
  logger.log(`  base only: ${pricingBaseOnlyCount}`);
  logger.log(`  with multiplier adjustments: ${pricingMultiplierCount}`);
  logger.log(`  with absolute adjustments: ${pricingAbsoluteCount}`);
}

function sortProviders(
  providers: Record<string, Provider>,
): Record<string, Provider> {
  return Object.fromEntries(
    Object.entries(providers).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sortModels(modelsByProvider: Record<string, Model[]>): Record<string, Model[]> {
  return Object.fromEntries(
    Object.entries(modelsByProvider)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([providerId, models]) => [
        providerId,
        [...models].sort((left, right) => left.id.localeCompare(right.id)),
      ]),
  );
}

export async function generateModelsDatabase(
  logger: Logger = console,
): Promise<GenerateResult> {
  const {
    lobehubMeta,
    lobehubRaw,
    manualMeta,
    modelsDevMeta,
    modelsDevRaw,
    openRouterMeta,
    openRouterModels,
    vercelAiGatewayMeta,
    vercelAiGatewayModels,
  } = await fetchSources(logger);

  logger.log("\nMerging base providers...");
  const mergedProviders = mergeProviders(modelsDevRaw, lobehubRaw);
  logger.log(`  ${Object.keys(mergedProviders).length} providers`);

  logger.log("\nMerging base models...");
  const mergedModels = buildBaseModels({
    lobehubRaw,
    mergedProviders,
    modelsDevRaw,
  });
  logger.log(
    `  ${sumModelCount(mergedModels)} models across ${Object.keys(mergedModels).length} providers`,
  );

  logger.log("\nApplying official catalogs...");
  applyAuthoritativeCatalog(mergedModels, "openrouter", openRouterModels);
  applyAuthoritativeCatalog(
    mergedModels,
    "vercel-ai-gateway",
    vercelAiGatewayModels,
  );

  logger.log("\nApplying manual manifests...");
  upsertProviders(mergedProviders, manualProviders);
  upsertModels(mergedModels, manualModels);

  logger.log("\nDeriving providers...");
  const azureDerivedMeta = deriveAzureOpenAIResponses({
    mergedModels,
    mergedProviders,
  });
  const kimiDerivedMeta = deriveKimiCoding({
    mergedModels,
    mergedProviders,
  });

  const derivedMeta: SourceMeta = {
    providerCount: azureDerivedMeta.providerCount + kimiDerivedMeta.providerCount,
    modelCount: azureDerivedMeta.modelCount + kimiDerivedMeta.modelCount,
  };

  const overridesApplied = applyOverrides({
    logger,
    mergedModels,
    mergedProviders,
  });

  normalizeProviderFlags(mergedProviders);
  finalizeAllModels(mergedModels, mergedProviders);
  logPricingStats(mergedModels, logger);

  const sortedProviders = sortProviders(mergedProviders);
  const sortedModels = sortModels(mergedModels);
  const totalModels = sumModelCount(sortedModels);

  return {
    output: {
      _meta: {
        generatedAt: new Date().toISOString(),
        sources: {
          modelsDev: modelsDevMeta,
          lobehub: lobehubMeta,
          openRouter: openRouterMeta,
          vercelAiGateway: vercelAiGatewayMeta,
          manual: manualMeta,
          derived: derivedMeta,
        },
        merged: {
          providerCount: Object.keys(sortedProviders).length,
          modelCount: totalModels,
        },
        overridesApplied,
      },
      providers: sortedProviders,
      models: sortedModels,
    },
    providerCount: Object.keys(sortedProviders).length,
    totalModels,
  };
}

export async function writeGeneratedModels(
  options: WriteGeneratedModelsOptions,
): Promise<GenerateResult> {
  const logger = options.logger ?? console;
  const result = await generateModelsDatabase(logger);

  await Bun.write(options.outputPath, JSON.stringify(result.output, null, 2));
  logger.log(
    `\nDone: ${options.outputPath} (${result.providerCount} providers, ${result.totalModels} models)`,
  );

  return result;
}
