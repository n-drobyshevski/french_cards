import { describe, expect, it } from "vitest";
import { reviewKeyAction } from "@/components/review/keys";
import { blocksGlobalKeys, globalKeyAction, isModifierKey, type GlobalKeyLike } from "./keys";

const key = (code: string, k: string, extra: Partial<GlobalKeyLike> = {}): GlobalKeyLike => ({ code, key: k, ...extra });

describe("globalKeyAction", () => {
  it("maps the global keys by code, also on the Russian layout", () => {
    expect(globalKeyAction(key("KeyN", "n"))).toEqual({ type: "add" });
    expect(globalKeyAction(key("KeyN", "т"))).toEqual({ type: "add" });
    expect(globalKeyAction(key("Slash", "/"))).toEqual({ type: "search" });
    expect(globalKeyAction(key("Slash", "."))).toEqual({ type: "search" });
    expect(globalKeyAction(key("Slash", "?", { shiftKey: true }))).toEqual({ type: "shortcuts" });
    expect(globalKeyAction(key("Slash", ",", { shiftKey: true }))).toEqual({ type: "shortcuts" });
    expect(globalKeyAction(key("KeyM", "?", { shiftKey: true }))).toEqual({ type: "shortcuts" });
    expect(globalKeyAction(key("BracketLeft", "["))).toEqual({ type: "toggle-sidebar" });
    expect(globalKeyAction(key("BracketLeft", "х"))).toEqual({ type: "toggle-sidebar" });
    expect(globalKeyAction(key("KeyG", "g"))).toEqual({ type: "sequence" });
  });

  it("finishes G sequences with R, L or I", () => {
    expect(globalKeyAction(key("KeyR", "r"), true)).toEqual({ type: "go", href: "/" });
    expect(globalKeyAction(key("KeyL", "д"), true)).toEqual({ type: "go", href: "/library" });
    expect(globalKeyAction(key("KeyI", "i"), true)).toEqual({ type: "go", href: "/import" });
    expect(globalKeyAction(key("KeyN", "n"), true)).toBeNull();
    expect(globalKeyAction(key("KeyR", "r"))).toBeNull();
  });

  it("ignores modifiers, repeats and composition", () => {
    expect(globalKeyAction(key("KeyN", "n", { metaKey: true }))).toBeNull();
    expect(globalKeyAction(key("KeyN", "n", { ctrlKey: true }))).toBeNull();
    expect(globalKeyAction(key("KeyN", "n", { altKey: true }))).toBeNull();
    expect(globalKeyAction(key("KeyN", "N", { shiftKey: true }))).toBeNull();
    expect(globalKeyAction(key("KeyN", "n", { repeat: true }))).toBeNull();
    expect(globalKeyAction(key("KeyN", "n", { isComposing: true }))).toBeNull();
    expect(globalKeyAction(key("KeyN", "Process", { keyCode: 229 }))).toBeNull();
    expect(isModifierKey({ key: "Shift" })).toBe(true);
    expect(isModifierKey({ key: "n" })).toBe(false);
  });

  it("does not collide with the review keys", () => {
    const review = [key("Space", " "), key("Enter", "Enter"), key("Digit1", "1"), key("Digit2", "2"), key("Digit3", "3"), key("ArrowLeft", "ArrowLeft"), key("ArrowRight", "ArrowRight"), key("KeyZ", "z")];
    for (const ev of review) {
      expect(globalKeyAction(ev)).toBeNull();
      expect(reviewKeyAction(ev, { revealed: true, gradeButtons: 3 })).not.toBeNull();
    }
    for (const ev of [key("KeyN", "n"), key("KeyG", "g"), key("BracketLeft", "["), key("Slash", "/")]) {
      expect(reviewKeyAction(ev, { revealed: true, gradeButtons: 3 })).toBeNull();
    }
  });
});

describe("blocksGlobalKeys", () => {
  const el = (tagName: string, inside: string | null = null) => ({
    tagName,
    getAttribute: () => null,
    closest: (selector: string) => (inside && selector.includes(inside) ? {} : null),
  });

  it("blocks while typing or inside menus, listboxes and dialogs", () => {
    expect(blocksGlobalKeys(el("INPUT"))).toBe(true);
    expect(blocksGlobalKeys(el("TEXTAREA"))).toBe(true);
    expect(blocksGlobalKeys({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(blocksGlobalKeys(el("DIV", "role='menu'"))).toBe(true);
    expect(blocksGlobalKeys(el("BUTTON", "role='dialog'"))).toBe(true);
    expect(blocksGlobalKeys(el("BUTTON"))).toBe(false);
    expect(blocksGlobalKeys(el("BODY"))).toBe(false);
    expect(blocksGlobalKeys(null)).toBe(false);
  });
});
