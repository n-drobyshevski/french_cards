"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getSettings } from "./settings";
import {
  getServerSettingsMirrorSnapshot,
  getSettingsMirrorSnapshot,
  parseSettingsMirror,
  subscribeSettingsMirror,
  writeSettingsMirror,
} from "./settings-mirror";
import type { Settings } from "./types";

export interface SettingsState {
  /** Stored settings, or their localStorage mirror until Dexie answers; undefined = not known yet. */
  settings: Settings | undefined;
  /** True once Dexie answered (the values are the source of truth, not the mirror). */
  stored: boolean;
}

/**
 * Device settings for screens that must not flash defaults (MOTION-SPEC L2, T1): the first client
 * frame reads the localStorage mirror, Dexie corrects it silently. The server render and hydration
 * have no mirror, so `settings` is undefined there: render the value-dependent parts blank.
 */
export function useSettings(): SettingsState {
  const stored = useLiveQuery(getSettings, []);
  const raw = useSyncExternalStore(subscribeSettingsMirror, getSettingsMirrorSnapshot, getServerSettingsMirrorSnapshot);
  const mirror = useMemo(() => parseSettingsMirror(raw), [raw]);
  useEffect(() => {
    if (stored) writeSettingsMirror(stored);
  }, [stored]);
  return { settings: stored ?? mirror ?? undefined, stored: stored !== undefined };
}
