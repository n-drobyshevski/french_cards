import { expect, test, type Page } from "@playwright/test";
import {
  addSheet,
  enriched,
  KIFFER_EXAMPLES,
  KIFFER_LOOKUP,
  mockContext,
  mockEnrich,
  mockLookup,
  mockSuggest,
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

const lookups = { kiffer: KIFFER_LOOKUP, triper: TRIPER, "se casser": SE_CASSER } as Record<string, LookupWire>;

async function mockAll(page: Page) {
  const calls = { lookup: [] as string[], context: [] as string[] };
  await mockLookup(page, (q) => lookups[q] ?? { ...KIFFER_LOOKUP, found: false, q, fr: "", translations: [], synonyms: [], conjugation: null }, (b) => calls.lookup.push(b.q));
  await mockContext(page, (b) => (b.fr === "se casser" ? CASSE : b.fr === "kiffer" ? KIFFER_EXAMPLES : []), { onRequest: (b) => calls.context.push(b.fr) });
  return calls;
}

const field = (page: Page) => page.getByRole("textbox", { name: "Слово или фраза" });
const examples = (page: Page) => page.getByRole("list", { name: "Примеры" }).getByRole("listitem");

async function searchFor(page: Page, q: string) {
  await field(page).fill(q);
  await field(page).press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: q })).toBeVisible();
}

test("kiffer: translations, the meaning chips filter the examples, synonyms, conjugation; Back steps through queries", async ({ page }) => {
  const calls = await mockAll(page);
  await page.goto("/context");
  await expect(tabBar(page).getByRole("link", { name: "Контекст" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: "Контекст" })).toBeVisible();

  await searchFor(page, "kiffer");
  await expect(page).toHaveURL(/\/context\?q=kiffer$/);
  const translations = page.getByRole("list", { name: "Переводы по частоте" });
  await expect(translations.getByRole("listitem").first()).toContainText("тащиться");
  await expect(translations.getByRole("listitem").first()).toContainText("38%");
  await expect(page.getByRole("button", { name: "В карточки", exact: true })).toBeVisible();

  await expect(page.getByText("3 примера из веба")).toBeVisible();
  await expect(examples(page)).toHaveCount(3);
  await expect(examples(page).first().getByRole("link", { name: /Форум · forum\.exemple\.fr/ })).toHaveAttribute("target", "_blank");
  await page.getByRole("group", { name: "Значения" }).getByRole("button", { name: /нравиться/ }).click();
  await expect(examples(page)).toHaveCount(1);
  await expect(examples(page).first()).toContainText("Elle kiffe grave le mec de sa classe.");
  await page.getByRole("group", { name: "Значения" }).getByRole("button", { name: "Все · 3" }).click();
  await expect(examples(page)).toHaveCount(3);
  expect(calls.context).toEqual(["kiffer"]);

  await expect(page.getByText("это слово")).toBeVisible();
  await expect(page.getByRole("button", { name: "adorer — обожать" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Добавить surkiffer в карточки" })).toBeVisible();

  const conj = page.getByRole("button", { name: /Спряжение/ });
  await expect(conj).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("je kiffe · tu kiffes · il/elle kiffe…")).toBeVisible();
  await conj.click();
  await expect(conj).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("heading", { name: "Passé composé" })).toBeVisible();
  await expect(page.getByText("ai kiffé", { exact: true })).toBeVisible();

  // A synonym opens in «Контекст»; Back returns to kiffer from the saved results.
  await page.getByRole("button", { name: "triper — тащиться" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "triper" })).toBeVisible();
  await expect(page).toHaveURL(/q=triper$/);
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "kiffer" })).toBeVisible();
  expect(calls.lookup).toEqual(["kiffer", "triper"]);
});

test("an example goes into the saved word's card", async ({ page }) => {
  await mockAll(page);
  await page.goto("/context?q=se%20casser");
  await expect(page.getByRole("heading", { level: 1, name: "se casser" })).toBeVisible();
  const saved = page.getByRole("button", { name: "В библиотеке · Повседневное" });
  await expect(saved).toBeVisible();

  await page.getByRole("button", { name: `В карточку: ${CASSE[0].fr}` }).click();
  const sheet = page.getByRole("dialog", { name: "Пример" });
  await expect(sheet.getByText("сейчас 0 примеров из 5")).toBeVisible();
  await expect(sheet.getByRole("link", { name: /Soirée qui tourne mal/ })).toHaveAttribute("href", CASSE[0].url);
  await sheet.getByRole("button", { name: "В карточку слова" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Пример добавлен · se casser")).toBeVisible();
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
  await expect(examples(page)).toHaveCount(3);

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
  await expect(examples(page)).toHaveCount(3);

  await page.goto("/context");
  const history = page.getByRole("region", { name: "Недавние" });
  const row = history.getByRole("link", { name: /kiffer/ });
  await expect(row).toContainText("3 прим.");
  await expect(page.getByText("Из твоих карточек без примеров")).toBeVisible();
  await row.click();
  await expect(page.getByRole("heading", { level: 1, name: "kiffer" })).toBeVisible();
  await expect(examples(page)).toHaveCount(3);
  expect(calls.lookup).toEqual(["kiffer"]);
  expect(calls.context).toEqual(["kiffer"]);

  await page.goBack();
  await expect(row).toBeVisible();
  await context.setOffline(true);
  await expect(field(page)).toBeDisabled();
  await expect(field(page)).toHaveAttribute("placeholder", "Без сети — искать нельзя");
  await expect(page.getByText("Открываются прошлые запросы — они сохранены на телефоне.")).toBeVisible();
  await row.click();
  await expect(page.getByRole("heading", { level: 1, name: "kiffer" })).toBeVisible();
  await expect(examples(page)).toHaveCount(3);
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
