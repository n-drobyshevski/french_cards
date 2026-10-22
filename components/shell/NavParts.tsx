"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useLinkStatus } from "next/link";
import { useSyncLine } from "@/components/settings/useSyncLine";
import { cx } from "@/components/ui/cx";
import { useLayoutClass } from "@/lib/use-media";
import { loadShellData, sidebarSyncLine, type ShellData, type SidebarSyncLine } from "./data";

/** Sidebar/rail data; not loaded on phones, where the nav column is not shown. */
export function useShellData(): ShellData | undefined {
  const layout = useLayoutClass();
  return useLiveQuery(() => (layout === "compact" ? undefined : loadShellData()), [layout]);
}

/**
 * Sidebar sync line (null when sync is off) and a sync that says «Синхронизация…» at once. Quiet
 * background cycles (useSyncLine), so the line does not flicker on every edit (D9). Mount only where
 * it is visible: it watches auth.
 */
export function useSidebarSyncLine(): { line: SidebarSyncLine | null; busy: boolean; sync: () => void } {
  const { auth, line, busy, sync } = useSyncLine();
  return { line: sidebarSyncLine(auth, line), busy, sync };
}

/** The 2px red bar on the nav column's left edge for the active item. `edge` = the column's padding. */
export function ActiveBar({ edge }: { edge: "sidebar" | "rail" }) {
  return (
    <span
      aria-hidden="true"
      className={edge === "sidebar" ? "absolute inset-y-0 -left-3 w-0.5 bg-red" : "absolute inset-y-0 -left-1 w-0.5 bg-red"}
    />
  );
}

/**
 * Navigation pending cue (D10): a 2px ink tick at the right end of the pressed row while its route
 * loads, shown only once the wait passes --link-pending-delay (100 ms), so a prefetched route never
 * paints it. Render inside the row's <Link> (useLinkStatus reads the nearest one); the row must be
 * `relative`. `edge` = how far the row's right end sits from the tick.
 */
export function PendingTick({ edge = "sidebar" }: { edge?: "sidebar" | "rail" }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      data-link-pending=""
      className={cx("link-pending pointer-events-none absolute inset-y-2 right-0 w-0.5 bg-ink", edge === "rail" && "inset-y-3")}
    />
  );
}

/**
 * The layer a drop lights (spotlight, D8): first child of a drop target that is `relative isolate`,
 * under its content. Its classes never change, so the fade survives the target's re-render.
 */
export function DropLight() {
  return <span data-drop-light="" aria-hidden="true" className="pointer-events-none absolute inset-0 -z-[1] rounded-[4px]" />;
}

/** Drop-target outline classes (DESKTOP-SPEC §3): dashed while dragging, 2px ink + white when over. */
export function dropClasses(dragging: boolean, over: boolean): string | false {
  if (over) return "bg-surface outline-2 outline-ink -outline-offset-2";
  if (dragging) return "outline-1 outline-dashed outline-muted -outline-offset-1";
  return false;
}
