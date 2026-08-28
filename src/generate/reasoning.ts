import type {
  Model,
  ModelReasoningEffort,
  ReasoningEffort,
} from "../types.ts";
import { isRecord } from "./utils.ts";

const REASONING_EFFORT_VALUES = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies readonly ReasoningEffort[];

const reasoningEffortValueSet = new Set<unknown>(REASONING_EFFORT_VALUES);

const officialProviderDefaults: Record<string, ReasoningEffort> = {
  anthropic: "high",
  openai: "medium",
};

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return reasoningEffortValueSet.has(value);
}

export function normalizeModelsDevReasoningEffort(
  rawModel: unknown,
  context = "models.dev model",
): ModelReasoningEffort | undefined {
  if (!isRecord(rawModel)) return undefined;

  const rawOptions = rawModel.reasoning_options;
  if (rawOptions == null) return undefined;
  if (!Array.isArray(rawOptions)) {
    throw new Error(`${context}: reasoning_options must be an array`);
  }

  const effortOptions = rawOptions.filter(
    (option) => isRecord(option) && option.type === "effort",
  );
  if (effortOptions.length === 0) return undefined;
  if (effortOptions.length > 1) {
    throw new Error(`${context}: multiple effort reasoning options are ambiguous`);
  }

  const rawValues = effortOptions[0].values;
  if (!Array.isArray(rawValues)) {
    throw new Error(`${context}: effort values must be an array`);
  }

  const enumValues: ReasoningEffort[] = [];
  for (const value of rawValues) {
    // models.dev uses these sentinels for the provider's implicit behavior,
    // rather than for a selectable normalized effort level.
    if (value === null || value === "default") continue;
    if (!isReasoningEffort(value)) {
      throw new Error(
        `${context}: unsupported reasoning effort value ${JSON.stringify(value)}`,
      );
    }
    if (!enumValues.includes(value)) enumValues.push(value);
  }

  return enumValues.length > 0 ? { enum: enumValues } : undefined;
}

export function applyReasoningEffortDefault(
  providerId: string,
  model: Model,
): void {
  const reasoningEffort = model.reasoningEffort;
  if (!reasoningEffort) return;

  if (reasoningEffort.default) {
    if (!reasoningEffort.enum.includes(reasoningEffort.default)) {
      throw new Error(
        `${providerId}/${model.id}: reasoning effort default ${reasoningEffort.default} is not supported`,
      );
    }
    return;
  }

  const preferredDefault = officialProviderDefaults[providerId];
  if (!preferredDefault) return;

  if (reasoningEffort.enum.includes(preferredDefault)) {
    reasoningEffort.default = preferredDefault;
    return;
  }

  if (reasoningEffort.enum.length === 1) {
    reasoningEffort.default = reasoningEffort.enum[0];
    return;
  }

  throw new Error(
    `${providerId}/${model.id}: preferred reasoning effort default ${preferredDefault} is not supported`,
  );
}
