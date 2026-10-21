# Petit Argot v2 — mockup spec (shared by every designer agent)

Product: mobile-first PWA for learning French slang/colloquial vocabulary with Russian translations.
Single user. UI copy is **Russian**; card words are **French**. Successor of a one-file prototype
"Petit Argot" whose look we keep: calm, editorial, lots of air, serif for French words, clean sans for UI.

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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,500&amp;family=Manrope:wght@400;500;600;700&amp;display=swap">
<style>
body{margin:0}
a{color:#2a46c9}a:hover{color:#1d3399}
</style>
</helmet>
<div style="width: 390px; height: 844px; box-sizing: border-box; position: relative; overflow: hidden; background: #f3f4f8; color: #161a2b; font-family: Manrope, system-ui, sans-serif; display: flex; flex-direction: column">
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

## Tokens (light)
- bg `#f3f4f8`, surface `#ffffff`, surface-2 `#eceef5`, fg `#161a2b`, muted `#5d6278`, line `#e2e4ee`
- accent `#2a46c9`, accent-soft `#e6eafb`, on-accent `#ffffff`
- again (Не знаю) `#c0303a` / soft `#fbe9ea`
- hard (Сложно) — NEUTRAL on purpose: text `#161a2b` on `#eceef5` (so it doesn't read as failure)
- good (Знаю) `#17734b` / soft `#e3f3ea`
- warn/amber (low confidence) `#8a5a00` text, `#fff4dc` soft, `#e9b949` edge
- register badges (small pill, 11px, 600, uppercase letter-spacing .04em): argot `#6a3fb5` on `#efe8fb`; verlan `#0f6e7a` on `#e2f3f5`; familier `#2a46c9` on `#e6eafb`; vulgaire `#c0303a` on `#fbe9ea`
## Tokens (dark — only for the *-Dark boards)
- bg `#0f1220`, surface `#181c2e`, surface-2 `#20253a`, fg `#e9ebf5`, muted `#9a9fb8`, line `#2a2f48`
- accent `#8ea2ff`, accent-soft `#232a4d`, on-accent `#0f1220`
- again `#ff7a82` / soft `#3a1d24`; good `#5fd39c` / soft `#173327`; hard text `#e9ebf5` on `#262b42`
- badges: same hues, lighter text on darker soft fills (argot `#c7adff` on `#2c2346`, verlan `#7fd6df` on `#163338`, familier `#8ea2ff` on `#232a4d`, vulgaire `#ff7a82` on `#3a1d24`)

## Type
- French words: `Newsreader, Georgia, serif`, weight 500. Card prompt 38px/1.15; list rows 18px; italic for the brand.
- UI: `Manrope`, 15px base; labels 13px; captions 12px; section titles 13px 600 uppercase letter-spacing .06em muted.
- Russian translation on card back: Manrope 20px 500.
- Brand mark (where a header shows it): "Petit Argot" Newsreader italic 22px.

## Shape & spacing
- Side gutter 16px. Cards radius 20px, sheets radius 24px top, chips 999px, buttons 14px, inputs 14px.
- 1px borders in `line`. Shadows only on sheets: `0 -8px 32px rgba(22,26,43,.12)`. Sheet scrim: `rgba(22,26,43,.35)` over a dimmed underlying screen (you may draw a simplified underlying screen or just the bg).

## Shared components (draw identically on every board that has them)
**Bottom tab bar** (Review, Library, Folder, Settings, Session-Done boards; NOT on sheets-only/full-screen flows):
absolute bottom, height 64px + 28px bottom padding, surface bg, top border line. Three slots in a grid:
1. «Повторение» — cards icon (two stacked rounded rects) + label 11px; link `Main.dc.html`
2. center raised circular "+" button 56px, accent bg, white plus icon, sits 12px above the bar top edge, `aria-label="Добавить слово"`; link `Add-Empty.dc.html`
3. «Библиотека» — folder/grid icon + label; link `Library.dc.html`
Active tab: accent color icon+label; inactive muted.

**Chips**: 32px tall, 12px horizontal padding, 13px 500, surface bg + line border; selected = accent-soft bg, accent text, no border.

**Folder colors** (themes have a color + line icon, NEVER emoji):
- Деньги (thune) `#17734b` coin icon · Еда (bouffe) `#b4531a` fork icon · Полиция (keufs) `#2a46c9` shield icon · Тусовка (soirée) `#6a3fb5` music-note icon
- Эмоции `#c0303a` heart icon · Люди `#0f6e7a` user icon · Повседневное `#5d6278` sun icon · Входящие (Inbox, AI-unsure/unsorted) `#8a5a00` tray icon
Folder tile = surface card, 16px padding, 36px rounded-square icon chip tinted (color at ~12% bg, color stroke), name 15px 600, "24 слова · 5 к повторению" 12px muted, 4px mastery bar (line track, folder color fill).

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
Folder counts: Повседневное 42 / 6 due · Деньги 18 / 3 · Еда 15 / 0 · Полиция 9 / 2 · Тусовка 21 / 4 · Эмоции 27 / 5 · Люди 19 / 1 · Входящие 7 (shown first, amber).
Totals: 158 слов, today 23 к повторению, 12 новых.
Intervals under grade buttons (FSRS): Не знаю «<1 мин», Сложно «6 мин», Знаю «1 д»; for a mature card: «10 мин» / «3 д» / «9 д».

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
