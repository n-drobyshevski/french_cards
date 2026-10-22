// The Claude connector's tools. Each handler is a pure `run(deps, args)` over McpRepo, so tests
// drive them with an in-memory repo; `registerTools` wires them into an McpServer. The write
// paths mirror the device's lib/words.ts and lib/folders.ts rules:
// - a new word gets every default set explicitly, source "chat", and its review cards, which are
//   written before the word (orphan cards are ignored by the app, a word without cards is not);
// - every rewritten row gets updated_at past the stored one; a word is rewritten only if it is
//   still the version that was read (compare-and-set), otherwise it comes back as a conflict;
// - nothing is hard-deleted; deleting a word soft-deletes its cards too.
import type { CallToolResult, McpServer, StandardSchemaWithJSON, ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";
import { GENDER_VALUES, POS_VALUES } from "@/lib/ai/schemas";
import { takeToken } from "@/lib/ai/rate-limit";
import { DEFAULT_FOLDERS, defaultFolderId, nextFolderSort, pickFolderColor, uniqueSlug } from "@/lib/core/folders";
import { matchesSearch, normalizeLemma } from "@/lib/core/text";
import { buildWord, cleanText, directionsOf, isMovable } from "@/lib/core/words";
import { newId } from "@/lib/id";
import { newReviewState, reviewStateId, wordStatus, type CardStatus } from "@/lib/scheduler";
import type { Confidence, Direction, Folder, ReviewState, Word } from "@/lib/types";
import { PartialWriteError, RepoError, type McpRepo, type Replacement } from "./repo";
import { studyDay } from "./study-day";

export interface ToolDeps {
  repo: McpRepo;
  /** The connector's user (rate-limit key). */
  userId: string;
  /** IANA zone for the study day. */
  timeZone: string;
  now: () => Date;
}

/** A refusal Claude can act on; becomes an `isError` result. */
export class ToolError extends Error {}

export const INBOX_NAME = "Входящие";
/** Reserved folder selector for «Входящие». */
export const INBOX_SELECTOR = "inbox";
const DEFAULT_NEW_PER_DAY = 15;
const SYNC_NOTE = "Changes reach the app on its next sync, when it is opened or comes back into focus.";

// ---------------------------------------------------------------------------------------------
// Shared helpers

/**
 * updated_at for rewriting a stored row: now, or 1 ms past the stored value when a device clock
 * ran ahead (the kartochki_stamp_row trigger keeps the stored row unless the new one is newer).
 */
export function stampAfter(now: Date, stored: string | null | undefined): string {
  const prev = stored ? Date.parse(stored) : NaN;
  return new Date(Number.isNaN(prev) ? now.getTime() : Math.max(now.getTime(), prev + 1)).toISOString();
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase("ru") === b.toLocaleLowerCase("ru");

function liveFolders(folders: readonly Folder[]): Folder[] {
  return folders.filter((f) => f.deleted_at === null).sort((a, b) => a.sort - b.sort);
}

/**
 * Resolves a folder selector: "inbox"/«Входящие» → null, otherwise a live folder by id, slug or
 * name (case-insensitive). Deleted and unknown folders are refused.
 */
export function resolveFolder(selector: string, folders: readonly Folder[]): Folder | null {
  const s = selector.trim();
  if (s.toLowerCase() === INBOX_SELECTOR || sameName(s, INBOX_NAME)) return null;
  const live = liveFolders(folders);
  const hit = live.find((f) => f.id === s) ?? live.find((f) => f.slug === s) ?? live.find((f) => sameName(f.name, s));
  if (hit) return hit;
  if (folders.some((f) => f.id === s || f.slug === s || sameName(f.name, s))) {
    throw new ToolError(`The theme "${s}" was deleted. Call list_folders for the current themes.`);
  }
  throw new ToolError(`Unknown theme "${s}". Call list_folders for the themes, or create_folder to add one.`);
}

interface FolderRef {
  /** null = «Входящие». */
  id: string | null;
  name: string;
}

const folderRef = (f: Folder | null | undefined): FolderRef => (f ? { id: f.id, name: f.name } : { id: null, name: INBOX_NAME });

/** The folder a word is really in: a missing or deleted folder counts as «Входящие». */
const placeOf = (w: Pick<Word, "folder_id">, live: ReadonlyMap<string, Folder>): Folder | null =>
  (w.folder_id !== null && live.get(w.folder_id)) || null;

interface ViewContext {
  live: Map<string, Folder>;
  statesByWord: Map<string, ReviewState[]>;
  dayEnd: number;
}

function viewContext(folders: readonly Folder[], states: readonly ReviewState[], deps: ToolDeps): ViewContext {
  const statesByWord = new Map<string, ReviewState[]>();
  for (const s of states) {
    if (s.deleted_at !== null) continue;
    const list = statesByWord.get(s.word_id);
    if (list) list.push(s);
    else statesByWord.set(s.word_id, [s]);
  }
  return {
    live: new Map(liveFolders(folders).map((f) => [f.id, f])),
    statesByWord,
    dayEnd: studyDay(deps.now(), deps.timeZone).end.getTime(),
  };
}

const isDueToday = (s: Pick<ReviewState, "state" | "due">, dayEnd: number) => s.state !== 0 && Date.parse(s.due) < dayEnd;

/** Short form for lists of changes. */
const brief = (w: Word, live: ReadonlyMap<string, Folder>) => ({ id: w.id, fr: w.fr, ru: w.ru, folder: folderRef(placeOf(w, live)) });

function wordView(w: Word, ctx: ViewContext) {
  const states = ctx.statesByWord.get(w.id) ?? [];
  return {
    id: w.id,
    fr: w.fr,
    ru: w.ru,
    note: w.note,
    example_fr: w.example_fr,
    example_ru: w.example_ru,
    extra_examples: w.extra_examples,
    pos: w.pos,
    gender: w.gender,
    slang_level: w.slang_level,
    verlan: w.verlan,
    tags: w.tags,
    folder: folderRef(placeOf(w, ctx.live)),
    folder_source: w.folder_source,
    both_directions: w.both_directions,
    status: wordStatus(states),
    due_today: states.some((s) => isDueToday(s, ctx.dayEnd)),
    created_at: w.created_at,
  };
}

interface WriteOutcome {
  /** Ids someone else changed meanwhile (left as they were). */
  conflicts: Set<string>;
  /** Ids the database did not confirm either way (it failed part-way): may or may not be changed. */
  failed: Set<string>;
  /** The database error behind `failed`. */
  error: string | null;
}

/**
 * Rewrites words read earlier, each only if its stored copy is unchanged since the read (so a
 * parallel call or a device sync is never silently overwritten). When the database fails part-way
 * the rows it did confirm still count as written, and the rest are read again to tell saved,
 * unsaved and changed-meanwhile apart; the ones it can't tell stay in `failed`.
 */
async function writeWords(repo: McpRepo, changes: Replacement<"words">[]): Promise<WriteOutcome> {
  const outcome: WriteOutcome = { conflicts: new Set(), failed: new Set(), error: null };
  if (changes.length === 0) return outcome;
  let written: Set<string>;
  try {
    written = new Set((await repo.replace("words", changes)).map((r) => r.id));
  } catch (error) {
    if (!(error instanceof PartialWriteError)) throw error;
    written = new Set(error.written);
    outcome.error = error.message;
    const unsure = changes.filter((c) => error.failed.includes(c.row.id));
    const stored = new Map((await repo.wordsByIds(unsure.map((c) => c.row.id)).catch(() => [])).map((w) => [w.id, w]));
    for (const c of unsure) {
      const at = stored.get(c.row.id)?.updated_at;
      if (at !== undefined && Date.parse(at) === Date.parse(c.row.updated_at)) written.add(c.row.id);
      else if (at === undefined || Date.parse(at) === Date.parse(c.expected)) outcome.failed.add(c.row.id);
    }
  }
  for (const c of changes) if (!written.has(c.row.id) && !outcome.failed.has(c.row.id)) outcome.conflicts.add(c.row.id);
  return outcome;
}

/** Fields for a result whose write failed part-way (nothing when it didn't). */
const failedPart = (outcome: WriteOutcome): { failed?: string[]; error?: string } =>
  outcome.failed.size === 0
    ? {}
    : {
        failed: [...outcome.failed],
        error: `The database failed part-way (${outcome.error}). The words in \`failed\` may or may not be changed: check them with search_words before retrying them; everything else in this result is as reported.`,
      };

/** A rewrite of `before` into `row`, for writeWords. */
const change = <R extends { updated_at: string }>(before: R, row: R) => ({ row, expected: before.updated_at });

/**
 * Card rows to write so a word has live cards exactly for its directions: missing ones are
 * created, soft-deleted ones revived with their progress, unwanted ones soft-deleted.
 */
export function syncStates(word: Word, existing: readonly ReviewState[], now: Date): ReviewState[] {
  const out: ReviewState[] = [];
  for (const direction of ["fr_ru", "ru_fr"] as const satisfies readonly Direction[]) {
    const current = existing.find((s) => s.id === reviewStateId(word.id, direction));
    const wanted = word.deleted_at === null && directionsOf(word).includes(direction);
    if (wanted && !current) out.push(newReviewState(word.id, direction, now));
    else if (wanted && current && current.deleted_at !== null) {
      out.push({ ...current, deleted_at: null, updated_at: stampAfter(now, current.updated_at) });
    } else if (!wanted && current && current.deleted_at === null) {
      const stamp = stampAfter(now, current.updated_at);
      out.push({ ...current, deleted_at: stamp, updated_at: stamp });
    }
  }
  return out;
}

const uniqueIds = (ids: readonly string[]) => [...new Set(ids.map((id) => id.trim()).filter(Boolean))];

// ---------------------------------------------------------------------------------------------
// Schemas

const folderSelector = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .describe(`Theme: its id, slug or Russian name (from list_folders), or "${INBOX_SELECTOR}" for «${INBOX_NAME}».`);

const optionalText = (max: number, what: string) => z.string().max(max).nullable().optional().describe(what);
const idList = (max: number) => z.array(z.string().trim().min(1).max(64)).min(1).max(max);
const slangLevel = z
  .number()
  .int()
  .min(0)
  .max(3)
  .describe("0 neutral (нейтр.), 1 familier (fam.), 2 argot (arg.), 3 vulgaire (vulg.).");

const newWordSchema = z.object({
  fr: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("Dictionary form: nouns with their article (la thune, l'oseille), verbs in the infinitive (se casser), adjectives in the masculine singular, expressions as said (avoir le seum)."),
  ru: z.string().trim().min(1).max(300).describe("One to three Russian equivalents, comma-separated, lowercase, in the same register (бабки, not деньги, for la thune)."),
  note: optionalText(500, "Optional short Russian note (≈120 chars): register hint («груб.»), neutral gloss, synonyms, verlan origin («верлан от louche»)."),
  example_fr: optionalText(300, "Short everyday French example using the word."),
  example_ru: optionalText(300, "Russian translation of example_fr (ignored without example_fr)."),
  pos: z.enum(POS_VALUES).optional().describe("Part of speech; expression for idioms and multi-word phrases. Default other."),
  gender: z.enum(GENDER_VALUES).optional().describe("Gender for nouns (mf = both); ignored for other parts of speech."),
  slang_level: slangLevel.optional().describe("Slang level: 0 neutral, 1 familier, 2 argot, 3 vulgaire. Default 0."),
  verlan: z.boolean().optional().describe("True for verlan forms (meuf, relou, chelou, vénère)."),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  both_directions: z.boolean().optional().describe("Also make a RU→FR card (default true)."),
  folder: folderSelector.optional().describe(`Theme for this word only (id, slug, name or "${INBOX_SELECTOR}"); overrides the call's \`folder\`.`),
  folder_chosen_by_user: z
    .boolean()
    .optional()
    .describe("For this word only; overrides the call's folder_chosen_by_user (e.g. the user named this word's theme but not the others')."),
});

const statusValues = ["new", "learning", "mastered", "due"] as const;

/** Where a word sat before move_words, for restore_moves. */
interface Placement {
  id: string;
  folder_id: string | null;
  folder_source: Word["folder_source"];
  folder_confidence: Confidence | null;
}

const placementSchema = z.object({
  id: z.string().trim().min(1).max(64),
  folder_id: z.string().trim().min(1).max(64).nullable(),
  folder_source: z.enum(["user", "auto"]),
  folder_confidence: z.enum(["high", "med", "low"]).nullable(),
}) satisfies z.ZodType<Placement>;

// ---------------------------------------------------------------------------------------------
// Tool specs

export interface ToolSpec<S extends z.ZodObject, O extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  title: string;
  description: string;
  input: S;
  /** Write tools take a rate-limit token per call. */
  write: boolean;
  annotations: ToolAnnotations;
  /** Returns the structured result (also sent as JSON text). Throws ToolError for a refusal. */
  run: (deps: ToolDeps, args: z.output<S>) => Promise<O>;
}

const tool = <S extends z.ZodObject, O extends Record<string, unknown>>(spec: ToolSpec<S, O>): ToolSpec<S, O> => spec;

const READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };

export const searchWords = tool({
  name: "search_words",
  title: "Search words",
  description:
    "Search the user's saved French words. Every term of `query` must match the French, the Russian, the note or a tag, ignoring accents and case; an empty query lists words. Filter by theme and learning status. Newest first; `total` counts all matches, and `next_offset` (when not null) fetches the next page. Use it before add_words to avoid duplicates, and to find ids for update_word, move_words and delete_words.",
  input: z.object({
    query: z.string().max(200).optional().describe("Words to look for (French or Russian). Empty = all."),
    folder: folderSelector.optional(),
    status: z.enum(statusValues).optional().describe("new = never reviewed, learning, mastered, due = due for review today."),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0).describe("Matches to skip, for paging: pass the previous result's next_offset."),
  }),
  write: false,
  annotations: READ,
  async run(deps, args) {
    const [folders, words, states] = await Promise.all([deps.repo.folders(), deps.repo.words(), deps.repo.states()]);
    const target = args.folder === undefined ? undefined : resolveFolder(args.folder, folders);
    const ctx = viewContext(folders, states, deps);
    const matches = words
      .filter((w) => w.deleted_at === null)
      .filter((w) => target === undefined || (placeOf(w, ctx.live)?.id ?? null) === (target?.id ?? null))
      .filter((w) => !args.query || matchesSearch(w, args.query))
      .map((w) => wordView(w, ctx))
      .filter((v) => {
        if (args.status === "new") return v.status === "new";
        if (args.status === "learning") return v.status === "learning" || v.status === "difficult";
        if (args.status === "mastered") return v.status === "known";
        if (args.status === "due") return v.due_today;
        return true;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
    const end = args.offset + args.limit;
    return {
      total: matches.length,
      ...(target !== undefined ? { folder: folderRef(target) } : {}),
      words: matches.slice(args.offset, end),
      next_offset: end < matches.length ? end : null,
    };
  },
});

export const listFolders = tool({
  name: "list_folders",
  title: "List themes",
  description: `List the themes («темы») in display order with their word counts and how many words are due for review today, plus «${INBOX_NAME}» (words without a theme). Pass a theme's id, slug or name as \`folder\` to the other tools.`,
  input: z.object({}),
  write: false,
  annotations: READ,
  async run(deps) {
    const [folders, words, states] = await Promise.all([deps.repo.folders(), deps.repo.words(), deps.repo.states()]);
    const ctx = viewContext(folders, states, deps);
    const counts = new Map<string | null, { words: number; due: number }>();
    const total = { words: 0, due: 0 };
    for (const w of words) {
      if (w.deleted_at !== null) continue;
      const key = placeOf(w, ctx.live)?.id ?? null;
      const c = counts.get(key) ?? { words: 0, due: 0 };
      const due = (ctx.statesByWord.get(w.id) ?? []).some((s) => isDueToday(s, ctx.dayEnd)) ? 1 : 0;
      c.words++;
      c.due += due;
      total.words++;
      total.due += due;
      counts.set(key, c);
    }
    return {
      folders: [...ctx.live.values()].map((f) => ({
        id: f.id,
        slug: f.slug,
        name: f.name,
        description: f.description,
        locked: f.locked,
        ...(counts.get(f.id) ?? { words: 0, due: 0 }),
      })),
      inbox: { id: null, slug: INBOX_SELECTOR, name: INBOX_NAME, ...(counts.get(null) ?? { words: 0, due: 0 }) },
      total,
    };
  },
});

export const studySummary = tool({
  name: "study_summary",
  title: "Today's study summary",
  description:
    "Today's review numbers: cards due, new cards still available, reviews done today, words by learning status, and the words due soonest. The daily limit of new cards is a device setting this tool can't see (default 15); pass new_per_day if the user changed it. The exact queue is built by the app on the device, and reviewing happens there.",
  input: z.object({
    new_per_day: z.number().int().min(0).max(500).default(DEFAULT_NEW_PER_DAY).describe("The app's «Новых в день» setting."),
  }),
  write: false,
  annotations: READ,
  async run(deps, args) {
    const now = deps.now();
    const day = studyDay(now, deps.timeZone);
    const dayEnd = day.end.getTime();
    const [folders, words, states, logs] = await Promise.all([
      deps.repo.folders(),
      deps.repo.words(),
      deps.repo.states(),
      deps.repo.logsSince(day.start.toISOString()),
    ]);
    const live = new Map(liveFolders(folders).map((f) => [f.id, f]));
    const wordsById = new Map(words.filter((w) => w.deleted_at === null).map((w) => [w.id, w]));
    const cards = states.filter((s) => s.deleted_at === null && wordsById.has(s.word_id));
    const byKey = new Map(cards.map((s) => [s.id, s]));
    // As in loadSession: the daily new-card allowance counts every review of the day, also of words
    // deleted since; «reviewed today» counts only live words' reviews.
    const dayLogs = logs.filter((l) => l.deleted_at === null && Date.parse(l.review) < dayEnd);
    const today = dayLogs.filter((l) => wordsById.has(l.word_id));
    const introduced = new Set(dayLogs.filter((l) => l.state === 0).map((l) => reviewStateId(l.word_id, l.direction)));
    const reviewed = new Set(dayLogs.map((l) => reviewStateId(l.word_id, l.direction)));

    const due = cards.filter((s) => isDueToday(s, dayEnd)).sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
    // Same rule as loadSession: a new RU→FR card waits until its FR→RU card was learned on an earlier day.
    const fresh = cards.filter((s) => {
      if (s.state !== 0) return false;
      if (s.direction !== "ru_fr") return true;
      const siblingKey = reviewStateId(s.word_id, "fr_ru");
      const sibling = byKey.get(siblingKey);
      return !(sibling && (sibling.state === 0 || reviewed.has(siblingKey)));
    });
    const allowance = Math.max(0, args.new_per_day - introduced.size);

    const statesByWord = new Map<string, ReviewState[]>();
    for (const s of cards) statesByWord.set(s.word_id, [...(statesByWord.get(s.word_id) ?? []), s]);
    const byStatus: Record<CardStatus, number> = { new: 0, learning: 0, known: 0, difficult: 0 };
    for (const w of wordsById.values()) byStatus[wordStatus(statesByWord.get(w.id) ?? [])]++;

    const dueWords: ReturnType<typeof brief>[] = [];
    const seen = new Set<string>();
    for (const s of due) {
      if (seen.has(s.word_id) || dueWords.length >= 20) continue;
      seen.add(s.word_id);
      dueWords.push(brief(wordsById.get(s.word_id)!, live));
    }
    return {
      study_day: { start: day.start.toISOString(), end: day.end.toISOString(), time_zone: deps.timeZone },
      due_cards: due.length,
      new_cards_available: Math.min(fresh.length, allowance),
      /** New cards that could be introduced, ignoring the daily limit. */
      new_cards_ready: fresh.length,
      reviewed_today: today.length,
      words: { total: wordsById.size, ...byStatus },
      due_soonest: dueWords,
      note: "Counts come from the synced copy: reviews not yet synced from the device are missing. The app builds the exact queue.",
    };
  },
});

export const addWords = tool({
  name: "add_words",
  title: "Add words",
  description:
    `Add 1–50 new words. Each gets review cards (FR→RU, and RU→FR unless both_directions is false). Words whose French form is already saved are skipped (on_duplicate "skip", the default) and listed in \`duplicates\`. Fill in everything you can: ru, slang_level (0 neutral, 1 familier, 2 argot, 3 vulgaire), verlan, pos, gender for nouns, and a short example_fr with example_ru. \`folder\` is a theme id, slug or name (default «${INBOX_NAME}»); set folder_chosen_by_user to true only when the user named the theme (per word, \`folder\` and folder_chosen_by_user override the call's). List the words and get the user's OK before adding more than 5. Undo with delete_words and the returned ids.`,
  input: z.object({
    words: z.array(newWordSchema).min(1).max(50),
    folder: folderSelector.optional().describe(`Theme for all words: id, slug or name (default «${INBOX_NAME}»).`),
    folder_chosen_by_user: z
      .boolean()
      .describe("True when the user named the theme (it then stays put during automatic sorting); false when you picked it."),
    on_duplicate: z.enum(["skip", "add"]).default("skip").describe('"add" saves a word even if the same French form exists.'),
  }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async run(deps, args) {
    const [folders, words] = await Promise.all([deps.repo.folders(), deps.repo.words()]);
    const callFolder = args.folder === undefined ? null : resolveFolder(args.folder, folders);
    // Resolve every theme before writing anything.
    const targets = args.words.map((w) => (w.folder === undefined ? callFolder : resolveFolder(w.folder, folders)));
    const live = new Map(liveFolders(folders).map((f) => [f.id, f]));
    const byLemma = new Map<string, Word>();
    for (const w of words) if (w.deleted_at === null) byLemma.set(normalizeLemma(w.fr), w);

    const now = deps.now();
    const built: Word[] = [];
    const duplicates: { fr: string; existing: ReturnType<typeof brief> }[] = [];
    args.words.forEach((input, i) => {
      const key = normalizeLemma(input.fr);
      const dup = byLemma.get(key);
      if (dup && args.on_duplicate === "skip") {
        duplicates.push({ fr: input.fr, existing: brief(dup, live) });
        return;
      }
      const folder = targets[i];
      const chosen = input.folder_chosen_by_user ?? args.folder_chosen_by_user;
      const pos = input.pos ?? "other";
      const exampleFr = cleanText(input.example_fr);
      const word = buildWord(
        {
          fr: input.fr,
          ru: input.ru,
          note: input.note,
          example_fr: exampleFr,
          example_ru: exampleFr ? input.example_ru : null,
          pos,
          gender: pos === "noun" ? (input.gender ?? "none") : "none",
          slang_level: (input.slang_level ?? 0) as Word["slang_level"],
          verlan: input.verlan ?? false,
          tags: input.tags,
          both_directions: input.both_directions ?? true,
          folder_id: folder?.id ?? null,
          folder_source: chosen ? "user" : "auto",
          folder_confidence: !chosen && folder ? "med" : null,
          source: "chat",
        },
        now,
      );
      byLemma.set(key, word);
      built.push(word);
    });

    if (built.length > 0) {
      const states = built.flatMap((w) => directionsOf(w).map((d) => newReviewState(w.id, d, now)));
      await deps.repo.upsert("review_state", states);
      try {
        await deps.repo.upsert("words", built);
      } catch (error) {
        // Best effort: drop the cards of words that were really not saved. The write may have
        // committed with its answer lost, so check first; when unsure keep the cards (orphan cards
        // are ignored, a saved word without cards never comes up for review).
        const saved = new Set((await deps.repo.wordsByIds(built.map((w) => w.id)).catch(() => built)).map((w) => w.id));
        const stamp = stampAfter(now, now.toISOString());
        const orphans = states.filter((s) => !saved.has(s.word_id)).map((s) => ({ ...s, deleted_at: stamp, updated_at: stamp }));
        if (orphans.length > 0) await deps.repo.upsert("review_state", orphans).catch(() => undefined);
        throw error;
      }
    }
    return {
      added: built.map((w) => ({ ...brief(w, live), slang_level: w.slang_level, verlan: w.verlan })),
      duplicates,
      undo: built.length > 0 ? { tool: "delete_words", ids: built.map((w) => w.id) } : null,
      note: SYNC_NOTE,
    };
  },
});

export const updateWord = tool({
  name: "update_word",
  title: "Edit a word",
  description:
    "Edit one word: French, Russian, note, example, tags, part of speech, gender, slang level, verlan, or both_directions. Only the fields in `patch` change; null clears note or example. both_directions false removes the RU→FR card, true brings it back with its progress. Use move_words to change the theme.",
  input: z.object({
    id: z.string().trim().min(1).max(64).describe("Word id from search_words."),
    patch: z
      .object({
        fr: z.string().trim().min(1).max(200).optional(),
        ru: z.string().trim().min(1).max(300).optional(),
        note: optionalText(500, "Usage note in Russian; null clears it."),
        example_fr: optionalText(300, "French example; null clears the example."),
        example_ru: optionalText(300, "Russian translation of the example."),
        pos: z.enum(POS_VALUES).optional(),
        gender: z.enum(GENDER_VALUES).optional().describe("Nouns only; other parts of speech always get none."),
        slang_level: slangLevel.optional(),
        verlan: z.boolean().optional(),
        tags: z.array(z.string().trim().min(1).max(40)).max(10).optional().describe("Replaces all tags."),
        both_directions: z.boolean().optional(),
      })
      .describe("Fields to change."),
  }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const [current] = await deps.repo.wordsByIds([args.id]);
    if (!current || current.deleted_at !== null) throw new ToolError(`No word with id ${args.id}. Find it with search_words.`);
    const now = deps.now();
    const p = args.patch;
    const next: Word = { ...current };
    if (p.fr !== undefined) next.fr = cleanText(p.fr) ?? current.fr;
    if (p.ru !== undefined) next.ru = cleanText(p.ru) ?? current.ru;
    for (const key of ["note", "example_fr", "example_ru"] as const) if (p[key] !== undefined) next[key] = cleanText(p[key]);
    if (p.pos !== undefined) next.pos = p.pos;
    if (p.gender !== undefined) next.gender = p.gender;
    if (p.slang_level !== undefined) next.slang_level = p.slang_level as Word["slang_level"];
    if (p.verlan !== undefined) next.verlan = p.verlan;
    if (p.tags !== undefined) next.tags = [...new Set(p.tags.map((t) => t.trim()).filter(Boolean))];
    if (p.both_directions !== undefined) next.both_directions = p.both_directions;
    if (next.pos !== "noun") next.gender = "none";
    if (!next.example_fr) next.example_ru = null;

    const changed = JSON.stringify(next) !== JSON.stringify(current);
    let conflict = false;
    if (changed) {
      next.updated_at = stampAfter(now, current.updated_at);
      const outcome = await writeWords(deps.repo, [change(current, next)]);
      if (outcome.failed.size > 0) throw new RepoError(outcome.error ?? "words: no answer");
      conflict = outcome.conflicts.size > 0;
    }
    if (conflict) {
      return {
        status: "conflict",
        message: "The app saved a newer version of this word meanwhile, so nothing changed. Read it again with search_words and retry.",
      };
    }
    // Also repairs cards left out of step by an earlier failed call.
    let cards = 0;
    if (p.both_directions !== undefined) {
      const rows = syncStates(next, await deps.repo.states([next.id]), now);
      if (rows.length > 0) await deps.repo.upsert("review_state", rows);
      cards = rows.length;
    }
    const [folders, states] = await Promise.all([deps.repo.folders(), deps.repo.states([next.id])]);
    return {
      status: changed || cards > 0 ? "updated" : "unchanged",
      word: wordView(changed ? next : current, viewContext(folders, states, deps)),
      note: SYNC_NOTE,
    };
  },
});

export const moveWords = tool({
  name: "move_words",
  title: "Move words to a theme",
  description:
    `Move words to a theme, or to "${INBOX_SELECTOR}". mode "user" (default) is a move the user asked for: automatic sorting leaves the word there afterwards. mode "auto" is your own sorting: words the user placed by hand and words in locked themes are skipped. List the moves and get the user's OK first. Undo with restore_moves and the returned \`undo.moves\` (not with another move: that would change how the words are sorted later).`,
  input: z.object({
    ids: idList(200).describe("Word ids from search_words."),
    folder: folderSelector,
    mode: z.enum(["user", "auto"]).default("user").describe('"user" when the user asked for this move; "auto" for your own sorting.'),
  }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const ids = uniqueIds(args.ids);
    const [folders, found] = await Promise.all([deps.repo.folders(), deps.repo.wordsByIds(ids)]);
    const target = resolveFolder(args.folder, folders);
    const targetId = target?.id ?? null;
    const live = new Map(liveFolders(folders).map((f) => [f.id, f]));
    const locked = new Set([...live.values()].filter((f) => f.locked).map((f) => f.id));
    const byId = new Map(found.map((w) => [w.id, w]));
    const now = deps.now();
    const confidence = targetId === null || args.mode === "user" ? null : "med";

    const changes: Replacement<"words">[] = [];
    const undo: Placement[] = [];
    const moved: { id: string; fr: string; from: FolderRef; to: FolderRef }[] = [];
    const skipped: { id: string; fr: string; reason: string }[] = [];
    const unchanged: string[] = [];
    const notFound: string[] = [];
    for (const id of ids) {
      const w = byId.get(id);
      if (!w || w.deleted_at !== null) {
        notFound.push(id);
        continue;
      }
      if (args.mode === "auto" && !isMovable(w, locked)) {
        skipped.push({ id, fr: w.fr, reason: w.folder_source === "user" ? "placed by the user" : "in a locked theme" });
        continue;
      }
      if (w.folder_id === targetId && w.folder_source === args.mode && w.folder_confidence === confidence) {
        unchanged.push(id);
        continue;
      }
      changes.push(
        change(w, { ...w, folder_id: targetId, folder_source: args.mode, folder_confidence: confidence, updated_at: stampAfter(now, w.updated_at) }),
      );
      undo.push({ id, folder_id: w.folder_id, folder_source: w.folder_source, folder_confidence: w.folder_confidence });
      moved.push({ id, fr: w.fr, from: folderRef(placeOf(w, live)), to: folderRef(target) });
    }
    const outcome = await writeWords(deps.repo, changes);
    const { conflicts, failed } = outcome;
    // The words in `failed` may have moved, so their way back stays in: restore_moves leaves an unmoved word unchanged.
    const undoMoves = undo.filter((u) => !conflicts.has(u.id));
    return {
      moved: moved.filter((m) => !conflicts.has(m.id) && !failed.has(m.id)),
      skipped,
      unchanged,
      not_found: notFound,
      conflicts: [...conflicts],
      ...failedPart(outcome),
      undo: undoMoves.length > 0 ? { tool: "restore_moves", moves: undoMoves } : null,
      note: SYNC_NOTE,
    };
  },
});

export const restoreMoves = tool({
  name: "restore_moves",
  title: "Undo a move",
  description:
    "Undo move_words: put words back exactly where they were, including how automatic sorting treats them. Pass the `undo.moves` list from move_words unchanged.",
  input: z.object({
    moves: z
      .array(placementSchema)
      .min(1)
      .max(200)
      .describe("move_words' `undo.moves`, as returned."),
  }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const moves = [...new Map(args.moves.map((m) => [m.id, m])).values()];
    const [folders, found] = await Promise.all([deps.repo.folders(), deps.repo.wordsByIds(moves.map((m) => m.id))]);
    const live = new Map(liveFolders(folders).map((f) => [f.id, f]));
    const known = new Set(folders.map((f) => f.id));
    const byId = new Map(found.map((w) => [w.id, w]));
    const now = deps.now();
    const changes: Replacement<"words">[] = [];
    const unchanged: string[] = [];
    const notFound: string[] = [];
    for (const m of moves) {
      const w = byId.get(m.id);
      // A theme deleted since is fine (the word then shows in «Входящие», as before); an unknown id is not.
      if (!w || w.deleted_at !== null || (m.folder_id !== null && !known.has(m.folder_id))) {
        notFound.push(m.id);
        continue;
      }
      const placed = { folder_id: m.folder_id, folder_source: m.folder_source, folder_confidence: m.folder_id === null ? null : m.folder_confidence };
      if (w.folder_id === placed.folder_id && w.folder_source === placed.folder_source && w.folder_confidence === placed.folder_confidence) {
        unchanged.push(m.id);
        continue;
      }
      changes.push(change(w, { ...w, ...placed, updated_at: stampAfter(now, w.updated_at) }));
    }
    const outcome = await writeWords(deps.repo, changes);
    const { conflicts, failed } = outcome;
    return {
      restored: changes.filter((c) => !conflicts.has(c.row.id) && !failed.has(c.row.id)).map((c) => brief(c.row, live)),
      unchanged,
      not_found: notFound,
      conflicts: [...conflicts],
      ...failedPart(outcome),
      note: SYNC_NOTE,
    };
  },
});

export const deleteWords = tool({
  name: "delete_words",
  title: "Delete words",
  description:
    "Delete words together with their review cards. It is a soft delete: restore_words brings them back with their progress. Name the words to the user and get their OK first.",
  input: z.object({ ids: idList(100).describe("Word ids from search_words.") }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const ids = uniqueIds(args.ids);
    const [folders, found] = await Promise.all([deps.repo.folders(), deps.repo.wordsByIds(ids)]);
    const live = new Map(liveFolders(folders).map((f) => [f.id, f]));
    const now = deps.now();
    const targets = found.filter((w) => w.deleted_at === null);
    const outcome = await writeWords(
      deps.repo,
      targets.map((w) => {
        const stamp = stampAfter(now, w.updated_at);
        return change(w, { ...w, deleted_at: stamp, updated_at: stamp });
      }),
    );
    const { conflicts, failed } = outcome;
    // Cards only for words confirmed deleted: a live word must never be left without them.
    const deleted = targets.filter((w) => !conflicts.has(w.id) && !failed.has(w.id));
    const cards = (await deps.repo.states(deleted.map((w) => w.id)))
      .filter((s) => s.deleted_at === null)
      .map((s) => {
        const stamp = stampAfter(now, s.updated_at);
        return { ...s, deleted_at: stamp, updated_at: stamp };
      });
    if (cards.length > 0) await deps.repo.upsert("review_state", cards);
    const deletedIds = new Set(deleted.map((w) => w.id));
    return {
      deleted: deleted.map((w) => brief(w, live)),
      not_found: ids.filter((id) => !deletedIds.has(id) && !conflicts.has(id) && !failed.has(id)),
      conflicts: [...conflicts],
      ...failedPart(outcome),
      undo: deleted.length > 0 ? { tool: "restore_words", ids: deleted.map((w) => w.id) } : null,
      note: SYNC_NOTE,
    };
  },
});

export const restoreWords = tool({
  name: "restore_words",
  title: "Restore deleted words",
  description: "Undo delete_words: bring deleted words back with their review progress.",
  input: z.object({ ids: idList(100).describe("Ids from delete_words' `undo`.") }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const ids = uniqueIds(args.ids);
    const [folders, found] = await Promise.all([deps.repo.folders(), deps.repo.wordsByIds(ids)]);
    const live = new Map(liveFolders(folders).map((f) => [f.id, f]));
    const now = deps.now();
    const changes = found
      .filter((w) => w.deleted_at !== null)
      .map((w) => change(w, { ...w, deleted_at: null, updated_at: stampAfter(now, w.updated_at) }));
    const revived = changes.map((c) => c.row);
    const existing = await deps.repo.states(revived.map((w) => w.id));
    const cards = revived.flatMap((w) => syncStates(w, existing.filter((s) => s.word_id === w.id), now));
    // Cards first: a live word must never be left without them.
    if (cards.length > 0) await deps.repo.upsert("review_state", cards);
    const outcome = await writeWords(deps.repo, changes);
    const { conflicts, failed } = outcome;
    const restored = revived.filter((w) => !conflicts.has(w.id) && !failed.has(w.id));
    const restoredIds = new Set(restored.map((w) => w.id));
    return {
      restored: restored.map((w) => brief(w, live)),
      not_found: ids.filter((id) => !restoredIds.has(id) && !conflicts.has(id) && !failed.has(id)),
      conflicts: [...conflicts],
      ...failedPart(outcome),
      note: SYNC_NOTE,
    };
  },
});

export const createFolder = tool({
  name: "create_folder",
  title: "Create a theme",
  description:
    "Create a theme («тема») with a Russian name and an optional description of what belongs in it (automatic sorting reads it). Fails when a theme with that name exists. Ask the user before creating a theme they didn't ask for.",
  input: z.object({
    name: z.string().trim().min(1).max(60).describe("Russian name, e.g. «Работа»."),
    description: z.string().max(300).nullable().optional().describe("What belongs here, in Russian, with a few example words."),
  }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const name = cleanText(args.name);
    if (!name) throw new ToolError("The theme name is empty.");
    if (name.toLowerCase() === INBOX_SELECTOR || sameName(name, INBOX_NAME)) {
      throw new ToolError(`«${INBOX_NAME}» is built in; pick another name.`);
    }
    const folders = await deps.repo.folders();
    const live = liveFolders(folders);
    const dup = live.find((f) => sameName(f.name, name));
    if (dup) throw new ToolError(`A theme named «${dup.name}» already exists (id ${dup.id}).`);
    const taken = new Set([...folders.map((f) => f.slug), INBOX_SELECTOR]);
    const slug = uniqueSlug(name, taken);
    // A default theme's slug that never existed keeps its fixed id, so a device seeding the defaults merges with it.
    const isDefault = DEFAULT_FOLDERS.some((d) => d.slug === slug) && !folders.some((f) => f.id === defaultFolderId(slug));
    const folder: Folder = {
      id: isDefault ? defaultFolderId(slug) : newId(),
      slug,
      name,
      description: cleanText(args.description),
      color: pickFolderColor(live),
      created_by: "user",
      locked: false,
      sort: nextFolderSort(live),
      updated_at: deps.now().toISOString(),
      deleted_at: null,
    };
    await deps.repo.upsert("folders", [folder]);
    return { folder: { id: folder.id, slug: folder.slug, name: folder.name, description: folder.description }, note: SYNC_NOTE };
  },
});

// ---------------------------------------------------------------------------------------------
// Execution and registration

const errorResult = (message: string): CallToolResult => ({ content: [{ type: "text", text: message }], isError: true });

async function execute<S extends z.ZodObject>(spec: ToolSpec<S>, deps: ToolDeps, args: z.output<S>): Promise<CallToolResult> {
  if (spec.write) {
    const limit = takeToken("mcp", `u:${deps.userId}`);
    if (!limit.ok) return errorResult(`Too many changes in a row. Wait ${limit.retryAfterSec} s and try again.`);
  }
  try {
    const out = await spec.run(deps, args);
    return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
  } catch (error) {
    if (error instanceof ToolError) return errorResult(error.message);
    if (error instanceof RepoError) {
      console.error(`[mcp] ${spec.name}: ${error.message}`);
      const hint = spec.write ? " Part of the change may be saved: check with search_words before retrying." : "";
      return errorResult(`The database refused or did not answer: ${error.message}.${hint}`);
    }
    console.error(`[mcp] ${spec.name} failed`, error);
    return errorResult(error instanceof Error && error.message ? error.message : "Unexpected error.");
  }
}

/** Validates raw arguments like the SDK does, then runs the tool (rate limit included). For tests and scripts. */
export async function callTool<S extends z.ZodObject>(spec: ToolSpec<S>, deps: ToolDeps, raw: unknown): Promise<CallToolResult> {
  const parsed = spec.input.safeParse(raw ?? {});
  if (!parsed.success) return errorResult(parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  return execute(spec, deps, parsed.data);
}

function register<S extends z.ZodObject>(server: McpServer, deps: ToolDeps, spec: ToolSpec<S>): void {
  // Explicit type arguments: with a generic schema the SDK's callback type can't be resolved.
  server.registerTool<StandardSchemaWithJSON, StandardSchemaWithJSON>(
    spec.name,
    { title: spec.title, description: spec.description, inputSchema: spec.input, annotations: { title: spec.title, ...spec.annotations } },
    (args) => execute(spec, deps, args as z.output<S>),
  );
}

export const TOOL_NAMES = [
  searchWords.name,
  listFolders.name,
  studySummary.name,
  addWords.name,
  updateWord.name,
  moveWords.name,
  restoreMoves.name,
  deleteWords.name,
  restoreWords.name,
  createFolder.name,
] as const;

export function registerTools(server: McpServer, deps: ToolDeps): void {
  register(server, deps, searchWords);
  register(server, deps, listFolders);
  register(server, deps, studySummary);
  register(server, deps, addWords);
  register(server, deps, updateWord);
  register(server, deps, moveWords);
  register(server, deps, restoreMoves);
  register(server, deps, deleteWords);
  register(server, deps, restoreWords);
  register(server, deps, createFolder);
}

export const SERVER_INSTRUCTIONS = `«Карточки» is the user's flashcard app for colloquial French; the user is a Russian speaker. A card is a French word or phrase (fr) with its Russian translation (ru). Words are grouped into themes («темы»); «${INBOX_NAME}» (inbox) holds words without a theme.
- Before adding, search_words for the word; add_words also skips French forms that are already saved.
- For each new word give the dictionary form, one to three Russian equivalents in the same register, slang_level (0 neutral, 1 familier, 2 argot, 3 vulgaire), verlan (true for verlan forms such as meuf, relou, chelou), pos, gender for nouns, and a short everyday example_fr with its example_ru. Vulgar words are legitimate vocabulary: translate them with the same strength and mark them 3.
- Set folder_chosen_by_user to true only when the user named the theme; otherwise pick a fitting theme yourself, or leave the word in the inbox.
- Before adding more than 5 words, and before any move or delete, list what will change and wait for the user's OK.
- After a change, say what changed and how to undo it with the result's \`undo\` (delete_words, restore_words or restore_moves).
- Make write calls one at a time, never in parallel: each reads the current rows first, and parallel writes to the same words conflict or slip past the duplicate check.
- Changes reach the app on its next sync (when it is opened or focused). Reviewing and grading cards happen in the app only.
- Talk about the app's features plainly; never call them "AI".`;
