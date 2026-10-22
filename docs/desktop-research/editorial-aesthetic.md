# Desktop references: paper index card / card catalog / dictionary, without looking AI-made

Research notes for the «Карточки» desktop UI (Oct 2026). The goal is to find layout and typography moves
that keep the v3 language (ink on paper, hairlines, Newsreader + IBM Plex Sans + IBM Plex Mono, one red
accent) and that make sense at 1280–1920px wide.

Caveat on sources: the primary sources are Practical Typography, Wikimedia, Tufte CSS, Gwern, Are.na's
blog, Matthew Ström, Anthropic, Readwise docs, Anki manual, Production Type and the Library of Congress.
Several "design token" summaries (webdesignhot design.md files, design-kit KIT.md files) are third-party
reconstructions. Treat their exact numbers as illustrative.

---

## 1. Real dictionaries on desktop: what they actually do

### Le Robert (dictionnaire.lerobert.com), page HTML checked
- The entry page is a **single long column of stacked sections**: définition, conjugaison, synonymes,
  exemples. Each section repeats a small **section tab strip with abbreviated labels**: `déf.` `conj.`
  `syn.` `ex.`. The abbreviation is the dictionary convention used as navigation. It is directly
  transferable as a jump strip, e.g. `пер.` `прим.` `син.` `ист.`.
- Register labels sit inline, in parentheses, after each synonym: *baguenauder (familier)*,
  *musarder (littéraire)*, *bader (régional)*. Register is **text, not a badge**.
- The headword is followed by the grammatical category in words (*verbe intransitif*), then a short
  sense, then a `➙` cross-reference arrow to synonyms.
- The examples section is a list of sentences, each followed by a **source and date line** (e.g.
  "Ouest-France, 16/02/2024"). It reads like a citation file and contains no decoration.
- Negative reference: the site also carries promo banners, an emoji "🌟" and a "Dis-moi Robert,
  Assistant IA" menu item. That is the commercial chrome we should *not* copy.
- https://dictionnaire.lerobert.com/definition/flaner

### Larousse (larousse.fr), page HTML checked
- Bootstrap layout with `col-md-8` main content and a `col-md-4` right rail: **main entry plus a
  marginal rail**.
- The register label comes *before* the definition as a word with a period: "**Familier.** Idée qui
  obsède : *Faire une fixette sur ses cheveux.*" The example is in italic, after a colon.
- A **"Mots proches"** list shows the headwords alphabetically adjacent to the current one, separated by
  hyphens. This is a strong card-catalog move: you see your neighbours in the drawer.
- Larousse has a "FLASHCARDS" section in its main nav, so a dictionary site with flashcards already exists.
- https://www.larousse.fr/dictionnaires/francais/

### Wiktionnaire (fr.wiktionary.org), page HTML checked
- Rigid, predictable section order: Étymologie → Verbe (the part of speech as heading) → Synonymes /
  Antonymes / Dérivés / Vocabulaire apparenté / Traductions → Prononciation → Anagrammes → Références.
- The "ligne de forme" (headword line) carries the grammar in italic: *intransitif, transitif ou
  pronominal, 1er groupe (voir la conjugaison)*.
- Vector 2022 skin: sticky table of contents in the left sidebar and a limited content width (see §4).
- https://fr.wiktionary.org/wiki/flâner

### Merriam-Webster (merriam-webster.com), fetched
- **Left sidebar of jump links** to sections of the entry: Definition, Example Sentences, Word History,
  Entries Near, Cite this Entry. This is a table of contents for one word.
- Headword block: large bold headword, then the part-of-speech label, syllables split by middle dots
  (`ser·en·dip·i·ty`), pronunciation in brackets, and an audio button.
- Senses are numbered. Each opens with a **bold colon**, and examples are italic and credited with an em dash.
- "Word History" has labelled subsections: Etymology, First Known Use, Time Traveler.
- "Browse Nearby Words" again: the alphabetical neighbours with the current one unlinked.
- **Rules: major sections are separated by a rule under the heading. Subsections use only bold
  labels and spacing.** A rule hierarchy has two levels, not one.
- https://www.merriam-webster.com/dictionary/serendipity

### CNRTL: the TLFi portal returned a JS shell to fetch, so its layout was not inspected (its known
layout uses tabs Morphologie / Lexicographie / Étymologie / Synonymie / Antonymie / Proxémie /
Concordance across the top). https://www.cnrtl.fr/definition/

### Lexicographic typography conventions (the "codes" a dictionary reader already knows)
- Robert Ilson (EURALEX 1983): **roman** for definitions, **italic** for metalanguage (part of speech,
  labels), **small caps** for cross-references, **bold** for headwords and sub-entries. Mixing functions
  (e.g. bold for both headwords and cross-refs) confuses readers.
  https://euralex.org/elx_proceedings/Euralex1983/014_Robert%20Ilson%20%20(London)%20-%20The%20communicative%20significance%20of%20some%20lexicographic%20conventions.pdf
- Paul Luna (*Not Just a Pretty Face*, 2009): the boldest and largest face is reserved for headwords
  only. A lighter large face is used for sub-headwords and the sense-numbering system.
  https://wordnik.com/words/headwords
- Common practice: the part-of-speech abbreviation is in italic right after the headword. Sense numbers are
  `1.` / `1)`, and homonyms get a small raised number (`casser¹`, `casser²`).
  https://www.webonary.org/nafaanra/overview/entries-explained/
- Cambridge Handbook of the Dictionary: "the more information of different kinds that a dictionary entry
  attempts to convey the more typography helps organize it."
  https://resolve.cambridge.org/core/books/abs/cambridge-handbook-of-the-dictionary/dictionary-typography/4FE9512BD7AF6A9D364DE3B44F291DD3

**Transferable:** typography (roman / italic / small caps / bold), not boxes and colour, should carry the
entry structure. Use one bold/large level for the French headword only. Write register as words or
abbreviations in italic. Show alphabetical neighbours. Use jump links with abbreviated labels. Use a
two-level rule hierarchy (strong rule under major headings, spacing for minor ones).

---

## 2. The physical library catalog card (anatomy to borrow)
- Standard card: 3 × 5 in (≈ 5:3 landscape, ratio 1.667). Each book had several cards (author, title,
  subject) filed alphabetically. https://www.loc.gov/research-centers/main/about-this-research-center/main-card-catalog/
- **Call number in the upper left corner** of the card (letters + numbers). LoC: "a call number …
  appears in the upper left-hand corner of the card and/or is printed in the lower portion."
- The body is the bibliographic description (author, title, place, publisher, date), then the physical
  description.
- **Tracings at the very bottom** are numbered added entries ("1. Faulkner, William, 1897-1962.") that
  say where the sibling cards are filed. https://usulibrary.atlassian.net/wiki/x/x4B6Rg
- Historical digital precedent: John Blyberg's AADL "virtual card catalog" let users flip through
  scanned cards and **add marginal notes**, shown with or without the annotations.
  https://www.strehle.de/tim/?p=799

**Transferable to Карточки:**
- The upper-left "call number" slot can hold the mono meta (`FR · ДЕН 018` or the theme code + index). It is
  data, so mono is justified.
- The bottom "tracings" line can list the other places the word is filed: `1. Деньги  2. arg.  3. Синонимы: le fric, l'oseille`.
- Real 5:3 card proportion on desktop. On the phone the card is portrait, but on desktop it can become a
  true landscape index card (e.g. 640 × 384 or 720 × 432).
- The guide words / drawer labels idea: catalog drawers are labelled with ranges (`GAL – KEU`).

---

## 3. Editorial / Swiss / "quiet tool" apps

### Are.na
- Founders' stated aim: the interface should "fade into the background as much as possible." They used
  Arial because it "doesn't have much of a 'look' at all," then commissioned *Areal* (Dinamo), "the same
  thing again" redrawn with care, with mono and semi-mono variants tested against real labels and buttons.
  Lesson: **quality comes from care in the details, not from adding a "look".**
  https://www.are.na/blog/introducing-areal-are-nas-new-typeface
- Third-party token reading (illustrative): near-white canvas, black text, **1px #ddd hairline
  around every block, no shadows**, one orange accent for links/CTAs/focus. Mono for labels,
  timestamps, counts and slugs. Weights 400 and 500 only. Body 14px, H1 32px. 640px prose column inside
  a 1440px max page. 6-column block grid at ≥1280px with 8–12px gaps. Hover is a background tint only, with no lift.
  "Dense packing of hairline-bordered blocks replaces whitespace as the organizing device. Mono labels
  mark data like a card catalogue." https://www.webdesignhot.com/design.md/are-na/

### Tufte CSS / sidenotes / marginalia
- Tufte CSS puts sidenotes (numbered), margin notes (unnumbered) and small figures **in the right
  margin on wide viewports**. On narrow viewports they are hidden behind a toggle (⊕). The text column is
  narrow and the margin is roughly a third of the width. The background is off-white `#fffff8` with off-black
  `#111` text. https://push.cx/assets/tufte-css/ (canonical: https://edwardtufte.github.io/tufte-css/)
- Rationale: notes stay *next to* what they annotate, so there is no eye-jump to a footer.
- Gwern.net: sidenotes on wide windows. **Margin notes are short phrases in the left margin**
  ("space permitting"). Grayscale palette "deliberately". IBM Plex Mono for code. "Hierarchies & progressions
  should come in cycles of 3 (eg. bold > italics > smallcaps)." **Semantic zoom**: the page is read in layers
  (title/metadata → abstract → headers → margin notes → body → collapsed sections/popups).
  https://gwern.net/design · https://gwern.net/sidenote
- Gwern's "design graveyard" also lists Tufte-CSS sidenotes and automatic dark mode as abandoned
  experiments, because sidenotes are fiddly when notes are long. Keep marginal notes **short** (one to three
  lines). https://gwern.net/design-graveyard

### iA Writer
- It treats type size as a function of the window: "changing the font size based on window width. This
  maintains the text's typographic proportions, zooming in and out without reflowing the text." Later it
  adjusted line height and spacing to column width and type size. Lesson: on desktop **scale the
  type and the measure together**. Do not just widen the column.
  https://ia.net/topics/bringing-responsiveness-the-app-world

### Readwise Reader (keyboard triage model)
- Inbox → Later → Archive triage, all keyboard-driven: `E` archive, `L` later, `Shift+E` inbox, `D`
  delete, `Cmd/Ctrl+K` command palette, `?` shortcut sheet. **Side panels toggle with `[` and `]`.**
  Shortcuts are shown in hover tooltips. https://docs.readwise.io/reader/docs/faqs/navigation ·
  https://docs.readwise.io/reader/guides/workflows/library-configuration
- Transferable: «Входящие» works like Reader's Inbox. Sorting into themes is triage, and it needs
  one-key actions on desktop.

### Linear (list + detail, keyboard-first; third-party write-ups)
- `J/K` to move, `Enter` to open, single-letter actions, Cmd+K palette. Detail opens as a right
  sheet, not a modal. "If it's not primary content or primary action, it should not be visible at rest":
  row actions appear on hover or selection, and the bulk bar appears only when items are selected. The global key
  handler must not steal keys from text inputs.
  https://www.buildmvpfast.com/blog/linear-aesthetic-tokens-density-keyboard-first-ux-2026
- Warning: the dark Linear look itself is now one of the most-copied SaaS defaults
  (https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026). Copy the *interaction model*,
  not the visuals.

### Anki (the domain baseline)
- Default review keys: `Space`/`Enter` show answer and then mean Good. `1` Again, `2` Hard, `3` Good, `4` Easy.
  The manual notes you can use only Again and Good. https://docs.ankiweb.net/studying.html
- Users call Anki desktop "cluttered and confusing", which is the opposite of what we want, though the key
  map is a de facto standard that power users expect. https://forums.ankiweb.net/t/to-me-this-app-is-a-fail/17042

### Others, briefly
- Kinopio: no toolbar, click anywhere to add. A forum critique argues that controls should not be styled like
  content cards ("the controls of an app shouldn't really get camouflaged with the contents"). Keep
  **chrome visibly different from cards**: chrome is text and rules, and only words are cards.
  https://forum.kinopio.club/t/non-card-ui-collapsable-sidebar-and-view-mode/749
- Cosmos: a black-and-white minimal grid where the interface recedes behind content. No likes or social
  noise. https://techradar.com/computing/websites-apps/this-app-is-like-pinterest-if-it-were-cooler-and-ad-free
- HEY: opinionated naming and a colourful, bold style. A reviewer found it "borderline geriatric" in sizing.
  It is a counter-example: opinionated is good, but oversized desktop type reads as a scaled-up phone.
  https://every.to/product-case-study-hey-627136
- Bear: commissioned a custom face (Bear Sans, from Clarika) for both the editor and the UI, with one coral-red accent
  on white. Here too, one accent plus custom type care.
  https://blog.bear.app/2023/08/learn-about-our-new-custom-font-bear-sans/

---

## 4. Measure, grid, scale on wide screens

### Measure (line length)
- Butterick: "Aim for an average line length of 45–90 characters, including spaces". The alphabet test is
  2–3 alphabets per line. "Generally you'll want to establish the basic length using page margins."
  https://practicaltypography.com/line-length.html
- Wikipedia (Vector 2022), the best documented real decision:
  - Content max-width **960px**. **Workspace container 1440px** (header + sidebar + content) and
    page container 1650px, so the chrome doesn't drift away from the content.
  - Without a limit, lines were about 170 cpl at 1280px and about 262 cpl at 1920px.
  - They rejected the narrowest option (~700px) because skimming long pages needs fewer scrolls.
  - Some editors felt the side whitespace was "wasted space", so there is a full-width toggle above 1400px.
  - https://www.mediawiki.org/wiki/Reading/Web/Desktop_Improvements/Features/Limiting_content_width
- Lesson: **cap prose and the review card. Let lists and tables use more width. Keep header and nav in a
  1440 workspace so nothing floats away.**

### Grid
- Classic 12-column (divides into 1/2/3/4/6). Hairline rules can *articulate* the grid. Flush-left /
  ragged-right. Hierarchy from size, weight and position rather than colour. One red accent, otherwise
  black on paper. Avoid rounded shapes, gradients, shadows and centred-everything.
  https://cdn.jsdelivr.net/npm/@wrongstack/core@0.295.1/design-kits/swiss-grid/KIT.md
- FT Origami o-grid (editorial reference values): 12 columns, max width 1220px, gutters 10px (small) /
  20px (≥740px). Breakpoints 490 / 740 / 980 / 1220.
  https://github.com/Financial-Times/o-grid
- Müller-Brockmann: modular grids from a repeating module. "The grid system is an aid, not a guarantee."
  https://draw-down.com/products/grid-systems-in-graphic-design

### Fluid type scale
- Utopia (Clearleft): define the base size and ratio at a min viewport and a max viewport, and interpolate with
  `clamp()`. Examples use a 320 → 1440/1500 range and a Major Third (1.25) ratio.
  https://utopia.fyi/blog/clamp/ ·
  https://smashingmagazine.com/2021/04/designing-developing-fluid-type-space-scales/
- Newsreader is variable with an **optical-size axis opsz 6–72** (default 16) and weights 200–800.
  Production Type's sizing: display ≥24px, text 16–24px, caption <16px. The large desktop headword
  should use `font-optical-sizing:auto` (or opsz 60–72), so it gets the finer, higher-contrast display
  cut. Small italic labels get the sturdier caption cut. This is a free, very "print" detail.
  https://raw.githubusercontent.com/google/fonts/2796410152d4f9524b68ed46e69c1b60f8e0f7c3/ofl/newsreader/METADATA.pb ·
  https://productiontype.com/family/newsreader
- IBM Plex Mono was designed partly as a tribute to the Selectric typewriter faces, so it is
  legitimately "typed index card" type and fits the catalog-card metaphor (not "terminal" type).
  https://eyeondesign.aiga.org/ibms-custom-corporate-typeface-is-now-available-for-anyone-to-use/

### Tables / ledgers
- Butterick: "turning off all the cell borders to start, and then turning them back on as needed". Cell
  borders "make the grid cluttered". "Increasing the cell margins is the best way to improve the legibility
  of a dense table." So use row rules only, no vertical rules, and generous vertical padding.
  https://practicaltypography.com/tables.html
- Use `font-variant-numeric: tabular-nums` for counts, intervals and dates so digits line up in columns and
  don't jitter when counters change. Plex Mono is tabular by nature, and Plex Sans supports `tnum`.
  https://developer.mozilla.org/docs/Web/CSS/font-variant-numeric
- Small caps (`font-variant-caps: all-small-caps`) are an alternative to UPPERCASE + tracking for labels,
  but only with real `smcp/c2sc` glyphs, because synthesized ones look thin. Verify that the font has them before using
  this. https://www.cssportal.com/css-properties/font-variant-caps.php

### Density without emptiness (1440px)
- Matthew Ström, "UI Density": "UI density is the value a user gets from the interface divided by the
  time and space the interface occupies." Visual density is unreliable because grouping changes how dense
  something *feels*. Use proximity for grouping and whitespace to separate. Use Tufte's data-ink ratio: "Every bit of
  ink on a graphic requires reason". Responses under 100ms feel instant, and animating them can make the app
  feel slower. https://mattstromawn.com/writing/ui-density/
- Common practical advice: let the header and rails stretch, cap only text regions, and use fluid multi-column
  grids rather than one centred phone column.
  https://dev.to/trae_z/adapting-your-website-for-modern-wide-screen-displays-2hik
- What fills a 1440 screen "editorially" without cards: (a) **full-bleed hairlines** that run edge to edge
  while text keeps its measure, (b) a **margin column** with short notes, (c) **running heads / guide
  words** at the top like a dictionary page, (d) **ledger tables** that use width for columns of real data,
  (e) an **asymmetric** split (e.g. 3 / 6 / 3 or 2 / 7 / 3 of 12 columns), never a centred island.

---

## 5. What reads as "AI slop" in 2025–2026, and how to avoid it

Anthropic names the cause **"distributional convergence"**: "Safe design choices–those that work
universally and offend no one–dominate web training data". Without direction, output lands on Inter, purple
gradients on white, and cookie-cutter layout.
https://claude.com/resources/articles/improving-frontend-design-through-skills

Consolidated tells (pixelslop catalog of 26 visual patterns with severity; Impeccable anti-patterns;
noqta; prg.sh):
1. Purple→blue gradients, gradient text on headings or metrics, glowing accents on dark, cyan-on-dark,
   neon. (Tailwind UI's default indigo is blamed. Its creator apologised in Aug 2025.)
   https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website
2. **Hero-metric layout**: big number + small label + supporting stats in a row. This is the default
   "dashboard" look. (Severity 3 in pixelslop.)
3. **Identical card grids**: three or more same-size cards, each with icon + heading + text. Also icon-above-every-heading.
4. Cards wrapping everything, and nested cards. Rounded 8–20px boxes with a generic shadow
   (`0 4px 6px rgba(0,0,0,.1)`). The same exaggerated radius on everything.
5. Thick one-side accent border on a rounded card (`border-left: 4px solid`).
6. Glassmorphism, decorative sparklines, uniform image hover-zoom, bounce/elastic easing.
7. Everything centred. Same spacing everywhere (≤2 distinct values). Every button primary.
8. Generic fonts (Inter/Roboto/Arial/system) for both heading and body.
9. **"Monospace for tech vibes"**, i.e. mono on non-code, non-data text. Over-tracked uppercase eyebrow labels.
10. Pulsing "Live"/"New" badges ("decoration cosplaying as information"). Redundant copy (a heading
    repeated in its intro). Placeholder names (John Doe / Acme). Generic CTAs.
11. Pure `#000`/`#fff` page backgrounds (minor). Modal overuse.
Sources: https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md ·
https://mintlify.wiki/pbakaus/impeccable/concepts/anti-patterns ·
https://noqta.tn/en/blog/ai-design-slop-overused-ui-patterns-fix-2026

The stated test: "did a person make a deliberate choice, or did the design fall back to a default?" Single
signals are fine. **Combinations** are what read as slop.

Fixes the sources agree on: explicit tokens instead of adjectives, a distinctive display face paired with
a quiet body face, a restrained radius (≈6px), one meaningful accent, left-aligned asymmetric layouts,
varied spacing rhythm, real data and real copy in the founder's voice, inline expansion or side panels over
modals, and one motion moment instead of many.

**Risk check for our v3 spec:**
- Mono uppercase `.06em` labels are on the slop list *when used as decoration*. Keep mono only for
  **data** (counts, intervals, dates, `FR → RU`, `07 / 30`, the call-number slot, keyboard hints). Use
  Plex Sans 500 13px (sentence case) or Newsreader italic for section headings. Do not put mono eyebrows
  above every block.
- Never build a desktop "home dashboard" from a row of big numbers (23 / 12 / 158). Say it as a sentence or a
  ruled ledger.
- Theme tiles: the 3px coloured top band is fine (it is the drawer label, not a left accent bar). But a
  uniform grid of identical tiles is tell #3. Vary it: use a ruled *list* of drawers with counts aligned in columns,
  or tiles whose width or ordering carries meaning (due count, recency).
- Body background `#f1f1ee` (not pure white) is already right. White is only on the index card itself.

---

## 6. Implications for Карточки desktop: concrete recommendations

### 6.1 Frame and breakpoints
- `< 768` keep the current phone layout. `768–1099` two panes. `≥ 1100` the full desktop frame.
- **Workspace container max 1440px** (Wikipedia's figure), centred. Beyond 1440 the extra space becomes paper
  margin, but **hairlines run full-bleed** (top rule under the header, rules in tables), so wide
  screens still feel structured.
- 12-column grid, 24px gutters, 32px outer margins at 1440 (16px gutter stays on mobile). Content snaps
  to the columns. The rails are not floating panels.
- Replace the bottom tab bar on desktop with a **left rail (≈ 232px, 2–3 columns)** styled as a card-catalog
  drawer index: Повторение · Добавить · Библиотека, then a ruled list of темы with mono counts right-aligned
  in tabular figures (`42 · 6`). «Входящие» comes first with its count in red. The active item gets ink weight 600 and a
  2px red bar on the left edge *of the rail item* (this mirrors the phone's top bar, so it is a rail marker, not a card accent).
- An optional **right margin column (≈ 280–320px, 3 columns)** holds marginalia. It collapses with `]` like
  Reader. Below 1280 it folds into toggles (⊕) like Tufte CSS.

### 6.2 Review (the hero screen)
- A true **landscape index card**, 5:3 (e.g. 680 × 408 at 1440, scaling with clamp). White, radius 6, 1px rule,
  **red header rule** 44–56px from the top. In the upper left, the mono "call number" slot (`FR · ПОВСЕДНЕВНОЕ · 014`).
  Faint blue ruled lines are optional. The French word is Newsreader 500 at **56–72px with opsz at max**, left-aligned on the
  first ruled line. Do not centre it in the middle of a void.
- On the back: translation, then dictionary metalanguage in italic (*v. pron. · arg.*), the slang meter, and the note.
  The **tracings line at the bottom of the card** shows where else it's filed or its synonyms.
- Under the card: three outlined grade buttons aligned to the card width, each with its interval *and
  a keycap hint* in mono (`1  Не знаю  <1 мин` / `2  Сложно  6 мин` / `3  Знаю  1 д`). `Space` = show
  answer (then Знаю, Anki-style), `Z`/`Ctrl+Z` = undo, `E` = edit. Shortcuts are listed in a `?` sheet.
  Swipe stays mobile-only. On desktop, a rubber-stamp «ЗНАЮ» can flash briefly on keypress (one motion moment, under
  ~150ms ease-out, no bounce).
- **Margin column (sidenotes)**: a short session ledger (`07 / 30`, new 4, again 2), "this card"
  stats (last seen, interval, stability as words not charts), and the next due count. Keep it to short phrases,
  with no charts unless they show real data.
- **Left rail** shows the queue as a pile of cards: the count and the theme mix only, never the next words, which would spoil recall.

### 6.3 Библиотека = the catalog drawer (list + detail)
- A **ledger table**, not cards. Columns are: французское (Newsreader 19–20px), перевод (Plex Sans 15),
  грамм. (Newsreader italic, muted), сленг (meter + italic abbreviation), тема (plain text), след. повтор (mono, tabular,
  right-aligned). Use row hairlines `#d6d6d1`, a **strong 1px ink rule under the header row**, no vertical
  rules, 10–12px vertical padding, and a mono 11px header row in sentence case, or small caps if real.
- A **running head / guide words** at the top of the visible range like a printed dictionary page: `bouffer
  — kiffer`, in mono or Newsreader italic. Add an optional A–Z **thumb index** down the right edge of the table.
- `J/K` to move, `Enter` to open, `/` to focus search. The detail opens in the right pane (Linear/Mail
  split), not a modal. Row actions appear only on hover or selection. The bulk bar appears only with a selection («Переместить в
  тему…», «Удалить»).
- **Word detail as a dictionary entry**: the headword is large Newsreader, then the italic grammar line, numbered senses, and
  examples in italic with a source line, register as a word (*arg.*), synonyms with `➙`. A jump strip with
  abbreviated tabs (`пер.` `прим.` `син.` `ист.`, as on Le Robert) appears only if the entry is long. A **«Рядом в
  алфавите»** strip (Larousse "Mots proches" / M-W "Nearby Words") shows neighbouring words in the user's own
  catalog. «Обновить перевод и заметку» is a tertiary text button at the end.

### 6.4 Темы = drawers
- Prefer a **ruled list of drawers** (name in Newsreader 20, a 3px colour band at the start as the drawer label,
  mono columns `слов / к повт. / новых`, a progress hairline) over a 3-up identical tile grid. If tiles are used,
  use 4 columns at 1440 and order by due count, so the grid carries information.
- «Разложить по темам» → a two-column **Предлагаемые перемещения** ledger: word | from → to | ✓. Accept with
  `Enter` per row and `A` for all. This is Reader-style triage.

### 6.5 Добавить / Импорт
- Desktop quick add is an **always-present field at the top of Библиотека** (also `N` or `Ctrl+K`). The
  suggestion dropdown has the two quiet sections «Словарь» / «Варианты», and hairline skeleton rows while loading.
  The full add form opens as a **right sheet** (or in the margin column), not a centred modal.
- Import: drag a screenshot anywhere onto the window. The review screen is a split with the screenshot on the left
  (6 cols) and the extracted pairs ledger on the right (6 cols) with checkboxes, `ДОГАДКА` mono tags and the slang meter. Hovering
  a row highlights its region on the image.

### 6.6 Type scale (desktop, Utopia-style clamp between 390 and 1440)
- Base UI 15 → 16px Plex Sans. Ratio ≈ 1.25.
- Mono data 11 → 12px (tabular). Labels 13px Plex Sans 500.
- List headword 19 → 20px Newsreader 500. Detail headword 40 → 56px. Review card headword 40 → 64/72px
  (opsz auto). Screen titles ("Библиотека", "Готово на сегодня") 28 → 34px Newsreader 500, left-aligned.
- Prose and notes: max ~65ch (≈ 560–640px). Never let the note text run the full pane width.
- Weights: 400 / 500 (600 only for the active nav item). No bold-everything.

### 6.7 Rules and colour
- Three rule weights only: **hairline** `#d6d6d1` 1px (rows, panes), **ink** `#111` 1px (under table
  heads, above a section like a dictionary's running-head rule), **red** `#c8331f` 2px (the index-card header line and
  the active nav marker only). Panes are separated by hairlines, not by background colour changes or shadows.
- Red stays rare. At 1440 there should still be at most 3–4 red marks on screen.
- Focus ring: 2px ink outline with a 2px offset (keyboard use is now first-class on desktop).

### 6.8 Do-not list for the desktop mockups
No hero-metric row, no streak flames or confetti, no identical 3-up feature tiles, no icons above headings,
no left-border accent cards, no centred island at 1440, no modals for add/edit/detail, no gradients or soft
shadows, no "AI"/sparkle, no mono eyebrow labels above every block, no decorative sparklines or heatmaps unless
they plot real review history.
