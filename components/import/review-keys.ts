// Keys of the desktop import review (DESKTOP-SPEC §4 «Import review»): J/K move the current row,
// X or Пробел toggle it, ↵ edits it inline, ⌘A «Выбрать все», ⌘↵ «Добавить N слов».
// Letters bind by `code` (ЙЦУКЕН-safe). Pure mapping; DeskReviewView wires it up and applies the guards.

export type ImportReviewKeyAction = "next" | "prev" | "toggle" | "edit" | "select-all" | "add";

export interface ImportKeyLike {
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

export interface ImportKeyContext {
  /** settings.shortcuts: single keys (J, K, X, Пробел, ↵) are on. ⌘A and ⌘↵ always work. */
  shortcuts: boolean;
  /** Focus is on a control that handles Пробел / ↵ itself (button, link, checkbox). */
  interactive: boolean;
  /** ⌘ on Apple devices, Ctrl elsewhere. */
  mac: boolean;
}

const isEnter = (ev: ImportKeyLike) => ev.key === "Enter" || ev.code === "Enter" || ev.code === "NumpadEnter";

export function importReviewKeyAction(ev: ImportKeyLike, ctx: ImportKeyContext): ImportReviewKeyAction | null {
  if (ev.isComposing || ev.keyCode === 229) return null;
  const mod = ctx.mac ? ev.metaKey : ev.ctrlKey;
  const otherMod = ctx.mac ? ev.ctrlKey : ev.metaKey;
  if (mod) {
    if (ev.altKey || ev.shiftKey || otherMod || ev.repeat) return null;
    if (ev.code === "KeyA") return "select-all";
    if (isEnter(ev)) return "add";
    return null;
  }
  if (ev.altKey || otherMod || ev.shiftKey || ev.repeat || !ctx.shortcuts) return null;
  if (ev.code === "KeyJ") return "next";
  if (ev.code === "KeyK") return "prev";
  if (ev.code === "KeyX") return "toggle";
  if (ctx.interactive) return null;
  if (ev.code === "Space" || ev.key === " ") return "toggle";
  if (isEnter(ev)) return "edit";
  return null;
}
