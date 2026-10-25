"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAddSheetActions } from "@/components/providers/AddSheetContext";
import { useLayoutClass } from "@/lib/use-media";
import {
  blocksGlobalKeys,
  FOCUS_SEARCH_EVENT,
  globalKeyAction,
  isModifierKey,
  OPEN_LAYER_SELECTOR,
  SEQUENCE_MS,
} from "./keys";
import { useShell, useShortcutsEnabled } from "./ShellContext";
import { isSidebarHidden, toggleSidebar } from "./sidebar-state";

/**
 * Global keys from 768 up (phones keep today's behaviour): N, /, ?, G then R/E/L/P/C/I, [. Listens in the
 * capture phase so the second key of a `G` sequence never reaches a screen's own handler (e.g. a
 * theme's `R`). Off while typing, while a dialog/menu is open, and when settings.shortcuts is off.
 */
export function GlobalKeys() {
  const layout = useLayoutClass();
  const enabled = useShortcutsEnabled();
  const addSheet = useAddSheetActions();
  const shell = useShell();
  const router = useRouter();
  const { open: openAdd } = addSheet;
  const { openShortcuts } = shell;

  useEffect(() => {
    if (layout === "compact" || !enabled) return;
    let gUntil = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isModifierKey(event)) return;
      const afterG = Date.now() < gUntil;
      gUntil = 0;
      if (blocksGlobalKeys(event.target) || document.querySelector(OPEN_LAYER_SELECTOR)) return;
      const action = globalKeyAction(event, afterG);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();

      switch (action.type) {
        case "add":
          openAdd();
          break;
        case "search": {
          const claimed = !window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT, { cancelable: true }));
          if (!claimed) router.push("/library?focus=search");
          break;
        }
        case "shortcuts":
          openShortcuts();
          break;
        case "sequence":
          gUntil = Date.now() + SEQUENCE_MS;
          break;
        case "go":
          router.push(action.href);
          break;
        case "toggle-sidebar": {
          const hadFocus = !isSidebarHidden() && !!document.activeElement?.closest("[data-shell-nav]");
          const hidden = toggleSidebar();
          // Focus never stays on a hidden control.
          if (hidden && hadFocus) document.querySelector<HTMLElement>("[data-shell-reveal]")?.focus();
          break;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [layout, enabled, openAdd, openShortcuts, router]);

  return null;
}
