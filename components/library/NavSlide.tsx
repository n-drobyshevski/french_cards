import { ViewTransition, type ReactNode } from "react";

// Library ⇄ theme page (MOTION-SPEC L6, P2): a navigation tagged `nav-forward` (a theme drawer) slides
// the library out to the left and the theme in from the right; `nav-back` (the theme's back arrow)
// reverses it. Untagged navigations (tabs, browser back, refresh) and Suspense reveals don't animate.
// The slide itself lives in app/globals.css (::view-transition-old/new(.nav-forward|.nav-back)).
const SLIDE = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };

/** Opening a theme slides the page in from the right (L6, `nav-forward`; see app/globals.css). */
export const NAV_FORWARD = ["nav-forward"];
/** Back from a theme to the library: the reverse slide. */
export const NAV_BACK = ["nav-back"];

/**
 * Drawer → theme page (D4 Bold, M-L-Bold §4): the drawer's name settles into the page's large title
 * and its mastery line into the page's, as one object (`theme-morph`, --dur-turn; globals.css). Only
 * on the tagged slides, so tabs and refreshes never morph. Pass to a named ViewTransition with
 * `default="none"`.
 */
export const THEME_MORPH = { "nav-forward": "theme-morph", "nav-back": "theme-morph", default: "none" };

/** The shared-element names of one theme: its name (drawer → large title) and its mastery line. */
export const themeMorphName = (part: "name" | "line", id: string) => `theme-${part}-${id.replace(/[^\w-]/g, "_")}`;

/** Wrap a page's content (in page.tsx, not a layout: layouts persist, so they never enter or exit). */
export function NavSlide({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={SLIDE} exit={SLIDE} default="none">
      {children}
    </ViewTransition>
  );
}
