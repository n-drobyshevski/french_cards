import { ViewTransition, type ReactNode } from "react";

// Library ⇄ theme page (MOTION-SPEC L6, P2): a navigation tagged `nav-forward` (a theme tile) slides
// the library out to the left and the theme in from the right; `nav-back` (the theme's back arrow)
// reverses it. Untagged navigations (tabs, browser back, refresh) and Suspense reveals don't animate.
// The slide itself lives in app/globals.css (::view-transition-old/new(.nav-forward|.nav-back)).
const SLIDE = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };

/** Wrap a page's content (in page.tsx, not a layout: layouts persist, so they never enter or exit). */
export function NavSlide({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={SLIDE} exit={SLIDE} default="none">
      {children}
    </ViewTransition>
  );
}
