import { describe, expect, it, vi } from "vitest";
import { ndjsonResponse, readNdjson } from "./ndjson";

describe("ndjson", () => {
  it("round-trips lines, skipping garbage and blank lines", async () => {
    const res = ndjsonResponse(async function* () {
      yield { type: "meta" };
      yield { type: "item", n: 1 };
    });
    expect(res.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    const out = [];
    for await (const line of readNdjson(res)) out.push(line);
    expect(out).toEqual([{ type: "meta" }, { type: "item", n: 1 }]);

    const chunked = new Response(
      new ReadableStream({
        start(c) {
          const enc = new TextEncoder();
          for (const part of ['{"a":', '1}\n\nnot json\n{"b"', ":2}"]) c.enqueue(enc.encode(part));
          c.close();
        },
      }),
    );
    const parsed = [];
    for await (const line of readNdjson(chunked)) parsed.push(line);
    expect(parsed).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("calls onCancel when the reader stops early", async () => {
    const onCancel = vi.fn();
    const res = ndjsonResponse(
      async function* () {
        for (let i = 0; ; i++) yield { i };
      },
      { onCancel },
    );
    for await (const line of readNdjson<{ i: number }>(res)) if (line.i >= 2) break;
    await new Promise((r) => setTimeout(r, 0));
    expect(onCancel).toHaveBeenCalled();
  });
});
