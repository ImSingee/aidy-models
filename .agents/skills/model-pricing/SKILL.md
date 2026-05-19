---
name: model-pricing
description: Fetch and interpret LLM model pricing from aidy-models. Use when the user asks about model prices, token costs, billing rates, cheapest models, provider pricing, cost comparisons, or up-to-date pricing metadata.
---

# Model Pricing

## Core Rule

When answering any question about model pricing, billing rates, model costs, cheapest options, or price comparisons, fetch the latest registry first:

`https://raw.githubusercontent.com/ImSingee/aidy-models/refs/heads/master/models.json`

Do not rely on remembered prices, examples, or stale local data. If the URL cannot be fetched, tell the user that live pricing could not be verified before giving any fallback answer.

## Reading the JSON

`models.json` is large (several MB, hundreds of models across all providers). Never load it whole into the conversation or your context, and never paste it into responses. Always fetch it through a script and extract only the keys you need (`_meta.generatedAt`, a single provider, a single model, or a single `pricing` object).

Prefer streaming + filtering tools such as `jq` or a short `python` script. Examples:

```bash
URL=https://raw.githubusercontent.com/ImSingee/aidy-models/refs/heads/master/models.json

curl -sSL "$URL" | jq '._meta.generatedAt'

curl -sSL "$URL" \
  | jq '.models["openai"][] | select(.id == "gpt-5") | {id, name, pricing}'
```

```bash
python3 - <<'PY'
import json, urllib.request
url = "https://raw.githubusercontent.com/ImSingee/aidy-models/refs/heads/master/models.json"
data = json.load(urllib.request.urlopen(url))
m = next(m for m in data["models"]["openai"] if m["id"] == "gpt-5")
print(json.dumps({"id": m["id"], "pricing": m.get("pricing")}, indent=2))
PY
```

If a local `models.json` is present in the repo, read it the same way: query with `jq`/scripts, do not read the file in full.

## Workflow

1. Fetch the JSON with a script (curl + jq, or python) and pull out only the fields you need. Do not download-and-read the whole file into context.
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
- Never paste the full `models.json` or large sections of it into the response; quote only the specific fields you used.
