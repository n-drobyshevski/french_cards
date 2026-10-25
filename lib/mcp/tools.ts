// The Claude connector's tools. Each handler is a pure `run(deps, args)` over McpRepo, so tests
// drive them with an in-memory repo; `registerTools` wires them into an McpServer. The write
// paths mirror the device's lib/words.ts and lib/folders.ts rules:
// - a new word gets every default set explicitly, source "chat", and its review cards, which are
//   written before the word (orphan cards are ignored by the app, a word without cards is not);
// - every rewritten row gets updated_at past the stored one; a word is rewritten only if it is
//   still the version that was read (compare-and-set), otherwise it comes back as a conflict;
// - nothing is hard-deleted; deleting a word soft-deletes its cards too.
import { createHash } from "node:crypto";
import type { CallToolResult, McpServer, StandardSchemaWithJSON, ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";
import { GENDER_VALUES, POS_VALUES } from "@/lib/ai/schemas";
import { takeToken } from "@/lib/ai/rate-limit";
import {
  cleanCustomFields,
  cleanFieldLabel,
  cleanFieldValue,
  FIELD_HINT_MAX,
  FIELD_LABEL_MAX,
  FIELD_VALUE_MAX,
  fieldDefByName,
  fieldsForDisplay,
  liveFieldDefs,
  MAX_FIELD_DEFS,
  MAX_WORD_FIELDS,
  withFieldValue,
} from "@/lib/core/custom-fields";
import { DEFAULT_FOLDERS, defaultFolderId, nextFolderSort, pickFolderColor, uniqueSlug } from "@/lib/core/folders";
import {
  ANSWER_MAX,
  answerWords,
  autoLevelOf,
  cleanLevels,
  completeSet,
  CONJUGATE_MAX,
  contextFromWords,
  EXERCISE_ID_PREFIX,
  EXERCISE_LEVELS,
  EXPLAIN_MAX,
  ITEMS_MAX,
  ITEMS_MIN,
  levelsText,
  levelWarnings,
  MAX_ATTEMPTS,
  missedWords,
  NEW_WORDS_MAX,
  parseScope,
  playableItemIds,
  REF_MAX,
  runSettled,
  scoreRun,
  TEXT_MAX,
  TITLE_MAX,
  TOPIC_MAX,
  validateSet,
  warningsFor,
  type ExerciseLevel,
  type ExerciseSetContent,
} from "@/lib/core/exercises";
import {
  DEFAULT_EXERCISE_FOCUS,
  EXERCISE_FOCUS_PREF,
  FOCUS_SHARE_MIN,
  focusMinItems,
  matchesFocus,
  parseExerciseFocus,
} from "@/lib/core/exercise-focus";
import { CHAT_ITEM_TYPES, CHAT_PLAYER_URI, fillArtifact, MCP_APP_MIME, parseRunLine, RUN_LINE_PREFIX, SAVE_RESULT_TOOL, type ChatPlayerSet, type ChatRunResult } from "@/lib/core/chat-player";
import { matchesSearch, normalizeLemma, searchHaystack, searchKey } from "@/lib/core/text";
import { buildWord, cleanText, directionsOf, isMovable, isPaused, pausedFolderIds } from "@/lib/core/words";
import { cleanConjugation, cleanOrigin, conjugate, ORIGIN_MAX, type ConjData } from "@/lib/core/conjugate";
import conjTable from "@/public/lexique/fr-conj.json";
import { newId } from "@/lib/id";
import { folderOrderOf, planDay } from "@/lib/core/plan";
import { CEFR_LEVELS, STORED_LEVEL_SOURCES, type Cefr, type LevelResolver, type StoredLevelSource } from "@/lib/core/level";
import { migrateStudyPlan, NEW_WORDS_MAX as PLAN_NEW_WORDS_MAX, NEW_WORDS_MIN as PLAN_NEW_WORDS_MIN, parseStudyPlan, REVIEW_CAP_MAX, REVIEW_CAP_MIN, sameStudyPlan, STUDY_PLAN_PREF, type StudyPlan } from "@/lib/core/study-plan";
import { cardStatus, newReviewState, retrievability, reviewStateId, wordStatus, type CardStatus } from "@/lib/scheduler";
import type {
  Confidence,
  Conjugation,
  CustomFieldValue,
  Direction,
  ExerciseAnswer,
  ExerciseFocus,
  ExerciseFocusShare,
  ExerciseFocusTarget,
  ExerciseItem,
  ExerciseItemType,
  ExerciseNewWord,
  ExercisePerson,
  ExerciseRun,
  ExerciseScope,
  ExerciseSet,
  ExerciseSkill,
  ExerciseTense,
  FieldDef,
  Folder,
  ReviewState,
  SlangLevel,
  UserPref,
  Word,
} from "@/lib/types";
import { PartialWriteError, RepoError, type McpRepo, type Replacement } from "./repo";
import { lemmaLevel, serverLevels } from "./levels";
import { HISTORY_DAYS_MAX, historyRange, progressHistory } from "./history";
import { studyDay, studyDayStartBefore } from "./study-day";
import { planFitLogsFrom, planFitView, serverPlanFit } from "./plan-fit";
import { CHAT_PLAYER_ARTIFACT, CHAT_PLAYER_HTML } from "./chat-player-html";

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
  /** Live themes «на паузе». */
  paused: Set<string>;
  statesByWord: Map<string, ReviewState[]>;
  dayEnd: number;
  /** Custom-field definitions (tombstones included), for the fields' current names. */
  defs: readonly FieldDef[];
  /** «Уровень языка»: stored levels, else the FLELex / Lexique estimate. */
  levels: LevelResolver;
}

function viewContext(folders: readonly Folder[], states: readonly ReviewState[], defs: readonly FieldDef[], deps: ToolDeps): ViewContext {
  const statesByWord = new Map<string, ReviewState[]>();
  for (const s of states) {
    if (s.deleted_at !== null) continue;
    const list = statesByWord.get(s.word_id);
    if (list) list.push(s);
    else statesByWord.set(s.word_id, [s]);
  }
  return {
    live: new Map(liveFolders(folders).map((f) => [f.id, f])),
    paused: pausedFolderIds(folders),
    statesByWord,
    dayEnd: studyDay(deps.now(), deps.timeZone).end.getTime(),
    defs,
    levels: serverLevels(),
  };
}

const isDueToday = (s: Pick<ReviewState, "state" | "due">, dayEnd: number) => s.state !== 0 && Date.parse(s.due) < dayEnd;

/** Short form for lists of changes. */
const brief = (w: Word, live: ReadonlyMap<string, Folder>) => ({ id: w.id, fr: w.fr, ru: w.ru, folder: folderRef(placeOf(w, live)) });

/** The word's custom fields as name → value (shared fields under their current names, in order). */
function customFieldsView(w: Word, defs: readonly FieldDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fieldsForDisplay(w, defs)) if (!(f.label in out)) out[f.label] = f.value;
  return out;
}

const CONJ_DATA = conjTable as unknown as ConjData;

/**
 * Verbs only: the conjugation saved on the word (flat, as conjugation input takes it), or whether
 * the app builds one on the device from Lexique (`conjugation_builtin`), so a missing one is easy to spot.
 */
function conjugationView(w: Word): Record<string, unknown> {
  const saved = cleanConjugation(w.conjugation);
  if (saved) return { conjugation: { auxiliary: saved.auxiliary, remark: saved.remark, ...saved.tenses } };
  if (w.pos !== "verb" && w.pos !== "expression") return {};
  const builtin = conjugate(w.fr, CONJ_DATA) !== null;
  return w.pos === "verb" || builtin ? { conjugation_builtin: builtin } : {};
}

/**
 * «Уровень языка» as the app shows it: `level` null = «без уровня»; `level_source` user / chat / ai
 * for a stored level, flelex / freq for an estimate (computed, never stored).
 */
function levelView(w: Word, levels: LevelResolver): { level: Cefr | null; level_source?: string } {
  const info = levels.level(w);
  return info ? { level: info.level, level_source: info.source } : { level: null };
}

/** The planner's `level` / `freq` inputs (new_order "level" and "themes"). */
const levelSignals = (levels: LevelResolver) => ({
  level: (w: Word) => levels.level(w)?.level ?? null,
  freq: (w: Word) => levels.freq(w),
});

function wordView(w: Word, ctx: ViewContext) {
  const states = ctx.statesByWord.get(w.id) ?? [];
  const fields = customFieldsView(w, ctx.defs);
  const paused = isPaused(w, ctx.paused);
  return {
    id: w.id,
    fr: w.fr,
    ru: w.ru,
    note: w.note,
    example_fr: w.example_fr,
    example_ru: w.example_ru,
    extra_examples: w.extra_examples,
    // Only when the word has any, to keep results small.
    ...(Object.keys(fields).length > 0 ? { custom_fields: fields } : {}),
    ...(w.origin ? { origin: w.origin } : {}),
    ...conjugationView(w),
    pos: w.pos,
    gender: w.gender,
    slang_level: w.slang_level,
    verlan: w.verlan,
    ...levelView(w, ctx.levels),
    tags: w.tags,
    folder: folderRef(placeOf(w, ctx.live)),
    folder_source: w.folder_source,
    both_directions: w.both_directions,
    status: wordStatus(states),
    ...(w.muted ? { muted: true } : {}),
    ...(paused && !w.muted ? { theme_muted: true } : {}),
    due_today: !paused && states.some((s) => isDueToday(s, ctx.dayEnd)),
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

/**
 * Sets custom fields by name on a word's values: the name of a live shared definition (any case)
 * addresses that field, any other name a field of this word only. null or "" clears a field;
 * clears go first, so one call can swap fields on a full card. Returns the new values and the
 * one-off names the word did not have before.
 */
export function applyCustomFields(
  current: readonly CustomFieldValue[] | null | undefined,
  patch: Readonly<Record<string, string | null>>,
  defs: readonly FieldDef[],
): { values: CustomFieldValue[]; newOneOff: string[] } {
  let values = cleanCustomFields(current);
  const newOneOff: string[] = [];
  const entries = Object.entries(patch).sort(([, a], [, b]) => Number(!!cleanFieldValue(a)) - Number(!!cleanFieldValue(b)));
  for (const [name, value] of entries) {
    const label = cleanFieldLabel(name);
    if (!label) throw new ToolError("A custom field name is empty.");
    const def = fieldDefByName(defs, label);
    const had = values.find((f) => sameName(f.label, label));
    // A one-off field keeps the spelling it was saved with.
    values = withFieldValue(values, def ? { field_id: def.id, label: def.name } : { field_id: null, label: had?.label ?? label }, value);
    if (!cleanFieldValue(value)) continue;
    if (!(def ? values.some((f) => f.field_id === def.id) : values.some((f) => sameName(f.label, label)))) {
      throw new ToolError(
        `A card holds at most ${MAX_WORD_FIELDS} custom fields, so «${label}» doesn't fit. Clear another one (value null) in the same call, or leave it out.`,
      );
    }
    if (!def && !had && !newOneOff.some((n) => sameName(n, label))) newOneOff.push(label);
  }
  return { values, newOneOff };
}

const ONE_OFF_NOTE =
  "The names in new_one_off_fields are not shared fields (list_fields), so they were saved on that word only. If a shared field was meant, clear the one-off one (null) and set the shared name with update_word.";

// ---------------------------------------------------------------------------------------------
// Schemas

const folderSelector = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .describe(`Theme: its id, slug or Russian name (from list_folders), or "${INBOX_SELECTOR}" for «${INBOX_NAME}».`);

const optionalText = (max: number, what: string) => z.string().max(max).nullable().optional().describe(what);
const customFieldsInput = (what: string) =>
  z
    .record(z.string().trim().min(1).max(FIELD_LABEL_MAX), z.string().max(FIELD_VALUE_MAX).nullable())
    .optional()
    .describe(
      `Custom fields («Свои поля») as name → value. Names: the user's shared fields from list_fields (any case); any other name creates a field for this word only. ${what} Values up to ${FIELD_VALUE_MAX} characters; at most ${MAX_WORD_FIELDS} fields per word.`,
    );
const idList = (max: number) => z.array(z.string().trim().min(1).max(64)).min(1).max(max);
const slangLevel = z
  .number()
  .int()
  .min(0)
  .max(3)
  .describe("0 neutral (нейтр.), 1 familier (fam.), 2 argot (arg.), 3 vulgaire (vulg.).");

const cefrLevel = z.enum(CEFR_LEVELS as readonly [Cefr, ...Cefr[]]);
const LEVEL_RUBRIC =
  "CEFR level of the word for a learner of French (the level of a textbook or DELF / TCF list where it first appears): A1 basic everyday words (maison, manger), A2 common (le loyer, se dépêcher), B1 (la démarche, constater), B2 (s'en sortir, néanmoins), C1–C2 rare, literary or very specific. Not for argot, vulgar words or verlan unless the user asks.";

const conjForms = (tense: string) =>
  z
    .array(z.string().trim().min(1).max(80))
    .length(6)
    .describe(`${tense}: six forms je, tu, il, nous, vous, ils, each with its pronoun («je kiffe», «j'ai kiffé», «je me suis cassé»).`);

const conjugationInput = z
  .object({
    auxiliary: z.enum(["avoir", "être"]).describe("Auxiliary of the passé composé (pronominal verbs: être)."),
    remark: z.string().trim().max(120).nullable().optional().describe("Optional short Russian remark («неправильный глагол», «как venir»)."),
    present: conjForms("Présent"),
    passe_compose: conjForms("Passé composé"),
    imparfait: conjForms("Imparfait"),
    futur: conjForms("Futur simple"),
  })
  .nullable()
  .optional()
  .describe(
    "Verbs only: the conjugation the app shows in «Контекст», instead of the one it builds on the device from Lexique. Set it when the word has conjugation_builtin false, or when the user asks; null clears it (back to the built-in one).",
  );

const originInput = optionalText(
  ORIGIN_MAX,
  "«Происхождение»: one short Russian line that helps remember the word: what it is built on and what that means («от volonté „воля“ + -aire»), the verlan source («верлан от lourd»), the language it came from («из арабского kif „кайф“»), the image behind an idiom. Only what you are sure of; null clears it.",
);

/** The input's flat conjugation as stored on a word; undefined = not given, null = clear. */
function conjugationOf(input: z.infer<typeof conjugationInput>): Conjugation | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  return cleanConjugation({
    auxiliary: input.auxiliary,
    remark: input.remark ?? null,
    tenses: { present: input.present, passe_compose: input.passe_compose, imparfait: input.imparfait, futur: input.futur },
  });
}

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
  cefr: cefrLevel
    .optional()
    .describe(`«Уровень языка», only when you are fairly sure; leave it out and the app estimates one from its dictionary. ${LEVEL_RUBRIC}`),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  custom_fields: customFieldsInput("Fill a shared field as its hint says; null or an empty value leaves it out."),
  origin: originInput,
  conjugation: conjugationInput,
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
  /** For a write tool: what to tell Claude after a database error (default: check with search_words). */
  retryHint?: string;
  annotations: ToolAnnotations;
  /** The tool definition's `_meta` (MCP Apps: `ui.resourceUri`, `ui.visibility`). */
  meta?: Record<string, unknown>;
  /** Returns the structured result (also sent as JSON text). Throws ToolError for a refusal. */
  run: (deps: ToolDeps, args: z.output<S>) => Promise<O>;
  /**
   * How the result is sent, when not as JSON text + structuredContent: an MCP App's tool gives the
   * model a short text and the player its data (`structuredContent` never reaches the model).
   * Method syntax on purpose: a spec with its own O still passes as a ToolSpec<S>.
   */
  reply?(out: O): ToolReply;
}

export type ToolReply = Pick<CallToolResult, "content" | "structuredContent" | "_meta">;

const tool = <S extends z.ZodObject, O extends Record<string, unknown>>(spec: ToolSpec<S, O>): ToolSpec<S, O> => spec;

const READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };

export const searchWords = tool({
  name: "search_words",
  title: "Search words",
  description:
    "Search the user's saved French words. Every term of `query` must match the French, the Russian, the note, a tag or a custom field's value, ignoring accents and case; an empty query lists words. Filter by theme and learning status. Newest first; `total` counts all matches, and `next_offset` (when not null) fetches the next page. A word's custom fields («Свои поля») come as `custom_fields` (name → value), only when it has any; `origin` when it has one; `muted: true` for a word «на паузе» (kept, but never in review), `theme_muted: true` when its theme is; for verbs, the saved `conjugation`, or `conjugation_builtin` (true when the app builds it on the device, false when it has none); `level` («Уровень языка», A1…C2, null = none) with `level_source`: user (the user picked it: never change it unless asked), chat (set by you), ai (by the app), or an estimate the app computes, flelex (its dictionary) or freq (word frequency). Filter with `level` (some levels, or \"none\" for words with no level at all). Use it before add_words to avoid duplicates, and to find ids for update_word, move_words and delete_words.",
  input: z.object({
    query: z.string().max(200).optional().describe("Words to look for (French or Russian). Empty = all."),
    folder: folderSelector.optional(),
    status: z.enum(statusValues).optional().describe("new = never reviewed, learning, mastered, due = due for review today."),
    level: z
      .union([z.literal("none"), z.array(z.enum(["none", ...CEFR_LEVELS] as [Cefr | "none", ...(Cefr | "none")[]])).min(1).max(7)])
      .optional()
      .describe('«Уровень языка»: words whose level (stored or estimated) is one of these; "none" = words with no level, the ones to fill with set_word_levels.'),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0).describe("Matches to skip, for paging: pass the previous result's next_offset."),
  }),
  write: false,
  annotations: READ,
  async run(deps, args) {
    const [folders, words, states, defs] = await Promise.all([deps.repo.folders(), deps.repo.words(), deps.repo.states(), deps.repo.fieldDefs()]);
    const target = args.folder === undefined ? undefined : resolveFolder(args.folder, folders);
    const ctx = viewContext(folders, states, defs, deps);
    const levels = args.level === undefined ? null : new Set<string>(args.level === "none" ? ["none"] : args.level);
    const matches = words
      .filter((w) => w.deleted_at === null)
      .filter((w) => target === undefined || (placeOf(w, ctx.live)?.id ?? null) === (target?.id ?? null))
      .filter((w) => !args.query || matchesSearch(w, args.query))
      .map((w) => wordView(w, ctx))
      .filter((v) => !levels || levels.has(v.level ?? "none"))
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
  description: `List the themes («темы») in display order with their descriptions, word counts, how many words are due for review today and how many were never reviewed (\`new\`), plus «${INBOX_NAME}» (words without a theme). A theme «на паузе» carries \`muted: true\`: its words stay but never come up in review (update_folder sets it). Pass a theme's id, slug or name as \`folder\` to the other tools.`,
  input: z.object({}),
  write: false,
  annotations: READ,
  async run(deps) {
    const [folders, words, states] = await Promise.all([deps.repo.folders(), deps.repo.words(), deps.repo.states()]);
    const ctx = viewContext(folders, states, [], deps);
    const counts = new Map<string | null, { words: number; due: number; new: number }>();
    const total = { words: 0, due: 0, new: 0 };
    for (const w of words) {
      if (w.deleted_at !== null) continue;
      const key = placeOf(w, ctx.live)?.id ?? null;
      const c = counts.get(key) ?? { words: 0, due: 0, new: 0 };
      const states = ctx.statesByWord.get(w.id) ?? [];
      const due = !isPaused(w, ctx.paused) && states.some((s) => isDueToday(s, ctx.dayEnd)) ? 1 : 0;
      const fresh = states.every((s) => s.state === 0) ? 1 : 0;
      c.words++;
      c.due += due;
      c.new += fresh;
      total.words++;
      total.due += due;
      total.new += fresh;
      counts.set(key, c);
    }
    return {
      folders: [...ctx.live.values()].map((f) => ({
        id: f.id,
        slug: f.slug,
        name: f.name,
        description: f.description,
        locked: f.locked,
        ...(f.muted ? { muted: true } : {}),
        ...(counts.get(f.id) ?? { words: 0, due: 0, new: 0 }),
      })),
      inbox: { id: null, slug: INBOX_SELECTOR, name: INBOX_NAME, ...(counts.get(null) ?? { words: 0, due: 0, new: 0 }) },
      total,
    };
  },
});

export const listFields = tool({
  name: "list_fields",
  title: "List custom fields",
  description:
    "List the user's shared custom fields («Свои поля») in display order (create_field, update_field and delete_field change them): each has an id, a name, a hint on what to write in it, and auto_fill (true: the app fills it in itself where it is empty, e.g. with «Дополнить карточки»). Values are per word: search_words shows them, add_words and update_word set them by name.",
  input: z.object({}),
  write: false,
  annotations: READ,
  async run(deps) {
    const defs = liveFieldDefs(await deps.repo.fieldDefs());
    return {
      fields: defs.map(fieldView),
      note: "Values are stored per word and set by field name in add_words and update_word (null clears one). A name not listed here is allowed: it creates a field on that word only, so use one only when the user asks for it.",
    };
  },
});

// Shared custom fields: create, change, delete (soft, words keep their values) and restore.

const fieldView = (d: FieldDef) => ({ id: d.id, name: d.name, hint: d.hint, auto_fill: d.ai_fill });
const fieldName = z.string().trim().min(1).max(FIELD_LABEL_MAX);
const fieldHint = z.string().max(FIELD_HINT_MAX).nullable().optional();
const cleanHint = (s: string | null | undefined) => cleanText(s)?.slice(0, FIELD_HINT_MAX) ?? null;

/** The live definition by id or name (any case). */
function resolveFieldDef(selector: string, defs: readonly FieldDef[]): FieldDef {
  const live = liveFieldDefs(defs);
  const found = live.find((d) => d.id === selector) ?? fieldDefByName(live, selector);
  if (!found) throw new ToolError(`Unknown custom field "${selector}". Call list_fields for the user's fields.`);
  return found;
}

/** Writes one definition; a stale write (the app changed it meanwhile) comes back as the stored row. */
async function writeFieldDef(deps: ToolDeps, row: FieldDef): Promise<FieldDef> {
  const [stored] = await deps.repo.upsert("field_defs", [row]);
  if (!stored || stored.updated_at !== row.updated_at) throw new ToolError("The field was changed in the app at the same time. Call list_fields and try again.");
  return stored;
}

export const createField = tool({
  name: "create_field",
  title: "Create a custom field",
  description: `Create a shared custom field («Своё поле») that every card gets, e.g. «Синонимы» or «Мнемоника». \`hint\` says what to write in it (the app's automatic fill and you read it). auto_fill (default true): the app fills it in itself where it is empty. At most ${MAX_FIELD_DEFS} fields; fails when one with that name exists. Ask the user before creating a field they didn't ask for. Undo with delete_field.`,
  input: z.object({
    name: fieldName.describe("Russian label, e.g. «Синонимы»."),
    hint: fieldHint.describe("What to write there, in Russian, e.g. «2–3 синонима на французском»."),
    auto_fill: z.boolean().default(true),
  }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  async run(deps, args) {
    const name = cleanFieldLabel(args.name);
    if (!name) throw new ToolError("The field name is empty.");
    const live = liveFieldDefs(await deps.repo.fieldDefs());
    const dup = fieldDefByName(live, name);
    if (dup) throw new ToolError(`A field named «${dup.name}» already exists.`);
    if (live.length >= MAX_FIELD_DEFS) throw new ToolError(`The user already has ${MAX_FIELD_DEFS} fields, the maximum. Delete one first (with the user's OK).`);
    const def: FieldDef = {
      id: newId(),
      name,
      hint: cleanHint(args.hint),
      ai_fill: args.auto_fill,
      sort: (live.at(-1)?.sort ?? 0) + 1,
      updated_at: deps.now().toISOString(),
      deleted_at: null,
    };
    const stored = await writeFieldDef(deps, def);
    return { field: fieldView(stored), undo: { tool: "delete_field", field: stored.id }, note: SYNC_NOTE };
  },
});

export const updateField = tool({
  name: "update_field",
  title: "Change a custom field",
  description:
    "Rename a shared custom field, change its hint or auto_fill, or move it to another place in the list (position 1 = first). Values already on cards stay and follow the new name. Undo by calling update_field again with the returned `previous` values.",
  input: z.object({
    field: z.string().trim().min(1).describe("The field's current name (any case) or id."),
    name: fieldName.optional().describe("New name."),
    hint: fieldHint.describe("New hint; null removes it."),
    auto_fill: z.boolean().optional(),
    position: z.number().int().min(1).max(MAX_FIELD_DEFS).optional().describe("New place in the list, 1-based."),
  }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const defs = await deps.repo.fieldDefs();
    const current = resolveFieldDef(args.field, defs);
    const live = liveFieldDefs(defs);
    const now = deps.now();
    const next: FieldDef = { ...current };
    if (args.name !== undefined) {
      const name = cleanFieldLabel(args.name);
      if (!name) throw new ToolError("The field name is empty.");
      const dup = fieldDefByName(live, name);
      if (dup && dup.id !== current.id) throw new ToolError(`A field named «${dup.name}» already exists.`);
      next.name = name;
    }
    if (args.hint !== undefined) next.hint = cleanHint(args.hint);
    if (args.auto_fill !== undefined) next.ai_fill = args.auto_fill;
    const others: FieldDef[] = [];
    if (args.position !== undefined) {
      const order = live.filter((d) => d.id !== current.id);
      order.splice(Math.min(args.position, order.length + 1) - 1, 0, next);
      order.forEach((d, i) => {
        if (d.id === current.id) next.sort = i + 1;
        else if (d.sort !== i + 1) others.push({ ...d, sort: i + 1, updated_at: stampAfter(now, d.updated_at) });
      });
    }
    const changed = (["name", "hint", "ai_fill", "sort"] as const).some((k) => next[k] !== current[k]);
    if (!changed) return { field: fieldView(current), result: "unchanged" };
    next.updated_at = stampAfter(now, current.updated_at);
    if (others.length > 0) await deps.repo.upsert("field_defs", others);
    const stored = await writeFieldDef(deps, next);
    const position = liveFieldDefs([...others, stored, ...live.filter((d) => d.id !== stored.id && !others.some((o) => o.id === d.id))]).findIndex((d) => d.id === stored.id) + 1;
    return {
      field: { ...fieldView(stored), position },
      previous: { name: current.name, hint: current.hint, auto_fill: current.ai_fill, position: live.findIndex((d) => d.id === current.id) + 1 },
      note: SYNC_NOTE,
    };
  },
});

export const deleteField = tool({
  name: "delete_field",
  title: "Delete a custom field",
  description:
    "Delete a shared custom field. Cards keep their values, shown as a field of that one card under the old name. Ask the user first. Undo with restore_field and the returned id.",
  input: z.object({ field: z.string().trim().min(1).describe("The field's name (any case) or id.") }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const current = resolveFieldDef(args.field, await deps.repo.fieldDefs());
    const stamp = stampAfter(deps.now(), current.updated_at);
    const stored = await writeFieldDef(deps, { ...current, deleted_at: stamp, updated_at: stamp });
    return { deleted: fieldView(stored), undo: { tool: "restore_field", id: stored.id }, note: SYNC_NOTE };
  },
});

export const restoreField = tool({
  name: "restore_field",
  title: "Restore a deleted custom field",
  description: "Undo delete_field: bring a deleted shared custom field back; cards' values join it again.",
  input: z.object({ id: z.string().trim().min(1).describe("The id from delete_field's `undo`.") }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const defs = await deps.repo.fieldDefs();
    const current = defs.find((d) => d.id === args.id);
    if (!current) throw new ToolError(`No custom field with id "${args.id}".`);
    if (current.deleted_at === null) return { field: fieldView(current), result: "unchanged" };
    const live = liveFieldDefs(defs);
    const dup = fieldDefByName(live, current.name);
    if (dup) throw new ToolError(`A field named «${dup.name}» exists again; rename one of them first.`);
    if (live.length >= MAX_FIELD_DEFS) throw new ToolError(`The user already has ${MAX_FIELD_DEFS} fields, the maximum.`);
    const stored = await writeFieldDef(deps, { ...current, deleted_at: null, updated_at: stampAfter(deps.now(), current.updated_at) });
    return { restored: fieldView(stored), note: SYNC_NOTE };
  },
});

export const studySummary = tool({
  name: "study_summary",
  title: "Today's study summary",
  description:
    "Today's review numbers, planned exactly as the app plans the day (the user's «План повторения», user_prefs `study_plan`): cards due, new cards in today's queue, reviews done today, words by learning status, the themes «на паузе» (`muted_themes`, left out of review), the words due soonest, and `plan`: today's new-word budget (`new_words_today`, at most the `ceiling`; lower when the coming reviews are heavy (`reason` \"load\"), when recent answers are weak (\"accuracy\") or over the review cap (\"backlog\", with `deferred` reviews held for tomorrow)), reverse sides unlocked (`ru_unlocks`), and the mean reviews a day over the next week (`forecast_7d`). The one-day «Всё равно добавить новые» is a device setting this tool can't see. Reviewing happens in the app. update_study_plan changes the plan. With `history_days` («Прогресс», e.g. 30 for «как у меня с прогрессом за месяц?») it adds `history`: the app's saved end-of-day numbers per study day as compact rows (`columns` + `days`: known «знаю», learning «учу», fresh «новых», paused «на паузе», difficult «трудных» (part of learning), memorized «помню ≈», reviews, again, new_introduced, added, source), `today` (now, never stored), `active_days`, `streak` {current, best} and «Верно» (`retention`: true retention for the range and per month, vs `target`). Talk about trends; never push the streak. Always `plan_fit` («План и прогресс», the numbers Settings shows): the saved plan against her last ≤ 14 study days within 3 weeks (`active_days`; days without study are not data, never zeros). `new_words`: the plan's ceiling, the `typical` (median) and `max` new words a study day in plan units (`unit`), `full_days` that took all of them out of `plan_days` under the current plan (since `plan_since`), `held_days` by reason when known; `reviews`: the `cap`, `typical` interday reviews (what the cap counts; `all_answers_typical` counts every answer), `forecast_7d`, `backlog_days`, `cap_hit_days`; `retention` over 28 days vs `target`; `fit`: \"warming_up\" (not enough data yet), \"fits\", \"room\" (the whole plan taken, load low) or \"heavy\"; `suggestion` (null = nothing to offer): `new_words` to propose, maybe `or_review_cap` as the other option, `forecast_30d` {now, then [lo, hi]} reviews a day, `why`, `confidence` (\"low\" = пока мало данных); `dismissed_until` when she tapped «Не сейчас». Taking fewer new words than allowed is never a reason to lower the plan.",
  input: z.object({
    new_per_day: z
      .number()
      .int()
      .min(0)
      .max(500)
      .optional()
      .describe("Only to answer «what if»: a daily ceiling of new words to plan with instead of the saved plan's."),
    history_days: z
      .number()
      .int()
      .min(1)
      .max(HISTORY_DAYS_MAX)
      .optional()
      .describe("«Прогресс» over the last N study days, today included (e.g. 30 for «за месяц»): adds `history`. Leave out for today only."),
  }),
  write: false,
  annotations: READ,
  async run(deps, args) {
    const now = deps.now();
    const day = studyDay(now, deps.timeZone);
    const dayStart = day.start.getTime();
    const dayEnd = day.end.getTime();
    // Seven calendar days back, as the device counts them (lib/session.ts `loadSession`).
    const weekAgo = studyDayStartBefore(day.start, 7, deps.timeZone);
    const range = args.history_days === undefined ? null : historyRange(now, args.history_days, deps.timeZone);
    // The stored «Прогресс» rows first: they tell how far back plan_fit reads the log (28 or 56 days).
    const rowsAndLogs = deps.repo.progressDays().then(async (rows) => {
      let logsFrom = planFitLogsFrom(now, deps.timeZone, rows);
      if (weekAgo < logsFrom) logsFrom = weekAgo;
      if (range && range.logsFrom < logsFrom) logsFrom = range.logsFrom;
      return [rows, await deps.repo.logsSince(logsFrom.toISOString())] as const;
    });
    const [folders, words, states, [progressRows, allLogs], prefs, runs] = await Promise.all([
      deps.repo.folders(),
      deps.repo.words(),
      deps.repo.states(),
      rowsAndLogs,
      deps.repo.userPrefs(),
      range ? deps.repo.exerciseRunsSince(new Date(0).toISOString()) : Promise.resolve([]),
    ]);
    const logs = allLogs.filter((l) => Date.parse(l.review) >= weekAgo.getTime());
    const live = new Map(liveFolders(folders).map((f) => [f.id, f]));
    const wordsById = new Map(words.filter((w) => w.deleted_at === null).map((w) => [w.id, w]));
    const cards = states.filter((s) => s.deleted_at === null && wordsById.has(s.word_id));
    // Words «на паузе» (themselves or their theme) are never shown in review: not due, not new.
    const paused = pausedFolderIds(folders);
    const inReview = new Map([...wordsById].filter(([, w]) => !isPaused(w, paused)));
    // As in the app: the day's budgets count every review of the day, also of words deleted since;
    // «reviewed today» counts only live words' reviews.
    const liveLogs = logs.filter((l) => l.deleted_at === null);
    const dayLogs = liveLogs.filter((l) => Date.parse(l.review) >= dayStart && Date.parse(l.review) < dayEnd);
    const today = dayLogs.filter((l) => wordsById.has(l.word_id));

    const { row, plan: saved } = savedStudyPlan(prefs);
    const plan = args.new_per_day === undefined ? saved : { ...saved, new_words: args.new_per_day };
    const planWith = (p: StudyPlan) =>
      planDay({
        now,
        dayStart: day.start,
        dayEnd: day.end,
        states: cards,
        words: inReview,
        todayLogs: dayLogs,
        logs7d: liveLogs.filter((l) => Date.parse(l.review) < dayStart),
        plan: p,
        overrideNewToday: false,
        r: retrievability,
        // The same level and frequency signals as the app's (lib/session.ts), so the orders agree.
        ...(p.new_order === "added" ? {} : levelSignals(serverLevels())),
        folderOrder: folderOrderOf([...live.values()]),
      });
    const result = planWith(plan);
    // plan_fit always reads the saved plan, never a «what if».
    const savedDay = plan === saved ? result.day : planWith(saved).day;
    const fit = serverPlanFit({
      now,
      timeZone: deps.timeZone,
      plan: saved,
      planRow: row,
      prefs,
      rows: progressRows,
      logs: allLogs,
      today: { forecast7: savedDay.forecast7, backlog: savedDay.backlog, available: savedDay.available, newLeft: savedDay.newLeft },
    });

    const statesByWord = new Map<string, ReviewState[]>();
    for (const s of cards) statesByWord.set(s.word_id, [...(statesByWord.get(s.word_id) ?? []), s]);
    const byStatus: Record<CardStatus, number> = { new: 0, learning: 0, known: 0, difficult: 0 };
    for (const w of wordsById.values()) byStatus[wordStatus(statesByWord.get(w.id) ?? [])]++;

    const due = [...result.queue.filter((i) => !i.isNew), ...result.waiting].sort((a, b) => Date.parse(a.state.due) - Date.parse(b.state.due));
    const dueWords: ReturnType<typeof brief>[] = [];
    const seen = new Set<string>();
    for (const { word } of due) {
      if (seen.has(word.id) || dueWords.length >= 20) continue;
      seen.add(word.id);
      dueWords.push(brief(word, live));
    }
    const d = result.day;
    return {
      study_day: { start: day.start.toISOString(), end: day.end.toISOString(), time_zone: deps.timeZone },
      due_cards: result.counts.due,
      new_cards_available: result.counts.new,
      /** New cards that could be introduced, ignoring today's budget. */
      new_cards_ready: d.available.fr + d.available.ru,
      reviewed_today: today.length,
      words: { total: wordsById.size, ...byStatus },
      ...(paused.size > 0 ? { muted_themes: [...live.values()].filter((f) => paused.has(f.id)).map((f) => f.name) } : {}),
      due_soonest: dueWords,
      plan: {
        new_words_today: d.budget,
        new_words_left: d.newLeft,
        ceiling: d.ceiling,
        ru_unlocks: result.queue.filter((i) => i.isNew && i.direction === "ru_fr").length,
        reason: d.reason,
        deferred: d.deferred,
        backlog: d.backlog,
        forecast_7d: Math.round(d.forecast7 * 10) / 10,
        ...(d.accuracy7 !== null ? { accuracy_7d: Math.round(d.accuracy7 * 100) / 100 } : {}),
        settings: { ...plan, saved: !!row },
      },
      plan_fit: planFitView(fit),
      ...(range ? { history: progressHistory({ range, timeZone: deps.timeZone, now, rows: progressRows, logs: allLogs, runs, words, states, folders }) } : {}),
      note: "Counts come from the synced copy: reviews not yet synced from the device are missing.",
    };
  },
});

/** The saved «План повторения» row, and the plan it holds (the migrated default without one). */
function savedStudyPlan(prefs: readonly UserPref[]): { row: UserPref | undefined; plan: StudyPlan } {
  const row = prefs.find((p) => p.id === STUDY_PLAN_PREF && p.deleted_at === null);
  // Without a saved plan the app migrates the device's «Новых карточек в день» (default 15); a device
  // with another number saves its migrated plan after a sync (lib/user-prefs.ts saveMigratedStudyPlan).
  const fallback = migrateStudyPlan(DEFAULT_NEW_PER_DAY);
  return { row, plan: row ? parseStudyPlan(row.value, fallback) : fallback };
}

const STUDY_PLAN_KEYS = ["new_words", "review_cap", "new_order", "mix", "ru_fr"] as const;

export const updateStudyPlan = tool({
  name: "update_study_plan",
  title: "Change the review plan",
  description:
    "Change the user's «План повторения» (Settings → «План повторения»), the same synced setting the app edits; only the fields given change. `new_words`: the ceiling of new words a day (the app lowers it on heavy or weak days, never raises it; with ru_fr \"together\" it counts cards). `review_cap`: most reviews a day, the rest wait for the next days (null = no limit). `new_order`: \"level\" (by «Уровень языка» and frequency, themes in turn), \"themes\" (theme by theme, in the themes' order) or \"added\" (oldest first). `mix`: new cards \"mixed\" in with the reviews or \"after\" them. `ru_fr`, when the RU→FR side starts: \"after\" (once FR→RU holds for 3 days), \"together\" («Назавтра»: the next day) or \"recognition\" (never). Change it only when the user asks; say what changed, and undo with `undo` (the previous plan). study_summary shows what today looks like with it.",
  input: z.object({
    new_words: z.number().int().min(PLAN_NEW_WORDS_MIN).max(PLAN_NEW_WORDS_MAX).optional().describe(`Ceiling of new words a day (${PLAN_NEW_WORDS_MIN}–${PLAN_NEW_WORDS_MAX}).`),
    review_cap: z
      .number()
      .int()
      .min(REVIEW_CAP_MIN)
      .max(REVIEW_CAP_MAX)
      .nullable()
      .optional()
      .describe(`Most reviews a day (${REVIEW_CAP_MIN}–${REVIEW_CAP_MAX}); null = no limit.`),
    new_order: z.enum(["level", "themes", "added"]).optional(),
    mix: z.enum(["mixed", "after"]).optional(),
    ru_fr: z.enum(["after", "together", "recognition"]).optional(),
  }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const given = STUDY_PLAN_KEYS.filter((k) => args[k] !== undefined);
    if (given.length === 0) throw new ToolError(`Nothing to change: pass at least one of ${STUDY_PLAN_KEYS.join(", ")}.`);
    const { row, plan: previous } = savedStudyPlan(await deps.repo.userPrefs());
    const next: StudyPlan = { ...previous };
    for (const k of given) Object.assign(next, { [k]: args[k] });
    if (row && sameStudyPlan(next, previous)) return { plan: next, result: "unchanged" };
    const write: UserPref = { id: STUDY_PLAN_PREF, value: next, updated_at: stampAfter(deps.now(), row?.updated_at), deleted_at: null };
    const [stored] = await deps.repo.upsert("user_prefs", [write]);
    if (!stored || stored.updated_at !== write.updated_at) throw new ToolError("The plan was changed in the app at the same time. Call study_summary and try again.");
    return {
      plan: next,
      changed: STUDY_PLAN_KEYS.filter((k) => next[k] !== previous[k]),
      previous,
      undo: { tool: "update_study_plan", ...previous },
      note: SYNC_NOTE,
    };
  },
});

export const addWords = tool({
  name: "add_words",
  title: "Add words",
  description:
    `Add 1–50 new words. Each gets review cards (FR→RU, and RU→FR unless both_directions is false). Words whose French form is already saved are skipped (on_duplicate "skip", the default) and listed in \`duplicates\`. Fill in everything you can: ru, slang_level (0 neutral, 1 familier, 2 argot, 3 vulgaire), verlan, pos, gender for nouns, and a short example_fr with example_ru. \`cefr\` («Уровень языка») is optional: the app estimates a level itself, and \`added\` shows the \`level\` each word got. \`folder\` is a theme id, slug or name (default «${INBOX_NAME}»); set folder_chosen_by_user to true only when the user named the theme (per word, \`folder\` and folder_chosen_by_user override the call's). Optional \`custom_fields\` sets the user's custom fields by name (list_fields). List the words and get the user's OK before adding more than 5. Undo with delete_words and the returned ids.`,
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
    const wantsFields = args.words.some((w) => w.custom_fields !== undefined);
    const [folders, words, defs] = await Promise.all([
      deps.repo.folders(),
      deps.repo.words(),
      wantsFields ? deps.repo.fieldDefs() : Promise.resolve([] as FieldDef[]),
    ]);
    const callFolder = args.folder === undefined ? null : resolveFolder(args.folder, folders);
    // Resolve every theme before writing anything.
    const targets = args.words.map((w) => (w.folder === undefined ? callFolder : resolveFolder(w.folder, folders)));
    const live = new Map(liveFolders(folders).map((f) => [f.id, f]));
    const byLemma = new Map<string, Word>();
    for (const w of words) if (w.deleted_at === null) byLemma.set(normalizeLemma(w.fr), w);

    const now = deps.now();
    const built: Word[] = [];
    const oneOff = new Map<string, string[]>();
    const duplicates: { fr: string; existing: ReturnType<typeof brief> }[] = [];
    args.words.forEach((input, i) => {
      const key = normalizeLemma(input.fr);
      const dup = byLemma.get(key);
      if (dup && args.on_duplicate === "skip") {
        duplicates.push({ fr: input.fr, existing: brief(dup, live) });
        return;
      }
      // Throws (before anything is written) when a word's fields don't fit.
      const fields = input.custom_fields ? applyCustomFields([], input.custom_fields, defs) : { values: [], newOneOff: [] };
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
          cefr: input.cefr ?? null,
          cefr_source: input.cefr ? "chat" : null,
          tags: input.tags,
          custom_fields: fields.values,
          origin: cleanOrigin(input.origin),
          conjugation: pos === "verb" ? (conjugationOf(input.conjugation) ?? null) : null,
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
      if (fields.newOneOff.length > 0) oneOff.set(word.id, fields.newOneOff);
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
    const levels = serverLevels();
    return {
      added: built.map((w) => {
        const fields = customFieldsView(w, defs);
        const fresh = oneOff.get(w.id);
        return {
          ...brief(w, live),
          slang_level: w.slang_level,
          verlan: w.verlan,
          ...levelView(w, levels),
          ...(Object.keys(fields).length > 0 ? { custom_fields: fields } : {}),
          ...(fresh ? { new_one_off_fields: fresh } : {}),
        };
      }),
      duplicates,
      undo: built.length > 0 ? { tool: "delete_words", ids: built.map((w) => w.id) } : null,
      ...(oneOff.size > 0 ? { fields_note: ONE_OFF_NOTE } : {}),
      note: SYNC_NOTE,
    };
  },
});

export const updateWord = tool({
  name: "update_word",
  title: "Edit a word",
  description:
    "Edit one word: French, Russian, note, example, tags, part of speech, gender, slang level, verlan, «Уровень языка» (cefr; null clears a stored level, back to the app's estimate), both_directions, custom fields, origin («Происхождение»), a verb's conjugation, or muted («на паузе»: kept but out of review). Only the fields in `patch` change; null clears note or example. For the levels of several words use set_word_levels. `custom_fields` changes only the fields it names (null clears one) and keeps the others. both_directions false removes the RU→FR card, true brings it back with its progress. Use move_words to change the theme.",
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
        cefr: cefrLevel
          .nullable()
          .optional()
          .describe(`«Уровень языка», saved as set by you (level_source chat); null clears the stored level. Never change a level with level_source user unless the user asks. ${LEVEL_RUBRIC}`),
        tags: z.array(z.string().trim().min(1).max(40)).max(10).optional().describe("Replaces all tags."),
        custom_fields: customFieldsInput("Only the named fields change; null or an empty value clears one."),
        origin: originInput,
        conjugation: conjugationInput,
        both_directions: z.boolean().optional(),
        muted: z
          .boolean()
          .optional()
          .describe("true puts the word «на паузе»: it stays in the library but never comes up in review; false brings it back."),
      })
      .describe("Fields to change."),
  }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const [[current], defs] = await Promise.all([deps.repo.wordsByIds([args.id]), deps.repo.fieldDefs()]);
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
    // The same level again keeps who set it (a user's B1 stays the user's).
    if (p.cefr !== undefined && p.cefr !== (current.cefr ?? null)) {
      next.cefr = p.cefr;
      next.cefr_source = p.cefr === null ? null : "chat";
    }
    if (p.tags !== undefined) next.tags = [...new Set(p.tags.map((t) => t.trim()).filter(Boolean))];
    if (p.both_directions !== undefined) next.both_directions = p.both_directions;
    if (p.muted !== undefined) next.muted = p.muted;
    if (p.origin !== undefined) next.origin = cleanOrigin(p.origin);
    const conjugation = conjugationOf(p.conjugation);
    if (conjugation !== undefined) next.conjugation = conjugation;
    let newOneOff: string[] = [];
    if (p.custom_fields !== undefined) {
      const fields = applyCustomFields(current.custom_fields, p.custom_fields, defs);
      newOneOff = fields.newOneOff;
      // Rewritten only when the values really change (a missing column reads as no fields).
      if (JSON.stringify(fields.values) !== JSON.stringify(cleanCustomFields(current.custom_fields))) next.custom_fields = fields.values;
    }
    if (next.pos !== "noun") next.gender = "none";
    if (!next.example_fr) next.example_ru = null;
    if (p.conjugation && next.pos !== "verb" && next.pos !== "expression") {
      throw new ToolError("conjugation is for verbs (pos verb or expression); set pos first or leave conjugation out.");
    }
    // Columns missing on older rows read as no value, so «not set» never counts as a change.
    if ((next.origin ?? null) === (current.origin ?? null)) next.origin = current.origin;
    if (!!next.muted === !!current.muted) next.muted = current.muted;
    if ((next.cefr ?? null) === (current.cefr ?? null)) {
      next.cefr = current.cefr;
      next.cefr_source = current.cefr_source;
    }
    if (JSON.stringify(next.conjugation ?? null) === JSON.stringify(current.conjugation ?? null)) next.conjugation = current.conjugation;

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
      word: wordView(changed ? next : current, viewContext(folders, states, defs, deps)),
      ...(newOneOff.length > 0 ? { new_one_off_fields: newOneOff, fields_note: ONE_OFF_NOTE } : {}),
      note: SYNC_NOTE,
    };
  },
});

const storedLevelSource = z.enum(STORED_LEVEL_SOURCES as readonly ["user", "chat", "ai"]);

/** One word's level for set_word_levels; `source` and `expect` only come from an `undo`. */
const levelItemSchema = z.object({
  word_id: z.string().trim().min(1).max(64).describe("Word id from search_words."),
  cefr: cefrLevel.nullable().describe("The level; null clears a stored level (back to the app's estimate)."),
  source: storedLevelSource
    .nullable()
    .optional()
    .describe("Only inside a returned `undo.items` list, passed back unchanged: who had set the level before. Leave it out otherwise."),
  expect: z
    .object({ cefr: cefrLevel.nullable(), source: storedLevelSource.nullable() })
    .optional()
    .describe("Only inside a returned `undo.items` list, passed back unchanged: the level that call wrote. A word whose level changed since is left alone."),
});

export const SET_LEVELS_MAX = 100;

export const setWordLevels = tool({
  name: "set_word_levels",
  title: "Set word levels",
  description: `Set «Уровень языка» (CEFR A1…C2) on up to ${SET_LEVELS_MAX} words in one call; each level is saved as set by you (level_source chat), null clears a stored level. Words whose level the user picked (level_source user) are skipped and listed in \`skipped_user\`, unless overwrite_user is true because the user asked to change those. For filling missing levels: search_words level "none", list the words with the levels you propose and wait for the user's OK, then send them in batches of 10–15 together with a few words of known level as anchors in your reasoning. Undo with set_word_levels and the returned \`undo\` (items and overwrite_user as given); words whose level changed since that call are left alone and listed in \`changed_since\`.`,
  input: z.object({
    items: z.array(levelItemSchema).min(1).max(SET_LEVELS_MAX),
    overwrite_user: z.boolean().default(false).describe("True only when the user asked to change levels they set themselves."),
  }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    // `source` other than chat is how an undo puts a level back, so it comes only with the undo's `expect`.
    if (args.items.some((i) => i.source !== undefined && i.expect === undefined)) {
      throw new ToolError("items[].source is only for an `undo` passed back unchanged (with its `expect`). Leave source out: your levels are saved as chat.");
    }
    // The last item for a word wins.
    const items = [...new Map(args.items.map((i) => [i.word_id.trim(), i])).values()];
    const found = await deps.repo.wordsByIds(items.map((i) => i.word_id.trim()));
    const byId = new Map(found.map((w) => [w.id, w]));
    const now = deps.now();
    const changes: Replacement<"words">[] = [];
    const undo: z.infer<typeof levelItemSchema>[] = [];
    const unchanged: string[] = [];
    const notFound: string[] = [];
    const skippedUser: { id: string; fr: string; level: Cefr }[] = [];
    const changedSince: { id: string; fr: string; level: Cefr | null; level_source: StoredLevelSource | null }[] = [];
    for (const item of items) {
      const id = item.word_id.trim();
      const w = byId.get(id);
      if (!w || w.deleted_at !== null) {
        notFound.push(id);
        continue;
      }
      const before = { cefr: w.cefr ?? null, source: w.cefr ? (w.cefr_source ?? "user") : null };
      // An undo restores only a level that is still the one its call wrote: a level picked since (in the app or another call) stays.
      if (item.expect && (item.expect.cefr !== before.cefr || item.expect.source !== before.source)) {
        changedSince.push({ id, fr: w.fr, level: before.cefr, level_source: before.source });
        continue;
      }
      const source = item.cefr === null ? null : (item.source ?? "chat");
      if (before.source === "user" && !args.overwrite_user && !(item.cefr === before.cefr && source === "user")) {
        skippedUser.push({ id, fr: w.fr, level: before.cefr as Cefr });
        continue;
      }
      if (item.cefr === before.cefr && source === before.source) {
        unchanged.push(id);
        continue;
      }
      changes.push(change(w, { ...w, cefr: item.cefr, cefr_source: source, updated_at: stampAfter(now, w.updated_at) }));
      undo.push({ word_id: id, cefr: before.cefr, source: before.source, expect: { cefr: item.cefr, source } });
    }
    const outcome = await writeWords(deps.repo, changes);
    const { conflicts, failed } = outcome;
    // As with move_words, the way back of a word in `failed` stays in: an unchanged word stays unchanged.
    const undoItems = undo.filter((u) => !conflicts.has(u.word_id));
    const levels = serverLevels();
    return {
      updated: changes
        .filter((c) => !conflicts.has(c.row.id) && !failed.has(c.row.id))
        .map((c) => ({ id: c.row.id, fr: c.row.fr, ...levelView(c.row, levels) })),
      unchanged,
      skipped_user: skippedUser,
      ...(changedSince.length > 0 ? { changed_since: changedSince } : {}),
      not_found: notFound,
      conflicts: [...conflicts],
      ...failedPart(outcome),
      // overwrite_user only when this call itself wrote a user's level (an undo putting one back).
      undo:
        undoItems.length > 0
          ? { tool: "set_word_levels", items: undoItems, overwrite_user: undoItems.some((u) => u.expect?.source === "user") }
          : null,
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

const folderView = (f: Folder) => ({ id: f.id, slug: f.slug, name: f.name, description: f.description, locked: f.locked, muted: !!f.muted });

/** A live theme (not «Входящие», which is built in). */
function resolveTheme(selector: string, folders: readonly Folder[]): Folder {
  const folder = resolveFolder(selector, folders);
  if (!folder) throw new ToolError(`«${INBOX_NAME}» is built in: it can't be renamed or deleted.`);
  return folder;
}

/** Writes one theme; a stale write (the app changed it meanwhile) comes back as the stored row. */
async function writeFolder(deps: ToolDeps, row: Folder): Promise<Folder> {
  const [stored] = await deps.repo.upsert("folders", [row]);
  if (!stored || stored.updated_at !== row.updated_at) throw new ToolError("The theme was changed in the app at the same time. Call list_folders and try again.");
  return stored;
}

export const updateFolder = tool({
  name: "update_folder",
  title: "Change a theme",
  description:
    "Rename a theme, change its description (automatic sorting reads it), lock or unlock it (automatic sorting never moves words into or out of a locked theme), put it «на паузе» or bring it back (`muted`), or move it to another place in the list (position 1 = first). Its words stay. Undo by calling update_folder again with the returned `previous` values.",
  input: z.object({
    folder: folderSelector.describe("The theme: its id, slug or current Russian name (from list_folders)."),
    name: z.string().trim().min(1).max(60).optional().describe("New Russian name."),
    description: z.string().max(300).nullable().optional().describe("New description; null removes it."),
    locked: z.boolean().optional(),
    muted: z
      .boolean()
      .optional()
      .describe("true puts the theme «на паузе»: its words stay in the library but none of them comes up in review or practice until it is set back to false (progress kept)."),
    position: z.number().int().min(1).max(200).optional().describe("New place in the list, 1-based."),
  }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const folders = await deps.repo.folders();
    const current = resolveTheme(args.folder, folders);
    const live = liveFolders(folders);
    const now = deps.now();
    const next: Folder = { ...current };
    if (args.name !== undefined) {
      const name = cleanText(args.name);
      if (!name) throw new ToolError("The theme name is empty.");
      if (name.toLowerCase() === INBOX_SELECTOR || sameName(name, INBOX_NAME)) throw new ToolError(`«${INBOX_NAME}» is built in; pick another name.`);
      const dup = live.find((f) => f.id !== current.id && sameName(f.name, name));
      if (dup) throw new ToolError(`A theme named «${dup.name}» already exists (id ${dup.id}).`);
      next.name = name;
    }
    if (args.description !== undefined) next.description = cleanText(args.description);
    if (args.locked !== undefined) next.locked = args.locked;
    // Missing on older rows reads as false, so «not set» never counts as a change.
    if (args.muted !== undefined && args.muted !== !!current.muted) next.muted = args.muted;
    const others: Folder[] = [];
    if (args.position !== undefined) {
      const order = live.filter((f) => f.id !== current.id);
      order.splice(Math.min(args.position, order.length + 1) - 1, 0, next);
      order.forEach((f, i) => {
        if (f.id === current.id) next.sort = i;
        else if (f.sort !== i) others.push({ ...f, sort: i, updated_at: stampAfter(now, f.updated_at) });
      });
    }
    const position = (f: Folder, list: readonly Folder[]) => list.findIndex((x) => x.id === f.id) + 1;
    const changed = (["name", "description", "locked", "muted", "sort"] as const).some((k) => next[k] !== current[k]);
    if (!changed) return { folder: { ...folderView(current), position: position(current, live) }, result: "unchanged" };
    next.updated_at = stampAfter(now, current.updated_at);
    if (others.length > 0) await deps.repo.upsert("folders", others);
    const stored = await writeFolder(deps, next);
    const after = liveFolders(live.map((f) => (f.id === stored.id ? stored : (others.find((o) => o.id === f.id) ?? f))));
    return {
      folder: { ...folderView(stored), position: position(stored, after) },
      previous: { name: current.name, description: current.description, locked: current.locked, muted: !!current.muted, position: position(current, live) },
      note: SYNC_NOTE,
    };
  },
});

export const deleteFolder = tool({
  name: "delete_folder",
  title: "Delete a theme",
  description: `Delete a theme. Its words are not deleted: they move to «${INBOX_NAME}», where automatic sorting can file them again. Name the theme and how many words it holds to the user and get their OK first. Undo with restore_folder and the returned \`undo\` (it also puts the words back).`,
  input: z.object({ folder: folderSelector.describe("The theme: its id, slug or Russian name (from list_folders).") }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const [folders, words] = await Promise.all([deps.repo.folders(), deps.repo.words()]);
    const current = resolveTheme(args.folder, folders);
    const now = deps.now();
    const stamp = stampAfter(now, current.updated_at);
    const stored = await writeFolder(deps, { ...current, deleted_at: stamp, updated_at: stamp });
    const inside = words.filter((w) => w.deleted_at === null && w.folder_id === current.id);
    const changes = inside.map((w) =>
      change(w, { ...w, folder_id: null, folder_source: "auto" as const, folder_confidence: null, updated_at: stampAfter(now, w.updated_at) }),
    );
    const outcome = await writeWords(deps.repo, changes);
    const { conflicts } = outcome;
    const moves: Placement[] = inside
      .filter((w) => !conflicts.has(w.id))
      .map((w) => ({ id: w.id, folder_id: w.folder_id, folder_source: w.folder_source, folder_confidence: w.folder_confidence }));
    return {
      deleted: folderView(stored),
      moved_to_inbox: moves.length,
      conflicts: [...conflicts],
      ...failedPart(outcome),
      undo: { tool: "restore_folder", id: stored.id, moves },
      note: SYNC_NOTE,
    };
  },
});

export const restoreFolder = tool({
  name: "restore_folder",
  title: "Restore a deleted theme",
  description: "Undo delete_folder: bring the theme back and put its words back in it. Pass delete_folder's `undo` (id and moves) unchanged.",
  input: z.object({
    id: z.string().trim().min(1).describe("The theme id from delete_folder's `undo`."),
    moves: z.array(placementSchema).max(5000).default([]).describe("delete_folder's `undo.moves`, as returned."),
  }),
  write: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const folders = await deps.repo.folders();
    const current = folders.find((f) => f.id === args.id);
    if (!current) throw new ToolError(`No theme with id "${args.id}".`);
    let restored = current;
    if (current.deleted_at !== null) {
      const dup = liveFolders(folders).find((f) => sameName(f.name, current.name));
      if (dup) throw new ToolError(`A theme named «${dup.name}» exists again (id ${dup.id}); rename one of them first.`);
      restored = await writeFolder(deps, { ...current, deleted_at: null, updated_at: stampAfter(deps.now(), current.updated_at) });
    }
    // Only words still in «Входящие» go back: one moved elsewhere since stays where the user put it.
    const found = args.moves.length > 0 ? await deps.repo.wordsByIds(args.moves.map((m) => m.id)) : [];
    const stillInbox = new Set(found.filter((w) => w.deleted_at === null && w.folder_id === null).map((w) => w.id));
    const back = args.moves.filter((m) => m.folder_id === current.id && stillInbox.has(m.id));
    const words = back.length > 0 ? await restoreMoves.run(deps, { moves: back }) : null;
    return {
      restored: folderView(restored),
      words_back: words?.restored.length ?? 0,
      left_elsewhere: args.moves.length - back.length,
      ...(words && words.conflicts.length > 0 ? { conflicts: words.conflicts } : {}),
      note: SYNC_NOTE,
    };
  },
});

// ---------------------------------------------------------------------------------------------
// «Упражнения»: exercise sets Claude writes and the app plays offline. The rules of a set live in
// lib/core/exercises.ts (shared with the app); the item contract is on ExerciseItem in lib/types.ts.
// The connector writes a set's content once (create, or a chat set saved with its result) and its
// deleted_at (delete / restore). Runs are written by the playing device, except a round played in
// the chat («Упражнения в чате», lib/core/chat-player.ts): save_exercise_result writes it once,
// when the user agrees, under an id of its own so no device ever writes the same row.

const DAY_MS = 86_400_000;
// No «register» (pick нейтр. / fam. / arg. / vulg.): it is no longer made, and old sets' register
// items are skipped wherever a set is played (isRegisterItem).
const ITEM_TYPES = ["choice", "cloze", "pairs", "conjugate"] as const satisfies readonly ExerciseItemType[];
const REGISTER_GONE = "register items are no longer used; use choice/cloze/pairs/conjugate";
/** An item of the dropped «register» type, in an older stored set (typed loosely: the type may leave ExerciseItemType). */
const isRegisterItem = (item: { type: string } | undefined): boolean => item?.type === "register";
const SKILLS = ["meaning", "form", "neutral", "verlan", "situation"] as const satisfies readonly ExerciseSkill[];
const TENSES = ["present", "passe_compose", "imparfait", "futur"] as const satisfies readonly ExerciseTense[];
const PERSONS = ["je", "tu", "il", "nous", "vous", "ils"] as const satisfies readonly ExercisePerson[];
/** «Спряжение глаголов»: the usual size of a verb set (6–10). */
const VERB_SET_SIZE = 8;
/** Most recent sets exercise_material lists, so Claude doesn't repeat one. */
const RECENT_SETS = 5;
const TOPIC_MATCHES_MAX = 40;
const CONFUSIONS_MAX = 5;

/** A set's id: "x-" + sha256(client_ref), so a retried create hits the same row. */
export const exerciseSetId = (clientRef: string): string =>
  EXERCISE_ID_PREFIX + createHash("sha256").update(clientRef.trim()).digest("hex").slice(0, 24);

/** Also accepts the array as a JSON string (some clients send nested arrays stringified). */
const jsonArray = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }, schema);

const byType = (items: ExerciseSet["items"]): Partial<Record<ExerciseItemType, number>> => {
  const out: Partial<Record<ExerciseItemType, number>> = {};
  for (const item of items) out[item.type] = (out[item.type] ?? 0) + 1;
  return out;
};

const setSummary = (s: ExerciseSet) => ({
  id: s.id,
  title: s.title,
  count: s.items.length,
  by_type: byType(s.items),
  new_words: s.new_words.length,
  levels: cleanLevels(s.levels),
  ...(cleanLevels(s.levels).length > 0 && s.level_auto ? { level_auto: true } : {}),
});

/**
 * `level_words`: a sentence or option word's level when it is a lemma as written (lemmaLevel); a
 * new word's (a dictionary form, maybe with its article) as the app rates a saved word.
 */
const rateWord = (fr: string) => (/[\s']/.test(fr) ? (serverLevels().level({ fr, pos: "other", slang_level: 0, verlan: false })?.level ?? null) : lemmaLevel(fr));

/** The themes a set names, as {id, name} ("inbox" → «Входящие»; unknown ids left out). */
function setFolders(s: Pick<ExerciseSet, "folders">, folders: readonly Folder[]): FolderRef[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  return s.folders.flatMap((id) => (id === INBOX_SELECTOR ? [folderRef(null)] : byId.has(id) ? [folderRef(byId.get(id))] : []));
}

/** Writes one set; a stale write (the app changed it meanwhile) comes back as the stored row. */
async function writeExerciseSet(deps: ToolDeps, row: ExerciseSet, clash: string): Promise<ExerciseSet> {
  const [stored] = await deps.repo.upsert("exercise_sets", [row]);
  if (!stored || stored.updated_at !== row.updated_at) throw new ToolError(clash);
  return stored;
}

const SET_CLASH = "The set was changed in the app at the same time. Call list_exercise_sets and try again.";

interface Signals {
  /** Lapses of the word's review cards. */
  lapses: number;
  /** A review card is due today. */
  due: boolean;
  /** The app rates a card «трудное» (cardStatus difficult). */
  difficult: boolean;
  /** Reviews in the window graded «Снова» or «Трудно». */
  review_misses: number;
  /** Exercise answers about the word in the window, and the wrong / «Не знаю» ones. */
  ex_attempts: number;
  ex_misses: number;
  /** Wrong options the user picked for it («keuf» instead of «meuf»). */
  confusions: string[];
  last_miss: string | null;
}

/**
 * «Чаще в упражнениях» flags of a word from its live cards: `difficult` (a card the app rates
 * «трудное», cardStatus) and `due` (a card due today), the same rules as the signals.
 */
function focusFlags(wordId: string, ctx: Pick<ViewContext, "statesByWord" | "dayEnd">): { difficult: boolean; due: boolean } {
  const cards = ctx.statesByWord.get(wordId) ?? [];
  return { difficult: cards.some((c) => cardStatus(c) === "difficult"), due: cards.some((c) => isDueToday(c, ctx.dayEnd)) };
}

/**
 * The words an exercise draws on: live and not muted, in the named themes (a paused one is used as
 * asked), else in every theme not «на паузе».
 */
function exerciseScope(words: readonly Word[], ctx: ViewContext, targetIds: ReadonlySet<string | null> | null): Word[] {
  return words.filter((w) => w.deleted_at === null && !w.muted && (targetIds ? targetIds.has(placeOf(w, ctx.live)?.id ?? null) : !isPaused(w, ctx.paused)));
}

/** The saved «Чаще в упражнениях» (user_prefs `exercise_focus`); off without a live row. */
async function savedExerciseFocus(deps: ToolDeps): Promise<ExerciseFocus> {
  const row = (await deps.repo.userPrefs()).find((p) => p.id === EXERCISE_FOCUS_PREF && p.deleted_at === null);
  return row ? parseExerciseFocus(row.value) : DEFAULT_EXERCISE_FOCUS;
}

const FOCUS_TARGET_VALUES = ["normal", "difficult", "due", "both"] as const satisfies readonly ExerciseFocusTarget[];
const FOCUS_SHARE_VALUES = ["some", "half", "most"] as const satisfies readonly ExerciseFocusShare[];
const FOCUS_WORDS_EN: Record<Exclude<ExerciseFocusTarget, "normal">, string> = {
  difficult: "difficult",
  due: "due today",
  both: "difficult or due today",
};
const pct = (share: ExerciseFocusShare) => Math.round(FOCUS_SHARE_MIN[share] * 100);

/** A set made only of the user's difficult and/or due words, from every theme (exercise_material `only`, create_exercise_set `scope`). */
const SCOPE_VALUES = ["difficult", "due", "both"] as const satisfies readonly ExerciseScope[];
const SCOPE_WORDS_RU: Record<ExerciseScope, string> = { difficult: "трудных слов", due: "слов к повторению", both: "трудных слов и слов к повторению" };
/** The usual size of a set (the app's default request); a scoped set with few words is shorter. */
const SCOPE_SIZE_HINT = 12;
/** How many questions a scoped set should have: each word in up to 3 types, at least ITEMS_MIN, at most the usual size. */
export const scopeSuggestedItems = (available: number): number => (available === 0 ? 0 : Math.min(SCOPE_SIZE_HINT, Math.max(ITEMS_MIN, available * 3)));

/**
 * The words a scoped set may use: live, not «на паузе» (the word or its theme), in the given themes
 * when there are any (else every theme), and difficult and/or due today (focusFlags).
 */
function scopeWords(words: readonly Word[], ctx: ViewContext, only: ExerciseScope, targetIds: ReadonlySet<string | null> | null): Word[] {
  return words.filter(
    (w) =>
      w.deleted_at === null &&
      !isPaused(w, ctx.paused) &&
      (!targetIds || targetIds.has(placeOf(w, ctx.live)?.id ?? null)) &&
      matchesFocus(only, focusFlags(w.id, ctx)),
  );
}

/**
 * exercise_material's `scope` additions when `only` is set: how many words there are and what to build.
 * With `verbs` the words are the conjugable verbs only and the recipe is a verb set's (short, mostly conjugate).
 */
function onlyBlock(only: ExerciseScope, available: number, themes: boolean, verbs: boolean) {
  const what = FOCUS_WORDS_EN[only];
  const noun = verbs ? "verbs" : "words";
  const suggested = verbs ? (available === 0 ? 0 : Math.min(VERB_SET_SIZE, Math.max(ITEMS_MIN, available * 3))) : scopeSuggestedItems(available);
  const recipe = verbs
    ? `Make ${suggested} questions (scale with the size the user asked for, 6–10): mostly conjugate items on these verbs plus 2–3 cloze items, the same verb at most twice and never back to back.`
    : `Make ${suggested} questions (scale with the size the user asked for, at most ${available}×3 and at least ${ITEMS_MIN}): with few words make a shorter set, each word in 2–3 different question types (pairs need at least 4 words), the same word never twice in a row.`;
  const note =
    available === 0
      ? `There are no ${what} ${noun}${themes ? " in these themes" : ""} right now, so there is nothing to drill: don't create a set; tell the user (in Russian) that they have no ${SCOPE_WORDS_RU[only]} now.`
      : `Use only these ${available} ${what} ${noun} (words[]): no other library words and no new_words. ${recipe} Pass scope: "${only}" with the set (create_exercise_set, or play_exercises in the chat).`;
  return { only, available, suggested_items: suggested, note };
}

/**
 * How many of a set's items are about focus words: an item with a word_id counts when that word is
 * one; a pairs item counts when at least half of its words are (an item is one question either
 * way). Items about new words never count.
 */
export function focusItemCount(items: ExerciseSet["items"], focusIds: ReadonlySet<string>): number {
  return items.filter((item) => {
    if (item.type === "pairs") return item.pairs.length > 0 && item.pairs.filter((k) => focusIds.has(k)).length * 2 >= item.pairs.length;
    return !!item.word_id && focusIds.has(item.word_id);
  }).length;
}

const noSignals = (): Signals => ({ lapses: 0, due: false, difficult: false, review_misses: 0, ex_attempts: 0, ex_misses: 0, confusions: [], last_miss: null });
const later = (a: string | null, b: string) => (a === null || Date.parse(b) > Date.parse(a) ? b : a);
const weakness = (s: Signals) => s.ex_misses * 3 + s.review_misses * 2 + s.lapses + (s.difficult ? 2 : 0) + (s.due ? 1 : 0);

/**
 * The library words an answer is about (answerWords: its own word, else its item's; a pairs row
 * without a word stands for the whole board). A new word's ref counts for the library word saved
 * since with the same French form (the set keeps the ref; the app adds the word under a new id).
 */
function answerWordIds(a: ExerciseRun["answers"][number], set: ExerciseSet | undefined, savedRefs: ReadonlyMap<string, string>): string[] {
  const item = set?.items.find((i) => i.id === a.item_id);
  const refs = new Set(set?.new_words.map((w) => w.ref) ?? []);
  return answerWords(a, item, refs).flatMap(({ word_id, new_ref }) => {
    const id = word_id ?? (new_ref && set ? savedRefs.get(`${set.id}\u0000${new_ref}`) : undefined);
    return id ? [id] : [];
  });
}

/** Per set and ref («setId\0ref»), the live library word saved since with the new word's French form. */
function savedRefIds(sets: ReadonlyMap<string, ExerciseSet>, words: readonly Word[]): Map<string, string> {
  const byLemma = new Map<string, string>();
  for (const w of words) if (w.deleted_at === null && !byLemma.has(normalizeLemma(w.fr))) byLemma.set(normalizeLemma(w.fr), w.id);
  const out = new Map<string, string>();
  for (const set of sets.values()) {
    for (const w of set.new_words) {
      const id = byLemma.get(normalizeLemma(w.fr));
      if (id) out.set(`${set.id}\u0000${w.ref}`, id);
    }
  }
  return out;
}

/** Signals per word: exercise answers, poorly graded reviews and the cards' state. */
function weaknessSignals(
  words: readonly Word[],
  ctx: ViewContext,
  logs: readonly { word_id: string; rating: number; review: string; deleted_at: string | null }[],
  runs: readonly ExerciseRun[],
  sets: ReadonlyMap<string, ExerciseSet>,
): Map<string, Signals> {
  const out = new Map(words.map((w) => [w.id, noSignals()]));
  const savedRefs = savedRefIds(sets, words);
  for (const w of words) {
    const s = out.get(w.id)!;
    for (const card of ctx.statesByWord.get(w.id) ?? []) s.lapses += card.lapses;
    Object.assign(s, focusFlags(w.id, ctx));
  }
  for (const l of logs) {
    const s = out.get(l.word_id);
    if (!s || l.deleted_at !== null || l.rating > 2) continue;
    s.review_misses++;
    s.last_miss = later(s.last_miss, l.review);
  }
  for (const run of runs) {
    if (run.deleted_at !== null) continue;
    const set = run.set_id ? sets.get(run.set_id) : undefined;
    for (const a of run.answers) {
      // A miss on an old register item picked a level label («arg.»): not a confusion to reuse as a distractor.
      const register = isRegisterItem(set?.items.find((i) => i.id === a.item_id));
      for (const id of answerWordIds(a, set, savedRefs)) {
        const s = out.get(id);
        if (!s) continue;
        s.ex_attempts++;
        if (a.outcome === "correct") continue;
        s.ex_misses++;
        if (a.at) s.last_miss = later(s.last_miss, a.at);
        if (a.chosen && !register && s.confusions.length < CONFUSIONS_MAX && !s.confusions.includes(a.chosen)) s.confusions.push(a.chosen);
      }
    }
  }
  return out;
}

const TOPIC_STOP = new Set(["для", "про", "при", "или", "как", "что", "les", "des", "une", "sur", "pour", "avec", "dans", "the"]);
const CYRILLIC_END_VOWEL = /[\p{Script=Cyrillic}]{3}[аеиоуыэюяьй]$/u;

/**
 * A topic term's stem: two letters off a long word, the final vowel off a short Russian one
 * («баре», «бары» → «бар»), never under three letters.
 */
function topicStem(term: string): string {
  if (term.length > 5) return term.slice(0, -2);
  if (term.length >= 4 && CYRILLIC_END_VOWEL.test(term)) return term.slice(0, -1);
  return term;
}

/** A verb (or verbal expression) conjugate items can ask about: it has a saved conjugation, or the app builds one from Lexique. */
const isConjugable = (w: Pick<Word, "fr" | "pos" | "conjugation">) =>
  (w.pos === "verb" || w.pos === "expression") && (cleanConjugation(w.conjugation) ?? conjugate(w.fr, CONJ_DATA)) !== null;

/** The fields of a library word an exercise is built from (exercise_material's words and topic_matches). */
const materialWord = (w: Word, live: ReadonlyMap<string, Folder>) => ({
  id: w.id,
  fr: w.fr,
  ru: w.ru,
  pos: w.pos,
  gender: w.gender,
  slang_level: w.slang_level,
  verlan: w.verlan,
  example_fr: w.example_fr,
  example_ru: w.example_ru,
  folder: folderRef(placeOf(w, live)),
  ...levelView(w, serverLevels()),
  ...(isConjugable(w) ? { conjugable: true } : {}),
});

/**
 * Saved words that match a free-text topic: each term of the topic (punctuation dropped, Russian
 * endings trimmed) is looked for in the word's text (fr, ru, note, tags, custom fields) and its
 * theme's name and description, accent-insensitively. Most matching terms first.
 */
function topicMatches(topic: string, words: readonly Word[], live: ReadonlyMap<string, Folder>) {
  const terms = searchKey(topic)
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && !TOPIC_STOP.has(t))
    .map(topicStem);
  if (terms.length === 0) return [];
  return words
    .filter((w) => w.deleted_at === null)
    .map((w) => {
      const f = placeOf(w, live);
      const hay = `${searchHaystack(w)} ${f ? searchKey(`${f.name} ${f.description ?? ""}`) : ""}`;
      return { w, hits: terms.filter((t) => hay.includes(t)).length };
    })
    .filter((m) => m.hits > 0)
    .sort((a, b) => b.hits - a.hits || b.w.created_at.localeCompare(a.w.created_at) || a.w.id.localeCompare(b.w.id))
    .slice(0, TOPIC_MATCHES_MAX)
    .map(({ w }) => ({ ...materialWord(w, live), ...(w.muted ? { muted: true } : {}) }));
}

/** The French of the words a set uses, for recent_sets. */
const setWords = (s: ExerciseSet) => [...new Set(s.items.flatMap((i) => (i.type === "pairs" ? i.tiles.map((t) => t.fr) : i.word ? [i.word.fr] : [])))].slice(0, 20);

/** exercise_material's `focus`: the focus in force and what it asks of the set. */
function focusBlock(focus: ExerciseFocus, from: "settings" | "request", available: number) {
  if (focus.target === "normal") return { target: "normal" as const };
  const min = focusMinItems(focus, 12);
  const what = FOCUS_WORDS_EN[focus.target];
  const note =
    available === 0
      ? `No word in scope is ${what} now: build the set as usual.`
      : `At least ${pct(focus.share)}% of the questions (${min} of 12; scale with the set's size) must be about the ${what} words, marked focus: true in words[] (listed first).` +
        (available < min ? ` There are only ${available}: use each of them, the weakest twice.` : "");
  return { target: focus.target, share: focus.share, from, min_items_for_12: min, available, note };
}

/**
 * What a set's level («уровня B1») asks of its questions. The level shapes the sentences, the
 * distractors, the item mix and the new words; it never changes which library words are asked.
 */
const LEVEL_GUIDE: Record<ExerciseLevel, string> = {
  A2: "A2: short sentences (5–8 words), présent and passé composé, concrete everyday situations; distractors of the same part of speech but clearly different in meaning; mostly recognition (meaning fr→ru, pairs), at most a quarter production (meaning ru→fr, cloze); new words A1–A2.",
  B1: "B1: sentences of 8–12 words, the common tenses (imparfait, futur, conditionnel of politeness), everyday life in France (housing, work, administration, health); distractors from the same theme; about half recognition, half production (cloze, meaning ru→fr, situation); new words up to B1.",
  B2: "B2: sentences of 12–18 words with a subordinate clause or a connector (bien que, alors que, pourtant), opinions and society (news, work, environment); distractors close in meaning: near-synonyms, false friends, a wrong collocation or register; mostly production (cloze, meaning ru→fr, situation); new words B1–B2.",
  C1: "C1: longer sentences with nuance (subjonctif, concession, nominalisation), abstract or idiomatic contexts; distractors that differ by nuance, collocation or register only; mostly production and situation items; new words B2–C1.",
};

/**
 * exercise_material's `level`: the levels asked in the request (one or several), else the median
 * level of the neutral words in scope («Авто»).
 */
function levelBlock(askedLevels: readonly ExerciseLevel[], words: readonly Word[]) {
  const asked = cleanLevels(askedLevels);
  const resolver = serverLevels();
  const auto = asked.length ? null : autoLevelOf(words, (w) => resolver.level(w)?.level ?? null);
  const targets: ExerciseLevel[] = asked.length ? asked : [auto ?? "B1"];
  const named = levelsText(targets);
  const top = targets[targets.length - 1];
  const json = JSON.stringify(targets);
  return {
    targets,
    from: asked.length ? "request" : "auto",
    ...(asked.length ? {} : { words_level: auto }),
    guide: Object.fromEntries(targets.map((l) => [l, LEVEL_GUIDE[l]])),
    note:
      (asked.length
        ? `The user asked for ${named}.`
        : auto
          ? `No level was asked: ${named} is the median level of these words (slang and verlan aside).`
          : `No level was asked and no neutral word here has one: write at ${named}.`) +
      (targets.length > 1
        ? ` Spread the questions about evenly across ${named}, each written at its level (guide), the easier ones first;`
        : ` Write every question at this level (guide), not just the words;`) +
      ` the library words stay as they are, even a harder one; keep the rest of each sentence and the options at ${top} or below. Save the set with levels: ${json}${asked.length ? "" : ", level_auto: true"}.`,
  };
}

export const exerciseMaterial = tool({
  name: "exercise_material",
  title: "Material for an exercise",
  description:
    `Read what an exercise set («Упражнения») should practise, before create_exercise_set (a set for the app) or play_exercises / exercise_artifact (a round in the chat). \`words\`: the live words of the given themes (all themes without \`folders\`), weakest first, each with \`signals\` merged from the last \`days\`: exercise answers (ex_attempts, ex_misses, confusions = wrong options the user picked), reviews graded «Снова»/«Трудно» (review_misses), lapses, due today and difficult cards. Words «на паузе» and deleted words are left out, and so are themes «на паузе» unless named in \`folders\`. With \`topic\` (a free-text subject like «вечеринка»), \`topic_matches\` lists saved words that fit it: use them by word_id and never put them in new_words (a muted one can't be used at all). \`recent_sets\` are the latest sets with their words, so the next one doesn't repeat them. \`focus\` is the user's «Чаще в упражнениях» (from Settings, or \`focus\` in the input when the user asks otherwise in this chat): when it is on, the matching words (difficult and/or due today) come first and carry \`focus: true\`, and its \`note\` says how many of the questions must be about them; honour it. With \`only\` («по трудным словам», «по словам к повторению», «без тем»), \`words\` are only the user's difficult and/or due words from every theme (\`folders\` still narrows), \`topic\` and \`focus\` are left out, and \`scope\` says how many there are (\`available\`), how many questions to make (\`suggested_items\`: fewer words → a shorter set, at least ${ITEMS_MIN}) and what to do when there are none. With \`verbs\` («упражнение на спряжение глаголов»), \`words\` are only the verbs conjugate items can ask about (\`conjugable: true\`: a saved conjugation or one the app builds). Each word carries its «Уровень языка» (\`level\`). \`level\` says the levels to write the questions at: the ones asked (\`levels\` in the input, «уровня B1» or «уровня B1–B2» in the request) or, without them, the median level of the words (\`from: "auto"\`); follow \`guide\` for the sentences, distractors, item mix and new words.`,
  input: z.object({
    folders: jsonArray(z.array(folderSelector).max(10)).nullable().optional().describe(`Themes to draw words from (id, slug, name or "${INBOX_SELECTOR}"); default every theme.`),
    topic: z.string().trim().max(TOPIC_MAX).nullable().optional().describe("A free-text topic («вечеринка», «в баре»), when the user asked for one."),
    limit: z.number().int().min(1).max(60).default(30).describe("How many words to return (weakest first)."),
    days: z.number().int().min(1).max(60).default(14).describe("The window for exercise answers and reviews."),
    focus: z
      .object({
        target: z.enum(FOCUS_TARGET_VALUES).describe("normal: no focus; difficult: cards rated «трудное»; due: words due today; both: either."),
        share: z.enum(FOCUS_SHARE_VALUES).nullable().optional().describe(`At least this share of the questions: some ≥${pct("some")}%, half ≥${pct("half")}%, most ≥${pct("most")}%. Default: the saved one.`),
      })
      .nullable()
      .optional()
      .describe("Only when the user asks in this chat for a different focus than their saved «Чаще в упражнениях» («только трудные», «без упора на повторение»); otherwise leave it out and the saved one applies."),
    only: z
      .enum(SCOPE_VALUES)
      .nullable()
      .optional()
      .describe(
        "A set made ONLY of the user's own words, from every theme: difficult (cards rated «трудное»), due (due today) or both. For «упражнение по трудным словам / по словам к повторению» (the app's request says «из всех тем»). Leave it out for an ordinary set.",
      ),
    verbs: z
      .boolean()
      .nullable()
      .optional()
      .describe("true for «упражнение на спряжение глаголов»: only the verbs that conjugate items can use (conjugable: true)."),
    levels: jsonArray(z.array(z.enum(EXERCISE_LEVELS)).max(EXERCISE_LEVELS.length))
      .nullable()
      .optional()
      .describe("The levels the user asked for, one or several («уровня B1» → [\"B1\"], «уровня B1–B2» → [\"B1\", \"B2\"]); leave it out otherwise and `level` comes from the words («Авто»)."),
  }),
  write: false,
  annotations: READ,
  async run(deps, args) {
    const now = deps.now();
    const from = new Date(now.getTime() - args.days * DAY_MS).toISOString();
    const [folders, words, states, logs, runs, sets, saved] = await Promise.all([
      deps.repo.folders(),
      deps.repo.words(),
      deps.repo.states(),
      deps.repo.logsSince(from),
      deps.repo.exerciseRunsSince(from),
      deps.repo.exerciseSets(),
      savedExerciseFocus(deps),
    ]);
    const focus: ExerciseFocus = args.focus ? { target: args.focus.target, share: args.focus.share ?? saved.share } : saved;
    const targets = args.folders?.length ? [...new Map(args.folders.map((s) => resolveFolder(s, folders)).map((f) => [f?.id ?? null, f])).values()] : null;
    const targetIds = targets ? new Set(targets.map((f) => f?.id ?? null)) : null;
    const ctx = viewContext(folders, states, [], deps);
    const only = args.only ?? null;
    // A paused theme («на паузе») is left out of «all themes», but a theme named in `folders` is used as asked
    // (not with `only`: a scoped set takes the words the app counts, never paused ones).
    const scoped = only ? scopeWords(words, ctx, only, targetIds) : exerciseScope(words, ctx, targetIds);
    const verbs = args.verbs === true;
    const inScope = verbs ? scoped.filter(isConjugable) : scoped;
    const liveSets = sets.filter((s) => s.deleted_at === null);
    const signals = weaknessSignals(inScope, ctx, logs, runs, new Map(sets.map((s) => [s.id, s])));
    // «Чаще в упражнениях»: the focus words first, then the weakness order.
    const ranked = inScope
      .map((w) => ({ w, s: signals.get(w.id)! }))
      .map((r) => ({ ...r, focus: !only && matchesFocus(focus.target, r.s) }))
      .sort(
        (a, b) =>
          Number(b.focus) - Number(a.focus) ||
          weakness(b.s) - weakness(a.s) ||
          a.s.ex_attempts - b.s.ex_attempts ||
          b.w.created_at.localeCompare(a.w.created_at) ||
          a.w.id.localeCompare(b.w.id),
      );
    // A scoped set ignores the topic and the focus: every word in it is a focus word already.
    const topic = only ? undefined : cleanText(args.topic ?? undefined);
    return {
      scope: {
        folders: targets ? targets.map(folderRef) : "all",
        ...(topic ? { topic } : {}),
        days: args.days,
        ...(only ? onlyBlock(only, inScope.length, !!targets, verbs) : {}),
      },
      total: inScope.length,
      level: levelBlock(args.levels ?? [], inScope),
      ...(only ? {} : { focus: focusBlock(focus, args.focus ? "request" : "settings", ranked.filter((r) => r.focus).length) }),
      words: ranked.slice(0, args.limit).map(({ w, s, focus: on }) => ({
        ...materialWord(w, ctx.live),
        status: wordStatus(ctx.statesByWord.get(w.id) ?? []),
        ...(on ? { focus: true } : {}),
        signals: s,
      })),
      ...(topic ? { topic_matches: topicMatches(topic, words, ctx.live) } : {}),
      recent_sets: liveSets
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
        .slice(0, RECENT_SETS)
        .map((s) => ({ id: s.id, title: s.title, topic: s.topic, created_at: s.created_at, count: s.items.length, words: setWords(s) })),
      note: verbs
        ? `A verb set is a short test: ${VERB_SET_SIZE} items (6–10, at most ${CONJUGATE_MAX} conjugate), mostly conjugate items (word_id, tense, person; the server writes the form and the options) mixing the 4 tenses and the persons, plus 2–3 cloze items with a time marker for passé composé vs imparfait; the same verb at most twice and never back to back. Send it in one create_exercise_set call (in the chat: play_exercises)${only ? ` with scope: "${only}" (scope.note)` : ""}.`
        : only
          ? "Follow scope.note: only these words, each in 2–3 types, the weakest late; send them in one create_exercise_set call with scope (in the chat: play_exercises)."
          : "Build 10–15 items of at least 3 types, put the weakest words late and twice, and send them in one create_exercise_set call (in the chat: play_exercises).",
    };
  },
});

const exerciseText = (max: number, what: string) => z.string().max(max).nullable().optional().describe(what);

const exerciseItemSchema = z.object({
  id: z.union([z.string().max(40), z.number()]).nullable().optional().describe("Ignored: the server numbers the items q1…qN in the order sent."),
  type: z
    .enum(ITEM_TYPES, { error: (issue) => (issue.input === "register" ? REGISTER_GONE : undefined) })
    .describe(
      "choice: 4 options (answer + 3 distractors). cloze: a French sentence with a gap. pairs: match 4–6 words with their translations. conjugate: pick the right form of a verb (word_id or new_ref) for a tense and person; the server writes the infinitive prompt, the answer, the gap («tu ___») and, when left out, 3 distractors from the verb's conjugation.",
    ),
  skill: z
    .enum(SKILLS)
    .nullable()
    .optional()
    .describe(
      "choice only (default meaning): meaning = the word ↔ its translation (prompt and answer are written by the server from the word); form = the right French form for a Russian cue; neutral = the neutral equivalent of a slang word; verlan = the verlan form or its source; situation = what you would say in a described situation.",
    ),
  tense: z.enum(TENSES).nullable().optional().describe("conjugate only: the tense asked."),
  person: z.enum(PERSONS).nullable().optional().describe("conjugate only: the person asked (il = il / elle / on; the forms have no feminine agreement, so never ask for elle / elles)."),
  ask: z.enum(["fr", "ru"]).nullable().optional().describe("choice + meaning: fr (default) shows the French word with Russian options; ru the reverse. Distractors must be in the options' language (Russian for fr, French for ru): a mix is refused."),
  word_id: z.string().trim().min(1).max(64).nullable().optional().describe("The library word the item is about (from exercise_material). choice, cloze, conjugate: word_id or new_ref."),
  new_ref: z.string().trim().min(1).max(REF_MAX).nullable().optional().describe("A new_words[].ref instead of word_id, for a word that is not in the library."),
  prompt: exerciseText(TEXT_MAX, "The question on the card (Russian or French). Required for choice skills other than meaning; for cloze an optional instruction; conjugate ignores it (the server writes the infinitive)."),
  sentence: exerciseText(TEXT_MAX, "cloze only: a natural French sentence with exactly one [[…]] gap around the answer: «J'ai trop [[kiffé]] ce concert.»"),
  sentence_ru: exerciseText(TEXT_MAX, "cloze only: a short Russian hint of the situation. It must never translate the missing word."),
  answer: exerciseText(ANSWER_MAX, "The right option (choice, cloze; a cloze answer defaults to its gap). Left out for meaning, conjugate and pairs: the server writes it (meaning fr→ru: the word's first Russian equivalent, so distractors are single equivalents too)."),
  distractors: jsonArray(z.array(z.string().max(ANSWER_MAX)).max(6))
    .nullable()
    .optional()
    .describe(
      "choice and cloze: exactly 3 wrong options, same part of speech, gender, register and about the same length as the answer, each clearly wrong. Empty for pairs. conjugate: leave out (the server picks other forms of the verb), or send 3 forms of the same verb without the pronoun.",
    ),
  pairs: jsonArray(z.array(z.string().trim().min(1).max(64)).max(10)).nullable().optional().describe("pairs only: 4–6 word_ids or new_refs with distinct translations; the server builds the tiles."),
  explain_ru: exerciseText(EXPLAIN_MAX, "Optional one-line Russian explanation shown after the answer («верлан от femme»)."),
});

const exerciseNewWordSchema = newWordSchema.pick({ fr: true, ru: true, note: true, example_fr: true, example_ru: true, pos: true, gender: true, slang_level: true, verlan: true, origin: true }).extend({
  ref: z.string().trim().min(1).max(REF_MAX).describe("A short handle the items use as new_ref: n1, n2…"),
  source_url: z.string().trim().max(500).nullable().optional().describe("The page you found the word and its meaning on (one of the two sources you checked)."),
});

/**
 * create_exercise_set's `scope_words` warning (never blocking): items of a scoped set about library
 * words that are not difficult / due today now (the flags exercise_material uses). A pairs board
 * counts when any of its library words is off scope.
 */
async function scopeWordsWarning(deps: ToolDeps, set: ExerciseSet, scope: ExerciseScope, folders: readonly Folder[], words: readonly Word[]) {
  const ctx = viewContext(folders, await deps.repo.states(), [], deps);
  const byId = new Map(words.map((w) => [w.id, w]));
  const off = (id: string) => byId.has(id) && !matchesFocus(scope, focusFlags(id, ctx));
  const found = set.items.flatMap((item, i) => {
    const ids = item.type === "pairs" ? item.pairs.filter(off) : item.word_id && off(item.word_id) ? [item.word_id] : [];
    return ids.length ? [`items[${i}] (${ids.map((id) => byId.get(id)!.fr).join(", ")})`] : [];
  });
  if (found.length === 0) return null;
  return {
    code: "scope_words" as const,
    message: `the set is scoped to ${FOCUS_WORDS_EN[scope]} words, but these items use words that are not: ${found.join("; ")}. Use exercise_material only: "${scope}" next time.`,
  };
}

/**
 * create_exercise_set's `focus_share` warning (never blocking): the saved «Чаще в упражнениях» asks
 * for more questions about focus words than the set has, although such words existed in its scope
 * (its themes, else every unpaused one). With fewer focus words than the share asks for, one
 * question per focus word is enough.
 */
async function focusShareWarning(deps: ToolDeps, set: ExerciseSet, focus: ExerciseFocus, folders: readonly Folder[], words: readonly Word[]) {
  const ctx = viewContext(folders, await deps.repo.states(), [], deps);
  const targetIds = set.folders.length ? new Set(set.folders.map((f) => (f === INBOX_SELECTOR ? null : f))) : null;
  const focusIds = new Set(exerciseScope(words, ctx, targetIds).filter((w) => matchesFocus(focus.target, focusFlags(w.id, ctx))).map((w) => w.id));
  const asked = focusMinItems(focus, set.items.length);
  const expected = Math.min(asked, focusIds.size);
  const has = focusItemCount(set.items, focusIds);
  if (expected === 0 || has >= expected) return null;
  return {
    code: "focus_share" as const,
    message: `the user's «Чаще в упражнениях» asks for at least ${pct(focus.share)}% of the questions about ${FOCUS_WORDS_EN[focus.target as Exclude<ExerciseFocusTarget, "normal">]} words (${asked} of ${set.items.length}); this set has ${has}, and ${focusIds.size} such words were available. Follow exercise_material's focus next time.`,
  };
}

/** A set as Claude sends it: create_exercise_set's input, shared with the chat tools below. */
const setInput = z.object({
  client_ref: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .describe("A unique name you make up for this set, e.g. «eda-2026-10-23». Keep it when retrying the same set; use a new one for a different set."),
  title: z.string().trim().min(1).max(TITLE_MAX).describe("Short Russian title the list shows, e.g. «Вечеринка · сленг»."),
  topic: z.string().trim().max(TOPIC_MAX).nullable().optional().describe("The free-text topic, when the user asked for one («вечеринка»)."),
  folders: jsonArray(z.array(folderSelector).max(10))
    .nullable()
    .optional()
    .describe(`Themes the set was built from (id, slug, name or "${INBOX_SELECTOR}"). New words the user adds from the app go into the first one.`),
  items: jsonArray(z.array(exerciseItemSchema).min(ITEMS_MIN).max(ITEMS_MAX)).describe("The questions, in the order they are played: recognise before produce, weak words late."),
  new_words: jsonArray(z.array(exerciseNewWordSchema).max(NEW_WORDS_MAX))
    .nullable()
    .optional()
    .describe("Words that are not in the library yet, in the add_words format plus ref and source_url. Each gets an intro card before its first item. Must be empty with `scope`."),
  scope: z
    .enum(SCOPE_VALUES)
    .nullable()
    .optional()
    .describe("The exercise_material `only` the set was built with (difficult, due or both): the app shows it as «Трудные · все темы» etc. Leave it out for an ordinary set."),
  levels: jsonArray(z.array(z.enum(EXERCISE_LEVELS)).max(EXERCISE_LEVELS.length))
    .nullable()
    .optional()
    .describe("exercise_material's `level.targets`: the levels the questions were written at; the app shows them on the set's tile («B1–B2»)."),
  level_auto: z
    .boolean()
    .nullable()
    .optional()
    .describe("true when they came from the words (exercise_material's `level.from` \"auto\"): the app shows «≈B1»."),
});

type SetArgs = z.output<typeof setInput>;

/**
 * A new set's content exactly as create_exercise_set saves it: themes resolved (unknown and deleted
 * ones refused), completeSet fills what the server writes, validateSet and the scope rule refuse a
 * broken set with every problem by path. `refusal` opens the message, `retry` says what to call.
 */
async function buildSet(deps: ToolDeps, args: SetArgs, folders: readonly Folder[], refusal: string, retry: string): Promise<{ content: ExerciseSetContent; words: Word[] }> {
  // Ids and order of themes as named; resolveFolder refuses unknown and deleted ones.
  const folderIds = [...new Set((args.folders ?? []).map((s) => resolveFolder(s, folders)?.id ?? INBOX_SELECTOR))];
  const words = await deps.repo.words();
  const ctx = contextFromWords(words, CONJ_DATA);
  const content = completeSet(
    {
      title: args.title,
      topic: args.topic,
      folders: folderIds,
      scope: args.scope ?? null,
      levels: args.levels ?? [],
      level_auto: args.level_auto ?? false,
      // Ids Claude sent are dropped: the server numbers q1…qN, so they never clash.
      items: args.items.map((item) => ({ ...item, id: null })),
      new_words: (args.new_words ?? []).map((w) => ({
        ...w,
        gender: w.pos === "noun" ? (w.gender ?? "none") : "none",
        slang_level: (w.slang_level ?? 0) as SlangLevel,
      })),
    },
    ctx,
  );
  const check = validateSet(content, ctx);
  // A scoped set is made only of the user's own words: no new words from the web.
  const errors = [
    ...(content.scope && content.new_words.length > 0
      ? [{ path: "new_words", message: `must be empty in a set with scope "${content.scope}" (only the user's ${FOCUS_WORDS_EN[content.scope]} words); drop the new words and their items` }]
      : []),
    ...check.errors,
  ];
  if (errors.length > 0) {
    const lines = errors.slice(0, 30).map((e) => `- ${e.path}: ${e.message}`);
    const more = errors.length > 30 ? `\n- …and ${errors.length - 30} more` : "";
    throw new ToolError(`${refusal}. Fix every problem below, then ${retry}:\n${lines.join("\n")}${more}`);
  }
  return { content, words };
}

export const createExerciseSet = tool({
  name: "create_exercise_set",
  title: "Save an exercise set",
  description:
    `Save one exercise set («Упражнения») that the app plays offline; it never changes the review schedule. For a set to play in the app («в приложении», or a request pasted from the app); for a round in the chat use play_exercises. Call exercise_material first, then send the whole set in one call: ${ITEMS_MIN}–${ITEMS_MAX} items (10–15 is best) of at least 3 types (a verb set: ${VERB_SET_SIZE} items, mostly conjugate, at most ${CONJUGATE_MAX} conjugate). Items are about library words (word_id) or new words (new_ref → new_words, at most ${NEW_WORDS_MAX}, found with your web search; the user adds them from the app, so never add_words them yourself). The server numbers the items, copies each word into the set, writes the meaning prompt and answer, the pairs tiles and the conjugate forms, and checks every rule: a refusal names each problem by path (items[7].distractors …); fix them all and call again with the same client_ref. With \`scope\` (a set from exercise_material \`only\`: only the user's difficult and/or due words) new_words must be empty. \`warnings\` never block (focus_share: the set has fewer questions about the words of the user's saved «Чаще в упражнениях» than it asks for; follow exercise_material's \`focus\` next time; scope_words: a scoped set uses words that are not difficult / due; level_words: words in the sentences, the French options or new_words that the app rates two levels or more above the highest of \`levels\`, a hint to simplify them, the asked words aside). A retry with the same client_ref returns already_saved: true and writes nothing. The result is a short summary, not the set: don't write the questions into the chat. Undo with delete_exercise_set.`,
  input: setInput,
  write: true,
  retryHint: "Retrying with the same client_ref is safe: a set that was saved comes back as already_saved.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const id = exerciseSetId(args.client_ref);
    const [sets, folders, focus] = await Promise.all([deps.repo.exerciseSets(), deps.repo.folders(), savedExerciseFocus(deps)]);
    const stored = sets.find((s) => s.id === id);
    if (stored && stored.deleted_at === null) {
      return {
        already_saved: true,
        set: setSummary(stored),
        undo: { tool: "delete_exercise_set", id: stored.id },
        message: "A set with this client_ref was saved before, so nothing was written. To save a different set, use a new client_ref.",
        note: SYNC_NOTE,
      };
    }
    if (stored) {
      throw new ToolError(`The set saved with this client_ref («${stored.title}») was deleted. Bring it back with restore_exercise_set (id ${stored.id}), or use a new client_ref.`);
    }
    const { content, words } = await buildSet(deps, args, folders, "The set was not saved", "call create_exercise_set again with the same client_ref");
    const now = deps.now().toISOString();
    const row: ExerciseSet = { id, ...content, source: "chat", created_at: now, updated_at: now, deleted_at: null };
    const saved = await writeExerciseSet(deps, row, "A set with this client_ref was saved at the same time. Call list_exercise_sets to see it.");
    const scope = parseScope(saved.scope);
    // A scoped set is all focus words by design: the saved «Чаще в упражнениях» share does not apply.
    const extra = scope
      ? await scopeWordsWarning(deps, saved, scope, folders, words)
      : focus.target === "normal"
        ? null
        : await focusShareWarning(deps, saved, focus, folders, words);
    return {
      already_saved: false,
      set: setSummary(saved),
      warnings: [...warningsFor(saved), ...levelWarnings(saved, rateWord), ...(extra ? [extra] : [])],
      undo: { tool: "delete_exercise_set", id: saved.id },
      note: SYNC_NOTE,
    };
  },
});

// «Упражнения в чате»: the same set played right in the chat. play_exercises shows the player (an
// MCP App, CHAT_PLAYER_URI), exercise_artifact hands it over as an HTML page, and both write
// nothing; save_exercise_result saves the set and the round only when the user agrees.

/** play_exercises / exercise_artifact: a new set (as for create_exercise_set), or `set_id` of a saved one. */
const chatSetInput = setInput.partial({ client_ref: true, title: true, items: true }).extend({
  set_id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .nullable()
    .optional()
    .describe("Instead of the set's fields: play a saved set again (its id from list_exercise_sets, or a previous result's set_id)."),
});

type ChatSetArgs = z.output<typeof chatSetInput>;

/** The new set's fields, or a refusal naming what is missing. */
function newSetArgs(args: ChatSetArgs): SetArgs {
  const { client_ref, title, items } = args;
  if (!client_ref || !title || !items) {
    throw new ToolError("Send either set_id (a saved set) or the set itself: client_ref, title and items, as for create_exercise_set.");
  }
  return { ...args, client_ref, title, items };
}

/**
 * The items of a stored set that the chat plays, as the app would: not about a library word deleted
 * or «на паузе» since (lib/exercises.ts playContext), and of a type still made (old register items
 * and unknown types are skipped).
 */
function chatItemIds(set: Pick<ExerciseSet, "items">, words: readonly Word[]): string[] {
  const blocked = new Set(words.filter((w) => w.deleted_at !== null || w.muted).map((w) => w.id));
  const made = new Set<string>(CHAT_ITEM_TYPES);
  const types = new Map(set.items.map((i) => [i.id, i.type as string]));
  return playableItemIds(set, blocked).filter((id) => made.has(types.get(id) ?? ""));
}

const chatSet = (clientRef: string, setId: string, content: ExerciseSetContent, saved: boolean): ChatPlayerSet => ({
  kind: "kartochki-exercise-set",
  version: 1,
  client_ref: clientRef,
  set_id: setId,
  title: content.title,
  topic: content.topic,
  folders: content.folders,
  scope: content.scope,
  levels: content.levels,
  level_auto: content.level_auto,
  items: content.items,
  new_words: content.new_words,
  saved,
});

/**
 * The set the player gets: a saved one by `set_id` (its playable items; a stored set has no
 * client_ref, so its id stands in), else the new set built and checked as create_exercise_set does,
 * never written. A client_ref whose set is saved already is refused, so a round's answers always
 * match the questions that are saved under it.
 */
async function chatPlayerSet(deps: ToolDeps, args: ChatSetArgs, toolName: string): Promise<{ set: ChatPlayerSet; skipped: number }> {
  const sets = await deps.repo.exerciseSets();
  if (args.set_id) {
    const stored = sets.find((s) => s.id === args.set_id);
    if (!stored) throw new ToolError(`No exercise set with id "${args.set_id}". Call list_exercise_sets for the sets.`);
    if (stored.deleted_at !== null) throw new ToolError(`The set «${stored.title}» was deleted. Bring it back with restore_exercise_set (id ${stored.id}) first, if the user wants it.`);
    const ids = new Set(chatItemIds(stored, await deps.repo.words()));
    if (ids.size === 0) {
      throw new ToolError(`Nothing of «${stored.title}» can be played: its words were deleted or paused since it was made, or its questions are of a type no longer used. Make a new set instead.`);
    }
    const items = stored.items.filter((i) => ids.has(i.id));
    return { set: chatSet(stored.id, stored.id, { ...stored, items }, true), skipped: stored.items.length - items.length };
  }
  const input = newSetArgs(args);
  const id = exerciseSetId(input.client_ref);
  const stored = sets.find((s) => s.id === id);
  if (stored) {
    throw new ToolError(
      `A set with this client_ref is saved already («${stored.title}»${stored.deleted_at !== null ? ", deleted since" : ""}): to play it again pass set_id "${stored.id}" alone; for a different set use a new client_ref.`,
    );
  }
  const { content } = await buildSet(deps, input, await deps.repo.folders(), "The set was not shown", `call ${toolName} again with the same client_ref`);
  return { set: chatSet(input.client_ref, id, content, false), skipped: 0 };
}

const questionsText = (set: ChatPlayerSet, skipped: number) =>
  `«${set.title}», ${set.items.length} questions` +
  (set.new_words.length > 0 ? `, ${set.new_words.length} new words with intro cards` : "") +
  (skipped > 0 ? ` (${skipped} skipped: their words were deleted or paused, or their type is no longer used)` : "");

const SAVE_ONLY_IF_ASKED = `Nothing is saved unless the user agrees: then ${SAVE_RESULT_TOOL} saves the round to «Упражнения»`;

export const playExercises = tool({
  name: "play_exercises",
  title: "Play exercises in the chat",
  description:
    `Show an exercise round right in the chat («Упражнения в чате»): an interactive player with the app's rules and look (4 options, «Не знаю», a miss comes back up to ${MAX_ATTEMPTS} times, intro cards for new words, pairs, conjugation, a summary at the end). Use it when the user asks for exercises in the chat («в чате», «здесь», «прямо тут»); for the app use create_exercise_set. Call exercise_material first, then send the set exactly as for create_exercise_set (same fields and rules; a refusal names each problem by path: fix them all and call again with the same client_ref), or \`set_id\` alone to play a saved set again. Writes nothing: the player's «Сохранить в Карточки» saves the set and the result (${SAVE_RESULT_TOOL}) only if the user taps it. Never write the questions, options or answers in the chat: the user sees them in the player. If the user says they don't see a player, or this host shows no apps (e.g. Claude Code), call exercise_artifact with the same input.`,
  input: chatSetInput,
  write: false,
  // The tool's MCP App: the host renders the player and hands it the result's structuredContent.
  // "ui/resourceUri" is the flat key of the spec's drafts, still read by older hosts.
  meta: { ui: { resourceUri: CHAT_PLAYER_URI }, "ui/resourceUri": CHAT_PLAYER_URI },
  annotations: READ,
  async run(deps, args) {
    const { set, skipped } = await chatPlayerSet(deps, args, "play_exercises");
    const message =
      `The player is shown in the chat: ${questionsText(set, skipped)}; set_id ${set.set_id}${set.saved ? " (saved in «Упражнения» already: saving adds only the result)" : ""}. ` +
      `Don't repeat the questions, options or answers in the chat; say in a line or two that the exercise is ready to play above. ` +
      `${SAVE_ONLY_IF_ASKED} (the player's «Сохранить в Карточки» does it itself). ` +
      `If the user says they don't see a player, call exercise_artifact with the same input and publish its HTML as an artifact.`;
    return { set, message };
  },
  reply: (out) => ({ content: [{ type: "text", text: out.message }], structuredContent: out.set as unknown as Record<string, unknown> }),
});

export const exerciseArtifact = tool({
  name: "exercise_artifact",
  title: "Exercise player as an HTML page",
  description:
    `The same exercise player as play_exercises, as a standalone HTML page to publish as an artifact: for a host that shows no apps (e.g. Claude Code), when the user doesn't see the player, or wants a page to keep. Same input as play_exercises (the set, or \`set_id\` of a saved one); writes nothing. The result is a one-line instruction and the page's HTML: publish the HTML verbatim as an HTML artifact, and don't write the questions or answers in the chat. Its «Скопировать результат» copies a ${RUN_LINE_PREFIX.trim()} line: save it with ${SAVE_RESULT_TOOL} (run_line) only after the user agrees. An exercise artifact the user already has is rebuilt only when they ask to change it (more questions, another topic): exercise_material, then exercise_artifact keeping its title and topic.`,
  input: chatSetInput,
  write: false,
  annotations: READ,
  async run(deps, args) {
    const { set, skipped } = await chatPlayerSet(deps, args, "exercise_artifact");
    const html = fillArtifact(CHAT_PLAYER_ARTIFACT, set);
    const saveWith = set.saved ? `set_id "${set.set_id}"` : "the same set input (client_ref, title, items and the rest)";
    const message =
      `Publish the HTML in the next part verbatim as an HTML artifact titled «${set.title}» (don't edit, shorten or reformat it), then say in a line that it is ready: ${questionsText(set, skipped)}. ` +
      `Don't write the questions or answers in the chat. ${SAVE_ONLY_IF_ASKED}: when the user pastes the «Скопировать результат» line (${RUN_LINE_PREFIX.trim()} …) and agrees, call ${SAVE_RESULT_TOOL} with ${saveWith} and run_line.`;
    return { message, html, set_id: set.set_id };
  },
  // The page goes to the model as text, once: no structuredContent copy of it.
  reply: (out) => ({ content: [{ type: "text", text: out.message }, { type: "text", text: out.html }] }),
});

/** A run row id for a round played in the chat: "xr-" + sha256(set id, started_at), so a second save is the same row. */
export const chatRunId = (setId: string, startedAt: string): string =>
  "xr-" + createHash("sha256").update(`${setId}\n${startedAt}`).digest("hex").slice(0, 24);

/** Answer rows of a round: every attempt, and a pairs board's mismatches (ITEMS_MAX × attempts, with room). */
const ANSWERS_MAX = 400;

const isoTime = z
  .string()
  .trim()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), "not a date-time");
const toIso = (s: string) => new Date(s).toISOString();

const answerSchema = z.object({
  item_id: z.string().trim().min(1).max(40),
  word_id: z.string().trim().min(1).max(64).nullable().optional(),
  new_ref: z.string().trim().min(1).max(REF_MAX).nullable().optional(),
  attempt: z.number().int().min(1).max(MAX_ATTEMPTS),
  outcome: z.enum(["correct", "wrong", "dont_know"]),
  // TEXT_MAX, not ANSWER_MAX: a pairs mismatch picks a tile's Russian, the word's whole `ru` (≤300).
  chosen: z.string().max(TEXT_MAX).nullable().optional(),
  ms: z.number().int().min(0).nullable().optional(),
  at: isoTime,
});

/** The round to save: the pasted run line, else the player's fields. */
function chatRunOf(args: { client_ref?: string | null; run_line?: string | null; started_at?: string | null; finished_at?: string | null; answers?: unknown[] | null }): Omit<ChatRunResult, "client_ref"> & { client_ref: string | null } {
  let raw: { started_at?: string | null; finished_at?: string | null; answers?: unknown };
  if (args.run_line) {
    const parsed = parseRunLine(args.run_line);
    if (!parsed) throw new ToolError(`run_line is not a result line: paste the whole line the artifact copied, starting with "${RUN_LINE_PREFIX.trim()}".`);
    if (args.client_ref && parsed.client_ref !== args.client_ref) {
      throw new ToolError(`run_line is the result of another set (client_ref "${parsed.client_ref}", not "${args.client_ref}"): send that set's input with it.`);
    }
    raw = parsed;
  } else raw = args;
  const lineRef = args.run_line ? (raw as ChatRunResult).client_ref : null;
  const started = isoTime.safeParse(raw.started_at);
  if (!started.success) throw new ToolError("started_at is missing or not a date-time: send the result line (run_line), or started_at and answers.");
  const finished = raw.finished_at == null ? null : isoTime.safeParse(raw.finished_at);
  const answers = z.array(answerSchema).max(ANSWERS_MAX).safeParse(raw.answers);
  if (!answers.success) {
    throw new ToolError(`The answers are not a result: ${answers.error.issues.slice(0, 5).map((i) => `answers.${i.path.join(".")}: ${i.message}`).join("; ")}.`);
  }
  return {
    client_ref: lineRef,
    started_at: toIso(started.data),
    finished_at: finished?.success ? toIso(finished.data) : null,
    answers: answers.data.map((a) => ({
      item_id: a.item_id,
      word_id: a.word_id ?? null,
      new_ref: a.new_ref ?? null,
      attempt: a.attempt,
      outcome: a.outcome,
      chosen: a.chosen ?? null,
      ms: a.ms ?? null,
      at: toIso(a.at),
    })),
  };
}

/**
 * An answer row checked against its item, so a result can only say what the player could have
 * recorded: the item's own word (a pairs row: one of the board's, else none = the whole board), a
 * `chosen` among the item's options, and for a 4-option item the outcome that pick means (a «correct»
 * without the answer picked is dropped). Words and confusions feed exercise_material's signals.
 */
function ownAnswer(a: ExerciseAnswer, item: ExerciseItem, newWords: readonly ExerciseNewWord[]): ExerciseAnswer | null {
  if (item.type === "pairs") {
    const key = a.word_id ?? a.new_ref;
    const onBoard = key !== null && (item.pairs ?? []).includes(key);
    const fresh = onBoard && newWords.some((w) => w.ref === key);
    const ru = new Set(item.tiles.map((t) => t.ru));
    return {
      ...a,
      word_id: onBoard && !fresh ? key : null,
      new_ref: fresh ? key : null,
      chosen: a.chosen !== null && ru.has(a.chosen) ? a.chosen : null,
    };
  }
  const options = item.answer ? [item.answer, ...(item.distractors ?? [])] : [];
  const chosen = a.chosen !== null && options.includes(a.chosen) ? a.chosen : null;
  const outcome = chosen !== null ? (chosen === item.answer ? "correct" : "wrong") : a.outcome === "correct" ? null : "dont_know";
  if (outcome === null) return null;
  return { ...a, word_id: item.word_id, new_ref: item.word_id ? null : item.new_ref, chosen, outcome };
}

/** The words a run missed, as list_exercise_sets shows them. */
const missedView = (run: Pick<ExerciseRun, "answers">, s: ExerciseSet) =>
  missedWords(run, s).map((m) => ({ ...(m.word_id ? { word_id: m.word_id } : { new_ref: m.new_ref }), fr: m.fr, ru: m.ru, chosen: m.chosen }));

export const saveExerciseResult = tool({
  name: SAVE_RESULT_TOOL,
  title: "Save a chat exercise result",
  description:
    `Save a round played in the chat (play_exercises or an exercise artifact) to «Упражнения»: the set, if it isn't saved yet (source chat, id from client_ref), and the result, so list_exercise_sets and exercise_material see it. Only when the user agrees: the player's «Сохранить в Карточки» calls it itself; from an artifact the user pastes its «Скопировать результат» line (${RUN_LINE_PREFIX.trim()} …): ask before saving, then send it as run_line with the same set input you played (or set_id for a saved set). The score is recomputed here, and answers to questions that are not in the set are ignored. The same round (client_ref and started_at) is saved once: a repeat returns already_saved and writes nothing. Never changes the review schedule. Undo: delete_exercise_set when this call added the set; a result alone can't be removed.`,
  input: chatSetInput.extend({
    run_line: z
      .string()
      .max(100_000)
      .nullable()
      .optional()
      .describe(`The line the artifact's «Скопировать результат» copied ("${RUN_LINE_PREFIX.trim()} {…}"), as the user pasted it; instead of started_at, finished_at and answers.`),
    started_at: isoTime.nullable().optional().describe("When the round started (the player's result)."),
    finished_at: isoTime.nullable().optional().describe("When it ended; null when the user left it unfinished."),
    answers: jsonArray(z.array(answerSchema).max(ANSWERS_MAX)).nullable().optional().describe("The player's answer rows, one per attempt (pairs: one per mismatch too)."),
  }),
  write: true,
  retryHint: "Retrying with the same input is safe: a round that was saved comes back as already_saved.",
  // The player calls it from the chat (MCP Apps `tools/call`), and so can Claude.
  meta: { ui: { visibility: ["model", "app"] } },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const result = chatRunOf(args);
    const [sets, folders] = await Promise.all([deps.repo.exerciseSets(), deps.repo.folders()]);
    const ownId = args.client_ref ? exerciseSetId(args.client_ref) : null;
    const setId = args.set_id ?? ownId;
    if (!setId) throw new ToolError("Send the set (client_ref, title, items, as you played it) or set_id of a saved set, with the result.");
    const stored = sets.find((s) => s.id === setId);
    if (stored && stored.deleted_at !== null) {
      throw new ToolError(`The set «${stored.title}» was deleted, so nothing was saved. Bring it back with restore_exercise_set (id ${stored.id}) and save again, if the user wants.`);
    }
    if (!stored && setId !== ownId) throw new ToolError(`No exercise set with id "${setId}". Call list_exercise_sets for the sets.`);
    // Item ids are q1…qN in every set: a pasted line of another set would fit this one's questions.
    if (result.client_ref !== null && result.client_ref !== setId && exerciseSetId(result.client_ref) !== setId) {
      throw new ToolError(`run_line is the result of another set (client_ref "${result.client_ref}"): send that set's input, or its set_id, with it.`);
    }
    let set: ExerciseSet;
    let words: Word[];
    if (stored) {
      set = stored;
      words = await deps.repo.words();
    } else {
      if (!args.title || !args.items) throw new ToolError("This set is not saved yet: send it as you played it (client_ref, title, items and the rest) with the result.");
      // Built from the set as played and checked again, so a round never saves a set the rules refuse.
      const built = await buildSet(deps, newSetArgs(args), folders, "Nothing was saved", `call ${SAVE_RESULT_TOOL} again with the same client_ref`);
      const now = deps.now().toISOString();
      set = { id: setId, ...built.content, source: "chat", created_at: now, updated_at: now, deleted_at: null };
      words = built.words;
    }

    // The questions the chat played, as the app would count them (item_ids [] = every item).
    const played = chatItemIds(set, words);
    const itemIds = played.length === set.items.length ? [] : played;
    const inRun = new Set(played);
    const byId = new Map(set.items.map((i) => [i.id, i]));
    const answers = result.answers.flatMap((a) => {
      const item = inRun.has(a.item_id) ? byId.get(a.item_id) : undefined;
      const own = item && ownAnswer(a, item, set.new_words);
      return own ? [own] : [];
    });
    if (answers.length === 0) throw new ToolError("The result has no answers to this set's questions, so nothing was saved.");
    const runId = chatRunId(set.id, result.started_at);
    const done = (await deps.repo.exerciseRunsSince(result.started_at)).find((r) => r.id === runId);
    if (done) {
      return {
        saved: true,
        already_saved: true,
        set_id: set.id,
        run: { id: done.id, first_try: done.first_try, total: done.total, missed: missedView(done, set) },
        message: "This round was saved before, so nothing was written.",
        undo: null,
        note: SYNC_NOTE,
      };
    }

    const created = !stored;
    if (created) set = await writeExerciseSet(deps, set, `A set with this client_ref was saved at the same time. Call ${SAVE_RESULT_TOOL} again to add the result.`);
    const score = scoreRun({ item_ids: itemIds, answers }, set);
    const now = deps.now().toISOString();
    const row: ExerciseRun = {
      id: runId,
      set_id: set.id,
      kind: "set",
      item_ids: itemIds,
      started_at: result.started_at,
      finished_at: result.finished_at,
      answers,
      total: score.total,
      first_try: score.first_try,
      updated_at: now,
      deleted_at: null,
    };
    const [run] = await deps.repo.upsert("exercise_runs", [row]);
    if (!run || run.updated_at !== row.updated_at) throw new ToolError(`The result was saved at the same time. Call ${SAVE_RESULT_TOOL} again to see it.`);
    return {
      saved: true,
      already_saved: false,
      set_id: set.id,
      set_saved: created,
      set: setSummary(set),
      run: { id: run.id, first_try: run.first_try, total: run.total, missed: missedView(run, set) },
      ...(answers.length < result.answers.length ? { ignored_answers: result.answers.length - answers.length } : {}),
      // A run has no undo of its own (only the playing side writes runs, and the app has no way to
      // remove one); a set this call added takes its result with it when deleted.
      undo: created ? { tool: "delete_exercise_set", id: set.id } : null,
      note: created
        ? `Undo deletes the whole set with its result. ${SYNC_NOTE}`
        : `The set was saved before: only the result was added, and it can't be undone on its own (delete_exercise_set would hide the whole set). ${SYNC_NOTE}`,
    };
  },
});

export const listExerciseSets = tool({
  name: "list_exercise_sets",
  title: "List exercise sets",
  description:
    "List the user's exercise sets («Упражнения»), newest first: title, themes, `scope` (difficult / due / both for a set made only of those words, else null), number of questions by type, new words, and `last_run` (the latest playthrough of the whole set that has answers, a finished one first: when, whether it was finished, first-try score, and the words missed with the wrong options picked; a round played in the chat counts once saved with save_exercise_result). `last_mistakes_round`, when there is one, is the latest «Повторить ошибки» round in the app over the misses. Use it for «работа над ошибками» and to find a set's id for delete_exercise_set.",
  input: z.object({
    limit: z.number().int().min(1).max(50).default(20),
    include_deleted: z.boolean().default(false).describe("Also list deleted sets (restore_exercise_set brings one back)."),
  }),
  write: false,
  annotations: READ,
  async run(deps, args) {
    const [sets, folders] = await Promise.all([deps.repo.exerciseSets(), deps.repo.folders()]);
    const shown = sets
      .filter((s) => args.include_deleted || s.deleted_at === null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
      .slice(0, args.limit);
    // A run starts after its set was made; a day of margin covers a device clock running behind.
    const oldest = Math.min(...shown.map((s) => Date.parse(s.created_at)).filter((t) => !Number.isNaN(t)));
    const runs = shown.length > 0 && Number.isFinite(oldest) ? await deps.repo.exerciseRunsSince(new Date(oldest - DAY_MS).toISOString()) : [];
    // Per set: its runs newest first. last_run is the newest whole-set run with answers, a finished
    // one first (a «Повторить ошибки» round or a run opened and left at once would hide the misses).
    const bySet = new Map<string, ExerciseRun[]>();
    for (const run of runs) {
      if (run.deleted_at !== null || !run.set_id) continue;
      bySet.set(run.set_id, [...(bySet.get(run.set_id) ?? []), run]);
    }
    for (const list of bySet.values()) list.sort((a, b) => b.started_at.localeCompare(a.started_at) || a.id.localeCompare(b.id));
    const lastRun = (s: ExerciseSet): ExerciseRun | undefined => {
      const list = bySet.get(s.id) ?? [];
      const played = list.filter((r) => r.kind === "set" && r.answers.length > 0);
      return played.find((r) => r.finished_at !== null || runSettled(s, r)) ?? played[0] ?? list.find((r) => r.kind === "set") ?? list[0];
    };
    const runView = (run: ExerciseRun, s: ExerciseSet) => ({
      at: run.finished_at ?? run.answers.at(-1)?.at ?? run.started_at,
      kind: run.kind,
      // Every item settled counts as finished (the app was left on the last, answered card).
      finished: run.finished_at !== null || runSettled(s, run),
      first_try: run.first_try,
      total: run.total,
      missed: missedView(run, s),
    });
    return {
      total: sets.filter((s) => args.include_deleted || s.deleted_at === null).length,
      sets: shown.map((s) => {
        const run = lastRun(s);
        const mistakes = (bySet.get(s.id) ?? []).find((r) => r.kind === "mistakes" && r.answers.length > 0);
        return {
          ...setSummary(s),
          topic: s.topic,
          folders: setFolders(s, folders),
          scope: parseScope(s.scope),
          created_at: s.created_at,
          ...(s.deleted_at !== null ? { deleted: true } : {}),
          last_run: run ? runView(run, s) : null,
          ...(mistakes && mistakes !== run && (!run || mistakes.started_at > run.started_at) ? { last_mistakes_round: runView(mistakes, s) } : {}),
        };
      }),
    };
  },
});

export const deleteExerciseSet = tool({
  name: "delete_exercise_set",
  title: "Delete an exercise set",
  description: "Delete an exercise set (soft: its results stay). Use it when the user asks, or to undo create_exercise_set. Undo with restore_exercise_set and the returned id.",
  input: z.object({ id: z.string().trim().min(1).max(64).describe("The set id from create_exercise_set or list_exercise_sets.") }),
  write: true,
  retryHint: "Retrying is safe: a set that is already in that state comes back unchanged.",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const current = (await deps.repo.exerciseSets()).find((s) => s.id === args.id);
    if (!current) throw new ToolError(`No exercise set with id "${args.id}". Call list_exercise_sets for the sets.`);
    const undo = { tool: "restore_exercise_set", id: current.id };
    if (current.deleted_at !== null) return { deleted: setSummary(current), result: "unchanged", undo };
    const stamp = stampAfter(deps.now(), current.updated_at);
    const stored = await writeExerciseSet(deps, { ...current, deleted_at: stamp, updated_at: stamp }, SET_CLASH);
    return { deleted: setSummary(stored), undo, note: SYNC_NOTE };
  },
});

export const restoreExerciseSet = tool({
  name: "restore_exercise_set",
  title: "Restore a deleted exercise set",
  description: "Undo delete_exercise_set: bring a deleted exercise set back, with its results.",
  input: z.object({ id: z.string().trim().min(1).max(64).describe("The id from delete_exercise_set's `undo`.") }),
  write: true,
  retryHint: "Retrying is safe: a set that is already in that state comes back unchanged.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  async run(deps, args) {
    const current = (await deps.repo.exerciseSets()).find((s) => s.id === args.id);
    if (!current) throw new ToolError(`No exercise set with id "${args.id}".`);
    if (current.deleted_at === null) return { set: setSummary(current), result: "unchanged" };
    const stored = await writeExerciseSet(deps, { ...current, deleted_at: null, updated_at: stampAfter(deps.now(), current.updated_at) }, SET_CLASH);
    return { restored: setSummary(stored), note: SYNC_NOTE };
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
    if (spec.reply) return spec.reply(out);
    return { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out };
  } catch (error) {
    if (error instanceof ToolError) return errorResult(error.message);
    if (error instanceof RepoError) {
      console.error(`[mcp] ${spec.name}: ${error.message}`);
      const hint = spec.write ? ` ${spec.retryHint ?? "Part of the change may be saved: check with search_words before retrying."}` : "";
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
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.input,
      annotations: { title: spec.title, ...spec.annotations },
      ...(spec.meta ? { _meta: spec.meta } : {}),
    },
    (args) => execute(spec, deps, args as z.output<S>),
  );
}

export const TOOL_NAMES = [
  searchWords.name,
  listFolders.name,
  listFields.name,
  createField.name,
  updateField.name,
  deleteField.name,
  restoreField.name,
  studySummary.name,
  updateStudyPlan.name,
  addWords.name,
  updateWord.name,
  setWordLevels.name,
  moveWords.name,
  restoreMoves.name,
  deleteWords.name,
  restoreWords.name,
  createFolder.name,
  updateFolder.name,
  deleteFolder.name,
  restoreFolder.name,
  exerciseMaterial.name,
  createExerciseSet.name,
  listExerciseSets.name,
  deleteExerciseSet.name,
  restoreExerciseSet.name,
  playExercises.name,
  exerciseArtifact.name,
  saveExerciseResult.name,
] as const;

/**
 * The chat player (MCP App) play_exercises points at. Self-contained: inline scripts and styles,
 * system fonts, no network, so it needs no CSP domains. No `_meta.ui.domain`: a host derives the
 * sandbox origin from the server URL, and ours carries the secret.
 */
function registerChatPlayer(server: McpServer): void {
  server.registerResource(
    "exercise_player",
    CHAT_PLAYER_URI,
    { title: "Упражнение", description: "The «Карточки» exercise player shown by play_exercises.", mimeType: MCP_APP_MIME },
    async () => ({ contents: [{ uri: CHAT_PLAYER_URI, mimeType: MCP_APP_MIME, text: CHAT_PLAYER_HTML }] }),
  );
}

export function registerTools(server: McpServer, deps: ToolDeps): void {
  register(server, deps, searchWords);
  register(server, deps, listFolders);
  register(server, deps, listFields);
  register(server, deps, createField);
  register(server, deps, updateField);
  register(server, deps, deleteField);
  register(server, deps, restoreField);
  register(server, deps, studySummary);
  register(server, deps, updateStudyPlan);
  register(server, deps, addWords);
  register(server, deps, updateWord);
  register(server, deps, setWordLevels);
  register(server, deps, moveWords);
  register(server, deps, restoreMoves);
  register(server, deps, deleteWords);
  register(server, deps, restoreWords);
  register(server, deps, createFolder);
  register(server, deps, updateFolder);
  register(server, deps, deleteFolder);
  register(server, deps, restoreFolder);
  register(server, deps, exerciseMaterial);
  register(server, deps, createExerciseSet);
  register(server, deps, listExerciseSets);
  register(server, deps, deleteExerciseSet);
  register(server, deps, restoreExerciseSet);
  register(server, deps, playExercises);
  register(server, deps, exerciseArtifact);
  register(server, deps, saveExerciseResult);
  registerChatPlayer(server);
}

export const SERVER_INSTRUCTIONS = `«Карточки» is the user's flashcard app for colloquial French; the user is a Russian speaker. A card is a French word or phrase (fr) with its Russian translation (ru). Words are grouped into themes («темы»); «${INBOX_NAME}» (inbox) holds words without a theme.
- Before adding, search_words for the word; add_words also skips French forms that are already saved.
- For each new word give the dictionary form, one to three Russian equivalents in the same register, slang_level (0 neutral, 1 familier, 2 argot, 3 vulgaire), verlan (true for verlan forms such as meuf, relou, chelou), pos, gender for nouns, and a short everyday example_fr with its example_ru. Vulgar words are legitimate vocabulary: translate them with the same strength and mark them 3.
- Set folder_chosen_by_user to true only when the user named the theme; otherwise pick a fitting theme yourself, or leave the word in the inbox.
- A word can carry origin («Происхождение»: one Russian line, e.g. «верлан от lourd», «от volonté „воля“ + -aire») and, for verbs, a conjugation (présent, passé composé, imparfait, futur; six forms each with pronouns). The app builds most conjugations itself from Lexique: search_words shows conjugation_builtin false where it cannot. Fill them with update_word when the user asks (e.g. «заполни происхождение для слов из темы X»), checking forms you are not sure of; never overwrite an existing origin or conjugation unless asked.
- Cards can carry the user's custom fields («Свои поля»): list_fields shows the shared ones and what to write in each. Set them by name with custom_fields in add_words or update_word (null clears one); search_words shows them. Use a name not in list_fields only when the user asks for a field on that one word. create_field, update_field and delete_field manage the shared fields; ask the user before creating or deleting one.
- «Уровень языка» (CEFR A1…C2): search_words shows each word's \`level\` and \`level_source\`; most are estimates the app computes from its dictionary (flelex, freq), which you leave alone. To fill the missing ones (search_words level "none"), list the words with the levels you propose and wait for the OK, then save them with set_word_levels in batches of 10–15. Rate a word as a textbook or DELF / TCF list would, against words of known level; skip argot, vulgar words and verlan unless asked. Never change a level the user set (level_source user) unless they ask.
- «План повторения» (how many new words a day, the review cap, the order of new words, when RU→FR starts): study_summary's \`plan.settings\` shows it; change it with update_study_plan only when the user asks (e.g. «давай 15 новых слов в день», «новые по темам»), then say what changed and what today looks like (study_summary).
- study_summary's \`plan_fit\` compares the plan with the user's usual study days (days without study are not data). When \`plan_fit.suggestion\` is set and the conversation is about the plan, pace, load or progress, you may propose it once per conversation: name the usual number, the plan, and \`forecast_30d\`, offer it as an option, wait for the OK, then update_study_plan. Never change the plan on your own, never open a conversation with it, never call fewer study days a failure.
- «Прогресс» («как у меня с прогрессом за месяц?»): study_summary \`history_days\` (30 for a month); summarize the trends (знаю, помню ≈, «Верно») in a few lines; mention the streak at most once and never push it.
- Before adding more than 5 words, and before any move, delete, or renaming, pausing or deleting a theme (update_folder, delete_folder), list what will change and wait for the user's OK.
- «На паузе»: a theme (update_folder \`muted\`) or a word (update_word \`muted\`) stays in the library with its progress but never comes up in review or practice; \`false\` brings it back. When list_folders shows many themes with words still \`new\` and some of them look like later steps of a sequence (levels, lessons, chapters, a course or book order) or like topics the user said can wait, suggest pausing those so only the current ones reach review: name the themes to pause and the ones that stay, and wait for the OK. When the user moves on, suggest bringing the next ones back. Never pause or unpause on your own.
- After a change, say what changed and how to undo it with the result's \`undo\` (delete_words, restore_words, restore_moves, set_word_levels, update_study_plan, restore_folder, delete_field, restore_field, delete_exercise_set or restore_exercise_set).
- Exercises («Упражнения»: «сделай упражнение / тест / квиз по теме …»): call exercise_material first, then send the whole set in one call; where it is played decides which. «В приложении», a request pasted from the app, or no place named → create_exercise_set (the app plays it offline). «В чате», «здесь», «прямо тут» → play_exercises, which shows a player in the chat; «ещё раз» for a saved set → play_exercises with its set_id. Never write the questions, options or answers in the chat yourself. If the user says they don't see a player, or the host shows no apps (e.g. Claude Code), call exercise_artifact with the same input and publish its HTML as an HTML artifact verbatim. Exercises never change the review schedule.
- A round played in the chat reaches the app only if the user agrees: the player's «Сохранить в Карточки» saves it itself; from an artifact the user pastes its «Скопировать результат» line (KARTOCHKI_RUN …): ask before saving, then call save_exercise_result with it as run_line and the set input you played (or set_id). Never save one unasked.
- An exercise artifact the user already has: rebuild it only when they ask to change it (more questions, another topic): exercise_material, then exercise_artifact keeping its title and topic, and publish the new HTML.
- For a free-text topic, use the saved words in topic_matches by word_id. Words found with web search go in new_words (at most 8, each checked in at least 2 sources, slang_level by the rubric, source_url); never add_words them without the user's OK, since the user adds them from the app.
- choice and cloze have 4 options: the answer plus 3 distractors of the same part of speech, gender, register and length, with exactly one best answer. A cloze's sentence_ru hints at the situation and never translates the gap.
- Order the items recognise-before-produce (meaning fr→ru and pairs before ru→fr and cloze), put the weakest words (first in exercise_material) late and twice, keep the same word apart, and use 10–15 items of at least 3 types.
- Honour exercise_material's \`focus\` (the user's «Чаще в упражнениях»): at least the share it names of the questions about the words marked focus: true, even for a plain «сделай упражнение»; pass \`focus\` to exercise_material only when the user asks otherwise in the chat.
- «По трудным словам», «по словам к повторению», «без тем / из всех тем»: exercise_material \`only\` (difficult, due or both), then the set (create_exercise_set, or play_exercises in the chat) with the same \`scope\`: only those words, \`scope.suggested_items\` questions (a shorter set when there are few, each word in 2–3 types), no new_words; with none available, say so instead of making a set.
- «Уровень набора» («уровня B1», «уровня B1–B2», «уровень B2» in the request; one or several): pass them as exercise_material \`levels\`; without them, exercise_material's \`level\` takes the words' level. Write the questions at \`level.targets\` following each one's guide (sentence length and tenses, how close the distractors are, recognition vs production, the level of new words), several levels spread about evenly, easier first; never by swapping the library words; send the set with \`levels\` (plus \`level_auto: true\` when they came from the words).
- «Спряжение глаголов» («упражнение на спряжение глаголов»): exercise_material \`verbs: true\`, then a short set of ${VERB_SET_SIZE} items (6–10): mostly conjugate items (word_id, tense, person; the server writes the form and the options) mixing the 4 tenses and the persons, with 30–40% of the passé composé on être or pronominal verbs; plus 2–3 cloze items with a verb gap and a time marker (hier / tous les jours / demain) for passé composé vs imparfait; the same verb at most twice, never back to back; never elle / elles (the forms have no feminine agreement).
- «Работа над ошибками»: list_exercise_sets' last_run.missed and exercise_material's signals (ex_misses, confusions) say what to drill; reuse a confused option as a distractor only where it is in the item's options' language (a Russian one for meaning fr→ru, a French one for cloze and ru→fr).
- After create_exercise_set or save_exercise_result, give the set's title and number of questions and how to undo it; it shows in «Упражнения» after the app's next sync.
- Make write calls one at a time, never in parallel: each reads the current rows first, and parallel writes to the same words conflict or slip past the duplicate check.
- Changes reach the app on its next sync (when it is opened or focused). Reviewing and grading cards happen in the app only.
- Talk about the app's features plainly; never call them "AI".`;
