# Loading states: web research brief

Scope: what current (2023–2026) guidance says about loading, pending, streaming and progress UI, turned
into concrete numbers and rules for «Карточки для Лизи». This is research only: no app code was changed.
Read it with `docs/motion-research/audit-motion.md` (the current motion inventory) and the brand rules in
`mockups/SPEC.md` / `mockups/DESKTOP-SPEC.md` (no gradients, shimmer, shadow, glow, sparkles, emoji, pastel
pills or confetti).

Sources are cited inline as [n]; the list is at the end.

---

## 0. TL;DR: the rules to adopt

1. **Never show a loader for local data.** Dexie reads finish in milliseconds. On the first render, before
   `useLiveQuery` resolves, render nothing or a reserved-height blank, not a skeleton (§3).
2. **Network waits get a 300 ms grace period and, once shown, a 500 ms minimum.** If the result arrives
   inside the grace period, show nothing. If the indicator appears, keep it at least 500 ms so it never
   blinks (§2).
3. **Choose the indicator by how long the wait is and how much is loading:**
   - under 1 s: nothing;
   - 1–3 s: an indeterminate cue placed where the content will appear;
   - 3–10 s: determinate or staged progress;
   - over 10 s: determinate progress, with the rest of the UI still usable (§1, §4).
4. **Skeletons are static hairline bars in the shape of the content.** Optionally they get a slow opacity
   "breath", never a moving gradient. Under reduced motion they are fully static. Each skeleton has the
   exact height of the content it stands for, so the swap does not move the layout (CLS 0) (§4).
5. **Streamed AI results arrive as real rows that replace skeleton rows one by one.** Use a fixed-height
   row slot, a quiet mono status line, a visible «Стоп» that keeps what has arrived, and an explicit
   end state. No «думает…», no typewriter caret on structured rows, no AI motif (§6).
6. **A button keeps its width while pending.** Its label changes to a progress verb («Подбираем…»), it
   is disabled against a second submit, and it carries `aria-busy`. Use no spinner inside primary
   buttons; one 12 px ink arc is the most we would allow (§7).
7. **Be optimistic for anything the local DB can do.** Grade, move, delete, rename and save all apply
   instantly, with an undo snackbar instead of a confirm-and-wait (§5).
8. **Errors replace the indicator at the same spot**, keep partial results, and offer one retry action.
   There is no modal and no assertive announcement unless the error blocks the user (§8).
9. **In Next 16 with `cacheComponents`,** `loading.tsx` only matters for server-rendered segments. Our
   screens are client components fed by Dexie, so they should not get `loading.tsx` skeletons. Keep the
   static shell (header, tab bar, titles) outside any Suspense boundary and let navigations run as
   transitions (§9).

---

## 1. Perceived-performance thresholds

| Threshold | Meaning | Source |
|---|---|---|
| **100 ms** | Feels instantaneous; no feedback needed beyond the result itself. Every tap must give visible feedback (press state) inside this. | Nielsen / Miller [1][2] |
| **400 ms** (Doherty) | "Productivity soars when a computer and its users interact at a pace (<400 ms) that ensures neither has to wait." If the result can't make it, *some* feedback must. | Laws of UX [3] |
| **1 s** | Flow of thought stays unbroken. Below 1 s, loaders "only flash" and make the product feel slower. | NN/g [1][4], Primer [5], Cloudscape [6] |
| **1–3 s** | Indeterminate indicator. Determinate progress doesn't help, because the user has no time to read it. | Primer [5], Significa [7] |
| **2–10 s** | Spinner/looped indicator for one module; skeleton for a whole screen. | NN/g [4] |
| **3–10 s** | Determinate if possible, and say *why* the user is waiting. | Primer [5] |
| **> 10 s** | Attention is lost. Show an explicit duration or progress estimate and don't block other work; treat it as a background task. | NN/g [1][4], Primer [5] |

What this means for us:

- **≤ 100 ms: touch feedback.** Every tap target needs a press state that lands within one frame. The
  audit found taps with none (library rows, import checkboxes).
- **< 400 ms: local actions.** Grade, flip, move, delete and undo must all finish inside this, and Dexie
  makes that possible. Show the result, not a pending state.
- **0.4–3 s: one AI call.** «Варианты» suggestions, `/api/ai/enrich` and «Обновить перевод и заметку» (a
  single Haiku call) fall in this band. Show an indeterminate, shape-matched placeholder after the grace
  period.
- **3–30 s: multi-step jobs.** Screenshot import (prepare → upload → recognise → check), «Разложить по
  темам» and «Дополнить карточки» belong here. Use staged steps, a determinate or asymptotic bar, and rows
  that stream in. «Стоп» stays available throughout.

---

## 2. Delay-before-show and minimum display time (anti-flash)

Sources agree on two numbers, a delay and a floor, though the exact values differ:

| Source | Delay before show | Minimum once shown |
|---|---|---|
| Learning Equality design system [8] | 300 ms | 400 ms |
| Firefox Acorn [9] (via search summary) | no spinner < 200 ms | 400 ms |
| Stripe Apps [10] | 200–300 ms typical; **0 ms for known-slow ops**; 100 ms for view transitions | — (Button `pending` prop) |
| `spin-delay` (smeijer) [11] | 500 ms default | 200 ms default |
| Significa `useDelayedLoading` [7] | 300 ms default | 1000 ms default |
| Next.js `useLinkStatus` docs [N1] | ~100 ms animation-delay, start at `opacity:0` | — |
| React Suspense (built-in) [12] | — | reveals throttled to at most **once per 300 ms**; boundaries ready inside the window reveal together |

**Values to adopt:**

- `--loading-delay: 300ms`: the default grace period before any indicator appears.
- `--loading-min: 500ms`: once an indicator is visible, it stays at least this long. This sits between
  Acorn's 400 and Significa's 1000; 500 ms is long enough to read as intentional and short enough not to
  feel padded.
- Exceptions:
  - **0 ms delay for known-slow operations.** Screenshot import, sort plan and enrich plan start their
    staged UI immediately (Stripe [10]).
  - **Suggestions after typing.** The debounce (`SUGGEST_DEBOUNCE_MS = 300`, `lib/use-suggest.ts:14`)
    already spends 300 ms of the user's patience, so the skeleton delay after the fetch starts can drop
    to about 150 ms. Keep the 500 ms floor and reserve the space: the «Варианты» section keeps its
    2 × 44 px height from the moment the query is non-empty.
- **Implementation.** A tiny `useDelayedFlag(active, {delay, min})` hook (the `spin-delay` state
  machine [11][7]):
  1. idle;
  2. pending: start a timer for the delay, and cancel it if the work finishes first;
  3. shown: record the time it appeared;
  4. hold: if the work finishes before `min`, keep the indicator until `min` has passed;
  5. reset.

  Pure CSS is enough when the indicator is always mounted. Start at `opacity: 0` and run the fade with
  `animation-delay: 300ms`, as the Next `useLinkStatus` docs show [N1]. Do this in CSS rather than in
  React state, so a fast result never renders the indicator at all.
- **Do not add a minimum to content.** The floor applies to *indicators*. Never hold real data back to
  satisfy it. When content arrives while the floor is still running, swap at once *if the skeleton has
  the same shape* (no visible jump). The floor exists to stop a blink to a *different* layout, such as
  skeleton → empty state.

---

## 3. Offline-first: local reads should never show a loader

- **Local-first ideal #1 is "No spinners: your work at your fingertips"** [13]. Linear's perceived speed
  comes from reading a local replica and applying mutations locally, with sync in the background [14].
  That is exactly our Dexie architecture.
- **What `useLiveQuery` returns first.** It returns `defaultResult` (or `undefined`) on the first
  render, before IndexedDB answers; the Dexie docs' own pattern is `if (!friends) return null; // Still
  loading.` [15]. That first frame usually lasts a few milliseconds to a couple of frames, far below the
  100 ms threshold.

Rules for the first frame:

1. Render the **static chrome** (header, title, tab bar and section rules) at once. Render the
   **data-bound region as an empty box with its expected min-height**, not as a skeleton. Today
   `WordDetailBody` already does this (`min-h-40` + `aria-busy`), which is the right pattern.
2. If a skeleton is used for local data at all, gate it behind the 300 ms delay. Today
   `LibraryScreen.tsx:313-315` mounts 6 `TileSkeleton` immediately whenever `loading`. On a warm DB this
   flashes six bordered boxes for a frame or two on every visit. Gate it, or replace it with a reserved
   blank grid.
3. **Cold start is the exception.** The first open after install, a Dexie upgrade or a large first sync
   can take hundreds of ms or more. The delayed skeleton handles that case without hurting the common
   one.
4. **Sync status is never a loader.** Background sync shows no spinner. At most a quiet mono status in
   Settings / the sidebar footer («Синхронизировано · 12:04»). If a pull changes visible data, rows update
   in place: `useLiveQuery` re-renders, with an optional ≤ 150 ms opacity fade-in on new rows.
5. **Offline.** AI features need the network.
   - Show the offline state *before* the user waits: disable or annotate «Варианты» and import, rather
     than letting a request time out.
   - Next 16 has an experimental `useOffline()` hook with automatic retry of blocked navigations and
     Server Actions [N2]. Our AI calls are plain `fetch` to route handlers, so `navigator.onLine` plus
     the `online`/`offline` events (already used for sync) stay the source of truth.

---

## 4. Skeleton vs spinner vs progress bar vs content placeholder

**Decision table** (NN/g [4], Primer [5], Learning Equality [8], Cloudscape [6]):

| Situation | Indicator |
|---|---|
| Whole screen, known shape, 1–10 s | Skeleton matching the final layout. Frame-only skeletons (just header/footer) are *not* progress indicators [4]. |
| One module (a card, a section) | Inline indicator *at that spot* ("placed nearest to the content they stand in for" [5]). Prefer a shape-matched placeholder over a spinner when the shape is known. |
| Several adjacent small things loading | **One** indicator for the group, not one per item [5]. |
| A process (upload, convert, OCR), any length | Progress bar or step list, **not** a skeleton [4]. |
| > 10 s | Determinate progress + "why" text, non-blocking [5]. |
| Lists / tables / structured AI output | A loading bar or row placeholders + text, not token streaming [6]. |

**Skeletons without shimmer.** The brand forbids shimmer, and accessibility work points the same way:

- **Animated skeletons come with a warning.** NN/g lists pulsing, gradient and fade skeletons, and warns
  that such animation "can potentially be distracting, annoying, or even create accessibility
  problems" [4].
- **Shimmer becomes static under reduced motion.** Several design systems turn shimmer into a static
  fill under `prefers-reduced-motion`, and one cites WCAG 2.3.3 [16]. Others offer an opacity-only
  "pulse" as the calm alternative for dense lists [16].
- **Primer still wants a cue under reduced motion.** It says loading animation should stay subtle but
  *not* be removed entirely, so that the UI does not look frozen [5]. For us that means: if the bars
  are static, a text status («Распознаём слова») has to carry the "still working" signal.

**Spec for our skeleton.** It matches what is already in the mockups and code, made explicit:

- **Bars.**
  - Colour: `surface-2` / `#e8e8e4` (dark: the existing token).
  - Height: 6–8 px, radius 2 px.
  - Width: 40–70 % of the row, varied per row so the rows don't read as a pattern.
- **Rows.** Exactly the final row height (44 / 52 / 56 px) with the real hairline `border-rule`, so the
  swap from skeleton row to real row changes only the text.
- **Motion.**
  - **Option A (default): static.** Everything that sits still and is reserved by height reads as paper.
  - **Option B: a slow "ink drying" breath**, used only on regions that load for more than about 1.5 s.
    Opacity 1 → 0.55 → 1 over 1.8 s, `ease-in-out`, infinite, starting after the 300 ms delay.
    `prefers-reduced-motion: reduce` makes it static, which is acceptable because the adjacent text
    status still says the app is working.
  - Never a translating gradient, never a blur.
- **Trailing fade on a skeleton stack.** The import list already does this (opacity 1, .75, .5, .3). It
  reads as "more may come" without promising a count. Keep it.
- **One `role="status"` per region, not per bar.** Bars are `aria-hidden`. The region gets `aria-busy`
  while loading [5][16]. `SkeletonRows` (`components/add/parts.tsx:225`) already does this.

**Optional reveal motion** (Next view-transitions guide [N3]): when a skeleton yields to content, the
guide pairs a short exit with a gentler enter:

- skeleton exit: 150 ms;
- content fade: 210 ms, starting after the exit;
- slide: 10 px over 400 ms.

For our calm brand, drop the blur and keep a 120–150 ms exit, a 180–200 ms opacity enter and a 4–6 px
rise. React only animates Suspense reveals inside a `<ViewTransition>`. During such a reveal it waits up
to 500 ms for fonts and visible images [12], which helps the Newsreader headwords avoid a font-swap
flash.

---

## 5. Optimistic UI

- **React 19's `useOptimistic`.** It renders a temporary value while an Action is pending. If the
  action throws, the optimistic value simply disappears and the real `value` shows again; you catch the
  error to show a message. Per-item pending is a `pending: true` flag added by the reducer. The setter
  must run inside an Action or `startTransition` [17].
- **React Router's pending-UI guide.** It recommends rendering the future state straight from submitted
  form data, and per-link pending via `NavLink isPending` [18]. Its Vercel AI SDK counterpart: disable
  submit while `isLoading`, and show Stop [19].
- **For us, most writes are local, which is better than optimistic.** A Dexie write *is* the source of
  truth; sync reconciles later with last-write-wins. So:
  - grades, moves, deletes, renames and saves render instantly, with no pending state at all;
  - "undo" replaces "are you sure"; this already exists as Snackbar + undo;
  - `useOptimistic` is only worth it for **server** actions: login, password reset, and perhaps
    «Применить» on a server-computed plan.
- **Pending on a single item.** When an item is pending against the network (for example, a quick-saved
  word whose example is still being filled by `fillSavedWords`), mark that row quietly:
  - a mono «…» in the slot where the example will appear, or the SlangMeter in its "unknown" state;
  - no spinner, and no text such as «обогащаем».
  - When the fill lands, the value cross-fades in over ≤ 150 ms.

---

## 6. Streaming AI output

### What good products and guides do

- **Time-to-first-token matters more than total time.** A response starting at 200 ms and ending at 5 s
  feels faster than one starting at 2 s and ending at 3 s. For autocomplete: "If the model can't respond
  in under 300 ms, show nothing" [20].
- **Two phases** (Cloudscape [6]).
  - *Processing*: no output yet. Show a short status.
  - *Generation*: output is streaming. Keep a small "still working" cue visible, "especially when
    streaming slows intermittently".
  - Skip loading text entirely if streaming starts quickly, and never show a loading state for less
    than 1 s.
- **Structured output is not streamed token by token** [20][6]. Lists and tables stream *row by row*:
  - show the header at once;
  - show complete rows only, never half-filled cards;
  - optionally a running count («12 of ~20»);
  - known sections show their header first, then fill.
- **Stop.** It is always visible during generation, works immediately and *keeps what was produced*
  [20][19][21].
  - After a stop: mark the output as stopped («Остановлено»), swap Stop for Retry, and move focus to
    Retry [21].
  - Never silently discard partial output [20].
- **Errors mid-stream** [20]:
  - preferred: keep the partial result and mark it incomplete;
  - auto-retry at most twice, and only for network timeouts;
  - clear and restart only if the partial result is misleading.
- **Explicit end state.** Users must know when processing is finished; an ambiguous end is a top
  complaint [22]. Remove any "working" cue on the same frame the stream ends [20].
- **Thinking / reasoning** (Cloudscape [23]):
  - collapsed by default;
  - a duration appears only *after* completion, rounded («Thought for 14s»);
  - offer "skip" only when a useful answer is possible without it.

  We don't expose reasoning (thinking is disabled), so this only confirms that a «думает…» line adds
  nothing.
- **Rendering mechanics** (Smashing, May 2026 [21]):
  - buffer chunks and flush once per `requestAnimationFrame`;
  - append, don't rebuild `innerHTML`;
  - auto-scroll only while the user is within about 60 px of the bottom; stop when they scroll up and
    resume only when they return;
  - reset the scroll flag per new stream.
- **Screen readers** [24][21]:
  - never put the token stream itself in a live region;
  - keep one *pre-existing, empty* polite region that announces short statuses («Подбираем варианты» →
    «Найдено 3 варианта»);
  - `aria-busy` on the container during streaming, though support is uneven, so don't rely on it alone;
  - long outputs are announced in batches every 2–3 s at most;
  - `assertive` only for errors.
- **AI SDK mechanics** [19]:
  - `useObject` exposes `object` (partial, every field possibly undefined), `isLoading`, `stop()`,
    `error`, `onFinish`;
  - render with optional chaining;
  - show a generic error message.
  - Our routes stream NDJSON rows, which is better for row-by-row UI than one big partial object: a row
    is either absent or complete.
- **Spinners alone fail for agentic waits.** Showing process and stage builds trust [25]. A generic
  10-second spinner is reported as longer than the same wait with visible progress [26].

### How products show it (pattern summary)

- **Claude.ai, ChatGPT, Perplexity:**
  - a short status line before the first token (Perplexity's step list «Searching → Reading sources →
    Answering»);
  - a single caret while prose streams;
  - Stop replaces Send in the same position;
  - the end state is the caret disappearing and actions (copy / retry) appearing.
- **Linear and Raycast AI:** keep the surrounding UI fully interactive and show progress as a small
  inline status, never a full-screen takeover.

All of them share the same pattern: the status text is specific («Reading 5 sources»), not cute; the
indicator is small and sits where the output will appear; and Stop sits where the primary action was.

### Mapping to our surfaces

| Surface | Now | Recommendation |
|---|---|---|
| «Варианты» in Add (suggest, ~0.5–2 s) | 2 hairline skeleton rows while loading (spec) | Reserve 2 × 44 px as soon as the query is non-empty. Show the skeleton after about 150 ms post-debounce, with a 500 ms floor. Each arriving suggestion *replaces* the top skeleton row in place (no push-down): rows keep their slots, and new rows fade from 0 → 1 over 150 ms with a 4 px rise. When the stream ends, remove leftover skeleton rows in the same frame (a height collapse of ≤ 150 ms is fine). No caret, no «думает…». The SR status announces once: «Варианты: 3». |
| Screenshot import (5–30 s, multi-step) | Steps list (ИДЁТ marker), asymptotic bar `processingProgress()`, streamed rows + trailing fading skeletons, «Стоп» keeps rows | This already follows best practice; keep it. Refinements: (a) the bar must never move backwards and should only ease forward. A start-slow-then-accelerate profile is perceived as faster (Harrison et al., UIST '07 [27]), so let the bar jump to the real stage boundaries rather than crawl. (b) Add a specific running count in mono («Найдено 7»). (c) When done, turn the active step's «ИДЁТ» into a check and the bar into a full 1 px ink line, then hold that end state about 400 ms before moving to Review, so the finish is legible. (d) After 10 s, show the elapsed time or «можно свернуть» only if import can continue in the background. |
| «Разложить по темам» / «Дополнить карточки» plans | `role="status"` text «Подбираем примеры · 3 / 12» + skeletons | A determinate count is good. Keep the text in Plex Mono with tabular numbers so it doesn't jitter. Show the plan rows as they become final. «Применить» stays disabled until the plan is complete, with a visible reason. |
| «Обновить перевод и заметку» (one call, 1–3 s) | Label swaps to «Подбираем…» | Keep it, lock the width (§7), and cross-fade the updated fields in over 150 ms with undo. |
| Auto-enrich on the add form (level, example, theme) | `pending` on SlangMeter | Fill fields silently. Use a per-field placeholder (meter in the "unknown" state) after a 300 ms delay, never block «Сохранить», and never overwrite fields the user edited. |

---

## 7. Button pending states

What sources say:

- Disable during submit to prevent double-submit [10][28].
- Use a built-in `pending` state rather than an ad-hoc spinner [10].
- Keep the label in the DOM, either visually hidden or dimmed [28].
- Note: JAWS suppresses announcements of a button while `aria-busy="true"` [28]. Pair it with a
  visible text change and an `aria-live` status when the result matters.
- Inline indicators cause layout shift; use a fixed-size, always-rendered element and toggle its opacity
  [N1].

Our spec already says it (DESKTOP-SPEC table, row "loading"): "the label is replaced by its progress
text («Подбираем…», «Распознаём…»), width stays fixed, `aria-busy="true"`". Concretely:

- **Width lock.** Stack the idle and pending labels in one CSS grid cell
  (`display:grid; > * {grid-area:1/1}`) and toggle `visibility`. The button keeps the width of the
  longer label with no JS measuring. `Button.tsx` currently has `loading` → disabled + `aria-busy`, but
  no label swap or width lock.
- **Pending look.**
  - Primary (black) button: the label swaps to the progress verb, text drops to about 70 % opacity, and
    the button is not greyed out. A disabled-looking primary reads as "you can't", not "working".
  - Optional: a 1 px ink line under the label that fills left to right for determinate work. That is
    the house "rule fills" motif, not a spinner.
- **Delay the label swap by about 150–300 ms for actions that are usually fast.** The button still
  disables *immediately* to block a double tap. The label changes only if the action is still running
  after the delay.
- **Success.** Return to idle and let the result speak (a snackbar with undo). No check-mark morph, no
  green flash.

---

## 8. Errors and retry

- Replace the indicator with the error **at the same place**, with the same height, plus one action
  («Повторить») [5][21]. Keep partial results [20].
- Live regions: polite for routine failures, `role="alert"` only when the user is blocked [24][21].
- Copy: specific and short, sentence case, no exclamation marks or ellipses (Cloudscape copy rules [6],
  adapted to Russian). For example «Не удалось подобрать варианты. Повторить» or «Нет сети: варианты
  появятся, когда она вернётся».
- Auto-retry at most twice for network timeouts, with backoff, and never for 4xx or rate limits [20].
- Show a generic message; don't leak server details [19].

---

## 9. Next.js 16 App Router specifics (from `node_modules/next/dist/docs`)

- **`loading.tsx`** wraps `page.tsx` (not `layout.tsx` or `error.tsx` of the same segment) in
  `<Suspense>`. The fallback is *prefetched*, navigation is interruptible, and shared layouts stay
  interactive [N4].
  - Under **Cache Components** (on in this repo), uncached or runtime data in a layout must be wrapped
    in its own `<Suspense>`, or the build errors.
  - The static shell (layouts, nav and fallbacks) is prerendered and streams first [N4][N5].
- **`<Suspense>` vs `loading.js`.** The streaming guide recommends granular `<Suspense>` close to the
  dynamic access. A high-level `loading.js` makes the whole page fall back to a full-page skeleton.
  - "If there's a Suspense boundary, React might use it… don't add one you don't need" [N5].
  - Keep LCP elements (the headword, the screen title) *outside* boundaries.
  - Size fallbacks to the real content to avoid CLS [N5].
- **Our screens** are `"use client"` and read Dexie via `useLiveQuery`. Data fetched in effects or
  hooks does **not** activate Suspense [12], so `loading.tsx` would only flash a fallback while the
  route's JS chunk loads.

  Recommendation: **no `loading.tsx` for the (app) screens.** The prerendered shell plus the
  client-rendered, reserved-height regions (§3) give a steadier first paint. If one is ever added, it
  should be the screen's *static chrome only* (title, rules), with no skeleton bars.
- **Navigations are transitions.** React keeps the old screen visible instead of showing a fallback for
  already-revealed content. A pending indicator comes from `useTransition().isPending` (dim to about
  0.7) or from `useDeferredValue` (dim stale results to about 0.5 while `query !== deferredQuery`) [12].
  - The library search already uses `useDeferredValue`. Add the stale-dim, with a 150–200 ms delay so
    fast filters don't flicker.
- **`useLinkStatus`** gives per-link pending. The docs explicitly suggest an initial animation delay of
  about 100 ms, starting from `opacity:0`, so prefetched (instant) navigations show nothing. Use a
  fixed-size, always-rendered hint to avoid layout shift [N1].
  - For us: a 2 px red-ink tick next to the active rail or sidebar item, or under the tab bar label,
    fading in after 100 ms.
  - Never a top-of-page progress bar with a glow.
- **`<ViewTransition>`** (React 19.3, Next guide): Suspense reveals, transitions and deferred values can
  animate. Old content should leave fast (about 150 ms) and new content arrive gently (about 200 ms,
  after the exit). Reduced motion keeps opacity changes and drops positional movement [N3].
- **Browser buffering.** Some WebKit versions buffer streams until more than 1 KB has arrived [N4].
  This doesn't affect our NDJSON AI routes much, because rows are small but numerous. Still flush early:
  send a tiny first NDJSON line (`{"type":"start"}`) so the client can tell "connected" from "waiting".

---

## 10. Proposed loading tokens (for the motion system)

```css
@theme {
  --loading-delay: 300ms;      /* grace before any indicator (network) */
  --loading-delay-fast: 150ms; /* after a debounce already spent ~300ms; button label swap */
  --loading-min: 500ms;        /* indicator floor once visible (enforced in JS) */
  --link-pending-delay: 100ms; /* useLinkStatus / nav hint */
  --skeleton-breath: 1800ms;   /* optional opacity 1 → .55 → 1, ease-in-out; static under reduced motion */
  --reveal-exit: 140ms;        /* skeleton/old content out, ease-out, opacity only */
  --reveal-enter: 180ms;       /* new row in: opacity 0→1 + translateY(4px→0) */
  --done-hold: 400ms;          /* hold a completed state (import ✓) before moving on */
}
```

Under reduced motion, keep the opacity fades and remove translate. Unlike the current global kill
switch noted in the audit, opacity changes are harmless and keep state changes readable [N3][5].

---

## 11. Anti-patterns to keep out (brand + research)

- Shimmer or moving-gradient skeletons, glowing or blurred reveals, rainbow or "AI" gradients, sparkle
  icons, bouncing three-dot «typing» bubbles, and «думает…» lines.
- Skeletons for local Dexie data that show on every visit, and frame-only skeletons used as progress
  [4].
- A global top progress bar for in-app navigation. Navigation is local and prefetched, so it would
  flash.
- A spinner replacing a whole screen when only one section is loading, or one spinner per item instead
  of one per group [5].
- Determinate bars that move backwards or sit at 99 %, and indicators that persist after the work ends
  [20].
- Clearing partial AI results on error or Stop [20][21].
- `aria-live="assertive"` for progress, live regions created at the same moment they are filled [24].

---

## Sources

Web:

1. NN/g, "The 3 Response Time Limits in Interaction Design" (video, response-time topic page): https://www.nngroup.com/videos/3-response-time-limits-interaction-design/ · https://www.nngroup.com/topic/response-time/
2. J. Duke, "Response times": https://jmduke.com/posts/response-times.html
3. Laws of UX, "Doherty Threshold": https://lawsofux.com/doherty-threshold/
4. NN/g, "Skeleton Screens 101" (Tankala, 2023, reviewed 2026): https://www.nngroup.com/articles/skeleton-screens/ · video: https://www.nngroup.com/videos/skeleton-screens-vs-progress-bars-vs-spinners/
5. GitHub Primer, "Loading" pattern: https://primer.style/product/ui-patterns/loading/
6. AWS Cloudscape, "Generative AI loading states": https://cloudscape.design/patterns/genai/genai-loading-states/
7. Significa Foundations, "Loading states" + `useDelayedLoading`: https://foundations.significa.co/guides/loading-states · https://foundations.significa.co/hooks/use-delayed-loading
8. Learning Equality (Kolibri) design system, "Loaders": https://design-system.learningequality.org/loaders
9. Firefox Acorn, "Loading indicators": https://acorn.firefox.com/latest/foundations/global-patterns/loading-indicators-SKyqf3Lj
10. Stripe Apps, "Loading" pattern: https://docs.stripe.com/stripe-apps/patterns/loading
11. `spin-delay` (delay 500 / minDuration 200): https://www.npmjs.com/package/spin-delay · Epic React "Pending Flash": https://epicreact.dev/workshops/react-suspense/pending-flash
12. React, `<Suspense>` reference (300 ms reveal throttle, Transitions, `useDeferredValue`, ViewTransition waits): https://react.dev/reference/react/Suspense
13. Ink & Switch, "Local-first software" (2019); summary: https://en.wikipedia.org/wiki/Local-first_software
14. "How is Linear so fast": https://performance.dev/how-is-linear-so-fast-a-technical-breakdown · https://dev.to/0xgosu/why-linear-feels-fast-local-data-small-updates-and-product-discipline-1m53
15. Dexie, `useLiveQuery()`: https://dexie.org/docs/dexie-react-hooks/useLiveQuery()
16. Skeleton + reduced motion: Volvo Cars DS https://designsystem.volvocars.com/web/components/skeleton/ · freeCodeCamp DS https://design.freecodecamp.org/components/skeleton · TTI/TAMU UX https://ux.tti.tamu.edu/components/skeleton
17. React, `useOptimistic`: https://react.dev/reference/react/useOptimistic
18. React Router, "Pending UI": https://reactrouter.com/start/framework/pending-ui
19. AI SDK, "Object generation" (`useObject`, `stop`, errors): https://ai-sdk.dev/docs/ai-sdk-ui/object-generation · recipe: https://ai-sdk.dev/resources/recipes/next/stream-object
20. Airtribe, "Streaming UX" (TTFT, row streaming, stop, mid-stream errors, scroll): https://www.airtribe.live/upskill-for-free/resources/interactive-explainers/ai-ux/streaming-ux
21. Smashing Magazine, "Designing Stable Interfaces For Streaming Content" (May 2026): https://www.smashingmagazine.com/2026/05/designing-stable-interfaces-streaming-content/
22. "AI Chat UI Best Practices for 2026": https://thefrontkit.com/blogs/ai-chat-ui-best-practices · MetaCTO, "AI Chat UX Patterns": https://www.metacto.com/blogs/ai-chat-ux-patterns-production
23. Cloudscape, "Thinking": https://cloudscape.design/patterns/genai/thinking/
24. Tian Pan, "When Streaming Tokens Meet the Screen Reader" (June 2026): https://tianpan.co/blog/2026-06-29-streaming-tokens-meet-the-screen-reader
25. Smashing Magazine, "Practical Interface Patterns For AI Transparency (Part 2)" (May 2026): https://www.smashingmagazine.com/2026/05/practical-interface-patterns-ai-transparency/
26. "Building a loading state that doesn't feel slow" (DEV): https://dev.to/aon_infotech_3a1b6ff525fc/building-a-loading-state-that-doesnt-feel-slow-lessons-from-an-ai-generation-tool-4ed
27. Harrison et al., "Rethinking the Progress Bar" (UIST '07) and "Faster Progress Bars" (CHI '10): https://www.chrisharrison.net/index.php/Research/ProgressBars · https://www.figlab.com/research/2010/faster-progress-bars · summary https://uxmovement.com/buttons/how-to-make-progress-bars-feel-faster-to-users/
28. Frontend Checklist, "Loading indicators" (disable, aria-busy, JAWS caveat): https://frontendchecklist.io/rules/performance/loading-indicators

Local Next.js 16.4 docs (`node_modules/next/dist/docs/01-app/`):

- N1. `03-api-reference/04-functions/use-link-status.md` (100 ms delayed hint, fixed-size element)
- N2. `03-api-reference/04-functions/use-offline.md` (experimental `useOffline`, retry of blocked requests)
- N3. `02-guides/view-transitions.md` (Suspense reveal: exit 150 / enter 210 / move 400 ms; reduced motion)
- N4. `03-api-reference/03-file-conventions/loading.md` (instant loading states, Cache Components caveat, WebKit 1 KB buffering)
- N5. `02-guides/streaming.md` (static shell, `<Suspense>` vs `loading.js`, CLS/LCP/INP guidance)
