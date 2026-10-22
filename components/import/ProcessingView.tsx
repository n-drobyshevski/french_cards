"use client";

import { useState, type CSSProperties } from "react";
import { bottomBarRef } from "@/components/ui/bottom-clearance";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Icon } from "@/components/ui/Icons";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { StatusLine } from "@/components/ui/StatusLine";
import { cx } from "@/components/ui/cx";
import type { VocabItem } from "@/lib/ai/schemas";
import type { ExtractPhase } from "@/lib/use-extract";
import { fragmentsRu, screenshotsRu, wordsRu } from "./rows";

export const IMPORT_FOOTNOTE = "Скриншот не сохраняется — только слова.";

/** Step names say what is happening, not what has been found (MOTION-SPEC I1). */
export const IMPORT_STEPS = ["Читаем скриншот", "Слова, перевод и уровень", "Проверка повторов"] as const;

/**
 * The bar moves only on real events: preparing 8 %, uploaded 20 %, first row 30 %, then rows
 * fill it asymptotically towards 90 % (the stream has no known length), checking 96 %, done 100 %.
 */
export function processingProgress(phase: ExtractPhase, rows: number, checking: boolean): number {
  if (checking) return 0.96;
  if (phase === "preparing") return 0.08;
  if (phase === "uploading" || phase === "streaming") {
    return rows === 0 ? 0.2 : 0.3 + 0.6 * (1 - Math.exp(-(rows - 1) / 8));
  }
  return 1;
}

export type StepState = "done" | "active" | "pending";

export interface ImportStage {
  progress: number;
  steps: [StepState, StepState, StepState];
  /** Uploaded, no row yet: the scan line travels over the thumbnail. */
  waitingFirst: boolean;
  title: string;
  /** Status line: the stage in words and a real count. */
  status: string;
  count?: number;
  announce: string;
}

export function importStage(phase: ExtractPhase, rows: number, checking: boolean): ImportStage {
  const progress = processingProgress(phase, rows, checking);
  const reading = !checking && rows === 0;
  const steps: ImportStage["steps"] = checking
    ? ["done", "done", "active"]
    : reading
      ? ["active", "pending", "pending"]
      : ["done", "active", "pending"];
  const title = phase === "preparing" ? "Готовим скриншот…" : checking ? "Проверяем повторы…" : "Распознаём слова…";
  if (checking) return { progress, steps, waitingFirst: false, title, status: `Найдено ${wordsRu(rows)}`, announce: `Найдено ${wordsRu(rows)}` };
  if (phase === "preparing") return { progress, steps, waitingFirst: false, title, status: "Готовим скриншот", announce: "Готовим скриншот" };
  if (rows === 0) return { progress, steps, waitingFirst: true, title, status: "Читаем скриншот", announce: "Читаем скриншот" };
  return { progress, steps, waitingFirst: false, title, status: "Найдено", count: rows, announce: `Найдено ${wordsRu(rows)}` };
}

/**
 * Streamed rows (MOTION-SPEC §3.6): the index of the first row that arrived with the latest render,
 * so rows arriving in the same frame stagger 40 ms (capped at 200 ms) and older rows do not replay.
 */
export function useArrivals(count: number): number {
  const [seen, setSeen] = useState({ count, base: count });
  if (seen.count !== count) {
    const next = { count, base: count > seen.count ? seen.count : count };
    setSeen(next);
    return next.base;
  }
  return seen.base;
}

/** Inline style for a streamed row: 4 px rise + fade, `--dur-enter`, staggered within one arrival. */
export function arrivalStyle(index: number, base: number): CSSProperties {
  const delay = index >= base ? Math.min((index - base) * 40, 200) : 0;
  return { animation: `enter-rise var(--dur-enter) var(--ease-enter) ${delay}ms both` };
}

/**
 * The trailing skeleton stack slides down one row each time rows arrive (it is re-keyed, so the
 * slide replays), and leaves with an opacity fade when the stream ends.
 */
export function stackStyle(rows: number, rowHeight: number, leaving: boolean): CSSProperties {
  if (leaving) return { animation: "fade-out var(--dur-exit) var(--ease-exit) both" };
  if (rows === 0) return {};
  return {
    "--slide-from": `-${rowHeight}px`,
    animation: "slide-from var(--dur-move) var(--ease-standard) both",
  } as CSSProperties;
}

function Step({ n, label, state, last }: { n: string; label: string; state: StepState; last?: boolean }) {
  return (
    <li
      aria-current={state === "active" ? "step" : undefined}
      className={cx("flex h-7 items-center gap-2 border-t border-rule", last && "border-b")}
    >
      <span className={cx("w-5 font-mono text-[11px] tracking-[.06em]", state === "active" ? "text-ink" : "text-muted")}>{n}</span>
      <span
        className={cx(
          "min-w-0 flex-1 truncate text-[13px] leading-5",
          state === "active" && "font-medium text-ink",
          state === "done" && "text-ink",
          state === "pending" && "text-muted",
        )}
      >
        {label}
      </span>
      {state === "done" && <Icon name="check" size={14} strokeWidth={2} label="готово" />}
      {state === "active" && <span className="font-mono text-[11px] tracking-[.06em] text-red">ИДЁТ</span>}
    </li>
  );
}

/**
 * The red scan line with the paper veil below it (the part not yet read). While the first row is
 * awaited it travels top↔bottom (the screen's one loop); otherwise, and under reduced motion, it
 * stands at the bar's %.
 */
export function ScanLine({ percent, travel, veil = true, thick = false }: { percent: number; travel: boolean; veil?: boolean; thick?: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-scan={travel ? "travel" : "static"}
      className={cx(
        "pointer-events-none absolute inset-0 transition-[translate] duration-(--dur-move) ease-standard",
        travel && "motion-loop animate-[scan-travel_2400ms_linear_infinite_alternate]",
      )}
      style={{ translate: `0 ${percent}%` }}
    >
      {veil && <div className="absolute inset-0 bg-paper/55" />}
      <div className={cx("absolute inset-x-0 top-0 bg-red", thick ? "h-0.5" : "h-px")} />
    </div>
  );
}

export interface ProcessingViewProps {
  phase: ExtractPhase;
  items: readonly VocabItem[];
  images: number;
  tiles: number;
  /** Object URLs of the picked screenshots. */
  thumbs: readonly string[];
  /** Rows are in; looking for words already in the library. */
  checking: boolean;
  onStop: () => void;
}

const ROW_HEIGHT = 56;

/** Screenshot being read: thumbnail with a scan line, steps, rows as they stream in, «Стоп». */
export function ProcessingView({ phase, items, images, tiles, thumbs, checking, onStop }: ProcessingViewProps) {
  const stage = importStage(phase, items.length, checking);
  const sub = tiles > 0 ? `${screenshotsRu(images)} · ${fragmentsRu(tiles)}` : screenshotsRu(images);
  const percent = Math.round(stage.progress * 100);
  const base = useArrivals(items.length);

  return (
    <>
      <Header title="Импорт со скриншота" fallbackHref="/library" />
      <main className="flex flex-1 flex-col px-4 pt-2">
        <section aria-label="Обработка скриншота" className="flex gap-4">
          <div className="relative h-[220px] w-[120px] shrink-0 overflow-hidden rounded-chip border border-rule bg-surface" aria-hidden="true">
            {thumbs[0] && (
              // Local object URL; next/image does not apply.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbs[0]} alt="" className="size-full object-cover object-top" />
            )}
            <ScanLine percent={percent} travel={stage.waitingFirst} />
            {images > 1 && (
              <span className="absolute top-1.5 right-1.5 rounded-[2px] bg-ink px-1 font-mono text-[10px] leading-[14px] text-on-ink">
                1/{images}
              </span>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <p className="m-0 text-[17px] leading-6 font-medium text-ink">{stage.title}</p>
            <p className="m-0 mt-1 text-[13px] leading-5 text-muted">{sub}</p>
            <div
              role="progressbar"
              aria-label="Прогресс распознавания"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="relative mt-4 h-[5px]"
            >
              <div className="absolute inset-x-0 top-0.5 h-px bg-rule" />
              <div
                className="absolute top-0.5 left-0 h-px w-full origin-left bg-ink transition-transform duration-(--dur-move) ease-standard"
                style={{ transform: `scaleX(${stage.progress})` }}
              />
              <div
                className="absolute top-0 h-[5px] w-px bg-ink transition-[left] duration-(--dur-move) ease-standard"
                style={{ left: `${percent}%` }}
              />
            </div>

            <ol aria-label="Этапы" className="m-0 mt-auto flex list-none flex-col p-0 pt-4">
              {IMPORT_STEPS.map((label, i) => (
                <Step key={label} n={`0${i + 1}`} label={label} state={stage.steps[i]} last={i === IMPORT_STEPS.length - 1} />
              ))}
            </ol>
          </div>
        </section>

        {/* No ink run: the scan line over the thumbnail is the screen's one loop. */}
        <StatusLine
          className="mt-3"
          text={stage.status}
          count={stage.count}
          active={!checking}
          announce={stage.announce}
          noRun
        />

        <div className="mt-4 flex items-baseline justify-between border-b border-ink pb-2">
          <h2 className="meta m-0 leading-4 font-medium">Найдено</h2>
          <span className="meta leading-4">По мере распознавания</span>
        </div>
        <ul aria-label="Распознанные слова" aria-busy={!checking} className="m-0 list-none p-0">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex h-14 items-center justify-between gap-4 border-b border-rule"
              style={arrivalStyle(i, base)}
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span lang="fr" className="truncate font-serif text-[19px] leading-6 font-medium text-ink">
                  {it.fr}
                </span>
                <span className={cx("truncate text-[14px] leading-5 text-muted", it.ru_suggested && "italic")}>{it.ru}</span>
              </span>
              <SlangMeter level={it.slang_level} verlan={it.verlan} />
            </li>
          ))}
          <li key={`stack-${items.length}`} aria-hidden="true" data-skeleton-stack="" style={stackStyle(items.length, ROW_HEIGHT, checking)}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonRow key={i} height={ROW_HEIGHT} index={i} meter fade />
            ))}
          </li>
        </ul>
      </main>

      <footer ref={bottomBarRef} className="sticky bottom-(--shell-bottom) flex flex-col gap-4 bg-paper px-4 pt-4 pb-6">
        <Button variant="secondary" block icon="stop" onClick={onStop} disabled={checking}>
          Стоп
        </Button>
        <p className="m-0 text-center text-[12px] leading-4 text-muted">{IMPORT_FOOTNOTE}</p>
      </footer>
    </>
  );
}
