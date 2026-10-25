"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { exampleMatch } from "@/components/review/format";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { InkUnderline } from "@/components/ui/InkUnderline";
import { ExampleError, MAX_EXAMPLES, requestExample, type ExampleCard } from "@/lib/examples";
import { getSettings } from "@/lib/settings";
import type { WordExample } from "@/lib/types";

/** An example while it is being edited: the Russian side may be empty. */
export interface ExampleDraft {
  fr: string;
  ru: string;
}

export const toDrafts = (list: readonly WordExample[]): ExampleDraft[] => list.map((e) => ({ fr: e.fr, ru: e.ru ?? "" }));

type Busy = { kind: "retry"; index: number } | { kind: "add" } | null;

export interface ExampleListProps {
  /** The word the examples are for; ↻ and the AI «+» need both sides. */
  card: ExampleCard;
  examples: readonly ExampleDraft[];
  /** `index`: the example that changed (a new one is appended at examples.length). */
  onChange: (next: ExampleDraft[], change: { kind: "retry" | "add" | "edit" | "remove"; index: number }) => void;
  /** Inputs (forms) or plain text with ↻ (word detail, saved at once by the parent). */
  editable?: boolean;
  /**
   * sheet: phone sizes; pane: desktop detail pane; form: the add form's borderless rows; entry: the
   * phone word sheet's dictionary entry (L-Word-B: French 19/26, Russian 14/20 under it).
   */
  size?: "sheet" | "pane" | "form" | "entry";
  /** Input classes for the bordered detail forms (editable, sheet/pane). */
  frInputClass?: string;
  ruInputClass?: string;
  /** Editable: French above Russian (stack) or side by side (row, the desktop add dialog). */
  layout?: "stack" | "row";
  /** Text when there is no example yet (read-only); empty: nothing. */
  emptyText?: string;
  /**
   * Read-only: show only examples[from, to) (the word sheet's first example on the entry, the rest
   * under «Ещё»). ↻ still avoids every example and changes the whole list.
   */
  from?: number;
  to?: number;
  /** Offer «+ Ещё пример» / «Подобрать пример» (default true). */
  addable?: boolean;
  /** Read-only: the sentence itself is the edit button (no pencil); gets the example's index. */
  onEdit?: (index: number) => void;
  /** Read-only: the headword, underlined in red ink where it stands in the French sentence. */
  mark?: string;
  /** Beside «+ Ещё пример» (the word card's «Примеры из жизни ›»). */
  aside?: ReactNode;
  /** At the right end of the «+ Ещё пример» row (the word sheet's ✕ / ✓ while editing). */
  trailing?: ReactNode;
  className?: string;
}

/**
 * A word's examples with «другой пример» ↻ on each one and «+ Ещё пример» under them. Both ask
 * /api/ai/example for a sentence unlike the ones the word already has. Without both sides of the
 * word, or offline, «+ Ещё пример» in a form adds an empty example to type by hand.
 */
export function ExampleList({
  card,
  examples,
  onChange,
  editable = false,
  size = "sheet",
  frInputClass,
  ruInputClass,
  layout = "stack",
  emptyText = "Нет примера",
  from = 0,
  to,
  addable = true,
  onEdit,
  mark,
  aside,
  trailing,
  className,
}: ExampleListProps) {
  const settings = useLiveQuery(getSettings);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const ready = card.fr.trim() !== "" && card.ru.trim() !== "";
  const list = examples;
  // In a form, «+ Ещё пример» waits until the first example is there (↻ fills an empty one).
  const canAdd = addable && list.length < MAX_EXAMPLES && (!editable || (list[0]?.fr.trim() ?? "") !== "");
  const shown = (i: number) => editable || (i >= from && (to === undefined || i < to));

  const fetchOne = async (index: number | null): Promise<void> => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(index === null ? { kind: "add" } : { kind: "retry", index });
    setError(null);
    try {
      const avoid = list.map((e) => e.fr.trim()).filter(Boolean);
      const found = await requestExample(card, avoid, { signal: controller.signal, model: settings?.ai_model });
      if (controller.signal.aborted) return;
      const draft = { fr: found.fr, ru: found.ru ?? "" };
      if (index === null) onChange([...list, draft], { kind: "add", index: list.length });
      else onChange(list.map((e, i) => (i === index ? draft : e)), { kind: "retry", index });
    } catch (e) {
      if (controller.signal.aborted || (e instanceof ExampleError && e.code === "aborted")) return;
      setError(e instanceof Error ? e.message : "Не получилось подобрать пример");
      // In a form the learner can still write one by hand.
      if (index === null && editable && !(e instanceof ExampleError && e.code === "none")) {
        onChange([...list, { fr: "", ru: "" }], { kind: "add", index: list.length });
      }
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setBusy(null);
      }
    }
  };

  const add = () => {
    if (ready) void fetchOne(null);
    else onChange([...list, { fr: "", ru: "" }], { kind: "add", index: list.length });
  };

  const isBusy = (i: number) => busy?.kind === "retry" && busy.index === i;
  const frText = size === "pane" ? "text-[16px] leading-6" : size === "entry" ? "text-[19px] leading-[26px]" : "text-[17px] leading-6";
  const ruText = size === "pane" ? "text-[13px] leading-5" : "text-[14px] leading-5";

  /** The French sentence, the headword in it underlined (static: the sheet's only motion is its stamps). */
  const french = (fr: string) => {
    const at = mark ? exampleMatch(fr, mark) : null;
    if (!at) return fr;
    return (
      <>
        {fr.slice(0, at[0])}
        <InkUnderline animate={false} className="[&>[data-ink-underline]]:-bottom-px">
          {fr.slice(at[0], at[1])}
        </InkUnderline>
        {fr.slice(at[1])}
      </>
    );
  };

  const retryButton = (i: number) =>
    ready && (
      <button
        type="button"
        onClick={() => void fetchOne(i)}
        disabled={busy !== null}
        aria-label={`Другой пример вместо «${list[i].fr || "пустого"}»`}
        title="Другой пример"
        className={cx(
          "inline-flex shrink-0 items-center justify-center rounded-[4px] bg-transparent text-muted hoverable:bg-hover-surface hoverable:text-ink disabled:opacity-40",
          size === "pane" ? "size-7 pointer-coarse:size-11" : size === "entry" ? "-my-1.5 -mr-3 size-11" : "-my-1.5 size-11",
        )}
      >
        <Icon name={isBusy(i) ? "refresh" : "spark-refresh"} size={isBusy(i) ? 16 : 20} strokeWidth={1.5} className={cx(isBusy(i) && "animate-spin")} />
      </button>
    );

  return (
    <div className={cx("flex flex-col", className)} aria-busy={busy !== null}>
      {list.length === 0 && !editable && emptyText && <span className={cx("text-muted", size === "pane" ? "text-[14px] leading-5" : "text-[15px] leading-[22px]")}>{emptyText}</span>}

      {list.map((e, i) => shown(i) && (
        <div key={i} className={cx("flex items-start gap-1", i > from && (editable ? "mt-3" : size === "entry" ? "mt-4" : "mt-2"), isBusy(i) && "opacity-50")}>
          {editable ? (
            <span className={cx("min-w-0 flex-1", layout === "row" ? "grid grid-cols-2 gap-x-4" : "flex flex-col")}>
              <input
                type="text"
                value={e.fr}
                onChange={(ev) => onChange(list.map((x, j) => (j === i ? { ...x, fr: ev.target.value } : x)), { kind: "edit", index: i })}
                placeholder="Фраза по-французски"
                aria-label={i === 0 ? "Пример по-французски" : `Пример ${i + 1} по-французски`}
                lang="fr"
                autoComplete="off"
                className={frInputClass}
              />
              <input
                type="text"
                value={e.ru}
                onChange={(ev) => onChange(list.map((x, j) => (j === i ? { ...x, ru: ev.target.value } : x)), { kind: "edit", index: i })}
                placeholder="Перевод примера"
                aria-label={i === 0 ? "Перевод примера" : `Перевод примера ${i + 1}`}
                lang="ru"
                autoComplete="off"
                className={ruInputClass}
              />
            </span>
          ) : onEdit ? (
            // 44px at least: the text's own lines plus the padding the negative margin gives back.
            <button
              type="button"
              onClick={() => onEdit(i)}
              aria-label={`Изменить пример: ${e.fr}${e.ru ? ` — ${e.ru}` : ""}`}
              className="-my-1.5 flex min-w-0 flex-1 flex-col gap-1 bg-transparent py-1.5 text-left text-ink"
            >
              <span lang="fr" className={cx("font-serif italic", frText)}>
                {french(e.fr)}
              </span>
              {e.ru && <span className={cx("text-muted", ruText)}>{e.ru}</span>}
            </button>
          ) : (
            <span className="flex min-w-0 flex-1 flex-col">
              <span lang="fr" className={cx("font-serif italic", frText)}>
                {french(e.fr)}
              </span>
              {e.ru && <span className={cx("text-muted", ruText, size !== "pane" && "-mt-0.5")}>{size === "pane" ? `— ${e.ru}` : e.ru}</span>}
            </span>
          )}
          {retryButton(i)}
          {editable && (list.length > 1 || e.fr || e.ru) && (
            <button
              type="button"
              onClick={() => onChange(list.filter((_, j) => j !== i), { kind: "remove", index: i })}
              aria-label={i === 0 ? "Убрать пример" : `Убрать пример ${i + 1}`}
              className="-my-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-[4px] bg-transparent text-muted hoverable:bg-hover-surface hoverable:text-ink"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
      ))}

      {(canAdd || aside || trailing) && (
        <div className="flex flex-wrap items-center gap-x-3">
          {canAdd && <AddExampleButton onClick={add} busy={busy} ready={ready} empty={list.length === 0} />}
          {canAdd && aside && (
            <span aria-hidden="true" className="mt-1 text-rule">
              |
            </span>
          )}
          {aside}
          {trailing && <span className="mt-1 ml-auto">{trailing}</span>}
        </div>
      )}
      {error && (
        <p role="status" className="m-0 text-[12px] leading-4 text-muted">
          {error}
        </p>
      )}
    </div>
  );
}

/** «+ Ещё пример» / «Подобрать пример» (spark when it asks Claude, a plain plus when it adds an empty row). */
function AddExampleButton({ onClick, busy, ready, empty }: { onClick: () => void; busy: Busy; ready: boolean; empty: boolean }) {
  const adding = busy?.kind === "add";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy !== null}
      className={cx(
        "relative mt-1 inline-flex items-center gap-1.5 self-start bg-transparent text-[13px] leading-5 font-medium text-ink disabled:opacity-50",
        "h-9 before:absolute before:-inset-y-1 before:inset-x-0",
      )}
    >
      <Icon
        name={adding ? "refresh" : ready ? "spark-plus" : "plus"}
        size={ready && !adding ? 17 : 14}
        strokeWidth={ready ? 1.5 : 1.75}
        className={cx(adding && "animate-spin")}
      />
      {adding ? "Подбираем пример…" : empty ? "Подобрать пример" : "Ещё пример"}
    </button>
  );
}
