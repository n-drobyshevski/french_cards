"use client";

import { useId, useState, type Ref } from "react";
import { Icon } from "@/components/ui/Icons";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { StatusLine } from "@/components/ui/StatusLine";
import { cx } from "@/components/ui/cx";
import type { EnrichResult } from "@/lib/ai/schemas";
import { useSpotlight } from "@/lib/motion";
import type { Folder } from "@/lib/types";
import type { DuplicateInfo } from "./data";
import { choiceName, type FolderChoice } from "./folder-choice";
import { nWords } from "./match";
import type { ParsedLine } from "./parse-list";
import { FieldRow, FolderSelect, PendingDots, SectionHeader, UnknownMeter } from "./parts";

export type ListRowStatus = "ok" | "duplicate" | "repeat" | "invalid";

export interface ListRow extends ParsedLine {
  key: string;
  status: ListRowStatus;
  checked: boolean;
  /** Detected slang level, example and theme, once they have arrived. */
  enrich: EnrichResult | null;
  /** With automatic themes: where this row goes (null = not detected yet). */
  autoFolder: FolderChoice | null;
  /** The word already in the library (status "duplicate"). */
  existing: DuplicateInfo | null;
}

/** Detection of the pasted rows (MOTION-SPEC A10). */
export interface ListDetection {
  /** A request for the current rows is pending (debounce or in flight). */
  pending: boolean;
  /** Pending for 300 ms: rows waiting show «…», the status line counts. */
  waiting: boolean;
  failed: boolean;
  /** Words back / sent. */
  progress: { done: number; total: number } | null;
  /** Rows get their own theme («По темам автоматически»). */
  themes: boolean;
}

const TAGS: Record<Exclude<ListRowStatus, "ok">, string> = {
  duplicate: "уже есть",
  repeat: "повтор",
  invalid: "",
};

export interface ListPanelProps {
  textareaRef: Ref<HTMLTextAreaElement>;
  text: string;
  onText: (text: string) => void;
  rows: readonly ListRow[];
  onToggle: (key: string) => void;
  folder: FolderChoice;
  onFolder: (folder: FolderChoice) => void;
  /** Offer «По темам автоматически» (each row to its own detected theme). */
  auto?: { selected: boolean; onSelect: () => void };
  folders: readonly Folder[];
  /** Settings «Определять уровень сленга» / «Подбирать примеры»: what to show from detection. */
  show?: { slang: boolean; examples: boolean };
  /** Detection of the rows; undefined when nothing is detected (Settings «ИИ» all off). */
  detection?: ListDetection;
}

interface ListStatus {
  text: string;
  count?: string;
  active: boolean;
  progress?: number;
  frozen?: boolean;
  /** Finished: fades out after 1.2 s. */
  fade: boolean;
  key: string;
}

/**
 * One status line over the rows (A10): «Определяем · 4 / 12» on a determinate bar while the rows
 * wait, «Готово · 12 слов» (fading) when they are in, «Не определилось» if the request failed.
 */
export function useListStatus(detection: ListDetection | undefined): ListStatus | null {
  type Run = { id: number; total: number; end: "active" | "done" | "failed" | "dropped" };
  const [run, setRun] = useState<Run | null>(null);
  const waiting = detection?.waiting ?? false;
  const total = detection?.progress?.total ?? 0;
  if (waiting && run?.end !== "active") setRun({ id: (run?.id ?? 0) + 1, total, end: "active" });
  else if (waiting && run && run.total !== total) setRun({ ...run, total });
  else if (!waiting && run?.end === "active") {
    // Ended: answered, failed, or replaced by new rows that are not being waited on yet.
    setRun({ ...run, end: detection?.pending ? "dropped" : detection?.failed ? "failed" : "done" });
  }

  if (!detection || !run || run.end === "dropped") return null;
  if (run.end === "active" && detection.progress) {
    const { done, total: all } = detection.progress;
    return {
      text: "Определяем",
      count: `${done} / ${all}`,
      active: true,
      progress: all > 0 ? done / all : 0,
      fade: false,
      key: `run:${run.id}`,
    };
  }
  if (run.end === "failed") return { text: "Не определилось", active: false, progress: 0, frozen: true, fade: false, key: `failed:${run.id}` };
  if (run.end === "done") return { text: `Готово · ${nWords(run.total)}`, active: false, progress: 1, fade: true, key: `done:${run.id}` };
  return null;
}

/** The 21px status slot above the rows: reserved while detection is on, so nothing moves when it shows. */
export function ListStatusSlot({ status, className }: { status: ListStatus | null; className?: string }) {
  return (
    <div data-list-status="" className={cx("h-[21px]", className)}>
      {status && (
        <div key={status.key} className={cx(status.fade && "animate-[fade-out_var(--dur-exit)_var(--ease-exit)_1200ms_both]")}>
          <StatusLine
            text={status.text}
            count={status.count}
            active={status.active}
            progress={status.progress}
            frozen={status.frozen}
            announce={status.count ? `${status.text} · ${status.count}` : status.text}
          />
        </div>
      )}
    </div>
  );
}

/** «Список»: paste "fr — ru" lines, check the parsed rows, add them in one go. */
export function ListPanel({
  textareaRef,
  text,
  onText,
  rows,
  onToggle,
  folder,
  onFolder,
  auto,
  folders,
  show = { slang: true, examples: true },
  detection,
}: ListPanelProps) {
  const hintId = useId();
  const themeId = useId();
  const headingId = useId();
  const selected = rows.filter((r) => r.checked).length;
  const status = useListStatus(detection);

  return (
    <div className="flex flex-col pb-6">
      <div className="mx-4 mt-4 rounded-[4px] border border-ink bg-surface focus-within:shadow-[inset_0_0_0_1px_var(--ink)]">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onText(e.target.value)}
          rows={6}
          aria-label="Список слов"
          aria-describedby={hintId}
          placeholder={"la thune — бабки, деньги\nkiffer — тащиться\nchelou — стрёмный"}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          className={cx(
            "block w-full resize-none rounded-[3px] bg-transparent px-[15px] py-3 text-[15px] leading-6 text-ink outline-none! [field-sizing:content] placeholder:text-muted pointer-coarse:text-[16px]",
            // Once the rows are parsed below, the pasted text keeps 3 lines (it scrolls), so the same
            // words are not shown twice at full length (M-Add-Detect F4 trim).
            rows.length > 0 ? "max-h-24" : "max-h-[40vh] min-h-[148px]",
          )}
        />
      </div>
      {/* The placeholder shows the format; an unreadable line says what it lacks on its own row. */}
      <p id={hintId} className="sr-only">
        По слову на строку: французское — русское. Подойдёт тире, двоеточие или табуляция.
      </p>

      {rows.length > 0 && (
        <>
          <div className="mx-4 mt-4 border-t border-rule">
            <FieldRow label={<span id={themeId}>Тема</span>} as="div">
              <FolderSelect
                value={folder}
                folders={folders}
                labelledBy={themeId}
                onChange={onFolder}
                auto={auto && { label: "По темам автоматически", ...auto }}
              />
            </FieldRow>
          </div>
          <section aria-labelledby={headingId} aria-busy={detection?.waiting || undefined}>
            {/* The count lives on «Добавить N слов»; the header stays for screen readers. */}
            <SectionHeader id={headingId} title={`Разбор · ${selected} из ${rows.length}`} className="sr-only" />
            {detection && <ListStatusSlot status={status} className="mx-4 mt-2" />}
            <ul className="m-0 mx-4 flex list-none flex-col p-0">
              {rows.map((row) => (
                <li key={row.key}>
                  <ListRowItem row={row} folders={folders} show={show} detection={detection} onToggle={() => onToggle(row.key)} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function ListRowItem({
  row,
  folders,
  show,
  detection,
  onToggle,
}: {
  row: ListRow;
  folders: readonly Folder[];
  show: { slang: boolean; examples: boolean };
  detection?: ListDetection;
  onToggle: () => void;
}) {
  const invalid = row.status === "invalid";
  const tag = invalid ? (row.problem === "no_french" ? "нет французского" : "нет перевода") : row.status === "ok" ? null : TAGS[row.status];
  // One 56px height from the start (A10): the example is saved but not listed, so nothing grows when it lands.
  const pending = !!detection?.waiting && !invalid && !row.enrich;
  // What landed is lit (once per row, as its detection arrives).
  const ref = useSpotlight<HTMLButtonElement>(row.enrich);
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={row.checked}
      aria-busy={pending || undefined}
      disabled={invalid}
      onClick={onToggle}
      className={cx(
        "flex h-14 w-full items-center gap-3 border-b border-rule bg-transparent py-1.5 text-left text-ink active:bg-surface-2 disabled:active:bg-transparent",
        !row.checked && "text-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "flex size-5 shrink-0 items-center justify-center rounded-[2px]",
          row.checked ? "bg-ink text-on-ink" : "border-[1.5px] border-rule bg-surface",
          invalid && "border-dashed",
        )}
      >
        {row.checked && <Icon name="check" size={14} strokeWidth={2.5} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span lang="fr" className={cx("truncate font-serif text-[17px] leading-6 font-medium", !row.fr && "italic")}>
          {row.fr || "—"}
        </span>
        <span className="truncate text-[14px] leading-5 text-muted">{row.ru || "—"}</span>
      </span>
      {(row.enrich || pending) && !tag && (
        <span className="flex max-w-[40%] shrink-0 flex-col items-end gap-1">
          {show.slang && (row.enrich ? <SlangMeter level={row.enrich.slang_level} verlan={row.enrich.verlan} size="sm" /> : <UnknownMeter size="sm" />)}
          {row.autoFolder ? (
            <span className="max-w-full truncate font-mono text-[11px] leading-4 tracking-[.06em] text-muted">
              {row.autoFolder.kind === "new" ? `+ ${row.autoFolder.name}` : choiceName(row.autoFolder, folders)}
            </span>
          ) : (
            pending && detection?.themes && <PendingDots className="text-[11px] leading-4" />
          )}
        </span>
      )}
      {tag && (
        <span
          className={cx(
            "shrink-0 font-mono text-[11px] leading-4 tracking-[.06em] whitespace-nowrap uppercase",
            invalid ? "text-again" : "text-warn",
          )}
        >
          {tag}
        </span>
      )}
    </button>
  );
}
