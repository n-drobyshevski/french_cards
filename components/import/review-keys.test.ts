import { describe, expect, it } from "vitest";
import { importReviewKeyAction, type ImportKeyContext } from "./review-keys";

const mac: ImportKeyContext = { shortcuts: true, interactive: false, mac: true };
const pc: ImportKeyContext = { ...mac, mac: false };

describe("importReviewKeyAction", () => {
  it("maps J/K/X by code, so the Russian layout works", () => {
    expect(importReviewKeyAction({ key: "о", code: "KeyJ" }, mac)).toBe("next");
    expect(importReviewKeyAction({ key: "л", code: "KeyK" }, mac)).toBe("prev");
    expect(importReviewKeyAction({ key: "ч", code: "KeyX" }, mac)).toBe("toggle");
  });

  it("Пробел toggles and ↵ edits, unless a focused control handles them", () => {
    expect(importReviewKeyAction({ key: " ", code: "Space" }, mac)).toBe("toggle");
    expect(importReviewKeyAction({ key: "Enter", code: "Enter" }, mac)).toBe("edit");
    expect(importReviewKeyAction({ key: " ", code: "Space" }, { ...mac, interactive: true })).toBeNull();
    expect(importReviewKeyAction({ key: "Enter", code: "Enter" }, { ...mac, interactive: true })).toBeNull();
    // Letters still work from a focused checkbox.
    expect(importReviewKeyAction({ key: "x", code: "KeyX" }, { ...mac, interactive: true })).toBe("toggle");
  });

  it("⌘A / ⌘↵ on Mac, Ctrl elsewhere", () => {
    expect(importReviewKeyAction({ key: "a", code: "KeyA", metaKey: true }, mac)).toBe("select-all");
    expect(importReviewKeyAction({ key: "Enter", code: "Enter", metaKey: true }, mac)).toBe("add");
    expect(importReviewKeyAction({ key: "a", code: "KeyA", ctrlKey: true }, mac)).toBeNull();
    expect(importReviewKeyAction({ key: "a", code: "KeyA", ctrlKey: true }, pc)).toBe("select-all");
    expect(importReviewKeyAction({ key: "Enter", code: "NumpadEnter", ctrlKey: true }, pc)).toBe("add");
    expect(importReviewKeyAction({ key: "a", code: "KeyA", metaKey: true }, pc)).toBeNull();
  });

  it("single keys follow settings.shortcuts; the combos do not", () => {
    const off = { ...mac, shortcuts: false };
    expect(importReviewKeyAction({ key: "j", code: "KeyJ" }, off)).toBeNull();
    expect(importReviewKeyAction({ key: " ", code: "Space" }, off)).toBeNull();
    expect(importReviewKeyAction({ key: "a", code: "KeyA", metaKey: true }, off)).toBe("select-all");
  });

  it("ignores repeats, other modifiers and IME composition", () => {
    expect(importReviewKeyAction({ key: "j", code: "KeyJ", repeat: true }, mac)).toBeNull();
    expect(importReviewKeyAction({ key: "J", code: "KeyJ", shiftKey: true }, mac)).toBeNull();
    expect(importReviewKeyAction({ key: "j", code: "KeyJ", altKey: true }, mac)).toBeNull();
    expect(importReviewKeyAction({ key: "a", code: "KeyA", metaKey: true, shiftKey: true }, mac)).toBeNull();
    expect(importReviewKeyAction({ key: "Process", code: "KeyJ", keyCode: 229 }, mac)).toBeNull();
    expect(importReviewKeyAction({ key: "j", code: "KeyJ", isComposing: true }, mac)).toBeNull();
  });
});
