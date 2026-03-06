import type { Model, ModelsDatabase, Provider } from "../types.ts";
import { finalizeModel, mergeModels, normalizeLobehubModel, normalizeModelsDevModel } from "./models.ts";
import { overrides } from "./overrides.ts";
import { validatePricing } from "./pricing.ts";
import { mergeProviders } from "./providers.ts";
import {
  LOBEHUB_URL,
  MODELS_DEV_URL,
  canonicalProviderId,
  lobehubIdFor,
} from "./shared.ts";
import { deepAssign } from "./utils.ts";

type Logger = Pick<Console, "log">;

type RawModelsDev = Record<string, any>;
type RawLobehub = {
  _meta?: { commitHash?: string };
  providers?: Record<string, any>;
  models?: Record<string, any[]>;
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

type SourceStats = {
  lobehubModelCount: number;
  lobehubProviderIds: string[];
  lobehubRaw: RawLobehub;
  modelsDevModelCount: number;
  modelsDevProviderIds: string[];
  modelsDevRaw: RawModelsDev;
};

async function fetchSources(logger: Logger): Promise<SourceStats> {
  logger.log("Fetching data sources...");
  const [modelsDevRaw, lobehubRaw] = await Promise.all([
    fetch(MODELS_DEV_URL).then((response) => response.json() as Promise<RawModelsDev>),
    fetch(LOBEHUB_URL).then((response) => response.json() as Promise<RawLobehub>),
  ]);

  const modelsDevProviderIds = Object.keys(modelsDevRaw);
  const lobehubProviderIds = Object.keys(lobehubRaw.providers ?? {});
  const modelsDevModelCount = modelsDevProviderIds.reduce(
    (sum, providerId) =>
      sum + Object.keys(modelsDevRaw[providerId]?.models ?? {}).length,
    0,
  );
  const lobehubModelCount = Object.values(lobehubRaw.models ?? {}).reduce(
    (sum: number, models: unknown) => sum + (Array.isArray(models) ? models.length : 0),
    0,
  );

  logger.log(
    `  models.dev: ${modelsDevProviderIds.length} providers, ${modelsDevModelCount} models`,
  );
  logger.log(
    `  lobehub:    ${lobehubProviderIds.length} providers, ${lobehubModelCount} models`,
  );

  return {
    lobehubModelCount,
    lobehubProviderIds,
    lobehubRaw,
    modelsDevModelCount,
    modelsDevProviderIds,
    modelsDevRaw,
  };
}

function buildMergedModels(input: {
  lobehubRaw: RawLobehub;
  mergedProviders: Record<string, Provider>;
  modelsDevProviderIds: string[];
  modelsDevRaw: RawModelsDev;
}): { mergedModels: Record<string, Model[]>; totalModels: number } {
  const { lobehubRaw, mergedProviders, modelsDevProviderIds, modelsDevRaw } = input;
  const lobehubProviders = lobehubRaw.providers ?? {};
  const mergedModels: Record<string, Model[]> = {};
  let totalModels = 0;

  const allProviderIds = new Set<string>();
  for (const modelsDevId of modelsDevProviderIds) {
    if (Object.keys(modelsDevRaw[modelsDevId]?.models ?? {}).length > 0) {
      allProviderIds.add(modelsDevId);
    }
  }
  for (const lobehubId of Object.keys(lobehubRaw.models ?? {})) {
    allProviderIds.add(canonicalProviderId(lobehubId, "lobehub"));
  }

  for (const canonicalId of allProviderIds) {
    const provider = mergedProviders[canonicalId];

    const mdModelsRaw: Record<string, any> = modelsDevRaw[canonicalId]?.models ?? {};
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
    if (allModelIds.size === 0) continue;

    const models: Model[] = [];
    for (const modelId of allModelIds) {
      models.push(
        finalizeModel(
          canonicalId,
          provider,
          mergeModels(lhMap.get(modelId), mdMap.get(modelId)),
        ),
      );
    }

    mergedModels[canonicalId] = models;
    totalModels += models.length;
  }

  return { mergedModels, totalModels };
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
        deepAssign(mergedProviders[providerId], patch as Record<string, any>);
        overridesApplied += 1;
      }
    }
  }

  if (overrides.models) {
    for (const [key, patch] of Object.entries(overrides.models)) {
      const [providerId, modelId] = key.split("/", 2);
      const models = mergedModels[providerId];
      if (!models) continue;

      const model = models.find((entry) => entry.id === modelId);
      if (model) {
        deepAssign(model, patch as Record<string, any>);
        overridesApplied += 1;
      }
    }
  }

  if (overridesApplied > 0) {
    logger.log(`\nApplied ${overridesApplied} overrides`);
  }

  return overridesApplied;
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

export async function generateModelsDatabase(
  logger: Logger = console,
): Promise<GenerateResult> {
  const {
    lobehubModelCount,
    lobehubProviderIds,
    lobehubRaw,
    modelsDevModelCount,
    modelsDevProviderIds,
    modelsDevRaw,
  } = await fetchSources(logger);

  logger.log("\nMerging providers...");
  const mergedProviders = mergeProviders(modelsDevRaw, lobehubRaw);
  logger.log(`  ${Object.keys(mergedProviders).length} providers`);

  logger.log("\nMerging models...");
  const { mergedModels, totalModels } = buildMergedModels({
    lobehubRaw,
    mergedProviders,
    modelsDevProviderIds,
    modelsDevRaw,
  });
  logger.log(
    `  ${totalModels} models across ${Object.keys(mergedModels).length} providers`,
  );

  const overridesApplied = applyOverrides({
    logger,
    mergedModels,
    mergedProviders,
  });
  logPricingStats(mergedModels, logger);

  return {
    output: {
      _meta: {
        generatedAt: new Date().toISOString(),
        sources: {
          modelsDev: {
            providerCount: modelsDevProviderIds.length,
            modelCount: modelsDevModelCount,
          },
          lobehub: {
            commitHash: lobehubRaw._meta?.commitHash ?? "unknown",
            providerCount: lobehubProviderIds.length,
            modelCount: lobehubModelCount,
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
    },
    providerCount: Object.keys(mergedProviders).length,
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
    `\nDone: models.json (${result.providerCount} providers, ${result.totalModels} models)`,
  );

  return result;
}
