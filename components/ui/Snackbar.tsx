"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  className?: string;
}

/**
 * Ink bar, white text, underlined action. Presentational: place it in flow (review screen) or use
 * useSnackbar(). Phones: full column width, 48 tall. From 768 up (DESKTOP-SPEC §2): 44 tall, as
 * wide as its text up to 480, centred, padding 0 8 0 16, the action with its key cap.
 */
export function Snackbar({ message, actionLabel, onAction, actionKey, className }: SnackbarViewProps) {
  return (
    <div
      data-snackbar=""
      className={cx(
        "flex h-12 shrink-0 items-center justify-between gap-2 rounded-card bg-ink pr-1 pl-4 text-on-ink",
        "md:mx-auto md:h-11 md:w-fit md:max-w-[480px] md:gap-4 md:pr-2",
        className,
      )}
    >
      <span className="min-w-0 truncate text-[14px] leading-5 md:tabular-nums">{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          aria-keyshortcuts={actionKey}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-chip bg-transparent px-3 text-[14px] font-medium text-on-ink active:opacity-70 md:h-8 md:px-2 hoverable:bg-on-ink/10"
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

export function useSnackbar(): SnackbarApi {
  const api = useContext(SnackbarContext);
  if (!api) throw new Error("useSnackbar must be used inside <SnackbarProvider> (AppProviders)");
  return api;
}

/**
 * Hosts one snackbar fixed above the tab bar (uses --shell-bottom from the app shell; from 768 up
 * centred in the content area right of --shell-nav) and above
 * any registered page action bar (bottom-clearance.ts), or inside the open sheet (SnackbarSlot).
 * The timer pauses while the bar is touched, hovered or focused.
 */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [paused, setPaused] = useState(false);
  const current = useRef<Entry | null>(null);
  const nextId = useRef(1);

  const close = useCallback((reason: SnackbarHideReason, id?: number) => {
    const active = current.current;
    if (!active || (id !== undefined && active.id !== id)) return;
    current.current = null;
    setEntry(null);
    setPaused(false);
    active.onHide?.(reason);
  }, []);

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
    if (!entry || paused || duration <= 0) return;
    const timer = setTimeout(() => close("timeout", entry.id), duration);
    return () => clearTimeout(timer);
  }, [entry, paused, duration, close]);

  const api = useMemo(() => ({ show, hide }), [show, hide]);

  const [slots, setSlots] = useState<readonly HTMLElement[]>([]);
  const registerSlot = useCallback<RegisterSlot>((el) => {
    setSlots((list) => [...list.filter((s) => s !== el), el]);
    return () => setSlots((list) => list.filter((s) => s !== el));
  }, []);
  const slot = slots.at(-1) ?? null;

  const bar = entry && (
    <div
      key={entry.id}
      className="pointer-events-auto motion-safe:animate-[snackbar-in_160ms_ease-out]"
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
      />
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
      <style>{`@keyframes snackbar-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
    </SnackbarContext.Provider>
  );
}
