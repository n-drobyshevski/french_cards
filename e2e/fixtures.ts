import { expect, type Page, type Route } from "@playwright/test";

// Wire formats mirror lib/ai/schemas.ts (SuggestLine, ExtractLine, Suggestion, VocabItem, EnrichResponse).
// Kept as plain objects so e2e does not import app code.

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
