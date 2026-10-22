"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { useSnackbar } from "@/components/ui/Snackbar";
import { Toggle } from "@/components/ui/Toggle";
import { cx } from "@/components/ui/cx";
import { NEW_FOLDER_MIN_WORDS } from "@/lib/ai/schemas";
import {
  applyPlan,
  pickableTargets,
  planGroups,
  planSummary,
  REORG_UNDO_DAYS,
  ReorgError,
  retargetMove,
  runReorg,
  setTargetEnabled,
  undoReorgRun,
  type PlanGroup,
  type PlanMove,
  type PlanTarget,
  type ReorgPlan,
} from "@/lib/reorg";
import { nWords, plural } from "./format";
import { TargetPickerSheet, type PickerOption } from "./TargetPickerSheet";

export interface SortPlanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Разложить по темам»: builds a plan on open (two passes on the server), lets the user switch
 * groups off or retarget single words, and applies it with an undo snackbar. Nothing is written
 * before «Применить».
 */
export function SortPlanSheet({ open, onOpenChange }: SortPlanSheetProps) {
  const snackbar = useSnackbar();
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>(LOADING);
  const [applying, setApplying] = useState(false);
  const [picking, setPicking] = useState<PlanMove | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Every opening builds a fresh plan.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSession((s) => s + 1);
      setPhase(LOADING);
      setApplying(false);
    }
  }

  useEffect(() => {
    if (!open || session === 0) return;
    const controller = new AbortController();
    runReorg({
      signal: controller.signal,
      onProgress: (done, total) => {
        if (!controller.signal.aborted) setPhase({ status: "loading", done, total });
      },
    })
      .then((plan) => {
        if (!controller.signal.aborted) setPhase({ status: "ready", plan });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setPhase({ status: "error", message: e instanceof ReorgError ? e.message : "Не получилось составить план. Попробуйте ещё раз." });
      });
    return () => controller.abort();
  }, [open, session]);

  const close = () => onOpenChange(false);
  const retry = () => {
    setPhase(LOADING);
    setSession((s) => s + 1);
  };
  const update = (fn: (plan: ReorgPlan) => ReorgPlan) =>
    setPhase((p) => (p.status === "ready" ? { status: "ready", plan: fn(p.plan) } : p));

  const apply = async (plan: ReorgPlan) => {
    setApplying(true);
    try {
      const run = await applyPlan(plan);
      close();
      if (!run) {
        snackbar.show({ message: "Нечего перемещать: слова уже изменились" });
        return;
      }
      const created = run.created_folders.length;
      snackbar.show({
        message: `Перемещено ${nWords(run.moves.length)}${created ? ` · ${created} ${plural(created, NEW_FOLDER_FORMS)}` : ""}`,
        actionLabel: "Отменить",
        onAction: () => {
          void undoReorgRun(run.id).then(({ restored }) =>
            snackbar.show({ message: restored ? "Сортировка отменена" : "Отменять нечего: слова уже перемещены" }),
          );
        },
      });
    } catch (e) {
      setApplying(false);
      snackbar.show({ message: e instanceof Error ? e.message : "Не получилось применить план" });
    }
  };

  const plan = phase.status === "ready" ? phase.plan : null;
  const summary = plan ? planSummary(plan) : null;
  const groups = plan ? planGroups(plan) : [];
  const empty = plan !== null && groups.length === 0;

  let footer: ReactNode;
  if (phase.status === "error") {
    footer = (
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
        <Button variant="tertiary" onClick={close}>
          Закрыть
        </Button>
        <Button icon="refresh" onClick={retry}>
          Повторить
        </Button>
      </div>
    );
  } else if (empty) {
    footer = (
      <Button block variant="secondary" onClick={close}>
        Закрыть
      </Button>
    );
  } else {
    footer = (
      <>
        {summary && <p className="m-0 -mt-1.5 mb-2 text-[12px] leading-4 text-muted">Можно отменить в течение {REORG_UNDO_DAYS} дней.</p>}
        <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
          <Button variant="tertiary" onClick={close}>
            Отмена
          </Button>
          <Button
            disabled={!plan || !summary || summary.apply === 0}
            loading={applying}
            trailing={summary ? summary.apply : undefined}
            onClick={() => plan && void apply(plan)}
          >
            Применить
          </Button>
        </div>
      </>
    );
  }

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

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      height="full"
      description="План раскладки слов по темам"
      footer={footer}
    >
      <div className="flex h-11 shrink-0 items-center justify-between pr-1 pl-4">
        <SheetTitle className="min-w-0 truncate">Предлагаемые перемещения</SheetTitle>
        <SheetCloseButton />
      </div>

      {phase.status === "loading" && (
        <div aria-busy="true">
          <p className="meta m-0 px-4" role="status">
            Составляем план{phase.total > 1 ? ` · ${phase.done} / ${phase.total}` : "…"}
          </p>
          <div className="mt-3 flex flex-col px-4" aria-hidden="true">
            {[3, 2, 3].map((rows, g) => (
              <div key={g} className={cx("border-t", g === 0 ? "border-ink" : "border-rule")}>
                <div className="flex h-11 items-center">
                  <span className="h-3 w-28 rounded-[2px] bg-surface-2" />
                </div>
                {Array.from({ length: rows }, (_, i) => (
                  <div key={i} className="flex h-11 items-center gap-3 border-t border-surface-2 pl-[22px]">
                    <span className="h-2.5 w-24 rounded-[2px] bg-surface-2" />
                    <span className="h-2.5 w-16 rounded-[2px] bg-surface-2" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {phase.status === "error" && (
        <p role="alert" className="m-0 mt-2 px-4 text-[15px] leading-[22px]">
          {phase.message}
        </p>
      )}

      {empty && (
        <>
          <p className="m-0 mt-2 px-4 font-serif text-[19px] leading-6">Всё уже на своих местах</p>
          <p className="m-0 mt-1 px-4 text-[13px] leading-5 text-muted">Перемещать нечего. Слова, разложенные вручную, не трогаются.</p>
        </>
      )}

      {plan && summary && !empty && (
        <>
          <p className="meta m-0 px-4">
            <span className="font-medium text-ink">
              {summary.total} {plural(summary.total, MOVE_FORMS)}
            </span>
            {summary.newFolders > 0 && ` · ${summary.newFolders} ${plural(summary.newFolders, NEW_FOLDER_FORMS)}`}
          </p>
          <p className="m-0 mt-1 px-4 text-[13px] leading-5 text-muted">
            Слова, разложенные вручную, не трогаются{plan.protectedWords > 0 ? ` (${nWords(plan.protectedWords)})` : ""}.
          </p>
          <div className="mt-3 flex flex-col px-4 pb-4">
            {groups.map((g, i) => (
              <Group
                key={g.target.key}
                group={g}
                first={i === 0}
                onToggle={(on) => update((p) => setTargetEnabled(p, g.target.key, on))}
                onPick={(move) => {
                  setPicking(move);
                  setPickerOpen(true);
                }}
              />
            ))}
          </div>
        </>
      )}

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
  | { status: "loading"; done: number; total: number }
  | { status: "error"; message: string }
  | { status: "ready"; plan: ReorgPlan };

const LOADING: Phase = { status: "loading", done: 0, total: 0 };
const MOVE_FORMS = ["перемещение", "перемещения", "перемещений"] as const;
const NEW_FOLDER_FORMS = ["новая тема", "новые темы", "новых тем"] as const;

function groupAria(target: PlanTarget): string {
  return target.kind === "new" ? `Создать тему «${target.name}»` : `Перемещать в «${target.name}»`;
}

function Group({
  group,
  first,
  onToggle,
  onPick,
}: {
  group: PlanGroup;
  first: boolean;
  onToggle: (on: boolean) => void;
  onPick: (move: PlanMove) => void;
}) {
  const { target, moves, enabled, tooSmall } = group;
  const stay = target.kind === "stay";
  const dim = !stay && (!enabled || tooSmall);
  const missing = NEW_FOLDER_MIN_WORDS - moves.length;
  return (
    <section aria-label={stay ? "Остаются на месте" : `${target.name}: ${nWords(moves.length)}`} className={cx("border-t", first ? "border-ink" : "border-rule")}>
      <div className="flex min-h-11 items-center gap-3">
        <span className={cx("flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 py-2", dim && "opacity-45")}>
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
                "flex h-11 w-full items-center gap-2 border-t border-surface-2 bg-transparent pl-[22px] text-left text-ink active:bg-surface-2",
                dim && "opacity-45",
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
