import { describe, expect, it } from "vitest";
import type { ChatCard, ChatCardsSession, GradeAnswerResult } from "@/lib/core/chat-cards";
import { CardsRound, minutesText, planLine, rateLimitSeconds, saveLine, summaryLine, waitingLine, type Call, type CallOutcome } from "./model";
import { callNumber, exampleMatch, foldSummary, gradeLabel, moreFields, promptSize } from "./face";
import { cardsRequest, mistakesExerciseRequest, practiceRequest, themesPart } from "./requests";

const T0 = Date.parse("2026-10-29T10:00:00.000Z");
const MIN = 60_000;
const at = (ms: number) => new Date(T0 + ms).toISOString();

const card = (id: string, over: Partial<ChatCard> = {}): ChatCard => ({
  key: `${id}:fr_ru`,
  word_id: id,
  direction: "fr_ru",
  is_new: false,
  expected: `e0-${id}`,
  intervals: { 1: "<1 мин", 2: "6 мин", 3: "1 д" },
  number: 7,
  fr: `mot ${id}`,
  ru: `слово ${id}`,
  pos: "noun",
  gender: "m",
  slang_level: 0,
  verlan: false,
  example_fr: null,
  example_ru: null,
  note: null,
  origin: null,
  fields: [],
  fields_more: 0,
  level: null,
  level_estimated: false,
  folder_name: "Еда",
  ...over,
});

const session = (cards: ChatCard[], over: Partial<ChatCardsSession> = {}): ChatCardsSession => ({
  kind: "kartochki-cards",
  version: 1,
  mode: "schedule",
  round_id: "r1",
  built_at: at(0),
  day_end: at(18 * 60 * MIN),
  title: "Повторение",
  folder_label: "Все темы",
  folder_names: [],
  direction: "both",
  direction_label: "FR ↔ RU",
  scope: null,
  cards,
  counts: { due: 12, new: 4, waiting: 0, deferred: 0 },
  remaining: 12,
  next_due: null,
  next: null,
  app_url: null,
  ...over,
});

/** A grade_cards result per answer of the call, `status` and `returns` (ms to due) by word id. */
function graded(call: Call, by: Record<string, { status?: GradeAnswerResult["status"]; returns?: number; state?: 0 | 1 | 2 | 3 }> = {}): CallOutcome {
  if (call.kind !== "grade") throw new Error("not a grade call");
  const results = call.args.answers.map((a, i) => {
    const o = by[a.word_id] ?? {};
    const status = o.status ?? "saved";
    const written = status === "saved" || status === "already_saved";
    const returns = o.returns ?? 24 * 60 * MIN;
    return {
      word_id: a.word_id,
      direction: a.direction,
      key: `${a.word_id}:${a.direction}`,
      status,
      log_id: written ? `cr-${a.word_id}-${a.expected}` : null,
      expected: status === "gone" ? null : `e${i + 1}-${a.word_id}`,
      due: status === "gone" ? null : at(returns),
      state: status === "gone" ? null : (o.state ?? (returns < 60 * MIN ? 1 : 2)),
      intervals: status === "gone" ? null : { 1: "<1 мин", 2: "8 мин", 3: "2 д" },
      returns_in_ms: status === "gone" ? null : returns,
    };
  });
  const items = results.filter((r) => r.log_id).map((r) => ({ log_id: r.log_id!, expected: r.expected! }));
  return { ok: true, data: { results, undo: items.length ? { tool: "undo_grades", items } : null } };
}

const answer = (round: CardsRound, rating: 1 | 2 | 3, now = T0) => {
  round.flip();
  return round.grade(rating, now);
};

describe("a round «По расписанию»", () => {
  it("flips, grades and sends each answer at once; answers made while a call is in flight go together next", () => {
    const round = new CardsRound(session([card("a"), card("b"), card("c")]));
    expect(round.phase).toBe("question");
    expect(round.grade(3, T0)).toBe(false);
    expect(round.flip()).toBe(true);
    expect(round.unflip()).toBe(true);
    expect(answer(round, 3)).toBe(true);
    expect(round.progress()).toEqual({ position: 2, total: 3 });
    const first = round.nextCall(T0)!;
    expect(first.kind === "grade" && first.args).toEqual({ answers: [{ word_id: "a", direction: "fr_ru", rating: 3, expected: "e0-a", answered_at: at(0) }] });
    // One call at a time.
    answer(round, 1, T0 + 1000);
    answer(round, 2, T0 + 2000);
    expect(round.nextCall(T0 + 2000)).toBeNull();
    expect(saveLine(round, T0)?.text).toBe("Сохраняем…");
    round.callDone(first, graded(first), T0 + 3000);
    const second = round.nextCall(T0 + 3000)!;
    expect(second.kind === "grade" && second.args.answers.map((a) => [a.word_id, a.rating])).toEqual([["b", 1], ["c", 2]]);
    round.callDone(second, graded(second), T0 + 4000);
    expect(round.saving).toBe(false);
    expect(round.queue).toEqual([]);
    expect(saveLine(round, T0)).toBeNull();
  });

  it("brings a card due within 20 min back at the end of the round with its new expected and sub-labels; later ones wait", () => {
    const round = new CardsRound(session([card("a", { is_new: true }), card("b"), card("c")]));
    answer(round, 1);
    const call = round.nextCall(T0)!;
    round.callDone(call, graded(call, { a: { returns: MIN } }), T0 + 500);
    expect(round.queue.map((t) => [t.card.word_id, t.attempt])).toEqual([["b", 1], ["c", 1], ["a", 2]]);
    const back = round.queue[2].card;
    expect([back.expected, back.intervals?.[2], back.is_new]).toEqual(["e1-a", "8 мин", false]);
    answer(round, 2, T0 + MIN);
    const c2 = round.nextCall(T0 + MIN)!;
    round.callDone(c2, graded(c2, { b: { returns: 25 * MIN, state: 3 } }), T0 + MIN);
    expect(round.queue.map((t) => t.card.word_id)).toEqual(["c", "a"]);
    answer(round, 3, T0 + 2 * MIN);
    answer(round, 3, T0 + 3 * MIN);
    // The card that came back is sent with the expected of its first grade.
    const c3 = round.nextCall(T0 + 3 * MIN)!;
    expect(c3.kind === "grade" && c3.args.answers.map((a) => [a.word_id, a.expected])).toEqual([["c", "e0-c"], ["a", "e1-a"]]);
    round.callDone(c3, graded(c3), T0 + 3 * MIN);
    expect(round.marks()).toEqual(["miss", "first", "first", "requeued"]);
    expect(round.summary()).toEqual({ total: 4, percent: 75, fresh: 1 });
    expect(summaryLine(round.summary())).toBe("4 карточки · 75 % · 1 новая");
    expect(round.hardWords().map((w) => w.fr)).toEqual(["mot b", "mot a"]);
    const waiting = round.waiting(T0 + 3 * MIN);
    expect(waiting).toEqual({ count: 1, at: T0 + 25 * MIN });
    expect(waitingLine(waiting, T0 + 3 * MIN)).toBe("Через 22 мин вернётся 1 карточка");
  });

  it("waits out the rate limit and sends again; a call that never answers waits for «Повторить» or the next answer", () => {
    const round = new CardsRound(session([card("a"), card("b"), card("c")]));
    answer(round, 3);
    const c1 = round.nextCall(T0)!;
    round.callDone(c1, { ok: false, error: "Too many changes in a row. Wait 12 s and try again." }, T0);
    expect(round.nextCall(T0 + 11_000)).toBeNull();
    expect(saveLine(round, T0 + 1000)).toEqual({ text: "Много оценок подряд — сохраним через 11 с", retry: false, error: false });
    const c2 = round.nextCall(T0 + 12_000)!;
    expect(c2.kind === "grade" && c2.args.answers.map((a) => a.expected)).toEqual(["e0-a"]);
    round.callLost(c2);
    expect(round.unsaved).toBe(1);
    expect(saveLine(round, T0)).toEqual({ text: "Не сохранилось (1): нет ответа", retry: true, error: true });
    expect(round.nextCall(T0 + 60_000)).toBeNull();
    // The next answer is the retry: both go, the first with the expected it was sent with.
    answer(round, 2, T0 + 61_000);
    const c3 = round.nextCall(T0 + 61_000)!;
    expect(c3.kind === "grade" && c3.args.answers.map((a) => [a.word_id, a.expected, a.answered_at])).toEqual([["a", "e0-a", at(0)], ["b", "e0-b", at(61_000)]]);
    round.callDone(c3, graded(c3, { a: { status: "already_saved" } }), T0 + 62_000);
    // The lost call's late result changes nothing more.
    round.callDone(c2, graded(c2), T0 + 63_000);
    expect(round.answers.map((a) => a.status)).toEqual(["saved", "saved"]);
    expect(round.unsaved).toBe(0);
    round.callLost(c3);
    expect(round.trouble).toBeNull();
    answer(round, 3, T0 + 64_000);
    const c4 = round.nextCall(T0 + 64_000)!;
    round.callDone(c4, { ok: false, error: "нет связи с Карточками" }, T0);
    expect(round.retry()).toBe(true);
    expect(round.nextCall(T0)?.kind).toBe("grade");
  });

  it("a late result that saves what a lost call carried clears «нет ответа» and lets the outbox go on", () => {
    const round = new CardsRound(session([card("a")]));
    answer(round, 3);
    const c1 = round.nextCall(T0)!;
    round.callLost(c1);
    expect(saveLine(round, T0)?.text).toBe("Не сохранилось (1): нет ответа");
    round.callDone(c1, graded(c1), T0 + 50_000);
    expect(round.trouble).toBeNull();
    expect(saveLine(round, T0)).toBeNull();
    // Z on the done screen goes at once.
    expect(round.undo()).toBe(true);
    const u = round.nextCall(T0)!;
    expect(u.kind).toBe("undo");
    round.callLost(u);
    round.callDone(u, { ok: true, data: { results: [{ log_id: "cr-a-e0-a", status: "undone", word_id: "a", direction: "fr_ru", key: "a:fr_ru", expected: "e2-a", intervals: null, due: null, state: 2 }] } }, T0);
    expect(round.trouble).toBeNull();
    // A newer call's error stays.
    const other = new CardsRound(session([card("a"), card("b")]));
    answer(other, 3);
    const o1 = other.nextCall(T0)!;
    other.callLost(o1);
    answer(other, 3);
    const o2 = other.nextCall(T0)!;
    other.callDone(o2, { ok: false, error: "нет связи с Карточками" }, T0);
    other.callDone(o1, graded(o1), T0);
    expect(other.trouble).toEqual({ kind: "error", text: "нет связи с Карточками" });
  });

  it("skips a card graded elsewhere («уже повторена») or deleted, and doesn't count it", () => {
    const round = new CardsRound(session([card("a"), card("b"), card("c")]));
    answer(round, 3);
    answer(round, 1);
    const c1 = round.nextCall(T0)!;
    round.callDone(c1, graded(c1, { a: { status: "conflict" }, b: { status: "gone" } }), T0);
    expect(round.notices.map((n) => `${n.fr} — ${n.text}`)).toEqual(["mot a — уже повторена", "mot b — слово удалено"]);
    expect(round.marks()).toEqual([]);
    expect(round.canUndo()).toBe(false);
    expect(round.queue.map((t) => t.card.word_id)).toEqual(["c"]);
  });

  it("sends at most GRADE_BATCH_MAX answers a call, one per card", () => {
    const cards = Array.from({ length: 23 }, (_, i) => card(`w${i}`));
    const round = new CardsRound(session(cards));
    answer(round, 3);
    const c1 = round.nextCall(T0)!;
    for (let i = 1; i < 23; i++) answer(round, 3, T0 + i);
    round.callDone(c1, graded(c1), T0 + 30);
    const c2 = round.nextCall(T0 + 30)!;
    expect(c2.kind === "grade" && c2.args.answers.length).toBe(20);
  });

  it("is stale after the study day: no more grades, «Обновить» asks for a new round", () => {
    const round = new CardsRound(session([card("a"), card("b")], { folder_label: "Еда, Жильё", folder_names: ["Еда", "Жильё"], direction: "fr_ru" }));
    const end = Date.parse(round.session.day_end);
    expect(round.stale(end - 1)).toBe(false);
    expect(round.stale(end)).toBe(true);
    round.flip();
    expect(round.grade(3, end)).toBe(false);
    expect(round.refreshMessage()).toBe("Повтори карточки здесь в чате, 5 карточек, по темам «Еда», «Жильё», только FR → RU.");
  });
});

describe("undo («Отменить последний ответ», Z)", () => {
  it("drops an answer not sent yet, the card back in front", () => {
    const round = new CardsRound(session([card("a"), card("b"), card("c")]));
    answer(round, 3);
    const c1 = round.nextCall(T0)!;
    answer(round, 1);
    expect(round.canUndo()).toBe(true);
    expect(round.undo()).toBe(true);
    expect(round.canUndo()).toBe(false);
    expect(round.queue.map((t) => t.card.word_id)).toEqual(["b", "c"]);
    expect(round.phase).toBe("question");
    round.callDone(c1, graded(c1), T0);
    expect(round.nextCall(T0)).toBeNull();
    expect(round.answers.map((a) => a.status)).toEqual(["saved", "undone"]);
  });

  it("undoes a saved answer with its result's undo; the card comes back with the restored expected", () => {
    const round = new CardsRound(session([card("a"), card("b")]));
    answer(round, 1);
    const c1 = round.nextCall(T0)!;
    round.callDone(c1, graded(c1, { a: { returns: MIN } }), T0);
    expect(round.queue.map((t) => t.card.word_id)).toEqual(["b", "a"]);
    round.undo();
    // Back in front, not at the end as well.
    expect(round.queue.map((t) => [t.card.word_id, t.attempt])).toEqual([["a", 1], ["b", 1]]);
    const u = round.nextCall(T0)!;
    expect(u.kind === "undo" && u.args).toEqual({ items: [{ log_id: "cr-a-e0-a", expected: "e1-a" }] });
    // Answered again before the undo's result: it waits behind it, and goes with the restored expected.
    answer(round, 3);
    expect(round.nextCall(T0)).toBeNull();
    round.callDone(u, { ok: true, data: { results: [{ log_id: "cr-a-e0-a", status: "undone", word_id: "a", direction: "fr_ru", key: "a:fr_ru", expected: "e2-a", intervals: { 1: "<1 мин", 2: "6 мин", 3: "1 д" }, due: at(0), state: 2 }] } }, T0);
    const again = round.nextCall(T0)!;
    expect(again.kind === "grade" && again.args.answers.map((a) => [a.word_id, a.expected])).toEqual([["a", "e2-a"]]);
    expect(round.marks()).toEqual(["first"]);
  });

  it("waits for an answer in flight, then undoes it; one whose result was lost is sent again first", () => {
    const round = new CardsRound(session([card("a"), card("b")]));
    answer(round, 3);
    const c1 = round.nextCall(T0)!;
    round.undo();
    expect(round.queue[0].card.word_id).toBe("a");
    expect(round.unsaved).toBe(0);
    round.callDone(c1, graded(c1), T0);
    const u1 = round.nextCall(T0)!;
    expect(u1.kind).toBe("undo");
    round.callDone(u1, { ok: true, data: { results: [{ log_id: "cr-a-e0-a", status: "undone", word_id: "a", direction: "fr_ru", key: "a:fr_ru", expected: "e2-a", intervals: null, due: null, state: 2 }] } }, T0);
    expect(round.answers[0].status).toBe("undone");

    answer(round, 2);
    const c2 = round.nextCall(T0)!;
    round.callLost(c2);
    round.undo();
    // Lost: it may be written, so it is sent again (already_saved), then undone.
    expect(round.retry()).toBe(true);
    const resend = round.nextCall(T0)!;
    expect(resend.kind === "grade" && resend.args.answers.map((a) => a.expected)).toEqual(["e2-a"]);
    round.callDone(resend, graded(resend, { a: { status: "already_saved" } }), T0);
    expect(round.nextCall(T0)?.kind).toBe("undo");
  });

  it("takes the undo from the server only: an already_saved answer graded over since can't be undone", () => {
    const round = new CardsRound(session([card("a"), card("b")]));
    answer(round, 3);
    const c1 = round.nextCall(T0)!;
    const over = (call: Call): CallOutcome => {
      const out = graded(call, { a: { status: "already_saved" } }) as { ok: true; data: Record<string, unknown> };
      return { ok: true, data: { ...out.data, undo: null } };
    };
    round.callDone(c1, over(c1), T0);
    expect(round.answers[0].status).toBe("saved");
    expect(round.canUndo()).toBe(false);
    expect(round.undo()).toBe(false);
    // Z while it was sending: «не отменилась», the card is not shown again.
    answer(round, 1);
    const c2 = round.nextCall(T0)!;
    round.undo();
    round.callDone(c2, over(c2), T0);
    expect(round.nextCall(T0)).toBeNull();
    expect(round.notices.map((n) => n.text)).toEqual(["не отменилась"]);
    expect(round.queue).toEqual([]);
  });

  it("keeps the answer when the card changed since (changed_since), and doesn't show it again", () => {
    const round = new CardsRound(session([card("a"), card("b")]));
    answer(round, 3);
    const c1 = round.nextCall(T0)!;
    round.callDone(c1, graded(c1), T0);
    round.undo();
    const u = round.nextCall(T0)!;
    round.callDone(u, { ok: true, data: { results: [{ log_id: "cr-a-e0-a", status: "changed_since", word_id: "a", direction: "fr_ru", key: "a:fr_ru", expected: "e9-a", intervals: null, due: null, state: 2 }] } }, T0);
    expect(round.queue.map((t) => t.card.word_id)).toEqual(["b"]);
    expect(round.notices[0].text).toBe("не отменилась: карточку уже изменили");
    expect(round.marks()).toEqual(["first"]);
  });
});

describe("a round «Тренировка»", () => {
  it("advances as the app's practice does, writes nothing, and undoes the last answer", () => {
    const round = new CardsRound(session([card("a"), card("b"), card("c"), card("d"), card("e")], { mode: "practice", scope: "today" }));
    answer(round, 1);
    expect(round.queue.map((t) => `${t.card.word_id}${t.attempt}`)).toEqual(["b1", "c1", "d1", "a2", "e1"]);
    answer(round, 2);
    expect(round.queue.map((t) => `${t.card.word_id}${t.attempt}`)).toEqual(["c1", "d1", "a2", "e1", "b2"]);
    round.undo();
    expect(round.queue.map((t) => `${t.card.word_id}${t.attempt}`)).toEqual(["b1", "c1", "d1", "a2", "e1"]);
    expect(round.nextCall(T0)).toBeNull();
    expect(round.saving).toBe(false);
    expect(saveLine(round, T0)).toBeNull();
    expect(round.marks()).toEqual(["miss"]);
    expect(round.remaining).toBe(0);
    expect(planLine(round.session, "ошибки сегодня")).toBe("Тренировка · ошибки сегодня");
  });
});

describe("what the page tells and sends", () => {
  it("tells Claude one line after saves and at the end", () => {
    const round = new CardsRound(session([card("a", { fr: "chelou", ru: "странный" }), card("b")]));
    answer(round, 1);
    const c1 = round.nextCall(T0)!;
    round.callDone(c1, graded(c1), T0);
    expect(round.contextLine()).toBe(
      "Карточки в чате «Повторение»: отвечено 1 из 2; сохранено оценок: 1; трудные: chelou (странный). Оценки ставит только сама карточка по нажатию пользователя — не ставь и не дублируй их.",
    );
    answer(round, 3);
    expect(round.contextLine()).toBe(
      "Карточки в чате «Повторение» пройдены: 2 карточки, 50 % верно; сохранено оценок: 1, не сохранено: 1; трудные: chelou (странный). Оценки ставит только сама карточка по нажатию пользователя — не ставь и не дублируй их. Ещё 12 к повторению сегодня.",
    );
    const practice = new CardsRound(session([card("a")], { mode: "practice" }));
    answer(practice, 3);
    expect(practice.contextLine()).toBe("Тренировка карточек в чате «Повторение» (без расписания, ничего не записано) пройдена: 1 карточка, 100 % верно.");
  });

  it("asks for the next round, and the exercise on the hard words with their ids", () => {
    const round = new CardsRound(session([card("a", { fr: "chelou" }), card("b", { fr: "la galère" }), card("c")], { folder_label: "Еда", folder_names: ["Еда"] }));
    answer(round, 1);
    answer(round, 2);
    answer(round, 3);
    expect(round.continueMessage()).toBe("Повтори карточки здесь в чате, ещё 5 карточек, по теме «Еда».");
    // A theme whose name holds a comma stays one theme.
    const comma = new CardsRound(session([card("a")], { folder_label: "Еда, напитки, Жильё", folder_names: ["Еда, напитки", "Жильё"] }));
    expect(comma.refreshMessage()).toBe("Повтори карточки здесь в чате, 5 карточек, по темам «Еда, напитки», «Жильё».");
    // Never fewer than play_cards takes (5): it plays the 3 that are left.
    const few = new CardsRound(session(Array.from({ length: 20 }, (_, i) => card(`w${i}`)), { remaining: 3 }));
    expect(few.continueMessage()).toBe("Повтори карточки здесь в чате, ещё 5 карточек.");
    expect(new CardsRound(session(Array.from({ length: 20 }, (_, i) => card(`w${i}`)), { remaining: 14 })).continueMessage()).toBe("Повтори карточки здесь в чате, ещё 14 карточек.");
    expect(round.mistakesMessage()).toBe("Сделай упражнение здесь в чате по ошибкам из карточек: la galère, chelou (word_ids: b, a).");
    expect(planLine(round.session, null)).toBe("12 к повт. · 4 новых");
  });

  it("words the requests the connector routes", () => {
    expect(cardsRequest({ size: 20, themes: [] })).toBe("Повтори карточки здесь в чате, 20 карточек.");
    expect(cardsRequest({ size: 21, themes: ["Еда", "Еда", "Жильё"], thenExercise: true })).toBe("Повтори карточки здесь в чате, 21 карточка, по темам «Еда», «Жильё», потом упражнение по ошибкам.");
    expect(practiceRequest({ scope: "all", size: 30, themes: ["Еда"] })).toBe("Потренируй карточки здесь в чате без расписания: все карточки, 30 карточек, по теме «Еда».");
    expect(themesPart([" "])).toBe("");
    expect(mistakesExerciseRequest(Array.from({ length: 35 }, (_, i) => ({ word_id: `w${i}`, fr: `m${i}` })))).toContain("w29).");
  });

  it("reads the rate limit's wait", () => {
    expect(rateLimitSeconds("Too many changes in a row. Wait 12 s and try again.")).toBe(12);
    expect(rateLimitSeconds("Too many changes")).toBe(3);
    expect(rateLimitSeconds("Слово не найдено")).toBeNull();
    expect([minutesText(30_000), minutesText(25 * MIN), minutesText(70 * MIN), minutesText(120 * MIN)]).toEqual(["1 мин", "25 мин", "1 ч 10 мин", "2 ч"]);
  });
});

describe("the card's faces", () => {
  it("numbers, sizes and labels as the app's card", () => {
    expect([callNumber("fr_ru", 7, false), callNumber("ru_fr", null, false), callNumber("fr_ru", 7, true)]).toEqual(["FR · № 007", "RU", "FR · ПРАКТИКА"]);
    expect([promptSize("se casser"), promptSize("avoir la flemme de bosser"), promptSize("ne pas être dans son assiette ce matin")]).toEqual(["q40", "q32", "q26"]);
    expect(gradeLabel(3, { 1: "<1 мин", 2: "6 мин", 3: "1 д" })).toBe("Знаю, следующий показ через 1 д");
    expect(gradeLabel(1, { 1: "<1 мин", 2: "6 мин", 3: "1 д" })).toBe("Не знаю, следующий показ меньше чем через минуту");
    expect(gradeLabel(2, null)).toBe("Сложно");
    expect([moreFields(1), moreFields(2), moreFields(5)]).toEqual(["+1 поле", "+2 поля", "+5 полей"]);
    expect(foldSummary(card("a", { note: "n", origin: "o" }))).toBe("заметка, происхождение");
    expect(foldSummary(card("a"))).toBe("тема");
  });

  it("finds the headword in its example to underline it", () => {
    const ex = "Allez, on se casse !";
    const m = exampleMatch(ex, "se casser")!;
    expect(ex.slice(...m)).toBe("se casse");
    expect(exampleMatch("Rien à voir.", "chelou")).toBeNull();
  });
});
