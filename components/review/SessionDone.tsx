"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { formatInterval } from "@/lib/scheduler";
import type { SessionFilter } from "@/lib/session";
import { loadDoneScreen } from "./data";
import { countWords, formatDayMonth, formatPercent, pluralRu } from "./format";

const HARD_LIMIT = 5;

export interface SessionDoneProps {
  filter: SessionFilter;
  /** Re-reads when it changes (focus, minute tick). */
  tick: number;
  onRepeatMistakes: () => void;
  onPractice: () => void;
  onAddWords: () => void;
  busy?: boolean;
  /** In-flow snackbar (undo of the last answer), shown above the actions. */
  snackbar?: ReactNode;
  /** 768 and up: focus lands on «Повторить ошибки» (or the heading), keys printed on the actions. */
  desktop?: boolean;
  /** Single-letter shortcuts are on (P and N caps). */
  letters?: boolean;
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-10 items-center gap-2 md:h-11 md:gap-3">
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
 */
export function SessionDone({
  filter,
  tick,
  onRepeatMistakes,
  onPractice,
  onAddWords,
  busy,
  snackbar,
  desktop = false,
  letters = true,
}: SessionDoneProps) {
  const data = useLiveQuery(() => loadDoneScreen(filter), [filter.direction, filter.folderId, tick]);
  const columnRef = useRef<HTMLDivElement>(null);
  const landed = useRef(false);
  const ready = !!data;

  useEffect(() => {
    if (!desktop || !ready || landed.current) return;
    landed.current = true;
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
  }, [desktop, ready]);

  if (!data) return <div className="flex-1" />;

  const { summary } = data;
  const next = nextLine(summary.dueTomorrow, data.nextDue, data.at);
  const hard = summary.hardWords.slice(0, HARD_LIMIT);
  const moreHard = summary.hardWords.length - hard.length;
  const day = formatDayMonth(new Date(data.at));
  const moreText = moreHard > 0 ? `И ещё ${moreHard} ${pluralRu(moreHard, ["слово", "слова", "слов"])}` : null;

  return (
    <div className="contents md:block md:min-h-0 md:flex-1 md:overflow-y-auto">
      <div
        ref={columnRef}
        className="contents md:mx-auto md:flex md:w-(--col-w) md:max-w-[calc(100%-48px)] md:flex-col md:pt-16 md:pb-6"
      >
        <span className="meta mt-8 leading-4 md:hidden">Сессия · {day}</span>
        <h1
          tabIndex={-1}
          className="mt-2 mb-0 font-serif text-[34px] leading-10 font-medium tracking-[-0.015em] outline-none md:mt-0 md:text-[40px] md:leading-[44px] md:tracking-[-0.02em] md:focus-visible:outline-2"
        >
          Готово на сегодня
        </h1>

        {summary.reviewed > 0 ? (
          <section aria-label="Итоги сессии" className="mt-6 border-y border-ink">
            <ReceiptRow label="Повторено" value={String(summary.reviewed)} />
            <ReceiptRow label="Новых" value={String(summary.newCount)} />
            <ReceiptRow label="Верно" value={formatPercent(summary.correctRate)} />
          </section>
        ) : (
          <p className="mt-6 mb-0 border-y border-ink py-2.5 text-[15px] leading-5 text-muted">Сегодня повторять нечего.</p>
        )}
        {next && <span className="meta mt-2 leading-4 md:hidden">{next}</span>}
        <p className="mt-3 mb-0 text-[13px] leading-5 text-muted tabular-nums max-md:hidden">
          {next ? `${day} · ${next}` : day}
        </p>

        {hard.length > 0 && (
          <section aria-labelledby="hard-title" className="mt-8 md:order-2 md:mt-10">
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

        <div className="flex shrink-0 flex-col gap-2 md:order-1 md:mt-5 md:flex-row md:flex-wrap md:items-center md:gap-x-4 md:gap-y-2">
          {summary.mistakes > 0 && (
            <Button
              block
              disabled={busy}
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
              disabled={busy}
              onClick={onPractice}
              aria-keyshortcuts={desktop && letters ? "P" : undefined}
              className="flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-btn border border-ink bg-surface text-ink active:bg-surface-2 disabled:opacity-40 md:h-11 md:w-auto md:flex-row md:gap-2 md:whitespace-nowrap md:rounded-chip md:border-0 md:bg-transparent md:px-2 hoverable:bg-hover"
            >
              <span className="text-[15px] leading-5 font-medium">Ещё практика</span>
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
