import { describe, expect, it } from "vitest";
import { grade } from "@/lib/scheduler";
import { ankiCardState, noteStates } from "./progress";
import type { AnkiCard, AnkiNote } from "./types";

const CRT = 1_699_934_400; // 2023-11-14 04:00 UTC
const DAY = 86_400_000;
const dayMs = (day: number) => (CRT + day * 86_400) * 1000;
const NOW = new Date(dayMs(395) + 3_600_000);

function card(over: Partial<AnkiCard>): AnkiCard {
  return { ord: 0, type: 0, queue: 0, due: 0, ivl: 0, factor: 0, reps: 0, lapses: 0, fsrs: null, lastReviewMs: null, ...over };
}

describe("ankiCardState", () => {
  it("starts new cards fresh", () => {
    const s = ankiCardState(card({ due: 17 }), CRT, "w1", "fr_ru", NOW);
    expect(s).toMatchObject({ id: "w1:fr_ru", state: 0, reps: 0, due: NOW.toISOString(), last_review: null });
  });

  it("maps an SM-2 review card", () => {
    const s = ankiCardState(
      card({ type: 2, queue: 2, due: 400, ivl: 12, factor: 2300, reps: 6, lapses: 1 }),
      CRT,
      "w1",
      "ru_fr",
      NOW,
    );
    expect(s).toMatchObject({
      id: "w1:ru_fr",
      word_id: "w1",
      direction: "ru_fr",
      state: 2,
      due: new Date(dayMs(400)).toISOString(),
      stability: 12,
      difficulty: 6,
      scheduled_days: 12,
      learning_steps: 0,
      reps: 6,
      lapses: 1,
      // No revlog: the last review is due − interval.
      last_review: new Date(dayMs(388)).toISOString(),
      elapsed_days: 7,
      updated_at: NOW.toISOString(),
      deleted_at: null,
    });
  });

  it("prefers the FSRS memory state and the revlog time", () => {
    const lastReviewMs = dayMs(380) + 5000;
    const s = ankiCardState(
      card({
        type: 2,
        queue: 2,
        due: 420,
        ivl: 40,
        factor: 2500,
        reps: 9,
        fsrs: { stability: 41.5, difficulty: 6.25 },
        lastReviewMs,
      }),
      CRT,
      "w1",
      "fr_ru",
      NOW,
    );
    expect(s).toMatchObject({
      stability: 41.5,
      difficulty: 6.25,
      last_review: new Date(lastReviewMs).toISOString(),
      elapsed_days: 15,
    });
  });

  it("keeps learning and relearning due times in seconds", () => {
    const dueSec = Math.floor(NOW.getTime() / 1000) + 600;
    const learning = ankiCardState(
      card({ type: 1, queue: 1, due: dueSec, ivl: -600, factor: 2500, reps: 1 }),
      CRT,
      "w1",
      "fr_ru",
      NOW,
    );
    expect(learning).toMatchObject({
      state: 1,
      due: new Date(dueSec * 1000).toISOString(),
      stability: 0.1,
      difficulty: 5,
      scheduled_days: 0,
      last_review: null,
      elapsed_days: 0,
    });
    const relearning = ankiCardState(
      card({ type: 3, queue: 1, due: dueSec, ivl: 3, factor: 2100, reps: 8, lapses: 2, lastReviewMs: NOW.getTime() - 60_000 }),
      CRT,
      "w1",
      "fr_ru",
      NOW,
    );
    expect(relearning).toMatchObject({
      state: 3,
      due: new Date(dueSec * 1000).toISOString(),
      stability: 3,
      difficulty: 7,
      lapses: 2,
    });
    // Day-based learning steps (queue 3) count days like review cards.
    const dayLearning = ankiCardState(card({ type: 1, queue: 3, due: 396 }), CRT, "w1", "fr_ru", NOW);
    expect(dayLearning.due).toBe(new Date(dayMs(396)).toISOString());
  });

  it("clamps nonsense", () => {
    const s = ankiCardState(
      card({ type: 2, queue: 2, due: 400, ivl: 5, factor: 1300, reps: NaN, lapses: -3, lastReviewMs: NOW.getTime() + 10 * DAY }),
      CRT,
      "w1",
      "fr_ru",
      NOW,
    );
    expect(s).toMatchObject({ difficulty: 10, reps: 0, lapses: 0, last_review: NOW.toISOString(), elapsed_days: 0 });
    expect(ankiCardState(card({ type: 2, due: 400, ivl: 5, factor: 9000 }), CRT, "w1", "fr_ru", NOW).difficulty).toBe(1);
    expect(
      ankiCardState(card({ type: 2, due: 400, ivl: 5, fsrs: { stability: 2, difficulty: 42 } }), CRT, "w", "fr_ru", NOW)
        .difficulty,
    ).toBe(10);
    const absurd = ankiCardState(card({ type: 2, due: 1e15, ivl: Infinity }), CRT, "w1", "fr_ru", NOW);
    expect(absurd.due).toBe(NOW.toISOString());
    expect(Number.isFinite(absurd.stability)).toBe(true);
  });

  it("gives states ts-fsrs can grade", () => {
    const s = ankiCardState(card({ type: 2, queue: 2, due: 393, ivl: 10, factor: 2500, reps: 4 }), CRT, "w1", "fr_ru", NOW);
    const next = grade(s, 3, NOW).state;
    expect(next.state).toBe(2);
    expect(new Date(next.due).getTime()).toBeGreaterThan(NOW.getTime() + 10 * DAY);
  });
});

describe("noteStates", () => {
  const note = (over: Partial<AnkiNote>): AnkiNote => ({
    id: "1",
    deckId: "d",
    fields: [],
    tags: [],
    cards: [],
    templates: 2,
    ...over,
  });
  const review = card({ ord: 0, type: 2, queue: 2, due: 400, ivl: 12, factor: 2500, reps: 3 });
  const learning = card({ ord: 1, type: 1, queue: 1, due: Math.floor(NOW.getTime() / 1000), reps: 1 });

  it("maps card ord 0 to the direction that shows French first", () => {
    const fr = noteStates(note({ cards: [review, learning] }), CRT, "w", true, NOW);
    expect(fr.map((s) => [s.direction, s.state])).toEqual([
      ["fr_ru", 2],
      ["ru_fr", 1],
    ]);
    const ru = noteStates(note({ cards: [review, learning] }), CRT, "w", false, NOW);
    expect(ru.map((s) => [s.direction, s.state])).toEqual([
      ["fr_ru", 1],
      ["ru_fr", 2],
    ]);
  });

  it("starts a direction without a card as new", () => {
    const states = noteStates(note({ templates: 1, cards: [review] }), CRT, "w", true, NOW);
    expect(states.map((s) => [s.id, s.state])).toEqual([
      ["w:fr_ru", 2],
      ["w:ru_fr", 0],
    ]);
  });

  it("carries nothing for cloze, 3+ templates or text exports", () => {
    expect(noteStates(note({ templates: 0, cards: [review] }), CRT, "w", true, NOW)).toEqual([]);
    expect(noteStates(note({ templates: 3, cards: [review] }), CRT, "w", true, NOW)).toEqual([]);
    expect(noteStates(note({ cards: [review] }), null, "w", true, NOW)).toEqual([]);
  });
});
