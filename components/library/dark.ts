// Dark-theme overrides for the few desktop colours that have no token (DESKTOP-SPEC §3, §5 #25).
// Dark applies with data-theme="dark", or with the system setting unless data-theme="light"
// (app/globals.css). Tailwind needs literal class names, so each override is spelled out here.

/** Current row: white on paper; #242422 in dark (above the #222220 hover). */
export const CURRENT_ROW_BG =
  "bg-surface [:root[data-theme=dark]_&]:bg-hover-surface [@media(prefers-color-scheme:dark)]:[:root:not([data-theme=light])_&]:bg-hover-surface";

/** Theme squares get a faint 1px inset ring in dark. */
export const SQUARE_RING =
  "[:root[data-theme=dark]_&]:outline [:root[data-theme=dark]_&]:outline-1 [:root[data-theme=dark]_&]:-outline-offset-1 [:root[data-theme=dark]_&]:outline-[rgba(236,236,234,.24)] [@media(prefers-color-scheme:dark)]:[:root:not([data-theme=light])_&]:outline [@media(prefers-color-scheme:dark)]:[:root:not([data-theme=light])_&]:outline-1 [@media(prefers-color-scheme:dark)]:[:root:not([data-theme=light])_&]:-outline-offset-1 [@media(prefers-color-scheme:dark)]:[:root:not([data-theme=light])_&]:outline-[rgba(236,236,234,.24)]";
