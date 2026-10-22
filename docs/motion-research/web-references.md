# Micro-interactions in reference apps: web research brief

Scope: how leading flashcard, language and "craft" apps handle feedback, motion and loading, and which of
their patterns fit «Карточки для Лизи». This is research only: no app code was changed.

Read it with:
- `docs/motion-research/web-loading.md`: loading thresholds, the anti-flash rules and skeleton rules. This
  brief does not repeat them.
- `docs/motion-research/audit-motion.md`: what the app does today and its gap list.
- `mockups/SPEC.md` §1 and `mockups/DESKTOP-SPEC.md`: the brand rules. No gradient, shimmer, box-shadow,
  glow, sparkles, emoji, pastel pills or confetti.

Sources are cited as [n]; the list is at the end. Some numbers come from third-party reconstructions or
library defaults rather than the vendor's own documentation. Those are marked *(3rd-party)* and are
starting points to tune on a device, not facts about the named app.

Method note: Mobbin was not available (the MCP returned "requires a paid plan"), so there are no
screen-level captures. Vendor docs were used where they exist; otherwise design reviews, library source
and forum threads.

---

## 0. TL;DR: ten patterns to borrow

1. **Frequent actions get almost no motion.** Apple: "generally avoid adding motion to UI interactions that
   occur frequently" [1]. Emil Kowalski (Sonner, Vaul; design engineer at Linear): keep UI animations under
   300 ms and "never animate keyboard initiated actions" [3][4]. A review session is about 30 identical
   reps, so every per-card motion must cost under ~200 ms and must never block the next input.
2. **Motion should acknowledge the action rather than celebrate it.** Anki, AnkiMobile and Mochi show no
   animation on a grade. They show the next card immediately [6][9]. AnkiDroid's only acknowledgement is a
   small left/right icon that shows the last answer for about 1–2 s [7][8]. Duolingo is the opposite pole:
   a coloured banner, a chime on every correct answer, a mascot [20][21]. We sit with Anki: a fast, precise
   echo of the grade, with nothing added.
3. **The direction of exit is the feedback.** Sonner enters and leaves in the same direction as its dismiss
   gesture [3]. Apple says feedback motion should follow the gesture people expect [1]. So a button grade
   should send the card off the same way a swipe would: Не знаю to the left, Знаю to the right. The grade
   then reads as a gesture whether it came from a finger, a button or a key.
4. **Swipe deck physics follow a well-worn recipe** [10][11]:
   - the card tracks the finger 1:1;
   - rotation is proportional to dx (about dx/25, peaking near 10–15° *(3rd-party)*);
   - the stamp's opacity is proportional to dx;
   - it commits on a distance threshold (~35% of the screen width *(3rd-party)*) **or** a velocity
     threshold;
   - below the threshold the card snaps back with a low-bounce spring;
   - the next card waits behind at ~95% scale and grows to 100% as the top card leaves *(3rd-party)*.
5. **Springs: bounce 0 by default, never above ~0.15 here.** In WWDC23 Apple says to use bounce 0 "when
   you're not sure". Around 15% "doesn't feel very bouncy yet", and values above ~0.4 "may feel too
   exaggerated for a UI element". A spring should start from the gesture's velocity [5].
6. **Prefer undo to confirmation for anything reversible** [12][13]. Gmail's undo window is 5–30 s and
   Superhuman's is 10 s, on Z or a visible button [14]. Our header undo, Z, and the «Отменить» snackbar
   are the right model. Undo should play the original motion backwards: the card comes back from the side
   it left.
7. **Spotlight what changed, then fade back.** This is 37signals' Yellow Fade Technique: highlight a
   changed element for "a second or two", then fade to normal [15][16]. In our palette it becomes a paper
   fade: `--surface-2` (or a 2 px red-ink left rule) fading out over ~1.2 s. Use it for a new word in a
   list, fields filled by detection, a word moved to a theme, and an undone delete.
8. **Long work updates one status line in place.** Raycast's toast is created as `Animated` and later
   mutated to `Success` or `Failure` with a new title, never stacked [17]. AI-SDK `elementStream` emits
   *complete* elements [22]. So AI rows arrive whole, one at a time, under one status line that changes
   in place: «Подбираем…» → «3 варианта».
9. **Sync stays out of sight unless it matters.** Material says syncing "does not display a refresh
   indicator"; pull-to-refresh is only a manual supplement [18]. Google's offline-sync guideline: show
   status only on screens whose data changes, never style offline like an error, use a progress bar rather
   than a spinner for long syncs, and finish on a check plus text [19]. Bear keeps its sync indicator tiny
   and puts the last-sync time in preferences [23].
10. **Calm completion comes from typography, not particles.** Anki ends on a plain sentence, «You have
    finished this deck for now», plus a pointer to Custom Study [24]. Things 3's "delight" comes from
    depth, a pop and one haptic, never fireworks [25]. Our «Готово на сегодня» should be one deliberate,
    slower, one-off gesture: a rule drawing across, or a date stamp landing. It happens once a day, so it
    may be slower and more expressive than per-card motion [4].

---

## 1. App-by-app notes

### Anki desktop, AnkiMobile, AnkiDroid
- Reveal is Space or Enter, and grading is 1–4. Each answer button shows the next interval («<1 мин», «1 д»)
  [6]. We already do this; it is the single most useful piece of "feedback" because it states the
  consequence *before* the press.
- There is no grade animation; the next card replaces the current one. Users who misclick asked for
  per-button beeps, and the AnkiDroid answer was "the coloured dots above the card match the last answer"
  for a second or two [8]. The thread's sharpest point: only the *non-default* grades really need a
  confirmation, because Good is the reflex [8].
- AnkiDroid's new study screen (2.23) replaced the dots with icons: "wrong answers are on the left, and
  the correct answers are on the right", with a switch to turn them off [7]. Users report a ~1.5 s lag
  after gestures on that screen and complain about it [7]. **Latency is felt as worse than missing
  animation.**
- The end of a session is a text screen, «Congratulations! You have finished this deck for now», plus a
  Custom Study hint [24]. It is calm, but it confuses users on empty or new decks [24]. A lesson for us:
  the done state must differ from the empty state («Нечего повторять» vs «Готово на сегодня»).

**Borrow:**
- interval sub-labels (already there);
- a 1–2 s echo of the last grade in a fixed, peripheral place;
- separate done and empty copy;
- no lag ever.

### Mochi
- Two-button review («Forgot» / «Remembered»). Learning uses «Add to reviews» (SPACE) and «Again» (F) [9].
- A reviewer notes that Mochi, unlike Anki, puts the keyboard shortcut *in the button label*, which
  teaches it faster [26].

**Borrow:** our desktop `Kbd` hints in grade buttons. On phones they stay hidden (SPEC).

### Quizlet
- Flashcards flip on click or tap, and arrows move between cards. Sorting into «Still learning» / «Know»
  is an option [27]. The flip is the familiar 3D `rotateY` card-turn. Tutorials default it to ~500 ms
  `ease` [28] *(3rd-party)*, which is too slow for 30 reps, and large 3D rotations can cause nausea under
  vestibular sensitivity [28].

**Do not borrow:** a 3D flip. Since 2026-10-22 our card needs no flip at all («тап — ответ»), and the answer
can be swiped directly (SPEC §Review header notes). See §2.1 for the reveal.

### Duolingo: the gamified pole, for contrast
- Correct and wrong answers raise a full-width coloured banner from the bottom with a «Continue» button.
  A "bouncy chime" plays on every correct answer as a micro-reward [20]. Brand-green CTAs carry a chunky
  4 px bottom shadow as a "tactile press" *(3rd-party design-system write-up)* [21].
- Lesson-complete and streak moments are animated by a character team in Rive, with several rough passes
  to tune "rhythm and energy" [29].

**What makes it read as gamified:**
- it celebrates *every* correct answer;
- reward sound;
- mascots;
- counters that count up;
- streak pressure;
- colour floods.

None of it fits our library-card language. What does transfer is the *principle* of the "succinct
animation precisely tied to a successful action" that Apple cites [1]. We should keep the precision and
drop the party.

### Clozemaster
- Text-entry mode tints the typed answer green or red as you go, and scores decay with retries [30].

**Borrow:** nothing visual. Per-keystroke tinting is a game-show device.

### Things 3 (Cultured Code)
- Tapping a to-do makes it "pop out into a card-like form while the rest of the list fades into the
  background". A long-press lifts a row "out of the list so you can drag it". The Magic Plus button is
  dragged to the exact insert point. Taptic feedback on pick-up and on Magic Plus "forms a perfect
  marriage" with the pop [25].
- A third-party design study gives the checkbox ~500 ms: a 200 ms fill, then a spring checkmark with a
  sound and a light haptic, then a 150 ms row slide-away [31] *(3rd-party, unmeasured)*.

**Borrow:**
- the **lift** for long-press, done with scale 1.02 and `--surface` raised plus a hairline, *no shadow*;
- the **dim-the-rest** focus when a word sheet opens;
- a short **hold before a completed row leaves**, so the user sees the state change before the row goes;
- one haptic at the moment of commitment, not during the motion.

### Linear
- Design-refresh principles [32]:
  - "Don't compete for attention you haven't earned";
  - "structure should be felt not seen";
  - "density without overwhelm";
  - quieter chrome, fewer icons.
- Its design engineer's motion rules: purpose first; frequency decides whether to animate at all; under
  300 ms; ease-out for responses; interruptible CSS transitions over keyframes; animate only transform and
  opacity; reduced motion means "opacity only", not "nothing" [3][4].

**Borrow:**
- the whole rule set;
- reduced motion keeps short fades (the audit's gap item 10 agrees).

### Raycast
- It has no open animation because it is used hundreds of times a day, which Kowalski calls the optimal
  experience for that frequency [3].
- Toast API: `Animated` "until a process is completed", then mutate the same toast to `Success` or
  `Failure`. It falls back to a HUD when the window closes [17].

**Borrow:**
- desktop keyboard grading without animation (or with only the existing 120 ms ink flash);
- an update-in-place status line for AI work, sync and import;
- never stacking toasts for one task.

### Sonner and Vaul (Kowalski's libraries; vaul is already in our stack)
- Toast [33]:
  - `transform 400ms ease` as an interruptible *transition*;
  - enters from `translateY(100%)`;
  - auto-dismisses after 4 s, **pausing while the tab is hidden** (`visibilitychange`) and on hover;
  - swipe-dismiss when the distance passes a threshold or velocity > 0.11 px/ms;
  - rubber-band friction in the wrong direction.
- Drawer [34]:
  - `cubic-bezier(0.32, 0.72, 0, 1)` (Ionic, "closely matches the one used in iOS"), 500 ms "to mimic
    iOS's Sheet";
  - momentum-based close (a flick closes it without passing a point);
  - damped overdrag;
  - a 100 ms drag lockout after scrolling to the top, to stop accidental dismissal.

**Borrow:**
- pause the undo snackbar timer while the PWA is backgrounded;
- the iOS curve as our `--ease-settle`;
- the same curve for the card snap-back when it is not spring-driven.

### Tinder-style decks (library defaults and tutorials)
- react-tinder-card defaults [11]:
  - `swipeRequirementType: 'velocity'` with `swipeThreshold: 300`;
  - the docs warn that a fixed pixel position threshold "may not suit all devices", so size it relative
    to the screen;
  - `flickOnSwipe: true`.
- A SwiftUI recipe *(3rd-party)* [10]:
  - commit at `width * 0.35`;
  - rotation `dx / 25` ("~12° at full drag");
  - stamp opacity `min(|dx| / 100, 1)`;
  - fling-off seeded with the gesture velocity;
  - a default spring for snap-back;
  - the next card at ~95% scale;
  - three cards rendered;
  - one haptic at commit.
- Flashcard-specific advice *(3rd-party)* [35]: the card "follows the finger" with a coloured verdict, a
  "light haptic on commit", a visible button fallback, and undo "always available".

### iA Writer, Bear, Craft, Apple Notes (calm-tool references)
- iA Writer: "No buttons, no popups, no title bar". Focus Mode "highlights the sentence or paragraph
  you're working on and fades everything else" [36]. **Borrow:** dimming the context instead of moving
  it, for the word sheet scrim and for a focused input in quick add.
- Bear: a small sync status indicator, with the last-sync time tucked into preferences [23]. Craft syncs
  automatically on Apple platforms [37]. Neither shows a sync spinner in the main flow.
- Calm technology (Case, after Weiser and Brown) [38]:
  - technology should need "the smallest possible amount of attention";
  - it "can communicate, but doesn't need to speak";
  - it moves "from the periphery of our attention, to the center, and back";
  - it "should work even when it fails".

  This is the frame for sync, offline and AI status.

### Arc and RemNote
- Nothing citable about their motion turned up. RemNote's documented queue UX is about exit shortcuts and
  queue stats, not motion [39]. They are left out rather than described from memory.

---

## 2. Patterns mapped to our screens

Duration and easing names below match the token proposal in `audit-motion.md` §6:
- `press` ≈ 80 ms
- `quick` ≈ 140 ms
- `move` ≈ 200–240 ms
- `sheet` ≈ 320–380 ms
- `settle` = `cubic-bezier(0.32,0.72,0,1)`

### 2.1 Review (phone + desktop)

| Moment | Borrowed from | Pattern for us |
|---|---|---|
| Reveal answer (tap) | Anki (no flip) [6]; Apple "frequent = minimal" [1]; iA dimming [36] | No 3D flip. The French word stays fixed above the red rule. Below the rule the answer block **writes in**: opacity 0→1 + 4 px rise, `quick`, ease-out. «тап — вопрос» reverses it with an opacity-only fade. Reduced motion: opacity only. |
| Swipe drag | Tinder recipe [10][11] | 1:1 tracking. Rotation `dx/25` deg, **capped at 6–8°** (a paper card, not a photo; SPEC shows ~6°). Stamp «ЗНАЮ» / «НЕ ЗНАЮ» opacity ramps from 0 at 16 px to 1 at the threshold. The next card's scale goes .96 → 1 in proportion to progress. |
| Threshold reached | AnkiDroid's lag complaint [7]; audit gap 3 | At the commit point the stamp "lands" (scale 1.04 → 1, `press`) and reaches full opacity. This is the visible substitute for the iOS haptic, which may stay silent in `pointermove`. Pull back under the threshold and the stamp fades again. |
| Commit | react-tinder-card velocity mode [11]; Sonner [33] | Commit at **≥ 30–35% of card width or a flick** (start at about 0.5 px/ms and tune on a device; Sonner's 0.11 px/ms suits a small toast, not a card). The fly-out carries the release velocity: duration = remaining distance / velocity, clamped to 120–220 ms, ease-out. One haptic at commit, never during the drag; haptics back up the motion rather than replace it [1][2]. |
| Snap-back | WWDC23 springs [5]; Vaul curve [34] | Spring with bounce 0–0.1, seeded with the release velocity. A CSS fallback is `transform 240ms var(--ease-settle)`. No overshoot past 0. |
| Button grade (phone) | Sonner "same direction" [3]; Apple [1] | The pressed button **ink-fills** (`press`). The card leaves in that grade's swipe direction with the same fly-out (Не знаю ←, Знаю →, Сложно ↓ by a short 24 px fade). The grade reads like a swipe. |
| Key grade (desktop) | Kowalski / Raycast "never animate keyboard actions" [3][4] | Keep the existing 120 ms ink flash on the button. The next card **appears without travel**: an opacity cut of ≤ 100 ms or none. Holding keys must never queue animations. |
| Next card entrance | Tinder stack [10] | The peeked card at .96 scale settles to 1 (`move`, `settle`). Its content is already rendered, so there is no flash. |
| Last-grade echo | AnkiDroid feedback dots/icons [7][8] | Optional, quiet: for ~1.2 s the mono counter `08 / 30` shows a small grade glyph or colour tick next to it, or the newest segment of the 1 px progress line takes the grade colour, then fades to ink. It sits in the periphery (calm tech [38]) and needs no snackbar (the 2026-10-22 decision stands). |
| Undo (header button / Z) | Superhuman Z [14]; Matuschak [13] | The previous card **returns from the side it left** (the fly-out reversed, `move`, `settle`). The counter steps back. Keep undo available for the whole session, as the header button already does. |
| Progress line | Google sync guideline "progress, not spinner" [19] | `transform: scaleX`, `move`, ease-out per grade. On the last card it fills to 100% and **holds ~300 ms** before the done state. |
| Session done | Anki plain text [24]; Things depth [25]; Kowalski "rare = may be expressive" [4] | One composed entrance, about 600 ms in total, once a day. First the card area clears. Then «Bravo !» fades up 6 px. Then the **2 px red rule draws left→right** (scaleX 0→1, ~400 ms, ease-out). Then the stats appear as **static numbers** (no count-up), with an optional mono date stamp «22.10» landing like a library due-date stamp (scale 1.04→1, `press`). One success haptic. No sound, confetti, streak or mascot. |
| Practice mode («Ещё практика») | Mochi / Anki custom study [9][24] | Same motion, plus a small mono label «практика · не влияет на расписание» that stays visible. The difference shows in text, not in effects. |

### 2.2 Quick add (sheet)

| Moment | Borrowed from | Pattern for us |
|---|---|---|
| Sheet open/close | Vaul / iOS sheet [34] | Keep vaul's momentum close and damped overdrag. Shorten the duration to `sheet` (≈ 340 ms) with `settle`. Quick add is frequent, and 500 ms is the iOS *system* sheet, which users accept for system UI but which feels slow in an app opened many times a day [3]. Fade the scrim in 200 ms. No shadow on the sheet edge; the hairline is enough. |
| Typing → suggestions | Raycast toast in place [17]; AI SDK `elementStream` [22] | One status line under the input: «Подбираем…» → «3 варианта» → (failure) «Не удалось · Повторить». Each suggestion row **arrives whole** when its element completes: opacity + 4 px, `quick`. No typing caret, no partial text, no stagger timer (network timing staggers them naturally). If several arrive in one tick, stagger them 40 ms apart, capped at 200 ms (common guidance is 30–75 ms per item with a capped total) [40]. |
| Picking a suggestion | Things pop-out [25] | The picked row ink-fills (`press`) and the form below takes its values. The fields that changed get the **paper fade** [15]: `--surface-2` → transparent over 1.2 s. |
| Detection fills fields (`/api/ai/enrich`) | Yellow Fade [15][16] | The same paper fade on the slang meter, example and theme, so the user sees what was filled before saving. This supports the rule that nothing is saved unconfirmed. |
| Save | Things row insert [25]; Yellow Fade [15] | The sheet stays open (or closes, as today). In the list underneath (Library / «Все слова»), the new row **opens its height** 0→h (`move`) and then paper-fades. One light haptic on save. The snackbar «Сохранено · Отменить» offers undo, and its timer pauses while the app is hidden [33]. |
| Duplicate detected | Clozemaster tinting (as anti-pattern) [30] | No red shake. The existing duplicate block slides in under the field (`quick`), and the matching row is named with a link. Calm text, not an alarm. |
| «Список» rows (paste a list) | elementStream [22]; staggering guidance [40] | Rows render immediately as plain text. Detected metadata (level, theme) writes into each row as it arrives, with the paper fade per row. A single status line counts «Готово 7 из 12». |

### 2.3 Import (screenshot)

| Moment | Borrowed from | Pattern for us |
|---|---|---|
| Processing | Google offline guideline "progress bar, not spinner; spinner hides a stall" [19]; Raycast [17] | A 1 px determinate line under the screenshot thumbnail, **staged** («Читаем скриншот» → «Находим слова» → «Проверяем»). Each stage advances the line and the label in place. If the server stalls, the line holds still and the label stays truthful; it never fakes progress. A static 1 px scan line over the image is allowed; a moving gradient is not. |
| Rows arrive | `elementStream` [22] | Each extracted word appears as a complete row (opacity + 4 px, `quick`) with its checkbox already checked. The count in the primary button («Добавить 9») updates as a plain tabular number, with no rolling digits. |
| Checkbox | Things haptic on commit [25] | Ink fill + tick drawn in `press`, with a light haptic. Unchecking dims the row to 50% (`quick`) rather than removing it. |
| Confirm | Undo over confirm [12][13] | Rows collapse away as they are saved (height, `move`). The snackbar reads «Добавлено 9 слов · Отменить». |

### 2.4 Library (tiles, «Все слова», word sheet, desktop table)

| Moment | Borrowed from | Pattern for us |
|---|---|---|
| Row press | Apple feedback ≤ 100 ms [1] | `--surface-2` background in `press`. The audit found `SwipeRow` has none. |
| Long-press lift | Things "pop out of the list" [25] | scale 1.02 + raised surface + hairline (no shadow), `quick`, one haptic when the long-press fires. |
| Swipe row actions | iOS full-swipe performs the first action [41] | The actions are revealed under the finger, 1:1. A full swipe past ~60% commits the first action («Переместить»), with a haptic at the threshold and the button widening to fill the row as the visible lock. |
| Delete | GNOME HIG / Matuschak undo [12][13] | The row's height collapses (`move`, `settle`) while its opacity drops to 0 in `quick`. The snackbar «Удалено · Отменить». Undo re-opens the height and paper-fades the row. |
| Move to theme (sheet / drag) | Things drag [25]; Yellow Fade [15] | On drop, the target theme's tile or sidebar row paper-fades and its count updates. The source row collapses. No flying ghost across the screen (Apple visionOS note: when movement communicates nothing, fade out and fade in instead of travelling [1]). |
| Word sheet open | iA focus dimming [36]; Things "rest fades" [25] | Scrim plus vaul `sheet`. The word inside does not animate; the paper simply arrives. |
| Empty → first content | Anki done/empty confusion [24] | The empty-state text fades out (`quick`) and the first tile or row writes in (`quick`). No celebratory "first word!" moment; the first word is just a row. |
| Refresh / sync | Material swipe-to-refresh [18]; Google offline [19]; Bear [23]; calm tech [38] | **No pull-to-refresh on phone.** Dexie is live and sync is automatic, so pulling would only perform a ritual. Sync is invisible while it works. A small mono line appears only in two cases: (a) offline, as neutral text «Офлайн · изменения сохранятся», not error-red; (b) failed, «Не синхронизировано · Повторить». It disappears on success. The last-sync time lives in Settings. If a manual refresh is ever kept (desktop «Обновить»), its status sits in the button label and the scroll position is kept [18]. |

### 2.5 Sort plan («Разложить по темам») and «Дополнить карточки»

| Moment | Borrowed from | Pattern for us |
|---|---|---|
| Waiting for the plan | Raycast in-place status [17]; `web-loading.md` §6 | One status line, «Раскладываем 48 слов…», with a determinate 1 px line if the server reports batches. Skeleton rows only as static hairlines. |
| Plan arrives | `elementStream` [22]; Linear "don't compete" [32] | Theme groups write in one after another (opacity + 4 px, ≤ 40 ms apart, capped at 300 ms). Word rows inside a group do **not** stagger individually; the group arrives as one block. |
| Include/exclude a move | Things checkbox [25] | Ink tick in `press`. An excluded row dims (`quick`) with no strike-through animation. |
| Apply | Undo over confirm [12][13] | No per-word motion across the library (moving 48 rows would be noise). One summary snackbar, «Разложено 48 слов · Отменить», and the affected theme tiles paper-fade once. |

### 2.6 Settings

| Moment | Borrowed from | Pattern for us |
|---|---|---|
| Toggle | Apple standard controls [1] | The thumb moves with `translateX` in `quick`, and the track fills ink in `quick`. A light haptic. Keyboard toggles flip with no travel [4]. |
| «Синхронизировать сейчас» | Raycast Animated → Success [17]; Google "finish on a check + text" [19] | The button label changes in place: «Синхронизация…» (width kept, `aria-busy`) → «Синхронизировано · 14:02», which stays as the new resting state. No toast. |
| Export / backup | Raycast HUD fallback [17] | The status sits in the row itself; there is no modal. |
| Haptic test button | — | Keep it as it is. |

### 2.7 Login

| Moment | Borrowed from | Pattern for us |
|---|---|---|
| Submit | `web-loading.md` §7 | The label becomes «Входим…» with the width held, the button disabled and `aria-busy`. |
| Error | Calm tech "communicate, don't shout" [38]; anti-Clozemaster [30] | The inline error text writes in under the field (`quick`), the field gets a 1 px again-red hairline, and focus returns to the field. No shake and no red flood. |
| Success | Things depth [25] | Navigate straight to Review. The app shell is static, so only the card area writes in. No splash and no welcome animation. |

---

## 3. Calm vs gamified: a checklist for review

| Reads as **calm / premium** (keep) | Reads as **gamified** (reject) |
|---|---|
| Motion tied 1:1 to the gesture; exit direction equals meaning [1][3] | Motion that plays *after* the gesture, on its own clock |
| One haptic at commitment [10][25] | Haptics or sound on every step; a reward chime per correct answer [20] |
| A peripheral echo of state (AnkiDroid dots [8], a progress segment) | A full-width banner per answer [21] |
| Static numbers on the done screen [24] | Counters rolling up, XP, streak flames |
| One slower, expressive moment per day (the rule drawing, a date stamp) [4] | A celebration per action; confetti; a mascot |
| Spring bounce 0–0.1 [5] | Bounce ≥ 0.3; elastic overshoot on buttons |
| A status line updated in place [17] | Stacked toasts; «Магия!»; sparkle icons |
| Change spotlight that fades within ~1.2 s [15] | Persistent "NEW" badges, pulsing dots |
| Reduced motion keeps short fades [4] | Reduced motion falls back to nothing, so states pop |
| Undo everywhere [12][13][14] | «Вы уверены?» dialogs before reversible actions |

---

## 4. Numbers worth carrying into the mockups

These are starting values only; tune each on a 390×844 device.
- Swipe commit: **≥ 0.33 × card width** *or* release velocity **≥ ~0.5 px/ms** [10][11] *(tune)*.
- Rotation: **dx / 25 deg, capped at 6–8°** [10] *(capped for brand)*.
- Stamp opacity: **0 at 16 px → 1 at the threshold**. At the threshold it lands with **scale 1.04 → 1 in
  80 ms** [10] *(adapted)*.
- Fly-out: **120–220 ms**, derived from the release velocity, ease-out [5][11].
- Snap-back: **spring bounce ≤ 0.1**, or **240 ms `cubic-bezier(0.32,0.72,0,1)`** [5][34].
- Next card peek: **scale .96 → 1** in proportion to drag, then **`move` ≈ 200 ms** on commit [10].
- Answer reveal: **opacity + 4 px, 140 ms**.
- Key-driven grade: **no travel**; 120 ms ink flash only [3][4].
- Paper fade (spotlight): **`--surface-2` → transparent, 1.2 s, linear-out** [15][16].
- Row insert / delete: **height + opacity, 200 ms / 140 ms** [25].
- AI row arrival: **opacity + 4 px, 140 ms**. Batch stagger **40 ms, capped at 200–300 ms** [40].
- Snackbar: **4–6 s**, **paused while hidden** [33]. An action snackbar must remain reachable by screen
  readers; Material/Compose advise against auto-dismissing snackbars that carry an action [42].
- Sheet: **≈ 340 ms `settle`** (vaul default 500 ms mimics the system sheet [34]).
- Done moment: **≈ 600 ms total**, once. Red rule **scaleX 0→1 in 400 ms**.

---

## Sources

1. Apple, Human Interface Guidelines: Motion. https://developer.apple.com/design/human-interface-guidelines/motion
2. Apple, Human Interface Guidelines: Playing haptics (the HIG Motion page points to it for feedback that does not rely on motion alone). https://developer.apple.com/design/human-interface-guidelines/playing-haptics
3. Emil Kowalski, "You don't need animations". https://emilkowal.ski/ui/you-dont-need-animations
4. Emil Kowalski, "Great animations". https://emilkowal.ski/ui/great-animations
5. Apple WWDC23, "Animate with springs" (session 10158). https://developer.apple.com/videos/play/wwdc2023/10158/
6. Anki Manual, Studying. https://docs.ankiweb.net/studying.html
7. AnkiWeb forums, "New study screen [Official thread]" (AnkiDroid 2.23). https://forums.ankiweb.net/t/new-study-screen-official-thread/67394
8. AnkiWeb forums, "During review users sometimes click the wrong button". https://forums.ankiweb.net/t/during-review-users-sometimes-click-the-wrong-button/8441
9. Mochi docs, Reviewing your cards. https://mochi.cards/docs/getting-started/reviewing-cards/
10. VP0, "Tinder swipe UI kit: SwiftUI code" *(3rd-party recipe)*. https://vp0.com/blogs/tinder-swipe-ui-kit-swiftui-code
11. react-tinder-card 1.6.4 README. https://cdn.jsdelivr.net/npm/react-tinder-card@1.6.4/readme.md
12. GNOME HIG, Dialogs (undo vs confirmation). https://developer.gnome.org/hig/patterns/feedback/dialogs.html
13. Andy Matuschak, "Prefer undo to confirmation steps". https://notes.andymatuschak.org/zXH4ASvHNz488hCNgrBjQJK
14. Gmail Undo Send windows (NC State OIT), https://oit.ncsu.edu/2022/03/15/unsend-an-email-in-gmail/ ; Superhuman Help, Undo, https://help.superhuman.com/hc/en-us/articles/47278253460499-Undo
15. 37signals / Signal v. Noise, "The Yellow Fade Technique" (2004). https://signalvnoise.com/archives/000558
16. Ajax Design Patterns, ch. 16 "One-Second Spotlight". https://oreilly.com/library/view/ajax-design-patterns/0596101805/ch16.html
17. Raycast API, Toast. https://developers.raycast.com/api-reference/feedback/toast
18. Material Design (v1), Swipe to refresh. https://m1.material.io/patterns/swipe-to-refresh.html
19. Google Open Health Stack, Design guidelines for offline & sync. https://developers.google.com/open-health-stack/design/offline-sync-guideline
20. Out of Scope newsletter (on Duolingo's chime). https://out-of-scope-product.beehiiv.com/p/duolingo-has-it-venmo-has-it-even-slack-has-it-your-product-doesn-t
21. Duolingo design-system write-up *(3rd-party)*. https://open-design.ai/plugins/design-system-duolingo/
22. Vercel AI SDK, `Output` / `elementStream` (source `generate-text/output.ts`; also `node_modules/ai/dist/index.d.ts` in this repo). https://app.unpkg.com/ai@7.0.40/files/src/generate-text/output.ts
23. Bear community, sync status indicator thread; Bear FAQ sync troubleshooting. https://community.bear.app/t/wrong-tooltip-for-sync-status-indicator/10856 , https://bear.app/faq/sync-troubleshooting/
24. AnkiWeb forums, "Congratulations! You have finished this deck for now". https://forums.ankiweb.net/t/congratulations-you-have-finished-this-deck-for-now/42236
25. MacStories, "Things 3: Beauty and Delight in a Task Manager". https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/
26. Fernando Borretti, "First Impressions of Mochi". https://borretti.me/article/first-impressions-mochi
27. Quizlet Help, Studying with Flashcards. https://help.quizlet.com/hc/articles/360030988091
28. Quackit, CSS 3D card flip (incl. reduced-motion note). https://www.quackit.com/css/animations/examples/css_animation_3d_card_flip.cfm
29. Duolingo Blog, streak milestone design and animation. https://blog.duolingo.com/streak-milestone-design-animation
30. FluentU, Clozemaster review. https://fluentu.com/blog/reviews/clozemaster
31. Blake Crosley, Things 3 design study *(3rd-party reconstruction)*. https://blakecrosley.com/guides/design/things
32. Linear, "Behind the latest design refresh". https://linear.app/now/behind-the-latest-design-refresh
33. Emil Kowalski, "Building a toast component" (Sonner). https://emilkowal.ski/ui/building-a-toast-component
34. Emil Kowalski, "Building a drawer component" (Vaul). https://emilkowal.ski/ui/building-a-drawer-component
35. VP0, "Flashcard swipe UI like Anki/Quizlet" *(3rd-party)*. https://vp0.com/blogs/flashcard-swipe-ui-like-anki-quizlet
36. iA Writer (product page and Focus Mode support). https://ia.net/writer
37. Craft Support, Offline. https://support.craft.do/en/introduction/offline.md
38. Amber Case, Principles of Calm Technology. https://www.caseorganic.com/post/principles-of-calm-technology
39. RemNote forum, "A quick way to exit the Study Queue". https://forum.remnote.io/t/a-quick-way-to-exit-the-study-queue/2287
40. Staggered list guidance (Flutter cookbook staggered menu; motion-design reference), rules of thumb only. https://docs.flutter.dev/cookbook/effects/staggered-menu-animation
41. Apple UIKit, `UISwipeActionsConfiguration.performsFirstActionWithFullSwipe`. https://developer.apple.com/documentation/uikit/uiswipeactionsconfiguration
42. Android Compose Material 3 Snackbar reference; Angular Material snack-bar accessibility note. https://developer.android.com/reference/kotlin/androidx/compose/material3/Snackbar.composable , https://v12.material.angular.io/docs-content/overviews/material/snack-bar/snack-bar
