"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loadDuplicate } from "@/components/add/data";
import { useUndoSnackbar } from "@/components/library/undo";
import { WordDetailSheet } from "@/components/library/WordDetailSheet";
import { useAddSheetActions } from "@/components/providers/AddSheetContext";
import { FOCUS_SEARCH_EVENT } from "@/components/shell/keys";
import { Header } from "@/components/ui/Header";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import type { LookupResponse } from "@/lib/ai/schemas";
import { cleanQuery, clearHistory, deleteLookup, useContextSearch, useLookupHistory, type ContextSearchState } from "@/lib/context";
import { db, type LookupEntry } from "@/lib/db";
import { ExampleError, requestExample } from "@/lib/examples";
import { getSettings } from "@/lib/settings";
import { useLayoutClass } from "@/lib/use-media";
import { useOnline } from "@/lib/use-online";
import {
  contextHref,
  filterByMeaning,
  hasExample,
  meaningChips,
  nExamples,
  prefillFromLookup,
  prefillFromSynonym,
  synonymColumns,
  translationLine,
} from "./data";
import { ExampleSheet } from "./ExampleSheet";
import {
  ConjugationAside,
  ConjugationSection,
  ExampleItem,
  ExamplesEmpty,
  ExamplesHalt,
  ExamplesWait,
  ExampleTableRow,
  HistoryList,
  LookupError,
  LookupWait,
  MeaningChips,
  MetaLine,
  NoExampleChips,
  NotFound,
  SearchField,
  SectionHead,
  SynonymList,
  SynonymScale,
  Translations,
  WordStatus,
  type ShownExample,
} from "./parts";

// «Контекст» (mockups B-Dossier with A's chips, S-*, E-Tab, D-Context): a word looked up the way
// Reverso Context does it. The query lives in the URL (/context?q=kiffer); a new query is pushed
// with history.pushState, so Back steps through the queries and a reopened one never waits on the
// server (it comes from the device-local history, offline too).

const HISTORY_ROWS = 20;
const NO_EXAMPLE_CHIPS = 6;

/** Reads ?q= (needs the page's Suspense). */
export function ContextScreen() {
  const params = useSearchParams();
  return <ContextView q={cleanQuery(params.get("q") ?? "")} />;
}

interface Invented {
  q: string;
  example: ShownExample;
}

function ContextView({ q }: { q: string }) {
  const wide = useLayoutClass() !== "compact";
  const online = useOnline();
  const addSheet = useAddSheetActions();
  const showUndo = useUndoSnackbar();
  const { state, search, stop, retry, refresh, reset } = useContextSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  // The field and the per-query choices follow the URL.
  const [input, setInput] = useState(q);
  const [meaning, setMeaning] = useState<string | null>(null);
  const [shownQ, setShownQ] = useState(q);
  if (q !== shownQ) {
    setShownQ(q);
    setInput(q);
    setMeaning(null);
  }
  const [invented, setInvented] = useState<Invented | null>(null);
  const [inventing, setInventing] = useState(false);
  const [inventError, setInventError] = useState<string | null>(null);
  const [sheetExample, setSheetExample] = useState<ShownExample | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    if (q) search(q);
    else reset();
  }, [q, search, reset]);

  // Desktop `/` focuses this field instead of the library search.
  useEffect(() => {
    const onFocus = (e: Event) => {
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, onFocus);
  }, []);

  const go = (raw: string) => {
    const next = cleanQuery(raw);
    if (!next) return;
    if (next === q) {
      search(next);
      return;
    }
    window.history.pushState(null, "", contextHref(next));
    window.scrollTo({ top: 0 });
  };

  const lookup = state.q === q && state.lookup?.found ? state.lookup : null;
  const saved = useLiveQuery(async () => (lookup ? await loadDuplicate(lookup.fr) : null), [lookup?.fr]);
  const history = useLookupHistory(HISTORY_ROWS);
  const noExample = useLiveQuery(
    () =>
      db.words
        .orderBy("created_at")
        .reverse()
        .filter((w) => w.deleted_at === null && !(w.example_fr ?? "").trim())
        .limit(NO_EXAMPLE_CHIPS)
        .toArray(),
    [],
  );

  const openAdd = (draft: Parameters<typeof prefillFromLookup>[1] = null) => {
    if (lookup) addSheet.open({ draft: prefillFromLookup(lookup, draft) });
  };

  const invent = async () => {
    if (!lookup || inventing) return;
    setInventing(true);
    setInventError(null);
    try {
      const { ai_model } = await getSettings();
      const found = await requestExample({ fr: lookup.fr, ru: translationLine(lookup.translations), note: lookup.note }, [], { model: ai_model });
      setInvented({
        q,
        example: { fr: found.fr, ru: found.ru ?? "", hit: lookup.fr, meaning: null, kind: "other", url: "", domain: "", title: null, invented: true },
      });
    } catch (e) {
      setInventError(e instanceof ExampleError ? e.message : "Не получилось подобрать пример");
    } finally {
      setInventing(false);
    }
  };

  const clear = async () => {
    const rows = await db.lookups.toArray();
    await clearHistory();
    showUndo({ message: "История очищена", undo: () => void db.lookups.bulkPut(rows) });
  };

  const remove = async (entry: LookupEntry) => {
    await deleteLookup(entry.key);
    const name = entry.lookup.found ? entry.lookup.fr : entry.q;
    // The row keeps its `at`, so «Отменить» puts it back in its place.
    showUndo({ message: `«${name}» убрано из истории`, undo: () => void db.lookups.put(entry) });
  };

  const field = (
    <SearchField value={input} onChange={setInput} onSubmit={go} online={online} inputRef={inputRef} strong={!q} wide={wide} />
  );

  const home = (
    <>
      {history && history.length > 0 && <HistoryList rows={history} onOpen={go} onDelete={(r) => void remove(r)} onClear={() => void clear()} wide={wide} />}
      {online && <NoExampleChips words={noExample ?? []} onOpen={go} />}
    </>
  );

  const results = q ? (
    <Results
      q={q}
      state={state}
      wide={wide}
      online={online}
      saved={saved}
      meaning={meaning}
      onMeaning={setMeaning}
      invented={invented?.q === q ? invented.example : null}
      inventing={inventing}
      inventError={inventError}
      onInvent={() => void invent()}
      onGo={go}
      onAddWord={() => openAdd()}
      onAddSynonym={(s) => addSheet.open({ draft: prefillFromSynonym(s) })}
      onOpenSaved={() => saved && setDetailId(saved.word.id)}
      onOpenExample={setSheetExample}
      onStop={stop}
      onRetry={retry}
      onRefresh={refresh}
    />
  ) : null;

  const layers = (
    <>
      <ExampleSheet
        example={sheetExample}
        word={saved?.word ?? null}
        wide={wide}
        onClose={() => setSheetExample(null)}
        onAddWord={(ex) => {
          setSheetExample(null);
          openAdd({ fr: ex.fr, ru: ex.ru || null });
        }}
      />
      <WordDetailSheet wordId={detailId} onClose={() => setDetailId(null)} />
    </>
  );

  if (wide) {
    return (
      <main data-wide="" className="flex flex-1 flex-col px-6 pt-8 pb-12 xl:px-10">
        <div className="flex w-full max-w-[1000px] flex-col">
          {!q && <Intro wide />}
          <div className={cx(!q && "mt-6 max-w-[640px]")}>{field}</div>
          {q ? results : <div className="max-w-[640px]">{home}</div>}
        </div>
        {layers}
      </main>
    );
  }

  return (
    <>
      {q && <Header eyebrow="Контекст" fallbackHref="/context" />}
      <main className={cx("flex flex-1 flex-col px-4 pb-10", q ? "pt-1" : "pt-5")}>
        {!q && <Intro />}
        <div className={cx(!q && "mt-4")}>{field}</div>
        {q ? results : home}
      </main>
      {layers}
    </>
  );
}

function Intro({ wide = false }: { wide?: boolean }) {
  return (
    <div>
      <h1 className={cx("m-0 font-serif font-medium tracking-[-0.015em]", wide ? "text-[28px] leading-9" : "text-[32px] leading-10")}>Контекст</h1>
      <p className="m-0 mt-0.5 text-[14px] leading-5 text-muted">Как слово звучит в живой речи — примеры из веба, синонимы, спряжение.</p>
    </div>
  );
}

interface ResultsProps {
  q: string;
  state: ContextSearchState;
  wide: boolean;
  online: boolean;
  saved: Awaited<ReturnType<typeof loadDuplicate>> | undefined;
  meaning: string | null;
  onMeaning: (meaning: string | null) => void;
  invented: ShownExample | null;
  inventing: boolean;
  inventError: string | null;
  onInvent: () => void;
  onGo: (q: string) => void;
  onAddWord: () => void;
  onAddSynonym: (s: { fr: string; ru: string; slang_level: LookupResponse["slang_level"] }) => void;
  onOpenSaved: () => void;
  onOpenExample: (example: ShownExample) => void;
  onStop: () => void;
  onRetry: () => void;
  onRefresh: () => void;
}

function Results(props: ResultsProps) {
  const { q, state, wide, online, saved } = props;
  // A state from the previous query never shows under the new one.
  const current = state.q === q;
  if (!current || state.lookupPhase === "loading" || state.lookupPhase === "idle") return <LookupWait retryIn={current ? state.retryIn : null} wide={wide} />;
  if (state.lookupPhase === "error" || !state.lookup) return <LookupError error={state.error} online={online} onRetry={props.onRetry} />;
  const lookup = state.lookup;
  if (!lookup.found) return <NotFound q={q} />;

  const web = state.context?.examples ?? [];
  const examples: ShownExample[] = web.length === 0 && props.invented ? [props.invented] : web;
  const chips = meaningChips(lookup.translations, web);
  const shown = filterByMeaning(examples, props.meaning);
  const columns = synonymColumns({ fr: lookup.fr, ru: translationLine(lookup.translations, 1), slang_level: lookup.slang_level }, lookup.synonyms);
  const savedWord = saved ? { id: saved.word.id, folderName: saved.folderName } : saved;
  const inCard = (fr: string) => !!saved && hasExample(saved.word, fr);
  const phase = state.contextPhase;
  const hasSynonyms = lookup.synonyms.length > 0;

  const body = (() => {
    if (phase === "loading") return <ExamplesWait retryIn={state.retryIn} onStop={props.onStop} wide={wide} />;
    if (phase === "error") return <ExamplesHalt kind="error" error={state.error} online={online} onRetry={props.onRetry} />;
    if (phase === "stopped" || (phase === "idle" && !state.context)) return <ExamplesHalt kind="stopped" error={null} online={online} onRetry={props.onRetry} />;
    if (examples.length === 0) {
      return <ExamplesEmpty onInvent={props.onInvent} inventing={props.inventing} error={props.inventError} online={online} wide={wide} />;
    }
    const Row = wide ? ExampleTableRow : ExampleItem;
    return (
      <>
        <ul aria-label="Примеры" className="m-0 list-none p-0">
          {shown.map((e) => (
            <Row key={`${e.url}\u0001${e.fr}`} example={e} inCard={inCard(e.fr)} onOpen={() => props.onOpenExample(e)} />
          ))}
        </ul>
        {online && web.length > 0 && (
          <Button variant="tertiary" size="sm" className="mt-3 text-[14px]" onClick={props.onRefresh}>
            Искать заново
          </Button>
        )}
      </>
    );
  })();

  const countLine = phase === "done" && web.length > 0 ? `${nExamples(web.length)} из веба` : undefined;
  const chipRow = (className: string) =>
    (wide ? lookup.translations.length > 0 : web.length > 0 && chips.some((c) => c.count > 0)) && (
      <MeaningChips chips={chips} total={web.length} value={props.meaning} onChange={props.onMeaning} loading={phase !== "done" || web.length === 0} keepEmpty={wide} className={className} />
    );

  const conj = lookup.conjugation;

  if (wide) {
    return (
      <>
        <div className="mt-6 flex flex-wrap items-end gap-4 border-b-2 border-red pb-4">
          <div className="min-w-0 flex-[1_1_320px]">
            <h1 lang="fr" className="m-0 font-serif text-[44px] leading-[48px] font-medium tracking-[-0.015em]">
              {lookup.fr}
            </h1>
            <MetaLine lookup={lookup} />
          </div>
          {chipRow("flex-wrap")}
          <WordStatus saved={savedWord} onOpen={props.onOpenSaved} onAdd={props.onAddWord} wide />
        </div>
        <div className="mt-2 flex flex-wrap gap-10">
          <section aria-label="Примеры из веба" className="min-w-0 flex-[999_1_520px]">
            {countLine && <p className="meta m-0 mt-3">{countLine}</p>}
            {body}
          </section>
          <aside aria-label="Синонимы и спряжение" className="max-w-[360px] min-w-0 flex-[1_1_280px]">
            {hasSynonyms && <SynonymList columns={columns} onOpen={props.onGo} onAdd={props.onAddSynonym} />}
            {conj && <ConjugationAside conj={conj} />}
          </aside>
        </div>
      </>
    );
  }

  return (
    <>
      <article aria-label={`${lookup.fr}: перевод`} className="mt-4 overflow-hidden rounded-card border border-rule bg-surface px-4 pb-4">
        <div aria-hidden="true" className="-mx-4 h-0.5 bg-red" />
        <h1 lang="fr" className="m-0 mt-4 font-serif text-[40px] leading-[44px] font-medium tracking-[-0.015em] break-words">
          {lookup.fr}
        </h1>
        <MetaLine lookup={lookup} />
        <Translations lookup={lookup} />
        <WordStatus saved={savedWord} onOpen={props.onOpenSaved} onAdd={props.onAddWord} />
      </article>

      <section aria-labelledby="ctx-examples" aria-busy={phase === "loading" || undefined} className="mt-7">
        <SectionHead id="ctx-examples" title="Как говорят" aside={countLine} />
        {chipRow("-mx-4 overflow-x-auto px-4 pt-3 pb-1 [scrollbar-width:none]")}
        {body}
      </section>

      {hasSynonyms && <SynonymScale columns={columns} onOpen={props.onGo} onAdd={props.onAddSynonym} />}
      {conj && <ConjugationSection conj={conj} />}
    </>
  );
}
