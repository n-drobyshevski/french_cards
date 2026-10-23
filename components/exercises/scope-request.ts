"use client";

// «Упражнение по трудным словам» (SPEC «Упражнения»): a request for a set made only of the user's
// difficult words, the words due today, or both, from every theme. Every entry point (the list's
// quick tiles, the Library ledger, «Готово на сегодня») copies the same text; the app never calls
// Claude here, so no spark.
import { useCallback } from "react";
import { buildRequestText, useExerciseSets } from "@/lib/exercises";
import type { ExerciseScope } from "@/lib/types";
import { useOnline } from "@/lib/use-online";
import { CLAUDE_NEW_CHAT_URL, copyRequest } from "./clipboard";
import { requestSummary, type RequestChoice } from "./list-format";

/** Questions asked for by a one-tap scope request (the builder's default). */
export const SCOPE_REQUEST_SIZE = 12;

/** The snackbar after a scope request was copied. Online it is short: «Открыть Claude ↗» follows. */
export const SCOPE_COPIED = "Запрос скопирован";
export const SCOPE_COPIED_OFFLINE = "Запрос скопирован — вставьте в чат Claude";
export const COPY_FAILED = "Не получилось скопировать";
export const OPEN_CLAUDE_LABEL = "Открыть Claude ↗";

/** The builder's choice for a scope: no themes, no topic, never new words. */
export function scopeChoice(scope: ExerciseScope, size: number = SCOPE_REQUEST_SIZE): RequestChoice {
  return { folders: [], topic: null, size, allowNew: false, scope };
}

/** The request text and the waiting line's summary for a scope. */
export function scopeRequest(scope: ExerciseScope, size: number = SCOPE_REQUEST_SIZE): { text: string; summary: string } {
  const choice = scopeChoice(scope, size);
  return { text: buildRequestText(choice), summary: requestSummary(choice) };
}

/** Opens a new Claude chat in another tab (the snackbar's «Открыть Claude ↗»). */
export function openClaude(): void {
  window.open(CLAUDE_NEW_CHAT_URL, "_blank", "noopener,noreferrer");
}

export interface ScopeCopyNotice {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** What the snackbar says after a copy: «Запрос скопирован · Открыть Claude ↗» online. */
export function scopeCopyNotice(ok: boolean, online: boolean): ScopeCopyNotice {
  if (!ok) return { message: COPY_FAILED };
  return online ? { message: SCOPE_COPIED, actionLabel: OPEN_CLAUDE_LABEL, onAction: openClaude } : { message: SCOPE_COPIED_OFFLINE };
}

/**
 * Copies the request for a scope and remembers it as the one «Упражнения» waits for (its waiting
 * line and skeleton tile), then hands the snackbar's content to `notify` (the app snackbar, or the
 * review screen's own).
 */
export function useCopyScopeRequest(notify: (notice: ScopeCopyNotice) => void): (scope: ExerciseScope) => Promise<boolean> {
  const sets = useExerciseSets();
  const online = useOnline();
  return useCallback(
    async (scope: ExerciseScope) => {
      const ok = await copyRequest(scopeRequest(scope), sets ?? []);
      notify(scopeCopyNotice(ok, online));
      return ok;
    },
    [sets, online, notify],
  );
}
