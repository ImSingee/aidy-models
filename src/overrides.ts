import type { Model, ModelPricing, Provider } from "./types.ts";

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

export interface Overrides {
  providers?: Record<string, DeepPartial<Provider>>;
  /** Key format: "providerId/modelId" */
  models?: Record<string, DeepPartial<Model>>;
}

function anthropicLongContextPricing(baseInput: number, baseOutput: number): ModelPricing {
  const roundPrice = (value: number) => Number(value.toFixed(6));
  const baseCacheRead = roundPrice(baseInput * 0.1);
  const baseCacheWrite = roundPrice(baseInput * 1.25);

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
          textInput: 2,
          textInput_cacheRead: 2,
          textInput_cacheWrite: 2,
          textOutput: 1.5,
        },
        when: {
          totalInput: [0.2, "infinity"],
        },
      },
      {
        mode: "multiplier",
        values: {
          textInput_cacheWrite: roundPrice((baseInput * 2) / baseCacheWrite),
        },
        when: {
          cacheTtl: "1h",
        },
      },
    ],
  };
}

export const overrides: Overrides = {
  models: {
    "anthropic/claude-opus-4-6": {
      pricing: anthropicLongContextPricing(5, 25),
    },
    "anthropic/claude-sonnet-4-0": {
      pricing: anthropicLongContextPricing(3, 15),
    },
    "anthropic/claude-sonnet-4-5": {
      pricing: anthropicLongContextPricing(3, 15),
    },
    "anthropic/claude-sonnet-4-5-20250929": {
      pricing: anthropicLongContextPricing(3, 15),
    },
    "anthropic/claude-sonnet-4-20250514": {
      pricing: anthropicLongContextPricing(3, 15),
    },
    "anthropic/claude-sonnet-4-6": {
      pricing: anthropicLongContextPricing(3, 15),
    },
    "opencode/claude-sonnet-4": { contextWindow: 200000 },
    "opencode/claude-sonnet-4-5": { contextWindow: 200000 },
  },
};
