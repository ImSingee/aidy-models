import type { Model, ModelPricing, Provider } from "../types.ts";

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
      ? DeepPartial<T[P]>
    : T[P];
};

const officialFeaturedProviderIds = [
  "anthropic",
  "deepseek",
  "google",
  "jina",
  "llama",
  "minimax",
  "mistral",
  "moonshotai",
  "openai",
  "xai",
  "zai",
] as const;

const officialOnlyProviderIds = [
  "ai21",
  "alibaba",
  "alibaba-cn",
  "baichuan",
  "bfl",
  "cohere",
  "hunyuan",
  "internlm",
  "minimax-cn",
  "moonshotai-cn",
  "nova",
  "perplexity",
  "sensenova",
  "spark",
  "stepfun",
  "taichu",
  "upstage",
  "wenxin",
  "xiaomi",
  "zeroone",
  "zhipuai",
] as const;

const unofficialFeaturedProviderIds = [
  "amazon-bedrock",
  "azure",
  "azure-cognitive-services",
  "azureai",
  "cloudflare-workers-ai",
  "github-models",
  "google-vertex",
  "cloudflare-ai-gateway",
  "helicone",
  "openrouter",
  "vercel-ai-gateway",
  "volcengine",
] as const;

function createProviderFlagOverrides(): Record<string, DeepPartial<Provider>> {
  return Object.fromEntries([
    ...officialFeaturedProviderIds.map((providerId) => [
      providerId,
      { official: true, featured: true },
    ]),
    ...officialOnlyProviderIds.map((providerId) => [
      providerId,
      { official: true, featured: false },
    ]),
    ...unofficialFeaturedProviderIds.map((providerId) => [
      providerId,
      { official: false, featured: true },
    ]),
  ]);
}

export interface Overrides {
  providers?: Record<string, DeepPartial<Provider>>;
  /** Key format: "providerId/modelId" */
  models?: Record<string, DeepPartial<Model>>;
}

function anthropicPromptCachingPricing(
  baseInput: number,
  baseOutput: number,
  options?: {
    cacheRead?: number;
    cacheWrite5m?: number;
    cacheWrite1h?: number;
  },
): ModelPricing {
  const roundPrice = (value: number) => Number(value.toFixed(6));
  const baseCacheRead = roundPrice(options?.cacheRead ?? baseInput * 0.1);
  const baseCacheWrite = roundPrice(options?.cacheWrite5m ?? baseInput * 1.25);
  const oneHourCacheWrite = roundPrice(options?.cacheWrite1h ?? baseInput * 2);

  return {
    currency: "USD",
    unit: "millionTokens",
    basePricing: {
      textInput: baseInput,
      textInput_cacheRead: baseCacheRead,
      textInput_cacheWrite: baseCacheWrite,
      textOutput: baseOutput,
    },
    adjustments: [
      {
        mode: "multiplier",
        values: {
          textInput_cacheWrite: roundPrice(oneHourCacheWrite / baseCacheWrite),
        },
        when: {
          cacheTtl: "1h",
        },
      },
    ],
  };
}

function anthropicLongContextPricing(
  baseInput: number,
  baseOutput: number,
  options?: {
    supportsFastMode?: boolean;
  },
): ModelPricing {
  const promptCachingPricing = anthropicPromptCachingPricing(baseInput, baseOutput);
  const longContextAdjustment: NonNullable<ModelPricing["adjustments"]>[number] = {
    mode: "multiplier",
    values: {
      textInput: 2,
      textInput_cacheRead: 2,
      textInput_cacheWrite: 2,
      textOutput: 1.5,
    },
    when: {
      textTotalInput: [0.2, "infinity"],
    },
    ...(options?.supportsFastMode
      ? {
          unless: {
            fastMode: true,
          },
        }
      : {}),
  };
  const fastModeAdjustment =
    options?.supportsFastMode
      ? {
          mode: "multiplier" as const,
          values: {
            textInput: 12,
            textInput_cacheRead: 12,
            textInput_cacheWrite: 12,
            textOutput: 12,
          },
          when: {
            fastMode: true,
          },
        }
      : undefined;

  return {
    ...promptCachingPricing,
    adjustments: [
      longContextAdjustment,
      ...(fastModeAdjustment ? [fastModeAdjustment] : []),
      ...(promptCachingPricing.adjustments ?? []),
    ],
  };
}

function anthropicPromptCachingOverride(
  baseInput: number,
  baseOutput: number,
  options?: Parameters<typeof anthropicPromptCachingPricing>[2],
): DeepPartial<Model> {
  return {
    pricing: anthropicPromptCachingPricing(baseInput, baseOutput, options),
  };
}

function anthropicLongContextOverride(
  baseInput: number,
  baseOutput: number,
  options?: Parameters<typeof anthropicLongContextPricing>[2],
): DeepPartial<Model> {
  return {
    contextWindow: 1000000,
    pricing: anthropicLongContextPricing(baseInput, baseOutput, options),
    ...(options?.supportsFastMode
      ? {
          _: {
            supportsFastMode: true,
          },
          compat: {
            anthropic: {
              supportsFastMode: true,
            },
          },
        }
      : {}),
  };
}

function openAIGpt54FastModeOverride(): DeepPartial<Model> {
  return {
    _: {
      supportsFastMode: true,
    },
    compat: {
      openaiResponses: {
        supportsFastMode: true,
      },
    },
    pricing: {
      currency: "USD",
      unit: "millionTokens",
      basePricing: {
        textInput: 2.5,
        textOutput: 15,
        textInput_cacheRead: 0.25,
      },
      adjustments: [
        {
          mode: "multiplier",
          values: {
            textInput: 2,
            textOutput: 1.5,
            textInput_cacheRead: 2,
          },
          when: {
            textTotalInput: [0.272, "infinity"],
          },
        },
        {
          mode: "multiplier",
          values: {
            textInput: 2,
            textOutput: 2,
            textInput_cacheRead: 2,
          },
          when: {
            fastMode: true,
          },
        },
      ],
    },
  };
}

const anthropicPromptCachingModels: Array<[string, DeepPartial<Model>]> = [
  [
    "anthropic/claude-3-haiku-20240307",
    anthropicPromptCachingOverride(0.25, 1.25, {
      cacheRead: 0.03,
      cacheWrite5m: 0.3,
      cacheWrite1h: 0.5,
    }),
  ],
  ["anthropic/claude-3-opus-20240229", anthropicPromptCachingOverride(15, 75)],
  ["anthropic/claude-3-5-haiku-20241022", anthropicPromptCachingOverride(0.8, 4)],
  ["anthropic/claude-3-5-haiku-latest", anthropicPromptCachingOverride(0.8, 4)],
  ["anthropic/claude-3-5-sonnet-20240620", anthropicPromptCachingOverride(3, 15)],
  ["anthropic/claude-3-5-sonnet-20241022", anthropicPromptCachingOverride(3, 15)],
  ["anthropic/claude-3-7-sonnet-20250219", anthropicPromptCachingOverride(3, 15)],
  ["anthropic/claude-3-7-sonnet-latest", anthropicPromptCachingOverride(3, 15)],
  ["anthropic/claude-haiku-4-5", anthropicPromptCachingOverride(1, 5)],
  ["anthropic/claude-haiku-4-5-20251001", anthropicPromptCachingOverride(1, 5)],
  ["anthropic/claude-opus-4-0", anthropicPromptCachingOverride(15, 75)],
  ["anthropic/claude-opus-4-20250514", anthropicPromptCachingOverride(15, 75)],
  ["anthropic/claude-opus-4-1", anthropicPromptCachingOverride(15, 75)],
  ["anthropic/claude-opus-4-1-20250805", anthropicPromptCachingOverride(15, 75)],
  ["anthropic/claude-opus-4-5", anthropicPromptCachingOverride(5, 25)],
  ["anthropic/claude-opus-4-5-20251101", anthropicPromptCachingOverride(5, 25)],
];

const anthropicLongContextModels: Array<[string, DeepPartial<Model>]> = [
  [
    "anthropic/claude-opus-4-6",
    anthropicLongContextOverride(5, 25, { supportsFastMode: true }),
  ],
  ["anthropic/claude-sonnet-4-0", anthropicLongContextOverride(3, 15)],
  ["anthropic/claude-sonnet-4-20250514", anthropicLongContextOverride(3, 15)],
  ["anthropic/claude-sonnet-4-5", anthropicLongContextOverride(3, 15)],
  ["anthropic/claude-sonnet-4-5-20250929", anthropicLongContextOverride(3, 15)],
  ["anthropic/claude-sonnet-4-6", anthropicLongContextOverride(3, 15)],
];

export const overrides: Overrides = {
  providers: createProviderFlagOverrides(),
  models: {
    "openai/gpt-5.4": openAIGpt54FastModeOverride(),
    ...Object.fromEntries(anthropicPromptCachingModels),
    ...Object.fromEntries(anthropicLongContextModels),
    "opencode/claude-sonnet-4": { contextWindow: 200000 },
    "opencode/claude-sonnet-4-5": { contextWindow: 200000 },
  },
};
