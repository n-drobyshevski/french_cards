"use client";

// «Происхождение» on or off (Settings → «Оформление»), for list rows and the review card. Read
// from the settings mirror (lib/settings-mirror.ts), which every settings change writes, so a long
// library list does not open one Dexie query per row; parsed once per change, not per row.
import { useSyncExternalStore } from "react";
import { getSettingsMirrorSnapshot, parseSettingsMirror, subscribeSettingsMirror } from "./settings-mirror";
import { DEFAULT_SETTINGS } from "./types";

let lastRaw: string | null | undefined;
let lastValue = DEFAULT_SETTINGS.origin_visible;

const snapshot = () => {
  const raw = getSettingsMirrorSnapshot();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastValue = parseSettingsMirror(raw)?.origin_visible ?? DEFAULT_SETTINGS.origin_visible;
  }
  return lastValue;
};

export function useShowOrigin(): boolean {
  return useSyncExternalStore(subscribeSettingsMirror, snapshot, () => DEFAULT_SETTINGS.origin_visible);
}
