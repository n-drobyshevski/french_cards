"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
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
  /** sheet: phone sizes; pane: desktop detail pane; form: the add form's borderless rows. */
  size?: "sheet" | "pane" | "form";
  /** Input classes for the bordered detail forms (editable, sheet/pane). */
  frInputClass?: string;
  ruInputClass?: string;
  /** Editable: French above Russian (stack) or side by side (row, the desktop add dialog). */
  layout?: "stack" | "row";
  /** Text when there is no example yet (read-only). */
  emptyText?: string;
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
  const canAdd = list.length < MAX_EXAMPLES && (!editable || (list[0]?.fr.trim() ?? "") !== "");

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
  const frText = size === "pane" ? "text-[16px] leading-6" : "text-[17px] leading-6";
  const ruText = size === "pane" ? "text-[13px] leading-5" : "text-[14px] leading-5";

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
          size === "pane" ? "size-7 pointer-coarse:size-11" : "-my-1.5 size-11",
        )}
      >
        <Icon name="refresh" size={16} className={cx(isBusy(i) && "animate-spin")} />
      </button>
    );

  return (
    <div className={cx("flex flex-col", className)} aria-busy={busy !== null}>
      {list.length === 0 && !editable && <span className={cx("text-muted", size === "pane" ? "text-[14px] leading-5" : "text-[15px] leading-[22px]")}>{emptyText}</span>}

      {list.map((e, i) => (
        <div key={i} className={cx("flex items-start gap-1", i > 0 && (editable ? "mt-3" : "mt-2"), isBusy(i) && "opacity-50")}>
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
          ) : (
            <span className="flex min-w-0 flex-1 flex-col">
              <span lang="fr" className={cx("font-serif italic", frText)}>
                {e.fr}
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

      {canAdd && (
        <button
          type="button"
          onClick={add}
          disabled={busy !== null}
          className={cx(
            "relative mt-1 inline-flex items-center gap-1.5 self-start bg-transparent text-[13px] leading-5 font-medium text-ink disabled:opacity-50",
            "h-9 before:absolute before:-inset-y-1 before:inset-x-0",
          )}
        >
          <Icon name={busy?.kind === "add" ? "refresh" : "plus"} size={14} className={cx(busy?.kind === "add" && "animate-spin")} />
          {busy?.kind === "add" ? "Подбираем пример…" : list.length === 0 ? "Подобрать пример" : "Ещё пример"}
        </button>
      )}
      {error && (
        <p role="status" className="m-0 text-[12px] leading-4 text-muted">
          {error}
        </p>
      )}
    </div>
  );
}
