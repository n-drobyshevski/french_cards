# Mobile declutter: per-screen directions

For each dense screen: A = conservative trim, B = bolder minimal, C = most visual. The recommended one is marked. Wireframes are 390px phone screens in monospace; the drawn boards are `mockups/L-*.dc.html`.

## Повторение (mobile, <768px)

### Review: question side (cards view; also the loading placeholder)

**Today:** 21 elements at first paint. 4 header controls (direction chip, theme chip, undo, gear), a 3-number summary next to «07 / 30», on held days a reason subline, then a card that is about 548px tall around a 72px prompt, «тапни, чтобы перевернуть» in the footer, the swipe legend, a reserved blank grade-bar slot and the tab bar. The reveal cue appears three times (footer, legend, the tap target itself).

#### A · Подрезать (S)

Keep today's layout and delete what is duplicated. The gear goes (Settings stays in the Library header). The card footer hint goes. The held-day subline moves into «План на сегодня», and the review screen marks a held day with a 2px red under-stroke on «07 / 30». The swipe legend shows only for the first 3 sessions (a per-device counter), then disappears. The summary stays but is shortened to two items.

```
┌────────────────────────────────┐
│[FR→RU ⇄] [Все темы ▾]        ↶ │
│23 К ПОВТ. · 4 НОВЫХ ›   07 / 30│
│━━━━━━━━━┿──────────────────────│
│╭──────────────────────────────╮│
││FR                     НОВОЕ  ││
││══════════════════════════════││
││                              ││
││                              ││
││                              ││
││        se casser             ││
││        v. pron.              ││
││                              ││
││                              ││
││                              ││
││                              ││
│╰──────────────────────────────╯│
│← НЕ ЗНАЮ  ТАП — ОТВЕТ  ЗНАЮ →  │
│  (только первые 3 сессии)      │
│                                │
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: Settings gear → Library header gear (already exists, LibraryScreen); Card footer «тапни, чтобы перевернуть» + flip glyph → removed (the tap target is the whole card); Held-day subline «НОВЫХ 4 ИЗ 10 · ТОЧНОСТЬ…» → plan sheet reason line; on the review screen a 2px red under-stroke on the counter; «· 6 ОБРАТНЫХ» summary item → plan sheet row; Swipe legend → only for sessions 1–3

New visual / motion: 2px red under-stroke under «07 / 30» on held days (static)

Brand conflicts: SPEC.md:276 (built-app header: undo + settings on the right): the gear is removed; SPEC.md:277 (hint under the card «тап — ответ / тап — вопрос»): it becomes onboarding-only; MOTION-SPEC §5.16 places the reason subline under the progress line; it moves into the sheet

#### B · Колода (M) — **рекомендуется**

The header becomes one split chip «FR→RU ┊ Все темы ▾», a single 4px outlined chip with two hit zones. The left zone cycles the direction in 1 tap, as it does today; the right zone opens «Что повторять». Undo sits on the right. The summary text goes: the progress row is only the 1px line with the new-card ticks and «07 / 30», and the whole row is the 44px button that opens «План на сегодня», which lists К повторению / Новых / Обратных. The card holds only the prompt, set fit-to-width at 48–60px Newsreader (opsz auto), on faint blue ruled lines (#dfe6f3, every 32px; CardRules turned on for phones). The queue shows as 1–3 hairline card edges offset 4px under the card (3 edges for 10+ cards left, 2 for 2–9, 1 for the last), so «how much is left» reads at a glance. The swipe legend is replaced by edge marks: 2×24px rules inside the left (again red) and right (good green) card edges at 30% opacity, which darken with drag progress on the stamp's curve. The legend words still show for sessions 1–3.

```
┌────────────────────────────────┐
│[FR→RU ┊ Все темы ▾]          ↶ │
│━━━━━━━━━┿────────────  07 / 30 │
│         ╵    ╵  ╵    ╵         │
│╭──────────────────────────────╮│
││FR                     НОВОЕ  ││
││══════════════════════════════││
││┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄││
││┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄││
││▌                            ▐││
││▌   se casser                ▐││
││▌   v. pron.                 ▐││
││┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄││
││┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄││
││┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄││
│╰──────────────────────────────╯│
│ ╰────────────────────────────╯ │
│  ╰──────────────────────────╯  │
│                                │
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: Two chips → one split chip: direction stays 1 tap (left zone), the theme sheet stays 1 tap (right zone); Summary «23 К ПОВТОРЕНИЮ · 4 НОВЫХ · 6 ОБРАТНЫХ» → plan sheet, opened by tapping the progress row (line + counter); Held-day subline → plan sheet; a red 2px under-stroke on the counter marks a held day; Settings gear → Library header; Card footer «тапни, чтобы перевернуть» → removed; the card gets the 48px back; Swipe legend → edge marks; the words show only in sessions 1–3

New visual / motion: Visible deck on phones: 1–3 hairline edges (no shadow, no rotation). When a grade drops the count below a threshold, the deepest edge fades out --dur-quick, the same rule as the desktop's MOTION D1; Next card at rest sits exactly on the first edge (stackPose(0) aligned to the 4px offset), so the settle after a grade reads as 'the next card slides up from the pile'; Edge marks: 2×24px again-red (left) and good-green (right) rules at .3 opacity, darkening to 1 with swipeVisual.progress. They are static at rest and do not pulse; Prompt fit-to-width 48–60px with text-wrap: balance; the faint ruled lines make the card read as a real index card; The plan button is the progress row, so there is no extra chevron or underline

Brand conflicts: SPEC.md:138 / :276: the v3 top row lists two separate chips + undo + settings. The split chip and the missing gear need a SPEC update; SPEC.md:277: the hint under the card becomes onboarding-only; SPEC.md:63 forbids 'left-border accent cards'. The edge marks are short 24px ticks inside the card, not a border, but say so explicitly in SPEC; MOTION-SPEC §5.16: the reason subline under the progress line moves into the sheet

#### C · Фокус-сессия (L)

Once the first card is touched, the session goes full-screen: the tab bar slides away (the revealTabBar / hidesTabBar mechanism used by the exercise player) and the chips collapse to a ✕. Only ✕, undo, the progress line + counter and the deck remain, which gives the card about 90px more. ✕ or a swipe down on the progress row goes back to an idle 'Сегодня' state: a big «23» Newsreader number, the split chip and a black «Начать». Same deck and edge marks as B, with 3 visible edges.

```
┌────────────────────────────────┐
│✕                             ↶ │
│━━━━━━━━━┿────────────  07 / 30 │
│                                │
│╭──────────────────────────────╮│
││FR                     НОВОЕ  ││
││══════════════════════════════││
││                              ││
││                              ││
││                              ││
││▌                            ▐││
││▌   se casser                ▐││
││▌   v. pron.                 ▐││
││                              ││
││                              ││
││                              ││
││                              ││
││                              ││
│╰──────────────────────────────╯│
│ ╰────────────────────────────╯ │
│  ╰──────────────────────────╯  │
│   ╰────────────────────────╯   │
│(таб-бар скрыт до «Готово»)     │
└────────────────────────────────┘
```

Removed / hidden: Tab bar during the session → back on ✕, on the wait screen and on «Готово на сегодня»; Direction and theme chips → the idle 'Сегодня' screen; Summary, subline, gear, footer hint, legend → as in B

New visual / motion: Tab bar exits 60px down with --dur-exit and returns with --dur-enter (reduced motion: fade); Idle 'Сегодня' state: one big number + «Начать». The number is static, with no count-up

Brand conflicts: SPEC.md:95 / :158: the tab bar is on every Review board; Breaks the task rule that daily paths must not get longer: starting a review now needs an extra «Начать» tap, and switching to another tab mid-session costs ✕ + tab; SPEC.md:138 top row (chips) is removed from the session

**Why B:** B removes 7 of 21 elements and loses no feature. Direction, theme and plan each stay one tap away: the split chip covers direction and theme, the progress row opens the plan. The only thing that becomes far away is Settings, which is not used daily and already lives in the Library header. B also adds the user's 'more visual' request in the brand's own vocabulary: the deck edges replace the numbers, the edge marks replace the legend words, and the larger prompt on ruled lines makes the empty 548px card read as an index card. It keeps one moving element per screen, the deck. C gains about 90px but adds a tap to every daily start and hides the tabs, so it fails the 'no daily path gets longer' rule. A is a safe first step that B includes.

Files: `components/review/ReviewScreen.tsx:835-854 (two Chip → one split chip, direction zone keeps nextDirection on tap)`, `components/review/ReviewScreen.tsx:761-771 (progress: drop `left` summary text; row becomes the plan button; pass a `held` flag)`, `components/review/ReviewScreen.tsx:821 (stop mounting PlanSubline on phones)`, `components/review/ReviewScreen.tsx:931-940 (legend only while the per-device session counter < 3)`, `components/review/ReviewTopBar.tsx:114-120 (remove the phone gear Link)`, `components/review/ReviewTopBar.tsx:147-201 (ProgressLine: the whole 44px row is the summary button, counter only, 2px red under-stroke when held)`, `components/ui/Chip.tsx (split variant: one outlined 4px chip, two buttons, a hairline divider)`, `components/review/ReviewCard.tsx:111 (promptSize: phone fit-to-width 48–60px)`, `components/review/ReviewCard.tsx:121-143 (CardStack/CardDeck: drop max-md:hidden, phone count = 3 / 2 / 1 by remaining, 4px offsets)`, `components/review/ReviewCard.tsx:287-300 (QuestionFace footer: drop the phone hint and flip glyph)`, `components/review/ReviewCard.tsx:464-492 (Stamps: add edge marks driven by the same swipeVisual)`, `components/review/ReviewCard.tsx:785-792 (CardRules: show on phones)`, `components/review/swipe.ts:163-166 (stackPose rest pose aligned with the first edge offset)`, `components/review/PlanParts.tsx:28-50 (PlanSubline content moves into the sheet's reason line only)`, `components/review/useReviewFilter.ts (per-device 'sessions seen' counter next to the stored direction/folder)`, `components/review/format.ts:89-95 (summaryAria becomes the progress-row button's aria-label)`, `mockups/Main.dc.html (new board for direction B)`, `mockups/SPEC.md:138, :153-158, :276-277 (header, hint and tab rules)`

### Review: answer side and grading (including the swipe drag)

**Today:** 24 elements. Besides the question-side chrome, the card header carries FR, the slang meter, «· ≈B1», a divider and three 44px icons (pause, trash, pencil) where a swipe starts. The body stacks headword, POS, translation, an unclamped note, «ОТКУДА», two example pairs, up to 3 custom fields and «ТЕМА: …». The legend repeats the grade-bar labels 16px above 3 buttons that each have a second interval line.

#### A · Подрезать (S)

Same structure, fewer items. In the header only the pencil stays: «На паузу» and «Удалить слово» already exist in the word sheet the pencil opens (WordDetailBody.tsx:754-758). The level mark leaves the header. The second example, «ОТКУДА» and «Свои поля» leave the card (they stay in the word sheet). The note is clamped to 2 lines. «ТЕМА: …» shows only when the filter is «Все темы». The swipe legend is removed on the answer side.

```
┌────────────────────────────────┐
│[FR→RU ⇄] [Все темы ▾]        ↶ │
│23 К ПОВТ. · 4 НОВЫХ ›   08 / 30│
│━━━━━━━━━━┿─────────────────────│
│╭──────────────────────────────╮│
││FR        ▮▮▮▯ arg.        ✎  ││
││══════════════════════════════││
││se casser  v. pron.           ││
││свалить, сбежать              ││
││Casse-toi — грубое «свали».   ││
││Ещё значит «сломаться».       ││
││──────────────────────────────││
││Allez, on se casse d'ici.     ││
││Ну всё, валим отсюда.         ││
││ТЕМА: ПОВСЕДНЕВНОЕ            ││
│╰──────────────────────────────╯│
│╭─────────╮╭─────────╮╭────────╮│
││ Не знаю ││  Сложно ││  Знаю  ││
││  <1 мин ││  6 мин  ││  1 д   ││
│╰─────────╯╰─────────╯╰────────╯│
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: «На паузу» + «Удалить слово» icons and the divider → word sheet (pencil), where both already exist; «· ≈B1» → word sheet grammar line and library rows; «ОТКУДА …», second example pair, «Свои поля» → word sheet; Note → clamped to 2 lines; «ТЕМА: …» footer → only under «Все темы»; Swipe legend on the answer side → removed (the grade bar says the same words)

Brand conflicts: SPEC.md:332 («На паузу» and «Удалить» on the answer-side header); SPEC.md:316 (origin on the review card's answer side); SPEC.md:301 (up to 3 custom fields on the card back); SPEC.md:277 (answer-side hint «тап — вопрос»)

#### B · Ответ и «ещё ↓» (M) — **рекомендуется**

The answer becomes three ink weights and one fold. The headword glides up (MOTION §5.2) to 28–32px, the translation is 24px/500, and one example sits in Newsreader italic, where the headword inside example_fr gets a 1.5px red-ink underline that draws left→right once (240ms, linear) as the back appears. Everything else (note, origin, second example, custom fields, ≈B1, theme) sits behind one hairline row «ещё ↓» and expands in place with Collapse. The desktop already has this marker (ReviewCard.tsx:448-451); on phones it becomes tappable. The header is FR on the left, the slang meter alone on the right, then the pencil. Pause and delete live in the word sheet. The deck edges stay under the card. The grade bar is unchanged (3 outlined buttons + intervals), and the legend is gone.

```
┌────────────────────────────────┐
│[FR→RU ┊ Все темы ▾]          ↶ │
│━━━━━━━━━━┿───────────  08 / 30 │
│╭──────────────────────────────╮│
││FR             ▮▮▮▯ arg.  ✎   ││
││══════════════════════════════││
││se casser                     ││
││v. pron.                      ││
││                              ││
││свалить, сбежать              ││
││                              ││
││Allez, on se casse d'ici.     ││
││          ‾‾‾‾‾‾‾‾            ││
││Ну всё, валим отсюда.         ││
││──────────────────────  ещё ↓ ││
│╰──────────────────────────────╯│
│ ╰────────────────────────────╯ │
│╭─────────╮╭─────────╮╭────────╮│
││ Не знаю ││  Сложно ││  Знаю  ││
││  <1 мин ││  6 мин  ││  1 д   ││
│╰─────────╯╰─────────╯╰────────╯│
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: Pause / delete icons + divider → word sheet (pencil), 2 taps, rarely used; ≈B1, note, «ОТКУДА», second example, «Свои поля», «ТЕМА: …» → «ещё ↓» fold, 1 tap, in place (the full set also stays in the word sheet); Swipe legend → removed; Summary / gear / second chip → as on the question side

New visual / motion: Red-ink underline under the headword inside the example, drawn once (background-size 0→100%, 240ms linear; reduced motion: drawn at once). Red keeps one meaning on this screen: «this is the word»; «ещё ↓» expands with Collapse (--dur-move, --ease-standard); interpolate-size where supported, an instant open in Safari; The slang meter is the card's only metadata, sitting alone at the right

Brand conflicts: SPEC.md:332 (pause / delete icons on the answer header); SPEC.md:316 and :301 (origin and custom fields visible on the back): now behind «ещё ↓»; SPEC.md:277 (answer-side hint)

#### C · Штамп и шкала (L)

B's body plus two visual changes to grading. (1) Each grade button shows its interval as a tiny hairline ruler with one tick at log(interval) (near / mid / far), and the text interval moves to the aria-label. (2) The press leaves an outlined stamp-shaped impression in the button's tone for 120ms instead of the solid ink-fill. While the answer settles, the chrome above the card fades to .3 (focus fade) and comes back after 600ms.

```
┌────────────────────────────────┐
│  (шапка гаснет до .3)          │
│━━━━━━━━━━┿───────────  08 / 30 │
│╭──────────────────────────────╮│
││FR             ▮▮▮▯ arg.  ✎   ││
││══════════════════════════════││
││se casser                     ││
││свалить, сбежать              ││
││                              ││
││Allez, on se casse d'ici.     ││
││          ‾‾‾‾‾‾‾‾            ││
││Ну всё, валим отсюда.         ││
││                              ││
││                       ещё ↓  ││
│╰──────────────────────────────╯│
│ ╰────────────────────────────╯ │
│  ╰──────────────────────────╯  │
│╭─────────╮╭─────────╮╭────────╮│
││ Не знаю ││  Сложно ││  Знаю  ││
││ ┼────── ││ ──┼──── ││ ─────┼ ││
│╰─────────╯╰─────────╯╰────────╯│
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: Interval strings «<1 мин / 6 мин / 1 д» → ruler ticks (text kept in the aria-label); POS line → «ещё ↓»; Everything removed in B

New visual / motion: Interval ruler: 1px rule with a 5px tick at a log-scale position; Press impression: a 2px tone outline + mono label, held 120ms, replacing the ink-fill; Focus fade of the header to .3 while the answer writes in

Brand conflicts: SPEC.md:134 (FSRS intervals as text under the grade buttons); MOTION-SPEC R6 / §5.4 (ink-fill grade acknowledgement); MOTION-SPEC §1 principle 1: a third moving thing per screen (deck + fade + press)

**Why B:** The answer side is the densest screen (8/10). B cuts the card to what grading needs: headword, translation, one example. Everything else stays one tap away in place, and pause/delete stay two taps away in the word sheet that already has them, so no feature is lost. It moves the trash icon out of the swipe-start zone. The only new motion is the red underline drawn under the word in its example, which is meaningful and fits the 'ink on paper' brand. C's interval ruler removes numbers that do inform the choice, and it adds motion beyond the novelty budget.

Files: `components/review/ReviewCard.tsx:358-377 (header: drop the level mark 361-368, divider 369, mute 370, delete 371; keep SlangMeter + pencil)`, `components/review/ReviewCard.tsx:391-446 (body: headword, POS, translation, first example; note clamp 2 lines at :410; origin 414-419, second example 429-436, CardFields 439, theme footer 443-446 → fold)`, `components/review/ReviewCard.tsx:448-451 (reuse the «ещё ↓» marker as a tappable phone fold)`, `components/review/ReviewCard.tsx:420-427 (wrap the headword inside example_fr in a red-underline span that draws once)`, `components/ui/Collapse.tsx (reuse for the fold)`, `components/review/ReviewScreen.tsx:920-921 (drop the onMute/onDelete card props)`, `components/review/ReviewScreen.tsx:976 (WordDetailSheet: when the word is paused or deleted from the sheet, call takeOut so the card leaves as today)`, `components/library/WordDetailBody.tsx:754-758 (existing «На паузу» / «Удалить слово», reached from review)`, `components/review/ReviewScreen.tsx:931-940 (no legend on the answer side)`, `mockups/Review-Back.dc.html, mockups/M-Review-Reveal.dc.html`, `mockups/SPEC.md:301, :316, :332`

### Practice round («Ещё практика» / «Повторить ошибки» / theme or set training)

**Today:** 9 elements. The «× Закончить практику» chip, undo, gear, a ~40-character mono line «ПРАКТИКА · НЕ ВЛИЯЕТ НА РАСПИСАНИЕ» next to «03 / 12», then the same card and legend as a normal session, the grade bar without intervals and the tab bar.

#### A · Короче подпись (S)

Shorten the progress-row label to «ПРАКТИКА» / «ТЕМА: ЭМОЦИИ» / «НАБОР: СЛЕНГ НЕДЕЛИ». The «не влияет на расписание» sentence moves to the chip's aria-label (the user already read it on the button that started the round). Remove the gear.

```
┌────────────────────────────────┐
│[× Закончить практику]        ↶ │
│ПРАКТИКА                 03 / 12│
│━━━━━━━━━━━┿────────────────────│
│╭──────────────────────────────╮│
││FR                            ││
││══════════════════════════════││
││                              ││
││                              ││
││                              ││
││        chelou                ││
││        adj. · verl.          ││
││                              ││
││                              ││
││                              ││
││                              ││
│╰──────────────────────────────╯│
│← НЕ ЗНАЮ  ТАП — ОТВЕТ  ЗНАЮ →  │
│                                │
│                                │
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: «· НЕ ВЛИЯЕТ НА РАСПИСАНИЕ» → aria-label of the chip and the Session-Done button; Settings gear → Library header

#### B · Черновая бумага (S) — **рекомендуется**

Practice says 'not on the record' with one mark instead of a sentence: the card's 2px red header rule becomes a 2px dashed ink rule (dashed already means tentative/unsorted in the brand: Входящие, «verl.»), and the card label reads «FR · ПРАКТИКА». The progress row is only the line + «03 / 12». The deck edges and edge marks are the same as in the main session.

```
┌────────────────────────────────┐
│[× Закончить практику]        ↶ │
│━━━━━━━━━━━┿───────────  03 / 12│
│                                │
│╭──────────────────────────────╮│
││FR · ПРАКТИКА                 ││
││┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅││
││                              ││
││                              ││
││                              ││
││▌   chelou                   ▐││
││▌   adj. · verl.             ▐││
││                              ││
││                              ││
││                              ││
││                              ││
│╰──────────────────────────────╯│
│ ╰────────────────────────────╯ │
│  ╰──────────────────────────╯  │
│                                │
│                                │
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: The whole left label of the progress row → «ПРАКТИКА» in the card label; the full sentence goes in the aria-label; Settings gear; Swipe legend → edge marks (as in the main session)

New visual / motion: Dashed 2px ink header rule = practice card (static); Theme training: the dashed rule takes the theme colour

Brand conflicts: SPEC.md:138: the index card's header rule is a 2px red-ink line. This adds a dashed practice variant

**Why B:** It removes a 40-character sentence and replaces it with one mark the user sees on every card, so the mode can't be missed even mid-round, while «× Закончить практику» stays the obvious exit. It costs almost nothing (one prop on the header rule) and stays consistent with the deck design of the main session.

Files: `components/review/ReviewScreen.tsx:741-747 (progress.left for practice → empty on phones; the sentence goes to an aria-label)`, `components/review/ReviewScreen.tsx:823-832 (chip aria-label carries «не влияет на расписание»)`, `components/review/card-parts.tsx:12 (header rule: `practice` variant = dashed 2px ink, or the theme colour)`, `components/review/ReviewCard.tsx:101-105 (CallNumber: «FR · ПРАКТИКА»)`, `components/review/ReviewTopBar.tsx:114-120 (gear removal, shared with the cards view)`, `mockups/SPEC.md:138 (practice rule variant)`

### «План на сегодня» bottom sheet (phones)

**Today:** 11 elements. Title + ×, an ink rule, 4 receipt rows (including «Отложено 0» every normal day), a reason line, «Всё равно добавить новые» with a separate caption, and «Изменить план ›» with a mono repeat of the settings «10 СЛОВ · ДО 200». In direction B of the question side it also absorbs the review-header summary and the held-day subline, so it becomes the single home for the day's numbers.

#### A · Только ненулевое (S)

Keep the receipt. Render «Отложено» only when day.deferred > 0. Drop the mono «10 СЛОВ · ДО 200». Fold the caption into the button as its sublabel «только на сегодня». Add a grabber.

```
┌────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│╭──────────────────────────────╮│
││              ──              ││
││План на сегодня            ×  ││
││━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━││
││К повторению ·············· 27││
││Новых слов ·········· 4 из 10 ││
││Обратных сторон ············ 6││
││                              ││
││Точность за неделю 74 % —     ││
││новых сегодня меньше.         ││
││                              ││
││  [ Всё равно добавить новые ]││
││      только на сегодня       ││
││──────────────────────────────││
││Изменить план               › ││
│╰──────────────────────────────╯│
└────────────────────────────────┘
```

Removed / hidden: «Отложено 0» → only when > 0; Mono «10 СЛОВ · ДО 200» → removed («из 10» is in the Новых row); Separate caption «Только на сегодня. Завтра план снова подстроится.» → the button's sublabel; the full sentence goes in the aria-label

Brand conflicts: SPEC «План дня» receipt lists «Отложено» as a fixed row and the override caption as its own line

#### B · Полоса дня (M) — **рекомендуется**

The receipt rows become one 10px 'day strip' across the sheet. Reviews are solid ink cells; new words are hatched cells (4 of a 10-slot ceiling), with the 6 unused slots drawn as empty hairline boxes; reverse sides are outlined; deferred cards are dashed beyond a vertical cap rule. Mono labels sit under each segment («ПОВТ. 27 · НОВ. 4/10 · ОБР. 6»), so every number stays. A held day reads as empty slots plus one reason line. «Всё равно добавить новые» fills the empty slots left→right, 40ms apart, as the receipt rows rule in today.

```
┌────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│╭──────────────────────────────╮│
││              ──              ││
││План на сегодня            ×  ││
││                              ││
││████████████▒▒▒▒□□□□□□┊▢▢▢    ││
││ПОВТ. 27    НОВ. 4/10   ОБР. 6││
││                              ││
││Точность за неделю 74 % —     ││
││новых сегодня меньше.         ││
││                              ││
││  [ Всё равно добавить новые ]││
││      только на сегодня       ││
││──────────────────────────────││
││Изменить план               › ││
│╰──────────────────────────────╯│
└────────────────────────────────┘
```

Removed / hidden: 4 ruled receipt rows → one strip + one mono label line (the numbers are kept); «Отложено 0» → a dashed segment only when > 0; Mono settings repeat → removed; Override caption → button sublabel

New visual / motion: Day strip: segment widths proportional; ink / hatched / empty / outlined / dashed cells drawn with 1px rules only; Override: empty slots ink in left→right, 40ms stagger, opacity + fill, --dur-enter; reduced motion: at once

Brand conflicts: SPEC «План дня» receipt rows → a strip (needs a SPEC update); MOTION-SPEC §5.16: «Всё равно добавить новые» should only swap numbers with no insert animation. The slot fill is a new small stagger

**Why B:** Once the review header stops repeating the counts, this sheet is where the day's plan lives, so it should explain at a glance. A held day shows up as empty slots rather than a sentence to parse. Every number stays as a mono label, the sheet gets one row shorter, and the one motion (slots filling on override) means something real and happens only on that tap. If time is short, ship A first; B builds on the same PlanReceipt.

Files: `components/review/PlanParts.tsx:74-155 (PlanReceipt: day strip on phones; «Отложено» row 111-113 only when > 0; caption 136 → button sublabel; drop the mono settings value at :149)`, `components/review/PlanParts.tsx:28-50 (the PlanSubline reason text joins the sheet's reason line)`, `components/review/PlanParts.tsx:157-175 (PlanSheet: grabber)`, `components/review/plan-format.ts (segment data: reviews, fresh / ceiling, reverse, deferred)`, `mockups/Review-Plan-Sheet.dc.html`, `mockups/SPEC.md «План дня и уровень языка», mockups/MOTION-SPEC.md §5.16`

### «Что повторять» theme picker sheet (theme chip)

**Today:** 8 element types. «МОИ НАБОРЫ» comes first, even with zero sets (header + «+ Новый набор» before the themes the user came for). Each set row has a pencil. Each theme row shows the total plus the due count («42 · 6 К ПОВТ.»).

#### A · Темы первыми (S) — **рекомендуется**

Themes come first and «Все темы» sits on top. Theme rows show only the due count, in ink («6 К ПОВТ.»), or nothing when 0; «Входящие» keeps its red unsorted count. «МОИ НАБОРЫ» comes after the themes and only when sets exist; otherwise one «+ Новый набор» row at the bottom. The pencil on set rows moves to a long-press and to an «Изменить» entry inside ReviewSetSheet.

```
┌────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│╭──────────────────────────────╮│
││              ──              ││
││Что повторять              ×  ││
││ТЕМЫ ━━━━━━━━━━━━━━━━━━━━━━━━━││
││Все темы           23 К ПОВТ.✓││
││──────────────────────────────││
││Входящие                     7││
││──────────────────────────────││
││Повседневное        6 К ПОВТ. ││
││──────────────────────────────││
││Деньги              3 К ПОВТ. ││
││──────────────────────────────││
││Эмоции                        ││
││──────────────────────────────││
││Тусовка             2 К ПОВТ. ││
││МОИ НАБОРЫ ━━━━━━━━━━━━━━━━━━━││
││Сленг недели        3 К ПОВТ. ││
││+ Новый набор                 ││
│╰──────────────────────────────╯│
└────────────────────────────────┘
```

Removed / hidden: Total word counts «42 ·» → Library; «МОИ НАБОРЫ» first → after the themes, only when sets exist; Pencil per set row → long-press on the row and an «Изменить» entry in the set sheet

Brand conflicts: SPEC.md:280 («Что повторять»: «МОИ НАБОРЫ» first, pencil «Изменить набор» on each row)

#### B · Ящики каталога (M)

Each theme row borrows the catalog-drawer language. A 10×14 outlined card glyph sits before the name with its 3px top band in the theme colour (not a left border, which SPEC forbids). Under the row runs a 2px hairline showing the share of the theme that is due. On the right, only the due number. «Входящие» gets a dashed glyph. Themes come first, as in A.

```
┌────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│╭──────────────────────────────╮│
││              ──              ││
││Что повторять              ×  ││
││                              ││
││Все темы                 23 ✓ ││
││━━━━━━━━━━━━━━━━━━━━━━━━──────││
││▀ Повседневное              6 ││
││━━━━━━━━━━━━━━━━━━━━━━━───────││
││▀ Деньги                    3 ││
││━━━━━━━━━━━━━━━━━━━━━━━━━━━───││
││▀ Эмоции                      ││
││━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━││
││▀ Тусовка                   2 ││
││━━━━━━━━━━━━━━━━━━━━━━━━━━────││
││┆ Входящие                  7 ││
││                              ││
││+ Новый набор                 ││
│╰──────────────────────────────╯│
└────────────────────────────────┘
```

Removed / hidden: Mono «42 · 6 К ПОВТ.» → only the due number; Section labels «ТЕМЫ» / «МОИ НАБОРЫ» → only when sets exist; Set pencil → long-press

New visual / motion: Card glyph with the theme-colour top band (same glyph as the app mark); 2px due-share hairline per row (static)

Brand conflicts: SPEC.md:280 (section order and pencil); SPEC.md:104: theme colours are 'used only for that top band and progress'. A glyph band fits, but say so in SPEC

**Why A:** This is a utility sheet the user opens to pick and leave, so the novelty budget belongs to the deck, not here. A fixes the real problem (empty «МОИ НАБОРЫ» and a pencil before the themes) and halves the numbers per row in a few lines of reordering. B's colour glyph is a good later polish, once the Library tiles use the same glyph.

Files: `components/review/FolderPickerSheet.tsx:109-165 (reorder: «Темы» block 155-165 first; «Мои наборы» block 114-153 after it and only when sets.length > 0, else just «+ Новый набор»)`, `components/review/FolderPickerSheet.tsx:44-48 (row count text: due only)`, `components/review/FolderPickerSheet.tsx:135-141 (pencil → long-press handler)`, `components/review/ReviewSetSheet.tsx (an «Изменить» entry for the set)`, `mockups/SPEC.md:280`

### Wait screen «На сейчас всё» (learning cards return later today)

**Today:** 12 elements. Chips + undo + gear. «ЖДУТ 3 КАРТОЧКИ … 34 / 37». The meta «НА СЕЙЧАС ВСЁ» plus an h1 «Ещё 3 карточки — через 12 мин» (two headlines for one message). A 3-line pedagogy paragraph shown every day. Up to 5 rows FR · RU · «ЧЕРЕЗ N МИН», where the RU column gives away the answers to cards due again in minutes. «Пока можно: Упражнения ›», which duplicates the tab, and «Готово на сегодня».

#### A · Без подсказок (S)

One h1 «Через 12 мин — ещё 3». The rows show FR only (no RU spoilers) plus their time. The paragraph sits behind «Почему позже? ›», expanding in place. «ЖДУТ 3 КАРТОЧКИ» goes from the progress row, and the «Упражнения» link goes (the tab is right below).

```
┌────────────────────────────────┐
│[FR→RU ┊ Все темы ▾]          ↶ │
│━━━━━━━━━━━━━━━━━━━━━━━┿ 34 / 37│
│                                │
│Через 12 мин — ещё 3            │
│                                │
│Почему позже? ›                 │
│                                │
│la thune            ЧЕРЕЗ 12 МИН│
│────────────────────────────────│
│chelou              ЧЕРЕЗ 19 МИН│
│────────────────────────────────│
│se casser           ЧЕРЕЗ 31 МИН│
│────────────────────────────────│
│                                │
│                                │
│╭──────────────────────────────╮│
││      Готово на сегодня       ││
│╰──────────────────────────────╯│
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: RU translations in the waiting rows → removed (they spoil the next retrieval); «ЖДУТ 3 КАРТОЧКИ» in the progress row → removed; Meta «НА СЕЙЧАС ВСЁ» → merged into the h1; Paragraph → «Почему позже? ›» (Collapse); «Пока можно: Упражнения ›» → the Упражнения tab; Gear / second chip → as on the question side

Brand conflicts: Review-Wait board (mockups/Review-Wait.dc.html) shows the RU column, the paragraph and the Упражнения row

#### B · Линия возврата (M) — **рекомендуется**

Replace the list with a return timeline. A hairline spans the next 60 min, a red 'now' tick sits at the left, and one small outlined index-card glyph (10×14, the app-mark glyph) marks each waiting card at its due minute, with mono minute labels underneath. The h1 states the first return; the picture shows the rest. There is no list and no spoiler. The tick moves once a minute through the existing useMinuteClock. When it reaches the first glyph, the screen already returns to the card by itself, so the picture is a literal promise. «почему позже?» is a text link that expands in place. «Готово на сегодня» is the single action.

```
┌────────────────────────────────┐
│[FR→RU ┊ Все темы ▾]          ↶ │
│━━━━━━━━━━━━━━━━━━━━━━━┿ 34 / 37│
│                                │
│                                │
│Через 12 мин —                  │
│ещё 3 карточки                  │
│                                │
│         ▯     ▯   ▯            │
│┃────────┴─────┴───┴───────────┤│
│СЕЙЧАС    15     30     45    60│
│                                │
│почему позже?                   │
│                                │
│                                │
│                                │
│╭──────────────────────────────╮│
││      Готово на сегодня       ││
│╰──────────────────────────────╯│
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: Word rows (FR, RU, per-row «ЧЕРЕЗ N МИН») → glyphs on the timeline; the times stay in each glyph's aria-label; Paragraph → «почему позже?»; «ЖДУТ 3 КАРТОЧКИ», meta, «Упражнения» link → removed; Gear / second chip → as on the question side

New visual / motion: Timeline: 1px hairline, a red 2px 'now' tick, outlined card glyphs, mono 11 minute labels. The axis widens to 2 h or 4 h when the last card is later; The 'now' tick steps once a minute (--dur-move, translateX). It is a plain step, not a progress bar, with no seconds; When the tick meets the first glyph, that glyph lifts into the deck as the card enters (R5 settle). Reduced motion: a 110ms fade

Brand conflicts: MOTION-SPEC §5.16 wait screen: 'no seconds, ring or progress bar'. The once-a-minute tick is a minute swap drawn as position; get explicit approval; Review-Wait board (list layout)

#### C · Колода ждёт (M)

Show the waiting cards as the same deck, face down: a narrower index card with a mono «12 МИН» stamp on its red rule and 2 edges under it for the other cards. When the first is due, the top card turns face-up and the session continues. One line: «Ещё 3 карточки вернутся сами».

```
┌────────────────────────────────┐
│[FR→RU ┊ Все темы ▾]          ↶ │
│━━━━━━━━━━━━━━━━━━━━━━━┿ 34 / 37│
│                                │
│  ╭──────────────────────────╮  │
│  │══════════════   ┌──────┐ │  │
│  │                 │12 МИН│ │  │
│  │                 └──────┘ │  │
│  │                          │  │
│  │                          │  │
│  ╰──────────────────────────╯  │
│   ╰────────────────────────╯   │
│    ╰──────────────────────╯    │
│                                │
│Ещё 3 карточки вернутся сами    │
│                                │
│╭──────────────────────────────╮│
││      Готово на сегодня       ││
│╰──────────────────────────────╯│
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: Rows, paragraph, meta, «Упражнения» link → removed; the h1 becomes one line under the deck

New visual / motion: Face-down deck with a stamp; turns face-up on due (§5.2 reveal reused)

Brand conflicts: A second stamp usage outside grading / done could dilute the stamp's meaning (MOTION §5.3, §5.12)

**Why B:** B fixes a real learning bug (RU answers shown minutes before recall) and turns 5 rows of mono time strings into one picture that answers 'when do I come back' at a glance. It reuses the existing minute clock and auto-return, so the motion is honest (it moves only on real minutes). C is charming but spends the stamp, which should stay tied to grading and the done moment. A is the minimum and is contained in B.

Files: `components/review/WaitScreen.tsx:57-66 (merge meta + h1 into «Через 12 мин — ещё 3 карточки»)`, `components/review/WaitScreen.tsx:67-69 (paragraph → «почему позже?» Collapse)`, `components/review/WaitScreen.tsx:70-84 (rows → ReturnTimeline using useMinuteClock; no RU)`, `components/review/WaitScreen.tsx:89-98 (remove the «Пока можно: Упражнения» link)`, `components/review/ReviewScreen.tsx:752-759 (wait progress: drop waitingSummary as the left label)`, `components/review/plan-format.ts:119-122 (waitingSummary → aria only; waitIn reused for glyph labels)`, `components/ui/AppMark.tsx (reuse the 10×14 card glyph)`, `mockups/Review-Wait.dc.html`, `mockups/MOTION-SPEC.md §5.16`

### «Готово на сегодня» (session done, phone)

**Today:** 19 elements. Full top bar (chips, undo, gear). The date twice («СЕССИЯ · 24 ОКТЯБРЯ» and the «24.10» stamp). h1 + red rule + a 3-row receipt + «СЛЕДУЮЩИЕ 18 СЛОВ — ЗАВТРА». A plan-settings row. «ТРУДНЫЕ 3» with up to 5×44px rows (FR · RU · meter). «Упражнение по трудным словам · 9 ›». Then 3 stacked full-width buttons, and with 5 hard words two of them land below the fold.

#### A · Квитанция без лишнего (S)

Keep the receipt moment (§5.12) and drop everything around it. The meta date goes (the stamp carries it). The plan row moves to the plan sheet / Settings. The exercise row moves to the Упражнения tab. The hard words become one serif line with ink underlines, and tapping it opens the list. «Ещё практика · Добавить слова» become one row of text buttons under the black «Повторить ошибки (3)». The header keeps the split chip + undo.

```
┌────────────────────────────────┐
│[FR→RU ┊ Все темы ▾]          ↶ │
│                                │
│Готово на сегодня       [24.10] │
│━━━━━━━━━━━━━━━━━━━━━ (красн.)  │
│Повторено ················· 30  │
│Новых ······················ 4  │
│Верно ··················· 92 %  │
│────────────────────────────────│
│СЛЕДУЮЩИЕ 18 СЛОВ — ЗАВТРА      │
│                                │
│ТРУДНЫЕ                        3│
│chelou · la galère · se tirer   │
│‾‾‾‾‾‾   ‾‾‾‾‾‾‾‾‾   ‾‾‾‾‾‾‾‾   │
│                                │
│╭──────────────────────────────╮│
││     Повторить ошибки (3)     ││
│╰──────────────────────────────╯│
│ Ещё практика  ·  Добавить слова│
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: Meta «СЕССИЯ · 24 ОКТЯБРЯ» → the date stamp; Plan row «План: 10 слов в день …» → plan sheet «Изменить план» / Settings; «Упражнение по трудным словам · 9 ›» → Упражнения tab; 5 hard rows (RU + meter) → one serif line; a tap opens the list (or Library filtered to Трудные); «не влияет на расписание» caption → aria-label + the practice round's card mark; Two stacked secondary buttons → one text row; Gear → Library header

Brand conflicts: SPEC.md:140 «Трудные» list as rows with hairlines; SPEC.md:175 (stacked buttons; «Ещё практика» caption «не влияет на расписание»)

#### B · Полоса сессии (M) — **рекомендуется**

A's trims, plus the 3-row receipt becomes a tally strip: one 8×14 cell per card reviewed today, in session order. Correct is an ink fill, «Не знаю» a red outline, and a new word an ink cell with a top notch. One mono line under it: «30 КАРТОЧЕК · 92 % · 4 НОВЫХ». The whole session is visible at once (where the misses clustered) with no count-up. The cells write in left→right in 4 groups 40ms apart, inside the existing receipt beat. «Завтра — 18 слов» gets a small stack of 3 outlined card glyphs, the same glyph as the wait-screen timeline. The h1, red rule draw and date stamp stay exactly as §5.12.

```
┌────────────────────────────────┐
│[FR→RU ┊ Все темы ▾]          ↶ │
│                                │
│                                │
│Готово на сегодня       [24.10] │
│━━━━━━━━━━━━━━━━━━━━━ (красн.)  │
│                                │
│■■■■■▣□■■■■■■■■■■■□■■▣■■■■■□■■  │
│30 КАРТОЧЕК · 92 % · 4 НОВЫХ    │
│                                │
│Трудные: chelou, la galère,     │
│se tirer ›                      │
│                                │
│▭▭▭ завтра — 18 слов            │
│                                │
│                                │
│╭──────────────────────────────╮│
││     Повторить ошибки (3)     ││
│╰──────────────────────────────╯│
│ Ещё практика  ·  Добавить слова│
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: Everything removed in A; Receipt rows Повторено / Новых / Верно → tally strip + one mono line (the same 3 numbers)

New visual / motion: Tally strip: 1px-rule cells (ink / red outline / notched); wraps to 2 rows past 30, and past 60 cards becomes a proportional ink/red bar; Write-in: 4 groups, opacity + 4px, --dur-enter, 40ms apart, in the slot of the receipt rule-in (§5.12); numbers static; Card-glyph stack next to «завтра» (static)

Brand conflicts: SPEC.md:140 (receipt as a ruled table); MOTION-SPEC §5.12 (receipt rows rule in top-down) → cells write in. Same beat and budget, different shape

#### C · Итог на карточке (L)

The last review card does not leave; it turns into the receipt. The same index card (white, red rule, edges under it) holds «Готово на сегодня», the receipt and the hard words, and the date stamp lands on its red rule. A shared-element view transition morphs the last card into the receipt card.

```
┌────────────────────────────────┐
│[FR→RU ┊ Все темы ▾]          ↶ │
│╭──────────────────────────────╮│
││                      [24.10] ││
││══════════════════════════════││
││Готово на сегодня             ││
││                              ││
││Повторено ················ 30 ││
││Новых ···················· 4  ││
││Верно ················· 92 %  ││
││                              ││
││Трудные: chelou, la galère,   ││
││se tirer ›                    ││
│╰──────────────────────────────╯│
│ ╰────────────────────────────╯ │
│  ╰──────────────────────────╯  │
│завтра — 18 слов                │
│╭──────────────────────────────╮│
││     Повторить ошибки (3)     ││
│╰──────────────────────────────╯│
│ Ещё практика  ·  Добавить слова│
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: As in A

New visual / motion: View transition: the last card's box morphs into the receipt card (position/size only, --dur-turn); reduced motion: crossfade; The stamp lands on the card's red rule

Brand conflicts: MOTION-SPEC §5.12: 'last card exits and the card area clears' → the card stays; The red rule is drawn on the card instead of under a free h1

**Why B:** B brings the screen to 10 elements, and all actions fit above the fold even with 5 hard words. The one primary action, «Повторить ошибки», becomes unmistakable. It keeps the brand's single delight (rule draw + date stamp) unchanged and replaces a 3-row table with a picture of the session the user just did, which is 'dynamic/visual' without confetti, count-ups or streaks. C is the most elegant but rewrites the once-a-day sequence and needs view transitions, so it is better as a later step on top of B.

Files: `components/review/SessionDone.tsx:169 (drop the phone meta «Сессия · {day}»)`, `components/review/SessionDone.tsx:197-202 (ReceiptRow ×3 → TallyStrip on phones; keep ReceiptRow for desktop)`, `components/review/SessionDone.tsx:208-216 (next line with the glyph stack; drop PlanRow at :216 and its component at :344-367 on phones)`, `components/review/SessionDone.tsx:218-247 (hard list → one serif line linking to the list)`, `components/review/SessionDone.tsx:251 and :375-397 (DifficultExerciseRow → Упражнения tab)`, `components/review/SessionDone.tsx:260-331 (primary + one text-button row; caption → aria-label)`, `components/review/data.ts (per-card outcomes in order for the strip, if the summary lacks them)`, `components/review/ReviewScreen.tsx:812-857 (done view: split chip + undo only)`, `mockups/Session-Done.dc.html, mockups/M-Session-Done.dc.html`, `mockups/SPEC.md:140, :175-176; mockups/MOTION-SPEC.md §5.12`

### Empty library «Пока нет слов»

**Today:** 8 elements. Direction chip, theme chip, a disabled undo and the gear, all doing nothing over an empty library (hideOnDesktop hides them only from 768 up). Then the meta «ПОВТОРЕНИЕ» repeating the active tab, an h1, a 2-line paragraph, «+ Добавить слово» and «Импорт со скриншота».

#### A · Только суть (S)

Hide the whole review header on phones too. Drop the meta. Cut the paragraph to one line. Keep the black «+ Добавить слово» in the thumb zone and «Импорт со скриншота» as a tertiary link.

```
┌────────────────────────────────┐
│                                │
│                                │
│                                │
│                                │
│Пока нет слов                   │
│                                │
│Добавьте первое слово —         │
│оно станет карточкой.           │
│                                │
│                                │
│                                │
│                                │
│                                │
│                                │
│                                │
│╭──────────────────────────────╮│
││      +  Добавить слово       ││
│╰──────────────────────────────╯│
│       Импорт со скриншота      │
│                                │
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: Chips, disabled undo, gear → hidden on phones too; Meta «ПОВТОРЕНИЕ» → removed; Paragraph → one line

#### B · Пустая карточка (S) — **рекомендуется**

Draw the empty state as the object itself: the review index card (white, red header rule, «FR» label) with a dashed 1px border, and «+ Добавить слово» written on it in Newsreader. The whole card is the button and opens the add sheet. The h1 «Пока нет слов» stays above it for screen readers and context. «Импорт со скриншота» sits under it as a tertiary link. The first run teaches the object that will later hold every word.

```
┌────────────────────────────────┐
│                                │
│Пока нет слов                   │
│                                │
│┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐│
│┆FR                            ┆│
│┆══════════════════════════════┆│
│┆                              ┆│
│┆                              ┆│
│┆                              ┆│
│┆      +  Добавить слово       ┆│
│┆                              ┆│
│┆                              ┆│
│┆                              ┆│
│┆                              ┆│
│┆                              ┆│
│└┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘│
│                                │
│       Импорт со скриншота      │
│                                │
│                                │
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: Header (chips, undo, gear) → hidden on phones; Meta «ПОВТОРЕНИЕ» → removed; Paragraph → removed (the drawn card explains it); Black full-width button → the dashed card is the primary target

New visual / motion: Dashed empty index card with a red header rule; press .98 as a button (§5.1)

Brand conflicts: None of substance. Dashed already means 'empty / unsorted' in the brand. SPEC empty states are typographic; the drawn card is the hairline-only exception the research allows

**Why B:** It is the cleanest possible first run, with one target and one alternate path, and it is the most visual option without any illustration: the empty object is the card the user is about to fill. It costs almost nothing, since the card frame and rules already exist (ReviewCardPlaceholder / CardRules).

Files: `components/review/EmptyStates.tsx:12-28 (EmptyLibrary: drop the meta and paragraph; render the dashed card button)`, `components/review/ReviewTopBar.tsx:96-97 (hideOnDesktop → hide on all widths when the library is empty)`, `components/review/ReviewScreen.tsx:818 (pass the hide flag for phones)`, `components/review/ReviewCard.tsx:785-806 (reuse CardRules / the ReviewCardPlaceholder frame with a dashed border)`

### Empty theme «В этой теме пока нет слов»

**Today:** 7 elements. The full header (chips, undo, gear), the meta «ТЕМА: ЭМОЦИИ» repeating the theme chip just above, an h1, a primary «Все темы» and a tertiary «Добавить слова».

#### A · Без повтора (S) — **рекомендуется**

Drop the meta (the chip says «Эмоции») and the gear. Keep the h1, the primary «Все темы» and the tertiary «Добавить слова». The header keeps only the split chip + undo, because changing the theme is the way out.

```
┌────────────────────────────────┐
│[FR→RU ┊ Все темы ▾]          ↶ │
│                                │
│                                │
│В этой теме пока нет слов       │
│                                │
│                                │
│                                │
│                                │
│                                │
│                                │
│                                │
│                                │
│                                │
│                                │
│╭──────────────────────────────╮│
││           Все темы           ││
│╰──────────────────────────────╯│
│         Добавить слова         │
│                                │
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: Meta «ТЕМА: ЭМОЦИИ» → removed; Gear → Library header

#### B · Пустой ящик (S)

The same dashed empty card as the empty library, with the theme's 3px colour band on top (catalog-drawer language), so an empty theme reads as an empty drawer. A tap on the card means «+ Добавить в «Эмоции»» (the add sheet with the theme preselected). The primary «Все темы» sits below as the way back. The h1 becomes «В «Эмоциях» пока пусто».

```
┌────────────────────────────────┐
│[FR→RU ┊ Все темы ▾]          ↶ │
│                                │
│В «Эмоциях» пока пусто          │
│                                │
│┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐│
│┆▀▀▀▀▀▀ (полоса цвета темы)    ┆│
│┆══════════════════════════════┆│
│┆                              ┆│
│┆                              ┆│
│┆                              ┆│
│┆   + Добавить в «Эмоции»      ┆│
│┆                              ┆│
│┆                              ┆│
│┆                              ┆│
│┆                              ┆│
│└┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘│
│                                │
│╭──────────────────────────────╮│
││           Все темы           ││
│╰──────────────────────────────╯│
│━━━━━━━━────────────────────────│
│ Повтор.  Упражн. Добав.  Библ. │
└────────────────────────────────┘
```

Removed / hidden: Meta «ТЕМА: ЭМОЦИИ» → the theme name in the h1 and the colour band; Tertiary «Добавить слова» → the dashed card (prefilled theme); Gear → Library header

New visual / motion: Theme colour top band on the empty card (static)

Brand conflicts: Two primary-looking targets (card + «Все темы»). Keep «Все темы» as the only black button and the card as the dashed secondary

**Why A:** An empty theme is a dead end whose job is to get out («Все темы»). A keeps that single primary action unambiguous and removes the only duplicate. B is nice for consistency with the empty library but puts two large targets on a screen meant for one. Adopt B only if the empty-library card ships and testing shows it reads as secondary.

Files: `components/review/EmptyStates.tsx:34-48 (EmptyFolder: drop the phone meta at :37)`, `components/review/ReviewScreen.tsx:861 (EmptyFolder mount; the header shows only the split chip + undo)`, `components/review/ReviewTopBar.tsx:114-120 (gear removal, shared)`

## Упражнения (mobile <1024px): set list, waiting/offline, empty builder, request sheet, set menu + connector help, player 

### List: sets with an unfinished run (default state)

**Today:** 34 elements above the fold. Header and «Попросить набор». A provenance subline. A «НЕ ЗАКОНЧЕНО · 1» rule above a resume card that shows title, meta, a red line and «Продолжить · 5 из 8». A «НАБОРЫ · 2 НОВЫХ» rule above 2×2 tiles, each with 6–7 pieces (red band + red НОВЫЙ, «12 ВОПРОСОВ», themes, date, empty track). Two dashed scope tiles and a dashed «+ Попросить набор» tile below them. Three controls do one job (ask for a set), and 'new' and 'progress' are each encoded 2–3 times.

#### A · Trim in place (S)

Keep the Exercise-List-B layout and delete only the duplicates. Delete the subline, the «НЕ ЗАКОНЧЕНО · 1» rule, the resume meta, «2 НОВЫХ», the red «НОВЫЙ», the tile date, «Прервано», and the empty progress track on new sets. Tiles merge count and themes into one caps line. The dashed «+ Попросить набор» tile goes; the header button covers it. Scope tiles shrink to one-line dashed strips.

```
Упражнения   [Попросить набор]

┌──────────────────────────────┐
│Верлан: основы                │
│━━━━━━━━━━━━━━━━━━────────────│
│▐Продолжить · 5 из 8        ›▌│
└──────────────────────────────┘
НАБОРЫ ────────────────────────
┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐
│Сленг на      ││Вечеринка     │
│каждый день   ││              │
│12 · ЛЮДИ,    ││8 · СВОЯ ТЕМА │
│ЭМОЦИИ        ││              │
└──────────────┘└──────────────┘
┌──────────────┐┌──────────────┐
│Деньги и      ││Работа над    │
│работа        ││ошибками      │
│10 · ДЕНЬГИ   ││8 · ИЗ ОШИБОК │
│          7/10││           8/8│
│━━━━━━━━━━━━━━││━━━━━━━━━━━━━━│
└──────────────┘└──────────────┘
┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
╎Трудные · 9 ⧉╎╎К повт. · 23 ⧉╎
Повторение Упражн. Добав. Библ.
```

Removed / hidden: Subline «5 НАБОРОВ · СОСТАВЛЕНЫ В ЧАТЕ»: removed; provenance stays in the empty state only; Rule «НЕ ЗАКОНЧЕНО» + «1»: removed; Resume meta «8 ВОПРОСОВ · ВЕРЛАН · ПРЕРВАНО 21.10»: removed (the count is in «5 из 8»); Note «2 НОВЫХ» on the НАБОРЫ rule: removed; the rule shows only when a resume card sits above it; Red «НОВЫЙ» label: removed (the 3px red band says it); Tile date «22.10»: moved to the SetMenuSheet title row (long press); «12 ВОПРОСОВ» + themes: merged into one line «12 · ЛЮДИ, ЭМОЦИИ»; «Прервано 5/8» on a tile: shortened to «5/8»; 2px track on new sets: drawn only when progress > 0; Dashed «+ Попросить набор» tile: removed (the header button does the same)

New visual / motion: None. Pure subtraction.

Brand conflicts: SPEC.md:336 says the list carries the schedule/provenance subline; SPEC.md:345: list subline, «НАБОРЫ · 2 НОВЫХ», tile anatomy (state + date, red НОВЫЙ, dashed last tile); SPEC.md:346: resume card meta «… · ПРЕРВАНО 21.10»

#### B · One ask, typographic index cards (M) — **рекомендуется**

Only one way to ask for a set: the header button. The scope tiles and the request tile leave the grid. «Трудные» and «К повторению» become the first chips of the request sheet, which remembers the last scope, so asking for difficult words again is 2 taps. The resume card becomes the grid's first full-width cell. It carries the player's tick row (5 of 8 inked) and a plain «Продолжить ›». No section rules. Tiles become typographic index cards: title Newsreader 22 on up to 3 lines, one quiet line «12 · Люди», and a state («7/10») only once she has played the set. New sets keep the red band only.

```
Упражнения   [Попросить набор]

┌──────────────────────────────┐
│Верлан: основы                │
│▮▮▮▮▮▯▯▯                      │
│▐Продолжить                 ›▌│
└──────────────────────────────┘
┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐
│Сленг         ││Вечеринка     │
│на каждый     ││              │
│день          ││              │
│              ││              │
│12 · Люди     ││8 · своя тема │
└──────────────┘└──────────────┘
┌──────────────┐┌──────────────┐
│Деньги        ││Работа над    │
│и работа      ││ошибками      │
│              ││              │
│10 · Деньги   ││8 · ошибки    │
│          7/10││           8/8│
│━━━━━━━━━━━━━━││━━━━━━━━━━━━━━│
└──────────────┘└──────────────┘
┌──────────────┐┌──────────────┐
│Арго: улица   ││Еда и кафе    │
Повторение Упражн. Добав. Библ.
```

Removed / hidden: Everything A removes; ScopeTile «Трудные слова» / «К повторению»: moved into the request sheet as its first chips (already exist as ScopeChips), preselected from the last request; RequestTile «+ Попросить набор»: removed; Both section rules («НЕ ЗАКОНЧЕНО», «НАБОРЫ»): removed; the full-width card with a black button marks the resume; Resume red line + «5 из 8» text: merged into one tick row; Themes list beyond the first theme: trimmed to the first theme (full list in SetMenuSheet)

New visual / motion: Resume tick row: 8 short ink ticks (answered = ink, rest = hairline outline), the same element as the player header (see the Player screen B). It shows continuity between list and player.; Tile title Newsreader 22/26 with up to 3 lines (text-wrap: balance): the tile reads as a typed index card; On return from the player, the tile you just played gets the §5.14 spotlight once (paper fade) instead of a new label

Brand conflicts: SPEC.md:345: tile anatomy, dashed last tile, section rule; SPEC.md:346: «НЕ ЗАКОНЧЕНО» section + «Продолжить · 5 из 8»; SPEC.md:358 requires the two dashed quick tiles in the list (removed here; the entry moves to the sheet). Asking for difficult words goes from 1 tap to 2 (open sheet with last scope remembered, then copy).; SPEC.md:345 tile title is Newsreader 19, two lines max

#### C · Paper stack catalogue (L)

Same structure as B, but every remaining number turns into an object. The set size becomes 1–3 hairline card edges peeking under the tile (8 → 1, 10–12 → 2, 16 → 3), so «12 вопросов» disappears. A finished set gets a small outlined rotated stamp «7/10», the player's Stamp at 11px mono, −4°. A run in progress shows tick marks along the tile's bottom. Tapping a tile morphs it into the player's question card (shared-element ViewTransition, as components/library/NavSlide.tsx already does).

```
Упражнения   [Попросить набор]

┌──────────────────────────────┐
│Верлан: основы        ▮▮▮▮▮▯▯▯│
│▐Продолжить                 ›▌│
└┬─────────────────────────────┘
 └─────────────────────────────┘
┌▀▀▀▀▀▀▀▀▀▀▀▀▀┐ ┌▀▀▀▀▀▀▀▀▀▀▀▀▀┐
│Сленг на     │ │Вечеринка    │
│каждый день  │ │             │
│             │ │             │
│Люди, Эмоции │ │Своя тема    │
└┬────────────┘ └┬────────────┘
 └┬────────────┘  └────────────┘
  └────────────┘
┌─────────────┐ ┌─────────────┐
│Деньги и     │ │Работа над   │
│работа       │ │ошибками     │
│      ⌈7/10⌋ │ │       ⌈8/8⌋ │
│Деньги       │ │Из ошибок    │
└┬────────────┘ └─────────────┘
 └┬────────────┘
  └────────────┘
Повторение Упражн. Добав. Библ.
```

Removed / hidden: Everything B removes; «12 ВОПРОСОВ» text: replaced by 1–3 stack edges (exact count in the SetMenuSheet meta and the aria-label); «7/10» ink label + full progress line on finished sets: replaced by the outlined stamp; Continuous 2px progress line: replaced by ticks for runs in progress

New visual / motion: Stack edges: 1px #d6d6d1 rules offset 4px down/right per edge, no shadow (MOTION-SPEC §1: depth from overlap and offset); Mini stamp «7/10»: 1.5px ink outline, radius 2, −4°, static (no landing animation in the list); Tile → player card shared-element morph via React <ViewTransition> (position/size only, --dur-turn 320, crossfade under reduced motion); Skeleton tile for an incoming set writes in: grey bars crossfade into the real title (--dur-enter), then the §5.14 spotlight

Brand conflicts: SPEC.md:345 tile anatomy (mono count line, state label, 2px progress line); SPEC.md:358 quick tiles removed (as in B); MOTION-SPEC §5.12 keeps stamps as the one daily delight; a static stamp on list tiles dilutes that motif; Stack edges approximate the size (10 and 12 look the same), so the exact count is one long-press away

**Why B:** B removes about 15 of the 34 first-paint items and leaves one way to ask for a set. Today three controls do that, and two of them look like set tiles but copy text. The grid then holds sets and nothing else. The resume card's tick row is the same element as the player header, so the screen is more visual without new vocabulary. C's stack edges and stamps are attractive, but they lose exact counts and spend the stamp motif on a list, so treat them as a later layer once B ships. A is the fallback if the quick tiles must stay.

Files: `components/exercises/ExercisesScreen.tsx:146-168 (drop the phone subline at :161)`, `components/exercises/ExercisesScreen.tsx:245-272 (drop SectionRule «Наборы» + note at :250; drop ScopeTile/RequestTile at :269-271; resume as the first grid cell)`, `components/exercises/ExercisesScreen.tsx:354-396 (ResumeCard: remove the «Не закончено» rule and meta, tick row instead of the red line, «Продолжить ›» without «5 из 8»)`, `components/exercises/SetTile.tsx:46-81 (title 22/3 lines, one meta line, no date, no «НОВЫЙ», ProgressLine only when progress > 0)`, `components/exercises/SetTile.tsx:83-123 (delete RequestTile and ScopeTile, or keep them for desktop only)`, `components/exercises/list-format.ts:80-92 (tileState: empty label for fresh sets, «5/8» instead of «Прервано 5/8»)`, `components/exercises/SetMenuSheet.tsx:28-31 (add the meta line «12 вопросов · Люди, Эмоции · 22.10»)`, `components/exercises/RequestBuilder.tsx (remember the last scope, preselect it in the sheet)`, `new components/exercises/ProgressTicks.tsx (shared tick row for list resume + player; reuse the tick drawing from components/review/ReviewTopBar.tsx:233-240)`, `mockups/SPEC.md:336,345,346,358`, `new board mockups/Exercise-List-D.dc.html (390×844)`

### List: waiting for a set after a copy (Exercise-S-Waiting) and offline (Exercise-S-Offline)

**Today:** About 30 elements. Waiting stacks a mono status line, a moving ink-run hairline, «Запрос: «вечеринка», 12 вопросов» and «⟳ Обновить» above the grid, plus a skeleton tile: four signals for one fact. Offline adds a 40px warning box that duplicates the header's «· Офлайн» mark. It also adds a sticky 90px bottom bar with «Скопировать» and a disabled «Открыть Claude · нужна сеть».

#### A · One status line (S)

Waiting becomes one line: «Ждём набор из чата» on the ink-run hairline, with a ⟳ icon button at its right. The «Запрос: …» row goes. Offline: no box and no bottom bar. The header SyncMark «· Офлайн» shows whenever the app is offline on this screen, and ⟳ disables offline.

```
Упражнения   [Попросить набор]

Ждём набор из чата            ⟳
━━━━━━────────────────────────
┌──────────────────────────────┐
│Верлан: основы                │
│▮▮▮▮▮▯▯▯                      │
│▐Продолжить                 ›▌│
└──────────────────────────────┘
┌──────────────┐┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐
│▒▒▒▒▒▒▒▒▒     ││Сленг         │
│▒▒▒▒▒         ││на каждый     │
│              ││день          │
│▒▒▒           ││12 · Люди     │
└──────────────┘└──────────────┘
┌──────────────┐┌──────────────┐
│Деньги        ││Работа над    │
│и работа      ││ошибками      │
│10 · Деньги   ││8 · ошибки    │
│          7/10││           8/8│
└──────────────┘└──────────────┘

Повторение Упражн. Добав. Библ.
```

Removed / hidden: «· обновится, когда вернётесь» tail: removed (it refreshes on return anyway); Row «Запрос: «вечеринка», 12 вопросов»: removed (echo of her own action); Text button «Обновить»: becomes a 44px ⟳ icon button with aria-label «Обновить»; Offline warning box: removed; the header SyncMark «· Офлайн» covers it; Offline sticky bar «ПОСЛЕДНИЙ ЗАПРОС» + «Скопировать» + disabled «Открыть Claude»: removed; the request sheet already says «нужна сеть»

New visual / motion: None beyond the existing ink run

Brand conflicts: SPEC.md:346 (Waiting: status line + «Запрос:» + «Обновить»; Offline: warning box + bottom bar)

#### B · The set is written where it will appear (S) — **рекомендуется**

No status block at all. The skeleton tile at the head of the grid is the whole waiting state. The ink run moves along its top rule, it says «Ждём из чата», and a tap on it refreshes (small ⟳ glyph in its corner). When the set syncs, the bars crossfade into the real title in place. Offline shows only the header mark. While offline the skeleton says «Придёт, когда будет сеть».

```
Упражнения · Офлайн
                 [Попросить набор]
┌──────────────────────────────┐
│Верлан: основы                │
│▮▮▮▮▮▯▯▯                      │
│▐Продолжить                 ›▌│
└──────────────────────────────┘
┌━━━━━─────────┐┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐
│Ждём из чата  ││Сленг         │
│▒▒▒▒▒▒▒▒▒     ││на каждый     │
│▒▒▒▒▒         ││день          │
│             ⟳││12 · Люди     │
└──────────────┘└──────────────┘
┌──────────────┐┌──────────────┐
│Деньги        ││Работа над    │
│и работа      ││ошибками      │
│10 · Деньги   ││8 · ошибки    │
│          7/10││           8/8│
└──────────────┘└──────────────┘
┌──────────────┐┌──────────────┐
│Арго: улица   ││Еда и кафе    │

Повторение Упражн. Добав. Библ.
```

Removed / hidden: Everything A removes; The status line and its hairline above the grid: folded into the skeleton tile's top rule; The ⟳ button: the whole skeleton tile is the refresh control (⟳ glyph kept as the affordance)

New visual / motion: Ink run (existing animate-[ink-run]) moves along the skeleton tile's top edge instead of a separate hairline: one honest sign of life (MOTION-SPEC §1.5); On arrival: bars crossfade to the title over --dur-enter, then the §5.14 spotlight on that tile; no slide, no bounce; Under reduced motion the ink run stops and the tile just reads «Ждём из чата»

Brand conflicts: SPEC.md:346 waiting and offline anatomy; MOTION-SPEC §3.4 'the status line (one per waiting region)': the region is now the tile itself

#### C · Status lives in the ask button (M)

The header button that started the request carries its state. «Попросить набор» turns into «Ждём набор… ⟳» with the ink run under it, and a tap refreshes. The grid stays unchanged with no skeleton. Offline adds a dashed muted underline under «Упражнения» instead of any box.

```
Упражнения     ┌──────────────┐
               │Ждём набор…  ⟳│
               └━━━━──────────┘
┌──────────────────────────────┐
│Верлан: основы                │
│▮▮▮▮▮▯▯▯                      │
│▐Продолжить                 ›▌│
└──────────────────────────────┘
┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐
│Сленг         ││Вечеринка     │
│на каждый     ││              │
│день          ││              │
│12 · Люди     ││8 · своя тема │
└──────────────┘└──────────────┘
┌──────────────┐┌──────────────┐
│Деньги        ││Работа над    │
│и работа      ││ошибками      │
│10 · Деньги   ││8 · ошибки    │
│          7/10││           8/8│
└──────────────┘└──────────────┘

Повторение Упражн. Добав. Библ.
```

Removed / hidden: Everything A removes; Skeleton tile: removed; While waiting, asking for another set takes a long press on the button or the sheet's own entry

New visual / motion: Ink run under the header button; Offline: 1px dashed muted underline under the h1

Brand conflicts: SPEC.md:346; SPEC.md:345 header button is always «Попросить набор»; making it a status hides the ask while waiting (a second ask then takes 2 taps)

**Why B:** The waiting state is about where the set will land, so the skeleton tile is the most honest single signal. It removes about 100px of status chrome and four duplicate signals, and the arrival crossfade gives the 'dynamic' moment without new decoration. Offline becomes one muted header word, which matches reality: every set still plays. C hides the main ask while waiting; A is the safe fallback.

Files: `components/exercises/ExercisesScreen.tsx:170-180 (delete offlineStrip; render SyncMark offline state instead)`, `components/exercises/ExercisesScreen.tsx:182-211 (delete waitingLine; move refresh onto the skeleton tile)`, `components/exercises/ExercisesScreen.tsx:252 (waiting skeleton becomes the interactive WaitingTile)`, `components/exercises/ExercisesScreen.tsx:287, :398-428 (delete OfflineRequestBar on phones)`, `components/exercises/SetTile.tsx:126-136 (SetTileSkeleton → WaitingTile variant with ink run on the top rule, label, tap to refresh)`, `components/library/SyncMark.tsx:43-49 (show «· Офлайн» on this screen whenever offline)`, `mockups/SPEC.md:346`, `mockups/MOTION-SPEC.md §3.4 (note the tile-as-status exception)`, `update boards mockups/Exercise-S-Waiting.dc.html and mockups/Exercise-S-Offline.dc.html`

### List: empty state with the inline request builder (Exercise-Empty-A)

**Today:** 24 elements. An h2 and a 2–3 line paragraph come first. Then a card with «ОТКУДА СЛОВА» and 4 scope chips (2 rows), «ТЕМЫ» and wrapping theme chips with «+ своя тема», «Вопросов 8/12/16», «Можно новые слова» with a caption and toggle, «ЗАПРОС» and a 4-line mono box, and a focus line. «Скопировать запрос» sits at or below the fold, «Открыть Claude ↗» and «Коннектор не подключён?» below it. The one action is buried under about 14 rows of configuration.

#### A · Tightened card (M)

Keep the builder card and remove its excess. The intro shrinks to one line. Scope and themes merge into one chip flow («Трудные 9», «К повторению 23» first, mutually exclusive with themes; «Оба» dropped). The new-words caption and the focus line go. The request text folds under «Текст запроса ›». One merged CTA «Скопировать и открыть Claude ↗» with a quiet «только скопировать» link under it.

```
Упражнения

Наборы пишет Claude — выберите
темы.
┌──────────────────────────────┐
│[Трудные 9][К повторению 23]  │
│[✓Входящие][Люди][Эмоции]     │
│[Деньги][Еда][+ своя тема]    │
│──────────────────────────────│
│Вопросов          [8|12|16]   │
│──────────────────────────────│
│Можно новые слова        (●─) │
│──────────────────────────────│
│Текст запроса ›               │
└──────────────────────────────┘
▐Скопировать и открыть Claude ↗▌
      только скопировать

Коннектор не подключён? ›


Повторение Упражн. Добав. Библ.
```

Removed / hidden: h2 «Упражнений пока нет» + paragraph: one line «Наборы пишет Claude — выберите темы.»; Labels «ОТКУДА СЛОВА» and «ТЕМЫ»: removed; one chip flow; Chip «Темы» (meant 'use the chips below') and chip «Оба 28»: removed («Оба» stays possible in chat); Scope caption paragraph: removed (the chip name says it); Caption «Claude поищет их в вебе»: removed; Focus line «Чаще трудные · половина набора · Настройки ›»: removed (Settings › Упражнения only); Mono request box: folded behind «Текст запроса ›»; opens automatically when the clipboard write fails; «Скопировать запрос» + «Открыть Claude ↗»: merged into one primary; «только скопировать» as a text link

New visual / motion: Primary turns into ✓ «Скопировано» for 2 s (existing copiedAt state)

Brand conflicts: SPEC.md:347 (builder anatomy: labels, captions, request box, two CTAs); SPEC.md:355 (focus line under «Запрос» on page, sheet and panel); SPEC.md:357 («ОТКУДА СЛОВА» radiogroup with «Темы» and «Оба»)

#### B · Three decisions, rest under «Ещё» (M) — **рекомендуется**

Drop the card container (whitespace instead of a box). Show what she decides each time: where the words come from (one chip flow) and how many. «+ своя тема», «Можно новые слова» (default on) and «Текст запроса» fold under one «Ещё ›» row, a single disclosure level. The merged CTA sits right after the size row, so it is above the fold on a 844px phone.

```
Упражнения

Наборы пишет Claude в чате.
Из чего составить?

[Трудные 9][К повторению 23]
[Входящие][Люди][Эмоции]
[Деньги][Еда и кафе][Арго]

Вопросов             [8|12|16]
────────────────────────────────
Ещё: своя тема, новые слова  ›
────────────────────────────────

▐Скопировать и открыть Claude ↗▌
       только скопировать

Коннектор не подключён? ›





Повторение Упражн. Добав. Библ.
```

Removed / hidden: Everything A removes; Builder card border and background: removed (hairline rows only); «+ своя тема» chip, «Можно новые слова» toggle and «Текст запроса»: one tap away under «Ещё ›»

New visual / motion: «Ещё» expands in place (Collapse, --dur-move); interpolate-size where supported, instant open on Safari; On copy the CTA swaps to ✓ «Скопировано» and the page moves to the B-waiting tile when she returns

Brand conflicts: SPEC.md:347, 355, 357 as in A; SPEC.md D7 pick (Exercise-Empty-A: 'the request builder card sits on the page'): the card frame goes

#### C · The card fills as she chooses (L)

Built on B. A blank index card with a red dashed header rule sits at the top. Each picked theme files into it as a small ink-outlined tab along its top edge, and the card's single line reads «Люди, Эмоции · 12». «Вопросов» is three tappable paper stacks of 1/2/3 hairline edges, and the chosen one is inked. On copy, a folded slip lifts out of the card and fades.

```
Упражнения
Наборы пишет Claude — выберите.

  ┌Люди┐┌Эмоции┐
┌─┴────┴┴──────┴───────────────┐
│╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍│
│ Люди, Эмоции · 12 вопросов   │
└──────────────────────────────┘

[Трудные 9][К повторению 23]
[Входящие][✓Люди][✓Эмоции]
[Деньги][Еда и кафе][Арго]

Вопросов   ▭      ▭▭     ▭▭▭
           8      12      16
                  ‾‾
Ещё: своя тема, новые слова  ›

▐Скопировать и открыть Claude ↗▌
       только скопировать
Коннектор не подключён? ›

Повторение Упражн. Добав. Библ.
```

Removed / hidden: Everything B removes; Segmented 8/12/16: replaced by stack glyphs (radiogroup, each a 64px target with its number under it)

New visual / motion: Theme tabs appear on the card's top edge on pick (opacity + 4px rise, --dur-enter) and leave on unpick (--dur-exit); Size stacks: 1/2/3 offset hairline rectangles; chosen = ink outline, others #d6d6d1; Copy: a slip translateY −8px + fade 160ms (paper motion), CTA → ✓ «Скопировано»

Brand conflicts: SPEC.md:347, 355, 357; MOTION-SPEC §5.9 defines the segmented ink slab; stacks would be a new control; Extra visual on a screen seen rarely (empty state): spends the 'novelty budget' on a first-run screen

**Why B:** The screen's one job is to get a request into Claude. B puts the merged CTA above the fold after two decisions (what and how many) and keeps every option one tap away under a single «Ещё», which is the NN/g two-level limit. It also shares one implementation with the request sheet, so both surfaces get simpler at once. C is charming but spends visual budget on a screen she sees only before her first set.

Files: `components/exercises/ExercisesScreen.tsx:233-244 (one-line intro, drop h2 + paragraph)`, `components/exercises/RequestBuilder.tsx:160-175 (remove «Откуда слова» label + scope caption; one chip flow)`, `components/exercises/RequestBuilder.tsx:176-209 (remove «Темы» label/aside; theme chips follow scope chips; «+ своя тема» moves under «Ещё»)`, `components/exercises/RequestBuilder.tsx:162, 260-283 (drop newCaption; toggle under «Ещё»)`, `components/exercises/RequestBuilder.tsx:285-310 (fold request text; delete focus line)`, `components/exercises/RequestBuilder.tsx:313-337 (merged primary «Скопировать и открыть Claude ↗» + «только скопировать» link)`, `components/exercises/RequestBuilder.tsx:394-475 (ScopeChips: drop «Темы» and «Оба», become toggle chips in the same flow)`, `lib/core (buildRequestText / SCOPE_CAPTIONS consumers; keep «Оба» support for chat-built sets)`, `mockups/SPEC.md:347,355,357 and D7 pick at :344`, `new board mockups/Exercise-Empty-D.dc.html`

### Request sheet «Попросить набор» (Exercise-S-Request-Sheet)

**Today:** 18 elements. The title and ×. «ОТКУДА СЛОВА» with 4 chips and counts. «ТЕМЫ · МОЖНО НЕСКОЛЬКО» with counted theme chips. «Вопросов». The new-words toggle with the caption «до 8 в наборе». «ЗАПРОС» in a mono box, then the focus line, «Скопировать запрос» (needs a scroll), «Открыть Claude ↗» and «Нет коннектора? ›».

#### A · Same sheet, fewer words (S)

Keep today's structure, but remove the counts on theme chips, the «МОЖНО НЕСКОЛЬКО» aside, the «до 8 в наборе» caption, the focus line and «Нет коннектора?». Pin «Скопировать запрос» to the sheet's bottom edge on a hairline.

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
╭──────────────────────────────╮
│ Попросить набор            × │
│ ОТКУДА СЛОВА                 │
│[Темы][Трудные 9][К повт. 23] │
│[Оба 28]                      │
│ ТЕМЫ                         │
│[Входящие][✓Люди][Эмоции]     │
│[Деньги][Еда][+ своя тема]    │
│──────────────────────────────│
│ Вопросов         [8|12|16]   │
│──────────────────────────────│
│ Можно новые слова       (●─) │
│──────────────────────────────│
│ ЗАПРОС                       │
│┌────────────────────────────┐│
││Сделай упражнение в         ││
││Карточках на тему «люди»,   ││
││12 вопросов, можно новые.   ││
│└────────────────────────────┘│
│──────────────────────────────│
│▐   Скопировать запрос       ▌│
│  Открыть Claude ↗            │
╰──────────────────────────────╯
```

Removed / hidden: Word counts on theme chips («Люди 34»); Aside «МОЖНО НЕСКОЛЬКО»; Caption «Claude поищет их в вебе, до 8 в наборе»; Focus line «… · Настройки ›»; «Нет коннектора? ›» (shown only in the empty state)

New visual / motion: Pinned footer: CTA always visible while the sheet scrolls

Brand conflicts: SPEC.md:347 (chips with counts, caption, «Нет коннектора? ›»); SPEC.md:355 (focus line)

#### B · Medium-detent sheet, one chip flow (M) — **рекомендуется**

The same component as Empty B, in a medium-detent sheet with a grabber. One chip flow (Трудные / К повторению / themes / + своя тема), the last-used scope preselected, then size and «Ещё ›». One black CTA «Скопировать и открыть Claude ↗» is pinned at the bottom, with «только скопировать» under it. It fits without scrolling.

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
╭──────────────────────────────╮
│             ───              │
│ Попросить набор            × │
│                              │
│[Трудные 9][К повторению 23]  │
│[Входящие][✓Люди][Эмоции]     │
│[Деньги][Еда и кафе][Арго]    │
│[+ своя тема]                 │
│                              │
│ Вопросов          [8|12|16]  │
│──────────────────────────────│
│ Ещё: новые слова, текст    › │
│──────────────────────────────│
│                              │
│▐Скопировать и открыть Claude↗▌│
│      только скопировать      │
╰──────────────────────────────╯
```

Removed / hidden: Everything A removes; Labels «ОТКУДА СЛОВА», «ТЕМЫ»; chips «Темы» and «Оба»; «Можно новые слова» toggle and the request text: under «Ещё ›»; Two CTAs merged into one

New visual / motion: Grabber + medium detent (HIG), drag up to large when «Ещё» opens; Chip select = ink fill crossfade --dur-quick (existing §5.8)

Brand conflicts: SPEC.md:347, 355, 357; SPEC.md:347 says «Скопировать запрос» is primary and «Открыть Claude ↗» separate; merged here

#### C · Mode tint + size in the button (M)

Built on B. Choosing «Трудные» or «К повторению» switches the sheet into a visible mode: the sheet's top rule turns red and the theme chips dim out, instead of a caption paragraph. The CTA carries the chosen size as a tiny stack glyph («▭▭ 12»), so the size row can collapse into the button's long-press.

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
│             ───              │
│ Попросить набор            × │
│                              │
│[■Трудные 9][К повторению 23] │
│┈Входящие┈┈Люди┈┈Эмоции┈      │
│┈Деньги┈┈Еда и кафе┈┈Арго┈    │
│                              │
│ Вопросов          [8|12|16]  │
│──────────────────────────────│
│ Ещё: текст запроса         › │
│──────────────────────────────│
│                              │
│▐Скопировать · ▭▭ 12 · Claude↗▌│
│      только скопировать      │
╰──────────────────────────────╯
```

Removed / hidden: Everything B removes; Scope caption: replaced by the red top rule + dimmed theme chips

New visual / motion: Top rule ink → red crossfade --dur-quick when a scope chip is picked; Theme chips fade to 40% (disabled, aria-disabled) instead of disappearing, so the layout doesn't jump (MOTION-SPEC §1.4)

Brand conflicts: SPEC.md:357 (non-theme choice hides theme chips and shows a caption); Red reserved for meaning (new / attention): a red rule for 'difficult words mode' stretches that

**Why B:** B gives one surface and one component for page and sheet. The CTA is always visible without scrolling, and the most common repeat (difficult words) is preselected, so a repeat ask is 2 taps: open, then copy-and-open. C's mode tint is a nice touch, but it adds a red meaning and keeps clutter in the dimmed chips.

Files: `components/exercises/RequestSheet.tsx:28-45 (medium detent, grabber, pinned footer for the CTA, drop onHelp)`, `components/exercises/RequestBuilder.tsx:160-339 (shared changes from the empty state B; variant 'sheet' no longer shows counts/aside/«Нет коннектора?»)`, `components/exercises/RequestBuilder.tsx:394-475 (ScopeChips merged into the chip flow; last scope preselected)`, `components/ui/Sheet.tsx (medium detent + sticky footer slot, if not already supported)`, `mockups/SPEC.md:347,355,357`, `update board mockups/Exercise-S-Request-Sheet.dc.html and mockups/Exercise-S-Request-Scope.dc.html`

### Set menu sheet (long press on a tile) and Connector help sheet

**Today:** SetMenu shows only the title and three rows (Начать/Продолжить, Скопировать запрос на похожий, Удалить). ConnectorHelp has an intro, three numbered steps each with a visual and a caption, a sync note, and «Понятно». Density is low (4), but SetMenu is the natural home for the metadata taken off the tiles.

#### A · Menu gets the meta, help loses captions (S) — **рекомендуется**

SetMenu gains one mono line under the title: «12 вопросов · Люди, Эмоции · 22.10». It now carries what the tiles dropped. ConnectorHelp keeps the step titles and visuals, cuts the captions and the sync note to one line each (or drops them), and shortens the intro to one sentence.

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
╭──────────────────────────────╮
│ Сленг на каждый день       × │
│ 12 ВОПРОСОВ · ЛЮДИ, ЭМОЦИИ · │
│ 22.10                        │
│──────────────────────────────│
│ ›  Начать                    │
│ ⧉  Скопировать запрос на     │
│    похожий                   │
│ ⌫  Удалить                   │
╰──────────────────────────────╯

╭──────────────────────────────╮
│ Как подключить коннектор   × │
│ ① claude.ai › Настройки ›    │
│   Коннекторы › Добавить свой │
│ ② Вставьте адрес коннектора  │
│   ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐   │
│   ╎ адрес — у владельца  ╎   │
│   └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘   │
│ ③ В чате: Инструменты ›      │
│   Карточки ✓                 │
│▐          Понятно           ▌│
╰──────────────────────────────╯
```

Removed / hidden: ConnectorHelp intro paragraph: one sentence or none; Captions under steps 2 and 3: removed; Sync note «Набор приходит при следующей синхронизации…»: removed (B-waiting tile shows it)

New visual / motion: None

Brand conflicts: None for SetMenu (SPEC.md:345 lists only the actions; the meta line is additive); Exercise-S-Connector-Help board copy changes

#### B · Connector steps as cards (M)

SetMenu as in A. ConnectorHelp turns into three small index cards with a red header rule each, swiped horizontally, one step per card. A «Дальше» button advances and becomes «Понятно» on the last card, with ▪▫▫ position marks.

```
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
╭──────────────────────────────╮
│ Как подключить коннектор   × │
│                              │
│ ┌──────────────────────────┐ │
│ │━━━━━━━━━━━━━━━━━━━━━━━━━━│ │
│ │ ШАГ 1 ИЗ 3               │ │
│ │                          │ │
│ │ Откройте настройки       │ │
│ │ claude.ai › Настройки ›  │ │
│ │ Коннекторы › Добавить    │ │
│ │ свой                     │ │
│ └──────────────────────────┘ │
│            ▪ ▫ ▫             │
│                              │
│▐          Дальше            ▌│
╰──────────────────────────────╯
```

Removed / hidden: As in A, plus the ruled list layout

New visual / motion: Card swipe with the review card's paper physics (translateX, no bounce); button fallback

Brand conflicts: A pager is a new pattern for a one-time sheet; more code than value

**Why A:** This screen is already light. The useful change is to give the metadata removed from tiles a home one long press away. A does that at S effort and also trims the help copy. B adds a new pattern to a sheet she opens once.

Files: `components/exercises/SetMenuSheet.tsx:24-31 (new meta prop + mono line under SheetTitle)`, `components/exercises/ExercisesScreen.tsx (pass «12 вопросов · themes · date» to SetMenuSheet)`, `components/exercises/ConnectorHelpSheet.tsx:27-29 (intro), :45-64 (captions + sync note)`, `update board mockups/Exercise-S-Connector-Help.dc.html`

### Player: question (choice; same chrome for cloze / register)

**Today:** 16 elements. Above the card: ×, the progress hairline, mono «07 / 12» (+ «+1» after a requeue) and the mono line «УПРАЖНЕНИЕ · НЕ ВЛИЯЕТ НА РАСПИСАНИЕ». The card has a skill label with direction («ЗНАЧЕНИЕ · FR → RU»), a ПОВТОР tag, the slang meter, the prompt, a question line, «Ошиблись раньше — ещё раз» and the footer «НАБОР: … · ИЗ ЧАТА». Below it, four tiles with mono digits 1–4, then a 200px zone with «Не знаю».

#### A · Chrome diet, same layout (S)

Remove the text that never changes. The schedule line, the card footer, the mono digits in phone tiles, the «· FR → RU» code, the cloze question «Какое слово пропущено?» and the repeat line all go. Keep the hairline and a plain «7/12» (no zero-padding, no «+1»). The card gains 44 + 20px of height.

```
×  ━━━━━━━━━━━───────────  7/12

┌──────────────────────────────┐
│СИТУАЦИЯ            ▮▮▯▯ fam. │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                              │
│ Друг рассказывает про        │
│ вчерашний концерт: было      │
│ просто потрясающе.           │
│                              │
│ Как он скажет?               │
│                              │
└──────────────────────────────┘
┌──────────────┐┌──────────────┐
│              ││              │
│C'était ouf   ││chelou        │
│              ││              │
└──────────────┘└──────────────┘
┌──────────────┐┌──────────────┐
│              ││              │
│relou         ││la galère     │
│              ││              │
└──────────────┘└──────────────┘

            Не знаю
```

Removed / hidden: Mono line «УПРАЖНЕНИЕ · НЕ ВЛИЯЕТ НА РАСПИСАНИЕ»: said once on the Done screen meta («· не влияет на расписание») and in the empty state; Card footer «НАБОР: СЛЕНГ НА КАЖДЫЙ ДЕНЬ · ИЗ ЧАТА»: removed on phones (desktop running head keeps the set title); Mono digits 1–4 in phone tiles: removed (md: Kbd caps stay); «· FR → RU» / «· RU → FR» in the header label: removed; the question sentence says it; Cloze question «Какое слово пропущено?»: removed; the dashed gap asks; Repeat line «↺ Ошиблись раньше — ещё раз» and counter «+1»: removed; the ПОВТОР tag stays; Zero padding «07 / 12» → «7/12»

New visual / motion: «Не знаю» centred vertically in the 200px zone instead of at its bottom

Brand conflicts: SPEC.md:336 and :348 (schedule line on every player screen); SPEC.md:348 (footer «НАБОР: … · ИЗ ЧАТА», skill labels with direction, «+1»); SPEC.md:349 (mono index 1–4 on tiles); SPEC.md:350 (requeue line «Ошиблись раньше — ещё раз»)

#### B · Tick row + headword hero (M) — **рекомендуется**

A, plus the top row becomes × and one row of short ticks: answered = ink, current = red, remaining = hairline. A requeued item appends a hollow tick at the end. That replaces both the hairline and «7/12». The prompt headword grows to fit the width (Newsreader 48–56, opsz auto), so the word is the image. The card header keeps only the skill word («ЗНАЧЕНИЕ», «ПРОПУСК») and the meter.

```
×  ▮▮▮▮▮▮▮▯▯▯▯▯

┌──────────────────────────────┐
│ЗНАЧЕНИЕ            ▮▮▯▯ fam. │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                              │
│                              │
│  relou                       │
│                              │
│  Что это значит?             │
│                              │
│                              │
└──────────────────────────────┘
┌──────────────┐┌──────────────┐
│              ││              │
│надоедливый   ││странный      │
│              ││              │
└──────────────┘└──────────────┘
┌──────────────┐┌──────────────┐
│              ││              │
│офигенный     ││тяжёлый       │
│              ││              │
└──────────────┘└──────────────┘

            Не знаю
```

Removed / hidden: Everything A removes; Hairline + «7/12» counter: replaced by the tick row (exact «7 из 12» stays in the progressbar aria and on tap of the row → small tooltip)

New visual / motion: Tick row: N ticks 3px tall, gap 3px, flex to the row's width (16 + requeues fit in 300px); answered ink, current red, a requeue appends a hollow tick. Each «Дальше» steps one tick ink as a plain swap (§5.5: no count-up, no sequence); Headword clamp(40px, 13vw, 56px), text-wrap: balance, font-optical-sizing:auto; Requeued item: its tick reappears hollow at the end, the visual twin of the ПОВТОР tag

Brand conflicts: All of A's; SPEC.md:348 (progress hairline with red fill + mono counter); MOTION-SPEC §5.5 (progress line scaleX + counter swap): needs a 'tick row' variant; SPEC.md:348 headword size (review card prompt 40)

#### C · The deck is the progress (M)

No progress element at the top, only ×. The card sits on a visible deck: 1–3 hairline edges under it (one edge per 4 questions left) that thin out as she advances. After the answer, a tap anywhere on the card advances too. The card-to-card swap reads as 'the top card is set aside'.

```
×

┌──────────────────────────────┐
│ПРОПУСК  [ПОВТОР]             │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                              │
│ J'ai trop ╌╌╌╌╌╌ ce film,    │
│ je le reverrai !             │
│                              │
│ О фильме, который вчера      │
│ посмотрели.                  │
│                              │
└┬─────────────────────────────┘
 └┬────────────────────────────┘
  └────────────────────────────┘
┌──────────────┐┌──────────────┐
│kiffé         ││bouffé        │
│              ││              │
└──────────────┘└──────────────┘
┌──────────────┐┌──────────────┐
│galéré        ││flippé        │
│              ││              │
└──────────────┘└──────────────┘

            Не знаю
```

Removed / hidden: Everything A removes; Hairline and counter: removed; progress = deck thickness (exact count in aria only)

New visual / motion: Deck edges: 1px rules offset 4px, count = min(ceil(left/4), 3); the last edge disappears with the final 4 questions; Swap: outgoing card −24px + fade (existing ex-exit), one edge vanishes as the next card settles (--spring-settle 350); Tap-on-card advances after the answer (in addition to «Дальше»)

Brand conflicts: All of A's; SPEC.md:348 progress line + counter removed entirely; Deck edges are imprecise: she can't tell 5 left from 7 left, which some learners want mid-set

**Why B:** B leaves two things above the card (exit and progress) and makes the progress readable at a glance without digits. The same tick row appears on the list's resume card and the Done ticket, so it becomes the screen family's one visual vocabulary. The bigger headword gives the card a strong focal point. C drops exact progress, and A alone stays text-led. Note that the schedule disclaimer moves to the Done meta and the empty state, which needs a SPEC edit.

Files: `components/exercises/ExercisePlayer.tsx:589-615 (phone header: × + ProgressTicks; delete the mono schedule line at :614)`, `components/exercises/ExercisePlayer.tsx:556-578 (counter/bar: phones use ticks; keep desktop running head as is)`, `components/exercises/ExercisePlayer.tsx:526-552 (centre «Не знаю» in the zone)`, `components/exercises/QuestionCard.tsx:192-204 (header label without detail/direction on phones; keep ПОВТОР)`, `components/exercises/QuestionCard.tsx:75-93 (Prompt: fit-to-width headword on phones)`, `components/exercises/QuestionCard.tsx:147-152 (drop cloze question on phones)`, `components/exercises/QuestionCard.tsx:215-220 (drop the repeat line)`, `components/exercises/QuestionCard.tsx:223-229 (footer: md only)`, `components/exercises/OptionGrid.tsx:317-322 (mono index: md only)`, `lib/core/exercises.ts:58 (CLOZE_PROMPT no longer rendered on phones)`, `new components/exercises/ProgressTicks.tsx (shared with the list resume card and Done)`, `mockups/SPEC.md:336,348,349,350`, `mockups/MOTION-SPEC.md §5.5 and §5.15 'Next' row (tick step instead of line + counter)`, `update boards mockups/Exercise-S-Choice.dc.html, Exercise-S-Cloze.dc.html, Exercise-S-Register.dc.html, Exercise-S-Requeue.dc.html`

### Player: pairs (Exercise-S-Pairs)

**Today:** 17 elements: the player chrome (×, hairline, «07 / 12», schedule line), the card header «ПАРЫ · 2 ИЗ 5», the prompt «Соедини слово и перевод», 10 tiles (matched ones faded with a good border and a check), the footer «НАБОР … ИЗ ЧАТА», and «Не знаю», which reaches the fold.

#### A · Board only (S)

With the player B chrome, the card holds just the label «ПАРЫ» and the two columns. «· 2 ИЗ 5», the prompt sentence and the footer go. Matched tiles keep today's muted + check look. «Не знаю» comes back above the fold.

```
×  ▮▮▮▮▮▮▮▮▯▯▯▯

┌──────────────────────────────┐
│ПАРЫ                          │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                              │
│┌────────────┐ ┌────────────┐ │
││relou       │ │бабки       │ │
│└────────────┘ └────────────┘ │
│┌┈┈┈┈┈┈┈┈┈┈┈┈┐ ┌┈┈┈┈┈┈┈┈┈┈┈┈┐ │
│┊chelou     ✓┊ ┊странный   ✓┊ │
│└┈┈┈┈┈┈┈┈┈┈┈┈┘ └┈┈┈┈┈┈┈┈┈┈┈┈┘ │
│┏━━━━━━━━━━━━┓ ┌────────────┐ │
│┃la thune    ┃ │надоедливый │ │
│┗━━━━━━━━━━━━┛ └────────────┘ │
│┌────────────┐ ┌────────────┐ │
││ouf         │ │вечеринка   │ │
│└────────────┘ └────────────┘ │
│┌────────────┐ ┌────────────┐ │
││la teuf     │ │офигенный   │ │
│└────────────┘ └────────────┘ │
└──────────────────────────────┘

            Не знаю
```

Removed / hidden: «· 2 ИЗ 5» in the header: removed (faded tiles show it); Prompt «Соедини слово и перевод»: removed; the label «ПАРЫ» + two-column layout explain it; Footer «НАБОР … ИЗ ЧАТА» and schedule line: removed (as in Player A)

New visual / motion: None beyond the player chrome

Brand conflicts: SPEC.md:348 (footer, schedule line); SPEC.md:350 (Exercise-S-Pairs anatomy)

#### B · Matched pairs become ink on paper (S) — **рекомендуется**

A, plus a found pair stops looking like buttons. Both tiles flash the good tone (70ms), then lose their borders and settle as muted text on the card, with a 1px good-tone underline drawn under each word. The board visibly empties of controls while the positions stay fixed, so no target moves. No check icons.

```
×  ▮▮▮▮▮▮▮▮▯▯▯▯

┌──────────────────────────────┐
│ПАРЫ                          │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                              │
│┌────────────┐ ┌────────────┐ │
││relou       │ │бабки       │ │
│└────────────┘ └────────────┘ │
│                              │
│ chelou          странный     │
│ ‾‾‾‾‾‾          ‾‾‾‾‾‾‾‾     │
│┏━━━━━━━━━━━━┓ ┌────────────┐ │
│┃la thune    ┃ │надоедливый │ │
│┗━━━━━━━━━━━━┛ └────────────┘ │
│┌────────────┐ ┌────────────┐ │
││ouf         │ │вечеринка   │ │
│└────────────┘ └────────────┘ │
│┌────────────┐ ┌────────────┐ │
││la teuf     │ │офигенный   │ │
│└────────────┘ └────────────┘ │
└──────────────────────────────┘

            Не знаю
```

Removed / hidden: Everything A removes; Check icon + 55% opacity on matched tiles: replaced by borderless muted text with a drawn underline (sr-only «найдено» stays)

New visual / motion: Match: good fill 70ms → border fades out (--dur-quick) → 1px good underline draws left→right (scaleX, 200ms linear); Miss keeps today's ex-miss flash (no shake: MOTION-SPEC §5.15 forbids it)

Brand conflicts: SPEC.md:350 («matched pairs fade to good with a check»)

**Why B:** Both cut the same noise. B adds one quiet 'ink' gesture that shows progress on the board itself and leaves fewer button outlines as she works, all inside the motion spec at S effort.

Files: `components/exercises/QuestionCard.tsx:169-176 (drop PAIRS_PROMPT on phones)`, `components/exercises/QuestionCard.tsx:197 and components/exercises/ExercisePlayer.tsx:506 (stop passing pairsCount on phones)`, `components/exercises/MatchPairs.tsx:33 (matched look: borderless muted text + underline)`, `components/exercises/MatchPairs.tsx:65-70 (replace the check icon with the drawn underline; keep sr-only «найдено»)`, `components/exercises/ExercisePlayer.tsx:77-83 (EXERCISE_CSS: add ex-underline keyframe)`, `mockups/SPEC.md:350`, `update board mockups/Exercise-S-Pairs.dc.html`

### Player: new-word intro card (Exercise-S-NewWord)

**Today:** 14 elements: the player chrome, the header «НОВОЕ СЛОВО · ИЗ ВЕБА» + meter, the headword, POS, translation, note and example, «Слова ещё нет в библиотеке. Добавить его можно на экране итогов.», the footer «ИСТОЧНИК: LALANGUEFRANCAISE.COM», «Понятно», and «НАБОР: … · ВОПРОС — СЛЕДУЮЩИМ» under it.

#### A · Learn the word, nothing else (S) — **рекомендуется**

The card keeps the headword, POS, translation, note and example. The library sentence moves to the Done screen, which already offers the add. The source footer folds into a tap on «ИЗ ВЕБА ›», which shows the domain in a tooltip or link. The mono line under «Понятно» goes.

```
×  ▮▮▮▮▮▮▯▯▯▯▯▯

┌──────────────────────────────┐
│НОВОЕ СЛОВО · ИЗ ВЕБА › ▮▮▯▯  │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                              │
│ la teuf                      │
│ n. f.                        │
│                              │
│ вечеринка, тусовка           │
│ верлан от fête               │
│                              │
│──────────────────────────────│
│ On fait une teuf samedi ?    │
│ Устроим тусовку в субботу?   │
│                              │
│                              │
│                              │
└──────────────────────────────┘



▐           Понятно            ▌
```

Removed / hidden: «Слова ещё нет в библиотеке. Добавить его можно на экране итогов.»: removed (Done screen handles adding); Footer «ИСТОЧНИК: LALANGUEFRANCAISE.COM»: behind a tap on «ИЗ ВЕБА ›»; «НАБОР: Вечеринка · ВОПРОС — СЛЕДУЮЩИМ»: removed

New visual / motion: None

Brand conflicts: SPEC.md:350 (NewWord anatomy lists the library sentence and «ИСТОЧНИК: …»)

#### B · Dashed rule = 'not yet yours', swipe to go on (M)

A, plus the card's red header rule is dashed instead of solid. 'New, not in your library' then reads at a glance, and the label shortens to «НОВОЕ · ИЗ ВЕБА ›». The headword grows to the player B hero size. «Понятно» can also be a swipe left on the card: the card exits left as on «Дальше». The button stays.

```
×  ▮▮▮▮▮▮▯▯▯▯▯▯

┌──────────────────────────────┐
│НОВОЕ · ИЗ ВЕБА ›       ▮▮▯▯  │
│╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍╍│
│                              │
│                              │
│ la teuf                      │
│ n. f.                        │
│                              │
│ вечеринка, тусовка           │
│ верлан от fête               │
│                              │
│──────────────────────────────│
│ On fait une teuf samedi ?    │
│ Устроим тусовку в субботу?   │
│                              │
└──────────────────────────────┘



▐           Понятно            ▌
```

Removed / hidden: Everything A removes; «НОВОЕ СЛОВО» shortened to «НОВОЕ»

New visual / motion: Dashed 2px red header rule (only on intro cards) as the 'not in library' mark; Swipe-left = «Понятно»: card follows the finger, exit −24px + fade (ex-exit), cancel snaps back with --spring-settle; button kept; Headword at the same fit-to-width size as Player B

Brand conflicts: SPEC.md:348 (header with the 2px red rule — solid); SPEC.md:350 NewWord anatomy; MOTION-SPEC §6 direction rule: left = «Не знаю» in review; a left swipe meaning «Понятно» here could confuse (use the same left exit as «Дальше», which already exits left in §5.15)

**Why A:** A removes the three off-topic lines at S effort, and the card becomes pure learning content. B's dashed rule is a good later touch, but the swipe adds gesture ambiguity: left means «Не знаю» in review. Keep the swipe out until the player gets tap-to-advance everywhere.

Files: `components/exercises/NewWordCard.tsx:46-55 (header: «ИЗ ВЕБА ›» becomes a button revealing the domain)`, `components/exercises/NewWordCard.tsx:76 (delete the library sentence)`, `components/exercises/NewWordCard.tsx:78-84 (delete the source footer on phones)`, `components/exercises/NewWordCard.tsx:97-99 (delete the mono «набор · вопрос — следующим» line)`, `mockups/SPEC.md:350`, `update board mockups/Exercise-S-NewWord.dc.html`

### Player: feedback, wrong / «Не знаю» (Exercise-Feedback-C-Wrong) and right (Exercise-Feedback-C-Right)

**Today:** 17 elements. The full question chrome stays (schedule line, footer). The stamp ВЕРНО/НЕВЕРНО sits on the card, the right tile is green with ✓, the wrong pick has ✕, and the other two tiles are dimmed. In the zone: «ОТВЕТ» + the answer again, «Слово ›», explain_ru on 2 lines and the black «Дальше». The right answer appears in three places (green tile, filled gap, ОТВЕТ row).

#### A · One place for the answer (S)

The ОТВЕТ row goes for choice, cloze and register, because the green tile (or the filled gap) already shows the answer. «Слово ›» goes too: after the answer, whatever shows the word gets a dotted underline and opens the word sheet. That is the prompt headword for meaning/register, or the green tile for situation/cloze. The zone holds explain_ru + «Дальше».

```
×  ▮▮▮▮▮▮▮▯▯▯▯▯

┌──────────────────────────────┐
│ЗНАЧЕНИЕ            ▮▮▯▯ fam. │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                              │
│  relou                       │
│  ┈┈┈┈┈                       │
│  Что это значит?             │
│                 ┌─────────┐  │
│                 │ НЕВЕРНО │  │
│                 └─────────┘  │
└──────────────────────────────┘
┏━━━━━━━━━━━━━━┓┌──────────────┐
┃надоедливый  ✓┃│странный     ✕│
┗━━━━━━━━━━━━━━┛└──────────────┘
┌┈┈┈┈┈┈┈┈┈┈┈┈┈┈┐┌┈┈┈┈┈┈┈┈┈┈┈┈┈┈┐
┊офигенный     ┊┊тяжёлый       ┊
└┈┈┈┈┈┈┈┈┈┈┈┈┈┈┘└┈┈┈┈┈┈┈┈┈┈┈┈┈┈┘

Верлан от lourd — «тяжёлый»:
тот, кто всех достаёт.

▐            Дальше            ▌
```

Removed / hidden: Row «ОТВЕТ надоедливый» on choice/cloze/register: removed (kept only as «ошибок: N» for pairs); Text button «Слово ›»: replaced by a dotted underline on the word shown on the card or the green tile (same 1 tap); Schedule line + footer: removed (as in Player A)

New visual / motion: Dotted underline fades in with the verdict (--dur-quick)

Brand conflicts: SPEC.md:351 (result line: «ОТВЕТ» + answer + «Слово ›»)

#### B · Ink marks the answer (S) — **рекомендуется**

A, plus the right tile gets a drawn good-tone underline under its text (stroke draw 200ms), so the eye lands on the answer in the grid. ВЕРНО is a smaller, lighter stamp (32px, 1.5px) than НЕВЕРНО (40px, 2px): a right answer feels quick and a wrong one weighty. With no explain_ru, the zone holds only «Дальше».

```
×  ▮▮▮▮▮▮▮▯▯▯▯▯

┌──────────────────────────────┐
│СИТУАЦИЯ            ▮▮▯▯ fam. │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                              │
│ Друг рассказывает про        │
│ вчерашний концерт: было      │
│ просто потрясающе.           │
│                              │
│ Как он скажет?   ┌───────┐   │
│                  │ ВЕРНО │   │
│                  └───────┘   │
└──────────────────────────────┘
┏━━━━━━━━━━━━━━┓┌┈┈┈┈┈┈┈┈┈┈┈┈┈┈┐
┃C'était ouf  ✓┃┊chelou        ┊
┃‾‾‾‾‾‾‾‾‾‾‾   ┃┊              ┊
┗━━━━━━━━━━━━━━┛└┈┈┈┈┈┈┈┈┈┈┈┈┈┈┘
┌┈┈┈┈┈┈┈┈┈┈┈┈┈┈┐┌┈┈┈┈┈┈┈┈┈┈┈┈┈┈┐
┊relou         ┊┊la galère     ┊
└┈┈┈┈┈┈┈┈┈┈┈┈┈┈┘└┈┈┈┈┈┈┈┈┈┈┈┈┈┈┘


▐            Дальше            ▌
```

Removed / hidden: Everything A removes; Empty answer row on a right answer with no explanation: the zone shows «Дальше» only

New visual / motion: Right-tile underline: 1.5px good, draws left→right (scaleX 0→1, 200ms linear) starting with the stamp at 70ms; ВЕРНО stamp 32px tall / 1.5px border / mono 14; НЕВЕРНО unchanged (40px / 2px / mono 17); both keep the 1.15→1 landing of §5.15

Brand conflicts: SPEC.md:351 (result line anatomy; one stamp size); MOTION-SPEC §5.15 table (add the underline draw step; two stamp sizes)

#### C · Verdict on the card, zone shrinks (M)

B, plus explain_ru moves onto the card under the prompt, written in like a card back while the header fades to 40%. The 200px zone then only has to reserve «Дальше» (52px), which gives the card about 120px more height. After the answer, a tap anywhere on the card also advances.

```
×  ▮▮▮▮▮▮▮▯▯▯▯▯

┌──────────────────────────────┐
│ЗНАЧЕНИЕ            ▮▮▯▯ fam. │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                              │
│  relou                       │
│  ┈┈┈┈┈                       │
│  Что это значит?             │
│                              │
│  Верлан от lourd — «тяжёлый»:│
│  тот, кто всех достаёт.      │
│                 ┌─────────┐  │
│                 │ НЕВЕРНО │  │
│                 └─────────┘  │
└──────────────────────────────┘
┏━━━━━━━━━━━━━━┓┌──────────────┐
┃надоедливый  ✓┃│странный     ✕│
┗━━━━━━━━━━━━━━┛└──────────────┘
┌┈┈┈┈┈┈┈┈┈┈┈┈┈┈┐┌┈┈┈┈┈┈┈┈┈┈┈┈┈┈┐
┊офигенный     ┊┊тяжёлый       ┊
└┈┈┈┈┈┈┈┈┈┈┈┈┈┈┘└┈┈┈┈┈┈┈┈┈┈┈┈┈┈┘

▐            Дальше            ▌
```

Removed / hidden: Everything B removes; The 200px action zone: reduced to the button height (the card's reserved explain area keeps CLS at 0)

New visual / motion: explain_ru writes in on the card (opacity + 4px, --dur-enter) after the stamp; header/meter fade to 40% (focus fade); Tap anywhere on the card = «Дальше» after the answer

Brand conflicts: SPEC.md:348 (fixed 200px action zone) and :351 (result line under the grid); MOTION-SPEC §1.4: the card must reserve explain space from the first frame (no jump), which costs prompt room before the answer; Tap-to-advance risks accidental skips when she taps the headword for the word sheet (needs the underline to take precedence)

**Why B:** B states the answer once, in the grid where she just looked, and marks it with one drawn ink stroke. Wrong feels heavier than right without any celebration, and «Слово» stays one tap away on the word itself. C's layout gain is real, but it fights the fixed-zone, zero-layout-shift rule and adds an ambiguous tap target.

Files: `components/exercises/FeedbackLine.tsx:48-80 (phones: drop the ОТВЕТ row for non-pairs and the «Слово ›» button; zone = explain + «Дальше»)`, `components/exercises/ExercisePlayer.tsx:495-497, :528-537 (pass onWord to QuestionCard/OptionGrid instead of FeedbackLine on phones)`, `components/exercises/QuestionCard.tsx:75-93 (Prompt: dotted-underline button after the answer)`, `components/exercises/OptionGrid.tsx:24-29, :75-110 (right tile: drawn underline; after the answer the right tile opens the word for situation/cloze)`, `components/exercises/ClozeLine.tsx:51-55 (filled gap tappable → word)`, `components/exercises/Stamp.tsx:10-25 (size variant: right = 32px / 1.5px / mono 14)`, `components/exercises/ExercisePlayer.tsx:77-83 (EXERCISE_CSS: underline draw keyframe)`, `mockups/SPEC.md:351`, `mockups/MOTION-SPEC.md §5.15 (underline step, stamp sizes)`, `update boards mockups/Exercise-Feedback-C-Right.dc.html, Exercise-Feedback-C-Wrong.dc.html, mockups/M-Exercise-Answer.dc.html`

### Done (Exercise-S-Done; tab bar back)

**Today:** 26 elements. «Готово» with the italic title and a meta line that repeats «12 вопросов». A three-row receipt: Вопросов 12, С первого раза 9, Точность 75 %. «ОШИБКИ 3» rows with slang meters. «НОВЫЕ СЛОВА (3) · ИЗ ВЕБА» with a checkbox list and «Добавить в библиотеку (2)». Then, last on phones and around or below the fold, «Повторить ошибки (3)», a full-width «Попросить следующий набор» and a text «Готово».

#### A · Result first, then actions (S)

One result line «9 из 12 с первого раза» replaces the three receipt rows. The actions move right under it, as on desktop. «Попросить следующий набор» becomes a text link and the text «Готово» goes (the tab bar is back). Error rows lose the meter. The meta line drops «своя тема» and adds the one schedule note.

```
Готово
Сленг на каждый день · не влияет
на расписание

9 из 12  с первого раза
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▐    Повторить ошибки (3)     ▌
   Попросить следующий набор

ОШИБКИ                         3
────────────────────────────────
relou              надоедливый
chelou             странный
la thune           деньги, бабки

НОВЫЕ СЛОВА (3) · ИЗ ВЕБА
☑ la teuf        вечеринка
☑ ouf            офигенный
☐ la daronne     мама
[  Добавить в библиотеку (2)  ]

Повторение Упражн. Добав. Библ.
```

Removed / hidden: Receipt row «Вопросов 12»: removed (meta / «из 12» say it); Rows «С первого раза» + «Точность 75 %»: merged into «9 из 12 с первого раза»; percentage dropped; Mono meta «своя тема» and «12 вопросов»: removed; Slang meter + label on error rows: removed (the word sheet opens on tap); Secondary button «Попросить следующий набор»: shrunk to a text link; Text button «Готово»: removed on phones (tab bar; Esc stays on desktop); Phone order-last for actions: actions sit under the result

New visual / motion: None

Brand conflicts: SPEC.md:352 (receipt rows, meter on error rows, secondary «Попросить следующий набор», text «Готово»)

#### B · Punched ticket (M) — **рекомендуется**

A large Newsreader «9 из 12» sits over a strip of one small square per question in answer order: ink filled = first try, red outline = a mistake. It is the same tick vocabulary as the player, so every run leaves its own 'shape'. The primary «Повторить ошибки» comes right after. New words collapse to one button «Добавить 3 новых слова» with «изменить ›» (opens the checklist in a sheet).

```
Готово
Сленг на каждый день

9 из 12
■■■■□■■■□■■□
с первого раза

▐    Повторить ошибки (3)     ▌
   Попросить следующий набор

ОШИБКИ                         3
────────────────────────────────
relou              надоедливый
chelou             странный
la thune           деньги, бабки

[Добавить 3 новых слова]
                     изменить ›

не влияет на расписание

Повторение Упражн. Добав. Библ.
```

Removed / hidden: Everything A removes; Receipt rows entirely: replaced by the big number + ticket strip; «НОВЫЕ СЛОВА (3) · ИЗ ВЕБА» heading + checkbox list: behind «изменить ›» (sheet); the default action adds all

New visual / motion: Ticket strip: 10×10 squares, gap 4, ink fill / 1.5px red outline; rendered static (no count-up, no per-square sequence); Optional single fade-in of the strip with the heading (--dur-enter), reduced motion = instant; Big result Newsreader 48 tabular, plain text (§5.5)

Brand conflicts: SPEC.md:352 (receipt «Вопросов / С первого раза / Точность», new-words checklist on the page); MOTION-SPEC §5.12 keeps celebration for «Готово на сегодня»; the strip must stay static to not compete

#### C · Stamp hero + mistake cards (L)

The player's stamp becomes the screen's hero: a large rotated outlined «9/12» lands once next to «Готово». Mistakes become a horizontal strip of small index cards (fr on top, ru below, red header rule), swipeable, and a tap opens the word. New words as small cards with a ✓ corner.

```
Готово               ┌──────┐
Сленг на каждый день │ 9/12 │
                     └──────┘

▐    Повторить ошибки (3)     ▌
   Попросить следующий набор

ОШИБКИ
┌────────┐┌────────┐┌────────┐
│━━━━━━━━││━━━━━━━━││━━━━━━━━│
│relou   ││chelou  ││la thune│
│надоед- ││странный││бабки   │
│ливый   ││        ││        │
└────────┘└────────┘└────────┘

НОВЫЕ СЛОВА
┌───────✓┐┌───────✓┐┌────────┐
│la teuf ││ouf     ││la      │
│вечерин.││офиген. ││daronne │
└────────┘└────────┘└────────┘
[Добавить 2 слова]

Повторение Упражн. Добав. Библ.
```

Removed / hidden: Everything A removes; Receipt: replaced by the stamp; Error and new-word rows: replaced by card strips

New visual / motion: Score stamp lands scale 1.15→1 (the §5.15 landing), −4°, once; Card strips scroll horizontally with scroll-snap

Brand conflicts: SPEC.md:352 says 'No date stamp, no confetti': a score stamp on Done is close to the forbidden stamp-as-celebration; MOTION-SPEC §1.2 / §5.12: delight once a day; a stamp on every exercise Done competes; Horizontal strips hide items off-screen (NN/g hidden-content risk) and truncate Russian translations

**Why B:** B answers 'how did it go?' with one number and one shape, using the tick vocabulary from the list and the player. The primary action moves above the fold, and the new-word checklist leaves the page (adding all is the default, and editing is one tap). It stays static, so it doesn't compete with the daily «Готово на сегодня» moment. C uses a stamp the spec reserves, and A is the safe text-only fallback.

Files: `components/exercises/ExerciseDone.tsx:162 (meta: drop «своя тема» and the count; schedule note once at the bottom)`, `components/exercises/ExerciseDone.tsx:170-185 (big «9 из 12» + ticket strip instead of the three ReceiptRows)`, `components/exercises/ExerciseDone.tsx:188-226 (drop order-last on phones; «Попросить следующий набор» as a text link; hide text «Готово» on phones)`, `components/exercises/ExerciseDone.tsx:228-258 (error rows without SlangMeter on phones)`, `components/exercises/ExerciseDone.tsx:260-318 (new words: one button + «изменить ›» opening a checklist sheet)`, `components/exercises/ExercisePlayer.tsx:216-220, 458-472 (pass per-item first-try results in order for the ticket strip)`, `new components/exercises/ProgressTicks.tsx (ticket variant: squares, red outline for misses)`, `mockups/SPEC.md:352`, `update board mockups/Exercise-S-Done.dc.html`

## Добавить: быстрый лист на телефоне (поиск, варианты, карточка, список)

### A1 · Поиск, пусто (Add-Empty)

**Today:** 14 elements. Two chrome rows (label «КАРТОЧКА № 159», then «Новое слово» + the «Скриншот»/«Список» boxes) plus the red rule take ~113px of the ~396px sheet that is visible with the keyboard up. Under the input: a two-line helper, «НЕДАВНИЕ» + «СЕГОДНЯ · 3», 64px recent rows with a meter and «ТЕМА: …», and a footer hint that repeats the tools. Only about one recent row is above the keyboard.

#### A · Подрезать (S)

Keep today's structure and remove the noise. Chrome becomes one 44px row: «Новое слово · № 159», the two tools as 44px icon buttons that show only while the input is empty, and ×. Remove the helper, the footer hint and «Сегодня · 3». Recent rows become one 48px line, FR serif with RU muted.

```
              ────
 Новое слово · № 159   [▣] [≡]  ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌────────────────────────────────┐
│ Слово — FR или RU|             │
└────────────────────────────────┘

 НЕДАВНИЕ
──────────────────────────────────
 la thune         бабки, деньги
──────────────────────────────────
 kiffer           тащиться
──────────────────────────────────
 chelou           стрёмный
──────────────────────────────────
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

[▣] Скриншот, [≡] Список — 44px
иконки, только пока поле пусто
━ красная линия карточки
```

Removed / hidden: Label row «КАРТОЧКА № 159»: merged into the title row as small mono «№ 159»; «Скриншот»/«Список» text boxes: become 44px icon buttons (aria-label kept) that hide as soon as she types; Helper «Перевод, заметка… заполнятся сами»: removed; the «Подсказки выключены…» variant stays; Footer hint «Несколько слов сразу — через «Список»…»: removed; Aside «СЕГОДНЯ · 3»: removed; Recent-row meter + «ТЕМА: …»: removed; level and theme stay on the card and in Библиотека

New visual / motion: The icon tools fade out (--dur-quick) on the first character and back in when the input is cleared

Brand conflicts: SPEC Add-Empty: «header row: title, right: two buttons «Скриншот» and «Список»» and «muted helper» under the input; SPEC Add-Empty: recent rows «fr — ru — folder chip»

#### B · Строка на карточке (M) — **рекомендуется**

The headword is the title. Chrome is a single row with mono «№ 159» and ×. The input loses its grey box and becomes a borderless Newsreader 22 line sitting on the card's ruled baseline (1px rule, 2px ink when focused), as if writing on the index card. The other ways in become one quiet ruled row under the input, «Со скриншота · Списком», shown only while the input is empty. «Недавние» are 48px FR — RU lines with no header (aria-label only).

```
              ────
 № 159                          ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Слово — FR или RU|
 ________________________________
 [▣] Со скриншота  [≡] Списком
──────────────────────────────────
 la thune — бабки, деньги
──────────────────────────────────
 kiffer — тащиться
──────────────────────────────────
 chelou — стрёмный
──────────────────────────────────
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

поле без рамки: serif 22 на
линейке карточки (1px rule, в
фокусе 2px ink). Ряд «Со
скриншота / Списком» — только
пока поле пусто. «Недавние» 48px
```

Removed / hidden: Title «Новое слово»: removed visually (kept as the sheet's sr-only Drawer title); the placeholder says what to do; Header tools: moved into the empty body as one ruled row of two 44px text buttons; Helper paragraph, footer hint and «Сегодня · 3»: removed; «НЕДАВНИЕ» section header: removed visually, kept as aria-label on the list; Recent-row meter and theme: removed

New visual / motion: Writing-on-the-card input: the ruled baseline turns from rule to ink on focus (--dur-quick); the empty state reads like a blank index card; When typing starts, the «Со скриншота · Списком» row collapses (Collapse --dur-move) and «Варианты» take its slot; Landing after «Добавить и ещё»: the new 48px row opens at the top (existing FRESH_ROW, height 0→48)

Brand conflicts: SPEC Add-Empty: input «56px, surface-2 bg» and the header buttons; SPEC Shape: «inputs 4px» radius. A borderless ruled line is a new input style; it needs a SPEC line saying the headword input is a ruled line

#### C · Пустая карточка и стопка (L)

The top of the sheet is an actual white index card: «№ 159» above the 2px red rule, the input on its first ruled line, two faint ruled lines below it as a promise of what will fill in. «Недавние» gets a silent visual count: a tiny stack of hairline card edges, one per word added today (max 5), with no number. «Добавить и ещё» drops the saved card onto that stack.

```
              ────
 [▣] [≡]                        ×
┌────────────────────────────────┐
│ № 159                          │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Слово — FR или RU|             │
│................................│
│................................│
└────────────────────────────────┘
 НЕДАВНИЕ                     ═══
 la thune — бабки, деньги
 kiffer — тащиться
 chelou — стрёмный
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

═══ стопка: один волосяной край
на слово за сегодня (до 5), без
цифры. «Добавить и ещё»: новая
карточка ложится на стопку
```

Removed / hidden: Title «Новое слово» and label row: the card itself is the header; Helper, footer hint, «Сегодня · 3» number: replaced by the edge stack; Recent-row meter/theme

New visual / motion: Static stack of 1–5 hairline card edges (3px offset, 1px rule, no shadow) beside «Недавние»; «Добавить и ещё»: the form card translates down and scales to .96 into the stack (--dur-move, --ease-standard, no bounce); one more edge appears as a plain step, never counted up; Two faint ruled lines inside the card (rule colour) that the form later writes into

Brand conflicts: MOTION-SPEC 5.10 / A8: «Добавить и ещё» is specified as fields fading out plus the row opening in «Недавние»; a card dropping onto a stack is a new motion and needs an A8 amendment; MOTION-SPEC 1.1: scale ≤ 1.02 is fine, but the drop must stay ≤ 56px of travel; the sheet-to-stack distance is longer, so it needs a short crossfade fallback; SPEC: blue ruled lines are «optional, only on the review card»

**Why B:** B gives the most space back for the least risk. Over 60px of chrome goes, the input reads as writing on the card (more visual, still ink on paper), the alternate entry points stay one tap away exactly when they make sense (empty input), and nothing daily moves further. C's edge stack can be added later as a small enhancement (S on its own) once B's single-row chrome exists.

Files: `/home/user/french_cards/components/add/parts.tsx (AddSheetChrome :40-68 → one 44px row; ToolButton/ToolLink :70+ → text-row variant; HeadwordInput :150-190 → ruled-line variant)`, `/home/user/french_cards/components/add/QuickAddSheet.tsx (label :275-278, tools :709-719 shown only when mode==='search' && !query.trim(), chrome :838-847)`, `/home/user/french_cards/components/add/SearchPanel.tsx (EmptyState :146-176 drop helper/footer/aside, add the «Со скриншота · Списком» row; RecentRow :184-209 → 48px one line; FRESH_ROW :179 h-16 → h-12)`, `/home/user/french_cards/components/add/data.ts (`today` count :12-32 no longer rendered)`, `/home/user/french_cards/mockups/Add-Empty.dc.html`, `/home/user/french_cards/mockups/SPEC.md (Add-Empty :179-185, v3 Add-* override :144, Shape: headword input)`, `/home/user/french_cards/e2e/add.spec.ts`

### A2 · Поиск, слово набрано: «Словарь» + «Варианты» (Add-Suggest), waiting/error

**Today:** 22 elements, density 8. With the keyboard up the visible ~396px holds chrome (113px), input (72px) and the «Словарь» block (header «работает без сети» + 3 × 44px ≈ 182px). That leaves ~29px, so none of the «Варианты» rows she came to pick are visible. Each variant row has FR + abbr, RU, meter + level, «ТЕМА: …» and a chevron. Below them sit a full-width «Заполнить вручную» row and the «Контекст» link, which leaves the sheet.

#### A · Подрезать секции (S)

Keep both sections but shrink «Словарь» to one 40px strip of 3 candidates separated by hairlines (tap = fill the input). Remove the asides «работает без сети» and «перевод · уровень · тема», the «ТЕМА:» line and the chevron from variant rows, and the «Контекст» row. «Заполнить вручную» becomes a muted text link at a fixed y under the last slot.

```
              ────
 Новое слово · № 159            ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌────────────────────────────────┐
│ se cass|                     × │
└────────────────────────────────┘
 СЛОВАРЬ
 se casser │ se casser la tête │…
 ВАРИАНТЫ ────────────────────────
 se casser v. pron.    ▮▮▮▯ arg.
 свалить, сбежать
──────────────────────────────────
 se casser la tête     ▮▮▯▯ fam.
 ломать голову
──────────────────────────────────
 casser les pieds      ▮▮▯▯ fam.
 доставать, надоедать
──────────────────────────────────
 Заполнить вручную
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

без «работает без сети», без
легенды колонок, без «ТЕМА:»,
без шеврона, без «Контекста»
```

Removed / hidden: «Словарь» 3 × 44px rows: become one 40px strip (fixed height, so A4's «nothing moves» holds); Aside «работает без сети»: removed; Aside «перевод · уровень · тема»: removed; Variant «ТЕМА: …»: moved to the word form (Тема row); Variant chevron ›: removed (the whole row is the button; the A5 ink-fill confirms the tap); «Заполнить вручную» row with pencil + chevron: becomes a muted text link; «Как «…» говорят в жизни · Контекст ›»: removed from the add sheet; it stays in Библиотека search (ContextRow variant="library") and the Library header magnifier

Brand conflicts: MOTION-SPEC A4: «Словарь» reserves 3 × 44px with its header; this becomes 1 × 40px; SPEC Add-Suggest: Словарь «3 compact rows… each 44px»

#### B · Подсказка в самом поле (M) — **рекомендуется**

The dictionary becomes an inline ink ghost completion inside the headword line: she types «se cass» and a muted «er» follows the caret, with the dictionary abbr «v. pron.» at the right. → or a tap on the ghost accepts it. Two more candidates sit in one 40px hairline strip. The section headers go; one status slot reads «3 ВАРИАНТА» over the rows. Variants show FR + abbr, RU and the meter only. About 2.5 variants are now above the keyboard instead of 0.

```
              ────
 № 159                          ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 se cass|er             v. pron.
 ________________________________
 se casser la tête │ casse-croûte
 3 ВАРИАНТА ──────────────────────
 se casser v. pron.    ▮▮▮▯ arg.
 свалить, сбежать
──────────────────────────────────
 se casser la tête     ▮▮▯▯ fam.
 ломать голову
──────────────────────────────────
 casser les pieds      ▮▮▯▯ fam.
 доставать, надоедать
──────────────────────────────────
 Заполнить вручную
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

«er» — серое продолжение в поле:
→ или тап по нему принимает.
Над клавиатурой ~2,5 варианта
вместо 0 сегодня
```

Removed / hidden: «СЛОВАРЬ» section (header + 3 rows): becomes a ghost completion plus a 40px strip of 2 alternatives; «ВАРИАНТЫ» header and its aside: the ink rule + the existing status slot («ПОДБИРАЕМ ВАРИАНТЫ» → «3 ВАРИАНТА») replace it; Variant «ТЕМА:» line and chevron: removed (theme decided in the form); «Заполнить вручную» row: muted text link at a fixed y; «Контекст» row: removed from the sheet (lives in Библиотека); Header tools «Скриншот»/«Список» and title: gone (see A1-B)

New visual / motion: Ghost completion: typed part in ink, rest in muted ink, the same typed-vs-rest rendering DictionaryRow already does (SearchPanel.tsx:246-257); accepting it turns the rest to ink at once with no motion; The strip keeps a fixed 40px slot from the first letter (A4 «reserved»), so variants never shift

Brand conflicts: SPEC Copy rules: «Suggestions come in two quiet sections: «Словарь» (instant) and «Варианты»»; «Словарь» stops being a section; MOTION-SPEC A3/A4: the fixed section order «Словарь, Варианты, manual» is preserved, but «Словарь» changes shape; A4 needs rewording to «ghost + 40px strip reserved»; Variant rows lose «Тема» (SPEC Add-Suggest lists a folder chip on each card)

#### C · Стопка листков и перелёт в карточку (L)

Same inline ghost as B, but the variants are drawn as one stack of index-card slips (white, 1px rule, the 2px red line only on the top slip). Picking a slip ink-fills it (A5), then its FR and RU glide into their lines on the form card (shared element, --dur-move, no overshoot) instead of the hard swap, so the two screens read as one object.

```
 № 159                          ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 se cass|er             v. pron.
 ________________________________
 se casser la tête │ casse-croûte
 3 ВАРИАНТА
┌━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┐
│ se casser          ▮▮▮▯ arg.   │
│ свалить, сбежать               │
├────────────────────────────────┤
│ se casser la tête  ▮▮▯▯ fam.   │
│ ломать голову                  │
├────────────────────────────────┤
│ casser les pieds   ▮▮▯▯ fam.   │
│ доставать, надоедать           │
└────────────────────────────────┘
 Заполнить вручную

варианты — листки одной стопки,
красная линия только у верхнего.
Выбор: листок заливается
чернилами, FR и RU плывут на свои
места в карточке (--dur-move)
```

Removed / hidden: Same as B

New visual / motion: Variants as a single white card with hairline dividers (slips), red top line on the top slip; Shared-element pick: React <ViewTransition> / startViewTransition with view-transition-name per field (Safari 18+, instant swap elsewhere); position only, no colour spring; reduced motion = crossfade

Brand conflicts: MOTION-SPEC A5: after the ink-fill the form replaces the row and its fields get the spotlight; a glide is a new primitive (allowed curves, but a spec amendment is needed); SPEC Shape: «Separate list items with 1px hairline rules, not boxed cards»; a boxed slip stack edges toward boxed cards; MOTION-SPEC 5.7: «Content inside never animates on open»

**Why B:** This is the densest screen and the one where the primary job is literally hidden under the keyboard. B is the only option that brings the «Варианты» above the keyboard (about 2.5 rows instead of 0), and it does so by removing a whole section, not by restyling it. The dictionary stays one tap (or →) away. C's glide is a good later step once B lands, but the boxed slips push against SPEC's no-boxes rule.

Files: `/home/user/french_cards/components/add/SearchPanel.tsx (Dictionary :211-268 → ghost + 2-item strip; Variants aside :285-289 removed; VariantRow theme + chevron :373-383 removed; ManualRow :388-402 → text link; ContextRow :135-139 removed)`, `/home/user/french_cards/components/add/parts.tsx (HeadwordInput :150-190 add a `ghost` suffix span + accept on → / tap; DICTIONARY_ROWS / useDictionaryReserved / DictionarySlot → 40px strip slot; SectionHeader no longer used here)`, `/home/user/french_cards/components/add/QuickAddSheet.tsx (pickHit :353-358 reused for accepting the ghost; onLeave no longer passed to SearchPanel :860-870)`, `/home/user/french_cards/components/add/match.ts (splitTypedPrefix reused for the ghost)`, `/home/user/french_cards/mockups/Add-Suggest.dc.html`, `/home/user/french_cards/mockups/M-Add-Suggest.dc.html`, `/home/user/french_cards/mockups/SPEC.md (Copy rules :108, Add-Suggest :187-191)`, `/home/user/french_cards/mockups/MOTION-SPEC.md (A2/A4 :373-375)`, `/home/user/french_cards/e2e/add.spec.ts`, `/home/user/french_cards/e2e/context.spec.ts (no longer reached from the add sheet)`

### A3 · Поиск: «Уже есть…» (Add-Duplicate)

**Today:** 14 elements. The dashed warn box is ≈156px: «Уже есть в теме «Деньги»», mono «№ 047», the same FR she just typed, RU, a slang meter, then «Открыть» + «Всё равно добавить». With chrome and input it fills almost everything above the keyboard.

#### A · Подрезать плашку (S)

Same box, three fewer items: no catalogue number, no repeated FR, no meter. RU stays so she can tell if it is the same meaning.

```
              ────
 Новое слово · № 159            ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌────────────────────────────────┐
│ la thune                     × │
└────────────────────────────────┘
┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
╎ Уже есть в теме «Деньги»       ╎
╎ бабки, деньги                  ╎
╎ [Открыть]   Всё равно добавить ╎
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
 ВАРИАНТЫ ────────────────────────
 la thune n. f.        ▮▮▮▯ arg.
 бабки, деньги
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

без «№ 047», без повтора FR, без
шкалы сленга в плашке
```

Removed / hidden: Mono «№ 047»; Repeated FR headword; Slang meter in the notice

Brand conflicts: SPEC Add-Duplicate: «row preview «la thune — бабки, деньги»» (FR repeated)

#### B · Одна строка-предупреждение (S) — **рекомендуется**

A single 64px dashed warn row: «Уже есть · Деньги» + «Открыть ›» on the first line, the existing RU under it. «Всё равно добавить» becomes a small text link under the row, and picking any variant also counts as «add anyway» (it calls setAckDuplicate), so the decision costs no extra tap.

```
              ────
 № 159                          ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 la thune               n. f.  ×
 ________________________________
┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
╎ Уже есть · Деньги   Открыть ›  ╎
╎ бабки, деньги                  ╎
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
                Всё равно добавить
 1 ВАРИАНТ ───────────────────────
 la thune n. f.        ▮▮▮▯ arg.
 бабки, деньги
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

плашка 64px; выбор варианта
тоже значит «всё равно добавить»
```

Removed / hidden: «№ 047», repeated FR, meter; Secondary button «Открыть»: becomes «Открыть ›» inside the row (the whole row is a 64px button); «Всё равно добавить» button: becomes a muted text link (kept for a11y and for the manual path); implicit when she picks a variant

New visual / motion: Keep the A9 Collapse reveal (--dur-move + fade), now for a 64px block instead of 156px

Brand conflicts: SPEC Add-Duplicate: buttons «Открыть» / «Всё равно добавить»

#### C · Карточка выглядывает из ящика (M)

The existing card peeks out from behind the headword line as a dashed card edge with mono «УЖЕ ЕСТЬ · ДЕНЬГИ» and its RU. «Already in the box» reads as a shape, not a sentence. Tapping the edge lifts it up into the word detail sheet.

```
              ────
 № 159                          ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
   ╎ УЖЕ ЕСТЬ · ДЕНЬГИ        › ╎
   ╎ бабки, деньги             ╎
 ┌─┴───────────────────────────┴─┐
 │ la thune             n. f.  × │
 └───────────────────────────────┘
                Всё равно добавить
 1 ВАРИАНТ ───────────────────────
 la thune n. f.        ▮▮▮▯ arg.
 бабки, деньги
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

сохранённая карточка выглядывает
из-за поля (Collapse A9). Тап —
она поднимается в карточку слова
```

Removed / hidden: Same as B

New visual / motion: Card edge slides up from behind the input (translateY 8px + Collapse, --dur-move, no bounce); «Открыть»: the edge lifts into the word sheet (shared element, --dur-turn)

Brand conflicts: Depth by overlap is allowed (MOTION-SPEC 1.1), but the headword must then keep a boxed input; this conflicts with A1-B's ruled-line input; Shared-element lift into a second sheet: SPEC/HIG say never stack sheets, so «Открыть» must close the add sheet first, as it does today

**Why B:** B halves the notice (156 → 64px), so the variant she may still want stays above the keyboard, and the decision gets simpler: open the old card, or just pick a variant. It is S effort in DuplicateNotice and works with the A1-B ruled input. C is charming but fights the borderless input.

Files: `/home/user/french_cards/components/add/parts.tsx (DuplicateNotice :543-582 → compact phone variant; DuplicateReveal unchanged)`, `/home/user/french_cards/components/add/QuickAddSheet.tsx (pickSuggestion :376-391 also calls setAckDuplicate(dupKey) when a duplicate is showing)`, `/home/user/french_cards/components/add/SearchPanel.tsx (:126-128)`, `/home/user/french_cards/components/add/WordForm.tsx (:174-176 uses the same compact row)`, `/home/user/french_cards/mockups/Add-Duplicate.dc.html`, `/home/user/french_cards/mockups/SPEC.md (Add-Duplicate :200-203)`, `/home/user/french_cards/e2e/add.spec.ts`

### A4 · Поиск: быстрая форма (подсказки выкл., ошибка, нет сети)

**Today:** 12 elements. The «Варианты» header plus the 72px error row («Нет сети — варианты появятся…» + «Повторить») stay on screen, as does «Словарь». So the «Русский» field she must type into, the «Тема  Входящие ▾» select and «Все поля» sit low, partly under the keyboard. «Контекст» also shows even though it needs the network.

#### A · Подрезать (S)

Collapse the error to one 21px status line in the same slot («НЕТ СЕТИ · ПЕРЕВОД ВРУЧНУЮ» + «Повторить»), move «Тема» behind «Все поля» (default Входящие, sorted later), drop «Контекст». «Словарь» becomes a strip (A2-A).

```
              ────
 Новое слово · № 159            ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌────────────────────────────────┐
│ la bagnole                   × │
└────────────────────────────────┘
 СЛОВАРЬ
 la bagnole │ le bagne │ bagnard
 НЕТ СЕТИ · ПЕРЕВОД ВРУЧНУЮ
──────────────────────────────────
 РУССКИЙ  Перевод|
──────────────────────────────────
                        Все поля
[            Добавить            ]
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

«Тема» — за «Все поля» (по
умолчанию Входящие), без
«Контекста»
```

Removed / hidden: 72px error row: becomes a 21px status line in the same slot; «Варианты» header: removed while the quick form is open; «Тема  Входящие ▾» select: behind «Все поля»; «Контекст» row: removed

Brand conflicts: MOTION-SPEC A3: the error «takes the first slot at row height (72 px)»; SPEC Add-Duplicate: offline «plain manual form (FR, RU, Тема select «Входящие»)»

#### B · Вторая линейка карточки (M) — **рекомендуется**

With the A1-B ruled headword, the quick form is simply the card's second ruled line: FR on the top line, RU (placeholder «Перевод») on the line below, focus jumps there. One status line with a hairline cloud-off glyph sits in the «Варианты» slot. «Все поля» opens the full card. Nothing above moves.

```
              ────
 № 159                          ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 la bagnole               n. f.
 ________________________________
 тачка|
 ________________________________
 ⊘ НЕТ СЕТИ            Повторить
                        Все поля
[            Добавить            ]
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

RU — вторая линейка той же
карточки (placeholder «Перевод»).
Статус 21px в слоте «Вариантов»,
ничего не прыгает. Подсказки
выключены: «ПОДСКАЗКИ ВЫКЛЮЧЕНЫ»
без «Повторить»
```

Removed / hidden: «Варианты» header + 72px error slot: become one 21px status line with a 16px cloud-off icon; «РУССКИЙ» label column: removed; the ruled line + placeholder carry it (aria-label «Русский» kept); «Тема» select: behind «Все поля»; «Словарь» strip while offline: kept only when the lexique has hits (it works offline); «Контекст» row: removed

New visual / motion: The RU line opens under the headword (Collapse --dur-move) as the 72px slots leave (--dur-exit), the same sequence as A3, only shorter; Offline glyph: hairline cloud-off in muted ink, no sentence

Brand conflicts: MOTION-SPEC A3: the 72px error row and the «quick manual form opens below it» wording; SPEC Copy rules: none broken; the Russian copy stays as status caps

**Why B:** It is the same object as A1-B and A6-B (the card being written on), so offline add reads as finishing a card rather than filling a form. The RU line and «Добавить» are both above the keyboard. Theme moves behind one tap, but «Входящие» is the right default offline and gets sorted later anyway.

Files: `/home/user/french_cards/components/add/SearchPanel.tsx (QuickForm :404-441 → second ruled line, theme behind «Все поля»; Variants :270-327 hides its header when quick is open)`, `/home/user/french_cards/components/add/parts.tsx (VariantError :408-426 → 21px status-line variant; VariantsStatusSlot :363-376; FieldRow unused here)`, `/home/user/french_cards/components/add/QuickAddSheet.tsx (quick folder default / saveQuick; quickVisible footer :697-706)`, `/home/user/french_cards/components/ui/Icons.tsx (cloud-off glyph if missing)`, `/home/user/french_cards/mockups/M-Add-Suggest.dc.html (F5)`, `/home/user/french_cards/mockups/MOTION-SPEC.md (A3 :374)`, `/home/user/french_cards/e2e/add.spec.ts`

### A5 · Карточка после выбора варианта (Add-Filled)

**Today:** 24 elements, density 9. Two chrome rows with «Скриншот»/«Список» (which drop the draft), the headword, «Русский», a 2-line «Заметка» textarea, «Пример» with ↻, ×, «подобран автоматически» and «+ Ещё пример», «Свои поля», «+ Поле», a ~92px «Уровень сленга» block with a caption, segmented control and «verl.», then below the fold 3–5 «Тема» chips with a caption, a dashed «+ новая тема», «Другие темы ▾», «Карточки в обе стороны» and the footer. The phrase «…автоматически» appears three times.

#### A · Подрезать (S)

Keep the controls, remove the chatter. Drop the tools in form mode, all three «…автоматически» captions (the A5 spotlight already marks what was filled), the empty «Заметка» textarea, and the example controls at rest (they show only on focus). Merge «Свои поля» and «+ Поле» into one «+ Поле» at the bottom. Move «Карточки в обе стороны» into the «+ Поле» menu.

```
 ←  Новое слово · № 159         ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌────────────────────────────────┐
│ se casser             v. pron. │
└────────────────────────────────┘
 РУССКИЙ  свалить, сбежать
──────────────────────────────────
 ЗАМЕТКА  «Casse-toi» = грубое
          «свали»
──────────────────────────────────
 ПРИМЕР   Allez, on se casse
          d'ici.
──────────────────────────────────
 УРОВЕНЬ СЛЕНГА
 [нейтр.|fam.|▮arg.|vulg.] [verl.]
 ТЕМА
 [■Повседневное] [Тусовка] Другие▾
 + Поле
──────────────────────────────────
[Добавить и ещё] [   Добавить   ]

без «Скриншот/Список», без трёх
«…автоматически»; ↻, × и «+ Ещё
пример» — только при фокусе
```

Removed / hidden: «Скриншот»/«Список» in form mode (they also silently dropped the draft); «подобран / определён / подобрано автоматически» ×3; Example ↻ / × / «+ Ещё пример»: shown only while the example is focused; Empty «Заметка» textarea: moves into the «+ Поле» menu; «Свои поля» row + «+ Поле»: one «+ Поле» line after «Тема»; «Карточки в обе стороны»: a checkbox item in the «+ Поле» menu; Dashed «+ новая тема» chip: only after «Другие ▾»

Brand conflicts: SPEC Copy rules: «Theme picked automatically: chip selected + tiny muted caption «подобрано автоматически»»; SPEC v3 Add-* override: «Тема» chips with caption, «+ новая тема» dashed chip; SPEC «+ Поле» в окне нового слова: «under «Пример»», now after «Тема»; SPEC Add-Filled: «Toggle row «Карточки в обе стороны»»

#### B · Строки каталожной карточки (M) — **рекомендуется**

Every property becomes one 48px ruled FieldRow, so the whole card fits above the fold. The slang meter is the control itself: four enlarged ink bars as 44px hit targets (tap or drag along), the italic level beside them, the 4th bar red for vulg., and «verl.» as a text toggle. «Тема» shows the auto pick plus the top alternative, each one tap; ▾ expands all themes and the new-theme proposal in place (Collapse, no second sheet). The «Скриншот»/«Список» tools are gone; the headword is the title.

```
 ←  № 159                       ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 se casser              v. pron.
 ________________________________
 РУССКИЙ  свалить, сбежать
──────────────────────────────────
 ЗАМЕТКА  «Casse-toi» = грубое
          «свали». Ещё «сломаться»
──────────────────────────────────
 ПРИМЕР   Allez, on se casse
          d'ici.
          Ну всё, валим отсюда.
──────────────────────────────────
 СЛЕНГ    ▮  ▮  ▮  ▯  arg.  verl.
──────────────────────────────────
 ТЕМА     Повседневное · Тусовка ▾
──────────────────────────────────
 + Поле

──────────────────────────────────
[Добавить и ещё] [   Добавить   ]

шкала — 4 зоны касания по 44px;
▾ раскрывает все темы на месте;
«в обе стороны» — в «+ Поле»
```

Removed / hidden: Second chrome row + «Новое слово» + tools: one row ← · «№ 159» · ×; Three «…автоматически» captions: the A5 spotlight is the only provenance signal; «Уровень сленга» label + caption + segmented slab (≈92px): one 48px meter row; «Тема» chip wall + caption + dashed proposal + «Другие темы ▾»: one row with pick + one alternative; the rest behind ▾ in place; Example controls: on focus only; Empty «Заметка»: in «+ Поле»; a filled note shows as text and is editable on tap; «Свои поля» + «+ Поле»: one «+ Поле» line (opens shared fields, Происхождение, Спряжение, Своё поле, Заметка, «В обе стороны»); «Карточки в обе стороны» row: checkbox item in the «+ Поле» menu (default on, draft.ts)

New visual / motion: Meter-as-control: bars ink up to the tapped bar as one step (--dur-move), never in sequence; the italic word swaps; vulg. turns the filled bars red (SPEC slang rule); Detection lands with the existing spotlight per row (A6), now on 48px rows; Theme ▾ opens with Collapse (--dur-move); the chip ink fill crossfades --dur-quick (5.8)

Brand conflicts: SPEC Slang level / v3 override: Add-Filled «editable as a 4-option segmented control labelled «Уровень сленга» with an extra «verl.» toggle»; SPEC Copy rules: «подобрано автоматически» caption; SPEC «+ Поле» в окне нового слова: position under «Пример»; MOTION-SPEC 5.9: «Segmented ink slab moves --dur-move» no longer applies here

#### C · Форма — это сама карточка (L)

The form is the index card being saved, in read mode, drawn like Review-Back: «№ 159» and the slang meter above the 2px red rule, the headword in Newsreader, RU, the note, the italic example, mono «ТЕМА: ПОВСЕДНЕВНОЕ». Tap any line to edit it in place, tap the meter to set the level, tap «ТЕМА:» to open the themes. Checking the card means reading the real card.

```
 ←                              ×
┌────────────────────────────────┐
│ № 159             ▮▮▮▯ arg.    │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ se casser          v. pron.    │
│ свалить, сбежать               │
│................................│
│ «Casse-toi» = грубое «свали».  │
│................................│
│ Allez, on se casse d'ici.      │
│ Ну всё, валим отсюда.          │
│................................│
│ ТЕМА: ПОВСЕДНЕВНОЕ             │
└────────────────────────────────┘
                          + Поле
[Добавить и ещё] [   Добавить   ]

форма = сама карточка, как на
обороте в Повторении. Тап по
строке — правка на месте; тап по
шкале — уровень; по «ТЕМА:» —
лист тем
```

Removed / hidden: All label columns («РУССКИЙ», «ЗАМЕТКА», «ПРИМЕР»), kept as aria-labels; Segmented level control: the meter on the card, which opens the picker on tap; Theme chips: «ТЕМА:» line, which opens the chooser on tap; «Карточки в обе стороны», «Свои поля»: in «+ Поле»

New visual / motion: Read → edit in place: the line's underline turns ink and the caret appears; no layout shift; «Добавить и ещё»: the card slides into the «Недавние» stack (A1-C)

Brand conflicts: NN/g guardrail and research: flat read-mode lines hide editability; a tap-to-edit affordance is needed (a pencil on press, or a dotted underline); SPEC Add-Filled: «Fields stacked with labels»; MOTION-SPEC 5.7: sheet content does not animate on open; Swapping the input/text elements risks the iOS keyboard dropping focus on first tap

**Why B:** B takes the screen from 24 elements to about 11 and fits the whole card plus the footer above the fold. It also makes the slang meter, the brand's favourite element, the direct control, which is the «more visual» ask without new decoration. Daily actions stay at one tap: change level (tap a bar), pick the top alternative theme, add. C is the long-term ideal, but it needs its own tap-to-edit affordance work and a11y testing.

Files: `/home/user/french_cards/components/add/WordForm.tsx (whole layout :150-276; DraftFields :72-121 folded into the «+ Поле» menu; example caption :237 removed; theme block :253-273 → FieldRow)`, `/home/user/french_cards/components/add/parts.tsx (SlangPicker :736-813 → meter-row control; FolderChips :668-731 → pick + alternative + in-place expand, caption removed; BothDirectionsRow :816-846 → menu item; AddSheetChrome :40-68)`, `/home/user/french_cards/components/examples/ExampleList.tsx (controls :112-126, :166-188 shown only on focus-within in size="form")`, `/home/user/french_cards/components/add/DraftExtras.tsx (:184-241 merged menu: Заметка, Свои поля, В обе стороны)`, `/home/user/french_cards/components/library/AddFieldButton.tsx (:32-35 extra menu kinds)`, `/home/user/french_cards/components/add/QuickAddSheet.tsx (tools :709-719 not rendered in form mode)`, `/home/user/french_cards/components/ui/SlangMeter.tsx (large interactive size)`, `/home/user/french_cards/mockups/Add-Filled.dc.html`, `/home/user/french_cards/mockups/M-Add-Detect.dc.html (F1)`, `/home/user/french_cards/mockups/SPEC.md (Copy rules :106-112, Slang level :89-92, v3 Add-* :144, Add-Filled :193-198, «+ Поле» в окне нового слова :368-371)`, `/home/user/french_cards/mockups/MOTION-SPEC.md (5.8, 5.9)`, `/home/user/french_cards/e2e/add-fields.spec.ts`, `/home/user/french_cards/e2e/add-detect.spec.ts`, `/home/user/french_cards/e2e/examples.spec.ts`

### A6 · Карточка вручную, идёт определение (M-Add-Detect F2/F3)

**Today:** 14 elements. With FR focused and the keyboard up the full sheet shows ~255px of body. That space goes to «Русский» and then the empty optional «Заметка» textarea and the «Пример» row. Level, theme, captions («определяется…», «подбираем тему…»), «+ Поле» and «в обе стороны» sit under the keyboard.

#### A · Скрыть пустое (S)

Hide «Заметка» and «Пример» until FR and RU are both filled (the example then arrives by detection). Remove the words «определяется…» / «подбираем тему…»; the drawn unknown states (rule-coloured meter, mono «…») stay. Keep «не определилось» on failure as role=status.

```
 ←  Новое слово · № 159         ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌────────────────────────────────┐
│ la bagnole|                    │
└────────────────────────────────┘
 РУССКИЙ  Перевод
──────────────────────────────────
 + Поле
[Добавить и ещё] [   Добавить   ]
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓

(под клавиатурой)
 УРОВЕНЬ СЛЕНГА           ▯▯▯▯
 [нейтр.|fam.|arg.|vulg.] [verl.]
 ТЕМА                        …

«Заметка» и «Пример» скрыты, пока
FR и RU не заполнены; подписи
«определяется…» убраны
```

Removed / hidden: Empty «Заметка» textarea: in «+ Поле»; «Пример» row: hidden until FR + RU; Captions «определяется…» / «подбираем тему…»: drawn states only

Brand conflicts: MOTION-SPEC A6: «the slang meter shows its unknown state + caption «определяется…»… the theme row caption «подбираем тему…»»

#### B · Карточка дописывается сама (M) — **рекомендуется**

Same rows as A5-B. While typing, only the two ruled lines (FR, RU) and the footer are visible. When RU is entered and the keyboard goes down, the rows «Пример …», «Сленг ▯▯▯▯ …» and «Тема …» open under them, already at their final height, and fill one by one with the spotlight as detection lands.

```
 ←  № 159                       ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 la bagnole               n. f.
 ________________________________
 тачка|
 ________________________________
[Добавить и ещё] [   Добавить   ]
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

— RU введено, клавиатура убрана —
 la bagnole               n. f.
 ________________________________
 тачка
 ________________________________
 ПРИМЕР   …
──────────────────────────────────
 СЛЕНГ    ▯  ▯  ▯  ▯  …
──────────────────────────────────
 ТЕМА     …
──────────────────────────────────
 + Поле
[Добавить и ещё] [   Добавить   ]
```

Removed / hidden: Chrome row 2 + tools; «Заметка» (empty) → «+ Поле»; «Пример», «Сленг», «Тема» rows while FR/RU are being typed (they open once both exist, in reserved 48px slots); Text captions of detection; «не определилось» kept on failure

New visual / motion: Rows open once (Collapse --dur-move) when both FR and RU are filled; after that nothing moves (MOTION-SPEC principle 4); Each value lands with the 1200ms spotlight (A6); Unknown meter = 4 rule-coloured bars that ink in one step

Brand conflicts: MOTION-SPEC A6 captions (as A); M-Add-Detect F2 shows «Заметка» and the segmented slab

#### C · Чернила вписываются (L)

As B, inside the C-style card. The meter sits above the red rule in rule colour and inks in on landing. The example line writes in from the left (clip-path inset reveal, --dur-enter, linear), the way ink appears as you write. «ТЕМА: ПОВСЕДНЕВНОЕ» arrives last as a mono line.

```
 ←                              ×
┌────────────────────────────────┐
│ № 159             ▯ ▯ ▯ ▯      │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ la bagnole           n. f.     │
│________________________________│
│ тачка|                         │
│________________________________│
│ ...............................│
│ ...............................│
└────────────────────────────────┘
[Добавить и ещё] [   Добавить   ]
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

пустая карточка заполняется сама:
шкала чернится одним шагом +
spotlight, пример «вписывается»
слева направо (clip-path,
--dur-enter, linear), «ТЕМА:
ПОВСЕДНЕВНОЕ» встаёт последней
```

Removed / hidden: All label columns and captions

New visual / motion: clip-path inset(0 100% 0 0) → inset(0) write-in on the example, --dur-enter linear; reduced motion = opacity; Meter inks in one step at landing

Brand conflicts: MOTION-SPEC 5.14: landing is the spotlight (colour only); the clip-path write-in is a new primitive and must not stack with the spotlight on the same region; Same read-mode affordance risk as A5-C

**Why B:** While she types, B shows exactly the two things she types plus «Добавить». Then the card visibly completes itself, which is the dynamic moment, using the existing spotlight. Everything stays CLS-free because the rows open once in reserved slots. It shares all its components with A5-B.

Files: `/home/user/french_cards/components/add/WordForm.tsx (detectionStates :52-65; hide note/example/meta rows until fr && ru; theme caption :258-262 removed)`, `/home/user/french_cards/components/add/parts.tsx (SlangPicker caption :768-779 → drawn state only, «не определилось» kept; UnknownMeter reused in the meter row)`, `/home/user/french_cards/components/add/QuickAddSheet.tsx (formEnrich :280-300 unchanged; focus order fr → ru)`, `/home/user/french_cards/mockups/M-Add-Detect.dc.html (F2/F3)`, `/home/user/french_cards/mockups/MOTION-SPEC.md (A6 :377)`, `/home/user/french_cards/e2e/add-detect.spec.ts`

### A7 · «Несколько слов» — пустое поле вставки

**Today:** 8 elements, density 4. The label reads «СПИСОК · 0 СТРОК» before anything is pasted. A bordered 148px textarea has a 3-line placeholder, then a format paragraph that repeats it. The footer «Добавить» is disabled and takes 84px above the keyboard. There is no paste shortcut, which on iOS means a long-press.

#### A · Подрезать (S)

Remove the «0 строк» label, the format paragraph (shown only under an invalid row as «нет перевода»), and the dead footer, which rises in once rows exist. The title row merges with back and ×.

```
              ────
 ←  Несколько слов              ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌────────────────────────────────┐
│ la thune — бабки, деньги       │
│ kiffer — тащиться              │
│ chelou — стрёмный              │
│                                │
│                                │
└────────────────────────────────┘
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

без «СПИСОК · 0 СТРОК», без
абзаца-подсказки, без мёртвой
кнопки «Добавить»: она встаёт,
когда появились строки
```

Removed / hidden: Label «СПИСОК · N СТРОК»: removed (the count lives on the footer button); Format hint paragraph: only as the line under an invalid row; Disabled «Добавить»: footer enters (--dur-enter, as Import I3) only when rows exist

New visual / motion: Footer rises 8px + fades in once the first row parses

#### B · Тетрадный лист (S) — **рекомендуется**

As A, but the textarea is drawn as a ruled page: faint 24px hairlines matching leading-6, the example lines sitting on them, no box. A secondary «Вставить из буфера» button sits on the empty page (navigator.clipboard.readText) and disappears after the paste.

```
              ────
 ←  Несколько слов              ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 la thune — бабки, деньги
 ________________________________
 kiffer — тащиться
 ________________________________
 chelou — стрёмный
 ________________________________

 ________________________________
      [ Вставить из буфера ]
▓▓▓▓▓▓▓▓▓▓ клавиатура ▓▓▓▓▓▓▓▓▓▓▓▓

подсказка-образец лежит на
линейках 24px (тетрадный лист);
кнопка исчезает после вставки
```

Removed / hidden: Same as A; Bordered textarea box: replaced by ruled lines (repeating-linear-gradient of 1px rule every 24px, background-attachment local)

New visual / motion: Ruled page background that scrolls with the text; «Вставить из буфера» fades out (--dur-quick) once text exists

Brand conflicts: SPEC «No gradients-as-decoration»: the ruled lines must be drawn as 1px hairlines (a repeating-linear-gradient used only as a line pattern, same as the optional card ruled lines), not as a tint; iOS shows a system «Вставить» confirmation bubble on clipboard.readText; acceptable, but it is one more tap

**Why B:** Both are cheap, and B adds the one missing affordance (one-tap paste, which matters most on iOS). The ruled page makes the empty state self-explanatory without a paragraph. It is on-brand: hairlines, ink on paper.

Files: `/home/user/french_cards/components/add/ListPanel.tsx (textarea :153-168 → ruled page + paste button; hint :169-171 → per-row error line)`, `/home/user/french_cards/components/add/QuickAddSheet.tsx (label :275-277 dropped in list mode; list footer :687-696 rendered only when listRows.length > 0)`, `/home/user/french_cards/mockups/SPEC.md (new short section «Несколько слов (телефон)»; no board exists — add mockups/Add-List.dc.html)`, `/home/user/french_cards/e2e/add.spec.ts (list tests)`

### A8 · «Несколько слов» — разбор вставленного списка (M-Add-Detect F4)

**Today:** 16 elements, density 8. After a paste the same 12 words show twice: the raw textarea (up to 40vh) and the parsed rows. The format hint stays, then a «Тема  По темам автоматически ▾» select and «РАЗБОР · 11 из 12», which is the third count after the chrome label and the footer. The status bar follows, then 76px rows with an example line, a meter and a mono theme on every row. With the keyboard still up, zero rows are visible.

#### A · Подрезать (S)

Cap the textarea at 3 lines (▾ expands it), drop the example line (56px rows; examples are still saved), drop the hint, «Разбор · 11 из 12» and the chrome count. The count lives only on the button. The theme select stays.

```
 ←  Несколько слов              ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌────────────────────────────────┐
│ la thune — бабки, деньги       │
│ le fric — бабло                │
│ bouffer — жрать             ▾  │
└────────────────────────────────┘
 ТЕМА     По темам автоматически ▾
 ОПРЕДЕЛЯЕМ · 4 / 12  ━━━━──────
 ■ la thune               ▮▮▮▯
   бабки, деньги        ДЕНЬГИ
──────────────────────────────────
 ■ le fric                ▮▮▯▯
   бабло                ДЕНЬГИ
──────────────────────────────────
 □ chelou             УЖЕ ЕСТЬ
   стрёмный
──────────────────────────────────
[      Добавить 11 слов       ]

поле сжато до 3 строк (▾
раскрывает); строки 56px без
примера; нет «Разбор · 11 из 12»
```

Removed / hidden: Textarea height: capped at 3 lines after a paste; Example line per row (76 → 56px); examples still saved via saveList; Format hint paragraph; «РАЗБОР» header + «11 из 12»; Chrome label «СПИСОК · 12 СТРОК»

Brand conflicts: MOTION-SPEC A10: «Rows render at 76 px from the start (example line reserved)»; 56px from the start keeps CLS = 0 but changes the spec; M-Add-Detect F4 shows the example line

#### B · Полоска + группы по темам (M)

On paste the keyboard goes down and the textarea folds into one 44px ruled strip, «Вставлено 12 строк · Изменить». Rows are 48px single lines (checkbox, FR serif, RU muted, small meter). Instead of a theme label per row they sit under thin ledger sub-headers «ДЕНЬГИ 2», «ЭМОЦИИ 2», «+ ТРАНСПОРТ, НОВАЯ 1» (the Sort-Plan pattern); tap a header to retarget the group. The global theme moves to the footer as «Тема ▾» beside «Добавить 11 слов».

```
 ←  Несколько слов              ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Вставлено 12 строк     Изменить
──────────────────────────────────
 ОПРЕДЕЛЯЕМ · 4 / 12  ━━━━──────
 ДЕНЬГИ ───────────────────── 2 ─
 ■ la thune  бабки     ▮▮▮▯ arg.
 ■ le fric   бабло     ▮▮▯▯ fam.
 ЕДА ──────────────────────── 1 ─
 ■ bouffer   жрать     ▮▮▯▯ fam.
 ЭМОЦИИ ───────────────────── 2 ─
 ■ kiffer    тащиться  ▮▮▮▯ arg.
 □ chelou    стрёмный   УЖЕ ЕСТЬ
 ЕЩЁ ОПРЕДЕЛЯЕМ ───────────── 3 ─
 ■ la meuf   девушка    ▯▯▯▯  …
 ■ un pote   кореш      ▯▯▯▯  …
──────────────────────────────────
[Тема ▾] [  Добавить 11 слов  ]

вставка → клавиатура вниз, поле
складывается в полоску. Строки
48px. Тап по заголовку группы —
сменить тему всей группе
```

Removed / hidden: Raw textarea after paste: folded into the «Вставлено N строк · Изменить» strip (reopens on tap); Per-row mono theme: replaced by group sub-headers; Per-row example line; «Тема  По темам автоматически ▾» select: compact «Тема ▾» in the footer; «Разбор · 11 из 12», chrome count, format hint

New visual / motion: Fold: textarea height → 44px (--dur-move, --ease-standard), parsed rows take its place; Rows move into their theme group as detection lands (needs care, see conflicts)

Brand conflicts: MOTION-SPEC principle 4 «Nothing jumps» and 5.10 «no flying ghost»: rows regrouping while she scans breaks this unless the grouping happens once; MOTION-SPEC A10: 76px rows with the example line

#### C · Свернуть и разложить один раз (M) — **рекомендуется**

B's fold and ledger, with honest motion. During detection the rows stay a flat list in paste order (the 21px status line counts). Only on «ГОТОВО · 12 СЛОВ» do they regroup into theme sections, once, as a bulk change: one spotlight on the group containers, no per-row flight (5.10 bulk rule). Unticked rows dim to .5 and the tick stroke draws itself (I6). The button label swaps «Добавить 11 слов» → «Добавить 10 слов» as text, not as a counter.

```
 ←  Несколько слов              ×
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Вставлено 12 строк     Изменить
══════════════════════════════════
 ГОТОВО · 12 СЛОВ
 ДЕНЬГИ ───────────────────── 2 ─
 ✓ la thune  бабки     ▮▮▮▯ arg.
 ✓ le fric   бабло     ▮▮▯▯ fam.
 ЭМОЦИИ ───────────────────── 2 ─
 ✓ kiffer    тащиться  ▮▮▮▯ arg.
 · chelou    стрёмный   УЖЕ ЕСТЬ
 + ТРАНСПОРТ, НОВАЯ ───────── 1 ─
 ✓ la caisse тачка     ▮▮▯▯ fam.
──────────────────────────────────
[Тема ▾] [  Добавить 10 слов  ]

вставка: поле складывается в
полоску (высота --dur-move), а
строки встают на его место.
Группы собираются один раз, на
«Готово». Снятая строка — .5,
галочка рисуется (I6)
```

Removed / hidden: Same as B

New visual / motion: Fold motion (--dur-move) on paste, with the keyboard blurred; One regroup at «Готово» with a container spotlight (5.14 «a bulk change lights the containers»); Tick stroke draw --dur-quick, unticked row opacity .5 (5.9); Footer label text swap, no count-up

Brand conflicts: MOTION-SPEC A10: 76px rows / example line reserved; the per-row spotlight becomes per-group at the end; A regroup is still one layout change at the end; it is acceptable only as the bulk exception in 5.10 and needs a line in A10

**Why C:** C removes the double display of the same 12 words, gets the keyboard out of the way so rows are actually visible, and replaces 12 repeated theme labels with 3–4 ledger headers. It does this without breaking «nothing jumps» while she is scanning, because the regroup happens once, at «Готово», as a bulk change. The motion it adds (fold, tick draw) already exists in the Import flow (I3, I6), so it is M, not L.

Files: `/home/user/french_cards/components/add/ListPanel.tsx (textarea :153-168 → foldable strip; hint :169-171; theme FieldRow :175-185 → footer; SectionHeader «Разбор» :187 removed; ListRowItem :203-283 → 48px one-line, no example; new grouping by autoFolder once detection is done)`, `/home/user/french_cards/components/add/QuickAddSheet.tsx (openList / paste :427+ blurs the textarea and sets folded; liveListRows :255-270 sorted into groups on done; list footer :687-696 gets «Тема ▾» + «Добавить N слов»; label :275-277)`, `/home/user/french_cards/components/add/parts.tsx (FolderSelect compact footer variant)`, `/home/user/french_cards/components/add/folder-choice.ts (group headers from FolderChoice, «+ новая»)`, `/home/user/french_cards/mockups/M-Add-Detect.dc.html (F4)`, `/home/user/french_cards/mockups/MOTION-SPEC.md (A10 :382)`, `/home/user/french_cards/e2e/add.spec.ts (list)`, `/home/user/french_cards/e2e/add-detect.spec.ts`

## Библиотека (phone, below md)

### Library home: themes view (default, with «Входящие»)

**Today:** Elements above the fold: a 28px title, the Контекст magnifier and the gear; a two-row ledger box with 5 big numbers (1318 / 27 / 56 / 202 / 96); a dashed «Входящие · 7 БЕЗ ТЕМЫ — ✦ Разложить ›» row; a black «Все слова · 1318 · одним списком» tile; then 116px two-column tiles, each with a band, name, «38 · 2 к повт.», 3 italic sample words and a mastery line. Only 4 themes are fully visible out of about 35. Upkeep rows sit at the bottom of the grid where nobody scrolls. Above the fold there are 9 counts or controls against 4 themes, and the total word count is printed twice.

#### A · Conservative trim (S)

Keep the two-column catalogue tiles but cut every tile to 96px and remove the duplicated facts. The ledger box becomes one mono subline under the title, where each count is a tappable filter word and keeps its long-press menu. The KPI row goes to the Повторение done receipt. The italic sample line is removed. Tile meta becomes «38 · 2», with the 2 in red only when due > 0. Upkeep is reduced to one quiet row after the grid.

```
Библиотека                 ❝  ⚙
1318 слов · 27 к повт. · 56 тр.
┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
┆Входящие  7                ✦ ›┆
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
█ Все слова              1318 ›█
┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐
│03 Жильё      ││17 Администр… │
│38 · 2        ││44 · 1        │
│▬▬▬▬──────────││▬─────────────│
└──────────────┘└──────────────┘
┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐
│23 Абстрактн… ││26 Глаголы B2 │
│52            ││36 · 4        │
│▬▬▬▬▬▬▬───────││▬▬────────────│
└──────────────┘└──────────────┘
┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐┌▀▀▀▀▀▀▀▀▀▀▀▀▀▀┐
│33 Частые вы… ││04 Транспорт  │
│27 · 3        ││19            │
└──────────────┘└──────────────┘
┌────────────────────────────┬─┐
│⌕ Поиск по FR и RU          │☰│
└────────────────────────────┴─┘
Повтор. Упражн. Добавить ▔Библ.
```

Removed / hidden: KPI cells «ПОВТОРЕНО 202» and «СЕГОДНЯ 96»: moved to the Повторение «Готово на сегодня» receipt; Ledger box with 64px cells: becomes the mono subline «1318 слов · 27 к повт. · 56 тр.» (each word is still a toggle filter, and long press still opens LedgerMenuSheet); Italic «three newest words» line on every tile: removed; «к повт.» text on tiles: the due count stays as a bare red numeral; Header magnifier glyph: replaced by a distinct quote glyph ❝ (still «Контекст»), so it no longer twins the search box; Upkeep block of 4 rows: becomes one row «Уход за карточками · 3 ›» after the last tile, opening a small sheet. The «Все слова разложены — Разложить по темам» row is removed (re-sort stays in that sheet); «+ Новая тема» tall dashed tile: becomes a 44px dashed row after the last theme; «Разложить ›» text in the inbox row: becomes a spark glyph button (the aria-label keeps «Разложить по темам»)

New visual / motion: The red numeral on a tile is the only red on the grid, so the eye goes straight to drawers that need work; The tile mastery line draws to its value once, the first time the tile enters the viewport (scaleX, linear, ≤400ms, never backwards)

Brand conflicts: SPEC.md:143: the three-cell ledger strip and the italic sample line are both specified; SPEC.md:103: the tile meta format is «42 · 6 К ПОВТ.»; SPEC.md:97: names the 44px magnifier for «Контекст»; MOTION-SPEC §4.6 L1: the reserved-height UpkeepBlock choreography becomes unnecessary and needs rewriting

#### B · Card-catalogue drawer list (M) — **рекомендуется**

Replace the 35 tall tiles with 52px ruled drawer rows that read like a course table of contents. Each row has a 3×14 theme-colour tick (the same tick as the word sheet's theme chip, WordDetailBody.tsx:485), the mono course number «03», the name in Newsreader 19 without truncation in most cases, and the total in mono on the right. A small red ▪ sits before the total only when something is due. The row's bottom hairline is the mastery line: it is filled in the theme ink up to the learned %. About 9 themes fit above the fold instead of 4. «Все слова» becomes the first ruled row. There is one dashed attention slot: «Входящие 7» in red when something is unsorted, otherwise a muted «Уход за карточками · 3 ›» when upkeep exists, otherwise nothing. The header keeps only the title, the Контекст glyph and the gear, with one subline «27 к повт. · 56 трудных» as underlined ink words that act as filters.

```
Библиотека                 ❝  ⚙
27 к повт. · 56 трудных
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Все слова                 1318 ›
───────────────────────────────
┆ Входящие  7             ✦ › ┆
───────────────────────────────
▍03  Жильё                ▪ 38
▬▬▬▬▬▬▬────────────────────────
▍17  Администрация и док… ▪ 44
▬▬─────────────────────────────
▍23  Абстрактные слова B2   52
▬▬▬▬▬▬▬▬▬▬▬▬───────────────────
▍26  Глаголы B2 для текс… ▪ 36
▬▬▬────────────────────────────
▍33  Частые выражения     ▪ 27
▬▬▬▬▬▬▬▬▬▬─────────────────────
▍04  Транспорт              19
▬▬▬▬▬──────────────────────────
▍05  Работа               ▪ 41
───────────────────────────────
┌────────────────────────────┬─┐
│⌕ Поиск по FR и RU          │☰│
└────────────────────────────┴─┘
Повтор. Упражн. Добавить ▔Библ.
```

Removed / hidden: Ledger box (5 numbers): only «27 к повт. · 56 трудных» stays, as a subline of tappable ink words with the long-press menu kept. The total lives on the «Все слова» row; KPI «ПОВТОРЕНО / СЕГОДНЯ»: moved to the Повторение done receipt; Black «Все слова · одним списком» tile: becomes a plain first ruled row (same tap, setView('words')); Two-column 116px tiles with band, samples and two-number meta: become drawer rows with one number and a due ▪ mark (the count stays in the aria-label and in the theme page footer); Upkeep block: becomes the single dashed attention slot «Уход за карточками · 3 ›», shown only when the inbox is empty and upkeep exists. It opens a sheet with «✦ Определить уровень языка · 98», «✦ Дополнить карточки · 12», «✦ Разложить по темам» and «Последняя раскладка — Отменить». The undo also stays in the post-run snackbar; «+ Новая тема» tile: becomes a 44px dashed row after the last drawer; Header magnifier: becomes the ❝ glyph for «Контекст»

New visual / motion: Mastery as the row's own hairline in theme ink, drawn to its value once on first view (scaleX, linear, ≤400ms); Red ▪ due mark: red appears only where attention is needed; Tap on a drawer: the existing nav-forward slide, plus a shared-element morph in which the row's tick grows into the theme page's top band and the name settles into the H1 (view-transition-name per theme id, 24px max travel, crossfade under reduced motion); After «Разложить» or an import, the spotlight (MOTION-SPEC §5.14) lights the drawers that received words, and a mono «+3» shows at the row end and fades with the spotlight; The tile's link-pending ink run (FolderTile.tsx:23-35) moves onto the row hairline unchanged

Brand conflicts: SPEC.md:103: «each theme = a white tile with 1px rule border, 3px top band … counts `42 · 6 К ПОВТ.`» needs rewording to drawer rows; SPEC.md:143: ledger strip, black «Все слова» tile, italic sample line and upkeep rows under the tiles are all specified; SPEC.md:63: «no left-border accent cards». This direction avoids that by using a 3×14 tick, not a full-height border; say so explicitly in the SPEC; MOTION-SPEC §4.6 L1/L3: the reserved-tile and upkeep choreography must be redefined for rows (the reserved shape becomes the number of rows × 52px)

#### C · Wall of drawers (L)

A three-column grid of 72-88px drawer fronts. Each front has a colour band, a large mono course number as the drawer label, a two-line-clamped name in Newsreader 15, and the count, with mastery as a 2px bottom rule. Fuller ink reads as learned, so the whole library becomes a visual map of the course at a glance. Due is shown as a red ▪ on the label line. The large title collapses into a compact sticky header on scroll, with a scroll-driven hairline under it. The drawer front morphs into the theme page header when tapped.

```
Библиотека                 ❝  ⚙
27 к повт. · 56 трудных
┆ Входящие  7             ✦ › ┆
█ Все слова              1318 ›█
┌────────┐┌────────┐┌────────┐
│▀▀ 03   ││▀▀ 17  ▪││▀▀ 23   │
│Жильё   ││Админис…││Абстрак…│
│        ││        ││        │
│38 ▬▬▬──││44 ▬────││52 ▬▬▬▬─│
└────────┘└────────┘└────────┘
┌────────┐┌────────┐┌────────┐
│▀▀ 26  ▪││▀▀ 33  ▪││▀▀ 04   │
│Глаголы ││Частые  ││Транс…  │
│B2      ││выраж.  ││        │
│36 ▬────││27 ▬▬▬──││19 ▬▬───│
└────────┘└────────┘└────────┘
┌────────┐┌────────┐┌────────┐
│▀▀ 05  ▪││▀▀ 06   ││▀▀ 07   │
│Работа  ││Еда     ││Город   │
│41 ▬▬───││15 ▬▬▬▬─││22 ▬────│
└────────┘└────────┘└────────┘
┌────────────────────────────┬─┐
│⌕ Поиск по FR и RU          │☰│
└────────────────────────────┴─┘
Повтор. Упражн. Добавить ▔Библ.
```

Removed / hidden: Ledger box and KPI row (same as B); Sample words and «к повт.» text on tiles; Upkeep block: moves to the attention slot (same as B); Long theme names: truncated to 2 lines, with the full name on the theme page and in the aria-label

New visual / motion: The whole course as a mastery heat map drawn only in ink rules; Scroll-driven collapsing title (animation-timeline: scroll(), behind @supports; static on Firefox); Drawer front → theme header shared-element morph; Mastery rules draw in once per drawer on first view

Brand conflicts: SPEC.md:79: list and tile names are specified at Newsreader 19; 15px is needed for 3 columns; SPEC.md:103 and :143: tile anatomy; Long Russian course names («Администрация и документы», «Глаголы B2 для текстов») truncate badly at about 100px wide, which hurts the primary job (find the right theme); Research guardrail: replacing a scannable list with a dense grid can scale worse (M3E study: dropping the scrolling list scored lower)

**Why B:** The library is a numbered course of about 35 themes, so a ruled table of contents beats a tile grid. It shows 9 themes above the fold instead of 4, keeps full names readable, and needs no new decoration: the mastery line is simply the row's hairline. Each fact appears once (total on «Все слова», due in the subline and as a ▪ per row, the exact due count in the theme footer). Nothing daily gets further away. Search and filters stay under the thumb, the due and difficult filters stay one tap away in the subline, and Контекст stays in the header with its own glyph. Chores collapse into one slot that shows only when there is something to do. For the dynamic side, take the drawer → theme page morph from C. It reuses the existing nav-forward transition (React 19.3 ViewTransition and Next 16.4 are already in the project).

Files: `components/library/LibraryScreen.tsx:281-305 (header: replace the Контекст glyph; subline under the H1)`, `components/library/LibraryScreen.tsx:307-340 (ledger box and KPI row become a subline of two filter words with long press kept)`, `components/library/LibraryScreen.tsx:592-621 (LedgerCell and KpiCell become an inline SublineFilter that reuses useLongPress)`, `components/library/LibraryScreen.tsx:417-481 (themes view: one attention slot, a «Все слова» ruled row, drawer rows instead of the grid, a 44px «+ Новая тема» row)`, `components/library/LibraryScreen.tsx:168-215,483-484,623-708 (upkeep rows and UpkeepBlock become an UpkeepSheet opened from the attention slot; drop the «Все слова разложены» row)`, `components/library/FolderTile.tsx:11-113 (new FolderRow: 3×14 tick, mono number, name, total, red ▪, hairline mastery; drop samples; NewFolderRow; keep MasteryLine pending ink run)`, `components/library/FolderTile.tsx:119-136 (TileSkeleton becomes a 52px row skeleton)`, `components/library/first-paint.ts:45-55 (LibraryShape: rows instead of tiles, drop the upkeep reserve)`, `components/library/LedgerMenuSheet.tsx (unchanged API, now opened from the subline words)`, `components/ui/Icons.tsx (add a 'quote' glyph for «Контекст»)`, `components/context/ContextLink.tsx:55,74 (use the same Контекст glyph so the entry points match)`, `app/globals.css:547-581 (view-transition-name for the theme band and name morph on top of nav-forward; reduced-motion crossfade at :615-623)`, `mockups/SPEC.md:97,103,143 (update the Контекст glyph, theme presentation and phone library layout)`, `mockups/MOTION-SPEC.md §4.6 L1, L3, L6 and §5.14 (row reserve, morph, «+3» spotlight)`, `mockups/Library-Lean-B.dc.html and mockups/M-Library-Drawer.dc.html (new boards)`

### Library: «Все слова» list, search results and filtered list (listMode)

**Today:** The 135px ledger box stays above the list, so rows start at about y 215 and only about 7 rows of 64px fit. Each row carries 8 items: a status dot, the FR headword, a POS abbreviation, RU, an optional origin, the theme name, the slang meter, a level mark «≈B1», and a mono schedule label. The dot and the label encode the same state. The level estimate («accurate about half the time») sits on all 1318 rows. Paging is «Показать ещё 200».

#### A · Trim the row (S)

Hide the ledger and subline in listMode, since the section head already gives the count. Rows keep FR, abbreviation and RU on the left and slang meter plus schedule label on the right. The status dot goes because the label already says the state. The level column shows only when the list is ordered by «По уровню языка» or filtered by level. Origin moves to the word sheet.

```
Библиотека                 ❝  ⚙
ВСЕ СЛОВА · 1318         К темам
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
la thune  n. f.           ▮▮▮▯
бабки, деньги          К ПОВТ.
───────────────────────────────
le fric  n. m.            ▮▮▯▯
бабло                ЧЕРЕЗ 4 Д
───────────────────────────────
chelou  adj.          ▮▮▮▯ verl.
стрёмный, странный       НОВОЕ
───────────────────────────────
kiffer  v.                ▮▮▮▯
тащиться, обожать      К ПОВТ.
───────────────────────────────
la meuf  n. f.        ▮▮▮▯ verl.
девушка, тёлка       ЧЕРЕЗ 2 Д
───────────────────────────────
une blague  n. f.
шутка                ЧЕРЕЗ 9 Д
───────────────────────────────
┌────────────────────────────┬─┐
│⌕ Поиск по FR и RU          │☰│
└────────────────────────────┴─┘
Повтор. Упражн. Добавить ▔Библ.
```

Removed / hidden: Ledger box and subline in listMode: removed (the section head states the count); Status dot: merged into the schedule label; Level mark «≈B1» on rows: shown only when order = level or a level filter is on; otherwise it appears in the word sheet; Origin after RU: moved to the word sheet; Slang meter for neutral words: not drawn (sample data: «une blague — neutral (no badge)»)

New visual / motion: Contextual column: sorting by level slides the level column in (opacity plus 4px, --dur-enter) instead of it always being there

Brand conflicts: D5 A (WordList.tsx:62 «the slang meter, then Уровень языка» on every row) is reversed to contextual-only; SPEC.md:245 (Folder board: status dot per row)

#### B · Dictionary line, one signal (S) — **рекомендуется**

A row is a dictionary line: the FR headword in serif with its italic abbreviation on line 1, RU on line 2, and only the slang meter on the right (nothing for neutral words). The card's state becomes a single mark: a small red ▪ in the left margin when the word is due, and nothing otherwise. «Через 4 д», «новое» and «на паузе» move to the word sheet. In cross-theme lists and search results, the theme becomes a 3×14 colour tick at the end of the RU line instead of a text name. Rows tighten from 64px to 56px, so about 9 rows show instead of 7. Search matches get a 1.5px red ink underline under the matched substring.

```
Библиотека                 ❝  ⚙
ВСЕ СЛОВА · 1318         К темам
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▪ la thune  n. f.         ▮▮▮▯
  бабки, деньги
───────────────────────────────
  le fric  n. m.          ▮▮▯▯
  бабло
───────────────────────────────
  chelou  adj.      ▮▮▮▯ verl.
  стрёмный, странный
───────────────────────────────
▪ kiffer  v.              ▮▮▮▯
  тащиться, обожать
───────────────────────────────
  la meuf  n. f.    ▮▮▮▯ verl.
  девушка, тёлка
───────────────────────────────
  une blague  n. f.
  шутка
───────────────────────────────
┌────────────────────────────┬─┐
│⌕ Поиск по FR и RU          │☰│
└────────────────────────────┴─┘
Повтор. Упражн. Добавить ▔Библ.
```

Removed / hidden: Ledger box and subline in listMode; Status dot (4 colours) plus the mono schedule label: become one red ▪ for due only. Schedule details go to the word sheet's history line; the aria-label (rowLabel) keeps the full state; Level mark: contextual only, as in A; Origin after RU: moved to the word sheet; Theme name text in cross-theme lists: becomes a 3×14 colour tick (the name stays in the aria-label); «Открыть карточку» in the long-press menu (WordList.tsx:339): removed, because it duplicates the row tap

New visual / motion: Red ink underline on the search match (the same 1.5px red underline as «Примеры из жизни», ContextLink.tsx:17), drawn left to right once when results land (background-size, linear, 240ms); The existing strike-through delete and Collapse stay the model for row motion

Brand conflicts: D5 A (level column on every row) and SPEC.md:245 (status dot) are reversed; SPEC.md:89-92: the meter stays, so no conflict there

#### C · Alphabet drawer with scrub strip (L)

B's rows, plus card-catalogue navigation for «По алфавиту». Sticky mono letter dividers with a thin ink rule sit between letter groups. A 16px scrub strip on the right edge, when dragged, shows a large Newsreader letter on a white card with a hairline and no shadow, and jumps the list. The letter sort ignores le/la/les/l'/un/une, as a dictionary does. This replaces «Показать ещё 200» paging with gesture navigation.

```
Библиотека                 ❝  ⚙
ВСЕ СЛОВА · 1318         К темам
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
B ─────────────────────────── A
▪ la bagnole  n. f.     ▮▮▯▯  B
  тачка                       C
────────────────────────────  D
  une blague  n. f.           F
  шутка             ┌─────┐   G
────────────────────│  C  │── K
  bouffer  v.       └─────┘   L
  жрать, есть         ▮▮▯▯   M
C ─────────────────────────── N
▪ se casser  v. pron.   ▮▮▮▯  P
  свалить, сбежать            R
────────────────────────────  S
  chelou  adj.    ▮▮▮▯ verl.  T
  стрёмный, странный          V
────────────────────────────  Z
┌────────────────────────────┬─┐
│⌕ Поиск по FR и RU          │☰│
└────────────────────────────┴─┘
Повтор. Упражн. Добавить ▔Библ.
```

Removed / hidden: «Показать ещё 200 из 1118» button (rows already use content-visibility:auto); Everything B removes

New visual / motion: Scrub strip with a large serif letter card (opacity only, --dur-quick); Sticky letter dividers like drawer labels (position: sticky, no motion)

Brand conflicts: None to the brand. It needs a dictionary sort key that strips articles (the current «По алфавиту» order may sort «la bagnole» under L); Only meaningful in alphabetical order, so the strip hides for other orders

**Why B:** The job is to scan for a word. B removes everything that competes with FR and RU: about 4 items per row instead of 8, and roughly 9 rows visible instead of 7 because the ledger is gone. Red marks exactly the words that need attention. The state stays fully available in the word sheet and in the screen-reader label. B is cheap (one component) and reversible. The red match underline is the small piece of dynamics that makes search feel alive. C is a good later addition once the alphabetical order is fixed.

Files: `components/library/LibraryScreen.tsx:307-340 (hide the ledger and subline when listMode)`, `components/library/LibraryScreen.tsx:342-369 (section head stays: «Все слова · 1318» / «К темам» / «Сбросить фильтр»)`, `components/library/WordList.tsx:30-81 (WordRowContent: drop the dot, schedule label and origin; due ▪; theme tick; contextual LevelMark; 56px)`, `components/library/WordList.tsx:84-92 (rowLabel keeps the full state for screen readers)`, `components/library/WordList.tsx:136 (contain-intrinsic-size 64 to 56)`, `components/library/WordList.tsx:338-341 (drop «Открыть карточку»)`, `components/library/format.ts:45-86 (STATUS_DOT and dueLabel no longer used by phone rows)`, `components/library/LevelMark.tsx (render only when the order or filter is level)`, `components/library/LibraryScreen.tsx:370-376 and FolderScreen.tsx:223-225 (SkeletonRow height 64 to 56)`, `components/ui/SlangMeter.tsx (no meter for level 0 in rows)`, `mockups/Library-List-B.dc.html (new board)`

### Library: search with no match

**Today:** The ledger is still shown. Under «Ничего не найдено» comes a redundant sentence, then the Контекст row, then «+ Добавить «…»» as a secondary button, so the likelier action is last.

#### A · Reorder and drop the sentence (S)

Hide the ledger and remove the explanatory sentence. «+ Добавить «se barrer»» becomes the primary black button at the top. The Контекст row sits below it.

```
Библиотека                 ❝  ⚙
НИЧЕГО НЕ НАЙДЕНО
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
████ + Добавить «se barrer» ████
───────────────────────────────
❝ Посмотреть «se barrer»
  в Контексте                  ›
  примеры из веба, синонимы
───────────────────────────────





┌────────────────────────────┬─┐
│⌕ se barrer              ✕  │☰│
└────────────────────────────┴─┘
Повтор. Упражн. Добавить ▔Библ.
```

Removed / hidden: Ledger box; «Такого слова нет ни во французском, ни в переводе.» (:401, emptyMessage)

#### B · Blank index card (S) — **рекомендуется**

The empty state is a blank index card: white, a red header rule, and the query pencilled in large Newsreader italic with two dashed ruled lines below it, as if waiting to be filled in. Directly under it is one primary «+ Добавить «se barrer»», and below that the Контекст row. Tapping the card itself also opens Add prefilled.

```
Библиотека                 ❝  ⚙
НИЧЕГО НЕ НАЙДЕНО
┌─────────────────────────────┐
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ se barrer                   │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
└─────────────────────────────┘
████ + Добавить «se barrer» ████
───────────────────────────────
❝ Посмотреть «se barrer»
  в Контексте                  ›
───────────────────────────────


┌────────────────────────────┬─┐
│⌕ se barrer              ✕  │☰│
└────────────────────────────┴─┘
Повтор. Упражн. Добавить ▔Библ.
```

Removed / hidden: Ledger box; Explanatory sentence; The Контекст row's subline «примеры из веба, синонимы, спряжение» (kept in its aria-describedby)

New visual / motion: The card writes in (opacity plus 4px, --dur-enter) when the no-match state settles, and the query text updates in place as the user keeps typing (no re-entry); The empty card is the same object Add will fill, which gives continuity into the Add sheet

Brand conflicts: None. NN/g and SPEC both favour typographic empty states, and the drawing uses hairlines only

**Why B:** It costs the same as A but turns a dead end into the start of the next action. The pencilled card is the brand's own object, there is one primary action («Добавить»), and Контекст stays one tap away.

Files: `components/library/LibraryScreen.tsx:267-279 (emptyMessage: not shown for search)`, `components/library/LibraryScreen.tsx:399-411 (blank card, primary «Добавить», ContextRow second)`, `components/context/ContextLink.tsx:32-60 (ContextRow: optional compact variant without the subline; new glyph)`, `mockups/Library-NoMatch-B.dc.html (new board)`

### Theme page /library/[id] (phone)

**Today:** Elements: back arrow, the eyebrow «БИБЛИОТЕКА / ТЕМА», «⋯», a 32px two-line H1, chips «ЗАКРЕПЛЕНА» and «НА ПАУЗЕ», «44 СЛОВА · 1 К ПОВТОРЕНИЮ», a progress row «4 % ВЫУЧЕНО», a spreadsheet column head «СЛОВО … СЛЕНГ · УР. · ПОКАЗ», 8-item rows, and the footer «Повторить тему 1». The due count appears three times.

#### A · Trim the header (S)

Remove the eyebrow, the «закреплена» chip and the column head. Merge the meta line and the progress row into one row «44 слова ▬▬──── 4 %». The due count lives only in the footer button. Rows follow the list's trimmed row (direction A).

```
←                              ⋯
17 Администрация
и документы
44 слова  ▬▬───────────── 4 %
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
une attestation  n. f.  К ПОВТ.
справка
───────────────────────────────
le formulaire  n. m.     НОВОЕ
бланк, анкета
───────────────────────────────
la mairie  n. f.     ЧЕРЕЗ 4 Д
мэрия
───────────────────────────────
la paperasse  n. f.  ▮▮▯▯ 2 Д
бумажки, бюрократия
───────────────────────────────
le guichet  n. m.    ЧЕРЕЗ 2 Д
окошко, касса
───────────────────────────────
┌─────────────────────────────┐
│███ Повторить тему  1 ███████│
└─────────────────────────────┘
Повтор. Упражн. Добавить ▔Библ.
```

Removed / hidden: Eyebrow «Библиотека / тема» (FolderScreen.tsx:143); «закреплена» chip: moved to the «⋯» menu (and to «Название и цвет», see the theme menu); «N к повторению» in the meta line: kept only in the footer button; «выучено» word: the % sits at the end of the progress line; Column head «Слово · Сленг · ур. · показ» (:196-201): the ink rule stays as the list's top edge

Brand conflicts: SPEC.md:244 (sub «18 слов · 3 к повторению»)

#### B · Pulled-out drawer, due first (M) — **рекомендуется**

A plus three changes. A full-width 3px theme-colour band at the very top of the page continues the drawer row's tick. Rows use the one-signal dictionary line (list direction B). Due words come first under a short red-ruled label «К повторению», then a plain hairline gap before the rest, so per-row schedule text is unnecessary. «на паузе» stays as the only chip because it changes the footer.

```
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
←                              ⋯
17 Администрация
и документы
44 слова  ▬▬───────────── 4 %
К ПОВТОРЕНИЮ ━━━━━━━━━━━━━━━━━━
une attestation  n. f.
справка
───────────────────────────────

le formulaire  n. m.
бланк, анкета
───────────────────────────────
la mairie  n. f.
мэрия
───────────────────────────────
la paperasse  n. f.       ▮▮▯▯
бумажки, бюрократия
───────────────────────────────
le guichet  n. m.
окошко, касса
┌─────────────────────────────┐
│███ Повторить тему  1 ███████│
└─────────────────────────────┘
Повтор. Упражн. Добавить ▔Библ.
```

Removed / hidden: Everything A removes; Per-row schedule label and status dot: replaced by grouping (due section first); Neutral words show no meter, so a course theme like «Администрация» is mostly bare FR/RU lines

New visual / motion: Top band in theme ink connects to the library drawer tick; After a review, returning to the page collapses rows that left the due group and re-enters them below (existing Collapse plus spotlight, §5.10), so the group visibly empties; The red rule under «К повторению» draws once on page enter (scaleX, linear, ≤320ms)

Brand conflicts: SPEC.md:244-245 (header chip, status dot per row); Grouping depends on no user-selectable order on the theme page (true today)

#### C · Drawer morph plus ruler (L)

B plus the theme's identity as an object. The big mono course number «17» is the hero above the name. Mastery becomes a ruler: a 2px theme-ink line with a tick every 10 words, filled to the learned words, with the total at its end and no %. The tapped drawer row morphs into the header: its tick becomes the band, its number and name glide into place (shared element, ≤24px travel). When the last due word is done, the footer crossfades «Повторить тему 1» to «Тренировка всей темы 44» with a 1px ink rule drawn under it once.

```
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
←                              ⋯
17
Администрация и документы
▬▬┼────┼────┼────┼────┤      44
К ПОВТОРЕНИЮ ━━━━━━━━━━━━━━━━━━
une attestation  n. f.
справка
───────────────────────────────

le formulaire  n. m.
бланк, анкета
───────────────────────────────
la paperasse  n. f.       ▮▮▯▯
бумажки, бюрократия
───────────────────────────────
le guichet  n. m.
окошко, касса
───────────────────────────────
┌─────────────────────────────┐
│███ Повторить тему  1 ███████│
└─────────────────────────────┘
Повтор. Упражн. Добавить ▔Библ.
```

Removed / hidden: «4 % выучено» number: replaced by the ruler length; «44 слова» text: becomes the ruler's end label

New visual / motion: Shared-element morph from the drawer row (view-transition-name theme-band-<id> and theme-name-<id>, --dur-turn, position and size only); Ruler fill draws to the true value on enter and never moves backwards; Footer label crossfade (CrossfadeText, SortPlanSheet.tsx:238) plus a one-time ink rule

Brand conflicts: MOTION-SPEC §4.6 L6 marks the slide as P2; the morph extends it; The ruler loses the explicit % (an accessibility label must carry it: role=progressbar aria-valuenow)

**Why B:** It halves the header (5 items to 2 rows), states the due count once (in the button that acts on it), and makes the list self-explanatory without a spreadsheet header. The colour band ties the page to the drawer the user tapped. Ship the shared-element morph from C next, since it builds on B's band and the existing nav-forward transition.

Files: `components/library/FolderScreen.tsx:142-153 (drop the eyebrow; Header without breadcrumb)`, `components/library/FolderScreen.tsx:156-160 (keep only the «на паузе» chip)`, `components/library/FolderScreen.tsx:161-194 (one row: count, progress line, %)`, `components/library/FolderScreen.tsx:196-207 (drop the column head; split items into due and rest groups)`, `components/ui/Header.tsx:47-80 (optional top colour band prop)`, `components/library/WordList.tsx:30-81 (shared one-signal row, see the list screen)`, `components/library/FolderScreen.tsx:230-253 (footer unchanged; it remains the single home of the due count)`, `app/globals.css:565-581 (theme band and name view-transition names, for C later)`, `mockups/Folder-Lean-B.dc.html (new board)`

### Word detail sheet (phone, full height)

**Today:** There are about 40 elements. The theme chip, ✕ and red rule; a 36px headword with a pencil; a grammar line with ≈B1; RU. Then a «Уровень языка» field that repeats ≈B1 with a source caption, a 2-line disclaimer, «Изменить» and a pencil; «Заметка» (or «Нет заметки»); «Происхождение»; «Спряжение»; «Пример» with ↻, «+ Ещё пример» and «Примеры из жизни»; empty «Свои поля» slots; a «Повторение · 8 показов» head with two direction rows including «стаб. 9 д»; history squares plus a legend; three action rows with captions; and «Добавлено … · со скриншота». A column of 5-7 identical pencils runs down the right edge.

#### A · Remove duplicates and pencils (M)

Same structure, fewer controls. The «Уровень языка» field goes, and ≈B1 in the grammar line becomes tappable, opening a small inline row with the source and «Изменить». The pencils go: tapping a field's text edits it in place (keeping the H4 ✕/✓ pair), and tapping the headword opens the entry form. Empty slots collapse into one row «+ Происхождение, поле». History loses its legend and gains one mono line «следующий показ через 4 д · RU→FR через 1 д». The «стаб.» column goes. Reset, pause and delete move into a «⋯» in the sheet header next to ✕, with the provenance line as that menu's caption.

```
            ─────
Деньги ▾                  ⋯   ✕
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
la thune
n. f. · ▮▮▮▯ arg. · ≈B1
бабки, деньги
───────────────────────────────
ЗАМЕТКА
Синонимы: le fric, l'oseille
───────────────────────────────
ПРИМЕР
J'ai plus de thune.          ↻
У меня больше нет бабок.
+ Ещё пример · Примеры из жизни ›
───────────────────────────────
+ Происхождение, поле
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ ■ □ ■ ■ ■ ▨ ■
ЧЕРЕЗ 4 Д · RU→FR ЧЕРЕЗ 1 Д
```

Removed / hidden: «Уровень языка» field with caption, disclaimer, «Изменить» and pencil: becomes a tap on «≈B1» in the grammar line (inline row with «по словарю FLELex · Изменить»); 5-7 pencil icon buttons: removed; field text is the edit target (aria «Изменить заметку» etc. on the field button); «Нет заметки» and empty «Свои поля → Добавить» rows: become one «+ …» row listing the empty kinds; Section head «Повторение · 8 показов» and the two direction rows: become one mono line under the history strip; «стаб. 9 д»: removed; History legend «знаю / сложно / не знаю»: removed (the role=img aria-label stays); Action rows «Сбросить прогресс / На паузу / Удалить слово» with captions: moved to the header «⋯» sheet; «Добавлено 12.09.2026 · со скриншота»: moved to the «⋯» sheet caption

New visual / motion: Tapping a field: the text crossfades into its input in place (no height jump; the reserved height matches)

Brand conflicts: Level-Word board (D-level decisions: a «Уровень языка» field in the sheet); K1 (WordDetailBody.tsx:747 «Actions (K1): ruled rows») moves into a menu

#### B · Dictionary entry first, the rest under «Ещё» (M) — **рекомендуется**

A, plus the first screen reads as a print dictionary entry with no field labels: the headword, the grammar line, RU, then the note as plain text and the example in italic serif. Typography separates them, so «ЗАМЕТКА» and «ПРИМЕР» labels are unnecessary. Origin, conjugation and custom fields fold under one hairline row «Ещё · спряжение, происхождение ›» that expands in place. At the bottom, the history squares and the next-show line sit together as the card's «stamps». Everything the learner reads daily (translation, note, example) is visible without a tap.

```
            ─────
Деньги ▾                  ⋯   ✕
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
la thune
n. f. · ▮▮▮▯ arg. · ≈B1
бабки, деньги

Синонимы: le fric, l'oseille

  J'ai plus de thune.        ↻
  У меня больше нет бабок.
  Примеры из жизни ›
───────────────────────────────
Ещё · спряжение, происхождение ›
───────────────────────────────
■ ■ □ ■ ■ ■ ▨ ■
ЧЕРЕЗ 4 Д · RU→FR ЧЕРЕЗ 1 Д
```

Removed / hidden: Everything A removes; Field labels «Заметка» and «Пример» on the read view (they stay as labels in edit mode and in aria); «Происхождение», «Спряжение», «Свои поля»: folded under one «Ещё» row (Collapse, in place, no second sheet); «+ Ещё пример» (spark-plus): moved into the example's edit mode next to the ✕/✓ pair; Empty note: nothing is rendered; «+ Заметка» appears inside «Ещё»

New visual / motion: «Ещё» expands in place with the existing Collapse (--dur-move, height plus opacity), and the chevron turns 90°; The red rule draws under the theme chip when the sheet opens (scaleX, ≤240ms), so the sheet reads as an index card being laid down; History stamps: squares ink in left to right once on open (opacity steps 30ms apart, ≤240ms total; static under reduced motion)

Brand conflicts: SPEC.md:145 (history squares are kept, so this is fine); Level-Word and K1 boards, as in A; The research card-back rule («translation + meter; rest under Подробнее») agrees with this

#### C · Flip card plus swipe between words (L)

The sheet is literally the review index card. The front fits one screen: the entry, one example, and the history stamps along the card's bottom edge. «Перевернуть» (tap) shows the back with the note, origin, conjugation and fields, using the review Reveal motion (§5.2), so the library card and the review card feel like the same object. When opened from a list, a horizontal drag moves to the previous or next word in that list, with the neighbours' headwords peeking as labels.

```
            ─────
Деньги ▾                  ⋯   ✕
┌─────────────────────────────┐
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ la thune                    │
│ n. f. · ▮▮▮▯ arg. · ≈B1     │
│ бабки, деньги               │
│                             │
│ J'ai plus de thune.       ↻ │
│ У меня больше нет бабок.    │
│                             │
│ ■■□■■■▨■       ЧЕРЕЗ 4 Д    │
└─────────────────────────────┘
‹ le fric   Перевернуть  chelou ›
```

Removed / hidden: Everything A removes; Note, origin, conjugation and fields: moved to the back of the card; Section structure: replaced by the front and back faces

New visual / motion: Reveal headword glide between faces (MOTION-SPEC §5.2), no 3D rotation; Horizontal drag between words: the card slides 1:1 with the finger and settles with --spring-settle, no overshoot; Conjugation on the back as a 2×3 mono grid (je/tu/il · nous/vous/ils) that slides horizontally between tenses

Brand conflicts: The note goes behind a tap. The note is daily-read content, which breaks the rule against pushing daily items further away; Horizontal drag conflicts with sheet swipe-to-dismiss handling and with SwipeRow habits; it needs careful gesture arbitration; Word sheet behaviour diverges from the desktop pane (J/K)

**Why B:** The sheet is the densest screen (density 9, about 40 elements). B gets the first screen to about 12 elements while keeping everything the learner reads daily (translation, note, example, slang, level) visible without a tap. It removes the pencil column and the triple-printed level, and it puts rare or destructive actions behind one «⋯», whose undo snackbars already exist. The motion is calm and meaningful: the rule is laid down, «Ещё» opens in place, and the stamps ink in. Swiping between words (C) is a good follow-up once the list context is passed into WordDetailSheet.

Files: `components/library/WordDetailBody.tsx:483-490 (header: theme chip, «⋯» menu, ✕, red rule)`, `components/library/WordDetailBody.tsx:549-577 (headword tap opens the entry form; ≈B1 becomes a tappable inline level row; drop the pencil :553)`, `components/library/WordDetailBody.tsx:581-587 and :848-911 (remove the «Уровень языка» SheetField; LevelShown becomes the inline popover content)`, `components/library/WordDetailBody.tsx:588-618 (note: no «Нет заметки»; label-less read view)`, `components/library/WordDetailBody.tsx:619-668,699-721 (origin, conjugation and Свои поля inside an «Ещё» Collapse; «+ Заметка / поле»)`, `components/library/WordDetailBody.tsx:669-698 and components/examples/ExampleList.tsx:113-127,180-190 (example tools: ↻ stays; «+ Ещё пример» moves to edit mode; «Примеры из жизни» stays)`, `components/library/WordDetailBody.tsx:724-743 (Повторение head and direction rows become one mono line; drop stability)`, `components/library/WordDetailBody.tsx:747-764,781+ (SheetAction rows and provenance become a «⋯» word actions sheet)`, `components/library/WordDetailBody.tsx:992-1027 (SheetField: the field body becomes the edit button; no pencil column)`, `components/library/WordDetailBody.tsx:1061-1101 (HistoryStrip: drop the legend; add the next-show line)`, `components/library/WordDetailBody.tsx:1798-1850 (FieldsView: no empty «Добавить» slots in the read view)`, `components/library/WordDetailSheet.tsx:14-31 (later, for C: pass list context to enable prev/next)`, `mockups/Word-Detail-Lean-B.dc.html (new board)`

### Word detail: entry edit form (tap on the headword)

**Today:** The form has «Французский» and «Русский» (with ✕/✓), an optional «Вариант · Подставить», «Сленг» as a 4-way segmented control plus a «verl.» toggle, the spark «Определить уровень и часть речи», a 7-segment «Уровень языка» with Авто, and two caption sentences explaining the estimate. Most edits are just a typo in FR or RU.

#### A · Drop the captions (S)

Keep every control and remove the two rules-of-the-UI captions. The dotted underline on the estimate already marks it, and the aria-label carries «сейчас оценка».

```
Деньги ▾                      ✕
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ФРАНЦУЗСКИЙ
┌─────────────────────────────┐
│ la thune                    │
└─────────────────────────────┘
РУССКИЙ
┌─────────────────────────────┐
│ бабки, деньги          ✕  ✓ │
└─────────────────────────────┘
СЛЕНГ
[нейтр][fam.][█arg█][vulg.] verl○
✦ Определить уровень и часть речи
УРОВЕНЬ ЯЗЫКА
[A1][A2][B1][B2][C1][C2] [Авто]
         ┄┄
```

Removed / hidden: «подобрано автоматически · ≈B1 по словарю FLELex» (:980); «Свой уровень — без «≈»; «Авто» вернёт оценку.» (:981)

Brand conflicts: Level-Edit board captions

#### B · Correction first, metadata folded (S) — **рекомендуется**

The form opens on what people actually fix: FR, RU (with ✕/✓), the «Вариант» proposal when one exists, and the slang control. Level and part of speech fold into one ruled row «Уровень ≈B1 · n. f. ›». Expanding it reveals the 7-segment control with Авто and the spark «Определить уровень и часть речи», so the AI tool sits next to the values it fills.

```
Деньги ▾                      ✕
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ФРАНЦУЗСКИЙ
┌─────────────────────────────┐
│ la thune                    │
└─────────────────────────────┘
РУССКИЙ
┌─────────────────────────────┐
│ бабки, деньги          ✕  ✓ │
└─────────────────────────────┘
ВАРИАНТ бабло      [Подставить]
СЛЕНГ
[нейтр][fam.][█arg█][vulg.] verl○
───────────────────────────────
Уровень ≈B1 · n. f.            ›
───────────────────────────────
  (развёрнуто:)
  [A1][A2][B1][B2][C1][C2][Авто]
  ✦ Определить уровень и часть речи
```

Removed / hidden: Both level captions; 7-segment level row and the spark detect line: folded into «Уровень ≈B1 · n. f. ›» (expands in place)

New visual / motion: The fold expands with Collapse (--dur-move); values filled by detection get the spotlight (§5.14, A6 pattern)

Brand conflicts: Level-Edit board shows the level control open in the form

#### C · Meter as the input (M)

The slang control becomes the brand's own glyph: four enlarged 10×3 segments (40×6 each, with a 44px hit row) that you tap or drag along to set the level. vulg. fills red. «verl.» is an italic abbreviation toggle beside it. The level becomes a 7-tick ruler with a sliding ink slab. Level is folded as in B.

```
Деньги ▾                      ✕
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ФРАНЦУЗСКИЙ
┌─────────────────────────────┐
│ la thune                    │
└─────────────────────────────┘
РУССКИЙ
┌─────────────────────────────┐
│ бабки, деньги          ✕  ✓ │
└─────────────────────────────┘
СЛЕНГ                       arg.
 ▬▬▬▬  ▬▬▬▬  ▬▬▬▬  ░░░░  [verl.]
 нейтр  fam.  arg.  vulg.
───────────────────────────────
Уровень ≈B1 · n. f.            ›
───────────────────────────────
```

Removed / hidden: Text segmented control for slang; Level captions; the level is folded as in B

New visual / motion: Ink fills the segments up to the touch point as the finger slides (direct manipulation, no spring); The ink slab slides between level ticks (§5.9)

Brand conflicts: SPEC.md:92 and :141: slang is specified as a 4-option segmented control with a «verl.» toggle; A custom slider needs full keyboard and screen-reader support (role=slider, aria-valuetext «arg.»)

**Why B:** It fits the job (fix a typo) in one glance and keeps level and part of speech one tap away together with the AI tool that fills them. It removes 3 controls and 2 captions from every edit at no risk. C is charming, but it trades a clear labelled control for a custom slider.

Files: `components/library/WordDetailBody.tsx:493-546 (entry form layout; fold rows)`, `components/library/WordDetailBody.tsx:817-840 (DetectEntry moves inside the fold)`, `components/library/WordDetailBody.tsx:917-990 (LevelEditRow collapsed by default; remove captions :980-981)`, `components/library/WordDetailBody.tsx:1034-1059 (ProposalLine unchanged)`, `mockups/Level-Edit.dc.html (update) or a new mockups/Word-Edit-B.dc.html`

### «Фильтр и порядок» sheet

**Today:** The sheet has about 60 elements: 4-5 status chips with counts, 7 level chips with counts plus a note, 5 slang chips, a theme chip wall of about 37 chips over 8-10 wrapped lines, then 5 order radio rows of 44px far below, and a footer «Сбросить» / «Показать 687 слов».

#### A · Fold theme and order into rows (S)

Chips stay for the small, frequently combined groups (Показать, Уровень, Сленг). The theme chip wall becomes one row «Тема: Все темы ›» opening the existing TargetPickerSheet (nested, with colour squares, the pattern already used in WordDetailBody:766-775), with «Все темы» and «Входящие» on top. «Порядок» becomes one row «Порядок: Сначала новые ›» that expands in place. The level note goes.

```
Фильтр и порядок              ✕
ПОКАЗАТЬ
[Все] [К повт. 27] [Трудные 56]
[Новые 1116]
УРОВЕНЬ ЯЗЫКА
[A1 142][A2 288][B1 356]
[B2 241][C1 181][C2 12]
[┄без уровня 98┄]
СЛЕНГ
[▮▯▯▯ нейтр.][▮▮▯▯ fam.]
[▮▮▮▯ arg.][▮▮▮▮ vulg.][┄verl.┄]
───────────────────────────────
Тема                Все темы  ›
───────────────────────────────
Порядок        Сначала новые  ›
───────────────────────────────

[Сбросить] [█ Показать 687 слов █]
```

Removed / hidden: Theme chip wall (about 37 chips): becomes «Тема ›», opening the TargetPickerSheet list; LEVEL_FILTER_NOTE «Считаются и оценки «≈»…»: removed; «Порядок» 5 × 44px radios: become one row that expands in place (Collapse)

New visual / motion: The footer number crossfades on every chip tap (CrossfadeText, a plain swap, no count-up)

Brand conflicts: SPEC.md:143 lists «Тема chips» and the «Порядок» list in the sheet; HIG «one sheet at a time»: the nested picker is the existing app pattern; an inline expandable list is the alternative

#### B · A + level histogram (S) — **рекомендуется**

A, plus each level chip carries a 2px ink bar under its label proportional to its count. The level group then shows the shape of the library at a glance while staying inside «counts on chips» (D7 C) and drawn as rules, not a chart. The whole sheet fits one screen at the medium detent.

```
Фильтр и порядок              ✕
ПОКАЗАТЬ
[Все] [К повт. 27] [Трудные 56]
[Новые 1116]
УРОВЕНЬ ЯЗЫКА
[A1 142][A2 288][B1 356]
 ▬▬      ▬▬▬▬    ▬▬▬▬▬
[B2 241][C1 181][C2 12]
 ▬▬▬▬    ▬▬▬     ▪
[┄без уровня 98┄]
СЛЕНГ
[▮▯▯▯ нейтр.][▮▮▯▯ fam.]
[▮▮▮▯ arg.][▮▮▮▮ vulg.][┄verl.┄]
───────────────────────────────
Тема                Все темы  ›
───────────────────────────────
Порядок        Сначала новые  ›
───────────────────────────────
[Сбросить] [█ Показать 687 слов █]
```

Removed / hidden: Same as A

New visual / motion: Level bars inside chips (static rules; they invert to on-ink when the chip is selected); The footer count crossfades on each change, so the effect of a filter is felt immediately

Brand conflicts: SPEC.md:101 (chip anatomy) needs an amendment for the inner rule; D7 C stays respected (counts only on chips)

#### C · Filter as a sentence (L)

The sheet becomes one editable sentence: «Показать [все] слова · уровня [любого] · сленг [любой] · из [всех тем] · сначала [новые]». Each bracketed ink-underlined term opens its option group inline beneath it, one at a time. This is progressive disclosure taken to the maximum, and the sentence itself is the summary of what is on.

```
Фильтр и порядок              ✕

Показать  все слова ▾
уровня    любого ▾
          [A1][A2][B1][B2]
          [C1][C2][┄без┄]
сленг     любой ▾
из        всех тем ▾
сначала   новые ▾



[Сбросить] [█ Показать 687 слов █]
```

Removed / hidden: All groups closed by default; one opens at a time

New visual / motion: The chosen value replaces the underlined term with a crossfade

Brand conflicts: Multi-select (several levels or slang kinds) reads awkwardly as a sentence («уровня A2, B1»); Hides counts until a group is opened, losing the at-a-glance level shape

**Why B:** The 37-chip theme wall is the main problem, and A or B fixes it with a component that already exists. The theme is usually chosen by tapping a drawer anyway. Order is set rarely, so a single row is enough. The histogram rule is the one visual addition, and it carries real information (what the library is made of) at no extra height.

Files: `components/library/LibraryFilterSheet.tsx:84-88,157-165 (theme chips become a «Тема ›» row and a nested TargetPickerSheet)`, `components/library/LibraryFilterSheet.tsx:118-136 (level chips with proportional rule; drop the note :135)`, `components/library/LibraryFilterSheet.tsx:167-186 (Порядок as one expandable row)`, `components/library/LibraryFilterSheet.tsx:90-99 (footer count via CrossfadeText)`, `components/library/level.ts:48 (delete LEVEL_FILTER_NOTE)`, `components/library/TargetPickerSheet.tsx (accept «Все темы» and «Входящие» options for filter use)`, `components/ui/Chip.tsx (optional inner proportion rule)`, `components/library/SlangFilter.tsx:38-100 (delete dead SlangFilterChip and SlangFilterPanel)`, `mockups/Filter-Lean-B.dc.html (new board)`

### Theme actions sheet (long press on a drawer / «⋯» on the theme page)

**Today:** The sheet has 8 rows and 5 explanatory sentences. «Открыть тему» duplicates the tap. «Закрепить тему» (an AI-sorting setting) and «Расформировать» (a second delete) sit among everyday actions. The footnote repeats what the delete snackbar already says.

#### A · Drop duplicates and captions (S)

Remove «Открыть тему» and every caption except Тренировка's «не влияет на расписание», which is a real difference. Remove the footnote. The rows stay in place.

```
            ─────
03 Жильё                      ✕
───────────────────────────────
▢  Повторить тему              2
───────────────────────────────
↻  Тренировка всей темы
   не влияет на расписание
───────────────────────────────
✎  Название, описание и цвет
───────────────────────────────
   Закрепить тему            ○
───────────────────────────────
   На паузе                  ○
───────────────────────────────
✦  Расформировать
───────────────────────────────
×  Удалить тему
```

Removed / hidden: «Открыть тему» (:53-56); Captions under Закрепить (:92-94), На паузе (:107) and Расформировать (:122-124); kept as aria-describedby only; Footnote «Слова из удалённой темы попадут во «Входящие».» (:132)

Brand conflicts: SPEC.md:143 menu list and captions

#### B · Five rows, the drawer's own label card (S) — **рекомендуется**

A, plus «Закрепить тему» moves into «Название, описание и цвет» as a toggle (it is a property of the theme). «Расформировать» merges into «Удалить тему…», which opens a two-choice confirm: «Слова — во «Входящие»» or «✦ Разложить по другим темам». The sheet's top edge carries the theme's 3px colour band, so it reads as the drawer's label card.

```
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
03 Жильё                      ✕
───────────────────────────────
▢  Повторить тему              2
───────────────────────────────
↻  Тренировка всей темы
   не влияет на расписание
───────────────────────────────
✎  Название и цвет
───────────────────────────────
   На паузе                  ○
───────────────────────────────
×  Удалить тему…

  (после «Удалить тему…»:)
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
Удалить «Жильё»? 38 слов
█ Слова — во «Входящие»      █
[✦ Разложить по другим темам  ]
            Отмена
```

Removed / hidden: «Открыть тему», 4 captions and the footnote (as in A); «Закрепить тему» toggle: moved into FolderFormSheet; «Расформировать» row: becomes the second choice of the delete confirm (it opens DisbandSheet as today)

New visual / motion: Theme colour band on the sheet's top edge (static); When paused, the drawer row's ink goes muted with a small mono «на паузе» in place of the count (no caption needed)

Brand conflicts: SPEC.md:143: the menu order is specified with «Закрепить» and «Расформировать» as rows; An extra confirm step before delete (today delete is instant with undo). This is acceptable because it now forks two outcomes

**Why B:** It halves the menu (8 rows plus 5 sentences down to 5 rows plus 1 caption). It separates everyday actions from theme properties, and it makes the two ways to remove a theme an explicit fork instead of two neighbouring rows. Undo snackbars stay as they are.

Files: `components/library/FolderMenuSheet.tsx:45-49 (theme colour band on the top edge)`, `components/library/FolderMenuSheet.tsx:51-56 (drop «Открыть тему»)`, `components/library/FolderMenuSheet.tsx:87-101 (move «Закрепить» to FolderFormSheet)`, `components/library/FolderMenuSheet.tsx:102-110 (pause caption becomes aria only)`, `components/library/FolderMenuSheet.tsx:111-132 (merge disband into the «Удалить тему…» confirm; drop the footnote)`, `components/library/FolderFormSheet.tsx (add the «Закрепить тему» toggle)`, `components/library/DisbandSheet.tsx (entry from the delete confirm)`, `components/library/theme-pause.ts:9 (THEME_PAUSE_CAPTION used for aria only)`, `components/library/LibraryScreen.tsx:247-259,511-551 and FolderScreen.tsx:129-138,257-297 (wire the delete confirm)`, `mockups/Theme-Menu-B.dc.html (new board)`

### «Предлагаемые перемещения» (sort plan sheet, phone)

**Today:** Elements: title; an intro line about manual words; a steps list «01 Темы ✓ / 02 Слова · 24 / 48» that stays after the plan is ready; a sticky status line; groups with a toggle and word rows; a footer caption «Можно отменить в течение 7 дней.»; and «Отмена» / «Применить 10».

#### A · Scaffolding leaves when done (S) — **рекомендуется**

The steps list collapses when phase becomes ready (Collapse already exists). The intro line merges into the status line as «12 ПЕРЕМЕЩЕНИЙ · РУЧНЫЕ НА МЕСТЕ». The dashed new-theme group itself shows «новая тема», so the summary no longer counts it. The footer caption about the undo window moves to the post-apply snackbar.

```
            ─────
Предлагаемые перемещения      ✕
12 ПЕРЕМЕЩЕНИЙ · РУЧНЫЕ НА МЕСТЕ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Деньги  3                  ◉
  le pognon        деньги
  les ronds        бабки
  être raide       на мели
───────────────────────────────
→ Эмоции  2                  ◉
  avoir la haine   беситься
  être vénère      быть злым
───────────────────────────────
→ ┆Транспорт┆ новая тема 3   ◉
  la caisse        тачка
  le tromé         метро
  la bécane        мотик
───────────────────────────────
→ Люди  2                    ○
  le daron         батя
  la daronne       мать
┌──────────┐┌─────────────────┐
│  Отмена  ││█ Применить 10  █│
└──────────┘└─────────────────┘
```

Removed / hidden: Steps 01/02 once ready: collapsed (they remain while loading); Intro line «Слова, разложенные вручную, не трогаются (N слов).»: merged into the status line; Footer caption «Можно отменить в течение 7 дней.»: moved to the snackbar after apply and to the «Последняя раскладка — Отменить» upkeep row

New visual / motion: Steps collapse with --dur-move once the plan is ready

Brand conflicts: SPEC.md:144 sub-line wording; MOTION-SPEC §4.5 (steps list) needs a «collapse on ready» line

#### B · Moves as movement (M)

A, plus each group is a single drawer line: «──→ ▍Деньги 3 ◉», then the words as one italic serif run «le pognon, les ronds, être raide». Tapping the group expands it to the retargetable rows. As groups stream in, each arrow hairline draws from the margin to the theme name (scaleX, --dur-exit), so the plan reads as movement into drawers rather than as a table.

```
            ─────
Предлагаемые перемещения      ✕
12 ПЕРЕМЕЩЕНИЙ · РУЧНЫЕ НА МЕСТЕ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
──────→ ▍Деньги  3           ◉
  le pognon, les ronds,
  être raide                   ›
───────────────────────────────
──────→ ▍Эмоции  2           ◉
  avoir la haine, être vénère  ›
───────────────────────────────
───→ ┆Транспорт┆ новая  3    ◉
  la caisse, le tromé,
  la bécane                    ›
───────────────────────────────
──────→ ▍Люди  2             ○
  le daron, la daronne         ›
───────────────────────────────

┌──────────┐┌─────────────────┐
│  Отмена  ││█ Применить 10  █│
└──────────┘└─────────────────┘
```

Removed / hidden: Everything A removes; Per-word RU translations in the collapsed view (shown when a group is expanded)

New visual / motion: Arrow hairline drawn per group as it lands (scaleX, linear, --dur-exit), on top of the existing 40ms arrivalStyle stagger; Expand group in place with Collapse

Brand conflicts: SPEC.md:144 shows word rows under each group; Collapsed groups make retargeting one tap further away (it is not a daily action)

**Why A:** The sheet is already well paced (density 6). The real noise is scaffolding left behind after the work is done, plus two reassurance sentences, and A removes those cheaply. B's drawn arrow is a nice, on-brand bit of motion that can be added later; collapsing word rows is not worth the extra tap while the user is reviewing an AI plan.

Files: `components/library/SortPlanSheet.tsx:226-228 (drop the undo-window caption)`, `components/library/SortPlanSheet.tsx:394-404 (intro merged into the status line; steps collapse when ready)`, `components/library/SortPlanSheet.tsx:367-372 (status text «N перемещений · ручные на месте»)`, `components/library/SortPlanSheet.tsx:540-605 (B only: one-line groups plus the drawn arrow)`, `components/library/LibraryScreen.tsx:162-166 (the snackbar after apply carries the 7-day undo hint)`, `mockups/MOTION-SPEC.md §4.5 (collapse-on-ready note)`

## Settings · Study plan · Import · Context (phone, compact <768)

### Settings (/settings, PhoneSettings)

**Today:** One flat scroll about 1900px long (3 screens): 7 sections with mono headings on ink rules, about 40 controls, the same «общая для всех устройств» footnote shown twice, and data and sign-out rows in the main list. Theme, the one setting people change often, is below the fold. The «План повторения ›» row already proves the index → sub-screen pattern (/settings/plan).

#### A · Trim the flat list (S)

Keep one scroll. Replace the 4 radios + slider of «Упражнения» with one row that opens a sub-screen, move rare data actions behind «Данные ›», drop captions and footers, and turn the 7 ink-ruled headings into hairlines. The list comes down to about 1.3 screens.

```
←  Настройки
ПОВТОРЕНИЕ
Направление         FR → RU  ›
План повторения              ›
10 слов · до 200
Кнопки оценки          [2|3]
Свайпы для оценки       (●)
Вибрация                (●)
УПРАЖНЕНИЯ
Чаще в упражнениях           ›
Трудные · половина набора
ОФОРМЛЕНИЕ
Тема  [Система|Светлая|Тёмная]
ИИ
Автоподсказки при вводе  (●)
Определять уровень сленга (●)
… ещё 7 строк ИИ …
Свои поля                    ›
Данные                       ›
■ Синхронизировано · 14:02
──────────────────────────────
Повтор. Упражн. Добав. ▀Библ.
```

Removed / hidden: «При оценке, свайпах и переключателях» caption (dropped; «Проверить» fires once when Вибрация is turned on); «Чаще в упражнениях» radios + «Сколько в наборе» slider + footer → /settings/exercises; Both «общая для всех устройств» footnotes → one line on the Данные sub-screen; Export / Import JSON / HTML / Anki / Выйти → «Данные ›» sub-screen; Свои поля list + footnote → «Свои поля ›» sub-screen; Ink rules under section headings → hairlines

New visual / motion: Index captions are live summaries; on return from a sub-screen the changed caption gets the paper spotlight (--dur-spotlight)

Brand conflicts: None. The ИИ block stays long, so the page still scrolls past one screen.

#### B · Index of seven rows (M) — **рекомендуется**

Settings becomes a one-screen index. Each row shows its current values as a 12px caption and opens a sub-screen built like /settings/plan. «План повторения» moves up to the index so it stays 1 tap away and the depth never goes past 2 levels. Тема is the one control left inline, because it is the one people actually change. Sync health shows on the Данные row as a dot and the time.

```
←  Настройки
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
План повторения              ›
10 новых · до 200 в день
──────────────────────────────
Повторение                   ›
FR → RU · 3 кнопки · свайпы
──────────────────────────────
Упражнения                   ›
Трудные · половина набора
──────────────────────────────
Тема  [Система|Светлая|Тёмная]
──────────────────────────────
ИИ                           ›
Всё включено · быстрее
──────────────────────────────
Свои поля                    ›
Синонимы, Произношение
──────────────────────────────
Данные                       ›
■ Синхронизировано · 14:02
──────────────────────────────
Повтор. Упражн. Добав. ▀Библ.
```

Removed / hidden: Direction, Кнопки оценки, Свайпы, Вибрация and «Происхождение слов» (it is about the card back) → /settings/review «Повторение»; Чаще в упражнениях + slider → /settings/exercises (the label row merges into the title; footer dropped); 5 ИИ toggles, Вариантов, Регистр, the two «Модель» rows (merged into one row whose caption is the «Точнее» line) and the privacy line once at the bottom → /settings/ai; Свои поля rows, «Добавить поле», footnote → /settings/fields; Export/Import JSON, «Другие форматы ›» (HTML, Anki), «План и упражнения общие для всех устройств», Выйти + email → /settings/data; All 7 ink-ruled section headings → one ink rule under the header, hairlines between rows; InstallHint → bottom of /settings/data

New visual / motion: Sync dot: 6px square, its colour crossfades (T5). While a sync runs, the Данные row hairline does the existing StatusLine ink run, so the text does not change; Sub-screens open with the existing route slide (--dur-turn). On back, the edited row's caption swaps and gets the spotlight; Тема segmented: ink slab slides --dur-move (T3)

Brand conflicts: SPEC Settings section and the «СВОИ ПОЛЯ between ИИ and Данные» / «Упражнения right after Повторение» placement rules need rewriting as sub-screens; Deep links /settings#set-exercises (RequestBuilder) and /settings#set-data (SyncMark, T7) must point to the new routes; SPEC R22 D1 C puts «План повторения» inside «Повторение»; B lifts it to the index (spec line edit)

#### C · Index with a day receipt and card swatches (L)

B's index, but the two things worth seeing on a visit are drawn as objects. The plan is a small white index card holding two Newsreader numbers and a hairline cut at the review cap. Тема is three tiny index-card swatches. The sub-screens use visual controls too: Кнопки оценки as two miniature button rows at real proportions, and ИИ as a mini card back whose zones (перевод, сленг, пример, тема, заметка) you tap to toggle.

```
←  Настройки
┌──────────────────────────────┐
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│  10            200         › │
│  новых в день  повторений    │
│  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬|░░ завтра │
└──────────────────────────────┘
ТЕМА
 ┌────┐   ┌────┐   ┌────┐
 │ Aa │   │▓Aa▓│   │ A▓ │
 └────┘   └────┘   └────┘
 Светлая  Тёмная   Система
──────────────────────────────
Повторение                   ›
Упражнения                   ›
ИИ                           ›
Свои поля                    ›
Данные              ■ 14:02  ›
──────────────────────────────
Повтор. Упражн. Добав. ▀Библ.
```

Removed / hidden: Everything B hides; Index captions (the receipt and the swatches carry the state; other rows show only their name)

New visual / motion: Plan receipt: the red index-card rule, Newsreader 26 numbers, a 1px ink line up to the cap with a muted remainder labelled «завтра». Numbers swap plainly, with no count-up; Theme swatches: the chosen one gets a 1.5px ink outline; selecting it runs applyTheme at once; On /settings/review, turning on «Свайпы для оценки» nudges the mini card 8px left and right once (paper motion, no loop, reduced = none); ИИ card anatomy: zone ink fill --dur-instant, the house checkbox language

Brand conflicts: A boxed card in a settings list goes against «separate list items with hairlines, not boxed cards» (defensible as an index card); The dark swatch draws dark tokens on a light page; The card-anatomy toggles replace labelled Toggle rows; each zone needs a visible label and role=switch for a11y (M3E research warns against dropping labels)

**Why B:** It goes from 3 screens to 1 and from 40 controls to 7 rows plus one inline segmented control. It reuses a pattern already built and approved (/settings/plan), so cost and risk stay low. Nothing used daily moves further away: Тема stays inline, and the plan moves from 2 taps deep to 1. C's theme swatches and plan receipt can be added to B later, because they occupy the same rows.

Files: `components/settings/SettingsScreen.tsx (PhoneSettings → index; split the sub-screen bodies out)`, `components/settings/SettingsList.tsx (new SettingsIndexRow: label, 12px caption, chevron; index without ink-ruled headings)`, `components/settings/PhoneSettingsPages.tsx (new: Повторение / ИИ / Данные phone sub-screens)`, `app/(app)/settings/review/page.tsx (new)`, `app/(app)/settings/exercises/page.tsx (new)`, `app/(app)/settings/ai/page.tsx (new)`, `app/(app)/settings/fields/page.tsx (new)`, `app/(app)/settings/data/page.tsx (new; ≥768 renders DeskSettingsFrame at the matching anchor)`, `components/settings/StudyPlanSettings.tsx (PhonePlanRow → index row; drop FOOTNOTE)`, `components/settings/ExerciseFocusSection.tsx (phone: drop FOCUS_CAPTION and the «Чаще в упражнениях» label row)`, `components/settings/CustomFieldsSection.tsx (phone section → its own page; field-name summary for the caption)`, `components/settings/DataSection.tsx (sub-page; HTML and Anki imports under «Другие форматы ›»; one shared-settings line)`, `components/settings/format.ts (index caption builders: review, exercise focus, ai, short sync line)`, `components/settings/useSyncLine.ts (compact dot+time form for the index row)`, `components/library/SyncMark.tsx (href /settings#set-data → /settings/data)`, `components/exercises/RequestBuilder.tsx (href /settings#set-exercises → /settings/exercises)`, `components/settings/DesktopSettings.tsx (keep the new routes working ≥768)`, `mockups/Settings.dc.html (+ new board Settings-Index)`, `mockups/SPEC.md (Settings v3 override, R22, Свои поля and Упражнения placement)`

### Study plan (/settings/plan, PhoneStudyPlan)

**Today:** About 30 elements on one 650px screen. A mono summary line repeats the two stepper values. 3 ink-ruled headings sit over a third-level «Порядок» label. Each of the 6 radio options carries a caption, so there are 12 lines of text for 2 choices. A 2-line advice caption squeezes the stepper. The vague label «Новые» sits on a segmented control between the groups. The shared-settings footnote sits at the fold.

#### A · Same layout, captions trimmed (S)

Keep the steppers and radios, and cut the text. Captions appear only under the selected option. The summary line and the advice caption go. «Порядок» merges into its heading, and «Новые» becomes «Новые в сессии» on its own label row.

```
←  План повторения
ТЕМП
──────────────────────────────
Новых слов в день     − 10 +
Повторений в день  до − 200 +
НОВЫЕ СЛОВА · ПОРЯДОК
──────────────────────────────
По уровню языка              ✓
Сначала A1–B2, частые раньше
По темам
Как добавлены
Новые в сессии
[Вперемешку|После повторения]
ОБРАТНАЯ СТОРОНА · RU → FR
──────────────────────────────
После 3 дней узнавания       ✓
Когда FR → RU продержится 3 дня
Назавтра
Только узнавание
──────────────────────────────
Повтор. Упражн. Добав. ▀Библ.
```

Removed / hidden: Mono summary «10 СЛОВ В ДЕНЬ · ДО 200 ПОВТОРЕНИЙ» (it moves to the Settings index caption); «Меньше, если много повторений или точность падает» (removed; the «План на сегодня» sheet explains throttling); «Остальные — на следующий день» (folded into the «до» prefix); Label row «Порядок» (merged into the heading); Captions under the 4 unselected options; Footnote «Настройка общая для всех устройств…» → Данные sub-screen

New visual / motion: The selected-option caption crossfades --dur-quick and the row height animates --dur-move (Collapse)

Brand conflicts: None

#### B · Two numbers as the hero (M) — **рекомендуется**

The page answers one question, how much a day. Two Newsreader 40 numbers sit side by side with −/+ under each and a mono label. No heading is needed above them. Below come two hairline groups, «Порядок новых» and «RU → FR», with only the chosen option captioned. «Новые в сессии» is a segmented control under its own label. A small sync glyph in the header (aria «Общая настройка для всех устройств и Claude») replaces the footnote.

```
←  План повторения          ⟳
┌──────────────┬───────────────┐
│      10      │      200      │
│ НОВЫХ В ДЕНЬ │  ПОВТОРЕНИЙ   │
│   [−]  [+]   │   [−]  [+]    │
└──────────────┴───────────────┘
Порядок новых
──────────────────────────────
По уровню языка              ✓
Сначала A1–B2, частые раньше
По темам
Как добавлены
НОВЫЕ В СЕССИИ
[Вперемешку | После повторения]
RU → FR
──────────────────────────────
После 3 дней узнавания       ✓
Когда FR → RU продержится 3 дня
Назавтра
Только узнавание
──────────────────────────────
Повтор. Упражн. Добав. ▀Библ.
```

Removed / hidden: Summary line, ТЕМП heading, both stepper captions; 3 ink-ruled headings → 2 hairline group labels; Captions under unselected options; Footnote → header glyph, plus one line on the Данные sub-screen

New visual / motion: The hero numbers are tabular plain swaps on each step (no count-up, §5.5). −/+ press .96 + tint (T4); ∞ shows in the same 40px serif when the cap is off; «до» is dropped because the label says «повторений»; On back, the index caption «10 новых · до 200» swaps and gets the spotlight

Brand conflicts: SPEC R22 Review-Settings-C board layout (stepper rows) needs a new board; The hero pair is a ruled grid inside the white surface; that is fine under «grids use rule lines»

#### C · The plan drawn (L)

B's hero numbers, plus pictures in place of captions. A hairline under the numbers shows the cap as a spatial cut (ink up to «до 200», muted remainder «завтра»). The three orders become tiny drawn tiles: level ticks A1→B2, numbered theme tabs, a stack of dates. RU → FR becomes a 3-tick day timeline that redraws in place for each choice.

```
←  План повторения
    10              200
 новых в день    повторений
  [−]  [+]        [−]  [+]
 ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬|░░░░░░
 сегодня до 200      завтра
ПОРЯДОК НОВЫХ
┌────────┐┌────────┐┌────────┐
│ A1→B2  ││ 01 02  ││  ▭▭▭   │
│ ▮▮▯▯   ││   03   ││  ▭▭    │
└────────┘└────────┘└────────┘
 уровень  темы  как добавлены
НОВЫЕ В СЕССИИ
[Вперемешку | После повторения]
RU → FR
 д1 ─── д2 ─── д3 ───▶ RU→FR
 ●──────●──────●       ◆
[3 дня | Назавтра | Без RU→FR]
──────────────────────────────
Повтор. Упражн. Добав. ▀Библ.
```

Removed / hidden: Everything B removes; All option captions (the drawings replace them); Radio lists → tile picker and a 3-segment control

New visual / motion: Cap hairline: the cut moves --dur-move --ease-standard on each cap step; under ∞ the line is all ink with no «завтра»; Order tiles: chosen = 1.5px ink outline + red top rule, ink slab style; Day timeline: ticks fade in or out --dur-quick when the choice changes (day 2 tick for «Назавтра», no reverse diamond for «Только узнавание»)

Brand conflicts: The tiles are boxed containers with pictograms, which is close to the «tinted icon chips» SPEC forbids (they are ink only); «Только узнавание» renamed «Без RU→FR» to fit 3 segments (copy change); the segmented control may still be tight at 358px; Real data for the cap hairline (today's due count) has to come from the plan engine; without it the drawing is decorative

**Why B:** The screen's one job, the daily amount, becomes the visual hero with no extra words. Text drops from about 30 elements to about 14, and it reuses the existing Stepper and radio logic. C's cap hairline is the one part of C worth adding to B later, once due counts are wired in. The order tiles cost more than they explain.

Files: `components/settings/StudyPlanSettings.tsx (PhoneStudyPlan: hero pair, two hairline groups, header glyph; PhoneRadioList caption only when checked; remove NEW_CAPTION, FOOTNOTE, the summary <p>, the «Порядок» row)`, `components/settings/Stepper.tsx (hero variant: 40px number over −/+)`, `components/settings/plan-settings.ts (label «Новые в сессии»; caption copy)`, `components/review/plan-format.ts (planSummary reused by the Settings index caption)`, `components/ui/Header.tsx (actions slot used for the shared-setting glyph)`, `mockups/Review-Settings-C.dc.html (→ new board Review-Settings-D)`, `mockups/SPEC.md (R22 «План повторения» screen description)`

### Import — Pick (/import idle, PickView)

**Today:** A dashed drop box about 400px tall that cannot be tapped (a desktop metaphor) holds an icon, a title, a 3-line description and a format line. The real «Выбрать скриншот» button sits under it, then the paste button, the privacy footnote, and an Anki row with a 2-line caption.

#### A · Smaller box (S)

Shrink the dashed box to about 200px, cut its text to one line, drop the format line, and turn Anki into a quiet text link. The button stays where it is.

```
←  Импорт со скриншота
┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
┆                            ┆
┆           [cam]            ┆
┆    Скриншот со словами     ┆
┆ Переписка, пост, субтитры  ┆
┆                            ┆
└┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘

[█████ Выбрать скриншот █████]
[    Вставить из буфера      ]
Скриншот не сохраняется —
только слова.

Или колода Anki ›
```

Removed / hidden: «Длинный скриншот разрежем на части» (an implementation detail); Mono «PNG, JPEG, WebP · до 4 фрагментов» (the ImagePrepError already says it when the limit is hit); Anki icon + 2-line caption → text link «Или колода Anki ›»

Brand conflicts: None

#### B · The card is the button (S) — **рекомендуется**

One white index card. Its body is the tap target and its bottom edge is the black «Выбрать скриншот» bar, so the biggest thing on screen does the job. Paste stays as the secondary action, the privacy line stays (here only), and Anki is a text link.

```
←  Импорт со скриншота
┌──────────────────────────────┐
│                              │
│            [cam]             │
│     Скриншот со словами      │
│ Переписка, пост или субтитры │
│                              │
│                              │
├──────────────────────────────┤
│█████ Выбрать скриншот ███████│
└──────────────────────────────┘
[   Вставить из буфера       ]
Скриншот не сохраняется —
только слова.

Или колода Anki ›
```

Removed / hidden: Dashed box (dashed stays only as the drop-hover state on pointer:fine); Format line, «разрежем на части»; Anki row caption + icon

New visual / motion: Whole-card press: .98 + surface-2 tint (§5.1); Offline: the bar reads «Нужна сеть» in the disabled look, with OFFLINE_REASON under the card

Brand conflicts: None. The primary button keeps its ink look as the card's footer.

#### C · A drawn screenshot that becomes the thumbnail (M)

B's tappable card, holding a 1px ink drawing of a chat screenshot: three bubbles, one word underlined in red, and a hairline arrow to a tiny card stack. The drawing shows the job without the description. When an image is picked, the ghost bubble fills with the real thumbnail, which moves into the processing thumbnail slot as a shared element.

```
←  Импорт со скриншота
┌──────────────────────────────┐
│  ┌──────────┐                │
│  │ ▭▭▭▭     │      ┌───┐     │
│  │   ▭▭▭▭▭  │ ───▶ │ ═ │┐    │
│  │ ▭ kiffer │      └───┘│    │
│  │   ~~~~~~ │       └───┘    │
│  └──────────┘                │
│ Переписка, пост или субтитры │
├──────────────────────────────┤
│█████ Выбрать скриншот ███████│
└──────────────────────────────┘
[   Вставить из буфера       ]
Скриншот не сохраняется —
только слова.
Или колода Anki ›
```

Removed / hidden: Camera icon and the title «Скриншот со словами» (the drawing replaces them); Format line, Anki caption

New visual / motion: The red underline under «kiffer» draws once on arrival (dashoffset, 240ms linear); Pick → processing: the thumbnail morphs into the 72×128 slot via React <ViewTransition> (--dur-turn, position and size only; reduced = crossfade)

Brand conflicts: SPEC/research favour typographic-only states; an illustration is a stretch, even in ink; MOTION-SPEC §5.10 says «no flying ghost across the screen»; the shared-element move needs an explicit exception; View Transitions need checking against Next 16.4 docs, which are absent from node_modules/next/dist/docs

**Why B:** It fixes the real fault: the largest element does nothing and the action sits below it. It costs one component change and keeps all the copy rules. C's drawing is nice but spends the screen's novelty budget on a screen visited a few times a week.

Files: `components/import/PickView.tsx (card as button, one-line copy, Anki text link, drop the format line)`, `components/import/ProcessingView.tsx (IMPORT_FOOTNOTE stays exported for the pick screen only)`, `mockups/Import-Pick.dc.html (new board; no phone pick board exists today)`

### Import — Processing (running / stopped / error / waiting / empty)

**Today:** One wait is shown 5 ways: the scan line, the 1px ImportBar, a 3-step list (84px), the title «Распознаём слова…» and the status-line count. A 120×220 thumbnail block takes a third of the screen. «НАЙДЕНО / ПО МЕРЕ РАСПОЗНАВАНИЯ» repeats the status line, and the privacy footnote repeats the pick screen. About 5 arriving rows fit.

#### A · Remove the repeats (S)

Keep the thumbnail, the bar and the steps. Remove the sub «Скриншот · 2 фрагмента», the «НАЙДЕНО» heading pair and the footnote. The status line becomes the list's only header.

```
←  Импорт со скриншота
┌──────┐ Распознаём слова…
│▭▭ ▭  │ ──────▬───────────
│ ▭▭▭  │ 01 Читаем скриншот ✓
│━━━━━━│ 02 Слова и перевод ИДЁТ
│░░░░░░│ 03 Проверка повторов
│░░░░░░│
└──────┘
НАЙДЕНО 3                 0:04
──────────────────────────────
chelou   стрёмный   ▮▮▯▯ verl.
la meuf  девушка    ▮▮▯▯ verl.
kiffer   тащиться   ▮▮▮▯ arg.
░░░░░░░░░░░░   ░░░░░░
░░░░░░░░░░   ░░░░░
░░░░░░░░   ░░░░
░░░░░   ░░░

[            Стоп            ]
```

Removed / hidden: Sub «Скриншот · 2 фрагмента» (the 1/N badge stays for several screenshots); Heading «НАЙДЕНО» + «ПО МЕРЕ РАСПОЗНАВАНИЯ»; Footnote «Скриншот не сохраняется — только слова.» (pick screen only)

Brand conflicts: None

#### B · One small status block, the scan line as progress (S) — **рекомендуется**

A 72×128 thumbnail with its scan line, and beside it only the title and one status line («ЧИТАЕМ СКРИНШОТ» → «НАЙДЕНО 3 · 0:04»). The bar and the step list go: the scan line already sits at the bar's % (ScanLine percent), and the step name lives in the status text. A failure writes «НЕ УДАЛОСЬ» there and the notice appears below. About 2 more rows fit.

```
←  Импорт со скриншота
┌────┐  Распознаём слова…
│▭▭ ▭│  НАЙДЕНО 3         0:04
│━━━━│
│░░░░│
└────┘
──────────────────────────────
chelou   стрёмный   ▮▮▯▯ verl.
la meuf  девушка    ▮▮▯▯ verl.
kiffer   тащиться   ▮▮▮▯ arg.
░░░░░░░░░░░░   ░░░░░░
░░░░░░░░░░   ░░░░░
░░░░░░░░   ░░░░
░░░░░   ░░░




[            Стоп            ]
```

Removed / hidden: ImportBar (1px bar + tick) on phones; 3-step list 01/02/03 (their labels become the status-line text: «ЧИТАЕМ СКРИНШОТ», «СЛОВА И ПЕРЕВОД», «ПРОВЕРКА ПОВТОРОВ»); Sub line, «НАЙДЕНО» heading pair, footnote; Thumbnail 120×220 → 72×128

New visual / motion: Stopped: the scan line freezes in muted ink and the veil stays (already supported by ScanLine muted), so no «СТОП» label is needed; Rows keep I2 (opacity + 4px, --dur-enter); the skeleton stack slides --dur-move

Brand conflicts: MOTION-SPEC §3.1 «staged steps + determinate 1px bar + status line + streamed rows» and I1 (steps, bar jumps) need amending for phones; desktop keeps them (DeskProcessingView); Board M-Import-Wait F1–F4 show the bar and steps

#### C · Ink tally on the screenshot (M)

B's layout. Each found word also leaves a short red tick on the thumbnail's right edge at the height where it was read, and each arriving row has a matching tick at its left. The words visibly come out of the screenshot.

```
←  Импорт со скриншота
┌────┐╸ Распознаём слова…
│▭▭ ▭│╸ НАЙДЕНО 3         0:04
│━━━━│╸
│░░░░│
└────┘
──────────────────────────────
╸chelou   стрёмный  ▮▮▯▯ verl.
╸la meuf  девушка   ▮▮▯▯ verl.
╸kiffer   тащиться  ▮▮▮▯ arg.
░░░░░░░░░░░░   ░░░░░░
░░░░░░░░░░   ░░░░░
░░░░░░░░   ░░░░





[            Стоп            ]
```

Removed / hidden: Same as B

New visual / motion: Tally tick: 6×1.5px red, fades in --dur-quick at the scan line's y when a row arrives; Rows write in from the thumbnail side: 4px x-offset + fade, --dur-enter

Brand conflicts: Extraction returns no per-word y position, so ticks at the scan line's current y would be approximate, which risks 'fake' data (principle 5); I2 specifies a 4px rise, not an x-offset; More red ink on screen than the «sparingly» rule likes

**Why B:** Five progress signals become two, the scan line and one honest status line, which matches MOTION-SPEC principle 5 («one honest sign of life per region») better than the spec's own I1. The ScanLine already takes `percent` and `muted`, so the change is mostly deleting JSX, and the freed height goes to arriving words. C needs data the API does not return.

Files: `components/import/ProcessingView.tsx (ShotSummary compact phone variant: 72×128 thumb, no ImportBar, no Step list, no sub; drop the «Найдено» heading and the footer IMPORT_FOOTNOTE; stage.status carries the step name)`, `components/import/ImportScreen.tsx (stage status strings per phase, if built there)`, `components/ui/StatusLine.tsx (no change expected; check width-locking with the step-name texts)`, `mockups/Import-Processing.dc.html`, `mockups/M-Import-Wait.dc.html`, `mockups/M-Import-Stop-Error.dc.html`, `mockups/MOTION-SPEC.md (§3.1 known-slow row, I1)`

### Import — Review («Найдено N слов», ReviewView + ImportRowItem)

**Today:** The finished 260px ShotSummary (thumbnail, «Готово», full bar, 3 ✓ steps) stays above the list. The status line repeats the header title, «ОТМЕЧЕНО 5 ИЗ 9» repeats the footer button, and the «УРОВЕНЬ · ТЕМА» legend labels self-evident columns. Rows run up to 4 lines (example, «+N полей», «ТЕМА: …» on every row), so about 5 rows show. The footer holds «Тема для всех» + «Добавить 5 слов».

#### A · Flat list with a 44px strip (S)

After the I3 hold, the finished summary collapses into a 44px «Скриншот ›» strip that opens the gallery. The duplicated counters and the legend go, and so does the «ТЕМА:» prefix. Example lines and «+N полей» move into the RowEditor. Rows stay 2 lines: FR/meter, then RU/theme.

```
←  Найдено 9 слов   Выбрать все
┌─┐ Скриншот ›
└─┘
──────────────────────────────
☑ chelou                ▮▮▯▯
  стрёмный          Эмоции ⌄
☑ la meuf               ▮▮▯▯
  девушка             Люди ⌄
☑ kiffer                ▮▮▮▯
  тащиться          Эмоции ⌄
┆☐ la daronne    ▮▯▯▯       ┆
┆  мать? ДОГАДКА  Проверить  ┆
┆  ⚠ Перевод под вопросом    ┆
☐ la thune  УЖЕ ЕСТЬ
  бабки               Деньги
☑ c'est ouf             ▮▮▯▯
  это безумие       Эмоции ⌄
☑ bouffer               ▮▮▯▯
  жрать                 Еда ⌄
──────────────────────────────
[Тема ⌄] [██ Добавить 5 слов █]
```

Removed / hidden: Finished ShotSummary (thumb 220, «Готово», bar, 3 ✓ steps) → 44px strip after --dur-done-hold; Status line «НАЙДЕНО 9 СЛОВ» (kept only when incomplete: «Распознано не всё · ✦ Распознать заново»); «ОТМЕЧЕНО 5 ИЗ 9» (the footer button carries the count); Legend «УРОВЕНЬ · ТЕМА»; «ТЕМА:» prefix on each row; Italic example line and «+N полей» → RowEditor

New visual / motion: Strip collapse: height --dur-move --ease-standard, thumb scales from 120×220 to 32×44 in the same move; reduced = crossfade

Brand conflicts: MOTION-SPEC I3 «same top» needs a line: the top collapses after the hold

#### B · Grouped by proposed theme (M) — **рекомендуется**

A's strip and trims, with rows grouped under their proposed theme, as Sort-Plan does: «→ Эмоции 3 ⌄». Tapping a group heading changes the theme for the whole group, so the per-row theme label disappears and each row becomes one line (FR, RU, meter), like the stream. Duplicates collect in a final «Уже есть» group with the FR struck through by one muted hairline, replacing the tag and the greyed checkbox.

```
←  Найдено 9 слов   Выбрать все
┌─┐ Скриншот ›
└─┘
→ Эмоции  3                  ⌄
──────────────────────────────
☑ chelou    стрёмный    ▮▮▯▯
☑ kiffer    тащиться    ▮▮▮▯
☑ c'est ouf это безумие ▮▮▯▯
→ Люди  3                    ⌄
──────────────────────────────
☑ la meuf   девушка     ▮▮▯▯
☐ un pote   кореш       ▮▮▯▯
┆☐ la daronne мать?  Проверить┆
┆  ⚠ Перевод под вопросом    ┆
→ Еда  1                     ⌄
──────────────────────────────
☑ bouffer   жрать       ▮▮▯▯
УЖЕ ЕСТЬ  2
──────────────────────────────
  la thune  бабки  · Деньги
  les keufs менты  · Полиция
──────────────────────────────
[Тема ⌄] [██ Добавить 5 слов █]
```

Removed / hidden: Everything A removes; Per-row FolderLine «ТЕМА: … ⌄» (a single row moves group via the RowEditor's theme field); «УЖЕ ЕСТЬ» tag + disabled checkbox on duplicate rows → a struck-through row in the «Уже есть» group; 2-line rows → 1-line 48px rows

New visual / motion: Retargeting a group: the heading name crossfades --dur-quick and the group gets the spotlight; a moved single row collapses at the source and lands with the spotlight (§5.10, no flying ghost); Duplicate strike: 1px muted line, drawn once, scaleX --dur-exit; Commit: no per-row motion; one snackbar + theme spotlight in the library (I7, unchanged)

Brand conflicts: MOTION-SPEC I3 «row for row, same order, same top»: grouping reorders rows at the hand-off. Spec change: crossfade the stream list into the grouped list (--dur-quick) after the hold; SPEC Import line «header title Найдено 9 слов» is kept, but the row anatomy in Import-Review changes; «ДОГАДКА» stays on the warn row only (SPEC.md copy rule still met there; plain guessed rows use italic alone — needs a spec note)

#### C · One word at a time (L)

Words are dealt as a stack of index cards: swipe right «Оставить», swipe left «Пропустить», with outlined buttons as the fallback. A «Списком» toggle returns to the list, and «Добавить 5 слов сразу» stays as the one primary, so the usual one-tap add still works.

```
←  Найдено 9 слов       Списком
┌─┐ Скриншот ›            3 / 9
└─┘
  ┌──────────────────────────┐
  │━━━━━━━━━━━━━━━━━━━━━━━━━━│
  │                          │
  │         kiffer           │
  │        тащиться          │
  │       ▮▮▮▯ arg.          │
  │                          │
  │ Эмоции ⌄                 │
  └┬─────────────────────────┘
   └─────────────────────────┘
 ← пропустить     оставить →
[ Пропустить ]  [ Оставить  ]
──────────────────────────────
[██ Добавить 5 слов сразу ███]
```

Removed / hidden: The list (behind «Списком»); Header «Выбрать все»; Footer «Тема для всех» chip

New visual / motion: Swipe with stamps «ОСТАВИТЬ» (ink) / «ПРОПУСТИТЬ» (muted), reusing §5.3 physics; Stack edges show the words left; no «3 / 9» needed once the edges read well

Brand conflicts: The screen gets two button tiers (Пропустить/Оставить + Добавить), which is close to breaking the one-primary rule; Checking 9 words takes up to 9 gestures, against the usual 1-tap job; «ОСТАВИТЬ / ПРОПУСТИТЬ» stamps are new copy and a second stamp vocabulary next to ЗНАЮ / НЕ ЗНАЮ

**Why B:** The 260px of finished progress goes away, and the 9 repeated theme labels become 3 group headings. Changing a theme gets faster: one tap per group instead of per row. Rows shrink to one line, so about 9 fit on screen instead of 5, and «Добавить N слов» stays the single one-tap primary. If the I3 reorder is unacceptable, ship A first: B is A plus grouping.

Files: `components/import/ReviewView.tsx (strip instead of ShotSummary after the hold; remove the status line unless incomplete, ОТМЕЧЕНО, the legend; render theme groups + «Уже есть»; group heading → FolderPicker)`, `components/import/ImportRowItem.tsx (1-line row; drop FolderLine and the «Тема:» prefix, exampleFr, moreFieldsRu; duplicate as a struck row; keep the warn row)`, `components/import/FolderPicker.tsx (target kind «group»: subtitle «Эмоции · 3 слова»)`, `components/import/ProcessingView.tsx (ShotSummary strip variant 32×44 + «Скриншот ›»)`, `components/import/rows.ts (groupRowsByChoice helper)`, `components/import/DeskRowEditor.tsx / RowEditor in ImportRowItem.tsx (example and custom fields shown in the editor)`, `mockups/Import-Review.dc.html`, `mockups/M-Import-Commit.dc.html`, `mockups/MOTION-SPEC.md (I3)`, `mockups/SPEC.md (Import override line, ДОГАДКА rule)`

### Import — Anki setup (AnkiSetupView)

**Today:** The mono file name repeats the single deck name. Below: deck checklist, status line, an optional 300-cap note, the carry-progress toggle with a changing caption, a 3-line footnote, and a sticky bar with the primary plus a full-width secondary «Другой файл».

#### A · Cut the footnote and secondary (S) — **рекомендуется**

Keep the controls. The footnote shrinks to its one fact the user cannot guess. The file name shows only when it differs from the deck name. «Другой файл» becomes a tertiary text button.

```
←  Импорт из Anki
☑ Français argot      240
☑ Verlan               56
☐ Grammaire           120
──────────────────────────────
К ДОПОЛНЕНИЮ 284 · УЖЕ ЕСТЬ 12
──────────────────────────────
Перенести прогресс из Anki (●)
Интервалы и сроки сохранятся.
──────────────────────────────
Аудио и картинки не переносятся.





[✦ Дополнить 284 карточки ████]
        Другой файл
```

Removed / hidden: ANKI_FOOTNOTE first sentence («Переводы, примеры… перед добавлением всё можно проверить»); Mono file name when it equals the deck name; Full-width secondary «Другой файл» → tertiary text

Brand conflicts: None

#### B · Decks as stacks (M)

A's trims, with each deck drawn as a stack of card edges whose height scales with its count. Words you already have show as a muted lower slice. The carry toggle shows a tiny dotted interval rule that collapses to one «new» dot when switched off.

```
←  Импорт из Anki
 ▁▁▁▁▁▁
 ▁▁▁▁▁▁   ☑ Français argot
 ▁▁▁▁▁▁     240 · уже есть 12
 ░░░░░░
 ▁▁▁       ☑ Verlan
 ▁▁▁         56
──────────────────────────────
Перенести прогресс        (●)
 ·  ·   ·      ·  сроки целы
──────────────────────────────
Аудио и картинки не переносятся.



[✦ Дополнить 284 карточки ████]
        Другой файл
```

Removed / hidden: Same as A; Status line «К дополнению · уже есть» (folded into each stack's caption)

New visual / motion: Stack height: 1px edge per ~20 cards, capped at 8; it updates as a plain step when a deck is toggled; Interval dots fade --dur-quick on toggle

Brand conflicts: The decorative stacks carry little real information beyond the count; Removing the status line drops the total that the primary button repeats anyway

**Why A:** This screen is opened rarely and is already only moderately dense. A removes the 3-line paragraph and the second full-width button in one small file change. B adds drawing work for little gain.

Files: `components/import/AnkiViews.tsx (ANKI_FOOTNOTE → «Аудио и картинки не переносятся.»; subtitle only when it differs from the deck name; «Другой файл» as tertiary in the sticky bar :142-162)`

### Context — home (/context, no query)

**Today:** Three header levels (eyebrow «БИБЛИОТЕКА», H1 «Контекст» 32, a marketing subtitle) sit above the search field. Under it: 20 history rows of 60px, each with FR, meter, RU, a mono «5 ПРИМ.» and a × delete. «Очистить» sits at the top. The one discovery block, «Из твоих карточек без примеров», which uses «ты», sits below about 1200px.

#### A · One header, five recent (S)

One header (back arrow + «Контекст» 22), the subtitle only while history is empty, 5 recent rows + «Ещё 15 ›», chips right under them. The × buttons become swipe-to-remove with undo, and «Очистить историю» moves to the end of the full list.

```
←  Контекст
┌──────────────────────────────┐
│ Слово или фраза     FR → RU  │
└──────────────────────────────┘
НЕДАВНИЕ
──────────────────────────────
kiffer  ▮▮▮▯
тащиться, обожать
──────────────────────────────
chelou  ▮▮▯▯
стрёмный, странный
──────────────────────────────
la galère  ▮▮▯▯
засада, мучение
──────────────────────────────
se casser  ▮▮▮▯
свалить, сбежать
──────────────────────────────
Ещё 15 ›
ВАШИ СЛОВА БЕЗ ПРИМЕРОВ
[bouffer] [la thune] [un pote]
[vas-y] [les keufs]
──────────────────────────────
Повтор. Упражн. Добав. ▀Библ.
```

Removed / hidden: Eyebrow «Библиотека» + H1 32 → one Header title; Subtitle (shown only with empty history); Mono «5 ПРИМ.» per row; × per row → swipe-left / long press + snackbar «Отменить»; «Очистить» → «Очистить историю» row at the end of «Ещё»; History rows 6–20 → «Ещё 15 ›»

New visual / motion: Swipe removal uses the library row pattern (strike → collapse, §5.10)

Brand conflicts: SPEC says Контекст has a back arrow «Библиотека»; the title change keeps the back label in aria only

#### B · The field is the header (M) — **рекомендуется**

The search field sits in the header row next to the back arrow, so the first thing on screen is the thing you came to do. Recent queries become one-line 48px rows (FR · first RU · meter), 5 of them plus «Вся история ›». «Ваши слова без примеров» follows straight after.

```
[←] ┌──────────────────────────┐
    │ Слово или фраза  FR → RU │
    └──────────────────────────┘
kiffer      тащиться     ▮▮▮▯
──────────────────────────────
chelou      стрёмный     ▮▮▯▯
──────────────────────────────
la galère   засада       ▮▮▯▯
──────────────────────────────
se casser   свалить      ▮▮▮▯
──────────────────────────────
c'est ouf   это безумие  ▮▮▯▯
──────────────────────────────
Вся история ›

ВАШИ СЛОВА БЕЗ ПРИМЕРОВ
[bouffer] [la thune] [un pote]
[vas-y] [les keufs] [la meuf]



──────────────────────────────
Повтор. Упражн. Добав. ▀Библ.
```

Removed / hidden: Eyebrow, H1, subtitle (subtitle → empty state only); «НЕДАВНИЕ» ink-ruled heading + «Очистить» (the list explains itself; clearing moves to the end of «Вся история»); Second translation, «N ПРИМ.», × per row; Rows 6–20 → «Вся история ›»

New visual / motion: Empty history: one white index card with «J'ai trop kiffé ce film.» and «kiffé» underlined in red; tapping it runs the lookup (the underline draws once, 240ms linear); Row press: tint only (§5.1 full-width rows)

Brand conflicts: SPEC: Контекст «has a back arrow Библиотека» with a title; B drops the visible title (aria-label on the field: «Контекст: слово или фраза»); The field's own header row departs from the shared Header component (needs a slot)

#### C · A demo card and a shelf of tabs (M)

A's header and 5 rows, plus visuals. The empty-history state is a live demo index card. «Ваши слова без примеров» sits on a hairline shelf as small paper tabs (radius 4, top edge only), reading as an invitation rather than a chip list.

```
←  Контекст
┌──────────────────────────────┐
│ Слово или фраза     FR → RU  │
└──────────────────────────────┘
┌──────────────────────────────┐
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ « J'ai trop kiffé ce film. » │
│           ~~~~~~             │
│ Как слово звучит в живой     │
│ речи. Попробуйте ›           │
└──────────────────────────────┘
ВАШИ СЛОВА БЕЗ ПРИМЕРОВ
 ┌───────┐ ┌────────┐ ┌───────┐
 │bouffer│ │la thune│ │un pote│
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ┌─────┐ ┌─────────┐
 │vas-y│ │les keufs│
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────
Повтор. Упражн. Добав. ▀Библ.
```

Removed / hidden: Same as A; Subtitle → the demo card's 2 lines (first visit only)

New visual / motion: Demo underline draws once; Tabs press .96 + tint

Brand conflicts: Shelf rules add ink-heavy lines again (the audit's issue (3)); Tabs are chips in a different shape; another component for the kit

**Why B:** The primary job (type a word) becomes the top of the screen with no header stack above it. Recent queries are 1 line each, and discovery moves from below 1200px to above the fold. Reopening a recent word stays 1 tap. C's demo card works as B's empty state.

Files: `components/context/ContextScreen.tsx (phone Header/Intro → field-in-header; history slice 5 + «Вся история»; :67 cap; empty-state card)`, `components/context/parts.tsx (SearchField compact header variant :59-140; HistoryList 1-line rows without × and historyMeta, clear moved to the end :860-923; NoExampleChips copy «Ваши слова без примеров» :931-951)`, `components/context/data.ts (historyMeta no longer used on phones)`, `components/ui/Header.tsx (slot for a field next to the back arrow)`, `mockups/SPEC.md (Контекст header line in the tab-bar section)`

### Context — word result (/context?q=…, found)

**Today:** The hero card (headword 40, meta, translations each with a bar and a «38%», then «Слово по частям» + «Однокоренные» chips, then «В библиотеке») pushes «Как говорят» to the fold. Each example has 5 parts: ≈ meaning tag, FR, RU, source line, «+ В карточку». Below: a large «Искать ещё в вебе» button with meta, «Искать заново», and a SynonymScale helper text in «ты».

#### A · Trim card and examples (M)

Drop the eyebrow. Translations keep their bars but lose the %. «Слово по частям» collapses into one line in the card that opens in place. Example rows lose the source line and the button: the whole row opens ExampleSheet, with a ✓ only when the example is already in the card. The ≈ tag shows only under «Все», web search becomes a quiet ruled row, and helper notes go.

```
←┌───────────────────────────┐
 │ kiffer           FR → RU ×│
 └───────────────────────────┘
┌──────────────────────────────┐
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ kiffer                       │
│ v. tr. · ▮▮▮▯ arg.           │
│ тащиться      ▬▬▬▬▬▬▬▬▬▬     │
│ обожать       ▬▬▬▬▬▬         │
│ нравиться     ▬▬▬            │
│ Слово по частям · kif + -er ⌄│
│ ▭ В библиотеке · Эмоции    › │
└──────────────────────────────┘
Как говорят          12 ПРИМЕРОВ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Все 12][тащиться 7][обожать 4]
≈ тащиться
J'ai trop kiffé ce film.
Я реально тащусь от фильма.
──────────────────────────────
Je kiffe grave ce son.       ✓
Мне дико нравится этот трек.
```

Removed / hidden: Eyebrow «КОНТЕКСТ»; «38%» per translation (the chips carry the number once); «Слово по частям» parts + origin + «Однокоренные» chips → collapsed row (Collapse); Per-example source line «ФОРУМ · domain ↗» → ExampleSheet; Per-example «+ В карточку» → whole row opens ExampleSheet; «≈ meaning» tag when a meaning chip is selected; «Перевод и синонимы уже готовы…» note (ExamplesWait); SynonymScale helper «Нажми на слово…»; WebMore lg button + meta → ruled row «✦ Ещё из веба · 10–20 с ›»; «Искать заново» → overflow on the «Как говорят» heading

New visual / motion: The red top rule of the card draws left→right once on arrival (--dur-rule-draw); Collapse opens --dur-move (interpolate-size where supported, instant on Safari)

Brand conflicts: None

#### B · The translations are the filter (M) — **рекомендуется**

Everything in A, plus the translation rows themselves become the meaning filter. Tapping «тащиться» in the card filters «Как говорят» and underlines it in red, and «Все переводы» resets. The separate chip row goes, and each row shows its example count in place of a %.

```
←┌───────────────────────────┐
 │ kiffer           FR → RU ×│
 └───────────────────────────┘
┌──────────────────────────────┐
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ kiffer                       │
│ v. tr. · ▮▮▮▯ arg.           │
│ Все переводы             12  │
│ тащиться  ▬▬▬▬▬▬▬▬▬▬      7  │
│ ~~~~~~~~                     │
│ обожать   ▬▬▬▬▬▬          4  │
│ нравиться ▬▬              1  │
│ Слово по частям · kif + -er ⌄│
│ ▭ В библиотеке · Эмоции    › │
└──────────────────────────────┘
Как говорят · тащиться
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
J'ai trop kiffé ce film.
Я реально тащусь от фильма.
──────────────────────────────
Je kiffe grave ce son.       ✓
Мне дико нравится этот трек.
```

Removed / hidden: Everything A removes; MeaningChips row (parts.tsx:388-420) → the translation rows act as radios; «12 ПРИМЕРОВ» count (it sits on «Все переводы»)

New visual / motion: Selected translation: 1.5px red underline drawn left→right (240ms linear); the list below crossfades --dur-quick, with no reflow jump (reserve height); Rows not matching the filter dim to .5 in the card, as an iA-style focus fade

Brand conflicts: The card becomes interactive (a radiogroup inside the article); it needs visible affordance so it reads as controls (NN/g flat-UI guardrail); Rows with 0 examples must be disabled but stay readable as translations

#### C · Examples as a deck of slips (L)

Examples become a horizontally swipeable deck of paper slips, one sentence per slip, with a mono «3 / 12» counter. «Похожие слова» is drawn as one register hairline from нейтр. to vulg., with words hung at their positions.

```
Как говорят               3 / 12
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ┌──────────────────────────┐┐┐
  │ ≈ тащиться               │││
  │                          │││
  │ J'ai trop kiffé ce film. │││
  │           ~~~~~          │││
  │ Я реально тащусь от      │││
  │ этого фильма.            │││
  │                ФОРУМ ↗   │││
  └──────────────────────────┘┘┘
  ‹ свайп                   ›

ПОХОЖИЕ СЛОВА
нейтр.──────────────────vulg.
 adorer   kiffer   surkiffer
  ●─────────●─────────●

Спряжение · 4 времени       ⌄
──────────────────────────────
Повтор. Упражн. Добав. ▀Библ.
```

Removed / hidden: The vertical example list (one slip at a time); SynonymScale columns + helper → register hairline

New visual / motion: Slip swipe uses card physics (--spring-settle, no overshoot); the next slip peeks .96/8px; Register hairline: words placed by slang_level, the vulg. end in red

Brand conflicts: M3E research: dropping a scrolling list scored lower, and hidden items are less discoverable (NN/g); A second swipe deck competes with the review card's gesture vocabulary; Vertical scroll inside a horizontal carousel is hard to make accessible

**Why B:** A alone gets «Как говорят», the reason the screen exists, near the fold and cuts each example from 5 parts to 2. B adds one bold simplification, merging two encodings of the same meanings (bars and chips) into one interactive object. It is the screen's single expressive moment and adds no new gesture. C hides content behind swipes.

Files: `components/context/ContextScreen.tsx (Results phone branch :417-439: remove chipRow, the eyebrow at :262, «Искать заново» → heading overflow :368-372)`, `components/context/parts.tsx (Translations as a radiogroup with counts, no % :167-183; WordMakeup collapsed one-line :189-259 via components/ui/Collapse.tsx; ExampleItem tappable, no SourceLink or AddExampleButton :442-478; ExampleTag only for «Все» :458-461; WebMore quiet row :529-539; ExamplesWait note removed :518-520; SynonymScale helper removed :709)`, `components/context/ExampleSheet.tsx (now the only place for source + «В карточку»; check copy)`, `components/ui/Collapse.tsx (reuse)`, `mockups/Exercise-S-Context-Back.dc.html (+ new Context-Result board)`

### Context — waiting / empty / not found / error states

**Today:** ExamplesEmpty is a dashed card with a serif title, a 3-line explanation and two ✦ buttons. ExamplesWait adds a note explaining what is already visible. NotFound and LookupError are short.

#### A · One line each (S)

ExamplesEmpty becomes the title «Живых фраз пока нет» + two buttons, and «Подобрать пример» keeps «помечен как придуманный» as its caption. The ExamplesWait note goes, and NotFound gets one hint line.

```
Как говорят
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
┆ Живых фраз пока нет        ┆
┆                            ┆
┆[████ ✦ Искать в вебе █████]┆
┆[   ✦ Подобрать пример     ]┆
┆  помечен как придуманный   ┆
└┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘

ИЩЕМ ПРИМЕРЫ В ВЕБЕ    0:06
░░░░░░░░░░░░░░░░░░░░░
░░░░░░░░░░░░░░
░░░░░░░░░░░░░░░░░
Остановить поиск
```

Removed / hidden: ExamplesEmpty 3-line explanation (:607-611); ExamplesWait note «Перевод и синонимы уже готовы…» (:518-520); NotFound hint trimmed to one line

Brand conflicts: None

#### B · A blank slip that gets written on (S) — **рекомендуется**

A's copy cuts, with the empty state drawn as a blank paper slip with dashed ruled lines, the shape a real example will take. «Подобрать пример» writes its sentence into that same slip, marked «придуман», so the empty state turns into the result in place.

```
Как говорят
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌──────────────────────────────┐
│ Живых фраз пока нет          │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄   │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄   │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄   │
└──────────────────────────────┘
[█████ ✦ Искать в вебе ██████]
[    ✦ Подобрать пример      ]
 помечен как придуманный

— после «Подобрать пример» —
┌──────────────────────────────┐
│ ПРИДУМАН                     │
│ J'ai trop kiffé ce concert.  │
│ Я реально тащусь от концерта.│
└──────────────────────────────┘
```

Removed / hidden: Dashed outer box + paragraph; ExamplesWait note

New visual / motion: The invented sentence writes in on the ruled lines (opacity + 4px, --dur-enter); the dashed lines fade out --dur-quick

Brand conflicts: Dashed lines are SPEC's warning/low-confidence vocabulary; use rule-colour hairline dashes, not the amber warn tokens

**Why B:** It costs about the same as A, since it is a CSS change to ExamplesEmpty, and it makes the empty state look like the result it promises. That is the 'teach + one action' empty-state pattern drawn in the index-card idiom.

Files: `components/context/parts.tsx (ExamplesEmpty :588-637, ExamplesWait :502-526, NotFound :341-352)`, `components/context/ContextScreen.tsx (invented example rendered inside the empty slip)`

### Sort plan sheet (phone, SortPlanSheet)

**Today:** Under the title: a reassurance subline, then the finished step list «01 Темы ✓ / 02 Слова · 48/48 ✓» kept after the plan is ready, then the sticky status line with a full bar. Groups with toggles, 44px move rows, and a footer with the undo promise + Отмена/Применить.

#### A · Remove progress once the plan is ready (S) — **рекомендуется**

When phase is ready, the step list collapses and the subline folds into the status line, which becomes the result. Groups and footer stay as they are.

```
Предлагаемые перемещения     ×
12 ПЕРЕМЕЩЕНИЙ · 1 НОВАЯ ТЕМА
64 ВРУЧНУЮ НЕ ТРОГАЕМ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
→ Деньги  3                (●)
le pognon     бабки
les ronds     деньги
être raide    быть на мели
→ Эмоции  2                (●)
avoir la haine  беситься
être vénère     злиться
→ Транспорт  3 ┆новая тема┆ (●)
la caisse     тачка
le tromé      метро
la bécane     байк
→ Люди  2                  ( )
──────────────────────────────
Можно отменить в течение 7 дней.
[ Отмена ] [█ Применить 10 ███]
```

Removed / hidden: Step list 01/02 after ready (collapse --dur-move after --dur-done-hold); Subline «Слова, разложенные вручную, не трогаются (64 слова).» → status line «· 64 ВРУЧНУЮ НЕ ТРОГАЕМ»; The full bar under the status line after ready

New visual / motion: Status line text swaps in place from «Раскладываем слова 48» to the result (width-locked)

Brand conflicts: SPEC Sort-Plan sub line wording changes (it moves to the mono status)

#### B · Where words come from (M)

A's trims, plus each group heading shows from → to as two small theme tabs joined by a hairline arrow. Phones get back the «Откуда» that the desktop ledger has. Mixed sources read «из 3 тем».

```
Предлагаемые перемещения     ×
12 ПЕРЕМЕЩЕНИЙ · 1 НОВАЯ ТЕМА
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Входящие]────▶[Деньги]  3 (●)
le pognon     бабки
les ronds     деньги
être raide    быть на мели
[из 2 тем]────▶[Эмоции]  2 (●)
avoir la haine  беситься
être vénère     злиться
[Входящие]──▶┆Транспорт┆ 3 (●)
la caisse     тачка
le tromé      метро
la bécane     байк
[Входящие]────▶[Люди]    2 ( )
──────────────────────────────
Можно отменить в течение 7 дней.
[ Отмена ] [█ Применить 10 ███]
```

Removed / hidden: Same as A; «64 вручную» line (moved into the undo footer: «Ручные не трогаем · отменить 7 дней»)

New visual / motion: Tabs carry the 3px theme colour band (catalog-label idiom)

Brand conflicts: MOTION-SPEC §5.10: bulk apply has no per-row motion; keep that (do not fold groups into tiles); Long theme names need truncation inside the tabs at 358px

**Why A:** The density here comes from finished progress, the same pattern as the import review. A fixes it with one phase check and a copy move. B adds information rather than removing it, which is useful but not the goal of this pass.

Files: `components/library/SortPlanSheet.tsx (:394-414 hide PlanStep list and bar when phase=ready; subline → status text; EmptyPlan copy :484)`, `mockups/Sort-Plan.dc.html`, `mockups/M-Sort-Plan.dc.html`, `mockups/SPEC.md (Sort-Plan sub line)`

### Settings → «Свои поля» field editor sheet (FieldDefSheet)

**Today:** Title, a name input, a «Что писать» textarea, a hint note that repeats the placeholder, the auto-fill toggle with an implementation caption, reorder «Место в списке 2 из 3 ↑↓», Сохранить, and a danger delete with a note.

#### A · Form only (S)

Remove the hint note. Show the auto-fill caption only while the toggle is on, as «При добавлении слова». Move reordering to long-press-drag on the «Свои поля» list. The delete note moves into the undo snackbar.

```
Новое поле                   ×
НАЗВАНИЕ
┌──────────────────────────────┐
│ Например, Синонимы           │
└──────────────────────────────┘
ЧТО ПИСАТЬ
┌──────────────────────────────┐
│ Например: 2–3 синонима на    │
│ французском                  │
└──────────────────────────────┘
Заполнять автоматически    (●)
При добавлении слова

[████████ Сохранить █████████]
         Удалить поле
```

Removed / hidden: Note «Подсказка для автоматического заполнения и для вас.» (:323-327); Auto-fill caption when off; shortened when on; «Место в списке N из M» + ↑↓ → long-press-drag on the list rows; Delete note → snackbar «Поле удалено · значения остались на карточках · Отменить»

New visual / motion: List drag: lift --lift-y −2px, settle --spring-settle (existing tokens)

Brand conflicts: Long-press drag needs a visible alternative (NN/g guardrail): keep ↑↓ in the row's long-press actions sheet

#### B · Live preview of the card back (S) — **рекомендуется**

A's cuts, plus a strip at the top of the sheet shows the card back's «СВОИ ПОЛЯ» block for a sample word. The field being typed appears there as a label/value row, with the hint as a muted italic value. The preview explains what the notes used to explain.

```
Новое поле                   ×
┌──────────────────────────────┐
│ la thune · бабки             │
│ СВОИ ПОЛЯ                    │
│ Синонимы   2–3 синонима на   │
│            французском       │
└──────────────────────────────┘
НАЗВАНИЕ
┌──────────────────────────────┐
│ Синонимы|                    │
└──────────────────────────────┘
ЧТО ПИСАТЬ
┌──────────────────────────────┐
│ 2–3 синонима на французском  │
└──────────────────────────────┘
Заполнять автоматически    (●)

[████████ Сохранить █████████]
         Удалить поле
```

Removed / hidden: Everything A removes; Placeholders «Например…» (the preview shows the example; placeholders stay as a fallback)

New visual / motion: The preview row updates per keystroke (no animation); on Сохранить the row gets the spotlight before the sheet closes

Brand conflicts: A white preview card inside a white sheet needs the 1px rule to separate it; no shadow; Adds one element while removing three, a net simplification

**Why B:** It replaces two lines of explanation, and the reorder controls, with one picture of the result. It makes the sheet more visual at almost no cost: one static block bound to the inputs.

Files: `components/settings/CustomFieldsSection.tsx (FieldDefSheet :388-455: preview strip, remove note :323-327, auto caption conditional :414-422, drop reorder :424-442; list long-press reorder :94-124)`, `mockups/Settings-Fields.dc.html (new board)`

## Shell & shared UI (mobile, < 768px)

### Phone shell frame + TabBar (every tab route)

**Today:** The bar is 61px plus about 34px of home indicator, roughly 95px of 844 (11%). It is visible on every tab route, including the whole review session. It has 4 labelled columns and a 2px red marker that slides (N1). «Добавить» looks like a tab but opens the add sheet. A mechanism to hide it already exists: hidesTabBar() covers /import and /exercises/play, and revealTabBar() brings it back on the Exercise done view (TabBar.tsx:25-51, ExercisePlayer.tsx:218).

#### A · Тоньше (S)

Keep everything but tighten it. Item height 60→52px, gap-1→gap-0.5, labels 12→11px. The active glyph switches from a 1.5 to a 2px stroke over --dur-quick, so weight reinforces the red marker without adding colour. A slow navigation shows the PendingTick-style 2px ink tick under the tapped label after --link-pending-delay. Saves 8px on every screen.

```
+--------------------------------+
| Карточки для Лизи       ↶   ⚙  |
| [FR → RU]  [Все темы ▾]        |
| ━━━━━━━━━━━━━──────────────    |
| ┌────────────────────────────┐ |
| │ FR                         │ |
| │━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ |
| │                            │ |
| │         se casser          │ |
| │          v. pron.          │ |
| │                            │ |
| └────────────────────────────┘ |
|                                |
| [       Показать ответ       ] |
|                                |
|▬▬▬▬▬▬▬▬────────────────────────|
|  ▢       ☑       +       ▤     |
| Повтор… Упражн… Добав… Библио… |
+--------------------------------+
 бар 52px (было 60), подписи 11px
 полностью; активная иконка 2px
```

Removed / hidden: 8px of bar height; nothing else; labels are only truncated in the ASCII, the real labels stay full

New visual / motion: active icon stroke 1.5→2px over --dur-quick; pending ink tick under the tapped label

Brand conflicts: SPEC «Bottom tab bar»: height 60px + 28px; SPEC Type: captions are 12px; 11px labels go below that

#### B · Фокус-сессия (M) — **рекомендуется**

Treat the review session like the exercise player and import, which already run full-screen. Once a session starts («Начать», or the first card when the Review group keeps auto-start), the bar leaves with opacity + 8px down over --dur-exit. It comes back with an 8px rise over --dur-enter at «Готово на сегодня», on the session ✕, or when the user leaves the route. The bar stays on the idle Повторение, Упражнения list, Библиотека and every sub-screen. Implementation: generalise revealTabBar into a small store, hideTabBar(reason) / showTabBar(), and have ReviewScreen hold it while a session is active. --shell-bottom already recomputes from :has([data-tabbar]) (layout.tsx:18), so the card column grows by about 95px. The space is reclaimed in the same frame as the idle→session state change, never mid-session, so nothing jumps.

```
+--------------------------------+
| ✕  ━━━━━━━━━━━──────────────   |
|                                |
| ┌────────────────────────────┐ |
| │━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ |
| │                            │ |
| │                            │ |
| │                            │ |
| │         se casser          │ |
| │          v. pron.          │ |
| │                            │ |
| │                            │ |
| │                            │ |
| └────────────────────────────┘ |
|  └──────────────────────────┘  |
|   └────────────────────────┘   |
|                                |
| [       Показать ответ       ] |
|                                |
|                                |
+--------------------------------+
 сессия: таб-бара нет (+95px
 карточке); вернётся на «Готово
 на сегодня» или по ✕
```

Removed / hidden: The whole tab bar during an active review session. It returns at Session-Done, on ✕, and on route change.; Switching tabs mid-session costs one extra tap (✕ then the tab). Quick-add stays reachable from the session's «⋯» sheet as «Новое слово» (Review group), so adding a word is still 2 taps.

New visual / motion: Tab bar exit is opacity + 8px down over --dur-exit; return is an 8px rise over --dur-enter (snackbar vocabulary). Reduced motion: fade only.; The red marker keeps its column across the hide, so the bar comes back exactly as it left

Brand conflicts: SPEC «Shared components»: the tab bar is listed on the Review boards, so the SPEC needs a line: «нет во время сессии»; SPEC v3 Review top row (mark, FR→RU, theme chip, undo + settings) must shrink to ✕ + progress line + ⋯. That change belongs to the Review group.; MOTION-SPEC principle 4 «Nothing jumps»: the 95px must be reclaimed together with the idle→session change; MOTION-SPEC §4.10 has no tab-bar exit entry; add N5

#### C · Чернильная линия (M)

Keep the bar but turn chrome into one continuous ink line. On «Добавить», the 2px red marker translates to column 3 over --dur-move. It then becomes the add sheet's top rule: the sheet's border-t is red for --dur-sheet and settles to ink. The sheet visibly comes from its tab. In long lists (Library, theme page) scrolling down compacts the bar to 44px icons-only, with labels fading over --dur-quick. It restores when scrolling stops or reverses, like the iOS 26 minimised tab bar but opaque white with a hairline and no glass.

```
+--------------------------------+
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|░░░░░░ страница под скримом ░░░░|
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓|
|┃             ────             ┃|
|┃ Новое слово               ✕  ┃|
|┃ ┌──────────────────────────┐ ┃|
|┃ │ bouffer|                 │ ┃|
|┃ └──────────────────────────┘ ┃|
|┃ Словарь                      ┃|
|┃ жрать, есть                  ┃|
|┃ ──────────────────────────── ┃|
|┃                              ┃|
|┃ [        Добавить          ] ┃|
|┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛|
+--------------------------------+
 1) тап «Добавить»: красный
    маркер едет в колонку 3
 2) растягивается в верхнюю
    линию листа, лист поднимается
 3) линия красная → чернильная
 + в длинных списках бар при
   прокрутке вниз → 44px, иконки
```

Removed / hidden: Labels while scrolling down long lists (icons stay; labels return when scrolling stops)

New visual / motion: the marker slides to «Добавить» and hands off to the sheet's top rule (red→ink); scroll-compacted bar: labels fade over --dur-quick, height eases over --dur-move

Brand conflicts: SPEC: red ink used sparingly; the red sheet edge is transient but new; MOTION-SPEC §5.7 / A1 define the sheet open; the marker hand-off would be an addition; Hiding labels on scroll goes against research guidance (M3E: removing labels hurt usability), so labels must return quickly

**Why B:** The review screen is the only place where the bar's 11% of the screen competes with the job. B gives the card about 95px there and touches no other tab. Apple HIG allows it (a modal, self-contained task may cover the tab bar), and Duolingo, Oak and Dia all strip chrome during a session. The code already has the mechanism (hidesTabBar / revealTabBar for import and the exercise player), so it is mostly a generalisation. A's 2px active glyph can ride along at no cost. C's marker-to-sheet hand-off is a good later polish, but it adds motion without removing anything.

Files: `/home/user/french_cards/components/ui/TabBar.tsx`, `/home/user/french_cards/components/review/ReviewScreen.tsx`, `/home/user/french_cards/components/exercises/ExercisePlayer.tsx`, `/home/user/french_cards/app/(app)/layout.tsx`, `/home/user/french_cards/app/globals.css`, `/home/user/french_cards/components/ui/index.ts`, `/home/user/french_cards/components/ui/ui.test.ts`, `/home/user/french_cards/mockups/SPEC.md`, `/home/user/french_cards/mockups/MOTION-SPEC.md`

### Sub-screen Header (theme page, Контекст, Настройки, План повторения, Импорт)

**Today:** A 44px row 16px below the safe area, with back, then either a Newsreader 22 title or a mono uppercase eyebrow, then 44px actions (Header.tsx:72-83). The theme page stacks the eyebrow «БИБЛИОТЕКА / ТЕМА», a 32px h1, the outlined tags «закреплена» / «на паузе», a mono line «42 СЛОВА · 6 К ПОВТОРЕНИЮ», and a progress row: three meta rows before the first word (FolderScreen.tsx:141-180). Контекст home shows the eyebrow «БИБЛИОТЕКА», which names the back destination rather than the screen (ContextScreen.tsx:264).

#### A · Без подписей-крошек (S)

A content trim with no new behaviour. Drop the eyebrow on the theme page; the back arrow and the h1 already say it. On Контекст home, the eyebrow «Библиотека» becomes the title «Контекст». «закреплена» leaves the title line; it already lives as a toggle in FolderMenuSheet. «на паузе» becomes an italic abbr «пауза» in muted under the name. Count and due merge into the end of the progress row («18 · 3 к повт.», with 3 in red). That is one meta row instead of two.

```
+--------------------------------+
| ←                           ⋯  |
|                                |
| Деньги                         |
| пауза                          |
| ━━━━━━━━━━━──────── 18 · 3 к п.|
|                                |
| la thune                  ▮▮▮▯ |
| бабки, деньги                  |
| ────────────────────────────── |
| le fric                   ▮▮▯▯ |
| бабло                          |
| ────────────────────────────── |
| un pote                   ▮▮▯▯ |
| кореш, друг                    |
| ────────────────────────────── |
|                                |
| [       Повторить тему       ] |
|▬▬▬▬▬▬▬▬────────────────────────|
|  ▢       ☑       +       ▤     |
+--------------------------------+
 нет «БИБЛИОТЕКА / ТЕМА»; нет
 «закреплена»; счёт в линии
```

Removed / hidden: the eyebrow «Библиотека / тема» (FolderScreen.tsx:143); the eyebrow «Библиотека» on Контекст home, replaced by the title «Контекст»; the «закреплена» tag (stays in the ⋯ sheet); the separate mono stats line, merged into the progress row

#### B · Большой заголовок, который складывается (M) — **рекомендуется**

Everything in A, plus one header pattern for every sub-screen. At rest the header row holds only back and actions, with no title and no hairline. The screen name is a large Newsreader title in the content (32px theme name; «Настройки» and «План повторения» move from the header into the content at 28px). When the title scrolls under the header it fades into the header row as a 17px serif title over --dur-quick. A 1px hairline then draws in under the header with the existing rule-draw keyframe. The hairline marks 'content under the edge of the paper' and only appears then. Detection uses an IntersectionObserver sentinel, not animation-timeline, so it works on every iOS version. No blur, no shadow.

```
в покое
+--------------------------------+
| ←                           ⋯  |
|                                |
| Деньги                         |
| ━━━━━━━━━━━──────── 18 · 3 к п.|
| la thune                  ▮▮▮▯ |
| бабки, деньги                  |
| ────────────────────────────── |
+--------------------------------+
после прокрутки
+--------------------------------+
| ←          Деньги           ⋯  |
|────────────────────────────────|
| les keufs                 ▮▮▮▯ |
| менты              verl.       |
| ────────────────────────────── |
| la galère                 ▮▮▯▯ |
| засада, мучение                |
+--------------------------------+
 заголовок 32 → 17px в строку
 шапки; волосяная линия
 дорисовывается (rule-draw)
```

Removed / hidden: all eyebrows: the `eyebrow` prop is deprecated on phones; the header title at rest (it lives in the content); the permanent header hairline (shown only while content is under it)

New visual / motion: the large title collapses into the header row over --dur-quick (opacity + 4px); the header hairline draws left→right over --dur-rule-draw when content scrolls under it, and fades out over --dur-exit when it returns

Brand conflicts: MOTION-SPEC has no entry for header collapse; add one under §4.10; MOTION-SPEC L6 needs the first-frame title from the tapped tile; it stays, now as the large title

#### C · Крошки движением (L)

Show the breadcrumb with motion instead of a label. From the Library, the tapped tile's theme name and 3px colour band morph into the theme page's large title and a full-width 3px band at the top. This is a shared element via React <ViewTransition> / view-transition-name «theme-<id>». Back plays it in reverse. Settings, Контекст and the plan get the same title cross-fade with the screen they came from. No eyebrow is needed anywhere.

```
Библиотека: тап по «Деньги»
+--------------------------------+
| ┌─▀▀▀▀▀▀▀▀▀──┐ ┌────────────┐  |
| │ Деньги     │ │ Еда        │  |
| │ ━━━━────── │ │ ━━──────── │  |
| └────────────┘ └────────────┘  |
+--------------------------------+
      │ название и полоса темы
      ▼ перетекают (shared el.)
+--------------------------------+
|▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀|
| ←                           ⋯  |
| Деньги                         |
| ━━━━━━━━━━━──────── 18 · 3 к п.|
| la thune                  ▮▮▮▯ |
| бабки, деньги                  |
+--------------------------------+
 «назад» — обратный перелёт;
 хлебные крошки показывает
 движение, не подпись
```

Removed / hidden: all eyebrows; the separate stats line (as in A)

New visual / motion: shared-element morph tile→theme page (position and size only, --dur-turn); reduced motion: cross-fade; a 3px theme band at the top of the theme page

Brand conflicts: MOTION-SPEC L6 specifies a 24px nav-forward slide; the morph replaces it for tile→theme; SPEC: theme colours appear only in the tile's top band and progress line; a page-top band stretches that rule; Depends on view transitions (Safari 18+) and Next 16.4's ViewTransition support. The AGENTS.md docs folder is missing from node_modules, so this is unverified.

**Why B:** B removes the eyebrow and a permanent hairline from every sub-screen. It replaces the two header modes (title or eyebrow) with one pattern, and the only motion it adds uses the brand's existing rule-draw. It includes all of A's trims. C is the most visual, but it depends on view-transition support and changes MOTION-SPEC L6. It can follow later on top of B's large titles.

Files: `/home/user/french_cards/components/ui/Header.tsx`, `/home/user/french_cards/components/library/FolderScreen.tsx`, `/home/user/french_cards/components/context/ContextScreen.tsx`, `/home/user/french_cards/components/settings/SettingsScreen.tsx`, `/home/user/french_cards/components/settings/StudyPlanSettings.tsx`, `/home/user/french_cards/components/settings/StudyPlanScreen.tsx`, `/home/user/french_cards/components/import/PickView.tsx`, `/home/user/french_cards/app/globals.css`, `/home/user/french_cards/mockups/MOTION-SPEC.md`

### Bottom sheet: action / picker (auto height): FolderMenuSheet, LedgerMenuSheet, DirectionSheet, FolderPickerSheet

**Today:** Each sheet has a scrim, the 1px ink top rule, a handle, and a 44px title row (Newsreader 22 + a 44px ✕). Pickers add mono uppercase section labels with an ink underline («МОИ НАБОРЫ», «ТЕМЫ», FolderPickerSheet.tsx:114/155). Action rows are 52px with an 18px leading icon (FolderMenuSheet.tsx:55-66). Rows carry helper captions («N слов вперемешку, не влияет на расписание.»), and the toggle rows have 2-line captions. That is about 12 marks for 'pick one action'.

#### A · Только слова (S) — **рекомендуется**

Text-only rows. The leading icons go, because the Russian verb already says it. The ✕ on auto-height sheets becomes visually hidden but focusable: it is sr-only until :focus-visible, so VoiceOver and keyboard users keep it, while handle, scrim and drag stay the visible ways to close. Full sheets and DialogSheet keep the visible ✕. Section labels lose the ink underline; a hairline between groups is enough. Helper captions become a same-line italic tail («Тренировка — без расписания»). Toggle captions show only in an aria-description, plus visibly the first 3 times the sheet opens (a per-device flag).

```
+--------------------------------+
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|┌──────────────────────────────┐|
|│             ────             │|
|│ Деньги                       │|
|│ ──────────────────────────── │|
|│ Открыть тему                 │|
|│ ──────────────────────────── │|
|│ Повторить тему             3 │|
|│ ──────────────────────────── │|
|│ Тренировка  — без расписания │|
|│ ──────────────────────────── │|
|│ Название, описание и цвет    │|
|│ ──────────────────────────── │|
|│ Закрепить тему         [○  ] │|
|│ ──────────────────────────── │|
|│ На паузе               [○  ] │|
|│ ──────────────────────────── │|
|│ Расформировать               │|
|│ ──────────────────────────── │|
|│ Удалить тему    (красным)    │|
|└──────────────────────────────┘|
+--------------------------------+
 без иконок, без ✕ (sr-only до
 фокуса), без 2-строчных подписей
```

Removed / hidden: 18px leading icons on action rows; the visible ✕ on auto-height sheets (still focusable, sr-only until focus-visible); the ink underline under section labels; 2-line helper and toggle captions (shown the first 3 times, then only as an aria-description)

Brand conflicts: NN/g bottom-sheet guidance asks for a visible ✕. It stays visible on full sheets and stays reachable for assistive tech here.

#### B · Частое сверху, редкое под «Ещё» (M)

A's trims, plus the sheet splits into frequent and rare. It opens at medium height with the 3 everyday actions: Повторить тему, Тренировка, Название… A final «Ещё ⌄» row expands in place (Collapse, --dur-move) to show Закрепить, На паузе, Расформировать and Удалить. One disclosure level and never a second sheet. The sheet height roughly halves.

```
+--------------------------------+
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|┌──────────────────────────────┐|
|│             ────             │|
|│ Деньги                       │|
|│ ──────────────────────────── │|
|│ Повторить тему             3 │|
|│ ──────────────────────────── │|
|│ Тренировка  — без расписания │|
|│ ──────────────────────────── │|
|│ Название, описание и цвет    │|
|│ ──────────────────────────── │|
|│ Ещё                        ⌄ │|
|└──────────────────────────────┘|
+--------------------------------+
 «Ещё» раскрывается на месте:
 Закрепить · На паузе ·
 Расформировать · Удалить
 (один уровень, без 2-го листа)
```

Removed / hidden: the pin, pause, disband and delete rows (behind «Ещё», one tap); the same icon and caption trims as A

New visual / motion: «Ещё» expands in place: Collapse over --dur-move, rows opacity over --dur-enter

Brand conflicts: «На паузе» changes what reaches review and is used fairly often (the cards MCP suggests pausing themes), so +1 tap on a semi-frequent action

#### C · Раздача карточек (M)

A's trims, plus paper motion. As the sheet lands, its 1px top rule draws left→right (rule-draw, 400ms linear), echoing the index-card header rule. On the first open in a session, rows are dealt with a 4px enter-rise staggered 20ms apart. In pickers the selected row is marked by the desktop ActiveBar (a 2px red bar at the left edge) instead of a check, bold text and a count.

```
+--------------------------------+
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|┌━━━━━━━━━━━━━━━━━━━━──────────┐|
|│    линия рисуется → ────     │|
|│ Что повторяем                │|
|│                              │|
|│ Все темы                  23 │|
|│ ──────────────────────────── │|
|▌ Деньги                     3 │|
|│ ──────────────────────────── │|
|│ Еда                        2 │|
|│ ──────────────────────────── │|
|│ Полиция                    2 │|
|│ ──────────────────────────── │|
|│ Тусовка                    4 │|
|│ ──────────────────────────── │|
|│ Эмоции                     5 │|
|└──────────────────────────────┘|
+--------------------------------+
 верхняя линия листа дорисовы-
 вается при посадке; выбранное —
 2px красная метка слева (вместо
 галочки и жирного); строки
 «раздаются» +4px, 20мс шаг
```

Removed / hidden: the check icon on the selected picker row; the same icon and caption trims as A

New visual / motion: sheet top rule drawn over --dur-rule-draw on open; first-open row stagger: enter-rise 4px, 20ms apart (reduced motion: fade); a 2px red selection bar (ActiveBar) in pickers

Brand conflicts: MOTION-SPEC §5.7: «Content inside never animates on open (it is already there)», which the stagger breaks; SPEC: «no left-border accent cards»; a red left bar can read as one

**Why A:** Action sheets open many times a day, and their job is to pick one line and leave. A removes about 40% of the marks (icons, the second focal point ✕, underlines, grey captions) with no new behaviour and no extra taps. B hides «На паузе», which changes what reaches review. C breaks MOTION-SPEC §5.7. Only C's top-rule draw is worth taking later, because it decorates the sheet edge and not the content.

Files: `/home/user/french_cards/components/ui/Sheet.tsx`, `/home/user/french_cards/components/library/FolderMenuSheet.tsx`, `/home/user/french_cards/components/library/LedgerMenuSheet.tsx`, `/home/user/french_cards/components/settings/DirectionSheet.tsx`, `/home/user/french_cards/components/review/FolderPickerSheet.tsx`, `/home/user/french_cards/components/review/ReviewSetSheet.tsx`, `/home/user/french_cards/components/library/theme-pause.ts`

### Bottom sheet: large / full with sticky footer and keyboard (quick add, word detail, sort plan, filter sheet)

**Today:** «large» is 78% of the visual viewport (Sheet.tsx:157), so the top 22% shows the dimmed review header, chips and counters through a .4 scrim. The add sheet's header packs «КАРТОЧКА № 012», ✕, the title «Новое слово», two outlined buttons (Скриншот, Список) and a red rule into two chrome rows (add/parts.tsx:38, :557). Then come the scrolling body, a snackbar slot, and the footer with its rule and actions. About 8 regions before the input that is the real job.

#### A · Одна строка шапки + глубже скрим (M) — **рекомендуется**

Sheet gains a slim SheetHeader slot: title + at most one trailing action + ✕ in one 44px row, then the red rule. For quick add, «№ 012» goes, and Скриншот / Список fold into one «⋯» (coordinated with the Add group). Large and full sheets get a deeper scrim token (--scrim-deep .55 light / .7 dark), so the page behind reads as paper texture rather than legible counters.

```
+--------------------------------+
|▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓|
|▓▓▓▓▓ скрим .55: только бумага ▓|
|▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓|
|┌──────────────────────────────┐|
|│             ────             │|
|│ Новое слово          ⋯    ✕  │|
|│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│|
|│                              │|
|│ bouffer|                     │|
|│ ──────────────────────────── │|
|│ Словарь                      │|
|│ жрать, есть            ▮▮▯▯  │|
|│ ──────────────────────────── │|
|│                              │|
|│──────────────────────────────│|
|│ [         Добавить         ] │|
|└──────────────────────────────┘|
|      ⌨  клавиатура             |
+--------------------------------+
 шапка в 1 строку: заголовок +
 ⋯ (Скриншот, Список) + ✕;
 «№ 012» убран
```

Removed / hidden: the second chrome row of the add header; the «Карточка № 012» mono label; the Скриншот / Список outlined buttons (moved into one ⋯; also reachable from Библиотека import); legibility of the busy page behind (deeper scrim)

Brand conflicts: SPEC Shape: scrim rgba(17,17,17,.4) is the only sheet scrim; this adds a deeper variant for large/full

#### B · Лист на лист (M)

Quick add and word detail open «full» (56px gap). The page behind slides into the stack: scale .96 with its top edge peeking 8px under the safe area (vaul shouldScaleBackground, with the wrapper background forced to --paper and no radius change beyond 6). One sheet of paper is laid on another, so the review header becomes an edge instead of noise. Uses the A header.

```
+--------------------------------+
|  ┌──────────────────────────┐  |
|  │ (страница, 96%, край)    │  |
|┌─┴──────────────────────────┴─┐|
|│             ────             │|
|│ Новое слово          ⋯    ✕  │|
|│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│|
|│                              │|
|│ bouffer|                     │|
|│ ──────────────────────────── │|
|│ Словарь                      │|
|│ жрать, есть            ▮▮▯▯  │|
|│ ──────────────────────────── │|
|│ Варианты                     │|
|│ ─────                        │|
|│ ───────                      │|
|│                              │|
|│──────────────────────────────│|
|│ [         Добавить         ] │|
|└──────────────────────────────┘|
+--------------------------------+
 «full» + страница отъезжает в
 стопку (scale .96, без тени):
 лист кладётся поверх листа
```

Removed / hidden: the visible page behind (reduced to a peeking paper edge); the same header trims as A

New visual / motion: page behind scales to .96 on --spring-settle as the sheet rises, and back on close; reduced motion: none

Brand conflicts: MOTION-SPEC N3: «parent scale untouched (vaul default kept)»; vaul's background scaling paints the body black behind the page; it must be overridden to paper

#### C · Строка становится листом (L)

When a full sheet opens from a list row (word detail), the row's headword morphs into the sheet title as a shared element. That replaces the mono «Карточка №» label as the 'which card' signal. The sticky footer rides the keyboard on --spring-settle (useVisualViewport already gives the height), so the commit button feels attached to the paper's edge.

```
Библиотека: тап по строке
+--------------------------------+
| la thune                  ▮▮▮▯ |
|  ▲ заголовок слова улетает     |
+--|-----------------------------+
   ▼
+--------------------------------+
|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
|┌──────────────────────────────┐|
|│             ────             │|
|│ la thune                  ✕  │|
|│ n. f. · arg.          ▮▮▮▯   │|
|│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│|
|│ бабки, деньги                │|
|│ ──────────────────────────── │|
|│ Синонимы: le fric, l'oseille │|
|│                              │|
|│──────────────────────────────│|
|│ [Повторить]   [Изменить]     │|
|└──────────────────────────────┘|
+--------------------------------+
 строка → заголовок слова
 (ViewTransition); футер едет
 с клавиатурой на spring-settle
```

Removed / hidden: the «Карточка № N» label in word detail chrome

New visual / motion: row headword → sheet title morph (--dur-turn, position and size only); footer follows the keyboard on --spring-settle

Brand conflicts: MOTION-SPEC L9 and §5.7 define no shared element; one would need adding; A shared element across a vaul portal needs view-transition support (Safari 18+) and is fragile with the drawer's own transform

**Why A:** The noise here comes from stacked chrome and a legible page behind the sheet. A fixes both with one Sheet slot and one token, and does not change how sheets move. B's paper stack is attractive but fights vaul's defaults and MOTION-SPEC N3. C is the most fragile technically. Both can follow once A's slim header exists.

Files: `/home/user/french_cards/components/ui/Sheet.tsx`, `/home/user/french_cards/app/globals.css`, `/home/user/french_cards/components/add/parts.tsx`, `/home/user/french_cards/components/add/QuickAddSheet.tsx`, `/home/user/french_cards/components/library/WordDetailSheet.tsx`, `/home/user/french_cards/components/library/SortPlanSheet.tsx`, `/home/user/french_cards/components/library/LibraryFilterSheet.tsx`, `/home/user/french_cards/mockups/SPEC.md`

### Snackbar (app-level above the tab bar, and inside an open sheet)

**Today:** An ink bar, 48px tall, the full column width, 14px white text with truncate, and an underlined «Отменить» (Snackbar.tsx:40-67). It shows for 5s, or 7s with an action. Of 79 .show() call sites, about 60 have no action. Most of those are errors, but about 18 are success-only or 'undo done' confirmations: «Тема «…» создана» ×3, «Сортировка / Изменения / Уровни отменены», «Импорт отменён» ×2, «Практика окончена», «Резервная копия сохранена», «Пример скопирован», COPIED_MESSAGE ×4 and «Запрос скопирован». On a 390px phone it is the heaviest object on screen.

#### A · Только «Отменить» и ошибки (M) — **рекомендуется**

Policy plus a helper. The snackbar is reserved for (a) undoable actions and (b) errors. Success-only messages become in-place feedback: the created tile or row gets the existing spotlight; copy buttons swap their label for 1.2s («Скопировано», reusing the stacked crossfade from I6). After an undo, the restored thing returns with its own motion plus a spotlight, and no second bar narrates it. Messages are trimmed to verb + object («Тема удалена»); the consequence shows where it landed (Входящие count spotlight). A new acknowledge(el, label?) in lib/motion.ts replaces the success calls.

```
+--------------------------------+
| Библиотека                ⌕  ⚙ |
|                                |
| ┌────────────┐ ┌────────────┐  |
| │ Деньги     │ │ Еда        │  |
| │ ━━━━━───── │ │ ━━──────── │  |
| └────────────┘ └────────────┘  |
| ┌────────────┐ ┌────────────┐  |
| │░Тусовка░░░░│ │ Полиция    │  |
| │░━━━━━━─────│ │ ━━━━────── │  |
| └────────────┘ └────────────┘  |
|   ▲ новая тема: «бумажная»     |
|     подсветка 1.2с, без бара   |
|                                |
| [Скопировать] → [Скопировано]  |
|   (подпись кнопки на 1.2с)     |
|                                |
|▬▬▬▬▬▬▬▬────────────────────────|
|  ▢       ☑       +       ▤     |
+--------------------------------+
 бар остаётся только для
 «Отменить» и ошибок
```

Removed / hidden: about 18 success-only or undo-confirmation snackbars (replaced by spotlight or button label swap); second clauses after « · » in messages

New visual / motion: spotlight on the created or restored element (existing keyframe); copy buttons: label crossfade to «Скопировано» for 1.2s

#### B · Плашка «Отменить» (S)

Shrink the bar itself. On the review screen the card already shows what happened: it flew off, and undo brings it back from that side. So the review undo becomes a compact ink slab holding only «Отменить», 44px tall and right-aligned above the grade bar. Elsewhere the bar drops to 40px with verb + object only.

```
+--------------------------------+
| ┌────────────────────────────┐ |
| │━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ |
| │                            │ |
| │          le fric           │ |
| │                            │ |
| └────────────────────────────┘ |
|                                |
|                                |
|                   ┌─────────┐  |
|                   │Отменить │  |
|                   └─────────┘  |
| [Не знаю] [Сложно]  [Знаю]     |
+--------------------------------+
 на повторении: только чернильная
 плашка «Отменить», без текста —
 карта сама вернулась/улетела.
 Остальные экраны: «глагол +
 объект», 40px: «Тема удалена»
```

Removed / hidden: the message text on the review undo bar (kept as an aria-live announcement); 8px of bar height elsewhere

New visual / motion: the undo slab rises 8px over --dur-enter and leaves 8px down over --dur-exit

Brand conflicts: SPEC v3: «Snackbar: ink bg, white text, «Отменить» underlined» shows message + action; MOTION-SPEC R9 positions the review snackbar as a full bar overlay

#### C · Тающая линия (S)

Keep the bar and make the undo window visible. A 1px on-ink line along the bar's bottom edge shrinks with the remaining time (scaleX, linear). It pauses while the bar is touched or the page is hidden; the logic already exists at Snackbar.tsx:222-227. The user sees how long they can still undo instead of guessing.

```
+--------------------------------+
|                                |
| ...экран...                    |
|                                |
| ┌────────────────────────────┐ |
| │ Тема удалена      Отменить │ |
| │━━━━━━━━━━━━━━━━━━──────────│ |
| └────────────────────────────┘ |
|   ▲ 1px линия на чернилах      |
|     тает за 7с (scaleX, linear)|
|     пауза при касании/скрытии  |
|▬▬▬▬▬▬▬▬────────────────────────|
|  ▢       ☑       +       ▤     |
+--------------------------------+
 после «Отменить» второго бара
 нет: вещь возвращается своим
 движением + подсветка
```

Removed / hidden: the follow-up «… отменено» snackbar

New visual / motion: a 1px timer line shrinking over the bar's duration, paused with the timer; reduced motion: static

Brand conflicts: MOTION-SPEC principle 5: «Bars never move backwards». A shrinking line reads as a bar running backwards.

**Why A:** A deletes about a fifth of all snackbar appearances, the most frequent black 48px interruptions, without changing the component's look or any undo path. Feedback lands where the user is already looking. B's message-less review slab can follow once the Review group adopts the card-return motion. C adds a mark rather than removing one and strains MOTION-SPEC principle 5.

Files: `/home/user/french_cards/components/ui/Snackbar.tsx`, `/home/user/french_cards/lib/motion.ts`, `/home/user/french_cards/components/library/LibraryScreen.tsx`, `/home/user/french_cards/components/library/LibraryDesk.tsx`, `/home/user/french_cards/components/shell/Sidebar.tsx`, `/home/user/french_cards/components/library/SortPlanSheet.tsx`, `/home/user/french_cards/components/library/EnrichPlanSheet.tsx`, `/home/user/french_cards/components/library/LevelFillSheet.tsx`, `/home/user/french_cards/components/review/ReviewScreen.tsx`, `/home/user/french_cards/components/settings/DataSection.tsx`, `/home/user/french_cards/components/context/ExampleSheet.tsx`, `/home/user/french_cards/components/exercises/ExercisesScreen.tsx`, `/home/user/french_cards/components/exercises/ExerciseDone.tsx`, `/home/user/french_cards/components/import/ImportScreen.tsx`

### Chips (review direction + theme chips, LibraryFilterSheet options, theme chip in forms)

**Today:** Chips are 30px, outlined, radius 4, with an optional icon, a label, a mono count, and a chevron (Chip.tsx:45-67). The count renders whenever it is != null, including 0 («Трудные 0»). The review direction chip is mono uppercase «FR → RU» with an extra swap glyph, the widest chip in the row. On phones, chips live mainly in ReviewTopBar (direction + theme) and LibraryFilterSheet (status radio, slang multi, theme radio).

#### A · Без нулей, движение вместо значка (S) — **рекомендуется**

Chip stops printing a count of 0. Callers hide an option entirely when its filter would show nothing («Трудные» with no difficult words). The direction chip drops its swap glyph: tapping it makes «FR» and «RU» physically trade places (translateX over 200ms --ease-standard, plain swap under reduced motion). The motion is the affordance.

```
+--------------------------------+
| Карточки для Лизи       ↶   ⚙  |
| [FR → RU]  [Все темы ▾]        |
|    │                           |
|    ▼ тап: коды меняются местами|
| [RU → FR]  (200мс, translateX) |
|                                |
| Фильтр и порядок            ✕  |
| ────────────────────────────── |
| Статус                         |
| [Все 158] [К повторению 23]    |
| [Новые 12] [На паузе]          |
|   ▲ «Трудные 0» скрыт целиком; |
|     ноль не печатается         |
+--------------------------------+
 без значка ⇆ у направления
```

Removed / hidden: zero counts on every chip; filter options that would match nothing; the swap glyph on the direction chip

New visual / motion: FR/RU codes trade places on tap (translateX, --dur-move)

#### B · Одна строка-подпись (M)

Fold the review's two boxed chips into one borderless mono caption button «FR → RU · ВСЕ ТЕМЫ ⌄». Tapping it opens the existing set sheet (direction + theme in one medium sheet). Chip gains a variant="caption": no border, mono 11, chevron, 44px hit area. This is a shared-UI enabler; the decision belongs to the Review group.

```
+--------------------------------+
| FR → RU · ВСЕ ТЕМЫ ⌄    ↶   ⋯  |
| ━━━━━━━━━━━━━──────────────    |
| ┌────────────────────────────┐ |
| │━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ |
| │                            │ |
| │         se casser          │ |
| │          v. pron.          │ |
| │                            │ |
| └────────────────────────────┘ |
|                                |
| [       Показать ответ       ] |
+--------------------------------+
 две рамки → одна строка-
 подпись (mono), тап = лист
 «Что повторяем» (направление +
 тема); Chip variant="caption"
```

Removed / hidden: two outlined chip boxes in the review header (the direction flip moves into the sheet: +1 tap, done rarely mid-session)

New visual / motion: the caption text cross-fades over --dur-quick when the selection changes

Brand conflicts: SPEC v3 Review top row lists a mono `FR → RU` toggle chip and a theme filter chip

#### C · Чернильная плашка (M)

Single-choice chip rows inside sheets (status, theme order) become plain text options with one ink slab that glides to the selected one. This reuses Segmented's slab mechanic (Segmented.tsx:123-138), the best motion primitive in the kit. Multi-select rows (slang: SlangKey[], level) stay as chips, because a single slab cannot show several selected options.

```
+--------------------------------+
| Фильтр и порядок            ✕  |
| ────────────────────────────── |
| Статус                         |
|  Все  ███████████  Новые  Пауза|
|       К повторению             |
| ────────────────────────────── |
| Сленг                          |
|  Все   fam.  ████  vulg.       |
|              arg.              |
| ────────────────────────────── |
| Порядок                        |
|  Сначала новые              ⌄  |
+--------------------------------+
 текст без рамок; одна чернильная
 плашка скользит к выбранному
 (механика Segmented, --dur-move)
```

Removed / hidden: the 1px borders of every unselected option in single-choice rows

New visual / motion: the ink slab glides between options over --dur-move --ease-standard

Brand conflicts: SPEC «Chips/filters: 30px tall, 1px rule border» changes inside sheets; Long Russian options («К повторению») wrap at 390px, so the slab row needs a 2-line or scrolling fallback

**Why A:** A is a few lines in Chip.tsx plus the callers. It removes dead numbers and an icon everywhere chips appear, and adds one small, meaningful motion (the codes swapping). B is right in spirit, but it is a Review-screen layout decision and should be made there. C's slab helps only single-choice rows and has a wrapping problem with long Russian labels.

Files: `/home/user/french_cards/components/ui/Chip.tsx`, `/home/user/french_cards/components/review/ReviewTopBar.tsx`, `/home/user/french_cards/components/review/ReviewScreen.tsx`, `/home/user/french_cards/components/library/LibraryFilterSheet.tsx`, `/home/user/french_cards/components/library/SlangFilter.tsx`, `/home/user/french_cards/app/globals.css`

### Slang meter (card back, word detail, list rows in Add / Search / Import / Session-Done)

**Today:** 4 segments plus an italic abbr. Neutral draws 1 filled segment plus «нейтр.» (SlangMeter.tsx:48). In list rows (SearchPanel.tsx:201/376, add/parts.tsx:567, SessionDone.tsx:237, ImportRowItem.tsx:176) every row carries meter + abbr, and in Add «Недавние» also a theme label: three metadata marks per row. Most words are neutral, so most meters say nothing. WordList already uses showLabel={false}.

#### A · Тише в списках (S)

In list rows: render nothing at level 0, use size sm, and set showLabel={false}. The abbr appears through AbbrHint on tap and on the card back. One prop on SlangMeter (variant="row") applies all three. The card back and word detail keep the full meter + abbr + hints; that is the feature's home.

```
+--------------------------------+
| Недавние                       |
| ────────────────────────────── |
| une blague                     |
| шутка                          |
| ────────────────────────────── |
| bouffer                   ▮▮▯▯ |
| жрать, есть                    |
| ────────────────────────────── |
| les keufs                 ▮▮▮▯ |
| менты                          |
| ────────────────────────────── |
| dépêche-toi                    |
| поторапливайся                 |
+--------------------------------+
 в строках: нейтр. = ничего;
 счётчик sm без «fam./arg.»;
 подпись — по тапу и на обороте
```

Removed / hidden: the meter on neutral words in lists; the italic abbr in list rows (on tap, and on the card back)

New visual / motion: the meter as a right-edge rhythm of short ink bars down a list

#### B · Шкала наливается (S) — **рекомендуется**

A for lists, plus one tactile moment where the meter matters. When the card back appears, the segments ink in left→right, 40ms apart (opacity + scaleX of each segment, --dur-quick). vulg. segments ink in red last. The total is about 160ms, inside the per-card budget. Reduced motion: shown filled.

```
оборот карточки, после «Показать»
+--------------------------------+
| ┌────────────────────────────┐ |
| │ RU      ▮▯▯▯ → ▮▮▯▯ → ▮▮▮▯ │ |
| │━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ |
| │ se casser                  │ |
| │                            │ |
| │ свалить, сбежать           │ |
| │ v. pron. · arg.            │ |
| └────────────────────────────┘ |
+--------------------------------+
 сегменты заливаются по одному,
 40мс шаг (vulg. — красным
 последним); reduce = сразу.
 + вариант A для строк списков
```

Removed / hidden: the same list-row trims as A

New visual / motion: segment fill-in on reveal: 40ms stagger, ink (red for vulg.)

Brand conflicts: MOTION-SPEC principle 2 (acknowledge, don't celebrate; per-card motion < 250ms): 160ms fits, but it adds a moving element to reveal §5.2

**Why B:** The meter is the user's favourite feature (SPEC). A makes lists quieter: on a typical list about two thirds of rows lose a mark. B adds the 'visual, dynamic' moment where the meter means most, the card back, at no density cost and within the per-card motion budget. Both are small, local changes in one component.

Files: `/home/user/french_cards/components/ui/SlangMeter.tsx`, `/home/user/french_cards/components/add/SearchPanel.tsx`, `/home/user/french_cards/components/add/parts.tsx`, `/home/user/french_cards/components/review/SessionDone.tsx`, `/home/user/french_cards/components/import/ImportRowItem.tsx`, `/home/user/french_cards/components/library/WordList.tsx`, `/home/user/french_cards/components/review/ReviewCard.tsx`, `/home/user/french_cards/app/globals.css`

### iOS install hint (floating, iOS Safari only, until dismissed)

**Today:** A white boxed card with a 1px rule, fixed above the tab bar on every tab screen (layout.tsx:26, InstallHint.tsx:136-146). It has a glyph, a title, a 2-line paragraph and a ✕, 3-4 lines in all. It covers the bottom of the review card or list until dismissed. The full explanation already exists inline in Settings (SettingsScreen.tsx:271).

#### A · Одна строка (S)

Same floating box, cut to one line: «На экран «Домой»: [share] → На экран «Домой»» + ✕. Hidden during a review session and on sheets. The long explanation stays only in Settings.

```
+--------------------------------+
| ...любая вкладка...            |
|                                |
| ┌────────────────────────────┐ |
| │ На экран «Домой»: ⍐ → На   │ |
| │ экран «Домой»           ✕  │ |
| └────────────────────────────┘ |
|▬▬▬▬▬▬▬▬────────────────────────|
|  ▢       ☑       +       ▤     |
+--------------------------------+
 одна строка вместо 4; полный
 текст — в Настройках (inline)
```

Removed / hidden: the title, the glyph and the paragraph (paragraph stays in Settings)

#### B · Бумажка под таб-баром (S) — **рекомендуется**

No box. The hint is a slip tucked under the tab bar's top edge: a 1px top rule only, the paper background, «⍐ Поделиться → На экран «Домой»» + ✕. It appears only on the idle Повторение screen (never in-session, never on other tabs) and slides up 8px with enter-rise once per launch. Rendered by the review screen instead of the app layout.

```
+--------------------------------+
|                                |
|              23                |
|        к повторению            |
|                                |
| [          Начать           ]  |
|                                |
|                                |
|────────────────────────────────|
| ⍐ Поделиться → На экран        |
|   «Домой»                   ✕  |
|▬▬▬▬▬▬▬▬────────────────────────|
|  ▢       ☑       +       ▤     |
+--------------------------------+
 «бумажка» под таб-баром: только
 верхняя линия, без рамки; только
 на Повторении вне сессии;
 выезжает 8px один раз
```

Removed / hidden: the boxed card; the hint on Упражнения, Библиотека, sub-screens, and during a session

New visual / motion: enter-rise 8px once per launch (--dur-enter)

**Why B:** It is the same one line as A, but without a box floating over content, and it is confined to the one calm screen where there is empty space below «Начать». A full-width hairline slip reads as part of the paper, not as a pop-up. Settings keeps the full explanation.

Files: `/home/user/french_cards/components/pwa/InstallHint.tsx`, `/home/user/french_cards/app/(app)/layout.tsx`, `/home/user/french_cards/components/review/ReviewScreen.tsx`, `/home/user/french_cards/components/review/EmptyStates.tsx`, `/home/user/french_cards/components/settings/SettingsScreen.tsx`

### Review card motion kit (stack, grade exits, reveal glide, undo return)

**Today:** The current card settles from the stack (.96/8px → 1/0 on --spring-settle, card-motion.ts:103-121). CardDeck draws min(2, remaining) outlines behind it (ReviewCard.tsx:137-140). Grades exit ±56px with ±3°, or sink 24px. Undo returns the card from the side it left. Meanwhile the header repeats progress three times as text: «4 К ПОВТОРЕНИЮ · 7 НОВЫХ», «04 / 11», and the progress line.

#### A · Стопка = остаток (S) — **рекомендуется**

Let paper show what's left. Phone CardDeck draws min(3, remaining) hairline card edges 3-4px apart, with no shadow and no rotation at rest. While 3 or more cards remain they stay put; below 3, each grade fades the deepest edge out over --dur-quick. Only the 1px progress line stays as text-free progress. «04 / 11» and the counts move behind a tap on the line (Review group). The motion kit gains removeEdge().

```
+--------------------------------+
| ✕  ━━━━━━━━━━━──────────────   |
|                                |
| ┌────────────────────────────┐ |
| │━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ |
| │                            │ |
| │         la galère          │ |
| │           n. f.            │ |
| │                            │ |
| └────────────────────────────┘ |
|  └──────────────────────────┘  |
|   └────────────────────────┘   |
|    └──────────────────────┘    |
|                                |
| [       Показать ответ       ] |
+--------------------------------+
 до 3 кромок = остаток; при ≤3
 картах кромка тает с каждой
 оценкой; «04 / 11» — по тапу
 на линии
```

Removed / hidden: the «04 / 11» counter and «4 к повторению · 7 новых» at first paint (behind a tap on the progress line; Review group)

New visual / motion: a 3rd stack edge on phones; the deepest edge fades over --dur-quick when fewer than 3 cards remain

Brand conflicts: SPEC v3 Review: «Progress = mono text 07 / 30 plus a 1px ink progress line»; MOTION-SPEC D1 (desktop) uses min(2); the phone would use min(3), so a note is needed

#### B · Журнал на линии (M)

The progress line becomes a ledger. Each grade leaves a 1px tick at that card's position: ink for good, again-red for Не знаю, muted for Сложно. Unanswered positions stay dotted hairline. The session is read at a glance, and the same strip reappears on the «Готово на сегодня» receipt. No numbers on screen.

```
+--------------------------------+
| ✕  ▮▮▮▯▮▮▮▮··············      |
|    ↑ красный = «Не знаю»       |
|                                |
| ┌────────────────────────────┐ |
| │━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ |
| │                            │ |
| │          kiffer            │ |
| │            v.              │ |
| │                            │ |
| └────────────────────────────┘ |
|                                |
| [       Показать ответ       ] |
+--------------------------------+
 линия = «журнал» сессии: каждая
 оценка ставит 1px засечку
 (чернила / красная / зелёная);
 тот же ряд — в чеке «Готово»
```

Removed / hidden: the «04 / 11» counter; the continuous progress fill

New visual / motion: one tick inks in per grade (--dur-quick, opacity only)

Brand conflicts: SPEC: one red accent used sparingly; again-red ticks could multiply on a bad day; MOTION-SPEC §5.5 defines the progress line as a scaleX fill

#### C · Стол без шума (L)

A full focus treatment. Tapping the card reveals it, so «Показать ответ» shrinks to a text link for a11y. During the reveal glide everything except the card fades to 30% and comes back once the answer settles (iA Writer focus). The swipe stamps stay the primary grade verb. After a grade, undo is a message-less «Отменить» because the card's return motion tells the story.

```
+--------------------------------+
| ✕  ━━━━━━━━━━━──────────────   |
|  (шапка тускнеет до 30%)       |
| ┌────────────────────────────┐ |
| │ RU                    ▮▮▯▯ │ |
| │━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ |
| │ bouffer   ← слово уехало   │ |
| │                            │ |
| │ жрать, есть                │ |
| │ v. · fam.                  │ |
| └────────────────────────────┘ |
|  ┌─────┐                       |
|  │ЗНАЮ │ ← штамп при свайпе    |
|  └─────┘                       |
| [ Не знаю ]         [ Знаю ]   |
+--------------------------------+
 тап по карте = ответ; всё,
 кроме карты, гаснет на время
 скольжения; «Отменить» — без
 текста
```

Removed / hidden: the full-width «Показать ответ» button (becomes tap-on-card plus a slim text link); the snackbar message on review undo

New visual / motion: focus fade of the chrome to 30% during the reveal glide (opacity, --dur-turn); stamps as the primary grading affordance

Brand conflicts: SPEC v3: «Показать ответ» is a full-width primary black button; three outlined grade buttons with intervals; MOTION-SPEC R-series and §5.2 would need the focus fade added

**Why A:** A is pure paper geometry. It costs one constant, one fade, and a SPEC note. It is the shared-kit prerequisite that lets the Review group delete one or two counters from the busiest screen. B and C are bigger product decisions (colour ledger, two-button / tap-to-reveal) that belong to the Review group and can sit on top of A's stack.

Files: `/home/user/french_cards/components/review/ReviewCard.tsx`, `/home/user/french_cards/components/review/card-motion.ts`, `/home/user/french_cards/components/review/swipe.ts`, `/home/user/french_cards/components/review/ReviewTopBar.tsx`, `/home/user/french_cards/mockups/MOTION-SPEC.md`, `/home/user/french_cards/mockups/SPEC.md`

### Tokens & type system (app/globals.css) as it shapes density on every phone screen

**Today:** Paper #f1f1ee, white surfaces, 1px #d6d6d1 rules, one red. `.meta` (mono 11px uppercase, tracked, muted, globals.css:186) is the default for any number or label: stats lines, section heads, chip counts, status lines, «ТЕМА: …» in rows. With 3-5 meta lines per screen it is the main source of the 'too much information' feeling. The motion tokens rule-draw, stamp-land, settle-rise and spotlight exist, but the expressive ones are used only on Session-Done.

#### A · Одна mono-строка на регион (S) — **рекомендуется**

A density rule rather than a restyle: at most one `.meta` line per region at first paint. Secondary facts move to `.abbr` italic, which is quieter per character, or behind a tap. A tiny `.meta-num` utility (mono, tabular, no uppercase, no tracking) covers numbers that sit inside a sentence. The rule goes into SPEC Type and docs/ARCHITECTURE.md, and the other groups apply it.

```
+--------------------------------+
| Библиотека                ⌕  ⚙ |
|                                |
| Темы                    + тема |
| ┌────────────┐ ┌────────────┐  |
| │ Деньги     │ │ Еда        │  |
| │ 18 слов    │ │ 15 слов    │  |
| │ ━━━━━───── │ │ ━━──────── │  |
| └────────────┘ └────────────┘  |
|                                |
| было: ТЕМЫ · 8 / 42 · 6 К ПОВТ.|
|       (3 mono-строки)          |
| стало: 1 .meta на регион,      |
|       остальное — курсив .abbr |
+--------------------------------+
 правило плотности, не рестайл
```

Removed / hidden: second and third `.meta` lines per region (moved to `.abbr` italic or behind a tap)

Brand conflicts: SPEC Type: «Meta / counts / section labels: Plex Mono uppercase». This limits its use rather than changing it.

#### B · Подпись «чернила рисуются» (M)

A, plus a consistent brand signature at almost no density cost. Shared utilities: `.ink-rule-draw` (the rule-draw keyframe) for header hairlines and sheet tops, and `.card-blank` (a faint --card-lines background) for empty states and card-shaped skeletons, so blank screens look like blank index cards instead of empty grey.

```
+--------------------------------+
| ←          Деньги           ⋯  |
|━━━━━━━━━━━━━━━━━━━━━━━→        |
|  ▲ шапка: линия дорисовывается |
|                                |
| ┌────────────────────────────┐ |
| │━━━━━━━━━━━━━━━━━━━━━━━━━━━━│ |
| │ ────────────────────────── │ |
| │ ────────────────────────── │ |
| │ ────────────────────────── │ |
| │   Здесь пока пусто.        │ |
| │   Добавить слово           │ |
| └────────────────────────────┘ |
|  ▲ пустое = чистая карточка   |
|    (--card-lines), не серое   |
+--------------------------------+
 одна подпись бренда: «чернила
 рисуются» — шапки, верх листа,
 пустые состояния, скелетоны
```

Removed / hidden: the grey flat skeleton bars on card-shaped waits (replaced by ruled lines)

New visual / motion: `.ink-rule-draw` utility used by Header (B) and optionally Sheet tops; `.card-blank` ruled background for empty states and skeletons

Brand conflicts: SPEC Tokens: blue ruled lines are «optional, only on the review card»; MOTION-SPEC §3.3 skeleton visual is flat bars

**Why A:** The user's complaint is too much information, and the cause is too many loud mono lines, not the palette. A is a one-line rule plus a utility that every other group can apply when it trims its own screens. B adds marks, even nice ones. Its rule-draw part already arrives through Header direction B, so the rest can wait.

Files: `/home/user/french_cards/app/globals.css`, `/home/user/french_cards/mockups/SPEC.md`, `/home/user/french_cards/docs/ARCHITECTURE.md`, `/home/user/french_cards/components/ui/StatusLine.tsx`, `/home/user/french_cards/components/ui/Skeleton.tsx`
