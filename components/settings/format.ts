// Pure helpers for the Settings screen: sync status line, the new-cards stepper, import summaries.
import type { ImportResult } from "@/lib/backup";
import { pluralRu } from "@/components/review/format";

/** «n.drobyshevski@pm.me» → «n.d…@pm.me» */
export function shortEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  return `${local.length > 4 ? `${local.slice(0, 3)}…` : local}${email.slice(at)}`;
}

/** «только что», «5 мин назад», «2 ч назад», «вчера», «21 окт.» */
export function relativeTime(iso: string, nowMs: number): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, nowMs - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч назад`;
  if (hours < 48) return "вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(then));
}

export type SyncTone = "good" | "again" | "muted";

export interface SyncLineInput {
  auth: { status: "local" | "loading" | "signed_in" | "signed_out" | "offline"; email: string | null };
  sync: { state: "idle" | "syncing" | "error" | "offline" | "disabled"; lastSyncAt: string | null };
  nowMs: number;
}

export interface SyncLine {
  text: string;
  tone: SyncTone;
  /** A tap can start a sync now. */
  canSync: boolean;
}

/** Right side of «Синхронизация · n.d…@pm.me · только что». */
export function syncLine({ auth, sync, nowMs }: SyncLineInput): SyncLine {
  if (auth.status === "local") return { text: "только на этом устройстве", tone: "muted", canSync: false };
  if (auth.status === "loading") return { text: "…", tone: "muted", canSync: false };
  if (auth.status === "signed_out") return { text: "вход не выполнен", tone: "muted", canSync: false };
  const prefix = auth.email ? `${shortEmail(auth.email)} · ` : "";
  if (sync.state === "syncing") return { text: `${prefix}синхронизация…`, tone: "muted", canSync: false };
  if (auth.status === "offline" || sync.state === "offline") return { text: `${prefix}нет сети`, tone: "muted", canSync: true };
  if (sync.state === "error") return { text: `${prefix}ошибка`, tone: "again", canSync: true };
  if (sync.lastSyncAt) return { text: `${prefix}${relativeTime(sync.lastSyncAt, nowMs)}`, tone: "good", canSync: true };
  return { text: `${prefix}ещё не было`, tone: "muted", canSync: true };
}

export const NEW_PER_DAY_MAX = 999;

/** Stepper for «Новых карточек в день»: by 1 up to 10, then by 5 (snapping to multiples of 5). */
export function stepNewPerDay(value: number, delta: 1 | -1): number {
  const v = Math.max(0, Math.min(NEW_PER_DAY_MAX, Math.round(value)));
  if (delta > 0) {
    if (v < 10) return v + 1;
    return Math.min(NEW_PER_DAY_MAX, v - (v % 5) + 5);
  }
  if (v <= 10) return Math.max(0, v - 1);
  return v % 5 ? v - (v % 5) : v - 5;
}

const words = (n: number) => `${n} ${pluralRu(n, ["слово", "слова", "слов"])}`;

/** Snackbar text after «Импорт JSON». */
export function describeBackupImport(result: ImportResult): string {
  const added = result.words.inserted;
  const updated = result.words.updated;
  const other = (["folders", "review_state", "review_log", "reorg_runs"] as const).reduce(
    (sum, t) => sum + result[t].inserted + result[t].updated,
    0,
  );
  if (added === 0 && updated === 0) return other > 0 ? "Прогресс и темы обновлены" : "Ничего нового — всё уже есть";
  const parts: string[] = [];
  if (added > 0) parts.push(`добавлено ${words(added)}`);
  if (updated > 0) parts.push(`обновлено ${updated}`);
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface BackupPreviewLine {
  label: string;
  text: string;
}

/**
 * Rows of the «Импорт копии» confirmation: per kind of data, what the import adds, replaces and
 * deletes. Empty when the backup brings nothing new.
 */
export function describeBackupPreview(result: ImportResult): BackupPreviewLine[] {
  const lines: BackupPreviewLine[] = [];
  const part = (t: "words" | "folders", label: string, fresh: readonly [string, string, string]) => {
    const r = result[t];
    const changed = r.updated - r.deleted;
    const parts: string[] = [];
    if (r.inserted > 0) parts.push(`${r.inserted} ${pluralRu(r.inserted, fresh)}`);
    if (changed > 0) parts.push(`${changed} ${pluralRu(changed, ["изменится", "изменятся", "изменятся"])}`);
    if (r.deleted > 0) parts.push(`${r.deleted} ${pluralRu(r.deleted, ["удалится", "удалятся", "удалятся"])}`);
    if (parts.length) lines.push({ label, text: parts.join(" · ") });
  };
  part("words", "Слова", ["новое", "новых", "новых"]);
  part("folders", "Темы", ["новая", "новых", "новых"]);
  const progress = result.review_state.inserted + result.review_state.updated;
  if (progress > 0) lines.push({ label: "Прогресс", text: `${progress} ${pluralRu(progress, ["карточка", "карточки", "карточек"])}` });
  const answers = result.review_log.inserted + result.review_log.updated;
  if (answers > 0) lines.push({ label: "История", text: `${answers} ${pluralRu(answers, ["ответ", "ответа", "ответов"])}` });
  return lines;
}

/** Snackbar text after «Импорт из старой версии (HTML)». */
export function describeLegacyImport(added: number, skipped: number): string {
  if (added > 0) return `Добавлено ${words(added)}`;
  if (skipped > 0) return "Новых слов нет — все уже в библиотеке";
  return "В файле не найдено слов";
}
