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

export type PricingRange = [number, number | "infinity"];

export type PricingConditionValue = string | number | boolean | PricingRange;
export type PricingConditionMap = Record<string, PricingConditionValue>;
export type PricingUnless = PricingConditionMap | PricingConditionMap[];

export interface PricingAdjustment {
  mode: "multiplier" | "absolute";
  when: PricingConditionMap;
  unless?: PricingUnless;
  values: Record<string, number>;
}

export interface ModelPricing {
  currency: string;
  unit: string;
  basePricing: Record<string, number>;
  adjustments?: PricingAdjustment[];
}

export type CompatReasoningLevel = "minimal" | "low" | "medium" | "high";

export interface OpenRouterRouting {
  only?: string[];
  order?: string[];
}

export interface VercelGatewayRouting {
  only?: string[];
  order?: string[];
}

export interface OpenAICompletionsCompat {
  supportsStore?: boolean;
  supportsDeveloperRole?: boolean;
  supportsReasoningEffort?: boolean;
  supportsUsageInStreaming?: boolean;
  maxTokensField?: "max_completion_tokens" | "max_tokens";
  requiresToolResultName?: boolean;
  requiresAssistantAfterToolResult?: boolean;
  requiresThinkingAsText?: boolean;
  requiresMistralToolIds?: boolean;
  thinkingFormat?: "openai" | "zai" | "qwen";
  openRouterRouting?: OpenRouterRouting;
  vercelGatewayRouting?: VercelGatewayRouting;
  supportsStrictMode?: boolean;
  assistantContentFormat?: "string" | "parts";
  toolCallIdStrategy?: "preserve" | "openai-40" | "pipe-call-40" | "mistral-9";
}

export interface OpenAIResponsesCompat {
  toolCallIdStrategy?: "preserve" | "responses-fc64";
  longPromptCacheTtl?: "24h";
  supportsFastMode?: boolean;
}

export interface AnthropicCompat {
  longPromptCacheTtl?: "1h";
  supportsFastMode?: boolean;
  supportsAdaptiveThinking?: boolean;
  xHighReasoningEffort?: "high" | "max";
}

export interface BedrockCompat {
  supportsAdaptiveThinking?: boolean;
  supportsPromptCaching?: boolean;
  supportsThinkingSignature?: boolean;
  xHighReasoningEffort?: "high" | "max";
}

export interface GoogleCompat {
  requiresToolCallId?: boolean;
  supportsMultimodalFunctionResponse?: boolean;
  reasoningMode?: "level" | "budget";
  reasoningLevelMap?: Partial<
    Record<CompatReasoningLevel, "MINIMAL" | "LOW" | "MEDIUM" | "HIGH">
  >;
  defaultThinkingBudgets?: Partial<Record<CompatReasoningLevel, number>>;
}

export interface GoogleGeminiCliCompat {
  toolSchemaFormat?: "parameters" | "input_schema";
  reasoningMode?: "level" | "budget";
  reasoningLevelMap?: Partial<
    Record<CompatReasoningLevel, "MINIMAL" | "LOW" | "MEDIUM" | "HIGH">
  >;
  defaultThinkingBudgets?: Partial<Record<CompatReasoningLevel, number>>;
}

export interface ModelCompat {
  openaiCompletions?: OpenAICompletionsCompat;
  openaiResponses?: OpenAIResponsesCompat;
  anthropic?: AnthropicCompat;
  bedrock?: BedrockCompat;
  google?: GoogleCompat;
  googleGeminiCli?: GoogleGeminiCliCompat;
}

export interface Model {
  id: string;
  name: string;
  api?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  description?: string;
  type?: string;
  family?: string;
  releasedAt?: string;
  knowledge?: string;
  openWeights?: boolean;
  deprecated?: boolean;
  _?: Record<string, unknown>;

  abilities: ModelAbilities;

  contextWindow?: number;
  maxOutput?: number;

  modalities?: {
    input?: string[];
    output?: string[];
  };

  pricing?: ModelPricing;
  compat?: ModelCompat;
}

export interface Provider {
  id: string;
  name: string;
  official: boolean;
  featured: boolean;
  api?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  description?: string;
  url?: string;
  doc?: string;
  enabled?: boolean;
  checkModel?: string;
  apiKeyUrl?: string;
  _?: Record<string, unknown>;
  compat?: ModelCompat;
}

export interface SourceMeta {
  providerCount: number;
  modelCount: number;
}

export interface ModelsDatabaseSourceMeta extends SourceMeta {
  commitHash?: string;
}

export interface ModelsDatabase {
  _meta: {
    generatedAt: string;
    sources: Record<string, ModelsDatabaseSourceMeta>;
    merged: SourceMeta;
    overridesApplied: number;
  };
  providers: Record<string, Provider>;
  models: Record<string, Model[]>;
}
