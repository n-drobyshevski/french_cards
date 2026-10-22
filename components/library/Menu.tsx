"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "@/components/ui/cx";
import { Icon, type IconName } from "@/components/ui/Icons";
import { Kbd } from "@/components/ui/Kbd";
import { useFinePointer } from "@/lib/use-media";
import { CheckMark } from "./Checkbox";

// Desktop popover menu (DESKTOP-SPEC §3 «menu / popover»): white, 1px ink border, radius 6,
// padding 4, items 32px (44 on coarse pointers), key cap right, danger items in --again. Arrow
// keys, Home/End, type-ahead, Esc and Tab close it; focus returns where it was. role="menu" also
// blocks page shortcuts (OPEN_LAYER_SELECTOR) while it is open.

export type MenuAnchor =
  | { element: HTMLElement; align?: "start" | "end" }
  | { x: number; y: number; container?: HTMLElement | null };

export type MenuCloseReason = "escape" | "select" | "outside" | "tab";

export interface MenuProps {
  open: boolean;
  anchor: MenuAnchor | null;
  onClose: (reason: MenuCloseReason) => void;
  /** Accessible name of the menu. */
  label: string;
  /** Min width (default 220). */
  width?: number;
  /** Where focus goes after closing; default: what had focus when the menu opened. */
  returnFocus?: HTMLElement | null;
  /** Element id for aria-controls on the trigger. */
  id?: string;
  className?: string;
  children: ReactNode;
}

interface MenuCtx {
  close: (reason: MenuCloseReason) => void;
  coarse: boolean;
}
const MenuContext = createContext<MenuCtx | null>(null);

const ITEM_SELECTOR = "[role^='menuitem']:not([aria-disabled='true'])";
const GAP = 4;
const EDGE = 8;

function anchorRect(anchor: MenuAnchor): { left: number; right: number; top: number; bottom: number } {
  if ("element" in anchor) return anchor.element.getBoundingClientRect();
  return { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
}

/** A dialog (Radix) traps focus and treats clicks outside it as dismissal: render menus inside it. */
function portalContainer(anchor: MenuAnchor | null): HTMLElement | null {
  if (typeof document === "undefined" || !anchor) return null;
  const from = "element" in anchor ? anchor.element : anchor.container;
  return (from?.closest?.("[role='dialog']") as HTMLElement | null) ?? document.body;
}

export function Menu({ open, anchor, onClose, label, width = 220, returnFocus, id, className, children }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fine = useFinePointer();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const typed = useRef({ text: "", at: 0 });
  const onCloseRef = useRef(onClose);
  const anchorRef = useRef(anchor);
  useEffect(() => {
    onCloseRef.current = onClose;
    anchorRef.current = anchor;
  });
  const container = open ? portalContainer(anchor) : null;

  // Remember what had focus, and give it back on close (unless the user clicked elsewhere).
  const close = useCallback(
    (reason: MenuCloseReason) => {
      onCloseRef.current(reason);
      if (reason === "outside") return;
      const target = returnFocus ?? restoreTo.current;
      requestAnimationFrame(() => {
        if (target?.isConnected) target.focus({ preventScroll: true });
      });
    },
    [returnFocus],
  );

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current || !container) {
      setPos(null);
      return;
    }
    const menu = ref.current.getBoundingClientRect();
    const a = anchorRect(anchor);
    const box = container === document.body ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight } : container.getBoundingClientRect();
    const minLeft = box.left + EDGE;
    const maxLeft = box.left + box.width - EDGE - menu.width;
    const alignEnd = "element" in anchor && anchor.align === "end";
    let left = alignEnd ? a.right - menu.width : a.left;
    left = Math.max(minLeft, Math.min(maxLeft, left));
    let top = a.bottom + GAP;
    if (top + menu.height > box.top + box.height - EDGE && a.top - GAP - menu.height >= box.top + EDGE) top = a.top - GAP - menu.height;
    top = Math.max(box.top + EDGE, Math.min(top, box.top + box.height - EDGE - menu.height));
    // Inside a transformed dialog `position: fixed` is relative to the dialog.
    const next = { left: left - (container === document.body ? 0 : box.left), top: top - (container === document.body ? 0 : box.top) };
    setPos((prev) => (prev && prev.left === next.left && prev.top === next.top ? prev : next));
  }, [open, anchor, container]);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const items = ref.current ? [...ref.current.querySelectorAll<HTMLElement>(ITEM_SELECTOR)] : [];
      (items.find((el) => el.getAttribute("aria-checked") === "true") ?? items[0])?.focus({ preventScroll: true });
    });
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const a = anchorRef.current;
      if (target && ref.current?.contains(target)) return;
      if (a && "element" in a && target && a.element.contains(target)) return;
      close("outside");
    };
    const onScroll = (event: Event) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) return;
      close("outside");
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onScroll);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close]);

  if (!open || !container) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();
    event.stopPropagation();
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focus(at + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        focus(at < 0 ? -1 : at - 1);
        return;
      case "Home":
        event.preventDefault();
        focus(0);
        return;
      case "End":
        event.preventDefault();
        focus(-1);
        return;
      case "Escape":
        event.preventDefault();
        close("escape");
        return;
      case "Tab":
        event.preventDefault();
        close("tab");
        return;
    }
    // Type-ahead: letters jump to the next item starting with what was typed.
    if (event.key.length === 1 && event.key !== " " && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now();
      const t = typed.current;
      t.text = now - t.at < 600 ? t.text + event.key.toLowerCase() : event.key.toLowerCase();
      t.at = now;
      const text = (el: HTMLElement) => (el.querySelector("[data-menu-label]")?.textContent ?? el.textContent ?? "").trim().toLowerCase();
      const start = t.text.length === 1 ? at + 1 : Math.max(at, 0);
      for (let k = 0; k < items.length; k++) {
        const i = (start + k) % items.length;
        if (text(items[i]).startsWith(t.text)) {
          event.preventDefault();
          items[i].focus();
          break;
        }
      }
    }
  };

  return createPortal(
    <MenuContext.Provider value={{ close, coarse: !fine }}>
      <div
        ref={ref}
        id={id}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        style={{ minWidth: width, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
        className={cx(
          "fixed z-[70] flex max-h-[min(480px,calc(100dvh-16px))] flex-col overflow-y-auto rounded-[6px] border border-ink bg-surface p-1 text-ink outline-none",
          className,
        )}
      >
        {children}
      </div>
    </MenuContext.Provider>,
    container,
  );
}

function useMenu(): MenuCtx {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("Menu items must be inside <Menu>");
  return ctx;
}

const itemClass = (coarse: boolean, danger?: boolean) =>
  cx(
    "flex w-full shrink-0 items-center gap-2 rounded-[4px] border-0 bg-transparent px-2 text-left text-[14px] outline-none hoverable:bg-hover-surface focus-visible:bg-hover-surface focus-visible:outline-none",
    coarse ? "min-h-11" : "min-h-8",
    danger ? "text-again" : "text-ink",
    "aria-disabled:text-muted aria-disabled:hoverable:bg-transparent",
  );

export interface MenuItemProps {
  onSelect: () => void;
  icon?: IconName;
  /** Key cap at the right («↵», «M», «⌘⌫»). */
  shortcut?: string;
  /** Muted 12px line under the label. */
  caption?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Radio-style item (move picker): marks the current choice. */
  checked?: boolean;
  /** Leading content instead of an icon (a theme square). */
  lead?: ReactNode;
  /** Trailing content instead of a key cap (a count). */
  trail?: ReactNode;
  lang?: string;
  className?: string;
  children: ReactNode;
}

export function MenuItem({ onSelect, icon, shortcut, caption, danger, disabled, checked, lead, trail, lang, className, children }: MenuItemProps) {
  const { close, coarse } = useMenu();
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      onClick={() => {
        if (disabled) return;
        close("select");
        onSelect();
      }}
      className={cx(itemClass(coarse, danger), !!caption && "items-start py-1.5", className)}
    >
      {icon && <Icon name={icon} size={16} className={cx("shrink-0", !!caption && "mt-0.5")} />}
      {lead}
      <span className="flex min-w-0 flex-1 flex-col">
        <span data-menu-label="" lang={lang} className="truncate leading-5">
          {children}
        </span>
        {caption && <span className="text-[12px] leading-4 text-muted">{caption}</span>}
      </span>
      {trail}
      {checked && <Icon name="check" size={16} className="shrink-0" />}
      {shortcut && (
        <Kbd aria-hidden="true" className={cx(!!caption && "mt-0.5")}>
          {shortcut}
        </Kbd>
      )}
    </button>
  );
}

/** Option row with a checkbox («Закрепить тему»); stays open on toggle. */
export function MenuCheckboxItem({
  checked,
  onCheckedChange,
  caption,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  caption?: ReactNode;
  children: ReactNode;
}) {
  const { coarse } = useMenu();
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={-1}
      onClick={() => onCheckedChange(!checked)}
      className={cx(itemClass(coarse), "items-start py-1.5")}
    >
      <CheckMark checked={checked} className="mt-[3px]" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span data-menu-label="" className="leading-5">
          {children}
        </span>
        {caption && <span className="text-[12px] leading-4 text-muted">{caption}</span>}
      </span>
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="mx-0 my-1 h-px shrink-0 bg-rule" />;
}
