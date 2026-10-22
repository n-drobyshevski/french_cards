"use client";

import { useCallback, useSyncExternalStore } from "react";
import { floatingBottom } from "@/components/ui/bottom-clearance";
import { CardGlyph } from "@/components/ui/AppMark";
import { IconButton } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { isIosSafari, isStandalone } from "./platform";

/** localStorage key holding when the hint was dismissed (ISO date). */
export const INSTALL_HINT_DISMISSED_KEY = "kartochki:install-hint-dismissed";

const listeners = new Set<() => void>();
/** Set when localStorage is unavailable, so a dismissal still holds until reload. */
let hiddenForSession = false;

function readDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) !== null;
  } catch {
    return false;
  }
}

function getSnapshot(): boolean {
  return !hiddenForSession && isIosSafari() && !isStandalone() && !readDismissed();
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === INSTALL_HINT_DISMISSED_KEY) onChange();
  };
  const display = typeof window.matchMedia === "function" ? window.matchMedia("(display-mode: standalone)") : null;
  window.addEventListener("storage", onStorage);
  display?.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
    display?.removeEventListener("change", onChange);
  };
}

/** Hides the hint for good on this device. */
export function dismissInstallHint(): void {
  try {
    localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, new Date().toISOString());
  } catch {
    // Private mode: hidden for this page view only.
    hiddenForSession = true;
  }
  for (const listener of listeners) listener();
}

/**
 * Whether the «На экран «Домой»» hint applies: iOS Safari, not launched from the home screen,
 * not dismissed before. Always false during SSR and hydration.
 */
export function useInstallHint(): { visible: boolean; dismiss: () => void } {
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const dismiss = useCallback(() => dismissInstallHint(), []);
  return { visible, dismiss };
}

/** iOS share glyph (square with an arrow up), drawn like the rest of the icon set. */
function ShareGlyph() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mx-0.5 inline-block -translate-y-px align-middle"
    >
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}

export interface InstallHintProps {
  /**
   * floating (default): fixed above the tab bar, like the snackbar (uses --shell-bottom from the app shell).
   * inline: a block in normal flow, e.g. inside Settings.
   */
  placement?: "floating" | "inline";
  className?: string;
}

/**
 * iOS Safari only: how to add Карточки to the home screen («Поделиться → На экран «Домой»»).
 * Dismissible; the dismissal is remembered in localStorage. Renders nothing elsewhere.
 */
export function InstallHint({ placement = "floating", className }: InstallHintProps) {
  const { visible, dismiss } = useInstallHint();
  if (!visible) return null;

  const card = (
    <section
      aria-labelledby="install-hint-title"
      className={cx(
        "flex items-start gap-3 rounded-card border border-rule bg-surface py-2 pr-1 pl-4",
        placement === "inline" && className,
      )}
    >
      <CardGlyph size="md" className="mt-3.5" />
      <div className="min-w-0 flex-1 py-2">
        <h2 id="install-hint-title" className="m-0 text-[15px] leading-5 font-medium text-ink">
          Установи на экран «Домой»
        </h2>
        <p className="mt-1 mb-0 text-[13px] leading-[18px] text-muted">
          Нажми
          <ShareGlyph />
          <span className="font-medium text-ink">Поделиться → На экран «Домой»</span>. Карточки будут открываться
          как приложение и работать без сети.
        </p>
      </div>
      <IconButton icon="close" label="Скрыть подсказку" iconSize={18} onClick={dismiss} className="text-muted" />
    </section>
  );

  if (placement === "inline") return card;

  return (
    <div
      className={cx(
        "pointer-events-none fixed inset-x-0 z-40 mx-auto w-full max-w-[440px] px-4",
        className,
      )}
      style={{ bottom: floatingBottom("calc(var(--shell-bottom, env(safe-area-inset-bottom)) + 8px)") }}
    >
      <div className="pointer-events-auto">{card}</div>
    </div>
  );
}
