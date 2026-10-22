"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readAnkiFile } from "@/lib/anki/apkg";
import { enrichAnkiNotes } from "@/lib/anki/enrich";
import type { AnkiDeck, AnkiItem } from "@/lib/anki/types";
import { listFolders } from "@/lib/folders";
import { getSettings } from "@/lib/settings";
import { findDuplicates } from "@/lib/text";
import { foldersForExtract } from "@/lib/use-extract";
import { candidateTerms, knownNotes, selectNotes } from "./anki-plan";

/** idle → reading → setup → enriching → done; «Стоп» → stopped; a failure → error (retry keeps the deck). */
export type AnkiPhase = "idle" | "reading" | "setup" | "enriching" | "done" | "stopped" | "error";

export interface AnkiImportState {
  phase: AnkiPhase;
  fileName: string | null;
  deck: AnkiDeck | null;
  /** Notes whose word the library already has. */
  known: ReadonlySet<string>;
  /** Chosen deck ids. */
  chosen: ReadonlySet<string>;
  /** «Перенести прогресс из Anki». */
  carry: boolean;
  done: number;
  total: number;
  items: AnkiItem[];
  /** Seconds left of a rate-limit wait. */
  retryIn: number | null;
  error: string | null;
}

const EMPTY: ReadonlySet<string> = new Set();

const INITIAL: AnkiImportState = {
  phase: "idle",
  fileName: null,
  deck: null,
  known: EMPTY,
  chosen: EMPTY,
  carry: true,
  done: 0,
  total: 0,
  items: [],
  retryIn: null,
  error: null,
};

const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** The Anki import before the review list: read the deck, choose, enrich (stoppable, with a rate-limit countdown). */
export function useAnkiImport() {
  const [state, setState] = useState<AnkiImportState>(INITIAL);
  const abort = useRef<AbortController | null>(null);
  const run = useRef(0);
  // `start` reads the latest choice without re-creating itself on every toggle.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => () => abort.current?.abort(), []);

  const reset = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    run.current++;
    setState(INITIAL);
  }, []);

  const open = useCallback(async (file: File) => {
    abort.current?.abort();
    const id = ++run.current;
    setState({ ...INITIAL, phase: "reading", fileName: file.name });
    try {
      const deck = await readAnkiFile(file);
      const dups = await findDuplicates([...new Set(deck.notes.flatMap(candidateTerms))]);
      if (run.current !== id) return;
      setState((s) => ({
        ...s,
        phase: "setup",
        deck,
        known: knownNotes(deck.notes, dups),
        chosen: new Set(deck.decks.map((d) => d.id)),
        carry: deck.hasProgress,
      }));
    } catch (error) {
      if (run.current !== id) return;
      setState((s) => ({ ...s, phase: "error", deck: null, error: messageOf(error, "Не удалось прочитать колоду") }));
    }
  }, []);

  const toggleDeck = useCallback((deckId: string) => {
    setState((s) => {
      const chosen = new Set(s.chosen);
      if (!chosen.delete(deckId)) chosen.add(deckId);
      return { ...s, chosen };
    });
  }, []);

  const setCarry = useCallback((carry: boolean) => setState((s) => ({ ...s, carry })), []);

  const start = useCallback(async () => {
    const { deck, chosen, known } = stateRef.current;
    if (!deck) return;
    const { send } = selectNotes(deck, chosen, known);
    if (send.length === 0) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const id = ++run.current;
    const items: AnkiItem[] = [];
    setState((s) => ({ ...s, phase: "enriching", done: 0, total: send.length, items: [], retryIn: null, error: null }));
    try {
      const [folders, settings] = await Promise.all([listFolders(), getSettings()]);
      await enrichAnkiNotes(send, {
        folders: foldersForExtract(folders),
        model: settings.ai_model,
        signal: controller.signal,
        onItems: (batch) => {
          items.push(...batch);
          if (run.current === id) setState((s) => ({ ...s, items: [...items] }));
        },
        onProgress: (done, total) => {
          if (run.current === id) setState((s) => ({ ...s, done, total, retryIn: null }));
        },
        onRetry: (seconds) => {
          if (run.current === id) setState((s) => ({ ...s, retryIn: seconds }));
        },
      });
      if (run.current !== id) return;
      setState((s) => ({ ...s, phase: "done", items: [...items], retryIn: null }));
    } catch (error) {
      if (run.current !== id) return;
      if (controller.signal.aborted) {
        setState((s) => ({ ...s, phase: "stopped", items: [...items], retryIn: null }));
        return;
      }
      setState((s) => ({
        ...s,
        phase: "error",
        items: [...items],
        retryIn: null,
        error: messageOf(error, "Не удалось дополнить карточки"),
      }));
    }
  }, []);

  const stop = useCallback(() => abort.current?.abort(), []);

  return { state, open, toggleDeck, setCarry, start, stop, reset };
}
