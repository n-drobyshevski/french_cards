# Minimal, visual mobile UI references for «Карточки для Лизи» (review, home, vocabulary list, word detail, quick add, session complete, settings, empty state, onboarding-free home)

Web research for the mobile declutter pass (2026-10-24). Research only; no app code changed. Fit is judged against `mockups/SPEC.md` v3 (paper index card, ink, hairlines, one red accent).

## Review: one word on the stage, chrome retreats  ·  fits

The review screen shows the word and the single next action, and nothing else. Direction (FR→RU), theme filter and counters leave the main view: they go into one quiet header line, for example «Все темы · FR→RU ▾» on a single hairline row that opens a sheet, with progress as a hairline. Today's review screen stacks a title, undo, settings, two control boxes, a mono counter line, a progress bar, a red rule, an 'FR' label and a hint before the word. Reviews of Lingvist praise exactly the 'clean, minimal' single-card drill. A Duolingo critique credits its lesson screens with offering 'only one action' per page.

Examples: Lingvist: one cloze card filling the screen, minimal chrome (reviews call it the 'best-designed language app'); Flashcards Maker: Swipe Study, whose listing says 'we stripped away the clutter so you can focus on one thing: memory'; Duolingo lesson screens: one action per page (Pratt IxD critique); Current app (docs/screenshots/review-front.png): about 9 UI elements above the word; the target is 2 to 3

Adaptation: Keep the index card as the only surface. Merge «4 к повторению · 7 новых» and «04 / 11», which say the same thing twice, into one hairline progress line with a small mono '4/11'. Drop the 'FR' header label and the 'тапни, чтобы перевернуть' hint after the first session. The red rule stays as the one ink accent.

Sources: https://www.fluentu.com/blog/lingvist-review/ · https://www.mezzoguild.com/lingvist-review/ · https://ixd.prattsi.org/2021/09/design-critique-duolingo-web-app/ · https://apps.apple.com/us/app/-/id6762421994

## Tap to reveal, swipe to grade, buttons as fallback  ·  fits with adaptation

Tapping flips the card. A swipe right means 'Знаю' and a swipe left means 'Не знаю'. The card slides off and the next card is already underneath, so the screen feels physical and dynamic without extra widgets. Grade buttons stay as a fallback, but the interval labels ('<1 мин / 6 мин / 10 мин') and the redundant '← НЕ ЗНАЮ · ЗНАЮ →' line go away. Several indie vocabulary apps converge on this right=known / left=again model. An MIT HCI note warns that swiping costs slightly more than tapping, so taps must keep working.

Examples: Flashcards Maker: Swipe Study: swipe right to lock it in, left to review again; Vocards: right = learned, left = later, 'minimalist design to eliminate distractions'; Vokab: TikTok-style vertical swipe; right = known, left = more details; Vocab Vault: tap flips, 120px swipe threshold marks known

Adaptation: Use paper physics from MOTION-SPEC: the card slides and tilts slightly with a fixed ease and no bounce. While dragging, an ink stamp ('знаю' in ink, 'ещё раз' in red) fades in on the card corner. Show the grade colour only during the drag, so the outlined green/red buttons leave the resting state. Two grade buttons by default; the existing 2/3 setting keeps «Сложно» available.

Sources: https://apps.apple.com/us/app/-/id6762421994 · https://marlvel.ai/api/llm/apps/education/english-flashcards-vocards · https://dolphinvoice.ai/en/ai-apps/vokab-1079307 · https://www.mintlify.com/jackdog668/vibe-vocab/features/flashcard-mode · https://wikis.mit.edu/confluence/x/vEToB

## Onboarding-free home = the review tab opens straight onto today's work  ·  fits

The first tab has no dashboard. If cards are due, it opens directly on the first card. If nothing is due, it shows a single typographic 'today is done' state with the next due time and one optional action. Duolingo replaced its skill tree with a linear path to 'simplify the experience for new users who were confused about how to best make progress'. Busuu's redesign aimed at letting people 'continue where you left off'. Gentler Streak simplified its app after users 'weren't finding its features', and a ScreensDesign teardown notes that its dashboard 'presents a lot of information at once', which can overwhelm.

Examples: Duolingo path (2022): one 'next' node, practice folded into the path; Busuu redesign: continue where you left off; Gentler Streak: simplified after users missed features; the Activity Path is the one hero visual; Drafts: opens to the work itself (a blank draft), no picker

Adaptation: Do not add a new 'home' tab. The Повторение tab is the home. A pre-session state (theme and direction) becomes a bottom sheet that opens from the header line, never a screen of its own.

Sources: https://blog.duolingo.com/new-duolingo-home-screen-design · https://investors.duolingo.com/static-files/d667f9d1-8f7f-418c-b116-e699a30a9826 · https://blog.busuu.com/?p=4601 · https://bgr.com/tech/gentler-streak-gets-a-major-redesign-focused-on-your-wellbeing/ · https://screensdesign.com/showcase/workout-tracker-gentler-streak

## Vocabulary list: one search field, filters folded, themes as a quiet list  ·  fits

The library shows search plus one list. Filter chips (К повторению / Трудные / Сленг) fold into a single 'Фильтр' control or show only once search is focused. The «Разложить по темам» banner appears only when the inbox actually has unsorted words; it currently shows even when 'Все слова разложены'. Themes become hairline rows (name, count, a thin progress rule) instead of a 2-column grid of tall cards, so far more fits above the fold with less visual weight. Write-ups of minimal vocabulary apps stress lists 'front and centre', grouped and generously spaced, with a single accent colour. Mochi offers grid, list, column and notebook deck views.

Examples: Aivo (Managed Code case study): lists front and centre, status shown inline, generous spacing; Mochi: list or grid deck views, nested decks; Language-app concept on RapidNative: pale ground, raised rows, one accent; Current app (docs/screenshots/library.png): title, count, search, 4 chips, a banner, a section header and a grid of 8 tiles

Adaptation: Keep each theme's colour as the existing thin top or left ink strip on the row. Rows are hairline-separated, with no tile borders and no dashed 'Новая тема' tile; '+ тема' becomes a text action in the section header. Chips are not allowed (no pills), so the folded filter uses a segmented row with radius 4.

Sources: https://managed-code.com/portfolio/aivo · https://www.rapidnative.com/project/public/c_pvJXDSfh8_F8XBlNkto · https://mochi.cards/docs/search/ · https://screensdesign.com/articles/mobile-app-empty-state-examples/

## Word detail as an editorial dictionary entry with folded extras  ·  fits

The word page reads like a print dictionary entry: a large serif headword, part of speech in italic, one Russian translation, and one example (FR italic / RU). Everything else (slang level, CEFR level, theme, origin, conjugation, custom fields, both directions) folds under a single «Подробнее» row or a second 'page' you swipe to. Plume (word-a-day) is explicitly 'an editorial interface inspired by print dictionaries' with 'serif typography on a warm, paper-like palette'. Glyph presents each word 'as an elegant card' with meaning, example and etymology.

Examples: Plume: print-dictionary editorial layout, serif on a paper palette; Glyph - Word of the Day: word as a card, with meaning, pronunciation, example and etymology; Word of the Day: Daily new word: meaning, usage and examples in a 'clean, minimal' layout; The Daily Word: 'extremely minimal design'

Adaptation: This is the closest match to the brand (Newsreader headword, IBM Plex for metadata). Origin can be one italic 'etym.' line under the example. Conjugation should be a folded table, never open by default.

Sources: https://www.producthunt.com/p/plume-word-of-the-day/plume-8 · https://appgoblin.info/apps/6785348282 · https://apps.apple.com/us/app/-/id6755592391 · https://iphonelife.com/content/expand-your-vocabulary-word-day-app

## Capture-first quick add with inline parsing  ·  fits with adaptation

Add opens on one focused French field with the keyboard up and nothing else on screen. Translation, part of speech, slang level and theme are auto-filled and appear as quiet printed lines under the field; each line is tap-to-edit, and none is a form control until tapped. Drafts treats 'the blank page as the main interface': no navigation or picker, routing happens after capture. Todoist's Quick Add parses one line and highlights the recognised parts in place, instead of showing separate fields.

Examples: Drafts: every launch opens an empty draft, one accent only on tappable items; Todoist Quick Add: one line, recognised tokens highlighted inline; Things 3: Magic Plus button creates items in context; Current app (docs/screenshots/add-filled.png): about 8 field groups plus 2 import buttons and 2 submit buttons on one screen

Adaptation: Show recognised or auto-filled values as ink text with a thin red underline (an 'annotation' look), not as chips. Move Скриншот / Список import into one overflow icon. Use one primary «Добавить»; «и ещё» can become the default behaviour (the field clears and stays focused) with a quiet 'готово' to close.

Sources: https://blakecrosley.com/guides/design/drafts · https://toolradar.com/logo/drafts · https://www.usecarly.com/blog/how-to-use-natural-language-in-todoist/ · https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/

## Session complete: one typographic line, one next step  ·  fits with adaptation

The end-of-session screen states the result in one or two lines ('Всё на сегодня', and when the next cards are due) with at most one action. There is no stats grid, no count-up and no confetti. Tiimo's daily 'Review done' screen says only 'Everything is handled for today' / 'Time to rest and recharge'. Remember Vocabulary's single micro-interaction (a star that 'flies to the progress bar') shows that one small, meaningful motion is enough feedback.

Examples: Tiimo 'Review done': two lines of copy, no stats; ClickUp 'Inbox Zero': a calm completion state, other tabs still reachable; Remember Vocabulary: a star flies to the progress bar when a word is learned

Adaptation: Make it a paper motif: the last card settles onto a small stack and a red ink stamp «Готово» is pressed, with the next due time in mono beneath. Put the optional «Упражнения» link as plain text, not a second big button. Replace the star with an ink tick that draws once.

Sources: https://screensdesign.com/articles/mobile-app-empty-state-examples/ · https://screensdesign.com/apps/tiimo-ai-plan-focus-to-do/?vs=289551 · https://screensdesign.com/showcase/remember-vocabulary-flashcards

## Typographic empty states with exactly one action  ·  fits

Empty states are text-only: one line saying why the area is empty and one action. They are distinct for first use, filtered-out and done-for-today. SAP Fiori treats the illustration as optional; Canva recommends 1 to 2 sentences and one primary button. ScreensDesign separates first-use, no-results and completed states and shows minimal ones such as Tally ('Ready' / 'Create a tally to begin' + one plus) and HEY's full-page error.

Examples: Tally: 'Ready' + 'Create a tally to begin' + one plus control; Tiimo: 'Everything is handled for today'; HEY Email: full-page text error with Back / Retry; Canva: no results, with copy telling you to clear filters

Adaptation: Draw the empty state as a blank index card (hairline ruled lines, no illustration) carrying one serif line and one text action. This matches SPEC's 'no emoji / no AI sparkle'.

Sources: https://screensdesign.com/articles/mobile-app-empty-state-examples/ · https://www.sap.com/design-system/fiori-design-web/v1-96/foundations/best-practices/global-patterns/designing-for-empty-states · https://www.canva.dev/docs/apps/design-guidelines/empty-states · https://spring-20.lightningdesignsystem.com/guidelines/empty-state

## Settings: short, grouped, rare things one level down  ·  fits

Settings stay a short list of what people actually change: new cards per day, direction, grading style and theme. Data operations (export/import JSON, legacy HTML import) and the AI-privacy disclosure move into a 'Данные' and an 'О подсказках' sub-row. iA Writer describes itself as 'minimalist with streamlined settings… keeping to a minimum' and puts appearance options in a submenu. The settings gear should also stop appearing in every tab header (it is currently on both the Review and Library headers).

Examples: iA Writer iPhone: a small category list, appearance in a submenu; Current app (docs/screenshots/settings.png): 4 sections, 10 rows, a stepper, two segmented controls and 3 toggles on one page

Adaptation: Keep hairline-ruled sections. Reach settings from the Library header only, or from a long-press on the 'Карточки' wordmark. Toggles are black today; keep them, but limit the page to about 5 rows above the fold.

Sources: https://ia.net/writer/support/basics/settings · https://ia.net/writer/support/basics/settings/settings-iphone

## Visual, dynamic cues from physical objects (stack, path, widget)  ·  fits with adaptation

Instead of numbers, show quantity physically. Cards still to review appear as the stacked paper edges beneath the current card (one edge per card, capped around 5). The week appears as a single hairline 'path', in the spirit of Gentler Streak's Activity Path, which ScreensDesign calls 'a brilliant piece of information design'. A home-screen widget with one word (Plume, Rewordy, Word of the Day apps) carries the 'visual' load outside the app, so screens can stay sparse. These cues replace counters and make motion meaningful: the stack shrinks as you swipe.

Examples: Gentler Streak Activity Path: one line shows in / above / below range; Gentler Streak widgets: single-metric widget; Plume and Rewordy: one word on the home-screen widget; Remember Vocabulary: progress feedback through one flying star

Adaptation: Stack edges should be 1px hairlines offset 3 to 4px with no shadows, per SPEC. The 'path' is a mono row of 7 small ticks (ink = done, red = today), not a ring or chart. A PWA has no native widgets, so the equivalent is the review tab's 'today' state showing one 'слово дня' card.

Sources: https://screensdesign.com/showcase/workout-tracker-gentler-streak · https://9to5mac.com/2025/02/14/gentler-streak-new-widgets/ · https://www.producthunt.com/p/plume-word-of-the-day/plume-8 · https://apps.apple.com/cd/app/rewordy/id1456550791 · https://screensdesign.com/showcase/remember-vocabulary-flashcards

## Notes

I could not use Mobbin: every Mobbin MCP call failed with "Mobbin MCP requires a paid plan." I switched to web search and fetches (WebSearch/WebFetch), mainly ScreensDesign teardowns, App Store and Product Hunt listings, vendor blogs and review sites. That means I have no Mobbin URLs, and I saw almost none of the external screens as images; the example descriptions come from the source text. The main gaps are a Speak home screen, an Apple Reminders quick add and the current Mochi/Anki mobile review UI, where search returned nothing usable.

What I checked locally (read-only): docs/screenshots/review-front.png, review-back.png, library.png, add-filled.png and settings.png.

Where the current screens are densest:
1) Review front: about 9 elements above the word, and the progress counts appear twice («4 к повторению · 7 новых» and «04 / 11»).
2) Review back: the outlined coloured buttons with interval labels, plus a redundant '← НЕ ЗНАЮ / ЗНАЮ →' hint row.
3) Library: search, 4 filter chips, an always-on «Разложить по темам» banner even when it says 'Все слова разложены', and a grid of 8 tall tiles.
4) Add: about 8 field groups, 2 import buttons and 2 submit buttons in one sheet.
5) Settings: 10 rows, with the gear repeated in tab headers.

The screenshots show a 3-tab bar (no Упражнения tab yet), so they predate the 4-tab layout.

Suggested mock-up priorities, by impact: (a) the review card with stack edges, a one-line header and swipe stamps; (b) a capture-first Add showing auto-filled printed lines; (c) the Library as a hairline list with folded filters; (d) a typographic 'Готово' and done-for-today state.
