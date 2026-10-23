// In-memory McpRepo for tests. Upserts behave like the kartochki_stamp_row trigger: a row whose
// updated_at is not newer than the stored one is kept out and the stored row comes back. Replaces
// write a row only while the stored updated_at is still the expected one.
import type { ExerciseRun, ExerciseSet, FieldDef, Folder, ReviewLog, ReviewState, UserPref, Word } from "@/lib/types";
import { PartialWriteError, type McpRepo, type Replacement, type TableRows, type WritableTable } from "./repo";

type Tables = { [T in keyof TableRows]: Map<string, TableRows[T]> };

export interface FakeRepo {
  repo: McpRepo;
  tables: Tables;
  /** Every upsert and replace in order, as sent. */
  writes: { table: WritableTable; rows: unknown[] }[];
  /** Runs before each upsert or replace is applied (e.g. to simulate a device writing meanwhile). */
  beforeUpsert?: (table: WritableTable, rows: readonly unknown[]) => void;
  /** Makes the next upsert or replace to `table` throw. */
  failNextUpsert(table: WritableTable): void;
  /**
   * Makes the next replace to `table` fail part-way: the first `after` rows go through, the rest
   * are reported failed (and, with `lostAnswers`, are written anyway, as when an answer is lost).
   */
  failNextReplace(table: WritableTable, options: { after: number; lostAnswers?: boolean }): void;
}

const clone = <T>(x: T): T => structuredClone(x);

export function createFakeRepo(
  seed: {
    folders?: Folder[];
    words?: Word[];
    review_state?: ReviewState[];
    review_log?: ReviewLog[];
    field_defs?: FieldDef[];
    exercise_sets?: ExerciseSet[];
    exercise_runs?: ExerciseRun[];
    user_prefs?: UserPref[];
  } = {},
): FakeRepo {
  const tables: Tables = {
    folders: new Map((seed.folders ?? []).map((r) => [r.id, clone(r)])),
    words: new Map((seed.words ?? []).map((r) => [r.id, clone(r)])),
    review_state: new Map((seed.review_state ?? []).map((r) => [r.id, clone(r)])),
    review_log: new Map((seed.review_log ?? []).map((r) => [r.id, clone(r)])),
    field_defs: new Map((seed.field_defs ?? []).map((r) => [r.id, clone(r)])),
    exercise_sets: new Map((seed.exercise_sets ?? []).map((r) => [r.id, clone(r)])),
    exercise_runs: new Map((seed.exercise_runs ?? []).map((r) => [r.id, clone(r)])),
    user_prefs: new Map((seed.user_prefs ?? []).map((r) => [r.id, clone(r)])),
  };
  const failing = new Set<WritableTable>();
  const partial = new Map<WritableTable, { after: number; lostAnswers?: boolean }>();
  const fake: FakeRepo = {
    tables,
    writes: [],
    failNextUpsert: (table) => void failing.add(table),
    failNextReplace: (table, options) => void partial.set(table, options),
    repo: {
      folders: async () => clone([...tables.folders.values()]),
      words: async () => clone([...tables.words.values()]),
      fieldDefs: async () => clone([...tables.field_defs.values()]),
      wordsByIds: async (ids) => clone(ids.map((id) => tables.words.get(id)).filter((w): w is Word => !!w)),
      states: async (wordIds) =>
        clone([...tables.review_state.values()].filter((s) => wordIds === undefined || wordIds.includes(s.word_id))),
      logsSince: async (from) => clone([...tables.review_log.values()].filter((l) => Date.parse(l.review) >= Date.parse(from))),
      exerciseSets: async () => clone([...tables.exercise_sets.values()]),
      exerciseRunsSince: async (from) => clone([...tables.exercise_runs.values()].filter((r) => Date.parse(r.started_at) >= Date.parse(from))),
      userPrefs: async () => clone([...tables.user_prefs.values()]),
      async upsert<T extends WritableTable>(table: T, rows: readonly TableRows[T][]): Promise<TableRows[T][]> {
        fake.writes.push({ table, rows: clone([...rows]) });
        if (failing.delete(table)) throw new Error(`${table}: simulated failure`);
        fake.beforeUpsert?.(table, rows);
        const target = tables[table] as Map<string, TableRows[T]>;
        return rows.map((row) => {
          const stored = target.get(row.id);
          if (stored && Date.parse(row.updated_at) <= Date.parse(stored.updated_at)) return clone(stored);
          target.set(row.id, clone(row));
          return clone(row);
        });
      },
      async replace<T extends WritableTable>(table: T, changes: readonly Replacement<T>[]): Promise<TableRows[T][]> {
        const rows = changes.map((c) => c.row);
        fake.writes.push({ table, rows: clone(rows) });
        if (failing.delete(table)) throw new Error(`${table}: simulated failure`);
        fake.beforeUpsert?.(table, rows);
        const target = tables[table] as Map<string, TableRows[T]>;
        const apply = ({ row, expected }: Replacement<T>): TableRows[T][] => {
          const stored = target.get(row.id);
          if (!stored || Date.parse(stored.updated_at) !== Date.parse(expected) || Date.parse(row.updated_at) <= Date.parse(stored.updated_at)) return [];
          target.set(row.id, clone(row));
          return [clone(row)];
        };
        const fail = partial.get(table);
        if (!fail) return changes.flatMap(apply);
        partial.delete(table);
        const written = changes.slice(0, fail.after).flatMap(apply);
        const rest = changes.slice(fail.after);
        if (fail.lostAnswers) rest.forEach(apply);
        throw new PartialWriteError(`${table}: simulated failure`, written.map((r) => r.id), rest.map((c) => c.row.id));
      },
    },
  };
  return fake;
}
