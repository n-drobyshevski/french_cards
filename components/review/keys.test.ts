import { describe, expect, it } from "vitest";
import { isInteractiveTarget, isTypingTarget, keepsActivationKeys, reviewKeyAction, type KeyLike } from "./keys";

const key = (k: string, code: string, extra: Partial<KeyLike> = {}): KeyLike => ({ key: k, code, ...extra });
const front = { revealed: false, gradeButtons: 3 as const };
const back = { revealed: true, gradeButtons: 3 as const };
const back2 = { revealed: true, gradeButtons: 2 as const };

describe("reviewKeyAction", () => {
  it("flips with Space or Enter on the question side only", () => {
    expect(reviewKeyAction(key(" ", "Space"), front)).toEqual({ type: "flip" });
    expect(reviewKeyAction(key("Enter", "Enter"), front)).toEqual({ type: "flip" });
    expect(reviewKeyAction(key(" ", "Space"), back)).toBeNull();
  });

  it("grades 1/2/3 on the answer side", () => {
    expect(reviewKeyAction(key("1", "Digit1"), back)).toEqual({ type: "grade", rating: 1 });
    expect(reviewKeyAction(key("2", "Digit2"), back)).toEqual({ type: "grade", rating: 2 });
    expect(reviewKeyAction(key("3", "Numpad3"), back)).toEqual({ type: "grade", rating: 3 });
    expect(reviewKeyAction(key("4", "Digit4"), back)).toBeNull();
    expect(reviewKeyAction(key("1", "Digit1"), front)).toBeNull();
  });

  it("maps 2 and 3 to «Знаю» in two-button mode", () => {
    expect(reviewKeyAction(key("1", "Digit1"), back2)).toEqual({ type: "grade", rating: 1 });
    expect(reviewKeyAction(key("2", "Digit2"), back2)).toEqual({ type: "grade", rating: 3 });
    expect(reviewKeyAction(key("3", "Digit3"), back2)).toEqual({ type: "grade", rating: 3 });
  });

  it("uses arrows like the swipe", () => {
    expect(reviewKeyAction(key("ArrowLeft", "ArrowLeft"), back)).toEqual({ type: "grade", rating: 1 });
    expect(reviewKeyAction(key("ArrowRight", "ArrowRight"), back)).toEqual({ type: "grade", rating: 3 });
  });

  it("undoes with Z on any layout", () => {
    expect(reviewKeyAction(key("z", "KeyZ"), front)).toEqual({ type: "undo" });
    expect(reviewKeyAction(key("я", "KeyZ"), back)).toEqual({ type: "undo" });
  });

  it("ignores modified and repeated keys", () => {
    expect(reviewKeyAction(key("z", "KeyZ", { metaKey: true }), back)).toBeNull();
    expect(reviewKeyAction(key("1", "Digit1", { ctrlKey: true }), back)).toBeNull();
    expect(reviewKeyAction(key(" ", "Space", { repeat: true }), front)).toBeNull();
  });
});

describe("targets", () => {
  it("detects text fields", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "textarea" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", getAttribute: () => "textbox" })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON", getAttribute: () => null })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("detects controls that handle Space/Enter themselves", () => {
    expect(isInteractiveTarget({ closest: (s: string) => (s.includes("button") ? {} : null) })).toBe(true);
    expect(isInteractiveTarget({ closest: () => null })).toBe(false);
    expect(isInteractiveTarget({})).toBe(false);
  });

  it("lets keyboard-focused controls keep Space/Enter, but not ones focused by a click", () => {
    const button = { closest: () => ({}) };
    expect(keepsActivationKeys(button, false)).toBe(true);
    expect(keepsActivationKeys(button, true)).toBe(false);
    expect(keepsActivationKeys({ closest: () => null }, false)).toBe(false);
  });
});
