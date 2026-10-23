import { describe, expect, it } from "vitest";
import { exerciseKeyAction, type ExerciseKeyContext } from "./player-keys";

const key = (code: string, key = "", extra: Record<string, unknown> = {}) => ({ code, key, ...extra });
const q: ExerciseKeyContext = { phase: "question", options: 4 };

describe("exerciseKeyAction", () => {
  it("picks options 1–4 by code (any layout) and by key", () => {
    expect(exerciseKeyAction(key("Digit1", "1"), q)).toEqual({ type: "pick", index: 0 });
    expect(exerciseKeyAction(key("Numpad4", "4"), q)).toEqual({ type: "pick", index: 3 });
    // AZERTY: the digit row gives «&» without Shift, but the code is still Digit1.
    expect(exerciseKeyAction(key("Digit1", "&"), q)).toEqual({ type: "pick", index: 0 });
    expect(exerciseKeyAction(key("Digit5", "5"), q)).toBeNull();
    expect(exerciseKeyAction(key("Digit3", "3"), { phase: "question", options: 2 })).toBeNull();
  });

  it("maps 0 to «Не знаю», also on a pairs board", () => {
    expect(exerciseKeyAction(key("Digit0", "0"), q)).toEqual({ type: "dont-know" });
    expect(exerciseKeyAction(key("Numpad0", "0"), { phase: "question", options: 0 })).toEqual({ type: "dont-know" });
    expect(exerciseKeyAction(key("Digit1", "1"), { phase: "question", options: 0 })).toBeNull();
  });

  it("Enter goes on after the answer and on a new word's card; not while asked", () => {
    expect(exerciseKeyAction(key("Enter", "Enter"), q)).toBeNull();
    expect(exerciseKeyAction(key("Enter", "Enter"), { phase: "answered", options: 4 })).toEqual({ type: "next" });
    expect(exerciseKeyAction(key("NumpadEnter", "Enter"), { phase: "answered", options: 4 })).toEqual({ type: "next" });
    expect(exerciseKeyAction(key("Space", " "), { phase: "intro", options: 0 })).toEqual({ type: "next" });
    expect(exerciseKeyAction(key("Digit1", "1"), { phase: "answered", options: 4 })).toBeNull();
  });

  it("Esc leaves from every phase", () => {
    for (const phase of ["intro", "question", "answered", "done"] as const) {
      expect(exerciseKeyAction(key("Escape", "Escape"), { phase, options: 4 })).toEqual({ type: "leave" });
    }
  });

  it("C asks for the next set on the done screen, only with single-letter keys on", () => {
    expect(exerciseKeyAction(key("KeyC", "с"), { phase: "done", options: 0 })).toEqual({ type: "follow-up" });
    expect(exerciseKeyAction(key("KeyC", "c"), { phase: "done", options: 0, letters: false })).toBeNull();
    expect(exerciseKeyAction(key("KeyC", "C", { shiftKey: true }), { phase: "done", options: 0 })).toBeNull();
    expect(exerciseKeyAction(key("Digit1", "1"), { phase: "done", options: 0 })).toBeNull();
  });

  it("ignores modifiers, repeats and IME input", () => {
    expect(exerciseKeyAction(key("Digit1", "1", { metaKey: true }), q)).toBeNull();
    expect(exerciseKeyAction(key("Digit1", "1", { ctrlKey: true }), q)).toBeNull();
    expect(exerciseKeyAction(key("Digit1", "1", { altKey: true }), q)).toBeNull();
    expect(exerciseKeyAction(key("Digit1", "1", { repeat: true }), q)).toBeNull();
    expect(exerciseKeyAction(key("Digit1", "1", { isComposing: true }), q)).toBeNull();
    expect(exerciseKeyAction(key("Digit1", "Process", { keyCode: 229 }), q)).toBeNull();
    expect(exerciseKeyAction(key("Digit1", "!", { shiftKey: true }), q)).toBeNull();
  });
});
