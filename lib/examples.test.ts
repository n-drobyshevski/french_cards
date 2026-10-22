import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { cleanExamples, examplesPatch, MAX_EXAMPLES, requestExample, wordExamples } from "./examples";
import { addWord, updateWord } from "./words";

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("example lists", () => {
  it("cleans: trims, drops empty and repeated French sides, caps the list", () => {
    expect(
      cleanExamples([
        { fr: "  Il est   chelou. ", ru: " Он стрёмный. " },
        { fr: "", ru: "без французского" },
        { fr: "Il est chelou.", ru: "повтор" },
        { fr: "C'est chelou, ce bruit.", ru: "" },
      ]),
    ).toEqual([
      { fr: "Il est chelou.", ru: "Он стрёмный." },
      { fr: "C'est chelou, ce bruit.", ru: null },
    ]);
    expect(cleanExamples(Array.from({ length: 9 }, (_, i) => ({ fr: `phrase ${i}`, ru: null })))).toHaveLength(MAX_EXAMPLES);
  });

  it("the first example lives in example_fr / example_ru, the rest in extra_examples", () => {
    expect(examplesPatch([{ fr: "a", ru: "1" }, { fr: "b", ru: "" }])).toEqual({ example_fr: "a", example_ru: "1", extra_examples: [{ fr: "b", ru: null }] });
    expect(examplesPatch([])).toEqual({ example_fr: null, example_ru: null, extra_examples: [] });
    expect(wordExamples({ example_fr: "a", example_ru: null, extra_examples: [{ fr: "b", ru: "2" }] })).toEqual([
      { fr: "a", ru: null },
      { fr: "b", ru: "2" },
    ]);
    // Rows written before extra_examples existed.
    expect(wordExamples({ example_fr: null, example_ru: null })).toEqual([]);
  });

  it("words store and update their extra examples", async () => {
    const w = await addWord({ fr: "chelou", ru: "стрёмный", example_fr: "Il est chelou.", extra_examples: [{ fr: " C'est chelou. ", ru: null }] });
    expect(w.extra_examples).toEqual([{ fr: "C'est chelou.", ru: null }]);
    const next = await updateWord(w.id, examplesPatch([{ fr: "Un", ru: "1" }, { fr: "Deux", ru: "2" }, { fr: "Trois", ru: null }]));
    expect(next).toMatchObject({ example_fr: "Un", example_ru: "1", extra_examples: [{ fr: "Deux", ru: "2" }, { fr: "Trois", ru: null }] });
  });
});

describe("requestExample", () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("sends the card and the examples to avoid, returns the new one", async () => {
    const fetchImpl = reply(200, { example: { fr: "J'ai reçu un message chelou.", ru: "Мне пришло стрёмное сообщение." } });
    const found = await requestExample({ fr: " chelou ", ru: "стрёмный", note: "" }, ["Il est chelou."], { fetchImpl, model: "accurate" });
    expect(found).toEqual({ fr: "J'ai reçu un message chelou.", ru: "Мне пришло стрёмное сообщение." });
    const body = JSON.parse(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body));
    expect(body).toEqual({ fr: "chelou", ru: "стрёмный", note: null, avoid: ["Il est chelou."], model: "accurate" });
  });

  it("maps answers and failures to errors with a message", async () => {
    await expect(requestExample({ fr: "a", ru: "b" }, [], { fetchImpl: reply(200, { example: null }) })).rejects.toMatchObject({ code: "none" });
    await expect(requestExample({ fr: "a", ru: "b" }, [], { fetchImpl: reply(401, { error: "unauthenticated" }) })).rejects.toMatchObject({ code: "auth" });
    await expect(requestExample({ fr: "a", ru: "b" }, [], { fetchImpl: reply(503, { error: "not_configured" }) })).rejects.toMatchObject({ code: "unavailable" });
    await expect(requestExample({ fr: "a", ru: "b" }, [], { fetchImpl: reply(429, {}) })).rejects.toMatchObject({ code: "rate_limited" });
    await expect(requestExample({ fr: "a", ru: "b" }, [], { fetchImpl: reply(502, { error: "upstream_error" }) })).rejects.toThrow("Не получилось подобрать пример");
  });
});
