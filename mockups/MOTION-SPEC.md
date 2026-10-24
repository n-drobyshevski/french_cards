# «Карточки для Лизи» — MOTION & LOADING spec (rev. 1, 2026-10-22)

Extends `mockups/SPEC.md` (v3) and `mockups/DESKTOP-SPEC.md` (rev. 2). Everything there still applies; this file
adds how things **move, wait and acknowledge**. Where this file and an older board disagree about motion or a
loading state, this file wins. Research behind every number: `docs/motion-research/` (audit-loading,
audit-motion, web-loading, web-motion, web-references). File:line references point at the tree as of this
revision.

Brand rules restated because motion is where they are easiest to break: **no gradients, no shimmer, no
box-shadow, no glow, no blur, no sparkles or «AI magic», no emoji, no pastel pills, no confetti, no streaks, no
count-ups, no bounce.** Motion is paper and ink: a card slides, a stamp lands, a rule is drawn, a row is written
or struck out. Nothing decorates.

---

## 1. Principles

1. **Paper has low mass and high friction.** Cards and rows move short distances (4–56 px), settle with no
   visible overshoot, and never wobble. The only overshoot in the product is the rubber stamp landing
   (2.7 %). Depth comes from overlap, offset and a darker hairline, never from shadow or scale > 1.02.
2. **Acknowledge, don't celebrate.** A grade is answered by the card leaving in the grade's direction and a
   progress rule stepping forward, nothing more. Thirty reps a session means every per-card motion costs
   < 250 ms and never blocks the next input. Delight is saved for one moment a day: «Готово на сегодня»
   (the red rule drawn across, a date stamp landing).
3. **Local is instant; only the network waits.** Dexie reads and writes are the truth, so they get no
   spinner, no skeleton flash and no pending state: the result appears, with undo. Loaders exist only for
   the network (AI, sync, auth), and only after a grace period.
4. **Nothing jumps.** Every region that fills in late has its final height from the first frame (reserved
   blank or a row-shaped skeleton of the exact row height). Target CLS = 0 on every screen in normal use.
   Content never blinks blank between two states: the old state stays until the new one is ready.
5. **One honest sign of life per region.** A long wait shows *one* status line that says what is happening
   («Читаем скриншот»), counts real things («Найдено 7»), and — only if it lasts — shows elapsed time
   («0:06») and a single slow ink motion. Bars never move backwards and never fake progress.
6. **The direction is the meaning.** Не знаю leaves left, Знаю leaves right, Сложно sinks; undo brings the
   card back from where it went. Things leave the way they came (snackbar down, sheet down, dialog fades
   down 4 px). Exits are faster than entrances.
7. **Every haptic has a visual twin; every motion has a reduced form.** Haptics are unreliable on the web
   (Safari has no Vibration API; the iOS switch trick is unofficial), so no rule is felt-only. Under
   `prefers-reduced-motion` movement becomes a short opacity fade — it is replaced, not deleted.

---

## 2. Motion tokens

### 2.1 Durations

| Token | ms | Used for |
|---|---|---|
| `--dur-instant` | 70 | press-in (scale / ink tint), checkbox ink fill, ink-fill commit on a grade button, stamp opacity at the lock |
| `--dur-quick` | 110 | fades of small things, hover tint, press release, tooltip in, toggle track colour, local content reveal (blank → data), reduced-motion crossfade |
| `--dur-exit` | 140 | anything leaving: snackbar out, menu out, dialog out, skeleton out, card exit after a button grade, strike-out line |
| `--dur-move` | 200 | short travel of a visible element: toggle thumb, tab marker, row snap, progress step, row height collapse/open, segmented slab |
| `--dur-enter` | 240 | anything arriving: snackbar in, dialog/menu in, streamed AI row, undo card return, scrim in, sheet close |
| `--dur-turn` | 320 | expressive one-offs: route slide (P2), session-done headline |
| `--dur-sheet` | 380 | bottom sheet open (vaul override of its 500 ms) |
| `--dur-flash` | 120 | hold of the ink-filled grade button before the card leaves (existing `FLASH_MS`) |
| `--dur-spotlight` | 1200 | paper fade: a changed thing is lit with `--surface-2` and fades to its normal bg |
| `--dur-done-hold` | 400 | hold a finished state (import ✓, progress 100 %) before moving on |
| `--dur-long-press` | 500 | long-press fire (existing constant, now also drives the visual charge) |
| `--dur-rule-draw` | 400 | the red rule on «Готово на сегодня» (scaleX 0→1) |

Nothing in the product exceeds 400 ms except the spotlight fade and the deliberate slow loops in §3.4.

### 2.2 Curves

| Token | Value | Used for |
|---|---|---|
| `--ease-standard` | `cubic-bezier(0.2, 0, 0.38, 0.9)` | elements visible throughout: thumb, tab marker, progress step, row height, segmented slab, headword glide |
| `--ease-enter` | `cubic-bezier(0, 0, 0.3, 1)` | arrivals (decelerate) |
| `--ease-exit` | `cubic-bezier(0.4, 0.14, 1, 1)` | departures (accelerate away), fly-outs |
| `--ease-press` | `cubic-bezier(0.2, 0, 0, 1)` | press in / out, ink fill |
| `--ease-linear` | `linear` | real progress, ink run, scan line, rule draw, spotlight fade |

Tailwind's `ease-out` (`cubic-bezier(0,0,.2,1)`), the CSS keyword `ease-out` and bare `transition-*` defaults are
retired. Every motion names one of these.

### 2.3 Springs (CSS `linear()`, bezier fallback)

| Token | Duration to use | Overshoot | Used for |
|---|---|---|---|
| `--spring-settle` | 350 ms | 0.1 % | swipe snap-back, next card settling from the stack, sheet open, dropped row settling |
| `--spring-lift` | 480 ms | 0.6 % | session-done headline settle (the only "slow" spring) |
| `--spring-stamp` | 300 ms | 2.7 % | rubber stamp landing (swipe lock, session-done date stamp) |

Opacity and colour never use a spring. Swipe fly-out keeps a JS-computed duration (it has a real release
velocity); springs are only for settles.

### 2.4 Distances

| Token | Value | Used for |
|---|---|---|
| `--dist-row` | 4 px | streamed row / revealed content rises this much |
| `--dist-pop` | 8 px | snackbar, dialog, next-card offset in the stack |
| `--dist-exit-card` | 56 px | card exit after a button grade (phone) |
| `--dist-sink` | 24 px | «Сложно» card sinks |
| `--press-scale` | .98 (large: cards, rows, grade buttons, primary buttons) / .96 (icon buttons, chips, checkboxes) |
| `--lift-y` | −2 px | lifted card / row (long-press, drag) |
| `--motion-scale` | 1 (multiplied into every translate/rotate; 0 under reduce) |

### 2.5 CSS to add to `app/globals.css` (replaces the global kill switch at `:214-221`)

```css
:root {
  --dur-instant: 70ms; --dur-quick: 110ms; --dur-exit: 140ms; --dur-flash: 120ms; --dur-move: 200ms;
  --dur-enter: 240ms; --dur-turn: 320ms; --dur-sheet: 380ms; --dur-spotlight: 1200ms;
  --dur-done-hold: 400ms; --dur-long-press: 500ms; --dur-rule-draw: 400ms;
  --loading-delay: 300ms; --loading-delay-fast: 150ms; --loading-min: 500ms; --link-pending-delay: 100ms;
  --motion-scale: 1; --press-scale: .98; --press-scale-sm: .96;
  --spring-settle: cubic-bezier(0, 0, 0.3, 1);
  --spring-lift:   cubic-bezier(0, 0, 0.3, 1);
  --spring-stamp:  cubic-bezier(0, 0, 0.3, 1);
}
@supports (transition-timing-function: linear(0, 1)) {
  :root {
    --spring-settle: linear(0, 0.006 1.1%, 0.024 2.4%, 0.05 3.7%, 0.092 5.3%, 0.176 7.9%, 0.495 16.9%,
      0.591 20.1%, 0.675 23.2%, 0.746 26.4%, 0.804 29.5%, 0.856 33%, 0.897 36.5%, 0.931 40.5%,
      0.957 45%, 0.977 50%, 0.99 55.7%, 1 69.8%, 1);
    --spring-lift: linear(0, 0.006 1.1%, 0.024 2.4%, 0.055 3.8%, 0.096 5.2%, 0.187 7.8%, 0.516 16.5%,
      0.616 19.5%, 0.702 22.6%, 0.774 25.6%, 0.833 28.6%, 0.883 31.9%, 0.922 35.2%, 0.953 38.9%,
      0.975 42.8%, 0.991 47.3%, 1.001 52.5%, 1.006 63.1%, 1);
    --spring-stamp: linear(0, 0.008 1.3%, 0.027 2.6%, 0.061 4.1%, 0.109 5.7%, 0.208 8.5%, 0.556 17.3%,
      0.657 20.3%, 0.744 23.2%, 0.818 26.2%, 0.878 29.1%, 0.927 32.2%, 0.964 35.4%, 0.99 38.5%,
      1.009 41.9%, 1.027 49.8%, 1.004 80%, 1);
  }
}
@theme {
  --ease-standard: cubic-bezier(0.2, 0, 0.38, 0.9);
  --ease-enter: cubic-bezier(0, 0, 0.3, 1);
  --ease-exit: cubic-bezier(0.4, 0.14, 1, 1);
  --ease-press: cubic-bezier(0.2, 0, 0, 1);
}
/* Reduced motion: replace movement with opacity; keep colour and ≤150 ms fades; stop loops. */
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-scale: 0; --press-scale: 1; --press-scale-sm: 1;
    --dur-move: var(--dur-quick); --dur-enter: var(--dur-quick); --dur-turn: var(--dur-quick);
    --dur-sheet: var(--dur-quick); --dur-rule-draw: 1ms;
    --spring-settle: var(--ease-standard); --spring-lift: var(--ease-standard); --spring-stamp: var(--ease-standard);
  }
  .motion-loop { animation: none !important; }   /* ink run, scan line travel */
  [data-vaul-drawer] { animation-name: sheet-fade !important; }  /* sheet appears, does not slide */
  ::view-transition-group(*) { animation-duration: 0s; }
}
```

Usage: `transition-[opacity,translate] duration-(--dur-enter) ease-enter`, `ease-(--spring-settle)`,
`translate: 0 calc(var(--dist-row) * var(--motion-scale))`. Durations stay in `:root` (not `@theme`) because they
change under reduce. Keyframes live in `globals.css` (move `snackbar-in` out of `Snackbar.tsx:198`).

### 2.6 Enter / exit asymmetry

| | Enter | Exit |
|---|---|---|
| Duration | `--dur-enter` 240 | `--dur-exit` 140 |
| Curve | `--ease-enter` | `--ease-exit` |
| Travel | `--dist-row` 4 / `--dist-pop` 8 px from the edge it belongs to | same direction it came from, or opacity only |
| Opacity | 0→1 within the first ~70 % | 1→0 over the whole exit |
| Order | in a content swap, starts after the exit (`delay: --dur-exit`) | always first |

### 2.7 Reduced-motion substitutions

| Motion | Default | Under `reduce` |
|---|---|---|
| Press scale | .98 / .96 | none; tint only |
| Answer reveal | headword glide + answer rises 4 px | answer fades 110 ms, headword jumps |
| Swipe drag | follows finger, rotates | follows finger, **no rotation**; stamp opacity still tracks |
| Stamp lock | scale 1.04→1 spring | opacity 1 at once |
| Fly-out / button-grade exit | translate + fade | fade 110 ms in place |
| Next card from stack | .96 → 1 settle | already at 1, fades in 110 |
| Snackbar, dialog, menu | 8 px rise + fade | fade only |
| Sheets | slide 380 / 240 | fade 110 |
| Row insert/delete | height + fade | height snaps, fade 110 |
| Spotlight paper fade | 1200 linear | kept (colour only) |
| Ink run, scan-line travel | looping | off; the status text and elapsed counter carry "alive" |
| Rule draw (done) | 400 ms | drawn at once |
| Toggle thumb | slides 200 | jumps; colour fades 110 |
| Exercise answer (§5.15) | fill 70, stamp 1.15→1 160, card exit / settle on «Дальше» | fill, stamp and card swap fade 110 in place |

JS motion (swipe, fly-out duration, view transitions) reads `matchMedia('(prefers-reduced-motion: reduce)')`
as `useSwipe.ts` does. Because durations shrink instead of becoming 0, `transitionend` still fires.

---

## 3. Loading-state rules

### 3.1 Thresholds

| Wait | Indicator | Delay before show | Minimum once shown |
|---|---|---|---|
| Tap / press | press state on `pointerdown` | 0 (≤ 1 frame) | — |
| Local Dexie read (first `useLiveQuery` tick) | **none**: region rendered as a reserved blank at final height | — | — |
| Local read still pending at 300 ms (cold start, first seed, upgrade) | static row-shaped skeleton in the reserved region | `--loading-delay` 300 | none (same-shape swap is invisible) |
| Local write (grade, move, delete, save) | **none**: result + undo snackbar | — | — |
| One network call, usually < 3 s (Варианты, enrich, «Обновить перевод и заметку», login) | inline: row-shaped skeleton or button label swap + one status line | 300 (150 after a typing debounce) | `--loading-min` 500 |
| Known-slow job, 3–30 s (screenshot import, «Разложить по темам», «Дополнить карточки») | staged steps + determinate 1 px bar + status line + streamed rows | **0** (start at once) | until done; finished state held `--dur-done-hold` 400 |
| Any wait passing 3 s | status line adds mono elapsed `0:03`, ticking each second | 3 s | — |
| Any wait passing 1.5 s | the region's ink run starts (§3.4) | 1.5 s | — |
| Wait passing 10 s | say why, keep «Стоп» reachable, rest of the app usable | — | — |
| Navigation (Link) still pending | 2 px pending mark on the tapped tile / tab | `--link-pending-delay` 100 | — |
| Background sync | **none** on screen; text status only in Settings / sidebar (§4.10) | 1 s for «синхронизация…» text | 500 |

The minimum applies to *indicators*, never to content: if real rows arrive while a same-shape skeleton is
showing, swap at once. The minimum exists only to prevent a blink to a *different* layout (skeleton → empty
state, label → label).

Implementation: one hook `useDelayedFlag(active, { delay = 300, min = 500 })` in `lib/use-delayed-flag.ts`
(idle → pending timer → shown, stamping the time → hold until `min` → idle). Where the indicator is always
mounted, do the delay in CSS instead (`opacity: 0; animation: fade-in var(--dur-quick) var(--loading-delay) both`)
so a fast result never paints it.

### 3.2 Which pattern for which wait

| Pattern | When | Look |
|---|---|---|
| **None** | local reads/writes, sync | reserved blank at final height; content fades in `--dur-quick` |
| **Button pending** | a submit that waits on network or may exceed 150 ms | §3.5 |
| **Inline skeleton + status line** | one region waiting on one network call | row-shaped skeleton rows in the exact slots + status line above them |
| **Staged progress** | multi-step jobs | step list (`01 · 02 · 03` with `ИДЁТ` / ✓), 1 px determinate bar, status line, count |
| **Streaming rows** | AI producing a list | whole rows replace skeleton slots one by one (§3.6) |
| **Pending mark** | slow navigation | 2 px mark, 100 ms delay (§4.12) |

Never: a spinner, three bouncing dots, «думает…», a typing caret, a full-screen loader, a top-of-page
progress bar, one indicator per item when a group is loading.

### 3.3 Skeleton visual (decision)

**Static ruled blanks.** A skeleton row is the real row's frame — same height, same padding, same 1 px
`--rule` hairline under it — with text stand-ins drawn as flat bars:

- bar fill `--surface-2` (#e8e8e4 / dark #262624), radius 2, height 8 px for a headword line, 6 px for a
  secondary line, 3 px for the slang-meter stand-in (4 segments 10×3, gap 2);
- bar widths vary per row from a fixed list (72/88, 96/64, 56/104, 80/72 px) so rows don't read as a pattern;
- bars sit on the real text baselines (headword bar top = headword cap height);
- a stack of skeleton rows fades in depth: opacity 1, .75, .5, .3 ("more may come", no count promised);
- **bars never move**: no shimmer, no gradient, no pulse on the bars themselves. The "alive" signal lives in
  the status line (§3.4), so there is one moving thing per region, and reduced motion loses nothing important;
- bars and rows are `aria-hidden`; the region has `aria-busy="true"` and one polite status (§3.7).

This unifies today's three fills (`bg-surface-2`, `bg-hover`, white `TileSkeleton`) into one component:
`components/ui/Skeleton.tsx` exporting `SkeletonBar`, `SkeletonRow({ height, lines })`, `SkeletonTile`.
Row heights in use: 44 (Словарь), 72 (Варианты), 56 (import stream), 64 (library «Все слова» row),
40 / 48 coarse (desktop table), 76 («Список» row with example line).

### 3.4 The status line (one per waiting region)

`components/ui/StatusLine.tsx`. Mono 11 px uppercase `.06em` muted, 20 px tall, `tabular-nums`, sitting on a
1 px `--rule` hairline that spans the region:

```
ПОДБИРАЕМ ВАРИАНТЫ                                   0:04
──────────────■■■■──────────────────────────────────────   ← 1 px rule; the ink run
```

- **Text** says the stage in words: «Подбираем варианты», «Читаем скриншот», «Составляем план · 3 / 12».
  It changes in place (Raycast pattern), never stacks. At the end it becomes the result: «3 варианта»,
  «Найдено 9 слов», «План готов», then (for transient regions) fades out `--dur-exit`.
- **Count** in the same line when real: «Найдено 7», «3 / 12». Plain tabular swap, no rolling digits.
- **Elapsed** right-aligned, appears after 3 s, `m:ss`, updates once a second. Hidden again on completion.
- **Ink run** (from 1.5 s): a 32 px × 1 px `--ink` segment travels the hairline left→right in 1400 ms
  `--ease-linear`, then rests 600 ms (2000 ms cycle), class `motion-loop`. This is the product's only
  indeterminate indicator. Not red. Stops (removed in the same frame) when the wait ends. Reduced motion:
  no run; elapsed time still ticks.
- **Determinate variant**: when the job knows its total, the hairline is a 1 px bar instead: a `--ink`
  fill `scaleX(p)` from the left, moving only on real events (`--dur-move`, `--ease-standard`), never
  backwards. No ink run on a determinate bar.

At most **one looping motion per screen**: on import the scan line over the thumbnail is the loop and the
status line has no ink run.

### 3.5 Button pending

`Button` gets `pending?: boolean` + `pendingLabel: string` (replaces `loading`, `components/ui/Button.tsx:54-80`):

1. On press: disable against a second tap **at once** (`aria-disabled`, pointer-events off) but keep full
   contrast — a pending button must not look disabled. The press ink/scale plays normally.
2. If still pending after `--loading-delay-fast` 150 ms (0 ms for known-network actions: «Войти», «Обновить
   перевод и заметку», «Отправить ссылку»), the label swaps to the progress verb: «Добавляем…»,
   «Применяем…», «Сохраняем…», «Входим…», «Подбираем…», «Импортируем…». Swap = old label fades out
   `--dur-exit`, new fades in `--dur-quick`.
3. **Width lock**: both labels stacked in one grid cell (`display:grid; > * {grid-area:1/1}`), the hidden
   one `visibility:hidden`; the button keeps the wider width with no measuring.
4. Primary (ink) button: label text at 72 % opacity while pending. Secondary: label muted.
5. Siblings in the same footer become `aria-disabled` but keep their look (no 40 % grey footer).
6. `aria-busy="true"` on the button, plus the region's polite status for the outcome.
7. Success: back to idle in one frame and the result speaks (sheet closes, snackbar). No check-mark morph,
   no green flash. Failure: idle label + error in place (§3.8).

`disabled` (can't) stays visually distinct: text `#8a8a85`, border `#d6d6d1`, with a reason where the spec
asks for one.

### 3.6 Streaming AI rows

- The section header and status line show at once; N skeleton slots are reserved, N = the expected maximum
  (Варианты: `settings.suggestCount` 1–3; import: 4 trailing; sort plan: 3 groups).
- Each arriving row **replaces the first skeleton slot in place** (no push-down): opacity 0→1 +
  `--dist-row` rise, `--dur-enter`, `--ease-enter`. Rows arriving in the same frame stagger 40 ms, total
  stagger capped at 200 ms (lists) / 300 ms (sort-plan groups).
- Only complete rows render (NDJSON line = one row). No partial text, no caret.
- When the stream ends, leftover skeleton slots leave in the same frame: opacity out `--dur-exit`, then
  height collapse `--dur-move` (`grid-template-rows: 1fr → 0fr`). Once the max row count is reached,
  remaining slots go immediately even if the stream is still open.
- Import only: the trailing fading stack (4 rows, opacity 1/.75/.5/.3) keeps sliding down under new rows —
  the stream has no known length — and leaves when the stream ends.

### 3.7 Screen readers

One pre-existing, empty `role="status" aria-live="polite"` per region (inside `StatusLine`), filled with short
statuses («Подбираем варианты» → «Варианты: 3»; «Найдено 7 слов»), at most one update per 2 s while
streaming. Never the stream itself. `role="alert"` only for blocking errors.

### 3.8 Errors and retry

- The error appears **where the indicator was, at the same height**, with one action: «Повторить».
  Partial results stay above it. No modal, no toast, no hard cut to another layout.
- Copy: short, specific, no exclamation marks: «Не удалось подобрать варианты», «Скриншот не прочитан —
  попробуйте ещё раз», «Нет сети — варианты появятся, когда она вернётся».
- Error notice look: 13 px Plex Sans ink, a 1 px `--again` rule on top of the slot (not a left accent bar),
  «Повторить» as an underlined tertiary button right-aligned. The status line reads «НЕ УДАЛОСЬ».
- Auto-retry: at most twice, only network timeouts, backoff 1 s / 3 s; the status line says «Повторяем…».
  Rate limit (429): no silent retry: status «Слишком много запросов · повторим через 0:12» counting down,
  one automatic retry at zero (`lib/reorg.ts:606-611` today waits silently up to 20 s × 3).
- Offline is decided **before** the wait: AI regions show their offline notice instead of a skeleton.

### 3.9 Cancel

- «Стоп» (import) / «Отмена» (plans, «Обновить перевод и заметку») is visible for the whole wait, acts
  immediately and **keeps what has arrived**.
- After a stop: status «Остановлено · 3 слова», the bar freezes where it was (muted), skeletons leave,
  «Стоп» turns into «Повторить» in the same slot (width-locked), focus moves to it.

---

## 4. Per-screen catalogue

Priority: **P0** = fixes a visible defect (jump, flash, frozen look, misleading state) or builds a primitive
others need; **P1** = the motion system on the main paths; **P2** = polish. IDs are referenced by the boards.

### 4.0 Shared primitives (build first)

| ID | What | P | Files |
|---|---|---|---|
| K1 | Motion tokens + reduced-motion substitution (§2.5); remove the global kill switch | P0 | `app/globals.css` |
| K2 | `useDelayedFlag` (delay/min state machine) | P0 | `lib/use-delayed-flag.ts` (new) |
| K3 | `Skeleton` (one fill, row-shaped, fixed heights) | P0 | `components/ui/Skeleton.tsx` (new); replace `parts.tsx:224-247` `SkeletonRows`, `ProcessingView.tsx` `SkeletonRow`, `FolderTile.tsx` `TileSkeleton`, `WordTable.tsx:161-166`, `DeskPlaceholder.tsx` |
| K4 | `StatusLine` (text, count, elapsed, ink run / determinate bar, polite live region) | P0 | `components/ui/StatusLine.tsx` (new) |
| K5 | `Button pending` with label swap + width lock | P0 | `components/ui/Button.tsx` and every `loading` caller |
| K6 | `Collapse` wrapper (height open/close via `grid-template-rows`) + `.spotlight` keyframe (paper fade) | P1 | `components/ui/Collapse.tsx` (new), `app/globals.css` |
| K7 | Press feedback utility: `active:` tint + `scale(var(--press-scale))` in `--dur-instant` `--ease-press`, release `--dur-quick`; `data-pressed` for gesture surfaces | P1 | `components/ui/*`, `SwipeRow.tsx:163`, `ImportRowItem.tsx:51`, `Segmented.tsx` |
| K8 | Haptics vocabulary + coverage (§5.13) | P1 | `lib/haptics.ts`, callers |

### 4.1 Review (phone)

| ID | Now | Proposed | P | Files |
|---|---|---|---|---|
| R1 | Loading placeholder is 46 px higher and 104 px taller than the real card; progress row, hint row and grade slot pop in (CLS) | Placeholder has the **final geometry**: progress row reserved (counts blank, 1 px track visible), card at its final y with the red header rule, hint row and grade-bar slot reserved. For 0–300 ms the card is blank; after 300 ms two static skeleton bars (headword 8 px × 40 %, pos 6 px × 24 %) appear. Real card: word fades in `--dur-quick`, no geometry change | P0 | `ReviewScreen.tsx:488-494`, `ReviewCard.tsx:388-400` |
| R2 | Blank placeholder card for 1–3 frames after every grade | The outgoing card stays in its exit pose until the next card is ready; the next card is pre-rendered as the stack card (R5), so there is no placeholder between cards. Placeholder only if the next read takes > 300 ms | P0 | `ReviewScreen.tsx:165-167, 533-535` |
| R3 | Half flip: new face tilts in over 220 ms, old face vanishes; grade bar pops | **Reveal = rewrite, not 3D turn.** Tap: card presses (.98, 70 ms). The headword glides from its centred question position to its answer position (FLIP translateY, `--dur-move`, `--ease-standard`); the slang meter, translation, note, example and footer write in (opacity 0→1 + 4 px rise, `--dur-enter`, `--ease-enter`, 120 ms after the glide starts — the headword has then covered ~80 % of its travel; at +40 ms the translation overlapped the still-moving POS line). Grade bar labels fade in `--dur-quick` (the bar's slot is always reserved). «тап — вопрос»: answer block fades out `--dur-exit`, headword glides back. Reduced: answer crossfade 110 ms. Retire `card-turn-up/down` | P1 | `ReviewCard.tsx:216,270`, `globals.css:190-212`, `ReviewScreen.tsx:544-557` |
| R4 | Swipe: stamp only on the answer side, no lock moment, fixed 180 ms fly-out, static header-only peek, stuck `settling` mode | Stamp on **both** sides; opacity ramps 0 at 16 px → .6 just before the threshold; at the threshold it **locks**: opacity 1 in `--dur-instant` and lands `scale 1.04→1` `--spring-stamp` 300 ms (visual twin of the haptic). Back under the threshold: falls back to ≤ .6 in `--dur-quick`. Rotation keeps today's slope (30°/width) but caps at **8°** (was 15°). Release past threshold or flick ≥ 0.5 px/ms: fly-out to 1.2 × width at release velocity, duration = remaining / v clamped 120–220 ms, `--ease-exit`. Below: snap back `--spring-settle` 350 ms. Fix: `mode` returns to `idle` after settle | P1 | `useSwipe.ts`, `swipe.ts:8-19,131-136`, `ReviewCard.tsx:168-198,336-350` |
| R5 | Next-card peek: empty header-only shell at fixed .96; real card then jumps to 1 | The next card is rendered **with its real question face** behind (aria-hidden, inert) at `scale .96`, `translateY 8px`. While dragging it grows with progress to `.99 / 2px` at the threshold; on commit it settles to `1 / 0` with `--spring-settle` 350 ms, starting with the fly-out (overlap). It is interactive the moment the old card starts leaving | P1 | `ReviewCard.tsx:194-198`, `ReviewScreen.tsx` |
| R6 | Button grade swaps the card with no motion; phone press is a faint grey tint, no haptic | Button press: ink-fill (bg = tone colour, text on-ink) in `--dur-instant`, held `--dur-flash` 120 ms. Then the card exits in the grade's direction: Не знаю ← / Знаю → `--dist-exit-card` 56 px + rotate ±3° + opacity → 0, `--dur-exit` `--ease-exit`; Сложно sinks 24 px + fade. Next card settles from the stack (R5) at the same moment. Haptic on commit (`good` / `again`; `hard` = tick). Total ≤ 350 ms, input open after 120 ms | P1 | `GradeBar.tsx:75-78`, `ReviewScreen.tsx:263-292,321-334` |
| R7 | Undo just swaps | Undo (header button): the previous card **returns from the side it left** (translateX from ±56 px, opacity 0→1, `--dur-enter`, `--ease-enter`), question side up; the current card drops back into the stack (scale 1→.96, `--dur-move`). Progress line steps back. Haptic tick. Z on desktop: no travel | P1 | `ReviewScreen.tsx:223-260` |
| R8 | Progress fill animates `width`/`left` 200 ms default curve; line unmounts at the end | `transform: scaleX(p)`, origin left, `--dur-move` `--ease-standard`; phone tick moves with `translateX`. On the last grade it fills to 100 % and holds `--dur-done-hold` before the done screen. Counter `07 / 30` is a plain `tabular-nums` swap | P1 | `ReviewTopBar.tsx:108-118`, `ReviewScreen.tsx:449` |
| R9 | Inline review snackbar sits in flow and shrinks the card by ~64 px | The snackbar overlays (absolute, above the grade bar, over the card's footer zone, `top layer`); the card never resizes | P0 | `useInlineSnackbar.tsx`, `ReviewScreen.tsx:548` |
| R10 | Done screen pops in after a blank `flex-1` frame | «Готово на сегодня» moment (§5.12). No blank frame: data is loaded during the progress hold (R8) | P1 | `SessionDone.tsx:69,93`, `ReviewScreen.tsx:500-512` |
| R11 | «Повторить ошибки» / «Ещё практика» grey out while the queue builds | `Button pending`, delay 150 ms (usually never shows) | P2 | `SessionDone.tsx:168-184` |
| R12 | No last-grade echo | Optional: the newest progress segment takes the grade colour (good / again; ink for hard) and fades to ink over `--dur-spotlight`. Peripheral, no text | P2 | `ReviewTopBar.tsx` |

### 4.2 Quick add («Новое слово» sheet)

| ID | Now | Proposed | P | Files |
|---|---|---|---|---|
| A1 | vaul 500 ms in and out, overlay 500 ms | Open: `--dur-sheet` 380 `--spring-settle`, scrim `--dur-enter`. Close: `--dur-enter` 240 `--ease-exit`, scrim `--dur-exit`. Override via CSS on `[data-vaul-drawer][data-state=open|closed]`; never chain visible UI on vaul's 500 ms `onAnimationEnd` timer — use our own token timers | P1 | `components/ui/Sheet.tsx:135-196`, `globals.css` |
| A2 | «Варианты» skeleton rows 44 px vs real 72 px; rows push the list down; skeletons stay past the max; collapse at the end (CLS .063) | Reserve N × 72 px slots (N = «Вариантов» setting) as soon as the query is non-empty. Status line «ПОДБИРАЕМ ВАРИАНТЫ» + skeleton slots appear 150 ms after the debounce ends (min 500 ms). Rows replace slots in place (§3.6). End: status «3 ВАРИАНТА», fades after 1.2 s; leftover slots collapse | P0 | `SearchPanel.tsx:233-271`, `parts.tsx:224-247`, `lib/use-suggest.ts` |
| A3 | Error with no rows replaces the panel; «Словарь» jumps below | Section order is fixed (Словарь, Варианты, then the manual form). Error appears inside the Варианты slots: it takes the first slot at row height (72 px) with «Не удалось подобрать варианты» + «Повторить»; the other reserved slots leave (`--dur-exit`, then height `--dur-move`) as the quick manual form opens **below** it, so nothing above moves. With rows: rows stay, error line under them | P0 | `SearchPanel.tsx:112-122`, `QuickAddSheet.tsx:196-197` |
| A4 | «Словарь» pops in above Варианты on first open (lexique load) | While the lexique loads, «Словарь» reserves 3 × 44 px with its header; after 300 ms the reserved rows show skeleton bars; rows fill in place | P1 | `QuickAddSheet.tsx:145-156`, `lib/lexique.ts` |
| A5 | Picking a suggestion fills the form silently | The picked row ink-fills (`--dur-instant`); the form fields it filled get the **spotlight** (paper fade `--surface-2` → field bg, `--dur-spotlight`) | P1 | `QuickAddSheet.tsx`, `WordForm.tsx` |
| A6 | Auto-enrich: only the level says «определяется…»; example and theme fill silently; no failure state | After 300 ms of pending: the slang meter shows its unknown state (4 rule-coloured segments) + caption «определяется…»; the example field shows a mono «…» in its placeholder slot; the theme row caption «подбираем тему…». Each field lands with the spotlight. Fields the user typed are never touched. Failure: caption «не определилось» (muted), no alert. «Добавить» is never blocked | P1 | `use-auto-enrich.ts:24-65`, `parts.tsx:510-519`, `WordForm.tsx`, `DeskWordForm.tsx:63,203` |
| A7 | Save greys both footer buttons to 40 % | `Button pending` on the pressed button only («Добавляем…» after 150 ms); the sibling is `aria-disabled` at full contrast | P0 | `QuickAddSheet.tsx:385-405, 565-590` |
| A8 | Closing sheet re-renders the saved word as a duplicate («Карточка № 013», «Уже есть…»); snackbar over the sinking sheet | Freeze: on submit, snapshot the sheet body and render the snapshot during the exit; stop the duplicate liveQuery once saved. The snackbar «Добавлено · se casser · Отменить» enters **after** the sheet has cleared (delay = sheet close 240 ms). «Добавить и ещё»: the form clears with the fields fading out `--dur-exit` and the input refocused; the «Недавние» list gets the new row at the top (Collapse open + spotlight) | P0 | `QuickAddSheet.tsx:395-397` |
| A9 | Duplicate notice appears instantly | The «Уже есть в «Деньги»» block opens with Collapse `--dur-move` + fade; no shake, no red | P2 | `parts.tsx` |
| A10 | «Список»: rows grow 56→76 px when examples land; no status | Rows render at 76 px from the start (example line reserved, mono «…» while pending). One status line at the top «ОПРЕДЕЛЯЕМ · 4 / 12», determinate bar. Each row's level / theme / example land with the spotlight. Done: «ГОТОВО · 12 СЛОВ», fades | P1 | `ListPanel.tsx:158-172`, `QuickAddSheet.tsx:241-258` |

### 4.3 AI on existing words

| ID | Now | Proposed | P | Files |
|---|---|---|---|---|
| E1 | «Обновить перевод и заметку» label swaps but no cancel; phone greys the button | `Button pending` (0 ms delay, «Подбираем…») + a tertiary «Отмена» next to it; after 1.5 s the status line ink run under the button row. Result: the diff block opens with Collapse; accepted fields get the spotlight; undo snackbar | P1 | `WordDetailBody.tsx:1028-1034,1230-1256,1331-1340` |
| E2 | «Дополнить карточки» plan: static skeleton, «Подбираем примеры · n / m» | Same as the sort plan (S1–S3): steps, determinate bar on batches, elapsed, rows written in per group, «Применить» disabled with reason | P1 | `EnrichPlanSheet.tsx:165,200-201,303-305` |

### 4.4 Screenshot import

| ID | Now | Proposed | P | Files |
|---|---|---|---|---|
| I1 | 3–8 s frozen at 22 %; step 01 «Текст найден · ИДЁТ» before anything is found | Steps renamed to say what is happening: **01 «Читаем скриншот» · 02 «Слова, перевод и уровень» · 03 «Проверка повторов»**. Bar jumps only on real events: preparing → 8 %, uploaded → 20 %, first row → 30 %, rows asymptotic to 90 %, checking → 96 %, done → 100 %. While waiting for the first row the **red scan line travels** over the thumbnail top↔bottom (2400 ms `--ease-linear`, alternate, `motion-loop`) with a paper veil over the part not yet read (below the line, as built) and the status line shows elapsed after 3 s. Under reduce: scan line static at the bar's %. Status: «ЧИТАЕМ СКРИНШОТ» → «НАЙДЕНО 3» | P0 | `ProcessingView.tsx:16-22,86-91,112-143`, `DeskProcessingView.tsx`, `ShotPane.tsx` |
| I2 | Rows pop in and push skeletons down | Rows 56 px enter with §3.6 (opacity + 4 px, `--dur-enter`); the fading skeleton stack slides down `--dur-move` | P1 | `ProcessingView.tsx:152-165` |
| I3 | Hard cut from processing to review | Done: step 03 ✓, bar full, status «НАЙДЕНО 9 СЛОВ», hold `--dur-done-hold`. Then the review list replaces the stream **row for row** (same order, same top): checkboxes fade in `--dur-quick`, the header title changes in place to «Найдено 9 слов», the footer «Добавить 5 слов» rises `--dur-enter` | P1 | `ImportScreen.tsx:216-257`, `ReviewView.tsx` |
| I4 | «Стоп» keeps rows but no stopped state | Stop: §3.9 — «ОСТАНОВЛЕНО · 3 СЛОВА», bar frozen muted, skeletons leave, «Стоп» → «Повторить», plus «Дальше с 3 словами» primary | P1 | `ImportScreen.tsx`, `ProcessingView.tsx` |
| I5 | Errors are a hard cut; 429 carries `retryAfter` but no countdown | Error replaces the row area in place (thumbnail and steps stay; the failing step shows «НЕ УДАЛОСЬ» in again-red mono). 429: «Слишком много запросов · повторим через 0:12», countdown, one auto-retry. Keeps «Выбрать другой скриншот» | P1 | `ImportScreen.tsx:229-246`, `StatusView.tsx` |
| I6 | Checkboxes: no press, instant fill | Press .96 `--dur-instant`; check = ink fill `--dur-instant` + tick stroke draws (`stroke-dashoffset`) `--dur-quick`; unchecked row dims to .5 `--dur-quick`. Button count «Добавить 5 слов» → «Добавить 4 слова»: both labels stacked in one grid cell, crossfade `--dur-quick`, tabular numbers. Width eases `--dur-move` only where the button is content-sized (desktop); the phone footer button is `flex-1`, so its width does not change. No haptic (§5.13: never on every checkbox) | P1 | `ImportRowItem.tsx:51-62`, `ReviewView.tsx:229` |
| I7 | Phone «Добавить N слов» greys | `Button pending` «Добавляем…»; then navigate; snackbar «Добавлено 4 слова · Отменить» | P0 | `ReviewView.tsx:229` |

### 4.5 «Разложить по темам» (sort plan)

| ID | Now | Proposed | P | Files |
|---|---|---|---|---|
| S1 | Static «СОСТАВЛЯЕМ ПЛАН…» for 5–30 s; taxonomy pass shows no step; grey «Применить» reads broken | Sheet opens with: two steps «01 Темы» (taxonomy) and «02 Слова · 0 / 48» (assign batches), a determinate 1 px bar (step 1 = 0–20 % on completion, step 2 = batches), elapsed after 3 s, ink run during step 1 only (no total yet). Three skeleton group blocks (header bar + 2–3 row bars, real group geometry). «Применить» shows as `disabled` with the reason line «Можно применить, когда план готов» | P0 | `SortPlanSheet.tsx:58-82,236-256`, `lib/reorg.ts:651-674` |
| S2 | Groups appear at once at the end | Groups write in as blocks (§3.6, stagger 40 ms, cap 300 ms); rows inside a group do not stagger. When complete: status «12 ПЕРЕМЕЩЕНИЙ · 1 НОВАЯ ТЕМА», «Применить 10» becomes enabled (colour change `--dur-quick`) | P1 | `SortPlanSheet.tsx` |
| S3 | Error is one bare line | Error in place of the skeleton blocks, same height, «Не удалось составить план» + «Повторить»; 429 countdown as I5 | P1 | `SortPlanSheet.tsx:80,115-125,258+` |
| S4 | Toggle a group: instant; excluded rows | Toggle thumb slides (§5.9); excluded group dims to .5 `--dur-quick`; count in «Применить N» swaps | P2 | `SortPlanSheet.tsx` |
| S5 | Apply greys | `Button pending` «Применяем…»; sheet closes; snackbar «Разложено 10 слов · Отменить»; affected theme tiles get the spotlight once | P1 | `SortPlanSheet.tsx:94-120,151,474`, `LibraryScreen.tsx` |

### 4.6 Library, theme page, word sheet (phone)

| ID | Now | Proposed | P | Files |
|---|---|---|---|---|
| L1 | Three liveQueries insert «Дополнить карточки», «Разложить по темам», «Последняя раскладка» above the tiles (CLS .088 / .30 first run) | One combined query returns all action rows together. Until it resolves, the action block reserves the **last known height** (cached per device in `localStorage`, default one 56 px row + its 16 px top margin). Rows fade in `--dur-quick`; if the count differs from the cache, the block resizes once with Collapse `--dur-move` | P0 | `LibraryScreen.tsx:262,277,292` |
| L2 | Defaults flash: «Темы» view then «Все слова»; settings defaults then stored values | First frame reads `library_view` (and the settings screen's values) from a `localStorage` mirror written on every change; Dexie stays the source of truth and silently corrects the rare mismatch | P0 | `LibraryScreen.tsx:69`, `SettingsScreen.tsx:62`, `lib/settings` |
| L3 | Six `TileSkeleton`s on every visit; counts pop | Tiles region reserved (grid of N blank cells at tile height, N cached); skeleton tiles only after 300 ms (cold). Chip counts reserve width with `tabular-nums` + `min-width: 2ch`. Library and chip counts are gated by `ready` (no «0 слов» flash during seed) | P0 | `LibraryScreen.tsx:103,123-135,313`, `FolderTile.tsx:64` |
| L4 | «Все слова»: «ЗАГРУЖАЕМ…» with no rows | Reserved list; after 300 ms 8 skeleton rows of 64 px; no «Загружаем…» text | P1 | `LibraryScreen.tsx:196-231` |
| L5 | Search: «Ищем…» | Stale results dim to .5 (`--dur-quick`) when the deferred query lags > 150 ms; new results replace in place. Keep «Ищем…» only for a wait > 300 ms | P2 | `LibraryScreen.tsx:200-208`, `LibraryDesk.tsx:572` |
| L6 | Theme page opens blank, then title, progress, «⋯», rows in separate steps (28 px shift) | Header (back, title, «⋯»), progress row and «Повторить тему» footer render in the first frame with reserved heights; the title comes from the tile that was tapped (passed via the URL/state cache) so it is never empty. Tapped tile keeps its pressed tint until the route commits; after 100 ms its 2 px progress line is replaced by the ink run. P2: `nav-forward` view transition (24 px slide, old out `--dur-exit`, new in `--dur-enter`) | P0 (P2 slide) | `app/(app)/library/[id]/page.tsx:11`, `FolderScreen.tsx:54-187`, `FolderTile.tsx` |
| L7 | Row: no press; long-press has no charge; delete removes instantly; undo pops back | Press: `--surface-2` tint `--dur-instant` (no scale on full-width rows). Long-press: tint deepens to `--selected` over `--dur-long-press` as a visible charge; on fire the row **lifts** (`--lift-y` −2 px, hairline → ink, `--dur-quick`) + haptic tick, then the menu sheet opens. Delete: a 1 px ink strike-out line draws across the word (`scaleX`, `--dur-exit`, linear), then the row collapses (`--dur-move`, `--ease-exit`, opacity out `--dur-quick`); snackbar «Удалено · la thune · Отменить». Undo: row re-opens (Collapse) + spotlight | P1 | `SwipeRow.tsx:82-85,103-164`, `WordList.tsx:118-180` |
| L8 | Swipe actions snap on distance only, no lock | Actions follow the finger 1:1; release with velocity > 0.5 px/ms opens/closes regardless of distance; snap `--spring-settle`. Full swipe past 60 % locks «Удалить»: the button widens to fill the row (`--dur-move`) + haptic tick; release deletes (L7) | P2 | `SwipeRow.tsx` |
| L9 | Word sheet: content already there; `min-h-40` empty fallback | Keep. Fallback = reserved blank, never a skeleton under 300 ms. Field edits saved: spotlight on the field | P2 | `WordDetailSheet.tsx`, `WordDetailBody.tsx:307` |
| L10 | Moving a word (sheet / menu) | Source row collapses; target theme tile (if visible) gets the spotlight; snackbar «Перемещено в «Деньги» · Отменить» | P1 | `MoveMenu.tsx`, `TargetPickerSheet.tsx`, `WordList.tsx` |

### 4.7 Settings, sync, export

| ID | Now | Proposed | P | Files |
|---|---|---|---|---|
| T1 | Defaults shown greyed for ~0.75 s, then snap | L2 mirror; if no mirror exists (first run), rows render labels with **valueless** controls (no thumb, no number, segmented without selection) for up to 300 ms, values fade in `--dur-quick` | P0 | `SettingsScreen.tsx:61-63`, `DesktopSettings.tsx` |
| T2 | Toggle knob teleports (justify-*), track fades 150 ms | Thumb `translateX`, `--dur-move` `--ease-standard`; track colour `--dur-quick`; press .96; haptic tick | P1 | `components/ui/Toggle.tsx:33-37` |
| T3 | Segmented: instant bg swap, no press | An ink slab under the options moves with `transform` (`--dur-move` `--ease-standard`), text colour crossfades `--dur-quick`; press .96 | P2 | `components/ui/Segmented.tsx:88,97` |
| T4 | Stepper `active:text-muted` | Press tint + .96; number plain tabular swap | P2 | `components/settings/Stepper.tsx` |
| T5 | Sync line swaps text every cycle (width jitter, sidebar flicker); error detail never shown | Text states: «Синхронизировано · 14:02» (rest), «Синхронизация…» (only if a sync lasts > 1 s, min 500 ms), «Нет сети · изменения сохранятся» (neutral, not red), «Не синхронизировано · Повторить» (again-red dot, the error detail on a second muted line: «Сервер не ответил · 14:05»). Width-locked slot; dot colour crossfades. Tap «Повторить» → `Button pending` pattern on the line | P1 | `lib/sync.ts:312-341`, `settings/format.ts:43-53`, `DataSection.tsx:169-199`, `shell/data.ts:119-126`, `Sidebar.tsx:100`, `Rail.tsx:114` |
| T6 | Phone export / import / sign-out rows just grey | Rows swap their label in place: «Сохраняем…», «Читаем файл…», «Выходим…» (width-locked, `aria-busy`) | P1 | `DataSection.tsx:73-167,203-277` |
| T7 | Phones show no sync state outside Settings | Only on failure: the Library subline gains «· НЕ СИНХРОНИЗИРОВАНО» (again-red, links to Settings › Данные). Offline with pending changes: «· ОФЛАЙН» muted. Nothing while healthy | P2 | `LibraryScreen.tsx` |
| T8 | «Проверить» haptic test | Keep; setting renamed «Вибрация» (coverage now beyond swipes) | P1 | `SettingsScreen.tsx:143-161` |

### 4.8 Login / auth

| ID | Now | Proposed | P | Files |
|---|---|---|---|---|
| U1 | Label swap «Входим…» works | Keep; width-locked via `Button pending` (0 ms delay) | P2 | `LoginScreen.tsx:173-181,290` |
| U2 | Errors appear inline | Error text opens under its field (Collapse + fade `--dur-enter`), field border becomes 1 px again-red, focus returns to the field. No shake, no red flood | P1 | `LoginScreen.tsx` |
| U3 | Signed-out user sees the app, then a blank frame, then /login | If no cached session exists, route to /login before rendering the app; if the cached session turns out invalid, replace the app with the login screen in one frame (fade `--dur-quick`), never a blank frame | P1 | `components/auth/AuthGate.tsx:14-55` |
| U4 | Success → review | Navigate; the shell is static, only the card writes in (R1). No splash, no welcome | P2 | — |

### 4.9 App boot, PWA, offline

| ID | Now | Proposed | P | Files |
|---|---|---|---|---|
| B1 | Seed failure → empty library with no message | Notice in the library in place of the tiles: «Не удалось подготовить базу» + «Повторить» | P1 | `AppProviders.tsx:21-44`, `lib/seed.ts:272-284` |
| B2 | First paint OK | Keep: prerendered shell + R1 reserved card. No splash screen, no logo animation | — | `app/layout.tsx` |
| B3 | Offline page «Повторить» = reload, no pending, no auto retry | «Повторить» → «Проверяем…» (min 500 ms); listens to `online` and retries by itself; status «Ждём сеть» muted | P2 | `app/~offline/page.tsx`, `OfflineRetry.tsx` |
| B4 | AI requests time out offline | Offline is shown **before** a wait: Варианты slot shows «Нет сети — варианты появятся, когда она вернётся», import pick shows «Нужна сеть» on the button with reason, sort plan entry disabled with reason. Not styled as an error (muted, no red) | P1 | `SearchPanel.tsx`, `PickView.tsx`, `LibraryScreen.tsx` |
| B5 | SW update silent | Keep silent (P2: after an update, the next cold start is enough) | — | `RegisterSW.tsx` |

### 4.10 Shell: tab bar, snackbar, sheets, dialogs

| ID | Now | Proposed | P | Files |
|---|---|---|---|---|
| N1 | Tab marker teleports | One shared 2 px red marker moves with `translateX`, `--dur-move` `--ease-standard`, on tap (optimistic). Press: label tint `--dur-instant` | P2 | `components/ui/TabBar.tsx:31-63` |
| N2 | Snackbar: 160 ms enter, no exit; timers run while hidden | Enter `--dur-enter` (8 px rise + fade), exit `--dur-exit` (fade + 8 px down); replacement = old exits, new enters (overlap allowed). `popover="manual"` (top layer, above sheets) + `@starting-style` + `allow-discrete`. Timer pauses on `visibilitychange: hidden` and while touched | P1 | `components/ui/Snackbar.tsx:120-198`, `globals.css` |
| N3 | Sheets 500 ms | A1 tokens for all vaul sheets; nested sheets: parent scale untouched (vaul default kept) | P1 | `components/ui/Sheet.tsx` |
| N4 | Under reduce, vaul still calls `onClosed` 500 ms late | Our close timers use tokens; reduce → sheet fade 110 ms | P1 | `Sheet.tsx` |

### 4.11 Desktop specifics (≥ 768)

| ID | Now | Proposed | P | Files |
|---|---|---|---|---|
| D1 | Key grade: 120 ms ink flash, then instant swap (correct) | Keep: **no travel for keyboard**. Mouse-click grade: same as keys (flash + swap). The stack outlines behind the card show `min(2, remaining)` (`ReviewCard.tsx` `CardStack`), so they stay put while ≥ 2 cards remain; only when a grade leaves fewer than 2 does the deepest outline fade out `--dur-quick`. Holding a key never queues animations | P2 | `ReviewScreen.tsx:321-334`, `GradeBar.tsx` |
| D2 | Space reveal | Answer block writes in opacity-only `--dur-quick` (headword already at the top on desktop; no glide) | P1 | `ReviewCard.tsx` |
| D3 | Detail pane blinks 3–4 frames per ↑/↓ | Do not key `WordDetailBody` by id; keep the previous word rendered until the new one resolves (no `aria-busy` blank). Content swaps in one frame — no animation (keyboard) | P0 | `LibraryDesk.tsx:667`, `WordDetailBody.tsx:664` |
| D4 | First paint: DeskPlaceholder layout ≠ LibraryDesk layout (3 layouts in 900 ms, CLS .016) | DeskPlaceholder renders the **exact** LibraryDesk chrome (toolbar, search, filter strip, table header at their final y); only the rows are reserved; skeleton rows (40 px) after 300 ms | P0 | `DeskPlaceholder.tsx:5-18`, `LibraryDesk.tsx`, `WordTable.tsx:161-166` |
| D5 | Radix dialogs pop in/out | Dialog: opacity + 8 px rise `--dur-enter` `--ease-enter`; out opacity + 4 px down `--dur-exit`; scrim `--dur-enter` / `--dur-exit` (Radix `data-state` keyframes) | P1 | `components/ui/Sheet.tsx:207-280` |
| D6 | Menus jump from −9999 then appear | Position before paint; fade + 4 px from the trigger side `--dur-quick`; out opacity `--dur-exit`. No scale-from-zero | P1 | `components/library/Menu.tsx:205-221` |
| D7 | Tooltips instant, no delay | 500 ms first-open delay, then instant for neighbours while one is open; fade in `--dur-quick`, out instant; at once on keyboard focus | P2 | `AbbrHint.tsx:92-96`, tooltip callers |
| D8 | Drop on a sidebar theme: nothing acknowledges it | Drag: source rows dim to .5 `--dur-quick`. Drop: target sidebar row gets the spotlight and its count swaps; moved rows collapse from a filtered table (`--dur-move`); snackbar «Перемещено в «Деньги» · Отменить» | P1 | `components/shell/dnd.ts:97-155`, `NavParts.tsx:35-39`, `WordTable.tsx` |
| D9 | Sidebar sync line flickers on every edit | T5 rules (1 s delay before «синхронизация…», width-locked) | P1 | `Sidebar.tsx:100`, `Rail.tsx:114` |
| D10 | Sidebar / rail nav: no pending cue | `useLinkStatus` → 2 px ink tick at the right end of the pressed row after 100 ms | P2 | `NavParts.tsx` |
| D11 | Hover tints: Button fades 100 ms, others instant | All hover tints `--dur-quick`, `hoverable:` only; focus rings never animate | P2 | `components/ui/*`, `WordTable.tsx` |

---

## 5. Micro-interaction catalogue

### 5.1 Press feedback
- Fires on `pointerdown` within one frame. In: `--dur-instant` `--ease-press`; release `--dur-quick`.
- Large surfaces (review card, grade buttons, primary/secondary buttons): tint + `scale(var(--press-scale))` .98.
  Small (icon buttons, chips, checkboxes, stepper, toggle): .96. Full-width list rows: tint only, no scale.
- Tint: `--surface-2` on white/paper; on ink buttons the bg lightens to `#2a2a2a` (dark: `#d6d6d1`).
- Gesture surfaces (ReviewCard, SwipeRow) set `data-pressed` from pointer events (iOS `:active` is unreliable)
  and cancel the press once a drag passes the 10 px slop.
- `touch-action: manipulation`; no ripple, no glow, never below .95.

### 5.2 Reveal (was "flip") — see R3
Question → answer: card press → headword glide `--dur-move` → answer block writes in `--dur-enter` (+120 ms, once the headword has cleared the answer's first line).
Answer → question: answer out `--dur-exit` → headword glides back `--dur-move`. Desktop: opacity-only, 110 ms.

### 5.3 Swipe — see R4, R5
| Phase | Visual | Timing |
|---|---|---|
| Drag 0–10 px | nothing (slop); press tint | — |
| Drag 10 px → threshold (⅓ width) | card 1:1, rotate `dx/w·30°` capped 8°; stamp opacity 0 (at 16 px) → .6; next card .96/8 px → .99/2 px | live |
| Threshold crossed | stamp opacity 1 + lands `scale 1.04→1`; haptic tick (Android) | `--dur-instant` + `--spring-stamp` 300 |
| Back under threshold | stamp falls to ≤ .6 | `--dur-quick` |
| Release committed | fly-out to 1.2 × width at release velocity; next card settles; grade haptic | 120–220 ms `--ease-exit`; settle `--spring-settle` 350 |
| Release cancelled | snap back to 0 / 0° | `--spring-settle` 350 |
Stamp: «ЗНАЮ» good green, −8°, top-left; «НЕ ЗНАЮ» again red, +8°, top-right; 2 px border, mono 20 px, radius 4, no fill (ink over the card, as built);
present on both card sides.

### 5.4 Grade acknowledgement (buttons) — see R6
Ink-fill 70 ms → hold 120 ms → card exits by direction (←, →, ↓) 140 ms while the next card settles 350 ms.
Progress line steps (R8). Optional echo (R12). Desktop keys: flash only (D1).

### 5.5 Progress line + counter
`scaleX`, origin left, `--dur-move` `--ease-standard`; never animates width/left. Counters are `tabular-nums`
plain swaps everywhere (no rolling digits, no count-ups). Determinate job bars move only on real events.

### 5.6 Snackbar — see N2
Ink bg, white 14 px text, «Отменить» underlined. In `--dur-enter` (8 px rise), out `--dur-exit` (8 px down),
5 s (7 s with an action), paused while the app is hidden or the bar is touched. Review snackbar overlays (R9).
One snackbar at a time; a new one replaces the old (old exits, new enters).

### 5.7 Sheets and dialogs — see A1, D5
Phone sheet open 380 `--spring-settle`, close 240 `--ease-exit`, scrim 240/140. Content inside never animates
on open (it is already there). Closing after a submit freezes the content (A8). Desktop dialogs fade + 8 px.

### 5.8 Chips
Selected = ink fill crossfade `--dur-quick`; press .96. «подобрано автоматически» caption fades in `--dur-quick`
when detection picks the chip, chip gets the spotlight.

### 5.9 Toggles, segmented, checkboxes
Toggle thumb `translateX` `--dur-move` `--ease-standard`, track `--dur-quick`, haptic tick. Segmented ink slab
moves `--dur-move`. Checkbox ink fill `--dur-instant` + tick stroke draw `--dur-quick`; desktop checkboxes fill
only (no draw), keyboard toggles no motion.

### 5.10 Row insert / delete / move
- Insert (new word, undo of delete): Collapse open `--dur-move` `--ease-standard` + content opacity
  `--dur-enter` + spotlight `--dur-spotlight`.
- Delete: strike-out line (1 px ink, `scaleX` 0→1, `--dur-exit`, linear) → collapse `--dur-move` `--ease-exit`
  with opacity out `--dur-quick` → snackbar enters as the collapse starts.
- Move: source collapses; target acknowledges with the spotlight; no flying ghost across the screen.
- Bulk (sort plan apply, import commit, bulk delete): no per-row motion; one snackbar + one spotlight on the
  affected containers.

### 5.11 Drag and drop (desktop) — see D8
Lift: source rows .5 opacity `--dur-quick`; ghost as today (white, 1 px ink). Targets: dashed outlines as
today (instant). Drop: spotlight on the target + count swap; moved rows collapse.

### 5.12 «Готово на сегодня» (once a day)
Sequence (≈ 1 s, the only expressive moment): progress line reaches 100 % and holds 400 ms → last card exits
(`--dur-exit`) and the card area clears → «Готово на сегодня» (Newsreader 34) fades in over `--dur-turn` 320
while it rises 6 px on `--spring-lift` over its 480 ms → the 2 px red rule under it draws left→right (`scaleX`, `--dur-rule-draw` 400,
linear) → the receipt rows (Повторено 30 / Новых 4 / Верно 92 %) rule in top-down, 40 ms apart, each
opacity + 4 px `--dur-enter`, **numbers static** → the mono date stamp «22.10» (1.5 px ink border, −4°,
radius 2) lands at the right of the headline (`scale 1.04→1`, `--spring-stamp`) → one haptic (`done`) →
buttons fade in `--dur-quick`. Reduced: everything fades in together over 110 ms, rule drawn at once.
Never: confetti, count-up, streak, sound.

### 5.13 Haptics (decision: keep the iOS switch trick, never rely on it)
Keep `lib/haptics.ts` with both paths (Vibration API on Android Chromium; the hidden `<input switch>` on iOS,
reported to work 17.4–26.4 and possibly patched in 26.5 — unverified; harmless if silent). Fix its comment
("iOS 18+" → "iOS 17.4+, may stop working in later releases"). Rules:
- Fire **only on commit**, inside a user activation (pointerup / click). Exception: the swipe-threshold tick
  (pointermove) — Android only; on iOS it is skipped (`hapticSupport() === "ios"`), the stamp lock is its twin.
- Vocabulary (Android ms, keep ≥ 20 ms because short pulses are dropped; iOS = number of switch taps):

| Kind | Android | iOS | Fires on | Visual twin |
|---|---|---|---|---|
| `tick` | 20 | 1 | swipe threshold (Android), long-press fire, toggle, row full-swipe lock, undo, «Сложно» | stamp lock, lift, thumb, button widen |
| `good` | 40 | 1 | «Знаю» (swipe or button) | right exit, green stamp |
| `again` | 35·80·35 | 2 | «Не знаю» (swipe or button) | left exit, red stamp |
| `done` | 30·60·30·60·50 | 1 | «Готово на сегодня» (once) | rule draw, date stamp |

- Never: on keystrokes, scroll, streamed rows, sheet drag, every checkbox, desktop, or as the only signal.
- Setting renamed «Вибрация» (caption «При оценке, свайпах и переключателях»); «Проверить» plays `again`.

### 5.14 Spotlight (paper fade)
`--surface-2` background (dark `#262624`) applied at once, fading to the element's normal bg over
`--dur-spotlight` 1200 ms `--ease-linear`. Used for: fields filled by a pick or detection, a new / restored
row, a drop target, theme tiles after «Разложить». Never pulsing, never on more than one region at a time
(a bulk change lights the containers, not each row). The fields of one form filled by one pick or one detection count as
one region: lit together on a pick (A5), or each as it lands during detection (A6), where consecutive fades may overlap. Reduced motion: kept (colour only).

### 5.15 Exercise answer (added 2026-10-23; picks D4 B — C until the same day —, D5 C, D6 B in SPEC.md «Упражнения»; board M-Exercise-Answer)
A tap on an option is the answer (no «Проверить»). Sequence on phones:

| Step | Visual | Timing |
|---|---|---|
| Tap | the tapped tile ink-fills in the answer's tone (good `#1d6b45`, wrong `#b3261e`) and presses to .98; input closes; haptic `good` / `again` | `--dur-instant` 70 `--ease-press` |
| Result | the fill turns into the verdict border (2px good on the right tile + check; 1px again + cross on a wrong pick), the other tiles dim to `#d6d6d1`; «Не знаю» fades out and the result line fades in, in the same reserved 200 px zone | `--dur-quick` 110 `--ease-standard` |
| Stamp | «ВЕРНО» / «НЕВЕРНО» lands on the card: `scale 1.15→1` + opacity 0→1, rotation fixed at −4°. No spring, no overshoot — it settles from above the paper. Its background is the `surface` token, so nothing shows through | 160 ms `--ease-enter`, starts at 70 |
| Waits | right: the line shows `explain_ru` + «Слово ›»; wrong / «Не знаю»: the right answer too. Either way the black «Дальше» waits; nothing moves on by itself (the 1 s auto-advance on a right answer was dropped on 2026-10-23) | — |
| Next | card, grid and stamp leave together: translateX 0→−24 px + opacity→0; the result line fades. The next card enters from the right (24 px + fade) after the exit (§2.6); the progress line steps (§5.5), the counter swaps | exit `--dur-exit` 140 `--ease-exit`; enter `--dur-enter` 240 `--ease-enter` |

- Totals: an answer costs 70 + 160 until «Дальше» is live; «Дальше» then costs 140 + 240. Input during the
  230 ms before the line is in is ignored, never queued.
- Desktop: keys `1`–`4` behave as the tap (fill + stamp, no press scale on a key, as D1); `↵` is «Дальше»;
  no travel on the card swap for keys — the next card fades in 110 in place.
- Reduced motion: the fill, the verdict colours, the stamp (no scale) and the card swap all fade 110 ms in
  place (`--dur-quick`).
- Never: confetti, combo counters, streak flames, sound, a shake on a wrong answer.

### 5.16 «План дня» and «Уровень языка» (added 2026-10-24; SPEC.md «План дня и уровень языка»; no motion board)
Nothing new moves; these reuse the catalogue.
- «План на сегодня»: the phone sheet is §5.7 (A1); the desktop popover is a menu (D6: fade + 4 px from the
  summary `--dur-quick`, out `--dur-exit`).
- The reason subline under the progress line, the summary and the receipt numbers are plain text swaps (§5.5):
  no slide, no count-up. «Всё равно добавить новые» closes nothing: the button and its caption leave with the
  row collapse of §5.10, the numbers swap, and the new cards join the queue unseen (no insert animation).
- Wait screen: the minutes swap once a minute; no seconds, ring or progress bar. When the first card comes due,
  the card enters as after a grade (R5 settle). Reduced motion: a 110 ms fade in place.
- «НОВОЕ» tag, new-card ticks and the level badge: static, part of the card or row. A level saved from the word
  card swaps in place, with the field spotlight (§5.14).

---

## 6. Mockup boards

### 6.1 Board conventions (every M-* board)

- File `mockups/M-<Name>.dc.html`, skeleton and rules exactly as `SPEC.md` «Canvas file format» (phone) /
  `DESKTOP-SPEC.md` §6 (desktop): `support.js` include, `<x-dc>`, `<helmet>`, `data-dc-script` block with
  `class Component extends DCLogic`, fixed root size, inline styles, no box-shadow, no gradients, no emoji.
- **Exception for motion:** `<helmet><style>` may also hold `@keyframes` blocks. Keyframe names are prefixed
  with the board slug (`mrs-` for M-Review-Swipe, etc.) so boards never collide. Animations are applied with
  inline `style="animation: mrs-drag 3200ms cubic-bezier(0.2,0,0.38,0.9) infinite"`. Write literal values
  (ms and cubic-bezier / linear() numbers from §2) inline; name the token in the caption. No class rules, no
  JS-driven animation.
- **Loops** encode a timeline in one keyframe set (convert ms → %), always end with a ≥ 800 ms rest so the
  state can be read, and loop forever. A storyboard has at most one live frame; state boards may have up
  to three live elements.
- **Storyboard layout** (n frames): board `width = n·390 + (n−1)·40 + 80`, `height = 1044`. Backdrop
  `#e8e8e4`. Frames at `top: 40px`, `left: 40 + i·430 px`, 390×844, bg `#f1f1ee`, 1 px `#d6d6d1` outline.
  Between frames, centred in the 40 px gap at y = 462: a mono 13 px `→` muted. Caption band under each frame:
  `top: 900px` (16 px gap), 390 wide, 120 tall:
  - line 1: mono 11 px uppercase `.06em` muted — `01 · 0 МС` (step number and time from the start of the
    sequence);
  - line 2: Plex Sans 15 px 500 ink — the step name in Russian (≤ 40 chars);
  - lines 3–4: Plex Sans 12 px muted — what moves, e.g. «карточка уходит вправо на 56 px, прозрачность → 0»;
  - line 5: mono 11 px ink — tokens `--dur-exit 140 · --ease-exit`; a live frame adds a 1 px red rule above
    line 1 and the tag `LIVE` (mono 11 red) at the right of line 1.
- **State boards**: phone 390×844 (radius 28 on the canvas) or desktop 1440×800. Desktop boards may add a
  120 px caption band below the screen (board 1440×920, band bg `#e8e8e4`, same caption typography laid out
  as 3–4 columns) for the timeline.
- Timing annotations **inside** a frame are allowed only as quiet callouts: mono 10 px red `#c8331f` text
  with a 1 px red leader line, at most 3 per frame.
- Use SPEC sample data and the built-app facts: phone review header = chips «FR → RU» and «Все темы ▾» left,
  undo + gear right, progress row «23 к повторению · 4 новых … 07 / 30» with the 1 px line; the card is a white
  index card radius 6 with the 2 px red rule 44 px from the top, `FR · № 042` call number above it; hint row
  under the card «тап — ответ» / «тап — вопрос»; grade bar 3 outlined buttons 56 px (Не знаю «<1 мин»,
  Сложно «6 мин», Знаю «1 д»); tab bar per SPEC. Start from the geometry of `Main.dc.html`,
  `Review-Back.dc.html`, `Add-Suggest.dc.html`, `Import-Processing.dc.html`, `Library.dc.html`,
  `Sort-Plan.dc.html`, `Settings.dc.html`, `D-*.dc.html`.
- Add each board to `mockups/canvas.json` in a new region starting at `y: 13020`, one row per group
  (row pitch = tallest board + 160), `x` advancing by board width + 80; `title` = the board title;
  `radius: 28` for phone state boards only.

### 6.2 Board list (20 boards, 5 groups)

| Group | Board | Kind | Size | Covers |
|---|---|---|---|---|
| Review | M-Review-Reveal | storyboard 4 | 1760×1044 | R3, 5.1, 5.2 |
| Review | M-Review-Swipe | storyboard 5 | 2190×1044 | R4, R5, 5.3, 5.13 |
| Review | M-Review-Grade | storyboard 5 | 2190×1044 | R6, R7, R8, R12, 5.4 |
| Review | M-Review-Loading | storyboard 4 | 1760×1044 | R1, R2, R9 |
| Review | M-Session-Done | storyboard 5 | 2190×1044 | R8, R10, 5.12 |
| Add & AI | M-Add-Suggest | storyboard 5 | 2190×1044 | A2, A3, A4, 3.4, 3.6, 3.8 |
| Add & AI | M-Add-Detect | storyboard 4 | 1760×1044 | A5, A6, A10, 5.14 |
| Add & AI | M-Add-Save | storyboard 4 | 1760×1044 | A1, A7, A8, 3.5, 5.6 |
| Import & sort | M-Import-Wait | storyboard 5 | 2190×1044 | I1, I2, I3 |
| Import & sort | M-Import-Stop-Error | storyboard 3 | 1330×1044 | I4, I5, 3.8, 3.9 |
| Import & sort | M-Import-Commit | storyboard 4 | 1760×1044 | I6, I7, 5.9 |
| Import & sort | M-Sort-Plan | storyboard 5 | 2190×1044 | S1–S5, E2 |
| Library & system | M-Library-Load | storyboard 5 | 2190×1044 | L1, L2, L3, L6 |
| Library & system | M-Library-Rows | storyboard 5 | 2190×1044 | L7, L8, L10, 5.10 |
| Library & system | M-Settings-Sync | storyboard 4 | 1760×1044 | T1, T2, T3, T5, T6, T8 |
| Library & system | M-Boot-Offline | storyboard 4 | 1760×1044 | U1, U2, U3, B1, B3, B4 |
| Desktop & kit | M-Kit | reference sheet | 1440×1000 | K3–K7, 2.x, 3.3–3.5, 5.x |
| Desktop & kit | M-D-Review-Keys | state + band | 1440×920 | D1, D2, R8 |
| Desktop & kit | M-D-Library-Pane | state + band | 1440×920 | D3, D4, D6, D7, L5 |
| Desktop & kit | M-D-Dialogs-Drop | state + band | 1440×920 | D5, D8, N2 |
| Упражнения (added 2026-10-23, canvas row 21) | M-Exercise-Answer | storyboard 5 | 2190×1044 | 5.15, 2.6, 2.7, 5.1 |

Detailed briefs for each board follow in §6.3 (frames, states, Russian copy, timings, tokens).

### 6.3 Board briefs

#### Group: Review

**M-Review-Reveal.dc.html** — «Ответ: тап по карточке», 1760×1044

Storyboard, 4 phone frames (conventions: MOTION-SPEC.md §6.1; spec items R3, §5.1, §5.2). Phone review screen as built: header row with chips «FR → RU» and «Все темы ▾» left, undo + gear icon buttons right; progress row «23 к повторению · 4 новых» left, «07 / 30» right (mono, tabular), 1px ink line filled 23% over a #d6d6d1 track; white index card radius 6, 1px #d6d6d1 border, 2px red #c8331f rule 44px from its top with mono «FR · № 042» above it; hint row under the card; grade bar slot (3 outlined 56px buttons) above the tab bar (Повторение active). Word: «se casser», *v. pron.*, answer «свалить, сбежать», slang meter ▮▮▮▯ arg., note «Casse-toi — грубое «свали». Ещё значит «сломаться».», example rule then «Allez, on se casse d'ici.» (Newsreader italic 17) / «Ладно, сваливаем отсюда.» (13 muted), footer «ТЕМА: Повседневное». F1 «Вопрос, покой» 0 мс: question side, headword Newsreader 40 centred vertically in the card, *v. pron.* under it, card footer «тапни, чтобы перевернуть», hint «тап — ответ»; the grade bar slot is EMPTY but reserved (red callout «место под кнопки занято заранее»). Tokens line: «—». F2 «Нажатие» 0–70 мс: same, card drawn at scale(.98) from centre, callout «scale .98 на pointerdown». Tokens «--dur-instant 70 · --ease-press». F3 LIVE «Ответ пишется» 70–430 мс: one 3000ms loop: 0–600 question at rest; 600–800 headword glides up from its centred y to its answer y (translateY, cubic-bezier(0.2,0,0.38,0.9)); 720–960 answer block (meter, translation 22px 500, note, example, footer) fades 0→1 with a 4px rise, cubic-bezier(0,0,0.3,1); grade buttons «Не знаю <1 мин» (again #b3261e outline), «Сложно 6 мин» (#d6d6d1 outline), «Знаю 1 д» (good #1d6b45 outline) fade in 110ms at 800; hold answer to 2400; 2400–2540 answer block + buttons fade out (cubic-bezier(0.4,0.14,1,1)); 2540–2740 headword glides back; rest to 3000. Tokens «--dur-move 200 · --dur-enter 240 (+120) · --ease-enter». F4 «Ответ, покой» 430 мс: static answer side, hint «тап — вопрос», grade buttons visible. Caption lines: «обратно: ответ гаснет за 140 мс, слово скользит на место»; «reduced motion: только проявление 110 мс, без сдвига». No 3D rotation anywhere; no shadow.

**M-Review-Swipe.dc.html** — «Свайп: штамп и порог», 2190×1044

Storyboard, 5 phone frames (§6.1; spec R4, R5, §5.3, §5.13). Same review chrome as the built app (see M-Review-Reveal brief): chips, undo/gear, progress «07 / 30», grade bar with 3 outlined buttons, tab bar. Current card «la thune» on its QUESTION side (headword Newsreader 40, *n. f.*, call number «FR · № 017») — the point is that the stamp now works on the question side too. Behind it the next card rendered with its REAL question face «chelou» (*adj.*, «FR · № 019»; № 018 is «le fric» in M-Review-Grade / M-D-Review-Keys), white, 1px rule, red header rule. Stamp «ЗНАЮ»: absolute top 12px left 56px on the card, height 40, padding 0 14, 2px solid #1d6b45, radius 4, mono 20px 500, letter-spacing .16em, colour #1d6b45, rotate(-8deg). Card width 358 → threshold 120px. F1 «Тянем · 40 px» 0 мс: card translateX(40px) rotate(3.4deg), stamp opacity .1, next card scale(.963) translateY(7px). Callout «следует за пальцем 1:1». Tokens «— (прямое управление)». F2 «Почти порог · 110 px»: translateX(110px) rotate(8deg) (cap 8°, was 15°), stamp opacity .55, next card scale(.985) translateY(3px). Callout «наклон не больше 8°». F3 LIVE «Порог — штамп ложится» 120 px: 3600ms loop: 0–700 card drags 0→135px (rotation follows, capped 8°), stamp opacity ramps 0→.6; at the 120px crossing (~620ms) stamp jumps to opacity 1 in 70ms and lands scale 1.04→1 over 300ms using --spring-stamp linear() from §2.5; 1300–1500 drag back to 90px, stamp falls to .5 in 110ms; 1500–1800 forward to 135px, stamp lands again; 2000–2350 snap back to 0 with --spring-settle linear() 350ms, stamp fades out; rest to 3600. Callouts «вибрация tick — только Android», «на iOS видно штамп». Tokens «--dur-instant 70 · --spring-stamp 300». F4 «Отпустили — улетает»: card at translateX(300px) rotate(8deg) half out of the frame (clipped by the phone), stamp at full opacity, next card at scale(.99); caption «длительность = скорость пальца → 120–220 мс, --ease-exit; вибрация good 40 мс»; second caption line «влево: штамп «НЕ ЗНАЮ» #b3261e справа, +8°, вибрация again». F5 «Следующая на месте» 350 мс: «chelou» question side at rest at scale 1, progress «08 / 30» line 27%, hint «тап — ответ». Tokens «--spring-settle 350 · без пустой заглушки». No shadows under cards; depth only by overlap and hairline.

**M-Review-Grade.dc.html** — «Оценка кнопкой и отмена», 2190×1044

Storyboard, 5 phone frames (§6.1; spec R6, R7, R8, R12, §5.4). Built review chrome. Current card «la thune» ANSWER side: meter ▮▮▮▯ arg., «бабки, деньги», note «Синонимы: le fric, l'oseille», example «J'ai plus de thune.» / «У меня больше нет бабок.», footer «ТЕМА: Деньги». Next card in the stack: «le fric» question side. Grade bar: «Не знаю <1 мин» / «Сложно 6 мин» / «Знаю 1 д», grid 1.15fr .85fr 1.15fr, 56px, outlined per tokens. F1 «Нажатие «Знаю»» 0 мс: «Знаю» filled #1d6b45 with white text, scale(.98); callout «заливка чернилами 70 мс, держится 120 мс». Tokens «--dur-instant 70 · --dur-flash 120». F2 «Карточка уходит вправо» 120–260 мс: card translateX(56px) rotate(3deg) opacity .35; «le fric» behind at scale(.98) translateY(4px) settling; «Знаю» back to outline. Tokens «--dur-exit 140 · --ease-exit · вибрация good». F3 LIVE «Три направления»: 4400ms loop on the answer frame cycling the three grades, each segment ~1200ms: (a) «Не знаю»: button fills #b3261e 70ms, holds 120, card exits LEFT −56px rotate(−3deg) + fade over 140ms, next card scale .96→1 + translateY 8→0 over 350ms --spring-settle, then the scene resets; (b) «Сложно»: button fills #111111, card SINKS translateY(24px) + fade 140ms; (c) «Знаю»: right as F2; 800ms rest at the end. Callout «направление = смысл». F4 «Прогресс шагнул» 350 мс: «le fric» at rest (question side), counter plain swap «08 / 30», progress line drawn at 27% with the newest 4% segment in #1d6b45 (echo, fading to ink over 1200ms — P2 callout «эхо оценки, P2»). Tokens «--dur-move 200 · --ease-standard · scaleX». F5 «Отмена — возвращается справа»: header undo button pressed (surface-2 tint); «la thune» returning on its QUESTION side from the right: translateX(28px) opacity .65 (≈60 ms in — opacity runs over the first ~70 % of the enter, §2.6); «le fric» on its way back to scale(.96) behind (≈.984 / 3 px); counter «07 / 30». Tokens «--dur-enter 240 · --ease-enter · вибрация tick». Caption note: «на десктопе клавиши 1–3 и Z — без движения (см. M-D-Review-Keys)».

**M-Review-Loading.dc.html** — «Повторение: загрузка без прыжков», 1760×1044

Storyboard, 4 phone frames (§6.1; spec R1, R2, R9). Built review chrome. F1 «Холодный старт · 0–300 мс»: header chips and icons present; progress row present with its height but counts blank and only the 1px #d6d6d1 track; card at its FINAL position and height, white, red header rule, no text, no call number; hint row height reserved (empty); grade slot reserved (empty); tab bar. Thin red dashed callout rectangles around the reserved regions labelled «высота финальная». Tokens «— (ничего не мигает)». F2 LIVE «Дольше 300 мс»: 3000ms loop: 0–300 identical to F1; at 300 two static skeleton bars fade in (110ms) inside the card at the headword baseline: 8px tall × 40% width and 6px × 24%, fill #e8e8e4, radius 2; at 1400 the real content fades in 110ms (counts «23 к повторению · 4 новых», «07 / 30», line 23%, «se casser», *v. pron.*, call number «FR · № 042», hint «тап — ответ») while the bars fade out; hold to 2600; reset. Callout «бары не двигаются: без мерцания и градиента». Tokens «--loading-delay 300 · --dur-quick 110». F3 «Карточка на месте»: loaded question side; overlay a 1px red dashed outline 46px higher and 104px taller than the card labelled «было: заглушка выше на 46 px и длиннее на 104 px». Caption «CLS 0». F4 «Снекбар поверх, карточка не сжимается»: answer side of «le fric» (бабло, ▮▮▯▯ fam., «тема: Деньги»); ink snackbar (#111, white 14px, radius 6, 48px) overlaying the bottom of the card area 8px above the grade bar: «Не получилось сохранить ответ» + underlined «Повторить»; red callout on the card bottom edge «высота не изменилась (было −64 px)». Second caption line «после оценки сразу следующая из стопки — пустой карточки нет». Tokens «--dur-enter 240 вход · --dur-exit 140 выход».

**M-Session-Done.dc.html** — «Готово на сегодня», 2190×1044

Storyboard, 5 phone frames (§6.1; spec R8, R10, §5.12). The one expressive moment of the day. Tab bar (Повторение active) in every frame. F1 «Последняя оценка» 0 мс: card «se tirer» (свалить, arg.) exiting right translateX(56px) opacity .4; progress line full width ink, «30 / 30»; «Знаю» button just filled. Tokens «линия до 100 % · держим --dur-done-hold 400». F2 «Стол пуст» 400–540 мс: header row + full progress line; card area plain paper. Tokens «--dur-exit 140». F3 LIVE «Готово на сегодня»: 4200ms loop on the final layout: headline «Готово на сегодня» (Newsreader 34, 500) fades in 0–320 (--dur-turn, opacity linear) while rising 6px over 0–480 (--spring-lift linear() at its §2.3 duration); 320–720 a 2px #c8331f rule under the headline draws left→right scaleX 0→1, transform-origin left, linear; 720/760/800 three receipt rows rule in (opacity + 4px, 240ms cubic-bezier(0,0,0.3,1)): ruled table with 1px #d6d6d1 hairlines, labels Plex Sans 15 left, mono numbers right-aligned tabular: «Повторено 30», «Новых 4», «Верно 92 %»; 840 «Трудные» label + text line «chelou · la galère · se tirer»; 1100 a date stamp «22.10» (mono 13 500, 1.5px ink border, radius 2, padding 2 6, rotate(-4deg)) lands at the right end of the headline line, scale 1.04→1 with --spring-stamp linear() 300ms; 1400 buttons fade in 110ms: «Повторить ошибки (3)» primary ink 48px, «Ещё практика» secondary with caption «не влияет на расписание», muted line «Следующие 18 слов — завтра»; hold to 3500; 3500–3800 everything fades out; rest. Callout «одна вибрация done». F4 «Покой»: the static final state. Callouts «цифры не считаются вверх», «без конфетти и серий». F5 «Reduced motion»: same final state, caption «всё проявляется вместе за 110 мс, линия сразу нарисована, штамп без отскока». No confetti, no count-up, no streak, no sound icon.

#### Group: Add & AI

**M-Add-Suggest.dc.html** — «Варианты: поток без сдвигов», 2190×1044

Storyboard, 5 phone frames (§6.1; spec A2, A3, A4, §3.4, §3.6, §3.8). Quick-add sheet «Новое слово» over the dimmed review screen (scrim rgba(17,17,17,.4)), sheet top at 70px, 12px top radius, 1px rule top edge, grab handle, title Newsreader 22 «Новое слово», buttons «Скриншот» «Список», close X. Input 56px with value «se cass» and caret. Section «Словарь» (Plex Sans 500 13): 3 rows × 44px: «**se cass**er · verbe», «**se cass**er la tête · expr.», «**cass**e-croûte · nom m.». Section «Варианты» below with N=3 reserved slots of 72px each. Real row anatomy (72px, hairline under): FR Newsreader 19, RU 14 muted, right: slang meter + italic abbr, theme mono 11. F1 «Ввод · дебаунс 0–300 мс»: Словарь rows filled; Варианты header + 3 EMPTY reserved slots (red dashed callout «3 × 72 px заняты сразу»). Tokens «—». F2 «Через 150 мс после паузы»: status line above the slots: mono 11 uppercase muted «ПОДБИРАЕМ ВАРИАНТЫ» on a full-width 1px #d6d6d1 hairline; three skeleton rows 72px with static bars #e8e8e4 radius 2 (headword bar 8px × 96px, translation bar 6px × 140px, meter stand-in 4×(10×3), theme stub 6px × 56px), rows at opacity 1 / .75 / .5. Tokens «--loading-delay-fast 150 · минимум 500 мс». F3 LIVE «Строки встают в свои слоты»: 5200ms loop: 0 = F2 state; 1500 the ink run starts on the status hairline (a 32×1px #111111 segment travelling left→right in 1400ms linear, 600ms pause, repeating); 1600 row 1 replaces slot 1 in place (opacity 0→1 + 4px rise, 240ms cubic-bezier(0,0,0.3,1)): «se casser — свалить, сбежать · ▮▮▮▯ arg. · Повседневное»; 2300 row 2 «se casser la tête — ломать голову · ▮▮▯▯ fam. · Повседневное»; 3000 row 3 «casser les pieds — доставать, надоедать · ▮▮▯▯ fam. · Эмоции»; at 3000 the ink run stops and the status text changes in place to «3 ВАРИАНТА»; hold to 4400; reset. Callout «список не сдвигается». Tokens «--dur-enter 240 · --ease-enter». F4 «Готово»: 3 real rows, status «3 ВАРИАНТА» at 50% (fading, 1.2 s), «Заполнить вручную» text link under the list at the SAME y as in F1. Caption «лишние слоты уходят: --dur-exit 140, потом высота --dur-move 200». F5 «Ошибка на месте»: Словарь unchanged on top; the Варианты slot area shows a 1px #b3261e rule on top, text 13px ink «Не удалось подобрать варианты» and underlined «Повторить» right-aligned; status «НЕ УДАЛОСЬ»; below it the manual form opens (fields «Французский» = «se cass», «Русский» placeholder «Перевод», «Тема» «Входящие ▾»). Callout «Словарь не прыгает вниз». No «думает…», no caret in rows, no sparkle.

**M-Add-Detect.dc.html** — «Автозаполнение и «Список»», 1760×1044

Storyboard, 4 phone frames (§6.1; spec A5, A6, A10, §5.14). Sheet «Новое слово» expanded (top 70px) with the filled form from Add-Filled.dc.html: labels «Французский», «Русский», «Заметка», «Пример», «Уровень сленга» (segmented нейтр. / fam. / arg. / vulg. + «verl.» toggle), «Тема» chips, footer «Добавить и ещё» (secondary) + «Добавить» (primary). F1 «Вариант выбран — поля подсвечены» 0 мс: values from «se casser»: «свалить, сбежать», note «Casse-toi — грубое «свали». Ещё значит «сломаться».», example «Allez, on se casse d'ici.», level arg. selected, theme «Повседневное» selected + caption «подобрано автоматически»; every field the pick filled has background #e8e8e4 (spotlight start). Tokens «--dur-spotlight 1200 · --ease-linear». F2 «Вручную: определяем»: FR «la bagnole», RU «тачка», Заметка empty; «Уровень сленга»: the meter in its unknown state (4 segments in #d6d6d1) + muted caption «определяется…», segmented without a selection; «Пример» field shows a mono «…» muted; «Тема» row caption «подбираем тему…»; «Добавить» enabled (callout «не блокируется»). Tokens «через 300 мс ожидания». F3 LIVE «Поля приходят по одному»: 4400ms loop starting from F2: 900 level lands (segmented «fam.» selected, meter ▮▮▯▯ fam., caption gone) and that row background goes #e8e8e4 → transparent over 1200ms linear; 1500 example lands «J'ai garé la bagnole en bas.» with its spotlight; 2100 theme chip «Повседневное» selects (ink fill crossfade 110ms) + caption «подобрано автоматически» fades in, spotlight; hold to 3800; reset. Callout «то, что ввели руками, не трогаем». F4 «Список · 12 слов»: the «Список» panel: status line determinate «ОПРЕДЕЛЯЕМ · 4 / 12» over a 1px track with an ink fill at 33%; rows are 76px from the start (FR Newsreader 17, RU 14, meter, theme mono, and an example line): done rows «la thune — бабки · ▮▮▮▯ arg. · Деньги», «le fric — бабло · fam. · Деньги», «bouffer — жрать · fam. · Еда», «kiffer — тащиться · arg. · Эмоции» (this one with the #e8e8e4 spotlight, just landed); pending rows «chelou — стрёмный», «la meuf — девушка», «un pote — кореш» with the meter unknown state and a mono «…» example line at the same 76px. Callout «строки не растут 56 → 76». Tokens «полоса — только на реальных событиях».

**M-Add-Save.dc.html** — «Добавить: ожидание и закрытие», 1760×1044

Storyboard, 4 phone frames (§6.1; spec A1, A7, A8, §3.5, §5.6). Quick add opened from Library «Все слова» (underlying screen: «Библиотека», subline «158 СЛОВ · 23 К ПОВТОРЕНИЮ», view switch «Темы / Все слова», list rows 64px: la galère, kiffer, chelou …). Sheet shows the filled «se casser» form (as M-Add-Detect F1, without spotlight). F1 «Нажатие «Добавить»» 0 мс: primary «Добавить» pressed: scale(.98), bg #2a2a2a; «Добавить и ещё» secondary at FULL contrast (callout «соседняя кнопка не сереет; повторное нажатие заблокировано»). Tokens «--dur-instant 70 · --ease-press». F2 «Дольше 150 мс — «Добавляем…»»: primary label «Добавляем…» in white at 72% opacity, button width identical to F1 (red dimension bracket above it «ширина та же»), aria-busy noted in callout. Caption «обычно сохранение быстрее — подпись не меняется». Tokens «--loading-delay-fast 150». F3 LIVE «Лист уходит, содержимое заморожено»: 2600ms loop: 0–300 sheet at rest; 300–540 sheet slides down off the frame (translateY to 100%, cubic-bezier(0.4,0.14,1,1)) keeping the filled form exactly (no «Карточка № 013», no «Уже есть…»); scrim fades out 140ms; 540–780 snackbar rises 8px + fades in (cubic-bezier(0,0,0.3,1)): ink bar «Добавлено · se casser» + underlined «Отменить», bottom 16px above the tab bar; at 540 the new row opens at the top of the list (height 0→64px over 200ms) with background #e8e8e4; hold to 2200; reset. Callout «было: лист показывал дубль во время закрытия». Tokens «закрытие --dur-enter 240 · снекбар после листа». F4 «Строка и снекбар»: list with «se casser — свалить, сбежать» as the first row, its bg mid-fade (#efefeb), snackbar visible. Caption «снекбар 7 с, таймер на паузе, пока приложение в фоне; выход --dur-exit 140 вниз».

#### Group: Import & sort

**M-Import-Wait.dc.html** — «Импорт: живое ожидание», 2190×1044

Storyboard, 5 phone frames (§6.1; spec I1, I2, I3). Full-screen route, no tab bar. Header: back arrow, «Импорт со скриншота». Top section: 120×220 thumbnail (mini fake chat: grey bubbles with tiny lines, radius 6, 1px rule) left; right: title, sub «Скриншот 1 из 1 · 2 фрагмента», 1px progress bar, then the step list (28px rows, hairlines): «01 Читаем скриншот», «02 Слова, перевод и уровень», «03 Проверка повторов», each with right-side mono state: red «ИДЁТ», ink check icon, or nothing. Below: section «Найдено» with rows 56px (FR Newsreader 19 as built, RU 14 muted, meter + abbr right) and a trailing stack of 4 skeleton rows (opacity 1/.75/.5/.3; bars #e8e8e4). Bottom: outline «Стоп» full width, footnote «Скриншот не сохраняется — только слова.». F1 «Готовим скриншот» 0 мс: title «Готовим скриншот…», bar 8%, step 01 ИДЁТ. Tokens «0 мс задержки — известная долгая работа». F2 LIVE «Ждём первое слово · 0:04»: title «Распознаём слова…», bar 20% (static), status line under the steps «ЧИТАЕМ СКРИНШОТ» with «0:04» right; the red 1px scan line travels over the thumbnail top↔bottom (2400ms linear, alternate, infinite) with a paper veil rgba(241,241,238,.55) covering the part below the line (not yet read, as `ProcessingView` does); nothing else moves. Callout «единственное движение на экране; полоса не ползёт». Tokens «2400 мс · --ease-linear · motion-loop · reduced: стоит». F3 «Первые слова»: bar 42%, 01 ✓, 02 ИДЁТ; status «НАЙДЕНО 3»; rows «chelou — стрёмный · ▮▮▯▯ verl.», «la meuf — девушка · ▮▮▯▯ verl.», «kiffer — тащиться · ▮▮▮▯ arg.» (third at opacity .6 translateY 2px, arriving) then the skeleton stack. Tokens «--dur-enter 240 · +4 px · стопка --dur-move 200». F4 «Готово · держим 400 мс»: bar 100% ink, all three steps ✓, status «НАЙДЕНО 9 СЛОВ», 9 rows (add «c'est ouf — это безумие», «bouffer — жрать», «la daronne — мать?», «la thune — бабки», «un pote — кореш», «les keufs — менты»; frame cuts at a row boundary), «Стоп» disabled look. Tokens «--dur-done-hold 400». F5 «Тот же список — проверка»: Import-Review layout: header «Найдено 9 слов» + «Выбрать все»; the same rows at the SAME y as F4 with 20px checkboxes (radius 2) faded in left (checked except la daronne low-confidence warning row #fbf3df + dashed #c99a2e and la thune «УЖЕ ЕСТЬ» greyed); footer bar «Тема для всех ▾» + «Добавить 5 слов» primary. Tokens «галочки --dur-quick 110 · футер --dur-enter 240».

**M-Import-Stop-Error.dc.html** — «Импорт: стоп, ошибка, лимит», 1330×1044

Storyboard, 3 phone frames (§6.1; spec I4, I5, §3.8, §3.9). Same import processing layout as M-Import-Wait. F1 «Стоп — найденное остаётся»: after 3 rows (chelou, la meuf, kiffer); status line «ОСТАНОВЛЕНО · 3 СЛОВА»; progress bar frozen at 42% in #5a5a57; step 02 right label mono muted «СТОП»; skeleton rows gone; bottom: «Повторить» secondary in the slot where «Стоп» was (same width) + primary «Дальше с 3 словами». Caption «фокус на «Повторить»». Tokens «скелеты уходят --dur-exit 140». F2 «Ошибка на месте»: thumbnail and steps stay; step 01 right label «НЕ УДАЛОСЬ» in mono #b3261e; the rows area replaced at the same top by a notice: 1px #b3261e rule on top, 15px ink «Скриншот не прочитан — попробуйте ещё раз», muted 13px «Сервер не ответил»; buttons «Повторить» primary + «Выбрать другой скриншот» secondary. Callout «экран не меняется, ошибка там, где был список». F3 LIVE «Слишком много запросов»: status line «СЛИШКОМ МНОГО ЗАПРОСОВ · ПОВТОРИМ ЧЕРЕЗ 0:06» with a determinate 1px ink bar draining scaleX 1→0 from the right edge over 6000ms linear (loop 6800ms incl. rest); muted line «Повторим один раз сами»; «Отмена» tertiary underlined. Caption «никаких тихих ожиданий по 20 с». Tokens «--ease-linear».

**M-Import-Commit.dc.html** — «Импорт: галочки и добавление», 1760×1044

Storyboard, 4 phone frames (§6.1; spec I6, I7, §5.9, §5.10). Import review screen as M-Import-Wait F5 (header «Найдено 9 слов», «Выбрать все», rows 56px with checkboxes, footer «Тема для всех ▾» + «Добавить 5 слов»). F1 «Нажатие на галочку» 0 мс: row «kiffer» checkbox 20×20 radius 2 pressed: scale(.96), row tint #e8e8e4. Tokens «--dur-instant 70 · --ease-press». F2 LIVE «Галочка рисуется»: 2600ms loop on the «kiffer» row: 0–70 box fills ink; 70–180 a white check stroke draws (stroke-dasharray/offset keyframe, cubic-bezier(0.2,0,0.38,0.9)); hold; 1300 uncheck: fill fades 110ms and the row dims to opacity .5 over 110ms; meanwhile the button label swaps «Добавить 5 слов» ↔ «Добавить 4 слова» (two stacked spans crossfading 110ms, numbers tabular); the phone button is flex-1, so its width stays (say so in the caption); rest. Callout «без вибрации — галочек много (§5.13)». F3 «Добавляем…»: footer primary label «Добавляем…» at 72% white, same width (red bracket). Tokens «--loading-delay-fast 150». F4 «Готово — одна подсветка»: Library «Темы» screen (title «Библиотека», chips, tiles grid from Library.dc.html: Повседневное, Деньги, Еда, Полиция, Тусовка, Эмоции, Люди) with the «Эмоции» and «Люди» tiles at #e8e8e4 (spotlight) and their counts updated «30 · 5 К ПОВТ.» / «20 · 1 К ПОВТ.»; ink snackbar «Добавлено 4 слова · Отменить». Callout «подсвечиваем темы, а не каждую строку». Tokens «--dur-spotlight 1200».

**M-Sort-Plan.dc.html** — «Разложить по темам: план», 2190×1044

Storyboard, 5 phone frames (§6.1; spec S1–S5, E2). Sheet «Предлагаемые перемещения» over the dimmed library, sheet top 110px, title Newsreader 22, footer: «Отмена» tertiary + primary. F1 «Шаг 01 · темы · 0:02»: sub «48 слов без ручной темы»; step list (28px rows, hairlines) «01 Темы» red mono «ИДЁТ», «02 Слова · 0 / 48» muted; status line «СОСТАВЛЯЕМ ПЛАН» on a hairline; three static skeleton groups matching the built group geometry (`SortPlanSheet`: 1px top rule — ink on the first group, `--rule` after — a 44px header with a bar + count stub, then 2–3 indented rows of 44px with bars); footer «Применить» DISABLED (text #8a8a85, border #d6d6d1, white bg) + muted reason line «Можно применить, когда план готов». Tokens «0 мс задержки». F2 LIVE «Шаг 02 · пачками · 0:09»: 4000ms loop: the step 01 shows ✓; status «РАСКЛАДЫВАЕМ СЛОВА · 24 / 48» right «0:09»; the 1px determinate bar jumps on batch events 20%→40%→60%→80% (each jump 200ms cubic-bezier(0.2,0,0.38,0.9), 600ms apart), then resets; skeleton blocks static. Callout «полоса движется только по событиям, назад не идёт». F3 «Группы пишутся»: group «→ Деньги 3» (le pognon, les ronds, être raide) and «→ Эмоции 2» (avoir la haine, être vénère) written in; the third «→ новая тема «Транспорт» 3» (dashed border, mono tag «НОВАЯ»; la caisse, le tromé, la bécane) at opacity .5 translateY 2px arriving; one skeleton block left. Tokens «блоками · --dur-enter 240 · 40 мс, максимум 300». F4 «План готов»: all five groups — the three above, «→ Тусовка 2» (la teuf, s'ambiancer) and «→ Люди 2» (le daron, la daronne) with its toggle off and the group at opacity .5 (3+2+3+2+2 = 12 moves, 10 applied); the sheet is scrolled to the end, so the status «12 ПЕРЕМЕЩЕНИЙ · 1 НОВАЯ ТЕМА» is pinned under the title; «Применить 10» enabled ink. Tokens «--dur-quick 110». F5 «Применили»: library tiles (scrolled so «Транспорт» is on screen): «Деньги», «Эмоции», «Тусовка» and new «Транспорт» tiles at #e8e8e4 (spotlight, targets only), «Входящие» 7 → 2 and the source «Повседневное» 42 → 37 unlit (counts must sum to the header); snackbar «Разложено 10 слов · Отменить». Caption ««Дополнить карточки» — тот же рисунок: «Подбираем примеры · 3 / 12»». Tokens «--dur-spotlight 1200».

#### Group: Library & system

**M-Library-Load.dc.html** — «Библиотека и тема: загрузка», 2190×1044

Storyboard, 5 phone frames (§6.1; spec L1, L2, L3, L6). Library «Темы» view per Library.dc.html (v3): «Библиотека» Newsreader 28 + gear; subline mono «158 СЛОВ · 23 К ПОВТОРЕНИЮ»; search «Поиск по FR и RU»; chips «Все», «К повторению 23», «Трудные 9», «Сленг ▾»; action block: row buttons «Разложить по темам ›» caption «7 слов без темы» and «Дополнить карточки ›» caption «12 слов без примера» (56px each with an 8px gap, white, radius 6; the first with a 1px ink border, the second with a rule border, as built in `LibraryScreen.tsx`); «ТЕМЫ» rule; 2-col tiles (white, 1px rule, radius 6, 3px top band in theme colour, name Newsreader 19, mono counts, 2px progress line). Tab bar Библиотека active. F1 «Первый кадр · 0 мс»: title, gear, search, chips WITHOUT counts but with reserved count width; subline blank but reserved; action block reserved at 120px (blank: 56 + 8 + 56) and tile grid reserved (blank); red dashed callouts «место по прошлому визиту», «никаких «0 слов»». F2 «Тёплый старт · ~30 мс»: everything in place; both action rows arrived together; callout «одним запросом, --dur-quick 110, CLS 0 (было 0,088 / 0,30)». F3 LIVE «Холодный старт > 300 мс»: 3200ms loop: 0–300 = F1; 300 skeleton tiles fade in 110ms (tile frame 1px #d6d6d1 radius 6, a 3px #e8e8e4 top band, an 8px × 96px bar for the name, a 6px × 64px bar for counts, a 2px #e8e8e4 bottom line); 1600 real tiles crossfade in 110ms; hold; reset. Tokens «--loading-delay 300 · бары статичны». F4 «Нажали на «Деньги» · 100 мс»: library with the «Деньги» tile pressed (#e8e8e4 tint), and after 100ms its 2px bottom progress line replaced by the ink run (a 32px ink segment travelling the tile width; static drawing with red callout «бежит, если переход дольше 100 мс»). Tokens «--link-pending-delay 100». F5 «Тема без пустого кадра»: theme page «Деньги» (Folder.dc.html v3): back arrow, «Деньги» title (Newsreader), «⋯», sub «18 слов · 3 к повторению», mastery line, rows: la thune, le fric, l'oseille, le blé, raquer, être fauché, le flouze (status, FR Newsreader 19, RU muted 14, meter), footer «Повторить тему 4» (due 3 + new 1, as `FolderScreen` counts it). Callout «заголовок, полоса и футер — в первом кадре; было: пусто → заголовок → строки». Caption «P2: сдвиг вперёд 24 px, --dur-exit/--dur-enter».

**M-Library-Rows.dc.html** — «Строки: нажатие, свайп, удаление», 2190×1044

Storyboard, 5 phone frames (§6.1; spec L7, L8, L10, §5.10). Theme page «Деньги» (as M-Library-Load F5), rows 64px with hairlines. F1 «Нажатие» 0 мс: row «la thune» bg #e8e8e4, no scale. Tokens «--dur-instant 70». F2 LIVE «Долгое нажатие заряжается»: 2400ms loop on «la thune»: 0–500 row bg goes #f1f1ee → #e2e2dd linear (the charge); at 500 the row lifts: translateY(-2px), a white card with a 1px #111111 border all round and radius 4, inset 8px outside the text column so the edge clears the status dot (no shadow), 110ms; a small red callout «tick» at 500; hold to 1400; release back 200ms; rest. Callout «видно, что нажатие «взвелось»». Tokens «--dur-long-press 500 · --lift-y −2 px». F3 «Свайп до упора»: row «l'oseille» swiped left ~62%: actions revealed under it: «Переместить» (ink text on #e8e8e4) collapsed and «Удалить» (white text on #b3261e) widened to fill the revealed area; callout «порог 60 % — кнопка растягивается, tick». Tokens «--dur-move 200 · отпустить = удалить». F4 «Зачёркнуто и схлопнуто»: row «le blé» with a 1px ink line across the word and translation (strike-out drawn), row at half height (32px) and opacity .4, rows below shifted up 32px. Tokens «линия --dur-exit 140 linear → высота --dur-move 200 --ease-exit». F5 «Отмена — строка вернулась»: ink snackbar «Удалено · le blé · Отменить» with «Отменить» pressed (underline + 70% opacity); «le blé» row back at full height with #e8e8e4 background (spotlight). Caption «перемещение: строка схлопывается, плитка темы подсвечивается, снекбар «Перемещено в «Деньги» · Отменить»». Tokens «--dur-move 200 · --dur-spotlight 1200».

**M-Settings-Sync.dc.html** — «Настройки и синхронизация», 1760×1044

Storyboard, 4 phone frames (§6.1; spec T1, T2, T3, T5, T6, T8). Settings phone screen per Settings.dc.html v3: header back + «Настройки»; sections «Повторение» (Направление по умолчанию «FR → RU ›», Новых карточек в день stepper «40», Кнопки оценки segmented «2 / 3», Свайпы для оценки toggle), «Вибрация» row with caption «При оценке, свайпах и переключателях» and «Проверить» button, «Оформление» (Тема Система / Светлая / Тёмная), «Данные». F1 «Значения ещё не прочитаны»: labels present; controls valueless: toggle track outline only (1px #8a8a85, no thumb), stepper number blank, segmented with no selection; callout «до 300 мс, обычно значения уже в зеркале — прыжка 15 → 40 нет». Tokens «значения проявляются --dur-quick 110». F2 LIVE «Переключатель и сегменты»: 3200ms loop: «Свайпы для оценки» thumb slides off→on translateX(20px) 200ms cubic-bezier(0.2,0,0.38,0.9) while the track fills ink over 110ms; at 800 the segmented «Кнопки оценки» ink slab moves from «3» to «2» 200ms, labels crossfade 110ms; 1600–2400 both go back; rest. Callout «ручка едет, а не прыгает». F3 «Синхронизация: четыре состояния»: section «Данные» showing four stacked variants of the sync row (each 56px, label left, dot + mono status right, all the same width): «Синхронизировано · 14:02» (dot #1d6b45), «Синхронизация…» (ink dot), «Нет сети · изменения сохранятся» (dot #8a8a85, muted, NOT red), «Не синхронизировано · Повторить» (dot #b3261e) with a second muted line «Сервер не ответил · 14:05». Callout ««Синхронизация…» — только если дольше 1 с, минимум 500 мс». F4 «Подпись меняется на месте»: rows «Экспорт JSON» showing «Сохраняем…» (width-locked, aria-busy), «Импорт из старой версии (HTML)», «Выйти» (again text). Callout «строка не сереет». Tokens «--loading-delay-fast 150».

**M-Boot-Offline.dc.html** — «Вход, офлайн, ошибки», 1760×1044

Storyboard, 4 phone frames (§6.1; spec U1, U2, U3, B1, B3, B4). F1 «Вход: ошибка под полем»: Login: «Карточки для Лизи» mark Newsreader 40 over two lines with the 20×28 card glyph (`CardGlyph size="lg"`, red top line); email field «n.drobyshevski@pm.me», password field (dots) with 1px #b3261e border, under it 13px #b3261e «Неверный пароль» opening (Collapse of 8px gap + one 18px line = 26px, drawn mostly open at 22px so the words read, opacity .6), «Забыли пароль?» and «Создать аккаунт» links, primary «Войти». Callout «без тряски; фокус в поле». Tokens «--dur-enter 240 · высота --dur-move 200». F2 «Входим…»: same, error gone, primary label «Входим…» width-locked, white 72%. Tokens «0 мс задержки для сети». F3 «Нет сети — заранее»: quick-add sheet with input «la bagnole»; «Словарь» row «la bagnole · nom f.»; «Варианты» slot shows a muted notice on plain paper: cloud-off line icon + «Нет сети — варианты появятся, когда она вернётся» (13px muted, no red); quick form below as built in `SearchPanel` `QuickForm` (RU «Перевод», Тема «Входящие ▾», tertiary «Все поля»; the FR is the input itself, so no FR row). Callout «офлайн — не ошибка». F4 LIVE «Офлайн-страница»: the ~offline page (AppMark header; white card with red header rule and mono «НЕТ СЕТИ»; «hors ligne» Newsreader 40, *loc. adj.*, «Эта страница ещё не сохранена на устройстве», muted paragraph «Повторение и библиотека работают без интернета, если уже открывались на этом устройстве.», footer line «Проверь подключение и попробуй ещё раз»; buttons «Повторить» primary and «Открыть повторение» secondary). 2600ms loop: «Повторить» pressed (scale .98) → label «Проверяем…» (width-locked) held 500ms min → back to «Повторить»; a muted line under the buttons «Откроем сами, когда сеть вернётся». Caption second line «сбой подготовки базы: в библиотеке вместо плиток «Не удалось подготовить базу · Повторить»».

#### Group: Desktop & kit

**M-Kit.dc.html** — «Кит движения и ожидания», 1440×1000

Reference sheet 1440×1000 (§6.1 rules; spec §2, §3.3–3.5, §5). Paper #f1f1ee, padding 48, title «Движение и ожидание» Newsreader 34 + mono sub «ТОКЕНЫ · ПРИМИТИВЫ · REDUCED MOTION». A 4-column grid of cells (white, 1px #d6d6d1, radius 6, padding 20, heading Plex Sans 500 13 + mono token line). Cells: (1) «Длительности»: horizontal ruler with bars to scale for 70 / 110 / 140 / 200 / 240 / 320 / 380 ms (mono labels --dur-instant … --dur-sheet). (2) «Кривые»: four 96×96 SVG plots (ink 1.5px paths) for --ease-standard, --ease-enter, --ease-exit, --ease-press, each with a LIVE 6px ink dot moving 0→80px along a hairline with that curve (1200ms + 600 rest). (3) «Пружины»: three LIVE 12px ink squares moving 80px with --spring-settle 350, --spring-lift 480, --spring-stamp 300 (linear() values from §2.5), labels with overshoot 0,1 % / 0,6 % / 2,7 %. (4) «Нажатие»: primary «Добавить» and secondary «Добавить и ещё» and a 44px icon button, LIVE press loop scale .98/.96 70ms in, 110ms out. (5) «Кнопка в ожидании»: LIVE «Применить 10» → «Применяем…» (same width, 72% text) loop; beside it static «disabled» example with reason caption «Можно применить, когда план готов». (6) «Скелет»: static rows at real heights 44 / 56 / 64 / 72 px with #e8e8e4 bars, labelled «Словарь 44», «Импорт 56», «Все слова 64», «Варианты 72»; note «не двигаются». (7) «Строка статуса»: LIVE indeterminate «ПОДБИРАЕМ ВАРИАНТЫ … 0:04» with the ink run (32px, 1400ms + 600 rest); static determinate «ОПРЕДЕЛЯЕМ · 4 / 12» 33%; static error «НЕ УДАЛОСЬ» + «Повторить». (8) «Снекбар»: LIVE enter 240 / hold / exit 140 loop of «Удалено · le blé · Отменить». (9) «Переключатель · галочка · сегменты»: LIVE toggle thumb, checkbox fill + tick draw, segmented slab. (10) «Пятно бумаги»: LIVE #e8e8e4 → white 1200ms linear on a row «la thune — бабки». (11) «Штамп»: LIVE «ЗНАЮ» stamp landing 1.04→1 with --spring-stamp. (12) «Reduced motion»: a small two-column table (По умолчанию / При reduce) with 6 rows from §2.7. No shadows, no gradients.

**M-D-Review-Keys.dc.html** — «Десктоп: оценка клавишами», 1440×920

Desktop state board 1440×800 screen + 120px caption band (board 1440×920) (§6.1; spec D1, D2, R8). Screen = D-Review-Answer.dc.html layout: sidebar 248px (as DESKTOP-SPEC), running head 57px across the content with chips «FR → RU», «Все темы», counts «23 к повторению · 4 новых», «07 / 30», undo and «?» buttons; its bottom rule doubles as the progress line (2px ink fill over the hairline, 23%). Card 720×432 centred on a thin stack (2 offset hairline layers below), call number «FR · № 017», «la thune», answer «бабки, деньги», tracings footer «1. Деньги  2. arg.». Grade row: «Не знаю <1 мин» / «Сложно 6 мин» / «Знаю 1 д» with key caps 1 / 2 / 3; hint line. ONE live timeline loop of 5200ms on the screen: 0 answer side at rest; 400 key cap «3» and «Знаю» ink-flash (bg #1d6b45, white text) for 120ms; at 520 the card content swaps in ONE frame (step-end) to the next card «le fric» question side (no translate, no fade), the 2-layer stack stays (23 cards remain; an outline fades 110ms only when fewer than 2 remain — D1), progress fill steps 23%→27% (scaleX 200ms cubic-bezier(0.2,0,0.38,0.9)), counter «08 / 30» swaps; 1600 «Пробел»: answer block («бабло», note, example) fades in 110ms opacity only, the headword does not move; 2800 key «1» flashes «Не знаю» #b3261e 120ms and swaps to «chelou» question side; rest to 5200 then reset. A mono 11 key-press indicator box at the top right of the content (e.g. «3», «Пробел», «1») lights up in sync. Caption band 4 columns: «Клавиши 1–3 · вспышка 120 мс · --dur-flash», «Карточка · без движения: клавиатура не анимируется», «Пробел · ответ проявляется 110 мс · --dur-quick», «Прогресс · scaleX 200 мс · --ease-standard». Red marks ≤ 4.

**M-D-Library-Pane.dc.html** — «Десктоп: таблица и карточка», 1440×920

Desktop state board 1440×800 + 120px caption band (§6.1; spec D3, D4, D6, D7, L5). Screen = D-Library.dc.html: sidebar 248 with themes, list pane with toolbar «Все слова», search, text filter strip, table header (mono 11, 1px ink rule) and 40px rows (Слово / Перевод / Уровень / Тема / Показ), detail pane 400 with the pulled index card of the current word. Live element 1 (pane; shares one 7000ms loop with the menu, since an open menu blocks list keys): the cursor moving ↓ through rows chelou → la meuf → kiffer → c'est ouf (current row: white bg + 2px ink bar on the left edge), 700ms per step; the detail card content switches in one frame at each step (step-end keyframes on stacked content blocks), never blank; a mono key indicator «↓» at the pane top lights in sync. Callout «было: 3–4 пустых кадра на каждое ↑/↓». Live element 2 (menu): a right-click menu on row «la galère» (white, 1px ink border, radius 6, items 32px as built in `LibraryDesk.tsx`: «Открыть карточку ↵», «Переместить в тему…  M», separator, «Удалить слово  ⌘⌫» in #b3261e) looping in: opacity + 4px from the trigger side over 110ms, hold, out 140ms opacity only. Static element 3: a tooltip «Отменить (Z)» above the undo button with a callout «500 мс задержки, затем сразу для соседей». Caption band 4 columns: «Карточка справа · старое слово держится до нового (D3)», «Первый кадр · та же шапка таблицы, строки-скелеты 40 px через 300 мс (D4)», «Меню · вход 110 мс, выход 140 мс, без масштаба (D6)», «Поиск · устаревшие строки 0,5 через 150 мс (L5)». No shadow on the menu.

**M-D-Dialogs-Drop.dc.html** — «Десктоп: перенос и диалоги», 1440×920

Desktop state board 1440×800 + 120px caption band (§6.1; spec D5, D8, N2, §5.11). Screen = D-Library-Bulk.dc.html («Входящие» with 3 rows selected: le pognon, les ronds, être raide; bulk bar). One 6000ms live loop on the screen: 0–600 the drag: selected rows at opacity .5, the ghost (white, 1px ink, «le pognon» + «+2») near the sidebar, every theme row with a 1px dashed muted outline, «Деньги» row hovered with 2px ink outline + white bg showing «+3»; 700 drop: outlines vanish, the «Деньги» sidebar row gets #e8e8e4 background fading to paper over 1200ms linear and its count swaps 18 → 21; the three rows collapse out of the table (height 40→0 over 200ms cubic-bezier(0.4,0.14,1,1), opacity out 110ms); 900 ink snackbar rises 8px + fades in 240ms at the bottom centre of the content: «Перемещено в «Деньги»» + «Отменить» + key cap Z on ink; 2600 snackbar exits 140ms (fade + 8px down); 3000 scrim rgba(17,17,17,.24) fades in 240ms and the «Новая тема» dialog (D-Theme-New.dc.html: white, 1px rule, radius 8, red header rule, title «Новая тема», name field, colour row, footer «Отмена» / «Создать тему», as built) enters with opacity + 8px rise over 240ms cubic-bezier(0,0,0.3,1); hold to 4600; exit opacity + 4px down 140ms, scrim out 140ms; rest to 6000. Caption band 4 columns: «Перенос · строки 0,5 во время перетаскивания», «Сброс · подсветка темы 1200 мс, строки схлопываются 200 мс», «Снекбар · вход 240 / выход 140, пауза в фоне», «Диалог · вход 240 +8 px, выход 140, без тени».

---

## 7. Acceptance checks (for the implementation phase)

- CLS < 0.01 on: library «Темы» warm and first run, «Все слова», theme page client nav, review cold load,
  Варианты stream (Playwright `layout-shift` observer, as in `audit-loading.md`).
- No frame with an empty card between two graded cards at 1× CPU; no blank frame on theme nav.
- No skeleton or «Загружаем…» visible on a warm local read (record 60 fps frames, assert none).
- Every `Button` that waits shows its progress label within 150 ms and keeps its width (± 0 px).
- Under emulated `prefers-reduced-motion: reduce`: no transform animation runs (except finger-following
  drag), fades ≤ 110 ms, `onClosed` callbacks fire ≤ 150 ms after close.
- grep: no `ease-out`, `duration-100/150/200`, `animate-[…_ease-out]`, `transition: all`, `box-shadow`,
  `linear-gradient` (except the ruled card lines) in components.
