// Whether the desktop nav column (sidebar ≥1200, rail 768–1199) is hidden with `[`. Stored per
// device in localStorage and mirrored as <html data-sidebar="hidden">, which globals.css uses to
// hide [data-shell-nav] and show [data-shell-reveal]; SIDEBAR_INIT_SCRIPT (sidebar-init.ts) applies
// it before paint.
import { useSyncExternalStore } from "react";
import { SIDEBAR_STORAGE_KEY } from "./sidebar-init";

const CHANGE_EVENT = "kartochki:sidebar";

export function isSidebarHidden(): boolean {
  return typeof document !== "undefined" && document.documentElement.getAttribute("data-sidebar") === "hidden";
}

export function setSidebarHidden(hidden: boolean): void {
  const root = document.documentElement;
  if (hidden) root.setAttribute("data-sidebar", "hidden");
  else root.removeAttribute("data-sidebar");
  try {
    if (hidden) localStorage.setItem(SIDEBAR_STORAGE_KEY, "hidden");
    else localStorage.removeItem(SIDEBAR_STORAGE_KEY);
  } catch {
    // Private mode: the choice lasts until reload.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function toggleSidebar(): boolean {
  const next = !isSidebarHidden();
  setSidebarHidden(next);
  return next;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** True while the nav column is hidden; false on the server. */
export function useSidebarHidden(): boolean {
  return useSyncExternalStore(subscribe, isSidebarHidden, () => false);
}
