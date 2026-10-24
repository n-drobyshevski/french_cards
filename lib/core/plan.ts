// «План дня»: today's review queue and new-word budget. Pure (no Dexie, no ts-fsrs, no clock):
// lib/session.ts `loadSession` and the connector's `study_summary` both call `planDay`, so the app
// and Claude agree on the day.
//
// Start-of-day snapshot: `s0(card)` is the `prev` of the card's first live log today (the current
// state when it has none). The snapshot alone decides the budgets, the backlog, the reviews due
// today, burying and RU→FR unlocks, so the totals stay steady while studying, an undo (which
// tombstones the log) rolls them back, and every device agrees once `review_log` has synced. The
// current state only decides which bucket a card is in now.
//
// queue = [...L-due, ...mix(R, N), ...L-ahead]
//   L-due    learning / relearning cards due by now, always first;
//   R        review cards due today (s0), not reviewed yet, after bury and the cap;
//   N        new FR→RU words picked for today, plus unlocked RU→FR cards;
//   L-ahead  learning cards due within 20 min (shown when nothing else is left);
//   waiting  learning cards due later today: not shown (the «через N мин» screen), counted in `due`.
import type { Direction, Folder, ReviewLog, ReviewState, Word } from "../types";
import { DEFAULT_REVIEW_CAP, type StudyPlan } from "./study-plan";
import { searchKey } from "./text";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Learning cards due this soon are shown now; later ones wait. */
export const LEARN_AHEAD_MS = 20 * MIN;
/** The two directions of a word are never this close in the queue (positions). */
export const SIBLING_GAP = 5;
/** RU→FR unlocks once FR→RU is a review card with at least this stability (days). */
export const RU_FR_UNLOCK_DAYS = 3;
/** Young reviews (pre-stability below this, days) measure the recent success rate. */
export const YOUNG_STABILITY_DAYS = 21;
/** Below this success rate of young reviews over 7 days, the new-word budget halves… */
export const ACCURACY_MIN = 0.8;
/** …when there are at least this many of them. */
export const ACCURACY_MIN_LOGS = 30;
/** Levels above the target count as «later» in the `level` order. */
export const LEVEL_TARGET = "B2";
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Why today's new-word budget is what it is, most important first. */
export type PlanReason = "backlog" | "load" | "accuracy" | "limit" | "empty";

/** One card in the queue (lib/session.ts `QueueItem`). */
export interface PlanItem {
  /** review_state id: `${word_id}:${direction}` */
  key: string;
  word: Word;
  state: ReviewState;
  direction: Direction;
  isNew: boolean;
}

export interface PlanInput {
  now: Date;
  dayStart: Date;
  dayEnd: Date;
  /** Live cards. Cards of words not in `words` are ignored. */
  states: readonly ReviewState[];
  /** Live words not «на паузе»: the budgets, the cap and the forecast are global over these. */
  words: ReadonlyMap<string, Word>;
  /** The session filter (theme, set): narrows only which cards are picked. Default: every word. */
  match?: (w: Word) => boolean;
  /** One direction only: its cards are shown without burying or sibling spacing (the day's numbers still bury). */
  direction?: Direction;
  /** Live review logs of the study day [dayStart, dayEnd), of any word (deleted ones too). */
  todayLogs: readonly ReviewLog[];
  /** Live review logs of the 7 days before dayStart. */
  logs7d: readonly ReviewLog[];
  plan: StudyPlan;
  /** «Всё равно добавить новые» for today (device-local): lifts every throttle up to the ceiling. */
  overrideNewToday?: boolean;
  /** Recall probability of a card at a time (lib/scheduler `retrievability`). */
  r: (s: ReviewState, at: Date) => number;
  /** A word's CEFR level ("A1"…"C2"), if known. */
  level?: (w: Word) => string | null;
  /** A word's Lexique frequency (per million), if known. */
  freq?: (w: Word) => number | null;
  /** Theme order (folder id → index; null = «Входящие»). Unknown themes go last. */
  folderOrder?: ReadonlyMap<string | null, number>;
  /** Spread new words over themes (the per-theme limit). Default true; off when the session is one theme. */
  spreadThemes?: boolean;
}

export interface DayPlan {
  /** `plan.new_words`: the most new words a day. */
  ceiling: number;
  /** New FR→RU words for today (in "together" mode: new cards of both directions). */
  budget: number;
  /** New FR→RU words introduced today, every theme («together»: new cards of both directions). */
  newToday: number;
  /** Still to introduce today: budget − newToday. */
  newLeft: number;
  /** RU→FR sides still allowed today ("after" mode; 0 otherwise). */
  ruLeft: number;
  /** RU→FR sides introduced today. */
  ruToday: number;
  reason: PlanReason;
  /** More reviews due today than the cap. */
  backlog: boolean;
  /** «Всё равно добавить новые» is on for today. */
  override: boolean;
  /** The override would add words: the budget is below the ceiling and it is not on yet. */
  canOverride: boolean;
  cap: number | null;
  /** Interday reviews done today (logs whose pre-state was Review). */
  capDone: number;
  /** Review cards due today in the snapshot, after burying (every theme). */
  dueReviews: number;
  /** Review cards held for tomorrow: the cap's excess (every theme). */
  deferred: number;
  /** RU→FR review cards moved to tomorrow because FR→RU is due too (every theme). */
  buried: number;
  /** Mean reviews a day over the next 7 days (snapshot). */
  forecast7: number;
  /** Load factor 0..1 applied to the ceiling. */
  load: number;
  /** Success rate of young reviews over the last 7 days; null without any. */
  accuracy7: number | null;
  /** How many young reviews `accuracy7` is over. */
  accuracyLogs: number;
  /** New FR→RU words and unlockable RU→FR cards there are, ignoring the limits (every theme). */
  available: { fr: number; ru: number };
}

export interface PlanCounts {
  /** Cards still due today (L-due + reviews shown + L-ahead + waiting). */
  due: number;
  /** New cards still in today's queue. */
  new: number;
  /** Reviews logged today of the selected cards. */
  done: number;
  /** done + cards not yet reviewed today (queue and waiting): the denominator of `07 / 30`. */
  total: number;
  /** Selected review cards held for tomorrow by the cap. */
  deferred: number;
  /** Selected learning cards due later today (more than 20 min out). */
  waiting: number;
}

export interface PlanResult {
  queue: PlanItem[];
  counts: PlanCounts;
  day: DayPlan;
  /** The waiting learning cards, soonest first (the wait screen). */
  waiting: PlanItem[];
  /** When the first waiting card is due (ISO), null when none. */
  nextDue: string | null;
}

/** Live themes in their order (by `sort`), «Входящие» (null) after them: `PlanInput.folderOrder`. */
export function folderOrderOf(folders: readonly Pick<Folder, "id" | "name" | "sort">[]): Map<string | null, number> {
  const sorted = [...folders].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const order = new Map<string | null, number>(sorted.map((f, i) => [f.id, i]));
  order.set(null, sorted.length);
  return order;
}

/** 32-bit FNV-1a: a stable tie-break per day and card. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const ms = (iso: string) => Date.parse(iso);
const cardKey = (wordId: string, direction: Direction) => `${wordId}:${direction}`;

/**
 * Each card as it stood when the study day began: the `prev` of its earliest live log today, else
 * the card itself. Logs without a `prev` (imports) leave the card as it is.
 */
export function dayStartStates(states: readonly ReviewState[], todayLogs: readonly ReviewLog[]): Map<string, ReviewState> {
  const first = new Map<string, ReviewLog>();
  for (const l of todayLogs) {
    if (l.deleted_at !== null) continue;
    const k = cardKey(l.word_id, l.direction);
    const seen = first.get(k);
    if (!seen || l.review < seen.review || (l.review === seen.review && l.id < seen.id)) first.set(k, l);
  }
  const out = new Map<string, ReviewState>();
  for (const s of states) {
    const prev = first.get(s.id)?.prev;
    out.set(s.id, prev ? { ...prev, updated_at: s.updated_at, deleted_at: s.deleted_at } : s);
  }
  return out;
}

/**
 * Anki's interleave: one new card every (nR+1)/(nN+1) reviews, so new cards spread evenly.
 * (10 reviews, 3 new) → new at positions 2, 6, 10.
 */
export function intersperse<T>(reviews: readonly T[], fresh: readonly T[]): T[] {
  const ratio = (reviews.length + 1) / (fresh.length + 1);
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < reviews.length || j < fresh.length) {
    if (j < fresh.length && (i >= reviews.length || (j + 1) * ratio < i + 1)) out.push(fresh[j++]);
    else out.push(reviews[i++]);
  }
  return out;
}

/**
 * Stable sibling spacing: the two directions of a word never stand within `gap` positions. Each
 * slot takes the first remaining card whose word is not among the last `gap` placed (`before`
 * counts as already placed); when every remaining card clashes, the order stays.
 */
export function spaceSiblings(before: readonly PlanItem[], items: readonly PlanItem[], gap = SIBLING_GAP): PlanItem[] {
  const placed: PlanItem[] = [...before];
  const rest = [...items];
  const out: PlanItem[] = [];
  while (rest.length > 0) {
    const recent = new Set(placed.slice(-gap).map((p) => p.word.id));
    let k = rest.findIndex((it) => !recent.has(it.word.id));
    if (k < 0) k = 0;
    const [next] = rest.splice(k, 1);
    placed.push(next);
    out.push(next);
  }
  return out;
}

const REG = [0, 0.5, 2, 3];

/** The `level` order's first key: level band (A1 = 0 … B2 = 3; above the target 10+; none 5) + register. */
export function levelRank(w: Pick<Word, "slang_level" | "verlan">, level: string | null | undefined): number {
  const idx = level ? LEVELS.indexOf(level) : -1;
  const target = LEVELS.indexOf(LEVEL_TARGET);
  const band = idx < 0 ? 5 : idx <= target ? idx : 10 + idx;
  return band + (REG[w.slang_level] ?? 0) + (w.verlan ? 1 : 0);
}

export function planDay(input: PlanInput): PlanResult {
  const { now, dayStart, dayEnd, words, plan, direction } = input;
  const t = now.getTime();
  const end = dayEnd.getTime();
  const start = dayStart.getTime();
  const match = input.match ?? (() => true);
  const dayKey = dayStart.toISOString();
  const h = (key: string) => fnv1a(dayKey + key);
  const override = input.overrideNewToday === true;

  const todayLogs = input.todayLogs.filter((l) => l.deleted_at === null);
  const cards = input.states.filter((s) => s.deleted_at === null && words.has(s.word_id));
  const byKey = new Map(cards.map((s) => [s.id, s]));
  const s0 = dayStartStates(cards, todayLogs);
  const reviewedToday = new Set(todayLogs.map((l) => cardKey(l.word_id, l.direction)));
  const selected = (s: ReviewState) => match(words.get(s.word_id)!) && (!direction || s.direction === direction);
  const item = (s: ReviewState): PlanItem => ({ key: s.id, word: words.get(s.word_id)!, state: s, direction: s.direction, isNew: s.state === 0 });

  // --- Reviews due today (snapshot), burying, cap -------------------------------------------------
  const dueInSnapshot = (s: ReviewState) => s.state === 2 && ms(s.due) < end;
  // Burying is part of the global day (due reviews, backlog, cap, budget), so it is decided
  // whatever the filter; a one-direction session only shows the cards it buried (no siblings there).
  const buried = new Set<string>();
  for (const s of cards) {
    if (s.direction !== "ru_fr") continue;
    const a = s0.get(s.id)!;
    const b = s0.get(cardKey(s.word_id, "fr_ru"));
    // Both sides due today and neither overdue: FR→RU today, RU→FR tomorrow.
    if (b && dueInSnapshot(a) && dueInSnapshot(b) && ms(a.due) >= start && ms(b.due) >= start) buried.add(s.id);
  }
  const dueReviews = cards.filter((s) => dueInSnapshot(s0.get(s.id)!) && !buried.has(s.id)).length;
  const cap = plan.review_cap;
  const backlog = cap !== null && dueReviews > cap;
  const capDone = todayLogs.filter((l) => l.state === 2).length;
  const capLeft = backlog ? Math.max(0, cap - capDone) : Infinity;

  // Not reviewed yet: `remaining` with the buried cards (a one-direction session), `remainingR` without.
  const remaining = cards.filter((s) => s.state === 2 && ms(s.due) < end && !reviewedToday.has(s.id));
  // A backlog goes most-likely-remembered first (cheap reviews that keep), at the start of the day.
  const recall = new Map<string, number>();
  if (backlog) {
    for (const s of remaining) {
      let v = 0;
      try {
        v = input.r(s, dayStart);
      } catch {
        // A card the scheduler can't read (no last review): last.
      }
      recall.set(s.id, Number.isFinite(v) ? v : 0);
    }
  }
  const rOrder = backlog
    ? (a: ReviewState, b: ReviewState) => recall.get(b.id)! - recall.get(a.id)! || a.difficulty - b.difficulty || h(a.id) - h(b.id)
    : (a: ReviewState, b: ReviewState) =>
        ms(a.due) - ms(b.due) || (a.direction === b.direction ? 0 : a.direction === "fr_ru" ? -1 : 1) || h(a.id) - h(b.id);
  remaining.sort(rOrder);
  const remainingR = remaining.filter((s) => !buried.has(s.id));
  const deferredAll = Number.isFinite(capLeft) ? Math.max(0, remainingR.length - capLeft) : 0;
  const selectedR = (direction ? remaining : remainingR).filter(selected);
  const shownR = Number.isFinite(capLeft) ? selectedR.slice(0, capLeft) : selectedR;
  const deferred = selectedR.length - shownR.length;

  // --- Learning cards -------------------------------------------------------------------------------
  const lDue: ReviewState[] = [];
  const lAhead: ReviewState[] = [];
  const waiting: ReviewState[] = [];
  for (const s of cards) {
    if ((s.state !== 1 && s.state !== 3) || !selected(s)) continue;
    const due = ms(s.due);
    if (due <= t) lDue.push(s);
    else if (due <= t + LEARN_AHEAD_MS) lAhead.push(s);
    else if (due < end) waiting.push(s);
  }
  const byDue = (a: ReviewState, b: ReviewState) => ms(a.due) - ms(b.due) || h(a.id) - h(b.id);
  lDue.sort(byDue);
  lAhead.sort(byDue);
  waiting.sort(byDue);

  // --- Budget -----------------------------------------------------------------------------------------
  const loadCap = cap ?? DEFAULT_REVIEW_CAP;
  let ahead = 0;
  for (const s of cards) {
    const a = s0.get(s.id)!;
    if (a.state === 0) continue;
    const due = ms(a.due);
    if (due >= end && due < end + 7 * DAY) ahead++;
  }
  const forecast7 = ahead / 7;
  const load = Math.max(0, Math.min(1, (0.8 * loadCap - forecast7) / (0.3 * loadCap)));
  const young = input.logs7d.filter(
    (l) => l.deleted_at === null && l.state === 2 && ms(l.review) < start && (l.prev?.stability ?? l.stability) < YOUNG_STABILITY_DAYS,
  );
  const accuracy7 = young.length > 0 ? young.filter((l) => l.rating > 1).length / young.length : null;
  const sRate = young.length >= ACCURACY_MIN_LOGS && accuracy7 !== null && accuracy7 < ACCURACY_MIN ? 0.5 : 1;
  const ceiling = plan.new_words;
  const budget = override ? ceiling : backlog ? 0 : Math.round(ceiling * load * sRate);
  const ruBase = override ? ceiling : backlog ? 0 : Math.round(ceiling * load);

  // --- New cards ----------------------------------------------------------------------------------------
  const introLogs = todayLogs.filter((l) => l.state === 0);
  const introFr = new Set(introLogs.filter((l) => l.direction === "fr_ru").map((l) => l.word_id));
  const introRu = new Set(introLogs.filter((l) => l.direction === "ru_fr").map((l) => l.word_id));
  const introCards = new Set(introLogs.map((l) => cardKey(l.word_id, l.direction)));
  const fresh = cards.filter((s) => s.state === 0);
  const frFresh = fresh.filter((s) => s.direction === "fr_ru");
  const added = (a: PlanItem, b: PlanItem) =>
    a.word.created_at.localeCompare(b.word.created_at) ||
    a.word.id.localeCompare(b.word.id) ||
    (a.direction === b.direction ? 0 : a.direction === "fr_ru" ? -1 : 1);

  // RU→FR, plan "after": FR→RU holds (review card, S ≥ 3 d at the start of the day), is not due
  // today and was not reviewed today, so the two sides never share a day.
  const unlockable = (s: ReviewState) => {
    const sib = s0.get(cardKey(s.word_id, "fr_ru"));
    return (
      !!sib &&
      sib.state === 2 &&
      sib.stability >= RU_FR_UNLOCK_DAYS &&
      ms(sib.due) >= end &&
      !reviewedToday.has(cardKey(s.word_id, "fr_ru"))
    );
  };
  // RU→FR, plan "together" (the rule before the plan): the day after FR→RU was first learned.
  const heldTogether = (s: ReviewState) => {
    const sib = byKey.get(cardKey(s.word_id, "fr_ru"));
    return !!sib && (sib.state === 0 || reviewedToday.has(sib.id));
  };

  const pickOpts: PickOptions = {
    budget,
    order: plan.new_order,
    spread: input.spreadThemes !== false,
    level: input.level,
    freq: input.freq,
    folderOrder: input.folderOrder,
    introduced: [...introFr].map((id) => words.get(id)).filter((w): w is Word => !!w),
    tie: (w) => h(w.id),
  };

  const together = plan.ru_fr === "together";
  // «together» counts new cards of both directions against the budget, as `new_per_day` did.
  const newToday = together ? introCards.size : introFr.size;
  const newLeft = Math.max(0, budget - newToday);
  let ruLeft = 0;
  const availableFr = frFresh.length;
  let availableRu = 0;
  /** What the budget draws on, every theme: new FR→RU words («together»: the new cards allowed). */
  let available = frFresh.length;
  let ruPool: ReviewState[] = [];
  if (together) {
    const pool = fresh.filter((s) => s.direction === "fr_ru" || !heldTogether(s));
    availableRu = pool.length - availableFr;
    available = pool.length;
    ruPool = pool.filter((s) => s.direction === "ru_fr");
  } else if (plan.ru_fr === "after") {
    ruPool = fresh.filter((s) => s.direction === "ru_fr" && unlockable(s));
    availableRu = ruPool.length;
    ruLeft = Math.max(0, ruBase - introRu.size);
  }

  const toItems = (ws: readonly Word[], d: Direction) => ws.map((w) => item(byKey.get(cardKey(w.id, d))!));
  const frWords = () => frFresh.filter(selected).map((s) => words.get(s.word_id)!);
  let newCards: PlanItem[];
  if (direction === "ru_fr") {
    // A RU→FR-only session shows new reverse sides directly, as new words of the day: every word
    // introduced today (either side) counts against the budget.
    const mine = fresh.filter((s) => s.direction === "ru_fr" && selected(s));
    const introIds = new Set([...introFr, ...introRu]);
    const left = together ? newLeft : Math.max(0, budget - introIds.size);
    const opts = { ...pickOpts, introduced: [...introIds].map((id) => words.get(id)).filter((w): w is Word => !!w) };
    newCards =
      plan.new_order === "added"
        ? mine.map(item).sort(added).slice(0, left)
        : toItems(pickWords(mine.map((s) => words.get(s.word_id)!), left, opts), "ru_fr");
  } else if (together) {
    const ru = ruPool.filter(selected).map(item);
    newCards =
      plan.new_order === "added"
        ? [...frFresh.filter(selected).map(item), ...ru].sort(added).slice(0, newLeft)
        : zip(toItems(pickWords(frWords(), newLeft, pickOpts), "fr_ru"), ru.sort(added)).slice(0, newLeft);
  } else {
    const fr = toItems(pickWords(frWords(), newLeft, pickOpts), "fr_ru");
    const ru = direction === "fr_ru" ? [] : ruPool.filter(selected).map(item).sort(added).slice(0, ruLeft);
    newCards = plan.new_order === "added" ? [...fr, ...ru].sort(added) : zip(fr, ru);
  }

  const reason: PlanReason =
    !override && backlog
      ? "backlog"
      : !override && Math.round(ceiling * load) < ceiling
        ? "load"
        : !override && sRate < 1 && budget < ceiling
          ? "accuracy"
          : newLeft > 0 && available < newLeft
            ? "empty"
            : "limit";

  // --- Queue ----------------------------------------------------------------------------------------
  const head = lDue.map(item);
  const reviews = shownR.map(item);
  const middle = plan.mix === "mixed" ? intersperse(reviews, newCards) : [...reviews, ...newCards];
  const queue = [...head, ...(direction ? middle : spaceSiblings(head, middle)), ...lAhead.map(item)];

  const waitItems = waiting.map(item);
  const done = todayLogs.filter((l) => {
    const w = words.get(l.word_id);
    return !!w && match(w) && (!direction || l.direction === direction);
  }).length;
  const pending = [...queue, ...waitItems].filter((it) => !reviewedToday.has(it.key)).length;

  return {
    queue,
    counts: {
      due: head.length + reviews.length + lAhead.length + waitItems.length,
      new: newCards.length,
      done,
      total: done + pending,
      deferred,
      waiting: waitItems.length,
    },
    day: {
      ceiling,
      budget,
      newToday,
      newLeft,
      ruLeft,
      ruToday: introRu.size,
      reason,
      backlog,
      override,
      canOverride: !override && budget < ceiling,
      cap,
      capDone,
      dueReviews,
      deferred: deferredAll,
      buried: buried.size,
      forecast7,
      load,
      accuracy7,
      accuracyLogs: young.length,
      available: { fr: availableFr, ru: availableRu },
    },
    waiting: waitItems,
    nextDue: waitItems[0]?.state.due ?? null,
  };
}

/** a0, b0, a1, b1, … then the rest of the longer one. */
function zip<T>(a: readonly T[], b: readonly T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

interface PickOptions {
  /** Today's budget: sets the per-theme limit. */
  budget: number;
  order: StudyPlan["new_order"];
  spread: boolean;
  level?: (w: Word) => string | null;
  freq?: (w: Word) => number | null;
  folderOrder?: ReadonlyMap<string | null, number>;
  /** Words introduced today: they count toward the theme limit and the same-meaning rule. */
  introduced: readonly Word[];
  tie: (w: Word) => number;
}

/** At most this many new words per theme a day. */
export const themeLimit = (budget: number) => Math.max(2, Math.ceil(budget / 3));

/**
 * Up to `n` new words in the plan's order. "added": oldest first, nothing else. "level": level
 * band + register, then frequency, then age, themes taken in turn. "themes": theme by theme in
 * folder order, the most frequent first. Except for "added", a theme gives at most `themeLimit`
 * words a day (when spreading; past it only when too few themes are left to fill the budget), and
 * no two words of a day share a meaning (`searchKey(ru)`).
 */
function pickWords(candidates: readonly Word[], n: number, o: PickOptions): Word[] {
  if (n <= 0 || candidates.length === 0) return [];
  const byAge = (a: Word, b: Word) => a.created_at.localeCompare(b.created_at) || o.tie(a) - o.tie(b) || a.id.localeCompare(b.id);
  if (o.order === "added") return [...candidates].sort(byAge).slice(0, n);

  const freqs = new Map(candidates.map((w) => [w.id, o.freq?.(w) ?? 0]));
  const freq = (w: Word) => freqs.get(w.id)!;
  // A word of a theme not in folderOrder (deleted) counts as «Входящие».
  const themeOf = (w: Word) => (w.folder_id !== null && (!o.folderOrder || o.folderOrder.has(w.folder_id)) ? w.folder_id : null);
  const themeIdx = (w: Word) => o.folderOrder?.get(themeOf(w)) ?? Number.MAX_SAFE_INTEGER;
  const rank = new Map(candidates.map((w) => [w.id, levelRank(w, o.level?.(w))]));
  const sorted = [...candidates].sort(
    o.order === "level"
      ? (a, b) => rank.get(a.id)! - rank.get(b.id)! || freq(b) - freq(a) || byAge(a, b)
      : (a, b) => themeIdx(a) - themeIdx(b) || freq(b) - freq(a) || byAge(a, b),
  );

  const limit = o.spread ? themeLimit(o.budget) : Infinity;
  const perTheme = new Map<string | null, number>();
  const meanings = new Set<string>();
  for (const w of o.introduced) {
    perTheme.set(themeOf(w), (perTheme.get(themeOf(w)) ?? 0) + 1);
    meanings.add(searchKey(w.ru));
  }
  const ok = (w: Word) => (perTheme.get(themeOf(w)) ?? 0) < limit && !meanings.has(searchKey(w.ru));

  const out: Word[] = [];
  const picked = new Set<string>();
  // Too few themes to fill the budget within the limit: the rest in order, past the limit.
  const fillUp = () => {
    for (const w of sorted) {
      if (out.length >= n) break;
      if (!picked.has(w.id) && !meanings.has(searchKey(w.ru))) take(w, out);
    }
    return out;
  };
  const take = (w: Word, into: Word[]) => {
    into.push(w);
    picked.add(w.id);
    perTheme.set(themeOf(w), (perTheme.get(themeOf(w)) ?? 0) + 1);
    meanings.add(searchKey(w.ru));
  };
  if (o.order === "themes" || !o.spread) {
    for (const w of sorted) {
      if (out.length >= n) break;
      if (ok(w)) take(w, out);
    }
    return fillUp();
  }
  // "level": round-robin over themes, each theme in its own best-first order; themes ordered by
  // their best word.
  const queues = new Map<string | null, Word[]>();
  for (const w of sorted) {
    const k = themeOf(w);
    const q = queues.get(k);
    if (q) q.push(w);
    else queues.set(k, [w]);
  }
  let live = [...queues.values()];
  while (out.length < n && live.length > 0) {
    for (const q of live) {
      if (out.length >= n) break;
      while (q.length > 0 && !ok(q[0])) {
        // A clash of meaning drops the word for today; a full theme stops the theme.
        if ((perTheme.get(themeOf(q[0])) ?? 0) >= limit) q.length = 0;
        else q.shift();
      }
      const w = q.shift();
      if (w) take(w, out);
    }
    live = live.filter((q) => q.length > 0);
  }
  return fillUp();
}
