# Mobile declutter: cross-screen review

I only read files for this review and changed nothing. I checked a few claims against the code:
- `--again #b3261e` and the brand red `#c8331f` are both in `app/globals.css`.
- `ViewTransition` is already used in `components/library/NavSlide.tsx`.
- `node_modules/next/dist/docs` does not exist.

## 1. Principles every recommended direction shares

1. **Each fact appears once, where you act on it.** The due count lives on the button that starts the review: «Повторить тему 3», the theme footer, and the ▪ marks in the subline. The total lives on «Все слова». The day's numbers live only in «План на сегодня». The counts «2 НОВЫХ», «12 ВОПРОСОВ», «ОТМЕЧЕНО 5 ИЗ 9», «НАЙДЕНО» and the meta-date are removed wherever they are a second copy.
2. **At most one mono `.meta` line per region at first paint.** Secondary facts become italic `.abbr` text, sit behind a tap, or go into the aria-label. This is the Shell «Tokens A» rule, and every group's trims already apply it.
3. **Explanation lives at the entry point or in first-run hints, not on every visit.** Captions, helper paragraphs, the swipe legend, «не влияет на расписание», the «почему позже?» paragraph and the connector notes move into a first-sessions counter, the aria text, or Settings.
4. **No daily path gets longer.** This is the veto rule. Rare or destructive actions (pause, delete, disband, reset, data, sign-out, re-sort) move behind one «⋯», a sub-screen or an «Ещё» row. Direction, theme, grading, adding a word and search stay at the same tap count.
5. **One level of disclosure, opened in place.** «Ещё ↓», «Почему позже?», «Текст запроса ›» and the word sheet's «Ещё» all expand with `Collapse`. None of them opens a second stacked sheet.
6. **A number becomes an object only if the exact value stays one tap away and in the accessible name.** This covers the deck edges, tick rows, tally and ticket strips, the return timeline, the day strip and the level-chip rules.
7. **"Visual" means the brand's own objects, with no new decoration.** That is the index card (including a blank card as the empty state), hairline card edges for quantity, ink lines for progress, and the stamp. Everything is drawn with 1px rules: no shadows, gradients, pills or illustrations.
8. **Motion only on real events, once, and at most one new moving thing per screen.** Lines draw to their true value, the ink underline draws once, and the spotlight marks where something landed. The stamp stays reserved for grading and for «Готово на сегодня».
9. **Finished scaffolding leaves the screen.** The import steps and bar, the sort-plan steps, the finished ShotSummary, the «Отложено 0» row and the full receipt all collapse once their job is done.
10. **Empty and neutral states render nothing.** No neutral slang meter, no zero counts, no empty «МОИ НАБОРЫ», no disabled «Добавить», no «Нет заметки».

## 2. Where the groups disagree, and how to resolve it

| # | Conflict | Resolution |
|---|---|---|
| 1 | **Tab bar during review.** Review recommends B, which keeps the bar and rejects C because «Начать» adds a tap and the tabs disappear. Shell recommends B, which hides the bar in-session and assumes an idle «Начать» screen. Shell's InstallHint B also assumes that idle screen exists. | Review owns this screen, and principle 4 applies, so **keep the bar for v1**. Drop Shell B's «Начать» dependency. Move the InstallHint slip to the empty space under the deck on the **Session-Done** or wait screen. Hiding the bar is a user decision (§4, D1). The `hideTabBar(reason)` store can still be built for the cases that already hide it. |
| 2 | **Deck-edge rule.** Review B shows 3 edges for 10+ cards, 2 for 2–9, 1 for the last, at 4px offsets. Shell motion A shows min(3, remaining) edges at 3–4px and starts fading only below 3. Exercises explicitly rejected decks as progress (Player C, List C). | Use one rule in `CardDeck`: **3 / 2 / 1 by Review's thresholds, 4px offset**, and fade the deepest edge with `--dur-quick` when a threshold is crossed. Decks belong to Review only. Exercises use ticks. |
| 3 | **Progress counter.** Review B keeps «07 / 30». Shell motion A hides «04 / 11» behind a tap. Exercises B replaces the counter with ticks. | **Review keeps line + counter**, because ticks don't scale to 200 cards. **Exercises use ticks**, since 8–16 items fit. Drop Shell A's counter removal. |
| 4 | **Four progress and result vocabularies.** Session-Done uses an 8×14 tally with red outlines and notched cells. Exercise Done uses a 10×10 ticket with red outlines. The exercise player uses 3px ticks with red for the current item. Shell's alternative B uses ledger ticks on the line. | Build **one `SessionStrip` component** with three sizes: ticks for the player header and resume card, cells for both Done screens. Use one colour code: ink = first try, `--again` outline = miss, hollow = requeued. Mark the **current** tick with ink at a taller height, not red, so red keeps its attention meaning. |
| 5 | **Red ink spreading.** Red now appears in: the held-day under-stroke, the example underline, the library due ▪, the search-match underline, Context's selected translation, the exercise current tick, miss outlines, the Входящие count and Review's left edge mark. On top of that, `--again #b3261e` and brand red `#c8331f` look the same. | Fix the meanings. **Brand red** = "needs you / this is the word" (due ▪, Входящие, the word's underline, the card's top rule, the tab marker). **`--again`** = a past miss, and always paired with a shape cue (outline, not fill). Drop the red held-day under-stroke (the plan sheet's empty slots say it) and the red current tick. This is decision D4 in §4. |
| 6 | **Dashed lines carry too many meanings.** Dashed already means: the Входящие row, the Library attention slot, the practice header rule (Review practice B), the empty-library card, the duplicate warning box, the context empty slip, and «+ новая тема». | Settle on **dashed = "not yet on record"**: empty, unsorted, practice, proposed. Warnings keep their amber tokens. Empty states use dashes in the rule colour. Write this into SPEC as one line. |
| 7 | **Input styles.** Add B uses a borderless ruled headword line, while Library search, the Context field and the FieldDef inputs stay boxed. | **Ruled line only for the headword in the add sheet** (writing on the card). Search fields stay boxed (finding, not writing). Write this into SPEC "Shape". |
| 8 | **Add sheet header.** Add B keeps «№ 159» as the only chrome and moves the tools into the empty body. Shell large-sheet A drops «№ 012» and folds the tools into a header «⋯». | Use **Add B's layout**: tools appear in the body only while the input is empty, and «№» stays, since it is the brand's catalogue charm and costs one mono glyph group. Shell's job reduces to building a slim `SheetHeader` slot and the deeper scrim token. |
| 9 | **The visible ✕ on sheets.** Shell sheet A makes ✕ screen-reader-only on auto-height sheets. Review's plan sheet, the FolderPicker, the Exercises request sheet and Library theme-menu boards all draw a ✕. | Adopt Shell A everywhere for auto-height sheets. Redraw the boards with a grabber and no ✕. Full sheets keep a visible ✕. |
| 10 | **Snackbar text.** Shell A uses verb + object only and removes success toasts. Library sort plan A moves the "7 days" hint *into* the snackbar. Settings FieldDef A moves a two-clause sentence into it. | Shell's policy wins. The undo window goes on the «Последняя раскладка — Отменить» upkeep row. The field-delete toast reads «Поле удалено · Отменить», and the note «значения остались» goes into the aria/live text. |
| 11 | **Slang meter as an input.** Add A5 B makes the meter the control (tap/drag bars). Library word-edit recommends B (keeps the segmented control) and rejects C, which was meter-as-input. | Use **one control in both places**. Pick meter-as-control only if it ships as `role=slider` with `aria-valuetext` and a visible word. Otherwise both keep the segmented control. Do not build two components. |
| 12 | **Motion budget at reveal.** Review answer B adds the headword glide plus a red underline draw. Shell slang B adds a segment fill on reveal. With the deck settle, that is 3–4 moving things in about 300ms, which breaks MOTION-SPEC §1.2 and the one-moving-element rule. | Allow **one reveal extra**, not both. Recommend the underline, because it carries meaning ("this is the word"). Show the meter static. |
| 13 | **Fold glyphs.** The groups use «ещё ↓», «Ещё ›», «Ещё ⌄» and «Изменить ›» for the same idea. | **⌄ = expands in place, › = navigates.** Use the label «Ещё · <what is inside>» everywhere. |
| 14 | **Headers.** Shell B uses large titles that collapse with a hairline draw. Context B puts the field in the header with no title. Library theme page B adds a 3px band plus the large title. Shell A puts the due count in the progress row, while Library puts it only in the footer. | Shell B is the default. **Context is a documented exception**: its field is the header. The theme page follows Library: the due count lives only in the footer. |
| 15 | **Shared-element morph.** Library recommends the drawer→theme morph "next". Shell rejects morphs, citing unverified view-transition support and the missing docs folder. | `ViewTransition` already ships in `NavSlide.tsx`, so the risk is lower than Shell states. Still, ship the drawer rows **without** the morph first, and add it as a separate step after a check on real iOS. |
| 16 | **«не влияет на расписание».** Theme menu B keeps it as a caption. Session-Done A removes it from «Ещё практика». Exercise Done B keeps a muted line. Review practice B uses aria plus a dashed rule. The exercise player removes it. | Say it **at the entry action** where there is room (the theme menu «Тренировка» caption, the set-start sheet). **During** practice the dashed rule shows it. **Done** screens don't repeat it. Exercise Done B drops its bottom line. |
| 17 | **Blank index card.** Review empty library B, Library no-match B, Context empty slip B and Add A1 B all draw a blank or ruled card. Shell tokens recommends A and defers `.card-blank`. | Build **`BlankCard` as a shared primitive** (the part of Shell tokens B worth keeping). Four groups depend on it. |
| 18 | **Headword size.** Review uses fit-to-width 48–60px. Exercises uses `clamp(40px, 13vw, 56px)`. | One token: `--prompt-fit: clamp(40px, 13vw, 56px)`, used by both. |

## 3. Brand-rule changes needing a yes/no

The user decides each of these; I recommend yes for 1–8.

1. **SPEC:276/138:** On phones, should the review header become one split chip «FR→RU ┊ Все темы ▾» plus undo, with the gear moving to the Library header? (Y/N)
2. **SPEC Review boards:** May phones show 1–3 hairline card edges under the review card, with no shadow, no rotation, and the deepest edge fading on threshold? (Y/N)
3. **MOTION-SPEC new primitive:** Add "ink underline drawn once": 1.5px, 200ms linear, left→right, reduced motion = shown at once. Brand red means "the word / the match"; `--good` means "correct" (pairs, right tile). (Y/N)
4. **SPEC:138:** Add a practice variant of the card's top rule: dashed 2px ink, with «FR · ПРАКТИКА» as the card label. (Y/N)
5. **SPEC:140/:352 + MOTION §5.12:** On both Done screens, replace the receipt rows with a session strip that writes in as 4 groups 40ms apart inside the existing beat. Numbers stay static. (Y/N)
6. **SPEC:103/:143:** Replace the Library theme tiles with ruled drawer rows: a 3×14 theme tick (explicitly *not* a left border), with the row's hairline acting as the mastery line. (Y/N)
7. **SPEC:301/:316/:332:** On the review answer side, put origin, custom fields, the second example, the note, ≈B1 and the theme behind «Ещё ⌄»; pause and delete go to the word sheet. (Y/N)
8. **SPEC Shape:** Make the add-sheet headword a ruled borderless line (2px ink on focus), as the only input styled this way. (Y/N)
9. **MOTION §5.16:** On the wait screen, a return timeline whose "now" tick steps once a minute. It is a minute swap drawn as position, not a progress bar. (Y/N)
10. **MOTION §5.16:** In «План на сегодня», a day strip where «Всё равно добавить новые» fills the empty slots with a 40ms stagger. (Y/N)
11. **MOTION §4.10:** Add a large-title collapse on sub-screens, with the header hairline drawn only while content scrolls under it. (Y/N)
12. **SPEC tab-bar rule / MOTION N5:** Hide the tab bar during an active review session. This is the same choice as D1 below; default N. (Y/N)

## 4. Visual decisions the user must make

**D1. Review screen: how "what's left" and focus look**
- (a) Trim only: line + counter, the card, the tab bar. The safest option.
- (b) **Deck** (recommended): split chip, line + counter, 1–3 card edges, edge marks, a prompt on ruled lines, the tab bar kept.
- (c) Focus session: (b) plus the tab bar and chips hidden in-session, which gives about 95px. It costs a tap whenever you switch tabs mid-session.

**D2. How results and progress are drawn across Review and Exercises**
- (a) Text: shortened receipts («9 из 12 с первого раза», 3 trimmed rows).
- (b) **One strip everywhere** (recommended): ticks in the player and resume card, cells on both Done screens, the same colour code.
- (c) Strip on Exercises only; the Review Done screen keeps the ruled receipt (§5.12 untouched).

**D3. Library home**
- (a) Two-column tiles cut to 96px, with a mono subline.
- (b) **Drawer rows as a course table of contents** (recommended): about 9 themes above the fold instead of 4.
- (c) A three-column "wall of drawers" acting as a mastery map. Long Russian names truncate.

**D4. How much red and drawn ink in motion**
- (a) None: subtraction only, red stays where SPEC already has it.
- (b) **Underline for "the word" only** (recommended): the review example, search match and Context translation filter, plus the due ▪. Misses use `--again` outlines on Done screens only.
- (c) Full set: (b) plus the held-day under-stroke, the red current tick, the red/green edge marks on the card, and the meter fill on reveal.

(If one more is allowed: **D5, the add sheet**. Option (a) is today's boxed input with trims; option (b) is a ruled line on the card with the inline ghost completion, which is recommended.)

## 5. Recommended order (mockups first, smallest risk first)

**Phase 0: decide (no code).** Get answers to D1–D4 and the yes/no list in §3. Take fresh screenshots of the current app first, because `docs/screenshots` may be stale.

**Phase 1: mockups.**
1. One **shared kit board** covering: deck edges, `SessionStrip` (ticks and cells), the ink underline, `BlankCard`, the «Ещё ⌄» fold row, the split chip, a drawer row, the slang meter row variant, and a sheet with a grabber and no ✕. Draw it in light and dark.
2. Screen boards at 390×844, plus **375×667 (iPhone SE)** for Review and Add:
   - Review question and answer (B), Session-Done B
   - Library-Lean-B and the word sheet B
   - Add-Empty/Suggest B
   - Exercise list, player and Done B
   - Settings index B
   - Wait timeline B (only if §3 item 9 is yes)

**Phase 2: code.**
1. **Subtraction only (S, no new visuals, each one reversible):**
   - The wait-screen RU spoilers. **Do this first: it is a learning bug.**
   - The card footer hint, phone gear, practice sentence, eyebrows, zero counts and «Отложено 0».
   - Captions: Settings, plan, filter level note, theme menu.
   - Duplicated counts.
   - Import duplicate signals, sort-plan scaffolding after ready, Anki footnote, Context trims.
   - The snackbar success policy and the sheet icon/✕ trims.
   - The exercise player chrome (A), and the New Word card (A).
2. **Shared primitives:** `Chip` (no zeros, split variant), `SlangMeter` row variant, the `Collapse` fold row, `BlankCard`, `SessionStrip`, the `InkUnderline` utility, `CardDeck` phone edges, the `--prompt-fit` token, the `SheetHeader` slot with the deeper scrim.
3. **Screen restructures (M), one group at a time:**
   - Review question + answer B
   - Library rows, list, word sheet, filter
   - Add chain A1→A6, then the list-paste screen (C)
   - Exercises list, player, feedback, Done
   - Settings index plus sub-routes. Fix the `#set-exercises` and `#set-data` deep links.
   - Import review B
   - Empty states
4. **Expressive extras, one per release:** the session-strip write-in, the plan day strip, the wait timeline, the header large-title collapse, the drawer→theme morph, and the tab-bar hide (only if D1 = c).

**Tests:** per the user, only update the e2e selectors that break because text was removed, such as «тапни, чтобы перевернуть», the ОТВЕТ row, «07 / 30» and «НЕ ЗАКОНЧЕНО». Don't write new suites.

## 6. What the audits missed

- **Two reds that look the same.** `--again #b3261e` and brand red `#c8331f` are indistinguishable at 1–2px. Several proposals pair `--again` with `--good` (edge marks, ticks, pair underlines). That is a red/green colour-blindness problem, so every state needs a shape cue (outline vs fill, left vs right, a ✓), not only a colour.
- **Dark mode** is not drawn anywhere. The blue ruled lines (`#dfe6f3`), the hatched day-strip cells, the hairline deck edges and the dashed rules all need dark tokens. Edges at `#d6d6d1` may disappear on dark paper.
- **Small phones and large text.** Every board is 390×844. A 548px card, a fit-to-width prompt, and the Add sheet with the keyboard up need checking at 375×667 and at 200% text size; the clamp must not overflow. `text-wrap: balance` needs iOS 17.5+, so define a fallback.
- **One first-run policy for all hints.** The swipe legend (sessions 1–3), the Add helper, «Почему позже?», tap-to-reveal, long-press metadata, the subline filters and the toggle captions each invent their own counter. Use one per-device "first week" flag and an onboarding order. Otherwise a new user gets no explanation anywhere after the trims.
- **Long-press as the only path.** Set metadata, the set pencil and the library subline menu are long-press only. Each needs a visible fallback (the «⋯» sheet), and the boards should show it.
- **Desktop regressions.** Desktop is out of scope, but `Chip`, `Sheet`, `WordList`, `ReviewCard`, `SlangMeter`, `Snackbar` and `Header` are shared. Every removal needs a `max-md:` guard or a variant prop, so desktop is untouched.
- **Data the new visuals need.** Each of these must be checked to exist before it is mocked as real data, per MOTION principle 5 (honest):
  - per-card outcome order (Session-Done strip)
  - per-item first-try results (Exercise ticket)
  - the deferred count and fresh/ceiling numbers (day strip)
  - per-card due minutes (wait timeline)
  - today's due vs cap (plan cap hairline)
  - an article-stripping alphabetical key (Library C, later)
- **Performance in long lists.** Lines that draw on first view, using one IntersectionObserver per row across 1318 rows with `content-visibility:auto`, plus fit-to-width text measurement on every card. Use one shared observer and CSS `clamp` instead of JS measuring.
- **Hidden-tab-bar side effects** if D1 = c: the safe-area padding, `--shell-bottom`, the snackbar position, and how the iOS PWA standalone bottom inset behaves when the bar comes back.
- **The removed review-header actions.** Review answer B removes pause and delete from the card and routes them through the word sheet. That needs the `takeOut` wiring so the card still leaves the queue, and the undo copy should match today's.
- **The Next docs folder named in AGENTS.md is missing** (`node_modules/next/dist/docs`). Any view-transition or route work should be checked against the installed Next version before coding, not taken from memory.