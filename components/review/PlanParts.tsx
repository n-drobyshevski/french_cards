"use client";

// «План дня» on the review screen (SPEC «План дня и уровень языка», picks R22 D2 A+B; boards
// Review-Header-A/B, Review-Plan-Sheet, D-Review-Plan): the tappable summary in the progress row,
// the reason subline while new words are held back, and «План на сегодня» — a bottom sheet on
// phones, a 360px popover under the summary from 768 up. Numbers from lib/core/plan.ts `planDay`.
// Phones (mobile-research «План на сегодня» B, «Полоса дня»): the receipt rows become the day strip
// with one mono label line, and the sheet is the one home of the day's numbers and the held-day
// reason (the review header no longer repeats them).
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Collapse } from "@/components/ui/Collapse";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { Sheet, SheetHeader } from "@/components/ui/Sheet";
import { tokenMs } from "@/lib/motion";
import { useSnackbar } from "@/components/ui/Snackbar";
import type { DayPlan } from "@/lib/core/plan";
import type { StudyPlan } from "@/lib/core/study-plan";
import { startOfStudyDay } from "@/lib/session";
import { setNewOverride } from "@/lib/user-prefs";
import { countsCards, dayStrip, newWordsToday, PLAN_SETTINGS_HREF, overrideOffered, planShort, reasonLine, reverseToday, sublineParts, type DayStrip } from "./plan-format";

/**
 * The reason subline (D2 A), only while new words are held back: mono 11 muted capitals with the
 * values in ink 500 on phones, 8px under the progress line; from 768 12 muted sentence case under
 * the running-head rule, left-aligned with the card column.
 */
export function PlanSubline({ day }: { day: DayPlan }) {
  const parts = sublineParts(day);
  if (!parts) return null;
  return (
    <p
      role="status"
      data-plan-subline=""
      className={cx(
        "m-0 mt-2 flex shrink-0 flex-wrap items-baseline gap-x-1.5 font-mono text-[11px] leading-4 tracking-[.06em] text-muted uppercase",
        "md:absolute md:top-[65px] md:left-1/2 md:mt-0 md:w-(--card-w) md:max-w-[calc(100%-48px)] md:-translate-x-1/2 md:gap-x-1 md:font-sans md:text-[12px] md:tracking-normal md:normal-case",
      )}
    >
      {parts.map((part, i) => (
        <span key={i} className="contents">
          {i > 0 && <span aria-hidden="true">·</span>}
          <span>
            {part.text}
            {part.value && <span className="font-medium text-ink md:font-normal md:text-muted"> {part.value}</span>}
          </span>
        </span>
      ))}
    </p>
  );
}

export interface PlanData {
  /** Cards still due today (the session's counts). */
  due: number;
  day: DayPlan;
  plan: StudyPlan;
}

function ReceiptRow({ label, children, desk, last }: { label: string; children: ReactNode; desk: boolean; last?: boolean }) {
  return (
    <div className={cx("flex items-center gap-2", desk ? "h-10" : "h-11", !last && "border-b border-rule")}>
      <span className={cx("min-w-0 flex-1 truncate leading-5", desk ? "text-[14px]" : "text-[15px]")}>{label}</span>
      <span className="font-mono text-[14px] leading-5 font-medium whitespace-nowrap text-ink tabular-nums">{children}</span>
    </div>
  );
}

/**
 * «План на сегодня»: the ruled receipt (К повторению, Новых слов N из 10, Обратных сторон, Отложено),
 * the reason line, «Всё равно добавить новые» (only while the day is below the ceiling) and
 * «Изменить план ›». Phones 44px rows; desk 40px rows.
 */
export function PlanReceipt({ data, desk = false }: { data: PlanData; desk?: boolean }) {
  const { due, day, plan } = data;
  const toast = useSnackbar();
  const [pending, setPending] = useState(false);
  const reason = reasonLine(day, plan);
  const offered = overrideOffered(day, plan);
  const cards = countsCards(plan);
  // «Всё равно добавить новые» leaves with the row collapse (§5.10), then is gone from the sheet.
  const [overrideRow, setOverrideRow] = useState(offered);
  if (offered && !overrideRow) setOverrideRow(true);
  useEffect(() => {
    if (offered || !overrideRow) return;
    const timer = window.setTimeout(() => setOverrideRow(false), tokenMs("--dur-move", 240) + 60);
    return () => window.clearTimeout(timer);
  }, [offered, overrideRow]);

  const override = () => {
    setPending(true);
    setNewOverride(startOfStudyDay())
      .catch(() => toast.show({ message: "Не получилось добавить новые" }))
      .finally(() => setPending(false));
  };

  const overrideHint = useId();

  return (
    <div className="flex flex-col">
      {!desk ? (
        <DayStripView strip={dayStrip(data)} />
      ) : (
        <div className="flex flex-col">
          <ReceiptRow label="К повторению" desk={desk}>
            {due}
          </ReceiptRow>
          <ReceiptRow label={cards ? "Новых карточек" : "Новых слов"} desk={desk}>
            {newWordsToday(day, plan)} <span className="font-normal text-muted">из {day.ceiling}</span>
          </ReceiptRow>
          {plan.ru_fr === "after" && (
            <ReceiptRow label="Обратных сторон" desk={desk}>
              {reverseToday(day)}
            </ReceiptRow>
          )}
          <ReceiptRow label="Отложено" desk={desk} last>
            {day.deferred}
          </ReceiptRow>
        </div>
      )}
      {reason && (
        <p
          data-plan-reason=""
          className={cx("m-0 text-ink", desk ? "border-t border-rule pt-2.5 pb-3 text-[13px] leading-5" : "mt-4 text-[14px] leading-5")}
        >
          {reason}
        </p>
      )}
      {overrideRow && (
        <Collapse open={offered} innerClassName={desk ? "" : "px-px"}>
          <div className={cx("flex flex-col", desk ? (reason ? "" : "border-t border-rule pt-3") : "pt-4")}>
            {desk ? (
              <>
                <Button
                  variant="secondary"
                  size="md"
                  block
                  pending={pending}
                  onClick={override}
                  className="h-10 rounded-[6px] text-[14px] hoverable:bg-hover-surface"
                >
                  Всё равно добавить новые
                </Button>
                <p className="m-0 mt-1.5 text-center text-[12px] leading-4 text-muted">Только на сегодня. Завтра план снова подстроится.</p>
              </>
            ) : (
              // Phones: the caption is the button's sublabel; the full sentence is its description.
              <>
                <Button
                  variant="secondary"
                  size="md"
                  block
                  pending={pending}
                  onClick={override}
                  aria-describedby={overrideHint}
                  className="h-14 flex-col gap-0.5 rounded-[6px] border-boundary"
                >
                  <span>Всё равно добавить новые</span>
                  <span aria-hidden="true" className="text-[12px] leading-4 font-normal text-muted">
                    только на сегодня
                  </span>
                </Button>
                <span id={overrideHint} className="sr-only">
                  Только на сегодня. Завтра план снова подстроится.
                </span>
              </>
            )}
          </div>
        </Collapse>
      )}
      <Link
        href={PLAN_SETTINGS_HREF}
        data-plan-edit=""
        className={cx(
          "mt-3 flex shrink-0 items-center gap-2 border-t border-rule text-ink no-underline",
          desk ? "h-11 hoverable:bg-hover" : "min-h-11 active:bg-surface-2",
        )}
      >
        <span className={cx("min-w-0 flex-1 leading-5 font-medium", desk ? "text-[14px]" : "text-[15px]")}>Изменить план</span>
        {/* Phones: «из 10» is already on the strip; the settings value is not repeated. */}
        {desk && <span className="font-mono text-[12px] leading-4 tracking-[.06em] whitespace-nowrap text-muted">{planShort(plan)}</span>}
        <Icon name="chevron-right" size={16} strokeWidth={1.75} className="shrink-0 text-ink" />
      </Link>
    </div>
  );
}

/** Phones: «План на сегодня» as a bottom sheet (§5.7): the grabber, the title, ✕ for keyboards only. */
export function PlanSheet({ open, onOpenChange, data }: { open: boolean; onOpenChange: (open: boolean) => void; data: PlanData | null }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} height="auto">
      <SheetHeader title="План на сегодня" />
      <div className="px-4 pt-3 pb-7">{data && <PlanReceipt data={data} />}</div>
    </Sheet>
  );
}

/** The narrowest a new-word slot gets before the slots take a fixed share instead (45 %). */
const SLOT_MIN = 7;

/**
 * Phones: the day strip (10px), left to right: the reviews as one ink bar, the day's new-word
 * slots up to the ceiling (hatched = today's, hairline box = unused), the reverse sides as an ink
 * outline, then a cap rule and the deferred cards dashed (only when some are). Every part takes the
 * row in proportion to its cards; the slots never get narrower than 7px each (or 45 % of the row). Under it one mono line «ПОВТ. 27 · НОВ. 4/10 · ОБР. 6»; the exact words
 * are the strip's accessible name. When «Всё равно добавить новые» lifts the day, the empty slots
 * fill left → right, 40ms apart, over --dur-enter (reduced motion: --dur-quick, no stagger).
 */
function DayStripView({ strip }: { strip: DayStrip }) {
  // The fill count before the latest rise: slots from there on fill with the stagger.
  const [base, setBase] = useState(strip.fresh);
  const [growFrom, setGrowFrom] = useState<number | null>(null);
  if (strip.fresh !== base) {
    setGrowFrom(strip.fresh > base ? base : null);
    setBase(strip.fresh);
  }
  const bar = (count: number): CSSProperties => ({ flex: `${count} 1 0px` });
  return (
    <div data-plan-strip="" className="flex flex-col">
      <div role="img" aria-label={strip.label} className="flex h-2.5 items-stretch gap-1">
        {strip.due > 0 && <span data-strip-part="due" style={bar(strip.due)} className="min-w-4 bg-ink" />}
        {strip.slots > 0 && (
          <span
            data-strip-part="new"
            style={{ ...bar(strip.slots), minWidth: `min(${strip.slots * SLOT_MIN}px, 45%)` }}
            className="flex items-stretch gap-0.5"
          >
            {Array.from({ length: strip.slots }, (_, i) => {
              const on = i < strip.fresh;
              const delay = on && growFrom !== null && i >= growFrom ? (i - growFrom) * 40 : 0;
              const timing: CSSProperties = { transitionDelay: `calc(${delay}ms * var(--motion-scale))` };
              return (
                <span
                  key={i}
                  data-slot={on ? "on" : "off"}
                  style={timing}
                  className={cx(
                    "relative min-w-0.5 flex-1 border transition-[border-color] duration-(--dur-enter) ease-enter",
                    on ? "border-ink" : "border-edge",
                  )}
                >
                  <span
                    style={timing}
                    className={cx(
                      "absolute inset-0 bg-[repeating-linear-gradient(135deg,var(--ink)_0_1.5px,transparent_1.5px_3.5px)] transition-opacity duration-(--dur-enter) ease-enter",
                      on ? "opacity-100" : "opacity-0",
                    )}
                  />
                </span>
              );
            })}
          </span>
        )}
        {strip.reverse > 0 && <span data-strip-part="reverse" style={bar(strip.reverse)} className="min-w-3 border border-ink" />}
        {strip.deferred > 0 && (
          <>
            <span aria-hidden="true" className="-my-1 w-px shrink-0 bg-ink" />
            <span data-strip-part="deferred" style={bar(strip.deferred)} className="min-w-4 border border-dashed border-ink" />
          </>
        )}
      </div>
      <p aria-hidden="true" className="meta m-0 mt-2.5 flex flex-wrap gap-x-1.5 leading-4 tabular-nums">
        {strip.parts.map((part, i) => (
          <span key={part.key} className="whitespace-nowrap">
            {i > 0 && <span className="mr-1.5">·</span>}
            {part.text} <span className="font-medium text-ink">{part.value}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

const EDGE = 8;

/**
 * From 768: «План на сегодня» as a 360px popover under the summary (white, 1px ink border, radius 6,
 * no shadow; menu motion D6). Esc, × or a click outside close it and focus returns to the summary.
 * role="dialog" with data-state="open": the review keys are off while it is open.
 */
export function PlanPopover({
  open,
  anchorRef,
  onClose,
  data,
}: {
  open: boolean;
  /** The summary button: the popover hangs under it, and clicks on it are its own (it toggles). */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: (refocus: boolean) => void;
  data: PlanData | null;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!open || !anchor) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const width = panel.current?.offsetWidth ?? 360;
      const left = Math.max(EDGE, Math.min(a.left - 4, window.innerWidth - EDGE - width));
      setPos({ left, top: a.bottom + 6 });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || panel.current?.contains(target) || anchorRef.current?.contains(target)) return;
      if ((target as Element).closest?.("[data-snackbar]")) return;
      closeRef.current(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current(true);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, anchorRef]);

  if (!open || !data || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      data-state="open"
      data-side="bottom"
      aria-labelledby="plan-popover-title"
      tabIndex={-1}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? undefined : "hidden" }}
      className="popover-in fixed z-40 w-[360px] max-w-[calc(100vw-16px)] rounded-[6px] border border-ink bg-surface px-4 pb-1 text-ink outline-none"
    >
      <div className="flex h-[52px] items-center justify-between border-b border-ink">
        <h2 id="plan-popover-title" className="m-0 font-serif text-[20px] leading-7 font-medium">
          План на сегодня
        </h2>
        <button
          type="button"
          aria-label="Закрыть"
          title="Закрыть (Esc)"
          aria-keyshortcuts="Escape"
          onClick={() => onClose(true)}
          className="-mr-1.5 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-transparent p-0 text-ink hoverable:bg-hover-surface"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <PlanReceipt data={data} desk />
    </div>,
    document.body,
  );
}
