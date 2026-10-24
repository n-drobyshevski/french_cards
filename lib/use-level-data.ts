// «Уровень языка» on the device: the level resolver (lib/core/level.ts) over the FLELex file and the
// Lexique list, both fetched once per session and precached by the service worker.
import { useEffect, useState } from "react";
import { createLevelResolver, type LevelResolver } from "./core/level";
import { loadedLevelData, loadLevelData } from "./lexique";

/** Stored levels only, until the files are in. */
const STORED_ONLY: LevelResolver = createLevelResolver(null, null, false);

/**
 * The resolver: `level(word)` and `freq(word)`. Until the files load (or when they cannot be
 * fetched) only stored levels show and `ready` is false; the component re-renders once they are in.
 */
export function useLevelData(): LevelResolver {
  const [resolver, setResolver] = useState<LevelResolver>(() => loadedLevelData() ?? STORED_ONLY);
  useEffect(() => {
    if (resolver.ready) return;
    let live = true;
    void loadLevelData().then((next) => {
      if (live) setResolver(next);
    });
    return () => {
      live = false;
    };
  }, [resolver.ready]);
  return resolver;
}
