import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ value: { ok: true, user: { id: "user-1", email: "me@example.com" } } as Record<string, unknown> }));
vi.mock("@/lib/supabase/server", () => ({ checkAiAccess: vi.fn(async () => access.value) }));

const ai = vi.hoisted(() => ({ streamText: vi.fn(), generateText: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), ...ai }));

import { resetRateLimits } from "@/lib/ai/rate-limit";
import { POST as anki } from "./anki/route";
import { POST as classify } from "./classify/route";
import { POST as context } from "./context/route";
import { POST as enrich } from "./enrich/route";
import { POST as example } from "./example/route";
import { POST as extract } from "./extract/route";
import { POST as lookup } from "./lookup/route";
import { POST as suggest } from "./suggest/route";

const json = (body: unknown, init: RequestInit = {}) =>
  new Request("http://localhost/api/ai/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...init });

async function lines(res: Response) {
  const text = await res.text();
  return text.trim().split("\n").map((l) => JSON.parse(l));
}

/** A streamText result whose elementStream yields `elements`, optionally ending with a provider error. */
function fakeStream(elements: unknown[], error?: Error) {
  return (opts: { onError?: (e: { error: unknown }) => void }) => ({
    elementStream: (async function* () {
      for (const e of elements) yield e;
      if (error) opts.onError?.({ error });
    })(),
  });
}

const suggestion = (fr: string, extra: Record<string, unknown> = {}) => ({
  fr,
  ru: "перевод",
  note: null,
  example_fr: null,
  example_ru: null,
  pos: "verb",
  gender: "none",
  slang_level: "fam",
  verlan: false,
  folder: "INBOX",
  folder_alternatives: [],
  new_folder: null,
  confidence: "high",
  ...extra,
});

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  access.value = { ok: true, user: { id: "user-1", email: "me@example.com" } };
  resetRateLimits();
  ai.streamText.mockReset();
  ai.generateText.mockReset();
});

describe("guard", () => {
  it("returns the access error before anything else", async () => {
    access.value = { ok: false, status: 401, error: "unauthenticated", user: null };
    const res = await suggest(json({ q: "cass" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
    expect(ai.streamText).not.toHaveBeenCalled();
  });

  // proxy.ts lets /api/ai/* through, so every route must answer a denied caller itself.
  it.each([
    ["suggest", suggest],
    ["extract", extract],
    ["classify", classify],
    ["enrich", enrich],
    ["example", example],
  ])("%s answers 401/403 itself without calling the model", async (_, route) => {
    access.value = { ok: false, status: 401, error: "unauthenticated", user: null };
    const res = await route(json({}));
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    access.value = { ok: false, status: 403, error: "forbidden", user: null };
    expect((await route(json({}))).status).toBe(403);
    expect(ai.streamText).not.toHaveBeenCalled();
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  it("503 without an API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect((await suggest(json({ q: "cass" }))).status).toBe(503);
  });

  it("429 with Retry-After once the bucket is empty", async () => {
    ai.streamText.mockImplementation(fakeStream([]));
    let last: Response | null = null;
    for (let i = 0; i < 21; i++) last = await suggest(json({ q: "cass" }));
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

describe("POST /api/ai/suggest", () => {
  it("400 on invalid input", async () => {
    expect((await suggest(new Request("http://x", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await suggest(json({ q: "" }))).status).toBe(400);
    expect((await suggest(json({ q: "ok", direction: "de" }))).status).toBe(400);
    expect((await suggest(json({ q: "ok", folders: [{ slug: "Bad Slug", name: "x" }] }))).status).toBe(400);
    expect(ai.streamText).not.toHaveBeenCalled();
  });

  it("streams meta, up to 3 normalized unique suggestions, then done", async () => {
    ai.streamText.mockImplementation(
      fakeStream([
        suggestion("se casser", { slang_level: "arg", folder: "povsednevnoe", folder_alternatives: ["ghost"] }),
        suggestion("Se casser"),
        suggestion("se casser la tête", { pos: "expression" }),
        suggestion("casser les couilles", { slang_level: "vulg" }),
        suggestion("casser la croûte"),
      ]),
    );
    const res = await suggest(json({ q: "se cass", folders: [{ slug: "povsednevnoe", name: "Повседневное" }] }));
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const out = await lines(res);
    expect(out[0]).toEqual({ type: "meta", direction: "fr" });
    expect(out.filter((l) => l.type === "suggestion").map((l) => l.suggestion.fr)).toEqual([
      "se casser",
      "se casser la tête",
      "casser les couilles",
    ]);
    expect(out[1].suggestion).toMatchObject({ slang_level: 2, folder: "povsednevnoe", folder_alternatives: [] });
    expect(out[3].suggestion.slang_level).toBe(3);
    expect(out.at(-1)).toEqual({ type: "done", count: 3 });

    const call = ai.streamText.mock.calls[0][0];
    expect(call.providerOptions).toEqual({ anthropic: { thinking: { type: "disabled" } } });
    expect(call.instructions.providerOptions).toEqual({ anthropic: { cacheControl: { type: "ephemeral" } } });
    expect(call.temperature).toBeUndefined();
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("follows the settings: model, how many suggestions, notes", async () => {
    ai.streamText.mockImplementation(fakeStream([suggestion("se casser", { note: "груб." }), suggestion("se casser la tête")]));
    const out = await lines(await suggest(json({ q: "se cass", model: "accurate", max: 1, notes: false, register: "slang" })));
    const rows = out.filter((l) => l.type === "suggestion");
    expect(rows).toHaveLength(1);
    expect(rows[0].suggestion.note).toBeNull();
    expect(out.at(-1)).toEqual({ type: "done", count: 1 });
    const call = ai.streamText.mock.calls[0][0];
    expect(call.model.modelId).toBe("claude-sonnet-5-5");
    expect(call.prompt).toContain("Return at most 1 suggestion.");
    expect((await suggest(json({ q: "ok", model: "claude-opus-5-5" }))).status).toBe(400);
  });

  it("detects Russian input and reports upstream errors", async () => {
    ai.streamText.mockImplementation(fakeStream([suggestion("la thune")], new Error("boom")));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await lines(await suggest(json({ q: "деньги" })));
    spy.mockRestore();
    expect(out[0]).toEqual({ type: "meta", direction: "ru" });
    expect(out[1].type).toBe("suggestion");
    expect(out.at(-1)).toEqual({ type: "error", error: "upstream_error" });
    expect(ai.streamText.mock.calls[0][0].prompt).toContain("Russian");
  });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]);

function multipart(files: { bytes: Uint8Array; type?: string }[], folders?: string) {
  const form = new FormData();
  for (const [i, f] of files.entries()) form.append("images", new Blob([f.bytes as Uint8Array<ArrayBuffer>], { type: f.type ?? "image/png" }), `shot${i}.png`);
  if (folders !== undefined) form.append("folders", folders);
  return new Request("http://localhost/api/ai/extract", { method: "POST", body: form });
}

describe("POST /api/ai/extract", () => {
  it("validates count, size, magic bytes and folders", async () => {
    expect((await extract(json({}))).status).toBe(400); // not multipart
    expect((await extract(multipart([])).then((r) => r.status))).toBe(400);
    expect((await extract(multipart(Array.from({ length: 5 }, () => ({ bytes: PNG }))))).status).toBe(400);
    expect((await extract(multipart([{ bytes: new Uint8Array([0x47, 0x49, 0x46, 0x38]), type: "image/png" }]))).status).toBe(415);
    const big = new Uint8Array(1.5 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await extract(multipart([{ bytes: big }]))).status).toBe(413);
    expect((await extract(multipart([{ bytes: PNG }], "{not json"))).status).toBe(400);
    expect((await extract(multipart([{ bytes: PNG }], JSON.stringify([{ slug: "UP", name: "x" }])))).status).toBe(400);
    expect(ai.streamText).not.toHaveBeenCalled();
  });

  it("sends sniffed image parts and streams normalized, deduped rows", async () => {
    const row = (fr: string, extra: Record<string, unknown> = {}) => ({
      fr,
      fr_as_seen: null,
      ru: "мент",
      ru_suggested: false,
      note: null,
      pos: "noun",
      gender: "m",
      slang_level: "arg",
      verlan: true,
      provenance: "in_text",
      confidence: "high",
      issue: null,
      folder: "politsiya",
      new_folder: null,
      ...extra,
    });
    ai.streamText.mockImplementation(fakeStream([row("le keuf", { fr_as_seen: "keufs" }), row("keuf"), row("la meuf", { gender: "f", folder: "ghost" })]));
    const res = await extract(
      multipart([{ bytes: PNG }, { bytes: JPEG, type: "image/png" }, { bytes: WEBP }], JSON.stringify([{ slug: "politsiya", name: "Полиция" }])),
    );
    expect(res.status).toBe(200);
    const out = await lines(res);
    expect(out[0]).toEqual({ type: "meta", images: 3 });
    expect(out.filter((l) => l.type === "item").map((l) => [l.item.fr, l.item.folder, l.item.ru_suggested])).toEqual([
      ["le keuf", "politsiya", true],
      ["la meuf", "INBOX", true],
    ]);
    expect(out[1].item.fr_as_seen).toBe("keufs");
    expect(out.at(-1)).toEqual({ type: "done", count: 2 });

    const content = ai.streamText.mock.calls[0][0].messages[0].content;
    expect(content.filter((p: { type: string }) => p.type === "file").map((p: { mediaType: string }) => p.mediaType)).toEqual([
      "image/png",
      "image/jpeg",
      "image/webp",
    ]);
  });

  it("follows the settings: model and notes", async () => {
    ai.streamText.mockImplementation(
      fakeStream([
        {
          fr: "le keuf",
          fr_as_seen: null,
          ru: "мент",
          ru_suggested: false,
          note: "верлан от flic",
          example_fr: null,
          example_ru: null,
          pos: "noun",
          gender: "m",
          slang_level: "arg",
          verlan: true,
          provenance: "pair",
          confidence: "high",
          issue: null,
          folder: "INBOX",
          new_folder: null,
        },
      ]),
    );
    const form = new FormData();
    form.append("images", new Blob([PNG], { type: "image/png" }), "a.png");
    form.append("model", "accurate");
    form.append("notes", "false");
    const out = await lines(await extract(new Request("http://localhost/api/ai/extract", { method: "POST", body: form })));
    expect(out[1].item.note).toBeNull();
    const call = ai.streamText.mock.calls[0][0];
    expect(call.model.modelId).toBe("claude-sonnet-5-5");
    const wrong = new FormData();
    wrong.append("images", new Blob([PNG], { type: "image/png" }), "a.png");
    wrong.append("model", "opus");
    expect((await extract(new Request("http://localhost/api/ai/extract", { method: "POST", body: wrong }))).status).toBe(400);
  });
});

describe("POST /api/ai/classify", () => {
  const folders = [{ slug: "dengi", name: "Деньги", description: null }];

  it("400 on invalid input", async () => {
    expect((await classify(json({ mode: "nope" }))).status).toBe(400);
    expect((await classify(json({ mode: "assign", words: [], folders }))).status).toBe(400);
    const tooMany = Array.from({ length: 151 }, (_, i) => ({ id: `w${i}`, fr: "x", ru: "y" }));
    expect((await classify(json({ mode: "assign", words: tooMany, folders }))).status).toBe(400);
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  it("assign: returns ids with rules applied", async () => {
    ai.generateText.mockResolvedValue({
      output: { assignments: [{ ref: "w1", folder: "dengi", confidence: "high" }, { ref: "w2", folder: "dengi", confidence: "low" }] },
    });
    const res = await classify(
      json({ mode: "assign", words: [{ id: "a", fr: "raquer", ru: "платить" }, { id: "b", fr: "la daronne", ru: "мать" }], folders }),
    );
    expect(await res.json()).toEqual({
      assignments: [
        { id: "a", folder: "dengi", confidence: "high" },
        { id: "b", folder: "INBOX", confidence: "low" },
      ],
    });
  });

  it("taxonomy: keeps locked folders and maps example refs", async () => {
    ai.generateText.mockResolvedValue({
      output: {
        folders: [{ existing: "NEW", name: "Транспорт", description: "Машины", examples: ["w1", "w2", "w3"] }],
      },
    });
    const words = ["la caisse", "le tromé", "la bécane"].map((fr, i) => ({ id: `id${i}`, fr, ru: "x" }));
    const res = await classify(json({ mode: "taxonomy", words, folders: [{ ...folders[0], locked: true }] }));
    const body = await res.json();
    expect(body.folders.map((f: { slug: string; status: string }) => [f.slug, f.status])).toEqual([
      ["dengi", "keep"],
      ["transport", "new"],
    ]);
    expect(body.folders[1].example_ids).toEqual(["id0", "id1", "id2"]);
    expect(body.removed).toEqual([]);
  });

  it("502 when the model call fails", async () => {
    ai.generateText.mockRejectedValue(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await classify(json({ mode: "assign", words: [{ id: "a", fr: "raquer", ru: "платить" }], folders }));
    spy.mockRestore();
    expect(res.status).toBe(502);
  });
});

describe("POST /api/ai/enrich", () => {
  it("400 on invalid input", async () => {
    expect((await enrich(json({ words: [] }))).status).toBe(400);
    expect((await enrich(json({ words: [{ id: "a", fr: "chelou", ru: "" }] }))).status).toBe(400);
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  it("maps refs back to ids and normalizes the fields", async () => {
    ai.generateText.mockResolvedValue({
      output: {
        items: [
          { ref: "w2", pos: "adj", gender: "f", slang_level: "arg", verlan: true, example_fr: " Il est chelou. ", example_ru: "Он стрёмный.", confidence: "high" },
          { ref: "w9", pos: "noun", gender: "m", slang_level: "vulg", verlan: false, example_fr: null, example_ru: null, confidence: "low" },
          { ref: "w1", pos: "noun", gender: "f", slang_level: "fam", verlan: false, example_fr: null, example_ru: "лишнее", confidence: "high" },
        ],
      },
    });
    const res = await enrich(json({ words: [{ id: "a", fr: "la caisse", ru: "тачка" }, { id: "b", fr: "chelou", ru: "стрёмный" }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [
        { id: "a", pos: "noun", gender: "f", slang_level: 1, verlan: false, example_fr: null, example_ru: null, confidence: "high", folder: null, folder_alternatives: [], new_folder: null, custom: [] },
        { id: "b", pos: "adj", gender: "none", slang_level: 2, verlan: true, example_fr: "Il est chelou.", example_ru: "Он стрёмный.", confidence: "high", folder: null, folder_alternatives: [], new_folder: null, custom: [] },
      ],
    });
    const call = ai.generateText.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("w1\tla caisse\tтачка");
    expect(call.prompt).not.toContain("Themes:");
    expect(call.prompt).not.toContain("Custom fields");
  });

  it("with custom fields: short refs in the prompt and the schema, values mapped back to the definition ids", async () => {
    const item = { pos: "adj", gender: "none", slang_level: "arg", verlan: true, example_fr: null, example_ru: null, confidence: "high" };
    ai.generateText.mockResolvedValue({
      output: {
        items: [
          { ...item, ref: "w1", custom: [{ field: "f1", value: " louche, bizarre " }, { field: "f2", value: null }, { field: "f5", value: "x" }] },
          { ...item, ref: "w2", custom: [{ field: "f2", value: "[mœf]" }] },
        ],
      },
    });
    const fields = [
      { id: "def-synonyms-0001", name: "Синонимы", hint: "2–3 синонима на французском" },
      { id: "def-ipa-0002", name: "Произношение", hint: null },
    ];
    const words = [
      { id: "a", fr: "chelou", ru: "стрёмный" },
      { id: "b", fr: "la meuf", ru: "девушка" },
    ];
    const res = await enrich(json({ words, fields }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results.map((r: { custom: unknown }) => r.custom)).toEqual([
      [{ id: "def-synonyms-0001", value: "louche, bizarre" }],
      [{ id: "def-ipa-0002", value: "[mœf]" }],
    ]);
    const call = ai.generateText.mock.calls[0][0];
    expect(call.prompt).toContain("Custom fields (2):\nf1\tСинонимы — 2–3 синонима на французском\nf2\tПроизношение\n\nCards (2)");
    expect(call.prompt).not.toContain("def-ipa-0002");
    expect(call.maxOutputTokens).toBe(16000);
    expect((await enrich(json({ words, fields: [fields[0], fields[0]] }))).status).toBe(400);
  });

  it("with themes: picks one per word, kept inside the learner's slugs", async () => {
    const item = { pos: "noun", gender: "f", slang_level: "fam", verlan: false, example_fr: null, example_ru: null, confidence: "high" };
    ai.generateText.mockResolvedValue({
      output: {
        items: [
          { ...item, ref: "w1", folder: "dengi", folder_alternatives: ["dengi", "eda", "unknown"], new_folder: null },
          { ...item, ref: "w2", folder: "NEW", folder_alternatives: [], new_folder: { slug: "transport", name: "транспорт", description: "Машины." } },
          { ...item, ref: "w3", folder: "unknown", folder_alternatives: [], new_folder: null },
        ],
      },
    });
    const folders = [
      { slug: "dengi", name: "Деньги", description: null },
      { slug: "eda", name: "Еда", description: null },
    ];
    const words = [
      { id: "a", fr: "la thune", ru: "бабки" },
      { id: "b", fr: "la caisse", ru: "тачка" },
      { id: "c", fr: "truc", ru: "штука" },
    ];
    const body = await (await enrich(json({ words, folders }))).json();
    expect(body.results.map((r: { folder: string; folder_alternatives: string[] }) => [r.folder, r.folder_alternatives])).toEqual([
      ["dengi", ["eda"]],
      ["NEW", []],
      ["INBOX", []],
    ]);
    expect(body.results[1].new_folder).toMatchObject({ slug: "transport", name: "Транспорт" });
    const call = ai.generateText.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain("Themes:\n- dengi: Деньги");
  });

  it("502 when the model call fails", async () => {
    ai.generateText.mockRejectedValue(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await enrich(json({ words: [{ id: "a", fr: "chelou", ru: "стрёмный" }] }));
    spy.mockRestore();
    expect(res.status).toBe(502);
  });
});

describe("POST /api/ai/example", () => {
  it("400 on invalid input", async () => {
    expect((await example(json({ fr: "chelou", ru: "" }))).status).toBe(400);
    expect((await example(json({ fr: "chelou", ru: "стрёмный", avoid: Array(7).fill("x") }))).status).toBe(400);
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  it("returns a new example and lists the existing ones in the prompt", async () => {
    ai.generateText.mockResolvedValue({ output: { example_fr: "  J'ai reçu un message chelou. ", example_ru: "Мне пришло стрёмное сообщение." } });
    const res = await example(json({ fr: "chelou", ru: "стрёмный", note: "верлан от louche", avoid: ["Il est chelou, ton pote."] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ example: { fr: "J'ai reçu un message chelou.", ru: "Мне пришло стрёмное сообщение." } });
    const call = ai.generateText.mock.calls[0][0] as { prompt: string; temperature?: number };
    expect(call.prompt).toContain("French: chelou\nRussian: стрёмный\nNote: верлан от louche");
    expect(call.prompt).toContain("- Il est chelou, ton pote.");
    expect(call.temperature).toBeUndefined();
  });

  it("null when the model repeats an existing example or gives none", async () => {
    ai.generateText.mockResolvedValue({ output: { example_fr: "il est CHELOU ton pote !", example_ru: "x" } });
    expect(await (await example(json({ fr: "chelou", ru: "стрёмный", avoid: ["Il est chelou, ton pote."] }))).json()).toEqual({ example: null });
    ai.generateText.mockResolvedValue({ output: { example_fr: null, example_ru: null } });
    expect(await (await example(json({ fr: "chelou", ru: "стрёмный" }))).json()).toEqual({ example: null });
  });

  it("502 when the model call fails", async () => {
    ai.generateText.mockRejectedValue(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await example(json({ fr: "chelou", ru: "стрёмный" }));
    spy.mockRestore();
    expect(res.status).toBe(502);
  });
});

describe("POST /api/ai/anki", () => {
  const notes = [
    { ref: "1001", fields: [{ name: "Front", text: "bagnole" }, { name: "Back", text: "car (slang)" }], tags: ["argot"] },
    { ref: "1002", fields: [{ name: "Recto", text: "свалить" }, { name: "Verso", text: "se casser" }] },
    { ref: "1003", fields: [{ name: "Front", text: "Subjonctif après bien que" }] },
  ];
  const row = (ref: string, extra: Record<string, unknown> = {}) => ({
    ref,
    skip: false,
    fr_field: "Front",
    fr: "la bagnole",
    fr_as_seen: "bagnole",
    ru: "тачка, машина",
    ru_suggested: true,
    note: "англ.: car (slang)",
    example_fr: null,
    example_ru: null,
    pos: "noun",
    gender: "f",
    slang_level: "fam",
    verlan: false,
    confidence: "high",
    issue: null,
    folder: "INBOX",
    new_folder: null,
    ...extra,
  });

  it("returns the access error before validating", async () => {
    access.value = { ok: false, status: 401, error: "unauthenticated", user: null };
    const res = await anki(json({ notes: [] }));
    expect(res.status).toBe(401);
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  it("400 on invalid input", async () => {
    const many = Array.from({ length: 27 }, (_, i) => ({ ref: String(i), fields: [{ name: "Front", text: "mot" }] }));
    expect((await anki(json({ notes: [{ ref: "1", fields: [] }] }))).status).toBe(400);
    expect((await anki(json({ notes: [{ ref: "1", fields: [{ name: "Front", text: "  " }] }] }))).status).toBe(400);
    expect((await anki(json({ notes: [notes[0], notes[0]] }))).status).toBe(400);
    expect((await anki(json({ notes: [] }))).status).toBe(400);
    expect((await anki(json({ notes, model: "opus" }))).status).toBe(400);
    const res = await anki(json({ notes: many }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "bad_request", details: [expect.stringContaining("notes")] });
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  it("maps refs back to note ids, keeps skips, drops unknown refs and accepts a new theme", async () => {
    ai.generateText.mockResolvedValue({
      output: {
        items: [
          row("n1", { folder: "NEW", new_folder: { slug: "transport", name: "Транспорт", description: "Машины." } }),
          row("n7"),
          row("n2", { fr_field: "Verso", fr: "se casser", fr_as_seen: null, ru: "свалить", ru_suggested: false, pos: "verb", slang_level: "arg", folder: "povsednevnoe" }),
          row("n3", { skip: true, fr_field: null, fr: "", ru: "", issue: "правило грамматики, не слово" }),
        ],
      },
    });
    const res = await anki(json({ notes, folders: [{ slug: "povsednevnoe", name: "Повседневное" }], model: "accurate" }));
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.map((i: { ref: string; skip: boolean }) => [i.ref, i.skip])).toEqual([
      ["1001", false],
      ["1002", false],
      ["1003", true],
    ]);
    expect(items[0]).toMatchObject({ fr: "la bagnole", provenance: "fr_only", slang_level: 1, folder: "NEW", new_folder: { slug: "transport" } });
    expect(items[1]).toMatchObject({ fr_field: "Verso", provenance: "pair", gender: "none", slang_level: 2, folder: "povsednevnoe" });
    expect(items[2]).toMatchObject({ issue: "правило грамматики, не слово", folder: "INBOX" });

    const call = ai.generateText.mock.calls[0][0];
    expect(call.model.modelId).toBe("claude-sonnet-5-5");
    expect(call.maxOutputTokens).toBe(10000);
    expect(call.instructions.providerOptions).toEqual({ anthropic: { cacheControl: { type: "ephemeral" } } });
    expect(call.prompt).toContain('<note ref="n1">\nFront: bagnole\nBack: car (slang)\ntags: argot\n</note>');
    expect(call.prompt).toContain("- povsednevnoe: Повседневное");
    expect(call.prompt).not.toContain("1001");
    expect(call.prompt).not.toContain("Custom fields");
  });

  it("with custom fields: fills them per note; used_fields come back in the note's own spelling", async () => {
    ai.generateText.mockResolvedValue({
      output: {
        items: [
          row("n1", { used_fields: ["front", "BACK", "Ghost"], custom: [{ field: "f1", value: "[baɲɔl]" }] }),
          row("n2", { fr_field: "Verso", used_fields: ["Verso", "Recto"], custom: [{ field: "f1", value: null }] }),
          row("n3", { skip: true, used_fields: [], custom: [] }),
        ],
      },
    });
    const res = await anki(json({ notes, fields: [{ id: "def-ipa", name: "Произношение", hint: "МФА" }] }));
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.map((i: { used_fields: string[]; custom: unknown }) => [i.used_fields, i.custom])).toEqual([
      [["Front", "Back"], [{ id: "def-ipa", value: "[baɲɔl]" }]],
      [["Verso", "Recto"], []],
      [[], []],
    ]);
    const call = ai.generateText.mock.calls[0][0];
    expect(call.prompt).toContain("Custom fields (1):\nf1\tПроизношение — МФА\n\nNotes (3)");
    expect(call.maxOutputTokens).toBe(16000);
  });

  it("502 when the model call fails, 429 once the bucket is empty", async () => {
    ai.generateText.mockRejectedValue(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await anki(json({ notes }))).status).toBe(502);
    let last: Response | null = null;
    for (let i = 0; i < 15; i++) last = await anki(json({ notes }));
    spy.mockRestore();
    expect(last!.status).toBe(429);
    expect(Number(last!.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

describe("POST /api/ai/lookup", () => {
  const model = {
    found: true,
    fr: "kiffer",
    pos: "verb",
    gender: "none",
    slang_level: "fam",
    verlan: false,
    note: null,
    translations: [{ ru: "тащиться", share: 60 }, { ru: "нравиться", share: 40 }],
    synonyms: [{ fr: "adorer", ru: "обожать", slang_level: "neutral" }],
  };

  it("400 on an empty query", async () => {
    expect((await lookup(json({ q: "  " }))).status).toBe(400);
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  it("returns the cleaned entry and sends the query with its language", async () => {
    ai.generateText.mockResolvedValue({ output: model });
    const res = await lookup(json({ q: "тащиться" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ found: true, q: "тащиться", direction: "ru", fr: "kiffer", slang_level: 1, translations: [{ ru: "тащиться", share: 60 }, { ru: "нравиться", share: 40 }] });
    expect((ai.generateText.mock.calls[0][0] as { prompt: string }).prompt).toBe("Query (Russian): тащиться");
  });

  it("502 when the model call fails", async () => {
    ai.generateText.mockRejectedValue(new Error("down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await lookup(json({ q: "kiffer" }));
    spy.mockRestore();
    expect(res.status).toBe(502);
  });
});

describe("POST /api/ai/context", () => {
  const cited = (url: string, citedText: string) => ({ sourceType: "url", url, title: "Fil", providerMetadata: { anthropic: { citedText } } });

  it("searches the web, then keeps only sentences quoted from cited pages", async () => {
    ai.generateText
      .mockResolvedValueOnce({
        text: "...",
        sources: [cited("https://www.forum.exemple.fr/t/1", "Franchement je kiffe trop ce son."), { sourceType: "url", url: "https://autre.exemple.fr", title: null }],
      })
      .mockResolvedValueOnce({
        output: {
          examples: [
            { snippet: 1, fr: "Franchement je kiffe trop ce son.", hit: "kiffe", ru: "Честно, я тащусь от этого трека.", meaning: "тащиться", kind: "forum" },
            { snippet: 1, fr: "Je kiffe pas ce son du tout.", hit: "kiffe", ru: "Мне не нравится.", meaning: null, kind: "forum" },
          ],
        },
      });
    const res = await context(json({ fr: "kiffer", meanings: ["тащиться", "нравиться"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sources: 2,
      examples: [
        {
          fr: "Franchement je kiffe trop ce son.",
          ru: "Честно, я тащусь от этого трека.",
          hit: "kiffe",
          meaning: "тащиться",
          kind: "forum",
          url: "https://www.forum.exemple.fr/t/1",
          domain: "forum.exemple.fr",
          title: "Fil",
        },
      ],
    });
    const [searchCall, pickCall] = ai.generateText.mock.calls.map((c) => c[0] as { tools?: Record<string, unknown>; prompt: string; output?: unknown });
    expect(Object.keys(searchCall.tools ?? {})).toEqual(["web_search"]);
    expect(searchCall.prompt).toBe("Headword: kiffer\nSenses (Russian): тащиться | нравиться");
    expect(pickCall.tools).toBeUndefined();
    expect(pickCall.prompt).toContain("[1] (forum.exemple.fr — Fil) Franchement je kiffe trop ce son.");
  });

  it("no cited snippets: empty list without a second call", async () => {
    ai.generateText.mockResolvedValueOnce({ text: "Rien trouvé.", sources: [] });
    const res = await context(json({ fr: "kiffance" }));
    expect(await res.json()).toEqual({ examples: [], sources: 0 });
    expect(ai.generateText).toHaveBeenCalledTimes(1);
  });

  it("429 after 6 runs in a row", async () => {
    ai.generateText.mockResolvedValue({ text: "", sources: [] });
    let last: Response | null = null;
    for (let i = 0; i < 7; i++) last = await context(json({ fr: "kiffer" }));
    expect(last!.status).toBe(429);
  });
});
