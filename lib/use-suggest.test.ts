import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Suggestion, SuggestLine } from "./ai/schemas";
import {
  errorKindForStatus,
  mergeStreaming,
  narrowSuggestions,
  normalizeQuery,
  planSuggest,
  SuggestController,
  suggestionMatches,
  toFolderInputs,
  type SuggestBasis,
} from "./use-suggest";

function sug(fr: string, ru: string, extra: Partial<Suggestion> = {}): Suggestion {
  return {
    fr,
    ru,
    note: null,
    example_fr: null,
    example_ru: null,
    pos: "verb",
    gender: "none",
    slang_level: 2,
    verlan: false,
    folder: "INBOX",
    folder_alternatives: [],
    new_folder: null,
    confidence: "high",
    ...extra,
  };
}

const CASSER = sug("se casser", "свалить, сбежать");
const CASSER_TETE = sug("se casser la tête", "ломать голову");
const CASSE_CROUTE = sug("le casse-croûte", "перекус", { pos: "noun", gender: "m" });
const THUNE = sug("la thune", "бабки, деньги", { pos: "noun", gender: "f" });

describe("normalizeQuery", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeQuery("  se   cass ")).toBe("se cass");
  });
  it("caps the length at 80 characters", () => {
    expect(normalizeQuery("a".repeat(120))).toHaveLength(80);
  });
});

describe("suggestionMatches", () => {
  it("matches French by substring, ignoring case and accents", () => {
    expect(suggestionMatches(CASSE_CROUTE, "casse-crou", "fr")).toBe(true);
    expect(suggestionMatches(CASSE_CROUTE, "CASSE-CROU", "fr")).toBe(true);
    expect(suggestionMatches(sug("être vénère", "злой"), "etre vene", "fr")).toBe(true);
  });
  it("matches across apostrophe variants", () => {
    expect(suggestionMatches(sug("l’oseille", "бабки"), "l'os", "fr")).toBe(true);
  });
  it("ignores a missing article on the query side", () => {
    expect(suggestionMatches(THUNE, "thun", "fr")).toBe(true);
  });
  it("matches the Russian side for Russian input", () => {
    expect(suggestionMatches(THUNE, "деньг", "ru")).toBe(true);
    expect(suggestionMatches(THUNE, "деньг", "fr")).toBe(false);
    expect(suggestionMatches(sug("chelou", "стрёмный"), "стремн", "ru")).toBe(true);
  });
  it("rejects results the longer query no longer fits", () => {
    expect(suggestionMatches(CASSER, "se casser l", "fr")).toBe(false);
  });
});

describe("narrowSuggestions", () => {
  it("keeps only results that still contain the query, in order", () => {
    const narrowed = narrowSuggestions([CASSER, CASSE_CROUTE, CASSER_TETE], "se casser", "fr");
    expect(narrowed.map((s) => s.fr)).toEqual(["se casser", "se casser la tête"]);
  });
});

describe("planSuggest", () => {
  const basis = (over: Partial<SuggestBasis> = {}): SuggestBasis => ({
    query: "se cass",
    direction: "fr",
    results: [CASSER, CASSER_TETE],
    complete: true,
    ...over,
  });

  it("fetches with nothing kept when there is no earlier response", () => {
    expect(planSuggest(null, "se cass")).toEqual({ results: [], fetch: true });
  });

  it("skips the request when a complete response is only narrowed by a longer query", () => {
    const plan = planSuggest(basis(), "se casse");
    expect(plan.fetch).toBe(false);
    expect(plan.results).toEqual([CASSER, CASSER_TETE]);
  });

  it("skips the request for the same query", () => {
    expect(planSuggest(basis(), "se cass").fetch).toBe(false);
  });

  it("fetches but keeps the matching rows when some no longer match", () => {
    const plan = planSuggest(basis({ results: [CASSER, CASSER_TETE, CASSE_CROUTE] }), "se casser l");
    expect(plan.fetch).toBe(true);
    expect(plan.results).toEqual([CASSER_TETE]);
  });

  it("fetches when the earlier response was cut off", () => {
    const plan = planSuggest(basis({ complete: false }), "se casse");
    expect(plan.fetch).toBe(true);
    expect(plan.results).toEqual([CASSER, CASSER_TETE]);
  });

  it("fetches when the earlier response was empty", () => {
    expect(planSuggest(basis({ results: [] }), "se casse")).toEqual({ results: [], fetch: true });
  });

  it("fetches (keeping matches) when the user deleted characters", () => {
    const plan = planSuggest(basis({ query: "se casser" }), "se cass");
    expect(plan.fetch).toBe(true);
    expect(plan.results).toEqual([CASSER, CASSER_TETE]);
  });

  it("drops everything when the input language flips to Russian", () => {
    expect(planSuggest(basis(), "свалить")).toEqual({ results: [], fetch: true });
  });

  it("narrows Russian input on the Russian side", () => {
    const plan = planSuggest(basis({ query: "бабк", direction: "ru", results: [THUNE] }), "бабки");
    expect(plan).toEqual({ results: [THUNE], fetch: false });
  });
});

describe("mergeStreaming", () => {
  it("puts fresh rows first and fills with kept rows not repeated, up to 3", () => {
    const merged = mergeStreaming([sug("se casser", "уйти")], [CASSER, CASSER_TETE, CASSE_CROUTE]);
    expect(merged.map((s) => [s.fr, s.ru])).toEqual([
      ["se casser", "уйти"],
      ["se casser la tête", "ломать голову"],
      ["le casse-croûte", "перекус"],
    ]);
  });
  it("treats an article difference as the same lemma", () => {
    expect(mergeStreaming([sug("thune", "бабки")], [THUNE])).toHaveLength(1);
  });
});

describe("errorKindForStatus", () => {
  it("maps HTTP statuses to banner kinds", () => {
    expect(errorKindForStatus(429)).toBe("rate_limited");
    expect(errorKindForStatus(401)).toBe("unavailable");
    expect(errorKindForStatus(403)).toBe("unavailable");
    expect(errorKindForStatus(503)).toBe("unavailable");
    expect(errorKindForStatus(500)).toBe("failed");
  });
});

describe("toFolderInputs", () => {
  it("drops invalid or repeated slugs and trims text", () => {
    const out = toFolderInputs([
      { slug: "dengi", name: " Деньги ", description: "  про деньги " },
      { slug: "Bad Slug", name: "Плохая", description: null },
      { slug: "dengi", name: "Дубль", description: null },
      { slug: "eda", name: "Еда", description: "" },
      { slug: "pusto", name: "   ", description: null },
    ]);
    expect(out).toEqual([
      { slug: "dengi", name: "Деньги", description: "про деньги" },
      { slug: "eda", name: "Еда", description: null },
    ]);
  });
});

// ---------------------------------------------------------------------------------------

function ndjson(lines: SuggestLine[]): Response {
  return new Response(lines.map((l) => JSON.stringify(l)).join("\n") + "\n", {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

function streamed(results: Suggestion[]): Response {
  return ndjson([
    { type: "meta", direction: "fr" },
    ...results.map((suggestion, index) => ({ type: "suggestion" as const, index, suggestion })),
    { type: "done", count: results.length },
  ]);
}

describe("SuggestController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(respond: (q: string, signal: AbortSignal) => Response | Promise<Response>, online = true) {
    const calls: { q: string; signal: AbortSignal; body: Record<string, unknown> }[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const signal = init!.signal!;
      calls.push({ q: String(body.q), signal, body });
      return respond(String(body.q), signal);
    });
    const c = new SuggestController({ fetch: fetchImpl as unknown as typeof fetch, isOnline: () => online });
    return { c, calls, fetchImpl };
  }

  it("stays idle under 3 characters", () => {
    const { c, fetchImpl } = setup(() => streamed([]));
    c.setQuery("se");
    vi.advanceTimersByTime(1000);
    expect(c.getSnapshot().status).toBe("idle");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("debounces keystrokes into one request with the documented body", async () => {
    const { c, calls } = setup(() => streamed([CASSER]));
    c.setFolders([{ slug: "dengi", name: "Деньги", description: null }]);
    c.setQuery("se c");
    vi.advanceTimersByTime(100);
    c.setQuery("se ca");
    vi.advanceTimersByTime(100);
    c.setQuery("se cas");
    expect(c.getSnapshot().status).toBe("loading");
    vi.advanceTimersByTime(299);
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({
      q: "se cas",
      direction: "auto",
      folders: [{ slug: "dengi", name: "Деньги", description: null }],
      model: "fast",
      max: 3,
      register: "any",
      notes: true,
    });
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("done"));
    expect(c.getSnapshot().results).toEqual([CASSER]);
  });

  it("marks only the request itself as requesting, not the debounce", async () => {
    const { c } = setup(() => streamed([CASSER]));
    c.setQuery("se cas");
    expect(c.getSnapshot()).toMatchObject({ status: "loading", requesting: false });
    vi.advanceTimersByTime(300);
    expect(c.getSnapshot()).toMatchObject({ status: "loading", requesting: true });
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("done"));
    expect(c.getSnapshot().requesting).toBe(false);
  });

  it("new settings preferences ask again and cap the rows shown", async () => {
    const { c, calls } = setup(() => streamed([CASSER, sug("se casser la tête", "ломать голову")]));
    c.setQuery("se cas", { immediate: true });
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("done"));
    expect(c.getSnapshot().results).toHaveLength(2);
    c.setPreferences({ model: "accurate", max: 1, register: "slang", notes: false });
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toMatchObject({ model: "accurate", max: 1, register: "slang", notes: false });
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("done"));
    expect(c.getSnapshot().results).toEqual([CASSER]);
    // Same preferences again: nothing to do.
    c.setPreferences({ model: "accurate", max: 1, register: "slang", notes: false });
    expect(calls).toHaveLength(2);
  });

  it("aborts the request in flight on the next keystroke", async () => {
    const pending: (() => void)[] = [];
    const { c, calls } = setup(
      (q, signal) =>
        new Promise<Response>((resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          pending.push(() => resolve(streamed(q === "kiff" ? [sug("kiffer", "тащиться")] : [])));
        }),
    );
    c.setQuery("kif", { immediate: true });
    expect(calls).toHaveLength(1);
    c.setQuery("kiff");
    expect(calls[0].signal.aborted).toBe(true);
    vi.advanceTimersByTime(300);
    expect(calls).toHaveLength(2);
    pending[1]();
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("done"));
    expect(c.getSnapshot().results.map((s) => s.fr)).toEqual(["kiffer"]);
    expect(c.getSnapshot().query).toBe("kiff");
  });

  it("keeps matching results while loading, then narrows locally without a request", async () => {
    const { c, calls } = setup((q) => streamed(q === "se cass" ? [CASSER, CASSER_TETE] : [CASSE_CROUTE]));
    c.setQuery("se cass", { immediate: true });
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("done"));

    c.setQuery("se casse");
    expect(c.getSnapshot()).toMatchObject({ status: "done", results: [CASSER, CASSER_TETE] });
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(1);

    c.setQuery("se casser l");
    expect(c.getSnapshot()).toMatchObject({ status: "loading", results: [CASSER_TETE] });
    vi.advanceTimersByTime(300);
    expect(calls).toHaveLength(2);
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("done"));
    expect(c.getSnapshot().results).toEqual([CASSE_CROUTE]);
  });

  it("answers a repeated query from the cache", async () => {
    const { c, calls } = setup((q) => streamed(q === "chelou" ? [sug("chelou", "стрёмный")] : [THUNE]));
    c.setQuery("chelou", { immediate: true });
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("done"));
    c.setQuery("thune", { immediate: true });
    await vi.waitFor(() => expect(c.getSnapshot().results).toEqual([THUNE]));
    c.setQuery("chelou");
    expect(c.getSnapshot()).toMatchObject({ status: "done", results: [sug("chelou", "стрёмный")] });
    expect(calls).toHaveLength(2);
  });

  it("forces a request for an exact lemma even when narrowing would cover it", async () => {
    const { c, calls } = setup(() => streamed([CASSER, CASSER_TETE]));
    c.setQuery("se cass", { immediate: true });
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("done"));
    c.setQuery("se casser", { force: true });
    expect(calls).toHaveLength(2);
    expect(c.getSnapshot().status).toBe("loading");
  });

  it("keeps rows received before an error line", async () => {
    const { c } = setup(() =>
      ndjson([
        { type: "meta", direction: "fr" },
        { type: "suggestion", index: 0, suggestion: THUNE },
        { type: "error", error: "upstream_error" },
      ]),
    );
    c.setQuery("thune", { immediate: true });
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("error"));
    expect(c.getSnapshot()).toMatchObject({ error: "failed", results: [THUNE] });
  });

  it("reports HTTP refusals by kind", async () => {
    const { c } = setup(() => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }));
    c.setQuery("thune", { immediate: true });
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("error"));
    expect(c.getSnapshot().error).toBe("rate_limited");
  });

  it("treats a network failure as offline", async () => {
    const { c } = setup(() => {
      throw new TypeError("Failed to fetch");
    });
    c.setQuery("thune", { immediate: true });
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("error"));
    expect(c.getSnapshot().error).toBe("offline");
  });

  it("does not request while the browser is offline, and retries on demand", async () => {
    let online = false;
    const fetchImpl = vi.fn(async () => streamed([THUNE]));
    const c = new SuggestController({ fetch: fetchImpl as unknown as typeof fetch, isOnline: () => online });
    c.setQuery("thune");
    expect(c.getSnapshot()).toMatchObject({ status: "error", error: "offline" });
    vi.advanceTimersByTime(1000);
    expect(fetchImpl).not.toHaveBeenCalled();
    online = true;
    c.retry();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("done"));
  });

  it("decides offline before the wait: going offline during the debounce or the request shows the notice at once", async () => {
    let online = true;
    const held: AbortSignal[] = [];
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          held.push(init!.signal!);
          init!.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const c = new SuggestController({ fetch: fetchImpl as unknown as typeof fetch, isOnline: () => online });
    // Lost during the debounce: no request, the notice instead of a wait.
    c.setQuery("thune");
    online = false;
    vi.advanceTimersByTime(300);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(c.getSnapshot()).toMatchObject({ status: "error", error: "offline", requesting: false });

    // Lost while the request is in flight (the window's `offline` event): aborted, notice at once.
    online = true;
    c.retry();
    expect(c.getSnapshot()).toMatchObject({ status: "loading", requesting: true });
    online = false;
    c.goOffline();
    expect(held[0].aborted).toBe(true);
    expect(c.getSnapshot()).toMatchObject({ status: "error", error: "offline" });
    // Not waiting: nothing to turn into a notice.
    c.goOffline();
    expect(c.getSnapshot().error).toBe("offline");
  });

  it("does nothing while disabled and picks the query up when enabled", async () => {
    const { c, calls } = setup(() => streamed([THUNE]));
    c.setEnabled(false);
    c.setQuery("thune");
    vi.advanceTimersByTime(1000);
    expect(c.getSnapshot()).toMatchObject({ status: "idle", query: "thune" });
    expect(calls).toHaveLength(0);
    c.setEnabled(true);
    expect(calls).toHaveLength(1);
    await vi.waitFor(() => expect(c.getSnapshot().status).toBe("done"));
  });

  it("notifies subscribers and stops after cancel", () => {
    const { c, calls } = setup(() => streamed([]));
    const listener = vi.fn();
    const unsubscribe = c.subscribe(listener);
    c.setQuery("thune");
    expect(listener).toHaveBeenCalled();
    c.cancel();
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveLength(0);
    expect(c.getSnapshot().status).toBe("idle");
    unsubscribe();
  });
});
