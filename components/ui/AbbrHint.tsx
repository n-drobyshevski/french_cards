"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { abbrEntry } from "@/lib/abbr";
import { cx } from "./cx";

/** Gutter the hint keeps from the screen edges. */
const EDGE = 16;
/** Mouse hover: open after this pause, close this long after leaving (so the pointer can cross the gap). */
const HOVER_OPEN_MS = 250;
const HOVER_CLOSE_MS = 120;

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
 */
export function AbbrHint({ abbr, className, lang = "fr", align = "start" }: AbbrHintProps) {
  const entry = abbrEntry(abbr);
  const id = useId();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = pinned || hovered;
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
    const close = (event: PointerEvent) => {
      if (wrap.current?.contains(event.target as Node)) return;
      setPinned(false);
      setHovered(false);
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
      button.current?.focus();
    }
  };

  const hoverTo = (next: boolean) => (event: { pointerType: string }) => {
    if (event.pointerType !== "mouse") return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(next), next ? HOVER_OPEN_MS : HOVER_CLOSE_MS);
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
        onClick={() => {
          // A click pins a hovered hint open; a click on a pinned one closes it.
          if (pinned) setHovered(false);
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
