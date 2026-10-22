"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useAuthUser } from "@/components/auth/session";
import { useClock } from "@/components/settings/useClock";
import { useSyncStatus } from "@/lib/sync";
import { useLayoutClass } from "@/lib/use-media";
import { loadShellData, sidebarSyncLine, type ShellData, type SidebarSyncLine } from "./data";

/** Sidebar/rail data; not loaded on phones, where the nav column is not shown. */
export function useShellData(): ShellData | undefined {
  const layout = useLayoutClass();
  return useLiveQuery(() => (layout === "compact" ? undefined : loadShellData()), [layout]);
}

/** Sidebar sync line (null when sync is off). Mount only where it is visible: it watches auth. */
export function useSidebarSyncLine(): SidebarSyncLine | null {
  const auth = useAuthUser();
  const sync = useSyncStatus();
  const nowMs = useClock();
  return sidebarSyncLine({ auth, sync, nowMs });
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

/** Drop-target outline classes (DESKTOP-SPEC §3): dashed while dragging, 2px ink + white when over. */
export function dropClasses(dragging: boolean, over: boolean): string | false {
  if (over) return "bg-surface outline-2 outline-ink -outline-offset-2";
  if (dragging) return "outline-1 outline-dashed outline-muted -outline-offset-1";
  return false;
}
