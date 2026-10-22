// Global desktop keys (DESKTOP-SPEC §4): N new word, / library search, ? «Клавиши», G then R/L/C/I,
// [ sidebar. Bound by `code` so they work on the Russian layout. Pure mapping + guards; GlobalKeys
// wires them up. Review keys (components/review/keys.ts: Space, Enter, 1–3, ←/→, Z) do not overlap.
import { isTypingTarget } from "@/components/review/keys";

/** Window event for «focus the search field» (`/`). A screen with a search listens for it and calls
 * event.preventDefault() to claim it; when nobody does, the app goes to /library?focus=search. */
export const FOCUS_SEARCH_EVENT = "kartochki:focus-search";

/** `G` then R/L/C/I must follow within this many ms. */
export const SEQUENCE_MS = 1000;

export const GO_TARGETS = { KeyR: "/", KeyL: "/library", KeyC: "/context", KeyI: "/import" } as const;

export type GlobalKeyAction =
  | { type: "add" }
  | { type: "search" }
  | { type: "shortcuts" }
  | { type: "sequence" }
  | { type: "go"; href: (typeof GO_TARGETS)[keyof typeof GO_TARGETS] }
  | { type: "toggle-sidebar" };

export interface GlobalKeyLike {
  key: string;
  code: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"]);

/** A bare modifier press (e.g. Shift before «?»): neither an action nor the end of a `G` sequence. */
export const isModifierKey = (ev: Pick<GlobalKeyLike, "key">) => MODIFIER_KEYS.has(ev.key);

/** Maps a key press to a global action. `afterG`: the previous key was `G` within SEQUENCE_MS. */
export function globalKeyAction(ev: GlobalKeyLike, afterG = false): GlobalKeyAction | null {
  // Dead keys (^ ¨), compose and IME input.
  if (ev.isComposing || ev.keyCode === 229) return null;
  if (ev.repeat || ev.altKey || ev.ctrlKey || ev.metaKey) return null;
  if (afterG) {
    const href = !ev.shiftKey && GO_TARGETS[ev.code as keyof typeof GO_TARGETS];
    return href ? { type: "go", href } : null;
  }
  if (ev.key === "?" || (ev.code === "Slash" && ev.shiftKey)) return { type: "shortcuts" };
  if (ev.key === "/" || ev.code === "Slash") return { type: "search" };
  if (ev.shiftKey) return null;
  if (ev.code === "KeyN") return { type: "add" };
  if (ev.code === "KeyG") return { type: "sequence" };
  if (ev.code === "BracketLeft") return { type: "toggle-sidebar" };
  return null;
}

interface ElementLike {
  closest?: (selector: string) => unknown;
}

/** Widgets with their own letter keys (type-ahead) or an open layer: menus, listboxes, dialogs. */
const OWN_KEYS = "[role='menu'], [role='menubar'], [role='listbox'], [role='combobox'], [role='dialog'], [role='alertdialog']";

/** True when global keys must leave this key press alone: typing, or focus inside a menu/listbox/dialog. */
export function blocksGlobalKeys(target: unknown): boolean {
  if (isTypingTarget(target)) return true;
  const el = target as ElementLike | null;
  return !!el && typeof el.closest === "function" && !!el.closest(OWN_KEYS);
}

/** An open dialog, sheet or menu anywhere on the page (its own keys apply, page shortcuts do not). */
export const OPEN_LAYER_SELECTOR =
  "[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open'], [role='menu'], [role='listbox'][data-state='open']";
