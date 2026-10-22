"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { SLANG_LABELS, type Direction, type Word } from "@/lib/types";
import { headwordStep, posAbbr, type HeadwordStep } from "./format";
import type { SwipeOutcome } from "./swipe";
import { swipeVisual } from "./swipe";
import { useSwipe } from "./useSwipe";

/** Index-card shell: white, radius 6, 1px rule, the red header rule 44px from the top. */
const cardShell = "flex flex-col overflow-hidden rounded-card border border-rule bg-surface text-ink";

/**
 * Desktop card size (DESKTOP-SPEC §2 height tiers), as --card-w / --card-h on the review root:
 * 640×384 from 768; 560×336 below 620 tall; 720×432 from 1200 wide and 760 tall; 800×480 from
 * 1600. The headword step 1 grows to 64/64 at 1600 (--hw1-size / --hw1-top).
 */
export const REVIEW_DESK_CSS = `
@media (min-width: 768px) {
  [data-review] { --card-w: 640px; --card-h: 384px; --col-w: 640px; --hw1-size: 56px; --hw1-top: 19px; --hw1-pos: -6px; }
}
@media (min-width: 768px) and (max-height: 619px) {
  [data-review] { --card-w: 560px; --card-h: 336px; }
}
@media (min-width: 1200px) {
  [data-review] { --col-w: 720px; }
}
@media (min-width: 1200px) and (min-height: 760px) {
  [data-review] { --card-w: 720px; --card-h: 432px; }
}
@media (min-width: 1600px) and (min-height: 760px) {
  [data-review] { --card-w: 800px; --card-h: 480px; --hw1-size: 64px; --hw1-top: 17px; --hw1-pos: -4px; }
}
`;

/**
 * Headword steps from 768 up. The block's top and the POS line's margin are set so the headword's
 * baseline sits on ruled line 2 (64px under the red rule) and the POS on line 3 (96px), the same on
 * the answer side without the rules. Phones keep the length steps of `promptSize`.
 */
const STEP_HEADWORD: Record<HeadwordStep, string> = {
  1: "md:mt-(--hw1-top) md:text-(length:--hw1-size) md:leading-[64px]",
  2: "md:mt-[22px] md:text-[44px] md:leading-[64px]",
  3: "md:mt-[41px] md:text-[30px] md:leading-8",
};
const STEP_POS: Record<HeadwordStep, string> = {
  1: "md:mt-(--hw1-pos)",
  2: "md:-mt-[9px]",
  3: "md:mt-1",
};

function CardHeader({ label, children }: { label: ReactNode; children?: ReactNode }) {
  return (
    <span className="flex h-[46px] shrink-0 items-center justify-between border-b-2 border-red px-5 md:h-12 md:px-10">
      <span className="font-mono text-[11px] tracking-[.06em] text-muted md:tracking-normal md:tabular-nums">{label}</span>
      {children}
    </span>
  );
}

/** «FR» on phones; «FR · № 001» from 768 up. */
function CallNumber({ side, number }: { side: string; number?: string }) {
  return (
    <>
      {side}
      {number && <span className="max-md:hidden"> · {number}</span>}
    </>
  );
}

/** Prompt size steps down for long expressions so they stay on the card. */
function promptSize(text: string): string {
  if (text.length <= 16) return "text-[40px] leading-[1.1]";
  if (text.length <= 28) return "text-[32px] leading-[1.15]";
  return "text-[26px] leading-[1.2]";
}

/** Behind the card from 768 up: one outline per card still to come, up to two (DESKTOP-SPEC §3). */
export function CardStack({ count }: { count: number }) {
  return (
    <>
      {count >= 2 && (
        <div
          aria-hidden="true"
          className="absolute inset-0 translate-x-2 translate-y-2 rounded-card border border-rule bg-paper max-md:hidden"
        />
      )}
      {count >= 1 && (
        <div
          aria-hidden="true"
          className="absolute inset-0 translate-x-1 translate-y-1 rounded-card border border-rule bg-paper max-md:hidden"
        />
      )}
    </>
  );
}

/** True while the scroller has content below its visible part («ещё ↓»). */
function useClippedBelow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setClipped(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    for (const child of Array.from(el.children)) observer?.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, []);
  return [ref, clipped] as const;
}

export interface ReviewCardProps {
  word: Word;
  direction: Direction;
  revealed: boolean;
  onReveal: () => void;
  /** «Повседневное» / «Входящие» */
  folderName: string;
  swipeEnabled: boolean;
  onSwipe: (outcome: SwipeOutcome) => void;
  /** Flip back to the question (tap on the answer side). */
  onHide: () => void;
  /** The side just turned to by a flip on this card; it animates in. */
  flip?: "up" | "down";
  /** Vibrate on swipes. */
  haptics: boolean;
  /** Show the next card peeking behind while dragging. */
  hasNext: boolean;
  /** Catalog number «№ 001» (desktop header). */
  number?: string;
  /** Cards still to come after this one (desktop stack outlines). */
  remaining?: number;
}

/**
 * The review card: question side (tap to flip) or answer side (swipe sideways to grade, tap to flip back).
 * From 768 up it is the landscape index card of DESKTOP-SPEC §5 #1–#3: fixed size, ruled front with
 * the call number, tracings footer on the back, the stack of cards to come behind it.
 */
export function ReviewCard({
  word,
  direction,
  revealed,
  onReveal,
  onHide,
  flip,
  haptics,
  folderName,
  swipeEnabled,
  onSwipe,
  hasNext,
  number,
  remaining = 0,
}: ReviewCardProps) {
  const swipe = useSwipe({ enabled: revealed && swipeEnabled, haptics, onDecide: onSwipe });
  const { dx, width, mode } = swipe.view;
  const visual = swipeVisual(dx, width || 1);
  const moving = mode !== "idle" || dx !== 0;
  const [bodyRef, clipped] = useClippedBelow<HTMLDivElement>();

  const fromFr = direction === "fr_ru";
  const label = fromFr ? "FR" : "RU";
  const prompt = fromFr ? word.fr : word.ru;
  const pos = posAbbr(word);
  const step = headwordStep(prompt, word.fr);

  const motion: CSSProperties | undefined = moving
    ? {
        transform: `translateX(${dx}px) rotate(${visual.rotate}deg)`,
        transition: mode === "dragging" ? "none" : "transform 180ms ease-out",
      }
    : undefined;

  return (
    <div
      data-review-focus=""
      className="relative mt-4 flex min-h-[280px] flex-1 flex-col md:mt-0 md:h-(--card-h) md:max-h-full md:min-h-0 md:w-(--card-w) md:max-w-full md:flex-none"
    >
      <CardStack count={Math.min(2, remaining)} />

      {hasNext && moving && (
        <div aria-hidden="true" className={cx(cardShell, "absolute inset-0 scale-[.96]")}>
          <CardHeader label={label} />
        </div>
      )}

      {!revealed ? (
        <button
          type="button"
          onClick={onReveal}
          aria-label={`Карточка ${prompt}, перевернуть`}
          aria-keyshortcuts="Space"
          data-review-reveal=""
          className={cx(
            cardShell,
            "absolute inset-0 text-left",
            flip === "down" && "animate-[card-turn-down_220ms_ease-out]",
          )}
        >
          <CardHeader label={<CallNumber side={label} number={number} />} />
          <span className="relative flex min-h-0 flex-1 flex-col justify-center px-6 pb-6 md:justify-start md:px-10 md:pb-0">
            {/* Ruled front: a 1px blue-grey line every 32px from 32px under the red rule. */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-8 bottom-6 bg-[linear-gradient(var(--card-lines)_0_1px,transparent_1px)] bg-size-[100%_32px] max-md:hidden"
            />
            <span
              lang={fromFr ? "fr" : undefined}
              className={cx(
                "relative font-serif font-medium tracking-[-0.015em] break-words md:tracking-[-0.02em]",
                promptSize(prompt),
                STEP_HEADWORD[step],
              )}
            >
              {prompt}
            </span>
            {fromFr && pos && (
              <span lang="fr" className={cx("abbr relative mt-2 text-[15px] leading-5 md:text-[17px] md:leading-8", STEP_POS[step])}>
                {pos}
              </span>
            )}
          </span>
          <span className="mx-5 flex h-12 shrink-0 items-center gap-2 border-t border-rule text-[12px] text-muted md:mx-10 md:gap-1.5 md:text-[13px] md:leading-5">
            <Icon name="flip" size={14} />
            <span className="md:hidden">тапни, чтобы перевернуть</span>
            <span className="ml-0.5 max-md:hidden">Щелчок или</span>
            <Kbd aria-hidden="true" className="max-md:hidden">
              Пробел
            </Kbd>
            <span className="max-md:hidden">— перевернуть</span>
          </span>
        </button>
      ) : (
        <article
          {...swipe.handlers}
          onClick={() => {
            if (swipe.consumeClick()) return;
            // Selecting text on the card with a mouse does not flip it.
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed && selection.anchorNode && bodyRef.current?.contains(selection.anchorNode)) return;
            onHide();
          }}
          data-review-answer=""
          tabIndex={-1}
          aria-label={`${word.fr} — ${word.ru}`}
          style={motion}
          className={cx(
            cardShell,
            "absolute inset-0 outline-none will-change-transform",
            swipeEnabled && "touch-pan-y select-none",
            flip === "up" && "animate-[card-turn-up_220ms_ease-out]",
          )}
        >
          <CardHeader label={<CallNumber side={label} number={number} />}>
            <SlangMeter level={word.slang_level} verlan={word.verlan} />
          </CardHeader>

          {/* The scroller needs pan-y too: touch-action is resolved up to the nearest scroll container,
              so without it the browser claims horizontal drags (back gesture) and cancels the swipe. */}
          <div
            ref={bodyRef}
            className={cx(
              "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pt-6 pb-4 md:px-10 md:pt-0",
              swipeEnabled && "touch-pan-y",
            )}
          >
            <h2
              lang="fr"
              className={cx(
                "m-0 font-serif font-medium tracking-[-0.015em] break-words md:tracking-[-0.02em]",
                promptSize(word.fr),
                STEP_HEADWORD[step],
              )}
            >
              {word.fr}
            </h2>
            {pos && (
              <span lang="fr" className={cx("abbr mt-2 text-[15px] leading-5 md:text-[17px] md:leading-8", STEP_POS[step])}>
                {pos}
              </span>
            )}
            <p className="mt-6 mb-0 text-[22px] leading-7 font-medium break-words md:mt-4 md:text-[24px] md:leading-8">
              {word.ru}
            </p>
            {word.note && (
              <p className="mt-2 mb-0 max-w-[32ch] text-[14px] leading-5 whitespace-pre-line text-muted md:line-clamp-3 md:max-w-[60ch] md:text-[15px] md:leading-[22px]">
                {word.note}
              </p>
            )}
            {(word.example_fr || word.example_ru) && (
              <div className="mt-6 flex flex-col gap-1 border-t border-rule pt-4 md:mt-5 md:gap-0">
                {word.example_fr && (
                  <span lang="fr" className="font-serif text-[17px] leading-6 italic md:text-[18px]">
                    {word.example_fr}
                  </span>
                )}
                {word.example_ru && <span className="text-[13px] leading-5 text-muted md:text-[14px]">{word.example_ru}</span>}
              </div>
            )}
          </div>

          <div className="relative mx-5 flex h-12 shrink-0 items-center border-t border-rule md:mx-10 md:text-[13px] md:leading-5 md:text-muted">
            <span className="meta truncate md:hidden">
              тема: <span className="text-ink">{folderName}</span>
            </span>
            <Tracings folderName={folderName} word={word} />
            {clipped && (
              <span
                aria-hidden="true"
                className="absolute -top-2 right-0 bg-surface pl-2 font-mono text-[11px] leading-4 text-muted max-md:hidden"
              >
                ещё ↓
              </span>
            )}
          </div>

          {visual.side && (
            <span
              aria-hidden="true"
              style={{
                opacity: visual.progress * 0.9,
                transform: `rotate(${visual.side === "good" ? -8 : 8}deg)`,
              }}
              className={cx(
                "pointer-events-none absolute top-3 inline-flex h-10 items-center rounded-chip border-2 px-3.5 font-mono text-[20px] font-medium tracking-[.16em]",
                visual.side === "good" ? "left-14 border-good text-good" : "right-14 border-again text-again",
              )}
            >
              {visual.side === "good" ? "ЗНАЮ" : "НЕ ЗНАЮ"}
            </span>
          )}
        </article>
      )}
    </div>
  );
}

/** Desktop answer footer, catalog-card «tracings»: «1. Повседневное   2. arg.   3. verl.». */
function Tracings({ folderName, word }: { folderName: string; word: Word }) {
  const items: ReactNode[] = [
    folderName,
    <span key="level" lang={word.slang_level === 0 ? undefined : "fr"} className="font-serif text-[14px] italic">
      {SLANG_LABELS[word.slang_level]}
    </span>,
  ];
  if (word.verlan) {
    items.push(
      <span key="verlan" lang="fr" className="font-serif text-[14px] italic">
        verl.
      </span>,
    );
  }
  return (
    <span className="flex min-w-0 items-baseline gap-4 truncate max-md:hidden">
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-baseline gap-1 whitespace-nowrap">
          <span className="tabular-nums">{i + 1}.</span>
          {item}
        </span>
      ))}
    </span>
  );
}

/**
 * Placeholder with the same footprint while the next card loads. From 768 up: the card outline at
 * its place with two hairline skeleton bars (DESKTOP-SPEC, described states).
 */
export function ReviewCardPlaceholder() {
  return (
    <div className="relative mt-4 flex min-h-[280px] flex-1 flex-col md:mt-0 md:h-(--card-h) md:max-h-full md:min-h-0 md:w-(--card-w) md:max-w-full md:flex-none">
      <div aria-hidden="true" className={cx(cardShell, "absolute inset-0")}>
        <CardHeader label="" />
        <span className="flex flex-col gap-4 px-10 pt-8 max-md:hidden">
          <span className="h-px w-[40%] bg-rule" />
          <span className="h-px w-[24%] bg-rule" />
        </span>
      </div>
    </div>
  );
}
