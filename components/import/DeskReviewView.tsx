"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { isInteractiveTarget } from "@/components/review/keys";
import { blocksGlobalKeys, OPEN_LAYER_SELECTOR } from "@/components/shell/keys";
import { useShortcutsEnabled } from "@/components/shell/ShellContext";
import { bottomBarRef } from "@/components/ui/bottom-clearance";
import { Icon } from "@/components/ui/Icons";
import { FlatKey, Kbd } from "@/components/ui/Kbd";
import { cx } from "@/components/ui/cx";
import { useFormatKeys, useIsMac } from "@/lib/key-names";
import { getSettings } from "@/lib/settings";
import type { Folder } from "@/lib/types";
import { CheckMark, deskButton, DeskTag, ROW_GRID, WIDE_ONLY } from "./desk";
import { FrCell, LevelCell } from "./DeskProcessingView";
import { IMPORT_FOOTNOTE } from "./ProcessingView";
import { DeskRowEditor } from "./DeskRowEditor";
import { themeOptions } from "./FolderPicker";
import { incompleteNotice, saveRowEdit, type ReviewViewProps } from "./ReviewView";
import { importReviewKeyAction } from "./review-keys";
import {
  allAddableChecked,
  applyFolderToChecked,
  canAdd,
  checkedRows,
  choiceFromKey,
  choiceKey,
  choiceName,
  commonChoice,
  setAllChecked,
  updateRow,
  wordsRu,
  type ImportRow,
} from "./rows";
import { ReviewShotPane } from "./ShotPane";
import { AnkiReviewPane } from "./AnkiViews";
import { ThemeMenu } from "./ThemeMenu";

type MenuTarget = { key: string | null; anchor: HTMLElement } | null;

const ROW_PAD = "px-6 xl:px-8";

interface RowProps {
  row: ImportRow;
  folders: readonly Folder[];
  current: boolean;
  menuOpen: boolean;
  onFocusRow: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onOpenMenu: (anchor: HTMLElement) => void;
}

/** One extracted word as a 52px table row (76 with the amber «Перевод под вопросом» line). */
function DeskRow({ row, folders, current, menuOpen, onFocusRow, onToggle, onEdit, onOpenMenu }: RowProps) {
  const dup = row.duplicate;
  const addable = canAdd(row);
  const warn = row.warn && !dup;
  const themeName = choiceName(row.folder, folders);
  const existingFolder = dup ? (folders.find((f) => f.id === dup.folder_id)?.name ?? "Входящие") : null;
  const ru = row.ru.trim();

  return (
    <li
      data-row-key={row.key}
      tabIndex={-1}
      aria-current={current || undefined}
      onMouseDown={onFocusRow}
      className={cx(
        ROW_GRID,
        ROW_PAD,
        "relative items-start outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink",
        warn
          ? "my-px grid-rows-[42px_32px] rounded-[4px] border border-dashed border-warn-edge bg-warn-bg"
          : "h-[52px] grid-rows-[52px] border-b border-rule",
        !warn && (current ? "bg-surface" : "hoverable:bg-hover"),
      )}
    >
      {current && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ink" />}
      <button
        type="button"
        role="checkbox"
        aria-checked={row.checked}
        aria-disabled={!addable || undefined}
        aria-label={dup ? `«${row.fr}» уже есть` : `Добавить «${row.fr || "без французского"}»`}
        onClick={() => {
          if (addable) onToggle();
        }}
        className={cx(
          "row-span-full flex w-8 justify-center self-stretch bg-transparent p-0 focus-visible:outline-offset-[-2px]",
          warn ? "items-start pt-[17px]" : "items-center",
          addable ? "cursor-pointer" : "cursor-default",
        )}
      >
        <CheckMark checked={row.checked} disabled={!addable} />
      </button>

      <button
        type="button"
        onClick={onEdit}
        title="Изменить (↵)"
        className={cx(
          "col-span-2 grid min-w-0 grid-cols-subgrid items-start self-stretch bg-transparent p-0 text-left focus-visible:outline-offset-[-2px]",
          warn ? "pt-[14px]" : "pt-[15px]",
        )}
      >
        <span className="min-w-0 px-2">
          <FrCell fr={row.fr} verlan={row.verlan} muted={!!dup} />
        </span>
        <span className="flex min-w-0 items-center gap-2 overflow-hidden px-2 pt-px whitespace-nowrap">
          <span
            className={cx(
              "min-w-0 truncate text-[14px] leading-5",
              !ru ? "text-again" : "text-muted",
              row.ruGuess && ru && "italic",
            )}
          >
            {ru || "нет перевода"}
          </span>
          {row.ruGuess && ru && !dup && <DeskTag title="Перевода не было — подобран автоматически">ДОГАДКА</DeskTag>}
          {/* The example the row will be saved with, as on phones; the row keeps its height. */}
          {row.exampleFr && !dup && (
            <span lang="fr" className="min-w-0 truncate font-serif text-[14px] leading-5 text-muted italic">
              {row.exampleFr}
            </span>
          )}
          {dup && <DeskTag>УЖЕ ЕСТЬ</DeskTag>}
        </span>
        <span className="sr-only">, изменить</span>
      </button>

      <span className={cx("flex pl-2", warn ? "pt-[17px]" : "pt-[18px]")}>
        <LevelCell level={row.slang_level} muted={!!dup} />
      </span>

      <span className={cx("flex min-w-0 px-2", warn ? "pt-2.5" : "pt-[11px]")}>
        {dup ? (
          <span className="truncate pt-1.5 text-[13px] leading-5 text-muted">{existingFolder}</span>
        ) : (
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Тема для «${row.fr}»: ${themeName}. Изменить`}
            disabled={!addable}
            onClick={(e) => onOpenMenu(e.currentTarget)}
            className="-ml-1.5 inline-flex h-8 max-w-full min-w-0 items-center gap-1 rounded-[4px] bg-transparent px-1.5 text-[13px] leading-5 font-medium whitespace-nowrap text-ink hoverable:bg-hover disabled:text-muted focus-visible:outline-offset-[-2px]"
          >
            <span className="truncate">{themeName}</span>
            <Icon name="chevron" size={14} strokeWidth={1.75} className="shrink-0 text-muted" />
          </button>
        )}
      </span>

      {warn && (
        <span className="col-start-2 col-end-[-1] row-start-2 flex h-8 min-w-0 items-center gap-2 px-2 text-[13px] leading-5 text-warn">
          <Icon name="alert" size={14} className="shrink-0" />
          <span className="min-w-0 truncate">{row.issue ?? "Перевод под вопросом"}</span>
          <button
            type="button"
            onClick={onEdit}
            className="h-8 shrink-0 bg-transparent px-1 text-[13px] font-medium text-ink underline decoration-1 underline-offset-[3px] focus-visible:outline-offset-[-2px]"
          >
            Проверить
          </button>
        </span>
      )}
    </li>
  );
}

/**
 * Desktop import review (D-Import-Review): the screenshot column beside the extracted rows as a
 * table — checkboxes, ДОГАДКА / УЖЕ ЕСТЬ, the amber row, inline edit, a theme menu per row — and the
 * bottom bar «Тема для всех ▾» · «Добавить N слов ⌘↵». Keys: J/K, X/Пробел, ↵, ⌘A, ⌘↵.
 */
export function DeskReviewView({
  rows,
  onRowsChange,
  folders,
  proposals,
  thumbs,
  tiles,
  incomplete,
  saving,
  onAdd,
  onRestart,
  onPickOther,
  deck,
}: ReviewViewProps & { onPickOther: () => void }) {
  const keys = useFormatKeys();
  const mac = useIsMac();
  const shortcuts = useShortcutsEnabled();
  const hints = useLiveQuery(async () => (await getSettings()).key_hints, [], true);
  const [cursor, setCursor] = useState<string | null>(() => rows[0]?.key ?? null);
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuTarget>(null);
  const list = useRef<HTMLUListElement>(null);
  const refocus = useRef<string | null>(null);

  const selected = checkedRows(rows).length;
  const allChecked = allAddableChecked(rows);
  const anyAddable = rows.some(canAdd);
  const someChecked = selected > 0 && !allChecked;
  const notice = incompleteNotice(incomplete, !!deck);
  const options = themeOptions(folders, proposals);

  const focusRow = useCallback((key: string) => {
    const el = list.current?.querySelector<HTMLElement>(`[data-row-key="${key}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  // After an inline edit closes, focus goes back to its row.
  useEffect(() => {
    if (editing !== null || !refocus.current) return;
    focusRow(refocus.current);
    refocus.current = null;
  }, [editing, focusRow]);

  const toggle = useCallback(
    (key: string) => onRowsChange((rs) => rs.map((r) => (r.key === key && canAdd(r) ? { ...r, checked: !r.checked } : r))),
    [onRowsChange],
  );
  const toggleAll = useCallback(() => onRowsChange((rs) => setAllChecked(rs, !allAddableChecked(rs))), [onRowsChange]);
  const startEdit = (key: string) => {
    setCursor(key);
    setMenu(null);
    setEditing(key);
  };
  const endEdit = (key: string) => {
    refocus.current = key;
    setEditing(null);
  };

  // Page keys: J/K, X/Пробел, ↵, ⌘A, ⌘↵ — never while typing, in a menu/dialog or the sidebar.
  const state = useRef({ rows, cursor, editing, selected, saving, shortcuts, mac, onAdd });
  useEffect(() => {
    state.current = { rows, cursor, editing, selected, saving, shortcuts, mac, onAdd };
  });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = state.current;
      if (e.defaultPrevented || s.editing !== null) return;
      if (blocksGlobalKeys(e.target) || document.querySelector(OPEN_LAYER_SELECTOR)) return;
      const target = e.target as Element | null;
      if (target?.closest?.("[data-shell-nav]")) return;
      const action = importReviewKeyAction(e, {
        shortcuts: s.shortcuts,
        mac: s.mac,
        interactive: target !== list.current && !target?.matches?.("[data-row-key]") && isInteractiveTarget(target),
      });
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      const index = s.rows.findIndex((r) => r.key === s.cursor);
      const current = index >= 0 ? s.rows[index] : undefined;
      switch (action) {
        case "next":
        case "prev": {
          const next = s.rows[Math.max(0, Math.min(s.rows.length - 1, index + (action === "next" ? 1 : -1)))];
          if (!next) return;
          setCursor(next.key);
          requestAnimationFrame(() => focusRow(next.key));
          return;
        }
        case "toggle":
          if (current) toggle(current.key);
          return;
        case "edit":
          if (current) startEdit(current.key);
          return;
        case "select-all":
          toggleAll();
          return;
        case "add":
          if (s.selected > 0 && !s.saving) s.onAdd();
          return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusRow, toggle, toggleAll]);

  const pickTheme = (key: string) => {
    const choice = choiceFromKey(key, folders, proposals);
    if (!choice || !menu) return;
    if (menu.key === null) onRowsChange((rs) => applyFolderToChecked(rs, choice));
    else {
      const rowKey = menu.key;
      onRowsChange((rs) => updateRow(rs, rowKey, { folder: choice, folderSource: "user" }));
    }
  };
  const menuRow = menu?.key ? rows.find((r) => r.key === menu.key) : undefined;
  const common = commonChoice(rows);
  const menuSelected = menu ? (menu.key === null ? (common ? choiceKey(common) : null) : menuRow ? choiceKey(menuRow.folder) : null) : null;

  const addLabel = saving ? "Добавляем…" : selected === 0 ? "Ничего не отмечено" : `Добавить ${wordsRu(selected)}`;

  return (
    <div data-wide="" className="flex h-dvh min-h-0 flex-none">
      {deck ? (
        <AnkiReviewPane title={deck.title} line={deck.line} onPickOther={onPickOther} />
      ) : (
        <ReviewShotPane thumbs={thumbs} tiles={tiles} onPickOther={onPickOther} />
      )}

      <div className="@container flex min-w-0 flex-1 flex-col">
        <main aria-labelledby="import-review-title" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-5 pb-6">
          <div className={cx(ROW_PAD, "flex h-9 items-center justify-between gap-4")}>
            <h1 id="import-review-title" className="m-0 truncate font-serif text-[28px] leading-9 font-medium tracking-[-0.015em] text-ink">
              Найдено {wordsRu(rows.length)}
            </h1>
            {anyAddable && (
              <button
                type="button"
                onClick={toggleAll}
                aria-keyshortcuts={mac ? "Meta+A" : "Control+A"}
                className={deskButton("tertiary", "-mr-2")}
              >
                <span>{allChecked ? "Снять все" : "Выбрать все"}</span>
                <Kbd aria-hidden="true">{keys("Mod+A")}</Kbd>
              </button>
            )}
          </div>

          {notice && (
            <div className={cx(ROW_PAD, "mt-3 flex items-center gap-3 text-[13px] leading-5 text-muted")}>
              <p className="m-0 min-w-0">{notice}</p>
              <button type="button" onClick={onRestart} className={deskButton("tertiary", "gap-1 underline decoration-1 underline-offset-[3px]")}>
                <Icon name="spark" size={14} strokeWidth={1.5} className="shrink-0" />
                {deck ? "Дополнить заново" : "Распознать заново"}
              </button>
            </div>
          )}

          <div className={cx(ROW_GRID, ROW_PAD, "sticky top-0 z-[1] mt-4 h-8 items-center border-b border-ink bg-paper")}>
            <button
              type="button"
              role="checkbox"
              aria-checked={allChecked ? true : someChecked ? "mixed" : false}
              aria-label="Отметить все строки"
              disabled={!anyAddable}
              onClick={toggleAll}
              className="flex h-8 w-8 items-center justify-center bg-transparent p-0 focus-visible:outline-offset-[-2px]"
            >
              <CheckMark checked={allChecked} mixed={someChecked} disabled={!anyAddable} />
            </button>
            <span aria-live="polite" className="truncate px-2 font-mono text-[11px] tracking-[.06em] text-muted uppercase tabular-nums">
              Отмечено {selected} из {rows.length}
            </span>
            <span aria-hidden="true" className="truncate px-2 font-mono text-[11px] tracking-[.06em] text-muted uppercase">
              Перевод
            </span>
            <span aria-hidden="true" className="truncate px-2 font-mono text-[11px] tracking-[.06em] text-muted uppercase">
              <span className="@max-[680px]:hidden">Уровень</span>
              <span className="@min-[680px]:hidden">Ур.</span>
            </span>
            <span aria-hidden="true" className="truncate px-2 font-mono text-[11px] tracking-[.06em] text-muted uppercase">
              Тема
            </span>
          </div>

          <ul ref={list} aria-label="Найденные слова" className="m-0 flex list-none flex-col p-0">
            {rows.map((row) =>
              editing === row.key ? (
                <DeskRowEditor
                  key={row.key}
                  row={row}
                  onCancel={() => endEdit(row.key)}
                  onSave={(patch) => {
                    endEdit(row.key);
                    void saveRowEdit(row, patch, onRowsChange);
                  }}
                />
              ) : (
                <DeskRow
                  key={row.key}
                  row={row}
                  folders={folders}
                  current={cursor === row.key}
                  menuOpen={menu?.key === row.key}
                  onFocusRow={() => setCursor(row.key)}
                  onToggle={() => {
                    setCursor(row.key);
                    toggle(row.key);
                  }}
                  onEdit={() => startEdit(row.key)}
                  onOpenMenu={(anchor) => {
                    setCursor(row.key);
                    setMenu({ key: row.key, anchor });
                  }}
                />
              ),
            )}
          </ul>
        </main>

        {shortcuts && hints && (
          <p
            aria-hidden="true"
            className={cx(ROW_PAD, "m-0 flex h-6 shrink-0 items-center gap-1.5 text-[12px] leading-4 text-muted [@media(max-height:759px)]:hidden")}
          >
            <FlatKey>J</FlatKey> <FlatKey>K</FlatKey> по строкам <span className="px-1">·</span> <FlatKey>X</FlatKey> отметить
            <span className="px-1">·</span> <FlatKey>{keys("Enter")}</FlatKey> исправить
          </p>
        )}

        <div ref={bottomBarRef} className={cx(ROW_PAD, "flex h-16 shrink-0 items-center gap-6 border-t border-rule bg-paper")}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menu?.key === null}
            disabled={selected === 0}
            aria-disabled={saving || undefined}
            title={selected === 0 ? "Отметьте хотя бы одно слово" : undefined}
            onClick={(e) => !saving && setMenu({ key: null, anchor: e.currentTarget })}
            className={deskButton("tertiary", cx("-ml-2", saving && "pointer-events-none"))}
          >
            Тема для всех
            <Icon name="chevron" size={14} strokeWidth={1.75} className="-ml-1 text-muted" />
          </button>
          <p className="m-0 min-w-0 flex-1 text-[12px] leading-4 text-muted">
            <span className={WIDE_ONLY}>{IMPORT_FOOTNOTE}</span>
          </p>
          <button
            type="button"
            aria-disabled={selected === 0 || undefined}
            aria-busy={saving || undefined}
            aria-keyshortcuts={mac ? "Meta+Enter" : "Control+Enter"}
            title={selected === 0 ? "Отметьте хотя бы одно слово" : undefined}
            onClick={() => {
              if (selected > 0 && !saving) onAdd();
            }}
            // Pending keeps full contrast (not the greyed «disabled» look); the label dims to 72 %.
            className={deskButton("primary", saving ? "pointer-events-none" : undefined)}
          >
            <span className={saving ? "opacity-72" : undefined}>{addLabel}</span>
            {selected > 0 && !saving && (
              <Kbd tone="ink" aria-hidden="true">
                {keys("Mod+Enter")}
              </Kbd>
            )}
          </button>
        </div>
      </div>

      {menu && (
        <ThemeMenu
          anchor={menu.anchor}
          label={menu.key === null ? "Тема для всех" : `Тема для «${menuRow?.fr ?? ""}»`}
          options={options}
          selectedKey={menuSelected}
          onPick={pickTheme}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
