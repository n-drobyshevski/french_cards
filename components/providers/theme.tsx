"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useLayoutEffect } from "react";
import { db } from "@/lib/db";
import type { Settings } from "@/lib/types";

export type ThemePref = Settings["theme"];

/** Mirror of settings.theme in localStorage, so the pre-paint script can apply it synchronously. */
export const THEME_STORAGE_KEY = "kartochki:theme";

const PAPER = { light: "#f1f1ee", dark: "#121212" } as const;

/**
 * Runs during HTML parsing, before first paint: applies a forced light/dark theme.
 * Kept tiny and dependency-free; also suitable for the root layout's <head>.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);else document.documentElement.removeAttribute("data-theme")}catch(e){}})()`;

function readStoredTheme(): ThemePref | null {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" || t === "system" ? t : null;
  } catch {
    return null;
  }
}

/** Sets data-theme on <html> («system» removes it so prefers-color-scheme decides) and the status bar color. */
export function applyTheme(theme: ThemePref): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);

  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const original = meta.dataset.original ?? (meta.dataset.original = meta.content);
    meta.content = theme === "system" ? original : PAPER[theme];
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode: the theme still applies after Dexie loads.
  }
}

/**
 * Inline <script> that runs while the server HTML is parsed. On the client it renders as
 * text/plain, so React neither executes nor warns about it.
 */
export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  );
}

/** Keeps <html data-theme> in sync with settings.theme (Dexie). */
export function ThemeSync() {
  const theme = useLiveQuery(async () => (await db.settings.get("settings"))?.theme ?? null, []);

  // Re-apply the stored value right away (React dev remounts reset <html> attributes).
  useLayoutEffect(() => {
    const stored = readStoredTheme();
    if (stored) applyTheme(stored);
  }, []);

  useLayoutEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  return null;
}
