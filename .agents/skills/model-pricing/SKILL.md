---
name: model-pricing
description: Fetch and interpret LLM model pricing from aidy-models. Use when the user asks about model prices, token costs, billing rates, cheapest models, provider pricing, cost comparisons, or up-to-date pricing metadata.
---

# Model Pricing

## Core Rule

When answering any question about model pricing, billing rates, model costs, cheapest options, or price comparisons, fetch the latest registry first:

`https://raw.githubusercontent.com/ImSingee/aidy-models/refs/heads/master/models.json`

Do not rely on remembered prices, examples, or stale local data. If the URL cannot be fetched, tell the user that live pricing could not be verified before giving any fallback answer.

## Workflow

1. Download and parse the JSON from the source URL.
2. Use `_meta.generatedAt` when present to report the registry generation time.
3. Resolve models by provider id, model id, or display name. If a query matches multiple models, ask for clarification or show the close matches.
4. Read pricing from each model's `pricing` object:
   - `currency`: pricing currency, such as `USD` or `CNY`
   - `unit`: billing denominator, such as `millionTokens`, `image`, `megapixel`, or `second`
   - `basePricing`: default rates by target, such as `textInput` and `textOutput`
   - `adjustments`: conditional pricing changes
5. Apply `adjustments` only when the user's scenario includes the matching conditions. If conditions are unknown, present base pricing and list relevant conditional adjustments separately.

## Answering Guidelines

- Always mention that prices came from the live `aidy-models` registry and include the generation time if available.
- Preserve the registry's currency and unit; do not silently convert currencies or billing units.
- For token pricing, make clear that `millionTokens` means price per 1,000,000 tokens.
- If pricing is missing for a model, say it is not available in the latest registry instead of estimating.
- For comparisons, compare only models with compatible units unless the user asks for a specific normalization.
- If the user asks to inspect the local repository data, use the local `models.json`; otherwise prefer the remote URL above for current pricing.
