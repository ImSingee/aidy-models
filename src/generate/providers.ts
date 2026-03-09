import type {
  ModelCompat,
  OpenAICompletionsCompat,
  Provider,
} from "../types.ts";
import {
  PROVIDER_DEFAULTS,
  SDK_TO_API,
  inferApi,
  canonicalProviderId,
  lobehubIdFor,
  modelsDevIdFor,
} from "./shared.ts";
import {
  compactObject,
  isRecord,
  mergeCompat,
  mergeHeaders,
  mergeRecords,
} from "./utils.ts";

type RawModelsDev = Record<string, any>;
type RawLobehub = {
  providers?: Record<string, any>;
};

function createOpenAICompletionsCompat(
  providerId: string,
  baseUrl?: string,
): OpenAICompletionsCompat | undefined {
  const normalizedBaseUrl = (baseUrl ?? "").toLowerCase();
  const isZai = providerId === "zai" || normalizedBaseUrl.includes("api.z.ai");
  const isNonStandard =
    providerId === "cerebras" ||
    normalizedBaseUrl.includes("cerebras.ai") ||
    providerId === "xai" ||
    normalizedBaseUrl.includes("api.x.ai") ||
    providerId === "mistral" ||
    normalizedBaseUrl.includes("mistral.ai") ||
    normalizedBaseUrl.includes("chutes.ai") ||
    normalizedBaseUrl.includes("deepseek.com") ||
    isZai ||
    providerId === "opencode" ||
    normalizedBaseUrl.includes("opencode.ai");
  const isGrok = providerId === "xai" || normalizedBaseUrl.includes("api.x.ai");
  const isMistral =
    providerId === "mistral" || normalizedBaseUrl.includes("mistral.ai");
  const useMaxTokens =
    providerId === "mistral" ||
    normalizedBaseUrl.includes("mistral.ai") ||
    normalizedBaseUrl.includes("chutes.ai");

  const compat: OpenAICompletionsCompat = {};
  if (isNonStandard) {
    compat.supportsStore = false;
    compat.supportsDeveloperRole = false;
  }
  if (isGrok || isZai) {
    compat.supportsReasoningEffort = false;
  }
  if (useMaxTokens) {
    compat.maxTokensField = "max_tokens";
  }
  if (isMistral) {
    compat.requiresToolResultName = true;
    compat.requiresThinkingAsText = true;
    compat.requiresMistralToolIds = true;
    compat.toolCallIdStrategy = "mistral-9";
  }
  if (isZai) {
    compat.thinkingFormat = "zai";
  }

  return compactObject(compat);
}

function createProviderCompat(input: {
  providerId: string;
  api?: string;
  baseUrl?: string;
}): ModelCompat | undefined {
  const compat: ModelCompat = {};

  if (input.api === "openai-completions") {
    const openaiCompletions = createOpenAICompletionsCompat(
      input.providerId,
      input.baseUrl,
    );
    if (openaiCompletions) {
      compat.openaiCompletions = openaiCompletions;
    }
  }

  if (input.providerId === "github-copilot") {
    compat.openaiCompletions = mergeRecords(compat.openaiCompletions, {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      assistantContentFormat: "string",
    });
  }

  if (input.providerId === "huggingface") {
    compat.openaiCompletions = mergeRecords(compat.openaiCompletions, {
      supportsDeveloperRole: false,
    });
  }

  if (input.providerId === "openai") {
    compat.openaiResponses = mergeRecords(compat.openaiResponses, {
      longPromptCacheTtl: "24h",
      toolCallIdStrategy: "responses-fc64",
    });
  }

  if (input.providerId === "opencode") {
    compat.openaiResponses = mergeRecords(compat.openaiResponses, {
      toolCallIdStrategy: "responses-fc64",
    });
  }

  if (input.providerId === "anthropic") {
    compat.anthropic = mergeRecords(compat.anthropic, {
      longPromptCacheTtl: "1h",
    });
  }

  return compactObject(compat);
}

export function mergeProviders(
  modelsDevRaw: RawModelsDev,
  lobehubRaw: RawLobehub,
): Record<string, Provider> {
  const mergedProviders: Record<string, Provider> = {};
  const mdProviderIds = Object.keys(modelsDevRaw);
  const lhProviders = lobehubRaw.providers ?? {};
  const lhProviderIds = Object.keys(lhProviders);

  for (const modelsDevId of mdProviderIds) {
    const canonicalId = canonicalProviderId(modelsDevId, "modelsDev");
    const sourceModelsDevId = modelsDevIdFor(canonicalId, modelsDevRaw);
    if (!sourceModelsDevId) continue;

    const mdProvider = modelsDevRaw[sourceModelsDevId];
    const lobehubProviderId = lobehubIdFor(canonicalId, lhProviders);
    const lhProvider = lobehubProviderId ? lhProviders[lobehubProviderId] : undefined;

    const defaults = PROVIDER_DEFAULTS[canonicalId];
    const lhSdkType: string | undefined = lhProvider?.settings?.sdkType;
    const lhApi = lhSdkType ? SDK_TO_API[lhSdkType] : undefined;
    const mdBaseUrl: string | undefined = mdProvider.api;
    const lhBaseUrl: string | undefined = lhProvider?.proxyUrl?.placeholder;
    const resolvedApi = defaults?.api ?? lhApi ?? inferApi(mdBaseUrl);
    const resolvedBaseUrl = defaults?.baseUrl ?? mdBaseUrl ?? lhBaseUrl;
    const rawMeta = mergeRecords(
      isRecord(lhProvider?.settings) ? lhProvider.settings : undefined,
      compactObject({
        ...(mdProvider.env ? { env: mdProvider.env } : {}),
        ...(mdProvider.npm ? { npm: mdProvider.npm } : {}),
        ...(lhProvider?.modelsUrl ? { modelsUrl: lhProvider.modelsUrl } : {}),
      }),
    );

    mergedProviders[canonicalId] = {
      id: canonicalId,
      name: lhProvider?.name ?? mdProvider.name ?? canonicalId,
      official: false,
      featured: false,
      api: resolvedApi,
      baseUrl: resolvedBaseUrl,
      headers: mergeHeaders(defaults?.headers),
      description: lhProvider?.description,
      url: lhProvider?.url,
      doc: mdProvider.doc,
      enabled: lhProvider?.enabled,
      checkModel: lhProvider?.checkModel,
      apiKeyUrl: lhProvider?.apiKeyUrl,
      _: rawMeta,
      compat: mergeCompat(
        defaults?.compat,
        createProviderCompat({
          providerId: canonicalId,
          api: resolvedApi,
          baseUrl: resolvedBaseUrl,
        }),
      ),
    };
  }

  for (const lobehubId of lhProviderIds) {
    const canonicalId = canonicalProviderId(lobehubId, "lobehub");
    if (mergedProviders[canonicalId]) continue;

    const lhProvider = lhProviders[lobehubId];
    const defaults = PROVIDER_DEFAULTS[canonicalId];
    const lhSdkType: string | undefined = lhProvider.settings?.sdkType;
    const lhApi = lhSdkType ? SDK_TO_API[lhSdkType] : undefined;
    const resolvedApi = defaults?.api ?? lhApi;
    const resolvedBaseUrl = defaults?.baseUrl ?? lhProvider.proxyUrl?.placeholder;
    const rawMeta = mergeRecords(
      isRecord(lhProvider.settings) ? lhProvider.settings : undefined,
      compactObject({
        ...(lhProvider.modelsUrl ? { modelsUrl: lhProvider.modelsUrl } : {}),
      }),
    );

    mergedProviders[canonicalId] = {
      id: canonicalId,
      name: lhProvider.name ?? canonicalId,
      official: false,
      featured: false,
      api: resolvedApi,
      baseUrl: resolvedBaseUrl,
      headers: mergeHeaders(defaults?.headers),
      description: lhProvider.description,
      url: lhProvider.url,
      enabled: lhProvider.enabled,
      checkModel: lhProvider.checkModel,
      apiKeyUrl: lhProvider.apiKeyUrl,
      _: rawMeta,
      compat: mergeCompat(
        defaults?.compat,
        createProviderCompat({
          providerId: canonicalId,
          api: resolvedApi,
          baseUrl: resolvedBaseUrl,
        }),
      ),
    };
  }

  return mergedProviders;
}
