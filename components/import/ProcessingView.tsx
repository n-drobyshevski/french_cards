"use client";

import { bottomBarRef } from "@/components/ui/bottom-clearance";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Icon } from "@/components/ui/Icons";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { cx } from "@/components/ui/cx";
import type { VocabItem } from "@/lib/ai/schemas";
import type { ExtractPhase } from "@/lib/use-extract";
import { fragmentsRu, screenshotsRu, wordsRu } from "./rows";

export const IMPORT_FOOTNOTE = "Скриншот не сохраняется — только слова.";

/** Rough progress: there is no total until the stream ends, so rows fill the bar asymptotically. */
export function processingProgress(phase: ExtractPhase, rows: number, checking: boolean): number {
  if (checking) return 0.96;
  if (phase === "preparing") return 0.06;
  if (phase === "uploading") return 0.16;
  if (phase === "streaming") return 0.22 + 0.68 * (1 - Math.exp(-rows / 8));
  return 1;
}

type StepState = "done" | "active" | "pending";

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

const SKELETONS = [
  { a: "w-[72px]", b: "w-[88px]", o: "" },
  { a: "w-24", b: "w-16", o: "opacity-75" },
  { a: "w-14", b: "w-[104px]", o: "opacity-50" },
  { a: "w-20", b: "w-[72px]", o: "opacity-30" },
];

function SkeletonRow({ a, b, o }: { a: string; b: string; o: string }) {
  return (
    <li aria-hidden="true" className={cx("flex h-14 items-center gap-3 border-b border-rule", o)}>
      <span className={cx("h-2 bg-surface-2", a)} />
      <span className={cx("h-1.5 bg-surface-2", b)} />
      <span className="ml-auto inline-flex gap-[2px]">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-[3px] w-2.5 bg-surface-2" />
        ))}
      </span>
    </li>
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

/** Screenshot being read: thumbnail with a scan line, steps, rows as they stream in, «Стоп». */
export function ProcessingView({ phase, items, images, tiles, thumbs, checking, onStop }: ProcessingViewProps) {
  const progress = processingProgress(phase, items.length, checking);
  const reading = !checking && items.length === 0;
  const steps: StepState[] = checking
    ? ["done", "done", "active"]
    : reading
      ? ["active", "pending", "pending"]
      : ["done", "active", "pending"];
  const title = phase === "preparing" ? "Готовим скриншот…" : checking ? "Проверяем повторы…" : "Распознаём слова…";
  const sub = tiles > 0 ? `${screenshotsRu(images)} · ${fragmentsRu(tiles)}` : screenshotsRu(images);
  const percent = Math.round(progress * 100);

  return (
    <>
      <Header title="Импорт со скриншота" fallbackHref="/library" />
      <main className="flex flex-1 flex-col px-4 pt-2">
        <section aria-label="Обработка скриншота" className="flex gap-4">
          <div
            aria-hidden="true"
            className="relative h-[220px] w-[120px] shrink-0 overflow-hidden rounded-chip border border-rule bg-surface"
          >
            {thumbs[0] && (
              // Local object URL; next/image does not apply.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbs[0]} alt="" className="size-full object-cover object-top" />
            )}
            {images > 1 && (
              <span className="absolute top-1.5 right-1.5 rounded-[2px] bg-ink px-1 font-mono text-[10px] leading-[14px] text-on-ink">
                1/{images}
              </span>
            )}
            <div
              className="absolute inset-x-0 bottom-0 bg-paper/60 transition-[top] duration-500 ease-out"
              style={{ top: `${percent}%` }}
            />
            <div className="absolute inset-x-0 h-px bg-red transition-[top] duration-500 ease-out" style={{ top: `${percent}%` }} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <p className="m-0 text-[17px] leading-6 font-medium text-ink" aria-live="polite">
              {title}
            </p>
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
              <div className="absolute top-0.5 left-0 h-px bg-ink transition-[width] duration-500" style={{ width: `${percent}%` }} />
              <div className="absolute top-0 h-[5px] w-px bg-ink transition-[left] duration-500" style={{ left: `${percent}%` }} />
            </div>
            <p className="meta m-0 mt-2 leading-4">{items.length > 0 ? wordsRu(items.length) : "Ищем слова"}</p>

            <ol className="m-0 mt-auto flex list-none flex-col p-0 pt-4">
              <Step n="01" label="Текст найден" state={steps[0]} />
              <Step n="02" label="Перевод и уровень" state={steps[1]} />
              <Step n="03" label="Проверка повторов" state={steps[2]} last />
            </ol>
          </div>
        </section>

        <div className="mt-8 flex items-baseline justify-between border-b border-ink pb-2">
          <h2 className="meta m-0 leading-4 font-medium">Найдено</h2>
          <span className="meta leading-4">По мере распознавания</span>
        </div>
        <ul aria-label="Распознанные слова" aria-busy={!checking} className="m-0 list-none p-0">
          {items.map((it, i) => (
            <li key={i} className="flex h-14 items-center justify-between gap-4 border-b border-rule">
              <span className="flex min-w-0 items-baseline gap-2">
                <span lang="fr" className="truncate font-serif text-[19px] leading-6 font-medium text-ink">
                  {it.fr}
                </span>
                <span className={cx("truncate text-[14px] leading-5 text-muted", it.ru_suggested && "italic")}>{it.ru}</span>
              </span>
              <SlangMeter level={it.slang_level} verlan={it.verlan} />
            </li>
          ))}
          {!checking && SKELETONS.map((s, i) => <SkeletonRow key={i} {...s} />)}
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
