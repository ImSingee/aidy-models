# September 2026 Claude and OpenAI metadata

Official sources reviewed on **2026-09-30**. These changes correct the generator,
not just a snapshot of `models.json`.

## Verified releases and behavior

- [Claude models](https://platform.claude.com/docs/en/models/overview):
  Fable 5.1 (September 1), Opus 5.5 (September 22), Sonnet 5.5 (September 28).
  All three have 1M context and 128K normal output limits. The optional 300K
  Batch output beta is not the normal `maxOutput` limit.
- [Effort](https://platform.claude.com/docs/en/build-with-claude/effort):
  Opus 5.5 defaults to `medium`; the other two default to `high`. All support
  `low`, `medium`, `high`, `xhigh`, and `max`.
- [Sonnet 5.5 migration](https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5):
  `disabled` is rejected. Use `between_tools` at `high` or lower, or adaptive
  thinking. The new models reject forced tool selection.
- [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing):
  input/output per MTok are Fable $10/$50, Opus $4/$20, Sonnet $2/$10.
  Cache reads are respectively $0.25/$0.20/$0.20, not a universal 10% rate.
  One-hour cache writes, Batch discounts and US inference premiums are explicit
  adjustments. These models have no long-context surcharge.
- [Claude Fast mode](https://platform.claude.com/docs/en/build-with-claude/fast-mode):
  Opus 5.5, Opus 5 and Opus 4.8 support 2x Fast pricing on the first-party API.
  Opus 4.6 now falls back to standard speed and pricing. Fast access is a research
  preview; it is not available on cloud partners or with Batch.
- [GPT-6 guide](https://developers.openai.com/api/docs/guides/latest-model):
  GPT-6 Astra, GPT-6 Sol, GPT-6 Luna and GPT-6.1 Sol use Responses for reasoning
  with tools. Astra and Sol 6.1 do not accept `none`; Sol 6 and Luna do. `minimal`
  is not a supported effort. All support Pro mode as a request option, not a
  fabricated `-pro` model ID.
- [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) and
  [OpenAI pricing](https://developers.openai.com/api/docs/pricing): 1.05M context,
  128K output; Sol 6.1 cache reads cost 5% of input, unlike Sol 6's 10%.
  The long-context threshold is **>272K**, even when models.dev supplies its
  historical `context_over_200k` field. Long-context input/cache rates double,
  while output is 1.5x. Flex/Batch are 0.5x and Fast is 2x; supported regional
  processing adds 10%.
- [OpenAI Ultrafast](https://developers.openai.com/api/docs/guides/ultrafast-mode):
  GPT-6 Astra's public tier costs 6x standard rates. Preview access for GPT-5.6
  Sol is not advertised as a generally available tier in this registry.

- [Pinned Codex model catalog](https://github.com/openai/codex/blob/15fd656ddb55bd82a208fb9f00681880523f5260/codex-rs/models-manager/models.json):
  the four GPT-6 entries use a 272K default context and expose 872K as
  `_.maxContextWindow`. Codex defaults Astra and Sol 6.1 to
  `low`, Sol 6 and Luna to `medium`; its effort menu omits `none`. Ultra is
  multi-agent orchestration, stored as `_.supportsUltraMode`, not added to the
  API effort enum. New Codex entries intentionally have no USD pricing or guessed
  output limit: ChatGPT credits/quota and public API token billing differ.

## Provider boundaries and downstream work

First-party price and service-tier corrections are scoped to `anthropic` and
`openai`. Bedrock and Vertex model ID variants get the model-specific reasoning
profile without replacing their own rates. Copilot's new Claude/GPT releases
follow the existing Anthropic Messages/OpenAI Responses routing rules. No
upstream models are added or removed solely by an ID heuristic.

**Bedrock transport requires separate runtime work.** Anthropic now documents
[Bedrock Mantle Messages](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)
for Opus 4.7 and later (`/anthropic/v1/messages`), rather than the legacy Converse
transport. This repository currently exposes `bedrock-converse-stream` for that
provider. Adaptive-thinking metadata is not proof that Converse can invoke the
model. A consumer needs a Mantle adapter (including AWS authentication and region
handling) before those entries can be treated as runtime-ready. This update does
not invent an unsupported runtime protocol name or copy Anthropic Fast tiers to
Bedrock.

The registry does not execute requests, validate every combination of parameters,
or infer account access. Model-bound thinking blocks, new computer toolsets and
provider-specific authentication also need corresponding consumer support.

## Verification and regeneration

`bun run check` and `bun test` run without model API credentials; the generator
integration test supplies fixture catalogs for every network request. A live
`bun run generate` was also validated: 271 providers and 9,838 models, unique
provider-local IDs, valid effort defaults, and valid pricing shapes.

The generated snapshot is deliberately excluded from this script-focused change:
live catalogs also contain unrelated price/metadata updates. The repository's
existing scheduled or manually dispatched generation workflow will refresh
`models.json` after the scripts are merged. Run `bun run generate` to preview the
new output locally.
