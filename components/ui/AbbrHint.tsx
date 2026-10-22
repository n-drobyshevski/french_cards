"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type SyntheticEvent } from "react";
import { abbrEntry } from "@/lib/abbr";
import { cx } from "./cx";

/** Gutter the hint keeps from the screen edges. */
const EDGE = 16;
/** Mouse hover: open after this pause, close this long after leaving (so the pointer can cross the gap). */
const HOVER_OPEN_MS = 500;
const HOVER_CLOSE_MS = 120;
/** After a hint closes, a neighbour hovered within this long opens at once (D7). */
const WARM_MS = 400;

/**
 * Shared by every hint on the page (D7): while one is open, or just after it closed, the pointer
 * moving to a neighbour opens it with no pause and no fade. One hint at a time: opening one closes
 * the other at once (`closeOpen`).
 */
const warmth: { open: number; closedAt: number; closeOpen: (() => void) | null } = { open: 0, closedAt: -Infinity, closeOpen: null };
const isWarm = () => warmth.open > 0 || performance.now() - warmth.closedAt < WARM_MS;

export interface AbbrHintProps {
  /** The abbreviation as printed: «n. m.», «loc.», «arg.»… */
  abbr: string;
  /** Size and spacing classes for the abbreviation (it always gets `.abbr`). */
  className?: string;
  lang?: string;
  /** Which edge of the abbreviation the hint lines up with. */
  align?: "start" | "end";
}

/**
 * A dictionary abbreviation that explains itself on a tap: «n. m.» → «nom masculin ·
 * Существительное мужского рода». With a mouse it also opens on hover; a click pins it. Taps and
 * keys stay inside, so it works on the review card (which flips on a tap) and in sheets (where
 * Escape would close the sheet). Unknown abbreviations render as plain text.
 * Motion (D7): hover opens after 500 ms, then at once for neighbours while one is open; keyboard
 * focus opens it at once. It fades in over --dur-quick (not when warm) and closes instantly.
 */
export function AbbrHint({ abbr, className, lang = "fr", align = "start" }: AbbrHintProps) {
  const entry = abbrEntry(abbr);
  const id = useId();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  /** Whether the bubble fades in: not when it opens straight after a neighbour. */
  const [fade, setFade] = useState(true);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = pinned || hovered || focused;
  const wrap = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Keep the hint on screen: shift it back inside the gutters.
  useLayoutEffect(() => {
    const el = bubble.current;
    if (!open || !el) return;
    el.style.translate = "";
    const rect = el.getBoundingClientRect();
    const overflowRight = rect.right - (window.innerWidth - EDGE);
    const overflowLeft = EDGE - rect.left;
    const shift = overflowRight > 0 ? -overflowRight : overflowLeft > 0 ? overflowLeft : 0;
    if (shift) el.style.translate = `${shift}px 0`;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setPinned(false);
      setHovered(false);
      setFocused(false);
    };
    warmth.closeOpen?.();
    warmth.closeOpen = close;
    warmth.open += 1;
    return () => {
      if (warmth.closeOpen === close) warmth.closeOpen = null;
      warmth.open -= 1;
      warmth.closedAt = performance.now();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (wrap.current?.contains(event.target as Node)) return;
      setPinned(false);
      setHovered(false);
      setFocused(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);

  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    [],
  );

  if (!entry) {
    return (
      <span lang={lang} className={cx("abbr", className)}>
        {abbr}
      </span>
    );
  }

  const stop = (event: SyntheticEvent) => event.stopPropagation();
  const onKeyDown = (event: KeyboardEvent) => {
    // Space/Enter must not reach the review card's keyboard shortcuts.
    event.stopPropagation();
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setPinned(false);
      setHovered(false);
      setFocused(false);
      button.current?.focus();
    }
  };

  const hoverTo = (next: boolean) => (event: { pointerType: string }) => {
    if (event.pointerType !== "mouse") return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (next && !open && isWarm()) {
      hoverTimer.current = null;
      setFade(false);
      setHovered(true);
      return;
    }
    hoverTimer.current = setTimeout(
      () => {
        if (next && !open) setFade(!isWarm());
        setHovered(next);
      },
      next ? HOVER_OPEN_MS : HOVER_CLOSE_MS,
    );
  };

  // Keyboard focus explains at once; a focus from a tap or click is left to the click (pin).
  const onFocus = (event: FocusEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.matches(":focus-visible")) return;
    if (!open) setFade(!isWarm());
    setFocused(true);
  };

  return (
    <span
      ref={wrap}
      className="relative inline-flex"
      onClick={stop}
      onPointerDown={stop}
      onKeyDown={onKeyDown}
      onPointerEnter={hoverTo(true)}
      onPointerLeave={hoverTo(false)}
    >
      <button
        ref={button}
        type="button"
        lang={lang}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        aria-label={`${abbr} — ${entry.full}`}
        onFocus={onFocus}
        onBlur={() => setFocused(false)}
        onClick={() => {
          // A click pins a hovered hint open; a click on a pinned one closes it.
          if (pinned) {
            setHovered(false);
            setFocused(false);
          } else if (!open) setFade(true);
          setPinned(!pinned);
        }}
        className={cx(
          "abbr -my-1 cursor-help bg-transparent p-0 py-1 underline decoration-rule decoration-dotted decoration-1 underline-offset-[3px] active:text-ink",
          open && "text-ink decoration-ink",
          className,
        )}
      >
        {abbr}
      </button>
      {open && (
        <span
          ref={bubble}
          id={id}
          role="tooltip"
          className={cx(
            "absolute top-full z-40 mt-2 flex w-max max-w-[min(280px,calc(100vw-32px))] flex-col gap-0.5 rounded-[4px] border border-ink bg-surface px-3 py-2 text-left font-sans text-[13px] leading-5 font-normal text-ink not-italic shadow-[0_4px_16px_rgb(0_0_0/0.12)]",
            align === "end" ? "right-0" : "left-0",
            fade && "animate-[fade-in_var(--dur-quick)_var(--ease-enter)]",
          )}
        >
          <span lang="fr" className="font-serif text-[15px] italic">
            {abbr} — {entry.full}
          </span>
          <span>{entry.ru}</span>
          {entry.example && (
            <span className="text-muted">{entry.example}</span>
          )}
        </span>
      )}
    </span>
  );
}
