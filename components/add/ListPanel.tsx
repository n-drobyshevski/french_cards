"use client";

import { useId, type Ref } from "react";
import { Icon } from "@/components/ui/Icons";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { cx } from "@/components/ui/cx";
import type { EnrichResult } from "@/lib/ai/schemas";
import type { Folder } from "@/lib/types";
import type { DuplicateInfo } from "./data";
import { choiceName, type FolderChoice } from "./folder-choice";
import type { ParsedLine } from "./parse-list";
import { FieldRow, FolderSelect, SectionHeader } from "./parts";

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
}: ListPanelProps) {
  const hintId = useId();
  const themeId = useId();
  const headingId = useId();
  const selected = rows.filter((r) => r.checked).length;

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
          className="block max-h-[40vh] min-h-[148px] w-full resize-none rounded-[3px] bg-transparent px-[15px] py-3 text-[15px] leading-6 text-ink outline-none! [field-sizing:content] placeholder:text-muted pointer-coarse:text-[16px]"
        />
      </div>
      <p id={hintId} className="m-0 mx-4 mt-2 text-[13px] leading-5 text-muted">
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
          <section aria-labelledby={headingId}>
            <SectionHeader id={headingId} title="Разбор" aside={<span className="meta">{`${selected} из ${rows.length}`}</span>} />
            <ul className="m-0 mx-4 flex list-none flex-col p-0">
              {rows.map((row) => (
                <li key={row.key}>
                  <ListRowItem row={row} folders={folders} show={show} onToggle={() => onToggle(row.key)} />
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
  onToggle,
}: {
  row: ListRow;
  folders: readonly Folder[];
  show: { slang: boolean; examples: boolean };
  onToggle: () => void;
}) {
  const invalid = row.status === "invalid";
  const tag = invalid ? (row.problem === "no_french" ? "нет французского" : "нет перевода") : row.status === "ok" ? null : TAGS[row.status];
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={row.checked}
      disabled={invalid}
      onClick={onToggle}
      className={cx(
        "flex min-h-14 w-full items-center gap-3 border-b border-rule bg-transparent py-2 text-left text-ink active:bg-surface-2 disabled:active:bg-transparent",
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
        {show.examples && row.enrich?.example_fr && (
          <span lang="fr" className="truncate font-serif text-[14px] leading-5 text-muted italic">
            {row.enrich.example_fr}
          </span>
        )}
      </span>
      {row.enrich && !tag && (
        <span className="flex max-w-[40%] shrink-0 flex-col items-end gap-1">
          {show.slang && <SlangMeter level={row.enrich.slang_level} verlan={row.enrich.verlan} size="sm" />}
          {row.autoFolder && (
            <span className="max-w-full truncate font-mono text-[11px] leading-4 tracking-[.06em] text-muted">
              {row.autoFolder.kind === "new" ? `+ ${row.autoFolder.name}` : choiceName(row.autoFolder, folders)}
            </span>
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
