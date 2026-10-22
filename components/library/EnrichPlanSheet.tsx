"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { DialogChrome, Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { useSnackbar } from "@/components/ui/Snackbar";
import { Toggle } from "@/components/ui/Toggle";
import { cx } from "@/components/ui/cx";
import {
  applyEnrichChanges,
  buildEnrichPlan,
  ENRICH_RUN_MAX,
  EnrichError,
  enrichWords,
  loadEnrichCandidates,
  planChanges,
  type EnrichChange,
  type EnrichField,
  type EnrichPlan,
} from "@/lib/enrich";
import { useFormatKeys } from "@/lib/key-names";
import { useLayoutClass } from "@/lib/use-media";
import { updateWords } from "@/lib/words";
import { CheckMark } from "./Checkbox";
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
  const desktop = useLayoutClass() !== "compact";
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
      const candidates = await loadEnrichCandidates();
      const batch = candidates.slice(0, ENRICH_RUN_MAX);
      const results = await enrichWords(batch, {
        signal: controller.signal,
        onProgress: (done, total) => {
          if (!controller.signal.aborted) setPhase({ status: "loading", done, total });
        },
      });
      return { plan: buildEnrichPlan(batch, results), more: candidates.length - batch.length };
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

  if (desktop) {
    const groups = plan
      ? ([
          ["example", "Примеры", plan.examples],
          ["slang", "Уровень сленга", plan.slang],
        ] as const).filter(([, , changes]) => changes.length > 0)
      : [];
    return (
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        height="full"
        dialogWidth={760}
        description="Примеры и уровень сленга для карточек"
        header={<DialogChrome label="Библиотека" title="Дополнить карточки" />}
        footer={
          <DeskEnrichFooter
            ready={!!plan && !empty}
            error={phase.status === "error"}
            count={picked.length}
            applying={applying}
            onClose={close}
            onRetry={retry}
            onApply={() => void apply()}
          />
        }
      >
        {phase.status === "loading" && (
          <p className="m-0 px-6 pt-4 text-[13px] leading-5 text-muted" role="status" aria-busy="true">
            Подбираем примеры{phase.total > 0 ? ` · ${phase.done} / ${phase.total}` : "…"}
          </p>
        )}
        {phase.status === "error" && (
          <p role="alert" className="m-0 px-6 pt-4 text-[15px] leading-[22px]">
            {phase.message}
          </p>
        )}
        {empty && (
          <div className="px-6 pt-4">
            <p className="m-0 font-serif text-[19px] leading-6">Дополнять нечего</p>
            <p className="m-0 mt-1 text-[13px] leading-5 text-muted">У карточек уже есть примеры и уровень сленга.</p>
          </div>
        )}
        {plan && !empty && (
          <div className="flex flex-col pb-4">
            <p className="m-0 px-6 pt-4 text-[13px] leading-5 text-muted">
              Отмеченное запишется после «Применить». Заполненные вручную поля не меняются.
              {phase.status === "ready" && phase.more > 0 && ` Ещё ${nWords(phase.more)} — откройте снова после применения.`}
            </p>
            <div role="row" className="mt-3 grid h-8 items-center border-b border-ink px-6 font-mono text-[11px] tracking-[.06em] text-muted uppercase" style={{ gridTemplateColumns: ENRICH_LEDGER }}>
              <span />
              <span>Слово</span>
              <span>Перевод</span>
              <span>Предложение</span>
            </div>
            {groups.map(([field, title, changes]) => {
              const keys = changes.map((c) => c.key);
              const on = keys.filter((k) => !off.has(k)).length;
              return (
                <section key={field} aria-label={`${title}: ${changes.length}`}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on === changes.length ? true : on > 0 ? "mixed" : false}
                    aria-label={`${title}: применить все`}
                    onClick={() => toggle(keys, on === 0)}
                    className="grid h-9 w-full items-center border-b border-rule bg-transparent px-6 text-left text-ink hoverable:bg-hover-surface"
                    style={{ gridTemplateColumns: "32px minmax(0,1fr)" }}
                  >
                    <CheckMark checked={on === changes.length} indeterminate={on > 0 && on < changes.length} />
                    <span className="flex items-baseline gap-2">
                      <span className="font-serif text-[19px] leading-6 font-medium">{title}</span>
                      <span className="font-mono text-[11px] text-muted tabular-nums">{on === changes.length ? changes.length : `${on} из ${changes.length}`}</span>
                    </span>
                  </button>
                  {changes.map((c) => {
                    const checked = !off.has(c.key);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggle([c.key], !checked)}
                        className={cx(
                          "grid min-h-8 w-full items-center border-b border-rule bg-transparent px-6 py-1 text-left text-ink hoverable:bg-hover-surface",
                          !checked && "text-muted",
                        )}
                        style={{ gridTemplateColumns: ENRICH_LEDGER }}
                      >
                        <CheckMark checked={checked} />
                        <span lang="fr" className="truncate pr-3 font-serif text-[16px] leading-5 font-medium">
                          {c.word.fr}
                        </span>
                        <span className="truncate pr-3 text-[13px] text-muted">{c.word.ru}</span>
                        {field === "example" ? (
                          <span className="flex min-w-0 flex-col">
                            <span lang="fr" className="truncate font-serif text-[15px] leading-5 italic">
                              {c.patch.example_fr}
                            </span>
                            {c.patch.example_ru && <span className="truncate text-[12px] leading-4 text-muted">{c.patch.example_ru}</span>}
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <SlangMeter level={c.word.slang_level} verlan={c.word.verlan} size="sm" />
                            <span aria-hidden="true" className="text-muted">
                              →
                            </span>
                            <SlangMeter level={c.patch.slang_level ?? c.word.slang_level} verlan={c.patch.verlan ?? c.word.verlan} size="sm" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}
      </Sheet>
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

const ENRICH_LEDGER = "32px 180px 160px minmax(0,1fr)";

function DeskEnrichFooter({
  ready,
  error,
  count,
  applying,
  onClose,
  onRetry,
  onApply,
}: {
  ready: boolean;
  error: boolean;
  count: number;
  applying: boolean;
  onClose: () => void;
  onRetry: () => void;
  onApply: () => void;
}) {
  const keys = useFormatKeys();
  const disabled = !ready || count === 0;
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
  return (
    <div className="flex items-center justify-end gap-4">
      <button
        type="button"
        onClick={onClose}
        aria-keyshortcuts="Escape"
        className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-transparent px-2 text-[14px] font-medium text-ink hoverable:bg-hover-surface"
      >
        {ready ? "Отмена" : "Закрыть"}
        <Kbd aria-hidden="true">Esc</Kbd>
      </button>
      {error ? (
        <Button size="sm" className="h-10 px-4 text-[14px]" icon="refresh" onClick={onRetry}>
          Повторить
        </Button>
      ) : (
        ready && (
          <button
            type="button"
            onClick={() => !disabled && !applying && onApply()}
            aria-disabled={disabled || undefined}
            aria-busy={applying || undefined}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            title={disabled ? "Отметьте хотя бы одно слово" : undefined}
            className={cx(
              "inline-flex h-10 items-center gap-2.5 rounded-[6px] border px-4 text-[14px] font-medium",
              disabled ? "cursor-default border-rule bg-transparent text-boundary" : "border-ink bg-ink text-on-ink",
            )}
          >
            Применить
            <span className="font-mono text-[13px] tabular-nums">{count}</span>
            <Kbd tone={disabled ? "paper" : "ink"} aria-hidden="true">
              {keys("Mod+Enter")}
            </Kbd>
          </button>
        )
      )}
    </div>
  );
}
