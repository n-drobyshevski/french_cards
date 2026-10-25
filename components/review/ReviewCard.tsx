"use client";

import { memo, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { AbbrHint } from "@/components/ui/AbbrHint";
import { IconButton } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { SkeletonBar } from "@/components/ui/Skeleton";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { FoldRow, foldSummary } from "@/components/ui/FoldRow";
import { InkUnderline } from "@/components/ui/InkUnderline";
import { LevelMark } from "@/components/library/LevelMark";
import { useLevelData } from "@/lib/use-level-data";
import type { LevelInfo } from "@/lib/core/level";
import { prefersReducedMotion, REDUCED_MOTION_QUERY, tokenMs } from "@/lib/motion";
import { MEDIUM_QUERY, useMediaQuery } from "@/lib/use-media";
import { fieldsForDisplay } from "@/lib/core/custom-fields";
import { SLANG_LABELS, type Direction, type FieldDef, type Word } from "@/lib/types";
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
import { exampleMatch, headwordStep, posAbbr, type HeadwordStep } from "./format";
import { deckEdges, flyOut, stackPose, swipeVisual, type SwipeOutcome, type SwipeVisual } from "./swipe";
import { useSwipe } from "./useSwipe";
import { useShowOrigin } from "@/lib/use-show-origin";
import { CardHeader, cardShell } from "./card-parts";

/**
 * The card's place in the column (phone: fills it, 12px clear below for the deck edges; from 768:
 * the fixed index card). Shared with the placeholder.
 */
const cardSlot =
  "relative mt-3 mb-3 flex min-h-[280px] flex-1 flex-col md:mt-0 md:mb-0 md:h-(--card-h) md:max-h-full md:min-h-0 md:w-(--card-w) md:max-w-full md:flex-none";

/**
 * Body of the question side: the prompt centred on phones (46px under it balances the header, as
 * there is no footer on phones), on the ruled lines from 768.
 */
const questionBody = "relative flex min-h-0 flex-1 flex-col justify-center px-6 pb-[46px] md:justify-start md:px-10 md:pb-0";

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

/** «FR» on phones («FR · ПРАКТИКА» in a practice round, spec change §4); «FR · № 001» from 768 up. */
function CallNumber({ side, number, practice = false }: { side: string; number?: string; practice?: boolean }) {
  return (
    <>
      {side}
      {practice && <span className="md:hidden"> · ПРАКТИКА</span>}
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

/** Phone deck edges, deepest first: 5 / 10 / 15px in from the sides, 4 / 8 / 12px lower. */
const PHONE_EDGES = ["inset-x-[15px] top-3", "inset-x-[10px] top-2", "inset-x-[5px] top-1"] as const;

/**
 * Behind the card from 768 up: one outline per card still to come, up to two (DESKTOP-SPEC §3).
 * They stay put while two or more remain; the deepest fades out --dur-quick when fewer do (D1).
 * Phones (spec change §2): 1–3 hairline edges under the card by `edges` (`deckEdges`); the deepest
 * fades out --dur-quick when a threshold is crossed (reduced motion: the fade only, it never moves).
 */
export function CardStack({ count, edges = 0 }: { count: number; edges?: number }) {
  const outline =
    "absolute inset-0 rounded-card border border-rule bg-paper transition-opacity duration-(--dur-quick) ease-standard max-md:hidden";
  return (
    <>
      <div aria-hidden="true" className={cx(outline, "translate-x-2 translate-y-2", count < 2 && "opacity-0")} />
      <div aria-hidden="true" className={cx(outline, "translate-x-1 translate-y-1", count < 1 && "opacity-0")} />
      {PHONE_EDGES.map((place, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-deck-edge={edges >= PHONE_EDGES.length - i ? "" : undefined}
          className={cx(
            "absolute h-full rounded-card border border-edge bg-surface transition-opacity duration-(--dur-quick) ease-standard md:hidden",
            place,
            edges < PHONE_EDGES.length - i && "opacity-0",
          )}
        />
      ))}
    </>
  );
}

/**
 * The card's place on the screen: the desktop outlines (phone edges) behind, then the cards — the
 * current one, and over it any graded card still on its way out (`LeavingCard`). It stays mounted
 * from card to card, so a card leaving outlives the swap to the next one.
 */
export function CardDeck({ remaining, children }: { remaining: number; children?: ReactNode }) {
  return (
    <div data-review-focus="" className={cardSlot}>
      <CardStack count={Math.min(2, remaining)} edges={deckEdges(remaining + 1)} />
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
  /** Shared «Свои поля» definitions, for the answer side (its shared fields under their current names). */
  fieldDefs?: readonly FieldDef[];
  /** A card never reviewed: the question side carries the outlined «НОВОЕ» tag (D3 B). */
  isNew?: boolean;
  /** A practice round's card (phones): dashed ink header rule, «FR · ПРАКТИКА». */
  practice?: boolean;
}

/** «Свои поля» the answer side lists; the rest are counted («+2 поля»). */
const CARD_FIELDS = 3;
const FIELD_FORMS = ["поле", "поля", "полей"] as const;
const fieldsWord = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? FIELD_FORMS[0] : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? FIELD_FORMS[1] : FIELD_FORMS[2];
};

/**
 * The word's filled «Свои поля» after the examples: label in the mono meta style, the value muted
 * like the note. Up to three; more are counted in a muted line (the word's view has them all).
 */
function CardFields({ word, defs }: { word: Word; defs: readonly FieldDef[] }) {
  const fields = fieldsForDisplay(word, defs);
  if (fields.length === 0) return null;
  const shown = fields.slice(0, CARD_FIELDS);
  const more = fields.length - shown.length;
  return (
    <dl data-card-fields="" className="m-0 mt-5 flex flex-col gap-2.5 border-t border-rule pt-4 md:mt-4 md:gap-2">
      {shown.map((f) => (
        <div key={f.key} className="flex flex-col gap-0.5">
          <dt className="meta leading-4">{f.label}</dt>
          <dd className="m-0 font-serif text-[16px] leading-[22px] break-words text-muted md:text-[17px] md:leading-6">{f.value}</dd>
        </div>
      ))}
      {more > 0 && (
        <p className="m-0 text-[12px] leading-4 text-muted">
          +{more} {fieldsWord(more)}
        </p>
      )}
    </dl>
  );
}

/**
 * Question side: call number, the prompt (with its POS line) and, from 768, the «перевернуть» footer.
 * Memoised, like AnswerFace: a drag re-renders the card's layers every frame, not its text.
 */
const QuestionFace = memo(function QuestionFace({
  word,
  direction,
  number,
  isNew = false,
  practice = false,
  newId,
  headRef,
  writeIn,
  footerIn,
}: CardFace & {
  /** The live card's tag id: the question button is described by it («новая карточка»). */
  newId?: string;
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
        practice={practice}
        label={
          <span className={cx(writeIn)}>
            <CallNumber side={fromFr ? "FR" : "RU"} number={number} practice={practice} />
          </span>
        }
      >
        {isNew && (
          <span
            className={cx(
              "inline-flex h-5 items-center rounded-[2px] border border-ink px-1.5 font-mono text-[11px] font-medium tracking-[.06em] text-ink",
              writeIn,
            )}
          >
            <span aria-hidden="true">НОВОЕ</span>
            {newId && (
              <span id={newId} className="sr-only">
                новая карточка
              </span>
            )}
          </span>
        )}
      </CardHeader>
      <span className={questionBody}>
        <CardRules />
        <span ref={headRef} className="relative flex flex-col">
          <span
            lang={fromFr ? "fr" : undefined}
            className={cx(
              "relative origin-top-left font-serif font-medium tracking-[-0.015em] break-words md:tracking-[-0.02em]",
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
      {/* From 768 only: on phones the whole card is the tap target (spec change §1). */}
      <span
        className={cx(
          "mx-10 flex h-12 shrink-0 items-center gap-1.5 border-t border-rule text-[13px] leading-5 text-muted max-md:hidden",
          writeIn || (footerIn && WRITE_IN),
        )}
      >
        <Icon name="flip" size={14} />
        <span className="ml-0.5">Щелчок или</span>
        <Kbd aria-hidden="true">Пробел</Kbd>
        <span>— перевернуть</span>
      </span>
    </>
  );
});

/**
 * Answer side from 768: headword and POS, then the answer block (meter, translation, note, examples,
 * «Свои поля», tracings footer). Phones: `PhoneAnswer`.
 */
const AnswerFace = memo(function AnswerFace({
  word,
  direction,
  number,
  fieldDefs = [],
  practice = false,
  folderName,
  headRef,
  write,
  swipeEnabled,
  onEdit,
  onMute,
  onDelete,
  editKey = false,
}: CardFace & {
  folderName: string;
  headRef?: Ref<HTMLDivElement>;
  /** The answer block's write-in, when the card has just been turned to this side. */
  write?: string | false;
  swipeEnabled?: boolean;
  /** Pencil in the header: «Изменить карточку» (opens the word's sheet). */
  onEdit?: () => void;
  /** Before the pencil: «На паузу» (the word stays in the library, out of review). */
  onMute?: () => void;
  /** Before the pencil: «Удалить слово». */
  onDelete?: () => void;
  /** `E` opens it too (single-letter keys on); named in the pencil's tooltip. */
  editKey?: boolean;
}) {
  const [bodyRef, clipped] = useClippedBelow<HTMLDivElement>();
  const desk = useMediaQuery(MEDIUM_QUERY);
  const origin = useShowOrigin() ? word.origin : null;
  // «Уровень языка» on the answer side only (D5 A): «нейтр. · ≈B1».
  const level = useLevelData().level(word);
  // Phones (L-Review-Ans-B): the side is mounted only after a tap, so the media query is settled.
  if (!desk) {
    return (
      <PhoneAnswer
        word={word}
        direction={direction}
        practice={practice}
        fieldDefs={fieldDefs}
        folderName={folderName}
        origin={origin}
        level={level}
        headRef={headRef}
        write={write}
        swipeEnabled={swipeEnabled}
        onEdit={onEdit}
      />
    );
  }
  // Their own taps: neither a flip back nor the start of a swipe.
  const headerButton = (icon: "mute" | "trash" | "pencil", label: string, run: () => void, extra: { title?: string; keys?: string; last?: boolean } = {}) => (
    <IconButton
      icon={icon}
      label={label}
      title={extra.title ?? label}
      aria-keyshortcuts={extra.keys}
      iconSize={18}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        run();
      }}
      className={cx("text-muted md:size-9 hoverable:bg-hover-surface hoverable:text-ink", extra.last ? "-mr-3 md:-mr-2" : "-mr-1 md:mr-0")}
    />
  );
  const pos = posAbbr(word);
  const step = headwordStep(direction === "fr_ru" ? word.fr : word.ru, word.fr);
  return (
    <>
      <CardHeader label={<CallNumber side={direction === "fr_ru" ? "FR" : "RU"} number={number} />}>
        <span className={cx("flex items-center gap-1", write)}>
          <SlangMeter level={word.slang_level} verlan={word.verlan} hints hintAlign="end" />
          {level && (
            <>
              <span aria-hidden="true" className="abbr ml-1 text-[15px] leading-5">
                ·
              </span>
              <LevelMark info={level} size="header" className="ml-1" />
            </>
          )}
          {(onEdit || onMute || onDelete) && <span aria-hidden="true" className="ml-2 h-5 w-px bg-rule" />}
          {onMute && headerButton("mute", "На паузу", onMute, { title: "На паузу — слово останется в библиотеке, но не будет в повторениях" })}
          {onDelete && headerButton("trash", "Удалить слово", onDelete)}
          {onEdit &&
            headerButton("pencil", "Изменить карточку", onEdit, {
              title: editKey ? "Изменить карточку (E)" : "Изменить карточку",
              keys: editKey ? "E" : undefined,
              last: true,
            })}
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
          {origin && (
            <p className="mt-2 mb-0 max-w-[32ch] text-[13px] leading-5 text-muted md:max-w-[60ch] md:text-[14px]">
              <span className="meta mr-1.5">Откуда</span>
              {origin}
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
          <CardFields word={word} defs={fieldDefs} />
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
});

/** Phone answer headword: 32/40 for a short one (L-Review-Ans-B), stepping down for long expressions. */
function answerSize(text: string): string {
  if (text.length <= 16) return "text-[32px] leading-10";
  if (text.length <= 28) return "text-[28px] leading-9";
  return "text-[24px] leading-[30px]";
}

/** The answer block's write-in on phones ends this long after the tap: the underline draws then (D4 Bold). */
const UNDERLINE_AFTER_MS = 360;

/** The example with the headword underlined in red ink (drawn once when the side has just turned). */
function InkExample({ text, headword, draw }: { text: string; headword: string; draw: boolean }) {
  const match = exampleMatch(text, headword);
  if (!match) return <>{text}</>;
  const [start, end] = match;
  return (
    <>
      {text.slice(0, start)}
      <InkUnderline animate={draw} delay={draw ? UNDERLINE_AFTER_MS : 0} className="[&>[data-ink-underline]]:bottom-[5px]">
        {text.slice(start, end)}
      </InkUnderline>
      {text.slice(end)}
    </>
  );
}

/** One line in the answer side's fold: the mono label, then the value. */
function FoldLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="meta leading-4">{label}</dt>
      <dd className="m-0 text-[14px] leading-5 break-words text-muted">{children}</dd>
    </div>
  );
}

/**
 * The phone answer side (L-Review-Ans-B, spec change §7): headword, POS, the meter and the pencil in
 * the header, the translation and one example with the headword underlined. Everything else the
 * word has — note, origin, a second example, «Свои поля», ≈level, theme — opens in place under
 * «Ещё · …» at the card's foot. «На паузу» and «Удалить слово» are in the word's sheet (the pencil).
 */
function PhoneAnswer({
  word,
  direction,
  practice,
  fieldDefs,
  folderName,
  origin,
  level,
  headRef,
  write,
  swipeEnabled,
  onEdit,
}: {
  word: Word;
  direction: Direction;
  practice: boolean;
  fieldDefs: readonly FieldDef[];
  folderName: string;
  origin: string | null | undefined;
  level: LevelInfo | null;
  headRef?: Ref<HTMLDivElement>;
  write?: string | false;
  swipeEnabled?: boolean;
  onEdit?: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const foldRef = useRef<HTMLDivElement>(null);
  const pos = posAbbr(word);
  const fields = fieldsForDisplay(word, fieldDefs);
  const second = word.extra_examples?.[0];
  const drawn = !!write;
  const summary =
    foldSummary([word.note && "заметка", origin && "происхождение", second?.fr && "второй пример", fields.length > 0 && "свои поля"]) ||
    foldSummary([level && "уровень", "тема"]);
  // Opened at the card's foot: once it has grown, scroll the card so the fold's text is in view.
  const onFold = (open: boolean) => {
    if (!open) return;
    window.setTimeout(() => {
      const body = bodyRef.current;
      const fold = foldRef.current;
      if (!body || !fold) return;
      const top = fold.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 8;
      body.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }, tokenMs("--dur-move", 200));
  };
  // Their own taps: neither a flip back nor the start of a swipe.
  const own = {
    onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  };
  return (
    <>
      <CardHeader practice={practice} label={<CallNumber side={direction === "fr_ru" ? "FR" : "RU"} practice={practice} />}>
        <span className={cx("flex items-center gap-2", write)}>
          <SlangMeter level={word.slang_level} verlan={word.verlan} hints hintAlign="end" hideNeutral fillIn={drawn} fillDelay={120} />
          {onEdit && (
            <IconButton
              icon="pencil"
              label="Изменить карточку"
              iconSize={18}
              {...own}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="-mr-4 text-muted"
            />
          )}
        </span>
      </CardHeader>

      {/* The scroller needs pan-y too (see the desktop side). */}
      <div ref={bodyRef} className={cx("flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pt-8", swipeEnabled && "touch-pan-y")}>
        <div ref={headRef} className="flex flex-col">
          <h2 lang="fr" className={cx("m-0 origin-top-left font-serif font-medium tracking-[-0.01em] break-words", answerSize(word.fr))}>
            {word.fr}
          </h2>
          {pos && (
            <span className="mt-0.5 flex">
              <AbbrHint abbr={pos} className="text-[15px] leading-5" />
            </span>
          )}
        </div>
        <div className={cx("flex flex-col pb-6", write)}>
          <p className="mt-6 mb-0 text-[24px] leading-8 font-medium break-words">{word.ru}</p>
          {(word.example_fr || word.example_ru) && (
            <div className="mt-8 flex flex-col gap-1">
              {word.example_fr && (
                <span lang="fr" className="font-serif text-[19px] leading-7 italic">
                  <InkExample text={word.example_fr} headword={word.fr} draw={drawn} />
                </span>
              )}
              {word.example_ru && <span className="text-[14px] leading-5 text-muted">{word.example_ru}</span>}
            </div>
          )}
        </div>
        <div ref={foldRef} {...own} className={cx("mt-auto", write)}>
          <FoldRow summary={summary} rule="none" onOpenChange={onFold} className="border-t border-rule" buttonClassName="h-12! text-[13px]!">
            <dl data-card-fold="" className="m-0 flex flex-col gap-3 pt-1 pb-5">
              {word.note && (
                <FoldLine label="Заметка">
                  <span className="whitespace-pre-line">{word.note}</span>
                </FoldLine>
              )}
              {origin && <FoldLine label="Откуда">{origin}</FoldLine>}
              {second?.fr && (
                <FoldLine label="Ещё пример">
                  <span lang="fr" className="block font-serif text-[17px] leading-6 text-ink italic">
                    {second.fr}
                  </span>
                  {second.ru && <span className="block">{second.ru}</span>}
                </FoldLine>
              )}
              {fields.map((f) => (
                <FoldLine key={f.key} label={f.label}>
                  <span className="font-serif text-[16px] leading-[22px]">{f.value}</span>
                </FoldLine>
              ))}
              {level && (
                <FoldLine label="Уровень">
                  <LevelMark info={level} size="header" />
                </FoldLine>
              )}
              <FoldLine label="Тема">
                <span className="text-ink">{folderName}</span>
              </FoldLine>
            </dl>
          </FoldRow>
        </div>
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
 * Edge marks (D4 Bold, phones): while the card is dragged, a 2×24 rule inside each side of the deck
 * — «Не знаю» (--again) left, «Знаю» (--good) right — at 30 % as the drag starts. The side the card
 * heads for darkens on the stamp's curve, the other fades out; they leave in --dur-quick on release.
 * Opacity only, so reduced motion keeps them; the side, not the colour, says which grade it is.
 */
function EdgeMarks({ visual, dragging }: { visual: SwipeVisual; dragging: boolean }) {
  const rest = 0.3;
  const opacity = (side: SwipeOutcome) =>
    !dragging ? 0 : visual.side === side ? rest + (1 - rest) * visual.stamp : visual.side ? rest * (1 - visual.progress) : rest;
  return (
    <>
      {(["again", "good"] as const).map((side) => (
        <span
          key={side}
          aria-hidden="true"
          data-edge-mark={side}
          style={{ opacity: opacity(side), transition: dragging ? "none" : "opacity var(--dur-quick) var(--ease-standard)" }}
          className={cx("pointer-events-none absolute top-1/2 z-10 -mt-3 h-6 w-0.5 md:hidden", side === "good" ? "right-1 bg-good" : "left-1 bg-again")}
        />
      ))}
    </>
  );
}

/** The headword's font size (px) in a head block (its first child). */
function fontSize(head: HTMLElement): number | null {
  const word = head.firstElementChild;
  const size = word ? parseFloat(getComputedStyle(word).fontSize) : NaN;
  return Number.isFinite(size) ? size : null;
}

/**
 * The next card behind the current one (R5, phones): its real question side, inert, scaled from its
 * bottom edge to .97 / 4 px — the deck's first edge — growing with a drag towards .985 / 2 px. When the current card leaves, the next one mounts in its
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
    <div ref={ref} aria-hidden="true" inert data-review-stack="" style={style} className={cx(cardShell, "absolute inset-0 origin-bottom md:hidden")}>
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
  /** «На паузу» and «Удалить слово» before the pencil. */
  onMute?: () => void;
  onDelete?: () => void;
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
  fieldDefs,
  isNew = false,
  practice = false,
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
  onMute,
  onDelete,
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
  const newId = useId();

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
  // Phones set the answer's headword smaller (L-Review-Ans-B), so it also scales from the size it had.
  const headTop = useRef<{ question: number | null; answer: number | null }>({ question: null, answer: null });
  const headSize = useRef<{ question: number | null; answer: number | null }>({ question: null, answer: null });
  const shownSide = useRef(revealed);
  useLayoutEffect(() => {
    if (shownSide.current === revealed) return;
    shownSide.current = revealed;
    const head = revealed ? answerHeadRef.current : questionHeadRef.current;
    const face = revealed ? answerRef.current : questionRef.current;
    const from = revealed ? headTop.current.question : headTop.current.answer;
    if (!head || !face || from === null || window.matchMedia("(min-width: 48rem)").matches) return;
    const fromSize = revealed ? headSize.current.question : headSize.current.answer;
    const toSize = fontSize(head);
    playHeadwordGlide(head, from - topWithin(head, face), fromSize && toSize ? fromSize / toSize : 1);
  }, [revealed]);
  useLayoutEffect(() => {
    // A drag only moves the layers (transforms), so the headword's place in the face holds: no
    // layout read on every pointermove.
    if (mode === "dragging") return;
    const head = revealed ? answerHeadRef.current : questionHeadRef.current;
    const face = revealed ? answerRef.current : questionRef.current;
    if (!head || !face) return;
    const side = revealed ? "answer" : "question";
    headTop.current[side] = topWithin(head, face);
    headSize.current[side] = fontSize(head);
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
      <div
        ref={layerRef}
        data-review-card=""
        style={motion}
        className={cx("absolute inset-0 will-change-transform max-md:origin-bottom", mode === "dragging" && "cursor-grabbing select-none [&_*]:cursor-grabbing")}
      >
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
              aria-describedby={isNew ? newId : undefined}
              aria-keyshortcuts="Space"
              data-review-reveal=""
              className={cx(cardShell, "absolute inset-0 text-left", swipeEnabled && "touch-pan-y pointer-coarse:select-none")}
            >
              <QuestionFace
                word={word}
                direction={direction}
                number={number}
                isNew={isNew}
                practice={practice}
                newId={newId}
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
                fieldDefs={fieldDefs}
                practice={practice}
                folderName={folderName}
                headRef={answerHeadRef}
                write={flip === "up" && ANSWER_WRITE}
                swipeEnabled={swipeEnabled}
                onEdit={onEdit}
                onMute={onMute}
                onDelete={onDelete}
                editKey={editKey}
              />
            </article>
          )}
        </div>
        {swipeEnabled && <Stamps visual={visual} />}
      </div>
      {swipeEnabled && <EdgeMarks visual={visual} dragging={mode === "dragging"} />}
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
export function LeavingCard({ word, direction, number, fieldDefs, isNew, practice, revealed, folderName, exit, onDone }: LeavingCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [start] = useState(() => ({ exit, onDone }));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const animation = playExit(el, start.exit);
    animation.finished.then(start.onDone, () => {});
    return () => animation.cancel();
  }, [start]);
  const face = { word, direction, number, fieldDefs, isNew, practice };
  return (
    <div
      ref={ref}
      aria-hidden="true"
      inert
      data-review-leaving=""
      style={{ transform: exitStart(exit) }}
      className="pointer-events-none absolute inset-0 max-md:origin-bottom"
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
        <span className="mx-10 h-12 shrink-0 max-md:hidden" />
      </div>
    </div>
  );
}
