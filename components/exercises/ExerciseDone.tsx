"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import { useShortcutsEnabled } from "@/components/shell/ShellContext";
import { OPEN_LAYER_SELECTOR } from "@/components/shell/keys";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { Kbd } from "@/components/ui/Kbd";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { useSnackbar } from "@/components/ui/Snackbar";
import {
  addNewWords,
  buildFollowUpText,
  missedItemIds,
  missedWords,
  savedNewWords,
  scoreRun,
  undoAddNewWords,
  useExerciseSets,
  useLiveWords,
} from "@/lib/exercises";
import type { ExerciseRun, ExerciseSet } from "@/lib/types";
import { copyRequest } from "./clipboard";
import { nQuestions, plural } from "./list-format";
import { exerciseKeyAction, INPUT_GUARD_MS, isTypingTarget } from "./player-keys";

const nWords = (n: number) => `${n} ${plural(n, ["слово", "слова", "слов"])}`;

/** A receipt row (as «Готово на сегодня»): label, dotted leader, mono number. */
function ReceiptRow({ label, value, style }: { label: string; value: string; style?: CSSProperties }) {
  return (
    <div style={style} className="flex h-8 items-center gap-2 md:h-10 md:gap-3">
      <span className="text-[15px]">{label}</span>
      <span aria-hidden="true" className="mt-1.5 h-0 flex-1 border-b border-dotted border-muted md:border-rule" />
      <span className="min-w-12 text-right font-mono text-[15px] font-medium tabular-nums md:font-normal">{value}</span>
    </div>
  );
}

/** A section's head: the label and its aside, at the far right; `inline`: from 768 the aside follows the label (a count, D-Exercise-Done). */
function SectionHead({ title, aside, asideTone = "muted", inline = false }: { title: string; aside?: string; asideTone?: "muted" | "red"; inline?: boolean }) {
  return (
    <div
      className={cx(
        "flex h-4 items-baseline justify-between font-mono text-[11px] leading-4 tracking-[.06em] uppercase md:h-auto md:border-b md:border-ink md:pb-2",
        inline && "md:justify-start md:gap-2 md:text-[12px] md:tracking-normal",
      )}
    >
      <h2 className="m-0 text-[11px] font-normal text-muted md:font-sans md:text-[13px] md:font-medium md:tracking-normal md:text-ink md:normal-case">
        {title}
      </h2>
      {aside && <span className={asideTone === "red" ? "font-medium text-red" : "text-muted"}>{aside}</span>}
    </div>
  );
}

const row = "flex h-9 min-w-0 items-center gap-3 border-b border-rule md:h-11";

export interface ExerciseDoneProps {
  set: ExerciseSet;
  /** The finished run. */
  run: ExerciseRun;
  /** «Повторить ошибки (N)»: a local round over these items. */
  onRepeat: (itemIds: string[]) => void;
  /** The round is being started. */
  repeatPending?: boolean;
  /** «Готово» (and Esc): back to the list. */
  onLeave: () => void;
  /** A missed library word: opens its sheet. */
  onWord: (wordId: string) => void;
}

/**
 * The done screen (Exercise-S-Done, D-Exercise-Done): «Готово», the set's title, the receipt
 * «Вопросов / С первого раза / Точность», «ОШИБКИ» with the slang meters, «НОВЫЕ СЛОВА (N) · ИЗ
 * ВЕБА» with checkboxes → «Добавить в библиотеку (N)» (undo in the snackbar), then «Повторить ошибки
 * (N)», «Попросить следующий набор» (copies a request naming the set and its misses) and «Готово».
 * From 768 the actions sit under the receipt with their keys (C, Esc); focus lands on «Повторить
 * ошибки». No date stamp, confetti or count-up.
 */
export function ExerciseDone({ set, run, onRepeat, repeatPending = false, onLeave, onWord }: ExerciseDoneProps) {
  const snackbar = useSnackbar();
  const letters = useShortcutsEnabled();
  const score = scoreRun(run, set);
  const missed = missedWords(run, set);
  const missedItems = missedItemIds(run);
  // The library rows of the missed words: a link only to a word still there, and the meter for a
  // word met only in pairs (its tile carries no snapshot).
  const library = useLiveWords(missed.flatMap((m) => (m.word_id ? [m.word_id] : [])));
  // «Повторить ошибки (N)» counts the mistakes listed under «Ошибки» (it replays the questions behind them).
  const repeatCount = missed.length || missedItems.length;
  const saved = useLiveQuery(() => savedNewWords(set), [set]);
  // Read ahead: the copy must start inside the tap (iOS drops the gesture across an IndexedDB await).
  const sets = useExerciseSets();
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(() => new Set());
  const [adding, setAdding] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const addable = set.new_words.filter((w) => !saved?.has(w.ref));
  const checked = addable.filter((w) => !unchecked.has(w.ref));

  const toggle = (ref: string) => {
    const next = new Set(unchecked);
    if (next.has(ref)) next.delete(ref);
    else next.add(ref);
    setUnchecked(next);
  };

  const add = async () => {
    if (adding || checked.length === 0) return;
    setAdding(true);
    try {
      const result = await addNewWords(set, checked.map((w) => w.ref));
      const n = result.added.length;
      snackbar.show({
        message: n > 0 ? `Добавлено: ${nWords(n)}` : "Эти слова уже есть в библиотеке",
        ...(n > 0 ? { actionLabel: "Отменить", onAction: () => void undoAddNewWords(result.undo) } : {}),
      });
    } catch {
      snackbar.show({ message: "Не удалось добавить слова" });
    } finally {
      setAdding(false);
    }
  };

  const followUp = async () => {
    const text = buildFollowUpText(set, missed);
    const ok = await copyRequest({ text, summary: `после «${set.title}», ${nQuestions(set.items.length)}` }, sets ?? [set]);
    snackbar.show({ message: ok ? "Запрос скопирован — вставьте его в чат с Claude" : "Не удалось скопировать запрос" });
  };

  // Desktop: focus on the primary action (or the heading); a key held from the last card does not
  // press it: ↵ / Space right after the screen appears, and their auto-repeat, are swallowed (a
  // fresh press still works).
  useEffect(() => {
    const root = rootRef.current;
    const target = root?.querySelector<HTMLElement>("[data-done-primary]:not(:disabled)") ?? root?.querySelector<HTMLElement>("h1");
    if (window.matchMedia("(min-width: 768px)").matches) target?.focus({ preventScroll: true });
    const until = performance.now() + INPUT_GUARD_MS;
    const swallow = (event: KeyboardEvent) => {
      if ((event.repeat || event.timeStamp < until) && (event.key === " " || event.key === "Enter")) event.preventDefault();
    };
    window.addEventListener("keydown", swallow, true);
    return () => window.removeEventListener("keydown", swallow, true);
  }, []);

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || isTypingTarget(event.target) || document.querySelector(OPEN_LAYER_SELECTOR)) return;
    const action = exerciseKeyAction(event, { phase: "done", options: 0, letters });
    if (!action) return;
    event.preventDefault();
    if (action.type === "follow-up") void followUp();
    else if (action.type === "leave") onLeave();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const meta = [set.topic ? "своя тема" : null, run.kind === "mistakes" ? "работа над ошибками" : null, nQuestions(score.total)].filter(Boolean);

  return (
    <div
      ref={rootRef}
      data-exercise-done=""
      className="flex flex-1 flex-col px-4 pt-4 pb-4 md:mx-auto md:w-[720px] md:max-w-full md:px-0 md:pt-12 md:pb-12"
    >
      <h1 tabIndex={-1} className="m-0 mt-1 font-serif text-[34px] leading-10 font-medium tracking-[-0.015em] outline-none md:text-[40px] md:leading-[48px]">
        Готово
      </h1>
      <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate font-serif text-[19px] leading-6 italic">{set.title}</span>
        <span className="meta shrink-0">
          · {meta.join(" · ")}
          <span className="max-md:hidden"> · не влияет на расписание</span>
        </span>
      </div>

      <section aria-label="Итоги упражнения" className="mt-3.5 shrink-0 border-y border-ink md:mt-6">
        <ReceiptRow label="Вопросов" value={String(score.total)} />
        <ReceiptRow label="С первого раза" value={String(score.first_try)} />
        <ReceiptRow label="Точность" value={`${score.accuracy} %`} />
      </section>

      {/* Actions: after the lists on phones (Exercise-S-Done), under the receipt from 768. */}
      <div className="order-last mt-5 flex shrink-0 flex-col gap-2 md:order-none md:mt-5 md:flex-row md:items-center md:gap-6">
        {missedItems.length > 0 && (
          <Button
            data-done-primary=""
            block
            pending={repeatPending}
            onClick={() => onRepeat(missedItems)}
            className="md:h-11 md:w-auto md:px-4 md:text-[14px]"
          >
            Повторить ошибки ({repeatCount})
          </Button>
        )}
        <Button
          variant="secondary"
          size="md"
          block
          onClick={() => void followUp()}
          aria-keyshortcuts={letters ? "C" : undefined}
          className="md:w-auto md:border-0 md:bg-transparent md:px-0"
        >
          Попросить следующий набор
          {letters && (
            <Kbd aria-hidden="true" className="max-md:hidden">
              C
            </Kbd>
          )}
        </Button>
        <button
          type="button"
          onClick={onLeave}
          aria-keyshortcuts="Escape"
          className="press-sm inline-flex h-11 shrink-0 items-center justify-center gap-2 text-[15px] font-medium text-muted md:ml-auto md:text-ink"
        >
          Готово
          <Kbd aria-hidden="true" className="max-md:hidden">
            Esc
          </Kbd>
        </button>
      </div>

      {missed.length > 0 && (
        <section aria-label="Ошибки" className="mt-5 shrink-0 md:mt-10">
          <SectionHead title="Ошибки" aside={String(missed.length)} asideTone="red" inline />
          <ul className="m-0 mt-1.5 list-none border-t border-rule p-0 md:mt-0 md:border-t-0">
            {missed.map((m) => {
              const saved = m.word_id ? library?.get(m.word_id) : undefined;
              const meter = m.word ?? saved;
              const content = (
                <>
                  <span lang="fr" className="min-w-0 shrink-0 font-serif text-[19px] leading-6 font-medium max-md:max-w-[60%] max-md:truncate md:w-[232px] md:truncate">
                    {m.fr}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-muted">{m.ru}</span>
                  {meter && <SlangMeter level={meter.slang_level} verlan={meter.verlan} className="[&>span:last-child]:w-[76px]" />}
                </>
              );
              return (
                <li key={m.key}>
                  {saved ? (
                    <button type="button" onClick={() => onWord(m.word_id!)} className={cx(row, "press-tint w-full bg-transparent text-left")}>
                      {content}
                    </button>
                  ) : (
                    <div className={row}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {set.new_words.length > 0 && (
        <section aria-label="Новые слова" className="mt-5 shrink-0 md:mt-10">
          <SectionHead title={`Новые слова (${set.new_words.length})`} aside="из веба" />
          <div className="mt-1.5 border-t border-rule md:mt-0 md:border-t-0">
            {set.new_words.map((w) => {
              const inLibrary = saved?.has(w.ref) ?? false;
              const on = !inLibrary && !unchecked.has(w.ref);
              return (
                <button
                  key={w.ref}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={inLibrary || saved === undefined}
                  onClick={() => toggle(w.ref)}
                  className="press-tint flex h-11 w-full items-center gap-3 border-b border-rule bg-transparent text-left text-ink disabled:cursor-default"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "flex size-5 shrink-0 items-center justify-center rounded-[2px] transition-colors duration-(--dur-instant) ease-press md:size-3.5",
                      on ? "bg-ink text-on-ink" : "border border-boundary bg-surface",
                      inLibrary && "opacity-40",
                    )}
                  >
                    {on && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="md:size-2.5">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  <span lang="fr" className="shrink-0 font-serif text-[19px] leading-6 font-medium md:w-[220px] md:truncate">
                    {w.fr}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-muted">{w.ru}</span>
                  {inLibrary ? (
                    <span className="meta shrink-0">в библиотеке</span>
                  ) : (
                    <SlangMeter level={w.slang_level} verlan={w.verlan} className="max-md:hidden" />
                  )}
                </button>
              );
            })}
          </div>
          {addable.length > 0 && (
            <Button
              variant="secondary"
              size="md"
              block
              pending={adding}
              disabled={checked.length === 0}
              onClick={() => void add()}
              className="mt-2 md:mt-4 md:w-auto"
            >
              Добавить в библиотеку ({checked.length})
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
