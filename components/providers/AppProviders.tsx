"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QuickAddSheet } from "@/components/add/QuickAddSheet";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { seedIfNeeded } from "@/lib/seed";
import { startSyncLoop } from "@/lib/sync";
import { AddSheetProvider } from "./AddSheetContext";
import { ThemeSync } from "./theme";

export { useAddSheet, type AddSheetApi, type AddSheetInitial } from "./AddSheetContext";

interface Boot {
  /** First-run setup has finished (or failed) on this device. */
  ready: boolean;
  /** It failed: the library shows «Не удалось подготовить базу» with «Повторить» (B1). */
  failed: boolean;
  /** Runs the setup again; resolves once it has finished either way. */
  retry: () => Promise<void>;
}

const BootContext = createContext<Boot>({ ready: false, failed: false, retry: async () => {} });

/** True once first-run setup (default folders, prototype words) has finished on this device. */
export function useAppReady(): boolean {
  return useContext(BootContext).ready;
}

/** Whether first-run setup failed, and a retry for the notice that says so. */
export function useBootFailure(): Pick<Boot, "failed" | "retry"> {
  const { failed, retry } = useContext(BootContext);
  return { failed, retry };
}

/** Seeds the local database on first run, then starts background sync. */
function useBootstrap(): Boot {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    let stopSync: (() => void) | null = null;
    seedIfNeeded()
      .catch((error: unknown) => {
        console.error("First-run database setup failed", error);
        if (active.current) setFailed(true);
      })
      .finally(() => {
        if (!active.current) return;
        setReady(true);
        stopSync = startSyncLoop();
      });
    return () => {
      active.current = false;
      stopSync?.();
    };
  }, []);

  const retry = useCallback(async () => {
    try {
      await seedIfNeeded();
      if (active.current) setFailed(false);
    } catch (error: unknown) {
      console.error("First-run database setup failed again", error);
    }
  }, []);

  return useMemo(() => ({ ready, failed, retry }), [ready, failed, retry]);
}

/**
 * Client providers for the app shell: theme from settings, db seed + sync loop,
 * snackbar host and the quick-add sheet (opened with useAddSheet().open()).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const boot = useBootstrap();
  return (
    <BootContext.Provider value={boot}>
      <SnackbarProvider>
        <AddSheetProvider>
          <ThemeSync />
          {children}
          <QuickAddSheet />
        </AddSheetProvider>
      </SnackbarProvider>
    </BootContext.Provider>
  );
}
