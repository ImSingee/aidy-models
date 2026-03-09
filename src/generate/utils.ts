import type { ModelCompat } from "../types.ts";

type PlainObject = Record<string, unknown>;

export function isRecord(value: unknown): value is PlainObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function isEmptyRecord(value: object | undefined): boolean {
  return !value || Object.keys(value).length === 0;
}

export function compactObject<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

export function deepAssign<T extends object, U extends object>(
  target: T,
  source: U,
): T & U {
  const targetRecord = target as PlainObject;
  const sourceRecord = source as PlainObject;

  for (const [key, value] of Object.entries(sourceRecord)) {
    const targetValue = targetRecord[key];
    if (isRecord(value) && isRecord(targetValue)) {
      deepAssign(targetValue, value);
    } else {
      targetRecord[key] = value;
    }
  }

  return target as T & U;
}

export function mergeRecords<T extends object>(
  base?: T,
  override?: T,
): T | undefined {
  if (!base) {
    return override ? clone(override) : undefined;
  }
  if (!override) {
    return clone(base);
  }

  const result = clone(base);
  deepAssign(result, clone(override));
  return isEmptyRecord(result) ? undefined : result;
}

export function mergeCompat(
  ...compatList: Array<ModelCompat | undefined>
): ModelCompat | undefined {
  let result: ModelCompat | undefined;
  for (const compat of compatList) {
    result = mergeRecords(result, compat);
  }
  return result;
}

export function mergeHeaders(
  ...headersList: Array<Record<string, string> | undefined>
): Record<string, string> | undefined {
  const merged = Object.assign({}, ...headersList.filter(Boolean));
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function roundNumber(value: number): number {
  return Number(value.toFixed(12));
}
