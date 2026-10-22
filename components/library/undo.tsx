"use client";

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { useSnackbar } from "@/components/ui/Snackbar";

// Undo snackbars of the desktop library: the screen keeps the latest «Отменить» so `Z` / `⌘Z` in
// the list region can run it (DESKTOP-SPEC §1.5, §4). Outside a provider (phone sheets) it is a
// plain snackbar with an action.

interface UndoEntry {
  run: () => void;
  hide: () => void;
}

interface UndoApi {
  set: (entry: UndoEntry | null) => void;
  current: () => UndoEntry | null;
}

const UndoContext = createContext<UndoApi | null>(null);

export interface UndoSnackbarOptions {
  message: ReactNode;
  undo: () => void;
  /** «Отменить» by default; «Вернуть» for discarded edits. */
  actionLabel?: string;
}

/** Shows an ink snackbar with an undo action; registers it for `Z` inside <UndoProvider>. */
export function useUndoSnackbar(): (options: UndoSnackbarOptions) => void {
  const snackbar = useSnackbar();
  const api = useContext(UndoContext);
  return useCallback(
    ({ message, undo, actionLabel = "Отменить" }: UndoSnackbarOptions) => {
      let done = false;
      const run = () => {
        if (done) return;
        done = true;
        undo();
      };
      let entry: UndoEntry | null = null;
      const id = snackbar.show({
        message,
        actionLabel,
        onAction: run,
        onHide: () => {
          if (api && api.current() === entry) api.set(null);
        },
      });
      entry = { run, hide: () => snackbar.hide(id) };
      api?.set(entry);
    },
    [snackbar, api],
  );
}

/** Runs the latest visible undo; false when there is nothing to undo. */
export function useUndoLast(): () => boolean {
  const api = useContext(UndoContext);
  return useCallback(() => {
    const entry = api?.current();
    if (!entry) return false;
    api!.set(null);
    entry.hide();
    entry.run();
    return true;
  }, [api]);
}

export function UndoProvider({ children }: { children: ReactNode }) {
  const last = useRef<UndoEntry | null>(null);
  const api = useMemo<UndoApi>(
    () => ({
      set: (entry) => {
        last.current = entry;
      },
      current: () => last.current,
    }),
    [],
  );
  return <UndoContext.Provider value={api}>{children}</UndoContext.Provider>;
}
