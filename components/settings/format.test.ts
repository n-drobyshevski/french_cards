import { describe, expect, it } from "vitest";
import type { ImportResult } from "@/lib/backup";
import {
  describeBackupImport,
  describeBackupPreview,
  describeLegacyImport,
  relativeTime,
  shortEmail,
  stepNewPerDay,
  syncLine,
  type SyncLineInput,
} from "./format";

const NOW = Date.parse("2026-10-21T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("shortEmail", () => {
  it("shortens long local parts", () => {
    expect(shortEmail("n.drobyshevski@pm.me")).toBe("n.d…@pm.me");
    expect(shortEmail("anna@pm.me")).toBe("anna@pm.me");
    expect(shortEmail("not-an-email")).toBe("not-an-email");
  });
});

describe("relativeTime", () => {
  it("reads naturally", () => {
    expect(relativeTime(ago(20_000), NOW)).toBe("только что");
    expect(relativeTime(ago(5 * 60_000), NOW)).toBe("5 мин назад");
    expect(relativeTime(ago(2 * 3_600_000), NOW)).toBe("2 ч назад");
    expect(relativeTime(ago(30 * 3_600_000), NOW)).toBe("вчера");
    expect(relativeTime(ago(5 * 86_400_000), NOW)).toMatch(/16 окт/);
  });
});

describe("syncLine", () => {
  const base: SyncLineInput = {
    auth: { status: "signed_in", email: "n.drobyshevski@pm.me" },
    sync: { state: "idle", lastSyncAt: ago(10_000) },
    nowMs: NOW,
  };

  it("shows account and last sync", () => {
    expect(syncLine(base)).toEqual({ text: "n.d…@pm.me · только что", tone: "good", canSync: true });
  });

  it("covers the other states", () => {
    expect(syncLine({ ...base, auth: { status: "local", email: null } })).toMatchObject({
      text: "только на этом устройстве",
      canSync: false,
    });
    expect(syncLine({ ...base, auth: { status: "signed_out", email: null } })).toMatchObject({ text: "вход не выполнен" });
    expect(syncLine({ ...base, sync: { state: "syncing", lastSyncAt: null } })).toMatchObject({
      text: "n.d…@pm.me · синхронизация…",
      canSync: false,
    });
    expect(syncLine({ ...base, sync: { state: "offline", lastSyncAt: null } })).toMatchObject({
      text: "n.d…@pm.me · нет сети",
      tone: "muted",
    });
    expect(syncLine({ ...base, sync: { state: "error", lastSyncAt: null } })).toMatchObject({ tone: "again" });
    expect(syncLine({ ...base, sync: { state: "idle", lastSyncAt: null } })).toMatchObject({ text: "n.d…@pm.me · ещё не было" });
  });
});

describe("stepNewPerDay", () => {
  it("steps by 1 up to 10, then by 5", () => {
    expect(stepNewPerDay(9, 1)).toBe(10);
    expect(stepNewPerDay(10, 1)).toBe(15);
    expect(stepNewPerDay(12, 1)).toBe(15);
    expect(stepNewPerDay(15, -1)).toBe(10);
    expect(stepNewPerDay(12, -1)).toBe(10);
    expect(stepNewPerDay(10, -1)).toBe(9);
  });

  it("stays within 0..999", () => {
    expect(stepNewPerDay(0, -1)).toBe(0);
    expect(stepNewPerDay(999, 1)).toBe(999);
    expect(stepNewPerDay(997, 1)).toBe(999);
  });
});

describe("import summaries", () => {
  const empty = { inserted: 0, updated: 0, skipped: 0, deleted: 0 };
  const result = (patch: Partial<ImportResult>): ImportResult => ({
    folders: empty,
    words: empty,
    review_state: empty,
    review_log: empty,
    reorg_runs: empty,
    review_sets: empty,
    settings: "kept",
    ...patch,
  });

  it("describes a backup import", () => {
    expect(describeBackupImport(result({ words: { inserted: 12, updated: 3, skipped: 0, deleted: 0 } }))).toBe(
      "Добавлено 12 слов, обновлено 3",
    );
    expect(describeBackupImport(result({ words: { inserted: 1, updated: 0, skipped: 0, deleted: 0 } }))).toBe("Добавлено 1 слово");
    expect(describeBackupImport(result({ review_state: { inserted: 0, updated: 4, skipped: 0, deleted: 0 } }))).toBe(
      "Прогресс и темы обновлены",
    );
    expect(describeBackupImport(result({}))).toBe("Ничего нового — всё уже есть");
  });

  it("lists what a backup import would change", () => {
    expect(
      describeBackupPreview(
        result({
          words: { inserted: 12, updated: 3, skipped: 4, deleted: 1 },
          folders: { inserted: 1, updated: 0, skipped: 7, deleted: 0 },
          review_state: { inserted: 20, updated: 4, skipped: 0, deleted: 0 },
          review_log: { inserted: 31, updated: 0, skipped: 0, deleted: 0 },
        }),
      ),
    ).toEqual([
      { label: "Слова", text: "12 новых · 2 изменятся · 1 удалится" },
      { label: "Темы", text: "1 новая" },
      { label: "Прогресс", text: "24 карточки" },
      { label: "История", text: "31 ответ" },
    ]);
    expect(describeBackupPreview(result({}))).toEqual([]);
  });

  it("describes the old-version import", () => {
    expect(describeLegacyImport(3, 8)).toBe("Добавлено 3 слова");
    expect(describeLegacyImport(0, 11)).toBe("Новых слов нет — все уже в библиотеке");
    expect(describeLegacyImport(0, 0)).toBe("В файле не найдено слов");
  });
});
