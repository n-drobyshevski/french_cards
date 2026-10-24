import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { createFolder } from "./folders";
import { newReviewState } from "./scheduler";
import {
  addWord,
  addWords,
  getLastReview,
  getWordHistory,
  getWordStates,
  gradeCard,
  listWords,
  moveWords,
  resetProgress,
  restoreMoves,
  restoreReviewStates,
  restoreWords,
  softDeleteWord,
  softDeleteWords,
  undoLastReview,
  updateWord,
  updateWords,
} from "./words";

const MIN = 60_000;
const T0 = new Date("2026-10-21T10:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

const outboxKeys = async () => (await db.outbox.toArray()).map((o) => o.key).sort();

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe("addWord", () => {
  it("keeps a valid level (a level without a source is the user's) and refuses junk", async () => {
    const w = await addWord({ fr: "la démarche", ru: "процедура", cefr: "B2" }, T0);
    expect([w.cefr, w.cefr_source]).toEqual(["B2", "user"]);
    const chat = await addWord({ fr: "le titre de séjour", ru: "вид на жительство", cefr: "B1", cefr_source: "chat" }, T0);
    expect([chat.cefr, chat.cefr_source]).toEqual(["B1", "chat"]);
    await expect(addWord({ fr: "x", ru: "y", cefr: "b1" as never })).rejects.toThrow();
  });

  it("creates the word with defaults and both review cards", async () => {
    const w = await addWord({ fr: "  la   thune ", ru: "бабки, деньги" }, T0);
    expect(w).toMatchObject({
      fr: "la thune",
      ru: "бабки, деньги",
      note: null,
      pos: "other",
      gender: "none",
      slang_level: 0,
      verlan: false,
      tags: [],
      folder_id: null,
      folder_source: "auto",
      folder_confidence: null,
      source: "manual",
      both_directions: true,
      created_at: T0.toISOString(),
      updated_at: T0.toISOString(),
      deleted_at: null,
    });
    const states = await getWordStates(w.id);
    expect(states.map((s) => s.id)).toEqual([`${w.id}:fr_ru`, `${w.id}:ru_fr`]);
    expect(states.every((s) => s.state === 0 && s.due === T0.toISOString())).toBe(true);
    expect(await outboxKeys()).toEqual([`review_state:${w.id}:fr_ru`, `review_state:${w.id}:ru_fr`, `words:${w.id}`].sort());
  });

  it("creates only fr_ru when both_directions is off", async () => {
    const w = await addWord({ fr: "chelou", ru: "стрёмный", both_directions: false }, T0);
    expect((await getWordStates(w.id)).map((s) => s.direction)).toEqual(["fr_ru"]);
  });

  it("keeps the given fields and drops confidence for the inbox", async () => {
    const w = await addWord(
      { fr: "kiffer", ru: "тащиться", note: " ", slang_level: 2, tags: ["a", " a ", ""], folder_id: null, folder_confidence: "high" },
      T0,
    );
    expect(w.note).toBeNull();
    expect(w.tags).toEqual(["a"]);
    expect(w.folder_confidence).toBeNull();
    expect(w.slang_level).toBe(2);
  });

  it("rejects empty fr or ru", async () => {
    await expect(addWord({ fr: " ", ru: "x" })).rejects.toThrow();
    await expect(addWord({ fr: "x", ru: "" })).rejects.toThrow();
    expect(await db.words.count()).toBe(0);
  });

  it("addWords is atomic", async () => {
    await expect(addWords([{ fr: "a", ru: "b" }, { fr: "", ru: "c" }])).rejects.toThrow();
    expect(await db.words.count()).toBe(0);
    const words = await addWords([{ fr: "a", ru: "b" }, { fr: "c", ru: "d", both_directions: false }], T0);
    expect(words).toHaveLength(2);
    expect(await db.review_state.count()).toBe(3);
  });
});

describe("updateWord", () => {
  it("stamps updated_at, cleans text and queues the row", async () => {
    const w = await addWord({ fr: "bouffer", ru: "жрать" }, T0);
    await db.outbox.clear();
    const u = await updateWord(w.id, { ru: "  жрать,  есть ", note: "fam." }, at(MIN));
    expect(u.ru).toBe("жрать, есть");
    expect(u.note).toBe("fam.");
    expect(u.updated_at).toBe(at(MIN).toISOString());
    expect(u.created_at).toBe(w.created_at);
    expect(await outboxKeys()).toEqual([`words:${w.id}`]);
  });

  it("marks a manual folder change as user-placed", async () => {
    const w = await addWord({ fr: "le fric", ru: "бабло", folder_id: "f1", folder_confidence: "high" }, T0);
    const u = await updateWord(w.id, { folder_id: "f2" }, at(MIN));
    expect(u.folder_source).toBe("user");
    expect(u.folder_confidence).toBeNull();
  });

  it("toggling both_directions removes and later revives ru_fr with its progress", async () => {
    const w = await addWord({ fr: "la meuf", ru: "девушка" }, T0);
    await gradeCard(w.id, "ru_fr", 3, at(MIN));
    const graded = await db.review_state.get(`${w.id}:ru_fr`);
    await updateWord(w.id, { both_directions: false }, at(2 * MIN));
    expect((await getWordStates(w.id)).map((s) => s.direction)).toEqual(["fr_ru"]);
    expect((await db.review_state.get(`${w.id}:ru_fr`))?.deleted_at).toBe(at(2 * MIN).toISOString());
    await updateWord(w.id, { both_directions: true }, at(3 * MIN));
    const revived = await db.review_state.get(`${w.id}:ru_fr`);
    expect(revived?.deleted_at).toBeNull();
    expect(revived?.reps).toBe(graded?.reps);
    expect(revived?.state).toBe(graded?.state);
  });

  it("stores «Уровень языка» with its source; null («Авто») clears both; junk is refused", async () => {
    const w = await addWord({ fr: "le loyer", ru: "квартплата" }, T0);
    expect([w.cefr, w.cefr_source]).toEqual([null, null]);
    const picked = await updateWord(w.id, { cefr: "B1" }, at(MIN));
    expect([picked.cefr, picked.cefr_source]).toEqual(["B1", "user"]);
    const ai = await updateWord(w.id, { cefr: "A2", cefr_source: "ai" }, at(2 * MIN));
    expect([ai.cefr, ai.cefr_source]).toEqual(["A2", "ai"]);
    // Another edit leaves the level alone; a source alone re-labels it.
    expect((await updateWord(w.id, { note: "x" }, at(3 * MIN))).cefr_source).toBe("ai");
    expect((await updateWord(w.id, { cefr_source: "user" }, at(4 * MIN))).cefr_source).toBe("user");
    const auto = await updateWord(w.id, { cefr: null }, at(5 * MIN));
    expect([auto.cefr, auto.cefr_source]).toEqual([null, null]);
    // No level → no source, whatever the patch says.
    expect((await updateWord(w.id, { cefr_source: "chat" }, at(6 * MIN))).cefr_source).toBeNull();
    await expect(updateWord(w.id, { cefr: "B3" as never })).rejects.toThrow("уровень");
  });

  it("rejects missing words and empty fields", async () => {
    await expect(updateWord("nope", { ru: "x" })).rejects.toThrow();
    const w = await addWord({ fr: "a", ru: "b" });
    await expect(updateWord(w.id, { fr: "  " })).rejects.toThrow();
  });
});

describe("updateWords", () => {
  it("patches every word in one go, skips deleted ones and queues each written row", async () => {
    const a = await addWord({ fr: "bouffer", ru: "жрать" }, T0);
    const b = await addWord({ fr: "le fric", ru: "бабло", folder_id: "f1", folder_confidence: "high" }, T0);
    const c = await addWord({ fr: "chelou", ru: "стрёмный" }, T0);
    await softDeleteWord(c.id, T0);
    await db.outbox.clear();
    const out = await updateWords(
      [
        { id: a.id, patch: { note: "  fam. " } },
        { id: c.id, patch: { note: "x" } },
        { id: "missing", patch: { note: "x" } },
        { id: b.id, patch: { folder_id: "f2" } },
      ],
      at(MIN),
    );
    expect(out.map((w) => w.id)).toEqual([a.id, b.id]);
    expect(out[0]).toMatchObject({ note: "fam.", updated_at: at(MIN).toISOString() });
    expect(out[1]).toMatchObject({ folder_id: "f2", folder_source: "user", folder_confidence: null });
    expect((await db.words.get(a.id))?.note).toBe("fam.");
    expect((await db.words.get(c.id))?.note).toBeNull();
    expect(await outboxKeys()).toEqual([`words:${a.id}`, `words:${b.id}`].sort());
  });

  it("applies several patches to one word in order and syncs cards only when both_directions changes", async () => {
    const a = await addWord({ fr: "la meuf", ru: "девушка" }, T0);
    const b = await addWord({ fr: "le keuf", ru: "мент" }, T0);
    await db.outbox.clear();
    const out = await updateWords(
      [
        { id: a.id, patch: { ru: "девушка, тёлка" } },
        { id: b.id, patch: { note: "verl." } },
        { id: a.id, patch: { both_directions: false } },
      ],
      at(MIN),
    );
    expect(out.map((w) => w.id)).toEqual([a.id, b.id, a.id]);
    expect(await db.words.get(a.id)).toMatchObject({ ru: "девушка, тёлка", both_directions: false });
    expect((await getWordStates(a.id)).map((s) => s.direction)).toEqual(["fr_ru"]);
    expect((await getWordStates(b.id)).map((s) => s.direction)).toEqual(["fr_ru", "ru_fr"]);
    expect(await outboxKeys()).toEqual([`review_state:${a.id}:ru_fr`, `words:${a.id}`, `words:${b.id}`].sort());
  });

  it("writes nothing when a patch is invalid", async () => {
    const a = await addWord({ fr: "bouffer", ru: "жрать" }, T0);
    const b = await addWord({ fr: "le fric", ru: "бабло" }, T0);
    await expect(
      updateWords(
        [
          { id: a.id, patch: { note: "fam." } },
          { id: b.id, patch: { ru: "  " } },
        ],
        at(MIN),
      ),
    ).rejects.toThrow();
    expect((await db.words.get(a.id))?.note).toBeNull();
  });
});

describe("softDeleteWords / restoreWords", () => {
  it("tombstones the word and its cards, then restores them", async () => {
    const w = await addWord({ fr: "se tirer", ru: "свалить" }, T0);
    await softDeleteWord(w.id, at(MIN));
    const word = await db.words.get(w.id);
    expect(word?.deleted_at).toBe(at(MIN).toISOString());
    expect(await getWordStates(w.id)).toEqual([]);
    expect((await db.review_state.where("word_id").equals(w.id).toArray()).every((s) => s.deleted_at)).toBe(true);
    expect(await listWords()).toEqual([]);

    await restoreWords([w.id], at(2 * MIN));
    expect((await db.words.get(w.id))?.deleted_at).toBeNull();
    expect(await getWordStates(w.id)).toHaveLength(2);
  });

  it("restore does not revive a ru_fr card for a one-direction word", async () => {
    const w = await addWord({ fr: "x", ru: "y", both_directions: false }, T0);
    await db.review_state.put({ ...newReviewState(w.id, "ru_fr", T0), deleted_at: T0.toISOString() });
    await softDeleteWords([w.id], at(MIN));
    await restoreWords([w.id], at(2 * MIN));
    expect((await getWordStates(w.id)).map((s) => s.direction)).toEqual(["fr_ru"]);
  });
});

describe("moveWords", () => {
  it("manual moves set folder_source user and can be undone", async () => {
    const a = await addWord({ fr: "a", ru: "1", folder_id: "f1", folder_source: "auto", folder_confidence: "med" }, T0);
    const b = await addWord({ fr: "b", ru: "2" }, T0);
    const moves = await moveWords([a.id, b.id], "f2", {}, at(MIN));
    expect(moves).toHaveLength(2);
    for (const id of [a.id, b.id]) {
      const w = await db.words.get(id);
      expect(w).toMatchObject({ folder_id: "f2", folder_source: "user", folder_confidence: null, updated_at: at(MIN).toISOString() });
    }
    await restoreMoves(moves, at(2 * MIN));
    expect(await db.words.get(a.id)).toMatchObject({ folder_id: "f1", folder_source: "auto", folder_confidence: "med" });
    expect(await db.words.get(b.id)).toMatchObject({ folder_id: null, folder_source: "auto" });
  });

  it("automatic moves skip user-placed words and record confidence", async () => {
    const mine = await addWord({ fr: "a", ru: "1", folder_id: "f1", folder_source: "user" }, T0);
    const auto = await addWord({ fr: "b", ru: "2" }, T0);
    const moves = await moveWords([mine.id, auto.id], "f9", { source: "auto", confidence: "high" }, at(MIN));
    expect(moves.map((m) => m.word_id)).toEqual([auto.id]);
    expect((await db.words.get(mine.id))?.folder_id).toBe("f1");
    expect(await db.words.get(auto.id)).toMatchObject({ folder_id: "f9", folder_source: "auto", folder_confidence: "high" });
  });

  it("moving to the inbox clears confidence; no-op moves are not recorded", async () => {
    const w = await addWord({ fr: "a", ru: "1", folder_id: "f1", folder_source: "user" }, T0);
    expect(await moveWords([w.id], "f1", {}, at(MIN))).toEqual([]);
    const moves = await moveWords([w.id], null, {}, at(MIN));
    expect(moves).toEqual([{ word_id: w.id, from: "f1", to: null, from_source: "user", from_confidence: null }]);
  });
});

describe("gradeCard / undoLastReview", () => {
  it("persists the new state and an append-only log", async () => {
    const w = await addWord({ fr: "chelou", ru: "стрёмный" }, T0);
    await db.outbox.clear();
    const { state, log } = await gradeCard(w.id, "fr_ru", 3, at(MIN));
    expect(await db.review_state.get(state.id)).toEqual(state);
    expect(await db.review_log.get(log.id)).toEqual(log);
    expect(log.prev?.state).toBe(0);
    expect(await outboxKeys()).toEqual([`review_log:${log.id}`, `review_state:${state.id}`].sort());
    expect(await getWordHistory(w.id)).toEqual([log]);
  });

  it("rejects grading a deleted word", async () => {
    const w = await addWord({ fr: "a", ru: "b" }, T0);
    await softDeleteWord(w.id, T0);
    await expect(gradeCard(w.id, "fr_ru", 3, at(MIN))).rejects.toThrow();
  });

  it("undo restores the exact previous state and tombstones the log", async () => {
    const w = await addWord({ fr: "kiffer", ru: "тащиться" }, T0);
    const original = await db.review_state.get(`${w.id}:fr_ru`);
    const { log } = await gradeCard(w.id, "fr_ru", 1, at(MIN));
    const undone = await undoLastReview({}, at(2 * MIN));
    expect(undone?.log.id).toBe(log.id);
    const restored = await db.review_state.get(`${w.id}:fr_ru`);
    expect({ ...restored, updated_at: null }).toEqual({ ...original, updated_at: null });
    expect(restored?.updated_at).toBe(at(2 * MIN).toISOString());
    const tomb = await db.review_log.get(log.id);
    expect(tomb?.deleted_at).toBe(at(2 * MIN).toISOString());
    expect(await getWordHistory(w.id)).toEqual([]);
    expect(await getLastReview()).toBeUndefined();
  });

  it("undo walks back several reviews in order", async () => {
    const a = await addWord({ fr: "a", ru: "1" }, T0);
    const b = await addWord({ fr: "b", ru: "2" }, T0);
    await gradeCard(a.id, "fr_ru", 3, at(1 * MIN));
    const aAfterFirst = await db.review_state.get(`${a.id}:fr_ru`);
    await gradeCard(b.id, "fr_ru", 2, at(2 * MIN));
    await gradeCard(a.id, "fr_ru", 3, at(3 * MIN));

    const u1 = await undoLastReview({}, at(4 * MIN));
    expect(u1?.log.word_id).toBe(a.id);
    expect((await db.review_state.get(`${a.id}:fr_ru`))?.reps).toBe(aAfterFirst?.reps);

    const u2 = await undoLastReview({}, at(5 * MIN));
    expect(u2?.log.word_id).toBe(b.id);
    expect((await db.review_state.get(`${b.id}:fr_ru`))?.state).toBe(0);

    const u3 = await undoLastReview({}, at(6 * MIN));
    expect(u3?.log.word_id).toBe(a.id);
    expect((await db.review_state.get(`${a.id}:fr_ru`))?.state).toBe(0);

    expect(await undoLastReview({}, at(7 * MIN))).toBeNull();
  });

  it("undo can target one card", async () => {
    const a = await addWord({ fr: "a", ru: "1" }, T0);
    const b = await addWord({ fr: "b", ru: "2" }, T0);
    const la = await gradeCard(a.id, "fr_ru", 3, at(1 * MIN));
    await gradeCard(b.id, "fr_ru", 3, at(2 * MIN));
    const u = await undoLastReview({ wordId: a.id, direction: "fr_ru" }, at(3 * MIN));
    expect(u?.log.id).toBe(la.log.id);
    expect((await db.review_state.get(`${b.id}:fr_ru`))?.state).toBe(1);
  });
});

describe("resetProgress", () => {
  it("resets cards to New and can be restored", async () => {
    const w = await addWord({ fr: "a", ru: "1" }, T0);
    await gradeCard(w.id, "fr_ru", 3, at(MIN));
    await gradeCard(w.id, "ru_fr", 3, at(MIN));
    const before = await getWordStates(w.id);
    const prev = await resetProgress(w.id, undefined, at(2 * MIN));
    expect(prev).toHaveLength(2);
    const after = await getWordStates(w.id);
    expect(after.every((s) => s.state === 0 && s.reps === 0)).toBe(true);
    expect(await getWordHistory(w.id)).toHaveLength(2);

    await restoreReviewStates(prev, at(3 * MIN));
    const back = await getWordStates(w.id);
    expect(back.map((s) => s.reps)).toEqual(before.map((s) => s.reps));
  });

  it("can reset a single direction", async () => {
    const w = await addWord({ fr: "a", ru: "1" }, T0);
    await gradeCard(w.id, "fr_ru", 3, at(MIN));
    await gradeCard(w.id, "ru_fr", 3, at(MIN));
    await resetProgress(w.id, "ru_fr", at(2 * MIN));
    const [fr, ru] = await getWordStates(w.id);
    expect(fr.state).toBe(1);
    expect(ru.state).toBe(0);
  });
});

describe("listWords", () => {
  it("lists live words by folder, newest first", async () => {
    const f = await createFolder({ name: "Тема" }, T0);
    const a = await addWord({ fr: "a", ru: "1", folder_id: f.id }, T0);
    const b = await addWord({ fr: "b", ru: "2", folder_id: f.id }, at(MIN));
    const c = await addWord({ fr: "c", ru: "3" }, at(2 * MIN));
    const orphan = await addWord({ fr: "d", ru: "4", folder_id: "gone" }, at(3 * MIN));
    await softDeleteWord(a.id, at(4 * MIN));
    expect((await listWords(f.id)).map((w) => w.id)).toEqual([b.id]);
    expect((await listWords(null)).map((w) => w.id)).toEqual([orphan.id, c.id]);
    expect((await listWords()).map((w) => w.id)).toEqual([orphan.id, c.id, b.id]);
  });
});
