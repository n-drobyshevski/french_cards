"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icons";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { useSnackbar } from "@/components/ui/Snackbar";
import { Toggle } from "@/components/ui/Toggle";
import { cx } from "@/components/ui/cx";
import {
  applyEnrichChanges,
  buildEnrichPlan,
  ENRICH_RUN_MAX,
  EnrichError,
  enrichPreferences,
  enrichWords,
  loadEnrichCandidates,
  planChanges,
  type EnrichChange,
  type EnrichField,
  type EnrichPlan,
} from "@/lib/enrich";
import { getSettings } from "@/lib/settings";
import { updateWords } from "@/lib/words";
import { nWords } from "./format";

export interface EnrichPlanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase =
  | { status: "loading"; done: number; total: number }
  | { status: "error"; message: string }
  | { status: "ready"; plan: EnrichPlan; more: number };

const LOADING: Phase = { status: "loading", done: 0, total: 0 };

/**
 * «Дополнить карточки»: detects an example for words without one and the slang level of words
 * typed by hand before it was detected, shows every change, and writes only the checked ones
 * on «Применить» (with an undo snackbar).
 */
export function EnrichPlanSheet({ open, onOpenChange }: EnrichPlanSheetProps) {
  const snackbar = useSnackbar();
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>(LOADING);
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const [applying, setApplying] = useState(false);

  // Every opening builds a fresh plan.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSession((s) => s + 1);
      setPhase(LOADING);
      setOff(new Set());
      setApplying(false);
    }
  }

  useEffect(() => {
    if (!open || session === 0) return;
    const controller = new AbortController();
    (async () => {
      const settings = await getSettings();
      const prefs = enrichPreferences(settings);
      const candidates = await loadEnrichCandidates(prefs);
      const batch = candidates.slice(0, ENRICH_RUN_MAX);
      const results = await enrichWords(batch, {
        signal: controller.signal,
        model: settings.ai_model,
        onProgress: (done, total) => {
          if (!controller.signal.aborted) setPhase({ status: "loading", done, total });
        },
      });
      return { plan: buildEnrichPlan(batch, results, prefs), more: candidates.length - batch.length };
    })().then(
      ({ plan, more }) => {
        if (!controller.signal.aborted) setPhase({ status: "ready", plan, more });
      },
      (e: unknown) => {
        if (controller.signal.aborted) return;
        setPhase({ status: "error", message: e instanceof EnrichError ? e.message : "Не получилось дополнить карточки. Попробуйте ещё раз." });
      },
    );
    return () => controller.abort();
  }, [open, session]);

  const close = () => onOpenChange(false);
  const retry = () => {
    setPhase(LOADING);
    setSession((s) => s + 1);
  };
  const toggle = (keys: readonly string[], on: boolean) =>
    setOff((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.delete(k);
        else next.add(k);
      }
      return next;
    });

  const plan = phase.status === "ready" ? phase.plan : null;
  const picked = plan ? planChanges(plan).filter((c) => !off.has(c.key)) : [];
  const empty = plan !== null && plan.examples.length === 0 && plan.slang.length === 0;

  const apply = async () => {
    setApplying(true);
    try {
      const undo = await applyEnrichChanges(picked);
      close();
      if (undo.length === 0) {
        snackbar.show({ message: "Нечего обновлять: слова уже изменились" });
        return;
      }
      snackbar.show({
        message: `Обновлено ${nWords(undo.length)}`,
        actionLabel: "Отменить",
        onAction: () => {
          void updateWords(undo).then(
            () => snackbar.show({ message: "Изменения отменены" }),
            () => snackbar.show({ message: "Не получилось отменить" }),
          );
        },
      });
    } catch (e) {
      setApplying(false);
      snackbar.show({ message: e instanceof Error ? e.message : "Не получилось применить изменения" });
    }
  };

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
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
        <Button variant="tertiary" onClick={close}>
          Отмена
        </Button>
        <Button disabled={!plan || picked.length === 0} loading={applying} trailing={plan ? picked.length : undefined} onClick={() => void apply()}>
          Применить
        </Button>
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} height="full" dialogWidth={760} description="Примеры и уровень сленга для карточек" footer={footer}>
      <div className="flex h-11 shrink-0 items-center justify-between pr-1 pl-4">
        <SheetTitle className="min-w-0 truncate">Дополнить карточки</SheetTitle>
        <SheetCloseButton />
      </div>

      {phase.status === "loading" && (
        <div aria-busy="true">
          <p className="meta m-0 px-4" role="status">
            Подбираем примеры{phase.total > 0 ? ` · ${phase.done} / ${phase.total}` : "…"}
          </p>
          <div className="mt-3 flex flex-col px-4" aria-hidden="true">
            {[3, 2].map((rows, g) => (
              <div key={g} className={cx("border-t", g === 0 ? "border-ink" : "border-rule")}>
                <div className="flex h-11 items-center">
                  <span className="h-3 w-28 rounded-[2px] bg-surface-2" />
                </div>
                {Array.from({ length: rows }, (_, i) => (
                  <div key={i} className="flex h-14 items-center gap-3 border-t border-surface-2 pl-8">
                    <span className="h-2.5 w-24 rounded-[2px] bg-surface-2" />
                    <span className="h-2.5 w-36 rounded-[2px] bg-surface-2" />
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
          <p className="m-0 mt-2 px-4 font-serif text-[19px] leading-6">Дополнять нечего</p>
          <p className="m-0 mt-1 px-4 text-[13px] leading-5 text-muted">У карточек уже есть примеры и уровень сленга.</p>
        </>
      )}

      {plan && !empty && (
        <>
          <p className="m-0 px-4 text-[13px] leading-5 text-muted">
            Отмеченное запишется после «Применить». Заполненные вручную поля не меняются.
            {phase.status === "ready" && phase.more > 0 && ` Ещё ${nWords(phase.more)} — откройте снова после применения.`}
          </p>
          <div className="mt-3 flex flex-col px-4 pb-4">
            {(
              [
                ["example", "Примеры", plan.examples],
                ["slang", "Уровень сленга", plan.slang],
              ] as const
            )
              .filter(([, , changes]) => changes.length > 0)
              .map(([field, title, changes], i) => (
                <ChangeGroup key={field} field={field} title={title} changes={changes} first={i === 0} off={off} onToggle={toggle} />
              ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

function ChangeGroup({
  field,
  title,
  changes,
  first,
  off,
  onToggle,
}: {
  field: EnrichField;
  title: string;
  changes: readonly EnrichChange[];
  first: boolean;
  off: ReadonlySet<string>;
  onToggle: (keys: readonly string[], on: boolean) => void;
}) {
  const keys = changes.map((c) => c.key);
  const on = keys.filter((k) => !off.has(k)).length;
  return (
    <section aria-label={`${title}: ${changes.length}`} className={cx("border-t", first ? "border-ink" : "border-rule")}>
      <div className="flex min-h-11 items-center gap-3">
        <span className="flex min-w-0 flex-1 items-baseline gap-2 py-2">
          <span className="min-w-0 truncate font-serif text-[19px] leading-6 font-medium">{title}</span>
          <span className="font-mono text-[11px] tracking-[.06em] text-muted">
            {on === changes.length ? changes.length : `${on} из ${changes.length}`}
          </span>
        </span>
        <Toggle checked={on > 0} onCheckedChange={(v) => onToggle(keys, v)} aria-label={`${title}: применить все`} />
      </div>
      <ul className="m-0 list-none p-0">
        {changes.map((c) => (
          <li key={c.key}>
            <ChangeRow change={c} field={field} checked={!off.has(c.key)} onToggle={() => onToggle([c.key], off.has(c.key))} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChangeRow({ change, field, checked, onToggle }: { change: EnrichChange; field: EnrichField; checked: boolean; onToggle: () => void }) {
  const { word, patch } = change;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cx(
        "flex min-h-14 w-full items-center gap-3 border-t border-surface-2 bg-transparent py-2 text-left text-ink active:bg-surface-2",
        !checked && "text-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "flex size-5 shrink-0 items-center justify-center rounded-[2px]",
          checked ? "bg-ink text-on-ink" : "border-[1.5px] border-rule bg-surface",
        )}
      >
        {checked && <Icon name="check" size={14} strokeWidth={2.5} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline gap-2">
          <span lang="fr" className="truncate font-serif text-[17px] leading-6 font-medium">
            {word.fr}
          </span>
          <span className="min-w-0 truncate text-[13px] leading-5 text-muted">{word.ru}</span>
        </span>
        {field === "example" ? (
          <>
            <span lang="fr" className="truncate font-serif text-[15px] leading-5 italic">
              {patch.example_fr}
            </span>
            {patch.example_ru && <span className="truncate text-[13px] leading-5 text-muted">{patch.example_ru}</span>}
          </>
        ) : (
          <span className="mt-1 flex items-center gap-2">
            <SlangMeter level={word.slang_level} verlan={word.verlan} size="sm" />
            <span aria-hidden="true" className="text-muted">
              →
            </span>
            <SlangMeter level={patch.slang_level ?? word.slang_level} verlan={patch.verlan ?? word.verlan} size="sm" />
          </span>
        )}
      </span>
    </button>
  );
}
