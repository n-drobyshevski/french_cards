"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/** «Проверяем…» holds at least this long once shown (--loading-min), so a quick failure never blinks. */
const CHECK_MIN_MS = 500;

/**
 * Whether the network answers now: a HEAD for this page that skips the HTTP cache. The service
 * worker only handles GETs, so it goes to the network; any answer (even a 404) means it is back.
 */
async function reachable(): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    await fetch(window.location.href, { method: "HEAD", cache: "no-store" });
    return true;
  } catch {
    return false;
  }
}

/**
 * The offline page's actions (B3): «Повторить» checks the network first («Проверяем…», at least
 * 500 ms, width-locked) and reloads only when it answers, so a tap offline is not a blank reload.
 * When the browser reports the network back (`online`), it checks and reloads by itself; the muted
 * status under the actions says so. `children`: the secondary action between the two.
 */
export function OfflineRetry({ children }: { children?: ReactNode }) {
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);

  const retry = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    const started = performance.now();
    if (await reachable()) {
      // «Проверяем…» stays up while the page reloads.
      window.location.reload();
      return;
    }
    const left = CHECK_MIN_MS - (performance.now() - started);
    if (left > 0) await new Promise((resolve) => window.setTimeout(resolve, left));
    busy.current = false;
    setChecking(false);
  }, []);

  useEffect(() => {
    const onOnline = () => void retry();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [retry]);

  return (
    <>
      <Button block pending={checking} pendingLabel="Проверяем…" pendingDelay={0} onClick={() => void retry()}>
        Повторить
      </Button>
      {children}
      <p role="status" className="m-0 mt-2 text-[13px] leading-5 text-muted">
        Ждём сеть · откроем сами, когда она вернётся
      </p>
    </>
  );
}
