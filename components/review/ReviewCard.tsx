"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { AbbrHint } from "@/components/ui/AbbrHint";
import { IconButton } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { SkeletonBar } from "@/components/ui/Skeleton";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { REDUCED_MOTION_QUERY, tokenMs } from "@/lib/motion";
import { useMediaQuery } from "@/lib/use-media";
import { SLANG_LABELS, type Direction, type Word } from "@/lib/types";
import {
  SETTLE_MS,
  exitStart,
  playArrival,
  playDropToStack,
  playExit,
  playHeadwordGlide,
  topWithin,
  type CardArrival,
  type CardExit,
} from "./card-motion";
import { headwordStep, posAbbr, type HeadwordStep } from "./format";
import { flyOut, stackPose, swipeVisual, type SwipeOutcome, type SwipeVisual } from "./swipe";
import { useSwipe } from "./useSwipe";

/** Index-card shell: white, radius 6, 1px rule, the red header rule 44px from the top. */
const cardShell = "flex flex-col overflow-hidden rounded-card border border-rule bg-surface text-ink";

/** The card's place in the column (phone: fills it; from 768: the fixed index card). Shared with the placeholder. */
const cardSlot =
  "relative mt-4 flex min-h-[280px] flex-1 flex-col md:mt-0 md:h-(--card-h) md:max-h-full md:min-h-0 md:w-(--card-w) md:max-w-full md:flex-none";

/** Body of the question side: the prompt centred on phones, on the ruled lines from 768. */
const questionBody = "relative flex min-h-0 flex-1 flex-col justify-center px-6 pb-6 md:justify-start md:px-10 md:pb-0";

/** Content written into a blank that was reserved for it: fade in, no movement (MOTION-SPEC §3.2). */
export const WRITE_IN = "animate-[fade-in_var(--dur-quick)_var(--ease-enter)]";

/**
 * Reveal (R3): the answer block (slang meter, translation, note, examples, footer) writes in once the
 * headword has covered most of its glide — 4px rise + fade, --dur-enter, 120 ms after the glide
 * starts. From 768 (D2) the headword does not move and the block fades in --dur-quick in place.
 * Reduced motion: a 110 ms fade at once (the delay is scaled by --motion-scale).
 */
const ANSWER_WRITE =
  "animate-[enter-rise_var(--dur-enter)_var(--ease-enter)_calc(120ms*var(--motion-scale))_both] md:animate-[fade-in_var(--dur-quick)_var(--ease-enter)_both]";

/**
 * Press (§5.1): .98 in --dur-instant while a pointer is down and not dragging, back in --dur-quick.
 * Driven by data-pressed from useSwipe rather than `press`, whose :active would also hold through a
 * swipe and through a tap on an abbreviation inside the card.
 */
const CARD_PRESS =
  "absolute inset-0 transition-[scale] duration-(--dur-quick) ease-press data-pressed:scale-(--press-scale) data-pressed:duration-(--dur-instant)";

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

/**
 * Behind the card from 768 up: one outline per card still to come, up to two (DESKTOP-SPEC §3).
 * They stay put while two or more remain; the deepest fades out --dur-quick when fewer do (D1).
 */
export function CardStack({ count }: { count: number }) {
  const outline =
    "absolute inset-0 rounded-card border border-rule bg-paper transition-opacity duration-(--dur-quick) ease-standard max-md:hidden";
  return (
    <>
      <div aria-hidden="true" className={cx(outline, "translate-x-2 translate-y-2", count < 2 && "opacity-0")} />
      <div aria-hidden="true" className={cx(outline, "translate-x-1 translate-y-1", count < 1 && "opacity-0")} />
    </>
  );
}

/**
 * The card's place on the screen: the desktop outlines behind, then the cards — the current one,
 * and over it any graded card still on its way out (`LeavingCard`). It stays mounted from card to
 * card, so a card leaving outlives the swap to the next one.
 */
export function CardDeck({ remaining, children }: { remaining: number; children?: ReactNode }) {
  return (
    <div data-review-focus="" className={cardSlot}>
      <CardStack count={Math.min(2, remaining)} />
      {children}
    </div>
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

/** What a card face shows. */
export interface CardFace {
  word: Word;
  direction: Direction;
  /** Catalog number «№ 001» (desktop header). */
  number?: string;
}

/** Question side: call number, the prompt (with its POS line) and the «перевернуть» footer. */
function QuestionFace({
  word,
  direction,
  number,
  headRef,
  writeIn,
  footerIn,
}: CardFace & {
  /** The prompt and its POS line, which glide between the two sides (R3). */
  headRef?: Ref<HTMLSpanElement>;
  /** Text written in over the loading placeholder's frame (R1). */
  writeIn?: string | false;
  /** Back from the answer: the footer fades in while the headword glides home. */
  footerIn?: boolean;
}) {
  const fromFr = direction === "fr_ru";
  const prompt = fromFr ? word.fr : word.ru;
  const pos = posAbbr(word);
  const step = headwordStep(prompt, word.fr);
  return (
    <>
      <CardHeader
        label={
          <span className={cx(writeIn)}>
            <CallNumber side={fromFr ? "FR" : "RU"} number={number} />
          </span>
        }
      />
      <span className={questionBody}>
        <CardRules />
        <span ref={headRef} className="relative flex flex-col">
          <span
            lang={fromFr ? "fr" : undefined}
            className={cx(
              "relative font-serif font-medium tracking-[-0.015em] break-words md:tracking-[-0.02em]",
              promptSize(prompt),
              STEP_HEADWORD[step],
              writeIn,
            )}
          >
            {prompt}
          </span>
          {fromFr && pos && (
            <span lang="fr" className={cx("abbr relative mt-2 text-[15px] leading-5 md:text-[17px] md:leading-8", STEP_POS[step], writeIn)}>
              {pos}
            </span>
          )}
        </span>
      </span>
      <span
        className={cx(
          "mx-5 flex h-12 shrink-0 items-center gap-2 border-t border-rule text-[12px] text-muted md:mx-10 md:gap-1.5 md:text-[13px] md:leading-5",
          writeIn || (footerIn && WRITE_IN),
        )}
      >
        <Icon name="flip" size={14} />
        <span className="md:hidden">тапни, чтобы перевернуть</span>
        <span className="ml-0.5 max-md:hidden">Щелчок или</span>
        <Kbd aria-hidden="true" className="max-md:hidden">
          Пробел
        </Kbd>
        <span className="max-md:hidden">— перевернуть</span>
      </span>
    </>
  );
}

/** Answer side: headword and POS, then the answer block (meter, translation, note, examples, footer). */
function AnswerFace({
  word,
  direction,
  number,
  folderName,
  headRef,
  write,
  swipeEnabled,
  onEdit,
  editKey = false,
}: CardFace & {
  folderName: string;
  headRef?: Ref<HTMLDivElement>;
  /** The answer block's write-in, when the card has just been turned to this side. */
  write?: string | false;
  swipeEnabled?: boolean;
  /** Pencil in the header: «Изменить карточку» (opens the word's sheet). */
  onEdit?: () => void;
  /** `E` opens it too (single-letter keys on); named in the pencil's tooltip. */
  editKey?: boolean;
}) {
  const [bodyRef, clipped] = useClippedBelow<HTMLDivElement>();
  const pos = posAbbr(word);
  const step = headwordStep(direction === "fr_ru" ? word.fr : word.ru, word.fr);
  return (
    <>
      <CardHeader label={<CallNumber side={direction === "fr_ru" ? "FR" : "RU"} number={number} />}>
        <span className={cx("flex items-center gap-1", write)}>
          <SlangMeter level={word.slang_level} verlan={word.verlan} hints hintAlign="end" />
          {onEdit && (
            <>
              <span aria-hidden="true" className="ml-2 h-5 w-px bg-rule" />
              {/* Its own tap: neither a flip back nor the start of a swipe. */}
              <IconButton
                icon="pencil"
                label="Изменить карточку"
                title={editKey ? "Изменить карточку (E)" : "Изменить карточку"}
                aria-keyshortcuts={editKey ? "E" : undefined}
                iconSize={18}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="-mr-3 text-muted md:-mr-2 md:size-9 hoverable:bg-hover-surface hoverable:text-ink"
              />
            </>
          )}
        </span>
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
        <div ref={headRef} className="flex flex-col">
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
            <span className={cx("mt-2 flex", STEP_POS[step])}>
              <AbbrHint abbr={pos} className="text-[15px] leading-5 md:text-[17px] md:leading-8" />
            </span>
          )}
        </div>
        <div className={cx("flex flex-col", write)}>
          <p className="mt-6 mb-0 text-[22px] leading-7 font-medium break-words md:mt-4 md:text-[24px] md:leading-8">{word.ru}</p>
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
              {/* One more example fits the card; the rest are in the word's detail. */}
              {word.extra_examples?.[0] && (
                <>
                  <span lang="fr" className="mt-2 font-serif text-[17px] leading-6 italic md:text-[18px]">
                    {word.extra_examples[0].fr}
                  </span>
                  {word.extra_examples[0].ru && <span className="text-[13px] leading-5 text-muted md:text-[14px]">{word.extra_examples[0].ru}</span>}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={cx("relative mx-5 flex h-12 shrink-0 items-center border-t border-rule md:mx-10 md:text-[13px] md:leading-5 md:text-muted", write)}>
        <span className="meta truncate md:hidden">
          тема: <span className="text-ink">{folderName}</span>
        </span>
        <Tracings folderName={folderName} word={word} />
        {clipped && (
          <span aria-hidden="true" className="absolute -top-2 right-0 bg-surface pl-2 font-mono text-[11px] leading-4 text-muted max-md:hidden">
            ещё ↓
          </span>
        )}
      </div>
    </>
  );
}

/**
 * Swipe stamps (R4, §5.3), on both sides of the card: «ЗНАЮ» top-left −8°, «НЕ ЗНАЮ» top-right +8°.
 * The opacity follows the drag (0 at 16 px → .6 just before the threshold, falling back in
 * --dur-quick); at the threshold the stamp locks — opacity 1 in --dur-instant and it lands
 * 1.04 → 1 on --spring-stamp (no scale under reduced motion).
 */
function Stamps({ visual }: { visual: Pick<SwipeVisual, "side" | "locked" | "stamp"> }) {
  return (
    <>
      {(["good", "again"] as const).map((side) => {
        const active = visual.side === side;
        const locked = active && visual.locked;
        return (
          <span
            key={side}
            aria-hidden="true"
            data-stamp={side}
            data-locked={locked ? "" : undefined}
            style={{
              opacity: active ? visual.stamp : 0,
              transition: locked ? "opacity var(--dur-instant) var(--ease-press)" : "opacity var(--dur-quick) var(--ease-standard)",
            }}
            className={cx(
              "pointer-events-none absolute top-3 inline-flex h-10 items-center rounded-chip border-2 px-3.5 font-mono text-[20px] font-medium tracking-[.16em]",
              "data-locked:animate-[stamp-land_300ms_var(--spring-stamp)_both]",
              side === "good" ? "left-14 -rotate-8 border-good text-good" : "right-14 rotate-8 border-again text-again",
            )}
          >
            {side === "good" ? "ЗНАЮ" : "НЕ ЗНАЮ"}
          </span>
        );
      })}
    </>
  );
}

/**
 * The next card behind the current one (R5, phones): its real question side, inert, at .96 / 8 px;
 * it grows with a drag towards .99 / 2 px. When the current card leaves, the next one mounts in its
 * place and settles from that pose (`CardArrival` "stack"). After an undo it is the card that was
 * current, dropping back into the stack.
 */
function StackCard({ face, style, drop }: { face: CardFace; style: CSSProperties; drop: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dropOnMount] = useState(drop);
  useLayoutEffect(() => {
    if (dropOnMount && ref.current) playDropToStack(ref.current);
  }, [dropOnMount]);
  return (
    <div ref={ref} aria-hidden="true" inert data-review-stack="" style={style} className={cx(cardShell, "absolute inset-0 md:hidden")}>
      <QuestionFace {...face} />
    </div>
  );
}

export interface ReviewCardProps extends CardFace {
  revealed: boolean;
  onReveal: () => void;
  /** «Повседневное» / «Входящие» */
  folderName: string;
  swipeEnabled: boolean;
  /**
   * A decided swipe: how the card leaves (from where it was let go) and how far the drag had grown
   * the card behind. Returns false when the grade is not taken; the card then springs back.
   */
  onSwipe: (outcome: SwipeOutcome, release: { exit: CardExit; progress: number }) => boolean;
  /** Flip back to the question (tap on the answer side). */
  onHide: () => void;
  /** The side just turned to by a flip on this card; its headword glides and its new text writes in. */
  flip?: "up" | "down";
  /** Vibrate on swipes. */
  haptics: boolean;
  /** The card behind (phones), shown with its real question side. */
  next?: CardFace | null;
  /** Replaces the loading placeholder: the text fades in over the same frame (R1). */
  enter?: boolean;
  /** How the card appears: out of the stack after a grade, or back from its side after an undo. */
  arrive?: CardArrival;
  /** Pencil in the answer side's header: «Изменить карточку» (opens the word's sheet). */
  onEdit?: () => void;
  /** `E` opens it too (single-letter keys on); named in the pencil's tooltip. */
  editKey?: boolean;
}

/**
 * The review card: question side (tap to flip) or answer side (tap to flip back); either side swipes
 * sideways to grade. Render it inside `CardDeck`.
 * From 768 up it is the landscape index card of DESKTOP-SPEC §5 #1–#3: fixed size, ruled front with
 * the call number, tracings footer on the back, the stack of cards to come behind it.
 *
 * Layers: the stack card (phones) → the swipe layer (drag transform, arrival) → the press layer
 * (scale) → the face (button / article). The layers stay from side to side, so a press is released
 * and a drag continues smoothly across a flip.
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
  next,
  number,
  enter = false,
  arrive,
  onEdit,
  editKey = false,
}: ReviewCardProps) {
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const swipe = useSwipe({
    enabled: swipeEnabled,
    haptics,
    settleMs: () => (reduced ? tokenMs("--dur-quick", 110) : SETTLE_MS),
    onDecide: (outcome, release) => {
      const at = swipeVisual(release.dx, release.width || 1);
      const { to, ms } = flyOut(release.dx, release.width, release.velocity);
      return onSwipe(outcome, {
        exit: { kind: "fly", outcome, dx: release.dx, rotate: reduced ? 0 : at.rotate, to, ms, stamp: at.stamp },
        progress: at.progress,
      });
    },
  });
  const { dx, width, mode, pressed } = swipe.view;
  const visual = swipeVisual(dx, width || 1);
  const layerRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLButtonElement>(null);
  const answerRef = useRef<HTMLElement>(null);
  const questionHeadRef = useRef<HTMLSpanElement>(null);
  const answerHeadRef = useRef<HTMLDivElement>(null);
  const writeIn = enter && WRITE_IN;

  const fromFr = direction === "fr_ru";
  const prompt = fromFr ? word.fr : word.ru;

  // Arrival (R5–R7): played once, on mount.
  const [arriveOnMount] = useState(arrive);
  useLayoutEffect(() => {
    if (arriveOnMount && layerRef.current) playArrival(layerRef.current, arriveOnMount);
  }, [arriveOnMount]);

  // Reveal (R3) as a FLIP: each side records where its headword block sits; when the side changes,
  // the new headword starts where the old one stood and glides to its own place. From 768 both sides
  // put it on the same ruled line, so it does not move (D2).
  const headTop = useRef<{ question: number | null; answer: number | null }>({ question: null, answer: null });
  const shownSide = useRef(revealed);
  useLayoutEffect(() => {
    if (shownSide.current === revealed) return;
    shownSide.current = revealed;
    const head = revealed ? answerHeadRef.current : questionHeadRef.current;
    const face = revealed ? answerRef.current : questionRef.current;
    const from = revealed ? headTop.current.question : headTop.current.answer;
    if (!head || !face || from === null || window.matchMedia("(min-width: 48rem)").matches) return;
    playHeadwordGlide(head, from - topWithin(head, face));
  }, [revealed]);
  useLayoutEffect(() => {
    const head = revealed ? answerHeadRef.current : questionHeadRef.current;
    const face = revealed ? answerRef.current : questionRef.current;
    if (head && face) headTop.current[revealed ? "answer" : "question"] = topWithin(head, face);
  });

  // Reduced motion (§2.7): the card follows the finger without tilting; a cancelled swipe returns in
  // --dur-quick. Otherwise it springs back on --spring-settle (a decided one is flown on by the screen).
  const motion: CSSProperties | undefined =
    mode === "idle" && dx === 0
      ? undefined
      : {
          transform: reduced ? `translateX(${dx}px)` : `translateX(${dx}px) rotate(${visual.rotate}deg)`,
          transition:
            mode === "dragging"
              ? "none"
              : reduced
                ? "transform var(--dur-quick) var(--ease-standard)"
                : `transform ${SETTLE_MS}ms var(--spring-settle)`,
        };
  // The card behind grows with the drag and settles back with the card (reduced: already at 1).
  const pose = reduced ? { scale: 1, y: 0 } : stackPose(mode === "dragging" ? visual.progress : 0);
  const stackStyle: CSSProperties = {
    transform: `translateY(${pose.y}px) scale(${pose.scale})`,
    transition: mode === "dragging" ? "none" : `transform ${SETTLE_MS}ms var(--spring-settle)`,
  };

  return (
    <>
      {next && <StackCard face={next} style={stackStyle} drop={arriveOnMount?.kind === "return"} />}
      <div ref={layerRef} data-review-card="" style={motion} className={cx("absolute inset-0 will-change-transform", mode === "dragging" && "cursor-grabbing select-none [&_*]:cursor-grabbing")}>
        <div data-pressed={pressed ? "" : undefined} className={CARD_PRESS}>
          {!revealed ? (
            <button
              ref={questionRef}
              type="button"
              {...swipe.handlers}
              onClick={() => {
                if (swipe.consumeClick()) return;
                onReveal();
              }}
              aria-label={`Карточка ${prompt}, перевернуть`}
              aria-keyshortcuts="Space"
              data-review-reveal=""
              className={cx(cardShell, "absolute inset-0 text-left", swipeEnabled && "touch-pan-y pointer-coarse:select-none")}
            >
              <QuestionFace
                word={word}
                direction={direction}
                number={number}
                headRef={questionHeadRef}
                writeIn={writeIn}
                footerIn={flip === "down"}
              />
            </button>
          ) : (
            <article
              ref={answerRef}
              {...swipe.handlers}
              onClick={() => {
                if (swipe.consumeClick()) return;
                // Selecting text on the card with a mouse does not flip it.
                const selection = window.getSelection();
                if (selection && !selection.isCollapsed && selection.anchorNode && answerRef.current?.contains(selection.anchorNode)) return;
                onHide();
              }}
              data-review-answer=""
              tabIndex={-1}
              aria-label={`${word.fr} — ${word.ru}`}
              className={cx(cardShell, "absolute inset-0 outline-none", swipeEnabled && "touch-pan-y pointer-coarse:select-none")}
            >
              <AnswerFace
                word={word}
                direction={direction}
                number={number}
                folderName={folderName}
                headRef={answerHeadRef}
                write={flip === "up" && ANSWER_WRITE}
                swipeEnabled={swipeEnabled}
                onEdit={onEdit}
                editKey={editKey}
              />
            </article>
          )}
        </div>
        {swipeEnabled && <Stamps visual={visual} />}
      </div>
    </>
  );
}

export interface LeavingCardProps extends CardFace {
  revealed: boolean;
  folderName: string;
  exit: CardExit;
  /** The exit has finished; drop this card. */
  onDone: () => void;
}

/**
 * A graded card on its way out (R4, R6): a snapshot of the side it was on, over the next card,
 * inert. It takes over from the live card in the frame of the grade — at the release pose of a
 * swipe — and plays its exit independently of the next card's read, then reports `onDone`.
 */
export function LeavingCard({ word, direction, number, revealed, folderName, exit, onDone }: LeavingCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [start] = useState(() => ({ exit, onDone }));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const animation = playExit(el, start.exit);
    animation.finished.then(start.onDone, () => {});
    return () => animation.cancel();
  }, [start]);
  const face = { word, direction, number };
  return (
    <div
      ref={ref}
      aria-hidden="true"
      inert
      data-review-leaving=""
      style={{ transform: exitStart(exit) }}
      className="pointer-events-none absolute inset-0"
    >
      <div className={cx(cardShell, "absolute inset-0")}>
        {revealed ? <AnswerFace {...face} folderName={folderName} /> : <QuestionFace {...face} />}
      </div>
      {exit.kind === "fly" && <Stamps visual={{ side: exit.outcome, locked: false, stamp: exit.stamp }} />}
    </div>
  );
}

/** Desktop answer footer, catalog-card «tracings»: «1. Повседневное   2. arg.   3. verl.». */
function Tracings({ folderName, word }: { folderName: string; word: Word }) {
  const items: ReactNode[] = [
    folderName,
    <AbbrHint key="level" abbr={SLANG_LABELS[word.slang_level]} lang={word.slang_level === 0 ? "ru" : "fr"} className="text-[14px]" />,
  ];
  if (word.verlan) items.push(<AbbrHint key="verlan" abbr="verl." className="text-[14px]" />);
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

/** Ruled front: a 1px blue-grey line every 32px from 32px under the red rule (from 768). */
function CardRules() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-0 top-8 bottom-6 bg-[linear-gradient(var(--card-lines)_0_1px,transparent_1px)] bg-size-[100%_32px] max-md:hidden"
    />
  );
}

/**
 * The card while the queue loads (MOTION-SPEC R1): the question side's exact frame — same slot,
 * header with the red rule, ruled front from 768 — with no text. After --loading-delay two static
 * skeleton bars appear where the headword and the POS line will be (8px × 40 %, 6px × 24 %); a read
 * that lands sooner never paints them. The real card then writes its text in over the same frame.
 */
export function ReviewCardPlaceholder() {
  return (
    <div data-review-placeholder="" aria-hidden="true" className={cardSlot}>
      <div className={cx(cardShell, "absolute inset-0")}>
        <CardHeader label="" />
        <span className={questionBody}>
          <CardRules />
          {/* Line boxes of a short headword and its POS line (phone 44 + 8 + 20; from 768 the
              step-1 boxes on ruled lines 2 and 3), so the bars sit where the text will. */}
          <span className="relative flex h-11 pt-3.5 md:mt-(--hw1-top) md:h-16 md:pt-[25px]">
            <SkeletonBar width="40%" height={8} className="delayed-in" />
          </span>
          <span className="relative mt-2 flex h-5 pt-[7px] md:mt-(--hw1-pos) md:h-8 md:pt-[9px]">
            <SkeletonBar width="24%" height={6} className="delayed-in" />
          </span>
        </span>
        <span className="mx-5 h-12 shrink-0 md:mx-10" />
      </div>
    </div>
  );
}
