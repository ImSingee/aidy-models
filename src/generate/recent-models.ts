import type { AnthropicCompat, ModelReasoningEffort } from "../types.ts";

// Reviewed against the linked official docs on 2026-09-30. Keep this an explicit
// release list: an unknown future model must not inherit guessed capabilities.
// https://developers.openai.com/api/docs/guides/latest-model
export const GPT6_MODEL_IDS = [
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-6-luna",
  "gpt-6.1-sol",
] as const;

// https://developers.openai.com/api/docs/pricing
export const OPENAI_272K_MODEL_IDS = [
  "gpt-5.4", "gpt-5.4-pro", "gpt-5.5", "gpt-5.5-pro",
  "gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna",
  ...GPT6_MODEL_IDS,
] as const;

export const CLAUDE_ADAPTIVE_MODEL_IDS = [
  "claude-opus-4-6", "claude-sonnet-4-6", "claude-opus-4-7",
  "claude-opus-4-8", "claude-fable-5", "claude-opus-5", "claude-sonnet-5",
  "claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5",
] as const;

// Only normalize established provider ID formats, not arbitrary substring hits.
export function canonicalClaudeId(modelId: string): string {
  return modelId.toLowerCase()
    .replace(/^(?:(?:global|us|eu|apac|au|jp)\.)?anthropic[./]/, "")
    .replace(/@(?:default|\d{8})$/, "")
    .replace(/-v\d+(?::\d+)?$/, "")
    .replace(/(\d)\.(\d)/g, "$1-$2");
}

export function supportsClaudeAdaptiveThinking(modelId: string): boolean {
  return (CLAUDE_ADAPTIVE_MODEL_IDS as readonly string[]).includes(canonicalClaudeId(modelId));
}

// https://platform.claude.com/docs/en/build-with-claude/effort
// https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5
export function recentClaudeProfile(modelId: string): {
  reasoningEffort: ModelReasoningEffort;
  compat: AnthropicCompat;
} | undefined {
  const id = canonicalClaudeId(modelId);
  if (!["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5"].includes(id)) return;
  return {
    reasoningEffort: {
      enum: ["low", "medium", "high", "xhigh", "max"],
      default: id === "claude-opus-5-5" ? "medium" : "high",
    },
    compat: {
      supportsAdaptiveThinking: true,
      supportsThinkingDisabled: false,
      supportsForcedToolChoice: false,
      ...(id === "claude-sonnet-5-5"
        ? { betweenToolsEffort: ["low", "medium", "high"] as const }
        : {}),
    },
  };
}
