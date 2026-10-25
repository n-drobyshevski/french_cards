import { describe, expect, it } from "vitest";
import type { ImportResult } from "@/lib/backup";
import { DEFAULT_SETTINGS } from "@/lib/types";
import {
  aiCaption,
  describeBackupImport,
  describeBackupPreview,
  describeLegacyImport,
  exercisesCaption,
  fieldsCaption,
  planCaption,
  relativeTime,
  reviewCaption,
  settingsPageForAnchor,
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
  const local = (h: number, m: number, day = 21) => new Date(2026, 9, day, h, m).getTime();
  const base: SyncLineInput = {
    auth: { status: "signed_in", email: "n.drobyshevski@pm.me" },
    sync: { state: "idle", lastSyncAt: new Date(local(14, 2)).toISOString() },
    nowMs: local(14, 10),
  };

  it("rests on the time of the last sync: «Синхронизировано · 14:02», an earlier day as a date", () => {
    expect(syncLine(base)).toEqual({ text: "Синхронизировано · 14:02", tone: "good", retry: false, detail: null, canSync: true });
    expect(syncLine({ ...base, nowMs: local(9, 0, 23) }).text).toMatch(/^Синхронизировано · 21 окт/);
  });

  it("covers the other states; offline is neutral, a failure says why and when", () => {
    expect(syncLine({ ...base, auth: { status: "local", email: null } })).toMatchObject({
      text: "Только на этом устройстве",
      canSync: false,
    });
    expect(syncLine({ ...base, auth: { status: "loading", email: null } })).toMatchObject({ text: "" });
    expect(syncLine({ ...base, auth: { status: "signed_out", email: null } })).toMatchObject({ text: "Вход не выполнен" });
    expect(syncLine({ ...base, sync: { state: "syncing", lastSyncAt: null } })).toMatchObject({
      text: "Синхронизация…",
      tone: "ink",
      canSync: false,
    });
    expect(syncLine({ ...base, sync: { state: "offline", lastSyncAt: null } })).toMatchObject({
      text: "Нет сети · изменения сохранятся",
      tone: "muted",
      retry: false,
    });
    expect(
      syncLine({ ...base, sync: { state: "error", lastSyncAt: null, errorKind: "server", errorAt: new Date(local(14, 5)).toISOString() } }),
    ).toEqual({ text: "Не синхронизировано", tone: "again", retry: true, detail: "Сервер не ответил · 14:05", canSync: true });
    expect(syncLine({ ...base, sync: { state: "error", lastSyncAt: null, errorKind: "auth" } }).detail).toBe("Нужно войти заново");
    expect(syncLine({ ...base, sync: { state: "idle", lastSyncAt: null } })).toMatchObject({ text: "Ещё не синхронизировано" });
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
    field_defs: empty,
    exercise_sets: empty,
    exercise_runs: empty,
    user_prefs: empty,
    progress_days: empty,
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
    expect(describeBackupImport(result({ exercise_runs: { inserted: 3, updated: 0, skipped: 0, deleted: 0 } }))).toBe(
      "Прогресс и темы обновлены",
    );
  });

  it("lists what a backup import would change", () => {
    expect(
      describeBackupPreview(
        result({
          words: { inserted: 12, updated: 3, skipped: 4, deleted: 1 },
          folders: { inserted: 1, updated: 0, skipped: 7, deleted: 0 },
          review_state: { inserted: 20, updated: 4, skipped: 0, deleted: 0 },
          review_log: { inserted: 31, updated: 0, skipped: 0, deleted: 0 },
          exercise_sets: { inserted: 2, updated: 0, skipped: 0, deleted: 0 },
          exercise_runs: { inserted: 5, updated: 0, skipped: 0, deleted: 0 },
          progress_days: { inserted: 20, updated: 1, skipped: 0, deleted: 0 },
        }),
      ),
    ).toEqual([
      { label: "Слова", text: "12 новых · 2 изменятся · 1 удалится" },
      { label: "Темы", text: "1 новая" },
      { label: "Прогресс", text: "24 карточки" },
      { label: "История", text: "31 ответ" },
      { label: "Упражнения", text: "2 набора" },
      { label: "Прогресс по дням", text: "за 21 день" },
    ]);
    expect(describeBackupPreview(result({}))).toEqual([]);
  });

  it("describes the old-version import", () => {
    expect(describeLegacyImport(3, 8)).toBe("Добавлено 3 слова");
    expect(describeLegacyImport(0, 11)).toBe("Новых слов нет — все уже в библиотеке");
    expect(describeLegacyImport(0, 0)).toBe("В файле не найдено слов");
  });
});

describe("phone index captions", () => {
  it("say the plan, review and exercise values", () => {
    expect(planCaption({ new_words: 8, review_cap: 200, ru_fr: "after" })).toBe("8 новых · до 200 в день");
    expect(planCaption({ new_words: 8, review_cap: null, ru_fr: "after" })).toBe("8 новых в день · без лимита");
    expect(planCaption({ new_words: 21, review_cap: 225, ru_fr: "together" })).toBe("21 новая карточка · до 225 в день");
    expect(planCaption({ new_words: 9, review_cap: 225, ru_fr: "together" })).toBe("9 новых карточек · до 225 в день");
    expect(reviewCaption(DEFAULT_SETTINGS)).toBe("FR → RU · 3 кнопки · свайпы");
    expect(reviewCaption({ default_direction: "ru_fr", grade_buttons: 2, swipe_grading: false })).toBe("RU → FR · 2 кнопки · без свайпов");
    expect(exercisesCaption({ target: "normal", share: "half" })).toBe("Обычно");
    expect(exercisesCaption({ target: "difficult", share: "half" })).toBe("Трудные · половина набора");
  });

  it("say what is off in «ИИ», and both models when they differ", () => {
    expect(aiCaption(DEFAULT_SETTINGS)).toBe("Всё включено · быстрее");
    expect(aiCaption({ ...DEFAULT_SETTINGS, examples_enabled: false, notes_enabled: false, ai_model: "accurate", ai_model_extract: "accurate" })).toBe(
      "Выключено: примеры, заметки · точнее",
    );
    const allOff = { suggestions_enabled: false, slang_detect_enabled: false, examples_enabled: false, auto_sort_enabled: false, notes_enabled: false };
    expect(aiCaption({ ...DEFAULT_SETTINGS, ...allOff, ai_model_extract: "accurate" })).toBe("Всё выключено · подсказки быстрее, скриншоты точнее");
  });

  it("list the fields and map old section links to the sub-screens", () => {
    expect(fieldsCaption([])).toBe("Нет полей");
    expect(fieldsCaption(["Синонимы", "Произношение"])).toBe("Синонимы, Произношение");
    expect(settingsPageForAnchor("#set-data")).toBe("/settings/data");
    expect(settingsPageForAnchor("set-exercises")).toBe("/settings/exercises");
    expect(settingsPageForAnchor("#set-keys")).toBeNull();
  });
});
