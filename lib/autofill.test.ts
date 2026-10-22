import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LookupResponse } from "./ai/schemas";
import { autofillConjugation, autofillOrigin, FillError } from "./autofill";
import { clearHistory, saveLookup } from "./context";

const word = { fr: "kiffer", ru: "тащиться", pos: "verb" as const };
const lookup = (fr: string, origin: string | null): LookupResponse => ({
  found: true,
  q: fr,
  direction: "fr",
  fr,
  pos: "verb",
  gender: "none",
  slang_level: 1,
  verlan: false,
  note: null,
  origin,
  translations: [{ ru: "тащиться", share: 100 }],
  synonyms: [],
  conjugation: null,
});
const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const six = (s: string) => Array.from({ length: 6 }, (_, i) => `${s}${i}`);

beforeEach(async () => {
  await clearHistory();
});

describe("autofillOrigin", () => {
  it("takes the origin from the «Контекст» history without a request", async () => {
    await saveLookup({ q: "Kiffer", lookup: lookup("kiffer", "от арабского kif"), context: null });
    const fetchImpl = reply({});
    expect(await autofillOrigin(word, { fetchImpl })).toBe("от арабского kif");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("asks /api/ai/fill otherwise (a history entry for another headword does not count)", async () => {
    await saveLookup({ q: "kiffer", lookup: lookup("kiffer bien", "не то"), context: null });
    const fetchImpl = reply({ field: "origin", value: "от арабского kif „кайф“" });
    expect(await autofillOrigin(word, { fetchImpl })).toBe("от арабского kif „кайф“");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/ai/fill");
    expect(JSON.parse(init.body as string)).toEqual({ field: "origin", fr: "kiffer", ru: "тащиться", pos: "verb" });
  });

  it("says so when there is nothing to fill in", async () => {
    await expect(autofillOrigin(word, { fetchImpl: reply({ field: "origin", value: null }) })).rejects.toMatchObject({ fillCode: "none" });
    await expect(autofillOrigin(word, { fetchImpl: reply({ error: "upstream_error" }, 502) })).rejects.toBeInstanceOf(FillError);
  });
});

describe("autofillConjugation", () => {
  it("returns a full conjugation, refuses a partial one", async () => {
    const full = { auxiliary: "avoir", remark: null, tenses: { present: six("p"), passe_compose: six("c"), imparfait: six("i"), futur: six("f") } };
    expect(await autofillConjugation(word, { fetchImpl: reply({ field: "conjugation", value: full }) })).toEqual(full);
    const partial = { ...full, tenses: { ...full.tenses, futur: six("f").slice(1) } };
    await expect(autofillConjugation(word, { fetchImpl: reply({ field: "conjugation", value: partial }) })).rejects.toMatchObject({ fillCode: "none" });
  });
});
