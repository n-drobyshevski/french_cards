import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnrichResult } from "./ai/schemas";
import { ENRICH_CHUNK_MAX } from "./ai/schemas";
import { db } from "./db";
import { createFolder } from "./folders";
import {
  applyEnrichChanges,
  buildEnrichPlan,
  countEnrichCandidates,
  EnrichError,
  ENRICH_CONCURRENCY,
  ENRICH_REQUEST_SIZE,
  enrichFraction,
  enrichmentPatch,
  enrichWords,
  type EnrichProgress,
  fillSavedWords,
  folderPatch,
  loadEnrichCandidates,
  mergeChanges,
  planChanges,
  postEnrich,
  runEnrichPlan,
  toEnrichWords,
} from "./enrich";
import { updateSettings } from "./settings";
import { addWord, getWord, softDeleteWord, updateWord, updateWords } from "./words";

const NOW = new Date("2026-10-22T10:00:00.000Z");

function result(id: string, over: Partial<EnrichResult> = {}): EnrichResult {
  return {
    id,
    pos: "noun",
    gender: "f",
    slang_level: 2,
    verlan: false,
    example_fr: `Exemple ${id}.`,
    example_ru: `Пример ${id}.`,
    confidence: "high",
    folder: null,
    folder_alternatives: [],
    new_folder: null,
    ...over,
  };
}

/** A fetch that answers every request with results for the words it was sent. */
function fakeFetch(make: (id: string) => EnrichResult | null = (id) => result(id)) {
  return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const { words } = JSON.parse(String(init?.body)) as { words: { id: string }[] };
    const results = words.map((w) => make(w.id)).filter(Boolean);
    return Response.json({ results });
  });
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("network", () => {
  it("cleans the request and drops words without both sides", () => {
    expect(
      toEnrichWords([
        { id: "a", fr: "  la   caisse ", ru: "тачка", note: " " },
        { id: "b", fr: "chelou", ru: "" },
        { id: "a", fr: "again", ru: "снова" },
      ]),
    ).toEqual([{ id: "a", fr: "la caisse", ru: "тачка", note: null }]);
  });

  it("chunks the words and collects results by id", async () => {
    const fetchImpl = fakeFetch((id) => (id === "w3" ? null : result(id)));
    const words = Array.from({ length: ENRICH_REQUEST_SIZE + 5 }, (_, i) => ({ id: `w${i}`, fr: `mot${i}`, ru: `слово${i}` }));
    const progress: number[] = [];
    const out = await enrichWords(words, { fetchImpl, onProgress: (done) => progress.push(done) });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(JSON.parse(String(init?.body)).words.length).toBeLessThanOrEqual(ENRICH_REQUEST_SIZE);
    }
    expect(ENRICH_REQUEST_SIZE).toBeLessThanOrEqual(ENRICH_CHUNK_MAX);
    expect(out.size).toBe(words.length - 1);
    expect(out.has("w3")).toBe(false);
    expect(progress.at(-1)).toBe(words.length);
  });

  it("reports the opening 0 / n and every batch through onStage, keeping onProgress", async () => {
    const fetchImpl = fakeFetch();
    const words = Array.from({ length: ENRICH_REQUEST_SIZE * 2 + 3 }, (_, i) => ({ id: `w${i}`, fr: `mot${i}`, ru: `слово${i}` }));
    const stages: EnrichProgress[] = [];
    const progress: [number, number][] = [];
    await enrichWords(words, { fetchImpl, onStage: (p) => stages.push(p), onProgress: (d, t) => progress.push([d, t]) });
    expect(stages[0]).toEqual({ words: words.length, wordsDone: 0, done: 0, total: 3, batch: [] });
    expect(stages).toHaveLength(4);
    expect(stages.slice(1).map((p) => p.done)).toEqual([1, 2, 3]);
    expect(stages.at(-1)).toMatchObject({ wordsDone: words.length, done: 3, total: 3 });
    // Each batch carries its own results; together they are every word once.
    const ids = stages.flatMap((p) => p.batch.map((r) => r.id));
    expect(new Set(ids).size).toBe(words.length);
    // The bar only moves forward.
    const fractions = stages.map(enrichFraction);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
    expect(fractions.at(-1)).toBe(1);
    expect(progress.at(-1)).toEqual([words.length, words.length]);
    expect(enrichFraction({ done: 0, total: 0 })).toBe(1);
  });

  it("keeps at most ENRICH_CONCURRENCY requests in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const answer = fakeFetch();
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return answer(url, init);
    });
    const words = Array.from({ length: ENRICH_REQUEST_SIZE * (ENRICH_CONCURRENCY + 2) }, (_, i) => ({ id: `w${i}`, fr: `mot${i}`, ru: `слово${i}` }));
    const out = await enrichWords(words, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(ENRICH_CONCURRENCY + 2);
    expect(peak).toBe(ENRICH_CONCURRENCY);
    expect(out.size).toBe(words.length);
  });

  it("stops sending requests once one has failed", async () => {
    const answer = fakeFetch();
    let calls = 0;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (++calls === 1) return new Response("{}", { status: 500 });
      await new Promise((r) => setTimeout(r, 5));
      return answer(url, init);
    });
    const words = Array.from({ length: ENRICH_REQUEST_SIZE * (ENRICH_CONCURRENCY * 3) }, (_, i) => ({ id: `w${i}`, fr: `mot${i}`, ru: `слово${i}` }));
    await expect(enrichWords(words, { fetchImpl, retries: 0 })).rejects.toBeInstanceOf(EnrichError);
    // Only the first wave went out; nothing after the failure.
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(ENRICH_CONCURRENCY);
  });

  it("sends larger requests when asked to", async () => {
    const fetchImpl = vi.fn(fakeFetch());
    const words = Array.from({ length: 50 }, (_, i) => ({ id: `w${i}`, fr: `mot${i}`, ru: `слово${i}` }));
    await enrichWords(words, { fetchImpl, requestSize: 50 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries after 429 and maps errors", async () => {
    const sleep = vi.fn(async () => {});
    const once = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(Response.json({ results: [result("a")] }));
    expect(await postEnrich([{ id: "a", fr: "x", ru: "y" }], { fetchImpl: once, sleep })).toHaveLength(1);
    expect(sleep).toHaveBeenCalledWith(2000, undefined);
    const denied = vi.fn(async () => Response.json({ error: "unauthenticated" }, { status: 401 }));
    await expect(postEnrich([{ id: "a", fr: "x", ru: "y" }], { fetchImpl: denied })).rejects.toMatchObject({ code: "auth" });
    const broken = vi.fn(async () => new Response("oops", { status: 502 }));
    await expect(postEnrich([{ id: "a", fr: "x", ru: "y" }], { fetchImpl: broken })).rejects.toBeInstanceOf(EnrichError);
  });
});

describe("enrichmentPatch", () => {
  const word = { example_fr: null, slang_level: 0 as const, verlan: false, pos: "other" as const, gender: "none" as const };

  it("sets only the allowed fields that change", () => {
    expect(enrichmentPatch(word, result("a"), { slang: true, example: true, pos: true })).toEqual({
      slang_level: 2,
      verlan: false,
      example_fr: "Exemple a.",
      example_ru: "Пример a.",
      pos: "noun",
      gender: "f",
    });
    expect(enrichmentPatch(word, result("a"), { slang: false, example: false, pos: false })).toEqual({});
  });

  it("never replaces an example or a known part of speech", () => {
    const filled = { ...word, example_fr: "Le mien.", pos: "verb" as const, slang_level: 2 as const };
    expect(enrichmentPatch(filled, result("a"), { slang: true, example: true, pos: true })).toEqual({});
  });
});

describe("fillSavedWords", () => {
  it("fills words that were not touched since the save", async () => {
    const quick = await addWord({ fr: "la caisse", ru: "тачка" }, NOW);
    const edited = await addWord({ fr: "chelou", ru: "стрёмный" }, NOW);
    const gone = await addWord({ fr: "relou", ru: "занудный" }, NOW);
    await updateWord(edited.id, { note: "моё" }, new Date(NOW.getTime() + 1000));
    await softDeleteWord(gone.id);
    const scope = { slang: true, example: true, pos: true };
    const n = await fillSavedWords([quick, edited, gone].map((word) => ({ word, scope })), { fetchImpl: fakeFetch() });
    expect(n).toBe(1);
    expect(await getWord(quick.id)).toMatchObject({ slang_level: 2, pos: "noun", gender: "f", example_fr: `Exemple ${quick.id}.` });
    expect(await getWord(edited.id)).toMatchObject({ slang_level: 0, example_fr: null });
  });

  it("follows Settings «ИИ»: only what is switched on, with the chosen model", async () => {
    await updateSettings({ slang_detect_enabled: false, examples_enabled: false, auto_sort_enabled: false });
    const word = await addWord({ fr: "la caisse", ru: "тачка" }, NOW);
    const fetchImpl = fakeFetch();
    const all = { slang: true, example: true, pos: true, folder: true };
    expect(await fillSavedWords([{ word, scope: all }], { fetchImpl })).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();

    await updateSettings({ slang_detect_enabled: true, ai_model: "accurate" });
    let body: Record<string, unknown> = {};
    const spy = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return fakeFetch()(url, init);
    });
    expect(await fillSavedWords([{ word, scope: all }], { fetchImpl: spy })).toBe(1);
    expect(body.model).toBe("accurate");
    expect(body.folders).toBeUndefined();
    expect(await getWord(word.id)).toMatchObject({ slang_level: 2, example_fr: null, folder_id: null });
  });

  it("keeps a level the user set in the form", async () => {
    const word = await addWord({ fr: "la caisse", ru: "тачка", slang_level: 3 }, NOW);
    await fillSavedWords([{ word, scope: { slang: false, example: true, pos: true } }], { fetchImpl: fakeFetch() });
    expect(await getWord(word.id)).toMatchObject({ slang_level: 3, example_fr: `Exemple ${word.id}.` });
  });
});

describe("theme after saving", () => {
  it("files an Inbox word into an existing theme, never a new or low-confidence one", () => {
    const folders = [{ id: "f-den", slug: "dengi" }];
    const inbox = { folder_id: null };
    expect(folderPatch(inbox, result("a", { folder: "dengi", confidence: "med" }), folders)).toEqual({
      folder_id: "f-den",
      folder_source: "auto",
      folder_confidence: "med",
    });
    expect(folderPatch(inbox, result("a", { folder: "dengi", confidence: "low" }), folders)).toEqual({});
    expect(folderPatch(inbox, result("a", { folder: "NEW" }), folders)).toEqual({});
    expect(folderPatch({ folder_id: "f-x" }, result("a", { folder: "dengi" }), folders)).toEqual({});
  });

  it("quick save: sends the themes and files the word when automatic sorting is on", async () => {
    const dengi = await createFolder({ name: "Деньги" }, NOW);
    const word = await addWord({ fr: "la thune", ru: "бабки" }, NOW);
    let sentFolders: unknown;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { words: { id: string }[]; folders?: { slug: string }[] };
      sentFolders = body.folders;
      return Response.json({ results: body.words.map((w) => result(w.id, { folder: dengi.slug })) });
    });
    await fillSavedWords([{ word, scope: { slang: true, example: true, pos: true, folder: true } }], { fetchImpl });
    expect(sentFolders).toEqual([{ slug: dengi.slug, name: "Деньги", description: null }]);
    expect(await getWord(word.id)).toMatchObject({ folder_id: dengi.id, folder_source: "auto", folder_confidence: "high", slang_level: 2 });

    await updateSettings({ auto_sort_enabled: false });
    const other = await addWord({ fr: "le fric", ru: "деньги" }, NOW);
    await fillSavedWords([{ word: other, scope: { slang: true, example: true, pos: true, folder: true } }], { fetchImpl });
    expect(sentFolders).toBeUndefined();
    expect(await getWord(other.id)).toMatchObject({ folder_id: null, slang_level: 2 });
  });
});

describe("«Дополнить карточки»", () => {
  it("lists words without an example and hand-typed words with an undetected level", async () => {
    const manual = await addWord({ fr: "la caisse", ru: "тачка", source: "manual" }, NOW);
    const suggested = await addWord({ fr: "chelou", ru: "стрёмный", source: "suggest", slang_level: 2, example_fr: "Il est chelou." }, NOW);
    const noExample = await addWord({ fr: "le keuf", ru: "мент", source: "suggest", slang_level: 2 }, new Date(NOW.getTime() + 1000));
    const candidates = await loadEnrichCandidates();
    expect(candidates.map((w) => w.id)).toEqual([noExample.id, manual.id]);
    expect(await countEnrichCandidates()).toEqual({ total: 2, noExample: 2 });
    expect(candidates.some((w) => w.id === suggested.id)).toBe(false);
  });

  it("proposes only what Settings «ИИ» allow", async () => {
    const manual = await addWord({ fr: "la caisse", ru: "тачка", source: "manual" }, NOW);
    const suggested = await addWord({ fr: "le keuf", ru: "мент", source: "suggest", slang_level: 2 }, NOW);
    const onlySlang = { slang: true, examples: false };
    expect((await loadEnrichCandidates(onlySlang)).map((w) => w.id)).toEqual([manual.id]);
    expect(await countEnrichCandidates(onlySlang)).toEqual({ total: 1, noExample: 0 });
    const results = new Map([[manual.id, result(manual.id)], [suggested.id, result(suggested.id)]]);
    const plan = buildEnrichPlan([manual, suggested], results, onlySlang);
    expect(plan.examples).toEqual([]);
    expect(plan.slang.map((c) => c.word.id)).toEqual([manual.id]);
    expect(await countEnrichCandidates({ slang: false, examples: false })).toEqual({ total: 0, noExample: 0 });
  });

  it("runEnrichPlan: candidates, batches through onStage, then the plan", async () => {
    const manual = await addWord({ fr: "la caisse", ru: "тачка", source: "manual" }, NOW);
    await addWord({ fr: "chelou", ru: "стрёмный", source: "suggest", slang_level: 2, example_fr: "Il est chelou." }, NOW);
    const fetchImpl = fakeFetch((id) => result(id, { slang_level: 1 }));
    const stages: EnrichProgress[] = [];
    const run = await runEnrichPlan({ fetchImpl, model: "fast", prefs: { slang: true, examples: true }, onStage: (p) => stages.push(p) });
    expect(stages.map((p) => [p.wordsDone, p.words, p.done, p.total])).toEqual([
      [0, 1, 0, 1],
      [1, 1, 1, 1],
    ]);
    expect(run.more).toBe(0);
    expect(run.plan.examples.map((c) => c.word.id)).toEqual([manual.id]);
    expect(run.plan.slang.map((c) => c.word.id)).toEqual([manual.id]);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({ model: "fast" });

    // Nothing to look at: no request, an empty plan.
    const none = vi.fn();
    const empty = await runEnrichPlan({ fetchImpl: none, prefs: { slang: false, examples: false }, model: "fast" });
    expect(none).not.toHaveBeenCalled();
    expect(planChanges(empty.plan)).toEqual([]);
  });

  it("plans examples and levels, applies the picked ones and undoes them", async () => {
    const manual = await addWord({ fr: "la caisse", ru: "тачка", source: "manual" }, NOW);
    const detected = await addWord({ fr: "le keuf", ru: "мент", source: "suggest", slang_level: 2, verlan: true }, NOW);
    const neutral = await addWord({ fr: "la voiture", ru: "машина", source: "import", example_fr: "Ma voiture." }, NOW);
    const words = await loadEnrichCandidates();
    const results = new Map([
      [manual.id, result(manual.id, { slang_level: 1 })],
      [detected.id, result(detected.id, { slang_level: 3 })],
      [neutral.id, result(neutral.id, { slang_level: 0 })],
    ]);
    const plan = buildEnrichPlan(words, results);
    expect(plan.examples.map((c) => c.word.id).sort()).toEqual([manual.id, detected.id].sort());
    // A detected level is never second-guessed; a neutral result changes nothing.
    expect(plan.slang.map((c) => c.word.id)).toEqual([manual.id]);
    expect(plan.slang[0].patch).toEqual({ slang_level: 1, verlan: false, pos: "noun", gender: "f" });

    const picked = planChanges(plan).filter((c) => c.word.id === manual.id);
    expect(mergeChanges(picked).apply).toEqual([
      { id: manual.id, patch: { example_fr: `Exemple ${manual.id}.`, example_ru: `Пример ${manual.id}.`, slang_level: 1, verlan: false, pos: "noun", gender: "f" } },
    ]);
    const undo = await applyEnrichChanges(picked, new Date(NOW.getTime() + 5000));
    expect(await getWord(manual.id)).toMatchObject({ slang_level: 1, pos: "noun", example_fr: `Exemple ${manual.id}.` });
    expect(await getWord(detected.id)).toMatchObject({ slang_level: 2, example_fr: null });

    await updateWords(undo);
    expect(await getWord(manual.id)).toMatchObject({ slang_level: 0, pos: "other", gender: "none", example_fr: null, example_ru: null });
  });
});
