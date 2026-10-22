import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createFolder, deleteFolder } from "@/lib/folders";
import { addWord, gradeCard } from "@/lib/words";
import { guideWords, loadShellData, navKeyForPath, resolveNavKey, sidebarSyncLine } from "./data";

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

describe("navKeyForPath", () => {
  it("activates exactly one item per route", () => {
    expect(navKeyForPath("/")).toBe("review");
    expect(navKeyForPath("/library")).toBe("library");
    expect(navKeyForPath("/library/inbox")).toBe("inbox");
    expect(navKeyForPath("/library/abc-1")).toBe("theme:abc-1");
    expect(navKeyForPath("/import")).toBe("import");
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
  const now = Date.parse("2026-10-21T12:00:00Z");

  it("is hidden without sync", () => {
    expect(sidebarSyncLine({ auth: { status: "local", email: null }, sync: { state: "disabled", lastSyncAt: null }, nowMs: now })).toBeNull();
    expect(sidebarSyncLine({ auth: { status: "signed_out", email: null }, sync: { state: "disabled", lastSyncAt: null }, nowMs: now })).toBeNull();
  });

  it("mirrors Settings without the account", () => {
    expect(sidebarSyncLine({ auth: signedIn, sync: { state: "idle", lastSyncAt: "2026-10-21T11:59:50Z" }, nowMs: now })).toEqual({
      text: "Синхронизация · только что",
      dot: null,
      canSync: true,
    });
    expect(sidebarSyncLine({ auth: signedIn, sync: { state: "syncing", lastSyncAt: null }, nowMs: now })).toEqual({
      text: "Синхронизация…",
      dot: null,
      canSync: false,
    });
    expect(sidebarSyncLine({ auth: signedIn, sync: { state: "offline", lastSyncAt: null }, nowMs: now })).toMatchObject({
      text: "Синхронизация · нет сети",
      dot: "muted",
    });
    expect(sidebarSyncLine({ auth: signedIn, sync: { state: "error", lastSyncAt: null }, nowMs: now })).toMatchObject({
      text: "Синхронизация · ошибка",
      dot: "again",
    });
  });
});
