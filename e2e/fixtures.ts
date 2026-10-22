import { expect, type Page, type Route } from "@playwright/test";

// Wire formats mirror lib/ai/schemas.ts (SuggestLine, ExtractLine, Suggestion, VocabItem).
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

export interface VocabItemWire extends Omit<SuggestionWire, "example_fr" | "example_ru" | "folder_alternatives"> {
  fr_as_seen: string | null;
  ru_suggested: boolean;
  provenance: "pair" | "fr_only" | "ru_only" | "in_text";
  issue: string | null;
}

export const vocab = (fields: Partial<VocabItemWire> & Pick<VocabItemWire, "fr" | "ru">): VocabItemWire => ({
  fr_as_seen: null,
  note: null,
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
  vocab({ fr: "kiffer", ru: "тащиться, обожать", pos: "verb", gender: "none", slang_level: 2, folder: "emotsii", ru_suggested: true }),
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
export async function openReview(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Показать ответ" })).toBeEnabled();
}

export const tabBar = (page: Page) => page.getByRole("navigation", { name: "Основная навигация" });

export const addSheet = (page: Page) => page.getByRole("dialog", { name: /Новое слово/ });
