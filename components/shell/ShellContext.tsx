"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { getSettings } from "@/lib/settings";

export interface ShellApi {
  /** Opens the «Клавиши» overlay (also `?`). */
  openShortcuts: () => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellApi | null>(null);

/** Desktop shell state shared by the nav, global keys and screens («?» buttons). */
export function useShell(): ShellApi {
  const api = useContext(ShellContext);
  if (!api) throw new Error("useShell must be used inside <AppShell>");
  return api;
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const api = useMemo(() => ({ openShortcuts, shortcutsOpen, setShortcutsOpen }), [openShortcuts, shortcutsOpen]);
  return <ShellContext.Provider value={api}>{children}</ShellContext.Provider>;
}

/**
 * settings.shortcuts: single-key shortcuts (N, /, ?, G…, [, and screen keys like J/K/X/M) are on.
 * False until settings load. Screens with their own single-letter keys should check it too.
 */
export function useShortcutsEnabled(): boolean {
  return useLiveQuery(async () => (await getSettings()).shortcuts, [], false);
}
