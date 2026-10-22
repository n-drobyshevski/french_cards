# «Карточки» — mockup spec v3 (shared by every designer agent)

Product: mobile-first PWA of vocabulary flashcards, French → Russian (it is NOT a "slang app" — slang is
just one dimension: every word gets a detected slang level). App name everywhere: **Карточки для Лизи** (renamed 2026-10-22; home-screen label stays «Карточки»)
(plain, no tagline about slang). Single user. UI copy is **Russian**; card words are **French**.

## v3 DIRECTION — read this first, it overrides any older habit
The user said the previous mockups looked "AI-styled". v3 must NOT look like a generic AI-generated app:
- Sparkle: only as the ink «spark» glyph (Icons `spark`, `spark-refresh`, `spark-plus`: thin 1.5px four-point stars, ink colour, never filled, coloured or animated) on buttons that call Claude — «Обновить перевод и заметку», «Другой пример» ↻, «+ Ещё пример» / «Подобрать пример», «Разложить» / «Разложить по темам», «Дополнить карточки», «Расформировать», «Распознать заново» (option B of canvas «Пометка ИИ — варианты», chosen 2026-10-22). No other magic imagery. NO «ИИ» / «AI» labels in the UI, except the Settings section «ИИ» and its privacy line (changed 2026-10-22 at the user's request).
  Automatic features just work quietly and are described by what they do: «Варианты», «подобрано автоматически»,
  «догадка» (translation not visible on screenshot), «Разложить по темам».
- NO pastel pill soup, no tinted icon chips, no soft drop shadows, no big rounded "bubbly" cards, no gradient, no shimmer.
- Concept: **a paper index card / library card catalog**. Ink on paper, hairline rules, dictionary typography.
  Square-ish geometry (radius 4–8px), 1px rules, black primary buttons, ONE red ink accent used sparingly
  (the index-card red rule line, active states, counts that need attention).
- Metadata reads like a dictionary entry: part of speech and register as italic abbreviations
  (*n. f.*, *v. pron.*, *fam.*, *arg.*, *verl.*, *vulg.*), small caps / mono for counts and labels.

## Canvas file format (MUST follow — files fail silently otherwise)

Every artboard is one file `project/<Name>.dc.html`, fixed root 390×844 (phone). Exact skeleton:

```html
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Повторение — вопрос</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500&amp;family=IBM+Plex+Sans:wght@400;500;600&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap">
<style>
body{margin:0}
a{color:#111111}a:hover{color:#c8331f}
</style>
</helmet>
<div style="width: 390px; height: 844px; box-sizing: border-box; position: relative; overflow: hidden; background: #f1f1ee; color: #111111; font-family: 'IBM Plex Sans', system-ui, sans-serif; display: flex; flex-direction: column">
  ... screen ...
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>
class Component extends DCLogic {
renderVals() { return {}; }
}
</script>
</body>
</html>
```

Rules that bite:
- Keep `<script src="./support.js"></script>` EXACTLY. Close every non-void element, quote every attribute. `&` in URLs inside attributes → `&amp;`.
- Styling: inline `style="…"` on elements for everything design-specific (the editor edits these). `<helmet><style>` ONLY for `body{margin:0}`, `a`/`a:hover` colors, and tiny basics (e.g. `button{font:inherit}`, `input{font:inherit}`), no other class rules.
- Lay out with flex/grid + `gap`. Grids: `display:grid; grid-template-columns: repeat(N, minmax(0, 1fr))`.
- `{{hole}}` is a dotted lookup into `renderVals()` only, never an expression. Mostly write copy as literal markup. Use `<sc-for list="{{items}}" as="item" hint-placeholder-count="5">` for repeated rows (data from renderVals) when it saves lots of markup; otherwise literal markup is fine.
- Always include the `<script type="text/x-dc" data-dc-script …>` block with `class Component extends DCLogic`. Classic JS, no imports, no innerHTML/appendChild, no global keydown handlers.
- Links between artboards: `<a href="Review-Back.dc.html" style="…button look…">Показать</a>` — style the `<a>` itself as the button; no `<button>` inside an `<a>`.
- Static controls that don't navigate: real `<button type="button">`, `<input>` with `<label>`. Icon-only buttons need `aria-label`. Decorative SVG `aria-hidden="true"`.
- Icons: inline stroke SVG (24 viewBox, stroke-width 1.75–2, `stroke="currentColor"`, `fill="none"`, round caps/joins). NEVER emoji anywhere. No fake phone status bar, no notch drawing.
- No gradients-as-decoration, no left-border accent cards, no lorem ipsum. Use the sample data below.
- Touch targets ≥44px. Text contrast ≥4.5:1 (the tokens below pass).
- Safe areas: top padding 16px (no status bar drawn); bottom tab bar has 28px extra bottom padding (home indicator area).

## Tokens (light) — v3
- paper bg `#f1f1ee` (neutral light grey, NOT cream), card/surface `#ffffff`, surface-2 `#e8e8e4`, ink fg `#111111`, muted `#5a5a57`, rule `#d6d6d1`, strong rule `#111111`
- red ink accent `#c8331f` (index-card top rule, active tab marker, attention counts, links on hover). Use sparingly.
- primary button: ink `#111111` bg, white text. Secondary: white bg, 1px `#111111` border, ink text. Tertiary: text only, underlined on press.
- Не знаю (again) `#b3261e` text, bg white with 1px `#b3261e` border. Сложно: neutral ink text, 1px `#d6d6d1` border. Знаю (good) `#1d6b45` text, 1px `#1d6b45` border. Buttons are outlined, not tinted blobs.
- low-confidence / warning: `#8a5a00` text, `#fbf3df` bg, 1px dashed `#c99a2e` border.
- blue index-card ruled lines (optional, only on the review card): `#dfe6f3` 1px every 32px.
## Tokens (dark — only for the *-Dark boards)
- bg `#121212`, surface `#1b1b1a`, surface-2 `#262624`, fg `#ececea`, muted `#a3a39e`, rule `#33332f`, strong rule `#ececea`
- red ink `#ff6a52`; primary button ececea bg / 121212 text; again `#ff7b70`; good `#5cc58f`; card ruled lines `#22252c`.

## Type — v3
- French words: `Newsreader, Georgia, serif` 500 — card prompt 40px/1.1; list rows 19px.
- UI: `'IBM Plex Sans'` 15px base, 13px labels, 12px captions.
- Meta / counts / section labels: `'IBM Plex Mono'` 11–12px, uppercase, letter-spacing .06em, muted (e.g. `23 К ПОВТОРЕНИЮ`, `FR → RU`, `07 / 30`).
- Dictionary abbreviations (part of speech, register): Newsreader italic 15px muted, e.g. *v. pron. · arg.*
- App mark: «Карточки для Лизи» in Newsreader 500 22px, no italic, preceded by a tiny 10×14 outlined card glyph with a red top line.

## Shape & spacing
- Side gutter 16px. Radius: cards 6px, sheets 12px top, buttons 6px, inputs 4px, chips 4px (NOT pills). No shadows except the sheet: a single 1px rule on its top edge plus scrim `rgba(17,17,17,.4)`.
- Separate list items with 1px hairline rules, not boxed cards. Grids use rule lines.

## Slang level (the feature the user likes — make it visible but quiet)
Every word has a detected level on a 4-step scale: нейтр. → fam. → arg. → vulg. (verlan is a flag shown as *verl.* next to it).
- Draw it as a tiny 4-segment meter (each segment 10×3px, 2px gap, filled ink up to the level, rule color after) followed by the italic abbreviation: `▮▮▯▯ arg.` In vulg. the filled segments are red ink.
- Shown: on the card back, in Add-Filled (editable as a 4-option segmented control labelled «Уровень сленга» with an extra «verl.» toggle), in Import rows, in Folder rows (meter only), in Word-Detail. Library has a filter chip «Сленг: все ▾».

## Shared components (draw identically on every board that has them)
**Bottom tab bar** (Review, Library, Folder, Settings, Session-Done boards): absolute bottom, white bg, 1px top rule `#d6d6d1`, height 60px + 28px bottom padding. Three equal columns:
1. «Повторение» (link Main.dc.html) 2. «Добавить» with a plus glyph (link Add-Empty.dc.html) — NOT a raised floating circle; same row as the others, label + 20px icon, ink color 3. «Библиотека» (link Library.dc.html).
Active tab: ink text 600 + a 2px red-ink bar across the top of that column; inactive: muted.
Icons: simple 1.5px-stroke line icons, 20px.

**Chips/filters**: 30px tall, 10px padding, radius 4, 13px, 1px rule border, white bg; selected = ink bg, white text.

**Folder ("тема") presentation**: like card-catalog drawer labels — NO colored icon chips. Each theme = a white tile with 1px rule border, radius 6, a thin 3px top band in the theme color, name Newsreader 19px, counts in Plex Mono 11px muted (`42 · 6 К ПОВТ.`), and a 2px progress line at the bottom.
Theme colors (muted inks, used only for that top band and progress): Повседневное `#5a5a57`, Деньги `#2f6b4f`, Еда `#a0522d`, Полиция `#2f4b8a`, Тусовка `#6b4a8a`, Эмоции `#a33a3a`, Люди `#2f6f74`. «Входящие» (unsorted) uses a dashed border and no band, count in red ink.

## Copy rules
- Never «ИИ» / «AI» / «умный» / «магия» in UI, except the Settings section «ИИ» and its privacy line.
- Suggestions come in two quiet sections: «Словарь» (instant) and «Варианты» (richer, may load) — loading = 2 grey hairline skeleton rows, no "думает…".
- Theme picked automatically: chip selected + tiny muted caption «подобрано автоматически».
- Screenshot translation not present in image: italic text + mono tag `ДОГАДКА`.
- Re-sort button/screen: «Разложить по темам» / «Предлагаемые перемещения».
- Regenerate in word detail: «Обновить перевод и заметку».

## Sample data (use these, consistently)
Words (fr — ru — note — register — folder):
- se casser — свалить, сбежать — «Casse-toi» = грубое «свали». Ещё значит «сломаться» — argot — Повседневное
- la thune — бабки, деньги — Синонимы: le fric, l'oseille — argot — Деньги
- le fric — бабло — familier — Деньги
- bouffer — жрать, есть — familier — Еда
- les keufs — менты — verlan от «flics» — verlan — Полиция
- les flics — копы — familier — Полиция
- chelou — стрёмный, странный — verlan от «louche» — verlan — Эмоции
- kiffer — тащиться, обожать — argot — Эмоции
- la meuf — девушка, тёлка — verlan от «femme» — verlan — Люди
- un pote — кореш, друг — familier — Люди
- c'est ouf — это безумие — verlan от «fou» — verlan — Эмоции
- la galère — засада, мучение — familier — Повседневное
- se tirer — свалить — argot — Повседневное
- une blague — шутка — neutral (no badge) — Повседневное
- dépêche-toi — поторапливайся — neutral — Повседневное
- vas-y — давай — familier — Повседневное
Folder counts: Повседневное 42 / 6 due · Деньги 18 / 3 · Еда 15 / 2 · Полиция 9 / 2 · Тусовка 21 / 4 · Эмоции 27 / 5 · Люди 19 / 1 · Входящие 7 (shown first, amber).
Totals: 158 слов, today 23 к повторению, 12 новых.
Intervals under grade buttons (FSRS): Не знаю «<1 мин», Сложно «6 мин», Знаю «1 д»; for a mature card: «10 мин» / «3 д» / «9 д».

## v3 screen overrides (apply on top of the per-screen requirements below; where they conflict, v3 wins)
- Everywhere: badges like «ARGOT» pills → the slang meter + italic abbreviation. Folder chips → plain text «тема: Повседневное» in mono-label style or a 4px-radius outlined chip. Accent-blue `#2a46c9` no longer exists.
- Main / Review-Back / Swipe: the card is a real index card: white, radius 6, 1px rule border, a 2px red-ink line 44px from the top (the classic index-card header rule) with the «FR» meta label and the slang meter (on the back only) sitting above it; faint ruled lines below are optional. Top row: «Карточки» mark left, then mono `FR → RU` toggle chip, theme filter chip, undo + settings icon buttons. Progress = mono text `07 / 30` plus a 1px ink progress line. «Показать ответ» = full-width primary black button. Grade buttons outlined per tokens.
- Swipe stamp: outlined rectangle stamp «ЗНАЮ» in good green, like an ink rubber stamp (slight rotation, 2px border, mono caps). Snackbar: ink bg, white text, «Отменить» underlined.
- Session-Done: replace «Bravo !» italic hero with a plain receipt-like summary: Newsreader 34 «Готово на сегодня», then a ruled table (Повторено 30 / Новых 4 / Верно 92 %) in mono numbers right-aligned, «Трудные» list as text with hairlines.
- Add-* sheets: sections «Словарь» / «Варианты»; no sparkle, no «ИИ». Add-Filled: «Тема» chips with caption «подобрано автоматически» under the selected one; «+ новая тема: Побег» as an outlined dashed chip; «Уровень сленга» segmented control (нейтр. / fam. / arg. / vulg.) + «verl.» toggle; buttons «Добавить и ещё» (secondary) + «Добавить» (primary black).
- Import: rows separated by hairlines (not boxed cards), checkbox squares radius 2; «предложено ИИ» → mono tag `ДОГАДКА`; low-confidence row uses the warning tokens; header title «Найдено 9 слов».
- Library (phones, changed 2026-10-22 to layout «C · Под пальцем»): title «Библиотека» + gear; a white ruled ledger strip of three cells (Newsreader 26 number + mono label: `158 СЛОВ` / `23 К ПОВТ.` in red ink / `9 ТРУДНЫХ`), each a toggle filter (on = ink cell); a dashed «Входящие · 7 БЕЗ ТЕМЫ — Разложить ›» row only while something is unsorted; a black full-width «Все слова · 158 · одним списком» tile, then theme tiles per the catalog-label spec plus an italic serif line with the theme's three newest words; quiet ruled rows under the tiles («Разложить по темам», «Дополнить карточки», last re-sort «Отменить»). Search sits at the bottom above the tab bar: 48px box with a 1px ink border, «Поиск по FR и RU» and a sliders button opening the «Фильтр и порядок» sheet (Показать: Все / К повторению / Трудные / Новые; Уровень сленга chips with meters + «verl.»; Тема chips; Порядок: Сначала новые / По следующему показу / По алфавиту / Сначала трудные; footer «Сбросить» + «Показать N слов»). A long press on a theme tile opens the theme's actions sheet (Открыть тему / Повторить тему N (only when due) / Тренировка всей темы — «N слов вперемешку, не влияет на расписание.» / Название, описание и цвет / Закрепить тему / Расформировать — «Удалить тему, а слова разложить по другим темам.» / Удалить тему); «Расформировать» opens a plan sheet «Расформировать «Эмоции»» grouped «→ Повседневное 1 / → Входящие 1 БЕЗ ТЕМЫ», tap a word to retarget, footer «Отмена» + «Расформировать». Options and the earlier layout: Design canvas «Библиотека — варианты».
- Sort-Plan: title «Предлагаемые перемещения», sub «12 перемещений · 1 новая тема · слова, разложенные вручную, не трогаются». IMPORTANT data fix: the words moved to Деньги must NOT appear in the Folder board. Use → Деньги (3): le pognon, les ronds, être raide; → Эмоции (2): avoir la haine, être vénère; → новая тема «Транспорт» (3): la caisse, le tromé, la bécane; → Люди (2, toggle off): le daron, la daronne. Folder board lists Деньги words: la thune, le fric, l'oseille, le blé, raquer, être fauché, le flouze.
- Word-Detail: «Перегенерировать с ИИ» → «Обновить перевод и заметку»; history squares outlined/filled ink-style.
- Settings: section «ИИ» (renamed from «Подсказки» 2026-10-22): toggles «Автоподсказки при вводе», «Определять уровень сленга», «Подбирать примеры», «Раскладывать по темам автоматически», «Писать заметки»; mono segmented «Вариантов 1 / 2 / 3»; segmented «Регистр вариантов: Сленг / Любой / Нейтр.»; «Модель: подсказки» and «Модель: скриншоты» segmented «Быстрее / Точнее»; footer lines «"Точнее" отвечает медленнее…» and the privacy line «Слова и скриншоты отправляются в Anthropic (Claude) для подсказок и не хранятся там.» «Импорт из Petit Argot v1» → «Импорт из старой версии (HTML)».
- Login: big «Карточки для Лизи» mark (balanced over two lines on phones) (Newsreader 40) with the card glyph — no tagline (removed 2026-10-22). Built app: email + password fields (radius 4, 1px rule border, focused = 2px ink border), «Забыли пароль?» and «Создать аккаунт» links; the OTP board below is the original design.
- Dark boards: same structure with dark tokens.

## Screen-by-screen requirements
(Each board 390×844. Links in parentheses.)

### Main.dc.html — Review, question side
- Top row: direction chip «FR → RU» (with swap icon), theme filter chip «Все темы ▾», right side: undo icon button (aria-label «Отменить последний ответ»), settings gear icon button (link Settings.dc.html).
- Progress line: «23 к повторению · 4 новых» left, thin progress bar, «7/30» right.
- Card (surface, radius 20, fills the middle): top-left tiny uppercase «français», top-right register badge hidden on front (show nothing), centered French word «se casser» Newsreader 38px; below muted hint «тапни, чтобы перевернуть».
- Bottom slot (above tab bar): one full-width 52px button «Показать ответ» (accent, link Review-Back.dc.html).
- Tab bar (Повторение active).

### Review-Back.dc.html — answer side
- Same top + card, now: French word, divider 28px line, Russian «свалить, сбежать» 20px, register badge ARGOT, note block (muted 13px, max ~32ch) «Casse-toi — грубое «свали». Ещё значит «сломаться».», small example line in italic Newsreader «Allez, on se casse d'ici.» with muted RU «Ладно, сваливаем отсюда.», small folder chip «Повседневное» at the card bottom.
- Bottom slot: 3 buttons in a row, 56px tall: Не знаю (again soft bg, again text, sub-label «<1 мин»), Сложно (neutral, narrower — grid 1.15fr .85fr 1.15fr; sub «6 мин»), Знаю (good soft bg, good text, sub «1 д»). Each button is an <a> linking to Main.dc.html.
- Tiny keyboard hint is NOT shown on mobile.
- Tab bar.

### Review-Swipe.dc.html — swipe-drag in progress + undo snackbar
- Card on answer side for «la thune / бабки, деньги», rotated ~6deg and shifted ~70px right, with a green «ЗНАЮ» stamp label (good color border+text, rotated -8deg) fading in at top-left of the card; behind it a peek of the next card (surface, scaled .96, line border).
- Small caption under the card area: «← Не знаю · Знаю →» muted 12px.
- Snackbar above the bottom slot: dark (#161a2b) pill, white text «Знаю · chelou» + accent-light «Отменить» button.
- Bottom slot shows the 3 grade buttons. Tab bar.

### Session-Done.dc.html — session complete
- Big Newsreader italic «Bravo !» 40px, subtitle «На сегодня всё».
- Stats card: 3 columns: «30 повторено», «4 новых», «92% верно»; below a mini row «Трудные: chelou, la galère, se tirer» chips in again soft.
- Buttons (stacked, full width): «Повторить ошибки (3)» (accent), «Ещё практика» (surface outline, caption «не влияет на расписание»), «Добавить слова» (text link → Add-Empty.dc.html).
- Next review hint: «Следующие 18 слов — завтра».
- Tab bar.

### Add-Empty.dc.html — quick-add bottom sheet, empty
- Underlying screen dimmed (scrim), sheet occupies the bottom ~78% (sheet top at ~185px), keyboard area NOT drawn (just leave the sheet to the bottom).
- Sheet: grab handle; header row: title «Новое слово» (Newsreader 22), right: two pill buttons «Скриншот» (camera icon, link Import-Processing.dc.html) and «Список» (clipboard icon).
- One big input (56px, surface-2 bg, radius 14) with placeholder «Слово или выражение — FR или RU», focused (accent 2px ring), caret.
- Under it muted helper: «ИИ подскажет перевод, заметку и тему».
- Section «Недавние» with 3 compact recent rows (fr — ru — folder chip).
- Close (X) icon button top-right of sheet, aria-label «Закрыть» (link Main.dc.html).

### Add-Suggest.dc.html — typing «se cass», suggestions
- Same sheet. Input value «se cass|» (caret).
- Section «Словарь» (instant, local): 3 compact rows with the matched prefix in bold: **se cass**er · verbe; **se cass**er la tête · expr.; **cass**e-croûte · nom m. Each 44px.
- Section «ИИ» with a small accent sparkle icon and «думает…» shimmer on the third row: 2 rich suggestion cards (surface, radius 14): «se casser» — «свалить, сбежать» — ARGOT badge — folder chip «Повседневное»; «se casser la tête» — «ломать голову» — FAMILIER — «Повседневное». Third card = skeleton (surface-2 bars).
- Tapping first card links to Add-Filled.dc.html.

### Add-Filled.dc.html — suggestion picked, editable fields
- Sheet expanded (top ~70px). Fields stacked with labels: «Французский» = «se casser» (Newsreader 20 in the input), «Русский» = «свалить, сбежать», «Заметка» textarea «Casse-toi — грубое «свали». Ещё значит «сломаться».», «Пример» = «Allez, on se casse d'ici.».
- Register segmented chips: нейтр. / familier / ARGOT (selected) / verlan / vulgaire.
- «Тема»: chip row: «Повседневное» selected with small sparkle icon + «ИИ уверен» caption, alternatives «Тусовка», «Эмоции», and dashed chip «+ Новая: Уход/побег».
- Toggle row «Карточки в обе стороны (FR→RU и RU→FR)» on.
- Sticky bottom: two buttons: «Добавить и ещё» (outline) and «Добавить» (accent), side by side.

### Add-Duplicate.dc.html — duplicate warning + offline fallback
- Sheet with input «la thune»; amber info card: «Уже есть в «Деньги»» + row preview «la thune — бабки, деньги» + buttons «Открыть» / «Всё равно добавить».
- Below, an offline banner (muted surface-2 card, cloud-off icon): «Нет сети — ИИ-подсказки недоступны. Заполни вручную, мы синхронизируем позже.» and a plain manual form (FR, RU, Тема select «Входящие»).
- Bottom: «Добавить» accent button (disabled look for duplicate state is NOT needed; keep enabled).

### Import-Processing.dc.html — screenshot being processed
- Full-screen route (no tab bar). Header: back arrow (link Add-Empty.dc.html), title «Импорт со скриншота».
- Thumbnail of the screenshot: a 120×220 rounded image placeholder drawn as a mini fake chat (2–3 grey bubbles with tiny lines) — NOT a real image; next to it text «Распознаём слова…», «Скриншот 1 из 1 · 2 фрагмента», small progress bar.
- List: 2 already-streamed rows (real data: «chelou — стрёмный», «la meuf — девушка») + 4 skeleton rows.
- Bottom: outline button «Стоп». Footnote muted 12px: «Скриншот не сохраняется — только слова.»

### Import-Review.dc.html — review extracted rows
- Header: back arrow, title «Найдено 9 слов», right text button «Выбрать все».
- Collapsible thumbnail strip (small, 56px tall) «Скриншот ▸».
- Rows (each a surface card 12px radius, checkbox left, FR Newsreader 17 + RU 14, badges/folder chip right or below):
  1. ✓ chelou — стрёмный · VERLAN · Эмоции
  2. ✓ la meuf — девушка · VERLAN · Люди
  3. ✓ kiffer — тащиться · ARGOT · Эмоции
  4. ✓ c'est ouf — это безумие · VERLAN · Эмоции
  5. ✓ bouffer — *жрать, есть* (RU in italic) + «предложено ИИ» tiny badge (accent-soft) — translation wasn't on the screenshot
  6. ☐ low confidence: amber edge (1px #e9b949 border + amber soft bg), «la daronne — мать?» + issue text «текст обрезан справа»
  7. ☐ duplicate: greyed, «la thune — бабки» + badge «уже есть»
  8–9 partially visible below fold ok.
- Sticky bottom bar (surface, top border): left «Тема для всех ▾» chip, right accent button «Добавить 5 слов».

### Library.dc.html — themes
- Header: «Библиотека» (Newsreader 28) + right gear icon (link Settings.dc.html). Subline «158 слов · 23 к повторению».
- Search input with magnifier «Поиск по FR и RU».
- Chips row: Все (selected) · К повторению 23 · Трудные 9 · Без папки 7.
- Accent-soft banner card: sparkle icon, «Разложить с ИИ», sub «7 слов во «Входящих» · ИИ предложит темы», chevron — link Sort-Plan.dc.html.
- 2-col grid of folder tiles: Входящие (amber, first, «7 слов · нужно разобрать»), Повседневное, Эмоции, Тусовка, Деньги, Люди, Еда, Полиция (link Folder.dc.html on Деньги) + a dashed «+ Новая тема» tile. It's fine if the last row is cut by the tab bar (content scrolls).
- Tab bar (Библиотека active).

### Sort-Plan.dc.html — AI re-sort plan sheet
- Scrim over library; sheet from ~110px. Title «План сортировки», sub «12 перемещений · 1 новая тема · 64 слова, разложенные вручную, не трогаем».
- Groups (each a card with header row: folder color icon + «→ Деньги» + count + a small toggle switch on), list of 2–4 words in the group as compact chips/rows:
  - → Деньги (3): le blé, l'oseille, raquer
  - → Эмоции (2): avoir la haine, être vénère
  - → НОВАЯ ТЕМА «Транспорт» (3) dashed border, badge «новая»: la caisse, le tromé, la bécane — toggle on
  - → Люди (2): le daron, la daronne — toggle OFF (dimmed)
  - Each word row tappable (caret) to change target.
- Bottom: «Отмена» text button + accent «Применить 10» button. Small muted line: «Можно отменить в течение 7 дней».

### Folder.dc.html — folder «Деньги» word list
- Header: back arrow (link Library.dc.html), folder icon chip + «Деньги», overflow «⋯» icon button. Sub «18 слов · 3 к повторению», mastery bar.
- Rows (white list group, dividers): status dot (new=accent, learning=amber, known=good, difficult=again) + fr Newsreader 18 + ru muted 14 + right register badge. Use: la thune, le fric, l'oseille, le blé, raquer, être fauché, la tune?(no) — use 7 believable money slang words.
- One row shown mid-swipe left revealing two action buttons «Переместить» (accent soft) and «Удалить» (again) on the right.
- Tap row la thune → Word-Detail.dc.html.
- Bottom (above tab bar): full-width accent «Повторить тему (3)».
- Tab bar (Библиотека active).

### Word-Detail.dc.html — word detail sheet
- Scrim; sheet from ~60px. Big «la thune» Newsreader 32, «бабки, деньги» 18, badges ARGOT + nom f., folder chip «Деньги» (with chevron to change).
- Editable fields look (labels + values, pencil icon): Заметка «Синонимы: le fric, l'oseille», Пример «J'ai plus de thune.» / «У меня больше нет бабок.»
- Progress section: two mini rows for directions: «FR → RU · следующий показ через 4 д · стабильность 9 д» and «RU → FR · через 1 д», a review history strip of 8 small squares colored by grade (good/hard/again) with legend.
- Actions: «Перегенерировать с ИИ» (sparkle, outline), «Сбросить прогресс» (text), «Удалить» (again text). Close X (link Folder.dc.html).

### Settings.dc.html
- Header back arrow (link Library.dc.html) + «Настройки». Grouped list sections (iOS-like insets, surface cards):
  - Повторение: Направление по умолчанию «FR → RU» ›; Новых карточек в день «15» stepper; Кнопки оценки segmented «2 / 3» (3 selected); Свайпы для оценки toggle on.
  - Оформление: Тема segmented «Система / Светлая / Тёмная».
  - ИИ: «ИИ-подсказки» toggle on; «Модель» «Claude Haiku 5.5» ›; privacy note muted: «Скриншоты отправляются в Anthropic только для распознавания и не хранятся.»
  - Данные: «Синхронизация · n.d…@pm.me · только что» with green dot; «Экспорт JSON»; «Импорт из Petit Argot v1»; «Выйти» (again text).
- Tab bar (none active is fine; or Библиотека active).

### Login.dc.html — OTP sign-in
- No tab bar. Centered brand «Petit Argot» Newsreader italic 34, tagline «Французский сленг, по карточке в день».
- Step shown: code entry. Text «Код отправлен на n.drobyshevski@pm.me», 6 boxes (48×56, radius 12), first 3 filled «4 8 1», 4th focused (accent ring), «Изменить почту» link, «Отправить ещё раз через 0:42» muted.
- Accent button «Войти» (link Main.dc.html).
- Footnote: «Код, а не ссылка — так вход работает и в приложении на главном экране iPhone.»

### Review-Back-Dark.dc.html — identical to Review-Back but dark tokens (word «chelou» / «стрёмный, странный», VERLAN, note «Верлан от «louche».», example «Il est chelou, ce mec.» / «Странный он какой-то.», folder Эмоции, intervals «10 мин / 3 д / 9 д»).
### Library-Dark.dc.html — identical structure to Library, dark tokens.

## Quality bar
Pixel-careful, consistent spacing (8px grid), real hierarchy, nothing overlapping unintentionally, text never clipped mid-word inside fixed boxes (choose sizes so Russian fits), everything inside 390×844.
- Review header in the built app: one row — direction + theme chips on the left, undo + settings on the right, no app mark (user request, 2026-10-22).
- Review grading in the built app: the card swipes on either side (no flip needed, the hint under it reads «тап — ответ» / «тап — вопрос»), and grading shows no «Знаю · …» snackbar — undo is the header button or Z (user request, 2026-10-22).

### Повторение — «Мои наборы» (added 2026-10-22, option C of canvas «Повторение — свой набор»)
- The theme chip opens «Что повторять»: section «МОИ НАБОРЫ» (name Newsreader 19, mono count «3 К ПОВТ.» in red ink or «31 · ТРЕНИРОВКА», a muted one-line summary «Повседневное, Эмоции · fam., arg.», check when selected, pencil «Изменить набор»), «+ Новый набор», then «ТЕМЫ» as before.
- «Новый набор» / «Изменить набор» sheet: «Название» input; chip groups «Темы» (ни одной = все; «Входящие» dashed), «Карточки» (Новые / В изучении / Трудные / Выученные), «Уровень сленга» (meters + «verl.» dashed), «Добавлены» (Всё время / За неделю / За месяц); segmented «Как повторять: По расписанию / Тренировка» with a live line («Сейчас 3 карточки к повторению…» / «31 карточка вперемешку. Расписание не меняется.»); footer «Отмена» + «Сохранить N»; «Удалить набор» (danger text button) when editing, with undo.

### Повторение — изменить карточку (added 2026-10-22, option A of canvas «Повторение — правка карточки»; boards Review-Edit, Review-Edit-Sheet)
- The answer side's header has a pencil icon button «Изменить карточку» (44px, muted, after the slang meter and a 1×20 rule; desktop `E`, listed in «Клавиши»). The question side has none.
- It opens the word's sheet «Карточка слова» (the library's, same sections) over the review screen. Editing never grades: closing the sheet returns to the same card, still unanswered, showing the new text. Review keys are off while it is open.
- In the entry form («Французский», «Русский»), a translation is proposed by itself for what «Французский» says now (on opening and after each change, debounced): a row under «Русский» — mono label `ВАРИАНТ`, the Russian in Plex 15, a small secondary button «Подставить». It is never written into the field without the tap and is hidden when it equals the field. The row keeps its 32px while proposals are on (a static 6px bar while the request takes a while, no «думает…»); it follows Settings «ИИ» «Автоподсказки при вводе» and «Модель: подсказки». Same row in the desktop library pane's form.

### Examples — «другой пример» and «+ Ещё пример» (added 2026-10-22)
- Wherever a word's example shows (word detail, add form, edit forms), each example has a small ↻ icon button «Другой пример» (16px refresh glyph, muted, spins while loading) and the list ends with a text button «+ Ещё пример» (13px, ink, 500); with no example yet it reads «Подобрать пример». Up to 5 examples; in edit forms each also has × «Убрать пример». No «ИИ» wording; errors are one muted 12px line («Другого хорошего примера не нашлось.»).

### Импорт из Anki (added 2026-10-22; built on the screenshot import, no separate board)
- Entry: a quiet row «Колода Anki · .apkg или текстовый экспорт» under the screenshot pick (phone), a «Импорт из Anki» button in the margin notes (desktop), the row «Импорт из Anki» in Настройки → Данные, and a dropped .apkg/.txt/.csv anywhere on desktop.
- Setup («Импорт из Anki», file name in mono): decks with checkboxes and counts (one deck: its name in serif + count), status line «К дополнению N · уже есть K» (known words never leave the device), at most 300 per run with a note about the rest, switch «Перенести прогресс из Anki» (only when the deck has reviews, on by default), footnote, primary «Дополнить N карточек», secondary «Другой файл».
- Enriching: status line «Дополняем карточки» with «done / total» and the determinate bar, skeleton rows, «Стоп»; stopped → «Дальше с N словами»; failure → «Повторить» / «Другой файл»; a rate-limit wait reads «Много запросов — продолжим через N с».
- Review: the screenshot list unchanged (ДОГАДКА for translations the deck lacked); the screenshot summary/column is replaced by the deck title and «N карточек из Anki · пропущено M · прогресс переносится».

### Свои поля (added 2026-10-22; no separate board)
- What: shared fields the user defines once in Settings («Синонимы», «Произношение»…, up to 10), shown on every card, plus one-off fields of a single word (up to 12 values per word). Values are plain text (≤300); names ≤40; a hint ≤200 says what to write.
- Settings, section «СВОИ ПОЛЯ» between «ИИ» and «Данные»: one row per field — name 15, the hint muted 12 under it, a mono «АВТО» on the right when it is filled automatically, chevron ›; then «+ Добавить поле» (500), hidden at 10 with the note «Не больше 10 полей…»; footnote «Поля появляются на обороте каждой карточки. Слово может хранить и свои, разовые поля.»
- Field sheet «Новое поле» / «Изменить поле»: «НАЗВАНИЕ» input (placeholder «Например, Синонимы»), «ЧТО ПИСАТЬ» textarea (placeholder «Например: 2–3 синонима на французском», muted line «Подсказка для автоматического заполнения и для вас.»), switch «Заполнять автоматически» with caption «При добавлении слова и в «Дополнить карточки»», row «Место в списке 2 из 4» with ↑ / ↓ (editing, 2+ fields), primary «Сохранить», danger «Удалить поле» with the caption «Уже заполненные значения останутся на карточках как разовые поля.» Errors (empty or repeated name: «Поле «X» уже есть») are a red 13px line under the name. Deleting closes the sheet with the snackbar «Поле удалено · Отменить».
- Card back (review): after the examples, a hairline, then up to 3 filled fields — the name in the mono meta style (11, uppercase, muted), the value in Newsreader 16/22 muted (desktop 17/24); more fields → a muted 12px «+N поля». Empty fields are not shown; the question side never shows them.
- Word sheet: a «СВОИ ПОЛЯ» block after «Пример» (hairline above, pencil «Изменить свои поля» on the right): label / value rows (name 13 muted in a 108px column, value 15); a shared field with no value shows a muted underlined «Добавить» (opens the editor with that input focused); one-off fields follow the shared ones; «+ Поле» (13, 500) adds a one-off field. Editing shows one input per field (placeholder = the field's hint), one-off fields with × «Убрать поле «X»», new ones as «Название | Значение | ×»; «Сохранить» / «Отмена» as for the note. A value whose field was deleted in Settings stays on the word as a one-off field under its old name.
- Add form: when Settings has fields, a collapsed row «СВОИ ПОЛЯ · Синонимы, Произношение ⌄» under «Пример» («заполнено 1 из 2» once something is typed) opens one optional input row per field (name as the row label, the hint as placeholder). Nothing is filled automatically in the form.


### Контекст (added 2026-10-22; canvas «Контекст — мокапы», https://claude.ai/artifact/9ChLi6xBDPnjHjGZiEVwng)
- What: a Reverso Context-style lookup. Any French or Russian word or phrase → the headword card, translations ranked by share, real sentences from the web (FR with the word underlined in red, RU, source line «ФОРУМ · domain ↗»), synonyms by register, conjugation for verbs.
- Phone: the 4th tab «Контекст» (search glyph) between «Добавить» and «Библиотека». Layout B «Досье», one scroll: search field; a white index card with the red top rule (headword Newsreader 40, meta line with the slang meter, translations with share bars, «В библиотеке · тема ›» or «+ В карточки»); «Как говорят» with the sense chips from layout A («Все · N», «тащиться 38%»…) filtering the sentences; «Похожие слова» as register columns (нейтр. → fam. → arg. → vulg., vulg meter red), each word opens in Контекст, «+» adds it; «Спряжение» collapsed with a présent preview, 2×2 tenses when open.
- «Слово по частям» (added 2026-10-22), inside the word card under the translations (desktop: top of the right rail): hairline, mono label «СЛОВО ПО ЧАСТЯМ», the parts in Newsreader 17 joined by a muted «+» — the root underlined in red ink (opens it in Контекст), each affix followed by its gloss in muted 13 («-aire «относящийся к …»»); under it the origin line in muted 14 («от volonté „воля“ + -aire», «верлан от lourd»); then mono «ОДНОКОРЕННЫЕ» and up to 8 word chips (Newsreader 15), each opening in Контекст. Hidden when there is nothing to show.
- Cost (changed 2026-10-22): sentences come first from Tatoeba (free, mono source line «TATOEBA · tatoeba.org ↗», a meta credit «Фразы Tatoeba · CC BY 2.0 FR» under the list); under them a secondary button with the spark «Искать ещё в вебе» and the meta caption «форумы, песни, субтитры · 10–20 с» runs the paid web search, whose sentences join the list after Tatoeba's. With no Tatoeba sentence the dashed box reads «В Tatoeba примеров нет» and offers «Искать в вебе» first, «Подобрать пример» second. The conjugation is built on the device (no request).
- States: searching (the dictionary part shows at once, «Ищем примеры в вебе» with progress and skeleton rows, «Остановить поиск»), nothing on the web (dashed box «Живых примеров не нашлось» + «Подобрать пример» with the spark; the result is tagged as made up), offline (search disabled, history opens), empty screen with «Недавние» (each row with a muted «×» «Убрать из истории» + snackbar «Отменить»; on desktop the «×» shows on row hover; «Очистить» clears all) and «Из твоих карточек без примеров».
- Example sheet: the sentence large, RU, source title + link; «В карточку слова» (up to 5, caption «У X сейчас N примеров из 5»), «Сделать главным», «Скопировать»; for an unsaved word «Добавить слово с этим примером».
- Desktop: sidebar «Контекст» (`G C`); search bar, header row with the chips and «В карточки», sentences as a two-column FR | RU table with «+», a right rail with «Похожие слова» and «Спряжение».

### Происхождение (added 2026-10-22; no separate board)
- A word's `origin` (one Russian line, written from the chat through the connector or by hand) shows: in the word card as an editable field «Происхождение» after «Заметка» (phone: a SheetField with a pencil, «Не указано» when empty, one-line input with the placeholder «Например: верлан от lourd», «Сохранить» / «Отмена»; desktop pane: «ОТКУДА …» under the note with a pencil, Enter saves, Esc cancels); in library rows after the translation, «бабки · верлан от …» (truncated with the line; desktop table, the RU column); on the review card's answer side under the note: mono meta «ОТКУДА» then the line in muted 13/14. Never on the question side.
- Settings → «Оформление»: switch «Происхождение слов», caption «В библиотеке и на обороте карточки» (desktop: a checkbox row), on by default; off hides it in the library and on the card (the word card and «Контекст» keep it).

### Спряжение в карточке слова (added 2026-10-22; no separate board)
- For verbs (and expressions the dictionary or the word conjugates), after «Происхождение»: field «Спряжение» — a one-line présent preview in Newsreader («je me casse · tu te casses · il se casse…») and a mono line «своё · être» / «из словаря · avoir»; «Нет спряжения — можно заполнить» when neither exists. Desktop pane: mono «СПРЯЖЕНИЕ» before the preview, pencil on the right.
- The pencil opens the form, filled with the word's own forms or the dictionary's: «ВСПОМ. ГЛАГОЛ» avoir | être (two chips, selected = ink), then four mono-labelled groups (Présent, Passé composé, Imparfait, Futur) of six serif inputs, one column on phones under 420 px, two otherwise. Every form is required («Заполните все формы — не хватает N»); an untouched copy of the dictionary's forms saves nothing. «Вернуть из словаря» (tertiary, only when the word has its own) clears it at once with the snackbar «Спряжение из словаря · Отменить».

### «+ Поле» → тип поля (added 2026-10-22; no separate board)
- In the word card «+ Поле» (under «Свои поля») opens a small menu «Какое поле» when there is more than a one-off field to offer: «Происхождение» (caption «откуда слово, верлан, заимствование», while the word has none), «Спряжение» (caption «4 времени, по 6 форм», verbs only, when neither the word nor the dictionary has one), then «Своё поле» (caption «название и значение»; disabled at 12 fields with «не больше 12 полей»). With nothing else to offer it adds a one-off field straight away, as before.
- «Происхождение» and «Спряжение» are no longer shown empty: a field appears once it has a value (a verb the dictionary conjugates always shows «Спряжение · из словаря»), or while it is being filled from the menu.
