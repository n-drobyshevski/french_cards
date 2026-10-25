# Mobile density audit (phone, 390×844)

Read-only audit of every mobile screen and state, made 2026-10-24 for the «меньше информации на экране» pass. Each section lists what is visible at first paint, the screen's one job, and what to do with each piece of noise. File:line references point at the tree as of commit 2f9e246.

Companion files: `proposals.md` (A/B/C directions with wireframes), `synthesis.md` (cross-screen principles and decisions), `web-minimal.md`, `web-dynamic.md`, `references.md`.

## Повторение (mobile, <768px): question / answer+grading / practice / plan sheet / theme picker / wait / done / empty stat

### Review: question side (cards view; also the loading placeholder)  ·  density 6/10, 21 elements

**Job:** Recall the word on the card, then turn it over (tap) or grade it straight away (swipe).

**Visible at first paint:**
- Direction chip «FR → RU» with swap icon (ReviewScreen.tsx:835-846)
- Theme chip «Все темы ▾» (ReviewScreen.tsx:847-854)
- Undo icon button 44px (ReviewTopBar.tsx:104-113)
- Settings gear 44px (ReviewTopBar.tsx:114-120)
- Summary button «23 К ПОВТОРЕНИЮ · 4 НОВЫХ · 6 ОБРАТНЫХ», underlined in --boundary, with a 14px chevron (ReviewTopBar.tsx:170-189; parts at ReviewScreen.tsx:761-771, format.ts:89-95)
- Counter «07 / 30» (ReviewTopBar.tsx:193-200)
- 1px progress hairline with ink fill and a 5px travelling tick (ReviewTopBar.tsx:202-231)
- 1×4 muted new-card ticks under the line (ReviewTopBar.tsx:233-239)
- Only on held days: reason subline «НОВЫХ 4 ИЗ 10 · ТОЧНОСТЬ ЗА НЕДЕЛЮ 74 %» (PlanParts.tsx:28-50; mounted at ReviewScreen.tsx:821)
- Card header label «FR» (ReviewCard.tsx:243-249; «№ 001» hidden on phones, :105)
- Outlined «НОВОЕ» tag on new cards (ReviewCard.tsx:250-264)
- 2px red index-card header rule (card-parts.tsx:12)
- Prompt «se casser», Newsreader 40 (ReviewCard.tsx:268-279)
- POS «v. pron.» italic (ReviewCard.tsx:280-284)
- Card footer hairline + flip glyph + «тапни, чтобы перевернуть» (ReviewCard.tsx:287-294)
- Swipe legend «← НЕ ЗНАЮ · ТАП — ОТВЕТ · ЗНАЮ →» (ReviewScreen.tsx:931-940)
- 56px blank band: the invisible, reserved grade-bar slot (ReviewScreen.tsx:942-952)
- Tab bar: Повторение (active, red top bar) · Упражнения · Добавить · Библиотека (TabBar.tsx:120-146)

| Element | Action | Why | Where to |
|---|---|---|---|
| Settings gear (ReviewTopBar.tsx:114-120) | на другой экран | Settings is not a review action and is already reachable from the Library header (LibraryScreen.tsx:298). It takes a 44px target in the busiest row. | Library header gear only (already exists) |
| Two chips: direction «FR → RU ⇄» + theme «Все темы ▾» (ReviewScreen.tsx:835-854) | объединить | Two controls for one question («what am I reviewing»). Both are set rarely, yet they take the top row on every card. | One quiet chip «FR→RU · Все темы ▾» that opens «Что повторять». Put the direction segmented control (FR→RU / RU→FR / ↔) at the top of that sheet. |
| Summary text «23 К ПОВТОРЕНИЮ · 4 НОВЫХ · 6 ОБРАТНЫХ» (ReviewTopBar.tsx:170-189) | за тап | It repeats the plan sheet's receipt rows exactly (PlanParts.tsx:100-113), and it competes with «07 / 30», which already says how far along the session is. Three numbers to parse before the first card. | Keep only «07 / 30». Make the whole progress row (line + counter) the button that opens «План на сегодня», which already lists К повторению / Новых / Обратных. |
| Held-day reason subline (PlanParts.tsx:28-50) | за тап | It adds a third text row above the card and repeats the sheet's reason line (PlanParts.tsx:115-122). It is diagnostic, not needed to answer a card. | The plan sheet. On the review screen, signal 'held' with a 2px red underline under the counter (red = count that needs attention, per SPEC tokens). |
| Card footer «тапни, чтобы перевернуть» (ReviewCard.tsx:287-294) | убрать | Duplicates «ТАП — ОТВЕТ» in the swipe legend 16px below it. A single user learns the tap after the first session. | Keep only the 14px flip glyph in the footer, or drop the footer and give the card the 48px back. |
| Swipe legend «← НЕ ЗНАЮ · ТАП — ОТВЕТ · ЗНАЮ →» (ReviewScreen.tsx:931-940) | за тап | It is permanent tutorial text. The ЗНАЮ / НЕ ЗНАЮ stamps already teach the gesture during the drag (ReviewCard.tsx:464-492). | Show it only for the first 2–3 sessions (a per-device flag), then drop it. Or replace it with the edge marks described in visual_opportunities. |
| «FR» header label (ReviewCard.tsx:243-249) | оставить | Minor: the prompt's language is obvious, but the label is the index-card signature and very small. |  |
| «НОВОЕ» tag (ReviewCard.tsx:250-264) | оставить | Not noise: it changes how the user should treat the card. |  |
| Undo icon (ReviewTopBar.tsx:104-113) | оставить | Needed after a mistaken swipe; it is the only immediate correction. |  |
| Reserved blank grade-bar slot (ReviewScreen.tsx:942-952) | оставить | It is empty space, but it keeps the card from resizing on flip (MOTION-SPEC principle 4). |  |
| New-card ticks (ReviewTopBar.tsx:233-239) | оставить | Already visual and quiet; it can carry the information the summary text carries now. |  |

**Visual opportunities:**
- Show the queue as paper depth instead of text: at rest the phone StackCard is fully hidden (stackPose(0) = scale .96 / y 8, swipe.ts:163-166, so the bottom edge lands about 3px inside the card). Offset 1–3 hairline card edges under the bottom of the card (like the desktop CardStack, ReviewCard.tsx:121-130, which is max-md:hidden). Draw 3 edges for 10+ cards left, 2 for 2–9, 1 for the last. The deck then reads 'how much is left' at a glance, and the summary text can go.
- Progress row as the only metric: a 1px hairline with ink fill, muted ticks where new cards sit, and the counter. Tap anywhere on it to open the plan. A red 2px under-stroke on the counter on held days replaces the subline.
- Edge marks instead of the swipe legend: a 2px × 24px good-green vertical rule inside the right card edge and an again-red one at the left, at 30% opacity. They darken with drag progress (same curve as the stamp opacity, swipeVisual). This keeps the direction cue without any words.
- Empty card body: the prompt sits centred in about 548px of white. Optionally restore the faint blue ruled lines (SPEC token #dfe6f3, every 32px; CardRules is max-md:hidden at ReviewCard.tsx:785-792) so the card reads as a real index card rather than an empty panel.
- The merged chip could show the direction as a tiny two-letter ligature «FR→» in mono. The theme name truncates first.

### Review: answer side and grading (including the swipe drag)  ·  density 8/10, 24 elements

**Job:** Check the answer against what was recalled and grade it (button or swipe).

**Visible at first paint:**
- Same top rows as the question side: direction chip, theme chip, undo, gear, summary, counter, line, new ticks, held subline (ReviewTopBar.tsx:101-136)
- Card header «FR» (ReviewCard.tsx:358)
- Slang meter ▮▮▮▯ + «arg.» (ReviewCard.tsx:360)
- «·» + level mark «≈B1» (ReviewCard.tsx:361-368)
- 1×20 hairline divider (ReviewCard.tsx:369)
- Icon button «На паузу», struck bell (ReviewCard.tsx:370)
- Icon button «Удалить слово», trash (ReviewCard.tsx:371)
- Icon button «Изменить карточку», pencil (ReviewCard.tsx:372-377)
- Red header rule (card-parts.tsx:12)
- Headword «se casser» 40px (ReviewCard.tsx:391-400)
- POS «v. pron.» as AbbrHint (ReviewCard.tsx:401-405)
- Translation «свалить, сбежать» 22px 500 (ReviewCard.tsx:408)
- Note, 14 muted, up to about 32ch (ReviewCard.tsx:409-413)
- «ОТКУДА» + origin line (ReviewCard.tsx:414-419)
- Example rule + example_fr italic 17 + example_ru 13 muted (ReviewCard.tsx:420-427)
- Second example pair (ReviewCard.tsx:429-436)
- «Свои поля»: up to 3 label/value pairs + «+N поля» (ReviewCard.tsx:192-212, 439)
- Card footer «ТЕМА: ПОВСЕДНЕВНОЕ» (ReviewCard.tsx:443-446)
- Swipe legend «← НЕ ЗНАЮ · ТАП — ВОПРОС · ЗНАЮ →» (ReviewScreen.tsx:931-940)
- Grade bar: «Не знаю <1 мин» · «Сложно 6 мин» · «Знаю 1 д», 56px outlined (GradeBar.tsx:66-129)
- Tab bar (TabBar.tsx:120-146)
- During a drag: «ЗНАЮ» / «НЕ ЗНАЮ» rubber stamp (ReviewCard.tsx:464-492) + the next card peeking (ReviewCard.tsx:500-511)

| Element | Action | Why | Where to |
|---|---|---|---|
| Three header icon buttons: На паузу / Удалить / Изменить (ReviewCard.tsx:369-377) | объединить | Three 44px icons plus a divider on every answer, for actions used rarely. They crowd the slang meter, put a destructive trash one tap away from the reading area, and sit right where a swipe starts. | Keep the pencil only. Put «На паузу» and «Удалить» in the word sheet the pencil opens (SPEC:145 already gives the word card «На паузу»), or behind a single «⋯» that opens a 2-row action sheet. |
| Level mark «· ≈B1» (ReviewCard.tsx:361-368) | на другой экран | An estimate («точна примерно в половине случаев», SPEC:202) that does not help to grade. It adds a third metadata token to the header. | Word sheet (grammar line «n. f. · нейтр. · ≈B1») and library rows, where it already shows. |
| Origin «ОТКУДА …» (ReviewCard.tsx:414-419) | за тап | Etymology is enrichment, not answer checking. It pushes the example down. | Word sheet (pencil), or an «ещё» fold at the end of the card body |
| Second example pair (ReviewCard.tsx:429-436) | убрать | One example is enough for checking. The second doubles the italic block and often forces the body to scroll. | Word sheet already lists all examples |
| «Свои поля» block (ReviewCard.tsx:192-212, 439) | за тап | Up to 3 labelled fields + «+N поля» under the examples turns the card into a record view. | A single muted «+3 поля ↓» line that expands in place, or the word sheet |
| Note (ReviewCard.tsx:409-413) | уменьшить | Useful nuance, but it can run long (whitespace-pre-line, unclamped on phones; only md has line-clamp-3). | Clamp to 2 lines on phones; full text in the word sheet |
| Footer «ТЕМА: ПОВСЕДНЕВНОЕ» (ReviewCard.tsx:443-446) | уменьшить | It duplicates the theme chip whenever a theme or set is selected. In «Все темы» it is mildly useful context. | Show it only when the filter is «Все темы» or a multi-theme set; otherwise drop the 48px footer |
| Swipe legend (ReviewScreen.tsx:931-940) | убрать | It repeats the grade-bar labels 16px above the buttons that say the same words. «ТАП — ВОПРОС» is a rarely needed instruction. | Onboarding only (first sessions) |
| Grade intervals «<1 мин / 6 мин / 1 д» (GradeBar.tsx:107-116) | оставить | Second line on each button. FSRS intervals do inform the choice, though, and they are mono 11. |  |
| Сложно button (GradeBar.tsx:67) | оставить | Already optional through settings.grade_buttons = 2. |  |
| Top bar rows (same as question side) | объединить | Same verdicts as on the question side: drop the gear, merge the chips, move the summary and subline into the plan sheet. | See the question-side items |

**Visual opportunities:**
- Answer hierarchy as ink weight only: headword 40 → translation 22/500 → one example in italic → everything else behind a single hairline «ещё ↓» (the desktop already has an «ещё ↓» marker, ReviewCard.tsx:448-451, max-md:hidden; reuse it on phones as a tappable fold).
- Grade buttons as stamps: on press, the flash (data-flash) could leave a brief outlined stamp-shaped impression in the button's tone instead of a solid fill. This stays within the rubber-stamp vocabulary (MOTION-SPEC §5.3) and makes grading feel physical without adding text.
- Interval as a scale, not a string: under each grade a tiny hairline ruler with a tick at log(interval), so <1 мин / 6 мин / 1 д read as near / mid / far at a glance. Keep the mono text in aria-label only.
- Slang meter is already the right visual and is the user's favourite. With the level and the 3 icons gone, it can sit alone on the right of the header as the card's only metadata.

### Practice round («Ещё практика» / «Повторить ошибки» / theme or set training)  ·  density 6/10, 9 elements

**Job:** Run through a no-stakes round of cards and get back to the normal queue.

**Visible at first paint:**
- Chip «× Закончить практику» (ReviewScreen.tsx:823-832)
- Undo icon (ReviewTopBar.tsx:104-113)
- Settings gear (ReviewTopBar.tsx:114-120)
- Left label «ПРАКТИКА · НЕ ВЛИЯЕТ НА РАСПИСАНИЕ» / «ТРЕНИРОВКА ТЕМЫ · НЕ ВЛИЯЕТ НА РАСПИСАНИЕ» (ReviewScreen.tsx:741-747)
- Counter «03 / 12» + progress line (ReviewTopBar.tsx:193-231)
- Card (same as question / answer sides)
- Swipe legend (ReviewScreen.tsx:931-940)
- Grade bar without intervals (GradeBar.tsx:107; intervals undefined in practice, ReviewScreen.tsx:350-353)
- Tab bar

| Element | Action | Why | Where to |
|---|---|---|---|
| «· НЕ ВЛИЯЕТ НА РАСПИСАНИЕ» suffix (ReviewScreen.tsx:744-747) | уменьшить | About 40 mono capitals that nearly fill the 358px row. The user already read it on the button that started the round (SessionDone.tsx:315). | Just «ПРАКТИКА» / «ТЕМА: Эмоции». The full sentence goes in the chip's aria-label. |
| Settings gear | убрать | Same as the cards view. |  |
| «× Закончить практику» chip | оставить | The only way out; it is clear. |  |

**Visual opportunities:**
- Practice mode as a different paper: draw the card's header rule as a dashed 2px ink line instead of the solid red one. 'Practice = not on the record', said with one mark and no sentence. Dashed already means 'unsorted / tentative' in the brand (Входящие, «verl.» chips).

### «План на сегодня» bottom sheet (phones)  ·  density 6/10, 11 elements

**Job:** See why today has this many new words and, optionally, override or change the plan.

**Visible at first paint:**
- Sheet title «План на сегодня» Newsreader 22 + × close (PlanParts.tsx:160-163)
- Ink top rule (PlanParts.tsx:99)
- Row «К повторению 27» (PlanParts.tsx:100-102)
- Row «Новых слов 4 из 10» (PlanParts.tsx:103-105)
- Row «Обратных сторон 6», only with «после 3 дней» (PlanParts.tsx:106-110)
- Row «Отложено 0» (PlanParts.tsx:111-113)
- Reason line «Точность за неделю 74 % — новых сегодня меньше.» (PlanParts.tsx:115-122)
- Secondary button «Всё равно добавить новые» (PlanParts.tsx:126-135)
- Caption «Только на сегодня. Завтра план снова подстроится.» (PlanParts.tsx:136)
- Row «Изменить план ›» + mono «10 СЛОВ · ДО 200» (PlanParts.tsx:140-151)
- Scrim over the review screen

| Element | Action | Why | Where to |
|---|---|---|---|
| «Отложено 0» row (PlanParts.tsx:111-113) | убрать | It shows on every normal day with 0. A zero row is pure filler. | Render it only when day.deferred > 0 |
| Mono «10 СЛОВ · ДО 200» beside «Изменить план» (PlanParts.tsx:149) | убрать | Repeats the settings value, and «из 10» is already in the Новых row. |  |
| Override caption (PlanParts.tsx:136) | уменьшить | Useful once. SPEC requires it, though. | Fold it into the button's sublabel line («только на сегодня») |
| Receipt rows К повторению / Новых / Обратных | оставить | This is the right home for the numbers that the review header duplicates now. |  |

**Visual opportunities:**
- Turn the receipt into one 'day bar': a single 8px ruled strip across the sheet. Reviews are solid ink cells, new words hatched ink (4 of a 10-slot ceiling, with the 6 unused slots drawn as empty hairline boxes), reverse sides outlined, deferred cards dashed beyond a vertical cap rule. Mono labels under each segment. A held day becomes visible as empty slots rather than a sentence.
- «Всё равно добавить новые» could animate the 6 empty slots filling (cells written in left to right, 40ms apart, the same as the done receipt's rule-in) instead of the row simply collapsing.

### «Что повторять» theme picker sheet (theme chip)  ·  density 6/10, 8 elements

**Job:** Pick what to review (a theme or a saved set).

**Visible at first paint:**
- Title «Что повторять» + × (FolderPickerSheet.tsx:109-112)
- Section label «МОИ НАБОРЫ» with ink rule (FolderPickerSheet.tsx:114)
- Set rows: name 19 serif, «3 К ПОВТ.» red / «31 · ТРЕНИРОВКА», summary line, check, pencil (FolderPickerSheet.tsx:116-144)
- «+ Новый набор» (FolderPickerSheet.tsx:145-152)
- Section label «ТЕМЫ» (FolderPickerSheet.tsx:155)
- «Все темы 158 · 23 К ПОВТ.» ✓ (FolderPickerSheet.tsx:84, 157-165)
- «Входящие 7» (FolderPickerSheet.tsx:85)
- Theme rows: name + «42 · 6 К ПОВТ.» (FolderPickerSheet.tsx:86, 157-165)

| Element | Action | Why | Where to |
|---|---|---|---|
| «МОИ НАБОРЫ» section shown first even with zero sets (FolderPickerSheet.tsx:114-153) | на другой экран | With no sets the user sees a section header and «+ Новый набор» before the themes they came for. | Themes first. Sets after them, and only when sets exist; otherwise one «+ Новый набор» row at the bottom. |
| Pencil per set row (FolderPickerSheet.tsx:135-141) | за тап | An editing affordance on every row of a picker. | Long-press on the set row, or an «Изменить» entry inside the set sheet |
| Total word count per theme «42 ·» (FolderPickerSheet.tsx:44-48) | уменьшить | For choosing what to review, only the due count matters. | Show «6 К ПОВТ.» (ink) or nothing; the total stays in the Library |

**Visual opportunities:**
- Reuse the catalog-drawer language: a 3px theme-colour band at the left of each row (theme colours from SPEC:56) plus a 2px due-progress hairline under the name, instead of the mono «42 · 6 К ПОВТ.» text.
- Host the direction control here (Segmented FR→RU / RU→FR / ↔) so the review header needs one chip only.

### Wait screen «На сейчас всё» (learning cards return later today)  ·  density 7/10, 12 elements

**Job:** Know when to come back (or end the day now).

**Visible at first paint:**
- Direction chip, theme chip, undo, gear (ReviewScreen.tsx:812-857)
- Progress row «ЖДУТ 3 КАРТОЧКИ ……… 34 / 37» + line (ReviewScreen.tsx:752-759; plan-format.ts:119-122)
- Meta «НА СЕЙЧАС ВСЁ» (WaitScreen.tsx:311)
- h1 «Ещё 3 карточки — через 12 мин» Newsreader 32 (WaitScreen.tsx:312-319)
- Paragraph «Эти слова вы только что учили. Их нужно увидеть ещё раз чуть позже — так они лучше запоминаются.» 15 muted, 3 lines (WaitScreen.tsx:320-322)
- Up to 5 ruled rows: FR serif 19 · RU muted · «ЧЕРЕЗ 12 МИН» (WaitScreen.tsx:323-335)
- «И ЕЩЁ N» (WaitScreen.tsx:336)
- Link row «Пока можно: Упражнения ›» (WaitScreen.tsx:341-349)
- Outlined 52px «Готово на сегодня» (WaitScreen.tsx:350-357)
- Tab bar

| Element | Action | Why | Where to |
|---|---|---|---|
| RU translations in the waiting rows (WaitScreen.tsx:329) | убрать | It works against learning: it shows the answers to the very cards to be recalled in 12 minutes, so the next retrieval becomes recognition. | Show FR only (or nothing; see the timeline visual) |
| Progress-row summary «ЖДУТ 3 КАРТОЧКИ» (ReviewScreen.tsx:755) | убрать | Says the same as the h1 «Ещё 3 карточки» 40px below. | Keep only «34 / 37» + line |
| Meta «НА СЕЙЧАС ВСЁ» + h1 (WaitScreen.tsx:311-319) | объединить | Two headlines for one message. | One h1 «Через 12 мин — ещё 3» |
| Explanatory paragraph (WaitScreen.tsx:320-322) | за тап | Three lines of pedagogy on a screen that appears daily; the user needs it once. | An «i» / «почему?» text link, or show it only the first time |
| Per-row «ЧЕРЕЗ N МИН» (WaitScreen.tsx:330-332) | объединить | Five mono time strings: tabular text where a picture would do. | Into the timeline visual below |
| «Пока можно: Упражнения ›» (WaitScreen.tsx:341-349) | уменьшить | The Упражнения tab sits 60px below in the tab bar. | A plain text link, or remove |
| Direction and theme chips (ReviewScreen.tsx:835-854) | объединить | Changing the filter here is valid (other themes may have cards), so they stay, merged into one chip as elsewhere. |  |
| «Готово на сегодня» | оставить | The one real action. |  |

**Visual opportunities:**
- Replace the list with a 'return timeline': a horizontal hairline for the next hour, a red ink 'now' tick at the left that moves once a minute (useMinuteClock already exists, WaitScreen.tsx:268-282), and one small outlined index-card glyph (10×14, the app-mark glyph) per waiting card, placed at its due minute. The h1 gives the first time; the picture gives the rest. No list, no spoilers.
- When the first card comes due, the screen already returns by itself (ReviewScreen.tsx:244-251). The 'now' tick reaching the first card glyph is the visual promise of that, with no extra copy needed.

### «Готово на сегодня» (session done, phone)  ·  density 8/10, 19 elements

**Job:** Feel the day is finished, then optionally fix today's mistakes.

**Visible at first paint:**
- Direction chip, theme chip, undo, gear: the top bar stays, without progress (ReviewScreen.tsx:812-857, 819)
- Meta «СЕССИЯ · 24 ОКТЯБРЯ» (SessionDone.tsx:170)
- h1 «Готово на сегодня» Newsreader 34 (SessionDone.tsx:172-177)
- Date stamp «24.10», rotated −4° (SessionDone.tsx:179-186)
- 2px red rule drawn under the h1 (SessionDone.tsx:190-195)
- Receipt: Повторено 30 / Новых 4 / Верно 92 % with dotted leaders (SessionDone.tsx:197-202)
- Mono «СЛЕДУЮЩИЕ 18 СЛОВ — ЗАВТРА» (SessionDone.tsx:208-212)
- Plan row «План: 10 слов в день · до 200 повторений · Изменить ›», 44px ruled (SessionDone.tsx:216, 344-367)
- «ТРУДНЫЕ 3» heading with red count (SessionDone.tsx:218-225)
- Up to 5 hard rows: FR serif · RU muted · slang meter (SessionDone.tsx:226-240)
- «И ЕЩЁ N СЛОВ» (SessionDone.tsx:242-247)
- «Упражнение по трудным словам · 9 ›» (SessionDone.tsx:251, 375-397)
- Primary «Повторить ошибки (3)» (SessionDone.tsx:260-272), at about y=722 with 5 hard words
- Below the fold with 5 hard words: «Ещё практика» + «не влияет на расписание» 56px (SessionDone.tsx:274-316)
- Below the fold: tertiary «Добавить слова» (SessionDone.tsx:317-331)
- Tab bar (covers y≥783)

| Element | Action | Why | Where to |
|---|---|---|---|
| Meta «СЕССИЯ · 24 ОКТЯБРЯ» (SessionDone.tsx:170) | убрать | The date appears twice: here and on the «24.10» stamp, which is the designed moment. | The stamp carries the date |
| Top bar chips / undo / gear on the done view (ReviewScreen.tsx:812-857) | уменьшить | 60px of controls above a finished state. Undo is still useful (it reopens the last card). | Keep undo only (right-aligned). The theme chip can stay as one merged chip, because it is how you review another theme; drop the gear. |
| Plan row «План: 10 слов в день …» (SessionDone.tsx:344-367) | на другой экран | A settings summary on a celebration screen. It is already in Settings → «План повторения» and in the plan sheet's «Изменить план ›». | Plan sheet / Settings (both exist) |
| «Упражнение по трудным словам · 9 ›» (SessionDone.tsx:375-397) | на другой экран | A third call to action that copies a request for the chat. It competes with «Повторить ошибки» and pushes the actions below the fold. | «Упражнения» tab (Exercise-S-Entry-Library-Done already designs it there) |
| Hard-word rows with RU + slang meter (SessionDone.tsx:226-240) | уменьшить | Up to 5 × 44px rows (220px) of reference data. The meters add a third column of glyphs. | One serif line «chelou · la galère · se tirer +2» with an ink underline; a tap opens the list (or the library filtered to Трудные) |
| «не влияет на расписание» caption (SessionDone.tsx:315) | за тап | Turns the button into 2 lines (56px); the practice header says it again. | aria-label + the practice round's header |
| «Ещё практика» and «Добавить слова» as two stacked full-width buttons (SessionDone.tsx:273-332) | объединить | Three full-width stacked buttons for one finished state; with a long hard list they land below the fold. | One row of two text buttons «Ещё практика · Добавить слова» under the primary |
| Receipt (Повторено / Новых / Верно) | оставить | This is the summary itself, though it could be a visual. |  |
| «Следующие 18 слов — завтра» | оставить | Answers 'when do I come back', which is useful. |  |

**Visual opportunities:**
- Replace the 3-row receipt with a 'tally strip': one cell per card reviewed today (30 hairline 6×10 boxes in rows), each written in as the moment plays (40ms stagger, the existing rule-in beat). Correct cells get ink fill; again-graded ones a red outline; new words are marked with a small top notch. «30 · 92 %» in mono at the right end. It shows the whole session at once, with no count-up and nothing animated beyond the write-in.
- Keep the date stamp + red rule moment (§5.12). It is the brand's one 'delight' and needs no copy around it.
- «Следующие 18 слов — завтра» as a small stack of outlined card glyphs with «завтра» under it, the same glyph as the wait-screen timeline, for continuity.

### Empty library «Пока нет слов»  ·  density 5/10, 8 elements

**Job:** Add the first word.

**Visible at first paint:**
- Direction chip, theme chip «Все темы», undo (disabled), gear. hideOnDesktop only hides them from 768 up (ReviewTopBar.tsx:96-97; ReviewScreen.tsx:818)
- Meta «ПОВТОРЕНИЕ» (EmptyStates.tsx:15)
- h1 «Пока нет слов» Newsreader 34 (EmptyStates.tsx:16)
- Paragraph «Добавьте первое слово или выражение — оно появится здесь карточкой с переводом.» (EmptyStates.tsx:17-19)
- Primary «+ Добавить слово» (EmptyStates.tsx:22-24)
- Tertiary «Импорт со скриншота» (EmptyStates.tsx:25-27)
- Tab bar

| Element | Action | Why | Where to |
|---|---|---|---|
| Direction / theme chips, disabled undo, gear (ReviewTopBar.tsx:96-97) | убрать | Filters and undo over an empty library do nothing. | Hide the whole top bar on phones as well (drop the md: prefix from hideOnDesktop) |
| Meta «ПОВТОРЕНИЕ» (EmptyStates.tsx:15) | убрать | Repeats the active tab label right below. |  |
| Paragraph (EmptyStates.tsx:17-19) | уменьшить | It explains what the drawn card could show instead. | One line, or replace it with the empty-card visual |
| «Импорт со скриншота» | оставить | A real alternate path for first-run. |  |

**Visual opportunities:**
- Draw the empty state as the card itself: the review index card frame (white, red header rule, faint ruled lines) with a dashed 1px border and a centred «+ Добавить слово» written on it in Newsreader. Tapping the card opens the add sheet. The same frame later holds real words, so first-run teaches the object.

### Empty theme «В этой теме пока нет слов»  ·  density 4/10, 7 elements

**Job:** Switch to a theme that has words (or add words to this one).

**Visible at first paint:**
- Direction chip, theme chip «Эмоции ▾», undo, gear (ReviewScreen.tsx:812-857)
- Meta «ТЕМА: ЭМОЦИИ» (EmptyStates.tsx:37)
- h1 «В этой теме пока нет слов» (EmptyStates.tsx:38)
- Primary «Все темы» (EmptyStates.tsx:41-43)
- Tertiary «Добавить слова» (EmptyStates.tsx:44-46)
- Tab bar

| Element | Action | Why | Where to |
|---|---|---|---|
| Meta «ТЕМА: ЭМОЦИИ» (EmptyStates.tsx:37) | убрать | The theme chip directly above already says «Эмоции». |  |
| Gear / direction chip | убрать | Same as the cards view. |  |

**Visual opportunities:**
- The same dashed empty index card as the empty library, with the theme's 3px colour band on top (catalog-drawer language), so an empty theme reads as 'an empty drawer'.

## Упражнения (mobile <1024px): set list (+resume / waiting / offline), empty-state builder, request sheet, set menu, conne

### List: sets with an unfinished run (default state)  ·  density 8/10, 34 elements

**Job:** Pick a set and start (or continue) playing it with one tap.

**Visible at first paint:**
- h1 «Упражнения» (Newsreader 28) [ExercisesScreen.tsx:150]
- SyncMark «· Офлайн / · Не синхронизировано» (only on trouble) [:151]
- secondary button «Попросить набор» 36px [:153-157]
- mono subline «5 НАБОРОВ · СОСТАВЛЕНЫ В ЧАТЕ» [:161]
- section rule «НЕ ЗАКОНЧЕНО» + note «1» [:363]
- resume card title «Верлан: основы» [:365]
- resume meta «8 ВОПРОСОВ · ВЕРЛАН · ПРЕРВАНО 21.10» [:360,366]
- 2px red progress line on a hairline [:367-370]
- black button «Продолжить · 5 из 8 ›» [:371-392]
- section rule «НАБОРЫ» + note «2 НОВЫХ» [:250]
- tile 1: 3px red top band [SetTile.tsx:62]
- tile 1: title (2 lines max) [:63]
- tile 1: «12 ВОПРОСОВ» [:64]
- tile 1: themes «ЛЮДИ, ЭМОЦИИ» [:65]
- tile 1: state «НОВЫЙ» in red [:67]
- tile 1: date «22.10» [:68]
- tile 1: 2px progress track [:77]
- tile 2: same 6–7 pieces
- tile 3: same, with «7/10» in ink
- tile 4: same (row 2 ends at about y=662)
- top edge of row 3: dashed «Трудные слова / 9 слов / из всех тем / ⧉ Запрос для Claude» and «К повторению» scope tiles [:103-123]
- (below the fold) dashed «+ Попросить набор · в чате Claude» tile [:83-95]
- tab bar: Повторение · Упражнения · Добавить · Библиотека

| Element | Action | Why | Where to |
|---|---|---|---|
| Mono subline «5 НАБОРОВ · СОСТАВЛЕНЫ В ЧАТЕ» (ExercisesScreen.tsx:161) | убрать | You can count the sets by looking at the grid. Provenance (made in the chat) matters once, not on every visit. It costs a full line above the fold. | Explain provenance only in the empty state (it already does, :238-240). This needs a SPEC.md:345 edit. |
| Three or four ways to ask for a set: header «Попросить набор» (:153-157), dashed RequestTile (:271, SetTile.tsx:83-95), ScopeTiles «Трудные слова» / «К повторению» (:269-270, SetTile.tsx:103-123) | объединить | One intent gets three controls. The scope tiles repeat the builder's «Откуда слова» chips (RequestBuilder.tsx:166-169, 413-475). They also look like set tiles but behave differently: a tap copies text instead of playing. | Keep the header button only (always above the fold). Drop RequestTile. Move the scope choices into the sheet, where they already exist as chips. |
| Section rule «НЕ ЗАКОНЧЕНО» with note «1» (:363) | убрать | There is only ever one resume card, so «1» says nothing. A big black «Продолжить» already says the run is unfinished. |  |
| Resume meta «8 ВОПРОСОВ · ВЕРЛАН · ПРЕРВАНО 21.10» (:360,366) | убрать | The question count is already in «5 из 8». The themes and the interruption date don't help her decide to resume. |  |
| Resume progress shown twice: red line (:367-370) + «5 из 8» in the button (:387-389) | объединить | The same number in two encodings, 20px apart. | One visual: a tick row of 8 segments (5 inked) above a plain «Продолжить ›». |
| Note «2 НОВЫХ» on the «НАБОРЫ» rule (:250) | убрать | It repeats the red top bands and the red «НОВЫЙ» labels on the tiles (triple encoding). | Drop the rule too when there's no resume card above it. The grid needs no heading. |
| Tile «НОВЫЙ» red label (SetTile.tsx:67) | убрать | The 3px red band (:62) already marks a new set. | Keep the band. Leave the state slot empty for new sets. |
| Tile date «22.10» (SetTile.tsx:68) | за тап | Creation date doesn't help pick a set. It crowds a 170px-wide tile. | Title row of SetMenuSheet (long press). |
| Tile «12 ВОПРОСОВ» + themes line as two separate mono lines (SetTile.tsx:64-65) | объединить | Two caps lines per tile: across 4 tiles that's 8 lines of small caps above the fold. | One line «12 · Люди, Эмоции», or show the size visually (see opportunities). |
| Tile «Прервано 5/8» (list-format.ts:221) | уменьшить | The progress line and the resume card already say it. Only another device's run shows here without a card. | «5/8» only, with no word. |
| Tile 2px progress track on new sets (SetTile.tsx:77, progress 0) | убрать | An empty grey track on every new tile is visual noise. | Render the track only when progress > 0. |

**Visual opportunities:**
- Show set size as a stack, not text. 8/12/16 questions become 1/2/3 offset hairline edges peeking under the tile's bottom-right (drawn 1px rules, no shadow). That replaces «12 ВОПРОСОВ».
- A finished set gets a tiny rotated outlined stamp «7/10» (the player's Stamp.tsx motif at 11px mono, −4°) instead of an ink label + full progress line. This ties the list to the player's feedback language.
- Progress as N hairline ticks along the tile's bottom (inked = answered) instead of a continuous 2px bar: you can read 5 of 8 at a glance.
- Resume card: the red tick row from the player header, same element, so the continuity is visible.
- Make the title row bigger (Newsreader 22, 3 lines) once the meta lines are gone. The tile becomes a typographic index card.

### List: waiting for a set after a copy (Exercise-S-Waiting) and offline (Exercise-S-Offline)  ·  density 9/10, 30 elements

**Job:** Same as the list: play a set. Status only has to say 'a set is on its way' or 'you're offline'.

**Visible at first paint:**
- h1 «Упражнения» + SyncMark «· Офлайн» (offline with outbox) [:150-151]
- «Попросить набор» [:154]
- subline «N НАБОРОВ · СОСТАВЛЕНЫ В ЧАТЕ» [:161]
- offline: dashed warning box with cloud-off glyph «Нет сети · наборы играются, новые придут позже» [:170-180]
- waiting: mono «ЖДЁМ НАБОР ИЗ ЧАТА · обновится, когда вернётесь» [:186-190]
- waiting: hairline with moving ink run [:191-193]
- waiting: «Запрос: «вечеринка», 12 вопросов» [:198]
- waiting: «⟳ Обновить» [:199-208]
- resume card / rules as in the default state
- first tile: skeleton with grey bars [:252]
- set tiles
- offline: sticky bottom bar «ПОСЛЕДНИЙ ЗАПРОС · …» [:406]
- offline: «⧉ Скопировать» secondary [:408-411]
- offline: disabled «Открыть Claude ↗ / НУЖНА СЕТЬ» [:412-424]
- tab bar

| Element | Action | Why | Where to |
|---|---|---|---|
| Waiting block: status line + ink-run hairline + «Запрос: …» row + «Обновить» + skeleton tile (:182-211, :252) | объединить | Four signals for one fact, about 100px above the grid. The request summary is something she just wrote and copied herself. | Keep only the skeleton tile at the head of the grid with the ink run along its top rule and «Ждём из чата» inside. A tap on it refreshes, which replaces «Обновить». |
| Offline warning box (:170-180) | объединить | It duplicates SyncMark «· Офлайн» in the header (components/library/SyncMark.tsx:43-49). A 40px warning-coloured box adds alarm, but every set still plays. | Use the header SyncMark (show «· Офлайн» whenever offline on this screen). |
| Offline sticky bottom bar with «Скопировать» + disabled «Открыть Claude · нужна сеть» (:398-428) | убрать | It takes about 90px of fixed space above the tab bar to offer one disabled button and a copy of an old request. Asking for a set offline is an edge case. | The request sheet already shows «нужна сеть» on «Открыть Claude» (RequestBuilder.tsx:366-375). |
| «Запрос: «вечеринка», 12 вопросов» (:198) | убрать | It echoes her own action. |  |

**Visual opportunities:**
- The skeleton tile becomes a 'blank index card being written': the ink run moves along its top edge (the same animate-[ink-run] already in use). When the set syncs, the bars cross-fade into the real title (MOTION-SPEC paper fade, no bounce).
- Offline: draw the header mark as a muted dashed underline under «Упражнения», with no box.

### List: empty state with the inline request builder (Exercise-Empty-A)  ·  density 9/10, 24 elements

**Job:** Get a request into Claude's chat (copy and open) with as few decisions as possible.

**Visible at first paint:**
- h1 «Упражнения» [ExercisesScreen.tsx:150]
- h2 «Упражнений пока нет» (Newsreader 22) [:237]
- paragraph «Их составляет Claude в чате через коннектор «Карточки». Выберите темы — мы подготовим запрос.» (2–3 lines) [:238-240]
- card: mono label «ОТКУДА СЛОВА» [RequestBuilder.tsx:166-168]
- scope chips «Темы» · «Трудные 9» · «К повторению 23» · «Оба 28» (wraps to 2 rows at 326px) [:169, 452-473]
- scope caption (when a scope is picked) [:170-174]
- mono label «ТЕМЫ» [:178-181]
- theme chips «Входящие», «Люди», «Эмоции», … (wrap) [:182-197]
- dashed chip «+ своя тема» [:198-209]
- «Вопросов» + segmented 8 / 12 / 16 [:247-258]
- «Можно новые слова» + caption «Claude поищет их в вебе» + toggle [:274-283]
- mono label «ЗАПРОС» [:287-289]
- mono request box, 3–4 lines [:290-298]
- focus line «Чаще трудные · половина набора · Настройки ›» (when set) [:299-310]
- (about y=690–740, at or below the fold) primary «⧉ Скопировать запрос» [:313-316]
- (below the fold) «Открыть Claude ↗» [:322]
- (below the fold) «Коннектор не подключён? ›» [ExercisesScreen.tsx:213-222]
- tab bar

| Element | Action | Why | Where to |
|---|---|---|---|
| «Скопировать запрос» lands at or below the fold (RequestBuilder.tsx:313) | оставить | The one action of the screen sits under about 14 rows of configuration. Two rows of scope chips, two of theme chips and a 4-line request box push it down. | Keep it, but make it sticky above the tab bar, or let the cuts below lift it above the fold. |
| Two separate pickers: «Откуда слова» radiogroup (:166-169) + «Темы» chips (:178-209) | объединить | Two stacked chip groups with their own labels. «Темы» in the first group only means 'use the chips below'. | One chip row: «Трудные 9» and «К повторению 23» as the first, mutually exclusive chips, then the themes. Drop «Оба» (rare; keep it in chat). |
| Mono request text box (:286-298) | за тап | She never needs to read the generated sentence to use it. It's the tallest block in the card (about 90px). | Fold it under «Текст запроса ›» and open it automatically only when copying fails (the snackbar already says 'выделите текст запроса', :156). |
| «Скопировать запрос» + «Открыть Claude ↗» as two actions (:313-337) | объединить | «Открыть Claude» already copies first (:153-158, 382). On a phone, the next step after copying is always opening Claude. | Primary «Скопировать и открыть Claude ↗». A quiet «только скопировать» link under it. |
| Caption «Claude поищет их в вебе» under «Можно новые слова» (:162, 280) | убрать | An explanatory second line on a binary switch. |  |
| «Можно новые слова» toggle row (:274-283) | за тап | An advanced choice with a sensible default (on). | An «Ещё ›» disclosure together with «+ своя тема». |
| Focus line «Чаще трудные · половина набора · Настройки ›» (:299-310) | убрать | It changes nothing in the request text (the comment at :145-146 says the connector reads it). It reminds her of a setting on a page about making a request. | Settings › Упражнения only. |
| Empty-state heading + 2–3 line paragraph (ExercisesScreen.tsx:237-240) | уменьшить | About 100px of explanation before the first control. | One line: «Наборы пишет Claude — выберите темы». |
| «Коннектор не подключён? ›» (ExercisesScreen.tsx:213-222) | оставить | Only needed once, but useful while she has no sets yet. |  |

**Visual opportunities:**
- «Вопросов 8/12/16» as three small paper stacks of increasing thickness (1/2/3 hairline edges), tappable, the chosen one inked. That replaces the mono segmented control.
- Picked theme chips 'file' into the card as small index tabs along its top edge (ink outline), so the card visibly fills as she chooses.
- On copy, the folded request slip lifts out of the card and fades (translateY −8px + fade 160ms, paper motion). The button turns into ✓ «Скопировано». That shows the copy happened without a text box.
- An empty-state glyph: an outlined blank index card with a dashed red header rule, drawn once (no illustration, no emoji).

### Request sheet «Попросить набор» (Exercise-S-Request-Sheet)  ·  density 8/10, 18 elements

**Job:** Choose a theme (or difficult words) and send the request to Claude.

**Visible at first paint:**
- sheet title «Попросить набор» + × [RequestSheet.tsx:34-37]
- «ОТКУДА СЛОВА» + 4 scope chips with counts [RequestBuilder.tsx:166-169]
- «ТЕМЫ» + aside «МОЖНО НЕСКОЛЬКО» [:178-181]
- theme chips with word counts («Люди 34») + «+ своя тема» [:182-209]
- «Вопросов» 8 / 12 / 16 [:247-258]
- «Можно новые слова» + caption «Claude поищет их в вебе, до 8 в наборе» + toggle [:162, 274-283]
- «ЗАПРОС» + mono box [:286-298]
- focus line «… · Настройки ›» [:299-310]
- «Скопировать запрос» (likely needs a scroll in the sheet) [:313]
- «Открыть Claude ↗» left + «Нет коннектора? ›» right [:324-336]

| Element | Action | Why | Where to |
|---|---|---|---|
| Word counts on every theme chip (RequestBuilder.tsx:190) | убрать | The count doesn't affect the request. It doubles the text in every chip and makes the rows wrap more. The page variant already hides them. |  |
| Aside «МОЖНО НЕСКОЛЬКО» (:180) | убрать | Checkmarks on the chips show multi-select once she taps one. |  |
| Scope radiogroup + theme chips + mono box + 2 CTAs | объединить | Same issues as the empty state (see that entry). On the sheet they push «Скопировать запрос» out of view. | Same single chip row, folded text, one merged CTA pinned at the sheet bottom. |
| Caption «до 8 в наборе» (:162) | убрать | An implementation limit, not a choice she makes. |  |
| «Нет коннектора? ›» (:326-335) | убрать | Once sets exist, the connector clearly works. | Show it only in the empty state (ExercisesScreen.tsx:242). |

**Visual opportunities:**
- Pin one black CTA to the sheet's bottom edge on a hairline, with the chosen size shown as a stack glyph in the button («Скопировать и открыть · ▤12»).
- A chosen scope chip («Трудные») tints the sheet's header rule red, a quiet visual mode switch instead of the caption paragraph (:170-174).

### Set menu sheet (long press on a tile) and Connector help sheet  ·  density 4/10, 14 elements

**Job:** SetMenu: act on one set. ConnectorHelp: one-time setup instructions.

**Visible at first paint:**
- SetMenu: title = set name + × [SetMenuSheet.tsx:28-31]
- rows «› Начать / Продолжить», «⧉ Скопировать запрос на похожий», «🗑 Удалить» (red) [:33-45]
- ConnectorHelp: title «Как подключить коннектор» + × [ConnectorHelpSheet.tsx:22-25]
- intro paragraph [:27-29]
- step 1 numbered circle + title + mono breadcrumb «claude.ai › Настройки › Коннекторы › Добавить свой» [:31-44]
- step 2 + dashed lock field «Адрес коннектора — у владельца» + caption [:45-51]
- step 3 + mock tool row «Инструменты · Карточки ✓» + caption [:52-59]
- note with refresh glyph «Набор приходит при следующей синхронизации…» [:61-64]
- primary «Понятно» [:65-67]

| Element | Action | Why | Where to |
|---|---|---|---|
| SetMenu: «Начать» row (SetMenuSheet.tsx:33-36) | оставить | A plain tap on the tile already does this. | Keep it: menus are expected to list it, and it costs one row. |
| SetMenu header has no metadata | оставить | This is the right home for the date, themes and question count taken off the tiles. | Add one mono line under the title: «12 вопросов · Люди, Эмоции · 22.10». |
| ConnectorHelp: captions under steps 2 and 3 (:50, :58) + the sync note (:61-64) | уменьшить | Three extra explanation lines on a sheet that already has a visual for each step. | Keep the step titles and visuals; cut the captions to one line or drop them. |

**Visual opportunities:**
- Connector steps as three small index cards with a red header rule each, swiped horizontally (one step per card) instead of a ruled list.

### Player: question (choice; same chrome for cloze / register)  ·  density 6/10, 16 elements

**Job:** Read one prompt and tap one of four answers.

**Visible at first paint:**
- × «Выйти» 44px [ExercisePlayer.tsx:591-598]
- progress hairline with red fill [:599-609]
- mono counter «07 / 12» (+ muted «+1» after a requeue) [:610-612, 560-570]
- mono line «УПРАЖНЕНИЕ · НЕ ВЛИЯЕТ НА РАСПИСАНИЕ» [:614]
- card header: «ЗНАЧЕНИЕ · FR → RU» (ПРОПУСК / РЕГИСТР / ВЕРЛАН / СИТУАЦИЯ …) [QuestionCard.tsx:192-204]
- card header: outlined «ПОВТОР» tag (repeats) [:198-202]
- card header: slang meter with «fam. · verl.» [:206]
- 2px red header rule [card-parts.tsx:12]
- prompt headword (Newsreader 40) or RU situation paragraph [QuestionCard.tsx:75-93]
- cloze: sentence with dashed gap + RU hint line [:147-151; ClozeLine.tsx:48-62]
- register: italic «adj. — надоедливый» [:160-164]
- question «Что это значит?» / «Какое слово пропущено?» / «Насколько это разговорно?» [:133-143, 152, 165]
- repeat: «↺ Ошиблись раньше — ещё раз» [:215-220]
- card footer «НАБОР: СЛЕНГ НА КАЖДЫЙ ДЕНЬ · ИЗ ЧАТА» [:223-229]
- 2×2 grid, 88px tiles, each with mono index 1–4 + option text [OptionGrid.tsx:288-343]
- register tiles: meter + «нейтр./fam./arg./vulg.» + full name [RegisterGrid.tsx:113-118]
- 200px action zone with «Не знаю» at its bottom [ExercisePlayer.tsx:526-552]

| Element | Action | Why | Where to |
|---|---|---|---|
| Mono line «УПРАЖНЕНИЕ · НЕ ВЛИЯЕТ НА РАСПИСАНИЕ» (ExercisePlayer.tsx:614) | на другой экран | It's on every card of every set, and says nothing about the current question. It's the first text she reads before the card. | Say it once: the done screen meta, or the empty state. This needs a SPEC.md:336,348 edit. |
| Card footer «НАБОР: … · ИЗ ЧАТА» (QuestionCard.tsx:223-229) | убрать | She chose the set seconds ago, and the provenance is known. It takes 44px of card height and adds a 4th mono line around one word. | This needs a SPEC.md:348 edit (desktop can keep it). |
| Mono index digits 1–4 inside the phone tiles (OptionGrid.tsx:317-322) | убрать | A keyboard affordance on a touch screen. Four extra glyphs compete with the answers. | Keep the md: Kbd caps (:323-331) for desktop. |
| Header label direction «· FR → RU» + question line «Что это значит?» (QuestionCard.tsx:32-35, 51-65) | объединить | Both tell her what to do: the mono code for designers, the sentence for people. | Keep the plain question. Shrink the header label to the skill only («ЗНАЧЕНИЕ») or drop it. |
| Repeat shown three times: «ПОВТОР» tag (:198-202) + «Ошиблись раньше — ещё раз» (:215-220) + «+1» on the counter (ExercisePlayer.tsx:563-567) | объединить | A triple signal for one requeue. | Keep the «ПОВТОР» tag. Remove the line and the «+1» (or fold «+1» into a hollow tick, see opportunities). |
| Counter «07 / 12» next to the hairline (ExercisePlayer.tsx:610-612) | объединить | Duplicates the hairline fill. The zero-padded mono reads as machine text. | Replace both with one tick row (see opportunities), or keep only the hairline. |
| Cloze question «Какое слово пропущено?» (QuestionCard.tsx:152; lib/core/exercises.ts:58) | убрать | The dashed gap already asks the question. |  |
| 200px action zone holding one quiet «Не знаю» (ExercisePlayer.tsx:526) | оставить | Needed so the result line doesn't shift the layout, but before the answer it reads as an empty gap. | Keep the size (it prevents layout shift). Optionally center «Не знаю» in the zone instead of at its bottom. |

**Visual opportunities:**
- Progress as a row of N short hairline ticks across the top: answered = ink, current = red, a requeued item appends a hollow tick. That replaces «07 / 12» + «+1», and the ticks fill in as she goes.
- A deck under the card: one or two 1px offset edges peek below its bottom (one per 4 remaining questions), shrinking as she advances. Drawn rules, no shadow.
- The card-to-card move is already a 24px slide (EXERCISE_CSS, ExercisePlayer.tsx:77-83). A 'card set down on the pile' feel would add a 1px offset edge appearing under the outgoing card. That stays within the motion spec.
- After the answer, a tap anywhere on the card works as «Дальше» (in addition to the button), for a faster thumb flow.
- Register tiles already show the meter visually. Larger meters and no full-name line would make them nearly text-free.

### Player: pairs (Exercise-S-Pairs)  ·  density 7/10, 17 elements

**Job:** Match five words to their translations.

**Visible at first paint:**
- × + hairline + «07 / 12» [ExercisePlayer.tsx:590-613]
- «УПРАЖНЕНИЕ · НЕ ВЛИЯЕТ НА РАСПИСАНИЕ» [:614]
- card header «ПАРЫ · 2 ИЗ 5» [QuestionCard.tsx:197]
- prompt «Соедини слово и перевод» [:172]
- 5 French tiles (Newsreader 19) left column [MatchPairs.tsx:40-75]
- 5 Russian tiles right column
- matched tiles: good border, 55% opacity, check icon [:33, 65-70]
- card footer «НАБОР: … · ИЗ ЧАТА» [QuestionCard.tsx:223-229]
- «Не знаю» in the 200px zone (with 5 pairs it reaches the fold)

| Element | Action | Why | Where to |
|---|---|---|---|
| «· 2 ИЗ 5» in the card header (QuestionCard.tsx:197; ExercisePlayer.tsx:506) | убрать | The faded, checked tiles already show progress. |  |
| Prompt «Соедини слово и перевод» (QuestionCard.tsx:172) | уменьшить | The two-column layout explains itself after the first time. | Put it in the header label («ПАРЫ») only. |
| Footer «НАБОР … ИЗ ЧАТА» + schedule line | убрать | Same as the question screen. Here they also push «Не знаю» to the fold. |  |
| Check icon on matched tiles (MatchPairs.tsx:65-70) | оставить | With the opacity fade and good border it's a third signal. | Fine as is. It could be replaced by a drawn connector line (below). |

**Visual opportunities:**
- On a match, draw a 1px good-tone line between the two tiles (stroke-dashoffset, about 200ms ease-enter), then let both tiles settle to muted. That shows the pairing instead of checks.
- A miss already flashes the again tone (ex-miss). Add a 2px horizontal 'shake' only if MOTION-SPEC allows; otherwise keep the flash.

### Player: new-word intro card (Exercise-S-NewWord)  ·  density 7/10, 14 elements

**Job:** Meet a new word (headword, meaning, one example), then go on.

**Visible at first paint:**
- × + hairline + «07 / 12» + schedule line [ExercisePlayer.tsx:589-615]
- header «НОВОЕ СЛОВО · ИЗ ВЕБА» + slang meter [NewWordCard.tsx:46-55]
- headword Newsreader 40 [:57-59]
- italic POS [:60-64]
- Russian translation 22 [:65]
- note (muted 14) [:66]
- example FR italic + RU under a hairline [:67-74]
- «Слова ещё нет в библиотеке. Добавить его можно на экране итогов.» [:76]
- footer «ИСТОЧНИК: LALANGUEFRANCAISE.COM» [:78-84]
- black «Понятно» [:87-96]
- mono «НАБОР: Вечеринка · ВОПРОС — СЛЕДУЮЩИМ» [:97-99]

| Element | Action | Why | Where to |
|---|---|---|---|
| «Слова ещё нет в библиотеке. Добавить его можно на экране итогов.» (NewWordCard.tsx:76) | на другой экран | It's about a later screen and interrupts learning the word. | The done screen's «Новые слова» section already offers the add. |
| Mono «НАБОР: … · ВОПРОС — СЛЕДУЮЩИМ» under the button (:97-99) | убрать | The set name is known. 'The question comes next' is obvious after one occurrence. |  |
| Footer «ИСТОЧНИК: domain» (:78-84) + «· ИЗ ВЕБА» in the header (:51) | объединить | Provenance shown twice. Neither helps her learn the word. | Keep only «ИЗ ВЕБА» in the header. Put the domain behind a tap on it (or drop it on phones). |
| Note line (:66) | оставить | Useful when present, but a 4th text block between translation and example. |  |

**Visual opportunities:**
- Mark the intro card with a dashed red header rule (instead of the solid one) so 'new, not in your library' reads at a glance without the explanatory line.
- «Понятно» could be a swipe-left of the card (the same exit motion as «Дальше»), with the button kept for accessibility.

### Player: feedback, wrong / «Не знаю» (Exercise-Feedback-C-Wrong) and right (Exercise-Feedback-C-Right)  ·  density 7/10, 17 elements

**Job:** See whether the answer was right and what the right answer is, then tap «Дальше».

**Visible at first paint:**
- × + hairline + «07 / 12» + schedule line [ExercisePlayer.tsx:589-615]
- card with header, prompt, question, footer (as in the question state)
- rotated stamp «НЕВЕРНО» / «ВЕРНО» bottom-right of the card [Stamp.tsx:10-25]
- cloze: the right word written into the gap in good [ClozeLine.tsx:51-55]
- right tile: 2px good border + good text + ✓ [OptionGrid.tsx:26, 89-95]
- wrong pick: again border + ✕ [:27]
- two other tiles dimmed [:28]
- wrong: answer row, mono «ОТВЕТ» + answer in good Newsreader 19 [FeedbackLine.tsx:50-63]
- pairs: «ОШИБОК: N» [:64]
- «Слово ›» [:72-80]
- explain_ru, 2 lines muted [:84]
- black «Дальше» 52px [:87-91]

| Element | Action | Why | Where to |
|---|---|---|---|
| Answer row «ОТВЕТ femme» on choice and cloze items (FeedbackLine.tsx:50-63; ExercisePlayer.tsx:530) | убрать | The right answer is already highlighted in green with a ✓ in the grid, and for cloze it's written into the gap. That's three places for one word, 100px apart. | Keep the row only for «Не знаю» on pairs. For register, the green tile shows it too. |
| «Слово ›» text button (FeedbackLine.tsx:72-80) | объединить | A separate control competing with «Дальше» in a small zone. | Make the card's headword tappable after the answer (dotted underline) to open the word sheet. |
| explain_ru 2 lines (:84) | оставить | This is the teaching content. |  |
| Stamp + tile tones together | оставить | Both say right or wrong, but the stamp is the brand moment and the tiles locate the answer. |  |
| Schedule line + card footer still present | убрать | Same as the question state. |  |

**Visual opportunities:**
- Underline the right option with a drawn ink stroke (stroke-dashoffset, 200ms ease-enter) in good tone instead of the ОТВЕТ row: the eye goes straight to the grid.
- Stamp: the existing 1.15→1 landing is the right visual. On a right answer, consider a smaller stamp so ВЕРНО feels lighter than НЕВЕРНО.
- After a right answer with no explain_ru, the 200px zone holds only «Дальше». Let a tap on the card advance too, so the visual weight stays on the card.

### Done (Exercise-S-Done; tab bar back)  ·  density 8/10, 26 elements

**Job:** See the result at a glance and choose what's next: repeat the mistakes, or leave.

**Visible at first paint:**
- h1 «Готово» Newsreader 34 [ExerciseDone.tsx:170-172]
- italic set title + mono meta «· СВОЯ ТЕМА · 12 ВОПРОСОВ» [:173-179]
- receipt «Вопросов ··· 12» [:182]
- receipt «С первого раза ··· 9» [:183]
- receipt «Точность ··· 75 %» [:184]
- «ОШИБКИ» head + red count «3» [:230]
- 3 error rows: fr Newsreader 19 + ru muted + slang meter with «fam. · verl.» [:232-255]
- «НОВЫЕ СЛОВА (3)» head + «ИЗ ВЕБА» [:262]
- 3 checkbox rows: ☑ + fr + ru [:264-302]
- secondary «Добавить в библиотеку (2)» [:304-316]
- (about y=596–650) black «Повторить ошибки (3)» — order-last on phones [:188-199]
- (at or below the fold) secondary «Попросить следующий набор» [:200-214]
- (below the fold) text «Готово» [:215-225]
- tab bar

| Element | Action | Why | Where to |
|---|---|---|---|
| Receipt row «Вопросов 12» (ExerciseDone.tsx:182) | убрать | It repeats «12 вопросов» in the meta line right above it (:162,176). |  |
| Two score rows «С первого раза 9» + «Точность 75 %» (:183-184) | объединить | Two numbers for nearly the same idea. Three dotted-leader rows read as accounting, not a result. | One big Newsreader result «9 из 12» with a tick strip (see opportunities). Drop the accuracy percentage. |
| Actions placed after both lists on phones (order-last, :188) | на другой экран | With 4 or more mistakes or new words, the primary «Повторить ошибки» falls below the fold. Lists come before the decision. | Put the actions right under the result (the desktop order) or in a sticky bottom bar above the tab bar. |
| Slang meter + «fam. · verl.» label on every error row (:241) | убрать | Register detail on a mistake summary. In a 358px row it squeezes the Russian text to an ellipsis. | The word sheet (rows already open it on tap, :246-249). |
| Text button «Готово» (:215-225) | уменьшить | Same word as the h1. The tab bar is back, so leaving is already one tap. | A × top-left (as in the player) or drop it; keep Esc for desktop. |
| «Попросить следующий набор» full-width secondary (:200-214) | уменьшить | It competes with the primary at the same size. | Make it a text link under the primary. |
| «НОВЫЕ СЛОВА (3) · ИЗ ВЕБА» head + checkbox list + «Добавить в библиотеку (2)» (:260-317) | за тап | A full selection UI for 1–3 words, defaulting to all checked. | One button «Добавить 3 новых слова», with the list behind «изменить ›» (or open the checklist in a sheet). |
| Mono meta «своя тема» (:162) | убрать | Doesn't matter after playing. |  |

**Visual opportunities:**
- A punched-ticket result: one square per question (ink filled = first try, red outline = mistake), under a large Newsreader «9 из 12». It replaces the three receipt rows and gives the set a 'shape' that varies per run. No count-up: render it static, or fade it in row by row in a single 200ms pass.
- Reuse the player's stamp as the screen's hero: a large rotated outlined stamp «9/12» on the result (static landing, as Stamp.tsx). That keeps the brand's one celebratory gesture with no confetti.
- Mistakes as a horizontal strip of small index cards (fr on top, ru below, red header rule), swipeable, tap opens the word. That replaces the dense table rows.
- New words: three small cards with a ✓ corner that can be tapped off, plus one «Добавить» button. It keeps the 'paper cards into your library' metaphor.

## Добавить (phone quick-add sheet: search, variants, word form, list paste)

### A1 · Поиск, пусто (Add-Empty): sheet opens, input autofocused, keyboard up  ·  density 6/10, 14 elements

**Job:** Type (or paste) the French or Russian word to add.

**Visible at first paint:**
- Grab handle (Sheet.tsx:181)
- Mono label «КАРТОЧКА № 159» (parts.tsx:58; label built QuickAddSheet.tsx:275-278)
- Close × (parts.tsx:60)
- Title «Новое слово» Newsreader (parts.tsx:63)
- Tool box «Скриншот» with camera icon (QuickAddSheet.tsx:712-714)
- Tool box «Список» with clipboard icon (QuickAddSheet.tsx:715-717)
- 2px red index-card rule (parts.tsx:66)
- 56px headword input, placeholder «Слово или выражение — FR или RU» (SearchPanel.tsx:108-120)
- Helper paragraph «Перевод, заметка, уровень сленга и тема заполнятся сами — останется только проверить.» (SearchPanel.tsx:150-154)
- Section header «НЕДАВНИЕ» (SearchPanel.tsx:157-161)
- Aside «СЕГОДНЯ · 3» (SearchPanel.tsx:160)
- Recent row 1: FR serif, RU muted, slang meter + italic abbr, mono «ТЕМА: ПОВСЕДНЕВНОЕ» (SearchPanel.tsx:184-208) — with keyboard up, only ~1 row is above the keyboard
- (below the keyboard) recent rows 2-3, footer hint «Несколько слов сразу — через «Список». Со скриншота — через «Скриншот».» (SearchPanel.tsx:171-173)

| Element | Action | Why | Where to |
|---|---|---|---|
| Two chrome rows (label row h-11 + title/tools row h-11 + 8px + red rule) ≈ 102px + handle, parts.tsx:53-68 | объединить | With the keyboard up the large sheet is min(0.78 × visualViewport, …) ≈ 396px on a 390×844 iPhone (Sheet.tsx:151-157); chrome takes ~113px, over a quarter of what she can see, before the input. | One 44px row: «Новое слово» + mono «№ 159» set small after it, × on the right; the red rule stays. |
| «Скриншот» / «Список» outlined tool boxes in the header (QuickAddSheet.tsx:709-719) | на другой экран | These are other ways in. They compete with the title, and they stay on screen while she types and in the form, where they are wrong (Скриншот leaves the sheet and drops the draft). | Only in the empty search body, as two quiet ruled rows under the input («Со скриншота ›», «Списком ›»), or as two 44px icon buttons in the merged header that show only while the input is empty. |
| Helper paragraph «Перевод, заметка, уровень сленга и тема заполнятся сами…» (SearchPanel.tsx:150-154) | убрать | It onboards a single user who has already learned the flow, and it is two lines of muted text right under the input. | Fold the promise into the placeholder at most («Слово — FR или RU»). Keep the «Подсказки выключены…» variant only when suggestions are off. |
| Footer hint «Несколько слов сразу — через «Список». Со скриншота — через «Скриншот».» (SearchPanel.tsx:171-173) | убрать | It repeats the two header tools word for word. |  |
| «СЕГОДНЯ · 3» aside (SearchPanel.tsx:160) | убрать | A number she does not act on. It also edges toward a streak or counter feel, which MOTION-SPEC rules out. | Or replace it with a silent visual (see visual_opportunities). |
| Recent row right column: slang meter + mono «ТЕМА: …» (SearchPanel.tsx:199-206) | уменьшить | Four data points per row in a list that only answers «did I already add it / tap to open». The level and theme are on the card itself and in Библиотека. | One 48px line: FR serif — RU muted. Drop the meter and «ТЕМА:». |
| «Недавние» list (3 × 64px) | оставить | Useful as a memory hook and as the target of the «Добавить и ещё» landing animation (A8), but it sits mostly under the keyboard. | Keep it, slimmer (above). |

**Visual opportunities:**
- Replace «СЕГОДНЯ · 3» with a tiny static stack of card edges (N hairline-offset index-card tops, max 5) beside «Недавние»: a count you see, not read, and no number animation.
- The «Добавить и ещё» landing (A8, SearchPanel.tsx:178-182) could become a card dropping onto that stack (translateY + Collapse, --dur-move, no bounce) rather than a row fade alone.
- An empty input could show a faint ruled index-card line under the text baseline (as if writing on the card) instead of a boxed field. It stays ink on paper.

### A2 · Поиск, слово набрано: «Словарь» + «Варианты» (Add-Suggest), incl. waiting/skeleton and error  ·  density 8/10, 22 elements

**Job:** Pick the right meaning/translation from «Варианты» (or go manual).

**Visible at first paint:**
- Handle, «КАРТОЧКА № 159», ×
- «Новое слово» + «Скриншот» + «Список» tools
- Red rule
- Headword input «la thu» + clear × (parts.tsx:174-184)
- Header «СЛОВАРЬ» + aside «работает без сети» (SearchPanel.tsx:226)
- 3 × 44px dictionary rows: typed prefix ink + rest muted, italic «n. f.», ↖ arrow icon (SearchPanel.tsx:245-268)
- Header «ВАРИАНТЫ» + aside «перевод · уровень · тема» (SearchPanel.tsx:285-289)
- --- keyboard edge: everything below is hidden while typing (≈396px sheet: chrome 113 + input 72 + Словарь ≈182 leaves ~29px) ---
- Status slot «ПОДБИРАЕМ ВАРИАНТЫ» + ink run / «3 ВАРИАНТА» fading (parts.tsx:363-376)
- 3 × 72px variant rows: FR serif + italic abbr, RU, slang meter + italic level, mono «ТЕМА: ДЕНЬГИ», chevron › (SearchPanel.tsx:329-386); skeleton slots while waiting (parts.tsx:384-401); or error row + «Повторить» (parts.tsx:408-426)
- «✎ Заполнить вручную ›» row (SearchPanel.tsx:388-402)
- «🔍 Как «la thu» говорят в жизни · КОНТЕКСТ ›» row (SearchPanel.tsx:135-139, ContextLink.tsx:64-79)

| Element | Action | Why | Where to |
|---|---|---|---|
| «Словарь» section: header + 3 × 44px rows before «Варианты» (SearchPanel.tsx:132, 211-243) | уменьшить | Prefix completion is the secondary aid, yet it takes ~182px and pushes every «Варианты» row, the thing she came to pick, under the keyboard. Picking a hit only rewrites the input (QuickAddSheet.tsx:353-358). | An inline ghost completion inside the headword input (typed «la thu» + muted «ne», tap or → to accept), plus at most one 40px strip of 2 more candidates as text separated by hairlines. Same fixed slot, so A3/A4 «nothing moves» still holds. |
| Aside «работает без сети» (SearchPanel.tsx:226) | убрать | Implementation detail, not something she acts on. |  |
| Aside «перевод · уровень · тема» (SearchPanel.tsx:288) | убрать | A column legend for rows that already read on their own. |  |
| Section headers «СЛОВАРЬ» / «ВАРИАНТЫ» themselves (parts.tsx:192-201) | уменьшить | Once the dictionary becomes an inline completion, one section is left and needs no label. | Keep only the ink rule plus the status slot (which already says «3 ВАРИАНТА»). |
| Variant row: mono «ТЕМА: …» (SearchPanel.tsx:379-381) | на другой экран | She picks a variant by meaning. The theme is usually the same across variants, is decided later in the form, and the «ТЕМА:» prefix is pure label. | Word form (it is already there as the «Тема» chips). |
| Variant row chevron › (SearchPanel.tsx:383) | убрать | The whole 72px row is the button, and the ink-fill pick (A5) already shows it is tappable. |  |
| Variant row italic level word next to the meter («arg.») | оставить | The meter alone carries the level, and the word doubles it. | Keep it for now: the meter plus italic abbr is the brand's slang signature (SPEC v3). |
| «Заполнить вручную» full-width row with pencil + chevron (SearchPanel.tsx:388-402) | уменьшить | A fallback styled like a choice. | A muted text link under the last variant, at a fixed y (as in M-Add-Suggest F4). |
| «Как «…» говорят в жизни · КОНТЕКСТ ›» (SearchPanel.tsx:135-139) | на другой экран | A navigation that leaves the add task and closes the sheet (onLeave). It is a fifth block on an already long list. | Word detail / the form's «Пример» row («Примеры из жизни ›»), or Library search (ContextRow variant="library"). |
| Status line + skeleton slots + error-in-place (parts.tsx:251-426) | оставить | Not noise: this is the motion-spec wait state (A2/A3). |  |
| Header tools «Скриншот»/«Список» while typing | убрать | Irrelevant once a word is typed. | See A1: shown only while empty. |

**Visual opportunities:**
- Inline ink ghost-completion in the 56px input (Newsreader 22, the rest of the word in muted ink, as DictionaryRow already renders typed vs rest, SearchPanel.tsx:246-257). It replaces a whole section with zero chrome.
- Variant rows as thin stacked index-card slips (white, 1px rule, the 2px red line on the top slip only), so the pick reads as pulling one card off the pile.
- Shared-element pick: after the A5 ink-fill, the picked row's FR and RU glide (--dur-move, ease-standard, no overshoot) into their spots on the form card instead of a hard swap. This ties the two screens together.
- Show the slang level as the meter only, with the 4th segment in red ink for vulg. (as SlangPicker does, parts.tsx:762), so level reads at a glance with no words.

### A3 · Поиск: «Уже есть…» duplicate notice (Add-Duplicate)  ·  density 7/10, 14 elements

**Job:** Notice it is already saved and choose: open the existing card or add anyway.

**Visible at first paint:**
- Handle, «КАРТОЧКА № 159», ×, «Новое слово», «Скриншот», «Список», red rule
- Headword input «la thune» + ×
- Dashed warn box (≈156px with margins, parts.tsx:553-582): «Уже есть в теме «Деньги»» bold warn
- Mono ordinal «№ 047» (parts.tsx:556-558)
- Existing word FR serif + RU + slang meter (parts.tsx:560-568)
- Secondary button «Открыть» + text button «Всё равно добавить» (parts.tsx:569-580)
- --- keyboard edge (≈396px sheet: chrome 113 + input 72 + notice 156 ≈ 341) ---
- «Словарь», «Варианты», «Заполнить вручную», «Контекст» below

| Element | Action | Why | Where to |
|---|---|---|---|
| Mono ordinal «№ 047» (parts.tsx:556-558) | убрать | A catalog number she never uses to decide anything. |  |
| Existing word FR repeated (parts.tsx:562-564) | убрать | It is the same headword she just typed, one line above. | Keep only its RU, so she can tell whether it is the same meaning. |
| Slang meter in the notice (parts.tsx:567) | убрать | Not needed for the open/add decision. |  |
| Box padding + 3 stacked lines + 44px button row | уменьшить | The notice alone fills almost all of the space above the keyboard. | A single 56-64px dashed warn row: «Уже есть · Деньги — бабки, деньги» left, «Открыть ›» right. «Всё равно добавить» becomes implicit: picking any variant below acks it (setAckDuplicate), with a muted text link kept for a11y. |
| Warn tokens + dashed border + A9 Collapse reveal | оставить | Not noise: correct, quiet, on-brand. |  |

**Visual opportunities:**
- Show the duplicate as the existing index card peeking out from behind the input (a card edge with the red line and «Деньги» in mono). «Already in the box» shows as a shape, not as a sentence.
- Tapping «Открыть» could lift that peeking card up into the word detail sheet (same shape, --dur-move).

### A4 · Поиск: быстрая форма (suggestions off, error or offline)  ·  density 7/10, 12 elements

**Job:** Type the translation by hand and save quickly.

**Visible at first paint:**
- Handle, label, ×, title, «Скриншот», «Список», red rule
- Headword input
- (FR input) «Словарь» section
- «ВАРИАНТЫ» header + status «НЕТ СЕТИ»/«НЕ УДАЛОСЬ» + 72px error row «Нет сети — варианты появятся, когда она вернётся» or «Не удалось подобрать варианты» + «Повторить» (parts.tsx:292-297, 408-426)
- Quick form: «РУССКИЙ» field «Перевод» (SearchPanel.tsx:416-428)
- «ТЕМА  Входящие ▾» native select (SearchPanel.tsx:429-431)
- Tertiary «Все поля» (SearchPanel.tsx:434-438)
- «Контекст» row
- Footer «Добавить» full-width primary (QuickAddSheet.tsx:697-706) pinned above the keyboard

| Element | Action | Why | Where to |
|---|---|---|---|
| «Варианты» header + 72px error slot kept while the quick form is open | уменьшить | When suggestions are off or failed, the empty «Варианты» region is the main block on screen and pushes the RU field under the keyboard. | Collapse to one muted 21px status line («НЕТ СЕТИ · заполните сами» + «Повторить» link) right above the RU field. Keep it in the same slot so nothing jumps. |
| «Тема  Входящие ▾» select in the quick form | за тап | On a fast offline save, «Входящие» is the right default, and fillSavedWords sorts it later (QuickAddSheet.tsx:538-539). | Behind «Все поля». |
| «Словарь» when the error is network-only | уменьшить | Same issue as A2: pushes the fields down. | Inline completion (A2). |
| «Контекст» row | убрать | Leaves the task, and it needs the network anyway when offline. |  |
| Footer «Добавить» | оставить | Primary action, pinned above the keyboard. |  |

**Visual opportunities:**
- Show the RU field as the second ruled line of the same index card the headword sits on (FR on the top line, RU on the line below), so the quick form reads as finishing a card, not as filling in a form.
- Offline: a small cloud-off hairline glyph in muted ink beside the status line (M-Login-style F3), not a sentence.

### A5 · Карточка после выбора варианта (Add-Filled / M-Add-Detect F1), keyboard down  ·  density 9/10, 24 elements

**Job:** Check the auto-filled card at a glance and press «Добавить».

**Visible at first paint:**
- Handle
- ← back «Назад к поиску» + «КАРТОЧКА № 159» + × (parts.tsx:55-61)
- «Новое слово» + «Скриншот» + «Список» tools (QuickAddSheet.tsx:709-719: shown in form mode too)
- Red rule
- Headword input «la thune» + trailing italic «n. f.» AbbrHint (WordForm.tsx:152-169)
- «РУССКИЙ» row «бабки, деньги» (WordForm.tsx:179-199)
- «ЗАМЕТКА» 2-line textarea «Синонимы: le fric, l'oseille» (WordForm.tsx:201-210)
- «ПРИМЕР» row: FR italic «J'ai plus de thune.» + spark ↻ «Другой пример» + × «Убрать пример»; RU muted line; caption «подобран автоматически»; «✦+ Ещё пример» button (WordForm.tsx:211-239, ExampleList.tsx:112-198, 201-222)
- «СВОИ ПОЛЯ» collapsed row with summary + chevron (only if shared fields exist; WordForm.tsx:72-121, 240)
- «+ Поле» menu button (DraftExtras.tsx:239, AddFieldButton.tsx:32-35)
- «УРОВЕНЬ СЛЕНГА» label + caption «определён автоматически» (parts.tsx:771-779)
- 4-segment block нейтр./fam./arg./vulg. with top meter bars + «☐ verl.» toggle (parts.tsx:780-810)
- --- fold (full sheet ≈741px: chrome 113 + footer ≈102 leaves ≈526px of body) ---
- «ТЕМА» label; chips «Деньги» (selected) «Повседневное»; caption «подобрано автоматически»; dashed «+ новая тема: …»; «Другие темы ▾» (WordForm.tsx:253-273, parts.tsx:668-731)
- «☑ Карточки в обе стороны / FR → RU · RU → FR» (WordForm.tsx:275, parts.tsx:816-846)
- Footer: «Добавить и ещё» (secondary) + «Добавить» (primary) (QuickAddSheet.tsx:665-686)

| Element | Action | Why | Where to |
|---|---|---|---|
| «Скриншот»/«Список» tools in form mode (QuickAddSheet.tsx:709-719) | убрать | Irrelevant while confirming a card. «Скриншот» is a Link that closes the sheet (handleOpenChange(false)) and silently drops the draft. |  |
| Two-row chrome with back + card number + title | объединить | «Новое слово» says nothing that the big headword under it does not already say. | One row: ← · mono «№ 159» · ×. The headword is the title. |
| Three provenance captions: «подобран автоматически» (WordForm.tsx:237), «определён автоматически» (parts.tsx:768), «подобрано автоматически» (parts.tsx:707-711) | убрать | The same message three times. The A5 spotlight already marks what was filled, and the helper text already promised it. | If provenance must stay, use one mono line under the card: «ЗАПОЛНЕНО АВТОМАТИЧЕСКИ · проверь». |
| Example row controls: ↻ spark, ×, «+ Ещё пример» (ExampleList.tsx:112-126, 166-175, 178-188) | за тап | Three controls around a single sentence she only needs to read. | Show them only while the example is focused or tapped. At rest it is just the italic FR + muted RU. |
| «Свои поля» row + «+ Поле» button (WordForm.tsx:240-241, DraftExtras.tsx:184-241) | объединить | Two separate «more fields» entry points, both rarely used, and both above the slang level and theme. | A single muted «+ Поле» line at the very bottom of the card (after Тема). It opens shared fields, Происхождение, Спряжение and Своё поле in one menu. |
| «Уровень сленга» block: label + caption + 44px segmented + verl. box ≈92px (parts.tsx:736-813) | уменьшить | A full 4-way control to confirm a value that is usually right. | One 48px FieldRow «Сленг ▮▮▮▯ arg.  verl.». Tap the meter to set it (see visual_opportunities); the segmented control opens only on tap. |
| «Тема» chips: auto + alternatives + dashed new + «Другие темы ▾» (parts.tsx:668-731) | уменьшить | 3-5 chips plus a caption for a choice that is already made and below the fold. | One FieldRow «Тема  Деньги ▾» (selected chip only). Alternatives, the new-theme proposal and «Другие» open behind the tap as the chip sheet. |
| «Карточки в обе стороны / FR → RU · RU → FR» (parts.tsx:816-846) | за тап | Per-word setting that defaults to true (draft.ts:82, 111) and almost never changes. | Inside the «+ Поле»/«Ещё» disclosure, or as a Settings default. |
| «Заметка» textarea (WordForm.tsx:201-210) | уменьшить | Useful content, but an empty 63px textarea after a pick without a note is noise. | When it is empty, show nothing and add «Заметка» to the «+ Поле» menu. When it is filled, show it as text that becomes editable on tap. |
| Footer «Добавить и ещё» + «Добавить» | оставить | These are the actions she came to take. |  |
| Headword input + «n. f.» trailing abbr | оставить | Identity of the card. |  |

**Visual opportunities:**
- Render the form AS the index card being saved: white card, 1px rule, the 2px red line 44px from the top with «№ 159» and the slang meter above it (as on Review-Back), the headword in Newsreader under it, RU, the italic example, then mono «ТЕМА: ДЕНЬГИ». Read-mode by default; tap any line to edit it in place. «Проверить» becomes reading the real card.
- Slang meter as the direct control: the four ink bars, enlarged, are the hit targets (tap or drag along them). The level word updates in italic beside them, and the 4th bar inks red for vulg. This keeps the brand meter instead of a segmented slab.
- «Добавить» motion: the card sinks with the sheet (A8 already). For «Добавить и ещё», the card slides down into the «Недавние» stack (translate + scale .96, --dur-move, no bounce) instead of only fading the fields (QuickAddSheet.tsx:889).
- The existing A5 spotlight (paper flash --surface-2 → white) is enough of an «auto-filled» signal to replace every «…автоматически» caption.

### A6 · Карточка вручную, идёт определение (M-Add-Detect F2/F3), FR field focused, keyboard up  ·  density 7/10, 14 elements

**Job:** Type FR and RU; let level, example and theme fill themselves, then add.

**Visible at first paint:**
- Handle, ← «КАРТОЧКА № 159» ×, «Новое слово» + «Скриншот» + «Список», red rule
- Headword input (focused, QuickAddSheet.tsx:410)
- «РУССКИЙ» row
- «ЗАМЕТКА» empty textarea «Оттенок, синонимы, происхождение»
- (maybe) «ПРИМЕР» row top with mono «…» pending (WordForm.tsx:232-236)
- --- keyboard + footer edge (full sheet with keyboard ≈452px: chrome 113 + footer ≈84 leaves ≈255px) ---
- «+ Поле», «УРОВЕНЬ СЛЕНГА» with UnknownMeter + «определяется…», «ТЕМА» + «подбираем тему…», «Карточки в обе стороны»
- Footer «Добавить и ещё» + «Добавить» above the keyboard

| Element | Action | Why | Where to |
|---|---|---|---|
| «Заметка» and «Пример» rows between RU and the footer | за тап | While she is typing the two words that matter, the empty optional fields take the only visible space above the keyboard. | Hide them until FR and RU are both filled (detection then fills the example). Empty Заметка goes into «+ Поле». |
| Chrome rows + tools (as A5) | объединить | 113px of a ~452px sheet. | One row (A5). |
| Detection captions «определяется…», «подбираем тему…» (parts.tsx:768, WordForm.tsx:258-262) | уменьшить | They spell out what the UnknownMeter and the «…» placeholders already show. | Keep only the drawn unknown states (4 rule-coloured bars, mono «…»). Drop the words, but keep «не определилось» on failure as role=status. |

**Visual opportunities:**
- Show the manual card as an empty ruled index card: the FR line and RU line as hand-ruled baselines (1px rule), with the meter drawn in rule-coloured bars that ink in as detection lands (A6 F3). The card fills itself line by line, which reads as dynamic and stays paper.
- When RU is entered, the example line could «write in» from the left (clip-path reveal, --dur-enter) instead of popping in, the way ink appears as you write.

### A7 · «Несколько слов» — пустое поле вставки  ·  density 4/10, 8 elements

**Job:** Paste a list of «fr — ru» lines.

**Visible at first paint:**
- Handle
- ← «СПИСОК · 0 СТРОК» + × (QuickAddSheet.tsx:276-277)
- Title «Несколько слов» (no tools)
- Red rule
- Bordered textarea, min 148px, 3-line placeholder «la thune — бабки, деньги / kiffer — тащиться / chelou — стрёмный» (ListPanel.tsx:153-168)
- Hint «По слову на строку: французское — русское. Подойдёт тире, двоеточие или табуляция.» (ListPanel.tsx:169-171)
- Footer disabled «Добавить» (QuickAddSheet.tsx:687-696) above the keyboard

| Element | Action | Why | Where to |
|---|---|---|---|
| «СПИСОК · 0 СТРОК» label (QuickAddSheet.tsx:276-277) | убрать | «0 строк» before anything is pasted. Later it duplicates «N из M» in the «Разбор» header. | Leave the title alone. The count lives on the footer button («Добавить 12 слов»). |
| Format hint paragraph (ListPanel.tsx:169-171) | уменьшить | The 3-line placeholder already shows the format, and the paragraph says it again in words. | Show it only when a row parses as invalid («нет перевода»), as the line under that row. |
| Disabled footer «Добавить» | убрать | A dead button taking 84px above the keyboard. | Let the footer rise in only once rows exist (--dur-enter, as I3 does for Import). |
| A «Вставить» paste shortcut is missing | оставить | Not noise, a gap: on iOS, pasting into a textarea takes a long-press. | Optional: one secondary «Вставить из буфера» button inside the empty textarea (navigator.clipboard.readText). |

**Visual opportunities:**
- Draw the empty textarea as a ruled page: faint 24px hairlines matching leading-6, with the placeholder lines sitting on them, so it reads as a sheet of notebook paper waiting for a list.

### A8 · «Несколько слов» — разбор вставленного списка (M-Add-Detect F4)  ·  density 8/10, 16 elements

**Job:** Scan the parsed words, untick the wrong ones, add them all.

**Visible at first paint:**
- Handle, ← «СПИСОК · 12 СТРОК» ×, «Несколько слов», red rule
- Textarea grown to content (max 40vh ≈ 338px; ListPanel.tsx:166) with the pasted lines
- Format hint paragraph
- «ТЕМА  По темам автоматически ▾» select row (ListPanel.tsx:175-185)
- Header «РАЗБОР» + mono «11 из 12» (ListPanel.tsx:187)
- Status line «ОПРЕДЕЛЯЕМ · 4 / 12» determinate bar / «Готово · 12 слов» (ListPanel.tsx:82-129)
- First 76px rows: checkbox, FR serif 17, RU muted, italic example line or «…», small slang meter, mono theme or «+ новая», or tag «УЖЕ ЕСТЬ»/«ПОВТОР»/«НЕТ ПЕРЕВОДА» (ListPanel.tsx:203-283) — with the keyboard still up (textarea focused), effectively zero rows are visible
- Footer «Добавить 11 слов»

| Element | Action | Why | Where to |
|---|---|---|---|
| Full pasted textarea above the parsed rows (ListPanel.tsx:153-168) | уменьшить | After the paste the same 12 words show twice: raw text and parsed rows. With the keyboard up, the rows are entirely hidden. | On paste: blur (keyboard down) and fold the textarea into a single 44px ruled strip «Вставлено 12 строк · Изменить» that reopens it. |
| Example line in every row; rows 76px (ListPanel.tsx:218-219, 253-257) | убрать | Examples are not what she checks in a bulk list. They add 20px per row (12 rows = 240px) and a «…» per row while waiting. | Keep the 56px rows. Examples are still saved (saveList passes them, QuickAddSheet.tsx:573) and show on the card. |
| Per-row mono theme label (ListPanel.tsx:262-268) | объединить | The same theme name repeats on many rows. | Group rows under thin theme sub-headers «→ Деньги 3», «→ Эмоции 2», «→ новая тема «Транспорт» 3» (the Sort-Plan pattern). Tap a header to retarget the group. |
| «ТЕМА  По темам автоматически ▾» select (ListPanel.tsx:175-185) | за тап | With automatic themes on, the group headers above already show where each word goes. | In the footer as a compact «Тема ▾» next to «Добавить N слов» (as in Import-Review: «Тема для всех ▾»). |
| «РАЗБОР» header + «11 из 12» (ListPanel.tsx:187) | объединить | The count repeats the footer button and the chrome label. | The count lives only on the footer button. Header text optional. |
| Chrome label «СПИСОК · 12 СТРОК» | убрать | A third count. |  |
| Format hint paragraph | убрать | Not needed once rows have parsed. |  |
| Status line «ОПРЕДЕЛЯЕМ · 4 / 12» (A10) | оставить | It is the one honest progress signal. |  |
| Tags «уже есть» / «повтор» / «нет перевода» | оставить | They decide why a row is unticked. |  |

**Visual opportunities:**
- Fold motion: on paste the textarea collapses (height --dur-move) into the ruled «Вставлено 12 строк» strip and the parsed rows take its place row for row, the same continuity idea as Import I3.
- Theme groups as ruled ledger sections. Each row's slang meter stays small, and as detection lands a row slides into its theme group once, with the A10 spotlight, rather than the theme text changing on every row.
- Unticked rows dim to .5 and the tick stroke draws itself (I6 pattern reused), and the button label crossfades «Добавить 11 слов» → «Добавить 10 слов». This motion is already in the brand.

## Библиотека (phone, <768 — LibraryScreen renders PhoneLibrary only below md; LibraryScreen

### Library home — themes view (default, with «Входящие»)  ·  density 8/10, 32 elements

**Job:** Find a word or open a theme: get from 'I want to look at my words' to the right list in one tap or one search.

**Visible at first paint:**
- H1 «Библиотека» Newsreader 28 (LibraryScreen.tsx:285)
- SyncMark «· НЕ СИНХРОНИЗИРОВАНО» / «· ОФЛАЙН», only on trouble (:286, SyncMark.tsx:25-42)
- Magnifier icon button → «Контекст» (:290-296)
- Gear icon → Настройки (:297-303)
- Ledger cell «1318 / СЛОВ», a toggle that switches to the all-words view (:310-316)
- Ledger cell «27 / К ПОВТ.» in red, a filter with a long-press menu (:317-325)
- Ledger cell «56 / ТРУДНЫХ», a filter with a long-press menu (:326-333)
- KPI cell «202 / ПОВТОРЕНО», not a control (:337)
- KPI cell «96 / СЕГОДНЯ», not a control (:338)
- Dashed row «Входящие · 7 БЕЗ ТЕМЫ» in red (:421-434)
- Spark button «Разложить ›», or «Нужна сеть» with cloud-off offline (:435-445)
- Black tile «Все слова» + mono «1318 · ОДНИМ СПИСКОМ» + chevron (:461-474)
- Theme tile ×4 (about 5.5 partly visible), each: 3px colour band (FolderTile.tsx:64), name Newsreader 19 (:65), mono «38 · 2 к повт.» / «12 · на паузе» (:66-75), italic serif line of 3 newest words (:76-80), 2px mastery line (:81)
- (below the fold: 30+ more tiles, dashed «+ Новая тема» tile :478, upkeep block with 'Все слова разложены — ✦ Разложить по темам', '98 без уровня — ✦ Определить уровень языка', '12 без примера — ✦ Дополнить карточки', 'Последняя раскладка: N перемещений — Отменить' :168-215)
- Sticky search box: magnifier, placeholder «Поиск по FR и RU» (:736-752)
- Sliders button «Фильтр и порядок» + red count badge when filters are on (:755-771)
- Tab bar: Повторение · Упражнения · Добавить · Библиотека (active, red top bar)

| Element | Action | Why | Where to |
|---|---|---|---|
| KPI row «ПОВТОРЕНО» / «СЕГОДНЯ» (LibraryScreen.tsx:335-339) | на другой экран | Review-progress stats that are not filters (the code comment says 'counts only, not filters'). They have nothing to do with finding a word, cost 57px of the fold, and SPEC v3 (SPEC.md:143) only asked for three cells. | Повторение plan/done screen (the 'Готово на сегодня' receipt already shows 'Повторено') |
| Ledger cell «1318 СЛОВ» (:310-316) + the black «Все слова · 1318 · одним списком» tile (:461-474) | объединить | Both do the same thing (setView('words')) and both print the same total, so the number appears twice in the first 330px. | Keep one entry: the black 'Все слова 1318' tile. The ledger loses its first cell. |
| Ledger cells «К ПОВТ.» / «ТРУДНЫХ» as 64px boxed cells (:317-333) | уменьшить | They duplicate the 'Показать' chips in the filter sheet (LibraryFilterSheet.tsx:76-83), and 'к повт.' duplicates the Повторение tab's whole job. As big Newsreader-26 numbers they read as a dashboard, not a catalog. | One mono subline under the title (the original SPEC.md:226 had «158 слов · 23 к повторению»): «27 к повт. · 56 трудных», each a tappable filter word with the long-press menu kept |
| Header magnifier → «Контекст» (:290-296) while a second magnifier sits in the bottom search (:738) | за тап | Two identical search glyphs on one screen with different meanings. The top one does not search the library. | Keep the 'Посмотреть «…» в Контексте' row in the no-results state (:404) and 'Примеры из жизни' in the word sheet. If a header entry must stay, give it a distinct glyph (e.g. quote/book) or put it in the gear's screen. |
| Italic 'three newest words' line on every tile (FolderTile.tsx:76-80, samples on in LibraryScreen.tsx:476) | убрать | Across 35 tiles this is 100+ muted French words of texture with no task attached, and the reason tiles are 116px instead of 96. It doubles the scroll length of the grid. | (the theme page already lists the words; optionally keep it only for the theme the user opened last) |
| Tile count text «38 · 2 к повт.» (FolderTile.tsx:66-75) | уменьшить | Two numbers per tile ×35. The due count is the one that matters and can be a mark rather than text. | Keep the total in mono. Show due as a small red tick/notch on the tile's top band, or a red numeral only when due > 0, dropping the words «к повт.» |
| Upkeep block: «Все слова разложены — Разложить по темам» (:170-180) | убрать | An action shown precisely when there is nothing to sort. The caption admits it. | Re-sort stays reachable from the «Входящие» row when it exists and from a library overflow menu |
| Upkeep rows «N без уровня — Определить уровень языка», «N без примера — Дополнить карточки», «Последняя раскладка … — Отменить» (:182-214) | за тап | Maintenance tasks for Claude stuck at the bottom of a 35-tile grid where nobody scrolls. They need reserved-height choreography (UpkeepBlock :635-680) just to avoid jumping. | One quiet ruled row «Уход за карточками · 3» (or a «⋯» in the header) opening a small sheet with these rows. The undo of the last run stays in the snackbar right after the run. |
| Spark «Разложить ›» button inside the «Входящие» row (:435-445) | уменьшить | Fine as an action, but the row carries five items (name, dot, red count, spark, label, chevron). | «Входящие 7» + one spark glyph button. The aria-label already carries the meaning. |
| «+ Новая тема» tall dashed tile (FolderTile.tsx:102-113) | оставить | Below the fold and rarely used, but it is the only place to create a theme | Shrink to a 44px dashed row after the last theme |
| Bottom search + filter button (:723-776) | оставить | Not noise: thumb-reach and the screen's main tool |  |

**Visual opportunities:**
- Turn the 35 two-column 116px tiles into a card-catalog drawer list. Each theme becomes a 52px ruled row with the theme colour as a 3px left spine (instead of the top band), the mono theme number «03» as the drawer label, the name in Newsreader 19 and the count in mono on the right. The row's bottom hairline is itself the mastery line, filled in the theme ink to the learned %. That fits about 9 themes above the fold instead of 4, with zero new decoration.
- Or keep a grid but 3 columns × 72px 'drawer fronts' (name + count only) with the mastery as a 2px bottom rule: a visual wall of drawers where fuller-ink drawers read as 'learned'.
- Due as ink, not text: a short red notch on the drawer spine whose length scales with the due count (0 = none). The red accent then marks exactly where attention is needed (SPEC: red only for counts that need attention).
- Opening a theme: use the existing nav-forward view transition (FolderTile.tsx:14) to morph the tapped drawer's colour spine and name into the theme page header (a shared-element transition, 24px max travel per MOTION-SPEC principle 1), so the page reads as 'the drawer pulled out'.
- After «Разложить» or import, the spotlight (MOTION-SPEC 5.14) on drawers that received words already exists. With a list layout it can also briefly show '+3' in mono at the row end, then fade.
- Header subline «27 к повт. · 56 трудных» as underlined ink words (like the 'Примеры из жизни' red underline, ContextLink.tsx:17) instead of boxed cells. They are still tappable filters but read as one line of text.

### Library — «Все слова» list / search results / filtered list (listMode)  ·  density 8/10, 22 elements

**Job:** Scan the list to find a specific word and open it (or confirm it exists).

**Visible at first paint:**
- H1 «Библиотека», Контекст magnifier, gear (still there, :283-305)
- Full ledger strip, 5 numbers / 2 rows (still there, :308-340), so the list starts at about y 215
- Section head: «Все слова · 1318», or «Найдено 12 слов · Деньги», or «Ищем…» (:344-357)
- «К темам» tertiary button, or «Сбросить фильтр» (:358-368)
- Word rows ×about 7 at 64px, each: status dot (WordList.tsx:43), French headword serif 19 (:46-48), italic POS abbr «n. f.» (:49-53), Russian muted (:55-56), optional origin «· верлан от lourd» (:57), theme name «· Деньги» in cross-theme lists (:58), 4-segment slang meter (:64), level mark «≈B1» (:65), mono schedule «К ПОВТ.» / «НОВОЕ» / «ЧЕРЕЗ 4 Д» / «НА ПАУЗЕ» (:67-77)
- (after 200 rows) «Показать ещё 200 из 1118» secondary button (WordList.tsx:314-318)
- Search box + filter button with badge (:489-495)
- Tab bar

| Element | Action | Why | Where to |
|---|---|---|---|
| Ledger strip kept above the list (:308-340) | убрать | Once the user is in a list, 135px of counts push the rows down to y≈215, so only about 7 rows are visible. In search mode the numbers are irrelevant. | Hide in listMode. The section head already states the count. If the ledger is reduced to a subline (see the home screen), keep only that. |
| Status dot (WordList.tsx:43) + mono schedule label (:67-77) | объединить | Both encode the card's state: an empty dot with «НОВОЕ», a red dot with «К ПОВТ.». That is two signals for one fact on 1300 rows. | Keep one. Either the dot (filled amount = learned) or the label only when it is actionable (red «к повт.»), with 'через 4 д' moved to the word sheet. |
| Slang meter + level mark «≈B1» side by side on every row (:63-66) | за тап | Two metadata scales stacked above the schedule label make a 3-item right column per row. The level is an estimate ('точна примерно в половине случаев') yet sits on every row. | Show the level column only when the list is filtered or ordered by «Уровень языка» (contextual column), otherwise only in the word sheet. Keep the slang meter (the feature the user likes, SPEC.md:89). |
| Origin appended to the translation (:33, :57) | на другой экран | A settings-driven extra that truncates the Russian, the thing the user is actually scanning for | Word sheet only |
| Theme name after the translation in cross-theme lists (:58) | уменьшить | Useful in search results, but it competes with the translation in the same muted line | Replace with a 3px theme-colour tick at the row's left edge (the colour already identifies the drawer) |
| «К темам» button (:358-362) | оставить | Duplicates tapping the 'Все слова' tile again / the view toggle; fine but redundant with the ledger toggle | Keep as the single way back once the ledger cell toggle is gone |
| Swipe actions «Переместить» / «Удалить» (WordList.tsx:150-174) | оставить | Hidden until swiped, so not first-paint noise |  |

**Visual opportunities:**
- Row as a dictionary line: fr (serif) + abbr on line 1, ru on line 2, and ONE right-edge glyph. A due word gets a red ink margin rule (2px, left), like a teacher's mark in the margin. Then 'К ПОВТ.' text disappears and the list is scannable by colour of margin.
- Learning state as a hand-filled ring or a dot that fills (empty → half → full ink, red outline for difficult) instead of four coloured dots (bg-warn / bg-good / bg-again), which brings it back to ink-on-paper and frees the right column.
- Alphabetical order: sticky mono letter dividers («A», «B»…) with a thin ink rule, plus a scrub strip on the right edge (dragging shows a large Newsreader letter). This makes navigating 1300 words gestural instead of «Показать ещё 200».
- Search: matched substring underlined with the red 1.5px underline used by 'Примеры из жизни' (ContextLink.tsx:17), so the eye lands on the match.
- The strike-through delete (WordList.tsx:36-41) and Collapse are already good 'paper' motion. Keep them as the model for any new row motion.

### Library — search with no match  ·  density 5/10, 12 elements

**Job:** Decide what to do with a word that is not in the library: add it (or look it up in Контекст).

**Visible at first paint:**
- Header (title, Контекст icon, gear)
- Ledger strip (5 numbers)
- Section head «Ничего не найдено»
- Muted «Такого слова нет ни во французском, ни в переводе.» (:401)
- ContextRow «Посмотреть «…» в Контексте» + subline (:404)
- Secondary button «+ Добавить «…»» (:405-407)
- Search box with the query + clear ✕ + filter button
- Tab bar

| Element | Action | Why | Where to |
|---|---|---|---|
| Ledger strip | убрать | Irrelevant to a failed search and pushes the two actions down | Hidden in listMode |
| Explanatory sentence (:401) | убрать | «Ничего не найдено» in the head already says it |  |
| «Добавить «…»» as the second action under the Контекст row | оставить | Adding is the likelier next step but sits below the Контекст row | Make «Добавить «se barrer»» the first, primary (black) button and the Контекст row second |

**Visual opportunities:**
- Show the query itself large in Newsreader italic with a dashed underline, like an empty catalog card waiting to be filled, with «Добавить» directly under it. The empty state becomes a blank index card with the word pencilled in.

### Theme page /library/[id] (phone)  ·  density 7/10, 20 elements

**Job:** Start reviewing this theme (the footer button), and secondarily browse its words.

**Visible at first paint:**
- Back arrow (Header.tsx:52-55)
- Mono eyebrow «БИБЛИОТЕКА / ТЕМА» (FolderScreen.tsx:143)
- «⋯» Ещё действия с темой (:147-151)
- H1 theme name Newsreader 32, e.g. «17 Администрация и документы» wrapping to 2 lines (:157)
- Chip «ЗАКРЕПЛЕНА» (:158) and/or «НА ПАУЗЕ» (:159)
- Mono «44 СЛОВА · 1 К ПОВТОРЕНИЮ» (red part) (:161-173)
- 2px progress bar in the theme colour (:180-189) + «4 % ВЫУЧЕНО» (:190)
- Column head «СЛОВО» … «СЛЕНГ · УР. · ПОКАЗ» over an ink rule (:196-201)
- Word rows ×about 6-7 (same 8-item row as the all-words list)
- Sticky footer: black «Повторить тему 1», or «Тренировка всей темы 44», or secondary «Вернуть в повторения» (:230-253)
- Tab bar

| Element | Action | Why | Where to |
|---|---|---|---|
| Eyebrow «Библиотека / тема» (:143) | убрать | The back arrow already says where you came from, and the H1 right below says it is a theme. It is a breadcrumb for a 2-level hierarchy. |  |
| Column head «Слово · Сленг · ур. · показ» (:196-201) | убрать | A spreadsheet header over self-explanatory rows. It exists only because the rows carry three right-side columns. | Gone once rows have one right-side signal. Keep the ink rule as the list's top edge. |
| Separate meta line «44 слова · 1 к повторению» (:161-173) + separate progress row «4 % выучено» (:177-193) | объединить | Two rows of stats. The due count is repeated a third time in the footer button «Повторить тему 1». | One row: the progress line with «44 · 4 %» in mono at its end. The due count lives only in the footer button. |
| Chips «закреплена» / «на паузе» next to the title (:158-159) | за тап | 'Закреплена' is an AI-sorting setting with no meaning while browsing | «⋯» menu (it already holds the toggle). Keep «на паузе» because it changes the footer button. |
| Rows: dot + schedule label + slang + level (see the all-words list) | объединить | Same duplication as the all-words list | Same single-signal row |
| Footer «Повторить тему N» (:241-245) | оставить | It is the primary action |  |

**Visual opportunities:**
- Header as the pulled-out drawer: the theme colour as a full-width 3px band at the very top (continuity with the tile/row spine), the name, and one mastery rule. Using the view transition, the tapped tile's band and name morph into place.
- Mastery as a 'filled ruler': instead of «4 % выучено» text, the 2px theme-colour line under the title with small tick marks every 10 words (a ruler on an index card). Count is visible as length and no number is needed.
- Due words grouped first under a short red rule labelled «к повторению», and the rest below a plain hairline. Then 'К ПОВТ.' on each row is unnecessary.
- Footer button: when the theme is fully reviewed, it can draw a single ink rule across on change (the MOTION-SPEC 'acknowledge, don't celebrate' style) rather than switching label abruptly.

### Word detail sheet (phone, full height)  ·  density 9/10, 40 elements

**Job:** Read what the word means and how it is used (translation + example), with a quick way to correct it.

**Visible at first paint:**
- Scrim + sheet with grab handle, top 56px below the safe area (Sheet.tsx:73-89,182)
- Theme chip with colour tick «Деньги ▾» (WordDetailBody.tsx:484-487)
- Close ✕ (:488)
- Red 2px index-card rule (:490)
- Headword «la thune» Newsreader 36 (:550-552) + pencil «Изменить слово и перевод» (:553)
- Grammar line: italic «n. f.» · slang meter + «arg.» · «≈B1» (:555-573)
- Russian «бабки, деньги» 18px (:574-576)
- Field «УРОВЕНЬ ЯЗЫКА»: «≈B1 · по словарю FLELex», hint «≈ B1 — оценка по словарю FLELex, точна примерно в половине случаев.» + «Изменить» link + pencil (:583-587, :895-910)
- Field «ЗАМЕТКА»: text or muted «Нет заметки» + pencil (:588-618)
- Field «ПРОИСХОЖДЕНИЕ» + pencil, when set (:619-648)
- Field «СПРЯЖЕНИЕ» (verbs): présent one-line preview, «Все формы — 4 времени», eye «Проверь себя», pencil (:649-668)
- Field «ПРИМЕР»: FR italic + RU, ✦↻ per example, «+ Ещё пример», «Примеры из жизни ›» red underline, pencil (:669-698)
- (likely below the fold) «СВОИ ПОЛЯ»: each shared field label + muted «Добавить», «+ Поле», pencil (:699-721)
- (below) «ПОВТОРЕНИЕ · 8 показов» head (:725-730), pause notice (:732), rows «FR → RU · следующий показ через 4 д · стаб. 9 д» and «RU → FR …» (:733-742)
- (below) History: 8 squares + legend «знаю / сложно / не знаю» (:1061-1101)
- (below) Actions «Сбросить прогресс — начать заново», «На паузу — не повторять», «Удалить слово» in red (:748-760)
- (below) «ДОБАВЛЕНО 12.09.2026 · СО СКРИНШОТА» (:762-764)

| Element | Action | Why | Where to |
|---|---|---|---|
| «Уровень языка» field with source caption + hint sentence + «Изменить» + pencil (:583-587, :895-910) | за тап | The level is already in the grammar line 40px above (:565-572). The field then adds 4 more items (caption, a 2-line disclaimer, a link, a pencil) about an estimate. | Make «≈B1» in the grammar line tappable: a small popover/inline row with the source + «Изменить». Remove the field. |
| A pencil on every field (:553, 1022, 719): 5-7 identical icon buttons down the right edge | объединить | A column of repeated controls. Each field is already a tap target. | Tap the field text to edit (keep the H4 ✕/✓ pair). Keep at most one «Изменить» for the headword/translation form. |
| «Нет заметки» placeholder field (:613-617) and empty «Свои поля → Добавить» rows (FieldsView :1819-1834) | за тап | Empty slots rendered as content, showing what is missing rather than what is there | One «+ Заметка / поле» row (AddFieldButton already exists) that lists the empty kinds |
| Example tools: ↻ per example + «+ Ещё пример» + «Примеры из жизни ›» (:692-697, ExampleList.tsx:113-127) | уменьшить | Three actions around one sentence | Keep ↻ on the example. Put «+ Ещё пример» and «Примеры из жизни» on one quiet line in that order, or «Примеры из жизни» only. |
| Stability column «стаб. 9 д» (:740) | убрать | FSRS internals that mean nothing to the learner |  |
| Direction rows FR→RU / RU→FR with full sentences (:733-742) | уменьшить | Two 40px rows to say 'next time in 4 days' | One mono line «следующий показ через 4 д · обратная через 1 д» under the history strip |
| History legend «знаю / сложно / не знаю» (:1085-1098) | убрать | A permanent legend for 3 square styles the user sees in review every day | (the role='img' aria-label already describes it; optional long-press on the strip) |
| Action rows «Сбросить прогресс», «На паузу», «Удалить слово» with captions (:748-760) | за тап | Three destructive or rare actions, 156px plus captions, at the end of an already long sheet | «⋯» in the sheet header next to ✕ (the theme menu pattern). Undo snackbars already exist. |
| Footer «Добавлено 12.09.2026 · со скриншота» (:762-764) | за тап | Provenance trivia | Inside the «⋯» sheet as its caption |
| Theme chip «Деньги ▾» (:484-487) | оставить | Useful, compact |  |
| Red index-card rule (:490) | оставить | The brand's signature, one line |  |

**Visual opportunities:**
- Make the sheet literally the index card: the front (headword, grammar line, translation, one example) fits in one screen, and a horizontal swipe or a 'перевернуть' tap flips to a back with notes, origin, conjugation and fields. Use the existing review 'Reveal' motion (MOTION-SPEC 5.2) so the library card and the review card feel like the same object.
- History strip as the card's 'stamps': the 8 squares become a row of small ink stamps along the bottom edge of the card (filled ink / outlined / red), with the next due date in mono beside them. That replaces the 'Повторение' section header, the two direction rows and the legend.
- Stability as an ink 'fill' of a tiny bar under the stamps (longer = more stable) instead of «стаб. 9 д» numbers, if any memory-strength cue is kept at all.
- Conjugation: the présent as a 2×3 mini grid in mono (je/tu/il · nous/vous/ils) that slides horizontally to the other tenses, a gesture instead of «Все формы — 4 времени» plus cards.
- Swipe between words: when opened from a list, horizontal drag goes to the previous/next word in that list (the desktop pane has J/K; the phone has nothing). This makes the sheet dynamic without adding chrome.

### Word detail — entry edit form (pencil on headword)  ·  density 7/10, 16 elements

**Job:** Correct the word or its translation.

**Visible at first paint:**
- Theme chip + ✕ + red rule
- Label «ФРАНЦУЗСКИЙ» + input (:495-507)
- Label «РУССКИЙ» + input with ✕ / ✓ pair inside (:508-521)
- «ВАРИАНТ» proposal + «Подставить», when present (:522, 1040-1048)
- Label «СЛЕНГ» + segmented нейтр./fam./arg./vulg. + «verl.» toggle (:523-542)
- Spark «Определить уровень и часть речи» + optional 'Часть речи: n. f.' caption (:543, 817-840)
- Label «УРОВЕНЬ ЯЗЫКА» + 7-segment A1…C2 + Авто with a dotted estimate (:952-964)
- Caption «подобрано автоматически · ≈B1 по словарю FLELex» (:980)
- Caption «Свой уровень — без «≈»; «Авто» вернёт оценку.» (:981)
- (the rest of the sheet's fields continue below)

| Element | Action | Why | Where to |
|---|---|---|---|
| Two level captions (:980-981) | убрать | Rules-of-the-UI explanations on every edit; the dotted underline already marks the estimate | Keep only the dotted underline; aria-label carries «сейчас оценка» |
| «Уровень языка» 7-segment row in the same form as fr/ru (:544) | за тап | Most edits are a typo in fr/ru. The level row adds a 36px control + 2 captions every time. | Collapsed «Уровень ≈B1 ›» row that expands the segmented control |
| Spark «Определить уровень и часть речи» (:543) | оставить | A second AI tool inside a correction form | Fine as one quiet spark line, but place it after the slang row only when slang/level is expanded |
| Proposal line «Вариант · Подставить» (:1034-1059) | оставить | Appears only when there is something; useful |  |

**Visual opportunities:**
- The slang segmented control can reuse the 4-segment meter itself as the control (tap/drag along the four 10×3 segments, with red at vulg.), which makes the meter the input instead of text buttons and keeps the brand's favourite glyph central.

### «Фильтр и порядок» sheet  ·  density 8/10, 60 elements

**Job:** Narrow the list to a subset (status / level / slang / theme) and choose the order, then show it.

**Visible at first paint:**
- Title «Фильтр и порядок» + ✕ (:103-106)
- Group «ПОКАЗАТЬ»: chips Все / К повторению 27 / Трудные 56 / Новые 1116 / (На паузе N) (:108-116)
- Group «УРОВЕНЬ ЯЗЫКА»: chips A1 142 … C2 12 + dashed «без уровня 98» (:118-134)
- Note «Считаются и оценки «≈», и уровни, которые вы указали.» (:135)
- Group «СЛЕНГ»: 5 chips with meters нейтр./fam./arg./vulg./verl. (:138-155)
- Group «ТЕМА»: Все темы, Входящие (dashed) + one chip per theme, about 35 chips over 8-10 wrapped lines (:157-165)
- (below) Group «ПОРЯДОК»: 5 radio rows (:167-186)
- Sticky footer «Сбросить» + black «Показать 687 слов» (:90-99)

| Element | Action | Why | Where to |
|---|---|---|---|
| Тема chip wall: 35+ chips (:157-165) | за тап | With a numbered course of 35 themes this group is taller than the screen and pushes «Порядок» far down. Theme is also already chosen by tapping a tile on the library screen. | One row «Тема: Все темы ›» opening the existing TargetPickerSheet (a nested list with colour squares) |
| Level note (:135, LEVEL_FILTER_NOTE) | убрать | Explains internals; does not change what the user picks |  |
| Chip counts on every chip (Показать, Уровень) | оставить | Useful for level, but 12 numbers at once is a lot | Keep; they are the only level statistics allowed (SPEC D7 C) |
| «Порядок» as 5 × 44px radio rows (:167-186) | уменьшить | 220px for a rarely-changed setting at the bottom of the sheet | A single row «Порядок: Сначала новые ›», or a compact 2-row chip group |
| «Показать» status chips | оставить | Duplicate the ledger cells; keep here if the ledger shrinks to a subline |  |

**Visual opportunities:**
- Level chips as a tiny histogram: each A1…C2 chip gets a 2px ink bar under its label proportional to its count. That shows the shape of the library at a glance and stays inside 'counts on chips' (D7 C), drawn as a rule, not a chart.
- The 'Показать 687 слов' number can cross-fade (CrossfadeText already exists, SortPlanSheet.tsx:238) on every chip tap, so the effect of a filter is felt immediately (allowed: a cross-fade, not a count-up).

### Theme actions sheet (long press on a tile / «⋯» on the theme page)  ·  density 7/10, 15 elements

**Job:** Do one thing to this theme (review it, pause it, rename it or delete it).

**Visible at first paint:**
- Title = theme name + ✕ (:46-49)
- Row «Открыть тему» (library long press only) (:53-56)
- Row «Повторить тему» + mono count (only when due) (:57-63)
- Row «Тренировка всей темы» + caption «44 слова вперемешку, не влияет на расписание.» (:66-82)
- Row «Название, описание и цвет» (:83-86)
- Toggle row «Закрепить тему» + caption «Раскладка по темам не переименует её и не будет забирать из неё слова.» (:87-101)
- Toggle row «На паузе» + caption «Слова темы останутся в библиотеке, но не будут попадать в повторения.» (:102-110)
- Row ✦ «Расформировать» + caption «Удалить тему, а слова разложить по другим темам.» (:111-127)
- Red row «Удалить тему» (:128-131)
- Footnote «Слова из удалённой темы попадут во «Входящие».» (:132)

| Element | Action | Why | Where to |
|---|---|---|---|
| «Открыть тему» (:53-56) | убрать | A tap on the tile already opens it; the long press is a deliberate request for the other actions |  |
| Captions under 4 rows (:77-79, 92-94, 107, 122-124) + footnote (:132) | убрать | 5 explanatory sentences in one menu. The snackbars after each action already say what happened, e.g. «Тема удалена · N слов во «Входящих»» (LibraryScreen.tsx:252). | Keep only the short 'не влияет на расписание' for Тренировка (it is a real difference). The others become aria-describedby-only text or disappear. |
| «Закрепить тему» toggle (:87-101) | на другой экран | An AI-sorting setting mixed in with everyday actions | Inside «Название, описание и цвет» (FolderFormSheet) as a toggle |
| «Расформировать» next to «Удалить тему» | объединить | Two delete variants side by side | «Удалить тему» opens a 2-choice confirm: «Слова во Входящие» / «✦ Разложить по другим темам» |

**Visual opportunities:**
- The long press already lifts the tile. The sheet could show the tile's colour band as its top edge, so it reads as the drawer's own label card.
- «На паузе» shown as the tile greying (ink to muted) with a diagonal hairline 'stamp' «на паузе», reusing the review's rubber-stamp idiom, instead of a caption.

### Word long-press menu + «Переместить в тему» picker  ·  density 3/10, 8 elements

**Job:** Move or delete this word without opening it.

**Visible at first paint:**
- Title = French word + ✕ (WordList.tsx:331-336)
- Row «Открыть карточку» (:339)
- Row «Переместить в тему» (:340)
- Red row «Удалить слово» (:341)
- Picker: title «Переместить в тему», subtitle the word, list of themes with colour squares + selected check

| Element | Action | Why | Where to |
|---|---|---|---|
| «Открыть карточку» (:339) | убрать | Duplicates the row tap |  |
| The menu as a whole | оставить | Duplicates the swipe actions; kept as the accessible fallback |  |

**Visual opportunities:**
- Moving: on pick, the row could slide 24px toward the right edge while collapsing (things leave the way they go), and the target theme's tile/row gets the spotlight when back on the library (L10 already).

### «Предлагаемые перемещения» (sort plan sheet, phone)  ·  density 6/10, 18 elements

**Job:** Approve (or tweak) the proposed moves and apply them.

**Visible at first paint:**
- Title «Предлагаемые перемещения» + ✕ (:248-251)
- Muted line «N слов без ручной темы» → «Слова, разложенные вручную, не трогаются (N слов).» (:394-400)
- Steps list «01 Темы ✓/ИДЁТ» and «02 Слова · 24 / 48» (:401-404)
- Sticky status line «Составляем план» / «12 перемещений · 1 новая тема» with progress (:405-414)
- Groups: «→ Деньги 3» + toggle, «новая тема» dashed chip, word rows fr + ru (+ «вручную») (:540-605)
- Skeleton blocks while loading (:455-477)
- Footer caption «Можно отменить в течение 7 дней.» (:226-228)
- Footer «Отмена» + black «Применить 10» (:229-243)

| Element | Action | Why | Where to |
|---|---|---|---|
| Steps list 01/02 once the plan is ready (:401-404) | убрать | Process scaffolding that stays after the process is over; the status line already says «План готов» | Collapse the steps when phase becomes ready (Collapse is already used for the tail) |
| Intro line about manual words (:394-400) | уменьшить | Reassurance repeated in EmptyPlan too (:484) | Merge into the status line: «12 перемещений · ручные не трогаем» |
| Footer undo-window caption (:226-228) | на другой экран | The snackbar after apply offers «Отменить»; the 7-day window is an edge fact | The «Последняя раскладка — Отменить» row / snackbar |

**Visual opportunities:**
- Groups writing in 40ms apart as they stream (already in place via arrivalStyle) is the right 'paper' dynamic. Add an arrow hairline drawn from «Входящие» to each target name as it lands (scaleX, --dur-exit) so the plan reads as movement, not a table.

## Settings · Study plan · Import · Context (phone, <768/compact)

### Settings (/settings, PhoneSettings)  ·  density 8/10, 34 elements

**Job:** Find one preference and change it. The page is visited rarely, and the only thing worth checking on a visit is the daily plan and whether sync is healthy.

**Visible at first paint:**
- back arrow (SettingsScreen.tsx:105)
- title «Настройки» Newsreader 22
- mono heading «ПОВТОРЕНИЕ» + ink rule (SettingsList.tsx:13-17)
- row «Направление по умолчанию» · mono value «FR → RU» · chevron (:109-122)
- row «План повторения» + caption «10 слов в день · до 200 повторений» · chevron (StudyPlanSettings.tsx:73-88)
- row «Кнопки оценки» · mono segmented [2|3] (:125-133)
- row «Свайпы для оценки» · toggle (:134-141)
- row «Вибрация» + caption «При оценке, свайпах и переключателях» · tertiary «Проверить» · toggle (:143-161)
- mono heading «УПРАЖНЕНИЯ» + ink rule (ExerciseFocusSection.tsx:42-46)
- label row «Чаще в упражнениях» (:48-52)
- radio «Обычно» (:54-76)
- radio «Трудные» (with ✓ when picked)
- radio «К повторению»
- radio «Трудные и к повторению»
- label «Сколько в наборе» (:79-81)
- 3-stop slider: stops + «Немного» «Половина» «Почти все» (ShareStops.tsx)
- (cut at fold) footer «Claude будет брать такие слова в упражнения — и когда просите в чате. Настройка общая для всех устройств.» (:21,45)
- tab bar: «Повторение» «Упражнения» «Добавить» «Библиотека» (active, red top rule)
- BELOW FOLD (~1900px total, about 3 screens): ОФОРМЛЕНИЕ (Тема segmented ×3, Происхождение слов + caption + toggle); ИИ (5 toggles, Вариантов 1/2/3, Регистр Сленг/Любой/Нейтр., Модель: подсказки, Модель: скриншоты, 2 footer paragraphs); СВОИ ПОЛЯ (rows + «АВТО» + chevron, «Добавить поле», footnote); ДАННЫЕ (Синхронизация + dot status, Экспорт JSON, Импорт JSON, Импорт из старой версии (HTML), Импорт из Anki, Выйти + email); InstallHint

| Element | Action | Why | Where to |
|---|---|---|---|
| Whole flat list: 7 sections and about 40 controls on one scroll (SettingsScreen.tsx:107-271) | за тап | Every setting is shown at once. The plan row already proves the index → sub-screen pattern (D1 C). | Turn Settings into an index of 6 rows with summary captions: Повторение › / Упражнения › / Оформление / ИИ › / Свои поля › / Данные ›. Each opens a sub-screen like /settings/plan does. |
| «Кнопки оценки» [2\|3], «Свайпы для оценки», «Вибрация» + caption + «Проверить» (:125-161) | на другой экран | These are set once and never touched again, yet they take first-paint space ahead of everything else. | A «Повторение ›» sub-screen together with direction and the plan. The index caption reads «FR → RU · 3 кнопки · свайпы». |
| Caption «При оценке, свайпах и переключателях» + «Проверить» button (:143-155) | уменьшить | This is a test affordance and an explanation squeezed into one row next to a toggle, so the row carries 4 elements. | Inside the sub-screen, drop the caption. «Проверить» fires once when the toggle is switched on, or stays as a quiet text link. |
| «Упражнения» section: label row «Чаще в упражнениях» + 4 radios + slider + 2-line footer (ExerciseFocusSection.tsx:42-90) | за тап | About 330px, half of the first screen, goes to a setting that only matters when Claude writes a set. The label row repeats the section title. | An «Упражнения ›» row with caption «Трудные · половина набора». On the sub-screen the label row merges into the title. |
| Upper footnote «…Настройка общая для всех устройств.» (ExerciseFocusSection.tsx:21) and the same idea on the plan (StudyPlanSettings.tsx:39) | объединить | The same reassurance is repeated on several screens. | One small sync glyph next to synced titles, or one line on the Данные sub-screen: «План и упражнения общие для всех устройств». |
| Section «ИИ»: 5 toggles + 4 segmented + 2 footer paragraphs (:187-264) | за тап | 9 controls make this the densest block. Two separate «Модель: подсказки / скриншоты» rows each take a full row. The «Точнее» explanation sits in a footer far from its control. | An «ИИ ›» sub-screen. Inside: one «Модель» row (or the two rows merged), the «Точнее» line as the caption of that row, and the privacy line once at the bottom. Index caption: «5 из 5 · быстрее». |
| «Регистр вариантов» label + segmented «Сленг/Любой/Нейтр.» (:245-252) | за тап | At 358px the label and the 3 segments compete for width and «Нейтр.» is abbreviated. | ИИ sub-screen |
| «Происхождение слов» toggle + caption «В библиотеке и на обороте карточки» (:178-184) | на другой экран | This is a display preference for the card back and has nothing to do with theme. | The «Повторение ›» sub-screen, which is about the card back. «Оформление» keeps only Тема inline. |
| «Свои поля» list + «Добавить поле» + footnote (CustomFieldsSection.tsx:94-124, :33) | за тап | This is card-schema management, not a preference, and it grows with N rows. | A «Свои поля ›» row with caption «Синонимы, Произношение» (field names). |
| Данные: «Экспорт JSON», «Импорт JSON», «Импорт из старой версии (HTML)», «Импорт из Anki» (DataSection.tsx:299-332) | за тап | These are rare file tasks. HTML import is a one-time legacy migration. Anki import is already on the import pick screen (PickView.tsx:76-89). | A «Данные ›» sub-screen. The sync status stays on the index row as a dot + «14:02». HTML import collapses into «Другие форматы ›», or is removed once the migration is done. |
| «Выйти» + mono email (DataSection.tsx:333-344) | на другой экран | This destructive action sits in the main list. | The bottom of the Данные sub-screen |
| 7 mono uppercase headings, each over a 1px ink rule (SettingsList.tsx:13-17) | уменьшить | Heavy rules every ~150px break the page into bands. | With the index there is one ink rule under the header and hairlines between rows. |
| Theme segmented «Система/Светлая/Тёмная» (:170-177) | оставить | This is the setting people actually change often, and it is buried below the fold. | Inline on the index (see the visual idea) |
| InstallHint inline (:271) | оставить | Conditional (iOS Safari, not yet installed), at the very bottom. |  |

**Visual opportunities:**
- Plan row as a small paper «day receipt»: Newsreader 26 «10» new / «200» reviews with a short drawn hairline whose ink length is the cap. It replaces the 12px muted caption and is the one live number on the screen.
- Theme picker as three tiny index-card swatches (paper, ink-on-dark, half-and-half) with an ink outline on the chosen one, instead of three text segments.
- «Кнопки оценки 2/3» as two miniature button rows drawn at the real proportions (2 blocks vs 3 blocks). The choice shows what you get.
- «Свайпы для оценки»: when switched on, a single 8px card nudge left and right (MOTION-SPEC paper motion, once, no loop) shows the gesture without a caption.
- ИИ sub-screen as a «card anatomy» drawing: a mini card back with the zones Claude fills (перевод, сленг, пример, тема, заметка) outlined. Tapping a zone toggles it (ink fill = on). This replaces 5 text toggle rows.
- Sync on the index row: a 6px square dot plus the time; while syncing, the row hairline does the existing ink run (StatusLine pattern). No text churn.

### Study plan (/settings/plan, PhoneStudyPlan)  ·  density 8/10, 30 elements

**Job:** Set how many new words come in per day (and the review cap). Everything else is an occasional tweak.

**Visible at first paint:**
- back arrow (aria «Назад к настройкам») (StudyPlanSettings.tsx:187)
- title «План повторения»
- mono line «10 СЛОВ В ДЕНЬ · ДО 200 ПОВТОРЕНИЙ» (:190-192)
- heading «ТЕМП» + ink rule (:195)
- «Новых слов в день» + caption «Меньше, если много повторений или точность падает» (wraps to 2 lines) · stepper − 10 + (:196-208)
- «Повторений в день» + caption «Остальные — на следующий день» · «до» · stepper − 200 + / ∞ (:209-226)
- heading «НОВЫЕ СЛОВА» + ink rule (:230)
- label row «Порядок» (:231-235)
- radio «По уровню языка» + caption «Сначала A1–B2, частые раньше» + ✓
- radio «По темам» + caption «01 → 35, по порядку тем»
- radio «Как добавлены» + caption «Старые сначала»
- «Новые» · segmented «Вперемешку | После повторения» (:243-253)
- heading «ОБРАТНАЯ СТОРОНА · RU → FR» + ink rule (:257)
- radio «После 3 дней узнавания» + caption «Когда FR → RU продержится 3 дня»
- radio «Назавтра» + caption «Со следующего дня, как сейчас»
- radio «Только узнавание» + caption «RU → FR не показывать»
- (at the fold) footnote «Настройка общая для всех устройств — Claude тоже её видит.» (:267)
- tab bar (4 tabs)

| Element | Action | Why | Where to |
|---|---|---|---|
| Mono summary line «10 СЛОВ В ДЕНЬ · ДО 200 ПОВТОРЕНИЙ» (:190-192) | объединить | It repeats the two stepper values printed 40px below. | Make the two numbers themselves the hero (see visual) and drop the line. |
| Caption «Меньше, если много повторений или точность падает» (:40, :199) | убрать | This is advice, not a label. It wraps to 2 lines and squeezes the stepper row. | (the «План на сегодня» sheet already explains held-back words) |
| Caption «Остальные — на следующий день» (:212) | уменьшить | It explains the cap in text; the ∞ / number already says enough. | Keep it only while the cap is set (hide it for ∞), or fold it into the «до» prefix: «до 200, остальные завтра». |
| Label row «Порядок» 40px (:231-235) | объединить | This is a third label level under heading «НОВЫЕ СЛОВА», with a hairline of its own. | Heading «НОВЫЕ СЛОВА · ПОРЯДОК» |
| Captions under all 6 radio options (:160-162; copy plan-settings.ts:18-28) | уменьшить | 6 captions mean 12 lines of text for 2 choices. | Show the caption only under the selected option. It crossfades on change (--dur-quick). |
| «Новые» segmented «Вперемешку \| После повторения» (:243-253) | за тап | The label «Новые» is vague, and the row sits between two radio groups with no heading of its own. | Keep it, but rename it «Новые в сессии» (as desktop does) and place it under the order. Or move it to the «План на сегодня» sheet where mixing is visible. |
| 3 ink-ruled headings ТЕМП / НОВЫЕ СЛОВА / ОБРАТНАЯ СТОРОНА · RU → FR (:111-120) | уменьшить | 3 heavy rules on one 650px screen. | The hero numbers need no heading. Keep two hairline sections for «Порядок» and «RU → FR». |
| Footnote «Настройка общая для всех устройств — Claude тоже её видит.» (:39, :267) | уменьшить | The same message appears on the Упражнения footer. | A small refresh/sync glyph next to the title with an aria label, or one line in Данные. |

**Visual opportunities:**
- Hero pair in Newsreader 40: «10» новых · «200» повторений, each with − / + and a mono 11 label under it. The page title becomes the number, not a list row.
- Under «Повторений в день», a hairline with ink up to the cap and a muted remainder labelled «завтра» shows the cap as a spatial cut instead of a caption.
- «Порядок» options as tiny illustrated stacks: A1→B2 level ticks, numbered theme tabs «01 02 03», a date stack. Each is drawn in 1px ink, with no colour beyond the red accent on the selected one.
- RU → FR as a 3-tick day timeline on a hairline (день 1 · 2 · 3 → RU→FR) for «После 3 дней узнавания». It changes in place for «Назавтра» (tick at day 2) and «Только узнавание» (no reverse tick).
- On a stepper change, the hero number does a plain tabular swap (no count-up, per MOTION-SPEC). The summary on the parent row updates on return.

### Import — Pick (/import idle, PickView)  ·  density 4/10, 12 elements

**Job:** Pick a screenshot (one tap).

**Visible at first paint:**
- back arrow (PickView.tsx:38)
- title «Импорт со скриншота»
- dashed box filling ~400px (flex-1, min-h 300) (:40-55)
- camera icon 28 (:46)
- «Скриншот со словами» Newsreader 22 (:47-49)
- «Переписка, пост, субтитры или список слов с переводом. Длинный скриншот разрежем на части.» (:50-52)
- mono «PNG, JPEG, WEBP · ДО 4 ФРАГМЕНТОВ» (:53)
- (conditional) red alert line (:57-62)
- primary «Выбрать скриншот» with camera icon / «Нужна сеть» (:65-67)
- (offline) muted reason (:68)
- secondary «Вставить из буфера» (when clipboard images are readable) (:69-73)
- footnote «Скриншот не сохраняется — только слова.» (:75)
- row: cards icon «Колода Anki» + «.apkg или текстовый экспорт — недостающее дополним» + chevron (:76-89)

| Element | Action | Why | Where to |
|---|---|---|---|
| Dashed drop box, ~400px, not tappable (:40-55 has no onClick) | объединить | This is a desktop drop-target metaphor. On a phone the biggest thing on screen does nothing, and the real action sits under it. | Make the whole card the «Выбрать скриншот» target (the button becomes the card's bottom edge), or shrink it to ~200px. |
| Description «Переписка, пост, субтитры…» (:50-52) | уменьшить | 3 lines of reading before the first tap. | One line: «Переписка, пост или субтитры». Drop «разрежем на части» (an implementation detail). |
| Mono «PNG, JPEG, WebP · до 4 фрагментов» (:53) | убрать | This limit only matters when it is broken, and the error already says so (ImagePrepError at ImportScreen.tsx:111,117). |  |
| Footnote «Скриншот не сохраняется — только слова.» (:75; repeated at ProcessingView.tsx:576) | оставить | A useful privacy promise, but it is said twice in a row. | Keep it here only and drop it from processing. |
| «Колода Anki» row with 2-line caption (:76-89) | уменьшить | A second import type next to the screenshot flow. It also exists in Settings → Данные. | One quiet text link «Или колода Anki ›» with no caption and no icon. |
| «Вставить из буфера» secondary (:69-73) | оставить | It is only useful when an image is on the clipboard. | Optional: show it only when clipboard.read reports an image (future). |

**Visual opportunities:**
- Replace the dashed box with a drawn paper index card holding a ghost phone screenshot: 3 grey chat bubbles with one word underlined in red ink, and a hairline arrow to a tiny card stack. The card shows the job without words, and the whole card is tappable.
- On paste or drop, the ghost bubble fills with the real thumbnail and the card slides into the processing layout's thumbnail slot. This is a shared-element move in --dur-move, so pick and processing read as one surface.
- The press state of the card follows MOTION-SPEC §5.1: .96 scale and a surface-2 tint.

### Import — Processing (running / stopped / error / waiting / empty, ProcessingView)  ·  density 7/10, 24 elements

**Job:** Watch the words arrive, and stop if needed.

**Visible at first paint:**
- back arrow + «Импорт со скриншота» (ProcessingView.tsx:521)
- thumbnail 120×220 with red scan line + paper veil, «1/N» badge (:306-319)
- title «Распознаём слова…» / «Готовим скриншот…» / «Остановлено» / «Не получилось» (:339)
- sub «Скриншот · 2 фрагмента» (:340)
- 1px progress bar with 5px tick (:341, ImportBar :255-280)
- steps: «01 Читаем скриншот ✓» «02 Слова, перевод и уровень · ИДЁТ» «03 Проверка повторов» (:342-346)
- status line «НАЙДЕНО 3» + elapsed «0:04» (:526-533)
- «НАЙДЕНО» ink-rule heading + «ПО МЕРЕ РАСПОЗНАВАНИЯ» (:539-542)
- ~5 rows: FR Newsreader 19 · RU 14 muted · slang meter (:544-554)
- fading skeleton stack ×4 (:555-559)
- (error/empty) notice with rule + title + message (:535-536, :380-406)
- sticky footer: (stopped/error) primary «Дальше с 3 словами» / «Повторить» (:567-571)
- «Стоп» / «Повторить» / «Выбрать другой скриншот» (:573-575)
- footnote «Скриншот не сохраняется — только слова.» (:576)

| Element | Action | Why | Where to |
|---|---|---|---|
| Progress said 5 ways: scan line, ImportBar, 3-step list, title «Распознаём слова…», status line count (:311,:339-346,:526) | объединить | One wait is shown by five indicators. The steps alone are 84px of text. | Keep the scan line over the thumbnail (it already sits at the bar's %, :311) as the progress, plus one status line «ЧИТАЕМ СКРИНШОТ» → «НАЙДЕНО 3». Remove ImportBar and the step list. The current step name can live in the status text. A failure writes «НЕ УДАЛОСЬ» on the status line. |
| Sub «Скриншот · 2 фрагмента» (:302,:340) | убрать | An implementation detail (tiles). | Keep the «1/N» badge on the thumbnail for several screenshots. |
| Heading «НАЙДЕНО» + «ПО МЕРЕ РАСПОЗНАВАНИЯ» (:539-542) | убрать | It repeats the status line «НАЙДЕНО 3» directly above it. |  |
| Footnote «Скриншот не сохраняется — только слова.» (:576) | убрать | Already said on the pick screen. |  |
| Thumbnail 120×220 + text column (:319-348) | уменьшить | A third of the screen goes to a status block, leaving room for about 5 arriving rows. | Thumbnail 72×128 with the scan line, title and status beside it. About 2 more rows fit. |
| Skeleton stack ×4 (:555-559) | оставить | It is the 'more coming' signal and is fine. |  |

**Visual opportunities:**
- The scan line becomes the only progress: as rows arrive, a short red tick appears on the thumbnail's right edge at the line's height. Each found word leaves a mark where it was read, a paper-and-ink 'tally'.
- Arriving rows could write in from the thumbnail side (4px x-offset plus fade, --dur-enter) so words visibly 'come out of' the screenshot.
- Stopped state: the scan line freezes in muted ink and the veil stays. That alone says 'stopped here' without a «СТОП» label.

### Import — Review («Найдено N слов», ReviewView + ImportRowItem)  ·  density 8/10, 40 elements

**Job:** Check the found words and add them, usually with one tap on «Добавить N слов».

**Visible at first paint:**
- back arrow + title «Найдено 9 слов» + «Выбрать все» / «Снять все» (ReviewView.tsx:145-159)
- full ShotSummary kept from processing: 220px thumbnail (tappable → gallery), «Готово», «Скриншот · 2 фрагмента», full bar, steps 01 ✓ 02 ✓ 03 ✓ (:167)
- status line «НАЙДЕНО 9 СЛОВ» (+ «✦ Распознать заново» if incomplete) (:172-184)
- mono «ОТМЕЧЕНО 5 ИЗ 9» · «УРОВЕНЬ · ТЕМА» over ink rule (:186-191)
- rows ×~5: checkbox · FR serif 19 · RU 14 (italic if guessed) · «ДОГАДКА» tag · (opt.) italic example line · (opt.) «+N полей» · slang meter · «ТЕМА: ЭМОЦИИ ⌄» (ImportRowItem.tsx:196-226)
- (warn row) amber dashed box + «⚠ Перевод под вопросом» + «Проверить» link (:157-188)
- (dup row) greyed FR + «УЖЕ ЕСТЬ» tag + «ТЕМА: …» (:210-221)
- sticky footer: «Тема для всех ⌄» chip + primary «Добавить 5 слов» (ReviewView.tsx:217-242)

| Element | Action | Why | Where to |
|---|---|---|---|
| Completed ShotSummary (220px, 3 ✓ steps, full bar) kept in the review (:167; MOTION-SPEC I3 'same top') | уменьшить | About 260px of finished progress pushes the word list to ~5 rows. The old screenshot and the Import-Review board both use a 44px «Скриншот ›» strip. | After the I3 hold (--dur-done-hold), collapse it in --dur-move to a 44px strip: 32×44 thumb + «Скриншот ›» (opens the gallery). This needs a one-line change to MOTION-SPEC I3. |
| Status line «НАЙДЕНО 9 СЛОВ» (:172-173) | убрать | It repeats the header title word for word. | Keep it only when incomplete («Распознано не всё · Распознать заново»). |
| «ОТМЕЧЕНО 5 ИЗ 9» (:187-189) | объединить | The same count is in the footer button «Добавить 5 слов». | Footer button only |
| Column legend «УРОВЕНЬ · ТЕМА» (:190) | убрать | A table legend for 2 self-evident columns. |  |
| «ТЕМА:» prefix on every row (ImportRowItem.tsx:94) | убрать | The same word is repeated on every row, and the mono uppercase gets truncated at 150px. | Show only the theme name with a chevron, or group rows under theme headings (see visual). |
| Italic example line under RU (:148-152) and «+N полей» (:153) | за тап | Up to 2 extra lines per row (row height 56 → 76+). This is detail you check only when editing. | The RowEditor (tap on the row) |
| «ДОГАДКА» tag next to italic RU (:138) | уменьшить | The italic RU already marks a guessed translation, so the meaning is encoded twice. | Keep only the italic plus one legend line, or keep the tag only on the first guessed row (SPEC.md:142 asks for the tag, so this needs a spec change). |
| Warn row: amber box + alert line + «Проверить» link (:157-188) | оставить | Justified: it is the one row that needs attention. |  |
| «Выбрать все» in the header (:148-158) | оставить | Rarely needed, because rows arrive checked. |  |
| «Тема для всех ⌄» chip in footer (:226-238) | оставить | A secondary bulk action next to the primary. |  |

**Visual opportunities:**
- Group rows by proposed theme (as Sort-Plan does): «→ Эмоции 3», «→ Еда 1». The per-row theme label disappears, and changing a group's theme is one tap on its heading.
- The «Добавить N слов» commit can do the I7 spotlight in reverse: checked rows slide 4px toward the footer and fade, then the library lights the themes (already spec'd). No per-row confetti.
- Duplicates («УЖЕ ЕСТЬ») drawn as a stamped-over row: FR struck through with a single muted hairline. This replaces the tag and the greyed checkbox.
- The collapsed 44px screenshot strip keeps the scan-line ticks from processing, so you can see where each word was read.

### Import — Anki setup (AnkiSetupView)  ·  density 6/10, 12 elements

**Job:** Confirm which decks to bring in and start enriching.

**Visible at first paint:**
- back arrow + «Импорт из Anki» (AnkiViews.tsx:48)
- mono file name (:52)
- deck checklist (CheckMark · deck name serif 17 · count) or single deck «Name · 240 карточек» (:164-196)
- status line «К дополнению 240 · уже есть 12» (:198)
- (if >300) «За раз — до 300. Остальные N добавятся при следующем импорте этой же колоды.» (:199-203)
- «Перенести прогресс из Anki» + caption «Интервалы и сроки повторений сохранятся.» + toggle (:205-218)
- (offline) reason (:220)
- footnote «Переводы, примеры, уровень сленга и темы дополним сами — перед добавлением всё можно проверить. Аудио и картинки не переносятся.» (:21, :221)
- sticky bar: primary «✦ Дополнить 240 карточек» + secondary «Другой файл» (:142-162)

| Element | Action | Why | Where to |
|---|---|---|---|
| Footnote ANKI_FOOTNOTE (3 lines, :21) | уменьшить | A long paragraph under the controls. | «Аудио и картинки не переносятся» is the only fact the user can't infer. Keep just that line. |
| Mono file name (:52) when a single deck name is shown below | объединить | Two names for one thing. | Show the file name only when it differs from the deck name, or only under the deck list. |
| Carry caption that changes with the toggle (:212-214) | оставить | Helpful, but it doubles the row height. |  |
| Secondary «Другой файл» in the bottom bar (:158-160) | уменьшить | A rare action that takes a full-width button. | A tertiary text button, or the header back arrow covers it. |

**Visual opportunities:**
- Deck counts as a stacked-card glyph whose height scales with the count (1px per ~20 cards, capped). Known words are shown as a muted lower slice: «уже есть».
- The carry-progress toggle could preview a tiny interval rule (dots for scheduled days) that turns into a single 'new' dot when switched off.

### Import — Anki progress (AnkiProgressView)  ·  density 3/10, 7 elements

**Job:** Wait for the enrichment to finish (or stop it).

**Visible at first paint:**
- back arrow + «Импорт из Anki»
- mono deck title (:248)
- status line «ДОПОЛНЯЕМ КАРТОЧКИ 24 / 240» with determinate ink bar (:290-297)
- (error) alert (:298-302)
- skeleton rows ×5 with meters (:303)
- sticky bar: «Стоп» | «Дальше с N словами» + «Начать заново» | «Повторить» + «Другой файл» (:262-287)

| Element | Action | Why | Where to |
|---|---|---|---|
| 5 skeleton rows (:303) | уменьшить | They hint at rows that never stream in on this screen (the review appears all at once). | 2 rows, or show real enriched rows as they arrive (like screenshot import). |

**Visual opportunities:**
- Show the real cards being filled: each finished note writes in as a 56px row (FR + RU + meter), as the screenshot stream does, so the wait has content.
- A drawn card stack that moves cards one by one from a muted 'Anki' pile to an ink 'Карточки' pile in step with done/total. It is driven by real events, with no fake motion.

### Context — home (/context, no query)  ·  density 7/10, 42 elements

**Job:** Type a word and look it up (or reopen a recent one).

**Visible at first paint:**
- back arrow + mono eyebrow «БИБЛИОТЕКА» (ContextScreen.tsx:264)
- H1 «Контекст» Newsreader 32 (:279)
- subtitle «Как слово звучит в живой речи — примеры, синонимы, спряжение.» (:280)
- search field 48px, ink border, «Слово или фраза, FR или RU», direction tag «FR → RU», × clear (parts.tsx:59-140)
- (offline) «Открываются прошлые запросы — они сохранены на телефоне.» (parts.tsx:137)
- «НЕДАВНИЕ» heading + «Очистить» over ink rule (parts.tsx:871-882)
- ~7 history rows of 60px: FR serif 19 · slang meter · RU 14 · mono «5 ПРИМ.» · × (parts.tsx:884-923)
- (below 20 history rows) «Из твоих карточек без примеров» + 6 word chips (parts.tsx:931-951)
- tab bar (Библиотека active)

| Element | Action | Why | Where to |
|---|---|---|---|
| Eyebrow «Библиотека» + H1 «Контекст» + subtitle (ContextScreen.tsx:264,267,276-283) | объединить | Three header levels sit above the search field. The subtitle is marketing copy that is useful only on the first visit. | One header: back arrow + title «Контекст» (Newsreader 22). Show the subtitle only while the history is empty. |
| Mono «5 прим.» / «без прим.» on each history row (parts.tsx:909; data.ts:203-208) | убрать | The example count of a past query doesn't affect the decision to reopen it. |  |
| × delete on every history row (parts.tsx:911-921) | за тап | 7 small destructive buttons in the thumb zone. | Swipe-left to remove, or long press (the house row pattern), with the same undo snackbar. |
| «Очистить» in the history heading (parts.tsx:875-881) | за тап | A rare destructive action at the top of the list. | The end of the list: «Очистить историю» as a quiet row after the last item. |
| History cap 20 rows (ContextScreen.tsx:67) | уменьшить | It pushes «Из твоих карточек без примеров», the screen's only discovery block, below 1200px. | Show 5 + «Ещё 15 ›». Put the chips right under the 5 rows. |
| Slang meter on each history row (parts.tsx:905) | оставить | Small, and it adds visual rhythm. |  |
| Copy «Из твоих карточек…» uses «ты», while the rest of the app uses «вы» («Проверьте», «Подключитесь») | оставить | Inconsistent voice. | Rename it «Ваши слова без примеров». |

**Visual opportunities:**
- Empty-history state: instead of the subtitle, a single drawn index card with a sample word «kiffer» underlined in red inside a sentence. Tapping it runs the lookup, which demonstrates the screen.
- Words-without-examples chips could sit on a hairline 'shelf' as small paper tabs, so the block reads as an invitation rather than a list.

### Context — word result (/context?q=…, found)  ·  density 8/10, 45 elements

**Job:** See what the word means and how it is really used (translations + live sentences), then save it.

**Visible at first paint:**
- back arrow + mono eyebrow «КОНТЕКСТ» (ContextScreen.tsx:262)
- search field 44px with the query, «FR → RU», × (parts.tsx:59-140)
- white index card with 2px red top rule (ContextScreen.tsx:419-420)
- headword Newsreader 40 (:421-423)
- meta line: pos abbr «v. tr.» · «·» · slang meter + label (parts.tsx:146-160)
- (opt.) note 14 muted (parts.tsx:161)
- translations ×3–5: RU 16 · 3px share bar · mono «38%» (parts.tsx:167-183)
- «СЛОВО ПО ЧАСТЯМ» label, parts «volonté + -aire «относящийся к …»», origin line, «ОДНОКОРЕННЫЕ» label + up to 8 word chips (parts.tsx:189-259)
- «В библиотеке · Эмоции ›» row or secondary «+ В карточки» (parts.tsx:268-309)
- (fold, about here) «Как говорят» Newsreader 22 + mono «12 ПРИМЕРОВ» over ink rule (ContextScreen.tsx:431)
- BELOW FOLD: meaning chips row «Все · 12», «тащиться 38%»… (parts.tsx:388-420); example items, each «≈ meaning» tag · FR serif 18 with red underline · RU · «ФОРУМ · domain ↗» · «+ В карточку» (parts.tsx:464-478); Tatoeba credit; «✦ Искать ещё в вебе» + «форумы, песни, субтитры · 10–20 с» (parts.tsx:529-539); «Искать заново» (ContextScreen.tsx:368-372); «Похожие слова · по регистру» columns + helper text (parts.tsx:654-712); «Спряжение · 4 времени ⌄» + présent preview + eye button (parts.tsx:782-820)

| Element | Action | Why | Where to |
|---|---|---|---|
| «Слово по частям» block with «Однокоренные» chips inside the card (parts.tsx:189-259) | за тап | Etymology takes up to ~200px inside the hero card and pushes «Как говорят», the screen's reason to exist, below the fold. | A collapsed one-line row in the card: «Слово по частям · volonté + -aire ⌄». It opens in place (Collapse). The chips go inside. |
| Per-translation percentage «38%» (parts.tsx:178) | убрать | The bar already encodes the share. The number repeats on the meaning chips «тащиться 38%» (parts.tsx:414). | Keep the bars. The chips carry the number once. |
| Per-example source line «ФОРУМ · domain ↗» (parts.tsx:473, SourceLink :370-385) | за тап | Every sentence gets a third line plus a button row, so each example is 5 elements. | The ExampleSheet, which already shows the source and add (ExampleSheet.tsx:110-119). |
| Per-example «+ В карточку» button (parts.tsx:442-455, :474) | за тап | The button repeats on every row. Its target sheet already holds «Добавить» and copy. | Make the whole example row tappable to open the ExampleSheet. Show a ✓ only when the example is already in the card. |
| «≈ meaning» tag above each sentence (parts.tsx:458-461) | уменьшить | It repeats the active meaning chip once a chip is selected. | Show it only while «Все» is selected. |
| WebMore: large secondary button + meta «форумы, песни, субтитры · 10–20 с» (parts.tsx:529-539) | уменьшить | A full-width lg button for an optional paid search after the list. | A quiet ruled row «✦ Ещё из веба · 10–20 с ›». |
| «Искать заново» tertiary (ContextScreen.tsx:368-372) | за тап | A rare refresh action. | The overflow of the «Как говорят» heading, or pull-to-refresh. |
| SynonymScale helper «Нажми на слово — откроется в Контексте. «+» — сразу в карточки.» (parts.tsx:709) | убрать | Instruction text for an obvious affordance, and it uses «ты». |  |
| ExamplesWait note «Перевод и синонимы уже готовы — можно смотреть, пока ищем живые примеры.» (parts.tsx:518-520) | убрать | It explains what the user can already see. |  |
| Eyebrow «КОНТЕКСТ» + search field both above the card (ContextScreen.tsx:262,268) | оставить | The field is needed. The eyebrow says nothing the field doesn't. | Optional: drop the eyebrow and put the back arrow inline with the field. |
| Index card with red rule, headword 40, meta, translations, «В библиотеке / + В карточки» | оставить | This is the hero. |  |
| «Спряжение» collapsed with preview + quiz eye (parts.tsx:782-820) | оставить | Already behind a tap. |  |

**Visual opportunities:**
- Translations as one stacked share rule: a single 3px bar split into ink segments of decreasing weight, each labelled once above it. This replaces N bar rows plus %, and tapping a segment equals tapping its meaning chip.
- Examples as a horizontally swipeable deck of paper slips (one sentence per slip, red underline on the form, RU under it), with a mono «3 / 12» counter. Swiping is the 'dynamic' gesture the user asks for, and the vertical scroll shrinks dramatically.
- «Похожие слова» register scale drawn as one horizontal hairline from нейтр. to vulg. with words hung at their positions (vulg end in red). This is spatial rather than 2–3 columns of buttons.
- The headword card's red top rule could draw left to right once on arrival (--dur-move, the 'rule draw' token already in MOTION-SPEC §2.2) as the only arrival motion.

### Context — waiting / empty / not found / error states  ·  density 5/10, 14 elements

**Job:** Understand that nothing (yet) came back and take the one next step.

**Visible at first paint:**
- LookupWait: status line «ИЩЕМ СЛОВО» (+ «повтор через N с») + card with red rule + 3 skeleton rows (parts.tsx:312-322)
- ExamplesWait: status line «ИЩЕМ ПРИМЕРЫ В ВЕБЕ» + 3 skeleton blocks 96px + note + «Остановить поиск» (:502-526)
- ExamplesEmpty: dashed card, «В Tatoeba примеров нет» serif 20, 3-line explanation, primary «✦ Искать в вебе», secondary «✦ Подобрать пример» (:588-637)
- NotFound: ink rule, «Не нашли такого слова», 2-line hint (:341-352)
- LookupError: red alert + «Повторить» (:324-338)

| Element | Action | Why | Where to |
|---|---|---|---|
| ExamplesEmpty explanation paragraph (parts.tsx:607-611) | уменьшить | 3 lines that describe the two buttons below them. | One line: «Живых фраз пока нет». The buttons speak for themselves («Подобрать пример» keeps the «помечен как придуманный» promise as its caption). |
| Two ✦ buttons in the empty state (:612-629) | оставить | Two equal-weight AI calls side by side. | Already primary and secondary. That's fine. |
| ExamplesWait note (:518-520) | убрать | See the result screen. |  |

**Visual opportunities:**
- Empty examples: an empty paper slip with dashed ruled lines (like a blank index card) instead of a dashed box with a paragraph. The 'Подобрать пример' result then writes into that slip, marked «придуман».

### Sort plan sheet (phone, SortPlanSheet; board Sort-Plan)  ·  density 6/10, 20 elements

**Job:** Glance at the proposed moves and press «Применить».

**Visible at first paint:**
- title «Предлагаемые перемещения» + × (SortPlanSheet.tsx:248-251)
- subline «Слова, разложенные вручную, не трогаются (64 слова).» (:394-400)
- steps «01 Темы ✓», «02 Слова · 48 / 48 ✓» (:401-404)
- sticky status line «12 ПЕРЕМЕЩЕНИЙ · 1 НОВАЯ ТЕМА» with full bar (:405-414)
- groups: «→ Деньги» serif 19 + mono «3» + toggle; dashed «новая тема» tag; (tooSmall) note (:545-583)
- move rows 44px: FR serif 17 · RU 13 · (opt.) «вручную» (:584-604)
- footer: «Можно отменить в течение 7 дней.» + «Отмена» + «Применить 10» (:219-246)

| Element | Action | Why | Where to |
|---|---|---|---|
| Finished step list 01/02 kept after the plan is ready (:401-404) | убрать | Done progress keeps 56px under the title, the same pattern as the import review. | Collapse it when phase=ready. The sticky status line already turns into the result. |
| Subline «Слова, разложенные вручную, не трогаются (N слов).» (:394-400) | уменьшить | Reassurance, and it is also repeated in EmptyPlan (:484). | Fold it into the status line: «12 ПЕРЕМЕЩЕНИЙ · 64 ВРУЧНУЮ НЕ ТРОГАЕМ». |
| Footer note «Можно отменить в течение 7 дней.» (:226-228) | оставить | Builds trust before a bulk move. |  |
| Per-row «вручную» mark (:600) | оставить | Shown only on retargeted rows. |  |

**Visual opportunities:**
- Each group heading shows from → to as two small theme tabs joined by a drawn hairline arrow («Входящие —→ Деньги»), since phones currently lose the «Откуда» the desktop ledger has.
- After «Применить», the group blocks fold up one after another into their theme tile (row-move token §5.10) before the sheet closes, so the user sees the words being filed.

### Settings → «Свои поля» field editor sheet (FieldDefSheet, phone)  ·  density 6/10, 13 elements

**Job:** Name a field (and say what goes in it).

**Visible at first paint:**
- title «Новое поле» / «Изменить поле» + × (:390-393)
- label «НАЗВАНИЕ» + 48px input «Например, Синонимы» (:395-403)
- label «ЧТО ПИСАТЬ» + 2-row textarea «Например: 2–3 синонима на французском» (:405-411)
- note «Подсказка для автоматического заполнения и для вас.» (:323-327)
- row «Заполнять автоматически» + caption «При добавлении слова и в «Дополнить карточки»» + toggle (:414-422)
- (edit) «Место в списке 2 из 3» + ↑ ↓ (:424-442)
- primary «Сохранить» (:444-446)
- (edit) danger «Удалить поле» + note «Уже заполненные значения останутся на карточках как разовые поля.» (:447-454)

| Element | Action | Why | Where to |
|---|---|---|---|
| Hint note under the textarea (:323-327) | убрать | The placeholder already shows what to write. |  |
| Auto-fill caption «При добавлении слова и в «Дополнить карточки»» (:37, :419) | уменьшить | Implementation detail of when the fill runs. | Drop it, or show it only while the toggle is on. |
| «Место в списке N из M» + ↑ ↓ inside the sheet (:424-442) | на другой экран | Reordering inside an edit form is an unusual place for it. | Long-press-drag on the list rows in the «Свои поля» sub-screen. |
| Delete note (:452) | оставить | Useful reassurance at the moment of deletion. | Or move it into the undo snackbar text. |

**Visual opportunities:**
- A live preview strip at the top of the sheet: the card back's «СВОИ ПОЛЯ» block with the field being typed appearing as a label/value row (value = the hint in muted italic). It replaces the explanatory notes.

## Shell & shared UI (mobile, compact layout < 768px; note: 768–1023 already gets the desktop Rail via useLayoutClass, lib/

### Phone shell frame (every tab route): AppShell + (app)/layout + TabBar  ·  density 3/10, 10 elements

**Job:** Switch between the four places (and open quick-add) without ever competing with the screen's own content.

**Visible at first paint:**
- (page content in a centred 440px column, layout.tsx:16)
- 1px rule top edge of the tab bar (TabBar.tsx:121 border-t border-rule)
- 2px red marker over the active column (TabBar.tsx:68-77)
- icon «cards» 20px + label «Повторение» (TabBar.tsx:124)
- icon «exercise» + label «Упражнения» (TabBar.tsx:125-132)
- icon «plus» + label «Добавить» (button opening the add sheet, TabBar.tsx:133-142)
- icon «library» + label «Библиотека» (TabBar.tsx:143-150)
- home-indicator padding under the bar (env(safe-area-inset-bottom))

| Element | Action | Why | Where to |
|---|---|---|---|
| Sidebar, Rail, RevealButton, ShortcutsDialog, GlobalKeys, PendingTick, ActiveBar, DropLight | оставить | Desktop-only; on phones they are hidden (Sidebar.tsx:148 `hidden xl:flex`, Rail.tsx:134 `hidden md:flex`, AppShell.tsx:28 `hidden`), and useShellData skips loading on compact (NavParts.tsx:11-14). Zero visible cost on a phone. |  |
| Tab bar total height 61px + ~34px home indicator ≈ 95px of 844 (11%), TabBar.tsx:54, :58 h-[60px] | уменьшить | Constant chrome on the review screen, where the card + Показать ответ are the whole job; it pushes the card up and makes the screen feel stacked (screenshot review-front.png: header + chips + status + card + button + bar). | Keep icon+label (platform guidance: labelled tabs, never hide tab items), but tighten to 52px item height with gap-0.5 and 11px labels; optional focus mode: during an active review session (after the first grade) the bar sinks 8px and fades its labels to icons-only, returning on any tap outside the card or at Session-Done. |
| Labels «Повторение / Упражнения / Добавить / Библиотека» at 12px | оставить | Not noise: four destinations, Cyrillic words, no badges (SPEC.md:95-99 forbids dots/counts). Removing labels hurts recognisability of «exercise» vs «cards» glyphs. |  |
| «Добавить» rendered identically to a tab but is an action (TabBar.tsx:133-142) | оставить | Same weight as the destinations, yet it never becomes active; nothing tells the eye it opens a sheet. | Keep the same row (SPEC forbids a floating circle), but give the sheet a spatial link to it: the add sheet rises from the «Добавить» column (see visual opportunities). |

**Visual opportunities:**
- Sheet-from-tab: when «Добавить» is tapped, the 2px red marker slides to column 3 and stretches into the sheet's top red rule as the sheet rises (marker translateX over --dur-move, then scaleX to full width; the sheet's existing border-t border-ink becomes red for --dur-sheet then settles to ink). One continuous ink line instead of a disconnected pop-up.
- The tab icons are 1.5px line glyphs; the active one could switch to a 2px stroke (ink weight change, no fill) in --dur-quick, reinforcing the red marker without adding colour.
- Pending state on phone: reuse PendingTick (NavParts.tsx:42-52) as a 2px ink tick under the tapped label after --link-pending-delay, so slow navigations read as 'ink drying' instead of a frozen tap.

### Sub-screen Header (Settings, Folder/тема, Context, Import, План повторения)  ·  density 4/10, 5 elements

**Job:** Say where you are and get you back, in one 44px row.

**Visible at first paint:**
- 16px top gap (Header.tsx:73 mt-4)
- 44×44 back arrow (Header.tsx:31-32, :47)
- title Newsreader 22 («Настройки», «План повторения», «Импорт со скриншота») OR mono uppercase eyebrow («БИБЛИОТЕКА / ТЕМА», «БИБЛИОТЕКА», «КОНТЕКСТ») (Header.tsx:76-79)
- right actions: 44px icon buttons (e.g. «Ещё действия с темой» ⋯, FolderScreen.tsx:147-151)
- Folder only, below the header: h1 32px theme name + «закреплена»/«на паузе» outlined mono tags + mono line «42 СЛОВА · 6 К ПОВТОРЕНИЮ» (FolderScreen.tsx:156-172)

| Element | Action | Why | Where to |
|---|---|---|---|
| Eyebrow «Библиотека / тема» on the theme screen (FolderScreen.tsx:143) | убрать | Describes the breadcrumb while a 32px h1 with the theme name sits right under it and the back arrow already means 'to Library'. Three signals for one fact. | Empty header row (back + ⋯); when the h1 scrolls under the header, the theme name fades into the header row as a 17px serif title (large-title collapse). |
| Eyebrow «Библиотека» on Context home (ContextScreen.tsx:264) | убрать | Labels the back destination, which backLabel already announces; reads as a second, wrong title for the Context screen. | Use title «Контекст» (or nothing, if Intro already names it). |
| «закреплена» / «на паузе» outlined mono tags next to the h1 (FolderScreen.tsx:158-159) | уменьшить | Status chips next to a title add a second visual line of metadata at first paint; pinned state rarely matters while reading the theme. | «на паузе» stays (it changes behaviour) as italic serif abbr «пауза» in muted; «закреплена» moves behind ⋯ (it is already a toggle in FolderMenuSheet). |
| Mono stats line under the folder h1 (FolderScreen.tsx:161-172) | объединить | Fine on its own, but together with the progress row below it the top of the screen has three meta rows before the first word. | Merge count + due into the progress line itself (number at the line's end), one row instead of two. |
| 16px mt-4 above every header (Header.tsx:73) | оставить | Matches SPEC safe-area rule (SPEC.md:65). |  |

**Visual opportunities:**
- Large-title collapse in paper terms: the Newsreader title lives in the content; on scroll it slides up and shrinks into the header row while a 1px hairline draws in under the header (rule-draw keyframe already exists, globals.css:323-327). No blur, no shadow — the hairline is the 'edge of the paper'.
- Header hairline only when content is scrolled underneath (none at rest) — removes one permanent rule from every screen.
- Back navigation already slides 24px (globals.css:533-583); the header title could cross-fade with the destination's title so the breadcrumb is shown by motion rather than by an eyebrow label.

### Bottom sheet — action / picker sheet (auto height): e.g. FolderMenuSheet, LedgerMenuSheet, DirectionSheet, FolderPickerSheet  ·  density 6/10, 12 elements

**Job:** Pick one action or option and get back to the screen underneath.

**Visible at first paint:**
- scrim rgba(17,17,17,.4) over the page (Sheet.tsx:167)
- sheet top: 12px radius, 1px ink top rule (Sheet.tsx:178)
- grab handle 36×4 (Sheet.tsx:182)
- title row 44px: Newsreader 22 SheetTitle (Sheet.tsx:300-306) + 44px close X (Sheet.tsx:309-315)
- section label mono uppercase with ink underline, e.g. «МОИ НАБОРЫ», «ТЕМЫ» (FolderPickerSheet.tsx:114, :155)
- 52px rows each with an 18px icon + label + mono count (FolderMenuSheet.tsx:15, :55-66)
- row helper line «N слов вперемешку, не влияет на расписание.» (FolderMenuSheet.tsx:76-79)
- toggle rows (pin / pause) with captions

| Element | Action | Why | Where to |
|---|---|---|---|
| Close X in the title row (SheetCloseButton, Sheet.tsx:309-315) on auto-height sheets | уменьшить | Three other ways to close are visible/natural: the grab handle, the scrim, a downward drag. The X adds a second focal point opposite the title. | Keep it on full-height sheets (where the scrim is only a 56px strip, Sheet.tsx:74) and in DialogSheet; on auto sheets render it visually hidden but focusable (sr-only until :focus-visible) so VoiceOver/keyboard users still have it. |
| Leading 18px icons on every action row (FolderMenuSheet.tsx:56, :62, :74) | убрать | Icons repeat what the Russian verb says («Открыть тему» + chevron, «Повторить тему» + cards); in a list of 6–8 rows they become a column of glyph noise. | Text-only rows; keep an icon only where it is the meaning (destructive «Удалить» in --again colour needs no icon either). |
| Helper captions under rows («вперемешку, не влияет на расписание.») | за тап | Explains a rule every time the sheet opens; after the first use it is just grey text. | Show the caption only the first N times (per-device flag) or replace with an italic abbr-style tail «— без расписания» on the same line. |
| Mono uppercase section labels with ink underline (FolderPickerSheet.tsx:114, :155) | уменьшить | Needed when a sheet has two groups; but the ink underline + uppercase + mono is a heavy divider for a 2-section list. | Drop the border-b border-ink; a 1px rule line between groups is enough. |
| Grab handle (Sheet.tsx:182) | оставить | Affordance for the drag; minimal. |  |

**Visual opportunities:**
- Sheets currently open on --spring-settle 380ms (globals.css:505-518). Add one paper detail: the 1px ink top rule draws left→right as the sheet lands (rule-draw, 400ms linear), echoing the index-card header rule, instead of an ever-present heavier X/title row.
- For pickers (FolderPickerSheet), the selected row could be marked by the same 2px red side bar used on desktop (ActiveBar, NavParts.tsx:27-34) instead of a checkmark + bold + count — one ink mark.
- Rows could drop in with a 4px enter-rise staggered 20ms (enter-rise keyframe, globals.css:265-270) the first time a sheet opens in a session — a quiet sense of cards being dealt; reduced motion = fade only.

### Bottom sheet — large/full with sticky footer and keyboard (quick add, word detail, sort plan, filter sheet)  ·  density 7/10, 8 elements

**Job:** Do one focused task (add a word, edit a card, apply a plan) with the keyboard up and the commit button always reachable.

**Visible at first paint:**
- dimmed underlying screen (still showing the review header, chips, counters: add-empty.png top 370px)
- handle
- custom header (e.g. add sheet: «КАРТОЧКА № 012» mono + X, «Новое слово» + «Скриншот» + «Список» buttons, red rule) passed via `header` (Sheet.tsx:185)
- scrolling body (Sheet.tsx:186-194)
- snackbar slot above the footer (Sheet.tsx:195-203)
- footer with 1px top rule and primary/secondary buttons (Sheet.tsx:204-213)

| Element | Action | Why | Where to |
|---|---|---|---|
| Height 'large' = 78% leaves the busy review header visible behind the scrim (Sheet.tsx:157; add-empty.png) | уменьшить | The top 22% of the phone shows dimmed chips, counters and the progress line — information that has nothing to do with adding a word. | Either go 'full' (56px gap) for quick-add, or deepen the scrim on large sheets so the page reads as paper texture only (e.g. --scrim .55 light); alternatively slightly scale the page behind (vaul shouldScaleBackground) — no blur. |
| Header packing 5 items in 2 rows (mono card number, X, title, two secondary buttons) in add/parts.tsx via Sheet `header` | за тап | Card number «№ 012» is decorative metadata; two outlined buttons compete with the input that is the real job. | Belongs to the Add group; from the Sheet side: offer a slim header slot (title + one trailing action) so sheets stop stacking two chrome rows. |
| Footer top rule + 16px padding (Sheet.tsx:207) | оставить | Correct separation for sticky actions. |  |

**Visual opportunities:**
- Keyboard-follow already exists (useVisualViewport, Sheet.tsx:24-50); pair it with the footer buttons sliding with the keyboard on --spring-settle so the commit button feels attached to the paper's edge.
- When a full sheet opens from a list row (word detail), the row's headword could morph into the sheet title (shared-element view transition), replacing the mono 'Карточка №' label as the 'which card' signal.

### Snackbar (app-level above the tab bar, and inside an open sheet)  ·  density 4/10, 3 elements

**Job:** Offer undo (or report a failure) for the action just taken, then get out of the way.

**Visible at first paint:**
- ink bar 48px, radius 6, full column width minus 16px gutters (Snackbar.tsx:45, :277)
- message 14px white, truncated (Snackbar.tsx:50)
- underlined action «Отменить» 44px tall (Snackbar.tsx:51-64)
- (hidden on phones: key cap Kbd, Snackbar.tsx:59-63 max-md:hidden)

| Element | Action | Why | Where to |
|---|---|---|---|
| Success snackbars with no action: «Тема «…» создана», «Резервная копия сохранена», «Пример скопирован», «Скопировано», «Практика окончена», «Добавлено: N слов» when there is no undo (≈85 .show() call sites across components; default 5000ms when no action, Snackbar.tsx:221) | объединить | A black 48px bar for 5 seconds announcing something already visible on screen (new tile appeared, button pressed). On a 390px phone the ink bar is the heaviest object on the screen. | Merge into in-place feedback: spotlight the created row/tile (spotlight keyframe, globals.css:411-419), or swap the pressed button's label for 1.2s («Скопировано»). Reserve the snackbar for (a) undoable actions and (b) errors. |
| Long messages with mid-dot clauses («Тема «X» удалена · 5 слов во «Входящих»») | уменьшить | Truncates at 390px (truncate, Snackbar.tsx:50), so the second clause is often cut anyway. | Message = verb + object only («Тема удалена»); the consequence shows where the words landed (Входящие count spotlight). |
| Undo action «Отменить» | оставить | Core value of the bar. |  |

**Visual opportunities:**
- A 1px on-ink timer line along the bar's bottom edge that shrinks with the remaining time (scaleX, linear, paused while touched/hidden — logic exists at Snackbar.tsx:222-227). Shows 'undo window' visually instead of the user guessing.
- After undo, instead of a second snackbar («Сортировка отменена»), the restored element returns with the existing return motion (card-motion R7 style) — the undo is visible, not narrated.

### Waiting region — StatusLine (+ Skeleton rows)  ·  density 3/10, 5 elements

**Job:** Show that one region is working, quietly, without a spinner.

**Visible at first paint:**
- mono 11px uppercase stage text, e.g. «ПОДБИРАЕМ ВАРИАНТЫ» (StatusLine.tsx:47-48)
- optional count in the same line «3 / 12» (StatusLine.tsx:49)
- elapsed time on the right after 3s «0:04» (StatusLine.tsx:51)
- 1px hairline, becoming determinate ink bar or an ink run after 1.5s (StatusLine.tsx:53-66)
- static skeleton rows with flat bars, fading 1/.75/.5/.3 (Skeleton.tsx:10-19)

| Element | Action | Why | Where to |
|---|---|---|---|
| Elapsed seconds counter (StatusLine.tsx:51, after 3s) | уменьшить | A ticking number is the only moving text on the screen and reads as 'this is slow'; the ink run already signals life. | Show elapsed only past ~10s (genuinely long imports), not at 3s. |
| Stage text + count + elapsed in one 20px row | объединить | Up to three pieces of mono text for one wait. | Determinate waits: count only («4 / 12») with the bar; indeterminate: stage text only. |
| Ink run on the hairline | оставить | The single loader of the product (MOTION-SPEC §3.4); exactly the right amount. |  |

**Visual opportunities:**
- Determinate bar already moves only on real events (StatusLine.tsx:54-63); when it completes, let it fade from ink to rule colour over --dur-spotlight rather than vanish — the 'ink drying' end state.
- Skeleton rows could reuse the review card's ruled lines (--card-lines, globals.css:18) as their bars for card-shaped waits — blank index card instead of grey bars.

### Chips / filter row (Library filters, review set chip, theme chips in forms)  ·  density 5/10, 6 elements

**Job:** Narrow what is shown with one tap.

**Visible at first paint:**
- 30px chips, 1px rule border, radius 4 (Chip.tsx:50)
- optional 14px leading icon (Chip.tsx:61)
- label 13px
- mono count after label, shown even when 0 («К повторению 0», «Трудные 0», library.png) (Chip.tsx:63-65)
- dropdown chevron (Chip.tsx:66)
- mono variant with letter-spacing for «FR → RU» + swap icon (Chip.tsx:55; review-front.png)

| Element | Action | Why | Where to |
|---|---|---|---|
| Zero counts on chips (Chip.tsx:63 renders when count != null, including 0) | убрать | «Трудные 0» is a disabled-feeling filter that still costs a chip and a number. | Hide the count at 0 (or hide the chip entirely when its filter would show nothing). |
| Mono direction chip with both arrow and swap icon («FR → RU ⇆», review-front.png) | уменьшить | Arrow + swap glyph + uppercase mono = three marks for a binary toggle; the chip is the widest one in the row. | Plain «FR → RU» mono chip; the tap flips it with a quick horizontal swap of the two codes (motion as the affordance). |
| Selected = ink fill crossfade (Chip.tsx:53) | оставить | Clear state; on-brand. |  |

**Visual opportunities:**
- Filter rows: replace a row of 3–4 outlined chips with one ink slab that glides between plain-text options (reuse Segmented's slab mechanic, Segmented.tsx:123-138) — text labels without boxes, one moving ink block.
- Direction toggle: «FR» and «RU» physically trade places (translateX 200ms --ease-standard) when tapped.

### Slang meter (card back, word detail, list rows in Add/Search/Import/Done)  ·  density 4/10, 3 elements

**Job:** Tell the register of a word at a glance.

**Visible at first paint:**
- 4 segments 10×3 (ink, red at vulg.) (SlangMeter.tsx:57-61)
- italic abbreviation «нейтр.» / «fam.» / «arg.» / «vulg.» (+ «· verl.») (SlangMeter.tsx:62-80)
- in Add «Недавние» rows also: mono «ТЕМА: ПОВСЕДНЕВНОЕ» on the same row (add-empty.png)

| Element | Action | Why | Where to |
|---|---|---|---|
| Neutral level drawn as 1 filled segment + «нейтр.» (SlangMeter.tsx:48 filled = level + 1) | убрать | SPEC sample data marks neutral words as 'no badge' (SPEC.md:129-130); in lists most words are neutral, so every row carries a meter that says nothing. | In list rows render nothing at level 0 (keep on card back / word detail where the full scale is the point). |
| Abbreviation next to the meter in list rows (SearchPanel.tsx:201, :376; add/parts.tsx:567; SessionDone.tsx:237; ImportRowItem.tsx:176) | уменьшить | Meter + abbr + theme label = three metadata marks per row; the meter alone already encodes the level (WordList.tsx:64 already uses showLabel={false}). | showLabel={false}, size sm in rows; abbr appears behind a tap (AbbrHint) and on the card back. |
| Meter + abbr with tap hints on the card back (ReviewCard.tsx:360) | оставить | The user's favourite feature (SPEC.md:89); this is its home. |  |

**Visual opportunities:**
- On card reveal, the segments fill left→right one by one (40ms apart, ink) — a tiny 'gauge' moment that makes register feel physical; vulg. segments ink in red last. Reduced motion: appear filled.
- Use the meter as a row's right-edge texture in lists (sm, no text) so a list scan becomes a visual rhythm of short ink bars instead of italic words.

### iOS install hint (floating, iOS Safari only, until dismissed)  ·  density 6/10, 5 elements

**Job:** Get the user to install the PWA once.

**Visible at first paint:**
- white card with 1px rule, radius 6, fixed above the tab bar on every tab screen (InstallHint.tsx:107-148; layout.tsx:26)
- card glyph
- title «Установи на экран «Домой»»
- 2-line paragraph «Нажми [share glyph] Поделиться → На экран «Домой». «Карточки для Лизи» будут открываться как приложение и работать без сети.»
- 44px close X

| Element | Action | Why | Where to |
|---|---|---|---|
| Floating 3–4 line card overlapping content on every screen (InstallHint.tsx:137-147) | уменьшить | Covers the bottom of the review card / «Показать ответ» area and the library list until dismissed; the explanatory sentence is long. | One 44px line «На экран «Домой»: [share] → На экран «Домой»» + X, shown on the Повторение tab only; the full explanation stays in Settings (placement="inline" already supported, InstallHint.tsx:96-99). |

**Visual opportunities:**
- Draw the hint as a small paper slip tucked under the tab bar (top edge rule only, no box), sliding up 8px with enter-pop once, then staying put.

### Controls: Button, IconButton, Segmented  ·  density 3/10, 5 elements

**Job:** Commit or choose with one clear, tactile press.

**Visible at first paint:**
- primary ink 52px, secondary outlined, tertiary underlined, danger red text (button-classes.ts:10-22)
- optional trailing mono count «Применить 10» (Button.tsx:91)
- pending label swap «Добавляем…» after 150ms (Button.tsx:45-87)
- 44×44 icon buttons (Button.tsx:108-123)
- Segmented: compact 30px ink-outlined segments or 44px block grid, gliding ink slab (Segmented.tsx:123-187)

| Element | Action | Why | Where to |
|---|---|---|---|
| Tertiary buttons rendered permanently underlined (button-classes.ts:13-14) | оставить | On screens with several tertiary links (settings footers, sheet rows) the underlines add many ink strokes; fine as one, noisy as five. | Rule of use rather than a component change: at most one tertiary per region. |
| IconButton `title` tooltip (Button.tsx:113) | оставить | No effect on touch. |  |

**Visual opportunities:**
- Primary press already scales .98 + ink-press (globals.css:369-380). On a successful commit, a 2px red rule could draw under the button for 400ms (rule-draw) — a 'signed' moment that can replace the success snackbar.
- Segmented slab glide (Segmented.tsx:123-138) is the best motion primitive in the kit; reuse it for chip filters and tab-like toggles to cut boxes.

### Review card motion (shared kit used by the Повторение screen)  ·  density 5/10, 6 elements

**Job:** Make each grade feel like physically dealing an index card, so the screen needs fewer words.

**Visible at first paint:**
- current card (settling from the stack .96/8px → 1/0 on --spring-settle 350ms, card-motion.ts:103-121)
- stack card under it (stackPose, swipe.ts)
- on grade: card exits ±56px with ±3° or sinks 24px, fading 140ms (card-motion.ts:62-93)
- on swipe: card flies on at release velocity (card-motion.ts:72-79)
- on reveal: headword glides into its answer position (card-motion.ts:146-153)
- on undo: card returns from the side it left (card-motion.ts:122-130)

| Element | Action | Why | Where to |
|---|---|---|---|
| Text counters doing the job the stack could do (review header «4 К ПОВТОРЕНИЮ · 7 НОВЫХ» + «04 / 11» + progress line, review-front.png) | объединить | Three representations of progress at first paint, all above the card; the motion kit already has a stack. | Let the stack depth show remaining cards (1–3 offset card edges under the current card, thinning as the queue empties) and keep only the 1px progress line; move «4 к повторению · 7 новых» behind a tap on the line (ReviewTopBar belongs to the Review group). |
| Grade-button exit distance 56px + fade (card-motion.ts:80-92) | оставить | Not noise; deliberately short per MOTION-SPEC R6. |  |

**Visual opportunities:**
- Stack as progress: render up to 3 card edges (1px rule, 3px apart) under the current card; each grade removes one edge from the pile's visible depth when ≤3 remain. Pure paper geometry, no numbers.
- Grade exits could leave a faint 1px ink tick in the progress line at the position of that card, coloured by result (again/good) — a visual ledger of the session instead of a count-up.
- Undo (playDropToStack, card-motion.ts:133-140) already reverses physically; that makes the undo snackbar text redundant on the review screen — the snackbar could be just «Отменить» with no message.

### Tokens & type system (app/globals.css) as it shapes density on every phone screen  ·  density 5/10, 5 elements

**Job:** Give every screen one voice: ink on paper, with very few kinds of marks.

**Visible at first paint:**
- paper #f1f1ee bg, white surfaces, 1px #d6d6d1 rules (globals.css:5-30)
- `.meta` mono 11px uppercase muted labels (globals.css:186-192)
- `.abbr` italic serif muted (globals.css:195-199)
- single red accent --red (globals.css:12)
- motion tokens incl. rule-draw, stamp-land, settle-rise, spotlight (globals.css:208-262, 313-341, 411-419)

| Element | Action | Why | Where to |
|---|---|---|---|
| `.meta` mono uppercase lines used as the default way to show any number/label (stats lines, section headers, chip counts, status lines, theme labels in rows) | уменьшить | Uppercase tracked mono is visually loud per character; with 3–5 meta lines per screen (review header, library sections, folder header, add rows «ТЕМА: …») it is the main source of the 'too much information' feeling. | Design rule: at most one `.meta` line per region at first paint; secondary facts go into `.abbr` italic (quieter) or behind a tap. |
| Three greys (--muted text, --rule, --surface-2) + red + again + good + warn | оставить | Palette is already tight and on-brand. |  |
| Unused-on-phone desktop tokens (--hover, --hover-surface, --boundary, --selected, --scrim-desk, --shell-nav) | оставить | No visual cost on phones. |  |

**Visual opportunities:**
- The motion tokens for expressive paper moments (rule-draw, stamp-land, settle-rise) are only used on Session-Done; using rule-draw for headers and sheet tops gives the app a consistent 'ink being drawn' signature at almost zero density cost.
- --card-lines (blue index-card rules, globals.css:18) could appear faintly on empty states and skeletons, so blank screens look like blank cards rather than empty grey.
