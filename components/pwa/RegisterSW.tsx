"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import { requestPersistentStorage } from "./persist";

/** Served by app/serwist/[path]/route.ts from app/sw.ts. */
export const SW_URL = "/serwist/sw.js";
/** Runtime cache of page HTML in app/sw.ts. */
const PAGES_CACHE = "pages";
/** Look for a new deploy at most this often while the app is in use. */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

const SW_ENABLED = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";

export interface RegisterSWProps {
  /** Default: on in production builds, or in dev with NEXT_PUBLIC_ENABLE_SW=1. */
  enabled?: boolean;
}

function useServiceWorker(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;
    let lastCheck = Date.now();

    const register = () => {
      navigator.serviceWorker
        .register(SW_URL, { scope: "/", type: "classic", updateViaCache: "none" })
        .then((reg) => {
          registration = reg;
        })
        .catch((error: unknown) => {
          console.error("Service worker registration failed", error);
        });
    };

    // A home-screen app can stay open for days: check for a new version when it comes back to the foreground.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !registration || !navigator.onLine) return;
      if (Date.now() - lastCheck < UPDATE_INTERVAL_MS) return;
      lastCheck = Date.now();
      registration.update().catch(() => {});
    };

    // Register after load so the worker's precaching doesn't compete with the first render.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("load", register);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}

/** Requests persistent storage on the first click or key press (a user gesture, which Firefox needs). */
function usePersistOnFirstInteraction() {
  useEffect(() => {
    const options = { capture: true, passive: true } as const;
    const remove = () => {
      window.removeEventListener("click", onInteract, options);
      window.removeEventListener("keydown", onInteract, options);
    };
    function onInteract() {
      remove();
      void requestPersistentStorage();
    }
    window.addEventListener("click", onInteract, options);
    window.addEventListener("keydown", onInteract, options);
    return remove;
  }, []);
}

/**
 * Client-side navigations fetch router payloads, not HTML, so a page reached only that way would be
 * missing offline. Ask the worker to cache its HTML once (it skips pages it already has).
 */
function CacheVisitedPage() {
  const pathname = usePathname();

  useEffect(() => {
    const controller = navigator.serviceWorker?.controller;
    if (!pathname || !controller || !navigator.onLine || typeof caches === "undefined") return;
    let cancelled = false;

    caches
      .match(pathname, { cacheName: PAGES_CACHE })
      .then((cached) => {
        if (cached || cancelled) return;
        controller.postMessage({
          type: "CACHE_URLS",
          payload: { urlsToCache: [[pathname, { headers: { Accept: "text/html" }, credentials: "same-origin" }]] },
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}

/**
 * Registers the service worker (offline support, Android share target), keeps visited pages
 * available offline and asks for persistent storage on the first interaction.
 * Renders nothing; mount once in the app shell.
 */
export function RegisterSW({ enabled = SW_ENABLED }: RegisterSWProps) {
  useServiceWorker(enabled);
  usePersistOnFirstInteraction();

  if (!enabled) return null;
  return (
    <Suspense fallback={null}>
      <CacheVisitedPage />
    </Suspense>
  );
}
