# Карточки для Лизи: architecture and conventions

Read with `docs/plan.md` (scope and phases), `mockups/SPEC.md` (the v3 visual design: tokens, components, copy rules and every screen) and the mockup sources in `mockups/*.dc.html`. The mockups are the visual source of truth: match their layout, spacing, copy and states.

## Stack
- **App:** Next.js 16.4 App Router + Turbopack, React 19.3, TypeScript, Tailwind 4.
  - This Next is newer than most training data. Read `node_modules/next/dist/docs/` before using an API you're unsure of.
  - `cacheComponents: true` is on.
  - Request interception lives in `proxy.ts` (the old `middleware.ts` was renamed).
- **Data:** Dexie 4 (`lib/db.ts`) is the on-device source of truth. The UI reads it with `useLiveQuery` from `dexie-react-hooks`, so screens that use it are client components (`"use client"`).
- **Scheduling:** `ts-fsrs@5`, used only through `lib/scheduler.ts`.
- **Sync and auth:** Supabase (`@supabase/ssr` + `@supabase/supabase-js`).
  - Login is email + password (works inside the iOS home-screen app and needs no custom SMTP); only `ALLOWED_EMAIL` may sign in. Password reset links land on `/auth/confirm` → `/auth/reset`.
  - Sync is last-write-wins on `updated_at` with soft deletes (`deleted_at`). `review_log` rows are only ever soft-deleted (undo).
- **AI:**
  - Packages: `ai@7`, `@ai-sdk/anthropic@4`, `zod@4`.
  - Model `claude-haiku-5-5` with `providerOptions.anthropic.thinking = {type:'disabled'}`. Never set temperature/top_p/top_k and never prefill.
  - Use `streamText`/`generateText` with `output: Output.object|array(...)`.
  - Schemas: no `.min/.max/.length`, every field required (use `.nullable()`), confidence is an enum. Limits go in `.describe()` text, and results are sliced on the server.
  - The v7 API changed (`instructions`, `type:'file'` image parts, `Output`). Read the typings in `node_modules/ai` and `node_modules/@ai-sdk/anthropic` before writing calls.
- **PWA:** `app/manifest.ts` + Serwist via `@serwist/turbopack`.

## Product rules
- UI copy is Russian; words are French.
- Never show «ИИ»/«AI», sparkles or "magic" in the UI. The one exception is Settings: the section «ИИ» and its privacy line.
- Settings «ИИ» (device-local, `lib/types.ts` `Settings`): «Автоподсказки при вводе», «Определять уровень сленга», «Подбирать примеры», «Раскладывать по темам автоматически», «Писать заметки», «Вариантов» (1–3), «Регистр вариантов» (сленг / любой / нейтр.), «Модель: подсказки» and «Модель: скриншоты» (Быстрее = Haiku 5.5, Точнее = Sonnet 5.5). Clients send a tier (`model: "fast"|"accurate"`), never a model id; preferences go into the user message, so the system prompts stay frozen.
- Every word has `slang_level` 0..3 (нейтр./fam./arg./vulg.) and a `verlan` flag. Show it with the `SlangMeter` component.
- Dictionary abbreviations (n. m., v. pron., loc., fam., arg., verl.…) explain themselves on a tap with `AbbrHint` (glossary in `lib/abbr.ts`; `SlangMeter hints`) wherever they are not inside another button: the word sheet, the answer side of the review card and the add form's headword.
  - The level, an example and a theme are detected for every new word, not only picked suggestions: `/api/ai/enrich` fills the manual form and «Список» rows before saving (fields the user set by hand, including a chosen theme, are never overwritten), screenshot rows carry an example, and the quick one-line save fills them right after saving (`fillSavedWords`, skipped if the word was edited or undone meanwhile). Each part follows its own switch in Settings «ИИ».
  - Themes follow «Раскладывать по темам автоматически». In the form the pick works like a suggestion's (alternatives, «+ новая тема»). «Список» defaults to «По темам автоматически»: each row goes to its own theme, a new theme only when ≥3 rows share it, low confidence stays in «Входящие». After a quick save the word only moves from «Входящие» into an existing theme, never a new one.
  - «Дополнить карточки» in the library proposes examples for words without one and levels for hand-typed words still at the default, applied only after review, with undo.
- Folders («темы») hold words. `folder_id = null` means «Входящие» (Inbox).
  - Библиотека on phones (layout «C · Под пальцем», chosen 2026-10-22): a ledger strip «158 слов / 23 к повт. / 9 трудных» whose cells are also quick filters, a dashed «Входящие · N без темы — Разложить» row while something is unsorted, theme tiles that preview their three newest words, and the search with a «Фильтр и порядок» sheet (status, slang levels, theme, order) pinned at the bottom above the tab bar, riding on the keyboard while typing. Two views, remembered per device (`settings.library_view`): «Темы» (tiles) and «Все слова» (one list, «Показать ещё» per 200). A search or filter always shows the matching words; the order alone does not leave the tiles until «Показать». «Разложить по темам» (when nothing is unsorted), «Дополнить карточки» and the last re-sort's «Отменить» are quiet rows under the tiles. A long press on a theme tile (or Android's / the keyboard's context menu) opens the theme's actions instead of the theme: «Открыть тему», «Повторить тему» (when cards are due), «Тренировка всей темы», «Название, описание и цвет», «Закрепить тему», «Расформировать», «Удалить тему» (with undo) — the same `FolderMenuSheet` as «⋯» on the theme screen.
  - «Тренировка всей темы» (theme menus, and the theme screen's bottom button when nothing is due): `/?folder=<id>&practice=1` opens review straight into a practice round over every card of the theme, shuffled, capped at 200 (`buildPracticeQueue` scope «all»); like the other practice rounds it never writes to the schedule.
  - Buttons that call Claude carry the ink spark glyph (`spark`, `spark-refresh`, `spark-plus` in components/ui/Icons): word refresh, examples ↻ / «+», «Разложить», «Дополнить карточки», «Расформировать», «Распознать заново». Nothing else uses it.
  - Examples: a word has up to 5 (`lib/examples.ts`); the first stays in `example_fr` / `example_ru` (review card, Claude connector, older devices), the rest in `extra_examples` (jsonb, migration `0003_extra_examples.sql`, synced). `ExampleList` (components/examples) shows them with «другой пример» ↻ on each and «+ Ещё пример» under them; both ask `POST /api/ai/example` (card + the examples to avoid → one new sentence, null when nothing new fits). In the word's view they save at once with «Отменить»; in the add form and the edit forms they fill the fields (offline «+» adds an empty example to type). The review card shows the first two.
  - «Мои наборы» (Повторение, the «Что повторять» picker; mockups: canvas «Повторение — свой набор», option C): named card sets built from themes (several, «Входящие» included; none = all), word statuses (new / learning / difficult / known), slang levels, age (week / month) and a mode — «По расписанию» (only due + new cards, graded as usual) or «Тренировка» (every card, shuffled, the schedule untouched; picking the set opens straight into the round). Rows of the synced `review_sets` table (migration `0004_review_sets.sql`; soft deletes, last write wins like other rows, so every device sees the same sets; in the JSON backup). Sets stored the old way in `settings.review_sets` move into the table on the Dexie v2 upgrade (`legacyReviewSets`), and old backups are converted on import; the review filter names a set as `set:<id>`; `setSessionFilter` turns a set into a `SessionFilter` (`folderIds`, `slang`, `statuses`, `addedSince`) that `loadSession`, practice rounds and the done screen all honour.
  - «Расформировать» (phone menu, desktop theme menu «Расформировать…»): the classify assign pass picks another existing theme for every word of the theme — hand-placed ones too, since the theme goes away; INBOX or low confidence → «Входящие»; no new themes. The plan (`DisbandSheet`) lets any word be retargeted; applying deletes the theme and moves the words in one transaction (`disbandFolder`), undone with `restoreFolder` (words the user moved since stay put). Without suggestions (offline, error) «Всё во «Входящие»» still works.
  - Automatic sorting never moves a word whose `folder_source = 'user'`, and never renames or deletes a `locked` or user-created folder.
  - A new automatic folder needs ≥3 words.
  - Slang level is never a folder.
- Each word has a review state per direction: `fr_ru`, plus `ru_fr` when `both_directions`.
- Review sessions end («Готово на сегодня»). «Ещё практика» runs extra rounds that do NOT change scheduling.
- Grades: Не знаю = Again, Сложно = Hard, Знаю = Good.
- Nothing produced automatically (suggestions, screenshot rows, sort plans) is saved without the user confirming it. Every bulk change can be undone.

## Local-only mode
If `NEXT_PUBLIC_SUPABASE_URL` is unset, the app runs fully local: there is no login gate and sync is off. In that mode `/api/ai/*` is allowed only when `NODE_ENV !== 'production'`.

## Env vars
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `ALLOWED_EMAIL`
- `ANTHROPIC_API_KEY`
- `CRON_SECRET`
- See `.env.example`.

## Module map (ownership during the parallel build)
| Area | Files |
|---|---|
| Domain/data | `lib/types.ts`, `lib/db.ts` (shared, edit carefully), `lib/scheduler.ts`, `lib/session.ts`, `lib/words.ts`, `lib/folders.ts`, `lib/seed.ts`, `lib/backup.ts`, `lib/text.ts` (accent folding, normalization, duplicate detection) |
| Sync/auth | `lib/supabase/{client,server}.ts`, `lib/sync.ts`, `proxy.ts`, `supabase/migrations/*`, `app/login/*`, `app/api/cron/ping/route.ts`, `vercel.json`, `.env.example`, `components/auth/*` |
| UI kit + shell | `components/ui/*` (Button, Chip, SlangMeter, Sheet, Toggle, Segmented, Snackbar, Kbd, Icon set, AppMark, TabBar, Header), `app/(app)/layout.tsx`, `components/providers/*` (theme, db init, sync loop mount), `components/shell/*` (desktop sidebar/rail, global keys, «Клавиши», word drag-and-drop), `lib/use-media.ts`, `lib/key-names.ts` |
| AI core | `lib/ai/{schemas,prompts,model,auth,rate-limit,enrich}.ts`, `app/api/ai/{suggest,extract,classify,enrich}/route.ts`, `scripts/build-lexique.*`, `public/lexique/*`, `lib/lexique.ts` |
| Detection (slang level, example, theme) | `lib/enrich.ts` (requests, patches, library plan), `components/add/use-auto-enrich.ts`, `components/library/EnrichPlanSheet.tsx` |
| PWA | `app/manifest.ts`, `app/sw.ts`, `next.config.ts`, `public/icons/*`, `components/pwa/*` |
| Review screens | `app/(app)/page.tsx` (review), `app/(app)/done/*` or in-page done state, `components/review/*`, `app/(app)/settings/page.tsx`, `components/settings/*` |
| Examples | `lib/examples.ts`, `app/api/ai/example/route.ts`, `lib/ai/example.ts`, `components/examples/ExampleList.tsx`, `supabase/migrations/0003_extra_examples.sql` |
| Review sets | `lib/review-sets.ts`, `components/review/FolderPickerSheet.tsx`, `components/review/ReviewSetSheet.tsx`, `supabase/migrations/0004_review_sets.sql` |
| Library screens | `app/(app)/library/page.tsx`, `app/(app)/library/[id]/page.tsx`, `components/library/*` (tiles, folder list, word detail sheet, sort plan sheet, phone filter: `phone-filter.ts` + `LibraryFilterSheet.tsx`, «Расформировать»: `DisbandSheet.tsx` + `runDisband` in `lib/reorg.ts`), `lib/reorg.ts` |
| Add flow | `components/add/*` (QuickAddSheet, suggestion lists, filled form, duplicate/offline states), `lib/use-suggest.ts` |
| Import flow | `app/(app)/import/page.tsx`, `components/import/*`, `lib/image-prep.ts`, `lib/use-extract.ts` |

## Testing
- Vitest unit tests sit next to the code as `*.test.ts`.
- IndexedDB tests use `fake-indexeddb/auto`.
- Playwright e2e lives in `e2e/` at a mobile viewport (390×844), using the preinstalled Chromium (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; never run `playwright install`).
- Desktop e2e (`e2e/desktop-*.spec.ts`) runs only in the `desktop-chromium` project (1440×800); everything else runs in `mobile-chromium`.
- Before pushing: `npm run lint && npm run typecheck && npm test && npm run build`.
