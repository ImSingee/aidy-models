import type {
  ModelPricing,
  PricingAdjustment,
  PricingConditionValue,
  PricingRange,
} from "../types.ts";
import { roundNumber } from "./utils.ts";

type LegacyPricingTier = {
  rate: number;
  upTo: number | "infinity";
};

type LegacyPricingUnit = {
  lookup?: {
    prices: Record<string, number>;
    pricingParams: string[];
  };
  name: string;
  rate?: number;
  strategy: "fixed" | "tiered" | "lookup";
  tiers?: LegacyPricingTier[];
  unit: string;
};

type LegacyModelPricing = {
  currency?: string;
  units?: LegacyPricingUnit[];
};

type LegacyPricingParam = {
  normalizedName: string;
  originalName: string;
};

type LegacyRateRow = {
  rate: number;
  when: Record<string, PricingConditionValue>;
};

type LegacyUnitRows = {
  params: LegacyPricingParam[];
  rows: LegacyRateRow[];
};

const MULTIPLIER_FRIENDLY_CONDITIONS = new Set([
  "cacheTtl",
  "generateAudio",
  "textOutput",
  "totalInput",
  "thinkingMode",
]);

function resolveSinglePricingUnit(units: LegacyPricingUnit[], modelId: string): string {
  const uniqueUnits = [...new Set(units.map((unit) => unit.unit).filter(Boolean))];

  if (uniqueUnits.length === 0) {
    throw new Error(`Missing pricing unit for ${modelId}`);
  }

  if (uniqueUnits.length > 1) {
    throw new Error(
      `Mixed pricing units are not supported for ${modelId}: ${uniqueUnits.join(", ")}`,
    );
  }

  return uniqueUnits[0];
}

function normalizeThresholdNumber(value: number, unit: string): number {
  if ((unit === "millionTokens" || unit === "millionCharacters") && value > 1000) {
    return roundNumber(value / 1_000_000);
  }

  return roundNumber(value);
}

function parseNumericToken(value: string): number | undefined {
  const normalized = value.replaceAll("_", "");
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return undefined;
  return roundNumber(Number(normalized));
}

function parseScalarToken(value: string): string | number | boolean {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  const numeric = parseNumericToken(trimmed);
  return numeric ?? trimmed;
}

function parseConditionToken(value: string, unit: string): PricingConditionValue {
  const trimmed = value.trim();

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    const parts = inner.split(",");

    if (parts.length === 2) {
      const min = parseNumericToken(parts[0].trim());
      const maxRaw = parts[1].trim();

      if (min !== undefined) {
        if (maxRaw === "infinity") {
          return [normalizeThresholdNumber(min, unit), "infinity"];
        }

        const max = parseNumericToken(maxRaw);
        if (max !== undefined) {
          return [
            normalizeThresholdNumber(min, unit),
            normalizeThresholdNumber(max, unit),
          ];
        }
      }
    }

    return parseScalarToken(inner);
  }

  return parseScalarToken(trimmed);
}

function normalizeConditionName(
  name: string,
  value: PricingConditionValue,
): string {
  if (name === "ttl") return "cacheTtl";
  if (name === "textInputRange") return "totalInput";
  if (name === "textOutputRange") return "textOutput";
  if (Array.isArray(value) && name === "textInput") return "totalInput";
  if (Array.isArray(value) && name === "textOutput") return "textOutput";
  return name;
}

function parseLookupKeySegments(key: string, paramCount: number): string[] | undefined {
  if (paramCount === 1) return [key];

  const segments: string[] = [];
  let index = 0;

  while (index < key.length) {
    if (key[index] === "[") {
      let cursor = index + 1;
      let depth = 1;

      while (cursor < key.length && depth > 0) {
        if (key[cursor] === "[") depth += 1;
        if (key[cursor] === "]") depth -= 1;
        cursor += 1;
      }

      if (depth !== 0) return undefined;

      segments.push(key.slice(index, cursor));
      index = cursor;
    } else {
      let cursor = index;
      while (cursor < key.length && key[cursor] !== "_") cursor += 1;
      segments.push(key.slice(index, cursor));
      index = cursor;
    }

    if (key[index] === "_") index += 1;
  }

  if (segments.length === 0 || segments.length > paramCount) return undefined;
  return segments;
}

function inferTieredConditionName(target: string): string {
  if (target === "textOutput") return "textOutput";
  if (
    target === "textInput" ||
    target === "textInput_cacheRead" ||
    target === "textInput_cacheWrite"
  ) {
    return "totalInput";
  }

  return `${target}Range`;
}

function legacyPricingUnitToRows(
  unit: LegacyPricingUnit,
  modelId: string,
): LegacyUnitRows {
  if (unit.strategy === "fixed") {
    if (typeof unit.rate !== "number") {
      throw new Error(`Missing fixed pricing rate for ${modelId}/${unit.name}`);
    }

    return {
      params: [],
      rows: [{ rate: unit.rate, when: {} }],
    };
  }

  if (unit.strategy === "tiered") {
    const conditionName = inferTieredConditionName(unit.name);
    let lowerBound = 0;

    return {
      params: [{ originalName: conditionName, normalizedName: conditionName }],
      rows: (unit.tiers ?? []).map((tier) => {
        const upperBound =
          tier.upTo === "infinity"
            ? "infinity"
            : normalizeThresholdNumber(tier.upTo, unit.unit);

        const row: LegacyRateRow = {
          rate: tier.rate,
          when: {
            [conditionName]: [
              normalizeThresholdNumber(lowerBound, unit.unit),
              upperBound,
            ] satisfies PricingRange,
          },
        };

        if (upperBound !== "infinity") {
          lowerBound = upperBound;
        }

        return row;
      }),
    };
  }

  const pricingParams = unit.lookup?.pricingParams ?? [];
  const prices = unit.lookup?.prices ?? {};
  const rows: LegacyRateRow[] = [];
  const params = new Map<string, LegacyPricingParam>();

  for (const [lookupKey, rate] of Object.entries(prices)) {
    const segments = parseLookupKeySegments(lookupKey, pricingParams.length);
    if (!segments) {
      throw new Error(
        `Unable to parse lookup key "${lookupKey}" for ${modelId}/${unit.name}`,
      );
    }

    const when: Record<string, PricingConditionValue> = {};

    for (const [index, segment] of segments.entries()) {
      const originalName = pricingParams[index];
      const value = parseConditionToken(segment, unit.unit);
      const normalizedName = normalizeConditionName(originalName, value);

      params.set(normalizedName, { originalName, normalizedName });
      when[normalizedName] = value;
    }

    rows.push({ rate, when });
  }

  return {
    params: [...params.values()],
    rows,
  };
}

function normalizeDefaultConditionValue(
  value: unknown,
  unit: string,
): PricingConditionValue | undefined {
  if (typeof value === "string") return parseConditionToken(value, unit);
  if (typeof value === "number" || typeof value === "boolean") return value;
  return undefined;
}

function serializeConditionValue(value: PricingConditionValue): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify(value);
}

function serializeWhen(when: Record<string, PricingConditionValue>): string {
  const sorted = Object.entries(when).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return sorted
    .map(([key, value]) => `${key}:${serializeConditionValue(value)}`)
    .join("|");
}

function conditionValueEquals(
  left: PricingConditionValue | undefined,
  right: PricingConditionValue | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return serializeConditionValue(left) === serializeConditionValue(right);
}

function compareRanges(left: PricingRange, right: PricingRange): number {
  if (left[0] !== right[0]) return left[0] - right[0];

  const leftMax = left[1] === "infinity" ? Number.POSITIVE_INFINITY : left[1];
  const rightMax = right[1] === "infinity" ? Number.POSITIVE_INFINITY : right[1];
  return leftMax - rightMax;
}

function countPreferenceMismatches(
  row: LegacyRateRow,
  preferences: Map<string, PricingConditionValue>,
): number {
  let mismatches = 0;

  for (const [key, preferredValue] of preferences) {
    if (!conditionValueEquals(row.when[key], preferredValue)) mismatches += 1;
  }

  return mismatches;
}

function selectBaseRow(
  unitRows: LegacyUnitRows,
  rawModel: Record<string, any> | undefined,
  unit: string,
): LegacyRateRow {
  if (unitRows.rows.length === 1) return unitRows.rows[0];

  const preferences = new Map<string, PricingConditionValue>();

  for (const param of unitRows.params) {
    const values: PricingConditionValue[] = [];
    for (const row of unitRows.rows) {
      const value = row.when[param.normalizedName];
      if (value === undefined) continue;
      if (
        !values.some((existingValue) => conditionValueEquals(existingValue, value))
      ) {
        values.push(value);
      }
    }

    let preferredValue: PricingConditionValue | undefined;

    if (
      param.normalizedName === "generateAudio" &&
      values.some((value) => value === false)
    ) {
      preferredValue = false;
    } else {
      const defaultValue = normalizeDefaultConditionValue(
        rawModel?.parameters?.[param.originalName]?.default,
        unit,
      );

      if (
        defaultValue !== undefined &&
        values.some((value) => conditionValueEquals(value, defaultValue))
      ) {
        preferredValue = defaultValue;
      } else if (
        param.normalizedName.endsWith("Range") &&
        values.some((value) => Array.isArray(value))
      ) {
        preferredValue = values
          .filter((value): value is PricingRange => Array.isArray(value))
          .sort(compareRanges)[0];
      } else if (
        values.every((value) => typeof value === "boolean") &&
        values.some((value) => value === false)
      ) {
        preferredValue = false;
      }
    }

    if (preferredValue !== undefined) {
      preferences.set(param.normalizedName, preferredValue);
    }
  }

  return [...unitRows.rows].sort((left, right) => {
    const mismatchDelta =
      countPreferenceMismatches(left, preferences) -
      countPreferenceMismatches(right, preferences);
    if (mismatchDelta !== 0) return mismatchDelta;

    if (left.rate !== right.rate) return left.rate - right.rate;

    return serializeWhen(left.when).localeCompare(serializeWhen(right.when));
  })[0];
}

function shouldUseAbsoluteAdjustment(
  params: LegacyPricingParam[],
  baseRate: number,
): boolean {
  if (baseRate === 0) return true;
  return params.some(
    (param) => !MULTIPLIER_FRIENDLY_CONDITIONS.has(param.normalizedName),
  );
}

function cloneWhen(
  when: Record<string, PricingConditionValue>,
): Record<string, PricingConditionValue> {
  return Object.fromEntries(
    Object.entries(when).sort(([left], [right]) => left.localeCompare(right)),
  ) as Record<string, PricingConditionValue>;
}

export function convertLegacyPricing(
  pricing: LegacyModelPricing | undefined,
  rawModel: Record<string, any> | undefined,
  modelId: string,
): ModelPricing | undefined {
  const units = pricing?.units?.filter(Boolean) ?? [];
  if (units.length === 0) return undefined;

  const pricingUnit = resolveSinglePricingUnit(units, modelId);
  const basePricing: Record<string, number> = {};
  const adjustments = new Map<string, PricingAdjustment>();

  for (const legacyUnit of units) {
    const unitRows = legacyPricingUnitToRows(legacyUnit, modelId);
    if (unitRows.rows.length === 0) continue;

    const baseRow = selectBaseRow(unitRows, rawModel, pricingUnit);
    const baseRate = roundNumber(baseRow.rate);
    basePricing[legacyUnit.name] = baseRate;

    const absoluteMode = shouldUseAbsoluteAdjustment(unitRows.params, baseRate);

    for (const row of unitRows.rows) {
      const rate = roundNumber(row.rate);
      const sameBaseCondition = serializeWhen(row.when) === serializeWhen(baseRow.when);
      if (sameBaseCondition) continue;

      const mode = absoluteMode || baseRate === 0 ? "absolute" : "multiplier";
      const value = mode === "absolute" ? rate : roundNumber(rate / baseRate);
      if (value === 1 || rate === baseRate) continue;

      const adjustmentKey = `${mode}:${serializeWhen(row.when)}`;
      const adjustment =
        adjustments.get(adjustmentKey) ??
        {
          mode,
          values: {},
          when: cloneWhen(row.when),
        };

      adjustment.values[legacyUnit.name] = value;
      adjustments.set(adjustmentKey, adjustment);
    }
  }

  const adjustmentList = [...adjustments.values()].sort((left, right) => {
    const modeDelta = left.mode.localeCompare(right.mode);
    if (modeDelta !== 0) return modeDelta;
    return serializeWhen(left.when).localeCompare(serializeWhen(right.when));
  });

  return {
    adjustments: adjustmentList.length > 0 ? adjustmentList : undefined,
    basePricing,
    currency: pricing?.currency ?? "USD",
    unit: pricingUnit,
  };
}

function flatCostToLegacyUnits(cost: Record<string, any>): LegacyPricingUnit[] {
  const contextOver200k = cost.context_over_200k;
  const unit = "millionTokens";

  const pairs: [string, string][] = [
    ["textInput", "input"],
    ["textOutput", "output"],
    ["textInput_cacheRead", "cache_read"],
    ["textInput_cacheWrite", "cache_write"],
  ];

  const units: LegacyPricingUnit[] = [];
  for (const [name, flat] of pairs) {
    const base = cost[flat];
    if (base == null) continue;

    const over200k = contextOver200k?.[flat];
    if (over200k != null && over200k !== base) {
      units.push({
        name,
        strategy: "tiered",
        tiers: [
          { rate: base, upTo: 0.2 },
          { rate: over200k, upTo: "infinity" },
        ],
        unit,
      });
    } else {
      units.push({ name, rate: base, strategy: "fixed", unit });
    }
  }

  return units;
}

export function convertFlatCostPricing(
  cost: Record<string, any> | undefined,
  rawModel: Record<string, any> | undefined,
  modelId: string,
): ModelPricing | undefined {
  if (!cost) return undefined;

  return convertLegacyPricing(
    { currency: "USD", units: flatCostToLegacyUnits(cost) },
    rawModel,
    modelId,
  );
}

export function validatePricing(modelId: string, pricing: ModelPricing): void {
  if (!pricing.unit) {
    throw new Error(`Missing pricing.unit for ${modelId}`);
  }

  if (Object.keys(pricing.basePricing).length === 0) {
    throw new Error(`Missing pricing.basePricing entries for ${modelId}`);
  }

  for (const adjustment of pricing.adjustments ?? []) {
    if (Object.keys(adjustment.values).length === 0) {
      throw new Error(`Empty pricing adjustment for ${modelId}`);
    }

    for (const target of Object.keys(adjustment.values)) {
      if (!(target in pricing.basePricing)) {
        throw new Error(
          `Pricing adjustment target "${target}" is missing from basePricing for ${modelId}`,
        );
      }
    }

    for (const value of Object.values(adjustment.when)) {
      if (Array.isArray(value)) {
        if (value.length !== 2) {
          throw new Error(`Invalid pricing range for ${modelId}`);
        }

        if (typeof value[0] !== "number") {
          throw new Error(`Invalid pricing range lower bound for ${modelId}`);
        }

        if (typeof value[1] !== "number" && value[1] !== "infinity") {
          throw new Error(`Invalid pricing range upper bound for ${modelId}`);
        }
      }
    }
  }
}
