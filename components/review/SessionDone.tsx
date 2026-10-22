"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
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
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-10 items-center gap-2">
      <span className="text-[15px]">{label}</span>
      <span aria-hidden="true" className="mt-1.5 h-0 flex-1 border-b border-dotted border-muted" />
      <span className="min-w-12 text-right font-mono text-[15px] font-medium">{value}</span>
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

/** «Готово на сегодня»: receipt table, hard words and the practice actions. */
export function SessionDone({ filter, tick, onRepeatMistakes, onPractice, onAddWords, busy, snackbar }: SessionDoneProps) {
  const data = useLiveQuery(() => loadDoneScreen(filter), [filter.direction, filter.folderId, tick]);
  if (!data) return <div className="flex-1" />;

  const { summary } = data;
  const next = nextLine(summary.dueTomorrow, data.nextDue, data.at);
  const hard = summary.hardWords.slice(0, HARD_LIMIT);
  const moreHard = summary.hardWords.length - hard.length;

  return (
    <>
      <span className="meta mt-8 leading-4">Сессия · {formatDayMonth(new Date(data.at))}</span>
      <h1 tabIndex={-1} className="mt-2 mb-0 font-serif text-[34px] leading-10 font-medium tracking-[-0.015em] outline-none">
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
      {next && <span className="meta mt-2 leading-4">{next}</span>}

      {hard.length > 0 && (
        <section aria-labelledby="hard-title" className="mt-8">
          <div className="flex h-4 items-baseline justify-between font-mono text-[11px] leading-4 tracking-[.06em] uppercase">
            <h2 id="hard-title" className="m-0 text-[11px] font-normal text-muted">
              Трудные
            </h2>
            <span className="font-medium text-red">{summary.hardWords.length}</span>
          </div>
          <ul className="m-0 mt-2 list-none border-t border-rule p-0">
            {hard.map((w) => (
              <li key={w.id} className="flex h-11 items-center gap-3 border-b border-rule">
                <span lang="fr" className="max-w-[55%] shrink-0 truncate font-serif text-[19px] leading-6 font-medium">
                  {w.fr}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-muted">{w.ru}</span>
                <span className="flex w-[118px] shrink-0">
                  <SlangMeter level={w.slang_level} verlan={w.verlan} />
                </span>
              </li>
            ))}
          </ul>
          {moreHard > 0 && (
            <p className="meta mt-2 mb-0 leading-4">
              И ещё {moreHard} {pluralRu(moreHard, ["слово", "слова", "слов"])}
            </p>
          )}
        </section>
      )}

      <div className="min-h-4 flex-1" />
      {snackbar}

      <div className="flex shrink-0 flex-col gap-2">
        {summary.mistakes > 0 && (
          <Button block disabled={busy} onClick={onRepeatMistakes}>
            Повторить ошибки ({summary.mistakes})
          </Button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onPractice}
          className="flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-btn border border-ink bg-surface text-ink active:bg-surface-2 disabled:opacity-40"
        >
          <span className="text-[15px] leading-5 font-medium">Ещё практика</span>
          <span className="text-[12px] leading-4 text-muted">не влияет на расписание</span>
        </button>
        <Button variant="tertiary" size="md" block onClick={onAddWords}>
          Добавить слова
        </Button>
      </div>
    </>
  );
}
