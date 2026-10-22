// In-memory McpRepo for tests. Upserts behave like the kartochki_stamp_row trigger: a row whose
// updated_at is not newer than the stored one is kept out and the stored row comes back. Replaces
// write a row only while the stored updated_at is still the expected one.
import type { Folder, ReviewLog, ReviewState, Word } from "@/lib/types";
import type { McpRepo, Replacement, TableRows, WritableTable } from "./repo";

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
}

const clone = <T>(x: T): T => structuredClone(x);

export function createFakeRepo(
  seed: { folders?: Folder[]; words?: Word[]; review_state?: ReviewState[]; review_log?: ReviewLog[] } = {},
): FakeRepo {
  const tables: Tables = {
    folders: new Map((seed.folders ?? []).map((r) => [r.id, clone(r)])),
    words: new Map((seed.words ?? []).map((r) => [r.id, clone(r)])),
    review_state: new Map((seed.review_state ?? []).map((r) => [r.id, clone(r)])),
    review_log: new Map((seed.review_log ?? []).map((r) => [r.id, clone(r)])),
  };
  const failing = new Set<WritableTable>();
  const fake: FakeRepo = {
    tables,
    writes: [],
    failNextUpsert: (table) => void failing.add(table),
    repo: {
      folders: async () => clone([...tables.folders.values()]),
      words: async () => clone([...tables.words.values()]),
      wordsByIds: async (ids) => clone(ids.map((id) => tables.words.get(id)).filter((w): w is Word => !!w)),
      states: async (wordIds) =>
        clone([...tables.review_state.values()].filter((s) => wordIds === undefined || wordIds.includes(s.word_id))),
      logsSince: async (from) => clone([...tables.review_log.values()].filter((l) => Date.parse(l.review) >= Date.parse(from))),
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
        return changes.flatMap(({ row, expected }) => {
          const stored = target.get(row.id);
          if (!stored || Date.parse(stored.updated_at) !== Date.parse(expected) || Date.parse(row.updated_at) <= Date.parse(stored.updated_at)) return [];
          target.set(row.id, clone(row));
          return [clone(row)];
        });
      },
    },
  };
  return fake;
}
