import { describe, expect, it } from "vitest";
import { buildWord } from "@/lib/core/words";
import { draftOf, isDirty, patchFor, undoFor } from "./word-editor";

const word = buildWord({ fr: "relou", ru: "занудный", pos: "adj" }, new Date("2026-10-22T10:00:00Z"));

describe("word editor: origin", () => {
  it("drafts, patches and undoes the origin", () => {
    const draft = { ...draftOf(word, []), origin: "верлан от lourd" };
    expect(draftOf(word, []).origin).toBe("");
    expect(isDirty(word, "origin", draftOf(word, []))).toBe(false);
    expect(isDirty(word, "origin", draft)).toBe(true);
    const patch = patchFor("origin", draft);
    expect(patch).toEqual({ origin: "верлан от lourd" });
    expect(undoFor(word, patch)).toEqual({ origin: null });
    const saved = { ...word, origin: "верлан от lourd" };
    expect(isDirty(saved, "origin", { ...draft, origin: " верлан от lourd " })).toBe(false);
  });
});
