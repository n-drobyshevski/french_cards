import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { LookupResponse } from "./ai/schemas";
import { cleanQuery, clearHistory, getLookup, HISTORY_MAX, queryKey, requestContext, requestLookup, saveLookup } from "./context";
import { db } from "./db";

const lookup = (fr: string): LookupResponse => ({
  found: true,
  q: fr,
  direction: "fr",
  fr,
  pos: "verb",
  gender: "none",
  slang_level: 1,
  verlan: false,
  note: null,
  translations: [{ ru: "тащиться", share: 100 }],
  synonyms: [],
  conjugation: null,
});

beforeEach(async () => {
  await clearHistory();
});

describe("history", () => {
  it("one entry per query, whatever the accents, case and spaces", async () => {
    await saveLookup({ q: "  Kiffer ", lookup: lookup("kiffer"), context: null }, new Date("2026-10-22T10:00:00Z"));
    await saveLookup({ q: "kiffer", lookup: lookup("kiffer"), context: { examples: [], sources: 2 } }, new Date("2026-10-22T11:00:00Z"));
    expect(await db.lookups.count()).toBe(1);
    expect((await getLookup("KIFFER"))?.context).toEqual({ examples: [], sources: 2 });
    expect(queryKey("Été  ")).toBe("ete");
    expect(cleanQuery("  a \n  b ")).toBe("a b");
  });

  it("keeps the newest HISTORY_MAX entries", async () => {
    for (let i = 0; i < HISTORY_MAX + 3; i++) {
      await saveLookup({ q: `mot${i}`, lookup: lookup(`mot${i}`), context: null }, new Date(Date.UTC(2026, 9, 22, 0, i)));
    }
    expect(await db.lookups.count()).toBe(HISTORY_MAX);
    expect(await getLookup("mot0")).toBeUndefined();
    expect(await getLookup(`mot${HISTORY_MAX + 2}`)).toBeDefined();
  });
});

describe("requests", () => {
  it("posts the cleaned query and the lookup's senses", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify(url.endsWith("lookup") ? lookup("kiffer") : { examples: [], sources: 0 }), { status: 200 });
    }) as unknown as typeof fetch;
    await requestLookup("  kiffer  ", { fetchImpl, model: "accurate" });
    await requestContext(lookup("kiffer"), { fetchImpl });
    expect(calls).toEqual([
      { url: "/api/ai/lookup", body: { q: "kiffer", model: "accurate" } },
      { url: "/api/ai/context", body: { fr: "kiffer", meanings: ["тащиться"] } },
    ]);
  });

  it("maps a 401 to a Russian message", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401 })) as unknown as typeof fetch;
    await expect(requestLookup("kiffer", { fetchImpl })).rejects.toMatchObject({ code: "auth", message: "Войдите, чтобы искать" });
  });
});
