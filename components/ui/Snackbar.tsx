"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { thresholdNotifier } from "@/lib/haptics";
import { exitMs, prefersReducedMotion } from "@/lib/motion";
import { floatingBottom } from "./bottom-clearance";
import { Kbd } from "./Kbd";
import { cx } from "./cx";

export interface SnackbarViewProps {
  message: ReactNode;
  /** «Отменить» */
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Key that runs the action, printed as an on-ink cap after the label from 768 up («Отменить» +
   * `Z`). Only pass it when the screen really binds that key.
   */
  actionKey?: string;
  /** A copy on its way out (snackbar-out): no `data-snackbar` hook, so tests and sheets see only the live bar. */
  ghost?: boolean;
  /**
   * Swiped away (left, right or down): called once the bar has left. Without it the bar does not
   * follow the finger.
   */
  onDismiss?: () => void;
  className?: string;
}

/** Movement before a press becomes a drag (px). */
const SLOP = 8;
/** A release faster than this (px/ms) throws the bar out whatever the distance. */
const FLICK = 0.5;
/** Share of the bar's width a sideways drag has to cover. */
const SWIPE_SHARE = 0.35;
/** Downward drag that dismisses (px). */
const SWIPE_DOWN = 24;

export type SnackbarSwipe = "left" | "right" | "down" | "stay";

/** Where a released drag sends the bar: out sideways or down, or back into place. */
export function snackbarSwipeOutcome(dx: number, dy: number, vx: number, vy: number, width: number): SnackbarSwipe {
  if (Math.abs(dx) >= Math.abs(dy)) {
    // A flick decides by its direction; a slow drag by how far it went.
    if (Math.abs(vx) > FLICK) return vx < 0 ? "left" : "right";
    if (Math.abs(dx) > width * SWIPE_SHARE) return dx < 0 ? "left" : "right";
    return "stay";
  }
  return dy > SWIPE_DOWN || vy > FLICK ? "down" : "stay";
}

interface SwipeGesture {
  id: number;
  x: number;
  y: number;
  dragging: boolean;
  width: number;
  t: number;
  lx: number;
  ly: number;
  vx: number;
  vy: number;
}

/**
 * The bar follows a finger sideways (1:1, fading with distance) or down (up only with ¼ resistance)
 * and, past the threshold, leaves that way in --dur-exit before `onDismiss`. A tap that does not
 * move stays a tap on the action. Reduced motion: no travel, the bar just goes.
 */
function useSnackbarSwipe(onDismiss: (() => void) | undefined) {
  const gesture = useRef<SwipeGesture | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; width: number } | null>(null);
  const [gone, setGone] = useState<Exclude<SnackbarSwipe, "stay"> | null>(null);
  const tick = useRef(thresholdNotifier());
  const goneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => () => {
    if (goneTimer.current) clearTimeout(goneTimer.current);
  }, []);

  if (!onDismiss) return { style: undefined, handlers: undefined };

  const leave = (way: Exclude<SnackbarSwipe, "stay">) => {
    tick.current.reset();
    if (prefersReducedMotion()) {
      onDismiss();
      return;
    }
    setGone(way);
    goneTimer.current = setTimeout(onDismiss, exitMs());
  };

  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || gone) return;
      gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false, width: e.currentTarget.offsetWidth, t: e.timeStamp, lx: e.clientX, ly: e.clientY, vx: 0, vy: 0 };
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.dragging) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        g.dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      const dt = e.timeStamp - g.t;
      if (dt > 0) {
        g.vx = 0.8 * ((e.clientX - g.lx) / dt) + 0.2 * g.vx;
        g.vy = 0.8 * ((e.clientY - g.ly) / dt) + 0.2 * g.vy;
      }
      g.t = e.timeStamp;
      g.lx = e.clientX;
      g.ly = e.clientY;
      const sideways = Math.abs(dx) >= Math.abs(dy);
      setDrag(sideways ? { x: dx, y: 0, width: g.width } : { x: 0, y: dy > 0 ? dy : dy / 4, width: g.width });
      tick.current.update(snackbarSwipeOutcome(dx, dy, 0, 0, g.width) !== "stay", true);
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => finish(e, false),
    onPointerCancel: (e: PointerEvent<HTMLDivElement>) => finish(e, true),
    // A drag that ends over the action is not a tap on it.
    onClickCapture: (e: { preventDefault(): void; stopPropagation(): void }) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  function finish(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    tick.current.reset();
    if (!g.dragging) return;
    suppressClick.current = true;
    const fresh = e.timeStamp - g.t < 100;
    const way = cancelled ? "stay" : snackbarSwipeOutcome(e.clientX - g.x, e.clientY - g.y, fresh ? g.vx : 0, fresh ? g.vy : 0, g.width);
    setDrag(null);
    if (way !== "stay") leave(way);
  }

  let style: CSSProperties | undefined;
  if (gone) {
    style = {
      translate: gone === "down" ? "0 120%" : `${gone === "left" ? "-" : ""}110% 0`,
      opacity: 0,
      transition: "translate var(--dur-exit) var(--ease-exit), opacity var(--dur-exit) var(--ease-exit)",
    };
  } else if (drag) {
    style = {
      translate: prefersReducedMotion() ? undefined : `${drag.x}px ${drag.y}px`,
      opacity: drag.x ? Math.max(0.2, 1 - Math.abs(drag.x) / Math.max(1, drag.width)) : 1,
      transition: "none",
    };
  } else {
    style = { transition: "translate var(--dur-move) var(--ease-standard), opacity var(--dur-move) var(--ease-standard)" };
  }
  return { style: { ...style, touchAction: "none" } as CSSProperties, handlers };
}

/**
 * Ink bar, white text, underlined action. Presentational: place it in flow (review screen) or use
 * useSnackbar(). Phones: full column width, 48 tall. From 768 up (DESKTOP-SPEC §2): 44 tall, as
 * wide as its text up to 480, centred, padding 0 8 0 16, the action with its key cap.
 */
export function Snackbar({ message, actionLabel, onAction, actionKey, ghost = false, onDismiss, className }: SnackbarViewProps) {
  const swipe = useSnackbarSwipe(ghost ? undefined : onDismiss);
  return (
    <div
      data-snackbar={ghost ? undefined : ""}
      style={swipe.style}
      {...swipe.handlers}
      className={cx(
        // Phones: a long message wraps to a second line instead of being cut.
        "flex min-h-12 shrink-0 items-center justify-between gap-2 rounded-card bg-ink py-1.5 pr-1 pl-4 text-on-ink select-none",
        "md:mx-auto md:h-11 md:min-h-0 md:w-fit md:max-w-[480px] md:gap-4 md:py-0 md:pr-2",
        className,
      )}
    >
      <span className="line-clamp-2 min-w-0 text-[14px] leading-5 break-words md:block md:truncate md:tabular-nums">{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          aria-keyshortcuts={actionKey}
          className="hover-fade inline-flex h-11 shrink-0 items-center gap-2 rounded-chip bg-transparent px-3 text-[14px] font-medium text-on-ink active:opacity-70 md:h-8 md:px-2 hoverable:bg-on-ink/10"
        >
          <span className="underline decoration-1 underline-offset-[3px]">{actionLabel}</span>
          {actionKey && (
            <Kbd tone="ink" aria-hidden="true" className="max-md:hidden">
              {actionKey}
            </Kbd>
          )}
        </button>
      )}
    </div>
  );
}

export type SnackbarHideReason = "action" | "timeout" | "replaced" | "dismissed";

export interface SnackbarOptions {
  message: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** Key that runs the action, shown as a cap from 768 up (the caller binds it). */
  actionKey?: string;
  /** ms before auto-hide; 0 keeps it until hidden. Default 5000, 7000 with an action. */
  duration?: number;
  onHide?: (reason: SnackbarHideReason) => void;
}

interface Entry extends SnackbarOptions {
  id: number;
}

export interface SnackbarApi {
  /** Shows a snackbar (replacing the current one) and returns its id. */
  show: (options: SnackbarOptions) => number;
  /** Hides the given snackbar, or the current one. */
  hide: (id?: number) => void;
}

const SnackbarContext = createContext<SnackbarApi | null>(null);

type RegisterSlot = (el: HTMLElement) => () => void;
const SlotContext = createContext<RegisterSlot | null>(null);

/**
 * Where the app snackbar renders while a modal sheet is open. A modal sheet traps focus and
 * hides the rest of the page from assistive tech, so a snackbar outside it (e.g. «Прогресс
 * сброшен · Отменить» from Word detail) could not be reached; Sheet places one of these slots
 * above its footer, and the newest active slot hosts the snackbar.
 */
export function SnackbarSlot({ active = true, className }: { active?: boolean; className?: string }) {
  const register = useContext(SlotContext);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!register || !el || !active) return;
    return register(el);
  }, [register, el, active]);
  return <div ref={setEl} role="status" aria-live="polite" className={cx("pointer-events-none", className)} />;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

/** True while the page is in the background (another app, a locked phone): snackbar timers stop then. */
export function usePageHidden(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "hidden",
    () => false,
  );
}

/**
 * Bars on their way out, each dropped after --dur-exit. `leave(entry)` starts one; render them
 * with <LeavingSnackbars>.
 */
export function useLeavingSnackbars<T extends { id: number }>() {
  const [leaving, setLeaving] = useState<readonly T[]>([]);
  const timers = useRef(new Set<number>());
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);
  const leave = useCallback((entry: T) => {
    setLeaving((list) => [...list.filter((e) => e.id !== entry.id), entry]);
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setLeaving((list) => list.filter((e) => e.id !== entry.id));
    }, exitMs());
    timers.current.add(timer);
  }, []);
  return { leaving, leave };
}

/**
 * The outgoing copies (MOTION-SPEC §5.6: fade + 8px down over --dur-exit, inert, hidden from
 * assistive tech). While a new bar is in, they lie over it at the same place (`overlap`; the
 * parent is `relative flow-root`), so the replacement does not move; alone they keep their place
 * in the flow until they are gone.
 */
export function LeavingSnackbars({
  leaving,
  overlap,
  className,
}: {
  leaving: readonly (SnackbarViewProps & { id: number })[];
  overlap: boolean;
  className?: string;
}) {
  return leaving.map((e) => (
    <div key={e.id} aria-hidden="true" inert className={cx("snackbar-out", overlap && "absolute inset-x-0 bottom-0", className)}>
      <Snackbar ghost message={e.message} actionLabel={e.actionLabel} actionKey={e.actionKey} onAction={e.onAction} />
    </div>
  ));
}

export function useSnackbar(): SnackbarApi {
  const api = useContext(SnackbarContext);
  if (!api) throw new Error("useSnackbar must be used inside <SnackbarProvider> (AppProviders)");
  return api;
}

/**
 * Hosts one snackbar fixed above the tab bar (uses --shell-bottom from the app shell; from 768 up
 * centred in the content area right of --shell-nav) and above
 * any registered page action bar (bottom-clearance.ts), or inside the open sheet (SnackbarSlot).
 * The timer pauses while the bar is touched, hovered or focused, and while the page is hidden.
 * Motion (N2): in --dur-enter with an 8px rise, out --dur-exit 8px down; a replacement enters while
 * the old bar leaves. Not a `popover`: inside a sheet the bar has to stay in the sheet's focus trap.
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [paused, setPaused] = useState(false);
  const hidden = usePageHidden();
  const { leaving, leave } = useLeavingSnackbars<Entry>();
  const current = useRef<Entry | null>(null);
  const nextId = useRef(1);

  const close = useCallback(
    (reason: SnackbarHideReason, id?: number, swiped = false) => {
      const active = current.current;
      if (!active || (id !== undefined && active.id !== id)) return;
      current.current = null;
      setEntry(null);
      setPaused(false);
      // A swiped bar has already left the screen: no outgoing copy at its old place.
      if (!swiped) leave(active);
      active.onHide?.(reason);
    },
    [leave],
  );

  const show = useCallback(
    (options: SnackbarOptions) => {
      close("replaced");
      const next: Entry = { ...options, id: nextId.current++ };
      current.current = next;
      setEntry(next);
      return next.id;
    },
    [close],
  );

  const hide = useCallback((id?: number) => close("dismissed", id), [close]);

  const duration = entry ? (entry.duration ?? (entry.actionLabel ? 7000 : 5000)) : 0;
  useEffect(() => {
    // Back from the background, the bar gets its full time again.
    if (!entry || paused || hidden || duration <= 0) return;
    const timer = setTimeout(() => close("timeout", entry.id), duration);
    return () => clearTimeout(timer);
  }, [entry, paused, hidden, duration, close]);

  const api = useMemo(() => ({ show, hide }), [show, hide]);

  const [slots, setSlots] = useState<readonly HTMLElement[]>([]);
  const registerSlot = useCallback<RegisterSlot>((el) => {
    setSlots((list) => [...list.filter((s) => s !== el), el]);
    return () => setSlots((list) => list.filter((s) => s !== el));
  }, []);
  const slot = slots.at(-1) ?? null;

  const live = entry && (
    <div
      key={entry.id}
      className="snackbar-in pointer-events-auto"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Snackbar
        message={entry.message}
        actionLabel={entry.actionLabel}
        actionKey={entry.actionKey}
        onAction={
          entry.onAction
            ? () => {
                const action = entry.onAction;
                close("action", entry.id);
                action?.();
              }
            : undefined
        }
        onDismiss={() => close("dismissed", entry.id, true)}
      />
    </div>
  );
  const bar = (live || leaving.length > 0) && (
    <div className="relative flow-root">
      <LeavingSnackbars leaving={leaving} overlap={!!live} />
      {live}
    </div>
  );

  return (
    <SnackbarContext.Provider value={api}>
      <SlotContext.Provider value={registerSlot}>
        {children}
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 z-[60] mx-auto w-full max-w-[440px] px-4 md:left-(--shell-nav) md:max-w-[512px]"
          style={{ bottom: floatingBottom("calc(var(--shell-bottom, env(safe-area-inset-bottom)) + 16px)") }}
        >
          {!slot && bar}
        </div>
        {slot && bar && createPortal(bar, slot)}
      </SlotContext.Provider>
    </SnackbarContext.Provider>
  );
}
