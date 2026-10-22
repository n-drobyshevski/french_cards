"use client";

import {
  memo,
  useRef,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type UIEvent,
} from "react";
import { useIsDragged } from "@/components/shell/dnd";
import { cx } from "@/components/ui/cx";
import { Icon } from "@/components/ui/Icons";
import { SKELETON_FADE, SKELETON_WIDTHS, SkeletonBar } from "@/components/ui/Skeleton";
import { SlangMeter } from "@/components/ui/SlangMeter";
import { SLANG_LABELS } from "@/lib/types";
import { CheckMark } from "./Checkbox";
import { CURRENT_ROW_BG } from "./dark";
import { STALE_DIM } from "./first-paint";
import { posAbbr } from "./format";
import { useLeavingList } from "./leaving";
import type { MenuAnchor } from "./Menu";
import type { Columns, SortKey, SortState } from "./table";
import type { LibraryWord } from "./useLibraryWords";
import { rowLabel } from "./WordList";

// The desktop word table (DESKTOP-SPEC §3 table tokens, §4 library a11y model): one tab stop with
// a roving row, role="grid" + aria-multiselectable, aria-selected = selection, aria-current = the
// cursor. Rows are draggable onto sidebar themes; fine pointers get hover actions, coarse ones a
// persistent ⋯ and long-press. Dragged rows dim to .5; rows that leave the table after a move, a
// drop or a delete close (height → 0, --dur-move) instead of vanishing, and open again on undo (D8).

export interface RowHandlers {
  click: (id: string, event: MouseEvent<HTMLElement>) => void;
  toggle: (id: string, event: MouseEvent<HTMLElement>) => void;
  open: (id: string) => void;
  menu: (id: string, anchor: MenuAnchor) => void;
  move: (id: string, anchor: HTMLElement) => void;
  remove: (id: string) => void;
  dragIds: (id: string) => string[];
  dragStart: (ids: string[], event: DragEvent<HTMLElement>) => void;
}

export interface WordTableProps {
  rows: readonly LibraryWord[];
  columns: Columns;
  sort: SortState;
  onSort: (key: SortKey) => void;
  cursor: string | null;
  selection: ReadonlySet<string>;
  coarse: boolean;
  /** Mouse/trackpad: hover actions and dragging. */
  fine: boolean;
  label: string;
  loading: boolean;
  /** The search lags behind the typed query: the rows stay, dimmed to .5 (L5). */
  stale?: boolean;
  /** Timing override for the delayed skeleton rows (the hand-over from DeskPlaceholder). */
  skeletonStyle?: CSSProperties;
  handlers: RefObject<RowHandlers>;
  onSelectAll: (select: boolean) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  gridRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Shown under the header when there are no rows (or after the rows). */
  empty?: ReactNode;
  footer?: ReactNode;
}

const HEADS: { key: SortKey; label: string; col: "fr" | "ru" | "level" | "theme" | "due" }[] = [
  { key: "fr", label: "Слово", col: "fr" },
  { key: "ru", label: "Перевод", col: "ru" },
  { key: "level", label: "Уровень", col: "level" },
  { key: "theme", label: "Тема", col: "theme" },
  { key: "due", label: "Показ", col: "due" },
];

export function WordTable({
  rows,
  columns,
  sort,
  onSort,
  cursor,
  selection,
  coarse,
  fine,
  label,
  loading,
  stale = false,
  skeletonStyle,
  handlers,
  onSelectAll,
  onKeyDown,
  onScroll,
  gridRef,
  scrollRef,
  empty,
  footer,
}: WordTableProps) {
  const selectedCount = rows.reduce((n, r) => n + (selection.has(r.word.id) ? 1 : 0), 0);
  const all = rows.length > 0 && selectedCount === rows.length;
  const some = selectedCount > 0 && !all;
  const selectionActive = selection.size > 0;
  const tabRow = cursor && rows.some((r) => r.word.id === cursor) ? cursor : (rows[0]?.word.id ?? null);
  const ghost = useRef<HTMLDivElement>(null);
  const entries = useLeavingList(rows, (r) => r.word.id);
  let rowIndex = 0;

  return (
    <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div
        ref={gridRef}
        role="grid"
        aria-label={label}
        aria-multiselectable="true"
        aria-rowcount={rows.length + 1}
        aria-busy={loading || undefined}
        onKeyDown={onKeyDown}
        className={cx("flex flex-col", selectionActive && "pb-[84px]")}
      >
        <div role="rowgroup" className="sticky top-0 z-[2] bg-paper">
          <div
            role="row"
            aria-rowindex={1}
            className="grid h-8 items-center border-b border-ink px-6"
            style={{ gridTemplateColumns: columns.template }}
          >
            <div role="columnheader" className="-ml-6 flex h-full items-center pl-6">
              <button
                type="button"
                role="checkbox"
                aria-checked={all ? true : some ? "mixed" : false}
                aria-label="Выбрать все"
                tabIndex={-1}
                disabled={rows.length === 0}
                onClick={() => onSelectAll(!all)}
                className={cx("flex h-full items-center bg-transparent p-0", coarse ? "w-16 -ml-6 pl-6" : "w-8")}
              >
                <CheckMark checked={all} indeterminate={some} />
              </button>
            </div>
            {HEADS.filter((h) => h.col !== "theme" || columns.theme).map((h) => {
              const active = sort.key === h.key;
              return (
                <div
                  key={h.key}
                  role="columnheader"
                  aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={cx("flex min-w-0 px-2", h.col === "due" && "justify-end")}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onSort(h.key)}
                    className={cx(
                      "inline-flex h-8 items-center gap-1 bg-transparent p-0 font-mono text-[11px] tracking-[.06em] uppercase hoverable:text-ink",
                      active ? "text-ink" : "text-muted",
                    )}
                  >
                    {h.label}
                    {active && <span className="text-[10px]">{sort.dir === 1 ? "▲" : "▼"}</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div role="rowgroup" className={cx(STALE_DIM, stale && "opacity-50")}>
          {loading ? (
            // Rows are reserved; skeleton rows only if the read is still pending at 300 ms (§3.1, D4).
            <div data-table-skeleton="" aria-hidden="true" className="delayed-in" style={skeletonStyle}>
              {Array.from({ length: 8 }, (_, i) => {
                const [a, b] = SKELETON_WIDTHS[i % SKELETON_WIDTHS.length];
                return (
                  <div
                    key={i}
                    className={cx("grid items-center border-b border-rule px-6", coarse ? "h-12" : "h-10")}
                    style={{ gridTemplateColumns: columns.template, opacity: SKELETON_FADE[Math.min(i, SKELETON_FADE.length - 1)] }}
                  >
                    <span />
                    <span className="px-2">
                      <SkeletonBar width={a + 24} />
                    </span>
                    <span className="px-2">
                      <SkeletonBar width={b + 16} height={6} />
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            entries.map(({ id, item, leaving, returning }) => (
                <Row
                  key={id}
                  item={item}
                  index={leaving ? -1 : rowIndex++}
                  leaving={leaving}
                  returning={returning}
                  columns={columns}
                  current={item.word.id === cursor}
                  tabbable={item.word.id === tabRow}
                  selected={selection.has(item.word.id)}
                  selectionActive={selectionActive}
                  coarse={coarse}
                  fine={fine}
                  handlers={handlers}
                  ghost={ghost}
                />
              ))
          )}
        </div>
      </div>
      <div className={cx(STALE_DIM, stale && "opacity-50")}>{empty}</div>
      {footer}
      {/* Drag ghost (DESKTOP-SPEC §3): white, 1px ink, the word + «+N». */}
      <div aria-hidden="true" className="pointer-events-none fixed -top-[200px] left-0">
        <div
          ref={ghost}
          className="inline-flex h-8 items-center gap-2 rounded-[4px] border border-ink bg-surface px-2.5 text-ink opacity-95"
        >
          <span data-ghost-word="" lang="fr" className="font-serif text-[16px] font-medium" />
          <span data-ghost-more="" className="font-mono text-[11px]" />
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  item: LibraryWord;
  /** Position among the live rows; -1 while `leaving`. */
  index: number;
  /** Gone from the table: closing, out of the grid's rows and focus. */
  leaving: boolean;
  /** Back after an undo: opens from 0. */
  returning: boolean;
  columns: Columns;
  current: boolean;
  tabbable: boolean;
  selected: boolean;
  selectionActive: boolean;
  coarse: boolean;
  fine: boolean;
  handlers: RefObject<RowHandlers>;
  ghost: RefObject<HTMLDivElement | null>;
}

const LONG_PRESS_MS = 500;

const Row = memo(function Row({ item, index, leaving, returning, columns, current, tabbable, selected, selectionActive, coarse, fine, handlers, ghost }: RowProps) {
  const dragged = useIsDragged(item.word.id);
  const { word, schedule, folder } = item;
  const id = word.id;
  const abbr = posAbbr(word);
  const pos = [abbr, word.verlan ? "verl." : null].filter(Boolean).join(" · ");
  const press = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  const showBox = coarse || selected || selectionActive;
  const hoverActions = fine && !coarse && !selectionActive;
  const difficult = schedule.status === "difficult";

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    cancelPress();
    const target = e.currentTarget;
    press.current = {
      x: e.clientX,
      y: e.clientY,
      fired: false,
      timer: window.setTimeout(() => {
        if (!press.current) return;
        press.current.fired = true;
        handlers.current.menu(id, { element: target, align: "end" });
      }, LONG_PRESS_MS),
    };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) cancelPress();
  };

  const dueText = (
    <span className={cx("flex min-w-0 items-baseline justify-end gap-1.5 whitespace-nowrap", hoverActions && "pointer-fine:group-hover/row:hidden")}>
      {columns.dueCompact ? (
        <span title={difficult ? "трудное" : undefined} className={cx("font-mono text-[12px] tabular-nums", schedule.tone === "later" ? "text-muted" : "font-medium text-ink")}>
          {schedule.dueLabel.replace(/^через /, "")}
        </span>
      ) : (
        <>
          <span className={cx("text-[13px] tabular-nums", schedule.tone === "later" ? "text-muted" : "font-medium text-ink")}>{schedule.dueLabel}</span>
          {difficult && <span className="font-serif text-[13px] text-muted italic">трудн.</span>}
        </>
      )}
    </span>
  );

  return (
    <div
      role="row"
      data-row-id={leaving ? undefined : id}
      aria-hidden={leaving || undefined}
      inert={leaving}
      aria-rowindex={leaving ? undefined : index + 2}
      aria-selected={selected}
      aria-current={current ? "true" : undefined}
      aria-label={rowLabel(item, !!folder || columns.theme)}
      tabIndex={tabbable ? 0 : -1}
      draggable={fine}
      onClick={(e) => {
        if (press.current?.fired) {
          press.current = null;
          return;
        }
        handlers.current.click(id, e);
      }}
      onDoubleClick={() => handlers.current.open(id)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (press.current?.fired) return;
        cancelPress();
        handlers.current.menu(id, { x: e.clientX, y: e.clientY, container: e.currentTarget });
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onMouseDown={(e) => {
        // Shift-click selects a range, not text.
        if (e.shiftKey) e.preventDefault();
      }}
      onDragStart={(e) => {
        const ids = handlers.current.dragIds(id);
        const g = ghost.current;
        if (g) {
          g.querySelector("[data-ghost-word]")!.textContent = word.fr;
          g.querySelector("[data-ghost-more]")!.textContent = ids.length > 1 ? `+${ids.length - 1}` : "";
          e.dataTransfer.setDragImage(g, -12, -12);
        }
        handlers.current.dragStart(ids, e);
      }}
      style={{ gridTemplateColumns: columns.template }}
      className={cx(
        "group/row relative grid shrink-0 cursor-default items-center border-b border-rule px-6 outline-none select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
        leaving || returning ? "overflow-hidden" : "[contain-intrinsic-size:auto_40px] [content-visibility:auto]",
        leaving
          ? "h-0 border-b-0 opacity-0 [transition:height_var(--dur-move)_var(--ease-exit),border-bottom-width_var(--dur-move)_var(--ease-exit),opacity_var(--dur-quick)_var(--ease-exit)]"
          : cx(
              coarse ? "h-12" : "h-10",
              dragged && "opacity-50",
              returning
                ? "[transition:height_var(--dur-move)_var(--ease-standard),opacity_var(--dur-enter)_var(--ease-enter)] starting:h-0 starting:opacity-0"
                : "transition-opacity duration-(--dur-quick) ease-standard",
            ),
        current ? CURRENT_ROW_BG : selected ? "bg-selected" : "hoverable:bg-hover",
      )}
    >
      {current && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-ink" />}
      <div
        role="gridcell"
        onClick={(e) => {
          e.stopPropagation();
          handlers.current.toggle(id, e);
        }}
        className={cx("-ml-6 flex h-full items-center pl-6", coarse && "w-16")}
      >
        <CheckMark checked={selected} className={cx(!showBox && "invisible pointer-fine:group-hover/row:visible")} />
      </div>
      <div role="gridcell" className="flex min-w-0 items-baseline gap-1.5 px-2">
        <span lang="fr" className="min-w-0 truncate font-serif text-[18px] leading-6 font-medium">
          {word.fr}
        </span>
        {pos && (
          <span lang="fr" className="abbr shrink-0 text-[14px] leading-5 whitespace-nowrap">
            {pos}
          </span>
        )}
      </div>
      <div role="gridcell" className="min-w-0 truncate px-2 text-[14px] leading-5 text-muted">
        {word.ru}
      </div>
      <div role="gridcell" className="flex min-w-0 px-2">
        {columns.level === "meter" ? (
          <SlangMeter level={word.slang_level} verlan={false} />
        ) : (
          <span lang={word.slang_level ? "fr" : undefined} className="abbr text-[14px]">
            {SLANG_LABELS[word.slang_level]}
          </span>
        )}
      </div>
      {columns.theme && (
        <div role="gridcell" className="min-w-0 truncate px-2 text-[13px] text-muted">
          {folder?.name ?? "Входящие"}
        </div>
      )}
      <div role="gridcell" className="flex min-w-0 items-center justify-end gap-2 px-2">
        {dueText}
        {hoverActions && (
          <span className="hidden items-center gap-2 pointer-fine:group-hover/row:flex">
            <RowIcon icon="move" label="Переместить в тему" shortcut="M" onClick={(e) => handlers.current.move(id, e.currentTarget)} />
            <RowIcon icon="trash" label="Удалить слово" onClick={() => handlers.current.remove(id)} />
          </span>
        )}
        {coarse && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Действия со словом"
            aria-haspopup="menu"
            onClick={(e) => {
              e.stopPropagation();
              handlers.current.menu(id, { element: e.currentTarget, align: "end" });
            }}
            className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-[4px] bg-transparent text-ink active:bg-hover aria-expanded:bg-hover"
          >
            <Icon name="more" size={18} />
          </button>
        )}
      </div>
    </div>
  );
});

function RowIcon({ icon, label, shortcut, onClick }: { icon: "move" | "trash"; label: string; shortcut?: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className="inline-flex size-7 items-center justify-center rounded-[4px] bg-transparent text-ink hoverable:bg-hover-surface"
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
