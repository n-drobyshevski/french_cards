"use client";

/* eslint-disable @next/next/no-img-element -- local object URLs of the picked screenshots; next/image does not apply. */
import { useState } from "react";
import { DialogChrome, Sheet } from "@/components/ui/Sheet";
import { cx } from "@/components/ui/cx";
import { deskButton, SHOT_PANE } from "./desk";
import { ScanLine } from "./ProcessingView";
import { fragmentsRu } from "./rows";

/** «Скриншот 1 из 1 · 2 фрагмента» */
export function shotLabel(index: number, count: number, tiles: number): string {
  const head = `Скриншот ${index + 1} из ${count}`;
  return index === 0 && tiles > 0 ? `${head} · ${fragmentsRu(tiles)}` : head;
}

export interface ShotPaneProps {
  /** Object URLs of the picked screenshots. */
  thumbs: readonly string[];
  tiles: number;
}

/**
 * Processing: the first screenshot cut by the column, a red scan line at the progress (travelling
 * top↔bottom while the first row is awaited), a «1/2» badge.
 */
export function ProcessingShotPane({
  thumbs,
  tiles,
  percent,
  travel = false,
  muted = false,
}: ShotPaneProps & { percent: number; travel?: boolean; muted?: boolean }) {
  const count = Math.max(1, thumbs.length);
  return (
    <aside aria-label="Скриншот" className={cx(SHOT_PANE, "flex min-h-0 shrink-0 flex-col border-r border-rule px-6 pt-6")}>
      <div className="flex h-8 shrink-0 items-center">
        <p className="m-0 text-[12px] leading-4 text-muted tabular-nums">{shotLabel(0, count, tiles)}</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col pt-2 pb-6">
        <div className="relative min-h-0 shrink overflow-hidden rounded-[6px] border border-rule bg-surface">
          {thumbs[0] ? <img src={thumbs[0]} alt="Скриншот" className="block h-auto w-full" /> : <div className="h-[480px]" />}
          <ScanLine percent={percent} travel={travel} veil={false} thick muted={muted} />
          {thumbs.length > 1 && (
            <span
              aria-hidden="true"
              className="absolute top-2 left-2 inline-flex h-[18px] items-center rounded-[3px] border border-ink bg-surface px-1 font-mono text-[11px] leading-none text-ink tabular-nums"
            >
              1/{thumbs.length}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * Review: every screenshot at the column width (the column scrolls), «Другой скриншот», and a
 * click on a screenshot opens it in a 720 dialog (full dialog width, never upscaled).
 */
export function ReviewShotPane({ thumbs, tiles, onPickOther }: ShotPaneProps & { onPickOther: () => void }) {
  const [zoom, setZoom] = useState<number | null>(null);
  const [lastZoom, setLastZoom] = useState(0);
  const shown = zoom ?? lastZoom;

  return (
    <aside aria-label="Скриншот" className={cx(SHOT_PANE, "flex min-h-0 shrink-0 flex-col border-r border-rule")}>
      {/* Label and «Другой скриншот» share a row from 1200; the narrower columns stack them. */}
      <div className="flex shrink-0 flex-col items-start px-6 pt-6 min-[1200px]:h-8 min-[1200px]:flex-row min-[1200px]:items-center min-[1200px]:justify-between min-[1200px]:gap-2 min-[1200px]:[box-sizing:content-box]">
        <p className="m-0 flex h-8 min-w-0 items-center text-[12px] leading-4 text-muted tabular-nums">{shotLabel(0, thumbs.length, tiles)}</p>
        <button type="button" onClick={onPickOther} className={deskButton("tertiary", "-ml-2 min-[1200px]:-mr-2 min-[1200px]:ml-0")}>
          Другой скриншот
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 pt-2 pb-6">
        {thumbs.map((src, i) => (
          <div key={src} className="flex flex-col gap-2">
            {i > 0 && <p className="m-0 text-[12px] leading-4 text-muted tabular-nums">{shotLabel(i, thumbs.length, tiles)}</p>}
            <button
              type="button"
              aria-label={`${shotLabel(i, thumbs.length, 0)}, открыть в полном размере`}
              aria-haspopup="dialog"
              onClick={() => {
                setLastZoom(i);
                setZoom(i);
              }}
              className="block w-full shrink-0 cursor-zoom-in overflow-hidden rounded-[6px] border border-rule bg-surface p-0"
            >
              <img src={src} alt="" className="block h-auto w-full" />
            </button>
          </div>
        ))}
      </div>

      <Sheet
        open={zoom !== null}
        onOpenChange={(open) => {
          if (!open) setZoom(null);
        }}
        dialogWidth={720}
        height="full"
        header={<DialogChrome label={thumbs.length > 1 ? `${shown + 1} из ${thumbs.length}` : undefined} title="Скриншот" />}
      >
        <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
          {thumbs[shown] && <img src={thumbs[shown]} alt={shotLabel(shown, thumbs.length, 0)} className="mx-auto block h-auto max-w-full" />}
        </div>
      </Sheet>
    </aside>
  );
}
