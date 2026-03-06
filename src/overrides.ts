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
  const premiumInput = roundPrice(baseInput * 2);
  const premiumOutput = roundPrice(baseOutput * 1.5);
  // Anthropic bills the premium tier when total input tokens
  // (input + cache creation + cache read) exceed 200K.
  // These buckets should be read as <= 200K and > 200K respectively.
  const standardRange = "[0, 0.2]";
  const premiumRange = "[0.2, infinity]";

  return {
    currency: "USD",
    units: [
      {
        lookup: {
          prices: {
            [premiumRange]: premiumInput,
            [standardRange]: baseInput,
          },
          pricingParams: ["textInputRange"],
        },
        name: "textInput",
        strategy: "lookup" as const,
        unit: "millionTokens",
      },
      {
        lookup: {
          prices: {
            [premiumRange]: premiumOutput,
            [standardRange]: baseOutput,
          },
          pricingParams: ["textInputRange"],
        },
        name: "textOutput",
        strategy: "lookup" as const,
        unit: "millionTokens",
      },
      {
        lookup: {
          prices: {
            [premiumRange]: roundPrice(premiumInput * 0.1),
            [standardRange]: roundPrice(baseInput * 0.1),
          },
          pricingParams: ["textInputRange"],
        },
        name: "textInput_cacheRead",
        strategy: "lookup" as const,
        unit: "millionTokens",
      },
      {
        lookup: {
          prices: {
            [`${premiumRange}_1h`]: roundPrice(premiumInput * 2),
            [`${premiumRange}_5m`]: roundPrice(premiumInput * 1.25),
            [`${standardRange}_1h`]: roundPrice(baseInput * 2),
            [`${standardRange}_5m`]: roundPrice(baseInput * 1.25),
          },
          pricingParams: ["textInputRange", "ttl"],
        },
        name: "textInput_cacheWrite",
        strategy: "lookup" as const,
        unit: "millionTokens",
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
