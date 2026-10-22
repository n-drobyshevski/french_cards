"use client";

import { cx } from "@/components/ui/cx";
import { SQUARE_RING } from "./dark";
import type { Folder } from "@/lib/types";
import { Menu, MenuItem, MenuSeparator, type MenuAnchor, type MenuCloseReason } from "./Menu";

/** Picker value for «Входящие». */
export const INBOX_KEY = "inbox";

/** 8×8 theme square (dashed for «Входящие»); dark mode adds a faint ring (DESKTOP-SPEC §5 #25). */
export function ThemeSquare({ color, className }: { color?: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "size-2 shrink-0 rounded-[1px]",
        color ? SQUARE_RING : "border border-dashed border-muted",
        className,
      )}
      style={color ? { background: color } : undefined}
    />
  );
}

export interface MoveMenuProps {
  open: boolean;
  anchor: MenuAnchor | null;
  onClose: (reason: MenuCloseReason) => void;
  folders: readonly Folder[];
  /** Key of the words' current place (checked); omit for a mixed selection. */
  currentKey?: string | null;
  /** Folder id or INBOX_KEY. */
  onPick: (key: string) => void;
  /** «+ Новая тема…»; omit to hide it. */
  onNewTheme?: () => void;
  /** Word counts per key, shown right (mono). */
  counts?: ReadonlyMap<string, number>;
  label?: string;
  returnFocus?: HTMLElement | null;
}

/**
 * «Переместить в тему…» (`M`): «Входящие» and the themes in their order, type-ahead by name,
 * then «+ Новая тема…».
 */
export function MoveMenu({ open, anchor, onClose, folders, currentKey, onPick, onNewTheme, counts, label = "Переместить в тему", returnFocus }: MoveMenuProps) {
  const options = [{ key: INBOX_KEY, name: "Входящие", color: null as string | null }, ...folders.map((f) => ({ key: f.id, name: f.name, color: f.color }))];
  return (
    <Menu open={open} anchor={anchor} onClose={onClose} label={label} width={240} returnFocus={returnFocus}>
      {options.map((o) => (
        <MenuItem
          key={o.key}
          checked={currentKey === undefined ? undefined : o.key === currentKey}
          onSelect={() => onPick(o.key)}
          lead={<ThemeSquare color={o.color} />}
          trail={
            counts?.has(o.key) ? <span className="font-mono text-[12px] text-muted tabular-nums">{counts.get(o.key)}</span> : undefined
          }
          className="font-serif text-[16px]"
        >
          {o.name}
        </MenuItem>
      ))}
      {onNewTheme && (
        <>
          <MenuSeparator />
          <MenuItem onSelect={onNewTheme} icon="plus">
            Новая тема…
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
