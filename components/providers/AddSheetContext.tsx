"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { DraftPrefill } from "@/components/add/draft";

export interface AddSheetInitial {
  /** Prefill for the headword input (FR or RU text). */
  fr?: string;
  /** Opens straight into the filled form («Контекст»: «+ В карточки», an example, a synonym). */
  draft?: DraftPrefill;
}

export interface AddSheetApi {
  /** Opens the quick-add sheet, optionally prefilled. */
  open: (initial?: AddSheetInitial) => void;
  close: () => void;
  isOpen: boolean;
  /** What the current opening was asked to prefill. */
  initial: AddSheetInitial;
  /** Increments on every open(); use as a React key to start each opening with fresh state. */
  session: number;
  /** For <Sheet onOpenChange>. */
  setOpen: (open: boolean) => void;
}

const AddSheetContext = createContext<AddSheetApi | null>(null);

export function useAddSheet(): AddSheetApi {
  const api = useContext(AddSheetContext);
  if (!api) throw new Error("useAddSheet must be used inside <AppProviders>");
  return api;
}

export function AddSheetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initial, setInitial] = useState<AddSheetInitial>({});
  const [session, setSession] = useState(0);

  const open = useCallback((next?: AddSheetInitial) => {
    setInitial(next ?? {});
    setSession((s) => s + 1);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const setOpen = useCallback((value: boolean) => setIsOpen(value), []);

  const api = useMemo(
    () => ({ open, close, isOpen, initial, session, setOpen }),
    [open, close, isOpen, initial, session, setOpen],
  );
  return <AddSheetContext.Provider value={api}>{children}</AddSheetContext.Provider>;
}
