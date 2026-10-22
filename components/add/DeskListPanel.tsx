"use client";

import { useId, type ReactNode } from "react";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { cx } from "@/components/ui/cx";
import type { Folder } from "@/lib/types";
import { choiceName } from "./folder-choice";
import { CheckBox, DeskFrame, DeskSection, FIELD_LABEL, HIDDEN_CONTROL_FOCUS, HintLine, KeyButton, ThemeSelect, type Hint } from "./desk-parts";
import type { ListPanelProps, ListRow } from "./ListPanel";
import { cardNumber, nWords } from "./match";

export interface DeskListPanelProps extends ListPanelProps {
  onSave: () => void;
  saving: boolean;
  saveError: string | null;
  status?: ReactNode;
}

const LIST_HINTS: readonly Hint[] = [
  [["Enter"], "новая строка"],
  [["Escape"], "закрыть"],
];

const TAGS: Record<Exclude<ListRow["status"], "ok">, string> = {
  duplicate: "Уже есть",
  repeat: "Повтор",
  invalid: "",
};

/** D-Add-List: one pair per line, «Тема», and the «Разбор» table of what will be added. */
export function DeskListPanel({
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
  onSave,
  saving,
  saveError,
  status,
}: DeskListPanelProps) {
  const themeId = useId();
  const headingId = useId();
  const selected = rows.filter((r) => r.checked).length;

  const footer = (
    <>
      {status ??
        (saveError ? (
          <p role="alert" className="m-0 min-w-0 flex-1 truncate text-[13px] leading-5 text-again">
            {saveError}
          </p>
        ) : (
          <HintLine hints={LIST_HINTS} />
        ))}
      <KeyButton keys="Mod+Enter" busy={saving} inactive={selected === 0} title={selected === 0 ? "Отметьте хотя бы одно слово" : undefined} onClick={onSave}>
        {selected > 0 ? `Добавить ${nWords(selected)}` : "Добавить"}
      </KeyButton>
    </>
  );

  return (
    <DeskFrame footer={footer} tall>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => onText(e.target.value)}
        rows={6}
        aria-label="Слова, по одному на строку: слово — перевод"
        placeholder={"la thune — бабки, деньги\nkiffer — тащиться\nchelou — стрёмный"}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        className="block h-[164px] w-full resize-none rounded-[4px] border border-boundary bg-surface px-[11px] py-[9px] text-[15px] leading-6 text-ink outline-none! placeholder:text-muted focus:border-ink focus:shadow-[inset_0_0_0_1px_var(--ink)]"
      />

      <span id={themeId} className={cx(FIELD_LABEL, "mt-4")}>
        Тема
      </span>
      <ThemeSelect
        value={folder}
        folders={folders}
        labelledBy={themeId}
        onChange={onFolder}
        auto={auto && { label: "По темам автоматически", ...auto }}
      />

      {rows.length > 0 && (
        <section aria-labelledby={headingId} className="mt-6">
          <DeskSection id={headingId} title="Разбор" aside={<span className="font-mono">{`${selected} из ${rows.length}`}</span>} />
          <ul className="m-0 list-none p-0">
            {rows.map((row, i) => (
              <li key={row.key}>
                <ParseRow row={row} folders={folders} showSlang={show.slang} last={i === rows.length - 1} onToggle={() => onToggle(row.key)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </DeskFrame>
  );
}

function ParseRow({
  row,
  folders,
  showSlang,
  last,
  onToggle,
}: {
  row: ListRow;
  folders: readonly Folder[];
  showSlang: boolean;
  last: boolean;
  onToggle: () => void;
}) {
  const invalid = row.status === "invalid";
  const tag = invalid ? (row.problem === "no_french" ? "Нет французского" : "Нет перевода") : row.status === "ok" ? null : TAGS[row.status];
  const existing = row.status === "duplicate" ? row.existing : null;
  return (
    <label
      className={cx(
        "relative grid h-10 grid-cols-[32px_168px_minmax(0,1fr)_auto] items-start gap-x-2",
        !last && "border-b border-rule",
        invalid ? "cursor-default" : "cursor-pointer hoverable:bg-hover-surface",
        HIDDEN_CONTROL_FOCUS,
      )}
    >
      <input
        type="checkbox"
        checked={row.checked}
        disabled={invalid}
        onChange={onToggle}
        aria-label={`${row.fr || "—"} — ${row.ru || "—"}${tag ? `, ${tag.toLowerCase()}` : ""}`}
        className="absolute top-0 left-0 m-0 size-px opacity-0"
      />
      <span className="flex justify-center self-center">
        <CheckBox checked={row.checked} disabled={invalid} />
      </span>
      <span
        lang="fr"
        className={cx(
          "truncate pt-2 font-serif text-[17px] leading-6 font-medium",
          invalid ? "text-boundary" : "text-ink",
          !row.fr && "italic",
        )}
      >
        {row.fr || "—"}
      </span>
      <span className="truncate pt-2.5 text-[14px] leading-5 text-muted">
        {row.ru}
        {existing && (
          <span className="text-[12px]">
            {" "}
            · {existing.folderName ?? "Входящие"}, <span className="font-mono text-[11px] tabular-nums">{cardNumber(existing.ordinal)}</span>
          </span>
        )}
      </span>
      <span className="flex items-center gap-3 self-center justify-self-end">
        {tag ? (
          <span className="inline-flex h-5 items-center rounded-[4px] border border-rule px-1.5 font-mono text-[11px] leading-none tracking-[.06em] whitespace-nowrap text-muted uppercase">
            {tag}
          </span>
        ) : (
          <>
            {row.autoFolder && (
              <span className="max-w-40 truncate font-mono text-[11px] tracking-[.06em] text-muted">
                {row.autoFolder.kind === "new" ? `+ ${row.autoFolder.name}` : choiceName(row.autoFolder, folders)}
              </span>
            )}
            {showSlang && row.enrich && <SlangMeter level={row.enrich.slang_level} verlan={row.enrich.verlan} size="sm" />}
          </>
        )}
      </span>
    </label>
  );
}
