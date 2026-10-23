// The connector's only door to Supabase. It runs with the secret key, which bypasses RLS, so every
// query here filters on the one user id and every written row carries it. Rows come back in the
// app's shape (lib/core/rows.ts), timestamps normalized to toISOString(). The kartochki_stamp_row
// trigger still runs: it stamps synced_at (devices pull the change on their next sync) and keeps
// the stored row when a write's updated_at is not newer.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fromRemoteRow, toRemoteRow } from "@/lib/core/rows";
import type { ExerciseRun, ExerciseSet, FieldDef, Folder, ReviewLog, ReviewState, UserPref, Word } from "@/lib/types";
import type { McpConfig } from "./config";

/** Keyset page size (the app's PULL_PAGE); a page is never trusted to be the last unless it is empty. */
export const PAGE = 500;
/** Ids per `in (…)` filter, to keep request URLs short. */
const IN_CHUNK = 100;
/** Conditional updates in flight at once (one request per row). */
const REPLACE_CONCURRENCY = 10;

export interface TableRows {
  folders: Folder;
  words: Word;
  review_state: ReviewState;
  review_log: ReviewLog;
  /** Read-only here: the definitions of «Свои поля» are edited in the app. */
  field_defs: FieldDef;
  /** «Упражнения»: the connector writes the content (create, soft delete, restore). */
  exercise_sets: ExerciseSet;
  /** Read-only here: runs are written by the device that plays them. */
  exercise_runs: ExerciseRun;
  /** Read-only here: preferences («Чаще в упражнениях») are set in the app. */
  user_prefs: UserPref;
}

export type WritableTable = "folders" | "words" | "review_state" | "field_defs" | "exercise_sets";

export interface McpRepo {
  /** Every folder, tombstones included. */
  folders(): Promise<Folder[]>;
  /** Every word, tombstones included. */
  words(): Promise<Word[]>;
  /** Every shared custom-field definition («Свои поля»), tombstones included. Read-only. */
  fieldDefs(): Promise<FieldDef[]>;
  /** Words by id (tombstones included; unknown ids are left out). */
  wordsByIds(ids: readonly string[]): Promise<Word[]>;
  /** Review cards: all of them, or those of the given words. Tombstones included. */
  states(wordIds?: readonly string[]): Promise<ReviewState[]>;
  /** Review-log rows with `review >= from`. Tombstones (undone reviews) included. */
  logsSince(from: string): Promise<ReviewLog[]>;
  /** Every exercise set, tombstones included. */
  exerciseSets(): Promise<ExerciseSet[]>;
  /** Exercise runs with `started_at >= from`, tombstones included. Read-only. */
  exerciseRunsSince(from: string): Promise<ExerciseRun[]>;
  /** Every preference row (`user_prefs`, e.g. `exercise_focus`), tombstones included. Read-only. */
  userPrefs(): Promise<UserPref[]>;
  /** Inserts or replaces rows; returns them as stored (an older-than-stored write comes back unchanged). */
  upsert<T extends WritableTable>(table: T, rows: readonly TableRows[T][]): Promise<TableRows[T][]>;
  /**
   * Compare-and-set rewrite of stored rows: each row is written only while the stored updated_at
   * is still `expected` (the value read before the change). Returns the rows that were written;
   * a row left out was changed by someone else meanwhile. When a request fails it throws a
   * PartialWriteError that still names the rows confirmed written.
   */
  replace<T extends WritableTable>(table: T, changes: readonly Replacement<T>[]): Promise<TableRows[T][]>;
}

export interface Replacement<T extends WritableTable> {
  row: TableRows[T];
  /** The stored updated_at the change was based on. */
  expected: string;
}

export class RepoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepoError";
  }
}

/**
 * A replace that failed part-way: `written` rows were confirmed stored, `failed` ids got no answer
 * (or were not sent), so whether they changed is unknown. Every other id was a conflict.
 */
export class PartialWriteError extends RepoError {
  constructor(
    message: string,
    readonly written: readonly string[],
    readonly failed: readonly string[],
  ) {
    super(message);
    this.name = "PartialWriteError";
  }
}

/** Server-only client with the secret key and no session handling. */
export function adminClient(config: Pick<McpConfig, "supabaseUrl" | "secretKey">): SupabaseClient {
  return createClient(config.supabaseUrl, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

type Filter = { column: string } & ({ op: "in"; values: readonly string[] } | { op: "gte"; value: string });

/** The repo over a Supabase client, scoped to `userId` on every call. */
export function createSupabaseRepo(client: SupabaseClient, userId: string): McpRepo {
  async function fetchAll<T extends keyof TableRows>(table: T, filter?: Filter): Promise<TableRows[T][]> {
    const out: TableRows[T][] = [];
    let last: string | null = null;
    for (;;) {
      let query = client.from(table).select("*").eq("user_id", userId);
      if (filter?.op === "in") query = query.in(filter.column, [...filter.values]);
      if (filter?.op === "gte") query = query.gte(filter.column, filter.value);
      if (last !== null) query = query.gt("id", last);
      const { data, error } = await query.order("id", { ascending: true }).limit(PAGE);
      if (error) throw new RepoError(`${table}: ${error.message}`);
      if (!data || data.length === 0) return out;
      for (const row of data) out.push(fromRemoteRow(table, row) as unknown as TableRows[T]);
      last = String((data[data.length - 1] as { id: string }).id);
    }
  }

  async function fetchIn<T extends keyof TableRows>(table: T, column: string, values: readonly string[]): Promise<TableRows[T][]> {
    const unique = [...new Set(values)];
    const pages = await Promise.all(chunks(unique, IN_CHUNK).map((part) => fetchAll(table, { column, op: "in", values: part })));
    return pages.flat();
  }

  return {
    folders: () => fetchAll("folders"),
    words: () => fetchAll("words"),
    fieldDefs: () => fetchAll("field_defs"),
    wordsByIds: (ids) => (ids.length ? fetchIn("words", "id", ids) : Promise.resolve([])),
    states: (wordIds) => (wordIds === undefined ? fetchAll("review_state") : wordIds.length ? fetchIn("review_state", "word_id", wordIds) : Promise.resolve([])),
    logsSince: (from) => fetchAll("review_log", { column: "review", op: "gte", value: from }),
    exerciseSets: () => fetchAll("exercise_sets"),
    exerciseRunsSince: (from) => fetchAll("exercise_runs", { column: "started_at", op: "gte", value: from }),
    userPrefs: () => fetchAll("user_prefs"),
    async upsert(table, rows) {
      if (rows.length === 0) return [];
      const body = rows.map((row) => ({ ...toRemoteRow(table, row), user_id: userId }));
      const { data, error } = await client.from(table).upsert(body, { onConflict: "user_id,id" }).select("*");
      if (error) throw new RepoError(`${table}: ${error.message}`);
      return (data ?? []).map((row) => fromRemoteRow(table, row) as unknown as TableRows[typeof table]);
    },
    async replace(table, changes) {
      const out: TableRows[typeof table][] = [];
      const failed: string[] = [];
      let message = "";
      for (const part of chunks(changes, REPLACE_CONCURRENCY)) {
        // Not after a failure: the database is likely down, and those rows are reported as failed.
        if (failed.length > 0) {
          failed.push(...part.map((c) => c.row.id));
          continue;
        }
        const results = await Promise.allSettled(
          part.map(async ({ row, expected }) => {
            // Every writer stamps toISOString() (whole ms); the 1 ms window also matches a finer stored value.
            const at = Date.parse(expected);
            const { data, error } = await client
              .from(table)
              .update({ ...toRemoteRow(table, row), user_id: userId })
              .eq("user_id", userId)
              .eq("id", row.id)
              .gte("updated_at", new Date(at).toISOString())
              .lt("updated_at", new Date(at + 1).toISOString())
              .select("*");
            if (error) throw new RepoError(`${table}: ${error.message}`);
            return (data ?? []).map((r) => fromRemoteRow(table, r) as unknown as TableRows[typeof table]);
          }),
        );
        results.forEach((result, i) => {
          if (result.status === "fulfilled") out.push(...result.value);
          else {
            failed.push(part[i].row.id);
            const reason: unknown = result.reason;
            if (!message) message = reason instanceof RepoError ? reason.message : `${table}: ${reason instanceof Error ? reason.message : String(reason)}`;
          }
        });
      }
      if (failed.length > 0) throw new PartialWriteError(message, out.map((r) => r.id), failed);
      return out;
    },
  };
}

/** The repo for a resolved connector config. */
export const createMcpRepo = (config: McpConfig): McpRepo => createSupabaseRepo(adminClient(config), config.userId);
