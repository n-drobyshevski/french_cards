# Responsive shell: turning the «Карточки» mobile-first PWA into a real desktop app

Research notes, October 2026. They cover Material 3 adaptive layouts, Apple HIG, Fluent 2, desktop PWA features, command palettes, add-item surfaces, paste and drop of images, hover versus touch, focus, tooltips, kbd styling, line length and Tailwind 4 breakpoints. The final section turns all of this into concrete recommendations for this app.

Current state of the repo, for context:
- Routes: `app/(app)/page.tsx` (home/study), `library/`, `library/[id]`, `import/`, `settings/`.
- `app/manifest.ts` has `display: "standalone"`, `theme_color` and `background_color` set to `#f1f1ee` (paper), and a `share_target` for screenshots.
- There is no `display_override`, `shortcuts` or `launch_handler` yet.
- On desktop the app is the phone column, max-width 440px.

---

## 1. Window size classes (Material 3 / Android adaptive)

Source: https://developer.android.com/develop/ui/compose/layouts/adaptive/window-size-classes

| Class | Width | Typical device |
|---|---|---|
| Compact | < 600dp | 99.96% of phones in portrait |
| Medium | 600–839dp | 93.73% of tablets in portrait, unfolded foldables |
| Expanded | 840–1199dp | 97.22% of tablets in landscape |
| Large | 1200–1599dp | large tablets, small laptop windows |
| Extra-large | ≥ 1600dp | desktop displays |

Height classes: compact < 480dp, medium 480–899dp, expanded ≥ 900dp.

- "Available width is usually more important than available height due to the ubiquity of vertical scrolling." Most apps can adapt using the width class alone.
- Height still matters. Two-pane layouts are impractical at compact height, for example a phone in landscape or a short laptop window.
- Size classes describe the **window, not the device**. Never use `isTablet`-style logic. The class can change at runtime through resizing, split-screen or desktop windowing.
- **Design the expanded layout first.** From the docs: "If you have an existing layout for compact screens, first optimize your layout for the expanded width size class … Then decide what layout makes sense for the medium width size class."
- Large and extra-large classes were added in WindowManager 1.5 / Material 3 Adaptive 1.2 (Oct 2025). Source: https://developer.android.com/blog/posts/material-3-adaptive-1-2-0-is-stable

Mapping these to CSS px: Material dp ≈ CSS px. The thresholds are 600 / 840 / 1200 / 1600 px.

## 2. Canonical layouts (Material 3)

Source: https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts (mirrored at https://developer.android.com/guide/topics/ui/layout/canonical-layouts)

### List-detail
- Two side-by-side panes. Both are shown at **expanded width (≥ 840)**. At medium and compact widths only one pane shows.
- "The list should have a fixed width, while the detail pane should be flexible." Source: SAP Fiori summary of M3, https://www.sap.com/design-system/fiori-design-android/v26-4/foundations/adaptive-layout/canonical-layouts
- Behaviour across size-class changes:
  - When the window narrows from expanded with an item selected, keep the **detail** visible and hide the list.
  - When it widens with the detail showing, show both panes and **mark the item as selected** in the list.
  - When it widens with only the list showing, show the list plus a **placeholder detail pane**, which is an empty state.
- When a single detail pane is shown wide, "add left and right padding or use a dual-column layout within the pane to prevent the content from stretching." Source: SAP Fiori list-detail, https://www.sap.com/design-system/fiori-design-android/v26-4/layouts/list-detail/list-detail
- Third-party M3 implementations put the two-pane breakpoint at 840. Source: https://pub.dev/packages/material_layout

### Supporting pane
- The main area takes about two-thirds of the window. Supporting content is meaningful only next to the main content.
- Splits by width:
  - **Expanded:** 70% main, 30% supporting.
  - **Medium:** 50/50.
  - **Compact:** supporting content goes below the main content or into a bottom sheet.
- A good fit for the study screen: the card is primary, and session stats, card info or the queue go in the supporting pane.

### Feed
- A grid of cards in a vertical scroll. The column count adapts, for example `GridCells.Adaptive(minSize = 180.dp)`, which shows as many columns of at least 180px as fit.
- Headers and dividers span every column (`maxLineSpan`).
- In CSS terms: `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`.

### Pane spacing
- The Compose `PaneScaffoldDirective` exposes `maxHorizontalPartitions`, `horizontalPartitionSpacerSize` and `defaultPanePreferredWidth`. Its default is a single pane with a 0dp spacer, and `calculatePaneScaffoldDirective(windowAdaptiveInfo)` changes these per size class.
  - Source: https://developer.android.com/reference/kotlin/androidx/compose/material3/adaptive/layout/PaneScaffoldDirective
- From memory of the M3 layout spec, which is JS-rendered and could not be fetched: margins are 16dp at compact and 24dp at medium and above, the spacer between panes is 24dp, and a fixed list pane is about 360dp (up to about 412dp at large). **Treat these as approximate.**

## 3. Navigation: bar, rail, drawer and sidebar thresholds

### Material 3 (Expressive, May 2025 onward)
- Navigation bar at compact width. **Navigation rail from ≥ 600dp** (medium and up). Collapsed rails suit 3–7 destinations.
- **The navigation drawer is deprecated in M3 Expressive and replaced by the "expanded navigation rail."**
  - The expanded rail is content-sized, clamped to 220–360dp.
  - The collapsed rail is 96dp (was 80dp). Rail items are 64dp tall (was 60).
  - The expanded rail can show secondary destinations that are hidden when collapsed.
  - It can be modal (overlays content) or standard (pushes content).
  - Sources:
    - https://9to5google.com/2025/05/14/material-3-expressive-navigation/
    - https://gitea.com/784622644/material-components-android/src/branch/master/docs/components/NavigationRail.md
    - https://docs.liri.io/sdk/fluid/develop/classNavigationRail.html
    - https://www.sap.com/design-system/fiori-design-android/v26-4/components/m3-standard-components/navigation-rail/usage
- Older M3 guidance said that for windows wider than 1200dp you should use a permanently visible standard drawer, or a rail that expands into a modal drawer.
  - Source: https://www.sap.com/design-system/fiori-design-android/v25-4/components/m3-standard-components/navigation-drawer/usage

### Fluent / WinUI NavigationView (auto mode)
- ≤ 640px: Minimal (hamburger only).
- 641–1007px: LeftCompact (icon-only rail).
- **≥ 1008px: Left (expanded pane with labels).**
- Source: https://learn.microsoft.com/windows/apps/design/controls/navigationview
- Fluent 2 web size classes:

  | Class | Width |
  |---|---|
  | small | 320–479 |
  | medium | 480–639 |
  | large | 640–1023 |
  | x-large | 1024–1365 |
  | xx-large | 1366–1919 |
  | xxx-large | ≥ 1920 |

  Fluent 2 recommends a 12-column grid. Gutters should be multiples of the base unit. Responsive techniques it lists: reposition, resize, reflow, show/hide, re-architect.
  - Source: https://fluent2.microsoft.design/layout

### Apple HIG: sidebars
Source: https://developer.apple.com/design/human-interface-guidelines/sidebars (change log June 2026)
- A sidebar lists top-level areas and collections, "like folders and playlists." It sits in the leading pane of a split view.
- "In general, show no more than **two levels of hierarchy** in a sidebar." For deeper data, use a split view with a content list between the sidebar and the detail view, which is the Mail three-column pattern.
- "Consider letting people hide the sidebar … in macOS, you can include a show/hide button or add Show Sidebar and Hide Sidebar commands … **Avoid hiding the sidebar by default** to ensure that it remains discoverable."
- macOS: "Consider automatically hiding and revealing a sidebar when its container window resizes" (Mail does this). "**Avoid putting critical information or actions at the bottom of a sidebar.** People often relocate a window in a way that hides its bottom edge."
- Sidebar icons use the accent color by default. Fixed colors should be used sparingly and only for meaning, as with Mail's yellow VIP icon.
- Group with disclosure controls when there is a lot of content. Let people customize the sidebar where possible.

### Apple HIG: split views
Source: https://developer.apple.com/design/human-interface-guidelines/split-views
- "**Persistently highlight the current selection** in each pane that leads to the detail view."
- Let people drag and drop between panes, for example dragging a word onto a folder.
- Set sensible minimum and maximum pane sizes. "Provide multiple ways to reveal hidden panes", such as a toolbar button or a menu command with a shortcut.
- "**Prefer the thin divider style** (1pt)". This matches our hairline-rule aesthetic.
- Default proportions (the tvOS note): primary one-third, secondary two-thirds.

### Apple HIG: toolbars
Source: https://developer.apple.com/design/human-interface-guidelines/toolbars (Dec 2025)
- Toolbars have three zones:
  - **Leading:** back, sidebar toggle, then the view title.
  - **Center:** common controls, which collapse into overflow when the window narrows.
  - **Trailing:** always-visible items, inspector toggles, search, the More menu, and the single primary action.
- "Only specify **one primary action**, and put it on the trailing side." Use **at most 3 groups**.
- Window titles: "Don't title windows with your app name." Keep titles under 15 characters.
- Prefer symbols over text, except for actions like Edit. Never put a text button directly next to a symbol button without a gap.
- macOS: "Make every toolbar item available as a command in the menu bar". On the web, the command palette plays the menu bar's role.
- Consider temporarily hiding toolbars for distraction-free focus. This applies to the study mode.

### Apple HIG: tab bar versus sidebar
- "Consider using a tab bar first." The iPadOS `sidebarAdaptable` style turns a tab bar into a sidebar as the window widens. This is the same pattern as bottom tabs on phone and a sidebar on desktop.

## 4. Desktop PWA specifics

### Window size
Sources: https://web.dev/learn/pwa/windows and https://forum.vivaldi.net/post/720310
- The first launch after install opens at a percentage of the screen, **capped at 1920×1080**, at the top left. After that the browser remembers the user's last size and position.
- **The manifest has no way to set a preferred or minimum window size.** A 2020 proposal for `width/height/minWidth` was never adopted. Chrome enforces its own fairly large minimum width.
- The only programmatic control is `window.resizeTo()` / `moveTo()`, guarded so it only runs when not in a tab.
- Design implication: the layout must work at about 500–800px wide inside a standalone window. Don't assume ≥ 1024px.

### Window Controls Overlay (WCO)
Sources: https://web.dev/articles/window-controls-overlay and https://learn.microsoft.com/microsoft-edge/progressive-web-apps/how-to/window-controls-overlay
- Opt in with `"display_override": ["window-controls-overlay"]` and keep `display: "standalone"` as the fallback. Shipped in Chromium 104. Works only on desktop, in installed windows, on the installation origin.
- CSS env vars: `titlebar-area-x/y/width/height`. Use them with fallbacks, for example `height: env(titlebar-area-height, 33px)`.
- Mark draggable regions with `-webkit-app-region: drag` (the prefix is still required) and interactive elements with `no-drag`.
- JS: `navigator.windowControlsOverlay` provides `visible`, `getTitlebarAreaRect()` and a `geometrychange` event (debounce it). If `x === 0`, the controls are on the right (Windows/Linux). Otherwise they are on the left (macOS).
- CSS/JS media query: `@media (display-mode: window-controls-overlay)`.
- Caveats:
  - The user can toggle WCO off, so react to geometry changes.
  - Navigating to another origin reverts to a plain title bar.
  - Don't put drop-down menus in the title bar, because they conflict with the macOS menu-bar convention.
  - Leave padding so content can't spoof the origin chip.
- `theme_color` / `<meta name="theme-color">` tints the title bar. Use separate light and dark theme-color metas through the `media` attribute.

### App shortcuts
Sources: https://web.dev/articles/app-shortcuts and https://w3.org/TR/appmanifest
- Set up with the `shortcuts` array. Each entry has `name`, `url`, and optional `short_name`, `description` and `icons` (PNG, ideally 96 or 192px; SVG isn't supported).
- Platform limits: Windows (Chrome/Edge) shows **10**, Android Chrome shows **3**. Order matters because extra shortcuts are cut off.
- macOS dock menus don't show icons, so names must be distinct. Manifest updates propagate at most once a day.
- They appear in the taskbar or dock right-click menu and the Start menu jump list.

### Launch handler
Sources:
- https://developer.chrome.com/docs/web-platform/launch-handler
- https://developer.mozilla.org/en-US/docs/Web/API/Launch_Handler_API
- https://developer.chrome.com/docs/capabilities/pwa-navigation-management

Details:
- `"launch_handler": { "client_mode": ["focus-existing", "auto"] }`. Values: `auto`, `navigate-new`, `navigate-existing`, `focus-existing`. Fallback arrays are allowed.
- With `focus-existing`, the target URL is delivered through `window.launchQueue.setConsumer(params => …)`. The app then decides, for example to open the add dialog without reloading.
- Defaults: on desktop `auto` behaves like `navigate-new`, which opens multiple windows. Google Chat uses `focus-existing` to avoid duplicate windows.
- The API is experimental and not Baseline: Chromium has it, Safari and Firefox do not.

### Tabbed application mode
Source: https://developer.chrome.com/docs/capabilities/tabbed-application-mode
- `display_override: ["tabbed"]` with `tab_strip`. Available on ChromeOS only, so it is irrelevant here.

### display-mode detection
Sources:
- https://bugs.webkit.org/show_bug.cgi?id=257806
- https://dev.to/tomayac/web-apps-on-macos-sonoma-14-beta-83i

Details:
- `@media (display-mode: standalone)` in principle. macOS Safari "Add to Dock" apps had a bug where they reported `browser` instead.
- On macOS Safari the web app has **no toolbar**. Back and forward must be in-app.

## 5. Command palette (⌘K / Ctrl+K)

Sources:
- https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/
- https://www.chameleon.io/patterns/cmd-k-search
- https://www.techinterview.org/post/3233475212/build-command-palette-cmd-k/

Patterns:
- **⌘K / Ctrl+K is the de facto standard** (Linear, Vercel, GitHub, Slack, Raycast). `/` is a common second trigger for "search". Esc closes. Pressing the shortcut again toggles it closed and **returns focus to the previous element**.
- Provide a **visible entry point** for discovery, such as a search field or button in the toolbar or sidebar that shows a `⌘K` hint.
- **Single source of truth.** One command registry keyed by stable IDs, and every UI action is also a command. This is the web equivalent of HIG's "every toolbar item is in the menu bar".
- Matching is fuzzy, case-insensitive and typo-tolerant, with **synonyms or aliases**. Display the matched alias next to the canonical title to teach vocabulary.
- Ranking: put **recents first**, use context-aware boosts (commands relevant to the current screen rank higher), and hide only commands that are truly irrelevant.
- Visual: centered, prominent, with the last item cut off so people sense there is more to scroll. Show the **shortcut next to each command**.
- Accessibility: use the combobox pattern (input keeps focus, `aria-activedescendant` virtual highlight), trap focus, and restore focus on close.
- Restraint: a palette doesn't replace visible navigation for primary paths.
- For this app the palette doubles as **search across words**. Typing "chat" should find the word card «le chat» as well as commands like "Добавить слово…", "Учить", "Разложить по темам" and "Импорт скриншота".

## 6. Add item: modal versus inline versus page on desktop

NN/g modal versus nonmodal: https://www.nngroup.com/articles/modal-nonmodal-dialog/
- Modals "interrupt users and demand an action". Use them for critical warnings, info required to continue a process the user started, and short wizard steps.
- Avoid modals for complex decisions that need info the modal hides, and for long tasks. Those warrant a full page.
- Nonmodal panels are better when users need to reference other content while working.
- "A nonmodal desktop window can become a full-screen modal on mobile" means the same component can take different forms per breakpoint.

Industry pattern summary (https://www.saasui.design/blog/saas-modal-dialog-ux-patterns):
- Small, frequent changes: inline.
- Context must stay visible: side drawer or panel.
- Short self-contained task: dialog.

HTML platform (https://web.dev/articles/baseline-in-action-dialog-popover and https://web.dev/blog/popover-api):
- `<dialog>.showModal()` gives top-layer rendering, page inertness, focus management, Esc to close and an implicit `role=dialog`.
- `closedby="any"` enables light-dismiss. Check its support.
- `popover="auto"` is Baseline 2024, gives light-dismiss, and does **not** make the page inert. It is good for suggestion lists, menus and tooltips.

Takeaway for quick add:
- Quick add is short and frequent. On desktop it fits a **centered dialog** opened with `N` or ⌘K → "Добавить", or better an **inline composer row** at the top of the list or detail pane.
- Keep the predictive suggestions inline in the composer as a listbox popover.
- After saving, keep the composer open and focused for rapid entry of several words in a row. This "Save & add another" behavior is the default for vocabulary entry.

## 7. Paste an image (Ctrl+V) and drag-and-drop files

### Paste
Source: https://web.dev/articles/clipboard/paste-images
- Classic approach: a `paste` listener on `document`, `e.preventDefault()`, then filter `e.clipboardData.files` for `image/*`. Supported in Chrome 66+, Firefox 63+ and Safari 13.1+. It works for Ctrl/⌘+V anywhere.
- Async approach: a button-triggered `navigator.clipboard.read()` iterates `ClipboardItem.types` for `image/*`. The first call prompts for permission. Supported in Chrome 76+, Firefox 127+ and Safari 13.1+.
- Use progressive enhancement: a document-level paste listener plus an optional "Вставить из буфера" button where `read` exists.
- **Tell users**, as the web.dev demo does: "Hit ⌘ + v (macOS) or ctrl + v to paste images anywhere."
- Don't hijack paste inside text inputs unless the clipboard has an image file and no text.
- Large pastes through the sync API can block the page, so process them asynchronously and show a spinner or skeleton.

### Drag and drop
Sources:
- https://hds.hub24.com.au/patterns/uploading/
- https://www.saasui.design/blog/saas-file-upload-ux-patterns
- https://web.dev/patterns/files/drag-and-drop-files

Patterns:
- **Pair it with a visible click-to-upload button.** The drag affordance doesn't exist on touch.
- The drop zone has states: default, hover/active (confirming the target area) and disabled/invalid.
- State the rules inside the zone: accepted types, size limit and count.
- A **full-window drop overlay** is a legitimate special case for "drop anywhere" apps such as Slack or Gmail, and it needs a clear highlight.
- Implementation gotchas:
  - Show the overlay only when `e.dataTransfer.types.includes('Files')`.
  - Use a **depth counter** that increments on dragenter and decrements on dragleave to avoid flicker over child elements.
  - Always call `preventDefault()` in `dragover`.
  - Safari hides `items` MIME types during drag, so validate on `drop`.
  - Sources:
    - https://huggingface.co/spaces/multimodalart/ai-toolkit/blob/c12ee07eadc8d06f8ba211bc35053ff3c6ea32f3/ui/src/components/FullscreenDropOverlay.tsx
    - https://bugs.webkit.org/show_bug.cgi?id=223517
- Progress feedback: show file name and size, a progress bar or percentage, and a preview thumbnail. Source: https://v5-archive.patternfly.org/components/file-upload/multiple-file-upload/design-guidelines

## 8. Hover versus touch adaptation

Sources:
- https://web.dev/learn/design/interaction
- https://css-irl.info/detecting-hover-capable-devices/

Media queries:
- `pointer` (none/coarse/fine) and `hover` (none/hover) describe the **primary** input only.
- `any-pointer` and `any-hover` describe all inputs, and both fine and coarse can match on a laptop with a touchscreen.
- Some Android devices emulate hover on long-press. Combine the queries as `(hover: hover) and (pointer: fine)` for "real mouse".

web.dev guidance:
- "**Don't use hover to hide important information or an important interface element.**"
- Pair `:hover` with `:focus` or `:focus-within` so keyboard users get the same reveal.
- Keep larger targets even for fine pointers. Fitts's law applies to everyone.

Pattern for row actions:
```css
.row .actions { opacity: 1; }                       /* touch: always visible */
@media (hover: hover) and (pointer: fine) {
  .row .actions { opacity: 0; }
  .row:is(:hover, :focus-within) .actions { opacity: 1; }
}
```
Tailwind 4 has a built-in `hover:` variant that is **already wrapped in `@media (hover: hover)`**. For pointer:fine, define a custom variant: `@custom-variant pointer-fine (@media (pointer: fine));`.

Swipe-to-grade does not exist on desktop. Replace it with keyboard keys and visible buttons, and optionally keep drag-to-grade with the mouse as a hidden extra.

## 9. Focus rings

Sources:
- https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance
- https://ux.redhat.com/foundations/interactions/focus-indicators/
- https://frontendchecklist.io/rules/css/focus-styles

Guidance:
- Use `:focus-visible` (keyboard only) rather than `:focus`. Never use `outline: none` without a replacement.
- Common spec: `outline: 2px solid currentColor; outline-offset: 2px`. Red Hat uses 3px/3px.
- Contrast should be **≥ 3:1** against adjacent colors.
- Criterion numbers:
  - **WCAG 2.4.7** Focus Visible is AA.
  - **2.4.11** Focus Not Obscured (Minimum) is AA. It matters for sticky headers and toolbars covering focused rows.
  - **2.4.13** Focus Appearance is AAA: a 2px perimeter and a 3:1 change.
- Use an inset or zero offset when the ring would be clipped by a scroll container's edge.
- Ship a dark-mode ring color.

## 10. Tooltips that show shortcuts; kbd styling

### WCAG 1.4.13 Content on Hover or Focus (AA)
Source: https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus
- Tooltip content must be:
  - **Dismissible** (Esc) without moving the pointer or focus.
  - **Hoverable**, so the pointer can move onto it.
  - **Persistent** until the trigger is removed or the tooltip is dismissed.
- Native `title` is exempt, but it shows no shortcut styling and appears with a delay.
- `aria-keyshortcuts="Control+K"` exposes the shortcut to assistive tech only. It doesn't create the binding. MDN recommends also showing it in menus and tooltips. Source: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-keyshortcuts

### Shortcut hints in practice
- Anki shows shortcuts in hover tooltips on buttons and in menus. Source: https://docs.ankiweb.net/studying.html
- Some tools delay the shortcut tooltip, for example to 2 seconds. Others offer a `?` overlay that lists all shortcuts. Source: https://ux.tti.tamu.edu/components/shortcuts-help
- Sequences such as "G then L" render as separate keycaps joined by "then". Combinations render as keycaps joined by "+". TanStack Hotkeys uses a 1s default sequence timeout. Source: https://tanstack.com/hotkeys/latest/docs/framework/react/guides/sequences

### GitHub Primer KeybindingHint
Source: https://primer.style/product/components/keybinding-hint
- `keys="Mod+k"`, where `Mod` means ⌘ on macOS and Ctrl elsewhere. A space separates a sequence.
- Formats: **condensed** for menus and tooltips (`⌘K`) and **full** for prose (`Command + K`). There is a `small` size.
- Variants: `normal`, `onEmphasis`, and `onPrimary` (inside a dark primary button).
- It is purely visual. Wire up the handler separately.

### Other kbd conventions
Sources:
- https://nordhealth.design/components/kbd
- https://hexdocs.pm/phia_ui/PhiaUi.Components.Kbd.md

Conventions:
- A `<kbd>` keycap uses a mono font, a hairline border, a small radius and sometimes a 1px bottom border to suggest a key.
- Wrap a combination in a single `aria-label` such as "Control K" so screen readers announce it as one unit.
- Don't rely on the keycap alone to convey the action.

## 11. Study shortcuts (desktop flashcard precedent)

Anki desktop: https://docs.ankiweb.net/studying.html (also https://docs.ankiweb.net/ankimobile/study-screen.md)
- **Space or Enter** shows the answer.
- **1** = Again, **2** = Hard, **3** = Good (Space and Enter also mean Good once the answer is shown), **4** = Easy.
- **S** returns to the overview.
- Hovering a button shows its shortcut in a tooltip.
- Known gotcha: an IME or non-Latin layout can break number and letter keys. This matters for Russian layouts, so bind by `e.code` (`Digit1`, `Space`, `KeyK`) instead of `e.key`, so the keys work on the ЙЦУКЕН layout.

## 12. Browser-reserved shortcuts

Sources:
- https://lists.w3.org/Archives/Public/public-webapps-github/2016Jan/0255.html
- https://github.com/omartelo/lich/pull/99

Details:
- Chrome, Safari and Edge do not dispatch **Ctrl/⌘+N, +T, +W** (and similar) to pages in a tab, so they can't be used.
- In an `--app` or installed window, Ctrl+W closes the window.
- Use single keys (`N`, `/`, `?`, `1–3`, Space) when focus is not in a text field, plus `Mod+K` and `Mod+Enter`.
- Single-key shortcuts must be disabled while an input or textarea has focus. WCAG 2.1.4 Character Key Shortcuts also requires that single-key shortcuts can be turned off or remapped, or are active only on focus.

## 13. Line length and content max-width

Sources:
- https://baymard.com/blog/line-length-readability
- https://en.wikipedia.org/wiki/Line_length

Measures:
- Baymard recommends **50–75 characters** per line (Ruder suggests 50–60). Bringhurst's 45–75 is the widely cited range, and 66 is the classic target.
- In CSS: `max-width: 65ch` to `70ch` on prose. `ch` measures the "0" glyph, so check the result with real text.
- On wide screens:
  - Don't stretch content panes. Cap the detail or reading column at about 640–720px and center it, or use dual columns inside the pane (SAP/M3 advice).
  - Lists and tables can be wider, about 960–1200px.
  - The app shell itself can go full-bleed with a sidebar, a list pane and a capped detail pane.

## 14. Tailwind CSS v4 breakpoints and container queries

Source: https://tailwindcss.com/docs/responsive-design

| Prefix | Min width |
|---|---|
| `sm` | 40rem (640px) |
| `md` | 48rem (768px) |
| `lg` | 64rem (1024px) |
| `xl` | 80rem (1280px) |
| `2xl` | 96rem (1536px) |

- Max variants (`max-md`) and ranges (`md:max-xl:`) are available.
- Customize in `@theme` with `--breakpoint-*` and keep units consistent (rem). Reset all with `--breakpoint-*: initial`.
- Arbitrary values: `min-[840px]:`.
- Container queries are native: `@container`, `@md:`, and named containers with `@container/main` and `@lg/main:`.
  - Defaults: @3xs 16rem, @2xs 18rem, @xs 20rem, @sm 24rem, @md 28rem, @lg 32rem, @xl 36rem, @2xl 42rem, @3xl 48rem, @4xl 56rem, @5xl 64rem, @6xl 72rem, @7xl 80rem.
- Container queries are ideal for components such as the word card or list row that sit both in a narrow pane and in full width.

Comparison of common breakpoint sets (px):

| System | Steps |
|---|---|
| Material | 600 / 840 / 1200 / 1600 |
| Tailwind | 640 / 768 / 1024 / 1280 / 1536 |
| Bootstrap | 576 / 768 / 992 / 1200 / 1400 |
| Fluent 2 | 480 / 640 / 1024 / 1366 / 1920 |
| WinUI NavigationView | 641 / 1008 |

---

## Implications for Карточки desktop

### A. Breakpoints

Use the Tailwind defaults plus one Material-aligned custom step. Define in `@theme`:
```css
@theme {
  --breakpoint-md: 48rem;   /* 768: tablet / narrow window → icon rail + single pane */
  --breakpoint-lg: 64rem;   /* 1024: full sidebar (labels) */
  --breakpoint-xl: 80rem;   /* 1280: three-column library (folders | words | detail) */
}
```

| Width | Layout |
|---|---|
| **< 768** | The current phone UI, unchanged: bottom tabs, swipe, sheets. Also used for a narrow installed window. |
| **768–1023** | Collapsed rail (about 64–72px, icon + tiny label) and a single content pane. The study card is centered. Library is list → detail as a push. |
| **≥ 1024** | Expanded sidebar (about 232–260px, within M3's 220–360 range) with labels and theme folders. Library goes two-pane: fixed list about 360–400px plus a flexible detail capped at about 680px. Study uses the supporting-pane layout (card plus a side column at about 30%). |
| **≥ 1280** | Library becomes three columns: sidebar with temы, word list, word detail. This is Apple's "content list between sidebar and detail". |

- Also gate two-pane layouts on height ≥ about 560px, following Material's compact-height rule, for short laptop windows.
- Use container queries (`@container/pane`) for the word row and word card so the same component renders in a 360px list pane and a 680px detail pane.

### B. Shell
- **Left sidebar, not a top nav.** Its contents:
  - Primary destinations: Учить (with a due count in Plex Mono), Словарь/Библиотека, Импорт, Настройки.
  - A hairline rule.
  - The **«Темы»** section with «Входящие» first and its count, then the theme folders, two levels at most (HIG).
- Selection: a black ink bar on the leading edge of the active row plus bold text. **No filled pills.** The red accent is reserved, for example for an overdue or due-count badge.
- Put no critical actions at the bottom of the sidebar (HIG). Settings may live there, but primary actions don't.
- Make it collapsible with `[` or `Mod+\` and a toolbar toggle, and remember the choice in localStorage. Don't collapse it by default. Auto-collapse to the rail below 1024.
- Toolbar per pane, following HIG zones:
  - Leading: sidebar toggle and view title in Newsreader. Don't use «Карточки» as the title.
  - Center: filters/sort for the library.
  - Trailing: search field showing a `⌘K` keycap, then **one black primary button** «Добавить слово» (`N`).
  - Use at most 3 groups.
- Panes use **1px hairline dividers** (HIG thin divider). Optionally let the list pane be resized by dragging the rule, within a min of 300 and a max of 480.

### C. Study screen on desktop
- The card is centered at about 520–600px wide (index-card ratio about 5:3). It should not stretch.
- The supporting pane on the right at ≥ 1024 (about 30%, max 320px) shows:
  - session progress: due, new, remaining, in Plex Mono;
  - direction toggle fr_ru / ru_fr;
  - the card's slang level and verlan flag;
  - the queue preview.
  Hide it in focus mode with `F`, following HIG's "temporarily hide toolbars for distraction-free".
- Keyboard follows the Anki convention:
  - **Space/Enter** flips.
  - **1 = Не знаю, 2 = Сложно, 3 = Знаю**. Space/Enter = Знаю once flipped.
  - **Z** or **⌘Z** undoes the last grade.
  - **E** edits the card.
  - **Esc** exits.
- Bind by `e.code` so the keys work on the Russian ЙЦУКЕН layout. Disable these keys while focus is in an input.
- Grade buttons stay visible under the card with their keycaps printed on them (`1 Не знаю` / `2 Сложно` / `3 Знаю`). This is the desktop replacement for swipe. Swipe is touch-only, and mouse drag-to-grade is optional.

### D. Library (list-detail)
- Selected word stays highlighted in the list (HIG). Use ↑/↓ or J/K to move, Enter to open, `E` to edit, Delete/Backspace to delete (with undo toast), `M` to move to a theme.
- Row actions (move, delete, edit) appear on hover or focus-within for `(hover:hover) and (pointer:fine)` and are always visible on touch.
- Dragging a row onto a theme in the sidebar moves it (HIG drag between panes). A keyboard alternative is required: `M` opens a folder picker.
- Empty detail placeholder (M3): «Выберите слово» in muted serif with a small hint row of keycaps.
- When the window narrows while a word is open, keep the detail and hide the list (M3 rule).
- «Разложить по темам» appears as a toolbar action on «Входящие» and in the palette.

### E. Quick add
- On desktop, open quick add as a **centered `<dialog>`** (showModal; about 560px wide; hairline border; no shadow beyond a 1px rule; paper background).
  - Triggers: `N`, the toolbar button and the palette.
  - The form: French word input (Newsreader) → suggestion listbox below it (`popover` or an inline listbox with «Словарь» rows first and «Варианты» second, each section with a mono label) → Russian translation → theme select.
- `Mod+Enter` saves. **Saving keeps the dialog open and clears the fields** for the next word («Сохранить и ещё»). Esc closes.
- Alternatively, or at ≥ 1280, use an **inline composer row** pinned at the top of the library list. This is a nonmodal, Things-style approach that keeps context visible. It fits the NN/g advice to avoid modals when users reference other content.
- Never navigate to a separate page for adding on desktop. The `/import` page is only for multi-step screenshot review.

### F. Screenshot import on desktop
- **Ctrl/⌘+V anywhere** (outside text inputs, or inside them when the clipboard has an image and no text) starts the import with the pasted image.
- **Full-window drop overlay** while dragging Files. The overlay:
  - is paper at about 92% opacity;
  - has a dashed 1.5px ink border inset 16px;
  - shows a centered serif line «Отпустите, чтобы распознать слова» and a mono line `PNG · JPG · HEIC · до 10 МБ`.
- Use a depth counter and `types.includes('Files')`, and validate on drop.
- The `/import` page on desktop is a drop zone card that says «Перетащите скриншот или нажмите ⌘V» with a «Выбрать файл» button, plus an optional «Вставить из буфера» button (Async Clipboard) where supported.
- Review step: two panes. On the left, the screenshot preview. On the right, the extracted pairs as an editable table with checkboxes and per-row theme. Commit with `Mod+Enter`.

### G. Command palette (`Mod+K`, also `/`)
- Centered at about 640px wide and about 20vh from the top. It has a hairline border and no blur. The input is in Plex Sans, results in groups with mono uppercase group labels.
- Groups:
  - «Действия»: Добавить слово, Учить, Импорт скриншота, Разложить по темам, Сменить направление, Тема оформления.
  - «Темы»: jump to a folder.
  - «Слова»: fuzzy search over French and Russian. Each result shows a serif French word with the Russian gloss and a slang tag.
- Recents appear first. Each command shows its shortcut keycap on the right.
- Use the combobox ARIA pattern and restore focus on close. Keep a visible search field in the toolbar showing `⌘K` for discoverability.

### H. Shortcut hints and kbd
- One `<Kbd>` component: IBM Plex Mono 11px, 1px hairline border in the ink-muted color, 3px radius, 0 2px padding, min-width 18px.
  - No gradients or shadows. At most a 1px bottom border to suggest a key.
  - The `Mod` key renders ⌘ on Mac and Ctrl elsewhere, detected with `navigator.userAgentData?.platform ?? navigator.platform`.
  - Use the condensed format in tooltips and the palette.
- Tooltips on icon buttons show the label plus the keycap. They appear after about 500ms on hover and immediately on keyboard focus, dismiss with Esc, can be hovered, and have no arrow flourish. Add `aria-keyshortcuts` on the button.
- `?` opens a shortcut sheet: a two-column dictionary-style list of key → action, grouped by screen.

### I. Focus and hover
- Global rule: `:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }`.
  - Use an inset (`outline-offset: -2px`) for rows inside scroll panes.
  - Use the red accent only if it reaches ≥ 3:1. Prefer ink, which keeps red rare.
- Ensure sticky toolbars don't cover focused rows (WCAG 2.4.11), using `scroll-padding-top` equal to the toolbar height.
- Hover states: use a background tint of paper → about 3% ink and an underline on links. No lift or shadow.
- Add `cursor: pointer` only on actual links and buttons.

### J. Manifest / installed-window upgrades for `app/manifest.ts`
```ts
display: "standalone",
display_override: ["window-controls-overlay", "standalone"],
launch_handler: { client_mode: ["focus-existing", "auto"] },
shortcuts: [
  { name: "Учить", short_name: "Учить", url: "/?from=shortcut", icons: [{ src: "/icons/sc-study-96.png", sizes: "96x96" }] },
  { name: "Добавить слово", short_name: "Добавить", url: "/?add=1", icons: [...] },
  { name: "Импорт скриншота", short_name: "Импорт", url: "/import", icons: [...] },
  { name: "Входящие", url: "/library?theme=inbox", icons: [...] },
],
```
- Put the most important shortcuts first, because Android shows only 3.
- WCO title bar, about 36–40px: paper background, the app mark and the current view title (left-aligned on Windows and right of the traffic lights on macOS, using `titlebar-area-x`), and the `⌘K` search field in the center as `no-drag`. **No dropdown menus** in it.
  - Fall back to the in-page toolbar when `env(titlebar-area-*)` is absent.
  - Keep `theme-color` metas in light and dark variants (`media="(prefers-color-scheme: dark)"`) so the native title bar matches the paper or ink-dark background.
- With `focus-existing`, consume `launchQueue` to open the add dialog or import directly in the existing window.
- macOS Safari "Add to Dock" windows have **no back button**. The in-app shell must always offer navigation, which the sidebar provides.
- No minimum window size can be set. The layout must degrade gracefully down to about 480px wide inside the installed window, falling back to the mobile layout.

### K. Content widths
- Reading and detail column: max about 680px (about 65ch for Plex Sans body).
- Study card: max about 600px.
- Dialogs: 480–560px.
- Palette: about 640px.
- Library list pane: 360–400px fixed.
- Sidebar: about 240px expanded, about 64px rail.
- The page has no overall max-width cap. The shell is full-bleed and individual panes cap their content. On screens ≥ 1600px, grow the gutters, not the content.
