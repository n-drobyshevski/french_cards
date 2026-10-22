import { anthropic } from "@ai-sdk/anthropic";
import { describe, expect, it, vi } from "vitest";
import { isAiConfigured, providerFor } from "./model";

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
