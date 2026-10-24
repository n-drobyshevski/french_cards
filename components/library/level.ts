// «Уровень языка» in the UI (mockups: Level-Badge-A, Level-Word, Level-Edit, Level-Filter-A,
// D-Level-Library, D-Level-Word): the mono label, its aria text and source caption, the filter
// keys and the order. Pure; the level itself comes from lib/core/level.ts (useLevelData).
import { CEFR_LEVELS, type Cefr, type LevelInfo, type LevelSource } from "@/lib/core/level";

/** A filter choice: a level, or «без уровня». */
export type LevelKey = Cefr | "none";
export const LEVEL_KEYS: readonly LevelKey[] = [...CEFR_LEVELS, "none"];

/** «≈B1» for every level the user did not pick, «B1» for theirs, «—» without one. */
export const levelText = (info: LevelInfo | null): string => (!info ? "—" : info.estimated ? `≈${info.level}` : info.level);

/** Where a level comes from, as the word card captions it. The app's AI and the chat both read «от Claude». */
export const LEVEL_SOURCE_CAPTIONS: Record<LevelSource, string> = {
  flelex: "по словарю FLELex",
  freq: "по частотности",
  chat: "от Claude",
  ai: "от Claude",
  user: "вы указали",
};

/** «Уровень языка: примерно B1, оценка» / «… примерно B1, от Claude» / «Уровень языка: A1, вы указали» / «Уровень языка: без уровня». */
export function levelAria(info: LevelInfo | null): string {
  if (!info) return "Уровень языка: без уровня";
  if (!info.estimated) return `Уровень языка: ${info.level}, вы указали`;
  const from = info.source === "chat" || info.source === "ai" ? "от Claude" : "оценка";
  return `Уровень языка: примерно ${info.level}, ${from}`;
}

/** The short form for a row's accessible name: «≈B1», «A1», «без уровня». */
export const levelRowText = (info: LevelInfo | null): string => (info ? levelText(info) : "без уровня");

/**
 * The hint under an estimate: «≈ B1 — оценка по словарю FLELex, точна примерно в половине случаев.»
 * None for the user's own level.
 */
export function levelHint(info: LevelInfo | null): string | null {
  if (!info || !info.estimated) return null;
  const level = `≈ ${info.level}`;
  if (info.source === "flelex") return `${level} — оценка по словарю FLELex, точна примерно в половине случаев.`;
  if (info.source === "freq") return `${level} — оценка по частотности слова, приблизительная.`;
  return `${level} — уровень от Claude, примерный.`;
}

/** The hint for a list of estimates (the desktop filter). */
export const LEVEL_FILTER_HINT = "≈ — оценка по словарю FLELex, точна примерно в половине случаев.";
/** Under the phone filter group. */
export const LEVEL_FILTER_NOTE = "Считаются и оценки «≈», и уровни, которые вы указали.";

export const levelKeyOf = (info: LevelInfo | null): LevelKey => info?.level ?? "none";

/** Selected keys are OR-ed. Empty = any. */
export function matchesLevel(info: LevelInfo | null, keys: readonly LevelKey[]): boolean {
  return keys.length === 0 || keys.includes(levelKeyOf(info));
}

/** Keys in display order, `k` toggled. */
export function toggleLevelKey(keys: readonly LevelKey[], k: LevelKey): LevelKey[] {
  return keys.includes(k) ? keys.filter((x) => x !== k) : LEVEL_KEYS.filter((x) => x === k || keys.includes(x));
}

/** Chip / strip text: «Уровень языка», «Уровень языка: B1, B2», «Уровень языка: 3». */
export function levelChipLabel(keys: readonly LevelKey[]): string {
  if (keys.length === 0) return "Уровень языка";
  const names = keys.map((k) => (k === "none" ? "без уровня" : k));
  return keys.length <= 2 ? `Уровень языка: ${names.join(", ")}` : `Уровень языка: ${keys.length}`;
}

/** «По уровню языка»: A1 → C2, words without a level last. */
export function levelRank(info: LevelInfo | null): number {
  return info ? CEFR_LEVELS.indexOf(info.level) : CEFR_LEVELS.length;
}

/** Words per filter key («A1, 142»). */
export function levelCounts(infos: Iterable<LevelInfo | null>): Record<LevelKey, number> {
  const out = Object.fromEntries(LEVEL_KEYS.map((k) => [k, 0])) as Record<LevelKey, number>;
  for (const info of infos) out[levelKeyOf(info)]++;
  return out;
}
