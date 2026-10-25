// «План и прогресс» copy (picks D1 A, D2 A; mockups/Plan-Fit-A-Settings, Plan-Fit-States,
// D-Plan-Fit-A): the one fit line under «Новых слов в день», the suggestion row and its fold, and
// the snackbar after «Поставить». Pure: no React, no Dexie. lib/core/plan-fit.ts `planFit` decides;
// this only words it, following the non-punitive rules of the brief:
// - N1 the plan is a ceiling, «до N» (never a goal or a quota);
// - N2 «a/N» or «a из N» only when a = N: below it the plan is a separate fact («обычно 6 · до 10 по плану»);
// - N3 study days only (days off are not data: no 0, no «из 14 дней»);
// - N4 a held day names the plan or the cards as the subject («план придержал»);
// - N5 surplus without praise (no «+N»);
// - N6 none of the banned words (plan-fit-format.test.ts);
// - N7 not enough data renders nothing (`fit: "warming_up"`, a "low" suggestion).
// Reviews here are the plan's (interday answers, what the cap counts), «по старым карточкам», so the
// fit's 58 doesn't read against the Progress ledger's «в среднем 81» (every answer).
import { pluralRu } from "@/components/review/format";
import { FIT_MIN_ANSWERS, FIT_TARGET, type PlanFit, type PlanSuggestion } from "@/lib/core/plan-fit";
import { DEFAULT_REVIEW_CAP } from "@/lib/core/study-plan";

const NBSP = " ";

const REVIEWS = ["повторение", "повторения", "повторений"] as const;
const DAYS = ["день", "дня", "дней"] as const;
const DAYS_IN = ["дне", "днях", "днях"] as const;
const STUDY_DAYS = ["учебный день", "учебных дня", "учебных дней"] as const;
const NEW_ADJ = ["новое", "новых", "новых"] as const;
const NEW_WORDS = ["новое слово", "новых слова", "новых слов"] as const;
const NEW_CARDS = ["новая карточка", "новых карточки", "новых карточек"] as const;

const count = (n: number, forms: readonly [string, string, string]) => `${n} ${pluralRu(n, forms)}`;
const pct = (rate: number) => `${Math.round(rate * 100)}${NBSP}%`;

/** «≈ 80–90»: a range rounded out to fives (to ones below 20); one number when the ends meet. */
export function approxRange([lo, hi]: readonly [number, number]): string {
  const a = Math.max(0, Math.min(lo, hi));
  const b = Math.max(lo, hi);
  const step = b < 20 ? 1 : 5;
  const from = Math.floor(a / step) * step;
  const to = Math.ceil(b / step) * step;
  return from === to ? `≈${NBSP}${from}` : `≈${NBSP}${from}–${to}`;
}

/** The suggestion Settings may show: none while warming up, and never a "low" one (connector only). */
export function visibleSuggestion(fit: PlanFit | undefined | null): PlanSuggestion | null {
  if (!fit || fit.fit === "warming_up") return null;
  const s = fit.suggestion;
  return s && s.confidence !== "low" ? s : null;
}

/** «все 10 новых» when the usual day takes the whole plan; otherwise null (N2: no «6 из 10»). */
function allNew(fit: PlanFit): string | null {
  const { plan, typical } = fit.newWords;
  if (typical === null || typical < plan) return null;
  return plan > 1 ? `все ${plan} новых` : `${plan} ${NEW_ADJ[0]}`;
}

/** «58 повторений по старым карточкам» (interday answers), or null without any. */
function oldReviews(fit: PlanFit): string | null {
  const r = fit.reviews.typical;
  return r !== null && r > 0 ? `${count(r, REVIEWS)} по старым карточкам` : null;
}

const retentionCounted = (fit: PlanFit) => fit.retention.rate !== null && fit.retention.answers >= FIT_MIN_ANSWERS;

/** Why the plan is heavy, in the brief's order: a backlog with a loaded week, the week's load, accuracy. */
function heavyCause(fit: PlanFit): "backlog" | "load" | "accuracy" | null {
  const loadCap = fit.reviews.cap ?? DEFAULT_REVIEW_CAP;
  const f7 = fit.reviews.forecast7;
  // As lib/core/plan-fit.ts lowers: a backlog on 3+ days with the coming week loaded.
  if (fit.reviews.cap !== null && fit.reviews.backlogDays >= 3 && f7 > 0.5 * loadCap) return "backlog";
  if (f7 > 0.8 * loadCap) return "load";
  if (retentionCounted(fit) && fit.retention.rate! < FIT_TARGET - 0.05 + 1e-9) return "accuracy";
  if (fit.reviews.cap !== null && fit.reviews.backlogDays > 0) return "backlog";
  return null;
}

/** «1 день план придержал новые — на неделе много повторений» (N4), for the accessible name. */
function heldClause(fit: PlanFit): string | null {
  const { load, accuracy, backlog, known } = fit.newWords.held;
  if (known === 0) return null;
  const total = load + accuracy + backlog;
  if (total === 0) return null;
  const why =
    load >= accuracy && load >= backlog
      ? "на неделе много повторений"
      : accuracy >= backlog
        ? "точность за неделю падала"
        : "повторений было больше лимита";
  return `${count(total, DAYS)} план придержал новые — ${why}`;
}

export interface FitLineCopy {
  /** The italic muted line under the stepper. */
  text: string;
  /** Its accessible name: the same facts with their base («12 учебных дней»). */
  aria: string;
}

/**
 * The one line under «Новых слов в день» (Plan-Fit-States): room «За 2 недели обычно: все 10 новых ·
 * 58 повторений по старым карточкам · верно 89 %»; on plan «Темп по плану: обычно 10 новых, 58
 * повторений по старым карточкам — до 200 далеко.»; fewer new words than allowed «Обычно 6 новых ·
 * до 10 по плану · за 7 учебных дней» (information only); heavy «4 дня повторений было больше лимита
 * — новые подождали. Карточки никуда не делись.». Null while warming up, or with nothing to say.
 */
export function fitLine(fit: PlanFit | undefined | null): FitLineCopy | null {
  if (!fit || fit.fit === "warming_up") return null;
  const { plan, typical, planDays } = fit.newWords;
  const cap = fit.reviews.cap;
  const active = fit.window.active;
  const base = `За 2 недели, ${count(active, STUDY_DAYS)}`;
  const reviews = oldReviews(fit);
  const rate = retentionCounted(fit) ? `верно ${pct(fit.retention.rate!)}` : null;
  const held = heldClause(fit);
  const ariaTail = [held, reviews && `повторений по старым карточкам обычно ${fit.reviews.typical} в день`, rate]
    .filter(Boolean)
    .join("; ");
  const all = allNew(fit);

  if (fit.fit === "heavy") {
    const cause = heavyCause(fit);
    if (cause === "backlog") {
      const text = `${count(fit.reviews.backlogDays, DAYS)} повторений было больше лимита — новые подождали. Карточки никуда не делись.`;
      return { text, aria: `${base}: ${text}` };
    }
    if (cause === "load") {
      // «около» takes the genitive: «около 172 повторений».
      const text = `На неделе впереди около ${fit.reviews.forecast7} повторений в день — новые план придерживает сам.`;
      return { text, aria: `${base}: ${text}${cap !== null ? ` Повторений в день до ${cap} по плану.` : ""}` };
    }
    if (cause === "accuracy") {
      const text = `Верно за 4 недели ${pct(fit.retention.rate!)} — расписание рассчитано на ${pct(fit.retention.target)}.`;
      return { text, aria: `${base}: ${text}` };
    }
    return null;
  }

  if (typical === null) return null;

  if (fit.fit === "room") {
    const news = all ?? `${count(typical, NEW_ADJ)} · до ${plan} по плану`;
    const text = ["За 2 недели обычно: " + news, reviews, rate].filter(Boolean).join(" · ");
    const fullPart =
      all && fit.newWords.fullDays > 0 ? `${all} — в ${count(fit.newWords.fullDays, DAYS_IN)}` : `обычно ${count(typical, NEW_ADJ)}, до ${plan} по плану`;
    return { text, aria: `${base}: ${[fullPart, ariaTail].filter(Boolean).join("; ")}.` };
  }

  // "fits": on plan, or fewer new words than the plan allows (information only, Q2).
  if (typical < plan) {
    if (typical === 0) return null;
    const text = `Обычно ${count(typical, NEW_ADJ)} · до ${plan} по плану · за ${count(planDays, STUDY_DAYS)}`;
    return { text, aria: `${[`Обычно ${count(typical, NEW_ADJ)} в день, до ${plan} по плану, за ${count(planDays, STUDY_DAYS)}`, held].filter(Boolean).join("; ")}.` };
  }
  const far = cap !== null && fit.reviews.typical !== null && fit.reviews.typical <= cap / 2 && fit.reviews.forecast7 <= cap / 2;
  const text = `Темп по плану: обычно ${count(plan, NEW_ADJ)}${reviews ? `, ${reviews}` : ""}${far ? ` — до ${cap} далеко` : ""}.`;
  return { text, aria: `${base}: ${[`обычно ${count(plan, NEW_ADJ)} в день, до ${plan} по плану`, ariaTail].filter(Boolean).join("; ")}${far ? `; до ${cap} повторений далеко` : ""}.` };
}

export interface SuggestionCopy {
  /** «Можно брать 15 в день» / «Можно поставить 6 в день — повторений станет меньше». */
  title: string;
  /** «Поставить 15» */
  apply: string;
  /** «Поставить 15 новых слов в день» */
  applyAria: string;
  /** The fold (phones) or the caption (desktop): «≈ 80–90 повторений в день через месяц · вернуть можно в любой момент». */
  more: string;
  /** A lower suggestion's second option: «или до 250 повторений». */
  alt: { label: string; aria: string } | null;
}

/** The suggestion row's words. `unit` is the plan's (`fit.newWords.unit`). */
export function suggestionCopy(s: PlanSuggestion, unit: PlanFit["newWords"]["unit"] = "words"): SuggestionCopy {
  const forms = unit === "cards" ? NEW_CARDS : NEW_WORDS;
  const [lo, hi] = s.forecast30.then;
  const reviews = `${approxRange([lo, hi])} ${pluralRu(Math.max(lo, hi), REVIEWS)} в день через месяц · вернуть можно в любой момент`;
  return {
    title: s.kind === "raise_new" ? `Можно брать ${s.to} в день` : `Можно поставить ${s.to} в день — повторений станет меньше`,
    apply: `Поставить ${s.to}`,
    applyAria: `Поставить ${count(s.to, forms)} в день`,
    more: reviews,
    alt: s.alt ? { label: `или до ${s.alt.review_cap} повторений`, aria: `Или до ${s.alt.review_cap} повторений в день, новых оставить до ${s.from}` } : null,
  };
}

/** The snackbar after «Поставить»: «Новых слов: 15 в день» / «Повторений: до 250 в день». */
export function appliedMessage(option: "new_words" | "review_cap", value: number | null, unit: PlanFit["newWords"]["unit"] = "words"): string {
  if (option === "review_cap") return value === null ? "Повторений: без лимита" : `Повторений: до ${value} в день`;
  return `${unit === "cards" ? "Новых карточек" : "Новых слов"}: ${value ?? 0} в день`;
}

/** The desktop sparkline's name: «Новых слов в день за 2 недели, 12 учебных дней: …; пунктир — план, до 10 в день; сегодня 10». */
export function fitSparkAria(fit: PlanFit, points: readonly { day: string; value: number }[], today: string): string {
  const unit = fit.newWords.unit === "cards" ? "Новых карточек в день" : "Новых слов в день";
  const values = points.map((p) => p.value);
  const spread = values.length ? (Math.min(...values) === Math.max(...values) ? `${values[0]} каждый учебный день` : `от ${Math.min(...values)} до ${Math.max(...values)}`) : "";
  const now = points.find((p) => p.day === today);
  return [
    `${unit} за 2 недели, ${count(fit.window.active, STUDY_DAYS)}${spread ? `: ${spread}` : ""}`,
    heldClause(fit),
    `пунктир — план, до ${fit.newWords.plan} в день`,
    now && `сегодня ${now.value}`,
  ]
    .filter(Boolean)
    .join("; ");
}
