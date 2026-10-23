"use client";

// Copying a request for a Claude chat, and the last request copied («Ждём набор из чата»,
// «Последний запрос» offline). The last request is remembered per device in localStorage, since the
// user leaves for the Claude app and iOS may drop the page meanwhile; a set newer than the ones on
// the device when it was copied ends the wait (lib: `isWaiting`). No network call here.
import { useSyncExternalStore } from "react";
import { newestCreatedAt, type LastRequest } from "./list-format";

/** Where «Открыть Claude ↗» goes: a new chat. */
export const CLAUDE_NEW_CHAT_URL = "https://claude.ai/new";

const KEY = "kartochki.exercise-request";

/** Writes `text` to the clipboard (async API, else a hidden textarea). False when both fail. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied or not focused: try the old way below.
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  area.style.top = "0";
  area.style.left = "0";
  document.body.appendChild(area);
  const focused = document.activeElement as HTMLElement | null;
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    focused?.focus?.({ preventScroll: true });
  }
}

// --- The last request copied ------------------------------------------------------------------

let memory: LastRequest | null | undefined;
const listeners = new Set<() => void>();

function parse(raw: string | null): LastRequest | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LastRequest>;
    if (typeof v.text !== "string" || typeof v.summary !== "string" || typeof v.at !== "string") return null;
    return { text: v.text, summary: v.summary, at: v.at, newest: typeof v.newest === "string" ? v.newest : null };
  } catch {
    return null;
  }
}

export function getLastRequest(): LastRequest | null {
  if (memory === undefined) {
    try {
      memory = parse(localStorage.getItem(KEY));
    } catch {
      memory = null;
    }
  }
  return memory;
}

function setLastRequest(value: LastRequest | null): void {
  memory = value;
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: kept in memory only.
  }
  for (const l of listeners) l();
}

/** Forget the last request (tests, or when the user dismisses it). */
export function clearLastRequest(): void {
  setLastRequest(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    memory = parse(e.newValue);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The last copied request; null on the server and during hydration. */
export function useLastRequest(): LastRequest | null {
  return useSyncExternalStore(subscribe, getLastRequest, () => null);
}

/**
 * Copies a request and remembers it as the one we wait for. `sets`: the sets on the device now
 * (a newer one ends the wait). It is remembered even when the copy fails, so «Открыть Claude»
 * still shows the waiting line. Returns whether the text reached the clipboard.
 */
export async function copyRequest(
  request: { text: string; summary: string },
  sets: readonly { created_at: string }[],
  now: Date = new Date(),
): Promise<boolean> {
  setLastRequest({ text: request.text, summary: request.summary, at: now.toISOString(), newest: newestCreatedAt(sets) });
  return copyText(request.text);
}
