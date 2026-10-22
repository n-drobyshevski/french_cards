import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssignRequest, AssignResponse, TaxonomyRequest, TaxonomyResponse } from "./ai/schemas";
import { db } from "./db";
import { createFolder, listFolders } from "./folders";
import {
  ASSIGN_EXAMPLES_MAX,
  applyPlan,
  assignTargets,
  buildAssignRequests,
  buildPlan,
  buildTaxonomyRequest,
  effectiveMoves,
  getUndoableRun,
  INBOX_KEY,
  keepGroupOrder,
  loadReorgSnapshot,
  newTargetKey,
  pickableTargets,
  planGroups,
  planSummary,
  postClassify,
  ReorgError,
  reorgFraction,
  type ReorgProgress,
  retargetMove,
  runReorg,
  setTargetEnabled,
  STAY_KEY,
  undoReorgRun,
  type PlanGroup,
  type ReorgPlan,
  type ReorgSnapshot,
} from "./reorg";
import type { Folder, Word } from "./types";
import { addWord, addWords, moveWords, softDeleteWord, updateWord } from "./words";

const T0 = new Date("2026-10-21T10:00:00.000Z");
const T1 = new Date("2026-10-21T10:05:00.000Z");
const T2 = new Date("2026-10-21T10:10:00.000Z");
const DAY = 86_400_000;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

interface Fixture {
  money: Folder;
  people: Folder;
  locked: Folder;
  words: Record<string, Word>;
}

async function fixture(): Promise<Fixture> {
  const money = await createFolder({ name: "Деньги", description: "Деньги и покупки" }, T0);
  const people = await createFolder({ name: "Люди", created_by: "auto" }, T0);
  const locked = await createFolder({ name: "Полиция", locked: true }, T0);
  const list = await addWords(
    [
      { fr: "le pognon", ru: "бабки" },
      { fr: "les ronds", ru: "гроши" },
      { fr: "être raide", ru: "быть на мели" },
      { fr: "la caisse", ru: "тачка" },
      { fr: "le tromé", ru: "метро" },
      { fr: "la bécane", ru: "мотик" },
      { fr: "le daron", ru: "батя", folder_id: people.id, folder_source: "auto" },
      { fr: "la thune", ru: "бабки, деньги", folder_id: money.id, folder_source: "user" },
      { fr: "les keufs", ru: "менты", folder_id: locked.id, folder_source: "auto" },
      { fr: "le blé", ru: "бабки", folder_id: money.id, folder_source: "auto" },
    ],
    T0,
  );
  return { money, people, locked, words: Object.fromEntries(list.map((w) => [w.fr, w])) };
}

const taxonomyFor = (f: Fixture, extra: TaxonomyResponse["folders"] = []): TaxonomyResponse => ({
  folders: [
    { slug: f.money.slug, name: "Деньги", description: "Деньги и покупки", status: "keep", example_ids: [] },
    { slug: f.people.slug, name: "Люди", description: "Семья и друзья", status: "update", example_ids: [] },
    { slug: f.locked.slug, name: "Полиция", description: "", status: "keep", example_ids: [] },
    ...extra,
  ],
  removed: [],
});

const transport = (f: Fixture): TaxonomyResponse["folders"][number] => ({
  slug: "transport",
  name: "Транспорт",
  description: "Машины, метро, мотоциклы",
  status: "new",
  example_ids: [f.words["la caisse"].id, f.words["le tromé"].id, f.words["la bécane"].id],
});

async function planFor(f: Fixture, assign: Record<string, string>, extra?: TaxonomyResponse["folders"]) {
  const snap = await loadReorgSnapshot();
  const targets = assignTargets(snap, taxonomyFor(f, extra));
  const assignments = Object.entries(assign).map(([fr, folder]) => ({
    id: f.words[fr].id,
    folder,
    confidence: "high" as const,
  }));
  return { snap, targets, plan: buildPlan(snap, targets, assignments, T1) };
}

describe("requests", () => {
  it("sends every live word to pass A, movable words first, with folder slugs and folder flags", async () => {
    const f = await fixture();
    const body = buildTaxonomyRequest(await loadReorgSnapshot());
    expect(body.mode).toBe("taxonomy");
    expect(body.words).toHaveLength(10);
    const thune = body.words.findIndex((w) => w.id === f.words["la thune"].id);
    const pognon = body.words.findIndex((w) => w.id === f.words["le pognon"].id);
    expect(pognon).toBeLessThan(thune);
    expect(body.words[thune].folder).toBe(f.money.slug);
    expect(body.words[pognon].folder).toBeNull();
    expect(body.folders.find((x) => x.slug === f.locked.slug)).toMatchObject({ locked: true, created_by: "user" });
    expect(body.folders.find((x) => x.slug === f.people.slug)).toMatchObject({ locked: false, created_by: "auto" });
  });

  it("clips long text to the route limits", async () => {
    await addWord({ fr: "x".repeat(200), ru: "я".repeat(300), note: "n".repeat(400) }, T0);
    const snap = await loadReorgSnapshot();
    const body = buildTaxonomyRequest(snap);
    expect(body.words[0].fr).toHaveLength(120);
    expect(body.words[0].ru).toHaveLength(160);
    const [assign] = buildAssignRequests(snap, [{ slug: "dengi", name: "Деньги", description: null, folderId: "x" }]);
    expect(assign.words[0].note).toHaveLength(300);
  });

  it("pass B skips hand-placed and locked-folder words, chunks by 150 and uses hand-placed words as examples", async () => {
    const f = await fixture();
    await addWords(
      Array.from({ length: 300 }, (_, i) => ({ fr: `mot ${i}`, ru: `слово ${i}` })),
      T0,
    );
    const snap = await loadReorgSnapshot();
    const targets = assignTargets(snap, taxonomyFor(f, [transport(f)]));
    const reqs = buildAssignRequests(snap, targets);
    expect(reqs.map((r) => r.words.length)).toEqual([150, 150, 8]);
    const ids = reqs.flatMap((r) => r.words.map((w) => w.id));
    expect(ids).not.toContain(f.words["la thune"].id);
    expect(ids).not.toContain(f.words["les keufs"].id);
    expect(ids).toContain(f.words["le blé"].id);
    expect(reqs[0].examples).toEqual([{ fr: "la thune", ru: "бабки, деньги", folder: f.money.slug }]);
    expect(reqs[0].folders.map((x) => x.slug)).toEqual([f.money.slug, f.people.slug, f.locked.slug, "transport"]);
    // A refined description from pass A is used as context; the name stays.
    expect(reqs[0].folders[1]).toMatchObject({ name: "Люди", description: "Семья и друзья" });
  });

  it("caps examples and spreads them across folders", async () => {
    const f = await fixture();
    await addWords(
      Array.from({ length: 120 }, (_, i) => ({
        fr: `argent ${i}`,
        ru: `деньги ${i}`,
        folder_id: i % 2 ? f.money.id : f.people.id,
        folder_source: "user" as const,
      })),
      T0,
    );
    const snap = await loadReorgSnapshot();
    const [req] = buildAssignRequests(snap, assignTargets(snap, taxonomyFor(f)));
    expect(req.examples).toHaveLength(ASSIGN_EXAMPLES_MAX);
    expect(new Set(req.examples!.slice(0, 2).map((e) => e.folder)).size).toBe(2);
  });

  it("drops a proposed theme whose name is already taken", async () => {
    const f = await fixture();
    const snap = await loadReorgSnapshot();
    const targets = assignTargets(snap, taxonomyFor(f, [{ ...transport(f), slug: "dengi-2", name: "деньги" }]));
    expect(targets.map((t) => t.slug)).not.toContain("dengi-2");
  });
});

describe("buildPlan", () => {
  it("builds moves grouped by target and never moves protected words", async () => {
    const f = await fixture();
    const { plan } = await planFor(
      f,
      {
        "le pognon": f.money.slug,
        "les ronds": f.money.slug,
        "être raide": f.money.slug,
        "la caisse": "transport",
        "le tromé": "transport",
        "la bécane": "transport",
        "le daron": f.people.slug, // already there: no move
        "la thune": f.people.slug, // placed by hand: ignored
        "les keufs": f.money.slug, // locked folder: ignored
        "le blé": "INBOX", // INBOX never pulls a word out of a theme
      },
      [transport(f)],
    );
    const groups = planGroups(plan);
    expect(groups.map((g) => [g.target.name, g.moves.length])).toEqual([
      ["Деньги", 3],
      ["Транспорт", 3],
    ]);
    expect(groups[1].target).toMatchObject({ kind: "new", key: newTargetKey("transport") });
    expect(groups[1].target.color).toMatch(/^#/);
    expect(plan.protectedWords).toBe(2);
    expect(planSummary(plan)).toEqual({ total: 6, apply: 6, newFolders: 1, applyNewFolders: 1 });
  });

  it("only proposes a new theme that gets at least 3 words", async () => {
    const f = await fixture();
    const { plan } = await planFor(f, { "la caisse": "transport", "le tromé": "transport", "le pognon": f.money.slug }, [
      transport(f),
    ]);
    expect(plan.targets.some((t) => t.kind === "new")).toBe(false);
    expect(plan.moves.map((m) => m.word.fr)).toEqual(["le pognon"]);
  });

  it("ignores unknown slugs, unknown ids and duplicate answers", async () => {
    const f = await fixture();
    const snap = await loadReorgSnapshot();
    const targets = assignTargets(snap, taxonomyFor(f));
    const plan = buildPlan(
      snap,
      targets,
      [
        { id: f.words["le pognon"].id, folder: "nope", confidence: "high" },
        { id: "missing", folder: f.money.slug, confidence: "high" },
        { id: f.words["les ronds"].id, folder: f.money.slug, confidence: "med" },
        { id: f.words["les ronds"].id, folder: f.people.slug, confidence: "high" },
      ],
      T1,
    );
    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0]).toMatchObject({ to: f.money.id, confidence: "med" });
  });
});

describe("plan editing", () => {
  it("toggles a group off and back on", async () => {
    const f = await fixture();
    const { plan } = await planFor(f, { "le pognon": f.money.slug, "le blé": f.people.slug });
    const off = setTargetEnabled(plan, f.people.id, false);
    expect(planSummary(off)).toMatchObject({ total: 2, apply: 1 });
    expect(planGroups(off).find((g) => g.target.key === f.people.id)?.enabled).toBe(false);
    expect(planSummary(setTargetEnabled(off, f.people.id, true)).apply).toBe(2);
  });

  it("retargets a word, keeps it in place when its own folder is picked, and re-enables a switched-off target", async () => {
    const f = await fixture();
    const { plan } = await planFor(f, { "le pognon": f.money.slug, "le blé": f.people.slug });
    const blé = f.words["le blé"].id;

    const stay = retargetMove(plan, blé, f.money.id); // its current folder
    expect(stay.moves.find((m) => m.word.id === blé)).toMatchObject({ to: STAY_KEY, edited: true });
    expect(planGroups(stay).at(-1)?.target.kind).toBe("stay");
    expect(planSummary(stay)).toMatchObject({ total: 1, apply: 1 });

    const inbox = retargetMove(setTargetEnabled(stay, INBOX_KEY, false), blé, INBOX_KEY);
    expect(inbox.moves.find((m) => m.word.id === blé)?.to).toBe(INBOX_KEY);
    expect(inbox.disabled).not.toContain(INBOX_KEY);

    expect(retargetMove(plan, blé, "nope")).toBe(plan);
    const pickable = pickableTargets(plan, plan.moves.find((m) => m.word.id === blé)!);
    expect(pickable.map((t) => t.key)).not.toContain(f.money.id);
  });

  it("marks a new theme that drops under 3 words as too small and leaves it out", async () => {
    const f = await fixture();
    const { plan } = await planFor(
      f,
      { "la caisse": "transport", "le tromé": "transport", "la bécane": "transport", "le pognon": f.money.slug },
      [transport(f)],
    );
    const edited = retargetMove(plan, f.words["la bécane"].id, STAY_KEY);
    const group = planGroups(edited).find((g) => g.target.kind === "new")!;
    expect(group.tooSmall).toBe(true);
    expect(planSummary(edited)).toMatchObject({ apply: 1, newFolders: 0 });
    expect(effectiveMoves(edited).map((m) => m.word.fr)).toEqual(["le pognon"]);
  });
});

describe("applyPlan and undo", () => {
  it("creates new themes, moves words and records a run that undo reverts", async () => {
    const f = await fixture();
    const { plan } = await planFor(
      f,
      {
        "le pognon": f.money.slug,
        "les ronds": f.money.slug,
        "la caisse": "transport",
        "le tromé": "transport",
        "la bécane": "transport",
        "le blé": f.people.slug,
      },
      [transport(f)],
    );
    const edited = retargetMove(plan, f.words["les ronds"].id, f.people.id);
    await db.outbox.clear();

    const run = (await applyPlan(edited, T1))!;
    expect(run.moves).toHaveLength(6);
    expect(run.created_folders).toHaveLength(1);
    const created = (await db.folders.get(run.created_folders[0]))!;
    expect(created).toMatchObject({ name: "Транспорт", created_by: "auto", deleted_at: null });
    expect(created.color).toBe(plan.targets.find((t) => t.kind === "new")!.color);

    const pognon = (await db.words.get(f.words["le pognon"].id))!;
    expect(pognon).toMatchObject({ folder_id: f.money.id, folder_source: "auto", folder_confidence: "high" });
    const ronds = (await db.words.get(f.words["les ronds"].id))!;
    expect(ronds).toMatchObject({ folder_id: f.people.id, folder_source: "user", folder_confidence: null });
    expect((await db.words.get(f.words["la caisse"].id))!.folder_id).toBe(created.id);
    expect((await db.reorg_runs.get(run.id))!.applied_at).toBe(T1.toISOString());
    const queued = (await db.outbox.toArray()).map((o) => o.table);
    expect(queued).toEqual(expect.arrayContaining(["words", "folders", "reorg_runs"]));
    expect(await getUndoableRun(T2)).toMatchObject({ id: run.id });

    const undo = await undoReorgRun(run.id, T2);
    expect(undo).toEqual({ restored: 6, removedFolders: 1 });
    expect(await db.words.get(f.words["le pognon"].id)).toMatchObject({ folder_id: null, folder_source: "auto" });
    expect(await db.words.get(f.words["le blé"].id)).toMatchObject({
      folder_id: f.money.id,
      folder_source: "auto",
      folder_confidence: null,
    });
    expect((await db.folders.get(created.id))!.deleted_at).toBe(T2.toISOString());
    expect((await db.reorg_runs.get(run.id))!.deleted_at).toBe(T2.toISOString());
    expect(await getUndoableRun(T2)).toBeUndefined();
    expect(await undoReorgRun(run.id, T2)).toEqual({ restored: 0, removedFolders: 0 });
  });

  it("skips disabled groups and words changed since the plan was made", async () => {
    const f = await fixture();
    const { plan } = await planFor(f, {
      "le pognon": f.money.slug,
      "les ronds": f.money.slug,
      "être raide": f.money.slug,
      "le blé": f.people.slug,
    });
    await moveWords([f.words["les ronds"].id], f.people.id, {}, T1); // moved by hand meanwhile
    await softDeleteWord(f.words["être raide"].id, T1);
    const run = (await applyPlan(setTargetEnabled(plan, f.people.id, false), T2))!;
    expect(run.moves.map((m) => m.word_id)).toEqual([f.words["le pognon"].id]);
    expect((await db.words.get(f.words["le blé"].id))!.folder_id).toBe(f.money.id);
    expect((await db.words.get(f.words["les ronds"].id))!.folder_id).toBe(f.people.id);
  });

  it("returns null and writes nothing when nothing is left to apply", async () => {
    const f = await fixture();
    const { plan } = await planFor(f, { "le pognon": f.money.slug });
    expect(await applyPlan(setTargetEnabled(plan, f.money.id, false), T1)).toBeNull();
    expect(await db.reorg_runs.count()).toBe(0);
  });

  it("reuses an existing theme with the same name instead of creating a duplicate", async () => {
    const f = await fixture();
    const { plan } = await planFor(
      f,
      { "la caisse": "transport", "le tromé": "transport", "la bécane": "transport" },
      [transport(f)],
    );
    const same = await createFolder({ name: "транспорт" }, T1);
    const run = (await applyPlan(plan, T2))!;
    expect(run.created_folders).toEqual([]);
    expect((await db.words.get(f.words["la caisse"].id))!.folder_id).toBe(same.id);
  });

  it("undo leaves words the user moved since, and keeps a created theme that still holds words", async () => {
    const f = await fixture();
    const { plan } = await planFor(
      f,
      { "la caisse": "transport", "le tromé": "transport", "la bécane": "transport", "le pognon": f.money.slug },
      [transport(f)],
    );
    const run = (await applyPlan(plan, T1))!;
    const created = run.created_folders[0];
    await updateWord(f.words["le pognon"].id, { folder_id: f.people.id }, T1);
    await addWord({ fr: "le scooter", ru: "скутер", folder_id: created, folder_source: "user" }, T1);

    const undo = await undoReorgRun(run.id, T2);
    expect(undo).toEqual({ restored: 3, removedFolders: 0 });
    expect((await db.words.get(f.words["le pognon"].id))!.folder_id).toBe(f.people.id);
    expect((await listFolders()).some((x) => x.id === created)).toBe(true);
  });

  it("undo sends words whose old folder is gone to «Входящие»", async () => {
    const f = await fixture();
    const { plan } = await planFor(f, { "le blé": f.people.slug });
    const run = (await applyPlan(plan, T1))!;
    await db.folders.put({ ...f.money, deleted_at: T1.toISOString(), updated_at: T1.toISOString() });
    await undoReorgRun(run.id, T2);
    expect(await db.words.get(f.words["le blé"].id)).toMatchObject({ folder_id: null, folder_confidence: null });
  });

  it("offers undo for 7 days only", async () => {
    const f = await fixture();
    const { plan } = await planFor(f, { "le pognon": f.money.slug });
    const run = (await applyPlan(plan, T1))!;
    expect(await getUndoableRun(new Date(T1.getTime() + 6 * DAY))).toMatchObject({ id: run.id });
    expect(await getUndoableRun(new Date(T1.getTime() + 8 * DAY))).toBeUndefined();
  });
});

describe("network", () => {
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

  it("runs both passes and builds the plan", async () => {
    const f = await fixture();
    const calls: (TaxonomyRequest | AssignRequest)[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as TaxonomyRequest | AssignRequest;
      calls.push(body);
      if (body.mode === "taxonomy") return json(taxonomyFor(f, [transport(f)]));
      const res: AssignResponse = {
        assignments: body.words.map((w) => ({
          id: w.id,
          folder: ["la caisse", "le tromé", "la bécane"].includes(w.fr) ? "transport" : "INBOX",
          confidence: "high",
        })),
      };
      return json(res);
    }) as unknown as typeof fetch;
    const progress: number[] = [];
    const plan = await runReorg({ fetchImpl, now: T1, onProgress: (d) => progress.push(d) });
    expect(calls.map((c) => c.mode)).toEqual(["taxonomy", "assign"]);
    expect(planSummary(plan)).toMatchObject({ total: 3, newFolders: 1 });
    expect(progress).toEqual([0, 1]);
  });

  it("reports the taxonomy pass and every assign batch through onStage", async () => {
    const f = await fixture();
    // 8 movable words in the fixture + 150 more → two assign batches (150 + 8).
    await addWords(
      Array.from({ length: 150 }, (_, i) => ({ fr: `mot ${i}`, ru: `слово ${i}` })),
      T0,
    );
    const movable = 8 + 150;
    const stages: ReorgProgress[] = [];
    let taxonomySeen = false;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as TaxonomyRequest | AssignRequest;
      if (body.mode === "taxonomy") {
        // The sheet shows «01 Темы · ИДЁТ» before the first request returns.
        taxonomySeen = stages.length === 1 && stages[0].stage === "taxonomy";
        return json(taxonomyFor(f));
      }
      return json({ assignments: body.words.map((w) => ({ id: w.id, folder: "INBOX", confidence: "high" })) });
    }) as unknown as typeof fetch;

    await runReorg({ fetchImpl, now: T1, model: "fast", onStage: (p) => stages.push(p) });

    expect(taxonomySeen).toBe(true);
    expect(stages[0]).toEqual({ stage: "taxonomy", words: movable, wordsDone: 0, done: 0, total: 0 });
    expect(stages[1]).toEqual({ stage: "assign", words: movable, wordsDone: 0, done: 0, total: 2 });
    expect(stages).toHaveLength(4);
    expect(stages.slice(2).map((p) => p.done)).toEqual([1, 2]);
    expect(stages[3]).toMatchObject({ wordsDone: movable, done: 2, total: 2 });
    // Never backwards.
    const fractions = stages.map(reorgFraction);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
    expect(fractions[0]).toBe(0);
    expect(fractions[1]).toBeCloseTo(0.2);
    expect(fractions[2]).toBeCloseTo(0.6);
    expect(fractions[3]).toBe(1);
  });

  it("hands out the groups so far after every assign batch (onGroups)", async () => {
    const f = await fixture();
    await addWords(
      Array.from({ length: 150 }, (_, i) => ({ fr: `mot ${i}`, ru: `слово ${i}` })),
      T0,
    );
    const partials: ReorgPlan[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as TaxonomyRequest | AssignRequest;
      if (body.mode === "taxonomy") return json(taxonomyFor(f, [transport(f)]));
      return json({
        assignments: body.words.map((w) => ({
          id: w.id,
          folder: ["la caisse", "le tromé", "la bécane"].includes(w.fr) ? "transport" : w.fr.startsWith("mot ") ? f.money.slug : "INBOX",
          confidence: "high",
        })),
      });
    }) as unknown as typeof fetch;

    const plan = await runReorg({ fetchImpl, now: T1, model: "fast", onGroups: (p) => partials.push(p) });

    expect(partials).toHaveLength(2);
    // Each partial holds only the words answered so far; the last one is the final plan.
    expect(partials[0].moves.length).toBeLessThan(partials[1].moves.length);
    expect(partials[1]).toEqual(plan);
    expect(planSummary(plan)).toMatchObject({ total: 153, newFolders: 1 });
  });

  it("keepGroupOrder: groups keep the order they first appeared in", () => {
    const group = (key: string, n: number) =>
      ({ target: { key }, moves: Array.from({ length: n }), enabled: true, tooSmall: false }) as unknown as PlanGroup;
    const first = keepGroupOrder([group("a", 2), group("b", 1)], []);
    expect(first.groups.map((g) => g.target.key)).toEqual(["a", "b"]);
    expect(first.seen).toEqual(["a", "b"]);
    // «b» outgrew «a» and «c» is new: the known ones stay put, the new one goes last.
    const second = keepGroupOrder([group("b", 5), group("c", 3), group("a", 2)], first.seen);
    expect(second.groups.map((g) => g.target.key)).toEqual(["a", "b", "c"]);
    expect(second.seen).toEqual(["a", "b", "c"]);
    // Nothing new: the same order array comes back.
    expect(keepGroupOrder([group("a", 2)], second.seen).seen).toBe(second.seen);
  });

  it("reports nothing when no word can move", async () => {
    const f = await fixture();
    const snap: ReorgSnapshot = { folders: [f.money], words: [(await db.words.get(f.words["la thune"].id))!] };
    const onStage = vi.fn();
    await runReorg({ fetchImpl: vi.fn() as unknown as typeof fetch, snapshot: snap, onStage });
    expect(onStage).not.toHaveBeenCalled();
  });

  it("reorgFraction: 0 during the taxonomy pass, 20 % after it, full when there is nothing to assign", () => {
    const base = { words: 48, wordsDone: 0 };
    expect(reorgFraction({ ...base, stage: "taxonomy", done: 0, total: 0 })).toBe(0);
    expect(reorgFraction({ ...base, stage: "assign", done: 0, total: 4 })).toBeCloseTo(0.2);
    expect(reorgFraction({ ...base, stage: "assign", done: 2, total: 4 })).toBeCloseTo(0.6);
    expect(reorgFraction({ ...base, stage: "assign", done: 0, total: 0 })).toBe(1);
  });

  it("returns an empty plan without calling the server when nothing can move", async () => {
    const f = await fixture();
    await updateWord(f.words["le pognon"].id, { folder_id: f.money.id }, T0);
    const snap: ReorgSnapshot = { folders: [f.money], words: [(await db.words.get(f.words["la thune"].id))!] };
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const plan = await runReorg({ fetchImpl, snapshot: snap });
    expect(plan.moves).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("retries after 429 with Retry-After and maps errors to Russian messages", async () => {
    const sleeps: number[] = [];
    let n = 0;
    const fetchImpl = (async () =>
      n++ === 0 ? json({ error: "rate_limited" }, 429, { "Retry-After": "2" }) : json({ ok: 1 })) as unknown as typeof fetch;
    const body = { mode: "taxonomy", words: [], folders: [] } as unknown as TaxonomyRequest;
    await expect(postClassify(body, { fetchImpl, sleep: async (ms) => void sleeps.push(ms) })).resolves.toEqual({ ok: 1 });
    expect(sleeps).toEqual([2000]);

    // The wait is announced (no silent retries), and only one automatic retry is made.
    const waits: number[] = [];
    const always429 = vi.fn(async () => json({ error: "rate_limited" }, 429, { "Retry-After": "12" })) as unknown as typeof fetch;
    await expect(
      postClassify(body, { fetchImpl: always429, sleep: async () => undefined, onRateLimit: (s) => waits.push(s) }),
    ).rejects.toMatchObject({ code: "rate_limited" });
    expect(waits).toEqual([12]);
    expect(always429).toHaveBeenCalledTimes(2);

    const fail = (status: number, error: string) => (async () => json({ error }, status)) as unknown as typeof fetch;
    await expect(postClassify(body, { fetchImpl: fail(401, "unauthenticated") })).rejects.toMatchObject({ code: "auth" });
    await expect(postClassify(body, { fetchImpl: fail(503, "not_configured") })).rejects.toMatchObject({ code: "unavailable" });
    await expect(postClassify(body, { fetchImpl: fail(502, "upstream_error") })).rejects.toThrow(
      "Не получилось составить план. Попробуйте ещё раз.",
    );
    await expect(
      postClassify(body, { fetchImpl: fail(429, "rate_limited"), retries: 0 }),
    ).rejects.toBeInstanceOf(ReorgError);
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(postClassify(body, { fetchImpl: offline })).rejects.toMatchObject({ code: "upstream" });
  });
});
