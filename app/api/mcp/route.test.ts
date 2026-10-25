import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildWord } from "@/lib/core/words";
import { createFakeRepo, type FakeRepo } from "@/lib/mcp/fake-repo";

const fake = vi.hoisted(() => ({ current: null as FakeRepo | null }));
vi.mock("@/lib/mcp/repo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mcp/repo")>()),
  createMcpRepo: vi.fn(() => fake.current!.repo),
}));

import { resetRateLimits } from "@/lib/ai/rate-limit";
import { CHAT_PLAYER_URI, MCP_APP_MIME } from "@/lib/core/chat-player";
import { CHAT_REVIEW_URI } from "@/lib/core/chat-review";
import { CHAT_PLAYER_HTML, CHAT_REVIEW_HTML } from "@/lib/mcp/chat-player-html";
import { DELETE, GET, OPTIONS, PATCH, POST, PUT } from "./[key]/route";

const SECRET = "test-secret-test-secret-test-secret-42";
const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  MCP_SECRET: SECRET,
  MCP_USER_ID: "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b",
  SUPABASE_SECRET_KEY: "sb_secret_test",
};
const saved: Record<string, string | undefined> = {};

const ctx = (key: string) => ({ params: Promise.resolve({ key }) });

let nextId = 1;
function rpc(key: string, method: string, params: unknown = {}, headers: Record<string, string> = {}) {
  return POST(
    new Request(`https://frenchcards.vercel.app/api/mcp/${key}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    }),
    ctx(key),
  );
}

/** The JSON-RPC message of a response, whether sent as JSON or as SSE frames. */
async function message(res: Response): Promise<{ result?: Record<string, unknown>; error?: unknown }> {
  const text = await res.text();
  if (!(res.headers.get("content-type") ?? "").includes("text/event-stream")) return JSON.parse(text);
  const frames = text
    .split(/\r?\n\r?\n/)
    .map((frame) =>
      frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n"),
    )
    .filter(Boolean)
    .map((data) => JSON.parse(data));
  const reply = frames.find((m) => "result" in m || "error" in m);
  if (!reply) throw new Error(`no JSON-RPC reply in ${text}`);
  return reply;
}

async function initialize(): Promise<string> {
  const res = await rpc(SECRET, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
  });
  expect(res.status).toBe(200);
  const body = await message(res);
  expect(body.result?.serverInfo).toMatchObject({ name: "kartochki" });
  expect(String(body.result?.instructions)).toMatch(/Карточки/);
  return String(body.result?.protocolVersion);
}

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  resetRateLimits();
  fake.current = createFakeRepo({
    words: [buildWord({ id: "w1", fr: "avoir le seum", ru: "беситься", slang_level: 1 }, new Date("2026-10-01T00:00:00Z"))],
  });
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("/api/mcp/[key]", () => {
  it("answers a plain 404 for a wrong key, and when the connector is not configured", async () => {
    const wrong = await rpc("not-the-secret", "initialize");
    expect(wrong.status).toBe(404);
    expect(wrong.headers.get("cache-control")).toBe("no-store");
    expect(await wrong.text()).toBe("Not Found");
    expect((await GET(new Request("https://frenchcards.vercel.app/api/mcp/x"), ctx("x"))).status).toBe(404);
    // Exported so neither Next's automatic OPTIONS (204 + Allow) nor its 405 can reveal the route for any key.
    const handlers = { OPTIONS, DELETE, PUT, PATCH };
    for (const [name, method] of Object.entries(handlers)) {
      expect((await method(new Request("https://frenchcards.vercel.app/api/mcp/x", { method: name }), ctx("x"))).status).toBe(404);
    }
    // With the right key the SDK answers the methods it doesn't serve.
    expect((await PUT(new Request(`https://frenchcards.vercel.app/api/mcp/${SECRET}`, { method: "PUT" }), ctx(SECRET))).status).toBe(405);

    delete process.env.MCP_SECRET;
    expect((await rpc(SECRET, "initialize")).status).toBe(404);
    process.env.MCP_SECRET = SECRET;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect((await rpc(SECRET, "initialize")).status).toBe(404);
  });

  it("initializes and lists the 31 tools with titles and annotations", async () => {
    const version = await initialize();
    const res = await rpc(SECRET, "tools/list", {}, { "mcp-protocol-version": version });
    expect(res.headers.get("cache-control")).toBe("no-store");
    const tools = (await message(res)).result?.tools as { name: string; title?: string; inputSchema: unknown; annotations?: Record<string, boolean> }[];
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "add_words",
        "create_exercise_set",
        "create_field",
        "create_folder",
        "delete_exercise_set",
        "delete_field",
        "delete_folder",
        "delete_words",
        "exercise_artifact",
        "exercise_material",
        "list_exercise_sets",
        "list_fields",
        "list_folders",
        "move_words",
        "play_exercises",
        "propose_levels",
        "propose_words",
        "restore_exercise_set",
        "restore_field",
        "restore_folder",
        "restore_moves",
        "restore_words",
        "save_exercise_result",
        "search_words",
        "set_word_levels",
        "study_summary",
        "update_field",
        "update_folder",
        "update_study_plan",
        "update_word",
        "update_words",
      ].sort(),
    );
    for (const t of tools) {
      expect(t.title).toBeTruthy();
      expect(t.inputSchema).toMatchObject({ type: "object" });
      expect(t.annotations?.openWorldHint).toBe(false);
      expect(typeof t.annotations?.readOnlyHint).toBe("boolean");
    }
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(byName.get("search_words")?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get("delete_words")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("serves the chat exercise player and the review page as MCP Apps that their tools point at", async () => {
    const version = await initialize();
    const h = { "mcp-protocol-version": version };
    const tools = (await message(await rpc(SECRET, "tools/list", {}, h))).result?.tools as { name: string; _meta?: Record<string, unknown> }[];
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(byName.get("play_exercises")?._meta).toMatchObject({ ui: { resourceUri: CHAT_PLAYER_URI } });
    expect(byName.get("save_exercise_result")?._meta).toEqual({ ui: { visibility: ["model", "app"] } });
    expect(byName.get("create_exercise_set")?._meta).toBeUndefined();
    expect(byName.get("propose_levels")?._meta).toMatchObject({ ui: { resourceUri: CHAT_REVIEW_URI } });
    expect(byName.get("propose_words")?._meta).toMatchObject({ ui: { resourceUri: CHAT_REVIEW_URI } });
    // The tools the review page calls keep the default visibility (the model and the app).
    for (const name of ["add_words", "set_word_levels", "delete_words"]) expect(byName.get(name)?._meta).toBeUndefined();
    const listed = (await message(await rpc(SECRET, "resources/list", {}, h))).result?.resources;
    expect(listed).toEqual([
      expect.objectContaining({ name: "exercise_player", uri: CHAT_PLAYER_URI, mimeType: MCP_APP_MIME }),
      expect.objectContaining({ name: "review_page", uri: CHAT_REVIEW_URI, mimeType: MCP_APP_MIME }),
    ]);
    const read = (await message(await rpc(SECRET, "resources/read", { uri: CHAT_PLAYER_URI }, h))).result?.contents as unknown[];
    expect(read).toEqual([{ uri: CHAT_PLAYER_URI, mimeType: MCP_APP_MIME, text: CHAT_PLAYER_HTML }]);
    const review = (await message(await rpc(SECRET, "resources/read", { uri: CHAT_REVIEW_URI }, h))).result?.contents as unknown[];
    expect(review).toEqual([{ uri: CHAT_REVIEW_URI, mimeType: MCP_APP_MIME, text: CHAT_REVIEW_HTML }]);
  });

  it("refuses subscriptions/listen at once instead of holding a stream open", async () => {
    const version = "2026-07-28";
    const res = await rpc(
      SECRET,
      "subscriptions/listen",
      {
        notifications: { toolsListChanged: true },
        _meta: { "io.modelcontextprotocol/protocolVersion": version, "io.modelcontextprotocol/clientCapabilities": {} },
      },
      { "mcp-protocol-version": version, "mcp-method": "subscriptions/listen" },
    );
    const reply = await Promise.race([message(res), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("stream left open")), 2000))]);
    expect(reply.error).toMatchObject({ message: "Subscription limit reached" });
  });

  it("gives propose_words the app's own origin, for the card's link back into the app", async () => {
    const version = await initialize();
    const args = { words: [{ fr: "avoir le seum", ru: "беситься" }, { fr: "la thune", ru: "бабки", pos: "noun", gender: "f" }], folder_chosen_by_user: false };
    const res = await rpc(SECRET, "tools/call", { name: "propose_words", arguments: args }, { "mcp-protocol-version": version });
    const result = (await message(res)).result as { isError?: boolean; structuredContent: { app_url: string; rows: { fr: string; checked: boolean }[] } };
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.app_url).toBe("https://frenchcards.vercel.app");
    expect(result.structuredContent.rows.map((r) => [r.fr, r.checked])).toEqual([
      ["avoir le seum", false],
      ["la thune", true],
    ]);
  });

  it("calls search_words against the repo", async () => {
    const version = await initialize();
    const res = await rpc(SECRET, "tools/call", { name: "search_words", arguments: { query: "seum" } }, { "mcp-protocol-version": version });
    const result = (await message(res)).result as { isError?: boolean; structuredContent: { total: number; words: { id: string; fr: string }[] } };
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.total).toBe(1);
    expect(result.structuredContent.words[0]).toMatchObject({ id: "w1", fr: "avoir le seum", slang_level: 1 });
  });
});
