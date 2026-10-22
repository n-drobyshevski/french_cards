"use client";

// Media-query hooks for the desktop layout (mockups/DESKTOP-SPEC.md §2). Prefer CSS breakpoints
// (`md:` 768, `xl:` 1200) for anything visible on first paint; these are for behaviour that has to
// differ in JS (sheet vs dialog, global keys). On the server and during hydration they report the
// phone layout.
import { useCallback, useSyncExternalStore } from "react";

export type LayoutClass = "compact" | "medium" | "expanded";

/** Widths where the medium (rail) and expanded (sidebar) layouts start; match Tailwind `md` and `xl`. */
export const BREAKPOINTS = { medium: 768, expanded: 1200 } as const;

export const MEDIUM_QUERY = `(min-width: ${BREAKPOINTS.medium}px)`;
export const EXPANDED_QUERY = `(min-width: ${BREAKPOINTS.expanded}px)`;
/** A mouse or trackpad: hover styles, hover-only row actions. */
export const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/** Layout class for a viewport width. */
export function layoutClassFor(width: number): LayoutClass {
  if (width >= BREAKPOINTS.expanded) return "expanded";
  if (width >= BREAKPOINTS.medium) return "medium";
  return "compact";
}

const serverFalse = () => false;

/** Live `matchMedia(query).matches`; false on the server. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  const snapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, snapshot, serverFalse);
}

/** compact < 768 (phone UI), medium 768–1199 (rail), expanded ≥ 1200 (sidebar). */
export function useLayoutClass(): LayoutClass {
  const medium = useMediaQuery(MEDIUM_QUERY);
  const expanded = useMediaQuery(EXPANDED_QUERY);
  return expanded ? "expanded" : medium ? "medium" : "compact";
}

/** True with a mouse or trackpad (hover-capable fine pointer). */
export function useFinePointer(): boolean {
  return useMediaQuery(FINE_POINTER_QUERY);
}
