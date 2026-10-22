"use client";

import { Icon } from "@/components/ui/Icons";
import { Sheet, SheetCloseButton, SheetTitle } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import type { NewFolderProposal } from "@/lib/ai/schemas";
import type { Folder } from "@/lib/types";
import { choiceFromKey, choiceKey, type FolderChoice } from "./rows";

export interface FolderPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Muted line under the title: the word, or «для 5 отмеченных слов». */
  subtitle?: string;
  subtitleLang?: string;
  folders: readonly Folder[];
  /** New themes proposed with the extracted rows. */
  proposals: readonly NewFolderProposal[];
  selected: FolderChoice | null;
  onPick: (choice: FolderChoice) => void;
}

interface Option {
  key: string;
  label: string;
  caption?: string;
  color?: string;
  dashed?: boolean;
}

/** Theme list: «Входящие», the library's themes, then the proposed new ones. Picking closes it. */
export function FolderPicker({
  open,
  onOpenChange,
  title,
  subtitle,
  subtitleLang,
  folders,
  proposals,
  selected,
  onPick,
}: FolderPickerProps) {
  const taken = new Set(folders.map((f) => f.name.trim().toLocaleLowerCase("ru")));
  const options: Option[] = [
    { key: "inbox", label: "Входящие", caption: "без темы", dashed: true },
    ...folders.map((f) => ({ key: `f:${f.id}`, label: f.name, color: f.color })),
    ...proposals
      .filter((p) => !taken.has(p.name.trim().toLocaleLowerCase("ru")))
      .map((p) => ({ key: `n:${p.slug}`, label: `+ ${p.name}`, caption: "новая тема", dashed: true })),
  ];
  const selectedKey = selected ? choiceKey(selected) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} description={subtitle}>
      <div className="flex h-11 shrink-0 items-center justify-between pr-1 pl-4">
        <SheetTitle className="min-w-0 truncate">{title}</SheetTitle>
        <SheetCloseButton />
      </div>
      {subtitle && (
        <p lang={subtitleLang} className={cx("m-0 truncate px-4 text-muted", subtitleLang === "fr" ? "font-serif text-[15px] leading-5 italic" : "text-[13px] leading-5")}>
          {subtitle}
        </p>
      )}
      <div role="radiogroup" aria-label={title} className="mt-3 flex flex-col px-4 pb-4">
        {options.map((o) => {
          const isSelected = o.key === selectedKey;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => {
                const choice = choiceFromKey(o.key, folders, proposals);
                if (choice) onPick(choice);
                onOpenChange(false);
              }}
              className="flex min-h-[52px] items-center gap-3 border-t border-rule bg-transparent py-2 text-left text-ink active:bg-surface-2"
            >
              <span
                aria-hidden="true"
                className={cx("h-5 w-[3px] shrink-0", o.dashed && "w-3 border border-dashed border-muted bg-transparent")}
                style={!o.dashed && o.color ? { background: o.color } : undefined}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-serif text-[17px] leading-6 font-medium">{o.label}</span>
                {o.caption && <span className="meta">{o.caption}</span>}
              </span>
              {isSelected && <Icon name="check" size={18} className="shrink-0" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
