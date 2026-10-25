# «Карточки» — DESKTOP mockup spec (extends mockups/SPEC.md v3) — rev. 2

Read `mockups/SPEC.md` first. Everything there still applies: the v3 direction (paper index card / card catalog,
ink on paper, hairlines, ONE red accent, no AI tropes), tokens, type, slang meter, theme colors, copy rules and
sample data. This file only adds what desktop needs. Where the two disagree, this file wins for `D-*` boards.
The compact layout (<768px) is today's phone UI and is NOT redrawn.

Built-app facts that override old SPEC text (from the code inventory): there is no «Показать ответ» button
(you tap/click the card); the slang meter fills **нейтр. 1 / fam. 2 / arg. 3 / vulg. 4** segments (vulg. in
red); sessions say «Готово на сегодня»; the library filter is «Сленг ▾»; folders are ordered by `sort`
(lib/folders.ts): Повседневное, Деньги, Еда, Полиция, Тусовка, Эмоции, Люди; the «Показ» label comes from
`wordSchedule` + `formatInterval` and is only «к повт.», «новое» or «через {interval}» (EARLIEST of both
directions; «д» under 14 days, then «нед», «мес», «г»; there is no «завтра»).

---

## 1. Principles

1. **One card on the desk.** Review is a single landscape index card (5:3, 720×432 at expanded) lying on a
   printed page: a running head with a full-bleed rule frames the paper, the card sits on a thin stack of the
   cards still to come. The card never stretches (Anki edge-to-edge and Bunpro complaints). Margins stay empty:
   no stat panels, no queue preview, no widgets (Duolingo/Mochi/WaniKani focus pattern).
2. **The catalog cabinet.** Library = drawers (themes in the sidebar, each with its guide words) + ledger
   (word table) + the pulled card (detail pane). Panes split by 1px hairlines, never by background or shadow
   (Anki Browser, Apple Mail, HIG). The current word stays highlighted in the list.
3. **Chrome is text and rules; only words are cards.** White surfaces are reserved for index cards (review,
   detail, dialogs), inputs, menus, the bulk bar and the drop tray. Sidebar, toolbars, filters and tables are
   text on paper `#f1f1ee` — no chip rows, no icon nav (Kinopio critique: controls must not look like content).
4. **Keyboard first, mouse and touch equal.** Every action has a key; core keys are PRINTED on the controls
   that perform them, **each key at most once per screen**. Everything else is in the `?` overlay and in
   tooltips. Nothing important is hover-only: coarse pointers get persistent row controls (§3 coarse variant).
   Single-letter keys bind by `KeyboardEvent.code` (ЙЦУКЕН-safe), never fire while typing or while a menu is
   open, and can be switched off (WCAG 2.1.4).
5. **Undo, not confirm.** Moves, deletes, resets and bulk actions run at once and show the ink snackbar with
   «Отменить» + `Z` (Gmail). Bulk actions undo as one step. No confirm dialogs. Esc never destroys input
   (§4 Esc stack).
6. **Red stays rare — at most 4 red marks per screen.** Red ink only for: the active sidebar/rail bar, the
   index-card header rule (cards and dialogs), the «Входящие» count, «Не знаю», and destructive items inside
   menus and the bulk bar. «к повт.» is ink 500 (sorting already surfaces it). Each board lists its red count.
7. **Nothing AI-looking.** No sparkles, «ИИ», gradients, glows, shadows, pastel pills, hero-metric tiles,
   identical icon-card grids or numbered «how it works» steps, left-border accent cards, confetti, loud streaks
   (since 2026-10-25 a quiet streak is allowed, once, as one mono line on «Прогресс» only: §10 and SPEC.md
   «Прогресс»).
   **Mono is for data only**: numbers, intervals, dates, `FR → RU`, `№ 042`, key names, table column heads and
   real uppercase tags (`ДОГАДКА`, `УЖЕ ЕСТЬ`, `ИДЁТ`, `ВХОД`). Section headings are Plex Sans 500 13px sentence
   case («Темы», «История», «Недавние»). Sentences that contain numbers are Plex Sans with `tabular-nums`.
8. **Same app, same data.** Desktop rearranges existing features. Anything the app does not have is marked
   **(новое)** here with its reason and appears ONLY where listed below. The UI never shows the word «новое»
   as a feature badge. Not in this round: command palette, stats/heatmaps (except «Прогресс», added 2026-10-25:
   its ledger and progress calendar, §10), tags, Easy grade, focus mode,
   density switch, theme reordering, bulk slang-level edit, image-region highlighting on import.

**Allowed (новое) items**
- Shell: sidebar/rail (replaces bottom tab bar, HIG/M3); sidebar sync status line (mirrors Settings ›
  Синхронизация, click = sync now; real strings «синхронизация…», «нет сети», «ошибка», «только на этом
  устройстве», «только что»); theme guide words in the sidebar and library header (catalog-drawer label;
  derived from existing words); «Входящие» rail item at medium.
- Pointer: hover states, tooltips, right-click menus as real menus (today a bottom sheet), drag rows onto a
  theme (Linear/Things/Anki «Change Deck»), global file drop + global `⌘V` screenshot paste (exists on
  /import only), screenshot zoom dialog on import review.
- Keys: key caps + hint line + `?` overlay (Mochi/WaniKani); global `N`, `/`, `?`, `G` затем `R/L/I`, `[`,
  `F6`; library `J K X M E ↵ Delete ⌘⌫ ⌘A ⇧↑↓`; `R` «Повторить тему»; `F2` rename theme; `P` «Ещё практика»;
  `Esc` «Закончить практику»; Settings section «Клавиши» (WCAG 2.1.4).
- Library: sortable table (Anki Browser/Carbon); persistent detail pane (Mail/RemNote); multi-select + bulk bar
  (move, delete only); delete snackbar for many words «Удалено 12 слов · Отменить»; pane-edit snackbars
  «Сохранено · Отменить» and «Изменения не сохранены · Вернуть»; «Рядом в алфавите» strip in the detail card;
  «трудн.» status word in the Показ cell (replaces the colour dot).
- Card anatomy: call number `FR · № 001` on review/detail cards (same numbering as the add sheet's
  «Карточка № 159»); tracings footer «1. Повседневное  2. arg.» (theme + level, already on the card);
  question-side card footer copy «Щелчок или Пробел — перевернуть» (replaces «тапни, чтобы перевернуть»).
- Copy: add-dialog footnote «Несколько слов сразу — через «Список». Со скриншота — через «Скриншот» или» +
  `⌘V`; import margin notes (replace the mobile step list); dialogs instead of bottom sheets (NN/g).

---

## 2. Breakpoints, viewport & shell

Boards are drawn at **1440×800** — the real browser viewport of a 1440×900 display (menu bar + tabs + toolbar
≈ 100px). Nothing that matters may sit below y 800.

| Class | Width | Navigation | Content |
|---|---|---|---|
| compact | < 768 | bottom tab bar (today) | today's phone UI, 440px column, sheets. Unchanged, not drawn. |
| medium | 768–1199 | **rail 72px** | single content area, padding 24; detail docks at ≥1100, else overlay panel |
| expanded | ≥ 1200 | **sidebar 248px** | 2–3 panes, pane padding 24, centered screens padding 32–48 |

**Height tiers** (medium and expanded): ≥ 760 tall → card 720×432 (640×384 at medium), hint line shown.
< 760 → card 640×384, hint line hidden. < 620 → card 560×336. Dialogs everywhere: `top = max(24px, 10vh)`
(80 at 800; tall dialogs use 40), `max-height = 100dvh − top − 40px`, body scrolls, chrome and 64px footer
pinned. Panes scroll; nothing is pinned to a pane bottom except the bulk bar and import bottom bar.

**≥ 1600**: the library list pane caps at 1148px; all extra width goes to the detail pane (detail card max
560, prose 60ch, card left-aligned next to the table). Review card 800×480, headword step 1 = 64/64. Hairlines
still run full-bleed.

**Pointer**: hover styles only under `(hover: hover) and (pointer: fine)`. Under `(hover: none)` or
`(pointer: coarse)` the coarse variant applies (§3). From 768 up, every bottom sheet becomes a dialog, popover
menu or pane.

### Pane widths
| Screen | Expanded 1440 | Expanded 1200–1439 | Medium 1100–1199 | Medium 768–1099 |
|---|---|---|---|---|
| Review / Session done | running head full width; column 720 centred | same | rail; column 640 | rail; column 640 |
| Library / Theme | sidebar 248 · list flex · detail 400 | sidebar · list flex · detail 360 | rail · list (≥ 628) · detail 400 docked | rail · list full · overlay panel 400 (360 below 900) |
| Import review | sidebar · screenshot 456 · rows flex | screenshot 400 | rail · screenshot 320 · rows | rail · screenshot 280 · rows |
| Settings | sidebar · section nav 176 · form 640 | same | rail · form 640 | rail · form 640 |
| Dialogs | add 640, sort plan 760, shortcuts 800, theme form / zoom 440 / 720 | same | same | max = window − 48 |

### Library table columns (fluid)
`select 32 · Слово minmax(160px,1fr) · Перевод minmax(160px,1fr) · Ур. 44 · Сленг 112 (Firefox sets «нейтр.» wider than Chromium) · Тема 112 · Показ 120`
(Показ right-aligned; «Ур.» = «Уровень языка», mono 12 «≈B1», added 2026-10-24, and «Сленг» was «Уровень» until
then, §8 «Уровень языка»). Rules by **inner list width**: < 720 → drop «Тема»; < 680 → «Сленг» = italic abbr only,
56 wide, no meter; «Ур.» always stays, and Слово/Перевод give it room down to `minmax(140px,1fr)`. Single theme / «Входящие» shown → no «Тема». Medium: Слово/Перевод `minmax(150px,1fr)`,
drop «Тема» below 960 inner, «Показ» → 72 (mono interval only, «трудн.» moves to the tooltip) below 760 inner.
At 1440: inner 744 → Слово 188 · Перевод 188. At 1200: inner 544 → no Тема, Сленг 56, Ур. 44, Слово/Перевод 146 (140 min).
Status: no dot column. «Показ» cell = Plex 13 «к повт.» (ink 500) / «новое» (ink 500) / «через 4 д» (muted),
then, for difficult words, 6px + Newsreader italic 13 muted «трудн.». The row's `aria-label` carries the full
status («трудное», «учится», «выучено», «новое»).

### Expanded sidebar (248px) — draw IDENTICALLY on every expanded board except Login
Full height, paper, 1px `#d6d6d1` right rule, padding 16 12 12, flex column. Text only — no nav icons.
1. **Mark** y 16, 40px, padding 0 8: card glyph 10×14 + «Карточки для Лизи» Newsreader 500 22/28.
2. **«+ Новое слово»** y 72, 32px tertiary row (link D-Add-Empty.dc.html, aria «Добавить слово»,
   `aria-keyshortcuts="N"`), padding 0 8 0 12: «+ Новое слово» 14px 500 ink + right flat mono 11 muted «N».
3. **Nav** y 120, items 36px, gap 2, radius 4, padding 0 8 0 12: label 14px + right count mono 12 tabular:
   «Повторение» `23` ink 500 (no count on Session done) → D-Review-Question.dc.html; «Библиотека» `158` muted →
   D-Library.dc.html; «Импорт» (no count) → D-Import-Drop.dc.html.
   **Order since 2026-10-23** (Упражнения, SPEC.md «Упражнения»): «Повторение» `23` · «Упражнения» `2` (count =
   sets not played yet, ink 500 like Повторение; none when 0) → D-Exercise-List.dc.html · «Библиотека» `158` ·
   «Контекст» (no count) · «Импорт». Five items end at y 300, so the hairline, «Темы» and the theme rows below
   move down 76px (as drawn on the D-Exercise-* boards); the theme list scrolls inside the sidebar when it no
   longer fits.
4. Hairline y 248 (margin 0 8) — y 324 with the five items above.
5. **«Темы»** header y 260, 24px: Plex 500 13 «Темы» + right 24×24 «+» icon button (aria «Новая тема»,
   link D-Theme-New.dc.html).
6. **Theme rows** from y 288, **44px** each, padding 0 8 0 12, gap 10: 8×8 square (radius 1, theme colour) |
   column: name Newsreader 500 16/20 + guide words Newsreader italic 12/16 muted | count mono 12 muted right.
   Real order and data:
   «Входящие» (square 1px dashed `#5a5a57`; count `7` **red 500**) «avoir la haine – le tromé» ·
   Повседневное 42 «une blague – vas-y» · Деньги 18 «le blé – la thune» · Еда 15 «bouffer – picoler» ·
   Полиция 9 «les flics – les keufs» · Тусовка 21 «la boîte – la soirée» · Эмоции 27 «chelou – se prendre
   la tête» · Люди 19 «la meuf – un pote». (Guide words ignore articles and «se».) «Входящие» →
   D-Library-Bulk.dc.html; every theme row → D-Theme.dc.html (it stands for any theme). Rows end y 640.
   On hover/focus a row shows a 24×24 `⋯` (aria «Действия с темой») at the count's place; right-click or `⋯`
   opens the theme menu (D-Theme); `F2` opens «Название, описание и цвет».
7. **Bottom block** (margin-top auto, 1px top rule, padding-top 8): sync line 24px, 12px muted «Синхронизация
   · только что» (no dot; a 6px dot appears only for «нет сети» `#5a5a57` and «ошибка» `#b3261e`; it is a
   `<button>` «Синхронизировать сейчас»); then «Настройки» 36px (text) → D-Settings.dc.html.

**States**: rest = ink 500. Hover = bg `#e8e8e4`. Focus-visible = 2px ink outline, offset −2px. Active =
600 + 2px red bar on the sidebar's left edge (`position:absolute; left:-12px; top:0; bottom:0; width:2px`).
Exactly ONE item is active: a shown theme or «Входящие» activates its row and leaves «Библиотека» at rest.
Sidebar hidden with `[` → a 32×32 sidebar icon button sits at the content's top-left 12/12 (tooltip «Показать
боковую панель» + `[`).

Reference markup (copy it; change only `aria-current`, the active bar, weights and counts):
```html
<aside aria-label="Разделы" style="position: absolute; left: 0; top: 0; bottom: 0; width: 248px; box-sizing: border-box; padding: 16px 12px 12px; border-right: 1px solid #d6d6d1; background: #f1f1ee; display: flex; flex-direction: column">
  <div style="height: 40px; padding: 0 8px; display: flex; align-items: center; gap: 8px">
    <svg aria-hidden="true" width="10" height="14" viewBox="0 0 10 14" fill="none"><rect x="0.5" y="0.5" width="9" height="13" rx="1" stroke="#111111" stroke-width="1"></rect><path d="M0.5 3.5h9" stroke="#c8331f" stroke-width="1.5"></path></svg>
    <span style="font-family: Newsreader, Georgia, serif; font-weight: 500; font-size: 22px; line-height: 28px; letter-spacing: -0.01em; color: #111111">Карточки для Лизи</span>
  </div>
  <a href="D-Add-Empty.dc.html" aria-label="Добавить слово" aria-keyshortcuts="N" style="margin-top: 16px; height: 32px; padding: 0 8px 0 12px; display: flex; align-items: center; border-radius: 4px; color: #111111; text-decoration: none; font-size: 14px; font-weight: 500">
    <span style="flex: 1">+ Новое слово</span>
    <span aria-hidden="true" style="font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 11px; color: #5a5a57">N</span>
  </a>
  <nav aria-label="Основная навигация" style="margin-top: 16px; display: flex; flex-direction: column; gap: 2px">
    <a href="D-Review-Question.dc.html" aria-current="page" style="position: relative; height: 36px; padding: 0 8px 0 12px; display: flex; align-items: center; border-radius: 4px; color: #111111; text-decoration: none; font-size: 14px; font-weight: 600">
      <span aria-hidden="true" style="position: absolute; left: -12px; top: 0; bottom: 0; width: 2px; background: #c8331f"></span>
      <span style="flex: 1">Повторение</span>
      <span style="font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums">23</span>
    </a>
    <!-- «Библиотека» and «Импорт»: same box, font-weight 500, no bar -->
  </nav>
  <!-- hairline, «Темы» header, theme rows, bottom block as specified above -->
</aside>
```
Theme row: `<a href="D-Theme.dc.html" style="position: relative; height: 44px; padding: 0 8px 0 12px; display: flex; align-items: center; gap: 10px; border-radius: 4px; color: #111111; text-decoration: none"><span aria-hidden="true" style="flex: none; width: 8px; height: 8px; border-radius: 1px; background: #2f6b4f"></span><span style="flex: 1; min-width: 0; display: flex; flex-direction: column"><span style="font-family: Newsreader, Georgia, serif; font-size: 16px; line-height: 20px; font-weight: 500">Деньги</span><span lang="fr" style="font-family: Newsreader, Georgia, serif; font-style: italic; font-size: 12px; line-height: 16px; color: #5a5a57; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">le blé – la thune</span></span><span style="font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; font-variant-numeric: tabular-nums; color: #5a5a57">18</span></a>`

### Medium rail (72px)
Full height, paper, 1px right rule, items centred, icons kept (the rail has no room for text-only). y-values:
card glyph 14×20 at 16; «Добавить» 40×40 outlined icon button (1px `#8a8a85`, radius 6, aria «Добавить
слово», tooltip «Добавить слово» + `N`) at 52; nav items 64px tall from 116 every 64: «Повторение» 116 (mono 10
count `23` beside the icon), «Библиотека» 180, «Импорт» 244, «Входящие» 308 (inbox icon, mono 10 count `7`
red); «Настройки» gear item 48px at bottom 12. Labels 11px 500 under icons. Active = 600 + 2px red bar on the
rail's left edge. Sync: nothing at rest; a 6px dot over the gear for «нет сети» / «ошибка».
Since 2026-10-23 the rail follows the sidebar order: «Повторение» 116, «Упражнения» 180 (the checklist glyph
of the phone tab, mono 10 count of unplayed sets), «Библиотека» 244, «Контекст» 308 (search glyph), «Импорт»
372, «Входящие» 436 — every item below «Упражнения» moves down 64px.

### Content area conventions (expanded)
- Screen title: Newsreader 500 28/36 at the pane's left padding, top 20. Subline 13/20 Plex muted, 4px below,
  numbers tabular. No title on Review (the card is the content; the running head names the session).
- Pane toolbars: 36px, 12px gaps, max 3 groups (HIG).
- Global snackbar: ink `#111111`, white 14px, radius 6, height 44, padding 0 8 0 16, centred in the active
  pane, max-width 480; «Отменить» underlined 500 + on-ink cap `Z`. Position: bottom 24; in Review bottom 56
  (above the hint line); when a bulk bar or import bar is present, 12px above it.

---

## 3. Desktop tokens (on top of v3)

| Token | Light | Dark |
|---|---|---|
| hover on paper (sidebar rows, table rows, tertiary buttons) | bg `#e8e8e4` | `#222220` |
| hover on white (menu items, dialog rows, secondary buttons) | bg `#f4f4f1` | `#242422` |
| hover on outlined grade/secondary buttons | border 1px → 2px same colour (padding −1px) | same |
| pressed / key-triggered grade | 120ms ink-filled flash: bg = border colour, text white | text `#121212` |
| **interactive boundary** (inputs, search, selects, steppers, «Сложно», `?` button, secondary buttons, checkbox) | 1px `#8a8a85` (3.06:1 on paper, 3.47:1 on white, WCAG 1.4.11) | `#6e6e69` |
| passive hairline (rules, table rows, cards, dialogs) | `#d6d6d1` | `#33332f` (decorative only) |
| focus-visible ring | `outline: 2px solid #111111; outline-offset: 2px` | `#ececea` |
| focus ring inside rows/scroll panes | same, `outline-offset: -2px` | same |
| current row (cursor / open in detail) | bg `#ffffff` + 2px `#111111` bar on the row's left edge (absolute span) | bg `#242422` (above the `#222220` hover), bar `#ececea` |
| selected row | bg `#e2e2dd` + checked checkbox | `#2c2c29` |
| checkbox (the ONLY binary control: tables, settings, menus, sort plan) | box 14×14, radius 2, 1px `#5a5a57`; checked = bg `#111111` + white 1.75 check; indeterminate = white 8px dash. **Hit area = the whole row or the 32×row gutter**, never just the box (WCAG 2.5.8) | border `#a3a39e`; checked `#ececea` + `#121212` mark |
| settings-style option row | checkbox, 12px gap, label 15, caption 12 muted under it; whole row clickable, min 44 | same |
| text options (3–4-way choices: theme, grade buttons, slang level) | 14px options separated by 1px `#d6d6d1` vertical rules 16px tall, padding 0 12; selected = ink 600 + 1px ink underline 4px under the baseline; rest muted 500. `role="radiogroup"`, arrows move | `#ececea` |
| text filter strip (library filters) | 14px items, gap 20, counts mono 12; active = ink 600 + 1px ink underline 4px under the baseline; rest muted; no borders, no fill | same |
| table header | 32px, mono 11 uppercase .06em muted, 1px `#111111` rule under (full-bleed across the list pane) | rule `#ececea` |
| table row | 40px (48 coarse), 1px `#d6d6d1` rule under, cell padding 0 8, no vertical rules, no zebra | rule `#33332f` |
| sort indicator | mono `▲`/`▼` 10px after the label, ink, sorted column only | same |
| row hover actions (fine pointer) | 72px slot replacing the «Показ» text: two 28×28 icon buttons (Переместить, Удалить), gap 8; hidden while a selection exists | same |
| **coarse pointer variant** | checkbox gutter always visible (40 wide); rows 48; «Показ» keeps its text and gains a persistent 32×32 `⋯` (aria «Действия со словом») opening the row menu; long-press 500ms opens the same menu; menu items 44px; no hover slot; sidebar theme rows show `⋯` always | same |
| key cap `<kbd>` | mono 11/1, height 18, min-width 18, padding 0 4, bg `#ffffff`, **1px `#d6d6d1` all round**, radius 3, colour `#5a5a57` (reads as a typed label, not a key) | bg `#1b1b1a`, border `#33332f`, `#a3a39e` |
| key cap on ink | bg transparent, 1px `rgba(255,255,255,.4)`, colour `#ffffff` | `rgba(18,18,18,.4)`, `#121212` |
| flat key name (hint lines, menus in sidebar) | mono 11 muted, no box | same |
| tooltip | bg `#111111`, text `#ffffff` 12/16, padding 4 8, radius 4, gap 8 to its key cap, 6px from trigger, no arrow, max-width 240. 500ms hover, at once on keyboard focus, Esc dismisses (WCAG 1.4.13) | bg `#ececea`, text `#121212` |
| menu / popover | bg `#ffffff`, 1px `#111111` border, radius 6, padding 4, min-width 220; items 32px (44 coarse), radius 4, padding 0 8, 14px; key cap right; separator 1px `#d6d6d1` margin 4 0; danger item `#b3261e`. No shadow | bg `#1b1b1a`, border `#ececea`, danger `#ff7b70` |
| **disabled** | text `#8a8a85`, border `#d6d6d1`, no hover; `aria-disabled="true"` (primary buttons stay focusable); tooltip says why: «Нечего отменять», «Отметьте хотя бы одно слово», «Это первое слово», «Это последнее слово», «Включите хотя бы одну группу» | text `#6e6e69`, border `#33332f` |
| **loading** | the label is replaced by its progress text («Подбираем…», «Распознаём…»), width stays fixed, `aria-busy="true"` | same |
| drag ghost | white, 1px `#111111`, radius 4, height 32, padding 0 10, FR Newsreader 500 16 + mono 11 `+2`, opacity .94, 12px right/below the cursor | `#1b1b1a` / `#ececea` |
| drop targets while dragging | every valid sidebar theme row: 1px dashed `#5a5a57` outline (offset −1px) | `#a3a39e` |
| hovered drop target | bg `#ffffff`, 2px solid `#111111` outline (offset −2px), count replaced by mono `+3` ink | `#1b1b1a` / `#ececea` |
| file drop tray | idle: transparent, 1px dashed `#5a5a57`, radius 8, a 1px dashed `#c8331f` rule 48px from the top (the card's header-rule position). Drag-over: bg `#ffffff`, 2px solid `#111111`, the red rule solid 2px | dashed `#a3a39e`; over `#1b1b1a`, 2px `#ececea` |
| scrim | `rgba(17,17,17,.24)` over the whole window (sidebar included) — the catalog stays legible | `rgba(0,0,0,.5)` |
| dialog | bg `#ffffff`, 1px `#d6d6d1` border, radius 8, no shadow; centred horizontally; top/max-height per §2; padding 0 24; chrome 48 (call number / tools left, close right) + title; a 2px red rule `#c8331f` edge to edge under the title block; footer 64 with 1px top rule. A dirty dialog does NOT close on scrim click | bg `#1b1b1a`, border `#33332f`, rule `#ff6a52` |
| overlay side panel (medium < 1100) | 400 wide (360 below 900), full content height, bg `#f1f1ee`, 1px `#111111` left border, no scrim; non-modal | bg `#121212`, border `#ececea` |
| bulk bar | white, 1px `#111111` border, radius 6, height 52, inset 24 from the list pane sides, 16 from its bottom; padding 0 8 0 16 | `#1b1b1a` / `#ececea` |
| card stack (review) | two 1px `#d6d6d1` outlines, radius 6, same size as the card, offset +4/+4 and +8/+8, paper fill, behind the card. 3+ cards left → 2 outlines; 2 → 1; last card → none | `#33332f` |
| pointer drawing (only D-Library-Bulk and D-Library-Medium) | 12×18 arrow SVG, fill `#111111`, stroke `#ffffff` 1, `aria-hidden` | fill `#ececea`, stroke `#121212` |

Type additions (desktop):
- UI controls 14px; body/prose 15px; captions 12–13px.
- **Review headword steps** (desktop keeps mobile's length steps): step 1 Newsreader 500 **56/64** for ≤ 16
  chars; step 2 **44/64** for ≤ 28; step 3 **30/32** longer. Pick the step ONCE per card from the longer of
  prompt and headword and use it on both sides (no jump on flip). Letter-spacing −0.02em,
  `font-optical-sizing: auto`. ≥1600: step 1 = 64/64.
- Ruled front: rules `#dfe6f3` 1px, full card width, every 32px starting 32px under the red rule. The
  headword baseline sits ON ruled line 2 (body y 64); POS on line 3 (body y 96). Draw: headword block top =
  body y 4 with line-height 64, POS block top = body y 68 with line-height 32, then nudge each in 1px steps
  until the baselines touch the rules. The back keeps the same headword/POS positions without rules.
- Detail-pane headword Newsreader 500 36/40. Table FR Newsreader 500 18/24 + POS italic 14 muted (6px gap).
  Table RU Plex 14/20 `#5a5a57`.
- Prose max 60ch. All numbers `tabular-nums`.
- Key names: `Пробел`, `Esc`, `↵`, `⌫`, `Delete`, `Tab`, `←` `→` `↑` `↓`, `⇧`, `⌘`, `F2`, `F6` (boards draw Mac
  glyphs; the app shows `Ctrl` off Mac). Combos in ONE cap: `⌘↵`, `⇧⌘↵`, `⌘V`, `⌘A`, `⌘⌫`. Sequences = caps
  joined by muted 12px «затем». Alternatives joined by muted «или».

Icons (inline stroke SVG, 24 viewBox, stroke-width 1.5–1.75, currentColor, round caps/joins). Copy cards,
library, plus, gear, undo, swap from Main.dc.html. Others:
- search `<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>`
- chevron-down `<path d="m6 9 6 6 6-6"></path>` · chevron-up `<path d="m6 15 6-6 6 6"></path>`
- close `<path d="M6 6l12 12"></path><path d="M18 6 6 18"></path>`
- pencil `<path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="m13.5 6.5 4 4"></path>`
- trash `<path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M6 7l1 13h10l1-13"></path>`
- move `<path d="M3 6.5h6l2 2h10v11H3z"></path><path d="M12 14h6"></path><path d="m15.5 11.5 2.5 2.5-2.5 2.5"></path>`
- image `<rect x="3.5" y="4.5" width="17" height="15" rx="1"></rect><circle cx="9" cy="10" r="1.5"></circle><path d="m20.5 16-5-5-8 8.5"></path>`
- inbox `<path d="M3 13h5l1.5 3h5L16 13h5"></path><path d="M5 5h14l2 8v6H3v-6z"></path>`
- sidebar `<rect x="3.5" y="4.5" width="17" height="15" rx="1"></rect><path d="M9 4.5v15"></path>`
- refresh / flip `<path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path>`
- arrow-left `<path d="M19 12H5"></path><path d="m11 18-6-6 6-6"></path>` · check `<path d="m5 12 5 5 9-10"></path>`
- alert `<path d="M12 4 2.5 20h19z"></path><path d="M12 10v4"></path><path d="M12 17h.01"></path>`
- more `<circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle>`

---

## 4. Keyboard map

**Rules**
1. Bind by `code`. Ignore with Alt/Ctrl/Meta unless the combo is listed. Ignore key repeat. Ignore ALL keys
   when `e.isComposing` or `keyCode === 229` (French dead keys `^ ¨`, compose, IME).
2. **Scopes.** Library keys (`J K X Пробел ↵ E M Delete ⌘⌫ ⌘A ⇧↑↓`) are live only while focus is inside the
   list region (the roving row or the table container). Review keys live while focus is on the card, the body
   or the grade row. Global keys (`N / ? G… [ F6`) are ignored when the target is an input, textarea,
   contenteditable, `select`, `button`, `a`, or `[role=menu|listbox|combobox|radiogroup|switch|grid]` that
   handles that key natively — Space and ↵ always activate the focused control, arrows move inside groups.
3. Any open dialog, menu, popover or picker (incl. the `M` theme picker with its type-ahead) blocks every
   page-level shortcut; only its own keys apply.
4. **Input guard**: ignore keys for 400ms after a screen transition (Session done, practice start, dialog
   open), including keydowns that started before the render.
5. Browser-reserved combos (`⌘N`, `⌘T`, `⌘W`) are never used.

**Esc stack** — each press consumes exactly ONE layer, top first: tooltip → menu/popover → drag → inline edit
(import row / pane field) → dialog sub-step (add form → search, keeps the draft) → dialog / overlay panel →
selection. Clearing a selection never happens in the same press that dismissed another layer.

**Global** (all (новое) except Esc):
| Key | Action |
|---|---|
| `N` | open «Новое слово» dialog |
| `/` | go to Библиотека and focus search |
| `?` (key «?» or ⇧ + code Slash) | open «Клавиши» overlay |
| `G` затем `R` / `L` / `I` (1s window) | Повторение / Библиотека / Импорт |
| `G` затем `E` / `C` (новое, 2026-10-23) | Упражнения / Контекст |
| `G` затем `P` (новое, 2026-10-25) | Прогресс (a bare `P` stays «Ещё практика» on the done screen) |
| `[` | hide / show the sidebar |
| `F6` / `⇧F6` | next / previous region: sidebar → toolbar → list → detail (Mail/Finder) |
| `⌘V` with an image in the clipboard (focus not in a text field) | start screenshot import |
| `Esc` | one layer of the Esc stack |

**Review** (exists in `keys.ts`): `Пробел` / `↵` flip, and on the answer side flip back (never grades);
`1` `2` `3` Не знаю / Сложно / Знаю (answer side; 2-button mode: `1`, `2`/`3`); `←` / `→` Не знаю / Знаю (answer
side); `Z` undo last answer. **Practice** (новое key): `Esc` «Закончить практику».

**Упражнения** (новое, 2026-10-23; `exerciseKeyAction` in `keys.ts`, bound by `code`, same scope, typing and
400 ms input-guard rules as Review). List (D-Exercise-List): `J`/`K` move the selected tile, `↵` «Начать».
Player (D-Exercise-Player): `1` `2` `3` `4` pick an option — the tap equivalent, it answers at once (`Digit1–4`
and `Numpad1–4`; on a `register` item they pick нейтр. / fam. / arg. / vulg.); `0` «Не знаю»; `↵` «Дальше»
after any answer (right ones wait too; nothing moves on by itself); `Esc` «Выйти» (the run is saved, no confirm). Keys pressed before the result line
is in are ignored (no queueing). Shown as Kbd caps `1`–`4` on the tiles, `↵` on «Дальше», and the HintLine
«1–4 ВЫБРАТЬ · 0 НЕ ЗНАЮ · ENTER ДАЛЬШЕ · ESC ВЫЙТИ»; the «Клавиши» overlay gets an «Упражнения» group and the
row «G → E».

**Session done** (новое): focus lands ON «Повторить ошибки» (focus ring visible), so `↵`/`Пробел` press it
natively — no global `↵`. `P` «Ещё практика», `N` add. With no mistakes the primary is absent, focus goes to
the h1 and `↵` does nothing.

**Library / Theme** (новое): `J`/`↓` next, `K`/`↑` previous (cursor; detail follows); `↵` **open** — at
expanded moves focus into the detail card, at medium opens the panel (same meaning at every size); `E` edit
the current word (or ↵ on the card's pencil); in edit `⌘↵` save, `Esc` cancel; `X` or `Пробел` toggle select;
`⇧↓`/`⇧↑` extend; `⌘A` select all in the current filter; `M` move (picker with type-ahead); `Delete` or `⌘⌫`
delete the selection, else the current word (bare `⌫` does nothing); `Z` / `⌘Z` undo; `R` «Повторить тему»
(theme screen); `F2` rename the shown theme. After delete/move the cursor goes to the next row (previous at
the end).

**Add dialog**: `↑`/`↓` through «Словарь» + «Варианты»; `↵` pick (default: first «Вариант»); `Tab` next field;
`⌘↵` «Добавить»; `⇧⌘↵` «Добавить и ещё»; `Esc` from the form → back to search, the form kept as a draft (back
arrow or ↵ on the same headword reopens it until the headword changes); `Esc` in search → close.

**Import review**: `J`/`K` move; `X`/`Пробел` toggle row; `↵` edit row inline (`Esc` cancels); `⌘A`
«Выбрать все»; `⌘↵` «Добавить N слов».

**Sort plan dialog**: `↑`/`↓` move; `Пробел` toggle the focused group's checkbox; `↵` change target of the
focused word; `⌘↵` «Применить»; `Esc` cancel.

**Where keys are shown** (each key once per screen)
1. Printed caps: grade buttons (`1` `2` `3`), question-card footer (`Пробел`), search field (`/`), bulk bar
   (`M`, `⌘⌫`, `Esc`), dialog primaries (`⌘↵`), snackbar (`Z`), «Повторить тему» (`R`).
2. Review hint line: flat mono key names, no boxes, left-aligned under the card's left edge, bottom 24
   (off in Settings › Клавиши; hidden below 760 tall).
3. Dialog footers: one muted line of the dialog's keys (flat names).
4. Tooltips on every icon-only button: label + cap.
5. Menus: cap right-aligned on each item.
6. `?` overlay: the full list (D-Shortcuts).
Every control with a key carries `aria-keyshortcuts`; caps inside a labelled control are `aria-hidden`.

**Library a11y model**: the table is ONE tab stop with roving tabindex, `role="grid"`,
`aria-multiselectable="true"`; `aria-selected` = selection, `aria-current="true"` = cursor (APG: focus ≠
selection). The detail pane title is `aria-live="polite"`. Medium overlay panel is non-modal: focus stays on
the row, `↵` moves focus into the panel, `Esc` closes it and returns focus to the row.

---

## 5. Boards

All expanded boards are **1440×800**. 25 boards:

| # | File | Canvas title | Size |
|---|---|---|---|
| 1 | D-Review-Question.dc.html | Десктоп · Повторение · вопрос | 1440×800 |
| 2 | D-Review-Answer.dc.html | Десктоп · Повторение · ответ | 1440×800 |
| 3 | D-Review-Practice.dc.html | Десктоп · Практика | 1440×800 |
| 4 | D-Session-Done.dc.html | Десктоп · Готово на сегодня | 1440×800 |
| 5 | D-Shortcuts.dc.html | Десктоп · Клавиши | 1440×800 |
| 6 | D-Library.dc.html | Десктоп · Библиотека | 1440×800 |
| 7 | D-Library-Edit.dc.html | Десктоп · Библиотека · правка слова | 1440×800 |
| 8 | D-Library-Refresh.dc.html | Десктоп · Библиотека · обновить перевод | 1440×800 |
| 9 | D-Library-Bulk.dc.html | Десктоп · Входящие · выбор и перенос | 1440×800 |
| 10 | D-Theme.dc.html | Десктоп · Тема · Деньги | 1440×800 |
| 11 | D-Theme-New.dc.html | Десктоп · Новая тема | 1440×800 |
| 12 | D-Sort-Plan.dc.html | Десктоп · Разложить по темам | 1440×800 |
| 13 | D-Add-Empty.dc.html | Десктоп · Новое слово · пусто | 1440×800 |
| 14 | D-Add-Suggest.dc.html | Десктоп · Новое слово · подсказки | 1440×800 |
| 15 | D-Add-Form.dc.html | Десктоп · Новое слово · форма | 1440×800 |
| 16 | D-Add-List.dc.html | Десктоп · Несколько слов | 1440×800 |
| 17 | D-Import-Drop.dc.html | Десктоп · Импорт · скриншот | 1440×800 |
| 18 | D-Import-Processing.dc.html | Десктоп · Импорт · распознавание | 1440×800 |
| 19 | D-Import-Review.dc.html | Десктоп · Импорт · проверка | 1440×800 |
| 20 | D-Settings.dc.html | Десктоп · Настройки | 1440×800 |
| 21 | D-Login.dc.html | Десктоп · Вход | 1440×800 |
| 22 | D-Library-Medium.dc.html | 1024 · Библиотека | **1024×768** |
| 23 | D-Library-Touch.dc.html | 1180 · Библиотека · сенсорный экран | **1180×820** |
| 24 | D-Review-Answer-Dark.dc.html | Десктоп · Ответ · тёмная тема | 1440×800 |
| 25 | D-Library-Dark.dc.html | Десктоп · Библиотека · тёмная тема | 1440×800 |

Canvas placement (canvas.json, x-step 1560, rows 1060 apart, below the mobile rows): «Д1 · Повторение» y 6000:
1–5 · «Д2 · Библиотека» y 7060: 6–12 · «Д3 · Добавление» y 8120: 13–16 · «Д4 · Импорт» y 9180: 17–19 ·
«Д5 · Остальное» y 10240: 20–23 · «Д6 · Тёмная тема» y 11300: 24, 25. `"radius": 8`, `"is_interactive": true`.

### Shared word data (16 SPEC words + l'oseille + se prendre la tête)
`№` = word number (creation order, same counter as «Карточка № 159»). «Показ» = earliest of both directions.

| № | FR · POS | RU | Уровень | Тема | Status | Показ |
|---|---|---|---|---|---|---|
| 001 | se casser · v. pron. | свалить, сбежать | arg. | Повседневное | учится | к повт. |
| 002 | la thune · n. f. | бабки, деньги | arg. | Деньги | выучено | через 4 д |
| 003 | le fric · n. m. | бабло | fam. | Деньги | выучено | через 9 д |
| 004 | bouffer · v. | жрать, есть | fam. | Еда | учится | к повт. |
| 005 | les keufs · n. m. pl. | менты | arg. · verl. | Полиция | новое | новое |
| 006 | les flics · n. m. pl. | копы | fam. | Полиция | выучено | через 12 д |
| 007 | chelou · adj. | стрёмный, странный | fam. · verl. | Эмоции | трудное | к повт. трудн. |
| 008 | kiffer · v. | тащиться, обожать | arg. | Эмоции | учится | через 2 д |
| 009 | la meuf · n. f. | девушка, тёлка | fam. · verl. | Люди | выучено | через 6 д |
| 010 | un pote · n. m. | кореш, друг | fam. | Люди | выучено | через 3 нед |
| 011 | c'est ouf · loc. | это безумие | fam. · verl. | Эмоции | новое | новое |
| 012 | la galère · n. f. | засада, мучение | fam. | Повседневное | трудное | к повт. трудн. |
| 013 | se tirer · v. pron. | свалить | arg. | Повседневное | трудное | через 1 д трудн. |
| 014 | une blague · n. f. | шутка | нейтр. | Повседневное | выучено | через 4 нед |
| 015 | dépêche-toi · loc. | поторапливайся | нейтр. | Повседневное | новое | новое |
| 016 | vas-y · loc. | давай | fam. | Повседневное | учится | через 3 д |
| 017 | l'oseille · n. f. | бабки | arg. | Деньги | выучено | через 5 д |
| 018 | se prendre la tête · loc. | загоняться, париться | fam. | Эмоции | учится | через 2 д |

Alphabetical order (ignoring articles and «se», used by «Слово ▲»): une blague, bouffer, se casser, chelou,
dépêche-toi, les flics, le fric, la galère, les keufs, kiffer, la meuf, l'oseille, c'est ouf, un pote,
se prendre la tête, la thune, se tirer, vas-y.

Деньги theme (D-Theme), alphabetical: le blé · n. m. — бабки — fam. — к повт. · être fauché · loc. — без
гроша — fam. — к повт. · le flouze · n. m. — бабки — arg. — новое · le fric (003) · l'oseille (017) · raquer ·
v. — раскошелиться — arg. — к повт. · la thune (002).

«Входящие» (7, all «новое»): le pognon · n. m. — бабки — arg. · les ronds · n. m. pl. — деньги, бабосы — fam. ·
être raide · loc. — быть на мели — fam. · avoir la haine · loc. — быть в бешенстве — fam. · la caisse · n. f. —
тачка — fam. · le tromé · n. m. — метро — fam. · verl. · la teuf · n. f. — вечеринка, туса — fam. · verl.

**Described states (not drawn), exact copy**
- Review, empty library (720 column, y 64): h1 Newsreader 34/40 «Пока нет слов»; 15px muted «Добавьте первое
  слово или выражение — оно появится здесь карточкой с переводом.»; 24px; primary «Добавить слово» +
  secondary «Импорт со скриншота». (The mobile eyebrow «Повторение» is dropped: the sidebar says it.)
- Review, loading: the card outline 720×432 at its position with two hairline skeleton bars (40%, 24%), no
  text; running head drawn, counts empty.
- Session done, nothing due: in the receipt's place between two ink rules, 15px muted «Сегодня повторять
  нечего.»; actions row without the primary.
- Toasts (global snackbar, no undo): «Сегодня ошибок не было»; «Пока нечего повторять — сначала ответьте на
  несколько карточек»; at practice end «Практика окончена».
- Theme, empty: under the header, top hairline, 15px muted «В этой теме пока нет слов.» + secondary «Добавить
  слово». Входящие empty: «Здесь пусто — все слова разложены по темам.» Missing id: h1 «Тема не найдена».
- Library / theme loading: 5 skeleton rows 40px (bars 128 and 80 wide, `#e8e8e4`).
- Library search/filters (subline replaced while active): «Найдено 4 слова» / «Ищем…»; none: «Ничего не
  найдено» + 15px muted «Такого слова нет ни во французском, ни в переводе.» + secondary «Добавить «se barrer»»
  (→ D-Add-Suggest.dc.html); «Трудных слов нет.»; «С таким уровнем сленга слов нет.»; over 200 rows, last
  line 13px muted «Показаны первые 200. Уточните поиск, чтобы увидеть остальные.»
- Import status (StatusView, in the content area left-aligned, padding 48): offline → h1 «Нет сети» + the
  error message + primary «Повторить» + secondary «Выбрать другой скриншот»; none found → h1 «Слов не найдено» +
  «На скриншоте не нашлось французских слов. Попробуйте другой скриншот или обрежьте лишнее.» + «Выбрать
  другой скриншот». Review notices (warn box over the rows): «Распознавание остановлено — здесь то, что успели
  найти.»; «Распознано не всё: связь прервалась.» + tertiary «Распознать заново».

---

### 1. D-Review-Question.dc.html — question side, at rest
Red marks: sidebar bar, «Входящие» count, card rule = 3. No tooltip, no snackbar, no pointer.
- Sidebar: «Повторение» active, count `23`.
- **Running head** x 248–1440, y 0–56, padding 0 32: left — direction chip `FR → RU` + swap icon (30px, as
  mobile), theme chip «Все темы ▾», then 13px muted «23 к повторению · 4 новых»; right — mono 13 ink 500
  «07 / 30», 16px, undo icon button 32×32 at rest (aria «Отменить последний ответ», `aria-keyshortcuts="Z"`),
  `?` button 32×32 (mono 13 «?», 1px `#8a8a85`, radius 4, white; aria «Все клавиши»; link
  D-Shortcuts.dc.html). **Rule** y 56: 1px `#d6d6d1` full-bleed x 248–1440 with a 2px ink fill over it from
  x 248, width 23.3% (278px) = progress. No separate progress row.
- **Card stack** + card at x 484 (centred in the 1192 content), y 136, 720×432, white, 1px `#d6d6d1`, radius 6;
  two stack outlines (§3) behind it. Card is a link to D-Review-Answer.dc.html (aria «Карточка se casser,
  перевернуть», `aria-keyshortcuts="Space"`). `user-select: text` on the headword.
  - header 48, padding 0 40: mono 11 muted «FR · № 001» left; nothing right; 2px red bottom rule.
  - ruled body (§3): «se casser» step 1 (56/64), baseline on line 2, padding-left 40; «v. pron.» Newsreader
    italic 17 muted, baseline on line 3.
  - footer 48, 1px top hairline, margin 0 40: flip icon 14 + 13px muted «Щелчок или» + cap `Пробел` +
    «— перевернуть» (новое copy).
- **Grade slot** y 600–656: empty paper (keeps the grade row's height; nothing moves on flip).
- **Hint line** y 760, x 484, mono 11 muted, flat: «после переворота: 1 2 3 оценить · Z отменить».

### 2. D-Review-Answer.dc.html — answer side
Red marks: bar, Входящие, card rule, «Не знаю» = 4.
- Same sidebar, running head (`07 / 30`), stack.
- **Card** y 136, 720×432, plain white (no rules), `<article>`, link back to D-Review-Question.dc.html (aria
  «se casser, ответ. Перевернуть обратно»):
  - header 48: «FR · № 001» left; right slang meter (10×3 segments, 3 filled) + italic «arg.» 15; red rule.
  - body padding 0 40, positions as the front: «se casser» 56/64; «v. pron.»; 16px; «свалить, сбежать» Plex
    500 24/32; 8px; note 15/22 muted max 60ch «Casse-toi — грубое «свали». Ещё значит «сломаться».» (clamped
    to 3 lines; overflow shows «Ещё» → opens the word in the library); 20px; hairline; 16px; example «Allez,
    on se casse d'ici.» Newsreader italic 18/24 + «Ладно, сваливаем отсюда.» 14/20 muted. Body `overflow:auto`;
    when clipped, a mono 11 muted «ещё ↓» sits on the footer rule at right.
  - footer 44, hairline top, margin 0 40: tracings 13px muted «1. Повседневное   2. arg.».
- **Grade row** y 600, 56px, width 720, grid `254px 16px 188px 8px 254px` (2-button mode `1fr 16px 1fr`, same
  hairline): «Не знаю» · 16px gap with a 1px `#d6d6d1` vertical hairline 24px tall · «Сложно» · 8 · «Знаю».
  Each `<a href>`, outlined, white, radius 6, at rest: cap at left 12; label 15px 500 + interval mono 11 under
  it, centred. «Не знаю» `#b3261e`, `1`, «<1 мин» → D-Review-Question.dc.html. «Сложно» border `#8a8a85`, ink
  text, `2`, «6 мин» → D-Review-Question.dc.html. «Знаю» `#1d6b45`, `3`, «1 д» → **D-Session-Done.dc.html**
  (prototype shortcut: treat it as the session's last answer). `aria-keyshortcuts` 1/2/3.
- **Hint line** y 760: «← → не знаю / знаю · Пробел вопрос · Z отменить».

### 3. D-Review-Practice.dc.html — practice (mistakes), answer side of chelou
Red marks: bar, Входящие, card rule, «Не знаю» = 4.
- Sidebar «Повторение» active, NO count.
- Running head: left a single chip «Закончить практику» (close icon 14, 30px, 1px `#8a8a85`, radius 4; link
  D-Session-Done.dc.html; `aria-keyshortcuts="Escape"`) + 13px muted «Практика · не влияет на расписание»;
  right mono «02 / 03», undo, `?`. Rule fill 66.7%. Stack: 1 outline (1 card left).
- Card: «FR · № 007»; meter 2 filled + italic «fam. · verl.»; «chelou» 56/64; «adj.»; «стрёмный, странный»;
  note «Верлан от «louche».»; example «Il est chelou, ce mec.» / «Странный он какой-то.»; tracings
  «1. Эмоции   2. fam.   3. verl.».
- Grade row: same grid, labels only centred (no interval line), caps kept; all three → D-Session-Done.dc.html
  (end of practice → toast «Практика окончена»).
- Hint line: «← → не знаю / знаю · Пробел вопрос · Esc закончить практику».

### 4. D-Session-Done.dc.html — «Готово на сегодня»
Red marks: bar, Входящие, «Трудные» count = 3.
- Sidebar: «Повторение» active, no count. Column 720 at x 484. No running head.
- y 64 h1 Newsreader 500 40/44 «Готово на сегодня» (`tabindex="-1"`, no eyebrow).
- **Receipt** y 132: 1px ink rule; three 44px rows: label 15 left, dotted leader (1px dotted `#d6d6d1`,
  flex 1, baseline), mono 15 ink right: «Повторено … 30», «Новых … 4», «Верно … 92 %»; 1px ink rule.
- y 278 13px muted «22 октября · Следующие 18 слов — завтра».
- **Actions row** y 318, left-aligned to the receipt: primary «Повторить ошибки (3)» 44px drawn WITH the
  focus-visible ring (initial focus, no cap) → D-Review-Practice.dc.html; 24px; text button «Ещё практика»
  15px 500 + cap `P` + 12px muted «не влияет на расписание» → D-Review-Practice.dc.html; 24px; text button
  «Добавить слова» + cap `N` → D-Add-Empty.dc.html.
- **«Трудные»** y 402, full 720: Plex 500 13 «Трудные» + mono 12 red `3`, ink rule; rows 48 (hairlines),
  links to D-Library.dc.html (illustrative target): chelou — стрёмный, странный — meter + «fam. · verl.»;
  la galère — засада, мучение — «fam.»; se tirer — свалить — «arg.» (FR Newsreader 19, RU 14 muted, level right).

### 5. D-Shortcuts.dc.html — «Клавиши» overlay
- Underlying D-Review-Question + scrim. Dialog 800 (x 320–1120), top 40, max 720. Chrome: close X (tooltip
  `Esc`) → D-Review-Question.dc.html; title «Клавиши»; red rule.
- Two columns 352, gap 48. Groups: Plex 500 13 heading + ink rule; rows 30px hairlines: action 14 left, caps right.
  - «Везде»: Новое слово `N` · Поиск в библиотеке `/` · Все клавиши `?` · Повторение `G` затем `R` ·
    Библиотека `G` затем `L` · Импорт `G` затем `I` · Скрыть боковую панель `[` · Следующая область `F6` ·
    Вставить скриншот `⌘V` · Закрыть или отменить `Esc`. «Повторение»: Перевернуть карточку `Пробел` или `↵` ·
    Не знаю / Сложно / Знаю `1` `2` `3` · Не знаю / Знаю `←` `→` · Отменить ответ `Z` · Закончить практику `Esc`.
  - «Библиотека»: Следующее / предыдущее слово `J` `K` · Открыть карточку `↵` · Изменить слово `E` · Отметить
    `X` · Расширить выделение `⇧↓` · Выбрать все `⌘A` · Переместить в тему `M` · Удалить `Delete` или `⌘⌫` ·
    Отменить действие `Z` · Повторить тему `R` · Переименовать тему `F2`. «Новое слово и импорт»: По подсказкам
    `↑` `↓` · Выбрать подсказку `↵` · Добавить `⌘↵` · Добавить и ещё `⇧⌘↵`.
- Footer: 13 muted «Однобуквенные клавиши можно выключить в» + link «настройках» (D-Settings.dc.html).

### 6. D-Library.dc.html — all words, master-detail
Red marks: bar, Входящие, detail card rule = 3.
- Sidebar «Библиотека» active. List pane x 248–1040 (padding 24, inner 744), detail x 1040–1440 (1px left rule).
- **Header**: y 20 h1 «Библиотека»; same row, right end: guide words of the visible range Newsreader italic 16
  muted «chelou — vas-y» (only when sorted by «Слово»). y 60 subline 13 muted «158 слов · 23 к повторению · 120 повторено · 14 сегодня» («сегодня» only when > 0)
  (23 ink 500), 24px, «7 слов без темы» + 8px + tertiary 13/500 underlined «Разложить по темам» →
  D-Sort-Plan.dc.html. y 84 12px muted «Последняя раскладка: 12 перемещений» + 8px tertiary 13 «Отменить».
- **Toolbar** y 112, 36px: search 300 (white, 1px `#8a8a85`, radius 4, search icon, placeholder «Поиск по FR
  и RU», cap `/` inside right); 24px; filter strip: «Все» (active) · «К повторению 23» · «Трудные 9» ·
  «Сленг ▾». «Сленг ▾» opens a 280px popover (§3 menu style) under it: Plex 500 13 «Уровень сленга» + right
  tertiary «Сбросить»; toggle chips нейтр. fam. arg. vulg. verl. (Newsreader italic 14); the item then reads
  «Сленг: arg.» or «Сленг: 3» (described).
- **Table** header y 160 (full-bleed ink rule x 248–1040): checkbox (aria «Выбрать все») «Слово ▲» «Перевод»
  «Уровень» «Тема» «Показ». Rows y 192–792: 15 rows, scrolled to the cursor: chelou … vas-y (alphabetical rows
  4–18). Checkbox gutter empty at rest (box shows on hover/selection; the gutter is the hit area). Тема = plain
  13px muted name. Уровень = meter + italic abbr 14.
- **Current row**: la thune (white + 2px ink bar). No other states.
- **Detail pane** (padding 24, inner 351; scrolls, nothing pinned):
  - y 16, 32px row: theme button «■ Деньги ▾» (8×8 `#2f6b4f`, 13px, 1px `#8a8a85`, radius 4; aria «Тема:
    Деньги. Переместить», `M`); right: chevron-up («Предыдущее слово», `K`), chevron-down («Следующее слово», `J`).
  - y 64 **index card** (white, 1px rule, radius 6) y 64–324: header 40, padding 0 20: mono 11 muted
    «FR · № 002» + right meter + italic «arg.»; 2px red rule; body padding 20, set as an entry: «la thune»
    Newsreader 500 36/40 + right 28×28 pencil (aria «Изменить слово и перевод», `E`, → D-Library-Edit.dc.html);
    grammar line Newsreader italic 15 muted «n. f. · arg.»; 8px; «бабки, деньги» Plex 500 18/24; 12px; note
    prose 14/20 «Синонимы: le fric, l'oseille» with a 28×28 muted pencil at the right of its first line (aria
    «Изменить заметку»); 12px; example Newsreader italic 16 «J'ai plus de thune.» + next line 13 muted «— У меня
    больше нет бабок.», pencil «Изменить пример». Empty fields read «Нет заметки» / «Нет примера» (muted);
    inline field edit uses placeholders «Phrase en français» / «Перевод».
  - y 344 «Повторение» Plex 500 13 + right 12 muted «выучено · 6 показов», ink rule; two 36px rows
    (hairlines): mono `FR → RU` · 13px «следующий показ через 4 д» · mono muted «стаб. 9 д»; `RU → FR` ·
    «следующий показ через 5 д» · «стаб. 5 д».
  - y 456 «История» + ink rule; date-due slip: 6 ruled rows 24px, mono 12 date + mono 11 muted direction +
    13px grade word: 14.10 `FR → RU` знаю · 11.10 `RU → FR` знаю · 07.10 `FR → RU` знаю · 03.10 `RU → FR`
    не знаю · 30.09 `FR → RU` сложно · 22.09 `FR → RU` знаю.
  - y 636 12 muted «Рядом в алфавите:» + Newsreader 14 «la teuf · **la thune** · se tirer · le tromé»
    (current unlinked ink 500, others links to D-Library.dc.html).
  - y 676 tertiary text buttons, 13px: «Обновить перевод и заметку» (refresh icon 14) →
    D-Library-Refresh.dc.html; next line «Сбросить прогресс» · «Удалить слово» (ink, trash icon 14).
  - y 760 mono 11 muted «Добавлено 12.09.2026 · вручную».
- Empty-pane state (described): blank ruled card «Выберите слово» + flat keys «J K ↵».

### 7. D-Library-Edit.dc.html — editing in the pane + row hover
- As D-Library, except header guide words hidden (sorted by «Показ ▲») and:
- **Detail card in edit mode**: «Французский» label 12 muted + input 40 (Newsreader 20 «la thune», 1px
  `#8a8a85`, radius 4); «Русский» input 40 «бабки, деньги» FOCUSED (2px ink, caret after «деньги»); «Уровень
  сленга» text options нейтр. | fam. | arg. | vulg. (Newsreader italic 14, arg. selected) + «verl.» checkbox
  (off); buttons right: «Отмена» tertiary + cap `Esc`, «Сохранить» primary 36 + on-ink `⌘↵`, both →
  D-Library.dc.html. Повторение/История below. Leaving the row (J/K, click) while dirty saves and shows
  «Сохранено · Отменить»; Esc discards and shows «Изменения не сохранены · Вернуть». Duplicate guard (described):
  12px `#8a5a00` ««la thune» уже есть в «Деньги».» and the primary becomes «Сохранить всё равно».
- **Row hover** on le fric: bg `#e8e8e4`, box visible (unchecked), Показ replaced by the 72px slot (move,
  trash 28×28); the move button has KEYBOARD FOCUS ring + its tooltip above: «Переместить в тему» + `M`. No pointer.
- Rows by «Показ ▲»: se casser, bouffer, chelou, la galère (к повт.) · les keufs, c'est ouf, dépêche-toi
  (новое) · se tirer 1 д · kiffer 2 д · se prendre la tête 2 д · vas-y 3 д · la thune 4 д (current) ·
  l'oseille 5 д · la meuf 6 д · le fric 9 д (hovered, row 15) · [cut: les flics 12 д, un pote 3 нед,
  une blague 4 нед].

### 8. D-Library-Refresh.dc.html — «Обновить перевод и заметку» result
- As D-Library. In the detail card, under the RU line, an inline panel (1px ink border, radius 6, padding 12):
  Plex 500 13 «Предлагаемые изменения»; rows per field (checkbox + label 12 muted + values):
  «Перевод» ☑ old «бабки, деньги» muted struck through → new «бабки, бабло, деньги» ink; «Заметка» disabled
  checkbox, 13px muted «без изменений». Footer row: «Принять 1» primary 36 + «Оставить как есть» tertiary, both
  → D-Library.dc.html. Fields that may appear: Перевод / Заметка / Пример / Уровень сленга / Часть речи.
- Described: while running, the tertiary label reads «Подбираем…» (loading token); results «Перевод и заметка уже
  актуальны.» / «Вариантов не нашлось.» in 13px muted in the panel's place.

### 9. D-Library-Bulk.dc.html — «Входящие»: multi-select, bulk bar, drag
Red marks: bar, Входящие count, «Удалить» in bulk bar = 3.
- Sidebar: «Входящие» active. **Drag in progress**: every theme row shows the dashed target outline; «Деньги»
  hovered (white, 2px ink, count → mono `+3`). Ghost «le pognon» + mono `+2` at 12/12 from a pointer drawn over
  «Деньги».
- Header: h1 «Входящие»; subline «7 слов без темы» + tertiary «Разложить по темам» → D-Sort-Plan.dc.html.
  Toolbar as D-Library.
- Table without «Тема». Header checkbox indeterminate. 7 inbox words, boxes visible; rows 1–3 (le pognon,
  les ronds, être raide) selected; row 3 also current. No hover actions.
- **Snackbar** (from the previous move) 12px above the bulk bar: «Перемещено в «Тусовка» · Отменить» + `Z`.
- **Bulk bar**: mono 12 «3» + 14px «выбрано»; text buttons with caps: «Переместить…» `M` · «Удалить»
  (`#b3261e`) `⌘⌫`; right close icon (aria «Снять выделение») + `Esc`. 1px separators 20px tall.
- **Detail pane = selection summary**: Newsreader 28 «3 слова»; hairline list le pognon — бабки / les ronds —
  деньги, бабосы / être raide — быть на мели; «Переместить в тему» Plex 500 13 + ink rule; theme buttons 32
  (8×8 square + Newsreader 16 + mono count), real order: Повседневное 42, Деньги 18, Еда 15, Полиция 9,
  Тусовка 21, Эмоции 27, Люди 19, then dashed «+ Новая тема…» → D-Theme-New.dc.html; 12 muted «Или перетащите
  слова на тему слева.»

### 10. D-Theme.dc.html — «Деньги», theme menu open
Red marks: bar (Деньги row), Входящие, detail card rule, «Удалить тему» = 4.
- Sidebar: «Деньги» row active; «Библиотека» at rest.
- **Header**: y 20 h1 «Деньги» Newsreader 28 + 8px mono 11 tag «закреплена» (1px `#d6d6d1`, radius 4,
  padding 0 6). y 60 subline «18 слов · 3 к повторению» (3 к повторению ink 500 — red budget). y 84 mastery:
  2px line 200 wide (`#d6d6d1` track, `#2f6b4f` fill 64%) + 12px mono «64 % выучено». Right on the h1 row:
  «Повторить тему» primary 36 + mono 13 «5» + on-ink cap `R` → D-Review-Question.dc.html (the app's
  `/?folder=id`); 8px; `⋯` 32×32 (aria «Ещё действия с темой», pressed state bg `#e8e8e4`).
- **Theme menu** open under `⋯`, right-aligned to it, 320 wide (§3 menu): «Название, описание и цвет» (pencil
  icon, `F2`) → D-Theme-New.dc.html; option row: checkbox (checked) «Закрепить тему» + 12 muted caption
  «Раскладка по темам не переименует её и не будет забирать из неё слова.»; separator; «Удалить тему» (trash,
  `#b3261e`) + 12 muted caption «Слова из удалённой темы попадут во «Входящие».»
- Toolbar as D-Library (search + filter strip). Table without «Тема», Деньги words alphabetically (shared
  data); current row la thune. Detail pane identical to D-Library.

### 11. D-Theme-New.dc.html — «Новая тема» dialog
- Underlying D-Library + scrim. Dialog 440 (x 500–940), top 80. Chrome: mono 11 muted «Тема» left, close X →
  D-Library.dc.html. Title «Новая тема»; red rule.
- «Название» input 44 FOCUSED, placeholder «Например, Транспорт»; 16px; «Описание» textarea 3 lines,
  placeholder «Что сюда попадает» + 12 muted hint «По описанию новые слова раскладываются в эту тему.»; 16px;
  «Цвет»: 12 swatches 28×28 radius 4, gap 8, 2 rows (FOLDER_COLORS: #5a5a57 #2f6b4f #a0522d #2f4b8a #6b4a8a
  #a33a3a #2f6f74 · #7a6a2f #4a6b2f #8a4a6b #2f5a8a #6b5a4a); #7a6a2f selected (2px ink ring offset 2).
- Footer: «Отмена» tertiary + `Esc`; «Создать тему» primary 40 + `⌘↵` → D-Theme.dc.html. Edit variant
  (described): same dialog, title «Изменить тему», fields filled.

### 12. D-Sort-Plan.dc.html — «Предлагаемые перемещения»
- Underlying: «Входящие» (D-Library-Bulk without selection/drag/bar) + scrim. Dialog 760 (x 340–1100), top 40,
  height 720; body scrolls.
- Chrome: mono 11 muted «Разложить по темам», close X → D-Library-Bulk.dc.html; title «Предлагаемые
  перемещения»; red rule.
- Sub: 13 muted «12 перемещений · 1 новая тема» + line «Слова, разложенные вручную, не трогаются (64 слова).»
- Ledger header (mono, ink rule): «Слово» 220 · «Перевод» 200 · «Откуда» 140 · «Куда» rest.
- Groups in folder order, new theme last. Group header 36: checkbox (aria «Перемещать в «X»») + «→» + 8×8
  square + Newsreader 19 name + mono count. Word rows 32, hairlines; «Куда» = 13px button «Деньги ▾» (menu in
  folder order).
  - → Деньги 3: le pognon — бабки — Входящие; les ronds — деньги, бабосы — Входящие (CURRENT: `#f4f4f1` + 2px
    ink bar); être raide — быть на мели — Входящие.
  - → Тусовка 2: la teuf — вечеринка, туса — Входящие; picoler — бухать — Еда.
  - → Эмоции 2: avoir la haine — быть в бешенстве — Входящие; être vénère — злой, взбешённый — Повседневное.
  - → Люди 2, checkbox OFF: rows at 50% + 13 muted «· не перемещать»: le daron — батя — Повседневное;
    la daronne — мать, мамка — Повседневное.
  - → «Транспорт» 3 (dashed square + dashed mono tag «новая тема»): la caisse, le tromé, la bécane — the
    frame cuts after the group header.
- Footer: 13 muted «Можно отменить в течение 7 дней.»; «Отмена» tertiary + `Esc` → D-Library-Bulk.dc.html;
  «Применить 10» primary + `⌘↵` → D-Library.dc.html.

### 13. D-Add-Empty.dc.html — «Новое слово», empty
- Underlying D-Library (simplified) + scrim. Dialog 640 (x 400–1040), top 40 (same top as boards 14–16).
- Chrome 48: mono 11 muted «Карточка № 159», 16px, text links 13px «Скриншот» (→ D-Import-Drop.dc.html) ·
  «Список» (→ D-Add-List.dc.html), underlined at rest (1px, offset 3), no icons; right close X → D-Library.dc.html.
- Title «Новое слово» 28/36; red rule (the dialog top is the card's header).
- 24px; headword input 56, Newsreader 22, placeholder «Слово или выражение — FR или RU», FOCUSED; the input
  area is covered by a sibling overlay `<a href="D-Add-Suggest.dc.html" aria-label="Начать ввод">` (prototype;
  the input is `tabindex="-1"`, never inside the link). Its popup is «Недавние» (`role="listbox"`, rows `role="option"`).
- 8px; 13 muted «Перевод, заметка, уровень сленга и тема заполнятся сами — останется только проверить.»
- 24px; «Недавние» Plex 500 13 + right 12 muted «Сегодня · 3», ink rule; rows 48 → D-Library.dc.html: kiffer —
  тащиться, обожать — «arg.» — 12 muted «Эмоции»; un pote — кореш, друг — «fam.» — «Люди»; bouffer — жрать,
  есть — «fam.» — «Еда».
- 16px; 12 muted «Несколько слов сразу — через «Список». Со скриншота — через «Скриншот» или» + cap `⌘V`.
- Footer 48: flat keys «↑ ↓ по списку · ↵ выбрать · Esc закрыть».

### 14. D-Add-Suggest.dc.html — typing «se cass»
- Dialog top 40. Input «se cass» + caret. `role="combobox"` `aria-expanded="true"`, options `role="option"`.
- «Словарь» Plex 500 13 + right 12 muted «работает без сети»; 3 rows 40: «**se cass**er» + «v. pron.» + arrow-up-
  left (aria «Подставить: se casser»); «**se cass**er la tête» «loc.»; «**cass**e-croûte» «n. m.».
- **Duplicate box** (warn: bg `#fbf3df`, 1px dashed `#c99a2e`, radius 4), ONE 48px row: alert 16 + 13px `#8a5a00`
  «Уже есть в теме «Повседневное»» + mono 11 `№ 001` (no second line); right: secondary 32 «Открыть» → D-Library.dc.html, tertiary «Всё равно добавить» → D-Add-Form.dc.html.
- «Варианты» + right 12 muted «перевод · уровень · тема»; rows 72: 1) «se casser» Newsreader 19 + «v. pron.» /
  «свалить, сбежать» / «arg.» / 12 muted «Повседневное» — ACTIVE option (bg `#f4f4f1`, 2px ink bar, cap `↵`),
  → D-Add-Form.dc.html; 2) «se casser la tête» / «ломать голову» / «fam.» / «Повседневное»; 3) loading: two
  hairline skeleton bars (354 / 236px = 60% / 40% of the row, 8px, `#e8e8e4`). Gaps input → Словарь → box →
  Варианты: 16 / 16 / 16. Active option: full-bleed bottom rule (as D-Sort-Plan).
- «Заполнить вручную» (pencil) → D-Add-Form.dc.html, drawn in the footer as the combobox's last option (↓ past
  the variants reaches it). «Подставить» arrows 32×32, `tabindex="-1"` (↵ on a «Словарь» option does the same). Footer: «↑ ↓ по списку · ↵ выбрать · Esc закрыть».
- Described: offline → in place of «Варианты» 13px «Нет сети — подсказки недоступны. Заполни вручную, мы
  синхронизируем позже.» + inline quick form (FR / перевод, placeholders «По-французски» / «Перевод») +
  tertiary «Повторить»; nothing found → «Вариантов не нашлось.»; form errors under fields 12px `#b3261e`
  «Нужно французское слово» / «Нужен перевод».

### 15. D-Add-Form.dc.html — suggestion picked
- Dialog 640, top 40. Chrome: back arrow (aria «Назад к поиску», tooltip `Esc`) → D-Add-Suggest.dc.html +
  mono «Карточка № 159»; close X → D-Library.dc.html. Title «Новое слово»; red rule.
- Grid (gap 16, 288 each): «Французский» input 44 Newsreader 20 «se casser» | «Русский» 44 «свалить,
  сбежать». «Заметка» textarea 2 lines «Casse-toi — грубое «свали». Ещё значит «сломаться».». «Пример»: «Allez,
  on se casse d'ici.» (Newsreader italic) | «Ладно, сваливаем отсюда.». Labels 12 500 muted, 6px above, 16 between.
- «Уровень сленга»: text options нейтр. | fam. | arg. | vulg. (arg. selected) + «verl.» checkbox; 12 muted
  «определён автоматически».
- «Тема»: chips «Повседневное» (selected ink) + caption «подобрано автоматически», «Тусовка», «Эмоции», dashed
  «+ новая тема: Побег», «Другие темы ▾» (menu in folder order).
- Checkbox row (checked) «Карточки в обе стороны» + mono muted «FR → RU · RU → FR».
- Duplicate guard (drawn — Suggest has just shown that se casser exists): under «Французский» 12px `#8a5a00`
  ««se casser» уже есть в «Повседневное».» + mono `№ 001` (link → D-Library.dc.html); the primary reads
  «Добавить всё равно». Theme chips 32 tall; the selected chip's square gets a 1px white edge; «verl.» muted
  while unchecked.
- Footer 64: left flat keys «Tab дальше · Esc к поиску»; right «Добавить и ещё» secondary 40 + `⇧⌘↵` →
  D-Add-Empty.dc.html; «Добавить» (here «Добавить всё равно») primary 40 + `⌘↵` → D-Library.dc.html.

### 16. D-Add-List.dc.html — «Несколько слов»
- Dialog 640, top 40. Chrome: mono 11 muted «Список · 5 строк»; text link «Скриншот»; close X → D-Library.
  Title «Несколько слов»; red rule.
- Textarea 6 lines (24px lh), FOCUSED (2px ink, padding 8 10, caret after «xyz»), value: «bosser — работать / le taf — работа / galérer — мучиться /
  le fric — бабло / xyz» (one per line; empty placeholder is «la thune — бабки, деньги / kiffer — тащиться /
  chelou — стрёмный»).
- 16px; «Тема» label + select 36 «Входящие ▾» (menu in folder order).
- 24px; «Разбор» Plex 500 13 + right mono 12 «3 из 5», ink rule; rows 40 (checkbox gutter + FR Newsreader 17 +
  RU 14 muted + right mono 11 tag): ☑ bosser — работать; ☑ le taf — работа; ☑ galérer — мучиться;
  ☐ le fric — бабло + 12 muted «· Деньги, № 003» `УЖЕ ЕСТЬ`; ☐ xyz `НЕТ ПЕРЕВОДА` (disabled). Other tags:
  `ПОВТОР`, `НЕТ ФРАНЦУЗСКОГО` (mono 11 uppercase, .06em — same tag as D-Import-Review).
- Footer 64: left flat keys «↵ новая строка · Esc закрыть»; right «Добавить 3 слова» primary + `⌘↵` → D-Library.dc.html (snackbar «Добавлено 3 слова»).

### 17. D-Import-Drop.dc.html — import page, idle
Red marks: bar, Входящие, tray rule (dashed) = 3.
- Sidebar «Импорт» active. Content padding 48 (x 296).
- y 40 h1 «Импорт со скриншота»; 8px; 15 muted max 60ch «Переписка, пост, субтитры или список слов с
  переводом. Длинный скриншот разрежем на части.»
- **Drop tray** x 296, y 160, 720×432, idle (§3), dashed red rule at 48. Content left-aligned at 40 inset from
  y 96: image icon 24 muted; Newsreader 500 28 «Скриншот со словами»; mono 11 muted «PNG, JPEG, WebP · до 4
  фрагментов»; 12 muted «Можно перетащить сюда или вставить» + cap `⌘V`; 24px; «Выбрать скриншот» primary 40
  → D-Import-Processing.dc.html + «Вставить из буфера» secondary 40.
- **Margin notes** x 1048, 280 wide, aligned to the tray top, Newsreader italic 14/20 muted, no numbers or
  boxes: «Если перевода на скриншоте нет, мы подберём его и пометим `ДОГАДКА` — такие строки стоит проверить.»;
  16px; «Слова, которые уже есть в библиотеке, помечены `УЖЕ ЕСТЬ` и не отмечены.»; 16px; «Скриншот не
  сохраняется — только слова.»
- Described: drag-over turns the tray white, 2px ink, title «Отпустите, чтобы распознать». Elsewhere in the app
  the (новое) global drop shows a full-content paper overlay, 1px dashed ink inset 16, same title.

### 18. D-Import-Processing.dc.html — recognising
Red marks: bar, Входящие, scan line, «ИДЁТ» = 4.
- Panes as D-Import-Review. **Screenshot pane**: 12 muted «Скриншот 1 из 1 · 2 фрагмента»; the screenshot
  408 wide (same chat as board 19) with a 2px `#c8331f` horizontal scan line at 40% and a mono 11 `1/2` badge
  (white, 1px ink, radius 3) top-left.
- **Right pane** (padding 32): Newsreader 28 «Распознаём слова…»; 12px; 1px `#d6d6d1` line 100% with a 2px ink
  fill 55% (`role="progressbar"` aria «Прогресс распознавания»); 12 muted «2 слова»; 24px; steps as 40px
  hairline rows: mono 11 `01` + 15 «Текст найден» + right check 14; `02` «Перевод и уровень» + right red mono 11
  «ИДЁТ»; `03` «Проверка повторов» muted.
- 24px; «Найдено» Plex 500 13 + right 12 muted «По мере распознавания», ink rule; 2 streamed rows 52 (relou —
  достающий, надоедливый — «fam. · verl.»; la go — девушка — «fam.») + 4 hairline skeleton rows.
- Bottom bar 64: «Стоп» secondary 40 → D-Import-Review.dc.html (then shows the «Распознавание остановлено…»
  notice); 12 muted «Скриншот не сохраняется — только слова.»
- Described: first phase title «Готовим скриншот…», last «Проверяем повторы…».

### 19. D-Import-Review.dc.html — screenshot beside the rows
Red marks: bar, Входящие = 2.
- Sidebar «Импорт» active.
- **Screenshot pane** x 248–704 (456, 1px right rule, padding 24): 12 muted «Скриншот 1 из 1 · 2 фрагмента» +
  right tertiary «Другой скриншот» → D-Import-Drop.dc.html; the screenshot fills the pane width: 408 wide
  white rect (1px rule, radius 6, `role="img"`, aria «Скриншот переписки», cursor zoom-in → 720 dialog at 100%,
  described). Bubbles (grey `#e8e8e4` / white bordered, 13px): «t'es trop relou toi», «la go elle veut
  chiller», «ça craint grave», «on se fait une bouffe ?», «wesh», «ta reum a dit que…», «j'ai plus de thune».
  The current row's fragment is scrolled into view; the image is cut by the frame.
- **Rows pane** x 705–1440, padding 32, inner 671. h1 «Найдено 9 слов» + right tertiary «Выбрать все» `⌘A`.
  Header 32 (ink rule): mono 11 «Отмечено 5 из 9». Columns: checkbox 32 · FR 200 · RU 190 · Уровень 110 ·
  Тема 139. Rows 52:
  1 ☑ relou — достающий, надоедливый — fam. · verl. — Эмоции; 2 ☑ la go — девушка — fam. — Люди;
  3 ☑ chiller — отдыхать, расслабляться — fam. — Тусовка (CURRENT: white + 2px ink bar);
  4 ☑ ça craint — отстой — fam. — Эмоции; 5 ☑ la bouffe — *жратва, еда* (italic) + mono tag `ДОГАДКА` — fam. —
  Еда; 6 ☐ la reum — мать? — fam. · verl. — warn row (bg `#fbf3df`, 1px dashed `#c99a2e`, radius 4, 76px):
  alert + 13 `#8a5a00` «Перевод под вопросом» (issue text comes from recognition; this is the default) +
  tertiary «Проверить»; 7 ☐ la thune — бабки — greyed + mono tag `УЖЕ ЕСТЬ` + «Деньги»; 8 ☐ wesh — привет,
  здорово — fam. — Повседневное; 9 ☐ grave — очень, жёстко — fam. — Повседневное. «Тема» cell = 13px button
  «Эмоции ▾» (menu in folder order).
- **Bottom bar** 64 (1px top rule, paper): «Тема для всех ▾» text button; 12 muted «Скриншот не сохраняется —
  только слова.»; right «Добавить 5 слов» primary 40 + `⌘↵` → D-Library.dc.html (disabled «Ничего не отмечено»
  when 0). Flat hint above it: «J K по строкам · X отметить · ↵ исправить».

### 20. D-Settings.dc.html
Red marks: bar, Входящие = 2.
- Sidebar «Настройки» active. Content padding 48 (x 296). y 40 h1 «Настройки».
- **Section nav** x 296, 176 wide, from y 112, items 32 14px: «Повторение» (active: 600 + 2px INK bar),
  «Оформление», «Подсказки», «Клавиши», «Данные».
- **Form** x 520, 640. Sections: Plex 500 13 heading + 1px ink rule, 24px between sections; rows 44 hairlines.
  - Повторение: «Направление по умолчанию» → select «FR → RU ▾» (popover 2 rows 44: mono `FR → RU` + 13 muted «с
    французского на русский» (checked), `RU → FR` + «с русского на французский»); «Новых карточек в день» →
    stepper (− mono 15 +, 32 buttons, 1px `#8a8a85`, aria «Меньше»/«Больше»; replaced 2026-10-24 by the row
    «План повторения ›», §8 «План дня»); «Кнопки оценки» → text options
    2 | 3 (3 selected); option row ☑ «Свайпы для оценки» (on: a mouse drags the card too: click and hold, then sideways past
    min(⅓ card, 200px) or a flick; a vertical drag still selects text; a short drag springs back, a click flips;
    «Вибрация при свайпах» hidden on desktop).
  - Упражнения (added 2026-10-23, after Повторение; not drawn on the board): «Чаще в упражнениях» option rows with
    a round radio mark, «Сколько в наборе» 3-stop slider, 12 muted footnote — see §8 «Чаще в упражнениях».
  - Оформление: «Тема» → text options Система | Светлая | Тёмная.
  - Подсказки: ☑ «Автоподсказки при вводе»; ☑ «Раскладывать по темам автоматически»; 12 muted «Слова и
    скриншоты отправляются в Anthropic (Claude) для подсказок и не хранятся там.»
  - Клавиши (новое): ☑ «Однобуквенные сочетания» + caption «N, /, J, K, X, M и другие. Выключите, если мешают
    экранному диктору.» drawn with KEYBOARD FOCUS ring on the row; ☑ «Подсказки клавиш при повторении»;
    «Все клавиши» → secondary 32 + `?` → D-Shortcuts.dc.html.
  - Данные: «Синхронизация» («n.d…@pm.me · только что»), «Экспорт JSON», «Импорт JSON», «Импорт из старой
    версии (HTML)», «Выйти» (`#b3261e`, → D-Login.dc.html). **The frame cuts after «Все клавиши»**; Данные is
    reached by the section nav (described).

### 21. D-Login.dc.html — sign in (no sidebar)
Red marks: panel rule = 1.
- Paper. Column 400 centred (x 520). y 120: card glyph 14×20 + «Карточки для Лизи» Newsreader 500 40/44 (no tagline).
- y 232 index-card panel 400 (white, 1px rule, radius 6): header 40 mono 11 «ВХОД» + 2px red rule; body padding
  24: «Почта» 12 + input 44 (placeholder «you@example.com») value «n.drobyshevski@pm.me»; 16px; «Пароль» + input
  44 FOCUSED «••••••••••» + eye button (aria «Показать пароль»); 20px; «Войти» primary 44 full width →
  D-Review-Question.dc.html; 8px; one 32px row: «Забыли пароль?» tertiary left, «Создать аккаунт» tertiary right.
- Under the panel 12 muted: «Вход по паролю работает и в приложении на главном экране iPhone.»
- Described (same panel): error line 13 `#b3261e` under the password «Неверная почта или пароль.»; «НОВЫЙ
  АККАУНТ» — «Почта», «Пароль (от N символов)», «Повторите пароль», primary «Создать аккаунт»; «СБРОС ПАРОЛЯ» —
  «Почта», primary «Отправить ссылку»; «ВХОД НЕ НУЖЕН» — «Синхронизация выключена: все слова и прогресс хранятся
  только на этом устройстве.»; /auth/reset «НОВЫЙ ПАРОЛЬ»; offline page with Newsreader italic «hors ligne».

### 22. D-Library-Medium.dc.html — 1024×768, rail + list + context menu
Red marks: rail bar, Входящие rail count, «Удалить слово» = 3.
- Rail (§2), «Библиотека» active.
- Content x 72–1024 (padding 24, inner 904 < 960 → no «Тема»): h1 «Библиотека»; subline «158 слов · 23 к
  повторению» + «7 слов без темы · Разложить по темам»; toolbar: text filter «Тема: все ▾», search 240 + `/`,
  strip Все / К повторению 23 / Трудные 9 / Сленг ▾.
- Table: select 32 · Слово 1fr (324) · Перевод 1fr (324) · Уровень 112 · Показ 120 (= 912). Sorted «Слово ▲»
  from the top: une blague … rows to the frame bottom (cut at a row boundary).
- **Context menu** (right-click) on la galère: row in hover state; menu 240 at the pointer: «Открыть карточку»
  `↵` (highlighted `#f4f4f1`) · «Переместить в тему…» `M` · separator · «Удалить слово» (`#b3261e`) `⌘⌫`.
  Draw the pointer.
- Described: ↵ / «Открыть карточку» slides the 400 overlay panel in (non-modal); `Esc` closes it and returns
  focus to the row. 768–899: panel 360. 820×1180 portrait (iPad): same as this board, panel 360, rows 48 coarse.

### 23. D-Library-Touch.dc.html — 1180×820, coarse pointer (iPad landscape / touch laptop)
Red marks: rail bar, rail Входящие, detail card rule, «Удалить слово» = 4.
- Rail 72; list x 72–780 (708, padding 24, inner 660 → no «Тема», «Уровень» abbr only); detail 400 docked
  x 780–1180 (≥ 1100 rule). Coarse variant (§3): checkbox gutter 40 always visible; rows 48; Показ 152 = text +
  persistent `⋯` 32×32. Header/toolbar as D-Library-Medium; table header y 160, rows from 192 (13 visible).
- Columns: checkbox 40 · Слово 1fr (202) · Перевод 1fr (202) · Уровень 64 (abbr) · Показ 152.
- Rows sorted «Слово ▲» from the top; current row la thune is below the cut — current = la galère instead,
  its `⋯` pressed and the row menu open under it (items 44px): «Открыть карточку» · «Переместить в тему…» ·
  separator · «Удалить слово» (`#b3261e`). No pointer. Detail pane shows la galère («FR · № 012», fam., «засада,
  мучение», tracings in the card footer «1. Повседневное  2. fam.»).
- Caption under the frame title only (canvas note): «Long-press 500 мс открывает то же меню».

### 24. D-Review-Answer-Dark.dc.html — dark, long expression, RU → FR
Same structure as D-Review-Answer with dark tokens. Sidebar count `18`. Running head: chip `RU → FR`; «18 к
повторению · 2 новых»; «12 / 30», fill 40%. Card: «RU · № 018»; meter 2 + «fam.»; headword «se prendre la tête»
at **step 2 (44/64)** (longest of «загоняться, париться» 20 / «se prendre la tête» 18 → step 2); «loc.»;
«загоняться, париться»; note «Ne te prends pas la tête — не парься.»; example «Arrête de te prendre la tête pour
ça.» / «Хватит загоняться из-за этого.»; tracings «1. Эмоции   2. fam.». Intervals «10 мин» / «3 д» / «9 д».
«Знаю» in hover state (2px `#5cc58f`) — the one hover demo of grade buttons.

### 25. D-Library-Dark.dc.html
Identical content and states to D-Library, dark tokens (bg `#121212`, sidebar `#121212`, detail card `#1b1b1a`,
current row `#242422` + `#ececea` bar, red `#ff6a52`, theme squares keep their inks with a 1px inset ring
`rgba(236,236,234,.24)` (outline, offset −1px), unfilled meter segments `#44443f`, root `color-scheme: dark`).

---

## 6. Canvas format rules for desktop boards

Same skeleton as SPEC.md, with a desktop root. Exact skeleton:
```html
<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Десктоп · Повторение · вопрос</title>
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
button{font:inherit}
input,textarea{font:inherit}
::placeholder{color:#5a5a57;opacity:1}
</style>
</helmet>
<div style="width: 1440px; height: 800px; box-sizing: border-box; position: relative; overflow: hidden; background: #f1f1ee; color: #111111; font-family: 'IBM Plex Sans', system-ui, sans-serif; font-size: 14px">
  ... sidebar (absolute) + content (absolute, left 248px) ...
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1440,"height":800}}'>
class Component extends DCLogic {
renderVals() { return {}; }
}
</script>
</body>
</html>
```
- The root is FIXED at the board size (1440×800; 1024×768 for D-Library-Medium; 1180×820 for D-Library-Touch,
  with matching `$preview`), `overflow: hidden`, `position: relative`. Shell regions absolute (sidebar
  `left:0;width:248px`, content `left:248px;right:0`; rail 72), flex/grid inside. Scrolling content is cut by
  the frame at a row boundary.
- Dark boards: root bg `#121212`, text `#ececea`; helmet `a{color:#ececea}a:hover{color:#ff6a52}` and
  `::placeholder{color:#a3a39e}`.
- Keep `<script src="./support.js"></script>` EXACTLY. Close every non-void element, quote every attribute,
  `&` in attribute URLs → `&amp;`.
- Styling: inline `style="…"` for everything design-specific. `<helmet><style>` holds ONLY the basics above —
  no class rules, no `:hover` rules (hover/focus are drawn as static states where this spec says so).
- Flex/grid + `gap`. Grids: `repeat(N, minmax(0, 1fr))`, `minmax(160px, 1fr)` or explicit px tracks.
- `{{hole}}` is a dotted lookup into `renderVals()` only. Prefer literal markup; `<sc-for>` only for uniform rows.
- Always include the `data-dc-script` block with `class Component extends DCLogic`. Classic JS, no imports,
  no innerHTML/appendChild, no global keydown handlers (keys are documented, not wired).
- Links between boards: style the `<a href="D-….dc.html">` itself; never a `<button>` inside an `<a>`.
  Non-navigating controls are `<button type="button">`; fields are real `<input>`/`<textarea>` with `<label>`
  or `aria-label`. Icon-only buttons need `aria-label`; decorative SVG `aria-hidden="true"`; key caps inside a
  labelled control `aria-hidden="true"` with `aria-keyshortcuts` on the control. Dialogs: `role="dialog"
  aria-modal="true" aria-labelledby` the title. Every link target named in §5 must exist in the board set.
- NEVER emoji. No gradients, no `box-shadow` at all, no left-border accent cards, no pills (radius ≤ 8: chips
  4, buttons 6, cards 6, dialogs 8, caps 3), no lorem ipsum, no «ИИ»/«AI», no sparkles, no fake browser/OS chrome.
- Use the sample data exactly as given here and in SPEC.md. Russian UI copy exactly as written above.
- Targets: ≥ 32px for pointer controls (grade buttons 56, primaries ≥ 36), ≥ 44 on the Touch board; text
  contrast ≥ 4.5:1; interactive boundaries ≥ 3:1 (`#8a8a85`).
- Count the red marks on each board against the number given in its section.
- Keep markup lean; one board per file.

Quality bar: pixel-careful on an 8px grid (4px inside controls), exact px from this spec, nothing overlapping
unintentionally, no text clipped mid-word inside fixed boxes, everything inside the frame.

---

## 7. Decisions (critique items skipped or changed, with reasons)

1. **Toggles → checkboxes everywhere** (incl. sort plan, theme «Закрепить тему», settings). The completeness
   note asked for the 36×20 toggle everywhere; the aesthetic note asked for one binary control. One control
   wins; it also removes the off-toggle contrast problem, so the toggle-track token fix is dropped.
2. **Status dot shape coding skipped**: the dot column is removed (red-budget fix); status is text («трудн.» in
   Показ, full status in the detail pane and the row's aria-label), so colour-only encoding is gone.
3. **Synonym cross-refs «➙ le fric, l'oseille» skipped**: the note is free text in the data model; parsing it
   would invent structure. The note is shown as prose. Tracings carry theme + level (+ verl.) only, no «син.».
4. **«Со скриншота · Списком» chrome copy skipped**: real labels «Скриншот» / «Список» kept, but as plain text
   links without icons.
5. **Detail `⋯` removed** rather than filled: every action is already in the pane.
6. **Context-menu «Уровень сленга ›» / «Сбросить прогресс» and bulk «Уровень сленга…» / «Сбросить прогресс»
   dropped**: real row menu labels only; bulk = move + delete.
7. **Expanded threshold kept at 1200** (not moved to 1280): fluid columns + the abbr-only Уровень rule fit 544.
8. **la thune Показ**: kept «через 4 д» and changed the RU → FR detail row to «через 5 д».
9. **«Повторение» pinned at y 432 superseded**: the detail card was re-laid as an entry; every block now has an
   explicit y (344 / 456 / 636 / 676 / 760).
10. **Boards are 1440×800**, not 900 (real viewport); all y-values were re-derived.
11. **«Знаю» → D-Session-Done** is a prototype shortcut; progress stays «07 / 30» so boards 1–2 match.
12. **820×1180 portrait not drawn**: D-Library-Touch (1180×820) covers coarse pointer + the ≥1100 docked
    pane; portrait is described under board 22.
13. **«ВХОД» / «НОВЫЙ АККАУНТ» stay mono uppercase**: they are the real mode headers, treated as tags.
14. **Theme subline «3 к повторению» is ink, not red** on desktop, to hold the 4-red budget (red on mobile).
15. **«Повторить тему» count is «5»** (the app's card count `meta.cards`), not the «21» in one note.
16. **Hover tooltip demo moved to D-Library-Edit as a keyboard-focus tooltip** (no pointer there); pointers only
    on D-Library-Bulk and D-Library-Medium.
17. **Bare `⌫` never deletes**; `Delete` / `⌘⌫` only (simpler than "only when one non-selected row").
18. **Pane edit**: leaving a dirty row autosaves (with undo); Esc discards with «Вернуть» — no confirm.
19. **Add dialog keeps one top (40) across its sub-states** (Empty, Suggest, Form, List), so the headword field
    does not jump on the first keystroke. **Search-state footers stay 48** (Empty, Suggest: key line + one 32px
    link); form-state footers are 64 (40px buttons). Suggest at 64 would overflow the 720 max-height once the
    16 / 16 / 16 gaps are in, so the 48 is kept rather than cutting the loading row.
20. **Add-form key line is «Tab дальше · Esc к поиску»** (not «Tab следующее поле»): with the duplicate guard's
    «Добавить всё равно» the longer line pushed the primary 15px past the footer edge.
21. **Suggest: no `→` «Подставить» key** (critique asked for one): it would be a new binding outside §4; ↵ on a
    «Словарь» option already fills the input, the arrow button is a pointer duplicate (`tabindex="-1"`).
22. **D-Library-Touch toolbar: search 208, group gaps 20** (not Medium's 240 / 24): 240 / 24 needs ~694px, the
    inner width is 660. The field is drawn 36 tall like Medium inside a 44-tall `<label>` hit area, so the toolbar row
    looks the same. Touch hit areas without visual change: row checkbox gutter 64×48 (extends into the pane padding),
    «Выбрать все» 64×40, inline «Разложить по темам» / «Отменить» 44 tall, rail «Добавить» 44×44 around the 40 box.
23. **Touch detail card keeps the tracings footer** (§5 #23 asks for it); its grammar line is POS only («n. f.»),
    as on the review card, so the level is not printed three times. D-Library / Dark / Edit / Refresh stay without
    tracings (grammar line «n. f. · arg.»).
24. **Dark current row `#242422`** (was `#1b1b1a`, fainter than the `#222220` hover). Dark theme squares get a 1px
    inset ring `rgba(236,236,234,.24)` and dark unfilled meter segments are `#44443f` (were 1.48:1) — applied on
    D-Library-Dark; other dark boards should match.

## 8. Phone parity (added 2026-10-22, after a phone → desktop feature audit)

Everything phones can do, desktop can do too. Where the boards above differ, this section wins.
- **«Готово на сегодня» keeps the running head** (supersedes «No running head» in §5 #4): direction chip,
  «Что повторять» (with «Мои наборы»), undo and «?»; no counts or progress fill.
- **Help hints**: every dictionary abbreviation that explains itself on phones (`AbbrHint`: part of speech, slang
  level, «verl.») does so on desktop too, and with a mouse it opens on hover after 250 ms (a click pins it;
  Esc / a click outside closes). Shown in the detail pane's grammar line and header meter, the coarse tracings,
  the review card's tracings, and next to «Французский» in the add form. Icon-only buttons name themselves in
  a hover tooltip (`IconButton` sets `title`); keyed ones add the key («Изменить карточку (E)» only while
  single-letter keys are on). The review hint line adds «E изменить» on the answer side.
- **Library filter strip**: «Все · К повторению N · Трудные N · Новые N · Сленг ▾ · Уровень языка ▾ · ⇅»
  («Уровень языка ▾» added 2026-10-24, see «Уровень языка» below). «Новые» = never
  reviewed. ⇅ is a 36px icon button (tooltip and name «Порядок: …») opening a menu with the phone's orders —
  «Сначала новые», «По следующему показу», «По алфавиту», «Сначала трудные», «По уровню языка»; a column head click still sorts by
  that column (the tooltip then names it, e.g. «По переводу»). The search is 220–300px wide; a list too narrow
  for search + strip puts the strip on a second row.
- **Theme actions from the sidebar**: a right click, a long press or the menu key on a sidebar theme opens the
  theme menu with «Открыть тему» and «Повторить тему N» on top (same items as the theme page's «⋯»).
- **Medium (rail)**: the «Тема:» menu ends with «Новая тема…».
- **Theme / «Входящие» header**: with nothing to review, «Повторить тему N» becomes the secondary «Тренировка всей
  темы N» (as on phones), so «Входящие» can be practised too. An empty «Входящие» offers «Добавить слово».
- **Add dialog**: the headword has «Стереть» (×); the back arrow and Esc step back from «Несколько слов» to the
  search (the pasted text stays); «Скриншот · Список» stay in the chrome while the form is open; the duplicate
  notice also shows above the quick form; «Несколько слов» rows show the example found, after the translation.
- **Import review**: rows show the example after the translation, as on phones.
- **Упражнения** (added 2026-10-23; boards D-Exercise-List, D-Exercise-Player, D-Exercise-Done): the same sets,
  runs and screens as on phones, from the sidebar item «Упражнения» (§2) or `G E`. The list is the phone's tiles
  three to a row, with the phone's request sheet as the right column «Новый набор». The player keeps the
  phone's picks: options in the same 2×2 grid (64px tiles, Kbd caps 1–4), a tap / key answers at once, the
  «ВЕРНО» / «НЕВЕРНО» stamp on the card (on the `surface` token), one result line under the grid (the answer,
  `explain_ru`, «Слово ›» → the word in Библиотека, «Дальше ↵», which every answer waits for,
  right ones too; §4 «Упражнения»). The done screen has the phone's receipt, «Ошибки»,
  «Новые слова» with checkboxes and undo, and its three actions. Контекст keeps its own sidebar item, rail item
  and `G C` on desktop; only phones moved it into Библиотека.
- **«Чаще в упражнениях»** (added 2026-10-23; SPEC.md «Упражнения», board `Exercise-S-Settings-Focus`): Settings
  section «Упражнения» after «Повторение» (nav entry `set-exercises`, scroll-spy as the others). The label row
  «Чаще в упражнениях», then the four choices as option rows like `CheckboxRow` (whole row the hit area, hover fill,
  focus ring on the row) with a 14px round radio mark instead of the box — four labels of unequal length do not fit
  text options beside the label in 640. «Сколько в наборе» keeps the phone's 3-stop slider (a 320px radiogroup at
  the right of its row, ←/→ move), disabled with «Обычно»; the 12 muted footnote is the phone's. The «Новый набор»
  panel shows the same muted line «Чаще трудные · половина набора · Настройки ›» under «Запрос».
- **«Упражнение по трудным словам»** (added 2026-10-23; SPEC.md «Упражнения», boards `Exercise-S-Request-Scope`,
  `Exercise-S-Quick-Tiles`, `Exercise-S-Entry-Library-Done`): the «Новый набор» panel has the phone's «Откуда слова»
  radiogroup on top (←/→ move; a scope with no words is disabled) and hides the themes, «+ своя тема» and «Можно новые
  слова» the same way. The list grid carries the two dashed tiles «Трудные слова» / «К повторению» before «+ Попросить
  набор». In Библиотека (all words) a right click, a long press or the menu key on «К повторению N» / «Трудные N» of the
  filter strip opens a menu «Показать в библиотеке» / «Упражнение по ним в Claude»; a click stays the filter. «Готово на
  сегодня» shows the row «Упражнение по трудным словам · N ›» under «Трудные». Copies end in the snackbar «Запрос
  скопирован» with «Открыть Claude ↗».
- **«План дня»** (added 2026-10-24; SPEC.md «План дня и уровень языка», picks R22 D1 C, D2 A+B, D3 B, D4 A;
  boards `D-Review-Settings`, `D-Review-Plan`): the same plan, numbers and copy as on phones.
  - **Settings sub-page**: in Settings «Повторение» the stepper «Новых карточек в день» becomes the button row
    «План повторения» with the summary (13 muted «10 слов в день · до 200 повторений») and a chevron. The section
    nav gets the indented item «План повторения» under «Повторение» (13px, padding-left 28, `aria-current` on its
    page). The page sits in the 640 form column: a back link «‹ Повторение» (13 500 muted), h2 Newsreader 24 «План
    повторения» with the summary at its right, then three sections (Plex 500 13 heading + 1px ink rule):
    - «Темп»: «Новых слов в день» and «Повторений в день» («до» + stepper) with the phone's captions; the second
      reads «Остальные — на следующий день, расписание не меняется».
    - «Новые слова»: «Порядок новых» as option rows like «Чаще в упражнениях» (round radio mark, caption in 12
      muted lowercase: «сначала A1–B2, частые раньше», «01 → 35, по порядку тем», «старые сначала»), then «Новые в
      сессии» with text options «Вперемешку с повторением | После повторения».
    - «Обратная сторона · RU → FR»: «Когда показывать» with the same option rows «После 3 дней узнавания» /
      «Назавтра» / «Только узнавание».
    - The footnote «Настройка общая для всех устройств — Claude тоже её видит.» (13 muted, sync glyph).
  - **Plan popover**: in the running head the summary «27 к повторению · 4 новых · 6 обратных» is a 30px text
    button (hover and open: `#e8e8e4` fill, radius 4; `aria-haspopup="dialog"`, aria «План на сегодня: …»). It
    opens a 360px popover under it (white, 1px ink border, radius 6, no shadow; §3 menu motion): a 52px title row
    «План на сегодня» Newsreader 20 with × (32px, Esc) over an ink rule; the phone's receipt as 40px rows (label 14,
    mono right); the reason line; the secondary «Всё равно добавить новые» with «Только на сегодня. Завтра план
    снова подстроится.» (same rule as phones: only while the day's new words are below the ceiling); and the row
    «Изменить план ›» with mono «10 слов · до 200» → the settings sub-page. While it is open the hint line ends
    with «Esc закрыть план» and the review keys are off. The reason subline (D2 A; not drawn) sits under the running-head
    rule, left-aligned with the card column, 12 muted sentence case («Новых 4 из 10 · точность за неделю 74 %»),
    only while new words are held back.
  - **Session**: new cards carry the outlined «НОВОЕ» tag at the right of the card header (question side), and the
    new-card ticks sit under the running-head rule (not drawn). The wait screen is the phone's in the 720 column («Ещё 3
    карточки — через 12 мин», the rows, «Упражнения ›», «Готово на сегодня»). «Готово на сегодня» keeps «22 октября
    · Следующие 18 слов — завтра» and adds the row «План: 10 слов в день · до 200 повторений · Изменить ›» under it.
- **«Уровень языка»** (added 2026-10-24; SPEC.md «План дня и уровень языка», picks R23 D5 A, D6 A, D7 C; boards
  `D-Level-Library`, `D-Level-Word`): the same levels, «≈» rule and source captions as on phones.
  - **Library column «Ур.»**: 44px between «Перевод» and «Сленг» (§2), mono 12 «≈B1» (estimate muted, the user's
    ink 500, «—» muted with no level). The column head sorts («Ур. ▲» = A1 → C2, no level last; the tooltip «По
    уровню языка»), and so does ⇅ «По уровню языка». Sorted by level, the header's right end shows 13 muted «A1 →
    C2 · без уровня в конце» where the guide words go. The slang column and its strip item are «Сленг», and the
    «Сленг ▾» popover is titled «Сленг» (was «Уровень сленга»). The row `aria-label` adds the level («…, ≈B1,
    учится» / «…, без уровня, …»).
  - **Strip filter «Уровень языка ▾»**: after «Сленг ▾». It opens a 280px popover like «Сленг ▾»: Plex 500 13
    «Уровень языка» + the tertiary «Сбросить»; toggle chips A1 … C2 with mono counts and a dashed «без уровня»
    (aria «A1, 142»); under them 12 muted «≈ — оценка по словарю FLELex, точна примерно в половине случаев.». The
    item then reads «Уровень языка: B1, B2» (or «Уровень языка: 2» when it does not fit). No level counts
    elsewhere (D7 C).
  - **Word pane**: the index card header shows mono «≈B1» at the right, after the slang meter. Under the card, a
    section «Уровень языка» (Plex 500 13 heading, the source caption 12 muted at its right — «по словарю FLELex» /
    «по частотности» / «от Claude» — and an ink rule) holds mono «≈B1», the hint «≈ B1 — оценка по словарю FLELex,
    точна примерно в половине случаев.» and the tertiary «Изменить». For the user's level it reads «B1 · вы
    указали · Изменить», with no hint. «Изменить» (`aria-expanded`) opens, in place, a radiogroup «Уровень
    языка» of text options A1 A2 B1 B2 C1 C2 · Авто (←/→ move). «Авто» is checked while there is no level of the
    user's; the estimate's option has a dotted underline and the aria «B1, сейчас оценка». Under it the caption
    «подобрано автоматически · «Авто» вернёт оценку». A pick saves like the pane's other fields (Esc cancels, ⌘↵
    saves; leaving the word saves it, «Сохранено · Отменить»). The «Повторение» row of an RU→FR card still
    waiting reads «откроется после 3 дней узнавания».
  - **Review card**: the answer side's header adds «· ≈B1» after the slang abbreviation; the question side never
    shows it.
  - **«Определить уровень языка»** (not drawn): the phone's quiet row and plan sheet («Уровень языка для 98 слов»), as a 760
    dialog like «Предлагаемые перемещения», with the footer «Отмена Esc» / «Сохранить уровни 90 ⌘↵».
- **«Прогресс»** (added 2026-10-25; SPEC.md «Прогресс», picks R31 D1 A, D2 A; board `D-Progress-A`): the same
  saved days, numbers, streak rule and copy as on phones, from the sidebar and rail item «Прогресс» or `G P`;
  the layout is §10. Differences from the phone: two calendar months instead of one, the selected day in a
  pane instead of in place, mistakes open the word in Библиотека instead of the word sheet, and no slang meter
  on mistake rows.
- «Вибрация при свайпах» stays phone-only (§5 #20); the offline page is 560px wide from 768 and says
  «…не сохранена на устройстве».

## 9. Свои поля (added 2026-10-22; see SPEC.md «Свои поля» for the feature)

- **Settings**: section «Свои поля» after «ИИ» (nav entry `set-fields`, scroll-spy as the others). Rows of 44+:
  name 15 in a 180px column, the hint 13 muted (or «Без подсказки»), «АВТО» mono 11; the row is one button
  (hover fill) opening the dialog; at its right two 32px ghost icon buttons ↑ «Поднять поле «X»» / ↓ «Опустить
  поле «X»» (disabled at the ends). «+ Добавить поле» is a `DeskButtonRow`; the footnote is 12 muted.
- **Field dialog** (480 wide, `DialogChrome` label «Свои поля», title «Новое поле» / «Изменить поле»): «Название»
  (focused), «Что писать», the checkbox row «Заполнять автоматически» with its caption, «Удалить поле» (14, again,
  trash glyph) with the caption, footer «Отмена Esc» / «Сохранить ⌘↵». Reordering lives on the rows, not here.
- **Review card**: the same block as phones after the examples, inside the card's scroller («ещё ↓» when clipped).
- **Library pane**: «Свои поля» after the examples inside the index card (hairline above): rows with a 100px
  name column, «Добавить» for empty shared fields, «+ Поле», the pencil; the editor uses the pane inputs and
  the usual footer (Esc / ⌘↵; leaving the word with unsaved changes saves them, «Сохранено · Отменить»). While
  the entry is edited the card shows the filled fields read-only. The footer wraps when the pane is narrow.
- **Add dialog**: a small disclosure «Свои поля · Синонимы, Род ⌄» under «Пример» opens the inputs two to a
  row (name as the 12px label, hint as placeholder).

## 10. Прогресс (added 2026-10-25; see SPEC.md «Прогресс» for the feature, the numbers and the streak rule)

Built from `D-Progress-A` «Ведомость» (`components/progress/ProgressDesk.tsx`, from 768; phones keep
`ProgressScreen`). Not `D-Progress-B` (the curve), not `D-Progress-C` (month sheets with themes).
- **Shell**: the sidebar item «Прогресс» (no count) right after «Библиотека». The rail item has the chart
  glyph at the same place. `/progress` is its own nav key, so «Прогресс» is the active item. `G P` and the
  «Клавиши» row «Прогресс `G` затем `P`».
- **Header**: h1 «Прогресс» with the one mono streak line at its right (the phone's line and accessible name).
  Under it the Plex 13 tabular subline «412 знаю · 350 учу · 500 новых · на паузе 56 · помню ≈ 640 · 88 % верно»
  (a part at 0 is left out), then one muted line explaining «знаю» and «помню ≈» (the phone's fold text).
- **Period**: the text filter «Месяц · 3 месяца · Год · Всё», its dates at the right.
- **Ledger**: the phone's four rows (Помню ≈ / Повторений в день / Новых в день / Верно) at full width. The
  sparklines fill the column and are 32px tall, with dashed average / target lines. Today's point is ink, not
  red. The selected day is a thin vertical line with a hollow dot on each sparkline.
- **Calendar**: last month and this month side by side, ink squares sized by the day's reviews, a 12px muted
  outlined square for a day without study, today framed 1.5px red; the selected day is a 1px ink frame on white. The legend sits under the grids. The header carries only «7 из
  7 на этой неделе» (Plex, not mono: the streak is said once, by the title). Studied days are buttons; picking a
  day further back moves the calendar to its month.
- **Day pane**: 400px at the right from 1100 (360 at 1200–1439, as the library's detail pane); below 1100 it
  follows the calendar in the one column. It opens on today once studied, else on the last study day. ‹ ›
  and ← → step through study days. An index card «Среда, 21 октября» (red header rule) with the receipt
  «Повторено 104 · Новых 12 · Верно 92 % · Знаю 398», plus «Упражнений N» when the day had one and a quiet line
  for a day without study. Then «Ошибки»: FR — RU rows without the slang meter; a row opens
  `/library?word=<id>`.
- **Empty**: the phone's blank card with «К повторению ›».
- **Not built**: the save-status footer (saving stays silent, as on phones) and «Весь день ›» (the pane already
  holds the whole day and scrolls).
- **Red**: at most 3. The active sidebar bar, the day card's header rule and today's outline (ink once today
  is the selected day).
