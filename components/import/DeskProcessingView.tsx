"use client";

import { bottomBarRef } from "@/components/ui/bottom-clearance";
import { Icon } from "@/components/ui/Icons";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { cx } from "@/components/ui/cx";
import type { SlangLevel } from "@/lib/types";
import { deskButton, ROW_GRID } from "./desk";
import { IMPORT_FOOTNOTE, processingProgress, type ProcessingViewProps } from "./ProcessingView";
import { wordsRu } from "./rows";
import { ProcessingShotPane } from "./ShotPane";

type StepState = "done" | "active" | "pending";

const STEP_STATE_RU: Record<StepState, string> = { done: "готово", active: "идёт", pending: "впереди" };

function Step({ n, label, state }: { n: string; label: string; state: StepState }) {
  return (
    <li
      aria-current={state === "active" ? "step" : undefined}
      aria-label={`${label}: ${STEP_STATE_RU[state]}`}
      className="flex h-10 items-center gap-3 border-b border-rule"
    >
      <span className="relative top-px w-5 font-mono text-[11px] leading-4 text-muted tabular-nums">{n}</span>
      <span className={cx("min-w-0 flex-1 truncate text-[15px] leading-5", state === "pending" ? "text-muted" : "text-ink")}>
        {label}
      </span>
      {state === "done" && <Icon name="check" size={14} strokeWidth={2} />}
      {state === "active" && (
        <span className="relative top-px font-mono text-[11px] leading-4 font-medium tracking-[.06em] text-red">ИДЁТ</span>
      )}
    </li>
  );
}

/** Headword with «verl.» beside it (Newsreader 18 + italic 14), as in the review table. */
export function FrCell({ fr, verlan, muted }: { fr: string; verlan: boolean; muted?: boolean }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
      <span lang="fr" className={cx("truncate font-serif text-[18px] leading-6 font-medium", muted ? "text-muted" : "text-ink")}>
        {fr.trim() || "—"}
      </span>
      {verlan && (
        <span lang="fr" className="shrink-0 font-serif text-[14px] leading-5 text-muted italic">
          verl.
        </span>
      )}
    </span>
  );
}

/** Slang meter + abbreviation at table size (14px); «verl.» sits with the headword. */
export function LevelCell({ level, muted }: { level: SlangLevel; muted?: boolean }) {
  return <SlangMeter level={level} className={cx("[&_.abbr]:text-[14px]", muted && "opacity-60")} />;
}

const SKELETON_WIDTHS = [
  [128, 80, 46],
  [96, 112, 46],
  [112, 64, 46],
  [80, 96, 46],
];

/** Desktop processing (D-Import-Processing): screenshot column, steps, rows as they stream in, «Стоп». */
export function DeskProcessingView({ phase, items, images, tiles, thumbs, checking, onStop }: ProcessingViewProps) {
  const progress = processingProgress(phase, items.length, checking);
  const percent = Math.round(progress * 100);
  const reading = !checking && items.length === 0;
  const steps: StepState[] = checking
    ? ["done", "done", "active"]
    : reading
      ? ["active", "pending", "pending"]
      : ["done", "active", "pending"];
  const title = phase === "preparing" ? "Готовим скриншот…" : checking ? "Проверяем повторы…" : "Распознаём слова…";

  return (
    <div data-wide="" className="flex h-dvh min-h-0 flex-none">
      <ProcessingShotPane thumbs={thumbs} tiles={tiles} percent={percent} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main aria-labelledby="import-processing-title" aria-busy={!checking} className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-6 xl:px-8">
          <h1
            id="import-processing-title"
            aria-live="polite"
            className="m-0 font-serif text-[28px] leading-9 font-medium tracking-[-0.015em] text-ink"
          >
            {title}
          </h1>
          <div
            role="progressbar"
            aria-label="Прогресс распознавания"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="relative mt-3 h-0.5"
          >
            <span className="absolute inset-x-0 top-0 h-px bg-rule" />
            <span className="absolute top-0 left-0 h-0.5 bg-ink transition-[width] duration-500" style={{ width: `${percent}%` }} />
          </div>
          <p role="status" className="m-0 mt-2 text-[12px] leading-4 text-muted tabular-nums">
            {items.length > 0 ? wordsRu(items.length) : images > 1 ? `Ищем слова на ${images} скриншотах` : "Ищем слова"}
          </p>

          <ol aria-label="Этапы" className="m-0 mt-6 list-none border-t border-rule p-0">
            <Step n="01" label="Текст найден" state={steps[0]} />
            <Step n="02" label="Перевод и уровень" state={steps[1]} />
            <Step n="03" label="Проверка повторов" state={steps[2]} />
          </ol>

          <section aria-labelledby="import-found-title" className="mt-6">
            <div className="flex h-7 items-center justify-between border-b border-ink">
              <h2 id="import-found-title" className="m-0 text-[13px] leading-5 font-medium text-ink">
                Найдено
              </h2>
              <span className="text-[12px] leading-4 text-muted">По мере распознавания</span>
            </div>
            <ul aria-label="Распознанные слова" className="m-0 list-none p-0">
              {items.map((it, i) => (
                <li key={i} className={cx(ROW_GRID, "h-[52px] items-start border-b border-rule")}>
                  <span />
                  <span className="min-w-0 px-2 pt-[15px]">
                    <FrCell fr={it.fr} verlan={it.verlan} />
                  </span>
                  <span
                    className={cx(
                      "min-w-0 truncate px-2 pt-4 text-[14px] leading-5 text-muted",
                      it.ru_suggested && "italic",
                    )}
                  >
                    {it.ru}
                  </span>
                  <span className="flex pt-[18px] pl-2">
                    <LevelCell level={it.slang_level} />
                  </span>
                  <span />
                </li>
              ))}
              {!checking &&
                SKELETON_WIDTHS.map(([a, b, c], i) => (
                  <li key={`s${i}`} aria-hidden="true" className={cx(ROW_GRID, "h-[52px] items-center border-b border-rule")}>
                    <span />
                    <span className="ml-2 h-2 max-w-[calc(100%-16px)] rounded-[2px] bg-surface-2" style={{ width: a }} />
                    <span className="ml-2 h-2 max-w-[calc(100%-16px)] rounded-[2px] bg-surface-2" style={{ width: b }} />
                    <span className="ml-2 h-2 rounded-[2px] bg-surface-2" style={{ width: c }} />
                    <span />
                  </li>
                ))}
            </ul>
          </section>
        </main>

        <footer ref={bottomBarRef} className="flex h-16 shrink-0 items-center gap-4 border-t border-rule px-6 xl:px-8">
          <p className="m-0 min-w-0 flex-1 text-[12px] leading-4 text-muted">{IMPORT_FOOTNOTE}</p>
          <button type="button" onClick={onStop} disabled={checking} className={deskButton("secondary")}>
            Стоп
          </button>
        </footer>
      </div>
    </div>
  );
}
