import { expect, test, type Page } from "@playwright/test";
import {
  addSheet,
  enriched,
  KIFFER_EXAMPLES,
  KIFFER_LOOKUP,
  KIFFER_TATOEBA,
  mockContext,
  mockEnrich,
  mockLookup,
  mockSuggest,
  mockTatoeba,
  tabBar,
  type ContextExampleWire,
  type LookupWire,
} from "./fixtures";

// «Контекст» on phones: /api/ai/lookup and /api/ai/context are mocked per test.

const TRIPER: LookupWire = { ...KIFFER_LOOKUP, q: "triper", fr: "triper", note: null, synonyms: [{ fr: "kiffer", ru: "тащиться", slang_level: 1 }], conjugation: null };

const SE_CASSER: LookupWire = {
  ...KIFFER_LOOKUP,
  q: "se casser",
  fr: "se casser",
  slang_level: 2,
  note: null,
  translations: [
    { ru: "свалить", share: 70 },
    { ru: "сломаться", share: 30 },
  ],
  synonyms: [{ fr: "se tirer", ru: "свалить", slang_level: 2 }],
  conjugation: null,
};

const CASSE: ContextExampleWire[] = [
  {
    fr: "Allez, on se casse d'ici avant que ça dégénère.",
    ru: "Ладно, сваливаем отсюда, пока не началось.",
    hit: "se casse",
    meaning: "свалить",
    kind: "forum",
    url: "https://forum.exemple.fr/t/9",
    domain: "forum.exemple.fr",
    title: "Soirée qui tourne mal",
  },
];

const VOLONTAIRE: LookupWire = {
  ...KIFFER_LOOKUP,
  q: "volontaire",
  fr: "volontaire",
  pos: "adj",
  slang_level: 0,
  note: null,
  origin: "от volonté „воля“ + -aire",
  translations: [
    { ru: "добровольный", share: 70 },
    { ru: "волевой", share: 30 },
  ],
  synonyms: [],
  conjugation: null,
};
const VOLONTE: LookupWire = { ...VOLONTAIRE, q: "volonté", fr: "volonté", pos: "noun", gender: "f", origin: null, translations: [{ ru: "воля", share: 100 }] };

const lookups = { kiffer: KIFFER_LOOKUP, triper: TRIPER, "se casser": SE_CASSER, volontaire: VOLONTAIRE, "volonté": VOLONTE } as Record<string, LookupWire>;

async function mockAll(page: Page) {
  const calls = { lookup: [] as string[], context: [] as string[], tatoeba: [] as string[] };
  await mockTatoeba(page, (q) => (q === "kiffer" ? [KIFFER_TATOEBA] : []), (q) => calls.tatoeba.push(q));
  await mockLookup(page, (q) => lookups[q] ?? { ...KIFFER_LOOKUP, found: false, q, fr: "", translations: [], synonyms: [], conjugation: null }, (b) => calls.lookup.push(b.q));
  await mockContext(page, (b) => (b.fr === "se casser" ? CASSE : b.fr === "kiffer" ? KIFFER_EXAMPLES : []), { onRequest: (b) => calls.context.push(b.fr) });
  return calls;
}

const field = (page: Page) => page.getByRole("textbox", { name: "Слово или фраза" });
const examples = (page: Page) => page.getByRole("list", { name: "Примеры" }).getByRole("listitem");

/** «Искать ещё в вебе» under Tatoeba's sentences (or «Искать в вебе» when there are none). */
async function searchWeb(page: Page) {
  await page.getByRole("button", { name: /^Искать (ещё )?в вебе$/ }).click();
}

async function searchFor(page: Page, q: string) {
  await field(page).fill(q);
  await field(page).press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: q })).toBeVisible();
}

test("kiffer: translations, the meaning chips filter the examples, synonyms, conjugation; Back steps through queries", async ({ page }) => {
  const calls = await mockAll(page);
  // No tab of its own on phones: the magnifier left of the gear in the Library header opens it, and
  // Библиотека stays the active tab.
  await page.goto("/library");
  await expect(tabBar(page).getByRole("link", { name: "Контекст" })).toHaveCount(0);
  await page.getByRole("link", { name: "Контекст", exact: true }).click();
  await expect(page).toHaveURL(/\/context$/);
  await expect(page.getByRole("heading", { level: 1, name: "Контекст" })).toBeVisible();
  await expect(tabBar(page).getByRole("link", { name: "Библиотека" })).toHaveAttribute("aria-current", "page");

  await searchFor(page, "kiffer");
  await expect(page).toHaveURL(/\/context\?q=kiffer$/);
  const translations = page.getByRole("list", { name: "Переводы по частоте" });
  await expect(translations.getByRole("listitem").first()).toContainText("тащиться");
  await expect(translations.getByRole("listitem").first()).toContainText("38%");
  await expect(page.getByRole("button", { name: "В карточки", exact: true })).toBeVisible();

  // Free first: Tatoeba's sentence, no paid search until asked.
  await expect(examples(page)).toHaveCount(1);
  await expect(examples(page).first()).toContainText(KIFFER_TATOEBA.fr);
  await expect(page.getByRole("link", { name: "Tatoeba", exact: true })).toBeVisible();
  expect(calls.tatoeba).toEqual(["kiffer"]);
  expect(calls.context).toEqual([]);

  await searchWeb(page);
  await expect(page.getByText("4 примера")).toBeVisible();
  await expect(examples(page)).toHaveCount(4);
  await expect(page.getByRole("button", { name: /^Искать ещё в вебе$/ })).toBeHidden();
  await page.getByRole("group", { name: "Значения" }).getByRole("button", { name: /нравиться/ }).click();
  await expect(examples(page)).toHaveCount(1);
  await expect(examples(page).first()).toContainText("Elle kiffe grave le mec de sa classe.");
  await page.getByRole("group", { name: "Значения" }).getByRole("button", { name: "Все · 4" }).click();
  await expect(examples(page)).toHaveCount(4);
  expect(calls.context).toEqual(["kiffer"]);

  await expect(page.getByText("это слово")).toBeVisible();
  await expect(page.getByRole("button", { name: "adorer — обожать" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Добавить surkiffer в карточки" })).toBeVisible();

  const conj = page.getByRole("button", { name: /Спряжение/ });
  await expect(conj).toHaveAttribute("aria-expanded", "false");
  // Built on the device from Lexique, not by the model.
  await expect(page.getByText("je kiffe · tu kiffes · il kiffe…")).toBeVisible();
  await conj.click();
  await expect(conj).toHaveAttribute("aria-expanded", "true");
  // A card per tense: when it is used, an example found among the sentences, the forms.
  const pc = page.getByRole("article", { name: "Passé composé" });
  await expect(pc.getByRole("heading", { name: "Passé composé" })).toBeVisible();
  await expect(pc).toContainText("один раз в прошлом");
  await expect(pc).toContainText("j'ai kiffé");
  await expect(pc).toContainText("On a kiffé la soirée");
  // «Проверь себя»: the forms hide behind blanks (and the example with them); a tap shows one.
  await page.getByRole("button", { name: "Проверь себя" }).click();
  await expect(pc.getByRole("button", { name: /^Показать форму/ })).toHaveCount(6);
  await expect(pc).not.toContainText("On a kiffé la soirée");
  await pc.getByRole("button", { name: "Показать форму: nous" }).click();
  await expect(pc).toContainText("nous avons kiffé");
  await expect(page.getByText("открыто 1 из 24", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Проверь себя" }).click();

  // A synonym opens in «Контекст»; Back returns to kiffer from the saved results.
  await page.getByRole("button", { name: "triper — тащиться" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "triper" })).toBeVisible();
  await expect(page).toHaveURL(/q=triper$/);
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "kiffer" })).toBeVisible();
  expect(calls.lookup).toEqual(["kiffer", "triper"]);

  // The header's back arrow steps back the same way: home, then the Library.
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page).toHaveURL(/\/context$/);
  await expect(page.getByRole("heading", { level: 1, name: "Контекст" })).toBeVisible();
  await page.getByRole("button", { name: "Назад в библиотеку" }).click();
  await expect(page).toHaveURL(/\/library$/);
});

test("an example goes into the saved word's card", async ({ page }) => {
  await mockAll(page);
  await page.goto("/context?q=se%20casser");
  await expect(page.getByRole("heading", { level: 1, name: "se casser" })).toBeVisible();
  const saved = page.getByRole("button", { name: "В библиотеке · Повседневное" });
  await expect(saved).toBeVisible();
  await expect(page.getByText("Живых фраз пока нет")).toBeVisible();
  await searchWeb(page);

  await page.getByRole("button", { name: `В карточку: ${CASSE[0].fr}` }).click();
  const sheet = page.getByRole("dialog", { name: "Пример" });
  await expect(sheet.getByText("сейчас 0 примеров из 5")).toBeVisible();
  await expect(sheet.getByRole("link", { name: /Soirée qui tourne mal/ })).toHaveAttribute("href", CASSE[0].url);
  await sheet.getByRole("button", { name: "В карточку слова" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Пример добавлен", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `В карточке: ${CASSE[0].fr}` })).toBeVisible();

  await saved.click();
  const card = page.getByRole("dialog", { name: "Карточка слова" });
  await expect(card.getByText(CASSE[0].fr)).toBeVisible();
  await expect(card.getByRole("link", { name: "Примеры из жизни" })).toHaveAttribute("href", "/context?q=se%20casser");
});

test("«+ В карточки» and an example's «Добавить слово с этим примером» open the filled add form", async ({ page }) => {
  await mockAll(page);
  await mockEnrich(page, (w) => enriched(w, { pos: "verb", gender: "none", slang_level: 1, example_fr: null, example_ru: null }));
  await page.goto("/context?q=kiffer");
  await expect(examples(page)).toHaveCount(1);
  await searchWeb(page);
  await expect(examples(page)).toHaveCount(4);

  await page.getByRole("button", { name: "В карточки", exact: true }).click();
  const sheet = addSheet(page);
  await expect(sheet.getByRole("textbox", { name: "Французский" })).toHaveValue("kiffer");
  await expect(sheet.getByRole("textbox", { name: "Русский", exact: true })).toHaveValue("тащиться, нравиться, кайфовать");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: `В карточку: ${KIFFER_EXAMPLES[1].fr}` }).click();
  await page.getByRole("dialog", { name: "Пример" }).getByRole("button", { name: "Добавить слово с этим примером" }).click();
  await expect(sheet.getByRole("textbox", { name: "Французский" })).toHaveValue("kiffer");
  await expect(sheet.getByRole("textbox", { name: "Пример по-французски" })).toHaveValue(KIFFER_EXAMPLES[1].fr);
  await sheet.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: /^В библиотеке · / })).toBeVisible();
  await expect(page.getByRole("button", { name: `В карточке: ${KIFFER_EXAMPLES[1].fr}` })).toBeVisible();
});

test("history reopens a query from the device, offline too", async ({ page, context }) => {
  const calls = await mockAll(page);
  await page.goto("/context");
  await searchFor(page, "kiffer");
  await expect(examples(page)).toHaveCount(1);
  await searchWeb(page);
  await expect(examples(page)).toHaveCount(4);

  await page.goto("/context");
  const history = page.getByRole("region", { name: "Недавние" });
  const row = history.getByRole("link", { name: /kiffer/ });
  await expect(page.getByText("Ваши слова без примеров")).toBeVisible();
  await row.click();
  await expect(page.getByRole("heading", { level: 1, name: "kiffer" })).toBeVisible();
  await expect(examples(page)).toHaveCount(4);
  expect(calls.lookup).toEqual(["kiffer"]);
  expect(calls.context).toEqual(["kiffer"]);
  expect(calls.tatoeba).toEqual(["kiffer"]);

  await page.goBack();
  await expect(row).toBeVisible();
  await context.setOffline(true);
  await expect(field(page)).toBeDisabled();
  await expect(field(page)).toHaveAttribute("placeholder", "Без сети — искать нельзя");
  await row.click();
  await expect(page.getByRole("heading", { level: 1, name: "kiffer" })).toBeVisible();
  await expect(examples(page)).toHaveCount(4);
  expect(calls.lookup).toEqual(["kiffer"]);
  await context.setOffline(false);
});

test("ways in: the add sheet, the library search with no match, the word card", async ({ page }) => {
  await mockAll(page);
  await mockSuggest(page, []);
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("kiffer");
  await page.getByRole("link", { name: /Посмотреть «kiffer» в Контексте/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "kiffer" })).toBeVisible();

  await tabBar(page).getByRole("button", { name: "Добавить" }).click();
  const sheet = addSheet(page);
  await sheet.getByPlaceholder("Слово или выражение — FR или RU").fill("triper");
  await sheet.getByRole("link", { name: /Как «triper» говорят в жизни/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "triper" })).toBeVisible();

  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Поиск по FR и RU" }).fill("casser");
  await page.getByText("se casser", { exact: true }).click();
  await page.getByRole("dialog", { name: "Карточка слова" }).getByRole("link", { name: "Примеры из жизни" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "se casser" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Карточка слова" })).toBeHidden();
});

test("a history row can be removed on its own, with «Отменить»", async ({ page }) => {
  await mockAll(page);
  await page.goto("/context");
  await searchFor(page, "kiffer");
  await expect(examples(page)).toHaveCount(1);
  await searchFor(page, "triper");
  await expect(page.getByRole("heading", { level: 1, name: "triper" })).toBeVisible();

  await page.goto("/context");
  const history = page.getByRole("region", { name: "Недавние" });
  const rows = history.getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await history.getByRole("button", { name: "Убрать «kiffer» из истории" }).click();
  await expect(rows).toHaveCount(1);
  await expect(history.getByRole("link", { name: /triper/ })).toBeVisible();

  await page.getByRole("button", { name: "Отменить" }).click();
  await expect(rows).toHaveCount(2);
  // Back in its place: the older query stays below the newer one.
  await expect(rows.nth(1)).toContainText("kiffer");

  await history.getByRole("button", { name: "Убрать «kiffer» из истории" }).click();
  await expect(rows).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("region", { name: "Недавние" }).getByRole("listitem")).toHaveCount(1);
});

test("«Слово по частям»: the parts from Lexique, the origin line, words on the same root", async ({ page }) => {
  const calls = await mockAll(page);
  await page.goto("/context?q=volontaire");
  await expect(page.getByRole("heading", { level: 1, name: "volontaire" })).toBeVisible();
  const makeup = page.getByRole("region", { name: "Слово по частям" });
  // Phones: one row in the card, opened in place.
  await makeup.getByRole("button", { name: /Слово по частям/ }).click();
  await expect(makeup.getByText("«относящийся к …»")).toBeVisible();
  await expect(makeup.getByText("от volonté „воля“ + -aire")).toBeVisible();
  const family = makeup.getByRole("list", { name: "Однокоренные" });
  await expect(family.getByRole("link", { name: "involontaire" })).toBeVisible();
  await expect(family.getByRole("link", { name: "volontairement" })).toBeVisible();
  await makeup.getByRole("link", { name: "volonté", exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "volonté" })).toBeVisible();
  expect(calls.lookup).toEqual(["volontaire", "volonté"]);
});
