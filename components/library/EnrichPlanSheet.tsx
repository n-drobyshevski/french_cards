"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { DialogChrome, Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { SKELETON_WIDTHS, SkeletonBar } from "@/components/ui/Skeleton";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { useSnackbar } from "@/components/ui/Snackbar";
import { StatusLine } from "@/components/ui/StatusLine";
import { Toggle } from "@/components/ui/Toggle";
import { CrossfadeText } from "@/components/import/SwapLabel";
import { cx } from "@/components/ui/cx";
import {
  applyEnrichChanges,
  EnrichError,
  enrichFraction,
  planChanges,
  runEnrichPlan,
  type EnrichChange,
  type EnrichField,
  type EnrichPlan,
  type EnrichProgress,
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
  /** progress is null until the candidates are counted (a local read, before the first request). */
  | { status: "loading"; progress: EnrichProgress | null }
  | { status: "error"; message: string }
  | { status: "ready"; plan: EnrichPlan; more: number };

const LOADING: Phase = { status: "loading", progress: null };
const NOT_READY = "Можно применить, когда план готов";
/** «Применить» that can't: white, #8a8a85 text, rule border — not a greyed ink slab (MOTION-SPEC §3.5). */
const CANT_APPLY = "disabled:border-rule disabled:bg-surface disabled:text-boundary disabled:opacity-100!";

/** Groups write in as blocks when the plan is ready: 40 ms apart, at most 300 ms (MOTION-SPEC §3.6, E2). */
function writeIn(index: number): CSSProperties {
  return { animation: `enter-rise var(--dur-enter) var(--ease-enter) ${Math.min(index * 40, 300)}ms both` };
}

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
    runEnrichPlan({
      signal: controller.signal,
      onStage: (progress) => {
        if (!controller.signal.aborted) setPhase({ status: "loading", progress });
      },
    }).then(
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
      <>
        <p className="m-0 -mt-1.5 mb-2 text-[12px] leading-4 text-muted">
          {!plan ? NOT_READY : picked.length === 0 ? "Отметьте хотя бы одно слово" : "Отменить можно сразу после применения."}
        </p>
        <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
          <Button variant="tertiary" onClick={close}>
            Отмена
          </Button>
          <Button
            className={CANT_APPLY}
            disabled={!plan || picked.length === 0}
            pending={applying}
            pendingLabel="Применяем…"
            trailing={plan ? <CrossfadeText text={String(picked.length)} /> : undefined}
            onClick={() => void apply()}
          >
            Применить
          </Button>
        </div>
      </>
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
            loading={phase.status === "loading"}
            error={phase.status === "error"}
            count={picked.length}
            applying={applying}
            onClose={close}
            onRetry={retry}
            onApply={() => void apply()}
          />
        }
      >
        {phase.status === "loading" && <PlanProgress progress={phase.progress} desk />}
        {phase.status === "error" && <PlanError message={phase.message} desk />}
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
            {groups.map(([field, title, changes], index) => {
              const keys = changes.map((c) => c.key);
              const on = keys.filter((k) => !off.has(k)).length;
              return (
                <section key={field} aria-label={`${title}: ${changes.length}`} style={writeIn(index)}>
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
                          "grid min-h-8 w-full items-center border-b border-rule bg-transparent px-6 py-1 text-left text-ink transition-opacity duration-(--dur-quick) ease-standard hoverable:bg-hover-surface",
                          !checked && "text-muted",
                          on === 0 && "opacity-50",
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

      {phase.status === "loading" && <PlanProgress progress={phase.progress} />}

      {phase.status === "error" && <PlanError message={phase.message} />}

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
                <ChangeGroup key={field} field={field} title={title} changes={changes} first={i === 0} style={writeIn(i)} off={off} onToggle={toggle} />
              ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

type StepState = "done" | "active" | "pending";

function PlanStep({ n, label, state, last, desk }: { n: string; label: string; state: StepState; last?: boolean; desk?: boolean }) {
  return (
    <li
      aria-current={state === "active" ? "step" : undefined}
      className={cx("flex items-center gap-2 border-t border-rule", desk ? "h-9" : "h-7", last && "border-b")}
    >
      <span className={cx("w-5 font-mono text-[11px] tracking-[.06em] tabular-nums", state === "active" ? "text-ink" : "text-muted")}>{n}</span>
      <span
        className={cx(
          "min-w-0 flex-1 truncate leading-5 tabular-nums",
          desk ? "text-[14px]" : "text-[13px]",
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

/**
 * The plan being built (MOTION-SPEC E2, as the sort plan's S1): «01 Карточки · 48» (the local
 * count) and «02 Примеры и уровень · 24 / 48» (the batches), a determinate 1px bar that moves per
 * batch, elapsed after 3 s, and two static skeleton groups in the real group geometry.
 */
function PlanProgress({ progress, desk = false }: { progress: EnrichProgress | null; desk?: boolean }) {
  const count = progress ? `${progress.wordsDone} / ${progress.words}` : null;
  const pad = desk ? "px-6" : "px-4";
  return (
    <div aria-busy="true" data-enrich-progress="" className={cx("flex flex-col", desk ? "pt-4" : "pt-0")}>
      <p className={cx("m-0 h-5 text-[13px] leading-5 text-muted", pad)}>{progress ? `${nWords(progress.words)} без примера или уровня` : ""}</p>
      <ol aria-label="Этапы" className={cx("m-0 mt-3 list-none p-0", pad)}>
        {/* The count is a local read: no «ИДЁТ» for it, it is done by the time it could show. */}
        <PlanStep n="01" label={progress ? `Карточки · ${progress.words}` : "Карточки"} state={progress ? "done" : "pending"} desk={desk} />
        <PlanStep n="02" label={count ? `Примеры и уровень · ${count}` : "Примеры и уровень"} state={progress ? "active" : "pending"} last desk={desk} />
      </ol>
      <StatusLine
        className={cx("mt-3", desk ? "mx-6" : "mx-4")}
        text="Подбираем примеры"
        count={count ?? undefined}
        announce={count ? `Подбираем примеры · ${count}` : "Подбираем примеры"}
        active
        progress={progress ? enrichFraction(progress) : 0}
      />
      <div aria-hidden="true" className={cx("mt-3 flex flex-col", pad)}>
        {[3, 2].map((rows, g) => (
          <div key={g} className={cx("border-t", g === 0 ? "border-ink" : "border-rule")}>
            <div className={cx("flex items-center gap-3", desk ? "h-9 pl-8" : "h-11")}>
              <SkeletonBar width={g === 0 ? 88 : 128} />
              <SkeletonBar width={16} height={6} />
            </div>
            {Array.from({ length: rows }, (_, i) => {
              const [a, b] = SKELETON_WIDTHS[(g + i) % SKELETON_WIDTHS.length];
              return (
                <div key={i} className={cx("flex gap-3 border-t border-surface-2", desk ? "h-8 items-center pl-8" : "h-14 flex-col justify-center gap-1.5 pl-8")}>
                  <SkeletonBar width={a + 24} />
                  <SkeletonBar width={a + b} height={6} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A failed plan (as the sort plan's S3): in place of the skeleton groups, a 1px --again rule on top. «Повторить» is in the footer. */
function PlanError({ message, desk = false }: { message: string; desk?: boolean }) {
  return (
    <div className={cx("flex flex-col", desk ? "px-6 pt-4" : "px-4")}>
      <StatusLine text="Не удалось" active={false} progress={0} frozen />
      <p role="alert" data-enrich-error="" className="m-0 mt-3 border-t border-again pt-3 text-[15px] leading-[22px]">
        {message}
      </p>
    </div>
  );
}

function ChangeGroup({
  field,
  title,
  changes,
  first,
  style,
  off,
  onToggle,
}: {
  field: EnrichField;
  title: string;
  changes: readonly EnrichChange[];
  first: boolean;
  style?: CSSProperties;
  off: ReadonlySet<string>;
  onToggle: (keys: readonly string[], on: boolean) => void;
}) {
  const keys = changes.map((c) => c.key);
  const on = keys.filter((k) => !off.has(k)).length;
  return (
    <section aria-label={`${title}: ${changes.length}`} className={cx("border-t", first ? "border-ink" : "border-rule")} style={style}>
      <div className="flex min-h-11 items-center gap-3">
        <span
          className={cx(
            "flex min-w-0 flex-1 items-baseline gap-2 py-2 transition-opacity duration-(--dur-quick) ease-standard",
            on === 0 && "opacity-50",
          )}
        >
          <span className="min-w-0 truncate font-serif text-[19px] leading-6 font-medium">{title}</span>
          <span className="font-mono text-[11px] tracking-[.06em] text-muted">
            {on === changes.length ? changes.length : `${on} из ${changes.length}`}
          </span>
        </span>
        <Toggle checked={on > 0} onCheckedChange={(v) => onToggle(keys, v)} aria-label={`${title}: применить все`} />
      </div>
      {/* A group switched off dims to .5 over --dur-quick, as in «Разложить по темам» (S4). */}
      <ul className={cx("m-0 list-none p-0 transition-opacity duration-(--dur-quick) ease-standard", on === 0 && "opacity-50")}>
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
  loading,
  error,
  count,
  applying,
  onClose,
  onRetry,
  onApply,
}: {
  ready: boolean;
  /** Still building: «Применить» shows, disabled, with its reason. */
  loading: boolean;
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
      <p className="m-0 min-w-0 flex-1 text-[13px] leading-5 text-muted">{loading ? NOT_READY : ""}</p>
      <button
        type="button"
        onClick={onClose}
        aria-keyshortcuts="Escape"
        className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-transparent px-2 text-[14px] font-medium text-ink hoverable:bg-hover-surface"
      >
        {ready || loading ? "Отмена" : "Закрыть"}
        <Kbd aria-hidden="true">Esc</Kbd>
      </button>
      {error ? (
        <Button size="sm" className="h-10 px-4 text-[14px]" icon="refresh" onClick={onRetry}>
          Повторить
        </Button>
      ) : (
        (ready || loading) && (
          <button
            type="button"
            onClick={() => !disabled && !applying && onApply()}
            aria-disabled={disabled || undefined}
            aria-busy={applying || undefined}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            title={disabled ? (ready ? "Отметьте хотя бы одно слово" : NOT_READY) : undefined}
            className={cx(
              "inline-flex h-10 items-center gap-2.5 rounded-[6px] border px-4 text-[14px] font-medium",
              disabled ? "cursor-default border-rule bg-transparent text-boundary" : "border-ink bg-ink text-on-ink",
            )}
          >
            Применить
            {ready && <CrossfadeText text={String(count)} className="font-mono text-[13px]" />}
            <Kbd tone={disabled ? "paper" : "ink"} aria-hidden="true">
              {keys("Mod+Enter")}
            </Kbd>
          </button>
        )
      )}
    </div>
  );
}
