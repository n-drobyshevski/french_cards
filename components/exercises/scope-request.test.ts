import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { OPEN_CLAUDE_LABEL, scopeCopyNotice, scopeRequest, SCOPE_COPIED, SCOPE_COPIED_OFFLINE } from "./scope-request";

describe("scope requests («Упражнение по трудным словам»)", () => {
  it("builds the request and the waiting summary, never with new words", () => {
    expect(scopeRequest("difficult")).toEqual({
      text: "Сделай упражнение в Карточках по трудным словам из всех тем, 12 вопросов.",
      summary: "трудные слова, 12 вопросов",
    });
    expect(scopeRequest("due", 8).text).toBe("Сделай упражнение в Карточках по словам к повторению из всех тем, 8 вопросов.");
    expect(scopeRequest("both").text).toBe("Сделай упражнение в Карточках по трудным словам и словам к повторению из всех тем, 12 вопросов.");
  });

  it("the snackbar offers «Открыть Claude ↗» online only", () => {
    const online = scopeCopyNotice(true, true);
    expect(online.message).toBe(SCOPE_COPIED);
    expect(online.actionLabel).toBe(OPEN_CLAUDE_LABEL);
    expect(typeof online.onAction).toBe("function");
    expect(scopeCopyNotice(true, false)).toEqual({ message: SCOPE_COPIED_OFFLINE });
    expect(scopeCopyNotice(false, true)).toEqual({ message: "Не получилось скопировать" });
  });
});
