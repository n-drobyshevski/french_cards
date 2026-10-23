import { describe, expect, it } from "vitest";
import { DEFAULT_EXERCISE_FOCUS, focusMinItems, focusSummary, matchesFocus, parseExerciseFocus } from "./exercise-focus";

describe("exercise focus helpers", () => {
  it("parses a stored value, falling back per field", () => {
    expect(parseExerciseFocus({ target: "both", share: "most" })).toEqual({ target: "both", share: "most" });
    expect(parseExerciseFocus({ target: "due" })).toEqual({ target: "due", share: "half" });
    expect(parseExerciseFocus({ target: "nope", share: "some" })).toEqual({ target: "normal", share: "some" });
    expect(parseExerciseFocus(null)).toEqual(DEFAULT_EXERCISE_FOCUS);
    expect(parseExerciseFocus(undefined)).toEqual(DEFAULT_EXERCISE_FOCUS);
    expect(parseExerciseFocus("difficult")).toEqual(DEFAULT_EXERCISE_FOCUS);
  });

  it("gives the least number of focus questions, rounded up; none when off", () => {
    expect(focusMinItems({ target: "difficult", share: "some" }, 12)).toBe(3);
    expect(focusMinItems({ target: "due", share: "half" }, 12)).toBe(6);
    expect(focusMinItems({ target: "both", share: "most" }, 12)).toBe(10);
    expect(focusMinItems({ target: "both", share: "half" }, 7)).toBe(4);
    expect(focusMinItems({ target: "normal", share: "most" }, 12)).toBe(0);
  });

  it("matches words by target", () => {
    const hard = { difficult: true, due: false };
    const due = { difficult: false, due: true };
    const neither = { difficult: false, due: false };
    expect([hard, due, neither].map((w) => matchesFocus("difficult", w))).toEqual([true, false, false]);
    expect([hard, due, neither].map((w) => matchesFocus("due", w))).toEqual([false, true, false]);
    expect([hard, due, neither].map((w) => matchesFocus("both", w))).toEqual([true, true, false]);
    expect([hard, due, neither].map((w) => matchesFocus("normal", w))).toEqual([false, false, false]);
  });

  it("summarises in one line", () => {
    expect(focusSummary({ target: "normal", share: "half" })).toBeNull();
    expect(focusSummary({ target: "difficult", share: "half" })).toBe("Чаще трудные · половина набора");
    expect(focusSummary({ target: "both", share: "most" })).toBe("Чаще трудные и к повторению · почти весь набор");
  });
});
