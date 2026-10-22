# Motion & micro-interaction audit

Scope: every animation, transition, press/hover/focus state and haptic in the app as of this commit
(Next 16.4.2, React 19.3, Tailwind 4.3.3, vaul 1.1.2, @radix-ui/react-dialog 1.3.1). Read-only audit:
no app code was changed. Line numbers are from the current tree.

Brand frame for every fix proposed later (mockups/SPEC.md §1, DESKTOP-SPEC.md §1.7, §3): no gradients,
shimmer, box-shadow, glows, sparkles, emoji, pastel pills, confetti or streaks. Motion must read as paper
and ink: short, linear-ish, physical (a card slides, a stamp lands, a rule fills), never decorative.

---

## 1. Verdict in one paragraph

The app has **almost no motion system**. There are exactly two `@keyframes` in CSS (`card-turn-up/down`),
one keyframe injected from JS (`snackbar-in`), a hand-rolled swipe with a 180 ms fly-out, a 200 ms
progress fill, and vaul's library defaults (500 ms). There are **no motion tokens**: durations
100/120/150/160/180/200/220/500 ms and three different "ease-out" curves are hard-coded at call sites.
**Nothing has an exit animation** except the vaul drawer and the swipe fly-out: the snackbar, desktop
dialogs, menus, tooltips, the grade bar, the session-done screen, deleted rows and the next review card
all appear/disappear by state swap. Press feedback on touch exists for most buttons (`active:bg-surface-2`)
but is instant and missing on several key surfaces (library rows, import checkboxes, grade-bar on phones
is only a bg tint, no haptic). `prefers-reduced-motion` is handled by one global kill switch that also
removes harmless opacity fades. Haptics fire only on card swipes (threshold, good, again) plus the
settings test button; an iOS 18+ fallback exists (hidden `<input switch>`), but the swipe-threshold tick
is likely silent on iOS because it runs in `pointermove`, outside a user activation.

---

## 2. Existing motion tokens

There are **none** in the design-token sense. `app/globals.css:5-28` / `:94-119` define colour, font and
radius tokens only; no `--duration-*`, `--ease-*` or `--animate-*` are declared in `@theme`.

What is used instead (inventory of every literal):

| Value | Where | What |
|---|---|---|
| 100 ms, Tailwind default curve `cubic-bezier(.4,0,.2,1)` | `components/ui/Button.tsx:35` | `transition-[opacity,background-color] duration-100` on all `Button`/`buttonClasses` |
| 120 ms (JS timeout) | `components/review/ReviewScreen.tsx:41` `FLASH_MS` | desktop key-grade ink flash before the card moves on |
| 150 ms, Tailwind default curve | `components/ui/Toggle.tsx:33` | `transition-colors duration-150` on the switch track |
| 150 ms (Tailwind default `transition-colors`) | `components/import/PickView.tsx:32`, `DeskPickView.tsx:60` | dropzone border/bg while dragging a file |
| 160 ms, CSS keyword `ease-out` | `components/ui/Snackbar.tsx:161,198`, `components/review/useInlineSnackbar.tsx:69` | `snackbar-in` (opacity 0→1, translateY 8px→0) |
| 180 ms, CSS keyword `ease-out` | `components/review/useSwipe.ts:15` `FLY_OUT_MS`; `ReviewCard.tsx:183` inline `transition` | card settle-back and fly-out |
| 200 ms, Tailwind default curve | `components/review/ReviewTopBar.tsx:111,115` | progress fill width and the phone tick `left` |
| 200 ms, Tailwind `ease-out` = `cubic-bezier(0,0,.2,1)` | `components/library/SwipeRow.tsx:164` | row snap open/closed |
| 220 ms, CSS keyword `ease-out` | `components/review/ReviewCard.tsx:216,270` | `card-turn-down` / `card-turn-up` |
| 500 ms, Tailwind default / `ease-out` | `components/import/ProcessingView.tsx:115,118,135,136`, `ShotPane.tsx:35`, `DeskProcessingView.tsx:102` | import scan line and progress |
| 500 ms, `cubic-bezier(.32,.72,0,1)` | vaul internals (`node_modules/vaul/dist/index.mjs`, `TRANSITIONS.DURATION = 0.5`) | bottom sheet slide in/out, overlay fade in/out |
| 400 ms (input guard, not motion) | `ReviewScreen.tsx:39`, `SessionDone.tsx:50` | keys ignored after a screen change |
| 500 ms (long-press) | `SwipeRow.tsx:6`, `WordTable.tsx:216` | long-press opens the row menu |

Gesture constants (good, unit-tested, in one place): `components/review/swipe.ts:8-19` —
`SWIPE_SLOP 10px`, `SWIPE_THRESHOLD 1/3 width`, `FLICK_VELOCITY 0.5 px/ms`, `FLICK_MIN_DISTANCE 32px`,
`VELOCITY_WINDOW_MS 100`, `ROTATION_PER_WIDTH 30°`, `MAX_ROTATION 15°`. Haptic patterns:
`lib/haptics.ts:22-26` — threshold 20 ms, good 40 ms, again `[35, 80, 35]`.

**Inconsistency worth fixing first:** "ease-out" means two different curves. Arbitrary values
(`animate-[card-turn-up_220ms_ease-out]`, inline `transform 180ms ease-out`, `snackbar-in 160ms ease-out`)
use the CSS keyword `ease-out` = `cubic-bezier(0,0,.58,1)`; the Tailwind utility `ease-out`
(`SwipeRow.tsx:164`, `ProcessingView.tsx:115`) resolves to `--ease-out: cubic-bezier(0,0,.2,1)`. Bare
`transition-*` classes without `ease-*` get `cubic-bezier(.4,0,.2,1)` (ease-in-out). Three curves for
what is conceptually one "settle" motion.

---

## 3. Area-by-area audit

Legend for gaps: **[press]** no/weak press feedback · **[swap]** abrupt state swap · **[exit]** missing
exit animation · **[tok]** inconsistent duration/easing · **[rm]** reduced-motion issue · **[hap]** haptic gap.

### 3.1 Review card — flip (`card-turn-up` / `card-turn-down`)

| | |
|---|---|
| Where | keyframes `app/globals.css:192-212`; applied `components/review/ReviewCard.tsx:216` (question side, `flip==="down"`) and `:270` (answer side, `flip==="up"`); state set in `ReviewScreen.tsx:210-221` |
| Now | The incoming face mounts with `perspective(1000px) rotateX(∓45deg)`, opacity .4 → 0, 1 over 220 ms CSS `ease-out`. The outgoing face unmounts instantly (`revealed ? <article> : <button>`). |
| Gaps | **[swap]** It is half a flip: no outgoing half, so the eye sees a cut then a tilt-in; with opacity starting at .4 the "flash" of the new face is visible. **[swap]** The grade bar under the card toggles `invisible` → visible instantly (`ReviewScreen.tsx:549-557`) while the card is still turning, and the phone hint line text swaps (`:544`). **[tok]** 220 ms is not shared with anything else. **[rm]** Under reduced motion the global kill switch removes it entirely (acceptable), but an opacity crossfade would still be allowed. On desktop, Space flips with the same animation (fine). |

### 3.2 Review card — swipe to grade

| | |
|---|---|
| Where | `components/review/useSwipe.ts`, `components/review/swipe.ts`, render in `ReviewCard.tsx:168-185`, `:194-198`, `:336-350` |
| Drag | Card follows the finger 1:1 (`transition: none` while `mode==="dragging"`, `ReviewCard.tsx:183`), `translateX(dx) rotate(clamp(dx/w·30°, ±15°))`. Axis lock after 10 px; vertical drags left to the browser (`touch-pan-y`). Good. |
| Stamp | «ЗНАЮ» (green, −8°) / «НЕ ЗНАЮ» (red, +8°) mono stamp in a 2 px outlined box; opacity = `progress × 0.9`, linear in distance to the 1/3-width threshold (`ReviewCard.tsx:336-350`, `swipe.ts:131-136`). |
| Release, decided | `haptic(outcome)` (`useSwipe.ts:94`), card animates to `sign(dx)·1.4·width` over 180 ms ease-out, then `onDecide` after `FLY_OUT_MS` (0 under reduced motion) (`useSwipe.ts:95-97`). |
| Release, undecided | Settles back to 0 over 180 ms ease-out (`useSwipe.ts:53-58`). |
| Next-card peek | While `moving`, an empty card shell (header only) at `scale(.96)` sits behind (`ReviewCard.tsx:194-198`). |
| Gaps | **[swap] Stamp only exists on the answer side.** It is rendered inside `<article>` only; swiping from the question side (allowed — `grade(…, swiped=true)`) shows tilt but no stamp, so the grade direction is not confirmed visually. **[swap]** The stamp has no "lock" moment at the threshold: opacity just keeps ramping; nothing changes when releasing would act (the only cue is the threshold haptic, which is silent on iOS — see §4). **[swap]** Fly-out duration is fixed at 180 ms regardless of release velocity, so a fast flick decelerates visibly; rotation does not continue. **[swap]** Next-card peek is static at `.96` and only a header; it does not scale toward 1 with drag progress, and when the real next card mounts it is at scale 1 instantly (a jump). After grading the new card simply appears — **no enter motion**. **[exit]** Grading with buttons or keys (`ReviewScreen.tsx:263-292`, `resetCard()` at `:267`) swaps the card with no exit at all — the same action has motion when swiped and none when tapped. **Minor bug:** after a cancelled drag `mode` stays `"settling"` forever (nothing resets it to `"idle"`), so `moving` stays true and the peek shell and `will-change` transform remain mounted behind the card until the card unmounts (`useSwipe.ts:53-58`, `ReviewCard.tsx:171,194`). Invisible, but wasteful. **[rm]** Under reduced motion, rotation still applies during the drag (direct manipulation, acceptable) but fly-out/settle snap. |

### 3.3 Grade buttons

| | |
|---|---|
| Where | `components/review/GradeBar.tsx:11-28` (tones), `:75-78` (classes); flash in `ReviewScreen.tsx:321-334` |
| Phone | `active:bg-surface-2` — instant grey tint while pressed; no transition, no scale, **no haptic**. The card then swaps instantly. |
| Desktop | Hover: `hoverable:ring-1` inset ring in the tone colour (1→2 px border look, nothing moves) — spec-correct. Press (`md:active:bg-*`) and key grade (`data-flash`) fill the button with the tone colour + `text-on-ink` for 120 ms (`FLASH_MS`), then grade. |
| Gaps | **[press]** On phones the press is just a faint surface-2 tint on an outlined button — weak compared with the desktop ink flash that the spec defines for "pressed" (DESKTOP-SPEC §3 "pressed / key-triggered grade"). **[hap]** No haptic on button grades even with haptics on, so swipe and tap feel different. **[swap]** Desktop: flash ends, then card swaps with no transition; ← / → keys grade without the card moving in that direction (the swipe fly-out could be reused for key grades). |

### 3.4 Progress line

| | |
|---|---|
| Where | `components/review/ReviewTopBar.tsx:108-118` |
| Now | 1 px ink fill (`transition-[width] duration-200`, default curve) and a 5 px tick (`transition-[left] duration-200`) on phones; 2 px fill on the running-head rule from 768 up. |
| Gaps | **[tok]** 200 ms with the default ease-in-out curve, not the card's curve. Updates land after the async `gradeCard` round-trip, so the fill moves ~1 frame after the new card appears (fine). The whole line unmounts on «Готово на сегодня» (`progress={cardsShown ? progress : null}`, `ReviewScreen.tsx:449`) instead of completing to 100 % first — the session never visibly "fills up". |

### 3.5 Session done («Готово на сегодня»)

| | |
|---|---|
| Where | `components/review/SessionDone.tsx`, mounted at `ReviewScreen.tsx:500-512` |
| Now | Card area is replaced by the receipt in one frame. While `loadDoneScreen` resolves, an empty `<div className="flex-1" />` renders (`SessionDone.tsx:93`), then everything pops in. Desktop focuses «Повторить ошибки» and swallows Space/Enter for 400 ms. |
| Gaps | **[swap]** No transition from the last card to the receipt and no "end of deck" moment (the brand forbids confetti; a quiet one is allowed: the last card leaving, the progress rule completing, the receipt rows ruling in one by one like a printed slip). **[swap]** Blank frame before data. |

### 3.6 Snackbar (app + inline review snackbar)

| | |
|---|---|
| Where | `components/ui/Snackbar.tsx:158-182` (bar), `:198` (keyframes injected via `<style>`), close `:120-127`; inline variant `components/review/useInlineSnackbar.tsx:57-91` |
| Enter | `motion-safe:animate-[snackbar-in_160ms_ease-out]`: opacity 0→1, translateY 8→0. Re-keyed per entry, so a replacing snackbar replays the enter. |
| Exit | **None.** `setEntry(null)` removes it instantly on timeout (5 s / 7 s), action, replace or hide. |
| Gaps | **[exit]** No exit. **[swap] Layout jump on phones:** the inline review snackbar sits in flow between the card and the grade bar (`ReviewScreen.tsx:548`); the card is `flex-1`, so showing the snackbar shrinks the card by ~64 px in one frame and hiding it grows it back. **[tok]** The inline variant depends on keyframes defined inside `SnackbarProvider`'s `<style>`, not in `globals.css` (implicit coupling). Action button press is `active:opacity-70` (instant). |

### 3.7 Sheets (vaul) and dialogs (Radix)

| | |
|---|---|
| Where | `components/ui/Sheet.tsx:135-196` (DrawerSheet), `:207-280` (DialogSheet) |
| Phone sheet | vaul defaults: slide from bottom 500 ms `cubic-bezier(.32,.72,0,1)` in and out, overlay `fadeIn`/`fadeOut` 500 ms; drag-to-dismiss with vaul's velocity logic. Handle 36×4 bar. |
| Desktop dialog | **No animation in or out** — stated in code (`Sheet.tsx:223`: "No exit animation here"). Scrim `--scrim-desk` and the dialog appear/disappear in one frame. |
| Gaps | **[tok]** 500 ms is the slowest thing in the app and slower than iOS's own sheet feel for small sheets (folder picker, word menu); fine for the tall quick-add. **[swap]/[exit]** Desktop dialogs pop. **[rm]** The global `animation: none !important` stops vaul's slide (good), but vaul still waits its 500 ms timer before calling `onAnimationEnd`, so `onClosed` (e.g. `WordList` follow-up actions) fires 500 ms late under reduced motion. Nested sheets (`Drawer.NestedRoot`) scale the parent — vaul default, untuned. |

### 3.8 Menus, tooltips, popovers

| | |
|---|---|
| Where | `components/library/Menu.tsx:205-221`; `components/ui/AbbrHint.tsx:92-96` |
| Now | Menu renders at `-9999` then jumps into place after a layout effect; no fade. AbbrHint tooltip toggles on tap/hover instantly. DESKTOP-SPEC §3 asks for a 500 ms hover delay on tooltips; no tooltip component implements a delay. |
| Gaps | **[swap]/[exit]** Instant in/out (acceptable for a desktop tool, but a 80–120 ms opacity fade would remove the pop). |

### 3.9 Chips, toggles, segmented controls, checkboxes

| Control | Where | Now | Gaps |
|---|---|---|---|
| Chip | `components/ui/Chip.tsx:50-58` | `active:bg-surface-2`; selected = ink fill; no transition | **[press]** instant tint only; **[swap]** selected state swaps in one frame |
| Toggle (switch) | `components/ui/Toggle.tsx:33-37` | Track `transition-colors duration-150`; thumb position flips via `justify-start`/`justify-end` | **[swap]** thumb **teleports** — `justify-*` cannot transition; colour fades while the knob jumps, which reads as a glitch. No press state, no haptic. |
| Segmented | `components/ui/Segmented.tsx:88,97` | bg/text swap, no transition, no press state | **[press]** no `active:` at all; **[swap]** |
| Import row checkbox | `components/import/ImportRowItem.tsx:51-62` | 20 px box, ink fill + check on toggle, no transition | **[press]** no `active:` feedback on a 44 px target used dozens of times per import |
| Desktop CheckMark / CheckboxRow | `components/library/Checkbox.tsx:13-16`, `components/settings/DesktopControls.tsx:101-120` | instant fill | fine for desktop; no check-draw |
| Stepper | `components/settings/Stepper.tsx:15` | `active:text-muted` | weak but present |
| Text options (desktop) | `TextOptions.tsx:60`, `DeskRowEditor.tsx:40` | underline appears instantly | fine |

### 3.10 Library list rows (phone) — swipe actions and long-press

| | |
|---|---|
| Where | `components/library/SwipeRow.tsx`, used in `components/library/WordList.tsx:140-180` |
| Now | Horizontal drag past 8 px slop reveals «Переместить» / «Удалить» (160 px). Rubber-band ÷4 past either end (`:103`). Release opens if past half (`:116`); snaps with `transition-transform duration-200 ease-out` (`:164`). Long-press 500 ms (touch only) opens the word menu sheet (`:82-85`). |
| Gaps | **[press]** The row button has **no `active:` state** (`bg-paper`, `:163`) — tapping a word gives zero feedback until the detail sheet slides up 500 ms later. **[hap]** No haptic when the row crosses the open threshold, on long-press firing, or on delete. **[swap]** Long-press has no visual progress (no tint building over 500 ms), so users cannot tell it is armed. Snap is distance-based only (no velocity flick). **[exit]** Deleting (`WordList.tsx:118-129`) removes the row instantly — no collapse — and the undo snackbar appears; on undo the row pops back. Action buttons: `active:opacity-80`. |

### 3.11 Desktop word table, drag and drop to sidebar themes

| | |
|---|---|
| Where | `components/library/WordTable.tsx:216-313`; `components/shell/dnd.ts:97-155`; `components/shell/NavParts.tsx:35-39` |
| Now | Row hover `hoverable:bg-hover` (instant). Coarse-pointer long-press 500 ms opens the row menu. Drag uses a custom ghost via `setDragImage` (white, 1 px ink, word + «+N»). While dragging, every theme row gets a 1 px dashed muted outline; the hovered target gets 2 px ink outline + white bg and shows «+N» instead of its count. Drop → `moveWords` → snackbar «Перемещено в «X»» with undo. |
| Gaps | **[swap]** Drop-target outlines appear/disappear in one frame (acceptable — spec-exact). **[swap]** After a drop, nothing on the target acknowledges it (count just changes; the moved rows vanish from a filtered table instantly). A one-shot ink underline/fill pulse on the target row and a collapse of the moved rows would close the loop. No haptics on desktop (correct). |

### 3.12 Tab bar, rail, sidebar active state

| | |
|---|---|
| Where | `components/ui/TabBar.tsx:31-33` (2 px red `TabMarker`), `:40`, `:63`; `components/shell/NavParts.tsx:25-32` (`ActiveBar`) |
| Now | Active tab: ink 600 + 2 px red bar at the top, swapped instantly on route change. Inactive press: `active:text-ink`. «Добавить» opens the quick-add sheet. |
| Gaps | **[swap]** Marker teleports between tabs; no press feedback beyond colour. No route transition (no `loading.tsx`, no View Transitions; `next.config.ts` has none). The marker could slide (transform on one shared element) at 160–200 ms. |

### 3.13 Focus rings and hover

| | |
|---|---|
| Where | `app/globals.css:183-188` (global `:focus-visible` 2 px ink, offset 2); in-row `-2px` offsets at call sites; `hoverable:` custom variant `app/globals.css:86-92` (`(hover:hover) and (pointer:fine)`) |
| Now | Focus ring instant (correct — focus should never animate in). Hover states instant everywhere except `Button` (100 ms). |
| Gaps | Hover is consistent with the spec (no hover on touch thanks to `hoverable:`). Minor **[tok]**: `Button` fades hover/active over 100 ms but chips, icon buttons, menu items, table rows do not — pick one. `SessionDone.tsx:111,173` and `EmptyStates` override focus with `md:focus:outline-*` (not `focus-visible`) on purpose (landing focus). |

### 3.14 Import flow (screenshot)

| | |
|---|---|
| Where | `components/import/PickView.tsx:32-33`, `ProcessingView.tsx:26-46,55-68,112-136,153-164`, `ShotPane.tsx:33-37`, `DeskProcessingView.tsx:102`, `GlobalImportDrop.tsx:100-104`, `ImportRowItem.tsx` |
| Now | Dropzone border/bg fade 150 ms. Processing: the thumbnail is "read" by a red 1 px scan line + paper veil moving to `progress%` (500 ms ease-out); a 1 px progress rule + tick (500 ms). Progress is synthetic (`processingProgress`, asymptotic in rows). Steps 01/02/03 with a static red «ИДЁТ» label. Found rows stream in under «Найдено»; four static skeleton rows with decreasing opacity sit below. |
| Gaps | **[swap]** Streamed rows pop in (no enter) and push the skeletons down in one frame. **Loading gap:** between upload and the first row the progress holds at 22 % with nothing moving — the screen looks frozen for several seconds; the scan line is the right brand device but only moves when progress changes. **[swap]** Global drop overlay appears/disappears instantly. Import review checkboxes: see §3.9. |

### 3.15 Add flow (quick-add sheet, AI suggestions)

| | |
|---|---|
| Where | `components/add/SearchPanel.tsx:245-265`, `components/add/parts.tsx:225-245` (`SkeletonRows`), `:513-515` (pending slang), `components/add/QuickAddSheet.tsx:169` (undo bar) |
| Now | «Варианты» shows 2 static hairline skeleton rows while streaming (spec: "loading = 2 grey hairline skeleton rows, no "думает…""). Results append as they stream. Rows have `active:bg-surface-2`. |
| Gaps | **[swap]** Each streamed variant pops in and the skeletons jump down; when the stream ends skeletons vanish in one frame. **[exit]** Undo line in the sheet appears/disappears instantly. Auto-enriched fields (translation, slang, theme) fill in without any "just filled" cue. |

### 3.16 Loading placeholders (non-review)

`Button` `loading` prop only disables + `aria-busy` (`Button.tsx:70-71`); callers swap the label to
«Подбираем…» etc. (spec-conformant: "the label is replaced by its progress text, width stays fixed").
`ReviewCardPlaceholder` (`ReviewCard.tsx:388-400`), `DeskPlaceholder`, `WordDetailBody.tsx:307,664`
(`min-h-40` empty), `LibraryScreen` «Загружаем…» are all static. No motion here is brand-correct (no
shimmer allowed); the gap is that long waits show no sign of life (see §3.14).

---

## 4. Haptics coverage

Implementation: `lib/haptics.ts`. `hapticSupport()` (`:35-40`) → `"vibrate"` (Android/Chrome:
`navigator.vibrate`), `"ios"` (iOS/iPadOS with no Vibration API: clicks a fresh hidden
`<label><input type="checkbox" switch></label>`, which plays the system haptic on **iOS 18+**, `:47-61`),
or `"none"`. «Не знаю» on iOS is two taps 120 ms apart (`:72`). Setting: `settings.haptics` (default on,
`lib/types.ts:109-110,146`), UI «Вибрация при свайпах» with a «Проверить» button
(`components/settings/SettingsScreen.tsx:143-161`) that plays `haptic("again")`.

So the premise "iOS haptics don't work because `navigator.vibrate` is unsupported" is **already partly
addressed**. Remaining iOS limits (documented in the file header, not verified on a device here):
- iOS < 18: nothing.
- The switch haptic only plays inside a user activation. `threshold` fires from `pointermove`
  (`useSwipe.ts:84`, `thresholdNotifier` `:83-94`), which is not an activation-triggering event, so the
  **threshold tick is most likely silent on iPhone** — the only "release now" cue disappears there.
- Requires «Системные тактильные сигналы» on.
- The fallback is a single fixed "selection" tick; there is no light/medium/heavy or success/error
  distinction on iOS (only the 1-vs-2 tap trick).

Coverage matrix (✓ = fires when haptics setting is on):

| Interaction | Haptic | Note |
|---|---|---|
| Swipe crosses threshold | ✓ (20 ms) | likely silent on iOS (pointermove) |
| Swipe release → «Знаю» | ✓ (40 ms / 1 tap) | |
| Swipe release → «Не знаю» | ✓ (35-80-35 / 2 taps) | |
| Grade button tap (phone) | — | inconsistent with swipe |
| Card flip | — | |
| Undo last answer | — | |
| Session complete | — | |
| Library row swipe opens actions | — | |
| Long-press opens word menu (row / table coarse) | — | the classic place for a tick |
| Delete word | — | |
| Toggle / segmented / chip | — | iOS native switches tick; ours don't |
| Import checkbox toggle | — | |
| Sheet drag-dismiss snap | — | |
| Settings «Проверить» | ✓ (again pattern) | |

The setting label scopes haptics to swipes; extending coverage means renaming it (e.g. «Вибрация»).

---

## 5. prefers-reduced-motion

| Where | Behaviour |
|---|---|
| `app/globals.css:214-221` | Global `*, ::before, ::after { transition: none !important; animation: none !important }` |
| `components/review/useSwipe.ts:24-25,97` | Grade applied immediately after release (no 180 ms wait) |
| `components/settings/useSectionSpy.ts:22,85` | `scrollIntoView` uses `auto` instead of `smooth` |
| `Snackbar.tsx:161`, `useInlineSnackbar.tsx:69` | `motion-safe:` prefix (redundant with the global rule) |

Gaps **[rm]**: (1) The kill switch is all-or-nothing; reduced motion should drop movement (translate,
rotate, scale, slides) but may keep short opacity crossfades and colour changes, which help orientation —
flip, snackbar and dialogs currently become hard cuts. (2) `!important` on `transition: none` also kills
the colour fade on Toggle/Button (harmless) and the progress fill (harmless). (3) vaul's 500 ms
`onAnimationEnd` timer still delays `onClosed` (§3.7). (4) Swipe rotation still applies while dragging
(acceptable as direct manipulation, but could be zeroed). (5) No JS motion code exists beyond the swipe,
so there is nothing else unguarded today — any new JS-driven animation must check
`matchMedia('(prefers-reduced-motion: reduce)')` the way `useSwipe.ts` does.

---

## 6. Prioritised gap list

1. **Add motion tokens** to `@theme` in `globals.css` (e.g. `--duration-press 80ms`, `--duration-quick 140ms`,
   `--duration-move 200–240ms`, `--duration-sheet 320–380ms`; `--ease-settle` for exits/settles and
   `--ease-standard` for in-place changes) and replace the literals listed in §2, including the two
   different "ease-out" curves.
2. **Card-to-card continuity in review**: enter motion for the next card (rise from the `.96` peek /
   stack position), exit for button/key grades (reuse the fly-out in the grade's direction), velocity-aware
   fly-out, peek that scales with drag progress. Fix the stuck `"settling"` mode.
3. **Stamp on the question side too**, plus a "lock" state at the threshold (full opacity, tiny 1→1.04
   stamp press) so the threshold is visible when the iOS haptic is silent.
4. **Exit animations** for snackbar (fade/translate 120 ms), desktop dialogs and menus (opacity 100–140 ms;
   no scale-from-zero, no shadow), session-done hand-off, deleted list rows (height collapse).
5. **Inline review snackbar layout jump** on phones: overlay it or reserve its slot.
6. **Press feedback** on library `SwipeRow`, import `RowCheckbox`, `Segmented`; stronger phone grade press
   (ink fill like desktop's flash, ~80 ms).
7. **Toggle thumb** must move with `transform: translateX` (not `justify-*`) so it can transition.
8. **Haptics**: tick on grade-button taps, long-press fire, row-action open, toggle; move the threshold
   threshold tick cannot be moved out of `pointermove` on iOS (it has to fire mid-drag), so compensate
   visually there (item 3). Rename the setting.
9. **Long waits**: give the import processing screen a slow, linear, brand-safe sign of life (the scan line
   travelling on its own while progress is stalled), and let streamed rows rule in (opacity + 4 px) instead of popping.
10. **Reduced motion**: replace the global kill switch with a rule that removes transforms but keeps ≤150 ms
    opacity/colour fades.
