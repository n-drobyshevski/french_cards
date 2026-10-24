"use client";

import { useLayoutEffect, useRef, type CSSProperties, type RefObject } from "react";
import { Icon } from "@/components/ui/Icons";
import { FilterStrip } from "./DeskParts";
import { DEFAULT_SORT, INITIAL_TABLE_INNER, tableColumns } from "./table";
import { WordTable, type RowHandlers } from "./WordTable";

export type PlaceholderScope = "all" | "inbox" | "folder" | "unknown";

/** `--loading-delay` (the `delayed-in` class). */
const LOADING_DELAY = 300;

// When the placeholder's skeleton rows started fading in (performance.now() time), so the desk
// that replaces it continues the same timer instead of blinking them out and in again.
let skeletonStartedAt: number | null = null;

/**
 * For the desk's first mount right after the placeholder: the style that keeps its skeleton rows
 * on the placeholder's timeline (already visible: no fade; still pending: the rest of the delay).
 * Undefined when there was no placeholder (a client navigation): the usual 300 ms delay applies.
 */
export function takeSkeletonHandoff(): CSSProperties | undefined {
  if (skeletonStartedAt === null) return undefined;
  const left = LOADING_DELAY - (performance.now() - skeletonStartedAt);
  skeletonStartedAt = null;
  return left <= 0 ? { animation: "none" } : { animationDelay: `${Math.round(left)}ms` };
}

const noop = () => {};

/**
 * First paint of a desktop library screen (≥ 768) before the client knows the layout: the exact
 * LibraryDesk chrome — title, subline and upkeep lines (reserved), the toolbar with search and the
 * filter strip, the table head — at their final positions, so the swap to the desk moves nothing
 * (MOTION-SPEC D4). Only the rows are reserved; skeleton rows show if it lasts 300 ms. Hidden on
 * phones.
 */
export function DeskPlaceholder({ title, scope = "all" }: { title: string; scope?: PlaceholderScope }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const handlers = useRef<RowHandlers>(null) as RefObject<RowHandlers>;

  useLayoutEffect(() => {
    // Hidden (phones): no animation runs, nothing to hand over.
    const animation = scrollRef.current?.querySelector("[data-table-skeleton]")?.getAnimations?.()[0];
    const elapsed = animation?.currentTime;
    if (elapsed != null) skeletonStartedAt = performance.now() - Number(elapsed);
  }, []);

  const columns = tableColumns({ inner: INITIAL_TABLE_INNER, layout: "expanded", coarse: false, themeColumn: scope === "all" });
  return (
    <main
      data-wide=""
      aria-busy="true"
      inert
      style={{ height: "calc(100dvh - var(--safe-top))" }}
      className="hidden min-h-0 w-full flex-none overflow-hidden md:flex"
    >
      <section aria-label={title} className="relative flex min-w-0 flex-1 flex-col min-[1600px]:max-w-[1148px]">
        <header className="shrink-0 px-6 pt-5">
          <div className="flex h-9 items-center gap-3">
            <h1 className="m-0 min-w-0 truncate font-serif text-[28px] leading-9 font-medium tracking-[-0.015em]">{title}</h1>
          </div>
          <p className="m-0 mt-1 flex min-h-5 items-center text-[13px] leading-5" />
          <div className="mt-1 flex h-4" />
          <div className="mt-3 flex min-h-9 flex-wrap items-center gap-x-6 gap-y-1 pointer-coarse:gap-x-5">
            <span className="inline-flex h-9 shrink-0 items-center gap-1 text-[14px] font-medium text-ink xl:hidden">
              Тема: {scope === "all" ? "все" : title}
              <Icon name="chevron" size={14} />
            </span>
            <span className="flex h-9 w-[240px] shrink-0 items-center gap-2 rounded-[4px] border border-boundary bg-surface pr-1.5 pl-2.5 text-[14px] text-muted pointer-coarse:w-[208px] xl:w-auto xl:max-w-[300px] xl:grow xl:basis-[220px] xl:pointer-coarse:w-auto">
              <Icon name="search" size={16} />
              Поиск по FR и RU
            </span>
            <FilterStrip status="all" onStatus={noop} slang={[]} onSlang={noop} cefr={[]} onCefr={noop} dueCount={0} difficultCount={0} newCount={0} sort={null} onOrder={noop} />
          </div>
        </header>
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <WordTable
            rows={[]}
            columns={columns}
            sort={DEFAULT_SORT}
            onSort={noop}
            cursor={null}
            selection={new Set()}
            coarse={false}
            fine
            label={title}
            loading
            handlers={handlers}
            onSelectAll={noop}
            onKeyDown={noop}
            onScroll={noop}
            gridRef={gridRef}
            scrollRef={scrollRef}
          />
        </div>
      </section>
      <aside className="hidden w-[400px] shrink-0 border-l border-rule min-[1100px]:flex min-[1200px]:max-[1439px]:w-[360px] min-[1600px]:flex-1" />
    </main>
  );
}
