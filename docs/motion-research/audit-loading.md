# Audit: loading, pending and waiting states

Scope: every place where the user waits for something, from app boot to the AI flows. For each one: where it lives,
what the user sees, how long it lasts, and what is wrong with it. App code was not changed.

**Method.** The audit ran against the current production build (`.next` BUILD_ID 12:34, no sources newer) in
local-only mode on `next start -p 3112`. Playwright drove Chromium 1194 at 390×844 (and 1440×800 for desktop)
with CDP CPU throttling at 4× or 6× to stand in for a mid-range phone. Burst screenshots were taken every
40–250 ms. A `PerformanceObserver('layout-shift')` logged CLS with its sources. `/api/ai/*` was mocked with a
`fetch` override that streams NDJSON with set delays: suggest first row at 1.6 s, then +0.7 s per row; extract
first row at 3 s, then +0.9 s per row; classify returns 500 after 2.5 s.

All frames are in `/tmp/claude-0/-home-user-french-cards/ae44d364-7fd9-50b8-b908-ac71a97a6dd6/scratchpad/motion/audit/`. The
`strip-*.png` files are side-by-side sequences; the `log-*.txt` files hold the frame text and layout-shift
dumps. Durations below are measured under throttling unless marked "est.". At 1× CPU the Dexie-only states are
roughly 4–6× shorter.

---

## 1. Top findings, ranked

| # | Severity | Finding | Where |
|---|---|---|---|
| 1 | High | `Button loading` looks exactly like `disabled`: 40% opacity, no label change, no other sign of activity. This breaks DESKTOP-SPEC §2 "loading: the label is replaced by its progress text, width stays fixed". It affects every save: Добавить, Применить, Импортировать, Сохранить тему, Добавить N слов. On phones the whole footer goes grey, both buttons included. | `components/ui/Button.tsx:54-80` (`disabled={disabled \|\| loading}`, nothing else) |
| 2 | High | **Library (phone, «Темы») reflows after load. CLS 0.088 warm, 0.30 on first run.** «Дополнить карточки» comes from one liveQuery and appears first. ~70 ms later «Разложить по темам» comes from another and is inserted *above* it, then «Последняя раскладка» can follow. Each insert pushes the tile grid down 64–72 px. | `components/library/LibraryScreen.tsx:262, 277, 292` (three independent liveQueries, nothing reserves their space) |
| 3 | High | **Flash of the wrong state from defaults while settings load.** Settings renders `DEFAULT_SETTINGS` greyed for ~750 ms (6×), then snaps to the stored values (15→40, 3→2 grade buttons). The library renders the «Темы» view and tile skeletons before it switches to «Все слова», then shows «Загружаем…» with no skeleton. | `components/settings/SettingsScreen.tsx:62`; `components/library/LibraryScreen.tsx:69` (`view = settings?.library_view ?? "themes"`) |
| 4 | High | **Quick add, closing after «Добавить»: stale content during the exit animation.** As the sheet slides down it re-renders the saved word as a *duplicate*: «Карточка № 013» and the beige «Уже есть в теме «Деньги»» notice. The «Добавлено» snackbar is drawn on top of the sinking sheet. | `components/add/QuickAddSheet.tsx:395-397` (form state is kept until `onClosed`, and the duplicate liveQuery still runs) |
| 5 | Med-High | **The review card jumps when it loads (phone).** The placeholder starts at y=76 and fills the column (flex-1, ~690 px). The real card starts at y=122, because the progress row is inserted above it, and is 104 px shorter, because the hint row and grade-bar space are only reserved on desktop. Mobile cold boot holds the placeholder 2.1 s at 6× (0.9 s warm). | `components/review/ReviewScreen.tsx:488-494`, `ReviewCard.tsx:388-400` (`max-md:hidden` spacer) |
| 6 | Medium | **Blank card between cards after every grade.** While `awaiting` waits for a fresh read, `current` is undefined and the empty `ReviewCardPlaceholder` (red rule, white body) shows for 1–3 frames (~140 ms at 6×). The word vanishes, then the next one appears. | `ReviewScreen.tsx:165-167, 533-535` |
| 7 | Medium | **Desktop detail pane blinks on every ↑/↓.** `WordDetailBody` is keyed by word id, so each cursor move remounts it. The `useLiveQuery` result is undefined for one async tick and `<div class="min-h-40" aria-busy>` replaces the whole pane: 3–4 blank rAF frames per keypress at 4×. | `components/library/LibraryDesk.tsx:667`, `WordDetailBody.tsx:664` |
| 8 | Medium | **Suggest ("Варианты") skeleton does not match the real rows.** The two skeleton rows are 44 px; real rows are min 72 px. Each streamed row pushes «Заполнить вручную» down 72 px, and the two skeleton rows stay until `done` even after the 3rd (max) row, so the list ends at 5 rows and then collapses by 88 px. CLS 0.063. When the stream fails with no rows, the whole panel is replaced by notice + quick form, and «Словарь» *moves* from above to below. | `components/add/SearchPanel.tsx:263`, `parts.tsx:224-247`, `SearchPanel.tsx:112-122` |
| 9 | Medium | **Long AI waits look frozen.** Import «Распознаём слова…» sits still for 3–8 s before the first row: the bar jumps 6%→16%→22% and stops, the scan line is static, and step 01 says «Текст найден · ИДЁТ» before any text is found. The sort plan («Составляем план…») and enrich plan skeletons are fully static for 5–30 s (est.). On a phone a still screen is hard to tell from a hung one. | `components/import/ProcessingView.tsx:16-22, 141`; `SortPlanSheet.tsx:238-256` |
| 10 | Medium | **Route and Suspense fallbacks are empty.** `/library/[id]` falls back to an empty `<main aria-busy>`: the first client-nav frame is the bare paper and tab bar (~200 ms at 6×). Then the theme title is empty, the progress bar and «⋯» pop in, and only then the skeleton list shows. There is no `loading.tsx` anywhere and no `useLinkStatus` / pending sign on the tab bar or sidebar. | `app/(app)/library/[id]/page.tsx:11`; `FolderScreen.tsx:86, 108, 134, 171` |

Other cross-cutting problems:

- **Three different skeleton fills.** `bg-surface-2` is used in suggest, sort plan, theme list and import;
  `bg-hover` in DeskPlaceholder and WordTable; `TileSkeleton` is a white card with a rule border. Bar radius and
  heights also vary. DESKTOP-SPEC asks for `#e8e8e4`.
- **No show-delay threshold anywhere.** Placeholders mount on the first undefined tick. For Dexie reads that take
  10–50 ms at 1×, this produces flicker (findings 6 and 7) rather than useful feedback. Nielsen's limits apply
  here: under 0.1 s needs no indicator; 0.1–1 s needs only continuity; over 1 s needs a progress sign.
- **No motion in any long wait.** The brand bans shimmer and glow, and the app currently has *nothing* in their
  place: no ticking counter, no moving rule, no typewriter caret. The only loading motion is the import scan line
  and bar (`transition 500ms`), and it only moves when a row arrives.
- **Errors are hard cuts with no continuity.** Skeleton → error text, processing → review list, sheet → nothing.
  The sort-plan error is one plain line of text with no icon and no cause.

---

## 2. Inventory by area

Legend: **Sees** = what is on screen. **Dur** = observed duration (6× / 4× CPU), or est. **Problems** marked
⚠ (fix), △ (polish).

### 2.1 Boot, database, seed, auth

| State | File:line | Sees | Dur | Problems |
|---|---|---|---|---|
| First paint before hydration | `app/layout.tsx`; `app/(app)/layout.tsx` | Server HTML: shell, tab bar, review top bar chips, and an empty card placeholder (review route). | 300–800 ms | △ Fine. The theme init script prevents a flash of the wrong theme. |
| `useBootstrap` → `seedIfNeeded` | `components/providers/AppProviders.tsx:21-44`; `lib/seed.ts:272-284` | `ready=false` gates the review data and library tiles. | First run 1–2 s; later runs one IDB get | ⚠ Seed failure is only `console.error`, then `ready=true` and the app shows an empty library with no message. △ Library counts and chips are *not* gated by `ready` (`LibraryScreen.tsx:103` gates tiles only). During a first-run seed, «0 слов · 0 тем · Новая тема» flashed for ~400 ms before 11 words appeared (strip-B-library.png, frame 3). |
| AuthGate session check (Supabase mode) | `components/auth/AuthGate.tsx:14-55` | Children render optimistically. On `signed_out`, `redirecting` → `return null` → blank page, then `/login`. | getSession plus a network check, est. 100–800 ms | ⚠ A signed-out user sees the real app for a moment, then a blank frame, then login. No calm "Проверяем вход…" interstitial. Not testable here (local-only). |
| Login submit | `components/auth/LoginScreen.tsx:173-181, 290` | Label becomes «Входим…» / «Отправляем…», `aria-busy`, disabled. | 0.3–2 s | △ Good. It follows the spec token. Errors show inline. |
| Reset link check | `components/auth/ResetPasswordScreen.tsx:65, 117` | «Проверяем ссылку…» text; «Сохраняем…» on submit. | est. 0.3–1 s | △ Good. |
| Offline page | `app/~offline/page.tsx`; `components/pwa/OfflineRetry.tsx` | Static card, «Повторить» = `location.reload()`. | n/a | △ No pending state on Повторить, and no automatic retry on the `online` event. |

### 2.2 Review

| State | File:line | Sees | Dur | Problems |
|---|---|---|---|---|
| Screen loading (`loading = !loaded \|\| shown === undefined`) | `ReviewScreen.tsx:135-179, 488-494`; `ReviewCard.tsx:388-400` | Phone: an empty card with only the red header rule, no progress row. Desktop: card outline with two hairline bars (matches spec). | Cold 2.1 s / warm 0.9 s (6×) | ⚠ Phone geometry jump (finding 5). △ The top bar's progress row appears late, which is fine on desktop (reserved) but not on phones. |
| Awaiting a fresh read after grade/undo | `ReviewScreen.tsx:59-82, 165-167, 281-291, 533-535` | Blank placeholder card between cards (strip-G.png). | ~140 ms (6×), est. 20–40 ms at 1× | ⚠ Flicker (finding 6). Better: keep the old card in its fly-out/exit pose until the next one is ready, or skip the placeholder under ~150 ms. |
| Grade save error | `ReviewScreen.tsx:286-288` | Snackbar «Не получилось сохранить ответ». The card comes back on its question side. | — | △ OK. No retry action in the snackbar. |
| Practice queue building | `ReviewScreen.tsx:294-312`; `SessionDone.tsx:168-184` | «Повторить ошибки» / «Ещё практика» drop to 40% opacity. | est. 30–150 ms | △ Same disabled-looks-busy issue. It is short, so it only flickers. |
| Done-screen data | `SessionDone.tsx:69, 93` | `<div class="flex-1" />`: blank between the last card and «Готово на сегодня». | 1–3 frames | △ The last card disappears into blank paper before the receipt appears. No continuity. |
| Undo | `ReviewScreen.tsx:223-260` | Card returns; snackbar «Ответ отменён · word». | <100 ms | △ Fine. |

### 2.3 Library, themes, word table, word detail

| State | File:line | Sees | Dur | Problems |
|---|---|---|---|---|
| Phone «Темы» view | `LibraryScreen.tsx:103, 123-135, 262-325`; `FolderTile.tsx:64` | Title, search and chips (no counts), «ТЕМЫ» rule, 6 white tile skeletons, then the counts and action rows pop in. | 0.9–1.4 s (6×) | ⚠ CLS 0.088 (finding 2). △ The meta line «11 слов» reserves height (`min-h-4`) but not the chip counts, so chip widths grow (tiny CLS). |
| Phone «Все слова» view | `LibraryScreen.tsx:69, 196-231` | The wrong view (themes and tiles) first, then «ЗАГРУЖАЕМ…» with an empty list, then rows (strip-I.png). | 0.65 s wrong view + 0.25 s empty | ⚠ Finding 3. The list has no skeleton rows (FolderScreen has them; this has not). |
| Search / filter in progress | `LibraryScreen.tsx:200-208`; `LibraryDesk.tsx:572` | «Ищем…» while `useDeferredValue` lags. | 1–2 frames | △ OK. It is the spec copy. |
| Theme page, client nav | `app/(app)/library/[id]/page.tsx:11`; `FolderScreen.tsx:54-68, 86-187` | Blank page, then header with an empty h1 (`min-h-10` reserved), then title, progress, «⋯», then skeleton rows, then rows. | ~200 ms blank + ~250 ms partial (6×) | ⚠ Finding 10. △ The progress bar row (`mt-3 h-4`) appears without reserved space, a 28 px shift. «Повторить тему» footer pops in. |
| Theme page, cold URL | same | Two frames of only the tab bar, then title, then the empty state. | ~480 ms (6×) | Same. |
| Desktop first paint (before layout is known) | `DeskPlaceholder.tsx:5-18` | Title and 5 skeleton rows at y≈100 under an ink rule. | ~400 ms (4×) | △ Then LibraryDesk mounts with its *own* skeleton at a different y (table header at 64). Then the toolbar, search and filters render and push the table down 48 px (CLS 0.016). That is three different layouts in about 900 ms (strip-H2.png). |
| Desktop table loading | `WordTable.tsx:161-166` | 5 rows of `bg-hover` bars; pane says «Выберите слово». | 0.3–0.5 s | △ OK per spec. Sidebar theme list and counts pop in separately. |
| Word detail sheet (phone) | `WordDetailSheet.tsx`; `WordDetailBody.tsx:307` | Content is already there while the sheet slides up (Dexie wins the race). | — | △ Good in practice. The `min-h-40` fallback would show an empty sheet if IDB were slow. |
| Word detail pane (desktop) | `LibraryDesk.tsx:667`; `WordDetailBody.tsx:664` | Pane blinks blank on each cursor move. | 3–4 frames per key | ⚠ Finding 7. Keep the previous word until the new one resolves, or drop the key. |
| «Обновить перевод и заметку» | `WordDetailBody.tsx:1028-1034, 1230-1256, 1331-1340` | The label becomes «Подбираем…», disabled. Result is shown inline as a diff, or as an error line with role=alert. | est. 2–6 s (AI) | △ The label follows the spec. ⚠ No cancel while it loads (abort only on unmount). On phones `Button loading` is used, so the button also greys to 40%. |
| Folder create/edit save | `FolderFormSheet.tsx:161, 298` | Greyed button. | <100 ms | Finding 1. |

### 2.4 Quick add

| State | File:line | Sees | Dur | Problems |
|---|---|---|---|---|
| Sheet open | `QuickAddSheet.tsx`; vaul in `ui/Sheet.tsx` | Slide-up; «Недавние» already there. | ~300 ms | △ Fine. |
| Local lexique (first open) | `QuickAddSheet.tsx:145-156`; `lib/lexique.ts` | Nothing; «Словарь» appears once the 164 KB gz / 790 KB JSON has loaded and parsed. | est. 0.2 s on wifi, 1–3 s on slow 3G | △ «Словарь» pops in *above* the already-visible «Варианты» skeleton and pushes it down. No placeholder, although the section copy promises «работает без сети». |
| Suggest debounce plus stream | `lib/use-suggest.ts:214-253`; `SearchPanel.tsx:233-271`; `parts.tsx:224-247` | «ВАРИАНТЫ» header and 2 static hairline skeleton rows from the first keystroke (during the 300 ms debounce). Rows stream in above the skeleton. | 1.5–5 s (model) | ⚠ Finding 8 (height mismatch, skeleton kept after the max row count, collapse on done). △ Narrowing kept results while typing is well designed: rows are not dropped needlessly. |
| Suggest error with rows | `SearchPanel.tsx:268-270`; `parts.tsx:303-325` | Notice «Подсказки не загрузились…» + «Повторить» under the rows. | — | △ Good recovery. |
| Suggest error, no rows | `QuickAddSheet.tsx:196-197`; `SearchPanel.tsx:112-117` | The whole panel switches to notice + quick form; «Словарь» jumps below (strip-C-err-form.png). | — | ⚠ Layout reorder at the moment of failure. Offline is detected up front (no wait), which is good. |
| Form auto-enrich (level/example/theme) | `use-auto-enrich.ts:24-65`; `parts.tsx:510-519`; `DeskWordForm.tsx:63, 203` | «определяется…» caption only on «Уровень сленга», and only when the level is not set by hand. Example and theme fill in silently. | 0.7 s debounce + est. 1–3 s | △ The example field shows its placeholder «Фраза по-французски», then text appears with no cue. Errors are swallowed silently (acceptable for background work, but there is no "не определилось" state). |
| Save («Добавить», «Добавить и ещё») | `QuickAddSheet.tsx:385-405, 565-590` | Both footer buttons go 40% grey; then the sheet closes and the snackbar shows. | 50–150 ms | ⚠ Finding 1 and finding 4 (stale duplicate flash on close). |
| Save error | `QuickAddSheet.tsx:401` (`setSaveError`) | Inline error. | — | △ OK. |

### 2.5 «Список» (paste a list)

| State | File:line | Sees | Dur | Problems |
|---|---|---|---|---|
| Duplicate check per row | `QuickAddSheet.tsx:200-201` | Tags appear when the liveQuery resolves. | <50 ms | △ Fine. |
| Row enrich | `QuickAddSheet.tsx:241-258`; `ListPanel.tsx:158-172` | Nothing per row, then the slang meter, theme and example line appear all at once. | 0.8 s debounce + est. 1–4 s | ⚠ Each row grows from 56 to 76 px when the example lands, so the whole list reflows together. No per-row or list-level "определяем…" status; `useAutoEnrich`'s pending boolean is discarded here. |
| Save | `QuickAddSheet.tsx:579`; `DeskListPanel.tsx:61` | Greyed button / desktop `KeyButton busy`. | <200 ms | Finding 1. |

### 2.6 Screenshot import

| State | File:line | Sees | Dur | Problems |
|---|---|---|---|---|
| Pick → begin | `ImportScreen.tsx:92-115` | Pick view stays until `start()` (awaits folders and settings). | <50 ms | △ Fine. |
| Preparing (decode/tile/compress) | `lib/image-prep.ts`; `ProcessingView.tsx:91` | «Готовим скриншот…», bar at 6%. | <450 ms at 4× for 1170×2532 | △ Fine. |
| Uploading / waiting for the first row | `ProcessingView.tsx:16-22, 86-91, 141` | «Распознаём слова…», bar at 16→22%, red scan line static, «ИЩЕМ СЛОВА», 4 static skeleton rows. | 3–8 s (est. Haiku 2–4 s, Sonnet 4–10 s) | ⚠ Finding 9: looks frozen; step 01 «Текст найден» is labelled ИДЁТ before anything is found. «Стоп» works (abort). No timeout. |
| Streaming rows | `ProcessingView.tsx:152-165` | Rows append, skeletons slide down (CLS 0.02 per row, intended), counter «3 слова». | +0.5–1 s per row | △ Good. Steps advance. |
| Checking duplicates | `ImportScreen.tsx:141-163` | «Проверяем повторы…», Стоп disabled. | <100 ms | △ Fine. |
| Processing → review | `ImportScreen.tsx:216-257` | Hard cut to a different layout (checkbox rows, two lines). | — | △ No continuity: the streamed rows don't become the review rows. |
| Errors | `ImportScreen.tsx:229-246`; `StatusView.tsx` | Icon, serif title, message, «Повторить» (if retryable), «Выбрать другой скриншот». | — | △ Good recovery. Rate-limit carries `retryAfter` in the message, but there is no countdown or auto-retry. |
| Add N words | `ImportScreen.tsx:169-210`; `ReviewView.tsx:229`; `DeskReviewView.tsx:291, 416` | Phone: greyed button. Desktop: «Добавляем…» label. | <200 ms | Finding 1 (phone). Desktop follows the spec. |

### 2.7 «Разложить по темам» / «Дополнить карточки»

| State | File:line | Sees | Dur | Problems |
|---|---|---|---|---|
| Plan generation | `SortPlanSheet.tsx:58-82, 236-256`; `lib/reorg.ts:651-674` | Phone: «СОСТАВЛЯЕМ ПЛАН…» then «· n / m» during the assign pass, with 3 static group skeletons; «Применить» is a grey block. Desktop: a single text line, no skeleton. | Taxonomy pass with no progress (est. 3–10 s) + assign batches (est. 2–15 s) | ⚠ Static for the whole wait (finding 9). △ The taxonomy pass shows no step. «Отмена» works (closing aborts). A grey disabled primary for 10+ s reads as broken. |
| Plan error | `SortPlanSheet.tsx:80, 115-125, 258+` | One text line + «Повторить» / «Закрыть». | — | △ Recovery is good, but the message is bare (no icon or cause) and a hard cut from the skeleton. 429 retries happen silently for up to 20 s × 3 with no "ждём…" (`reorg.ts:606-611`). |
| Apply | `SortPlanSheet.tsx:94-120, 151, 474` | Greyed «Применить N». | <300 ms | Finding 1. Undo snackbar afterwards is good. |
| Enrich plan | `EnrichPlanSheet.tsx:165, 200-201, 303-305` | «Подбираем примеры · n / m». | est. 3–20 s | Same pattern as the sort plan. |

### 2.8 Settings and sync

| State | File:line | Sees | Dur | Problems |
|---|---|---|---|---|
| Settings read | `SettingsScreen.tsx:61-63`; `DesktopSettings.tsx` | Defaults with every control disabled (grey toggles), then the stored values snap in. | ~750 ms (6×) | ⚠ Finding 3. Should wait or show neutral (valueless) rows. |
| Sync status line | `lib/sync.ts:312-341`; `settings/format.ts:43-53`; `DataSection.tsx:169-199` | `…` while auth loads; «синхронизация…» while syncing; «только что» / «нет сети» / «ошибка» with a dot. | Cycles every write (3 s debounce) | △ The text swaps on every cycle (width changes; on the sidebar the line flickers after each edit). ⚠ The error detail (`status.error`) is never shown; tapping «ошибка» re-syncs with no feedback but the text change. Phones show no sync state anywhere outside Settings. |
| Sidebar/rail sync line | `shell/data.ts:119-126`; `Sidebar.tsx:100`; `Rail.tsx:114` | «Синхронизация…» / «· только что». | same | △ Same flicker. |
| Export JSON | `DataSection.tsx:73-83, 203-208, 248-254` | Desktop: «Сохраняем…». Phone: the row just greys (no label). | 0.1–1 s; iOS share sheet | △ Phone has no progress label. |
| Import JSON (read + preview) | `DataSection.tsx:86-101`; `BackupImportSheet.tsx:34-48` | Desktop «Читаем файл…»; phone grey row; confirm sheet with greyed «Импортировать», not dismissible while busy. | est. 0.1–2 s for large files | △ Same; good that it can't be dismissed mid-write. |
| Legacy HTML import | `DataSection.tsx:133-157` | Same as above. | | |
| Sign-out | `DataSection.tsx:159-167, 221-228, 270-277` | Grey row (no label), then AuthGate → blank → /login. | network | △ No «Выходим…»; blank frame before login. |

### 2.9 Shell, routes, PWA

| State | File:line | Sees | Problems |
|---|---|---|---|
| Route transitions | no `loading.tsx` in `app/`; `app/(app)/page.tsx:8` (`Suspense fallback={null}` for the folder param), `library/[id]/page.tsx:11` | Instant for prerendered static routes; a blank frame for the dynamic theme route. | △ No `useLinkStatus` pending cue on TabBar/Sidebar for a slow non-prefetched nav. |
| Desktop dialogs | `ui/Sheet.tsx:223` | Appear and disappear with no transition. | △ Abrupt next to the animated phone sheets (motion audit covers this). |
| Snackbar | `ui/Snackbar.tsx:161, 198` | 160 ms rise-in, respects reduced motion. | △ Good. Overlaps a closing sheet (finding 4). |
| SW registration / update | `components/pwa/RegisterSW.tsx` | Silent. | △ No "обновлено" or reload cue; fine for now. |

---

## 3. What already works

- Desktop review loading matches the spec: the card outline at its final position, two hairline bars, and the
  grade row reserved. No shift was measured.
- Suggest narrows results while typing (`planSuggest`), so they don't flash on every keystroke. Responses are
  cached and every request is abortable. `online` triggers a retry.
- Import has real steps, a progress bar, a working «Стоп» that keeps rows already received, good error screens
  with retry, and a reassuring footnote.
- Login, reset password, desktop settings rows and «Обновить перевод» use the correct spec pattern: the label
  changes to progress text and `aria-busy` is set.
- Every bulk change (sort plan, import, backup import, list save) ends with an undo snackbar.
- `prefers-reduced-motion` turns off all animations globally (`globals.css:214-219`).

## 4. Implications for the next phase (inputs for mockups, not decisions)

1. **One pending-button pattern** (spec §2 already defines it): keep the width, swap the label to progress text,
   set `aria-busy`, keep full contrast. Optionally add a 1 px ink underline that runs once across the button
   ("ink drawn"). This needs a shimmer-free "busy" look distinct from disabled.
2. **Reserve space for anything that resolves late.** Library action rows, theme progress row and «⋯», the phone
   review progress row, hint and grade spacer. Show the settings-dependent view only once settings are known (or
   cache `library_view` in localStorage for the first frame).
3. **Show-delay of about 150 ms for Dexie placeholders** (review between cards, detail pane, done screen):
   keep the previous content instead of blanking.
4. **Make long waits visibly alive without shimmer**, as a catalogue-like progress sign: a ticking mono elapsed
   counter («0:04»), a 1 px ink rule drawing across, the red scan line slowly travelling, a caret blinking in the
   first skeleton row, or rows that "type" in. Use one token for skeleton fill (`#e8e8e4`) and one bar geometry.
5. **Skeleton rows that match real row heights** (72 px variants, 56 px import, 40/48 px table). Drop skeletons
   once the expected count is reached.
6. **Continuity on outcome transitions**: streamed rows → review rows, skeleton → error notice (in place),
   sheet close freezing its last state (no re-render during the exit).
