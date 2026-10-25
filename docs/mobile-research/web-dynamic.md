# How a restrained paper-and-ink brand (Карточки для Лизи) can make mobile screens less dense and more dynamic/visual without gradients, shadows, confetti or streaks. Web research 2025–2026, with browser support as of Oct 2026.

Web research for the mobile declutter pass (2026-10-24). Research only; no app code changed. Fit is judged against `mockups/SPEC.md` v3 (paper index card, ink, hairlines, one red accent).

## Novelty budget: one expressive moment per screen, the rest familiar  ·  fits

The Browser Company's Dia is 'quite restrained' and spends a limited 'novelty budget' on one area (Chat). Everywhere else it keeps familiar patterns and adds craft only where it gives real value ('elevated'). Google's M3 Expressive research (46 studies, 18k participants) found that breaking basic patterns hurt usability: dropping a scrolling list scored lower, and removing text labels from actions hurt too. It also found 'a strong minority of users preferred calmer designs'. Rule for this app: each tab gets one hero element that moves. Everything else is static hairline UI.

Examples: Повторение: only the card and its stack edges move; header, counts and chips never animate; Библиотека: only the theme tile → theme page transition is expressive; list rows get the quiet 4px rise only

Adaptation: Budget per tab. Повторение: the card stack. Упражнения: the answer ink (already spec'd 5.15). Добавить: the headword being typed in large serif. Библиотека: theme drawers opening as a shared element. MOTION-SPEC 5.12 already caps delight at one moment a day, so this extends the same idea per screen.

Sources: https://browsercompany.substack.com/p/the-strategy-behind-dias-design · https://design.google/library/expressive-material-design-google-research

## Progressive disclosure: one primary action, controls collapsed into one line  ·  fits

Show only what the current step needs, then reveal more as the user acts (staged disclosure: one question per screen). Dia shows icons only on hover and wants 'a single obvious way to accomplish any task'. M3 Expressive research: a larger, emphasised key action was found about 4x faster. Keep the primary action visible even when details are folded away. The current review-front screenshot has app name, undo, gear, an FR→RU control, «Все темы», a counts line, the 04/11 counter, an «FR» label, the hint «тапни, чтобы перевернуть» and «Показать ответ». Three of those say the same thing (hint, button, tap target), and the two filter controls are rarely changed mid-session.

Examples: Review header reduced to: app mark · undo · ⋯; Добавить: one big serif input first; meta fields (pos, level, theme) appear only after a word is entered or a suggestion is picked

Adaptation: Fold FR→RU and «Все темы» into one mono caption line (e.g. «FR → RU · ВСЕ ТЕМЫ ▾»; tapping it opens a sheet). Drop the in-card «FR» label, since the direction is already in that caption. Show the «тапни…» hint only for the first 3 sessions, or drop it because the button already says it. Library: show search plus one «Фильтр ▾» chip instead of 4 chips. Show «Разложить по темам» only when the Inbox has words (the screenshot shows it with «Все слова разложены», which is dead weight).

Sources: https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases · https://browsercompany.substack.com/p/the-strategy-behind-dias-design · https://design.google/library/expressive-material-design-google-research · https://cdn.jsdelivr.net/npm/ui-audit@1.0.2/references/21-patterns-progressive-disclosure.md

## Typographic hero: the headword is the image  ·  fits

The 2025–26 'type-first' and 'exaggerated minimalism' trend uses oversized type as the main graphic element, with deliberate line breaks and lots of white space. Variable fonts let the type flex fluidly. Newsreader has an optical-size axis (opsz 6–72), so very large headwords get the high-contrast display cut automatically. That gives an editorial look with no extra decoration.

Examples: Review front: only «se casser» at 60px plus *v. pron.*, nothing else inside the card; Theme page: theme name as a 44px Newsreader hero, word count as a mono caption

Adaptation: Card prompt goes from 40px to fit-to-width 48–64px (clamp, text-wrap: balance, hyphens off for French), with font-optical-sizing:auto. Turn the reveal into a typographic event: the headword shrinks from 64px to 28px and moves to the top (MOTION-SPEC 5.2 'headword glide'). The translation then writes in below at large size. Do not animate the opsz/wght axes continuously: it costs performance on low-end phones (FontLab) and reads as gimmicky. A single settle is fine.

Sources: https://muz.li/blog/ui-design-trends-in-2025/ · https://fuselabcreative.com/mobile-app-design-trends/ · https://trends.daisyui.com/ui-design-trends-2026/ · https://developer.mozilla.org/en-US/docs/Web/CSS/font-variation-settings · https://valhead.com/2020/11/15/animating-variable-fonts-with-css/

## Big-number type instead of stacked meta lines  ·  fits with adaptation

Type-led and industrial UIs (Nothing OS widgets, Teenage Engineering screens) make one large numeral the focus of a screen and let imagery replace wordy parameters. Today the review screen spreads counts over «4 К ПОВТОРЕНИЮ · 7 НОВЫХ» plus «04 / 11» plus a progress line. One large figure carries the same information with less reading.

Examples: Review idle state: «23» huge, caption «к повторению · 7 новых», one black button «Начать»; Theme tile: count as 28px numeral instead of 11px mono

Adaptation: Use Newsreader lining or tabular numerals (or Plex Mono 500) at 64–96px in ink. The red accent appears only when the number needs attention. Numbers stay static: MOTION-SPEC forbids count-ups and rolling digits, so a number changes as a plain swap. Good places: the pre-session state of Повторение («23» above «к повторению сегодня» and one button), and the Session-Done receipt.

Sources: https://www.gsmarena.com/nothing_phone_4a-review-2948p4.php · https://nothing.community/d/61774-nothing-os-evolution · https://www.soundtech.co.uk/musicians-blog/our-guide-to-the-teenage-engineering-op-1.html · https://blakecrosley.com/de/guides/design/teenage-engineering

## Visible deck: the remaining cards drawn as stacked hairline edges  ·  fits

Stacked-deck card UIs show cards behind the active one slightly offset (and usually scaled or rotated) so their edges reveal how deep the deck is. FlutterFlow recommends a next-card scale of 0.9–0.99. Flashcard and quiz interfaces are a named use case. The stack itself becomes the progress indicator, so the «04 / 11» text and part of the progress line can go.

Examples: Review: card with two hairline edges under it; no «04 / 11» needed; Exercise player: same stack for remaining questions

Adaptation: Paper version: no shadow, no rotation at rest. Show 1–3 white card edges peeking 4–6px below the active card, each with a 1px rule border, the count = min(remaining, 3). The last edge disappears when 1 card is left. MOTION-SPEC already has the next card at .96/8px; keep that and simply leave the edges visible at rest. A red top rule on the active card only.

Sources: https://studio.swiperjs.com/templates/cards-swiper · https://studio.swiperjs.com/templates/cards-stack-slider · https://docs.flutterflow.io/resources/ui/widgets/built-in-widgets/swipeable-stack · https://pub.dev/documentation/recipe_card_stack/latest/

## Swipe-first grading; buttons appear only after reveal  ·  fits

Triage apps make swipe the primary verb with fixed directions: Readwise Reader has customizable swipes and an August 2026 phone toolbar redesign around swiping through documents; Mailswipe and Cloze use left/right for archive/later. Moving the main decision onto the card removes a whole row of buttons from the resting screen.

Examples: Question side: card only, «Показать ответ» replaced by tapping the card (button kept as a slim text link for a11y)

Adaptation: MOTION-SPEC 5.3 already defines the swipe and stamps. For minimalism: on the question side show no grade buttons at all, just the card. After reveal, keep the three outlined grade buttons for accessibility and discoverability (M3E research warns against removing labels), but drop secondary text under them. The direction-is-meaning rule stays.

Sources: https://docs.readwise.io/reader/docs/faqs/navigation · https://readwise.io/reader/update-aug2026 · https://www.tapsmart.com/apps/review-mailswipe-gesture-based-email-management/ · https://help.cloze.com/article/1817-how-do-i-respond-bookmark-for-later

## Shared-element transitions (View Transitions API / React <ViewTransition>)  ·  fits

Morph the same object between screens instead of cutting: a theme tile's 3px colour band grows into the theme page header, a library row's headword flies into the word sheet, and the last review card becomes the receipt. React <ViewTransition> is stable in React 19.3 (Sept 2026), and the project is on next 16.4.2 / react 19.3.0. Shared elements match by a unique name derived from the id (e.g. 'word-'+id).

Examples: Library tile «Деньги» → theme page: band + name morph; Word row → word sheet: headword glides into the sheet title; Last review card → «Готово на сегодня» headline

Adaptation: Browser support, Oct 2026. Same-document startViewTransition: Baseline newly available since Firefox 144 (14 Oct 2025); Chrome 111+, Safari 18+. view-transition-class and name: match-element: Chrome 137, Firefox 144, Safari 18.4. View transition types: not in Firefox. Cross-document @view-transition: Chrome 126, Safari 18.2, not in Firefox (not Baseline). Nested groups: Chrome 140 only. Element-scoped transitions: Chrome 147 only. An SPA App Router only needs same-document, which is safe. Unsupported browsers just get an instant swap. Keep durations at --dur-turn 320ms and morph position/size only, never colour or opacity on a spring. Under reduced motion, crossfade. The Next.js config flag status for 16.4 comes from a community blog, so check node_modules/next docs before relying on it (the AGENTS.md docs path was not present in node_modules/next/dist/docs).

Sources: https://react.dev/blog/2026/09/09/react-19-3 · https://www.vilvaathiban.com/blog/react-viewtransition-stable-react-19-3-upgrade-guide · https://dev.to/fabwaseem/react-view-transitions-in-nextjs-164-viewtransition-addtransitiontype-and-tested-examples-41ln · https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available · https://developer.chrome.com/blog/view-transitions-in-2025 · https://caniuse.com/mdn-css_properties_view-transition-name_match-element · https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/view-transition-name

## Ink-drawn lines and progress (SVG stroke-dashoffset)  ·  fits

Set a path's dash length equal to its total length and animate dashoffset to 0, and the line appears to draw itself (Jake Archibald's technique; staggered per-stroke delays give a handwriting feel). Use it for meaning-bearing lines only: progress rules, the done rule, a tick, the underline that marks the target word.

Examples: Exercise right answer: 1.5px ink tick draws in 200ms next to the option; Theme tiles: 2px progress line draws to its value once when it scrolls into view

Adaptation: Fits 'ink on paper' directly. MOTION-SPEC already draws the red done rule with scaleX. A dashoffset version allows non-straight strokes: a hand-drawn tick on correct exercise answers, a slight underline curve under the headword on reveal, the theme progress lines inking in when a tile enters view. Real progress only: lines draw to the true value and never move backwards (principle 5). Linear easing, ≤400ms.

Sources: https://webdesign.tutsplus.com/sign-on-the-dotted-line-animating-your-own-svg-signature--cms-23846t · https://css-tricks.com/author/ccprog/ · https://github.com/zhengkyl/strokesvg

## Scroll-driven animations (CSS animation-timeline)  ·  fits

Tie animation to scroll position with no JS: scroll() for whole-page progress, view() for elements entering the viewport. Typical uses are a collapsing large title, a reading-progress hairline and reveal-on-enter. Wrap in @supports (animation-timeline: view()) so content stays visible where unsupported.

Examples: Library: large title → compact sticky header + 1px rule fades in as you scroll; Long word sheet: a 1px ink reading-progress rule along the sheet's top edge

Adaptation: Support, Oct 2026: Chrome/Edge 115+. Safari 26.0 shipped it on 15 Sep 2025, and 26.4 reportedly moved it to the compositor. Firefox has it behind layout.css.scroll-driven-animations.enabled, on by default only in Nightly (136+). A June 2026 secondary source says it is still flagged in stable Firefox 152; status in 158 is unconfirmed. Older Firefox needed an explicit animation-duration. On iPhone (the target) it works. Paper use: the «Библиотека» 34px title shrinks into a 17px sticky header with a hairline appearing under it. Theme list sections stick like drawer labels. Never parallax, never fade content out.

Sources: https://webkit.org/blog/17101/a-guide-to-scroll-driven-animations-with-just-css/ · https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ · https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Experimental_features · https://connect.mozilla.org/t5/ideas/implement-css-scroll-driven-animations-animation-timeline/idi-p/116931 · https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline · https://www.buildmvpfast.com/blog/css-scroll-driven-animations-replace-js-2026

## @starting-style entry animations (CSS only)  ·  fits

@starting-style defines the style before first render, so an element can transition in when it is inserted or goes from display:none. transition-behavior: allow-discrete lets display/overlay take part, which enables pure-CSS popovers, sheets and <details>. Both have been Baseline since Aug 2024: Chrome 117, Firefox 129, Safari 17.5 (allow-discrete Safari 17.4). The overlay property is not Baseline.

Examples: New word row in Библиотека: opacity 0 / translateY 4px → rest in 240ms, then spotlight; «Варианты» suggestion rows writing in one by one

Adaptation: Implements MOTION-SPEC's '4px rise + opacity on --dur-enter' for inserted rows, streamed suggestion rows and popovers without a JS motion library. Treat overlay-dependent top-layer exits as progressive enhancement.

Sources: https://web.dev/blog/baseline-entry-animations · https://blog.openreplay.com/animate-display-none/

## Animate to height:auto for in-place disclosure (interpolate-size / calc-size)  ·  fits with adaptation

interpolate-size: allow-keywords on :root lets height animate to and from auto, so 'Ещё' sections open smoothly instead of jumping. calc-size() is the per-property form.

Examples: Card back: translation + meter; «Пример · Спряжение · Происхождение» behind one hairline row that expands

Adaptation: Support: Chrome/Edge 129+. The Chrome docs list Firefox and Safari as unsupported, and no 2026 confirmation of change was found. On iPhone Safari it falls back to an instant open, which is acceptable. Use it to hide secondary card info (example sentence, conjugation, origin) behind one «Ещё» rule on the card back, keeping the default back screen to translation + register + one example.

Sources: https://developer.chrome.com/docs/css-ui/animate-to-height-auto

## Physics split from M3 Expressive: springs for space, curves for effects  ·  fits with adaptation

M3 Expressive moved to spring physics (stiffness/damping) and splits motion into 'spatial' springs (position, size, shape) and 'effects' springs (opacity, colour). Each comes in fast/default/slow and in standard (damping ~0.9, no overshoot) or expressive (damping 0.6–0.8, bouncy) schemes. On the web, CSS linear() approximates springs: Chrome 113, Firefox 112, Safari 17.2.

Examples: Next card settling from the stack: spatial spring ~0.9 damping; Grade ink fill: effects curve, no spring

Adaptation: Take the standard scheme and the spatial/effects split; reject the expressive overshoot. This matches MOTION-SPEC 2.3 (settle 0.1% overshoot, stamp 2.7% the only bounce; opacity/colour never spring). The spring token values come from third-party ports, not m3.material.io itself.

Sources: https://developer.chrome.com/docs/css-ui/css-linear-easing-function · https://pub.dev/documentation/motor/latest/ · https://skills.cat/skills/shelbeely/shelbeely-agent-skills/material-design-3-motion · https://gitea.com/784622644/material-components-android/src/branch/master/docs/theming/Motion.md · https://www.androidauthority.com/google-material-3-expressive-details-3554486/

## Shape as state, not blob morphing (M3E shape → paper geometry)  ·  fits with adaptation

M3 Expressive uses shape morphing (androidx.graphics.shapes Morph) to show state and draw attention. A paper brand cannot morph into blobs, but it can change geometry the way a physical card does: a dog-ear, a notch, a slab sliding between options, a rule thickening.

Examples: Library row for a difficult word: tiny dog-ear instead of a «Трудное» chip; Tab bar: the red marker slides --dur-move between tabs

Adaptation: Keep radius 4–8. Allowed state shapes: a folded top-right corner (clip-path triangle + 1px rule) on «Трудные» words; the segmented-control ink slab sliding (already 5.9); the active tab's 2px red bar sliding between columns; a theme tile's band thickening 3→6px on press. No squircle/pill morphs.

Sources: https://skills.cat/skills/shelbeely/shelbeely-agent-skills/material-design-3-motion · https://designcompass.org/en/2025/05-1tp-3tea/15/material-3-expressive/ · https://design.google/library/expressive-material-design-google-research

## Liquid Glass: reject the material, keep only 'chrome recedes from content'  ·  does not fit

iOS 26 Liquid Glass is a translucent, refractive navigation layer with specular highlights that floats over content. It drew wide legibility complaints: it can't control what passes behind it, and low contrast hurt notifications and keyboard use. Apple added a 'Tinted' option in iOS 26.1 to restore a calmer surface. Apple's own guidance is: navigation layer separate from content, no glass on glass.

Examples: During a session: tab bar slides down 60px and is hidden; returns on Session-Done or on back

Adaptation: Translucency, blur and specular light are the opposite of opaque paper with hairlines, and they break the 4.5:1 contrast rule. Take only the behaviour: chrome gets out of the way of content. Ways to do that: hide the tab bar during a review session (focus mode), let the Library title collapse on scroll. Use opaque white plus a 1px rule, never backdrop-filter.

Sources: https://developer.apple.com/videos/play/wwdc2025/219 · https://developer.apple.com/forums/thread/791070 · https://9to5mac.com/2025/09/15/ios-26-officially-launches-today-but-some-developers-arent-sure-it-should/ · https://anderegg.ca/2025/07/23/update-on-liquid-glass-grumbles · https://gulfnews.com/technology/companies/apple-yields-tinted-control-in-ios-261-beta-4-tones-down-liquid-glass-after-backlash-1.500315176

## Segmented / dot-matrix meters (Nothing OS, Teenage Engineering)  ·  fits with adaptation

Nothing OS builds its identity on monochrome dot-matrix type and segmented widgets, and OS 4.0 said dot-matrix would be used 'more intentionally, where it can define character rather than compromise readability'. Teenage Engineering screens use small functional graphics and animations to replace wordy parameters ('imagery stands in for wordy parameters'; graphics 'are not just decorative; they provide visual feedback').

Examples: Review idle: ▮▮▮▯▮▮□ week strip under the big number; Theme tile: 10-segment learned meter replacing the counts line

Adaptation: No dot-matrix font (it clashes with Newsreader/Plex), but reuse the slang meter's 10×3 segments as the app's one graphic vocabulary. A 7-segment 'week' strip on the Review idle screen (one segment per day, filled ink if reviewed, red outline for today) is a visual summary without streak gamification: no flame, no number, no 'don't break it' copy. A theme tile could show a 10-segment mastery meter instead of 'n · m к повт.' text. Segments fill as a plain step (--dur-move), never animate in sequence for show.

Sources: https://nothing.community/d/61774-nothing-os-evolution · https://www.androidsage.com/2026/10/13/nothing-os-5-0-based-on-android-17/ · https://www.gsmarena.com/nothing_phone_4a-review-2948p4.php · https://blakecrosley.com/de/guides/design/teenage-engineering · https://www.musicradar.com/reviews/teenage-engineering-op-1

## Focus mode for the session (Oak-style stripped screen)  ·  fits

Oak keeps a minimal interface and during a meditation shrinks the screen 'just to a countdown clock'. Each finished session gets one small reward animation (a tree sprouting). Dia's Focus Mode likewise hides sidebars and tabs.

Examples: Review in-session: ✕ · progress rule · card · nothing else

Adaptation: Once «Начать» is tapped, the review screen holds only: a thin progress rule at the top, the card stack, and (after reveal) the grade buttons. Header, filters and tab bar go away; an ✕ top-left exits. The single reward stays the existing «Готово на сегодня» red rule + date stamp (MOTION-SPEC 5.12). Nothing else celebrates.

Sources: https://www.stuff.tv/review/app-of-the-week-oak-review · https://fueled.com/blog/oaks-meditation-companion/ · https://browsercompany.substack.com/p/the-strategy-behind-dias-design

## Highlighter / ink-underline on the target word in context  ·  fits

Readwise Reader's highlight colours are meant to resemble physical highlighter ink on a minimal reading surface. Are.na shows that a near-white page, black text, hairline borders and one accent can feel alive through content alone. Animate the act of marking (background-size sweep or stroke draw) rather than decorating containers.

Examples: «Casse-toi, t'es relou.» with «Casse» underlined in red ink, drawn once

Adaptation: On the card back, show the example_fr sentence in Newsreader italic. The headword inside it gets a 1.5px red-ink underline that draws left→right (background-size 0→100%, linear, 240ms) when the back appears. The red accent stays meaningful: it means 'this is the word'. In Контекст search results use the same underline to mark the matched word.

Sources: https://blakecrosley.com/de/guides/design/readwise-reader · https://www.webdesignhot.com/design.md/are-na/ · https://www.webdesignhot.com/design.md/readwise/ · https://styles.refero.design/style/34c8dbee-f5d9-4495-a0e0-a25c6ca4b95b

## Rough ink edge (SVG feTurbulence + feDisplacementMap), used once  ·  fits with adaptation

Fractal noise from feTurbulence fed into feDisplacementMap roughens the edges of shapes into a hand-drawn look. Low baseFrequency gives a wobble, high gives grain; numOctaves 3–4 is enough.

Examples: Session-Done date stamp «24.10» with a faintly irregular border

Adaptation: Risky. Easily reads as a kitsch 'sketchy' theme, and SVG filters are costly on mobile when animated. If used at all: static, tiny displacement (scale 1–2) on the date stamp and the done rule only, so they look stamped/inked rather than vector-perfect. Never on text, never animated, never on the main card.

Sources: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap · https://instagit.com/cathrynlavery/diagram-design/how-do-i-create-a-sketchy-hand-drawn-variant-of-a-diagram/ · https://medium.com/@codebro/svg-noise-filter-fd5a5edfba86

## Web haptics as a quiet twin of visual commits  ·  fits

Android Chromium supports navigator.vibrate(). iOS Safari has no Vibration API, but clicking the label of a hidden <input type=checkbox switch> (Safari 17.4+) fires the Taptic Engine (publicised March 2026 by Firtman and jhey). A library vendor reports that iOS 26.5 closed programmatic repeated ticks: only the first tick of a pattern fires. An overlay approach, an invisible switch under the user's real tap, reportedly still works. That is a vendor claim, unverified.

Examples: «Знаю» tap → 1 tick + green ink fill; swipe lock → stamp only on iOS

Adaptation: MOTION-SPEC 5.13 already decides this. Update it: on iOS 26.5+ plan for single ticks only. Put the switch as an overlay under the grade buttons and the reveal tap target so the user's own tap triggers it. Map 'again' to 1 tick rather than 2 on iOS. Every haptic keeps a visual twin.

Sources: https://x.com/firt/status/2028807962295230776?lang=en · https://x.com/jh3yy/status/2028544698055299220 · https://haptics.kushagragolash.dev/ · https://pub.dev/packages/web_haptics · https://tonyseets.com/colophon/2026-03-02-haptic-feedback/

## Notes

I did not edit any files. All findings come from web research plus reading mockups/SPEC.md, mockups/MOTION-SPEC.md and the screenshots docs/screenshots/review-front.png and library.png. The screenshots are stale: they show a 3-tab bar and no Упражнения tab.

Where the current screens are dense (mobile):
- Review front has about 10 separate pieces of information above the fold: app mark, undo, gear, FR→RU control, «Все темы», counts line, 04/11, progress line, «FR» label inside the card, the hint «тапни, чтобы перевернуть», and «Показать ответ».
- The hint, the button and the card tap target all say "reveal". The «FR» label repeats the FR→RU control.
- Library stacks title, «11 слов», search, 4 filter chips, a «Разложить по темам» card (shown even when it reads «Все слова разложены»), a section header with counts, then the tiles. Each tile has a count and a progress line.

Highest-leverage recommendations, in order:
1. Split Review into two states. Idle shows one big numeral + a 7-segment week strip + «Начать». In-session is a focus mode: no header, no tab bar, card stack only.
2. Fold the filters into one mono caption line that opens a sheet.
3. Make the headword fit-to-width 48–64px Newsreader (opsz) as the screen's hero.
4. Show remaining cards as 1–3 hairline card edges instead of «04 / 11».
5. Use shared-element transitions (React 19.3 <ViewTransition>, stable; the project has react 19.3.0 / next 16.4.2) for tile→theme page and row→word sheet.
6. Draw ink lines (dashoffset) only for meaningful marks: the true progress value, the right-answer tick, the red underline on the target word in the example.
7. Use a scroll-driven collapsing title in Библиотека.
8. Show «Разложить по темам» only when Входящие has words.

Conflicts with the existing spec to flag:
- M3 Expressive's overshoot/bouncy springs, shape-morph blobs and Liquid Glass translucency all break SPEC v3 and MOTION-SPEC. Adopt only the standard (non-bouncy) spring scheme, the spatial vs effects split, and the "chrome recedes" behaviour.
- A visual week strip is not a streak only if it has no number, no flame and no loss-aversion copy. Treat it as a calendar, not a score.

Browser support as of Oct 2026 (the target is iPhone Safari):
- **Same-document View Transitions:** Baseline newly available since Firefox 144 (Oct 2025); Chrome 111, Safari 18.
- **match-element and view-transition-class:** Chrome 137, Firefox 144, Safari 18.4.
- **View transition types:** not in Firefox.
- **Cross-document @view-transition:** Chrome 126, Safari 18.2, no Firefox.
- **Nested groups:** Chrome 140 only.
- **Element-scoped transitions:** Chrome 147 only.
- **Scroll-driven animations:** Chrome 115; Safari 26.0 (15 Sep 2025). Firefox: flag only in stable, Nightly default since 136; a secondary source says still flagged in 152; unconfirmed for 158. Use @supports.
- **@starting-style + transition-behavior: allow-discrete:** Baseline Aug 2024 (Chrome 117, Firefox 129, Safari 17.5 / 17.4).
- **CSS linear() easing:** Chrome 113, Firefox 112, Safari 17.2.
- **interpolate-size / calc-size:** Chrome 129 only per Chrome docs; Safari and Firefox unconfirmed, so plan for an instant open there.
- **iOS web haptics:** <input switch> trick on Safari 17.4+. A vendor reports iOS 26.5 limits it to single ticks (unverified).

Sources I could not reach or confirm:
- Mobbin screen search needs a paid plan, so there are no screen references from it.
- No primary NYT Games design/motion source was found (search returned only press coverage), so NYT Games is not cited as a pattern source.
- The Literal style reference may not be the Literal app.
- The Oak black-and-white palette is unconfirmed.
- The M3 spring token values come from third-party ports, not m3.material.io.
- The AGENTS.md-mentioned node_modules/next/dist/docs directory does not exist in this checkout, so the Next.js 16.4 view-transition config status comes from a community blog only.
