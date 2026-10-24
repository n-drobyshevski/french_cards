// «Уровень языка» on the server: the same resolver the app builds on the device (lib/core/level.ts
// over the FLELex file and the Lexique list), from the files bundled into the route the way
// tools.ts bundles fr-conj.json. Built once per server instance, on first use.
import { createCefrData, createLevelResolver, type LevelResolver } from "@/lib/core/level";
import { createLexique, type LexiqueEntry } from "@/lib/lexique";
import cefrFile from "@/public/lexique/fr-cefr.json";
import lemmas from "@/public/lexique/fr-lemmas.json";

let resolver: LevelResolver | null = null;

export function serverLevels(): LevelResolver {
  if (!resolver) {
    const lexique = createLexique(lemmas as unknown as LexiqueEntry[], { prefolded: true });
    resolver = createLevelResolver(createCefrData(cefrFile), (key, pos) => lexique.lookup(key, pos));
  }
  return resolver;
}
