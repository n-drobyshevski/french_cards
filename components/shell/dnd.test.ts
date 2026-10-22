import { describe, expect, it } from "vitest";
import { hasDraggedWords, readDraggedWords, WORDS_MIME } from "./dnd";

const transfer = (data: Record<string, string>) => ({
  types: Object.keys(data),
  getData: (format: string) => data[format] ?? "",
});

describe("dragged words", () => {
  it("recognises a word drag by its type", () => {
    expect(hasDraggedWords(transfer({ [WORDS_MIME]: "[]" }))).toBe(true);
    expect(hasDraggedWords(transfer({ "text/plain": "x" }))).toBe(false);
    expect(hasDraggedWords(null)).toBe(false);
  });

  it("reads the ids and rejects malformed payloads", () => {
    expect(readDraggedWords(transfer({ [WORDS_MIME]: JSON.stringify(["a", "b"]) }))).toEqual(["a", "b"]);
    expect(readDraggedWords(transfer({ [WORDS_MIME]: "[]" }))).toBeNull();
    expect(readDraggedWords(transfer({ [WORDS_MIME]: "[1]" }))).toBeNull();
    expect(readDraggedWords(transfer({ [WORDS_MIME]: "{" }))).toBeNull();
    expect(readDraggedWords(transfer({ "text/plain": "a" }))).toBeNull();
  });
});
