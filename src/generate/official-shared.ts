import type { Model, ModelPricing } from "../types.ts";
import { compactObject, roundNumber } from "./utils.ts";

export interface OfficialCatalog {
  modelCount: number;
  models: Model[];
  providerCount: number;
}

export function parsePrice(
  value: string | number | undefined,
): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? roundNumber(value * 1_000_000) : undefined;
  }

  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundNumber(parsed * 1_000_000) : undefined;
}

export function createPricing(
  input: number | undefined,
  output: number | undefined,
  cacheRead: number | undefined,
  cacheWrite: number | undefined,
): ModelPricing | undefined {
  const basePricing = compactObject({
    ...(input !== undefined ? { textInput: input } : {}),
    ...(output !== undefined ? { textOutput: output } : {}),
    ...(cacheRead !== undefined ? { textInput_cacheRead: cacheRead } : {}),
    ...(cacheWrite !== undefined ? { textInput_cacheWrite: cacheWrite } : {}),
  });

  if (!basePricing) {
    return undefined;
  }

  return {
    currency: "USD",
    unit: "millionTokens",
    basePricing,
  };
}

export function normalizeReleasedAt(
  timestamp: number | undefined,
): string | undefined {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return undefined;
  }

  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

export function normalizeModalities(
  input: string[] | undefined,
  output: string[] | undefined,
): Model["modalities"] | undefined {
  const modalities = compactObject({
    ...(input && input.length > 0 ? { input } : {}),
    ...(output && output.length > 0 ? { output } : {}),
  });

  return modalities;
}
