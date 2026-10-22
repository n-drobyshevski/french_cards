"use client";

import type { CSSProperties, ReactNode } from "react";
import { bottomBarRef } from "@/components/ui/bottom-clearance";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/ui/Header";
import { Icon, type IconName } from "@/components/ui/Icons";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { StatusLine } from "@/components/ui/StatusLine";
import { cx } from "@/components/ui/cx";
import type { VocabItem } from "@/lib/ai/schemas";
import { arrivalStyle, useArrivals, useCountdown } from "@/lib/stream-motion";
import { formatElapsed } from "@/lib/use-delayed-flag";
import type { ExtractError, ExtractPhase } from "@/lib/use-extract";
import { fragmentsRu, screenshotsRu, wordsRu } from "./rows";
import { StackedLabels } from "./SwapLabel";

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
  if (phase === "uploading" || phase === "streaming" || phase === "stopped") {
    return rows === 0 ? 0.2 : 0.3 + 0.6 * (1 - Math.exp(-(rows - 1) / 8));
  }
  return 1;
}

/** done ✓ · active «ИДЁТ» · failed «НЕ УДАЛОСЬ» · stopped «СТОП» · waiting «ЖДЁМ» (rate limit) · pending. */
export type StepState = "done" | "active" | "pending" | "failed" | "stopped" | "waiting";

/**
 * What the processing screen is showing: still reading, checking for repeats, the finished state
 * held before the review (I3), stopped (I4), failed or counting down to a retry (I5), nothing found.
 */
export type ImportKind = "running" | "checking" | "complete" | "stopped" | "error" | "waiting" | "empty";

export interface ImportStage {
  kind: ImportKind;
  progress: number;
  /** Stopped or failed: the bar freezes where it was, muted. */
  frozen: boolean;
  steps: [StepState, StepState, StepState];
  /** Uploaded, no row yet: the scan line travels over the thumbnail. */
  waitingFirst: boolean;
  title: string;
  /** Status line: the stage in words and a real count. */
  status: string;
  count?: number;
  announce: string;
  /** The wait is on: the status line shows elapsed time after 3 s. */
  active: boolean;
}

export interface StageInput {
  phase: ExtractPhase;
  rows: number;
  /** Rows are in; looking for words already in the library. */
  checking?: boolean;
  /** The review rows are ready (held finished for --dur-done-hold, then the review). */
  complete?: boolean;
  /** The stream did not finish (the connection dropped): what arrived is kept. */
  incomplete?: boolean;
  error?: ExtractError | null;
  /** Tiles prepared (0 until then): an error after it came during the upload (bar at 20 %). */
  tiles?: number;
}

export function importStage({ phase, rows, checking = false, complete = false, incomplete = false, error = null, tiles = 0 }: StageInput): ImportStage {
  const found = `Найдено ${wordsRu(rows)}`;
  if (phase === "error") {
    const waiting = !!error?.retryAt;
    return {
      kind: waiting ? "waiting" : "error",
      progress: tiles > 0 ? 0.2 : 0.08,
      frozen: true,
      steps: [waiting ? "waiting" : "failed", "pending", "pending"],
      waitingFirst: false,
      title: waiting ? "Подождите немного" : "Не получилось",
      status: waiting ? "Слишком много запросов · повторим через" : "Не удалось",
      announce: waiting ? "Слишком много запросов, повторим сами" : "Не удалось",
      active: false,
    };
  }
  if (phase === "done" && rows === 0) {
    return {
      kind: "empty",
      progress: 1,
      frozen: false,
      steps: ["done", "done", "pending"],
      waitingFirst: false,
      title: "Слов не найдено",
      status: "Слов не найдено",
      announce: "Слов не найдено",
      active: false,
    };
  }
  if (phase === "stopped" && !complete && !checking) {
    const status = `Остановлено · ${wordsRu(rows)}`;
    return {
      kind: "stopped",
      progress: processingProgress(phase, rows, false),
      frozen: true,
      steps: ["done", "stopped", "pending"],
      waitingFirst: false,
      title: "Остановлено",
      status,
      announce: status,
      active: false,
    };
  }
  if (complete || checking) {
    const cut = phase === "stopped" ? "Остановлено" : incomplete ? "Связь прервалась" : null;
    const status = cut ? `${cut} · ${wordsRu(rows)}` : found;
    return {
      kind: complete ? "complete" : "checking",
      progress: complete ? 1 : 0.96,
      frozen: false,
      steps: complete ? ["done", "done", "done"] : ["done", "done", "active"],
      waitingFirst: false,
      title: complete ? (cut ? "Распознано не всё" : "Готово") : "Проверяем повторы…",
      status,
      announce: status,
      active: false,
    };
  }
  const progress = processingProgress(phase, rows, false);
  const base = { kind: "running" as const, progress, frozen: false, active: true };
  if (phase === "preparing" || phase === "idle") {
    return { ...base, steps: ["active", "pending", "pending"], waitingFirst: false, title: "Готовим скриншот…", status: "Готовим скриншот", announce: "Готовим скриншот" };
  }
  if (rows === 0) {
    return { ...base, steps: ["active", "pending", "pending"], waitingFirst: true, title: "Распознаём слова…", status: "Читаем скриншот", announce: "Читаем скриншот" };
  }
  return { ...base, steps: ["done", "active", "pending"], waitingFirst: false, title: "Распознаём слова…", status: "Найдено", count: rows, announce: found };
}

/**
 * The trailing skeleton stack slides down one row each time rows arrive (it is re-keyed, so the
 * slide replays), and leaves with an opacity fade when the stream ends (its slot then collapses,
 * see SkeletonStack).
 */
export function stackStyle(rows: number, rowHeight: number, leaving: boolean): CSSProperties {
  if (leaving) return { animation: "fade-out var(--dur-exit) var(--ease-exit) both" };
  if (rows === 0) return {};
  return {
    "--slide-from": `-${rowHeight}px`,
    animation: "slide-from var(--dur-move) var(--ease-standard) both",
  } as CSSProperties;
}

/**
 * The fading skeleton stack under the streamed rows (§3.6, import only): it keeps sliding down
 * under new rows; when the stream ends it fades out (--dur-exit), then its height collapses
 * (--dur-move), so the rows above never move.
 */
export function SkeletonStack({
  rows,
  rowHeight,
  leaving,
  children,
}: {
  rows: number;
  rowHeight: number;
  leaving: boolean;
  children: ReactNode;
}) {
  return (
    <li
      aria-hidden="true"
      className={cx(
        "grid transition-[grid-template-rows] duration-(--dur-move) ease-standard",
        leaving ? "grid-rows-[0fr] delay-(--dur-exit)" : "grid-rows-[1fr]",
      )}
    >
      <div key={`stack-${rows}`} data-skeleton-stack="" className="min-h-0 overflow-hidden" style={stackStyle(rows, rowHeight, leaving)}>
        {children}
      </div>
    </li>
  );
}

const STEP_NOTE: Partial<Record<StepState, { text: string; className: string }>> = {
  active: { text: "ИДЁТ", className: "text-red" },
  failed: { text: "НЕ УДАЛОСЬ", className: "text-again" },
  stopped: { text: "СТОП", className: "text-muted" },
  waiting: { text: "ЖДЁМ", className: "text-muted" },
};

function Step({ n, label, state, last }: { n: string; label: string; state: StepState; last?: boolean }) {
  const note = STEP_NOTE[state];
  const current = state !== "done" && state !== "pending";
  return (
    <li aria-current={state === "active" ? "step" : undefined} className={cx("flex h-7 items-center gap-2 border-t border-rule", last && "border-b")}>
      <span className={cx("w-5 font-mono text-[11px] tracking-[.06em]", current ? "text-ink" : "text-muted")}>{n}</span>
      <span
        className={cx(
          "min-w-0 flex-1 truncate text-[13px] leading-5",
          current && "font-medium text-ink",
          state === "done" && "text-ink",
          state === "pending" && "text-muted",
        )}
      >
        {label}
      </span>
      {state === "done" && <Icon name="check" size={14} strokeWidth={2} label="готово" />}
      {note && <span className={cx("font-mono text-[11px] tracking-[.06em] whitespace-nowrap", note.className)}>{note.text}</span>}
    </li>
  );
}

/**
 * The red scan line with the paper veil below it (the part not yet read). While the first row is
 * awaited it travels top↔bottom (the screen's one loop); otherwise, and under reduced motion, it
 * stands at the bar's %. Muted once the work stopped or failed.
 */
export function ScanLine({
  percent,
  travel,
  veil = true,
  thick = false,
  muted = false,
}: {
  percent: number;
  travel: boolean;
  veil?: boolean;
  thick?: boolean;
  muted?: boolean;
}) {
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
      <div className={cx("absolute inset-x-0 top-0", muted ? "bg-muted" : "bg-red", thick ? "h-0.5" : "h-px")} />
    </div>
  );
}

/** The 1px determinate bar with its 5px tick; muted and still once the work stopped or failed. */
export function ImportBar({ progress, frozen, className }: { progress: number; frozen: boolean; className?: string }) {
  const percent = Math.round(progress * 100);
  return (
    <div
      role="progressbar"
      aria-label="Прогресс распознавания"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cx("relative h-[5px]", className)}
    >
      <div className="absolute inset-x-0 top-0.5 h-px bg-rule" />
      <div
        className={cx(
          "absolute top-0.5 left-0 h-px w-full origin-left transition-[transform,background-color] duration-(--dur-move) ease-standard",
          frozen ? "bg-muted" : "bg-ink",
        )}
        style={{ transform: `scaleX(${progress})` }}
      />
      <div
        className={cx("absolute top-0 h-[5px] w-px transition-[left] duration-(--dur-move) ease-standard", frozen ? "bg-muted" : "bg-ink")}
        style={{ left: `${percent}%` }}
      />
    </div>
  );
}

/**
 * Thumbnail, title, the bar and the three steps: the top of the import screen, the same block in
 * processing and in the review (so the list below keeps its place, I3). With `onThumb` the
 * thumbnail opens the screenshots.
 */
export function ShotSummary({
  stage,
  thumbs,
  images,
  tiles,
  onThumb,
  thumbOpen,
}: {
  stage: ImportStage;
  thumbs: readonly string[];
  images: number;
  tiles: number;
  onThumb?: () => void;
  thumbOpen?: boolean;
}) {
  const sub = tiles > 0 ? `${screenshotsRu(images)} · ${fragmentsRu(tiles)}` : screenshotsRu(images);
  const percent = Math.round(stage.progress * 100);
  const thumbInner = (
    <>
      {thumbs[0] && (
        // Local object URL; next/image does not apply.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbs[0]} alt="" className="size-full object-cover object-top" />
      )}
      <ScanLine percent={percent} travel={stage.waitingFirst} veil={stage.kind !== "complete"} muted={stage.frozen} />
      {images > 1 && (
        <span className="absolute top-1.5 right-1.5 rounded-[2px] bg-ink px-1 font-mono text-[10px] leading-[14px] text-on-ink">
          1/{images}
        </span>
      )}
    </>
  );
  const thumbClass = "relative h-[220px] w-[120px] shrink-0 overflow-hidden rounded-chip border border-rule bg-surface p-0";
  return (
    <section aria-label="Обработка скриншота" className="flex gap-4">
      {onThumb ? (
        <button
          type="button"
          aria-expanded={thumbOpen}
          aria-label={thumbs.length > 1 ? "Скриншоты" : "Скриншот"}
          onClick={onThumb}
          className={cx(thumbClass, "press")}
        >
          {thumbInner}
        </button>
      ) : (
        <div aria-hidden="true" className={thumbClass}>
          {thumbInner}
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="m-0 text-[17px] leading-6 font-medium text-ink">{stage.title}</p>
        <p className="m-0 mt-1 text-[13px] leading-5 text-muted">{sub}</p>
        <ImportBar progress={stage.progress} frozen={stage.frozen} className="mt-4" />
        <ol aria-label="Этапы" className="m-0 mt-auto flex list-none flex-col p-0 pt-4">
          {IMPORT_STEPS.map((label, i) => (
            <Step key={label} n={`0${i + 1}`} label={label} state={stage.steps[i]} last={i === IMPORT_STEPS.length - 1} />
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Short headline for a failed import; the message under it says what to do. */
export function errorHeadline(error: ExtractError): string {
  switch (error.code) {
    case "offline":
      return "Нет сети";
    case "network":
      return "Нет связи с сервером";
    case "rate_limited":
      return "Слишком много запросов";
    case "unauthenticated":
    case "forbidden":
      return "Нужен вход";
    case "too_large":
      return "Скриншот слишком большой";
    case "unsupported":
    case "unsupported_image":
      return "Формат не поддерживается";
    case "decode":
      return "Скриншот не открылся";
    default:
      return "Скриншот не прочитан — попробуйте ещё раз";
  }
}

/**
 * The notice that takes the rows' place (MOTION-SPEC §3.8): a 1px again-red rule on top for a
 * failure; a hairline for neutral news (nothing found, offline, a rate-limit wait).
 */
export function ImportNotice({
  tone,
  title,
  message,
  action,
  className,
}: {
  tone: "error" | "neutral";
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      data-import-notice=""
      className={cx("flex items-start justify-between gap-3 border-t pt-3", tone === "error" ? "border-again" : "border-rule", className)}
    >
      <div className="min-w-0">
        <p className="m-0 text-[15px] leading-[22px] text-ink">{title}</p>
        {message && <p className="m-0 mt-1 text-[13px] leading-5 text-muted">{message}</p>}
      </div>
      {action}
    </div>
  );
}

/** The notice for a failed / empty / rate-limited import, or null while rows are the content. */
export function noticeFor(
  stage: ImportStage,
  error: ExtractError | null | undefined,
  onCancelRetry: () => void,
): { tone: "error" | "neutral"; title: string; message?: string; action?: ReactNode } | null {
  if (stage.kind === "empty") {
    return {
      tone: "neutral",
      title: "На скриншоте не нашлось французских слов",
      message: "Попробуйте другой скриншот или обрежьте лишнее.",
    };
  }
  if (stage.kind === "waiting") {
    return {
      tone: "neutral",
      title: "Повторим один раз сами",
      message: "Сервер просит подождать.",
      action: (
        <Button variant="tertiary" size="sm" className="-mr-1 text-[13px]" onClick={onCancelRetry}>
          Отмена
        </Button>
      ),
    };
  }
  if (stage.kind === "error" && error) {
    // Offline is news, not a failure (MOTION-SPEC B4).
    return { tone: error.code === "offline" ? "neutral" : "error", title: errorHeadline(error), message: error.message };
  }
  return null;
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
  /** The review is ready: step 03 ✓, bar full, held for --dur-done-hold. */
  complete?: boolean;
  /** The stream did not finish (cut connection). */
  incomplete?: boolean;
  error?: ExtractError | null;
  onStop: () => void;
  /** Stopped or failed: the same screenshots again. */
  onRetry: () => void;
  /** Stopped: review what arrived. */
  onContinue: () => void;
  /** Failed or nothing found: choose another screenshot. */
  onPickOther: () => void;
  /** Rate limited: drop the automatic retry. */
  onCancelRetry: () => void;
}

const ROW_HEIGHT = 56;

/** The slot button under the rows changes its label in place: «Стоп» → «Повторить» (§3.9). */
type SlotLabel = "Стоп" | "Повторить" | "Выбрать другой скриншот";
const SWAP_LABELS: readonly SlotLabel[] = ["Стоп", "Повторить"];
const SLOT_ICONS: Record<SlotLabel, IconName> = { Стоп: "stop", Повторить: "refresh", "Выбрать другой скриншот": "camera" };

/** «Дальше с 3 словами» */
export function continueLabel(rows: number): string {
  return `Дальше с ${rows} ${rows % 10 === 1 && rows % 100 !== 11 ? "словом" : "словами"}`;
}

/**
 * Screenshot being read: thumbnail with a scan line, steps, rows as they stream in, «Стоп». Stop,
 * failure and the finished hold are states of this same screen, never a cut to another layout.
 */
export function ProcessingView({
  phase,
  items,
  images,
  tiles,
  thumbs,
  checking,
  complete = false,
  incomplete = false,
  error = null,
  onStop,
  onRetry,
  onContinue,
  onPickOther,
  onCancelRetry,
}: ProcessingViewProps) {
  const stage = importStage({ phase, rows: items.length, checking, complete, incomplete, error, tiles });
  const base = useArrivals(items.length);
  const left = useCountdown(error?.retryAt);
  const notice = noticeFor(stage, error, onCancelRetry);
  const kind = stage.kind;

  let slot: { label: SlotLabel; variant: "primary" | "secondary"; onClick: () => void; disabled?: boolean };
  let primary: { label: string; icon?: IconName; onClick: () => void } | null = null;
  if (kind === "stopped") {
    slot = { label: "Повторить", variant: "secondary", onClick: onRetry };
    primary = { label: continueLabel(items.length), onClick: onContinue };
  } else if (kind === "error" && error?.retryable) {
    slot = { label: "Выбрать другой скриншот", variant: "secondary", onClick: onPickOther };
    primary = { label: "Повторить", icon: "refresh", onClick: onRetry };
  } else if (kind === "error" || kind === "empty") {
    slot = { label: "Выбрать другой скриншот", variant: "primary", onClick: onPickOther };
  } else if (kind === "waiting") {
    slot = { label: "Выбрать другой скриншот", variant: "secondary", onClick: onPickOther };
  } else {
    slot = { label: "Стоп", variant: "secondary", onClick: onStop, disabled: kind !== "running" };
  }

  return (
    <>
      <Header title="Импорт со скриншота" fallbackHref="/library" />
      <main className="flex flex-1 flex-col px-4 pt-2">
        <ShotSummary stage={stage} thumbs={thumbs} images={images} tiles={tiles} />

        {/* No ink run: the scan line over the thumbnail is the screen's one loop. */}
        <StatusLine
          className="mt-3"
          text={stage.status}
          count={kind === "waiting" ? (left === null ? undefined : formatElapsed(left)) : stage.count}
          active={stage.active}
          announce={stage.announce}
          noRun
        />

        {notice && items.length === 0 ? (
          <ImportNotice {...notice} className="mt-4" />
        ) : (
          <>
            <div className="mt-4 flex items-baseline justify-between border-b border-ink pb-2">
              <h2 className="meta m-0 leading-4 font-medium">Найдено</h2>
              <span className="meta leading-4">По мере распознавания</span>
            </div>
            <ul aria-label="Распознанные слова" aria-busy={kind === "running"} className="m-0 list-none p-0">
              {items.map((it, i) => (
                <li key={i} className="flex h-14 items-center justify-between gap-4 border-b border-rule" style={arrivalStyle(i, base)}>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span lang="fr" className="truncate font-serif text-[19px] leading-6 font-medium text-ink">
                      {it.fr}
                    </span>
                    <span className={cx("truncate text-[14px] leading-5 text-muted", it.ru_suggested && "italic")}>{it.ru}</span>
                  </span>
                  <SlangMeter level={it.slang_level} verlan={it.verlan} />
                </li>
              ))}
              <SkeletonStack rows={items.length} rowHeight={ROW_HEIGHT} leaving={kind !== "running"}>
                {[0, 1, 2, 3].map((i) => (
                  <SkeletonRow key={i} height={ROW_HEIGHT} index={i} meter fade />
                ))}
              </SkeletonStack>
            </ul>
            {notice && <ImportNotice {...notice} className="mt-4" />}
          </>
        )}
      </main>

      <footer ref={bottomBarRef} className="sticky bottom-(--shell-bottom) flex flex-col gap-2 bg-paper px-4 pt-4 pb-6">
        {primary && (
          <Button block icon={primary.icon} className="animate-[enter-rise_var(--dur-enter)_var(--ease-enter)]" onClick={primary.onClick}>
            {primary.label}
          </Button>
        )}
        {/* One button, its label changing in place: focus stays on it from «Стоп» to «Повторить». */}
        <Button variant={slot.variant} block icon={SLOT_ICONS[slot.label]} onClick={slot.onClick} disabled={slot.disabled}>
          {SWAP_LABELS.includes(slot.label) ? <StackedLabels labels={SWAP_LABELS} current={slot.label} /> : slot.label}
        </Button>
        <p className="m-0 mt-2 text-center text-[12px] leading-4 text-muted">{IMPORT_FOOTNOTE}</p>
      </footer>
    </>
  );
}
