import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssignRequest, AssignResponse } from "./ai/schemas";
import { db } from "./db";
import { createFolder, disbandFolder, getFolder, restoreFolder } from "./folders";
import {
  applyDisband,
  buildDisbandPlan,
  buildDisbandRequests,
  disbandGroups,
  disbandTargets,
  loadReorgSnapshot,
  retargetDisband,
  runDisband,
} from "./reorg";
import type { Folder, Word } from "./types";
import { addWords, moveWords } from "./words";

const T0 = new Date("2026-10-22T10:00:00.000Z");
const T1 = new Date("2026-10-22T10:05:00.000Z");
const T2 = new Date("2026-10-22T10:10:00.000Z");

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

interface Fixture {
  mix: Folder;
  money: Folder;
  people: Folder;
  words: Record<string, Word>;
}

async function fixture(): Promise<Fixture> {
  const mix = await createFolder({ name: "Разное" }, T0);
  const money = await createFolder({ name: "Деньги" }, T0);
  const people = await createFolder({ name: "Люди" }, T0);
  const list = await addWords(
    [
      { fr: "la thune", ru: "бабки", folder_id: mix.id, folder_source: "user" },
      { fr: "le fric", ru: "бабло", folder_id: mix.id, folder_source: "auto" },
      { fr: "la meuf", ru: "девушка", folder_id: mix.id, folder_source: "auto" },
      { fr: "chelou", ru: "странный", folder_id: mix.id, folder_source: "auto" },
      { fr: "le blé", ru: "бабки", folder_id: money.id, folder_source: "user" },
      { fr: "un pote", ru: "друг", folder_id: people.id, folder_source: "auto" },
    ],
    T0,
  );
  return { mix, money, people, words: Object.fromEntries(list.map((w) => [w.fr, w])) };
}

describe("disband plan", () => {
  it("asks about every word of the theme, hand-placed ones too, against the other themes", async () => {
    const f = await fixture();
    const snap = await loadReorgSnapshot();
    const targets = disbandTargets(snap, f.mix.id);
    expect(targets.map((t) => t.name)).toEqual(["Деньги", "Люди"]);
    const [req, ...rest] = buildDisbandRequests(snap, f.mix.id, targets);
    expect(rest).toEqual([]);
    expect(req.words.map((w) => w.fr).sort()).toEqual(["chelou", "la meuf", "la thune", "le fric"]);
    expect(req.folders.map((x) => x.name)).toEqual(["Деньги", "Люди"]);
    expect(req.examples).toEqual([{ fr: "le blé", ru: "бабки", folder: f.money.slug }]);
  });

  it("sends INBOX, low confidence and missing answers to «Входящие»", async () => {
    const f = await fixture();
    const snap = await loadReorgSnapshot();
    const targets = disbandTargets(snap, f.mix.id);
    const plan = buildDisbandPlan(snap, f.mix.id, targets, [
      { id: f.words["la thune"].id, folder: f.money.slug, confidence: "high" },
      { id: f.words["le fric"].id, folder: f.money.slug, confidence: "low" },
      { id: f.words["la meuf"].id, folder: f.people.slug, confidence: "med" },
    ]);
    expect(plan.name).toBe("Разное");
    const to = Object.fromEntries(plan.moves.map((m) => [m.word.fr, m.to]));
    expect(to).toEqual({ "la thune": f.money.id, "le fric": null, "la meuf": f.people.id, chelou: null });

    const groups = disbandGroups(plan);
    expect(groups.map((g) => [g.folder?.name ?? "Входящие", g.moves.length])).toEqual([
      ["Деньги", 1],
      ["Люди", 1],
      ["Входящие", 2],
    ]);

    const edited = retargetDisband(plan, f.words.chelou.id, f.people.id);
    expect(edited.moves.find((m) => m.word.fr === "chelou")).toMatchObject({ to: f.people.id, edited: true, confidence: null });
  });

  it("runs pass B only and reports progress", async () => {
    const f = await fixture();
    const calls: AssignRequest[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as AssignRequest;
      calls.push(body);
      const res: AssignResponse = {
        assignments: body.words.map((w) => ({ id: w.id, folder: w.ru.startsWith("баб") ? f.money.slug : "INBOX", confidence: "high" })),
      };
      return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    const progress: number[] = [];
    const plan = await runDisband(f.mix.id, { fetchImpl, model: "fast", onProgress: (d) => progress.push(d) });
    expect(calls.map((c) => c.mode)).toEqual(["assign"]);
    expect(calls[0].model).toBe("fast");
    expect(progress).toEqual([0, 1]);
    expect(plan.moves.filter((m) => m.to === f.money.id).map((m) => m.word.fr).sort()).toEqual(["la thune", "le fric"]);
  });

  it("does not call the server when there is no other theme", async () => {
    const solo = await createFolder({ name: "Одна" }, T0);
    await addWords([{ fr: "a", ru: "1", folder_id: solo.id }], T0);
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const plan = await runDisband(solo.id, { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(plan.moves.map((m) => m.to)).toEqual([null]);
  });
});

describe("applying and undoing", () => {
  it("moves the words, deletes the theme, and the undo puts both back", async () => {
    const f = await fixture();
    const snap = await loadReorgSnapshot();
    let plan = buildDisbandPlan(snap, f.mix.id, disbandTargets(snap, f.mix.id), [
      { id: f.words["la thune"].id, folder: f.money.slug, confidence: "high" },
      { id: f.words["le fric"].id, folder: f.money.slug, confidence: "med" },
    ]);
    plan = retargetDisband(plan, f.words["la meuf"].id, f.people.id);

    const moves = await applyDisband(plan, T1);
    expect(moves).toHaveLength(4);
    expect(await getFolder(f.mix.id)).toBeUndefined();
    const after = async (fr: string) => (await db.words.get(f.words[fr].id))!;
    expect(await after("la thune")).toMatchObject({ folder_id: f.money.id, folder_source: "auto", folder_confidence: "high" });
    expect(await after("le fric")).toMatchObject({ folder_id: f.money.id, folder_confidence: "med" });
    expect(await after("la meuf")).toMatchObject({ folder_id: f.people.id, folder_source: "user", folder_confidence: null });
    expect(await after("chelou")).toMatchObject({ folder_id: null });

    // The user moves one word before undoing: it stays where they put it.
    await moveWords([f.words["le fric"].id], f.people.id, {}, T2);
    await restoreFolder(f.mix.id, moves!, T2);
    expect(await getFolder(f.mix.id)).toBeDefined();
    expect(await after("la thune")).toMatchObject({ folder_id: f.mix.id, folder_source: "user" });
    expect(await after("la meuf")).toMatchObject({ folder_id: f.mix.id, folder_source: "auto" });
    expect(await after("chelou")).toMatchObject({ folder_id: f.mix.id });
    expect(await after("le fric")).toMatchObject({ folder_id: f.people.id });
  });

  it("sends words added since the plan, or aimed at a theme deleted since, to «Входящие»", async () => {
    const f = await fixture();
    const [late] = await addWords([{ fr: "tard", ru: "поздно", folder_id: f.mix.id }], T1);
    const moves = await disbandFolder(
      f.mix.id,
      [{ wordId: f.words["la thune"].id, to: "gone", source: "auto", confidence: "high" }],
      T1,
    );
    expect(moves).toHaveLength(5);
    expect((await db.words.get(late.id))!.folder_id).toBeNull();
    expect((await db.words.get(f.words["la thune"].id))!.folder_id).toBeNull();
    expect(await disbandFolder(f.mix.id, [], T2)).toBeNull();
  });
});
