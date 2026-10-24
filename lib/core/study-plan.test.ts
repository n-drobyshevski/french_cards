import { describe, expect, it } from "vitest";
import {
  DEFAULT_STUDY_PLAN,
  LEGACY_STUDY_PLAN,
  migrateStudyPlan,
  parseStudyPlan,
  sameStudyPlan,
  studyPlanSummary,
  type StudyPlan,
} from "./study-plan";

describe("«План повторения» (study_plan)", () => {
  it("defaults: 10 words, cap 200, by level, mixed, RU→FR once FR→RU holds", () => {
    expect(DEFAULT_STUDY_PLAN).toEqual({ new_words: 10, review_cap: 200, new_order: "level", mix: "mixed", ru_fr: "after" });
    expect(LEGACY_STUDY_PLAN).toEqual({ review_cap: null, new_order: "added", mix: "after", ru_fr: "together" });
  });

  it("migrates the device's cards a day to words: ceil(n/2), 1–30", () => {
    expect([15, 20, 1, 0, 2, 3, 100].map((n) => migrateStudyPlan(n).new_words)).toEqual([8, 10, 1, 1, 1, 2, 30]);
    expect(migrateStudyPlan(15)).toEqual({ ...DEFAULT_STUDY_PLAN, new_words: 8 });
    expect(migrateStudyPlan(Number.NaN).new_words).toBe(8);
  });

  it("parses a stored value safely: clamps numbers, unknown values fall back field by field", () => {
    expect(parseStudyPlan(undefined)).toEqual(DEFAULT_STUDY_PLAN);
    expect(parseStudyPlan("junk")).toEqual(DEFAULT_STUDY_PLAN);
    expect(parseStudyPlan({ new_words: 45.6, review_cap: 10, new_order: "weird", mix: "after", ru_fr: "together" })).toEqual({
      new_words: 30,
      review_cap: 50,
      new_order: "level",
      mix: "after",
      ru_fr: "together",
    });
    expect(parseStudyPlan({ new_words: -3, review_cap: 5000 })).toMatchObject({ new_words: 0, review_cap: 999 });
    expect(parseStudyPlan({ review_cap: null }).review_cap).toBeNull();
    const fallback: StudyPlan = { ...DEFAULT_STUDY_PLAN, new_words: 8 };
    expect(parseStudyPlan({ mix: "after" }, fallback)).toEqual({ ...fallback, mix: "after" });
  });

  it("compares plans and sums one up", () => {
    expect(sameStudyPlan(DEFAULT_STUDY_PLAN, { ...DEFAULT_STUDY_PLAN })).toBe(true);
    expect(sameStudyPlan(DEFAULT_STUDY_PLAN, { ...DEFAULT_STUDY_PLAN, review_cap: null })).toBe(false);
    expect(studyPlanSummary(DEFAULT_STUDY_PLAN)).toBe("10 слов в день · до 200 повторений");
    expect(studyPlanSummary({ ...DEFAULT_STUDY_PLAN, new_words: 1, review_cap: null })).toBe("1 слово в день · без лимита повторений");
    expect(studyPlanSummary({ ...DEFAULT_STUDY_PLAN, new_words: 3 })).toBe("3 слова в день · до 200 повторений");
  });
});
