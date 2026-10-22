"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { exitMs, sheetCloseMs } from "@/lib/motion";
import { useLayoutClass } from "@/lib/use-media";
import { IconButton } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icons";
import { SnackbarSlot } from "./Snackbar";

interface ViewportBox {
  /** Space the on-screen keyboard (or anything else) covers at the bottom of the layout viewport. */
  keyboard: number;
  /** Visible height. */
  height: number;
}

/**
 * Tracks window.visualViewport so fixed bottom UI can sit above the iOS keyboard.
 * Returns null on the server, without visualViewport, or while inactive.
 */
export function useVisualViewport(active = true): ViewportBox | null {
  const [box, setBox] = useState<ViewportBox | null>(null);

  useEffect(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!active || !vv) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const keyboard = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        const height = Math.round(vv.height);
        setBox((prev) => (prev && prev.keyboard === keyboard && prev.height === height ? prev : { keyboard, height }));
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);

  return active ? box : null;
}

/**
 * Calls `onClosed` once `open` has been false for `ms()` (the close animation), whoever closed it:
 * a drag, the scrim, Esc or the caller. Reopening first cancels it.
 */
function useAfterClose(open: boolean, onClosed: (() => void) | undefined, ms: () => number) {
  const callback = useRef(onClosed);
  useEffect(() => {
    callback.current = onClosed;
  });
  const wasOpen = useRef(open);
  useEffect(() => {
    const closing = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closing) return;
    const timer = window.setTimeout(() => callback.current?.(), ms());
    return () => window.clearTimeout(timer);
  }, [open, ms]);
}

/** Keyboard heights under this are browser chrome jitter, not a keyboard. */
export const KEYBOARD_MIN = 40;
/** Gap kept above a full-height sheet (mockups: sheet top at 56px). */
const TOP_GAP = 56;

export type SheetHeight = "auto" | "large" | "full";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible title, rendered visually hidden. Omit it only if children render <SheetTitle>. */
  title?: string;
  /** Accessible description, visually hidden. */
  description?: string;
  /**
   * auto: as tall as the content (up to full). large: ~78% of the screen (quick-add).
   * full: top edge 56px below the safe area (word detail, sort plan).
   */
  height?: SheetHeight;
  /** Pinned above the scrolling body (dialog chrome: <DialogChrome>). */
  header?: ReactNode;
  /** Pinned under the scrolling body (sticky actions); stays above the keyboard. */
  footer?: ReactNode;
  /** When false, drag/scrim/Escape do not close it. */
  dismissible?: boolean;
  /** For a sheet opened from inside another sheet. */
  nested?: boolean;
  /**
   * Called after the close animation finishes, however the sheet was closed (reset form state
   * here): sheetCloseMs() on phones, exitMs() for the desktop dialog.
   */
  onClosed?: () => void;
  /** Radix auto-focus on open; call event.preventDefault() to keep focus where it is. */
  onOpenAutoFocus?: (event: Event) => void;
  /**
   * Dialog width in px from 768 up (DESKTOP-SPEC §2): 560 by default; add 640, sort plan 760,
   * shortcuts 800, theme form 440. Never wider than the window − 48.
   */
  dialogWidth?: number;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

/**
 * Bottom sheet on phones (< 768), centred dialog from 768 up (DESKTOP-SPEC §3 dialog token).
 * Same props either way; see DrawerSheet and DialogSheet.
 */
export function Sheet(props: SheetProps) {
  const layout = useLayoutClass();
  return layout === "compact" ? <DrawerSheet {...props} /> : <DialogSheet {...props} />;
}

/**
 * Bottom sheet on vaul's Drawer: handle, 12px top radius, 1px ink top rule, scrim var(--scrim).
 * The body scrolls; the sheet follows the visual viewport so inputs stay above the keyboard.
 * Motion (A1): opens in --dur-sheet on --spring-settle, closes in --dur-enter (globals.css); a fade
 * of --dur-quick under reduced motion.
 */
function DrawerSheet({
  open,
  onOpenChange,
  title,
  description,
  height = "auto",
  header,
  footer,
  dismissible = true,
  nested = false,
  onClosed,
  onOpenAutoFocus,
  className,
  bodyClassName,
  children,
}: SheetProps) {
  const viewport = useVisualViewport(open);
  const keyboard = viewport && viewport.keyboard >= KEYBOARD_MIN ? viewport.keyboard : 0;
  const visible = viewport ? `${viewport.height}px` : "100dvh";
  const maxHeight = `calc(${visible} - ${TOP_GAP}px - ${keyboard ? "0px" : "var(--safe-top)"})`;
  const sizeStyle =
    height === "full"
      ? { height: maxHeight }
      : height === "large"
        ? { height: `min(calc(${visible} * 0.78), ${maxHeight})` }
        : { maxHeight };

  const Root = nested ? Drawer.NestedRoot : Drawer.Root;
  // Not vaul's onAnimationEnd: that one waits a fixed 500ms and misses closes made by the caller.
  useAfterClose(open, onClosed, sheetCloseMs);

  return (
    <Root open={open} onOpenChange={onOpenChange} dismissible={dismissible} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-(--scrim)" />
        <Drawer.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={onOpenAutoFocus}
          onPointerDownOutside={(event) => {
            // Taps on the snackbar (e.g. «Отменить») must not dismiss the sheet.
            const target = event.target as Element | null;
            if (target?.closest?.("[data-snackbar]")) event.preventDefault();
          }}
          style={{ ...sizeStyle, bottom: keyboard }}
          className={cx(
            "fixed inset-x-0 z-50 mx-auto flex w-full max-w-[440px] flex-col rounded-t-[12px] border-t border-ink bg-surface text-ink outline-none",
            className,
          )}
        >
          <div aria-hidden="true" className="mx-auto mt-[7px] h-1 w-9 shrink-0 rounded-[2px] bg-rule" />
          {title && <Drawer.Title className="sr-only">{title}</Drawer.Title>}
          {description && <Drawer.Description className="sr-only">{description}</Drawer.Description>}
          {header && <div className="shrink-0">{header}</div>}
          <div
            className={cx(
              "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain",
              !footer && !keyboard && "pb-[env(safe-area-inset-bottom)]",
              bodyClassName,
            )}
          >
            {children}
          </div>
          <div className="relative z-10 h-0 shrink-0">
            <SnackbarSlot
              active={open}
              className={cx(
                "absolute inset-x-4",
                footer || keyboard ? "bottom-2" : "bottom-[max(16px,env(safe-area-inset-bottom))]",
              )}
            />
          </div>
          {footer && (
            <div
              className={cx(
                "shrink-0 border-t border-rule bg-surface px-4 pt-4",
                keyboard ? "pb-4" : "pb-[max(16px,env(safe-area-inset-bottom))]",
              )}
            >
              {footer}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Root>
  );
}

/** Dialogs below the 40px top gap (tall: add, sort plan, shortcuts) vs. max(24px, 10vh). */
const DIALOG_TOP: Record<SheetHeight, string> = { auto: "max(24px, 10vh)", large: "40px", full: "40px" };

/**
 * Centred dialog on Radix Dialog for 768 and up: white, 1px hairline, radius 8, no shadow, scrim
 * var(--scrim-desk) over the whole window. Top max(24px, 10vh) (40 for large/full), max-height to
 * 40px above the window bottom; `full` takes all of it. Header and footer stay pinned, the body
 * scrolls (12px top padding when there is no header). Nested dialogs stack; `dismissible={false}` ignores Esc and outside clicks.
 * Motion (D5): in opacity + 8px rise over --dur-enter, out opacity + 4px down over --dur-exit; the
 * scrim fades the same (`dialog-panel` / `dialog-scrim` in globals.css).
 */
function DialogSheet({
  open,
  onOpenChange,
  title,
  description,
  height = "auto",
  header,
  footer,
  dismissible = true,
  onClosed,
  onOpenAutoFocus,
  dialogWidth = 560,
  className,
  bodyClassName,
  children,
}: SheetProps) {
  useAfterClose(open, onClosed, exitMs);

  const top = DIALOG_TOP[height];
  const maxHeight = `calc(100dvh - ${top} - 40px)`;
  const keepOpen = (event: Event) => {
    if (!dismissible) event.preventDefault();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-scrim fixed inset-0 z-40 bg-(--scrim-desk)" />
        <Dialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={onOpenAutoFocus}
          onEscapeKeyDown={keepOpen}
          onPointerDownOutside={(event) => {
            const target = event.target as Element | null;
            if (target?.closest?.("[data-snackbar]")) event.preventDefault();
            else keepOpen(event);
          }}
          onInteractOutside={keepOpen}
          style={{
            top,
            width: `min(${dialogWidth}px, calc(100vw - 48px))`,
            maxHeight,
            height: height === "full" ? maxHeight : undefined,
          }}
          className={cx(
            "dialog-panel fixed left-1/2 z-50 flex -translate-x-1/2 flex-col overflow-hidden rounded-[8px] border border-rule bg-surface text-ink outline-none",
            className,
          )}
        >
          {title && <Dialog.Title className="sr-only">{title}</Dialog.Title>}
          {description && <Dialog.Description className="sr-only">{description}</Dialog.Description>}
          {header && <div className="shrink-0">{header}</div>}
          {/* Without a pinned header the body keeps the room the drawer handle gave phone layouts. */}
          <div className={cx("flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain", !header && "pt-3", bodyClassName)}>
            {children}
          </div>
          <div className="relative z-10 h-0 shrink-0">
            <SnackbarSlot active={open} className={cx("absolute inset-x-6", footer ? "bottom-2" : "bottom-4")} />
          </div>
          {footer && (
            <div className="flex min-h-16 shrink-0 flex-col justify-center border-t border-rule bg-surface px-6 py-3">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Visible sheet title (Newsreader 22). Use instead of the `title` prop. */
export function SheetTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Dialog.Title className={cx("m-0 font-serif text-[22px] leading-7 font-medium tracking-[-0.01em] whitespace-nowrap", className)}>
      {children}
    </Dialog.Title>
  );
}

/** 44×44 «Закрыть» button that closes the enclosing sheet. */
export function SheetCloseButton({ className, label = "Закрыть" }: { className?: string; label?: string }) {
  return (
    <Dialog.Close asChild>
      <IconButton icon="close" label={label} className={className} />
    </Dialog.Close>
  );
}

/** 32×32 close X for desktop dialog chrome («Закрыть», Esc). */
export function DialogCloseButton({ className, label = "Закрыть" }: { className?: string; label?: string }) {
  return (
    <Dialog.Close asChild>
      <button
        type="button"
        aria-label={label}
        title={`${label} (Esc)`}
        aria-keyshortcuts="Escape"
        className={cx(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-[4px] bg-transparent text-ink hoverable:bg-hover-surface",
          className,
        )}
      >
        <Icon name="close" size={20} strokeWidth={1.5} />
      </button>
    </Dialog.Close>
  );
}

export interface DialogChromeProps {
  /** Mono 11 muted label at the left of the 48px chrome row: «Справка», «Карточка № 159». */
  label?: ReactNode;
  /** Extra tools after the label (text links, icon buttons). */
  tools?: ReactNode;
  /** Newsreader 28/36 dialog title (the accessible name). */
  title: ReactNode;
  className?: string;
}

/**
 * Desktop dialog header (DESKTOP-SPEC §3 dialog): 48px chrome (label/tools left, close right), the
 * title, and the 2px red rule edge to edge 16px under it. Pass it as <Sheet header={…}>.
 */
export function DialogChrome({ label, tools, title, className }: DialogChromeProps) {
  return (
    <div className={className}>
      <div className="px-6">
        <div className="flex h-12 items-center gap-4">
          {label != null && <span className="font-mono text-[11px] text-muted tabular-nums">{label}</span>}
          {tools}
          <span className="flex-1" />
          <DialogCloseButton className="-mr-2" />
        </div>
        <Dialog.Title className="m-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em]">{title}</Dialog.Title>
      </div>
      <div aria-hidden="true" className="mt-4 h-0.5 bg-red" />
    </div>
  );
}
