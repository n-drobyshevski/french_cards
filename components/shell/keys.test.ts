import { describe, expect, it } from "vitest";
import { reviewKeyAction } from "@/components/review/keys";
import { blocksGlobalKeys, GO_TARGETS, globalKeyAction, isModifierKey, type GlobalKeyLike } from "./keys";
import { SHORTCUT_COLUMNS } from "./ShortcutsDialog";

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

  it("finishes G sequences with R, E, L, P, C or I", () => {
    expect(globalKeyAction(key("KeyR", "r"), true)).toEqual({ type: "go", href: "/" });
    expect(globalKeyAction(key("KeyE", "e"), true)).toEqual({ type: "go", href: "/exercises" });
    expect(globalKeyAction(key("KeyE", "у"), true)).toEqual({ type: "go", href: "/exercises" });
    expect(globalKeyAction(key("KeyE", "E", { shiftKey: true }), true)).toBeNull();
    expect(globalKeyAction(key("KeyE", "e"))).toBeNull();
    expect(globalKeyAction(key("KeyL", "д"), true)).toEqual({ type: "go", href: "/library" });
    expect(globalKeyAction(key("KeyI", "i"), true)).toEqual({ type: "go", href: "/import" });
    expect(globalKeyAction(key("KeyC", "с"), true)).toEqual({ type: "go", href: "/context" });
    expect(globalKeyAction(key("KeyP", "p"), true)).toEqual({ type: "go", href: "/progress" });
    expect(globalKeyAction(key("KeyP", "з"), true)).toEqual({ type: "go", href: "/progress" });
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

  it("keeps a bare P for «Ещё практика»; only G then P opens «Прогресс»", () => {
    const p = key("KeyP", "p");
    expect(globalKeyAction(p)).toBeNull();
    expect(reviewKeyAction(p, { revealed: false, gradeButtons: 3, desktop: true, done: true })).toEqual({ type: "practice" });
    expect(globalKeyAction(p, true)).toEqual({ type: "go", href: "/progress" });
    expect(globalKeyAction(key("KeyP", "P", { shiftKey: true }), true)).toBeNull();
  });
});

describe("«Клавиши» overlay", () => {
  const groups = SHORTCUT_COLUMNS.flat();

  it("lists every G target under «Везде»", () => {
    const all = groups.find((g) => g.id === "all")!;
    for (const code of Object.keys(GO_TARGETS)) {
      const letter = code.replace("Key", "");
      expect(all.rows.some((r) => r.keys[0] === "G" && r.keys[2] === letter), `G → ${letter}`).toBe(true);
    }
    expect(all.rows.find((r) => r.label === "Упражнения")?.keys).toEqual(["G", { then: true }, "E"]);
  });

  it("has the «Упражнения» group (DESKTOP-SPEC §4)", () => {
    const ex = groups.find((g) => g.id === "exercises");
    expect(ex?.title).toBe("Упражнения");
    expect(ex?.rows.map((r) => r.keys)).toEqual([["J", "K"], ["1", "2", "3", "4"], ["0"], ["Enter"], ["Escape"]]);
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
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
