import type {
  Model,
  ModelPricing,
  OpenAIReasoningEffort,
  OpenAIServiceTier,
  Provider,
} from "../types.ts";
import { clone, deepAssign } from "./utils.ts";

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

function mergeModelOverrides(
  ...patches: Array<DeepPartial<Model> | undefined>
): DeepPartial<Model> {
  const result: DeepPartial<Model> = {};

  for (const patch of patches) {
    if (!patch) continue;
    const existingPricingAdjustments = result.pricing?.adjustments;
    const incomingPricingAdjustments = patch.pricing?.adjustments;
    deepAssign(
      result as Record<string, unknown>,
      clone(patch) as Record<string, unknown>,
    );
    if (existingPricingAdjustments && incomingPricingAdjustments) {
      result.pricing = {
        ...result.pricing,
        adjustments: [...existingPricingAdjustments, ...incomingPricingAdjustments],
      };
    }
  }

  return result;
}

function createModelOverrideRecord(
  entries: Array<[string, DeepPartial<Model>]>,
): Record<string, DeepPartial<Model>> {
  const result: Record<string, DeepPartial<Model>> = {};

  for (const [key, patch] of entries) {
    result[key] = mergeModelOverrides(result[key], patch);
  }

  return result;
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

function createOpenAIServiceTierAdjustments(
  targets: string[],
  serviceTiers: OpenAIServiceTier[],
): NonNullable<ModelPricing["adjustments"]> {
  const adjustments: NonNullable<ModelPricing["adjustments"]> = [];

  for (const serviceTier of serviceTiers) {
    adjustments.push({
      mode: "multiplier",
      values: Object.fromEntries(
        targets.map((target) => [target, serviceTier === "priority" ? 2 : 0.5]),
      ),
      when: {
        serviceTier,
      },
    });
  }
  return adjustments;
}

function createOpenAIServiceTierOverride(
  targets: string[],
  serviceTiers: OpenAIServiceTier[],
): DeepPartial<Model> {
  return {
    _: {
      supportsAdditionalServiceTiers: serviceTiers,
    },
    compat: {
      openaiResponses: {
        supportsAdditionalServiceTiers: serviceTiers,
      },
    },
    pricing: {
      adjustments: createOpenAIServiceTierAdjustments(targets, serviceTiers),
    },
  };
}

function createOpenAILongContextOverride(targets: string[]): DeepPartial<Model> {
  return {
    pricing: {
      adjustments: [
        {
          mode: "multiplier",
          values: Object.fromEntries(
            targets.map((target) => [target, target === "textOutput" ? 1.5 : 2]),
          ),
          when: {
            textTotalInput: [0.272, "infinity"],
          },
        },
      ],
    },
  };
}

function openAIReasoningEffortOverride(
  enumValues: OpenAIReasoningEffort[],
  defaultValue: OpenAIReasoningEffort,
): DeepPartial<Model> {
  return {
    _: {
      reasoningEffort: {
        enum: enumValues,
        default: defaultValue,
      },
    },
  };
}

function mapModelIdsToOverride(
  modelIds: string[],
  override: DeepPartial<Model>,
): Array<[string, DeepPartial<Model>]> {
  return modelIds.map((modelId) => [modelId, override]);
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

const openAIReasoningEffortModels: Array<[string, DeepPartial<Model>]> = [
  ...mapModelIdsToOverride(
    [
      "openai/o1",
      "openai/o1-mini",
      "openai/o1-preview",
      "openai/o1-pro",
      "openai/o3",
      "openai/o3-mini",
      "openai/o3-pro",
      "openai/o3-deep-research",
      "openai/o4-mini",
      "openai/o4-mini-deep-research",
      "openai/codex-mini-latest",
      "openai/computer-use-preview",
    ],
    openAIReasoningEffortOverride(["low", "medium", "high"], "medium"),
  ),
  ...mapModelIdsToOverride(
    [
      "openai/gpt-5",
      "openai/gpt-5-chat-latest",
      "openai/gpt-5-codex",
      "openai/gpt-5-mini",
      "openai/gpt-5-nano",
    ],
    openAIReasoningEffortOverride(
      ["minimal", "low", "medium", "high"],
      "medium",
    ),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-5-pro"],
    openAIReasoningEffortOverride(["high"], "high"),
  ),
  ...mapModelIdsToOverride(
    [
      "openai/gpt-5.1",
      "openai/gpt-5.1-chat-latest",
      "openai/gpt-5.1-codex",
      "openai/gpt-5.1-codex-mini",
      "openai-codex/gpt-5.1",
      "openai-codex/gpt-5.1-codex-mini",
    ],
    openAIReasoningEffortOverride(
      ["none", "low", "medium", "high"],
      "none",
    ),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-5.1-codex-max", "openai-codex/gpt-5.1-codex-max"],
    openAIReasoningEffortOverride(
      ["none", "medium", "high", "xhigh"],
      "medium",
    ),
  ),
  ...mapModelIdsToOverride(
    [
      "openai/gpt-5.2",
      "openai/gpt-5.2-chat-latest",
      "openai/gpt-5.4",
      "openai-codex/gpt-5.2",
      "openai-codex/gpt-5.4",
    ],
    openAIReasoningEffortOverride(
      ["none", "low", "medium", "high", "xhigh"],
      "none",
    ),
  ),
  ...mapModelIdsToOverride(
    [
      "openai/gpt-5.2-codex",
      "openai/gpt-5.3-codex",
      "openai/gpt-5.3-codex-spark",
      "openai-codex/gpt-5.2-codex",
      "openai-codex/gpt-5.3-codex",
      "openai-codex/gpt-5.3-codex-spark",
    ],
    openAIReasoningEffortOverride(
      ["low", "medium", "high", "xhigh"],
      "medium",
    ),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-5.2-pro", "openai/gpt-5.4-pro"],
    openAIReasoningEffortOverride(
      ["medium", "high", "xhigh"],
      "medium",
    ),
  ),
];

const openAILongContextModels: Array<[string, DeepPartial<Model>]> = [
  ...mapModelIdsToOverride(
    ["openai/gpt-5.4"],
    createOpenAILongContextOverride(["textInput", "textOutput", "textInput_cacheRead"]),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-5.4-pro"],
    createOpenAILongContextOverride(["textInput", "textOutput"]),
  ),
];

const openAIServiceTierModels: Array<[string, DeepPartial<Model>]> = [
  ...mapModelIdsToOverride(
    ["openai/gpt-5.4"],
    createOpenAIServiceTierOverride(["textInput", "textOutput", "textInput_cacheRead"], [
      "flex",
      "priority",
    ]),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-5.4-pro"],
    createOpenAIServiceTierOverride(["textInput", "textOutput"], [
      "flex",
      "priority",
    ]),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-5.2"],
    createOpenAIServiceTierOverride(["textInput", "textOutput", "textInput_cacheRead"], [
      "flex",
      "priority",
    ]),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-5.1", "openai/gpt-5"],
    createOpenAIServiceTierOverride(["textInput", "textOutput", "textInput_cacheRead"], [
      "flex",
      "priority",
    ]),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-5-mini"],
    createOpenAIServiceTierOverride(["textInput", "textOutput", "textInput_cacheRead"], [
      "flex",
      "priority",
    ]),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-5.3-codex", "openai/gpt-5.2-codex"],
    createOpenAIServiceTierOverride(
      ["textInput", "textOutput", "textInput_cacheRead"],
      ["priority"],
    ),
  ),
  ...mapModelIdsToOverride(
    [
      "openai/gpt-5.1-codex-max",
      "openai/gpt-5.1-codex",
      "openai/gpt-5-codex",
    ],
    createOpenAIServiceTierOverride(
      ["textInput", "textOutput", "textInput_cacheRead"],
      ["priority"],
    ),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-4.1"],
    createOpenAIServiceTierOverride(
      ["textInput", "textOutput", "textInput_cacheRead"],
      ["priority"],
    ),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-4.1-mini"],
    createOpenAIServiceTierOverride(
      ["textInput", "textOutput", "textInput_cacheRead"],
      ["priority"],
    ),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-4.1-nano"],
    createOpenAIServiceTierOverride(
      ["textInput", "textOutput", "textInput_cacheRead"],
      ["priority"],
    ),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-4o"],
    createOpenAIServiceTierOverride(
      ["textInput", "textOutput", "textInput_cacheRead"],
      ["priority"],
    ),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-4o-2024-05-13"],
    createOpenAIServiceTierOverride(
      ["textInput", "textOutput"],
      ["priority"],
    ),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-4o-mini"],
    createOpenAIServiceTierOverride(
      ["textInput", "textOutput", "textInput_cacheRead"],
      ["priority"],
    ),
  ),
  ...mapModelIdsToOverride(
    ["openai/o3"],
    createOpenAIServiceTierOverride(
      ["textInput", "textOutput", "textInput_cacheRead"],
      ["flex", "priority"],
    ),
  ),
  ...mapModelIdsToOverride(
    ["openai/o4-mini"],
    createOpenAIServiceTierOverride(
      ["textInput", "textOutput", "textInput_cacheRead"],
      ["flex", "priority"],
    ),
  ),
  ...mapModelIdsToOverride(
    ["openai/gpt-5-nano"],
    createOpenAIServiceTierOverride(
      ["textInput", "textOutput", "textInput_cacheRead"],
      ["flex"],
    ),
  ),
];

export const overrides: Overrides = {
  providers: createProviderFlagOverrides(),
  models: createModelOverrideRecord([
    ...openAIReasoningEffortModels,
    ...openAILongContextModels,
    ...openAIServiceTierModels,
    ...anthropicPromptCachingModels,
    ...anthropicLongContextModels,
  ]),
};
