"use client";

// Small pieces shared by the desktop import views (≥ 768, mockups/D-Import-*.dc.html): 40px
// buttons, the 14px checkbox, mono tags, the screenshot column, and the layout switch.
import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { MEDIUM_QUERY } from "@/lib/use-media";

/**
 * true from 768 up, false on phones, null on the server and during hydration (render both
 * layouts, each hidden by CSS, so a desktop reload never flashes the phone screen).
 */
export function useDeskLayout(): boolean | null {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(MEDIUM_QUERY);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return useSyncExternalStore<boolean | null>(
    subscribe,
    () => window.matchMedia(MEDIUM_QUERY).matches,
    () => null,
  );
}

export type DeskButtonVariant = "primary" | "secondary" | "tertiary";

/**
 * Desktop buttons (DESKTOP-SPEC §3): primary ink, secondary white with the boundary line (both 40px,
 * or 32px with `small`), tertiary text 32px.
 */
export function deskButton(variant: DeskButtonVariant, className?: string, small = false): string {
  const box = small ? "h-8 px-3" : "h-10 px-4";
  return cx(
    "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-btn text-[14px] leading-5 font-medium no-underline",
    "aria-disabled:cursor-default disabled:cursor-default",
    variant === "primary" &&
      `${box} border border-ink bg-ink text-on-ink aria-disabled:border-rule aria-disabled:bg-transparent aria-disabled:text-boundary`,
    variant === "secondary" && `${box} border border-boundary bg-surface text-ink hoverable:bg-hover-surface disabled:border-rule disabled:text-boundary`,
    variant === "tertiary" &&
      "h-8 rounded-[4px] bg-transparent px-2 text-ink hoverable:bg-hover disabled:text-boundary focus-visible:outline-offset-[-2px]",
    className,
  );
}

/** 14×14 checkbox mark (radius 2); the click target is its row or gutter, never just the box. */
export function CheckMark({ checked, mixed, disabled }: { checked: boolean; mixed?: boolean; disabled?: boolean }) {
  const on = checked || mixed;
  return (
    <span
      aria-hidden="true"
      className={cx(
        "box-border inline-flex size-3.5 shrink-0 items-center justify-center rounded-[2px] border",
        on ? "border-ink bg-ink text-on-ink" : disabled ? "border-rule bg-transparent" : "border-muted bg-surface",
      )}
    >
      {mixed ? (
        <span className="h-0.5 w-2 bg-on-ink" />
      ) : checked ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.2 5 8.6 9.5 3.6" />
        </svg>
      ) : null}
    </span>
  );
}

/** Mono uppercase tag in a hairline box: «ДОГАДКА», «УЖЕ ЕСТЬ» (20px, 11px). */
export function DeskTag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex h-5 shrink-0 items-center rounded-[4px] border border-rule px-1.5 align-top font-mono text-[11px] leading-none tracking-[.06em] whitespace-nowrap text-muted not-italic"
    >
      {children}
    </span>
  );
}

/**
 * Width of the screenshot column (DESKTOP-SPEC §2 «Import review»): 280 · 320 ≥ 1100 · 400 ≥ 1200 ·
 * 456 ≥ 1440. All px variants: Tailwind sorts px breakpoints before rem ones like `xl:`.
 */
export const SHOT_PANE = "w-[280px] min-[1100px]:w-[320px] min-[1200px]:w-[400px] min-[1440px]:w-[456px]";

/**
 * Column grid of the rows table: checkbox 32 · FR 200 · RU 190 · Уровень 110 · Тема 139 at 1440,
 * fluid below. In a rows pane narrower than 680 (the `@container` column; rail + 280 screenshot)
 * «Уровень» shrinks to the italic abbreviation, 56 wide, as in the library table.
 */
export const ROW_GRID =
  "grid grid-cols-[32px_minmax(0,200fr)_minmax(0,190fr)_110px_minmax(0,139fr)] @max-[680px]:grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_56px_minmax(0,104px)]";

/** The bottom-bar footnote only fits a rows pane of 600 and more. */
export const WIDE_ONLY = "@max-[600px]:hidden";

/** Inline alert line for pick/paste problems. */
export function DeskAlert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="m-0 flex items-start gap-2 text-[13px] leading-5 text-again">
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
