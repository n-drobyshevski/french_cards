// Keyboard cursor for the desktop add dialog's combobox (DESKTOP-SPEC §4 «Add dialog»): ↑/↓ run
// through every option of «Недавние» / «Словарь» + «Варианты» + «Заполнить вручную» as one list,
// ↵ picks the active one. Pure, so it is unit-tested.

/**
 * The option ↵ would pick: the one the user moved to (while it is still listed), else `fallback`
 * (the kept draft's option or the first «Вариант») when listed, else none.
 */
export function resolveActive(keys: readonly string[], explicit: string | null, fallback: string | null): string | null {
  if (explicit !== null && keys.includes(explicit)) return explicit;
  if (fallback !== null && keys.includes(fallback)) return fallback;
  return null;
}

/** ↓ (+1) / ↑ (−1) from `current`; with nothing active ↓ starts at the top and ↑ at the bottom. Stops at the ends. */
export function moveActive(keys: readonly string[], current: string | null, delta: 1 | -1): string | null {
  if (keys.length === 0) return null;
  const at = current === null ? -1 : keys.indexOf(current);
  if (at === -1) return delta === 1 ? keys[0] : keys[keys.length - 1];
  return keys[Math.min(keys.length - 1, Math.max(0, at + delta))];
}

/** Option key of a «Вариант» (also identifies the draft built from it). */
export const variantKey = (s: { fr: string; ru: string }) => `v:${s.fr}\u0001${s.ru}`;
export const dictionaryKey = (fr: string) => `d:${fr}`;
export const recentKey = (id: string) => `r:${id}`;
export const MANUAL_KEY = "m";
