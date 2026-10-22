"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { IconButton } from "./Button";
import { cx } from "./cx";
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

/** Keyboard heights under this are browser chrome jitter, not a keyboard. */
const KEYBOARD_MIN = 40;
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
  /** Pinned under the scrolling body (sticky actions); stays above the keyboard. */
  footer?: ReactNode;
  /** When false, drag/scrim/Escape do not close it. */
  dismissible?: boolean;
  /** For a sheet opened from inside another sheet. */
  nested?: boolean;
  /** Called after the close animation finishes (reset form state here). */
  onClosed?: () => void;
  /** Radix auto-focus on open; call event.preventDefault() to keep focus where it is. */
  onOpenAutoFocus?: (event: Event) => void;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

/**
 * Bottom sheet on vaul's Drawer: handle, 12px top radius, 1px ink top rule, scrim var(--scrim).
 * The body scrolls; the sheet follows the visual viewport so inputs stay above the keyboard.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  height = "auto",
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
  const maxHeight = `calc(${visible} - ${TOP_GAP}px - ${keyboard ? "0px" : "env(safe-area-inset-top)"})`;
  const sizeStyle =
    height === "full"
      ? { height: maxHeight }
      : height === "large"
        ? { height: `min(calc(${visible} * 0.78), ${maxHeight})` }
        : { maxHeight };

  const Root = nested ? Drawer.NestedRoot : Drawer.Root;

  return (
    <Root
      open={open}
      onOpenChange={onOpenChange}
      dismissible={dismissible}
      repositionInputs={false}
      onAnimationEnd={(isOpen) => {
        if (!isOpen) onClosed?.();
      }}
    >
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

/** Visible sheet title (Newsreader 22). Use instead of the `title` prop. */
export function SheetTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Drawer.Title className={cx("m-0 font-serif text-[22px] leading-7 font-medium tracking-[-0.01em] whitespace-nowrap", className)}>
      {children}
    </Drawer.Title>
  );
}

/** 44×44 «Закрыть» button that closes the enclosing sheet. */
export function SheetCloseButton({ className, label = "Закрыть" }: { className?: string; label?: string }) {
  return (
    <Drawer.Close asChild>
      <IconButton icon="close" label={label} className={className} />
    </Drawer.Close>
  );
}
