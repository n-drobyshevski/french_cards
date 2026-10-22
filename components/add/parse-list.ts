// «Список»: turns pasted text, one "fr — ru" pair per line, into rows for bulk adding.

export const LIST_MAX_LINES = 200;

export interface ParsedLine {
  /** 1-based line number in the pasted text. */
  line: number;
  fr: string;
  ru: string;
  /** Why the row cannot be added as is. */
  problem: "no_translation" | "no_french" | null;
}

const BULLET = /^(?:[-–—•*·▪●◦]\s+|\d{1,3}[.)]\s+)/;
const CYRILLIC = /[Ѐ-ӿ]/;

/**
 * Separators, most specific first; the line is split at the first match of the first kind
 * that occurs. A bare hyphen is not a separator (casse-croûte, dépêche-toi) unless spaced.
 */
const SEPARATORS: readonly RegExp[] = [
  /\t+/,
  /\s*(?:->|=>|→)\s*/,
  /\s*[—–]\s*/,
  /\s+-{1,2}\s+/,
  /\s*=\s*/,
  /\s*\|\s*/,
  /\s*:\s+/,
  /\s*;\s*/,
];

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function split(text: string): [string, string] | null {
  for (const re of SEPARATORS) {
    const m = re.exec(text);
    if (m && m.index > 0) return [text.slice(0, m.index), text.slice(m.index + m[0].length)];
  }
  // "la thune бабки": Latin words followed by Cyrillic ones.
  const m = /^([^Ѐ-ӿ]*[^\sЀ-ӿ])\s+([Ѐ-ӿ].*)$/.exec(text);
  return m ? [m[1], m[2]] : null;
}

/** Parses pasted lines; blank lines are skipped, bullets/numbering stripped, "ru — fr" swapped. */
export function parseWordList(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length && out.length < LIST_MAX_LINES; i++) {
    const raw = clean(lines[i]).replace(BULLET, "");
    if (!raw) continue;
    const parts = split(raw);
    let fr = clean(parts ? parts[0] : raw);
    let ru = clean(parts ? parts[1] : "");
    if (CYRILLIC.test(fr) && ru && !CYRILLIC.test(ru)) [fr, ru] = [ru, fr];
    if (!parts && CYRILLIC.test(fr)) [fr, ru] = ["", fr];
    out.push({ line: i + 1, fr, ru, problem: !fr ? "no_french" : !ru ? "no_translation" : null });
  }
  return out;
}
