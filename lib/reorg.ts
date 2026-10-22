// «Разложить по темам»: the two-pass automatic re-sort.
// Pass A (taxonomy) proposes themes; pass B (assign) picks a theme per word in chunks of ≤150.
// The result becomes a reviewable plan (pure functions below); applying it writes the moves,
// the new folders and a reorg_runs row so the whole run can be undone.
// Rules: words placed by hand (folder_source 'user') and words in locked folders never move;
// a new theme needs ≥3 words; «Входящие» (INBOX / low confidence) never pulls a word out of a theme.
import {
  ASSIGN_CHUNK_MAX,
  FOLDER_INBOX,
  NEW_FOLDER_MIN_WORDS,
  type AiErrorBody,
  type AssignRequest,
  type AssignResponse,
  type AssignmentResult,
  type TaxonomyRequest,
  type TaxonomyResponse,
} from "./ai/schemas";
import { isMovable } from "./core/words";
import { db, newId } from "./db";
import { createFolder, FOLDER_COLORS, listFolders } from "./folders";
import type { Confidence, Folder, ReorgRun, Word } from "./types";
import { moveWords, type MoveRecord } from "./words";

export { isMovable } from "./core/words";

export const REORG_UNDO_DAYS = 7;
export const TAXONOMY_WORDS_MAX = 4000;
export const ASSIGN_EXAMPLES_MAX = 80;
export const ASSIGN_FOLDERS_MAX = 40;
/** Parallel assign requests; the classify route allows a burst of 20 and then one per 3 s. */
export const ASSIGN_CONCURRENCY = 4;

/** Pseudo-target keys: «Входящие» and «не перемещать». */
export const INBOX_KEY = "inbox";
export const STAY_KEY = "stay";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
const DAY_MS = 86_400_000;

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max).trimEnd() : s);
const clipOrNull = (s: string | null | undefined, max: number) => {
  const t = s?.replace(/\s+/g, " ").trim();
  return t ? clip(t, max) : null;
};
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase("ru") === b.trim().toLocaleLowerCase("ru");

// ---------------------------------------------------------------------------------------------
// Snapshot and requests

export interface ReorgSnapshot {
  /** Live words. */
  words: Word[];
  /** Live folders by sort order. */
  folders: Folder[];
}

export async function loadReorgSnapshot(): Promise<ReorgSnapshot> {
  const [folders, words] = await Promise.all([listFolders(), db.words.filter((w) => w.deleted_at === null).toArray()]);
  return { folders, words };
}

/** The folder a word is really in: a missing or deleted folder counts as «Входящие» (null). */
function liveFolderOf(word: Pick<Word, "folder_id">, liveIds: ReadonlySet<string>): string | null {
  return word.folder_id !== null && liveIds.has(word.folder_id) ? word.folder_id : null;
}

function partition(snap: ReorgSnapshot) {
  const liveIds = new Set(snap.folders.map((f) => f.id));
  const lockedIds = new Set(snap.folders.filter((f) => f.locked).map((f) => f.id));
  const movable: Word[] = [];
  const fixed: Word[] = [];
  for (const w of snap.words) (isMovable(w, lockedIds) ? movable : fixed).push(w);
  return { liveIds, movable, fixed };
}

/** Folders the classify route can reference (valid, unique slugs). */
function requestFolders(folders: readonly Folder[]): Folder[] {
  const seen = new Set<string>();
  const out: Folder[] = [];
  for (const f of folders) {
    if (!SLUG_RE.test(f.slug) || seen.has(f.slug)) continue;
    seen.add(f.slug);
    out.push(f);
  }
  return out;
}

/** Pass A body: every live word (movable ones first, so they survive the cap) and every folder. */
export function buildTaxonomyRequest(snap: ReorgSnapshot): TaxonomyRequest {
  const { liveIds, movable, fixed } = partition(snap);
  const folders = requestFolders(snap.folders);
  const protectedFirst = [...folders.filter((f) => f.locked || f.created_by === "user"), ...folders.filter((f) => !f.locked && f.created_by !== "user")];
  const sent = protectedFirst.slice(0, 60);
  const slugById = new Map(sent.map((f) => [f.id, f.slug]));
  return {
    mode: "taxonomy",
    words: [...movable, ...fixed].slice(0, TAXONOMY_WORDS_MAX).map((w) => {
      const folder = liveFolderOf(w, liveIds);
      return { id: w.id, fr: clip(w.fr, 120), ru: clip(w.ru, 160), folder: folder ? (slugById.get(folder) ?? null) : null };
    }),
    folders: sent.map((f) => ({
      slug: f.slug,
      name: clip(f.name, 60),
      description: clipOrNull(f.description, 300),
      locked: f.locked,
      created_by: f.created_by,
    })),
  };
}

/** A theme the assign pass may choose: an existing folder or a proposed new one. */
export interface AssignTarget {
  slug: string;
  name: string;
  description: string | null;
  /** Existing folder id; null for a proposed theme. */
  folderId: string | null;
}

/**
 * Themes for pass B: every existing folder (names unchanged; a refined description from pass A
 * is used as context only) plus the proposed new themes whose name is not taken.
 */
export function assignTargets(snap: ReorgSnapshot, taxonomy: TaxonomyResponse): AssignTarget[] {
  const proposals = new Map(taxonomy.folders.map((f) => [f.slug, f]));
  const existing: AssignTarget[] = requestFolders(snap.folders).map((f) => {
    const refined = proposals.get(f.slug);
    const description = refined?.status === "update" && refined.description ? refined.description : f.description;
    return { slug: f.slug, name: f.name, description: clipOrNull(description, 300), folderId: f.id };
  });
  const taken = new Set(existing.map((t) => t.slug));
  const fresh: AssignTarget[] = [];
  for (const p of taxonomy.folders) {
    if (p.status !== "new" || taken.has(p.slug) || !SLUG_RE.test(p.slug)) continue;
    if ([...existing, ...fresh].some((t) => sameName(t.name, p.name))) continue;
    taken.add(p.slug);
    fresh.push({ slug: p.slug, name: clip(p.name, 60), description: clipOrNull(p.description, 300), folderId: null });
  }
  const room = Math.max(0, ASSIGN_FOLDERS_MAX - fresh.length);
  return [...existing.slice(0, room), ...fresh].slice(0, ASSIGN_FOLDERS_MAX);
}

/** Pass B bodies: movable words in chunks of ≤150; hand-placed words become few-shot examples. */
export function buildAssignRequests(snap: ReorgSnapshot, targets: readonly AssignTarget[]): AssignRequest[] {
  if (targets.length === 0) return [];
  const { movable } = partition(snap);
  const folders = targets.map((t) => ({ slug: t.slug, name: t.name, description: t.description }));
  const slugByFolder = new Map(targets.filter((t) => t.folderId).map((t) => [t.folderId!, t.slug]));

  // Examples: user-placed words, taken round-robin across folders so every theme is represented.
  const byFolder = new Map<string, Word[]>();
  for (const w of snap.words) {
    if (w.folder_source !== "user" || w.folder_id === null) continue;
    const slug = slugByFolder.get(w.folder_id);
    if (!slug) continue;
    const list = byFolder.get(slug);
    if (list) list.push(w);
    else byFolder.set(slug, [w]);
  }
  const examples: AssignRequest["examples"] = [];
  const queues = [...byFolder.entries()];
  for (let i = 0; examples.length < ASSIGN_EXAMPLES_MAX && queues.some(([, list]) => i < list.length); i++) {
    for (const [slug, list] of queues) {
      if (i < list.length && examples.length < ASSIGN_EXAMPLES_MAX) {
        examples.push({ fr: clip(list[i].fr, 120), ru: clip(list[i].ru, 160), folder: slug });
      }
    }
  }

  const requests: AssignRequest[] = [];
  for (let i = 0; i < movable.length; i += ASSIGN_CHUNK_MAX) {
    requests.push({
      mode: "assign",
      words: movable.slice(i, i + ASSIGN_CHUNK_MAX).map((w) => ({
        id: w.id,
        fr: clip(w.fr, 120),
        ru: clip(w.ru, 160),
        note: clipOrNull(w.note, 300),
      })),
      folders,
      examples,
    });
  }
  return requests;
}

// ---------------------------------------------------------------------------------------------
// The plan (pure)

export interface PlanTarget {
  /** Folder id, `new:<slug>` for a proposed theme, INBOX_KEY or STAY_KEY. */
  key: string;
  kind: "folder" | "new" | "inbox" | "stay";
  folderId: string | null;
  name: string;
  description: string | null;
  /** Theme ink for folders and proposals; null for the pseudo-targets. */
  color: string | null;
}

export interface PlanWord {
  id: string;
  fr: string;
  ru: string;
  /** Folder the word is in now (null = «Входящие»). */
  from: string | null;
}

export interface PlanMove {
  word: PlanWord;
  /** Target key. */
  to: string;
  confidence: Confidence;
  /** The user picked this target by hand in the plan (the word becomes «placed by hand»). */
  edited: boolean;
}

export interface ReorgPlan {
  /** Every target a word can be sent to: «Входящие», existing folders, proposals, «не перемещать». */
  targets: PlanTarget[];
  moves: PlanMove[];
  /** Target keys switched off. */
  disabled: string[];
  /** Words left alone because they were placed by hand or sit in a locked folder. */
  protectedWords: number;
  createdAt: string;
}

export const newTargetKey = (slug: string) => `new:${slug}`;

/** Keys a word may be "moved" to without anything changing. */
const fromKey = (from: string | null) => from ?? INBOX_KEY;

export function buildPlan(
  snap: ReorgSnapshot,
  targets: readonly AssignTarget[],
  assignments: readonly AssignmentResult[],
  now: Date = new Date(),
): ReorgPlan {
  const { liveIds, movable, fixed } = partition(snap);
  const keyBySlug = new Map(targets.map((t) => [t.slug, t.folderId ?? newTargetKey(t.slug)]));
  const movableById = new Map(movable.map((w) => [w.id, w]));

  const moves: PlanMove[] = [];
  const seen = new Set<string>();
  for (const a of assignments) {
    const w = movableById.get(a.id);
    if (!w || seen.has(w.id) || a.folder === FOLDER_INBOX) continue;
    const to = keyBySlug.get(a.folder);
    if (!to) continue;
    const from = liveFolderOf(w, liveIds);
    if (to === fromKey(from)) continue;
    seen.add(w.id);
    moves.push({ word: { id: w.id, fr: w.fr, ru: w.ru, from }, to, confidence: a.confidence, edited: false });
  }

  // A proposed theme is only offered when it would hold enough words.
  const counts = new Map<string, number>();
  for (const m of moves) counts.set(m.to, (counts.get(m.to) ?? 0) + 1);
  const keptMoves = moves.filter((m) => !m.to.startsWith("new:") || (counts.get(m.to) ?? 0) >= NEW_FOLDER_MIN_WORDS);

  const used = new Set(snap.folders.map((f) => f.color));
  const nextColor = () => {
    const c = FOLDER_COLORS.find((x) => !used.has(x)) ?? FOLDER_COLORS[used.size % FOLDER_COLORS.length];
    used.add(c);
    return c;
  };
  const planTargets: PlanTarget[] = [
    { key: INBOX_KEY, kind: "inbox", folderId: null, name: "Входящие", description: null, color: null },
    ...snap.folders.map(
      (f): PlanTarget => ({ key: f.id, kind: "folder", folderId: f.id, name: f.name, description: f.description, color: f.color }),
    ),
  ];
  for (const t of targets) {
    if (t.folderId !== null) continue;
    const key = newTargetKey(t.slug);
    if (!keptMoves.some((m) => m.to === key)) continue;
    planTargets.push({ key, kind: "new", folderId: null, name: t.name, description: t.description, color: nextColor() });
  }
  planTargets.push({ key: STAY_KEY, kind: "stay", folderId: null, name: "Не перемещать", description: null, color: null });

  return {
    targets: planTargets,
    moves: keptMoves,
    disabled: [],
    protectedWords: fixed.length,
    createdAt: now.toISOString(),
  };
}

export interface PlanGroup {
  target: PlanTarget;
  moves: PlanMove[];
  /** Switched on (always true for STAY). */
  enabled: boolean;
  /** A proposed theme left with fewer than NEW_FOLDER_MIN_WORDS words: not created. */
  tooSmall: boolean;
}

/** Moves grouped by target: biggest groups first, «не перемещать» last. */
export function planGroups(plan: ReorgPlan): PlanGroup[] {
  const order = new Map(plan.targets.map((t, i) => [t.key, i]));
  const byKey = new Map<string, PlanMove[]>();
  for (const m of plan.moves) {
    const list = byKey.get(m.to);
    if (list) list.push(m);
    else byKey.set(m.to, [m]);
  }
  const disabled = new Set(plan.disabled);
  const groups: PlanGroup[] = [];
  for (const [key, moves] of byKey) {
    const target = plan.targets.find((t) => t.key === key);
    if (!target) continue;
    groups.push({
      target,
      moves,
      enabled: target.kind === "stay" || !disabled.has(key),
      tooSmall: target.kind === "new" && moves.length < NEW_FOLDER_MIN_WORDS,
    });
  }
  return groups.sort((a, b) => {
    const stay = Number(a.target.kind === "stay") - Number(b.target.kind === "stay");
    return stay || b.moves.length - a.moves.length || (order.get(a.target.key) ?? 0) - (order.get(b.target.key) ?? 0);
  });
}

/** Moves that «Применить» would write. */
export function effectiveMoves(plan: ReorgPlan): PlanMove[] {
  return planGroups(plan)
    .filter((g) => g.target.kind !== "stay" && g.enabled && !g.tooSmall)
    .flatMap((g) => g.moves);
}

export interface PlanSummary {
  /** All proposed moves, «не перемещать» excluded (the «12 перемещений» line). */
  total: number;
  /** Moves «Применить N» would write. */
  apply: number;
  /** Proposed themes that still have enough words. */
  newFolders: number;
  /** Proposed themes «Применить» would create. */
  applyNewFolders: number;
}

export function planSummary(plan: ReorgPlan): PlanSummary {
  const groups = planGroups(plan).filter((g) => g.target.kind !== "stay");
  const live = groups.filter((g) => !g.tooSmall);
  const applied = live.filter((g) => g.enabled);
  return {
    total: groups.reduce((n, g) => n + g.moves.length, 0),
    apply: applied.reduce((n, g) => n + g.moves.length, 0),
    newFolders: live.filter((g) => g.target.kind === "new").length,
    applyNewFolders: applied.filter((g) => g.target.kind === "new").length,
  };
}

export function setTargetEnabled(plan: ReorgPlan, key: string, enabled: boolean): ReorgPlan {
  const disabled = new Set(plan.disabled);
  if (enabled) disabled.delete(key);
  else disabled.add(key);
  return { ...plan, disabled: [...disabled] };
}

/**
 * Sends one word somewhere else. Picking the word's current folder (or STAY_KEY) keeps it in
 * place; it stays listed under «Не перемещать» so it can be retargeted again.
 */
export function retargetMove(plan: ReorgPlan, wordId: string, key: string): ReorgPlan {
  if (!plan.targets.some((t) => t.key === key)) return plan;
  return {
    ...plan,
    moves: plan.moves.map((m) => {
      if (m.word.id !== wordId) return m;
      const to = key === fromKey(m.word.from) ? STAY_KEY : key;
      return { ...m, to, edited: true };
    }),
    // Picking a switched-off target by hand switches it back on.
    disabled: key === STAY_KEY ? plan.disabled : plan.disabled.filter((k) => k !== key),
  };
}

/** Targets a word may be sent to from the picker (its own folder reads as «не перемещать»). */
export function pickableTargets(plan: ReorgPlan, move: PlanMove): PlanTarget[] {
  const own = fromKey(move.word.from);
  return plan.targets.filter((t) => t.key !== own);
}

// ---------------------------------------------------------------------------------------------
// Apply and undo

const RUN_TABLES = () => [db.folders, db.words, db.review_state, db.review_log, db.reorg_runs, db.outbox];

/**
 * Writes the plan: creates the proposed themes that receive words, moves the words and stores a
 * reorg_runs row for undo. Words changed since the plan was made (moved, deleted, placed by hand)
 * are skipped. Returns null when nothing was left to do.
 */
export async function applyPlan(plan: ReorgPlan, now: Date = new Date()): Promise<ReorgRun | null> {
  const moves = effectiveMoves(plan);
  if (moves.length === 0) return null;
  const iso = now.toISOString();
  const targets = new Map(plan.targets.map((t) => [t.key, t]));

  return db.transaction("rw", RUN_TABLES(), async () => {
    const folders = await listFolders();
    const liveIds = new Set(folders.map((f) => f.id));
    const lockedIds = new Set(folders.filter((f) => f.locked).map((f) => f.id));
    const current = new Map(
      (await db.words.bulkGet(moves.map((m) => m.word.id))).filter((w): w is Word => !!w).map((w) => [w.id, w]),
    );

    const ready = moves.filter((m) => {
      const w = current.get(m.word.id);
      if (!w || w.deleted_at !== null) return false;
      if (liveFolderOf(w, liveIds) !== m.word.from) return false;
      if (w.folder_id !== null && lockedIds.has(w.folder_id)) return false;
      if (!m.edited && w.folder_source === "user") return false;
      const t = targets.get(m.to);
      return !!t && (t.kind !== "folder" || liveIds.has(t.key));
    });
    if (ready.length === 0) return null;

    // Create proposed themes (an existing theme with the same name is reused instead).
    const created: string[] = [];
    const folderFor = new Map<string, string | null>();
    for (const m of ready) {
      if (folderFor.has(m.to)) continue;
      const t = targets.get(m.to)!;
      if (t.kind === "inbox") folderFor.set(m.to, null);
      else if (t.kind === "folder") folderFor.set(m.to, t.key);
      else if (t.kind === "new") {
        const same = folders.find((f) => sameName(f.name, t.name));
        if (same) {
          folderFor.set(m.to, same.id);
          continue;
        }
        const folder = await createFolder(
          { name: t.name, description: t.description, color: t.color ?? undefined, created_by: "auto" },
          now,
        );
        created.push(folder.id);
        folderFor.set(m.to, folder.id);
      }
    }

    // One moveWords call per (target, source, confidence).
    const batches = new Map<string, { to: string | null; edited: boolean; confidence: Confidence; ids: string[] }>();
    for (const m of ready) {
      const to = folderFor.get(m.to);
      if (to === undefined) continue;
      const key = `${to}|${m.edited}|${m.confidence}`;
      const b = batches.get(key);
      if (b) b.ids.push(m.word.id);
      else batches.set(key, { to, edited: m.edited, confidence: m.confidence, ids: [m.word.id] });
    }
    const records: MoveRecord[] = [];
    for (const b of batches.values()) {
      records.push(
        ...(await moveWords(b.ids, b.to, b.edited ? { source: "user" } : { source: "auto", confidence: b.confidence }, now)),
      );
    }

    const run: ReorgRun = {
      id: newId(),
      created_at: plan.createdAt,
      applied_at: iso,
      moves: records.map((r) => ({
        word_id: r.word_id,
        from: r.from,
        to: r.to,
        from_source: r.from_source,
        from_confidence: r.from_confidence,
      })),
      created_folders: created,
      updated_at: iso,
      deleted_at: null,
    };
    await db.reorg_runs.add(run);
    return run;
  });
}

export interface UndoResult {
  /** Words put back where they were. */
  restored: number;
  /** Themes the run created that were removed again (only when left empty). */
  removedFolders: number;
}

/**
 * Undoes an applied run: words still in the folder the run put them in go back (with their
 * previous placement), themes it created are removed if empty, and the run is marked undone
 * (deleted_at). Words the user moved since are left alone.
 */
export async function undoReorgRun(runId: string, now: Date = new Date()): Promise<UndoResult> {
  const iso = now.toISOString();
  return db.transaction("rw", RUN_TABLES(), async () => {
    const run = await db.reorg_runs.get(runId);
    if (!run || run.deleted_at !== null) return { restored: 0, removedFolders: 0 };
    const liveIds = new Set((await listFolders()).map((f) => f.id));
    const words = await db.words.bulkGet(run.moves.map((m) => m.word_id));
    const restored: Word[] = [];
    run.moves.forEach((m, i) => {
      const w = words[i];
      if (!w || w.deleted_at !== null || w.folder_id !== m.to) return;
      const from = m.from !== null && liveIds.has(m.from) ? m.from : null;
      restored.push({
        ...w,
        folder_id: from,
        folder_source: m.from_source ?? "auto",
        folder_confidence: from === null ? null : (m.from_confidence ?? null),
        updated_at: iso,
      });
    });
    await db.words.bulkPut(restored);

    let removedFolders = 0;
    for (const id of run.created_folders) {
      const folder = await db.folders.get(id);
      if (!folder || folder.deleted_at !== null) continue;
      const left = await db.words.where("folder_id").equals(id).filter((w) => w.deleted_at === null).count();
      if (left > 0) continue;
      await db.folders.put({ ...folder, deleted_at: iso, updated_at: iso });
      removedFolders++;
    }
    await db.reorg_runs.put({ ...run, deleted_at: iso, updated_at: iso });
    return { restored: restored.length, removedFolders };
  });
}

/** The latest applied, not yet undone run from the last REORG_UNDO_DAYS days. */
export async function getUndoableRun(now: Date = new Date()): Promise<ReorgRun | undefined> {
  const since = now.getTime() - REORG_UNDO_DAYS * DAY_MS;
  const runs = await db.reorg_runs
    .filter((r) => r.deleted_at === null && r.applied_at !== null && Date.parse(r.applied_at) >= since && r.moves.length > 0)
    .toArray();
  return runs.sort((a, b) => (b.applied_at ?? "").localeCompare(a.applied_at ?? ""))[0];
}

// ---------------------------------------------------------------------------------------------
// Network

export type ReorgErrorCode = "offline" | "auth" | "unavailable" | "rate_limited" | "upstream" | "aborted";

const ERROR_MESSAGES: Record<ReorgErrorCode, string> = {
  offline: "Нет сети. Разложить по темам можно только онлайн.",
  auth: "Войдите, чтобы раскладывать слова по темам.",
  unavailable: "Раскладка по темам сейчас недоступна.",
  rate_limited: "Слишком много запросов. Попробуйте через минуту.",
  upstream: "Не получилось составить план. Попробуйте ещё раз.",
  aborted: "Отменено.",
};

export class ReorgError extends Error {
  constructor(public readonly code: ReorgErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "ReorgError";
  }
}

export interface ClassifyOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Retries after a 429, waiting for Retry-After (capped). */
  retries?: number;
  /** Injected for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new ReorgError("aborted"));
      },
      { once: true },
    );
  });

export async function postClassify<T>(body: TaxonomyRequest | AssignRequest, opts: ClassifyOptions = {}): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  let retries = opts.retries ?? 3;
  for (;;) {
    if (opts.signal?.aborted) throw new ReorgError("aborted");
    let res: Response;
    try {
      res = await fetchImpl("/api/ai/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch {
      if (opts.signal?.aborted) throw new ReorgError("aborted");
      throw new ReorgError(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "upstream");
    }
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429 && retries > 0) {
      retries--;
      const after = Number(res.headers.get("Retry-After"));
      await sleep(Math.min(20, Number.isFinite(after) && after > 0 ? after : 3) * 1000, opts.signal);
      continue;
    }
    let error = "";
    try {
      error = ((await res.json()) as AiErrorBody).error ?? "";
    } catch {
      // not JSON
    }
    if (res.status === 401) throw new ReorgError("auth");
    if (res.status === 403 || res.status === 503 || error === "not_configured") throw new ReorgError("unavailable");
    if (res.status === 429) throw new ReorgError("rate_limited");
    if (res.status === 499) throw new ReorgError("aborted");
    throw new ReorgError("upstream");
  }
}

async function pool<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      if (signal?.aborted) throw new ReorgError("aborted");
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export interface RunReorgOptions extends ClassifyOptions {
  /** Called as assign chunks finish: (done, total). */
  onProgress?: (done: number, total: number) => void;
  /** Injected for tests. */
  snapshot?: ReorgSnapshot;
  now?: Date;
}

/** Runs both passes against /api/ai/classify and returns the plan to review. Nothing is written. */
export async function runReorg(opts: RunReorgOptions = {}): Promise<ReorgPlan> {
  const snap = opts.snapshot ?? (await loadReorgSnapshot());
  const now = opts.now ?? new Date();
  const { movable } = partition(snap);
  if (movable.length === 0) return buildPlan(snap, [], [], now);

  const taxonomy = await postClassify<TaxonomyResponse>(buildTaxonomyRequest(snap), opts);
  const targets = assignTargets(snap, taxonomy);
  const requests = buildAssignRequests(snap, targets);
  let done = 0;
  opts.onProgress?.(0, requests.length);
  const results = await pool(
    requests,
    ASSIGN_CONCURRENCY,
    async (req) => {
      const res = await postClassify<AssignResponse>(req, opts);
      opts.onProgress?.(++done, requests.length);
      return res.assignments;
    },
    opts.signal,
  );
  return buildPlan(snap, targets, results.flat(), now);
}
