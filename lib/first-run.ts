"use client";

// First-run hints (synthesis §1.3 / §6): one per-device policy for every «explain it the first few
// times» text — the swipe legend, the Add helper, «Почему позже?», toggle captions. Each hint has a
// name and a counter of the sessions (or opens) it was shown in; it shows while the counter is under
// its limit (3 by default, «the first week»), then never again. Device-local on purpose: a hint is
// about this screen on this device, not about the account. Same tiny store over localStorage as
// components/review/filter.ts, with an in-memory copy when storage is blocked (private mode).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FIRST_RUN_KEY, FIRST_RUN_LIMIT } from "./first-run-init";

export { FIRST_RUN_KEY, FIRST_RUN_LIMIT };

type Counts = Record<string, number>;

let memory: Counts | undefined;
const listeners = new Set<() => void>();

function parse(raw: string | null): Counts {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Counts = {};
    for (const [k, v] of Object.entries(value)) if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

function read(): Counts {
  if (memory === undefined) {
    try {
      memory = parse(localStorage.getItem(FIRST_RUN_KEY));
    } catch {
      memory = {};
    }
  }
  return memory;
}

function write(next: Counts): void {
  memory = next;
  try {
    localStorage.setItem(FIRST_RUN_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the counts live in memory until reload.
  }
  for (const listener of listeners) listener();
}

/** Sessions/opens the hint was already shown in on this device; 0 on the server. */
export function firstRunCount(name: string): number {
  if (typeof window === "undefined") return 0;
  return read()[name] ?? 0;
}

/** True while the hint is still within its first `limit` sessions. */
export function isFirstRun(name: string, limit = FIRST_RUN_LIMIT): boolean {
  return firstRunCount(name) < limit;
}

/** Counts one more session/open of the hint. */
export function bumpFirstRun(name: string): void {
  if (typeof window === "undefined") return;
  const counts = read();
  write({ ...counts, [name]: (counts[name] ?? 0) + 1 });
}

/** «Понятно»: never show the hint again on this device. */
export function retireFirstRun(name: string, limit = FIRST_RUN_LIMIT): void {
  if (typeof window === "undefined") return;
  const counts = read();
  if ((counts[name] ?? 0) >= limit) return;
  write({ ...counts, [name]: limit });
}

/** Tests only (and a «show hints again» setting, should one appear). */
export function resetFirstRun(name?: string): void {
  if (name === undefined) {
    write({});
    return;
  }
  const rest = { ...read() };
  delete rest[name];
  write(rest);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== FIRST_RUN_KEY) return;
    memory = parse(event.newValue);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const noop = () => () => {};
const onClient = () => true;
const onServer = () => false;

export interface FirstRunHintOptions {
  /** Sessions/opens to show it for. Default 3. */
  limit?: number;
  /**
   * Count this mount as one session/open (once, also under StrictMode). Default true. Pass false
   * and call `markSeen()` yourself when the hint only counts on an event (the first card shown).
   */
  countOnMount?: boolean;
}

export interface FirstRunHint {
  /**
   * Show the hint. Decided once per mount from the count it started with, so counting this session
   * does not hide it mid-session. False on the server and during hydration (no flash for the users
   * past their first week).
   */
  show: boolean;
  /**
   * True on the server and during hydration, while `show` is not decided yet. A hint that takes
   * layout space renders it then too, marked `data-first-run="<name>"`: FIRST_RUN_INIT_SCRIPT and
   * globals.css hide it before first paint on devices past the hint, so nothing shifts either way.
   */
  pending: boolean;
  /** Counts this mount as one session/open; later calls in the same mount are ignored. */
  markSeen: () => void;
  /** Hides it now and for good on this device. */
  dismiss: () => void;
}

/**
 * The one first-run API: `const legend = useFirstRunHint("swipe-legend"); {legend.show && …}`.
 * Names in use should be listed by their callers' comments; keep them short and kebab-case.
 */
export function useFirstRunHint(name: string, { limit = FIRST_RUN_LIMIT, countOnMount = true }: FirstRunHintOptions = {}): FirstRunHint {
  const client = useSyncExternalStore(noop, onClient, onServer);
  // The count at mount (read on the client only); the live count only matters for dismissals.
  const [startCount] = useState(() => (typeof window === "undefined" ? null : firstRunCount(name)));
  const live = useSyncExternalStore(
    subscribe,
    () => firstRunCount(name),
    () => 0,
  );
  const [dismissed, setDismissed] = useState(false);
  const counted = useRef(false);

  const markSeen = () => {
    if (counted.current) return;
    counted.current = true;
    bumpFirstRun(name);
  };

  useEffect(() => {
    if (!countOnMount || counted.current) return;
    counted.current = true;
    bumpFirstRun(name);
  }, [countOnMount, name]);

  const start = startCount ?? live;
  // Retired elsewhere (another tab, another instance) while mounted: the live count jumps to the limit.
  const retired = live >= limit && live > start + 1;
  return {
    show: client && !dismissed && !retired && start < limit,
    pending: !client,
    markSeen,
    dismiss: () => {
      setDismissed(true);
      retireFirstRun(name, limit);
    },
  };
}
