"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useAuthUser, type AuthStatus } from "@/components/auth/session";
import { readSyncMeta, syncNow, useSyncStatus, type SyncStatus } from "@/lib/sync";
import { useDelayedFlag } from "@/lib/use-delayed-flag";
import { syncLine, type SyncLine } from "./format";
import { useClock } from "./useClock";

export interface SyncLineState {
  /** Sign-in state (the sidebar shows no line without sync). */
  auth: AuthStatus;
  line: SyncLine;
  /** «Синхронизация…» is showing because of a tap: aria-busy on the row. */
  busy: boolean;
  /** Start a sync now; the line says «Синхронизация…» at once (min 500 ms), like a pending button. */
  sync: () => void;
}

/**
 * The sync line as Settings, the sidebar and the rail show it (MOTION-SPEC T5, D9). Background
 * cycles are quiet: «Синхронизация…» only if one lasts over 1 s, then for at least 500 ms; until
 * then the line keeps its last resting state, so it does not flicker on every edit.
 */
export function useSyncLine(): SyncLineState {
  const auth = useAuthUser();
  const status = useSyncStatus();
  const nowMs = useClock();
  // The time of the last sync before the loop has read it back (first frames after a start).
  // It lives in the "sync" row, not in the settings the screens watch.
  const stored = useLiveQuery(() => readSyncMeta(), [])?.last_sync_at ?? null;

  // The last state that was not «syncing»: what the line shows during a short background cycle.
  const [rest, setRest] = useState<SyncStatus>(() => (status.state === "syncing" ? { ...status, state: "idle" } : status));
  if (status.state !== "syncing" && status !== rest) setRest(status);

  const [tapped, setTapped] = useState(false);
  const background = useDelayedFlag(status.state === "syncing", { delay: 1000, min: 500 });
  const manual = useDelayedFlag(tapped, { delay: 0, min: 500 });
  const syncing = background || manual || tapped;

  const shown = syncing ? { ...rest, state: "syncing" as const } : rest;
  const line = syncLine({ auth, sync: { ...shown, lastSyncAt: shown.lastSyncAt ?? stored }, nowMs });

  return {
    auth: auth.status,
    line,
    busy: tapped || manual,
    sync: () => {
      if (tapped) return;
      setTapped(true);
      void syncNow().finally(() => setTapped(false));
    },
  };
}
