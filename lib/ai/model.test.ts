import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { describe, expect, it, vi } from "vitest";
import { ACCURATE_MODEL_ID, DEFAULT_MODEL_ID, isAiConfigured, modelIdFor, providerFor, providerOptionsFor } from "./model";

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

describe("providerOptionsFor", () => {
  it("turns thinking off on Haiku and runs Sonnet 5.5 at its lowest thinking, medium effort", () => {
    expect(providerOptionsFor(DEFAULT_MODEL_ID)).toEqual({ anthropic: { thinking: { type: "disabled" } } });
    expect(providerOptionsFor(ACCURATE_MODEL_ID)).toEqual({ anthropic: { thinking: { type: "between_tools" }, effort: "medium" } });
    // AI_MODEL_EXTRACT can name any model; unknown ids keep the old options.
    expect(providerOptionsFor("claude-opus-5-5")).toEqual({ anthropic: { thinking: { type: "disabled" } } });
  });

  it("follows the resolved id, so an AI_MODEL_EXTRACT Sonnet gets the Sonnet options", () => {
    vi.stubEnv("AI_MODEL_EXTRACT", "claude-sonnet-5-5");
    try {
      expect(providerOptionsFor(modelIdFor("extract", "fast"))).toEqual(providerOptionsFor(ACCURATE_MODEL_ID));
      expect(providerOptionsFor(modelIdFor("suggest", "fast"))).toEqual(providerOptionsFor(DEFAULT_MODEL_ID));
      expect(providerOptionsFor(`us.anthropic.${ACCURATE_MODEL_ID}-v1`)).toEqual(providerOptionsFor(ACCURATE_MODEL_ID));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reaches the API as between_tools thinking at medium effort for Sonnet 5.5", async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const model = createAnthropic({ apiKey: "sk-ant-x" })(ACCURATE_MODEL_ID);
      await Promise.resolve(
        model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }], providerOptions: providerOptionsFor(ACCURATE_MODEL_ID) }),
      ).catch(() => undefined);
    } finally {
      vi.unstubAllGlobals();
    }
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(body.thinking).toEqual({ type: "between_tools" });
    expect(body.output_config).toMatchObject({ effort: "medium" });
  });
});
