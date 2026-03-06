import type { ModelCompat } from "../types.ts";

export function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function isEmptyRecord(value: Record<string, unknown> | undefined): boolean {
  return !value || Object.keys(value).length === 0;
}

export function compactObject<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

export function deepAssign(target: Record<string, any>, source: Record<string, any>) {
  for (const [key, value] of Object.entries(source)) {
    if (isRecord(value) && isRecord(target[key])) {
      deepAssign(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

export function mergeRecords<T extends Record<string, any>>(
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
