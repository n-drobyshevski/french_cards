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

export type SyncTone = "good" | "ink" | "again" | "muted";

/** Why the last sync failed (lib/sync.ts SyncStatus.errorKind). */
export type SyncErrorKind = "server" | "auth" | "rejected";

export interface SyncLineInput {
  auth: { status: "local" | "loading" | "signed_in" | "signed_out" | "offline"; email: string | null };
  sync: {
    state: "idle" | "syncing" | "error" | "offline" | "disabled";
    lastSyncAt: string | null;
    errorKind?: SyncErrorKind | null;
    errorAt?: string | null;
  };
  nowMs: number;
}

export interface SyncLine {
  /** «Синхронизировано · 14:02»; empty while not known yet (the slot stays reserved). */
  text: string;
  /** The status dot: good = in sync, ink = syncing, muted = offline / nothing yet, again = failed. */
  tone: SyncTone;
  /** A failed sync: «Повторить» after the text (the row starts a sync). */
  retry: boolean;
  /** Second muted line for a failure: «Сервер не ответил · 14:05». */
  detail: string | null;
  /** A tap can start a sync now. */
  canSync: boolean;
}

/** Every rest text of the line, for the width lock: the slot is as wide as the widest of them. */
export const SYNC_LINE_TEXTS = [
  "Синхронизировано · 00:00",
  "Синхронизация…",
  "Нет сети · изменения сохранятся",
  "Не синхронизировано · Повторить",
] as const;

const SYNC_ERRORS: Record<SyncErrorKind, string> = {
  server: "Сервер не ответил",
  auth: "Нужно войти заново",
  rejected: "Сервер не принял изменения",
};

/** «14:02» today, «21 окт.» on an earlier day. */
export function syncTime(iso: string, nowMs: number): string {
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return "";
  const now = new Date(nowMs);
  if (then.toDateString() === now.toDateString() || nowMs === 0) {
    return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(then);
  }
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(then);
}

/**
 * The sync status line (MOTION-SPEC T5): «Синхронизировано · 14:02» at rest, «Синхронизация…»,
 * «Нет сети · изменения сохранятся» (neutral, not an error), «Не синхронизировано · Повторить» with
 * the reason on a second line. `syncing` is shown as is: callers delay it (useSyncLine).
 */
export function syncLine({ auth, sync, nowMs }: SyncLineInput): SyncLine {
  const line = (text: string, tone: SyncTone, canSync: boolean): SyncLine => ({ text, tone, retry: false, detail: null, canSync });
  if (auth.status === "local") return line("Только на этом устройстве", "muted", false);
  if (auth.status === "loading") return line("", "muted", false);
  if (auth.status === "signed_out") return line("Вход не выполнен", "muted", false);
  if (sync.state === "syncing") return line("Синхронизация…", "ink", false);
  if (auth.status === "offline" || sync.state === "offline") return line("Нет сети · изменения сохранятся", "muted", true);
  if (sync.state === "error") {
    const reason = SYNC_ERRORS[sync.errorKind ?? "server"];
    const at = sync.errorAt ? syncTime(sync.errorAt, nowMs) : "";
    return { text: "Не синхронизировано", tone: "again", retry: true, detail: at ? `${reason} · ${at}` : reason, canSync: true };
  }
  if (sync.lastSyncAt) return line(`Синхронизировано · ${syncTime(sync.lastSyncAt, nowMs)}`, "good", true);
  return line("Ещё не синхронизировано", "muted", true);
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
  const other = (
    ["folders", "review_state", "review_log", "reorg_runs", "review_sets", "field_defs", "exercise_sets", "exercise_runs", "user_prefs"] as const
  ).reduce(
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
  const exercises = result.exercise_sets.inserted + result.exercise_sets.updated;
  if (exercises > 0) lines.push({ label: "Упражнения", text: `${exercises} ${pluralRu(exercises, ["набор", "набора", "наборов"])}` });
  return lines;
}

/** Snackbar text after «Импорт из старой версии (HTML)». */
export function describeLegacyImport(added: number, skipped: number): string {
  if (added > 0) return `Добавлено ${words(added)}`;
  if (skipped > 0) return "Новых слов нет — все уже в библиотеке";
  return "В файле не найдено слов";
}
