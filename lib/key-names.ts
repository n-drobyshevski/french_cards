// Key names for caps, hint lines and tooltips (mockups/DESKTOP-SPEC.md §3 «Key names»): Mac glyphs
// (⌘ ⇧ ↵ ⌫) on Apple devices, «Ctrl» / «Enter» elsewhere. Combos are written "Mod+Shift+Enter".
import { useSyncExternalStore } from "react";

interface NavigatorLike {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
}

/** True on macOS and iOS/iPadOS (⌘ is the shortcut modifier there). */
export function isMacPlatform(nav: NavigatorLike | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav) return false;
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const MAC: Record<string, string> = {
  mod: "⌘",
  shift: "⇧",
  alt: "⌥",
  ctrl: "⌃",
  enter: "↵",
  backspace: "⌫",
};

const OTHER: Record<string, string> = {
  mod: "Ctrl",
  shift: "Shift",
  alt: "Alt",
  ctrl: "Ctrl",
  enter: "Enter",
  backspace: "Backspace",
};

const COMMON: Record<string, string> = {
  escape: "Esc",
  esc: "Esc",
  space: "Пробел",
  delete: "Delete",
  tab: "Tab",
  up: "↑",
  arrowup: "↑",
  down: "↓",
  arrowdown: "↓",
  left: "←",
  arrowleft: "←",
  right: "→",
  arrowright: "→",
};

/** Apple order ⌃⌥⇧⌘; elsewhere Ctrl+Alt+Shift. */
const MAC_ORDER = ["ctrl", "alt", "shift", "mod"];
const OTHER_ORDER = ["mod", "ctrl", "alt", "shift"];

/**
 * One cap's text for a combo: formatKeys("Mod+Enter", true) → «⌘↵», (…, false) → «Ctrl+Enter»;
 * formatKeys("Shift+Mod+Enter", true) → «⇧⌘↵». Single keys: "Enter" → «↵» / «Enter», "n" → «N».
 */
export function formatKeys(combo: string, mac: boolean): string {
  const parts = combo.split("+").filter(Boolean);
  const mods = parts.slice(0, -1).map((p) => p.toLowerCase());
  const key = parts.at(-1) ?? "";
  const names = mac ? MAC : OTHER;
  const ordered = [...new Set((mac ? MAC_ORDER : OTHER_ORDER).filter((m) => mods.includes(m)).map((m) => names[m]))];
  const lower = key.toLowerCase();
  const keyName = names[lower] ?? COMMON[lower] ?? (key.length === 1 ? key.toUpperCase() : key);
  return mac ? [...ordered, keyName].join("") : [...ordered, keyName].join("+");
}

const noop = () => () => {};

/** isMacPlatform() on the client; false on the server and during hydration. */
export function useIsMac(): boolean {
  return useSyncExternalStore(noop, () => isMacPlatform(), () => false);
}

/** formatKeys bound to this device's platform. */
export function useFormatKeys(): (combo: string) => string {
  const mac = useIsMac();
  return (combo) => formatKeys(combo, mac);
}
