"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { QuickAddSheet } from "@/components/add/QuickAddSheet";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { seedIfNeeded } from "@/lib/seed";
import { startSyncLoop } from "@/lib/sync";
import { AddSheetProvider } from "./AddSheetContext";
import { ThemeSync } from "./theme";

export { useAddSheet, type AddSheetApi, type AddSheetInitial } from "./AddSheetContext";

const AppReadyContext = createContext(false);

/** True once first-run setup (default folders, prototype words) has finished on this device. */
export function useAppReady(): boolean {
  return useContext(AppReadyContext);
}

/** Seeds the local database on first run, then starts background sync. */
function useBootstrap(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let stopSync: (() => void) | null = null;

    seedIfNeeded()
      .catch((error: unknown) => {
        console.error("First-run database setup failed", error);
      })
      .finally(() => {
        if (!active) return;
        setReady(true);
        stopSync = startSyncLoop();
      });

    return () => {
      active = false;
      stopSync?.();
    };
  }, []);

  return ready;
}

/**
 * Client providers for the app shell: theme from settings, db seed + sync loop,
 * snackbar host and the quick-add sheet (opened with useAddSheet().open()).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const ready = useBootstrap();
  return (
    <AppReadyContext.Provider value={ready}>
      <SnackbarProvider>
        <AddSheetProvider>
          <ThemeSync />
          {children}
          <QuickAddSheet />
        </AddSheetProvider>
      </SnackbarProvider>
    </AppReadyContext.Provider>
  );
}
