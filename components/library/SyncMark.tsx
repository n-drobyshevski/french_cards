"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { SETTINGS_PAGES } from "@/components/settings/format";
import { useSyncLine } from "@/components/settings/useSyncLine";
import { db } from "@/lib/db";
import { useSyncStatus } from "@/lib/sync";

const MARK_IN = "animate-[fade-in_var(--dur-quick)_var(--ease-enter)]";

/**
 * Phones show the sync state outside Settings only on trouble (MOTION-SPEC T7), after the library's
 * title: «· НЕ СИНХРОНИЗИРОВАНО» in again-red when the last sync failed (a link to Settings ›
 * Данные), «· ОФЛАЙН» muted when there is no network and changes wait to be sent. Nothing while
 * healthy, syncing or local-only. The failure follows the settings line (useSyncLine), so a short
 * background retry does not make it blink.
 */
export function SyncMark() {
  const { auth, line } = useSyncLine();
  const status = useSyncStatus();
  const offline = (auth === "offline" || status.state === "offline") && line.tone !== "again";
  const waiting = useLiveQuery(() => (offline ? db.outbox.count() : 0), [offline]) ?? 0;

  if (line.tone === "again") {
    return (
      <Link
        href={SETTINGS_PAGES.data.href}
        data-sync-mark="error"
        aria-label="Не синхронизировано. Открыть «Данные» в настройках"
        className={`meta min-w-0 truncate leading-9 text-again underline-offset-4 active:underline ${MARK_IN}`}
      >
        · Не синхронизировано
      </Link>
    );
  }
  if (offline && waiting > 0) {
    return (
      <span data-sync-mark="offline" title="Нет сети · изменения сохранятся" className={`meta min-w-0 truncate leading-9 ${MARK_IN}`}>
        · Офлайн
      </span>
    );
  }
  return null;
}
