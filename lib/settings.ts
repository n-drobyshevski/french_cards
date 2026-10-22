// Device-local preferences (not synced). One row with id "settings".
import { db } from "./db";
import { DEFAULT_SETTINGS, type Settings } from "./types";

/** Stored settings merged over defaults, so newly added fields always have a value. */
export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get("settings");
  return { ...DEFAULT_SETTINGS, ...row, id: "settings" };
}

export async function updateSettings(patch: Partial<Omit<Settings, "id">>): Promise<Settings> {
  return db.transaction("rw", db.settings, async () => {
    const next: Settings = { ...(await getSettings()), ...patch, id: "settings" };
    if (patch.new_per_day !== undefined) next.new_per_day = Math.max(0, Math.min(999, Math.round(patch.new_per_day)));
    await db.settings.put(next);
    return next;
  });
}
