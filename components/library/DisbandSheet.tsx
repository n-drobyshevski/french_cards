"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { DialogChrome, Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import {
  applyDisband,
  disbandGroups,
  ReorgError,
  retargetDisband,
  runDisband,
  type DisbandGroup,
  type DisbandMove,
  type DisbandPlan,
} from "@/lib/reorg";
import type { Folder } from "@/lib/types";
import { useLayoutClass } from "@/lib/use-media";
import type { MoveRecord } from "@/lib/words";
import { nWords } from "./format";
import { folderOptions, TargetPickerSheet } from "./TargetPickerSheet";

type Phase =
  | { status: "loading"; done: number; total: number }
  | { status: "error"; message: string }
  | { status: "ready"; plan: DisbandPlan };

const LOADING: Phase = { status: "loading", done: 0, total: 0 };

/** Snackbar text after «Расформировать»: how many words went to themes and to «Входящие». */
export function disbandMessage(name: string, moves: readonly MoveRecord[]): string {
  const inbox = moves.filter((m) => m.to === null).length;
  const placed = moves.length - inbox;
  const parts = [`Тема «${name}» расформирована`];
  if (placed > 0) parts.push(`${nWords(placed)} в других темах`);
  if (inbox > 0) parts.push(`${inbox} во «Входящих»`);
  return parts.join(" · ");
}

export interface DisbandSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: Pick<Folder, "id" | "name">;
  /** After the theme is gone: show the undo (restoreFolder(folder.id, moves)), leave its screen. */
  onDisbanded: (moves: MoveRecord[]) => void;
}

/**
 * «Расформировать»: proposes another theme for every word of this one (low confidence →
 * «Входящие»), lets the user change any word's target, then deletes the theme and moves the words
 * in one step. Opening it always builds a fresh plan.
 */
export function DisbandSheet({ open, onOpenChange, folder, onDisbanded }: DisbandSheetProps) {
  const desktop = useLayoutClass() !== "compact";
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>(LOADING);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [picking, setPicking] = useState<DisbandMove | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSession((s) => s + 1);
      setPhase(LOADING);
      setApplying(false);
      setApplyError(null);
    }
  }

  useEffect(() => {
    if (!open || session === 0) return;
    const controller = new AbortController();
    runDisband(folder.id, {
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
        setPhase({ status: "error", message: e instanceof ReorgError ? e.message : "Не получилось подобрать темы. Попробуйте ещё раз." });
      });
    return () => controller.abort();
  }, [open, session, folder.id]);

  const close = () => onOpenChange(false);
  const retry = () => {
    setPhase(LOADING);
    setSession((s) => s + 1);
  };

  const apply = async (plan: DisbandPlan) => {
    setApplying(true);
    setApplyError(null);
    try {
      const moves = await applyDisband(plan);
      close();
      if (moves) onDisbanded(moves);
    } catch (e) {
      setApplying(false);
      setApplyError(e instanceof Error ? e.message : "Не получилось расформировать тему");
    }
  };
  /** Without suggestions (offline, error): every word to «Входящие». */
  const applyToInbox = () => void apply({ folderId: folder.id, name: folder.name, targets: [], moves: [] });

  const plan = phase.status === "ready" ? phase.plan : null;
  const groups = plan ? disbandGroups(plan) : [];
  const title = `Расформировать «${folder.name}»`;

  const footer: ReactNode =
    phase.status === "error" ? (
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
        <Button variant="tertiary" onClick={close}>
          Закрыть
        </Button>
        <Button icon="refresh" onClick={retry}>
          Повторить
        </Button>
      </div>
    ) : (
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
        <Button variant="tertiary" onClick={close}>
          Отмена
        </Button>
        <Button disabled={!plan} pending={applying} pendingLabel="Расформировываем…" onClick={() => plan && void apply(plan)}>
          Расформировать
        </Button>
      </div>
    );

  const pad = desktop ? "px-6" : "px-4";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      height="full"
      dialogWidth={640}
      title={desktop ? undefined : title}
      description="Слова темы разойдутся по другим темам, тема будет удалена"
      header={desktop ? <DialogChrome label="Тема" title={title} /> : undefined}
      footer={footer}
    >
      {!desktop && (
        <div className="flex h-11 shrink-0 items-center justify-between pr-1 pl-4">
          <SheetTitle className="min-w-0 truncate">{title}</SheetTitle>
          <SheetCloseButton />
        </div>
      )}

      {phase.status === "loading" && (
        <div aria-busy="true" className={cx(pad, desktop && "pt-4")}>
          <p className="meta m-0" role="status">
            Подбираем темы{phase.total > 1 ? ` · ${phase.done} / ${phase.total}` : "…"}
          </p>
          <div className="mt-3 flex flex-col" aria-hidden="true">
            {[3, 2].map((rows, g) => (
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
        <div className={cx(pad, "mt-2", desktop && "pt-4")}>
          <p role="alert" className="m-0 text-[15px] leading-[22px]">
            {phase.message}
          </p>
          <p className="m-0 mt-3 text-[13px] leading-5 text-muted">Можно расформировать и без подсказок: все слова попадут во «Входящие».</p>
          <Button variant="secondary" size="md" className="mt-3" pending={applying} pendingLabel="Переносим…" onClick={applyToInbox}>
            Всё во «Входящие»
          </Button>
        </div>
      )}

      {plan && (
        <div className={cx(pad, "pb-4", desktop && "pt-4")}>
          <p className="meta m-0">
            <span className="font-medium text-ink">{nWords(plan.moves.length)}</span>
            {" · тема будет удалена"}
          </p>
          <p className="m-0 mt-1 text-[13px] leading-5 text-muted">
            Нажмите на слово, чтобы выбрать другую тему. Отменить можно сразу после.
          </p>
          {applyError && (
            <p role="alert" className="m-0 mt-2 text-[13px] leading-5 text-again">
              {applyError}
            </p>
          )}
          <div className="mt-3 flex flex-col">
            {groups.map((g, i) => (
              <Group
                key={g.folder?.id ?? "inbox"}
                group={g}
                first={i === 0}
                onPick={(move) => {
                  setPicking(move);
                  setPickerOpen(true);
                }}
              />
            ))}
          </div>
        </div>
      )}

      <TargetPickerSheet
        nested
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Куда переместить"
        subtitle={picking?.word.fr}
        options={plan ? folderOptions(plan.targets) : []}
        selectedKey={picking ? (picking.to ?? "inbox") : null}
        onPick={(key) =>
          picking &&
          setPhase((p) => (p.status === "ready" ? { status: "ready", plan: retargetDisband(p.plan, picking.word.id, key === "inbox" ? null : key) } : p))
        }
      />
    </Sheet>
  );
}

function Group({ group, first, onPick }: { group: DisbandGroup; first: boolean; onPick: (move: DisbandMove) => void }) {
  const { folder, moves } = group;
  const name = folder?.name ?? "Входящие";
  return (
    <section aria-label={`${name}: ${nWords(moves.length)}`} className={cx("border-t", first ? "border-ink" : "border-rule")}>
      <div className="flex min-h-11 items-center gap-2 py-2">
        <span
          aria-hidden="true"
          className={cx("h-4 w-[3px] shrink-0", !folder && "w-3 border border-dashed border-muted bg-transparent")}
          style={folder ? { background: folder.color } : undefined}
        />
        <span className="min-w-0 truncate font-serif text-[19px] leading-6 font-medium">
          <span className="font-normal text-muted">→ </span>
          {name}
        </span>
        <span className="font-mono text-[11px] tracking-[.06em] text-muted">{moves.length}</span>
        {!folder && <span className="meta">без темы</span>}
      </div>
      <ul className="m-0 list-none p-0">
        {moves.map((m) => (
          <li key={m.word.id}>
            <button
              type="button"
              onClick={() => onPick(m)}
              aria-label={`${m.word.fr} — изменить тему`}
              className="flex h-11 w-full items-center gap-2 border-t border-surface-2 bg-transparent pl-[22px] text-left text-ink active:bg-surface-2"
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
