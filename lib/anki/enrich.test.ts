import { describe, expect, it, vi } from "vitest";
import { AiClientError } from "@/lib/ai-client";
import { AnkiEnrichError, enrichAnkiNotes, toAnkiRequestNote } from "./enrich";
import { ANKI_CHUNK_MAX, ANKI_FIELD_CHARS, ANKI_FIELDS_MAX, ANKI_TAGS_MAX, type AnkiItem, type AnkiNote } from "./types";

function note(
  id: string,
  fields: AnkiNote["fields"] = [
    { name: "Front", text: `mot ${id}` },
    { name: "Back", text: `слово ${id}` },
  ],
): AnkiNote {
  return { id, deckId: "d1", fields, tags: [], cards: [], templates: 1 };
}

function item(ref: string): AnkiItem {
  return {
    ref,
    skip: false,
    fr_field: "Front",
    fr: `mot ${ref}`,
    fr_as_seen: null,
    ru: `слово ${ref}`,
    ru_suggested: false,
    note: null,
    example_fr: null,
    example_ru: null,
    pos: "noun",
    gender: "m",
    slang_level: 0,
    verlan: false,
    provenance: "pair",
    confidence: "high",
    issue: null,
    folder: "INBOX",
    new_folder: null,
  };
}

type Body = { notes: { ref: string }[]; folders: unknown[]; model: string };

/** A fetch that answers each request with items for its notes, in reverse order, after `delay(chunk)` ms. */
function fakeFetch(delay: (index: number) => number = () => 0) {
  let calls = 0;
  return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const index = calls++;
    const { notes } = JSON.parse(String(init?.body)) as Body;
    await new Promise((r) => setTimeout(r, delay(index)));
    return Response.json({ items: notes.map((n) => item(n.ref)).reverse() });
  });
}

const opts = { folders: [{ slug: "dengi", name: "Деньги", description: null }], model: "fast" as const };

describe("toAnkiRequestNote", () => {
  it("trims fields and tags to the route's limits", () => {
    const fields = Array.from({ length: ANKI_FIELDS_MAX + 3 }, (_, i) => ({
      name: i === 1 ? " " : `F${i}`,
      text: i === 2 ? "  " : `t${i}`,
    }));
    const long = {
      ...note("1", [{ name: "Front", text: "x".repeat(ANKI_FIELD_CHARS + 50) }, ...fields]),
      tags: ["a", "a", " ", "b", "c", "d", "e", "f"],
    };
    const r = toAnkiRequestNote(long)!;
    expect(r.ref).toBe("1");
    expect(r.fields).toHaveLength(ANKI_FIELDS_MAX);
    expect(r.fields[0].text).toHaveLength(ANKI_FIELD_CHARS);
    expect(r.fields.map((f) => f.name)).toContain("Поле 3");
    expect(r.fields.map((f) => f.text)).not.toContain("");
    expect(r.tags).toEqual(["a", "b", "c", "d", "e"].slice(0, ANKI_TAGS_MAX));
    expect(toAnkiRequestNote(note("2", [{ name: "Front", text: "   " }]))).toBeNull();
    expect(toAnkiRequestNote(note("x".repeat(41)))).toBeNull();
  });
});

describe("enrichAnkiNotes", () => {
  it("sends 60 notes as 3 chunks, 3 at a time, and returns items in note order", async () => {
    // The first chunk answers last, so results arrive out of order.
    const fetchImpl = fakeFetch((i) => (i === 0 ? 30 : 0));
    const notes = Array.from({ length: 60 }, (_, i) => note(String(1000 + i)));
    const progress: [number, number][] = [];
    const out = await enrichAnkiNotes(notes, { ...opts, fetchImpl, onProgress: (d, t) => progress.push([d, t]) });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const sizes = fetchImpl.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as Body).notes.length);
    expect(sizes).toEqual([ANKI_CHUNK_MAX, ANKI_CHUNK_MAX, 10]);
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)) as Body;
    expect(body.model).toBe("fast");
    expect(body.folders).toEqual(opts.folders);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/ai/anki");
    expect(out.map((i) => i.ref)).toEqual(notes.map((n) => n.id));
    expect(progress[0]).toEqual([0, 60]);
    expect(progress.at(-1)).toEqual([60, 60]);
    expect(progress.map(([d]) => d)).toEqual([0, 25, 35, 60]);
  });

  it("skips empty notes and repeated ids, ignores items for notes it did not send", async () => {
    const sent: string[][] = [];
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent.push((JSON.parse(String(init?.body)) as Body).notes.map((n) => n.ref));
      return Response.json({ items: [item("2"), item("ghost"), item("1"), item("1")] });
    });
    const out = await enrichAnkiNotes([note("1"), note("2", [{ name: "Front", text: "" }]), note("1"), note("3")], {
      ...opts,
      fetchImpl,
    });
    expect(sent).toEqual([["1", "3"]]);
    expect(out.map((i) => i.ref)).toEqual(["1"]);
    expect(await enrichAnkiNotes([], { ...opts, fetchImpl })).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("waits out a 429 with Retry-After and tells the UI how long", async () => {
    const sleep = vi.fn(async () => {});
    const onRetry = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "7" } }))
      .mockResolvedValueOnce(Response.json({ items: [item("1")] }));
    const out = await enrichAnkiNotes([note("1")], { ...opts, fetchImpl, sleep, onRetry });
    expect(out).toHaveLength(1);
    expect(onRetry).toHaveBeenCalledWith(7);
    expect(sleep).toHaveBeenCalledWith(7000, undefined);
  });

  it("maps errors to AnkiEnrichError with a message to show", async () => {
    const denied = vi.fn(async () => Response.json({ error: "unauthenticated" }, { status: 401 }));
    await expect(enrichAnkiNotes([note("1")], { ...opts, fetchImpl: denied })).rejects.toMatchObject({
      code: "auth",
      message: "Войдите, чтобы импортировать колоду.",
    });
    const limited = vi.fn(async () => new Response("{}", { status: 429, headers: { "Retry-After": "1" } }));
    const error = await enrichAnkiNotes([note("1")], { ...opts, fetchImpl: limited, retries: 0 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnkiEnrichError);
    expect(error).toBeInstanceOf(AiClientError);
    expect(error).toMatchObject({ code: "rate_limited" });
    const off = vi.fn(async () => Response.json({ error: "not_configured" }, { status: 503 }));
    await expect(enrichAnkiNotes([note("1")], { ...opts, fetchImpl: off })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("stops on abort: before the first request and while waiting for Retry-After", async () => {
    const fetchImpl = fakeFetch();
    const aborted = new AbortController();
    aborted.abort();
    await expect(enrichAnkiNotes([note("1")], { ...opts, fetchImpl, signal: aborted.signal })).rejects.toMatchObject({
      code: "aborted",
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    const ctrl = new AbortController();
    const limited = vi.fn(async () => new Response("{}", { status: 429, headers: { "Retry-After": "5" } }));
    const run = enrichAnkiNotes([note("1")], {
      ...opts,
      fetchImpl: limited,
      signal: ctrl.signal,
      onRetry: () => queueMicrotask(() => ctrl.abort()),
    });
    await expect(run).rejects.toMatchObject({ code: "aborted" });
    expect(limited).toHaveBeenCalledTimes(1);
  });
});
