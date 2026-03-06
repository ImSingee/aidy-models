# aidy-models

`aidy-models` is a model registry for LLM providers and models.

It provides a `models.json` file and keeps
the data shaped for runtime consumers:

- provider defaults
- model-level overrides
- capability metadata
- pricing metadata
- runtime compatibility metadata

## Data Sources

The current generator merges:

- [models.dev](https://github.com/anomalyco/models.dev)
- [lobehub](https://github.com/lobehub/lobehub)

## Generate

```bash
bun run generate
```

This rewrites `models.json`.

## Output Shape

`models.json` has the following top-level structure:

```json
{
  "_meta": {},
  "providers": {},
  "models": {}
}
```

### `_meta`

Generation metadata:

- `generatedAt`: ISO timestamp of the last generation
- `sources.modelsDev`: provider and model counts from `models.dev`
- `sources.lobehub`: provider and model counts from Lobehub, plus `commitHash`
- `merged`: counts after merge and normalization
- `overridesApplied`: number of local overrides applied from `src/overrides.ts`

### `providers`

`providers` is a map keyed by canonical provider id.

Each provider entry contains default runtime metadata for that provider.

### `models`

`models` is a map keyed by canonical provider id.

Each value is an array of models for that provider.

Model entries may override provider defaults for cases where a single provider
serves multiple protocols or base URLs.

## Merge Semantics

Consumers should treat provider-level fields as defaults and model-level fields
as overrides.

Recommended precedence:

1. Start from `provider`
2. Apply `model`
3. For nested `compat`, merge `provider.compat` first and then `model.compat`

This matters for fields such as:

- `api`
- `baseUrl`
- `headers`
- `compat`

Example:

- `github-copilot` has provider-level static headers
- some `github-copilot` models override `api` from `openai-completions` to
  `openai-responses` or `anthropic-messages`
- `opencode` provider defaults to `openai-completions`, while some models
  override to `openai-responses`, `anthropic-messages`, or
  `google-generative-ai`

## Provider Fields

`Provider` describes provider defaults.

### Core runtime fields

- `id`: canonical provider id
- `name`: display name
- `api`: default API protocol for the provider
- `baseUrl`: default base URL for the provider
- `headers`: static default headers to send for this provider
- `compat`: provider-level runtime compatibility defaults

### Metadata fields

- `description`: provider description
- `url`: provider homepage
- `doc`: docs URL
- `enabled`: upstream enablement flag if available
- `checkModel`: model id suitable for health checks or API verification
- `apiKeyUrl`: API key management page

## Model Fields

`Model` describes a concrete model entry.

### Identity and runtime fields

- `id`: model id used by the provider API
- `name`: display name
- `api`: optional model-level API override
- `baseUrl`: optional model-level base URL override
- `headers`: optional model-level static headers
- `compat`: optional model-level compatibility overrides

### Descriptive fields

- `description`: model description
- `type`: upstream type such as `chat`
- `family`: model family
- `releasedAt`: release date string
- `knowledge`: knowledge cutoff string if available
- `openWeights`: whether the model has open weights
- `deprecated`: whether the model is deprecated upstream

### Capability fields

- `abilities.toolCall`: supports tool / function calling
- `abilities.reasoning`: supports reasoning mode
- `abilities.vision`: accepts image input
- `abilities.structuredOutput`: supports structured output
- `abilities.search`: supports native search
- `abilities.imageOutput`: supports image generation
- `abilities.video`: supports video input or output, depending on source
- `abilities.attachment`: supports file or attachment input
- `abilities.temperature`: supports configurable temperature
- `abilities.interleaved`: supports interleaved thinking / tool behavior

### Token and modality fields

- `contextWindow`: max input context
- `maxOutput`: max output tokens
- `modalities.input`: accepted input modalities
- `modalities.output`: supported output modalities

### Pricing fields

- `pricing.currency`: pricing currency, such as `USD` or `CNY`
- `pricing.units`: list of pricing units

## Pricing Schema

Pricing is intentionally more expressive than a flat
`input/output/cacheRead/cacheWrite` object.

The schema is designed to describe billing behavior:

- what is being billed: `name`
- how the price is chosen: `strategy`
- what denominator the price applies to: `unit`

Each `PricingUnit` contains:

- `name`: semantic unit name such as `textInput` or `imageGeneration`
- `strategy`: `fixed`, `tiered`, or `lookup`
- `unit`: billing denominator for `rate` / `tiers[].rate`, such as
  `millionTokens` or `image`

Strategy-specific fields:

- `fixed`: requires `rate`
- `tiered`: requires `tiers`; tiers should be ordered from low to high usage,
  and the final tier should usually end with `upTo: "infinity"`
- `lookup`: requires `lookup.prices` and `lookup.pricingParams`; `prices` keys
  should match the parameter values in the same order as `pricingParams`

Choose `name` based on the behavior being billed, and choose `unit` based on
the provider's billing denominator.

### `name` enum

| `name` | Meaning |
| --- | --- |
| `textInput` | prompt or other input text billing |
| `textOutput` | generated text billing |
| `textInput_cacheRead` | prompt cache read / cache hit billing |
| `textInput_cacheWrite` | prompt cache write billing |
| `audioInput` | audio input billing |
| `audioOutput` | audio output billing |
| `audioInput_cacheRead` | cached audio input read billing |
| `imageInput` | image input billing |
| `imageInput_cacheRead` | cached image input read billing |
| `imageOutput` | image output billing |
| `imageGeneration` | image generation billing |
| `videoGeneration` | video generation billing |

### `unit` enum

| `unit` | Meaning |
| --- | --- |
| `millionTokens` | price per 1,000,000 tokens |
| `millionCharacters` | price per 1,000,000 characters |
| `image` | price per image |
| `megapixel` | price per megapixel |
| `second` | price per second |

Use the billing denominator that matches the provider's published pricing. For
example:

- text and most chat models use `millionTokens`
- some TTS models bill `textInput` by `millionCharacters`
- image generation may bill by `image` or `megapixel`
- audio or video duration-based pricing may bill by `second`

Common `lookup.pricingParams` include `ttl`, `size`, `quality`,
`textInputRange`, `textOutputRange`, and `generateAudio`.

### `fixed`

Use when one constant rate applies:

```json
{
  "name": "textInput",
  "strategy": "fixed",
  "rate": 2,
  "unit": "millionTokens"
}
```

### `tiered`

Use when pricing changes after a threshold:

```json
{
  "name": "textInput",
  "strategy": "tiered",
  "unit": "millionTokens",
  "tiers": [
    { "rate": 2, "upTo": 0.2 },
    { "rate": 4, "upTo": "infinity" }
  ]
}
```

In this example, `upTo: 0.2` means `0.2 millionTokens`, i.e. 200,000 tokens.

### `lookup`

Use when pricing depends on external parameters such as TTL or combined input
and output buckets:

```json
{
  "name": "textInput_cacheWrite",
  "strategy": "lookup",
  "unit": "millionTokens",
  "lookup": {
    "prices": {
      "1h": 10,
      "5m": 6.25
    },
    "pricingParams": ["ttl"]
  }
}
```

Multi-parameter lookup is also supported. This is common for image generation
pricing keyed by quality and size:

```json
{
  "name": "imageGeneration",
  "strategy": "lookup",
  "unit": "image",
  "lookup": {
    "prices": {
      "standard_1024x1024": 0.04,
      "standard_1024x1792": 0.08,
      "hd_1024x1024": 0.08
    },
    "pricingParams": ["quality", "size"]
  }
}
```

## Compat Schema

`compat` stores runtime behavior that is not captured by basic fields like
`api`, `baseUrl`, or `abilities`.

The goal is to move provider- and model-specific runtime quirks out of client
code and into registry data.

`compat` is split by runtime family:

- `openaiCompletions`
- `openaiResponses`
- `anthropic`
- `bedrock`
- `google`
- `googleGeminiCli`

### `openaiCompletions`

For OpenAI-compatible chat-completions style APIs.

- `supportsStore`
- `supportsDeveloperRole`
- `supportsReasoningEffort`
- `supportsUsageInStreaming`
- `maxTokensField`: `max_completion_tokens` or `max_tokens`
- `requiresToolResultName`
- `requiresAssistantAfterToolResult`
- `requiresThinkingAsText`
- `requiresMistralToolIds`
- `thinkingFormat`: `openai`, `zai`, or `qwen`
- `openRouterRouting`
- `vercelGatewayRouting`
- `supportsStrictMode`
- `assistantContentFormat`: `string` or `parts`
- `toolCallIdStrategy`: `preserve`, `openai-40`, `pipe-call-40`, or
  `mistral-9`

### `openaiResponses`

For OpenAI Responses-style APIs.

- `toolCallIdStrategy`: `preserve` or `responses-fc64`
- `longPromptCacheTtl`: currently `24h`

### `anthropic`

- `longPromptCacheTtl`: currently `1h`
- `supportsAdaptiveThinking`
- `xHighReasoningEffort`: `high` or `max`

### `bedrock`

- `supportsAdaptiveThinking`
- `supportsPromptCaching`
- `supportsThinkingSignature`
- `xHighReasoningEffort`

### `google`

For Google Gemini / Vertex style reasoning and tool behavior.

- `requiresToolCallId`
- `supportsMultimodalFunctionResponse`
- `reasoningMode`: `level` or `budget`
- `reasoningLevelMap`
- `defaultThinkingBudgets`

### `googleGeminiCli`

For Cloud Code Assist / Gemini CLI style APIs.

- `toolSchemaFormat`: `parameters` or `input_schema`
- `reasoningMode`
- `reasoningLevelMap`
- `defaultThinkingBudgets`

## Canonical API Values

Current `api` values used in this registry include:

- `openai-completions`
- `openai-responses`
- `azure-openai-responses`
- `anthropic-messages`
- `bedrock-converse-stream`
- `google-generative-ai`
- `google-gemini-cli`
- `google-vertex`

## Notes

- Not every field is present on every provider or model.
- Some upstream fields that are useful but not yet normalized may still live
  under `_`. These fields are unstable and may change at any time.
