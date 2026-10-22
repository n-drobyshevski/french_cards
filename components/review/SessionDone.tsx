"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Kbd } from "@/components/ui/Kbd";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { haptic } from "@/lib/haptics";
import { prefersReducedMotion } from "@/lib/motion";
import { formatInterval } from "@/lib/scheduler";
import { useDelayedFlag } from "@/lib/use-delayed-flag";
import type { DoneScreenData } from "./data";
import { countWords, formatDateStamp, formatDayMonth, formatPercent, pluralRu } from "./format";

const HARD_LIMIT = 5;

/** When the date stamp lands in the «Готово на сегодня» moment (§5.12), with the one `done` haptic. */
const STAMP_AT_MS = 1100;

export interface SessionDoneProps {
  /** The day's summary, read by the screen during the last grade's hold (R10). */
  data: DoneScreenData;
  /**
   * The session has just been finished: play the «Готово на сегодня» moment once (§5.12). Without
   * it (a cold open, back from practice) the view is simply there.
   */
  moment?: boolean;
  /** The «Вибрация» setting: one `done` haptic with the moment. */
  haptics?: boolean;
  onRepeatMistakes: () => void;
  onPractice: () => void;
  onAddWords: () => void;
  /**
   * A practice round is being built (R11): «mistakes» or «extra» is the pressed action, which shows
   * the pending pattern (§3.5); any other value only blocks both. Neither greys out.
   */
  pending?: string | null;
  /** In-flow snackbar (undo of the last answer), shown above the actions. */
  snackbar?: ReactNode;
  /** 768 and up: focus lands on «Повторить ошибки» (or the heading), keys printed on the actions. */
  desktop?: boolean;
  /** Single-letter shortcuts are on (P and N caps). */
  letters?: boolean;
}

/** A receipt row; the first and last carry the table's ink rules, so they rule in with their rows. */
function ReceiptRow({ label, value, edge, style }: { label: string; value: string; edge?: "top" | "bottom"; style?: CSSProperties }) {
  return (
    <div
      style={style}
      className={cx(
        "flex items-center gap-2 md:gap-3",
        edge ? "h-[41px] border-ink md:h-[45px]" : "h-10 md:h-11",
        edge === "top" && "border-t",
        edge === "bottom" && "border-b",
      )}
    >
      <span className="text-[15px]">{label}</span>
      <span aria-hidden="true" className="mt-1.5 h-0 flex-1 border-b border-dotted border-muted md:border-rule" />
      <span className="min-w-12 text-right font-mono text-[15px] font-medium tabular-nums md:font-normal">{value}</span>
    </div>
  );
}

/** «Следующие 18 слов — завтра» / «Следующий показ — через 4 д». */
function nextLine(dueTomorrow: number, nextDue: string | null, at: string): string | null {
  if (dueTomorrow === 1) return "Следующее слово — завтра";
  if (dueTomorrow > 1) return `Следующие ${countWords(dueTomorrow)} — завтра`;
  if (nextDue) return `Следующий показ — через ${formatInterval(Date.parse(nextDue) - Date.parse(at))}`;
  return null;
}

/** Keys pressed this soon after the view appears do not press its buttons (DESKTOP-SPEC §4 input guard). */
const INPUT_GUARD_MS = 400;

/**
 * «Готово на сегодня»: receipt table, hard words and the practice actions.
 * Phones: the actions sit at the bottom of the column. From 768 up (D-Session-Done): a 720 column
 * under the top, the actions in one row under the receipt with their keys (P, N), «Трудные» below;
 * focus lands on «Повторить ошибки» so ↵ / Пробел press it.
 *
 * Right after the last card (`moment`, §5.12, ≈1.4 s, once): the headline fades in over --dur-turn
 * while it settles 6px on --spring-lift; the red rule under it is drawn left → right; the receipt
 * rows rule in 40ms apart (numbers static), then «Трудные»; the date stamp lands (1.04 → 1,
 * --spring-stamp) with one `done` haptic; the actions fade in. Reduced motion: all of it fades in
 * together over 110ms, the rule drawn at once. No confetti, no count-up.
 */
export function SessionDone({
  data,
  moment = false,
  haptics = true,
  onRepeatMistakes,
  onPractice,
  onAddWords,
  pending = null,
  snackbar,
  desktop = false,
  letters = true,
}: SessionDoneProps) {
  const columnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!desktop) return;
    const root = columnRef.current;
    const target = root?.querySelector<HTMLElement>("[data-done-primary]:not(:disabled)") ?? root?.querySelector<HTMLElement>("h1");
    target?.focus({ preventScroll: true });
    // A held or quick key from the last card must not press the focused button.
    const until = performance.now() + INPUT_GUARD_MS;
    const swallow = (event: KeyboardEvent) => {
      if (event.timeStamp < until && (event.key === " " || event.key === "Enter")) event.preventDefault();
    };
    window.addEventListener("keydown", swallow, true);
    const timer = window.setTimeout(() => window.removeEventListener("keydown", swallow, true), INPUT_GUARD_MS);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", swallow, true);
    };
  }, [desktop]);

  // The moment's one haptic, with the stamp (its visual twin).
  const playMoment = useRef(moment);
  useEffect(() => {
    if (!playMoment.current || !haptics) return;
    const timer = window.setTimeout(() => haptic("done"), prefersReducedMotion() ? 0 : STAMP_AT_MS);
    return () => window.clearTimeout(timer);
  }, [haptics]);

  /** One beat of the moment: `animation` starting `ms` after the view appears (at once under reduced motion). */
  const beat = (animation: string, ms: number): CSSProperties | undefined =>
    moment ? { animation: animation.replaceAll("$at", `calc(${ms}ms * var(--motion-scale))`) } : undefined;
  const rise = (ms: number) => beat("enter-rise var(--dur-enter) var(--ease-enter) $at both", ms);
  const fade = (ms: number) => beat("fade-in var(--dur-quick) var(--ease-enter) $at both", ms);

  const { summary } = data;
  const next = nextLine(summary.dueTomorrow, data.nextDue, data.at);
  const hard = summary.hardWords.slice(0, HARD_LIMIT);
  const moreHard = summary.hardWords.length - hard.length;
  const date = new Date(data.at);
  const day = formatDayMonth(date);
  const moreText = moreHard > 0 ? `И ещё ${moreHard} ${pluralRu(moreHard, ["слово", "слова", "слов"])}` : null;
  // R11: the queue is local, so the pending label almost never shows (150 ms delay); until then the
  // pressed action and its sibling just stop taking taps at full contrast.
  const practiceSwapped = useDelayedFlag(pending === "extra", { delay: 150, min: 0 });

  return (
    <div data-session-done="" data-moment={moment ? "" : undefined} className="contents md:block md:min-h-0 md:flex-1 md:overflow-y-auto">
      <div
        ref={columnRef}
        className="contents md:mx-auto md:flex md:w-(--col-w) md:max-w-[calc(100%-48px)] md:flex-col md:pt-16 md:pb-6"
      >
        <div
          style={beat("fade-in var(--dur-turn) linear $at both, settle-rise 480ms var(--spring-lift) $at both", 0)}
          className="flex shrink-0 flex-col"
        >
          <span className="meta mt-8 leading-4 md:hidden">Сессия · {day}</span>
          <div className="mt-2 flex items-center justify-between gap-3 md:mt-0">
            <h1
              tabIndex={-1}
              className="m-0 font-serif text-[34px] leading-10 font-medium tracking-[-0.015em] outline-none md:text-[40px] md:leading-[44px] md:tracking-[-0.02em] md:focus-visible:outline-2"
            >
              Готово на сегодня
            </h1>
            {/* The date stamp (§5.12): 1.5px ink border, −4°, landing like a rubber stamp. */}
            <span
              aria-hidden="true"
              data-date-stamp=""
              style={beat(`fade-in var(--dur-instant) linear $at both, stamp-land 300ms var(--spring-stamp) $at both`, STAMP_AT_MS)}
              className="mr-0.5 inline-flex h-[23px] shrink-0 -rotate-4 items-center rounded-[2px] border-[1.5px] border-ink px-1.5 font-mono text-[13px] leading-4 font-medium tabular-nums"
            >
              {formatDateStamp(date)}
            </span>
          </div>
        </div>
        {/* The 2px red rule under the headline, drawn left → right. */}
        <div
          aria-hidden="true"
          data-done-rule=""
          style={beat("rule-draw var(--dur-rule-draw) linear $at both", 320)}
          className="mt-2 h-0.5 shrink-0 origin-left bg-red"
        />

        {summary.reviewed > 0 ? (
          <section aria-label="Итоги сессии" className="mt-3.5">
            <ReceiptRow label="Повторено" value={String(summary.reviewed)} edge="top" style={rise(720)} />
            <ReceiptRow label="Новых" value={String(summary.newCount)} style={rise(760)} />
            <ReceiptRow label="Верно" value={formatPercent(summary.correctRate)} edge="bottom" style={rise(800)} />
          </section>
        ) : (
          <p style={rise(720)} className="mt-3.5 mb-0 border-y border-ink py-2.5 text-[15px] leading-5 text-muted">
            Сегодня повторять нечего.
          </p>
        )}
        {next && (
          <span style={fade(1400)} className="meta mt-2 leading-4 md:hidden">
            {next}
          </span>
        )}
        <p style={fade(1400)} className="mt-3 mb-0 text-[13px] leading-5 text-muted tabular-nums max-md:hidden">
          {next ? `${day} · ${next}` : day}
        </p>

        {hard.length > 0 && (
          <section aria-labelledby="hard-title" style={rise(840)} className="mt-8 md:order-2 md:mt-10">
            <div className="flex h-4 items-baseline justify-between font-mono text-[11px] leading-4 tracking-[.06em] uppercase md:h-7 md:items-center md:justify-start md:gap-2 md:border-b md:border-ink md:font-sans md:tracking-normal md:normal-case">
              <h2 id="hard-title" className="m-0 text-[11px] font-normal text-muted md:text-[13px] md:leading-5 md:font-medium md:text-ink">
                Трудные
              </h2>
              <span className="font-medium text-red md:font-mono md:text-[12px] md:tabular-nums">{summary.hardWords.length}</span>
            </div>
            <ul className="m-0 mt-2 list-none border-t border-rule p-0 md:mt-0 md:border-t-0">
              {hard.map((w) => (
                <li
                  key={w.id}
                  className="flex h-11 items-center gap-3 border-b border-rule md:grid md:h-12 md:grid-cols-[200px_minmax(0,1fr)_120px] md:gap-0"
                >
                  <span lang="fr" className="max-w-[55%] shrink-0 truncate font-serif text-[19px] leading-6 font-medium md:max-w-none md:pr-4">
                    {w.fr}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-muted">{w.ru}</span>
                  <span className="flex w-[118px] shrink-0 md:w-auto">
                    <SlangMeter level={w.slang_level} verlan={w.verlan} />
                  </span>
                </li>
              ))}
            </ul>
            {moreText && (
              <>
                <p className="meta mt-2 mb-0 leading-4 md:hidden">{moreText}</p>
                <p className="mt-2 mb-0 text-[13px] leading-5 text-muted tabular-nums max-md:hidden">{moreText}</p>
              </>
            )}
          </section>
        )}

        <div className="min-h-4 flex-1 md:hidden" />
        {snackbar}

        <div
          style={fade(1400)}
          className="flex shrink-0 flex-col gap-2 md:order-1 md:mt-5 md:flex-row md:flex-wrap md:items-center md:gap-x-4 md:gap-y-2"
        >
          {summary.mistakes > 0 && (
            <Button
              block
              pending={pending === "mistakes"}
              pendingLabel="Подбираем…"
              blocked={pending != null}
              onClick={onRepeatMistakes}
              data-done-primary=""
              className="md:h-11 md:w-auto md:px-4 md:text-[14px] md:tabular-nums md:focus:outline-2 md:focus:outline-offset-2 md:focus:outline-ink"
            >
              Повторить ошибки ({summary.mistakes})
            </Button>
          )}
          <div className="contents md:flex md:items-center md:gap-2">
            <button
              type="button"
              aria-disabled={pending != null || undefined}
              aria-busy={pending === "extra" || undefined}
              onClick={(event) => {
                if (pending != null) {
                  event.preventDefault();
                  return;
                }
                onPractice();
              }}
              aria-keyshortcuts={desktop && letters ? "P" : undefined}
              className={cx(
                "flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-btn border border-ink bg-surface text-ink active:bg-surface-2 md:h-11 md:w-auto md:flex-row md:gap-2 md:whitespace-nowrap md:rounded-chip md:border-0 md:bg-transparent md:px-2 hoverable:bg-hover",
                pending != null && "pointer-events-none",
              )}
            >
              {/* Both labels in one cell: the button keeps the wider width (§3.5). */}
              <span className="grid text-[15px] leading-5 font-medium">
                <span
                  aria-hidden={practiceSwapped || undefined}
                  className={cx("col-start-1 row-start-1 transition-opacity duration-(--dur-exit) ease-exit", practiceSwapped && "opacity-0")}
                >
                  Ещё практика
                </span>
                <span
                  aria-hidden={!practiceSwapped || undefined}
                  className={cx(
                    "col-start-1 row-start-1 text-muted transition-opacity duration-(--dur-quick) ease-enter",
                    !practiceSwapped && "opacity-0",
                  )}
                >
                  Подбираем…
                </span>
              </span>
              {letters && (
                <Kbd aria-hidden="true" className="max-md:hidden">
                  P
                </Kbd>
              )}
              {/* At medium widths the row is too narrow for the note; it stays in the button's name. */}
              <span className="text-[12px] leading-4 text-muted md:max-xl:sr-only">не влияет на расписание</span>
            </button>
            <Button
              variant="tertiary"
              size="md"
              block
              onClick={onAddWords}
              aria-keyshortcuts={desktop && letters ? "N" : undefined}
              className="md:w-auto md:rounded-chip md:px-2 md:no-underline hoverable:bg-hover"
            >
              Добавить слова
              {letters && (
                <Kbd aria-hidden="true" className="max-md:hidden">
                  N
                </Kbd>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
