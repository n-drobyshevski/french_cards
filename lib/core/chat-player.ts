// «Упражнения в чате»: the contract between the connector and the exercise player it shows inside a
// Claude chat (an MCP App, `ui://` resource; spec io.modelcontextprotocol/ui 2026-01-26) or hands
// over as a standalone HTML artifact. The player is built from the app's own pure rules
// (lib/core/exercises.ts, components/exercises/player-state.ts) by scripts/build-chat-player.mjs,
// so a set plays in the chat exactly as in the app. Nothing here touches Dexie, React or the network.
import type { Cefr } from "./level";
import type { ExerciseAnswer, ExerciseItem, ExerciseNewWord, ExerciseScope } from "../types";

/** The player's UI resource; play_exercises points at it with `_meta.ui.resourceUri`. */
export const CHAT_PLAYER_URI = "ui://kartochki/exercise-player.html";
/** MCP Apps' HTML resource type. */
export const MCP_APP_MIME = "text/html;profile=mcp-app";
/** The tool the player calls (MCP App `tools/call`, or Claude with a pasted result) to save a set and its run. */
export const SAVE_RESULT_TOOL = "save_exercise_result";
/** Where the artifact template takes its set: replaced by the set's JSON (`fillArtifact`). */
export const ARTIFACT_SET_SLOT = "/*__KARTOCHKI_SET__*/null";
/** The line an artifact copies for Claude («Скопировать результат»): this prefix, then the JSON of a ChatRunResult. */
export const RUN_LINE_PREFIX = "KARTOCHKI_RUN ";

/** The set as the player gets it: play_exercises' `structuredContent`, or the artifact's embedded JSON. */
export interface ChatPlayerSet {
  kind: "kartochki-exercise-set";
  version: 1;
  /** Claude's handle for the set; saving uses it, so a second save is the same set (x- + sha256). */
  client_ref: string;
  /** The app's id for this set (exerciseSetId(client_ref), or the stored set's id). */
  set_id: string;
  title: string;
  topic: string | null;
  /** Theme ids, "inbox" for «Входящие». */
  folders: string[];
  scope: ExerciseScope | null;
  levels: Cefr[];
  level_auto: boolean;
  /** Completed items (word snapshots, options, tiles), as the app stores them; `register` never. */
  items: ExerciseItem[];
  new_words: ExerciseNewWord[];
  /** Already in the app's «Упражнения» (played from there, or saved before): saving adds only the run. */
  saved: boolean;
}

/** One finished (or left) round in the chat, as the player reports it. */
export interface ChatRunResult {
  client_ref: string;
  started_at: string;
  finished_at: string | null;
  answers: ExerciseAnswer[];
}

/** The artifact's «Скопировать результат» line. */
export function runLine(result: ChatRunResult): string {
  return RUN_LINE_PREFIX + JSON.stringify(result);
}

/** A pasted result line back to a ChatRunResult; null when it isn't one. */
export function parseRunLine(text: string): ChatRunResult | null {
  const at = text.indexOf(RUN_LINE_PREFIX);
  if (at < 0) return null;
  try {
    const value = JSON.parse(text.slice(at + RUN_LINE_PREFIX.length).trim()) as Partial<ChatRunResult>;
    if (typeof value.client_ref !== "string" || typeof value.started_at !== "string" || !Array.isArray(value.answers)) return null;
    return { client_ref: value.client_ref, started_at: value.started_at, finished_at: typeof value.finished_at === "string" ? value.finished_at : null, answers: value.answers };
  } catch {
    return null;
  }
}

/** The artifact template with a set in its slot; `<` is escaped so the JSON can never close the script. */
export function fillArtifact(template: string, set: ChatPlayerSet): string {
  if (!template.includes(ARTIFACT_SET_SLOT)) throw new Error("chat player template has no set slot");
  return template.replace(ARTIFACT_SET_SLOT, () => JSON.stringify(set).replace(/</g, "\\u003c"));
}
