# «Карточки» — inventory of the REAL app (for desktop mockups)

Source: /home/user/french_cards as of 2026-10-22. Everything below exists in code unless marked **[NEW]**.
Where the built app differs from mockups/SPEC.md, the built app is listed (SPEC drift noted as «SPEC drift»).

---

## 0. Layout constraints today (what desktop must replace)

- **Shell** `app/(app)/layout.tsx`: `mx-auto flex w-full max-w-[440px] flex-1 flex-col` + safe-area paddings. Every app route (/, /library, /library/[id], /import, /settings) lives in this 440px column. `--shell-bottom` = 61px tab bar + home indicator (or just the indicator on /import).
- Pages own a 16px side gutter (`px-4`) and their own `<main>`; header rows are 44px (`h-11`) 16px below the top.
- **TabBar** `components/ui/TabBar.tsx`: `fixed bottom-0`, `max-w-[440px]`, 3 equal columns, 60px + safe-area, white surface, 1px top rule. Items: «Повторение» (icon `cards`, href `/`), «Добавить» (icon `plus`, a button that opens the quick-add sheet, `aria-haspopup="dialog"`), «Библиотека» (icon `library`, href `/library`). Active = ink 600 + 2px red bar on top. `/settings` and `/library/*` mark «Библиотека» active; `/` marks «Повторение». Hidden on `/import*` (full-screen flow).
- **Sheet** `components/ui/Sheet.tsx`: vaul Drawer bottom sheet, `max-w-[440px]`, radius 12 top, 1px ink top rule, grab handle 36×4, scrim `--scrim`. Heights: `auto` (content, ≤ full), `large` (78% of viewport — quick-add search), `full` (top 56px below safe area — word detail, sort plan, add form/list). Optional sticky `footer`, follows `visualViewport` to stay above the iOS keyboard, supports `nested` sheets (sheet on sheet). Drag/scrim/Escape close it.
- **Snackbar**: ink bar 48px, white text, underlined action «Отменить», radius 6. Two kinds: global floating (`useSnackbar`, sits above tab bar / docked bottom bars via `--bottom-clearance`) and inline in-flow (review screen, between card and grade buttons; 5 s, pauses on hover/focus). Inside a sheet the snackbar renders in the sheet's slot.
- **Header** `components/ui/Header.tsx`: 44px row, back arrow (history back or `fallbackHref`), title Newsreader 22 or mono eyebrow, right actions.
- Responsive breakpoints: **none**. No `sm:/md:/lg:` Tailwind breakpoints anywhere. Only `pointer-coarse:text-[16px]` (iOS zoom guard) and one `[@media(pointer:fine)]` hint on the import drop zone. No `hover:` styles at all (only `active:` pressed states) — desktop hover states are **[NEW]**.
- Root `<html lang="ru">`, fonts: IBM Plex Sans (400/500/600, latin+cyrillic), IBM Plex Mono (400/500), Newsreader (400/500 + italic, latin only).
- Tokens live in `app/globals.css` (`--paper #f1f1ee`, `--surface #fff`, `--surface-2 #e8e8e4`, `--ink #111`, `--muted #5a5a57`, `--rule #d6d6d1`, `--red #c8331f`, `--again #b3261e`, `--good #1d6b45`, `--warn #8a5a00`, `--warn-bg #fbf3df`, `--warn-edge #c99a2e`, `--scrim`, `--on-ink`) + dark set (via prefers-color-scheme unless `data-theme="light"`, or forced `data-theme="dark"`). Radii: `rounded-card` 6, `rounded-btn` 6, `rounded-chip` 4. Utility classes `.meta` (mono 11px uppercase .06em muted) and `.abbr` (Newsreader italic muted).

---

## 1. Routes and screens

| Route | Screen component | Tab bar | Notes |
|---|---|---|---|
| `/` | `ReviewScreen` (+ `ReviewFolderParam` applies `?folder=<id\|inbox\|all>` then strips it) | yes, «Повторение» | Review / session done / practice / empty states |
| `/library` | `LibraryScreen` | yes, «Библиотека» | title «Библиотека» |
| `/library/[id]` | `FolderScreen` (`/library/inbox` = «Входящие») | yes, «Библиотека» | title «Тема · Карточки» |
| `/import` | `ImportScreen` | **no** | title «Импорт со скриншота · Карточки». Also receives Web Share Target images (`SharedImages`) |
| `/settings` | `SettingsScreen` | yes («Библиотека» active) | Header «Настройки», back → history or `/` |
| `/login` | `LoginScreen` | no | own 440px column |
| `/auth/reset` | `ResetPasswordScreen` | no | «НОВЫЙ ПАРОЛЬ» |
| `/auth/confirm` | route handler → `/auth/reset` | – | |
| `/~offline` | offline fallback page (SW) | no | |
| global | `QuickAddSheet` (mounted once in `AppProviders`, opened by `useAddSheet().open({fr?})`) | – | opened from tab «Добавить», empty states, search «Добавить «X»», session done |
| global | `InstallHint` (iOS Safari only, not standalone) | – | «Поделиться → На экран «Домой»» |

There is no `/done` route: «Готово на сегодня» is an in-page state of `/`.

---

## 2. Review `/` — states, actions, copy

### Top bar (`ReviewTopBar`, one row, no app mark — user request 2026-10-22)
- Left: direction chip (mono) `FR → RU` / `RU → FR` / `FR ↔ RU` + swap icon; click **cycles** fr_ru → ru_fr → both (aria «Направление … , сменить»). Theme chip with dropdown caret: «Все темы» / «Входящие» / theme name → opens `FolderPickerSheet` («Темы», radio list: name Newsreader 19 + mono `42 · 6 к повт.` + check).
- During practice the two chips are replaced by chip «Закончить практику» (close icon).
- Right: undo icon button (aria «Отменить последний ответ», `aria-keyshortcuts="Z"`, disabled when nothing to undo today) + gear link to `/settings` (aria «Настройки»).
- Filter (direction + folder) is remembered per device in localStorage `kartochki:review-filter`; `direction: null` follows `settings.default_direction`.

### Progress line (`ProgressLine`)
- Mono 11px uppercase: left `23 к повторению · 4 новых` (queueSummary), right `07 / 30` (done / total, zero-padded). 1px rule line with 1px ink fill + 5px ink tick at the position.
- In practice: left «Практика · не влияет на расписание», right cleared/total.

### States
1. **Loading** — `ReviewCardPlaceholder` (empty card shell with header rule).
2. **Empty library** (`EmptyLibrary`) — meta «Повторение», h1 «Пока нет слов», «Добавьте первое слово или выражение — оно появится здесь карточкой с переводом.»; buttons «Добавить слово» (primary, plus icon → add sheet) + «Импорт со скриншота» (tertiary link → /import).
3. **Empty folder** (`EmptyFolder`) — meta «тема: {name}», h1 «В этой теме пока нет слов»; «Все темы» (primary) + «Добавить слова» (tertiary).
4. **Question side** — the whole card is a button (aria «Карточка {prompt}, перевернуть», `aria-keyshortcuts="Space"`). Card: white, radius 6, 1px rule, header 46px with mono label `FR` or `RU` and a 2px red bottom border (index-card rule). Prompt Newsreader 500: 40px (≤16 chars) / 32px (≤28) / 26px; under it the POS abbr (`n. f.`, `v. pron.`, `adj.`, `adv.`, `expr.`) only for FR→RU. Footer 48px: flip icon + «тапни, чтобы перевернуть». Card has `min-h-[280px]` and flexes to fill height. Grade bar and swipe hint keep their space but are invisible/inert (card size does not jump on flip).
   - SPEC drift: there is **no «Показать ответ» button** in the built app; tapping the card flips it.
5. **Answer side** — `<article>` card: header label + `SlangMeter` (meter + italic abbr, e.g. `▮▮▮▯ arg. · verl.`); FR word h2 (same size steps), POS abbr, RU 22px 500, note 14px muted (max 32ch, pre-line), example block after a rule: FR italic Newsreader 17 + RU 13 muted; footer «тема: **{name}**» (or «Входящие»). Body scrolls if long. Tap on card → flip back to question (unflip). Flip animations `card-turn-up/down` 220ms.
   - Swipe hint row (only if swipe_grading on): `← Не знаю` · `тап — вопрос` · `Знаю →` (mono meta).
   - Grade bar (`GradeBar`): outlined 56px buttons. 3 buttons grid `1.15fr .85fr 1.15fr`: «Не знаю» (again red border/text), «Сложно» (rule border, ink), «Знаю» (good green). 2-button mode: «Не знаю» / «Знаю». Sub-label = next interval in mono 11px («<1 мин», «6 мин», «1 д»; previewed at reveal time). No intervals in practice. `aria-keyshortcuts` 1/2/3.
6. **Swipe in progress** — card translates + rotates (max 15°), next card peeks behind (scale .96), stamp «ЗНАЮ» (green, rotated −8°, left) or «НЕ ЗНАЮ» (red, +8°, right), mono 20px, 2px border. Threshold ⅓ card width or flick ≥0.5 px/ms. Haptics on Android/iOS 18 if enabled.
7. **After a grade** — inline snackbar «{Не знаю|Сложно|Знаю} · *la thune*» + «Отменить» (5 s). After undo: «Ответ отменён · *word*». Error: «Не получилось сохранить ответ».
8. **Session done** (`SessionDone`) — meta «Сессия · 21 октября»; h1 Newsreader 34 «Готово на сегодня» (focusable); receipt table between ink rules with dotted leaders: «Повторено» N / «Новых» N / «Верно» `92 %`; or «Сегодня повторять нечего.»; next line meta «Следующие 18 слов — завтра» / «Следующее слово — завтра» / «Следующий показ — через 4 д». «Трудные» list (mono label + red count; up to 5 rows: FR Newsreader 19 · RU muted · SlangMeter; «И ещё N слов»). Bottom buttons: «Повторить ошибки (3)» (primary, only if mistakes > 0), «Ещё практика» / «не влияет на расписание» (outlined 56px two-line), «Добавить слова» (tertiary → add sheet). Inline snackbar sits above the buttons.
9. **Practice mode** (mistakes = today's again/hard; extra = recent) — same card + grade bar, no intervals, does NOT change scheduling; undo walks practice history; end → snackbar «Практика окончена». Toasts when nothing to practice: «Сегодня ошибок не было» / «Пока нечего повторять — сначала ответьте на несколько карточек».
10. Study day starts at 04:00 local (`DAY_START_HOUR = 4`); the screen re-reads every 60 s and on focus/visibility.

### Review keyboard shortcuts (implemented, `components/review/keys.ts`)
- **Space / Enter / NumpadEnter**: flip; on the answer side, flip back (unflip).
- **1 / 2 / 3** (Digit or Numpad, by `code` so Russian layout works): grade Не знаю / Сложно / Знаю (answer side only). In 2-button mode: 1 = Не знаю, 2 or 3 = Знаю. 4 ignored.
- **← / →**: Не знаю / Знаю (answer side only).
- **Z** (by `code`, i.e. «я» on Russian layout): undo last answer.
- Ignored with Alt/Ctrl/Meta, key repeat, while typing in a field, while the folder picker/add sheet or any `[role=dialog]` is open. Space/Enter on a keyboard-focused control activates the control instead (pointer-focused controls don't swallow flip).
- Focus management: after reveal focus goes to the answer card, after grading to the next question card (or the «Готово на сегодня» heading).
- No visible keyboard hints anywhere (SPEC: «Tiny keyboard hint is NOT shown on mobile») — a desktop hint row would be **[NEW]**.

---

## 3. Library `/library` — states, actions, copy

- Header: h1 «Библиотека» (Newsreader 28) + gear link «Настройки».
- Subline meta: `158 слов · 23 к повторению` (due part in ink 500).
- Search: 44px input, radius 4, search icon, placeholder «Поиск по FR и RU», clear button «Очистить поиск». Accent/case-insensitive across FR and RU.
- Filter chip row (horizontal scroll on phone): «Все» (selected when no filter) · «К повторению» + count · «Трудные» + count · «Сленг ▾» (label becomes «Сленг: arg.» or «Сленг: 3» when several). The slang chip toggles an inline panel below: meta «Уровень сленга», «Сбросить» link, multi-select chips `нейтр.` `fam.` `arg.` `vulg.` `verl.` (Newsreader italic). Escape closes the panel. SPEC drift: SPEC said «Сленг: все ▾»; no «Без папки» chip exists.
- **Browse mode** (no query/filter):
  - Re-sort row button (if any words): «Разложить по темам» + caption «7 слов без темы» or «Все слова разложены», chevron → `SortPlanSheet`.
  - If an undoable reorg run exists: «Последняя раскладка: 12 перемещений» + tertiary «Отменить» → snackbar «Сортировка отменена» / «Отменять нечего: слова уже перемещены».
  - Section rule: «Темы» … `7 тем · 151 слово`.
  - 2-column grid of tiles (96px tall): **InboxTile** first if inbox non-empty (dashed border, «Входящие», red mono «7 без темы», caption «нужно разобрать»); **FolderTile** per theme (3px top band in theme color, name Newsreader 19, meta `42 · 6 к повт.`, 2px mastery line in theme color); **NewFolderTile** dashed «+ Новая тема» → `FolderFormSheet`. Loading: 6 tile skeletons.
- **List mode** (query or filter active): section header «Найдено N слов» / «Ничего не найдено» / «Ищем…» … «Уровень · показ»; `WordList` with `showFolder` (RU line gets « · {theme}»); capped at 200 rows with «Показаны первые 200. Уточните поиск, чтобы увидеть остальные.» Empty copy: «Такого слова нет ни во французском, ни в переводе.» + secondary «Добавить «{query}»» (opens add sheet prefilled) / «Сегодня повторять нечего.» / «Трудных слов нет.» / «С таким уровнем сленга слов нет.»
- Snackbar after creating a theme: «Тема «X» создана».

### SortPlanSheet («Разложить по темам», full sheet)
- Title «Предлагаемые перемещения», close X.
- Loading: meta «Составляем план…» or «Составляем план · 2 / 4» + hairline skeleton groups.
- Error: message + footer «Закрыть» / «Повторить» (refresh icon). Default error «Не получилось составить план. Попробуйте ещё раз.»
- Empty: «Всё уже на своих местах» / «Перемещать нечего. Слова, разложенные вручную, не трогаются.» + «Закрыть».
- Ready: meta «12 перемещений · 1 новая тема»; «Слова, разложенные вручную, не трогаются (64 слова).»; groups separated by rules: «→ Деньги» + mono count + toggle (aria «Перемещать в «Деньги»» / «Создать тему «Транспорт»»); new theme tag «новая тема» (dashed); disabled group shows «· не перемещать» and dims; too-small new theme: «Для новой темы нужно ещё N слов.» (min 3 words); group «Остаются на месте» (no toggle). Each word row (FR Newsreader 17 + RU muted, «вручную» if retargeted) opens nested `TargetPickerSheet` «Куда переместить» (options include «Входящие» / «без темы», new themes / «новая тема», «оставить где есть»).
- Footer: «Можно отменить в течение 7 дней.» + «Отмена» (tertiary) / «Применить» + count (primary). Snackbar «Перемещено 12 слов · 1 новая тема» + «Отменить»; «Нечего перемещать: слова уже изменились».

### FolderFormSheet («Новая тема» / «Изменить тема»)
- Fields: meta «Название» (input Newsreader 19, placeholder «Например, Транспорт», max 40), «Описание» (textarea, placeholder «Что сюда попадает», hint «По описанию новые слова раскладываются в эту тему.», max 200), «Цвет» (radio swatches 28px with a top band; arrow keys move). Error «Введите название темы». Button «Создать тему» / «Сохранить».

---

## 4. Folder `/library/[id]` — states, actions, copy

- Header: back link (aria «Назад в библиотеку»), eyebrow meta «Библиотека / тема», right «⋯» (aria «Ещё действия с темой», only for real themes, not inbox).
- h1 Newsreader 32 name (or «Входящие»); tag «закреплена» if `locked`.
- Meta: `18 слов` (inbox: `7 слов без темы`) · red `3 к повторению`.
- Mastery: 2px bar in theme color + meta `64 % выучено` (role progressbar «Выучено»).
- Column header meta: «Слово» … «Уровень · показ» then `WordList`.
- Empty: «В этой теме пока нет слов.» / inbox: «Здесь пусто — все слова разложены по темам.» + secondary «Добавить слово».
- Loading: 5 skeleton rows.
- Missing: «Тема не найдена» / «Возможно, её удалили на другом устройстве.» + «В библиотеку».
- Sticky bottom bar above tab bar: primary «Повторить тему» + mono count (due + new) → `/?folder=<id|inbox>`.
- Folder menu sheet («⋯»): «Название, описание и цвет» (pencil → FolderFormSheet), «Закрепить тему» toggle + «Раскладка по темам не переименует её и не будет забирать из неё слова.», «Удалить тему» (red, trash) + «Слова из удалённой темы попадут во «Входящие».» Delete → back to /library + snackbar «Тема «X» удалена · 5 слов во «Входящих»» + «Отменить».

### WordList rows (shared by Folder and Library list mode)
- Row 64px, hairline below: status dot 6px (new = ink outline, learning = amber `bg-warn`, known = green, difficult = red), FR Newsreader 19 + POS abbr (library uses `loc.` for expressions), RU 14 muted (+ « · theme» in search), right column: SlangMeter **meter only** + mono due label: «к повт.» (red 500), «новое» (ink 500), «через 6 д» (muted).
- Status labels (a11y): новое / учится / выучено / трудное.
- **Tap** → `WordDetailSheet`.
- **Swipe left** (touch, also mouse-drag via pointer events) reveals 160px actions: «Переместить» (88px, surface-2, move icon) + «Удалить» (72px, red bg). Tap open row closes it.
- **Long press 500ms (touch) / right-click / context-menu key** → action sheet with the word as title: «Открыть карточку», «Переместить в тему», «Удалить слово» (red).
- Move → `TargetPickerSheet` «Переместить в тему» (subtitle = FR italic; options «Входящие»/«без темы» dashed, then themes with color band) → snackbar «Перемещено в «Деньги»» / «Перемещено во «Входящие»» + «Отменить».
- Delete (soft) → snackbar «Удалено · {fr}» + «Отменить».
- No multi-select / bulk actions on word lists today — bulk select would be **[NEW]**.

### WordDetailSheet («Карточка слова», full-height sheet)
- Top row: theme chip with color tick + caret («Деньги ▾» / «Входящие») → nested picker «Тема»; close X. 2px red rule under it.
- Entry: FR Newsreader 36 + pencil «Изменить слово и перевод»; POS abbr · SlangMeter; RU 18.
  - Edit entry form: «Французский», «Русский», «Уровень сленга» segmented (нейтр. / fam. / arg. / vulg.) + «verl.» toggle; «Сохранить» / «Отмена». Duplicate guard: ««la thune» уже есть в «Деньги».» → button becomes «Сохранить всё равно».
- Fields with pencil: «Заметка» (or «Нет заметки»), «Пример» (FR italic + RU muted, or «Нет примера»; edit placeholders «Phrase en français» / «Перевод»).
- «Повторение» section (ink rule) + «N показов»: per direction rows `FR → RU` | «следующий показ через 4 д» / «пора повторить» / «новая карточка» | «стаб. 9 д».
- History strip: 8 squares (oldest→newest): filled ink = знаю, outlined = сложно, red = не знаю, dashed = empty; legend «знаю · сложно · не знаю».
- «Обновить перевод и заметку» (secondary, refresh icon; loading «Подбираем…») → diff panel «Предлагаемые изменения» with checkboxes per field (Перевод / Заметка / Пример / Уровень сленга / Часть речи; before struck-through, after ink) → «Принять N» / «Оставить как есть». States: «Перевод и заметка уже актуальны.», «Вариантов не нашлось.», errors («Нет сети. Попробуйте, когда появится интернет.», «Слишком много запросов. Попробуйте через минуту.» …). Snackbar «Перевод и заметка обновлены» + «Отменить».
- «Сбросить прогресс» (tertiary) → snackbar «Прогресс сброшен» + «Отменить». «Удалить слово» (danger) → closes, snackbar «Удалено · fr».
- Footer meta «Добавлено 12.09.2026 · вручную» (sources: вручную / из подсказок / со скриншота / из импорта).

---

## 5. Quick add (`QuickAddSheet`, global bottom sheet)

Modes: `search` (sheet `large`, 78%) → `form` (full) → back; `list` (full).
- Chrome: mono label `Карточка № 159` (next card number) or `Список · 3 строки`, close X; title «Новое слово» / «Несколько слов»; tools (search/form only): «Скриншот» (camera, link → /import, closes sheet) and «Список» (clipboard). Back arrow «Назад к поиску» in form/list. 2px red rule under the chrome.
- **Search / empty**: headword input 56px Newsreader 22, placeholder «Слово или выражение — FR или RU», clear «Стереть». Caption «Перевод, заметка, уровень сленга и тема заполнятся сами — останется только проверить.» (or «Подсказки выключены в настройках — перевод и тему заполни сам.»). «Недавние» (+ meta «Сегодня · N»): rows FR/RU + SlangMeter + mono «Тема: Деньги» → opens WordDetailSheet. Footnote «Несколько слов сразу — через «Список». Со скриншота — через «Скриншот».» Pasting multi-line text switches to «Список».
- **Search / typing**: direction auto-detected (FR vs RU).
  - «Словарь» (aside «работает без сети», local lexique, FR only, up to 3 rows, 44px): typed prefix ink, rest muted, POS abbr, arrow-up-left icon; click substitutes the word (aria «Подставить: …»).
  - «Варианты» (aside «перевод · уровень · тема» or «по-французски · уровень · тема»): rows ≥72px FR + abbr / RU / SlangMeter / mono «Тема: Повседневное»; loading = 2 hairline skeleton rows; «Вариантов не нашлось.»
  - «Заполнить вручную» row.
  - Duplicate notice (dashed warn box): «Уже есть в теме «Деньги»» / «во «Входящих»» + `№ 042` + preview + «Открыть» / «Всё равно добавить».
  - Suggestion errors: «Нет сети — подсказки недоступны. Заполни вручную, мы синхронизируем позже.» / «Подсказки недоступны. Заполни вручную.» / «Слишком много запросов подряд. …» / «Подсказки не загрузились. …» + «Повторить». In these cases a quick inline form appears (other-language field + «Тема» select) with footer «Добавить».
  - **Enter** in the headword: saves quick form, or picks the first «Вариант», or flushes loading, or opens manual form.
- **Form** (`WordForm`): FieldRows «Французский» (Newsreader), «Русский», «Заметка» (placeholder «Оттенок, синонимы, происхождение»), «Пример» («Фраза по-французски» / «Перевод примера»); «Уровень сленга» segmented нейтр./fam./arg./vulg. (+ caption «определён автоматически») + «verl.» checkbox; «Тема» chips: auto pick selected + caption «подобрано автоматически», alternatives, dashed «+ новая тема: X», «Другие темы ▾» expands all; checkbox row «Карточки в обе стороны» / `FR → RU · RU → FR`. Errors «Нужно французское слово» / «Нужен перевод». Enter in FR/RU moves on/submits. Footer: «Добавить и ещё» (secondary; keeps sheet open, shows in-sheet undo bar 7 s) + «Добавить» (primary). Snackbar «Добавлено · {fr}» + «Отменить».
- **List** («Список»): textarea placeholder `la thune — бабки, деньги\nkiffer — тащиться\nchelou — стрёмный`; «Тема» select; «Разбор» `3 из 5` rows with checkboxes and tags «уже есть» / «повтор» / «нет французского» / «нет перевода»; footer «Добавить 5 слов». Snackbar «Добавлено 5 слов».

---

## 6. Import `/import` (full-screen, no tab bar)

- **Pick** (`PickView`): Header «Импорт со скриншота». Dashed drop zone (min 300px): camera icon, «Скриншот со словами» (while dragging: «Отпустите, чтобы распознать», solid ink border), «Переписка, пост, субтитры или список слов с переводом. Длинный скриншот разрежем на части.», meta «PNG, JPEG, WebP · до 4 фрагментов», pointer-fine only: «Можно перетащить сюда или вставить». Buttons «Выбрать скриншот» (primary) + «Вставить из буфера» (secondary, if Clipboard API). Window-level **paste (Ctrl/Cmd+V) and drag-and-drop already work**. Errors: «В буфере обмена нет изображения.», «Нет доступа к буферу обмена. Вставьте скриншот сочетанием клавиш или выберите файл.», too many / unsupported. Footnote «Скриншот не сохраняется — только слова.»
- **Processing** (`ProcessingView`): 120×220 thumbnail with a red scan line + `1/2` badge; «Готовим скриншот…» / «Распознаём слова…» / «Проверяем повторы…»; «Скриншот 1 из 1 · 2 фрагмента»; progress line; meta «N слов» / «Ищем слова»; steps `01 Текст найден`, `02 Перевод и уровень`, `03 Проверка повторов` (done check / red «ИДЁТ»). «Найдено» … «По мере распознавания» streamed rows (FR, RU italic if guessed, SlangMeter) + skeletons. Sticky footer «Стоп» (secondary, stop icon) + footnote.
- **Review** (`ReviewView`): Header «Найдено 9 слов» + right «Выбрать все» / «Снять все». Collapsible screenshot strip «Скриншот(ы)». Notices «Распознавание остановлено — здесь то, что успели найти.» / «Распознано не всё: связь прервалась.» + «Распознать заново». Column header `ОТМЕЧЕНО 5 ИЗ 9` … `УРОВЕНЬ · ТЕМА`. Rows: square checkbox, FR Newsreader 19 / RU 14 (italic + mono tag `ДОГАДКА` when the translation was not on the screenshot; «нет перевода» in red), SlangMeter, «Тема: X» link → picker. Duplicate rows greyed + tag `УЖЕ ЕСТЬ` + existing theme. Low-confidence rows: dashed warn box, alert icon + issue («Перевод под вопросом» default) + «Проверить». Tap row text → inline `RowEditor` (Французский / Русский / Заметка «необязательно» / level segmented + verl.; Escape cancels; «Нужны и французское слово, и перевод.»). Sticky bottom bar: chip «Тема для всех ▾» + primary «Добавить 5 слов» / «Ничего не отмечено». FolderPicker sheet: «Тема для всех» (subtitle «Отмечено: 5 слов») or «Тема»; options «Входящие» / «без темы», «+ Транспорт» / «новая тема», themes.
- After add: navigates to /library + snackbar «Добавлено 5 · Повторить сейчас» (link) + «Отменить» → «Импорт отменён». «Эти слова уже есть в библиотеке» / «Нечего добавить».
- **Status** (`StatusView`): titles «Нет сети» / «Подождите немного» / «Нужен вход» / «Не получилось» / «Слов не найдено» («На скриншоте не нашлось французских слов. Попробуйте другой скриншот или обрежьте лишнее.»); «Повторить» + «Выбрать другой скриншот».

---

## 7. Settings `/settings`

Header «Настройки». Sections = mono label with ink rule, rows with hairlines.
- **Повторение**: «Направление по умолчанию» → `DirectionSheet` («Направление», radio of two rows: mono `FR → RU` + muted «с французского на русский», `RU → FR` + «с русского на французский»; «FR ↔ RU» exists only on the review chip, not as a default; changing it clears the review screen's override); «Новых карточек в день» stepper (− / + , aria «Меньше»/«Больше», 0–999, default 15); «Кнопки оценки» segmented «2» / «3»; «Свайпы для оценки» toggle; «Вибрация при свайпах» toggle.
- **Оформление**: «Тема» segmented «Система» / «Светлая» / «Тёмная».
- **Подсказки**: «Автоподсказки при вводе» toggle; «Раскладывать по темам автоматически» toggle; privacy line «Слова и скриншоты отправляются в Anthropic (Claude) для подсказок и не хранятся там.»
- **Данные**: «Синхронизация» row with status dot + mono text (`n.d…@pm.me · только что`, «синхронизация…», «нет сети», «ошибка», «только на этом устройстве», «вход не выполнен»); tap = sync now. «Экспорт JSON» (download icon) → toast «Резервная копия сохранена». «Импорт JSON» → `BackupImportSheet` («Импорт копии», preview lines Слова/Темы/Прогресс/История, «Из копии берутся записи, которые новее, чем на этом устройстве. Сразу после импорта его можно отменить.», «Импортировать» / «Отмена»). «Импорт из старой версии (HTML)». «Выйти» (red, only when signed in).
- InstallHint inline at the bottom (iOS Safari).
- Toast on failure «Не получилось сохранить настройку».

---

## 8. Auth `/login`, `/auth/reset`, offline

- Login: AppMark (card glyph) + «Карточки» Newsreader 40, tagline italic «Слова, которые хочется запомнить.» Index-card panel with mono header «ВХОД» / «НОВЫЙ АККАУНТ» / «СБРОС ПАРОЛЯ» and red rule; fields email + «Пароль» / «Пароль (от N символов)» / «Повторите пароль»; buttons «Войти» / «Создать аккаунт» / «Отправить ссылку» (loading «Входим…» / «Отправляем…»); links «Забыли пароль?», «Создать аккаунт», «← Уже есть пароль — войти»; footnote «Вход по паролю работает и в приложении на главном экране iPhone.» Notices: «Аккаунт создан. Подтвердите почту…», «Письмо со ссылкой для сброса отправлено на …». Local-only mode: panel «ВХОД НЕ НУЖЕН» / «Синхронизация выключена: все слова и прогресс хранятся только на этом устройстве.» + link into app. Errors in components/auth/messages.ts (e.g. «Неверная почта или пароль.», «С этого адреса войти нельзя.»).
- Reset: «НОВЫЙ ПАРОЛЬ», «Проверяем ссылку…», «Новый пароль (от N символов)», «Сохранить пароль» / «Сохраняем…», «Открыть карточки» / «Ко входу».
- Offline page `/~offline`: index card «Нет сети», FR word «hors ligne» *loc. adj.*, «Эта страница ещё не сохранена на телефоне», body, «Проверь подключение и попробуй ещё раз», retry + «Открыть повторение».
- AuthGate: no session → /login; offline on a previously signed-in device keeps working.

---

## 9. Data model (lib/types.ts) — exact names and UI labels

**Word**: `id`, `fr` («Французский»), `ru` («Русский» / «Перевод»), `note` («Заметка»), `example_fr` / `example_ru` («Пример»), `pos` (`noun|verb|adj|adv|expression|other` → abbr `n. m.` `n. f.` `n. m. et f.` `n.` `v.` `v. pron.` `adj.` `adv.` `expr.`/`loc.`; label «Часть речи» in diff), `gender` (`m|f|mf|none`), `slang_level` 0–3 («Уровень сленга»: `нейтр.` `fam.` `arg.` `vulg.`; SR names нейтральный/фамильярный/арго/вульгарный), `verlan` (`verl.`), `tags: string[]` (**not shown anywhere in UI**), `folder_id` (null = «Входящие»; UI «Тема»), `folder_source` `auto|user` (user = «разложено вручную», never auto-moved), `folder_confidence` `high|med|low|null`, `source` `manual|suggest|screenshot|import` (вручную / из подсказок / со скриншота / из импорта), `both_directions` («Карточки в обе стороны»), `created_at` («Добавлено 12.09.2026»), `updated_at`, `deleted_at` (soft delete).

**Folder** («тема»): `id`, `slug`, `name`, `description` («Описание», used by auto-sort), `color` (theme ink; palette starts #5a5a57 Повседневное, #2f6b4f Деньги, #a0522d Еда, #2f4b8a Полиция, #6b4a8a Тусовка, #a33a3a Эмоции, #2f6f74 Люди, then extras), `created_by` `user|auto`, `locked` («Закрепить тему» / tag «закреплена»), `sort`. Default themes: Повседневное, Деньги, Еда, Полиция, Тусовка, Эмоции, Люди.

**Folder stats** (`getLibraryStats`): `total`, `due` (words with a non-new card due today → «к повт.»), `difficult`, `fresh` (never reviewed), `mastery` 0..1 (mean stability/21 d → «64 % выучено»). Totals / inbox / per-folder.

**ReviewState** (per word × direction, id `${word_id}:${direction}`): `due`, `stability` («стаб. 9 д»), `difficulty`, `elapsed_days`, `scheduled_days`, `learning_steps`, `reps`, `lapses`, `state` 0 New / 1 Learning / 2 Review / 3 Relearning, `last_review`. Derived word status: new / learning / known / difficult (difficult = lapses ≥2 or relearning or reps ≥3 & difficulty ≥8).

**ReviewLog**: `rating` 1 Again / 2 Hard / 3 Good / 4 Easy (Easy never offered), `review` time, `prev` snapshot (for undo). Undo = soft-delete log + restore prev.

**ReorgRun**: `moves[{word_id, from, to, from_source, from_confidence}]`, `created_folders`, `applied_at`; undoable for 7 days.

**Session** counts: `due`, `new` (new still allowed today, capped by `new_per_day`), `done`, `total` (→ `07 / 30`). DaySummary: reviewed, newCount, correctRate, mistakes, hardWords, dueTomorrow.

**Settings** (device-local, `lib/settings.ts`): `default_direction` (`fr_ru`; «Направление по умолчанию»), `new_per_day` (15, 0–999; «Новых карточек в день»), `grade_buttons` 2|3 (3; «Кнопки оценки»), `swipe_grading` (true; «Свайпы для оценки»), `haptics` (true; «Вибрация при свайпах»), `theme` system|light|dark («Тема»: Система/Светлая/Тёмная), `suggestions_enabled` (true; «Автоподсказки при вводе»), `auto_sort_enabled` (true; «Раскладывать по темам автоматически»), `last_sync_at`, `sync_cursors`.

Review filter (localStorage, not Settings): `{direction: fr_ru|ru_fr|both|null, folder: all|inbox|<id>}`.

---

## 10. Touch-only (or touch-first) interactions needing a desktop equivalent

| Today | Where | Desktop status |
|---|---|---|
| Tap card to flip; «тапни, чтобы перевернуть» caption | ReviewCard | Click + Space/Enter already work; caption says «тапни» — desktop copy **[NEW]** (e.g. «Пробел — перевернуть») |
| Swipe card left/right to grade + stamp | ReviewCard / useSwipe | Mouse-drag technically works (pointer events), keys ←/→ and 1/2/3 exist; no visible shortcut hints **[NEW]** |
| Swipe hint row `← Не знаю · тап — вопрос · Знаю →` | ReviewScreen | Touch wording |
| Swipe-left row actions «Переместить» / «Удалить» | SwipeRow / WordList | Right-click and context-menu key open the action sheet already; hover row actions / inline buttons **[NEW]** |
| Long-press row → action sheet | SwipeRow | Right-click equivalent exists (opens a bottom sheet, not a context menu) |
| Bottom sheets for everything (add, word detail, sort plan, pickers, folder menu, folder form, direction, backup) | ui/Sheet (vaul) | All capped at 440px and slide from the bottom; desktop dialogs / side panels / popovers **[NEW]** |
| Bottom TabBar with «Добавить» | ui/TabBar | Desktop sidebar/top nav **[NEW]** |
| Haptics, iOS keyboard tracking (`useVisualViewport`), install hint for iOS | lib/haptics, Sheet, InstallHint | Irrelevant on desktop |
| Chip row horizontal scroll bleeding into gutter | Library filters | Fits on desktop |
| Sticky bottom bars («Повторить тему», import «Добавить N слов», «Стоп», grade bar) | Folder/Import/Review | Need placement in a wide layout |

Already desktop-friendly: review keyboard shortcuts; import paste (Ctrl/Cmd+V) + drag-and-drop + «Вставить из буфера»; Enter-to-submit in add sheet; Escape closes sheets and the slang panel / import row editor; right-click on word rows; focus management and aria-keyshortcuts.

---

## 11. What does NOT exist (mark as [NEW] if shown in desktop mockups)

- Any desktop/wide layout, breakpoints, sidebar, multi-pane (library list + detail side by side), hover states, tooltips, visible shortcut legend, command palette, `/` to focus search, `N` to add, global shortcuts outside review.
- Multi-select / bulk move/delete in word lists; sorting options for lists (always newest first); column view/table.
- Statistics/history dashboard beyond the session-done receipt and per-word 8-square history (no streaks, charts, heatmaps).
- Tags UI (field exists in data, unused), «Легко»/Easy grade, editing a word inline in the list, drag-and-drop words between themes, reordering themes (`sort` exists, no UI).
- Separate «Ещё практика» settings, per-theme direction, search inside a folder screen (only library-wide search).
