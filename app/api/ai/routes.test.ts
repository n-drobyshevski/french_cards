import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({ value: { ok: true, user: { id: "user-1", email: "me@example.com" } } as Record<string, unknown> }));
vi.mock("@/lib/supabase/server", () => ({ checkAiAccess: vi.fn(async () => access.value) }));

const ai = vi.hoisted(() => ({ streamText: vi.fn(), generateText: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("ai")>()), ...ai }));

import { resetRateLimits } from "@/lib/ai/rate-limit";
import { POST as classify } from "./classify/route";
import { POST as extract } from "./extract/route";
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
