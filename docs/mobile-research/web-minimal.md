# Minimal, uncluttered mobile screens for learning and flashcard apps (2024–2026): patterns from the best apps and published cognitive-load guidance, mapped to the paper-and-ink brand of «Карточки для Лизи»

Web research for the mobile declutter pass (2026-10-24). Research only; no app code changed. Fit is judged against `mockups/SPEC.md` v3 (paper index card, ink, hairlines, one red accent).

## One next step per screen (path / single primary CTA)  ·  fits with adaptation

The home or tab screen answers one question, 'what do I do now?', with one dominant control. Duolingo replaced its skill tree with a linear path because learners weren't sure they were using the app the 'correct' way. Practice is built into the path, so learners don't choose among review sessions, and a floating arrow returns you to your place. Speak's Dec-2025 home redesign does the same: a course path where a pulsing bubble marks the next lesson. 'Made for You' and 'Jump In' lessons moved off Home to the Practice tab.

Examples: Duolingo path: one circle at a time, return-to-position arrow; Speak: pulsing blue bubble = next lesson; secondary content moved to another tab

Adaptation: Повторение idle state: one Newsreader number plus one full-width black button «Начать» in the thumb zone, and nothing else above the fold. Keep these off the idle state: theme filter, FR→RU, totals. Replace the pulse with a static red-ink rule or underline (MOTION-SPEC has no looping or attention animation).

Sources: https://blog.duolingo.com/new-duolingo-home-screen-design/ · https://help.speak.com/en/articles/11430473-explore-your-new-home-screen · https://www.androidauthority.com/speak-language-learning-3623764/

## Single-number dashboard; counts and meta on demand  ·  fits

Show one meaningful figure, such as 'due today', instead of a grid of stats. Breakdowns appear only when the number is tapped. A Lingvist reviewer found the dashboard 'dense with data' and asked for a simpler visual summary. Clozemaster's v5 dashboard drew complaints of 'too much or too big text in every box, especially on a small screen'. AnkiMobile users asked to hide due counts because they distract people who clear everything daily. The counter-argument is that counts are needed to know which deck has work, which supports showing one number rather than zero.

Examples: Повторение: «23» large Newsreader + mono caption «К ПОВТОРЕНИЮ»; «12 новых» only inside a tap-to-open sheet; Theme tiles: drop the «42 · 6 К ПОВТ.» line from the grid; keep the 2px progress line as the only quantity cue

Adaptation: This fits the dictionary or receipt typography: one big serif number with a mono caption. Use red ink only when the number needs attention.

Sources: https://fluentu.com/blog/reviews/lingvist · https://forum.clozemaster.com/t/new-dashboard-ui/54907/41 · https://forums.ankiweb.net/t/hide-card-counts-on-main-screen/49907 · https://docs.ankiweb.net/ankimobile/deck-list

## Progressive disclosure, max two levels  ·  fits

NN/g: 'Initially, show users only a few of the most important options' and offer the rest on request. Everything frequently needed must be up front. 'Designs that go beyond 2 disclosure levels typically have low usability.' Staged disclosure, wizard style, suits tasks that split into independent steps. Laws of UX (Hick's law): break complex tasks into smaller steps, highlight recommended options, and 'be careful not to simplify to the point of abstraction'.

Examples: Card back level 1: translation + slang meter; level 2 (tap «Подробнее» or pull up): note, example, origin, conjugation, custom fields; Settings: everyday toggles visible, rest under one «Ещё» group (never a third level)

Adaptation: Keep the disclosure control as a plain underlined text link or a hairline row with a chevron. No accordions with tinted headers.

Sources: https://www.nngroup.com/articles/progressive-disclosure/ · https://lawsofux.com/hicks-law/

## Staged entry: ask for one thing, fill the rest later  ·  fits

Things 3 needs only a task name to create a task. Every other detail is added to its card afterwards, and the list shows tasks as 'mere text'. NN/g staged disclosure works the same way: present a subset of options at each step. For a word-add flow, the minimum is the French word. Translation, level and theme can be filled automatically or revealed after it.

Examples: Добавить: screen opens with one large Newsreader input and the keyboard; after the lookup returns, the card fields fade in below one by one; Theme chip shows the auto pick with «подобрано автоматически»; the full theme list only on tap

Adaptation: Matches the 'index card being filled in' metaphor. Fields appear as ruled lines that get written on. Use ink fade-in only, no slide or bounce.

Sources: https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/ · https://www.nngroup.com/articles/progressive-disclosure/

## Review session chrome diet: exit + thin progress only  ·  fits with adaptation

Duolingo's lesson top bar holds only a close (X) and a progress bar. Pratt's critique notes the bar gives enough status 'without needing an exact percentage', and forward actions sit bottom-right. AnkiDroid's new study screen consolidated counts and timer into the toolbar, which can be reordered or moved to the bottom. AnkiMobile has actions to hide the top bar and the bottom bar entirely. NN/g warns of 'chrome obesity': cumulative chrome often eats more than half the pixels, especially on mobile.

Examples: In-session top row: ✕ (44px) left, 1px ink progress line across, nothing else; «07 / 30» mono appears only on tap of the progress line, or on the Session-Done receipt; Undo appears as the post-grade snackbar «Отменить», not a permanent icon

Adaptation: CONFLICTS with SPEC v3 override 'Top row: Карточки mark, FR→RU chip, theme chip, undo + settings icons'. Recommend moving FR→RU and the theme filter to the pre-session idle screen. Settings and undo move into a sheet behind a single «⋯» icon. The progress line stays a 1px ink rule, so it is on-brand.

Sources: https://ixd.prattsi.org/2021/09/design-critique-duolingo-web-app/ · https://www.lazyweb.com/canvas/flows/duolingo/start-lesson · https://forums.ankiweb.net/t/new-study-screen-official-thread/67394 · https://docs.ankiweb.net/ankimobile/study-tools.md · https://www.nngroup.com/articles/browser-and-gui-chrome/

## Hide the tab bar during a session (session as full-screen modal)  ·  fits

Apple HIG: keep the tab bar visible across sections, but 'the exception is when a modal view covers the tab bar, because a modal is temporary and self-contained.' Tab bars should also minimize on scroll in iOS 26. Bear 2's note toolbar 'fades away when you start typing'. iA Writer removes buttons, popups and the title bar entirely. Duolingo lessons run without the tab bar.

Examples: Tapping «Начать» lifts the card into a full-screen session; the 4-tab bar slides away and returns on Session-Done; Exercise player and Import review run the same way

Adaptation: It reclaims about 88px (60 + 28) for the card. Use the MOTION-SPEC paper slide or fade for the transition.

Sources: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/tab-bars.json · https://community.bear.app/t/bear-2-beta-update-9803/4722 · https://ia.net/writer?via=fidel

## Two grade buttons (pass/fail), extras hidden  ·  fits

Mochi rates with only 'Forgot' and 'Remembered'. Anki's community and manual guidance: use Again when it would count as a fail in real life, otherwise Good. FSRS adapts to almost any habit except pressing Hard instead of Again on a lapse. A user analysis found FSRS at least as accurate for 2-button users. AnkiDroid's new study screen has a 'Hide Hard and Easy buttons' setting. Brainscape's 1–5 confidence scale is the opposite, more-choices model (Hick's law cost).

Examples: Back of card: two outlined buttons, «Не знаю» (red) and «Знаю» (green), each half width; «Сложно» reachable by long-press on «Знаю» or a setting; FSRS intervals («1 д») shown only on press-and-hold, not permanently

Adaptation: Keep the outlined button tokens from SPEC. CONFLICT: the SPEC sample shows three buttons with intervals underneath. Recommend two buttons and no interval captions, to cut six text items to two.

Sources: https://mochi.cards/docs/getting-started/reviewing-cards/ · https://forums.ankiweb.net/t/pass-fail-grading-as-default/34147 · https://forums.ankiweb.net/t/i-have-read-the-suggestion-of-using-again-and-good-button-in-anki-but-why-i-lack-the-detailed-explaination/51063 · https://forums.ankiweb.net/t/new-study-screen-official-thread/67394 · https://en.wikipedia.org/wiki/Brainscape

## Tap zones / swipe-to-grade with stamp feedback  ·  fits with adaptation

AnkiMobile's developer: with answer buttons hidden, tapping the right side answers 'good' and the left 'bad'. Tap is the default because it is faster than swipe, and both are configurable. Quizlet sorts cards into 'Know' and 'Still learning'. Swipe-card guidance: the card follows the finger with a clear visual verdict, gives a light haptic on commit, and always has a button fallback.

Examples: Drag the index card right: an outlined «ЗНАЮ» rubber stamp inks in proportionally (already in SPEC); left: «НЕ ЗНАЮ» in red; Front of card: tap anywhere = show answer, which removes the need for a permanent «Показать ответ» bar on repeat sessions

Adaptation: This is the main 'dynamic or visual' lever that stays on-brand. Use a slight rotation tied to drag, with the stamp opacity following offset. No spring overshoot (MOTION-SPEC forbids bounce). Keep the 2 buttons as accessible fallback.

Sources: https://forums.ankiweb.net/t/ankimobile-how-to-replace-4-button-answers-with-just-swipe-left-right-to-correct-incorrect/33949 · https://docs.ankiweb.net/ankimobile/study-tools.md · https://cafebazaar.ir/app/com.quizlet.quizletandroid?l=en · https://vp0.com/blogs/flashcard-swipe-ui-like-anki-quizlet

## Tap-to-expand rows (list shows only the word)  ·  fits

In Things 3, list items are 'mere text'. Tapping one makes it 'pop out into a card-like form while the rest of the list fades into the background', with full details editable in place. Search hides behind a pull-down. Linear Mobile's inbox acts on items with tap or swipe (snooze, delete) instead of visible per-row buttons.

Examples: Библиотека row: «la thune — бабки» only; meter, theme, level, due-date appear when the row expands into an index card in place; Pull down on Library to reveal search; filters live behind one «Фильтр» chip

Adaptation: Expanding a hairline row into a white index card with the red header rule matches the card-catalogue concept. Dim the surrounding list to paper at about 40% ink.

Sources: https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/ · https://linear.app/changelog/2024-09-19-introducing-linear-mobile

## Sheets only for short forks; medium detent; never stacked  ·  fits

Apple HIG: a sheet presents 'a simple task that they can complete before returning to the parent view'. 'In an iPhone app, consider supporting the medium detent to allow progressive disclosure.' 'Avoid using a sheet to help people navigate your app's content.' 'Display only one sheet at a time.' Support swipe-to-dismiss. NN/g: don't use sheets for complex content or core navigation, include a visible Close (X), let Back dismiss, and don't stack.

Examples: Session options (FR→RU, theme, new-word count) in one medium-detent sheet from the idle Повторение screen; Word details in a medium sheet that drags to large; editing a field inside it is in place, not a second sheet

Adaptation: Already supported by SPEC sheet tokens: 12px top radius, 1px top rule, scrim rgba(17,17,17,.4). Add a grabber plus an ✕.

Sources: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/sheets.json · https://www.nngroup.com/articles/bottom-sheet/

## Tab bar = navigation only, few tabs, no badges  ·  fits with adaptation

Apple HIG: 'Use a tab bar to support navigation, not to provide actions. If you need to provide controls that act on elements in the current view, use a toolbar instead.' Fewer tabs are easier, and badges are reserved for critical information 'so you don't dilute their impact'. Material 3 Expressive replaced the 80dp nav bar with a 64dp 'flexible navigation bar'. Arc Search's whole bottom bar is three icons.

Examples: Option A: keep 4 tabs but make «Добавить» open a sheet or page that returns to the previous tab; Option B: 3 tabs (Повторение · Упражнения · Библиотека) + a 44px «+» in the Library and Review idle headers (Things-style add, not a floating circle)

Adaptation: The SPEC tab bar (60px, no dots or counts) is already compact and badge-free, so keep that. Whether «Добавить» stays a tab is a product decision. Present both options as mock-ups.

Sources: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/tab-bars.json · https://9to5google.com/2025/05/14/material-3-expressive-navigation/ · https://www.slashgear.com/1518162/how-to-use-arc-browser-on-iphone/

## Empty and done states: status + teach + one action  ·  fits

NN/g's three empty-state guidelines: show system status ('Totally empty states cause confusion'), use the space for contextual help, and 'provide direct pathways for getting users started'. PatternFly: state what to do, not what's missing. Canva: a headline, 1–2 sentences, one primary button. Apple Journal's first run is empty, 'gently nudging you towards the round + button'.

Examples: Повторение with nothing due: «На сегодня всё» + mono «СЛЕДУЮЩИЕ — ЗАВТРА, 9 КАРТОЧЕК» + one secondary button «Упражнение по теме»; Empty Входящие: one line + «Добавить слово»

Adaptation: Use typographic empty states only, with no illustrations. At most a blank outlined index card drawn with hairlines.

Sources: https://www.nngroup.com/articles/empty-state-interface-design/ · https://v5-archive.patternfly.org/components/empty-state/design-guidelines · https://www.canva.dev/docs/apps/design-guidelines/empty-states · https://appleinsider.com/articles/23/10/30/hands-on-with-apples-new-journal-app-for-iphone

## One item at a time, list mode as an opt-in  ·  fits

Readwise Daily Review 'displays the highlights one at a time' by default. A list icon in the top right switches to Scroll Mode, which carries the extra actions (Master, Feedback, Discard). In Review Mode only Keep and Discard are on screen. Lingvist shows flashcards 'one by one', with a reviewer calling it 'minimal design that keeps you focused'.

Examples: Exercise player: one question per screen, the answer options and nothing else; set title and score only on the done receipt; Import review: one detected word per card with Keep / Skip, plus a «Списком» toggle for power editing

Adaptation: Pairs naturally with the index-card metaphor: one card on the desk at a time.

Sources: https://docs.readwise.io/readwise/docs/faqs/reviewing-highlights · https://www.mickmel.com/readwise-at-the-end/ · https://www.thinkinitalian.com/app-review/lingvist

## Hierarchy through size, contrast and thumb placement  ·  fits with adaptation

Google's M3 Expressive research covered 46 studies and more than 18,000 participants. In eye-tracking, participants spotted key elements up to 4 times faster when the primary action was larger, higher-contrast, contained, and placed near the thumb. The Send button sat above the keyboard instead of in the top toolbar. Caveats: breaking basic paradigms or removing text labels decreased usability, and a strong minority preferred 'calmer' versions.

Examples: The single black primary button sits in the bottom third, not in a header; Keep labels on icon buttons where the action is uncommon (e.g. «Разложить»)

Adaptation: Take the hierarchy lesson but not the M3E aesthetic: no shape morphing, colour blobs or springy motion. In this brand, contrast comes from black ink against paper and from type size.

Sources: https://design.google/library/expressive-material-design-google-research · https://chromeunboxed.com/google-leaks-the-reason-and-process-behind-their-new-material-3-expressive-design-language

## Whitespace instead of containers; fewer type styles  ·  fits

Duolingo's core-tabs redesign (Feb 2026) fixed typography that 'lacked hierarchy' by moving to a minimal number of type styles. It relied on whitespace 'instead of forcing containers around' components, and questioned decorative header art that took space without helping learners. NN/g's minimalism traits: flat surfaces, a limited palette with one accent, restricted elements, maximized negative space, and dramatic typography.

Examples: Audit each screen to at most 4 text styles: Newsreader display, Newsreader list, Plex body, Plex Mono label; Remove boxes around sections; separate them with 24–32px space or a single hairline

Adaptation: This is already the v3 DNA (hairlines, one red accent). The work is removing elements, not restyling.

Sources: https://blog.duolingo.com/core-tabs-redesign · https://www.nngroup.com/articles/characteristics-minimalism/

## Minimal without hiding the critical (guardrail)  ·  fits

NN/g minimalism risks: flat elements 'fail to communicate' clickability, and designers should avoid 'hiding tools or links that are critical'. Subdued palettes risk low contrast. NN/g's hidden-navigation study (179 participants) found hidden navigation less discoverable and slower, at 15% slower on mobile. Chrome guidance: hidden controls must use simple, reliable reveals, not gestures 'subject to accidental activation'.

Examples: Every gesture (swipe-grade, pull-to-search, long-press «Сложно») has a visible equivalent one tap away; Keep the 4.5:1 contrast tokens; don't fade muted text further for 'calm'

Adaptation: Outlined buttons with 1px ink borders keep affordance in a flat paper style. Don't turn them into bare text.

Sources: https://www.nngroup.com/articles/characteristics-minimalism/ · https://www.nngroup.com/articles/hamburger-menus/ · https://www.nngroup.com/articles/find-navigation-mobile-even-hamburger/ · https://www.nngroup.com/articles/browser-and-gui-chrome/

## Focus fade: dim everything but the active object  ·  fits

iA Writer's Focus Mode highlights the current sentence and fades everything else. In Things 3, opening a task makes the 'rest of the list fade into the background'. The visual dynamics come from attention shifting, not from decoration.

Examples: Card flip: the front word stays in ink while header and footer fade to 30% until the answer settles; Library row expanding: other rows fade to muted ink

Adaptation: Calm, paper-like motion that MOTION-SPEC allows: opacity and ink fades with no scale bounce. It is the cheapest route to 'more dynamic' without breaking the brand.

Sources: https://ia.net/writer?via=fidel · https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/

## Progress as a physical object, not numbers  ·  fits with adaptation

Duolingo and Speak show progress through position on a path and filled bubbles (filled = done, check = complete) instead of numeric stats. Things 3 uses a per-project progress indicator and a Today ring in place of count badges. This replaces counts with a single glanceable visual.

Examples: Session progress drawn as a thin stack of index-card edges under the active card that loses one hairline per graded card; Theme tiles keep only the 2px progress line; numbers move into the theme screen

Adaptation: Use the card-catalogue metaphor (stack thickness, a drawer filling) instead of bubbles or rings. No count-up animation (MOTION-SPEC). A static redraw per card is fine.

Sources: https://blog.duolingo.com/new-duolingo-home-screen-design/ · https://help.speak.com/en/articles/11430473-explore-your-new-home-screen · https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/

## Notes

Read-only research; no files were changed. Searches ran in standard mode, plus one extended search that came back thin.

Limits on the evidence:
- I found no 2024–25 Duolingo home redesign. The path dates from Nov 2022; the newest source is the core-tabs refresh of 4 Feb 2026.
- Speak's home redesign (Dec 2025) is the most recent next-step example.
- Busuu, Brainscape and Quizlet gave little UI detail. Brainscape is mainly a contrast case (a 1–5 scale means more choices).
- Clozemaster's v5 dashboard and Lingvist's dashboard are negative examples: users complained about density on small screens.
- Mochi's docs confirm two-button grading but don't say whether the review screen shows counts or progress.
- Apple HIG quotes come from the HIG JSON endpoints, because the HTML pages need JS to render.
- The Material 3 Expressive figures (up to 4× faster to spot key elements, nav bar 80→64dp) are Google's own research on concept designs, plus secondary sources for the nav-bar height.

Where the research conflicts with mockups/SPEC.md v3 (the user should decide):
1. The SPEC's Review top row has a mark, FR→RU chip, theme chip, undo and settings. The research says to keep only ✕ and a 1px progress line during a session, and move the rest to the idle screen or a single «⋯» sheet.
2. The SPEC's grade buttons are three, each with an FSRS interval caption. The research favours two buttons (Не знаю / Знаю), with «Сложно» and the intervals on long-press or in a setting.
3. «Добавить» is an action in the tab bar, which HIG advises against. One option is 3 tabs plus a «+» in the headers; the other keeps 4 tabs with Add as a page or sheet.
4. Theme tiles show counts («42 · 6 К ПОВТ.»). The research suggests keeping only the progress line.

Patterns that fit the brand as they are: progressive disclosure, Things-style expand-in-place rows, sheets with a medium detent and a visible ✕, typographic empty states, whitespace instead of containers, and focus fades.

Patterns that would make the app more dynamic or visual while staying on-brand:
- swipe-to-grade with an ink-stamp verdict (already in the SPEC);
- focus fades;
- a progress line or index-card stack edges instead of «07 / 30»;
- rows that expand into index cards;
- the session as a full-screen modal with the tab bar hidden.

All of these avoid bounce, confetti and count-ups, as MOTION-SPEC requires. Mock-up artboards worth making: an idle Повторение with one number and one button; a chrome-free session (front and back with two buttons); a Library with expanding rows; staged Add; and the two tab-bar options.
