"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import type { ThemeOption } from "./FolderPicker";

export interface ThemeMenuProps {
  /** The button that opened the menu: it is positioned against it and gets focus back on close. */
  anchor: HTMLElement;
  label: string;
  options: readonly ThemeOption[];
  selectedKey: string | null;
  onPick: (key: string) => void;
  onClose: () => void;
}

const GAP = 4;
const MARGIN = 8;
const MAX_HEIGHT = 360;

/**
 * Desktop theme picker (DESKTOP-SPEC §3 menu token): white, 1px ink border, radius 6, 32px items
 * in folder order with the colour square and a check on the current theme. Opens under its
 * button (above when there is no room), arrows / Home / End / first letter move, ↵ or Пробел
 * picks, Esc closes and returns focus. Any scroll outside it, a resize or a click elsewhere closes it.
 */
export function ThemeMenu({ anchor, label, options, selectedKey, onPick, onClose }: ThemeMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    const left = Math.max(MARGIN, Math.min(r.left, window.innerWidth - 240 - MARGIN));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measured placement before paint.
    setPos(
      below >= Math.min(MAX_HEIGHT, 200) || below >= above
        ? { left, top: r.bottom + GAP, maxHeight: Math.min(MAX_HEIGHT, below) }
        : { left, bottom: window.innerHeight - r.top + GAP, maxHeight: Math.min(MAX_HEIGHT, above) },
    );
  }, [anchor]);

  // Focus the current theme (or the first item) once placed.
  useEffect(() => {
    if (!pos) return;
    const items = menu.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]");
    const current = menu.current?.querySelector<HTMLElement>("[aria-checked=true]");
    (current ?? items?.[0])?.focus();
  }, [pos]);

  useEffect(() => {
    const close = (returnFocus: boolean) => {
      closeRef.current();
      if (returnFocus) anchor.focus();
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (menu.current?.contains(t) || anchor.contains(t))) return;
      close(false);
    };
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && menu.current?.contains(e.target)) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [anchor]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const move = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    // Every key stays inside the menu: page shortcuts never see it.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      anchor.focus();
    } else if (e.key === "Tab") {
      e.preventDefault();
      onClose();
      anchor.focus();
    } else if (e.key === "ArrowDown") move(index + 1);
    else if (e.key === "ArrowUp") move(index - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(items.length - 1);
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const ch = e.key.toLocaleLowerCase("ru");
      const order = [...items.slice(index + 1), ...items.slice(0, index + 1)];
      const hit = order.find((el) => (el.dataset.label ?? "").replace(/^\+\s*/, "").toLocaleLowerCase("ru").startsWith(ch));
      if (hit) {
        e.preventDefault();
        hit.focus();
      }
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={pos ? { left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight } : { visibility: "hidden" }}
      className="fixed z-[55] flex min-w-[220px] flex-col overflow-y-auto overscroll-contain rounded-[6px] border border-ink bg-surface p-1 text-ink"
    >
      {options.map((o) => {
        const checked = o.key === selectedKey;
        return (
          <button
            key={o.key}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            data-label={o.label}
            tabIndex={-1}
            onClick={() => {
              onPick(o.key);
              onClose();
              anchor.focus();
            }}
            className="flex h-8 shrink-0 items-center gap-2.5 rounded-[4px] bg-transparent px-2 text-left text-[14px] leading-5 hoverable:bg-hover-surface focus-visible:bg-hover-surface focus-visible:outline-offset-[-2px]"
          >
            <span
              aria-hidden="true"
              className={cx("size-2 shrink-0 rounded-[1px]", o.dashed && "border border-dashed border-muted")}
              style={!o.dashed && o.color ? { background: o.color } : undefined}
            />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.caption && o.key !== "inbox" && <span className="shrink-0 text-[12px] text-muted">{o.caption}</span>}
            <span className="flex w-4 shrink-0 justify-end">{checked && <Icon name="check" size={14} strokeWidth={2} />}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
