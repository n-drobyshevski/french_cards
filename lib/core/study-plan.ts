// «План повторения» (Settings → «Повторение» → «План повторения ›»): how many new words a day,
// the review cap, the order of new words, where new cards go and when the reverse side starts.
// Stored in the synced `user_prefs` row `study_plan`, so every device and the Claude connector
// plan the same day (lib/core/plan.ts `planDay`). Pure: shared by the app and the connector.
//
// Without a row the plan comes from the device's old «Новых карточек в день» (`Settings.new_per_day`,
// counted in cards): `new_words = clamp(ceil(new_per_day / 2), 1, 30)`, the rest the defaults.

export const STUDY_PLAN_PREF = "study_plan";

/** Order of new words: by level and frequency (themes in turn), theme by theme (01 → 35), or as added. */
export type NewOrder = "level" | "themes" | "added";
/** Where new cards go: interleaved with the reviews (Anki-style) or after them. */
export type PlanMix = "mixed" | "after";
/**
 * When the RU→FR side of a word starts:
 * - "after": once FR→RU holds (a review card with stability ≥ 3 days), with its own daily allowance;
 * - "together" («Назавтра», the rule before the plan): the day after FR→RU was first learned, sharing
 *   the daily limit with FR→RU — in this mode `new_words` counts cards, as `new_per_day` did;
 * - "recognition": never (FR→RU only).
 */
export type PlanRuFr = "after" | "together" | "recognition";

export interface StudyPlan {
  /** Ceiling of new words a day (0–30); the adaptive budget never goes above it. */
  new_words: number;
  /** Most interday reviews a day (50–999); null = no limit. */
  review_cap: number | null;
  new_order: NewOrder;
  mix: PlanMix;
  ru_fr: PlanRuFr;
}

export const NEW_WORDS_MIN = 0;
export const NEW_WORDS_MAX = 30;
export const REVIEW_CAP_MIN = 50;
export const REVIEW_CAP_MAX = 999;
export const REVIEW_CAP_STEP = 25;
/** The cap the load throttle measures against when there is no cap. */
export const DEFAULT_REVIEW_CAP = 200;

export const NEW_ORDERS: readonly NewOrder[] = ["level", "themes", "added"];
export const PLAN_MIXES: readonly PlanMix[] = ["mixed", "after"];
export const PLAN_RU_FR: readonly PlanRuFr[] = ["after", "together", "recognition"];

export const DEFAULT_STUDY_PLAN: StudyPlan = { new_words: 10, review_cap: DEFAULT_REVIEW_CAP, new_order: "level", mix: "mixed", ru_fr: "after" };

/** The queue as it was before the plan (oldest words first, new cards after the reviews, no cap). */
export const LEGACY_STUDY_PLAN: Omit<StudyPlan, "new_words"> = { review_cap: null, new_order: "added", mix: "after", ru_fr: "together" };

export const NEW_ORDER_LABELS: Record<NewOrder, string> = {
  level: "По уровню и частоте",
  themes: "По темам",
  added: "Как добавлены",
};

export const PLAN_MIX_LABELS: Record<PlanMix, string> = {
  mixed: "Вперемешку",
  after: "После повторений",
};

export const PLAN_RU_FR_LABELS: Record<PlanRuFr, string> = {
  after: "Когда запомнится",
  together: "Назавтра",
  recognition: "Не показывать",
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A count of new words in range (0–30, whole). */
export const clampNewWords = (n: number) => clamp(Math.round(n), NEW_WORDS_MIN, NEW_WORDS_MAX);

/** A review cap in range (50–999, whole), or null for none. */
export const clampReviewCap = (n: number | null): number | null => (n === null ? null : clamp(Math.round(n), REVIEW_CAP_MIN, REVIEW_CAP_MAX));

/** The plan for a device without a `study_plan` row, from its «Новых карточек в день» (cards). */
export function migrateStudyPlan(newPerDay: number): StudyPlan {
  const n = Number.isFinite(newPerDay) ? newPerDay : 15;
  return { ...DEFAULT_STUDY_PLAN, new_words: clamp(Math.ceil(n / 2), 1, NEW_WORDS_MAX) };
}

/** A stored value read back safely: a missing or unknown field takes its value from `fallback`. */
export function parseStudyPlan(value: unknown, fallback: StudyPlan = DEFAULT_STUDY_PLAN): StudyPlan {
  const v = (value !== null && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const pick = <T extends string>(x: unknown, all: readonly T[], dflt: T): T => (all.includes(x as T) ? (x as T) : dflt);
  return {
    new_words: num(v.new_words) ? clampNewWords(v.new_words as number) : fallback.new_words,
    review_cap: v.review_cap === null ? null : num(v.review_cap) ? clampReviewCap(v.review_cap as number) : fallback.review_cap,
    new_order: pick(v.new_order, NEW_ORDERS, fallback.new_order),
    mix: pick(v.mix, PLAN_MIXES, fallback.mix),
    ru_fr: pick(v.ru_fr, PLAN_RU_FR, fallback.ru_fr),
  };
}

export const sameStudyPlan = (a: StudyPlan, b: StudyPlan) =>
  a.new_words === b.new_words && a.review_cap === b.review_cap && a.new_order === b.new_order && a.mix === b.mix && a.ru_fr === b.ru_fr;

/** Russian plural: 1 слово, 2 слова, 5 слов. */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** The row's summary under «План повторения ›»: «10 слов в день · до 200 повторений». */
export function studyPlanSummary(plan: StudyPlan): string {
  const words = `${plan.new_words} ${plural(plan.new_words, "слово", "слова", "слов")} в день`;
  const cap = plan.review_cap === null ? "без лимита повторений" : `до ${plan.review_cap} повторений`;
  return `${words} · ${cap}`;
}
