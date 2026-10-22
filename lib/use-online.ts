"use client";

import { useSyncExternalStore } from "react";

// Network state for AI entry points (MOTION-SPEC B4): offline is decided before a wait, so a
// screen that needs the network says «Нужна сеть» up front instead of failing after a timeout.

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** True unless the browser reports no network; true on the server and during hydration. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine !== false,
    () => true,
  );
}
