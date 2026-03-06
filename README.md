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
- `pricing.unit`: billing unit used by this pricing definition
- `pricing.basePricing`: base rates by pricing target
- `pricing.adjustments`: conditional pricing adjustments

## Pricing Schema

`pricing` contains:

- `unit`: billing denominator such as `millionTokens` or `image`
- `basePricing`: default rates keyed by pricing target such as `textInput`
- `adjustments`: conditional changes applied on top of `basePricing`

The current schema assumes a single `unit` per model pricing definition.

Each `adjustment` contains:

- `mode`: `multiplier` or `absolute`
- `when`: condition map
- `values`: target -> factor or final rate

Condition values may be:

- `string`, `number`, or `boolean` for a matching condition
- `[number, number | "infinity"]` for ranges such as `totalInput: [0.2, "infinity"]`

Adjustment application order:

1. Start from `basePricing`
2. Iterate over `adjustments` in array order
3. For each matching adjustment and target:
   - if `mode` is `absolute`, replace the current rate
   - if `mode` is `multiplier`, multiply the current rate

This means adjustment order is significant:

- `absolute` followed by `multiplier`: both apply, because the later multiplier
  multiplies the overridden rate
- `multiplier` followed by `absolute`: only the later absolute result remains,
  because it replaces the already-multiplied rate

### Pricing target enum

| key | Meaning |
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

### `when` key enum

The `when` object uses condition keys to describe when an adjustment applies.

| key | Value type | Meaning |
| --- | --- | --- |
| `cacheTtl` | `string` | prompt cache TTL such as `5m`, `1h`, or `24h` |
| `totalInput` | `[number, number \| "infinity"]` | total input-token bucket, including `textInput` + `textInput_cacheRead` + `textInput_cacheWrite`, using `pricing.unit` as the denominator |
| `textOutput` | `[number, number \| "infinity"]` | output-token bucket, using `pricing.unit` as the denominator |
| `quality` | `string` | image quality variant such as `standard` or `hd` |
| `size` | `string` | image size such as `1024x1024` |
| `generateAudio` | `boolean` | whether audio generation is enabled |
| `thinkingMode` | `boolean` | whether a model is in thinking / reasoning mode |

Other condition keys may appear if upstream pricing introduces more dimensions.
When that happens, the value type still follows `PricingConditionValue`.

### `values` key enum

The keys in `basePricing` and `adjustments.values` use the same enum:

| key | Meaning |
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

`values` means different things depending on `mode`:

- if `mode` is `multiplier`, `values[target]` is a factor such as `1.5` or `2`
- if `mode` is `absolute`, `values[target]` is the final rate in `pricing.unit`

### Example: multiplier

```json
{
  "currency": "USD",
  "unit": "millionTokens",
  "basePricing": {
    "textInput": 3,
    "textOutput": 15,
    "textInput_cacheRead": 0.3,
    "textInput_cacheWrite": 3.75
  },
  "adjustments": [
    {
      "mode": "multiplier",
      "when": {
        "totalInput": [0.2, "infinity"]
      },
      "values": {
        "textInput": 2,
        "textOutput": 1.5,
        "textInput_cacheRead": 2,
        "textInput_cacheWrite": 2
      }
    },
    {
      "mode": "multiplier",
      "when": {
        "cacheTtl": "1h"
      },
      "values": {
        "textInput_cacheWrite": 1.6
      }
    }
  ]
}
```

### Example: absolute

```json
{
  "currency": "USD",
  "unit": "image",
  "basePricing": {
    "imageGeneration": 0.04
  },
  "adjustments": [
    {
      "mode": "absolute",
      "when": {
        "quality": "hd",
        "size": "1024x1024"
      },
      "values": {
        "imageGeneration": 0.08
      }
    }
  ]
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
