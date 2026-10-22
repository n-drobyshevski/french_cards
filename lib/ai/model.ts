// Model selection for /api/ai/*. Haiku 5.5 with thinking disabled by default; the learner can pick
// «Точнее» (Sonnet 5.5) in Settings, sent as `model: "accurate"`. Screenshots on «Быстрее» can still
// be switched to a stronger model with AI_MODEL_EXTRACT (e.g. claude-sonnet-5-5) without a deploy.
// Never set temperature/top_p/top_k here and never prefill: the model rejects both.
import { anthropic, createAnthropic, type AnthropicLanguageModelOptions, type AnthropicProvider } from "@ai-sdk/anthropic";
import type { SystemModelMessage } from "ai";

export const DEFAULT_MODEL_ID = "claude-haiku-5-5";
/** Settings «Модель» → «Точнее». */
export const ACCURATE_MODEL_ID = "claude-sonnet-5-5";

export type AiTask = "suggest" | "extract" | "classify" | "enrich" | "example";
/** What the client may ask for; never a raw model id. */
export type ModelTier = "fast" | "accurate";

export function modelIdFor(task: AiTask, tier: ModelTier = "fast"): string {
  if (tier === "accurate") return ACCURATE_MODEL_ID;
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

export function modelFor(task: AiTask, tier: ModelTier = "fast") {
  return providerFor()(modelIdFor(task, tier));
}

const DEFAULT_OPTIONS = { anthropic: { thinking: { type: "disabled" } } } satisfies { anthropic: AnthropicLanguageModelOptions };
const SONNET_OPTIONS = {
  anthropic: { thinking: { type: "between_tools" }, effort: "low" },
} satisfies { anthropic: AnthropicLanguageModelOptions };

/**
 * Provider options per resolved model id (AI_MODEL_EXTRACT can swap the model per task, so not
 * per tier). Haiku: thinking off. Sonnet 5.5 rejects `disabled` and defaults to high effort, so it
 * gets its lowest thinking setting (`between_tools`, valid up to high effort) at low effort. Other
 * ids keep `disabled`; the provider adjusts it with a warning where a model cannot turn thinking off.
 * Fixed per model, never per request: a changed effort invalidates the prompt cache.
 */
export function providerOptionsFor(modelId: string) {
  return modelId.startsWith(ACCURATE_MODEL_ID) ? SONNET_OPTIONS : DEFAULT_OPTIONS;
}

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
