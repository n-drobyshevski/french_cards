import { describe, expect, it } from "vitest";
import type { PlanFit, PlanSuggestion } from "@/lib/core/plan-fit";
import { planSubline } from "@/components/progress/format";
import { appliedMessage, approxRange, fitLine, fitSparkAria, suggestionCopy, visibleSuggestion } from "./plan-fit-format";

const NB = " ";

/** The brief's surplus sample: plan 10 · до 200, 12 study days, 10 new on 11, reviews 58, forecast 64, 89 %. */
function fit(over: Partial<Omit<PlanFit, "newWords" | "reviews" | "retention">> & {
  newWords?: Partial<PlanFit["newWords"]>;
  reviews?: Partial<PlanFit["reviews"]>;
  retention?: Partial<PlanFit["retention"]>;
} = {}): PlanFit {
  const { newWords, reviews, retention, ...rest } = over;
  return {
    week: "2026-W43",
    window: { days: 14, active: 12, from: "2026-10-12", to: "2026-10-25" },
    planSince: "2026-09-01",
    fit: "room",
    suggestion: null,
    dismissedUntil: null,
    ...rest,
    newWords: {
      plan: 10,
      unit: "words",
      typical: 10,
      p60: 10,
      max: 10,
      fullDays: 11,
      budgetDays: 12,
      planDays: 12,
      held: { load: 1, accuracy: 0, backlog: 0, known: 12 },
      ...newWords,
    },
    reviews: { cap: 200, typical: 58, allTypical: 81, max: 96, forecast7: 64, backlogDays: 0, capHitDays: 0, ...reviews },
    retention: { rate: 0.89, target: 0.9, answers: 640, ...retention },
  };
}

function raise(over: Partial<PlanSuggestion> = {}): PlanSuggestion {
  return { kind: "raise_new", from: 10, to: 15, alt: null, forecast30: { now: 64, then: [82, 89] }, why: ["full_days", "low_load", "retention_ok"], confidence: "medium", ...over };
}

function lower(over: Partial<PlanSuggestion> = {}): PlanSuggestion {
  return { kind: "lower_new", from: 10, to: 6, alt: { review_cap: 250 }, forecast30: { now: 172, then: [138, 158] }, why: ["backlog", "cap_hit"], confidence: "high", ...over };
}

describe("the fit line (Plan-Fit-States)", () => {
  it("room: the whole plan, reviews by old cards, «верно»", () => {
    const line = fitLine(fit());
    expect(line?.text).toBe(`За 2 недели обычно: все 10 новых · 58 повторений по старым карточкам · верно 89${NB}%`);
    expect(line?.aria).toBe(
      `За 2 недели, 12 учебных дней: все 10 новых — в 11 днях; 1 день план придержал новые — на неделе много повторений; повторений по старым карточкам обычно 58 в день; верно 89${NB}%.`,
    );
  });

  it("on plan: «Темп по плану…» and «до 200 далеко» only while far", () => {
    expect(fitLine(fit({ fit: "fits" }))?.text).toBe("Темп по плану: обычно 10 новых, 58 повторений по старым карточкам — до 200 далеко.");
    expect(fitLine(fit({ fit: "fits", reviews: { typical: 130, forecast7: 140 } }))?.text).toBe("Темп по плану: обычно 10 новых, 130 повторений по старым карточкам.");
  });

  it("fewer new words than the plan allows: information only, the plan a separate fact", () => {
    const line = fitLine(fit({ fit: "fits", window: { days: 14, active: 7, from: "2026-10-15", to: "2026-10-25" }, newWords: { typical: 6, fullDays: 0, planDays: 7 } }));
    expect(line?.text).toBe("Обычно 6 новых · до 10 по плану · за 7 учебных дней");
    expect(line?.text).not.toMatch(/из|\//);
  });

  it("heavy: the backlog names the cards, not her", () => {
    const line = fitLine(fit({ fit: "heavy", reviews: { forecast7: 172, backlogDays: 4 }, retention: { rate: 0.84 } }));
    expect(line?.text).toBe("4 дня повторений было больше лимита — новые подождали. Карточки никуда не делись.");
  });

  it("heavy by the week's load or by accuracy", () => {
    expect(fitLine(fit({ fit: "heavy", reviews: { forecast7: 172 } }))?.text).toBe("На неделе впереди около 172 повторений в день — новые план придерживает сам.");
    expect(fitLine(fit({ fit: "heavy", retention: { rate: 0.8 } }))?.text).toBe(`Верно за 4 недели 80${NB}% — расписание рассчитано на 90${NB}%.`);
    // One or two backlog days don't lower (the engine wants 3+): the cause named is accuracy.
    expect(fitLine(fit({ fit: "heavy", reviews: { forecast7: 120, backlogDays: 1 }, retention: { rate: 0.8 } }))?.text).toMatch(/^Верно за 4 недели/);
  });

  it("warming up renders nothing, nor does a «low» suggestion", () => {
    expect(fitLine(fit({ fit: "warming_up" }))).toBeNull();
    expect(fitLine(undefined)).toBeNull();
    expect(visibleSuggestion(fit({ fit: "warming_up", suggestion: raise({ confidence: "low" }) }))).toBeNull();
    expect(visibleSuggestion(fit({ suggestion: raise({ confidence: "low" }) }))).toBeNull();
    expect(visibleSuggestion(fit({ suggestion: raise() }))?.to).toBe(15);
  });
});

describe("the suggestion row", () => {
  it("raise: «Можно брать 15 в день», the forecast rounded out", () => {
    expect(suggestionCopy(raise())).toEqual({
      title: "Можно брать 15 в день",
      apply: "Поставить 15",
      applyAria: "Поставить 15 новых слов в день",
      more: `≈${NB}80–90 повторений в день через месяц · вернуть можно в любой момент`,
      alt: null,
    });
  });

  it("lower: fewer reviews, and «или до 250 повторений»", () => {
    const copy = suggestionCopy(lower());
    expect(copy.title).toBe("Можно поставить 6 в день — повторений станет меньше");
    expect(copy.alt?.label).toBe("или до 250 повторений");
    expect(copy.more).toBe(`≈${NB}135–160 повторений в день через месяц · вернуть можно в любой момент`);
  });

  it("the snackbar after «Поставить»", () => {
    expect(appliedMessage("new_words", 15)).toBe("Новых слов: 15 в день");
    expect(appliedMessage("new_words", 15, "cards")).toBe("Новых карточек: 15 в день");
    expect(appliedMessage("review_cap", 250)).toBe("Повторений: до 250 в день");
  });

  it("ranges", () => {
    expect(approxRange([82, 89])).toBe(`≈${NB}80–90`);
    expect(approxRange([150, 150])).toBe(`≈${NB}150`);
    expect(approxRange([12, 14])).toBe(`≈${NB}12–14`);
  });
});

// --- Every string the module can make keeps the non-punitive rules (N1–N7) ----------------------------

const BANNED = /провал|пропуск|пропущ|долг|отста[её]|не выполнен|норм|сгорит|потеря|цел[ьи]|задани|перевыполн|молодец|отлично|\+\s?\d/i;
const YOU = /(^|[^а-яё])(вы|вам|вас|ваш)([^а-яё]|$)/i;

/** «x/N» or «x из N» with x < N (N2). */
function shortRatio(s: string): string | null {
  for (const re of [/(\d+)\s*\/\s*(\d+)/g, /(\d+)\s+из\s+(\d+)/g]) {
    for (const m of s.matchAll(re)) if (Number(m[1]) < Number(m[2])) return m[0];
  }
  return null;
}

function* fits(): Generator<PlanFit> {
  const kinds: PlanFit["fit"][] = ["warming_up", "fits", "room", "heavy"];
  for (const kind of kinds)
    for (const plan of [1, 3, 6, 10, 30])
      for (const typical of [null, 0, 1, 5, plan - 1, plan, plan + 2])
        for (const reviewsTypical of [null, 1, 58])
          for (const cap of [null, 200])
            for (const forecast7 of [0, 64, 172])
              for (const backlogDays of [0, 4])
                for (const rate of [null, 0.74, 0.89])
                  for (const held of [
                    { load: 0, accuracy: 0, backlog: 0, known: 0 },
                    { load: 1, accuracy: 0, backlog: 0, known: 7 },
                    { load: 0, accuracy: 2, backlog: 1, known: 12 },
                  ])
                    yield fit({
                      fit: kind,
                      window: { days: 14, active: 7 + (plan % 6), from: "2026-10-12", to: "2026-10-25" },
                      newWords: { plan, typical: typical === null ? null : Math.max(0, typical), fullDays: Math.min(11, plan), planDays: 7 + (plan % 6), held, unit: plan === 30 ? "cards" : "words" },
                      reviews: { typical: reviewsTypical, cap, forecast7, backlogDays: cap === null ? 0 : backlogDays },
                      retention: { rate },
                      suggestion: kind === "heavy" ? lower({ to: Math.max(3, Math.round(plan * 0.6)), alt: cap ? { review_cap: cap + 50 } : null }) : raise({ to: plan + 5 }),
                    });
}

describe("the copy rules", () => {
  it("no banned word, no «вы», no ratio below the plan, no NaN — in every string", () => {
    let checked = 0;
    const bad = new Set<string>();
    for (const f of fits()) {
      const out: string[] = [];
      const line = fitLine(f);
      if (line) out.push(line.text, line.aria);
      const s = visibleSuggestion(f);
      if (s) {
        const c = suggestionCopy(s, f.newWords.unit);
        out.push(c.title, c.apply, c.applyAria, c.more, ...(c.alt ? [c.alt.label, c.alt.aria] : []));
        out.push(appliedMessage("new_words", s.to, f.newWords.unit));
        if (s.alt) out.push(appliedMessage("review_cap", s.alt.review_cap));
      }
      if (f.fit !== "warming_up") out.push(fitSparkAria(f, [{ day: "2026-10-24", value: 6 }, { day: "2026-10-25", value: f.newWords.plan }], "2026-10-25"));
      out.push(planSubline(f.newWords.typical, f.newWords.plan) ?? "");
      if (f.fit === "warming_up" && (line || s)) bad.add(`warming up rendered: ${line?.text ?? s?.to}`);
      for (const text of out) {
        checked++;
        if (BANNED.test(text) || YOU.test(text) || shortRatio(text) || /NaN|undefined|null|Infinity|из 14/.test(text)) bad.add(text);
      }
    }
    expect([...bad]).toEqual([]);
    expect(checked).toBeGreaterThan(10_000);
  });
});
