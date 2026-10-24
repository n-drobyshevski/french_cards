"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { DialogChrome, Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { useSnackbar } from "@/components/ui/Snackbar";
import { StatusLine } from "@/components/ui/StatusLine";
import { Toggle } from "@/components/ui/Toggle";
import { CrossfadeText } from "@/components/import/SwapLabel";
import { cx } from "@/components/ui/cx";
import type { LevelResolver } from "@/lib/core/level";
import { useFormatKeys } from "@/lib/key-names";
import { applyLevelChanges, EnrichError, enrichFraction, levelPlanChanges, runLevelPlan, type EnrichProgress, type LevelChange, type LevelPlan } from "@/lib/enrich";
import { useLayoutClass } from "@/lib/use-media";
import { updateWords } from "@/lib/words";
import { nWords, posAbbr } from "./format";
import { LevelMark } from "./LevelMark";

export interface LevelFillSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The level resolver the candidates were counted with (useLevelData). */
  levels: LevelResolver;
}

type Phase =
  | { status: "loading"; progress: EnrichProgress | null }
  | { status: "error"; message: string }
  | { status: "ready"; plan: LevelPlan; words: number; more: number };

const LOADING: Phase = { status: "loading", progress: null };
const FAILED = "Не получилось определить уровень. Попробуйте ещё раз.";

/**
 * «Определить уровень языка» (Level-Fill): the words with no stored level and no estimate get a
 * level from Claude through the app (`/api/ai/enrich` scope "level"), shown grouped by level
 * before anything is saved; the checked ones are saved as the app's («от Claude»), with an undo.
 * Phones: a full sheet; wider screens: the 760 dialog, like «Дополнить карточки».
 */
export function LevelFillSheet({ open, onOpenChange, levels }: LevelFillSheetProps) {
  const snackbar = useSnackbar();
  const desk = useLayoutClass() !== "compact";
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>(LOADING);
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [saving, setSaving] = useState(false);

  // Every opening builds a fresh plan.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSession((s) => s + 1);
      setPhase(LOADING);
      setOff(new Set());
      setExpanded(new Set());
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!open || session === 0) return;
    const controller = new AbortController();
    runLevelPlan(levels, {
      signal: controller.signal,
      onStage: (progress) => {
        if (!controller.signal.aborted) setPhase({ status: "loading", progress });
      },
    }).then(
      ({ plan, words, more }) => {
        if (!controller.signal.aborted) setPhase({ status: "ready", plan, words, more });
      },
      (e: unknown) => {
        if (!controller.signal.aborted) setPhase({ status: "error", message: e instanceof EnrichError ? e.message : FAILED });
      },
    );
    return () => controller.abort();
    // The resolver is read once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const toggleOpen = (level: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });

  const plan = phase.status === "ready" ? phase.plan : null;
  const picked = plan ? levelPlanChanges(plan).filter((c) => !off.has(c.key)) : [];
  const empty = plan !== null && plan.groups.length === 0;
  const title = phase.status === "ready" ? `Уровень языка для ${nWords(phase.words)}` : "Определить уровень языка";

  const save = async () => {
    setSaving(true);
    try {
      const undo = await applyLevelChanges(picked);
      close();
      if (undo.length === 0) {
        snackbar.show({ message: "Нечего сохранять: уровни уже указаны" });
        return;
      }
      snackbar.show({
        message: `Уровень языка: ${nWords(undo.length)}`,
        actionLabel: "Отменить",
        onAction: () => {
          void updateWords(undo).then(
            () => snackbar.show({ message: "Уровни отменены" }),
            () => snackbar.show({ message: "Не получилось отменить" }),
          );
        },
      });
    } catch (e) {
      setSaving(false);
      snackbar.show({ message: e instanceof Error ? e.message : "Не получилось сохранить уровни" });
    }
  };

  const pad = desk ? "px-6" : "px-4";
  let body: ReactNode = null;
  if (phase.status === "loading") {
    const p = phase.progress;
    const count = p ? `${p.wordsDone} / ${p.words}` : undefined;
    body = (
      <div aria-busy="true" data-level-progress="" className={cx("flex flex-col", desk && "pt-4", pad)}>
        <p className="m-0 h-5 text-[13px] leading-5 text-muted">{p ? `${nWords(p.words)} без уровня` : ""}</p>
        <StatusLine
          className="mt-3"
          text="Определяем уровень"
          count={count}
          announce={count ? `Определяем уровень · ${count}` : "Определяем уровень"}
          active
          progress={p ? enrichFraction(p) : 0}
        />
      </div>
    );
  } else if (phase.status === "error") {
    body = (
      <div className={cx("flex flex-col", desk && "pt-4", pad)}>
        <StatusLine text="Не удалось" active={false} progress={0} frozen />
        <p role="alert" className="m-0 mt-3 border-t border-again pt-3 text-[15px] leading-[22px]">
          {phase.message}
        </p>
      </div>
    );
  } else if (empty) {
    body = (
      <div className={cx(desk && "pt-4", pad)}>
        <p className="m-0 font-serif text-[19px] leading-6">{phase.words === 0 ? "Уровень есть у всех слов" : "Claude не предложил уровней"}</p>
        <p className="m-0 mt-1 text-[13px] leading-5 text-muted">
          {phase.words === 0 ? "У каждого слова есть оценка по словарю или ваш уровень." : "Для этих слов уровня нет — их можно указать в карточке слова."}
        </p>
      </div>
    );
  } else if (plan) {
    body = (
      <div className={cx("flex flex-col pb-4", desk && "pt-4", pad)}>
        <p className="m-0 text-[13px] leading-[18px] text-muted">
          Этих слов нет в словаре. Claude предложил уровни — они сохранятся с пометкой «от Claude».
          {phase.status === "ready" && phase.more > 0 && ` Ещё ${nWords(phase.more)} — откройте снова после сохранения.`}
        </p>
        <div className="mt-3 flex flex-col border-b border-rule">
          {plan.groups.map((g) => {
            const keys = g.changes.map((c) => c.key);
            const on = keys.filter((k) => !off.has(k)).length;
            const isOpen = expanded.has(g.level);
            return (
              <section key={g.level} aria-label={`${g.level}: ${nWords(g.changes.length)}`} className="border-t border-rule">
                <div className="flex h-11 items-center gap-2">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggleOpen(g.level)}
                    className={cx("flex h-11 min-w-0 flex-1 items-center gap-2 bg-transparent p-0 text-left text-ink", on === 0 && "opacity-50")}
                  >
                    <Icon name={isOpen ? "chevron" : "chevron-right"} size={16} className="shrink-0 text-muted" />
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-[13px] font-medium tracking-[.04em]">{g.level}</span>
                      <span className="text-[14px] text-muted">
                        · {on === g.changes.length ? nWords(g.changes.length) : `${on} из ${g.changes.length}`}
                      </span>
                    </span>
                  </button>
                  <Toggle checked={on > 0} onCheckedChange={(v) => toggle(keys, v)} aria-label={`${g.level}: сохранить все`} />
                </div>
                {isOpen && (
                  <ul className={cx("m-0 list-none p-0", on === 0 && "opacity-50")}>
                    {g.changes.map((c) => (
                      <li key={c.key}>
                        <LevelRow change={c} checked={!off.has(c.key)} onToggle={() => toggle([c.key], off.has(c.key))} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
          {plan.none.length > 0 && (
            <div className="flex h-11 items-center gap-2 border-t border-rule text-muted">
              <span className="w-4 shrink-0" />
              <span className="flex flex-1 items-baseline gap-2">
                <span className="font-mono text-[13px] tracking-[.06em] text-ink uppercase">без уровня</span>
                <span className="text-[14px]">· {nWords(plan.none.length)}</span>
              </span>
              <span className="font-mono text-[11px] tracking-[.06em] uppercase">не сохраняем</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const canSave = !!plan && !empty && picked.length > 0;
  const footer = desk ? (
    <DeskLevelFooter
      phase={phase.status}
      empty={empty}
      count={plan ? picked.length : null}
      saving={saving}
      onClose={close}
      onRetry={retry}
      onSave={() => void save()}
    />
  ) : phase.status === "error" ? (
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
        <Button variant="tertiary" onClick={close}>
          Закрыть
        </Button>
        <Button icon="refresh" onClick={retry}>
          Повторить
        </Button>
      </div>
    ) : empty ? (
      <Button block variant="secondary" onClick={close}>
        Закрыть
      </Button>
    ) : (
      <>
        <p className="m-0 -mt-1.5 mb-2 text-[12px] leading-4 text-muted">
          {!plan ? "Можно сохранить, когда уровни готовы" : picked.length === 0 ? "Отметьте хотя бы одно слово" : "Отменить можно сразу после сохранения."}
        </p>
        <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
          <Button variant="tertiary" onClick={close}>
            Отмена
          </Button>
          <Button
            disabled={!canSave}
            pending={saving}
            pendingLabel="Сохраняем…"
            trailing={plan ? <CrossfadeText text={String(picked.length)} /> : undefined}
            onClick={() => void save()}
          >
            Сохранить уровни
          </Button>
        </div>
      </>
    );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      height="full"
      dialogWidth={760}
      description="Уровень языка для слов, которых нет в словаре"
      header={desk ? <DialogChrome label="Библиотека" title={title} /> : undefined}
      footer={footer}
    >
      {!desk && (
        <div className="flex h-11 shrink-0 items-center justify-between pr-1 pl-4">
          <SheetTitle className="min-w-0 truncate">{title}</SheetTitle>
          <SheetCloseButton />
        </div>
      )}
      {body}
    </Sheet>
  );
}

/**
 * The 760 dialog's footer, like «Предлагаемые перемещения» (DESKTOP-SPEC): «Отмена Esc» and
 * «Сохранить уровни 90 ⌘↵»; ⌘↵ / Ctrl+Enter saves from anywhere in the dialog.
 */
function DeskLevelFooter({
  phase,
  empty,
  count,
  saving,
  onClose,
  onRetry,
  onSave,
}: {
  phase: Phase["status"];
  empty: boolean;
  /** The checked words; null until the plan is ready. */
  count: number | null;
  saving: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSave: () => void;
}) {
  const keys = useFormatKeys();
  const ready = phase === "ready" && !empty;
  const disabled = !ready || !count;
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });
  useEffect(() => {
    if (disabled || saving) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.repeat) {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, saving]);
  const loading = phase === "loading";
  return (
    <div className="flex items-center justify-end gap-4">
      <p className="m-0 min-w-0 flex-1 text-[13px] leading-5 text-muted">
        {loading ? "Можно сохранить, когда уровни готовы" : ready ? (count ? "Отменить можно сразу после сохранения." : "Отметьте хотя бы одно слово") : ""}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-keyshortcuts="Escape"
        className="inline-flex h-10 items-center gap-2 rounded-[6px] bg-transparent px-2 text-[14px] font-medium text-ink hoverable:bg-hover-surface"
      >
        {ready || loading ? "Отмена" : "Закрыть"}
        <Kbd aria-hidden="true">Esc</Kbd>
      </button>
      {phase === "error" ? (
        <Button size="sm" className="h-10 px-4 text-[14px]" icon="refresh" onClick={onRetry}>
          Повторить
        </Button>
      ) : (
        !empty && (
          <button
            type="button"
            onClick={() => !disabled && !saving && onSave()}
            aria-disabled={disabled || undefined}
            aria-busy={saving || undefined}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            className={cx(
              "inline-flex h-10 items-center gap-2.5 rounded-[6px] border px-4 text-[14px] font-medium transition-colors duration-(--dur-quick) ease-standard",
              disabled ? "cursor-default border-rule bg-transparent text-boundary" : "border-ink bg-ink text-on-ink",
            )}
          >
            {saving ? "Сохраняем…" : "Сохранить уровни"}
            {count !== null && !saving && <CrossfadeText text={String(count)} className="font-mono text-[13px]" />}
            <Kbd tone={disabled ? "paper" : "ink"} aria-hidden="true">
              {keys("Mod+Enter")}
            </Kbd>
          </button>
        )
      )}
    </div>
  );
}

function LevelRow({ change, checked, onToggle }: { change: LevelChange; checked: boolean; onToggle: () => void }) {
  const { word } = change;
  const abbr = posAbbr(word);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cx("flex min-h-[52px] w-full items-center gap-3 bg-transparent py-1.5 pl-6 text-left text-ink active:bg-surface-2", !checked && "text-muted")}
    >
      <span
        aria-hidden="true"
        className={cx("flex size-[18px] shrink-0 items-center justify-center rounded-[2px]", checked ? "bg-ink text-on-ink" : "border-[1.5px] border-rule bg-surface")}
      >
        {checked && <Icon name="check" size={14} strokeWidth={2.25} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
          <span lang="fr" className="truncate font-serif text-[17px] leading-[22px] font-medium">
            {word.fr}
          </span>
          {abbr && (
            <span lang="fr" className="abbr shrink-0 text-[14px]">
              {abbr}
            </span>
          )}
        </span>
        <span className="truncate text-[13px] leading-[18px] text-muted">{word.ru}</span>
      </span>
      <LevelMark info={{ level: change.cefr, source: "ai", estimated: true }} size="header" className="font-medium" />
    </button>
  );
}
