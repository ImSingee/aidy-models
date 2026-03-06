#!/usr/bin/env bun

import { join } from "node:path";
import type {
  BedrockCompat,
  Model,
  ModelCompat,
  ModelPricing,
  ModelsDatabase,
  OpenAICompletionsCompat,
  PricingAdjustment,
  PricingConditionValue,
  PricingRange,
  Provider,
} from "../src/types.ts";
import { overrides } from "../src/overrides.ts";

const ROOT = join(import.meta.dirname, "..");

const MODELS_DEV_URL = "https://models.dev/api.json";
const LOBEHUB_URL =
  "https://raw.githubusercontent.com/ImSingee/lobehub-models/refs/heads/master/models.json";
const COPILOT_BASE_URL = "https://api.individual.githubcopilot.com";
const OPENCODE_BASE_URL = "https://opencode.ai/zen/v1";
const OPENCODE_ANTHROPIC_BASE_URL = "https://opencode.ai/zen";
const COPILOT_STATIC_HEADERS = {
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
} as const;

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

type ProviderDefaults = Pick<Provider, "api" | "baseUrl" | "headers" | "compat">;

const PROVIDER_DEFAULTS: Record<string, ProviderDefaults> = {
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
  "vercel": { api: "openai-completions" },
  "fal": { api: "openai-completions" },
  "bfl": { api: "openai-completions" },
};

type LegacyPricingTier = {
  rate: number;
  upTo: number | "infinity";
};

type LegacyPricingUnit = {
  lookup?: {
    prices: Record<string, number>;
    pricingParams: string[];
  };
  name: string;
  rate?: number;
  strategy: "fixed" | "tiered" | "lookup";
  tiers?: LegacyPricingTier[];
  unit: string;
};

type LegacyModelPricing = {
  currency?: string;
  units?: LegacyPricingUnit[];
};

type LegacyPricingParam = {
  normalizedName: string;
  originalName: string;
};

type LegacyRateRow = {
  rate: number;
  when: Record<string, PricingConditionValue>;
};

type LegacyUnitRows = {
  params: LegacyPricingParam[];
  rows: LegacyRateRow[];
};

const MULTIPLIER_FRIENDLY_CONDITIONS = new Set([
  "cacheTtl",
  "generateAudio",
  "textOutput",
  "totalInput",
  "thinkingMode",
]);

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
console.log(
  `  models.dev: ${mdProviderIds.length} providers, ${mdModelCount} models`,
);
console.log(
  `  lobehub:    ${lhProviderIds.length} providers, ${lhModelCount} models`,
);

// ---------------------------------------------------------------------------
// Normalize helpers
// ---------------------------------------------------------------------------

function canonicalProviderId(id: string, source: "modelsDev" | "lobehub"): string {
  if (source === "lobehub") {
    return LOBEHUB_TO_CANONICAL[id] ?? id;
  }
  return id;
}

function lobehubIdFor(canonicalId: string): string | undefined {
  return (
    PROVIDER_ID_MAP[canonicalId] ??
    (lobehubRaw.providers?.[canonicalId] ? canonicalId : undefined)
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isEmptyRecord(value: Record<string, unknown> | undefined): boolean {
  return !value || Object.keys(value).length === 0;
}

function compactObject<T extends Record<string, unknown>>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

function deepAssign(target: Record<string, any>, source: Record<string, any>) {
  for (const [k, v] of Object.entries(source)) {
    if (isRecord(v) && isRecord(target[k])) {
      deepAssign(target[k], v);
    } else {
      target[k] = v;
    }
  }
}

function mergeRecords<T extends Record<string, any>>(
  base?: T,
  override?: T,
): T | undefined {
  if (!base) {
    return override ? clone(override) : undefined;
  }
  if (!override) {
    return clone(base);
  }

  const result = clone(base);
  deepAssign(result, clone(override));
  return isEmptyRecord(result) ? undefined : result;
}

function mergeCompat(
  ...compatList: Array<ModelCompat | undefined>
): ModelCompat | undefined {
  let result: ModelCompat | undefined;
  for (const compat of compatList) {
    result = mergeRecords(result, compat);
  }
  return result;
}

function mergeHeaders(
  ...headersList: Array<Record<string, string> | undefined>
): Record<string, string> | undefined {
  const merged = Object.assign({}, ...headersList.filter(Boolean));
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function roundNumber(value: number): number {
  return Number(value.toFixed(12));
}

function resolveSinglePricingUnit(units: LegacyPricingUnit[], modelId: string): string {
  const uniqueUnits = [...new Set(units.map((unit) => unit.unit).filter(Boolean))];

  if (uniqueUnits.length === 0) {
    throw new Error(`Missing pricing unit for ${modelId}`);
  }

  if (uniqueUnits.length > 1) {
    throw new Error(
      `Mixed pricing units are not supported for ${modelId}: ${uniqueUnits.join(", ")}`,
    );
  }

  return uniqueUnits[0];
}

function normalizeThresholdNumber(value: number, unit: string): number {
  if ((unit === "millionTokens" || unit === "millionCharacters") && value > 1000) {
    return roundNumber(value / 1_000_000);
  }

  return roundNumber(value);
}

function parseNumericToken(value: string): number | undefined {
  const normalized = value.replaceAll("_", "");
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return undefined;
  return roundNumber(Number(normalized));
}

function parseScalarToken(value: string): string | number | boolean {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  const numeric = parseNumericToken(trimmed);
  return numeric ?? trimmed;
}

function parseConditionToken(value: string, unit: string): PricingConditionValue {
  const trimmed = value.trim();

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    const parts = inner.split(",");

    if (parts.length === 2) {
      const min = parseNumericToken(parts[0].trim());
      const maxRaw = parts[1].trim();

      if (min !== undefined) {
        if (maxRaw === "infinity") {
          return [normalizeThresholdNumber(min, unit), "infinity"];
        }

        const max = parseNumericToken(maxRaw);
        if (max !== undefined) {
          return [
            normalizeThresholdNumber(min, unit),
            normalizeThresholdNumber(max, unit),
          ];
        }
      }
    }

    return parseScalarToken(inner);
  }

  return parseScalarToken(trimmed);
}

function normalizeConditionName(
  name: string,
  value: PricingConditionValue,
): string {
  if (name === "ttl") return "cacheTtl";
  if (name === "textInputRange") return "totalInput";
  if (name === "textOutputRange") return "textOutput";
  if (Array.isArray(value) && name === "textInput") return "totalInput";
  if (Array.isArray(value) && name === "textOutput") return "textOutput";
  return name;
}

function parseLookupKeySegments(key: string, paramCount: number): string[] | undefined {
  if (paramCount === 1) return [key];

  const segments: string[] = [];
  let index = 0;

  while (index < key.length) {
    if (key[index] === "[") {
      let cursor = index + 1;
      let depth = 1;

      while (cursor < key.length && depth > 0) {
        if (key[cursor] === "[") depth += 1;
        if (key[cursor] === "]") depth -= 1;
        cursor += 1;
      }

      if (depth !== 0) return undefined;

      segments.push(key.slice(index, cursor));
      index = cursor;
    } else {
      let cursor = index;
      while (cursor < key.length && key[cursor] !== "_") cursor += 1;
      segments.push(key.slice(index, cursor));
      index = cursor;
    }

    if (key[index] === "_") index += 1;
  }

  if (segments.length === 0 || segments.length > paramCount) return undefined;
  return segments;
}

function inferTieredConditionName(target: string): string {
  if (target === "textOutput") return "textOutput";
  if (
    target === "textInput" ||
    target === "textInput_cacheRead" ||
    target === "textInput_cacheWrite"
  ) {
    return "totalInput";
  }

  return `${target}Range`;
}

function legacyPricingUnitToRows(
  unit: LegacyPricingUnit,
  modelId: string,
): LegacyUnitRows {
  if (unit.strategy === "fixed") {
    if (typeof unit.rate !== "number") {
      throw new Error(`Missing fixed pricing rate for ${modelId}/${unit.name}`);
    }

    return {
      params: [],
      rows: [{ rate: unit.rate, when: {} }],
    };
  }

  if (unit.strategy === "tiered") {
    const conditionName = inferTieredConditionName(unit.name);
    let lowerBound = 0;

    return {
      params: [{ originalName: conditionName, normalizedName: conditionName }],
      rows: (unit.tiers ?? []).map((tier) => {
        const upperBound =
          tier.upTo === "infinity"
            ? "infinity"
            : normalizeThresholdNumber(tier.upTo, unit.unit);

        const row: LegacyRateRow = {
          rate: tier.rate,
          when: {
            [conditionName]: [
              normalizeThresholdNumber(lowerBound, unit.unit),
              upperBound,
            ] satisfies PricingRange,
          },
        };

        if (upperBound !== "infinity") {
          lowerBound = upperBound;
        }

        return row;
      }),
    };
  }

  const pricingParams = unit.lookup?.pricingParams ?? [];
  const prices = unit.lookup?.prices ?? {};
  const rows: LegacyRateRow[] = [];
  const params = new Map<string, LegacyPricingParam>();

  for (const [lookupKey, rate] of Object.entries(prices)) {
    const segments = parseLookupKeySegments(lookupKey, pricingParams.length);
    if (!segments) {
      throw new Error(
        `Unable to parse lookup key "${lookupKey}" for ${modelId}/${unit.name}`,
      );
    }

    const when: Record<string, PricingConditionValue> = {};

    for (const [index, segment] of segments.entries()) {
      const originalName = pricingParams[index];
      const value = parseConditionToken(segment, unit.unit);
      const normalizedName = normalizeConditionName(originalName, value);

      params.set(normalizedName, { originalName, normalizedName });
      when[normalizedName] = value;
    }

    rows.push({ rate, when });
  }

  return {
    params: [...params.values()],
    rows,
  };
}

function normalizeDefaultConditionValue(
  value: unknown,
  unit: string,
): PricingConditionValue | undefined {
  if (typeof value === "string") return parseConditionToken(value, unit);
  if (typeof value === "number" || typeof value === "boolean") return value;
  return undefined;
}

function serializeConditionValue(value: PricingConditionValue): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(value);
}

function serializeWhen(when: Record<string, PricingConditionValue>): string {
  const sorted = Object.entries(when).sort(([a], [b]) => a.localeCompare(b));
  return sorted
    .map(([key, value]) => `${key}:${serializeConditionValue(value)}`)
    .join("|");
}

function conditionValueEquals(
  left: PricingConditionValue | undefined,
  right: PricingConditionValue | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return serializeConditionValue(left) === serializeConditionValue(right);
}

function compareRanges(left: PricingRange, right: PricingRange): number {
  if (left[0] !== right[0]) return left[0] - right[0];

  const leftMax = left[1] === "infinity" ? Number.POSITIVE_INFINITY : left[1];
  const rightMax = right[1] === "infinity" ? Number.POSITIVE_INFINITY : right[1];
  return leftMax - rightMax;
}

function countPreferenceMismatches(
  row: LegacyRateRow,
  preferences: Map<string, PricingConditionValue>,
): number {
  let mismatches = 0;

  for (const [key, preferredValue] of preferences) {
    if (!conditionValueEquals(row.when[key], preferredValue)) mismatches += 1;
  }

  return mismatches;
}

function selectBaseRow(
  unitRows: LegacyUnitRows,
  rawModel: Record<string, any> | undefined,
  unit: string,
): LegacyRateRow {
  if (unitRows.rows.length === 1) return unitRows.rows[0];

  const preferences = new Map<string, PricingConditionValue>();

  for (const param of unitRows.params) {
    const values: PricingConditionValue[] = [];
    for (const row of unitRows.rows) {
      const value = row.when[param.normalizedName];
      if (value === undefined) continue;
      if (
        !values.some((existingValue) => conditionValueEquals(existingValue, value))
      ) {
        values.push(value);
      }
    }

    let preferredValue: PricingConditionValue | undefined;

    if (
      param.normalizedName === "generateAudio" &&
      values.some((value) => value === false)
    ) {
      preferredValue = false;
    } else {
      const defaultValue = normalizeDefaultConditionValue(
        rawModel?.parameters?.[param.originalName]?.default,
        unit,
      );

      if (
        defaultValue !== undefined &&
        values.some((value) => conditionValueEquals(value, defaultValue))
      ) {
        preferredValue = defaultValue;
      } else if (
        param.normalizedName.endsWith("Range") &&
        values.some((value) => Array.isArray(value))
      ) {
        preferredValue = values
          .filter((value): value is PricingRange => Array.isArray(value))
          .sort(compareRanges)[0];
      } else if (
        values.every((value) => typeof value === "boolean") &&
        values.some((value) => value === false)
      ) {
        preferredValue = false;
      }
    }

    if (preferredValue !== undefined) {
      preferences.set(param.normalizedName, preferredValue);
    }
  }

  return [...unitRows.rows].sort((left, right) => {
    const mismatchDelta =
      countPreferenceMismatches(left, preferences) -
      countPreferenceMismatches(right, preferences);
    if (mismatchDelta !== 0) return mismatchDelta;

    if (left.rate !== right.rate) return left.rate - right.rate;

    return serializeWhen(left.when).localeCompare(serializeWhen(right.when));
  })[0];
}

function shouldUseAbsoluteAdjustment(
  params: LegacyPricingParam[],
  baseRate: number,
): boolean {
  if (baseRate === 0) return true;
  return params.some(
    (param) => !MULTIPLIER_FRIENDLY_CONDITIONS.has(param.normalizedName),
  );
}

function cloneWhen(
  when: Record<string, PricingConditionValue>,
): Record<string, PricingConditionValue> {
  return Object.fromEntries(
    Object.entries(when).sort(([a], [b]) => a.localeCompare(b)),
  ) as Record<string, PricingConditionValue>;
}

function convertLegacyPricing(
  pricing: LegacyModelPricing | undefined,
  rawModel: Record<string, any> | undefined,
  modelId: string,
): ModelPricing | undefined {
  const units = pricing?.units?.filter(Boolean) ?? [];
  if (units.length === 0) return undefined;

  const pricingUnit = resolveSinglePricingUnit(units, modelId);
  const basePricing: Record<string, number> = {};
  const adjustments = new Map<string, PricingAdjustment>();

  for (const legacyUnit of units) {
    const unitRows = legacyPricingUnitToRows(legacyUnit, modelId);
    if (unitRows.rows.length === 0) continue;

    const baseRow = selectBaseRow(unitRows, rawModel, pricingUnit);
    const baseRate = roundNumber(baseRow.rate);
    basePricing[legacyUnit.name] = baseRate;

    const absoluteMode = shouldUseAbsoluteAdjustment(unitRows.params, baseRate);

    for (const row of unitRows.rows) {
      const rate = roundNumber(row.rate);
      const sameBaseCondition = serializeWhen(row.when) === serializeWhen(baseRow.when);
      if (sameBaseCondition) continue;

      const mode = absoluteMode || baseRate === 0 ? "absolute" : "multiplier";
      const value = mode === "absolute" ? rate : roundNumber(rate / baseRate);
      if (value === 1 || rate === baseRate) continue;

      const adjustmentKey = `${mode}:${serializeWhen(row.when)}`;
      const adjustment =
        adjustments.get(adjustmentKey) ??
        {
          mode,
          values: {},
          when: cloneWhen(row.when),
        };

      adjustment.values[legacyUnit.name] = value;
      adjustments.set(adjustmentKey, adjustment);
    }
  }

  const adjustmentList = [...adjustments.values()].sort((left, right) => {
    const modeDelta = left.mode.localeCompare(right.mode);
    if (modeDelta !== 0) return modeDelta;
    return serializeWhen(left.when).localeCompare(serializeWhen(right.when));
  });

  return {
    adjustments: adjustmentList.length > 0 ? adjustmentList : undefined,
    basePricing,
    currency: pricing?.currency ?? "USD",
    unit: pricingUnit,
  };
}

function flatCostToLegacyUnits(cost: Record<string, any>): LegacyPricingUnit[] {
  const co2 = cost.context_over_200k;
  const unit = "millionTokens";

  const pairs: [string, string][] = [
    ["textInput", "input"],
    ["textOutput", "output"],
    ["textInput_cacheRead", "cache_read"],
    ["textInput_cacheWrite", "cache_write"],
  ];

  const units: LegacyPricingUnit[] = [];
  for (const [name, flat] of pairs) {
    const base = cost[flat];
    if (base == null) continue;

    const over200k = co2?.[flat];
    if (over200k != null && over200k !== base) {
      units.push({
        name,
        strategy: "tiered",
        tiers: [
          { rate: base, upTo: 0.2 },
          { rate: over200k, upTo: "infinity" },
        ],
        unit,
      });
    } else {
      units.push({ name, rate: base, strategy: "fixed", unit });
    }
  }

  return units;
}

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

function normalizeModelsDevModel(
  providerId: string,
  m: Record<string, any>,
): Model {
  const cost = m.cost;
  const model: Model = {
    id: m.id,
    name: m.name || m.id,
    family: m.family,
    releasedAt: m.release_date,
    knowledge: m.knowledge,
    openWeights: m.open_weights,
    deprecated: m.status === "deprecated" || undefined,
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
    pricing: cost
      ? convertLegacyPricing(
          { currency: "USD", units: flatCostToLegacyUnits(cost) },
          m,
          `${providerId}/${m.id}`,
        )
      : undefined,
  };

  if (providerId === "opencode") {
    Object.assign(model, resolveOpencodeRuntime(m));
  }

  return model;
}

function normalizeLobehubModel(m: Record<string, any>): Model {
  return {
    id: m.id,
    name: m.displayName || m.id,
    description: m.description,
    type: m.type,
    releasedAt: m.releasedAt,
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
    pricing: convertLegacyPricing(m.pricing, m, m.id),
  };
}

function mergePricing(
  lh?: ModelPricing,
  md?: ModelPricing,
): ModelPricing | undefined {
  if (!lh && !md) return undefined;
  if (lh?.basePricing && Object.keys(lh.basePricing).length > 0) return lh;
  return md;
}

function mergeModels(lh: Model | undefined, md: Model | undefined): Model {
  if (!lh) return md!;
  if (!md) return lh;
  return {
    id: lh.id,
    name: lh.name || md.name,
    api: md.api ?? lh.api,
    baseUrl: md.baseUrl ?? lh.baseUrl,
    headers: mergeHeaders(lh.headers, md.headers),
    description: lh.description ?? md.description,
    type: lh.type ?? md.type,
    family: md.family,
    releasedAt: lh.releasedAt ?? md.releasedAt,
    knowledge: md.knowledge,
    openWeights: md.openWeights,
    deprecated: lh.deprecated ?? md.deprecated,
    abilities: {
      toolCall: lh.abilities.toolCall ?? md.abilities.toolCall,
      reasoning: lh.abilities.reasoning ?? md.abilities.reasoning,
      vision: lh.abilities.vision ?? md.abilities.vision,
      structuredOutput:
        lh.abilities.structuredOutput ?? md.abilities.structuredOutput,
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
    compat: mergeCompat(lh.compat, md.compat),
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

function validatePricing(modelId: string, pricing: ModelPricing): void {
  if (!pricing.unit) {
    throw new Error(`Missing pricing.unit for ${modelId}`);
  }

  if (Object.keys(pricing.basePricing).length === 0) {
    throw new Error(`Missing pricing.basePricing entries for ${modelId}`);
  }

  for (const adjustment of pricing.adjustments ?? []) {
    if (Object.keys(adjustment.values).length === 0) {
      throw new Error(`Empty pricing adjustment for ${modelId}`);
    }

    for (const target of Object.keys(adjustment.values)) {
      if (!(target in pricing.basePricing)) {
        throw new Error(
          `Pricing adjustment target "${target}" is missing from basePricing for ${modelId}`,
        );
      }
    }

    for (const value of Object.values(adjustment.when)) {
      if (Array.isArray(value)) {
        if (value.length !== 2) {
          throw new Error(`Invalid pricing range for ${modelId}`);
        }

        if (typeof value[0] !== "number") {
          throw new Error(`Invalid pricing range lower bound for ${modelId}`);
        }

        if (typeof value[1] !== "number" && value[1] !== "infinity") {
          throw new Error(`Invalid pricing range upper bound for ${modelId}`);
        }
      }
    }
  }
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

  return compactObject(compat) ? { bedrock: compat } : undefined;
}

function createGoogleReasoningCompat(modelId: string): ModelCompat | undefined {
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

  return compactObject(google) ? { google } : undefined;
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

function finalizeModel(
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
  );

  return finalized;
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
  const resolvedApi = defaults?.api ?? lhApi ?? inferApi(mdBaseUrl);
  const resolvedBaseUrl = defaults?.baseUrl ?? mdBaseUrl ?? lhBaseUrl;
  const rawMeta = mergeRecords(
    isRecord(lhProv?.settings) ? lhProv.settings : undefined,
    compactObject({
      ...(mdProv.env ? { env: mdProv.env } : {}),
      ...(mdProv.npm ? { npm: mdProv.npm } : {}),
      ...(lhProv?.modelsUrl ? { modelsUrl: lhProv.modelsUrl } : {}),
    }),
  );

  mergedProviders[canonical] = {
    id: canonical,
    name: lhProv?.name ?? mdProv.name ?? canonical,
    api: resolvedApi,
    baseUrl: resolvedBaseUrl,
    headers: mergeHeaders(defaults?.headers),
    description: lhProv?.description,
    url: lhProv?.url,
    doc: mdProv.doc,
    enabled: lhProv?.enabled,
    checkModel: lhProv?.checkModel,
    apiKeyUrl: lhProv?.apiKeyUrl,
    _: rawMeta,
    compat: mergeCompat(
      defaults?.compat,
      createProviderCompat({
        providerId: canonical,
        api: resolvedApi,
        baseUrl: resolvedBaseUrl,
      }),
    ),
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
  const resolvedApi = lhDefaults?.api ?? lhApiVal;
  const resolvedBaseUrl = lhDefaults?.baseUrl ?? lhProv.proxyUrl?.placeholder;
  const rawMeta = mergeRecords(
    isRecord(lhProv.settings) ? lhProv.settings : undefined,
    compactObject({
      ...(lhProv.modelsUrl ? { modelsUrl: lhProv.modelsUrl } : {}),
    }),
  );

  mergedProviders[canonical] = {
    id: canonical,
    name: lhProv.name ?? canonical,
    api: resolvedApi,
    baseUrl: resolvedBaseUrl,
    headers: mergeHeaders(lhDefaults?.headers),
    description: lhProv.description,
    url: lhProv.url,
    enabled: lhProv.enabled,
    checkModel: lhProv.checkModel,
    apiKeyUrl: lhProv.apiKeyUrl,
    _: rawMeta,
    compat: mergeCompat(
      lhDefaults?.compat,
      createProviderCompat({
        providerId: canonical,
        api: resolvedApi,
        baseUrl: resolvedBaseUrl,
      }),
    ),
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
  if (Object.keys(modelsDevRaw[mdId]?.models ?? {}).length > 0) {
    allProviderIds.add(mdId);
  }
}
for (const lhId of Object.keys(lobehubRaw.models ?? {})) {
  allProviderIds.add(canonicalProviderId(lhId, "lobehub"));
}

for (const canonical of allProviderIds) {
  const provider = mergedProviders[canonical];

  // models.dev models for this provider
  const mdModelsRaw: Record<string, any> = modelsDevRaw[canonical]?.models ?? {};
  const mdMap = new Map<string, Model>();
  for (const [id, raw] of Object.entries(mdModelsRaw)) {
    mdMap.set(id, normalizeModelsDevModel(canonical, { id, ...raw }));
  }

  // lobehub models for this provider
  const lhId = lobehubIdFor(canonical) ?? canonical;
  const lhModelsRaw: any[] = lobehubRaw.models?.[lhId] ?? [];
  const lhMap = new Map<string, Model>();
  for (const raw of lhModelsRaw) {
    if (raw.id) {
      lhMap.set(raw.id, normalizeLobehubModel(raw));
    }
  }

  // Union of model IDs
  const allModelIds = new Set([...mdMap.keys(), ...lhMap.keys()]);
  if (allModelIds.size === 0) continue;

  const list: Model[] = [];
  for (const modelId of allModelIds) {
    list.push(
      finalizeModel(
        canonical,
        provider,
        mergeModels(lhMap.get(modelId), mdMap.get(modelId)),
      ),
    );
  }

  mergedModels[canonical] = list;
  totalModels += list.length;
}

console.log(
  `  ${totalModels} models across ${Object.keys(mergedModels).length} providers`,
);

// ---------------------------------------------------------------------------
// Apply overrides
// ---------------------------------------------------------------------------

let overridesApplied = 0;

if (overrides.providers) {
  for (const [pid, patch] of Object.entries(overrides.providers)) {
    if (mergedProviders[pid]) {
      deepAssign(mergedProviders[pid], patch as Record<string, any>);
      overridesApplied++;
    }
  }
}

if (overrides.models) {
  for (const [key, patch] of Object.entries(overrides.models)) {
    const [pid, mid] = key.split("/", 2);
    const list = mergedModels[pid];
    if (!list) continue;
    const model = list.find((entry) => entry.id === mid);
    if (model) {
      deepAssign(model, patch as Record<string, any>);
      overridesApplied++;
    }
  }
}

if (overridesApplied > 0) {
  console.log(`\nApplied ${overridesApplied} overrides`);
}

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

console.log("\nPricing migration stats...");
console.log(`  base only: ${pricingBaseOnlyCount}`);
console.log(`  with multiplier adjustments: ${pricingMultiplierCount}`);
console.log(`  with absolute adjustments: ${pricingAbsoluteCount}`);

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const output: ModelsDatabase = {
  _meta: {
    generatedAt: new Date().toISOString(),
    sources: {
      modelsDev: {
        providerCount: mdProviderIds.length,
        modelCount: mdModelCount,
      },
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
