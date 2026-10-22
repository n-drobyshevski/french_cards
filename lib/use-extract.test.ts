import { describe, expect, it } from "vitest";
import type { ExtractLine, VocabItem } from "@/lib/ai/schemas";
import { EXTRACT_URL, ExtractHttpError, errorFromResponse, extractFormData, foldersForExtract, streamExtract } from "./use-extract";

const item = (fr: string): VocabItem => ({
  fr,
  fr_as_seen: null,
  ru: "перевод",
  ru_suggested: false,
  note: null,
  pos: "other",
  gender: "none",
  slang_level: 1,
  verlan: false,
  provenance: "pair",
  confidence: "high",
  issue: null,
  folder: "INBOX",
  new_folder: null,
});

const tile = (name: string) => ({
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }),
  type: "image/webp" as const,
  width: 10,
  height: 10,
  source: 0,
  index: 0,
  count: 1,
  name,
});

function ndjson(lines: ExtractLine[], chunk = 7): Response {
  const text = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunk) controller.enqueue(bytes.slice(i, i + chunk));
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
}

describe("extractFormData", () => {
  it("repeats `images` in order and adds folders as JSON", async () => {
    const form = extractFormData({ tiles: [tile("a.webp"), tile("b.webp")] }, [{ slug: "dengi", name: "Деньги" }]);
    const files = form.getAll("images") as File[];
    expect(files.map((f) => f.name)).toEqual(["a.webp", "b.webp"]);
    expect(JSON.parse(form.get("folders") as string)).toEqual([{ slug: "dengi", name: "Деньги" }]);
  });

  it("omits folders when there are none", () => {
    expect(extractFormData({ tiles: [tile("a.webp")] }, []).has("folders")).toBe(false);
  });
});

describe("foldersForExtract", () => {
  it("drops invalid or repeated slugs and trims text", () => {
    const out = foldersForExtract([
      { slug: "dengi", name: " Деньги ", description: "x".repeat(400) },
      { slug: "Bad Slug", name: "Плохо" },
      { slug: "dengi", name: "Дубль" },
      { slug: "eda", name: "Еда", description: null },
    ]);
    expect(out).toEqual([
      { slug: "dengi", name: "Деньги", description: "x".repeat(300) },
      { slug: "eda", name: "Еда", description: null },
    ]);
  });
});

describe("streamExtract", () => {
  it("posts multipart to the extract route and yields parsed lines", async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen = { url, init };
      return ndjson([
        { type: "meta", images: 1 },
        { type: "item", index: 0, item: item("chelou") },
        { type: "item", index: 1, item: item("la meuf") },
        { type: "done", count: 2 },
      ]);
    }) as unknown as typeof fetch;
    const lines: ExtractLine[] = [];
    for await (const line of streamExtract({ tiles: [tile("a.webp")] }, [], { fetchImpl })) lines.push(line);
    expect(seen!.url).toBe(EXTRACT_URL);
    expect(seen!.init?.method).toBe("POST");
    expect(seen!.init?.body).toBeInstanceOf(FormData);
    expect(lines.map((l) => l.type)).toEqual(["meta", "item", "item", "done"]);
  });

  it("throws ExtractHttpError with the body and Retry-After", async () => {
    const fetchImpl = (async () =>
      Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "12" } })) as unknown as typeof fetch;
    const run = async () => {
      for await (const line of streamExtract({ tiles: [tile("a.webp")] }, [], { fetchImpl })) void line;
    };
    await expect(run()).rejects.toMatchObject({ status: 429, body: { error: "rate_limited" }, retryAfter: 12 });
    await expect(run()).rejects.toBeInstanceOf(ExtractHttpError);
  });

  it("tolerates a non-JSON error body (e.g. a proxy 413 page)", async () => {
    const fetchImpl = (async () => new Response("Request Entity Too Large", { status: 413 })) as unknown as typeof fetch;
    const run = async () => {
      for await (const line of streamExtract({ tiles: [tile("a.webp")] }, [], { fetchImpl })) void line;
    };
    await expect(run()).rejects.toMatchObject({ status: 413, body: null });
  });
});

describe("errorFromResponse", () => {
  it("maps statuses to Russian messages", () => {
    expect(errorFromResponse(401, { error: "unauthenticated" }).code).toBe("unauthenticated");
    expect(errorFromResponse(401, { error: "forbidden_email" }).code).toBe("forbidden");
    expect(errorFromResponse(403, { error: "local_only_mode" }).code).toBe("forbidden");
    expect(errorFromResponse(415, { error: "unsupported_image" }).message).toMatch(/PNG, JPEG и WebP/);
    expect(errorFromResponse(503, { error: "not_configured" }).retryable).toBe(false);
    expect(errorFromResponse(502, null).retryable).toBe(true);
  });

  it("says how long to wait when rate limited", () => {
    expect(errorFromResponse(429, { error: "rate_limited" }, 21).message).toBe("Слишком часто. Попробуйте через 21 секунду.");
    expect(errorFromResponse(429, { error: "rate_limited" }, 3).message).toBe("Слишком часто. Попробуйте через 3 секунды.");
    expect(errorFromResponse(429, { error: "rate_limited" }, 15).message).toBe("Слишком часто. Попробуйте через 15 секунд.");
    expect(errorFromResponse(429, { error: "rate_limited" }).retryAfter).toBeUndefined();
  });

  it("never mentions AI", () => {
    for (const status of [400, 401, 403, 413, 415, 429, 500, 502, 503, 418]) {
      expect(errorFromResponse(status, { error: "not_configured" }).message).not.toMatch(/ИИ|AI/);
    }
  });
});
