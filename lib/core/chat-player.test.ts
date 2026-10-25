import { describe, expect, it } from "vitest";
import type { ExerciseItem } from "../types";
import {
  ARTIFACT_SET_SLOT,
  ARTIFACT_TITLE,
  asChatPlayerSet,
  fillArtifact,
  parseRunLine,
  playableItems,
  runLine,
  saveArguments,
  type ChatPlayerSet,
  type ChatRunResult,
} from "./chat-player";
import { CHAT_PLAYER_ARTIFACT, CHAT_PLAYER_HTML } from "../mcp/chat-player-html";

const item = (over: Partial<ExerciseItem>): ExerciseItem => ({
  id: "i", type: "choice", skill: null, ask: null, tense: null, person: null, word_id: null, new_ref: null,
  prompt: "?", sentence: null, sentence_ru: null, answer: "a", distractors: [], pairs: [], tiles: [], explain_ru: null, word: null,
  ...over,
});
const tile = (fr: string, ru: string) => ({ key: fr, fr, ru });

const set: ChatPlayerSet = {
  kind: "kartochki-exercise-set",
  version: 1,
  client_ref: "argot-1",
  set_id: "x-abc",
  title: "Argot </script> & co",
  topic: null,
  folders: [],
  scope: null,
  levels: [],
  level_auto: false,
  items: [item({ id: "q1" })],
  new_words: [],
  saved: false,
};

const run: ChatRunResult = { client_ref: "argot-1", started_at: "2026-10-25T10:00:00.000Z", finished_at: "2026-10-25T10:03:00.000Z", answers: [] };

describe("chat player contract", () => {
  it("plays only the types the app plays, with what each needs", () => {
    const items = [
      item({ id: "a" }),
      item({ id: "b", type: "register" }),
      item({ id: "c", type: "riddle" as ExerciseItem["type"] }),
      item({ id: "d", type: "cloze", answer: null }),
      item({ id: "e", type: "pairs", answer: null, tiles: [tile("meuf", "девушка")] }),
      item({ id: "f", type: "pairs", answer: null, tiles: [tile("meuf", "девушка"), tile("relou", "достающий")] }),
      item({ id: "g", type: "conjugate" }),
    ];
    expect(playableItems(items).map((i) => i.id)).toEqual(["a", "f", "g"]);
  });

  it("takes a set from structuredContent, filling what an older connector left out", () => {
    expect(asChatPlayerSet({ kind: "something-else", client_ref: "r", title: "t", items: [] })).toBeNull();
    expect(asChatPlayerSet(null)).toBeNull();
    const bare: Record<string, unknown> = { ...set };
    delete bare.set_id;
    delete bare.folders;
    delete bare.saved;
    expect(asChatPlayerSet(bare)).toMatchObject({ set_id: "", folders: [], saved: false, level_auto: false });
  });

  it("round-trips a result line, also from the middle of a pasted message", () => {
    expect(parseRunLine(`вот: ${runLine(run)}\n`)).toEqual(run);
    expect(parseRunLine(`${runLine(run)}\nсохрани, пожалуйста`)).toEqual(run);
    expect(parseRunLine(runLine({ ...run, finished_at: null }))?.finished_at).toBeNull();
    expect(parseRunLine("KARTOCHKI_RUN {not json")).toBeNull();
    expect(parseRunLine('KARTOCHKI_RUN {"client_ref":"r"}')).toBeNull();
    expect(parseRunLine("просто текст")).toBeNull();
  });

  it("sends the set without its envelope and the round to save_exercise_result", () => {
    const args = saveArguments(set, run);
    expect(args).not.toHaveProperty("kind");
    expect(args).toMatchObject({ client_ref: "argot-1", set_id: "x-abc", started_at: run.started_at, answers: [] });
  });

  it("puts the set into the artifact so it can never close the script, and names the page after it", () => {
    expect(CHAT_PLAYER_ARTIFACT.split(ARTIFACT_SET_SLOT)).toHaveLength(2);
    expect(CHAT_PLAYER_HTML).not.toContain(ARTIFACT_SET_SLOT);
    const page = fillArtifact(CHAT_PLAYER_ARTIFACT, set);
    expect(page).not.toContain(ARTIFACT_SET_SLOT);
    expect(page).not.toContain("</script> & co");
    expect(page).toContain("<title>Argot &lt;/script&gt; &amp; co</title>");
    expect(fillArtifact(CHAT_PLAYER_ARTIFACT, { ...set, title: "" })).toContain(`<title>${ARTIFACT_TITLE}</title>`);
    expect(() => fillArtifact("<html></html>", set)).toThrow(/slot/);
  });
});
