"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
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
import { wordsRu } from "./rows";
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

/** Phones: the status line says the step (in place of the step list, Import-Processing B). */
export function stageStatus(stage: ImportStage): string {
  return stage.kind === "checking" ? "Проверка повторов" : stage.status;
}

/**
 * Phones: a 72×128 thumbnail with the scan line (the progress: it stands at the work's %), and beside
 * it only the title and `children` (the status line). No bar, no step list, no «Скриншот · 2
 * фрагмента»: the % stays in a visually hidden progressbar. The review folds it into ShotStrip.
 */
export function ShotSummary({
  stage,
  thumbs,
  images,
  children,
}: {
  stage: ImportStage;
  thumbs: readonly string[];
  images: number;
  children?: ReactNode;
}) {
  const percent = Math.round(stage.progress * 100);
  return (
    <section aria-label="Обработка скриншота" className="flex gap-4">
      <div aria-hidden="true" className="relative h-32 w-[72px] shrink-0 overflow-hidden rounded-chip border border-rule bg-surface">
        {thumbs[0] && (
          // Local object URL; next/image does not apply.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbs[0]} alt="" className="size-full object-cover object-top" />
        )}
        <ScanLine percent={percent} travel={stage.waitingFirst} veil={stage.kind !== "complete"} muted={stage.frozen} />
        {images > 1 && (
          <span className="absolute top-1 right-1 rounded-[2px] bg-ink px-1 font-mono text-[10px] leading-[14px] text-on-ink">1/{images}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col pt-1">
        <p className="m-0 text-[17px] leading-6 font-medium text-ink">{stage.title}</p>
        <div className="mt-1">{children}</div>
        <div role="progressbar" aria-label="Прогресс распознавания" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="sr-only" />
      </div>
    </section>
  );
}

/**
 * Phones, the review: the finished summary folded into a 44px strip (24×36 thumbnail + «Скриншот ⌄»)
 * that opens the screenshots in place. It mounts at the summary's height and folds at once over
 * --dur-move: the done hold has already played on the processing screen (I3). Reduced motion: at once.
 */
export function ShotStrip({ thumbs, open, onToggle }: { thumbs: readonly string[]; open: boolean; onToggle: () => void }) {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFolded(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cx(
        "press-tint flex w-full shrink-0 items-center gap-3 overflow-hidden bg-transparent p-0 text-left text-ink",
        "transition-[height] duration-(--dur-move) ease-standard motion-reduce:transition-none",
        folded ? "h-11" : "h-32",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "relative shrink-0 overflow-hidden rounded-[2px] border border-rule bg-surface",
          "transition-[width,height] duration-(--dur-move) ease-standard motion-reduce:transition-none",
          folded ? "h-9 w-6" : "h-32 w-[72px]",
        )}
      >
        {thumbs[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbs[0]} alt="" className="size-full object-cover object-top" />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] leading-5 font-medium">
        {thumbs.length > 1 ? `Скриншоты · ${thumbs.length}` : "Скриншот"}
      </span>
      <Icon
        name="chevron"
        size={14}
        className={cx("shrink-0 text-muted transition-transform duration-(--dur-move) ease-standard", open && "rotate-180")}
      />
    </button>
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
 * Screenshot being read (phones, Import-Processing B): a small thumbnail with the scan line, the title
 * and one status line beside it, rows as they stream in, «Стоп». Stop, failure and the finished hold
 * are states of this same screen, never a cut to another layout. The privacy line stays on the pick
 * screen only.
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
      <Header large title="Импорт со скриншота" fallbackHref="/library" />
      <main className="flex flex-1 flex-col px-4 pt-2">
        <ShotSummary stage={stage} thumbs={thumbs} images={images}>
          {/* No ink run: the scan line over the thumbnail is the screen's one loop. */}
          <StatusLine
            text={stageStatus(stage)}
            count={kind === "waiting" ? (left === null ? undefined : formatElapsed(left)) : stage.count}
            active={stage.active}
            announce={stage.announce}
            noRun
          />
        </ShotSummary>

        {notice && items.length === 0 ? (
          <ImportNotice {...notice} className="mt-4" />
        ) : (
          <>
            <ul aria-label="Распознанные слова" aria-busy={kind === "running"} className="m-0 mt-4 list-none border-t border-rule p-0">
              {items.map((it, i) => (
                <li key={i} className="flex h-14 items-center justify-between gap-4 border-b border-rule" style={arrivalStyle(i, base)}>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span lang="fr" className="truncate font-serif text-[19px] leading-6 font-medium text-ink">
                      {it.fr}
                    </span>
                    <span className={cx("truncate text-[14px] leading-5 text-muted", it.ru_suggested && "italic")}>{it.ru}</span>
                  </span>
                  <SlangMeter level={it.slang_level} verlan={it.verlan} row />
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
      </footer>
    </>
  );
}
