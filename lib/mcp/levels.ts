// «Уровень языка» on the server: the same resolver the app builds on the device (lib/core/level.ts
// over the FLELex file and the Lexique list), from the files bundled into the route the way
// tools.ts bundles fr-conj.json. Built once per server instance, on first use.
import { createCefrData, createLevelResolver, type Cefr, type LevelResolver } from "@/lib/core/level";
import { createLexique, type Lexique, type LexiqueEntry } from "@/lib/lexique";
import cefrFile from "@/public/lexique/fr-cefr.json";
import lemmas from "@/public/lexique/fr-lemmas.json";

let resolver: LevelResolver | null = null;
let lexique: Lexique | null = null;

export function serverLevels(): LevelResolver {
  if (!resolver) {
    lexique = createLexique(lemmas as unknown as LexiqueEntry[], { prefolded: true });
    const lex = lexique;
    resolver = createLevelResolver(createCefrData(cefrFile), (key, pos) => lex.lookup(key, pos));
  }
  return resolver;
}

/**
 * The level of one word of a French sentence, only when it is a lemma as written (Lexique's
 * entry, accents included): «nonobstant» → C2, but «galéré» or «trouvé» (a participle that folds
 * onto another lemma) → null. So inflected forms are skipped rather than misread.
 */
export function lemmaLevel(token: string): Cefr | null {
  const levels = serverLevels();
  const hit = lexique!.lookup(token);
  if (!hit || hit.lemma.normalize("NFC").toLowerCase() !== token.normalize("NFC").toLowerCase()) return null;
  return levels.level({ fr: token, pos: hit.pos, slang_level: 0, verlan: false })?.level ?? null;
}
