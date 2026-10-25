"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Collapse } from "@/components/ui/Collapse";
import { Icon } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { DialogChrome, Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { SKELETON_WIDTHS, SkeletonBar } from "@/components/ui/Skeleton";
import { useSnackbar } from "@/components/ui/Snackbar";
import { StatusLine } from "@/components/ui/StatusLine";
import { Toggle } from "@/components/ui/Toggle";
import { CrossfadeText } from "@/components/import/SwapLabel";
import { cx } from "@/components/ui/cx";
import { NEW_FOLDER_MIN_WORDS } from "@/lib/ai/constants";
import { markFoldersChanged } from "@/lib/folder-spotlight";
import { exitMs, sheetCloseMs } from "@/lib/motion";
import {
  applyPlan,
  keepGroupOrder,
  pickableTargets,
  planGroups,
  planSummary,
  REORG_UNDO_DAYS,
  ReorgError,
  reorgFraction,
  retargetMove,
  runReorg,
  setTargetEnabled,
  undoReorgRun,
  type PlanGroup,
  type PlanMove,
  type PlanTarget,
  type ReorgErrorCode,
  type ReorgPlan,
  type ReorgProgress,
} from "@/lib/reorg";
import { useFormatKeys } from "@/lib/key-names";
import { arrivalStyle, useArrivals, useCountdown } from "@/lib/stream-motion";
import { formatElapsed } from "@/lib/use-delayed-flag";
import { useLayoutClass } from "@/lib/use-media";
import { CheckMark } from "./Checkbox";
import { nWords, plural } from "./format";
import { Menu, MenuItem } from "./Menu";
import { ThemeSquare } from "./MoveMenu";
import { TargetPickerSheet, type PickerOption } from "./TargetPickerSheet";

export interface SortPlanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Разложить по темам»: builds a plan on open (two passes on the server), lets the user switch
 * groups off or retarget single words, and applies it with an undo snackbar. Nothing is written
 * before «Применить». While the plan is built the steps, the status line and the skeleton groups
 * stay on screen; groups write in as their batches come back (MOTION-SPEC S1–S3), and a failure
 * takes the skeletons' place.
 */
export function SortPlanSheet({ open, onOpenChange }: SortPlanSheetProps) {
  const snackbar = useSnackbar();
  const desktop = useLayoutClass() !== "compact";
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>(LOADING);
  const [seen, setSeen] = useState<string[]>([]);
  const [applying, setApplying] = useState(false);
  const [picking, setPicking] = useState<PlanMove | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Every opening builds a fresh plan.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSession((s) => s + 1);
      setPhase(LOADING);
      setSeen([]);
      setApplying(false);
    }
  }

  useEffect(() => {
    if (!open || session === 0) return;
    const controller = new AbortController();
    const live = () => !controller.signal.aborted;
    const loading = (patch: Partial<Extract<Phase, { status: "loading" }>>) =>
      setPhase((p) => (p.status === "loading" ? { ...p, ...patch } : p));
    runReorg({
      signal: controller.signal,
      onStage: (progress) => live() && loading({ progress, retryAt: null }),
      onGroups: (partial) => live() && loading({ partial }),
      onRateLimit: (seconds) => live() && loading({ retryAt: Date.now() + seconds * 1000 }),
    })
      .then((plan) => {
        if (live()) setPhase((p) => ({ status: "ready", plan, progress: p.progress }));
      })
      .catch((e: unknown) => {
        if (!live()) return;
        const code = e instanceof ReorgError ? e.code : null;
        setPhase((p) => ({
          status: "error",
          code,
          message: e instanceof ReorgError ? e.message : FAILED_DETAIL,
          progress: p.progress,
          partial: p.status === "loading" ? p.partial : null,
        }));
      });
    return () => controller.abort();
  }, [open, session]);

  const close = () => onOpenChange(false);
  const retry = () => {
    setPhase(LOADING);
    setSeen([]);
    setSession((s) => s + 1);
  };
  const update = (fn: (plan: ReorgPlan) => ReorgPlan) =>
    setPhase((p) => (p.status === "ready" ? { ...p, plan: fn(p.plan) } : p));

  const apply = async (plan: ReorgPlan) => {
    setApplying(true);
    try {
      const run = await applyPlan(plan);
      close();
      // The snackbar and the lit theme tiles come once the sheet has cleared (S5).
      const after = desktop ? exitMs() : sheetCloseMs();
      if (!run) {
        window.setTimeout(() => snackbar.show({ message: "Нечего перемещать: слова уже изменились" }), after);
        return;
      }
      markFoldersChanged(
        run.moves.map((m) => m.to),
        after,
      );
      window.setTimeout(
        () =>
          snackbar.show({
            message: `Разложено ${nWords(run.moves.length)}`,
            actionLabel: "Отменить",
            onAction: () => {
              // Phones: the words going back are the answer; only a failed undo gets a bar.
              void undoReorgRun(run.id).then(({ restored }) => {
                if (!restored || desktop) snackbar.show({ message: restored ? "Сортировка отменена" : "Отменять нечего: слова уже перемещены" });
              });
            },
          }),
        after,
      );
    } catch (e) {
      setApplying(false);
      snackbar.show({ message: e instanceof Error ? e.message : "Не получилось применить план" });
    }
  };

  const plan = phase.status === "ready" ? phase.plan : null;
  // While loading (or after a failure) the groups answered so far are shown, not interactive.
  const shownPlan = plan ?? (phase.status === "ready" ? null : phase.partial);
  const summary = plan ? planSummary(plan) : null;
  const ordered = keepGroupOrder(shownPlan ? (desktop ? deskOrder(shownPlan, planGroups(shownPlan)) : planGroups(shownPlan)) : [], seen);
  if (ordered.seen !== seen) setSeen(ordered.seen);
  const groups = ordered.groups;
  const empty = plan !== null && groups.length === 0;
  const head = <PlanHead phase={phase} summary={summary} empty={empty} desk={desktop} />;
  const tail = <PlanTail phase={phase} groups={groups.length} desk={desktop} onRetry={retry} />;

  const options = (move: PlanMove): PickerOption[] =>
    plan
      ? pickableTargets(plan, move).map((t) => ({
          key: t.key,
          label: t.name,
          color: t.color,
          dashed: t.kind === "inbox" || t.kind === "stay",
          caption: t.kind === "new" ? "новая тема" : t.kind === "inbox" ? "без темы" : t.kind === "stay" ? "оставить где есть" : undefined,
        }))
      : [];

  if (desktop) {
    return (
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        height="full"
        dialogWidth={760}
        description="План раскладки слов по темам"
        header={<DialogChrome label="Разложить по темам" title="Предлагаемые перемещения" />}
        footer={
          <DeskFooter
            phase={phase}
            empty={empty}
            summary={summary}
            applying={applying}
            onClose={close}
            onApply={() => plan && void apply(plan)}
          />
        }
      >
        {head}
        {empty && <EmptyPlan desk />}
        {shownPlan && groups.length > 0 && (
          <DeskPlan
            plan={shownPlan}
            groups={groups}
            interactive={!!plan}
            onToggle={(key, on) => update((p) => setTargetEnabled(p, key, on))}
            onRetarget={(wordId, key) => update((p) => retargetMove(p, wordId, key))}
          />
        )}
        {tail}
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      height="full"
      dialogWidth={760}
      description="План раскладки слов по темам"
      footer={
        empty ? (
          <Button block variant="secondary" onClick={close}>
            Закрыть
          </Button>
        ) : (
          <>
            <p className="m-0 -mt-1.5 mb-2 text-[12px] leading-4 text-muted">
              {summary ? `Можно отменить в течение ${REORG_UNDO_DAYS} дней.` : NOT_READY}
            </p>
            <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
              <Button variant="tertiary" onClick={close}>
                Отмена
              </Button>
              <Button
                className={CANT_APPLY}
                disabled={!plan || !summary || summary.apply === 0}
                pending={applying}
                pendingLabel="Применяем…"
                trailing={summary ? <CrossfadeText text={String(summary.apply)} /> : undefined}
                onClick={() => plan && void apply(plan)}
              >
                Применить
              </Button>
            </div>
          </>
        )
      }
    >
      <div className="flex h-11 shrink-0 items-center justify-between pr-1 pl-4">
        <SheetTitle className="min-w-0 truncate">Предлагаемые перемещения</SheetTitle>
        <SheetCloseButton />
      </div>

      {head}
      {empty && <EmptyPlan />}
      {groups.length > 0 && (
        <PhoneGroups
          groups={groups}
          interactive={!!plan}
          onToggle={(key, on) => update((p) => setTargetEnabled(p, key, on))}
          onPick={(move) => {
            setPicking(move);
            setPickerOpen(true);
          }}
        />
      )}
      {tail}

      <TargetPickerSheet
        nested
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Куда переместить"
        subtitle={picking?.word.fr}
        options={picking ? options(picking) : []}
        selectedKey={picking?.to}
        onPick={(key) => picking && update((p) => retargetMove(p, picking.word.id, key))}
      />
    </Sheet>
  );
}

type Phase =
  /**
   * progress is null until the words are counted (a local read, before the first request);
   * partial holds the groups answered so far; retryAt counts down a rate-limit wait.
   */
  | { status: "loading"; progress: ReorgProgress | null; partial: ReorgPlan | null; retryAt: number | null }
  | { status: "error"; code: ReorgErrorCode | null; message: string; progress: ReorgProgress | null; partial: ReorgPlan | null }
  | { status: "ready"; plan: ReorgPlan; progress: ReorgProgress | null };

const LOADING: Phase = { status: "loading", progress: null, partial: null, retryAt: null };
const NOT_READY = "Можно применить, когда план готов";
const FAILED_DETAIL = "Не получилось составить план. Попробуйте ещё раз.";
/** «Применить» that can't: white, #8a8a85 text, rule border — not a greyed ink slab (MOTION-SPEC §3.5). */
const CANT_APPLY = "disabled:border-rule disabled:bg-surface disabled:text-boundary disabled:opacity-100!";

/** Groups write in as blocks, 40 ms apart, at most 300 ms; rows inside a group come at once (§3.6). */
const GROUP_STAGGER_CAP = 300;

type StepState = "done" | "active" | "pending" | "failed";

const STEP_NOTE: Partial<Record<StepState, { text: string; className: string }>> = {
  active: { text: "ИДЁТ", className: "text-red" },
  failed: { text: "НЕ УДАЛОСЬ", className: "text-again" },
};

function PlanStep({ n, label, state, last, desk }: { n: string; label: string; state: StepState; last?: boolean; desk?: boolean }) {
  const note = STEP_NOTE[state];
  return (
    <li
      aria-current={state === "active" ? "step" : undefined}
      className={cx("flex items-center gap-2 border-t border-rule", desk ? "h-9" : "h-7", last && "border-b")}
    >
      <span className={cx("w-5 font-mono text-[11px] tracking-[.06em] tabular-nums", state === "active" || state === "failed" ? "text-ink" : "text-muted")}>
        {n}
      </span>
      <span
        className={cx(
          "min-w-0 flex-1 truncate leading-5 tabular-nums",
          desk ? "text-[14px]" : "text-[13px]",
          (state === "active" || state === "failed") && "font-medium text-ink",
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
 * The top of the sheet in every phase (MOTION-SPEC S1–S3): «01 Темы» (taxonomy pass, no total: ink
 * run on the status line) and «02 Слова · 24 / 48» (assign batches: a determinate 1px bar, 20 % →
 * 100 %), elapsed after 3 s. When the plan is ready the status line turns into the result
 * («12 перемещений · 1 новая тема») and stays pinned under the title while the groups scroll.
 */
function PlanHead({
  phase,
  summary,
  empty,
  desk = false,
}: {
  phase: Phase;
  summary: ReturnType<typeof planSummary> | null;
  empty: boolean;
  desk?: boolean;
}) {
  const { progress } = phase;
  const retryAt = phase.status === "loading" ? phase.retryAt : null;
  const left = useCountdown(retryAt);
  const waiting = !!retryAt && left !== 0;
  const ready = phase.status === "ready";
  const assigning = progress?.stage === "assign";
  const count = progress ? `${progress.wordsDone} / ${progress.words}` : null;
  const pad = desk ? "px-6" : "px-4";
  const failedAt = phase.status === "error" ? (assigning ? 1 : 0) : -1;
  const steps: [StepState, StepState] = ready
    ? ["done", "done"]
    : failedAt === 0
      ? ["failed", "pending"]
      : failedAt === 1
        ? ["done", "failed"]
        : assigning
          ? ["done", "active"]
          : ["active", "pending"];

  let text: string;
  let statusCount: string | null | undefined;
  let announce: string;
  if (phase.status === "ready") {
    const moves = summary ? `${summary.total} ${plural(summary.total, MOVE_FORMS)}` : "";
    const protectedWords = phase.plan.protectedWords;
    text = empty ? "План готов" : summary && summary.newFolders > 0 ? `${moves} · ${summary.newFolders} ${plural(summary.newFolders, NEW_FOLDER_FORMS)}` : moves;
    announce = `План готов: ${text}`;
    // Phones: the subline has folded away with the steps; its reassurance is the mono line under
    // the status line, and is said with the result.
    if (!desk && protectedWords > 0) announce += `. Слова, разложенные вручную (${nWords(protectedWords)}), не трогаются`;
  } else if (phase.status === "error") {
    text = "Не удалось";
    announce = "Не удалось составить план";
  } else if (waiting) {
    // A 429 is waited out in the open (§3.8): one automatic retry when the count reaches zero.
    text = "Слишком много запросов · повторим через";
    statusCount = left === null ? undefined : formatElapsed(left);
    announce = "Слишком много запросов, повторим сами";
  } else {
    text = assigning ? "Раскладываем слова" : "Составляем план";
    statusCount = assigning ? count : undefined;
    announce = assigning ? `Раскладываем слова · ${count}` : "Составляем план";
  }
  const plan = phase.status === "ready" ? phase.plan : null;

  const subline = (
    <p className={cx("m-0 min-h-5 text-[13px] leading-5 text-muted", pad)}>
      {plan
        ? `Слова, разложенные вручную, не трогаются${plan.protectedWords > 0 ? ` (${nWords(plan.protectedWords)})` : ""}.`
        : progress
          ? `${nWords(progress.words)} без ручной темы`
          : ""}
    </p>
  );
  const stepList = (
    <ol aria-label="Этапы" className={cx("m-0 mt-3 list-none p-0", pad)}>
      <PlanStep n="01" label="Темы" state={steps[0]} desk={desk} />
      <PlanStep n="02" label={count ? `Слова · ${count}` : "Слова"} state={steps[1]} last desk={desk} />
    </ol>
  );

  return (
    <div aria-busy={phase.status === "loading"} className={cx("flex flex-col", desk ? "pt-4" : "pt-0")}>
      {desk ? (
        <>
          {subline}
          {stepList}
        </>
      ) : (
        // Phones: the finished scaffolding leaves once the plan is ready (synthesis §1.9): the
        // subline and the steps fold away (--dur-move); the status line carries the result.
        <Collapse open={!ready}>
          {subline}
          {stepList}
        </Collapse>
      )}
      <div className={cx("sticky top-0 z-[1] bg-surface pt-3", desk ? "px-6" : "px-4")}>
        <StatusLine
          text={text}
          count={statusCount}
          announce={announce}
          active={phase.status === "loading" && !waiting}
          frozen={phase.status === "error"}
          progress={ready ? (desk ? 1 : undefined) : assigning && progress ? reorgFraction(progress) : undefined}
        />
      </div>
      {!desk && plan && plan.protectedWords > 0 && (
        <p aria-hidden="true" className="meta m-0 px-4 pt-1.5 leading-4">
          {plan.protectedWords} вручную не трогаем
        </p>
      )}
    </div>
  );
}

const MOVE_FORMS = ["перемещение", "перемещения", "перемещений"] as const;
const NEW_FOLDER_FORMS = ["новая тема", "новые темы", "новых тем"] as const;

/** Rows per skeleton group, and how tall a block is (header + rows + its rule). */
const SKELETON_GROUPS: readonly number[] = [3, 2, 3];
const blockHeight = (rows: number, desk: boolean) => (desk ? 36 + rows * 32 : 44 + rows * 44) + 1;

/**
 * Under the groups: the skeleton blocks while the plan is built (one stays once groups have come
 * in: more may follow), leaving with Collapse when it is ready; a failure takes their place at the
 * same height (§3.8) with «Повторить».
 */
function PlanTail({ phase, groups, desk, onRetry }: { phase: Phase; groups: number; desk: boolean; onRetry: () => void }) {
  const pad = desk ? "px-6" : "px-4";
  const blocks = groups > 0 ? SKELETON_GROUPS.slice(0, 1) : SKELETON_GROUPS;
  if (phase.status === "error") {
    const offline = phase.code === "offline";
    const detail = phase.code === "upstream" || phase.code === null ? null : phase.message;
    return (
      <div className={cx("pb-4", desk ? "pt-4" : "pt-3", pad)}>
        <div
          role={offline ? undefined : "alert"}
          className={cx("flex items-start justify-between gap-3 border-t pt-3", offline ? "border-rule" : "border-again")}
          style={{ minHeight: blocks.reduce((h, rows) => h + blockHeight(rows, desk), 0) }}
        >
          <div className="min-w-0">
            <p className="m-0 text-[15px] leading-[22px] text-ink">{offline ? "Нет сети" : "Не удалось составить план"}</p>
            {detail && <p className="m-0 mt-1 text-[13px] leading-5 text-muted">{detail}</p>}
          </div>
          <Button variant="tertiary" size="sm" className="-mr-1 shrink-0 text-[13px]" onClick={onRetry}>
            Повторить
          </Button>
        </div>
      </div>
    );
  }
  return (
    <Collapse open={phase.status === "loading"}>
      <div aria-hidden="true" className={cx("flex flex-col pb-4", groups > 0 ? "pt-0" : desk ? "pt-4" : "pt-3", pad)}>
        {blocks.map((rows, g) => (
          <div key={g} className={cx("border-t", g === 0 && groups === 0 ? "border-ink" : "border-rule")}>
            <div className={cx("flex items-center gap-3", desk ? "h-9 pl-8" : "h-11")}>
              <SkeletonBar width={120} />
              <SkeletonBar width={16} height={6} />
            </div>
            {Array.from({ length: rows }, (_, i) => {
              const [a, b] = SKELETON_WIDTHS[(g + i) % SKELETON_WIDTHS.length];
              return (
                <div key={i} className={cx("flex items-center gap-3 border-t border-surface-2", desk ? "h-8 pl-8" : "h-11 pl-[22px]")}>
                  <SkeletonBar width={a + 24} />
                  <SkeletonBar width={b} height={6} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Collapse>
  );
}

function EmptyPlan({ desk = false }: { desk?: boolean }) {
  return (
    <div className={cx(desk ? "px-6 pt-4" : "px-4 pt-3")}>
      <p className="m-0 font-serif text-[19px] leading-6">Всё уже на своих местах</p>
      <p className="m-0 mt-1 text-[13px] leading-5 text-muted">Перемещать нечего. Слова, разложенные вручную, не трогаются.</p>
    </div>
  );
}

function groupAria(target: PlanTarget): string {
  return target.kind === "new" ? `Создать тему «${target.name}»` : `Перемещать в «${target.name}»`;
}

/** The phone plan: groups written in as blocks as they arrive; inert until the plan is ready. */
function PhoneGroups({
  groups,
  interactive,
  onToggle,
  onPick,
}: {
  groups: PlanGroup[];
  interactive: boolean;
  onToggle: (key: string, on: boolean) => void;
  onPick: (move: PlanMove) => void;
}) {
  const base = useArrivals(groups.length);
  return (
    <div inert={!interactive} className="mt-3 flex flex-col px-4">
      {groups.map((g, i) => (
        <Group
          key={g.target.key}
          group={g}
          first={i === 0}
          style={arrivalStyle(i, base, GROUP_STAGGER_CAP)}
          onToggle={(on) => onToggle(g.target.key, on)}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

function Group({
  group,
  first,
  style,
  onToggle,
  onPick,
}: {
  group: PlanGroup;
  first: boolean;
  style?: CSSProperties;
  onToggle: (on: boolean) => void;
  onPick: (move: PlanMove) => void;
}) {
  const { target, moves, enabled, tooSmall } = group;
  const stay = target.kind === "stay";
  const dim = !stay && (!enabled || tooSmall);
  const missing = NEW_FOLDER_MIN_WORDS - moves.length;
  return (
    <section
      aria-label={stay ? "Остаются на месте" : `${target.name}: ${nWords(moves.length)}`}
      className={cx("border-t", first ? "border-ink" : "border-rule")}
      style={style}
    >
      <div className="flex min-h-11 items-center gap-3">
        <span
          className={cx(
            "flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 py-2 transition-opacity duration-(--dur-quick) ease-standard",
            dim && "opacity-50",
          )}
        >
          <span className="min-w-0 truncate font-serif text-[19px] leading-6 font-medium">
            {stay ? (
              "Остаются на месте"
            ) : (
              <>
                <span className="font-normal text-muted">→ </span>
                {target.name}
              </>
            )}
          </span>
          <span className="font-mono text-[11px] tracking-[.06em] text-muted">
            {moves.length}
            {!stay && !enabled && " · не перемещать"}
          </span>
          {target.kind === "new" && (
            <span className="meta inline-flex h-5 items-center rounded-chip border border-dashed border-ink px-1.5 text-ink">новая тема</span>
          )}
        </span>
        {!stay && (
          <Toggle
            checked={enabled && !tooSmall}
            disabled={tooSmall}
            onCheckedChange={onToggle}
            aria-label={groupAria(target)}
          />
        )}
      </div>
      {tooSmall && (
        <p className="m-0 -mt-1 pb-2 text-[12px] leading-4 text-muted">
          Для новой темы нужно ещё {nWords(missing)}.
        </p>
      )}
      <ul className="m-0 list-none p-0">
        {moves.map((m) => (
          <li key={m.word.id}>
            <button
              type="button"
              onClick={() => onPick(m)}
              aria-label={`${m.word.fr} — изменить тему`}
              className={cx(
                "flex h-11 w-full items-center gap-2 border-t border-surface-2 bg-transparent pl-[22px] text-left text-ink transition-opacity duration-(--dur-quick) ease-standard active:bg-surface-2",
                dim && "opacity-50",
              )}
            >
              <span lang="fr" className="max-w-[60%] shrink-0 truncate font-serif text-[17px] leading-6 font-medium">
                {m.word.fr}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-muted">{m.word.ru}</span>
              {m.edited && <span className="meta shrink-0">вручную</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Desktop dialog (D-Sort-Plan): a ledger with «Слово · Перевод · Откуда · Куда», groups with
// checkboxes, a «Куда ▾» menu per word. ↑/↓ move, Пробел toggles a group, ↵ changes a word's
// target, ⌘↵ applies, Esc cancels.

const LEDGER = "32px 196px 200px 140px minmax(0,1fr)";

function DeskFooter({
  phase,
  empty,
  summary,
  applying,
  onClose,
  onApply,
}: {
  phase: Phase;
  empty: boolean;
  summary: ReturnType<typeof planSummary> | null;
  applying: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  const keys = useFormatKeys();
  const ready = phase.status === "ready" && !empty && !!summary;
  const disabled = !ready || summary.apply === 0;
  // ⌘↵ applies from anywhere in the dialog.
  const applyRef = useRef(onApply);
  useEffect(() => {
    applyRef.current = onApply;
  });
  useEffect(() => {
    if (disabled || applying) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.repeat) {
        e.preventDefault();
        applyRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, applying]);

  const cancel = (
    <button
      type="button"
      onClick={onClose}
      aria-keyshortcuts="Escape"
      className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-transparent px-2 text-[14px] font-medium text-ink hoverable:bg-hover-surface"
    >
      {ready ? "Отмена" : "Закрыть"}
      <Kbd aria-hidden="true">Esc</Kbd>
    </button>
  );
  return (
    <div className="flex items-center gap-4">
      <p className="m-0 min-w-0 flex-1 text-[13px] leading-5 text-muted">
        {ready ? `Можно отменить в течение ${REORG_UNDO_DAYS} дней.` : empty ? "" : NOT_READY}
      </p>
      {cancel}
      {!empty && (
          <button
            type="button"
            onClick={() => !disabled && !applying && onApply()}
            aria-disabled={disabled || undefined}
            aria-busy={applying || undefined}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            title={disabled && ready ? "Включите хотя бы одну группу" : undefined}
            className={cx(
              // Enabled when the plan is ready: the colour changes over --dur-quick (S2).
              "inline-flex h-10 items-center gap-2.5 rounded-[6px] border px-4 text-[14px] font-medium transition-colors duration-(--dur-quick) ease-standard",
              disabled ? "cursor-default border-rule bg-transparent text-boundary" : "border-ink bg-ink text-on-ink",
            )}
          >
            Применить
            {summary && <CrossfadeText text={String(summary.apply)} className="font-mono text-[13px]" />}
            <Kbd tone={disabled ? "paper" : "ink"} aria-hidden="true">
              {keys("Mod+Enter")}
            </Kbd>
          </button>
      )}
    </div>
  );
}

const KIND_ORDER: Record<PlanTarget["kind"], number> = { inbox: 0, folder: 0, new: 1, stay: 2 };

/** The ledger's order: folder order, new themes after them, «не перемещать» last. */
function deskOrder(plan: ReorgPlan, groups: PlanGroup[]): PlanGroup[] {
  const order = new Map(plan.targets.map((t, i) => [t.key, i]));
  return [...groups].sort(
    (a, b) => KIND_ORDER[a.target.kind] - KIND_ORDER[b.target.kind] || (order.get(a.target.key) ?? 0) - (order.get(b.target.key) ?? 0),
  );
}

function DeskPlan({
  plan,
  groups,
  interactive,
  onToggle,
  onRetarget,
}: {
  plan: ReorgPlan;
  groups: PlanGroup[];
  /** False while the plan is still being built: the groups so far are shown, not editable. */
  interactive: boolean;
  onToggle: (key: string, on: boolean) => void;
  onRetarget: (wordId: string, key: string) => void;
}) {
  const [menu, setMenu] = useState<{ move: PlanMove; el: HTMLElement } | null>(null);
  const base = useArrivals(groups.length);
  const fromName = (from: string | null) => (from === null ? "Входящие" : (plan.targets.find((t) => t.folderId === from)?.name ?? "—"));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-plan-row]")];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const next = rows[Math.max(0, Math.min(rows.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };
  const rowClass =
    "relative grid items-center border-b border-rule px-6 outline-none focus-visible:bg-hover-surface focus-visible:before:absolute focus-visible:before:inset-y-0 focus-visible:before:left-0 focus-visible:before:w-0.5 focus-visible:before:bg-ink";

  return (
    <div inert={!interactive} className="flex flex-col pb-4">
      <div role="row" className="mt-3 grid h-8 items-center border-b border-ink px-6 font-mono text-[11px] tracking-[.06em] text-muted uppercase" style={{ gridTemplateColumns: LEDGER }}>
        <span />
        <span>Слово</span>
        <span>Перевод</span>
        <span>Откуда</span>
        <span>Куда</span>
      </div>
      <div onKeyDown={onKeyDown} className="flex flex-col">
        {groups.map((g, index) => {
          const { target, moves, enabled, tooSmall } = g;
          const stay = target.kind === "stay";
          const on = enabled && !tooSmall;
          const dim = !stay && !on;
          return (
            <section key={target.key} aria-label={stay ? "Остаются на месте" : `${target.name}: ${nWords(moves.length)}`} style={arrivalStyle(index, base, GROUP_STAGGER_CAP)}>
              <div
                data-plan-row=""
                tabIndex={0}
                role={stay ? undefined : "checkbox"}
                aria-checked={stay ? undefined : on}
                aria-disabled={tooSmall || undefined}
                aria-label={stay ? "Остаются на месте" : groupAria(target)}
                onClick={() => !stay && !tooSmall && onToggle(target.key, !enabled)}
                onKeyDown={(e) => {
                  if (e.key === " " && !stay && !tooSmall) {
                    e.preventDefault();
                    onToggle(target.key, !enabled);
                  }
                }}
                className={cx(rowClass, "h-9 cursor-default")}
                style={{ gridTemplateColumns: "32px minmax(0,1fr)" }}
              >
                <span>{!stay && <CheckMark checked={on} className={cx(tooSmall && "opacity-40")} />}</span>
                <span className={cx("flex min-w-0 items-baseline gap-2 transition-opacity duration-(--dur-quick) ease-standard", dim && "opacity-50")}>
                  {stay ? (
                    <span className="font-serif text-[19px] leading-6 font-medium">Остаются на месте</span>
                  ) : (
                    <>
                      <span aria-hidden="true" className="text-[14px] text-muted">
                        →
                      </span>
                      <ThemeSquare color={target.kind === "new" ? null : target.color} className="self-center" />
                      <span className="truncate font-serif text-[19px] leading-6 font-medium">{target.name}</span>
                    </>
                  )}
                  <span className="font-mono text-[11px] text-muted tabular-nums">{moves.length}</span>
                  {!stay && !enabled && <span className="text-[13px] text-muted">· не перемещать</span>}
                  {target.kind === "new" && (
                    <span className="inline-flex h-5 items-center rounded-[4px] border border-dashed border-muted px-1.5 font-mono text-[11px] text-muted">новая тема</span>
                  )}
                  {tooSmall && <span className="text-[12px] text-muted">Для новой темы нужно ещё {nWords(NEW_FOLDER_MIN_WORDS - moves.length)}.</span>}
                </span>
              </div>
              {moves.map((m) => {
                const to = plan.targets.find((t) => t.key === m.to);
                return (
                  <div
                    key={m.word.id}
                    data-plan-row=""
                    tabIndex={-1}
                    aria-label={`${m.word.fr} — ${m.word.ru}, ${to?.name ?? ""}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                        e.preventDefault();
                        const el = e.currentTarget.querySelector<HTMLElement>("button");
                        if (el) setMenu({ move: m, el });
                      }
                    }}
                    className={cx(rowClass, "h-8 transition-opacity duration-(--dur-quick) ease-standard", dim && "opacity-50")}
                    style={{ gridTemplateColumns: LEDGER }}
                  >
                    <span />
                    <span lang="fr" className="truncate pr-3 font-serif text-[16px] leading-5 font-medium">
                      {m.word.fr}
                    </span>
                    <span className="truncate pr-3 text-[13px] text-muted">{m.word.ru}</span>
                    <span className="truncate pr-3 text-[13px]">{fromName(m.word.from)}</span>
                    <span className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-haspopup="menu"
                        aria-label={`${m.word.fr} — изменить тему`}
                        onClick={(e) => setMenu({ move: m, el: e.currentTarget })}
                        className="-ml-1.5 inline-flex h-7 min-w-0 items-center gap-1 rounded-[4px] bg-transparent px-1.5 text-[13px] text-ink hoverable:bg-hover-surface"
                      >
                        <span className="truncate">{to?.name ?? "—"}</span>
                        <Icon name="chevron" size={14} />
                      </button>
                      {m.edited && <span className="font-mono text-[11px] text-muted">вручную</span>}
                    </span>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      <Menu open={!!menu} anchor={menu ? { element: menu.el } : null} onClose={() => setMenu(null)} label="Куда переместить" width={220} returnFocus={menu?.el.closest<HTMLElement>("[data-plan-row]")}>
        {menu &&
          pickableTargets(plan, menu.move).map((t) => (
            <MenuItem
              key={t.key}
              checked={t.key === menu.move.to}
              lead={t.kind === "stay" ? undefined : <ThemeSquare color={t.kind === "folder" ? t.color : null} />}
              caption={t.kind === "new" ? "новая тема" : t.kind === "stay" ? "оставить где есть" : undefined}
              onSelect={() => onRetarget(menu.move.word.id, t.key)}
            >
              {t.name}
            </MenuItem>
          ))}
      </Menu>
    </div>
  );
}
