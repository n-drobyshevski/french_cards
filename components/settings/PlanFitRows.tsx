"use client";

// «План и прогресс» in Settings → «План повторения» (picks D2 A; mockups/Plan-Fit-A-Settings,
// Plan-Fit-States, D-Plan-Fit-A): one italic fit line under «Новых слов в день», then, when there is
// a suggestion (medium or high confidence), one quiet row «Можно брать 15 в день · Поставить 15 ⌄»
// with its forecast and «Не сейчас» behind the fold (phones), or in the row (desktop, with a 120×24
// sparkline of new words a day under the stepper's caption). Nothing renders while warming up.
// A suggestion changes the plan only on a tap, with «Вернуть» in the snackbar.
import { useId, useRef, useState, type RefObject } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Sparkline } from "@/components/progress/Sparkline";
import { Collapse } from "@/components/ui/Collapse";
import { Icon } from "@/components/ui/Icons";
import { useSnackbar } from "@/components/ui/Snackbar";
import { cx } from "@/components/ui/cx";
import { dayEndOf, dayKey, dayStartOf } from "@/lib/core/progress";
import { db } from "@/lib/db";
import {
  answersByDay,
  applySuggestion,
  dismissSuggestion,
  fitLogs,
  newWordsByDay,
  undoSuggestion,
  type PlanFit,
  type PlanSuggestion,
} from "@/lib/plan-fit";
import { appliedMessage, fitSparkAria, suggestionCopy, type FitLineCopy } from "./plan-fit-format";

const SAVE_FAILED = "Не получилось сохранить настройку";

/**
 * Where focus goes once the suggestion row leaves (applied or dismissed): the «Новых слов в день»
 * stepper just above it, when focus was inside the row. Read at the tap, while the row is still there.
 */
function focusBackFrom(row: HTMLElement | null): (() => void) | null {
  if (!row || !row.contains(document.activeElement)) return null;
  const target = row.previousElementSibling?.querySelector<HTMLElement>('[role="spinbutton"], button:not(:disabled)');
  return target ? () => target.focus() : null;
}

/** «Поставить», its second option and «Не сейчас», with the undo snackbar. */
function useSuggestionActions(fit: PlanFit | undefined, row: RefObject<HTMLElement | null>) {
  const toast = useSnackbar();
  const [busy, setBusy] = useState(false);
  const apply = async (option: "new_words" | "review_cap") => {
    if (!fit || busy) return;
    const back = focusBackFrom(row.current);
    setBusy(true);
    try {
      const done = await applySuggestion(fit, option);
      if (!done) return;
      back?.();
      toast.show({
        message: appliedMessage(option, option === "review_cap" ? done.next.review_cap : done.next.new_words, fit.newWords.unit),
        actionLabel: "Вернуть",
        onAction: () => void undoSuggestion(done.previous).catch(() => toast.show({ message: SAVE_FAILED })),
      });
    } catch {
      toast.show({ message: SAVE_FAILED });
    } finally {
      setBusy(false);
    }
  };
  const dismiss = () => {
    if (!fit) return;
    const back = focusBackFrom(row.current);
    dismissSuggestion(fit).then(
      () => back?.(),
      () => toast.show({ message: SAVE_FAILED }),
    );
  };
  return { apply, dismiss, busy };
}

// --- Phones ------------------------------------------------------------------------------------------

/** The italic muted line under the «Новых слов в день» stepper (Newsreader 15, muted). */
export function PhoneFitLine({ id, line }: { id: string; line: FitLineCopy }) {
  return (
    <p id={id} data-plan-fit="" className="abbr relative m-0 -mt-1.5 pb-3 text-[15px] leading-5 tabular-nums">
      <span aria-hidden="true">{line.text}</span>
      <span className="sr-only">{line.aria}</span>
    </p>
  );
}

/** «Можно брать 15 в день» + underlined «Поставить 15» + ⌄ (the forecast and «Не сейчас» open in place). */
export function PhoneSuggestion({ fit, suggestion }: { fit: PlanFit; suggestion: PlanSuggestion }) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const { apply, dismiss, busy } = useSuggestionActions(fit, rowRef);
  const moreId = useId();
  const descId = useId();
  const copy = suggestionCopy(suggestion, fit.newWords.unit);
  return (
    <div ref={rowRef} data-plan-suggestion={suggestion.kind} className="flex shrink-0 flex-col border-b border-rule">
      {/* The forecast, for «Поставить 15»'s description while the fold is closed (inert). */}
      <span id={descId} hidden>
        {copy.more}
      </span>
      <div className="flex min-h-12 items-center gap-1">
        <span className="min-w-0 flex-1 py-2 text-[15px] leading-5 text-ink">{copy.title}</span>
        <button
          type="button"
          aria-label={copy.applyAria}
          aria-describedby={descId}
          aria-disabled={busy || undefined}
          onClick={() => void apply("new_words")}
          className="press-sm h-11 shrink-0 bg-transparent px-2 text-[15px] leading-5 font-medium whitespace-nowrap text-ink underline decoration-1 underline-offset-[3px]"
        >
          {copy.apply}
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={moreId}
          aria-label="Что изменится"
          onClick={() => setOpen(!open)}
          className="press-sm -mr-3 flex size-11 shrink-0 items-center justify-center bg-transparent p-0 text-muted"
        >
          <Icon
            name="chevron"
            size={16}
            className={cx("transition-[rotate] duration-(--dur-move) ease-standard motion-reduce:transition-none", open && "rotate-180")}
          />
        </button>
      </div>
      <div id={moreId}>
        <Collapse open={open} innerClassName="pb-0.5">
          <p className="m-0 text-[14px] leading-5 text-muted tabular-nums">{copy.more}</p>
          <div className="flex items-center gap-2">
            {copy.alt && (
              <button
                type="button"
                aria-label={copy.alt.aria}
                aria-disabled={busy || undefined}
                onClick={() => void apply("review_cap")}
                className="press-sm -ml-2 h-11 bg-transparent px-2 text-[14px] leading-5 font-medium whitespace-nowrap text-ink underline decoration-1 underline-offset-[3px]"
              >
                {copy.alt.label}
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className={cx("press-sm h-11 bg-transparent px-2 text-[14px] leading-5 font-medium whitespace-nowrap text-muted", !copy.alt && "-ml-2")}
            >
              Не сейчас
            </button>
          </div>
        </Collapse>
      </div>
    </div>
  );
}

// --- Desktop -----------------------------------------------------------------------------------------

/** New words per study day of the fit's window (days off are absent: a gap), for the sparkline. */
function useWindowNewWords(fit: PlanFit | undefined): { day: string; value: number }[] | undefined {
  const from = fit?.window.from ?? null;
  const to = fit?.window.to ?? null;
  const together = fit?.newWords.unit === "cards";
  return useLiveQuery(async () => {
    if (!from || !to) return [];
    const rows = await db.review_log.where("review").between(dayStartOf(from).toISOString(), dayEndOf(to).toISOString(), true, false).toArray();
    const logs = fitLogs(rows, (at) => dayKey(at));
    const words = newWordsByDay(logs, together);
    return [...answersByDay(logs).keys()].sort().map((day) => ({ day, value: words.get(day) ?? 0 }));
  }, [from, to, together]);
}

/** Under the stepper's caption: the 120×24 sparkline (dashed ink = the plan's ceiling) and the fit line. */
export function DeskFitCaption({ id, fit, line }: { id: string; fit: PlanFit; line: FitLineCopy }) {
  const points = useWindowNewWords(fit);
  const { from, to } = fit.window;
  return (
    <span data-plan-fit="" className="mt-2 flex items-center gap-3">
      {points && points.length > 1 && from && to && (
        <Sparkline
          points={points}
          from={from}
          to={to}
          floor={0}
          reference={fit.newWords.plan}
          referenceTone="ink"
          todayTone="ink"
          label={fitSparkAria(fit, points, dayKey(new Date()))}
        />
      )}
      {/* The stepper's description: the line only (the sparkline has its own name). */}
      <span id={id} className="min-w-0 text-[13px] leading-5 text-muted tabular-nums">
        <span aria-hidden="true">{line.text}</span>
        <span className="sr-only">{line.aria}</span>
      </span>
    </span>
  );
}

const DESK_LINK = "h-8 shrink-0 cursor-pointer border-0 bg-transparent px-1 text-[14px] leading-5 font-medium whitespace-nowrap underline decoration-1 underline-offset-[3px]";

/** «Можно брать 15 в день» with its forecast, an outlined «Поставить 15» and the text link «Не сейчас». */
export function DeskSuggestion({ fit, suggestion }: { fit: PlanFit; suggestion: PlanSuggestion }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const { apply, dismiss, busy } = useSuggestionActions(fit, rowRef);
  const titleId = useId();
  const moreId = useId();
  const copy = suggestionCopy(suggestion, fit.newWords.unit);
  return (
    <div ref={rowRef} data-plan-suggestion={suggestion.kind} className="flex min-h-14 items-center gap-4 border-b border-rule py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={titleId} className="text-[15px] leading-5 text-ink">
          {copy.title}
        </span>
        <span id={moreId} className="text-[12px] leading-4 text-muted tabular-nums">
          {copy.more}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={copy.applyAria}
          aria-describedby={moreId}
          aria-disabled={busy || undefined}
          onClick={() => void apply("new_words")}
          className="h-8 shrink-0 cursor-pointer rounded-[6px] border border-boundary bg-surface px-3 text-[14px] leading-5 font-medium whitespace-nowrap text-ink hoverable:bg-hover"
        >
          {copy.apply}
        </button>
        {copy.alt && (
          <button type="button" aria-label={copy.alt.aria} aria-disabled={busy || undefined} onClick={() => void apply("review_cap")} className={cx(DESK_LINK, "text-ink")}>
            {copy.alt.label}
          </button>
        )}
        <button type="button" onClick={dismiss} className={cx(DESK_LINK, "text-muted hoverable:text-ink")}>
          Не сейчас
        </button>
      </span>
    </div>
  );
}
