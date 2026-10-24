import { describe, expect, it } from "vitest";
import type { LevelInfo } from "@/lib/core/level";
import { levelAria, levelChipLabel, levelCounts, levelHint, levelRank, levelText, matchesLevel, toggleLevelKey } from "./level";

const flelex: LevelInfo = { level: "B1", source: "flelex", estimated: true };
const freq: LevelInfo = { level: "C1", source: "freq", estimated: true };
const chat: LevelInfo = { level: "A2", source: "chat", estimated: true };
const user: LevelInfo = { level: "A1", source: "user", estimated: false };

describe("«Уровень языка» copy", () => {
  it("marks every level the user did not pick with «≈»", () => {
    expect([flelex, freq, chat, user, null].map(levelText)).toEqual(["≈B1", "≈C1", "≈A2", "A1", "—"]);
  });

  it("names the source for screen readers", () => {
    expect(levelAria(flelex)).toBe("Уровень языка: примерно B1, оценка");
    expect(levelAria(chat)).toBe("Уровень языка: примерно A2, от Claude");
    expect(levelAria({ ...chat, source: "ai" })).toBe("Уровень языка: примерно A2, от Claude");
    expect(levelAria(user)).toBe("Уровень языка: A1, вы указали");
    expect(levelAria(null)).toBe("Уровень языка: без уровня");
  });

  it("gives the hint for estimates only", () => {
    expect(levelHint(flelex)).toBe("≈ B1 — оценка по словарю FLELex, точна примерно в половине случаев.");
    expect(levelHint(freq)).toMatch(/по частотности/);
    expect(levelHint(user)).toBeNull();
    expect(levelHint(null)).toBeNull();
  });
});

describe("«Уровень языка» filter and order", () => {
  it("ORs the chosen keys, «без уровня» included; nothing chosen = any", () => {
    expect(matchesLevel(flelex, [])).toBe(true);
    expect(matchesLevel(flelex, ["B1", "B2"])).toBe(true);
    expect(matchesLevel(null, ["B1"])).toBe(false);
    expect(matchesLevel(null, ["none"])).toBe(true);
  });

  it("keeps the keys in display order and names the strip item", () => {
    expect(toggleLevelKey(["none"], "A2")).toEqual(["A2", "none"]);
    expect(toggleLevelKey(["A2", "none"], "A2")).toEqual(["none"]);
    expect(levelChipLabel([])).toBe("Уровень языка");
    expect(levelChipLabel(["B1", "B2"])).toBe("Уровень языка: B1, B2");
    expect(levelChipLabel(["A1", "B1", "none"])).toBe("Уровень языка: 3");
  });

  it("counts per key and ranks A1 → C2, no level last", () => {
    expect(levelCounts([flelex, flelex, user, null])).toEqual({ A1: 1, A2: 0, B1: 2, B2: 0, C1: 0, C2: 0, none: 1 });
    expect([null, freq, user, flelex].sort((a, b) => levelRank(a) - levelRank(b))).toEqual([user, flelex, freq, null]);
  });
});
