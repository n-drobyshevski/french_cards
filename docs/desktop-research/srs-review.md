# Desktop review (study) UX in SRS / vocab apps — research notes

Scope: how desktop/web SRS and vocabulary apps lay out the review screen on wide screens; keyboard conventions; how shortcuts are taught; grade buttons + intervals; progress; session end; focus modes; user complaints.
Date: 2026-10-22. Reddit is not reachable from this research agent (blocked); complaints come from the official forums instead (AnkiWeb forums, WaniKani/Bunpro community, Clozemaster forum, Mochi forum), plus blog reviews.
Confidence markers: [doc] = official docs/changelog, [forum] = official forum / staff post, [3p] = third-party source, [mem] = from prior knowledge, not re-verified this session.

---

## 1. App-by-app findings

### Anki desktop (and AnkiWeb)
- **Layout.** The card is rendered in a full-width webview. The **default card CSS has no max-width**, so on a 1920px monitor text runs edge to edge unless the note type's CSS caps it ("there is no default width constraint for card content"). A bottom bar holds **Edit** (bottom-left), **Show Answer / the answer buttons** (centre) and **More** (bottom-right). [doc] https://docs.ankiweb.net/studying.html · [forum] https://forums.ankiweb.net/t/it-is-not-possible-to-grow-beyond-the-margins/30074
- **Readability proposal (2025).** A proposal to modernise the default card template: `max-width: 650px` (about 75 characters per line), `margin: auto`, `font-size: 19px`, `line-height: 1.5` (1.6 suggested for desktop), `padding: 40px 20px` (author would prefer about 80px on desktop), and a plain 1.5px black divider between question and answer instead of the bevelled `<hr>`. Pushback: centred text suits minimal cards, which Anki encourages; start-aligned text "can look lost in wide windows"; a max-width also caps image size. [forum] https://forums.ankiweb.net/t/modernize-default-card-templates-for-readability-revised-proposal-and-technical-details/54669
- **Vertical centering.** Users ask for a native "center vertically" option on desktop because "top-aligned cards on large monitors look sparse". Counter-argument: centring makes the question **jump** when the answer appears. Proposed fix: centre question and answer *as one block* so the question doesn't move. [forum] https://forums.ankiweb.net/t/native-option-to-vertically-center-cards-in-anki-desktop/45651
- **Answer keys.** `Space`/`Enter` = Show Answer. `1` Again, `2` Hard, `3`/`Space`/`Enter` Good, `4` Easy. `S` returns to the deck overview, `/` switches deck. [doc] https://docs.ankiweb.net/studying.html
- **Other reviewer keys.** `E` edit, `-` bury card, `=` bury note, `@` suspend card, `!` suspend note, `*` mark, `Ctrl/⌘+1..4(..7)` flags, `R` replay audio, `V` replay own voice, `Shift+V` record voice, `5/6/7` pause / −5s / +5s audio, `O` options, `Ctrl/⌘+Delete` delete note, `Ctrl/⌘+Z` undo (an undocumented `U` also undoes). [3p] https://www.pie-menu.com/shortcuts/anki · [forum] https://forums.ankiweb.net/t/undo-shortcut-while-reviewing-other-than-ctrl-z/52551
- **How shortcuts are taught.** There's no shortcut overlay. Shortcuts appear in menu items and on hover tooltips over buttons ("mostly they are documented by hovering over the button/link"). The tooltips once **showed the wrong key** after users remapped answer keys (GitHub issue #2637). Some users want to **hide** the "Shortcut key: N" hover tooltips. [forum] https://forums.ankiweb.net/t/keyboard-shortcut-usage/21280 · https://forums.ankiweb.net/t/answer-key-pop-up-on-hover-shows-wrong-value/33840 · https://forums.ankiweb.net/t/hide-answer-tooltip/42212
- **Intervals on buttons.** Preference "Show next review time above answer buttons" ("useful to know how far in the future your cards are being pushed") is on by default. "Show remaining card count" can be turned off. The `Space`/`Enter` grading behaviour is a preference ("Spacebar (or Enter) also answers card"). Appearance → Distractions: "hide top and bottom bar during reviews", "minimalist mode", "reduce motion". [doc] https://docs.ankiweb.net/preferences.html
- **Debate on showing intervals.** One side says the displayed times make users pick buttons by interval ("press Easy because Good shows 7 days") and are "geek info … like a game's FPS counter", so they should be hidden by default. The other side says the times explain what each button does to new users. [forum] https://forums.ankiweb.net/t/hide-time-until-next-review-by-default/45772
- **Hard misuse (FSRS).** Many users treat **Hard as a failing grade**, which hurts FSRS. Proposed UI fixes:
  - a **wider gap between Again and the passing buttons**;
  - a red outline on Again and green on the others, plus non-colour cues for colour-blind users;
  - clearer tooltips;
  - AnkiMobile-style feedback: a brief red ✕ for Again, a coloured ✓ for the others.

  The FSRS FAQ says FSRS is about equally accurate for 2-button and 4-button users. [forum] https://forums.ankiweb.net/t/add-visual-cues-to-make-it-clear-that-hard-is-not-a-failing-grade/40879 · https://forums.ankiweb.net/t/how-to-prevent-users-from-misusing-hard-ideas-are-welcome/49092
- **Space defaulting to Good.** Because Space both reveals and grades Good, "a slightly long press" or a double tap rates an unknown card as Good. Users ask for Again to be the default focused button, or to separate Space from Enter. [forum] https://forums.ankiweb.net/t/change-default-rating-button-after-answered-question/5148 · https://forums.ankiweb.net/t/spacebar-or-enter-also-answers-cards/53806 · https://forums.ankiweb.net/t/anki-bug-pressing-twice/2863
- **Progress.** Anki has no progress bar, only queue counts (new/learning/review, coloured blue/red/green, with the current card's queue underlined [mem]). An "Accurate progress bar" add-on shows "23/67". Users complain its denominator includes learning cards that re-enter the queue and cards buried by daily limits, so the count overshoots. [forum] https://forums.ankiweb.net/t/accurate-progress-bar-official-thread/30109 · https://forums.ankiweb.net/t/anki-25-01-02-beta-rc/54490/69
- **Focus mode.** F11 toggles full screen. There's no native way to hide the menu bar during reviews, so the "Focus Mode Suite" add-on does it. A moderator warns full screen "isn't ideal on larger displays, since the eye should stay on the content". Users want a **centred window on a plain backdrop** (canvas mode) instead of an edge-to-edge stretch. With chrome hidden it becomes hard to tell question from answer, so testers tried a **subtle Q/A marker** and preferred a thin **dark-red card border** over a popup. [forum] https://forums.ankiweb.net/t/full-screen-a-small-feature-id-love-to-see-in-anki/70464
- **Session end.** "Congratulations! You have finished this deck for now." plus a Custom Study link. Users find it confusing: it means the queue is empty, not that the deck is finished. [forum] https://forums.ankiweb.net/t/anki-keeps-saying-congratulations-you-have-finished-this-deck-for-now/65312 · https://forums.ankiweb.net/t/help-how-to-review-cards-continuously-every-day-or-anytime-i-want-when-anki-says-congratulations-you-have-finished-this-deck-for-now/61446.md
- **New study screen (Anki 25.09 / AnkiDroid 2.23).**
  - Counts and timer moved into the toolbar; flag and mark sit in the top corners; the toolbar is reorderable.
  - Answer feedback became icons (wrong on the left, right on the right).
  - A "Hide Hard and Easy buttons" setting; a "Box" frame option.
  - Complaints: margins and rounded corners waste space; the feedback position is too low (eye travel); the deck name isn't shown — users want it in small text above the counts.

  [forum] https://forums.ankiweb.net/t/new-study-screen-official-thread/67394
- **AnkiWeb.** Historically a minimal page. The "Enhanced AnkiWeb" userscript adds zen mode (X), 1–4/Space/Enter answer keys, an Again/Pass-only option and +/- zoom. That users needed it implies the stock page lacked these. [3p] https://greasyfork.org/en/scripts/465876-enhanced-ankiweb
- **General verdict.** Anki's review screen is "ugly to look at"; Mochi "feels like it was built to address the main complaint about Anki: the interface". [3p] https://borretti.me/article/hashcards-plain-text-spaced-repetition

### Mochi (desktop + web)
- **Shortcuts on buttons.** Button text includes the shortcut key ("Mochi's are emphasized in the UI (the button text includes the shortcut)"). The reviewer says this teaches shortcuts faster than Anki's hover tooltips. [3p] https://borretti.me/article/first-impressions-mochi
- **Grading.** Binary: **Forgot / Remembered**. New-card screen: "Add to reviews" (`Space`) and "Again" (`F`), with arrow keys to move through the queue. A failed card goes to a re-review queue in the same session. [doc] https://mochi.cards/docs/getting-started/reviewing-cards/
- **Opens straight into review.** "When you start the app you go right into review mode" — praised versus Anki's deck → Study Now. [3p] https://borretti.me/article/hashcards-plain-text-spaced-repetition
- **Progress.** Built-in progress bar and retention rate (Anki needs add-ons for these). Criticism: "I wish the progress bar was a bit more emphasized." Also, failing the **last card of the day** leaves the answer visible instead of a clean end state. [3p] https://borretti.me/article/first-impressions-mochi
- **Undo.** Exists. A regression in which undo stopped rewinding the stack to the previous card was fixed. Users expect undo to bring the previous card back on screen, not just show a toast. [3p] https://forum.mochi.cards · App Store notes https://apps.apple.com/app/id1507775056
- **Search.** Global search is `Cmd+K`. [forum] https://forum.mochi.cards
- **Gestures.** On iPhone, drag left/right means forgot/remembered; users asked for a setting to disable it. [forum]

### RemNote
- **Grading.** A row of buttons under the card (Forgot / Partially recalled / Recalled with effort / Easily recalled [mem]); keys `1–4`, and the backtick/comma key [forum]. Users report the shortcuts "stopped working", and the reply was to check Settings. Customising shortcuts needs Pro. [forum] https://forum.remnote.io/t/practice-repetition/9540
- **Shortcut list.** Opened with `Ctrl+Alt+Shift+H`, or via the omnibar (`Ctrl/⌘+K` → "Open Keyboard Shortcuts"); the list is searchable. [doc] https://help.remnote.com/en/articles/7893440-keyboard-shortcuts
- **Typed answers.** In type-answer mode, Enter compares the input and **pre-selects** Forgot or Recalled-with-effort; the user can override. [doc] https://help.remnote.com/en/articles/7752298-typing-in-answers
- **Requests.** Users ask for Anki-style queue stats ("small floating widget … showing remaining cards") and for seeing the card's document context (parents/siblings) without leaving the queue. [forum] https://feedback.remnote.com/p/display-queue-stats-new-learning-due-similar-to-anki · https://forum.remnote.io/t/is-there-a-way-of-easily-and-quickly-access-the-document-at-the-part-of-the-current-rem-when-making-flashcards/947

### Quizlet (web Flashcards / Learn)
- **Flashcards keys.** `Space` flips, `←`/`→` move between cards, `3` shows term and definition together (per the Quizlet blog). The Options menu has Shuffle and "Track progress", which sorts cards into **Still learning / Know** (the arrow keys then act as the sort). Progress categories: Not studied / Still learning / Mastered. [doc, via search snippet; help center 403'd] https://help.quizlet.com/hc/en-us/articles/360030988091-Studying-with-Flashcards · https://quizlet.com/blog/welcome-back-to-school-heres-whats-new-improved
- **Learn/Write.** Enter submits; there is an "Override: I was correct" button, popular enough that a Chrome extension exists just to bind it to a key. [3p] https://chromewebstore.google.com/detail/fklckbkonciifmohglgdppgikcbohjob · https://greasyfork.org/scripts/13106/code
- **Common pattern (Goodnotes and others).** `Space` flip, `←` Still learning, `→` Knew it. This binary left/right mapping is the de-facto web flashcard convention and matches swipe directions. [doc] https://support.goodnotes.com/hc/en-us/articles/7353711248783-Use-keyboard-shortcuts-with-Study-Sets

### Brainscape
- **Grading.** 1–5 confidence rating drives repetition. `Space` reveals ("the reveal answer button is tapped (or space bar)"). Number-key rating is likely but not confirmed in docs. [3p] https://pl.trustpilot.com/review/brainscape.com?page=4 · https://www.brainscape.com/learn/keyboard-shortcuts

### Clozemaster (web)
- **Shortcut discoverability.** Users complained they couldn't find shortcuts anywhere. They were first only in game settings, then a Help button, and since 2021 they're in **button tooltips**. Users then flagged inconsistent tooltip formatting and missing ones (half-speed audio; the Help button itself).
- **Alt-key conflicts.** Shortcuts like `Alt+H` (hint) and `Alt+D` (edit sentence) collide with browser menus or the address bar, so both shortcut sets got separate on/off toggles.
- **Other keys.** `Ctrl+Space` plays audio; `Alt+A` adds to collection; `Shift+Alt+X` opens Explain.

  [forum] https://forum.clozemaster.com/t/keyboard-shortcuts-not-listed-no-help-in-general/7948 · https://forum.clozemaster.com/t/keyboard-shortcut-for-explain/62831 · https://forum.clozemaster.com/t/alt-h-not-working-for-text-entering/52065
- **End of round.** A "Round Complete" summary with a list of sentences played. Users ask to bulk "mark as known" from that list and to toggle translations. One user preferred the old Round Complete design. [forum] https://forum.clozemaster.com/t/help-us-improve-clozemaster-what-would-you-most-like-to-see-added-changed-or-improved/12054?page=9 · https://www.clozemaster.com/blog/clozemaster-update-may-2020/

### Lingvist (web)
- **Layout and keys.** Left menu bar with Settings at the bottom. Keys: `→` reveals the answer, `←` goes back to the previous card, `↑`/`↓` show/hide the diacritics menu. Auto-advance after a correct answer can be turned off; a help article exists titled "the card changes too quickly". [doc] https://lingvist.com/help/how-do-i-navigate-lingvist/ · https://lingvist.com/help/the-card-changes-too-quickly/
- **Look.** Reviewers call the UI "clean and minimal". [3p] https://www.thinkinitalian.com/app-review/lingvist

### Memrise (web)
- Reviews say the interface is "optimized for use on a smartphone to the extent that certain features are unavailable on the desktop version". Ratings dropped after community courses were removed and the interface changed. Shortcuts were historically added by an abandoned extension ("Memrise on Steroids"). [3p] https://actualfluency.com/memrise-review · https://kimola.com/reports/uncover-the-impact-memrise-apps-user-feedback-report-app-store-us-147885
- Lesson for us: a desktop app that is just the phone UI scaled up is a known complaint.

### Duolingo (web)
- **Lesson screen.**
  - A full-width **progress bar at the top**, with no number.
  - A **footer** with Skip on the left and Check/Continue on the right.
  - **One primary action per screen.**
  - Feedback via a coloured footer banner, animation and sound.
- **Keys.** `Enter` submits/continues; `1/2/3` pick multiple-choice options (the number is shown inside each option tile); `Ctrl+Space` replays audio, `Ctrl+Shift+Space` replays it slowly.
- **Critique.** Unlabelled icons ("key" icon) are weak signifiers; the flag icon doesn't look clickable until hovered.

  [3p] https://ixd.prattsi.org/2021/09/design-critique-duolingo-web-app/ · https://tutorialtactic.com/blog/duolingo-shortcuts/
- **Rest of the screen.** Outside lessons, a left nav column and a right column of widgets (streak, league, quests) sit around a centred path [mem]. During a lesson all of that chrome disappears: a deliberate focus mode.

### Readwise Daily Review (web)
- **Format.** One highlight at a time in "Review Mode", or the whole review in a list ("Scroll Mode"). The review ends with a "Bonus Highlight" card (a book recommendation or a tip). [doc] https://docs.readwise.io/readwise/docs/faqs/reviewing-highlights
- **Keys.** `←`/`→` prev/next, `Enter` done-and-next, `t` tag, `m` master, `` ` `` feedback (spaced repetition), `f` favourite, `d` discard, `e` edit, `n` note, `s` share, `cc` copy, `ll` card/list view toggle. Reader (sister app) uses `?` or `Ctrl+K` for the full list. [doc] https://docs.readwise.io/readwise/docs/faqs/reviewing-highlights#can-i-use-keyboard-shortcuts-in-readwise · [3p] https://curtismchale.ca/2025/03/29/read-later-with-readwise
- **Takeaway.** Mnemonic single letters for secondary actions (e/edit, d/discard, f/favourite) plus Enter for the main forward action.

### WaniKani (web)
- **Review keys.** `F` item info, `E` expand/collapse hidden info, `J` audio, `/` kana chart, `,` last session data. Lessons: `←`/`→`, WASD, `G`, `Q`, `J`. [doc] https://knowledge.wanikani.com/wanikani/keyboard-shortcuts
- **Teaching shortcuts.** `?` toggles a hotkey menu, plus a persistent "hotkeys" button bottom-right that can be collapsed. Users still discover `F` late ("used the mouse … until Level 30"); there are threads titled "Press F for info, a hidden feature?". [forum] https://community.wanikani.com/t/just-a-quick-reminder-to-use-keyboard-shortcuts-for-reviews-and-lessons/70506
- **2023 redesign.**
  - The **review summary page was removed**; reviews now return straight to the dashboard.
  - Several users said losing the summary "hurts motivation and immediate feedback".
  - Others disliked the centred layout or found it dated.
  - Enter stopped advancing lessons, which was inconsistent with reviews.
  - Sessions no longer time out.

  [forum] https://community.wanikani.com/t/updates-to-lessons-reviews-and-extra-study-are-live/61049
- **Wrap-up.** A wrap-up button finishes the in-flight items and then ends the session [mem].

### Bunpro (web, Reviews 2.0)
- **Wide-screen handling.** Users complained content spread too far on big monitors. Bunpro added a **Display menu**: fixed vs full width (offered only at ≥1280px) and fixed (530px) vs full height. A later "wide-screen mode" caps quiz content width. [forum] https://community.bunpro.jp/t/reviews-2-0-and-a-whole-lot-more-beta/57586
- **Keys.** `Enter` submit (only when the input is focused — an accessibility choice), `Space` hints, `Shift+Space` hints, `f`/`↓` grammar drop-down, `a` show answer after a wrong submission, `p` play audio, `Backspace` undo or override, `I` refocus input, `0` **wrap-up** (or end now). A keyboard icon bottom-right opens a **hotkey map**, plus a new "keyboard shortcut tooltip". [forum] https://community.bunpro.jp/t/bunpro-help-page/1225 · https://community.bunpro.jp/t/is-there-a-keyboard-shortcut-to-master-a-vocab/101793
- **Summary.** Available for the last session or the past 24h; incorrect answers link to the grammar point; can be sorted correct/incorrect.
- **Complaints.** Auto-scroll after answering was disruptive; gradient banding in the background; users had to scroll on iPad.

### Migaku
- Pass/fail grading philosophy (official video "How to grade SRS flashcards… the Migaku Bible method"). No public hotkey docs found. https://migaku.com/blog/youtube/how-to-grade-srs-flashcards-for-language-learners-the-migaku-bible-method

### Other / newcomers (2025–2026)
- **Traverse.** `Cmd/Ctrl+Enter` check answer; `1` incorrect, `2` too hard, `3`/`Space` good, `4` easy — the Anki mapping copied verbatim. https://traverse.helpscoutdocs.com/article/12-keyboard-shortcuts
- **Logseq flashcards.** Letter keys: `s` show answer, `f` forgotten, `t` took a while, `r` remembered. Users ask for 1234 instead ("four keys close together in one line"). https://discuss.logseq.com/t/allow-customizing-flashcards-shortcuts/4308
- **Hashcards (Borretti, FSRS, plain-text Markdown).** `hashcards drill` opens a local web UI; the stated goal is "an elegant UI for drilling flashcards". He argues more than 2 grades matter for scheduling, against Mochi's binary. https://borretti.me/article/hashcards-plain-text-spaced-repetition
- **FlashCard (macOS, MIT).** Fully keyboard: `Space` reveal, `→` mastered, `←` again. **Zen** (FSRS terminal UI) shows interval previews. The "Flashcards & Spaced Repetition" Chrome extension (FSRS-4.5) uses `Space` reveal and `1–4` rate. https://www.producthunt.com/products/flashcard · https://docs.rs/crate/zen/0.2.2 · https://chromewebstore.google.com/detail/alegelifmfcilanlpefgbkbgfnceldaf
- **Rember (web/iOS/Android, FSRS).** Pause, snooze, undo; praised as "the friction between opening the app and starting a review session is almost zero". (Promotional source.) https://aiindigo.com/blog/rember-review-a-modern-approach-to-spaced-repetition-in-2026
- **Noji (formerly AnkiPro).** Has a web version; reviewers praise the "super clear" design; no keyboard docs found.

---

## 2. Cross-cutting patterns

### Card width and placement on 1280–1920px
- The best-received pattern is a **centred card or text column of about 600–700px max** (Anki proposal: 650px ≈ 75ch; Bunpro's fixed-width/fixed-height 530px mode). Edge-to-edge stretch is the main complaint (Anki default, Bunpro pre-fix).
- **Vertical position.** Top-aligned looks sparse on tall monitors; naive centring makes the question jump on reveal. Best option: centre the question+answer block together, or reserve the answer area so the question stays put.
- Users who go full screen still want a **centred "window" on a plain backdrop**, not content spread out.
- For short items (single words), the card itself can be a fixed-size object (index card about 560–640px wide); text never reflows across the whole viewport.

### What fills the remaining space
- **Study-first apps** (Duolingo lesson, Mochi, WaniKani, Lingvist, Bunpro) deliberately empty the screen during review: no side widgets. Chrome is limited to a top bar (progress, exit) and a bottom action zone.
- **Note-integrated apps** (RemNote) are asked to show context (parents/siblings). Anki users ask for the deck name in small type. So context should be **one small mono label**, not panels.
- Side panels in review appear mainly via add-ons (Anki's progress-bar add-on docks a side panel) and draw docking/resizing complaints.

### Progress display
- Anki: three queue counts (new/learn/review), with no bar natively. An add-on shows "23/67", criticised for overshooting as learning cards re-enter.
- Mochi: progress bar plus retention; asked to be more prominent. Duolingo: an unlabelled top bar. Bunpro: remaining count plus a wrap-up icon in the header.
- RemNote users explicitly request a remaining-cards widget.
- **Implication:** show `done / total` as a number **and** a thin bar. Make the total honest: it can grow when "Не знаю" re-queues a card, so explain or show `+N` for re-queued cards.

### Keyboard conventions (consensus)
| Action | Convention | Who |
|---|---|---|
| Reveal | `Space` (also `Enter`) | Anki, Quizlet, Brainscape, Mochi(new), Traverse, FlashCard, Chrome ext. |
| Grade | `1 2 3 4` = Again/Hard/Good/Easy | Anki, Traverse, RemNote, Chrome ext. |
| Binary grade | `←` again / `→` know | Quizlet (track progress), Goodnotes, FlashCard |
| Good via Space | `Space`/`Enter` after reveal = Good | Anki (contested: accidental passes) |
| Undo | `Ctrl/⌘+Z` (Anki also `u`); Bunpro `Backspace` | Anki, Bunpro |
| Edit current | `E` | Anki, Readwise (`e`) |
| Bury/suspend | `-` / `@` (Anki); archive is a menu action elsewhere | Anki |
| Audio | `R` (Anki), `J` (WaniKani), `P` (Bunpro), `Ctrl+Space` (Duolingo, Clozemaster) | — |
| Item info / details | `F` (WaniKani), `↓`/`f` (Bunpro) | — |
| Exit / back to overview | `S` (Anki), `Esc` (common web) | — |
| Wrap-up | `0` (Bunpro); a button in WaniKani | — |
| Shortcut list | `?` (WaniKani, GitHub, Reader); `Ctrl+Alt+Shift+H` (RemNote); keyboard icon (Bunpro) | — |

- `?` opening a shortcut dialog is a web-wide convention: "Typing ? on GitHub brings up a dialog box that lists the keyboard shortcuts available for that page." https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts
- `Alt+letter` combos conflict with browser menus (Clozemaster). Single unmodified keys are safest when no text input is focused.
- Shortcuts break when an input has focus (Bunpro), so global keys must be ignored while typing.

### How shortcuts are taught
1. **Key printed on the button** (Mochi; Duolingo option tiles). Fastest to learn; praised.
2. **Hover tooltip** (Anki, Clozemaster). Slow to discover; tooltips drift out of sync when keys are remapped (Anki #2637), formatting is inconsistent (Clozemaster), and some users find them noisy.
3. **`?` overlay or persistent hotkey button** (WaniKani, Bunpro, GitHub). Good as a reference, but users still miss keys for months ("Press F for info, a hidden feature?").

Best practice is (1) for the 3–4 core keys plus (3) for everything else, with no reliance on hover.

### Hover / visual state of grade buttons
- Anki discussion: the **failing grade should be visually separated** from passing grades (gap or separator), with colour + icon/shape (not colour alone) for colour-blind users. "Hard" must read as a pass.
- Feedback after grading: a brief ✕/✓ mark (AnkiMobile; Anki's new study screen icons). Users dislike feedback placed far from where the eye is.
- Pre-selection: RemNote pre-selects a grade from the typed answer; Anki's Space-default-Good is criticised. Never let the reveal key double as a grade without a deliberate press.

### Next-interval display
- Anki shows intervals above the buttons by default; there's an argument to hide them (users "game" them). Rough consensus: keep them small and secondary (mono, muted), optionally togglable. They also teach new users what the buttons mean.

### Session end screens
- WaniKani **removed** its summary and users protested (motivation, review of mistakes). Bunpro keeps a summary with mistakes linked to details. Clozemaster users want bulk actions on the end-of-round list. Anki's "Congratulations…" message confuses users because it doesn't say *when* the next cards are due or what to do now. Mochi's end state left the last answer visible (bug-like).
- A good end screen states:
  - what was done (count, accuracy);
  - which items were hard, as links;
  - when the next ones are due;
  - one or two next actions (repeat mistakes, practise without affecting the schedule, add words).

### Focus / zen modes
- Anki: F11 plus a "hide top/bottom bar" option, with add-ons for more. AnkiWeb userscript: `X` zen toggle. Bunpro: display menu (fixed/full width and height). Duolingo: lesson mode hides all nav.
- Users want a **windowed** centred card on a quiet backdrop rather than true full-screen stretch. When chrome is hidden, keep a subtle Q/A state marker.

### What users complain about (desktop review)
- Content stretched across wide monitors; top-aligned text looks lost (Anki, Bunpro).
- Ugly or dated review screen (Anki); wasted margins in redesigns (Anki 25.09).
- Hidden or undiscoverable shortcuts (Clozemaster, WaniKani, Anki).
- `Space` accidentally grading Good; double-press skipping a card (Anki).
- Shortcut regressions and focus-trap issues (RemNote, Mochi, Bunpro Safari).
- Missing or removed end-of-session summary (WaniKani).
- No honest remaining count / progress (Anki, RemNote).
- Undo that doesn't bring the card back on screen (Mochi regression).
- Auto-advance too fast (Lingvist); auto-scroll after answering (Bunpro).
- Mobile-first UI with features missing on desktop (Memrise).

---

## 3. Implications for Карточки desktop

Context: 3 grades Не знаю / Сложно / Знаю (Again/Hard/Good), FSRS, tap-to-flip, two directions, Russian UI, paper index-card visual language (SPEC v3).

1. **Layout (≥1024px).**
   - Keep the review as a **single centred index card**: about **600–640px wide, aspect about 5:3** (a real 5×3" card), on the paper backdrop. Never stretch it with the viewport.
   - Above 1280px, more white paper, not more card. Cap the French word at Newsreader about 56–64px and the Russian at about 24–28px.
   - Place the card so its **top edge stays fixed** when it flips: centre the *answer-height* block or reserve the answer area. The French headword must not jump on reveal.
2. **Leave the margins mostly empty during review.**
   - Context goes in one mono label row above the card: `FR → RU · тема: Деньги · 07 / 30`.
   - Session progress as a 1px ink rule across the top of the content column.
   - No side widgets. A left rail for app navigation (Повторение / Библиотека / Темы / Настройки) is fine but should be visually quiet, and collapsible or hidden in focus mode (`F` or `Z`).
3. **Grade row.**
   - Three outlined buttons directly under the card, the same width as the card.
   - Put a visible **gap or hairline divider between «Не знаю» and the two passing grades**, so Сложно reads as a pass (the FSRS Hard-misuse lesson).
   - Red ink only on «Не знаю» (the single accent). Сложно and Знаю stay ink-on-paper.
   - Each button carries its **key in a mono `kbd` box printed on the button** (`1` Не знаю, `2` Сложно, `3` Знаю), Mochi-style, plus the FSRS interval in small mono (`<1 мин`, `6 мин`, `1 д`).
   - Hover: 1px→2px ink border or a faint paper-shade fill. Pressed or key-triggered: a brief inverted (ink-filled) flash about 120ms before the advance, so keyboard users see which grade registered.
4. **Key map** (use `KeyboardEvent.code`, not `.key`, so keys work on the **Russian ЙЦУКЕН layout**, where `E` types «у»).
   - `Space` / `Enter` → flip only, **never grade** (avoids Anki's accidental-Good problem).
   - `1` `2` `3` → Не знаю / Сложно / Знаю, active only after the flip. Optional `←` = Не знаю and `→` = Знаю, mirroring the phone swipe directions (Quizlet/Goodnotes convention).
   - `Ctrl/⌘+Z` and `U` (code KeyU) → undo the last grade, **bringing the previous card back on screen** (Mochi lesson), plus the existing snackbar «Отменить».
   - `E` → edit the current word (side sheet over the card, review paused). `R` → play audio if/when TTS exists. `D` → word details / note (like WaniKani's `F`). `Esc` → close sheet, or leave the session.
   - Optional: `S` skip/bury for today, `0` wrap-up (finish only the re-queued cards, then end — Bunpro).
   - `?` → shortcut overlay (a ruled "catalogue card" list, mono keys). `/` or `Ctrl+K` → quick add/search outside review.
   - Ignore all single-key shortcuts while any input or contenteditable is focused. Avoid `Alt+letter` combos (browser conflicts).
5. **Teaching shortcuts.**
   - Key printed on the three grade buttons and on «Показать ответ · Space».
   - One muted mono line under the grade row on first sessions («Space — перевернуть · 1 2 3 — оценка · ? — все клавиши») that disappears after N uses or by toggle.
   - A small `?` key-cap button in the corner. Don't rely on hover tooltips.
   - The phone hides all hints (as the spec already says).
6. **Progress.** `07 / 30` in mono plus a 1px ink line. If «Не знаю» re-queues a card, show `07 / 30 · +2 повтор` instead of silently growing the total. Optionally the queue split («23 к повторению · 4 новых») in the header, as on mobile.
7. **Intervals.** Show them small and muted under each grade (default on, matching mobile), with a setting «Показывать интервалы» for users who game them.
8. **Session end («Готово на сегодня»).** Keep and enrich the receipt idea (users hated WaniKani removing its summary):
   - a ruled table: Повторено / Новых / Верно %;
   - the «Трудные» words as links that open word details;
   - «Следующие 18 слов — завтра» (fixes Anki's confusing "finished for now");
   - two actions with keys: `Enter` «Повторить ошибки (3)», `P` «Ещё практика — не влияет на расписание».
   - Never leave the last card's answer on screen (Mochi bug).
9. **Focus mode.** One toggle (`F` or the frame icon) hides the left rail and header and leaves the card centred on paper, **windowed, not stretched**. Keep a tiny state cue: the index card's red header rule could show only on the answer side, or a mono `ВОПРОС` / `ОТВЕТ` corner label. Respect `prefers-reduced-motion` for the flip; prefer a quick cross-fade or a paper "turn" of ≤150ms over a 3D spin.
10. **Mouse parity.** Click on the card flips it, as on mobile. Grade buttons stay large (≥44px tall, full card width split 3 ways). Undo and settings stay as icon buttons in the header. Hover reveals nothing essential.
11. **Start fast.** On desktop, landing on `/` with cards due goes straight to the first card (Mochi praised, Anki criticised for deck → Study Now). The "23 к повторению" header doubles as the entry point from the Library.
12. **Avoid** side stat panels, streak flames, confetti, coloured gradient progress, and full-viewport stretch. These are the tropes and complaints seen above, and they also violate SPEC v3.
