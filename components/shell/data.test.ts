import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createFolder, deleteFolder } from "@/lib/folders";
import { addWord, gradeCard } from "@/lib/words";
import { syncLine, type SyncLineInput } from "@/components/settings/format";
import type { ExerciseRun, ExerciseSet } from "@/lib/types";
import { guideWords, loadShellData, loadUnplayedSets, navKeyForPath, resolveNavKey, sidebarSyncLine, unplayedLabel, unplayedSetCount } from "./data";

/** Local noon, 21 Oct 2026. */
const NOON = new Date(2026, 9, 21, 12, 0, 0);
const DAY = 86_400_000;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("guideWords", () => {
  it("names the first and last word, ignoring articles and «se»", () => {
    expect(guideWords(["la thune", "le blé", "le fric", "l'oseille"])).toBe("le blé – la thune");
    expect(guideWords(["les keufs", "les flics"])).toBe("les flics – les keufs");
    expect(guideWords(["se prendre la tête", "kiffer", "chelou"])).toBe("chelou – se prendre la tête");
    expect(guideWords(["un pote", "la meuf"])).toBe("la meuf – un pote");
  });

  it("shows a single word alone and nothing for an empty theme", () => {
    expect(guideWords(["bouffer"])).toBe("bouffer");
    expect(guideWords([])).toBeNull();
  });
});

describe("loadShellData", () => {
  it("counts themes in sort order, «Входящие» with orphans, and words due", async () => {
    const money = await createFolder({ name: "Деньги", color: "#2f6b4f" }, NOON);
    const food = await createFolder({ name: "Еда" }, NOON);
    const gone = await createFolder({ name: "Старое" }, NOON);
    const thune = await addWord({ fr: "la thune", ru: "бабки", folder_id: money.id }, NOON);
    await addWord({ fr: "le blé", ru: "бабки", folder_id: money.id }, NOON);
    await addWord({ fr: "le tromé", ru: "метро" }, NOON);
    await addWord({ fr: "avoir la haine", ru: "беситься", folder_id: gone.id }, NOON);
    await deleteFolder(gone.id, NOON);
    await gradeCard(thune.id, "fr_ru", 1, new Date(NOON.getTime() - 2 * DAY));

    const data = await loadShellData(NOON);
    expect(data.total).toBe(4);
    expect(data.due).toBe(1);
    expect(data.themes.map((t) => [t.name, t.count, t.guide])).toEqual([
      ["Деньги", 2, "le blé – la thune"],
      ["Еда", 0, null],
    ]);
    expect(data.themes[0]).toMatchObject({ id: money.id, color: "#2f6b4f", href: `/library/${money.id}` });
    expect(data.themes[1].id).toBe(food.id);
    expect(data.inbox).toMatchObject({ id: null, name: "Входящие", color: null, count: 2, guide: "avoir la haine – le tromé", href: "/library/inbox" });
  });
});

describe("unplayed sets («Упражнения» count)", () => {
  const set = (id: string, created_at: string, deleted_at: string | null = null): ExerciseSet => ({
    id,
    title: `Набор ${id}`,
    topic: null,
    folders: [],
    items: [],
    new_words: [],
    scope: null,
    level: null,
    level_auto: false,
    source: "claude",
    created_at,
    updated_at: created_at,
    deleted_at,
  });
  const run = (id: string, set_id: string, kind: ExerciseRun["kind"] = "set", finished = false): ExerciseRun => ({
    id,
    set_id,
    kind,
    item_ids: [],
    started_at: NOON.toISOString(),
    finished_at: finished ? NOON.toISOString() : null,
    answers: [],
    total: 8,
    first_try: 0,
    updated_at: NOON.toISOString(),
    deleted_at: null,
  });

  it("counts live sets without a run, played or interrupted ones aside", async () => {
    const iso = NOON.toISOString();
    await db.exercise_sets.bulkPut([set("a", iso), set("b", iso), set("c", iso), set("gone", iso, iso)]);
    await db.exercise_runs.bulkPut([run("r1", "a", "set", true), run("r2", "b")]);
    expect(await loadUnplayedSets()).toBe(1);
  });

  it("is zero with no sets", async () => {
    expect(await loadUnplayedSets()).toBe(0);
    expect(unplayedSetCount([{ id: "a" }, { id: "b" }], new Map([["a", null]]))).toBe(1);
  });

  it("names the count with the Russian plural", () => {
    expect(unplayedLabel(1)).toBe("1 новый набор");
    expect(unplayedLabel(2)).toBe("2 новых набора");
    expect(unplayedLabel(5)).toBe("5 новых наборов");
    expect(unplayedLabel(21)).toBe("21 новый набор");
  });
});

describe("navKeyForPath", () => {
  it("activates exactly one item per route", () => {
    expect(navKeyForPath("/")).toBe("review");
    expect(navKeyForPath("/library")).toBe("library");
    expect(navKeyForPath("/library/inbox")).toBe("inbox");
    expect(navKeyForPath("/library/abc-1")).toBe("theme:abc-1");
    expect(navKeyForPath("/import")).toBe("import");
    expect(navKeyForPath("/context")).toBe("context");
    expect(navKeyForPath("/progress")).toBe("progress");
    expect(navKeyForPath("/exercises")).toBe("exercises");
    expect(navKeyForPath("/exercises/play")).toBe("exercises");
    expect(navKeyForPath("/settings")).toBe("settings");
    expect(navKeyForPath("/login")).toBeNull();
    expect(navKeyForPath(null)).toBeNull();
  });

  it("falls back to «Библиотека» for an unknown theme", () => {
    const themes = [{ id: "a" }];
    expect(resolveNavKey("theme:a", themes)).toBe("theme:a");
    expect(resolveNavKey("theme:b", themes)).toBe("library");
    expect(resolveNavKey("theme:b", undefined)).toBe("theme:b");
    expect(resolveNavKey("inbox", themes)).toBe("inbox");
  });
});

describe("sidebarSyncLine", () => {
  const signedIn = { status: "signed_in" as const, email: "n.drobyshevski@pm.me" };
  const now = new Date(2026, 9, 21, 14, 5).getTime();
  const line = (sync: SyncLineInput["sync"], auth: SyncLineInput["auth"] = signedIn) => sidebarSyncLine(auth.status, syncLine({ auth, sync, nowMs: now }));

  it("is hidden without sync", () => {
    expect(line({ state: "disabled", lastSyncAt: null }, { status: "local", email: null })).toBeNull();
    expect(line({ state: "disabled", lastSyncAt: null }, { status: "signed_out", email: null })).toBeNull();
  });

  it("mirrors Settings: the states of T5, a dot only for «нет сети» and a failure", () => {
    expect(line({ state: "idle", lastSyncAt: new Date(2026, 9, 21, 14, 2).toISOString() })).toEqual({
      text: "Синхронизировано · 14:02",
      dot: null,
      detail: null,
      canSync: true,
    });
    expect(line({ state: "syncing", lastSyncAt: null })).toMatchObject({ text: "Синхронизация…", dot: null, canSync: false });
    expect(line({ state: "offline", lastSyncAt: null })).toMatchObject({ text: "Нет сети · изменения сохранятся", dot: "muted" });
    expect(
      line({ state: "error", lastSyncAt: null, errorKind: "server", errorAt: new Date(2026, 9, 21, 14, 5).toISOString() }),
    ).toEqual({ text: "Не синхронизировано · Повторить", dot: "again", detail: "Сервер не ответил · 14:05", canSync: true });
  });
});
