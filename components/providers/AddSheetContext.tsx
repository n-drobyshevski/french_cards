"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface AddSheetInitial {
  /** Prefill for the headword input (FR or RU text). */
  fr?: string;
}

export interface AddSheetActions {
  /** Opens the quick-add sheet, optionally prefilled. */
  open: (initial?: AddSheetInitial) => void;
  close: () => void;
  /** For <Sheet onOpenChange>. */
  setOpen: (open: boolean) => void;
}

export interface AddSheetState {
  isOpen: boolean;
  /** What the current opening was asked to prefill. */
  initial: AddSheetInitial;
  /** Increments on every open(); use as a React key to start each opening with fresh state. */
  session: number;
}

export type AddSheetApi = AddSheetActions & AddSheetState;

// Split so that callers which only open the sheet don't re-render when it opens or closes.
const ActionsContext = createContext<AddSheetActions | null>(null);
const StateContext = createContext<AddSheetState | null>(null);

/** open/close/setOpen. Stable for the app's lifetime, so it never re-renders its caller. */
export function useAddSheetActions(): AddSheetActions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error("useAddSheetActions must be used inside <AppProviders>");
  return actions;
}

/** Whether the sheet is open and what this opening asked for; re-renders on every open and close. */
export function useAddSheetState(): AddSheetState {
  const state = useContext(StateContext);
  if (!state) throw new Error("useAddSheetState must be used inside <AppProviders>");
  return state;
}

/** Actions and state together. A caller that only opens the sheet can use useAddSheetActions instead. */
export function useAddSheet(): AddSheetApi {
  const actions = useAddSheetActions();
  const state = useAddSheetState();
  return useMemo(() => ({ ...actions, ...state }), [actions, state]);
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

  const actions = useMemo(() => ({ open, close, setOpen }), [open, close, setOpen]);
  const state = useMemo(() => ({ isOpen, initial, session }), [isOpen, initial, session]);
  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  );
}
