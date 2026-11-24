import type { KnownModelType, Model, ModelType } from "../types.ts";

export const KNOWN_MODEL_TYPES: readonly KnownModelType[] = [
  "chat",
  "embedding",
  "reranking",
  "image",
  "video",
  "tts",
  "asr",
  "realtime",
  "text2music",
  "decision",
  "extraction",
];

const knownModelTypes = new Set<string>(KNOWN_MODEL_TYPES);

// Upstream vocabularies differ: lobehub uses `tts`/`asr`, while models.dev and
// Vercel AI Gateway use `speech`/`transcription`, and Vercel calls chat models
// `language` and decision models `evaluation`.
const modelTypeAliases: Record<string, KnownModelType> = {
  language: "chat",
  text: "chat",
  speech: "tts",
  transcription: "asr",
  stt: "asr",
  rerank: "reranking",
  evaluation: "decision",
  text2video: "video",
  music: "text2music",
};

const warnedUnknownTypes = new Set<string>();

export function normalizeModelType(
  rawType: unknown,
  context: string,
): ModelType | undefined {
  if (typeof rawType !== "string") return undefined;

  const type = rawType.trim().toLowerCase();
  if (type.length === 0) return undefined;
  if (knownModelTypes.has(type)) return type as KnownModelType;

  const alias = modelTypeAliases[type];
  if (alias) return alias;

  // Keep unknown upstream categories instead of failing the scheduled
  // generation; the warning tells us to extend the enum or the alias map.
  if (!warnedUnknownTypes.has(type)) {
    warnedUnknownTypes.add(type);
    console.warn(`Unknown model type "${rawType}" (first seen on ${context}), passing through`);
  }
  return type;
}

/**
 * Fallback when no source declared a type. models.dev and OpenRouter leave chat
 * models untyped, so chat is the default; the remaining checks catch the few
 * untyped entries that are clearly not chat models.
 */
export function inferModelType(model: Pick<Model, "id" | "modalities">): ModelType {
  const id = model.id.toLowerCase();
  if (/embed/.test(id)) return "embedding";
  if (/rerank/.test(id)) return "reranking";
  if (/transcri|whisper/.test(id)) return "asr";

  const output = model.modalities?.output ?? [];
  if (output.length > 0 && !output.includes("text")) {
    if (output.includes("video")) return "video";
    if (output.includes("image")) return "image";
    if (output.includes("audio")) {
      return /music|lyria|song/.test(id) ? "text2music" : "tts";
    }
  }

  return "chat";
}

export function resolveModelType(model: Pick<Model, "id" | "modalities" | "type">): ModelType {
  return model.type ?? inferModelType(model);
}
