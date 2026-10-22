// Model selection for /api/ai/*. Haiku 5.5 with thinking disabled everywhere; screenshots can
// be switched to a stronger model with AI_MODEL_EXTRACT (e.g. claude-sonnet-5-5) without a deploy.
// Never set temperature/top_p/top_k here and never prefill: the model rejects both.
import { anthropic, createAnthropic, type AnthropicLanguageModelOptions, type AnthropicProvider } from "@ai-sdk/anthropic";
import type { SystemModelMessage } from "ai";

export const DEFAULT_MODEL_ID = "claude-haiku-5-5";

export type AiTask = "suggest" | "extract" | "classify" | "enrich";

export function modelIdFor(task: AiTask): string {
  if (task === "extract") return process.env.AI_MODEL_EXTRACT?.trim() || DEFAULT_MODEL_ID;
  return DEFAULT_MODEL_ID;
}

type AiEnv = Readonly<Record<string, string | undefined>>;

let tokenProvider: { token: string; provider: AnthropicProvider } | null = null;

/**
 * The default `anthropic` provider reads ANTHROPIC_API_KEY only. When just ANTHROPIC_AUTH_TOKEN
 * is set, a provider that sends it as a Bearer token is built instead (the provider refuses
 * both at once, so the key wins when both are set).
 */
export function providerFor(env: AiEnv = process.env): AnthropicProvider {
  if (env.ANTHROPIC_API_KEY?.trim()) return anthropic;
  const token = env.ANTHROPIC_AUTH_TOKEN?.trim();
  if (!token) return anthropic;
  if (tokenProvider?.token !== token) tokenProvider = { token, provider: createAnthropic({ authToken: token }) };
  return tokenProvider.provider;
}

export function modelFor(task: AiTask) {
  return providerFor()(modelIdFor(task));
}

/** Provider options for every call. Models that cannot disable thinking get it adjusted by the provider (with a warning). */
export const providerOptions = {
  anthropic: { thinking: { type: "disabled" } } satisfies AnthropicLanguageModelOptions,
};

/** A frozen system prompt marked as a prompt-cache breakpoint (the provider maps it to cache_control). */
export function cachedInstructions(text: string): SystemModelMessage {
  return {
    role: "system",
    content: text,
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  };
}

/** True when the server can reach Anthropic at all (an API key, or a token providerFor() sends). */
export function isAiConfigured(env: AiEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim());
}
