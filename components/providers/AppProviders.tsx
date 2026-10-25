"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { loadChunk } from "@/lib/chunk-load";
import { scheduleProgressDays } from "@/lib/progress";
import { seedIfNeeded } from "@/lib/seed";
import { startSyncLoop } from "@/lib/sync";
import { AddSheetProvider } from "./AddSheetContext";
import { ThemeSync } from "./theme";

export {
  useAddSheet,
  useAddSheetActions,
  useAddSheetState,
  type AddSheetActions,
  type AddSheetApi,
  type AddSheetInitial,
  type AddSheetState,
} from "./AddSheetContext";

// The whole add flow is its own chunk, kept out of the shell that every route parses before hydrating.
const QuickAddSheet = dynamic(() => loadChunk(() => import("@/components/add/QuickAddSheet")).then((m) => m.QuickAddSheet), {
  ssr: false,
});

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
    let stopProgress: (() => void) | null = null;
    seedIfNeeded()
      .catch((error: unknown) => {
        console.error("First-run database setup failed", error);
        if (active.current) setFailed(true);
      })
      .finally(() => {
        if (!active.current) return;
        setReady(true);
        stopSync = startSyncLoop();
        // «Прогресс»: store the finished study days (never rejects; sync pulls do it too).
        stopProgress = scheduleProgressDays();
      });
    return () => {
      active.current = false;
      stopSync?.();
      stopProgress?.();
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

/** Runs `run` when the browser is next idle (a timer where requestIdleCallback is missing, as on Safari). */
function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run);
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 1000);
  return () => window.clearTimeout(id);
}

/**
 * The quick-add sheet's chunk stays out of the shell every route parses before hydrating, but the
 * closed sheet mounts right after hydration, so it is in place before «+» can be pressed and the
 * open (and its focus, which iOS only honours inside the tap) stays synchronous. Until the first
 * open the sheet runs no queries (QuickAddSheet mounts its session then). The dictionary is
 * warmed when the browser is idle, so its parse never lands in the sheet's slide.
 */
function LazyQuickAddSheet() {
  useEffect(() => whenIdle(() => void import("@/lib/lexique").then((m) => m.loadLexique()).catch(() => {})), []);
  // ssr: false, so the chunk is requested at hydration and the sheet mounts as soon as it is in.
  return <QuickAddSheet />;
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
          <LazyQuickAddSheet />
        </AddSheetProvider>
      </SnackbarProvider>
    </BootContext.Provider>
  );
}
