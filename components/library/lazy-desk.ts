"use client";

// The desktop library (LibraryDesk and its table) in its own chunk, so phones never parse it.
// No Suspense: the screen keeps drawing DeskPlaceholder in place until the chunk is in, so the
// placeholder's skeleton timer carries on into the desk (MOTION-SPEC D4) instead of restarting.
import { useEffect, useState } from "react";
import { loadChunk } from "@/lib/chunk-load";
import { MEDIUM_QUERY } from "@/lib/use-media";
import type { LibraryDesk } from "./LibraryDesk";

type Desk = typeof LibraryDesk;

let loaded: Desk | null = null;
let loading: Promise<Desk> | null = null;

/** Loads the desk's chunk once (see lib/chunk-load); a failed load is tried again on the next call. */
export function loadLibraryDesk(): Promise<Desk> {
  loading ??= loadChunk(() => import("./LibraryDesk")).then(
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

/** LibraryDesk once its chunk is in, while `wanted`; null before (draw the placeholder). */
export function useLibraryDesk(wanted: boolean): Desk | null {
  const [desk, setDesk] = useState<{ component: Desk } | null>(() => (loaded ? { component: loaded } : null));
  const [failure, setFailure] = useState<{ error: unknown } | null>(null);
  useEffect(() => {
    if (!wanted || desk) return;
    let live = true;
    loadLibraryDesk().then(
      (component) => {
        if (live) setDesk({ component });
      },
      (error: unknown) => {
        if (live) setFailure({ error });
      },
    );
    return () => {
      live = false;
    };
  }, [wanted, desk]);
  // Retried and reloaded already (loadChunk): hand it to the error boundary.
  if (failure) throw failure.error;
  return wanted && desk ? desk.component : null;
}
