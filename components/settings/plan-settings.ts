// Pure helpers for the «План повторения» screen (board Review-Settings-C, desktop D-Review-Settings):
// option copy, the review-cap stepper's steps and the «01 → 35» theme range.
import {
  REVIEW_CAP_MAX,
  REVIEW_CAP_MIN,
  REVIEW_CAP_STEP,
  type NewOrder,
  type PlanMix,
  type PlanRuFr,
} from "@/lib/core/study-plan";

export interface PlanOptionCopy {
  label: string;
  /** Phones: the caption under the label (sentence case); desktop lowercases it after the label. */
  caption: string;
}

export const NEW_ORDER_COPY: Record<NewOrder, PlanOptionCopy> = {
  level: { label: "По уровню языка", caption: "Сначала A1–B2, частые раньше" },
  themes: { label: "По темам", caption: "По порядку тем" },
  added: { label: "Как добавлены", caption: "Старые сначала" },
};

export const RU_FR_COPY: Record<PlanRuFr, PlanOptionCopy> = {
  after: { label: "После 3 дней узнавания", caption: "Когда FR → RU продержится 3 дня" },
  together: { label: "Назавтра", caption: "Со следующего дня, как сейчас" },
  recognition: { label: "Только узнавание", caption: "RU → FR не показывать" },
};

/** «Новые»: phones' segmented labels and the desktop's text options. */
export const MIX_LABELS: Record<PlanMix, { phone: string; desk: string }> = {
  mixed: { phone: "Вперемешку", desk: "Вперемешку с повторением" },
  after: { phone: "После повторения", desk: "После повторения" },
};

/** A caption on the desktop: lowercase after the label, except where it starts with a name («RU → FR…»). */
export function deskCaption(caption: string): string {
  return /^[A-ZА-ЯЁ]{2}/.test(caption) || /^\d/.test(caption) ? caption : caption.charAt(0).toLowerCase() + caption.slice(1);
}

/** The theme's leading number as written («03 Жильё» → «03»), or null. */
export function themeNumber(name: string): string | null {
  return /^\s*(\d{1,3})(?!\d)/.exec(name)?.[1] ?? null;
}

/**
 * «01 → 35»: the first and last numbered themes in their order, when at least two are numbered;
 * null otherwise (the caption then reads «По порядку тем»).
 */
export function themeRange(names: readonly string[]): string | null {
  const numbers = names.map(themeNumber).filter((n): n is string => n !== null);
  if (numbers.length < 2 || numbers[0] === numbers.at(-1)) return null;
  return `${numbers[0]} → ${numbers.at(-1)}`;
}

/** «По темам»'s caption: «01 → 35, по порядку тем», or «По порядку тем». */
export function themesCaption(names: readonly string[]): string {
  const range = themeRange(names);
  return range ? `${range}, по порядку тем` : NEW_ORDER_COPY.themes.caption;
}

/** The last cap on the stepper's grid of 25s (50, 75 … 975); one more step is «без лимита». */
export const REVIEW_CAP_TOP = REVIEW_CAP_MIN + Math.floor((REVIEW_CAP_MAX - REVIEW_CAP_MIN) / REVIEW_CAP_STEP) * REVIEW_CAP_STEP;

/**
 * «Повторений в день» stepper: 50 … 975 in steps of 25, then null («без лимита»); from «без
 * лимита» one step down is 975. An off-grid cap (set elsewhere) snaps to the grid.
 */
export function stepReviewCap(cap: number | null, delta: 1 | -1): number | null {
  if (cap === null) return delta < 0 ? REVIEW_CAP_TOP : null;
  const offset = cap - REVIEW_CAP_MIN;
  if (delta > 0) {
    const next = REVIEW_CAP_MIN + (Math.floor(offset / REVIEW_CAP_STEP) + 1) * REVIEW_CAP_STEP;
    return next > REVIEW_CAP_TOP ? null : next;
  }
  const prev = REVIEW_CAP_MIN + (Math.ceil(offset / REVIEW_CAP_STEP) - 1) * REVIEW_CAP_STEP;
  return Math.max(REVIEW_CAP_MIN, prev);
}
