import { anthropic } from "@ai-sdk/anthropic";
import { describe, expect, it, vi } from "vitest";
import { ACCURATE_MODEL_ID, DEFAULT_MODEL_ID, isAiConfigured, modelIdFor, providerFor } from "./model";

type Env = Record<string, string>;

async function authHeaders(env: Env): Promise<Record<string, string>> {
  const fetchSpy = vi.fn<typeof fetch>(async () => new Response("{}", { status: 500 }));
  vi.stubGlobal("fetch", fetchSpy);
  try {
    const model = providerFor(env)("claude-haiku-5-5");
    await Promise.resolve(model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] })).catch(() => undefined);
  } finally {
    vi.unstubAllGlobals();
  }
  const init = fetchSpy.mock.calls[0]?.[1];
  return Object.fromEntries(new Headers(init?.headers).entries());
}

describe("providerFor / isAiConfigured", () => {
  it("uses the default provider when an API key is set", () => {
    expect(providerFor({ ANTHROPIC_API_KEY: "sk-ant-x", ANTHROPIC_AUTH_TOKEN: "tok" })).toBe(anthropic);
    expect(isAiConfigured({ ANTHROPIC_API_KEY: "sk-ant-x" })).toBe(true);
  });

  it("sends ANTHROPIC_AUTH_TOKEN as a Bearer token when it is the only credential", async () => {
    const env: Env = { ANTHROPIC_AUTH_TOKEN: "tok-123" };
    expect(isAiConfigured(env)).toBe(true);
    expect(providerFor(env)).not.toBe(anthropic);
    const headers = await authHeaders(env);
    expect(headers.authorization).toBe("Bearer tok-123");
    expect(headers["x-api-key"]).toBeUndefined();
  });

  it("is not configured without any credential", () => {
    expect(isAiConfigured({ ANTHROPIC_API_KEY: " ", ANTHROPIC_AUTH_TOKEN: "" })).toBe(false);
  });
});

describe("modelIdFor", () => {
  it("maps the settings tier to a fixed model, keeping AI_MODEL_EXTRACT for fast screenshots", () => {
    expect(modelIdFor("suggest")).toBe(DEFAULT_MODEL_ID);
    expect(modelIdFor("suggest", "accurate")).toBe(ACCURATE_MODEL_ID);
    vi.stubEnv("AI_MODEL_EXTRACT", "claude-sonnet-5-5");
    try {
      expect(modelIdFor("extract", "fast")).toBe("claude-sonnet-5-5");
      expect(modelIdFor("enrich", "fast")).toBe(DEFAULT_MODEL_ID);
      expect(modelIdFor("extract", "accurate")).toBe(ACCURATE_MODEL_ID);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
