import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Model, ModelPricing, PricingConditionMap } from "../types.ts";
import { manualModels } from "./manual.ts";
import { generateModelsDatabase } from "./index.ts";
import { finalizeModel, mergeAuthoritativeModel } from "./models.ts";
import { overrides } from "./overrides.ts";
import { convertFlatCostPricing } from "./pricing.ts";
import { GPT6_MODEL_IDS, OPENAI_272K_MODEL_IDS, recentClaudeProfile, supportsClaudeAdaptiveThinking } from "./recent-models.ts";
import { deepAssign } from "./utils.ts";

function patched(provider: string, id: string): Model {
  const model: Model = { id, name: id, abilities: {}, pricing: {
    currency: "USD", unit: "millionTokens", basePricing: { textInput: 99, textOutput: 99 },
  } };
  const patch = overrides.models?.[`${provider}/${id}`];
  if (typeof patch === "function") Object.assign(model, patch(model));
  else if (patch) deepAssign(model, patch);
  return finalizeModel(provider, undefined, model);
}

// Threshold buckets represent (lower, upper], matching providers' >272K rule.
function rates(pricing: ModelPricing, context: Record<string, string | boolean | number> = {}) {
  const matches = (when: PricingConditionMap) => Object.entries(when).every(([key, value]) =>
    Array.isArray(value)
      ? typeof context[key] === "number" && context[key] > value[0] && (value[1] === "infinity" || context[key] <= value[1])
      : context[key] === value,
  );
  const result = { ...pricing.basePricing };
  for (const adjustment of pricing.adjustments ?? []) {
    const unless = adjustment.unless ? (Array.isArray(adjustment.unless) ? adjustment.unless : [adjustment.unless]) : [];
    if (!matches(adjustment.when) || unless.some(matches)) continue;
    for (const [key, value] of Object.entries(adjustment.values)) {
      result[key] = adjustment.mode === "absolute" ? value : result[key] * value;
    }
  }
  return result;
}

describe("current Claude models", () => {
  test.each([
    ["claude-opus-5-5", 4, 20, 0.2, 8, "medium"],
    ["claude-sonnet-5-5", 2, 10, 0.2, 4, "high"],
    ["claude-fable-5-1", 10, 50, 0.25, 20, "high"],
  ] as const)("%s has official effort and cache pricing", (id, input, output, cacheRead, oneHourWrite, effort) => {
    const model = patched("anthropic", id);
    expect(model.reasoningEffort?.default).toBe(effort);
    expect(model.reasoningEffort?.enum).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(model.compat?.anthropic?.supportsAdaptiveThinking).toBe(true);
    expect(model.compat?.anthropic?.supportsThinkingDisabled).toBe(false);
    expect(model.compat?.anthropic?.supportsForcedToolChoice).toBe(false);
    expect(rates(model.pricing!, { textTotalInput: 1 })).toMatchObject({ textInput: input, textOutput: output, textInput_cacheRead: cacheRead });
    expect(rates(model.pricing!, { cacheTtl: "1h" }).textInput_cacheWrite).toBeCloseTo(oneHourWrite);
    expect(rates(model.pricing!, { cacheTtl: "1h", batch: true, inferenceGeo: "us" }).textInput_cacheWrite).toBeCloseTo(oneHourWrite * 0.5 * 1.1);
  });

  test("Sonnet uses between_tools only at low/medium/high", () => {
    expect(recentClaudeProfile("claude-sonnet-5-5")?.compat.betweenToolsEffort).toEqual(["low", "medium", "high"]);
    expect(recentClaudeProfile("claude-opus-5-5")?.compat.betweenToolsEffort).toBeUndefined();
  });

  test("fast pricing is 2x, while retired Opus 4.6 fast falls back to standard", () => {
    const opus = patched("anthropic", "claude-opus-5-5");
    expect(rates(opus.pricing!, { cacheTtl: "1h", fastMode: true, inferenceGeo: "us" }).textInput_cacheWrite).toBeCloseTo(17.6);
    expect(rates(opus.pricing!, { fastMode: true, batch: true }).textInput).toBe(8);
    const old = patched("anthropic", "claude-opus-4-6");
    expect(old.compat?.anthropic?.supportsFastMode).toBe(false);
    expect(rates(old.pricing!, { fastMode: true }).textInput).toBe(5);
  });

  test.each(["anthropic.claude-opus-5-5", "global.anthropic.claude-opus-5-5", "us.anthropic.claude-opus-5-5", "claude-opus-5-5@default"])("provider ID %s is recognized without changing its price", (id) => {
    const provider = id.includes("anthropic.") ? "amazon-bedrock" : "google-vertex-anthropic";
    const model = patched(provider, id);
    expect(model.reasoningEffort?.default).toBe("medium");
    expect(model.pricing?.basePricing.textInput).toBe(99);
    expect(model.compat?.anthropic?.supportsFastMode).toBeUndefined();
    if (provider === "amazon-bedrock") expect(model.compat?.bedrock?.supportsAdaptiveThinking).toBe(true);
  });

  test("unknown future and lookalike IDs are not guessed", () => {
    for (const id of ["claude-opus-6", "custom-claude-opus-5-5", "claude-opus-5-5-fake"]) {
      expect(recentClaudeProfile(id)).toBeUndefined();
      expect(supportsClaudeAdaptiveThinking(id)).toBe(false);
    }
  });
});

describe("GPT-6", () => {
  test.each([...GPT6_MODEL_IDS])("Codex %s has independent limits, efforts and billing", (id) => {
    const model = manualModels["openai-codex"].find((model) => model.id === id)!;
    expect(model.contextWindow).toBe(272000);
    expect(model._?.maxContextWindow).toBe(872000);
    expect(model.reasoningEffort?.enum).not.toContain("none");
    expect(model.reasoningEffort?.enum).not.toContain("ultra");
    expect(model.reasoningEffort?.default).toBe(id === "gpt-6-astra" || id === "gpt-6.1-sol" ? "low" : "medium");
    expect(model.pricing).toBeUndefined();
    const merged = mergeAuthoritativeModel(model, { id, name: id, abilities: {}, reasoningEffort: { enum: ["none", "high"], default: "high" } });
    expect(merged.reasoningEffort).toEqual(model.reasoningEffort);
    expect(model._?.supportsUltraMode).toBe(id !== "gpt-6-luna");
  });
  test.each([...GPT6_MODEL_IDS])("%s has model-specific effort and Responses capabilities", (id) => {
    const model = patched("openai", id);
    expect(model.reasoningEffort?.enum.includes("none")).toBe(id === "gpt-6-sol" || id === "gpt-6-luna");
    expect(model.reasoningEffort?.enum.includes("minimal")).toBe(false);
    expect(model.reasoningEffort?.default).toBe("medium");
    expect(model.api).toBe("openai-responses");
    expect(model.compat?.openaiResponses?.supportsProMode).toBe(true);
    expect(model.compat?.openaiResponses?.supportsAdditionalServiceTiers).toContain("fast");
    expect(model.compat?.openaiResponses?.supportsAdditionalServiceTiers?.includes("ultrafast")).toBe(id === "gpt-6-astra");
  });

  test.each([...OPENAI_272K_MODEL_IDS])("models.dev generic context_over_200k uses 272K for %s", (id) => {
    const pricing = convertFlatCostPricing({ input: 2, output: 10, context_over_200k: { input: 4, output: 15 } }, { id }, "openai");
    expect(pricing?.adjustments?.[0].when.textTotalInput).toEqual([0.272, "infinity"]);
  });

  test("gateway thresholds are not overwritten with first-party assumptions", () => {
    expect(convertFlatCostPricing({ input: 1, context_over_200k: { input: 2 } }, { id: "gpt-6.1-sol" }, "custom-gateway")?.adjustments?.[0].when.textTotalInput).toEqual([0.2, "infinity"]);
  });

  test("unrelated models retain the upstream 200K threshold", () => {
    expect(convertFlatCostPricing({ input: 1, context_over_200k: { input: 2 } }, { id: "other" })?.adjustments?.[0].when.textTotalInput).toEqual([0.2, "infinity"]);
  });

  test("Sol 6.1 rates compose without charging long context or flex twice", () => {
    const pricing = patched("openai", "gpt-6.1-sol").pricing!;
    for (const textTotalInput of [0.2, 0.25, 0.272]) expect(rates(pricing, { textTotalInput }).textInput).toBe(2);
    expect(rates(pricing, { textTotalInput: 0.272001 })).toMatchObject({ textInput: 4, textOutput: 15, textInput_cacheRead: 0.2, textInput_cacheWrite: 5 });
    expect(rates(pricing, { textTotalInput: 0.3, serviceTier: "fast" }).textOutput).toBe(30);
    expect(rates(pricing, { textTotalInput: 0.3, serviceTier: "flex", batch: true }).textInput).toBe(2);
    expect(rates(pricing, { batch: true, regionalProcessing: true }).textInput_cacheRead).toBeCloseTo(0.055);
    expect(rates(patched("openai", "gpt-6-astra").pricing!, { serviceTier: "ultrafast", textTotalInput: 0.3 }).textOutput).toBe(450);
  });

  test("Copilot newer releases choose the supported protocol", () => {
    for (const id of ["claude-fable-5.1", "claude-opus-5.5", "claude-sonnet-5.5"]) expect(patched("github-copilot", id).api).toBe("anthropic-messages");
    for (const id of GPT6_MODEL_IDS) expect(patched("github-copilot", id).api).toBe("openai-responses");
    expect(patched("github-copilot", "gpt-4o").api).toBe("openai-completions");
  });
});

afterEach(() => mock.restore());

test("full generator applies corrections after source merge and leaves gateway prices independent", async () => {
  const raw = (id: string) => ({ id, name: id, reasoning: true, reasoning_options: [{ type: "effort", values: ["low", "medium", "high"] }], cost: { input: 2, output: 10, context_over_200k: { input: 4, output: 15 } } });
  spyOn(globalThis, "fetch").mockImplementation((async (url: string | URL | Request) => {
    if (String(url).includes("models.dev")) return Response.json({
      openai: { id: "openai", name: "OpenAI", models: { "gpt-6.1-sol": raw("gpt-6.1-sol") } },
      anthropic: { id: "anthropic", name: "Anthropic", models: { "claude-opus-5-5": raw("claude-opus-5-5") } },
    });
    if (String(url).includes("githubusercontent")) return Response.json({ providers: {}, models: {} });
    return Response.json({ data: [{ id: "openai/gpt-6.1-sol", pricing: { prompt: "0.000099", completion: "0.000099", input: "0.000099", output: "0.000099" } }] });
  }) as typeof fetch);
  const { output } = await generateModelsDatabase({ log() {} });
  const opus = output.models.anthropic.find((model) => model.id === "claude-opus-5-5")!;
  expect(opus.reasoningEffort?.default).toBe("medium");
  expect(opus.pricing?.basePricing.textInput).toBe(4);
  const sol = output.models.openai.find((model) => model.id === "gpt-6.1-sol")!;
  expect(sol.reasoningEffort?.enum).toContain("max");
  expect(sol.pricing?.adjustments?.[0].when.textTotalInput).toEqual([0.272, "infinity"]);
  expect(output.models.openrouter.find((model) => model.id === "openai/gpt-6.1-sol")?.pricing?.basePricing.textInput).toBe(99);
  const azure = output.models["azure-openai-responses"].find((model) => model.id === "gpt-6.1-sol")!;
  expect(azure.compat?.openaiResponses?.supportsAdditionalServiceTiers).toBeUndefined();
});
