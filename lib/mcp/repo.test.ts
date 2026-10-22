import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createSupabaseRepo, PAGE, PartialWriteError, RepoError } from "./repo";

interface Call {
  table: string;
  ops: [string, ...unknown[]][];
}

/** Records every query-builder call; `respond` answers each awaited query. */
function fakeClient(respond: (call: Call) => { data: unknown[] | null; error: { message: string } | null }) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "gte", "gt", "lt", "order", "limit", "upsert", "update"]) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(respond(call)).then(resolve, reject);
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const ids = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `id-${String(from + i).padStart(4, "0")}`, updated_at: "2026-10-22T10:00:00+00:00" }));

describe("createSupabaseRepo", () => {
  it("filters every read on the user and pages by id until an empty page", async () => {
    const pages = [ids(PAGE), ids(3, PAGE), []];
    const { client, calls } = fakeClient(() => ({ data: pages.shift() ?? [], error: null }));
    const rows = await createSupabaseRepo(client, "user-1").words();
    expect(rows).toHaveLength(PAGE + 3);
    expect(rows[0].updated_at).toBe("2026-10-22T10:00:00.000Z");
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.table).toBe("words");
      expect(call.ops).toContainEqual(["eq", "user_id", "user-1"]);
      expect(call.ops).toContainEqual(["order", "id", { ascending: true }]);
      expect(call.ops).toContainEqual(["limit", PAGE]);
    }
    expect(calls[0].ops.some(([op]) => op === "gt")).toBe(false);
    expect(calls[1].ops).toContainEqual(["gt", "id", `id-${String(PAGE - 1).padStart(4, "0")}`]);
  });

  it("reads and writes back every synced word column, extra_examples included", async () => {
    const extra = [{ fr: "c'est relou", ru: "это напрягает" }];
    const stored = { ...ids(1)[0], fr: "relou", ru: "напряжный", extra_examples: extra, user_id: "user-1", synced_at: "2026-10-22T10:00:01+00:00" };
    let reads = 0;
    const { client, calls } = fakeClient((call) => {
      const write = call.ops.some(([op]) => op === "upsert");
      return { data: write || reads++ === 0 ? [stored] : [], error: null };
    });
    const repo = createSupabaseRepo(client, "user-1");
    const [row] = await repo.wordsByIds(["id-0000"]);
    expect(row).toMatchObject({ extra_examples: extra });
    expect(row).not.toHaveProperty("synced_at");
    await repo.upsert("words", [row]);
    const body = (calls.at(-1)!.ops.find(([op]) => op === "upsert") as unknown[])[1] as Record<string, unknown>[];
    expect(body[0]).toMatchObject({ extra_examples: extra, user_id: "user-1" });
  });

  it("scopes filtered reads too, and chunks long id lists", async () => {
    const { client, calls } = fakeClient(() => ({ data: [], error: null }));
    const repo = createSupabaseRepo(client, "user-1");
    await repo.wordsByIds(Array.from({ length: 150 }, (_, i) => `w${i}`));
    await repo.states(["w1"]);
    await repo.logsSince("2026-10-22T02:00:00.000Z");
    await repo.folders();
    expect(calls.map((c) => c.table)).toEqual(["words", "words", "review_state", "review_log", "folders"]);
    for (const call of calls) expect(call.ops).toContainEqual(["eq", "user_id", "user-1"]);
    expect((calls[0].ops.find(([op]) => op === "in") as unknown[])[2]).toHaveLength(100);
    expect(calls[2].ops).toContainEqual(["in", "word_id", ["w1"]]);
    expect(calls[3].ops).toContainEqual(["gte", "review", "2026-10-22T02:00:00.000Z"]);
    expect(await repo.wordsByIds([])).toEqual([]);
    expect(calls).toHaveLength(5);
  });

  it("writes the user id on every row, upserts on (user_id, id) and returns rows as stored", async () => {
    const { client, calls } = fakeClient(() => ({
      data: [{ id: "f1", slug: "x", name: "X", updated_at: "2026-10-22T10:00:00.5+00:00", user_id: "user-1", synced_at: "2026-10-22T10:00:01+00:00" }],
      error: null,
    }));
    const repo = createSupabaseRepo(client, "user-1");
    const folder = { id: "f1", slug: "x", name: "X", description: null, color: "#000", created_by: "user" as const, locked: false, sort: 0, updated_at: "2026-10-22T10:00:00.500Z", deleted_at: null };
    const [stored] = await repo.upsert("folders", [{ ...folder, user_id: "someone-else" } as typeof folder]);
    const [, body, options] = calls[0].ops.find(([op]) => op === "upsert") as [string, Record<string, unknown>[], unknown];
    expect(body[0].user_id).toBe("user-1");
    expect(options).toEqual({ onConflict: "user_id,id" });
    expect(stored).toEqual({ id: "f1", slug: "x", name: "X", updated_at: "2026-10-22T10:00:00.500Z" });
  });

  it("replaces a row only while its stored updated_at is the expected one, scoped to the user", async () => {
    const { client, calls } = fakeClient((call) => ({
      data: call.ops.some(([op, column, value]) => op === "eq" && column === "id" && value === "w1") ? [{ id: "w1", updated_at: "2026-10-22T10:00:00+00:00" }] : [],
      error: null,
    }));
    const repo = createSupabaseRepo(client, "user-1");
    const row = (id: string) => ({ id, updated_at: "2026-10-22T10:00:00.000Z" }) as Parameters<typeof repo.replace<"words">>[1][number]["row"];
    const stored = await repo.replace("words", [
      { row: row("w1"), expected: "2026-10-21T08:00:00.123Z" },
      { row: row("w2"), expected: "2026-10-21T08:00:00.123Z" },
    ]);
    expect(stored.map((r) => r.id)).toEqual(["w1"]);
    expect(calls).toHaveLength(2);
    const [, body] = calls[0].ops.find(([op]) => op === "update") as [string, Record<string, unknown>];
    expect(body.user_id).toBe("user-1");
    expect(calls[0].ops).toEqual(
      expect.arrayContaining([
        ["eq", "user_id", "user-1"],
        ["eq", "id", "w1"],
        ["gte", "updated_at", "2026-10-21T08:00:00.123Z"],
        ["lt", "updated_at", "2026-10-21T08:00:00.124Z"],
      ]),
    );
    expect(calls.some((c) => c.ops.some(([op]) => op === "upsert"))).toBe(false);
  });

  it("reports the rows a failing replace did write, and sends nothing after the failed chunk", async () => {
    const idOf = (call: Call) => call.ops.find(([op, column]) => op === "eq" && column === "id")?.[2] as string;
    const { client, calls } = fakeClient((call) =>
      idOf(call) === "w12" ? { data: null, error: { message: "fetch failed" } } : { data: [{ id: idOf(call), updated_at: "2026-10-22T10:00:00+00:00" }], error: null },
    );
    const repo = createSupabaseRepo(client, "user-1");
    const changes = Array.from({ length: 25 }, (_, i) => ({
      row: { id: `w${i}`, updated_at: "2026-10-22T10:00:00.000Z" } as Parameters<typeof repo.replace<"words">>[1][number]["row"],
      expected: "2026-10-21T08:00:00.000Z",
    }));
    const error = await repo.replace("words", changes).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PartialWriteError);
    const partial = error as PartialWriteError;
    expect(partial.message).toBe("words: fetch failed");
    expect(partial.written).toEqual(Array.from({ length: 20 }, (_, i) => `w${i}`).filter((id) => id !== "w12"));
    expect(partial.failed).toEqual(["w12", ...Array.from({ length: 5 }, (_, i) => `w${20 + i}`)]);
    expect(calls).toHaveLength(20);
  });

  it("turns Supabase errors into RepoError", async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: "permission denied" } }));
    await expect(createSupabaseRepo(client, "user-1").folders()).rejects.toThrow(RepoError);
  });
});
