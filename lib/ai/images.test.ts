import { describe, expect, it } from "vitest";
import { MAX_EXTRACT_BODY_BYTES, readBodyWithLimit } from "./images";
import { MAX_TOTAL_BYTES } from "../image-prep";

function chunkedRequest(chunks: number, size: number, headers: Record<string, string> = {}) {
  let sent = 0;
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      if (sent >= chunks) return controller.close();
      sent += 1;
      controller.enqueue(new Uint8Array(size));
    },
  });
  const req = new Request("http://localhost/api/ai/extract", { method: "POST", body, headers, duplex: "half" } as RequestInit);
  return { req, pulled: () => pulled };
}

describe("readBodyWithLimit", () => {
  it("stays under the platform cap and above what the client sends", () => {
    expect(MAX_EXTRACT_BODY_BYTES).toBeLessThanOrEqual(4_500_000);
    expect(MAX_EXTRACT_BODY_BYTES).toBeGreaterThan(MAX_TOTAL_BYTES + 64 * 1024);
  });

  it("returns the body when it fits", async () => {
    const { req } = chunkedRequest(3, 1000);
    expect((await readBodyWithLimit(req, 5000))?.byteLength).toBe(3000);
  });

  it("stops reading a chunked body without Content-Length once it passes the limit", async () => {
    const { req, pulled } = chunkedRequest(1000, 1024);
    expect(await readBodyWithLimit(req, 10 * 1024)).toBeNull();
    expect(pulled()).toBeLessThan(20);
  });

  it("rejects a declared Content-Length over the limit before reading", async () => {
    const req = new Request("http://localhost/x", { method: "POST", body: "x".repeat(10), headers: { "content-length": "999999" } });
    expect(await readBodyWithLimit(req, 100)).toBeNull();
  });

  it("does not trust a Content-Length that understates the body", async () => {
    const { req } = chunkedRequest(50, 1024, { "content-length": "10" });
    expect(await readBodyWithLimit(req, 10 * 1024)).toBeNull();
  });
});
