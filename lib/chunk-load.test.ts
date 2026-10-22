import { describe, expect, it, vi } from "vitest";
import { claimChunkReload, loadChunk } from "./chunk-load";

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

describe("claimChunkReload", () => {
  it("allows one reload per minute", () => {
    const storage = memoryStorage();
    expect(claimChunkReload(storage, 1_000_000)).toBe(true);
    expect(claimChunkReload(storage, 1_030_000)).toBe(false);
    expect(claimChunkReload(storage, 1_061_000)).toBe(true);
  });

  it("never reloads without storage", () => {
    expect(claimChunkReload(null, 0)).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(claimChunkReload(throwing, 0)).toBe(false);
  });
});

describe("loadChunk", () => {
  it("returns the first successful load", async () => {
    const load = vi.fn().mockResolvedValue("desk");
    await expect(loadChunk(load, { retryMs: 0 })).resolves.toBe("desk");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries a failed load once", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("net")).mockResolvedValue("desk");
    await expect(loadChunk(load, { retryMs: 0 })).resolves.toBe("desk");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("rejects after the retry when the page cannot reload (no window)", async () => {
    const load = vi.fn().mockRejectedValue(new Error("gone"));
    await expect(loadChunk(load, { retryMs: 0 })).rejects.toThrow("gone");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
