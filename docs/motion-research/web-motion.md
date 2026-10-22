# Micro-interactions and motion: web research brief

Scope: what current (2024-2026) motion systems and platform features say about micro-interactions,
turned into concrete tokens and recipes for «Карточки для Лизи». Research only; no app code changed.
Companion briefs: `audit-motion.md` (what the app does today, with file:line) and `web-loading.md`
(loading states). This brief does not repeat the loading thresholds; it supplies the motion vocabulary
they plug into.

Brand frame (mockups/SPEC.md, DESKTOP-SPEC.md): no gradients, shimmer, box-shadow, glow, sparkles,
emoji, pastel pills, confetti or streaks. Motion must read as **paper and ink in a card catalogue**:
short, damped, physical, never decorative. Every recommendation below is filtered through that.

Numbered citations `[n]` refer to the Sources list at the end.

---

## 0. TL;DR: rules to adopt

1. **One token set, two modes.** Copy IBM Carbon's split [1][2]: *productive* (70-240 ms, almost every
   interaction) and *expressive* (240-400 ms, reserved for a few moments: card turn, session done, route
   change). Carbon fits us: same type family (Plex), same "efficient, out of the way" stance, and Carbon
   explicitly bans bounce, stretch and sudden stops [2].
2. **Enter slower than exit.** Exits ~60-70 % of the enter duration and accelerate away; enters
   decelerate in. Next's own guide uses exit 150 ms / enter 210 ms / move 400 ms [6].
3. **Respond on press, not on release.** Press feedback starts on `pointerdown` within one frame and
   takes <= 100 ms; release/settle can take 150 ms. Scale `.97-.98` is the industry default [9].
4. **Never animate keyboard-driven or high-frequency actions** (desktop 1-4 grading, Cmd-K, list
   navigation) beyond an ink flash. Emil Kowalski: "You should *never* animate them" [8]; Rauno
   Freiberg: frequent motion becomes "cognitive burden" [11].
5. **Interruptible by default.** Use CSS *transitions* (retargetable) for state, *keyframes* only for
   one-shot enter/exit [8][10]. Every animation must be cancellable by input [10].
6. **Springs are allowed, bounce is not.** Damping ratio >= 0.85 everywhere except the stamp (0.75,
   2.7 % overshoot). Express springs with CSS `linear()` behind an `@supports` fallback [13].
7. **Reduced motion = replace movement with opacity**, do not hard-cut everything. Keep <= 150 ms
   fades and colour changes, drop translate/scale/rotate [17][18][19].
8. **View transitions only for navigation semantics** (word detail morph, forward/back, same-route
   crossfade, Suspense reveal). Not for the review card hot path. Next 16.4 + React 19.3 need no
   config flag [6].
9. **`@starting-style` + `transition-behavior: allow-discrete`** for the snackbar, menus, tooltips and
   dialogs we own; no JS mount/unmount timers [14][15].
10. **Haptics are a bonus, never the only signal.** Android Chrome: `navigator.vibrate` (sticky
    activation). Firefox removed it (v129). iOS: the `<input switch>` trick worked iOS 17.4-26.4 and
    is reported patched in 26.5 [21][22][24]. Every haptic needs a visual twin.

---

## 1. The micro-interaction model (Saffer) mapped to our surfaces

Dan Saffer splits every micro-interaction into **trigger → rules → feedback → loops & modes** [3][4].
Rules are invisible, so feedback is the only way the user learns them [4]. That makes it a useful
checklist: for each interaction, if a rule has no feedback the user cannot discover it.

| Micro-interaction | Trigger | Rule (invisible) | Feedback (what we must show) | Loop / mode |
|---|---|---|---|---|
| Swipe to grade | drag on card | past 1/3 width or 0.5 px/ms flick = graded | stamp locks at threshold (visual), haptic tick where possible, fly-out in grade direction | next card rises from the stack |
| Grade button / key | tap or 1-4 | grade applies, card advances | ink fill on the button (press), card exits in grade direction | undo snackbar window |
| Flip card | tap / space | reveals translation | paper turn (`card-turn-*`) | none |
| Add word | submit | saved locally first, sync later | row rules in at top of list, count ticks +1 | duplicate check mode |
| AI suggestion accepted | tap row | becomes a card | row ink-fills then collapses out of suggestions | stream continues |
| Toggle / segmented | tap | setting persists | thumb slides (`transform`), haptic | none |
| Delete word | menu / swipe | soft delete with undo | row collapses (height), snackbar with undo | undo timer |
| Sync | system | background merge | nothing unless conflict or offline (quiet system trigger) | periodic loop |
| Session done | system (queue empty) | no more due cards | expressive moment: rule draws, count settles | tomorrow's due count |

Two takeaways from the model: **system triggers should be quiet** (sync, autosave) and **loops are
where delight goes**, not the trigger (e.g. the session-done screen, not every grade).

---

## 2. Reference systems compared

### 2.1 IBM Carbon (closest fit) [1][2]

| Token | Value | Carbon's usage |
|---|---|---|
| `duration-fast-01` | 70 ms | button, toggle micro-interactions |
| `duration-fast-02` | 110 ms | fades |
| `duration-moderate-01` | 150 ms | small expansion, short movement |
| `duration-moderate-02` | 240 ms | expansion, system communication, toast |
| `duration-slow-01` | 400 ms | large expansion, important notification |
| `duration-slow-02` | 700 ms | background dimming |

| Easing | Productive | Expressive |
|---|---|---|
| standard (visible throughout) | `cubic-bezier(0.2, 0, 0.38, 0.9)` | `cubic-bezier(0.4, 0.14, 0.3, 1)` |
| entrance | `cubic-bezier(0, 0, 0.38, 0.9)` | `cubic-bezier(0, 0, 0.3, 1)` |
| exit | `cubic-bezier(0.2, 0, 1, 0.9)` | `cubic-bezier(0.4, 0.14, 1, 1)` |

Carbon rules worth copying verbatim: duration scales with distance/size; exit easing is for things
leaving view, but a panel that stays nearby and can be recalled uses *standard* [2].

### 2.2 Material 3 [5]

Durations short1-4 = 50/100/150/200 ms, medium1-4 = 250-400 ms, long1-4 = 450-600 ms,
extra-long1-4 = 700-1000 ms. Easing: standard `cubic-bezier(0.2, 0, 0, 1)`, standard-decelerate
`(0, 0, 0, 1)`, standard-accelerate `(0.3, 0, 1, 1)`, emphasized-decelerate `(0.05, 0.7, 0.1, 1)`,
emphasized-accelerate `(0.3, 0, 0.8, 0.15)`. M3 Expressive (I/O 2025) moves to springs, split into
**spatial** (position/size, damping 0.9) and **effects** (opacity/colour, damping 1.0, no overshoot),
with stiffness fast 1400/3800, default 700/1600, slow 300/800 [5][26]. The spatial/effects split is
the useful idea for us: *things that move may settle; things that fade never overshoot*.

### 2.3 Apple HIG / SwiftUI [7]

HIG: motion should have purpose, be brief, be interruptible, and under Reduce Motion be replaced by
subtler transitions such as crossfades. SwiftUI's default animation is a spring with response 0.55 s
and damping fraction 1.0 (critically damped, no bounce) [7]. Apple's own default is therefore
"spring, no bounce", which matches our brand better than any bezier.

### 2.4 Vercel (Web Interface Guidelines) and Emil Kowalski / Rauno Freiberg [8][9][10][11]

- Prefer CSS, then WAAPI, then JS libraries; animate `transform`/`opacity` only; never
  `transition: all`; animations cancellable by input; anchor `transform-origin` to where motion
  physically starts; `touch-action: manipulation`; tabular numbers for comparisons [10].
- UI animations under 300 ms; a 180 ms dropdown feels more responsive than 400 ms; ease-out for
  responsiveness; no animation for keyboard actions; tooltips: delay the first, then instant [8][9].
- Gestures must respond immediately (direct manipulation), carry release velocity into the motion,
  and destructive gesture actions fire on release, not mid-swipe [11].

### 2.5 Linear / Geist

Neither publishes a public motion token spec (searched; nothing official found). Their visible
behaviour follows the Vercel/Kowalski rules above: near-instant menus, 150-200 ms fades, no motion
on keyboard commands. Treat 2.4 as the stand-in.

---

## 3. Proposed tokens for «Лизи»

Seven durations, five curves, three springs. Values reconcile Carbon, M3 and the existing literals
listed in `audit-motion.md` §2 (100/120/150/160/180/200/220/500 ms collapse into the scale below).

### 3.1 Durations

| Token | ms | Use | Source anchor |
|---|---|---|---|
| `--dur-instant` | 70 | press-in (scale/ink), toggle colour, key-grade ink flash | Carbon fast-01 |
| `--dur-quick` | 110 | fades, hover tint, release of press, tooltip | Carbon fast-02 |
| `--dur-exit` | 140 | any element leaving (snackbar, menu, skeleton, old route content) | Next guide exit 150 [6] |
| `--dur-move` | 200 | short movement: row snap, toggle thumb, swipe settle-back, progress step | M3 short4 |
| `--dur-enter` | 240 | entering elements: snackbar, dialog, menu, streamed row, next card | Carbon moderate-02 |
| `--dur-turn` | 320 | expressive: card turn, shared-element morph, route slide | between M3 medium2-3 |
| `--dur-sheet` | 380 | bottom sheet (vaul override from 500), session-done reveal | Carbon slow-01, trimmed |

Rule: nothing in the product exceeds 400 ms except deliberate "slow" loops (import scan line,
`--skeleton-breath` from web-loading.md).

### 3.2 Easing curves

| Token | Curve | Use |
|---|---|---|
| `--ease-standard` | `cubic-bezier(0.2, 0, 0.38, 0.9)` | element visible throughout (thumb, progress, row snap). Carbon productive standard |
| `--ease-enter` | `cubic-bezier(0, 0, 0.3, 1)` | entering, decelerate. Carbon expressive entrance; close to M3 standard-decelerate |
| `--ease-exit` | `cubic-bezier(0.4, 0.14, 1, 1)` | leaving view, accelerate. Carbon expressive exit |
| `--ease-press` | `cubic-bezier(0.2, 0, 0, 1)` | press in/out. M3 standard; fast start = instant acknowledgement |
| `--ease-linear` | `linear` | determinate progress tied to real progress, scan line, ink-rule draw |

This removes the current "three different ease-outs" problem (`audit-motion.md` §2).

### 3.3 Springs (CSS `linear()`)

Generated for this brief with a mass-1 spring integrator (`stiffness k`, damping ratio `zeta`),
simplified to 18-19 stops (max deviation 0.004). Duration is the settle time to within 0.1 %.
Generators for re-tuning: Jake Archibald's Linear Easing Generator, easing.dev, Easing Wizard [12][13].

| Token | k / zeta | Settle | Overshoot | Use |
|---|---|---|---|---|
| `--spring-settle` | 700 / 0.9 | ~350 ms | 0.1 % | card settle-back after a cancelled swipe, next card rising, sheet snap (spatial, M3 default-spatial) |
| `--spring-lift` | 400 / 0.85 | ~480 ms | 0.6 % | shared-element morph, session-done count settle (the only "slow" spring) |
| `--spring-stamp` | 900 / 0.75 | ~300 ms | 2.7 % | grade stamp landing (scale 1.04 → 1). The one place a visible overshoot is allowed |

Opacity/colour never get a spring (M3 "effects": no overshoot).

```css
/* app/globals.css (proposal) */
:root {
  --dur-instant: 70ms;  --dur-quick: 110ms; --dur-exit: 140ms; --dur-move: 200ms;
  --dur-enter: 240ms;   --dur-turn: 320ms;  --dur-sheet: 380ms;

  --ease-standard: cubic-bezier(0.2, 0, 0.38, 0.9);
  --ease-enter:    cubic-bezier(0, 0, 0.3, 1);
  --ease-exit:     cubic-bezier(0.4, 0.14, 1, 1);
  --ease-press:    cubic-bezier(0.2, 0, 0, 1);

  /* Bezier fallbacks first; linear() only where supported (a bad var() would otherwise pass
     parse-time validation and silently fall back to `ease`) [13]. */
  --spring-settle: var(--ease-enter);
  --spring-lift:   var(--ease-enter);
  --spring-stamp:  var(--ease-enter);
}
@supports (transition-timing-function: linear(0, 1)) {
  :root {
    --spring-settle: linear(0, 0.006 1.1%, 0.024 2.4%, 0.05 3.7%, 0.092 5.3%, 0.176 7.9%, 0.495 16.9%,
      0.591 20.1%, 0.675 23.2%, 0.746 26.4%, 0.804 29.5%, 0.856 33%, 0.897 36.5%, 0.931 40.5%,
      0.957 45%, 0.977 50%, 0.99 55.7%, 1 69.8%, 1);              /* use with 350ms */
    --spring-lift: linear(0, 0.006 1.1%, 0.024 2.4%, 0.055 3.8%, 0.096 5.2%, 0.187 7.8%, 0.516 16.5%,
      0.616 19.5%, 0.702 22.6%, 0.774 25.6%, 0.833 28.6%, 0.883 31.9%, 0.922 35.2%, 0.953 38.9%,
      0.975 42.8%, 0.991 47.3%, 1.001 52.5%, 1.006 63.1%, 1);     /* use with 480ms */
    --spring-stamp: linear(0, 0.008 1.3%, 0.027 2.6%, 0.061 4.1%, 0.109 5.7%, 0.208 8.5%, 0.556 17.3%,
      0.657 20.3%, 0.744 23.2%, 0.818 26.2%, 0.878 29.1%, 0.927 32.2%, 0.964 35.4%, 0.99 38.5%,
      1.009 41.9%, 1.027 49.8%, 1.004 80%, 1);                    /* use with 300ms */
  }
}
```

Tailwind 4.3 wiring: the `ease-*` utility reads the `--ease-*` theme namespace, so declaring
`--ease-standard` etc. inside `@theme` gives `ease-standard`, `ease-enter`, ... utilities (verified in
`node_modules/tailwindcss/dist/lib.js`: `themeKeys:["--ease"]`). Tailwind's own `--ease-out`
(`cubic-bezier(0,0,.2,1)`) stays available but should stop being used. Durations: use
`duration-(--dur-move)`; `lib.js` also lists `--transition-duration` as a theme key for `duration-*`,
so `--transition-duration-move: 200ms` in `@theme` should yield `duration-move` (confirm in a build
before relying on it). Spring tokens are plain vars: `ease-(--spring-settle)`.

`linear()` support: Chrome/Edge 113, Firefox 112, Safari 17.2; ~88 % global as of Oct 2025 [12][13].
Caveat: CSS springs have a fixed duration and do not carry velocity on interruption the way JS
springs do [13]. For the swipe release (which has real velocity) keep the JS-computed fly-out, scale
its duration by release speed, and use `--spring-settle` only for the snap-back.

---

## 4. Enter vs exit asymmetry

| | Enter | Exit |
|---|---|---|
| Duration | `--dur-enter` 240 ms (or `--dur-turn` for big moves) | `--dur-exit` 140 ms |
| Easing | decelerate (`--ease-enter`) | accelerate (`--ease-exit`) |
| Distance | 4-8 px translate, from the edge it is attached to | same direction as it came from, or straight fade |
| Opacity | 0 → 1 over the first ~70 % | 1 → 0 over the full exit |
| Ordering | may start after exit finishes (`delay: var(--dur-exit)`) for content swaps | always first |

Rationale: old content should leave quickly so it does not compete; new content arrives gently so it
registers [6]. Same direction in and out keeps swipe-to-dismiss intuitive (snackbar slides down to
leave because it came up) [8]. Distance stays small: Next's guide uses 10 px for reveals and 60 px
for route slides [6]; on a 390 px phone we keep reveals at 4-8 px and route slides at 24-32 px.

---

## 5. Press, hover and focus

**Press (touch and mouse)**
- On `pointerdown`: `transform: scale(.98)` for large surfaces (cards, list rows, grade buttons),
  `scale(.96)` for small icon buttons, plus the existing `bg-surface-2` tint. In: `--dur-instant`
  (70 ms) `--ease-press`. Out (release): `--dur-quick` (110 ms) [9][1].
- `.97` is the common default [9]; we go slightly subtler on big paper surfaces because a whole card
  shrinking 3 % reads as "bouncy". Never scale below `.95`.
- `transform-origin`: centre for buttons; for list rows use the pointer side or `center left` so the
  row "presses into the page" from where the thumb is [10].
- No ripple (Material), no glow. The ink metaphor: on commit (not on press) fill with ink for 70 ms,
  e.g. the grade button flashes `bg-ink text-paper` like desktop's key flash.
- `touch-action: manipulation` and `-webkit-tap-highlight-color: transparent` on all controls [10].
- Use `:active` plus a JS `data-pressed` for elements that also handle gestures (iOS Safari only fires
  `:active` if a touch listener exists; SwipeRow and ReviewCard already have pointer handlers).

**Hover (fine pointers only)**
- Tailwind 4's `hover:` already wraps in `@media (hover: hover)` (verified in
  `node_modules/tailwindcss/dist/lib.js`), but hybrid touch laptops still match. Our `hoverable:`
  variant (`app/globals.css:86`, `(hover: hover) and (pointer: fine)`) is the right default; keep
  using it for every hover.
- Hover = colour/hairline change in `--dur-quick`. No movement, no lift, no scale on hover. Frequent
  hover effects are best with little or no animation [8].
- Tooltips: 400-500 ms first-open delay, then instant for neighbours while one is open [8].

**Focus**
- Focus ring appears instantly (no transition): keyboard users are in "fast mode" [8].

---

## 6. View Transitions (React 19.3 `<ViewTransition>` + Next 16.4)

### 6.1 What the installed Next says

From `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md` [6]:
- "View transitions work in the App Router with **no configuration**." `next.config.ts` has no
  `experimental.viewTransition` flag and none is needed (searched `next/dist/server`: no such key in
  16.4.2). React here is 19.3.0 (`node_modules/react/package.json`), which ships `<ViewTransition>`
  and `addTransitionType`.
- Activated by Transitions, `<Suspense>` and `useDeferredValue`; plain `setState` does **not**
  trigger them. Next navigations are transitions, so route changes animate automatically.
- `<Link transitionTypes={['nav-forward']}>` and `router.push(href, { transitionTypes })` tag a
  navigation; `<ViewTransition enter={{'nav-forward': 'nav-forward', default: 'none'}} ...>` maps
  types to CSS classes. Put the wrapper in each `page.tsx`, **not the layout** (layouts persist).
- Always add `default="none"` to named pairs, and keep `share` explicit when you do, or the morph
  silently stops.
- Morph only plays if the destination renders in the same commit (prefetched/cached). If it suspends
  to a fallback first, no pair forms. Our pages read Dexie client-side, so a word-detail morph needs
  the detail to render synchronously from local data (it does, offline-first) and not behind a
  Suspense fallback.
- `::view-transition { pointer-events: none; }` keeps the page clickable during transitions; named
  participants are still not hit-testable, so keep transitions short and do not name things that are
  tapped rapidly.
- Anchor the header/tab bar: give it a `view-transition-name` and `animation: none` on its group.

### 6.2 Browser support (as of Oct 2026)

Same-document view transitions are Baseline Newly available since 14 Oct 2025: Chrome/Edge 125+,
Safari 18+, Firefox 144+ (incl. `view-transition-class`, `match-element`, `:active-view-transition`)
[16]. Firefox 144's first implementation did **not** include transition *types* [16], which React's
directional `enter={{'nav-forward': ...}}` relies on; there it degrades to no directional slide.
Known iOS issues: a running view transition interrupts in-progress scroll momentum inside the
transitioning area (WebKit bug, open) and white-flash reports on Safari 18.2+ [25]. Without support,
the app works and simply does not animate [6].

### 6.3 Where to use them in this app

| Pattern [6] | Our surface | Spec |
|---|---|---|
| Shared element morph | library row word → word detail headword (Newsreader) | `name={"word-"+id}`, `share="morph" default="none"`, group `--dur-turn` `--spring-lift`; no blur keyframe (blur reads as "AI glow") |
| Directional slide | library → word detail → back; settings sub-pages | `nav-forward`/`nav-back`, 24 px offset, old out `--dur-exit` `--ease-exit`, new in `--dur-enter` delayed by exit |
| Same-route crossfade | theme/folder switch in library, segmented filters | `key={slug}`, opacity only, 140/240 ms |
| Suspense reveal | AI suggestions list, import review | skeleton exits (opacity, 140 ms); content enters opacity + 4 px |
| Tab bar switches (Повтор / Библиотека / Добавить) | crossfade only, no slide (tabs are peers, not depth) | 110 ms |

**Do not** use view transitions for: grading cards (hot path, 100+ times a session, needs gesture
velocity; keep the CSS/JS card motion), toggles, list reorders during typing, or anything keyboard
driven on desktop.

```css
::view-transition { pointer-events: none; }
::view-transition-old(.nav-forward) { --vt-x: -24px; animation: var(--dur-exit) var(--ease-exit) both vt-fade reverse, var(--dur-turn) var(--ease-standard) both vt-slide reverse; }
::view-transition-new(.nav-forward) { --vt-x:  24px; animation: var(--dur-enter) var(--ease-enter) var(--dur-exit) both vt-fade, var(--dur-turn) var(--ease-standard) both vt-slide; }
/* nav-back mirrors the sign of --vt-x */
@keyframes vt-fade  { from { opacity: 0 } }
@keyframes vt-slide { from { translate: var(--vt-x) 0 } }
::view-transition-group(app-tabbar) { animation: none; z-index: 100; }
::view-transition-old(app-tabbar) { display: none; }
::view-transition-new(app-tabbar) { animation: none; }
```

---

## 7. `@starting-style` and `allow-discrete`: enter/exit without JS timers

Baseline since Aug 2024: `@starting-style` in Chrome/Edge 117, Firefox 129, Safari 17.5;
`transition-behavior: allow-discrete` Safari 17.4 [14][15]. `overlay` (top-layer exit) is not
Baseline; treat as progressive enhancement [15][27].

Pitfalls [15]:
- Put `@starting-style` **after** the normal rule (required since Chrome 130).
- `transition-behavior: allow-discrete` written after the `transition` shorthand, or inline per
  property (`display 140ms allow-discrete`); the shorthand resets it.
- List `display` and `overlay` with `allow-discrete` or the element is clipped immediately on close.

Recipe for our snackbar (replaces the JS-injected `snackbar-in` and gives it an exit):

```css
.snackbar {                       /* exit state + transitions live on the base rule */
  opacity: 0; translate: 0 8px;
  transition:
    opacity  var(--dur-exit) var(--ease-exit),
    translate var(--dur-exit) var(--ease-exit),
    display  var(--dur-exit) allow-discrete,
    overlay  var(--dur-exit) allow-discrete;
}
.snackbar:popover-open, .snackbar[data-open] {
  opacity: 1; translate: 0 0;
  transition-duration: var(--dur-enter); transition-timing-function: var(--ease-enter);
}
@starting-style {
  .snackbar:popover-open, .snackbar[data-open] { opacity: 0; translate: 0 8px; }
}
```

Using `popover="manual"` for the snackbar puts it in the top layer (above vaul sheets) and makes the
above work with no React unmount delay. Radix dialogs/menus and vaul keep their own `data-state`
lifecycle; style those with `data-[state=closed]:` keyframes using the same tokens rather than
fighting them.

---

## 8. `prefers-reduced-motion`: replace, don't delete

Evidence: WCAG 2.3.3 is about *motion* (vestibular triggers: large translation, zoom, parallax,
spin), not about any visual change; the all-or-nothing kill switch is called out as a common mistake
[17][18]. Pleo, Apple and others replace scale/zoom/slide with opacity fades [7][18]. Next's guide
itself says the refined approach "would preserve crossfades and opacity transitions while removing
positional movement" [6].

Tiers for this app:

| Tier | Under `reduce` | Examples |
|---|---|---|
| Keep | colour, hairline, opacity changes <= 150 ms | press tint, toggle colour, focus, hover |
| Replace | translate/scale/rotate → opacity crossfade at `--dur-quick` | card turn, snackbar, menus, next card, route slides, morph |
| Remove | looping and large-distance motion | scan line travel (show static rule), skeleton breath, stamp overshoot |
| Keep (direct manipulation) | movement that follows the finger 1:1 | swipe drag position (rotation zeroed), sheet drag |

Implementation: author motion "opt-in" with tokens, and flip tokens under reduce rather than
`!important`-killing everything (so JS listening for `transitionend` still fires) [19]:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-move: 1ms; --dur-turn: var(--dur-quick); --dur-sheet: var(--dur-enter);
    --spring-settle: linear; --spring-lift: linear; --spring-stamp: linear;
    --motion-distance: 0px;   /* use in translate(): translate: 0 calc(var(--motion-distance) * 1) */
    --press-scale: 1;
  }
  ::view-transition-group(*) { animation-duration: 0s; }           /* no morph travel */
  ::view-transition-old(*), ::view-transition-new(*) { animation-name: vt-fade; animation-duration: var(--dur-quick); }
}
```

JS-driven motion (swipe fly-out, counters) checks `matchMedia('(prefers-reduced-motion: reduce)')`,
as `useSwipe.ts` already does.

---

## 9. Haptics on the web

| Platform | API | Status (Oct 2026) |
|---|---|---|
| Chrome / Edge / Samsung on Android | `navigator.vibrate(ms \| pattern)` | Works; needs **sticky user activation**; silent in Do Not Disturb / silent mode; long patterns truncated [20] |
| Firefox (all) | `navigator.vibrate` | **Removed** in Firefox 129 (disabled June 2024) [21] |
| Safari / iOS / iPadOS | none | WebKit opposes the Vibration API [21][23] |
| iOS Safari, switch trick | hidden `<label>` + `<input type="checkbox" switch>`, `label.click()` plays the system selection tick | Works iOS 17.4 → 26.4; `ios-haptics` README says Apple **patched it in iOS 26.5** [22][24]. Unofficial, unstandardised (`switch` is a WHATWG PR), may vanish any release [23] |

Consequences for us:
- `lib/haptics.ts` comments say "iOS 18+"; the real window is 17.4-26.4 and, per [22], closed on
  26.5+. Keep the code (harmless), but **do not design any rule whose only feedback is haptic**. The
  swipe threshold needs a visual lock (stamp at full ink + `--spring-stamp`), which `audit-motion.md`
  gap 3 already asks for.
- Both paths need a user activation; firing from `pointermove` (threshold) is unreliable even on
  Android until the first tap has occurred (sticky activation is per page, so usually satisfied after
  the first tap of a session).
- Vocabulary (Android): `tick` 10 ms (toggle, long-press fire, threshold), `confirm` 20 ms (grade
  good), `reject` `[25, 60, 25]` (grade again / destructive). Short and rare: Mozilla disabled
  vibration over "user annoyance" [21]. Respect the existing setting; rename it «Вибрация» if
  coverage extends beyond swipes.

---

## 10. Numbers, counters and progress lines

- **Tabular figures everywhere a number changes**: `font-variant-numeric: tabular-nums` [10]
  (Plex Mono is already monospaced; Plex Sans and Newsreader need it set). Prevents the "12 → 13"
  width jiggle in the review counter and library counts.
- **Rolling digits** (odometer) are the polished option: only changed digits move, direction follows
  the trend, with tabular widths [28]. NumberFlow does this with WAAPI, is dependency-free and honours
  reduced motion (`respectMotionPreference` default true) [28]. Its examples use ~750 ms spin, which
  is too slow for us; if adopted, use `--dur-move`-`--dur-enter` and `--spring-settle`, mask edges with
  plain opacity (its default mask is a gradient fade; set the mask vars to 0 to stay on-brand).
- **No-dependency alternative**: register `@property --n { syntax: "<integer>"; inherits: false;
  initial-value: 0 }`, transition it, render via `counter-reset: n var(--n); content: counter(n)`
  [29]. Integers step through every value (a count-up), which is fine for 0 → 20 on session done,
  bad for big jumps. Screen readers may not read `content: counter()`, so keep the real number in an
  `aria-live`/visually-hidden span [29].
- Where to count: session-done «N карточек» (count up once, `--dur-sheet`, expressive moment); the
  review "осталось" counter (roll one digit per grade, `--dur-move`); library total after add/delete
  (roll, `--dur-move`). Not on every keystroke-driven filter result.
- **Progress line**: animate `transform: scaleX()` with `transform-origin: left`, not `width`/`left`
  (compositor-only [10]; the audit found `width` + `left` at 200 ms today). Review progress: discrete
  step per card, `--dur-move` `--ease-standard`. Import progress tied to real bytes/rows:
  `--ease-linear`, duration = expected interval, so it never "rushes then waits". The red rule
  (`#c8331f`) can draw in as an ink line: `scaleX(0 → 1)` linear 240 ms.

---

## 11. Paper and ink motion, done tastefully

Principle: objects behave like **light card stock on a desk**: low mass, high friction, almost no
bounce (Rauno: "a card has less bounce because it's conceptually lighter" [11]). Depth is expressed
with hairlines, offset and overlap, never with shadow.

| Motion | Physical metaphor | Spec |
|---|---|---|
| **Stamp press** (grade lock, «Знаю»/«Не знаю» stamp on card) | rubber stamp hits paper | opacity 0 → 1 at threshold in 70 ms, `scale(1.04 → 1)` with `--spring-stamp` 300 ms, rotation fixed at -4° (no animated rotation). Optional: a 1 px ink-bleed via `outline-offset` 0 → 1 px. Reduced: opacity only |
| **Card lift** (drag start, long-press pick-up, desktop drag to theme) | picking a card off the stack | `translate: 0 -2px` + border from `--rule` to `--ink` in 110 ms; no shadow, no scale > 1.01. Drop: `--spring-settle` |
| **Page / card turn** (flip question → answer) | turning an index card | keep the existing `card-turn-up/down`, retime to `--dur-turn` 320 ms with `--ease-standard` on the rotation; content swaps at the midpoint (edge-on), never a 3D perspective > 1200px. Reduced: 110 ms crossfade |
| **Next card from the stack** | card below slides up into place | from the peek (`scale .96`, `translate 0 8px`) to rest in `--spring-settle` 350 ms; starts as the old card exits |
| **Card exit on grade** | card tossed left/right | translate in grade direction, duration from release velocity (min 140, max 240 ms), `--ease-exit`; rotation follows existing gesture constants |
| **Ink rule draw** (session done, section headers on first view, progress) | pen drawing a rule | `scaleX(0 → 1)`, origin left, `--ease-linear` 240 ms; once per screen, never looping |
| **Ink fill press** (commit on grade button, primary submit) | ink soaking into a stamp pad | bg `--surface` → `--ink`, text → paper in 70 ms, hold 120 ms (existing `FLASH_MS`), then advance |
| **Row rules in** (new word, streamed AI suggestion) | a line written on a ledger | opacity 0 → 1 + `translate 0 4px` in `--dur-enter`; stagger 30 ms max, cap 5 rows |
| **Row strike-out / collapse** (delete, accepted suggestion) | crossing out a line | 1 px ink line `scaleX` across the row in 140 ms, then height collapse `grid-template-rows: 1fr → 0fr` in `--dur-move` |
| **Sheet / drawer** | pulling a card file drawer | `--dur-sheet` 380 ms `--spring-settle` (override vaul's 500 ms `cubic-bezier(.32,.72,0,1)`) |

Avoid: paper-curl/peel effects, 3D page-flip libraries, drop shadows for lift, wobble, ink "splash"
particles, typewriter reveal of AI text (it is streamed already; rows rule in instead).

---

## 12. Anti-patterns (research + brand)

- Bounce/elastic easing, overshoot > 3 % (Carbon bans bounce [2]); springs on opacity.
- `transition: all`; animating `width`, `height`, `left`, `top` for frequent motion [10].
- Animating keyboard shortcuts or the 100th repetition of an action [8][11].
- Scale-from-zero popovers, blur-in "AI" reveals, shimmer skeletons, glow focus rings.
- Global `!important` kill switch for reduced motion (replace, don't delete) [17][18].
- Haptic-only feedback; haptics on scroll or every keystroke [21].
- View transitions on hot paths, or naming elements users tap rapidly [6].
- JS `setTimeout` unmount delays where `@starting-style` + `allow-discrete` can do it [14][15].

---

## Sources

1. IBM Carbon, `@carbon/motion` tokens (SCSS): https://cdn.jsdelivr.net/npm/@carbon/motion@11.45.0/index.scss
2. IBM Carbon, Motion overview: https://carbondesignsystem.com/elements/motion/overview/
3. Dan Saffer, *Microinteractions* (O'Reilly): https://www.oreilly.com/library/view/microinteractions/9781449342760/
4. Cieden, Structure of microinteractions (Saffer model summary): https://cieden.com/book/sub-atomic/microinteractions/structure-of-microinteractions
5. Material Components Android, Motion theming (M3 easing, duration, spring tokens): https://raw.githubusercontent.com/material-components/material-components-android/master/docs/theming/Motion.md
6. Next.js 16.4 guide, View transitions (local): `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`; Link `transitionTypes`: `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`; demo CSS https://github.com/nextjs/react-view-transitions-demo
7. Apple, HIG Motion: https://developer.apple.com/design/human-interface-guidelines/motion ; SwiftUI `Animation.default`: https://developer.apple.com/documentation/swiftui/animation/default
8. Emil Kowalski, You don't need animations: https://emilkowal.ski/ui/you-dont-need-animations ; Great animations: https://emilkowal.ski/ui/great-animations
9. Community summaries of Kowalski's rules (scale .97 on press, `cubic-bezier(0.23,1,0.32,1)`, <300 ms): https://skillselion.com/skills/pproenca/dot-skills/emilkowal-animations
10. Vercel, Web Interface Guidelines: https://vercel.com/design/guidelines
11. Rauno Freiberg, Invisible details of interaction design: https://rauno.me/craft/interaction-design
12. Chrome for Developers, CSS `linear()` easing: https://developer.chrome.com/docs/css-ui/css-linear-easing-function
13. Josh W. Comeau, The linear() timing function: https://www.joshwcomeau.com/animation/linear-timing-function/
14. web.dev, Now in Baseline: animating entry effects: https://web.dev/blog/baseline-entry-animations
15. Chrome for Developers, Four new CSS features for smooth entry and exit animations: https://developer.chrome.com/blog/entry-exit-animations ; MDN `transition-behavior`: https://developer.mozilla.org/docs/Web/CSS/transition-behavior
16. web.dev, Same-document view transitions are now Baseline (16 Oct 2025): https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available
17. OpenReplay, prefers-reduced-motion and accessible animation: https://blog.openreplay.com/prefers-reduced-motion-accessible-animation/
18. Pleo Telescope, Motion accessibility: https://telescope.pleo.io/foundations/motion/motion.accessibility ; CSS-Tricks, No motion isn't always prefers-reduced-motion: https://css-tricks.com/nuking-motion-with-prefers-reduced-motion/
19. Flavio Copes, @keyframes and prefers-reduced-motion done right: https://flaviocopes.com/css-keyframes-reduced-motion
20. MDN, `Navigator.vibrate()`: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate
21. W3C Vibration API (Firefox removal in 129, obsolete-rec proposal): https://www.w3.org/TR/vibration/ ; https://lists.w3.org/Archives/Public/public-review-announce/2024Sep/0003.html
22. `ios-haptics` README (switch trick, iOS 17.4-26.4, patched in 26.5): https://unpkg.com/ios-haptics@3.1.1/README.md
23. azukiazusa, iOS Safari web haptics (WebHaptics): https://azukiazusa.dev/en/blog/ios-safari-web-haptics
24. Ionic issue on iOS switch haptics: https://github.com/ionic-team/ionic-framework/issues/29942 ; kimsal, A bit of feedback (Mar 2026): https://kimsal.com/blog/2026/03/20/a-bit-of-feedback/
25. WebKit bugs: view transition interrupts scroll on iOS https://bugs.webkit.org/show_bug.cgi?id=300877 ; Safari 18.2+ flashes https://bugs.webkit.org/show_bug.cgi?id=288795
26. M3 Expressive spring presets (community packages, secondary): https://pub.dev/packages/motor ; https://pub.dev/packages/material_expressive
27. Smashing Magazine, Transitioning top-layer entries and the display property (Jan 2025): https://www.smashingmagazine.com/2025/01/transitioning-top-layer-entries-display-property-css
28. NumberFlow: https://number-flow.barvian.me/
29. CodeShack, Pure CSS counting number animation (`@property` integer counter): https://codeshack.io/pure-css-counting-number-animation/
30. Chrome for Developers, What's new in view transitions (2025): https://developer.chrome.com/blog/view-transitions-in-2025
