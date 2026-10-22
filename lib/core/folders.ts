// Pure folder helpers shared by the app and the server (no Dexie): the default set, colors,
// deterministic ids and the slug/color/sort rules for a new folder. lib/folders.ts re-exports them.
import { slugify } from "./text";
import type { Folder } from "../types";

export interface DefaultFolder {
  slug: string;
  name: string;
  color: string;
  description: string;
}

/** Starter themes with the SPEC ink colors. */
export const DEFAULT_FOLDERS: readonly DefaultFolder[] = [
  { slug: "povsednevnoe", name: "Повседневное", color: "#5a5a57", description: "Бытовые фразы на каждый день: просьбы, реакции, «давай», «свали», «что происходит»." },
  { slug: "dengi", name: "Деньги", color: "#2f6b4f", description: "Деньги, покупки, работа, долги и бедность: thune, fric, être fauché." },
  { slug: "eda", name: "Еда", color: "#a0522d", description: "Еда, напитки, готовка, «жрать» и всё, что связано с застольем." },
  { slug: "politsiya", name: "Полиция", color: "#2f4b8a", description: "Полиция, закон, неприятности с властями: flics, keufs." },
  { slug: "tusovka", name: "Тусовка", color: "#6b4a8a", description: "Вечеринки, алкоголь, выход в город, развлечения." },
  { slug: "emotsii", name: "Эмоции", color: "#a33a3a", description: "Чувства, оценки и реакции: kiffer, chelou, c'est ouf, усталость, злость." },
  { slug: "lyudi", name: "Люди", color: "#2f6f74", description: "Люди и отношения: друзья, семья, парни и девушки — pote, meuf, daron." },
];

/** Colors offered for new folders (SPEC muted inks first). */
export const FOLDER_COLORS = [
  ...DEFAULT_FOLDERS.map((f) => f.color),
  "#7a6a2f",
  "#4a6b2f",
  "#8a4a6b",
  "#2f5a8a",
  "#6b5a4a",
] as const;

/**
 * Deterministic UUID-shaped id from a name, so default folders and seeded words get the
 * same id on every device and sync merges them instead of duplicating.
 */
export function stableId(name: string): string {
  const parts: string[] = [];
  for (let seed = 0; seed < 4; seed++) {
    let h = 0x811c9dc5 ^ (seed * 0x9e3779b1);
    for (let i = 0; i < name.length; i++) {
      h ^= name.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
      h ^= h >>> 15;
    }
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    h ^= h >>> 16;
    parts.push((h >>> 0).toString(16).padStart(8, "0"));
  }
  const hex = parts.join("");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const defaultFolderId = (slug: string) => stableId(`folder:${slug}`);

/** Slug for a new folder named `name`: slugified, with -2, -3… when `taken` (tombstones included) has it. */
export function uniqueSlug(name: string, taken: ReadonlySet<string>): string {
  const base = slugify(name) || "tema";
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Color for a new folder: the first one no live folder uses, else cycling through the set. */
export function pickFolderColor(live: readonly Pick<Folder, "color">[]): string {
  const used = new Set(live.map((f) => f.color));
  return FOLDER_COLORS.find((c) => !used.has(c)) ?? FOLDER_COLORS[live.length % FOLDER_COLORS.length];
}

/** `sort` for a folder appended after the live ones. */
export const nextFolderSort = (live: readonly Pick<Folder, "sort">[]): number => live.reduce((m, f) => Math.max(m, f.sort), -1) + 1;
