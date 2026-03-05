import type { Model, Provider } from "./types.ts";

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

export interface Overrides {
  providers?: Record<string, DeepPartial<Provider>>;
  /** Key format: "providerId/modelId" */
  models?: Record<string, DeepPartial<Model>>;
}

export const overrides: Overrides = {
  models: {
    "opencode/claude-sonnet-4": { contextWindow: 200000 },
    "opencode/claude-sonnet-4-5": { contextWindow: 200000 },
  },
};
