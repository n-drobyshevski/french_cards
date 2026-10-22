# Desktop patterns for managing a card or vocabulary collection

Research notes for the desktop design of «Карточки» (Library, Folder and Word-Detail screens). Researched 2026-10-22.
Where I could not confirm a claim in official docs, it is marked *(unverified)* or *(secondary source)*.

---

## 1. Flashcard and vocabulary apps

### 1.1 Anki Browser: the canonical three-pane manager
Source: https://docs.ankiweb.net/browsing.html (official manual)

- **Layout:** three sections, with the **sidebar** on the left, the **card/note table** at top right and the **editing area** at bottom right. Dragging the boundary between sections resizes them. Opened with `B` from the main window.
- **Table modes:** Cards and Notes (2.1.45+). A switch left of the search box toggles them, as does `Ctrl+Alt+T` / `Cmd+Opt+T`. Many columns change meaning between modes. For example, Deck is the deck name in Cards mode, while in Notes mode it is the number of decks or the single deck name. *Relevance:* our one word has two directions (fr_ru / ru_fr), so we face the same "word vs. card" duality.
- **Sidebar = search builder plus organizer.** There are two tools, switched with `Alt+1` / `Alt+2`:
  - **Search tool:** a click searches for that item. `Ctrl/Cmd`-click adds it with AND, `Shift`-click adds it with OR, `Alt` negates it, and `Ctrl+Shift`-click replaces all searches of the same kind.
  - **Selection tool:** multi-select sidebar items. **Drag-and-drop reorders and reparents decks and tags.** For example, dropping the tags `Calculus` and `Algebra` on `Math` renames them to `Math::Calculus` and `Math::Algebra`.
  - Rename and delete work from the right-click menu, or `F2` / `Del` on Windows. Deletion works on multiple items, and a filter box in the sidebar finds items in the tree.
  - **Saved searches:** right-click the top item and choose "Save Current Search", or drag any sidebar item onto that area.
- **Rows:**
  - Clicking a row shows the note in the editor.
  - **Selecting several rows (drag or Ctrl/Cmd-click) hides the editor**, so the detail pane becomes "N selected".
  - Bulk actions apply to the whole selection.
  - Single-item actions (Info) use the "current" card, which is the last one clicked.
- **Row colours** (Cards mode, first match wins): flagged uses the flag colour, suspended is yellow, marked is purple. *Relevance:* a status tint is fine, but in our system it should be a small glyph or mono label, not a full-row fill.
- **Columns:** right-click the header to choose which columns show, and drag headers to reorder them. A click on a header sorts, and a second click reverses the order. Available columns: Sort Field, Question, Answer, Deck, Due, Ease, Interval, Lapses, Reviews, Tags, Created, Modified.
- **Menus:**
  - **Edit** menu: Undo ("Revert the most recently performed operation"), Select All, Select Notes, Invert Selection, Create Filtered Deck (built from the current search).
  - **Notes** menu: Add Tags, Remove Tags, Toggle Mark, Find Duplicates, Find and Replace (scope: tags, all fields or one field; "Selected notes only"; regex), Delete.
  - **Cards** menu: **Change Deck** ("Move currently selected cards to a different deck"), Set Due Date (accepts ranges like `60-90`), Reset (Forget), Reposition, Toggle Suspend, Flag, Info.
  - **Go** menu: keyboard moves up and down the list.
- **Find Duplicates** has a "Tag Duplicates" action that tags every match for bulk handling. *Relevance:* our app already has "Уже есть в «Деньги»" dedupe on add, so a desktop "Дубликаты" filter preset would fit.
- **Lesson:** Anki is powerful but famously dense and dated. Take its structure (sidebar, table, editor, bulk menus) and leave its visual density and menu sprawl.

### 1.2 RemNote Card Table
Source: https://www.remnote.com/feature/card-table (marketing page); route remnote.com/cards per https://help.remnote.com/en/articles/11553351-using-quick-navigation-routes

- A spreadsheet-style table of **every** flashcard. Columns include content, due date, ease, review count and mastery level, and every column sorts.
- **One-click filter presets: leeches, struggling cards, disabled cards** and more. Custom filters cover document, tag, due date, review count, mastery level and SRS state. Keyword search covers all content.
- **Checkbox selection activates a bulk toolbar.** Bulk-editable fields: due date, ease, repetitions, tags and other SRS metadata. Stated use cases: reschedule before an exam, reset low-ease cards, re-enable disabled cards, tag by topic.
- **Clicking a card opens an editor pane in context** (its source document) "without losing your place in the table". This is master-detail rather than a modal.
- *Relevance:* the presets map directly onto ours: «К повторению», «Трудные» (≈ leeches/struggling) and «Новые».

### 1.3 Mochi
Sources: https://mochi.cards/docs/decks/ , https://mochi.cards/docs/decks/custom-views/ , forum https://forum.mochi.cards/posts/search?page=3 , https://forum.mochi.cards/posts/search?page=13

- **Decks nest** into hierarchies, and decks can be **archived**, which takes them out of review.
- **Views per deck:** grid (the default for new views) or list. Views **save automatically** and can be edited, duplicated and deleted. Deleting a view does not delete cards.
- **Filters** (behind a Filters button on the right): tags (`#tag`), pinned, due status, search term, date (`@today`), new only, retention rate (≤ 80), review count, card status, last review result.
- **Sort options:** newest first, most recently reviewed, alphabetical, random.
- **Desktop multi-select brings up an actions toolbar at the bottom of the screen** (e.g. change tags) *(forum answer)*. On iOS, multi-select and move were missing for a long time, and the developer said it was "not built into mobile yet" *(forum)*.
- **Moving a single card:** click the deck/subdeck name in the open card's footer to get "Move card to…" *(forum bug report)*. This is a nice idea: **the folder label on a card is itself the move control.**
- Bulk duplicate and batch field edit did not exist at the time of the forum answers. Even mature SRS apps under-invest in bulk management.

### 1.4 Quizlet set editor
Source: https://help.quizlet.com/hc/en-au/articles/360030212131-Editing-sets (via search snippet; the page returned 403 to fetch)

- The editor is a vertical list of **term | definition rows**, each editable inline.
- **Hover a row** and the pointer becomes crossed arrows, so the row can be dragged to reorder. A double-arrow control **swaps term and definition**. A **"+" appears on hover between two rows** to insert a row there. A **trash icon per row** deletes it.
- The user finishes with a check mark (older versions: "Done").
- *Relevance:* hover-revealed in-between "+" and per-row trash are the classic desktop translation of mobile row affordances. "Swap" maps to our FR↔RU, which we don't need per row.

### 1.5 LingQ Vocabulary page
Sources: https://lingq-support.groovehq.com/help/how-and-why-to-filter-your-vocabulary-list-like-a-pro , https://lingq-support.groovehq.com/help/how-do-i-increase-my-known-words (search snippet)

- A **Filters** button opens filters by tag, Status (1–4, Known), Course, Lesson and SRS due date, applied with **Apply**.
- **Tick boxes on the left of each row**, then a **"More actions" dropdown**: raise or lower status by 1, mark Known, delete. Batch delete is a paid feature.
- *Relevance:* status is a first-class column with ±1 bulk changes. For us the equivalents are slang level (bulk "set level") and "reset progress".

### 1.6 Readwise Reader library
Sources: https://docs.readwise.io/reader/guides/workflows/library-configuration , https://help.readwise.io/article/79-how-do-keyboard-shortcuts-work , https://curtismchale.ca/2025/03/29/read-later-with-readwise

- **Library locations are a triage pipeline:** Inbox → Later → Archive (Triage config), or Later → Shortlist → Archive, or Later → Archive.
- **Single-key moves:**
  - Inbox `Shift+E`, Later `L`, Archive `E`, Shortlist `S`.
  - `D` deletes *(user blog)*.
  - `?` or `Ctrl/Cmd+K` lists all shortcuts.
  - Shortcuts are customizable in Preferences.
- **Filtered views** (e.g. "Shortlist" = a tag filter regardless of location) sit beside the locations.
- Switching configuration **asks for confirmation only when documents would move**.
- *Relevance:* «Входящие» is literally an inbox to triage. The desktop app should make **"process Входящие" a keyboard flow**: j/k down the list, a single key or `M` to move to a theme, and the next row is auto-focused.

---

## 2. General-purpose exemplars

### 2.1 Linear (list views, selection, bulk)
Sources: https://linear.app/docs/select-issues , Peek (via search result for https://linear.app/docs/peek.md ; direct fetch 404) , https://linear.app/changelog/2020-08-26-better-menus-and-view-options , https://linear.app/changelog/2021-03-25-keyboard-shortcuts-help

- **Highlight and selection are separate.** Hovering, or moving with `↑/↓` or `J/K`, **highlights** (focuses) a row, and actions apply to the highlighted row. **Selection** is a separate state, and nothing is selected by default.
- **Select one:** press `X` on the highlighted row, **or `Shift`-click, or hover near the left edge to reveal a checkbox.**
- **Select non-consecutive rows:** select one, move to another and press `X`.
- **Select a range:** `Shift+↑/↓` extends the range one row at a time.
- **Select all:** filter first, then `Cmd/Ctrl+A`.
- **Clear selection:** `Esc`.
- **Acting on a selection:**
  - `Cmd/Ctrl+K` opens the command bar, and a right-click on a selected row opens the context menu.
  - **Common bulk actions appear in a bar at the bottom of the view.**
  - Single-letter property keys (e.g. `P` priority) work on the whole selection.
- **Manual reorder:** `Opt/Alt+Shift+↑/↓` moves rows to the top or bottom, and `Opt/Alt+↑/↓` moves them one step at a time.
- **Context menus** (2020 changelog): right-clicking any issue changes properties or copies info, and works the same in list, board and sub-issue views.
- **Peek:** `Space` toggles a quick preview of the highlighted item, and holding `Space` shows it only while held. `J/K` or the arrows navigate while peek is open. It is keyboard-only.
- `?` opens shortcut help.

### 2.2 Things 3 (Mac)
Sources: http://culturedcode.com/things/support/articles/2785159/ (keyboard shortcuts) , https://culturedcode.com/things/support/articles/2803582/ (multi-select) , https://culturedcode.com/things/support/articles/9651894

- **Selection:**
  - `Opt+↑/↓` selects the first or last item.
  - `Shift+↑/↓` extends the selection, and `Opt+Shift+↑/↓` extends it to the top or bottom.
  - `Cmd+A` selects all.
- **Open and close an item:**
  - `Return` opens the selected item for **inline expansion in the list**, and `Cmd+Return` saves and closes it. Things edits **in place**: the row expands into a card, with no side pane and no modal.
  - `Return` or `Cmd+→` enters a project, and `Cmd+←` goes back.
- **Move:**
  - `Shift+Cmd+M` moves to another list through a picker.
  - `Cmd+↑/↓` moves an item up or down, and `Opt+Cmd+↑/↓` moves it to the top or bottom.
- **Other keys:** `Cmd+D` duplicates. **Quick Find:** `Cmd+F`, or **just start typing**, to search and jump to any list.
- **Bulk:** select items, then use the **Move button in the bottom toolbar**, or **drag the selection onto a list in the sidebar** (Mac). On iPhone, swiping left selects, and a bottom toolbar acts on the selection.
- *Relevance:* swipe-to-select on mobile becomes click or Cmd-click on desktop, and the same bottom toolbar appears on both.

### 2.3 Gmail (keyboard triage plus undo)
Sources: https://support.google.com/mail/answer/6594 ; undo guidance from https://dev.to/137foundry/how-to-choose-between-confirmation-dialogs-undo-windows-and-soft-delete-patterns-1opj

- `j/k` move to the older or newer item, `x` selects, `*` then `a` selects all, `*` then `n` deselects all.
- `e` archives, `#` deletes, **`z` undoes the last action**, `v` opens a move-to menu, `l` opens a label menu.
- `Enter`/`o` opens an item, `u` returns to the list, `/` searches, `?` shows help.
- **Toast with Undo instead of a confirmation dialog** for reversible actions. Google Drive moves files to trash with no confirmation and asks for one only when emptying the trash *(secondary source)*.

### 2.4 Superhuman
Sources: https://help.superhuman.com/article/478-superhuman-command , https://help.superhuman.com/article/441-splits

- `Cmd+K` is the universal command line, and **each palette row shows its single-key shortcut on the right**, so the palette teaches the keys.
- Split inbox: sections at the top of the inbox, defined by search syntax, with a recommended maximum of seven.
- `Z` undo and `E` archive *(unofficial lists)*.

### 2.5 Apple HIG: sidebars and split views (Mail, Finder, Notes pattern)
Sources: https://developer.apple.com/design/human-interface-guidelines/sidebars , https://developer.apple.com/design/human-interface-guidelines/split-views

- **Show at most two levels of hierarchy in a sidebar.** For deeper data, use a split view with a **content list between sidebar and detail**, which is the three-pane layout.
- Let people **hide the sidebar** (a toolbar button plus View menu and shortcut), but **don't hide it by default**. On macOS, **collapse it automatically when the window narrows** (as Mail does).
- **Don't put critical actions at the bottom of a sidebar**, because window placement often hides the bottom edge.
- Icon colours should be purposeful. Sparing fixed colours are fine, like the yellow VIP icon in Mail. *Relevance:* this matches our muted theme inks.
- Let people customize the sidebar's order and contents.
- **Persistently highlight the current selection in every pane that leads to the detail.**
- **Allow drag and drop between panes**, e.g. a list row onto a sidebar folder.
- Set **min and max pane widths** so the divider never disappears. Prefer the **thin 1pt divider**. Provide several ways to restore a hidden pane (toolbar, menu, shortcut).

### 2.6 Notion databases
Sources: https://www.notion.com/help/keyboard-shortcuts ; https://bullet.so/blog/how-to-open-center-peek-notion/

- Rows open as **side peek** (the default for Table, Board, List and Timeline), **center peek**, or full page, set per view via "Open pages as".
- While a peek is open, `Ctrl+Shift+J/K` (Mac) or `Ctrl+J/K` (Windows) step to the next or previous database row. **Stepping through records inside the detail pane** is the important pattern.

### 2.7 Airtable grid
Sources: https://support.airtable.com/docs/grid-view ; https://support.airtable.com/docs/row-height

- Row heights: **Short (default, about one line), Medium, Tall, Extra Tall**, chosen with a switcher in the view bar.
- **`Space` on a selected cell expands the record**; in text cells, `Shift+Space` or the expand button does it.
- Hide and show fields from a modal ("Hide all / Show all", find field). The primary field can't be hidden. Reorder by dragging headers or the six-dot handle, and resize by dragging column edges. A fill handle copies values down.

### 2.8 Outlook on the web: hover quick actions
Sources: https://support.office.com/en-us/article/Use-Quick-Actions-to-manage-your-inbox-9b4c474a-be34-4757-8ae3-b02e373ec8a6 ; https://robert365.com/article/disable-or-customize-quick-actions-in-outlook-on-the-web

- Hovering a message row shows **4 icon actions (Delete, Read/Unread, Flag, Pin) in place of the date/time**. Users can customize them (archive, delete, move, flag…) under Settings › Customize actions.
- This is the **direct desktop counterpart of mobile swipe actions**, and Outlook mobile lets users configure the same set of actions for left and right swipes.

---

## 3. Cross-cutting patterns with concrete specs

### 3.1 Sidebar of folders/tags with counts
- Apple: at most two levels, short labels, a collapsible sidebar that is visible by default, and no key actions at the bottom.
- Anki: the sidebar both **filters** (click; modifier-click combines) and **organizes** (drag to reparent, F2 rename, Del delete, right-click menu, filter box for long trees).
- Counts: right-aligned, tabular figures. The common convention (Mail, Things) shows **one number**, usually the actionable one (unread or due). Showing "total / due" doubles the visual noise in a sidebar.

### 3.2 Master-detail vs modal detail
- **Persistent side pane:** Anki (bottom pane), RemNote (editor pane, "without losing your place"), Apple Mail and Notes (third column), Notion side peek.
- **Transient peek:** Linear `Space`, Notion center peek. **Inline expansion:** Things `Return`.
- **Modal:** mostly for creation (Quizlet "Create set", Linear "New issue" `C`). Modals for viewing or editing break j/k flow and are rarer among keyboard-first tools.
- **Multi-selection replaces the detail pane:** Anki hides the editor when several rows are selected. The usual modern take is a pane reading "N selected" plus bulk controls.
- Notion's J/K inside the peek means the detail pane must not trap navigation. Arrow keys should keep driving the list while the detail updates (Mail behaviour).

### 3.3 Dense tables and row height
- **Carbon Design System** (https://carbondesignsystem.com/components/data-table/usage/):
  - Row sizes: **xs 24 / sm 32 / md 40 (default) / lg 48 / xl 64 px** (xl only for two-line rows). Header row height matches body rows, and the toolbar, batch bar and pagination match the row height.
  - Sorting: the unsorted arrow icon shows only on header hover. Ascending and descending show an arrow up or down, and only the sorted column shows an icon.
  - Use skeleton rows for loading, not spinners. The toolbar holds at most 5 actions, with the rest in an overflow menu.
  - **Per-row overflow menu:** persistent by default, or shown only on hover and focus (`overflowMenuOnHover`), and **always visible on touch**. With fewer than 3 actions, show them inline as icon buttons.
- **Airtable:** Short / Medium / Tall / Extra Tall, user-switchable.
- **General guides** (https://medium.com/design-bootcamp/data-table-design-patterns-4e38188a0981 ; https://coyleandrew.medium.com/design-better-data-tables-4ecc99d23356): condensed 40, regular 48, relaxed 56 px. Smaller rows show more data but make scanning harder, so offer a density control. Zebra stripes help long tables but can mislead in short ones and compete with hover and selection states. A row hover tint helps horizontal scanning.

### 3.4 Multi-select model (click, Shift, Cmd/Ctrl, ⌘A)
- **Mouse conventions:**
  - Click selects one row and clears the rest.
  - **Cmd/Ctrl-click** toggles a row.
  - **Shift-click** selects the range from the anchor (the last clicked row) to the clicked row.
  - **Cmd/Ctrl+A** selects all *visible/filtered* rows (Linear: "filter first, then ⌘A").
  - **Esc** clears the selection.
  - Shift-click is "the standard across most applications and operating systems" (https://help.core.cin7.com/hc/en-us/community/posts/16457462531215 ; https://www.novell.com/documentation/groupwise23/gw_guide_gwweb/data/multi_select_items.html).
- **Hover checkbox at the row's left edge** (Linear, Gmail, LingQ, Carbon) for mouse-only users. The header checkbox has three states: checked, unchecked, indeterminate (Carbon).
- **Keyboard model, WAI-ARIA listbox (multi-select)** (https://www.w3.org/WAI/ARIA/apg/patterns/listbox/):
  - **Focus is separate from selection**, so moving focus never drops the selection.
  - `Space` toggles the focused row, and `Shift+↑/↓` moves and toggles. `Shift+Space` selects the range from the last selected row.
  - `Ctrl+Shift+Home/End` selects to the start or end, and `Ctrl+A` selects all.
  - **Type-ahead** jumps to a row by its first letters (recommended for lists of 7+).
- Linear's "highlight ≠ selection" matches this, and adds `X` to toggle.

### 3.5 Bulk action bar
- **Position:** at the **bottom of the view** (Linear, Mochi, Things, Apple Photos) or **at the top of the table, replacing the toolbar** (Carbon, Gmail).
- **Contents:** selected count, actions, **Cancel/✕ at far right** (Carbon). It exits when the selection is cleared.
- Carbon: **while batch mode is active, per-row hover icons and overflow menus are disabled**, to avoid ambiguity about whether an action hits one row or all of them.
- **Typical flashcard bulk actions:** Move to deck (Anki "Change Deck", our «Переместить»), Add/remove tags, Suspend, Reset/Forget, Set due date, Delete (Anki, RemNote, LingQ).

### 3.6 Drag rows onto folders
- Anki drags sidebar items to reparent. Things and Apple drag a list selection onto a sidebar list, and **dragging one selected row carries the whole selection** (Things). The Apple HIG recommends drag between split-view panes.
- **NN/g drag-and-drop** (https://www.nngroup.com/articles/drag-drop/):
  - Use a grab-handle signifier, avoiding icons that read as hamburger/kebab menus, plus the platform move cursor on hover.
  - Make the dragged item look distinct and show a translucent ghost.
  - **Activate drop zones before the cursor reaches them** (highlight or dotted border).
  - Animate reorders at about 100 ms.
  - **Always pair drag with a precise alternative (menu or keyboard).** Handles should be reachable with Tab and grabbable with Space.
- Microsoft and Unity: give target feedback (where the drop lands) and pointer feedback (a "not allowed" cursor). Show the drop effect (move vs copy vs reject) (https://learn.microsoft.com/en-ie/Windows/Win32/com/drag-and-drop).
- Esc cancels a drag by OS convention (not covered by NN/g).

### 3.7 Inline editing
- **Quizlet:** term and definition are always-editable inputs in rows.
- **Things:** `Return` expands a row into an editor in place, and `Cmd+Return` saves and closes.
- **Airtable:** a cell is selected first, typing or Enter edits, Esc cancels, and Space expands the record.
- **Anki:** edits happen in the persistent editor pane and are saved live.
- Common convention: **Enter or double-click starts editing, Esc cancels, Enter or Tab commits** and Tab moves to the next field. Never require a "Save" button for single-field edits. Autosave like Mochi views.

### 3.8 Sort / filter / search UX
- **Search:**
  - `/` (Gmail), `Cmd+F` or **just start typing** (Things Quick Find), `Cmd+K` palette (Linear, Superhuman, Readwise).
  - Sidebar items act as filters that combine with search (Anki modifier-click).
- **Filter presets as one-click chips:** RemNote (leeches, struggling, disabled), Mochi (due, new, pinned, retention ≤ X), LingQ (status, SRS due).
- **Sort:** click a column header and click again to reverse (Anki, Carbon). Show the arrow only on the sorted column, and on other headers only on hover. Mochi sorts: newest, recently reviewed, alphabetical, random.
- **Saved views / smart folders:** Anki "Save Current Search", Mochi auto-saved views, Readwise filtered views, Superhuman splits.

### 3.9 Keyboard navigation (consensus map)
| Intent | Common key(s) | Sources |
|---|---|---|
| Next / prev row | `J`/`K`, `↓`/`↑` | Linear, Gmail, Superhuman |
| Toggle select | `X` (Linear, Gmail), `Space` (ARIA) | |
| Extend selection | `Shift+↑/↓` | Linear, Things, ARIA |
| Select all / none | `Cmd/Ctrl+A` / `Esc` | Linear, Things |
| Open / edit | `Enter` (Things, Gmail `o`) | |
| Quick preview | `Space` (Linear Peek, Airtable expand) | |
| Close / back | `Esc`, Gmail `u`, Things `Cmd+←` | |
| Move to folder | `V` (Gmail), `Shift+Cmd+M` (Things), `M` common | |
| Delete | `#` (Gmail), `Del`/`Backspace` (Anki, Finder `Cmd+⌫`) | |
| Undo | `Z` (Gmail, Superhuman), `Cmd/Ctrl+Z` | |
| Search | `/`, `Cmd+F`, type-to-search | Gmail, Things |
| Command palette | `Cmd/Ctrl+K` | Linear, Superhuman, Readwise |
| Shortcut help | `?` | Linear, Gmail, Readwise |
| Rename folder | `F2` / Enter on sidebar item | Anki, Finder |

### 3.10 Empty states
NN/g (https://www.nngroup.com/articles/empty-state-interface-design/):
- **Communicate status.** E.g. "There are no records to display for the selected date range." **Never flash "no records" while loading.**
- **Give learning cues.** E.g. "Star your favorites to list them here."
- **Offer a direct pathway**, such as a Create button or Learn more link.
- Distinguish three cases: **first use** (empty library), **no results** (search or filter matches nothing, offer "clear filters"), and **cleared**, an inbox-zero style success state that NN/g doesn't cover. For «Входящие» this would be «Всё разложено».

### 3.11 Mobile swipe → desktop
- **Outlook:** the same configured action set appears as swipe left/right on mobile and **hover quick-action icons** on the web, replacing the timestamp area.
- **Carbon:** the per-row overflow menu can be hover/focus-only on desktop but **always visible on touch**, and fewer than 3 actions should be inline icons.
- KDE Kirigami's merge request (https://invent.kde.org/frameworks/kirigami/-/merge_requests/197) found hover-only actions with no cue a **discoverability problem**, and reported layout jumps.
  - **Fix:** reserve the space so hover reveals in place without reflow, and keep a persistent `⋯` or the context menu as the visible fallback.
- **Every swipe action needs a visible non-gesture equivalent:** a button, menu or shortcut (https://ux.tti.tamu.edu/components/swipe ; https://horizon.servicenow.com/native-mobile/components/mobile-component-swipe-actions). Use 1–3 actions per side, with the rest in an overflow menu.
- **Right-click context menu** with the same actions as the swipe and hover sets, plus the less common ones (Linear: works identically across all views).
- Things: swiping to select on iPhone becomes click or Cmd-click on Mac, and both share the bottom toolbar.

### 3.12 Undo for bulk actions
- **Gmail pattern:** perform the action immediately, show a toast with «Отменить», and let `Z` (or Cmd+Z) undo the last action.
- Guidance (https://dev.to/137foundry/how-to-choose-between-confirmation-dialogs-undo-windows-and-soft-delete-patterns-1opj ; https://www.saasui.design/blog/saas-destructive-actions-confirmation-ux-patterns):
  - **Undo beats confirmation for reversible actions.** Frequent confirmations get clicked through without being read.
  - Toasts last about **5–10 s**. Material snackbars are 4 s for one line and 10 s for two lines.
  - Back the toast with a durable recovery path such as a trash.
  - Reserve blocking confirmation for truly irreversible actions, like emptying the trash (Google Drive example).
- Anki: the Edit › Undo menu shows the most recent operation (e.g. "Undo Change Deck").
- **For bulk actions:** undo the **whole batch as one step**, and name the count in the toast: «12 слов перемещено в «Деньги» · Отменить».

---

## 4. Implications for Карточки desktop

### Layout (≥ 1024 px)
1. **Three-pane catalog** (Apple Mail / Anki / RemNote):
   - **Left sidebar, about 240 px:** the themes as a catalog drawer index.
   - **Middle word list:** flexible width, minimum about 420 px.
   - **Right detail pane, about 360–400 px:** the index card for the focused word.
   - Use 1px hairline dividers (HIG "thin divider") that can be dragged within min/max limits. Below about 1180 px, collapse the detail pane into a peek overlay that slides over the list. Below about 900 px, collapse the sidebar, as Mail does.
2. **Sidebar** (two levels at most, per HIG):
   - **Top block:** «Повторение» with the due count, «Добавить» (`N`) and «Библиотека».
   - **«Темы» block:** «Входящие» first (dashed rule, count in red ink, as on mobile), then themes in the user's order, then «+ Новая тема».
   - **«Подборки»** (smart filters, RemNote/Mochi-style presets): «К повторению», «Трудные», «Новые», «Сленг: arg./vulg.», «Дубликаты».
   - Put **one mono count right-aligned** per row, the total. Show the due count only as a small secondary mono figure (e.g. `42 · 6`), or only on hover, so the column stays quiet.
   - Keep «Настройки» in the top bar or account menu, **not pinned at the sidebar bottom** (HIG).
3. **Word list rows:** an index-catalog table rather than cards.
   - **Columns:** select-checkbox gutter (appears on hover, or always once anything is selected) · status mark · **FR** (Newsreader 17–19) · **RU** (Plex Sans, muted) · **Тема** (mono label; hidden when viewing a single theme) · **Уровень** (meter or mono `ARG`) · **Следующий показ** (mono, `4 д`) · hover actions slot.
   - **Row height:** default 40 px (Carbon md), with a **«Плотно / Обычно» density toggle** (32 / 40 px, Airtable/Carbon). Use hairline rules between rows and **no zebra striping**, because it fights hover and selection and looks spreadsheet-y rather than catalog-like.
   - **Sortable headers:** click to sort, click again to reverse. Show a mono ▲/▼ only on the sorted column and the others' arrows only on hover (Carbon). Sort options: А–Я (FR), Дата добавления, Следующий показ, Трудность.
4. **Detail pane = the paper index card** (the Word-Detail mobile content):
   - FR headword, RU, example, slang meter, theme label as a **move control** (Mochi: clicking the folder label opens «Переместить в…»), and FSRS progress per direction.
   - Fields are **edited inline** (click or Enter to edit, Esc cancels, Enter/Tab commits, autosave). No modal and no Save button.
   - Arrow keys and J/K keep driving the list while the card updates (Mail / Notion peek behaviour).
   - With **multiple rows selected, replace the card with a "N слов выбрано" summary** and bulk controls (Anki hides the editor; we reuse the space).

### Selection and bulk
5. **Selection model:**
   - Click selects one. **Cmd/Ctrl-click** toggles. **Shift-click** selects a range from the anchor. **Cmd/Ctrl+A** selects all *in the current filter*. **Esc** clears.
   - Keyboard: **focus ≠ selection** (ARIA/Linear). `J/K` or arrows move focus, `X` or `Space` toggles, `Shift+↑/↓` extends.
6. **Bulk bar:**
   - Bottom-anchored over the list (Linear, Mochi, Things, matching mobile's bottom position). Ink background with white text, consistent with the mobile snackbar.
   - Contents: mono count `12 ВЫБРАНО`, then **Переместить… (M)**, **Уровень сленга…**, **Сбросить прогресс**, **Удалить (⌫)**, and `✕` at far right.
   - Disable per-row hover icons while it is active (Carbon).
7. **Undo, not confirmation:**
   - Every bulk move, delete or reset runs immediately, then an ink snackbar shows «12 слов перемещено в «Деньги» — Отменить» for about 8 s.
   - `Cmd/Ctrl+Z` and `Z` undo the last operation as **one batch**, like Gmail.
   - Confirm only for irreversible actions, such as deleting a theme together with its words or emptying the trash. Consider a 30-day «Корзина» smart folder as the durable fallback.

### Drag and drop
8. **Drag rows onto sidebar themes** (Things/HIG):
   - Dragging one selected row drags the **whole selection**, with a ghost reading `la thune +11`.
   - Sidebar themes highlight as drop targets **as soon as a drag starts** (dashed red-ink or ink outline, NN/g). The hovered target gets a solid ink rule. «Входящие» is also a valid target.
   - Esc cancels the drag. On drop, show the same undo snackbar.
   - Always keep the **M / «Переместить…»** picker as the precise alternative (NN/g).
   - Drag-reordering themes in the sidebar is optional, nice-to-have.

### Mobile swipe → desktop
9. **Swipe actions become a hover slot plus a context menu** (Outlook/Carbon):
   - Swipe-left «Переместить» and «Удалить» become **two small icon buttons revealed on row hover or focus in a reserved right-hand slot**, with no reflow (Kirigami lesson). The slot replaces the «следующий показ» text while hovered, as Outlook replaces the timestamp.
   - **Right-click** opens a context menu: Открыть, Переместить в… ›, Уровень сленга ›, Сбросить прогресс, Копировать, Удалить. The same set comes up from `⋯` or Shift+F10 for keyboard users.
   - On touch-capable desktops (hover: none), keep `⋯` visible (Carbon).
   - The swipe-to-grade «ЗНАЮ» stamp stays a review-only interaction. On desktop, grading uses keys `1/2/3` (Не знаю / Сложно / Знаю) and `Space` to flip.

### Keyboard map (shown under `?`, and next to each command in a ⌘K palette as Superhuman does)
10. Keys:
    - **Navigate:** `J/K`/arrows move. `Enter` focuses the card editor. `Space` peeks the card when the detail pane is collapsed. `Esc` backs out or clears.
    - **Select:** `X` toggles, `Shift+↑/↓` extends, `⌘A` selects all.
    - **Act on the row:** `M` moves (theme picker with type-ahead), `E` edits, `⌫`/`Del` deletes (with undo), `Z`/`⌘Z` undoes.
    - **Global:** `/` or `⌘F` searches (or type-to-search, as Things does), `N` adds a new word, `⌘K` opens the command palette, `G then R/L/I` jumps to Повторение, Библиотека and Входящие, `?` shows help.
    - All letter shortcuts are disabled while an input has focus.
11. **«Разобрать Входящие» triage flow** (Readwise/Gmail inbox model):
    - In «Входящие», focus lands on the first word, and the detail card shows the suggested theme. `Enter` accepts the suggestion, `M` picks another theme, and `⌫` deletes.
    - After each action the next word auto-focuses.
    - «Разложить по темам» (batch auto-sort) stays as the secondary row button at the top of «Входящие». On desktop it opens the plan **in the detail pane**, not as a sheet.

### Search, filter, sort
12. **Search and filters:**
    - A search field at the top of the list (radius 4, `/` hint shown as a mono keycap) matches FR and RU, accent-insensitive.
    - Filter chips reuse the mobile set (Все / К повторению / Трудные / Сленг ▾) and **combine with the sidebar theme**.
    - Show the active filter as a mono breadcrumb: `ДЕНЬГИ · ТРУДНЫЕ · 3 ИЗ 18`.

### Empty states (NN/g: status + cue + path; typographic, no illustrations or sparkles)
13. Copy:
    - **Empty library:** «Пока ни одного слова» plus «Добавить слово (N)» and «Импорт со скриншота».
    - **No search results:** «Ничего не найдено по «…»» with «Сбросить фильтры» and «Добавить «…» как новое слово». Search becomes quick-add, which suits our add flow.
    - **«Входящие» cleared:** «Всё разложено» in a mono stamp style.
    - **Empty theme:** «В этой теме пока нет слов — перетащите сюда слова из списка».
    - **Detail pane with nothing selected:** a blank ruled index card with «Выберите слово» and the key hints `J K ↵`.
    - Never show "empty" while loading. Show 2–3 hairline skeleton rows instead (Carbon; matches SPEC).

### Visual guardrails (SPEC v3)
14. Style rules:
    - **Selection** = a pale ink-tinted row (a warm grey, not blue) plus a 2px ink left rule.
    - **Focus** = a 1px ink outline.
    - **Hover** = the faintest paper tint.
    - **The red accent** is reserved for «Входящие» count, due counts and the drop-target rule. Bulk bar and snackbar use ink, not red.
    - No row shadows and no pills. Theme labels are mono caps with a small muted-ink square, in the catalog-label style.
