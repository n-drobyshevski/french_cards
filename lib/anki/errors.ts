// Why an Anki file could not be read; `message` is shown to the user as is.
import { ANKI_MAX_FILE_BYTES } from "./types";

export type AnkiReadErrorCode = "too_big" | "not_anki" | "empty" | "old_format" | "broken";

const MESSAGES: Record<AnkiReadErrorCode, string> = {
  too_big: `Файл больше ${Math.round(ANKI_MAX_FILE_BYTES / (1024 * 1024))} МБ — такой на телефоне не открыть. Экспортируйте колоду без медиафайлов.`,
  not_anki: "Это не колода Anki. Подойдёт файл .apkg или .colpkg либо текстовый экспорт (.txt, .csv).",
  empty: "В файле нет карточек.",
  old_format:
    "Колода сохранена в слишком новом формате. Экспортируйте её в Anki ещё раз с галочкой «Поддержка старых версий Anki» (Support older Anki versions).",
  broken: "Не получилось прочитать файл: он повреждён или скачан не полностью.",
};

export class AnkiReadError extends Error {
  readonly code: AnkiReadErrorCode;

  constructor(code: AnkiReadErrorCode, message: string = MESSAGES[code], options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AnkiReadError";
    this.code = code;
  }
}
