"use client";

// The wait screen (board Review-Wait; SPEC «План дня и уровень языка»): nothing is left right now,
// but learning cards come back later today. «Ещё 3 карточки — через 12 мин», the waiting words,
// «Пока можно: Упражнения ›» and «Готово на сегодня» (the done screen; the cards stay due and come
// back on the next visit). The minutes swap once a minute; the screen itself returns to the cards
// when the first one comes due (ReviewScreen re-reads then).
//
// Phones (mobile-research «Wait screen» B, «Линия возврата»): one headline «Через 12 мин — ещё 3
// карточки», the return timeline and «Готово на сегодня». No word list: the cards come back in
// minutes, so neither their answers nor their prompts are shown (the next recall must be a recall).
// «Почему позже?» opens the paragraph in place during the first sessions only (lib/first-run.ts).
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Collapse } from "@/components/ui/Collapse";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { useFirstRunHint } from "@/lib/first-run";
import type { QueueItem } from "@/lib/session";
import { CardGlyph } from "./CardGlyph";
import { moreCards, returnAxis, returnGroups, waitIn, waitTitle } from "./plan-format";

/** At most this many waiting words are listed. */
const ROWS_MAX = 5;

/** The current time, swapped once a minute (on the minute after the first tick). */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}

export interface WaitScreenProps {
  /** The waiting learning cards, soonest first. */
  waiting: readonly QueueItem[];
  /** «Готово на сегодня»: show the done screen now. */
  onDone: () => void;
  /** 768 and up: the heading takes focus when the screen replaces the card (like SessionDone). */
  desktop?: boolean;
}

const WHY_TEXT = "Эти слова вы только что учили. Их нужно увидеть ещё раз чуть позже — так они лучше запоминаются.";

export function WaitScreen({ waiting, onDone, desktop = false }: WaitScreenProps) {
  const now = useMinuteClock();
  if (!desktop) return <PhoneWait waiting={waiting} now={now} onDone={onDone} />;
  return <DeskWait waiting={waiting} now={now} onDone={onDone} />;
}

/** From 768 up: the headline, the paragraph, the waiting words and both actions (Review-Wait). */
function DeskWait({ waiting, now, onDone }: { waiting: readonly QueueItem[]; now: number; onDone: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The card's button is gone: focus the heading so it is read out and Tab starts here.
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);
  const first = waiting[0];
  // One row per word (both sides of a word may wait).
  const seen = new Set<string>();
  const rows = waiting.filter((item) => !seen.has(item.word.id) && seen.add(item.word.id)).slice(0, ROWS_MAX);
  const more = new Set(waiting.map((i) => i.word.id)).size - rows.length;
  const firstIn = first ? waitIn(Date.parse(first.state.due) - now) : "";

  return (
    <div data-review-wait="" className="contents md:block md:min-h-0 md:flex-1 md:overflow-y-auto">
      <div className="contents md:mx-auto md:flex md:w-(--col-w) md:max-w-[calc(100%-48px)] md:flex-col md:pt-16 md:pb-6">
        <section aria-labelledby="wait-title" className="mt-8 flex shrink-0 flex-col md:mt-0">
          <span className="meta leading-4">На сейчас всё</span>
          <h1
            ref={titleRef}
            id="wait-title"
            tabIndex={-1}
            className="m-0 mt-2 font-serif text-[32px] leading-[38px] font-medium tracking-[-0.015em] outline-none md:text-[40px] md:leading-[44px] md:tracking-[-0.02em] md:focus-visible:outline-2"
          >
            {moreCards(waiting.length)} — <span className="whitespace-nowrap">через {firstIn}</span>
          </h1>
          <p className="m-0 mt-3 max-w-[34ch] text-[15px] leading-[22px] text-muted md:max-w-[52ch]">{WHY_TEXT}</p>
          <ul className="m-0 mt-5 list-none border-t border-rule p-0">
            {rows.map((item) => (
              <li key={item.word.id} className="flex h-11 items-center gap-3 border-b border-rule">
                <span lang="fr" className="max-w-[50%] shrink-0 truncate font-serif text-[19px] leading-6 font-medium">
                  {item.word.fr}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-muted">{item.word.ru}</span>
                <span className="shrink-0 font-mono text-[11px] leading-4 tracking-[.06em] whitespace-nowrap text-muted uppercase tabular-nums">
                  через {waitIn(Date.parse(item.state.due) - now)}
                </span>
              </li>
            ))}
          </ul>
          {more > 0 && <p className="meta m-0 mt-2 leading-4">И ещё {more}</p>}
        </section>

        <div className="min-h-4 flex-1 md:hidden" />
        <div className="flex shrink-0 flex-col gap-2 md:mt-8 md:flex-row md:items-center md:gap-3">
          <Link
            href="/exercises"
            className="flex h-[52px] items-center gap-1.5 rounded-btn border border-rule bg-surface px-4 text-[15px] text-ink no-underline active:bg-surface-2 md:h-11 hoverable:bg-hover-surface"
          >
            <span className="text-muted">Пока можно:</span>{" "}
            <span className="font-medium">Упражнения</span>
            <span className="flex-1" />
            <Icon name="chevron-right" size={18} strokeWidth={1.5} className="shrink-0" />
          </Link>
          <button
            type="button"
            data-wait-done=""
            onClick={onDone}
            className="flex h-[52px] w-full cursor-pointer items-center justify-center rounded-btn border border-ink bg-surface text-[15px] leading-5 font-medium text-ink active:bg-surface-2 md:h-11 md:w-auto md:px-4 hoverable:bg-hover-surface"
          >
            Готово на сегодня
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Phones: «Через 12 мин — ещё 3 карточки», the return timeline, «Почему позже?» (first sessions
 * only) and the one action «Готово на сегодня».
 */
function PhoneWait({ waiting, now, onDone }: { waiting: readonly QueueItem[]; now: number; onDone: () => void }) {
  const first = waiting[0];
  const firstIn = first ? waitIn(Date.parse(first.state.due) - now) : "";
  return (
    <div data-review-wait="" className="contents">
      <div className="min-h-12 flex-1" />
      <section aria-labelledby="wait-title" className="flex shrink-0 flex-col">
        <h1 id="wait-title" className="m-0 font-serif text-[32px] leading-[38px] font-medium tracking-[-0.015em]">
          <span className="whitespace-nowrap">Через {firstIn} —</span> <span className="whitespace-nowrap">{waitTitle(waiting.length)}</span>
        </h1>
        <ReturnTimeline waiting={waiting} now={now} />
        <WhyLater />
      </section>
      <div className="min-h-4 flex-[2]" />
      <button
        type="button"
        data-wait-done=""
        onClick={onDone}
        className="press flex h-[52px] w-full shrink-0 cursor-pointer items-center justify-center rounded-btn border border-ink bg-surface text-[15px] leading-5 font-medium text-ink active:bg-surface-2"
      >
        Готово на сегодня
      </button>
    </div>
  );
}

/**
 * The return timeline: a hairline from the moment the screen opened to the axis end (1, 2, 4 … h),
 * one card outline per waiting card at its due minute (cards due together stack, up to three
 * outlines), mono labels under the axis, and the red «now» tick at the left. The tick steps once a
 * minute with the clock (translate over --dur-move; reduced motion: --dur-quick), never seconds:
 * when it reaches the first card the screen returns to that card by itself. The exact times are in
 * the accessible name.
 */
function ReturnTimeline({ waiting, now }: { waiting: readonly QueueItem[]; now: number }) {
  // The axis starts where the screen opened (to the minute), so the tick has somewhere to go.
  const [start] = useState(() => Math.floor(now / 60_000) * 60_000);
  const dues = waiting.map((item) => Date.parse(item.state.due));
  const axis = returnAxis(Math.max(...dues, now) - start);
  const groups = returnGroups(dues, start, axis.span);
  const at = Math.min(1, Math.max(0, (now - start) / axis.span));
  const label = `Карточки вернутся: ${groups.map((g) => `${g.count} через ${waitIn(g.due - now)}`).join(", ")}`;
  return (
    <div role="img" aria-label={label} data-return-timeline="" className="mt-10 shrink-0">
      <div className="relative h-[22px]">
        {groups.map((g) => (
          <span
            key={g.due}
            data-return-card=""
            style={{ left: `${g.at * 100}%` }}
            className="absolute bottom-[6px] -translate-x-1/2"
          >
            {/* Back to front: the outlines behind sit 2px up and right, the front one last. */}
            {Array.from({ length: Math.min(3, g.count) }, (_, n) => Math.min(3, g.count) - 1 - n).map((i) => (
              <CardGlyph key={i} className={i > 0 ? "absolute" : "relative block"} style={i > 0 ? { left: i * 2, top: -i * 2 } : undefined} />
            ))}
          </span>
        ))}
        {/* The axis: one hairline, a 5px foot under each card. */}
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-ink" />
        {groups.map((g) => (
          <span key={g.due} aria-hidden="true" style={{ left: `${g.at * 100}%` }} className="absolute bottom-0 h-[6px] w-px bg-ink" />
        ))}
        <span aria-hidden="true" className="absolute right-0 bottom-0 h-[6px] w-px bg-ink" />
        {/* «Now»: a 2px red tick, a step to the right each minute. */}
        <span
          aria-hidden="true"
          data-return-now=""
          style={{ translate: `${at * 100}% 0` }}
          className="pointer-events-none absolute inset-x-0 -bottom-1.5 h-[18px] transition-[translate] duration-(--dur-move) ease-standard motion-reduce:transition-none"
        >
          <span className="absolute left-0 h-full w-0.5 bg-red" />
        </span>
      </div>
      <div aria-hidden="true" className="relative mt-2.5 h-4 font-mono text-[11px] leading-4 tracking-[.06em] text-muted uppercase tabular-nums">
        <span className="absolute left-0 text-ink">Сейчас</span>
        {axis.marks.map((m) => (
          <span key={m.at} style={{ left: `${m.at * 100}%` }} className={cx("absolute", m.at === 1 ? "right-0 left-auto!" : "-translate-x-1/2")}>
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** «Почему позже? ⌄»: the paragraph, opened in place; shown during the first sessions only. */
function WhyLater() {
  const hint = useFirstRunHint("wait-why");
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  if (!hint.show) return null;
  return (
    <div className="mt-6">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
        className="-ml-0.5 flex h-11 items-center gap-1 bg-transparent px-0.5 text-[14px] leading-5 text-muted active:text-ink"
      >
        Почему позже?
        <Icon
          name="chevron"
          size={16}
          className={cx("transition-[rotate] duration-(--dur-move) ease-standard motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>
      <div id={bodyId}>
        <Collapse open={open}>
          <p className="m-0 max-w-[34ch] pb-1 text-[15px] leading-[22px] text-muted">{WHY_TEXT}</p>
        </Collapse>
      </div>
    </div>
  );
}
