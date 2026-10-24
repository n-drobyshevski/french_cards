"use client";

// The wait screen (board Review-Wait; SPEC «План дня и уровень языка»): nothing is left right now,
// but learning cards come back later today. «Ещё 3 карточки — через 12 мин», the waiting words,
// «Пока можно: Упражнения ›» and «Готово на сегодня» (the done screen; the cards stay due and come
// back on the next visit). The minutes swap once a minute; the screen itself returns to the cards
// when the first one comes due (ReviewScreen re-reads then).
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icons";
import type { QueueItem } from "@/lib/session";
import { moreCards, waitIn } from "./plan-format";

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

export function WaitScreen({ waiting, onDone, desktop = false }: WaitScreenProps) {
  const now = useMinuteClock();
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The card's button is gone: focus the heading so it is read out and Tab starts here.
  useEffect(() => {
    if (desktop) titleRef.current?.focus({ preventScroll: true });
  }, [desktop]);
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
          <p className="m-0 mt-3 max-w-[34ch] text-[15px] leading-[22px] text-muted md:max-w-[52ch]">
            Эти слова вы только что учили. Их нужно увидеть ещё раз чуть позже — так они лучше запоминаются.
          </p>
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
