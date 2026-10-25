import { describe, expect, it } from "vitest";
import type { ChatPlayerSet } from "@/lib/core/chat-player";
import type { ExerciseAnswer, ExerciseItem } from "@/lib/types";
import {
  ExamRound,
  clock,
  compositionLine,
  examItems,
  examLevels,
  examMistakesMessage,
  examSeconds,
  examSummary,
  levelVerdict,
  passageKinds,
  scoreExam,
} from "./exam";

const item = (over: Partial<ExerciseItem>): ExerciseItem => ({
  id: "i", type: "choice", skill: null, ask: null, tense: null, person: null, word_id: null, new_ref: null,
  prompt: "?", sentence: null, sentence_ru: null, answer: "a", distractors: ["b", "c", "d"], pairs: [], tiles: [], explain_ru: null, word: null,
  ...over,
});
const reading = (id: string, level: ExerciseItem["level"], over: Partial<ExerciseItem> = {}) =>
  item({ id, type: "reading", level, passage: "Loyer : 780 €\nCaution : un mois", passage_label: "ANNONCE", prompt: `Question ${id} ?`, answer: `bon ${id}`, distractors: ["x", "y", "z"], ...over });

const set = (items: ExerciseItem[], over: Partial<ChatPlayerSet> = {}): ChatPlayerSet => ({
  kind: "kartochki-exercise-set", version: 1, client_ref: "tcf", set_id: "x-tcf", title: "Жильё", topic: null, folders: [], scope: null,
  levels: [], level_auto: false, items, new_words: [], saved: false, mode: "exam", ...over,
});
const answer = (item_id: string, outcome: ExerciseAnswer["outcome"], chosen: string | null): ExerciseAnswer => ({
  item_id, word_id: null, new_ref: null, attempt: 1, outcome, chosen, ms: 1000, at: "2026-10-25T10:00:00.000Z",
});

describe("Мини-TCF rules", () => {
  it("plays every question but pairs boards, with the set's time or 90 s a question", () => {
    const items = [reading("r1", "A2"), item({ id: "p", type: "pairs", answer: null, tiles: [{ key: "a", fr: "a", ru: "а" }, { key: "b", fr: "b", ru: "б" }] }), item({ id: "c" })];
    expect(examItems(set(items)).map((i) => i.id)).toEqual(["r1", "c"]);
    expect(examSeconds(set(items), 12)).toBe(1080);
    expect(examSeconds(set(items, { time_limit_s: 600 }), 12)).toBe(600);
    expect(examSeconds(set(items, { time_limit_s: 0 }), 2)).toBe(180);
  });

  it("writes the clock, the start card's composition, kinds and levels", () => {
    expect(clock(1080)).toBe("18:00");
    expect(clock(702.4)).toBe("11:42");
    expect(clock(-3)).toBe("00:00");
    expect(clock(3725)).toBe("1:02:05");
    const items = [reading("r1", "A2"), reading("r2", "B2", { passage_label: "message" }), item({ id: "c", level: "B1" }), item({ id: "z", type: "cloze", sentence: "Le [[bail]] est signé." })];
    expect(compositionLine(items)).toBe("2 текста · 1 значение · 1 пропуск");
    expect(passageKinds(items)).toBe("объявления, сообщения");
    expect(passageKinds([item({ id: "c" })])).toBeNull();
    expect(examLevels(set(items), items)).toEqual(["A2", "B1", "B2"]);
    expect(examLevels(set([item({})], { levels: ["B1"] }), [item({})])).toEqual(["B1"]);
  });

  it("scores by level: ✓ from 80 %, ✗ under half, ~ between; a missing answer is a miss", () => {
    expect([levelVerdict(4, 4), levelVerdict(3, 5), levelVerdict(1, 3), levelVerdict(4, 5)]).toEqual(["ok", "mid", "no", "ok"]);
    const items = [reading("r1", "A2"), reading("r2", "B1"), reading("r3", "B1"), item({ id: "c" })];
    const score = scoreExam(items, [answer("r1", "correct", "bon r1"), answer("r2", "wrong", "x"), answer("c", "correct", "a")]);
    expect(score).toMatchObject({ correct: 2, total: 4 });
    expect(score.levels).toEqual([
      { level: "A2", correct: 1, total: 1, verdict: "ok" },
      { level: "B1", correct: 0, total: 2, verdict: "no" },
    ]);
    expect(score.misses.map((m) => [m.item.id, m.chosen, m.right])).toEqual([
      ["r2", "x", "bon r2"],
      ["r3", null, "bon r3"],
    ]);
  });

  it("tells Claude the result by level and asks about the misses in French", () => {
    const items = [reading("r1", "A2"), reading("r2", "B1")];
    const score = scoreExam(items, [answer("r1", "correct", "bon r1"), answer("r2", "wrong", "x")]);
    const line = examSummary("Жильё", score, 845, 1080, false, false);
    expect(line).toContain("1 из 2 за 14:05 из 18:00");
    expect(line).toContain("по уровням: A2 1/1, B1 0/1");
    expect(line).toContain("«Question r2 ?» — ответ «x», верно «bon r2»");
    expect(line).toContain("не сохранён");
    expect(examSummary("Жильё", score, 1080, 1080, true, true)).toContain("(время вышло)");
    const message = examMistakesMessage("Жильё", score.misses);
    expect(message).toContain("1. [B1, ANNONCE] Question r2 ? — мой ответ «x», верно «bon r2».");
  });
});

describe("ExamRound", () => {
  const items = [reading("r1", "A2"), reading("r2", "B1"), reading("r3", "B2")];

  it("runs on the wall clock from «Начать», one answer a question, attempt 1, no going back", () => {
    const round = new ExamRound(set(items, { time_limit_s: 300 }));
    expect(round.remaining(0)).toBe(300);
    expect(round.select(0)).toBe(false); // not started
    round.start(1_000);
    expect(round.remaining(61_000)).toBe(240);
    expect(round.submit(2_000)).toBe(false); // nothing picked
    const options = round.options()!;
    round.select(options.correct);
    expect(round.submit(5_000)).toBe(true);
    expect(round.index).toBe(1);
    const second = round.options()!;
    round.select((second.correct + 1) % 4);
    round.submit(9_000);
    expect(round.answers.map((a) => [a.item_id, a.attempt, a.outcome, a.ms])).toEqual([
      ["r1", 1, "correct", 4000],
      ["r2", 1, "wrong", 4000],
    ]);
    round.select(round.options()!.correct);
    round.submit(20_000);
    expect(round.done).toBe(true);
    expect(round.used(99_000)).toBe(19);
    expect(round.score().correct).toBe(2);
    expect(round.result()).toMatchObject({ client_ref: "tcf", started_at: new Date(1_000).toISOString(), finished_at: new Date(20_000).toISOString() });
  });

  it("ends at the deadline: the questions left are wrong with nothing chosen, a pick not sent included", () => {
    const round = new ExamRound(set(items, { time_limit_s: 60 }));
    round.start(0);
    round.select(round.options()!.correct);
    round.submit(10_000);
    round.select(0);
    expect(round.expired(59_000)).toBe(false);
    expect(round.expired(61_000)).toBe(true);
    // A late «Ответить» doesn't count: the time was up.
    expect(round.submit(75_000)).toBe(true);
    expect(round.done && round.timedOut).toBe(true);
    expect(round.answers.slice(1).map((a) => [a.item_id, a.outcome, a.chosen])).toEqual([
      ["r2", "wrong", null],
      ["r3", "wrong", null],
    ]);
    expect(round.used(80_000)).toBe(60);
    expect(round.result().finished_at).toBe(new Date(60_000).toISOString());
    // Stamped at the deadline too, not when the page noticed it.
    expect(round.answers.slice(1).map((a) => a.at)).toEqual([new Date(60_000).toISOString(), new Date(60_000).toISOString()]);
  });

  it("keeps one option order for a question across redraws", () => {
    const round = new ExamRound(set(items));
    round.start(0);
    expect(round.options()).toEqual(round.options());
  });
});
