"use client";

// The desktop library (LibraryDesk and its table) in its own chunk, so phones never download it.
// No Suspense: the screen keeps drawing DeskPlaceholder in place until the chunk is in, so the
// placeholder's skeleton timer carries on into the desk (MOTION-SPEC D4) instead of restarting.
import { useEffect, useState } from "react";
import { MEDIUM_QUERY } from "@/lib/use-media";
import type { LibraryDesk } from "./LibraryDesk";

type Desk = typeof LibraryDesk;

let loaded: Desk | null = null;
let loading: Promise<Desk> | null = null;

/** Loads the desk's chunk once; a failed load is tried again on the next call. */
export function loadLibraryDesk(): Promise<Desk> {
  loading ??= import("./LibraryDesk").then(
    (m) => (loaded = m.LibraryDesk),
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

// A wide screen will want the desk right after hydration: fetch it alongside the route's chunk.
if (typeof window !== "undefined" && window.matchMedia(MEDIUM_QUERY).matches) void loadLibraryDesk().catch(() => {});

const RETRY_MS = 1_000;

/** LibraryDesk once its chunk is in, while `wanted`; null before (draw the placeholder). */
export function useLibraryDesk(wanted: boolean): Desk | null {
  const [desk, setDesk] = useState<{ component: Desk } | null>(() => (loaded ? { component: loaded } : null));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!wanted || desk) return;
    let live = true;
    let retry: number | undefined;
    loadLibraryDesk().then(
      (component) => {
        if (live) setDesk({ component });
      },
      () => {
        if (live) retry = window.setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
      },
    );
    return () => {
      live = false;
      window.clearTimeout(retry);
    };
  }, [wanted, desk, attempt]);
  return wanted && desk ? desk.component : null;
}
