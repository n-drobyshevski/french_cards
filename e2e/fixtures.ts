import { expect, test, type Page, type Route } from "@playwright/test";

// Wire formats mirror lib/ai/schemas.ts (SuggestLine, ExtractLine, Suggestion, VocabItem, EnrichResponse, AnkiResponse).
// Kept as plain objects so e2e does not import app code.

// --- «План повторения» --------------------------------------------------------------------------

/**
 * The plan the specs were written against: the queue as before «План дня» (new cards oldest
 * first, after the reviews, RU→FR the day after FR→RU, one allowance of 20 new cards, no cap).
 * Shape of lib/core/study-plan.ts StudyPlan.
 */
export const LEGACY_PLAN = { new_words: 20, review_cap: null, new_order: "added", mix: "after", ru_fr: "together" } as const;

const PLAN_SEEDED_AT = "2000-01-01T00:00:00.000Z";

/**
 * Before the page loads: when the app opens its database, the synced `study_plan` row is set to
 * `plan`, in a transaction started before any of the app's, so its first read sees it. A row the
 * app saved (from Settings) is kept. `explicit` (a spec's own plan) also replaces the seeded
 * LEGACY_PLAN; without it, `window.__e2eStudyPlan = false` (`withoutLegacyPlan`) skips the seed.
 */
async function installStudyPlan(page: Page, plan: Record<string, unknown>, explicit: boolean) {
  await page.addInitScript(
    ({ value, explicit, seededAt }) => {
      const open = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (this: IDBFactory, ...args: Parameters<IDBFactory["open"]>) {
        const request = open.apply(this, args);
        if (args[0] === "kartochki") {
          request.addEventListener("success", () => {
            if (!explicit && (window as unknown as { __e2eStudyPlan?: boolean }).__e2eStudyPlan === false) return;
            const db = request.result;
            if (!db.objectStoreNames.contains("user_prefs")) return;
            const store = db.transaction("user_prefs", "readwrite").objectStore("user_prefs");
            const get = store.get("study_plan");
            get.onsuccess = () => {
              const row = get.result as { value: unknown; updated_at: string } | undefined;
              const seeded = row && row.updated_at === seededAt && JSON.stringify(row.value) !== JSON.stringify(value);
              if (!row || (explicit && seeded)) store.put({ id: "study_plan", value, updated_at: seededAt, deleted_at: null });
            };
          });
        }
        return request;
      };
    },
    { value: plan, explicit, seededAt: PLAN_SEEDED_AT },
  );
}

/** A spec's own «План повторения» (lib/core/study-plan.ts StudyPlan), stored before the app reads it. */
export async function seedStudyPlan(page: Page, plan: Record<string, unknown>) {
  await installStudyPlan(page, plan, true);
}

/** For a spec about «План дня» itself: no `study_plan` row is seeded (the app's own defaults). */
export async function withoutLegacyPlan(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __e2eStudyPlan?: boolean }).__e2eStudyPlan = false;
  });
}

// Every test of a spec that imports this file starts with LEGACY_PLAN, so the specs written before
// «План дня» keep their queue. The hook registers on the spec being loaded; Node caches modules per
// worker, so the file drops itself from the cache to run (and register) again for the next spec.
test.beforeEach(async ({ page }) => installStudyPlan(page, LEGACY_PLAN, false));
if (typeof require !== "undefined" && typeof __filename !== "undefined") delete require.cache[__filename];

export const NDJSON = "application/x-ndjson; charset=utf-8";

const ndjson = (lines: readonly unknown[]) => lines.map((l) => JSON.stringify(l)).join("\n") + "\n";

export interface SuggestionWire {
  fr: string;
  ru: string;
  note: string | null;
  example_fr: string | null;
  example_ru: string | null;
  pos: "noun" | "verb" | "adj" | "adv" | "expression" | "other";
  gender: "m" | "f" | "mf" | "none";
  slang_level: 0 | 1 | 2 | 3;
  verlan: boolean;
  /** Folder slug, "NEW" or "INBOX". */
  folder: string;
  folder_alternatives: string[];
  new_folder: { slug: string; name: string; description: string } | null;
  confidence: "high" | "med" | "low";
}

export const LA_THUNE: SuggestionWire = {
  fr: "la thune",
  ru: "бабки, деньги",
  note: "Синонимы: le fric, l'oseille",
  example_fr: "J'ai plus de thune.",
  example_ru: "У меня больше нет бабок.",
  pos: "noun",
  gender: "f",
  slang_level: 2,
  verlan: false,
  folder: "dengi",
  folder_alternatives: ["povsednevnoe"],
  new_folder: null,
  confidence: "high",
};

export const SE_CASSER_LA_TETE: SuggestionWire = {
  fr: "se casser la tête",
  ru: "ломать голову",
  note: null,
  example_fr: "Ne te casse pas la tête.",
  example_ru: "Не ломай голову.",
  pos: "expression",
  gender: "none",
  slang_level: 1,
  verlan: false,
  folder: "povsednevnoe",
  folder_alternatives: ["emotsii"],
  new_folder: null,
  confidence: "med",
};

/** Answers POST /api/ai/suggest with the given suggestions (whatever the query). */
export async function mockSuggest(page: Page, suggestions: readonly SuggestionWire[], onRequest?: (body: unknown) => void) {
  await page.route("**/api/ai/suggest", async (route: Route) => {
    onRequest?.(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: NDJSON,
      body: ndjson([
        { type: "meta", direction: "fr" },
        ...suggestions.map((suggestion, index) => ({ type: "suggestion", index, suggestion })),
        { type: "done", count: suggestions.length },
      ]),
    });
  });
}

export interface VocabItemWire extends Omit<SuggestionWire, "folder_alternatives"> {
  fr_as_seen: string | null;
  ru_suggested: boolean;
  provenance: "pair" | "fr_only" | "ru_only" | "in_text";
  issue: string | null;
}

export const vocab = (fields: Partial<VocabItemWire> & Pick<VocabItemWire, "fr" | "ru">): VocabItemWire => ({
  fr_as_seen: null,
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
  ru_suggested: false,
  ...fields,
});

export const EXTRACTED: VocabItemWire[] = [
  vocab({ fr: "le fric", ru: "бабло", slang_level: 1, folder: "dengi" }),
  vocab({
    fr: "kiffer",
    ru: "тащиться, обожать",
    pos: "verb",
    gender: "none",
    slang_level: 2,
    folder: "emotsii",
    ru_suggested: true,
    example_fr: "Je kiffe trop ce son.",
    example_ru: "Обожаю этот трек.",
  }),
  vocab({
    fr: "chelou",
    fr_as_seen: "chlou",
    ru: "стрёмный, странный",
    note: "Верлан от «louche»",
    pos: "adj",
    gender: "none",
    slang_level: 2,
    verlan: true,
    confidence: "low",
    issue: "На скриншоте «chlou» — похоже на опечатку",
    folder: "emotsii",
  }),
  vocab({ fr: "les flics", ru: "копы", slang_level: 1, folder: "politsiya" }),
];

/** Answers POST /api/ai/extract with the given rows. */
export async function mockExtract(page: Page, items: readonly VocabItemWire[], onRequest?: (contentType: string) => void) {
  await page.route("**/api/ai/extract", async (route: Route) => {
    onRequest?.(route.request().headers()["content-type"] ?? "");
    await route.fulfill({
      status: 200,
      contentType: NDJSON,
      body: ndjson([
        { type: "meta", images: 1 },
        ...items.map((item, index) => ({ type: "item", index, item })),
        { type: "done", count: items.length },
      ]),
    });
  });
}

export interface EnrichResultWire {
  id: string;
  pos: SuggestionWire["pos"];
  gender: SuggestionWire["gender"];
  slang_level: 0 | 1 | 2 | 3;
  verlan: boolean;
  example_fr: string | null;
  example_ru: string | null;
  confidence: "high" | "med" | "low";
  /** Theme slug, "NEW" or "INBOX" when the request carried themes; otherwise null. */
  folder: string | null;
  folder_alternatives: string[];
  new_folder: { slug: string; name: string; description: string } | null;
  /** Filled custom fields («Свои поля»): definition id and value. */
  custom?: { id: string; value: string }[];
}

export interface EnrichWordWire {
  id: string;
  fr: string;
  ru: string;
  note?: string | null;
}

/** Answers POST /api/ai/enrich: `make` gives the detected fields for each word sent (null = skipped). */
export async function mockEnrich(
  page: Page,
  make: (word: EnrichWordWire) => Omit<EnrichResultWire, "id"> | null,
  onRequest?: (words: EnrichWordWire[], folders: { slug: string }[] | undefined) => void,
) {
  await page.route("**/api/ai/enrich", async (route: Route) => {
    const { words, folders } = route.request().postDataJSON() as { words: EnrichWordWire[]; folders?: { slug: string }[] };
    onRequest?.(words, folders);
    const results = words.flatMap((w) => {
      const r = make(w);
      return r ? [{ id: w.id, ...r }] : [];
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results }) });
  });
}

export interface AnkiNoteWire {
  /** The AnkiNote id. */
  ref: string;
  fields: { name: string; text: string }[];
  tags: string[];
}

export interface AnkiItemWire extends VocabItemWire {
  ref: string;
  skip: boolean;
  fr_field: string | null;
  /** Note fields the card was made from; the other ones become custom fields of the word. */
  used_fields?: string[];
  /** Filled custom fields («Свои поля»): definition id and value. */
  custom?: { id: string; value: string }[];
}

/** Answers POST /api/ai/anki: `make` gives the card for each note sent (null = the model left it out). */
export async function mockAnki(
  page: Page,
  make: (note: AnkiNoteWire) => Omit<AnkiItemWire, "ref"> | null,
  onRequest?: (notes: AnkiNoteWire[], folders: { slug: string }[] | undefined) => void,
) {
  await page.route("**/api/ai/anki", async (route: Route) => {
    const { notes, folders } = route.request().postDataJSON() as { notes: AnkiNoteWire[]; folders?: { slug: string }[] };
    onRequest?.(notes, folders);
    const items = notes.flatMap((n) => {
      const item = make(n);
      return item ? [{ ...item, ref: n.ref }] : [];
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items }) });
  });
}

/**
 * Answers the assign pass of POST /api/ai/classify («Разложить по темам», «Расформировать»):
 * `pick` returns a theme slug (or "INBOX") per word. `status` ≠ 200 fails every call.
 */
export async function mockClassifyAssign(
  page: Page,
  pick: (word: { fr: string; ru: string }, folders: readonly { slug: string; name: string }[]) => string,
  opts: { status?: number; onRequest?: (body: { words: { fr: string }[]; folders: { slug: string; name: string }[] }) => void } = {},
) {
  await page.route("**/api/ai/classify", async (route: Route) => {
    if (opts.status && opts.status !== 200) {
      await route.fulfill({ status: opts.status, contentType: "application/json", body: JSON.stringify({ error: "not_configured" }) });
      return;
    }
    const body = route.request().postDataJSON() as { words: { id: string; fr: string; ru: string }[]; folders: { slug: string; name: string }[] };
    opts.onRequest?.(body);
    const assignments = body.words.map((w) => ({ id: w.id, folder: pick(w, body.folders), confidence: "high" }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assignments }) });
  });
}

/** Answers POST /api/ai/example: `make` gets the request (card + examples to avoid). */
export async function mockExample(
  page: Page,
  make: (body: { fr: string; ru: string; avoid: string[] }) => { fr: string; ru: string | null } | null,
  onRequest?: (body: { fr: string; ru: string; avoid: string[] }) => void,
) {
  await page.route("**/api/ai/example", async (route: Route) => {
    const body = route.request().postDataJSON() as { fr: string; ru: string; avoid: string[] };
    onRequest?.(body);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ example: make(body) }) });
  });
}

/** Answers POST /api/ai/fill («Заполнить автоматически»): `make` gets the request. */
export async function mockFill(
  page: Page,
  make: (body: { field: "origin" | "conjugation"; fr: string; ru: string | null; pos?: string }) => unknown,
  onRequest?: (body: { field: string; fr: string }) => void,
) {
  await page.route("**/api/ai/fill", async (route: Route) => {
    const body = route.request().postDataJSON() as { field: "origin" | "conjugation"; fr: string; ru: string | null; pos?: string };
    onRequest?.(body);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ field: body.field, value: make(body) }) });
  });
}

// «Контекст»: LookupResponse and ContextResponse (lib/ai/schemas.ts).

export interface LookupWire {
  found: boolean;
  q: string;
  direction: "fr" | "ru";
  fr: string;
  pos: SuggestionWire["pos"];
  gender: SuggestionWire["gender"];
  slang_level: 0 | 1 | 2 | 3;
  verlan: boolean;
  note: string | null;
  origin?: string | null;
  translations: { ru: string; share: number }[];
  synonyms: { fr: string; ru: string; slang_level: 0 | 1 | 2 | 3 }[];
  conjugation: {
    auxiliary: "avoir" | "être";
    remark: string | null;
    tenses: Record<"present" | "passe_compose" | "imparfait" | "futur", string[]>;
  } | null;
}

export interface ContextExampleWire {
  fr: string;
  ru: string;
  hit: string;
  meaning: string | null;
  kind: "forum" | "song" | "article" | "subtitles" | "social" | "book" | "other";
  url: string;
  domain: string;
  title: string | null;
}

export const KIFFER_LOOKUP: LookupWire = {
  found: true,
  q: "kiffer",
  direction: "fr",
  fr: "kiffer",
  pos: "verb",
  gender: "none",
  slang_level: 1,
  verlan: false,
  note: "От арабского kif",
  translations: [
    { ru: "тащиться", share: 38 },
    { ru: "нравиться", share: 27 },
    { ru: "кайфовать", share: 21 },
    { ru: "обожать", share: 14 },
  ],
  synonyms: [
    { fr: "adorer", ru: "обожать", slang_level: 0 },
    { fr: "triper", ru: "тащиться", slang_level: 1 },
    { fr: "surkiffer", ru: "дико тащиться", slang_level: 2 },
  ],
  conjugation: {
    auxiliary: "avoir",
    remark: "Правильный на -er",
    tenses: {
      present: ["je kiffe", "tu kiffes", "il/elle kiffe", "nous kiffons", "vous kiffez", "ils/elles kiffent"],
      passe_compose: ["j'ai kiffé", "tu as kiffé", "il/elle a kiffé", "nous avons kiffé", "vous avez kiffé", "ils/elles ont kiffé"],
      imparfait: ["je kiffais", "tu kiffais", "il/elle kiffait", "nous kiffions", "vous kiffiez", "ils/elles kiffaient"],
      futur: ["je kifferai", "tu kifferas", "il/elle kiffera", "nous kifferons", "vous kifferez", "ils/elles kifferont"],
    },
  },
};

export const KIFFER_EXAMPLES: ContextExampleWire[] = [
  {
    fr: "Franchement, je kiffe trop ce son, je l'écoute en boucle.",
    ru: "Честно, я так тащусь от этого трека, слушаю на повторе.",
    hit: "kiffe",
    meaning: "тащиться",
    kind: "forum",
    url: "https://forum.exemple.fr/t/1",
    domain: "forum.exemple.fr",
    title: "Vos sons du moment",
  },
  {
    fr: "Elle kiffe grave le mec de sa classe.",
    ru: "Ей очень нравится парень из её класса.",
    hit: "kiffe",
    meaning: "нравиться",
    kind: "subtitles",
    url: "https://sous-titres.exemple.org/s/2",
    domain: "sous-titres.exemple.org",
    title: null,
  },
  {
    fr: "On a kiffé la soirée, c'était ouf.",
    ru: "Мы кайфанули на вечеринке, было офигенно.",
    hit: "kiffé",
    meaning: "кайфовать",
    kind: "social",
    url: "https://social.exemple.com/p/3",
    domain: "social.exemple.com",
    title: null,
  },
];

/** Answers POST /api/ai/lookup: `make` gives the response for the query (a number = that HTTP error). */
export async function mockLookup(page: Page, make: (q: string) => LookupWire | number, onRequest?: (body: { q: string }) => void) {
  await page.route("**/api/ai/lookup", async (route: Route) => {
    const body = route.request().postDataJSON() as { q: string };
    onRequest?.(body);
    const answer = make(body.q);
    if (typeof answer === "number") {
      await route.fulfill({ status: answer, contentType: "application/json", body: JSON.stringify({ error: "failed" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) });
  });
}

/**
 * Answers POST /api/ai/context with `make(body)`. With `gate`, each request waits for
 * `release()` (to look at «Ищем примеры в вебе»).
 */
/** A Tatoeba sentence as its API returns it (with one Russian translation). */
export interface TatoebaWire {
  id: number;
  fr: string;
  ru: string;
}

/** A free Tatoeba sentence for «kiffer» («Как говорят» shows it before any web search). */
export const KIFFER_TATOEBA: TatoebaWire = { id: 8315342, fr: "Tu kiffes le café ?", ru: "Вам нравится кофе?" };

/** Tatoeba's API (asked from the browser): `make` gets the search `q` and returns the sentences. */
export async function mockTatoeba(page: Page, make: (q: string) => TatoebaWire[], onRequest?: (q: string) => void) {
  await page.route("https://api.tatoeba.org/**", async (route: Route) => {
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    onRequest?.(q);
    const data = make(q).map((s) => ({
      id: s.id,
      text: s.fr,
      lang: "fra",
      is_unapproved: false,
      license: "CC BY 2.0 FR",
      translations: [{ id: s.id + 1, text: s.ru, lang: "rus", is_direct: true, is_unapproved: false }],
    }));
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ data, paging: { total: data.length } }) });
  });
}

export async function mockContext(
  page: Page,
  make: (body: { fr: string; meanings: string[] }) => ContextExampleWire[] | number,
  opts: { onRequest?: (body: { fr: string; meanings: string[] }) => void; gate?: boolean } = {},
) {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  if (!opts.gate) open();
  await page.route("**/api/ai/context", async (route: Route) => {
    const body = route.request().postDataJSON() as { fr: string; meanings: string[] };
    opts.onRequest?.(body);
    await gate;
    const answer = make(body);
    if (typeof answer === "number") {
      await route.fulfill({ status: answer, contentType: "application/json", body: JSON.stringify({ error: "failed" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ examples: answer, sources: answer.length }) }).catch(() => undefined);
  });
  return { release: () => open() };
}

/** Detected fields with an example built from the French side. */
export const enriched = (word: EnrichWordWire, fields: Partial<Omit<EnrichResultWire, "id">> = {}): Omit<EnrichResultWire, "id"> => ({
  pos: "noun",
  gender: "f",
  slang_level: 1,
  verlan: false,
  example_fr: `Exemple avec ${word.fr}.`,
  example_ru: `Пример: ${word.ru}.`,
  confidence: "high",
  folder: null,
  folder_alternatives: [],
  new_folder: null,
  ...fields,
});

/** Draws a small chat-like screenshot in the browser and returns it as a PNG. */
export async function screenshotPng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 360;
    c.height = 480;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ece5dd";
    g.fillRect(0, 0, c.width, c.height);
    const bubbles = ["t'as du fric ?", "je kiffe trop ce son", "il est chlou ce mec", "attention, les flics !"];
    g.font = "18px sans-serif";
    bubbles.forEach((text, i) => {
      const y = 30 + i * 100;
      const right = i % 2 === 1;
      g.fillStyle = right ? "#dcf8c6" : "#ffffff";
      g.fillRect(right ? 120 : 20, y, 220, 56);
      g.fillStyle = "#111111";
      g.fillText(text, right ? 134 : 34, y + 34);
    });
    return c.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** Opens a route and waits until first-run seeding has filled the review queue. */
/** The question side of the review card; tapping it (or swiping up) shows the answer. */
export const questionCard = (page: Page) => page.getByRole("button", { name: /^Карточка .*, перевернуть$/ });

export async function openReview(page: Page) {
  await page.goto("/");
  await expect(questionCard(page)).toBeVisible();
}

export const tabBar = (page: Page) => page.getByRole("navigation", { name: "Основная навигация" });

export const addSheet = (page: Page) => page.getByRole("dialog", { name: /Новое слово/ });

/** Waits for the page's finite animations (a dialog's rise, a snackbar's entry) before measuring geometry. */
export async function motionSettled(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/** Ratings in the local review log, oldest first (1 = Не знаю … 3 = Знаю). Undone answers are gone. */
export async function loggedRatings(page: Page): Promise<number[]> {
  return page.evaluate(
    () =>
      new Promise<number[]>((resolve, reject) => {
        const open = indexedDB.open("kartochki");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction("review_log").objectStore("review_log").getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            const rows = all.result as { rating: number; review: string; deleted_at: string | null }[];
            resolve(rows.filter((r) => !r.deleted_at).sort((a, b) => a.review.localeCompare(b.review)).map((r) => r.rating));
            open.result.close();
          };
        };
      }),
  );
}

/**
 * Holds POST /api/ai/suggest until `release()`; each held request then gets `answer()` (rows, or
 * an HTTP error status). Lets a test look at «Варианты» while they wait.
 */
export async function gateSuggest(page: Page, answer: () => readonly SuggestionWire[] | number) {
  let open!: () => void;
  let gate = new Promise<void>((resolve) => (open = resolve));
  await page.route("**/api/ai/suggest", async (route: Route) => {
    await gate;
    const a = answer();
    if (typeof a === "number") {
      await route.fulfill({ status: a, contentType: "application/json", body: JSON.stringify({ error: "failed" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: NDJSON,
      body: ndjson([
        { type: "meta", direction: "fr" },
        ...a.map((suggestion, index) => ({ type: "suggestion", index, suggestion })),
        { type: "done", count: a.length },
      ]),
    });
  });
  return {
    release: () => open(),
    /** Holds the next requests again. */
    hold: () => {
      gate = new Promise<void>((resolve) => (open = resolve));
    },
  };
}

/**
 * Keeps a read-write transaction open on the app database, so the app's own saves queue behind it
 * (IndexedDB runs overlapping read-write transactions one at a time). Returns `release`.
 */
export async function holdDatabase(page: Page): Promise<() => Promise<void>> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("kartochki");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(Array.from(db.objectStoreNames), "readwrite");
          const w = window as unknown as { __holdDb: boolean };
          w.__holdDb = true;
          const store = tx.objectStore("settings");
          const spin = () => {
            if (w.__holdDb) store.get("__hold").onsuccess = spin;
          };
          spin();
          tx.oncomplete = () => db.close();
          resolve();
        };
      }),
  );
  return async () => {
    await page.evaluate(() => {
      (window as unknown as { __holdDb: boolean }).__holdDb = false;
    });
  };
}

// --- «Упражнения» -------------------------------------------------------------------------------
// Sets are written by the connector and reach the device by sync; e2e puts them straight into the
// app's IndexedDB (stores exercise_sets / exercise_runs), with the shapes of lib/types.ts.

export interface ExerciseItemSeed {
  id: string;
  type: "choice" | "cloze" | "register" | "pairs" | "conjugate";
  skill?: "meaning" | "form" | "neutral" | "verlan" | "situation" | null;
  ask?: "fr" | "ru" | null;
  /** Conjugate: the tense and person asked (sentence, answer and distractors as the server writes them). */
  tense?: "present" | "passe_compose" | "imparfait" | "futur" | null;
  person?: "je" | "tu" | "il" | "nous" | "vous" | "ils" | null;
  /** A seeded library word by its French form: resolved to its word_id and snapshot in the page. */
  word?: string;
  new_ref?: string;
  prompt?: string | null;
  sentence?: string | null;
  sentence_ru?: string | null;
  answer?: string | null;
  distractors?: string[];
  /** Pairs: seeded library words by their French form. */
  pairs?: string[];
  explain_ru?: string | null;
}

export interface ExerciseNewWordSeed {
  ref: string;
  fr: string;
  ru: string;
  note?: string | null;
  example_fr?: string | null;
  example_ru?: string | null;
  pos?: "noun" | "verb" | "adj" | "adv" | "expression" | "other";
  gender?: "m" | "f" | "mf" | "none";
  slang_level?: 0 | 1 | 2 | 3;
  verlan?: boolean;
  source_url?: string | null;
}

export interface ExerciseSetSeed {
  id: string;
  title: string;
  topic?: string | null;
  /** Theme slugs (resolved to folder ids), or "inbox". */
  folders?: string[];
  created_at?: string;
  items: ExerciseItemSeed[];
  new_words?: ExerciseNewWordSeed[];
  /** Only the user's difficult and/or due words, from every theme. */
  scope?: "difficult" | "due" | "both" | null;
  /** «Уровень набора» (migration 0017); `level_auto` when it came from «Авто». */
  level?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
  level_auto?: boolean;
}

/**
 * Puts exercise sets into the app's database (after first-run seeding: open a page and wait for it
 * first). Library words are named by their French form. Reload or navigate afterwards: the app's
 * live queries do not see writes made outside Dexie.
 */
export async function seedExerciseSets(page: Page, sets: readonly ExerciseSetSeed[]) {
  await page.evaluate(
    (seeds) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("kartochki");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["words", "folders", "exercise_sets"], "readwrite");
          const words = tx.objectStore("words").getAll();
          const folders = tx.objectStore("folders").getAll();
          folders.onsuccess = () => {
            try {
              put();
            } catch (error) {
              reject(error);
              tx.abort();
            }
          };
          const put = () => {
            type W = { id: string; fr: string; ru: string; pos: string; gender: string; slang_level: number; verlan: boolean; deleted_at: string | null };
            const live = (words.result as W[]).filter((w) => !w.deleted_at);
            const bySlug = new Map((folders.result as { id: string; slug: string }[]).map((f) => [f.slug, f.id]));
            const word = (fr: string) => {
              const w = live.find((x) => x.fr === fr);
              if (!w) throw new Error(`seedExerciseSets: no word «${fr}»`);
              return w;
            };
            const snapshot = (w: W) => ({ fr: w.fr, ru: w.ru, pos: w.pos, gender: w.gender, slang_level: w.slang_level, verlan: w.verlan });
            const now = new Date().toISOString();
            for (const s of seeds) {
              const newWords = (s.new_words ?? []).map((n) => ({
                note: null,
                example_fr: null,
                example_ru: null,
                pos: "expression",
                gender: "none",
                slang_level: 1,
                verlan: false,
                origin: null,
                source_url: null,
                ...n,
              }));
              const items = s.items.map((it) => {
                const w = it.word ? word(it.word) : null;
                const n = it.new_ref ? newWords.find((x) => x.ref === it.new_ref) : null;
                const pairs = (it.pairs ?? []).map(word);
                return {
                  id: it.id,
                  type: it.type,
                  skill: it.skill ?? (it.type === "choice" ? "meaning" : null),
                  ask: it.ask ?? (it.type === "choice" ? "fr" : null),
                  tense: it.tense ?? null,
                  person: it.person ?? null,
                  word_id: w?.id ?? null,
                  new_ref: it.new_ref ?? null,
                  prompt: it.prompt ?? null,
                  sentence: it.sentence ?? null,
                  sentence_ru: it.sentence_ru ?? null,
                  answer: it.answer ?? null,
                  distractors: it.distractors ?? [],
                  pairs: pairs.map((p) => p.id),
                  tiles: pairs.map((p) => ({ key: p.id, fr: p.fr, ru: p.ru })),
                  explain_ru: it.explain_ru ?? null,
                  word: w ? snapshot(w) : n ? { fr: n.fr, ru: n.ru, pos: n.pos, gender: n.gender, slang_level: n.slang_level, verlan: n.verlan } : null,
                };
              });
              tx.objectStore("exercise_sets").put({
                id: s.id,
                title: s.title,
                topic: s.topic ?? null,
                folders: (s.folders ?? []).map((f) => (f === "inbox" ? f : (bySlug.get(f) ?? f))),
                items,
                new_words: newWords,
                scope: s.scope ?? null,
                level: s.level ?? null,
                level_auto: s.level_auto ?? false,
                source: "chat",
                created_at: s.created_at ?? now,
                updated_at: s.created_at ?? now,
                deleted_at: null,
              });
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        };
      }),
    sets,
  );
}

/** Rows of a store in the app's database (exercise_runs, words…), deleted ones included. */
export async function dbRows<T = Record<string, unknown>>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open("kartochki");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction(name).objectStore(name).getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            resolve(all.result as T[]);
            open.result.close();
          };
        };
      }),
    store,
  );
}

/** «Сленг на каждый день»: choice, cloze, register, pairs and a new web word, on the first-run seed words. */
export const SLANG_SET: ExerciseSetSeed = {
  id: "x-e2e-slang",
  title: "Сленг на каждый день",
  folders: ["povsednevnoe", "politsiya"],
  created_at: "2026-10-22T09:00:00.000Z",
  new_words: [
    {
      ref: "flemme",
      fr: "avoir la flemme",
      ru: "лениться, неохота",
      note: "Говорят о себе: j'ai la flemme — «мне лень».",
      example_fr: "J'ai la flemme de sortir ce soir.",
      example_ru: "Неохота мне сегодня никуда идти.",
      pos: "expression",
      slang_level: 1,
      source_url: "https://www.lalanguefrancaise.com/expressions/avoir-la-flemme",
    },
  ],
  items: [
    { id: "q1", type: "choice", word: "les flics", prompt: "les flics", answer: "копы", distractors: ["шутка", "жир", "давай"], explain_ru: "flic — разговорное «полицейский»" },
    {
      id: "q2",
      type: "cloze",
      word: "vas-y",
      sentence: "Allez, [[vas-y]], on t'attend !",
      sentence_ru: "Ну же, мы тебя ждём!",
      answer: "vas-y",
      distractors: ["arrête", "dépêche-toi", "une blague"],
    },
    { id: "q3", type: "register", word: "se casser", answer: "arg." },
    { id: "q4", type: "pairs", pairs: ["une blague", "le gras", "arrête", "c'est dur"] },
    { id: "q5", type: "choice", new_ref: "flemme", prompt: "avoir la flemme", answer: "лениться, неохота", distractors: ["торопиться", "злиться", "веселиться"] },
  ],
};

/** The player's question card (data-exercise-card = its type). */
export const exerciseCard = (page: Page) => page.locator("[data-exercise-card]");
/** An option tile by its text; `not` picks the first tile that is not it. */
export const optionTile = (page: Page, text: string) => page.locator("button[data-option]", { hasText: text });
export const wrongOption = (page: Page, right: string) => page.locator("button[data-option]").filter({ hasNotText: right }).first();

// --- Card states --------------------------------------------------------------------------------

/**
 * Card states for seeded words, by their French form: «difficult» (lapsed three times, next due in
 * 5 days), «due» (a plain review card due yesterday) or «known» (next due in a month). Both
 * directions' cards change. Words not named keep their state (New after the first-run seed). Reload
 * or navigate afterwards: the app's live queries do not see writes made outside Dexie.
 */
export async function seedCardStates(page: Page, states: Record<string, "difficult" | "due" | "known">) {
  await page.evaluate(
    (wanted) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("kartochki");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["words", "review_state"], "readwrite");
          const words = tx.objectStore("words").getAll();
          const cards = tx.objectStore("review_state").getAll();
          cards.onsuccess = () => {
            const day = 24 * 60 * 60 * 1000;
            const now = Date.now();
            const iso = (ms: number) => new Date(ms).toISOString();
            const idByFr = new Map((words.result as { id: string; fr: string; deleted_at: string | null }[]).filter((w) => !w.deleted_at).map((w) => [w.fr, w.id]));
            const missing = Object.keys(wanted).filter((fr) => !idByFr.has(fr));
            if (missing.length) {
              reject(new Error(`seedCardStates: no word ${missing.join(", ")}`));
              tx.abort();
              return;
            }
            const kindById = new Map(Object.entries(wanted).map(([fr, kind]) => [idByFr.get(fr)!, kind]));
            for (const card of cards.result as { word_id: string }[]) {
              const kind = kindById.get(card.word_id);
              if (!kind) continue;
              const fields =
                kind === "difficult"
                  ? { state: 2, lapses: 3, reps: 6, difficulty: 8.5, stability: 2, due: iso(now + 5 * day), last_review: iso(now - 2 * day), scheduled_days: 5, elapsed_days: 2 }
                  : kind === "due"
                    ? { state: 2, lapses: 0, reps: 3, difficulty: 5, stability: 5, due: iso(now - day), last_review: iso(now - 6 * day), scheduled_days: 5, elapsed_days: 6 }
                    : { state: 2, lapses: 0, reps: 4, difficulty: 4, stability: 40, due: iso(now + 30 * day), last_review: iso(now - 10 * day), scheduled_days: 40, elapsed_days: 10 };
              tx.objectStore("review_state").put({ ...card, ...fields, learning_steps: 0, updated_at: iso(now) });
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error("seedCardStates: aborted"));
        };
      }),
    states,
  );
}

/** The first-run seed's 11 words. */
/** Puts a seeded word's FR→RU card in learning, due `minutes` from now. Reload afterwards. */
export async function seedLearningCard(page: Page, fr: string, minutes: number) {
  await page.evaluate(
    ({ fr, minutes }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("kartochki");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(["words", "review_state"], "readwrite");
          const words = tx.objectStore("words").getAll();
          words.onsuccess = () => {
            const word = (words.result as { id: string; fr: string; deleted_at: string | null }[]).find((w) => w.fr === fr && !w.deleted_at);
            if (!word) {
              reject(new Error(`seedLearningCard: no word ${fr}`));
              tx.abort();
              return;
            }
            const cards = tx.objectStore("review_state");
            const get = cards.get(`${word.id}:fr_ru`);
            get.onsuccess = () => {
              const now = Date.now();
              const iso = (ms: number) => new Date(ms).toISOString();
              cards.put({
                ...get.result,
                state: 1,
                learning_steps: 1,
                reps: 1,
                lapses: 0,
                stability: 0.5,
                difficulty: 5,
                due: iso(now + minutes * 60_000),
                last_review: iso(now - 60_000),
                scheduled_days: 0,
                elapsed_days: 0,
                updated_at: iso(now),
              });
            };
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { fr, minutes },
  );
}

export const SEED_WORDS = [
  "une blague",
  "le gras",
  "dépêche-toi",
  "arrête",
  "se casser",
  "les flics",
  "je vais me tuer",
  "c'est dur",
  "être dehors",
  "qu'est-ce qui se passe ?",
  "vas-y",
] as const;
