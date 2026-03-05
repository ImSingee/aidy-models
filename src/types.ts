export interface ModelAbilities {
  toolCall?: boolean;
  reasoning?: boolean;
  vision?: boolean;
  structuredOutput?: boolean;
  search?: boolean;
  imageOutput?: boolean;
  video?: boolean;
  attachment?: boolean;
  temperature?: boolean;
  interleaved?: boolean;
}

export interface PricingTier {
  rate: number;
  upTo: number | "infinity";
}

export interface PricingUnit {
  name: string;
  rate?: number;
  strategy: "fixed" | "tiered" | "lookup";
  unit: string;
  tiers?: PricingTier[];
  lookup?: {
    prices: Record<string, number>;
    pricingParams: string[];
  };
}

export interface ModelPricing {
  currency: string;
  units?: PricingUnit[];
}

export interface Model {
  id: string;
  name: string;
  description?: string;
  type?: string;
  family?: string;
  releasedAt?: string;
  knowledge?: string;
  openWeights?: boolean;
  status?: string;
  enabled?: boolean;

  abilities: ModelAbilities;

  contextWindow?: number;
  maxOutput?: number;

  modalities?: {
    input?: string[];
    output?: string[];
  };

  pricing?: ModelPricing;
}

export interface Provider {
  id: string;
  name: string;
  api?: string;
  baseUrl?: string;
  description?: string;
  url?: string;
  env?: string[];
  npm?: string;
  doc?: string;
  enabled?: boolean;
  checkModel?: string;
  modelsUrl?: string;
  apiKeyUrl?: string;
  settings?: Record<string, unknown>;
}

export interface SourceMeta {
  providerCount: number;
  modelCount: number;
}

export interface ModelsDatabase {
  _meta: {
    generatedAt: string;
    sources: {
      modelsDev: SourceMeta;
      lobehub: SourceMeta & { commitHash: string };
    };
    merged: SourceMeta;
    overridesApplied: number;
  };
  providers: Record<string, Provider>;
  models: Record<string, Model[]>;
}
