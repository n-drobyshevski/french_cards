// A localStorage mirror of the device settings (MOTION-SPEC L2 / T1). Dexie stays the source of
// truth; the mirror only lets the first client frame show the stored values (library view, the
// settings screen) instead of defaults that snap a moment later. Written on every change
// (updateSettings) and corrected whenever the stored row is read (useSettings).
import { DEFAULT_SETTINGS, type Settings } from "./types";

export const SETTINGS_MIRROR_KEY = "kartochki:settings";

/** The mirrored fields: everything but the sync bookkeeping, which changes on every sync. */
export function serializeSettingsMirror(settings: Settings): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, last_sync_at, sync_cursors, ...rest } = settings;
  return JSON.stringify(rest);
}

/** Mirrored settings merged over defaults; null when there is no (usable) mirror. */
export function parseSettingsMirror(raw: string | null): Settings | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return { ...DEFAULT_SETTINGS, ...(value as Partial<Settings>), id: "settings", last_sync_at: null };
  } catch {
    return null;
  }
}

// A tiny external store over localStorage (with an in-memory copy for private mode), read with
// useSyncExternalStore so the server render and hydration see "no mirror".
let memory: string | null | undefined;
const listeners = new Set<() => void>();

export function getSettingsMirrorSnapshot(): string | null {
  if (memory === undefined) {
    try {
      memory = localStorage.getItem(SETTINGS_MIRROR_KEY);
    } catch {
      memory = null;
    }
  }
  return memory;
}

export function getServerSettingsMirrorSnapshot(): string | null {
  return null;
}

export function subscribeSettingsMirror(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SETTINGS_MIRROR_KEY) return;
    memory = event.newValue;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Mirrors the stored settings; a no-op when nothing mirrored changed. */
export function writeSettingsMirror(settings: Settings): void {
  if (typeof window === "undefined") return;
  const raw = serializeSettingsMirror(settings);
  if (raw === getSettingsMirrorSnapshot()) return;
  memory = raw;
  try {
    localStorage.setItem(SETTINGS_MIRROR_KEY, raw);
  } catch {
    // Private mode: the mirror lives in memory until reload.
  }
  for (const listener of listeners) listener();
}

/** Tests only. */
export function resetSettingsMirrorMemory(): void {
  memory = undefined;
}
